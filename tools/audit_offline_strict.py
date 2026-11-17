#!/usr/bin/env python3
"""离线意图引擎的实例级严格审计。

eval.py 的 score_case 是正式打分口径；本工具额外绕过其较宽松的 F1 配对，
直接对全量 cases.jsonl 做多重集比较：

- 类别集合必须完全一致；
- 同一类别下的参数实例数量和键值必须完全一致；
- 不允许出现 schema/黄金答案中均不存在的参数键；
- 数量必须是字符串数字；
- 预测 args 必须始终是对象数组。

默认使用 game-currentNPC 场景夹具（与 tools/eval_offline.py 默认一致）。
--context plain 只发送 text/history，用于观察缺少运行时 NPC 时的上下文缺口。
本工具不访问网络，也不读取模型服务。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

import eval_offline  # noqa: E402

ROOT = eval_offline.ROOT
EVAL_MOD = eval_offline.load_eval_module()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="离线意图引擎全量实例严格审计")
    parser.add_argument("--context", choices=("game", "plain"), default="game",
                        help="game=附带章节 currentNPC 夹具；plain=只传 text/history")
    parser.add_argument("--node-bin", default="node", help="Node.js 可执行文件")
    return parser.parse_args()


def canonical(instance: dict) -> str:
    return json.dumps(instance, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main() -> int:
    args = parse_args()
    schema = json.loads((ROOT / "schema.json").read_text(encoding="utf-8"))
    schema_keys = {
        item["category"]: {arg["name"] for arg in item.get("args", [])}
        for item in schema
    }
    cases = EVAL_MOD.load_cases(ROOT / "cases.jsonl", None)

    gold_keys = defaultdict(set)
    for case in cases:
        for expectation in case.get("expect", []):
            gold_keys[expectation["category"]].update((expectation.get("args") or {}).keys())
    allowed_keys = {
        category: schema_keys.get(category, set()) | gold_keys.get(category, set())
        for category in set(schema_keys) | set(gold_keys)
    }

    safe_cases = []
    for case in cases:
        item = {"id": case["id"], "text": case["text"], "history": case.get("history", [])}
        if args.context == "game":
            npc_key = eval_offline.GAME_NPC_BY_GROUP.get(case.get("group", ""), "")
            if npc_key:
                item["npcKey"] = npc_key
        safe_cases.append(item)

    try:
        proc = subprocess.run(
            [args.node_bin, str(eval_offline.PREDICTOR)],
            input=json.dumps({"cases": safe_cases}, ensure_ascii=False),
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )
        rows = json.loads(proc.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        detail = getattr(exc, "stderr", "") or str(exc)
        print(f"离线预测适配器执行失败：{detail}", file=sys.stderr)
        return 2

    pred_by_id = {row["id"]: row.get("preds") or [] for row in rows}
    failures = []
    exact_cases = 0

    for case in cases:
        case_id = case["id"]
        preds = pred_by_id.get(case_id, [])
        expected_by_category = defaultdict(list)
        actual_by_category = defaultdict(list)

        for expectation in case.get("expect", []):
            instance = expectation.get("args") or {}
            if instance:
                expected_by_category[expectation["category"]].append(canonical(instance))

        for prediction in preds:
            category = prediction.get("category", "")
            prediction_args = prediction.get("args")
            if not isinstance(prediction_args, list):
                failures.append((case_id, "args-not-list", prediction))
                continue
            for instance in prediction_args:
                if not isinstance(instance, dict):
                    failures.append((case_id, "arg-not-object", instance))
                    continue
                if not instance:
                    continue
                illegal_keys = set(instance) - allowed_keys.get(category, set())
                if illegal_keys:
                    failures.append((case_id, f"illegal-keys {sorted(illegal_keys)}", instance))
                count = instance.get("数量")
                if count is not None and (not isinstance(count, str) or not count.isdigit()):
                    failures.append((case_id, "count-not-digit-string", count))
                actual_by_category[category].append(canonical(instance))

        expected_categories = {item["category"] for item in case.get("expect", [])}
        actual_categories = {prediction.get("category", "") for prediction in preds}
        problems = []
        if expected_categories != actual_categories:
            problems.append(
                f"category expected={sorted(expected_categories)} actual={sorted(actual_categories)}"
            )

        for category in expected_categories | actual_categories:
            expected_counter = Counter(expected_by_category.get(category, []))
            actual_counter = Counter(actual_by_category.get(category, []))
            if expected_counter == actual_counter:
                continue
            missing = list((expected_counter - actual_counter).elements())
            extra = list((actual_counter - expected_counter).elements())
            details = []
            if missing:
                details.append(f"missing={missing}")
            if extra:
                details.append(f"extra={extra}")
            if details:
                problems.append(f"{category} {' '.join(details)}")

        if problems:
            failures.append((
                case_id,
                "; ".join(problems),
                {"text": case["text"], "expect": case.get("expect", []), "preds": preds},
            ))
        else:
            exact_cases += 1

    print(f"context={args.context} exact_cases={exact_cases}/{len(cases)} failures={len(failures)}")
    for case_id, problem, detail in failures[:50]:
        print(f"\n[{case_id}] {problem}")
        print(json.dumps(detail, ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
