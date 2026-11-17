// ============================================================
// 离线意图引擎 × 正式考卷回归
// ============================================================
// 普通口语单测维护开发侧说法；本文件直接读取仓库根目录正式考卷
// ../../cases.jsonl，按 eval.py 的核心口径校验：
//   1. 类别看集合，不依赖预测顺序；
//   2. 同一类别多个参数实例可放在一个 args 数组，也可写成多条预测；
//   3. 黄金参数必须命中，数量必须是考卷使用的字符串；
//   4. 不再通过物品名称/目标等重复别名键“两边讨好”，兼容放在 handler 读侧。
// 完整分数仍以 `python3 tools/eval_offline.py`（内部复用 eval.score_case）为准。
// ============================================================
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const GAME_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(GAME_ROOT, "..");

function makeEngine() {
  const ctx = vm.createContext({ console, window: {} });
  const source = fs.readFileSync(path.join(GAME_ROOT, "src/agent/localIntent.js"), "utf8");
  vm.runInContext(source, ctx, { filename: "localIntent.js" });
  return ctx.window.LOCAL_INTENT;
}

const E = makeEngine();
const ALL_CASES = fs.readFileSync(path.join(REPO_ROOT, "cases.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map(JSON.parse);

function parse(text, history = []) {
  const preds = E.parse(text, { history });
  assert.ok(Array.isArray(preds) && preds.length, `「${text}」必须返回预测数组`);
  return preds;
}

function flattenedArgs(preds, category) {
  return preds
    .filter((p) => p && p.category === category)
    .flatMap((p) => Array.isArray(p.args) ? p.args : []);
}

function predictedCategories(preds) {
  return [...new Set(preds.map((p) => p.category))].sort();
}

const ALLOWED_ARG_KEYS = new Set([
  "物品", "数量", "货币", "类别", "接收方", "部位", "对象", "状态项",
  "动作", "目的地", "方式", "目标类型", "要素", "地点", "询问内容",
  "生物", "神谕来源", "预言内容", "任务名称", "任务类型", "求助内容", "话题",
]);

function assertExamCase(testCase) {
  const preds = parse(testCase.text, testCase.history || []);
  const expectedCategories = [...new Set(testCase.expect.map((e) => e.category))].sort();
  assert.deepEqual(
    predictedCategories(preds),
    expectedCategories,
    `[${testCase.id}] ${testCase.text}\n期望类别 ${JSON.stringify(expectedCategories)}，实际 ${JSON.stringify(preds)}`
  );

  for (const expected of testCase.expect) {
    const wantArgs = expected.args || {};
    const instances = flattenedArgs(preds, expected.category);
    if (!Object.keys(wantArgs).length) continue;

    const matched = instances.some((actual) =>
      Object.entries(wantArgs).every(([key, value]) => actual && actual[key] === value)
    );
    assert.ok(
      matched,
      `[${testCase.id}] ${testCase.text}\n缺少匹配参数 ${JSON.stringify(wantArgs)}；实际 ${JSON.stringify(instances)}`
    );
  }

  for (const pred of preds) {
    for (const inst of (Array.isArray(pred.args) ? pred.args : [])) {
      for (const [key, value] of Object.entries(inst || {})) {
        assert.ok(ALLOWED_ARG_KEYS.has(key), `[${testCase.id}] 出现考卷参数协议外的键：${key}`);
        if (key === "数量") {
          assert.equal(typeof value, "string", `[${testCase.id}] 数量必须按考卷输出字符串：${value}`);
          assert.match(value, /^\d+$/, `[${testCase.id}] 数量字符串只能含阿拉伯数字：${value}`);
        }
      }
    }
  }
}

for (const group of ["negative", "hostile", "state_set", "multiturn", "multi"]) {
  const groupCases = ALL_CASES.filter((c) => c.group === group);
  test(`正式考卷回归 · ${group}（${groupCases.length} 条，带 history 口径）`, () => {
    const failures = [];
    for (const testCase of groupCases) {
      try {
        assertExamCase(testCase);
      } catch (error) {
        failures.push(error.message);
      }
    }
    assert.equal(failures.length, 0, `\n${failures.join("\n\n")}`);
  });
}

test("正式考卷回归 · 日常交易/使用/船只/采集歧义短句", () => {
  const table = [
    ["问背包淡水", "我背包里还有几壶淡水", [], "查询背包", { 物品: "淡水" }],
    ["吃蜂蜜", "吃块蜂蜜", [], "使用消耗品", { 物品: "蜂蜜" }],
    ["玛草自用", "把玛草给我用上", [], "使用消耗品", { 物品: "玛草" }],
    ["一块面包是购买", "给我来一块面包", [], "购买物品", { 物品: "面包" }],
    ["船用淡水不是购买", "给船装淡水", [], "船只操作", { 动作: "补充淡水" }],
    ["怎么卖是问价", "玛草怎么卖", [], "查询价格", { 物品: "玛草" }],
    ["残缺接活", "我要做", [], "接取任务", {}],
    ["钓鱼不猜物品", "我想去钓鱼", [], "获取物资", { 动作: "垂钓" }],
    ["保留干粮标准名", "给我来三卷干粮", [], "购买物品", { 物品: "干粮", 数量: "3" }],
    ["保留蜂蜜标准名", "买蜂蜜", [], "购买物品", { 物品: "蜂蜜" }],
    ["保留船桨标准名", "这船桨多少钱", [], "查询价格", { 物品: "船桨" }],
    ["买淡水和面包", "我要买淡水还要买面包", [], "购买物品", null],
    ["威胁优先于喂鱼物品", "信不信我把你扔进海里喂鱼", [], "威胁或攻击", {}],
    ["改士气是系统指令", "把士气提一提", [], "其他意图", {}],
    ["打开背包是界面指令", "打开背包界面", [], "其他意图", {}],
    ["修改敌人血量是作弊指令", "把所有敌人血量清零", [], "其他意图", {}],
    ["省略数量继承购买上下文", "三罐", [{ role: "user", content: "买淡水" }, { role: "assistant", content: "要几罐？" }], "购买物品", { 物品: "淡水", 数量: "3" }],
    ["省略目的地继承导航上下文", "提洛", [{ role: "user", content: "我要找一座岛" }, { role: "assistant", content: "往东南是提洛" }], "导航到地点", { 目的地: "提洛" }],
    ["省略物品继承卸下上下文", "矛", [{ role: "user", content: "把装备卸了" }, { role: "assistant", content: "要卸哪件？" }], "卸下装备", { 物品: "铜矛" }],
    ["归乡感慨保留完整话题", "我还能回家吗", [], "闲聊", { 话题: "回家" }],
  ];

  const failures = [];
  for (const [label, text, history, category, wantArgs] of table) {
    try {
      const preds = parse(text, history);
      assert.deepEqual(predictedCategories(preds), [category], `${label}：类别不符，实际 ${JSON.stringify(preds)}`);
      if (wantArgs && Object.keys(wantArgs).length) {
        const instances = flattenedArgs(preds, category);
        const matched = instances.some((actual) =>
          Object.entries(wantArgs).every(([key, value]) => actual && actual[key] === value)
        );
        assert.ok(matched, `${label}：缺少 ${JSON.stringify(wantArgs)}，实际 ${JSON.stringify(instances)}`);
      }
      if (text === "我要买淡水还要买面包") {
        const items = new Set(flattenedArgs(preds, "购买物品").map((a) => a.物品));
        assert.deepEqual(items, new Set(["淡水", "面包"]), `多物品必须保留两个购买实例：${JSON.stringify(preds)}`);
      }
    } catch (error) {
      failures.push(error.message);
    }
  }
  assert.equal(failures.length, 0, `\n${failures.join("\n")}`);
});

test("正式考卷回归 · args 始终是对象数组且兜底不携带结算参数", () => {
  for (const testCase of ALL_CASES) {
    const preds = parse(testCase.text, testCase.history || []);
    for (const pred of preds) {
      assert.ok(Array.isArray(pred.args), `[${testCase.id}] ${pred.category} 的 args 必须是数组`);
      for (const inst of pred.args) assert.equal(typeof inst, "object", "args 元素必须是对象");
      if (pred.category === "其他意图") {
        const nonEmpty = pred.args.filter((a) => a && Object.keys(a).length);
        assert.equal(nonEmpty.length, 0, `[${testCase.id}] 其他意图不应携带结算参数：${JSON.stringify(pred.args)}`);
      }
    }
  }
});

test("真实对话历史 · NPC 开场白不能劫持首轮自足句，泛化数量词不抽成 1", () => {
  const witchOpening = [{ role: "assistant", content: "……说吧——买药、问路、听预言……" }];
  const seerOpening = [{ role: "assistant", content: "亡者的国不派活计，只给路。" }];
  const table = [
    ["背包里有什么", witchOpening, "查询背包"],
    ["再见", witchOpening, "告别"],
    ["买面包", witchOpening, "购买物品"],
    ["装备铁剑", witchOpening, "装备物品"],
    ["生火", witchOpening, "营地准备"],
    ["再见", seerOpening, "告别"],
    ["买面包", [{ role: "user", content: "我要去码头" }, { role: "assistant", content: "北边就是" }], "购买物品"],
    ["装备铁剑", [{ role: "user", content: "我要接任务" }, { role: "assistant", content: "想接哪个？" }], "装备物品"],
  ];
  const failures = [];
  for (const [text, history, category] of table){
    const preds = parse(text, history);
    const cats = predictedCategories(preds);
    if (JSON.stringify(cats) !== JSON.stringify([category])){
      failures.push(`「${text}」在开场白历史后应保持 ${category}，实际 ${JSON.stringify(preds)}`);
    }
  }
  for (const text of ["我想买一些面包", "我们一起买淡水", "我一会儿买面包"]){
    const preds = parse(text, []);
    const count = flattenedArgs(preds, "购买物品")[0]?.数量;
    if (count !== undefined) failures.push(`「${text}」不应把泛指的“一”抽成数量：${count}`);
  }
  assert.equal(failures.length, 0, `\n${failures.join("\n")}`);
});

test("游戏调用处 · handler.localFallbackParse 透传 history 并保持浏览器全局函数接线", () => {
  const element = () => ({
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, focus() {},
    querySelector() { return element(); }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, value: "", disabled: false,
  });
  const sandbox = {
    console,
    document: {
      getElementById() { return element(); },
      querySelector() { return element(); },
      querySelectorAll() { return []; },
      createElement() { return element(); },
      addEventListener() {},
      body: element(),
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    fetch: () => Promise.reject(new Error("离线测试不访问网络")),
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    location: { href: "http://127.0.0.1/", protocol: "http:" },
    navigator: { userAgent: "node-test" },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(GAME_ROOT, "src/agent/localIntent.js"), "utf8"), sandbox, { filename: "localIntent.js" });
  vm.runInContext(fs.readFileSync(path.join(GAME_ROOT, "src/agent/handler.js"), "utf8"), sandbox, { filename: "handler.js" });

  assert.equal(typeof sandbox.localFallbackParse, "function", "handler.js 应提供 localFallbackParse 全局函数");
  const withHistory = sandbox.localFallbackParse("三罐", "witch", {
    history: [{ role: "user", content: "买淡水" }, { role: "assistant", content: "要几罐？" }],
  });
  assert.equal(withHistory[0].category, "购买物品");
  assert.equal(withHistory[0].args[0].物品, "淡水");
  assert.equal(withHistory[0].args[0].数量, "3");

  const blocked = sandbox.localFallbackParse("打开背包界面", "witch", { history: [] });
  assert.equal(blocked[0].category, "其他意图");
  assert.equal(Array.isArray(blocked[0].args), true);
  assert.equal(blocked[0].args.length, 0);

  sandbox.NPC_SHORT = { calypso: "卡吕普索", custom_islander: "岛上医者" };
  const pronounReceiver = sandbox.localFallbackParse("把金苹果给她", "calypso", { history: [] });
  assert.equal(pronounReceiver[0].args[0].接收方, "卡吕普索");

  const runtimeNameReceiver = sandbox.localFallbackParse("把这个给她", "custom_islander", { history: [] });
  assert.equal(runtimeNameReceiver[0].args[0].接收方, "岛上医者", "handler 应把运行时 NPC_SHORT 名称传给离线引擎");

  const cattleReceiver = sandbox.localFallbackParse("把这个给她", "cattle", { history: [] });
  assert.equal(cattleReceiver[0].args[0].接收方, "圣牛群", "牛群对话主体不应被写成远处的赫利俄斯");
  const epeiusReceiver = sandbox.localFallbackParse("把这个给她", "epeius", { history: [] });
  assert.equal(epeiusReceiver[0].args[0].接收方, "厄佩俄斯", "造马师 NPC 应能解析出角色称呼");

  sandbox.state = {
    backpack: { 断桨: 1, 面包: 2, 幸存者的绳结: 1, 烤野猪肉: 1, 蜂蜜: 1 },
  };
  assert.equal(sandbox.resolveOwnedItemName("蜂蜜"), "蜂蜜", "已持有的标准名应原样使用");
  assert.equal(sandbox.resolveOwnedItemName("船桨"), "断桨", "schema 船桨应在持有断桨时由读取侧兼容");
  assert.equal(sandbox.resolveOwnedItemName("干粮"), "面包", "schema 干粮应兼容剧情发放的面包库存");
  assert.equal(sandbox.resolveOwnedItemName("绳结"), "幸存者的绳结", "绳结应兼容全称保护物品");
  assert.equal(sandbox.resolveOwnedItemName("野猪肉"), "烤野猪肉", "野猪肉应兼容已烹饪库存");
  sandbox.state.backpack = {};
  assert.equal(sandbox.resolveOwnedItemName("船桨"), "船桨", "背包没有别名物品时不能偷换名称");

  sandbox.state.backpack = { 蜂蜜酒: 2, 烤鱼: 1 };
  assert.equal(sandbox.resolveOwnedItemName("蜂蜜"), "蜂蜜", "不能因字符串包含把蜂蜜误结算成蜂蜜酒");
  assert.equal(sandbox.resolveOwnedItemName("鱼"), "烤鱼", "玩家说鱼且只有熟食鱼时，可兼容到烤鱼库存");

  sandbox.currentNPC = "witch";
  sandbox.state = {
    backpack: { 断桨: 1, 面包: 2 }, coins: 0, affinity: 0, hp: 10, hunger: 20, thirst: 20, status: {},
  };
  const deleted = [];
  sandbox.isProtectedItem = () => false;
  sandbox.delItem = (id, qty = 1) => {
    if (!sandbox.state.backpack[id]) return false;
    deleted.push({ id, qty });
    sandbox.state.backpack[id] -= qty;
    if (sandbox.state.backpack[id] <= 0) delete sandbox.state.backpack[id];
    return true;
  };
  const discardReply = sandbox.handle("丢弃物品", { 物品: "船桨" });
  assert.equal(deleted[0].id, "断桨", "丢弃 schema 船桨时应结算到背包中的断桨");
  assert.match(discardReply.text, /船桨/);

  sandbox.FOOD = { 面包: { h: 45 } };
  sandbox.DRINK = {};
  sandbox.derived = () => ({ maxHp: 100 });
  sandbox.popText = () => {};
  sandbox.sfx = () => {};
  sandbox.renderHUD = () => {};
  sandbox.aiaPlayer = { x: 0, y: 0 };
  const useReply = sandbox.handle("使用消耗品", { 物品: "干粮" });
  assert.equal(deleted[1].id, "面包", "使用 schema 干粮时应消耗剧情发放的面包库存");
  assert.match(useReply.text, /下肚|踏实/);

  sandbox.SHOP = { 面包: 5 };
  sandbox.shopPrice = (id) => sandbox.SHOP[id] || 2;
  sandbox.toNum = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : 1;
  };
  sandbox.addMemory = () => {};
  sandbox.addAffinity = () => {};
  const coinsBefore = sandbox.state.coins;
  const sellReply = sandbox.handle("卖出物品", { 物品: "干粮", 数量: "1" });
  assert.equal(deleted[2].id, "面包", "卖出 schema 干粮时应扣减实际持有的面包库存");
  assert.equal(sandbox.state.coins, coinsBefore + 2, "面包商店价 5，卖出应按半价 2 结算");
  assert.match(sellReply.text, /德拉克马/);
});

test("游戏调用处 · 牛群 NPC 的使用消耗品分支能读取 schema 物品参数", () => {
  const source = fs.readFileSync(path.join(GAME_ROOT, "src/interact/handlers.js"), "utf8");
  const start = source.indexOf("function handleCattle");
  const end = source.indexOf("// --- handleCalypso", start);
  assert.ok(start >= 0 && end > start, "应能定位 handleCattle 函数");
  const body = source.slice(start, end);
  const state = { backpack: { 蜂蜜: 1 }, status: {}, hunger: 40, thirst: 40, hp: 10 };
  let deletedItem = "";
  const factory = new Function(
    "lastUserText", "state", "FOOD", "DRINK", "derived", "popText", "delItem", "sfx", "renderHUD", "aiaPlayer",
    `${body}; return handleCattle;`
  );
  const handleCattle = factory(
    "吃点蜂蜜",
    state,
    { 蜂蜜: { h: 10 } },
    {},
    () => ({ maxHp: 100 }),
    () => {},
    (item) => { deletedItem = item; delete state.backpack[item]; },
    () => {},
    () => {},
    { x: 0, y: 0 }
  );
  const reply = handleCattle("使用消耗品", { 物品: "蜂蜜" });
  assert.match(reply.text, /蜂蜜/);
  assert.equal(deletedItem, "蜂蜜");
  assert.equal(state.backpack.蜂蜜, undefined);
});

test("正式考卷全量评分 · eval_offline 复用 eval.score_case 达到游戏上下文验收", { timeout: 60_000 }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "odyssey-offline-score-"));
  const outFile = path.join(tempDir, "report.json");
  const pythonBin = process.env.PYTHON || "python3";
  const run = spawnSync(
    pythonBin,
    [path.join(REPO_ROOT, "tools", "eval_offline.py"), "--out", outFile],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 }
  );
  try {
    assert.equal(run.status, 0, `eval_offline.py 执行失败：\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
    const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const summary = report.summary;
    assert.equal(summary.total, 323);
    assert.equal(summary.context_mode, "game-currentNPC-fixture");
    assert.equal(summary.category_accuracy, 1);
    assert.equal(summary.args_f1, 1);
    assert.equal(summary.fully_correct_rate, 1);
    assert.equal(summary.false_trigger_rate, 0);
    assert.equal(report.results.length, 323);
    assert.ok(report.results.every((row) => row.fully_correct), "全量用例都应通过官方 score_case 完全正确判定");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("正式考卷全量严格审计 · 参数实例多重集与键名完全一致", { timeout: 60_000 }, () => {
  const pythonBin = process.env.PYTHON || "python3";
  const run = spawnSync(
    pythonBin,
    [path.join(REPO_ROOT, "tools", "audit_offline_strict.py"), "--context", "game"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(run.status, 0, `严格审计失败：\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  assert.match(run.stdout, /exact_cases=323\/323 failures=0/);
});
