const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function makeContext(){
  const elements = new Map();
  const makeElement = (id="") => ({
    id, style:{}, innerHTML:"", textContent:"", hidden:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){}, appendChild(){}, remove(){}, click(){},
    querySelector(){ return makeElement(); }, querySelectorAll(){ return []; },
    setAttribute(){}, getAttribute(){ return null; },
  });
  const document = {
    body:makeElement("body"),
    getElementById(id){
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag){ return makeElement(tag); },
    querySelectorAll(){ return []; },
    addEventListener(){},
  };
  const storage = new Map();
  return vm.createContext({
    console, document, performance,
    window:{addEventListener(){}}, navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame(){}, fetch:()=>Promise.reject(new Error("offline")),
    titleOn:false, syncRumorsFromState(){}, syncCrewLosses(){}, 
    __elements:elements,
  });
}

function loadState(c=makeContext()){
  vm.runInContext(source("src/data/state.js"), c, {filename:"state.js"});
  return c;
}

test("设计令牌统一了色彩与字体，且标题屏、HUD 都引用同一套", () => {
  const html = source("index.html");
  const theme = source("src/ui/theme.css");
  assert.ok(html.includes('href="src/ui/theme.css"'), "页面必须加载设计令牌层");
  for (const token of ["--od-night","--od-ink","--od-terra","--od-gold","--od-parchment","--od-serif"]){
    assert.ok(theme.includes(token), `缺少设计令牌 ${token}`);
  }
  assert.ok(!theme.includes("KaiTi"), "主题层不应再引入楷体");
  assert.ok(!/--font-myth:[^;]*KaiTi/.test(html), "标题/对话字体应统一到一套衬线栈");
  assert.match(theme, /--panel:var\(--od-ink\)/, "旧的白卡片令牌应重映射到深墨底");
});

test("标题屏是单屏电影感结构，且保留启航/存档入口", () => {
  const html = source("index.html");
  for (const id of ["tsScene","tsMoon","tsSea","tsBoat","tsGrain","tsMark"]){
    assert.ok(html.includes(`class="${id}`) || html.includes(`class="${id}"`), `缺少标题屏图层 ${id}`);
  }
  for (const id of ["tsGo","tsNew","tsSaveCard","tsRuns"]){
    assert.ok(html.includes(`id="${id}"`), `标题屏入口 ${id} 不应被删`);
  }
  assert.ok(!html.includes("视觉素材为本项目原创 AI 概念图"), "标题屏不再用素材声明当副文案");
});

test("HUD 只留三条关键状态，其余数值收进航海日记", () => {
  const html = source("index.html");
  const hudStart = html.indexOf('<div class="hud">');
  const hudEnd = html.indexOf('<div id="hudLog"');
  assert.ok(hudStart >= 0 && hudEnd > hudStart, "HUD 与航海日记结构缺失");
  const bar = html.slice(hudStart, hudEnd);
  assert.ok(bar.includes('id="hudHp"'), "伤势应常驻");
  assert.ok(bar.includes('id="hudSupplyVal"'), "补给应常驻");
  assert.ok(bar.includes('id="hudCompass"'), "航向应常驻");
  for (const moved of ["hudCoins","hudLv","hudClock","hudHungerVal","hudThirstVal"]){
    assert.ok(!bar.includes(`id="${moved}"`), `${moved} 应移出主状态栏`);
    assert.ok(html.includes(`id="${moved}"`), `${moved} 不应消失（只是收进照片）`);
  }
  assert.ok(html.includes('id="hudLogBtn"'), "航海日记需要展开入口");
});

test("开场先给可操作微节拍：真实移动推进，靠岸/看海推进，剧情入口可跳过", () => {
  const c = loadState();
  vm.runInContext(source("src/game/events.js"), c, {filename:"events.js"});
  assert.equal(vm.runInContext("state.openingBeat", c), 0, "新档从第一桨开始");
  c.renderOpening = () => {};

  c.noteOpening("dock");
  assert.equal(vm.runInContext("state.openingBeat", c), 0, "未真正划桨前靠岸不算");
  c.noteOpening("move");
  assert.equal(vm.runInContext("state.openingBeat", c), 1, "真实移动推进到看海");
  c.noteOpening("move");
  assert.equal(vm.runInContext("state.openingBeat", c), 1, "同一节拍不重复推进");
  c.noteOpening("map");
  assert.equal(vm.runInContext("state.openingBeat", c), 2, "开海图/靠岸推进到船歌");
  c.noteOpening("move");
  assert.equal(vm.runInContext("state.openingBeat", c), 2, "船歌只能由玩家选择听或不听");
});

test("序章文字保留原文，两条路都能出海", () => {
  const panels = source("src/ui/panels.js");
  assert.match(panels, /记得回家/, "原序章锚点文字必须保留");
  assert.match(panels, /听下去/, "剧情深入入口必须存在");
  assert.match(panels, /先划桨/, "跳过剧情的出口必须存在");

  const c = loadState();
  vm.runInContext(source("src/ui/panels.js"), c, {filename:"panels.js"});
  c.save = () => {};
  c.openingFinish();
  assert.equal(vm.runInContext("state.openingBeat", c), 3, "选择先走后序章结束");
  assert.equal(typeof c.openingSkip, "function", "跳过序章必须可用");
});

test("旧档不重复播放序章，新档字段可持久化", () => {
  const old = loadState();
  vm.runInContext("state={coins:30,hp:100}; ensureState();", old);
  assert.equal(vm.runInContext("state.openingBeat", old), 3, "旧档视为看过序章");

  const fresh = loadState();
  assert.equal(vm.runInContext("state.openingBeat", fresh), 0, "新档保留序章进度字段");
});
