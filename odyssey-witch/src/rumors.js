/* ==================== 传闻系统（活的社会 · v1+v2）====================
   对照 Generative Agents 记忆流 + AI Town 社交传播：
   玩家在某地做下的名声事件，沉淀为公开传闻；没见过玩家的 NPC 也能从“海路”听说。
   v2：NPC 间多跳转述 gossipTick（hop 跳数/失真 vers 分级/传播半径）+ per-NPC 口吻变体 VOICE。
   本文件只放零 DOM、零存储的纯规则，便于 node:test 单测；浏览器挂 window.RUMOR，
   Node 侧 module.exports 同一份实现。

   传闻条目结构：
   {
     id:      稳定标识（去重键）
     t:       发生时间戳（Date.now）
     imp:     重要性 1..5（低于 MIN_IMP 的私事不扩散）
     place:   发生场景 key（与 NPC 所属场景比对 → 本地 / 远道语气）
     who:     当事人 NPC key（当事人本人记得，不算“听来的传闻”）；"any"=公开
     summary: ≤30 字传闻摘要
     heard:   已听过这条传闻的 NPC key 列表（防重复刷屏）
     hop:     跳数 0=亲历发布 1=一次转述 2=风闻（v2 gossipTick 维护，权重除以 1+hop）
     vers:    失真分级文本 [L0 原句, L1 据说+去数字, L2 主谓骨架]（v2，懒生成也可）
   */

(function (global) {
  const RUMOR = {
    MAX: 24,                                  /* 传闻账本上限（最老先淘汰） */
    MIN_IMP: 3,                               /* 低于此重要性的私事不扩散 */
    FRESH_MS: 7 * 24 * 3600 * 1000,           /* 新鲜窗口：窗口内权重 ×1 */

    /* 注册一条名声事件；同 id 去重——只刷新重要性与时间，不重复入账 */
    addRumor(rumors, entry) {
      if (!Array.isArray(rumors)) return rumors;
      const t = (entry.t && Number.isFinite(entry.t)) ? entry.t : Date.now();
      const ex = rumors.find(r => r.id === entry.id);
      if (ex) {
        ex.imp = Math.max(ex.imp || 1, entry.imp || 3);
        ex.t = t;
        if (entry.summary) ex.summary = entry.summary;
        if (entry.place) ex.place = entry.place;
        if (!Array.isArray(ex.heard)) ex.heard = [];
        return rumors;
      }
      rumors.push({
        id: entry.id,
        t,
        imp: entry.imp || 3,
        place: entry.place || "",
        who: entry.who || "any",
        summary: entry.summary || "",
        heard: [],
        hop: 0,
      });
      if (rumors.length > this.MAX) rumors.shift();
      return rumors;
    },

    /* 该 NPC 能听到的传闻候选（排除当事人自己那条），带权重与是否听过的标记 */
    forNpc(rumors, npcKey, npcScene, now) {
      if (!Array.isArray(rumors) || !npcKey) return [];
      now = (now && Number.isFinite(now)) ? now : Date.now();
      return rumors
        .filter(r => (r.imp || 1) >= this.MIN_IMP)
        .filter(r => r.who !== npcKey)
        .map(r => {
          const fresh = (now - (r.t || 0)) < this.FRESH_MS;
          const local = !!r.place && r.place === npcScene;
          /* v2：跳数衰减——转述次数越多权重越低（/1+hop），老传闻自然淡出 */
          const weight = (r.imp || 1) * (fresh ? 1 : 0.6) * (local ? 1.15 : 1) / (1 + (r.hop || 0));
          const heard = Array.isArray(r.heard) && r.heard.includes(npcKey);
          return { r, heard, weight, fresh, local };
        })
        .sort((a, b) => (a.heard ? 1 : 0) - (b.heard ? 1 : 0) || (b.weight - a.weight) || ((b.r.t || 0) - (a.r.t || 0)));
    },

    /* 挑一句该说的传闻：没听过的优先，其次权重最高的 */
    nextUnheard(rumors, npcKey, npcScene, now) {
      const all = this.forNpc(rumors, npcKey, npcScene, now);
      if (!all.length) return null;
      return all.find(x => !x.heard) || all[0];
    },

    /* 登记某 NPC 已听过该传闻（转述后调用，防重复刷屏） */
    markHeard(rumors, rumorId, npcKey) {
      const r = (rumors || []).find(x => x.id === rumorId);
      if (!r) return;
      if (!Array.isArray(r.heard)) r.heard = [];
      if (!r.heard.includes(npcKey)) {
        r.heard.push(npcKey);
        if (r.heard.length > 12) r.heard.shift();
      }
    },

    /* 该 NPC 累计听过多少条传闻（副标计数用） */
    heardCount(rumors, npcKey) {
      return (rumors || []).filter(r => Array.isArray(r.heard) && r.heard.includes(npcKey)).length;
    },

    /* v2 邻近表：场景→同岛邻近场景（传播半径与 v1 场景比对语义对齐，hades 冥界不与任何岛为邻） */
    NEAR: {
      aia: ["aeolia", "strait"], aeolia: ["aia", "strait"], strait: ["aeolia", "sun"],
      sun: ["strait", "ithaca"], ithaca: ["sun", "cyclops"], cyclops: ["ithaca", "lotus"],
      lotus: ["cyclops", "ismaros", "troy"], ismaros: ["lotus", "troy"], troy: ["ismaros", "lotus"],
      scheria: ["ogggia"], ogggia: ["scheria"], hades: [],
    },

    /* v2 传播半径：同场景 100%、同岛邻近 60%、跨海（含未知场景）30% */
    sceneRadius(fromScene, toScene) {
      if (!fromScene || !toScene) return 0.3;
      if (fromScene === toScene) return 1;
      return (this.NEAR[fromScene] || []).includes(toScene) ? 0.6 : 0.3;
    },

    /* v2 失真纯函数：去掉 ×N 倍数细节；中文数字/阿拉伯数字+量词 → “几”（只模糊化，不编造） */
    stripDetails(s) {
      let out = String(s || "");
      out = out.replace(/×\s*[0-9〇零一二两三四五六七八九十百千Nn]+/g, "");
      out = out.replace(/[0-9]+/g, "几");
      out = out.replace(/[〇零一二两三四五六七八九十百千]+(?=[只个名次夜天年头条枚把支封座间句步颗字行页位门扇双捆缕队群座山])/g, "几");
      return out;
    },

    /* v2 失真纯函数 L2：只留主谓骨架——去掉破折号/分号后的从句，超 12 字截断加“……” */
    skeletonize(s) {
      let out = this.stripDetails(s).split(/——|；/)[0];
      if (out.length > 12) out = out.slice(0, 12) + "……";
      return out;
    },

    /* v2 失真分级：L0 原句 / L1 “据说”+去数字细节 / L2 主谓骨架（lore 红线：只减法不编造） */
    versOf(summary) {
      return [String(summary || ""), "据说，" + this.stripDetails(summary), this.skeletonize(summary)];
    },

    /* v2 稳定取样：djb2 哈希——同一 (rumorId+npcKey) 每次取同一模板下标，不同对各异 */
    voicePick(str, n) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
      return h % n;
    },

    /* v2 口吻变体表：每个 NPC 2 套 {pre, post} 模板，贴人设；key 对齐 index.html 的 NPCS/NPC_SCENE */
    VOICE: {
      witch: [
        { pre: "（她搅药的手顿了顿）", post: "这种闲话，比曼陀草还提神。" },
        { pre: "（她笑了一下，火苗矮了半寸）", post: "记性好的人，别人替她记。" },
      ],
      seer: [
        { pre: "（杖尖在石上轻点）", post: "亡者早说过了——我只是重复。" },
        { pre: "（黑暗里水声一响）", post: "这件事，冥河也照见过。" },
      ],
      aeolus: [
        { pre: "（一阵风打着旋落下）", post: "这号事，风比我先知道。" },
        { pre: "（他袍子里的风涨了涨）", post: "风把这些话吹遍了十二座岛——痛快！" },
      ],
      siren: [
        { pre: "（歌声转了个调）", post: "我们把这一段也编进歌里了——听过的人都没走。" },
        { pre: "（雾里三道影子凑近了些）", post: "想听全的版本？靠近一点。" },
      ],
      cattle: [
        { pre: "（母牛慢慢嚼着草）", post: "牛的记性，比人长。" },
        { pre: "（牛群一齐抬起了头）", post: "太阳看着呢——都看着呢。" },
      ],
      calypso: [
        { pre: "（织机停了半拍）", post: "岛上的日子长，闲话也长得慢。" },
        { pre: "（她把线头咬断）", post: "七年才等到一个话题——慢慢说。" },
      ],
      nausicaa: [
        { pre: "（她眼睛亮了亮）", post: "真的假的？费埃克斯人就爱听这个。" },
        { pre: "（她把湿发拢到耳后）", post: "球场上都在传这件事呢。" },
      ],
      rebuilder: [
        { pre: "（他停下锤子）", post: "城里人都在说——说归说，城墙还得砌。" },
        { pre: "（他抹了把灰）", post: "烧过的城，闲话传得最快。" },
      ],
      lotusman: [
        { pre: "（他躺在花丛里笑）", post: "这些事听着像别人做的梦。" },
        { pre: "（他递过来一颗莲子）", post: "家嘛，听哪个版本都一样甜。" },
      ],
      polyphemus: [
        { pre: "（独眼上的旧疤动了动）", post: "这笔账，石头替我记着。" },
        { pre: "（羊群不安地挤成一团）", post: "浪底下那位，也听着呢。" },
      ],
      epeius: [
        { pre: "（他停下刨子）", post: "图纸不会说谎，闲话会。" },
        { pre: "（木花卷到脚边）", post: "全城都在传——比我的马传得还快。" },
      ],
      telemachus: [
        { pre: "（他按了按矛）", post: "这种事，我在每座岛都打听——你怎么不早说？" },
        { pre: "（他往前倾了倾身）", post: "要是我父亲的事，求你别停。" },
      ],
    },

    /* v2 NPC 间多跳转述：每个游戏日调用一次——imp≥3 且未传遍的传闻，按传播半径加权挑一个
       没听过的 NPC markHeard，该条 hop+1、t 刷新、挂 vers 分级。rng 注入保证单测确定性。 */
    gossipTick(rumors, npcs, now, rng) {
      if (!Array.isArray(rumors)) return rumors;
      const rand = rng || Math.random;
      now = (now && Number.isFinite(now)) ? now : Date.now();
      /* npcs 兼容两种形态：[{key, scene}] 数组，或 NPC_SCENE 式 {key: scene} 映射 */
      const list = Array.isArray(npcs)
        ? npcs
        : (npcs && typeof npcs === "object" ? Object.keys(npcs).map(k => ({ key: k, scene: npcs[k] })) : []);
      for (const r of rumors) {
        if ((r.imp || 1) < this.MIN_IMP) continue;                       /* 门槛：私事不扩散 */
        const cands = list.filter(n => n && n.key && n.key !== r.who
          && !(Array.isArray(r.heard) && r.heard.includes(n.key)));       /* 未传遍：还有没听过的 */
        if (!cands.length) continue;
        /* 传播半径加权随机选一人（同场景 1 / 邻近 0.6 / 跨海 0.3） */
        const ws = cands.map(n => this.sceneRadius(r.place, n.scene));
        let roll = rand() * ws.reduce((a, b) => a + b, 0);
        let pick = cands[cands.length - 1];
        for (let i = 0; i < cands.length; i++) { roll -= ws[i]; if (roll <= 0) { pick = cands[i]; break; } }
        this.markHeard(rumors, r.id, pick.key);
        r.hop = (r.hop || 0) + 1;
        r.t = now;
        r.vers = this.versOf(r.summary);
      }
      return rumors;
    },

    /* 转述口吻：hop 取失真层（0 原句 / 1 据说 / 2 骨架）；有 VOICE 表的 NPC 按稳定取样取模板，
       本地事件用近距离语气，远道事件用“听海路来的”语气；无 voice 的 key 走 v1 通用口吻 */
    lineFor(entry, npcKey) {
      const e = entry.r || entry;
      const vers = (Array.isArray(e.vers) && e.vers.length === 3) ? e.vers : this.versOf(e.summary || "");
      const base = vers[Math.min(e.hop || 0, 2)];
      const prefix = entry.local
        ? "（他朝你这边偏了偏头）"
        : "（像是听海路来的风说的）";
      const v = (npcKey && this.VOICE[npcKey]) || null;
      if (!v) return prefix + "……" + base;
      const tpl = v[this.voicePick(String(e.id || "") + "|" + npcKey, v.length)];
      const gap = /[。！？…”」]$/.test(base) ? "" : "。";   /* 摘要句尾无标点时补句号再接后缀 */
      return tpl.pre + "……" + base + gap + tpl.post;
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = RUMOR;
  if (global) global.RUMOR = RUMOR;
})(typeof globalThis !== "undefined" ? globalThis : this);
