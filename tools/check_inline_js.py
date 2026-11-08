# -*- coding: utf-8 -*-
"""node --check 内联脚本：抽取 index.html 的内联 <script>（无 src）拼接后交给 node --check。"""
import re, subprocess, sys, os, tempfile

ROOT = os.path.join(os.path.dirname(__file__), "..", "odyssey-witch")
HTML = os.path.join(ROOT, "index.html")

with open(HTML, "r", encoding="utf-8") as f:
    html = f.read()

# 抽取无 src 的内联 script 块
blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S | re.I)
if not blocks:
    print("NO_INLINE_SCRIPT"); sys.exit(1)

js = "\n;\n".join(blocks)
fd, path = tempfile.mkstemp(suffix=".js")
with os.fdopen(fd, "w", encoding="utf-8") as f:
    f.write(js)

r = subprocess.run(["node", "--check", path], capture_output=True, text=True, shell=True)
os.unlink(path)
if r.returncode == 0:
    print(f"OK  blocks={len(blocks)} chars={len(js)}")
else:
    print("FAIL")
    print(r.stderr[:4000])
    sys.exit(1)
