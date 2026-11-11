/* ==================== 传闻系统（活的社会 · v1）====================
   对照 Generative Agents 记忆流 + AI Town 社交传播：
   玩家在某地做下的名声事件，沉淀为公开传闻；没见过玩家的 NPC 也能从“海路”听说。
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
   }
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
          const weight = (r.imp || 1) * (fresh ? 1 : 0.6) * (local ? 1.15 : 1);
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

    /* 转述口吻模板：本地事件用近距离语气，远道事件用“听海路来的”语气 */
    lineFor(entry) {
      const e = entry.r || entry;
      const prefix = entry.local
        ? "（他朝你这边偏了偏头）"
        : "（像是听海路来的风说的）";
      return prefix + "……" + (e.summary || "");
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = RUMOR;
  if (global) global.RUMOR = RUMOR;
})(typeof globalThis !== "undefined" ? globalThis : this);
