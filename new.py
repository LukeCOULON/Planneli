"""Prépare une mise à jour dans maj/ ou une copie complète dans clone/."""
import argparse
import json
import shutil
import sys
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory, mkdtemp


ROOT = Path(__file__).resolve().parent
DESTINATION = ROOT / "maj"
BUILD_EXTRAS = tuple(map(Path, (
    ".gitignore", "cours/model.txt", "deploy.py", "new.json", "new.py", "todo.md",
)))


def listed_files():
    manifest = json.loads((ROOT / "new.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), list):
        raise ValueError("new.json doit contenir une liste « files ».")
    paths = []
    for name in manifest["files"]:
        if not isinstance(name, str) or "\\" in name or ":" in name:
            raise ValueError(f"Chemin de fichier invalide : {name!r}")
        path = PurePosixPath(name)
        if not path.parts or path.is_absolute() or ".." in path.parts or path.parts[0].casefold() == "maj":
            raise ValueError(f"Chemin de fichier invalide : {name!r}")
        source = ROOT.joinpath(*path.parts)
        if any(part.is_symlink() for part in (source, *source.parents) if part != ROOT and ROOT in part.parents):
            raise ValueError(f"Lien symbolique refusé : {path}")
        if not source.is_file():
            raise ValueError(f"Fichier introuvable : {path}")
        paths.append(path)
    if len(set(paths)) != len(paths):
        raise ValueError("new.json contient un fichier en double.")
    return paths


def build_files():
    from planning.updates import validate_sources

    paths = set(validate_sources(ROOT))
    paths.update(relative for relative in BUILD_EXTRAS if (ROOT / relative).is_file())
    for directory in ("tests", "web_deploy"):
        paths.update(path.relative_to(ROOT) for path in (ROOT / directory).rglob("*.py") if path.is_file())
    for path in paths:
        if any((ROOT / Path(*path.parts[:index])).is_symlink() for index in range(1, len(path.parts) + 1)):
            raise ValueError(f"Lien symbolique refusé : {path}")
    return sorted(paths)


def write_build_config(package):
    from planning.config import LOCAL_DATA_DIR

    config = {"mode": "normal", "host": "localhost", "port": 2229, "data_dir": LOCAL_DATA_DIR}
    (package / "planning_config_starter.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def publish(package, destination, files):
    previous = None
    if destination.exists():
        existing = {item.relative_to(destination) for item in destination.rglob("*")}
        expected = {item.relative_to(package) for item in package.rglob("*")}
        if existing == expected and all(
            not (destination / path).is_symlink()
            and (destination / path).is_file()
            and (destination / path).read_bytes() == (package / path).read_bytes()
            for path in files
        ):
            print(f"{destination.name}/ contient déjà les {len(files)} fichiers.")
            return
        prefix = "maj-precedente-" if destination.name == "maj" else "clone-precedent-"
        previous = Path(mkdtemp(prefix=prefix, dir=ROOT))
        previous.rmdir()
        destination.rename(previous)
    try:
        package.rename(destination)
    except OSError:
        if previous is not None:
            previous.rename(destination)
        raise
    print(f"{len(files)} fichiers copiés dans {destination}.")
    if previous is not None:
        print(f"Ancien dossier conservé dans {previous}.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="Créer une copie complète et vide dans clone/.")
    args = parser.parse_args(argv)
    destination = ROOT / "clone" if args.build else DESTINATION
    try:
        if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
            raise ValueError(f"Le chemin {destination.name}/ est déjà occupé par un fichier ou un lien.")
        paths = build_files() if args.build else listed_files()
        with TemporaryDirectory(prefix=f".{destination.name}-", dir=ROOT) as staging:
            package = Path(staging) / destination.name
            package.mkdir()
            for relative in paths:
                target = package / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, target)
            if args.build:
                write_build_config(package)
                paths.append(Path("planning_config_starter.json"))
            publish(package, destination, paths)
        return 0
    except (OSError, ValueError) as error:
        print(f"Mise à jour · {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
