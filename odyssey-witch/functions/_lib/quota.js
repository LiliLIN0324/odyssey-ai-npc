// 每日额度（D1 原子计数）——给 /api/parse、/api/chat 做防刷上限
//
// 为什么是 D1 不是 KV：KV 的 get() 有最多 60 秒边缘缓存，瞬时洪水能在缓存窗口内
// 把限额整个绕过（实测：把 total 写成 500 后接口仍返回 200）。D1 是单库 SQLite，
// `n = n + 1 ... RETURNING n` 原子自增，没有陈旧窗口。
//
// 设计取舍：
//  - 一次玩家发言 ≈ 2 次调用（parse + chat），所以 500 次/天 ≈ 250 轮对话
//  - 单 IP 40 次/天，防一条链接被一个人刷空
//  - 超额返回 429 → 前端 apiParse 抛错 → 自动落到 index.html 既有的「离线兜底」关键词解析
//  - 记账不可用时**不放行**（宁可降级为离线兜底，也不放开无限调用）；DB 绑定缺失时放行并标记 degraded

export const DAILY_LIMIT = 500;
export const IP_LIMIT = 40;

const BUCKET = "usage";   // 表：usage(day TEXT, ip TEXT, n INTEGER, PRIMARY KEY(day, ip))

/** 北京时间日期键（额度按自然日重置） */
export function dayKey(now = new Date()) {
  const bj = new Date(now.getTime() + 8 * 3600_000);
  return bj.toISOString().slice(0, 10);
}

/** IP 只存截断哈希，不落原文 */
async function ipTag(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(`odyssey:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest).slice(0, 6)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 扣一格额度。
 * @returns {{ok: boolean, left: number, reason?: string, degraded?: boolean}}
 */
export async function checkQuota(env, request) {
  if (!env.DB) {
    // 绑定尚未生效（例如首次部署顺序问题）：放行，避免整站不可用；health 会暴露 dbConfigured=false
    return { ok: true, left: -1, degraded: true };
  }
  const today = dayKey();
  const tag = await ipTag(request);
  try {
    const mine = await env.DB.prepare(
      `INSERT INTO ${BUCKET} (day, ip, n) VALUES (?, ?, 1)
       ON CONFLICT(day, ip) DO UPDATE SET n = n + 1
       RETURNING n`
    )
      .bind(today, tag)
      .first();
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${BUCKET} WHERE day = ?`)
      .bind(today)
      .first();

    const total = Number(sum?.t ?? 0);
    const usedByMe = Number(mine?.n ?? 1);
    if (total > DAILY_LIMIT) return { ok: false, left: 0, reason: "今日全站额度已用完，明天再来" };
    if (usedByMe > IP_LIMIT) return { ok: false, left: 0, reason: "你的今日额度已用完，明天再来" };

    // 顺手清历史日期（概率触发，避免每次请求都写）
    if (Math.random() < 0.02) {
      await env.DB.prepare(`DELETE FROM ${BUCKET} WHERE day <> ?`).bind(today).run();
    }
    return { ok: true, left: Math.max(0, DAILY_LIMIT - total) };
  } catch (e) {
    return { ok: false, left: 0, reason: `额度服务暂不可用：${String(e.message || e)}` };
  }
}

/** 只读额度（/api/health 用，不扣格） */
export async function readQuota(env) {
  const today = dayKey();
  if (!env.DB) return { date: today, used: 0, limit: DAILY_LIMIT, left: DAILY_LIMIT, dbConfigured: false };
  try {
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${BUCKET} WHERE day = ?`)
      .bind(today)
      .first();
    const used = Number(sum?.t ?? 0);
    return { date: today, used, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - used), dbConfigured: true };
  } catch (e) {
    return { date: today, used: 0, limit: DAILY_LIMIT, left: DAILY_LIMIT, dbConfigured: true, error: String(e.message || e) };
  }
}