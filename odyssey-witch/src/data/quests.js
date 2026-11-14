// ============================================================
// 奥德赛 · 数据模块 —— quests
// ============================================================

/* ---------- 任务系统（rpg：定义是数据、进度进存档；目标由事件总线驱动） ---------- */
const QUEST_DEFS = {
  witch_grass:  { name:"采集玛草", need:3, who:"witch",  on:"collect:玛草", reward:{coins:5, items:{"治疗草药":1}, xp:30} },   /* reward 是定义层数据（实际发放硬编码在各 handler，见 witch_grass 复命分支的 addItem） */
  aeolia_winds: { name:"释放四风", need:4, who:"aeolus", on:"wind",         reward:{items:{"风袋":4}, xp:30} },
};
function getQuest(id){ return state.quests[id]; }
function acceptQuest(id){
  const def=QUEST_DEFS[id]; if(!def) return null;
  if (!state.quests[id]){
    state.quests[id]={id, name:def.name, need:def.need, have:0, done:false, turned:false, ready:false, who:def.who};
    /* 采集类委托：把背包里已经采到的东西先算进去。
       旧实现 have 从 0 起算——玩家在岛上先采了 2 株玛草再接单，
       委托进度仍是 0/3（草也采光、只能花 8 德拉克马买草补计数），看起来像任务坏了。 */
    if (def.on && def.on.indexOf("collect:")===0){
      const item = def.on.slice(8);
      const got = state.backpack[item]||0;
      if (got>0){
        state.quests[id].have = Math.min(got, def.need);
        if (state.quests[id].have>=def.need) state.quests[id].ready=true;
      }
    }
    renderHUD();
  }
  return state.quests[id];
}
/* 事件总线：击杀/拾取/交互统一从这里进任务进度（rpg on_event） */
function questEvent(kind, data){
  data = data||{};
  for (const q of Object.values(state.quests||{})){
    if (q.done) continue;
    const def=QUEST_DEFS[q.id]; if(!def) continue;
    const hit = kind==="wind" ? def.on==="wind" : (kind==="collect" && def.on==="collect:"+data.item);
    if (!hit) continue;
    if (q.have < q.need){
      q.have++;
      if (q.have >= q.need){ q.ready=true; toast(`「${q.name}」目标达成——回去复命吧。`); }
    }
  }
  renderHUD();
}
let scene = "world";
const boat  = { x: 22*WTS+WTS/2, y: 11*WTS+WTS/2 };   /* 爱琴海南口开阔水域（特洛伊西南，朝埃阿亚岛去）：
                                                         旧值 (9,7) 落在意大利半岛陆地格上，开局四方向全卡死、3D 下相机埋进岛体 */
const aiaPlayer = { x: 4*ATS+ATS/2, y: 8*ATS+ATS/2, w: 24, h: 14, face: "down", moving:false, step:0 };

const SAVE_KEY = "odyssey-med-v2", SAVE_VERSION = 4;   /* 批次 H9：v4=世界尺寸翻倍（船位 px ×2） */
function savePayload(){
  /* 战斗单位的血量/存活也进存档：野猪与特洛伊卫兵原本是模块级常量，
     读档后满血复活（猪能再杀一次再掉一块肉、卫兵每只再给一次历练）——进度丢失兼刷分。
     用 typeof 兜底：单测只加载存档那一段代码，boar / TROY_GUARDS 不在其中。 */
  const boarState = (typeof boar!=="undefined") ? {hp:boar.hp, alive:boar.alive} : null;
  const guardState = (typeof TROY_GUARDS!=="undefined") ? TROY_GUARDS.map(g=>({hp:g.hp, alive:g.alive})) : null;
  return {
    v:SAVE_VERSION, state, scene,
    boat:{x:boat.x,y:boat.y}, aia:{x:aiaPlayer.x,y:aiaPlayer.y},
    ...(boarState ? {boar:boarState} : {}),
    ...(guardState ? {guards:guardState} : {}),
  };
}
function exportSaveData(){ return JSON.stringify(savePayload()); }
function save(){ try{
  const cur = localStorage.getItem(SAVE_KEY);
  if (cur) localStorage.setItem(SAVE_KEY+".bak", cur);   /* 原子写双份：主档覆盖前先留上一版（save-systems） */
  localStorage.setItem(SAVE_KEY, exportSaveData());
}catch(e){} }
function parseSave(raw){
  try{
    const d=JSON.parse(raw||"null");
    if (!d || !d.state || Array.isArray(d.state)) return null;
    if (!Number.isFinite(d.state.coins) || !Number.isFinite(d.state.hp)) return null;
    const v=d.v===undefined?2:d.v;
    if (!Number.isInteger(v) || v<2 || v>SAVE_VERSION) return null;
    if (d.scene!==undefined && typeof d.scene!=="string") return null;
    for (const pos of [d.boat,d.aia]){
      if (pos!==undefined && (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y))) return null;
    }
    return d;
  }catch(e){}
  return null;
}
function importSaveData(raw){
  const d=parseSave(raw);
  if (!d) return false;
  try{
    const cur=localStorage.getItem(SAVE_KEY);
    if (cur) localStorage.setItem(SAVE_KEY+".bak",cur);
    localStorage.setItem(SAVE_KEY,JSON.stringify(d));
    return true;
  }catch(e){ return false; }
}
function load(){
  /* 主档损坏/截断 → 回退上一版备份（save-systems 原子写） */
  const d = parseSave(localStorage.getItem(SAVE_KEY)) || parseSave(localStorage.getItem(SAVE_KEY+".bak"));
  if (!d) return false;
  /* 版本迁移链：v<current 逐级跑纯函数迁移（v2→v3 无结构断裂，字段默认值由 ensureState 兑底）。
     批次 H9：v<4 的船位建于 20px 网格——世界尺寸翻倍后船位 px ×2（落点偏差由既有最近水瓦回捞兜底） */
  if ((d.v||2) < 4 && d.boat){ d.boat.x*=2; d.boat.y*=2; }
  while ((d.v||2) < SAVE_VERSION) d.v = SAVE_VERSION;
  if (d.v > SAVE_VERSION) return false;   /* 未来版本存档：拒绝而不是静默清字段 */
  state = d.state;
  if (d.boat){
    /* Steam 化：存档救援——旧档船位可能在世界界外（边界钳制实装前驶出的），
       钳回界内；若钳到陆地则搜最近水瓦片（46×18 全量扫描，一次性开销可忽） */
    const M = WTS*0.5;
    let bx = Math.max(M, Math.min(WCOLS*WTS-M, d.boat.x));
    let by = Math.max(M, Math.min(WROWS*WTS-M, d.boat.y));
    if (isSolidTile(Math.floor(bx/WTS), Math.floor(by/WTS))){
      let best = null, bd = Infinity;
      for (let cy2=0; cy2<WROWS; cy2++) for (let cx2=0; cx2<WCOLS; cx2++){
        if (isSolidTile(cx2, cy2)) continue;
        const dx = cx2*WTS+WTS/2-bx, dy = cy2*WTS+WTS/2-by, dd = dx*dx+dy*dy;
        if (dd < bd){ bd = dd; best = {x: cx2*WTS+WTS/2, y: cy2*WTS+WTS/2}; }
      }
      if (best){ bx = best.x; by = best.y; }
    }
    boat.x = bx; boat.y = by;
  }
  if (d.aia){ aiaPlayer.x=d.aia.x; aiaPlayer.y=d.aia.y; }
  /* 战斗单位回档（野猪 / 特洛伊卫兵）：老档没有这两个字段就保持初始状态 */
  if (d.boar && typeof boar!=="undefined"){
    if (Number.isFinite(d.boar.hp)) boar.hp = d.boar.hp;
    if (typeof d.boar.alive === "boolean") boar.alive = d.boar.alive;
  }
  if (Array.isArray(d.guards) && typeof TROY_GUARDS!=="undefined"){
    d.guards.forEach((g,i)=>{
      if (!g || !TROY_GUARDS[i]) return;
      if (Number.isFinite(g.hp)) TROY_GUARDS[i].hp = g.hp;
      if (typeof g.alive === "boolean") TROY_GUARDS[i].alive = g.alive;
    });
  }
  scene = d.scene === "hades" ? "hades" : d.scene === "aeolia" ? "aeolia" : d.scene === "strait" ? "strait" : d.scene === "sun" ? "sun" : d.scene === "aia" ? "aia" : d.scene === "ogggia" ? "ogggia" : d.scene === "scheria" ? "scheria" : d.scene === "ithaca" ? "ithaca" : PROLOGUE_SITES[d.scene] ? d.scene : "world";
  ensureState();
  return true;
}
function hardReset(){
  askConfirm("设 置","重 新 开 始","清空存档，从新的航程开始——这一步不可撤销。","「海不会替你保管过去。」", 
    "清空存档，重新开始","不可撤销", "我再想想","保留现在的航程",
    ()=>{ localStorage.removeItem(SAVE_KEY); location.reload(); },
    ()=>{});
}

/* 迁移旧存档（埃阿亚岛单场景版） */
(function migrate(){
  try{
    if (!localStorage.getItem(SAVE_KEY) && localStorage.getItem("odyssey-witch-space-v1")){
      const d = JSON.parse(localStorage.getItem("odyssey-witch-space-v1"));
      if (d && d.state){ state = d.state; aiaPlayer.x=d.px; aiaPlayer.y=d.py; save(); }
    }
  }catch(e){}
})();

/* ==================== 埃阿亚岛实体与点位 ==================== */
const witch  = { x: 8*ATS+ATS/2, y: 3*ATS+ATS/2 };
const GRASS_NODES = [
  {cx:16,cy:1},{cx:17,cy:1},{cx:16,cy:2}
].map((n,i)=>({id:"g"+i, type:"grass", r:70, ...n,
  x:n.cx*ATS+ATS/2, y:n.cy*ATS+ATS/2, label:"采摘玛草"}));
/* 野猪：带血条 + 主动 AI 状态机（叙事来源：拱坏女巫玛草的那头）
   mode: idle游荡 → aggro锁定 → windup蓄力(可预判) → dash冲撞(可走位躲) → tired硬直喘气(玩家暴击窗口) */
const boar = { x: 14*ATS+20, y: 3*ATS+30, hp: 30, max: 30, alive: true, hitAt: 0, home:{x:14*ATS+20,y:3*ATS+30}, mode:"idle", dir:{x:0,y:0}, timer:0 };
const ASPOTS = [
  {type:"witch",  x:witch.x, y:witch.y, r:85, label:"与喀耳刻交谈"},
  ...GRASS_NODES,
  {type:"spring", x:16*ATS+ATS, y:6*ATS+ATS/2, r:70, label:"灌满水囊"},
  {type:"altar",  x:15*ATS+ATS/2, y:8*ATS+ATS/2, r:75, label:"查看石碑"},
  {type:"fire",   x:16*ATS+ATS/2, y:8*ATS+ATS/2+26, r:62, label:"篝火（烤肉）"},
  {type:"cauldron", x:12*ATS+ATS/2, y:3*ATS+ATS/2, r:70, label:"坩埚（炼药合成）"},
  {type:"hermes",  x:6*ATS+ATS/2,  y:7*ATS+ATS/2, r:75, label:"林间的金光（看个究竟）"},
  {type:"crewmen", x:11*ATS+ATS/2, y:6*ATS+ATS/2, r:78, label:"泥里打滚的影子"},
  {type:"dock",   x:3*ATS+ATS/2, y:10*ATS+ATS/2, r:70, label:"扬帆出海"},
];
const BOAR_MOOD = {idle:"游荡", aggro:"锁定你", windup:"蓄力中", dash:"冲撞", tired:"喘气(弱点)"};
function boarSpot(){
  if (!boar.alive) return null;
  return {type:"boar", x:boar.x, y:boar.y, r:55,
    label:`攻击野猪（血 ${boar.hp}/${boar.max} · ${BOAR_MOOD[boar.mode]||""}）`};
}

/* ==================================================================
 *  相机与反馈层 —— 依 camera-systems / game-feel skill：
 *  1) 岛屿内平滑跟随（lerp 帧率无关），世界地图保持全览；M 键切俯瞰
 *  2) 死区 + 速度前瞻：死区内相机不动防抖晕；前瞻幅度随速度缓入缓出防甩头
 *  3) 中心锚点语义统一：cam.x/y = 屏幕中心对应的世界坐标（与 loop 的
 *     translate(ccx,ccy) 一致），钳制让“画面”留在场景矩形内 —— 根治 void 黑区
 *  4) 屏震走 trauma 衰减模型（trauma² 平滑抖动），只动相机不动逻辑
 *  5) hit-stop 冻结逻辑帧（真实时间恢复），反馈按 small/medium/large 分档
 * ================================================================== */
const VIEW_W = 1000, VIEW_H = 600;
const cam = { x:0, y:0, zoom:1, tx:0, ty:0, tz:1, trauma:0, t:0, fx:0, fy:0, look:0 };
let panorama = false, timeScale = 1, hitStopUntil = 0;
function sceneSize(){ return scene==="world" ? {w:WCOLS*WTS, h:WROWS*WTS} : {w:ACOLS*ATS, h:AROWS*ATS+TH}; }
function camCenter(){ return scene==="world" ? [0,0] : [VIEW_W/2, VIEW_H/2]; }   /* 世界全览原位，岛屿中心跟随 */
/* 场景底色：岛屿只画 800×497 的岛体，画布其余部分必须由底色补齐（根治 void 黑区） */
function sceneBackdrop(){
  return scene==="aia" ? "#2f6f96" : scene==="hades" ? "#0c1622"
       : scene==="aeolia" ? "#c3d2e2" : scene==="strait" ? "#3c5165"
       : scene==="sun" ? (state.sunWrath ? "#5a6a72" : "#2c6d86")
       : scene==="ogggia" ? "#8a6a52" : scene==="scheria" ? "#2e7d98" : scene==="ithaca" ? "#41586b"
       : scene==="ismaros" ? "#3d4c5c" : scene==="lotus" ? "#7fa8a0" : scene==="cyclops" ? "#413a38" : scene==="telepylos" ? "#5c6470" : null;
}
function camTick(dt){
  const b = sceneSize();
  const follow = scene !== "world";
  cam.tz = follow && !panorama ? 1.7 : 1;
  if (follow && !panorama){
    const vw = VIEW_W/cam.tz, vh = VIEW_H/cam.tz;
    /* 死区（camera-systems）：焦点只在玩家出矩形时才被推着走 */
    const DZX = 42, DZY = 26;
    if (aiaPlayer.x > cam.fx + DZX) cam.fx = aiaPlayer.x - DZX;
    if (aiaPlayer.x < cam.fx - DZX) cam.fx = aiaPlayer.x + DZX;
    if (aiaPlayer.y > cam.fy + DZY) cam.fy = aiaPlayer.y - DZY;
    if (aiaPlayer.y < cam.fy - DZY) cam.fy = aiaPlayer.y + DZY;
    /* 前瞻：朝移动方向提前看，幅度随速度缓入缓出（防甩头） */
    const spd = Math.hypot(aiaPlayer.vx||0, aiaPlayer.vy||0);
    cam.look += (Math.min(spd*0.38, 64) - cam.look) * Math.min(1, dt*4);
    const lx = spd>1 ? (aiaPlayer.vx/spd)*cam.look : 0;
    const ly = spd>1 ? (aiaPlayer.vy/spd)*cam.look : 0;
    /* 中心锚点钳制：cam ∈ [vw/2, b-vw/2]；场景比视口小则整景居中 */
    const cxT = cam.fx + lx, cyT = cam.fy + ly - 20;
    cam.tx = b.w <= vw ? b.w/2 : Math.max(vw/2, Math.min(b.w - vw/2, cxT));
    cam.ty = b.h <= vh ? b.h/2 : Math.max(vh/2, Math.min(b.h - vh/2, cyT));
  } else {
    cam.tx = follow ? b.w/2 : 0;   /* 俯瞰：整景居中（与 camCenter 语义一致）；世界全览原位 */
    cam.ty = follow ? b.h/2 : 0;
  }
  /* 传送硬切（登陆/返航/晕倒/漩涡）：目标突变时直接吸附，禁跨整图甩镜头 */
  if (Math.hypot(cam.tx-cam.x, cam.ty-cam.y) > 500){
    cam.x = cam.tx; cam.y = cam.ty; cam.fx = follow ? aiaPlayer.x : 0; cam.fy = follow ? aiaPlayer.y : 0; cam.look = 0;
  }
  const k = 1 - Math.pow(0.002, dt);
  cam.x += (cam.tx-cam.x)*k; cam.y += (cam.ty-cam.y)*k;
  cam.zoom += (cam.tz-cam.zoom)*Math.min(1, dt*3);
  cam.trauma = Math.max(0, cam.trauma - 1.35*dt);
  cam.t += dt*30;
}
function camOffset(){
  const s = cam.trauma*cam.trauma;               /* 二次方：小震轻、大震狠 */
  return [12*s*Math.sin(cam.t*1.7), 8*s*Math.sin(cam.t*2.3), 0.09*s*Math.sin(cam.t*1.1)];
}
function addTrauma(a){ cam.trauma = Math.min(1, cam.trauma + a); }
function hitStop(ms){ hitStopUntil = performance.now() + ms; }
/* 反馈分层（game-feel：重要性分档，全游戏一致的 juice 预设） */
function feedback(tier){
  if (tier==="small") addTrauma(0.15);
  else if (tier==="medium"){ addTrauma(0.40); hitStop(55); }
  else { addTrauma(0.80); hitStop(110); }
}
/* 世界坐标 → 屏幕（百分比），DOM 提示/气泡定位共用 */
function w2s(wx, wy){
  const [ccx, ccy] = camCenter();
  const [sx, sy] = camOffset();
  return [ (ccx + (wx-cam.x)*cam.zoom + sx)/VIEW_W,
           (ccy + (wy-cam.y)*cam.zoom + sy)/VIEW_H ];
}
/* 伤害/获得数字弹出（floatTexts：上浮渐隐） */
const floatTexts = [];
/* 粒子爆发（game-feel：命中/击杀/拾取的多通道反馈之一，零依赖纯 canvas 合成） */
const parts = [];
function burst(x, y, col, n, sp, sz){
  for (let i=0;i<(n||8);i++){
    const a = Math.random()*Math.PI*2, v = (sp||70)*(0.5+Math.random()*0.9);
    parts.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 36, t:0,
      life:0.45+Math.random()*0.4, col:col||"#ffd23e", sz:(sz||2.5)*(0.6+Math.random()*0.8)});
  }
  if (parts.length > 220) parts.splice(0, parts.length-220);
}
function drawParts(){
  for (let i=parts.length-1;i>=0;i--){
    const p=parts[i]; p.t += 0.016;
    if (p.t >= p.life){ parts.splice(i,1); continue; }
    const a = 1 - p.t/p.life;
    p.x += p.vx*0.016; p.y += p.vy*0.016; p.vy += 150*0.016;   /* 重力下坠 */
    ctx.globalAlpha = a;
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function popText(wx, wy, text, color, big){
  floatTexts.push({x:wx, y:wy, text, color:color||"#fff", t:0, big:!!big});
  if (floatTexts.length > 24) floatTexts.shift();
}
function drawFloatTexts(){
  ctx.textAlign = "center";
  for (let i=floatTexts.length-1; i>=0; i--){
    const f = floatTexts[i]; f.t += 0.016;
    if (f.t > 1.1){ floatTexts.splice(i,1); continue; }
    const rise = f.t*26, a = f.t<0.12 ? f.t/0.12 : 1-Math.max(0,(f.t-0.5)/0.6);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = (f.big?"bold 20px":"bold 14px")+" 'Segoe UI','Microsoft YaHei'";
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillText(f.text, f.x+1, f.y-rise+1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y-rise);
  }
  ctx.globalAlpha = 1;
}

/* ==================== 昼夜（生存-crafting：时间驱动威胁；visual.md 光照色卡） ==================== */
const DAY_LEN = 480;                      /* 现实 8 分钟 = 游戏一昼夜 */
const CLOCK_NAMES = [[5,"黎明"],[8,"清晨"],[11,"上午"],[13,"正午"],[17,"午后"],[20,"黄昏"],[24,"夜晚"]];   /* P2 修复：与昼夜光照对齐——isDusk=17..20 →「黄昏」，isNight=20.. →「夜晚」（原表 13 点就进黄昏、冻结的金色黄昏显示「夜晚」） */
function clockTick(dt){
  windTick(dt);   /* 批次 I2：风向随游戏时间缓慢转向（与暂停门控一致——读对话时不转风） */
  const prev = state.clock;
  state.clock = (state.clock + dt/DAY_LEN*1440) % 1440;
  /* 传闻 v2：游戏日跨零点回卷瞬间，NPC 之间互相转述一次（多跳传播+失真分级在 rumors.js 纯规则层）。
     奥吉吉亚冻结不走钟（主循环跳过 clockTick）→ 冻结期传闻自然停跳，符合「日历冻结」设定 */
  if (state.clock < prev && typeof RUMOR !== "undefined" && RUMOR.gossipTick){
    RUMOR.gossipTick(state.rumors || [], NPC_SCENE, Date.now());
  }
}
function hourNow(){ return state.clock/60; }
function isNight(){ const h=hourNow(); return h>=20 || h<5; }
function isDusk(){ const h=hourNow(); return h>=17 && h<20; }
function nightAmount(){                       /* 0 白昼 → 1 深夜（平滑过渡） */
  const h = hourNow();
  if (h>=21 || h<4) return 1;
  if (h>=19 && h<21) return (h-19)/2;
  if (h>=4 && h<6) return 1-(h-4)/2;
  return 0;
}
function duskAmount(){
  const h = hourNow();
  if (h>=16 && h<19) return Math.sin((h-16)/3*Math.PI);
  return 0;
}
function clockName(){
  const h = hourNow();
  for (const [lim,name] of CLOCK_NAMES) if (h<lim) return name;
  return "深夜";
}
/* 昼夜光照层：夜间冷蓝暗幕 + 光源开洞（火堆/小屋窗/玩家），黄昏金色暖调。
   海图上夜色减淡、船灯开洞；冥界是亡者之国，没有太阳——不做昼夜（叙事一致）。 */
function drawDaylight(et){
  if (scene === "hades" || scene === "strait") return;
  /* 「太阳记恨」全局阴幕：宰牛后天色常阴（每章生效，冥界/海峡本就无日故豁免） */
  if (state.sunWrath){
    const wk = scene==="world" ? 0.10 : 0.16;
    const wx0 = cam.x-60, wy0 = cam.y-60, ww = VIEW_W/cam.zoom+120, wh = VIEW_H/cam.zoom+120;
    ctx.fillStyle = `rgba(52,50,66,${wk})`; ctx.fillRect(wx0,wy0,ww,wh);
  }
  const n = nightAmount(), du = duskAmount();
  if (n <= 0 && du <= 0) return;
  const b = sceneSize();
  const vx = cam.x-60, vy = cam.y-60, vw = VIEW_W/cam.zoom+120, vh = VIEW_H/cam.zoom+120;
  const k = scene==="world" ? 0.55 : 1;
  if (du > 0){ ctx.fillStyle = `rgba(232,168,74,${0.10*du*k})`; ctx.fillRect(vx,vy,vw,vh); }
  /* 锐评：月亮已迁入 3D 天空 shader（真月盘+月海+月光路，与水面共用 MOON_DIR）——
     2D 贴图月亮下线（用户报「全是贴图没有真的效果」）。 */
  if (n > 0){
    ctx.fillStyle = `rgba(10,16,44,${0.38*n*k})`; ctx.fillRect(vx,vy,vw,vh);
    if (scene==="world") drawStars(et,n);
    /* 光源开洞 */
    const lights = scene==="world"
      ? [[boat.x, boat.y, 60, "255,200,110", 0.55]]
      : scene==="aeolia"
      ? [
          [4*ATS+ATS/2, 3*ATS+ATS*0.75, 90, "255,235,190", 0.5],   /* 宫殿灯窗 */
          [9*ATS+ATS/2, 3*ATS+ATS/2, 70, "180,220,255", 0.35],     /* 风之祭坛 */
          [aiaPlayer.x, aiaPlayer.y, 70, "255,225,170", 0.28],
        ]
      : scene==="sun"
      ? [
          [sunAltar.x, sunAltar.y, 120, "255,214,120", 0.55],      /* 太阳祭坛金纹 */
          [3*ATS+ATS/2, 6*ATS+ATS/2, 80, "255,170,60", 0.45],      /* 圣火盆 */
          [aiaPlayer.x, aiaPlayer.y, 70, "255,225,170", 0.28],
        ]
      : [
          [16*ATS+ATS/2, 8*ATS+ATS*0.95, 95, "255,170,60", 0.55],
          [3.5*ATS+26,   3*ATS-20,       80, "255,200,110", 0.4],
          [8.9*ATS,      3.4*ATS,        55, "120,230,150", 0.3],
          [aiaPlayer.x,  aiaPlayer.y,    70, "255,225,170", 0.28],
        ];
    for (const [lx, ly, r, rgb, a] of lights){
      const g = ctx.createRadialGradient(lx, ly, 4, lx, ly, r);
      g.addColorStop(0, `rgba(${rgb},${a*n*k})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(lx-r, ly-r, r*2, r*2);
    }
  }
}

/* ==================== 生存需求（survival-crafting Pattern 1：衰减+分级后果，不秒杀） ====================
   Steam 化节奏调优（对标 KCD2 的生存平衡哲学：生存是气氛不是罚站）：
   - 基础衰减 0.20/0.27 → 0.13/0.17（满值约 13/10 分钟，原为 8/6 分钟）；
   - Lv1 新手保护期再减半且不掉血（引导期专注体验 AI NPC 与世界，不被生存压垮）；
   - 全屏界面（海图）打开时暂停衰减与时钟（主循环门控）。 */
const NEED_RATE = {hunger: 0.13, thirst: 0.17};   /* 每秒衰减：满值约 13/10 分钟 */
function survivalGraceOn(){ return state.survivalGrace!==false && state.level<2; }
let needHurtT = 0, lastNeedToast = 0;
/* 批次 H3：生存节奏三档（玩家可调，localStorage 持久化）——只乘在饿渴衰减上，不动剧情时钟 */
const PACE_MULT = { easy:0.6, std:1, hard:1.4 };
const PACE_LABEL = { easy:"悠闲", std:"标准", hard:"硬核" };
let paceMode = "std";
try{ const p=localStorage.getItem("odysseyPace"); if (p && PACE_MULT[p]) paceMode = p; }catch(e){}
function paceCycle(){
  const order = ["std","easy","hard"];
  paceMode = order[(order.indexOf(paceMode)+1) % order.length];
  try{ localStorage.setItem("odysseyPace", paceMode); }catch(e){}
  const el = document.getElementById("paceBtn"); if (el) el.textContent = `节奏·${PACE_LABEL[paceMode]}`;
  toast(`生存节奏：${PACE_LABEL[paceMode]}${paceMode==="easy"?"（饿渴减速，适合慢读剧情）":paceMode==="hard"?"（饿渴加速，老水手自选）":""}。`);
}
function tickNeeds(dt){
  const grace = survivalGraceOn();
  const k = (grace ? 0.5 : 1) * (PACE_MULT[paceMode]||1);
  state.hunger = Math.max(0, state.hunger - NEED_RATE.hunger*k*dt);
  state.thirst = Math.max(0, state.thirst - NEED_RATE.thirst*k*dt);
  const starving = state.hunger<=20, parched = state.thirst<=15;
  if ((starving || parched) && !grace){
    needHurtT += dt;
    if (needHurtT >= 4){
      needHurtT = 0;
      state.hp = Math.max(0, state.hp-1);
      state.status["伤势"] = state.hp>60?"轻伤":state.hp>30?"重伤":"奄奄一息";
      if (state.hp<=0){ faintPlayer("饥渴交加"); return; }
      renderHUD();
    }
    if (performance.now()-lastNeedToast > 20000){
      lastNeedToast = performance.now(); sfx("warn");
      toast(starving&&parched ? "又饿又渴……再这样下去要出人命。找点吃的，喝口水。"
        : starving ? "肚子在叫……找点吃的（面包、烤肉都行）。"
        : "喉咙冒烟……该喝水了（背包里的淡水，或去泉眼灌）。");
    }
  } else if (starving || parched){
    /* 保护期：只温和提醒，不扣血（20s 提醒间隔更长，不打断对话心流） */
    if (performance.now()-lastNeedToast > 25000){
      lastNeedToast = performance.now();
      toast(starving&&parched ? "又饿又渴——路还长，找点吃的、灌口水再走。"
        : starving ? "肚子空了——面包、烤肉都行，别硬撑。"
        : "喉咙发干——背包里的淡水，或岛上的泉眼。");
    }
  } else needHurtT = 0;
  /* 需求影响状态文案（供「查询自身状态」） */
  state.status["饥饿"] = state.hunger>70?"饱了":state.hunger>40?"不饿":state.hunger>20?"微饿":"饥肠辘辘";
  state.status["口渴"] = state.thirst>70?"精神":state.thirst>40?"正常":state.thirst>15?"发干":"干渴难忍";
}
function faintPlayer(reason){
  /* Steam 化修复：晕倒按场景分流——非埃阿亚岛不再“躺女巫草垛”穿帮、不再跨场景错位传送
     （原实现把 aiaPlayer 拉到 witch 坐标，在食莲岛/序章岛等场景里坐标无意义且文案穿帮）。
     恢复量也调觉：非女巫场景不扣钱（没人收你医药费），恢复到 60。 */
  state.hunger = Math.max(state.hunger, 55); state.thirst = Math.max(state.thirst, 55);
  state.status["伤势"] = "轻伤";
  if (scene==="aia"){
    /* 批次 H5：医药费随好感减免——熟人她不收钱（Witcher 式关系回报），不再是无差别罚款 */
    const fee = state.affinity>=60 ? 0 : 5;
    state.hp = 50; state.coins = Math.max(0, state.coins-fee);
    aiaPlayer.x = witch.x; aiaPlayer.y = witch.y + 60;
    addMemory(`旅人${reason}晕了过去，被她拖回屋外草垛`, 2);
    toast(fee
      ? `眼前一黑……醒来时你躺在女巫屋外的草垛上，她把药渣在你鼻子上抹了一把：医药费，五枚德拉克马。（血量恢复至 50，还剩 ${state.coins} 枚）`
      : `眼前一黑……醒来时你躺在女巫屋外的草垛上。她瞟了一眼你空空的钱袋又收了回去：「熟人的账，记下辈子。」（血量恢复至 50）`);
  } else if (scene==="world"){
    state.hp = 60;
    addMemory(`旅人${reason}晕了过去，被一阵浪拍醒`, 2);
    toast("眼前一黑……醒来时你趴在自己的船板上，满嘴海水味。海把你推回船里——这次不算死，算教训。（血量恢复至 60）");
  } else if (scene==="sun"){
    /* 太阳岛没有女巫——晕倒在自己的船边（场景感知恢复点，不跨岛传送） */
    state.hp = 60;
    aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
    addMemory(`旅人${reason}晕倒在太阳岛上，被浪拍醒在自己的船边`, 2);
    toast(`眼前一黑……醒来时你趴在自己的船底，满嘴海水味。命还在，医药钱省了——饿可没省。（血量恢复至 60）`);
  } else {
    /* 其他岛：原地醒来，不传送不改钱——修序章岛也躺“女巫草垛”的穿帮 */
    state.hp = 60;
    addMemory(`旅人${reason}晕了过去，又自己醒了过来`, 2);
    toast("眼前一黑……醒来时你还在原地，天色变了，人还活着。得吃点东西、找口水了。（血量恢复至 60）");
  }
  renderHUD(); save();
}

/* ==================== NPC 记忆流（PLAN.md 卖点：NPC 真的记得你）
   who 字段区分记忆归属：witch（女巫）/ seer（先知）/ any（共有） ==================== */
function addMemory(text, imp, who){
  state.memory.push({t: Date.now(), imp: imp||2, who: who||"witch", text});
  if (state.memory.length > 40) state.memory.shift();
}
/* 序幕锚点：新航程第一条记忆——刻字船板「记得回家」（英雄之旅·平凡世界地基） */
function seedPrologue(){
  addMemory("漂来的船板上刻着一行字：记得回家。你把它翻过来又翻回去——海把你送到哪，这句话就跟到哪。", 2, "any");
}
function recallMemories(k, who){
  const w = who || currentNPC || "witch";
  return state.memory.filter(m=>m.who===w || m.who==="any").slice(-14)
    .sort((a,b)=>(b.imp-a.imp)||(b.t-a.t)).slice(0, k||5)
    .sort((a,b)=>a.t-b.t).map(m=>m.text);
}

/* ==================== 传闻系统（活的社会 · v1）====================
   名声事件不留在当事人的记忆里，而作为公开传闻在 NPC 间流传；没见过你的 NPC
   也能从“海路”听说。纯规则在 src/rumors.js（可单测），这里只做 flag → 传闻的
   幂等派生与接线。对照 Generative Agents 记忆流反思 + AI Town 社交传播。 */
/* 兜底：src/rumors.js 万一未托管到，空实现让传闻静默退化，不拖垮整页 */
const R = (typeof RUMOR!=="undefined" && RUMOR) ? RUMOR : {
  addRumor(){}, forNpc(){return[];}, nextUnheard(){return null;},
  markHeard(){}, heardCount(){return 0;}, lineFor(){return "";},
};
const NPC_SCENE = {
  witch:"aia", seer:"hades", aeolus:"aeolia", siren:"strait", cattle:"sun",
  calypso:"ogggia", nausicaa:"scheria", rebuilder:"ismaros", lotusman:"lotus",
  polyphemus:"cyclops", epeius:"troy", telemachus:"ithaca",
};
/* 派生表：cond 复用既有剧情 flag；成立即入传闻账本（同 id 幂等去重）。
   who=当事人 NPC key：当事人本人记得，不算“听来的传闻”；"any"=人人可传。 */
const RUMOR_DERIVE = [
  { id:"troy_burn",    place:"troy",     who:"any",        imp:4, summary:"特洛伊在身后烧成一条火线——十年围城，一夜收账", cond:()=>!!state.troyBurned },
  { id:"troy_spared",  place:"troy",     who:"any",        imp:4, summary:"屠城之夜那人放下了火把——平民走门，只带走战争", cond:()=>!!state.troySpared },
  { id:"pol_name",     place:"cyclops",  who:"polyphemus", imp:5, summary:"有人把真名报给了独眼巨人——波塞冬在浪底下听见了", cond:()=>state.polNameGiven==="奥德修斯" },
  { id:"pol_blind",    place:"cyclops",  who:"polyphemus", imp:4, summary:"那人躲进羊腹下混出了巨人的洞——六只羊，六次空当", cond:()=>!!state.ramHide },
  { id:"poly_noone",   place:"cyclops",  who:"polyphemus", imp:3, summary:"独眼巨人洞里传出个假名：「无人」——喊真名的事还在后头", cond:()=>!!state.namesHeard },
  { id:"sun_wrath",    place:"sun",      who:"cattle",     imp:4, summary:"太阳岛的圣牛进了汤锅——饥饿赢了誓言，太阳记了仇", cond:()=>!!state.sunWrath },
  { id:"sun_blessed",  place:"sun",      who:"cattle",     imp:4, summary:"那人守住太阳岛的誓言，一头牛没动——得了一缕走得过黑暗的光", cond:()=>!!state.sunBlessed },
  { id:"crew_saved",   place:"sun",       who:"any",        imp:4, summary:"他按住了要宰牛的船员的手——人活着，只是恨了他很久", cond:()=>!!state.crewSaved },
  { id:"zeus_struck",   place:"sun",      who:"any",        imp:5, summary:"雷落下来那天他睡着了——草场多了一百个影子，全船只剩他一个", cond:()=>!!state.zeusStruck },
  { id:"wax_ears",     place:"strait",   who:"siren",      imp:3, summary:"过海峡时那人封了耳——塞壬的歌，他一段也没听进去", cond:()=>!!state.waxEars },
  { id:"mast_tied",    place:"strait",   who:"siren",      imp:4, summary:"他把自己绑上桅杆听完了整首歌——歌词残页还在怀里", cond:()=>!!state.mastTied },
  { id:"windbag_out",  place:"aeolia",   who:"aeolus",      imp:5, summary:"风袋用光了又回去借风——连神明都憎恨的人，风绕着他走", cond:()=>!!state.banishedFromAeolia },
  { id:"pigged",       place:"aia",       who:"witch",       imp:4, summary:"有人没拿魔草就喝了蜜酒——在猪圈里拱了好几天才想起自己是谁", cond:()=>!!state.pigged },
  { id:"moly_rescue",  place:"aia",       who:"witch",       imp:3, summary:"他握着黑根银花的草破了咒——猪栏里拱出来一队恢复人形的水手", cond:()=>!!state.circeSworn },
  { id:"calypso_stay", place:"ogggia",    who:"calypso",    imp:4, summary:"有人选了永生——奥吉吉亚的锁合上了，他不再提回家", cond:()=>state.calypsoChoice==="stay" },
  { id:"calypso_raft", place:"ogggia",    who:"calypso",    imp:4, summary:"他谢绝了永生，自己造筏出湾——海面上第一次有他划的尾迹", cond:()=>state.calypsoChoice==="raft" },
  { id:"scheria_reveal",place:"scheria", who:"nausicaa",   imp:5, summary:"篝火边他报出了名字：奥德修斯。全厅安静了一瞬", cond:()=>!!state.selfRevealed },
  { id:"home_stand",   place:"ithaca",    who:"any",        imp:5, summary:"大厅里十二道斧环一箭穿过——求婚者的刀还没拔出来", cond:()=>!!state.suitorsSwept },
  { id:"aid_ismaros",  place:"ismaros",   who:"rebuilder",  imp:3, summary:"洗劫之城的后人没遭他报复——他给伤者上了药", cond:()=>!!state.ismarosSpared },
  { id:"lotus_drag",    place:"lotus",    who:"lotusman",   imp:3, summary:"他把忘了家的食莲者绑上凳拖回了船", cond:()=>!!state.lotusDraggedOk },
  /* —— v2 补漏批（对照 state 旗标全量盘点：6 条公开名声事件此前没入传闻派生表）—— */
  { id:"stone_pillar",  place:"scheria",  who:"nausicaa",   imp:5, summary:"送他回家的船在回港路上变成了石头——海面立起一根白石柱，浪在柱脚碎成白沫", cond:()=>!!state.stonePillarDone },
  { id:"scylla_six",    place:"strait",   who:"any",        imp:4, summary:"六个人进了斯库拉的巢——海峡的账，从来是用活人结的", cond:()=>!!state.crewScylla },
  { id:"scylla_six_saved", place:"strait", who:"siren",     imp:5, summary:"六头轮探，他一头不落全抢了回来——比荷马多救回六个人", cond:()=>!!state.scSixSaved },
  { id:"raft_veil",     place:"ogggia",   who:"calypso",    imp:4, summary:"出湾三道浪墙把筏打散了——白手圣母的面纱兜住了他，浪把他交还给陌生的白滩", cond:()=>!!state.raftStormDone },
  { id:"raft_refuse",   place:"ogggia",   who:"calypso",    imp:3, summary:"那人在浪里两次推开神明的纱——海把他推回了我门前。我说过，海记你的账", cond:()=>!!state.raftStormFail },
  { id:"tel_reveal",    place:"ithaca",   who:"telemachus", imp:4, summary:"牧猪人的屋檐下，两个名字对上了——漂了十年的人报回了家门", cond:()=>!!state.telRevealed },
  { id:"name_pledge",   place:"sun",      who:"cattle",     imp:3, summary:"有人以名字作保从太阳岛牵走一头牛——最亮的信物押在圣殿檐下，债记在说出口的名字上", cond:()=>!!state.sunDebt },
];
function syncRumorsFromState(){
  if (!Array.isArray(state.rumors)) state.rumors=[];
  for (const d of RUMOR_DERIVE){
    let ok=false; try{ ok=!!d.cond(); }catch(e){}
    if (ok) R.addRumor(state.rumors, { id:d.id, place:d.place, who:d.who, imp:d.imp, summary:d.summary });
  }
}
/* 该 NPC 下一句可转述的传闻（未听过优先）；无则 null */
function rumorNextFor(npcKey){
  return R.nextUnheard(state.rumors, npcKey, NPC_SCENE[npcKey]);
}
function rumorHeardCount(npcKey){ return R.heardCount(state.rumors, npcKey); }

/* P1.4 记忆支付（story 设计：对亡者讲一段真的过去，他们能"活"一炷香；讲过的记忆碎片标记"已支付"，三章塞壬唱不出这段）：
   从记忆流里挑一条真实的记忆（imp>=3），讲给亡母——该记忆进入 state.paidMem（"已支付"），
   塞壬之歌 buildLyric 不再引用它。返回 true=支付了一笔 / false=没有可支付的记忆。 */
function payMemoryToDead(){
  if (!state.paidMem) state.paidMem=[];
  const cand = state.memory.filter(m=>m&&m.text && m.imp>=3 && !state.paidMem.includes(m.text));
  if (!cand.length){ return false; }
  /* 取最新一条（imp 最高优先，同则最新） */
  const pick = cand.slice().sort((a,b)=>(b.imp-a.imp)||(b.t-a.t))[0];
  state.paidMem.push(pick.text);
  sfx("bless"); feedback("small"); gainXp(12);
  addMemory("旅人把一段真的过去讲给了亡者——她终于能「活」一炷香。那段记忆就此定住，塞壬再也唱不出它了", 4, "any");
  toast("「……那一年，」你把一段真的过去讲给她听。雾里的影子静了很久——然后她抬手，像要给你拢一件衣裳，又放下了。（记忆已支付 · 历练 +12 · 塞壬之歌将缺这一页）");
  renderHUD(); save();
  return true;
}

/* ==================== 好感度（dialogue-systems：关系变量影响台词分支 + 里程碑解锁玩法） ==================== */
function affinityTier(){ return state.affinity<30?"冷淡":state.affinity<60?"熟络":state.affinity<85?"信任":"托付"; }
/* 好感里程碑 → 解锁专属奖励（rpg 关系玩法：刷好感有明确目标与回报，跨档公告+记忆） */
const AFF_UNLOCKS = [
  { at:60, name:"熟络",  reward:"解锁全货架「熟人价」九折 + 专属闲聊", item:"蜂蜜酒",  memo:"喀耳刻对旅人熟络了——货架上的价钱让了一成，话也多了" },
  { at:85, name:"托付",  reward:"解锁「回家的路」托付情报 + 八折全货架", item:"金露",   memo:"喀耳刻对旅人托付了——愿意把回家的路、连同她压箱底的药，都交给旅人" },
];
function addAffinity(n){
  const before = state.affinity;
  state.affinity = Math.max(0, Math.min(100, state.affinity + n));
  const now = state.affinity;
  if (now > before) for (const u of AFF_UNLOCKS){
    if (before < u.at && now >= u.at && !(state.affUnlocked||[]).includes(u.at)){
      state.affUnlocked = [...(state.affUnlocked||[]), u.at];
      sfx("bless"); feedback("medium");
      toast(`💛 她对你的态度升到「${u.name}」：${u.reward}！`);
      addMemory(u.memo, 4);
      renderHUD(); save();
    }
  }
}
/* 好感库存展示：专属解锁项并入货架列表（只在已解锁时显示） */
function affInventory(){
  const items=[];
  if (state.affinity>=60) items.push("蜂蜜酒");
  if (state.affinity>=85) items.push("金露");
  return items;
}
/* 好感进度：当前档 + 距下一里程碑还差多少（玩家刷好感的"目标感"） */
function affinityProgress(){
  const a=state.affinity;
  const next = AFF_UNLOCKS.find(u=>a<u.at && !(state.affUnlocked||[]).includes(u.at));
  const unlocked = (state.affUnlocked||[]).length;
  if (!next) return affinityTier()+" · 已解锁全部专属（"+unlocked+"/"+AFF_UNLOCKS.length+"）";
  return affinityTier()+" · 距「"+next.name+"」还差 "+Math.max(0,Math.ceil(next.at-a))+" 好感 · 已解锁 "+unlocked+"/"+AFF_UNLOCKS.length;
}

/* ==================== 命运双轨：原著锚点 + 成就系统（玩家=奥德修斯）
   纯正版：按原著走的锚点（canon）；改写版：偏离原著的选择也拿成就（dev）。
   锚点全部复用既有 flag，轮询解锁零侵入，绝不漏发。 ==================== */
const ACHIV = [
  /* —— 原著锚点（canon：荷马之线） —— */
  { id:"no_one",     name:"「无人」之名",  desc:"独眼巨人处自称「无人」——原版第9卷的骗术你原样用了一遍", cond:()=>/无人|no\s*one/i.test(state.polNameGiven||""), canon:true },
  { id:"siren_mast", name:"桅杆上的听众",  desc:"绑在桅杆上听完了塞壬的整首歌——原版第12卷", cond:()=>!!state.lyricFragment, canon:true },
  { id:"sun_keep",   name:"一头都没动",    desc:"太阳岛守住了誓言，圣牛一头未宰——原版第12卷", cond:()=>!!state.sunBlessed, canon:true },
  { id:"hades_long", name:"长路",          desc:"冥界你选了长路——困顿与归乡，原版第11卷", cond:()=>state.prophecy==="long", canon:true },
  { id:"circe_lamp", name:"留灯的人",      desc:"喀耳刻留你过冬，炉火一夜没熄——原版第10卷的留宿", cond:()=>!!state.circeLeft, canon:true },
  { id:"truth_ship", name:"不接谎的船",    desc:"斯克里岛篝火边，你把一路如实讲完了", cond:()=>state.talesTold.length>=5, canon:true },
  /* —— 改写线（dev：偏离原著的连锁反应，也值得被记住） —— */
  { id:"spare_enemy",name:"放下矛的人",    desc:"伊斯玛洛斯——你救了这座城的伤者。原版里，你洗劫了它", cond:()=>!!state.ismarosSpared, dev:"劫掠之城你选择了救治" },
  { id:"wax_ears",   name:"听不见的代价",  desc:"你用蜡封住了耳朵——塞壬的歌与你无关了。原版你绑在桅杆上听完", cond:()=>!!state.waxEars, dev:"你放弃了塞壬的歌" },
  { id:"sun_wrath",  name:"闷雷记仇",      desc:"圣牛的血染了草场——太阳记恨了。原版的雷劈船队你逃过了，但天变了", cond:()=>!!state.sunWrath, dev:"太阳记恨在心" },
  { id:"short_path", name:"捷径的灰",      desc:"冥界你选了捷径——荣耀与速亡。原版你选了长路", cond:()=>state.prophecy==="short", dev:"你把长路换成了捷径" },
  /* —— 特洛伊战役（17h）—— */
  { id:"trojan_mind", name:"木马之父",     desc:"特洛伊——空心木马藏勇士，夜袭破城，烧尽十年围城之仇。荷马第 8 卷唱的就是这一夜", cond:()=>state.troyStage>=5 && state.troyBurned, canon:true },
  { id:"troy_mercy", name:"放下火把的人",  desc:"屠城之夜你收了火——平民走门，你只带走战争。荷马没写仁慈这一页", cond:()=>state.troyStage>=5 && state.troySpared, dev:"你在屠城之夜放了人" },
  /* —— 船队折损（F2 守船战：原著十一艘只剩一艘）—— */
  { id:"eleven_lost", name:"十一艘的债",    desc:"忒勒皮洛斯——崖顶巨石砸碎了大半船队，你只带回了最后一艘。荷马写的就是这一夜", cond:()=>state.fleetGuard==="done" && (state.fleet||0)<=2, canon:true },
  { id:"fleet_keeper", name:"守住船队的人",  desc:"巨石的雨里你把大半船队拖下了水——荷马没敢写这一页", cond:()=>state.fleetGuard==="done" && (state.fleet||0)>=8, dev:"你救下了大半船队" },
  /* —— P1.2 埃阿亚岛三件套（17g 原著第 10 卷）—— */
  { id:"moly_rescue", name:"魔草破咒",      desc:"握着黑根银花的魔草，喝下了她的蜜酒——咒语在你身上失效。原版第10卷：赫尔墨斯的馈赠与你的拔剑", cond:()=>state.circeSworn, canon:true },
  { id:"pigged", name:"岛上的猪都有你的眼睛", desc:"没拿魔草就喝了那杯酒——你在泥里拱了好几天才想起来自己是谁。原版里，这没发生在奥德修斯身上", cond:()=>state.pigged, dev:"你把原著没写的失手演了一遍" },
  /* —— P1.3 太阳岛结构倒置（17g 原著第12卷：船员鼓噪）—— */
  { id:"zeus_survived", name:"最后一人", desc:"你睡着时他们宰了牛，宙斯的雷把船和人一起收走了——九天后，浪把你一个人推上了奥吉吉亚。荷马写的就是这一个", cond:()=>state.zeusStruck, canon:true },
  { id:"crew_saved", name:"拦住船员的人", desc:"他们饿得眼睛发绿，你按住了刀——他们活着，但恨了你很久。荷马写的是你睡着", cond:()=>state.crewSaved, dev:"原著里你没能拦住他们" },
  /* —— P1.6 波塞冬掀筏（17g 原著第 5 卷：毁筏·面纱·三天）—— */
  { id:"raft_survived", name:"毁筏的人游了三天", desc:"波塞冬掀翻了你自己造的筏——白手圣母的面纱兜住你，三天两夜后，浪把你交还给海岸。荷马第 5 卷写的就是这一段", cond:()=>state.raftVeilTaken, canon:true },
  { id:"lost_to_poseidon", name:"海记了你的账", desc:"你把面纱推回去过一次——浪收走了筏，海把你推回奥吉吉亚。卡吕普索说：我说过，海记你的账", cond:()=>state.raftStormFail, dev:"原著里你最终收下了面纱" },
  /* —— F5 斯库拉六头快反战（17h F5 · 原著第12卷：六头各叼走一名船员）—— */
  { id:"six_saved", name:"从六张嘴里抢回的人", desc:"声之海峡——六头轮探，你一头不落全抢了回来。荷马第 12 卷写的是六人全失；你比荷马多救回六个人", cond:()=>!!state.scSixSaved, dev:"原著六人全失，你把他们都救了回来" },
  /* —— P1.7 伊萨卡相认三问（17g 原著第 19/23 卷：佩涅洛佩的审判）—— */
  { id:"scar_proved", name:"脚疤与婚床", desc:"相认之前她先考你两问——脚疤的来历、婚床的根，一处都没答错。她不是等待者，是考官；第 19/23 卷写的就是这场考试", cond:()=>!!state.examScar&&!!state.examBed, canon:true },
  /* —— P1.4 冥界亡母（17g 原著第 11 卷：三次抱空）—— */
  { id:"mother_embrace", name:"三次抱空", desc:"冥界的雾里你想抱住母亲三次——第三次，她先开了口，叫了一个十年没变的名字。荷马第 11 卷写的就是这三下", cond:()=>!!state.oldName, canon:true },
  /* —— P1.5 斯克里自白（17g 原著第 8 卷：听自己的歌落泪）—— */
  { id:"tears_for_song", name:"听自己的歌落泪", desc:"德摩多科斯唱到木马，你在异国的火光里哭了——然后你当众说出了自己的名字。荷马第 8 卷：全书的转轴，系在这一哭上", cond:()=>!!state.selfRevealed, canon:true },
  /* —— P1.8 风神逐客（17g 原著第 10 卷：最冷的一句话）—— */
  { id:"banished", name:"被风神驱逐", desc:"风袋用光后你回到风神岛——埃俄罗斯说：连神明都憎恨的人，离开我的岛。荷马第 10 卷这句原话，落在了你头上", cond:()=>!!state.banishedFromAeolia, dev:"原著里他只是收回风袋——这回他把门关上了" },
  /* —— P2.2 食莲岛强拖回船（17g 原著第 9 卷：绑上凳带回）—— */
  { id:"lotus_drag", name:"强拖回船的人", desc:"食莲滩上你没有听任甜——用幸存者的绳结把他绑上凳，带回船上。他一路望着海，一句话也没说。荷马第 9 卷写的就是这一下", cond:()=>!!state.lotusDraggedOk, canon:true },
  /* —— P1.9 忒勒玛科斯（17g 原著第 16 卷：父子相认）—— */
  { id:"father_son", name:"父子相认", desc:"他问你有没有见过奥德修斯——你说：我就是。看我手上的疤，看我眼下的纹。荷马第 16 卷写这一幕用了整整两卷", cond:()=>!!state.telRevealed, canon:true },
/* —— F6 大厅肃清战（17h · 原著第 22 卷：杀 108 求婚者）—— */
  { id:"hall_swept", name:"扫净大厅的人", desc:"弓弦的余音里他们拔了刀——一百零八支矛，你一一放平。荷马第 22 卷：这一场仗没有第二名", cond:()=>!!state.suitorsSwept, canon:true },
  /* —— F3 伊斯玛洛斯守营战（17h · 原著第9卷：船员贪酒庆功，城民夜反扑折损人手）—— */
  { id:"camp_held", name:"酒后仍醒着的人", desc:"伊斯玛洛斯——城民提着火把来抢酒，你一口气挡下了三波。原版里，他们喝醉睡沉了，被反扑折了人手", cond:()=>!!state.campHeld, dev:"原版那一夜你们睡沉了，你醒着" },
  /* —— F4 独眼巨人羊腹潜行（17h · 原著第9卷：绑羊腹下、巨人逐只摸羊查人）—— */
  { id:"under_the_ram", name:"羊腹之下", desc:"你把自己绑进羊腹下，躲过六次摸索混出洞——盲眼巨人一只都没摸出来。荷马第 9 卷写的就是这一出", cond:()=>!!state.ramHide, canon:true },
];
/* 旅途信物图鉴：只读既有剧情与背包状态；消耗、交付或遗失后仍保留曾经亲历的记录。 */
const CODEX_RELICS = [
  {id:"moly", name:"魔草", desc:"黑根银花。赫尔墨斯把它放进你掌心，咒语因此没能替你改写形状。", cond:()=>!!(state.hermesMet||state.circeSworn||state.backpack["魔草"])},
  {id:"ciconian_wine", name:"喀科恩酒", desc:"伊斯玛洛斯的烈酒。它记得守营的火，也记得有人放下矛以后伸出的手。", cond:()=>!!(state.tookWine||state.backpack["喀科恩酒"])},
  {id:"ram_fleece", name:"羊毛披风", desc:"从巨人的羊栏剪下的暖意。羊腹下的六次呼吸，都藏在这层羊毛里。", cond:()=>!!(state.sheared||state.backpack["羊毛披风"])},
  {id:"windbag", name:"风袋", desc:"埃俄罗斯把十二风装进皮囊。每一次放风，都是一次对归途的催促。", cond:()=>!!(state.backpack["风袋"]||state.windbagEmptied||(state.windFreed||[]).some(Boolean))},
  {id:"survivor_knot", name:"幸存者的绳结", desc:"忒勒皮洛斯的崖下留下的结。它能把一个人绑回船，也提醒你谁没能回来。", cond:()=>!!(state.ropeTaken||state.backpack["幸存者的绳结"])},
  {id:"lyric_fragment", name:"歌词残页", desc:"塞壬唱过的那一页。你绑在桅杆上听完，才把海上的甜带回了人间。", cond:()=>!!(state.lyricFragment||state.backpack["歌词残页"])},
  {id:"dark_light", name:"走得过黑暗的光", desc:"守住圣牛与誓言后，太阳留下的微光。它不替你走路，只照见下一步。", cond:()=>!!(state.sunBlessed||state.backpack["走得过黑暗的光"])},
  {id:"nameless_song", name:"无名旅人之歌", desc:"斯克里篝火边，你如实讲过的路被编成歌。名字尚未说出，听的人已经认出了你。", cond:()=>!!(state.scheriaFarewell||(state.talesTold||[]).length>=5)},
];
function achivTick(){
  for (const a of ACHIV){
    if ((state.achiv||[]).includes(a.id)) continue;
    let ok=false; try{ ok=a.cond(); }catch(e){}
    if (ok){
      state.achiv=[...(state.achiv||[]), a.id];
      sfx("bless"); feedback("medium");
      toast(`🏆 成就达成 ·「${a.name}」——${a.desc}`);
      addMemory(`奥德修斯的命运锚点：${a.name}——${a.canon?"他走的和荷马写的一样":"他改写了荷马没写的路"}`, 3);
      renderHUD(); save();
    }
  }
}
/* 终章命运总结：荷马之线 / 改写命运（ACHIV 合流 · 17g 第 8 步）
   命运锚点按「站」计：同一站的多枚 canon 成就（太阳岛的守誓/睡着）互斥也互认——
   任一枚即点亮该站（原著两件事本就同时发生：他守了自己的誓，船员破了他们的）。 */
const CANON_GROUPS = [
  {n:"木马之夜",       ids:["trojan_mind"]},
  {n:"十一艘的债",     ids:["eleven_lost"]},
  {n:"食莲岛的绳结",   ids:["lotus_drag"]},
  {n:"「无人」之名",   ids:["no_one"]},
  {n:"魔草破咒",       ids:["moly_rescue"]},
  {n:"留灯的人",       ids:["circe_lamp"]},
  {n:"长路",           ids:["hades_long"]},
  {n:"三次抱空",       ids:["mother_embrace"]},
  {n:"桅杆上的听众",   ids:["siren_mast"]},
  {n:"太阳岛的誓言",   ids:["sun_keep","zeus_survived"]},
  {n:"毁筏游三天",     ids:["raft_survived"]},
  {n:"听自己的歌落泪", ids:["tears_for_song"]},
  {n:"不接谎的船",     ids:["truth_ship"]},
  {n:"脚疤与婚床",     ids:["scar_proved"]},
  {n:"父子相认",       ids:["father_son"]},
  {n:"大厅肃清",       ids:["hall_swept"]},
  {n:"羊腹之下",       ids:["under_the_ram"]},
];
function fateSummary(){
  const got=state.achiv||[];
  const canonGot=ACHIV.filter(a=>a.canon&&got.includes(a.id));
  const devGot=ACHIV.filter(a=>a.dev&&got.includes(a.id));
  const anchors=CANON_GROUPS.map(g=>({n:g.n, ok:g.ids.some(id=>got.includes(id))}));
  return { canonGot, devGot, anchors,
           anchorGot: anchors.filter(a=>a.ok).length, anchorTotal: anchors.length,
           allCanon: anchors.every(a=>a.ok) };
}

/* ===== RUN_ARCHIVE · 航程档案 =====
   本机多周目成绩榜：TapTap 排行榜的本地替代，不接账号、不上传。
   独立存储键——清空主档不抹掉历史；只记录已经走到结局的航程。 */
const RUN_KEY = "odyssey-runs-v1", RUN_MAX = 12;
const RUN_ENDING = { home:"归乡", stay:"留在奥吉吉亚", guest:"斯克里做客", sea:"把海当归宿" };
function runArchive(){
  try{
    const list = JSON.parse(localStorage.getItem(RUN_KEY)||"[]");
    return Array.isArray(list) ? list.filter(r=>r && typeof r.at==="number") : [];
  }catch(e){ return []; }
}
function runBest(list){
  list = Array.isArray(list) ? list : runArchive();
  if (!list.length) return null;
  const top = (k)=>list.reduce((m,r)=>Math.max(m, Number(r[k])||0), 0);
  return { runs:list.length, canon:top("canon"), dev:top("dev"), crew:top("crew"), level:top("level") };
}
function recordRun(ending){
  if (state.runLogged) return false;   /* 同一段航程只归档一次 */
  state.runLogged = true;
  const fate = fateSummary();
  const list = runArchive();
  list.unshift({
    at: Date.now(),
    name: state.chosenName || state.sunName || state.calypsoName || "无名旅人",
    ending: RUN_ENDING[ending] || "航程归档",
    canon: fate.canonGot.length,
    dev: fate.devGot.length,
    crew: state.crewLit ? (state.crew||0) : 0,
    crewLit: !!state.crewLit,
    fleet: state.fleet||0,
    legs: legsVisitedCount(),
    level: state.level||1,
    achiv: (state.achiv||[]).length,
  });
  try{ localStorage.setItem(RUN_KEY, JSON.stringify(list.slice(0, RUN_MAX))); }catch(e){}
  save();
  return true;
}
/* ===== /RUN_ARCHIVE ===== */

/* ==================== NPC 主动性（game-ai/utility：本地打分，零模型调用）
   玩家靠近且未对话时，NPC 按 时间/好感/任务/记忆 门控主动开口——权重优先 + 每句 90s 冷却防复读。
   与 witchUtilityTick（行为层）互补：那里管"做什么"，这里管"说什么"。 ==================== */
const AMBIENT = {
  witch: [
    /* 玩家状态关怀层（dialogue-systems 关系变量驱动：NPC 感知你的饥饿/伤势/穷困/夜间，主动搭话） */
    {id:"care_hunger",  w:1.1, cond:()=>state.hunger<=30,
                   line:()=>`你脸色不对——${state.hunger<=15?"饿得站不直了":"胃里空空的"}。灶边有吃的，去取。`},
    {id:"care_thirst",  w:1.1, cond:()=>state.thirst<=22,
                   line:()=>`嘴唇都起皮了。后院井水甘甜——${state.thirst<=12?"别撑到天黑":"先去解渴"}。`},
    {id:"care_hurt",    w:1.0, cond:()=>state.hp<=30&&state.hp>0,
                   line:()=>"（她皱眉看你）伤成这样还乱跑？药草在架子上——自己拿，别客气。"},
    {id:"care_broke",   w:0.6, cond:()=>state.coins<=2&&state.affinity>=50, give:{coins:1},
                   line:()=>"（她往你手心塞了一枚银币）……先花着。饿着肚子上路，不算旅人。"},
    {id:"care_night",   w:0.5, cond:()=>isNight()&&state.hp>40&&state.hunger>40&&state.thirst>40,
                   line:()=>"（她扒拉着炉火）夜里野猪最凶。要躺就在屋里躺。"},
    {id:"ready",  w:1.0, cond:()=>{const q=getQuest("witch_grass"); return !!(q&&!q.done&&q.have>=q.need);},
                  line:()=>"（她朝你伸手）玛草齐了？拿来。"},
    {id:"quest",  w:0.9, cond:()=>{const q=getQuest("witch_grass"); return !!(q&&!q.done&&q.have<q.need);},
                  line:()=>`草还差 ${getQuest("witch_grass").need-getQuest("witch_grass").have} 株——别在林子里晃到天黑。`},
    {id:"dusk",   w:0.7, cond:()=>isDusk()||isNight(),
                  line:()=>"天要沉了。灶上还热着——别在野地里过夜。"},
    {id:"warm",   w:0.5, cond:()=>state.affinity>=60&&!state.circeMessage,
                  line:()=>"（她搅着药，忽然）……海峡那边，替我留意一个人。"},
    {id:"gift",   w:0.6, cond:()=>state.affinity>=85&&!state.backpack["蜂蜜"], give:{item:"蜂蜜"},
                  line:()=>"灶台边有蜜，拿去——别说是我给的。"},
    {id:"sunlit", w:0.8, cond:()=>state.sunlit, line:()=>"晨光不错。今天的药比哪天都香。"},
    {id:"care_crew", w:0.8, cond:()=>state.crewLit&&(state.crew||0)>0&&(state.crew||0)<12,
                   line:()=>`（她朝你身后看了一眼）你的人比风声里的少。${(state.crew||0)<=6?"……坐吧，火边暖和。":"让他们在林子边歇歇——埃阿亚不吃人。"}`},
    {id:"moly_seen", w:0.7, cond:()=>!state.circeSworn&&!!state.backpack["魔草"],
                   line:()=>"（她瞥了一眼你的行囊，搅药的手没停）……金杖那小子多嘴。草你留着——想喝的时候，酒还温着。"},
    {id:"mead_hold", w:0.8, cond:()=>state.meadHeld&&!state.circeSworn,
                   line:()=>"酒还温着。什么时候想通，什么时候来。"},
    {id:"sworn_after", w:0.8, cond:()=>state.circeSworn,
                   line:()=>"（她朝猪栏那边抬了抬下巴）他们身上还有猪的影子——洗过澡就好了，慢慢来。"},
    {id:"sun_warn", w:0.7, cond:()=>state.crewLit&&(state.crew||0)>0&&!state.sunWrath&&!state.sunBlessed&&!!state.prophecy,
                   line:()=>"（她头也不抬）太阳岛——牛是神的。跟他们讲清楚，饿了先钓鱼。"},
    {id:"idle",   w:0.15, cond:()=>true, line:()=>"来了就进来，别杄在风口。"},
  ],
seer: [
    {id:"care_hurt",  w:1.0, cond:()=>state.hp<=30&&state.hp>0,
                   line:()=>"（他浑浊的眼转向你）你身上有血味。亡者的桥，不带伤走。"},
    {id:"care_weak",  w:0.6, cond:()=>state.hunger<=25||state.thirst<=20,
                   line:()=>"（他的杖在地上画了个圈）饿着、渴着的人，听得见两种声音。先喂饱自己。"},
    {id:"offer",  w:1.0, cond:()=>!state.offered,
                   line:()=>"蜂蜜酒、面包、淡水——沟里的黑暗等着它的祭品。"},
    {id:"ask",    w:1.0, cond:()=>!!state.offered&&!state.prophecy,
                  line:()=>"（杖尖转向你）祭血入沟了。问吧——问你要走的路。"},
    {id:"long",   w:0.6, cond:()=>state.prophecy==="long",
                  line:()=>"……长路上的人，脚步声都是稳的。"},
    {id:"short",   w:0.6, cond:()=>state.prophecy==="short",
                  line:()=>"……选了捷径的人，影子先一步到了浪头。"},
    {id:"care_crew", w:0.7, cond:()=>state.crewLit&&(state.crew||0)>0&&(state.crew||0)<12,
                  line:()=>`（他的杖尖朝你的船偏了偏）你的船比来时轻。海收账，不挑名字——${(state.crew||0)<=6?"守住誓言，才留得住剩下的。":"往前每一站，都是一杆秤。"}`},
    /* P1.4 亡母引路（原著第11卷）：献祭之后，先知听见了雾深处那个一直望岸的妇人 */
    {id:"mother_hint", w:0.8, cond:()=>!!state.offered&&!state.oldName,
                  line:()=>"（他忽然侧耳，杖尖转向雾深处）雾里有个妇人，一直望着岸边。她等的背影，眉眼和你很像——想开口的事，别留到下一站。"},
    /* P1.4 记忆支付（故事设计）：亡者收下一段记忆后，先知提一句「付掉的再也唱不出来」 */
    {id:"mem_paid", w:0.6, cond:()=>(state.paidMem||[]).length>=1,
     line:()=>`（他朝雾里抬了抬杖）你付给她们的那段，她们"活"过一炷香。${(state.paidMem||[]).length>=2?"记得的，都锁在雾里了。":"往后哪一页少了个字，别回头找。"}`},
  ],
aeolus: [
    {id:"care_hurt",  w:0.9, cond:()=>state.hp<=35&&state.hp>0,
                   line:()=>"（风掀起你衣角的血渍）伤口的盐，风最懂。找处净水洗洗。"},
    {id:"care_cold",  w:0.5, cond:()=>isNight(),
                   line:()=>"（他把手掌摊开，一股暖风）夜里风凉，我借你一阵——别拿它赶路。"},
    {id:"invite", w:1.0, cond:()=>!getQuest("aeolia_winds"),
                   line:()=>"（风把他的话送到你耳边）四座石牢，四阵贪玩的风——想借顺风？"},
    {id:"prog",   w:0.9, cond:()=>{const q=getQuest("aeolia_winds"); return !!(q&&!q.done&&q.have<q.need);},
                  line:()=>`还锁着 ${4-getQuest("aeolia_winds").have} 阵风呢——岛的四角。`},
    {id:"ready",  w:1.0, cond:()=>{const q=getQuest("aeolia_winds"); return !!(q&&!q.done&&q.have>=q.need);},
                  line:()=>"四风都归位了！回来领你的袋子。"},
    {id:"done",   w:0.5, cond:()=>{const q=getQuest("aeolia_winds"); return !!(q&&q.done);},
                  line:()=>"一次放一阵——贪念会把它们一次放光。"},
    /* P1.8 二次求助被逐（原著第10卷最冷的一句话）：用光风袋后再上岛，风都绕着你走 */
    {id:"banished", w:1.2, cond:()=>!!state.banishedFromAeolia,
                  line:()=>"（袍子纹丝不动，风从你身边拐了个弯）走吧。连神明都憎恨的人——海会自己处置你。"},
  ],
  siren: [
    {id:"care_hurt",  w:0.9, cond:()=>state.hp<=35&&state.hp>0&&state.straitStage<2,
                   line:()=>"（歌声顿了顿）你带着伤过海……这里的雾，会往伤口里钻。"},
    {id:"choose", w:1.0, cond:()=>state.straitStage===0,
                  line:()=>"（歌声漫过船舷）蜡罐，或桅杆——小水手，选一样。"},
    {id:"crew_hear", w:0.7, cond:()=>state.crewLit&&(state.crew||0)>0&&state.straitStage<2,
                  line:()=>`（歌声绕着桅杆数心跳）…${state.crew}颗——不止你一个。歌，要唱给谁听呢？`},
    {id:"listened", w:0.8, cond:()=>state.mastTied&&state.straitStage<2,
                  line:()=>"（三姐妹轻声地）你听完了整首歌……那页歌词，收好。"},
    {id:"silent", w:0.8, cond:()=>state.waxEars&&state.straitStage<2,
                  line:()=>"（歌声变得遥远）听不见的，才最想唱给你。"},
    {id:"passed", w:0.5, cond:()=>state.straitStage>=2,
                  line:()=>"（雾里，三声叹息）去吧……可你会想起这段旋律。"},
  ],
  calypso: [
    {id:"care_tired", w:0.8, cond:()=>state.hunger<=28||state.thirst<=22,
                   line:()=>"（她放下织梭）你一路没好好吃过。果子挂在枝头，自己摘——这岛上不施舍，只分享。"},
    {id:"care_hurt",  w:0.6, cond:()=>state.hp<=35&&state.hp>0&&state.calypsoStage<3,
                   line:()=>"（她指尖掠过你肩头的伤）……疼吗？岛上没有药，但有安静。先坐一会儿。"},
    {id:"welcome", w:1.0, cond:()=>state.ogygiaDay===0,
                   line:()=>"（织机声不停）果子熟了——离手就熟。这岛上的日子，够你慢慢来。"},
    {id:"loom",   w:0.8, cond:()=>state.ogygiaDay>=1&&state.calypsoStage<3,
                  line:()=>"（她拆掉白日织开的布）白天织，夜里拆。你问为什么？——岛上总得有点事做。"},
    {id:"ask",    w:1.0, cond:()=>state.ogygiaDay>=2&&state.calypsoStage<3,
                  line:()=>"（她停下织梭，第一次正面看你）……有些话，再不说，你就真的住下了。"},
    {id:"raft",   w:0.9, cond:()=>state.calypsoChoice==="raft"&&state.raft.wood<3,
                  line:()=>"木料要三根。斧头在你手里——你一路学的东西，用得上了。"},
    {id:"stay",   w:0.7, cond:()=>state.calypsoChoice==="stay",
                  line:()=>"（她把门开着）夜里的海声，就当是摇篮曲。想走的时候，筏台没拆。"},
    {id:"same_day", w:0.6, cond:()=>state.calypsoChoice==="stay",
                  line:()=>`（她织着永远拆不完的布）今天和昨天没什么两样——岛上第 ${state.ogygiaDay||1} 个好天气。`},
    {id:"alone",  w:0.9, cond:()=>state.crewLit&&(state.crew||0)===0,
                  line:()=>"（她看了看你身后的空滩）只有你一个人上岸。……海把其他人都留在浪里了？"},
    {id:"debt",  w:1.0, cond:()=>state.raftStormFail&&!state.raftStormDone,
                 line:()=>"（她头也不抬，梭子没停）我说过——海记你的账。木料在筏台边等着，时辰没变，海也不会变。"},
    {id:"veil_told", w:0.6, cond:()=>state.raftStormDone&&state.raftVeilTaken,
                 line:()=>"（她看了一眼你的手腕）白手圣母的面纱。……她从她的海里捞过很多人——捞你的那一下，最用力。"},
  ],
  /* P2.9 四个哑巴 NPC（补）：先知/风神/重建者/食莲人此前既无锚点也无台词——
     走到他们身边永远只有沉默，玩家不知道该开口说什么（AMBIENT 表缺这四人）。 */
  seer: [
    {id:"offer",   w:1.0, cond:()=>!state.prophecy,
     line:()=>"（杖尖在门槛上点了三下）河还在涨。摆上你的东西——面包、淡水、蜜酒——我再告诉你两条路里，哪条活得下来。"},
    {id:"after",   w:0.8, cond:()=>!!state.prophecy,
     line:()=>"（他没有回头）路我已经给你了。走哪一条，都别回头看这条河。"},
  ],
  aeolus: [
    {id:"winds",   w:1.0, cond:()=>!(state.windFreed||[]).every(Boolean),
     line:()=>"（风在袍子里打了个旋）四个风仆还在石牢里。放它们出来，袋口才归你——风不白给。"},
    {id:"given",   w:0.9, cond:()=>!!state.aeoliaDone,
     line:()=>"（风绕过你的肩，像在数袋里还剩几阵）一次放一阵。贪心的人，第二趟是空手来的。"},
  ],
  rebuilder: [
    {id:"camp",    w:1.0, cond:()=>!state.campHeld,
     line:()=>"（重建者把一根梁扛上肩）营火还得有人守。夜里火把围上来的时候，你站哪儿？"},
    {id:"after",   w:0.8, cond:()=>!!state.campHeld,
     line:()=>"（他把最后一块梁码好）那一夜你守住了。城里的墙记不住人，火堆记得。"},
  ],
  lotusman: [
    {id:"sweet",   w:1.0, cond:()=>true,
     line:()=>"（他嚼着莲子，目光落在你身上）甜的。你要坐一会儿吗？坐久了，就不太想走了。"},
    {id:"after",   w:0.7, cond:()=>!!state.lotusAte,
     line:()=>"（他笑了笑，笑容像水面）你尝过了呀。那就坐吧——这儿的甜，不催人。"},
  ],
  nausicaa: [
    {id:"care_hungry", w:0.9, cond:()=>state.hunger<=30, give:{item:"面包"},
                   line:()=>"（她递来一块烙饼）宫里有的是。饿着肚子讲故事，故事会短一截。"},
    {id:"washed", w:1.0, cond:()=>state.scheriaStage===0,
line:()=>"你醒的时候，海把你的船推上了我们的滩——别怕，费埃克斯人不问来历。"},
    {id:"alone",  w:0.9, cond:()=>state.crewLit&&(state.crew||0)===0,
                  line:()=>"（她轻声问身边的侍女）他真的是一个人漂来的？……整条船，一个人都没有剩下吗？"},
    {id:"tale",   w:0.9, cond:()=>state.scheriaStage<2,
                  line:()=>"篝火在等你的故事。德摩多科斯的琴，也等着。"},
    {id:"song",   w:0.6, cond:()=>state.scheriaStage>=2,
                  line:()=>"德摩多科斯今晚唱新歌——唱如实讲的那些段。吹牛的，他自动跳过。"},
    /* P1.5 自白之后（原著第8卷）：她当众见证了你认名 */
    {id:"revealed", w:1.0, cond:()=>state.selfRevealed,
                  line:()=>"（她轻声，像收起一件东西）「奥德修斯。」……歌会重唱一遍——这一次，每个字都是你的。"},
    {id:"bye",    w:0.8, cond:()=>state.scheriaStage>=3,
                  line:()=>"（她朝码头挥手，很久才放下）船备好了。……别回头念这座岛的名字。"},
  ],
  epeius: [
    /* 特洛伊 #0（17h）：造马师的情境台词，cond 全部门控在 troyStage 上（game-ai 情境优先级） */
    {id:"plan",  w:1.0, cond:()=>state.troyStage===0,
                 line:()=>"（他敲着图纸，头也不抬）十年了。箭射不进的城——除非有人给我一张能让歌记住的图样。"},
    {id:"wood",  w:0.9, cond:()=>state.troyStage===1,
                 line:()=>`木料 ${state.troyWood||0}/5。平原上的松树都认得你的斧子——备齐了来开工。`},
    {id:"build", w:0.9, cond:()=>state.troyStage===2,
                 line:()=>"（他拍着马腹，声音发闪）肚子里空着。夜里，你和勇士们从这儿进去。"},
    {id:"night", w:1.0, cond:()=>state.troyStage===3,
                 line:()=>"（他压低声音）城门开了。每个火把底下都站着人——别恋战，天亮前解决。"},
    {id:"burn",  w:0.8, cond:()=>state.troyStage>=4&&!state.troyDone,
                 line:()=>"（他把火把递过来，眼睛看着别处）城是你的了。烧，还是不烧——你说了算。"},
    {id:"sail",  w:0.6, cond:()=>!!state.troyDone,
                 line:()=>"（他望向锚地）十二艘船整帆了。回家的风，比打仗的风硬。"},
  ],
  /* P1.3 圣牛群 AMBIENT（dialogue-systems：对船员的感知——不恐吓不劝宰，只陈述；红线不动） */
  cattle: [
    {id:"crew_noise", w:1.0, cond:()=>state.crewLit&&(state.crew||0)>0&&!state.sunWrath&&!state.sunBlessed,
     line:()=>`（金褐的眸子转向你身后那群影子）他们看我们的眼神，和狼看羊是一样的。头儿——${(state.crew||0)<=6?"你在海峡拦不住浪，这个拦得住。":"管住你的船员。"}`},
    {id:"after_storm", w:1.0, cond:()=>!!state.zeusStruck,
     line:()=>"（牛群远远站成半圆，谁也不低头）雷落下来那天，你睡着了。这片草场多了一百个影子——他们还是你的船员，只是不再说话。"},
  ],
  /* P2.8 波塞冬怒值（17g）：盲眼巨人感知父亲的账——wrath>0 才开口 */
  polyphemus: [
    {id:"father_wrath", w:1.0, cond:()=>(state.poseidonWrath||0)>=1,
     line:()=>`（他朝浪的方向偏了偏头）我爹的账翻到第 ${state.poseidonWrath||0} 笔了。他的账，向来用浪结。`},
  ],
  /* P2.6 佩涅洛佩织布拆布（17g 原著第 2 卷）：求婚者的怨语——零模型零成本 */
  suitors: [
    {id:"weaving", w:0.8, cond:()=>true,
     line:()=>"（掷骰声里有人哳哳）王后那架寿布，织了三年还没织完——白天织，夜里拆。谁家的新郎等得起这个？"},
  ],
  /* P1.9 忒勒玛科斯（17g 原著第 16 卷）：寻父十年归来的儿子——他的 AMBIENT 随相认进度换台词 */
  telemachus: [
    {id:"seeking", w:1.0, cond:()=>state.ithacaStage>=1&&!state.telRevealed,
     line:()=>"（他望着西边的海）有没有见过一个高个子的男人？眼下有疤，说话像船帆——我是他儿子。"},
    {id:"met_silent", w:1.2, cond:()=>state.telMet&&!state.telRevealed&&!state.finaleDone,
     line:()=>"（他忽然回头看你一眼）那个乞丐说话的样子，像一个人。……可所有人都说，他死了。"},
    {id:"revealed", w:1.2, cond:()=>state.telRevealed&&!state.suitorsSwept,
     line:()=>"「父亲。」就这一个词——他练了二十年。「去见母亲。大厅里剩下的，我们一起算。」"},
    {id:"after", w:1.0, cond:()=>state.suitorsSwept&&!state.finaleDone,
     line:()=>"（他按着矛守在大厅口）母亲还在楼上织那架寿布——织了二十年，也拆了二十年。去告诉她，不用再拆了。"},
    {id:"sail", w:0.7, cond:()=>state.finaleDone,
     line:()=>"（他扶着新船的槇杆）判词写完了，父亲。下一程海很长——替我在每片海里都留下名字。"},
  ],
};
