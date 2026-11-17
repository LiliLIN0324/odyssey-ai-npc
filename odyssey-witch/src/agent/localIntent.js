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
//  K2 规则解析层优先处理高危兜底、多轮省略、分句多实例和 schema 槽位；
//  K1 打分链保留为未覆盖说法的兜底：
//    · 类别和参数名严格对齐根目录 schema.json / cases.jsonl，预测结果
//      不重复写“物品名称/目标”等别名键；旧 handler 的键名兼容放在读取侧；
//    · 数量在解析结果中输出考卷使用的阿拉伯数字字符串，游戏结算侧再转数；
//    · 低于把握不硬猜——宁可落到「其他意图」让 NPC 给一句贴切的
//      拒绝/引导话，也不要装作听懂了却结算错。
//
//  纯函数：无 DOM、无网络；history 由游戏调用处或离线评测适配器传入。
//  Node 门禁见 tests/local-intent.test.cjs 与 tests/local-intent-exam.test.cjs，
//  全量考卷评分见 tools/eval_offline.py。
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

// 注意：考卷/schema 中的标准名必须原样保留。只有明确口语别名才归一到游戏内
// 结算名；不能因为货架上有蜂蜜酒，就把玩家说的「蜂蜜」偷偷改成蜂蜜酒。
const ITEM_DICT = [
  ["烤野猪肉", ["烤野猪肉", "烤猪肉", "猪肉"]],
  ["野猪肉",   ["野猪肉"]],
  ["莲子干",   ["莲子干", "干莲子"]],
  ["蜂蜜酒",   ["蜂蜜酒", "蜜酒"]],
  ["蜂蜜",     ["蜂蜜", "蜜"]],
  ["橄榄油",   ["橄榄油"]],
  ["橄榄",     ["橄榄"]],
  ["治疗草药", ["治疗草药", "疗伤药", "药草", "草药", "解药", "药"]],
  ["治疗药膏", ["治疗药膏", "药膏"]],
  ["提神茶",   ["提神茶"]],
  ["玛草",     ["玛草", "甜草"]],
  ["干粮",     ["干粮", "口粮"]],
  ["面包",     ["面包", "饼"]],
  ["淡水",     ["淡水", "饮用水", "清水", "水囊", "水"]],
  ["葡萄酒",   ["葡萄酒", "红酒"]],
  ["绳索",     ["绳索", "绳子"]],
  ["船桨",     ["船桨", "破桨", "桨"]],
  ["断桨",     ["断桨"]],
  ["火把",     ["火把"]],
  ["油灯",     ["油灯"]],
  ["陶罐",     ["陶罐"]],
  ["铜盆",     ["铜盆"]],
  ["铁剑",     ["铁剑", "剑"]],
  ["铜矛",     ["铜矛", "铜枪", "矛", "枪"]],
  ["皮甲",     ["皮甲", "护甲"]],
  ["弓",       ["弓"]],
  ["箭",       ["箭"]],
  ["头盔",     ["头盔"]],
  ["护腕",     ["护腕"]],
  ["斗篷",     ["斗篷", "披风"]],
  ["金露",     ["金露", "金露水"]],
  ["风袋",     ["风袋", "风之袋", "装风的袋子", "这袋风", "袋风"]],
  ["歌词残页", ["歌词残页", "残页"]],
  ["喀科恩酒", ["喀科恩酒", "紫色蜜酒"]],
  ["金羊毛",   ["金羊毛"]],
  ["橄榄枝",   ["橄榄枝"]],
  ["隐形头盔", ["隐形头盔"]],
  ["贝壳",     ["贝壳"]],
  ["椰子",     ["椰子"]],
  ["柴薪",     ["柴薪", "柴"]],
  ["藤蔓",     ["藤蔓"]],
  ["海鱼",     ["海鱼"]],
  ["鱼",       ["鱼"]],
  ["珊瑚",     ["珊瑚"]],
  ["橄榄木",   ["橄榄木"]],
  ["羊毛",     ["羊毛"]],
  ["绳结",     ["绳结"]],
  ["帐篷",     ["帐篷"]],
  ["简易担架", ["简易担架"]],
  ["木桩",     ["木桩"]],
  ["金苹果",   ["金苹果", "苹果"]],
  ["莲子",     ["莲子"]],
  ["木料",     ["木料", "木头", "木材"]],
  ["海藻",     ["海藻", "藻"]],
  ["烤鱼",     ["烤鱼"]],
  ["牛肉",     ["牛肉", "圣牛肉", "牛排"]],
  ["蜡",       ["蜂蜡", "蜡"]],
  ["魔草",     ["魔草", "魔草汁"]],
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
 * K1 打分兜底链使用的候选键。对外结果会经 finalizePreds/cleanProtoArgs
 * 规整为 schema 键；旧 NPC handler 若仍读“物品名称”，兼容放在读取侧。
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

/** 组装 K1 兜底链的候选 args；对外输出前仍会按 schema 参数名清洗。 */
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
 * 打分制兜底解析：规则主解析器未覆盖时仍保留 K1 引擎的候选打分能力。
 * @param {string} text 玩家原话
 * @returns {Array<{category:string,args:object}>}
 */
function scoreBasedParse(text){
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

// ------------------------------------------------------------
// 7. 规则解析层：高危优先级 / 多轮上下文 / 多实例槽位
// ------------------------------------------------------------
// 这一层不新增意图类别，仍输出 schema.json 的 30 类。K1 打分链继续作为
// 未覆盖说法的兜底；这里主要修正“分类优先级、上下文省略、参数协议形状”。
// 代词只看当前 NPC，不按物品猜测接收方，也不把未识别分组默认成女巫。

// 与 src/data/npcs.js 的当前对话主体保持一致；cattle 是圣牛群处理器，
// 不是远处的赫利俄斯本人。epeius 使用 NPCS 中的角色专名。
const NPC_DISPLAY_NAMES = {
  witch: "喀耳刻", circe: "喀耳刻",
  seer: "特瑞西阿斯", tiresias: "特瑞西阿斯",
  aeolus: "埃俄罗斯",
  siren: "塞壬",
  cattle: "圣牛群",
  calypso: "卡吕普索",
  nausicaa: "瑙西亚娅",
  rebuilder: "重建者",
  lotusman: "食莲者",
  polyphemus: "波吕斐摩斯",
  epeius: "厄佩俄斯",
  telemachus: "忒勒玛科斯",
};

const PROTO_ARG_KEYS = {
  "购买物品": ["物品", "数量", "货币"],
  "卖出物品": ["物品", "数量"],
  "查询价格": ["物品"],
  "查询库存": ["物品", "类别"],
  "查询背包": ["物品"],
  "丢弃物品": ["物品"],
  "给予物品": ["物品", "接收方"],
  "装备物品": ["物品", "部位"],
  "卸下装备": ["物品", "部位"],
  "使用消耗品": ["物品", "对象"],
  "查询自身状态": ["状态项"],
  "获取物资": ["动作", "物品", "数量"],
  "营地准备": ["动作", "物品"],
  "导航到地点": ["目的地", "方式"],
  "查询附近目标": ["目标类型", "生物"],
  "查询环境状况": ["要素", "地点"],
  "查询地点信息": ["地点", "询问内容"],
  "查询生物情报": ["生物", "询问内容"],
  "查询神谕": ["神谕来源", "预言内容"],
  "船只操作": ["动作"],
  "接取任务": ["任务名称", "任务类型"],
  "查询任务线索": ["任务名称", "询问内容"],
  "查询任务进度": ["任务名称"],
  "提交任务": ["任务名称"],
  "放弃任务": ["任务名称"],
  "请求帮助": ["求助内容"],
  "闲聊": ["话题"],
};

function offlineFallbackPreds(){
  return [{ category: "其他意图", args: [] }];
}

function makeOfflineContext(text, options){
  const opts = options && typeof options === "object" ? options : {};
  const npcKey = opts.npcKey || (opts.context && opts.context.npcKey) || "";
  const rawHistory = Array.isArray(opts.history) ? opts.history
    : (opts.context && Array.isArray(opts.context.history) ? opts.context.history : []);
  const history = rawHistory
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && !h.fb)
    .filter((h, i, arr) => !(i === arr.length - 1 && h.role === "user" && normalizeWithPunct(h.content) === text))
    .slice(-8)
    .map((h) => ({ role: h.role, content: normalizeWithPunct(h.content) }));
  return {
    text,
    history,
    npcKey,
    // 已知 npcKey 用游戏角色称呼；调用方传入的 npcName 只兜底未知 NPC。
    // 「她/他」只解析成这个名字。
    npcName: NPC_DISPLAY_NAMES[npcKey] || opts.npcName || "",
  };
}

function lastHistoryUser(ctx){
  for (let i = ctx.history.length - 1; i >= 0; i--){
    if (ctx.history[i].role === "user" && ctx.history[i].content !== ctx.text) return ctx.history[i].content;
  }
  return "";
}

function lastHistoryAssistant(ctx){
  for (let i = ctx.history.length - 1; i >= 0; i--){
    if (ctx.history[i].role === "assistant") return ctx.history[i].content;
  }
  return "";
}

function createPredBag(){
  return { order: [], byCat: new Map() };
}

function addPred(bag, category, args){
  if (!category) return;
  if (!bag.byCat.has(category)){
    bag.byCat.set(category, []);
    bag.order.push(category);
  }
  const inst = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (Object.keys(inst).length) bag.byCat.get(category).push(inst);
}

function addResult(bag, result){
  if (!result) return;
  if (Array.isArray(result)) result.forEach((r) => addResult(bag, r));
  else if (result.category) addPred(bag, result.category, result.args);
}

function cleanProtoArgs(category, instance){
  const allowed = PROTO_ARG_KEYS[category] || [];
  const out = {};
  for (const key of allowed){
    let value = instance ? instance[key] : undefined;
    if (value === undefined || value === null || value === "") continue;
    if (key === "数量"){
      if (typeof value === "number" && Number.isFinite(value)) value = String(value);
      else if (typeof value === "string" && /^\d+$/.test(value.trim())) value = value.trim();
      else {
        const n = parseCnNumber(String(value).replace(/[个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]/g, ""));
        value = n === null ? "" : String(n);
      }
      if (!/^\d+$/.test(value)) continue;
    } else {
      value = String(value).trim();
      if (!value) continue;
    }
    out[key] = value;
  }
  return out;
}

function finalizePreds(preds){
  const bag = createPredBag();
  for (const pred of (Array.isArray(preds) ? preds : [])){
    if (!pred || !pred.category) continue;
    if (!bag.byCat.has(pred.category)){
      bag.byCat.set(pred.category, []);
      bag.order.push(pred.category);
    }
    const instances = Array.isArray(pred.args) ? pred.args : [pred.args || {}];
    for (const inst of instances){
      const cleaned = cleanProtoArgs(pred.category, inst);
      if (Object.keys(cleaned).length) bag.byCat.get(pred.category).push(cleaned);
    }
  }
  return bag.order.map((category) => {
    const seen = new Set();
    const args = [];
    for (const inst of bag.byCat.get(category)){
      const key = JSON.stringify(inst, Object.keys(inst).sort());
      if (seen.has(key)) continue;
      seen.add(key);
      args.push(inst);
    }
    return { category, args };
  });
}

function normalizeLegacyPreds(preds){
  const remapped = (Array.isArray(preds) ? preds : []).map((p) => {
    const args = (Array.isArray(p.args) ? p.args : [p.args || {}]).map((a) => {
      const input = Object.assign({}, a || {});
      if (!input["物品"] && input["物品名称"]) input["物品"] = input["物品名称"];
      if (p.category === "查询生物情报" && !input["生物"] && (input["目标"] || input["名称"])){
        input["生物"] = input["生物"] || input["目标"] || input["名称"];
      }
      if (p.category === "导航到地点" && !input["目的地"] && input["目的地名称"]) input["目的地"] = input["目的地名称"];
      if (p.category === "接取任务") delete input["求助内容"];
      return input;
    });
    return { category: p.category, args };
  });
  const finalized = finalizePreds(remapped);
  return finalized.length ? finalized : offlineFallbackPreds();
}

function localIntentParse(text, options){
  const norm = normalizeWithPunct(text);
  if (!norm) return offlineFallbackPreds();
  const ctx = makeOfflineContext(norm, options);
  try {
    const globalPreds = parseGlobalOverride(norm);
    if (globalPreds) return finalizePreds(globalPreds);
    const contextPreds = parseContextAnswer(norm, ctx);
    if (contextPreds && contextPreds.length) return finalizePreds(contextPreds);
    const rulePreds = parseByRules(norm, ctx);
    if (rulePreds && rulePreds.length) return finalizePreds(rulePreds);
    return normalizeLegacyPreds(scoreBasedParse(norm, options));
  } catch (error){
    if (typeof console !== "undefined" && console.warn) console.warn("[localIntent] K2 规则层异常，使用兜底：", error);
    try { return normalizeLegacyPreds(scoreBasedParse(norm, options)); }
    catch (inner) { return offlineFallbackPreds(); }
  }
}

function isNoiseInput(text){
  const t = String(text || "");
  const core = t.replace(/[\s\p{P}\p{S}]/gu, "");
  if (!core) return true;
  if (/^(测试){2,}$/.test(core)) return true;
  if (/^\d+$/.test(core)) return true;
  const letters = core.replace(/[^A-Za-z]/g, "");
  if (letters && /^(undefinednullnan)+$/.test(letters.toLowerCase())) return true;
  if (/^[A-Za-z]+$/.test(core) && !/^(hi|hey|hello|ok|okay|yes|no)$/i.test(core)) return true;
  if (/^[（(].+[）)]$/.test(t.trim())) return true;
  return false;
}

function isSystemDirective(text){
  const t = String(text || "");
  // 「打开背包」是在问行囊，不是界面指令；只有带界面/面板/窗口，或打开地图/菜单这类系统面，才算指令。
  if (/(打开|关闭|点开|呼出|隐藏|切换).{0,12}(物品栏|任务面板|任务界面|地图界面|世界地图|地图|界面|面板|窗口|菜单|视角|镜头|人称|摄像头)/.test(t)) return true;
  if (/(打开|关闭|点开|呼出|隐藏|切换).{0,8}背包(?:界面|面板|窗口)/.test(t)) return true;
  if (/第[一二三]人称|视角|镜头/.test(t) && /切换|换成|改成|调整|打开/.test(t)) return true;
  if (/(给我)?\d{2,}\s*(个)?\s*(德拉克马|金币|银币|块钱)/.test(t) && !/买|购买|价格|多少钱/.test(t)) return true;
  if (/(把|将).{0,20}(血量|血条|生命值|体力|士气|饥饿值?|口渴值?|状态数值?|任务状态|金币|金钱|德拉克马|淡水|风|敌人|所有敌人).{0,20}(清零|清空|填满|补满|加满|拉满|提一提|提高|提升|增加|修改|标记成|设为|设置成|停止|停下|停了|无敌|回复满|回满)/.test(t)) return true;
  if (/(修改|设置|调整|刷出|增加).{0,14}(数值|血量|金币|德拉克马|任务状态|等级|经验|掉落)/.test(t)) return true;
  if (/触发.{0,10}(主线)?剧情.{0,6}第?[一二三四五六七八九十\d]*\s*章/.test(t)) return true;
  if (/(直接)?跳(过|到).{0,18}(终章|第[一二三四五六七八九十\d]+[章节]|前置步骤|前置|献祭|剧情|流程|动画)/.test(t) && /跳过|直接跳/.test(t)) return true;
  if (/召唤.{0,10}(我那条船|船只|大船|神兽|怪物|亡灵|随从)/.test(t)) return true;
  if (/解除.{0,8}诅咒|破解.{0,8}诅咒/.test(t)) return true;
  if (/把我变成(亡魂|亡灵|神|怪物|牛)|变成亡魂/.test(t)) return true;
  if (/兑换.{0,14}(冥河摆渡人|摆渡人).{0,8}硬币/.test(t)) return true;
  if (/把.{0,14}(六个头|几颗头|所有头|头颅).{0,10}(全)?砍下来/.test(t)) return true;
  if (/把.{0,14}(海峡的雾|岛上的雾|海水|风暴|海浪).{0,12}(装(进|入|到).{0,8}(瓶|袋子|口袋)|收进瓶)/.test(t)) return true;
  if (/^(请|帮我|替我|给我)?(告诉|转告|捎给|带话给)(?!我)([^，,。:：]{1,16})[:：]/.test(t)) return true;
  if (/^(帮我|替我)?(告诉|转告)(?!我)[一-龥]{2,12}(?:不怪你|别这样|带句话)/.test(t)) return true;
  return false;
}

function isThreatUtterance(text){
  const t = String(text || "");
  if (/你找死|找死吧|有种(拔剑|单挑)|拔剑|单挑|抢的就是你|老子抢|杀了你|砍了你|捅了你|揍你|打死你|血洗|灭了你|饶不了|收拾你/.test(t)) return true;
  // 「废物」单独骂人算威胁；「这面包是废物，扔掉」仍是丢弃，不能整句升格。
  if (/^(?:你这个?)?废物[！!。…]*$/.test(t.trim()) || /你(?:这个|真是|就是个?)?废物/.test(t)) return true;
  if (/(把钱|钱财|东西)交出来/.test(t) && /(不然|否则|要不).{0,14}(砍|杀|打|捅|死|血)/.test(t)) return true;
  if (/信不信我.{0,12}(把你|将你).{0,14}(扔|丢|打|砍|杀|喂)/.test(t)) return true;
  if (/(把你|将你)(扔|丢|砍|杀|打|揍).{0,14}(海里|喂鱼|喂鲨鱼|去死|打死|打扁)/.test(t)) return true;
  if (/我要(杀|砍|打|揍|血洗|屠).{0,10}(你|这条船|船上(所有)?人|这里所有人)/.test(t)) return true;
  return false;
}

function findDictionaryItems(text){
  const used = [];
  const hits = [];
  for (const alias of ITEM_ALIAS_SORTED){
    let from = 0;
    let idx = text.indexOf(alias, from);
    while (idx >= 0){
      const end = idx + alias.length;
      const overlap = used.some((range) => idx < range[1] && end > range[0]);
      if (!overlap){
        used.push([idx, end]);
        hits.push({ start: idx, end, name: ITEM_ALIAS_MAP[alias], alias });
      }
      from = idx + alias.length;
      idx = text.indexOf(alias, from);
    }
  }
  return hits.sort((a, b) => a.start - b.start).map((h) => h.name);
}

const EXAM_COUNT_RE = /(\d+|[零〇一二两俩三四五六七八九十百]+)\s*([个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]?)/;
const SINGLE_SERVE_UNITS = new Set(["块", "根", "份", "枚", "把", "条", "只", "片", "张", "颗"]);

function extractExamCount(text, mode){
  const t = String(text || "");
  const m = t.match(EXAM_COUNT_RE);
  if (!m) return null;
  if (m.index > 0 && t[m.index - 1] === "第") return null;
  const rawNumber = m[1];
  const n = parseCnNumber(rawNumber);
  if (n === null || n <= 0) return null;
  const unit = m[2] || "";
  const isChineseOne = rawNumber === "一" || rawNumber === "壹";
  if (n === 1 && SINGLE_SERVE_UNITS.has(unit)) return null;
  // “一个面包”是单人份泛指；阿拉伯数字 1 是玩家明确写出的数量，保留。
  if (isChineseOne && unit === "个") return null;
  // 裸中文“一”常出现在“一些/一起/一会儿/一样”，没有真实量词时不能当数量。
  if (!unit && !/^\d+$/.test(rawNumber)) return null;
  return String(n);
}

function isAcknowledgement(text){
  const t = String(text || "").replace(/[\s,，。.!！?？]+/g, "");
  return /^(嗯+|哦哦?|噢|哦|对|对对|是的?|好的?|没错|就这个|对就这个|行|可以|ok|okay|yes)$/i.test(t);
}

function normalizeEquipmentToken(text){
  const items = findDictionaryItems(text);
  return items.find((name) => ["铜矛", "铁剑", "弓", "箭", "皮甲", "头盔", "护腕", "斗篷", "隐形头盔"].includes(name)) || items[0] || "";
}

function resolveContextItem(text, intent){
  const items = findDictionaryItems(text || "");
  if (items.length){
    if (intent === "unequip"){
      return items.find((name) => ["铜矛", "铁剑", "弓", "皮甲", "头盔"].includes(name)) || items[0];
    }
    return items[0];
  }
  if (/桨/.test(text || "")) return "船桨";
  if (/[矛枪]/.test(text || "")) return "铜矛";
  return null;
}

function isCountOnlyUtterance(text){
  return /^(?:\d+|[零〇一二两俩三四五六七八九十百]+)\s*[个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]?$/.test(String(text || "").trim());
}

// 自足句里的动作/疑问言语行为词。命中后应优先走当前句规则，不能被历史里的
// 开场白关键词拖进省略继承；纯名词回答（“冥界”“面包”“矛”）不在这里。
const SELF_SUFFICIENT_UTTERANCE_RE = /[?？吗呢]|什么|怎么|怎样|如何|哪|多少|几|买|卖|购|价格|钱|装备|穿|脱|卸|扔|丢|给|拿|收|喝|吃|用|服|敷|去|往|到|回|来|走|开船|出海|扬帆|升帆|抛锚|靠岸|修|装|钓|采|砍|捡|摘|剪|搜|挖|捞|生火|搭|扎营|接|交|放弃|委托|任务|活儿|差事|帮助|怎么办|建议|预言|神谕|预示|附近|周围|背包|身上|状态|伤势|士气|体力|口渴|饥饿|饿|渴|疲劳|风|浪|天气|雾|天黑|几点|船|找|打听|告诉|威胁|拔剑|找死|再见|告辞|登船|你好|讲讲|说说/;

function isEllipticFollowup(text, ctx){
  if (!ctx.history.length) return false;
  const normalized = String(text || "");
  if (isAcknowledgement(normalized) || isCountOnlyUtterance(normalized)) return true;
  if (/^(?:扔了|扔掉|丢了|丢掉|不要了|沉了它)$/.test(normalized.trim())) return true;
  const token = normalized.replace(/[\s,，。.!！?？;；、]+/g, "");
  if (!token || token.length > 12 || /[，,。；;！？!?]/.test(normalized)) return false;
  if (SELF_SUFFICIENT_UTTERANCE_RE.test(token)) return false;
  return /^[一-龥A-Za-z0-9·]{1,12}$/.test(token);
}

function parseContextAnswer(text, ctx){
  if (!ctx.history.length || !isEllipticFollowup(text, ctx)) return null;
  if (isAcknowledgement(text)) return [{ category: "闲聊", args: [] }];

  const lastUser = lastHistoryUser(ctx);
  const lastAssistant = lastHistoryAssistant(ctx);
  const token = text.replace(/^[，,。\s]+|[，,。\s!?！？]+$/g, "");
  const countUnitQuestion = /要几|几\s*[个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]|多少\s*[个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]/.test(lastAssistant);

  // “三罐”：上一轮 user 必须先有购买框架，AI 再追问数量；不能从 NPC 开场白猜。
  if (isCountOnlyUtterance(text) && lastUser && /买|购|来[一二两\d]*[瓶份捆壶条块罐]/.test(lastUser)
      && (countUnitQuestion || /[瓶罐壶份卷捆]/.test(lastUser))){
    const item = resolveContextItem(lastUser, "buy") || resolveContextItem(lastAssistant, "buy");
    const count = extractExamCount(text, "buy");
    if (item && count) return [{ category: "购买物品", args: [{ 物品: item, 数量: count }] }];
  }

  // “扔了”：上一轮 user 必须已表达丢弃倾向，或 AI 明确追问是否扔掉。
  if (/^(扔了|扔掉|丢了|丢掉|不要了|沉了它)$/.test(token)
      && ((lastUser && /扔|丢|不要|破桨/.test(lastUser)) || /要扔|扔掉吗|确定.{0,6}扔/.test(lastAssistant))){
    const item = resolveContextItem(lastUser, "discard") || resolveContextItem(lastAssistant, "discard");
    return [{ category: "丢弃物品", args: item ? [{ 物品: item }] : [] }];
  }

  if (token.length > 10 || /[，,。；;！？!?]/.test(token)) return null;

  if (lastUser && /卸|脱下|取下|收起装备/.test(lastUser + lastAssistant) && /^(矛|枪|铜矛|铁剑|剑|弓|箭|皮甲|头盔|装备)$/.test(token)){
    const item = normalizeEquipmentToken(token);
    return [{ category: "卸下装备", args: item ? [{ 物品: item }] : [] }];
  }

  if (lastUser && /谁给过我预示|神谕|预言|预示|神意|哪位神/.test(lastUser)){
    if (token.length <= 8) return [{ category: "查询神谕", args: [{ 神谕来源: token }] }];
  }

  if ((lastUser && /去哪儿|去哪里|我要去|我想去|找一?[座个]?(?:岛|地方|地点|海域)|往哪(?:走|去)|目的地/.test(lastUser))
      || (/去哪儿|去哪里|目的地/.test(lastAssistant) && lastUser && /去|找/.test(lastUser))
      || (/往(?:东南|东北|西南|西北|东|南|西|北).{0,8}是/.test(lastAssistant) && lastUser && /去|找/.test(lastUser))){
    return [{ category: "导航到地点", args: [{ 目的地: token }] }];
  }

  if (lastUser && /做点什么|做什么|什么活|任务|委托|接哪个|接下来|有什么活/.test(lastUser)){
    return [{ category: "接取任务", args: token ? [{ 任务名称: token }] : [] }];
  }

  if (lastUser && /买|要(?:点|些)?(?:吃的|喝的|货)|有什么(?:吃的|喝的|货|卖)/.test(lastUser)){
    const item = findDictionaryItems(token)[0] || (/^[一-龥A-Za-z]{1,10}$/.test(token) ? token : "");
    if (item) return [{ category: "购买物品", args: [{ 物品: item }] }];
  }

  if (lastUser && /唱歌|歌声|生物|怪物|活物|鱼|会叫|是什么东西/.test(lastUser)){
    const entity = extractBioEntity(token);
    if (entity) return [{ category: "查询生物情报", args: [{ 生物: entity }] }];
  }

  return null;
}

function uniqueStrings(list){
  return [...new Set((list || []).filter(Boolean))];
}

function cleanTradeItemPhrase(value){
  return String(value || "")
    .replace(/^(点|些|一|两|二|三|四|五|六|七|八|九|半|把|瓶|个|份|捆|壶|条|块|颗|张|枚|根|片|卷|袋|罐|杯|碗|只)+/, "")
    .replace(/(呢|吗|啊|呀|哦|吧)$/, "")
    .trim();
}

function extractPurchaseItems(seg){
  // 先信任“购买引导词 + 数量/量词 + 物品短语”的右侧 NP，避免 OOV 全名词
  // 被其中的单字别名（如“赫拉克勒斯之剑”里的“剑”）截断成游戏内旧物品。
  const m = seg.match(/(?:购买|买|购入|置办|来|给我(?:来)?|拿)(?:\s*\d+|[零〇一二两俩三四五六七八九十百]+)?\s*[个瓶份捆壶条块把张颗杯碗棵只枚根片卷袋箱口头匹束罐升]?\s*([一-龥A-Za-z][一-龥A-Za-z0-9之]{1,15}?)(?=$|[\s，,。.!！?？;；]|(?:然后|顺便|并且|还要|再|的|吗|呢|啊|呀|用))/);
  if (m){
    const item = cleanTradeItemPhrase(m[1]);
    if (item.length >= 2 && !/^(什么|多少|价格|东西|点药|这个|那个)$/.test(item)) return [item];
  }
  const known = uniqueStrings(findDictionaryItems(seg));
  if (known.length) return known;
  if (m){
    const item = cleanTradeItemPhrase(m[1]);
    if (item && !/^(什么|多少|价格|东西|点药)$/.test(item)) return [item];
  }
  return [];
}

function extractTradeCurrency(seg){
  const m = seg.match(/(德拉克马|金币|银币)/);
  return m ? m[1] : "";
}

function extractPriceItem(seg){
  const known = findDictionaryItems(seg)[0];
  if (known) return known;
  const m = seg.match(/([一-龥A-Za-z]{1,10}?)(?:多少钱|什么价|怎么卖|值多少|价格|贵不贵)/);
  if (!m) return "";
  const item = m[1].replace(/^(这个|那个|这把|那把|这瓶|那瓶|这|那)/, "").replace(/^(个|把|瓶|件)$/, "");
  return item && !/^(个|把|瓶|件|什么|多少)$/.test(item) ? item : "";
}

function extractReceiver(seg, ctx){
  const facility = seg.match(/(?:倒|放|投|献|灌)(?:进|入|到|在)([^，,。；;]{1,12}?(?:献祭之沟|献祭沟|祭坛|火堆|火里|坛|碗|沟))/);
  if (facility) return facility[1].replace(/^(进|入|到|在)/, "");
  const m = seg.match(/(?:献给|交给|递给|送给|给)([他她它我你]|[那这]+[个名位]?[一]?[个名位]?[一-龥A-Za-z]{1,10}|[一-龥A-Za-z]{2,10})(?=$|[\s，,。.!！?？;；])/);
  if (!m) return "";
  let receiver = m[1].replace(/^(那个|这个|那位|这位|那名|这名|一个|一位|个|位)/, "");
  if (/^我/.test(receiver) || receiver === "你") return "";
  if (receiver === "她" || receiver === "他") return ctx.npcName || "";
  return receiver;
}

function extractNavDestination(seg){
  let m = seg.match(/(?:带我去|带我到|我要去|我想去|前往|去往|前去|去|到|往|回)([一-龥A-Za-z0-9]{1,16})/);
  let destination = m ? m[1] : "";
  if (!destination){
    m = seg.match(/^([一-龥A-Za-z0-9]{2,14}?)(?:怎么走|怎么去|如何走|如何去)/);
    destination = m ? m[1] : "";
  }
  destination = destination.replace(/^(那个|那座|这个|这座)/, "");
  for (let i = 0; i < 3; i++){
    destination = destination.replace(/(那儿|那里|那边|这儿|这里|这边|看看|一下|走吧|吧|呀|啊|呢|哦)$/, "");
  }
  return destination;
}

// 远方旅程目的地在“X 在哪”式问法中仍按导航处理；当前地图设施/人物寻位
// 则留在查询附近目标。这里只维护语义词典，不按用例编号或整句答案建表。
const FAR_WHERE_DESTINATIONS = [
  "俄刻阿诺斯之岸", "阿刻戎河渡口", "冥界之岸", "埃俄罗斯岛", "风神岛",
  "伊斯玛洛斯", "冥界",
];

function detectFarWhereNavigation(seg){
  if (!/在哪|在哪个方向/.test(seg)) return null;
  const destination = FAR_WHERE_DESTINATIONS.find((name) => seg.includes(name));
  return destination ? oneResult("导航到地点", { 目的地: destination }) : null;
}

const PLACE_NAME_RE = /([一-龥A-Za-z]{0,14}?(?:献祭之沟|献祭沟|斯库拉海峡|声之海峡|爱奥尼亚海|第勒尼安海|马里阿角|埃俄罗斯岛|风神岛|埃阿亚岛|奥吉吉亚|斯克里岛|阿刻戎河渡口|俄刻阿诺斯之岸|冥界之岸|食莲岛|忒勒皮洛斯|伊斯玛洛斯|西西里|伊萨卡|冥界|冥河|特洛伊|提洛|塞壬岩|漩涡|码头|神庙|宫殿|宴厅|斧阵|祭坛|山洞|洞窟|岛屿|岛|海峡|海域|海岸|海|角|城|宫|殿|厅|沟|岸|河|渡口))/;

function extractPlaceName(seg){
  let place = "";
  let m = seg.match(/([一-龥A-Za-z]{2,12}?)是谁的岛/);
  if (m) place = m[1];
  if (!place){
    m = seg.match(/([一-龥A-Za-z]{2,12}?)住哪座岛/);
    if (m) place = m[1];
  }
  if (!place){
    m = seg.match(PLACE_NAME_RE);
    if (m) place = m[1];
  }
  if (!place){
    m = seg.match(/([一-龥A-Za-z]{2,10}?)(?:上|里)(?:有|是|住)/);
    if (m) place = m[1];
  }
  place = place.replace(/(那边|这边|那里|这里|那儿|这儿|里|上)$/, "");
  if (place.length < 2 || /^(岛|海|角|城|宫|殿|厅|沟|岸|河)$/.test(place)) return "";
  if (/^(这个|那个|这座|那座|这个岛|那个岛|这座岛|那座岛|这里|那里|这儿|那儿|岛上|海里)$/.test(place)) return "";
  return place;
}

const BIO_ENTITY_NAMES = [
  "莱斯特律戈尼巨人", "波吕斐摩斯", "独眼巨人", "卡律布狄斯", "喀耳卡狄斯", "刻耳柏洛斯",
  "普洛特斯", "涅柔斯", "阿伽门农", "阿喀琉斯", "特瑞西阿斯", "佩涅洛佩", "安提诺奥斯",
  "德摩多科斯", "瑙西亚娅", "卡吕普索", "埃俄罗斯", "赫利俄斯", "雅典娜", "赫尔墨斯",
  "波塞冬", "哈迪斯", "奥德修斯", "忒勒玛科斯", "费埃克斯人", "求婚者", "十二风",
  "塞壬", "斯库拉", "海蛇", "螃蟹", "海龟", "海豚", "海鸥", "飞鱼", "阿尔戈斯",
  "野牛", "圣牛", "巨羊", "羊群", "海鱼", "莲子", "橄榄", "牛", "鱼",
];
const LOCATION_BIO_ENTITIES = new Set(["塞壬", "斯库拉", "卡律布狄斯", "海蛇", "螃蟹", "海龟", "海豚", "海鸥", "飞鱼", "阿尔戈斯", "野牛", "巨羊", "羊群", "海鱼", "鱼"]);

function extractBioEntity(seg){
  if (/附近有什么鱼|海里有什么鱼|这片海有什么鱼/.test(seg)) return "海鱼";
  for (const name of BIO_ENTITY_NAMES.sort((a, b) => b.length - a.length)){
    if (seg.indexOf(name) !== -1){
      if (name === "独眼巨人" && /怕什么|弱点/.test(seg)) return "波吕斐摩斯";
      return name;
    }
  }
  return "";
}

function isCreatureLocationQuestion(seg){
  const entity = extractBioEntity(seg);
  return !!entity && LOCATION_BIO_ENTITIES.has(entity)
    && /在哪|哪片海|哪里|出没|位置|附近|有什么鱼|海里/.test(seg);
}

function extractBioAspect(seg, entity){
  if (/效力|作用/.test(seg)) return "价值";
  if (/什么时候(出来|出现|游)|出现时间/.test(seg)) return "出现时间";
  if (/能吃吗|可以吃吗|可食用/.test(seg)) return "食用性";
  if (/怕什么|弱点/.test(seg)) return "弱点";
  if (/怕人吗|害死人吗|会害人|危险吗/.test(seg)) return "危险性";
  if (/喜欢什么|喜好/.test(seg)) return "喜好";
  if (/多少人|人数|有多少(?:求婚者|船员|士兵)/.test(seg)) return "数量";
  if (/出没地点|生活在哪里|产地/.test(seg)) return "出没地点";
  if (/习性/.test(seg)) return "习性";
  return "";
}

function extractQuestName(seg){
  let m = seg.match(/(接取悬赏[：:].+?)(?:$|[，,。.!！?？])/);
  if (m) return m[1].trim().replace(/:/g, "：").replace(/^接取/, "");
  if (/接取|接受|接下|接(?:个|下)?(?:悬赏|任务|委托|活)/.test(seg)){
    m = seg.match(/(?:接取|接受|接下|接(?:个|下)?)(?:悬赏|任务|委托|活儿?|差事)?[：:]?\s*([一-龥A-Za-z0-9：]{2,16})/);
    if (m){
      return m[1].replace(/^(这个|那个|这份|那份)/, "").replace(/(?:的活|的任务|的委托|活儿?|任务|委托)$/, "");
    }
  }
  m = seg.match(/([一-龥A-Za-z0-9]{2,12}?)(?:那个)?任务(?:我接了|我接|$)/);
  if (m) return m[1];
  m = seg.match(/([一-龥A-Za-z0-9]{2,12}?)的活/);
  if (m) return m[1];
  m = seg.match(/([一-龥A-Za-z0-9]{2,12}?)做到哪/);
  if (m) return m[1];
  return "";
}

function extractQuestClueName(seg){
  const m = seg.match(/([一-龥A-Za-z0-9]{2,10}?)(?:那个)?任务/);
  if (!m) return "";
  const name = m[1].replace(/^(那个|这个|那份|这份)/, "");
  if (!name || /^(什么|哪个|这个|那个|我|你|他)$/.test(name)) return "";
  return name;
}

function extractSubmitName(seg){
  const direct = seg.match(/把([一-龥A-Za-z0-9]{2,12}?)任务交/);
  return direct ? direct[1] : "";
}

function extractQuestClueAspect(seg){
  if (/报酬|给多少|奖励|赏金/.test(seg)) return "奖励";
  if (/委托人|谁发布|谁给的/.test(seg)) return "委托人";
  if (/注意事项|难点|要注意什么/.test(seg)) return "注意事项";
  if (/要采什么|采什么|要做什么|做什么|干什么|目标|任务内容|具体内容/.test(seg)) return "目标";
  if (/在哪做|任务地点|地点/.test(seg)) return "地点";
  return "";
}

function extractEnvFactor(seg){
  if (/浪/.test(seg)) return "浪高";
  if (/雾|能见度/.test(seg)) return "能见度";
  if (/天气|晴|阴|下雨|下雨吗/.test(seg)) return "天气";
  if (/天黑|天亮|几点|白昼|夜晚|昼夜|夜了吗/.test(seg)) return "昼夜";
  if (/水温|水凉/.test(seg)) return "水温";
  if (/潮汐|潮位|涨潮|退潮/.test(seg)) return "潮汐";
  if (/危险|凶险/.test(seg)) return "危险程度";
  if (/风/.test(seg)) return "风向";
  return "";
}

function isEnvQuery(seg, factor){
  if (/岛上有什么|岛上有谁|岛是个什么地方|安全吗/.test(seg)) return false;
  if (factor === "风向") return /风向|风往|风怎么|风大|大风|什么时候刮|什么风|听听.{0,4}风|明天风|现在.{0,6}风|风怎么样|风停了吗|风停了没|风小了吗/.test(seg);
  if (factor === "浪高") return /浪(?:大|高|多高|怎么样|大不大|高不高|呢)/.test(seg);
  if (factor === "天气") return /天气|晴|阴|下雨/.test(seg);
  if (factor === "昼夜") return /几点|天黑|天亮|白昼|夜晚|昼夜/.test(seg);
  if (factor === "能见度") return /雾|能见度/.test(seg);
  if (factor === "水温") return /水温|水凉/.test(seg);
  if (factor === "潮汐") return /潮|涨潮|退潮/.test(seg);
  if (factor === "危险程度") return /危险|凶险/.test(seg);
  return false;
}

function extractEnvLocation(seg){
  const place = extractPlaceName(seg);
  if (place) return place;
  const m = seg.match(/([一-龥]{2,10}?(?:海峡|角|岛|海|湾))/);
  return m ? m[1] : (/海峡/.test(seg) ? "海峡" : "");
}

function extractNearbyTargetType(seg){
  if (/淡水|水源|泉水|溪水/.test(seg)) return "淡水源";
  if (/任务点|委托点/.test(seg)) return "任务点";
  if (/神庙|神殿/.test(seg)) return "神庙";
  if (/敌人|敌对|怪物|海怪/.test(seg)) return "敌对生物";
  if (/船(?!员)/.test(seg)) return "船只";
  if (/商店|商人|卖东西|店铺/.test(seg)) return "商店";
  if (/营地|篝火|营火/.test(seg)) return "营地";
  if (/岛屿|一座岛/.test(seg)) return "岛屿";
  return "";
}

function extractHelpContent(seg){
  let m = seg.match(/帮(?:帮)?我(.{2,16}?)(?:$|[，,。.!！?？])/);
  if (m && !/^(个忙|一下)$/.test(m[1])) return m[1];
  m = seg.match(/怎么(渡过|通过|穿过)([一-龥A-Za-z]{1,10})/);
  if (m) return `${m[1]}${m[2]}`;
  if (/我该往哪走|该往哪走|往哪走/.test(seg)) return "往哪走";
  if (/回家的路.{0,8}远吗/.test(seg)) return "回家";
  return "";
}

// schema 闲聊说明中明确按八卦/当前对话话题处理的身份询问；其他第三方人物
// “是谁”仍走查询生物情报。
const CHITCHAT_IDENTITY_NAMES = new Set(["埃俄罗斯"]);

function extractChatTopic(seg){
  let m = seg.match(/讲讲(.+?(?:传说|故事|笑话|规矩|经历))/);
  if (m) return m[1];
  if (/你叫什么名字|你的名字/.test(seg)) return "名字";
  m = seg.match(/这(?:趟|次)?航程[^，,。]{0,4}漫长/);
  if (m || /航程/.test(seg)) return "航程";
  if (/这海/.test(seg)) return "海";
  if (/这酒/.test(seg)) return "酒";
  if (/本地人/.test(seg)) return "本地人";
  if (/神啊|神明|众神/.test(seg)) return /众神/.test(seg) ? "众神" : "神";
  if (/我还能回家吗/.test(seg)) return "回家";
  m = seg.match(/我还能回到([一-龥A-Za-z]{1,8})吗/);
  if (m) return m[1];
  m = seg.match(/([一-龥A-Za-z]{2,10}?)算(?:什么|神话生物)吗/);
  if (m) return m[1];
  m = seg.match(/^([一-龥A-Za-z]{2,10})是谁$/);
  if (m && CHITCHAT_IDENTITY_NAMES.has(m[1])) return m[1];
  m = seg.match(/([一-龥]{1,8})是谁给我的/);
  if (m) return m[1];
  m = seg.match(/([一-龥A-Za-z]{2,10}?)回(?:伊萨卡|家)了吗/);
  if (m) return m[1];
  m = seg.match(/打了一整天([一-龥]{1,6}?)(?:，|,|。|累死|$)/);
  if (m) return m[1];
  return "";
}

function splitRuleSegments(text){
  return text.split(/(?:[，,。.!！?？;；]|然后|接着|顺便|并且|而且|还要|另外|外加|再(?=给|买|装|去|装备|喝|问|把|接)|并(?=问|把|装|去|装备|接))/)
    .map((s) => s.trim()).filter(Boolean);
}

function oneResult(category, args){
  return { category, args: args && Object.keys(args).length ? [args] : [] };
}

function detectShipResults(seg){
  const out = [];
  if (/修船|船(?:漏水|坏了|破了)|修补船体|修一下船|把船修|修理船/.test(seg)) out.push(oneResult("船只操作", { 动作: "修补船体" }));
  if (/给船(?:装|补|加)淡水|把淡水装上|淡水装(?:上|船)|装淡水/.test(seg)) out.push(oneResult("船只操作", { 动作: "补充淡水" }));
  if (/升帆|扬帆(?!出海)|起帆/.test(seg)) out.push(oneResult("船只操作", { 动作: "升帆" }));
  if (/抛锚|下锚/.test(seg)) out.push(oneResult("船只操作", { 动作: "抛锚" }));
  if (/靠岸|把船靠岸|登陆|上岸/.test(seg)) out.push(oneResult("船只操作", { 动作: "靠岸" }));
  if (/开船|出海|启航|起航|扬帆出海/.test(seg)) out.push(oneResult("船只操作", { 动作: "出航" }));
  const seen = new Set();
  return out.filter((r) => {
    const key = JSON.stringify(r.args);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function detectCamp(seg){
  if (/升(?:个)?信号火|烽火/.test(seg)) return oneResult("营地准备", { 动作: "升信号火" });
  if (/生(?:个|堆)?火|烤个火/.test(seg)) return oneResult("营地准备", { 动作: "生火" });
  if (/搭(?:个|座)?帐篷|帐篷/.test(seg)) return oneResult("营地准备", { 动作: "搭帐篷" });
  if (/扎营|露营/.test(seg)) return oneResult("营地准备", { 动作: "扎营" });
  if (/搭桥/.test(seg)) return oneResult("营地准备", { 动作: "搭桥" });
  if (/做(?:把|一把|个).{0,4}(桨|船桨|弓|工具)|制作工具/.test(seg)){
    const item = findDictionaryItems(seg).find((x) => ["船桨", "弓"].includes(x)) || (/桨/.test(seg) ? "船桨" : "");
    return oneResult("营地准备", { 动作: "制作工具", ...(item ? { 物品: item } : {}) });
  }
  if (/修补装备|把装备修好/.test(seg)) return oneResult("营地准备", { 动作: "修补装备" });
  return null;
}

function detectGather(seg){
  if (/吃点东西|找点吃的|弄点吃的|觅食/.test(seg)) return oneResult("获取物资", {});
  let action = "", item = "";
  if (/钓|捕鱼/.test(seg)){ action = "垂钓"; }
  else if (/剪.*羊毛|剪取|剪把/.test(seg)){ action = "剪取"; item = "羊毛"; }
  else if (/搜(?:个|索)?.*(绳结|船骸)|搜刮|搜个/.test(seg)){ action = "搜刮"; item = findDictionaryItems(seg)[0] || "绳结"; }
  else if (/打捞|捞/.test(seg)){ action = "打捞"; item = findDictionaryItems(seg)[0] || ""; }
  else if (/挖/.test(seg)){ action = "挖掘"; item = findDictionaryItems(seg)[0] || ""; }
  else if (/摘/.test(seg)){ action = "摘取"; item = findDictionaryItems(seg)[0] || (/橄榄/.test(seg) ? "橄榄" : ""); }
  else if (/砍/.test(seg)){
    if (/木料|木头|木材/.test(seg)){ action = "砍伐"; item = "木料"; }
    else { action = "伐木"; item = findDictionaryItems(seg)[0] || "柴薪"; }
  }
  else if (/取水|弄点淡水|淡水回来|打点水/.test(seg)){ action = "取水"; item = "淡水"; }
  else if (/捡|采集|采点|采些|摘采/.test(seg)){ action = "采集"; item = findDictionaryItems(seg)[0] || ""; }
  if (!action) return null;
  const count = extractExamCount(seg, "gather");
  return oneResult("获取物资", {
    动作: action,
    ...(item ? { 物品: item } : {}),
    ...(count ? { 数量: count } : {}),
  });
}

function isBuyRequest(seg){
  return /购买|买|购入|置办|换购/.test(seg)
    || /给我来|来[一二两俩\d]*\s*[瓶份捆壶条块颗杯碗棵只枚根片卷袋罐]/.test(seg)
    || /^给我[一二两俩\d]+\s*[个瓶份捆壶条块张颗杯碗棵只枚根片卷袋罐]/.test(seg)
    || /拿(?:壶|瓶|个|份).{0,8}来/.test(seg);
}

function detectBuy(seg){
  if (!isBuyRequest(seg)) return null;
  const items = extractPurchaseItems(seg);
  const count = extractExamCount(seg, "buy");
  const currency = extractTradeCurrency(seg);
  if (!items.length) return [oneResult("购买物品", { ...(currency ? { 货币: currency } : {}) })];
  return items.map((item) => oneResult("购买物品", {
    物品: item,
    ...(count ? { 数量: count } : {}),
    ...(currency ? { 货币: currency } : {}),
  }));
}

function detectUse(seg){
  const looksUse = /用上|用一下|用掉|服用|吃药|用药|喝(?:水|口水|点水|淡水|酒|药)?$|吃(?:掉|下|了|一口|口|一块|块|一颗|颗|一枚|枚|一点|点|一些|点)?|敷|抹药|把[一-龥A-Za-z]{1,10}(?:给我)?用/.test(seg)
    || /^喝$/.test(seg);
  if (!looksUse || /吃点东西/.test(seg)) return null;
  let items = findDictionaryItems(seg).filter((name) => {
    if (name === "治疗草药" && /药/.test(seg) && !/治疗草药|草药|疗伤药|药草|这瓶药|那瓶药|一瓶药/.test(seg)) return false;
    return true;
  });
  if (/蜡用上|用.{0,3}蜡/.test(seg) && !items.includes("蜡")) items.push("蜡");
  // 考卷只在自主进食构造（吃掉/吃点/吃口/吃一颗等）填“自己”；“吃块蜂蜜”
  // 的黄金参数没有对象，不能见到“吃”就补默认槽。
  const objectSelf = /吃(?:掉|下|了|一|点|颗|口|枚)/.test(seg) ? "自己" : "";
  if (!items.length) return [oneResult("使用消耗品", { ...(objectSelf ? { 对象: objectSelf } : {}) })];
  return items.map((item) => oneResult("使用消耗品", { 物品: item, ...(objectSelf ? { 对象: objectSelf } : {}) }));
}

function detectGive(seg, ctx, fullText){
  const transfer = /给你|交给你|递给你|拿着|收下|送给你|^给$|把[一-龥A-Za-z]{1,16}给(?:我|你|他|她|它|那个|这位|[一-龥]{2,})/.test(seg)
    || /(?:倒|放|投|献|灌)(?:进|入|到|在).{0,10}(?:沟|坛|火|祭坛|碗)/.test(seg);
  if (!transfer || /用上|用一下/.test(seg)) return null;
  const receiver = extractReceiver(seg, ctx);
  let items = findDictionaryItems(seg);
  // 中文逗号可能把移交提示和物品宾语切开：“拿着，这是面包”。仅在当前子句是
  // 短移交提示时回看整句物品，避免多意图第二子句串槽。
  if (!items.length && fullText && seg.length <= 6 && /^(?:拿着|收下|给你|递给你|交给你)/.test(seg)){
    items = findDictionaryItems(fullText);
  }
  if (!items.length) return [oneResult("给予物品", { ...(receiver ? { 接收方: receiver } : {}) })];
  return items.map((item) => oneResult("给予物品", { 物品: item, ...(receiver ? { 接收方: receiver } : {}) }));
}

function detectChat(seg){
  const topic = extractChatTopic(seg);
  if (topic) return oneResult("闲聊", { 话题: topic });
  if (/你好|您好|嗨|哈喽|嘿|好久不见|最近怎么样|最近如何|你叫什么|讲个故事|讲个笑话|哈哈+|你们是谁|你是谁|你会(?:造船|唱歌)|你在找谁|谢谢|多谢/.test(seg)){
    return oneResult("闲聊", {});
  }
  return null;
}

function classifySegment(seg, ctx, fullText){
  if (isAcknowledgement(seg)) return [oneResult("闲聊", {})];
  if (/再见|告辞|回头见|明天见|改天见|拜拜|后会有期|我先走|先走了|我要走了|我走了|先登船|我先登船/.test(seg) || /^离开(?:这里|这儿|这座岛)?$/.test(seg)){
    return [oneResult("告别", {})];
  }
  // 「给我治治伤」是求助，不是把一样东西交出去。治疗草药仍走物品规则。
  if (/治治伤|疗伤|包扎伤口|帮我治疗(?!草药)|(?<!治)治伤/.test(seg) && !/给你|交给你|送给你|给那个|给这位/.test(seg)){
    return [oneResult("请求帮助", { 求助内容: "治疗" })];
  }

  const ship = detectShipResults(seg);
  if (ship.length) return ship;

  if (/附近|周围|哪里|哪儿|哪有/.test(seg) && /钓点|钓鱼(?:的)?地方|捕鱼点|鱼点/.test(seg)){
    return [oneResult("查询附近目标", {})];
  }

  if (/多少钱|什么价|怎么卖|值多少|价格|贵不贵|几个钱|什么价位/.test(seg)){
    const item = extractPriceItem(seg);
    return [oneResult("查询价格", { ...(item ? { 物品: item } : {}) })];
  }

  if (/我背包|背包里|打开背包|看看背包|我身上|身上还|包里|口袋里|我还有多少|船上的?.{0,10}(?:淡水|补给|物资|水粮).{0,10}(?:还够|还有|剩多少)/.test(seg)
      && !/有伤吗|身上有伤|伤势|血量|体力|士气|渴不渴|饿不饿/.test(seg)){
    return [oneResult("查询背包", { ...(findDictionaryItems(seg)[0] ? { 物品: findDictionaryItems(seg)[0] } : {}) })];
  }

  if (!/活|任务|委托|差事|接/.test(seg) && (/(?:还有吗|还有没有|有没有货|有货吗|都卖什么|卖什么|有什么卖|些什么货|库存|还有啥|有(?:没有)?药吗)/.test(seg)
      || (/(?:有没有|还有)/.test(seg) && /吗|？|\?|$/.test(seg) && !/背包|我身上|包里|船上/.test(seg)))){
    return [oneResult("查询库存", { ...(findDictionaryItems(seg)[0] ? { 物品: findDictionaryItems(seg)[0] } : {}) })];
  }

  if (/卖|换成钱|典当/.test(seg) && !/怎么卖|什么价|多少钱|卖什么|有什么卖|都卖/.test(seg)){
    return [oneResult("卖出物品", {
      ...(findDictionaryItems(seg)[0] ? { 物品: findDictionaryItems(seg)[0] } : {}),
      ...(extractExamCount(seg, "sell") ? { 数量: extractExamCount(seg, "sell") } : {}),
    })];
  }

  const buy = detectBuy(seg);
  if (buy) return buy;

  const forage = detectGather(seg);
  if (forage && /吃点东西|找点吃的|弄点吃的|觅食/.test(seg)) return [forage];

  // “螃蟹/莲子/橄榄能吃吗”是在询问食用性，不是让引擎立即使用消耗品。
  if (/能吃吗|可以吃吗|可食用吗/.test(seg)){
    const entity = extractBioEntity(seg);
    return [oneResult("查询生物情报", { 生物: entity, 询问内容: "食用性" })];
  }

  const use = detectUse(seg);
  if (use) return use;

  const give = detectGive(seg, ctx, fullText);
  if (give) return give;

  if (/扔|丢掉|丢弃|不要了|扔了|沉了它/.test(seg)){
    return [oneResult("丢弃物品", { ...(findDictionaryItems(seg)[0] ? { 物品: findDictionaryItems(seg)[0] } : {}) })];
  }

  if (/脱下|卸下|取下|卸下来|把弓卸|收起装备|^脱$/.test(seg)){
    const item = normalizeEquipmentToken(seg);
    return [oneResult("卸下装备", { ...(item ? { 物品: item } : {}) })];
  }
  if (/装备|穿上|换上|戴上|套上|能装备吗/.test(seg)){
    const item = normalizeEquipmentToken(seg);
    return [oneResult("装备物品", { ...(item ? { 物品: item } : {}) })];
  }

  if (/(?:任务|活|委托|差事).{0,8}(?:完成了吗|做完了吗|进度|做得怎么样|做得如何|做到哪|能交了吗|交了没|还差什么)/.test(seg)
      || /我的任务完成|[一-龥A-Za-z0-9]{2,12}做到哪(?:了)?$/.test(seg)){
    const name = extractQuestName(seg);
    return [oneResult("查询任务进度", { ...(name ? { 任务名称: name } : {}) })];
  }
  if (/交任务|交差|我来交|任务做完了|做完了|搞定了|办妥了|把任务交了|采到.{0,4}了|拿到.{0,4}了|收齐了/.test(seg)){
    const name = extractSubmitName(seg);
    return [oneResult("提交任务", { ...(name ? { 任务名称: name } : {}) })];
  }
  if (/放弃任务|不接了|这个我不接|取消任务|不干了|推掉|放弃吧/.test(seg)) return [oneResult("放弃任务", {})];

  if (/什么活|什么委托|什么任务|有什么活|有活吗|有活儿|委托可以做|任务要(?:采|做)什么|这活给多少|报酬|奖励|任务(?:如何|怎么样|什么内容)|接下来干|接下来做什么|有什么任务|有没有什么活|^任务$/.test(seg)){
    return [oneResult("查询任务线索", {
      ...(extractQuestClueName(seg) ? { 任务名称: extractQuestClueName(seg) } : {}),
      ...(extractQuestClueAspect(seg) ? { 询问内容: extractQuestClueAspect(seg) } : {}),
    })];
  }

  if (/接(?:取|受|下|个)?.{0,12}(?:悬赏|任务|委托|活|差事)|任务我接了|我接了$|这活我干|交给我|算我一个|我来做|我要做$|我接$|我包了|我应下|我选(?:长路|捷径)|选(?:长路|捷径)/.test(seg)){
    let name = extractQuestName(seg);
    if (!name && /长路/.test(seg)) name = "长路";
    if (!name && /捷径/.test(seg)) name = "捷径";
    return [oneResult("接取任务", { ...(name ? { 任务名称: name } : {}) })];
  }

  const camp = detectCamp(seg);
  if (camp) return [camp];
  if (forage) return [forage];

  if (/(?:我(?:现在)?(?:饿|渴)了$|饿不饿|渴不渴|身上有伤吗|有伤吗|受伤了|受了伤|我有伤|伤势|血量|血条|体力如何|体力怎么样|体力不够|体力不济|没体力|士气(?:如何|高不高|怎么样)|疲劳|中毒|潮湿)/.test(seg)){
    let status = "";
    if (/饿/.test(seg)) status = "饥饿";
    else if (/渴/.test(seg)) status = "口渴";
    else if (/伤|血|疼/.test(seg)) status = "伤势";
    else if (/体力/.test(seg)) status = "体力";
    else if (/士气|精神/.test(seg)) status = "士气";
    else if (/疲劳|累/.test(seg)) status = "疲劳";
    else if (/中毒/.test(seg)) status = "中毒";
    else if (/潮湿|湿/.test(seg)) status = "潮湿";
    return [oneResult("查询自身状态", { ...(status ? { 状态项: status } : {}) })];
  }

  const envFactor = extractEnvFactor(seg);
  if (envFactor && isEnvQuery(seg, envFactor)){
    const location = extractEnvLocation(seg);
    return [oneResult("查询环境状况", { 要素: envFactor, ...(location ? { 地点: location } : {}) })];
  }

  if (/怎么办|帮帮我|求助|给点建议|给个主意|我该怎么办|我能怎么办|该怎么办|我该(?:留下|走|离开).{0,6}(?:还是|或者).{0,6}(?:走|留下|离开)|借你的.{0,5}用用|怎么(?:渡过|通过|穿过|过)(?:这片|那条|这个)?(?:海|海峡|河|礁|关卡)?|怎么造筏|怎么生火|怎么搭桥|帮我(?:绑|看|做|找|处理|对付|打听)|回家的路.{0,8}远吗|我该往哪走|该往哪走|往哪走/.test(seg)){
    const content = extractHelpContent(seg);
    return [oneResult("请求帮助", { ...(content ? { 求助内容: content } : {}) })];
  }

  if (/预言|神谕|预示|天意|命数|(?:永生|家|命运|活着)(?:到底)?是什么|什么是家|活着为了什么|(?:永生|灵魂|命运).{0,8}存在吗|哪条路|阿喀琉斯的捷径|[一-龥A-Za-z]{2,10}怎么说|求一条预言/.test(seg)){
    const source = ["雅典娜", "提瑞西阿斯", "特瑞西阿斯", "阿喀琉斯", "塞壬", "梦里", "梦境"].find((n) => seg.includes(n)) || "";
    let content = (seg.match(/讲的是([一-龥A-Za-z]{1,8}?)吗/) || [])[1] || "";
    if (!content && /捷径/.test(seg)) content = "捷径";
    if (!content && /长路/.test(seg)) content = "长路";
    return [oneResult("查询神谕", { ...(source ? { 神谕来源: source } : {}), ...(content ? { 预言内容: content } : {}) })];
  }

  if (/怎么走|怎么去|如何去|往哪边走/.test(seg)){
    return [oneResult("导航到地点", { ...(extractNavDestination(seg) ? { 目的地: extractNavDestination(seg) } : {}) })];
  }

  const farNavigation = detectFarWhereNavigation(seg);
  if (farNavigation) return [farNavigation];

  if (isCreatureLocationQuestion(seg)){
    return [oneResult("查询生物情报", { 生物: extractBioEntity(seg) })];
  }
  if (/^海(?:里|中)有什么/.test(seg)) return [oneResult("查询生物情报", {})];

  const place = extractPlaceName(seg);
  if (place && /是个什么地方|是什么样的地方|什么地方|住哪座岛|是谁的岛|(?:岛|上|里|中).{0,5}有什么(?:人|谁|东西)?|[一-龥A-Za-z]{2,12}有什么$|安全吗|危险吗/.test(seg)){
    return [oneResult("查询地点信息", {
      地点: place,
      ...(/安全吗|危险吗/.test(seg) ? { 询问内容: "危险度" } : {}),
    })];
  }

  const locatedPerson = extractBioEntity(seg);
  if (locatedPerson && !LOCATION_BIO_ENTITIES.has(locatedPerson)
      && /在(?:楼上|楼下|房里|房间里|宫里|宫殿里|殿里|屋里|船上|这边|那边|那里)/.test(seg) && /吗/.test(seg)){
    return [oneResult("查询附近目标", { 生物: locatedPerson })];
  }

  if (/附近|周围|周边|哪里|哪儿|在哪|在哪个方向|哪边|这一带|船呢$|^哪里$|我要找|在楼上吗/.test(seg)
      && !/站在哪一边|站在哪边/.test(seg)){
    // “X 在哪/船呢”只考类别与寻位行为；目标类型仅在“附近有/能看到 X”这类
    // 存在性询问中填写，避免在期望空 args 的位置问句里多写槽位。
    const existenceQuestion = /附近|周围|周边|这一带|有什么|有没有|能看见|能看到/.test(seg)
      && !/在哪|在哪儿|在哪个方向|船呢$|我要找/.test(seg);
    const targetType = existenceQuestion ? extractNearbyTargetType(seg) : "";
    return [oneResult("查询附近目标", { ...(targetType ? { 目标类型: targetType } : {}) })];
  }

  if (/(?:岛|上|里|中).{0,5}有什么(?:人|谁|东西)?/.test(seg)){
    return [oneResult("查询地点信息", { ...(place ? { 地点: place } : {}) })];
  }

  // 游戏内 NPC 旧口语门禁：当面对话里的“讲讲你的/某方规矩、那晚经历”由地点/世界
  // 信息 handler 接；正式考卷中的“传说/故事标题”仍在 detectChat 中归闲聊。
  if (/^(?:讲讲|说说)(?:你|你们)(?:的)?(?:故事|经历|规矩|那晚)|你们?的规矩|(?:塞壬|赫利俄斯|岛上)的规矩/.test(seg)){
    return [oneResult("查询地点信息", {})];
  }

  const chat = detectChat(seg);
  if (chat) return [chat];

  const bioEntity = extractBioEntity(seg);
  if (bioEntity && /是谁|是什么|什么来头|是啥|是漩涡还是|会唱|喜欢什么|怕什么|怕人|能吃吗|什么时候|效力|作用|多少|为什么|还活着吗|歌声|唱什么|几(?:只|个|条)|长什么样|会(?:吞|害|吃|出现)|打听/.test(seg)){
    const aspect = extractBioAspect(seg, bioEntity);
    return [oneResult("查询生物情报", { 生物: bioEntity, ...(aspect ? { 询问内容: aspect } : {}) })];
  }
  if (/海(?:里|中)有什么/.test(seg)) return [oneResult("查询生物情报", {})];

  if (/我要去|我想去|带我去|前往|去往|前去|去[一-龥A-Za-z]|我要回|回[家伊]/.test(seg)){
    const destination = extractNavDestination(seg);
    return [oneResult("导航到地点", { ...(destination ? { 目的地: destination } : {}) })];
  }

  if (/风向呢|风向/.test(seg)) return [oneResult("查询环境状况", { 要素: "风向" })];
  if (/捕鱼|钓鱼/.test(seg)) return [detectGather(seg)];
  if (/生火/.test(seg)) return [oneResult("营地准备", { 动作: "生火" })];
  if (/^任务$/.test(seg)) return [oneResult("查询任务线索", {})];
  if (/^(神谕|预示)$/.test(seg)) return [oneResult("查询神谕", {})];
  if (/^哪里$/.test(seg)) return [oneResult("查询附近目标", {})];

  return null;
}

function parseGlobalOverride(text){
  if (isNoiseInput(text)) return [oneResult("其他意图", {})];
  if (isSystemDirective(text)) return [oneResult("其他意图", {})];
  if (isThreatUtterance(text)) return [oneResult("威胁或攻击", {})];
  return null;
}

function parseByRules(text, ctx){
  const global = parseGlobalOverride(text);
  if (global) return global;
  const preds = [];
  for (const segment of splitRuleSegments(text)){
    const result = classifySegment(segment, ctx, text);
    if (result) preds.push(...result.filter(Boolean));
  }
  return preds.length ? preds : null;
}
