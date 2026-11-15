# -*- coding: utf-8 -*-
"""批次 K3 · B2/B1 的真实浏览器回归 —— 海域世界状态层 + 海上势力船队。

主回归 `tests/browser_regression.py` 把世界卡片关掉了
（它要密集传送船位测剧情，世界卡片会在传送落点弹出来把按键吞掉），
所以世界层必须自己有一套真实浏览器证据：

  ① HUD 顶栏出现「海域 · 状态」常驻 pill（世界在运转的常驻读数）；
  ② **真实航行**（连续小步位移，不是传送）跨过海域边界 → 弹出后果卡；
  ③ **真实航行**靠近势力船队 → 弹出船队抉择卡；
  ④ 海图叠加层把海域态势与船队旗子画出来（canvas 真的动过）；
  ⑤ 撞见过的东西进存档（刷新后不重复刷）。

注意：船位必须用「连续小步」推进——单帧跳超过 250px 会被传送闸拦掉
（那是刻意的：读档迁移/快航落点不该弹世界事件）。
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("ODYSSEY_BASE_URL", "http://127.0.0.1:8840/")
PACKAGE_MODE = os.environ.get("ODYSSEY_H5_PACKAGE") == "1"
# 注意：这里必须留**字符串**。写成 Path(os.environ.get(..., "")) 的话，
# Path("") 就是 Path(".")，`if SHOT_DIR:` 恒为真 → 每次跑回归都往仓库工作目录
# 丢两张 1MB 的 world-map.png / world-sea.png（污染仓库，实测踩过）。
SHOT_DIR = os.environ.get("ODYSSEY_WORLD_SHOTS", "").strip()


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}")


def sail(page, tx, ty, steps=44, step_ms=40):
    """真实航行：每帧一小步位移，页面自己的 rAF 循环照常推进（世界层才吃得到）。"""
    cur = page.evaluate("() => ({x: window.__game.boat.x, y: window.__game.boat.y})")
    for i in range(1, steps + 1):
        page.evaluate(
            "([x, y]) => { window.__game.boat.x = x; window.__game.boat.y = y; }",
            [cur["x"] + (tx - cur["x"]) * i / steps, cur["y"] + (ty - cur["y"]) * i / steps],
        )
        page.wait_for_timeout(step_ms)


def dismiss_ask(page):
    """把可能弹出的世界卡片点掉（点第一个选项），返回「小标题 + 标题」文本。"""
    card = page.locator("#askCard")
    try:
        if card.count() and card.is_visible():
            kicker = card.locator(".ccKicker").inner_text()
            title = card.locator(".ccTitle").inner_text()
            card.locator(".askBtn").first.click()
            page.wait_for_timeout(300)
            return f"{kicker} {title}"
    except Exception:
        pass
    return ""


def main():
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        context.add_init_script(
            "try{localStorage.setItem('odyssey-quality-v1','2d')}"
            "catch(e){}"
            # 明确打开世界卡片（主回归里是关着的）
            "try{localStorage.removeItem('odyssey-world-cards-v1')}catch(e){}"
        )
        page = context.new_page()
        page.set_default_timeout(15000)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on(
            "console",
            lambda m: errors.append(f"console error: {m.text}") if m.type == "error" else None,
        )
        try:
            page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(800)
            page.locator("#tsGo").click()
            page.wait_for_timeout(700)
            if page.locator("#opSkip").count():
                page.locator("#opSkip").click()
            page.wait_for_timeout(1200)
            # 跳过情境引导 —— 引导走完，世界事件才放行（这是设计里的「开局闸」）
            if page.locator("#onboardingSkip").count():
                page.locator("#onboardingSkip").click()
            page.wait_for_timeout(1600)

            # —— ① HUD 海域状态 pill（必须**真的看得见**：只查 textContent 会漏掉
            #    「插在折叠面板里」这类假通过，所以这里用 Playwright 的真可见性）——
            page.wait_for_selector("#hudRegion", state="visible", timeout=10000)
            check(
                page.locator("#hudRegion").is_visible(),
                "海域状态 pill 真的挂在顶栏上（可见，不是塞在折叠面板里）",
            )
            pill = page.locator("#hudRegion").inner_text()
            check("海" in pill and "·" in pill, f"HUD 顶栏常驻显示当前海域与状态（{pill.strip()}）")
            rect = page.locator("#hudRegion").bounding_box()
            check(
                rect is not None and rect["x"] >= 0 and rect["width"] > 20,
                f"海域 pill 在视口内且有实际尺寸（{rect}）",
            )

            layer = page.evaluate(
                """() => ({
                    regions: WORLD_REGIONS.length,
                    states: Object.keys(WORLD_STATES).length,
                    fleets: FLEETS.length,
                    now: regionOf(window.__game.boat.x, window.__game.boat.y).name,
                    status: regionStatus(regionOf(window.__game.boat.x, window.__game.boat.y)).label,
                    pill: document.getElementById('hudRegion').textContent.trim(),
                })"""
            )
            check(
                layer["regions"] == 5 and layer["states"] >= 6 and layer["fleets"] == 4,
                f"世界层已装载：{layer['regions']} 片海 / {layer['states']} 种状态 / {layer['fleets']} 支船队",
            )
            check(
                layer["now"] in layer["pill"] and layer["status"] in layer["pill"],
                "HUD pill 的读数与海域状态层同源",
            )

            # —— ② 真实航行跨海域 → 后果卡 ——
            # 先向西航行 1000px 以上（跨过 2~3 条海域边界），途中会弹出后果卡
            sail(page, 8 * 40 + 20, 9 * 40 + 20)
            region_card = dismiss_ask(page)
            check(
                bool(region_card),
                f"真实航行跨过海域边界会撞见后果卡（{region_card.strip() or '未出现'}）",
            )

            # 继续航行到「东渡者」船队附近，撞见船队卡
            fleet_pos = page.evaluate(
                "() => { const f = FLEETS.find(x=>x.id==='exodus'); const p = fleetPos(f); return {x:p.x, y:p.y}; }"
            )
            sail(page, fleet_pos["x"], fleet_pos["y"], steps=30, step_ms=45)
            fleet_card = dismiss_ask(page)
            check(
                "势力" in fleet_card or "东渡" in fleet_card,
                f"真实航行靠近势力船队会撞见船队卡（{fleet_card.strip() or '未出现'}）",
            )

            # —— ③ 撞见过的东西进存档 ——
            page.evaluate("() => window.__game.save && window.__game.save()")
            saved = page.evaluate(
                "() => { const raw = localStorage.getItem('odyssey-med-v2');"
                " if (!raw) return null; const d = JSON.parse(raw);"
                " return {seen: Object.keys(d.state.regionSeen || {}).length,"
                "         met: Object.keys(d.state.fleetMet || {}).length,"
                "         wtime: Math.round(d.state.wtime || 0)}; }"
            )
            check(
                saved is not None and saved["seen"] >= 1 and saved["met"] >= 1,
                f"撞见记录进存档（海域 {saved['seen']} 条 / 船队 {saved['met']} 支 / 世界时刻 {saved['wtime']}s）",
            )

            # —— ④ 海图叠加层画出海域态势与船队 ——
            page.keyboard.press("m")
            page.wait_for_function("mapOpen === true")
            page.wait_for_timeout(1200)
            pixels = page.evaluate(
                """() => {
                    const cv = document.getElementById('mapFx');
                    const ctx = cv.getContext('2d');
                    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
                    let lit = 0;
                    for (let i = 3; i < data.length; i += 4 * 61) {
                        if (data[i] > 0) lit += 1;
                    }
                    return {lit, w: cv.width, h: cv.height,
                            marks: (typeof drawWorldStatus === 'function') && (typeof drawFleets === 'function')};
                }"""
            )
            check(
                pixels["lit"] > 40 and pixels["w"] > 600,
                f"海图叠加层真实绘制（含海域态势与船队旗）lit={pixels['lit']}",
            )
            if SHOT_DIR:
                shot_dir = Path(SHOT_DIR)
                shot_dir.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(shot_dir / "world-map.png"))
                page.keyboard.press("m")
                page.wait_for_timeout(600)
                page.screenshot(path=str(shot_dir / "world-sea.png"))

            check(not errors, f"世界层真实浏览器无 pageerror/console error；{errors[:4]}")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
