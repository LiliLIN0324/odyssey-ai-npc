# -*- coding: utf-8 -*-
"""**整局游戏**的 API 扫描验收：多 NPC、多意图类型、真结算。

与 `tests/h5_agent_browser.py`（女巫 + 买药 + 一句台词）互补：
那一个守住「Agent 接上真模型时是工作的」，这一个守住「**每个 NPC、每类意图**都接得上」。

要验的五件事：
  ① 每一轮都有**成品气泡**（不是"正在思索……"占位）；
  ② 每一轮都**没有兜底标记**（fb）——兜底 = 本地没接住、模型没答上；
  ③ 每轮都真的打到 /api/parse 且 **200**；需要人格台词的轮次还打到 /api/chat 且 200；
  ④ 意图**落成游戏行为**（买药真扣钱真进背包、名字考试真记名字）；
  ⑤ 全程零未捕获页面异常。

用法：
    py -3 odyssey-witch/tests/h5_api_sweep_browser.py                    # 本机起 server.py 跑
    py -3 odyssey-witch/tests/h5_api_sweep_browser.py --base https://odyssey-1c9.pages.dev/

注意：本脚本**不进 scripts/verify_h5.py 默认门禁**——它要真 key + 联网，
是「发布前人工/定时补跑」的一次性体检（和 h5_agent_browser.py 同性质）。
"""

import argparse
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

# (NPC, 玩家这一句, 期望落点) —— 覆盖本地 handler 与人格模型两条路
SWEEP = [
    ("witch", "我想买一瓶治疗草药", "购买物品（本地 handler → 真结算）"),
    ("witch", "治疗草药多少钱", "查询价格（本地 handler）"),
    ("witch", "我背包里有什么", "查询背包（本地 handler）"),
    ("witch", "塞壬的歌声有什么效力", "本地不接 → 人格模型（apiChat）"),
    ("siren", "你是谁", "闲聊 → 人格模型"),
    ("seer", "我要怎么回家", "请求帮助 → 人格模型"),
    ("polyphermus_placeholder", "", ""),   # 占位会被下面替换掉
    ("lotusman", "带我去冥界", "导航到地点 → 人格模型"),
    ("epeius", "我想买一艘船", "本地 handler 全空 → 必走人格模型"),
    ("nausicaa", "这附近哪里有水", "查询附近目标 → 人格模型"),
    ("telemachus", "给我讲讲奥德修斯", "本地 handler 全空 → 必走人格模型"),
    ("cattle", "给我一份干粮", "港口 NPC → 购买/应答"),
]

# 名字考试（本地提取 + 写状态），单独一轮
NAME_EXAM = ("polyphemus", "我叫无人", "名字考试 → 真记名字（state.polNameGiven）")

WAIT_REPLY = """() => {
    const rows = document.querySelectorAll('#msgs .row');
    if (!rows.length) return false;
    const b = rows[rows.length - 1].querySelector('.bubble');
    if (!b || !b.classList.contains('witch')) return false;
    if (b.classList.contains('thinking')) return false;
    return b.textContent.trim().length > 0;
}"""


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def key_of(path: Path):
    try:
        m = re.search(r"sk-[A-Za-z0-9_\-]{16,}", path.read_text(encoding="utf-8"))
        return m.group(0) if m else None
    except OSError:
        return None


def preflight():
    root_key = key_of(REPO / "key.txt")
    if not root_key:
        raise SystemExit("缺少 仓库根目录/key.txt（真实 API 验收需要真 key）")
    local_key_path = ROOT / "key.txt"
    if local_key_path.is_file():
        local_key = key_of(local_key_path)
        if local_key and local_key != root_key:
            raise SystemExit(
                "两份 key.txt 不是同一把 key：\n  %s\n  %s\n"
                "server.py 优先读本目录那份 → 会用旧 key 拿 401。\n"
                "请删掉或同步本目录那份（key.txt 不入库）。" % (local_key_path, REPO / "key.txt")
            )
        print("INFO 两份 key.txt 内容一致（或本目录没有），用根目录那把")


def last_row(page):
    return page.evaluate(
        """() => {
            const rows = document.querySelectorAll('#msgs .row');
            const row = rows[rows.length - 1];
            const bubble = row ? row.querySelector('.bubble') : null;
            return {
                text: bubble ? bubble.textContent.trim() : '',
                isFallback: bubble ? bubble.classList.contains('fb') : true,
                chips: Array.from(row.querySelectorAll('.chips .chip')).map(c => c.textContent.trim()),
            };
        }"""
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="", help="直接打某个已上线站点（留空则本机起 server.py）")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--quick", action="store_true",
                    help="只跑 3 轮（线上站点用：单 IP 每天额度有限，别把额度打满）")
    args = ap.parse_args()

    preflight()
    server = None
    if args.base:
        base = args.base if args.base.endswith("/") else args.base + "/"
        print("目标站点:", base)
    else:
        port = free_port()
        server = subprocess.Popen(
            [sys.executable, "server.py", str(port)],
            cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        )
        base = f"http://127.0.0.1:{port}/"
        print("目标站点:", base, "（本机 server.py）")

    failures = []
    rows_report = []
    try:
        for _ in range(120):
            if server is not None and server.poll() is not None:
                raise RuntimeError(server.stderr.read())
            try:
                # 必须带浏览器 UA：线上 API 会按 UA 拦 Python-urllib（403），
                # 用默认 UA 探测会误判成「站点没起来」。
                req = urllib.request.Request(base + "api/schema", headers={"User-Agent": BROWSER_UA})
                with urllib.request.urlopen(req, timeout=1.0) as r:
                    if r.status == 200:
                        break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError("站点没起来")

        calls = []
        page_errors = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=not args.headed)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.set_default_timeout(30000)

            def on_response(resp):
                if "/api/" in resp.url:
                    calls.append({"url": resp.url, "status": resp.status})

            page.on("response", on_response)
            page.on("pageerror", lambda e: page_errors.append(str(e)[:300]))
            page.goto(base, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(800)
            page.locator("#tsGo").click()
            page.wait_for_timeout(700)
            if page.locator("#opSkip").count():
                page.locator("#opSkip").click()
            page.wait_for_timeout(1200)

            sweep_plan = [x for x in SWEEP if x[0] != "polyphermus_placeholder"]
            if args.quick:
                # 线上跑：单 IP 每天额度有限（40 次），只留两轮——
                # 女巫买药（本地 handler 路径）+ epeius（本地 handler 全空 → 必走 /api/chat）。
                want = ("witch", "epeius")
                picked = []
                for key in want:
                    hit = next((x for x in sweep_plan if x[0] == key), None)
                    if hit:
                        picked.append(hit)
                sweep_plan = picked
            plan = sweep_plan + ([] if args.quick else [NAME_EXAM])
            for npc, text, expect in plan:
                # 注意：openDlg() **不带参数**时会按 scene 重新推导 currentNPC
                #（scene='aia' → 一律回到女巫），所以必须把 NPC 传进去，
                # 否则「换了 NPC 的对话」其实全是女巫在答（第一版扫描器就栽在这）。
                page.evaluate(
                    """(npc) => { const G = window.__game; G.setScene('aia'); G.openDlg(npc); }""",
                    npc,
                )
                page.wait_for_timeout(350)
                # 断言 NPC 真的换了：对话框标题应等于该 NPC 的名字
                who = page.evaluate(
                    """(npc) => ({
                        shown: (document.getElementById('dlgName')||{}).textContent || '',
                        expect: (window.__game.NPCS[npc]||{}).name || '',
                    })""",
                    npc,
                )
                if not who["expect"] or who["shown"] != who["expect"]:
                    failures.append(f"[{npc}] NPC 没真的切换：对话框显示 {who['shown']!r}，应为 {who['expect']!r}")
                    continue
                before_parse = len([c for c in calls if "/api/parse" in c["url"]])
                before_chat = len([c for c in calls if "/api/chat" in c["url"]])
                page.fill("#inp", text)
                page.click("#sendBtn")
                t0 = time.time()
                try:
                    page.wait_for_function(WAIT_REPLY, timeout=45000)
                except Exception:
                    failures.append(f"[{npc}] {text!r}：没有出现成品气泡（超时）")
                    continue
                page.wait_for_timeout(250)
                dt = time.time() - t0
                last = last_row(page)
                after_parse = len([c for c in calls if "/api/parse" in c["url"]])
                after_chat = len([c for c in calls if "/api/chat" in c["url"]])
                parse_status = [c["status"] for c in calls if "/api/parse" in c["url"]][before_parse:]
                chat_status = [c["status"] for c in calls if "/api/chat" in c["url"]][before_chat:]

                if last["isFallback"]:
                    failures.append(f"[{npc}] {text!r}：气泡带兜底标记（模型没接住）")
                if after_parse == before_parse:
                    failures.append(f"[{npc}] {text!r}：这一轮根本没打 /api/parse")
                elif any(s != 200 for s in parse_status):
                    failures.append(f"[{npc}] {text!r}：/api/parse 非 200 → {parse_status}")
                if any(s != 200 for s in chat_status):
                    failures.append(f"[{npc}] {text!r}：/api/chat 非 200 → {chat_status}")

                rows_report.append({
                    "npc": npc, "text": text, "expect": expect,
                    "parse": len(parse_status), "chat": len(chat_status),
                    "fb": last["isFallback"], "chips": last["chips"],
                    "reply": last["text"][:46], "dt": round(dt, 2),
                })
                print(f"  {npc:<12} {text:<22} parse={len(parse_status)} chat={len(chat_status)} "
                      f"{dt:>5.1f}s fb={last['isFallback']} chips={last['chips']}")

            # 意图落成游戏行为：买药真扣钱真进背包
            page.evaluate("() => { const G = window.__game; G.setScene('aia'); G.openDlg('witch'); }")
            page.wait_for_timeout(300)
            before = page.evaluate(
                "() => ({coins: window.__game.state.coins,"
                " herbs: (window.__game.state.backpack||{})['治疗草药'] || 0})")
            page.fill("#inp", "我想买一瓶治疗草药")
            page.click("#sendBtn")
            page.wait_for_function(WAIT_REPLY, timeout=45000)
            page.wait_for_timeout(300)
            after = page.evaluate(
                "() => ({coins: window.__game.state.coins,"
                " herbs: (window.__game.state.backpack||{})['治疗草药'] || 0})")
            if after["herbs"] != before["herbs"] + 1:
                failures.append(f"购买没真结算：治疗草药 {before['herbs']} → {after['herbs']}")
            else:
                print(f"PASS 购买真结算：治疗草药 {before['herbs']} → {after['herbs']}，"
                      f"金币 {before['coins']} → {after['coins']}")
            if after["coins"] >= before["coins"]:
                failures.append(f"买药没真扣钱：金币 {before['coins']} → {after['coins']}")

            # 名字考试真记名字（本地提取 + 写状态）——线上省额度时跳过
            if not args.quick:
                page.evaluate("() => { const G = window.__game; G.setScene('aia'); G.openDlg('polyphemus'); }")
                page.wait_for_timeout(300)
                page.fill("#inp", "我叫无人")
                page.click("#sendBtn")
                page.wait_for_function(WAIT_REPLY, timeout=45000)
                page.wait_for_timeout(300)
                given = page.evaluate("() => window.__game.state.polNameGiven || ''")
                if not given:
                    failures.append("名字考试没真记名字（state.polNameGiven 为空）")
                else:
                    print(f"PASS 名字考试真记名字：polNameGiven={given!r}")

            if page_errors:
                failures.append(f"页面有未捕获异常：{page_errors[:3]}")
            else:
                print("PASS 全程零未捕获页面异常")

            total_parse = len([c for c in calls if "/api/parse" in c["url"]])
            total_chat = len([c for c in calls if "/api/chat" in c["url"]])
            print(f"[网络] parse {total_parse} 次 / chat {total_chat} 次 / 共 {len(calls)} 个 API 响应")
            browser.close()
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    print("\n== 扫描结果 ==")
    for r in rows_report:
        print(f"  {r['npc']:<12} {r['text']:<22} parse={r['parse']} chat={r['chat']} "
              f"{r['dt']:>5.1f}s fb={r['fb']} | {r['chips']} | {r['reply']}")
    if failures:
        print("\nFAIL：")
        for f in failures:
            print("  ✗", f)
        raise SystemExit(1)
    print(f"\nPASS 整局 API 扫描：{len(rows_report)} 轮全部接住真模型")


if __name__ == "__main__":
    main()
