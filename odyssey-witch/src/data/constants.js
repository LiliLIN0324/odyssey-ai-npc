// ============================================================
// 奥德赛 · 数据模块 —— constants
// ============================================================

/* ==================================================================
 *  奥德赛 · 地中海 —— 世界地图 + 埃阿亚岛 2.5D
 *  场景状态机：scene = 'world' | 'aia'
 *  世界地图：驾船航行，靠近岛屿 E 登陆
 *  埃阿亚岛：2.5D 区域（瓦片厚度 + y-sort 遮挡 + 泡沫海岸）
 * ================================================================== */

/* ==================== 世界地图（地中海） ==================== */
const WCOLS = 46, WROWS = 18, WTS = 40;   /* 批次 H9：世界物理尺寸翻倍（920×360→1840×720px）——航程时间×2，视角内瓦数减半；地理形状（46×18 格）不变 */
function buildMediterranean(){
  /* 批次 H7：分段重建海岸线——旧版希腊是一整块矩形、意大利靴子只有半只、北非一条横贯实心带、
     塞浦路斯被安纳托利亚吞掉、东地中海整体封死——玩家「不像地中海」。
     新网格按真实地理画：意大利全靴（利古里亚→靴跟→靴尖）、西西里三角、撒丁/科西嘉、
     伯罗奔尼撒+希腊锯齿岸、爱琴海礁岛、特洛伊角+达达纳斯水道、克里特、塞浦路斯、黎凡特纵岸、
     直布罗陀窄口、加贝斯湾/锡德拉湾两大凹陷。
     【钉子约束】13 个玩法岛标记 + 出生点(22,11) + 马里阿角(19,10) + 特洛伊出海(30,6.75)
     + 太阳岛离港(28.3,10.5) + 斯克里送行(18.5,9) 全部落水（提交前经 BFS 可达性校验）。 */
  const W = Array.from({length:WROWS}, () => Array(WCOLS).fill("~"));
  const land=(x0,y0,x1,y1)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(x>=0&&x<WCOLS&&y>=0&&y<WROWS)W[y][x]="#";};
  const cell=(x,y,c="#")=>{if(x>=0&&x<WCOLS&&y>=0&&y<WROWS)W[y][x]=c;};
  /* —— 北岸：欧洲内陆 + 巴尔干/色雷斯/安纳托利亚北岸整带 —— */
  land(0,0,45,1);
  land(17,2,45,4);
  /* —— 伊比利亚 + 直布罗陀窄口（y6 留水）—— */
  land(0,2,4,4); land(0,5,3,5);
  /* —— 意大利全靴：利古里亚 → 展宽 → 半岛 → 靴跟 → 靴尖 —— */
  land(13,2,14,3);
  land(13,4,15,5);
  land(13,6,14,8);
  land(14,9,15,10);
  land(12,11,13,11);
  /* —— 岛链：科西嘉 / 撒丁 / 西西里 —— */
  cell(10,3); cell(10,4);
  land(10,6,10,7);
  land(10,11,13,11); land(9,12,12,12);
  /* —— 希腊：锯齿岸 + 伯罗奔尼撒 —— */
  land(17,5,22,5);
  land(17,6,21,6);
  land(18,7,20,7);
  land(18,8,19,8);
  /* —— 安纳托利亚主体（西南让出达达纳斯/伊玛洛斯湾）+ 黎凡特纵岸 —— */
  land(35,5,45,8);
  land(44,9,45,12);
  /* —— 特洛伊角（达达纳斯西翼）—— */
  land(32,5,33,6);
  /* —— 爱琴海礁岛 —— */
  cell(25,6);
  /* —— 非洲：摩洛哥角 → 阿尔及利亚 → 突尼斯(加贝斯湾) → 的黎波里 → 锡德拉湾 → 昔兰尼加 → 埃及 —— */
  land(0,7,2,7); land(0,8,1,9); land(0,10,4,12); land(0,13,6,13);
  land(0,14,8,14); land(0,15,7,15);
  land(13,14,23,14); land(13,15,24,15);
  land(30,13,45,15);
  /* —— 岛：克里特 / 塞浦路斯 / 礁石 —— */
  land(24,13,26,13);
  cell(37,11);
  cell(6,4,"X"); cell(35,9,"X");
  land(0,16,45,17);   /* 非洲内陆封底（缺了它整个南岸是一圈飘在水上的薄壳） */
  for(let y=0;y<WROWS;y++)for(let x=0;x<WCOLS;x++)if(W[y][x]==="~"&&(x*13+y*7)%9===0)W[y][x]=".";  // 浅水点（同旧版撒布式）
  return W.map(r=>r.join(""));
}
const WORLD = buildMediterranean();
const ISLANDS = [
  {gx:34, gy:5,  name:"伊斯玛洛斯", note:"喀科恩人的城 · 第一次劫掠的遗址", stake:"守营火把与伤者：药品、伤势，以及是否再劫一次", reward:"战斗手感 · 喀科恩酒 · 守营历练", open:true, scene:"ismaros",   leg:1,  mp:[52,25]},
  {gx:2,  gy:9,  name:"食莲岛",    note:"食莲人的滩 · 忘忧的甜",           stake:"甜会换走一段记忆；强拖幸存者也可能只留下断桨", reward:"补给与士气 · 带幸存者归船的可能", open:true, scene:"lotus",     leg:3,  mp:[14,82]},
  {gx:13, gy:13, name:"独眼巨人之岛", note:"无人之名 · 巨人的羊栏",       stake:"名字会招灾；羊腹潜行与六名船员的命都押在这里", reward:"羊毛披风 · 无人之名 · 原著或改写命运", open:true, scene:"cyclops",   leg:4,  mp:[28,57]},
  {gx:5,  gy:11, name:"埃阿亚岛",    note:"喀耳刻的领地 · 第勒尼安海",       stake:"蜜酒、魔草与立誓：空手饮酒可能再变不回人", reward:"玛草委托 · 药品补给 · 冥界航向", open:true, scene:"aia",       leg:7,  mp:[24,62]},
  {gx:0,  gy:6,  name:"冥界之岸",  note:"俄刻阿诺斯之岸 · 亡者之言",       stake:"蜂蜜酒、面包、淡水作献祭；珍贵记忆也能付给亡者", reward:"返乡预言 · 海峡路线", open:true, scene:"hades",     leg:8,  mp:[10,47]},
  {gx:11, gy:6,  name:"风神岛",    note:"埃俄罗斯的浮岛 · 十二风在此听差", stake:"四阵顺风有限；用光后再来求助会被逐出浮岛", reward:"风袋 · 顺风快旅", open:true, scene:"aeolia",    leg:5,  mp:[30,47]},
  {gx:26, gy:10, name:"忒勒皮洛斯", note:"悬崖之城 · 十一艘船只剩一艘",     stake:"滚石与守船战：伤势和整支船队都暴露在崖下", reward:"幸存者的绳结 · 食莲岛的另一种解法", open:true, scene:"telepylos", leg:6,  mp:[34,50]},
  {gx:27, gy:15, name:"奥吉吉亚",  note:"卡吕普索的岛 · 完美的一天",       stake:"留下就没有归乡；造筏要备齐木料、听风与储粮", reward:"自己的名字 · 亲手造的筏 · 斯克里航路", open:true, scene:"ogggia",    leg:12, mp:[57,68]},
  {gx:20, gy:8,  name:"斯克里岛",  note:"费埃克斯人的岛 · 有人性的驿站",   stake:"故事若只吹牛，歌不唱；留下做客或说出家在哪里", reward:"被听见的歌 · 送行 · 伊萨卡解锁", open:true, scene:"scheria",   leg:13, mp:[38,38]},
  {gx:16, gy:13, name:"伊萨卡",    note:"归乡 · 爱奥尼亚海 · 雾正在散",    stake:"化名、伤疤、婚床与求婚者：认名决定你如何回来", reward:"归乡或不归的结局 · 航程归档 · 自由的海", open:true, scene:"ithaca",    leg:14, mp:[40,63]},
  {gx:30, gy:7,  name:"特洛伊海岸", note:"启航之地 · 木马之夜 · 十二艘船从这里出发", stake:"烧城或放下火把：这一夜决定你带着什么离开战争", reward:"十二艘船与完整船队 · 真正的启航", open:true, scene:"troy", leg:0, mp:[71,38]},
  {gx:24, gy:7,  name:"声之海峡",  note:"塞壬的歌 · 斯库拉的六头 · 代价",  stake:"封耳失去记忆，听歌损士气；斯库拉还会索取行囊与船员", reward:"歌词残页 · 带话解债 · 出峡航路", open:true, scene:"strait",    leg:9,  mp:[30,64]},
  {gx:42, gy:9,  name:"太阳岛",    note:"赫利俄斯的圣牛 · 饥饿与誓言",     stake:"饥饿与誓言只能守一个；宰牛会招来雷劈与船员清零", reward:"守住圣牛可得黑暗之光 · 返乡继续推进", open:true, scene:"sun",       leg:11, mp:[47,60]},
];
window.ISLANDS = ISLANDS;   /* 挂载给 world3d.js：ES 模块读不到经典脚本顶层 const（缺它 → 岛屿不装配 + 水体 shader uIsle[0] 编译失败） */

/* ---------- 岛外海落点（离岛/登岛后船停在哪） ----------
   批次 K2（A1 摊开岛距）新增。
   原来这些落点全是手写魔数，散在 handlers.js / events.js / constants.js 共 12 处，
   形如 `boat.x = 21*WTS+WTS/2+50`。改一次岛坐标就要人工同步 12 个点，
   漏一个就出「下船卡在岛里 / 落在陆地上」的硬伤——这正是本批要消灭的那类 bug。
   现在统一从 ISLANDS 派生： isleOff(scene, ox, oy) = 该岛格心 + 像素偏移。
   偏移量沿用各处的原值（相对格心），所以视觉落位与旧版一致，只是跟随坐标。 */
function isleOff(scene, ox, oy){
  const is = ISLANDS.find(i=>i.scene===scene);
  if(!is) return {x:0, y:0};
  return {x: is.gx*WTS + WTS/2 + (ox||0), y: is.gy*WTS + WTS/2 + (oy||0)};
}
window.isleOff = isleOff;

/* ==================== 海图玩法层：洋流 / 航路姿态 / 航迹与海面回声 ====================
   这一层是「海图不只是画」的唯一真源：世界海图 canvas 画它，航速与海遇也结算它。

   【坐标唯一真源】海图坐标一律由实际可航世界（WORLD 的 46×18 格）投影而来：
   mapPct(gx,gy) = 格心 → 海图百分比。底图（scripts/build_seamap.py）用同一份
   land/cell 数据渲染，岛屿标记也在这里派生——不再有「手填 mp 与实际地形两套坐标」。 */
function mapPct(gx, gy){ return [(gx+0.5)/WCOLS*100, (gy+0.5)/WROWS*100]; }
/* 岛屿标记 = 实际登陆水域的格心；海图上的小岛图形由底图生成器画在同一格心 */
for (const is of ISLANDS){
  const p = mapPct(is.gx, is.gy);
  is.mp = [ +p[0].toFixed(2), +p[1].toFixed(2) ];
}

/* 洋流：用网格坐标描述（跟着实际海域走），运行时投影成海图百分比 */
const SEA_CURRENTS = [
  {id:"north", name:"爱琴海暖流", cells:[[31,5],[29,6],[27,7],[25,7.5],[23,8],[22,9],[20,10]]},
  {id:"west",  name:"西地中海流", cells:[[1,6],[4,6],[7,6],[9,7.5],[10,9],[12,10.5],[13,12],[14,12.5]]},
  {id:"south", name:"南岸回流",   cells:[[28,12],[26,12],[24,12],[22,12],[20,12.5],[18,13],[15,13],[12,13],[9,13],[8,13]]},
  {id:"east",  name:"黎凡特沿岸流", cells:[[43,10.5],[42,9.5],[40,10],[38,10],[36,9],[34,8.5],[33,7.5],[31.5,7]]},
].map(c=>({id:c.id, name:c.name, cells:c.cells, pts:c.cells.map(p=>mapPct(p[0],p[1]))}));
window.SEA_CURRENTS = SEA_CURRENTS;
/* 航路姿态：同一片海，三种走法。速度 / 海遇频率 / 海遇凶险度三轴互换。 */
const SEA_ROUTES = {
  coast:{label:"沿岸", name:"沿岸航线", speed:0.94, encounter:1.45, hazard:0.15,
    blurb:"贴着海岸走：稳，海遇少；绕远，慢一点。"},
  open:{label:"外海", name:"外海航线", speed:1.0, encounter:1.0, hazard:0.34,
    blurb:"常规航道：速度与遭遇均衡。"},
  mist:{label:"迷雾", name:"迷雾航线", speed:1.14, encounter:0.62, hazard:0.72,
    blurb:"钻进雾里抄近路：快，但海遇频繁、事情更凶。"},
};
function seaRouteKey(){ return (state && SEA_ROUTES[state.seaRoute]) ? state.seaRoute : "open"; }
function seaRoute(){ return SEA_ROUTES[seaRouteKey()]; }
function seaRouteSpeed(){ return seaRoute().speed; }
function seaEncounterMul(){ return seaRoute().encounter; }
function seaRouteHazard(){ return seaRoute().hazard; }
function setSeaRoute(k){
  if (!SEA_ROUTES[k] || seaRouteKey()===k) return;
  state.seaRoute = k; save();
  toast(`航路改为「${SEA_ROUTES[k].name}」——${SEA_ROUTES[k].blurb}`);
  if (typeof renderHUD==="function") renderHUD();
  if (window.WorldMap && WorldMap.syncRoute) WorldMap.syncRoute();
}
/* 船当前是否在洋流带里：返回 {id,name,tx,ty,strength}；不在则 null。
   距离按海图宽高比折算（底图 3312×1296：横向 1% = 33.1px，纵向 1% = 13px）。 */
const CURRENT_RADIUS = 3.0, CURRENT_ASPECT = 1296/3312;
function currentAt(){
  if (typeof scene!=="undefined" && scene!=="world") return null;
  if (typeof boatMapPos!=="function") return null;
  const mp = boatMapPos();
  if (!mp) return null;
  const px = mp[0], py = mp[1];
  let best = null;
  for (const c of SEA_CURRENTS){
    for (let i=1;i<c.pts.length;i++){
      const a=c.pts[i-1], b=c.pts[i];
      const vx=b[0]-a[0], vy=b[1]-a[1];
      const len2=vx*vx+vy*vy; if (!len2) continue;
      let t=((px-a[0])*vx+(py-a[1])*vy)/len2;
      t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(px-(a[0]+vx*t), (py-(a[1]+vy*t))*CURRENT_ASPECT);
      if (d>CURRENT_RADIUS) continue;
      if (!best || d<best.d){
        const len=Math.sqrt(len2);
        best={id:c.id, name:c.name, tx:vx/len, ty:vy/len, d, strength:1-d/CURRENT_RADIUS};
      }
    }
  }
  return best;
}
/* 航速洋流系数：顺着流 1.18，逆着流 0.88，横穿 1.0（dx/dy 为本次移动方向） */
function currentFactor(dx,dy){
  const c = currentAt();
  if (!c) return 1;
  const len = Math.hypot(dx||0, dy||0);
  if (!len) return 1;
  const dot = (dx/len)*c.tx + (dy/len)*c.ty;
  if (dot >= 0.35) return 1.18;
  if (dot <= -0.35) return 0.88;
  return 1.0;
}
function currentTag(dx,dy){
  const f = currentFactor(dx,dy);
  return f>1.1 ? "顺流 ×1.18" : f<0.95 ? "逆流 ×0.88" : "横流";
}
/* 真实到访序列：航迹回看的唯一来源（旧档没有它时由 worldmap 按航序兜底） */
function recordTrail(k){
  if (!Array.isArray(state.trail)) state.trail=[];
  const is = ISLANDS.find(x=>x.scene===k);
  if (!is) return;
  const last = state.trail[state.trail.length-1];
  if (last && last.k===k) return;                 /* 连续重入同一岛不重复落点 */
  state.trail.push({k, leg:is.leg, t:Math.round(state.clock||0)});
  if (state.trail.length>80) state.trail.shift();
}
/* 海面事件回声：事件发生的位置落一枚可回看的标记 */
function recordSeaEcho(e){
  if (!e) return;
  if (!Array.isArray(state.seaEchoes)) state.seaEchoes=[];
  const mp = (typeof boatMapPos==="function") ? boatMapPos() : [50,50];
  const x = +mp[0].toFixed(2), y = +mp[1].toFixed(2);
  const last = state.seaEchoes[state.seaEchoes.length-1];
  if (last && last.id===e.id && Math.hypot(last.x-x, last.y-y)<2.5) return;
  state.seaEchoes.push({id:e.id, name:e.name, x, y, t:Math.round(state.clock||0)});
  if (state.seaEchoes.length>40) state.seaEchoes.shift();
}
/* ==================== 海图玩法层结束 ==================== */

/* 批次 K2（A1 摊开岛距）：海域名标签跟着新岛位重排。
   旧值是按旧布局摆的，岛一挪就出现「地中海压在奥吉吉亚上」「黎凡特海压在太阳岛上」
   「爱琴海跑到爱奥尼亚去了」这类错位。坐标仍用世界网格格心。
   批次 K3：再挪一轮——上一版把「爱奥尼亚海(20,13)」与「地中海(22,13)」放到了隔 2 格的位置，
   两个标签在屏幕上会压在一起；而且海域名必须和 B2 海域状态层（worldState.js 的
   WORLD_REGIONS）用同一套坐标，否则海图上写着的名字和状态层正在发生事的那片海对不上。
   现在 5 片海各自占一段，互不重叠，也各自是状态层里的一个 region 中心。 */
const SEAS = [
  {x:23,y:2,label:"欧洲"}, {x:4,y:16,label:"非洲"}, {x:8,y:9,label:"第勒尼安海"},
  {x:18,y:12,label:"爱奥尼亚海"}, {x:25,y:14,label:"地中海"},
  {x:28,y:8,label:"爱琴海"}, {x:40,y:11,label:"黎凡特海"},
];

/* ==================== 埃阿亚岛地图（2.5D） ==================== */
/* ~水 T树 H屋墙 D门 C坩埚 M玛草 P泉 A石碑 F篝火 _栈桥 . 草地 ,小径 */
const AIA = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~TT....TT...T...MM.~",
  "~T.HHHH......T..M..~",
  "~..HHDH..C.........~",
  "~....,.............~",
  "~....,......T......~",
  "~....,..........PP.~",
  "~....,..........PP.~",
  "~....,........AF...~",
  "~..__,.............~",
  "~..__,,............~",
  "~~~_,,~~~~~~~~~~~~~~",
];
const ATS = 40, ACOLS = 20, AROWS = 12;
const ASOLID = new Set(["~","T","H","C","A","P","F"]);

/* ==================== 冥界地图（2.5D · 冷磷光 · 俄刻阿诺斯之岸） ====================
   ~冥河 T白杨 G献祭沟 _栈桥 . 暗岩 , 灰白冥路
   原版骨：倒祭品入沟召亡魂 → 特瑞西阿斯预言返乡之路（荷马史诗第 11 卷 Nekyia） */
const HADES = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~~~~~TTT~~~TTT~~~~~~",
  "~~~TTT......TTT~~~~~",
  "~~~T.......G.....T~~",
  "~~~....,,......T~~~~",
  "~~...,,,........T~~~",
  "~~...,,..........~~~",
  "~....,,...........T~",
  "~....,...........T~~",
  "~....,.............~",
  "~___,,.............~",
  "~~~___~~~~~~~~~~~~~~",
];
const HSOLID = new Set(["~","T","G"]);
const seer = { x: 9*ATS+ATS/2, y: 2*ATS+ATS*0.6 };          /* 特瑞西阿斯立于路尽头 */

/* ==================== 风神岛地图（2.5D · 浮岛云海 · 插章·暗线③风袋） ====================
   ~云海 T风柱 H宫墙 D宫门 C风之祭坛 W风牢笼 _云桥 . 浮岛草地 , 云径
   原版骨：风神埃俄罗斯把装着诸向顺风的皮袋借给奥德修斯（荷马史诗第 10 卷）
   玩法：释放四风（W×4）→ 归还风袋祭坛 → 得风袋（海上放风=航速倍增，贪念=用光） */
const AEOLIA = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~TT.....TT........T~",
  "~T..HHHH.....T.....~",
  "~..HHDH...C......W.~",
  "~....,.......W.....~",
  "~....,.............~",
  "~.W..,..........T..~",
  "~....,.............~",
  "~......T.......W...~",
  "~..__,.............~",
  "~..__,,............~",
  "~~~_,,~~~~~~~~~~~~~~",
];
const AESOLID = new Set(["~","T","H","C","W"]);
const WIND_DIRS = ["西风","东风","南风","北风"];
/* 风牢笼点位与 AEOLIA 地图中的 W 瓦片一一对应（idx 顺序 = WIND_DIRS） */
const aeolus = { x: 4*ATS+ATS/2, y: 4*ATS+ATS*0.55 };   /* 风神立于宫门前 */
const AESPOTS = [
  {type:"aeolus", x:aeolus.x, y:aeolus.y, r:85, label:"与埃俄罗斯交谈"},
  {type:"wind", idx:0, x:17*ATS+ATS/2, y:3*ATS+ATS/2, r:70, label:"释放囚禁的风"},
  {type:"wind", idx:1, x:13*ATS+ATS/2, y:4*ATS+ATS/2, r:70, label:"释放囚禁的风"},
  {type:"wind", idx:2, x:2*ATS+ATS/2,  y:6*ATS+ATS/2, r:70, label:"释放囚禁的风"},
  {type:"wind", idx:3, x:15*ATS+ATS/2, y:8*ATS+ATS/2, r:70, label:"释放囚禁的风"},
  {type:"altar", x:9*ATS+ATS/2, y:3*ATS+ATS/2, r:70, label:"端详风之祭坛"},
  {type:"dock",  x:3*ATS+ATS/2, y:10*ATS+ATS/2, r:70, label:"乘云梯下海"},
];
function aeTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":AEOLIA[cy][cx]; }

/* ==================== 声之海峡地图（2.5D · 雾海月夜 · 第三章） ====================
   ~雾海 T礁石 S塞壬礁 K斯库拉崖 V漩涡 M桅杆 W蜡罐 _甲板 . 海面
   原版骨：塞壬歌声绑桅杆；斯库拉六头 vs 卡律布狄斯漩涡，二选一（荷马史诗第 12 卷）
   玩法：听歌二选一（蜡封耳=歌词缺页 / 绑桅听=歌词残页+士气-1）→ 斯库拉处置（带话/硬闯/赌漩涡）→ 出峡 */
const STRAIT = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~TT~~~T~~~~K~~~~TT~~",
  "~~~~~~~~~~~K~~~~~~~~",
  "~~~T~~~~~~~~~~~~T~~~",
  "~~~~S~~~~~~~~~~~V~~~",
  "~~~S~~~~~~~~~~~~V~~~",
  "~~~~~~~~~~~~~~~~~~~~",
  "~_____M____________~",
  "~__________________~",
  "~__W_______________~",
  "~__________________~",
  "~~~~~~~~~~~~~~~~~~~~",
];
const SSOLID = new Set(["~","T","S","K","V","M","W"]);
const straitMast = { x: 6*ATS+ATS/2, y: 7*ATS+ATS/2 };
const SSPOTS = [
  {type:"siren",  x:3*ATS+ATS/2,  y:5*ATS+ATS*0.2, r:110, label:"聆听塞壬"},
  {type:"scylla", x:11*ATS+ATS/2, y:4*ATS+ATS/2,  r:145, label:"面对斯库拉"},
  {type:"vortex", x:16*ATS+ATS/2, y:4*ATS+ATS*0.75, r:135, label:"赌卡律布狄斯漩涡"},
  {type:"mast",   x:straitMast.x, y:straitMast.y, r:70, label:"桅杆（绑桅听歌）"},
  {type:"wax",    x:3*ATS+ATS/2,  y:9*ATS+ATS/2, r:70, label:"蜡罐（封住耳朵）"},
  {type:"exit",   x:18*ATS+ATS/2, y:9*ATS+ATS/2, r:80, label:"冲出海峡"},
  {type:"dock",   x:1*ATS+ATS/2,  y:9*ATS+ATS/2, r:70, label:"退回外海"},
];
function sTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":STRAIT[cy][cx]; }
function tryMoveStrait(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (SSOLID.has(sTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}

/* ==================== 太阳岛地图（2.5D · 金色牧场 · 第四章） ====================
   ~外海 T柏树 S圣殿墙 A太阳祭坛 B牧场(可走) P山泉 F火盆 _栈桥 . 金草地 ,小径
   原版骨：赫利俄斯的圣牛岛（Thrinacia），饿与誓（荷马史诗第 12 卷）
   玩法：守住（海藻/钓鱼撑到黄昏→祭坛报真名得「光」）/ 宰牛（立刻饱食 +「太阳记恨」全局变阴）/
        借牛（对牛群说「借我一头，以我的名字作保」——押走一件最亮的信物，名字机制中段考试） */
const SUN = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~TT....TT......TTT.~",
  "~T..SSSS...........~",
  "~..SSASS......BB...~",
  "~......,....BBBB...~",
  "~......,....BBBBBB.~",
  "~..F...,....BBBB...~",
  "~......,..........T~",
  "~..___,............~",
  "~..___,,.......PP..~",
  "~..___,,...........~",
  "~~~_,,~~~~~~~~~~~~~~",
];
const SUNSOLID = new Set(["~","T","S","A","P","F"]);
const sunAltar = { x: 5*ATS+ATS/2, y: 3*ATS+ATS/2 };        /* 太阳祭坛（A 瓦片） */
const SUNSPOTS = [
  {type:"cattle",    x:15*ATS,       y:4*ATS+ATS/2, r:95, label:"走近牛群"},
  {type:"slaughter", x:13*ATS+ATS/2, y:5*ATS+ATS/2, r:70, label:"宰一头牛（刀口在手里）"},
  {type:"seaweed",   x:2*ATS,        y:8*ATS+ATS/2, r:70, label:"采集海藻"},
  {type:"fishing",   x:18*ATS+ATS/2, y:8*ATS+ATS/2, r:70, label:"礁滩垂钓"},
  {type:"spring",    x:16*ATS+ATS/2, y:9*ATS+ATS/2, r:70, label:"掬一捧山泉"},
  {type:"sunfire",   x:3*ATS+ATS/2,  y:6*ATS+ATS/2, r:66, label:"火盆（烤鱼）"},
  {type:"sunAltar",  x:sunAltar.x,   y:sunAltar.y,  r:80, label:"太阳祭坛"},
  {type:"sunDock",   x:3*ATS+ATS/2,  y:10*ATS+ATS/2, r:70, label:"解缆离岛"},
];
function sunTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":SUN[cy][cx]; }
function tryMoveSun(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (SUNSOLID.has(sunTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}

/* ==================== 奥吉吉亚地图（2.5D · 冻结的金色暮光 · 第五章） ====================
   ~水 T 丝柏 H 洞窟岩壁 L 织机 O 金果树 V 听风石 W 造筏台 B 篝火 _ 栈桥 . 草地 , 小径
   原版骨：卡吕普索留奥德修斯七年，许永生而不受（荷马史诗第 5 卷）
   玩法：日历冻结的「完美的一天」×3 → 她问正题（日志作答）→ 永生选择（留下 / 造筏全机制教学闭环） */
const OGYGIA = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~T.HHHHHH.....T....~",
  "~..HLLLH...O...T...~",
  "~..HHHHH.....O.....~",
  "~....,,............~",
  "~....,,.......V....~",
  "~....,,............~",
  "~T....,....WWW.....~",
  "~...............B..~",
  "~..___,............~",
  "~..___,,...........~",
  "~~~_,,~~~~~~~~~~~~~~",
];
const OGSOLID = new Set(["~","T","H","L","O","V"]);
const calypso = { x: 7*ATS+ATS/2, y: 2*ATS+ATS*0.75 };   /* 卡吕普索立于洞窟门口 */
const OGSPOTS = [
  {type:"calypso",  x:calypso.x,       y:calypso.y,       r:85, label:"与卡吕普索交谈"},
  {type:"fruit",    x:11*ATS+ATS/2,    y:2*ATS+ATS/2,     r:70, label:"摘一枚金苹果"},
  {type:"loom",     x:5*ATS+ATS/2,     y:2*ATS+ATS/2,     r:70, label:"看那架织机"},
  {type:"timber",   x:1*ATS+ATS/2,     y:1*ATS+ATS/2,     r:70, label:"砍伐木料（用你一路学的）"},
  {type:"windstone",x:14*ATS+ATS/2,    y:5*ATS+ATS/2,     r:70, label:"听风石（选出海的时辰）"},
  {type:"raft",     x:12*ATS+ATS,      y:7*ATS+ATS/2,     r:85, label:"造筏台"},
  {type:"fire",     x:16*ATS+ATS/2,    y:8*ATS+ATS/2,     r:66, label:"篝火"},
  {type:"gaze",     x:15*ATS+ATS/2,    y:10*ATS+ATS/2,    r:70, label:"望海（坐一会儿，什么也不做）"},
  {type:"ogDock",   x:3*ATS+ATS/2,     y:10*ATS+ATS/2,    r:70, label:"推筏出湾"},
];
function ogTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":OGYGIA[cy][cx]; }
function tryMoveOggia(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (OGSOLID.has(ogTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}

/* ==================== 斯克里岛地图（2.5D · 白亮橄榄 · 第六章） ====================
   ~水 T 橄榄树 P 宫殿柱廊 S 送行船 B 篝火 _ 码头 . 草地 , 小径
   原版骨：瑙西亚娅救起漂流者，费埃克斯人备船送归（荷马史诗第 6-13 卷）
   玩法：不接谎的船（说假家=雾散回原点）+ 回顾章（如实讲/吹牛讲 → 《无名旅人之歌》）+ 告白 */
const SCHERIA = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~TT...PPPPPP...TT..~",
  "~....PPPPPPPP......~",
  "~....PP.PPPP.......~",
  "~....,.....PP......~",
  "~....,.............~",
  "~....,........TT...~",
  "~..__,......TTT....~",
  "~..____,...........~",
  "~..____,,...S......~",
  "~......,...........~",
  "~~~_,,,~~~~~~~~~~~~~",
];
const SCSOLID = new Set(["~","T","P","S"]);
const nausicaa = { x: 9*ATS+ATS/2, y: 5*ATS+ATS*0.7 };   /* 瑙西亚娅在宫前草场 */
const SCSPOTS = [
  {type:"nausicaa", x:nausicaa.x,      y:nausicaa.y,      r:85, label:"与瑙西亚娅交谈"},
  {type:"talefire", x:8*ATS+ATS/2,     y:8*ATS+ATS/2,     r:75, label:"篝火（讲你的故事）"},
  {type:"ship",     x:12*ATS+ATS/2,    y:9*ATS+ATS/2,     r:80, label:"费埃克斯人的船"},
  {type:"scDock",   x:4*ATS+ATS/2,     y:10*ATS+ATS/2,    r:70, label:"码头（不接谎的船）"},
];
function scTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":SCHERIA[cy][cx]; }
function tryMoveScheria(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (SCSOLID.has(scTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}

/* ==================== 伊萨卡地图（2.5D · 黎明青灰 · 终章） ====================
   ~水 T 橄榄 P 宴厅 X 斧阵 C 织机 H 乞丐斗篷 _ 码头 . 场地 , 小径
   原版骨：化名乞丐→十二斧→肃清→相认（荷马史诗第 21-22 卷；第 19/23 卷佩涅洛佩先考脚疤与婚床）
   玩法：A 路（化名→求婚者考场→十二斧→佩涅洛佩相认三问「疤/床/名」）/ B 路（码头转身，把家安在别处） */
const ITHACA = [
  "~~~~~~~~~~~~~~~~~~~~",
  "~T..PPPPPPPP...TT..~",
  "~..PPPPPPPPPP......~",
  "~..PP.PPPPPPP......~",
  "~....,.............~",
  "~....,...XXX.......~",
  "~....,.............~",
  "~....,....C.....H..~",
  "~..__,.............~",
  "~..___,,...........~",
  "~......,...........~",
  "~~~_,,~~~~~~~~~~~~~~",
];
const ITSOLID = new Set(["~","T","P","X","C"]);
const penelopeSpot = { x: 11*ATS+ATS/2, y: 7*ATS+ATS/2 };
const ITSPOTS = [
  {type:"suitors",  x:6*ATS+ATS/2,     y:3*ATS+ATS*0.85,  r:95, label:"宴厅里的求婚者"},
  {type:"axes",     x:11*ATS+ATS/2,    y:5*ATS+ATS/2,     r:85, label:"十二斧阵"},
  {type:"penelope", x:penelopeSpot.x,  y:penelopeSpot.y,  r:80, label:"楼上织机旁的人"},
  {type:"telemachus", x:15*ATS+ATS/2,  y:6*ATS+ATS/2,     r:80, label:"寻找父亲的年轻人"},
  {type:"cloak",    x:17*ATS+ATS/2,    y:7*ATS+ATS/2,     r:70, label:"乞丐的斗篷与杖"},
  {type:"itDock",   x:4*ATS+ATS/2,     y:10*ATS+ATS/2,    r:70, label:"码头（转身，或归乡）"},
];
function itTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":ITHACA[cy][cx]; }
function tryMoveIthaca(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (ITSOLID.has(itTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}

/* ==================== 序章组 · 奥德修斯的航迹（2026-11-07） ====================
   #1 伊斯玛洛斯 / #3 食莲岛 / #4 独眼巨人之岛 / #6 忒勒皮洛斯（#2 马里阿角为海域事件，无地图）
   定位：旧路重访——你就是奥德修斯本人，这些岛是你自己走过的路（2026-11-08 拍板）。每站一个主题：贪 / 忘忧 / 名 / 毁灭。
   红线：不重演戳瞎事件；波吕斐摩斯不可被攻击；波塞冬只作环境级显形（odyssey-story.md 序章组）。 */
const PROLOGUE_SITES = {
  ismaros: {
    name:"伊斯玛洛斯", zone:"伊斯玛洛斯 · 喀科恩人的城", tint:"#3d4c5c", npc:"rebuilder", spawn:[3,9.5],
    chapterImg:"concept-art/prologue/p1-伊斯玛洛斯.jpg",
    kicker:"序 章 组 · 其 一", chapterSub:"第一次劫掠 · 贪的第一课",
    quote:"「那伙人抢完了酒还赖着庆功——所以我们反了他们。拿得下的东西，守不守得住，是两回事。」",
    solid:new Set(["~","W","T","M","X"]),
    map:[
      "~~~~~~~~~~~~~~~~~~~~",
      "~WW..WW....TT......~",
      "~WW..WW....T.......~",
      "~..WWWW...,........~",
      "~....WW...,....M.M.~",
      "~...WWWW..,..MMMM..~",
      "~....WW...,..X.....~",
      "~........,......TT.~",
      "~..T.....,....T....~",
      "~..___,,...........~",
      "~~~_,,~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
    ],
    spots:()=>[
      {type:"rebuild", x:10*ATS+ATS/2, y:2*ATS+ATS/2, r:80, label:"与重建者交谈"},
      {type:"wounded", x:9*ATS+ATS/2,  y:4*ATS+ATS/2, r:70, label:"给伤者上药"},
      {type:"target",  x:13*ATS+ATS/2, y:6*ATS+ATS/2, r:70, label:"木靶练手"},
      {type:"wine",    x:16*ATS+ATS/2, y:4*ATS+ATS/2, r:70, label:"战利品堆旁的酒瓶"},
      {type:"campfire",x:7*ATS+ATS/2,  y:8*ATS+ATS/2, r:70,
        label: state.campHeld ? "营火（已守过那一夜）" : "营火（夜里会有人来抢酒）"},
      {type:"dock",    x:4*ATS+ATS/2,  y:10*ATS+ATS/2, r:70, label:"扬帆出海"},
    ],
  },
  lotus: {
    name:"食莲岛", zone:"食莲岛 · 忘忧的甜", tint:"#7fa8a0", npc:"lotusman", spawn:[3,7.5],
    chapterImg:"concept-art/prologue/p3-食莲岛.jpg",
    kicker:"序 章 组 · 其 三", chapterSub:"忘忧的甜 · 代价是记忆",
    quote:"「家？我们就是在回家啊——这里就是家。」",
    solid:new Set(["~","T","W"]),
    map:[
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~..LLLL....TT......~",
      "~.LLLLLL...........~",
      "~..LLLL....LL......~",
      "~........,.....B...~",
      "~..___,,...........~",
      "~..___,,......LL...~",
      "~~.,,~~~~~~LL~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
    ],
    spots:()=>[
      {type:"lotusman", x:16*ATS+ATS/2, y:5*ATS+ATS/2, r:85, label:"与幸存者交谈"},
      {type:"lotusEat", x:6*ATS+ATS/2,  y:4*ATS+ATS/2, r:70, label:"尝一颗莲子"},
      {type:"lotusDrag",x:9*ATS+ATS/2,  y:6*ATS+ATS/2, r:70, label:"拖他上船"},
      {type:"dock",     x:4*ATS+ATS/2,  y:6*ATS+ATS/2, r:70, label:"扬帆出海"},
    ],
  },
  cyclops: {
    name:"独眼巨人之岛", zone:"独眼巨人之岛 · 无人之名", tint:"#413a38", npc:"polyphemus", spawn:[3,7.5],
    chapterImg:"concept-art/prologue/p4-独眼巨人岛.jpg",
    kicker:"序 章 组 · 其 四", chapterSub:"无人之名 · 海替所有人记账",
    quote:"「『没有人』伤害我！——神明也没听懂我的祈祷。」",
    solid:new Set(["~","R","C"]),
    map:[
      "~~~~~~~~~~~~~~~~~~~~",
      "~RR........RR......~",
      "~RR.......RRR......~",
      "~..RRR....CR.......~",
      "~.......,..........~",
      "~..C....,....SSSS..~",
      "~..___,,....SSSSS..~",
      "~..___,,.....SSS...~",
      "~~.,,~~~~~~~SS~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
    ],
    spots:()=>[
      {type:"cave",   x:10*ATS+ATS/2, y:3*ATS+ATS/2, r:85, label:"山洞口（熏黑的巨灶）"},
      {type:"poly",   x:5*ATS+ATS/2,  y:5*ATS+ATS/2, r:95, label:"走近牧羊巨人"},
      {type:"sheep",  x:14*ATS+ATS,   y:6*ATS+ATS/2, r:75, label:"羊群（剪一把羊毛）"},
      {type:"ramhide",x:16*ATS+ATS/2, y:5*ATS+ATS/2, r:75,
        label: state.ramHide ? "洞口的羊道（你从这混出过）" : (state.polHeard ? "羊腹之下（绑上羊肚混出洞）" : "羊群（巨人还醒着）")},
      {type:"dock",   x:4*ATS+ATS/2,  y:6*ATS+ATS/2, r:70, label:"解缆离岛"},
    ],
  },
  telepylos: {
    name:"忒勒皮洛斯", zone:"忒勒皮洛斯 · 悬崖之城", tint:"#5c6470", npc:null, spawn:[3,5.5],
    chapterImg:"concept-art/prologue/p6-忒勒皮洛斯.jpg",
    kicker:"序 章 组 · 其 六", chapterSub:"悬崖之城 · 十一艘船只剩一艘",
    quote:"「十一个人里，只有他记得打这个结。」",
    solid:new Set(["~","C","W","R"]),
    map:[
      "~~~~~~~~~~~~~~~~~~~~",
      "~CCCC..CCCC..CCCC..~",
      "~CCCC..CCCC..CCCC..~",
      "~......R...........~",
      "~..___,R....WW.....~",
      "~..___,,...WW......~",
      "~~.,,~~~~~~W~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
    ],
    spots:()=>[
      {type:"cliff",  x:8*ATS+ATS/2,  y:3*ATS+ATS/2, r:75, label:"崖下险道（巨影在崖顶）"},
      {type:"wreck",  x:12*ATS+ATS/2, y:4*ATS+ATS/2, r:80, label:"最后一艘船的残骸"},
      {type:"fleetguard", x:7*ATS+ATS/2, y:5*ATS+ATS/2, r:85,
        label: state.fleetGuard==="done" ? "船队锚地（浪里的残骸）" : (state.fleet>0 ? "船队锚地（守住你的船队）" : "船队锚地（空的）")},
      {type:"dock",   x:4*ATS+ATS/2,  y:4*ATS+ATS/2, r:70, label:"解缆离岛"},
    ],
  },
  /* —— 特洛伊（#0 启航之地 · 木马之夜 · 2026-11-08 用户拍板开放为开篇战役）——
     原著流程：厄佩俄斯造马 → 献策 → 藏勇士入马 → 特洛伊人拖马入城 → 夜袭混战 → 屠城抉择 → 率 12 艘船出海 */
  troy: {
    name:"特洛伊", zone:"特洛伊平原 · 十年围城", tint:"#54453a", npc:"epeius", spawn:[3,8.5],
    chapterImg:"concept-art/prologue/p2-木马之夜.jpg",
    kicker:"序 章 · 战 争", chapterSub:"木马之夜 · 你的成名之计",
    quote:"「这匹马是献给雅典娜的赔礼——把它拖进城去。」",
    solid:new Set(["~","C","G","T","B","W","H"]),
    map:[
      "~~~~~~~~~~~~~~~~~~~~",
      "~CCCCCGGGGCCCC.....~",
      "~CCCCCGGGGCCCC.FF..~",
      "~......,......FFF..~",
      "~..,...........FF..~",
      "~..,...H...........~",
      "~..B....H......PP..~",
      "~..BB...,..........~",
      "~..___,,.......TT...~",
      "~~~_,,~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~",
    ],
    spots:()=>{
      const arr=[
        {type:"epeius", x:7*ATS+ATS/2,  y:6*ATS+ATS/2, r:85, label:"与造马师厄佩俄斯交谈"},
        {type:"wood",   x:4*ATS+ATS/2,  y:5*ATS+ATS/2, r:70, label:"伐木（造马木料）"},
        {type:"horse",  x:8*ATS+ATS/2,  y:5*ATS+ATS/2, r:95, label:"木马"},
        {type:"torch",  x:13*ATS+ATS/2, y:3*ATS+ATS/2, r:75, label:"城墙上的火把"},
        {type:"dock",   x:3*ATS+ATS/2,  y:8*ATS+ATS/2, r:70, label:"出海（船队整帆）"},
      ];
      /* 夜袭阶段：城内卫兵为可攻击实体（boar 同款 E 键结算） */
      TROY_GUARDS.forEach((g,i)=>{ if(g.alive && state.troyStage===3)
        arr.push({type:"guard", gi:i, x:g.x, y:g.y, r:55,
          label:`攻击特洛伊卫兵（血 ${g.hp}/${g.max}）`}); });
      return arr;
    },
  },
};
/* 特洛伊卫兵：夜袭混战实体（轻量——静态站位+命中反馈+血条；完整 FSM 野猪已有，此为群战版） */
const TROY_GUARDS = [
  {x:11*ATS+ATS/2, y:3*ATS+ATS/2, hp:24, max:24, alive:true,  hitAt:0},
  {x:14*ATS+ATS/2, y:3*ATS+ATS/2, hp:24, max:24, alive:true,  hitAt:0},
  {x:12*ATS+ATS/2, y:4*ATS+ATS/2, hp:24, max:24, alive:true,  hitAt:0},
  {x:15*ATS+ATS/2, y:4*ATS+ATS/2, hp:30, max:30, alive:true,  hitAt:0},
];
function resetTroyGuards(){ TROY_GUARDS.forEach(g=>{ g.hp=g.max; g.alive=true; g.hitAt=0; }); }
/* ==================== F2 忒勒皮洛斯守船战（17h 船队折损接线，game-feel 快反） ====================
   原著第 9 卷：崖顶巨石一夜砸碎 11 艘仅剩 1。玩法：石头锁定哪艘船（0.9s 红圈预警），跑到它旁边
   把船拖下水——救回几艘算几艘（state.fleet=救回数，旗舰永不沉 → 下限 1）。守不住=原著 canon，
   守住大半=改写。接 HUD「⛵ 船队 x/12」与终章船队判词（判词已支持 12/1..11/0 三档）。 */
const FD = { on:false, t:0, wave:0, saved:0, lost:0, boats:[], target:null, phase:"idle", pt:0, done:false };
const FD_WAVES = 10, FD_WARN = 1.0;
function fdBoatRow(){
  const y = 6*ATS + ATS*0.42, arr = [];
  for (let i=0;i<12;i++){
    let x = (2.1 + i*1.28)*ATS;
    if (x > 10.4*ATS && x < 13.2*ATS) x += 1.7*ATS;   /* 避开船骸残片区（W 瓦片） */
    arr.push({x, y, st:"alive"});                     /* st: alive / saved / wreck */
  }
  return arr;
}
function startFleetDefense(){
  if (scene!=="telepylos" || FD.on) return;
  if (state.fleetGuard==="done"){ toast(`船骸在浪里排成一排——那一夜你带回了 ${state.fleet} 艘。海记得每一艘。`); return; }
  if (!(state.fleet>0)){ toast("锚地空空——你的十二艘船还在特洛伊的海湾里。先去 #0 特洛伊把它们带出来。"); return; }
  FD.on=true; FD.t=0; FD.wave=0; FD.saved=0; FD.lost=0; FD.done=false;
  FD.boats=fdBoatRow(); FD.target=null; FD.phase="idle"; FD.pt=0;
  sfx("warn"); feedback("medium");
  toast("崖顶的巨影直起身来——石头要落了。石头锁定哪艘船，就跑到它身边把它拖下水！（跑得越快，带回的船越多）");
}
function fleetDefenseTick(dt){
  if (!FD.on) return;
  if (dlgOpen||titleOn||chapterOn||mapOpen) return;   /* 界面打开冻结波次（与 F5/F3/F4/F6 同款门控；开海图看船位不再被巨石偷家） */
  FD.t += dt; FD.pt += dt;
  if (FD.phase==="idle"){
    if (FD.wave >= FD_WAVES || !FD.boats.some(b=>b.st==="alive")){ fdFinish(); return; }
    const alive = FD.boats.filter(b=>b.st==="alive");
    FD.target = alive[(FD.wave*7+3) % alive.length];
    FD.phase="warn"; FD.pt=0; sfx("alert");
  } else if (FD.phase==="warn"){
    if (FD.pt >= FD_WARN){
      FD.phase="idle"; FD.pt=0;
      const b=FD.target, d=Math.hypot(aiaPlayer.x-b.x, aiaPlayer.y-b.y);
      burst(b.x, b.y-6, "#7d94a8", 14, 90, 2.6);
      if (d < 46){ b.st="saved"; FD.saved++; sfx("pick"); popText(b.x, b.y-24, "拖下水了！", "#7fd0a0"); }
      else { b.st="wreck"; FD.lost++; sfx("die"); popText(b.x, b.y-24, "碎了", "#e08080"); }
      if (d >= 46 && d < 60){ state.hp = Math.max(1, state.hp-6); addTrauma(0.1); popText(aiaPlayer.x, aiaPlayer.y-30, "-6", "#e08080"); }
      FD.wave++; renderHUD();
    }
  }
}
function fdFinish(){
  FD.on=false; FD.done=true;
  state.fleet = Math.max(1, FD.saved);
  state.fleetGuard = "done";
  const canon = state.fleet<=2;
  gainXp(canon?30:45);
  addMemory(canon
    ? `忒勒皮洛斯一夜，崖顶的巨石砸碎了大半船队——只剩 ${state.fleet} 艘。同伴的名字沉在水里`
    : `忒勒皮洛斯一夜，你从巨石的雨里拖回了 ${state.fleet} 艘船——荷马没敢写这一页`, 4, "telepylos");
  sfx(canon?"die":"bless"); feedback("large");
  toast(canon
    ? `天亮了。滩上只剩 ${state.fleet} 艘船——和荷马写的一样：十一艘的债。（航序 #6 · 历练 +30）`
    : `天亮了。滩上立着 ${state.fleet} 艘船——巨石的雨没能砸碎你的航程。（改写 · 航序 #6 · 历练 +45）`);
  renderHUD(); save();
}
function proTile(s,cx,cy){ const m=PROLOGUE_SITES[s].map; return (cy<0||cy>=m.length||cx<0||cx>=m[cy].length)?"~":m[cy][cx]; }
function tryMovePrologue(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (PROLOGUE_SITES[scene].solid.has(proTile(scene, Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}
function PROLOGUE_SPOTS(){ return PROLOGUE_SITES[scene].spots(); }
/* 航序系统：点亮 + 海图「奥德修斯航迹」计数（探险大陆：点亮不分先后，海图按序推荐） */
const LEG_SEQ = {troy:0, ismaros:1, malea:2, lotus:3, cyclops:4, aeolia:5, telepylos:6, aia:7, hades:8, strait:9, sun:11, ogggia:12, scheria:13, ithaca:14};
const LEG_NAME = {ismaros:"#1 伊斯玛洛斯", malea:"#2 马里阿角", lotus:"#3 食莲岛", cyclops:"#4 独眼巨人", aeolia:"#5 风神岛", telepylos:"#6 忒勒皮洛斯", aia:"#7 埃阿亚", hades:"#8 冥界", strait:"#9/10 声之海峡", sun:"#11 太阳岛", ogggia:"#12 奥吉吉亚", scheria:"#13 斯克里", ithaca:"#14 伊萨卡", troy:"#0 特洛伊海岸"};
function markLeg(k){
  if (!k || !state.legs) return;
  if (state.legs[k]) return;
  state.legs[k]=1;
  recordTrail(k);
  addMemory(`旅人把 ${LEG_NAME[k]||k} 走进了自己的航程（航序点亮）`, 1, "sea");
  arrivalSplash(k);   /* 到港仪式感：首航到港＝奖励时刻（岛名+一句注脚+号角，3.2s 自散） */
  save();
}
/* 到港仪式卡：Wind Waker 的岛名弹出 / Spiritfarer 的到港小过场——把「抵达」做成奖励（调研批 #3） */
let _arrivalEl = null;
function arrivalSplash(k){
  const is = ISLANDS.find(x=>x.scene===k);
  const name = is ? is.name : "";
  if (!name) return;   /* 非岛屿场景（malea 等航段旗标）不弹卡 */
  if (!_arrivalEl){
    _arrivalEl = document.createElement("div");
    _arrivalEl.id = "arrival";
    const stage = document.getElementById("stage");
    (stage||document.body).appendChild(_arrivalEl);
  }
  _arrivalEl.innerHTML = `<div class="arLeg">${LEG_NAME[k]||"到港"}</div><div class="arName">${name}</div>`+(is.note?`<div class="arNote">${is.note}</div>`:"");
  _arrivalEl.classList.remove("play"); void _arrivalEl.offsetWidth;   /* 强制重排以重启动画（连跳两岛不粘连） */
  _arrivalEl.classList.add("play");
  sfx("bless");
}
function legsVisitedCount(){ return Object.keys(state.legs).filter(k=>LEG_SEQ[k]!==undefined && state.legs[k]).length; }
/* ==================== P1.1 船员账本（17g 原著对齐：状态/HUD/横幅/记忆四件套的唯一入口） ====================
   语义：crew=旗舰班底 12 人（特洛伊出海点亮）。沉船折算进船队账（fleet），班底随旗舰走——
   原著减员三挂点：独眼巨人 -6 → 斯库拉 -6 → 太阳岛雷劈清零；终章判词「你带回来 N 个人」。 */
/* 船员名册：旗舰班底十二人的静态名单（复活段判词点名；折损从名册末尾除名） */
const CREW_ROSTER = ["欧律洛科斯","厄尔珀诺耳","波利忒斯","欧律巴忒斯","门托耳","吕孔","安菲翁","堤丢斯","瑙西托斯","埃托洛斯","克瑞翁","波吕多罗斯"];
const CREW_ROLES = [
  "副手 · 常替你唱反调", "年轻桨手 · 盼着回家", "斥候 · 先听林里的脚步", "传令官 · 船头船尾的嗓门",
  "老桨手 · 认得每一种逆风", "瞭望手 · 总能先看见礁影", "修船匠 · 随身带着麻绳", "舵手 · 浪里也不松舵",
  "桨手 · 歌记得比路多", "厨子 · 把最后一块面包分半", "矛手 · 守夜从不先睡", "桨手 · 名字刚写进船册",
];
/* 存活与折损永远互补。旧档只有存活名单时也能无损补回名字，但不臆造具体死因。 */
function syncCrewLosses(){
  if (!state.crewLit){ state.crewLost=[]; return; }
  const alive=new Set(Array.isArray(state.crewList)?state.crewList:[]);
  const previous=new Map();
  for (const entry of (Array.isArray(state.crewLost)?state.crewLost:[])){
    if (entry && CREW_ROSTER.includes(entry.name)) previous.set(entry.name,entry);
  }
  state.crewLost=CREW_ROSTER.filter(name=>!alive.has(name)).map(name=>previous.get(name)||{
    name, why:"旧航程中的折损（早期存档未记录详情）", clock:null,
  });
}
function crewLedgerLight(){
  if (state.crewLit) return;
  state.crewLit = true;
  let c = 12;
  if (state.crewCyclops) c -= 6;                             /* 出海前已走过独眼巨人的旧账 */
  if (state.crewScylla) c -= 6;                              /* 出海前已硬闯海峡的旧账 */
  if (state.sunWrath) c = 0;                                 /* 雷劈清零 */
  state.crew = Math.max(0, c);
  if (!Array.isArray(state.crewList)) state.crewList = CREW_ROSTER.slice(0, state.crew);
  state.crewList = state.crewList.slice(0, state.crew);
  syncCrewLosses();
}
function loseCrew(n, why){
  const before = state.crew||0;
  const lost = Math.min(before, n);
  if (lost<=0) return 0;
  if (!Array.isArray(state.crewList)) state.crewList = CREW_ROSTER.slice(0, before);
  const removed = state.crewList.splice(-lost);
  state.crew = before - lost;
  if (!Array.isArray(state.crewLost)) state.crewLost=[];
  for (const name of removed) state.crewLost.push({name,why,clock:Math.floor(state.clock||0)});
  syncCrewLosses();
  sfx("die");
  showCrewBanner(lost, why, removed);
  addMemory(`${why}——${lost} 名船员没能回来${removed.length?`（${removed.join("、")}）`:""}（船员 ${state.crew}/12）`, 5, "crew");
  renderHUD(); save();
  return lost;
}
let crewBannerTimer=null;
function showCrewBanner(lost, why, names){
  let el=document.getElementById("crewBanner");
  if (!el){ el=document.createElement("div"); el.id="crewBanner"; document.getElementById("stage").appendChild(el); }
  el.innerHTML = `<b>⚑ 折损 · 船员 −${lost}</b><span>${why}${names&&names.length?`（${names.join("、")}）`:""}</span>`;
  el.classList.remove("show"); void el.offsetWidth;          /* 重启动画 */
  el.classList.add("show");
  clearTimeout(crewBannerTimer);
  crewBannerTimer=setTimeout(()=>el.classList.remove("show"), 4600);
}
function enterPrologue(key){
  const p=PROLOGUE_SITES[key];
  scene = key;
  aiaPlayer.x = p.spawn[0]*ATS+ATS/2; aiaPlayer.y = p.spawn[1]*ATS+ATS/2;
  markLeg(key);
  save();
  if (!state.legs["seen_"+key]){
    state.legs["seen_"+key]=1; save();
    showChapter(p.chapterImg, p.kicker, p.name.split("").join(" "), p.chapterSub, p.quote);
  } else {
    toast(`${p.name} —— 潮声跟来时一样。（M 海图 · 航序 ${(LEG_SEQ[key]!==undefined?"#"+LEG_SEQ[key]:"")}）`);
  }
}
/* 马里阿角（#2 海域事件）：船行至伯罗奔尼撒南端触发听风试炼（不登陆） */
const MALEA_SPOT = {x:19.5*WTS, y:10.5*WTS};
function maleaTick(){
  if (state.maleaDone || scene!=="world") return;
  if (Math.hypot(boat.x-MALEA_SPOT.x, boat.y-MALEA_SPOT.y) < 190){   /* 批次 H9：同瓦距翻倍 */
    state.maleaDone = true; markLeg("malea"); gainXp(15);
    addMemory("旅人在马里阿角的风暴里学会了读风——海记得每一次转向", 2, "storm");
    toast("海雾骤起，双重风暴前后夹来——你贴着风向转了九次，船头终于咬住了浪缝。（听风试炼 · 历练 +15 · 航序 #2 点亮）");
    sfx("warn"); renderHUD(); save();
  }
}
/* ==================== 主航程 / 自由航行·海面遭遇（里程节奏 + 种子化，零模型） ====================
   序章三拍结束后，主航程与自由漂流共用：开阔海真实航行累计里程即触发一次，
   由「船位瓦片 × 已遇次数」决定种子化遭遇。确定性可复现、无定位冲突、节奏随次数拉长。 */
const SEA_ENCOUNTS = [
  { id:"storm", name:"风暴",
    memo:"风暴里你的船头咬住了浪缝——海认得你",
    choices:[
      {label:"压浪硬闯", hint:"快点，但伤船伤人", fn:()=>{ state.hp = Math.max(1, state.hp-6); state.thirst = Math.max(0, state.thirst-12); gainXp(8);
        return "风暴把浪堆成尖，你压住湿桅、船头咬进浪缝，海又退回海里。（血 -6 · 口渴 -12 · 历练 +8）"; }},
      {label:"收帆硬扛", hint:"慢些，稳些", fn:()=>{ state.thirst = Math.max(0, state.thirst-16); gainXp(3);
        return "你收了帆，任浪把船推来搡去——慢，但船板一块没裂。水多喝了几口，路多漂了一段。（口渴 -16 · 历练 +3）"; }},
    ] },
  { id:"merchant", name:"商船",
    memo:"商船把你当成了熟路的客人",
    choices:[
      {label:"买一捆治疗草药（12 德拉克）", hint:"熟路的客人价", fn:()=>{ if ((state.coins||0) < 12)
          return "你翻遍钱袋也凑不出 12 枚——船长耸耸肩：「下回带钱来。」";
        state.coins-=12; addItem("治疗草药");
        return "商船靠过来：「熟路的客人。」你 12 德拉克换了一捆治疗草药——海上总得有人傍身。（金币 -12 · 治疗草药 +1）"; }},
      {label:"指条避风水道（收 4 德拉克）", hint:"海记得送过人的人", fn:()=>{ state.coins = (state.coins||0)+4;
        return "商船想抄你的熟路。你指了条避风的水道，它送你 4 德拉克——海记得送过人的人。（金币 +4）"; }},
    ] },
  { id:"seabird", name:"海鸟",
    memo:"海鸟衔着橄榄枝——它记得风往哪边吹",
    choices:[
      {label:"跟着鸟偏半舱", hint:"有漂来的东西", fn:()=>{ addItem("面包"); state.thirst = Math.min(100, state.thirst+10);
        return "海鸟衔着橄榄枝领你偏了半舱，你捞到一只漂来的木箱——里面是块还没受潮的干粮。（面包 +1 · 口渴 +10）"; }},
      {label:"不追了，赶路要紧", hint:"海鸟自有海鸟的去处", fn:()=>{ gainXp(3);
        return "你目送海鸟远去，把船头摆回原来的方向。它有它的去处，你有你的。（历练 +3）"; }},
    ] },
  /* —— 自由航行扩容批（80 Days 式文字卡：事件密度 3→7，免得终章后每 3 秒一遇全是风暴/商船轮换）—— */
  { id:"dolphin", name:"海豚",
    memo:"海豚在船头浪里引路——海神座前的使者不拦你",
    apply:function(){ gainXp(6);
      return "一群海豚追上船头的浪，跳跃的方向和你去的是同一头。水手说这是好兆头——你没反驳。（历练 +6）"; } },
  { id:"headwind", name:"逆风",
    memo:"风从家的方向吹来——你松了半帆，多漂了一夜",
    apply:function(){ state.thirst = Math.max(0, state.thirst-8); gainXp(4);
      return "风改了主意，从你要去的地方迎面吹来。你松了半帆，多漂了一夜——水少了些，路还是那条。（口渴 -8 · 历练 +4）"; } },
  { id:"offering", name:"祭品箱",
    memo:"你捞起了漂在海上的祭品箱——神明不与旅人计较",
    apply:function(){ state.coins = (state.coins||0)+5;
      return "浪送来一只描金的木箱——某座庙里漂出来的祭品。你掂了掂：神明不与旅人计较这几枚。（金币 +5）"; } },
  { id:"glasscalm", name:"死寂",
    memo:"海静得像一面镜子——你在寂静里听了一夜潮声",
    apply:function(){ state.thirst = Math.max(0, state.thirst-6);
      return "风停了。海静得能听见桅杆吱呀、和很远很远的水声。船员们都不说话——这样的寂静，跑过海的人都懂。（口渴 -6）"; } },
  { id:"wreckboat", name:"遇难小艇",
    memo:"空艇在浪上打转——船上的人已经不在了",
    choices:[
      {label:"登艇搜刮", hint:"金币与半囊淡水", fn:()=>{ state.coins=(state.coins||0)+6; addItem("淡水"); gainXp(3);
        return "你攀上残存的艇帮：干粮早就泡烂，只摸出 6 枚德拉克马和半囊淡水。（金币 +6 · 淡水 +1 · 历练 +3）"; }},
      {label:"放生绕行", hint:"不碰亡者的船", fn:()=>{ gainXp(4);
        return "你绕开那艘空艇，朝它念了一句告别的话。海记得不趁火打劫的人。（历练 +4）"; }},
    ]},
];
let _seaAcc = 0, _lastBoat = null;
function seaEncounterTick(){
  if (scene!=="world"){ _seaAcc = 0; _lastBoat = null; return; }
  /* 主航程与自由漂流共用原有海遇；开场三拍结束后再让海参与进来 */
  if ((state.openingBeat??3)<3 || dlgOpen || titleOn || chapterOn || mapOpen) return;
  const ch = worldTile(Math.floor(boat.x/WTS), Math.floor(boat.y/WTS));
  if (ch==="#"||ch==="X"||ch==="G"){ _seaAcc = 0; return; }          /* 陆地不蓄能 */
  if (!_lastBoat) _lastBoat = {x:boat.x, y:boat.y};
  const dx = boat.x-_lastBoat.x, dy = boat.y-_lastBoat.y;
  _lastBoat = {x:boat.x, y:boat.y};
  const step=Math.hypot(dx,dy);
  if (step>60){ _seaAcc=0; return; }   /* 读档/直航/调试落点不算真实划过的海 */
  if (step) _seaAcc += step;
  const mul = (typeof seaEncounterMul==="function") ? seaEncounterMul() : 1;   /* 航路姿态：沿岸 1.45（更少）/ 迷雾 0.62（更密） */
  if (_seaAcc >= (state.seaThreshold||900) * mul){ _seaAcc = 0; doSeaEncounter(); }
}
function finishSeaEnc(e, r){
  if (!state.seaEncDone) state.seaEncDone = {};
  const fresh = !state.seaEncDone[e.id];
  state.seaEncDone[e.id] = 1;
  addMemory(e.memo, fresh?2:1, "sea");
  state.seaThreshold = Math.min(1600, (state.seaThreshold||900)+60);   /* 节奏批：300px≈2.7s 一遇太密（110px/s 航速）；900px≈8s 起步、上限 1600≈15s，风暴不再滚雪球 */
  if (typeof recordSeaEcho==="function") recordSeaEcho(e);   /* 海图上的事件回声：位置可回看 */
  let bonus = "";
  if (typeof seaRouteKey==="function" && seaRouteKey()==="mist"){ gainXp(2); bonus = " · 迷雾航路 历练 +2"; }
  toast((fresh?e.name:(e.name+"（又遇）")) + " · " + r + bonus);
  sfx(e.id==="storm"?"warn":"alert"); renderHUD(); save();
}
function doSeaEncounter(){
  if ((state.openingBeat??3)<3) return;
  const sx = Math.floor(boat.x/WTS), sy = Math.floor(boat.y/WTS);
  const seed = (((sx*73856093) ^ (sy*19349663) ^ ((state.seaEncCount||0)*83492791))) >>> 0;
  const doneMap = state.seaEncDone || {};
  const freshPool = SEA_ENCOUNTS.filter(function(e){ return e.id!==state.seaLastEnc && !doneMap[e.id]; });
  let pool = freshPool.length ? freshPool : SEA_ENCOUNTS.filter(function(e){ return e.id!==state.seaLastEnc; });
  /* 航路姿态影响「遇见什么」：迷雾里多半是风暴/逆风/遇难艇，沿岸则多是商船/海鸟/海豚 */
  if (typeof seaRouteKey==="function" && typeof seaRouteHazard==="function"){
    const HAZARD_IDS = ["storm","headwind","wreckboat"];
    const hazard = pool.filter(function(e){ return HAZARD_IDS.indexOf(e.id)>=0; });
    const calm = pool.filter(function(e){ return HAZARD_IDS.indexOf(e.id)<0; });
    if (seaRouteKey()==="mist" && hazard.length && Math.random() < seaRouteHazard()) pool = hazard;
    else if (seaRouteKey()==="coast" && calm.length && Math.random() > seaRouteHazard()) pool = calm;
  }
  const e = pool[seed % pool.length];
  state.seaLastEnc = e.id;
  state.seaEncCount = (state.seaEncCount||0)+1;
  if (e.choices){   /* 二选一海遇：抉择走选择卡，结算回调里落状态/记忆/阈值 */
    showAsk(state.freeSail?"自由航行 · 海面遭遇":"主航程 · 海面遭遇", e.name, "海面上漂着些东西——", e.memo,
      e.choices.map(c=>({label:c.label, hint:c.hint, fn:()=>finishSeaEnc(e, c.fn())})),
      "sea_"+e.id);   /* 抉择回声：海遇抉择统一以 sea_<id> 为键 */
    return;
  }
  finishSeaEnc(e, e.apply());
}
/* ==================== P1.6 波塞冬掀筏+获救（17g 原著第 5 卷 · F7「波塞冬的浪」Boss 环境战） ====================
   出湾后开阔海，波塞冬从独眼巨人山归来发现你——三连浪＝读风考试（malea 教学收束：暗线③「最后一程只能
   自己吹一口气」）。筏散是必然（原著）；分水岭在面纱：白手圣母伊诺两次赠纱，先疑（原著第一次拒绝）→
   灰眼睛促收（P2.1 灰袍引路人·掀筏念白落地）→ 收＝canon 游三天漂到斯克里近海；两次都拒＝沉海 dev，
   海把你推回奥吉吉亚重新造筏（卡吕普索：「我说过，海记你的账」）。风暴未渡过前每次出湾都会再遇。 ==================== */
const OGGIA_EXIT = isleOff("ogggia", 0, 0);   /* 奥吉吉亚岛心＝出湾推筏起点（批次 K2：随岛坐标派生） */
let _raftStormT = 0;
function raftStormTick(dt){
  if (scene!=="world" || !state.ogygiaLeft || state.raftStormDone){ _raftStormT = 0; return; }
  if (dlgOpen || titleOn || chapterOn || mapOpen) return;   /* 界面全清才蓄力（海遇/malea 同款门控） */
  const ch = worldTile(Math.floor(boat.x/WTS), Math.floor(boat.y/WTS));
  if (ch==="#"||ch==="X"||ch==="G") return;                 /* 陆地/贴岛不触发 */
  if (Math.hypot(boat.x-OGGIA_EXIT.x, boat.y-OGGIA_EXIT.y) < 340) return;   /* 批次 H9：同瓦距翻倍 */
  _raftStormT += dt;
  if (_raftStormT >= 1.2){ _raftStormT = 0; doRaftStorm(); }
}
function raftFx(on){
  let el = document.getElementById("raftStormFx");
  if (!el){ el=document.createElement("div"); el.id="raftStormFx"; document.getElementById("stage").appendChild(el); }
  el.classList.toggle("show", !!on);
}
function doRaftStorm(){
  waveSfx(); addTrauma(0.55); raftFx(true);
  addMemory("海变了脸——三面的浪同时立起来。波塞冬从独眼巨人的山路上回来，看见了你的筏", 4, "poseidon");
  showAsk("第 五 章 · 波 塞 冬 的 浪","第 一 道 浪",
    "浪墙从左舷立起来，比桅杆还高。风向纹在西——马里阿角教过你：贴着风，把船头咬进浪缝。",
    "「躲得过大石，躲不过海。」有人在浪底冷冷地说。", [
    {label:"满舵迎浪，船头咬进浪缝", hint:"读风 · 马里阿角学的", fn:()=>{
      sfx("attack"); addTrauma(0.45); waveTwo(); }},
    {label:"侧身让开浪头", hint:"……筏太轻了", fn:()=>{
      state.hp=Math.max(1,state.hp-8); sfx("hurt"); addTrauma(0.7); feedback("large"); renderHUD();
      toast("侧舷受浪——整张筏斜起来，半边被浪舌舔走。（血 -8）");
      waveTwo(); }},
  ]);
}
function waveTwo(){
  showAsk("第 五 章 · 波 塞 冬 的 浪","第 二 道 浪",
    "第二道浪叠着第一道的脊背。你亲手捆的筏——绳结吃水越深，咬得越牢。",
    null, [
    {label:"把储粮推到筏心压舱，人坐低", hint:"自己捆的绳结，认得", fn:()=>{
      sfx("attack"); addTrauma(0.45); waveThree(); }},
    {label:"卸下一根木料减重", hint:"让它浮得更高", fn:()=>{
      state.hp=Math.max(1,state.hp-8); sfx("hurt"); addTrauma(0.7); feedback("large"); renderHUD();
      toast("筏身一轻就被浪掀了半转——柴是柴，不是压舱石。（血 -8）");
      waveThree(); }},
  ]);
}
function waveThree(){
  showAsk("第 五 章 · 波 塞 冬 的 浪","第 三 道 浪",
    "第三道浪比前两道都高——高到遮住了天。风袋在你包里，是空的：这一程，没有神替你吹风。",
    "（暗线③的收束：袋空了，只能你自己吹一口气——那才是你的风。）", [
    {label:"对着浪，你自己吹一口气", hint:"你的风 · 暗线③收束", fn:()=>{
      sfx("bless"); addTrauma(0.5); raftBreak(); }},
    {label:"把空风袋扔进海里祭浪", hint:"……它不欠你了", fn:()=>{
      state.hp=Math.max(1,state.hp-8); sfx("hurt"); addTrauma(0.8); feedback("large"); renderHUD();
      toast("浪把风袋卷走的同一瞬，也掀了筏角。（血 -8）");
      raftBreak(); }},
  ]);
}
function raftBreak(){
  waveSfx(); addTrauma(0.9); feedback("large"); sfx("attack");
  /* P2.8：掀筏入账（波塞冬三笔之二；重复掀筏只记一笔） */
  if (!state.raftWrathMark){ state.raftWrathMark = true; state.poseidonWrath = (state.poseidonWrath||0)+1; }
  showAsk("第 五 章 · 波 塞 冬 的 浪","筏　散　了",
    "一记从天而降的巨浪把筏拆成了柴。你呛进水里——咸的，黑的，一直往下坠。",
    "「你掀了独眼巨人的账——现在，海来收利息。」", [
    {label:"伸手——水里有一只白手，递来面纱", hint:"白手圣母伊诺 · 原著第5卷", fn:()=>takeVeil("first")},
    {label:"神的礼物，别碰", hint:"原著：你第一次拒绝了", fn:()=>{
      state.hp=Math.max(1,state.hp-10); sfx("hurt"); addTrauma(0.8); renderHUD();
      toast("白手缩回浪里。你往下沉，咸水灌进耳朵——雾里，有什么东西在看你。");
      veilSecond(); }},
  ]);
}
function veilSecond(){
  showAsk("第 五 章 · 波 塞 冬 的 浪","灰 眼 睛 · 再 一 次",
    "沉得更深了。雾里，一双灰眼睛静静看了你一眼——那只白手又一次递到面前：纱在水里张开着，像一小片不沉的天。",
    "（原著第 5 卷：第二次，你收下了它。）", [
    {label:"收下面纱，系上手腕", hint:"这一次，你没有再疑", fn:()=>takeVeil("second")},
    {label:"仍然不肯——自己的命自己扛", hint:"……", fn:()=>raftLost()},
  ]);
}
function takeVeil(mode){
  state.raftVeilTaken = true; state.raftStormDone = true;
  raftFx(false); gainXp(50); sfx("bless"); feedback("large");
  addMemory(mode==="second"
    ? "灰眼睛看了你一眼，你收下了白手圣母的面纱——三天两夜，浪把你交还给费埃克斯人的滩"
    : "白手圣母的面纱兜住了你——你没有等第二次。三天两夜，浪把你交还给海岸", 5, "leukothea");
  { const p=isleOff("scheria", 95, -15); boat.x=p.x; boat.y=p.y; }   /* 斯克里岛东侧近海（原著：浪把你交还给费埃克斯人的滩）· 批次 K2 随岛坐标派生 */
  renderHUD(); save();
  showChapter("concept-art/08-斯克里岛.jpg","第 五 章","游　三　天","毁筏的人游了三天——面纱兜住了他",
    (mode==="second"
      ? "灰眼睛在雾里看了你一眼，你收下了纱。"
      : "你没有等第二次——面纱系上了手腕。")
    + "三天两夜，咸水咬着伤口。第三夜，浪把你推上一片陌生的白滩：上游有歌声，和一群洗衣服的姑娘。（历练 +50 · 斯克里岛就在眼前）");
}
function raftLost(){
  state.raftStormFail = true;
  raftFx(false); sfx("hurt"); addTrauma(1); feedback("large");
  state.hp = Math.max(10, state.hp-30);
  state.raft.wood = 0;                                   /* 重新造筏（原著：筏没了就得再造）；时辰/储粮保留——考过的不必重考 */
  scene = "world"; state.ogygiaLeft = false;             /* 回岛重来：须再次出筏台 */
  { const p=isleOff("ogggia", 40, -60); boat.x=p.x; boat.y=p.y; }    /* 出湾同款落点 · 批次 K2 随岛坐标派生 */
  gainXp(10);
  addMemory("你把面纱推回去过一次——浪收走了你的筏，海把你推回奥吉吉亚的滩。卡吕普索说：我说过，海记你的账", 5, "poseidon");
  renderHUD(); save();
  showChapter("concept-art/06-奥吉吉亚-卡吕普索.jpg","第 五 章","海　记　了　账","毁筏的人把面纱推了回去",
    "浪把你的名字按进水里，又把你整个人推回奥吉吉亚的滩。岛上的日历还是昨天——卡吕普索在栈桥上，像从没等你走成过：「我说过，海记你的账。」（重新造筏：木料 ×3；时辰与储粮仍算数 · 历练 +10）");
}
/* ==================== P2.3 费埃克斯送客船石化（17g 原著第 13 卷末 · 彩蛋零成本） ====================
   送行船驶远后，波塞冬在回程海上把船变成石柱——惩罚护送奥德修斯的费埃克斯人。
   回望＝亲眼看见（石柱永久立于世界图）；不回头＝只听见闷响。海神账第三笔，两路都记。 ==================== */
const SCHERIA_EXIT = isleOff("scheria", 40, 30);   /* 斯克里送行船出发海面（离岛落点）· 批次 K2 随岛坐标派生 */
let _pillarT = 0;
function pillarTick(dt){
  if (scene!=="world" || !state.scheriaFarewell || state.stonePillarDone){ _pillarT=0; return; }
  if (dlgOpen || titleOn || chapterOn || mapOpen || askOn) return;   /* 界面全清才蓄力（海遇/掀筏同款门控） */
  if (Math.hypot(boat.x-SCHERIA_EXIT.x, boat.y-SCHERIA_EXIT.y) < 600){ _pillarT=0; return; }   /* 批次 H9：同瓦距翻倍 */
  _pillarT += dt;
  if (_pillarT >= 1.6){ _pillarT = 0; stonePillarEvent(); }
}
function stonePillarEvent(){
  sfx("warn"); feedback("small");
  showAsk("第 六 章 · 尾 声","别 回 头",
    "送行船的帆尖缩成一点白。水手的叮嘱还在耳边：别回头念出这座岛的名字。\n身后，海面忽然沉了一拍——像有什么东西正从浪底下顶上来。",
    "「父神在收账。不关你的事——别看。」掌舵的水手声音发紧。", [
    {label:"回头看一眼", hint:"原著第 13 卷 · 你知道这意味着什么", fn:()=>stonePillarLook()},
    {label:"目视前方，不回头", hint:"守住那句叮嘱 · 耳朵是诚实的", fn:()=>stonePillarMiss()},
  ]);
}
function stonePillarLook(){
  if (state.stonePillarDone) return;   /* 防重入：石化只入账一次（杂散直调不重复记账） */
  state.stonePillarDone = true; state.stonePillarSeen = true;
  state.poseidonWrath = (state.poseidonWrath||0)+1;   /* P2.8：石化入账（第三笔） */
  waveSfx(); addTrauma(0.5); feedback("large");
  addMemory("旅人回望了一眼——海面升起一根白石柱，送他回家的船在那儿变成了石头（原著第 13 卷：波塞冬收账）", 5, "poseidon");
  toast("你回头。海上立起一根石柱——送行船正在变成石头，浪在柱脚碎成白沫。波塞冬的账，从不挑收账的日子。（原著 · 石化的船 · 海神记账 +1）");
  renderHUD(); save();
}
function stonePillarMiss(){
  if (state.stonePillarDone) return;   /* 防重入：石化只入账一次 */
  state.stonePillarDone = true; state.stonePillarSeen = false;
  state.poseidonWrath = (state.poseidonWrath||0)+1;   /* P2.8：石化入账（第三笔） */
  sfx("warn");
  addMemory("旅人没有回头——身后传来一声很远的闷响，像海在关一扇门（原著第 13 卷：波塞冬收账）", 5, "poseidon");
  toast("你没有回头。很远的身后，一声闷响滚过水面——像海在关一扇门。有些账，不听也能结。（原著 · 石化的船 · 海神记账 +1）");
  renderHUD(); save();
}
/* ==================== F5 斯库拉六头快反战（17g 原著第 12 卷 · §17h F5：船舷反应战） ====================
   带话/静水＝改写出口（scyllaDebtPaid 静默放行，不扣船员）；硬闯＝原著——六头轮探，每头 0.6s 窗口
   按 E 砍/拉救回：救回＝改写（dev six_saved 从六张嘴里抢回的人），错过＝该头叼走 1 名船员（接 P1.1
   crew 账本）。六头全救回 crew 不折损＝「你比荷马多救回六个人」；全错过＝原著 6 人全失。 */
const SC_HEADS = 6, SC_WINDOW = 0.6, SC_WARN = 0.45, SC_RET = 0.4;
const SC = { on:false, t:0, head:0, phase:"idle", pt:0, saved:0, lost:0, done:false };
function startScyllaCombat(){
  if (scene!=="strait" || SC.on) return;
  if ((state.crew||0)<=0) return;                       /* 无船员可救 → 不触发（走原物品代价兜底） */
  SC.on=true; SC.t=0; SC.head=0; SC.phase="idle"; SC.pt=0; SC.saved=0; SC.lost=0; SC.done=false;
  sfx("alert"); addTrauma(0.3); feedback("medium");
  /* 抉择回声：若此前遇遇难小艇选了「放生绕行」，船员记得你不趁火打劫——此刻更愿意跟你赌 */
  const sparedWreck = (state.decisions||{}).sea_wreckboat==="放生绕行";
  if (sparedWreck){
    state.status["士气"] = (state.status["士气"]==="消沉"||state.status["士气"]==="低落") ? "尚可" : state.status["士气"];
    addMemory("六根颈子垂下来时，有人低声说：「上次那艘空艇，头儿没碰——这一次，我们跟他赌。」", 3, "strait");
  }
  addMemory("六根颈子同时从雾里垂下来——硬闯声之海峡，是要从斯库拉嘴里把船员抢回来的。每一头，你都只有一瞬", 4, "strait");
  toast(sparedWreck
    ? "六根颈子同时垂到船侧——有人在你身后低声说：「上次那艘空艇你没碰。这一次，我们跟你赌。」每头探出时有一瞬（0.6s）按 E 砍/拉：救回一头船员。快反战开始！"
    : "六根颈子同时垂到船侧——每头探出时有一瞬（0.6s）按 E 砍/拉：救回一头船员。快反战开始！");
  renderHUD();
}
function scyllaCombatTick(dt){
  if (!SC.on) return;
  if (dlgOpen||titleOn||chapterOn||mapOpen) return;       /* 界面打开冻结窗口（防海图/章节卡空转） */
  SC.t += dt; SC.pt += dt;
  if (SC.phase==="idle"){
    if (SC.pt >= SC_WARN){ SC.phase="strike"; SC.pt=0; sfx("attack"); }
  } else if (SC.phase==="strike"){
    if (SC.pt >= SC_WINDOW){ scyllaMiss(); }            /* 窗口错过 → 该头叼走 1 名船员 */
  } else if (SC.phase==="return"){
    if (SC.pt >= SC_RET){ scyllaNext(); }
  }
}
function scyllaStrike(){                                 /* E 键命中：砍/拉救回当前头 */
  if (!SC.on || SC.phase!=="strike") return;
  SC.saved++; SC.phase="return"; SC.pt=0;
  sfx("pick"); popText(aiaPlayer.x, aiaPlayer.y-30, "抢回一个！", "#7fd0a0"); addTrauma(0.1);
  if (SC.saved >= SC_HEADS){ scyllaEnd(); }
}
function scyllaMiss(){
  SC.lost++; SC.phase="return"; SC.pt=0;
  sfx("die"); popText(aiaPlayer.x, aiaPlayer.y-30, "叼走一个…", "#e08080"); addTrauma(0.3);
  if (SC.lost>=SC_HEADS){ scyllaEnd(); }
}
function scyllaNext(){
  SC.head++;
  if (SC.head>=SC_HEADS){ scyllaEnd(); return; }
  SC.phase="idle"; SC.pt=0;
}
function scyllaEnd(){
  SC.on=false; SC.done=true;
  if (SC.lost>0) loseCrew(SC.lost, "斯库拉的嘴各叼走了一名水手（六头快反战）");
  const all = SC.lost===0;
  if (all) state.scSixSaved = true;                       /* F5 全救回＝改写（ACHIV six_saved 判定） */
  state.straitStage=2;
  gainXp(all?40:20); sfx(all?"bless":"die"); feedback("large");
  addMemory(all
    ? "你从斯库的六张嘴里抢回了六个人——一头不落。海沉默了一会儿，像是没料到这一页"
    : `你抢回了 ${SC.saved} 个人，被叼走 ${SC.lost} 个。海峡静下来，雾在你身后合拢`, all?5:3, "scylla");
  toast(all
    ? "六头全被你砍回——船上一个人也没少。荷马第 12 卷写的是六人全失；你比荷马多救回六个人。"
    : (SC.lost===0?"":"六头归位，雾在船后合拢。被叼走的人，名字沉进浪里。") + (SC.saved>0?`你抢回了 ${SC.saved} 个人。`:""));
  renderHUD(); save();
}

/* ==================== F6 求婚者大厅肃清战（17h · 原著第 22 卷：杀 108 求婚者） ====================
   拉弓之后再去宴厅：求婚者发现弓开了，拔刀反扑（axes 的 toast「刀出鞘的声音」就是引导钩子）。
   六名求婚者轮番扑上（approach 0.5s → strike 0.6s 窗口按 E 放箭 → retreat 0.45s，SC 状态机同款）：
   窗口内按 E = 击杀该人；错过 = 被砍 -12（错 5 血不死，可撤退重试）；六人全灭 = canon hall_swept。
   血量 <15 自动撤退（且战且退，可再触发）；未尽之箭叙事圆给雅典娜的灰眼睛（原著必胜的内核）。 */
const SU_N = 6, SU_APPROACH = 0.5, SU_WINDOW = 0.6, SU_RETREAT = 0.45;
const SU_NAMES = ["安提诺奥斯","欧律玛霍斯","克忒西波斯","阿伽埃诺尔","勒奥克里托斯","安菲诺摩斯"];
const SU = { on:false, phase:"idle", pt:0, kills:0, missed:0 };
function startSuitorCombat(){
  if (scene!=="ithaca" || SU.on) return;
  SU.on=true; SU.phase="idle"; SU.pt=0; SU.kills=0; SU.missed=0;
  sfx("alert"); addTrauma(0.4); feedback("medium");
  addMemory("弓弦的余音还没散，安提诺奥斯第一个拔了刀——大厅里的箭雨要来了。你只带了一把没人能拉开的弓", 4, "suitors");
  toast("求婚者反扑了！他们轮番扑上来——出刀瞬间（0.6s）按 E 放箭：六人全灭才能肃清大厅。血太少会被迫撤退！");
  renderHUD();
}
function suitorCombatTick(dt){
  if (!SU.on) return;
  if (dlgOpen||titleOn||chapterOn||mapOpen) return;       /* 界面打开冻结窗口（防海图/章节卡空转） */
  SU.pt += dt;
  if (SU.phase==="idle"){
    if (SU.pt >= SU_APPROACH){ SU.phase="strike"; SU.pt=0; sfx("attack"); }
  } else if (SU.phase==="strike"){
    if (SU.pt >= SU_WINDOW){ suitorMiss(); }              /* 窗口错过 → 被砍一刀 */
  } else if (SU.phase==="retreat"){
    if (SU.pt >= SU_RETREAT){ suitorNext(); }
  }
}
function suitorStrike(){                                  /* E 键命中：放箭击杀当前扑上来的求婚者 */
  if (!SU.on || SU.phase!=="strike") return;
  const nm = SU_NAMES[(SU.kills+SU.missed) % SU_NAMES.length];
  SU.kills++; SU.phase="retreat"; SU.pt=0;
  sfx("pick"); popText(aiaPlayer.x, aiaPlayer.y-30, nm+"倒了！", "#7fd0a0"); addTrauma(0.15);
  burst(aiaPlayer.x, aiaPlayer.y+6, "#b04040", 8, 2.4, 2);   /* 打击反馈：粒子（game-feel 多通道） */
  if (SU.kills >= SU_N){ endSuitorCombat(); }
}
function suitorMiss(){
  SU.missed++; SU.phase="retreat"; SU.pt=0;
  state.hp = Math.max(5, state.hp - 12); renderHUD();
  sfx("die"); popText(aiaPlayer.x, aiaPlayer.y-30, "被砍中…", "#e08080"); addTrauma(0.35);
  if (state.hp < 15){ endSuitorCombat(true); }
}
function suitorNext(){
  if (SU.kills >= SU_N){ endSuitorCombat(); return; }
  if (state.hp < 15){ endSuitorCombat(true); return; }
  SU.phase="idle"; SU.pt=0;
}
function endSuitorCombat(fled){
  SU.on=false;
  if (fled){
    addMemory("血糊了眼睛——你且战且退出了大厅。求婚者的刀还亮着：先去补点状态，再回来算账", 3);
    const healHint = (state.backpack["治疗草药"]||state.backpack["金露"]) ? "背包里还有药，先用上再回来算账。" : "先找地方治好伤，再回来算账。";
    toast("你且战且退出了大厅。刀还亮着，弓还在——"+healHint+"（血量太低）");
    sfx("die"); renderHUD(); save(); return;
  }
  state.suitorsSwept = true; state.ithacaStage = Math.max(state.ithacaStage, 4);
  gainXp(40); sfx("bless"); feedback("large");
  addMemory(state.telRevealed
    ? "大厅肃清——父子两代并肩，一百零八支矛一一对过账。荷马第22卷写的就是这场"
    : "大厅肃清——一百零八支矛对过了账。最后几箭没人看清是谁放的：总有一只手，替你挡过最重的那一下", 5);
  toast(state.telRevealed
    ? "最后一个求婚者倒了。大厅安静下来——你先抱了儿子，再赢回妻子。（大厅肃清 ✓ · 历练 +40）"
    : "最后一个求婚者倒了。有几句呼救，你没看清是谁的箭放的——总有一只灰眼睛替你挡了最重的那一下。（大厅肃清 ✓ · 历练 +40）", 4800);
  achivTick(); renderHUD(); save();
}
/* ==================== F3 伊斯玛洛斯夜袭守营战（17h · 原著第9卷：船员贪酒庆功，城民夜反扑折损人手） ====================
   守营火：城民夜袭波×3（守卫）——fireAttack 状态机（SC/SU 同款）。守满3波=改写 dev camp_held
   「酒后仍醒着的人」；失守=折损重来（可再触发，胜利才算数）。触发：营火 campfire spot。 */
const CAMP_N = 3, CAMP_WARN = 0.55, CAMP_WINDOW = 0.6, CAMP_RETREAT = 0.5;
const CAMP = { on:false, phase:"idle", pt:0, wave:0, hit:0 };
function startCampDefense(){
  if (scene!=="ismaros" || CAMP.on) return;
  if (state.campHeld){ toast("营火还亮着——那一夜你守住了，城民都知道。"); return; }
  CAMP.on=true; CAMP.phase="idle"; CAMP.pt=0; CAMP.wave=0; CAMP.hit=0;
  sfx("alert"); addTrauma(0.3); feedback("medium");
  addMemory("伊斯玛洛斯的一夜——城民提着火把围过来时，你正攥着那瓶酒。火影越过你冲向营帐里的呼吸声", 4, "ismaros");
  toast("城民举着火把围上来——醉后醒着的那个也得自己守营火！连挡3波火把（出火瞬间0.6s按E拍开）。挡不住＝城民抢走酒，你得重守。");
  renderHUD();
}
function campDefenseTick(dt){
  if (!CAMP.on) return;
  if (dlgOpen||titleOn||chapterOn||mapOpen) return;
  CAMP.pt += dt;
  if (CAMP.phase==="idle"){ if (CAMP.pt>=CAMP_WARN){ CAMP.phase="strike"; CAMP.pt=0; sfx("attack"); } }
  else if (CAMP.phase==="strike"){ if (CAMP.pt>=CAMP_WINDOW){ campMiss(); } }
  else if (CAMP.phase==="retreat"){ if (CAMP.pt>=CAMP_RETREAT){ campNext(); } }
}
function campStrike(){                                /* E 键命中：拍开当前火把波 */
  if (!CAMP.on || CAMP.phase!=="strike") return;
  CAMP.wave++; CAMP.phase="retreat"; CAMP.pt=0;
  sfx("pick"); popText(aiaPlayer.x, aiaPlayer.y-30, "火把拍开！", "#7fd0a0"); addTrauma(0.1);
  burst(aiaPlayer.x, aiaPlayer.y+4, "#ff9d5c", 10, 70, 2.4);   /* 打击反馈：火星粒子 */
  if (CAMP.wave>=CAMP_N){ campEnd(); }
}
function campMiss(){
  CAMP.hit++; CAMP.phase="retreat"; CAMP.pt=0;
  sfx("die"); popText(aiaPlayer.x, aiaPlayer.y-30, "被火燎到…", "#e08080"); addTrauma(0.3);
  state.hp = Math.max(1, state.hp - 10); renderHUD();
  if (CAMP.hit >= CAMP_N){ campEnd(); }            /* 失误满三波＝失守（城民抢走酒，重守） */
}
function campNext(){
  if (CAMP.wave>=CAMP_N){ campEnd(); return; }
  CAMP.phase="idle"; CAMP.pt=0;
}
function campEnd(){
  CAMP.on=false;
  const cleared = CAMP.hit<CAMP_N;   /* 三波内只要没被撩倒净重守（hit 小都算）——实际按 wave==3 且完成 */
  if (CAMP.wave>=CAMP_N){
    state.campHeld = true;
    gainXp(30); sfx("bless"); feedback("large");
    addMemory("伊斯玛洛斯的夜，你一口气守住了三波火把——酒还烫着，城没破，你也还醒着", 4, "ismaros");
    toast("火把在地上烧成几丛，城民退进雾里——你守住了营火，也守住了自己。（守营 ✓ · dev 成就 · 历练 +30）");
    achivTick(); renderHUD(); save();
  } else {
    addMemory("伊斯玛洛斯的夜，城民的酒疯把你的人带走了几个——这回你没能守住", 3, "ismaros");
    const healHintC = (state.backpack["治疗草药"]||state.backpack["金露"]) ? "背包里还有药，用上再守。" : "先治好伤，再点营火。";
    toast("火把落进酒桶，营火塌了半边——你没守住这一夜。"+healHintC+"（再点营火，重新守）");
    renderHUD(); save();
  }
}
/* ==================== F4 独眼巨人羊腹潜行战（17h · 原著第9卷：绑羊腹下、巨人逐只摸羊查人） ====================
   时机潜行战（红线：不可攻击巨人）。巨人逐只摸羊（WARM→strike 窗口按 E 低头躲）：躲满 6 只 = canon
   under_the_raid「羊腹之下」成功混出；被抓 3 次 = 受伤重来。用 SC 同款状态机 HIDE。 */
const HIDE_N = 6, HIDE_WARN = 0.55, HIDE_WINDOW = 0.6, HIDE_RET = 0.45, HIDE_MAX_CAUGHT = 3;
const HIDE = { on:false, n:0, phase:"idle", pt:0, caught:0 };
function startRamHide(){
  if (scene!=="cyclops" || HIDE.on) return;
  if (state.ramHide){ toast("洞口的羊排成一列——你已经在羊腹下出过洞了。"); return; }
  if (!state.polHeard){ toast("巨人还没睡着——先听他把「无人」的账讲完，再谈溜出去。"); return; }
  HIDE.on=true; HIDE.n=0; HIDE.phase="idle"; HIDE.pt=0; HIDE.caught=0;
  sfx("warn"); addTrauma(0.3); feedback("medium");
  addMemory("你把自己绑进羊腹下的羊毛里——巨人逐只摸羊，每一只都有一瞬的空当", 4, "polyphemus");
  toast("你缩进羊腹下。巨人逐只摸羊——他的手扫过来时（0.6s）按 E 屏息低头躲开！摸到6只=溜出洞。被抓3次=伤势，重来！");
  renderHUD();
}
function ramHideTick(dt){
  if (!HIDE.on) return;
  if (dlgOpen||titleOn||chapterOn||mapOpen) return;
  HIDE.pt += dt;
  if (HIDE.phase==="idle"){ if (HIDE.pt>=HIDE_WARN){ HIDE.phase="strike"; HIDE.pt=0; sfx("attack"); } }
  else if (HIDE.phase==="strike"){ if (HIDE.pt>=HIDE_WINDOW){ ramCaught(); } }
  else if (HIDE.phase==="ret"){ if (HIDE.pt>=HIDE_RET){ ramNext(); } }
}
function ramDuck(){                                  /* E 键命中：躲过当前摸羊 */
  if (!HIDE.on || HIDE.phase!=="strike") return;
  HIDE.n++; HIDE.phase="ret"; HIDE.pt=0;
  sfx("pick"); popText(aiaPlayer.x, aiaPlayer.y-30, "躲过了！", "#7fd0a0"); addTrauma(0.08);
  if (HIDE.n>=HIDE_N){ ramEnd(); }
}
function ramCaught(){
  HIDE.caught++; HIDE.phase="ret"; HIDE.pt=0;
  sfx("die"); popText(aiaPlayer.x, aiaPlayer.y-30, "被抓住了…", "#e08080"); addTrauma(0.35);
  state.hp = Math.max(5, state.hp-12); renderHUD();
  if (HIDE.caught>=HIDE_MAX_CAUGHT){ ramEnd(true); }
}
function ramNext(){
  if (HIDE.n>=HIDE_N){ ramEnd(); return; }
  HIDE.phase="idle"; HIDE.pt=0;
}
function ramEnd(fail){
  HIDE.on=false;
  if (fail){
    addMemory("羊腹下的潜行失败了——巨人攥住了你的手腕，你被提回羊栏边", 3, "polyphemus");
    const healHintR = (state.backpack["治疗草药"]||state.backpack["金露"]) ? "背包里还有药，用上再潜。" : "先治伤，再回来剪你的毛。";
    toast("巨人抓住了你，一把把你从羊肚下拎出来——「敢在洞这头算计我？滚回去剪你的毛！」"+healHintR);
    renderHUD(); save(); return;
  }
  state.ramHide = true;
  gainXp(40); sfx("bless"); feedback("large");
  addMemory("你在羊肚皮下躲过了六次摸索——洞口的光透过羊角，你就是那只混出去的羊", 5, "polyphemus");
  toast("第6只羊过你的时候，你从它肚子下一滚身混出了洞——盲眼巨人一只都没摸出来。（潜出洞 ✓ · canon · 历练 +40）");
  achivTick(); renderHUD(); save();
}

// === 全局声明（自主脚本迁入） ===

// --- GHOSTS (migrated from main script) ---
const GHOSTS = [ {bx:230,by:190,ax:26,ay:12,p:0.7}, {bx:600,by:240,ax:34,ay:15,p:1.3},
                 {bx:170,by:330,ax:20,ay:14,p:2.1}, {bx:560,by:340,ax:28,ay:10,p:2.9} ];

// --- WITCH_SPOTS (migrated from main script) ---
const WITCH_SPOTS = {
  stir: {x: 8.9*ATS, y: 3.55*ATS},   /* 坩埚旁 */
  pace: {x: 6.6*ATS, y: 4.7*ATS},    /* 小径踱步 */
  gaze: {x: 5.6*ATS, y: 3.2*ATS},    /* 朝西望海 */
};

// --- WITCH_MOOD (migrated from main script) ---
const WITCH_MOOD = {stir:"搅药", pace:"踱步", gaze:"望海"};

// --- AUDIO_PREF_KEY (migrated from main script) ---
const AUDIO_PREF_KEY = "odyssey-audio-v1";

// --- QUALITY_KEY (migrated from main script) ---
const QUALITY_KEY = "odyssey-quality-v1";

// --- DIR8 (migrated from main script) ---
const DIR8 = [
  {g:"→", n:"东"}, {g:"↘", n:"东南"}, {g:"↓", n:"南"}, {g:"↙", n:"西南"},
  {g:"←", n:"西"}, {g:"↖", n:"西北"}, {g:"↑", n:"北"}, {g:"↗", n:"东北"},
];

// --- SAND (migrated from main script) ---
/* 美术统一（2026-11-14）：陆地色向海图的羊皮纸/橄榄墨色靠拢，不再用糖果绿 */
const SAND="#dfcaa0", GRASS_C="#95a773", GRASS_D="#84955f", CLIFF="#c4a071", CLIFF_D="#9a7a4e";

// --- DOLPHIN_PODS (migrated from main script) ---
const DOLPHIN_PODS = [
  {x:25*WTS+60, y:7*WTS+40, r:60},   // 爱琴海
  {x:9*WTS+20,  y:9*WTS+20, r:52},   // 第勒尼安西
  {x:30*WTS+20, y:11*WTS,   r:68},   // 东地中海开阔水
];

// --- DRIFT_NOTES (migrated from main script) ---
const DRIFT_NOTES = [
  "「风从西边来的时候，别恋战。」——一只缺了底的碗里的字条",
  "「我数到第十天就不数了。海替我记着。」",
  "「如果捡到这张纸：家的方向是心跳更响的那一边。」",
  "「我们把最后半壶水留给了更年轻的水手。不后悔。」",
  "「塞壬的歌其实只有一句——你心里本来就有那句。」",
  "「别信平静的海。平静只是它眨了下眼。」",
  "「船漆成蓝色就不会被浪认出来。骗人的。但漆好看。」",
  "「致捡到瓶子的人：往回走也是一种航行。」",
];

// --- TH (migrated from main script) ---
const TH = 17;   /* 崖面高度 */

// --- MAIN_STEPS (migrated from main script) ---
const MAIN_STEPS = [
  {k:"troy",    name:"特洛伊 · 木马之夜", done:()=>!!state.troyDone,
    hint:"献策→伐木×5→造马→夜袭→抉择→解缆出海", alt:"没走完也能回访——启航之地不关门"},
  {k:"aia1",    name:"埃阿亚 · 玛草委托", done:()=>{const q=state.quests&&state.quests.witch_grass; return !!(q&&q.done);},
    hint:"东北草丛采 3 株玛草，回女巫处交差"},
  {k:"aia2",    name:"喀耳刻立誓", done:()=>!!state.circeSworn,
    hint:"先去林间金光拿魔草——蜜酒别空着手喝"},
  {k:"hades",   name:"冥界 · 向特瑞西阿斯问路", done:()=>!!state.prophecy,
    hint:"蜂蜜酒/面包/淡水倒进献祭之沟，然后选长路或捷径"},
  {k:"strait",  name:"声之海峡 · 塞壬与斯库拉", done:()=>!!state.straitCleared,
    hint:"先处置塞壬：蜡封耳（弃歌词）或绑上桅杆（直面）"},
  {k:"sun",     name:"太阳岛 · 饥饿与誓言", done:()=>!!(state.sunBlessed||state.sunWrath),
    hint:"撑到黄昏报上名字，或宰牛付代价"},
  {k:"ogggia",  name:"奥吉吉亚 · 永生的锁", done:()=>!!state.ogygiaLeft,
    hint:"摘果、看织机，然后谈正题——留下，或造筏离岛"},
  {k:"scheria", name:"斯克里 · 把故事讲完", done:()=>!!state.scheriaFarewell,
    hint:"篝火旁讲完故事；送行时要答「家在哪」"},
  {k:"ithaca",  name:"伊萨卡 · 归乡", done:()=>!!state.finaleDone,
    hint:"脚疤与婚床两问——用你一路攒下的名字作答"},
];

// --- OPT_STEPS (migrated from main script) ---
const OPT_STEPS = [
  {k:"ismaros",   name:"伊斯玛洛斯（贪）", done:()=>!!state.legs.ismaros, hook:"守营战 · 喀科恩酒"},
  {k:"lotus",     name:"食莲岛（忘）",     done:()=>!!state.legs.lotus,   hook:"莲子 · 断桨"},
  {k:"cyclops",   name:"独眼巨人之岛（名）", done:()=>!!state.legs.cyclops, hook:"「无人」之名 · 羊毛披风"},
  {k:"aeolia",    name:"风神岛（风）",     done:()=>!!state.legs.aeolia,  hook:"四风任务 · 风袋"},
  {k:"telepylos", name:"忒勒皮洛斯（险）", done:()=>!!state.legs.telepylos, hook:"坠石绕行 · 幸存者的绳结"},
  {k:"troy",      name:"特洛伊海岸（启航）", done:()=>!!state.legs.troy,   hook:"木马之夜的完整一页"},
];

// --- DRINK (migrated from main script) ---
const DRINK = {"淡水":{t:55}};

// --- PERSONA_CATS (migrated from main script) ---
const PERSONA_CATS = ["闲聊","请求帮助","查询神谕","查询生物情报","查询地点信息","查询自身状态","其他意图"];   /* 兼容旧引用（现用 NPC_JOB_MAPS 判定覆盖） */

// --- PARSE_CACHE_KEY (migrated from main script) ---
const PARSE_CACHE_KEY = "odyssey-parse-cache-v1";

// === 主脚本残留（第二批迁入） ===

// --- RECIPES (migrated from main script) ---
const RECIPES = {
  "治疗药膏": {out:"治疗药膏", need:{玛草:2,淡水:1}, desc:"玛草×2 + 淡水×1，你亲手熬的伤药。使用：清伤势，+30 血。"},
  "提神茶":   {out:"提神茶",   need:{蜂蜜:1,莲子干:1}, desc:"蜂蜜×莲子，女巫的偏方。使用：+12 饱食，士气振奋。"},
};

// --- SITE_MAPS (migrated from main script) ---
const SITE_MAPS = {
  ismaros:  { img:"concept-art/maps/05-伊斯玛洛斯图.jpg",  name:"伊斯玛洛斯" },
  lotus:    { img:"concept-art/maps/06-食莲岛图.jpg",      name:"食莲岛" },
  cyclops:  { img:"concept-art/maps/07-独眼巨人岛图.jpg",  name:"独眼巨人之岛" },
  telepylos:{ img:"concept-art/maps/08-忒勒皮洛斯图.jpg",  name:"忒勒皮洛斯" },
  troy:     { img:"concept-art/maps/09-特洛伊图.jpg",      name:"特洛伊" },
  aia:      { img:"concept-art/maps/02-埃亚岛图.jpg",        name:"埃阿亚岛" },   /* 修正：文件名是「埃亚岛图」，原写「埃阿亚岛图」→ M 键海图一直 404 */
  hades:    { img:"concept-art/maps/03-冥界之岸图.jpg",    name:"冥界之岸" },
  aeolia:   { img:"concept-art/maps/04-风神岛图.jpg",      name:"风神岛" },
  sun:      { img:"concept-art/maps/10-太阳岛图.jpg",      name:"太阳岛" },
  ogggia:   { img:"concept-art/maps/11-奥吉吉亚图.jpg",    name:"奥吉吉亚" },
  scheria:  { img:"concept-art/maps/12-斯克里岛图.jpg",    name:"斯克里岛" },
  ithaca:   { img:"concept-art/maps/13-伊萨卡图.jpg",      name:"伊萨卡" },
  strait:   { img:"concept-art/maps/14-斯库拉海峡图.jpg",  name:"斯库拉海峡" },
};


// --- 背包物品图标（接线表在 itemIcons.js，**自动生成**） --------------------
// ITEM_ICONS 由 scripts/gen_item_icons.py 扫描 concept-art/icons/ 生成，
// 只收录**文件真实存在**的图标 —— 缺图的物品压根不进表 → 不会发 404 请求。
// 补图流程：把 PNG 丢进 concept-art/icons/ → 跑一次 scripts/gen_item_icons.py → 自动生效。
function itemIconHTML(name){
  const f = ITEM_ICONS[name];
  if(!f) return "";
  return '<i class="itIcoBox"><img class="itIco" src="concept-art/icons/'+f+'" alt="" loading="lazy" onerror="this.parentNode.remove()"></i>';
}

// --- FOOD (migrated from main script) ---
const FOOD = {"面包":{h:45},"烤野猪肉":{h:65},"蜂蜜":{h:30},"蜂蜜酒":{h:35,t:15},"橄榄油":{h:18},"玛草":{h:8},"金苹果":{h:60,t:10},
  "海藻":{h:14},"鱼":{h:30},"烤鱼":{h:55},"牛肉":{h:60}};   /* 第四章：太阳岛食物链（海藻/鱼→烤鱼/牛肉） */

