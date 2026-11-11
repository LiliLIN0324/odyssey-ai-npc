/* 传闻系统纯规则单测：node --test tools/rumors.test.cjs（零 npm 依赖，Node 22 内置 node:test） */
const test = require("node:test");
const assert = require("node:assert");
const RUMOR = require("../odyssey-witch/src/rumors.js");

const NOW = 1_700_000_000_000;

function mk(over) {
  return Object.assign(
    { id: "x", t: NOW, imp: 4, place: "troy", who: "any", summary: "一件名声事件", heard: [] },
    over
  );
}

test("addRumor 新增条目，字段落位", () => {
  const rumors = [];
  RUMOR.addRumor(rumors, { id: "a", imp: 5, place: "sun", who: "cattle", summary: "宰了圣牛" }, NOW);
  assert.equal(rumors.length, 1);
  assert.deepEqual(rumors[0].heard, []);
  assert.equal(rumors[0].place, "sun");
});

test("同 id 去重：不新增，重要性取大、时间刷新", () => {
  const rumors = [];
  RUMOR.addRumor(rumors, { id: "a", imp: 3, t: NOW - 1000, summary: "旧" });
  RUMOR.addRumor(rumors, { id: "a", imp: 5, t: NOW, summary: "新" });
  assert.equal(rumors.length, 1);
  assert.equal(rumors[0].imp, 5);
  assert.equal(rumors[0].t, NOW);
  assert.equal(rumors[0].summary, "新");
});

test("超过 MAX 淘汰最老", () => {
  const rumors = [];
  for (let i = 0; i < RUMOR.MAX + 3; i++) {
    RUMOR.addRumor(rumors, { id: "r" + i, t: NOW - i, imp: 3, summary: "e" + i });
  }
  assert.equal(rumors.length, RUMOR.MAX);
  assert.equal(rumors[0].id, "r3"); // 最老的 r0/r1/r2 被挤出
});

test("当事人自己那条不算听来的传闻", () => {
  const rumors = [
    mk({ id: "mine", who: "polyphemus", place: "cyclops" }),
    mk({ id: "other", who: "any", place: "troy" }),
  ];
  const res = RUMOR.forNpc(rumors, "polyphemus", "cyclops", NOW);
  assert.equal(res.length, 1);
  assert.equal(res[0].r.id, "other");
});

test("未听过的排在听过的前面", () => {
  const rumors = [
    mk({ id: "heard", imp: 5, heard: ["witch"] }),
    mk({ id: "fresh", imp: 4, heard: [] }),
  ];
  const res = RUMOR.forNpc(rumors, "witch", "aia", NOW);
  assert.equal(res[0].r.id, "fresh");
  assert.equal(res[1].r.id, "heard");
});

test("本地事件权重高于远道，新鲜度高于陈旧", () => {
  const rumors = [
    mk({ id: "far-stale", place: "troy", t: NOW - RUMOR.FRESH_MS - 1, imp: 5 }),
    mk({ id: "near-fresh", place: "aia", t: NOW, imp: 3 }),
  ];
  const res = RUMOR.forNpc(rumors, "witch", "aia", NOW);
  assert.equal(res[0].r.id, "near-fresh");
});

test("低于 MIN_IMP 的私事不扩散", () => {
  const rumors = [mk({ id: "private", imp: 2 })];
  assert.equal(RUMOR.forNpc(rumors, "witch", "aia", NOW).length, 0);
});

test("markHeard 去重计数，heardCount 正确", () => {
  const rumors = [mk({ id: "a", heard: [] })];
  RUMOR.markHeard(rumors, "a", "witch");
  RUMOR.markHeard(rumors, "a", "witch"); // 重复登记不重复入列
  assert.deepEqual(rumors[0].heard, ["witch"]);
  assert.equal(RUMOR.heardCount(rumors, "witch"), 1);
  assert.equal(RUMOR.heardCount(rumors, "seer"), 0);
});

test("nextUnheard 优先给未听过的；全听过回退权重最高", () => {
  const rumors = [
    mk({ id: "a", imp: 5, heard: ["seer"] }),
    mk({ id: "b", imp: 3, heard: [] }),
  ];
  assert.equal(RUMOR.nextUnheard(rumors, "seer", "hades", NOW).r.id, "b");
  const allHeard = [mk({ id: "a", imp: 5, heard: ["seer"] })];
  assert.equal(RUMOR.nextUnheard(allHeard, "seer", "hades", NOW).r.id, "a");
});

test("lineFor 本地/远道前缀不同", () => {
  assert.match(RUMOR.lineFor({ r: mk(), local: true }), /^（他朝你这边偏了偏头）/);
  assert.match(RUMOR.lineFor({ r: mk(), local: false }), /^（像是听海路来的风说的）/);
});

test("坏输入兜底：空数组不报错", () => {
  assert.deepEqual(RUMOR.forNpc(null, "witch", "aia", NOW), []);
  assert.equal(RUMOR.nextUnheard([], "witch", "aia", NOW), null);
  assert.equal(RUMOR.heardCount(null, "witch"), 0);
});
