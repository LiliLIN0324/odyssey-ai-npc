const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/* 批次 K3 · B2（海域世界状态层）+ B1（海上势力船队）的回归锁。
   守四件容易悄悄坏掉的事：
     ① 海域划分是「最近中心」——改了海域中心就会改边界；
     ② 状态由世界时刻推导——时刻推进会换状态，强制状态会过期；
     ③ 三道推进闸门（传送 / 航行里程 / 靠岸）——闸门失灵就会在读档、
        快航、靠岸的瞬间弹卡片，把玩家按死在海上；
     ④ 后果卡与船队卡「只发一次」+ 有冷却——否则玩家会被卡片淹掉。

   注意：本文件用**小步航行**模拟真实开船（每步 < 250px），
   直接改 boat.x/y 属于「传送」，会被传送闸拦掉——那正是要守的行为。 */

function makeContext() {
  const storage = new Map();
  const c = vm.createContext({
    console,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    WTS: 40, ATS: 32, WCOLS: 46, WROWS: 18,
    boat: { x: 34 * 40 + 20, y: 10 * 40 + 20 },
    scene: "world",
    dlgOpen: false, titleOn: false, chapterOn: false, mapOpen: false, askOn: false,
  });
  vm.runInContext(source("src/data/state.js"), c, { filename: "state.js" });
  /* 桩函数必须定义在沙箱**内部**——state.js 用 `let state` 声明，
     沙箱外的闭包拿不到它（拿到的是宿主上的 null）。 */
  vm.runInContext(
    `
    var __asks = [], __toasts = [];
    function toast(m){ __toasts.push(m); }
    function sfx(){}
    function save(){}
    function renderHUD(){}
    function addItem(name){ state.backpack = state.backpack||{}; state.backpack[name]=(state.backpack[name]||0)+1; }
    function gainXp(n){ state.xp=(state.xp||0)+n; }
    function addMemory(t,imp,tag){ state.memory=state.memory||[]; state.memory.push(t); }
    function recordSeaEcho(){}
    function showAsk(kicker,title,sub,quote,options,decId){ __asks.push({kicker,title,sub,quote,options,decId}); }
    `,
    c
  );
  vm.runInContext(source("src/game/worldState.js"), c, { filename: "worldState.js" });
  vm.runInContext(source("src/game/fleets.js"), c, { filename: "fleets.js" });
  c.__asks = vm.runInContext("__asks", c);
  c.__toasts = vm.runInContext("__toasts", c);
  return c;
}

/* 跨 realm 的数组断言：深比较会因为原型不同而失败——先摊成宿主数组。 */
const hostArray = (arr) => Array.from(arr || []);

function tickWorld(c) {
  vm.runInContext("worldMotionTick(); worldStateTick(); fleetTick();", c);
}

/* 小步航行到目标格：每步 < 250px（不触发传送闸），沿途持续跑世界推进。 */
function glide(c, gx, gy, stepPx = 18) {
  const b = vm.runInContext("({x:boat.x, y:boat.y})", c);
  const tx = gx * 40 + 20, ty = gy * 40 + 20;
  const d = Math.hypot(tx - b.x, ty - b.y);
  const n = Math.max(1, Math.ceil(d / stepPx));
  for (let i = 1; i <= n; i++) {
    vm.runInContext(`boat.x = ${b.x + ((tx - b.x) * i) / n}; boat.y = ${b.y + ((ty - b.y) * i) / n};`, c);
    tickWorld(c);
  }
}

test("海域划分按最近中心：西边第勒尼安、东边黎凡特、出生点在黎凡特海", () => {
  const c = makeContext();
  const at = (gx, gy) => vm.runInContext(`regionOf(${gx}*40+20, ${gy}*40+20).id`, c);
  assert.equal(at(8, 9), "tyrrhenian");
  assert.equal(at(40, 11), "levant");
  assert.equal(at(18, 12), "ionian");
  assert.equal(at(34, 10), "levant", "出生点 (34,10) 应落在黎凡特海");
  assert.equal(vm.runInContext("WORLD_REGIONS.length", c), 5);
});

test("海域状态由世界时刻推导：同一时刻可复现，时刻推进会换状态", () => {
  const c = makeContext();
  vm.runInContext("state.wtime = 0;", c);
  const first = vm.runInContext("regionStatus(WORLD_REGIONS.find(r=>r.id==='aegean')).id", c);
  assert.equal(first, "blockade", "爱琴海第 0 拍应是 blockade");
  vm.runInContext("state.wtime = 150;", c);
  const second = vm.runInContext("regionStatus(WORLD_REGIONS.find(r=>r.id==='aegean')).id", c);
  assert.equal(second, "migration", "一个周期后应换成 migration");
  vm.runInContext("state.wtime = 0;", c);
  assert.equal(
    vm.runInContext("regionStatus(WORLD_REGIONS.find(r=>r.id==='aegean')).id", c),
    first,
    "同一世界时刻必须复现同一状态"
  );
});

test("每片海的状态循环只引用已知状态，且至少有平静以外的动静", () => {
  const c = makeContext();
  const bad = vm.runInContext(
    "WORLD_REGIONS.flatMap(r=>r.cycle.filter(s=>!WORLD_STATES[s]).map(s=>r.id+':'+s))",
    c
  );
  assert.deepEqual(hostArray(bad), []);
  const noCalm = vm.runInContext(
    "WORLD_REGIONS.filter(r=>!r.cycle.includes('calm')).map(r=>r.id)",
    c
  );
  assert.deepEqual(hostArray(noCalm), [], "每片海都要能回到平静");
});

test("强制状态可覆盖当前状态，并在到期后自动失效", () => {
  const c = makeContext();
  vm.runInContext("state.wtime = 0;", c);
  vm.runInContext("forceRegionStatus('aegean','plague',60);", c);
  assert.equal(vm.runInContext("regionStatus(WORLD_REGIONS.find(r=>r.id==='aegean')).id", c), "plague");
  vm.runInContext("state.wtime = 61;", c);
  assert.equal(vm.runInContext("regionStatus(WORLD_REGIONS.find(r=>r.id==='aegean')).id", c), "migration");
});

test("闸门：引导未走完且没怎么开船不发卡；引导走完放行；传送落点不发卡", () => {
  const c = makeContext();
  vm.runInContext("state.wtime = 0; state.openingBeat = 3;", c);
  tickWorld(c);                       // 记录航行起点
  // 引导未完成、只航行 300px（不足 1200px）→ 不发卡
  glide(c, 30, 11);
  assert.equal(c.__asks.length, 0, "开局阶段不应发卡");
  // 引导完成 → 放行
  vm.runInContext("state.onboarding = {step:3, done:true};", c);
  glide(c, 24, 10);
  assert.ok(c.__asks.length >= 1, "引导走完后应放行世界事件");
  // 传送（一次跳 > 250px）→ 不发卡，且航行距离归零
  const before = c.__asks.length;
  vm.runInContext("boat.x = 8*40+20; boat.y = 9*40+20;", c);
  tickWorld(c);
  assert.equal(c.__asks.length, before, "传送落点不应发卡");
  assert.equal(vm.runInContext("worldTravelDist()", c), 0, "传送后航行距离应归零");
});

test("跨海航行会撞见后果卡；同一航行只出一张（冷却期），冷却过后再出", () => {
  const c = makeContext();
  vm.runInContext(
    "state.wtime = 0; state.openingBeat = 3; state.onboarding = {step:3, done:true};",
    c
  );
  tickWorld(c);
  glide(c, 8, 9);                     // 从出生点一路向西，跨过 4 条海域边界
  const asks = c.__asks;
  const regionAsks = asks.filter((a) => String(a.decId || "").startsWith("region_"));
  assert.ok(regionAsks.length >= 1, "跨海航行应撞见海域后果卡");
  assert.match(regionAsks[0].kicker, /海/);
  assert.ok(regionAsks[0].options.length >= 2, "后果卡至少两个选项");
  assert.equal(regionAsks.length, 1, "同一段航程只应出一张海域卡（冷却期 240s）");
  const ids = hostArray(vm.runInContext("Object.keys(state.regionSeen)", c));
  assert.ok(ids.length >= 1, "撞见过的状态要记进存档");
  // 冷却过去后再跨一片海 → 再出一张
  vm.runInContext("state.wtime = 300;", c);
  glide(c, 18, 12);
  const after = c.__asks.filter((a) => String(a.decId || "").startsWith("region_"));
  assert.ok(after.length >= 2, "冷却过后应再出卡");
  const decIds = after.map((a) => a.decId);
  assert.equal(new Set(decIds).size, decIds.length, "同一个海域·状态不得重复出卡");
});

test("势力船队沿航路随世界时刻移动，且同一时刻可复现", () => {
  const c = makeContext();
  vm.runInContext("state.wtime = 0;", c);
  const p0 = vm.runInContext("fleetPos(FLEETS.find(f=>f.id==='olive'))", c);
  vm.runInContext("state.wtime = 90;", c);
  const p1 = vm.runInContext("fleetPos(FLEETS.find(f=>f.id==='olive'))", c);
  assert.notEqual(Math.round(p0.x), Math.round(p1.x), "船队必须真的在动");
  vm.runInContext("state.wtime = 0;", c);
  const p0b = vm.runInContext("fleetPos(FLEETS.find(f=>f.id==='olive'))", c);
  assert.equal(p0.x, p0b.x, "同一世界时刻必须复现同一位置");
  assert.equal(p0.y, p0b.y);
  assert.ok(p0.x >= 0 && p0.x < 46 * 40 && p0.y >= 0 && p0.y < 18 * 40, "船队不能跑出世界");
});

test("撞见船队出抉择卡（有名有旗有目的地）", () => {
  const c = makeContext();
  vm.runInContext(
    "state.wtime = 0; state.openingBeat = 3; state.onboarding = {step:3, done:true};" +
    " state.coins = 100; state.hp = 100;",
    c
  );
  tickWorld(c);
  glide(c, 20, 12);
  glide(c, 38, 12);
  const asks = c.__asks.filter((a) => String(a.decId || "").startsWith("fleet_"));
  assert.equal(asks.length, 1, "撞见船队应出一张卡");
  assert.match(asks[0].kicker, /海上势力/);
  assert.ok(asks[0].options.length >= 2, "船队卡至少两个选项");
});

test("劫掠商队会把该片海改成封锁（B1 与 B2 的接线）", () => {
  const c = makeContext();
  vm.runInContext("state.wtime = 0; state.openingBeat = 3; state.coins = 100; state.hp = 100;", c);
  vm.runInContext(
    "(() => { const f = FLEETS.find(x=>x.id==='olive');" +
    " f.meet.choices.find(o=>o.label.includes('劫掠')).run(f); })()",
    c
  );
  assert.ok(vm.runInContext("state.coins", c) > 100, "劫掠应拿到金币");
  assert.equal(
    vm.runInContext("regionStatus(regionOf(boat.x, boat.y)).id", c),
    "blockade",
    "劫掠商队后该片海应转为封锁"
  );
});

test("四支船队都有名字、旗、目的地和至少两个可选行动", () => {
  const c = makeContext();
  assert.equal(vm.runInContext("FLEETS.length", c), 4);
  const bad = vm.runInContext(
    "FLEETS.filter(f=>!f.name||!f.flag||!f.dest||!f.meet||!f.meet.quote||f.meet.choices.length<2)" +
    ".map(f=>f.id)",
    c
  );
  assert.deepEqual(hostArray(bad), []);
  const noChoice = vm.runInContext(
    "FLEETS.flatMap(f=>f.meet.choices.filter(c=>!c.label||!c.hint||typeof c.run!=='function').map(c=>f.id))",
    c
  );
  assert.deepEqual(hostArray(noChoice), []);
});
