// Cloudflare Pages Function：POST /api/parse
// 契约与 server.py 完全一致：入参 {prompt}，出参 {content}（或 {error} + 上游状态码）。
// 相比旧版新增：上游 403/429/5xx 时服务端退避重试两次（玩家无感）；密钥只从环境变量读取。
// 2026-11-12 新增：调用前扣一格 D1 日额度（超额 429 → 前端自动走离线兜底），见 _lib/quota.js。

import { checkQuota } from "../_lib/quota.js";

const API_URL = "https://api-maas.teleai.com.cn/v1/chat/completions";
const MODEL_PARSE = "Xing4.0-29B-Intent";
const RETRY_DELAYS_MS = [400, 1000, 2200];   // 总计最多 4 次尝试（集群式 403 需要长退避逃出限流窗口）
const JITTER = 0.35;   // 每个退避加 ±35% 抖动：避免同 isolate 重试撞同一限流窗口

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function callModel(env, model, messages, maxTokens, temperature) {
  if (!env.TELEAI_API_KEY) {
    throw new Error("TELEAI_API_KEY 未配置（npx wrangler pages secret put TELEAI_API_KEY --project-name <项目名>）");
  }
  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    chat_template_kwargs: { enable_thinking: false },   // 仓库坑 #2：不关深度思考延迟 ×5
  };
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const base = RETRY_DELAYS_MS[attempt - 1];
      await new Promise((r) => setTimeout(r, Math.round(base * (1 + (Math.random() * 2 - 1) * JITTER))));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.TELEAI_API_KEY}`,
        },
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
      lastErr = new Error(msg || resp.statusText || "upstream error");
      lastErr.status = resp.status;
      // 403/429/5xx：可能是上游对数据中心出口 IP 的间歇限制 → 退避重试；其余 4xx 不重试
      if (!(resp.status === 403 || resp.status === 429 || resp.status >= 500)) throw lastErr;
    } catch (e) {
      if (e.name === "AbortError") { lastErr = new Error("upstream timeout"); lastErr.status = 504; }
      else if (e.status) lastErr = e;
      else lastErr = new Error(String(e.message || e));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function onRequestPost(context) {
  let req;
  try { req = await context.request.json(); }
  catch (e) { return json({ error: "bad request" }, 400); }
  if (typeof req.prompt !== "string" || !req.prompt) return json({ error: "bad request" }, 400);
  const quota = await checkQuota(context.env, context.request);
  if (!quota.ok) return json({ error: quota.reason }, 429);
  try {
    const content = await callModel(context.env, MODEL_PARSE, [{ role: "user", content: req.prompt }], 256, 0.0);
    return json({ content, remaining: quota.left });
  } catch (e) {
    return json({ error: `HTTP ${e.status || 502}｜${e.message}` }, e.status || 502);
  }
}
