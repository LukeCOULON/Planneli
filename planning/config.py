from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit


PROJECT = Path(__file__).resolve().parent.parent
CONFIG_FILE = PROJECT / "planning_config_starter.json"
ROUTER_CONFIG = PROJECT / "rout.json"
LOCAL_DATA_DIR = ".planneli-data"
DEFAULT_ZONE = "Europe/Paris"
SITE_NAME = "Planneli"


def local_invitation_host(host):
    name = host.rstrip(".").lower()
    if name == "localhost" or name.endswith(".localhost"):
        return True
    try:
        address = ip_address(name)
    except ValueError:
        return False
    address = getattr(address, "ipv4_mapped", None) or address
    return address.is_loopback or address.is_unspecified


def read_router_origin(path):
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError, ValueError) as error:
        raise ValueError("Vérifiez que rout.json est lisible et contient du JSON valide.") from error

    if not isinstance(config, dict):
        raise ValueError("Renseignez les champs « adresse » et « port » dans rout.json.")
    address, port = config.get("adresse"), config.get("port")
    if address == "" and port is None:
        return None
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Indiquez le port d’accès externe (1 à 65535) dans rout.json.")

    try:
        address = address.strip() if isinstance(address, str) else ""
        parts = urlsplit(address)
        host = parts.hostname or ""
        authority = f"[{host}]" if ":" in host else host
        if (
            parts.scheme not in {"http", "https"} or not host or parts.netloc.lower() != authority
            or any(character.isspace() for character in address) or "%" in host
            or (":" not in host and not re.fullmatch(r"[a-z0-9._-]+", host))
            or parts.path not in {"", "/"} or parts.query or parts.fragment or local_invitation_host(host)
        ):
            raise ValueError
    except ValueError as error:
        raise ValueError("Indiquez une adresse réseau ou publique en http:// ou https://, sans port ni chemin, dans rout.json.") from error

    if (parts.scheme, port) in {("http", 80), ("https", 443)}:
        return f"{parts.scheme}://{authority}"
    return f"{parts.scheme}://{authority}:{port}"


def default_data_dir():
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "planning-familial"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "planning-familial"
    xdg = Path(os.environ.get("XDG_DATA_HOME", ""))
    base = xdg if xdg.is_absolute() else Path.home() / ".local" / "share"
    return base / "planning-familial"


@dataclass(frozen=True)
class LaunchConfig:
    mode: str
    host: str
    port: int
    data_dir: Path | None


def read_config(path):
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{path} — JSON invalide, ligne {error.lineno}, colonne {error.colno}.") from error
    except (OSError, UnicodeError) as error:
        raise ValueError(f"{path} — lecture impossible ({error}).") from error

    def invalid(key, message):
        raise ValueError(f"{path} — {key} : {message}")

    if not isinstance(raw, dict):
        invalid("configuration", "un objet JSON est attendu.")
    allowed = {"mode", "host", "port", "data_dir"}
    for key in sorted(allowed - raw.keys()):
        invalid(key, "ce réglage est obligatoire.")
    for key in sorted(raw.keys() - allowed):
        invalid(key, "réglage inconnu.")

    mode, host, port, directory = (raw[key] for key in ("mode", "host", "port", "data_dir"))
    if mode not in ("normal", "bench"):
        invalid("mode", 'choisir "normal" ou "bench".')
    if not isinstance(host, str) or not re.fullmatch(r"[A-Za-z0-9.:%_-]{1,253}", host):
        invalid("host", "indiquer une adresse IP ou un nom d’hôte.")
    if type(port) is not int or not 1 <= port <= 65535:
        invalid("port", "indiquer un entier entre 1 et 65535.")
    if directory not in (None, LOCAL_DATA_DIR) and (
        not isinstance(directory, str) or "\x00" in directory or not Path(directory).is_absolute()
    ):
        invalid("data_dir", f'indiquer un chemin absolu, null ou "{LOCAL_DATA_DIR}".')

    data_dir = None
    if mode == "normal":
        try:
            if directory == LOCAL_DATA_DIR:
                data_dir = (PROJECT / LOCAL_DATA_DIR).resolve()
            else:
                data_dir = (Path(directory) if directory is not None else default_data_dir()).resolve()
        except (OSError, RuntimeError) as error:
            invalid("data_dir", str(error))
        if directory == LOCAL_DATA_DIR and data_dir != PROJECT / LOCAL_DATA_DIR:
            invalid("data_dir", "le dossier de données local doit se trouver à côté du lanceur.")
        if directory != LOCAL_DATA_DIR and data_dir.is_relative_to(PROJECT):
            invalid("data_dir", "choisir un dossier en dehors du projet.")
    return LaunchConfig(mode, host, port, data_dir)
