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
    id, style:{}, innerHTML:"", textContent:"", hidden:false, value:"",
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){}, appendChild(){}, remove(){}, click(){},
    querySelector(){ return makeElement(); }, querySelectorAll(){ return []; },
    setAttribute(){}, getAttribute(){ return null; },
  });
  const document = {
    body:makeElement("body"),
    getElementById(id){
      if (!elements.has(id)){
        const el=makeElement(id);
        if (id==="cv"){ el.width=1200; el.height=720; el.getContext=()=>({}); }
        elements.set(id,el);
      }
      return elements.get(id);
    },
    createElement(tag){ return makeElement(tag); },
    querySelectorAll(){ return []; }, addEventListener(){},
  };
  const storage = new Map();
  return vm.createContext({
    console, document, performance,
    window:{addEventListener(){}}, navigator:{},
    localStorage:{
      getItem:k=>storage.has(k)?storage.get(k):null,
      setItem:(k,v)=>storage.set(k,String(v)),
      removeItem:k=>storage.delete(k),
    },
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame(){}, fetch:()=>Promise.reject(new Error("offline")),
    WTS:40, ATS:32, WCOLS:46, WROWS:18, ACOLS:20, AROWS:12,
    PROLOGUE_SITES:{}, SITE_MAPS:{}, ISLANDS:[], GATES:{},
    witch:{x:0,y:0}, seer:{x:0,y:0}, aeolus:{x:0,y:0}, calypso:{x:0,y:0}, nausicaa:{x:0,y:0},
    WITCH_SPOTS:{stir:{x:0,y:0}}, CREW_ROSTER:Array.from({length:12},(_,i)=>`船员${i+1}`),
    isSolidTile:()=>false, syncRumorsFromState(){}, isNight:()=>false, isDusk:()=>false,
    toast(){}, sfx(){}, feedback(){}, renderHUD(){}, addMemory(){}, popText(){},
    save(){}, showChapter(){}, buildMapMarks(){}, boatMapPos:()=>[0,0],
    titleOn:false, dlgOpen:false, mapOpen:false, chapterOn:false, askOn:false,
    __elements:elements,
  });
}

function loadState(c=makeContext()){
  vm.runInContext(source("src/data/state.js"), c, {filename:"state.js"});
  return c;
}
function getState(c){ return vm.runInContext("state", c); }
function loadCrew(c){
  const src=source("src/data/constants.js");
  const start=src.indexOf("const CREW_ROSTER");
  const end=src.indexOf("function enterPrologue",start);
  assert.ok(start>=0&&end>start,"船员生产代码块必须存在");
  vm.runInContext(src.slice(start,end),c,{filename:"constants.crew.js"});
}
function loadSave(c){
  loadCrew(c);
  const src=source("src/data/quests.js");
  const start=src.indexOf('let scene = "world"');
  const end=src.indexOf("function hardReset",start);
  assert.ok(start>=0&&end>start,"存档生产代码块必须存在");
  vm.runInContext(src.slice(start,end),c,{filename:"quests.save.js"});
}
function loadFateData(c){
  const src=source("src/data/quests.js");
  const start=src.indexOf("const ACHIV = [");
  const end=src.indexOf("function achivTick",start);
  assert.ok(start>=0&&end>start,"命运与图鉴生产数据必须存在");
  vm.runInContext(src.slice(start,end),c,{filename:"quests.fate.js"});
}
function loadIslands(c){
  const src=source("src/data/constants.js");
  const start=src.indexOf("const ISLANDS = [");
  const end=src.indexOf("window.ISLANDS",start);
  vm.runInContext(src.slice(start,end),c,{filename:"constants.islands.js"});
}

test("具名名册在点亮与减员后保持存活、折损和原因一致",()=>{
  const c=loadState();
  loadCrew(c);
  vm.runInContext("state.troyDone=true",c);
  c.crewLedgerLight();
  assert.equal(getState(c).crew,12);
  assert.equal(getState(c).crewList.length,12);
  const removed=c.loseCrew(6,"测试海难");
  assert.equal(removed,6);
  const s=getState(c);
  assert.equal(s.crew,6);
  assert.equal(s.crewList.length,6);
  assert.equal(s.crewLost.length,6,"每次折损都要留下可回看的具名记录");
  assert.deepEqual(Array.from(s.crewLost,entry=>entry.name),Array.from(vm.runInContext("CREW_ROSTER.slice(6)",c)));
  assert.ok(s.crewLost.every(entry=>entry.why==="测试海难"));
  assert.ok([...s.crewList,...Array.from(s.crewLost,e=>e.name)].every((name,i,names)=>names.indexOf(name)===i),"同一人不能同时在船且折损");

  Object.assign(c,{MAIN_STEPS:[],OPT_STEPS:[]});
  vm.runInContext(source("src/render/scenes.js"),c,{filename:"scenes.js"});
  const html=c.renderCrew();
  assert.match(html,/6\s*\/\s*12/);
  assert.match(html,/欧律洛科斯/);
  assert.match(html,/波吕多罗斯/);
  assert.match(html,/在船/);
  assert.match(html,/折损/);
  assert.match(html,/测试海难/);
});

test("旧档缺折损名册时按存活名单回补，不抹掉原有船员账",()=>{
  const c=loadState();
  loadCrew(c);
  vm.runInContext(`state={
    coins:30,hp:100,crewLit:true,troyDone:true,crew:6,
    crewList:CREW_ROSTER.slice(0,6)
  }; ensureState();`,c);
  const s=getState(c);
  assert.equal(s.crew,6);
  assert.equal(s.crewList.length,6);
  assert.equal(s.crewLost.length,6);
  assert.deepEqual(Array.from(s.crewLost,entry=>entry.name),Array.from(vm.runInContext("CREW_ROSTER.slice(6)",c)));
});

test("存档导出后清空再导入可完整恢复嵌套进度、场景与位置",()=>{
  const c=loadState();
  loadSave(c);
  vm.runInContext(`Object.assign(state,{
    coins:77,crewLit:true,crew:6,crewList:CREW_ROSTER.slice(0,6),
    achiv:["no_one"],choiceLog:[{title:"风暴",choice:"满舵",changes:["伤势 -6"]}],
    quests:{witch_grass:{id:"witch_grass",have:2,need:3}}
  }); scene="aia"; boat.x=900; boat.y=460; aiaPlayer.x=123; aiaPlayer.y=234;`,c);
  const raw=c.exportSaveData();
  const exported=JSON.parse(raw);
  assert.equal(exported.v,vm.runInContext("SAVE_VERSION",c));
  assert.equal(exported.state.choiceLog[0].choice,"满舵");
  c.localStorage.removeItem(vm.runInContext("SAVE_KEY",c));
  c.localStorage.removeItem(vm.runInContext("SAVE_KEY",c)+".bak");
  assert.equal(c.importSaveData(raw),true);
  assert.equal(c.load(),true);
  const restored=JSON.parse(c.localStorage.getItem(vm.runInContext("SAVE_KEY",c)));
  assert.equal(restored.state.coins,77);
  assert.deepEqual(restored.state.crewList,exported.state.crewList);
  assert.deepEqual(restored.state.choiceLog,exported.state.choiceLog);
  assert.deepEqual(restored.state.quests,exported.state.quests);
  assert.equal(vm.runInContext("scene",c),"aia");
  assert.equal(vm.runInContext("boat.x",c),900);
  assert.equal(vm.runInContext("aiaPlayer.y",c),234);
});

test("非法、缺字段和未来版本存档均被拒绝且不覆盖现有主档",()=>{
  const c=loadState();
  loadSave(c);
  c.save();
  const key=vm.runInContext("SAVE_KEY",c);
  const before=c.localStorage.getItem(key);
  const current=JSON.parse(before);
  const invalid=[
    "not json",
    JSON.stringify({v:current.v,state:{coins:"很多",hp:100}}),
    JSON.stringify({...current,v:current.v+1}),
  ];
  for(const raw of invalid){
    assert.equal(c.importSaveData(raw),false);
    assert.equal(c.localStorage.getItem(key),before,"失败导入不得覆盖主档");
  }
  const old={...current,v:2,boat:{x:450,y:230}};
  assert.equal(c.importSaveData(JSON.stringify(old)),true,"旧版本仍可导入");
  assert.equal(c.load(),true);
  assert.equal(vm.runInContext("boat.x",c),900,"v2 船位仍按既有迁移链处理");
});

test("命运图鉴保留双轨成就并扩展岛屿与信物，未解锁内容零剧透",()=>{
  const c=loadState();
  loadIslands(c);
  loadFateData(c);
  Object.assign(c,{MAIN_STEPS:[],OPT_STEPS:[]});
  vm.runInContext(source("src/render/scenes.js"),c,{filename:"scenes.js"});
  vm.runInContext(`state.achiv=["no_one"]; state.legs={aia:1}; state.hermesMet=true; questTab="fate";`,c);
  c.renderQuests();
  const html=c.__elements.get("questList").innerHTML;
  assert.match(html,/荷马之线/);
  assert.match(html,/改写之线/);
  assert.match(html,/「无人」之名/);
  assert.match(html,/群 岛 图 鉴/);
  assert.match(html,/埃阿亚岛/);
  assert.match(html,/喀耳刻的领地/);
  assert.match(html,/旅 途 信 物/);
  assert.match(html,/魔草/);
  assert.ok(!html.includes("奥吉吉亚"),"未到岛屿名称不得提前泄露");
  assert.ok(!html.includes("卡吕普索的岛"),"未到岛屿说明不得提前泄露");
  assert.ok(!html.includes("歌词残页"),"未获得信物不得提前泄露");
});

test("设置面板提供真实导出按钮与本地文件导入入口，船员有独立日志页",()=>{
  const html=source("index.html");
  for(const id of ["exportSaveBtn","importSaveBtn","saveImportInput","questCrewTab"]){
    assert.ok(html.includes(`id="${id}"`),`缺少阶段三界面元素 ${id}`);
  }
  const panels=source("src/ui/panels.js");
  assert.match(panels,/function exportSave\(/);
  assert.match(panels,/function importSaveFile\(/);
  assert.match(panels,/\.download\s*=/);
});

test("抉择回声：state.decisions 在新档与旧档均初始化为空字典",()=>{
  const c=loadState();
  loadCrew(c);
  vm.runInContext(`ensureState();`,c);
  assert.equal(typeof getState(c).decisions,"object","新档 decisions 必须是对象");
  assert.deepEqual(Object.keys(getState(c).decisions),[],"新档 decisions 必须为空");
  /* 旧档无 decisions 字段 → ensureState 补 {} */
  vm.runInContext(`state={coins:30,hp:100,crewLit:false}; ensureState();`,c);
  assert.equal(typeof getState(c).decisions,"object","旧档回补 decisions 为对象");
  assert.deepEqual(Object.keys(getState(c).decisions),[],"旧档回补 decisions={}");
});

test("抉择回声：decisions 跨存档导出导入完整保留",()=>{
  const c=loadState();
  loadSave(c);
  vm.runInContext(`Object.assign(state,{
    decisions:{"sea_storm":"压浪硬闯","troy_fire":"放下火把（改写）","mead":"握着魔草，把酒喝干"}
  });`,c);
  const raw=c.exportSaveData();
  const exported=JSON.parse(raw);
  assert.equal(exported.state.decisions.sea_storm,"压浪硬闯");
  assert.equal(exported.state.decisions.troy_fire,"放下火把（改写）");
  c.localStorage.removeItem(vm.runInContext("SAVE_KEY",c));
  c.localStorage.removeItem(vm.runInContext("SAVE_KEY",c)+".bak");
  assert.equal(c.importSaveData(raw),true);
  assert.equal(c.load(),true);
  const restored=JSON.parse(c.localStorage.getItem(vm.runInContext("SAVE_KEY",c)));
  assert.deepEqual(restored.state.decisions,exported.state.decisions,"decisions 必须完整往返");
});

test("抉择回声：pickAsk 把带 decId 的选择写入 state.decisions",()=>{
  const c=loadState();
  loadSave(c);
  /* 加载 events.js 中的 pickAsk / settleChoice / choiceSnapshot 等函数 */
  const evSrc=source("src/game/events.js");
  vm.runInContext(evSrc,c,{filename:"events.js"});
  /* 构造最小 ask 上下文：askOpts + askMeta.decId */
  vm.runInContext(`
    askOpts=[{label:"压浪硬闯",fn:()=>{ state.hp=Math.max(1,state.hp-6); }}];
    askMeta={kicker:"主航程 · 海面遭遇",title:"风暴",decId:"sea_storm"};
    pickAsk(0);
  `,c);
  const s=getState(c);
  assert.equal(s.decisions.sea_storm,"压浪硬闯","decId 对应的抉择必须写入 decisions");
  assert.ok(s.choiceLog[0].choice.includes("压浪硬闯"),"choiceLog 仍保留原结算");
});
