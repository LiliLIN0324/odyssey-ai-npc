# -*- coding: utf-8 -*-
"""游戏内 Agent 的**真实 API** 端到端验收（需要真 key + 联网）。

与 `tests/h5_offline_browser.py`（离线包，零外部请求）互补：
离线回归守「断网也能玩」，本脚本守「**接上真模型时，Agent 是真的在工作**」。

要验的六件事：
  ① 意图解析真的打到了 /api/parse 并拿到 200（不是静默落本地兜底）；
  ② 台词真的打到了 /api/chat 并拿到 200（挑一个女巫**本地不接**的意图去触发）；
  ③ NPC 气泡**没有** `fb` 兜底标记（兜底 = 没接住）；
  ④ 意图真的落成了**游戏行为**（买药真扣钱、背包真多一瓶）；
  ⑤ 全程零未捕获页面异常；
  ⑥ 两份 key.txt 不是同一把 key 时**当场报错**（踩过的坑：server.py 优先读本目录那份旧的）。

用法：
    py -3 odyssey-witch/tests/h5_agent_browser.py
（key 从 仓库根目录/key.txt 读，只留在服务端，绝不进浏览器）

注意：本脚本**不进 `scripts/verify_h5.py` 默认门禁**——它要真 key + 联网，
不是可重复的离线闸门；它是「发布前人工/定时补跑」的一次性体检。
"""

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


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}")


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
    """前置检查：key 必须只有一份、且是真 key。"""
    root_key = key_of(REPO / "key.txt")
    if not root_key:
        raise SystemExit("缺少 仓库根目录/key.txt（真实 API 验收需要真 key）")
    local_key_path = ROOT / "key.txt"
    if local_key_path.is_file():
        local_key = key_of(local_key_path)
        if local_key and local_key != root_key:
            # server.py 读 key 的顺序是「本目录 → 上级目录」，本目录那份会盖掉根目录那份。
            raise SystemExit(
                "两份 key.txt 不是同一把 key：\n"
                "  %s\n  %s\n"
                "server.py 优先读本目录那份 → 会用旧 key 拿 401。\n"
                "请删掉或同步本目录那份（key.txt 不入库）。" % (local_key_path, REPO / "key.txt")
            )
        print("INFO 两份 key.txt 内容一致（或本目录没有），用根目录那把")
    return root_key


# 最后一行是「成品气泡」才算回复到了：
#   · 用户气泡 class 是 bubble me，不是 witch
#   · 「正在思索……」占位气泡 class 是 bubble witch thinking
#   · 成品 = bubble witch 且没有 thinking
WAIT_REPLY = """() => {
    const rows = document.querySelectorAll('#msgs .row');
    if (!rows.length) return false;
    const b = rows[rows.length - 1].querySelector('.bubble');
    if (!b || !b.classList.contains('witch')) return false;
    if (b.classList.contains('thinking')) return false;
    return b.textContent.trim().length > 0;
}"""


def last_row(page):
    return page.evaluate(
        """() => {
            const rows = document.querySelectorAll('#msgs .row');
            const row = rows[rows.length - 1];
            const bubble = row ? row.querySelector('.bubble') : null;
            const chips = row ? Array.from(row.querySelectorAll('.chips .chip')).map(c => c.textContent.trim()) : [];
            return {
                text: bubble ? bubble.textContent.trim() : '',
                isFallback: bubble ? bubble.classList.contains('fb') : true,
                chips,
            };
        }"""
    )


def main():
    preflight()
    port = free_port()
    server = subprocess.Popen(
        [sys.executable, "server.py", str(port)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    base = f"http://127.0.0.1:{port}/"
    try:
        for _ in range(120):
            if server.poll() is not None:
                raise RuntimeError(server.stderr.read())
            try:
                with urllib.request.urlopen(base + "api/schema", timeout=0.5) as r:
                    if r.status == 200:
                        break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError("server.py 启动超时")

        calls = []
        page_errors = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            page.set_default_timeout(30000)

            def on_response(resp):
                if "/api/" in resp.url:
                    try:
                        body = resp.text()
                    except Exception:
                        body = ""
                    calls.append({"url": resp.url, "status": resp.status, "body": body[:400]})

            page.on("response", on_response)
            page.on("pageerror", lambda e: page_errors.append(str(e)[:300]))
            page.goto(base, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(800)
            page.locator("#tsGo").click()
            page.wait_for_timeout(700)
            if page.locator("#opSkip").count():
                page.locator("#opSkip").click()
            page.wait_for_timeout(1200)

            # 把女巫喀耳刻请到台前
            page.evaluate(
                """() => {
                    const G = window.__game;
                    G.setScene('aia');
                    G.setNPC('witch');
                    G.openDlg();
                }"""
            )
            page.wait_for_timeout(800)

            before = page.evaluate(
                "() => ({coins: window.__game.state.coins,"
                " herbs: (window.__game.state.backpack||{})['治疗草药'] || 0})"
            )

            # ---- 第一相：购买（走 /api/parse → 本地 handler 结算）----
            page.fill("#inp", "我想买一瓶治疗草药")
            page.click("#sendBtn")
            page.wait_for_function(WAIT_REPLY, timeout=45000)
            page.wait_for_timeout(600)

            parse_calls = [c for c in calls if "/api/parse" in c["url"]]
            check(
                bool(parse_calls) and parse_calls[-1]["status"] == 200,
                "意图解析真的打到 /api/parse 且 200（%d 次）" % len(parse_calls)
                + ("" if (parse_calls and parse_calls[-1]["status"] == 200)
                   else "｜状态 %s｜响应 %s" % (parse_calls[-1]["status"] if parse_calls else "-",
                                       (parse_calls[-1]["body"][:220] if parse_calls else "-"))),
            )

            last = last_row(page)
            check(not last["isFallback"], "NPC 气泡没有兜底标记（模型接住了，不是本地兑底）")
            check(len(last["text"]) > 4, f"NPC 真的回话了：{last['text'][:40]}")
            check(
                any("购买" in c or "物品" in c for c in last["chips"]),
                f"意图被解析成购买类并落成游戏行为（chips={last['chips']}）",
            )

            after = page.evaluate(
                "() => ({coins: window.__game.state.coins,"
                " herbs: (window.__game.state.backpack||{})['治疗草药'] || 0})"
            )
            check(
                after["herbs"] == before["herbs"] + 1,
                f"购买真的结算：治疗草药 {before['herbs']} → {after['herbs']}",
            )
            check(
                after["coins"] < before["coins"],
                f"买药真扣钱：金币 {before['coins']} → {after['coins']}",
            )

            # ---- 第二相：台词（挑女巫本地不接的意图 → 必走 /api/chat）----
            # 女巫本地 switch 没有「查询生物情报」，这类意图才会落到人格模型（apiChat）。
            chat_before = len([c for c in calls if "/api/chat" in c["url"]])
            page.fill("#inp", "塞壬的歌声有什么效力")
            page.click("#sendBtn")
            page.wait_for_function(WAIT_REPLY, timeout=45000)
            page.wait_for_timeout(600)

            chat_calls = [c for c in calls if "/api/chat" in c["url"]]
            check(
                len(chat_calls) > chat_before and chat_calls[-1]["status"] == 200,
                "台词真的打到 /api/chat 且 200（本轮 %d 次）" % (len(chat_calls) - chat_before)
                + ("" if (len(chat_calls) > chat_before and chat_calls[-1]["status"] == 200)
                   else "｜状态 %s｜响应 %s" % (chat_calls[-1]["status"] if chat_calls else "-",
                                       (chat_calls[-1]["body"][:220] if chat_calls else "-"))),
            )
            last2 = last_row(page)
            check(not last2["isFallback"], "台词气泡没有兜底标记")
            check(len(last2["text"]) > 4, f"人格模型真的写了台词：{last2['text'][:40]}")

            check(not page_errors, "全程零未捕获页面异常" + ("" if not page_errors else "｜%s" % page_errors[:3]))

            print("对话记录条数:", page.evaluate("() => document.querySelectorAll('#msgs .row').length"))
            print("[网络]", [(c["url"].rsplit("/", 1)[-1], c["status"]) for c in calls])
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    main()
