#!/usr/bin/env python3
"""清除概念图右下角的“AI 生成”水印。

水印为固定版式：宽度约为图片短边的 25.5%，紧贴右下角。
脚本用 LaMa 对水印矩形做局部重绘，再以泊松融合贴回，保留原始构图与尺寸。

依赖（一次性工具，按需安装）：
    py -3 -m pip install opencv-python-headless onnxruntime
    LaMa ONNX 模型默认放在 %TEMP%/lama/lama_fp32.onnx，可用 --model 指定。
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = Path.home() / "AppData/Local/Temp/lama/lama_fp32.onnx"


def imread(path):
    return cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_UNCHANGED)


def imwrite(path, image):
    suffix = path.suffix.lower()
    params = []
    if suffix in (".jpg", ".jpeg"):
        params = [cv2.IMWRITE_JPEG_QUALITY, 95]
        if hasattr(cv2, "IMWRITE_JPEG_SAMPLING_FACTOR_444"):
            params += [cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444]
    ok, buffer = cv2.imencode(suffix, image, params)
    if not ok:
        raise SystemExit(f"无法写入 {path}")
    buffer.tofile(str(path))


def badge_rect(width, height, pad_ratio):
    """按短边比例定位水印矩形，并向外扩展以覆盖圆角边缘。"""
    short = min(width, height)
    pad = pad_ratio * short
    x0 = max(0, int(width - 0.273 * short - pad))
    y0 = max(0, int(height - 0.122 * short - pad))
    x1 = min(width, int(width - 0.018 * short + pad))
    y1 = min(height, int(height - 0.017 * short + pad))
    return x0, y0, x1, y1


def inpaint(session, image, rect):
    height, width = image.shape[:2]
    x0, y0, x1, y1 = rect
    box_w, box_h = x1 - x0, y1 - y0
    crop_size = min(max(512, int(box_w * 1.35), int(box_h * 2.4)), width, height)
    crop_x, crop_y = width - crop_size, height - crop_size

    crop = image[crop_y:height, crop_x:width].copy()
    mask = np.zeros((crop_size, crop_size), np.float32)
    mask[y0 - crop_y:y0 - crop_y + box_h, x0 - crop_x:x0 - crop_x + box_w] = 1.0
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8), iterations=1)

    resized = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(mask, (512, 512), interpolation=cv2.INTER_NEAREST)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    output = session.run(
        ["output"],
        {"image": rgb[None].transpose(0, 3, 1, 2), "mask": small_mask[None, None]},
    )[0][0]
    filled = np.clip(output.transpose(1, 2, 0), 0, 255).astype(np.uint8)
    filled = cv2.cvtColor(filled, cv2.COLOR_RGB2BGR)
    if crop_size != 512:
        filled = cv2.resize(filled, (crop_size, crop_size), interpolation=cv2.INTER_LANCZOS4)

    paste_mask = (mask * 255).astype(np.uint8)
    center = (x0 - crop_x + box_w // 2, y0 - crop_y + box_h // 2)
    try:
        patched = cv2.seamlessClone(filled, crop, paste_mask, center, cv2.NORMAL_CLONE)
    except cv2.error:
        # seamlessClone 在 mask 贴边时失败；退回 alpha 融合（仅 mask 区域替换+窄羽化）
        paste_mask_f = mask.astype(np.float32)
        # 窄环带羽化：距离变换，边缘 3px 衰减
        dist = cv2.distanceTransform((paste_mask > 0).astype(np.uint8), cv2.DIST_L2, 3)
        alpha = np.clip(dist / 3.0, 0, 1).astype(np.float32)
        blended = (filled.astype(np.float32) * alpha[..., None] +
                   crop.astype(np.float32) * (1 - alpha[..., None]))
        patched = np.clip(blended, 0, 255).astype(np.uint8)

    result = image.copy()
    result[crop_y:height, crop_x:width] = patched
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(DEFAULT_MODEL), help="LaMa ONNX 模型路径")
    parser.add_argument("--pad", type=float, default=0.012, help="水印矩形外扩比例（相对短边）")
    args = parser.parse_args()

    model = Path(args.model)
    if not model.exists():
        raise SystemExit(f"缺少 LaMa 模型：{model}")
    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])

    images = sorted(
        path for path in (ROOT / "concept-art").rglob("*")
        if path.suffix.lower() in (".jpg", ".jpeg", ".png")
    )

    cleaned = 0
    for path in images:
        image = imread(path)
        if image is None:
            print(f"SKIP {path.relative_to(ROOT)}：无法读取")
            continue
        height, width = image.shape[:2]
        if min(width, height) < 200:
            print(f"SKIP {path.relative_to(ROOT)}：尺寸过小")
            continue
        rect = badge_rect(width, height, args.pad)
        if image.shape[2] == 4:
            rgb = image[:, :, :3].copy()
            alpha = image[:, :, 3]
            filled = inpaint(session, rgb, rect)
            result = np.dstack([filled, alpha])
        else:
            result = inpaint(session, image, rect)
        imwrite(path, result)
        cleaned += 1
        print(f"CLEAN {path.relative_to(ROOT)} rect={rect}")

    print(f"完成：{cleaned} 张")


if __name__ == "__main__":
    main()
