// Cloudflare Pages Function：GET /api/health
// 自查用：额度余量 + key/DB 绑定是否就位 + 缓存与失败计数（不含任何密钥内容）。
import { readQuota, readFailCount, FAIL_LIMIT, DAILY_LIMIT, IP_LIMIT } from "../_lib/quota.js";
import { readCacheStats } from "../_lib/cache.js";

export async function onRequestGet(context) {
  const quota = await readQuota(context.env);
  const fails = await readFailCount(context.env);
  const cache = await readCacheStats(context.env);
  return new Response(
    JSON.stringify({
      ok: true,
      keyConfigured: Boolean(context.env.TELEAI_API_KEY),
      dbConfigured: quota.dbConfigured,
      date: quota.date,
      used: quota.used,
      limit: quota.limit,
      left: quota.left,
      dailyLimit: DAILY_LIMIT,
      ipLimit: IP_LIMIT,
      failsToday: fails.today,
      failLimit: fails.limit ?? FAIL_LIMIT,
      cache,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}
