// 每日额度（D1 原子计数）——给 /api/parse、/api/chat 做防刷上限。
//
// 2026-11-15 改造（线上 API 批次）：
//   旧：请求进来先扣一格 → **上游 403/超时的失败请求也扣**；客户端再重试 2 次就是 3 格。
//       于是「上游抖一下 → 玩家自己的额度被失败请求吃光 → 之后每句话都掉离线引擎」。
//   新：**成功才扣**。请求前只读（peek），上游成功后再原子加一格（consume）。
//       失败不计额度，改记失败计数（fails 表），失败上限宽松（3×IP 上限），
//       既不让失败请求吃额度，也不给「无限重试刷爆上游」留口子。
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
export const FAIL_LIMIT = IP_LIMIT * 3;   // 失败计数上限：宽松，但不为无限重试开门

const BUCKET = "usage";
const FAILS = "fails";

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
 * 额度判定（纯函数，好测）。
 * @param total 全站今日已用、usedByMe 本 IP 今日已用、failed 今日失败次数
 */
export function quotaDecision(total, usedByMe, failed) {
  /* 用 >= 而不是 >：额度用满即止（total=500 就该拦下第 501 次） */
  if (total >= DAILY_LIMIT) return { ok: false, left: 0, reason: "今日全站额度已用完，明天再来" };
  if (usedByMe >= IP_LIMIT) return { ok: false, left: 0, reason: "你的今日额度已用完，明天再来" };
  if (failed >= FAIL_LIMIT) return { ok: false, left: 0, reason: "请求失败次数过多，稍后再试" };
  return { ok: true, left: Math.max(0, DAILY_LIMIT - total) };
}

/**
 * 只读额度（不扣格）——请求进来先看有没有超限。
 * @returns {{ok: boolean, left: number, reason?: string, degraded?: boolean}}
 */
export async function peekQuota(env, request) {
  if (!env.DB) {
    // 绑定尚未生效（例如首次部署顺序问题）：放行，避免整站不可用；health 会暴露 dbConfigured=false
    return { ok: true, left: -1, degraded: true };
  }
  const today = dayKey();
  const tag = await ipTag(request);
  try {
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${BUCKET} WHERE day = ?`)
      .bind(today)
      .first();
    const mine = await env.DB.prepare(`SELECT COALESCE(n, 0) AS n FROM ${BUCKET} WHERE day = ? AND ip = ?`)
      .bind(today, tag)
      .first();
    const fsum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${FAILS} WHERE day = ?`)
      .bind(today)
      .first();

    const decision = quotaDecision(Number(sum?.t ?? 0), Number(mine?.n ?? 0), Number(fsum?.t ?? 0));
    if (!decision.ok) return decision;

    // 顺手清历史日期（概率触发，避免每次请求都写）
    if (Math.random() < 0.02) {
      await env.DB.prepare(`DELETE FROM ${BUCKET} WHERE day <> ?`).bind(today).run();
      await env.DB.prepare(`DELETE FROM ${FAILS} WHERE day <> ?`).bind(today).run();
    }
    return { ok: true, left: decision.left };
  } catch (e) {
    return { ok: false, left: 0, reason: `额度服务暂不可用：${String(e.message || e)}` };
  }
}

/** 成功才扣：原子加一格，返回当前总数 */
export async function consumeQuota(env, request) {
  if (!env.DB) return -1;
  const today = dayKey();
  const tag = await ipTag(request);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO ${BUCKET} (day, ip, n) VALUES (?, ?, 1)
       ON CONFLICT(day, ip) DO UPDATE SET n = n + 1
       RETURNING n`
    ).bind(today, tag).first();
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${BUCKET} WHERE day = ?`)
      .bind(today).first();
    const total = Number(sum?.t ?? 0);
    return Math.max(0, DAILY_LIMIT - total);
  } catch (e) {
    return -1;
  }
}

/** 失败记账（不计额度，只防刷） */
export async function bumpFail(env, request) {
  if (!env.DB) return;
  const today = dayKey();
  const tag = await ipTag(request);
  try {
    await env.DB.prepare(
      `INSERT INTO ${FAILS} (day, ip, n) VALUES (?, ?, 1)
       ON CONFLICT(day, ip) DO UPDATE SET n = n + 1`
    ).bind(today, tag).run();
  } catch (e) { /* 记账失败不影响主流程 */ }
}

/** 只读额度（/api/health 用，不扣格） */
export async function readQuota(env) {
  const today = dayKey();
  if (!env.DB) return { date: today, used: 0, limit: DAILY_LIMIT, left: DAILY_LIMIT, dbConfigured: false };
  try {
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${BUCKET} WHERE day = ?`)
      .bind(today).first();
    const used = Number(sum?.t ?? 0);
    return { date: today, used, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - used), dbConfigured: true };
  } catch (e) {
    return { date: today, used: 0, limit: DAILY_LIMIT, left: DAILY_LIMIT, dbConfigured: true, error: String(e.message || e) };
  }
}

/** 只读失败计数（/api/health 用） */
export async function readFailCount(env) {
  const today = dayKey();
  if (!env.DB) return { date: today, today: 0, limit: FAIL_LIMIT, dbConfigured: false };
  try {
    const sum = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS t FROM ${FAILS} WHERE day = ?`)
      .bind(today).first();
    const failed = Number(sum?.t ?? 0);
    return { date: today, today: failed, limit: FAIL_LIMIT, dbConfigured: true };
  } catch (e) {
    return { date: today, today: 0, limit: FAIL_LIMIT, dbConfigured: true, error: String(e.message || e) };
  }
}
