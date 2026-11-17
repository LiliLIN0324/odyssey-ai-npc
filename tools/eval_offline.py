#!/usr/bin/env python3
"""使用根目录 eval.py 的同一套 score_case 规则验收离线意图引擎。

本脚本不访问网络，也不调用天翼或本地大模型；它通过 Node 适配器调用
odyssey-witch/src/agent/localIntent.js，并把 cases.jsonl 中的结构化
history 传给离线引擎。多轮口径与 eval.render_user_input() 使用同一份 history。

默认使用“游戏调用链上下文”夹具：考卷按章节分组，真实 send() 调用离线兜底时
一定带有 currentNPC；夹具只传入游戏中真实存在的 NPC key，不发送黄金答案。
加 --plain-context 可退化为与 eval.py 在线请求一致的纯 text + history 协议。

示例：
    python3 tools/eval_offline.py
    python3 tools/eval_offline.py --plain-context
    python3 tools/eval_offline.py --group multiturn,multi --verbose
    python3 tools/eval_offline.py --out /tmp/offline-result.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
EVAL_PATH = ROOT / "eval.py"
PREDICTOR = ROOT / "tools" / "offline_eval_predict.cjs"

# 场景夹具：考卷的 *_oov 分组对应游戏中的固定 NPC 章节。这里只提供运行时 NPC
# 标识，引擎再由自己的 NPC 显示名词典解析“她/他”；不是用例 ID 或答案对照表。
GAME_NPC_BY_GROUP = {
    "hades_oov": "seer",
    "wind_oov": "aeolus",
    "ch3_oov": "siren",
    "ch5_oov": "calypso",
    "ch6_oov": "nausicaa",
    "ithaca_oov": "telemachus",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_eval_module():
    spec = importlib.util.spec_from_file_location("official_eval", EVAL_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载官方评分脚本：{EVAL_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args():
    parser = argparse.ArgumentParser(description="离线意图引擎 × 正式考卷评分")
    parser.add_argument("--schema", default=str(ROOT / "schema.json"), help="schema json 路径")
    parser.add_argument("--cases", default=str(ROOT / "cases.jsonl"), help="用例 jsonl 路径")
    parser.add_argument("--group", default="", help="只跑指定分组，逗号分隔")
    parser.add_argument("--limit", type=int, default=0, help="只跑筛选后的前 N 条")
    parser.add_argument("--node-bin", default="node", help="Node.js 可执行文件")
    parser.add_argument("--plain-context", action="store_true",
                        help="只传 text/history，不使用分组章节对应的 currentNPC 夹具")
    parser.add_argument("--verbose", action="store_true", help="打印全部未完全正确用例")
    parser.add_argument("--out", default="", help="把完整结果写入 JSON 文件")
    return parser.parse_args()


def run_predictions(node_bin: str, cases: list[dict], game_context: bool) -> dict[str, list[dict]]:
    # 预测进程不接收 expect；game_context 开启时只额外接收运行时 npcKey。
    safe_cases = []
    for case in cases:
        item = {
            "id": case["id"],
            "text": case["text"],
            "history": case.get("history", []),
        }
        if game_context:
            npc_key = GAME_NPC_BY_GROUP.get(case.get("group", ""), "")
            if npc_key:
                item["npcKey"] = npc_key
        safe_cases.append(item)
    payload = json.dumps({"cases": safe_cases}, ensure_ascii=False)
    proc = subprocess.run(
        [node_bin, str(PREDICTOR)],
        input=payload,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"离线引擎适配器执行失败（exit={proc.returncode}）：\n{proc.stderr}")
    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"离线引擎输出不是合法 JSON：{exc}\nSTDOUT:\n{proc.stdout[:1000]}") from exc
    return {row["id"]: row.get("preds") or [] for row in rows}


def main() -> int:
    args = parse_args()
    eval_mod = load_eval_module()
    schema = eval_mod.load_schema(Path(args.schema))

    groups = [g.strip() for g in args.group.split(",") if g.strip()] or None
    cases = eval_mod.load_cases(Path(args.cases), groups)
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        print("错误：没有匹配的用例", file=sys.stderr)
        return 2

    game_context = not args.plain_context
    pred_by_id = run_predictions(args.node_bin, cases, game_context)
    results = []
    for case in cases:
        preds = pred_by_id.get(case["id"], [])
        scored = eval_mod.score_case(case, preds)
        scored["id"] = case["id"]
        scored["group"] = case["group"]
        scored["text"] = case["text"]
        scored["history"] = case.get("history", [])
        scored["expect"] = case.get("expect", [])
        scored["preds"] = preds
        scored["latency_ms"] = 0.0
        results.append(scored)

    results.sort(key=lambda row: row["id"])
    summary = eval_mod.summarize(results, cases, [0.0 for _ in results])
    summary["backend"] = "offline-localIntent"
    summary["schema_categories"] = len(schema)
    summary["context_mode"] = "game-currentNPC-fixture" if game_context else "plain-text-history"
    print(f"上下文口径：{summary['context_mode']}（--plain-context 可切换为纯 text+history）")

    report_args = SimpleNamespace(backend="offline-localIntent", verbose=args.verbose)
    eval_mod.print_report(summary, results, report_args)

    if args.verbose:
        failures = [row for row in results if not row["fully_correct"]]
        if failures:
            print("-" * 68)
            print(f"全部未完全正确用例（{len(failures)} 条）：")
            for row in failures:
                print(f"\n[{row['id']}] ({row['group']}) {row['text']}")
                if row["history"]:
                    for turn in row["history"]:
                        role = "Human" if turn.get("role") == "user" else "AI"
                        print(f"    {role}: {turn.get('content', '')}")
                print(f"    期望: {json.dumps(row['expect'], ensure_ascii=False)}")
                print(f"    预测: {json.dumps(row['preds'], ensure_ascii=False)}")

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(
            json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"结果已写入 {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
