#!/usr/bin/env python3
"""一条命令构建 H5，并执行 Node 门禁与真实 Chrome 产物回归。"""

import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/odyssey-h5"
NODE_TESTS = [
    "tests/phase1-visual.test.cjs",
    "tests/first-upgrade.test.cjs",
    "tests/second-upgrade.test.cjs",
    "tests/phase2-loop.test.cjs",
    "tests/phase3-systems.test.cjs",
    "tests/phase4-release.test.cjs",
    "tests/local-intent.test.cjs",
]


def run(command, **kwargs):
    print("+", " ".join(str(part) for part in command), flush=True)
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True, **kwargs)


def main():
    run([sys.executable, "scripts/build_h5.py"])
    run(["node", "--test", *NODE_TESTS])

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, "scripts/serve_h5.py", "--root", str(OUT), "--port", str(port)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    base = f"http://127.0.0.1:{port}/"
    try:
        for attempt in range(100):
            if server.poll() is not None:
                raise RuntimeError(server.stderr.read())
            try:
                with urllib.request.urlopen(base + "api/health", timeout=0.3) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError("H5 静态服务启动超时")
        env = {**os.environ, "ODYSSEY_BASE_URL": base, "ODYSSEY_H5_PACKAGE": "1"}
        run([sys.executable, "tests/browser_regression.py"], env=env)
        run([sys.executable, "tests/h5_offline_browser.py"], env=env)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
    print(f"PASS H5 全链路：{OUT}", flush=True)


if __name__ == "__main__":
    main()
