// Cloudflare Pages Function：POST /api/chat
// 契约与 server.py 完全一致：入参 {messages:[...]}（可选 {ck}），出参 {content}。
//
// 2026-11-15 线上 API 批次（与 parse.js 同款改造）：
//  ① **共享缓存**：同样的 messages 直接命中 → 0 次上游调用、毫秒级返回、不扣额度。
//  ② **兜底模型**：主台词模型（TeleChat3-438B-A24B）被上游 403 集群打穿 → 换通用 29B
//     （xing4.0-29b-a4b）顶一下。它不是人格模型，所以输出要过一道**形状闸**：
//     空、太长、像 JSON/代码的一律丢弃（宁可报错也不给玩家一段机器味输出）。
//  ③ **stale-if-error**：全挂了 → 用宽松键捞一条同话题旧台词顶上。
//  ④ **成功才扣额度**：失败请求不吃玩家额度（见 _lib/quota.js）。
//  ⑤ **总预算**：服务端耗时封顶（TOTAL_BUDGET_MS），客户端超时比它宽 5 秒。
// 密钥只从环境变量读取，绝不进前端/仓库。

import { peekQuota, consumeQuota, bumpFail } from "../_lib/quota.js";
import { cacheGet, cachePut, cacheSweep, promptKey, looseKey } from "../_lib/cache.js";

const API_URL = "https://api-maas.teleai.com.cn/v1/chat/completions";
const MODEL_CHAT = "TeleChat3-438B-A24B";
const MODEL_FALLBACK = "xing4.0-29b-a4b";   // 通用 29B：人格模型被限流时的兜底
const RETRY_DELAYS_MS = [500, 1300, 2200];  // 主模型：总计最多 4 次尝试
const FALLBACK_DELAYS_MS = [600];           // 兜底模型：最多 2 次尝试
const JITTER = 0.35;
const UPSTREAM_TIMEOUT_MS = 12000;
const TOTAL_BUDGET_MS = 15000;
const PRIMARY_BUDGET_MS = 10000;
const MAX_LINE_CHARS = 800;

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
    if (!(resp.status === 403 || resp.status === 429 || resp.status >= 500)) throw err;
    return null;   // 可重试
  } finally {
    clearTimeout(timer);
  }
}

async function callModel(env, model, messages, maxTokens, temperature, delays, deadline) {
  let lastErr = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      const base = delays[attempt - 1];
      const wait = Math.round(base * (1 + (Math.random() * 2 - 1) * JITTER));
      if (Date.now() + wait > deadline) break;
      await new Promise((r) => setTimeout(r, wait));
    }
    const remain = deadline - Date.now();
    if (remain < 1500) break;
    try {
      const out = await once(env, model, messages, maxTokens, temperature, Math.min(UPSTREAM_TIMEOUT_MS, remain));
      if (out !== null) return out;
      lastErr = new Error("upstream retryable error");
      lastErr.status = 503;
    } catch (e) {
      if (e.name === "AbortError") { lastErr = new Error("upstream timeout"); lastErr.status = 504; }
      else if (e.status) lastErr = e;
      else lastErr = new Error(String(e.message || e));
      if (!(e.status === 403 || e.status === 429 || e.status >= 500)) break;
    }
  }
  throw lastErr || new Error("upstream failed");
}

/* 兜底模型的输出闸：空 / 超长 / 像 JSON 或代码 → 丢弃（宁可失败也不给机器味台词） */
export function acceptableLine(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (t.length > MAX_LINE_CHARS) return "";
  if (t.includes("```")) return "";
  if (/^[[{]/.test(t)) return "";             // JSON/数组开头 → 不是台词
  if (/^(system|assistant|user)\s*:/i.test(t)) return "";   // 模型在演聊天记录
  return t;
}

export async function onRequestPost(context) {
  let req;
  try { req = await context.request.json(); }
  catch (e) { return json({ error: "bad request" }, 400); }
  const messages = req.messages;
  if (!Array.isArray(messages) || !messages.length) return json({ error: "bad request" }, 400);
  if (!context.env.TELEAI_API_KEY) {
    return json({ error: "服务端未配置 TELEAI_API_KEY" }, 503);
  }

  const quota = await peekQuota(context.env, context.request);
  if (!quota.ok) return json({ error: quota.reason }, 429);

  const start = Date.now();
  const totalDeadline = start + TOTAL_BUDGET_MS;
  const primaryDeadline = start + PRIMARY_BUDGET_MS;

  const exactKey = await promptKey(JSON.stringify(messages));
  const loose = await looseKey(req.ck, "chat");

  // ① 共享缓存命中
  const hit = await cacheGet(context.env, exactKey);
  if (hit) return json({ content: hit.v, remaining: quota.left, __meta: { hit: "cache" } });

  let content = null;
  let model = MODEL_CHAT;
  let lastErr = null;

  // ② 主台词模型
  try {
    const raw = await callModel(context.env, MODEL_CHAT, messages, 300, 0.7, RETRY_DELAYS_MS, primaryDeadline);
    const line = acceptableLine(raw);
    if (line) content = line;
    else lastErr = new Error("台词模型输出不可用");
  } catch (e) {
    lastErr = e;
  }

  // ③ 兜底模型（通用 29B）
  if (!content && Date.now() < totalDeadline - 1500) {
    try {
      const raw = await callModel(context.env, MODEL_FALLBACK, messages, 300, 0.7, FALLBACK_DELAYS_MS, totalDeadline);
      const line = acceptableLine(raw);
      if (line) { content = line; model = MODEL_FALLBACK; }
    } catch (e) {
      lastErr = e;
    }
  }

  // ④ stale-if-error：同话题旧台词顶上
  if (!content && loose) {
    const stale = await cacheGet(context.env, loose);
    if (stale) {
      await bumpFail(context.env, context.request);
      return json({ content: stale.v, remaining: quota.left, __meta: { hit: "stale", model: "cache" } });
    }
  }

  if (!content) {
    await bumpFail(context.env, context.request);
    return json(
      { error: `HTTP ${lastErr?.status || 502}｜${lastErr?.message || "upstream unavailable"}`, upstreamExhausted: true },
      lastErr?.status && lastErr.status >= 400 && lastErr.status < 600 ? lastErr.status : 502
    );
  }

  // ⑤ 成功：才扣额度 + 写缓存
  const left = await consumeQuota(context.env, context.request);
  await cachePut(context.env, exactKey, content);
  if (loose) await cachePut(context.env, loose, content);
  await cacheSweep(context.env);
  return json({ content, remaining: left >= 0 ? left : quota.left, __meta: { model } });
}
