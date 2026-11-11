#!/usr/bin/env python3
"""
概念图批量优化（体积治理）。
- 只做降采样 + JPEG 重编码，不改文件名/目录，代码引用零改动。
- 按显示尺寸定目标宽：立绘 720 / 地图 1600 / 横屏章节背景 1920。
- brand IP 物料与 favicon 不动；PNG 不转 JPEG。
- 幂等：已达标（宽 ≤ 目标）的图跳过，避免二次重编码累积损失。

用法：
    py -3 tools/optimize_images.py            # 正式写回
    py -3 tools/optimize_images.py --dry-run  # 只出报告，不写盘
"""
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "odyssey-witch" / "concept-art"

# (目录相对名, 目标宽, 质量)
RULES = [
    ("characters", 720, 84),
    ("maps", 1600, 84),
    ("prologue", 1920, 82),
    ("brand", None, None),          # 品牌物料，保留原图
]
ROOT_CG_MAX_W, ROOT_CG_Q = 1920, 82

SKIP_PREFIX = ("favicon",)


def rule_for(rel: str):
    parts = rel.replace("\\", "/").split("/")
    if len(parts) > 1 and parts[0] in ("characters", "maps", "prologue", "brand"):
        for name, w, q in RULES:
            if parts[0] == name:
                return w, q
    return ROOT_CG_MAX_W, ROOT_CG_Q


def main():
    dry = "--dry-run" in sys.argv
    files = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png")]
    files.sort()
    total_before = total_after = 0
    n_touched = n_skip = 0
    rows = []

    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        if p.stem.lower().startswith(SKIP_PREFIX):
            n_skip += 1
            continue
        max_w, quality = rule_for(rel)
        if max_w is None:  # brand 目录整体跳过
            n_skip += 1
            rows.append((rel, "skip(brand)", p.stat().st_size, p.stat().st_size, ""))
            continue

        im = Image.open(p)
        ow, oh = im.size
        before = p.stat().st_size

        if im.format == "PNG" and p.stem.lower().startswith("favicon"):
            n_skip += 1
            continue

        if ow <= max_w:
            n_skip += 1
            rows.append((rel, f"skip(已有 {ow}px)", before, before, ""))
            continue

        nh = round(oh * max_w / ow)
        rgb = im.convert("RGB")
        resized = rgb.resize((max_w, nh), Image.LANCZOS)

        if dry:
            import io
            buf = io.BytesIO()
            resized.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            after = buf.tell()
        else:
            resized.save(p, "JPEG", quality=quality, optimize=True, progressive=True)
            after = p.stat().st_size

        total_before += before
        total_after += after
        n_touched += 1
        rows.append((rel, f"{ow}x{oh}->{max_w}x{nh}", before, after, f"{round(100*after/before)}%"))

    print(f"{'文件':42s} {'动作':24s} {'前KB':>7s} {'后KB':>7s} {'占比':>5s}")
    for rel, action, b, a, pct in rows:
        print(f"{rel:42s} {action:24s} {b//1024:7d} {a//1024:7d} {pct:>5s}")
    print("-" * 90)
    print(f"处理 {n_touched} 张 / 跳过 {n_skip} 张")
    if total_before:
        print(f"体积 {total_before/1048576:.1f}MB -> {total_after/1048576:.1f}MB（{round(100*total_after/total_before)}%）")
    if dry:
        print("[dry-run] 未写盘")


if __name__ == "__main__":
    main()
