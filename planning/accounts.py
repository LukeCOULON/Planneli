import hashlib
import json
import re
import secrets
import time
import unicodedata
from collections import deque
from contextlib import contextmanager
from threading import Lock
from urllib.parse import urlsplit

from flask import Blueprint, Response, g, make_response, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .config import SITE_NAME, local_invitation_host, read_router_origin
from .database import WORKSPACE_TABLES, transaction
from .home_apps import home_configuration, home_preferences
from .qrnativegen import QRCode
from .rules import InputError, text_value
from .visits import record_visit, set_device_cookie


LOGIN_COOKIE = "naoning_account"
MAINTENANCE_COOKIE = "naoning_maintenance"
LOGIN_SECONDS = 30 * 86400
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
ATTEMPT_WINDOW = 15 * 60


class AccountChanged(InputError):
    pass


def username_key(username):
    return unicodedata.normalize("NFC", username.strip()).casefold()


def credentials(data):
    username = data.get("username")
    username = unicodedata.normalize("NFC", username.strip()) if isinstance(username, str) else ""
    if not 3 <= len(username) <= 40 or not all(ch.isalnum() or ch in "._-" for ch in username):
        raise InputError("Utilisez un nom de 3 à 40 caractères parmi les lettres, les chiffres et . _ -")
    password = data.get("password")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise InputError("Le mot de passe doit contenir entre 8 et 128 caractères.")
    try:
        password.encode("utf-8")
    except UnicodeEncodeError:
        raise InputError("Le mot de passe contient un caractère invalide.") from None
    return username, password


def login_digest():
    token = request.cookies.get(LOGIN_COOKIE, "")
    if re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return hashlib.sha256(token.encode("ascii")).hexdigest()
    return None


def find_account(connection, digest):
    return connection.execute(
        """SELECT accounts.id, accounts.username, accounts.own_workspace, accounts.joined_workspace, accounts.site_name,
                  accounts.read_only, accounts.home_preferences, accounts.onboarding_pending, workspaces.id AS workspace_id,
                  workspaces.share_code, workspaces.read_only_code,
                  owners.username AS owner
           FROM account_logins JOIN accounts ON accounts.id = account_id
           JOIN workspaces ON workspaces.id = COALESCE(accounts.joined_workspace, accounts.own_workspace)
           LEFT JOIN accounts AS owners ON owners.own_workspace = workspaces.id
           WHERE token_hash = ? AND expires_at > ?""",
        (digest, int(time.time())),
    ).fetchone()


def current_account(database):
    digest = login_digest()
    if digest is not None:
        with transaction(database) as connection:
            return find_account(connection, digest)
    return None


def account_context(account):
    context = f"{account['id']}:{account['workspace_id']}"
    return f"{context}:read-only" if account["read_only"] else context


def has_session(account):
    return account["share_code"] is not None


def connection_code(raw):
    code = raw.strip().upper() if isinstance(raw, str) else ""
    if len(code) != 8 or any(ch not in CODE_ALPHABET for ch in code):
        raise InputError("Saisissez le code de connexion à 8 caractères.")
    return code


def find_invitation(connection, code):
    workspace = connection.execute(
        """SELECT id, CASE WHEN share_code = ? THEN 0 ELSE 1 END AS read_only
           FROM workspaces WHERE share_code = ? OR read_only_code = ?""",
        (code, code, code),
    ).fetchone()
    if workspace is None:
        raise InputError("Ce code ne correspond à aucune session active.", 404)
    return workspace


def new_connection_code(connection):
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if not connection.execute(
            "SELECT 1 FROM workspaces WHERE share_code = ? OR read_only_code = ?", (code, code),
        ).fetchone():
            return code


@contextmanager
def account_transaction(database, *, write=False, course_files=False):
    with transaction(database, write=write, course_files=course_files) as connection:
        account = find_account(connection, login_digest())
        if account is None:
            raise AccountChanged("Connectez-vous à votre compte Planneli.", 401)
        if account_context(account) != account_context(g.account):
            raise AccountChanged("Votre compte ou votre session a changé.", 409)
        g.account = account
        yield connection


def account_info(account):
    own_workspace = account["workspace_id"] == account["own_workspace"]
    return {
        "username": account["username"],
        "owner": account["owner"],
        "personal": own_workspace,
        "code": account["share_code"] if own_workspace else None,
        "read_only_code": account["read_only_code"] if own_workspace else None,
        "read_only": bool(account["read_only"]),
        "session_active": has_session(account),
        "site_name": account["site_name"] or SITE_NAME,
    }


def issue_login(connection, account_id):
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode("ascii")).hexdigest()
    connection.execute("DELETE FROM account_logins WHERE expires_at <= ? OR token_hash = ?", (now, login_digest()))
    connection.execute("INSERT INTO account_logins VALUES (?, ?, ?)", (digest, account_id, now + LOGIN_SECONDS))
    response = make_response("", 204)
    response.set_cookie(
        LOGIN_COOKIE, token, max_age=LOGIN_SECONDS, httponly=True, samesite="Lax", secure=request.is_secure,
    )
    response.delete_cookie(MAINTENANCE_COOKIE)
    device, _ = record_visit(connection, account_id)
    set_device_cookie(response, device)
    return response


def clear_login(response):
    response.delete_cookie(LOGIN_COOKIE, httponly=True, samesite="Lax", secure=request.is_secure)
    response.delete_cookie(MAINTENANCE_COOKIE)
    return response


def account_routes(database, json_input, router_config):
    blueprint = Blueprint("accounts", __name__, url_prefix="/api/account")
    router_origin, router_error = None, None
    try:
        router_origin = read_router_origin(router_config)
    except ValueError as error:
        router_error = str(error)
    dummy_hash = generate_password_hash(secrets.token_urlsafe(32))
    attempts = {}
    attempt_lock = Lock()

    def limit_attempts(action, limit):
        now = time.monotonic()
        key = (action, request.remote_addr)
        with attempt_lock:
            for address, history in list(attempts.items()):
                while history and history[0] <= now - ATTEMPT_WINDOW:
                    history.popleft()
                if not history:
                    del attempts[address]
            history = attempts.setdefault(key, deque())
            if len(history) >= limit:
                raise InputError("Trop de tentatives. Réessayez dans quelques minutes.", 429)
            history.append(now)

    @blueprint.post("/register")
    def register():
        limit_attempts("register", 20)
        data = json_input()
        username, password = credentials(data)
        code = connection_code(data["code"]) if "code" in data else None
        key = username_key(username)
        password_hash = generate_password_hash(password)
        with transaction(database, write=True) as connection:
            if connection.execute("SELECT 1 FROM accounts WHERE username_key = ?", (key,)).fetchone():
                raise InputError("Ce nom d’utilisateur est déjà pris.", 409)
            invitation = find_invitation(connection, code) if code is not None else None
            # Workspaces are retained after account deletion, so new accounts never reuse an ID.
            account = connection.execute(
                """INSERT INTO workspaces(id) VALUES ((
                       SELECT max((SELECT max(id) FROM workspaces), COALESCE((SELECT max(id) FROM accounts), 0)) + 1
                   ))""",
            ).lastrowid
            connection.execute(
                """INSERT INTO accounts(id, username, username_key, password_hash, own_workspace, joined_workspace, read_only,
                   onboarding_pending) VALUES (?, ?, ?, ?, ?, ?, ?, 1)""",
                (account, username, key, password_hash, account, invitation["id"] if invitation else None,
                 invitation["read_only"] if invitation else 0),
            )
            response = issue_login(connection, account)
        g.activity_user_id = account
        return response

    @blueprint.post("/login")
    def login():
        limit_attempts("login", 20)
        username, password = credentials(json_input())
        with transaction(database) as connection:
            account = connection.execute(
                "SELECT id, password_hash FROM accounts WHERE username_key = ?", (username_key(username),),
            ).fetchone()
        if not check_password_hash(account["password_hash"] if account else dummy_hash, password) or account is None:
            raise InputError("Nom d’utilisateur ou mot de passe incorrect.", 401)
        with transaction(database, write=True) as connection:
            if connection.execute("SELECT 1 FROM accounts WHERE id = ?", (account["id"],)).fetchone() is None:
                raise InputError("Nom d’utilisateur ou mot de passe incorrect.", 401)
            response = issue_login(connection, account["id"])
        g.activity_user_id = account["id"]
        return response

    @blueprint.post("/logout")
    def logout():
        with transaction(database, write=True) as connection:
            connection.execute("DELETE FROM account_logins WHERE token_hash = ?", (login_digest(),))
        return clear_login(make_response("", 204))

    @blueprint.post("/share")
    def share():
        with account_transaction(database, write=True) as connection:
            if g.account["joined_workspace"] is not None:
                raise InputError("Quittez d’abord la session rejointe.", 409)
            if g.account["share_code"] is None:
                code = new_connection_code(connection)
                connection.execute("UPDATE workspaces SET share_code = ? WHERE id = ?", (code, g.workspace))
        return "", 204

    @blueprint.post("/read-only-invitation")
    def create_read_only_invitation():
        with account_transaction(database, write=True) as connection:
            if g.account["joined_workspace"] is not None or not has_session(g.account):
                raise InputError("Seul le titulaire de la session peut créer cette invitation.", 403)
            if g.account["read_only_code"] is None:
                code = new_connection_code(connection)
                connection.execute("UPDATE workspaces SET read_only_code = ? WHERE id = ?", (code, g.workspace))
        return "", 204

    @blueprint.get("/invitation")
    @blueprint.get("/invitation-qr.png", defaults={"as_png": True})
    def invitation_link(as_png=False):
        with account_transaction(database):
            if not has_session(g.account) or g.account["joined_workspace"] is not None:
                raise InputError("Le QR code est réservé au titulaire d’une session active.", 403)
            code = request.args.get("code")
            if not code or code not in (g.account["share_code"], g.account["read_only_code"]):
                raise InputError("Votre code de session a changé. Actualisez la page.", 409)
        if router_error:
            raise InputError(router_error, 503)
        if router_origin:
            target = router_origin + url_for("invitation", code=code)
        elif local_invitation_host(urlsplit(request.host_url).hostname or ""):
            raise InputError("Renseignez l’adresse et le port d’accès externe dans rout.json, puis relancez Planneli.", 503)
        else:
            target = url_for("invitation", code=code, _external=True)
        if not as_png:
            return {"url": target}
        try:
            png = QRCode(target).png_bytes()
        except ValueError:
            raise InputError("L’adresse du site est trop longue pour le QR code.", 422) from None
        return Response(png, mimetype="image/png")

    @blueprint.put("/site-name")
    def rename_site():
        name = text_value(json_input(), "name", "Nom affiché", length=40)
        if any(unicodedata.category(character) in {"Cc", "Cs"} for character in name):
            raise InputError("Saisissez le nom affiché sur une seule ligne.")
        with account_transaction(database, write=True) as connection:
            if not has_session(g.account):
                raise InputError("Créez ou rejoignez une session pour accéder aux réglages.", 403)
            connection.execute("UPDATE accounts SET site_name = ? WHERE id = ?", (name, g.account["id"]))
        return "", 204

    @blueprint.put("/home-preferences")
    def save_home_preferences():
        preferences = home_preferences(json_input())
        with account_transaction(database, write=True) as connection:
            if not has_session(g.account):
                raise InputError("Créez ou rejoignez une session pour personnaliser l’accueil.", 403)
            preferences.setdefault("agenda_view", home_configuration(g.account["home_preferences"])["agenda_view"])
            connection.execute(
                "UPDATE accounts SET home_preferences = ?, onboarding_pending = 0 WHERE id = ?",
                (json.dumps(preferences), g.account["id"]),
            )
        return "", 204

    @blueprint.post("/join")
    def join():
        limit_attempts("join", 20)
        code = connection_code(json_input().get("code"))
        with account_transaction(database, write=True) as connection:
            if has_session(g.account):
                active_code = g.account["read_only_code"] if g.account["read_only"] else g.account["share_code"]
                if g.account["joined_workspace"] is not None and active_code == code:
                    return "", 204
                raise InputError("Votre compte est déjà dans une session.", 409)
            invitation = find_invitation(connection, code)
            connection.execute(
                "UPDATE accounts SET joined_workspace = ?, read_only = ? WHERE id = ?",
                (invitation["id"], invitation["read_only"], g.account["id"]),
            )
        return "", 204

    @blueprint.post("/leave")
    def leave():
        with account_transaction(database, write=True) as connection:
            if g.account["joined_workspace"] is None:
                raise InputError("Seuls les invités peuvent quitter une session.", 409)
            connection.execute("UPDATE accounts SET joined_workspace = NULL, read_only = 0 WHERE id = ?", (g.account["id"],))
        return "", 204

    return blueprint


def claim_existing(database, username):
    with transaction(database, write=True) as connection:
        account = connection.execute(
            """SELECT own_workspace, workspaces.share_code FROM accounts
               JOIN workspaces ON workspaces.id = own_workspace WHERE username_key = ?""",
            (username_key(username),),
        ).fetchone()
        if account is None:
            raise ValueError("Créez d’abord le compte qui doit récupérer les anciennes données.")
        workspace = account["own_workspace"]
        if account["share_code"] or any(connection.execute(
            f"SELECT 1 FROM {table} WHERE workspace_id = ? LIMIT 1", (workspace,),
        ).fetchone() for table in WORKSPACE_TABLES):
            raise ValueError("Choisissez un compte dont l’espace personnel est vide et privé.")
        moved = sum(connection.execute(
            f"UPDATE {table} SET workspace_id = ? WHERE workspace_id = 0", (workspace,),
        ).rowcount for table in WORKSPACE_TABLES)
        if moved == 0:
            raise ValueError("Aucune ancienne donnée à rattacher.")
