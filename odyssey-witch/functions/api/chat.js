// Cloudflare Pages Function：POST /api/chat
// 契约与 server.py 完全一致：入参 {messages:[...]}，出参 {content}。
// 重试/退避/密钥处理同 parse.js（逻辑抽出复用同款模式，见 parse.js 注释）。

const API_URL = "https://api-maas.teleai.com.cn/v1/chat/completions";
const MODEL_CHAT = "TeleChat3-438B-A24B";
const RETRY_DELAYS_MS = [500, 1200];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function callChat(env, messages) {
  if (!env.TELEAI_API_KEY) {
    throw new Error("TELEAI_API_KEY 未配置（npx wrangler pages secret put TELEAI_API_KEY --project-name <项目名>）");
  }
  if (!Array.isArray(messages) || !messages.length) throw Object.assign(new Error("bad request"), { status: 400 });
  const payload = {
    model: MODEL_CHAT,
    messages,
    temperature: 0.7,
    max_tokens: 300,
    chat_template_kwargs: { enable_thinking: false },
  };
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
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
  try {
    const content = await callChat(context.env, req.messages);
    return json({ content });
  } catch (e) {
    return json({ error: `HTTP ${e.status || 502}｜${e.message}` }, e.status || 502);
  }
}
