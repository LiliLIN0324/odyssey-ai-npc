# ============================================================
# 奥德赛 · 世界海图底图生成器
# 唯一真源：src/data/constants.js 的 buildMediterranean()（land/cell 调用）
# 由它渲染 3312x1296 的航海图 —— 海图上每一条海岸线都来自实际可航地形。
# 用法：py -3 scripts/build_seamap.py [--ascii]
# ============================================================
import re, sys, math, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CONST = ROOT / "src" / "data" / "constants.js"
OUT = ROOT / "concept-art" / "maps" / "01-世界海图.jpg"
NRNG = np.random.default_rng(20261114)

COLS, ROWS = 46, 18
CELL = 72
W, H = COLS * CELL, ROWS * CELL          # 3312 x 1296
S = 2                                     # 地形超采样倍数
FONT_CAND = [
    "C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/simsun.ttc",
]


# ---------------- 真源解析 ----------------
def load_grid():
    src = CONST.read_text(encoding="utf-8")
    block = src[src.index("function buildMediterranean"):src.index("const WORLD = buildMediterranean()")]
    g = [["~"] * COLS for _ in range(ROWS)]

    def put(x, y, ch="#"):
        if 0 <= x < COLS and 0 <= y < ROWS:
            g[y][x] = ch

    for m in re.finditer(r"land\((\d+),(\d+),(\d+),(\d+)\)", block):
        x0, y0, x1, y1 = map(int, m.groups())
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                put(x, y)
    for m in re.finditer(r"cell\((\d+),(\d+)(?:,\s*\"(.)\")?\)", block):
        put(int(m.group(1)), int(m.group(2)), m.group(3) or "#")
    for y in range(ROWS):
        for x in range(COLS):
            if g[y][x] == "~" and (x * 13 + y * 7) % 9 == 0:
                g[y][x] = "."
    return g


def load_islands():
    src = CONST.read_text(encoding="utf-8")
    return [{"gx": int(m.group(1)), "gy": int(m.group(2)), "name": m.group(3)}
            for m in re.finditer(r'\{gx:(\d+),\s*gy:(\d+),\s*name:"([^"]+)".*?scene:"([^"]+)"', src)]


def load_seas():
    src = CONST.read_text(encoding="utf-8")
    m = re.search(r"const SEAS = \[(.*?)\];", src, re.S)
    if not m:
        return []
    return [{"x": int(s.group(1)), "y": int(s.group(2)), "label": s.group(3)}
            for s in re.finditer(r"\{x:(\d+),y:(\d+),label:\"([^\"]+)\"\}", m.group(1))]


def load_currents():
    """洋流走的是 SEA_CURRENTS 的网格坐标——同样必须在可航水域上。"""
    src = CONST.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r"cells:\[(.*?)\]\}", src, re.S):
        pts = [(float(a), float(b)) for a, b in re.findall(r"\[([\d.]+),([\d.]+)\]", m.group(1))]
        if pts:
            out.append(pts)
    return out


def assert_water(g, islands, currents):
    bad = [f'{i["name"]}@{i["gx"]},{i["gy"]}={g[i["gy"]][i["gx"]]}'
           for i in islands if g[i["gy"]][i["gx"]] == "#"]
    for ci, pts in enumerate(currents):
        for gx, gy in pts:
            if g[int(gy)][int(gx)] == "#":
                bad.append(f"current{ci}@{gx},{gy}=#")
    if bad:
        raise SystemExit("海图/实际地形不一致：\n  " + "\n  ".join(bad))


def ascii_map(g):
    return "\n".join("".join(g[y]) for y in range(ROWS))


# ---------------- 噪声 ----------------
def smooth_noise(h, w, scale, octaves=3):
    acc = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        sh = max(2, int(h / (scale / (2 ** o))))
        sw = max(2, int(w / (scale / (2 ** o))))
        base = NRNG.random((sh, sw)).astype(np.float32)
        img = Image.fromarray((base * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += amp * (np.asarray(img, np.float32) / 255.0)
        norm += amp
        amp *= 0.5
    return acc / norm


def blur_l(mask, px):
    return Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(px))


# ---------------- 地形 ----------------
def build_terrain(g, islands):
    w, h = W * S, H * S
    cw, ch = w / COLS, h / ROWS

    # 1) 陆地掩膜：格子 + 每座玩法岛的小岛体（同一套坐标，不另开一套）
    land = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(land)
    for y in range(ROWS):
        for x in range(COLS):
            if g[y][x] == "#":
                d.rectangle([x * cw, y * ch, (x + 1) * cw, (y + 1) * ch], fill=255)
    for isl in islands:
        cx, cy = (isl["gx"] + 0.5) * cw, (isl["gy"] + 0.5) * ch
        r = cw * 0.68
        d.ellipse([cx - r, cy - r * 0.82, cx + r, cy + r * 0.82], fill=255)

    landf = np.asarray(land.filter(ImageFilter.GaussianBlur(cw * 0.42)), np.float32) / 255.0
    warp = smooth_noise(h, w, 80, 3)
    coast = (landf + (warp - 0.5) * 0.30) > 0.5          # 自然海岸（圆角 + 抖边，仍贴合网格）

    # 2) 离岸距离场（1=岸边, 0=远海）
    near = np.asarray(blur_l(coast.astype(np.float32), cw * 1.15), np.float32) / 255.0

    # 3) 海：明亮的地中海蓝 → 近岸青；加古图等深线
    n1 = smooth_noise(h, w, 460, 3)
    n2 = smooth_noise(h, w, 120, 2)
    deep = np.array([22, 74, 105], np.float32)
    mid = np.array([40, 108, 134], np.float32)
    shal = np.array([104, 172, 176], np.float32)
    t = np.clip(0.24 + n1 * 0.54 + n2 * 0.14, 0, 1)[..., None]
    sea = deep * (1 - t) + mid * t
    band = np.clip((near - 0.32) * 2.2, 0, 1)[..., None] * (1 - coast[..., None])
    sea = sea * (1 - band * 0.78) + shal * (band * 0.78)
    for lv in (0.74, 0.60, 0.47, 0.36, 0.27):
        line = (np.abs(near - lv) < 0.007) & (~coast)
        sea = np.where(line[..., None], sea * 0.74 + np.array([168, 208, 212], np.float32) * 0.26, sea)

    # 4) 陆：羊皮纸 + 丘陵明暗 + 等高线
    ln = smooth_noise(h, w, 220, 4)
    ln2 = smooth_noise(h, w, 70, 2)
    hill = smooth_noise(h, w, 150, 3)
    paper = np.array([210, 189, 150], np.float32)
    paper2 = np.array([228, 210, 172], np.float32)
    dry = np.array([176, 150, 108], np.float32)
    lc = paper * (1 - ln[..., None]) + paper2 * ln[..., None]
    lc = lc * (1 - ln2[..., None] * 0.12) + dry * (ln2[..., None] * 0.12)
    lc *= (1 + (hill[..., None] - 0.5) * 0.20)                 # 丘陵起伏
    inner = np.asarray(blur_l(coast.astype(np.float32), cw * 0.55), np.float32) / 255.0
    lc = lc * (1 - inner[..., None] * 0.12) + np.array([150, 124, 86], np.float32) * (inner[..., None] * 0.12)
    lvl = (ln * 7.0) % 1.0
    cliff = (np.abs(lvl - 0.5) > 0.474) & coast & (ln2 > 0.40)
    lc[cliff] = lc[cliff] * 0.90 + np.array([118, 96, 64], np.float32) * 0.10

    out = sea.copy()
    out[coast] = lc[coast]
    out = np.clip(out + NRNG.normal(0, 4.2, (h, w, 1)).astype(np.float32), 0, 255)

    base = Image.fromarray(out.astype(np.uint8)).resize((W, H), Image.LANCZOS)
    cmask = np.asarray(Image.fromarray((coast * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)) > 127

    # 5) 海岸双线：外深褐（海崖阴影）+ 内米色（受光边）
    cm = Image.fromarray((cmask * 255).astype(np.uint8))
    outer = np.asarray(cm, np.float32) - np.asarray(cm.filter(ImageFilter.MinFilter(7)), np.float32)
    base.paste(Image.new("RGB", (W, H), (52, 39, 26)), mask=Image.fromarray(np.clip(outer * 1.15, 0, 255).astype(np.uint8)))
    ie = np.asarray(cm.filter(ImageFilter.MinFilter(7)), np.float32) - np.asarray(cm.filter(ImageFilter.MinFilter(13)), np.float32)
    base.paste(Image.new("RGB", (W, H), (232, 216, 178)), mask=Image.fromarray(np.clip(ie * 1.8, 0, 255).astype(np.uint8)))
    return base


# ---------------- 装饰 ----------------
def font(size, bold=False):
    if bold:
        p = "C:/Windows/Fonts/msyhbd.ttc"
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    for p in FONT_CAND:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_compass(dr, cx, cy, r):
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(198, 174, 126, 210), width=3)
    dr.ellipse([cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86], outline=(198, 174, 126, 120), width=1)
    for i in range(32):
        a = i / 32 * math.tau
        ln = r * (0.80 if i % 4 == 0 else 0.87)
        dr.line([cx + math.cos(a) * ln, cy + math.sin(a) * ln,
                 cx + math.cos(a) * r * 0.93, cy + math.sin(a) * r * 0.93],
                fill=(206, 182, 134, 210), width=2 if i % 4 == 0 else 1)
    for i in range(8):
        a = i / 8 * math.tau - math.pi / 2
        long = r * (0.92 if i % 2 == 0 else 0.54)
        wdt = r * (0.10 if i % 2 == 0 else 0.05)
        tx, ty = cx + math.cos(a) * long, cy + math.sin(a) * long
        lx, ly = cx + math.cos(a + math.pi / 2) * wdt, cy + math.sin(a + math.pi / 2) * wdt
        rx, ry = cx + math.cos(a - math.pi / 2) * wdt, cy + math.sin(a - math.pi / 2) * wdt
        dark = (146, 112, 66) if i % 2 == 0 else (186, 160, 110)
        lite = (196, 168, 118) if i % 2 == 0 else (214, 192, 146)
        dr.polygon([(cx, cy), (lx, ly), (tx, ty)], fill=dark)
        dr.polygon([(cx, cy), (tx, ty), (rx, ry)], fill=lite)
    dr.ellipse([cx - r * 0.09, cy - r * 0.09, cx + r * 0.09, cy + r * 0.09],
               fill=(228, 204, 152), outline=(96, 76, 48))
    f = font(int(r * 0.19), True)
    for txt, dx, dy in (("N", 0, -r * 1.18), ("E", r * 1.18, 0), ("S", 0, r * 1.18), ("W", -r * 1.18, 0)):
        b = dr.textbbox((0, 0), txt, font=f)
        dr.text((cx + dx - (b[2] - b[0]) / 2, cy + dy - (b[3] - b[1]) / 2), txt, font=f, fill=(216, 192, 144))


def draw_island_overlay(dr, cx, cy, r, rng):
    """小岛的收尾：浅滩双环 + 背光阴影 + 外围礁石（岛名由 DOM 标记承担，中心留空）"""
    dr.ellipse([cx - r * 1.34, cy - r * 1.10, cx + r * 1.34, cy + r * 1.10],
               outline=(156, 210, 212, 84), width=2)
    dr.ellipse([cx - r * 1.18, cy - r * 0.97, cx + r * 1.18, cy + r * 0.97],
               outline=(134, 194, 200, 56), width=1)
    dr.arc([cx - r * 0.66, cy - r * 0.58, cx + r * 0.76, cy + r * 0.72],
           292, 118, fill=(64, 48, 32, 120), width=3)
    dr.arc([cx - r * 0.80, cy - r * 0.70, cx + r * 0.80, cy + r * 0.74],
           196, 300, fill=(238, 224, 188, 110), width=2)
    for _ in range(rng.randint(2, 3)):
        a = rng.random() * math.tau
        d = r * (1.06 + rng.random() * 0.18)
        px, py = cx + math.cos(a) * d, cy + math.sin(a) * d * 0.82
        rr = rng.uniform(2.0, 3.4)
        dr.ellipse([px - rr, py - rr, px + rr, py + rr], fill=(72, 62, 44, 190))


def draw_hills(dr, g, rng):
    """陆上山形符号：只撒在四邻皆陆的内陆格，避免压到海岸线"""
    for y in range(1, ROWS - 1):
        for x in range(1, COLS - 1):
            if g[y][x] != "#":
                continue
            if not all(g[y + dy][x + dx] == "#" for dy, dx in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1))):
                continue
            if rng.random() > 0.42:
                continue
            for _ in range(rng.randint(1, 2)):
                cx = (x + 0.18 + rng.random() * 0.64) / COLS * W
                cy = (y + 0.20 + rng.random() * 0.60) / ROWS * H
                s = rng.uniform(7, 14)
                ink = (132, 108, 74, rng.randint(66, 104))
                dr.line([cx - s, cy + s * 0.46, cx, cy - s * 0.52], fill=ink, width=2)
                dr.line([cx, cy - s * 0.52, cx + s, cy + s * 0.46], fill=ink, width=2)
                dr.line([cx - s * 0.40, cy + s * 0.44, cx - s * 0.06, cy + s * 0.04], fill=(132, 108, 74, 70), width=1)


def decorate(base, g, islands, seas):
    lyr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(lyr)
    for i in range(1, 10):
        x = W * i / 10
        dr.line([x, 0, x, H], fill=(232, 214, 172, 24 if i % 5 else 40), width=1)
        y = H * i / 10
        dr.line([0, y, W, y], fill=(232, 214, 172, 24 if i % 5 else 40), width=1)
    rng = random.Random(20261114)
    draw_hills(dr, g, rng)
    for isl in islands:
        draw_island_overlay(dr, (isl["gx"] + 0.5) / COLS * W, (isl["gy"] + 0.5) / ROWS * H, CELL * 0.68, rng)
    draw_compass(dr, W * 0.685, H * 0.565, 80)
    fs = font(31, True)
    for s in seas:
        cx, cy = (s["x"] + 0.5) / COLS * W, (s["y"] + 0.5) / ROWS * H
        txt = " ".join(s["label"])
        b = dr.textbbox((0, 0), txt, font=fs)
        dr.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2), txt, font=fs, fill=(240, 230, 202, 64))
    m = 26
    dr.rectangle([m, m, W - m, H - m], outline=(206, 182, 132, 110), width=3)
    dr.rectangle([m + 12, m + 12, W - m - 12, H - m - 12], outline=(206, 182, 132, 56), width=1)
    for i in range(0, 101, 5):
        x = m + (W - 2 * m) * i / 100
        dr.line([x, m, x, m + (13 if i % 10 else 21)], fill=(206, 182, 132, 100), width=2)
        dr.line([x, H - m, x, H - m - (13 if i % 10 else 21)], fill=(206, 182, 132, 100), width=2)
    ft, fsm = font(44, True), font(19)
    title = "奥 德 赛 · 地 中 海"
    b = dr.textbbox((0, 0), title, font=ft)
    dr.text((W / 2 - (b[2] - b[0]) / 2, m + 18), title, font=ft, fill=(238, 224, 186, 190))
    b = dr.textbbox((0, 0), "THE WANDERING SEA", font=fsm)
    dr.text((W / 2 - (b[2] - b[0]) / 2, m + 76), "THE WANDERING SEA", font=fsm, fill=(222, 204, 162, 120))

    out = Image.alpha_composite(base.convert("RGBA"), lyr).convert("RGB")
    arr = np.clip(np.asarray(out, np.float32) + NRNG.normal(0, 4.0, (H, W, 1)).astype(np.float32), 0, 255)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - 0.20 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    arr *= np.clip(v, 0.6, 1)[..., None]
    return Image.fromarray(arr.astype(np.uint8))


def main():
    rng = random.Random(20261114)
    g = load_grid()
    islands, seas = load_islands(), load_seas()
    assert_water(g, islands, load_currents())
    if "--ascii" in sys.argv:
        print(ascii_map(g))
        print("\nislands:", [(i["name"], i["gx"], i["gy"], g[i["gy"]][i["gx"]]) for i in islands])
        return
    base = build_terrain(g, islands)
    img = decorate(base, g, islands, seas)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, quality=90, optimize=True)
    print(f"seamap -> {OUT}  {img.size[0]}x{img.size[1]}  {OUT.stat().st_size/1024:.0f}KB")


if __name__ == "__main__":
    main()
