#!/usr/bin/env python3
"""世界网格闸门 —— 岛距/坐标一改就必须在提交前跑这个。

**为什么需要它**：批次 K2 之前，可达性校验只存在于一个临时脚本
`.temp/verify_grid.js` 里，而且它还在读 `index.html`（`buildMediterranean()`
早已搬进 `src/data/constants.js`）——**脚本早就失效了，等于没有闸门**。
这轮要挪 13 个岛的坐标，必须有一台能在 CI 里跑的机器校验。

**查什么**（任一不过 → exit 1）：
  ① 13 个玩法岛坐标都落在**水格**上（不是陆地 '#'、不是礁石 'X'）；
  ② 13 个岛**从出生点 BFS 可达**（玩家真能开过去）；
  ③ 洋流线每一格都在水面上（洋流不能穿山）；
  ④ 硬编码钉子点（马里阿角 / 斯克里送行 / 奥吉吉亚出湾 / 特洛伊出海）也都在水面上；
  ⑤ 主线 12 段的**最短航段**不低于下限（防止某一段塌成「一步到」）；
  ⑤-b 出生点的**取景硬约束**：离每座岛 ≥ 180px（登陆半径）+ 南向 ≥ 2 格连续水 +
      北向 ≥ 4 格连续水（3D 相机固定在船南 4.25 格，南面 1 格是陆地就顶满画面下半屏）；
  ⑥ 岛距统计（min / 中位 / 均值 / 总长 / 最远两岛）打印出来，供人工比对。

用法：
  py -3 scripts/verify_world_grid.py            # 校验并打印统计
  py -3 scripts/verify_world_grid.py --min-leg 6   # 收紧最短航段下限
"""
import argparse
import math
import re
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONST = ROOT / "src" / "data" / "constants.js"
QUESTS = ROOT / "src" / "data" / "quests.js"
EVENTS = ROOT / "src" / "game" / "events.js"

COLS, ROWS = 46, 18
WTS = 40
SOLID = ("#", "X")


def parse_grid():
    """从 constants.js 的 buildMediterranean() 复刻网格（与 build_seamap.py 同源规则）。"""
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
    for m in re.finditer(r'cell\((\d+),(\d+)(?:,\s*"(.)\")?\)', block):
        put(int(m.group(1)), int(m.group(2)), m.group(3) or "#")
    for y in range(ROWS):
        for x in range(COLS):
            if g[y][x] == "~" and (x * 13 + y * 7) % 9 == 0:
                g[y][x] = "."
    return g


def parse_islands():
    src = CONST.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'\{gx:(\d+),\s*gy:(\d+),\s*name:"([^"]+)".*?scene:"([^"]+)"', src):
        out.append({
            "gx": int(m.group(1)), "gy": int(m.group(2)),
            "name": m.group(3), "scene": m.group(4),
        })
    return out


def parse_currents():
    src = CONST.read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'\{id:"([a-z]+)",\s*name:"[^"]+",\s*cells:\[(.*?)\]\}', src):
        cells = [(float(a), float(b)) for a, b in re.findall(r"\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]", m.group(2))]
        out.append((m.group(1), cells))
    return out


def parse_spawn():
    """出生点：从 quests.js 的 boat 初值反推网格坐标。

    写法是 `const boat = { x: 22*WTS+WTS/2, y: 11*WTS+WTS/2 }`，
    所以直接按「数字 * WTS (+ WTS/2)」的表达式求值。
    """
    src = QUESTS.read_text(encoding="utf-8")
    m = re.search(r"const\s+boat\s*=\s*\{\s*x:\s*([\d]+)\s*\*\s*WTS(?:\s*\+\s*WTS\s*/\s*2)?\s*,"
                  r"\s*y:\s*([\d]+)\s*\*\s*WTS(?:\s*\+\s*WTS\s*/\s*2)?\s*\}", src)
    if not m:
        return None
    return (float(m.group(1)) + 0.5, float(m.group(2)) + 0.5)


def parse_leg_seq():
    """主线航序真源：constants.js 的 LEG_SEQ（对象形式 {scene: 序号}）。"""
    src = CONST.read_text(encoding="utf-8")
    m = re.search(r"LEG_SEQ\s*=\s*\{(.*?)\}", src, re.S)
    if not m:
        return []
    pairs = re.findall(r"([a-z]+)\s*:\s*(\d+)", m.group(1))
    return [k for k, _ in sorted(pairs, key=lambda kv: int(kv[1]))]


def parse_fleet_routes():
    """船队航路：src/game/fleets.js 里 route:[[gx,gy],...]（世界网格坐标）。"""
    src = (ROOT / "src" / "game" / "fleets.js").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'id:"([a-z]+)"', src):
        fid = m.group(1)
        seg = src[m.end(): m.end() + 3000]
        rm = re.search(r"route:\[(\[[^\]]*\](?:\s*,\s*\[[^\]]*\])*)\]", seg, re.S)
        if not rm:
            continue
        pts = [(float(a), float(b)) for a, b in re.findall(r"\[([-\d.]+),\s*([-\d.]+)\]", rm.group(1))]
        if pts:
            out.append((fid, pts))
    return out


def parse_regions():
    """海域中心：B2 状态层的 WORLD_REGIONS（gx,gy）。"""
    src = (ROOT / "src" / "game" / "worldState.js").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'id:"([a-z]+)",\s*name:"([^"]+)",\s*site:"[^"]*",\s*gx:\s*([\d.]+),\s*gy:\s*([\d.]+)', src):
        out.append({"id": m.group(1), "name": m.group(2),
                    "gx": float(m.group(3)), "gy": float(m.group(4))})
    return out


def reachable(g, start):
    sx, sy = int(start[0]), int(start[1])
    if not (0 <= sx < COLS and 0 <= sy < ROWS):
        return set()
    seen = {(sx, sy)}
    dq = deque([(sx, sy)])
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if not (0 <= n[0] < COLS and 0 <= n[1] < ROWS) or n in seen:
                continue
            if g[n[1]][n[0]] in SOLID:
                continue
            seen.add(n)
            dq.append(n)
    return seen


def is_water(g, x, y):
    if not (0 <= int(x) < COLS and 0 <= int(y) < ROWS):
        return False
    return g[int(y)][int(x)] not in SOLID


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-leg", type=float, default=4.0,
                    help="主线最短航段的格数下限（默认 4）。"
                         "特洛伊→伊斯玛洛斯天然只有 4~5 格：两岛同在特洛伊海岸，剧情上必须相邻。")
    args = ap.parse_args()

    g = parse_grid()
    islands = parse_islands()
    currents = parse_currents()
    spawn = parse_spawn()
    errs = []

    if len(islands) != 13:
        errs.append("ISLANDS 解析到 %d 个（应为 13）——检查书写格式 {gx:N, gy:N, name:\"...\", ..., scene:\"...\"}"
                    % len(islands))
    if spawn is None:
        errs.append("出生点解析失败（quests.js 的 boat 初值）")

    reach = reachable(g, spawn) if spawn else set()

    print("== 世界网格闸门 ==")
    print("出生点：%s（格）  可达水格：%d / %d" % (spawn, len(reach), COLS * ROWS))

    print("\n[① 岛坐标落水]")
    for is_ in islands:
        ch = g[is_["gy"]][is_["gx"]] if (0 <= is_["gx"] < COLS and 0 <= is_["gy"] < ROWS) else "?"
        ok = is_water(g, is_["gx"], is_["gy"])
        if not ok:
            errs.append("岛「%s」(%d,%d) 落在 '%s' 上——不是水格" % (is_["name"], is_["gx"], is_["gy"], ch))
        print("  %-14s %-11s (%2d,%2d) '%s' %s" % (is_["name"], is_["scene"], is_["gx"], is_["gy"],
                                                  ch, "OK" if ok else "← 不是水格"))

    print("\n[② 岛从出生点可达]")
    for is_ in islands:
        ok = (is_["gx"], is_["gy"]) in reach
        if not ok:
            errs.append("岛「%s」(%d,%d) 从出生点不可达" % (is_["name"], is_["gx"], is_["gy"]))
        print("  %-14s %s" % (is_["name"], "可达" if ok else "← 不可达"))

    print("\n[③ 洋流不穿山]")
    for cid, cells in currents:
        for gx, gy in cells:
            if not is_water(g, gx, gy):
                errs.append("洋流 %s 的格 (%.1f,%.1f) 在陆地上" % (cid, gx, gy))
        print("  %-6s %d 格 %s" % (cid, len(cells),
                                  "OK" if all(is_water(g, a, b) for a, b in cells) else "← 有格在陆地"))

    print("\n[④ 离岛落点 / 硬编码钉子点落水]")
    # 离岛落点：批次 K2 起全部由 isleOff(scene, ox, oy) 从 ISLANDS 派生。
    # 这里用同一套偏移量复算一遍，确保「改坐标后落点仍落在水面上」。
    # 偏移量 = 原代码里相对格心的像素偏移，与代码一一对应。
    exits = [
        ("特洛伊出海", "troy", 0, 50),
        ("声之海峡离岛", "strait", 50, 40),
        ("太阳岛离岛", "sun", 46, 30),
        ("奥吉吉亚出湾", "ogggia", 40, -60),
        ("奥吉吉亚岛心", "ogggia", 0, 0),
        ("九天漂流落点", "ogggia", -100, -60),
        ("伊萨卡离岛", "ithaca", 40, 10),
        ("冥界离岛", "hades", 40, 0),
        ("风神岛离岛", "aeolia", -10, -10),
        ("埃阿亚离岛", "aia", 34, 54),
        ("斯克里送行", "scheria", 40, 30),
        ("斯克里近海", "scheria", 95, -15),
    ]
    lut = {i["scene"]: i for i in islands}
    for label, scene, ox, oy in exits:
        if scene not in lut:
            errs.append("落点「%s」引用了不存在的岛 scene=%s" % (label, scene))
            continue
        isl = lut[scene]
        px = isl["gx"] * WTS + WTS / 2 + ox
        py = isl["gy"] * WTS + WTS / 2 + oy
        ok = is_water(g, px / WTS, py / WTS)
        if not ok:
            errs.append("落点「%s」(%.0f,%.0f) 落在陆地上（岛 %s @ %d,%d）"
                        % (label, px, py, scene, isl["gx"], isl["gy"]))
        print("  %-18s %-10s px=(%4.0f,%4.0f) 格=(%5.2f,%5.2f) %s"
              % (label, scene, px, py, px / WTS, py / WTS, "OK" if ok else "← 在陆地"))
    # 独立钉子点（不跟随岛）
    pins = [
        ("马里阿角 MALEA_SPOT", (19.5, 10.5)),
        ("出生点", spawn),
    ]
    for label, (gx, gy) in pins:
        if gx is None:
            continue
        ok = is_water(g, gx, gy)
        if not ok:
            errs.append("钉子点「%s」(%.2f,%.2f) 在陆地上" % (label, gx, gy))
        print("  %-18s %-10s 格=(%5.2f,%5.2f) %s" % (label, "", gx, gy, "OK" if ok else "← 在陆地"))

    print("\n[⑤ 出生点周边：180px 登陆半径内不能有别的岛]")
    # islandNear() 的判定半径是 180px（WTS40 → 4.5 格）。出生点若落在某岛的
    # 登陆圈里，开局第一秒就能登错岛，简报也会被「近岛优先」抢走主线目标。
    LAND_R = 180.0
    sx, sy = spawn
    near = []
    for is_ in islands:
        d = math.hypot((is_["gx"] + 0.5 - sx) * WTS, (is_["gy"] + 0.5 - sy) * WTS)
        near.append((d, is_["name"]))
    near.sort()
    for d, nm in near[:4]:
        print("  最近 %-14s %6.0f px%s" % (nm, d, "  ← 在登陆圈内！" if d < LAND_R else ""))
    if near and near[0][0] < LAND_R:
        errs.append("出生点离「%s」只有 %.0fpx（< %d 登陆半径）——开局就能登错岛"
                    % (near[0][1], near[0][0], int(LAND_R)))
    if near and near[0][1] != "特洛伊海岸" and near[0][0] < 2 * LAND_R:
        print("  ↳ 提示：出生点最近的岛是「%s」，不是主线第一站「特洛伊海岸」" % near[0][1])

    print("\n[⑤-b 出生点取景：南向开阔 + 北向开阔]")
    # 3D 相机固定在船南 4.25 格、俯角 24°（world3d.js 的 _camTarget/lookAt），
    # 画面下缘落在「船南 0.7~1.5 格」这一条水带上——测试 h5_3d_browser.py 的
    # 「白天海面是蓝的」取的就是这条带。
    # 推论（实测 .temp/spawn-probe/cur-35-12.png 证实）：
    #   · 出生点南面第 1 格是陆地 → 岸顶满画面下半屏，海带被判成土黄（3D 回归红）；
    #   · 南面第 2 格是陆地 → 岸退到镜头下缘之外，只在下沿留一条沙带（可接受）；
    #   · 南面第 3 格起 → 岸完全在镜头背后，画面下缘全是海。
    # 所以「南向至少 2 格连续水」是出生点的硬约束。
    gx0, gy0 = int(spawn[0]), int(spawn[1])
    south = 0
    for k in range(1, 15):
        if is_water(g, gx0, gy0 + k):
            south += 1
        else:
            break
    north = 0
    for k in range(1, 15):
        if is_water(g, gx0, gy0 - k):
            north += 1
        else:
            break
    print("  南向连续水 %d 格（需 ≥2：3D 镜头下缘在船南 0.7~1.5 格）" % south)
    print("  北向连续水 %d 格（需 ≥4：镜头前方要留出开阔中景）" % north)
    if south < 2:
        errs.append("出生点南向只有 %d 格连续水（<2）——3D 相机固定在船南 4.25 格，"
                    "岸会顶满画面下半屏，白天海面读成土黄（批次 K2 实测踩过）" % south)
    if north < 4:
        errs.append("出生点北向只有 %d 格连续水（<4）——镜头前方中景太空，开局一眼是空海" % north)

    print("\n[⑥ 主线航段距离]")
    # 主线顺序真源 = constants.js 的 LEG_SEQ（对象）；malea 是序章海角而非岛，单独取钉子坐标
    order = []
    lut = {i["scene"]: i for i in islands}
    malea = (19.5, 10.5)
    for scene in parse_leg_seq():
        if scene in lut:
            order.append(lut[scene])
        elif scene == "malea":
            order.append({"name": "马里阿角", "scene": "malea", "gx": malea[0], "gy": malea[1]})
    if not order:
        order = sorted(islands, key=lambda i: i.get("leg", 0))
    legs = []
    for a, b in zip(order, order[1:]):
        d = math.hypot(a["gx"] - b["gx"], a["gy"] - b["gy"])
        legs.append(d)
        print("  %-14s → %-14s %6.2f 格  (%4.0f px)" % (a["name"], b["name"], d, d * WTS))
    if legs:
        mn = min(legs)
        if mn < args.min_leg:
            errs.append("最短航段 %.2f 格 < 下限 %.2f 格（有一段塌成「一步到」）" % (mn, args.min_leg))
        print("\n[⑦ 统计] min=%.2f 中位=%.2f 均值=%.2f 合计=%.1f 格 (%.0f px)" % (
            mn, sorted(legs)[len(legs) // 2], sum(legs) / len(legs), sum(legs), sum(legs) * WTS))
        far = 0.0
        for i, a in enumerate(order):
            for b in order[i + 1:]:
                far = max(far, math.hypot(a["gx"] - b["gx"], a["gy"] - b["gy"]))
        print("  最远两岛 = %.1f 格 (%.0f px)；世界全宽 = %d px" % (far, far * WTS, COLS * WTS))

    print("\n[⑧ 批次 K3：海域状态层 + 势力船队]")
    regions = parse_regions()
    if len(regions) != 5:
        errs.append("worldState.js 解析到 %d 个海域（应为 5）" % len(regions))
    for r in regions:
        ok = is_water(g, r["gx"], r["gy"])
        if not ok:
            errs.append("海域「%s」中心 (%.1f,%.1f) 在陆地上" % (r["name"], r["gx"], r["gy"]))
        print("  %-12s 中心(%5.1f,%5.1f) %s" % (r["name"], r["gx"], r["gy"], "OK" if ok else "← 在陆地"))
    routes = parse_fleet_routes()
    if len(routes) != 4:
        errs.append("fleets.js 解析到 %d 支船队（应为 4）" % len(routes))
    for fid, pts in routes:
        bad = [p for p in pts if not is_water(g, p[0], p[1])]
        if bad:
            errs.append("船队 %s 的航路点 %s 落在陆地上" % (fid, bad))
        print("  %-10s %2d 个航路点 %s" % (fid, len(pts), "OK" if not bad else "← 有点在陆地 " + str(bad)))

    print("\n== 结论 ==")
    if errs:
        print("不通过 %d 项：" % len(errs))
        for e in errs:
            print("  [!!] " + e)
        sys.exit(1)
    print("世界网格闸门通过。")


if __name__ == "__main__":
    main()
