// ============================================================
// 奥德赛 · UI 层 —— 面板 + 触屏 + 音频 + 画质
// 依赖 src/data/* + src/engine/core.js + src/render/scenes.js + src/interact/handlers.js
// ============================================================

// --- touchInit (was main+364-402, 39 lines) ---
function touchInit(){
  const ui = document.getElementById("touchUI");
  if (!ui) return;
  const coarse = matchMedia && matchMedia("(pointer: coarse)").matches || ("ontouchstart" in window && navigator.maxTouchPoints > 0);
  if (!coarse) return;
  ui.style.display = "block";
  document.body.classList.add("touch");
  /* 触屏不该看到键盘键位；把提示换成手上的操作 */
  const keysEl = document.getElementById("keys");
  if (keysEl) keysEl.textContent = "左下摇杆移动 · 右侧按钮互动 / 海图 / 背包 · 点地面也能走";
  document.querySelectorAll(".tsTip").forEach(el=>{
    el.textContent = "触屏：左下摇杆移动 · 右下按钮互动 · 海图在右上";
  });
  const base = document.getElementById("joyBase"), knob = document.getElementById("joyKnob");
  const joyKeys = {up:"w", down:"s", left:"a", right:"d"};
  const clearJoy = ()=>{ for (const k of Object.values(joyKeys)) keys.delete(k); knob.style.left="50%"; knob.style.top="50%"; };
  let joyId = null;
  const onMove = (t)=>{
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width/2, len = Math.hypot(dx,dy);
    if (len > max){ dx = dx/len*max; dy = dy/len*max; }
    knob.style.left = `calc(50% + ${dx}px)`; knob.style.top = `calc(50% + ${dy}px)`;
    const dead = max*0.22;
    keys.delete("w"); keys.delete("s"); keys.delete("a"); keys.delete("d");
    if (dy < -dead) keys.add("w");
    if (dy >  dead) keys.add("s");
    if (dx < -dead) keys.add("a");
    if (dx >  dead) keys.add("d");
  };
  base.addEventListener("touchstart", (e)=>{ e.preventDefault(); const t=e.changedTouches[0]; joyId=t.identifier; onMove(t); }, {passive:false});
  base.addEventListener("touchmove", (e)=>{ e.preventDefault(); for (const t of e.changedTouches) if (t.identifier===joyId) onMove(t); }, {passive:false});
  const endJoy = (e)=>{ for (const t of e.changedTouches) if (t.identifier===joyId){ joyId=null; clearJoy(); } };
  base.addEventListener("touchend", endJoy);
  base.addEventListener("touchcancel", endJoy);
  const bindTap = (id, fn)=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", (e)=>{ e.preventDefault(); if (!askOn) fn(); }, {passive:false});
  };
  bindTap("tBtnE", pressE);
  bindTap("tBtnMap", ()=>{ if (!chapterOn){ mapOpen ? closeMap() : openMap(); } });
  bindTap("tBtnBag", ()=>{ document.getElementById("bagBtn").click(); });
  /* 竖屏提示：给一条「仍要竖屏」的出路——提示只劝不拦，玩家点掉后本次会话不再出现 */
  const rhGo = document.getElementById("rhGo");
  if (rhGo){
    rhGo.addEventListener("click", ()=>{
      document.body.classList.add("rhDismissed");
      try{ sessionStorage.setItem("odyssey-rh-dismissed","1"); }catch(e){}
    });
  }
  try{ if (sessionStorage.getItem("odyssey-rh-dismissed")==="1") document.body.classList.add("rhDismissed"); }catch(e){}
  window.addEventListener("blur", clearJoy);
}


// --- clearJoy (was main+372-372, 1 lines) ---
  const clearJoy = ()=>{ for (const k of Object.values(joyKeys)) keys.delete(k); knob.style.left="50%"; knob.style.top="50%"; };


// --- onMove (was main+374-387, 14 lines) ---
  const onMove = (t)=>{
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width/2, len = Math.hypot(dx,dy);
    if (len > max){ dx = dx/len*max; dy = dy/len*max; }
    knob.style.left = `calc(50% + ${dx}px)`; knob.style.top = `calc(50% + ${dy}px)`;
    const dead = max*0.22;
    keys.delete("w"); keys.delete("s"); keys.delete("a"); keys.delete("d");
    if (dy < -dead) keys.add("w");
    if (dy >  dead) keys.add("s");
    if (dx < -dead) keys.add("a");
    if (dx >  dead) keys.add("d");
  };


// --- endJoy (was main+390-390, 1 lines) ---
  const endJoy = (e)=>{ for (const t of e.changedTouches) if (t.identifier===joyId){ joyId=null; clearJoy(); } };


// --- bindTap (was main+393-397, 5 lines) ---
  const bindTap = (id, fn)=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", (e)=>{ e.preventDefault(); if (!askOn) fn(); }, {passive:false});
  };


// --- loadAudioPrefs (was main+477-487, 11 lines) ---
function loadAudioPrefs(){
  try{
    const d = JSON.parse(localStorage.getItem(AUDIO_PREF_KEY)||"null");
    if (d){
      if (typeof d.sndOn==="boolean") sndOn = d.sndOn;
      for (const k of ["volMaster","volSfx","volAmb"]){
        if (typeof d[k]==="number" && d[k]>=0 && d[k]<=1) audioPrefs[k] = d[k];
      }
    }
  }catch(e){}
}


// --- saveAudioPrefs (was main+488-490, 3 lines) ---
function saveAudioPrefs(){
  try{ localStorage.setItem(AUDIO_PREF_KEY, JSON.stringify({sndOn, ...audioPrefs})); }catch(e){}
}


// --- loadQualityPrefs (was main+498-500, 3 lines) ---
function loadQualityPrefs(){
  try{ const m = localStorage.getItem(QUALITY_KEY); if (m==="3d"||m==="2d"||m==="auto") qualityMode = m; }catch(e){}
}


// --- saveQualityPrefs (was main+501-501, 1 lines) ---
function saveQualityPrefs(){ try{ localStorage.setItem(QUALITY_KEY, qualityMode); }catch(e){} }


// --- applyQuality (was main+503-509, 7 lines) ---
function applyQuality(silent){
  const cv3 = document.getElementById("cv3d");
  if (cv3) cv3.style.display = (qualityMode==="2d") ? "none" : "";
  const qb = document.getElementById("qualBtn");
  if (qb) qb.textContent = qualityMode==="2d" ? "画质·2D" : "画质·3D";
  if (!silent) toast(qualityMode==="2d" ? "已切到 2D 海图——更流畅。" : "已切到 3D 海图。");
}


// --- qualityCycle (was main+516-520, 5 lines) ---
function qualityCycle(){
  qualityMode = qualityMode==="2d" ? "3d" : "2d";
  qualityDegrade = qualityMode==="2d" ? 2 : 0;
  saveQualityPrefs(); applyQuality(false);
}


// --- perfToggle (was main+521-525, 5 lines) ---
function perfToggle(){
  perfOn = !perfOn;
  const b = document.getElementById("perfBadge");
  if (b) b.style.display = perfOn ? "block" : "none";
}


// --- applyVolumes (was main+526-531, 6 lines) ---
function applyVolumes(){
  if (sfxGain) sfxGain.gain.value = 0.5 * audioPrefs.volMaster * audioPrefs.volSfx;
  /* ambGain 由 ambTick 的 ducking 泛写，音量系数在 tick 内乘 audioPrefs.volAmb */
  const sb=document.getElementById("sndBtn");
  if (sb){ sb.textContent = sndOn ? "🔊 音效" : "🔇 音效"; }
}


// --- audioInit (was main+546-555, 10 lines) ---
function audioInit(){
  if (AC) return AC;
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    sfxGain = AC.createGain(); sfxGain.connect(AC.destination);
    ambGain = AC.createGain(); ambGain.gain.value = 0;   ambGain.connect(AC.destination);
    applyVolumes();
  }catch(e){}
  return AC;
}


// --- sndToggle (was main+561-566, 6 lines) ---
function sndToggle(){
  sndOn = !sndOn;
  applyVolumes(); saveAudioPrefs();
  document.getElementById("sndBtn").textContent = sndOn ? "🔊 音效" : "🔇 音效";
  if (sndOn){ audioInit(); lastAmbScene = null; }   /* 重开后环境层自动重建 */
}


// --- audioPanelToggle (was main+568-578, 11 lines) ---
function audioPanelToggle(){
  const p = document.getElementById("audioPanel");
  const open = p.style.display !== "block";
  p.style.display = open ? "block" : "none";
  if (open){
    for (const k of ["volMaster","volSfx","volAmb"]){
      const el = document.getElementById("ap_"+k);
      if (el){ el.value = Math.round(audioPrefs[k]*100); const v=document.getElementById("apv_"+k); if (v) v.textContent = el.value+"%"; }
    }
  }
}


// --- audioSet (was main+579-585, 7 lines) ---
function audioSet(key, raw){
  const v = Math.max(0, Math.min(100, Number(raw)||0));
  audioPrefs[key] = v/100;
  const lab = document.getElementById("apv_"+key);
  if (lab) lab.textContent = v+"%";
  applyVolumes(); saveAudioPrefs();
}


// --- settingsToggle (was main+587-592, 6 lines) ---
function settingsToggle(){
  const p = document.getElementById("settingsPanel");
  const open = p.style.display !== "block";
  p.style.display = open ? "block" : "none";
  if (open){ const ap = document.getElementById("audioPanel"); if (ap) ap.style.display = "none"; }
}
function exportSave(){
  try{
    const blob=new Blob([exportSaveData()],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    const d=new Date(), pad=n=>String(n).padStart(2,"0");
    const stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    a.href=url; a.download=`odyssey-med-v${SAVE_VERSION}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast("航程已导出为 JSON 存档。把它收好，海会等你回来。");
  }catch(e){ toast("导出失败：浏览器未能创建存档文件。"); }
}
async function importSaveFile(input){
  const file=input.files&&input.files[0];
  if (!file) return;
  try{
    const raw=await file.text();
    if (!parseSave(raw)){ toast("无法导入：文件无效，或来自更新版本的游戏。当前航程未改动。"); return; }
    if (!importSaveData(raw)){ toast("导入失败：浏览器未能写入存档。当前航程未改动。"); return; }
    toast("存档已导入，正在重新启航。");
    location.reload();
  }catch(e){ toast("读取存档失败。当前航程未改动。"); }
  finally{ input.value=""; }
}


// --- getNoise (was main+602-608, 7 lines) ---
function getNoise(){
  if (noiseBuf) return noiseBuf;
  noiseBuf = AC.createBuffer(1, AC.sampleRate*2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return noiseBuf;
}


// --- setAmbience (was main+609-698, 90 lines) ---
function setAmbience(){
  if (!AC || !sndOn) return;
  if (ambCfg){ try{ ambCfg.stop(); }catch(e){} }
  const nodes = [];
  const keep = (x)=>{ nodes.push(x); return x; };
  if (scene === "hades"){
    /* 冥界：55Hz 失谐双振低鸣 + 暗噪声 */
    const g = keep(AC.createGain()); g.gain.value = 0.045; g.connect(ambGain);
    for (const fq of [55, 55.7]){
      const o = AC.createOscillator(); o.type="sine"; o.frequency.value = fq;
      o.connect(g); o.start(); keep(o);
    }
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=180;
    const ng = AC.createGain(); ng.gain.value = 0.05;
    n.connect(f); f.connect(ng); ng.connect(ambGain); n.start();
    keep(n);
  } else if (scene === "strait"){
    /* 声之海峡：雾海低涌（lowpass 噪声）+ 幽微歌声泛音（312/397Hz 失谐颤音） */
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=300;
    const g = AC.createGain(); g.gain.value = 0.05;
    n.connect(f); f.connect(g); g.connect(ambGain); n.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.11;
    const lg = AC.createGain(); lg.gain.value = g.gain.value*0.7;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    keep(n); keep(lfo);
    for (const [fq,amp] of [[312,0.012],[397,0.009]]){
      const o = AC.createOscillator(); o.type="sine"; o.frequency.value=fq;
      const og = AC.createGain(); og.gain.value=amp;
      const vib = AC.createOscillator(); vib.frequency.value=4.6;
      const vg2 = AC.createGain(); vg2.gain.value=fq*0.008;
      vib.connect(vg2); vg2.connect(o.frequency);
      o.connect(og); og.connect(ambGain); o.start(); vib.start();
      keep(o); keep(vib);
    }
  } else if (scene === "sun"){
    /* 太阳岛：暖风低吟（lowpass 噪声，柔）+ 金色微颤（523/526Hz 失谐极轻）——晴日牧场 */
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=500;
    const g = AC.createGain(); g.gain.value = 0.03;
    n.connect(f); f.connect(g); g.connect(ambGain); n.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.09;
    const lg = AC.createGain(); lg.gain.value = g.gain.value*0.6;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    keep(n); keep(lfo);
    for (const [fq,amp] of [[523,0.006],[526,0.005]]){
      const o = AC.createOscillator(); o.type="sine"; o.frequency.value=fq;
      const og = AC.createGain(); og.gain.value=amp;
      o.connect(og); og.connect(ambGain); o.start();
      keep(o);
    }
  } else if (scene === "ogggia"){
    /* 奥吉吉亚：暮色暖浪（lowpass 噪声，柔）+ 极轻钟琴泛音（523/659Hz）——冻结的一天的声音 */
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=380;
    const g = AC.createGain(); g.gain.value = 0.032;
    n.connect(f); f.connect(g); g.connect(ambGain); n.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
    const lg = AC.createGain(); lg.gain.value = g.gain.value*0.75;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    keep(n); keep(lfo);
    for (const [fq,amp] of [[523,0.0045],[659,0.003]]){
      const o = AC.createOscillator(); o.type="sine"; o.frequency.value=fq;
      const og = AC.createGain(); og.gain.value=amp;
      o.connect(og); og.connect(ambGain); o.start();
      keep(o);
    }
  } else {
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value = scene==="world"?420:360;
    const g = AC.createGain(); g.gain.value = scene==="world"?0.05:0.038;
    n.connect(f); f.connect(g); g.connect(ambGain); n.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.13;
    const lg = AC.createGain(); lg.gain.value = g.gain.value*0.7;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    keep(n); keep(lfo);
    /* 风：bandpass 噪声 + 慢 LFO */
    const wn = AC.createBufferSource(); wn.buffer = getNoise(); wn.loop = true;
    const wf = AC.createBiquadFilter(); wf.type="bandpass"; wf.frequency.value=900; wf.Q.value=2.2;
    const wg = AC.createGain(); wg.gain.value = 0.02;
    wn.connect(wf); wf.connect(wg); wg.connect(ambGain); wn.start();
    const wlfo = AC.createOscillator(); wlfo.frequency.value = 0.07;
    const wlg = AC.createGain(); wlg.gain.value = 0.012;
    wlfo.connect(wlg); wlg.connect(wg.gain); wlfo.start();
    keep(wn); keep(wlfo);
  }
  ambCfg = { stop(){ nodes.forEach(x=>{ try{x.stop();}catch(e){} try{x.disconnect();}catch(e){} }); } };
  sfx(scene==="hades" ? "dash" : "pick");
}


// --- landfallTarget (was main+1305-1313, 9 lines) ---
/* 简报该讲哪一站：
   旧版只看「几何上最近的岛」——出生点(22,11)离声之海峡只有 89px，于是开局第一秒
   弹出来的靠岸简报是第三章的赌注/回报，还写着「先去冥界问路」，与罗盘
   「特洛伊 · 夜袭」当场打架。现在：能登的岛 > 主线目标岛 > 最近的岛（锁着就只留一句）。 */
function landfallTarget(){
  const near = islandNear();
  if (near && islandOpen(near)) return {is:near, mode:"near"};
  const obj = objectiveIsland(nextObjective());
  if (obj) return {is:obj, mode:"goal"};
  return near ? {is:near, mode:"locked"} : null;
}


// --- renderLandfallBrief：接近岛屿即亮明这一站的赌注与回报，不新增模态打断 ---
let _landfallKey="";
function renderLandfallBrief(is){
  const el=document.getElementById("landfallBrief");
  if (!el) return;
  const questOpen=document.getElementById("questPanel").style.display==="block";
  const show=!!(is && scene==="world" && !titleOn && !dlgOpen && !mapOpen && !chapterOn && !questOpen && state.openingBeat>=3);
  if (!show){ el.classList.remove("show"); el.setAttribute("aria-hidden","true"); _landfallKey=""; return; }
  const kicker = el.querySelector(".lfKicker");
  let action;
  if (is.mode==="goal"){
    /* 还没靠近目标岛：讲下一站的赌注与回报，但不谎称「E · 登陆」 */
    action = `尚未靠近 · 跟着罗盘上的航向走 ⛵`;
    if (kicker) kicker.textContent = "下 一 站 · NEXT STOP";
  } else if (is.mode==="locked"){
    /* 锁着的岛：只留一句，不剧透赌注/回报，也不给「先去某某问路」的岔路指引 */
    action = `航路尚未开放 · ${(GATES[is.is.scene]&&GATES[is.is.scene].hint)||"先去该去的地方"}`;
    if (kicker) kicker.textContent = "远 处 的 岛 · OFF ROUTE";
  } else {
    const open=islandOpen(is.is), gate=GATES[is.is.scene];
    action = open ? `E · 登陆 ${is.is.name}　｜　${is.is.note}` : `了望 · ${(gate&&gate.hint)||"航路尚未开放"}`;
    if (kicker) kicker.textContent = "靠 岸 简 报 · LANDFALL";
  }
  const key=[is.is.scene,is.mode,action].join("|");
  if (key===_landfallKey) return;
  _landfallKey=key;
  document.getElementById("lfName").textContent=is.is.name;
  document.getElementById("lfStake").textContent = is.mode==="locked" ? "——" : is.is.stake;
  document.getElementById("lfReward").textContent = is.mode==="locked" ? "——" : is.is.reward;
  document.getElementById("lfAction").textContent=action;
  el.classList.add("show"); el.setAttribute("aria-hidden","false");
}


// --- updateHintDOM (was main+1329-1372, 44 lines) ---
function updateHintDOM(){
  const questOpen=document.getElementById("questPanel").style.display==="block";
  if (scene!=="world") renderLandfallBrief(null);
  zoneEl.textContent = scene==="world" ? "地中海 · 航行中" : scene==="hades" ? "冥界 · 俄刻阿诺斯之岸" : scene==="aeolia" ? "风神岛 · 十二风的浮狱" : scene==="strait" ? "声之海峡 · 塞壬的歌" : scene==="sun" ? "太阳岛 · 赫利俄斯的牧场" : scene==="ogggia" ? "奥吉吉亚 · 冻结的金色暮光" : scene==="scheria" ? "斯克里岛 · 费埃克斯的白港" : scene==="ithaca" ? "伊萨卡 · 归乡，或者不归" : scene==="ismaros" ? "伊斯玛洛斯 · 贪的第一课" : scene==="lotus" ? "食莲岛 · 忘忧的甜" : scene==="cyclops" ? "独眼巨人之岛 · 无人之名" : scene==="telepylos" ? "忒勒皮洛斯 · 悬崖之城" : scene==="troy" ? "特洛伊海岸 · 木马之夜" : "埃阿亚岛 · 女巫的领地";
  if (scene==="world"){
    const is = islandNear();
    renderLandfallBrief(landfallTarget());
    if (is && !dlgOpen && !chapterOn && !questOpen){
      const open = islandOpen(is);
      /* 锁着的岛要说清「航路未开」：只写「了望 X」会让玩家以为按 E 就能登，
         实际按下去得到的是「先去某某问路」，两边像在说两件事。 */
      const txt = open ? `<b>E</b> · 登陆 ${is.name}` : `<b>E</b> · 了望 ${is.name}（航路未开）`;
      if (hintEl.dataset.k !== txt){ hintEl.dataset.k = txt; hintEl.innerHTML = txt; }   /* 去抖：同文案不重写 DOM（每帧 innerHTML 会触发无谓的解析/布局） */
      hintEl.style.display="block";
      if (w3dActive()){ hintEl.style.left="50%"; hintEl.style.top="74%"; }   /* 3D 世界图：2D 投影坐标不适用，固定底部居中 */
      else { const [hx,hy]=w2s(is.gx*WTS+WTS/2, is.gy*WTS); hintEl.style.left=(hx*100)+"%"; hintEl.style.top=(hy*100)+"%"; }
    } else if (!dlgOpen && !chapterOn && !questOpen && !FISH.on){
      const d = driftNear();
      const pod = podNear();   /* 批次 J4：海豚群提示优先于钓鱼 */
      if (pod && !d){
        const txt = `<b>E</b> · 海豚群（并行一段）`;
        if (hintEl.dataset.k !== txt){ hintEl.dataset.k = txt; hintEl.innerHTML = txt; }
        hintEl.style.display="block";
        hintEl.style.left="50%"; hintEl.style.top="74%";
      } else if (d){
        const txt = `<b>F</b> · 打捞 ${d.kind==="bottle"?"漂流瓶":"木箱"}`;
        if (hintEl.dataset.k !== txt){ hintEl.dataset.k = txt; hintEl.innerHTML = txt; }
        hintEl.style.display="block";
        if (w3dActive()){ hintEl.style.left="50%"; hintEl.style.top="74%"; }
        else { const [hx,hy]=w2s(d.x, d.y-16); hintEl.style.left=(hx*100)+"%"; hintEl.style.top=(hy*100)+"%"; }
      } else {
        const txt = `<b>F</b> · 抛竿钓鱼（三中得鱼）`;
        if (hintEl.dataset.k !== txt){ hintEl.dataset.k = txt; hintEl.innerHTML = txt; }
        hintEl.style.display="block";
        hintEl.style.left="50%"; hintEl.style.top="88%";
      }
    } else hintEl.style.display="none";
    ambEl.style.display="none";
    return;
  }
  const s = aiaNear();
  if (s && !dlgOpen){
    hintEl.style.display="block";
    hintEl.innerHTML = `<b>E</b> · ${s.label}`;
    const [hx,hy]=w2s(s.x, s.y-30);
    hintEl.style.left = (hx*100)+"%"; hintEl.style.top  = (hy*100)+"%";
  } else hintEl.style.display="none";
  const nearWitch = scene==="aia" && Math.hypot(aiaPlayer.x-witch.x, aiaPlayer.y-witch.y) < 150;
  if (!nearWitch && ambEl.style.display!=="none" && !ambActive) ambEl.style.display="none";
}


// --- grab3dImage (was main+1389-1399, 11 lines) ---
function grab3dImage(){
  return new Promise((res) => {
    if (!w3dActive() || !window.W3D || !W3D.grabFrame) return res(null);
    const url = W3D.grabFrame();
    if (!url) return res(null);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}


// --- download (was main+1438-1446, 9 lines) ---
      const download = ()=>{
        try{
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = "odyssey-航迹.png";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
          sfx("pick"); toast("航迹卡片已保存到下载。发给那个会懂的人。");
        }catch(e){ toast("分享失败——试试截图键，海不会怪你。"); }
      };


// --- buildMapMarks (was main+1504-1523, 20 lines) ---
function buildMapMarks(){
  const obj=nextObjective();
  const lc=document.getElementById("legsCnt");
  if (lc){ const total=Object.keys(LEG_SEQ).length; lc.textContent=`奥德修斯航迹 ${legsVisitedCount()}/${total}`; }
  document.getElementById("mapMarks").innerHTML = ISLANDS.map((is,i)=>{
    const open = islandOpen(is);
    const isNext = !!(obj && obj.k && is.scene===obj.k);
    const legBadge = (typeof is.leg==="number") ? `<div class="lg">#${is.leg}</div>` : "";
    /* B2：六段旧路已并入主线，海图上不再有「可选」徽章 */
    /* 批次 H1 快速直航：航序已点亮 + 门已开 → 海图上可点直航（Wind Waker 传送鱼 / 80 Days 航线惯例：
       去过才解锁、直航耗时间与补给、门控不绕过） */
    const visited = !!state.legs[is.scene];
    const canFT = visited && open && is.scene!=="strait";
    const ftBadge = canFT ? `<div class="ft">⛵ 直航</div>` : "";
    const stText = isNext ? "▶ 航向" : visited ? "已到过" : "";
    return `<div class="mapMark${open?"":" locked"}${isNext?" next":""}${canFT?" ftok":""}" data-scene="${is.scene}" style="left:${is.mp[0]}%; top:${is.mp[1]}%;">
      ${legBadge}${ftBadge}<div class="pin"></div><div class="nm">${is.name}</div>
      <div class="st">${stText}</div>
    </div>`;}).join("");
}


// --- buildLyric (was main+1604-1622, 19 lines) ---
function buildLyric(){
  /* P1.4 记忆支付：已付给亡者的记忆不再被塞壬唱出（碎片"已支付"→缺页） */
  const mems = state.memory.slice(-8).filter(m=>m.text.length>4 && !(state.paidMem||[]).includes(m.text));
  const uniq = [...new Set(mems.map(m=>m.text))];   /* 去重：同一句记忆不唱两遍 */
  const pick = (i) => uniq.length ? uniq[i % uniq.length].replace(/^旅人/,"").slice(0,14) : null;
  const m1 = pick(Math.floor(Math.random()*uniq.length)), m2 = pick(Math.floor(Math.random()*uniq.length)+1);
  const q = Object.values(state.quests||{}).find(v=>!v.done);
  const heart = state.prophecy ? (state.prophecy==="long"?"那条更长更暗的路":"那个浪头上的名字") : "一个记不清的地名";
  if (!m1 && !m2) return "……\n\n她们张开了嘴，唱出来的竟是空白。\n（你的故事里还没有多少可唱的事——空白也是歌。）";
  return [
    "漂泊的人，海听见你——",
    m1 ? `　「${m1}」，你说过的，浪都记得；` : null,
    m2 ? `　「${m2}」，你以为没人看见，礁石看见了；` : null,
    `　你的行囊里装着${q?`没做完的「${q.name}」`:"半个家"}，`,
    `　你的心里悬着${heart}。`,
    "回头吧，岸上有灯；",
    "不回头，就唱着你的名字过海峡。"
  ].filter(Boolean).join("\n");
}


// --- buildSong2 (was main+1626-1647, 22 lines) ---
function buildSong2(){
  const CH = {witch:"女巫的账", hades:"亡者之言", aeolia:"风的账", strait:"声之海峡", sun:"太阳岛"};
  const told = state.talesTold.map(id=>`　${CH[id]||id}，是真的——他就是这样走过来的；`);
  if (!told.length && !state.selfRevealed) return "……\n\n盲歌手拨了拨琴：\n「这位旅人的故事里，只有吹牛的部分。\n歌不唱牛——回去，把真的讲给篝火听。」";
  /* P0.7/P1.5：当众自白后，歌名与内容升级为《奥德修斯之歌》 */
  const head = state.selfRevealed ? "　特洛伊是真的——木马是他自己想的；黑夜是他自己领的；" : null;
  const nameLine = (state.chosenName||state.sunName||state.calypsoName)
    ? `　唱到名字那一段——请安静：他叫「${state.chosenName||state.sunName||state.calypsoName}」。`
    : state.selfRevealed
      ? "　唱到名字那一段——请安静：他叫「奥德修斯」。当着全厅的火光，他自己说的。"
      : "　唱到名字那一段——请安静：他还无名，或还未认。";
  if (!told.length) return ["听吧，费埃克斯的厅堂——", head, nameLine, "歌完了。被唱出来的，就被记得。"].filter(Boolean).join("\n");
  return [
    "听吧，费埃克斯的厅堂——",
    ...(head?[head]:[]),
    ...told,
    told.length<5 ? `　还有 ${5-told.length} 段，他笑着吹了牛——歌替他咽了回去；` : "　五段全是真的——琴弦都在发抖；",
    `　他${state.guest?"差点留下做客卿":"没留下做客卿"}，他${state.homeAnswer?`说要回「${state.homeAnswer}」`:"还没说出家在哪"}，`,
    nameLine,
    "歌完了。被唱出来的，就被记得。"
  ].join("\n");
}


// --- exportLyric (was main+1649-1661, 13 lines) ---
function exportLyric(){
  try{
    const ttl = (document.getElementById("lyricTitle").textContent||"");
    const isOdysseus = ttl.includes("奥德修斯");            /* P0.7：自白后导出名变《奥德修斯之歌》 */
    const isSong2 = isOdysseus || ttl.includes("无名");
    const who = isOdysseus ? "奥德修斯" : "无名旅人";
    const blob = new Blob(["《奥德赛》航程记 · " + who + "\n\n" + lastLyric + "\n\n—— " + (isSong2?"德摩多科斯，唱于斯克里岛":"塞壬三姐妹，唱于声之海峡") + "\n"], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = isOdysseus ? "奥德修斯之歌.txt" : isSong2 ? "无名旅人之歌.txt" : "塞壬之歌.txt";
    a.click(); URL.revokeObjectURL(a.href);
  }catch(e){}
}


function renderOnboarding(){
  const card=document.getElementById("onboardingCard");
  if (!card) return;
  const ob=state.onboarding;
  card.hidden=!ob || ob.done || titleOn;
  if (card.hidden) return;
  const steps=[
    ["第一步 · 解开船绳","WASD / 方向键开船。先让船真正动起来，海会回应你。"],
    ["第二步 · 第一次靠岸","东边的特洛伊还停着你的十二艘船。跟着航向，靠近海岸后按 E 靠岸。"],
    ["第三步 · 看清航路","按 Q 打开任务日志，或按 M 展开海图。你的下一步会记在那里。"],
  ];
  const step=steps[ob.step]||steps[0];
  document.getElementById("onboardingStep").textContent=step[0];
  document.getElementById("onboardingText").textContent=step[1];
  card.querySelectorAll(".obDot").forEach((dot,i)=>dot.classList.toggle("on",i<=ob.step));
}

/* ==================== 开场微节拍（第一阶段·视觉与开场） ====================
   设计意图：前三十秒先给「操作 → 反馈」，故事不撤、只改成可选深入。
   节拍：0 划桨（真实移动）→ 1 看海（真实开图/靠岸）→ 2 船歌（听 / 先走）。
   进度存 state.openingBeat；老档在 ensureState 里直接视为看完。 ==================== */
const OPENING_BEATS = [
  {
    kicker:"序章 · 第一桨",
    text:"船板在脚下滑了一下。绳子还系在岸桩上——先让它松，海才会开始动。",
    hint:"按住 D / → 划出第一桨",
    btns:[],
  },
  {
    kicker:"序章 · 海面之上",
    text:"十二艘船在黑水上排开。你还不认得这条海，它已经认得你了。",
    hint:"按 M 展开海图 · 靠近特洛伊后按 E 靠岸",
    btns:[{t:"展开海图",fn:"openMap()"}],
  },
  {
    kicker:"序章 · 船歌",
    text:"有人在船尾低低地唱。词听不清，调子像家门口的风。",
    hint:"听完，或先把桨握稳——两条路都不耽误出海。",
    btns:[
      {t:"听下去（序章 · 文字）",cls:"primary",fn:"openingSong()"},
      {t:"先划桨，歌留着",fn:"openingFinish()"},
    ],
  },
];
const OPENING_SONG =
  "桨呀，别问岸在哪\n浪把名字磨成沙\n谁把真名交给海\n海就送谁回家\n\n"+
  "你摸到一块漂来的船板，上面刻着一行字：记得回家。\n"+
  "你把它翻过来又翻回去——海把你送到哪，这句话就跟到哪。";

function renderOpening(){
  const card=document.getElementById("openingCard");
  if (!card) return;
  const b = state.openingBeat;
  const show = !titleOn && b!==undefined && b<3;
  card.classList.toggle("show", show);
  if (!show) return;
  const beat = OPENING_BEATS[b] || OPENING_BEATS[0];
  document.getElementById("opKicker").textContent = beat.kicker;
  document.getElementById("opText").textContent = beat.text;
  document.getElementById("opHint").textContent = beat.hint || "";
  document.getElementById("opBtns").innerHTML = beat.btns
    .map(o=>`<button class="${o.cls||""}" onclick="${o.fn}">${o.t}</button>`).join("");
  document.getElementById("opSong").classList.remove("show");
  document.querySelectorAll("#opDots i").forEach((dot,i)=>dot.classList.toggle("on",i<=b));
}

/* 「听下去」：把原序章的文字原样展开——不砍内容，只把交付顺序交给玩家 */
function openingSong(){
  const song=document.getElementById("opSong");
  if (!song) return;
  song.textContent = OPENING_SONG;
  song.classList.add("show");
  document.getElementById("opHint").textContent = "读完收起，海上见。";
  document.getElementById("opBtns").innerHTML =
    `<button class="primary" onclick="openingFinish()">收起船歌，出海</button>`;
  document.querySelectorAll("#opDots i").forEach((dot,i)=>dot.classList.toggle("on",i<=2));
}

function openingFinish(){
  state.openingBeat = 3;
  save();
  renderOpening();
}

function openingSkip(){
  state.openingBeat = 3;
  save();
  renderOpening();
}

/* 航海日记：七条数值不消失，只是收回一张纸里（主界面只留三条关键状态） */
function hudLogToggle(){
  const log=document.getElementById("hudLog");
  if (!log) return;
  const open = log.classList.toggle("open");
  log.setAttribute("aria-hidden", open ? "false" : "true");
  const btn=document.getElementById("hudLogBtn");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

// --- bagText (was main+1932-1932, 1 lines) ---
function bagText(){ const ks=Object.keys(state.backpack); return ks.length?ks.map(k=>`${k}×${state.backpack[k]}`).join("、"):"（空空如也）"; }


// --- shopPrice (was main+1935-1939, 5 lines) ---
function shopPrice(n){
  const p = SHOP[n]; if (p===undefined) return undefined;
  const d = state.affinity>=85 ? 0.8 : state.affinity>=60 ? 0.9 : 1;
  return Math.max(1, Math.floor(p*d));   /* P3 修复：折扣向下取整让利玩家（原 Math.round 把 13.5 收成 14，「让一成」实收只让 6.7%） */
}


// --- shopTier (was main+1940-1940, 1 lines) ---
function shopTier(){ return state.affinity>=85 ? "托付价（八折）" : state.affinity>=60 ? "熟人价（九折）" : null; }

// === 全局声明（自主脚本迁入） ===

// --- AC (migrated from main script) ---
let AC = null, sndOn = true;

// --- sfxGain (migrated from main script) ---
let sfxGain = null, ambGain = null, ambCfg = null, lastAmbScene = null;

// --- audioPrefs (migrated from main script) ---
const audioPrefs = { volMaster: 1, volSfx: 1, volAmb: 1 };

// --- qualityMode (migrated from main script) ---
let qualityMode = "auto";       /* auto | 3d | 2d（auto=3D 起步，低帧自动降级） */

// --- qualityDegrade (migrated from main script) ---
let qualityDegrade = 0;         /* 0 未降 / 1 已降 DPR / 2 已切 2D */

// --- perfOn (migrated from main script) ---
let perfOn = false, perfAcc = 0, perfT = 0, perfFps = 0, lastLoopT = 0;
let perfLowStreak = 0;   /* 锐评 D：连续低帧窗口计数——切 2D 前要求连续 2 次，避免开局几秒视觉突变 */

// --- noiseBuf (migrated from main script) ---
let noiseBuf = null;

// --- hintEl (migrated from main script) ---
const hintEl=document.getElementById("hint"), ambEl=document.getElementById("ambient"), zoneEl=document.getElementById("zone");

// --- lastLyric (migrated from main script) ---
let lastLyric = "";

// === 主脚本残留（第二批迁入） ===

// --- SFX_CFG (migrated from main script) ---
const SFX_CFG = {
  attack: [900, 560, 0.05, "square",   0.10],
  miss:   [420, 260, 0.04, "triangle", 0.05],   /* E 空按轻响：反馈缺口修补 */
  hurt:   [150,  70,  0.17, "sawtooth", 0.20],
  dash:   [240,  720, 0.15, "sawtooth", 0.10],
  alert:  [540,  540, 0.07, "triangle", 0.09],
  die:    [320,  85,  0.30, "sawtooth", 0.15],
  cook:   [520,  800, 0.13, "triangle", 0.11],
  pick:   [700,  900, 0.06, "sine",     0.08],
  level:  [520, 1040, 0.35, "triangle", 0.14],
  warn:   [330,  220, 0.22, "square",   0.07],
  bless:  [440,  880, 0.50, "sine",     0.10],
  oink:   [190,  85,  0.30, "sawtooth", 0.18],   /* P1.2 猪化：低频鼻息滑音 */
};

function shareJourneyModel(){
  const got=Array.isArray(state.achiv)?state.achiv:[];
  const latestId=got[got.length-1];
  return {
    name:state.chosenName||state.sunName||state.calypsoName||"无名旅人",
    latest:ACHIV.find(a=>a.id===latestId)||null,
    canonCount:ACHIV.filter(a=>a.canon&&got.includes(a.id)).length,
    devCount:ACHIV.filter(a=>a.dev&&got.includes(a.id)).length,
    crewText:state.crewLit?`船员 ${state.crew||0}/12 存活`:"船员名册尚未点亮",
  };
}

// --- shareShot (migrated from main script) ---
async function shareShot(){
  if (_shotBusy) return;
  _shotBusy = true;
  try{
    const W=1200, H=675, out=document.createElement("canvas");
    out.width=W; out.height=H;
    const c=out.getContext("2d");
  /* 底图：W3D 模式现渲现读（preserveDrawingBuffer 已关，必须同帧 render→toDataURL）；纯 2D 直接取游戏画布 */
  const img3d = await grab3dImage();
  const layers = img3d ? [img3d, cv] : [cv];
    for (const src of layers){
      if (!src || !src.width) continue;
      const s = Math.max(W/src.width, H/src.height);
      const dw = src.width*s, dh = src.height*s;
      try{ c.drawImage(src, (W-dw)/2, (H-dh)/2, dw, dh); }catch(e){}
    }
    /* 底部命运字幕条：这是“我的航迹”，不是一张通用数值截图 */
    const model=shareJourneyModel();
    const grad = c.createLinearGradient(0, H-270, 0, H);
    grad.addColorStop(0, "rgba(8,14,24,0)");
    grad.addColorStop(1, "rgba(8,14,24,.92)");
    c.fillStyle = grad; c.fillRect(0, H-270, W, 270);
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.fillStyle = "#c8a860"; c.font = "500 18px 'Segoe UI','Microsoft YaHei'";
    c.fillText("奥 德 赛 · 地 中 海", 46, H-224);
    const d = new Date();
    c.textAlign = "right"; c.fillStyle = "#9fb2c8"; c.font = "400 16px 'Segoe UI','Microsoft YaHei'";
    c.fillText(`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} · AI NPC 开放世界`, W-46, H-224);
    c.textAlign = "left";
    c.fillStyle = "#ffd66b"; c.font = "600 30px 'Segoe UI','Microsoft YaHei'";
    const journeyName=`${model.name} 的航迹`;
    c.fillText(journeyName.length>24?journeyName.slice(0,24)+"…":journeyName, 46, H-184);
    c.fillStyle = "#f2f6fb"; c.font = "500 22px 'Segoe UI','Microsoft YaHei'";
    const fateLine=model.latest?`最新命运 · ${model.latest.name}`:"最新命运 · 尚未落印——第一枚命运仍在海上";
    c.fillText(fateLine, 46, H-144);
    const obj = nextObjective();
    const quote = obj ? (state.finaleDone ? "航程已完——海记得每一段。" : obj.text) : "海上";
    c.fillStyle = "#dce6f1"; c.font = "400 20px 'Segoe UI','Microsoft YaHei'";
    c.fillText(quote.length>34 ? quote.slice(0,34)+"…" : quote, 46, H-104);
    c.fillStyle = "#9fb2c8"; c.font = "400 18px 'Segoe UI','Microsoft YaHei'";
    c.fillText(`航序 ${legsVisitedCount()}/14 · Lv.${state.level} · 原著 ${model.canonCount} · 改写 ${model.devCount}`, 46, H-68);
    c.fillText(`${model.crewText} · ${clockName()} ${String(Math.floor(hourNow())).padStart(2,"0")}:${String(Math.floor(state.clock%60)).padStart(2,"0")}`, 46, H-34);
    /* 导出：系统分享优先（被拒/失败/不支持一律回落下载——实测 headless 与部分安卓 WebView share() 会拒绝） */
    out.toBlob((blob)=>{
      _shotBusy = false;
      if (!blob){ toast("卡片生成失败——浏览器不支持 canvas 导出。"); return; }
      const file = new File([blob], "odyssey-航迹.png", {type:"image/png"});
      const download = ()=>{
        try{
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = "odyssey-航迹.png";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(()=>URL.revokeObjectURL(a.href), 3000);
          sfx("pick"); toast("航迹卡片已保存到下载。发给那个会懂的人。");
        }catch(e){ toast("分享失败——试试截图键，海不会怪你。"); }
      };
      try{
        if (navigator.canShare && navigator.canShare({files:[file]})){
          navigator.share({files:[file], title:"奥德赛 · 地中海", text:quote})
            .then(()=>{ sfx("pick"); toast("航迹卡片已调起系统分享。"); })
            .catch((err)=>{ if (err && err.name==="AbortError"){ return; }   /* 用户主动取消不算失败 */
                             download(); });
        } else download();
      }catch(e){ download(); }
    }, "image/png");
  }catch(e){ _shotBusy = false; toast("卡片生成失败：" + String(e.message||e).slice(0,40)); }
}

