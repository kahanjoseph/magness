#!/usr/bin/env python3
"""Deploy a main commit only after its GitHub CI push run succeeds."""

import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

REPO = "kahanjoseph/magness"
API = f"https://api.github.com/repos/{REPO}"
HOME = Path.home()
TARGET = HOME / "magness-contact-release"
STATE = HOME / ".local/state/magness-deploy"
NODE_BIN = HOME / ".local/opt/node-v24.6.0-linux-x64/bin"
TURNSTILE = HOME / ".config/magness/turnstile.env"


def api(path):
    request = urllib.request.Request(API + path, headers={"Accept": "application/vnd.github+json", "User-Agent": "magness-deploy"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def main_sha():
    sha = api("/commits/main")["sha"]
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Invalid main commit")
    return sha


def ci_passed(sha):
    runs = api(f"/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha={sha}&per_page=20")["workflow_runs"]
    matching = [r for r in runs if r["head_sha"] == sha and r["head_branch"] == "main" and r["event"] == "push"]
    return bool(matching and matching[0]["status"] == "completed" and matching[0]["conclusion"] == "success")


def run(args, **kwargs):
    subprocess.run(args, check=True, **kwargs)


def healthy():
    for _ in range(15):
        try:
            with urllib.request.urlopen("http://127.0.0.1:4321/", timeout=3) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    return False


def deploy(sha):
    if not (NODE_BIN / "node").is_file() or not (NODE_BIN / "npm").is_file():
        raise RuntimeError("Node 24.6.0 is not installed at the configured path")
    if not TARGET.is_dir() or TARGET.is_symlink():
        raise RuntimeError("Expected an existing application directory")
    build_env = os.environ.copy()
    build_env["PATH"] = str(NODE_BIN) + os.pathsep + build_env.get("PATH", "")
    build_env["PUBLIC_TURNSTILE_SITE_KEY"] = subprocess.check_output(
        [str(NODE_BIN / "node"), f"--env-file={TURNSTILE}", "-p", "process.env.PUBLIC_TURNSTILE_SITE_KEY || ''"], text=True
    ).strip()
    if not build_env["PUBLIC_TURNSTILE_SITE_KEY"]:
        raise RuntimeError("Missing public Turnstile site key")
    build_env["PUBLIC_CONTACT_FORM_ENABLED"] = "true"
    with tempfile.TemporaryDirectory(prefix=".magness-stage-", dir=HOME) as temp:
        release = Path(temp) / "release"
        run(["git", "clone", "--quiet", "--depth", "1", "--branch", "main", f"https://github.com/{REPO}.git", str(release)])
        checked_out = subprocess.check_output(["git", "-C", str(release), "rev-parse", "HEAD"], text=True).strip()
        if checked_out != sha:
            print("Main changed while preparing; retry on the next poll.")
            return
        run([str(NODE_BIN / "npm"), "ci", "--no-audit", "--no-fund"], cwd=release, env=build_env)
        run([str(NODE_BIN / "npm"), "run", "build"], cwd=release, env=build_env)
        if main_sha() != sha or not ci_passed(sha):
            print("Main or its CI status changed while building; retry later.")
            return
        backup = HOME / f"magness-contact-backup-{time.time_ns()}"
        TARGET.rename(backup)
        try:
            release.rename(TARGET)
            run(["sudo", "-n", "/usr/bin/systemctl", "restart", "magness.service"])
            if not healthy():
                raise RuntimeError("New release did not pass its health check")
        except Exception:
            if TARGET.exists():
                TARGET.rename(HOME / f"magness-contact-failed-{time.time_ns()}")
            backup.rename(TARGET)
            subprocess.run(["sudo", "-n", "/usr/bin/systemctl", "restart", "magness.service"], check=False)
            raise
        (STATE / "deployed-sha").write_text(sha + "\n", encoding="utf-8")
        print(f"Deployed {sha}; previous release retained at {backup}")


def main():
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / "lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        sha = main_sha()
        marker = STATE / "deployed-sha"
        if marker.exists() and marker.read_text(encoding="utf-8").strip() == sha:
            return
        if not ci_passed(sha):
            print(f"Waiting for successful CI for {sha}")
            return
        deploy(sha)


if __name__ == "__main__":
    main()
