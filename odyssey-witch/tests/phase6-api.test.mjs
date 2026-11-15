/* 批次 K4 · 线上 API 层的回归锁（2026-11-15）。
 *
 * 这一批改的是 Cloudflare Pages Functions 里 /api/parse 与 /api/chat 的行为，
 * 守五件最容易悄悄坏掉的事：
 *   ① **成功才扣额度**——上游挂掉的请求不能吃玩家的额度（老实现是先扣再调，
 *      一次 403 集群就把额度烧光，之后每句话都掉离线引擎）。
 *   ② **缓存命中不烧上游**——相同请求直接命中共享缓存，0 次 fetch。
 *   ③ **兜底模型可用**——意图模型被限流时换通用模型，且它的 {name,value} 形状
 *      必须被归一化成客户端要的形状（形状错 = 参数全丢）。
 *   ④ **stale-if-error**——模型全挂时用旧缓存顶上，而不是把错误甩给玩家。
 *   ⑤ **限额判定用 >=**——额度用满即止（total=500 就该拦下第 501 次）。
 *
 * 测法：假 D1（记 SQL）+ 假上游（替换 globalThis.fetch），
 * 全程不碰网络、不碰真 key。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { onRequestPost as parsePost, normalizePreds } from "../functions/api/parse.js";
import { onRequestPost as chatPost, acceptableLine } from "../functions/api/chat.js";
import { quotaDecision, DAILY_LIMIT, IP_LIMIT, FAIL_LIMIT } from "../functions/_lib/quota.js";
import { contextFreeKey, promptKey, looseKey, schemaVersionOf } from "../functions/_lib/cache.js";

/* ---------- 假 D1 ---------- */
function fakeDB(seed = {}) {
  const tables = {
    usage: seed.usage ? [...seed.usage] : [],
    fails: seed.fails ? [...seed.fails] : [],
    cache: seed.cache ? [...seed.cache] : [],
  };
  const calls = [];
  const sum = (rows) => rows.reduce((a, r) => a + Number(r.n || 0), 0);

  /* INSERT ... RETURNING n 也得真的落库——不然「成功才扣额度」根本没被测到 */
  function upsertUsage(args) {
    const [day, ip] = args;
    const row = tables.usage.find((r) => r.day === day && r.ip === ip);
    if (row) { row.n += 1; return row.n; }
    tables.usage.push({ day, ip, n: 1 });
    return 1;
  }
  function upsertFails(args) {
    const [day, ip] = args;
    const row = tables.fails.find((r) => r.day === day && r.ip === ip);
    if (row) { row.n += 1; return row.n; }
    tables.fails.push({ day, ip, n: 1 });
    return 1;
  }
  function upsertCache(args) {
    const [k, v, t] = args;
    const row = tables.cache.find((r) => r.k === k);
    if (row) { row.v = v; row.t = t; } else tables.cache.push({ k, v, t });
  }

  function handle(sql, args) {
    const s = sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: s, args });
    return {
      bind: (...a) => handle(s, a),
      async first() {
        if (s.startsWith("INSERT INTO usage")) return { n: upsertUsage(args) };
        if (s.includes("FROM usage WHERE day = ? AND ip = ?")) {
          const row = tables.usage.find((r) => r.day === args[0] && r.ip === args[1]);
          return row ? { n: row.n } : null;
        }
        if (s.includes("FROM usage WHERE day = ?")) return { t: sum(tables.usage) };
        if (s.includes("FROM fails WHERE day = ?")) return { t: sum(tables.fails) };
        if (s.includes("FROM cache WHERE k = ?")) {
          const row = tables.cache.find((r) => r.k === args[0]);
          return row ? { v: row.v, t: row.t } : null;
        }
        return null;
      },
      async run() {
        if (s.startsWith("INSERT INTO usage")) upsertUsage(args);
        else if (s.startsWith("INSERT INTO fails")) upsertFails(args);
        else if (s.startsWith("INSERT INTO cache")) upsertCache(args);
        return { success: true };
      },
    };
  }
  return { db: { prepare: (sql) => handle(sql, []) }, tables, calls };
}

/* ---------- 假上游 ---------- */
function upstreamOk(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => "",
  };
}
function upstreamFail(status = 403) {
  return {
    ok: false,
    status,
    json: async () => ({ message: "cluster limited" }),
    text: async () => JSON.stringify({ message: "cluster limited" }),
  };
}
/* 按「模型名」路由：主模型一律挂、兜底模型放行 —— 不用靠调用次数猜 */
function modelOf(init) {
  try { return JSON.parse(init.body).model; } catch (e) { return ""; }
}
const MODEL_PARSE = "xing4.0-29b-intent";
const MODEL_CHAT = "TeleChat3-438B-A24B";
const MODEL_FALLBACK = "xing4.0-29b-a4b";

function fakeRequest(body) {
  return {
    json: async () => body,
    headers: { get: () => "1.2.3.4" },
  };
}

const PROMPT = `### 任务说明
判断类别并抽参数。

### 字段说明
[{"category":"购买物品","args":[{"name":"物品"}]}]

### 输入内容
Human: 我想买一瓶治疗草药`;

async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return handler(url, init, seen.length);
  };
  try {
    return { result: await fn(), seen };
  } finally {
    globalThis.fetch = original;
  }
}

/* ---------- 归一化 ---------- */
test("normalizePreds：意图模型形状原样保留（1 组实例）", () => {
  const out = normalizePreds('[{"category":"购买物品","args":[{"物品":"治疗草药","数量":"1"}]}]');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].args, [{ 物品: "治疗草药", 数量: "1" }]);
});

test("normalizePreds：兜底模型的 {name,value} 折成 1 组实例（否则数量被当成第二组丢掉）", () => {
  const out = normalizePreds('[{"category":"购买物品","args":[{"name":"物品","value":"玛草"},{"name":"数量","value":"3"}]}]');
  assert.deepEqual(out[0].args, [{ 物品: "玛草", 数量: "3" }]);
});

test("normalizePreds：混合写法也折成 1 组实例", () => {
  const out = normalizePreds('[{"category":"购买物品","args":[{"name":"物品","value":"玛草"},{"数量":"3"}]}]');
  assert.deepEqual(out[0].args, [{ 物品: "玛草", 数量: "3" }]);
});

test("normalizePreds：多组独立实例不合并（买两样东西要两轮）", () => {
  const out = normalizePreds('[{"category":"购买物品","args":[{"物品":"淡水"},{"物品":"面包"}]}]');
  assert.equal(out[0].args.length, 2);
  assert.deepEqual(out[0].args[0], { 物品: "淡水" });
});

test("normalizePreds：围栏 / 垃圾输入", () => {
  assert.equal(normalizePreds("```json\n[{\"category\":\"闲聊\",\"args\":[]}]\n```")[0].category, "闲聊");
  assert.equal(normalizePreds("今天天气不错"), null);
  assert.equal(normalizePreds(""), null);
});

/* ---------- 缓存键 ---------- */
test("contextFreeKey：只有一行输入才有键；有对话历史就返回空（不能拿无上下文答案顶有上下文的问题）", async () => {
  const one = await contextFreeKey(PROMPT);
  assert.ok(one && one.startsWith("c:"));
  const withHistory = PROMPT.replace("Human: 我想买一瓶治疗草药", "Human: 之前那句\nAI: 你好\nHuman: 我想买一瓶治疗草药");
  assert.equal(await contextFreeKey(withHistory), "");
});

test("promptKey / looseKey：同样输入稳定，schema 或 ck 变了键就变", async () => {
  const a = await promptKey(PROMPT);
  assert.equal(a, await promptKey(PROMPT));
  assert.notEqual(a, await promptKey(PROMPT + "x"));
  const l1 = await looseKey("ck1", "v1");
  assert.equal(l1, await looseKey("ck1", "v1"));
  assert.notEqual(l1, await looseKey("ck1", "v2"));
  assert.notEqual(l1, await looseKey("ck2", "v1"));
});

test("schemaVersionOf：抽的是「字段说明」段（schema 一改，缓存键就变）", () => {
  const sv = schemaVersionOf(PROMPT);
  assert.ok(sv.includes("购买物品"));
  assert.ok(!sv.includes("Human:"));
});

/* ---------- 额度判定 ---------- */
test("quotaDecision：额度用满即止（>= 不是 >）", () => {
  assert.equal(quotaDecision(DAILY_LIMIT - 1, 0, 0).ok, true);
  assert.equal(quotaDecision(DAILY_LIMIT, 0, 0).ok, false);
  assert.equal(quotaDecision(0, IP_LIMIT - 1, 0).ok, true);
  assert.equal(quotaDecision(0, IP_LIMIT, 0).ok, false);
  assert.equal(quotaDecision(0, 0, FAIL_LIMIT - 1).ok, true);
  assert.equal(quotaDecision(0, 0, FAIL_LIMIT).ok, false);
});

/* ---------- parse 端到端（假 D1 + 假上游） ---------- */
test("parse：上游成功 → 扣 1 格额度 + 写缓存", async () => {
  const { db, tables, calls } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result, seen } = await withFetch(
    () => upstreamOk('[{"category":"购买物品","args":[{"物品":"治疗草药"}]}]'),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT }), env })
  );
  assert.equal(result.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(tables.usage.reduce((a, r) => a + r.n, 0), 1);
  assert.ok(tables.cache.length >= 1);
  assert.ok(calls.some((c) => c.sql.startsWith("INSERT INTO usage")));
});

test("parse：上游全挂（403 打穿 + 兜底也挂）→ 不扣额度，只记失败", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result } = await withFetch(
    () => upstreamFail(403),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT }), env })
  );
  assert.ok(result.status >= 400);
  const body = await result.json();
  assert.equal(body.upstreamExhausted, true);
  assert.equal(tables.usage.length, 0);                      // 失败不吃额度
  assert.equal(tables.fails.reduce((a, r) => a + r.n, 0), 1); // 只记失败
  assert.equal(tables.cache.length, 0);
});

test("parse：兜底模型顶上来 → 归一化后可用", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result } = await withFetch(
    (url, init) => (modelOf(init) === MODEL_PARSE ? upstreamFail(403) : upstreamOk('[{"category":"购买物品","args":[{"name":"物品","value":"治疗草药"},{"name":"数量","value":"1"}]}]')),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT }), env })
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  const preds = JSON.parse(body.content);
  assert.deepEqual(preds[0].args, [{ 物品: "治疗草药", 数量: "1" }]);
  assert.equal(tables.usage.reduce((a, r) => a + r.n, 0), 1);
});

test("parse：缓存命中 → 0 次上游调用 + 不扣额度", async () => {
  const { db, tables, calls } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result, seen } = await withFetch(
    () => upstreamOk('[{"category":"闲聊","args":[]}]'),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT }), env })
  );
  assert.equal(result.status, 200);
  const usedBefore = tables.usage.reduce((a, r) => a + r.n, 0);
  const cacheCalls = calls.filter((c) => c.sql.startsWith("INSERT INTO cache")).length;
  assert.ok(cacheCalls >= 1);

  // 第二次：同样的 prompt → 直接命中缓存
  const { result: r2, seen: seen2 } = await withFetch(
    () => { throw new Error("不该再打上游"); },
    () => parsePost({ request: fakeRequest({ prompt: PROMPT }), env })
  );
  assert.equal(r2.status, 200);
  assert.equal(seen2.length, 0);
  assert.equal(tables.usage.reduce((a, r) => a + r.n, 0), usedBefore); // 命中不扣额度
});

test("parse：上游挂 → stale-if-error 用旧缓存顶上", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const first = await withFetch(
    () => upstreamOk('[{"category":"闲聊","args":[]}]'),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT, ck: "ck-x" }), env })
  );
  assert.equal(first.result.status, 200);
  const cached = tables.cache.find((r) => r.k.startsWith("l:"));
  assert.ok(cached, "宽松键应被写入");

  const second = await withFetch(
    () => upstreamFail(403),
    () => parsePost({ request: fakeRequest({ prompt: PROMPT + " 换个说法", ck: "ck-x" }), env })
  );
  assert.equal(second.result.status, 200);
  const body = await second.result.json();
  assert.equal(body.__meta.hit, "stale");
  assert.ok(body.content.includes("闲聊"));
});

/* ---------- chat 端到端 ---------- */
test("chat：上游成功 → 扣额度 + 写缓存", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result, seen } = await withFetch(
    () => upstreamOk("（她把药推过来。）"),
    () => chatPost({ request: fakeRequest({ messages: [{ role: "system", content: "x" }], ck: "ck2" }), env })
  );
  assert.equal(result.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(tables.usage.reduce((a, r) => a + r.n, 0), 1);
});

test("chat：主模型挂 → 兜底模型顶上（成功就扣额度）", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result } = await withFetch(
    (url, init) => (modelOf(init) === MODEL_CHAT ? upstreamFail(403) : upstreamOk("（她哼了一声。）")),
    () => chatPost({ request: fakeRequest({ messages: [{ role: "system", content: "x" }] }), env })
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.content, "（她哼了一声。）");
  assert.equal(tables.usage.reduce((a, r) => a + r.n, 0), 1);
});

test("chat：全挂 → 不扣额度 + 记失败 + upstreamExhausted", async () => {
  const { db, tables } = fakeDB();
  const env = { DB: db, TELEAI_API_KEY: "sk-test" };
  const { result } = await withFetch(
    () => upstreamFail(403),
    () => chatPost({ request: fakeRequest({ messages: [{ role: "system", content: "x" }] }), env })
  );
  assert.ok(result.status >= 400);
  const body = await result.json();
  assert.equal(body.upstreamExhausted, true);
  assert.equal(tables.usage.length, 0);
  assert.equal(tables.fails.reduce((a, r) => a + r.n, 0), 1);
});

test("chat：兜底模型的输出闸——JSON/超长/空一律丢弃", () => {
  assert.equal(acceptableLine('{"role":"assistant"}'), "");
  assert.equal(acceptableLine("```\ncode\n```"), "");
  assert.equal(acceptableLine(""), "");
  assert.equal(acceptableLine("x".repeat(801)), "");
  assert.equal(acceptableLine("（她把药推过来。）"), "（她把药推过来。）");
});
