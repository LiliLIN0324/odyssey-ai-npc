// Cloudflare Pages Function：GET /api/health
// 自查用：额度余量 + key/DB 绑定是否就位（不含任何密钥内容）。
import { readQuota } from "../_lib/quota.js";

export async function onRequestGet(context) {
  const quota = await readQuota(context.env);
  return new Response(
    JSON.stringify({
      ok: true,
      keyConfigured: Boolean(context.env.TELEAI_API_KEY),
      dbConfigured: quota.dbConfigured,
      date: quota.date,
      used: quota.used,
      limit: quota.limit,
      left: quota.left,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}