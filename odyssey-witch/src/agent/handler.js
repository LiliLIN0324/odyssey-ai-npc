// ============================================================
// 奥德赛 · Agent 层 —— 意图分发 + 消息 + 解析
// 依赖 src/data/* + src/engine/core.js + src/render/scenes.js + src/interact/handlers.js
// ============================================================

/* 离岛归途：离线时也得有人接得住「我怎么回家」——每座岛的 NPC 各给一句真话 */
const WAY_HOME = {
  seer:"（盲眼先知没有抬头，杖尖朝河面一点）……回程不在西边，在你脚下。先渡河，再问名字。",
  aeolus:"（风袋在他指间鼓胀了一下）回去？风不认路，只认代价。往东南，先把耳朵堵上。",
  siren:"（歌声低下去，像在水下笑）……回家的人，得先活着穿过我们。往东南，别停船。",
  calypso:"（织机上的线停了一寸）……回程？海图上有。西边俄刻阿诺斯，东南声之海峡。我这里只有留，没有路。",
  nausicaa:"（她把湿发别到耳后）往西问那位瞎眼先知，往东南要过声之海峡。船和淡水我们能给，路得你自己认。",
  lotusman:"（他从花丛里翻了个身，声音闷闷的）回去？……别问我。我本来也是要回去的。",
  epeius:"（他用手背蹭了蹭鼻子）路我不懂，船我懂。你要走，先让我看看你的船。",
  telemachus:"（他站起来，脸上有被海风吹裂的痕）我也在找回去的路。西边问先知，东南过海峡。同行一段？",
};

/* schema 物品名是对话协议名；旧存档和章节奖励仍可能使用运行时库存 ID。
   解析层保留玩家所说的标准名；这里只在背包确实持有对应旧物品时于结算读取侧转换，
   不能用于商店定价，也不能把货架没有的东西提前改名上架。 */
const OWNED_ITEM_ID_ALIASES = {
  "干粮": ["面包"],
  "船桨": ["断桨"],
  "桨": ["断桨"],
  "绳结": ["幸存者的绳结"],
  "野猪肉": ["烤野猪肉"],
  "鱼": ["烤鱼"],
};

function resolveOwnedItemName(requested){
  const name = String(requested || "").trim();
  if (!name || typeof state === "undefined" || !state || !state.backpack) return name;
  const ownedQty = (id) => {
    const qty = Number(state.backpack[id]);
    return Number.isFinite(qty) && qty > 0 ? qty : 0;
  };
  if (ownedQty(name) > 0) return name;

  // 只允许这里列出的、游戏数据中确有继承/烹饪/任务信物关系的读取侧别名。
  // 不做任意子串包含，避免把“蜂蜜”误结算成“蜂蜜酒”这类不同物品。
  for (const candidate of (OWNED_ITEM_ID_ALIASES[name] || [])){
    if (ownedQty(candidate) > 0) return candidate;
  }
  return name;
}

// --- handle (was main+1729-1931, 203 lines) ---
function handle(category, args){
  if (category==="请求帮助" && currentNPC!=="witch" && WAY_HOME[currentNPC]
      && !(HANDLED[currentNPC]||[]).includes("请求帮助")) return {text:WAY_HOME[currentNPC]};
  if (currentNPC === "seer") return handleSeer(category, args);
  if (currentNPC === "aeolus") return handleAeolus(category, args);
  if (currentNPC === "siren") return handleSiren(category, args);
  if (currentNPC === "cattle") return handleCattle(category, args);
  if (currentNPC === "calypso") return handleCalypso(category, args);
  if (currentNPC === "nausicaa") return handleNausicaa(category, args);
  if (currentNPC === "rebuilder") return handleRebuilder(category, args);
  if (currentNPC === "lotusman") return handleLotusman(category, args);
  if (currentNPC === "polyphemus") return handlePolyphemus(category, args);
  const a=args||{};
  const g=k=>(a[k]!==undefined&&a[k]!==null&&String(a[k]).trim()!=="")?String(a[k]).trim():null;
  switch(category){
  case "购买物品":{
    const item=g("物品"); if(!item) return {text:PH[category]};
    if (item==="金露" && state.affinity<85) return {text:"（她把手拢进袖口，没动）……金露是我压箱底的药，只给托付过的人。你的心意还没到那份上。"};
    if(!SHOP[item]) return {text:`（她扫了一眼货架）「${item}」我可不出售。货架上就那几样。`};
    const q=Math.max(1,toNum(g("数量"))), cost=shopPrice(item)*q;
    if(state.coins<cost) return {text:`（她瞥了瞥你的钱袋）${item} ${q} 份要 ${cost} 枚德拉克马——你还差 ${cost-state.coins} 枚。`};
    state.coins-=cost; addItem(item,q);
    if (item==="玛草") questEvent("collect",{item:"玛草"});   /* U-7：买任务品同步任务进度，任务本/罗盘不再显 0/3 */
    addMemory(`旅人买了 ${item}${q>1?"×"+q:""}`, 1); addAffinity(1);
    const tier = shopTier();
    return {text:`（她把 ${item}${q>1?`×${q}`:""} 推过来，收走 ${cost} 枚德拉克马${tier?`，摆摆手：「${tier}。」`:""}）拿好。还剩 ${state.coins} 枚。`};
  }
  case "卖出物品":{
    const requestedItem=g("物品")||g("物品名称"); if(!requestedItem) return {text:PH[category]};
    const item=resolveOwnedItemName(requestedItem);
    if(!state.backpack[item]) return {text:`你身上哪有「${requestedItem}」？`};
    const q=Math.min(toNum(g("数量")), state.backpack[item]);
    const priceKey=SHOP[item]?item:(SHOP[requestedItem]?requestedItem:item);
    const price=SHOP[priceKey]?Math.max(1,Math.floor(SHOP[priceKey]/2)):2;
    delItem(item,q); state.coins+=price*q;
    return {text:`（她接过来翻看两下，丢给你 ${price*q} 枚德拉克马）勉强收了。`};
  }
  case "查询价格":{
    const item=g("物品"); if(!item) return {text:PH[category]};
    if(SHOP[item]){ const p=shopPrice(item), tier=shopTier();
      return {text:`${item}，一枚 ${p} 德拉克马${tier?`（${tier}）`:""}。`}; }
    return {text:`「${item}」？我不往外卖。卖给我的话……给你 2 枚。`};
  }
  case "查询库存":{
    const item=g("物品");
    if(item) return SHOP[item]?{text:`${item}有货，一枚 ${shopPrice(item)} 德拉克马。`}:{text:`${item}？没听过，不卖。`};
    const extra = affInventory().length ? "（另有 " + affInventory().map(k=>`${k} ${shopPrice(k)}枚`).join("、") + " 只对"+affinityTier()+"的人开。）" : "";
    return {text:"（她朝货架抬了抬下巴）"+Object.keys(SHOP).filter(k=>k!=="金露"||state.affinity>=85).map(k=>`${k} ${shopPrice(k)}枚`).join("、")+extra+"。"};
  }
  case "查询背包":{
    const requestedItem=g("物品")||g("物品名称");
    if(requestedItem){
      const item=resolveOwnedItemName(requestedItem);
      return state.backpack[item]?{text:`你背包里有 ${requestedItem}×${state.backpack[item]}。`}:{text:`你背包里没有「${requestedItem}」。`};
    }
    return {text:"（她扫了一眼你的行囊）"+bagText()+"。"};
  }
  case "丢弃物品":{
    const requestedItem=g("物品")||g("物品名称"); if(!requestedItem) return {text:PH[category]};
    const item=resolveOwnedItemName(requestedItem);
    if(isProtectedItem(requestedItem)||isProtectedItem(item)) return {text:`「${requestedItem}」是路上带在身上的信物，扔不得。`};
    if(!delItem(item)) return {text:`你背包里没有「${requestedItem}」可扔。`};
    return {text:`（她看着你把 ${requestedItem} 扔进灌木丛，把坩埚搅得更响了些。）`};
  }
  case "给予物品":{
    const requestedItem=g("物品")||g("物品名称"); if(!requestedItem) return {text:PH[category]};
    const item=resolveOwnedItemName(requestedItem);
    if(isProtectedItem(requestedItem)||isProtectedItem(item)) return {text:`你把「${requestedItem}」往前递了递，又收了回来——这东西不能给人。`};
    if(!delItem(item)) return {text:`你想给我「${requestedItem}」？先看看拿没拿得出来。`};
    addAffinity(6); addMemory(`旅人送了她「${requestedItem}」`, 3); sfx("bless");
    const t = state.affinity>=85
      ? "（她把东西收进袖子，指尖在你手背上轻轻敲了两下）……你这人，总让我为难。"
      : state.affinity>=60
      ? "（她接过去对着光看了看，难得笑了一下）……算你有心。"
      : "（她接过去，挑眉打量你一眼）……无功不受禄。不过，收下了。";
    return {text:t};
  }
  case "装备物品":{
    const requestedItem=g("物品")||g("物品名称")||state.equipped; if(!requestedItem) return {text:PH[category]};
    const item=resolveOwnedItemName(requestedItem);
    if(!state.backpack[item]) return {text:`你先得有「${requestedItem}」。`};
    state.equipped=item; return {text:`（你把 ${requestedItem} 紧了紧。她瞥了一眼）小心别戳到脚。`};
  }
  case "卸下装备":{
    if(!state.equipped) return {text:"你身上本来就没拿着什么家伙。"};
    const it=state.equipped; state.equipped=null;
    return {text:`（你把 ${it} 收好。屋里的空气松弛了一点。）`};
  }
  case "使用消耗品":{
    const requestedItem=g("物品")||g("物品名称"); if(!requestedItem) return {text:PH[category]};
    if(requestedItem==="风袋") return useWind();
    const item=resolveOwnedItemName(requestedItem);
    if(!state.backpack[item]) return {text:`你背包里没有「${requestedItem}」。`};
    let fx="（一股暖流淌过喉咙。）";
    const f=FOOD[item], dr=DRINK[item];
    if(item==="治疗草药"){state.status["伤势"]="无"; state.hp=Math.min(derived().maxHp,state.hp+20); fx="（药力渗进伤口，刺痛褪去——伤势痊愈，血量 +20。）";}
    else if(item==="烤野猪肉"){state.status["伤势"]="无"; state.hp=Math.min(derived().maxHp,state.hp+40); fx="（油脂混着炭火气，伤势痊愈、血量 +40；肚子里也踏实了。）";}
    else if(item==="玛草"){state.status["士气"]="振奋";fx="（苦得舌根发麻，精神却一振。她憋着笑。）";}
    else if(item==="治疗药膏"){state.status["伤势"]="无"; state.hp=Math.min(derived().maxHp,state.hp+30); fx="（药膏贴上伤口，烫得人一激灵——伤势好了，血也补上来些。）";}
    else if(item==="提神茶"){state.status["士气"]="振奋"; state.hunger=Math.min(100,state.hunger+12); fx="（茶是温的，甜里带苦。坐直了，精神一振。）";}
    else if(item==="金露"){state.hp=derived().maxHp; state.status["伤势"]="无"; state.hunger=Math.min(100,state.hunger+25); state.thirst=Math.min(100,state.thirst+25); fx="（一滴金露落在舌尖——暖流瞬间淌遍四肢百骸，伤势全消，浑身是劲。只有她托付的人，才有这份。）";}
    else if(f||dr){fx=f?"（下肚，肚子里踏实了。）":"（溪水般的凉意，口渴全消。）";}
    else {fx=`（${item}下肚，说不上好吃，但踏实了些。）`;}
    if (f){ state.hunger=Math.min(100,state.hunger+(f.h||0)); state.thirst=Math.min(100,state.thirst+(f.t||0)); }
    if (dr){ state.thirst=Math.min(100,state.thirst+(dr.t||0)); }
    popText(aiaPlayer.x, aiaPlayer.y-26, item==="治疗草药"?"血 +20":f?`饱食 +${f.h}`:dr?`饮水 +${dr.t}`:"使用", "#7bd389");
    delItem(item); sfx("cook"); renderHUD(); return {text:fx};
  }
  case "查询自身状态":{
    const s=g("状态项");
    if(s) return state.status[s]!==undefined?{text:`你的${s}：${state.status[s]}。`}:{text:`「${s}」？我只看得懂饥饿、口渴、伤势、士气。`};
    return {text:"（她上下打量你）"+Object.entries(state.status).map(([k,v])=>`${k}：${v}`).join("；")+"。"};
  }
  case "获取物资":
    return {text:"（她用木勺朝东边一指）想动手就去草丛——屋后东北角，发光的那几丛就是玛草。走过去，按 E。"};
  case "营地准备":{
    const act=g("动作")||"张罗";
    return {text:`（她看你${act}，懒得评价，只把坩埚往旁边挪了挪）别把烟吹进我的锅。`};
  }
  case "闲聊":
    return {text:"（她添了根柴，火舌舔着锅底）……说吧。海上来的人，嘴里总压着点事。不想说也行，炉边暖和。"};
  case "请求帮助":
    if (state.circeSworn)
      return {text:"（她把空杯倒扣在桌上）路还是那条路：往西，俄刻阿诺斯之岸，找那个瞎眼的先知；往东南，声之海峡，把耳朵堵上。别指望我把你送到伊萨卡——这一段得你自己付账。"};
    return {text:"（她往锅里添了一撮灰，火苗矮了半截）回家？先弄明白你在哪儿。往西是俄刻阿诺斯之岸，特瑞西阿斯知道所有回去的水路；往东南是声之海峡，过不去，就什么也别谈。海图上都画着。"};
  case "导航到地点":{
    const d=g("目的地"); if(!d) return {text:PH[category]};
    /* 暗线②：对她说起斯库拉/海峡，托付三个字（需先结清玛草委托） */
    if (/斯库拉|海峡/.test(d)){
      const q = getQuest("witch_grass");
      if (q && q.done && state.prophecy && !state.circeMessage && !state.scyllaDebtPaid){
        state.circeMessage=true; addAffinity(5); renderHUD(); save();
        addMemory("喀耳刻托旅人给斯库拉带三个字——不说是哪三个", 4);
        return {text:"（她搅药的手停了）声之海峡，往东南去，雾最厚的地方。（很久）……替我给斯库拉带三个字。哪三个我不说——到了，她自然听得懂。"};
      }
      if (state.circeMessage) return {text:"（她重新搅起药）三个字在你身上了。到了海峡，说出口就成了。"};
      if (state.scyllaDebtPaid) return {text:"（她背对着你，肩膀松了一寸）……话带到了。不必再说。"};
      return {text:"声之海峡，往东南去，雾最厚的地方。（她没看你）没什么要带的。"};
    }
    const m={"泉眼":"小屋后的小溪逆流而上","淡水源":"小屋后的小溪逆流而上","淡水":"小屋后的小溪逆流而上",
      "港口":"穿过松林一直往北，闻到咸味就到了","码头":"穿过松林一直往北",
      "祭坛":"东边山坡上的旧遗迹","神庙":"东边山坡上的旧遗迹","冥界":"（她收起笑，往海图极西一指）俄刻阿诺斯之岸，驾船一直向西。血入沟，那位老人才肯开口。"};
    return {text:m[d]||`「${d}」？（她朝天边一抬下巴）顺着风走。迷路了就问乌鸦。`};
  }
  case "查询附近目标":
    return {text:"（她用木勺点了四个方向）北边松林尽头是港口；屋后有溪，水甜；东北草丛有玛草；东山坡有座旧祭坛——别乱碰供品。（要去哪，直接说「带我去×」，我给你指路。）"};
  case "查询环境状况":{
    const e=g("要素");
    const m={"风向":"西风。很吵，但不算坏。","浪高":"浪今天脾气不错。","天气":"云压得低，晚些怕有雨。",
      "昼夜":"太阳还有一竿子高。","能见度":"雾从海峡那边漫过来了。","潮汐":"正在退潮。","水温":"凉。贴骨头的凉。","危险程度":"（她看了你一眼）比你想象的危险。"};
    return {text:m[e]||"（她舔了舔手指举起来）……风向不对。办你的事去吧。"};
  }
  case "船只操作": return {text:"出海的事码头说了算——去南边栈桥，按 E 扬帆。"};
  case "接取任务":{
    const existed = !!getQuest("witch_grass");
    const q = acceptQuest("witch_grass");
    if(!existed){
      addMemory("旅人接下了采玛草的委托", 2);
      return {text:"（她放下木勺，头一次正眼看你）正好缺人手。林子里的玛草被野猪拱得只剩几丛——去东北边的草丛采 3 株回来，我付你一瓶治疗草药，外加 5 枚德拉克马。"};
    }
    if(q.done) return {text:"那单活已经结清了。新的活……等我先想想。"};
    if(q.have>=q.need) return {text:"玛草不是齐了吗？东西给我——说「交任务」就行。"};
    return {text:`玛草还差 ${q.need-q.have} 株。东北边，发光的草丛。`};
  }
  case "查询任务线索":{
    const q = getQuest("witch_grass");
    if(!q) return {text:"（她擦着手）要说活儿……我这里确实有一件。想知道就开口。"};
    if(q.done && state.prophecy && !state.circeMessage && !state.scyllaDebtPaid){
      state.circeMessage=true; addAffinity(5); renderHUD(); save();
      addMemory("喀耳刻托旅人给斯库拉带三个字——不说是哪三个", 4);
      return {text:"（她忽然放下木勺，背对着你）下一程要过声之海峡吧。……替我给斯库拉带三个字。哪三个我不说——到了，她自然听得懂。"};
    }
    return {text:q.done?"上一单结清了。……想去哪儿？极西的俄刻阿诺斯之岸，有位看不见的老人在等血入沟。海上还飘着一座浮岛——风神岛，风大得能把话吹回你嘴里。":`当前委托「${q.name}」：采 3 株玛草，已交 ${q.have} 株。报酬：治疗草药一瓶 + 5 枚德拉克马。`};
  }
  case "查询任务进度":{
    const q = getQuest("witch_grass");
    return q?(q.done?"那单活已经结了。":{text:`「${q.name}」：${q.have}/${q.need} 株玛草。`}):{text:"我们之间还没有约定在先。"};
  }
  case "提交任务":{
    const q = getQuest("witch_grass");
    if(!q) return {text:"你拿什么交差？我们之间可没有约定。"};
    if(q.done && q.turned) return {text:"已经结清了，别想多领一份。"};
    if(q.have<q.need || !state.backpack["玛草"] || state.backpack["玛草"]<q.need)
      return {text:`玛草呢？（她摊开手）还差 ${q.need-q.have} 株。我的耐心可不长草。`};
    delItem("玛草",q.need); state.coins+=5; addItem("治疗草药"); q.done=true; q.turned=true;   /* set-once：已交付标记，防重复结算 */
    addAffinity(15); gainXp(30);
    addMemory("旅人交齐了玛草，结清了第一单委托", 3);
    const bonus = state.affinity>=85 ? 4 : state.affinity>=60 ? 2 : 0;   /* 托付加成：交差多给几枚（好感→结算） */
    if (bonus) state.coins += bonus;
    let extra = "";
    if (bonus) extra = `\n（她多拍了两枚在你手心——算 ${affinityTier()}的价，别声张。+${bonus} 枚）` + (state.boarKilled && !state.boarRewarded ? "" : `\n（历练 +30，她对你的态度：${affinityTier()}）`);
    if (state.boarKilled && !state.boarRewarded){ state.boarRewarded=true; state.coins+=3; addAffinity(8); extra+="\n（她瞥了眼草丛方向）听说那头野猪不会再来了。这 3 枚，算我谢你。（历练 +30，她对你的态度："+affinityTier()+"）"; }
    else if (!bonus) extra = `\n（历练 +30，她对你的态度：${affinityTier()}）`;
    renderHUD(); save();
    return {text:"（她掂了掂那三株玛草，难得点了点头）手不算笨。说好的——药和 5 枚德拉克马，拿去。"+extra};
  }
  case "放弃任务":{
    const q = getQuest("witch_grass");
    if(!q) return {text:"本来也无约可毁。"};
    delete state.quests.witch_grass; renderHUD(); save();
    return {text:"（她耸耸肩）随你。野猪会感谢你的。"};
  }
  case "威胁或攻击":
    addAffinity(-5);
    addMemory("旅人冲她动了气", 1);
    if (state.boarKilled) return {text:"（她难得地挑了下眉）那头拱我玛草的野猪，你已经替我收拾了。算你干了件正事。"};
    return {text:"（坩埚里的绿泡卟咤了一声。她连头都没回）……坐下。想打架？要是那头拱坏我玛草的野猪——东北边草丛，走近点，按 E。自己动手，别指望我替你抡拳头。"};
  case "告别":
    return {text: state.affinity>=60
      ? "（她挥挥手，重新搅动坩埚）去吧。风大了就回来——锅一直是热的。"
      : "（她挥挥手，重新搅动坩埚）去吧。路上小心——别在海峡附近听歌。"};
  case "其他意图":
    return {text:"（她挑起一边眉，火光在她眼下晃了晃）……你这句话，问得太远。近一点：药、路，还是海上的传言？"};
  }
  return null;
}


// --- polyNameExam (was main+1980-2007, 28 lines) ---
function polyNameExam(raw){
  const t=(raw||"").trim();
  /* P1 修复：原先只认「我叫/我是/名字是+名字」句式——玩家直接说「无人」永远不认账，
     巨人反复催报名字 → 序章组其四的名字考试离线（带 key 也一样）无法通过，主线卡死。
     现在整句短输入（无动词的 1~8 字）也视作自报姓名；示例语里补「我是无人」教句式。 */
  const m = /(?:我叫|我是|名字[是叫])\s*([\u4e00-\u9fa5A-Za-z0-9]{1,8})/.exec(t)
    || (/^[\u4e00-\u9fa5A-Za-z0-9]{1,8}$/.test(t) && !/你好|您|再见|谢谢|告辞|什么|怎么|为何|为什么|谁|哪|吗|呢|吧|嘛|啊|是的|不是|好的|嗯|请|帮|风|羊|岛|海/.test(t) ? [null, t] : null);
  if (!m) return null;
  const name=m[1];
  state.polNameGiven=name; state.namesHeard=true;
  if (/无人/.test(name)){
    /* P0.3（17g 原著对齐）canon：重认原著骗术 */
    addMemory("旅人向盲眼的巨人又报了一次「无人」——他笑着听完了这个假名", 4, "polyphemus");
    save();
    return {text:"（他愣了愣，随即笑得石屑簌簌直落）『无人』！哈——好名字，小东西，你倒会挑。记住那个人的教训：他用假名赢了夜，却用真名输了十年。海替所有人记账——这一回，替你把账翻过去吧。（「无人」这个名字，从此也在你心里有了分量）"};
  }
  if (/奥德修斯/.test(name)){
    /* P0.3（17g 原著对齐）canon 诅咒条款：真名喊给海听 */
    /* P2.8：诅咒入账（波塞冬三笔之一；重复报名只记一笔） */
    if (!state.polWrathMark){ state.polWrathMark = true; state.poseidonWrath = (state.poseidonWrath||0)+1; }
    addMemory("旅人向盲眼的巨人报出了真名「奥德修斯」——波塞冬在浪底下听见了", 5, "polyphemus");
    save();
    return {text:"（他猛地转向你，瞎眼的脸正对着你的声音）是你。十一年了……你的味道，和那年灌醉我的酒一样。你把名字喊给海听了——海替所有人记账，我爹也在听。（海神记下了这笔账）"};
  }
  addMemory(`旅人向盲眼的牧羊巨人自报了名字：「${name}」——海替所有人记账`, 4, "polyphemus");
  save();
  return {text:`（他侧耳听完，鼻翼动了动）……你的味道，和那年灌醉我的酒有点像。十一年了。「${name}」。好——你说出口了，它就不只属于你了。把名字喊给海听之前，想清楚。海替所有人记账。（「无人」这个名字，从此也在你心里有了分量）`};
}


// --- npcJobFor (was main+2028-2033, 6 lines) ---
function npcJobFor(npc, category){
  const m = NPC_JOB_MAPS[npc];
  if (m && m[category]) return m[category];
  if (npc === "witch") return PERSONA_JOB[category] || category;
  return category;
}


// --- npcJob (was main+2034-2036, 3 lines) ---
function npcJob(category){
  return npcJobFor(currentNPC, category);
}


// --- auditHandlers (was main+2058-2072, 15 lines) ---
function auditHandlers(){
  if (!SCHEMA.length) return [];
  const cats = SCHEMA.map(s=>s.category).filter(Boolean);
  const gaps = [];
  for (const npc of Object.keys(HANDLED)){
    for (const c of cats){
      /* 覆盖 = 有本地 handler，或有人格引导（npcJobFor 返回引导语而非裸类别名） */
      if (!HANDLED[npc].includes(c) && npcJobFor(npc, c) === c)
        gaps.push({npc, category:c, note:"无 handler 也无人格引导，将裸落人格模型"});
    }
  }
  if (gaps.length) console.warn("[意图覆盖审计] 有类别未登记：", gaps);
  else console.log("[意图覆盖审计] 全部类别均有 handler 或人格引导 ✓（", cats.length, "类 × ", Object.keys(HANDLED).length, "NPC ）");
  return gaps;
}


// --- memoryGreeting (was main+2075-2090, 16 lines) ---
function memoryGreeting(){
  const mems = (state.memory||[]).filter(m=>m.imp>=4 && (m.who===currentNPC||m.who==="any")
    && !(state.memGreeted||[]).includes(m.t));
  if (!mems.length) return null;
  const m = mems[mems.length-1];
  state.memGreeted = [...(state.memGreeted||[]), m.t].slice(-12);
  const style = {
    witch: `（她搅药的手顿了顿）……${m.text}。这种事，我记性好得很。`,
    seer:  `（杖尖在石上轻点）……${m.text}。亡者也都看见了。`,
    aeolus:`（一阵风打着旋落下）……${m.text}——风把它吹回来了。`,
    siren: `（歌声转了个调）……${m.text}。我们把这一段，也编进歌里了。`,
    cattle:`（母牛慢慢嚼着草）……${m.text}。牛的记性，比人长。`,
    telemachus:`（他按了按矛，声音紧了半度）……${m.text}。这种事，我不敢忘。`,
  };
  return style[currentNPC]||null;
}


// --- rumorGreeting (was main+2093-2098, 6 lines) ---
function rumorGreeting(){
  const rumor = rumorNextFor(currentNPC);
  if (!rumor || rumor.heard) return null;
  R.markHeard(state.rumors, rumor.r.id, currentNPC);
  return R.lineFor(rumor, currentNPC);   /* 传 npcKey：VOICE 口吻变体按人取样（v2） */
}


// --- witchIntro (was main+2101-2107, 7 lines) ---
function witchIntro(){
  if (state.sunlit) return "（门开着，晨光落在坩埚上——岛上第一次这么亮。她头也不抬，声音却比哪天都软）……回来了。快进来，锅里是新的。";
  if (state.affinity>=85) return "（她头也不抬，嘴角却弯了）……我当你还会来的。坐，锅里是新的。";
  if (state.affinity>=60) return "（她从坩埚后抬起眼，难得没有皱眉）门没闩就进来吧。今天要什么？";
  if (state.affinity>=30) return "（她从坩埚后抬眼认出了你）又是你。买药、问路、听预言——挑一样。";
  return "（你推门进去。炉火无风自动，屋里的女人头也不回）……十年。锅换过三个，你没回来看过一次。说吧——买药、问路、听预言，还是这回，肯把旧账讲清？";
}


// --- contextBrief (was main+2110-2125, 16 lines) ---
function contextBrief(){
  const parts=[];
  parts.push(`现在是${clockName()}${isNight()?"（夜）":""}`);
  parts.push(`旅人：${state.hp}/${derived().maxHp} 血、${state.coins} 枚德拉克马、等级 ${state.level}、饱食 ${Math.round(state.hunger)}/100、饮水 ${Math.round(state.thirst)}/100、手持 ${state.equipped||"无"}`);
  const qs = Object.values(state.quests||{});
  if (qs.length) parts.push("任务："+qs.map(q=>`「${q.name}」${q.done?"已完成":`进度 ${q.have}/${q.need}`}`).join("、"));
  else parts.push("没有进行中的委托");
  if (state.prophecy) parts.push(`他已在冥界选了${state.prophecy==="long"?"长路":"捷径"}`);
  if (state.backpack["风袋"]) parts.push(`他包里有风袋×${state.backpack["风袋"]}`);
  const mems = recallMemories(3);
  if (mems.length) parts.push("你记得关于他的事："+mems.join("；"));
  const rums = R.forNpc(state.rumors, currentNPC, NPC_SCENE[currentNPC]).slice(0,2).map(x=>x.r.summary);
  if (rums.length) parts.push("你从海路听来的传闻："+rums.join("；"));
  if (currentNPC==="witch") parts.push(`你对他的态度：${affinityTier()}（好感 ${Math.round(state.affinity)}/100；冷淡<30<熟络<60<信任<85<托付，态度越热络称呼和语气越软）`);
  /* 抉择回声：把玩家一路走来的关键抉择揉进 NPC 上下文——台词会因此拐弯 */
  const dec = state.decisions||{};
  const echoes=[];
  if (dec.sea_storm) echoes.push(`风暴里他选了「${dec.sea_storm}」`);
  if (dec.sea_wreckboat) echoes.push(`遇难小艇他选了「${dec.sea_wreckboat}」`);
  if (dec.troy_fire) echoes.push(`特洛伊之夜他选了「${dec.troy_fire}」`);
  if (dec.mead) echoes.push(`蜜酒前他选了「${dec.mead}」`);
  if (dec.crew_noise) echoes.push(`太阳岛鼓噪他选了「${dec.crew_noise}」`);
  if (dec.calypso) echoes.push(`卡吕普索的永生他选了「${dec.calypso}」`);
  /* B2 新并入主线的六段旧路 */
  if (dec.ismaros_plunder) echoes.push(`伊斯玛洛斯他选了「${dec.ismaros_plunder}」`);
  if (dec.lotus_fruit) echoes.push(`食莲岛的莲子他选了「${dec.lotus_fruit}」`);
  if (dec.cyclops_name) echoes.push(`独眼巨人问他名字时，他选了「${dec.cyclops_name}」`);
  if (dec.telepylos_ship) echoes.push(`忒勒皮洛斯的最后一条船他选了「${dec.telepylos_ship}」`);
  if (dec.aeolia_winds) echoes.push(`风神岛袋口他选了「${dec.aeolia_winds}」`);
  if (echoes.length) parts.push("他一路的抉择："+echoes.join("；")+"——这些选择塑造了他，你说话时会带上你对这些选择的看法");
  return parts.join("。");
}


// --- extractJSON (was main+2127-2134, 8 lines) ---
function extractJSON(text){
  text=(text||"").trim();
  let m=text.match(/```(?:json)?\s*([\s\S]*?)```/); if(m) text=m[1].trim();
  try{const d=JSON.parse(text); if(Array.isArray(d)) return d; if(d&&typeof d==="object") return [d];}catch(e){}
  const a=text.indexOf("["), b=text.lastIndexOf("]");
  if(a!==-1&&b>a){try{const d=JSON.parse(text.slice(a,b+1)); if(Array.isArray(d)) return d;}catch(e){}}
  return null;
}


// --- localFallbackParse (was main+2136-2176, 41 lines) ---
/* 批次 K1：旧的「有序正则 if-else 链」已换成 src/agent/localIntent.js 的打分制引擎
   （累加打分不短路 + 独立槽位抽取 + 低于阈值不硬猜）。
   下面那张旧表保留为 localFallbackLegacy——只在引擎异常时兜底，正常路径不再走它；
   tests/local-intent.test.cjs 里有一组差分断言，保证新引擎不弱于旧表。 */
function localFallbackParse(text, npcKey, context){
  /* 批次 K1：名字考试（polyNameExam）读的是 window.lastPlayerText，
     而那东西原先只在 apiParse() 里赋值——离线兜底路径永远拿不到，
     巨人「报名字」考离线彻底失效。这里补上，离线与在线口径一致。 */
  try{ window.lastPlayerText = text; }catch(e){}
  const history = Array.isArray(context) ? context.slice()
    : (context && Array.isArray(context.history) ? context.history.slice() : []);
  let runtimeNpcName = "";
  try{
    if (typeof NPC_SHORT !== "undefined" && NPC_SHORT[npcKey]) runtimeNpcName = NPC_SHORT[npcKey];
    else if (typeof NPCS !== "undefined" && NPCS[npcKey] && NPCS[npcKey].name) runtimeNpcName = NPCS[npcKey].name;
  }catch(e){ /* 纯函数测试环境没有 NPC 数据表时，由引擎内置名称表回退 */ }
  try{
    const preds = localIntentParse(text, { npcKey, npcName: runtimeNpcName, history });
    if (preds && preds.length) return preds;
  }catch(e){ console.warn("[localIntent] 引擎异常，落旧表：", e); }
  return localFallbackLegacy(text);
}
/* 旧表（兜底 + 差分测试基准） */
function localFallbackLegacy(text){
  const t=(text||"").trim();
  const hit=re=>re.test(t);
  const argsOf=()=>{
    const m=t.match(/淡水|面包|玛草|蜂蜜酒|蜂蜜|橄榄油|铁剑|铜矛|治疗草药|烤野猪肉|野猪肉|风袋|歌词残页|蜡|弓|箭|皮甲|海藻|烤鱼|牛肉|鱼|光|金苹果|木料|莲子|莲子干|羊毛|羊毛披风|绳结|断桨|喀科恩酒/);
    return m?{物品:m[0]}:{};
  };
  const mk=(category,args)=>[{category,args:[args||{}]}];
  if (hit(/再见|告辞|回头见|先走了|先登船/)) return mk("告别");
  if (hit(/风袋/)) return mk("使用消耗品",{物品:"风袋"});
  if (hit(/交任务|交差|做完了|搞定了/)) return mk("提交任务");
  if (hit(/长路|归乡的路/)) return mk("接取任务",{任务名称:"长路"});   /* 离线选路：冥界先知抉择，复用 handleSeer 选路结算 */
  if (hit(/捷径|荣耀|近路/)) return mk("接取任务",{任务名称:"捷径"});
  if (hit(/接任务|接(?:个|下)?活|接(?:个|下)?委托|接下(?!来)|这活我干|交给我|我接|算我一个|应下/)) return mk("接取任务");   /* 离线卡点修复：「我接下这个委托」原本匹配不上（接下/接委托/我接 都是玩家高频说法）；接下(?!来) 防误伤「接下来怎么办」；个/下 中缀兼容「接个委托/接下这个活」 */
  if (hit(/有什么活|什么委托/)) return mk("查询任务线索");
  if (hit(/进度|还差几|做得怎么样|干的怎么样|能交了吗/)) return mk("查询任务进度");
  if (hit(/买|来一份|来一壶|来一瓶/)) return mk("购买物品",argsOf());
  if (hit(/卖掉|卖给你|换成钱|拿去换/)) return mk("卖出物品",argsOf());
  if (hit(/多少钱|什么价|贵不贵/)) return mk("查询价格",argsOf());
  if (hit(/有什么卖|还有吗|有货吗|都有什么货/)) return mk("查询库存");
  if (hit(/背包里有什么|身上有什么|还剩多少|还有几/)) return mk("查询背包",argsOf());
  if (hit(/扔了|丢掉|不要了/)) return mk("丢弃物品",argsOf());
  if (hit(/给你|拿着|收下/)) return mk("给予物品",argsOf());
  if (hit(/装备|穿上|换上/)) return mk("装备物品",argsOf());
  if (hit(/脱下|取下|收起来/)) return mk("卸下装备",argsOf());
  if (hit(/喝水|喝药|吃点|用烤|用药|把玛草用/)) return mk("使用消耗品",argsOf());
  if (hit(/饿不饿|渴不渴|血量|伤势|士气|状态如何/)) return mk("查询自身状态");
  if (hit(/钓鱼|取水|捡|砍点|采|弄点/)) return mk("获取物资");
  if (hit(/生火|搭帐篷|扎营|做把桨/)) return mk("营地准备");
  /* 归途：玩家最自然会问的一句话，不能再掉进「其他意图」的拒绝里 */
  if (hit(/回家|回乡|回去|归途|归乡|离开(?:这里|这座岛|这儿|这)|出路|怎么出岛|逃出去|走不掉|伊萨卡/)) return mk("请求帮助");
  if (hit(/怎么走|带我去|我要去|往哪边|怎么去/)) return mk("导航到地点",{目的地:(t.match(/(?:去|往)([^，．！？\s]{2,8})/)||[])[1]||""});
  if (hit(/附近|在哪|哪里有/)) return mk("查询附近目标");
  if (hit(/风向|浪|天气|雾|危险吗/)) return mk("查询环境状况");
  if (hit(/故事|讲讲你|你是谁|洞里|那晚|这里都有些谁|怎么回事|说说你的经历|你的经历/)) return mk("查询地点信息");
  if (hit(/哪里能钓|什么鱼|塞壬|斯库拉|海怪|野猪|圣牛|赫利俄斯|太阳岛|卡吕普索|瑙西亚娅|求婚者|德摩多科斯|神女|波吕斐摩斯|独眼巨人|巨羊|食莲者|莱斯特律戈尼/)) return mk("查询生物情报");
  if (hit(/预言|神谕|预示/)) return mk("查询神谕");
  if (hit(/开船|出海|启航|扬帆|靠岸/)) return mk("船只操作",{动作:hit(/靠岸/)?"靠岸":"出航"});
  if (hit(/找死|拔剑|单挑|废物|抢的就是你/)) return mk("威胁或攻击");
  if (hit(/怎么办|帮帮我|给点建议|该怎么|借一头|借一匹|借牛|作保/)) return mk("请求帮助");
  if (hit(/你好|最近怎么样|海真漂亮|你叫什么/)) return mk("闲聊");
  return mk("其他意图");
}


// --- loadParseCache (was main+2185-2189, 5 lines) ---
function loadParseCache(){
  if (_parseCache) return _parseCache;
  try{ _parseCache = JSON.parse(localStorage.getItem(PARSE_CACHE_KEY)||"{}")||{}; }catch(e){ _parseCache = {}; }
  return _parseCache;
}


// --- parseCacheSave (was main+2190-2196, 7 lines) ---
function parseCacheSave(){
  try{
    const ks = Object.keys(_parseCache);
    if (ks.length > 240) ks.slice(0, ks.length-240).forEach(k=>delete _parseCache[k]);   /* 粗 LRU：超容量删最老 */
    localStorage.setItem(PARSE_CACHE_KEY, JSON.stringify(_parseCache));
  }catch(e){}
}


// --- addMsg (was main+2250-2282, 33 lines) ---
function addMsg(role,text,chips,instant,memo,isFb){
  const row=document.createElement("div"); row.className="row "+(role==="user"?"me":"");
  const col=document.createElement("div"); col.className="col";
  const who=document.createElement("div"); who.className="who"; who.textContent=role==="user"?"你":NPCS[currentNPC].name;
  const bb=document.createElement("div"); bb.className="bubble "+(role==="user"?"me":"witch")+(isFb?" fb":"");
  const mm=moodFor(text); if (role!=="user"&&mm) bb.classList.add("mood-"+mm);
  col.appendChild(who); col.appendChild(bb);
  /* 记忆可视化：NPC 回复命中玩家过去记忆 → 气泡侧加标签 + 边框高亮 */
  if (memo && role!=="user"){
    bb.classList.add("hasMemo");
    const tag=document.createElement("div"); tag.className="memoTag"; tag.textContent=memo;
    col.appendChild(tag);
  }
  if(chips&&chips.length){
    const cw=document.createElement("div"); cw.className="chips";
    chips.forEach(c=>{const s=document.createElement("span"); s.className="chip"; s.innerHTML=c; cw.appendChild(s);});
    col.appendChild(cw);
  }
  row.appendChild(col);
  const msgs=document.getElementById("msgs");
  msgs.appendChild(row);
  msgs.scrollTop=1e9;
  /* 打字机（视觉反馈；回放历史/用户消息直接全量）——animate：可中断、时长受控 */
  if (instant || role==="user" || text.length<=2){ bb.textContent=text; return; }
  const step = Math.max(2, Math.ceil(text.length/46));   /* 总时长约 46 帧（~0.75s）封顶 */
  let i=0;
  const tw=setInterval(()=>{
    i+=step;
    bb.textContent=text.slice(0,i);
    msgs.scrollTop=1e9;
    if (i>=text.length){ clearInterval(tw); bb.textContent=text; }
  },16);
}


// --- chipHTML (was main+2283-2286, 4 lines) ---
function chipHTML(category,args){
  const pairs=Object.entries(args||{}).map(([k,v])=>`${k}:${v}`).join(" · ");
  return `<b>${category}</b>`+(pairs?`　${pairs}`:"");
}


// --- addThinkRow (was main+2289-2299, 11 lines) ---
function addThinkRow(){
  const row=document.createElement("div"); row.className="row";
  const col=document.createElement("div"); col.className="col";
  const who=document.createElement("div"); who.className="who"; who.textContent=NPCS[currentNPC].name;
  const bb=document.createElement("div"); bb.className="bubble witch thinking"; bb.textContent="……";
  const cap=document.createElement("div"); cap.className="thinkCap"; cap.textContent="正在思索……"; cap.style.display="none";
  col.appendChild(who); col.appendChild(bb); col.appendChild(cap); row.appendChild(col);
  const msgs=document.getElementById("msgs"); msgs.appendChild(row); msgs.scrollTop=1e9;
  setTimeout(()=>{ if (row.isConnected) cap.style.display=""; }, 350);
  return row;
}


// --- recallMention (was main+2302-2309, 8 lines) ---
function recallMention(text){
  const mems=(state.memory||[]).filter(m=>m.who===currentNPC||m.who==="any");
  if (!mems.length || !text) return null;
  const hits=mems.filter(m=>{ const k=(m.text||"").slice(0,14);
    return text.length>6 && text.includes(k); });
  if (hits.length) return `🧠 记得 · ${hits[0].text.length>18?hits[0].text.slice(0,18)+"…":hits[0].text}`;
  return null;
}


// --- splitClauseHint (was main+2313-2321, 9 lines) ---
function splitClauseHint(text, preds){
  const clauses = text.split(/[，。！？;；,!?]+/).map(s=>s.trim()).filter(s=>s.length>=2);
  if (clauses.length < 2) return null;
  const verbs = /买|卖|去|带|给|问|要|吃|喝|用|装|换|学|教|放|扔|开|停|帮|找|来|走|听|说|采|钓|捞|献|绑|封|释放|补|修|告诉|打听|看看|多少/;
  const hits = clauses.filter(c => verbs.test(c)).length;
  if (hits >= 2 && (!preds || preds.length < 2)) return "你好像说了两件事——分开说，我答得更准";
  if (preds && preds.length >= 2) return "都记下了，一件件来";
  return null;
}


// --- demoAdd (was main+2373-2387, 15 lines) ---
function demoAdd(who, text, tag){
  const body=document.getElementById("demoBody");
  const row=document.createElement("div"); row.className="demoRow "+(who==="user"?"user":"npc");
  const whoEl=document.createElement("div"); whoEl.className="who";
  whoEl.textContent = who==="user" ? "旅人" : (who==="witch"?"女巫喀耳刻":who);
  const bub=document.createElement("div"); bub.className="bub";
  row.appendChild(whoEl); row.appendChild(bub);
  if (tag){ const t=document.createElement("div"); t.className="demoTag "+(who==="user"?"user":""); t.textContent=tag; row.appendChild(t); }
  body.appendChild(row); body.scrollTop=1e9;
  /* 打字机效果 */
  if (text.length<=2){ bub.textContent=text; return; }
  const step=Math.max(2,Math.ceil(text.length/60)); let i=0;
  const tw=setInterval(()=>{ i+=step; bub.textContent=text.slice(0,i); body.scrollTop=1e9;
    if(i>=text.length){ clearInterval(tw); bub.textContent=text; } },16);
}


// --- demoWait (was main+2388-2388, 1 lines) ---
function demoWait(ms){ return new Promise(r=>setTimeout(r,ms)); }


// --- demoMems (was main+2389-2389, 1 lines) ---
function demoMems(){ return (state.memory||[]).filter(m=>m.who==="witch"||m.who==="any"); }

// === 全局声明（自主脚本迁入） ===

// --- SCHEMA (migrated from main script) ---
let SCHEMA=[];

// --- TASK_INSTRUCTION (migrated from main script) ---
const TASK_INSTRUCTION = `### 任务说明
根据【字段说明】判断【输入内容】所属类别,并抽取该类别对应的参数。
category 和参数名必须来自字段说明,不得自行新增。
只填写输入中明确表达的参数;没有可填写参数时 args 为 []。
args 中每个对象表示一组相关参数实例,多组独立实例分别放在不同对象中。
如果输入涉及多个类别,以列表形式返回。
如果输入包含多轮对话,根据最后一轮用户输入判断,并结合对话历史抽取参数。
只输出有效 JSON 数组,不包含 Markdown 标记或额外说明。
输出结构:[{"category":"xxx","args":[{"参数名":"参数值"}]}]

### 字段说明
{schema}

### 输入内容
{user_input}`;

// --- _parseCache (migrated from main script) ---
let _parseCache = null;

// --- parseInflight (migrated from main script) ---
const parseInflight = {};

// --- busy (migrated from main script) ---
let busy=false, lastUserText="";

// === 主脚本残留（第二批迁入） ===

// --- PH (migrated from main script) ---
const PH = {"购买物品":"想买点什么？我这儿有治疗草药、玛草、蜂蜜酒、蜂蜜、橄榄油、铁剑。",
  "卖出物品":"想卖什么？掏出来看看。","查询价格":"问哪样东西的价？","查询库存":"问哪样货？",
  "丢弃物品":"扔哪个？说名字。","给予物品":"把什么给我？","装备物品":"装备哪件？",
  "卸下装备":"卸下哪件？","使用消耗品":"用什么？说名字。","导航到地点":"去哪儿？说个地名。",
  "查询环境状况":"问风、浪、还是天色？","查询地点信息":"问哪个地方？","查询生物情报":"问哪种活物？",
  "查询神谕":"想听关于什么的预言？","接取任务":"接哪件活？","提交任务":"交哪件差事？",
  "放弃任务":"放弃哪件？","查询任务进度":"问哪件任务的进度？","查询任务线索":"想打听什么？",
  "获取物资":"想弄点什么回来？屋后东边的草丛里，发光的就是玛草。","营地准备":"要张罗什么？","请求帮助":"说说你卡在哪儿了。","闲聊":null};

// --- PERSONA_JOB (migrated from main script) ---
const PERSONA_JOB = {"闲聊":"陪她闲聊，顺着她的话头接","请求帮助":"给一条实用又带点神秘的建议",
  "查询神谕":"说一段关于这个话题的预言：克制、模糊、留一个隐约的警告",
  "查询生物情报":"讲讲这种生物的习性与危险，毒舌风格","查询地点信息":"讲讲这个地方的传闻，30字内"};

// --- HANDLED (migrated from main script) ---
const HANDLED = {
  witch: ["购买物品","卖出物品","查询价格","查询库存","查询背包","丢弃物品","给予物品","装备物品","卸下装备","使用消耗品","查询自身状态","获取物资","营地准备","闲聊","请求帮助","导航到地点","查询附近目标","查询环境状况","船只操作","接取任务","查询任务线索","查询任务进度","提交任务","放弃任务","威胁或攻击","告别","其他意图"],
  seer: ["查询神谕","接取任务","查询任务进度","查询任务线索","购买物品","卖出物品","查询价格","查询库存","给予物品","提交任务","放弃任务","告别"],
  aeolus: ["接取任务","查询任务进度","查询任务线索","提交任务","使用消耗品","查询环境状况","购买物品","卖出物品","查询价格","查询库存","给予物品","放弃任务","告别"],
  siren: ["购买物品","卖出物品","查询价格","查询库存","接取任务","提交任务","查询任务进度","放弃任务","给予物品","查询环境状况","告别"],
  cattle: ["请求帮助","接取任务","查询任务进度","查询任务线索","提交任务","放弃任务","购买物品","卖出物品","查询价格","查询库存","给予物品","获取物资","查询环境状况","告别"],
  calypso: ["查询任务线索","接取任务","查询任务进度","提交任务","查询神谕","查询环境状况","获取物资","导航到地点","查询附近目标","闲聊","告别"],
  nausicaa: ["查询任务线索","接取任务","查询任务进度","提交任务","查询生物情报","查询环境状况","获取物资","导航到地点","查询附近目标","闲聊","告别"],
  rebuilder: ["查询地点信息","查询生物情报","接取任务","请求帮助","给予物品","查询神谕","查询环境状况","告别"],
  lotusman: ["查询地点信息","查询生物情报","使用消耗品","给予物品","请求帮助","威胁或攻击","告别"],
  polyphemus: ["查询地点信息","查询生物情报","给予物品","获取物资","威胁或攻击","查询自身状态","闲聊","其他意图","请求帮助","告别"],
  epeius: [],   /* 特洛伊造马师：无本地 handler，全部靠 NPC_JOB_MAPS 人格引导兑底（audit 30 类） */
  telemachus: [],  /* P1.9 忒勒玛科斯：无本地 handler，全靠 NPC_JOB_MAPS 兑底（audit 30 类） */
};

// --- hashStr (migrated from main script) ---
function hashStr(s){ let h=5381; for (let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))|0; } return "h"+(h>>>0).toString(36); }

// --- apiParse (migrated from main script) ---
async function apiParse(userText){
  window.lastPlayerText = userText;   /* 名字考试等本地提取用（序章组） */
  const hist = history[currentNPC].slice(-6).filter(h=>!h.fb);
  /* send() 已把本次输入入栈——避免与下方显式拼接重复（实测原实现当前消息出现两次，浪费 token 且易扰动判读） */
  if (hist.length && hist[hist.length-1].role==="user" && hist[hist.length-1].content===userText) hist.pop();
  const lines=hist.map(h=>(h.role==="user"?"Human: ":"AI: ")+h.content);
  lines.push("Human: "+userText);
  const key = hashStr("v1|"+TASK_INSTRUCTION.length+"|"+JSON.stringify(SCHEMA||[]).length+"|"+lines.join("\u0001"));
  const cache = loadParseCache();
  if (cache[key]) return cache[key];
  if (parseInflight[key]) return parseInflight[key];
  const prompt=TASK_INSTRUCTION.replace("{schema}",JSON.stringify(SCHEMA)).replace("{user_input}",lines.join("\n"));
  const job = (async()=>{
    try{
      /* ck：给服务端的共享缓存/兜底键（NPC + 本句），让「同样的话」能命中缓存、
         上游挂了也能拿同话题旧答案顶上。服务端拿它做宽松键，不含任何敏感信息。 */
      const ck=hashStr("ck1|"+currentNPC+"|"+userText);
      const d=await postJSON("/api/parse",{prompt, ck}, 15000);   /* 意图解析超时 15s：服务端总预算 12s + 3s 余量；超了直接落本地兜底，别让玩家干等 */
      const preds=extractJSON(d.content);
      if(!preds) throw new Error("模型输出无法解析");
      const ok=preds.filter(p=>p&&typeof p==="object"&&p.category);
      if (ok.length){ cache[key]=ok; parseCacheSave(); }
      return ok;
    } finally { delete parseInflight[key]; }
  })();
  parseInflight[key]=job;
  return job;
}

// --- apiChat (migrated from main script) ---
async function apiChat(instruction){
  const N = NPCS[currentNPC];
  const sys = N.persona + "\n\n[你眼中的世界] " + contextBrief()
    + "\n\n[角色锚定] 你就是「" + N.name + "」本人。始终保持人格设定里的身份、性别与口吻，不要扮演或描述其他角色，不要出戏。"   /* Steam 化：修实测 persona drift（食莲者回复描述"她坐在船头"——串到别的角色形） */
    + "\n\n当前情境：" + instruction;
  const messages=[{role:"system",content:sys},
    ...history[currentNPC].slice(-6).filter(h=>!h.fb).map(h=>({role:h.role==="user"?"user":"assistant",content:h.content}))];
  const ck=hashStr("ck2|"+currentNPC+"|"+instruction);   /* 台词缓存键（NPC + 本轮情境） */
  const d=await postJSON("/api/chat",{messages, ck}, 20000);   /* 台词生成超时 20s：服务端总预算 15s + 5s 余量；超了走 NPC_FALLBACK */
  return d.content.trim();
}

// --- send (migrated from main script) ---
async function send(preset){
  const text=(preset!==undefined&&typeof preset==="string"?preset:document.getElementById("inp").value).trim();
  if(!text||busy) return;
  busy=true; lastUserText=text; document.getElementById("sendBtn").disabled=true; document.getElementById("inp").value="";
  addMsg("user",text); history[currentNPC].push({role:"user",content:text});
  /* Steam 化（PRODUCT §9 规划的体验兑底）：>350ms 的等待给「正在思索…」反馈——
     实测 P50 ≥ 0.8s、P99 ≥ 2.8s，没有等待反馈时玩家会重复发送或以为卡死 */
  const thinkRow=addThinkRow();
  try{
    let preds;
    try{ preds = await apiParse(text); }
    catch(offlineErr){ preds = localFallbackParse(text, currentNPC, { history: history[currentNPC] || [] }); }   /* 离线走打分制意图引擎，并带上与 apiParse 同源的当前 NPC 与对话历史 */
    const parts=[],chips=[],pq=[];
    const splitHint = splitClauseHint(text, preds);   /* multi 引导：拆不齐时提示分句说，拆齐了给正反馈 */
    if (splitHint) chips.push(`<span class="chip tip">${splitHint}</span>`);
    for(const p of preds){
      const insts=Array.isArray(p.args)&&p.args.length?p.args:[{}];
      let np=false;
      for(const inst of insts){ chips.push(chipHTML(p.category,inst)); const r=handle(p.category,inst); if(r) parts.push(r.text); else np=true; }
      if(np) pq.push(p);
    }
    let fbUsed=false;
    if(pq.length){
      const jobs=pq.map(p=>npcJob(p.category)).join("；");
      try{ parts.push(await apiChat(`玩家刚说：「${text}」。涉及话题：${jobs}。`)); }
      catch(e){ parts.push(npcFallbackLine(text)); fbUsed=true; }
    }
    if (!parts.length){ parts.push(currentNPC==="seer"?"（他静默着，像一块黑石。）":"（对方看了你一眼，没说话。）"); fbUsed=true; }
    if (fbUsed){   /* 接不住时给一个叙事化的出口，不把系统限制甩到玩家脸上 */
      const hints=(NPCS[currentNPC]&&NPCS[currentNPC].samples||[]).slice(0,3);
      const who=(NPCS[currentNPC]&&NPCS[currentNPC].name)||"对方";
      if (hints.length) parts.push(`（${who}没有接这句话，只把话头递回来：${hints.join("、")}。）`);
    }
    const reply=parts.join("\n");
    addMsg("witch",reply,chips,false,recallMention(reply),fbUsed);
    history[currentNPC].push({role:"assistant",content:reply,fb:fbUsed});   /* fb=true：兑底台词，回传模型前过滤（不污染上下文） */
  }catch(e){
    addMsg("witch",(currentNPC==="seer"?"（杖声顿了顿）黑暗里一阵骚动。":"（炉火猛地晃了一下）……刚才那阵风不对劲。")+"再说一次？",
      [],false,null,true);
    history[currentNPC].push({role:"assistant",content:"（刚才那阵风不对劲。再说一次？）",fb:true});
  }
  thinkRow.remove();
  busy=false; document.getElementById("sendBtn").disabled=false;
  document.getElementById("inp").focus();
  renderHUD(); save();
}

// --- runDemo (migrated from main script) ---
async function runDemo(){
  const ov=document.getElementById("demoOverlay");
  ov.classList.add("open");
  const body=document.getElementById("demoBody"); body.innerHTML="";
  const hadSave = !!localStorage.getItem(SAVE_KEY);
  /* 剧本开场：说明这次演示什么 */
  demoAdd("npc","— 四段演示：她会记住你做过的事、看得出你此刻的状态、对你的好感分档说话、还会主动关心你 —","✦ 这是「不装傻」的 NPC：意图解析 + 记忆 + 人格");
  await demoWait(700);
  const q=getQuest("witch_grass");
  /* 第一段：记忆（若玩家做过玛草任务，用真实记忆；否则用演示记忆） */
  const memSrc = hadSave && demoMems().length ? demoMems()[0].text : "你替她采过三株玛草，还把野猪撂倒在草丛里";
  demoAdd("user","我……之前是不是帮你采过什么？","👤 玩家问一件旧事");
  await demoWait(600);
  demoAdd("w","（她搅药的手顿了顿）"+memSrc+"。这种事，我记性好得很——比凡人强，也比凡人久。","🧠 记忆系统：记得你做过的事");
  await demoWait(700);
  /* 第二段：状态感知 */
  demoAdd("user","我现在有点饿。","👤 玩家说出状态");
  await demoWait(600);
  demoAdd("w","你脸色不对——胃里空空的。灶边有吃的，去取。饿着肚子上路，不算旅人。","👁 状态感知：看得见你的饥饿/伤势/金币");
  await demoWait(700);
  /* 第三段：好感分档 */
  const tier=affinityTier();
  demoAdd("user","你觉得我算熟客吗？","👤 试探关系");
  await demoWait(600);
  demoAdd("w","（她头也不抬，声音却比初见软了几分）"+ (tier==="冷淡"?"才见过几面，就论熟不熟？":"门都没闩，你推门就进——"+tier+"了。"+ (state.affinity>=60?"锅里是新的。":"灶上留着你的位置。")) +"","❤ 好感分档："+tier+"（"+Math.round(state.affinity)+"/100）语气随关系变");
  await demoWait(700);
  /* 第四段：主动性（有风袋/任务时她会主动开口） */
  demoAdd("user","对了，我今天……","👤 话没说完");
  await demoWait(600);
  demoAdd("w","（她先开了口）"+(q&&!q.done?`草还差 ${q.need-(q.have||0)} 株——别在林子里晃到天黑。`:(state.backpack["风袋"]?"风袋收好——一次放一阵，贪念会把它们一次放光。":"炉火正旺。想留下就留下，想走，门没闩。"))+"   ← 主动开口：不等你问，先接话（零模型规则）");
  await demoWait(500);
  demoAdd("✦","以上就是这四层「聪明」：\n①记忆 ②状态感知 ③关系分档 ④主动性\n每一层都能在真实游玩里复现，且完全可验证。","🏁 演示结束");
}

