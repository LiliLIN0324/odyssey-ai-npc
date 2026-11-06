#!/usr/bin/env python3
"""
Xing4.0-29B-Intent · 游戏 NPC 意图理解评测脚本

用途
    对一组游戏 NPC 对话用例，跑 Xing4.0-29B-Intent，输出：
      - 类别准确率（category exact match）
      - 参数级 Micro-F1（按 category 分桶后逐桶算 F1 再平均）
      - 完全正确率（category + args 全对）
      - 负例误触发率（该落到「其他意图」却落到了具体意图）
      - 延迟分位数（P50 / P90 / P99）
      - 按 group 分组的明细
      - 逐条错误样本（含模型原始输出，便于定位 schema 问题）

后端
    --backend teleai   天翼 AI 开放平台（OpenAI 兼容）
    --backend local    本地 vLLM / SGLang（OpenAI 兼容）
    --backend mock     不调用模型，用黄金答案合成结果，仅用于验证打分管线

用法
    # 冒烟测试（不联网，验证打分逻辑）
    python eval.py --backend mock

    # 天翼平台真实评测
    python eval.py --backend teleai --api-key sk-xxx

    # 本地部署评测
    python eval.py --backend local --base-url http://localhost:8000/v1

    # 只跑某个分组
    python eval.py --backend mock --group confuse,negative

    # 输出逐条明细
    python eval.py --backend mock --verbose
"""

import argparse
import json
import os
import random
import re
import statistics
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

# Windows 控制台默认编码为 GBK，中文输出会乱码。必须在任何输出前重设。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE / "schema.json"
CASES_PATH = HERE / "cases.jsonl"

TELEAI_BASE_URL = "https://api-maas.teleai.com.cn/v1"
TELEAI_MODEL = "Xing4.0-29B-Intent"

# 天翼接口要求：单条 role:user 消息，任务说明 + 完整 schema + 待测输入拼在同一条 content 里。
# 深度思考默认开启，必须显式关闭，否则单题耗时从 0.6s 涨到 2.6s。
TASK_INSTRUCTION = """### 任务说明
根据【字段说明】判断【输入内容】所属类别,并抽取该类别对应的参数。
category 和参数名必须来自字段说明,不得自行新增。
只填写输入中明确表达的参数;没有可填写参数时 args 为 []。
args 中每个对象表示一组相关参数实例,多组独立实例分别放在不同对象中。
如果输入涉及多个类别,以列表形式返回。
如果输入包含多轮对话,根据最后一轮用户输入判断,并结合对话历史抽取参数。
只输出有效 JSON 数组,不包含 Markdown 标记或额外说明。
输出结构:`[{"category":"xxx","args":[{"参数名":"参数值"}]}]`

### 字段说明
{schema}

### 输入内容
{user_input}"""


# --------------------------------------------------------------------------
# 加载
# --------------------------------------------------------------------------

def load_schema(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_cases(path: Path, groups: list[str] | None) -> list[dict]:
    cases = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            case = json.loads(line)
            if groups and case.get("group") not in groups:
                continue
            cases.append(case)
    return cases


def render_user_input(case: dict) -> str:
    """把用例渲染成天翼接口要求的输入文本。多轮历史按 Human/AI 顺序展开。"""
    history = case.get("history")
    if not history:
        return case["text"]
    lines = []
    for turn in history:
        role = "Human" if turn["role"] == "user" else "AI"
        lines.append(f"{role}: {turn['content']}")
    lines.append(f"Human: {case['text']}")
    return "\n".join(lines)


def build_prompt(schema: list[dict], case: dict) -> str:
    # 用 replace 而非 str.format：TASK_INSTRUCTION 里有示例 JSON，花括号会被 format 误当占位符。
    schema_text = json.dumps(schema, ensure_ascii=False)
    return TASK_INSTRUCTION.replace("{schema}", schema_text).replace(
        "{user_input}", render_user_input(case)
    )


# --------------------------------------------------------------------------
# 推理后端
# --------------------------------------------------------------------------

def parse_model_json(content: str) -> list[dict]:
    """从模型输出里抠出 JSON 数组。容错处理 Markdown 包裹和前后缀噪声。"""
    if content is None:
        raise ValueError("empty content")
    text = content.strip()
    # 去掉 ```json 包裹
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    # 直接尝试解析
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass
    # 退而求其次：抓第一个 [ ... ]
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass
    raise ValueError(f"cannot parse JSON from output: {content[:200]!r}")


def normalize_args(raw: Any) -> list[dict]:
    """把 args 统一成 list[dict]。模型可能返回 [] / [{}] / [{...}] / 字典。"""
    if raw is None:
        return []
    if isinstance(raw, dict):
        return [raw] if raw else []
    if isinstance(raw, list):
        out = []
        for item in raw:
            if isinstance(item, dict):
                out.append(item)
        return out
    return []


def call_teleai(prompt: str, api_key: str, timeout: float) -> tuple[list[dict], dict]:
    import urllib.error
    import urllib.request

    payload = {
        "model": TELEAI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 256,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    req = urllib.request.Request(
        f"{TELEAI_BASE_URL}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # 把天翼的业务错误翻译成可行动的中文提示
        detail = ""
        try:
            err_body = json.loads(exc.read().decode("utf-8", errors="replace"))
            detail = err_body.get("message", "") or json.dumps(err_body, ensure_ascii=False)
        except Exception:
            detail = exc.reason or ""
        raise RuntimeError(f"HTTP {exc.code} {exc.reason}｜{detail}") from None
    latency_ms = (time.perf_counter() - start) * 1000
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage") or {}
    return parse_model_json(content), {"latency_ms": latency_ms, "usage": usage, "raw": content}


def call_local(prompt: str, base_url: str, model: str, api_key: str, timeout: float,
               extra_body: dict | None = None) -> tuple[list[dict], dict]:
    """
    本地 / 自建 OpenAI 兼容端点。

    适用三种常见形态：
      - vLLM / SGLang 官方容器：      http://localhost:8000/v1
      - LM Studio：                    http://localhost:1234/v1
      - Ollama 的 OpenAI 兼容层：      http://localhost:11434/v1
    Ollama 与 LM Studio 不支持 max_tokens 与 temperature 之外的多数参数，
    额外参数一律走 extra_body，缺失时自动降级重试一次。
    """
    import urllib.request

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 256,
    }
    if extra_body:
        payload.update(extra_body)

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    def _post(pl: dict) -> dict:
        req = urllib.request.Request(
            f"{base_url.rstrip('/')}/chat/completions",
            data=json.dumps(pl, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    start = time.perf_counter()
    try:
        body = _post(payload)
    except urllib.error.HTTPError as exc:
        # Ollama / LM Studio 对未知参数会直接 400，降级重试一次
        if exc.code == 400 and extra_body:
            body = _post({k: v for k, v in payload.items() if k not in extra_body})
        else:
            raise
    latency_ms = (time.perf_counter() - start) * 1000
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage") or {}
    return parse_model_json(content), {"latency_ms": latency_ms, "usage": usage, "raw": content}


def call_mock(prompt: str, case: dict, noise: float, seed: int) -> tuple[list[dict], dict]:
    """
    用黄金答案合成模型输出，可注入可控噪声，验证打分管线是否正确。

    噪声分三类，用来模拟三种不同的失败模式：
      - 类别改写：分类错误（走错对话分支）
      - 参数丢失：槽位没抽出来
      - 负例误触发：负例被硬塞进某个具体意图（这是游戏 NPC 最致命的失败）

    负例组样本很少，靠概率命中不稳定，所以负例一律确定性误触发，
    确保「负例误触发率」这条指标在任何噪声级别下都能被真实检出。
    """
    rng = random.Random(seed + hash(case["id"]) % 100000)
    is_negative = any(e["category"] == "其他意图" for e in case["expect"])

    if is_negative and noise > 0:
        # 确定性误触发：把负例硬塞进一个具体意图
        cat = rng.choice(["购买物品", "导航到地点", "闲聊", "接取任务", "查询背包"])
        preds = [{"category": cat, "args": []}]
        return preds, {"latency_ms": rng.uniform(180, 500), "usage": {},
                       "raw": json.dumps(preds, ensure_ascii=False)}

    preds = []
    for item in case["expect"]:
        cat = item["category"]
        args = [dict(item.get("args") or {})]
        if noise > 0 and rng.random() < noise:
            roll = rng.random()
            if roll < 0.6 and len(cat) > 1:
                cat = cat[:-1]  # 类别轻微改写
            else:
                args = []  # 参数丢失
        preds.append({"category": cat, "args": args})
    # 随机打乱顺序，验证打分不依赖顺序
    rng.shuffle(preds)
    return preds, {"latency_ms": rng.uniform(180, 500), "usage": {}, "raw": json.dumps(preds, ensure_ascii=False)}


# --------------------------------------------------------------------------
# 打分
# --------------------------------------------------------------------------

def pred_categories(preds: list[dict]) -> list[str]:
    return [p.get("category", "") for p in preds if isinstance(p, dict)]


def category_multiset(preds: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for c in pred_categories(preds):
        counts[c] += 1
    return counts


def instances_for_category(preds: list[dict], category: str) -> list[dict]:
    """
    取出某个类别下的所有「参数实例」。

    官方输出协议允许同一类别出现多个参数实例，且允许两种等价写法：
      A. 多个 category 对象，各带一份 args：
         [{"category":"购买物品","args":[{"物品":"淡水"}]},
          {"category":"购买物品","args":[{"物品":"面包"}]}]
      B. 一个 category 对象，args 内含多个实例：
         [{"category":"购买物品","args":[{"物品":"淡水"},{"物品":"面包"}]}]
    两种写法在这里被拍平成同一个列表，语义一致。
    """
    out = []
    for p in preds:
        if isinstance(p, dict) and p.get("category") == category:
            out.extend(normalize_args(p.get("args")))
    return out


def arg_f1(expected: dict, predicted: list[dict]) -> tuple[float, float, float]:
    """
    单个参数实例 vs 一组预测实例的 F1。

    expected 是单个实例的键值字典；predicted 是若干候选实例。
    对每个槽位名，把期望值与预测值做多重集匹配，值必须完全相同才算命中，
    避免部分给分掩盖「填错值」这种致命错误。
    """
    exp_items = list((expected or {}).items())
    pred_items: dict[str, list[Any]] = defaultdict(list)
    for d in predicted:
        for k, v in d.items():
            pred_items[k].append(v)

    tp = fp = fn = 0
    exp_keys = {k for k, _ in exp_items}
    pred_keys = set(pred_items)

    for key in exp_keys | pred_keys:
        exp_vals = [v for k, v in exp_items if k == key]
        pred_vals = pred_items.get(key, [])
        if not exp_vals:
            fp += len(pred_vals)  # 预测多出了这个槽位
            continue
        if not pred_vals:
            fn += len(exp_vals)  # 该填没填
            continue
        remaining = list(exp_vals)
        matched = 0
        for pv in pred_vals:
            if pv in remaining:
                remaining.remove(pv)
                matched += 1
        tp += matched
        fp += len(pred_vals) - matched
        fn += len(remaining)

    if tp == 0 and fp == 0 and fn == 0:
        return 1.0, 1.0, 1.0
    if tp == 0:
        return 0.0, 0.0, 1.0
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    f1 = 2 * precision * recall / (precision + recall)
    return precision, recall, f1


def match_instances(exp_instances: list[dict], pred_instances: list[dict]) -> list[tuple[float, dict | None, dict | None]]:
    """
    把期望实例与预测实例做贪心最优配对。

    返回 [(f1, 期望实例, 匹配的预测实例或None), ...]。
    先取 F1 最高的对子逐个锁定，再处理剩余，避免「第一个预测实例被多个期望争抢」。
    """
    pairs = []
    used_pred = set()
    for ei, exp_inst in enumerate(exp_instances):
        best_f1, best_pi = 0.0, None
        for pi, pred_inst in enumerate(pred_instances):
            if pi in used_pred:
                continue
            _, _, f1 = arg_f1(exp_inst, [pred_inst])
            if f1 > best_f1:
                best_f1, best_pi = f1, pi
        if best_pi is not None and best_f1 > 0:
            used_pred.add(best_pi)
        pairs.append((best_f1, exp_inst, pred_instances[best_pi] if best_pi is not None else None))
    return pairs


def score_case(case: dict, preds: list[dict]) -> dict:
    """对单条用例打分。"""
    exp_cats = [e["category"] for e in case["expect"]]
    pred_cats = pred_categories(preds)

    exp_set = set(exp_cats)
    pred_set = set(pred_cats)

    # 类别命中：集合相等。这是游戏侧真正关心的「路由到哪条对话分支」。
    category_correct = exp_set == pred_set

    # 参数 F1：按类别分桶，桶内对实例做贪心配对。
    f1_list = []
    per_category = {}
    extra_instances = 0
    for cat in sorted(exp_set):
        exp_instances = [
            (e.get("args") or {})
            for e in case["expect"]
            if e["category"] == cat
        ]
        # 期望是「无参数」的类别，其参数集合为空
        pred_instances = instances_for_category(preds, cat)
        pairs = match_instances(exp_instances, pred_instances)
        cat_f1s = []
        for f1, _exp, _pred in pairs:
            if not exp_instances[0] and not pred_instances:
                cat_f1s.append(1.0)
            else:
                cat_f1s.append(f1)
        # 预测出了多余的实例
        extra_instances += max(0, len(pred_instances) - len(exp_instances))
        mean_f1 = sum(cat_f1s) / len(cat_f1s) if cat_f1s else 0.0
        per_category[cat] = round(mean_f1, 4)
        f1_list.extend(cat_f1s)

    # 多余的预测类别：模型编出了不存在的意图
    extra_cats = [c for c in pred_cats if c not in exp_set]

    args_f1 = sum(f1_list) / len(f1_list) if f1_list else 0.0
    fully_correct = (
        category_correct
        and not extra_cats
        and extra_instances == 0
        and all(f == 1.0 for f in f1_list)
    )

    # 负例误触发：期望落到「其他意图」，却预测成了具体意图
    expects_fallback = "其他意图" in exp_set
    false_trigger = expects_fallback and not (pred_set == {"其他意图"})

    return {
        "category_correct": category_correct,
        "args_f1": args_f1,
        "fully_correct": fully_correct,
        "false_trigger": false_trigger,
        "expected": exp_cats,
        "predicted": pred_cats,
        "extra_categories": extra_cats,
        "extra_instances": extra_instances,
        "per_category_f1": per_category,
    }


# --------------------------------------------------------------------------
# 统计
# --------------------------------------------------------------------------

def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * pct / 100.0
    f = int(k)
    c = min(f + 1, len(ordered) - 1)
    if f == c:
        return ordered[f]
    return ordered[f] + (ordered[c] - ordered[f]) * (k - f)


def summarize(results: list[dict], cases: list[dict], latencies: list[float]) -> dict:
    total = len(results)
    if total == 0:
        return {"total": 0}

    cat_acc = sum(1 for r in results if r["category_correct"]) / total
    args_f1 = sum(r["args_f1"] for r in results) / total
    full_acc = sum(1 for r in results if r["fully_correct"]) / total

    # 误触发率：覆盖所有「期望落到其他意图」的用例。
    # 注意不能只看 negative 组——期望兜底的用例散落在 state_set / oov / boundary 等组，
    # 而 game_id 直接存在 result 里，用 result["group"] 而非与 cases 做 zip，
    # 因为 results 已按 id 重排序而 cases 保持文件顺序，两者下标并不对齐。
    fallback_cases = [r for r in results if "其他意图" in r["expected"]]
    false_trigger_rate = (
        sum(1 for r in fallback_cases if r["false_trigger"]) / len(fallback_cases)
        if fallback_cases
        else None
    )

    by_group = {}
    group_names = sorted({r["group"] for r in results})
    for g in group_names:
        gr = [r for r in results if r["group"] == g]
        by_group[g] = {
            "n": len(gr),
            "category_acc": round(sum(1 for r in gr if r["category_correct"]) / len(gr), 4),
            "args_f1": round(sum(r["args_f1"] for r in gr) / len(gr), 4),
            "fully_correct": round(sum(1 for r in gr if r["fully_correct"]) / len(gr), 4),
        }

    # 混淆对：哪些期望类别被判成了别的类别
    confusion = defaultdict(int)
    for r in results:
        if not r["category_correct"]:
            exp = "/".join(sorted(set(r["expected"])))
            got = "/".join(sorted(set(r["predicted"])))
            confusion[f"{exp} -> {got}"] += 1

    lat = {
        "p50": round(percentile(latencies, 50), 1),
        "p90": round(percentile(latencies, 90), 1),
        "p99": round(percentile(latencies, 99), 1),
        "mean": round(statistics.fmean(latencies), 1) if latencies else 0,
        "max": round(max(latencies), 1) if latencies else 0,
    }

    return {
        "total": total,
        "category_accuracy": round(cat_acc, 4),
        "args_f1": round(args_f1, 4),
        "fully_correct_rate": round(full_acc, 4),
        "false_trigger_rate": round(false_trigger_rate, 4) if false_trigger_rate is not None else None,
        "fallback_case_count": len(fallback_cases),
        "latency_ms": lat,
        "by_group": by_group,
        "top_confusions": sorted(confusion.items(), key=lambda kv: -kv[1])[:15],
    }


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------

def run_case(schema, case, args, index):
    prompt = build_prompt(schema, case)
    error = None
    try:
        if args.backend == "teleai":
            preds, meta = call_teleai(prompt, args.api_key, args.timeout)
        elif args.backend == "local":
            extra = {}
            if args.ollama:
                # Ollama 的 OpenAI 兼容层不认 chat_template_kwargs，
                # 深度思考需通过其原生 option 关闭。
                extra = {"options": {"num_predict": 256, "temperature": 0}}
            preds, meta = call_local(
                prompt, args.base_url, args.model, args.api_key, args.timeout, extra
            )
        else:
            preds, meta = call_mock(prompt, case, args.mock_noise, args.seed)
    except Exception as exc:  # 单条失败不应中断整轮
        preds, meta = [], {"latency_ms": 0.0, "usage": {}, "raw": "", "error": f"{type(exc).__name__}: {exc}"}
        error = meta["error"]
    scored = score_case(case, preds)
    scored["id"] = case["id"]
    scored["group"] = case["group"]
    scored["text"] = case["text"]
    scored["latency_ms"] = round(meta.get("latency_ms", 0.0), 1)
    scored["usage"] = meta.get("usage", {})
    if args.verbose or error:
        scored["raw_output"] = meta.get("raw", "")
    if error:
        scored["error"] = error
    return scored


def print_report(summary: dict, results: list[dict], args):
    print("=" * 68)
    print("Xing4.0-29B-Intent · 游戏 NPC 意图理解评测")
    print("=" * 68)
    print(f"后端        : {args.backend}")
    print(f"用例总数    : {summary['total']}")
    print()
    print(f"类别准确率  : {summary['category_accuracy']:.4f}   (category 集合完全命中)")
    print(f"参数级 F1   : {summary['args_f1']:.4f}   (逐 category 桶算 F1 后平均)")
    print(f"完全正确率  : {summary['fully_correct_rate']:.4f}   (category + args 全对)")
    if summary["false_trigger_rate"] is not None:
        print(f"负例误触发  : {summary['false_trigger_rate']:.4f}   "
              f"(应落「其他意图」却没落，共 {summary['fallback_case_count']} 条兜底用例)")
    print()
    lat = summary["latency_ms"]
    print(f"延迟 ms     : P50={lat['p50']}  P90={lat['p90']}  P99={lat['p99']}  mean={lat['mean']}  max={lat['max']}")
    print()
    print("-" * 68)
    print(f"{'分组':<14}{'n':>5}{'类别准确':>12}{'参数F1':>10}{'完全正确':>12}")
    print("-" * 68)
    for g, s in summary["by_group"].items():
        print(f"{g:<14}{s['n']:>5}{s['category_acc']:>12.4f}{s['args_f1']:>10.4f}{s['fully_correct']:>12.4f}")
    print("-" * 68)
    print()

    if summary["top_confusions"]:
        print("主要混淆对：")
        for pair, cnt in summary["top_confusions"]:
            print(f"  {cnt:>3}x  {pair}")
        print()

    errors = [r for r in results if not r["fully_correct"]]
    if errors:
        print(f"未完全正确的用例 {len(errors)} 条。前 25 条：")
        print()
        for r in errors[:25]:
            print(f"[{r['id']}] ({r['group']}) {r['text']}")
            print(f"    期望: {r['expected']}")
            print(f"    预测: {r['predicted']}")
            if r["extra_categories"]:
                print(f"    多余类别: {r['extra_categories']}")
            if r.get("error"):
                print(f"    错误: {r['error']}")
            print()

    # 全部请求都失败时，给出可行动的排查建议
    failed = [r for r in results if r.get("error")]
    if len(failed) == len(results) and results:
        first = failed[0]["error"]
        print("=" * 68)
        print("所有请求均失败，问题在接口调用而非模型表现。排查顺序：")
        print("=" * 68)
        if "403" in first and ("余额" in first or "订单" in first):
            print("""
  天翼接口返回 403「账户无余额或订单已失效」。

  这说明：网络正常、API Key 有效、模型名正确，请求已通过鉴权，
  但你的账户下该模型没有可用额度。

  处理方式（任选其一）：
    1. 去天翼AI开放平台控制台充值或续订账号额度
       https://console.teleai.com.cn/overview
    2. 在「模型管理」页确认 XING4.0-29B-INTENT 已开通且有免费额度
    3. 若平台有「免费体验」入口，先申请体验额度
    4. 改用本地部署（需 24GB+ 显卡，见 README「本地端点形态」）

  Key 本身没问题，无需重新申请。
""")
        elif "401" in first:
            print("\n  401：API Key 无效或未生效。请确认 key.txt 内容正确、且未包含多余空格。\n")
        elif "404" in first:
            print("\n  404：模型名或接口地址不对。模型名应为 Xing4.0-29B-Intent，"
                  "地址应为 https://api-maas.teleai.com.cn/v1/chat/completions\n")
        else:
            print(f"\n  首个错误：{first}\n")


KEY_FILE_CANDIDATES = [
    "key.txt", "key.txt.txt", "key", "apikey.txt", "teleai-key.txt", ".key",
]

# 模板占位符，出现即说明这一行还没被替换
PLACEHOLDER_PATTERNS = ("PUT-YOUR-KEY", "PUT_YOUR_KEY", "YOUR-KEY-HERE", "在此填入", "填写你的")

# Key 形如 sk-xxxx，可能由字母数字与 _- 组成
KEY_TOKEN_RE = re.compile(r"sk-[A-Za-z0-9_\-]{16,}")


def read_api_key(args) -> str:
    """
    按优先级解析 API Key：显式参数 > 环境变量 > 文件。

    文件解析规则（逐行、从后往前）：
      - 跳过空行与 # 注释行
      - 跳过模板占位符行
      - 从行内用正则提取 sk- 开头的 token，因此无论 Key 是
        独占一行，还是误跟在占位符/命令后面，都能被取到
      - 同名候选文件按 KEY_FILE_CANDIDATES 顺序取第一个命中项
    """
    if args.api_key:
        return args.api_key.strip()

    candidates = []
    if args.api_key_file:
        candidates.append(Path(args.api_key_file).expanduser())
    else:
        for name in KEY_FILE_CANDIDATES:
            candidates.append(Path.cwd() / name)
            candidates.append(HERE / name)

    for p in candidates:
        try:
            if not p.is_file():
                continue
            found = ""
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip().lstrip("\ufeff")  # 去 BOM
                if not line or line.startswith("#"):
                    continue
                # 逐个 token 提取，跳过占位符
                for token in KEY_TOKEN_RE.findall(line):
                    if any(pat in token.upper() for pat in PLACEHOLDER_PATTERNS):
                        continue
                    found = token  # 保留最后一个有效 Key
            if found:
                return found
        except (OSError, UnicodeDecodeError):
            continue

    if args.api_key_file:
        raise SystemExit(f"错误：指定的 api-key 文件不存在或内容无效：{args.api_key_file}")
    return ""


def main():
    p = argparse.ArgumentParser(description="Xing4.0-29B-Intent 游戏 NPC 评测")
    p.add_argument("--backend", choices=["teleai", "local", "mock"], default="mock",
                   help="teleai=天翼平台 / local=本地OpenAI兼容端点 / mock=不联网自检")
    p.add_argument("--api-key", default=os.environ.get("TELEAI_API_KEY", ""),
                   help="天翼 API Key。也可用环境变量 TELEAI_API_KEY，"
                        "或 --api-key-file 指定存放 Key 的文件")
    p.add_argument("--api-key-file", default="",
                   help="从文件读取 API Key（首行有效）。文件内容不会被打印到日志")
    p.add_argument("--base-url", default=os.environ.get("XING_BASE_URL", "http://localhost:8000/v1"),
                   help="本地 OpenAI 兼容端点。Ollama 用 http://localhost:11434/v1，"
                        "LM Studio 用 http://localhost:1234/v1")
    p.add_argument("--model", default=os.environ.get("XING_MODEL", "Xing4.0-29B-Intent"),
                   help="served-model-name")
    p.add_argument("--ollama", action="store_true",
                   help="按 Ollama 兼容层调整请求参数（配合 base-url 指向 11434 端口）")
    p.add_argument("--schema", default=str(SCHEMA_PATH), help="schema json 路径")
    p.add_argument("--cases", default=str(CASES_PATH), help="用例 jsonl 路径")
    p.add_argument("--group", default="", help="只跑指定分组，逗号分隔")
    p.add_argument("--limit", type=int, default=0, help="只跑前 N 条")
    p.add_argument("--workers", type=int, default=4, help="并发数")
    p.add_argument("--timeout", type=float, default=60.0, help="单请求超时秒数")
    p.add_argument("--mock-noise", type=float, default=0.0, help="mock 模式噪声注入比例")
    p.add_argument("--seed", type=int, default=42, help="随机种子")
    p.add_argument("--verbose", action="store_true", help="打印模型原始输出")
    p.add_argument("--out", default="", help="结果写入 json 文件")
    args = p.parse_args()

    args.api_key = read_api_key(args)

    if args.backend == "teleai" and not args.api_key:
        print(
            "错误：缺少天翼 API Key。三种获取方式任选其一：\n"
            "  1) 环境变量：  $env:TELEAI_API_KEY = 'sk-xxx'\n"
            "  2) 文件：      --api-key-file D:\\path\\key.txt（首行有效）\n"
            "  3) 直接传参：  --api-key sk-xxx\n"
            "\n"
            "Key 申请路径：\n"
            "  1. 登录 https://console.teleai.com.cn/overview\n"
            "  2. 进入「模型服务」控制台 → API 管理 / 模型管理\n"
            "  3. 开通模型 XING4.0-29B-INTENT（算法编码 8005300088）并申请 API Key\n"
            "  4. 在「API Key 管理」页面获取长效 Key\n"
            "\n"
            "接口地址：https://api-maas.teleai.com.cn/v1/chat/completions\n"
            "接口文档：https://www.teleai.com.cn/doc/1MBaE2xId9JYYxLXUz2R/3jUbsGzfAj0Qe4A38Y0s",
            file=sys.stderr,
        )
        return 2

    schema = load_schema(Path(args.schema))
    groups = [g.strip() for g in args.group.split(",") if g.strip()] or None
    cases = load_cases(Path(args.cases), groups)
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        print("错误：没有匹配的用例", file=sys.stderr)
        return 2

    print(f"载入 {len(cases)} 条用例，{len(schema)} 个类别，开始评测（backend={args.backend}）...\n")

    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_case, schema, c, args, i) for i, c in enumerate(cases)]
        results = []
        for i, fut in enumerate(futures, 1):
            results.append(fut.result())
            if i % 25 == 0 or i == len(futures):
                print(f"  进度 {i}/{len(futures)}")
    wall = time.perf_counter() - start

    results.sort(key=lambda r: r["id"])
    latencies = [r["latency_ms"] for r in results]
    summary = summarize(results, cases, latencies)
    summary["wall_seconds"] = round(wall, 2)

    print_report(summary, results, args)

    if args.out:
        out = Path(args.out)
        out.write_text(
            json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"结果已写入 {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
