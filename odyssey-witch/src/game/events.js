// ============================================================
// 奥德赛 · 游戏事件层 —— 序章/航行/岛屿事件
// 依赖 src/data/* + src/engine/core.js + src/render/scenes.js + src/interact/handlers.js
// ============================================================

/* 开场微节拍：先给一个真正要动手的动作，再把故事交到玩家手里。
   内容一字不删——只是从「先说十分钟」改成「先划一桨，想听再听」。 */
function noteOpening(kind){
  const b = state.openingBeat;
  if (b===undefined || b>=3) return;
  if (b===0 && kind!=="move") return;
  if (b===1 && kind!=="map" && kind!=="dock") return;
  if (b>=2) return;   /* 船歌一拍只由玩家自己选：听下去，或先走 */
  state.openingBeat = b+1;
  if (typeof renderOpening==="function") renderOpening();
}

/* 新档情境引导：只响应真实行为，按顺序推进；重复事件与旧档均为静默 no-op */
function noteOnboarding(kind){
  noteOpening(kind);
  const ob=state.onboarding;
  if (!ob || ob.done) return;
  const expected=["move","dock","journal"][ob.step];
  if (kind!==expected && !(ob.step===2 && kind==="map")) return;
  ob.step++;
  if (ob.step>=3){ ob.step=3; ob.done=true; }
  save(); renderOnboarding();
}
function skipOnboarding(){
  const ob=state.onboarding;
  if (!ob || ob.done) return;
  ob.step=3; ob.done=true;
  save(); renderOnboarding();
}

// --- prologueSpot (was main+4-195, 192 lines) ---
/* ==================== 必经短章：六段旧路并入主线（B2） ====================
   13 段故事全部必经。这些岛原本可以整段跳过，现在离岛前必须结算一次抉择；
   抉择经 showAsk 的 decId 写入 state.decisions，后续对话、回顾章与判词据此回响。 */
const LEGACY_DOCK_CARDS = {
  ismaros: {
    kicker:"第 一 站 · 伊 斯 玛 洛 斯",
    title:"战 利 品 与 伤 者",
    sub:"喀科恩人的城烧了一半。酒瓮边还躺着一个没断气的，正看着你。",
    quote:"「船装得下了。人也还救得动。」——天亮前必须走。",
    decId:"ismaros_plunder", flag:"ismarosDone",
    options:[
      {label:"留下救治", hint:"草药 −1 · 好感 +5", fn:()=>{
        if (state.backpack["治疗草药"]) delItem("治疗草药",1);
        state.ismarosSpared=true; addAffinity(5); gainXp(10);
        state.status["士气"]="尚可";
        addMemory("伊斯玛洛斯的天亮前，旅人选择了救人不劫船", 3, "ismaros");
      }},
      {label:"再劫一次", hint:"金币 +80 · 士气 低落", fn:()=>{
        state.coins=(state.coins||0)+80; state.status["士气"]="低落"; gainXp(10);
        addMemory("伊斯玛洛斯被再一次洗劫——这次连伤者的船也不放过", 4, "ismaros");
      }},
      {label:"只取酒，不碰人", hint:"获得 喀科恩酒", fn:()=>{
        state.tookWine=true;
        if (!state.backpack["喀科恩酒"]) addItem("喀科恩酒");
        addMemory("旅人只带走了喀科恩人的酒，没再碰人", 2, "ismaros");
      }},
    ],
  },
  lotus: {
    kicker:"第 三 站 · 食 莲 岛",
    title:"一 颗 莲 子",
    sub:"他坐在沙上，把一颗莲子递给你，笑得很轻，像什么都不用还。",
    quote:"「尝一颗吧。尝过的人都不急着回家。」",
    decId:"lotus_fruit", flag:"lotusDone",
    options:[
      {label:"尝一颗", hint:"士气 昂扬 · 饥饿缓解 · 记忆变淡", fn:()=>{
        state.lotusAte=true; state.status["士气"]="昂扬";
        state.hunger=Math.min(100,(state.hunger||0)+40);
        addMemory("旅人尝了食莲岛的莲子——甜是真的，有段记忆跟着甜味淡了", 3, "lotus");
      }},
      {label:"拖他上船", hint:"获得 断桨", fn:()=>{
        state.lotusDragged=true; addItem("断桨"); gainXp(10);
        addMemory("旅人想强拖食莲者上船，只捞到一支断桨", 2, "lotus");
      }},
      {label:"让他留在甜里", hint:"什么也不改变", fn:()=>{
        addMemory("旅人没有碰莲子，也没有碰那个人——船开时他还坐在沙上笑", 3, "lotus");
      }},
    ],
  },
  cyclops: {
    kicker:"第 四 站 · 独 眼 巨 人",
    title:"你 叫 什 么 名 字",
    sub:"洞口的风停了。巨人捂着刚被灼瞎的眼，问外面的人是谁。",
    quote:"名字一旦说出口，海就会记住。——而海记什么都不要钱。",
    decId:"cyclops_name", flag:"cyclopDone",
    options:[
      {label:"报出真名：奥德修斯", hint:"原著之夜 · 海神记账", fn:()=>{
        state.polNameGiven="奥德修斯";
        if (!state.polWrathMark){ state.polWrathMark=true; state.poseidonWrath=(state.poseidonWrath||0)+1; }
        addMemory("旅人朝洞里喊出了自己的真名——波塞冬在浪底下听见了", 4, "polyphemus");
      }},
      {label:"报「没有人」", hint:"最安全的名字，也是最空的", fn:()=>{
        state.polNameGiven="没有人"; state.namesHeard=true;
        addMemory("旅人对巨人说：没有人。洞里传来一声闷响，像谁在笑", 3, "polyphemus");
      }},
      {label:"不答", hint:"什么也不给", fn:()=>{
        state.polNameGiven="（未报）";
        addMemory("旅人没有回答巨人——名字留在了自己嘴里", 3, "polyphemus");
      }},
    ],
  },
  telepylos: {
    kicker:"第 六 站 · 忒 勒 皮 洛 斯",
    title:"最 后 一 条 船",
    sub:"崖顶的石头还在往下落。滩上泊着的船，比来时少了。",
    quote:"「守船，还是守人？」——这句问话，你迟早要答。",
    decId:"telepylos_ship", flag:"telepylosDone",
    options:[
      {label:"守住船队", hint:"伤势 −15 · 船一艘不少", fn:()=>{
        state.hp=Math.max(1,(state.hp||100)-15); state.status["士气"]="低落";
        addMemory("忒勒皮洛斯的崖下，旅人用肩膀顶住了船缆——石头砸在背上", 4, "telepylos");
      }},
      {label:"弃三条船，先保人", hint:"船队 −3 · 士气 昂扬", fn:()=>{
        state.fleet=Math.max(0,(state.fleet||0)-3); state.status["士气"]="昂扬";
        addMemory("旅人砍断了三条船的缆，把人全塞进剩下的船里——海面上漂着空船", 4, "telepylos");
      }},
      {label:"什么都不说，开船", hint:"不救，也不弃", fn:()=>{
        state.status["士气"]="低落";
        addMemory("旅人没有下令——船自己离了岸，谁也没回头看", 3, "telepylos");
      }},
    ],
  },
};

function prologueSpot(s){
  const P = PROLOGUE_SITES[scene];
  if (scene==="telepylos" && FD.on && s.type!=="fleetguard"){ toast("石头还在落——先守住船队！"); return; }
  switch(s.type){
  /* —— 伊斯玛洛斯 —— */
  case "rebuild": return openDlg("rebuilder");
  case "wounded":
    if (state.ismarosSpared) return toast("伤者朝你抬了抬下巴。药香还在。");
    if (!state.backpack["治疗草药"]) return toast("他的腿在流血——你身上没有治疗草药。（埃阿亚岛的女巫货架有）");
    delItem("治疗草药",1); state.ismarosSpared=true; addAffinity(5); gainXp(15);
    addMemory("旅人把治疗草药给了伊斯玛洛斯的伤者", 3, "ismaros");
    toast("你把药草捣碎敷上他的腿。他没问你是谁——这座城的人不再问来客的名字。（好感 +5 · 历练 +15 · 航序 #1）");
    renderHUD(); save(); return;
  case "target": {
    state.targetHits++;
    sfx("attack");
    if (state.targetHits===1) toast("你朝木靶刺出第一矛——手腕记得这个动作。（再刺两下，找回手感）");
    else if (state.targetHits===2) toast("第二矛正中红圈。呼吸，收肘，再刺。");
    else if (state.targetHits===3){
      gainXp(20); addMemory("旅人在伊斯玛洛斯的木靶前找回了自己的矛", 2, "ismaros");
      toast("第三矛钉进靶心。木靶上全是旧枪眼——这城的教训，替你热了身。（历练 +20 · 战斗手感已恢复）");
      renderHUD(); save();
    } else toast("靶心的旧枪眼比你的新。收矛吧。");
    return;
  }
  case "wine":
    if (state.tookWine) return toast("酒瓶空了——刻字还在：赢家不该在输家的城里睡。");
    state.tookWine=true; addItem("喀科恩酒");
    addMemory("旅人拾走了战利品堆旁的喀科恩酒——瓶上刻着：赢家不该在输家的城里睡", 2, "ismaros");
    toast("你捡起酒瓶。瓶底刻着一行小字：「赢家不该在输家的城里睡。」——当年有人没把这句话当回事。（获得 喀科恩酒）");
    renderHUD(); save(); return;
  case "campfire": startCampDefense(); return;
  /* —— 食莲岛 —— */
  case "lotusman": return openDlg("lotusman");
  case "lotusEat":
    if (state.lotusAte) return toast("莲子的甜还在舌根。别再尝了——甜是会记账的。");
    state.lotusAte=true;
    state.status["士气"]="昂扬"; state.hunger=Math.min(100,state.hunger+40);
    addMemory("旅人尝了食莲岛的莲子——甜是真的，有段记忆跟着甜味淡了", 3, "lotus");
    toast("莲子比蜜还甜。你愣了很久——刚才在想什么来着？……想不起来了。饿是真饱了，心是真轻了。（士气昂扬 · 饥饿缓解 · 某段记忆变淡了）");
    renderHUD(); save(); return;
  case "lotusDrag":
    if (state.lotusDraggedOk) return toast("他坐在凳上望着海，不挣了。绳结是忒勒皮洛斯的打法——一结管一条命。");
    /* P2.2（17g 原著第 9 卷）：纯正版出口——持「幸存者的绳结」强拖成功（绑上凳带回船），canon */
    if (state.backpack["幸存者的绳结"]){
      delItem("幸存者的绳结",1);
      state.lotusDraggedOk=true; state.lotusDragged=true;
      gainXp(25); sfx("bless"); feedback("medium"); achivTick();
      addMemory("旅人用幸存者的绳结把食莲者绑上凳拖回船——这一次，他真的把人带走了（原著第 9 卷）", 4, "lotus");
      toast("你抽出那根旧绳，照忒勒皮洛斯的打法套上他的手腕——「对不住，这一趟我说了算。」他不挣了，像突然想起怎么坐。船开时他望着海，一路没说话。（强拖回船 · 历练 +25 · 绳结已用）");
      renderHUD(); save(); return;
    }
    if (state.lotusDragged) return toast("断桨躺在沙上。他不肯走——你也不该再拖第二次。（若有一根结实的绳……忒勒皮洛斯的碎船骸间兴许有）");
    state.lotusDragged=true; addItem("断桨"); gainXp(10);
    addMemory("旅人想强拖食莲者上船，只捞到一支断桨", 2, "lotus");
    toast("你抓住他的手腕往船拖——他挣开，笑得毫无恶意。你只捞到一支断桨。（获得 断桨 · 历练 +10）");
    renderHUD(); save(); return;
  /* —— 独眼巨人之岛 —— */
  case "cave":
    if (!state.polHeard) return toast("洞口的巨灶熏得漆黑。里面太暗——先去羊栏边见那个高大的影子。");
    return toast("洞里黑得很深。他没有请任何人进去过——自从那晚之后。");
  case "poly": return openDlg("polyphemus");
  case "sheep":
    if (state.sheared) return toast("巨羊抖了抖毛，继续吃草。一人一件，巨人说的。");
    state.sheared=true; addItem("羊毛披风"); gainXp(15);
    addMemory("旅人得了盲眼巨人允许的一把羊毛——披风比想象中暖", 3, "polyphemus");
    toast("巨羊安静地站着，任你剪下一捧羊毛。远处巨人没回头——「一人一件。」他说。（获得 羊毛披风 · 历练 +15）");
    renderHUD(); save(); return;
  case "ramhide": startRamHide(); return;
  /* —— 忒勒皮洛斯 —— */
  case "cliff":
    if (!state.cliffWarn){ state.cliffWarn=true; sfx("alert"); save();
      return toast("崖顶的巨影直起身来——石头砸进你脚边的水里。别走崖下直线，从残骸内侧绕。"); }
    if (state.cliffHurt){ toast("崖下的碎石还在滚落——贴着残骸内侧走，别再探到崖边。"); return; }
    state.cliffHurt = true;
    state.hp=Math.max(1,state.hp-15); sfx("hurt");
    addMemory("旅人在忒勒皮洛斯硬闯了崖下险道——石头不跟人讲道理", 2, "telepylos");
    toast("第二块石头擦着头皮砸下来。碎石划伤了你的肩。（伤势 -15 · 从残骸内侧绕行）");
    renderHUD(); save(); return;
  case "wreck":
    if (state.ropeTaken) return toast("船骸的影子在水里晃。绳结的打法，你已经记下了。");
    state.ropeTaken=true; addItem("幸存者的绳结"); gainXp(20);
    addMemory("旅人在忒勒皮洛斯拾了幸存者的绳结——碎船骸间沉着他船队的大半，活着记住这个结的只剩他", 3, "telepylos");
    toast("碎船骸间有一根系船的旧绳——这片碎木里，沉着你自己的船队。你照着残结比划：活着记住这个结的人，只剩你。（获得 幸存者的绳结 · 历练 +20 · 航序 #6）");
    renderHUD(); save(); return;
  case "fleetguard": startFleetDefense(); return;
  /* —— 特洛伊（#0 木马之夜：献策→造马→入马→夜袭混战→屠城抉择→船队出海）—— */
  case "epeius": {
    if (state.troyStage===0){
      state.troyStage=1; gainXp(20); sfx("bless");
      addMemory("奥德修斯向厄佩俄斯献上木马计——十年围城，赢在一只空心木马里", 4, "any");
      toast("厄佩俄斯放下刨子听完你的话，半晌：「……空心木马，藏进勇士，佯装撤军。诸神在上，这是能写进歌里的毒计。」（木马计已定 · 历练 +20 · 去伐木：木料 ×5）");
      renderHUD(); save(); return;
    }
    if (state.troyStage===1) return toast(`木料 ${state.troyWood||0}/5——平原上的松树都认得斧子。备齐了去木马那开工。`);
    if (state.troyStage===2) return toast("马已立起，肚膛空着。夜一黑，就从它进去。");
    if (state.troyStage===3) return toast("城破在即——先清了城门里的卫兵。");
    return openDlg("epeius");
  }
  case "wood":
    if (state.troyStage<1) return toast("先与厄佩俄斯把话定下来——造什么、为谁造。");
    if (state.troyStage>1) return toast("木料够了。马肚里闻得见松脂香。");
    if ((state.troyWood||0)>=5) return toast("木料已经够了——第五根落过地了。去木马处开工造马。");
    state.troyWood=Math.min(5,(state.troyWood||0)+1); sfx("chop"); feedback("small");
    burst(4*ATS+ATS/2, 5*ATS+ATS/2, "#c9a06a", 8, 60, 2.4);
    gainXp(4);
    if (state.troyWood>=5) toast("第五根木料落地——够了。（去木马处：开工造马）");
    else toast(`斧声在平原上荡开。木料 ${state.troyWood}/5。`);
    renderHUD(); save(); return;
  case "horse":
    if (state.troyStage===1){
      if ((state.troyWood||0)<5) return toast(`马还只是图样。木料 ${state.troyWood||0}/5——平原上伐去。`);
      state.troyStage=2; sfx("build"); feedback("large"); gainXp(30);
      addMemory("木马在一夜之间立起——肚膛空着，像一句没说完的话", 3, "any");
      toast("锯声响了整夜。天亮时，一匹比城门还高的木马立在滩头，肚膛空着。（再 E 一次：藏入马腹）");
      renderHUD(); save(); return;
    }
    if (state.troyStage===2){
      state.troyStage=3; resetTroyGuards();
      aiaPlayer.x=12*ATS+ATS/2; aiaPlayer.y=5*ATS+ATS/2;   /* 已被拖入城内 */
      showChapter("concept-art/prologue/p2-木马之夜.jpg","木 马 之 夜","城 里 的 马","特洛伊把赔礼拖进了自己的城门","你在马腹的黑暗里数着更声。城门在身后合上——卫兵还在门内巡着。\n天快亮之前，把门里的牙齿拔干净。");
      addMemory("特洛伊人把木马拖进了城——你藏在马腹里，听着城门在身后合上", 4, "any");
      gainXp(35); renderHUD(); save(); return;
    }
    return toast("马立在晨光里，肚膛空了。歌里会记住它。");
  case "guard": {
    const g = TROY_GUARDS[s.gi];
    if (!g || !g.alive) return;
    const dmg = Math.floor(derived().atk + Math.floor(Math.random()*5));
    g.hp -= dmg; g.hitAt = performance.now();
    burst(g.x, g.y-4, "#ff9d5c", 8, 62, 2.4);
    { const kx=g.x-aiaPlayer.x, ky=g.y-aiaPlayer.y, kd=Math.hypot(kx,ky)||1;
      g.x = Math.max(0, Math.min(19*ATS, g.x + kx/kd*10)); g.y = Math.max(0, Math.min(9*ATS, g.y + ky/kd*10)); }
    sfx("attack"); feedback("small");
    popText(g.x, g.y-22, `-${dmg}`, "#ff9d5c");
    let msg = `你从阴影里挥出${state.equipped?"【"+state.equipped+"】":"短刃"}（-${dmg}）`;
    if (g.hp<=0){
      g.alive=false; sfx("die"); feedback("large");
      burst(g.x, g.y, "#8a6a52", 16, 100, 3.2);
      gainXp(18); msg = "一名卫兵闷声倒在门洞的阴影里。（历练 +18）";
      if (TROY_GUARDS.every(x=>!x.alive)){
        state.troyStage=4; sfx("bless"); gainXp(40);
        addMemory("木马之夜——城门里的卫兵被肃清，火把传到了你手上", 4, "any");
        toast("最后一具甲胄撞在门槛上。城门洞开了——火把在墙垛上等你。（历练 +40 · 去城墙：火把）");
        renderHUD(); save(); return;
      }
    }
    toast(msg); renderHUD(); save(); return;
  }
  case "torch": {
    if (state.troyStage<4) return toast("火把在墙垛上烧着。城门还没开——先把它抢下来。");
    if (state.troyStage>=5) return toast(state.troyBurned ? "火光在城脊上跑，一夜没停。灰会记十年。" : "你把火把插回了架上。有人从门缝里看了你一眼——没说话，走了。");
    const decide = (burn)=>{
      state.troyStage=5;
      if (burn){
        state.troyBurned=true; sfx("warn"); feedback("large");
        addMemory("特洛伊在身后烧成一条火线——这就是诸神要的胜利", 4, "any");
        toast("火把落下。风把火从屋顶赶向屋顶——特洛伊在身后烧成一条火线。（原著之夜 · 火光会跟到判词里）");
      } else {
        state.troySpared=true; sfx("bless");
        addMemory("屠城之夜，奥德修斯放下了火把——平民走门，只带走战争", 4, "any");
        toast("你把火把插回墙垛。妇女和老人从侧门涌出去，没人回头看你。——荷马没写这一页。（改写 · 命运成就）");
      }
      renderHUD(); save();
    };
    showAsk("第 零 章 · 木 马 之 夜","火 把 在 手","十年围城，今夜见了分晓。火把在你手里。","「烧，还是放下？」——没人回答你。墙下的人声，等着这个答案。",[
      {label:"烧城（按原著）", hint:"屠城焚屋，船队满帆出海", fn:()=>decide(true)},
      {label:"放下火把（改写）", hint:"平民走门，你只带走战争", fn:()=>decide(false)},
    ], "troy_fire");
    return;
  }
  case "dock": {
    /* 必经短章：离岛前把这一段的核心抉择问掉（每段只问一次，写入 decisions） */
    const card = LEGACY_DOCK_CARDS[scene];
    if (card && !state[card.flag]){
      showAsk(card.kicker, card.title, card.sub, card.quote,
        card.options.map(o=>({ label:o.label, hint:o.hint, fn:()=>{
          o.fn();
          state[card.flag]=true;
          renderHUD(); save();
          toast("（这一段已经记进航程。再按 E 离岛。）");
        }})), card.decId);
      return;
    }
    if (scene==="troy" && state.troyStage<5) return toast("船在滩上等着——可城里的账还没结完。（先把这一夜走完）");
    if (scene==="troy"){
      state.troyDone=true;
      if (!state.fleet){ state.fleet=12; }
      crewLedgerLight();
      sfx("bless"); gainXp(50);
      addMemory("十二艘船满帆离开特洛伊的海岸——十二个名字都在甲板上，全作从这里开始", 4, "any");
      /* P2.1 灰眼睛护送（17g 原著第 3 卷收束·不做实体 NPC）：离岸时刻的环境诗行+记忆 */
      addMemory("雾深处，一双灰眼睛看着船队转向家的方向——她没露面，只把风往船尾送了送（原著 · 雅典娜的护送）", 3, "any");
      scene = "world";
      boat.x = 30*WTS+WTS/2; boat.y = 6*WTS+WTS+30;
      showChapter("concept-art/01-序章漂流.jpg","出 海","十 二 艘 船","启航之地 · 船队整帆","十二艘船同时离岸。桅杆挤着桅杆，像一片移动的林子。\n雾深处，一双灰眼睛看着船队转向家的方向——她没露面，只把风往船尾送了送。\n这一程的尽头没有人知道——但今晚，船是满的，人是齐的。");
      renderHUD(); save(); return;
    }
    scene = "world"; save(); sfx("pick");
    toast("船头调向外海——岛的影子在船尾慢慢合上。");
    return;
  }
  }
  return toast("（这里没什么可碰的。）");
}


// --- decide (was main+156-168, 13 lines) ---
    const decide = (burn)=>{
      state.troyStage=5;
      if (burn){
        state.troyBurned=true; sfx("warn"); feedback("large");
        addMemory("特洛伊在身后烧成一条火线——这就是诸神要的胜利", 4, "any");
        toast("火把落下。风把火从屋顶赶向屋顶——特洛伊在身后烧成一条火线。（原著之夜 · 火光会跟到判词里）");
      } else {
        state.troySpared=true; sfx("bless");
        addMemory("屠城之夜，奥德修斯放下了火把——平民走门，只带走战争", 4, "any");
        toast("你把火把插回墙垛。妇女和老人从侧门涌出去，没人回头看你。——荷马没写这一页。（改写 · 命运成就）");
      }
      renderHUD(); save();
    };


// --- ambientAnchor (was main+213-226, 14 lines) ---
function ambientAnchor(npc){
  if (npc==="witch") return witch;
  if (npc==="seer") return seer;
  if (npc==="aeolus") return aeolus;
  if (npc==="siren"){ const s=SSPOTS.find(p=>p.type==="siren"); return s?{x:s.x,y:s.y}:null; }
  if (npc==="calypso") return calypso;
  if (npc==="nausicaa") return nausicaa;
  /* 先知与风神本来就有锚点，却没有环境台词 → 一直沉默（AMBIENT 表缺这两人）。
     重建者与食莲人连锚点都没有——补上，否则这两个场景的 NPC 永远不会开口。 */
  if (npc==="rebuilder"){ const s=(PROLOGUE_SITES[scene]?PROLOGUE_SPOTS():[]).find(p=>p.type==="rebuild"); return s?{x:s.x,y:s.y}:null; }
  if (npc==="lotusman"){ const s=(PROLOGUE_SITES[scene]?PROLOGUE_SPOTS():[]).find(p=>p.type==="lotusman"); return s?{x:s.x,y:s.y}:null; }
  if (npc==="epeius" && scene==="troy"){ const s=PROLOGUE_SPOTS().find(p=>p.type==="epeius"); return s?{x:s.x,y:s.y}:null; }
  if (npc==="cattle"){ const s=SUNSPOTS.find(p=>p.type==="cattle"); return s?{x:s.x,y:s.y}:null; }   /* P1.3 圣牛锚点 */
  if (npc==="polyphemus"){ const s=PROLOGUE_SPOTS().find(p=>p.type==="poly"); return s?{x:s.x,y:s.y}:null; } /* P2.8 独眼锚点 */
  if (npc==="suitors"){ const s=ITSPOTS.find(p=>p.type==="suitors"); return s?{x:s.x,y:s.y}:null; }           /* P2.6 求婚者锚点 */
  if (npc==="telemachus"){ const s=ITSPOTS.find(p=>p.type==="telemachus"); return s?{x:s.x,y:s.y}:null; }  /* P1.9 忒勒玛科斯锚点 */
  return null;
}


// --- ithacaAmbientNpc (was main+228-234, 7 lines) ---
function ithacaAmbientNpc(){
  const tm=ambientAnchor("telemachus"); if(!tm) return "suitors";
  const su=ambientAnchor("suitors");
  const dtm=Math.hypot(aiaPlayer.x-tm.x,aiaPlayer.y-tm.y);
  const dsu=su?Math.hypot(aiaPlayer.x-su.x,aiaPlayer.y-su.y):1e9;
  return dtm<=dsu?"telemachus":"suitors";
}


// --- moodFor (was main+263-270, 8 lines) ---
function moodFor(text){
  const t = String(text||"");
  if (/(暖|药|伤|疼|吃|喝|饿|睡|守着|等你|陪着|别怕|放心|保重|小心)/.test(t)) return "care";
  if (/(危险|会死|烧|恨|记仇|誓|代价|硬闯|丢掉|别去|吃定|拦不住)/.test(t)) return "warn";
  if (/(走吧|可以|好|嗯|知道|明白|算了|罢了|行)/.test(t)) return "calm";
  if (/(呵呵|哼|冷笑|就这|没救|居然)/.test(t)) return "cold";
  return "";
}


// --- tryMoveHades (was main+421-426, 6 lines) ---
function tryMoveHades(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (HSOLID.has(hTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}


// --- tryMoveAeolia (was main+427-432, 6 lines) ---
function tryMoveAeolia(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (AESOLID.has(aeTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}


// --- hurtPlayer (was main+451-463, 13 lines) ---
function hurtPlayer(dmg, reason){
  state.hp -= dmg;
  state.status["伤势"] = state.hp>60 ? "轻伤" : state.hp>30 ? "重伤" : "奄奄一息";
  flashHit(); shakeHp(); sfx("hurt"); feedback("medium");
  burst(aiaPlayer.x, aiaPlayer.y-16, "#ff7a6b", 10, 80, 2.6);   /* 受击血星 */
  popText(aiaPlayer.x, aiaPlayer.y-24, `-${dmg}`, "#ff7a6b");
  if (state.hp <= 0){
    faintPlayer(reason.includes("野猪") ? "被野猪撞倒后" : "");
    return;
  }
  toast(`${reason}（你 -${dmg} 血）`);
  renderHUD(); save();
}


// --- progressHades (was main+705-705, 1 lines) ---
function progressHades(){ return !!(state.prophecy || state.straitStage>0 || state.straitCleared || state.sunStage!=null); }


// --- objectiveIsland (was main+732-735, 4 lines) ---
function objectiveIsland(obj){
  if (!obj || !obj.k) return null;
  return ISLANDS.find(is => is.scene===obj.k) || null;
}


// --- updateCompassArrow (was main+738-745, 8 lines) ---
function updateCompassArrow(){
  const cp = document.getElementById("hudCompass");
  if (!cp || titleOn || dlgOpen || mapOpen || chapterOn){ if (_compassCache){ _compassCache=""; if (cp) cp.style.display="none"; } return; }
  const obj = nextObjective();
  if (!obj){ if (_compassCache){ _compassCache=""; cp.style.display="none"; } return; }
  const html = compassHTML(obj);
  if (html !== _compassCache){ _compassCache = html; cp.style.display=""; cp.innerHTML = html; cp.title = obj.text; }   /* 批次 I1b：悬停看完整航向文案 */
}


// --- visitedIsland (was main+746-746, 1 lines) ---
function visitedIsland(scene){ return !!(state.legs[scene] || state.legs["seen_"+scene]); }


// --- optionalSkipped (was main+748-750, 3 lines) ---
function optionalSkipped(){
  return ISLANDS.filter(i=>i.opt && i.scene!=="troy" && !visitedIsland(i.scene)).map(i=>i.name);
}


// --- telemachusEvent (was main+759-768, 10 lines) ---
function telemachusEvent(){
  sfx("alert");
  addMemory("码头边一个年轻人拦住你问：「有没有见过一个叫奥德修斯的人？」——他问遍了整片海，只搜到别人的故事", 4);
  showAsk("终 章 · 另 一 个 找 他 的 人","有 人 问 起 你",
    "码头边一个年轻人拦住你——短斗篷，手上一支小矛，眼角晒出了海的痕迹。\n「外乡人，抱歉拦你。我从皮洛斯回来——涅斯托耳的宫殿、墨涅拉俄斯的宴会，都问遍了。有没有见过一个叫奥德修斯的人？高个子，眼下有疤，说话像船帆。任何消息都行——十年的，什么都能算数。」",
    null, [
    {label:"「……我就是。你看我的手，看我眼下的纹——别眨眼，看仔细。」", hint:"原著第16卷 · 相认", fn:telYes},
    {label:"「没见过。……不过，会有人替你留意。」", fn:telNo},
  ], "tel_reveal");
}


// --- telYes (was main+769-775, 7 lines) ---
function telYes(){
  state.telRevealed = true;
  gainXp(30); sfx("bless"); feedback("large");
  addMemory("你把名字告诉了那个年轻人——他愣了很久，然后抱住你哭出声。二十年的账，父子两代一次算清", 5);
  toast("他盯着你的手、你的疤——然后像被抽走了骨头一样站不稳。「父亲。」他说，「这个字，我练了二十年。」\n（历练 +30 · 父子相认——你先抱了儿子，再赢回妻子）", 5200);
  achivTick(); renderHUD(); save();
}


// --- telNo (was main+776-780, 5 lines) ---
function telNo(){
  addMemory("那个年轻人问你有没有见过奥德修斯——你说没有。你们在雾里擦肩，像两个守着同一个秘密的陌生人", 4);
  toast("他的眼睛暗下去，又自己点着了：「没关系。至少今天又多问了一个。」\n他握了握矛，转身朝大厅去了。（你选择了继续无名——但记住他望你的那一眼）", 4800);
  save();
}


// --- trojanSongEvent (was main+804-812, 9 lines) ---
function trojanSongEvent(){
  if (state.troySongDone){ continueScheriaNight(); return; }
  showAsk("第 六 章 · 特 洛 伊 段","盲 歌 手 唱 到 木 马",
    "德摩多科斯的手落回琴上——这一次唱特洛伊：十年围城，木马，黑夜。唱到勇士们从马腹里跳出来那一段，厅堂里人人举杯。\n\n没有人注意你。你在费埃克斯的火光里，用袖口按住了眼睛。\n（原著第 8 卷：他唱木马，奥德修斯哭了）",
    null, [
    {label:"「我是奥德修斯。」", hint:"当众自报家门 · 原著第8卷", fn:()=>selfReveal()},
    {label:"把脸埋进袖子里", hint:"继续做无名旅人", fn:()=>stayNameless()},
  ], "troy_song");
}


// --- selfReveal (was main+813-820, 8 lines) ---
function selfReveal(){
  state.selfRevealed = true; state.troySongDone = true;
  sfx("bless"); feedback("large"); gainXp(30);
  addMemory("德摩多科斯唱到木马，旅人在异国的火光里哭了——然后他站起来，说出了自己的名字：奥德修斯。全厅安静", 5, "nausicaa");
  toast("你站起来，抹了把脸：「我是奥德修斯。」——盲歌手停了琴，重新调弦：「那这支歌，得重唱一遍。」（历练 +30 · 无名旅人之歌 → 奥德修斯之歌）", 5200);
  achivTick(); renderHUD(); save();
  setTimeout(continueScheriaNight, 1400);
}


// --- stayNameless (was main+821-827, 7 lines) ---
function stayNameless(){
  state.troySongDone = true;
  addMemory("歌到木马那一段，旅人把脸埋进了袖子里。没有人问——但瑙西亚娅看见了", 4, "nausicaa");
  toast("你把脸埋进袖子里，等那段唱过去。她什么都没问，只是把炉火拨得更旺了些。（继续无名线）", 4200);
  save();
  setTimeout(continueScheriaNight, 1400);
}


// --- continueScheriaNight (was main+828-852, 25 lines) ---
function continueScheriaNight(){
  setTimeout(()=>{
    if (state.nausicaaAsk) return;
    state.nausicaaAsk = true;
    showChapter("concept-art/characters/06-瑙西亚娅.jpg","第 六 章","被 看 见 的 夜 晚","她是唯一愿意听你说完的人","「全希腊的故事都从我家的门廊过——但你是第一个，让我想留、而不只是想送的。留下来，做客人吧。」");
    setTimeout(()=>{
      const settle = ()=>{
        state.scheriaStage = 3; renderHUD(); save();
        showSong2();
      };
      showAsk("第 六 章 · 告 白","留 下 来 吗","瑙西亚娅的告白不是求婚，是请求：留下来，做客人。","「全希腊的故事都从我家的门廊过——但你是第一个，让我想留、而不只是想送的。」",[
        {label:"留下做客 · 客卿", hint:"随时可去码头改主意", fn:()=>{
          state.guest = true; addMemory("旅人留在了斯克里岛——做费埃克斯的客人", 5);
          toast("「那就住下吧。」她说这话时没看你，耳根却红了。（客卿线 · 随时可去码头改主意）");
          settle();
        }},
        {label:"我要回家", hint:"还有一段海要走", fn:()=>{
          addMemory("旅人谢绝了瑙西亚娅——他说他还有一段海要走", 4);
          toast("她点点头，转身时很快：「那明天……我让人备船。」");
          settle();
        }},
      ], "scheria_guest");
    }, 600);
  }, 800);
}


// --- islandNear (was main+855-863, 9 lines) ---
function islandNear(){
  let best=null, bd=1e9;
  for (const is of ISLANDS){
    const cx = is.gx*WTS+WTS/2, cy = is.gy*WTS+WTS/2;
    const d = Math.hypot(boat.x-cx, boat.y-cy);
    if (d < 180 && d < bd){ bd=d; best=is; }   /* 批次 H9：180px=WTS40 下的 4.5 瓦（与旧 90px@WTS20 同瓦距） */
  }
  return best;
}


// --- aiaNear (was main+864-881, 18 lines) ---
function aiaNear(){
  let best=null, bd=1e9;
  let spots;
  if (scene==="hades") spots = HSPOTS.slice();
  else if (scene==="aeolia") spots = AESPOTS.slice();
  else if (scene==="strait") spots = SSPOTS.slice();
  else if (scene==="sun") spots = SUNSPOTS.slice();
  else if (scene==="ogggia") spots = OGSPOTS.slice();
  else if (scene==="scheria") spots = SCSPOTS.slice();
  else if (scene==="ithaca") spots = ITSPOTS.slice();
  else if (PROLOGUE_SITES[scene]) spots = PROLOGUE_SPOTS();
  else { spots = ASPOTS.slice(); const bs = boarSpot(); if (bs) spots.push(bs); }
  for (const s of spots){
    const d = Math.hypot(aiaPlayer.x-s.x, aiaPlayer.y-s.y);
    if (d < s.r && d < bd){ bd=d; best=s; }
  }
  return best;
}


// --- scheriaShipAsk (was main+882-909, 28 lines) ---
function scheriaShipAsk(){
  askText({
    kicker:"第 六 章 · 送 行", title:"家 在 哪",
    body: state.selfRevealed
      ? "送行的水手蹲在船头，按规矩再问一遍：「奥德修斯，家在哪？」"
      : "送行的水手蹲在船头，头一次开口问：「旅人，家在哪？」",
    quote: state.selfRevealed
      ? "（你当着全厅说过——答案已经定了，他只是要听你亲口再说一次。）"
      : "（世界不接谎：说不出口，船不开；说一个假的地方，雾会把你送回原点。）",
    placeholder: state.selfRevealed ? "伊萨卡" : "……", okLabel:"回 答 他",
    onOk:(ans)=>{
      const a = (ans||"").trim();
      if (!a || /说不出|不知道|没有/.test(a)){ toast("船安静着。说不出口的话——去讲给篝火听，或者去见她。"); return; }
      state.homeAnswer = a;
      if (!/伊萨卡/.test(a)){
        toast(`「${a}，是吧。」水手点头，船开了。……雾散时，船头正对出发的滩涂。世界不接谎——但它也不惩罚。（再试试，说真话）`);
        addMemory(`旅人对送行船说了「${a}」——雾把船送回了原点`, 3);
        renderHUD(); save(); return;
      }
      state.scheriaFarewell = true; scene = "world";
      boat.x = 17*WTS+WTS/2+40; boat.y = 7*WTS+WTS/2+30;
      gainXp(40); sfx("bless"); feedback("large");
      addMemory("费埃克斯人的船送旅人回家——全城安静，没有人回头念出这座岛的名字", 5);
      renderHUD(); save();
      showChapter("concept-art/08-斯克里岛.jpg","第 六 章","送 行","水手低语：别回头念出这座岛的名字","送行船上全城安静。只有桅杆的风声，和越来越远的、她站在码头上的那一点白。（历练 +40 · 伊萨卡已解锁——雾在散）");
    },
  });
}


// --- oggiaMainAsk (was main+914-943, 30 lines) ---
function oggiaMainAsk(){
  state.calypsoStage = 3;
  const mems = recallMemories(3);
  const answer = mems.length>=3
    ? mems.map(s=>String(s||"").replace(/^旅人/,"")).join("；")
    : "";
  const quote = answer
    ? `她把你自己的日子念给你听：「${answer}。」——「看，你早就答过了。现在只差亲口承认。」`
    : "她替你答了一半：「家是有人等你的地方。」——「剩下的一半，我不替你说。到了该认的地方，你自己补。」";
  showChapter("concept-art/06-奥吉吉亚-卡吕普索.jpg","第 五 章","正 题","她终于问了那个问题",quote);
  setTimeout(()=>{
    const settle = (stay)=>{
      state.calypsoStage = 4;
      if (stay){
        state.calypsoChoice = "stay";
        addMemory("旅人答应留在奥吉吉亚——永生的锁合上了", 5);
        toast("她说：好。（那天晚上，时间重新开始流动——想走的时候，筏台在海湾等你。）");
      } else {
        state.calypsoChoice = "raft";
        addMemory("旅人拒绝了永生——他要自己造一艘筏", 5);
        toast("她点头，眼睛却湿了：「筏台在海湾。木料、时辰、储粮——把你一路学的全用上吧。」");
      }
      renderHUD(); save();
    };
    showAsk("第 五 章 · 正 题","永 生 的 锁","她的提议躺在空气里：留下来——永生，不死，每天都是同样的好天气。","「你走了那么多海，难道没有一个岛值得停下？」",[
      {label:"留下来 · 永生的锁", hint:"每天都是同样的好天气", fn:()=>settle(true)},
      {label:"我要走 · 造筏", hint:"亲手把筏造出来", fn:()=>settle(false)},
    ], "calypso");
  }, 600);
}


// --- skipChapter (was main+948-954, 7 lines) ---
function skipChapter(){
  if (askOn) return;   /* 选择卡复用 chapterOn 门控，但不许章节卡的跳过通道把它关掉 */
  clearTimeout(chTimer);
  const c=document.getElementById("chapterCard");
  c.classList.remove("show"); c.setAttribute("aria-hidden","true");   /* Steam 化：关闭后移出无障碍树（屏幕阅读器不再读到残留的「点击任意处跳过」） */
  chapterOn=false;
}


// --- 抉择结算：统一读取真实状态差，原文剧情与奖励函数保持不动 ---
function choiceSnapshot(){
  const s={backpack:{...(state.backpack||{})}};
  for (const k of ["hp","hunger","thirst","coins","level","xp","affinity","crew","fleet"]) s[k]=state[k]||0;
  return s;
}
function choiceChanges(before){
  if (!before) return [];
  const out=[];
  const labels={hp:"伤势",hunger:"饱食",thirst:"饮水",coins:"德拉克马",level:"等级",affinity:"好感",crew:"船员",fleet:"船队"};
  for (const [k,label] of Object.entries(labels)){
    const d=(state[k]||0)-(before[k]||0);
    if (d) out.push(`${label} ${d>0?"+":""}${Math.round(d*10)/10}`);
  }
  /* 升级会扣除本级经验：把等级跨段还原成这一次真正获得的历练，不能显示成负数 */
  let xpGain=(state.xp||0)-(before.xp||0);
  if ((state.level||0)>(before.level||0)){
    xpGain=state.xp||0;
    for (let lv=before.level;lv<state.level;lv++) xpGain+=xpToNext(lv)-(lv===before.level?before.xp:0);
  }
  if (xpGain) out.push(`历练 ${xpGain>0?"+":""}${Math.round(xpGain)}`);
  const items=new Set([...Object.keys(before.backpack||{}),...Object.keys(state.backpack||{})]);
  for (const item of Array.from(items).sort()){
    const d=(state.backpack[item]||0)-(before.backpack[item]||0);
    if (d) out.push(`${item} ${d>0?"+":""}${d}`);
  }
  return out;
}
let choiceReceiptTimer=null;
function showChoiceReceipt(title,choice,changes){
  const el=document.getElementById("choiceReceipt");
  if (!el) return;
  document.getElementById("crChoice").textContent=`${title} · ${choice}`;
  document.getElementById("crResult").textContent=changes.length?changes.join(" · "):"命运已记下这次选择；没有即时数值变化";
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(choiceReceiptTimer);
  choiceReceiptTimer=setTimeout(()=>el.classList.remove("show"),7200);
}
function settleChoice(title,choice,before){
  const changes=choiceChanges(before);
  if (!Array.isArray(state.choiceLog)) state.choiceLog=[];
  state.choiceLog.unshift({title,choice,changes,clock:Math.floor(state.clock||0)});
  state.choiceLog=state.choiceLog.slice(0,12);
  showChoiceReceipt(title,choice,changes);
  if (document.getElementById("questPanel").style.display==="block") renderQuests();
  save();
}


// --- pickAsk (was main+961-965, 5 lines) ---
function pickAsk(i){
  const o = askOpts[i];
  const before = o ? choiceSnapshot() : null;
  const title = (askMeta&&(askMeta.title||askMeta.kicker))||"航行抉择";
  hideAsk();
  if (o && o.fn) o.fn();
  /* 抉择回声：若该选择卡带了 decId，把玩家选的 label 持久化到 state.decisions，供后续场景回响 */
  if (o && askMeta && askMeta.decId){
    if (!state.decisions) state.decisions={};
    state.decisions[askMeta.decId] = o.label;
  }
  if (o) settleChoice(title,o.label,before);
}


// --- hideAsk (was main+966-969, 4 lines) ---
function hideAsk(){
  askOn = false; chapterOn = false;
  document.getElementById("askCard").classList.remove("show");
}


// --- meadEvent (was main+978-1000, 23 lines) ---
function meadEvent(){
  const hasMoly = !!state.backpack["魔草"];
  sfx("cook");
  const ask = "小屋里药香被蜜香压住了。她背对你搅着什么，头也不回：「站着做什么？喝一杯再说话。」";
  if (hasMoly){
    showAsk("第 一 章 · 蜜 酒","她 请 你 喝 一 杯",
      ask+"\n杯里琥珀色，甜得过分——你掌心的魔草贴着皮肤，黑根银花，凉得像一句提醒。", null, [
      {label:"握着魔草，把酒喝干", hint:"原著第10卷 · 赫尔墨斯教的", fn:()=>swornScene("sword")},
      {label:"把魔草摊在桌面上",   hint:"不演了——让她看见",        fn:()=>swornScene("table")},
    ], "mead");
  } else {
    showAsk("第 一 章 · 蜜 酒","她 请 你 喝 一 杯",
      ask+"\n杯里琥珀色，甜得过分。金杖少年那句「别空着手喝」，你一时想不起来了。", null, [
      {label:"把酒一口饮尽", hint:"……应该没什么吧", fn:()=>pigFall()},
      {label:"把杯子推回去", hint:"先去林子里转转", fn:()=>{
        state.meadHeld = true; sfx("warn");
        addMemory("她递来蜜酒，旅人把杯子推了回去——酒还温着，林间好像有什么在等", 3);
        toast("「随你。」她没回头，「酒又不会跑。」——林间深处，似乎有什么在发光。");
        renderHUD(); save();
      }},
    ], "mead");
  }
}


// --- swornScene (was main+1002-1016, 15 lines) ---
function swornScene(mode){
  state.circeSworn = true;
  sfx("attack"); feedback("large");
  const sword = mode==="sword";
  setTimeout(()=>sfx("bless"), 420);
  addAffinity(sword?35:28); gainXp(40);
  addMemory(sword
    ? "旅人握着魔草喝干蜜酒，随即拔剑抵住她的喉咙——她笑了，当着他的面立了誓"
    : "旅人把魔草摊在桌上，喝干蜜酒——她盯着那株草看了很久，笑着立了誓", 5, "any");
  showChapter("concept-art/02-女巫小屋.jpg","第 一 章 · 幕 间","她 立 了 誓","咒语在你身上失效的那一刻，她看你的眼神变了",
    sword
    ? "蜜酒下肚，什么都没发生。她转过身来——你的剑已经抵在她喉咙前。「魔草。」她盯着剑刃笑了，「金杖那小子，手还是这么快。」\n「对船员立誓：不再下咒，不再说谎。」她举手起誓，火光把两个人的影子钉在墙上。放下剑的时候，她的指尖在你手背上停了一瞬。\n（原著第10卷：拔剑相向，她立誓。好感大幅上升——猪栏那边，该去看看了。）"
    : "你把魔草摊在桌面上，把酒一口喝干。她盯着那株黑根银花看了很久，忽然笑出声——「不空手赴约的人，值得一句实话。」\n她举手起誓：不再下咒，不再说谎。炉火把两个人的影子钉在墙上，谁也没先说话。\n（原著里你拔了剑，你只是把草摆在了光下。好感大幅上升——猪栏那边，该去看看了。）");
  renderHUD(); save();
}


// --- pigFall (was main+1018-1032, 15 lines) ---
function pigFall(){
  sfx("oink"); feedback("large");
  const fog = document.createElement("div");
  fog.id = "pigFog";
  document.body.appendChild(fog);
  setTimeout(()=>fog.remove(), 1900);
  state.pigged = true;
  state.hp = Math.max(20, Math.floor(state.hp*0.5));
  aiaPlayer.x = 3*ATS+ATS/2; aiaPlayer.y = 10*ATS+ATS/2;
  addMemory("旅人没拿魔草就喝了她的蜜酒——在猪圈里拱了好几天。岛上的猪都有一双他的眼睛", 5, "any");
  showChapter("concept-art/10-猪哼声.jpg",
    "第 一 章 · 坏 结 局","猪 哼 声","你想喊，喉咙里滚出来的是一声哼",
    "杯沿碰到嘴唇的一瞬，世界歪了——墙壁长出毛，烛火变成一双双猪的眼睛。\n——你在泥里拱了很久。等到「人」的念头重新浮上来，你趴在栈桥上，浑身是泥，血量折半。\n林间那圈金光还在。去把那株草拿回来——这次，别空着手喝。");
  renderHUD(); save();
}


// --- crewNoiseEvent (was main+1040-1048, 9 lines) ---
function crewNoiseEvent(){
  sfx("warn"); feedback("small");
  showAsk("第 四 章 · 鼓 噪","船 员 饿 了",
    "九天风暴，海峡又折了人。船员们把刀攥在手里，围着圣牛群，眼睛发绿——\n「头儿，就一头。神的牛，又不是你的牛。你已经很多天没合过眼了。」",
    null, [
    {label:"按住他们的手", hint:"改写 · 原著里你睡着了", fn:()=>crewHeld()},
    {label:"你太累了——先眯一会", hint:"原著第12卷 · 你睡着了", fn:()=>crewSlept()},
  ], "crew_noise");
}


// --- crewHeld (was main+1050-1056, 7 lines) ---
function crewHeld(){
  state.crewNoiseDone = true; state.crewSaved = true;
  sfx("attack"); feedback("medium"); gainXp(25);
  addMemory("船员饿极了要宰圣牛——你按住了他们的手。他们看了你很久，没人说话", 4, "any");
  toast("你把刀一把攥住。牛群安静了，船员的眼睛也暗了——他们活着，但今晚没人跟你说话。（改写 · 原著里你睡着了 · 历练 +25）");
  renderHUD(); save();
}


// --- crewSlept (was main+1058-1083, 26 lines) ---
function crewSlept(){
  state.crewNoiseDone = true;
  addMemory("风暴之后你太累了——在太阳岛的金色草场上，你闭上了眼", 3);
  thunderSfx(); addTrauma(0.9); feedback("large");
  const flash = document.createElement("div");
  flash.id = "zeusFlash";
  flash.innerHTML = '<svg viewBox="0 0 1000 600" preserveAspectRatio="none">'+
    '<polyline points="620,-10 560,190 610,195 500,420 540,428 420,610" fill="none" stroke="rgba(255,250,220,.95)" stroke-width="5"/>'+ 
    '<polyline points="300,-10 345,150 305,155 390,330 350,338 460,610" fill="none" stroke="rgba(255,240,190,.8)" stroke-width="3.5"/></svg>';
  document.body.appendChild(flash);
  setTimeout(()=>flash.remove(), 2600);
  setTimeout(()=>{
    state.sunWrath = true; state.slaughterWarn = false;
    state.crewSun = true; state.zeusStruck = true;
    state.hunger = 100; state.thirst = Math.min(100, state.thirst+30);
    addItem("牛肉",2);
    state.fleet = 0;   /* 雷劈最后一艘（17h 折损表第三站；护航船队随 fleet=0 自然消失） */
    loseCrew(state.crew||0, "宙斯的雷劈碎了最后一艘船——你睡着时他们宰了牛，雷把整船人收走了");
    scene = "world";
    boat.x = 615; boat.y = 350;   /* 九天漂流：奥吉吉亚近海南侧（岛中心 590,250 外 103px，避登陆圈；太阳岛 188px 外） */
    showChapter("concept-art/11-雷火.jpg",
      "第 四 章 · 幕 间","雷　火","九天漂流 · 最后一人",
      "你睡着的那一会儿，他们宰了牛，烤了肉。\n雷从晴空里劈下来的时候，没有人来得及抬头。\n——九天。第九天的清晨，浪把你推到了一片完美得可怕的海岸边。（船员 ⚑0/12 · 船队 ⛵0/12 · 航向：雾外有岛）");
    renderHUD(); save();
  }, 1200);
}


// --- podNear (was main+1148-1153, 6 lines) ---
function podNear(){
  if (scene!=="world") return null;
  for (const pod of DOLPHIN_PODS)
    if (Math.hypot(boat.x-pod.x, boat.y-pod.y) < 150) return pod;
  return null;
}


// --- dolphinEvent (was main+1154-1164, 11 lines) ---
function dolphinEvent(){
  const pod = podNear(); if (!pod) return;
  const now = performance.now();
  if (dolphinCool[pod.x] && now < dolphinCool[pod.x]){ toast("海豚群还在附近游弋——它们记得你刚打过招呼。"); return; }
  dolphinCool[pod.x] = now + 150000;
  dolphinLeapUntil = now + 3000;
  gainXp(4);
  addMemory("旅人与海豚群并行了一段——它们跃出水面，像在给你引路", 1, "sea");
  toast("海豚群跃出水面，绕着船转了一整圈——老水手说，被海豚引路的人不会迷航。（历练 +4）");
  renderHUD(); save();
}


// --- startFishing (was main+1195-1200, 6 lines) ---
function startFishing(){
  if (performance.now() < FISH.cdUntil){ toast("水花还没平——鱼群受了惊，往别处撒网吧。"); return; }
  Object.assign(FISH, {on:true, fish:0.5, fishDir:Math.random()<0.5?-1:1, fishSp:0.55, zone:0.4, zoneDir:1, hits:0, miss:0, tLeft:25});
  sfx("alert");
  toast("抛竿——鱼影游进绿区时按 E 提竿！（三中得鱼 · 三失脱钩 · F 也可提竿）");
}


// --- fishAction (was main+1202-1208, 7 lines) ---
function fishAction(){
  if (scene!=="world" || dlgOpen || mapOpen || titleOn || chapterOn) return;
  if (FISH.on){ fishingStrike(); return; }
  const d = driftNear();
  if (d){ salvageDrift(d); return; }
  startFishing();
}


// --- fishingStrike (was main+1210-1222, 13 lines) ---
function fishingStrike(){
  const inZone = FISH.fish >= FISH.zone && FISH.fish <= FISH.zone + FISH.ZONE_W;
  if (inZone){
    FISH.hits++; sfx("pick"); feedback("small"); hitStop(90);
    if (FISH.hits >= FISH.HITS){ endFishing(true); return; }
    FISH.fishSp += 0.13;   /* 鱼受惊提速：越钓越紧 */
    toast(`中了！鱼在挣扎——还差 ${FISH.HITS-FISH.hits} 提。`);
  } else {
    FISH.miss++; sfx("warn"); feedback("medium");
    if (FISH.miss >= FISH.MISS){ endFishing(false, "线一松——银影一闪，没了。"); return; }
    toast(`空竿……（脱钩 ${FISH.miss}/${FISH.MISS}）`);
  }
}


// --- endFishing (was main+1223-1234, 12 lines) ---
function endFishing(win, failMsg){
  FISH.on = false; FISH.cdUntil = performance.now() + 70000;
  if (win){
    addItem("鱼"); gainXp(10);
    addMemory("旅人在开阔海钓起一尾银鳞海鱼——今晚的灶上有腥味了", 2, "sea");
    sfx("bless"); feedback("medium");
    toast("提竿——银鳞出水！（鱼 +1 · 历练 +10 · 火盆可烤成烤鱼）");
  } else {
    toast(failMsg || "脱钩了。");
  }
  renderHUD(); save();
}


// --- spawnDrift (was main+1254-1262, 9 lines) ---
function spawnDrift(){
  for (let tries=0; tries<40; tries++){
    const x = (1+Math.random()*(WCOLS-2))*WTS, y = (1+Math.random()*(WROWS-2))*WTS;
    if (driftSpotOK(x, y)){
      drifts.push({x, y, kind: Math.random()<0.5?"bottle":"crate", born: performance.now()});
      return;
    }
  }
}


// --- driftNear (was main+1263-1270, 8 lines) ---
function driftNear(){
  let best=null, bd=1e9;
  for (const d of drifts){
    const dist = Math.hypot(boat.x-d.x, boat.y-d.y);
    if (dist < 44 && dist < bd){ bd=dist; best=d; }
  }
  return best;
}


// --- salvageDrift (was main+1271-1289, 19 lines) ---
function salvageDrift(d){
  drifts.splice(drifts.indexOf(d), 1);
  driftNextAt = performance.now() + 150000;
  sfx("pick"); feedback("small");
  if (d.kind === "bottle"){
    const note = DRIFT_NOTES[Math.floor(Math.random()*DRIFT_NOTES.length)];
    addMemory("旅人捞到一只漂流瓶：" + note, 2, "sea");
    gainXp(4);
    toast(`漂流瓶——纸条上一行褪色的字：「${note}」（已记进航海日志 · 历练 +4）`);
  } else {
    const roll = Math.random();
    if (roll < 0.35){ const c = 3+Math.floor(Math.random()*6); state.coins += c; toast(`木箱——压舱的私房钱！（德拉克马 +${c}）`); }
    else if (roll < 0.65){ addItem("治疗草药"); toast("木箱——一位船医的存货。（治疗草药 +1）"); }
    else if (roll < 0.85){ addItem("淡水"); toast("木箱——封蜡的淡水囊，一滴没洒。（淡水 +1）"); }
    else { addItem("面包"); toast("木箱——硬得像礁石，但确实是面包。（面包 +1）"); }
    gainXp(6);
  }
  renderHUD(); save();
}


// --- shineVal (was main+1463-1463, 1 lines) ---
function shineVal(n){ return SHOP[n]||({"风袋":8,"歌词残页":9,"治疗草药":12,"野猪肉":4,"烤野猪肉":6})[n]||3; }


// --- takeShine (was main+1465-1478, 14 lines) ---
function takeShine(n){
  const items = Object.keys(state.backpack).sort((a,b)=>shineVal(b)-shineVal(a));
  const lost=[];
  for (const it of items){
    if (lost.length>=n) break;
    const cnt = Math.min(state.backpack[it], n-lost.length);
    delItem(it,cnt);
    for (let i=0;i<cnt;i++) lost.push(it);
  }
  feedback("large");
  if (lost.length) toast(`六条颈子同时垂进船里——${lost.join("、")}，一样样被卷上崖。六头怪咀嚼的声音，比你想象的斯文。`);
  else { state.hp = Math.max(1, state.hp-30); toast("行囊空空，六头怪对视一眼——咬的是你。（-30 血）"); }
  return lost;
}


// --- gambleVortex (was main+1480-1500, 21 lines) ---
function gambleVortex(){
  const items=Object.keys(state.backpack);
  const nDrop = 1+Math.floor(Math.random()*3);
  const lost=[];
  for (let i=0;i<nDrop && items.length;i++){
    const idx=Math.floor(Math.random()*items.length);
    const it=items[idx]; delItem(it); items.splice(idx,1); lost.push(it);
  }
  state.straitStage=2;
  const capsized = Math.random()<0.2;
  addMemory(`旅人赌了卡律布狄斯漩涡${lost.length?`，漩涡卷走了 ${lost.join("、")}`:""}${capsized?"，船被打翻回原地——记忆还在":""}`, 3);
  sfx("dash"); feedback("large");
  if (capsized){
    scene="world"; boat.x=6*WTS+WTS/2+30; boat.y=11*WTS+WTS+40;
    toast(`漩涡赢了。船在原地打了个转，你趴在漂木上醒来——像第一天那样。（卷走：${lost.join("、")||"什么都没有"}；记忆都在）`);
  } else {
    toast(`你贴着漩涡的边冲了过去——它卷走了 ${lost.join("、")||"……什么也没捞到，它很生气"}。（海峡算过了）`);
  }
  renderHUD(); save();
  return {text:""};
}


// --- fastVoyage (was main+1526-1570, 45 lines) ---
function fastVoyage(is){
  if (scene!=="world"){ toast("人不在船上——先回到甲板再翻海图。"); return; }
  const open = islandOpen(is);
  if (!open){ const g=GATES[is.scene]; toast((g&&g.hint)||`${is.name} —— ${is.note}`); return; }
  const cx = is.gx*WTS+WTS/2, cy = is.gy*WTS+WTS/2;
  const dist = Math.hypot(boat.x-cx, boat.y-cy);
  const mins = Math.max(40, Math.min(720, Math.round(dist/20.7/10)*10));   /* 批次 H9：与 62px/s × 3 游戏分/现实秒 的航速经济对齐；世界翻倍后上限提到 720 分 */
  const costH = Math.max(3, Math.round(mins*0.14)), costT = Math.max(3, Math.round(mins*0.17));
  askConfirm("快 速 直 航","扬 帆 直 去 "+is.name,
    `把帆吃满，一路不靠岸——约 ${Math.round(mins/60*10)/10} 个时辰。船上省下的力气都交给风。`,
    `（消耗：饱食约 ${costH} · 饮水约 ${costT}；途中两成半的可能遇上点事）`,
    "⛵ 扬帆直航","交 给 风","我再看看海图","留在原地",
    ()=>{
      /* 直航结算：钟表前进 → 需求按等效时长消耗 → 就近水面落船 → 途中遭遇 roll */
      state.clock = (state.clock + mins) % 1440;
      const eqDt = mins/1440*DAY_LEN;
      tickNeeds(eqDt);
      state.hunger = Math.max(0, state.hunger - costH); state.thirst = Math.max(0, state.thirst - costT);
      const M = WTS*0.5;
      let bx = cx, by = cy;
      if (isSolidTile(Math.floor(bx/WTS), Math.floor(by/WTS))){
        let best=null, bd=Infinity;
        for (let y2=0; y2<WROWS; y2++) for (let x2=0; x2<WCOLS; x2++){
          if (isSolidTile(x2,y2)) continue;
          const dx=x2*WTS+WTS/2-bx, dy=y2*WTS+WTS/2-by, dd=dx*dx+dy*dy;
          if (dd<bd){ bd=dd; best={x:x2*WTS+WTS/2, y:y2*WTS+WTS/2}; }
        }
        if (best){ bx=best.x; by=best.y; }
      }
      boat.x = Math.max(M, Math.min(WCOLS*WTS-M, bx));
      boat.y = Math.max(M, Math.min(WROWS*WTS-M, by));
      if (Math.random()<0.25){
        gainXp(5);
        addMemory("直航的半路遇上风浪——船咬着浪过去了", 1, "sea");
        toast(`途中遇风浪，船帆吃了满风——稳住航向，练了一手。（历练 +5）`);
      } else {
        toast(`帆吃满了风——${is.name}的影子出现在海平线上。（航程 ${Math.round(mins/60*10)/10} 时辰）`);
      }
      closeMap();
      addMemory(`旅人扬帆直航，一路不靠岸——把船头对准了${is.name}`, 1, "any");
      renderHUD(); save();
      sfx("bless");
    },
    ()=>{});
}


// --- addItem (was main+1704-1704, 1 lines) ---
function addItem(n,q=1){ state.backpack[n]=(state.backpack[n]||0)+q; }


// --- delItem (was main+1705-1709, 5 lines) ---
function delItem(n,q=1){
  if (!state.backpack[n]) return false;
  state.backpack[n]-=q; if (state.backpack[n]<=0) delete state.backpack[n];
  return true;
}


// --- toNum (was main+1710-1716, 7 lines) ---
function toNum(v){
  if (v===undefined||v===null||v==="") return 1;
  const s=String(v).replace(/[瓶株个壶卷罐捆袋块枚片根只条匹名]/g,"").trim();
  const N={"一":1,"两":2,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10};
  if (/^\d+$/.test(s)) return Math.min(parseInt(s),99);
  const m=s.match(/[一二两二三四五六七八九十]/); return m?N[m[0]]:1;
}


// --- borrowCattle (was main+1954-1967, 14 lines) ---
function borrowCattle(){
  if (state.sunDebt) return {text:"（母牛慢慢摇头）说好了只一次。信物已在我们圣殿的檐下——太阳记性好。"};
  if (state.sunWrath) return {text:"（牛群往后退了半步）血已经流过。太阳看着呢——没有第二次信任。"};
  const items = Object.keys(state.backpack).sort((a,b)=>shineVal(b)-shineVal(a));
  if (!items.length) return {text:"（她闻了闻你空空的行囊）你拿什么作保？……去吧。饿死，也比亏欠干净。"};
  const p = items[0]; delItem(p);
  state.sunDebt = {pledge:p};
  state.hunger = Math.min(100, state.hunger+50);
  addItem("牛肉");
  sfx("bless"); feedback("medium");
  addMemory(`旅人以名字作保向圣牛群借了一头牛——信物：${p}`, 4, "any");
  renderHUD(); save();
  return {text:`（最老的那头母牛阖上眼，很久）……可以。刀落下去的时候，念你自己的名字——你的，不是别人的。（收走信物：${p} · 饱食 +50 · 获得 牛肉×1）`};
}

// === 主脚本残留（第二批迁入） ===

// --- GATES (migrated from main script) ---
const GATES = {
  /* —— B2：六段旧路并入主线，前五站按序解锁 —— */
  ismaros:   { cond:()=>!!state.troyDone || !!state.legs.ismaros,
               hint:"特洛伊的夜还没走完——十二艘船还在滩上等着。" },
  lotus:     { cond:()=>!!state.ismarosDone || !!state.legs.lotus,
               hint:"伊斯玛洛斯还没收尾——天亮前那一站得先走完。" },
  cyclops:   { cond:()=>!!state.lotusDone || !!state.legs.cyclops,
               hint:"船还没到独眼巨人的海岸——先过食莲岛。" },
  telepylos: { cond:()=>!!state.cyclopDone || !!state.legs.telepylos,
               hint:"独眼巨人的洞里还有话没答——名字得先给出去。" },
  aia:       { cond:()=>!!state.telepylosDone || !!getQuest("witch_grass") || !!state.legs.aia,
               hint:"喀耳刻的岛还在东南——六段旧路得先走完才靠得上去。" },
  hades:  { cond:()=>{ const q=getQuest("witch_grass"); return !!(q&&q.done) || progressHades(); },
            hint:"雾还没散——喀耳刻的委托还没结清。（先在埃阿亚岛采满 3 株玛草交给她）" },
  aeolia: { cond:()=>progressHades(),
            hint:"浮岛还在云上——先去冥界，听特瑞西阿斯把两条路说清。（献祭沟要：蜂蜜酒、面包、淡水）" },
  strait: { cond:()=>progressHades(),
            hint:"海峡的歌还没到听的时候——先去冥界问路。（特瑞西阿斯会指给你两条路）" },
  sun:    { cond:()=> !!(state.straitCleared || state.straitStage>=2 || state.sunStage!=null || state.sunBlessed || state.sunWrath),
            hint:"金光未现——海峡还没过去。（处置了塞壬的歌，才看得见金光深处）" },
  /* —— 圣经收官：第五/六章 + 终章（门控延伸到伊萨卡）—— */
  ogggia: { cond:()=> !!(state.sunBlessed || state.sunWrath || state.sunStage!=null),
            hint:"雾外的岛还没显形——先了结太阳岛的账。（守住圣牛，或付清代价）" },
  scheria:{ cond:()=> !!state.ogygiaLeft,
            hint:"出不了湾——卡吕普索的岛还在等你的答案。（造筏，或留下）" },
  ithaca: { cond:()=> !!state.scheriaFarewell,
            hint:"雾还没散——先在斯克里岛把故事讲完。（费埃克斯人不送没被看见的人）" },
};

