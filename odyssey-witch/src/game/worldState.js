/* ============================================================
   批次 K3 · B2 —— 海域世界状态层
   ------------------------------------------------------------
   「史诗感来自别人的史诗。」

   这一层把「海遇」从随机弹窗改成**世界状态**：
   每一片海（世界状态层里的「海域」）在任意时刻都正在发生某件事——
   围城 / 疫 / 封锁 / 难民东渡 / 商路兴衰 / 平静。
   玩家路过，看到的是**这一片海的后果**（空掉的码头、被劫的商队、
   难民船队、城头的旗），而不是「你捞到了 5 个金币」。

   参照《80 Days》的「地区 + 时代」事件分层：
   事件不是奖励，是**某地区持续存在的状态**；状态按世界时刻推进，
   玩家只在路过时撞见它的后果。

   数据真源：
     · 世界时刻 state.wtime（秒，单调）——在 quests.js 的 clockTick() 里累加，
       奥吉吉亚冻结不走钟 → 世界也跟着停（「完美的一天」里海是静的）。
     · 海域划分 WORLD_REGIONS（按最近中心分配，见 regionOf）。
     · 每个海域有自己的状态循环 WORLD_REGIONS[i].cycle。
   ============================================================ */

/* ---------- 海域：名字、坐标、当地的名物、状态循环 ---------- */
const WORLD_REGIONS = [
  { id:"tyrrhenian", name:"第勒尼安海", site:"罗马的粮仓船队", gx:8,  gy:9,
    cycle:["trade","calm","plague","blockade"], phase:0 },
  { id:"ionian",     name:"爱奥尼亚海", site:"科西拉岛上的流亡者", gx:18, gy:12,
    cycle:["migration","calm","siege","trade"], phase:37 },
  { id:"med",        name:"地中海",   site:"马耳他的中转港", gx:25, gy:14,
    cycle:["trade","calm","migration","blockade"], phase:74 },
  { id:"aegean",     name:"爱琴海",   site:"雅典的谷仓与税吏", gx:28, gy:8,
    cycle:["blockade","migration","calm","trade"], phase:111 },
  { id:"levant",     name:"黎凡特海", site:"伊奥索斯的城门与商栈", gx:40, gy:11,
    cycle:["siege","plague","calm","migration"], phase:148 },
];

/* ---------- 海域状态：色、标签、后果卡 ---------- */
const WORLD_STATES = {
  calm: {
    id:"calm", label:"平静", tone:"#8fd0c8", short:"海面无事",
  },
  siege: {
    id:"siege", label:"围城", tone:"#e0705a", short:"城门外插着对方的旗",
    title:"围 城",
    sub:(r)=>`${r.site}的城门外插着对面的旗——攻城的人已经围了七天，运粮的小船不敢进港。`,
    quote:"「城里说粮还够七天；城外的老师说，撑不了三天。」",
    choices:[
      { label:"靠岸打听", hint:"可能挨一发流矢", run:(r)=>{
          state.hp = Math.max(1, state.hp - 4); gainXp(8);
          addMemory(`在${r.name}的围城外听见了攻城鼓——那声音比风更难忽略`, 2, "world");
          return `你把船拴在礁后踮脚望了一眼城头。箭落下来的时候，舵手替你挨了一记。（血 -4 · 历练 +8）`;
        } },
      { label:"远远看着", hint:"不惹事", run:(r)=>{
          gainXp(3);
          addMemory(`你从${r.name}的围城外面驶过，没有靠岸——有些人只看一眼就够了`, 1, "world");
          return `你把帆收小，从战场外围慢慢蹭过去。鼓声追了半里就没了。（历练 +3）`;
        } },
    ],
  },
  plague: {
    id:"plague", label:"疫", tone:"#9ad06a", short:"港门闭着，不让船靠岸",
    title:"疫",
    sub:(r)=>`${r.site}在封港——不是围城的封，是不让任何船靠岸的那种封。`,
    quote:"「我们不烧船了，我们烧货物。」",
    choices:[
      { label:"戴布巾上岸换补给", hint:"花一点钱", run:(r)=>{
          if ((state.coins||0) < 10) return "你翻遍钱袋也凑不出 10 枚——港上的看守只朝你摇头。";
          state.coins -= 10; addItem("治疗草药"); gainXp(6);
          addMemory(`${r.name}的港因为疫封了，你在布巾后换到了一小包草药`, 2, "world");
          return `布巾隔着味道，隔不住钱。10 枚换一小包草药和一句「别去南边」。（金币 -10 · 治疗草药 +1 · 历练 +6）`;
        } },
      { label:"不靠岸", hint:"绕开最省事", run:(r)=>{
          state.thirst = Math.max(0, state.thirst - 6); gainXp(2);
          addMemory(`${r.name}的港烧掉了自己的货物——你绕开了那股味道`, 1, "world");
          return `你把船头转向外海。远远能看见港里在烧东西，烟是直的。（口渴 -6 · 历练 +2）`;
        } },
    ],
  },
  blockade: {
    id:"blockade", label:"封锁", tone:"#c8a24a", short:"拦船的缆拉在航道上",
    title:"封 锁",
    sub:(r)=>`${r.site}外海拉起了拦船的缆——税吏要查每一件货，绕不过去。`,
    quote:"「过路费。交钱就过。」",
    choices:[
      { label:"交过路费", hint:"花钱买路", run:(r)=>{
          if ((state.coins||0) < 12) return "钱袋不够。缆那边的人笑着摇头：没有钱，只有别的。";
          state.coins -= 12; gainXp(4);
          addMemory(`你在${r.name}交了过路费，缆被解开，船被放行`, 1, "world");
          return "12 枚换一句「过去吧」。缆解开的时候，缆绳上还挂着上一条船的布条。（金币 -12 · 历练 +4）";
        } },
      { label:"绕开封锁线", hint:"费时间", run:(r)=>{
          state.thirst = Math.max(0, state.thirst - 8); gainXp(5);
          addMemory(`你绕过${r.name}的封锁线，多走了半夜`, 2, "world");
          return "你贴着礁脊绕了半圈，多费了两个钟头的水和油。（口渴 -8 · 历练 +5）";
        } },
    ],
  },
  migration: {
    id:"migration", label:"难民东渡", tone:"#a08ad0", short:"小船队往北漂",
    title:"难民 东 渡",
    sub:(r)=>`${r.site}的小船队正在往北漂——船上的人比货多。`,
    quote:"「我们不是来打仗的。我们只是没地方去。」",
    choices:[
      { label:"分一份淡水给他们", hint:"自己少一点", run:(r)=>{
          state.thirst = Math.max(0, state.thirst - 8); gainXp(8);
          addMemory(`你把自己的淡水分了一半给${r.name}往北漂的船队`, 3, "world");
          return "你把两囊水分出去半囊。他们没有道谢，只是把船头转正了一点。（口渴 -8 · 历练 +8）";
        } },
      { label:"装作没看见", hint:"海不会谢你", run:(r)=>{
          gainXp(2);
          addMemory(`你从${r.name}难民船队旁边驶过，没有回头——你记得自己没回头`, 2, "world");
          return "你没有减速。身后的桨声一直跟到听不见为止。（历练 +2）";
        } },
    ],
  },
  trade: {
    id:"trade", label:"商路兴衰", tone:"#6ab0e0", short:"这条线现在正旺",
    title:"商 路 兴 衰",
    sub:(r)=>`${r.site}的商船进进出出——风向对了，水手就敢往外海走。`,
    quote:"「这条线现在旺。等它不旺了，你再走。」",
    choices:[
      { label:"跟他们的船走一段", hint:"抄近路", run:(r)=>{
          gainXp(6); addItem("面包");
          addMemory(`你跟着${r.name}的商船走了一段——他们知道哪条水道省两刻钟`, 2, "world");
          return "跟在他们屁股后面走，浪都被他们试过了。顺手换来一块面包。（面包 +1 · 历练 +6）";
        } },
      { label:"把这条航路记进海图", hint:"以后还用得上", run:(r)=>{
          gainXp(8);
          if (typeof recordSeaEcho==="function") recordSeaEcho({id:"route_"+r.id, name:r.name+"的商路"});
          addMemory(`你把${r.name}这条新商路记进了海图`, 2, "world");
          return "你在羊皮纸上画了一道新的线。以后这片海对你不再是空白。（历练 +8 · 海图上多了一条航路）";
        } },
    ],
  },
};

/* ---------- 世界时刻与状态推导 ---------- */
const REGION_PERIOD = 150;    /* 秒：海域状态每 2.5 分钟换一次（≈一次跨海航程） */
const REGION_CARD_GAP = 240;  /* 秒：两次「海域后果卡」之间的最短间隔（4 分钟） */

function worldTime(){ return (state && typeof state.wtime==="number") ? state.wtime : 0; }

/* 船位落在哪个海域：按最近中心分配（确定性、无歧义、边界即中垂线）。
   海域中心与 2D 海域名标签（constants.js 的 SEAS）同坐标——海图上读到的名字，
   就是状态层里正在发生事的那片海。 */
function regionOf(px, py){
  if (typeof WTS!=="number") return null;
  const gx = px / WTS, gy = py / WTS;
  let best = null, bd = Infinity;
  for (const r of WORLD_REGIONS){
    const d = Math.hypot(gx - r.gx, gy - r.gy);
    if (d < bd){ bd = d; best = r; }
  }
  return best;
}
function regionById(id){
  for (const r of WORLD_REGIONS) if (r.id===id) return r;
  return null;
}
/* 当前状态：被玩家行为强行改写时（劫掠商队 → 该海域封锁）优先，否则按状态循环推进 */
function regionStatus(r){
  if (!r) return WORLD_STATES.calm;
  const force = state && state.regionForce;
  if (force && force.id===r.id && worldTime() < (force.until||0)){
    return WORLD_STATES[force.st] || WORLD_STATES.calm;
  }
  const k = Math.floor((worldTime() + (r.phase||0)) / REGION_PERIOD) % r.cycle.length;
  return WORLD_STATES[r.cycle[((k % r.cycle.length) + r.cycle.length) % r.cycle.length]] || WORLD_STATES.calm;
}
/* 一次算全海域状态（海图叠加层用） */
function regionStatusList(){
  return WORLD_REGIONS.map(r=>({ region:r, status:regionStatus(r) }));
}
/* 强制某片海进入某状态一段时间（船队被劫 → 商路封锁） */
function forceRegionStatus(id, st, seconds){
  if (!state) return;
  state.regionForce = { id, st, until: worldTime() + (seconds||240) };
}

/* ---------- 海域后果卡 ---------- */
function triggerRegionCard(r, st){
  if (!st || !st.choices) return;
  const card = st;
  const kicker = `${r.name} · ${st.label}`;
  showAsk(kicker, card.title, card.sub(r), card.quote,
    card.choices.map(c=>({
      label:c.label, hint:c.hint,
      fn:()=>{
        const out = c.run(r);
        if (typeof out==="string") toast(out);
        if (typeof renderHUD==="function") renderHUD();
        if (typeof save==="function") save();
      },
    })),
    "region_"+r.id+"_"+st.id);
}

/* ---------- 推进闸门：别让世界事件打断玩家 ----------
   四道闸门，缺一不可：
   ① 开局闸：情境引导还没走完、且玩家也没怎么开船（航行不足 1200px）→ 不发卡。
      （引导一完成就立刻放行；玩家自己跳过引导、只顾往前开船，也照样放行。）
   ② 传送闸：船位一帧内跳超过 250px（读档迁移 / 快航 / 调试落点）→ 不发卡，
      并把「已航行距离」清零（传送不算航行）。
   ③ 靠岸闸：已经在某座岛的登陆圈里 → 不发卡，且**不记为已见**——
      靠岸优先；等玩家驶离那片登陆圈，卡片再补上。
   ④ 冷却闸：两次海域卡之间至少 240 秒（4 分钟）——别把玩家按在卡片里。
   累计的是**真正划过的水**（逐帧位移累加），不是与起点的直线距离——
   绕着岛走一圈也该算航行。 */
const WORLD_JUMP_PX = 250;
const WORLD_GRACE_PX = 1200;
let _wLastBoat = null, _wTravel = 0, _wJump = 0;

function worldMotionTick(){
  const bx = boat.x, by = boat.y;
  _wJump = _wLastBoat ? Math.hypot(bx-_wLastBoat.x, by-_wLastBoat.y) : 0;
  _wLastBoat = { x:bx, y:by };
  if (_wJump > WORLD_JUMP_PX){ _wTravel = 0; return; }   /* 传送：航行距离归零 */
  _wTravel += _wJump;
}
function worldTravelDist(){ return _wTravel; }
function worldIsJump(){ return _wJump > WORLD_JUMP_PX; }
/* 闸门总开关：浏览器主回归里关掉（它要密集传送船位测剧情），
   专用的世界层回归里打开。 */
function worldCardsEnabled(){
  try{ return localStorage.getItem("odyssey-world-cards-v1")!=="off"; }catch(e){ return true; }
}
/* 开局闸：引导走完就放行；没走完但已经自己开了很久船，也放行 */
function worldOpeningDone(){
  const ob = state && state.onboarding;
  if (!ob || ob.done) return true;
  return worldTravelDist() >= WORLD_GRACE_PX;
}

/* ---------- 每帧推进：海域状态 → 后果卡；状态翻转 → 轻提示 ---------- */
let _regionLastId = null, _regionLastKey = null;
function worldStateTick(){
  if (typeof scene!=="undefined" && scene!=="world") return;
  if ((state.openingBeat??3)<3) return;
  if (typeof dlgOpen!=="undefined" && (dlgOpen||titleOn||chapterOn||mapOpen||askOn)) return;
  if (!worldCardsEnabled()) return;
  const r = regionOf(boat.x, boat.y);
  if (!r) return;
  const st = regionStatus(r);
  const key = r.id+":"+st.id;
  const entered = (_regionLastId!==r.id);
  const flipped = (!!_regionLastKey && _regionLastKey!==key);
  _regionLastId = r.id;
  _regionLastKey = key;

  if (st.id==="calm") return;                       /* 这片海眼下没事，不必打扰 */
  if (!state.regionSeen) state.regionSeen={};
  if (state.regionSeen[key]){
    /* 这个状态撞见过了：若脚下这片海刚翻转，只给一句轻提示，不重复弹卡 */
    if (flipped && !entered) toast(`${r.name} · 转为${st.label}——${st.short||""}`);
    return;
  }
  if (worldIsJump()) return;                        /* 传送进来的不算「路过」 */
  if (!worldOpeningDone()) return;                  /* 开局：先让玩家开船 */
  if (typeof islandNear==="function" && islandNear()) return;   /* 正在靠岸：靠岸优先 */
  const last = state.regionCardAt;
  if (last>=0 && worldTime() - last < REGION_CARD_GAP) return;   /* 别把玩家按在卡片里 */
  state.regionSeen[key] = 1;
  state.regionCardAt = worldTime();
  triggerRegionCard(r, st);
}

/* ---------- HUD：当前海域与状态 ---------- */
function worldStateBadge(){
  if (typeof scene!=="undefined" && scene!=="world") return null;
  const r = regionOf(boat.x, boat.y);
  if (!r) return null;
  const st = regionStatus(r);
  return { id:r.id, region:r, status:st, text:`${r.name} · ${st.label}`, tone:st.tone };
}
