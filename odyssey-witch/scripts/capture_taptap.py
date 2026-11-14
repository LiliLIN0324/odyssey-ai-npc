#!/usr/bin/env python3
"""用正式 H5 包生成 TapTap 静态物料、真实 Chrome 截图与核心循环录屏。"""

import argparse
import hashlib
import json
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release/taptap"
DIST = ROOT / "dist/odyssey-h5"
INK = (5, 17, 27)
TERRA = (164, 73, 54)
GOLD = (216, 165, 74)
PARCHMENT = (239, 227, 202)
TITLE = "奥德赛·地中海"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(size, serif=True):
    name = "simsun.ttc" if serif else "msyh.ttc"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def cover_crop(source, size, focus=(0.5, 0.5), trim_watermark=True):
    image = Image.open(source).convert("RGB")
    if trim_watermark:
        image = image.crop((0, 0, image.width, round(image.height * 0.88)))
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
    )
    left = round((resized.width - size[0]) * focus[0])
    top = round((resized.height - size[1]) * focus[1])
    return resized.crop((left, top, left + size[0], top + size[1]))


def grade(image, strength=0.18, top_shadow=0.0, bottom_shadow=0.0):
    image = Image.blend(image.convert("RGB"), Image.new("RGB", image.size, INK), strength).convert("RGBA")
    if top_shadow or bottom_shadow:
        gradient = Image.new("RGBA", (1, image.height))
        pixels = []
        for y in range(image.height):
            p = y / max(1, image.height - 1)
            top = top_shadow * max(0.0, 1.0 - p * 2.2)
            bottom = bottom_shadow * max(0.0, (p - 0.55) / 0.45)
            pixels.append((INK[0], INK[1], INK[2], round(255 * min(0.9, top + bottom))))
        gradient.putdata(pixels)
        image = Image.alpha_composite(image, gradient.resize(image.size))
    return image


def centered_title(image, y, size):
    draw = ImageDraw.Draw(image)
    title_font = font(size)
    box = draw.textbbox((0, 0), TITLE, font=title_font, stroke_width=1)
    width = box[2] - box[0]
    x = (image.width - width) // 2
    draw.text(
        (x + 2, y + 3), TITLE, font=title_font, fill=(0, 0, 0, 150),
        stroke_width=2, stroke_fill=(0, 0, 0, 100),
    )
    draw.text(
        (x, y), TITLE, font=title_font, fill=(*PARCHMENT, 255),
        stroke_width=1, stroke_fill=(*GOLD, 230),
    )
    line_y = y + size + 30
    half = min(image.width // 4, width // 2 + 30)
    draw.line((image.width // 2 - half, line_y, image.width // 2 - 18, line_y), fill=(*GOLD, 190), width=2)
    draw.line((image.width // 2 + 18, line_y, image.width // 2 + half, line_y), fill=(*GOLD, 190), width=2)
    draw.polygon(
        [(image.width // 2, line_y - 6), (image.width // 2 + 6, line_y),
         (image.width // 2, line_y + 6), (image.width // 2 - 6, line_y)],
        fill=(*TERRA, 255),
    )


def save_jpg(image, name, quality=92):
    path = OUT / name
    image.convert("RGB").save(path, "JPEG", quality=quality, subsampling=0, optimize=True)
    return path


def make_static_assets():
    OUT.mkdir(parents=True, exist_ok=True)
    badge = Image.open(ROOT / "concept-art/brand/03-奥德赛徽章.jpg").convert("RGB")
    # 原图右下角有生成标记；此裁切完整保留徽章并排除该角落。
    icon = badge.crop((220, 200, 1800, 1780)).resize((512, 512), Image.Resampling.LANCZOS)
    icon.save(OUT / "icon-512.png", "PNG", optimize=True)

    logo = Image.new("RGBA", (1280, 320), (0, 0, 0, 0))
    emblem = badge.crop((250, 240, 1770, 1760)).resize((240, 240), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (240, 240), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, 238, 238), fill=255)
    logo.paste(emblem, (38, 40), mask)
    draw = ImageDraw.Draw(logo)
    draw.text((322, 62), TITLE, font=font(106), fill=(*PARCHMENT, 255), stroke_width=1, stroke_fill=(*GOLD, 220))
    draw.line((326, 224, 1180, 224), fill=(*GOLD, 190), width=2)
    draw.rectangle((326, 216, 344, 232), fill=(*TERRA, 255))
    logo.save(OUT / "logo-1280.png", "PNG", optimize=True)

    horizontal = grade(cover_crop(ROOT / "concept-art/01-序章漂流.jpg", (460, 215)), 0.23, 0.35, 0.5)
    centered_title(horizontal, 65, 38)
    save_jpg(horizontal, "cover-460x215.jpg")

    vertical = grade(
        cover_crop(ROOT / "concept-art/brand/01-IP无名旅人.jpg", (600, 900), focus=(0.5, 0.3)),
        0.15, 0.72, 0.38,
    )
    centered_title(vertical, 58, 53)
    save_jpg(vertical, "cover-600x900.jpg")

    wallpaper = grade(cover_crop(ROOT / "concept-art/09-伊萨卡.jpg", (3840, 1240)), 0.18)
    save_jpg(wallpaper, "wallpaper-3840x1240.jpg", quality=91)

    promo = grade(cover_crop(ROOT / "concept-art/03-斯库拉海峡.jpg", (1920, 1080)), 0.18, 0.68, 0.24)
    centered_title(promo, 72, 90)
    save_jpg(promo, "promo-1920x1080.jpg")

    promo_wide = grade(cover_crop(ROOT / "concept-art/09-伊萨卡.jpg", (1920, 1080)), 0.12)
    save_jpg(promo_wide, "promo-no-logo-1920x1080.jpg")

    promo_tall = grade(
        cover_crop(ROOT / "concept-art/characters/02-喀耳刻.jpg", (720, 1080), focus=(0.5, 0.28)),
        0.15, 0.12, 0.3,
    )
    save_jpg(promo_tall, "promo-no-logo-720x1080.jpg")


@contextmanager
def packaged_server():
    subprocess.run([sys.executable, "scripts/build_h5.py"], cwd=ROOT, check=True)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, "scripts/serve_h5.py", "--root", str(DIST), "--port", str(port)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    base = f"http://127.0.0.1:{port}/"
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read())
            try:
                with urllib.request.urlopen(base + "api/health", timeout=0.3) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError("H5 静态服务启动超时")
        yield base
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def stage_landfall(page):
    page.evaluate(
        """() => {
            const G = window.__game;
            G.setScene('world');
            Object.assign(G.state, {openingBeat: 3, freeSail: false});
            const troy = ISLANDS.find(island => island.scene === 'troy');
            G.boat.x = troy.gx * WTS + WTS / 2;
            G.boat.y = troy.gy * WTS + WTS / 2 + 100;
        }"""
    )
    page.wait_for_function("document.getElementById('landfallBrief').classList.contains('show')")


def stage_storm(page):
    found = page.evaluate(
        """() => {
            const G = window.__game;
            G.setScene('world');
            Object.assign(G.state, {
                openingBeat: 3, freeSail: false, seaThreshold: 55,
                seaEncCount: 0, seaEncDone: {}, seaLastEnc: null, maleaDone: true,
            });
            const grid = G.worldGrid();
            const size = G.worldTileSize();
            let best = null;
            for (let y = 1; y < grid.length - 1; y++) {
                for (let x = 1; x < grid[y].length - 9; x++) {
                    let clear = true;
                    for (let i = 0; i < 9 && clear; i++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (['#', 'X', 'G'].includes(grid[y + dy][x + i])) {
                                clear = false;
                                break;
                            }
                        }
                    }
                    if (!clear) continue;
                    const seed = (((x + 1) * 73856093) ^ (y * 19349663)) >>> 0;
                    if (G.SEA_ENCOUNTS[seed % G.SEA_ENCOUNTS.length].id !== 'storm') continue;
                    const triggerPX = x * size + size / 2 + 55;
                    const triggerPY = y * size + size / 2;
                    const clearance = Math.min(...ISLANDS.map(island => Math.hypot(
                        triggerPX - (island.gx * size + size / 2),
                        triggerPY - (island.gy * size + size / 2)
                    )));
                    if (!best || clearance > best.clearance) best = {x, y, clearance};
                }
            }
            if (!best) return false;
            G.boat.x = best.x * size + size / 2;
            G.boat.y = best.y * size + size / 2;
            return best.clearance;
        }"""
    )
    if not found:
        raise AssertionError("未找到可真实航行触发的风暴水域")
    page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")


def stage_map(page):
    """真实海图：已访航迹 / 抉择回声 / 海面事件 / 迷雾航路 / 航迹回看全部点亮。"""
    page.evaluate(
        """() => {
            const G = window.__game;
            G.setScene('world');
            const visited = [
                'troy', 'ismaros', 'lotus', 'cyclops', 'telepylos',
                'aeolia', 'strait', 'sun', 'ogggia',
            ];
            const byScene = {};
            ISLANDS.forEach(is => { byScene[is.scene] = is; });
            G.state.legs = {};
            G.state.trail = [];
            visited.forEach((k, i) => {
                const is = byScene[k];
                if (!is) return;
                G.state.legs[k] = 1;
                G.state.trail.push({k, leg: is.leg, t: i * 70 + 40});
            });
            Object.assign(G.state, {
                troyDone: true, ismarosDone: true, lotusDone: true,
                cyclopsDone: true, telepylosDone: true, aeoliaDone: true,
                prophecy: 'long', straitStage: 0, straitCleared: false,
                seaRoute: 'mist',
                decisions: {
                    troy_fire: '烧了城',
                    ismaros_plunder: '留下救治',
                    lotus_fruit: '不碰莲子',
                    cyclops_name: '报了假名「无人」',
                    telepylos_ship: '留下最后一条船',
                    aeolia_winds: '没有打开风袋',
                    calypso: '造木筏',
                },
                seaEchoes: [
                    {id: 'storm', name: '风暴', x: 38, y: 31, t: 80},
                    {id: 'headwind', name: '逆风', x: 55, y: 41, t: 160},
                    {id: 'wreckboat', name: '遇难小艇', x: 66, y: 58, t: 240},
                    {id: 'dolphin', name: '海豚群', x: 81, y: 37, t: 320},
                ],
            });
            G.state.quests = G.state.quests || {};
            G.state.quests.witch_grass = {
                id: 'witch_grass', name: '玛草', have: 3, need: 3, done: true,
            };
            if (typeof buildMapMarks === 'function') buildMapMarks();
        }"""
    )
    page.keyboard.press("m")
    page.wait_for_function("mapOpen === true")
    page.wait_for_timeout(900)
    page.evaluate("() => window.WorldMap.focus(34, 49, 1.82)")
    page.wait_for_timeout(600)
    page.locator("#mzTrail").click()
    page.wait_for_timeout(3200)


def capture_gameplay(browser, base):
    screenshots = OUT / "screenshots"
    screenshots.mkdir(parents=True, exist_ok=True)
    errors = []
    with tempfile.TemporaryDirectory(prefix="odyssey-taptap-video-", ignore_cleanup_errors=True) as temp:
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=1,
            record_video_dir=temp,
            record_video_size={"width": 1280, "height": 720},
        )
        context.add_init_script("localStorage.setItem('odyssey-quality-v1', '2d');")

        def guard(route):
            url = route.request.url
            if url.startswith(("http://", "https://")) and urlsplit(url).netloc != urlsplit(base).netloc:
                errors.append(f"外部资源请求: {url}")
                route.abort()
            else:
                route.continue_()

        context.route("**/*", guard)
        page = context.new_page()
        page.set_default_timeout(12000)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.on("console", lambda message: errors.append(f"console error: {message.text}") if message.type == "error" else None)
        page.on("response", lambda response: errors.append(f"HTTP {response.status}: {response.url}") if response.status >= 400 else None)
        page.goto(base, wait_until="networkidle", timeout=45000)
        page.wait_for_timeout(2000)
        page.locator("#tsGo").click()
        page.locator("#opSkip").click()
        page.locator("#onboardingSkip").click()

        stage_landfall(page)
        page.wait_for_timeout(3000)
        page.screenshot(path=str(screenshots / "01-landfall.png"))

        page.keyboard.press("e")
        page.wait_for_function("window.__game.getScene() === 'troy'")
        page.wait_for_timeout(1800)
        page.keyboard.press("Escape")
        page.wait_for_function("chapterOn === false")
        page.keyboard.down("d")
        page.wait_for_timeout(650)
        page.keyboard.up("d")
        page.keyboard.down("w")
        page.wait_for_timeout(450)
        page.keyboard.up("w")
        page.wait_for_timeout(2050)
        page.screenshot(path=str(screenshots / "02-troy.png"))

        stage_storm(page)
        page.keyboard.down("d")
        try:
            page.wait_for_function("window.__game.state.seaEncCount === 1", timeout=8000)
        finally:
            page.keyboard.up("d")
        page.wait_for_selector("#askCard", state="visible")
        page.wait_for_timeout(3000)
        page.screenshot(path=str(screenshots / "03-storm-choice.png"))

        page.locator("#askCard .askBtn").first.click()
        page.wait_for_function("window.__game.state.choiceLog.length === 1")
        page.wait_for_selector("#choiceReceipt", state="visible")
        page.keyboard.press("q")
        page.wait_for_function("document.getElementById('questPanel').style.display === 'block'")
        page.wait_for_function("!document.getElementById('landfallBrief').classList.contains('show')")
        page.wait_for_timeout(3000)
        page.screenshot(path=str(screenshots / "04-choice-receipt.png"))

        page.evaluate("() => { crewLedgerLight(); window.__game.renderQuests(); }")
        page.locator("#questCrewTab").click()
        page.wait_for_timeout(3000)
        page.screenshot(path=str(screenshots / "05-named-crew.png"))

        page.keyboard.press("q")
        page.wait_for_function("document.getElementById('questPanel').style.display !== 'block'")
        stage_map(page)
        page.screenshot(path=str(screenshots / "06-sea-chart.png"))
        page.keyboard.press("Escape")
        page.wait_for_function("mapOpen === false")
        page.wait_for_timeout(1200)

        video = page.video
        context.close()
        raw_video = Path(temp) / "gameplay.webm"
        video.save_as(str(raw_video))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw_video), "-an",
             "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "medium",
             "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT / "gameplay.mp4")],
            cwd=ROOT, check=True,
        )
    if errors:
        raise AssertionError("实机素材捕获出现浏览器错误：\n" + "\n".join(errors))


def asset(kind, name, source, caption=None):
    path = OUT / name
    item = {
        "kind": kind,
        "path": name.replace("\\", "/"),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "source": source,
    }
    if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        with Image.open(path) as image:
            item["width"], item["height"] = image.size
    if caption:
        item["caption"] = caption
    return item


def write_manifest():
    static = [
        ("icon", "icon-512.png", "original-concept-art"),
        ("logo", "logo-1280.png", "original-concept-art"),
        ("cover", "cover-460x215.jpg", "original-concept-art"),
        ("cover", "cover-600x900.jpg", "original-concept-art"),
        ("wallpaper", "wallpaper-3840x1240.jpg", "original-concept-art"),
        ("promo", "promo-1920x1080.jpg", "original-concept-art"),
        ("promo", "promo-no-logo-1920x1080.jpg", "original-concept-art"),
        ("promo", "promo-no-logo-720x1080.jpg", "original-concept-art"),
    ]
    shots = [
        ("screenshots/01-landfall.png", "世界航行与特洛伊靠岸简报：先亮明赌注、回报和登陆行动"),
        ("screenshots/02-troy.png", "特洛伊岛内真实移动与探索"),
        ("screenshots/03-storm-choice.png", "真实键盘航行触发的主航程风暴抉择"),
        ("screenshots/04-choice-receipt.png", "风暴选择后的真实结算回执与航海日志抉择记录"),
        ("screenshots/05-named-crew.png", "十二人具名船员名册与各自职责"),
        ("screenshots/06-sea-chart.png", "可缩放世界海图：真实航迹回看、洋流、抉择回声与迷雾航路"),
    ]
    assets = [asset(kind, name, source) for kind, name, source in static]
    assets.extend(asset("screenshot", name, "real-chrome-gameplay", caption) for name, caption in shots)
    video = asset("video", "gameplay.mp4", "real-chrome-gameplay", "航行、靠岸、岛内移动、风暴抉择、结算与名册的连续实机录屏")
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,width,height:format=duration", "-of", "json", str(OUT / "gameplay.mp4")],
        check=True, capture_output=True, text=True,
    )
    info = json.loads(probe.stdout)
    video.update({
        "codec": info["streams"][0]["codec_name"],
        "width": info["streams"][0]["width"],
        "height": info["streams"][0]["height"],
        "duration": float(info["format"]["duration"]),
    })
    assets.append(video)
    manifest = {
        "format": "odyssey-taptap-material-v1",
        "visualLanguage": "爱琴海夜色：深墨蓝、陶土红、金箔",
        "capturedWith": "Google Chrome / Playwright，正式 H5 构建，1280×720",
        "submission": {
            "status": "not_submitted",
            "storeCreated": False,
            "reviewSubmitted": False,
            "published": False,
            "note": "仅准备本地物料；未创建商店页面、未提审、未上架。",
        },
        "assets": assets,
    }
    (OUT / "material-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="可选：对已经运行的 H5 地址捕获；默认重新构建并启动独立包")
    args = parser.parse_args()
    make_static_assets()
    print("PASS TapTap 静态图片物料", flush=True)
    if args.base_url:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
            try:
                capture_gameplay(browser, args.base_url)
            finally:
                browser.close()
    else:
        with packaged_server() as base, sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chrome", headless=True)
            try:
                capture_gameplay(browser, base)
            finally:
                browser.close()
    write_manifest()
    print(f"PASS TapTap 实机截图、录屏与清单：{OUT}", flush=True)


if __name__ == "__main__":
    main()
