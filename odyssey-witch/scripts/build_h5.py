#!/usr/bin/env python3
"""构建可静态托管的《奥德赛·地中海》H5 目录包与 ZIP。"""

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPY_DIRS = ("src", "concept-art", "vendor", "functions")
COPY_FILES = ("world3d.js", "island3d.js", "wrangler.toml")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(out, zip_path):
    out = out.resolve()
    if out == ROOT or out == Path(out.anchor):
        raise SystemExit("输出目录不能是项目根或磁盘根目录")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    html = (ROOT / "index.html").read_bytes()
    old = b'fetch("/api/schema")'
    if html.count(old) != 1:
        raise SystemExit("index.html 中应有且仅有一个 schema 请求")
    html = html.replace(old, b'fetch("src/data/schema.json")')
    (out / "index.html").write_bytes(html)

    for name in COPY_FILES:
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    for name in COPY_DIRS:
        shutil.copytree(ROOT / name, out / name)
    shutil.copy2(ROOT / "functions/api/schema.json", out / "src/data/schema.json")

    files = []
    for file in sorted(p for p in out.rglob("*") if p.is_file()):
        rel = file.relative_to(out).as_posix()
        files.append({"path": rel, "bytes": file.stat().st_size, "sha256": digest(file)})
    manifest = {
        "format": "odyssey-h5-v1",
        "entry": "index.html",
        "mode": "static-with-optional-ai",
        "sourceSha256": digest(ROOT / "index.html"),
        "files": files,
    }
    (out / "build-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    zip_path = zip_path.resolve()
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(p for p in out.rglob("*") if p.is_file()):
            archive.write(file, file.relative_to(out).as_posix())
    print(f"H5 目录：{out}")
    print(f"H5 ZIP：{zip_path}")
    print(f"文件：{len(files) + 1}（含构建清单）")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "dist/odyssey-h5")
    parser.add_argument("--zip", dest="zip_path", type=Path, default=ROOT / "dist/odyssey-h5.zip")
    args = parser.parse_args()
    build(args.out, args.zip_path)
