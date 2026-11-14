// ============================================================
// 奥德赛 · 数据模块 —— state
// ============================================================

/* ==================== 状态 ==================== */
const SHOP = {"治疗草药":15,"玛草":8,"蜂蜜酒":12,"蜂蜜":6,"面包":5,"橄榄油":10,"铁剑":25,"金露":30};
/* 剧情信物：不可赠予、不可丢弃（防误送误扔，也堵死刷好感漏洞） */
const PROTECTED_ITEMS = new Set(["魔草","歌词残页","幸存者的绳结","风袋","走得过黑暗的光","玛草","喀科恩酒"]);
function isProtectedItem(it){ return !!it && PROTECTED_ITEMS.has(it); }
/* 武器攻击力修正层（rpg：装备走 modifier，基础属性才是真值） */
const WEAPONS = {"铜矛":{atk:4},"铁剑":{atk:7}};
let state = {
  coins: 30,
  hp: 100,
  backpack: {"淡水":2,"面包":1,"铜矛":1},
  equipped: null,
  quest: null,
  boarKilled: false,
  status: {"饥饿":"微饿","口渴":"正常","伤势":"无","士气":"尚可"},
  /* —— 三线补全新增：生存 / 成长 / 关系 / 时间 / 记忆 —— */
  hunger: 80, thirst: 80,        /* 生存需求 0..100（survival-crafting：衰减+分级后果） */
  xp: 0, level: 1,               /* 成长（rpg：xp 曲线 + 升级增益） */
  affinity: 10,                  /* 喀耳刻好感 0..100（dialogue-systems 关系变量） */
  clock: 9*60,                   /* 游戏内分钟（9:00 起航） */
  memory: [],                    /* NPC 记忆流 [{t,imp,who,text}]（Generative Agents） */
  quests: {},                    /* 多任务账本 {id:{id,name,have,need,done,who}} */
  windFreed: [false,false,false,false],  /* 风神岛四风牢笼释放状态 */
  /* —— 特洛伊战役 + 船队（17h：玩家=奥德修斯，原著 12 艘船）—— */
  fleet: 0,               /* 船队艘数 0..12（特洛伊出海点亮 12；逐站折损） */
  /* —— P1.1 船员账本（17g 原著对齐）：旗舰班底 12 人，与船队双账并行（沉船不折算班底——保 P1.3 鼓噪/P2.4 猪变回人前提）—— */
  crew: 0,                /* 船员 0..12（特洛伊出海点亮；独眼 -6 / 斯库拉 -6 / 太阳岛清零） */
  crewLit: false,         /* 账本已点亮（出海时结算此前已触发的挂点债务） */
  crewList: null,          /* 存活船员名册（CREW_ROSTER 子集；折损从末尾除名） */
  crewLost: [],            /* 具名折损册 [{name,why,clock}]；与 crewList 互补，跨存档保留 */
  crewCyclops: false,     /* 挂点①独眼巨人 -6 已触发 */
  crewScylla: false,      /* 挂点②斯库拉 -6 已触发 */
  crewSun: false,         /* 挂点③太阳岛清零已触发 */
  troyStage: 0,           /* 0登陆 1献策 2马成 3夜袭中 4卫兵肃清 5屠城抉择毕 */
  troyWood: 0,            /* 造马木料 0..5 */
  troyBurned: false,      /* 屠城（原著） */
  troySpared: false,      /* 放下火把（改写） */
  troyDone: false,        /* 特洛伊战役完成（出海） */
  /* —— 第三章·声之海峡（strait）—— */
  straitStage: 0,        /* 0未选听歌方式 1已选 2已过斯库拉 3已出峡 */
  waxEars: false,        /* 蜡封耳：放弃记忆（歌词缺页） */
  mastTied: false,       /* 绑桅听歌：直面（得歌词残页，士气-1） */
  circeMessage: false,   /* 喀耳刻托付：给斯库拉带三个字（不怪你） */
  scyllaDebtPaid: false, /* 话带到了：海峡让出静水 */
  straitCleared: false,  /* 出峡完成 */
  sunlit: false,         /* 回埃阿亚岛债清天亮（暗线②收束） */
  lyricFragment: false,  /* 歌词残页（终章锚点） */
  /* —— 第四章·太阳岛（sun）—— */
  sunWrath: false,       /* 宰牛 → 太阳记恨（此后每章天色阴沉、光照调暗） */
  sunBlessed: false,     /* 守住 → 得「走得过黑暗的光」 */
  sunName: null,         /* 报给太阳神的名字（终章「认名」锚点之一） */
  sunDebt: null,         /* 借牛记录 {pledge}（以名字作保，判词留白） */
  slaughterWarn: false,  /* 宰牛二段确认（E 两次，防误触） */
  /* —— P1.3 太阳岛结构倒置（17g 原著第12卷）：船员鼓噪抉择 —— */
  crewNoiseDone: false,  /* 鼓噪事件已触发过（一次性；拦住/睡着都算结） */
  crewSaved: false,      /* 拦住船员的手（改写·dev：原著你睡着了）——船员免死但恨你 */
  zeusStruck: false,     /* 睡着放任 → 宙斯雷劈（原著·canon：全船覆灭只剩你，漂九天到奥吉吉亚） */
  memGreeted: [],        /* 已用作开场问候的记忆 t 列表（memoryGreeting 去重） */
  circeLeft: false,      /* 喀耳刻好感托付线：她留你过冬（原著留宿一年·生忒勒戈斯的前奏） */
  /* —— P1.2 埃阿亚岛三件套（17g 原著对齐第10卷）：魔草-蜜酒-立誓 —— */
  hermesMet: false,      /* 赫尔墨斯赠魔草已触发（埃阿亚岛林间金杖少年，一次性） */
  meadHeld: false,       /* 蜜酒事件曾挂起（拒饮——「酒还温着」，回头可再触） */
  circeSworn: false,     /* 拔剑对峙后她立誓（原著破局点；P2.4 水手恢复人形的前提） */
  pigged: false,         /* 无魔草饮蜜酒 → 猪化 BadEnd 已发生（dev 成就） */
  crewmenSeen: false,    /* 见过恢复人形的水手（P2.4 一次性） */
  achiv: [],             /* 命运双轨成就 id 列表（原著锚点 canon + 改写 dev） */
  onboarding: {step:0, done:false},  /* 新档情境引导：移动 → 靠岸 → 任务/海图 */
  openingBeat: 0,                    /* 开场微节拍 0划桨 1看海 2船歌 3完（先动手，再决定听不听故事） */
  /* —— 第五章·奥吉吉亚（ogggia）—— */
  calypsoStage: 0,       /* 0 初见 1 第一天 2 第二天 3 问正题 4 已选择 */
  calypsoChoice: null,   /* "stay" 滞留 / "raft" 造筏 */
  calypsoName: null,     /* 出湾时她最后问「你是谁」你的回答（终章认名碎片） */
  ogygiaDay: 0,          /* 冻结的日历：岛上过了几个「完美的一天」 */
  raft: {wood:0, wind:false, food:0},  /* 造筏：木料×3 / 听风 / 储粮×2 */
  ogygiaLeft: false,     /* 出湾（海面第一次出现你自己划的尾迹=锚点） */
  /* —— 第六章·斯克里岛（scheria）—— */
  talesTold: [],         /* 如实讲的章节 id（无名旅人之歌素材） */
  scheriaStage: 0,       /* 0 未讲故事 1 讲述中 2 讲完待告白 3 告白已发生 */
  nausicaaAsk: false,    /* 瑙西亚娅的告白（留下来做客人） */
  guest: false,          /* 客卿变体结局 flag */
  scheriaFarewell: false,/* 送行完成 → 伊萨卡解锁 */
  /* —— 终章·伊萨卡（ithaca）—— */
  ithacaStage: 0,        /* 0 登岛 1 已化名 2 骗过求婚者 3 弦响十二次 4 相认之问 */
  disguise: false,       /* 乞丐斗篷 */
  homeAnswer: null,      /* 「不接谎的船」问你「家在哪」时你说出的答案 */
  farewellHint: false,   /* 太阳岛后回埃阿亚岛：喀耳刻指路（一次性） */
  /* —— 终章判词（从第四章后迁移到此）—— */
  finaleDone: false,     /* 终章判词已看过（showEnding） */
  chosenName: null,      /* 认名结果 */
  nameWay: null,         /* 认名方式：old/sun/calypso/input/none */
  /* —— 序章组·奥德修斯的航迹（#1/#2/#3/#4/#6 旧路重访）—— */
  legs: {},                /* 航序点亮 {sceneKey|malea|seen_x:1}（海图「奥德修斯航迹」计数） */
  trail: [],               /* 海图航迹回看：真实到访顺序 [{k,leg,t}] */
  seaRoute: "open",        /* 航路姿态 coast 沿岸 / open 外海 / mist 迷雾 */
  seaEchoes: [],           /* 海面事件回声 [{id,name,x,y,t}]（海图上的可回看标记） */
  maleaDone: false,        /* 马里阿角：听风试炼完成 */
  ismarosSpared: false,    /* 伊斯玛洛斯：给伤者上过药 */
  tookWine: false,         /* 拾了喀科恩酒 */
  targetHits: 0,           /* 木靶练手次数 */
  lotusAte: false,         /* 尝过莲子（有段记忆跟着甜味变淡） */
  lotusGift: false,        /* 劝过幸存者（得莲子干） */
  lotusDragged: false,     /* 强拖过幸存者（得断桨） */
  sheared: false,          /* 剪过羊毛（羊毛披风） */
  polHeard: false,         /* 听完「无人」故事全本（洞内独眼微光随之熄灭） */
  campHeld: false,         /* F3 伊斯玛洛斯守营战：三波火把守满（dev 成就 camp_held） */
  ramHide: false,         /* F4 独眼巨人羊腹潜行：躲满六只混出洞（canon 成就） */
  paidMem: [],             /* P1.4 记忆支付：已「付给亡者」的记忆 text 列表（塞壬不再唱） */
  polNameGiven: null,      /* 自报名字（名字考试） */
  namesHeard: false,       /* 「被留下的名」解锁（“无人”——终章认名候选预埋） */
   ropeTaken: false,        /* 忒勒皮洛斯：幸存者的绳结 */
  /* —— 必经短章：六段旧路改为主线必经，离岛前必须结算一次抉择 —— */
  ismarosDone: false,      /* 伊斯玛洛斯：战利品与伤者已抉择 */
  lotusDone: false,        /* 食莲岛：一颗莲子已抉择 */
  cyclopDone: false,       /* 独眼巨人：名字已抉择 */
  telepylosDone: false,    /* 忒勒皮洛斯：最后一条船已抉择 */
  aeoliaDone: false,       /* 风神岛：袋口已抉择（离岛） */
  songsSung: [],           /* 德摩多科斯替你唱过的段 id（未到访的回顾兜底） */
   lotusDraggedOk: false,   /* P2.2：持绳强拖成功（canon：绑上凳带回船） */
   gazeDone: false,         /* P2.7：奥吉吉亚望海（无用但真） */
   stonePillarDone: false,  /* P2.3：费埃克斯送客船石化（石柱已升） */
   stonePillarSeen: false,  /* P2.3：你是否回头看了一眼 */
   poseidonWrath: 0,        /* P2.8：海神账上的笔数 0-3（诅咒/掀筏/石化） */
   polWrathMark: false,     /* P2.8：诅咒入账标记（防重复记账） */
   raftWrathMark: false,    /* P2.8：掀筏入账标记（多次掀筏只记一笔） */
   cliffWarn: false,        /* 忒勒皮洛斯：崖下险道首次警告 */
   cliffHurt: false,        /* 崖下险道已挨过一次滚石（防反复刷血） */
   grassNodes: {},          /* 玛草丛一次性采摘标记 {g0:true}（防无限采刷币/刷好感） */
   seaweedTaken: false,    /* 海藻已采（防无限刷食物/历练） */
   appleTaken: false,       /* 金苹果已采 */
   reefFishUntil: 0,        /* 岛礁钓鱼冷却戳记（performance.now） */
   offered: false,          /* 冥界献祭沟已献（防重复扣物发历练） */
   boarRewarded: false,     /* 野猪赏金已兑（防重复领 3 枚 + 好感） */
   suitorsFooled: false,    /* 终章乞丐骗过求婚者 */
  rumors: [],              /* 传闻账本 [{id,t,imp,place,who,summary,heard:[]}]（活的社会：名声事件横向传播） */
  ambientGiven: {},        /* B-8：ambient 一次性承诺物资发放记录 {npc.id:true} */
  choiceLog: [],            /* 核心循环：最近 12 次抉择及真实数值结算 */
  decisions: {},            /* 抉择回声：{decId: 选择label} —— 跨场景持久化的选择回响 */
};

/* ---------- 派生数值：从基础属性重算，绝不存为真值（rpg Pattern 1） ---------- */
function derived(){
  const lv = state.level-1;
  const w = state.equipped && WEAPONS[state.equipped] ? WEAPONS[state.equipped] : {atk:0};
  return { maxHp: 100 + lv*10, atk: 8 + lv + w.atk };
}
function xpToNext(lv){ return Math.round(40*Math.pow(lv,1.5)); }
function gainXp(n){
  state.xp += n;
  let up=false;
  while (state.xp >= xpToNext(state.level)){ state.xp -= xpToNext(state.level); state.level++; up=true; }
  if (up){
    state.hp = derived().maxHp;   /* 升级回满 */
    addMemory(`旅人修为精进，历练到了 ${state.level} 级`,1);
    popText(aiaPlayer.x, aiaPlayer.y-30, `升级！Lv.${state.level}`, "#ffd66b", true);
    feedback("large"); sfx("level");
    toast(`⬆ 历练足够，等级 ${state.level}！血上限 +10、攻击 +1，伤势痊愈。`);
    /* 新手保护期收束（Steam 化引导）：Lv2 起海不再护着你——饥饿/干渴开始真正伤人 */
    if (state.level>=2 && state.survivalGrace!==false){
      state.survivalGrace=false;
      setTimeout(()=>toast("你的名声开始在海上传开——新手的海不再护着你：往后饿与渴都会真的伤身。备好干粮和淡水再出发。"), 1600);
    }
  }
  renderHUD();
}

/* ---------- 存档兼容：旧档补新字段默认值 ---------- */
function ensureState(){
  /* 没有引导字段的存档均早于本功能：老玩家不重复教学 */
  if (!state.onboarding) state.onboarding={step:3,done:true};
  /* 开场微节拍：没有该字段的存档均早于本功能，直接视为看过，不打扰老玩家 */
  if (state.openingBeat===undefined) state.openingBeat=3;
  if (state.hunger===undefined) state.hunger=80;
  if (state.thirst===undefined) state.thirst=80;
  if (state.xp===undefined) state.xp=0;
  if (state.level===undefined) state.level=1;
  if (state.affinity===undefined) state.affinity=10;
  if (!Array.isArray(state.affUnlocked)) state.affUnlocked=[];
  if (state.clock===undefined) state.clock=9*60;
  if (!Array.isArray(state.memory)) state.memory=[];
  if (!state.quests) state.quests={};
  if (!Array.isArray(state.windFreed)) state.windFreed=[false,false,false,false];
  /* 第三章字段：旧档补默认值 */
  if (state.straitStage===undefined) state.straitStage=0;
  if (state.waxEars===undefined) state.waxEars=false;
  if (state.mastTied===undefined) state.mastTied=false;
  if (state.circeMessage===undefined) state.circeMessage=false;
  if (state.scyllaDebtPaid===undefined) state.scyllaDebtPaid=false;
  if (state.straitCleared===undefined) state.straitCleared=false;
  if (state.sunlit===undefined) state.sunlit=false;
  if (state.lyricFragment===undefined) state.lyricFragment=false;
  /* 第四章字段：旧档补默认值 */
  if (state.sunWrath===undefined) state.sunWrath=false;
  if (state.sunBlessed===undefined) state.sunBlessed=false;
  if (state.sunName===undefined) state.sunName=null;
  if (state.sunDebt===undefined) state.sunDebt=null;
  if (state.slaughterWarn===undefined) state.slaughterWarn=false;
  if (!Array.isArray(state.memGreeted)) state.memGreeted=[];
  if (state.circeLeft===undefined) state.circeLeft=false;
  /* P1.2 三件套字段：旧档补默认值 */
  if (state.hermesMet===undefined) state.hermesMet=false;
  if (state.meadHeld===undefined) state.meadHeld=false;
  if (state.circeSworn===undefined) state.circeSworn=false;
  if (state.pigged===undefined) state.pigged=false;
  if (state.crewmenSeen===undefined) state.crewmenSeen=false;
  if (!Array.isArray(state.achiv)) state.achiv=[];
  /* 航程闭环字段：旧档补默认值 */
  if (state.prophecy===undefined) state.prophecy=null;
  if (state.sunStage===undefined) state.sunStage=null;
  if (state.freeSail===undefined) state.freeSail=false;
  /* 自由航行·海遇字段：旧档补默认值 */
  if (state.seaEncCount===undefined) state.seaEncCount=0;
  if (!state.seaEncDone) state.seaEncDone={};
  if (!state.ambientGiven) state.ambientGiven={};
  if (!Array.isArray(state.choiceLog)) state.choiceLog=[];
  if (!state.decisions) state.decisions={};   /* 抉择回声：旧档补空字典 */
  if (state.seaThreshold===undefined) state.seaThreshold=900;
  if (state.seaThreshold<900) state.seaThreshold=900;   /* 旧档归一化：老阈值(300~420)整体抬到新节奏基线，幂等 */
  if (state.epilogueDone===undefined) state.epilogueDone=false;
  /* 第五/六章 + 终章字段：旧档补默认值 */
  if (state.calypsoStage===undefined) state.calypsoStage=0;
  if (state.calypsoChoice===undefined) state.calypsoChoice=null;
  if (state.calypsoName===undefined) state.calypsoName=null;
  if (state.ogygiaDay===undefined) state.ogygiaDay=0;
  if (!state.raft) state.raft={wood:0,wind:false,food:0};
  else { state.raft.wood=state.raft.wood||0; if(state.raft.wind===undefined)state.raft.wind=false; if(state.raft.food===undefined)state.raft.food=0; }
  /* 旧档补默认：装备 / 野猪 / 终章骗子 / 献祭 / 一次性采集标记 */
  if (state.equipped===undefined) state.equipped=null;
  if (state.boarKilled===undefined) state.boarKilled=false;
  if (state.boarRewarded===undefined) state.boarRewarded=false;
  if (state.suitorsFooled===undefined) state.suitorsFooled=false;
  if (state.offered===undefined) state.offered=false;
  if (!state.grassNodes) state.grassNodes={};
  if (state.seaweedTaken===undefined) state.seaweedTaken=false;
  if (state.appleTaken===undefined) state.appleTaken=false;
  if (state.reefFishUntil===undefined) state.reefFishUntil=0;
  if (state.ogygiaLeft===undefined) state.ogygiaLeft=false;
  if (!Array.isArray(state.talesTold)) state.talesTold=[];
  if (state.scheriaStage===undefined) state.scheriaStage=0;
  if (state.nausicaaAsk===undefined) state.nausicaaAsk=false;
  if (state.guest===undefined) state.guest=false;
  if (state.nausicaaGift===undefined) state.nausicaaGift=false;
  if (state.scheriaFarewell===undefined) state.scheriaFarewell=false;
  if (state.ithacaStage===undefined) state.ithacaStage=0;
  if (state.disguise===undefined) state.disguise=false;
  if (state.homeAnswer===undefined) state.homeAnswer=null;
  if (state.farewellHint===undefined) state.farewellHint=false;
  if (state.finaleDone===undefined) state.finaleDone=false;
  if (state.chosenName===undefined) state.chosenName=null;
  if (state.nameWay===undefined) state.nameWay=null;
  /* 序章组字段：旧档补默认值（奥德修斯的航迹） */
  if (!state.legs) state.legs={};
  if (!Array.isArray(state.trail)) state.trail=[];
  if (!state.seaRoute || !["coast","open","mist"].includes(state.seaRoute)) state.seaRoute="open";
  if (!Array.isArray(state.seaEchoes)) state.seaEchoes=[];
  if (state.maleaDone===undefined) state.maleaDone=false;
  if (state.ismarosSpared===undefined) state.ismarosSpared=false;
  /* 必经短章：旧档补默认值（老档已走过这些岛的，按既有进度点亮，避免卡在离岛口） */
  if (state.ismarosDone===undefined) state.ismarosDone=!!(state.ismarosSpared||state.campHeld||state.tookWine);
  if (state.lotusDone===undefined) state.lotusDone=!!(state.lotusAte||state.lotusDragged||state.lotusGift);
  if (state.cyclopDone===undefined) state.cyclopDone=!!(state.polHeard||state.ramHide||state.polNameGiven);
  if (state.telepylosDone===undefined) state.telepylosDone=!!(state.ropeTaken||state.cliffHurt);
  if (state.aeoliaDone===undefined) state.aeoliaDone=!!(state.windFreed||[]).every(Boolean)&&!!(state.windFreed||[]).length;
  if (!Array.isArray(state.songsSung)) state.songsSung=[];
  if (state.fleet===undefined) state.fleet=0;
  if (state.troyStage===undefined) state.troyStage=0;
  if (state.troyWood===undefined) state.troyWood=0;
  if (state.troyBurned===undefined) state.troyBurned=false;
  if (state.troySpared===undefined) state.troySpared=false;
  if (state.troyDone===undefined) state.troyDone=false;
  if (state.fleetGuard===undefined) state.fleetGuard=null;
  if (!state.backpack) state.backpack={};   /* 背包兜底（极简合成档/半损坏档防 renderHUD 读空） */
  if (!state.status) state.status={};       /* 状态文案兜底（tickNeeds 每帧写入，缺了会每帧报错） */
  /* P1.1 船员账本：旧档回补——挂点 flag 由既有进度推导，账本未点亮则静默入账（无横幅无 toast） */
  if (state.crew===undefined) state.crew=0;
  if (state.crewLit===undefined) state.crewLit=false;
  /* P1 修复：账本未点亮时名册必须留 null（由 crewLedgerLight 在出海时播种）。
     原先这里先把 crew=0 的空数组造出来/截断，crewLedgerLight 的 !Array.isArray 守卫失效 →
     任何加载的存档名册永远为空（折损无点名、终章无存活者名单） */
  if (!state.crewLit){ state.crewList = null; }
  else if (!Array.isArray(state.crewList) || state.crewList.length !== (state.crew||0)){
    state.crewList = CREW_ROSTER.slice(0, state.crew||0);   /* 折损语义＝名册前 crew 个名字；长度不符即按语义修复 */
  }
  if (state.crewCyclops===undefined) state.crewCyclops=!!state.polHeard;
  if (state.crewScylla===undefined) state.crewScylla=!!(state.straitStage>=2&&!state.scyllaDebtPaid);
  if (state.crewSun===undefined) state.crewSun=!!state.sunWrath;
  /* P1.3 鼓噪抉择：旧档补默认值（旧档无此三字段＝未触发过，行为与旧版一致） */
  if (state.crewNoiseDone===undefined) state.crewNoiseDone=false;
  if (state.crewSaved===undefined) state.crewSaved=false;
  if (state.zeusStruck===undefined) state.zeusStruck=false;
  /* P1.6 掀筏：旧档补默认值（旧档无此三字段＝未触发过，行为与旧版一致） */
  if (state.raftStormDone===undefined) state.raftStormDone=false;
  if (state.raftStormFail===undefined) state.raftStormFail=false;
  if (state.raftVeilTaken===undefined) state.raftVeilTaken=false;
  if (state.scSixSaved===undefined) state.scSixSaved=false;   /* F5 斯库拉全救回（改写）flag */
  /* P1.4/P1.5/P1.8 三站：旧档补默认值（旧档无此字段＝未触发过，行为与旧版一致） */
  if (state.motherHug===undefined) state.motherHug=0;
  if (state.oldName===undefined) state.oldName=null;
  if (state.achillesHeard===undefined) state.achillesHeard=false;
  if (state.agamemnonHeard===undefined) state.agamemnonHeard=false;
  if (state.selfRevealed===undefined) state.selfRevealed=false;
  if (state.troySongDone===undefined) state.troySongDone=false;
  if (state.banishedFromAeolia===undefined) state.banishedFromAeolia=false;
  /* P1.8 旧档回补：风袋是否用光过——按记忆流推导（useWind 用光时写过「用得一干二净」） */
  if (state.windbagEmptied===undefined)
    state.windbagEmptied = (state.memory||[]).some(m=>m&&m.text&&m.text.includes("用得一干二净"));
   /* P1.7 相认三问：旧档补默认值（旧档无此三字段＝未考过，行为与旧版一致） */
   if (state.examAsked===undefined) state.examAsked=false;
   if (state.examScar===undefined) state.examScar=false;
   if (state.examBed===undefined) state.examBed=false;
   /* P1.9 忒勒玛科斯 + F6 大厅肃清：旧档补默认值（无此三字段＝未触发过，行为与旧版一致） */
   if (state.telMet===undefined) state.telMet=false;
   if (state.telRevealed===undefined) state.telRevealed=false;
   if (state.suitorsSwept===undefined) state.suitorsSwept=false;
   /* F3/F4 序章战斗 + P1.4 记忆支付：旧档补默认值（无此字段＝未打/未支付，行为与旧版一致） */
   if (state.campHeld===undefined) state.campHeld=false;
   if (state.ramHide===undefined) state.ramHide=false;
   if (!Array.isArray(state.paidMem)) state.paidMem=[];
  if (!Array.isArray(state.rumors)) state.rumors=[];   /* 传闻账本：旧档补空表，随后按 flag 幂等派生 */
  if (state.troyDone) crewLedgerLight();   /* P1 修复：只在出了特洛伊后才点亮账本——原先无条件调用，加载任意未出海的旧档都会立即 ⚑12/12，破坏「十二个名字都在甲板上」的出海拍 */
  syncCrewLosses();          /* 阶段③：旧档按存活名单回补具名折损册；已记录的具体死因优先保留 */
  if (state.tookWine===undefined) state.tookWine=false;
  if (state.targetHits===undefined) state.targetHits=0;
  if (state.lotusAte===undefined) state.lotusAte=false;
  if (state.lotusGift===undefined) state.lotusGift=false;
   if (state.lotusDragged===undefined) state.lotusDragged=false;
   /* P2 批（17s）：旧档补默认值＝未触发过，行为与旧版一致 */
   if (state.lotusDraggedOk===undefined) state.lotusDraggedOk=false;
   if (state.gazeDone===undefined) state.gazeDone=false;
   if (state.stonePillarDone===undefined) state.stonePillarDone=false;
   if (state.stonePillarSeen===undefined) state.stonePillarSeen=false;
   if (state.polWrathMark===undefined) state.polWrathMark=false;
   if (state.raftWrathMark===undefined) state.raftWrathMark=false;
   /* P2.8 波塞冬怒值：旧档按事件 flag 推导回补（诅咒 flag：真名已报入 polNameGiven） */
   if (state.poseidonWrath===undefined){
     let w=0;
     if (state.polWrathMark || state.polNameGiven==="奥德修斯"){ state.polWrathMark=true; w++; }
     if (state.raftWrathMark || state.raftStormDone || state.raftStormFail){ state.raftWrathMark=true; w++; }
     if (state.stonePillarDone) w++;
     state.poseidonWrath=w;
   }
   if (state.sheared===undefined) state.sheared=false;
  if (state.polHeard===undefined) state.polHeard=false;
  if (state.polNameGiven===undefined) state.polNameGiven=null;
  if (state.namesHeard===undefined) state.namesHeard=false;
  if (state.ropeTaken===undefined) state.ropeTaken=false;
  if (state.cliffWarn===undefined) state.cliffWarn=false;
  if (state.cliffHurt===undefined) state.cliffHurt=false;
  /* 旧档迁移：单任务槽 → 多任务账本（rpg/save-systems：只加 migration，不坏老档） */
  if (state.quest){
    const id = /风/.test(state.quest.name||"") ? "aeolia_winds" : "witch_grass";
    state.quests[id] = Object.assign({id, who:id==="aeolia_winds"?"aeolus":"witch"}, state.quest);
    state.quest = null;
  }
  syncRumorsFromState();   /* 按既有 flag 幂等派生传闻（旧档回补；重复触发不重复入账） */
  const d=derived(); if (state.hp>d.maxHp) state.hp=d.maxHp;
}
