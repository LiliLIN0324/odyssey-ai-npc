#!/usr/bin/env python3
"""
奥德赛 · 女巫的林间小屋 —— 本地服务

职责：
  - 静态托管 index.html（游戏界面）
  - GET  /api/schema → 上级目录 schema.json（意图菜单，单一数据源）
  - POST /api/parse  → 天翼 Xing4.0-29B-Intent（意图+参数解析）
  - POST /api/chat   → 天翼 TeleChat3-438B-A24B（女巫人格台词）

API Key 从本目录或上级目录 key.txt 读取，只留在服务端，绝不进入浏览器。
零第三方依赖，Python 3.12 直接运行：

    py -3 server.py [端口]     # 默认 8765
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
API_URL = "https://api-maas.teleai.com.cn/v1/chat/completions"
MODEL_PARSE = "Xing4.0-29B-Intent"
MODEL_CHAT = "TeleChat3-438B-A24B"


def read_key() -> str:
    for p in (HERE / "key.txt", HERE.parent / "key.txt"):
        try:
            if p.is_file():
                m = re.search(r"sk-[A-Za-z0-9_\-]{16,}", p.read_text(encoding="utf-8"))
                if m:
                    return m.group(0)
        except OSError:
            continue
    return ""


KEY = read_key()
if not KEY:
    print("错误：未找到 key.txt（本目录或上级目录），无法调用天翼 API")
    sys.exit(2)


def call_model(model: str, messages: list, max_tokens: int, temperature: float,
                timeout: float = 60.0) -> tuple[str, dict]:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"], body.get("usage", {})


STATIC_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
JS_TYPES = {".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send_static(self, rel: str):
        """托管 concept-art/ 下的静态图片（路径穿越防护 + 限扩展名）"""
        base = (HERE / "concept-art").resolve()
        target = (base / rel).resolve()
        if (target.is_file() and str(target).startswith(str(base) + os.sep)
                and target.suffix.lower() in STATIC_TYPES):
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", STATIC_TYPES[target.suffix.lower()])
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(data)
        else:
            self._send(404, {"error": "not found"})

    def _send_js(self, target: Path, base: Path):
        """托管本地 JS 模块（world3d / vendor three.js；路径穿越防护 + 限扩展名）"""
        try:
            target = target.resolve()
        except OSError:
            return self._send(404, {"error": "not found"})
        if (target.is_file() and str(target).startswith(str(base) + os.sep)
                and target.suffix.lower() in JS_TYPES):
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", JS_TYPES[target.suffix.lower()])
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=60")
            self.end_headers()
            self.wfile.write(data)
        else:
            self._send(404, {"error": "not found"})

    def _send(self, code: int, obj, ctype: str = "application/json; charset=utf-8"):
        data = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            try:
                self._send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            except OSError:
                self._send(500, {"error": "index.html 缺失"})
        elif self.path == "/api/schema":
            try:
                schema = json.loads((HERE.parent / "schema.json").read_text(encoding="utf-8"))
                self._send(200, schema)
            except OSError:
                self._send(500, {"error": "找不到上级目录的 schema.json"})
        elif self.path.startswith("/concept-art/"):
            rel = unquote(self.path.split("?", 1)[0][len("/concept-art/"):])
            self._send_static(rel)
        elif path == "/world3d.js":
            self._send_js(HERE / "world3d.js", HERE)
        elif self.path.startswith("/vendor/"):
            rel = unquote(self.path.split("?", 1)[0][len("/vendor/"):])
            self._send_js(HERE / "vendor" / rel, HERE / "vendor")
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._send(400, {"error": "bad request"})

        if self.path == "/api/parse":
            model, temperature, max_tokens = MODEL_PARSE, 0.0, 256
            messages = [{"role": "user", "content": req.get("prompt", "")}]
        elif self.path == "/api/chat":
            model, temperature, max_tokens = MODEL_CHAT, 0.7, 300
            messages = req.get("messages") or []
        else:
            return self._send(404, {"error": "not found"})

        try:
            text, usage = call_model(model, messages, max_tokens, temperature)
            self._send(200, {"content": text, "usage": usage})
        except urllib.error.HTTPError as exc:
            detail = exc.reason or ""
            try:
                detail = json.loads(exc.read().decode("utf-8", "replace")).get("message", "") or detail
            except Exception:
                pass
            self._send(exc.code, {"error": f"HTTP {exc.code}｜{detail}"})
        except Exception as exc:
            self._send(502, {"error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    print("奥德赛 · 女巫的林间小屋")
    print(f"  地址    : http://localhost:{PORT}")
    print(f"  解析模型: {MODEL_PARSE}")
    print(f"  台词模型: {MODEL_CHAT}")
    print("  Ctrl+C 退出")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
