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
    querySelectorAll(){ return []; }, addEventListener(){},
  };
  const storage = new Map();
  return vm.createContext({
    console, document, performance,
    window:{addEventListener(){}}, navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame(){}, fetch:()=>Promise.reject(new Error("offline")),
    titleOn:false, dlgOpen:false, mapOpen:false, chapterOn:false, askOn:false,
    syncRumorsFromState(){}, save(){}, renderHUD(){}, sfx(){}, toast(){},
    __elements:elements,
  });
}

function loadState(c=makeContext()){
  vm.runInContext(source("src/data/state.js"), c, {filename:"state.js"});
  return c;
}

function islands(){
  const src = source("src/data/constants.js");
  const start = src.indexOf("const ISLANDS = [");
  const end = src.indexOf("window.ISLANDS", start);
  assert.ok(start >= 0 && end > start, "ISLANDS 数据块必须存在");
  const c = vm.createContext({window:{}});
  vm.runInContext(src.slice(start, end), c);
  return vm.runInContext("ISLANDS", c);
}

function functionSource(file, name, nextName){
  const src = source(file);
  const start = src.indexOf(`function ${name}(`);
  const end = nextName ? src.indexOf(`function ${nextName}(`, start) : src.length;
  assert.ok(start >= 0 && end > start, `${name} 源码块必须存在`);
  return src.slice(start, end);
}

test("13 岛全部保留，每岛都声明明确赌注与回报", () => {
  const list = islands();
  assert.equal(list.length, 13, "岛屿总数不得删减");
  assert.deepEqual(
    Array.from(list, is=>is.scene).sort(),
    ["aia","aeolia","cyclops","hades","ismaros","ithaca","lotus","ogggia","scheria","strait","sun","telepylos","troy"].sort(),
  );
  for (const is of list){
    assert.ok(is.stake && is.stake.length >= 8, `${is.name} 缺少具体赌注`);
    assert.ok(is.reward && is.reward.length >= 4, `${is.name} 缺少具体回报`);
  }
});

test("主线每个阶段都有非空下一目标，目标岛屿仍在 13 岛中", () => {
  const c = loadState();
  vm.runInContext(functionSource("src/render/scenes.js", "nextObjective", "cg"), c);
  c.getQuest = () => null;
  const known = new Set(Array.from(islands(), is=>is.scene));
  const stages = [
    {},
    {prophecy:null},
    {prophecy:"long"},
    {prophecy:"long",straitCleared:true},
    {prophecy:"long",straitCleared:true,sunBlessed:true},
    {prophecy:"long",straitCleared:true,sunBlessed:true,farewellHint:true},
    {prophecy:"long",straitCleared:true,sunBlessed:true,farewellHint:true,ogygiaLeft:true},
    {prophecy:"long",straitCleared:true,sunBlessed:true,farewellHint:true,ogygiaLeft:true,scheriaFarewell:true},
    {prophecy:"long",straitCleared:true,sunBlessed:true,farewellHint:true,ogygiaLeft:true,scheriaFarewell:true,finaleDone:true,troyDone:true,freeSail:true},
  ];
  for (const patch of stages){
    Object.assign(vm.runInContext("state", c), patch);
    const obj = c.nextObjective();
    assert.ok(obj && obj.text && obj.short, `阶段应有明确目标：${JSON.stringify(patch)}`);
    if (obj.k) assert.ok(known.has(obj.k), `目标不能指向不存在的岛：${obj.k}`);
  }
});

test("靠岸卡有独立的岛名、赌注、回报与行动区，并由真实近岛驱动", () => {
  const html = source("index.html");
  for (const id of ["landfallBrief","lfName","lfStake","lfReward","lfAction"]){
    assert.ok(html.includes(`id="${id}"`), `缺少靠岸简报元素 ${id}`);
  }
  const panels = source("src/ui/panels.js");
  assert.match(panels, /function renderLandfallBrief\(/, "缺少靠岸简报渲染入口");
  assert.match(panels, /renderLandfallBrief\(is\)/, "近岛时必须刷新风险与回报");
});

test("选择后按真实状态差生成结算回执并写入持久日志", () => {
  const c = loadState();
  vm.runInContext(source("src/game/events.js"), c, {filename:"events.js"});
  vm.runInContext(functionSource("src/interact/handlers.js", "showAsk", "askChoice"), c, {filename:"handlers.showAsk.js"});
  assert.equal(typeof c.pickAsk, "function");
  c.showAsk("风暴试炼","压浪硬闯","",null,[
    {label:"满舵迎浪",fn:vm.runInContext(`()=>{
      state.hp -= 12;
      state.backpack["治疗草药"]=(state.backpack["治疗草药"]||0)+1;
      showAsk("下一幕","继续航行","",null,[{label:"继续",fn(){}}]);
    }`, c)},
  ]);
  c.pickAsk(0);
  const log = vm.runInContext("state.choiceLog", c);
  assert.equal(log.length, 1, "每次选择只记一笔");
  assert.equal(log[0].title, "压浪硬闯", "连续开启下一张卡时仍记录当前抉择标题");
  assert.equal(log[0].choice, "满舵迎浪");
  assert.ok(log[0].changes.includes("伤势 -12"), "伤势代价必须可见");
  assert.ok(log[0].changes.includes("治疗草药 +1"), "物品回报必须可见");
  assert.match(c.__elements.get("crResult").textContent, /伤势 -12/);
  assert.match(c.__elements.get("crResult").textContent, /治疗草药 \+1/);
});

test("主航程累计真实航行距离也会触发海遇，序章则保持安静", () => {
  const c = vm.createContext({
    scene:"world", boat:{x:100,y:100}, state:{freeSail:false,openingBeat:3,seaThreshold:30}, WTS:40,
    dlgOpen:false,titleOn:false,chapterOn:false,mapOpen:false,
    worldTile:()=>"~", encounters:0,
    doSeaEncounter(){ c.encounters++; },
  });
  const src = source("src/data/constants.js");
  const start = src.indexOf("let _seaAcc = 0");
  const end = src.indexOf("function finishSeaEnc", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(src.slice(start,end), c);
  c.seaEncounterTick();
  c.boat.x += 20; c.seaEncounterTick();
  c.boat.x += 20; c.seaEncounterTick();
  assert.equal(c.encounters, 1, "未通关的主航程也必须有节奏事件");

  c.state.openingBeat = 1;
  c.boat.x += 20; c.seaEncounterTick();
  c.boat.x += 20; c.seaEncounterTick();
  assert.equal(c.encounters, 1, "序章微节拍期间不得被随机海遇打断");
});
