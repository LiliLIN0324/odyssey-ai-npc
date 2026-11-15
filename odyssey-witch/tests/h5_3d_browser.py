# -*- coding: utf-8 -*-
"""3D 专项浏览器回归 —— 守「自定义 shader 编译失败」这一类静默灾难。

为什么需要它（2026-11-15 批次 R 实战）：
  主回归 `tests/browser_regression.py` 开头强制 `localStorage['odyssey-quality-v1']='2d'`，
  于是 **3D 的自定义 ShaderMaterial 从来没被编译过**——
  批次 R 第一版把水面 shader 写坏了（GLSL `toSun` 重定义 → 整个水面 program 编译失败），
  `scripts/verify_h5.py` 照样 PASS **H5 全链路**，
  而实机画面里海面整个消失、露出海底地形（读成「土黄台地 + 蓝色缝隙」）。

  编译失败在 WebGL 里几乎无声：three.js 只打一条 console.error，
  「画面不对」这件事没有任何断言能接住——所以必须显式守。

本回归做六件事：
  ① 进游戏（3D 画质）→ 等 W3D 就绪 → 收集 console/page 错误；
  ② 断言**没有** shader 编译错误（Shader Error / not compiled / program not valid）；
  ③ 断言 3D 真的在画东西（render.calls > 0、岛体已装配）；
  ④ **白天天海分离**：海面带必须蓝（B 明显大于 R）——土黄台地穿帮时立刻红；
  ⑤ **夜里天穹有星 + 夜海不过饱和**：星点数 ≥ 阈值（批次 R5 的星空回归）；
     海面饱和度 ≤ 上限（批次 R6 的「ACES 把夜海推成青绿」回归）；
  ⑥ **岛体在水线之上**：射线拾取能找到顶点色岛体且 y > 0。
"""

import base64
import os
import statistics
import struct
import zlib

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ODYSSEY_BASE_URL", "http://127.0.0.1:8840/")
PACKAGE_MODE = os.environ.get("ODYSSEY_H5_PACKAGE") == "1"

SHADER_ERROR_MARKERS = (
    "Shader Error",
    "not compiled",
    "program not valid",
    "useProgram",
)


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}")


# ---------------------------------------------------------------- PNG 解码

def _png_raw(data_url):
    return base64.b64decode(data_url.split(",", 1)[1])


def png_size(data_url):
    """从 data:image/png;base64 头里取宽高（只读 IHDR，不解码像素）。"""
    raw = _png_raw(data_url)
    width, height = struct.unpack(">II", raw[16:24])
    return width, height


def png_rows(data_url, max_y):
    """解码 PNG，返回 (width, height, rows)；rows 是逐行的 bytes（RGB 或 RGBA）。

    自写解码器：只依赖标准库，avoid 环境里未必装了 Pillow。
    支持 three.js toDataURL 输出的 8bit RGB/RGBA 非隔行格式。
    """
    raw = _png_raw(data_url)
    pos = 8
    idat = b""
    width = height = 0
    color_type = 2
    while pos < len(raw):
        length = struct.unpack(">I", raw[pos : pos + 4])[0]
        ctype = raw[pos + 4 : pos + 8]
        body = raw[pos + 8 : pos + 8 + length]
        if ctype == b"IHDR":
            width, height = struct.unpack(">II", body[:8])
            color_type = body[9]
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break
        pos += 12 + length
    plain = zlib.decompress(idat)
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    prev = bytearray(stride)
    rows = []
    offset = 0
    limit = min(max_y, height - 1)
    for y in range(height):
        filt = plain[offset]
        offset += 1
        line = bytearray(plain[offset : offset + stride])
        offset += stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if filt == 1:
                line[i] = (line[i] + a) & 0xFF
            elif filt == 2:
                line[i] = (line[i] + b) & 0xFF
            elif filt == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif filt == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        prev = line
        rows.append(bytes(line))
        if y >= limit:
            break
    return width, height, channels, rows


def band_rgb(rows, channels, y0, y1):
    """取一个横向条带的平均 RGB。"""
    total = [0.0, 0.0, 0.0]
    count = 0
    for row in rows[y0:y1]:
        for x in range(0, len(row), channels):
            total[0] += row[x]
            total[1] += row[x + 1]
            total[2] += row[x + 2]
            count += 1
    if not count:
        return (0.0, 0.0, 0.0)
    return (total[0] / count, total[1] / count, total[2] / count)


def count_isolated_bright(rows, channels, y0, y1, delta=16):
    """数「孤立亮点」——星星的判据：比所在带中位亮度亮一截，且 8 邻域都不亮。

    月亮是一大团亮区，内部像素的邻居也是亮的 → 不计入；星点是孤立像素 → 计入。
    """
    lum = []
    for row in rows[y0:y1]:
        lum.append([sum(row[x : x + 3]) / 3.0 for x in range(0, len(row), channels)])
    if not lum:
        return 0, 0.0
    flat = sorted(v for line in lum for v in line)
    median = statistics.median(flat)
    thr = median + delta
    count = 0
    h = len(lum)
    for y in range(h):
        for x in range(len(lum[y])):
            if lum[y][x] < thr:
                continue
            isolated = True
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < len(lum[ny]) and lum[ny][nx] >= thr:
                        isolated = False
                        break
                if not isolated:
                    break
            if isolated:
                count += 1
    return count, median


# ---------------------------------------------------------------- 主流程

def set_clock(page, hour, minute=0):
    page.evaluate(
        "([h, m]) => { window.__game.state.clock = h * 60 + m; }", [hour, minute]
    )


def wait_night(page, want, timeout=12.0):
    """等 atmosphere tick 把夜色推到目标值（headless 下 rAF 帧少，要轮询）。"""
    import time

    deadline = time.time() + timeout
    while time.time() < deadline:
        night = page.evaluate("() => (window.W3D && W3D.debug) ? W3D.debug().night : null")
        if night is not None and abs(night - want) < 0.12:
            return night
        page.wait_for_timeout(200)
    return page.evaluate("() => (window.W3D && W3D.debug) ? W3D.debug().night : None")


def main():
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        # 关键：这一条要 3d，不能像主回归那样锁 2d
        context.add_init_script(
            "try{localStorage.setItem('odyssey-quality-v1','3d')}catch(e){}"
        )
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on(
            "console",
            lambda message: errors.append(f"console error: {message.text}")
            if message.type == "error"
            else None,
        )
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(800)
            page.locator("#tsGo").click()
            page.wait_for_timeout(700)
            if page.locator("#opSkip").count():
                page.locator("#opSkip").click()
            page.wait_for_timeout(2500)

            debug = page.evaluate("() => (window.W3D && W3D.debug) ? W3D.debug() : null")
            check(debug is not None, "3D 模块已就绪（W3D.debug 可读）")
            check(
                bool(page.evaluate("() => window.W3D && window.W3D.ready")),
                "3D 引擎 ready（画布已在渲染）",
            )
            check(debug.get("isles", 0) > 0, f"岛体已装配（isles={debug.get('isles')}）")
            check(debug.get("calls", 0) > 0, f"3D 有绘制调用（calls={debug.get('calls')}）")

            shader_errors = [
                e for e in errors
                if any(marker in e for marker in SHADER_ERROR_MARKERS)
            ]
            check(
                not shader_errors,
                "3D 自定义 shader 全部编译通过（无 Shader Error / program not valid）\n"
                + "\n".join(shader_errors[:6]),
            )

            # ---- ④ 白天：海面必须蓝，土黄台地穿帮立刻红 ----
            set_clock(page, 10)
            page.wait_for_timeout(1200)
            frame = page.evaluate("() => (window.W3D && W3D.grabFrame) ? W3D.grabFrame() : null")
            check(bool(frame), "3D 能抓取当前帧（grabFrame 非空）")
            width, height = png_size(frame)
            check(width > 0 and height > 0, f"抓帧尺寸正常（{width}x{height}）")
            _, _, channels, rows = png_rows(frame, int(height * 0.95))
            sky = band_rgb(rows, channels, int(height * 0.02), int(height * 0.08))
            sea = band_rgb(rows, channels, int(height * 0.78), int(height * 0.92))
            check(
                sea[2] - sea[0] >= 25,
                f"白天海面是蓝的（B-R={sea[2] - sea[0]:.1f}，海带均值 {sea}）——"
                "若为土黄则说明海床穿帮（批次 R4 同款回归）",
            )
            check(
                sum(abs(a - b) for a, b in zip(sky, sea)) > 12,
                f"画面有层次（天空 {tuple(int(v) for v in sky)} vs 海面 {tuple(int(v) for v in sea)} 不是同一块死色）",
            )

            # ---- ⑥ 岛体在水线之上（射线拾取）----
            rect = page.evaluate(
                "() => { const r = document.getElementById('cv3d').getBoundingClientRect();"
                " return {x: r.x, y: r.y, w: r.width, h: r.height}; }"
            )
            island_hits = []
            for fx, fy in [(0.24, 0.34), (0.30, 0.30), (0.40, 0.32), (0.18, 0.38), (0.55, 0.30)]:
                hits = page.evaluate(
                    "([px, py]) => window.W3D.pick(px, py)",
                    [rect["x"] + rect["w"] * fx, rect["y"] + rect["h"] * fy],
                )
                if not hits:
                    continue
                for hit in hits[:2]:
                    if hit.get("vc") and hit.get("y", 0) > 0:
                        island_hits.append((fx, fy, hit["y"]))
                        break
            check(
                bool(island_hits),
                "射线拾取能找到水线之上的岛体（顶点色网格，y>0）",
            )

            # ---- ⑤ 夜晚：天穹有星 + 夜海不过饱和 ----
            set_clock(page, 23, 30)
            night = wait_night(page, 1.0)
            check(night is not None and night > 0.85, f"夜景生效（uNight={night}）")
            page.wait_for_timeout(900)
            frame = page.evaluate("() => (window.W3D && W3D.grabFrame) ? W3D.grabFrame() : null")
            check(bool(frame), "夜间能抓取当前帧")
            width, height = png_size(frame)
            _, _, channels, rows = png_rows(frame, int(height * 0.95))
            stars, median = count_isolated_bright(
                rows, channels, int(height * 0.01), int(height * 0.10), delta=14
            )
            check(
                stars >= 3,
                f"3D 天穹有星点（孤立亮点 {stars} 颗，天空带中位亮度 {median:.1f}）",
            )
            sea_n = band_rgb(rows, channels, int(height * 0.78), int(height * 0.92))
            mx, mn = max(sea_n), min(sea_n)
            saturation = (mx - mn) / mx if mx else 0
            check(
                saturation <= 0.68,
                f"夜海不是过饱和青绿（饱和度 {saturation:.2f} ≤ 0.68，海带均值 {tuple(int(v) for v in sea_n)}）",
            )

            other = [e for e in errors if e not in shader_errors]
            check(not other, "3D 场景无 pageerror 与 console error；\n" + "\n".join(other[:6]))
        except Exception:
            if errors:
                print("BROWSER ERRORS\n" + "\n".join(errors[:20]))
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
