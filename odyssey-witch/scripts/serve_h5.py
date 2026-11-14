#!/usr/bin/env python3
"""以零密钥静态服务运行 H5 包；AI 请求明确交还给游戏内离线降级。"""

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    def log_message(self, *args):
        pass

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/health":
            return self.send_json({
                "ok": True,
                "mode": "offline-static",
                "keyConfigured": False,
                "ai": "in-game-local-fallback",
            })
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] in ("/api/parse", "/api/chat"):
            length = int(self.headers.get("Content-Length", 0))
            if length:
                self.rfile.read(length)
            return self.send_json({"error": "offline-static-build"})
        return self.send_json({"error": "not found"}, 404)

    def end_headers(self):
        if self.path.split("?", 1)[0] in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT / "dist/odyssey-h5")
    parser.add_argument("--port", type=int, default=8841)
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"缺少 H5 入口：{root / 'index.html'}")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), lambda *a, **kw: Handler(*a, directory=str(root), **kw))
    print(f"ODYSSEY_H5_PORT={server.server_port}", flush=True)
    print(f"http://127.0.0.1:{server.server_port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
