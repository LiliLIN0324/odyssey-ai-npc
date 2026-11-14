import json
import os
import struct
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ODYSSEY_BASE_URL", "http://127.0.0.1:8840/")
PACKAGE_MODE = os.environ.get("ODYSSEY_H5_PACKAGE") == "1"
SAVE_KEY = "odyssey-med-v2"


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}")


def new_page(browser, errors):
    context = browser.new_context(
        accept_downloads=True,
        viewport={"width": 1280, "height": 900},
    )
    if PACKAGE_MODE:
        def guard(route):
            url = route.request.url
            if url.startswith(("http://", "https://")) and urlsplit(url).netloc != urlsplit(BASE_URL).netloc:
                errors.append(f"外部资源请求: {url}")
                route.abort()
            else:
                route.continue_()

        context.route("**/*", guard)
    context.add_init_script(
        "localStorage.setItem('odyssey-quality-v1', '2d');"
    )
    page = context.new_page()
    page.set_default_timeout(10000)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.on(
        "console",
        lambda message: errors.append(f"console error: {message.text}")
        if message.type == "error"
        else None,
    )
    return context, page


def open_game(page):
    page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
    page.locator("#tsGo").click()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        errors = []
        try:
            context, page = new_page(browser, errors)
            page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            check(
                page.locator(".tsScene").is_visible()
                and page.locator(".tsMoon").count() == 1,
                "标题屏使用程序化夜海图层（海/月/船）",
            )
            check(
                "十二艘船" in page.locator(".tsSub").inner_text(),
                "标题屏文案交代出发与归途",
            )
            page.locator("#tsGo").click()
            check(page.locator("#openingCard").is_visible(), "新档开场先给第一桨")
            check(
                "第一桨" in page.locator("#opKicker").inner_text(),
                "开场从可操作微节拍开始",
            )

            card = page.locator("#onboardingCard")
            check(card.is_visible(), "新档显示第一步情境引导")
            check(
                page.evaluate("window.__game.state.onboarding.step") == 0,
                "新档引导从移动开始",
            )

            page.keyboard.down("d")
            try:
                page.wait_for_function(
                    "window.__game.state.onboarding.step === 1", timeout=5000
                )
            finally:
                page.keyboard.up("d")
            saved_step = page.evaluate(
                f"JSON.parse(localStorage.getItem('{SAVE_KEY}')).state.onboarding.step"
            )
            check(saved_step == 1, "真实移动推进引导并写入存档")
            check(
                page.evaluate("window.__game.state.openingBeat") == 1,
                "真实划桨推进开场节拍到看海",
            )
            check(
                "海" in page.locator("#opText").inner_text(),
                "开场第二节拍换成看海的提示",
            )

            page.locator("#hudLogBtn").click()
            check(page.locator("#hudLog").is_visible(), "航海日记可展开")
            check(
                "钱袋" in page.locator("#hudLog").inner_text(),
                "次要数值收进航海日记而不是消失",
            )
            page.locator("#hudLogBtn").click()

            page.locator("#opSkip").click()
            check(
                page.evaluate("window.__game.state.openingBeat") == 3,
                "序章可跳过且立即生效",
            )
            check(
                not page.locator("#openingCard").is_visible(),
                "跳过后开场卡不再挡航路",
            )

            page.evaluate(
                """() => {
                    const troy = window.ISLANDS.find(island => island.scene === 'troy');
                    window.__game.boat.x = troy.gx * WTS + WTS / 2;
                    window.__game.boat.y = troy.gy * WTS + WTS / 2 + 100;
                }"""
            )
            page.keyboard.press("e")
            page.wait_for_function("window.__game.getScene() === 'troy'")
            page.wait_for_function("document.getElementById('zone').textContent.includes('特洛伊海岸')")
            check(
                "特洛伊海岸" in page.locator("#zone").inner_text(),
                "特洛伊岛内区域名不回退为埃阿亚岛",
            )
            check(
                page.evaluate("window.__game.state.onboarding.step") == 2,
                "有效靠岸推进到任务或海图步骤",
            )

            page.keyboard.press("Escape")
            page.wait_for_function("chapterOn === false")
            page.keyboard.press("q")
            page.wait_for_function("window.__game.state.onboarding.done === true")
            check(not card.is_visible(), "打开任务日志完成并隐藏引导")
            check(
                page.locator("#questPanel").is_visible(),
                "Q 键打开任务日志",
            )

            fate = page.evaluate(
                """() => {
                    const canon = ACHIV.find(item => item.canon);
                    const dev = ACHIV.find(item => item.dev);
                    Object.assign(window.__game.state, {
                        achiv: [canon.id, dev.id],
                        chosenName: '测试旅人',
                        crewLit: true,
                        crew: 9,
                    });
                    save();
                    window.__game.renderQuests();
                    return {
                        canonName: canon.name,
                        devName: dev.name,
                        canonTotal: ACHIV.filter(item => item.canon).length,
                        devTotal: ACHIV.filter(item => item.dev).length,
                    };
                }"""
            )
            page.locator("#questFateTab").click()
            quest_html = page.locator("#questList").inner_html()
            check(
                page.locator("#questList .q.fate.done").count() == 2,
                "命运图鉴显示两枚已解锁成就",
            )
            check(
                fate["canonName"] in quest_html and fate["devName"] in quest_html,
                "命运图鉴显示双轨成就名称",
            )
            check(
                f"1 / {fate['canonTotal']}" in quest_html
                and f"1 / {fate['devTotal']}" in quest_html,
                "命运图鉴分别统计原著线与改写线",
            )
            leaks = page.evaluate(
                """() => {
                    const got = window.__game.state.achiv;
                    const html = document.getElementById('questList').innerHTML;
                    return ACHIV.filter(item => !got.includes(item.id))
                        .flatMap(item => [item.name, item.desc, item.dev])
                        .filter(secret => secret && html.includes(secret));
                }"""
            )
            check(not leaks, f"未解锁成就零剧透（泄露：{leaks}）")

            page.keyboard.press("q")
            page.evaluate(
                """() => {
                    window.__shareText = [];
                    Object.defineProperty(navigator, 'canShare', {
                        configurable: true,
                        value: () => false,
                    });
                    const original = CanvasRenderingContext2D.prototype.fillText;
                    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
                        if (this.canvas.width === 1200 && this.canvas.height === 675) {
                            window.__shareText.push(String(text));
                        }
                        return original.call(this, text, ...args);
                    };
                }"""
            )
            with tempfile.TemporaryDirectory() as temp_dir:
                download_path = Path(temp_dir) / "journey.png"
                with page.expect_download(timeout=15000) as download_info:
                    page.locator("#shotBtn").click()
                download_info.value.save_as(download_path)
                png = download_path.read_bytes()
                check(png[:8] == b"\x89PNG\r\n\x1a\n", "分享卡降级下载为 PNG")
                width, height = struct.unpack(">II", png[16:24])
                check((width, height) == (1200, 675), "分享卡尺寸为 1200×675")

            share_text = page.evaluate("window.__shareText")
            joined = "\n".join(share_text)
            check("测试旅人 的航迹" in joined, "分享卡写入个性化旅人名")
            check(
                f"最新命运 · {fate['devName']}" in joined,
                "分享卡写入最新命运",
            )
            check("原著 1 · 改写 1" in joined, "分享卡写入双轨统计")
            check("船员 9/12 存活" in joined, "分享卡写入船员结果")

            page.keyboard.press("q")
            page.wait_for_function(
                "document.getElementById('questPanel').style.display === 'block'"
            )
            page.locator("#questRunsTab").click()
            check(
                "还没有归档的航程" in page.locator("#questList").inner_text(),
                "首次打开档案页显示空状态",
            )

            page.evaluate(
                """() => {
                    const canon = ACHIV.find(item => item.canon);
                    const dev = ACHIV.find(item => item.dev);
                    Object.assign(window.__game.state, {
                        achiv: [canon.id, dev.id],
                        chosenName: '测试旅人',
                        crewLit: true,
                        crew: 9,
                    });
                    return window.__game.recordRun('home');
                }"""
            )
            page.evaluate("window.__game.renderQuests()")
            runs_text = page.locator("#questList").inner_text()
            check("测试旅人 · 归乡" in runs_text, "档案页显示旅人名与结局")
            check("本 机 纪 录" in runs_text, "档案页显示本机纪录汇总")
            check(
                "原著 1" in runs_text and "改写 1" in runs_text,
                "档案页记录双轨成就数",
            )
            check("船员 9/12" in runs_text, "档案页记录船员存活")
            check(
                page.evaluate(
                    "JSON.parse(localStorage.getItem('odyssey-runs-v1')).length"
                )
                == 1,
                "航程档案独立写入 localStorage",
            )

            page.keyboard.press("q")
            page.reload(wait_until="networkidle", timeout=45000)
            check(
                page.locator("#tsRuns").is_visible(),
                "标题屏显示本机航程档案",
            )
            check(
                "1 次" in page.locator("#tsRuns").inner_text(),
                "标题屏汇总归档次数",
            )

            page.evaluate(
                f"""() => {{
                    const data = JSON.parse(localStorage.getItem('{SAVE_KEY}'));
                    delete data.state.onboarding;
                    localStorage.setItem('{SAVE_KEY}', JSON.stringify(data));
                }}"""
            )
            open_game(page)
            check(
                page.evaluate("window.__game.state.onboarding.done") is True,
                "无引导字段的旧档自动迁移为已完成",
            )
            check(not card.is_visible(), "旧档不重复显示新手引导")
            context.close()

            skip_context, skip_page = new_page(browser, errors)
            open_game(skip_page)
            skip_page.locator("#onboardingSkip").click()
            check(
                skip_page.evaluate("window.__game.state.onboarding.done") is True,
                "跳过引导立即完成",
            )
            persisted = skip_page.evaluate(
                f"JSON.parse(localStorage.getItem('{SAVE_KEY}')).state.onboarding"
            )
            check(
                persisted == {"step": 3, "done": True},
                "跳过状态写入存档",
            )
            open_game(skip_page)
            check(
                skip_page.evaluate("window.__game.state.onboarding.done") is True,
                "跳过状态在重载后保留",
            )
            check(
                not skip_page.locator("#onboardingCard").is_visible(),
                "跳过后的存档不再显示引导",
            )
            skip_context.close()

            loop_context, loop_page = new_page(browser, errors)
            open_game(loop_page)
            loop_page.locator("#opSkip").click()
            loop_page.locator("#onboardingSkip").click()

            island = loop_page.evaluate(
                """() => {
                    const island = window.ISLANDS.find(item => item.scene === 'troy');
                    window.__game.boat.x = island.gx * WTS + WTS / 2;
                    window.__game.boat.y = island.gy * WTS + WTS / 2 + 100;
                    return {
                        name: island.name,
                        stake: island.stake,
                        reward: island.reward,
                        note: island.note,
                    };
                }"""
            )
            loop_page.wait_for_function(
                "document.getElementById('landfallBrief').classList.contains('show')"
            )
            check(
                loop_page.locator("#lfName").inner_text() == island["name"],
                "真实近岛显示对应岛名",
            )
            check(
                loop_page.locator("#lfStake").inner_text() == island["stake"]
                and loop_page.locator("#lfReward").inner_text() == island["reward"],
                "靠岸简报显示该岛真实赌注与回报",
            )
            action = loop_page.locator("#lfAction").inner_text()
            check(
                "E · 登陆" in action and island["note"] in action,
                "靠岸简报给出明确登陆行动",
            )
            check(
                loop_page.locator("#landfallBrief").evaluate(
                    "el => getComputedStyle(el).pointerEvents"
                )
                == "none",
                "靠岸简报非模态且不抢航行控制",
            )
            loop_page.keyboard.press("e")
            loop_page.wait_for_function("window.__game.getScene() === 'troy'")
            loop_page.wait_for_function(
                "!document.getElementById('landfallBrief').classList.contains('show')"
            )
            check(
                loop_page.locator("#landfallBrief").get_attribute("aria-hidden")
                == "true",
                "进入岛内后靠岸简报消失",
            )
            loop_page.keyboard.press("Escape")
            loop_page.wait_for_function("chapterOn === false")

            sea_setup = loop_page.evaluate(
                """() => {
                    const G = window.__game;
                    G.setScene('world');
                    Object.assign(G.state, {
                        openingBeat: 3,
                        freeSail: false,
                        seaThreshold: 55,
                        seaEncCount: 0,
                        seaEncDone: {},
                        seaLastEnc: null,
                        maleaDone: true,
                    });
                    const grid = G.worldGrid();
                    const size = G.worldTileSize();
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
                            // 从瓦片中心累计航行 55px 后，会在右侧相邻瓦片触发事件。
                            const triggerX = x + 1;
                            const seed = ((triggerX * 73856093) ^ (y * 19349663)) >>> 0;
                            const event = G.SEA_ENCOUNTS[seed % G.SEA_ENCOUNTS.length];
                            if (event.id !== 'storm') continue;
                            G.boat.x = x * size + size / 2;
                            G.boat.y = y * size + size / 2;
                            return {event: event.name, freeSail: G.state.freeSail};
                        }
                    }
                    return null;
                }"""
            )
            check(sea_setup is not None, "为主航程海遇找到连续开阔水域")
            loop_page.evaluate(
                "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
            )
            loop_page.keyboard.down("d")
            try:
                loop_page.wait_for_function(
                    "window.__game.state.seaEncCount === 1", timeout=7000
                )
            finally:
                loop_page.keyboard.up("d")
            check(
                sea_setup["freeSail"] is False,
                "海遇由未通关主航程的真实键盘航行触发",
            )
            check(
                loop_page.locator("#askCard").is_visible()
                and loop_page.locator("#askCard .ccTitle").inner_text()
                == sea_setup["event"],
                "主航程风暴打开原有事件选择卡",
            )
            check(
                "主航程" in loop_page.locator("#askCard .ccKicker").inner_text(),
                "海遇标题区分主航程与自由漂流",
            )
            loop_page.wait_for_function("document.getElementById('hint').style.display === 'none'")
            check(not loop_page.locator("#hint").is_visible(), "海遇抉择时收起旧的岛屿交互提示")

            before = loop_page.evaluate(
                """() => ({
                    hp: window.__game.state.hp,
                    thirst: window.__game.state.thirst,
                    xp: window.__game.state.xp,
                })"""
            )
            loop_page.locator("#askCard .askBtn").first.click()
            loop_page.wait_for_function("window.__game.state.choiceLog.length === 1")
            after = loop_page.evaluate(
                """() => ({
                    hp: window.__game.state.hp,
                    thirst: window.__game.state.thirst,
                    xp: window.__game.state.xp,
                    log: window.__game.state.choiceLog[0],
                    saved: JSON.parse(localStorage.getItem('odyssey-med-v2')).state.choiceLog[0],
                })"""
            )
            check(after["hp"] == max(1, before["hp"] - 6), "风暴选择造成真实伤势代价")
            check(
                abs(after["thirst"] - max(0, before["thirst"] - 12)) < 0.2,
                "风暴选择造成真实饮水代价",
            )
            check(after["xp"] == before["xp"] + 8, "风暴选择给予真实历练回报")
            check(
                after["log"]["title"] == "风暴"
                and after["log"]["choice"] == "压浪硬闯",
                "抉择日志记录当前事件与玩家选项",
            )
            receipt = loop_page.locator("#choiceReceipt").inner_text()
            check(
                loop_page.locator("#choiceReceipt").is_visible()
                and all(change in receipt for change in after["log"]["changes"]),
                "结算回执逐项匹配真实状态差",
            )
            check(
                "伤势 -6" in receipt and "饮水 -12" in receipt and "历练 +8" in receipt,
                "回执同时亮明代价与回报",
            )
            check(after["saved"] == after["log"], "抉择及结算写入主存档")

            loop_page.keyboard.press("q")
            loop_page.wait_for_function(
                "document.getElementById('questPanel').style.display === 'block'"
            )
            loop_page.wait_for_function("document.getElementById('hint').style.display === 'none'")
            check(not loop_page.locator("#hint").is_visible(), "任务日志打开时收起世界交互提示")
            check(
                loop_page.locator("#questList .q.choice").count() == 1,
                "任务日志显示近期抉择",
            )
            choice_text = loop_page.locator("#questList .q.choice").inner_text()
            check(
                "风暴 · 压浪硬闯" in choice_text and "伤势 -6" in choice_text,
                "任务日志可回看选择与代价",
            )
            journey_text = loop_page.locator("#questList").inner_text()
            check(
                all(
                    section in journey_text
                    for section in ["主 线 航 程", "可 选 旧 路", "委 托 账 本"]
                ),
                "新增抉择日志不替换原有任务内容",
            )
            loop_page.keyboard.press("q")
            loop_page.reload(wait_until="networkidle", timeout=45000)
            open_game(loop_page)
            check(
                loop_page.evaluate("window.__game.state.choiceLog.length") == 1
                and loop_page.evaluate("window.__game.state.choiceLog[0].choice")
                == "压浪硬闯",
                "重载后抉择日志仍保留",
            )
            loop_page.keyboard.press("q")
            loop_page.wait_for_function(
                "document.getElementById('questPanel').style.display === 'block'"
            )
            check(
                "风暴 · 压浪硬闯"
                in loop_page.locator("#questList .q.choice").inner_text(),
                "重载后任务日志重新渲染近期抉择",
            )
            loop_context.close()

            systems_context, systems_page = new_page(browser, errors)
            open_game(systems_page)
            systems_page.locator("#opSkip").click()
            systems_page.locator("#onboardingSkip").click()

            systems_setup = systems_page.evaluate(
                """() => {
                    const G = window.__game;
                    Object.assign(G.state, {
                        troyDone: true,
                        crewLit: false,
                        crew: 0,
                        crewList: null,
                        crewLost: [],
                        fleet: 12,
                        coins: 87,
                        hermesMet: true,
                        tookWine: true,
                        raft: {wood: 2, wind: true, food: 1},
                        quests: {
                            browser_nested: {
                                id: 'browser_nested', name: '嵌套进度',
                                have: 2, need: 3, done: false, who: '回归测试',
                            },
                        },
                        achiv: [],
                        legs: {},
                    });
                    G.state.backpack['魔草'] = 1;
                    G.state.backpack['喀科恩酒'] = 1;
                    crewLedgerLight();
                    const reason = '浏览器回归 · 礁石夺走了两名桨手';
                    loseCrew(2, reason);

                    const visited = ISLANDS.slice(0, 2);
                    G.state.legs = {
                        [visited[0].scene]: 1,
                        [visited[1].scene]: 1,
                    };
                    const size = G.worldTileSize();
                    const grid = G.worldGrid();
                    let water = null;
                    for (let y = 1; y < grid.length - 1 && !water; y++) {
                        for (let x = 1; x < grid[y].length - 1; x++) {
                            if ((x !== 22 || y !== 11) && !isSolidTile(x, y)) {
                                water = {x: x * size + size / 2, y: y * size + size / 2};
                                break;
                            }
                        }
                    }
                    G.boat.x = water.x;
                    G.boat.y = water.y;
                    G.player.x = 7 * ATS + ATS / 2;
                    G.player.y = 9 * ATS + ATS / 2;
                    G.setScene('world');
                    save();
                    return {
                        reason,
                        alive: [...G.state.crewList],
                        lost: G.state.crewLost.map(entry => entry.name),
                        islandTotal: ISLANDS.length,
                        relicTotal: CODEX_RELICS.length,
                        visited: visited.map(island => ({
                            name: island.name,
                            note: island.note,
                            stake: island.stake,
                            reward: island.reward,
                        })),
                        boat: {x: G.boat.x, y: G.boat.y},
                        aia: {x: G.player.x, y: G.player.y},
                    };
                }"""
            )
            systems_page.locator("#hudLogBtn").click()
            systems_page.locator("#hudCrew").click()
            check(
                systems_page.locator("#questList .q.crew").count() == 12,
                "船员页完整显示十二人具名名册",
            )
            check(
                systems_page.locator("#questList .q.crew.alive").count() == 10
                and systems_page.locator("#questList .q.crew.lost").count() == 2,
                "真实减员后名册区分十名存活者与两名折损者",
            )
            crew_text = systems_page.locator("#questList").inner_text()
            check(
                all(name in crew_text for name in systems_setup["alive"])
                and all(name in crew_text for name in systems_setup["lost"])
                and systems_setup["reason"] in crew_text,
                "名册显示存活、折损名字与本次真实减员原因",
            )
            saved_crew = systems_page.evaluate(
                f"""() => {{
                    const saved = JSON.parse(localStorage.getItem('{SAVE_KEY}')).state;
                    return {{alive: saved.crewList, lost: saved.crewLost}};
                }}"""
            )
            check(
                saved_crew["alive"] == systems_setup["alive"]
                and [entry["name"] for entry in saved_crew["lost"]]
                == systems_setup["lost"]
                and all(
                    entry["why"] == systems_setup["reason"]
                    for entry in saved_crew["lost"]
                ),
                "具名存活与折损原因写入主存档",
            )

            systems_page.keyboard.press("q")
            systems_page.reload(wait_until="networkidle", timeout=45000)
            systems_page.locator("#tsGo").click()
            systems_page.locator("#hudLogBtn").click()
            systems_page.locator("#hudCrew").click()
            restored_crew_text = systems_page.locator("#questList").inner_text()
            check(
                all(name in restored_crew_text for name in systems_setup["lost"])
                and systems_setup["reason"] in restored_crew_text
                and systems_page.locator("#questList .q.crew.lost").count() == 2,
                "页面重载后具名折损名册与原因仍保留",
            )

            systems_page.locator("#questFateTab").click()
            codex_text = systems_page.locator("#questList").inner_text()
            check(
                systems_page.locator("#questList .q.codex.island").count()
                == systems_setup["islandTotal"]
                and systems_page.locator("#questList .q.codex.island.done").count() == 2
                and systems_page.locator("#questList .q.codex.relic").count()
                == systems_setup["relicTotal"]
                and systems_page.locator("#questList .q.codex.relic.done").count() == 2,
                "重载后图鉴保留全部岛屿与信物槽位并点亮已亲历内容",
            )
            check(
                all(
                    value in codex_text
                    for island in systems_setup["visited"]
                    for value in [
                        island["name"],
                        island["note"],
                        island["stake"],
                        island["reward"],
                    ]
                ),
                "已到访岛屿显示真实岛名、记录、赌注与回报",
            )
            codex_leaks = systems_page.evaluate(
                """() => {
                    const html = document.getElementById('questList').innerHTML;
                    const lockedIslands = ISLANDS.filter(
                        island => !window.__game.state.legs[island.scene]
                    );
                    const lockedRelics = CODEX_RELICS.filter(item => {
                        try { return !item.cond(); } catch (error) { return true; }
                    });
                    return [
                        ...lockedIslands.flatMap(island => [
                            island.name, island.note, island.stake, island.reward,
                        ]),
                        ...lockedRelics.flatMap(item => [item.name, item.desc]),
                    ].filter(secret => secret && html.includes(secret));
                }"""
            )
            check(not codex_leaks, f"浏览器图鉴未解锁岛屿与信物零剧透（泄露：{codex_leaks}）")

            systems_page.keyboard.press("q")
            systems_page.locator("#settingsBtn").click()
            with tempfile.TemporaryDirectory() as temp_dir:
                save_path = Path(temp_dir) / "roundtrip-save.json"
                with systems_page.expect_download(timeout=15000) as save_download_info:
                    systems_page.locator("#exportSaveBtn").click()
                save_download = save_download_info.value
                save_download.save_as(save_path)
                check(
                    save_download.suggested_filename.startswith("odyssey-med-v4-")
                    and save_download.suggested_filename.endswith(".json"),
                    "设置面板导出真实 v4 JSON 存档下载",
                )
                payload = json.loads(save_path.read_text(encoding="utf-8"))
                check(
                    payload["v"] == 4
                    and payload["state"]["coins"] == 87
                    and payload["state"]["raft"] == {"wood": 2, "wind": True, "food": 1}
                    and payload["state"]["quests"]["browser_nested"]["have"] == 2
                    and payload["state"]["crewList"] == systems_setup["alive"]
                    and [
                        entry["name"] for entry in payload["state"]["crewLost"]
                    ]
                    == systems_setup["lost"],
                    "下载文件包含嵌套剧情进度与具名船员账",
                )
                check(
                    payload["scene"] == "world"
                    and payload["boat"] == systems_setup["boat"]
                    and payload["aia"] == systems_setup["aia"],
                    "下载文件包含当前场景、船位与岛内位置",
                )

                cleared = systems_page.evaluate(
                    """() => {
                        localStorage.removeItem(SAVE_KEY);
                        localStorage.removeItem(SAVE_KEY + '.bak');
                        return [
                            localStorage.getItem(SAVE_KEY),
                            localStorage.getItem(SAVE_KEY + '.bak'),
                        ];
                    }"""
                )
                check(cleared == [None, None], "导入前主存档与备份均已清空")
                if not systems_page.locator("#importSaveBtn").is_visible():
                    systems_page.locator("#settingsBtn").click()
                with systems_page.expect_file_chooser() as chooser_info:
                    systems_page.locator("#importSaveBtn").click()
                chooser = chooser_info.value
                with systems_page.expect_navigation(
                    wait_until="networkidle", timeout=45000
                ):
                    chooser.set_files(save_path)
                check(
                    systems_page.locator("#tsGo").is_visible(),
                    "真实文件导入完成后重新载入标题屏",
                )
                systems_page.locator("#tsGo").click()

            restored = systems_page.evaluate(
                """() => {
                    const G = window.__game;
                    return {
                        coins: G.state.coins,
                        raft: G.state.raft,
                        nestedQuest: G.state.quests.browser_nested,
                        scene: G.getScene(),
                        boat: {x: G.boat.x, y: G.boat.y},
                        aia: {x: G.player.x, y: G.player.y},
                        alive: G.state.crewList,
                        lost: G.state.crewLost,
                    };
                }"""
            )
            check(
                restored["coins"] == 87
                and restored["raft"] == {"wood": 2, "wind": True, "food": 1}
                and restored["nestedQuest"]["have"] == 2
                and restored["nestedQuest"]["need"] == 3,
                "清空后导入恢复了嵌套任务与剧情进度",
            )
            check(
                restored["scene"] == "world"
                and restored["boat"] == systems_setup["boat"]
                and restored["aia"] == systems_setup["aia"],
                "清空后导入恢复了场景、船位与岛内坐标",
            )
            check(
                restored["alive"] == systems_setup["alive"]
                and [entry["name"] for entry in restored["lost"]]
                == systems_setup["lost"]
                and all(
                    entry["why"] == systems_setup["reason"]
                    for entry in restored["lost"]
                ),
                "清空后导入恢复了完整具名船员账",
            )
            systems_page.locator("#hudLogBtn").click()
            systems_page.locator("#hudCrew").click()
            check(
                systems_page.locator("#questList .q.crew.lost").count() == 2
                and systems_setup["reason"]
                in systems_page.locator("#questList").inner_text(),
                "导入后的船员页重新渲染具名折损记录",
            )
            systems_page.locator("#questFateTab").click()
            imported_codex_text = systems_page.locator("#questList").inner_text()
            check(
                systems_page.locator("#questList .q.codex.island.done").count() == 2
                and systems_page.locator("#questList .q.codex.relic.done").count() == 2
                and all(
                    island["name"] in imported_codex_text
                    for island in systems_setup["visited"]
                ),
                "导入重载后岛屿与信物图鉴解锁状态仍保留",
            )
            imported_leaks = systems_page.evaluate(
                """() => {
                    const html = document.getElementById('questList').innerHTML;
                    return ISLANDS.filter(
                        island => !window.__game.state.legs[island.scene]
                    ).flatMap(island => [island.name, island.note])
                        .filter(secret => secret && html.includes(secret));
                }"""
            )
            check(not imported_leaks, f"导入后未到访岛屿仍零剧透（泄露：{imported_leaks}）")
            systems_context.close()

            legacy_context, legacy_page = new_page(browser, errors)
            legacy_page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            legacy_page.evaluate("() => localStorage.clear()")
            open_game(legacy_page)
            legacy_page.wait_for_function("window.__game && window.__game.nextObjective")
            check(
                legacy_page.evaluate("window.__game.nextObjective().short")
                == "特洛伊 · 夜袭",
                "清档新档的必经第一站是特洛伊夜袭",
            )
            legacy_page.locator("#opSkip").click()
            legacy_page.locator("#onboardingSkip").click()
            legacy_page.wait_for_function("chapterOn === false")

            legacy_page.evaluate(
                """() => {
                    const G = window.__game;
                    const dock = PROLOGUE_SITES.ismaros.spots()
                        .find(spot => spot.type === 'dock');
                    Object.assign(G.state, {
                        hp: 100,
                        coins: 60,
                        xp: 0,
                        level: 1,
                        fleet: 12,
                        ismarosDone: false,
                        ismarosSpared: false,
                        tookWine: false,
                        decisions: {},
                    });
                    if (!G.state.backpack) G.state.backpack = {};
                    if (!G.state.status) G.state.status = {};
                    if (!Array.isArray(G.state.memory)) G.state.memory = [];
                    G.setScene('ismaros');
                    G.player.x = dock.x;
                    G.player.y = dock.y;
                }"""
            )
            legacy_page.keyboard.press("e")
            legacy_page.wait_for_function(
                "document.getElementById('askCard').classList.contains('show')"
            )
            check(
                legacy_page.locator("#askCard").is_visible()
                and "战 利 品 与 伤 者"
                in legacy_page.locator("#askCard .ccTitle").inner_text(),
                "伊斯玛洛斯离岛前必先弹出战利品抉择卡",
            )
            legacy_page.locator("#askCard .askBtn").first.click()
            legacy_after = legacy_page.evaluate(
                """() => ({
                    done: window.__game.state.ismarosDone,
                    decision: window.__game.state.decisions.ismaros_plunder,
                    scene: window.__game.getScene(),
                })"""
            )
            check(
                legacy_after["done"] is True
                and legacy_after["decision"] == "留下救治"
                and legacy_after["scene"] == "ismaros",
                "选中战利品选项后写入旗标与抉择，且首次按 E 不离岛",
            )
            legacy_page.keyboard.press("e")
            legacy_page.wait_for_function("window.__game.getScene() === 'world'")
            check(
                legacy_page.evaluate("window.__game.getScene()") == "world",
                "结算后再次按 E 才真正离岛",
            )
            legacy_context.close()

            map_context, map_page = new_page(browser, errors)
            open_game(map_page)
            map_page.locator("#opSkip").click()
            map_page.locator("#onboardingSkip").click()
            map_page.wait_for_function("chapterOn === false")
            map_page.evaluate("window.__game.setScene('world')")
            map_page.keyboard.press("m")
            map_page.wait_for_function("mapOpen === true")
            check(
                map_page.locator("#mapRoute").is_visible()
                and map_page.locator("#mapRoute [data-route]").count() == 3,
                "海图提供沿岸/外海/迷雾三档航路姿态",
            )
            map_page.locator("#mapRoute [data-route='mist']").click()
            map_page.wait_for_function(
                "window.__game.state.seaRoute === 'mist'"
            )
            check(
                map_page.evaluate(
                    "document.querySelector('#mapRoute [data-route=\"mist\"]').classList.contains('on')"
                ),
                "选择迷雾航路后按钮态与存档同步",
            )
            check(
                map_page.evaluate(
                    f"JSON.parse(localStorage.getItem('{SAVE_KEY}')).state.seaRoute === 'mist'"
                ),
                "航路姿态写入存档",
            )
            current_probe = map_page.evaluate(
                """() => {
                    const old = boatMapPos;
                    window.boatMapPos = () => SEA_CURRENTS[0].pts[0];
                    const at = currentAt();
                    const result = {
                        id: at && at.id,
                        fwd: currentFactor(at.tx, at.ty),
                        back: currentFactor(-at.tx, -at.ty),
                    };
                    window.boatMapPos = old;
                    return result;
                }"""
            )
            check(
                current_probe["id"] == "north"
                and current_probe["fwd"] > 1.1
                and current_probe["back"] < 0.95,
                "船入洋流带后顺流加速、逆流减速（真实航速结算）",
            )
            map_page.evaluate(
                """() => {
                    const G = window.__game;
                    G.state.trail = [
                        {k: 'troy', leg: 1, t: 0},
                        {k: 'lotus', leg: 6, t: 90},
                        {k: 'cyclops', leg: 7, t: 120},
                    ];
                    G.state.decisions = {troy_fire: '烧了城'};
                    G.state.seaEchoes = [
                        {id: 'storm', name: '风暴', x: 50, y: 45, t: 200},
                    ];
                }"""
            )
            map_page.locator("#mzTrail").click()
            map_page.wait_for_function(
                "document.getElementById('mapTrailTip').classList.contains('show')"
            )
            check(
                "航迹回看" in map_page.locator("#mapTrailTip").inner_text(),
                "航迹回看沿真实到访顺序推进并报出站点",
            )
            pixels = map_page.evaluate(
                """() => {
                    const cv = document.getElementById('mapFx');
                    const ctx = cv.getContext('2d');
                    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
                    let lit = 0;
                    for (let i = 3; i < data.length; i += 4 * 97) {
                        if (data[i] > 0) lit += 1;
                    }
                    return {lit, w: cv.width, h: cv.height};
                }"""
            )
            check(
                pixels["lit"] > 40 and pixels["w"] > 600,
                "海图叠加层真实绘制洋流/航迹/回声（canvas 有像素）",
            )
            weather = map_page.evaluate(
                """() => {
                    const w = window.WorldMap.weather();
                    const stormCells = w.storms;
                    const phases = ['night', 'dawn', 'day', 'dusk'];
                    const okPhase = phases.includes(w.phase);
                    const oldClock = window.__game.state.clock;
                    window.__game.state.clock = 23 * 60;
                    const night = window.WorldMap.weather().phase;
                    window.__game.state.clock = oldClock;
                    return {stormCells, okPhase, night, label: w.windLabel,
                            strength: w.strength, reduced: w.reducedMotion};
                }"""
            )
            check(
                weather["okPhase"],
                "动态天气暴露合法昼夜相位",
            )
            check(
                weather["stormCells"] >= 1,
                "真实风暴海遇在海图上生成风暴单体（会转、会下雨）",
            )
            check(
                weather["night"] == "night",
                "天气昼夜跟随游戏时钟：23 时为夜",
            )
            check(
                bool(weather["label"]),
                "风纹方向与风名读同一份 windDir",
            )
            map_page.keyboard.press("Escape")
            map_page.wait_for_function("mapOpen === false")
            map_context.close()

            # ============ 批次 J · 实玩审计修复的回归锁 ============
            # ① 出生点的靠岸简报必须讲主线目标岛，不能讲几何上最近的第三章岛
            spawn_context, spawn_page = new_page(browser, errors)
            open_game(spawn_page)
            spawn_page.locator("#opSkip").click()
            spawn_page.wait_for_timeout(900)
            spawn_brief = spawn_page.evaluate(
                """() => ({
                    name: document.getElementById('lfName').textContent,
                    kicker: document.querySelector('#landfallBrief .lfKicker').textContent,
                    action: document.getElementById('lfAction').textContent,
                    compass: document.getElementById('hudCompass').innerText,
                })"""
            )
            check(
                spawn_brief["name"] == "特洛伊海岸"
                and "特洛伊" in spawn_brief["compass"]
                and "NEXT STOP" in spawn_brief["kicker"],
                "出生点靠岸简报讲主线目标岛（不再被第三章的声之海峡抢走）",
            )
            check(
                "尚未靠近" in spawn_brief["action"],
                "未靠近目标岛时简报不谎称「E · 登陆」",
            )

            # ② 任务/背包面板打开时世界必须暂停（船不动、需求不掉）
            spawn_page.keyboard.press("q")
            spawn_page.wait_for_timeout(400)
            paused_before = spawn_page.evaluate(
                "() => ({x: window.__game.boat.x, thirst: window.__game.state.thirst})"
            )
            spawn_page.keyboard.down("d")
            spawn_page.wait_for_timeout(1600)
            spawn_page.keyboard.up("d")
            paused_after = spawn_page.evaluate(
                "() => ({x: window.__game.boat.x, thirst: window.__game.state.thirst})"
            )
            check(
                abs(paused_after["x"] - paused_before["x"]) < 0.5
                and abs(paused_after["thirst"] - paused_before["thirst"]) < 0.05,
                "任务面板打开时世界暂停（读清单不会被饿渴惩罚）",
            )
            scene_before = spawn_page.evaluate("window.__game.getScene()")
            spawn_page.keyboard.press("e")
            spawn_page.wait_for_timeout(300)
            check(
                spawn_page.evaluate("window.__game.getScene()") == scene_before,
                "面板打开时 E 键不触发世界交互",
            )
            spawn_page.keyboard.press("q")
            spawn_page.wait_for_timeout(300)

            # ③ 风神埃俄罗斯的 E 键必须能对话（旧版完全无响应 → 风袋永远拿不到）
            spawn_page.evaluate(
                """() => {
                    window.__game.setScene('aeolia');
                    aiaPlayer.x = 4 * ATS + ATS / 2 + 30;
                    aiaPlayer.y = 4 * ATS + ATS * 0.55 + 10;
                }"""
            )
            spawn_page.wait_for_timeout(700)
            spawn_page.keyboard.press("e")
            spawn_page.wait_for_timeout(1200)
            check(
                spawn_page.evaluate("dlgOpen") is True
                and "埃俄罗斯" in spawn_page.locator("#dlgName").inner_text(),
                "风神岛的 E 键能打开埃俄罗斯的对话（风袋主线不再断链）",
            )
            spawn_page.keyboard.press("Escape")
            spawn_page.wait_for_timeout(300)

            # ④ 环境台词：冷却判据修正后，NPC 靠近即可开口（此前前 90 秒全哑）
            spawn_page.evaluate(
                """() => {
                    window.__game.setScene('hades');
                    aiaPlayer.x = 9 * ATS + ATS / 2 + 40;
                    aiaPlayer.y = 2 * ATS + ATS * 0.6 + 10;
                }"""
            )
            spawn_page.wait_for_timeout(2600)
            ambient_text = spawn_page.evaluate(
                """() => {
                    const el = document.getElementById('ambient');
                    return getComputedStyle(el).display !== 'none' ? el.innerText.trim() : '';
                }"""
            )
            check(
                bool(ambient_text),
                "NPC 靠近即有环境台词（不再被 90 秒冷却判据误伤）",
            )
            spawn_context.close()

            # ⑤ 竖屏不再被全屏遮罩锁死：提示不覆盖视口，且所有按钮可点
            phone_context = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
                has_touch=True,
            )
            phone_page = phone_context.new_page()
            phone_page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            phone_page.wait_for_timeout(900)
            hint_box = phone_page.evaluate(
                """() => {
                    const el = document.getElementById('rotateHint');
                    const st = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    return {display: st.display, pe: st.pointerEvents,
                            covers: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight};
                }"""
            )
            check(
                not hint_box["covers"] and hint_box["pe"] == "none",
                "竖屏提示不再全屏遮挡（不锁死游戏）",
            )
            try:
                phone_page.locator("#tsGo").click(timeout=8000)
                started = True
            except Exception:
                started = False
            check(started, "手机竖屏能真的点下「启航」（旧版被遮罩卡死）")
            phone_page.evaluate("document.getElementById('opSkip').click()")
            phone_page.wait_for_timeout(1200)
            phone_buttons = phone_page.evaluate(
                """() => {
                    const out = [];
                    for (const b of document.querySelectorAll('.hud button, #touchRow button, #touchBtns button')) {
                        const r = b.getBoundingClientRect();
                        if (r.width < 1) continue;
                        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                        out.push({id: b.id, ok: top === b || b.contains(top)});
                    }
                    return out;
                }"""
            )
            check(
                phone_buttons and all(item["ok"] for item in phone_buttons),
                "手机竖屏下所有 HUD/触屏按钮都点得到",
            )
            phone_context.close()

            # ============ 批次 K · 离线意图引擎的回归锁 ============
            # 真实协议入口的 key 失效（HTTP 401）时 apiParse 必抛错——
            # 玩家说的每一句话都会落到离线引擎。所以引擎在**真实浏览器**里的
            # 行为必须是可断言的，不能只在 node 里自证。
            intent_context, intent_page = new_page(browser, errors)
            open_game(intent_page)
            intent_page.locator("#opSkip").click()
            intent_page.wait_for_timeout(700)
            probe = intent_page.evaluate(
                """() => {
                    const p = (t) => {
                        const r = localFallbackParse(t);
                        const a0 = (r[0] && Array.isArray(r[0].args)) ? (r[0].args[0] || {}) : null;
                        return {cats: r.map(x => x.category), isArr: !!(r[0] && Array.isArray(r[0].args)), a0: a0};
                    };
                    return {
                        hasEngine: typeof window.LOCAL_INTENT === 'object',
                        buy: p('我想买一瓶治疗草药'),
                        submit: p('交玛草给她'),
                        road: p('我选长路'),
                        who: p('这里都有些谁？'),
                        junk: p('asdfghjkl'),
                    };
                }"""
            )
            check(probe["hasEngine"], "离线意图引擎在真实浏览器里已加载")
            check(
                probe["buy"]["cats"][0] == "购买物品"
                and probe["buy"]["a0"].get("物品") == "治疗草药"
                and probe["buy"]["a0"].get("数量") == 1,
                "离线引擎能听懂「我想买一瓶治疗草药」并抽出物品与数量",
            )
            check(
                probe["submit"]["cats"][0] == "提交任务",
                "离线引擎把「交玛草给她」判成交任务（旧版落「其他意图」）",
            )
            check(
                probe["road"]["cats"][0] == "接取任务"
                and probe["road"]["a0"].get("任务名称") == "长路",
                "离线引擎能听懂「我选长路」并带出任务名",
            )
            check(
                probe["who"]["cats"][0] == "查询地点信息",
                "离线引擎能听懂「这里都有些谁？」",
            )
            check(
                probe["junk"]["cats"][0] == "其他意图",
                "离线引擎接不住时落「其他意图」，不硬猜",
            )
            check(
                all(item["isArr"] for item in [probe["buy"], probe["submit"], probe["road"]]),
                "离线引擎返回的 args 是数组（否则 send() 会丢掉全部参数）",
            )
            intent_context.close()

            check(not errors, "浏览器无 pageerror 与 console error；\n" + "\n".join(errors))
        except Exception:
            if errors:
                print("BROWSER ERRORS\n" + "\n".join(errors))
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
