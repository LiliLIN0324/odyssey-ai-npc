// 服务端共享缓存（D1）——2026-11-15 线上 API 批次。
//
// 为什么要有：
//  1. **同样的问题不该各打各的上游**——不同玩家问「我想买一瓶治疗草药」，prompt 完全一样
//     （schema 98% 是固定前缀），命中缓存就是 0 次上游调用、0 次 403 风险、毫秒级返回。
//  2. **上游挂掉时要有东西顶上**——上游 403 集群把重试耗尽后，返回旧缓存
//     （stale-if-error）远比掉进「离线引擎」体面：玩家拿到的是真模型的旧答案，不是规则匹配。
//
// 三把钥匙（键越靠前越精确）：
//  - 精确键 = sha256(prompt)：完全相同的请求（同样的历史 + 同样的一句话），直接命中。
//  - 无上下文键 = sha256(最后一句用户输入 + schema 版本)：**只在该请求没有对话历史时**才等价于
//     精确键（parse 的 prompt 里不含 NPC，历史为空 → prompt 只由「最后一句 + schema」决定）。
//     所以它可以让「不同玩家问同一句第一句话」直接命中共享缓存 —— 跨玩家复用，命中率最高的一把。
//  - 宽松键 = sha256(客户端给的 ck + 版本)：ck = NPC + 最后一句。历史非空时它能捞到
//     同话题的旧答案，用于上游挂掉时的 stale-if-error。
//     schema 版本进键里 → schema 一改，旧缓存自动失效（不会拿老 schema 的答案配新 schema）。
//
// 表：cache(k TEXT PRIMARY KEY, v TEXT, t INTEGER)——t 是过期时间戳（秒）。

const TABLE = "cache";
const TTL_SEC = 7 * 24 * 3600;   // 缓存保留 7 天

export async function sha256hex(str) {
  const data = new TextEncoder().encode(String(str));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 从 prompt 里抽出「字段说明」段做 schema 版本号（schema 一改，缓存键就变） */
export function schemaVersionOf(prompt) {
  const m = /###\s*字段说明\s*([\s\S]*?)###\s*输入内容/.exec(String(prompt || ""));
  return m ? m[1] : "";
}

/** 抽出 prompt 的「输入内容」段（对话历史 + 本轮输入） */
export function inputSectionOf(prompt) {
  const m = /###\s*输入内容\s*([\s\S]*)$/.exec(String(prompt || ""));
  return m ? m[1] : "";
}

/** 精确键：整个 prompt 的哈希（prompt 含 schema + 历史 + 本轮） */
export async function promptKey(prompt) {
  return "p:" + (await sha256hex(prompt)).slice(0, 40);
}

/** 宽松键：客户端 ck（最后一句 + NPC）+ 版本号 */
export async function looseKey(ck, version) {
  if (!ck) return "";
  /* 注意括号：`await f(x).slice()` 会把 .slice 挂在 Promise 上（await 优先级高于成员访问）→ TypeError。
     必须是 `(await f(x)).slice()`。 */
  const sv = (await sha256hex(String(version || ""))).slice(0, 12);
  return "l:" + (await sha256hex(String(ck) + "|" + sv)).slice(0, 40);
}

/**
 * 无上下文键：只在「这一轮没有对话历史」时有效。
 * parse 的 prompt = 任务说明 + schema + 历史 + 本轮；历史为空时 prompt 完全由
 * 「最后一句 + schema」决定 → 这把键等价于精确键，但跨玩家共享（命中率最高的缓存）。
 * 历史非空时返回空串 —— 绝不拿「无历史的答案」去回答「有上下文的问题」。
 */
export async function contextFreeKey(prompt) {
  const input = inputSectionOf(prompt);
  if (!input) return "";
  const lines = input.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length !== 1) return "";          // 有历史 → 不适用
  const sv = (await sha256hex(schemaVersionOf(prompt))).slice(0, 12);
  return "c:" + (await sha256hex(lines[0] + "|" + sv)).slice(0, 40);
}

/** 读缓存（过期视为未命中） */
export async function cacheGet(env, key) {
  if (!env.DB || !key) return null;
  try {
    const row = await env.DB.prepare(`SELECT v, t FROM ${TABLE} WHERE k = ?`).bind(key).first();
    if (!row || !row.v) return null;
    const now = Math.floor(Date.now() / 1000);
    if (Number(row.t || 0) < now) return null;
    return { v: row.v, t: Number(row.t) };
  } catch (e) {
    return null;
  }
}

/** 写缓存（UPSERT） */
export async function cachePut(env, key, value) {
  if (!env.DB || !key) return;
  const t = Math.floor(Date.now() / 1000) + TTL_SEC;
  try {
    await env.DB.prepare(
      `INSERT INTO ${TABLE} (k, v, t) VALUES (?, ?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v, t = excluded.t`
    ).bind(key, String(value).slice(0, 20000), t).run();
  } catch (e) { /* 缓存写失败不影响主流程 */ }
}

/** 清过期（概率触发） */
export async function cacheSweep(env) {
  if (!env.DB) return;
  if (Math.random() >= 0.01) return;
  try {
    await env.DB.prepare(`DELETE FROM ${TABLE} WHERE t < ?`).bind(Math.floor(Date.now() / 1000)).run();
  } catch (e) { /* ignore */ }
}

/** 缓存统计（/api/health 用） */
export async function readCacheStats(env) {
  if (!env.DB) return { entries: 0, alive: 0, dbConfigured: false };
  try {
    const now = Math.floor(Date.now() / 1000);
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${TABLE}`).first();
    const alive = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${TABLE} WHERE t >= ?`).bind(now).first();
    return { entries: Number(total?.c ?? 0), alive: Number(alive?.c ?? 0), dbConfigured: true };
  } catch (e) {
    return { entries: 0, alive: 0, dbConfigured: true, error: String(e.message || e) };
  }
}
