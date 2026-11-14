// ============================================================
// 奥德赛 · 离线意图引擎（批次 K1）
// ============================================================
//  【为什么要有它】
//  真实协议入口的 key 一旦失效（HTTP 401），apiParse() 就会抛错，
//  玩家说的每一句话都会落到旧的 localFallbackParse()——那是一张
//  「有序正则 if-else 链」：第一个匹配即返回、换个说法就落空、
//  参数基本抽不出来（"我要三个面包" → 数量直接丢失）。
//  离线的 H5 静态包没有 key，**永远**走这条路——所以这张表的水平
//  就是玩家实际体验到的对话理解水平。
//
//  【它是什么】
//  打分制意图匹配 + 独立槽位抽取：
//    · 每个意图一组带权重的模式，累加得分，**不短路**——
//      "治疗草药多少钱" 能同时命中「查询价格」和「购买物品」，
//      由权重决定谁赢，而不是谁写在前面谁赢；
//    · 槽位（物品/数量/任务名/目的地/要素/目标）由专门抽取器取，
//      并且**同一语义写多个别名键**（物品 / 物品名称 …），
//      免得各 NPC handler 读不同键名时抽空；
//    · 低于阈值不硬猜——宁可落到「其他意图」让 NPC 给一句贴切的
//      拒绝/引导话，也不要装作听懂了却结算错。
//
//  纯函数：无 DOM、无网络、无状态 → 可以在 node 里直接断言
//  （tests/local-intent.test.cjs，含 120+ 条真实口语用例）。
// ============================================================

// ------------------------------------------------------------
// 1. 文本归一化
// ------------------------------------------------------------

/** 全角转半角 + 去空白（中文不需要空格分隔；"3 瓶" 归一为 "3瓶"） */
function normalizeUtter(text){
  let t = String(text == null ? "" : text);
  t = t.replace(/[\uFF01-\uFF5E]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
  t = t.replace(/\u3000/g, " ");
  t = t.replace(/\s+/g, "");
  return t.trim();
}

/** 归一化但保留标点——多意图切分要靠标点与连接词 */
function normalizeWithPunct(text){
  let t = String(text == null ? "" : text);
  t = t.replace(/[\uFF01-\uFF5E]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
  t = t.replace(/\u3000/g, " ");
  t = t.replace(/\s+/g, "");
  return t.trim();
}

// ------------------------------------------------------------
// 2. 中文数字
// ------------------------------------------------------------

const CN_DIGITS = {零:0, 〇:0, 一:1, 二:2, 两:2, 俩:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9};
const CN_UNITS = {十:10, 百:100, 千:1000};

/** "三"→3 · "十"→10 · "二十"→20 · "两"→2 · "12"→12 · 解析不出来返回 null */
function parseCnNumber(str){
  if (str === undefined || str === null) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let section = 0, num = 0, seen = false;
  for (const ch of s){
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)){ num = CN_DIGITS[ch]; seen = true; }
    else if (Object.prototype.hasOwnProperty.call(CN_UNITS, ch)){
      const unit = CN_UNITS[ch];
      if (num === 0) num = 1;          /* 「十」=10 · 「二十」=20 */
      section += num * unit; num = 0; seen = true;
    } else return null;
  }
  const total = section + num;
  return seen ? total : null;
}

/** 数量量词后缀——出现在数字后面才算数量 */
const COUNT_UNITS = ["个","瓶","份","捆","壶","条","块","把","张","颗","杯","碗","棵","只","枚","根","片","卷","袋","箱","口","头","匹","束","罐","升"];

/** 从文本里抽数量（中文/阿拉伯数字 + 量词），抽不出返回 null */
function extractCount(text){
  const t = String(text || "");
  const re = new RegExp("(\\d+|[零〇一二两俩三四五六七八九十百]+)\\s*(" + COUNT_UNITS.join("|") + ")");
  const m = t.match(re);
  if (m){
    const n = parseCnNumber(m[1]);
    if (n !== null && n > 0) return n;
  }
  /* 「要三个」已经由上条命中；这里兜底裸中文数字：「给我三瓶」以外的
     「再来两份」等写法 */
  const m2 = t.match(/([零〇一二两俩三四五六七八九十百]+)(?=[\u4e00-\u9fa5])/);
  if (m2){
    const n = parseCnNumber(m2[1]);
    if (n !== null && n > 0 && n <= 99) return n;
  }
  return null;
}

// ------------------------------------------------------------
// 3. 物品词典（别名 → 规范名）
// ------------------------------------------------------------
//  规范名对齐游戏里真实存在的物品：SHOP / PROTECTED_ITEMS /
//  addItem() 实参 / WEAPONS。**长词优先**——「烤野猪肉」不能被
//  「野猪肉」抢走，「莲子干」不能被「莲子」抢走。

const ITEM_DICT = [
  ["烤野猪肉", ["烤野猪肉","野猪肉","烤猪肉","猪肉"]],
  ["莲子干",   ["莲子干","干莲子"]],
  ["蜂蜜酒",   ["蜂蜜酒","蜜酒","蜂蜜","蜜"]],
  ["橄榄油",   ["橄榄油","橄榄"]],
  ["治疗草药", ["治疗草药","疗伤药","药草","草药","解药","药"]],
  ["玛草",     ["玛草","甜草"]],
  ["面包",     ["面包","干粮","口粮","饼"]],
  ["淡水",     ["淡水","饮用水","清水","水囊"]],
  ["铁剑",     ["铁剑","剑"]],
  ["铜矛",     ["铜矛","铜枪","矛","枪"]],
  ["金露",     ["金露","金露水"]],
  ["风袋",     ["风袋","风之袋","装风的袋子"]],
  ["歌词残页", ["歌词残页","残页"]],
  ["喀科恩酒", ["喀科恩酒","紫色蜜酒"]],
  ["羊毛披风", ["羊毛披风","披风"]],
  ["幸存者的绳结", ["幸存者的绳结","绳结"]],
  ["走得过黑暗的光", ["走得过黑暗的光","黑暗的光"]],
  ["金苹果",   ["金苹果","苹果"]],
  ["断桨",     ["断桨","桨"]],
  ["魔草",     ["魔草","魔草汁"]],
  ["海藻",     ["海藻","藻"]],
  ["烤鱼",     ["烤鱼","鱼"]],
  ["牛肉",     ["牛肉","圣牛肉","牛排"]],
  ["莲子",     ["莲子"]],
  ["木料",     ["木料","木头","木材"]],
  ["皮甲",     ["皮甲","护甲"]],
  ["弓",       ["弓"]],
  ["箭",       ["箭"]],
  ["盐",       ["盐"]],
];

/** 别名 → 规范名 */
const ITEM_ALIAS_MAP = (function(){
  const m = Object.create(null);
  for (const [canon, aliases] of ITEM_DICT){
    m[canon] = canon;
    for (const a of aliases) m[a] = canon;
  }
  return m;
})();

/** 物品词典按别名长度降序（长词优先） */
const ITEM_ALIAS_SORTED = Object.keys(ITEM_ALIAS_MAP).sort(function(a,b){ return b.length - a.length; });

/** 抽物品：返回规范名或 null */
function extractItem(text){
  const t = String(text || "");
  for (const alias of ITEM_ALIAS_SORTED){
    if (t.indexOf(alias) !== -1) return ITEM_ALIAS_MAP[alias];
  }
  /* 词典没有的：抓「X个/X瓶」里的 X 作为物品名（玩家自造说法兜底） */
  const m = t.match(/([\u4e00-\u9fa5A-Za-z]{1,6}?)(?:个|瓶|份|捆|壶|条|块|把|颗|张|棵|只|枚|根|片)/);
  if (m && m[1] && m[1].length >= 2 && !/^(我|你|他|她|它|这|那|要|给|来|去|再|一|两|几|什么|怎么|哪|谁|多少)/.test(m[1])){
    return m[1];
  }
  return null;
}

// ------------------------------------------------------------
// 4. 意图模式表（带权重 · 累加不短路）
// ------------------------------------------------------------
//  权重约定：w≥5 = 几乎唯一的强特征；w=4 = 强；w=3 = 中；w=2 = 弱（需与其他信号叠加）
//  设计原则：宁可少命中一个意图，也别把话归到错的意图上——
//  错归比不归更伤（玩家看到「买药成功」但其实说的是别的）。

const INTENT_PATTERNS = {
  /* —— 交易 —— */
  "购买物品": [
    {re:/买|购|购入|置办|换购/, w:3},
    {re:/我要|我想|给我来|来[一二两三四五六七八九十\d]*[瓶份个捆壶条块颗张杯碗棵只]/, w:3},
    {re:/有(没有|啥)?(药|草|面包|水|酒|油)/, w:1},
  ],
  "卖出物品": [
    {re:/卖(掉|了|给|出|出去)?|卖掉|换.{0,2}钱|折价|典当/, w:4},
    {re:/拿去换|换点/, w:3},
  ],
  "查询价格": [
    {re:/多少钱|什么价|贵不贵|价几何|几个钱|什么价位|报价/, w:5},
    {re:/价格|开价|怎么卖|值多少/, w:4},
  ],
  "查询库存": [
    {re:/有货|都有什么|有什么卖|货有|库存|还有吗|卖些什么|卖什么|都卖/, w:5},
  ],
  "查询背包": [
    {re:/背包|身上有什么|我有什么|包里|口袋里|还剩多少|还有几|还有多少/, w:4},
  ],
  "丢弃物品": [
    {re:/扔|丢掉|丢弃|不要了|丢了|扔掉|扔了/, w:4},
  ],
  "给予物品": [
    {re:/给你|交给你|递给你|拿着|收下|这个(给你|归你)/, w:4},
    {re:/给[你我他她它](?!来)/, w:4},
    {re:/(献|倒|放)(进|入|到).{0,6}(沟|坛|缸|碗|箱|里)|摆在|摆上/, w:4},
    {re:/送(你|给)/, w:3},
  ],
  "装备物品": [
    {re:/装备|穿上|换上|戴上|持(剑|矛)|拿(剑|矛)上/, w:4},
  ],
  "卸下装备": [
    {re:/脱下|卸下|取下|收起(来)?装备|放回/, w:4},
  ],
  "使用消耗品": [
    {re:/喝|吃药|服下|用(药|草)|敷|抹|点燃|吃了|喝掉|用掉/, w:4},
    {re:/用烤|用.{1,3}肉|用.{1,3}鱼|用药|用草/, w:4},
    {re:/放(风|出风)|放出来|放出风|把风袋(放|拿)出来|用风袋/, w:5},
  ],
  "获取物资": [
    {re:/钓|取水|采|砍|捡|摘|挖|打猎|割|捞|摸|剪/, w:3},
    {re:/(去找|弄点|来点)(点|些|一些)?(吃的|喝的|柴|水|东西)/, w:3},
  ],

  /* —— 任务线 —— */
  "接取任务": [
    {re:/接(个|下|一份|个)?(委托|任务|活儿?|差事|事儿)/, w:4},
    {re:/接(下|了|着)?.{0,3}(活儿?|委托|任务|差事)/, w:4},
    {re:/(这|那)?(活儿?|委托|差事)(我|给我)?(干|接|算我|归我)/, w:4},
    {re:/我接(下|了|着)?|我要接|我包(了)?|我干(这活|这个)|我应下|我来做/, w:4},
    {re:/交给我|我来吧|算我一个|让我来/, w:5},
    {re:/我选(长路|捷径)|选(长路|捷径)/, w:5},
  ],
  "提交任务": [
    {re:/交(任务|差事|委托|活儿?|差)/, w:5},
    {re:/(做|干)(完|好了|完了)|搞定了|办妥了/, w:4},
    {re:/交.{0,4}给(我|她|他|它)/, w:5},
    {re:/采到.{0,4}了|拿到.{0,4}了|收齐了/, w:5},
  ],
  "查询任务进度": [
    {re:/进度|还差(几|多少|啥)/, w:5},
    {re:/(做得|干得|做的|干的)(怎么样|如何|咋样)|怎么样了/, w:4},
    {re:/能交了吗|交了没|好了吗|做完没/, w:5},
  ],
  "查询任务线索": [
    {re:/什么(活儿?|委托|任务|差事)|有(什么|啥)(活儿?|委托|任务|线索)|啥活|有活儿?/, w:4},
    {re:/线索|提示|该(干|做)什么|下一步/, w:4},
    {re:/接下来.{0,3}(干|做|去)|接下来怎么办/, w:4},
  ],
  "放弃任务": [
    {re:/放弃|不干了|推掉|算了不|撤销|领了算/, w:5},
  ],

  /* —— 查询类 —— */
  "查询自身状态": [
    {re:/状态|伤势|伤得|血(量|条)?|渴|饿|饥|士气|精神|还剩多少血/, w:4},
    {re:/我(现在)?(怎么样|如何|啥情况)/, w:3},
  ],
  "查询环境状况": [
    {re:/天气|风向|风(向|力|大|怎么样)|浪|海况|雾|危险吗|能见度|安全吗/, w:4},
    {re:/现在(什么|啥)?(风|浪|天气)|外面(怎么样|如何)/, w:4},
  ],
  "查询附近目标": [
    {re:/附近|周围|周边|哪里有|哪有|这一带/, w:4},
    {re:/(周围|附近)(有|有什|有什么)/, w:4},
  ],
  "查询生物情报": [
    {re:/是什么|什么来头|是啥|怎么回事|告诉我|关于|什么样|说说/, w:2},
    {re:/塞壬|斯库拉|卡律布狄斯|海怪|野猪|圣牛|赫利俄斯|太阳岛|卡吕普索|瑙西亚娅|求婚者|德摩多科斯|神女|波吕斐摩斯|独眼巨人|巨羊|食莲者|莱斯特律戈尼|喀耳刻|埃俄罗斯|特瑞西阿斯/, w:3},
  ],
  "查询地点信息": [
    /* 「这里都有些谁」——「些」夹在中间会顶掉字面匹配，模式要留容错位 */
    {re:/这(座|个)?岛|这里.{0,3}(有|是|谁|些|发生)|岛(上|里)(有|是)|怎么回事|讲讲/, w:4},
    {re:/你是谁|你的经历|说说(你|那晚)|那晚(是|怎)|你们?的规矩|这规矩|什么样子/, w:4},
    {re:/什么意思|啥意思|怎么造|怎么做|怎么建/, w:4},
  ],
  "查询神谕": [
    {re:/预言|神谕|预示|天意|命数/, w:5},
    {re:/该走哪条路|走哪条路|哪条路/, w:5},
  ],

  /* —— 交互 / 叙事 —— */
  "请求帮助": [
    {re:/怎么办|帮帮我|求助|该怎么(办|走|做)|求你/, w:4},
    {re:/给.{0,2}建议|给点主意/, w:5},
    {re:/我(该|能)怎么办|有什么建议/, w:4},
    {re:/回家|回乡|归乡|归途|回去|出路|怎么出岛|走不掉|想回去/, w:4},
    {re:/借.{0,6}(牛|马|匹|一头|一匹)|作保|担保|名字.{0,4}作保/, w:5},
  ],
  "导航到地点": [
    {re:/带我去|带我去|我要去|往哪|怎么去|怎么走|怎么过|去哪儿|前往/, w:4},
    {re:/(码头|栈桥|集市|海滩|洞窟|营火|篝火|神殿|神庙|港口)/, w:1},
  ],
  "威胁或攻击": [
    {re:/找死|拔剑|单挑|废物|抢的就是你|杀了你|干掉你|揍你/, w:5},
  ],
  "闲聊": [
    {re:/你好|您好|最近怎么样|最近如何|海真漂亮|你叫什么(名字)?|好久不见/, w:3},
    {re:/^(嗨|哈喽|嘿)/, w:3},
    {re:/你们?是谁|你们唱的是|你在找谁|围城.{0,4}是什么样子/, w:3},
    {re:/你们.{0,3}(恨|喜欢|相信)|忘了什么/, w:3},
    {re:/我是[^，。？！]{1,6}$|你会.{1,8}吗$/, w:3},
  ],
  "告别": [
    {re:/再见|告辞|回头见|我先走|先走了|我要走|我走了|拜拜|后会有期|改天见/, w:5},
  ],
  "船只操作": [
    {re:/开船|出海|启航|扬帆|靠岸|收帆|起航|解缆/, w:5},
  ],
  "营地准备": [
    {re:/生火|搭帐篷|搭.{0,1}帐篷|帐篷|扎营|做把桨|做饭|烤个火|过夜/, w:4},
  ],
};

/** 各意图的最低分（低于它就不认这个意图） */
const INTENT_MIN_SCORE = {
  "购买物品": 3, "卖出物品": 4, "查询价格": 4, "查询库存": 4, "查询背包": 4,
  "丢弃物品": 4, "给予物品": 4, "装备物品": 4, "卸下装备": 4,
  "使用消耗品": 4, "获取物资": 3,
  "接取任务": 4, "提交任务": 4, "查询任务进度": 4, "查询任务线索": 4, "放弃任务": 5,
  "查询自身状态": 4, "查询环境状况": 4, "查询附近目标": 4, "查询生物情报": 3,
  "查询地点信息": 4, "查询神谕": 5,
  "请求帮助": 4, "导航到地点": 4, "威胁或攻击": 5, "闲聊": 3, "告别": 5,
  "船只操作": 5, "营地准备": 4,
};

/** 全局阈值：拿不到这个分就宁可返回「其他意图」 */
const GLOBAL_MIN_SCORE = 3;

/** 游戏支持的全部意图（30 类）——用于自检与兜底 */
const ALL_INTENTS = Object.keys(INTENT_PATTERNS);

/** 不该被「主动返回」的意图（它们要么由专门分支处理，要么是兜底） */
const NEVER_RETURN = new Set(["其他意图"]);

// ------------------------------------------------------------
// 5. 槽位抽取
// ------------------------------------------------------------

/** 任务名枚举 */
const TASK_NAMES = ["长路","捷径"];

/** 抽取任务名（接取任务 / 请求帮助共用） */
function extractTaskName(text){
  const t = String(text || "");
  for (const n of TASK_NAMES) if (t.indexOf(n) !== -1) return n;
  if (/玛草|采药|采草|委托/.test(t)) return "玛草委托";
  if (/风|风袋|四阵/.test(t)) return "四阵风";
  if (/筏|木料/.test(t)) return "造筏";
  if (/故事|唱歌/.test(t)) return "讲故事";
  if (/献祭|沟/.test(t)) return "献祭";
  return null;
}

/** 抽取目的地（导航到地点） */
function extractDestination(text){
  const t = String(text || "");
  const m = t.match(/(?:去|往|到|前往|带我(?:去|到)|带我走)([^\s，,。.!！?？;；、的]{1,6})/);
  if (m && m[1]) return m[1];
  const named = ["码头","栈桥","集市","海滩","洞窟","营火","篝火","神庙","神殿","港口","码头区","岛北","岛南","岛上"];
  for (const n of named) if (t.indexOf(n) !== -1) return n;
  return null;
}

/** 抽取环境要素（查询环境状况） */
function extractFactor(text){
  const t = String(text || "");
  if (/风/.test(t)) return "风向";
  if (/浪/.test(t)) return "浪";
  if (/雾/.test(t)) return "雾";
  if (/天|天气|阴|晴/.test(t)) return "天气";
  if (/危险|凶险/.test(t)) return "危险";
  return null;
}

/** 抽取生物/实体名（查询生物情报） */
const ENTITY_NAMES = ["塞壬","斯库拉","海怪","野猪","圣牛","赫利俄斯","卡吕普索","瑙西亚娅",
  "求婚者","德摩多科斯","神女","波吕斐摩斯","独眼巨人","巨羊","食莲者","莱斯特律戈尼",
  "喀耳刻","埃俄罗斯","特瑞西阿斯","太阳岛","木马"];
function extractEntity(text){
  const t = String(text || "");
  for (const n of ENTITY_NAMES) if (t.indexOf(n) !== -1) return n;
  return null;
}

/** 抽取求助内容（请求帮助） */
function extractHelpContent(text){
  const t = String(text || "");
  const m = t.match(/(?:怎么|如何|该)(.{2,12})/);
  if (m && m[1]) return m[1];
  return null;
}

/** 状态项枚举（查询自身状态） */
const STATUS_ITEMS = ["饥饿","口渴","体力","伤势","士气","疲劳","中毒","潮湿"];
/** 玩家的口语 → 规范状态项 */
const STATUS_ALIAS = {饿:"饥饿",渴:"口渴",伤:"伤势",累:"疲劳",精神:"士气",饿死了:"饥饿",快饿:"饥饿",快渴:"口渴"};
function extractStatusItem(text){
  const t = String(text || "");
  for (const s of STATUS_ITEMS) if (t.indexOf(s) !== -1) return s;
  for (const [k, v] of Object.entries(STATUS_ALIAS)) if (t.indexOf(k) !== -1) return v;
  return null;
}

/** 营地准备的动作枚举 */
const CAMP_ACTIONS = ["生火","扎营","搭帐篷","搭桥","制作工具","修补装备","升信号火"];
function extractCampAction(text){
  const t = String(text || "");
  for (const a of CAMP_ACTIONS) if (t.indexOf(a) !== -1) return a;
  if (/帐篷/.test(t)) return "搭帐篷";
  if (/信号火|烽火/.test(t)) return "升信号火";
  if (/修补|补装备/.test(t)) return "修补装备";
  if (/做.{0,2}(工具|桨|弓)/.test(t)) return "制作工具";
  if (/桥/.test(t)) return "搭桥";
  return null;
}

/** 每个意图要抽哪些槽位 */
const SLOT_SPEC = {
  "购买物品":     ["item","count"],
  "卖出物品":     ["item","count"],
  "查询价格":     ["item"],
  "查询库存":     ["item"],
  "丢弃物品":     ["item","count"],
  "给予物品":     ["item","count"],
  "装备物品":     ["item"],
  "卸下装备":     ["item"],
  "使用消耗品":   ["item"],
  "获取物资":     ["item","count"],
  "接取任务":     ["task"],
  "提交任务":     ["task"],
  "查询任务进度": ["task"],
  "查询任务线索": ["task"],
  "放弃任务":     ["task"],
  "请求帮助":     ["help"],
  "导航到地点":   ["dest"],
  "查询环境状况": ["factor"],
  "查询生物情报": ["target"],
  "查询自身状态": ["status"],
  "营地准备":     ["campAction"],
  "船只操作":     ["action"],
};

/**
 * 语义槽位 → handler 实际读取的 args 键。
 * 关键点：同一个语义要**写多个别名键**——各 NPC handler 读的键名并不统一
 * （多数读 g("物品")，重建者读 g("物品名称")），写多份最省事也最不会抽空。
 */
const SLOT_KEYS = {
  item:    ["物品","物品名称"],
  count:   ["数量"],
  task:    ["任务名称","求助内容"],
  dest:    ["目的地"],
  factor:  ["要素"],
  target:  ["目标","生物","名称"],
  help:    ["求助内容"],
  action:  ["动作"],
  status:  ["状态项"],
  campAction: ["动作"],
};

/** 船只操作的动作枚举 */
const SHIP_ACTIONS = ["靠岸","出航"];

/** 语义槽位 → 抽取器。
    物品/数量**优先整句**：「蜂蜜酒、面包、淡水倒进献祭之沟」被切句后，
    物品在句首而动作在句尾，只看子句会抽到后半句的「淡水」。
    其余槽位（任务名/目的地/要素/实体/状态）语义属于本句，先子句再整句。 */
const SLOT_EXTRACTORS = {
  item:   function(clause, full){ return extractItem(full) || extractItem(clause); },
  count:  function(clause, full){ return extractCount(full) || extractCount(clause); },
  task:   function(clause, full){ return extractTaskName(clause) || extractTaskName(full); },
  dest:   function(clause, full){ return extractDestination(clause) || extractDestination(full); },
  factor: function(clause, full){ return extractFactor(clause) || extractFactor(full); },
  target: function(clause, full){ return extractEntity(clause) || extractEntity(full); },
  help:   function(clause, full){ return extractHelpContent(clause) || extractHelpContent(full); },
  action: function(clause, full){ return (/靠岸|登陆|上岸/.test(clause || full)) ? "靠岸" : "出航"; },
  status: function(clause, full){ return extractStatusItem(clause) || extractStatusItem(full); },
  campAction: function(clause, full){ return extractCampAction(clause) || extractCampAction(full); },
};

/** 把语义槽位组装成 args 对象（多别名键同写）。
     槽位先从**子句**抽，抽不到再回落到**整句**——
    「拿着，这是面包」里物品在逗号后的半句，只看子句会把参数抽空。 */
function buildArgs(category, clause, fullText){
  const spec = SLOT_SPEC[category] || [];
  const args = {};
  for (const slot of spec){
    const fn = SLOT_EXTRACTORS[slot];
    if (!fn) continue;
    const value = fn(clause, fullText);
    if (value === null || value === undefined || value === "") continue;
    for (const key of (SLOT_KEYS[slot] || [])) args[key] = value;
  }
  return args;
}

// ------------------------------------------------------------
// 6. 打分与选择
// ------------------------------------------------------------

/** 给一个子句打分：{category: score} */
function scoreClause(clause){
  const scores = {};
  for (const cat of ALL_INTENTS){
    let s = 0;
    const pats = INTENT_PATTERNS[cat];
    for (const p of pats){ if (p.re.test(clause)) s += p.w; }
    if (s > 0) scores[cat] = s;
  }
  return scores;
}

/** 子句切分——多意图（"买药，另外告诉我风向"）靠它。
    注意：「还有」**不能**当连接词——「我身上还有多少药」会被切成两半，
    两半都够不上阈值，整句就掉进「其他意图」了。 */
const CLAUSE_SPLIT = /[，,。.!！?？;；、]|(?:另外|顺便|然后|以及|再问|再买|再给|外加)/;

function splitClauses(text){
  return String(text || "").split(CLAUSE_SPLIT).map(function(s){ return s.trim(); }).filter(Boolean);
}

/**
 * 主入口：把一句玩家的话解析成意图列表。
 * @param {string} text 玩家原话
 * @returns {Array<{category:string,args:object}>}
 */
function localIntentParse(text){
  const norm = normalizeWithPunct(text);
  if (!norm) return [];

  const clauses = splitClauses(norm);
  const picked = [];

  for (const clause of clauses){
    if (!clause) continue;
    const scores = scoreClause(clause);
    /* 取该子句的最高分意图（并列时按 ALL_INTENTS 顺序稳定选择） */
    let bestCat = null, bestScore = 0;
    for (const cat of ALL_INTENTS){
      const s = scores[cat] || 0;
      if (s > bestScore){ bestScore = s; bestCat = cat; }
    }
    if (!bestCat || bestScore < GLOBAL_MIN_SCORE) continue;
    const need = INTENT_MIN_SCORE[bestCat] != null ? INTENT_MIN_SCORE[bestCat] : GLOBAL_MIN_SCORE;
    if (bestScore < need) continue;
    if (NEVER_RETURN.has(bestCat)) continue;
    /* 同一意图只保留一次（多子句说同一件事） */
    if (picked.some(function(p){ return p.category === bestCat; })) continue;
    /* args 必须是**数组**——send() 走 Array.isArray(p.args) 分支，
       返回对象会让参数被整个丢掉（handle 收到 {}）。 */
    picked.push({ category: bestCat, args: [buildArgs(bestCat, clause, norm)], score: bestScore });
  }

  if (!picked.length){
    /* 一个都没接住 → 交「其他意图」，让 NPC 给一句贴切的拒绝/引导，
       而不是硬猜一个意图去结算错。 */
    return [{ category: "其他意图", args: [{}] }];
  }

  /* 多个意图时按分排序，第一条最可信 */
  if (picked.length > 1){
    picked.sort(function(a,b){ return (b.score || 0) - (a.score || 0); });
  }
  return picked.map(function(p){ return { category: p.category, args: p.args }; });
}

/* 调试/测试出口 */
if (typeof window !== "undefined"){
  window.LOCAL_INTENT = {
    parse: localIntentParse,
    normalize: normalizeUtter,
    normalizeWithPunct: normalizeWithPunct,
    score: scoreClause,
    split: splitClauses,
    parseCnNumber: parseCnNumber,
    extractItem: extractItem,
    extractCount: extractCount,
    extractTaskName: extractTaskName,
    extractDestination: extractDestination,
    intents: ALL_INTENTS,
  };
}
if (typeof module !== "undefined" && module.exports){ module.exports = { localIntentParse: localIntentParse }; }
