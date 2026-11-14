import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("ODYSSEY_BASE_URL", "http://127.0.0.1:8841/")


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f"PASS {message}")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        errors = []
        external = []
        bad_responses = []
        try:
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            context.add_init_script("localStorage.setItem('odyssey-quality-v1', '2d');")

            def guard(route):
                url = route.request.url
                if url.startswith(("http://", "https://")) and urlsplit(url).netloc != urlsplit(BASE_URL).netloc:
                    external.append(url)
                    route.abort()
                else:
                    route.continue_()

            context.route("**/*", guard)
            page = context.new_page()
            page.set_default_timeout(12000)
            page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
            page.on("console", lambda message: errors.append(f"console error: {message.text}") if message.type == "error" else None)
            page.on("response", lambda response: bad_responses.append(f"{response.status} {response.url}") if response.status >= 400 else None)
            page.goto(BASE_URL, wait_until="networkidle", timeout=45000)
            check(page.evaluate("SCHEMA.length") > 0, "独立包从本地 JSON 加载完整意图菜单")
            resources = page.evaluate("performance.getEntriesByType('resource').map(entry => entry.name)")
            check(any("src/data/schema.json" in url for url in resources), "产物不再依赖 /api/schema 启动")
            check(not external, f"启动与资源加载零外部请求：{external}")
            check(not bad_responses, f"静态资源无 HTTP 错误：{bad_responses}")

            page.locator("#tsGo").click()
            page.locator("#opSkip").click()
            page.locator("#onboardingSkip").click()
            check(page.evaluate("ISLANDS.length") == 13, "独立包保留全部十三岛")
            page.evaluate("""() => {
                window.__game.setScene('aia');
                window.__game.openDlg('witch');
                send('背包里有什么');
            }""")
            page.wait_for_function("busy === false")
            check(page.locator("#msgs .chip.err").last.inner_text() == "离线模式", "无密钥服务会明确进入离线模式")
            page.wait_for_function(
                """() => {
                    const bubbles = document.querySelectorAll('#msgs .bubble.witch');
                    return bubbles.length && bubbles[bubbles.length - 1].textContent.includes('行囊');
                }"""
            )
            check("行囊" in page.locator("#msgs .bubble.witch").last.inner_text(), "离线意图与背包系统仍真实可用")
            check(not external, f"离线对话仍零外部请求：{external}")
            check(not bad_responses, f"离线对话无 HTTP 控制台错误：{bad_responses}")
            check(not errors, "独立包真实 Chrome 无 pageerror/console error；\n" + "\n".join(errors))
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    main()
