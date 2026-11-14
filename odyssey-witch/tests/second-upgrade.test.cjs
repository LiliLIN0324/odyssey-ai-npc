const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const START = "/* ===== RUN_ARCHIVE · 航程档案 =====";
const END = "/* ===== /RUN_ARCHIVE ===== */";

function runArchiveSource(){
  const src = source("src/data/quests.js");
  const start = src.indexOf(START);
  const end = src.indexOf(END);
  assert.ok(start >= 0 && end > start, "航程档案源码块必须存在于 quests.js");
  return src.slice(start, end + END.length);
}

function makeContext(){
  const storage = new Map();
  const c = vm.createContext({
    console,
    Date,
    JSON,
    localStorage:{
      getItem:k=>storage.has(k)?storage.get(k):null,
      setItem:(k,v)=>storage.set(k,String(v)),
      removeItem:k=>storage.delete(k),
    },
    state:{ achiv:[], legs:{}, crew:12, crewLit:true, fleet:8, level:7, chosenName:null, sunName:null, calypsoName:null },
    ACHIV:[
      {id:"canon_a", name:"A", canon:true},
      {id:"canon_b", name:"B", canon:true},
      {id:"dev_a", name:"C", dev:true},
    ],
    save(){ c.__saves = (c.__saves||0)+1; },
    legsVisitedCount(){ return 9; },
    __storage:storage,
  });
  vm.runInContext("var __saves = 0;", c);
  c.fateSummary = () => {
    const got = c.state.achiv || [];
    return {
      canonGot: c.ACHIV.filter(a=>a.canon && got.includes(a.id)),
      devGot: c.ACHIV.filter(a=>a.dev && got.includes(a.id)),
    };
  };
  vm.runInContext(runArchiveSource(), c, {filename:"quests.run-archive.js"});
  return c;
}

test("航程档案独立于主存档且初始为空",()=>{
  const c = makeContext();
  assert.equal(c.runArchive().length, 0);
  assert.equal(c.runBest(), null);
  const key = vm.runInContext("RUN_KEY", c);
  assert.equal(key, "odyssey-runs-v1");
  assert.notEqual(key, "odyssey-med-v2", "档案不能与主存档共用键");
});

test("recordRun 写入姓名、结局、双轨与船员等派生字段",()=>{
  const c = makeContext();
  c.state.achiv = ["canon_a","canon_b","dev_a"];
  c.state.chosenName = "测试旅人";
  c.state.crew = 9;
  const ok = c.recordRun("home");
  assert.equal(ok, true);
  const list = c.runArchive();
  assert.equal(list.length, 1);
  const run = list[0];
  assert.equal(run.name, "测试旅人");
  assert.equal(run.ending, "归乡");
  assert.equal(run.canon, 2);
  assert.equal(run.dev, 1);
  assert.equal(run.crew, 9);
  assert.equal(run.crewLit, true);
  assert.equal(run.fleet, 8);
  assert.equal(run.legs, 9);
  assert.equal(run.level, 7);
  assert.equal(run.achiv, 3);
  assert.ok(typeof run.at === "number");
  assert.ok(c.__saves > 0, "recordRun 应落盘 runLogged 标记");
});

test("同一段航程只归档一次",()=>{
  const c = makeContext();
  assert.equal(c.recordRun("home"), true);
  assert.equal(c.recordRun("home"), false);
  assert.equal(c.runArchive().length, 1);
});

test("姓名按 chosenName → sunName → calypsoName → 无名旅人 回退",()=>{
  const c = makeContext();
  c.state.sunName = "太阳名";
  c.recordRun("stay");
  assert.equal(c.runArchive()[0].name, "太阳名");
  assert.equal(c.runArchive()[0].ending, "留在奥吉吉亚");

  c.state.runLogged = false;
  c.state.chosenName = "王后认的名字";
  c.recordRun("guest");
  assert.equal(c.runArchive()[0].name, "王后认的名字");
  assert.equal(c.runArchive()[0].ending, "斯克里做客");

  c.state.runLogged = false;
  c.state.chosenName = null; c.state.sunName = null;
  c.recordRun("sea");
  assert.equal(c.runArchive()[0].name, "无名旅人");
  assert.equal(c.runArchive()[0].ending, "把海当归宿");
});

test("航程档案最多保留 12 条且新纪录在前",()=>{
  const c = makeContext();
  for (let i=0;i<15;i++){
    c.state.runLogged = false;
    c.state.level = i+1;
    c.recordRun("home");
  }
  const list = c.runArchive();
  assert.equal(list.length, 12);
  assert.equal(list[0].level, 15, "最新一次应排在最前");
  assert.equal(list[11].level, 4, "超出的最旧记录应被丢弃");
});

test("runBest 汇总各项最佳而不混算同一次航程",()=>{
  const c = makeContext();
  c.state.runLogged = false;
  c.state.achiv = ["canon_a","canon_b"];
  c.state.crew = 4;
  c.state.level = 3;
  c.recordRun("home");

  c.state.runLogged = false;
  c.state.achiv = ["dev_a"];
  c.state.crew = 12;
  c.state.level = 9;
  c.recordRun("sea");

  const best = c.runBest(c.runArchive());
  assert.equal(best.runs, 2);
  assert.equal(best.canon, 2);
  assert.equal(best.dev, 1);
  assert.equal(best.crew, 12);
  assert.equal(best.level, 9);
});

test("损坏或非法档案数据回退为空而不是崩溃",()=>{
  const c = makeContext();
  const key = vm.runInContext("RUN_KEY", c);
  c.__storage.set(key, "{not json");
  assert.equal(c.runArchive().length, 0, "坏 JSON 应回退为空数组");
  c.__storage.set(key, JSON.stringify([{nope:1},"x",{at:1,name:"好记录"}]));
  const list = c.runArchive();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "好记录");
});

test("结局归档挂钩在 showFinale 的登记点",()=>{
  const src = source("src/interact/handlers.js");
  const start = src.indexOf("function showFinale(");
  assert.ok(start >= 0);
  const body = src.slice(start, start + 600);
  assert.match(body, /recordRun\(/, "showFinale 必须调用 recordRun");
});
