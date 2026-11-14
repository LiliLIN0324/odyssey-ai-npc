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
    addEventListener(){},
  };
  const storage = new Map();
  const c = vm.createContext({
    console, document, performance,
    window:{addEventListener(){}}, navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    requestAnimationFrame(){}, fetch:()=>Promise.reject(new Error("offline")),
    WTS:40, ATS:32, WCOLS:46, WROWS:18, ACOLS:20, AROWS:12,
    PROLOGUE_SITES:{}, SITE_MAPS:{}, ISLANDS:[], GATES:{},
    witch:{x:0,y:0}, seer:{x:0,y:0}, aeolus:{x:0,y:0}, calypso:{x:0,y:0}, nausicaa:{x:0,y:0},
    WITCH_SPOTS:{stir:{x:0,y:0}}, CREW_ROSTER:Array.from({length:12},(_,i)=>`船员${i+1}`),
    syncRumorsFromState(){}, syncCrewLosses(){}, isNight:()=>false, isDusk:()=>false,
    toast(){}, sfx(){}, feedback(){}, renderHUD(){}, addMemory(){}, popText(){},
    save(){}, showChapter(){}, buildMapMarks(){}, boatMapPos:()=>[0,0],
    __elements:elements,
  });
  return c;
}

function loadState(c=makeContext()){
  vm.runInContext(source("src/data/state.js"),c,{filename:"state.js"});
  return c;
}
function getState(c){ return vm.runInContext("state",c); }
function loadAchievements(c){
  const src=source("src/data/quests.js");
  const start=src.indexOf("const ACHIV = [");
  const relicStart=src.indexOf("const CODEX_RELICS = [",start);
  const end=src.indexOf("\n];",relicStart)+3;
  assert.ok(start>=0 && relicStart>start && end>relicStart,"achievement and codex fixtures must come from production data");
  vm.runInContext(src.slice(start,end),c,{filename:"quests.fate-data.js"});
}

test("新存档启用情境引导，旧存档迁移后保持静默",()=>{
  const fresh=loadState();
  const onboarding=getState(fresh).onboarding;
  assert.ok(onboarding,"新存档应有 onboarding 状态");
  assert.equal(onboarding.step,0);
  assert.equal(onboarding.done,false);

  const old=loadState();
  vm.runInContext("state={coins:30,hp:100}; ensureState();",old);
  assert.equal(getState(old).onboarding.done,true);
  assert.equal(getState(old).onboarding.step,3);
});

test("引导只按实际移动、首次靠岸、任务或海图的顺序推进并保存",()=>{
  const c=loadState();
  vm.runInContext(source("src/game/events.js"),c,{filename:"events.js"});
  assert.equal(typeof c.noteOnboarding,"function");
  let saves=0;
  c.save=()=>{saves++;};
  c.renderOnboarding=()=>{};

  c.noteOnboarding("dock");
  assert.equal(getState(c).onboarding.step,0,"未移动时靠岸不应跳步");
  c.noteOnboarding("move");
  assert.equal(getState(c).onboarding.step,1);
  c.noteOnboarding("move");
  c.noteOnboarding("dock");
  assert.equal(getState(c).onboarding.step,2);
  c.noteOnboarding("journal");
  assert.equal(getState(c).onboarding.done,true);
  assert.equal(getState(c).onboarding.step,3);
  assert.equal(saves,3,"每个有效阶段只保存一次");

  c.noteOnboarding("map");
  assert.equal(saves,3,"完成后重复事件不应重复保存");
});

test("跳过引导会立即完成并持久化",()=>{
  const c=loadState();
  vm.runInContext(source("src/game/events.js"),c,{filename:"events.js"});
  assert.equal(typeof c.skipOnboarding,"function");
  let saves=0;
  c.save=()=>{saves++;};
  c.renderOnboarding=()=>{};
  c.skipOnboarding();
  assert.equal(getState(c).onboarding.done,true);
  assert.equal(getState(c).onboarding.step,3);
  assert.equal(saves,1);
});

test("tickMove 只在发生真实位移时上报移动",()=>{
  const c=loadState();
  Object.assign(c,{
    scene:"world", boat:{x:100,y:100,face:"right"}, keys:new Set(["d"]),
    titleOn:false, chapterOn:false, mapOpen:false, FISH:{on:false},
  });
  vm.runInContext(source("src/engine/core.js"),c,{filename:"core.js"});
  const events=[];
  c.noteOnboarding=(kind)=>events.push(kind);
  c.tryMoveWorld=(nx,ny)=>{c.boat.x=nx;c.boat.y=ny;return true;};
  c.tickMove(0.1);
  assert.deepEqual(events,["move"]);

  c.tryMoveWorld=()=>false;
  c.tickMove(0.1);
  assert.deepEqual(events,["move"],"顶墙不应算作移动教学完成");
});

test("世界图统一靠岸入口与海图入口都会通知引导",()=>{
  const c=loadState();
  Object.assign(c,{scene:"world",aiaPlayer:{x:0,y:0},boat:{x:0,y:0}});
  vm.runInContext(source("src/interact/handlers.js"),c,{filename:"handlers.js"});
  const events=[];
  c.noteOnboarding=(kind)=>events.push(kind);
  c.islandNear=()=>({scene:"hades",name:"冥界"});
  c.islandOpen=()=>true;
  c.showChapter=()=>{};
  vm.runInContext("titleOn=false; chapterOn=false;",c);
  c.interact();
  assert.deepEqual(events,["dock"]);

  c.openMap();
  assert.deepEqual(events,["dock","map"]);
});

test("命运图鉴显示已解锁内容并分别计数，未解锁成就零剧透",()=>{
  const c=loadState();
  loadAchievements(c);
  Object.assign(c,{MAIN_STEPS:[],OPT_STEPS:[]});
  vm.runInContext(source("src/render/scenes.js"),c,{filename:"scenes.js"});
  vm.runInContext('state.achiv=["no_one"]; questTab="fate";',c);
  c.renderQuests();
  const html=c.__elements.get("questList").innerHTML;
  assert.match(html,/荷马之线/);
  assert.match(html,/改写之线/);
  assert.match(html,/「无人」之名/);
  assert.match(html,/独眼巨人处自称/);
  assert.match(html,/尚未点亮/);
  assert.ok(!html.includes("放下矛的人"),"未解锁名称不能进入 DOM");
  assert.ok(!html.includes("劫掠之城你选择了救治"),"未解锁改写说明不能进入 DOM");
  assert.ok(!html.includes("你救了这座城的伤者"),"未解锁描述不能进入 DOM");
  const canonTotal=vm.runInContext("ACHIV.filter(a=>a.canon).length",c);
  const devTotal=vm.runInContext("ACHIV.filter(a=>a.dev).length",c);
  assert.match(html,new RegExp(`1\\s*\\/\\s*${canonTotal}`),"原著线应显示已解锁/总数");
  assert.match(html,new RegExp(`0\\s*\\/\\s*${devTotal}`),"改写线应独立计数");
});

test("分享卡模型使用旅人名、最新命运、双轨统计与船员存活信息",()=>{
  const c=loadState();
  loadAchievements(c);
  vm.runInContext(source("src/ui/panels.js"),c,{filename:"panels.js"});
  assert.equal(typeof c.shareJourneyModel,"function");
  vm.runInContext(`Object.assign(state,{
    chosenName:"奥德修斯",sunName:"太阳见证的名",calypsoName:"卡吕普索的名",
    achiv:["no_one","spare_enemy"],crewLit:true,crew:7
  });`,c);
  let model=c.shareJourneyModel();
  assert.equal(model.name,"奥德修斯");
  assert.equal(model.latest.name,"放下矛的人");
  assert.equal(model.canonCount,1);
  assert.equal(model.devCount,1);
  assert.match(model.crewText,/7\s*\/\s*12/);

  vm.runInContext(`Object.assign(state,{chosenName:null,sunName:"太阳见证的名",achiv:[],crewLit:false,crew:0});`,c);
  model=c.shareJourneyModel();
  assert.equal(model.name,"太阳见证的名");
  assert.equal(model.latest,null);
  assert.equal(model.canonCount,0);
  assert.equal(model.devCount,0);
  assert.match(model.crewText,/尚未点亮/);

  vm.runInContext("Object.assign(state,{sunName:null,calypsoName:null});",c);
  assert.equal(c.shareJourneyModel().name,"无名旅人");
});

test("页面包含非阻塞引导卡与任务日志双页签",()=>{
  const html=source("index.html");
  for (const id of ["onboardingCard","onboardingSkip","questJourneyTab","questFateTab"]){
    assert.ok(html.includes(`id="${id}"`),`缺少 #${id}`);
  }
  assert.ok(!html.includes("东边的特洛伊海岸还停着你的十二艘船——夜袭之约先结了再南下"),"新档不应再依赖定时教学 toast");
});
