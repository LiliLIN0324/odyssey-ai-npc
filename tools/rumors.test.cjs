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

/* ==================== v2：NPC 间多跳转述 + 失真分级 + 口吻变体 ==================== */

test("v2: gossipTick 每次传一人——当事人排除、hop+1、t 刷新、挂 vers", () => {
  const rumors = [mk({ id: "g", imp: 4, place: "aia", who: "witch", t: NOW - 500 })];
  const npcs = [{ key: "witch", scene: "aia" }, { key: "seer", scene: "aia" }, { key: "aeolus", scene: "aeolia" }];
  RUMOR.gossipTick(rumors, npcs, NOW, () => 0);   // rng=0：选首位同场景候选（seer），当事人 witch 被排除
  assert.deepEqual(rumors[0].heard, ["seer"]);
  assert.equal(rumors[0].hop, 1);
  assert.equal(rumors[0].t, NOW);
  assert.equal(rumors[0].vers[0], rumors[0].summary);
  RUMOR.gossipTick(rumors, npcs, NOW + 100, () => 0);
  assert.equal(rumors[0].heard.length, 2);
  assert.equal(rumors[0].hop, 2);
});

test("v2: gossipTick imp<3 不扩散；传遍后（候选空）不再动", () => {
  const rumors = [mk({ id: "p", imp: 2, place: "aia" })];
  RUMOR.gossipTick(rumors, [{ key: "seer", scene: "hades" }], NOW, () => 0);
  assert.deepEqual(rumors[0].heard, []);
  assert.equal(rumors[0].hop || 0, 0);
  const full = [mk({ id: "f", imp: 4, place: "aia", heard: ["seer"], t: NOW - 9 })];
  RUMOR.gossipTick(full, [{ key: "seer", scene: "hades" }], NOW, () => 0);
  assert.deepEqual(full[0].heard, ["seer"]);
  assert.equal(full[0].t, NOW - 9);   // 时间未被刷新：没有可传对象
});

test("v2: gossipTick 支持 NPC_SCENE 映射形态；rng 注入两次运行结果一致", () => {
  const sceneMap = { witch: "aia", cattle: "sun", seer: "hades" };   // place=sun → 半径 0.3/1/0.3
  const a = RUMOR.gossipTick([mk({ id: "m", imp: 4, place: "sun" })], sceneMap, NOW, () => 0.999);
  const b = RUMOR.gossipTick([mk({ id: "m", imp: 4, place: "sun" })], sceneMap, NOW, () => 0.999);
  assert.deepEqual(a[0].heard, b[0].heard);   // 同 rng 确定性复现
  assert.deepEqual(a[0].heard, ["seer"]);     // roll 压满：选到列表末位的跨海候选
  const c = RUMOR.gossipTick([mk({ id: "m", imp: 4, place: "sun" })], sceneMap, NOW, () => 0);
  assert.deepEqual(c[0].heard, ["witch"]);    // roll=0：选首位候选（同场景 cattle 权重更大也轮不到首位之外）
});

test("v2: gossipTick 传播半径加权——rng=0.25 选中同场景候选而非首位跨海", () => {
  const rumors = [mk({ id: "w", imp: 4, place: "sun" })];
  RUMOR.gossipTick(rumors, { witch: "aia", cattle: "sun", seer: "hades" }, NOW, () => 0.25);
  assert.deepEqual(rumors[0].heard, ["cattle"]);   // 同场景 100% 半径吞掉大头概率质量
});

test("v2: hop 权重衰减——转述一次权重减半", () => {
  const rumors = [
    mk({ id: "h0", imp: 4, hop: 0, place: "aia", heard: ["witch"] }),
    mk({ id: "h1", imp: 4, hop: 1, place: "aia", heard: ["witch"] }),
  ];
  const res = RUMOR.forNpc(rumors, "seer", "hades", NOW);
  const w0 = res.find(x => x.r.id === "h0").weight;
  const w1 = res.find(x => x.r.id === "h1").weight;
  assert.equal(w1, w0 / 2);
});

test("v2: stripDetails 只做减法——去 ×N、数字+量词换成『几』", () => {
  assert.equal(RUMOR.stripDetails("风袋×3"), "风袋");
  assert.equal(RUMOR.stripDetails("六只羊，六次空当"), "几只羊，几次空当");
  assert.equal(RUMOR.stripDetails("草场多了一百个影子"), "草场多了几个影子");
  assert.equal(RUMOR.stripDetails("十年围城"), "几年围城");
});

test("v2: 失真分级 L1 加『据说』去数字，L2 截 12 字加『……』", () => {
  const s = "篝火边他报出了名字：奥德修斯。全厅安静了一瞬";
  const [L0, L1, L2] = RUMOR.versOf(s);
  assert.equal(L0, s);
  assert.match(L1, /^据说，/);
  assert.equal(RUMOR.versOf("六只羊，六次空当")[1], "据说，几只羊，几次空当");
  assert.equal(L2.length, 14);            // 12 字 + ……
  assert.match(L2, /……$/);
  assert.ok(!L2.includes("全厅"));         // 只剩主谓骨架
});

test("v2: lineFor 按 hop 取失真层", () => {
  const e = { r: mk({ id: "d", summary: "六只羊，六次空当，躲出了洞" }) };
  assert.ok(RUMOR.lineFor(e).includes("六只羊"));
  e.r.hop = 1;
  assert.ok(RUMOR.lineFor(e).includes("据说，几只羊"));
  assert.ok(!RUMOR.lineFor(e).includes("六只羊"));
  e.r.hop = 2;
  assert.match(RUMOR.lineFor(e), /……$/);   // hop≥2 → L2 骨架
});

test("v2: 口吻稳定取样——同 rumor+npc 两次一致、模板跨 hop 不变、不同 NPC 各异", () => {
  const wrap = h => ({ r: mk({ id: "z", summary: "篝火边他报出了名字：奥德修斯。全厅安静了一瞬", hop: h }), local: false });
  const l0a = RUMOR.lineFor(wrap(0), "witch");
  const l0b = RUMOR.lineFor(wrap(0), "witch");
  assert.equal(l0a, l0b);                                  // 纯函数稳定
  const pre = s => (s.match(/^（[^）]+）/) || [""])[0];
  assert.equal(pre(RUMOR.lineFor(wrap(2), "witch")), pre(l0a));  // hop 变了，取样模板不变
  assert.notEqual(RUMOR.lineFor(wrap(0), "witch"), RUMOR.lineFor(wrap(0), "seer"));
  assert.ok(Object.keys(RUMOR.VOICE).length >= 12);        // NPC key 全覆盖
  assert.ok(Object.values(RUMOR.VOICE).every(v => v.length >= 2));
});

test("v2: 未知 npcKey 回退 v1 通用口吻", () => {
  const e = { r: mk({ id: "q", summary: "一件名声事件" }), local: true };
  assert.match(RUMOR.lineFor(e, "nobody"), /^（他朝你这边偏了偏头）/);
  assert.match(RUMOR.lineFor({ r: mk({ id: "q2" }) }, undefined), /^（像是听海路来的风说的）/);
});

test("v2: sceneRadius 半径语义——同场景 1、同岛邻近 0.6、跨海 0.3", () => {
  assert.equal(RUMOR.sceneRadius("aia", "aia"), 1);
  assert.equal(RUMOR.sceneRadius("aia", "aeolia"), 0.6);
  assert.equal(RUMOR.sceneRadius("aia", "hades"), 0.3);
  assert.equal(RUMOR.sceneRadius("", "aia"), 0.3);   // 未知场景按跨海兜底
});

test("v2: gossipTick 坏输入兜底——null/空账本不报错", () => {
  assert.equal(RUMOR.gossipTick(null, [], NOW), null);
  assert.deepEqual(RUMOR.gossipTick([], null, NOW), []);
  assert.deepEqual(RUMOR.gossipTick([], undefined, undefined), []);
});
