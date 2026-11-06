"""
本地 OpenAI 兼容端点模拟器，用于验证 eval.py 的 local 后端链路。

它会真实地：
  - 接收 eval.py 发出的 POST /v1/chat/completions
  - 按真实模型的行为规律回吐 JSON（部分用例故意答错，用于验证错误能被捕获）
  - 回吐 OpenAI 风格的 usage 字段

用法：
  py -3 fake_server.py 8000
  py -3 eval.py --backend local --base-url http://localhost:8000/v1 --model Xing4.0-29B-Intent
"""

import json
import random
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

SEED = 7
rng = random.Random(SEED)

# 模拟模型的"能力水平"：
#  - category 准确率约 80%
#  - 参数填全率约 70%
#  - 少量负例误触发
GOOD_CATEGORIES = [
    "购买物品", "卖出物品", "查询价格", "查询库存", "查询背包", "丢弃物品",
    "给予物品", "装备物品", "卸下装备", "使用消耗品", "查询自身状态",
    "获取物资", "营地准备", "导航到地点", "查询附近目标", "查询环境状况",
    "查询地点信息", "查询生物情报", "查询神谕", "船只操作", "接取任务",
    "查询任务线索", "查询任务进度", "提交任务", "放弃任务", "威胁或攻击",
    "请求帮助", "闲聊", "告别", "其他意图",
]
SIMILAR = {
    "购买物品": "查询价格", "查询价格": "查询库存", "查询库存": "购买物品",
    "导航到地点": "查询附近目标", "查询附近目标": "导航到地点",
    "查询地点信息": "查询生物情报", "查询生物情报": "查询地点信息",
    "查询神谕": "查询任务线索", "查询任务线索": "查询神谕",
    "接取任务": "查询任务线索", "提交任务": "查询任务进度",
    "获取物资": "营地准备", "营地准备": "获取物资",
    "查询自身状态": "闲聊", "闲聊": "查询自身状态",
}


def guess(schema_text: str, user_input: str) -> list[dict]:
    """从 schema 文本里还原类别名，模拟一个中等水平模型的输出。"""
    cats = []
    try:
        schema = json.loads(schema_text)
        cats = [c["category"] for c in schema]
    except Exception:
        cats = GOOD_CATEGORIES

    if not cats:
        cats = GOOD_CATEGORIES

    # 粗略关键词匹配
    lowered = user_input.lower()
    guess_cat = "其他意图"
    for kw, cat in [
        ("买", "购买物品"), ("多少钱", "查询价格"), ("卖", "卖出物品"),
        ("还有", "查询库存"), ("有没有", "查询库存"), ("背包", "查询背包"),
        ("穿", "装备物品"), ("装备", "装备物品"), ("脱", "卸下装备"),
        ("喝", "使用消耗品"), ("任务", "查询任务线索"), ("接", "接取任务"),
        ("交", "提交任务"), ("放弃", "放弃任务"), ("去", "导航到地点"),
        ("带我去", "导航到地点"), ("风", "查询环境状况"), ("浪", "查询环境状况"),
        ("塞壬", "查询生物情报"), ("斯库拉", "查询生物情报"),
        ("神谕", "查询神谕"), ("预示", "查询神谕"), ("预言", "查询神谕"),
        ("船", "船只操作"), ("开船", "船只操作"), ("钓", "获取物资"),
        ("生火", "营地准备"), ("你好", "闲聊"), ("再见", "告别"),
        ("威胁", "威胁或攻击"), ("单挑", "威胁或攻击"),
    ]:
        if kw in lowered:
            guess_cat = cat
            break

    roll = rng.random()
    if roll < 0.20:
        guess_cat = SIMILAR.get(guess_cat, "闲聊")
    elif roll < 0.28:
        guess_cat = "其他意图"

    args = []
    if guess_cat not in ("闲聊", "告别", "威胁或攻击", "其他意图") and rng.random() < 0.30:
        args = [{}]
    else:
        args = []

    return [{"category": guess_cat, "args": args}]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {}

        content = ""
        for msg in payload.get("messages", []):
            if msg.get("role") == "user":
                content = msg.get("content", "") or ""

        schema_text = ""
        user_input = content
        if "### 字段说明" in content and "### 输入内容" in content:
            schema_text = content.split("### 字段说明", 1)[1].split("### 输入内容", 1)[0].strip()
            user_input = content.split("### 输入内容", 1)[1].strip()

        preds = guess(schema_text, user_input)
        body = {
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "model": payload.get("model", "Xing4.0-29B-Intent"),
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": json.dumps(preds, ensure_ascii=False)},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 1400, "completion_tokens": 40, "total_tokens": 1440},
        }
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"fake OpenAI-compatible server on http://localhost:{port}/v1")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
