"""重跑 result-teleai.json 里失败的用例（429 限流），单并发安全重试，合并回原文件。"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
import eval as ev  # noqa: E402

RESULT = HERE / "result-teleai.json"
data = json.loads(RESULT.read_text(encoding="utf-8"))
results = data["results"]
failed_ids = {r["id"] for r in results if r.get("error")}
print(f"需要重跑 {len(failed_ids)} 条: {sorted(failed_ids)}")

schema = ev.load_schema(ev.SCHEMA_PATH)
all_cases = ev.load_cases(ev.CASES_PATH, None)
by_id = {c["id"]: c for c in all_cases}

import argparse as _ap
ev_args = _ap.Namespace(backend="teleai", api_key=ev.read_api_key(
    _ap.Namespace(api_key="", api_key_file="")), base_url="", model="Xing4.0-29B-Intent",
    ollama=False, timeout=60.0, mock_noise=0.0, seed=42, verbose=True)

# 单线程逐条重跑，每条之间隔 0.6s，远低于 5 QPS
fixed = 0
for i, r in enumerate(results):
    if r["id"] not in failed_ids:
        continue
    case = by_id[r["id"]]
    for attempt in range(3):
        try:
            time.sleep(1.2)
            scored = ev.run_case(schema, case, ev_args, 0)
            break
        except Exception as exc:  # pragma: no cover
            print(f"  retry {r['id']} attempt {attempt+1}: {exc}")
    else:
        continue
    # 保留原字段结构，替换打分结果
    for k in ("category_correct", "args_f1", "fully_correct", "false_trigger",
              "expected", "predicted", "extra_categories", "extra_instances",
              "per_category_f1", "latency_ms", "usage"):
        if k in scored:
            r[k] = scored[k]
    r.pop("error", None)
    r.pop("raw_output", None)
    if scored.get("raw_output"):
        r["raw_output"] = scored["raw_output"]
    fixed += 1
    print(f"  fixed {r['id']}: pred={r['predicted']}")

print(f"共修复 {fixed}/{len(failed_ids)}")

# 重新汇总
lat = [r["latency_ms"] for r in results]
summary = ev.summarize(results, all_cases, lat)
summary["wall_seconds"] = data["summary"].get("wall_seconds")
data["summary"] = summary
RESULT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("已写回", RESULT)
ev.print_report(summary, results, ev_args)
