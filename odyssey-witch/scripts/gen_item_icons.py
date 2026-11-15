#!/usr/bin/env python3
"""扫描 concept-art/icons/ 生成 src/data/itemIcons.js（背包图标接线表）。

为什么要有这个脚本：图标是**按文件存在与否**接线的，不是按手写名单。
手写名单会列到还没生成的图 → 浏览器去请求不存在的文件 → 404 →
`tests/h5_offline_browser.py` 的「无 HTTP 4xx」断言直接红。

所以规则很简单：
  · 图放进 concept-art/icons/ → 跑一次本脚本 → 物品自动有图标
  · 图删掉 → 跑一次本脚本 → 物品自动回到纯文字（不留空位、不报错）

用法：
  py -3 scripts/gen_item_icons.py          # 生成/更新 src/data/itemIcons.js
  py -3 scripts/gen_item_icons.py --check  # 只体检，不写文件（CI 用）

文件名即物品名（蜂蜜.png → 物品「蜂蜜」）。中文文件名在 Windows 上没问题。
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "concept-art" / "icons"
OUT = ROOT / "src" / "data" / "itemIcons.js"
NEWLINE = chr(13) + chr(10)   # CRLF：与仓库其余文件一致


def collect():
    """返回 {物品名: 文件名}，只收真实存在的 PNG。"""
    out = {}
    if not ICON_DIR.is_dir():
        return out
    for p in sorted(ICON_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() == ".png":
            out[p.stem] = p.name
    return out


def render(mapping):
    items = ("," + NEWLINE).join(
        "  %s: %s" % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False))
        for k, v in sorted(mapping.items())
    )
    body = [
        "// ============================================================",
        "// 奥德赛 · 数据模块 —— itemIcons（**自动生成，勿手改**）",
        "// ============================================================",
        "",
        "// 由 scripts/gen_item_icons.py 扫描 concept-art/icons/ 生成。",
        "// 只收录**文件真实存在**的图标 —— 缺图的物品走纯文字，不发 404 请求。",
        "// 补图流程：丢 PNG 进 concept-art/icons/ → 跑一次该脚本 → 自动生效。",
        "const ITEM_ICONS = {",
        items if items else "  // （暂无图标文件）",
        "};",
        "",
    ]
    return NEWLINE.join(body)


def write(content):
    """按字节写，避免不同平台的换行翻译。"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(content.encode("utf-8"))


def assert_valid_js(content):
    """生成物必须是合法 JS —— 踩过坑：漏写逗号 → 整个文件不执行 → ITEM_ICONS undefined。

    没装 node 时退回 JSON 形状校验（把对象体当 JSON 解析，键值对结构等价）。
    """
    import shutil
    import subprocess
    import tempfile

    body = content[content.index("{") : content.rindex("}") + 1]
    if shutil.which("node"):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8", newline="") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            proc = subprocess.run(["node", "--check", tmp_path],
                                  capture_output=True, text=True)
            if proc.returncode != 0:
                raise SystemExit("生成的 itemIcons.js 不是合法 JS：%s" % proc.stderr.strip()[:400])
        finally:
            try:
                Path(tmp_path).unlink()
            except OSError:
                pass
        return
    try:
        json.loads(body)
    except ValueError as exc:
        raise SystemExit("生成的 itemIcons.js 不是合法对象字面量：%s" % exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只体检，不写文件")
    args = parser.parse_args()

    mapping = collect()
    content = render(mapping)
    assert_valid_js(content)

    if args.check:
        if not OUT.exists():
            print("X 缺 %s（先跑一次不带 --check 的生成）" % OUT.relative_to(ROOT))
            return 1
        if OUT.read_bytes() != content.encode("utf-8"):
            print("X %s 与 concept-art/icons/ 不同步（跑 gen_item_icons.py）" % OUT.relative_to(ROOT))
            return 1
        print("OK itemIcons.js 与图标目录同步（%d 个图标）" % len(mapping))
        return 0

    write(content)
    print("OK 已生成 %s（%d 个图标：%s）" % (
        OUT.relative_to(ROOT), len(mapping),
        "、".join(sorted(mapping)) or "（无）",
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
