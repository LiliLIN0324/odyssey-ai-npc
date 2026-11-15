// Cloudflare Pages Function：POST /api/parse
// 契约与 server.py 一致：入参 {prompt}（可选 {ck} 宽松缓存键），出参 {content}（或 {error} + 状态码）。
//
// 2026-11-15 线上 API 批次（把「上游一抖动就全线降级」这条路堵上）：
//  ① **共享缓存**：相同 prompt 直接命中缓存 → 0 次上游调用、毫秒级返回、不扣额度。
//     无对话历史的第一句话还能跨玩家命中（见 cache.js 的 contextFreeKey）。
//  ② **兜底模型**：意图模型被上游 403 集群打穿（重试耗尽）→ 换通用模型 xing4.0-29b-a4b
//     用同一 prompt、temperature 0 再来一次；它的 args 形状是 [{name,value}]，
//     这里统一**归一化成客户端要的形状**（一个实例一个对象）。
//  ③ **stale-if-error**：模型全挂了 → 用宽松键捞一条同话题旧答案顶上，
//     比掉进「离线引擎」（规则匹配）体面得多。
//  ④ **成功才扣额度**（见 _lib/quota.js）：失败请求不再吃玩家的额度。
//  ⑤ **总预算**：整个请求的服务端耗时封顶（TOTAL_BUDGET_MS），客户端超时设得比它宽 3 秒。
//     早先的版本重试 ×4 + 兜底 ×2，单次超时 12s → 最坏能拖 70s+，玩家早跑光了。
//  密钥只从环境变量读取，绝不进前端/仓库。

import { peekQuota, consumeQuota, bumpFail } from "../_lib/quota.js";
import {
  cacheGet, cachePut, cacheSweep, promptKey, looseKey, contextFreeKey, schemaVersionOf,
} from "../_lib/cache.js";

const API_URL = "https://api-maas.teleai.com.cn/v1/chat/completions";
const MODEL_PARSE = "xing4.0-29b-intent";
const MODEL_FALLBACK = "xing4.0-29b-a4b";   // 通用 29B：意图模型被限流时的兜底
const RETRY_DELAYS_MS = [400, 1000, 2200];   // 主模型：总计最多 4 次尝试
const FALLBACK_DELAYS_MS = [600];            // 兜底模型：最多 2 次尝试
const JITTER = 0.35;
const UPSTREAM_TIMEOUT_MS = 12000;          // 单次上游超时上限（会被 deadline 进一步压短）
const TOTAL_BUDGET_MS = 12000;              // 整个请求的服务端总预算
const PRIMARY_BUDGET_MS = 7500;             // 主模型最多吃掉的预算（剩下的留给兜底模型）

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ---------- 上游调用 ---------- */
async function once(env, model, messages, maxTokens, temperature, timeoutMs) {
  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    chat_template_kwargs: { enable_thinking: false },   // 仓库坑 #2：不关深度思考延迟 ×5
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1500, timeoutMs || UPSTREAM_TIMEOUT_MS));
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TELEAI_API_KEY}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (resp.ok) {
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("上游响应缺少 choices[0].message.content");
      return content;
    }
    const detail = await resp.text().catch(() => "");
    let msg = "";
    try { msg = JSON.parse(detail).message || ""; } catch (e) { /* 保留原始 reason */ }
    const err = new Error(msg || resp.statusText || "upstream error");
    err.status = resp.status;
    // 403/429/5xx：可能是上游对数据中心出口 IP 的间歇限制 → 退避重试；其余 4xx 不重试
    if (!(resp.status === 403 || resp.status === 429 || resp.status >= 500)) throw err;
    return null;   // 可重试
  } finally {
    clearTimeout(timer);
  }
}

/** 在预算内重试一个模型。deadline 到了就收手（不空转等退避）。 */
async function callModel(env, model, messages, maxTokens, temperature, delays, deadline) {
  let lastErr = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      const base = delays[attempt - 1];
      const wait = Math.round(base * (1 + (Math.random() * 2 - 1) * JITTER));
      if (Date.now() + wait > deadline) break;          // 退避完就没预算了 → 别等
      await new Promise((r) => setTimeout(r, wait));
    }
    const remain = deadline - Date.now();
    if (remain < 1500) break;                           // 剩余时间不够一次像样的调用
    try {
      const out = await once(env, model, messages, maxTokens, temperature, Math.min(UPSTREAM_TIMEOUT_MS, remain));
      if (out !== null) return out;
      lastErr = new Error("upstream retryable error");
      lastErr.status = 503;
    } catch (e) {
      if (e.name === "AbortError") { lastErr = new Error("upstream timeout"); lastErr.status = 504; }
      else if (e.status) lastErr = e;
      else lastErr = new Error(String(e.message || e));
      if (!(e.status === 403 || e.status === 429 || e.status >= 500)) break;   // 4xx 不重试
    }
  }
  throw lastErr || new Error("upstream failed");
}

/* ---------- 归一化：把模型的输出整成客户端要的形状 ---------- */
/* 客户端约定：preds = [{category, args:[{参数名:参数值}, ...]}]，args 数组的每个元素是**一组实例**。
   - 意图模型：args = [{"物品":"治疗草药","数量":"1"}]            → 1 组实例 ✓ 原样
   - 兜底模型：args = [{"name":"物品","value":"治疗草药"}, ...]  → 名字/值对 → **折成 1 组实例**
     （若照抄成多组实例，客户端会把「数量」当成第二个实例丢掉物品参数 —— 形状错 = 参数全丢）
   - 混合写法（个别元素带 name、个别不带）：按名字/值对那一套统一折成 1 组实例，
     否则客户端会把它读成「买一样东西」+「买 0 样东西」两轮。 */
export function normalizePreds(text) {
  let raw = String(text || "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  raw = raw.slice(start, end + 1);
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const p of arr) {
    if (!p || typeof p !== "object" || !p.category) continue;
    const a = p.args;
    const insts = [];
    if (Array.isArray(a) && a.length) {
      const hasName = a.some((x) => x && typeof x === "object" && "name" in x && !("category" in x));
      if (hasName) {
        const obj = {};
        for (const x of a) {
          if (!x || typeof x !== "object") continue;
          if ("name" in x && !("category" in x)) {
            const v = x.value !== undefined ? x.value : x.val;
            if (v !== undefined && v !== null && String(v).trim() !== "") obj[String(x.name)] = v;
          } else {
            for (const [k, v] of Object.entries(x)) {
              if (v !== undefined && v !== null && String(v).trim() !== "") obj[k] = v;
            }
          }
        }
        insts.push(obj);
      } else {
        for (const x of a) insts.push(x && typeof x === "object" ? x : {});
      }
    } else if (a && typeof a === "object") {
      insts.push(a);
    } else {
      insts.push({});
    }
    out.push({ category: String(p.category), args: insts });
  }
  return out.length ? out : null;
}

export async function onRequestPost(context) {
  let req;
  try { req = await context.request.json(); }
  catch (e) { return json({ error: "bad request" }, 400); }
  if (typeof req.prompt !== "string" || !req.prompt) return json({ error: "bad request" }, 400);
  if (!context.env.TELEAI_API_KEY) {
    return json({ error: "服务端未配置 TELEAI_API_KEY" }, 503);
  }

  const quota = await peekQuota(context.env, context.request);
  if (!quota.ok) return json({ error: quota.reason }, 429);

  const start = Date.now();
  const totalDeadline = start + TOTAL_BUDGET_MS;
  const primaryDeadline = start + PRIMARY_BUDGET_MS;

  const exactKey = await promptKey(req.prompt);
  const cfKey = await contextFreeKey(req.prompt);                 // 无历史时的跨玩家共享键
  const loose = await looseKey(req.ck, schemaVersionOf(req.prompt));  // 客户端给的宽松键

  // ① 共享缓存命中：直接返回（不耗上游、不扣额度）
  for (const [key, kind] of [[exactKey, "cache"], [cfKey, "cache-shared"]]) {
    if (!key) continue;
    const hit = await cacheGet(context.env, key);
    if (hit) return json({ content: hit.v, remaining: quota.left, __meta: { hit: kind } });
  }

  const messages = [{ role: "user", content: req.prompt }];
  let content = null;
  let model = MODEL_PARSE;
  let lastErr = null;

  // ② 主模型（意图模型）
  try {
    const raw = await callModel(context.env, MODEL_PARSE, messages, 256, 0.0, RETRY_DELAYS_MS, primaryDeadline);
    const preds = normalizePreds(raw);
    if (preds) content = JSON.stringify(preds);
    else lastErr = new Error("意图模型输出无法解析");
  } catch (e) {
    lastErr = e;
  }

  // ③ 兜底模型（通用 29B）：同一 prompt、temperature 0
  if (!content && Date.now() < totalDeadline - 1500) {
    try {
      const raw = await callModel(context.env, MODEL_FALLBACK, messages, 256, 0.0, FALLBACK_DELAYS_MS, totalDeadline);
      const preds = normalizePreds(raw);
      if (preds) { content = JSON.stringify(preds); model = MODEL_FALLBACK; }
    } catch (e) {
      lastErr = e;
    }
  }

  // ④ 还是不行 → stale-if-error：捞一条同话题旧答案顶上
  if (!content) {
    for (const key of [loose, cfKey]) {
      if (!key) continue;
      const stale = await cacheGet(context.env, key);
      if (stale) {
        await bumpFail(context.env, context.request);
        return json({
          content: stale.v,
          remaining: quota.left,
          __meta: { hit: "stale", model: "cache" },
        });
      }
    }
  }

  if (!content) {
    await bumpFail(context.env, context.request);
    return json(
      { error: `HTTP ${lastErr?.status || 502}｜${lastErr?.message || "upstream unavailable"}`, upstreamExhausted: true },
      lastErr?.status && lastErr.status >= 400 && lastErr.status < 600 ? lastErr.status : 502
    );
  }

  // ⑤ 成功：才扣额度 + 写缓存（精确键 + 无上下文共享键 + 宽松键）
  const left = await consumeQuota(context.env, context.request);
  await cachePut(context.env, exactKey, content);
  if (cfKey) await cachePut(context.env, cfKey, content);
  if (loose) await cachePut(context.env, loose, content);
  await cacheSweep(context.env);
  return json({ content, remaining: left >= 0 ? left : quota.left, __meta: { model } });
}
