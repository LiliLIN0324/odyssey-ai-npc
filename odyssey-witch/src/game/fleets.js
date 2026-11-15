/* ============================================================
   批次 K3 · B1 —— 海上势力船队
   ------------------------------------------------------------
   「海上不只有你一条船。」

   四支有名有旗、有目的地、会在海图上移动的船队。
   参照《Sea of Thieves》的「可遭遇的势力」与《80 Days》的「世界在别处发生事情」：
   船队不是玩法系统，是**剧情装置**——它们让玩家看见自己身处一个比自己大的时代。

   坐标与移动：
     · 航路用世界网格坐标（gx,gy）写死，与 ISLANDS 同一套坐标系；
       运行时投影成像素，位置由**世界时刻 state.wtime** 推导 → 确定性、可存档、
       刷新页面也不会跳回起点（wtime 存在存档里）。
     · 船队沿航路折线匀速巡回；速度按 px/s，玩家航速 62px/s，
       所以船队跑得比玩家慢——你追得上它，也拦得住它。

   遭遇：
     · 船位靠近船队（< 110px）→ 第一次撞见出**抉择卡**（交易 / 劫掠 / 救助 / 护航 / 问答）；
       之后再次撞见只给一句轻提示（世界一直在那儿，不会一直拦你）。
     · 劫掠商队会**改写这片海的状态**（forceRegionStatus → 封锁），
       这是 B1 与 B2（海域状态层）之间的真接线。
   ============================================================ */

const FLEETS = [
  {
    id:"bronze", name:"青铜之矛", flag:"#c9743a", mark:"矛", crew:"特洛伊残军",
    blurb:"特洛伊城破之后活下来的那几条船——他们不跑商，他们抢。",
    dest:"在爱琴海与奥吉亚之间来回，抢粮、抢桨、抢名字。",
    speed:16, route:[[33,9],[30,9],[26,8],[23,10],[24,12],[28,11],[31,10]],
    meet:{
      title:"青 铜 之 矛",
      sub:"三条挂着破青铜矛头的船从你右舷掠过——他们认出你是谁了。",
      quote:"「奥德修斯的人？……哈。那我们聊聊值多少钱。」",
      choices:[
        { label:"卖给他们一条旧航线", hint:"拿消息换消息", run:(f)=>{
            gainXp(7);
            addMemory(`你把一条旧航线卖给了「${f.name}」——换来一句「特洛伊的狗还在游」`, 2, "world");
            return "他们听完就笑了：特洛伊的狗还在游，那你就还有用。（历练 +7）";
          } },
        { label:"抢他们的桨", hint:"你有船，他们有桨", run:(f)=>{
            state.hp = Math.max(1, state.hp - 7);
            state.coins = (state.coins||0) + 14; gainXp(10);
            addMemory(`你跟「${f.name}」在爱琴海上撞了一架，抢到几枚德拉克马和一支断桨`, 3, "world");
            return "桨没抢到，拳头上倒是挨了两下。他们的德拉克马倒是被你抢走了 14 枚。（血 -7 · 金币 +14 · 历练 +10）";
          } },
        { label:"问他们特洛伊之后的事", hint:"不花钱，只花时间", run:(f)=>{
            gainXp(5);
            addMemory(`「${f.name}」讲了一件特洛伊之后的事：海上现在没有王，只有抢得快的人`, 2, "world");
            return "他们讲得很短：海上现在没有王，只有抢得快的人。（历练 +5）";
          } },
      ],
    },
  },
  {
    id:"olive", name:"橄榄枝商队", flag:"#7fbf6a", mark:"枝", crew:"腓尼基商队",
    blurb:"十一艘满载的宽腹船，桅上挂橄榄枝——他们的合同比他们的刀值钱。",
    dest:"从黎凡特海一路压到第勒尼安海，走的是最老的一条线。",
    speed:12, route:[[38,12],[36,11],[33,9],[29,10],[24,12],[18,12],[12,10],[8,10]],
    meet:{
      title:"橄 榄 枝 商 队",
      sub:"十一艘宽腹船吃水很深，吃水线下面藏着比橄榄枝更值钱的东西。",
      quote:"「我们按合同运货，不运新闻。……不过，你想知道哪儿在打仗，我可以告诉你。」",
      choices:[
        { label:"买补给（14 德拉克）", hint:"熟路的客人价", run:(f)=>{
            if ((state.coins||0) < 14) return "你凑不出 14 枚。领头的连价都没报，就转开了目光。";
            state.coins -= 14; addItem("淡水"); addItem("面包"); gainXp(4);
            return "两袋淡水、两块干粮，还附赠一句「西边别去」。（金币 -14 · 淡水 +1 · 面包 +1）";
          } },
        { label:"问他们哪片海在封锁", hint:"打听世界", run:(f)=>{
            const list = regionStatusList ? regionStatusList() : [];
            const hot = list.filter(x=>x.status.id!=="calm").slice(0,2);
            const txt = hot.length ? hot.map(x=>`${x.region.name}·${x.status.label}`).join("、") : "暂时没有";
            gainXp(6);
            addMemory(`「${f.name}」把海上现在的乱处告诉你：${txt}`, 2, "world");
            return `他们压低声音报了一遍：${txt}。（历练 +6）`;
          } },
        { label:"劫掠商队", hint:"一船货够你走半年", run:(f)=>{
            state.hp = Math.max(1, state.hp - 10);
            state.coins = (state.coins||0) + 26; gainXp(12);
            if (typeof forceRegionStatus==="function"){
              const r = regionOf(boat.x, boat.y);
              if (r) forceRegionStatus(r.id, "blockade", 240);
            }
            addMemory(`你劫了「${f.name}」的一船货——消息传得比船快`, 3, "world");
            return "你抢走了一箱货。领头的没喊，只是回头看了一眼海——这片海会替他记着你。（血 -10 · 金币 +26 · 历练 +12 · 本海域转为封锁）";
          } },
      ],
    },
  },
  {
    id:"exodus", name:"东渡者", flag:"#b79ad8", mark:"渡", crew:"北上的难民船队",
    blurb:"不是商船，也不是兵船——是很多条什么都装不下的小船。",
    dest:"从非洲岸一路往北，追着一句「北边还有地」的传说。",
    speed:9, route:[[26,14],[22,13],[18,13],[14,12],[11,10],[8,11],[5,10]],
    meet:{
      title:"东 渡 者",
      sub:"七条挤得不能再挤的小船，船板上坐满了人，只有一个老人在掌舵。",
      quote:"「北边还有地吗？」「……北边还有地。」老人自己也不确定。",
      choices:[
        { label:"分一份淡水给他们", hint:"他们最缺这个", run:(f)=>{
            state.thirst = Math.max(0, state.thirst - 8); gainXp(9);
            addMemory(`你把淡水分给了「${f.name}」——老人说北边确实还有地`, 3, "world");
            return "你把两囊水分出去半囊。老人看了你很久，然后说：北边确实还有地。（口渴 -8 · 历练 +9）";
          } },
        { label:"护送他们一段", hint:"费油，但值", run:(f)=>{
            state.thirst = Math.max(0, state.thirst - 12); gainXp(12);
            addMemory(`你替「${f.name}」挡了一段风浪——他们的孩子到岸时还醒着`, 3, "world");
            return "你顶在风头，把他们送到背风的一侧才离开。孩子的笑声在浪里居然没散。（口渴 -12 · 历练 +12）";
          } },
        { label:"问他们从哪来", hint:"听一段别人的史诗", run:(f)=>{
            gainXp(4);
            addMemory(`「${f.name}」的老人讲了一个城市的名字——那座城现在只剩名字`, 2, "world");
            return "老人报了一个城市的名字，然后说：现在那里只剩名字了。（历练 +4）";
          } },
      ],
    },
  },
  {
    id:"corsair", name:"独眼海贾", flag:"#8f8f9c", mark:"眼", crew:"第勒尼安海的海盗",
    blurb:"一条船，没有旗，只有一个用炭画在帆上的独眼。",
    dest:"在第勒尼安海与爱奥尼亚海之间游荡，专挑落单的人。",
    speed:22, route:[[10,9],[6,9],[3,8],[6,11],[9,13],[14,12],[12,9]],
    meet:{
      title:"独 眼 海 贾",
      sub:"一条单桅船横在你前面，帆上用炭画着一只眼睛，正对着你。",
      quote:"「别跑。跑的话我就当你是怕我。」",
      choices:[
        { label:"装傻，慢慢靠过去", hint:"他们最恨硬碰", run:(f)=>{
            state.coins = (state.coins||0) - 6; gainXp(6);
            addMemory(`你装傻靠上「${f.name}」，只被要走 6 枚——他们竟然放过了你`, 2, "world");
            return "你举着手慢慢靠过去，他们只拿走了 6 枚就挥手让你走。（金币 -6 · 历练 +6）";
          } },
        { label:"亮出你的桨", hint:"硬碰", run:(f)=>{
            state.hp = Math.max(1, state.hp - 14);
            state.coins = (state.coins||0) + 10; gainXp(14);
            addMemory(`你和「${f.name}」撞了一架——你赢了桨，输了半条命`, 3, "world");
            return "桨比你想的沉。你拿到了 10 枚和半条命。（血 -14 · 金币 +10 · 历练 +14）";
          } },
        { label:"问他们为什么画一只眼睛", hint:"也许有故事", run:(f)=>{
            gainXp(5);
            addMemory(`「${f.name}」的独眼不是画上去的——是被别人按进他眼睛里的`, 2, "world");
            return "他沉默了很久，才说：不是画的。（历练 +5）";
          } },
      ],
    },
  },
];

/* ---------- 航路：网格坐标 → 像素折线 + 巡回 ---------- */
function fleetRoutePx(f){
  if (f._routePx) return f._routePx;
  const pts = f.route.map(p=>[p[0]*WTS + WTS/2, p[1]*WTS + WTS/2]);
  let len = 0;
  for (let i=1;i<pts.length;i++) len += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
  f._routePx = { pts, len: len || 1 };
  return f._routePx;
}
/* 船队当前像素位置（由世界时刻推导——确定性、存档可复原） */
function fleetPos(f){
  const r = fleetRoutePx(f);
  const d = (worldTime() * (f.speed||12)) % r.len;
  let acc = 0;
  for (let i=1;i<r.pts.length;i++){
    const a=r.pts[i-1], b=r.pts[i];
    const seg = Math.hypot(b[0]-a[0], b[1]-a[1]);
    if (seg<=0) continue;
    if (acc + seg >= d){
      const t = (d-acc)/seg;
      return { x:a[0]+(b[0]-a[0])*t, y:a[1]+(b[1]-a[1])*t, i };
    }
    acc += seg;
  }
  return { x:r.pts[0][0], y:r.pts[0][1], i:0 };
}
function fleetList(){ return FLEETS; }

/* ---------- 遭遇 ---------- */
const FLEET_REACH = 110;    /* px：撞见距离 */
let _fleetBusy = false;
function fleetTick(){
  if (typeof scene!=="undefined" && scene!=="world") return;
  if ((state.openingBeat??3)<3) return;
  if (typeof dlgOpen!=="undefined" && (dlgOpen||titleOn||chapterOn||mapOpen||askOn)) return;
  if (_fleetBusy) return;
  if (typeof worldCardsEnabled==="function" && !worldCardsEnabled()) return;
  if (typeof worldIsJump==="function" && worldIsJump()) return;          /* 传送进来的不算「撞见」 */
  if (typeof worldOpeningDone==="function" && !worldOpeningDone()) return;  /* 开局先让玩家开船 */
  if (typeof islandNear==="function" && islandNear()) return;           /* 正在靠岸：靠岸优先 */
  if (!state.fleetMet) state.fleetMet={};
  for (const f of FLEETS){
    const p = fleetPos(f);
    const d = Math.hypot(boat.x-p.x, boat.y-p.y);
    if (d > FLEET_REACH) continue;
    const n = state.fleetMet[f.id]||0;
    if (n === 0){
      state.fleetMet[f.id] = 1;
      _fleetBusy = true;
      showAsk(`海上势力 · ${f.name}`, f.meet.title, f.meet.sub, f.meet.quote,
        f.meet.choices.map(c=>({
          label:c.label, hint:c.hint,
          fn:()=>{
            const out = c.run(f);
            if (typeof out==="string") toast(out);
            _fleetBusy = false;
            if (typeof renderHUD==="function") renderHUD();
            if (typeof save==="function") save();
          },
        })),
        "fleet_"+f.id);
      return;
    }
    /* 第二次起不再拦人：世界一直在那儿，只是路过 */
    toast(`${f.name}从${p.x<boat.x?"左":"右"}舷掠过——${f.blurb}`);
    state.fleetMet[f.id] = 2;   /* 轻提示只给一次，之后彻底安静 */
    return;
  }
}

/* ---------- 2D 世界视图：把船队画在海面上 ---------- */
function drawFleets2D(et){
  if (typeof scene!=="undefined" && scene!=="world") return;
  for (const f of FLEETS){
    const p = fleetPos(f);
    const x = p.x, y = p.y;
    const bob = Math.sin(et*1.6 + f.route[0][0])*2;
    ctx.save();
    /* 旗：一条小三角，颜色即势力色 */
    ctx.fillStyle = f.flag;
    ctx.beginPath();
    ctx.moveTo(x, y-16+bob);
    ctx.lineTo(x+13, y-9+bob);
    ctx.lineTo(x, y-3+bob);
    ctx.closePath();
    ctx.fill();
    /* 船身 */
    ctx.fillStyle = "rgba(30,26,20,.85)";
    ctx.beginPath();
    ctx.ellipse(x, y+2+bob, 11, 4.2, 0, 0, 7);
    ctx.fill();
    /* 名字（小字，远处只留旗） */
    ctx.font = "600 10px 'Segoe UI','Microsoft YaHei'";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.fillText(f.name, x+1, y+18+bob);
    ctx.fillStyle = f.flag;
    ctx.fillText(f.name, x, y+17+bob);
    ctx.restore();
  }
}
