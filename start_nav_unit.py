import os
import sys
import subprocess
import pathlib
import venv
import hashlib
import argparse

ROOT = pathlib.Path(__file__).resolve().parent / "nav_unit"
ENV = ROOT / '.venv'
PYTHON = ENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
MARKER = ENV / 'nav-install.sha256'
REQUIREMENTS = ROOT / 'requirements.txt'


def run(*args):
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent-port", type=int)
    parser.add_argument("--listen-port", type=int)
    parser.add_argument("--ready-file", type=pathlib.Path)
    args = parser.parse_args()
    if any(value is not None for value in (args.parent_port, args.listen_port, args.ready_file)) and (
        not 1 <= (args.parent_port or 0) <= 65535 or not 1024 <= (args.listen_port or 0) <= 65535 or args.ready_file is None
    ):
        parser.error("Le mode intégré requiert les deux ports et le fichier de démarrage.")
    os.chdir(ROOT)
    os.environ['PLAYWRIGHT_BROWSERS_PATH'] = str(ROOT / '.chromium')
    if not PYTHON.is_file():
        print('[1/4] Création de l’environnement virtuel...', flush=True)
        venv.EnvBuilder(with_pip=True).create(ENV)
    digest = hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()
    installed = subprocess.run([str(PYTHON), '-c', 'import playwright'], capture_output=True).returncode == 0
    if not installed or not MARKER.exists() or MARKER.read_text().strip() != digest:
        print('[2/4] Installation des dépendances...', flush=True)
        run(PYTHON, '-m', 'pip', 'install', '-r', REQUIREMENTS)
        MARKER.write_text(digest)
    else:
        print('[2/4] Dépendances déjà installées.', flush=True)
    print('[3/4] Vérification de Chromium...', flush=True)
    run(PYTHON, '-m', 'playwright', 'install', 'chromium')
    print('[4/4] Test du moteur et démarrage...', flush=True)
    if args.parent_port is not None:
        os.environ["NAV_UNIT_PARENT_PORT"] = str(args.parent_port)
        os.environ["NAV_UNIT_LISTEN_PORT"] = str(args.listen_port)
        os.environ["NAV_UNIT_READY_FILE"] = str(args.ready_file)
    os.execv(str(PYTHON), [str(PYTHON), '-c', 'from browser import main; main()'])


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nNav Unit arrêté.')
    except (OSError, subprocess.CalledProcessError, RuntimeError, ValueError) as exc:
        print(f'\nÉchec du démarrage : {exc}', file=sys.stderr)
        print('Vérifiez Python, la connexion Internet et les bibliothèques système. Sous Linux, consultez les exigences Playwright de votre distribution. Le sandbox reste activé.', file=sys.stderr)
        sys.exit(1)
