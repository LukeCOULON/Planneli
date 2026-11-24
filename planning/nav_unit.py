"""Run the local Nav Unit service alongside Planneli."""
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from urllib.parse import urlsplit

from flask import request

from .rules import InputError


LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}


def local_browser_port():
    try:
        address = urlsplit(request.host_url)
        if request.remote_addr in LOCAL_HOSTS and address.hostname in LOCAL_HOSTS and address.scheme == "http":
            return address.port or 80
    except ValueError:
        pass
    return None


class NavUnit:
    def __init__(self, project):
        self.project = project
        self.worker = None
        self.parent_port = None
        self.directory = None
        self.lock = Lock()
        self.origin = None
        try:
            config = json.loads((project / "nav_unit/config.json").read_text(encoding="utf-8"))
            port = config.get("port") if isinstance(config, dict) else None
            if type(port) is int and 1024 <= port <= 65535 and (project / "start_nav_unit.py").is_file():
                self.port = port
                self.origin = f"http://127.0.0.1:{port}"
        except (OSError, ValueError):
            pass

    def status(self, parent_port):
        with self.lock:
            return self._status(parent_port)

    def _status(self, parent_port):
        if not self.origin:
            return {"state": "unavailable"}
        if self.worker is None:
            return {"state": "idle"}
        if self.worker.poll() is not None:
            return {"state": "failed"}
        if parent_port != self.parent_port:
            return {"state": "unavailable"}
        if self.ready.is_file():
            return {"state": "ready", "url": self.origin + "/browser.html"}
        return {"state": "starting"}

    def start(self, parent_port):
        with self.lock:
            status = self._status(parent_port)
            if status["state"] not in {"idle", "failed"}:
                return status
            if self.directory:
                self.directory.cleanup()
            self.directory = TemporaryDirectory(prefix="planneli-nav-")
            self.ready = Path(self.directory.name) / "ready"
            self.parent_port = parent_port
            try:
                with (self.project / "nav_unit/.planneli.log").open("ab") as log:
                    self.worker = subprocess.Popen(
                        [sys.executable, str(self.project / "start_nav_unit.py"),
                         "--parent-port", str(parent_port), "--listen-port", str(self.port),
                         "--ready-file", str(self.ready)],
                        cwd=self.project, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                        start_new_session=os.name == "posix",
                    )
            except OSError as error:
                raise InputError("Impossible de lancer Nav Unit.", 503) from error
            return self._status(parent_port)

    def close(self):
        with self.lock:
            if self.worker and self.worker.poll() is None:
                if os.name == "posix":
                    try:
                        os.killpg(self.worker.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                else:
                    self.worker.terminate()
                try:
                    self.worker.wait(5)
                except subprocess.TimeoutExpired:
                    if os.name == "posix":
                        try:
                            os.killpg(self.worker.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    else:
                        self.worker.kill()
                    self.worker.wait()
            if self.directory:
                self.directory.cleanup()
