"""Stage a source-only release and install it before the next server launch."""
import ast
import importlib.util
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory


REPOSITORY = "https://github.com/lukecoulon2-stack/npv2.git"
WORK_DIRECTORY = ".naoning-update"
VERSION_FILE = Path("version.json")
VERSION = re.compile(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
REQUIRED = {
    Path("start.py"), Path("requirements.txt"), Path("planning/web.py"),
    Path("planning/templates/index.html"), Path("planning/static/app.js"),
}
SOURCE_TYPES = {
    "static": {".css", ".js", ".png", ".webp", ".ico", ".svg", ".woff2", ".webmanifest"},
    "templates": {".html"},
}
NAV_UNIT_SOURCES = {Path("start_nav_unit.py")} | {
    Path("nav_unit") / name for name in (
        "browser.py", "browser.html", "browser.js", "browser.css", "config.json",
        "requirements.txt", "README.md", "index.html", "settings.html", "demo.js", "demo.css",
    )
}


def version_number(value):
    match = VERSION.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError("Le numéro de version doit suivre le format v0.2.12.")
    return tuple(map(int, match.groups()))


def read_version(directory, *, optional=False):
    path = directory / VERSION_FILE
    try:
        if path.is_symlink():
            raise ValueError("Le fichier doit être un fichier ordinaire.")
        try:
            journal = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            if optional:
                return None
            raise ValueError("Le fichier est introuvable.") from None
        if not isinstance(journal, dict):
            raise ValueError("Le journal doit être un objet JSON.")
        current = version_number(journal.get("version"))
        releases = journal.get("releases")
        if not isinstance(releases, list) or not releases:
            raise ValueError("Le journal des versions est vide.")
        versions = []
        for release in releases:
            if not isinstance(release, dict):
                raise ValueError("Une entrée du journal est invalide.")
            versions.append(version_number(release.get("version")))
            notes = release.get("news")
            if not isinstance(notes, list) or not notes or any(not isinstance(note, str) or not note.strip() for note in notes):
                raise ValueError("Chaque version doit contenir au moins une note de mise à jour.")
        if versions[0] != current or versions != sorted(set(versions), reverse=True):
            raise ValueError("Les versions doivent être uniques et classées de la plus récente à la plus ancienne.")
        pending = journal.get("pending", [])
        if not isinstance(pending, list) or any(not isinstance(note, str) or not note.strip() for note in pending):
            raise ValueError("Les notes en préparation doivent être une liste de textes.")
        return {
            "version": journal["version"],
            "releases": [{"version": release["version"], "news": release["news"]} for release in releases],
            "pending": pending,
        }
    except (OSError, ValueError) as error:
        raise ValueError(f"version.json · {error}") from error


def source_paths(directory):
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory)
        parts = relative.parts
        allowed = relative in REQUIRED or relative in {Path("README.md"), VERSION_FILE} or relative in NAV_UNIT_SOURCES or (
            parts[0] == "planning" and (
                len(parts) == 2 and path.suffix == ".py"
                or len(parts) >= 3 and path.suffix in SOURCE_TYPES.get(parts[1], set())
            )
        )
        if allowed and path.is_file():
            if any((directory / Path(*parts[:i])).is_symlink() for i in range(1, len(parts) + 1)):
                raise ValueError(f"Lien symbolique dans les sources GitHub ({relative}).")
            yield relative


def validate_sources(directory):
    paths = list(source_paths(directory))
    if not REQUIRED.issubset(paths):
        raise ValueError("GitHub ne contient pas encore les sources complètes de Planneli.")
    try:
        for relative in paths:
            if relative.suffix == ".py":
                ast.parse((directory / relative).read_bytes(), filename=str(relative))
    except SyntaxError as error:
        raise ValueError(f"Source Python invalide dans GitHub ({error.filename}).") from error
    return paths


def pending_revision(project):
    marker = project / WORK_DIRECTORY / "pending" / "revision"
    return marker.read_text(encoding="ascii").strip() if marker.is_file() else None


def pending_journal(project):
    return read_version(project / WORK_DIRECTORY / "pending" / "sources", optional=True)


def fetch_release(project):
    directory = project / WORK_DIRECTORY
    directory.mkdir(mode=0o700, exist_ok=True)
    if pending_revision(project):
        raise ValueError("Une mise à jour est déjà prête. Redémarrez Planneli pour l’appliquer.")
    current = read_version(project, optional=True)
    environment = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    def git(*args):
        return subprocess.run(
            ["git", *args], cwd=directory, env=environment, check=True,
            capture_output=True, text=True, timeout=50,
        ).stdout.strip()

    with TemporaryDirectory(prefix="fetch-", dir=directory) as temporary:
        checkout = Path(temporary) / "checkout"
        release = Path(temporary) / "release"
        try:
            git("clone", "--quiet", "--depth", "1", "--no-tags", "--", REPOSITORY, str(checkout))
            remote = read_version(checkout)
            if current and version_number(remote["version"]) <= version_number(current["version"]):
                return None
            paths = validate_sources(checkout)
            revision = git("-C", str(checkout), "rev-parse", "HEAD")
        except FileNotFoundError as error:
            raise ValueError("Git doit être installé sur le serveur.") from error
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise ValueError("Impossible de récupérer le dépôt GitHub. Vérifiez son accès et sa branche principale.") from error

        for relative in paths:
            target = release / "sources" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(checkout / relative, target)
        (release / "revision").write_text(revision, encoding="ascii")
        release.rename(directory / "pending")
        return revision


def atomic_copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=target.parent, delete=False) as temporary:
        path = Path(temporary.name)
    try:
        shutil.copy2(source, path)
        os.replace(path, target)
    finally:
        path.unlink(missing_ok=True)


def remove_pending(workspace, pending):
    with TemporaryDirectory(prefix="applied-", dir=workspace) as temporary:
        pending.rename(Path(temporary) / "release")


def apply_pending(project):
    revision = pending_revision(project)
    if not revision:
        return None
    workspace = project / WORK_DIRECTORY
    pending = workspace / "pending"
    sources = pending / "sources"
    paths = validate_sources(sources)
    prepared = pending / "prepared"
    arriving = pending_journal(project)
    if arriving and not prepared.exists():
        current = read_version(project, optional=True)
        if current and version_number(arriving["version"]) <= version_number(current["version"]):
            remove_pending(workspace, pending)
            return None
    originals = pending / "originals"
    for relative in paths:
        target = project / relative
        if any((project / Path(*relative.parts[:i])).is_symlink() for i in range(1, len(relative.parts) + 1)):
            raise ValueError(f"Lien symbolique dans les sources locales ({relative}).")
        if target.exists() and not target.is_file():
            raise ValueError(f"Impossible de remplacer le chemin {relative}.")
    if not prepared.exists():
        for relative in paths:
            target = project / relative
            if target.is_file():
                atomic_copy(target, originals / relative)
        prepared.touch()
    try:
        # Install the version after the sources and the bootstrap last for interrupted upgrades.
        last_files = {VERSION_FILE: 1, Path("start.py"): 2}
        for relative in sorted(paths, key=lambda item: last_files.get(item, 0)):
            target = project / relative
            atomic_copy(sources / relative, target)
            if target.suffix == ".py":
                Path(importlib.util.cache_from_source(str(target))).unlink(missing_ok=True)
        atomic_copy(pending / "revision", workspace / "installed")
    except OSError:
        for relative in paths:
            original = originals / relative
            if original.is_file():
                atomic_copy(original, project / relative)
            else:
                (project / relative).unlink(missing_ok=True)
        raise
    remove_pending(workspace, pending)
    return revision
