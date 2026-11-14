// ============================================================
// 奥德赛 · 交互层 —— handlers
// 37 个交互处理函数：对话/抉择/制作/考试/地图/手柄/风袋
// 依赖 src/data/* + src/engine/core.js + src/render/scenes.js
// ============================================================

// --- ensureCraftUI (was main+256-269, 14 lines) ---
function ensureCraftUI(){
  if (craftUI) return;
  craftUI = document.createElement("div"); craftUI.id = "craftOverlay";
  craftUI.innerHTML = `<div class="craftPanel">
    <div class="craftHead"><span>坩埚 · 炼药台</span><button class="craftX" id="craftX">×</button></div>
    <div class="craftSub">女巫的绿泡坩埚。把手边的材料丢进去，能炖出点正经东西。</div>
    <div id="craftList"></div></div>`;
  document.body.appendChild(craftUI);
  craftUI.addEventListener("click", e => { if (e.target === craftUI) closeCraft(); });
  const x = document.getElementById("craftX"); if (x) x.onclick = closeCraft;
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeCraft(); });
  const list = document.getElementById("craftList");
  list.addEventListener("click", e => { const b = e.target.closest(".craftBtn"); if (b) craftOne(b.dataset.craft); });
}


// --- craftOptions (was main+270-273, 4 lines) ---
function craftOptions(){
  return Object.keys(RECIPES).map(k => { const r = RECIPES[k];
    return k + "（" + Object.entries(r.need).map(([a,q]) => a + "×" + q).join("+") + "）"; }).join("；");
}


// --- openCraft (was main+274-286, 13 lines) ---
function openCraft(){
  if (dlgOpen || titleOn || chapterOn || mapOpen) return;
  ensureCraftUI();
  const list = document.getElementById("craftList"); list.innerHTML = "";
  for (const [name, r] of Object.entries(RECIPES)){
    const can = Object.entries(r.need).every(([a,q]) => (state.backpack[a]||0) >= q);
    const row = document.createElement("div"); row.className = "craftRow" + (can ? "" : " off");
    row.innerHTML = `<div><div class="craftName">${name}</div><div class="craftDesc">${r.desc}</div></div>` +
      `<button class="craftBtn" data-craft="${name}"${can ? "" : " disabled"}>${can ? "炼" : "缺材料"}</button>`;
    list.appendChild(row);
  }
  craftUI.style.display = "flex";
}


// --- closeCraft (was main+287-287, 1 lines) ---
function closeCraft(){ if (craftUI) craftUI.style.display = "none"; }


// --- craftOne (was main+288-296, 9 lines) ---
function craftOne(name){
  const r = RECIPES[name]; if (!r) return;
  for (const [a,q] of Object.entries(r.need)) if ((state.backpack[a]||0) < q){ sfx("warn"); toast("材料不够——锅可不肯煮空气。"); return; }
  for (const [a,q] of Object.entries(r.need)) delItem(a, q);
  addItem(r.out); sfx("cook"); gainXp(8);
  addMemory("旅人在女巫的坩埚边炼出了 " + r.out, 1);
  toast("锅里的绿泡翻了个泡——你炼出了 " + r.out + "。");
  renderHUD(); save(); openCraft();
}


// --- panelOpen (was main+…, 4 lines) ---
/* 背包 / 任务 / 设置 任一面板开着？——主循环据此暂停世界，pressE 据此拒绝互动。
   旧实现只查 bagPanel：开任务本时船照走、饿照扣，E 键还能直接把人送进另一座岛。 */
function panelOpen(){
  return ["bagPanel","questPanel","settingsPanel"].some(id=>{
    const p=document.getElementById(id);
    return !!(p && p.style.display==="block");
  });
}


// --- pressE (was main+379-404, 26 lines) ---
function pressE(){
  if (askOn || titleOn || chapterOn || mapOpen || dlgOpen) return;   /* 与 keydown 门控一致：界面打开时不响应 */
  if (panelOpen()) return;   /* 面板开着（背包/任务/设置）不响应 E：玩家以为在翻清单，其实在切场景 */
  /* F5 斯库拉快反战：strike 窗口内 E=砍/拉救回，不进普通交互 */
  if (SC.on && SC.phase==="strike"){ scyllaStrike(); return; }
  /* F6 求婚者肃清战：strike 窗口内 E=放箭击杀，不进普通交互 */
  if (SU.on && SU.phase==="strike"){ suitorStrike(); return; }
  /* F3 伊斯玛洛斯守营战：strike 窗口内 E=拍开火把 */
  if (CAMP.on && CAMP.phase==="strike"){ campStrike(); return; }
  /* F4 独眼巨人羊腹潜行：strike 窗口内 E=屏息低头 */
  if (HIDE.on && HIDE.phase==="strike"){ ramDuck(); return; }
  /* 钓鱼中：E=提竿（优先于一切交互） */
  if (FISH.on){ fishingStrike(); return; }
  /* 开阔海（无岛屿）：先打捞漂流物，再抛竿——不占岛屿交互位 */
  if (scene==="world" && !islandNear()){
    const d = driftNear();
    if (d){ salvageDrift(d); return; }
    if (podNear()){ dolphinEvent(); return; }   /* 批次 J4：海豚群可互动 */
    startFishing();
    return;
  }
  /* 预按：当前无可交互目标才进缓冲，避免双触发 */
  const has = scene==="world" ? (!!islandNear() || !!podNear()) : !!aiaNear();
  if (!has){ eBufAt = performance.now(); sfx("miss");
    if (performance.now()-lastEmptyE>2500){ lastEmptyE=performance.now(); toast("（附近没有可互动的东西——走近发光的人、物或岛再按 E）"); } }   /* 空按轻响 + 节流可读反馈 */
  interact();
}


// --- pollGamepad (was main+421-438, 18 lines) ---
function pollGamepad(){
  if (gpActive === null || typeof navigator.getGamepads !== "function") return;
  const pads = navigator.getGamepads();
  const gp = pads && (pads[gpActive] || [...pads].find(p=>p && p.connected));
  if (!gp) return;
  if (gpActive === null) gpActive = gp.index;
  const dz = 0.42;
  const ax = gp.axes[0]||0, ay = gp.axes[1]||0;
  const dirSet = (key, on)=>{ if (on) keys.add(key); else keys.delete(key); };
  dirSet("a", ax < -dz || (gp.buttons[14]&&gp.buttons[14].pressed));
  dirSet("d", ax >  dz || (gp.buttons[15]&&gp.buttons[15].pressed));
  dirSet("w", ay < -dz || (gp.buttons[12]&&gp.buttons[12].pressed));
  dirSet("s", ay >  dz || (gp.buttons[13]&&gp.buttons[13].pressed));
  gpPress(gp.buttons[0], "b0", ()=>{ if (askOn){ return; } pressE(); });            /* A */
  gpPress(gp.buttons[1], "b1", ()=>{ if (dlgOpen) closeDlg(); else if (mapOpen) closeMap(); else if (document.getElementById("lyricCard").classList.contains("open")) closeLyric(); });   /* B */
  gpPress(gp.buttons[2], "b2", ()=>{ document.getElementById("bagBtn").click(); });  /* X */
  gpPress(gp.buttons[3], "b3", ()=>{ if (!chapterOn){ mapOpen ? closeMap() : openMap(); } });   /* Y */
}


// --- showFinale (was main+832-960, 129 lines) ---
function showFinale(mode, way, name){
  state.finaleDone = true;
  if (mode==="a"){ state.nameWay = way||"none"; state.chosenName = (way==="old"||way==="none") ? null : (name||null); }
  save();
  /* 本机航程档案：走到结局才落一笔（重复进入结局不重复记） */
  recordRun(mode==="stay" ? "stay" : mode==="guest" ? "guest" : mode==="b" ? "sea" : "home");
  const stay = mode==="stay", guest = mode==="guest", bpath = mode==="b";
  const paras=[];
  paras.push(state.prophecy==="long"
    ? "你选了长路。困顿一路跟着你，像条忠心的老狗——也正是它，把你一寸一寸驮回了熟悉的海。"
    : state.prophecy==="short"
    ? "你选了捷径。荣耀的灰暖过一时——浪替你省下的年月，都记在别人的歌里了。"
    : "你没来得及问路。海替你挑了一条——它最擅长这个。");
  /* P2.9（17g 原著第 10 卷末）：留灯线判词——两章因果用原著钉死 */
  if (state.circeLeft) paras.push("埃阿亚岛留灯的那一夜，她把海图铺在灶边，替你把路指明白：先去冥界，问特瑞西阿斯。长路是你选的——可走到冥界岔口这件事本身，是她要你先去问死者的。（原著 · 喀耳刻的指路）");
  paras.push(state.lyricFragment
    ? "塞壬的歌你听完了。残页贴身放着——有些知识，是用来疼的。"
    : state.waxEars
    ? "你的故事里缺了一页歌。蜡还封在耳骨里——安全和空，原来是同一个味道。"
    : (state.paidMem&&state.paidMem.length
      ? `你付给亡者的那段记忆，塞壬唱到那里只剩空白——${state.paidMem.length} 页已定在冥界的雾里，谁也叫不回来。`
      : "歌从海峡上空飘过去，没有落进你的故事。"));
  paras.push(state.sunBlessed
    ? ("太阳岛上你守住了誓言。"+(state.sunName?`「${state.sunName}」——他记住了这个名字。`:"")+"一缕走得过黑暗的光，此刻正在你包里。")
    : "圣牛的血漫过草场。你吃饱了——胃是满的，天是阴的；往后每一阵风里都有闷雷。");
  if (state.crewSaved) paras.push("那一天你按住了船员的手——荷马写的是你睡着，可你醒着。他们恨了你一阵子，后来在伊萨卡的雾里，全都明白了。");
  if (state.zeusStruck && !stay && !guest && !bpath) paras.push("九天的漂流你一个人数完了——十二个名字沉在太阳岛的浪里，没有一个怪你，因为雷落下来时，你也在睡梦里。");
  /* 抉择回声：把一路的关键选择收进判词——它们塑造了你这个人 */
  const dec = state.decisions||{};
  const decEcho=[];
  if (dec.troy_fire) decEcho.push(`特洛伊之夜你${/放下/.test(dec.troy_fire)?"放下了火把（改写）":"烧了城（原著）"}`);
  if (dec.mead) decEcho.push(`蜜酒前你「${dec.mead}」`);
  if (dec.sea_storm) decEcho.push(`风暴里你「${dec.sea_storm}」`);
  if (dec.sea_wreckboat) decEcho.push(`遇难小艇前你「${dec.sea_wreckboat}」`);
  if (dec.calypso) decEcho.push(`卡吕普索的永生你选了「${dec.calypso}」`);
  /* B2 六段旧路：这些选择现在一定发生过 */
  if (dec.ismaros_plunder) decEcho.push(`伊斯玛洛斯你「${dec.ismaros_plunder}」`);
  if (dec.lotus_fruit) decEcho.push(`食莲岛的莲子你「${dec.lotus_fruit}」`);
  if (dec.cyclops_name) decEcho.push(`巨人问名时你「${dec.cyclops_name}」`);
  if (dec.telepylos_ship) decEcho.push(`忒勒皮洛斯的最后一条船你「${dec.telepylos_ship}」`);
  if (dec.aeolia_winds) decEcho.push(`风神岛的袋口你「${dec.aeolia_winds}」`);
  if (decEcho.length) paras.push("这一路你的选择——"+decEcho.join("；")+"。没有一个是白选的：它们在每一片海都留了回声。");
  if (state.songsSung && state.songsSung.length) paras.push(`有 ${state.songsSung.length} 段路你没亲自走完，是德摩多科斯在篝火边替你唱的——歌比人诚实，它把那几页补上了。`);
  if (stay){
    paras.push("你留在了奥吉吉亚。永生的锁合上，日历重新开始走——第一件要数清的，是你为了什么留下来。没有归乡，只有滞留。她不提这件事，她也什么都不提。");
  } else if (guest){
    paras.push("你留在了斯克里岛，做费埃克斯的客人。白港的日子明亮，德摩多科斯的歌里多了一个名字——听仔细，那唱的是你。家有时不是地名，是有人认真留你。");
  } else if (bpath){
    paras.push("你在伊萨卡的码头转过身。王宫的火光留在雾里，弓和斧都退回了传说——你把一路捡到的碎片（"+[state.sunBlessed?"光":null, state.raft.wood?"手艺":null, state.talesTold.length?"被唱过的故事":null, "药草的香"].filter(Boolean).join("、")+"），安进了自己的海。伊萨卡不是你的家——路是。");
  } else {
    paras.push(state.calypsoChoice==="raft"
      ? "奥吉吉亚的黄昏被你自己划破了。海面上第一条自己划出来的尾迹——那是你的，谁也拿不走。"
      : "你最终离开了那座完美的岛。滞留的岁月算数，但它没有赢——你还在往前走。");
    if (state.guest) paras.push("瑙西亚娅的白港你来过两回：一回被救，一回告别。客人的名字，歌里唱得比王还长。");
    else if (state.talesTold.length) paras.push(`斯克里岛的篝火边，你如实讲了 ${state.talesTold.length} 段——德摩多科斯的歌里从此有你。被唱出来，就是被记住。`);
    else paras.push("斯克里岛的歌里没有你的名字——故事被你讲成了牛，或者根本没讲。世界不接谎，歌也一样。");
    /* P1.9 忒勒玛科斯（17g 原著第 16 卷）：父子相认 / 雾里擦肩 */
    if (state.telRevealed) paras.push("你先抱了儿子，再赢回妻子——荷马写这一段用了整整两卷：一个练了二十年的字，和一场并肩的仗。（原著 · 父子相认）");
    else if (state.telMet) paras.push("你儿子问你有没有见过那个人，你说没有。你们在雾里擦肩——像两个守着同一个秘密的陌生人。（他还在等）");
    /* F6 大厅肃清（17h 原著第 22 卷）：打没打、跟谁打，判词各有一句 */
    if (state.suitorsSwept) paras.push(state.telRevealed
      ? "大厅肃清：一百零八支矛，你们父子两代一一对账。荷马第 22 卷写的就是这场并肩的仗。（原著 · 大厅肃清）"
      : "大厅肃清：一百零八支矛对过了账。有几箭没人看清——总有一只灰眼睛替你挡过最重的那一下。（原著 · 大厅肃清）");
    if (state.examAsked) paras.push(state.examScar&&state.examBed
      ? "相认之前，她先考了你两问：脚疤的来历、婚床的根——一处都没答错。她考的从来不是名字，是只有他知道的秘密。佩涅洛佩的审判，你通过了。（原著 · 脚疤与婚床）"
      : "相认之前她考了你两问，你没能全答上。她记下了——可她还是听完了你最后报的名字。爱与不轻信，原来是同一件事。");
    if (way==="old") paras.push("相认的那一刻，你答了旧名——那个亡者替你记住的名字。它领你进门，像替别人开门。");
    else if (way==="sun" && name) paras.push(`相认时你说：「${name}。」——太阳记过的名字，王后也认。`);
    else if (way==="calypso" && name) paras.push(`相认时你说：「${name}。」——那是连永生都没能换走的名字。`);
    else if (way==="noone") paras.push("相认时你用回那个假名——「无人」赢了一夜，却空了十年。最安全的名字，也是最空的；此刻你终于不再需要它。");
    else if (way==="sung") paras.push("相认时你说：「歌里唱过的那个名字。」——被歌手唱进诗行的人，回得去自己的家。");
    else if (way==="circe") paras.push("相认时你说出了炉火旁的名字——埃阿亚岛留灯那夜的呼唤。它暖过你一整年，也留了一道血脉在极西的海岸上：岛上的孩子会问，父亲的海在哪边。");
    else if (way==="input" && name) paras.push(`相认时你说：「${name}。」——这名字不在任何族谱上。是你自己挣来的。`);
    else if (way==="none") paras.push("相认时你沉默了。无名者进了无名门——王后却认得这份沉默：她等的就是不靠名字的人。");
  }
  const tails=[];
  if (state.scyllaDebtPaid) tails.push("「不怪你」三个字，你带到了。喀耳刻的岛天亮了，海底的静水也还亮着。");
  const windLeft=state.backpack["风袋"]||0;
  if (windLeft) tails.push(`风袋里还剩 ${windLeft} 阵风。贪念那次，放过了你。`);
  if (tails.length) paras.push(tails.join(" "));
  /* 命运双轨总结（玩家=奥德修斯：荷马之线 / 改写命运）——原著锚点全达成 vs 偏离被记住 */
  const fate = fateSummary();
  if (fate.allCanon)
    paras.push(`🏆【荷马之线 · 全本】${fate.anchorGot} 处原著锚点你一处没改——${fate.anchors.map(a=>a.n).join("、")}，全都在。你不是在重走史诗：你就是史诗本身。`);
  else if (fate.devGot.length)
    paras.push("🔮【改写命运的人】"+fate.devGot.map(d=>d.dev).join("；")+"。荷马没写这一页——从今往后，歌手们得自己学这首新歌。");
  else if (fate.anchorGot>0)
    paras.push(`命运锚点：你守住了 ${fate.anchorGot}/${fate.anchorTotal} 处原著分岔${fate.anchorGot>=8?"——史诗认得你的脚印":"——有几页，你写岔了"}。`);
  /* 船队判词（17h 原著 12 艘）：从特洛伊带回几艘，史诗就记几艘 */
  paras.push(state.fleet>=12
    ? "十二艘船，一根桅杆都没少——从特洛伊的火光到伊萨卡的雾，满帆走完全程。荷马没敢写这一页。"
    : state.fleet>0
    ? `船队还剩 ${state.fleet} 艘。少掉的每一艘，海都记得是在哪个浪里没的——史诗也记得。`
    : "你的船队一艘不剩。你是踩着一根漂木回来的——荷马写下的，正是这一种。");
  /* 船员判词（P1.1 原著对齐）：「你带回来 N 个人」——从满船到「最后一人」，史诗各有一句 */
  const crewN = state.crew||0;
  paras.push(crewN<=0
    ? "船员一栏，你带回来的只有你自己。十二个名字留在了路上——每一个，海都记得是在哪片浪里没的。荷马数过一遍：他没有数错。（原著 · 最后一人）"
    : crewN>=12
    ? "十二个人，一个不少——你把整班人马带回了家门口的雾里。荷马没敢写这一页。"
    : crewN>=7
    ? `你带回来 ${crewN} 个人。甲板空了一半，但活着回家的每一个，都会把死者的名字唱下去。`
    : `你带回来 ${crewN} 个人。${crewN===1?"那一个名字跟着你走过了火与浪——他比十二个都重。":"他们和你一样，在怪物中间学会了活着回家。"}`);
  if (crewN>0 && Array.isArray(state.crewList) && state.crewList.length)
    paras.push(`活着回来的：${state.crewList.join("、")}。`);
  /* 掀筏判词（P1.6 原著第 5 卷）：波塞冬的那一记，史诗也记一笔 */
  if (state.raftStormDone) paras.push(state.raftStormFail
    ? "波塞冬掀翻过你的筏——你曾把面纱推回去一次，海收了筏，没收你；第二次，白手圣母的手接住了下沉的人。（原著 · 毁筏的人游了三天）"
    : "波塞冬掀翻了你自己造的筏——白手圣母的面纱兜住了你，三天两夜，浪把你交还给海岸。（原著 · 毁筏的人游了三天）");
  else if (state.raftStormFail) paras.push("你把面纱推回去过一次，海把你推回奥吉吉亚——后来的事，歌里还没唱到。");
  /* P2.1 灰眼睛留名（17g 原著第 22 卷末·雅典娜止战）：A 路走完时她最后看一眼——从不留名 */
  if (mode==="a") paras.push("家门口的雾散时，一双灰眼睛在橄榄树影里看了你最后一眼——没留名。可十年里每一次逆风都绷着你的帆，每一次迷航都有人替你认过路。你朝雾里点了一下头：往后不用了——回家的路，我自己认得。（原著 · 灰眼睛的守护）");
  /* P2.3 石化送客船（原著第 13 卷末）：你回头看的那一眼，把这一幕带进了史诗 */
  if (state.stonePillarDone) paras.push(state.stonePillarSeen
    ? "送行船回到港口那日，波塞冬在海上升起一根石柱——船成了石头，费埃克斯人从此不再载客。你回头看的那一眼，把这一幕带进了史诗。（原著 · 石化的船）"
    : "你到底没有回头。身后那声闷响，后来在费埃克斯人的歌里有了答案：一根石柱立在海面，船成了石头。守住了叮嘱的人，耳朵替他记下了结局。（原著 · 石化的船）");
  /* P2.7 哭海（原著第 5 卷）：七年里的黄昏，每天都做同一件无用的事 */
  if (state.gazeDone) paras.push("奥吉吉亚的七年你数不清——但你记得那些坐在滩上望海的黄昏：什么也不做，只看海。她站在你身后，也看。有些等待不是不动，是每天都做同一件无用的事。（原著 · 哭海）");
  /* P2.8 波塞冬怒值（17g）：你欠海神几笔账 */
  const pw = state.poseidonWrath||0;
  if (pw>=3) paras.push("海神的账上你欠了三笔：独眼巨人的诅咒、掀翻的筏、沉成石头的船。三笔都记着——你也活着回来了。史诗记得每一笔。（原著 · 波塞冬的账）");
  else if (pw===2) paras.push("海神的账上你欠了两笔——独眼巨人的诅咒，和那场掀筏的浪。海的利息还没收完，只是不急。（原著 · 波塞冬的账）");
  else if (pw===1) paras.push("海神的账上你欠了一笔——独眼巨人的诅咒。浪底下有人在等，不急。（原著 · 波塞冬的账）");
  paras.push(stay ? "锁没有锁眼。它锁的从来不是门——是「回家」这两个字的发音。"
    : bpath ? "船头没有调向西，也没有调向东。你想去哪儿，哪儿就是船头。"
    : "船头调向西的时候，你认下了自己的名字——这一回，它是你的了。");
  const mem=(state.memory||[]).length;
  const ec=document.getElementById("endingCard");
  ec.querySelector(".ecKicker").textContent = stay ? "奥 德 赛 · 别 章" : guest ? "奥 德 赛 · 别 章" : "奥 德 赛 · 终 章";
  ec.querySelector(".ecTitle").textContent = stay ? "永 生 的 锁" : guest ? "客  卿" : bpath ? "另 一 片 海" : "航 程 的 回 声";
  ec.querySelector(".ecParas").innerHTML = paras.map(p=>`<p class="ecPara">${p}</p>`).join("");
  ec.querySelector(".ecStats").innerHTML =
    `<span class="stx">等级 <b>Lv.${state.level}</b></span>`+
    `<span class="stx">历练 <b>${state.xp}</b></span>`+
    `<span class="stx">钱袋 <b>${state.coins}</b> 德拉克马</span>`+
    `<span class="stx">被记得的事 <b>${mem}</b> 件</span>`+
    `<span class="stx">命运锚点 <b>${fate.anchorGot}/${fate.anchorTotal}</b>${fate.devGot.length?` · 改写 <b>${fate.devGot.length}</b>`:""}</span>`+
    (windLeft?`<span class="stx">风袋 <b>×${windLeft}</b></span>`:"");
  ec.classList.add("show"); sfx("bless");
  const finalName = (mode==="a" && way==="old") ? "旧 名" : (mode==="a" ? (name||"无名旅人") : null);
  ec.querySelector(".go").onclick = ()=>{
    state.freeSail=true; save(); ec.classList.remove("show");
    toast("航程归档了。海还长——去漂吧。（自由模式：航路全开）"); renderHUD();
    if (finalName) setTimeout(()=> showChapter("concept-art/09-伊萨卡.jpg","终 章 · 认 名", finalName, "游戏最后一张章节卡 · 标题是你的名字", "雾散尽了。往后每一张海图，都以这个名字命名。"), 450);
  };
  ec.querySelector(".re").onclick = ()=>{ askConfirm("尾 声","再 航 一 次","清空存档，从新的航程开始——这一步不可撤销。",null, "清空存档","不可撤销", "先看看结局","留着这段航程", ()=>{ localStorage.removeItem(SAVE_KEY); location.reload(); }, ()=>{}); };
}


// --- examStart (was main+990-1001, 12 lines) ---
function examStart(){
  sfx("alert");
  state.examAsked = true;
  addMemory("佩涅洛佩从楼上下来了——「外乡人，先答我一件小事」。二十年不轻信的人，开始考试", 5);
  showAsk("终 章 · 相 认 三 问","第 一 问 · 疤",
    "她终于从楼上下来，隔着三步站定——不靠近，也不让开。烛光把两个人的影子钉在墙上。\n「乞讨的人，宫里我见得多；手上有旧疤的，我也见得多。——先答这件小事：你腿上那道疤，是怎么来的？」",
    null, [
    {label:"「幼年在外祖父的山上猎野猪——獠牙从腿根撕下去，留到今天。」", hint:"帕尔纳索斯山 · 原著第 19 卷", fn:examScarOk},
    {label:"「从战马上摔的。」", fn:()=>examMiss("scar")},
    {label:"「乞丐的旧伤多了，谁记得哪一道是哪块石头。」", fn:()=>examMiss("scar")},
  ]);
}


// --- examScarOk (was main+1002-1010, 9 lines) ---
function examScarOk(){
  state.examScar=true; gainXp(20); sfx("bless"); feedback("medium");
  addMemory(state.boarKilled
    ? "第一问她答对了——野猪的獠牙。埃阿亚岛林子里那头拱玛草的，你亲手放倒过；这道疤认得它的同类"
    : "第一问她答对了——幼年猎野猪留下的疤，二十年前的旧账，你一口答上", 5);
  toast("她的梭子停在半空。「帕尔纳索斯……他总是说是那座山。」"+(state.boarKilled?"（第一章那头野猪——你亲手放倒过它的同类，这道疤不是编的。历练 +20）":"（二十年前的旧账，你一口答上。历练 +20）"));
  renderHUD(); save();
  examBedAsk();
}


// --- examBedAsk (was main+1011-1019, 9 lines) ---
function examBedAsk(){
  showAsk("终 章 · 相 认 三 问","第 二 问 · 床",
    "她抬眼看你——第一次正眼看你。\n「……答得像他。可『像』不算数。第二问：我这二十年守着的床——立在何处？」",
    null, [
    {label:"「一根活橄榄树——绕着树干建的寝殿，床腿生根在土里，谁也搬不走。」", hint:"原著第 23 卷 · 婚床之秘", fn:examBedOk},
    {label:"「象牙雕花的王床，铺着紫毯。」", fn:()=>examMiss("bed")},
    {label:"「我没进过你的寝殿——我一进大厅就被酒杯砸过。」", fn:()=>examMiss("bed")},
  ]);
}


// --- examBedOk (was main+1020-1026, 7 lines) ---
function examBedOk(){
  state.examBed=true; gainXp(20); sfx("bless"); feedback("large");
  addMemory("第二问她也答对了——婚床的腿是活橄榄树，根还扎在土里。她考的从来不是名字，是只有他知道的秘密", 5);
  toast("她盯着你看了很久很久——眼泪先落了下来。「床腿的根……这话，只有两个人知道。」（历练 +20）");
  renderHUD(); save(); achivTick();   /* 两问全对 → scar_proved 成就即时结算 */
  showNameCard();
}


// --- examMiss (was main+1027-1037, 11 lines) ---
function examMiss(which){
  if (which==="scar"){
    addMemory("第一问她摇头——脚疤的来历，你答岔了", 4);
    toast("她的眼睛暗了半分，没说话。梭子又动了起来：「……乞丐，是记不住自己的疤的。」");
    save(); examBedAsk();
  } else {
    addMemory("第二问她摇头——婚床立在何处，你答岔了", 4);
    toast("她摇头，声音很轻：「那棵树还在土里。你不是他——或者，还不是。」");
    save(); showNameCard();
  }
}


// --- showNameCard (was main+1039-1063, 25 lines) ---
function showNameCard(){
  const c=document.getElementById("nameCard");
  const frags=[];
  if (state.oldName) frags.push({way:"old", label:`「${state.oldName}」`, tip:"亡母在雾里唤过的名字——她没等到你回来"});
  else if (state.prophecy) frags.push({way:"old", label:"那个亡者替你记住的旧名", tip:"答旧名——被亡者认领的名字"});
  if (state.sunName) frags.push({way:"sun", label:`「${state.sunName}」`, tip:"太阳记过的名字"});
  if (state.calypsoName) frags.push({way:"calypso", label:`「${state.calypsoName}」`, tip:"你在永生面前报过的名字"});
  if (/无人|no\s*one/i.test(state.polNameGiven||"")) frags.push({way:"noone", label:"「无人」", tip:"洞里骗过巨人的假名——最安全的名字，也是最空的"});
  if (state.selfRevealed) frags.push({way:"sung", label:"歌里被唱出的名字", tip:"德摩多科斯的歌里有你——被唱出来，就是被记住"});
  if (state.circeLeft) frags.push({way:"circe", label:"炉火旁的名字", tip:"你在埃阿亚岛留过冬——那夜她唤你的名，会一直暖到终章"});
  document.getElementById("ncFrags").innerHTML =
    frags.map((f,i)=>`<button class="ncFrag" data-i="${i}" title="${f.tip}">${f.label}</button>`).join("")+
    (frags.length?`<button class="ncFrag none">继续做无名旅人</button>`:`<button class="ncFrag none">继续做无名旅人</button>`);
  c.querySelectorAll(".ncFrag").forEach(b=>{
    b.onclick = ()=>{
      if (b.classList.contains("none")){ c.classList.remove("open"); showFinale("a","none",null); return; }
      const f=frags[+b.dataset.i]; c.classList.remove("open");
      let nm = f.label.replace(/[「」]/g,"");
      if (f.way==="sung") nm = "奥德修斯";
      if (f.way==="noone") nm = "无人";
      showFinale("a",f.way,nm);
    };
  });
  c.classList.add("open");
}


// --- interact (was main+1217-1900, 684 lines) ---
function interact(){
  if (titleOn||chapterOn||mapOpen) return;
  if (scene==="world"){
    const is = islandNear();
    if (!is) return;
    if (!islandOpen(is)){ const g=GATES[is.scene]; toast((g&&g.hint)||`${is.name} —— ${is.note}`); return; }
    noteOnboarding("dock");
    if (is.scene==="hades"){
      scene = "hades";
      aiaPlayer.x = 2*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
      save();
      showChapter("concept-art/07-冥界之岸.jpg","第 二 章","冥 界","俄刻阿诺斯之岸 · 亡者之言","你在灰白的栈桥上靠了岸——这里的水不响");
      return;
    }
    if (is.scene==="aeolia"){
      scene = "aeolia";
      aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
      save();
      /* P1.8 二次求助被逐（原著第10卷）：风袋用光后再上岛——埃俄罗斯的逐客令 */
      if (state.windbagEmptied && !state.banishedFromAeolia){
        state.banishedFromAeolia = true;
        addMemory("旅人把风袋用光后又回到风神岛。埃俄罗斯的袍子第一次没有猎猎作响：「连神明都憎恨的人——离开我的岛。」", 5, "aeolus");
        achivTick(); renderHUD();
        showChapter("concept-art/maps/04-风神岛图.jpg","插 章 · 二 次 求 助","逐 客","风神岛 · 门在你身后关上了","他站在宫门口，袍子纹丝不动：「我给过你四阵顺风——你把它们一次放光了。回去吧。连神明都憎恨的人——离开我的岛。」\n（原著第 10 卷最冷的一句话 · 它现在属于你）");
        return;
      }
      showChapter("concept-art/maps/04-风神岛图.jpg","插 章","风 神 岛",state.banishedFromAeolia?"埃俄罗斯的浮岛 · 风都绕着你走":"埃俄罗斯的浮岛 · 十二风在此听差","云在脚下，风在手里——贪念除外");
      return;
    }
    if (is.scene==="strait"){
      scene = "strait";
      aiaPlayer.x = 2*ATS+ATS/2; aiaPlayer.y = 9*ATS+ATS/2;
      save();
      showChapter("concept-art/04-塞壬之歌.jpg","第 三 章","声 之 海 峡","塞壬的歌 · 斯库拉的六头 · 每一样都要付价","你只能选择：塞住耳朵，还是被绑着听。");
      return;
    }
    if (is.scene==="sun"){
      scene = "sun";
      aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
      save();
      showChapter("concept-art/05-太阳岛.jpg","第 四 章","太 阳 岛","赫利俄斯的圣牛 · 饥饿与誓言","牛群会说话，也会求你。饿是真的——誓言也是。");
      return;
    }
    if (is.scene==="ogggia"){
      scene = "ogggia";
      aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 9*ATS+ATS/2;
      state.clock = 17.5*60;   /* 日历冻结：登岛起，永远是同一个金色黄昏（圣经第五章） */
      save();
      showChapter("concept-art/06-奥吉吉亚-卡吕普索.jpg","第 五 章","奥 吉 吉 亚","卡吕普索的岛 · 完美的一天","同样的好天气，同样的果子，同样的篝火——日历在这里不再走。");
      return;
    }
    if (is.scene==="scheria"){
      scene = "scheria";
      aiaPlayer.x = 4*ATS+ATS/2; aiaPlayer.y = 9*ATS+ATS/2;
      save();
      showChapter("concept-art/08-斯克里岛.jpg","第 六 章","斯 克 里 岛","费埃克斯人的岛 · 有人性的驿站","这座岛不问你从哪来，只问你愿不愿意坐下——把故事讲完。");
      return;
    }
    if (is.scene==="ithaca"){
      scene = "ithaca";
      aiaPlayer.x = 4*ATS+ATS/2; aiaPlayer.y = 9*ATS+ATS/2;
      save();
      showChapter("concept-art/09-伊萨卡.jpg","终 章","伊 萨 卡","归乡，或者不归","你终于踏进那座传说中的城——雾散了，剩下的每一步都是你的。");
      return;
    }
    if (PROLOGUE_SITES[is.scene]) return enterPrologue(is.scene);
    scene = "aia";
    aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
    /* 暗线②收束：话带到了，回岛时债清——埃阿亚岛第一次天亮 */
    /* 圣经收官：四章打完回岛 → 喀耳刻指路第五章（判词迁移到终章认名后，见 showEnding） */
    if ((state.sunBlessed || state.sunWrath) && !state.farewellHint){
      state.farewellHint = true; state.epilogueDone = true;
      addAffinity(5); gainXp(20);
      addMemory("喀耳刻指着雾外的海：还有一座岛，完美得过分——去见了她，再谈归乡", 4);
      renderHUD(); save();
      showChapter("concept-art/02-女巫小屋.jpg","第 五 章 · 前 夜","雾 外 有 岛","她的炉火照着你背后的路","「太阳岛之后，还有一座岛。完美得过分的那种——去见她。再谈归乡。」");
      return;
    }
    if (state.scyllaDebtPaid && !state.sunlit){
      state.sunlit = true; addAffinity(10); gainXp(30);
      addMemory("旅人把「不怪你」带到了——埃阿亚岛第一次天亮", 4);
      renderHUD(); save();
      showChapter("concept-art/02-女巫小屋.jpg","尾声 · 第 一 章","埃 阿 亚 岛","债清了 · 岛上第一次天亮","她给你留了门。晨光落在绿泡坩埚上，药香是暖的。");
      return;
    }
    save();
    showChapter("concept-art/02-女巫小屋.jpg","第 一 章","埃阿亚岛","喀耳刻的领地 · 第勒尼安海","你在小岛南面的栈桥靠了岸");
    return;
  }
  const s = aiaNear();
  if (!s) return;
  if (PROLOGUE_SITES[scene]) return prologueSpot(s);
  if (s.type==="witch"){
    /* P1.2 蜜酒事件：立誓前与她照面，先走原著第10卷的「她请你喝一杯」（拒饮挂起后可回头再触） */
    if (!state.circeSworn) return meadEvent();
    return openDlg("witch");
  }
  if (s.type==="seer") return openDlg("seer");
  /* P0：风神埃俄罗斯此前没有任何分支接——走到宫门那个有名字有立绘的 NPC 身上按 E，
     什么都不发生（连「附近没有可互动的东西」都不提示，因为 aiaNear() 命中了）。
     结果：风袋（海图上明写着「风袋 · 顺风快旅」）永远拿不到，「释放四风」委托也从未被创建。 */
  if (s.type==="aeolus") return openDlg("aeolus");
  /* ---------- 声之海峡（第三章）交互 ---------- */
  if (s.type==="mast"){
    if (state.straitStage>=1){ toast(state.mastTied?"你还绑在桅杆上——歌已经听完了。":"耳朵已封上蜡。世界安静了，也包括歌。"); return; }
    state.mastTied=true; state.straitStage=1;
    if (state.status["士气"]==="振奋") state.status["士气"]="尚可";
    else if (state.status["士气"]==="尚可"||!state.status["士气"]) state.status["士气"]="低落";
    else if (state.status["士气"]==="低落") state.status["士气"]="消沉";
    state.lyricFragment=true; addItem("歌词残页");
    gainXp(15); feedback("medium"); sfx("bless");
    addMemory("旅人把自己绑上桅杆，听完了塞壬的整首歌", 4);
    showLyric();
    renderHUD(); save(); return;
  }
  if (s.type==="wax"){
    if (state.straitStage>=1){ toast(state.waxEars?"蜡还在耳朵里。歌与你无关——这很好，也很空。":"你已选了桅杆。"); return; }
    state.waxEars=true; state.straitStage=1;
    gainXp(10); sfx("pick");
    addMemory("旅人用蜡封住耳朵，安全驶过塞壬的海——这段歌在他的故事里缺了页", 3);
    toast("你把蜡揉软，塞进耳朵。世界闷了下去——歌声变成远处的嗡鸣。你安全了，但这段经历在你的故事里缺了一页。（终章的判词会记得这份沉默）");
    renderHUD(); save(); return;
  }
  if (s.type==="siren"){
    if (state.straitStage===0){ toast("歌声把理智泡得发软——先做选择：甲板上的蜡罐，或桅杆。"); return; }
    return openDlg("siren");
  }
  if (s.type==="scylla"){
    if (state.straitStage<1){ toast("歌还没处置。六头怪在她身后慢条斯理地数着你的行李。"); return; }
    if (state.straitStage>=2){ toast(state.scyllaDebtPaid?"海峡让出的静水还亮着。走吧，趁她没后悔。":"她已拿走她要的。别回头。"); return; }
    if (state.circeMessage){
      state.scyllaDebtPaid=true; state.straitStage=2;
      gainXp(30); feedback("large"); sfx("bless");
      addMemory("旅人把喀耳刻的「不怪你」带给了斯库拉——她沉入海底，海峡让出静水", 4);
      showChapter("concept-art/03-斯库拉海峡.jpg","第 三 章","海 峡 让 水","……她也放不下的那个人，是你吗？","她久久沉默，沉入海底。中间的静水亮了——「替我看着她。她不会对自己手下留情。」");
      renderHUD(); save(); return;
    }
    /* P1.1 挂点② + F5 斯库拉六头快反战（原著第12卷：六头各被叼走；有船员→进快反战，可救回改写） */
    if ((state.crew||0)>0){
      if (!SC.done) return startScyllaCombat();           /* 六头轮探：每头 0.6s 窗口按 E 砍/拉救回（改写机会） */
      showChapter("concept-art/characters/08-斯库拉.jpg","第 三 章","六 头 · 付 价","硬闯海峡的代价","六条颈子同时垂下来——每一条，都叼走了一名水手。船上安静得可怕。");
      if (!state.crewScylla){ state.crewScylla=true; loseCrew(6, "斯库拉的六根嘴各叼走了一名水手"); }   /* B-11：防门控改动后重复结算 -6 船员 */
    } else {
      showChapter("concept-art/characters/08-斯库拉.jpg","第 三 章","六 头 · 付 价","硬闯海峡的代价","六条颈子同时垂下来——不咬你，咬你的行囊。");
      const lost = takeShine(6);
      addMemory("旅人硬闯斯库拉海峡，六头怪叼走了他最亮的东西："+(lost.join("、")||"（行囊空空，咬的是他）"), 3);
    }
    state.straitStage=2;
    renderHUD(); save(); return;
  }
  if (s.type==="vortex"){
    if (state.straitStage>=2){ toast("漩涡还在原地打转——它不认输，但今天与你两清。"); return; }
    if (state.straitStage<1){ toast("先处置歌。漩涡的吸力正在给塞壬伴唱。"); return; }
    return gambleVortex();
  }
  if (s.type==="exit"){
    if (state.straitStage>=3){ toast("金光还在船尾荡漾——海峡已经在身后了。（栈桥码头在西边，随时可以出海）"); return; }
    if (state.straitStage<1){ toast("歌没听完就闯海峡，水手会跳海的。先选：蜡罐，或桅杆。"); return; }
    if (state.straitStage<2){ toast("海峡还没过去——北崖上的她还在等你的答案（或你的行李）。"); return; }
    state.straitCleared=true; state.straitStage=3;
    gainXp(25); sfx("bless"); feedback("large");
    addMemory("旅人穿过了声之海峡——出峡时，海面浮起大片金光", 4);
    toast("船冲出海雾的那一刻，海面浮起大片金光——太阳岛就在金光深处。（按 M 打开海图前往 · 历练 +25）");
    renderHUD(); save(); return;
  }
  if (s.type==="dock" && scene==="strait"){
    scene = "world";
    boat.x = 21*WTS+WTS/2+50; boat.y = 9*WTS+WTS/2+40;
    toast("你把船退出海峡。雾在身后合拢，像一本合上的书。");
    save(); return;
  }
  /* ---------- 太阳岛（第四章）交互 ---------- */
  if (s.type==="cattle"){
    if (state.sunWrath){ toast("牛群远远躲开你——它们的眼睛还记得那把刀。"); return; }
    return openDlg("cattle");
  }
  if (s.type==="slaughter"){
    if (state.sunWrath){ toast("圣血已经流过一次。再来一次，宙斯的雷不会数到二。"); return; }
    if (!state.slaughterWarn){
      state.slaughterWarn = true; renderHUD(); save();
      toast("刀出鞘了。牛群齐刷刷回过头——它们不跑，只是看着你。（再按一次 E，就是抉择；想回头就去找牛群说话，「借」是另一条路）");
      return;
    }
    state.sunWrath = true; state.slaughterWarn = false;
    state.hunger = 100; state.thirst = Math.min(100, state.thirst+30);
    state.status["士气"] = state.status["士气"]==="振奋" ? "尚可" : "消沉";
    addItem("牛肉",2);
    sfx("die"); feedback("large");
    addMemory("旅人宰了太阳岛的一头圣牛——饥饿赢了誓言", 4, "any");
    /* P1.1 挂点③/P1.3：鼓噪抉择已倒置（crewNoiseEvent），此处是玩家拦过之后（或旧档无船员时）仍硬宰的路径——
       挂点④并入硬宰分支；why 按是否拦过区分；此路不置 zeusStruck（canon「最后一人」只给睡着放任路径） */
    state.crewNoiseDone = true;
    state.crewSun=true; loseCrew(state.crew||0, state.crewSaved
      ? "你亲手举了刀——按住过的那双手，终究没能拦住你自己"
      : "宙斯的雷从阴云里追落——整船人没能跟你看到下一片海");
    toast("血腥味漫开的那一刻，天上的光暗了一分。你吃饱了——胃里是满的，心里是空的。（饱食回满 · 世界 flag「太阳记恨」：此后天色常阴）（获得 牛肉×2）");
    renderHUD(); save(); return;
  }
  if (s.type==="seaweed"){
    if (state.seaweedTaken){ toast("礁石上只剩干透的海藻渣——要等下一次潮水。"); return; }
    state.seaweedTaken=true;
    addItem("海藻"); sfx("pick"); gainXp(2);
    toast(`你从礁石上扯下一把湿淋淋的海藻（背包 ×${state.backpack["海藻"]}）。能生吃，也经得起烤。`);
    renderHUD(); save(); return;
  }
  if (s.type==="fishing"){
    const now=performance.now();
    if (now < (state.reefFishUntil||0)){ toast("竿梢还没歇过来——礁滩这边的鱼也要喘口气。"); return; }
    state.reefFishUntil = now + 70000;
    if (Math.random()<0.6){ addItem("鱼"); sfx("pick"); gainXp(3); toast("浮标一沉——一条银亮亮的鱼。（获得 鱼×1 · 历练 +3）"); }
    else { toast("浮标纹丝不动。鱼今天不饿——你饿。"); }
    renderHUD(); save(); return;
  }
  if (s.type==="sunfire"){
    if (state.backpack["鱼"]){ delItem("鱼"); addItem("烤鱼"); sfx("cook");
      toast("你把鱼串在枯枝上，架进圣殿旁的火盆。圣火烧得笔直，一点烟都不冒……（获得 烤鱼×1——比生吃顶饱得多）"); }
    else toast("火盆里的圣火烧得笔直。钓条鱼来，才不辜负这火。");
    renderHUD(); save(); return;
  }
  if (s.type==="sunAltar"){
    if (state.sunWrath){ toast("你抬头——云压得很低，金纹黯着。天上没有回应。"); return; }
    if (state.sunBlessed){ toast(`祭坛的金纹亮着。「${state.sunName||"旅人"}」，他记得你。光在你包里——走得过黑暗。`); return; }
    if (!isDusk() && !isNight()){ toast(`太阳还悬在天上——守住。撑到黄昏，他会来问你的名字。（现在：${clockName()}）`); return; }
    askText({
      kicker:"第 四 章 · 光", title:"你 叫 什 么 名 字",
      body:"赫利俄斯的声音从光里落下来。", quote:"（报上名字——真名也行，化名也行：神认得你，也会记住你报过的名字。）",
      placeholder:"……", okLabel:"报上名来",
      onOk:(nm)=>{
        const name = (nm||"").trim();
        if (!name){ toast("（风把没说出口的名字吹散了。）"); return; }
        if (/奥德修斯/.test(name)){
          /* P0.1（17g 原著对齐）：你就是奥德修斯——赫利俄斯全知且认得你，报真名＝认亲，得光照旧 */
          state.sunBlessed = true; state.sunName = "奥德修斯";
          addItem("走得过黑暗的光");
          gainXp(40); sfx("bless"); feedback("large");
          addMemory("旅人对太阳神报出了真名——赫利俄斯认出了他：十年前的海风，和船员欠下的七群牛", 4, "any");
          showChapter("concept-art/05-太阳岛.jpg","第 四 章","光","你守住了 · 他认得你","「奥德修斯。」——「我认得这个名字，也认得你。你船员欠下的七群牛，我记着账。但你守住了誓言。带一缕光走吧——它走得过黑暗。」");
          renderHUD(); save(); return;
        }
        state.sunBlessed = true; state.sunName = name;
        addItem("走得过黑暗的光");
        gainXp(40); sfx("bless"); feedback("large");
        addMemory(`旅人守住了太阳岛——他把名字报给了赫利俄斯：「${name}」，得到一缕「走得过黑暗的光」`, 4, "any");
        showChapter("concept-art/05-太阳岛.jpg","第 四 章","光","你守住了 · 他认得你",`「${name}。」……（金光里有一声很轻的笑——他听得出这不是你生来的名字，但他收下了你的守誓。）「带一缕光走吧——它走得过黑暗。」`);
        renderHUD(); save();
      },
      onCancel:()=>{ toast("（你把沉默咽了回去。黄昏还没结束——想好了再来。）"); },
    });
    return;
  }
  if (s.type==="sunDock"){
    scene = "world"; state.sunStage = 1;
    boat.x = 26*WTS+WTS/2+46; boat.y = 9*WTS+WTS/2+30;
    toast(state.sunBlessed ? "离岛时，风向变了——这一次不是谁送你的风，是你自己的。（第四章 · 完）"
      : state.sunWrath ? "你离开时，天上滚过一声闷雷，浪头高了三分。"
      : "你解缆离岛——那群牛还在金色的草场上，看着你的船变小。");
    save(); return;
  }
  /* ---------- 奥吉吉亚（第五章）交互：日历冻结的三天 → 问正题 → 永生选择 / 造筏教学闭环 ---------- */
  if (s.type==="calypso"){
    if (state.calypsoChoice==="stay"){
      /* 软锁修复：选「留下」后补回切入口——可再留，也可改主意回到造筏线；否则栈桥/木料/筏台全按非 raft 拒绝，主线连锁卡住 */
      showAsk("第 五 章 · 永 生","改 主 意 了 吗","永生的锁合上了——可门还开着。她坐在织机前，没有回头。","（留下，就再坐一会儿；想走，筏台一直在海湾等你。）",[
        {label:"再留一会儿", hint:"享受这完美的一天", fn:()=>{
          state.ogygiaDay = (state.ogygiaDay||0)+1;
          if (state.ogygiaDay%3===1) addMemory("奥吉吉亚又一个一模一样的好天气——果子是昨天的甜，海是昨天的蓝，只有日子在往后拖", 2, "calypso");
          toast("她没回头，指尖的经纬却慢了半拍：「日子还长。」"); renderHUD(); save();
        }},
        {label:"改主意——我要走", hint:"重新把筏造出来", fn:()=>{
          state.calypsoChoice="raft";
          addMemory("旅人推开永生，改了主意——回到海上", 4, "calypso");
          toast("她点头，像早知道会这样：「筏台在海湾。木料、时辰、储粮——把你一路学的全用上。」");
          renderHUD(); save();
        }},
      ]);
      return;
    }
    /* P0 修复：崩溃档（stage=3 且 choice=null）必须能重入正题——原先一律 openDlg，主线永久卡死 */
    if (state.calypsoStage>=3 && state.calypsoChoice){ return openDlg("calypso"); }
    if (state.ogygiaDay<2){ return openDlg("calypso"); }
    return oggiaMainAsk();
  }
  if (s.type==="fruit"){
    if (state.appleTaken){ toast("枝头上最后一枚金苹果已经摘了——剩下的还青着。"); return; }
    state.appleTaken=true;
    addItem("金苹果"); sfx("pick"); gainXp(2);
    state.ogygiaDay = Math.max(state.ogygiaDay, 1);
    addMemory("旅人在奥吉吉亚摘了一枚金苹果——岛上第「一」天，和每一天一样", 2, "calypso");
    toast("果子离手就熟，甜得不像真的。抬头时天色和昨天一模一样——这岛的日历，停了。（背包 +金苹果×1 · 历练 +2）");
    renderHUD(); save(); return;
  }
  if (s.type==="loom"){
    state.ogygiaDay = Math.max(state.ogygiaDay, 2);
    addMemory("旅人看了卡吕普索的织机——白天织开的布，夜里被她自己拆掉", 3, "calypso");
    toast("经纬间是一件给谁穿的袍子。她指尖不停：「白天织，夜里拆。你问为什么？」她笑，「岛上的女人总得有点事做。」（她注意到了你——正题快了）");
    save(); return;
  }
  if (s.type==="timber"){
    if (state.calypsoChoice!=="raft"){ toast("树影在暮光里一动不动。现在砍它做什么呢——岛上一应有尽有。"); return; }
    if (state.raft.wood>=3){ toast("木料够了，堆在筏台边——三根，一根不多，一根不少。"); return; }
    state.raft.wood++; sfx("attack"); feedback("small");
    toast(`斧刃记得它的活——第 ${state.raft.wood}/3 根木料倒下。（这是第一章就学会的事）`);
    renderHUD(); save(); return;
  }
  if (s.type==="windstone"){
    if (state.raft.wind){ toast("石上的风向纹亮着：明晨，西南风起——出湾的时辰定了。"); return; }
    if (state.calypsoChoice!=="raft"){ toast("一块被风磨圆的黑石。风从它头顶过，留下细小的哨音。"); return; }
    state.raft.wind = true; sfx("bless");
    addMemory("旅人在听风石上选了出湾的时辰——西南风，明晨", 2, "calypso");
    toast("你把手贴上黑石，像在风神岛上那样听——风向纹亮起：西南风，明晨。（这是插章学会的事 · 时辰 ✓）");
    renderHUD(); save(); return;
  }
  if (s.type==="raft"){
    if (state.calypsoChoice!=="raft"){ toast("筏台上木料齐整，像在等一个还没决定要走的人。"); return; }
    if (state.raft.food<2){
      const foods = Object.keys(FOOD).filter(n=>state.backpack[n]);
      const total = foods.reduce((s,n)=>s+state.backpack[n],0);
      if (total<2){ toast(`储粮还差得远——带 2 份吃得上路的（果子就在树上）。已放：${state.raft.food}/2 份`); return; }
      let put=0; for (const n of foods){ while(put<2 && state.backpack[n]>0){ delItem(n); put++; } }
      state.raft.food = put; sfx("pick");
      toast(`你把 ${put} 份口粮捆上筏台。（储粮 ✓）——采集、听风、储粮，这一路学的没一样白学。`);
      renderHUD(); save(); return;
    }
    toast("木料三根、时辰已听、储粮两份——去栈桥，把筏推进海里。");
    return;
  }
  if (s.type==="fire" && scene==="ogggia"){
    toast("篝火每晚在同一时刻烧旺。她坐在火边织布——白天织开的那件，正在她手里拆掉。");
    return;
  }
  if (s.type==="gaze" && scene==="ogggia"){
    /* P2.7（17g 原著第 5 卷）：奥吉吉亚七年，夜夜坐滩望海而泣——「无用但真」的动作 */
    if (state.gazeDone){ toast("（你又在滩上坐了一会儿）海还是那片海。她也还站在你身后三步——谁都没说话。"); return; }
    state.gazeDone = true; gainXp(10);
    addMemory("旅人在奥吉吉亚的滩上望海——你望着海，她望着你", 4, "calypso");
    toast("你在滩上坐下来，什么也不做，只看海。浪把日历冲得一动不动。\n——身后传来很轻的脚步：她也来了，站在你身后三步，不说话。你们望的是同一片海，想的不是同一件事。（原著 · 哭海 · 历练 +10）");
    renderHUD(); save(); return;
  }
  if (s.type==="ogDock"){
    if (state.calypsoChoice!=="raft"){ toast("栈桥下，海水把同一个浪推上来又收回去了。完美得让人心慌。"); return; }
    if (!(state.raft.wood>=3 && state.raft.wind && state.raft.food>=2)){
      const miss=[]; if(state.raft.wood<3)miss.push(`木料 ${state.raft.wood}/3`); if(!state.raft.wind)miss.push("出湾的时辰"); if(state.raft.food<2)miss.push(`储粮 ${state.raft.food}/2`);
      toast(`筏还没成——缺：${miss.join("、")}。（这一路学的：砍伐、听风、储粮——把全游戏走一遍）`); return;
    }
    const depart = ()=>{
      scene = "world"; state.ogygiaLeft = true;
      boat.x = 29*WTS+WTS/2+40; boat.y = 12*WTS+WTS/2+30;
      gainXp(40); sfx("bless"); feedback("large");
      addMemory("旅人自己造的筏出了湾——海面上第一次出现他自己划出来的尾迹", 5);
      renderHUD(); save();
      showChapter("concept-art/06-奥吉吉亚-卡吕普索.jpg","第 五 章","尾 迹","完美的岛在身后合上，像一本读完的书",`她站在栈桥上没有挥手。海面上，第一次出现你自己划出来的尾迹——「${state.calypsoName||"无名旅人"}，风会记路。」（历练 +40 · 斯克里岛已解锁）`);
    };
    if (!state.calypsoName){
      askText({
        kicker:"第 五 章 · 尾 迹", title:"最 后 一 次 问 你",
        body:"卡吕普索站在栈桥上。她最后一次问：「你是谁？」",
        quote:"（说一个名字——或者不填，让她记住一个无名的人。）",
        placeholder:"……", okLabel:"说 出 来",
        onOk:(nm)=>{
          state.calypsoName = (nm||"").trim() || null;
          if (state.calypsoName) addMemory(`出湾前，旅人对卡吕普索说出了自己的名字：「${state.calypsoName}」`, 4, "calypso");
          depart();
        },
        onCancel:()=>{ state.calypsoName = null; depart(); },
      });
      return;
    }
    depart();
    return;
  }
  /* ---------- 斯克里岛（第六章）交互：不接谎的船 + 回顾章 + 告白 + 送行 ---------- */
  if (s.type==="nausicaa"){ return openDlg("nausicaa"); }
  if (s.type==="talefire"){
    if (state.scheriaStage>=2){
      /* P1.5 旧档补场：回顾讲完但没赶上特洛伊段的存档——德摩多科斯还在，琴还在 */
      if (!state.troySongDone){ trojanSongEvent(); return; }
      toast("火塘边的位置还空着——故事已经讲完了，歌也记下了。"); return;
    }
    const CH = [
      ["troy","第零章 · 木马之夜","火把、城墙，和十二艘船"],
      ["ismaros","第一站 · 伊斯玛洛斯","喀科恩人的酒，和酒瓮边的伤者"],
      ["lotus","第三站 · 食莲岛","一颗莲子，和一个不想走的人"],
      ["cyclops","第四站 · 独眼巨人","羊腹、火桩，和你说出口的名字"],
      ["telepylos","第六站 · 忒勒皮洛斯","崖上的石头，和最后一条船"],
      ["witch","第一章 · 女巫的账","玛草、野猪，和一个把门留给你的女巫"],
      ["hades","第二章 · 亡者之言","献祭之沟，和两条路的预言"],
      ["aeolia","插章 · 风的账","四阵被囚的风，和一只风袋"],
      ["strait","第三章 · 声之海峡","蜡、桅杆，和六头怪开出的价"],
      ["sun","第四章 · 太阳岛","饥饿、誓言，和一个名字"],
      ["ogggia","第五章 · 完美的天气","金苹果、织机，和一条永远走不完的海岸"],
    ];
    /* 抉择回声：把一路的关键抉择揉进篝火引言——她听见的不只是章节，还有你的选择 */
    const dec = state.decisions||{};
    const decBits = [];
    if (dec.troy_fire) decBits.push(`特洛伊那一夜，你${/放下/.test(dec.troy_fire)?"放下了火把":"烧了城"}`);
    if (dec.mead) decBits.push(`蜜酒前你选了「${dec.mead}」`);
    if (dec.sea_wreckboat) decBits.push(`遇难小艇前你选了「${dec.sea_wreckboat}」`);
    const decLine = decBits.length ? "\n\n（她还记得你路上的选择："+decBits.join("；")+"。如实讲，这些都会进歌里。）" : "";
    /* 到访判定：航迹 + 各段自己的结算痕迹（兼容老档没记 legs 的情况） */
    const wasThere = (id)=>{
      const leg = {witch:"aia"}[id] || id;
      if (state.legs[leg]) return true;
      if (id==="troy") return !!state.troyDone;
      if (id==="ismaros") return !!state.ismarosDone;
      if (id==="lotus") return !!state.lotusDone;
      if (id==="cyclops") return !!state.cyclopDone;
      if (id==="telepylos") return !!state.telepylosDone;
      if (id==="witch") return !!getQuest("witch_grass");
      if (id==="hades") return !!(state.prophecy || state.prophetMet);
      if (id==="aeolia") return !!state.aeoliaDone;
      if (id==="strait") return !!(state.straitCleared || state.straitStage>=2);
      if (id==="sun") return state.sunStage!=null || !!state.sunBlessed || !!state.sunWrath;
      if (id==="ogggia") return !!state.ogygiaLeft;
      return false;
    };
    (async ()=>{
      for (const [id,title,hint] of CH){
        /* C 方案兜底：没到过的段，由德摩多科斯替你唱完——故事不因跳岛而缺页 */
        if (!wasThere(id)){
          if (!state.songsSung.includes(id)) state.songsSung.push(id);
          await askChoice("篝 火 · 别 人 的 歌", title,
            "你没有到过这里——火塘对面的盲歌手替你唱了这一段。",
            "（德摩多科斯替你唱：不必答，听着就好。没走过的路，歌里替你走。）", [
            {label:"听下去", hint:"进歌", v:1},
          ]);
          addMemory(`德摩多科斯替旅人唱完了没到过的「${title}」`, 3, "nausicaa");
          continue;
        }
        const v = await askChoice("篝 火 · 一 路 讲 来", title, hint, "（她托着腮等你开口——如实讲的段落才会进德摩多科斯的歌；吹牛，歌里不唱。）"+decLine, [
          {label:"如实讲", hint:"进歌", v:1},
          {label:"吹牛讲", hint:"更好听，但歌里不唱", v:0},
        ], "tale_"+id);
        if (v===1){
          if (!state.talesTold.includes(id)) state.talesTold.push(id);
          addMemory(`瑙西亚娅听了旅人如实讲的「${title}」`, 3, "nausicaa");
        }
      }
      state.scheriaStage = 2;
      gainXp(30); feedback("large");
      addMemory(`旅人在篝火边讲完了这一路——如实讲的段落共 ${state.talesTold.length} 段`, 4, "nausicaa");
      toast(`故事讲完了。她安静了很久：「都记下了。」（如实讲的 ${state.talesTold.length}/${CH.length} 段会进德摩多科斯的歌${state.songsSung.length?` · 替你唱了 ${state.songsSung.length} 段`:""} · 历练 +30）`, 4200);
      renderHUD(); save();
      setTimeout(trojanSongEvent, 900);   /* P1.5 特洛伊段：盲歌手唱到木马——你落泪（原著第8卷），插在回顾与告白之间 */
    })();
    return;
  }
  if (s.type==="ship"){
    if (state.scheriaStage<2){ toast("船缆系得整整齐齐，像在等一个还没被看见的人。（先去篝火，把你的故事讲完）"); return; }
    if (state.guest){   /* C-8：客卿线在码头给「留下做客 / 改主意回家」二选一，接上 showFinale("guest") 变体 */
      showAsk("第 六 章 · 客 卿","留 下 还 是 登 船",
        "瑙西亚娅留你做费埃克斯的客人——码头上的船也备好了。","你当初点了头留下；改主意也不怪你。",[
        {label:"留下做客 · 客卿", hint:"终章：斯克里白港", fn:()=>showFinale("guest")},
        {label:"还是想回家", hint:"解缆回伊萨卡", fn:()=>{ state.guest=false; scheriaShipAsk(); }},
      ], "scheria_guest");
      return;
    }
    scheriaShipAsk();
    return;
  }
  if (s.type==="scDock"){
    toast("码头上泊着一排黑船首的快船。水手们修补帆角，谁也不问你要去哪——费埃克斯人送所有旅人回家。");
    return;
  }
  /* ---------- 伊萨卡（终章）交互：化名考场 → 十二斧 → 「你是谁」认名 ---------- */
  if (s.type==="cloak"){
    if (state.disguise){ toast("斗篷穿在你身上，粗得扎人——正好，没人会看第二眼。"); return; }
    state.disguise = true; state.ithacaStage = Math.max(state.ithacaStage, 1);
    sfx("pick");
    addMemory("旅人在伊萨卡换上乞丐的斗篷——比试从低头开始", 4);
    toast("斗篷一披，权杖一拄，你把自己叠进人群的影子。（化名入城 · A 路开启——宴厅里的求婚者没认出你）");
    renderHUD(); save(); return;
  }
  if (s.type==="telemachus"){
    /* P1.9 忒勒玛科斯：另一个也在找他的人——相认抉择（认＝canon father_son；不认＝无名线照旧） */
    if (state.telRevealed){
      if (state.finaleDone) toast("他按着矛守在船边。「判词写完了，父亲。下一程海很长——替我在每片海都留下名字。」");
      else if (state.suitorsSwept) toast("「母亲还在楼上。」他说，眼睛亮得很，「去吧——告诉她，不用再拆那架布了。」");
      else toast("「父亲。去见母亲——把名字亲口告诉她。大厅里剩下的一百多支矛，我们一起算。」");
      return;
    }
    if (state.finaleDone){ toast("他望着海：「你说过没见过他。……可我总觉得，见过你的人有福了。」"); return; }
    if (state.telMet){ toast("他还站在原地望着海。「又多问了一个。」他自嘲地笑笑，「有些相认，晚一点也比不认好——我是说，总会认的。」"); return; }
    state.telMet = true;
    telemachusEvent(); return;
  }
  if (s.type==="suitors"){
    /* F6 大厅肃清战（17h 原著第 22 卷）：拉弓后（stage>=3）再去宴厅＝求婚者发现弓开了，拔刀反扑。
       不强制（penelope 考试门控 stage>=3 不动，老档零风险）；打过即 canon hall_swept。 */
    if (state.ithacaStage>=3 && !state.suitorsSwept && !state.examAsked && !state.finaleDone){
      if (!SU.on) startSuitorCombat();
      return;
    }
    if (state.suitorsSwept){ toast(state.telRevealed?"大厅已经肃清。血渍擦干净之前，弓先挂在墙上。":"大厅已经肃清。最后几箭是谁放的——没人问，你也没说。"); return; }
    if (state.suitorsFooled){ toast("他们又输了一场掷骰，没人再看门口的乞丐一眼。"); return; }
    if (!state.disguise){ toast("宴厅的喧闹扑面而来。穿着自己的脸走进去？——先去墙角拿那件斗篷。"); return; }
    askText({
      kicker:"终 章 · 大 厅", title:"老 叫 花，叫 什 么 名 字",
      body:"为首的斜着眼，用脚尖踢了踢你的瓦罐。",
      quote:"（报一个化名——别报真名，更别报那个人的。）",
      placeholder:"化名……", okLabel:"报 上 名 来",
      onOk:(nm)=>{
        const a = (nm||"").trim();
        if (!a){ toast("你把沉默嚼碎了咽下去。他们丢了块骨头过来，哄笑着走了。"); return; }
        if (/奥德修斯/.test(a)){
          hurtPlayer(15, "冒名");
          addMemory("旅人险些对求婚者报出「奥德修斯」——被酒杯砸中了肩膀（他们不知道，他们砸的是真的）", 4);
          toast("满厅突然安静——然后炸成哄笑。一只酒杯砸在你肩上：「你也配姓这个名字！」（伤势 -15 · 再想一个名字）");
          renderHUD(); save(); return;
        }
        state.suitorsFooled = true; state.ithacaStage = Math.max(state.ithacaStage, 2);
        gainXp(25); sfx("bless");
        addMemory(`旅人用化名「${a}」骗过了求婚者的眼睛`, 4);
        toast(`「${a}是吧。」他们丢给你半块面包，转头继续掷骰。谎言是乞丐的斗篷——你穿上了。（骗过求婚者 ✓ · 历练 +25）`);
        renderHUD(); save();
      },
    });
    return;
  }
  if (s.type==="axes"){
    if (state.ithacaStage<2){ toast("十二道斧环在暮色里排成一线。大厅里全是别人的刀——还不是时候。"); return; }
    if (state.ithacaStage>=3){ toast("十二道斧环还亮着——弦响过的痕迹，像十二道门。"); return; }
    state.ithacaStage = 3;
    gainXp(30); sfx("bless"); feedback("large");
    addMemory(state.sunBlessed ? "旅人拉满了弓——那缕「走得过黑暗的光」顺着箭杆亮了" : "旅人拉满了弓——十二道斧环，一箭穿过去", 5);
    toast(`弦响十二次。（${state.sunBlessed?"包里那缕光顺着箭杆亮起——太阳记得你。":"箭杆擦着每一道斧环的边缘飞过去——像它认得路。"}大厅安静了，然后是刀出鞘的声音。（历练 +30））`);
    renderHUD(); save(); return;
  }
  if (s.type==="penelope"){
    if (state.ithacaStage<3){ toast("织机声从楼上下来，不紧不慢。她还不知道大厅里发生了什么——或者，早就知道。"); return; }
    if (state.finaleDone){ toast("「我认得我认的名字。」她说。楼下的海，在等你的下一程。"); return; }
    if (!state.examAsked){ examStart(); return; }   /* P1.7 相认三问：名字是第三问，先考疤与床 */
    showNameCard(); return;
  }
  if (s.type==="itDock"){
    if (state.ithacaStage>=1 && !state.finaleDone){
      showAsk("终 章 · 码 头","回 船，还 是 留 下","码头就在脚下。回船，转身——伊萨卡不一定是你的家。","（B 路：把一路捡到的碎片，安进另一座岛、另一个人、另一片海。）",[
        {label:"转身离开（B 路）", hint:"把碎片安进别处", fn:()=>showFinale("b")},
        {label:"留下，把它走完", hint:"大厅里还有人等你", fn:()=>toast("你转过身，朝大厅走回去。——好。把它走完。")},
      ]);
      return;
    }
    scene = "world";
    boat.x = 16*WTS+WTS/2+40; boat.y = 13*WTS+WTS/2+30;
    toast(state.finaleDone ? "你再次踏上伊萨卡的滩涂——判词已经写下，海还在等你。"
      : "伊萨卡的浪拍着码头。城里的火光很远，雾还没散。");
    save(); return;
  }
  if (s.type==="trench"){
    if (state.offered){ toast("献祭沟里酒与粮的痕迹还在——亡者已经听过你的来意，不必再献第二回。"); return; }
    const need=["蜂蜜酒","面包","淡水"], miss=need.filter(n=>!state.backpack[n]);
    if (miss.length){
      toast(`献祭需要蜂蜜酒、面包、淡水各一——还缺：${miss.join("、")}。埃阿亚岛的女巫卖蜂蜜酒。`);
      return;
    }
    need.forEach(n=>delItem(n));
    state.offered = true; sfx("cook"); feedback("large");
    gainXp(20);
    addMemory("旅人把蜂蜜酒、面包与淡水倒进了献祭之沟", 3, "seer");
    popText(11*ATS+ATS/2, 3*ATS, "亡者开口了", "#9fd8cf", true);
    toast("你把蜂蜜酒、面包与淡水倒进沟里。黑暗深处传来低语，像无数人同时叹了口气——特瑞西阿斯显形了。（历练 +20）");
    renderHUD(); save(); return;
  }
if (s.type==="mother"){
    /* P1.4 亡母安提克勒娅（原著第11卷）：三次想抱、三次抱空——第三次她先开口，叫你的旧名 */
    if (state.oldName){
      /* 记忆支付（P1.4 增补·待实装）：对亡者讲一段真的过去，他们能"活"一炷香；讲过的记忆变淡（碎片标记"已支付"，三章塞壬唱不出这段） */
      const pay = payMemoryToDead();
      if (pay) return;
      toast("她还站在雾里，还是抱不到。但她叫过的那个名字你带在身上——像多了一颗心。（旧名已进终章认名候选）");
      return;
    }
    state.motherHug = (state.motherHug||0)+1;
    if (state.motherHug===1){
      sfx("dash");
      addMemory("冥界的雾里，旅人想抱住一个女人——手臂穿了过去。她没有躲，只是退了半步", 3);
      toast("你张开手臂——穿过了雾。她身上有十年前的灶灰味，和一句没说完的话。（再试一次）");
      save(); return;
    }
    if (state.motherHug===2){
      sfx("dash");
      addMemory("第二次，旅人又抱空了。她的影子淡得像水底的月亮——可她在往你这边倾", 4);
      toast("第二次抱空。她淡得像水底的月亮——但你看见她在往你这边倾。她剩下的话，只够说一件事。（最后一次）");
      save(); return;
    }
    state.motherHug = 3; state.oldName = "奥德修斯";
    sfx("bless"); feedback("large"); gainXp(25);
    addMemory("第三次，旅人没有再抱——她先开了口，声音像从很远的水面漂来：「奥德修斯」。她说她是一天天听着这个名字空下去的", 5);
    toast("第三次，你没再伸手。她先开了口：「奥德修斯……我没能等到你。你的家还有人守着，你的儿子已经出海去找你了。」\n（历练 +25 · 亡母替你记住的名字，进了终章认领候选）", 5200);
    achivTick(); renderHUD(); save(); return;
  }
  if (s.type==="achilles"){
    /* P1.4 阿喀琉斯的过河账（原著第11卷原话） */
    if (state.achillesHeard){ toast("持矛的影子不再开口——他把话说尽了：活着做个雇工，强过在死人里称王。"); return; }
    state.achillesHeard = true; sfx("warn");
    addMemory("持矛的影子告诉旅人：他宁可活着给人扛活，也不愿在死者中间称王——荣耀的价钱，他付过了", 4);
    toast("高个子的影子转过身，你认得那杆矛。「别羡慕我。」他说，「我宁可活在世上做个帮工，也不愿在死人中间称王。荣耀的价钱——我付过了。」\n（阿喀琉斯的话 · 记忆 +1）", 4800);
    save(); return;
  }
  if (s.type==="agamemnon"){
    /* P1.4 阿伽门农的过河账（原著第11卷）：他警告的正是终章的化名考场 */
    if (state.agamemnonHeard){ toast("戴金面的王摇着头，只重复一件事：别信港口的迎接——先试家里的水。"); return; }
    state.agamemnonHeard = true; sfx("warn");
    addMemory("戴金面的王告诉旅人他的死法：欢迎他的宴席是一张网。他让旅人发誓——回家别信港口的迎接，先试家里的水", 4);
    toast("戴金面的王开口，声音里有恨：「欢迎我的宴席是一张网——她亲手织的。」他盯着你，「回家那天，别信港口的迎接。先试家里的水，对谁都留一手。」\n（阿伽门农的账 · 终章的化名考场，有个死人在雾里替你垫过话）", 5400);
    save(); return;
  }
  if (s.type==="dock" && scene==="hades"){
    scene = "world";
    boat.x = 2*WTS+WTS/2+40; boat.y = 8*WTS+WTS/2;
    toast("你离开死者的国度，回到生者的海");
    save(); return;
  }
  if (s.type==="dock" && scene==="aeolia"){
    /* B2 必经短章：四风没放完不能走；走之前把「袋口」这一次抉择问掉 */
    const freed = (state.windFreed||[]).filter(Boolean).length;
    if (freed < 4){
      toast("四座石牢还锁着风——先把它们都放出来。（放满四阵风，埃俄罗斯才把风袋交给你）");
      return;
    }
    if (!state.aeoliaDone){
      showAsk("第 五 站 · 风 神 岛","袋 口 朝 哪",
        "四阵风都收进了牛皮袋。埃俄罗斯把袋口递到你手里，自己退开一步。",
        "「风是借的，不是给的。」——袋口现在归你。",
        [
          {label:"系紧袋口，留到真需要时", hint:"风袋 4 阵 · 原样带走", fn:()=>{
            state.aeoliaDone = true;
            addMemory("旅人把风袋系紧——四阵风一声不响地跟着船走了", 3, "aeolus");
            renderHUD(); save();
            toast("（这一段已经记进航程。再按 E 离岛。）");
          }},
          {label:"先松一松，讨个好风", hint:"风袋 −1 · 士气 振奋", fn:()=>{
            state.aeoliaDone = true;
            if (state.backpack["风袋"]) delItem("风袋",1);
            state.status["士气"]="振奋";
            addMemory("旅人松开袋口，放走一缕风——船身立刻轻了，埃俄罗斯没有回头", 3, "aeolus");
            renderHUD(); save();
            toast("（这一段已经记进航程。再按 E 离岛。）");
          }},
        ], "aeolia_winds");
      return;
    }
    scene = "world";
    boat.x = 17*WTS+10; boat.y = 8*WTS+10;
    toast("你顺着云梯回到海面，风神岛在头顶渐渐远了");
    save(); return;
  }
  if (s.type==="wind"){
    if (state.windFreed[s.idx]){ toast(`${WIND_DIRS[s.idx]}已经自由了——它正在头顶打转。`); return; }
    state.windFreed[s.idx] = true;
    sfx("bless"); feedback("medium");
    questEvent("wind");
    const q = getQuest("aeolia_winds");
    gainXp(8);
    addMemory(`旅人释放了被囚的${WIND_DIRS[s.idx]}`, 2, "aeolus");
    popText(s.x, s.y-26, `${WIND_DIRS[s.idx]}获释`, "#dff2ff", true);
    toast(`${WIND_DIRS[s.idx]}从石牢里冲天而起，绕着浮岛打了三个旋。${q?`（${q.name} 进度 ${q.have}/${q.need}）`:""}（历练 +8）`);
    renderHUD(); save(); return;
  }
  if (s.type==="altar"){
    toast(getQuest("aeolia_winds") && getQuest("aeolia_winds").done
      ? "祭坛上的风纹亮着——风袋归你保管，直到……你把它用光。"
      : "青铜祭坛上刻着十二道风的纹路，全都黯淡着。宫门口那位似乎有话跟你讲。");
    return;
  }
  if (s.type==="cauldron") return openCraft();
  if (s.type==="hermes"){
    /* P1.2 前置：赫尔墨斯（金杖少年）赠魔草 Moly——原著第10卷，破咒的唯一钥匙（一次性） */
    if (state.hermesMet){ toast("林间只剩一圈淡淡的金光，和杖尖挑起的一缕风。少年不在了——魔草在你行囊里。"); return; }
    state.hermesMet = true;
    addItem("魔草"); sfx("bless"); feedback("medium");
    gainXp(20); addAffinity(5);
    addMemory("赫尔墨斯（金杖少年）把一株黑根银花的魔草塞进旅人手里：「她的杯里不只是酒。」", 4, "any");
    toast("一个金斗篷的少年从林影里走出，双蛇杖上缠着风。「她请的酒，别空着手喝。」——他把一株黑根银花的草按进你掌心。（获得 魔草×1 · 历练 +20 · 好感 +5）");
    renderHUD(); save(); return;
  }
  if (s.type==="crewmen"){
    /* P2.4：立誓前=猪栏伏笔（眼睛太像人）；立誓后=恢复人形的水手（原著第10卷末） */
    if (state.circeSworn){
      if (state.crewmenSeen){ toast("水手们在溪边搓洗胳膊，谁也不看谁。有个人小声数着：「……还有十一个。」"); return; }
      state.crewmenSeen = true; gainXp(25); sfx("bless"); feedback("medium");
      addMemory("咒解了——猪栏里拱出来一队刚恢复人形的水手，浑身泥浆，见面先敬了个歪歪扭扭的礼", 4, "any");
      showChapter("concept-art/02-女巫小屋.jpg","第 一 章 · 幕 间","猪 栏 · 解 咒","他们身上还有猪的影子","咒声落处，泥里拱出来的不再全是猪——十几个人影扶着栏杆站起来，浑身泥浆，见了你先愣住，然后一个个红了眼眶。「……头儿，」为首的哑着嗓子，「我们做了场好长的梦。」\n（船员记起你了。这批班底会跟着你走完剩下的海——前提是，剩下的海别再吃人。）");
      renderHUD(); save(); return;
    }
    toast("猪栏里几头猪在泥里打滚。最老的那头抬头看了你一眼——那双眼睛，清醒得不像牲口。（先去和女巫把话说清）");
    return;
  }
  if (s.type==="grass"){
    if (state.grassNodes[s.id]){ toast("这丛玛草已经采光了——根茎还在，要些日子才再抽芽。"); return; }
    state.grassNodes[s.id]=true;
    addItem("玛草");
    questEvent("collect", {item:"玛草"});
    const wq = getQuest("witch_grass");
    sfx("pick");
    toast(`采到一株玛草（背包 ×${state.backpack["玛草"]}${wq&&!wq.done?`，进度 ${wq.have}/${wq.need}`:""}）`);
    renderHUD(); save(); return;
  }
  if (s.type==="spring"){
    addItem("淡水");
    state.thirst = Math.min(100, state.thirst+25);
    sfx("pick");
    toast(`溪水灌满水囊（淡水 ×${state.backpack["淡水"]}），你也捧了一把喝——口渴缓解了。`);
    renderHUD(); save(); return;
  }
  if (s.type==="altar"){ toast("石碑的字迹被苔藓吃掉了大半……「向海而行者，先问风。」"); return; }
  if (s.type==="boar"){
    /* 战斗：E 键结算（属性/命中由本地逻辑层算，agent 不参与数值）。
       tired=硬直喘气，暴击窗口 ×1.5；伤害走 derived()（等级+装备修正层） */
    const tired = boar.mode === "tired";
    const dmg = Math.floor((derived().atk + Math.floor(Math.random()*5)) * (tired ? 1.5 : 1));
    boar.hp -= dmg; boar.hitAt = performance.now();
    /* 命中多通道反馈：粒子爆发 + 受击压缩（squash&stretch）+ 击退（knockback） */
    burst(boar.x, boar.y-4, tired ? "#ffd23e" : "#ff9d5c", tired ? 14 : 8, tired ? 90 : 62, tired ? 3 : 2.4);
    { const kx = boar.x-aiaPlayer.x, ky = boar.y-aiaPlayer.y, kd = Math.hypot(kx,ky)||1, kb = 24;
      tryMoveBoar(boar.x + kx/kd*kb, boar.y); tryMoveBoar(boar.x, boar.y + ky/kd*kb); }
    sfx("attack"); feedback(tired ? "medium" : "small");
    popText(boar.x, boar.y-22, `-${dmg}`, tired ? "#ffd23e" : "#ff9d5c", tired);
    let msg = tired
      ? `趁它喘气的空当，你狠狠补上一击！（-${dmg}，弱点打击 ×1.5）`
      : `你挥起${state.equipped?"【"+state.equipped+"】":"拳头"}，给野猪刷刷两下（-${dmg}）`;
    if (boar.hp <= 0){
      boar.alive = false; state.boarKilled = true;
      addItem("野猪肉"); sfx("die"); feedback("large");
      burst(boar.x, boar.y, "#6e4b32", 18, 110, 3.4); burst(boar.x, boar.y-6, "#ff6b5e", 10, 90, 2.6);
      gainXp(25);
      addMemory("旅人杀了拱坏玛草的野猪", 3);
      msg = `野猪哼了一声，倒在草丛里。（获得 野猪肉×1 · 历练 +25）——拱坏女巫玛草的就是它。祭坛旁的篝火正旺，也许能烤点什么。`;
    } else if (tired){
      boar.mode = "idle";
    }
    toast(msg); renderHUD(); save(); return;
  }
  if (s.type==="fire"){
    if (state.backpack["野猪肉"]){
      delItem("野猪肉"); addItem("烤野猪肉"); sfx("cook");
      toast("你把野猪肉架在篝火上，油星噼啪作响……（获得 烤野猪肉×1，对女巫说「用烤野猪肉」可恢复 40 血）");
    } else if (state.backpack["烤野猪肉"]){
      toast("篝火烧得正旺。背包里的烤野猪肉趁热吃——对女巫说「用烤野猪肉」");
    } else if (state.backpack["鱼"]){
      toast("篝火烧得正旺。这条鱼适合太阳岛圣殿旁的火盆——那里烤出来的没有烟味。");
    } else {
      toast("篝火烧得正旺。架点什么上去烤才不浪费——比如，某头野猪身上的肉。");
    }
    renderHUD(); save(); return;
  }
  if (s.type==="dock"){
    /* 好感度门槛剧情（原著骨：喀耳刻留宿一年、生忒勒戈斯——好感≥85 托付时触发留宿线；不刷满也可直接走） */
    if (state.affinity>=85 && !state.circeLeft){
      state.circeLeft = true; renderHUD(); save();
      showChapter("concept-art/02-女巫小屋.jpg","第 一 章 · 结 局","埃 阿 亚 岛 · 留 灯","她留你过冬","炉火一夜没熄。她按着你的手背，声音比平时软：「……留下。岛上的日子不算日子，我试过，不走冬夏。」\n你犹豫了一瞬——那个叫归乡的东西，在远处轻轻响了一下。\n（好感托付线达成：这段留宿，会记进你终章认名的答案里。）");
      return;
    }
    scene = "world";
    boat.x = 17*WTS+WTS/2+34; boat.y = 5*WTS+WTS+34;
    toast("你扬帆离开埃阿亚岛，回到地中海");
    save(); return;
  }
  /* 兜底：新增点位若忘了接分支，不要静默吞掉——玩家按了 E 却毫无反应，
     连「附近没有可互动的东西」都看不到（因为 aiaNear() 命中了），最无从排查。
     这里给一句明确提示（回归脚本也能据此断言「点位有分支」）。 */
  toast("（这里暂时没有可做的事。）");
}


// --- showChapter (was main+1903-1913, 11 lines) ---
function showChapter(img,kicker,title,sub,quote){
  const c=document.getElementById("chapterCard");
  if (img) c.style.backgroundImage = img.startsWith("linear-gradient") ? img : `url('${img}')`;
  else c.style.backgroundImage="linear-gradient(175deg,#e8eef7 0%,#9db4cd 34%,#3f5f82 68%,#16283e 100%)";
  c.querySelector(".ccKicker").textContent=kicker;
  c.querySelector(".ccTitle").textContent=title;
  c.querySelector(".ccSub").textContent=sub;
  c.querySelector(".ccQuote").textContent=quote||"";
  c.classList.add("show"); c.removeAttribute("aria-hidden"); chapterOn=true;
  clearTimeout(chTimer); chTimer=setTimeout(skipChapter, Math.min(9000, 3000 + (quote||"").length*45));   /* 时长随引言伸缩：3s 读不完 80~140 字的引言（45ms/字，上限 9s；点击/按键仍可提前跳） */
}


// --- showAsk (was main+1926-1943, 18 lines) ---
let askMeta = null;
function showAsk(kicker,title,sub,quote,options,decId){
  askMeta = {kicker,title,decId};
  askOpts = options;
  const c = document.getElementById("askCard");
  c.querySelector(".ccKicker").textContent = kicker;
  c.querySelector(".ccTitle").textContent = title;
  c.querySelector(".ccSub").textContent = sub||"";
  c.querySelector(".ccQuote").textContent = quote||"";
  const bar = c.querySelector(".askOpts"); bar.innerHTML = "";
  options.forEach((o,i)=>{
    const b = document.createElement("button");
    b.className = "askBtn";
    b.innerHTML = `<span class="abKey">${i+1}</span><span>${o.label}</span>` + (o.hint?`<span class="abHint">${o.hint}</span>`:"");
    b.onclick = ()=>pickAsk(i);
    bar.appendChild(b);
  });
  c.classList.add("show");
  askOn = true; chapterOn = true;   /* 复用全局门控（移动/交互/海图全锁） */
}


// --- askChoice (was main+1956-1960, 5 lines) ---
function askChoice(kicker, title, body, quote, options, decId){
  return new Promise((resolve)=>{
    showAsk(kicker, title, body, quote, options.map((o)=>({ label:o.label, hint:o.hint, fn:()=>resolve(o.v) })), decId);
  });
}


// --- askConfirm (was main+1961-1966, 6 lines) ---
function askConfirm(kicker, title, body, quote, yesLabel, yesHint, noLabel, noHint, onYes, onNo, decId){
  showAsk(kicker, title, body, quote, [
    { label: yesLabel||"确定", hint: yesHint, fn: onYes||(()=>{}) },
    { label: noLabel||"取消", hint: noHint, fn: onNo||(()=>{}) },
  ], decId);
}


// --- askText (was main+1968-2002, 35 lines) ---
function askText({kicker, title, body, quote, placeholder, okLabel, onOk, onCancel}){
  const c = document.getElementById("askCard");
  c.querySelector(".ccKicker").textContent = kicker||"";
  c.querySelector(".ccTitle").textContent = title||"";
  c.querySelector(".ccSub").textContent = body||"";
  c.querySelector(".ccQuote").textContent = quote||"";
  const bar = c.querySelector(".askOpts"); bar.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:8px;width:100%";
  const inp = document.createElement("input");
  inp.id = "askTextInput"; inp.maxLength = 20; inp.placeholder = placeholder||"";
  inp.style.cssText = "flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(120,160,210,.4);background:rgba(6,14,26,.6);color:#fff;font-size:14px;outline:none";
  const okBtn = document.createElement("button");
  okBtn.className = "askBtn"; okBtn.innerHTML = `<span class="abKey">↵</span><span>${okLabel||"确定"}</span>`;
  wrap.appendChild(inp); wrap.appendChild(okBtn);
  bar.appendChild(wrap);
  let done = false;
  const submit = ()=>{
    if (done) return;
    const v = inp.value.trim();
    if (!v){   /* U-9：空内容拦截——有取消回调走取消，否则标红留停 */
      if (onCancel){ done = true; hideAsk(); onCancel(); return; }
      inp.focus(); inp.style.borderColor="#e08080"; return;
    }
    done = true; hideAsk(); if (onOk) onOk(v);
  };
  okBtn.onclick = submit;
  inp.addEventListener("keydown", (e)=>{
    if (e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); submit(); }
    if (e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); if (done) return; done = true; hideAsk(); if (onCancel) onCancel(); }
  });
  c.classList.add("show");
  askOn = true; chapterOn = true;
  setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 60);
}


// --- useWind (was main+2486-2505, 20 lines) ---
function useWind(){
  if (scene!=="world") return {text:"风袋得在海上放——回到船上，迎着风解开袋口。"};
  if (!state.backpack["风袋"]) return {text:"风袋是空的……不，是没了。"};
  delItem("风袋");
  const left = state.backpack["风袋"]||0;
  state.tailwindUntil = performance.now()+60000;
  /* 批次 I2：风袋把自然风也定成船头方向——袋里的是「你要的风」，放完之后一段时间内仍顺风 */
  const hv = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]}[boat.face]||[0,-1];
  windDir = Math.atan2(hv[1], hv[0]); windShiftT = 0;
  sfx("bless"); feedback("medium");
  let t = `你解开袋口——一阵顺风轰然灌进帆里，船头像被一只大手推了一把。（航速倍增一小段${left?`，袋里还剩 ${left} 阵风`:""}）`;
  if (!left){
    t += "\n……袋瘪了。贪念把风用光了——埃俄罗斯的话应验了。";
    state.windbagEmptied = true;   /* P1.8：用光后再上风神岛＝逐客（原著第10卷） */
    addMemory("旅人把风袋里的风用得一干二净", 2, "aeolus");
  }
  toast(t.replace("\n"," "));
  renderHUD(); save();
  return {text:t};
}


// --- openMap (was main+2634-2655, 22 lines) ---
function openMap(){
  if (titleOn||chapterOn) return;
  noteOnboarding("map");
  mapOpen = true;
  /* 本岛详图（odyssey-visual.md §九）：岛内按 M 看该岛羊皮纸详图，世界图保持全览 */
  const sm = SITE_MAPS[scene];
  const board = document.getElementById("mapBoard");
  board.classList.toggle("siteMap", !!sm);
  if (sm){
    board.querySelector("img").src = sm.img;
    board.querySelector("#mapHead .t").textContent = "详 图 · " + sm.name;
  } else {
    board.querySelector("img").src = "concept-art/maps/01-世界海图.jpg";
    board.querySelector("#mapHead .t").textContent = "海 图 · 地 中 海";
    buildMapMarks();
    const [bx,by]=boatMapPos();
    const b=document.getElementById("mapBoat");
    b.style.left=bx+"%"; b.style.top=by+"%";
  }
  document.getElementById("mapOverlay").classList.add("open");
  document.getElementById("stage").classList.add("mapOpen");   /* 常驻层让位浮层（game-ui-ux） */
  if (window.WorldMap) window.WorldMap.open();   /* 海图增强层：缩放/拖动/洋流/航迹/岛屿笔记 */
  sfx("pick");
}


// --- closeMap (was main+2656-2660, 5 lines) ---
function closeMap(){
  mapOpen = false;
  if (window.WorldMap) window.WorldMap.close();
  document.getElementById("mapOverlay").classList.remove("open");
  document.getElementById("stage").classList.remove("mapOpen");
}


// --- showLyric (was main+2693-2699, 7 lines) ---
function showLyric(){
  lastLyric = buildLyric();
  document.getElementById("lyricTitle").textContent = "塞 壬 之 歌 · 歌 词 残 页";
  document.getElementById("lyricText").textContent = lastLyric;
  document.getElementById("lyricCard").classList.add("open");
  sfx("bless");
}


// --- closeLyric (was main+2700-2700, 1 lines) ---
function closeLyric(){ document.getElementById("lyricCard").classList.remove("open"); }


// --- showSong2 (was main+2724-2731, 8 lines) ---
function showSong2(){
  lastLyric = buildSong2();
  document.getElementById("lyricTitle").textContent = state.selfRevealed
    ? "奥 德 修 斯 之 歌 · 德摩多科斯" : "无 名 旅 人 之 歌 · 德摩多科斯";
  document.getElementById("lyricText").textContent = lastLyric;
  document.getElementById("lyricCard").classList.add("open");
  sfx("bless");
}


// --- handleSeer (was main+3026-3072, 47 lines) ---
function handleSeer(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "查询神谕":
    if (!state.offered) return {text:"（他把杖往沟的方向一点）血未入沟，亡者不听活人说话。蜂蜜酒、面包、淡水——倒进沟里，再回来问我。"};
    /* P2 修复：已献祭的神谕是二章必经拍——原 return null 离线死循环（人格模型不可用→兜底台词→建议 chip 再循环）。神谕是 lore 锁定文案，交本地，不上模型 */
    return {text:"（他抬起没有瞳孔的眼）……两条路。阿喀琉斯的捷径：荣耀来得快，也走得快——浪头最高的地方等它。我的长路：困顿，疲惫，但每一步都朝着灯火。想好了，对我说「我选长路」或「我选捷径」。"};
  case "查询地点信息":   /* P2 修复：菜单示例「这里都有些谁？」离线原落兜底死循环 */
    return {text: state.offered
      ? "沟那边……一个抱着空襁褓的妇人，一个持矛的影子，一个戴金面的王。走近了，他们自会开口。"
      : "亡者的国不接待问询。先献祭——蜂蜜酒、面包、淡水，倒进沟里。"};
  case "其他意图":
    if (state.offered) return {text:"（他把杖点了两下石面）……活人的话太散。想问路，就说「我该走哪条路」；想选，就说「我选长路」或「我选捷径」。"};
    return {text:"（他把杖往沟的方向一点）血未入沟，亡者不听活人说话。蜂蜜酒、面包、淡水——倒进沟里，再回来问我。"};
  case "接取任务": {
    const t=g("任务名称")||g("求助内容")||"";
    if (/长路|归乡/.test(t)){
      state.prophecy="long"; renderHUD(); save();
      addMemory("旅人选了长路——困顿与归乡", 3, "seer");
      return {text:"（他久久不动，然后极轻地点头）……长路。困顿，疲惫，但每一步都朝着灯火。记住：太阳岛的牛，一头都不可动。"};
    }
    if (/捷径|短|荣耀/.test(t)){
      state.prophecy="short"; renderHUD(); save();
      addMemory("旅人选了捷径——荣耀与速亡", 3, "seer");
      return {text:"（他叹了口气，像风穿过骨缝）……捷径。荣耀很快会追上你，在浪头最高的地方。"};
    }
    return {text:"亡者的国不派活计，只给路。想清楚了，说出你选的那条。"};
  }
  case "查询任务进度":
    return {text: state.prophecy ? (state.prophecy==="long"?"你选了长路。风会记得。":"你选了捷径。浪也会记得。") : "还没有什么是你的。"};
  case "查询任务线索":
    return {text: state.offered ? "问吧。神谕不等人，但先知等得起。" : "先献祭。然后，问回家的路。"};
  case "购买物品": case "卖出物品": case "查询价格": case "查询库存":
    return {text:"（他摇头）亡者不做买卖。要蜂蜜酒和面包，回生者的岛上去换。"};
  case "给予物品": {
    const item=g("物品");
    if (item==="蜂蜜酒"||item==="面包"||item==="淡水")
      return {text:"（他朝沟抬了抬下巴）不给我——给沟。站在沟边，把手上的东西倒进去。"};
    return {text:"（他没有伸手）我不收活人的东西，除非它从沟里来。"};
  }
  case "提交任务": return {text:"亡者不受差事，也不结账。"};
  case "放弃任务": return {text:"路不存在放弃，只存在走与不走。"};
  case "告别": return {text:"（杖点地的声音慢慢远去）……去吧。水会记得你走过的路。"};
  }
  return null;   /* 其余交给人格模型 */
}


// --- handleAeolus (was main+3075-3138, 64 lines) ---
function handleAeolus(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  if (state.banishedFromAeolia){
    /* P1.8 逐客之后（原著第10卷）：门已经关上——不再接任何差事与寒暄 */
    return {text:"（袍子纹丝不动。他不再看你）连神明都憎恨的人——离开我的岛。"};
  }
  switch(category){
  case "接取任务": {
    const q0 = getQuest("aeolia_winds");
    if (q0 && q0.done) return {text:"（他大笑，袍子猎猎作响）四风都认得你了！风袋也给你了——去海上用，别辜负它们。"};
    if (q0) return {text:`四座风牢还锁着 ${q0.need-q0.have} 座。它们在岛的四角，走近了按 E。`};
    const q = acceptQuest("aeolia_winds");
    if (q) q.have = state.windFreed.filter(Boolean).length;
    renderHUD(); save();
    addMemory("旅人接下了释放四风的委托", 2, "aeolus");
    return {text:"（他打了个哈欠，风跟着打了个旋）我的四个风仆贪玩，把自己锁进了岛角的石牢。去放它们出来——四座都开了，风袋就借你。"};
  }
  case "查询任务进度": {
    const q = getQuest("aeolia_winds");
    if (!q) return {text:"你我之间还没有风的约定。"};
    if (q.done) return {text:"四风已归位，风袋在你手里。用它，但别用光——贪念会应验。"};
    return {text:`「${q.name}」：${q.have}/${q.need} 座风牢已开。`};
  }
  case "查询任务线索": {
    const q = getQuest("aeolia_winds");
    if (!q) return {text:"（他朝四角各指了一下）四座风牢，四阵贪玩的风。放出来，我给你装一袋顺风——海上的硬通货。"};
    return {text:q.done?"风袋的事已经结清了。":`「${q.name}」：放出四风（${q.have}/${q.need}），报酬是一只装满顺风的皮袋。`} ;
  }
  case "提交任务": {
    const q = getQuest("aeolia_winds");
    if (!q) return {text:"拿什么交差？你还没接过我的活。"};
    if (q.done && q.turned) return {text:"风袋已经在你包里了。省着点用。"};
    const freed = state.windFreed.filter(Boolean).length;
    if (freed < 4) return {text:`（他竖起手指晃了晃）还差 ${4-freed} 阵风。石牢在岛的四角。`};
    q.done = true; q.turned = true;   /* set-once：防重复交付 */
    addItem("风袋", 4);
    gainXp(30);
    addMemory("旅人放出了四风，埃俄罗斯把装着四阵顺风的皮袋交给了他", 3, "aeolus");
    renderHUD(); save();
    return {text:"（他从腰间解下一只皮袋，袋口用青铜扣锁着）四阵顺风，阵阵能推船。一次放一阵——贪念把它们一次放光的话，别哭着回来找我。（获得 风袋×4 · 历练 +30）"};
  }
  case "使用消耗品": {
    const item=g("物品");
    if (item==="风袋") return useWind();
    if (item) return {text:`（他掂了掂风）${item}？风不管吃用。`};
    return {text:"要放风就直说——把「风袋」用上。"};
  }
  case "查询环境状况": {
    const e=g("要素");
    const m={"风向":"此刻是西风。我放的，错不了。","浪高":"浪听风的。风乖，浪就乖。","天气":"云是我岛的地基，今日铺得厚。","昼夜":"天色是太阳的事，风只管吹。","能见度":"云薄的时候，能望见斯库拉那边。","潮汐":"潮是月亮的账，风不插手。","水温":"云海之上的海，凉得干净。","危险程度":"（他笑了）海比你怕的安全些，比你以为的更险。"};
    return {text:m[e]||"（他舔了舔手指举起来）……这个方向的风刚换。办你的事去吧。"};
  }
  case "购买物品": case "卖出物品": case "查询价格": case "查询库存":
    return {text:"风不标价。诸向的风，只借给不贪的人。"};
  case "给予物品":
    return {text:"（他把手背到身后）我不收活人的东西——风会替我记账。"};
  case "放弃任务":
    return {text:"风不放也不走。你想好了再来。"};
  case "告别":
    return {text:"（他挥手，袍子灌满了风）去吧。顺风送你——省着点用。"};
  }
  return null;   /* 其余交给人格模型 */
}


// --- handleSiren (was main+3141-3157, 17 lines) ---
function handleSiren(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "购买物品": case "卖出物品": case "查询价格": case "查询库存":
    return {text:"（三姐妹笑起来，声音像潮水漫过船舷）歌声不找零，小水手。"};
  case "接取任务": case "提交任务": case "查询任务进度": case "放弃任务":
    return {text:"（她们交换了一个眼神）我们的活儿只有一件：唱。你的活儿……是听完。"};
  case "给予物品":
    return {text:"（她们不接——蜡、酒、面包，到了礁前都成了咸的）留着自己的行李吧，斯库拉在数呢。"};
  case "查询环境状况":
    return {text:"（歌声低了半度）雾、礁石、六条颈子——环境由不得你。由得了你的，只有耳朵。"};
  case "告别":
    return {text:"（歌声忽然温柔）走吧走吧……可你会想起这段旋律。在每一个安静的时候。"};
  }
  return null;   /* 闲聊/神谕/生物情报 → 人格模型 */
}


// --- handleCattle (was main+3160-3200, 41 lines) ---
function handleCattle(category, args){
  const t = lastUserText || "";
  const wantsBorrow = /借.{0,4}(一头|一匹|牛)|名字.{0,4}(作保|担保)|作保/.test(t) && !/不借|别借/.test(t);
  switch(category){
  case "请求帮助":
  case "购买物品":
    if (wantsBorrow) return borrowCattle();
    return null;   /* 其余落人格（牛群会讲规矩） */
  case "接取任务": case "提交任务": case "查询任务进度": case "放弃任务":
    return {text:"（母牛慢慢嚼着草）牛群不派活，也无差可交。我们只有一样东西能给你——和一个名字换的约定。"};
  case "查询任务线索":
    return {text:"（她抬眼看你）岛上的规矩就三条：守，宰，借。前两条你自己掂量。第三条——开口时，把你的名字押上。"};
  case "查询环境状况":
    return {text:"（牛群齐齐抬头望天）云压得低了。牛最懂天——天要变脸的时候，角尖会发凉。"};
  case "查询价格": case "查询库存": case "卖出物品":
    return {text:"（她眨了眨眼）生命不标价。肉不在买卖里——在誓言里。"};
  case "给予物品":
    return {text:"（母牛用鼻子碰了碰那东西，又轻轻推开）留着吧。你比我们更需要。"};
  case "获取物资":
    return {text:"（她朝西边滩涂慢慢转头）礁石上有海藻，东滩有鱼。饿的人不用羞愧——羞愧留给动刀的人。"};
  case "使用消耗品": {
    /* 太阳岛没有女巫：吃喝在牛群面前就地结算（生存循环不断链） */
    const item=g("物品");
    if (item==="风袋") return useWind();
    if(!state.backpack[item]) return {text:`（她嗅了嗅风）你身上没有「${item}」。`};
    let fx="（你在牛群面前安静地吃完。它们不看，但你松了口气。）";
    const f=FOOD[item], dr=DRINK[item];
    if(item==="治疗草药"){state.status["伤势"]="无"; state.hp=Math.min(derived().maxHp,state.hp+20); fx="（药力渗进伤口。母牛低低地哼了一声，像在应和——血量 +20。）";}
    else if(item==="烤野猪肉"||item==="烤鱼"){state.status["伤势"]="无"; state.hp=Math.min(derived().maxHp,state.hp+40); fx="（火气混着盐味下肚，伤势痊愈、血量 +40。牛群慢慢转开头，不去看。）";}
    else if(item==="牛肉"){fx="（太阳神的牛……你咬得很慢。胃里满了，别的什么瘪了下去。）";}
    if (f){ state.hunger=Math.min(100,state.hunger+(f.h||0)); state.thirst=Math.min(100,state.thirst+(f.t||0)); }
    if (dr){ state.thirst=Math.min(100,state.thirst+(dr.t||0)); }
    popText(aiaPlayer.x, aiaPlayer.y-26, item==="治疗草药"?"血 +20":f?`饱食 +${f.h}`:dr?`饮水 +${dr.t}`:"使用", "#7bd389");
    delItem(item); sfx("cook"); renderHUD();
    return {text:fx+`（${item} 已食用）`};
  }
  case "告别":
    return {text:"（牛群低下头继续吃草，像什么都没说过）去吧。趁太阳还看着。"};
  }
  return null;
}


// --- handleCalypso (was main+3218-3260, 43 lines) ---
function handleCalypso(category, args){
  const g2=(k)=>(args&&args[k]!==undefined&&args[k]!==null&&String(args[k]).trim()!=="")?String(args[k]).trim():null;
  switch(category){
  case "查询任务线索":
    if (state.calypsoChoice==="raft"){
      const miss=[]; if(state.raft.wood<3)miss.push(`木料 ${state.raft.wood}/3（岛西的丝柏，用斧子）`); if(!state.raft.wind)miss.push("出湾的时辰（东边听风石）"); if(state.raft.food<2)miss.push("两份储粮（果子，或你背包里的口粮）");
      return miss.length ? {text:`（她不看你，织着布）筏还缺：${miss.join("；")}。`} : {text:"（她把线头咬断）都齐了。去栈桥吧——别回头看我。"};
    }
    if (state.calypsoChoice==="stay") return {text:"（她放下织物）留下的人，不需要任务。想走的时候——筏台在海湾，一直没拆。"};
    if (state.ogygiaDay<2) return {text:"（她朝洞窟外抬抬下巴）果子熟了就摘，织机在那边——这岛上的日子，够你慢慢看。"};
    return {text:"（她停下织梭，第一次正面看你）……坐吧。有些话，再不说，你就真的住下了。"};
  case "接取任务":
    if (state.calypsoChoice!=="raft") return {text:"（她笑了一下）岛上无活可派——这里的一切自己长出来。要说活……想想你要什么。"};
    return {text:"（她递过一把旧斧）造筏的活是你自己的：三根木料、一个时辰、两份口粮。这一路学的，全用上。"};
  case "查询任务进度":
    if (state.calypsoChoice!=="raft") return {text:"（她把线绕上梭子）进度？岛上的日历都不走了，你急什么。"};
    return {text:`（她报得比你还熟）木料 ${state.raft.wood}/3，时辰${state.raft.wind?"已定":"未听"}，储粮 ${state.raft.food}/2。`};
  case "提交任务":
    return {text:"（她摇头，轻得像叹息）我这里没有差可交。你要交的账，在伊萨卡——或者在你自己手里。"};
  case "查询神谕":
    if (state.calypsoStage<3) return {text:"（她把一缕头发别到耳后）神谕？我就是神。你想要的答案，我留着——等你准备好听。"};
    return {text:"（她望着海）神谕只有一句：人不能同时要永生和归乡。你已经选了——剩下的，是把它走完。"};
  case "查询环境状况":
    return {text:"（她抬手试风，动作熟得像做过一万年）西南风，明天早晨。问这个做什么——要走的人才问风。"};
  case "获取物资":
    return {text:"（她指指洞窟外）果树上随便摘。这里的果子不知道什么叫坏——就像这里的日子。"};
  case "导航到地点":
    return {text:`（她用织梭指了方向）${g2("目的地")==="码头"||g2("目的地")==="栈桥"?"栈桥在南边，筏台在海湾东侧。":"洞窟里安静，织机在海风里。岛上不大——你会找到的。"} `};
  case "查询附近目标":
    return {text:"（她数着）果树在东，织机在洞窟口，听风石在坡上，筏台在海湾——还有一堆篝火，和一夕接一夕的黄昏。（要去哪，说「带我去×」就好。）"};
  case "闲聊":
    if (state.calypsoStage<3) return {text:"（她笑了笑）在岛上，闲聊是最正经的事——反正时间不走。"};
    return {text:"（她低下头继续织）问吧。反正你都要走了——人要走的时候，说话最大声。"};
  case "告别":
    return {text:"（她没抬头，线却停了一拍）……嗯。风口站着，容易着凉。"};
  case "其他意图":   /* P2 修复：离线菜单示例语（我想回家 等）原落 NPC_FALLBACK 且建议 chip 死循环 */
    if (state.calypsoChoice==="stay") return {text:"（她放下织物）留下的人不需要新话题。想再坐一会儿，或想走了——来洞窟口找我。"};
    if (state.calypsoStage>=3 && !state.calypsoChoice) return {text:"（她放下织梭，第一次正面看你）……正题还没谈完。到洞窟口来，我再问一遍——这次，你要亲口回答。"};
    if (state.ogygiaDay<2) return {text:"（她朝洞窟外抬抬下巴）果子熟了就摘，织机在那边——这岛上的日子，够你慢慢看。"};
    return {text:"（她停下织梭，第一次正面看你）……坐吧。有些话，再不说，你就真的住下了。到洞窟口来，我们谈正题。"};
  }
  return null;   /* 其余落人格 */
}


// --- handleNausicaa (was main+3263-3295, 33 lines) ---
function handleNausicaa(category, args){
  const g2=(k)=>(args&&args[k]!==undefined&&args[k]!==null&&String(args[k]).trim()!=="")?String(args[k]).trim():null;
  switch(category){
  case "查询任务线索":
    if (state.scheriaStage<2) return {text:"（她把湿发拢到耳后）想走？先去篝火那儿——把你的故事讲完。没人送一个没被看见的人。"};
    if (state.scheriaStage<3) return {text:"（她看着你，很快又移开眼）船明天备好。……你要说的话，最好在船来之前说完。"};
    return {text:"（她指着码头）船在等你。水手只会问你一句——家在哪。想好了再上船。"};
  case "接取任务":
    if (state.scheriaStage>=2) return {text:"（她笑出声）活都让你讲完了——去码头等船吧，客人。"};
    return {text:"（她拍拍身旁的石头）有个活：把你的航程讲给我听。篝火边，一段一段讲——如实讲，别糊弄我。"};
  case "查询任务进度":
    if (state.scheriaStage<2) return {text:"（她数着手指）五段故事，一段都没听全呢。去篝火边。"};
    return {text:"（她眼睛弯起来）五段都听完了。德摩多科斯今晚就有新歌——唱你的。"};
  case "提交任务":
    if (!state.nausicaaGift){ state.nausicaaGift = true; addItem("面包"); }   /* B-8：送行干粮落背包，一次性防重复刷 */
    return {text:"（她把一包干粮塞进你手里）这不算差——算送行的礼。上船吧。……别回头念这座岛的名字。（干粮 · 面包 +1）"};
  case "查询生物情报":
    return {text:"（她抱着膝）德摩多科斯看不见，可他记得每一句如实讲的话——吹牛的部分，歌会自动跳过去。世界不接谎，歌也不。"};
  case "查询环境状况":
    return {text:"（她望海）明天西南风，稳的——我父王的船最会借风。你是客人，好天气归你。"};
  case "获取物资":
    return {text:"（她指指橄榄园和退潮的滩）果子、海藻，随便拿——费埃克斯人的岛，不缺客人的口粮。"};
  case "导航到地点":
    return {text:`（她指方向）${g2("目的地")==="码头"?"码头在南边滩涂，黑船首那排。":"篝火在宫前草场——故事在那儿讲。"}`};
  case "查询附近目标":
    return {text:"（她如数家珍）篝火在草场，我的船停在滩上，父王的宫殿在坡上——还有德摩多科斯的琴，在宴厅里等着。（想去哪，说「带我去×」，我领你走。）"};
  case "闲聊":
    return {text:"（她踢着小石子）说起来……你讲故事的时候，比现在有趣多了。讲完故事的人，都这样。"};
  case "告别":
    return {text:"（她别过脸去）……嗯。风大。上船吧。（她朝码头挥手，很久才放下）"};
  }
  return null;   /* 其余落人格 */
}


// --- handleRebuilder (was main+3298-3322, 25 lines) ---
function handleRebuilder(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "查询地点信息":
    return {text:"（他朝半座焦城抬了抬下巴）东边木靶，练手用；北边战利品堆，没人要了；酒瓶堆里兴许还有整瓶的——刻了字的，别当好话。"};
  case "查询生物情报":
    return {text:"野猪早跑了。人比兽难防——那年我们就是被『你们』烧了城。（他盯着你，又低头砌墙）你忘了？我们没忘。"};
  case "接取任务": case "请求帮助":
    return {text:"活儿就是砌墙，你的手干不了这个。（他想了想）……去木靶练几矛吧。下回再有人来抢，这城想有人还得了手。"};
  case "给予物品": {
    const item=g("物品名称");
    if (item && /草药|药/.test(item)){
      if (!state.backpack["治疗草药"]) return {text:"（他看着你空空的手）好意收到了。药去埃阿亚岛的女巫那儿换。"};
      return {text:"……你自己去给他敷上。东边，躺着呢。（他转回去砌墙）这城欠你的。"};
    }
    return {text:"（他摆摆手）城还在修，什么都不缺——缺的时候，我们不问外人要。"};
  }
  case "查询神谕": case "查询环境状况":
    return {text:"预言？我们只信砌进墙里的每一块石头。"};
  case "告别":
    return {text:"（他没停手）走好。船别装太满——满船的人，容易忘事。"};
  }
  return null;
}


// --- handleLotusman (was main+3323-3351, 29 lines) ---
function handleLotusman(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "查询地点信息":
    return {text:"这岛呀，哪儿都是花。东边滩上莲最密——尝一颗？尝一颗就什么都不愁了。（他笑）不尝也行，风也好闻。"};
  case "查询生物情报":
    return {text:"鸟都不着急飞走。这儿没有天敌——愁就是这儿唯一的天敌。"};
  case "使用消耗品":
    if (state.lotusAte) return {text:"（他看你咧嘴）甜吧。忘了什么也别怕——忘了就是到家的意思。"};
    return {text:"莲子要现摘的才灵。东边，滩上。（他望着花）别怪我没提醒你甜的代价。"};
  case "给予物品": {
    const item=g("物品名称");
    if (item && /面包|淡水|鱼|肉/.test(item)) return {text:"（他接过，掰了一半还给你）你自己也吃。饿的时候，莲子更好——不，莲子最坏。看你要哪种饱。"};
    return {text:"（他把东西还给你）我什么都不缺。这儿什么都长——愁不长。"};
  }
  case "请求帮助":
    return {text:"（他认真想了想）我帮不了你走。我连自己往哪儿走都忘了……你可以尝颗莲子试试——然后就不想问了。"};
  case "威胁或攻击":
    return {text:"（他眨眨眼，笑意不减）打我做什么。这儿连石头都是软的。"};
  case "告别":
    if (!state.lotusGift && !state.lotusAte){
      state.lotusGift=true; addItem("莲子干"); save(); renderHUD();
      return {text:"（他从怀里摸出一小包）带着。晒干的，劲儿小——饿极了再吃，别空着嘴吃。走你的海去吧。（获得 莲子干）"};
    }
    return {text:"（他挥挥手，躺回花里）慢走。——明天见。（这儿没有明天，他说的明天就是今天）"};
  }
  return null;
}


// --- handlePolyphemus (was main+3352-3398, 47 lines) ---
function handlePolyphemus(category, args){
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "查询地点信息":
    if (!state.polHeard){ state.polHeard=true; state.namesHeard=true;
      /* P1.1 挂点①：独眼巨人 -6（原著第9卷：六名同伴被生吞——旧路重访时这笔旧账入册） */
      state.crewCyclops=true; loseCrew(6, "独眼巨人的洞里，六个人没能跟着羊群走出影子"); save();
      addMemory("旅人听盲眼巨人讲完了「无人」的账——那个假名和那声真名", 4, "polyphemus");
      return {text:"（他摸着羊背，声音像岩缝里的风）那年来了条船。领头的小东西给我酒喝，说他的名字叫『无人』。夜里他们戳了我的眼睛。我喊：『没有人』伤害我！——神明也没听懂我的祈祷。（他的手在羊毛上收紧）后来他把他们的人全绑在公羊肚皮底下，混出了洞——是我亲手把羊放出洞的，一只都没摸出来。从那天起，我数羊比数命还细。他逃出洞，朝海喊了自己的真名。（他顿了很久）从那天起，海开始替所有人记账。"}; }
    return {text:"故事讲完了。名字的事，你自己掂量。"};
  case "查询生物情报":
    return {text:"（他拍拍身边的巨羊）我的羊。不肥，但听话——听话，比聪明活得长。"};
  case "给予物品": {
    const item=g("物品名称");
    if (item && /酒/.test(item) && state.backpack["喀科恩酒"]){
      delItem("喀科恩酒",1); gainXp(10); save(); renderHUD();
      addMemory("旅人把喀科恩酒敬给了盲眼的巨人", 3, "polyphemus");
      return {text:"（他嗅了嗅，接过，一饮而尽）……和那晚一个味。那个喊『无人』的小东西，敬的酒也是这个味。（他把空瓶还你）瓶子留下。刻字归你。"};
    }
    return {text:"（他摆摆手）留着自己用。出海的东西，件件都要命。"};
  }
  case "获取物资":
    return {text:"（他朝羊栏偏了偏头）羊毛一人一件，剪吧。别贪第二件。"};
  case "威胁或攻击":
    return {text:"（他闻声转向，声音没抬）小东西，你的刀连我的皮都进不去。省下这个动作——去攒名字吧。"};
  case "查询自身状态":
    return {text:"（他听你报状态，像听风报信）活着就好。名字，比血难保。"};
  case "闲聊": case "其他意图": {
    const r=polyNameExam(window.lastPlayerText||"");
    if (r) return r;
    /* P1 修复：催话原文不教句式——玩家说了名字也被装聋（见 polyNameExam 注释），补上「怎么报」 */
    return {text:"（他侧着耳朵）你的话里有个名字。想说全——说「我是某某」。报名字之前，先想想海在不在听。"};
  }
  case "请求帮助":
    return {text:"我帮不了小东西。我能举起山，举不动自己那晚的事。"};
  case "告别":
    if (!state.polNameGiven){
      state.polNameGiven="（未报）"; save();
      return {text:"（他没回头）走前报个名字吧。不为记住你——为教你一件事：把名字喊给海听之前，想清楚。海替所有人记账。"};
    }
    return {text: state.polNameGiven==="（未报）"
      ? "（他朝羊栏的方向偏了偏头）你还没报呢。"
      : `（他朝羊栏的方向偏了偏头）「${state.polNameGiven}」。记住了。海也记住了——它记什么都不要钱。`};
  }
  return null;
}


// --- openDlg (was main+3653-3689, 37 lines) ---
function openDlg(npc){
  currentNPC = (npc && NPCS[npc]) ? npc : (scene==="hades" ? "seer" : scene==="aeolia" ? "aeolus" : scene==="strait" ? "siren" : scene==="sun" ? "cattle" : scene==="ogggia" ? "calypso" : scene==="scheria" ? "nausicaa" : "witch");
  const N = NPCS[currentNPC];
  if (!history[currentNPC]) history[currentNPC] = [];   /* 新 NPC 历史 lazy init（修 aeolia/siren 首开崩溃） */
  dlgOpen=true;
  document.body.classList.add("dlgOpen");
  document.getElementById("dlg").classList.add("open");
  /* 按当前 NPC 切换标题、副标与立绘（无立绘时用云海渐变兑底） */
  document.getElementById("dlgName").textContent = N.name;
  document.getElementById("dlgSub").textContent = npcSubFor(currentNPC, N.sub);   /* 生产环境隐藏技术标签（?debug=1 还原） */
  document.getElementById("dlgPortrait").style.backgroundImage = N.portrait ? `url('${N.portrait}')` : "";
  document.getElementById("dlgPortrait").classList.toggle("aeolusPortrait", !N.portrait);
  /* 输入框占位符按 NPC 定制（原实现全局硬编码「对女巫说点什么」——跟食莲者对话也提示对女巫） */
  document.getElementById("inp").placeholder = `对${NPC_SHORT[currentNPC]||N.name}说点什么……`;
  /* 重渲染历史消息与示例按钮（各 NPC 历史独立；历史回放用 instant 免打字机） */
  document.getElementById("dlgSub").textContent = npcSubFor(currentNPC, N.sub) + (currentNPC==="witch" ? " · 关系："+affinityProgress() : "");
  const memCount = state.memory.filter(m=>m.who===currentNPC||m.who==="any").length;
  if (memCount) document.getElementById("dlgSub").textContent += ` · 记得你的 ${Math.min(memCount,40)} 件事`;
  const rumorCount = rumorHeardCount(currentNPC);
  if (rumorCount) document.getElementById("dlgSub").textContent += ` · 听过 ${rumorCount} 条传闻`;
  document.getElementById("msgs").innerHTML = "";
  for (const h of history[currentNPC]) addMsg(h.role==="user"?"user":"witch", h.content, null, true);
  if (!history[currentNPC].length){
    const intro = currentNPC==="witch" ? witchIntro() : N.intro;
    /* 锐评 E（实玩批）：导航句式提示只给真的能导航的 NPC——重建者/食莲人等本地 handler
       没有「导航到地点」，玩家照提示说「带我去×」却被兜底拒绝，等于开场白在骗人。
       能力判定与 handle() 同源：HANDLED 表里注册了导航意图的 NPC 才带这句提示。 */
    const canNav = ((typeof HANDLED !== "undefined" && HANDLED[currentNPC]) || []).includes("导航到地点");
    const withHint = intro + (canNav ? "\n（小声说：一次讲一件事，我听得分明；要去哪儿，直接说「带我去×」。）" : "\n（小声说：一次讲一件事，我听得分明。）");   /* 意图解析引导：首开教玩家"分句"（multi 组/薄边界是模型短板，UI 侧零成本补救）；导航句式只教给有导航能力的 NPC */
    addMsg("witch", withHint);
    history[currentNPC].push({role:"assistant",content:withHint});
    /* 记忆流开场钩子：NPC 主动提「上次的事」（Generative Agents 状态可见化，每条记忆只提一次） */
    const mg = memoryGreeting();
    if (mg){ addMsg("witch", mg); history[currentNPC].push({role:"assistant",content:mg}); }
    /* 传闻开场钩子：没见过你的 NPC 也能从海路听说你的名声（每条只提一次） */
    const rg = rumorGreeting();
    if (rg){ addMsg("witch", rg); history[currentNPC].push({role:"assistant",content:rg}); }
  }
  document.getElementById("memStrip").style.display="none";   /* 每次开对话收起记忆条 */
  renderSamples();
  setTimeout(()=>document.getElementById("inp").focus(),50);
}


// --- closeDlg (was main+3705-3709, 5 lines) ---
function closeDlg(){
  dlgOpen=false;
  document.body.classList.remove("dlgOpen");
  document.getElementById("dlg").classList.remove("open");
  document.getElementById("inp").blur();
}


// --- closeDemo (was main+3883-3887, 5 lines) ---
function closeDemo(){
  const ov=document.getElementById("demoOverlay");
  ov.classList.remove("open");
  ov.querySelector("#demoBody").innerHTML="";
}

// === 全局声明（自主脚本迁入） ===

// --- HSPOTS (migrated from main script) ---
const HSPOTS = [
  {type:"seer",   x:seer.x, y:seer.y, r:85, label:"与特瑞西阿斯交谈"},
  {type:"trench", x:11*ATS+ATS/2, y:3*ATS+ATS/2, r:70, label:"献祭之沟（倒祭品）"},
  {type:"dock",   x:2*ATS+ATS/2, y:10*ATS+ATS/2, r:70, label:"返回生者的海"},
  /* P1.4 冥界三影（17g 原著第11卷）：亡母安提克勒娅（三次抱空）+ 阿喀琉斯 + 阿伽门农两笔过河账 */
  {type:"mother",   x:14*ATS+ATS/2, y:8*ATS+ATS/2,  r:70, label:"雾里的妇人"},
  {type:"achilles", x:14*ATS+ATS/2, y:4*ATS+ATS/2,  r:70, label:"持矛的影子"},
  {type:"agamemnon",x:13*ATS+ATS/2, y:10*ATS+ATS/2, r:70, label:"戴金面的王"},
];

// --- craftUI (migrated from main script) ---
let craftUI = null;

// --- SCENE_NPC (migrated from main script) ---
const SCENE_NPC = { aia:witch, hades:seer, aeolia:aeolus, oggggia:calypso, scheria:nausicaa };

// --- keys (migrated from main script) ---
const keys = new Set();

// --- dlgOpen (migrated from main script) ---
let dlgOpen = false;

// --- eBufAt (migrated from main script) ---
let eBufAt = 0;   /* 交互预按时间戳（input-systems 输入缓冲） */

// --- lastEmptyE (migrated from main script) ---
let lastEmptyE = 0;   /* U-6：空按提示节流戳记，避免刷屏 */

// --- titleOn (migrated from main script) ---
let titleOn = true, chapterOn = false, chTimer = null;

// --- askOn (migrated from main script) ---
let askOn = false, askOpts = [];   /* P1.2 选择卡（showAsk）：开着时锁移动/交互，数字键或点击选择 */

// --- gpActive (migrated from main script) ---
let gpActive = null, gpPrev = {};

// --- mapOpen (migrated from main script) ---
let mapOpen = false;

