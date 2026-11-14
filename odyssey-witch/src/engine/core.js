// ============================================================
// 奥德赛 · 引擎核心 —— core
// tick 系列 + 地图/移动工具函数 + 音效/UI 基础能力
// 依赖 src/data/* (state, constants, quests, npcs, personas)
// ============================================================

// --- hTile (moved from main script, was main+337-337) ---
function hTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":HADES[cy][cx]; }


// --- npcAmbientTick (moved from main script, was main+366-404) ---
function npcAmbientTick(dt){
  ambTimer += dt;
  if (ambTimer < 1.2) return;                /* 决策步 1.2s 一次，非每帧 */
  ambTimer = 0;
  if (dlgOpen||titleOn||chapterOn||mapOpen||scene==="world"||(scene==="telepylos"&&FD.on)){ ambActive=null; return; }
  const npc = scene==="aia"?"witch":scene==="hades"?"seer":scene==="aeolia"?"aeolus":scene==="strait"?"siren":scene==="sun"?"cattle":scene==="ogggia"?"calypso":scene==="scheria"?"nausicaa":scene==="ismaros"?"rebuilder":scene==="lotus"?"lotusman":scene==="cyclops"?"polyphemus":scene==="troy"?"epeius":scene==="ithaca"?ithacaAmbientNpc():null;
  if (!npc){ ambActive=null; return; }
  const anchor = ambientAnchor(npc);
  if (!anchor){ ambActive=null; return; }
  if (Math.hypot(aiaPlayer.x-anchor.x, aiaPlayer.y-anchor.y) > 180){ ambActive=null; return; }
  const now = performance.now();
  if (ambActive && now < ambUntil) return;   /* 正在说的这句先说完 */
  if (ambActive){ ambActive=null; return; }  /* 说完停一轮，避免无缝接龙 */
  /* 冷却判据修正：原来写 now-(cooldown||0)>90000 ——「没说过」被当成「冷却中」，
     而 performance.now() 在页面刚打开时只有几秒，于是**所有 NPC 的环境台词在前 90 秒
     一句都不会出现**（女巫主动搭话、关怀承诺、传闻口，全都哑着）。
     正确口径：没有冷却记录＝从未说过＝立刻可用；说过一次才等 90s。 */
  const cands = (AMBIENT[npc]||[]).filter(a => {
    const cd = ambientCooldown[npc+"."+a.id];
    return (cd === undefined || now - cd > 90000) && a.cond();
  });
  /* 传闻口：海路听来的名声事件纳入环境台词候选（未听过优先；全听过则不抢话） */
  const rumor = rumorNextFor(npc);
  if (rumor && !rumor.heard){
    cands.push({ id:"rumor:"+rumor.r.id, w:0.85, cond:()=>true,
      line:()=>R.lineFor(rumor, npc), _rumor:rumor.r.id });   /* 传 npcKey：VOICE 口吻变体按人取样（v2） */
  }
  if (!cands.length) return;
  cands.sort((a,b)=>b.w-a.w);
  const pick = cands[0];
  if (pick._rumor) R.markHeard(state.rumors, pick._rumor, npc);
  if (pick.give){   /* B-8：关怀承诺的物资一次性落账，flag 防重复刷 */
    state.ambientGiven = state.ambientGiven || {};
    const gk = npc+"."+pick.id;
    if (!state.ambientGiven[gk]){
      state.ambientGiven[gk] = true;
      if (pick.give.coins) state.coins = (state.coins||0) + pick.give.coins;
      if (pick.give.item) addItem(pick.give.item);
    }
  }
  ambientCooldown[npc+"."+pick.id] = now;
  ambActive = pick.id; ambUntil = now + 5200;
  ambAnchor = anchor;
  ambText = typeof pick.line==="function" ? pick.line() : pick.line;
}


// --- npcWalkTick (moved from main script, was main+533-538) ---
function npcWalkTick(et){
  for (const w of WALKERS){
    w.o.x = w.bx + Math.sin(et*w.sp + w.ph) * w.amp;
    w.o.y = w.by + Math.cos(et*w.sp*0.8 + w.ph) * w.amp*0.45;
  }
}


// --- witchUtilityTick (moved from main script, was main+549-572) ---
function witchUtilityTick(dt){
  if (dlgOpen || titleOn || chapterOn || mapOpen) return;
  witchAI.t += dt;
  witchAI.bored   = witchAI.mode==="stir" ? witchAI.bored+dt*0.022 : Math.max(0, witchAI.bored-dt*0.05);
  witchAI.fatigue = witchAI.mode==="pace" ? witchAI.fatigue+dt*0.045 : Math.max(0, witchAI.fatigue-dt*0.03);
  if (witchAI.t >= 2){                          /* 决策步 2s 一次，非每帧 */
    witchAI.t = 0;
    const evening = (isDusk()||isNight()) ? 1 : 0;
    const scores = {
      stir: 0.45*(1-witchAI.bored) + witchAI.fatigue*0.6,
      pace: 0.22 + witchAI.bored*0.7  - witchAI.fatigue*0.5,
      gaze: 0.10 + evening*0.35       + witchAI.bored*0.25,
    };
    scores[witchAI.mode] += witchAI.hyst;       /* 迟滞：避免在近平分间抖动 */
    const best = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
    if (best !== witchAI.mode){
      witchAI.mode = best;
      witchAI.tx = WITCH_SPOTS[best].x; witchAI.ty = WITCH_SPOTS[best].y;
    }
  }
  const dx = witchAI.tx-witch.x, dy = witchAI.ty-witch.y, d = Math.hypot(dx,dy);
  if (d > 2){ const sp = Math.min(26*dt, d); witch.x += dx/d*sp; witch.y += dy/d*sp; }
  ASPOTS[0].x = witch.x; ASPOTS[0].y = witch.y;   /* 交互点跟随 */
}


// --- tryMoveAia (moved from main script, was main+727-732) ---
function tryMoveAia(nx,ny){
  const hw=aiaPlayer.w/2, hh=aiaPlayer.h/2;
  for (const [dx,dy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]])
    if (ASOLID.has(aiaTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  aiaPlayer.x=nx; aiaPlayer.y=ny; return true;
}


// --- isSolidTile (moved from main script, was main+734-734) ---
const isSolidTile = (cx,cy)=>{ const c=worldTile(cx,cy); return c==="#"||c==="X"||c==="G"; };


// --- tryMoveWorld (moved from main script, was main+759-772) ---
function tryMoveWorld(nx,ny){
  const ch = worldTile(Math.floor(nx/WTS), Math.floor(ny/WTS));
  if (ch==="#"||ch==="X"||ch==="G") return false;
  /* Steam 化：世界边界钳制——海图之外是没人回来讲过的海，不让船驶出可航行水域
     （原实现实测能把船开到负坐标的无尽空海，失去一切视觉参照） */
  const M = WTS*0.5;
  const cx = Math.max(M, Math.min(WCOLS*WTS-M, nx));
  const cy = Math.max(M, Math.min(WROWS*WTS-M, ny));
  if ((cx!==nx || cy!==ny) && performance.now()-(tryMoveWorld._edgeAt||0) > 25000){
    tryMoveWorld._edgeAt = performance.now();
    toast("海图的边缘。再往外，是没人回来讲过的海——回头吧。（M 看海图）");
  }
  boat.x=cx; boat.y=cy; return true;
}


// --- windFromLabel (moved from main script, was main+779-779) ---
function windFromLabel(dir){ const from=(dir+Math.PI)%(Math.PI*2); return ["东风","南风","西风","北风"][Math.round(from/(Math.PI/2))%4]; }


// --- windFactor (moved from main script, was main+780-785) ---
function windFactor(){
  if (scene!=="world") return 1;
  const hv = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]}[boat.face]||[0,-1];
  const dot = hv[0]*Math.cos(windDir) + hv[1]*Math.sin(windDir);
  return dot >= 0.45 ? 1.3 : dot > -0.35 ? 1.0 : 0.78;
}


// --- windTick (moved from main script, was main+786-793) ---
function windTick(dt){
  windShiftT += dt;
  if (windShiftT >= 100 + Math.sin(windDir*7)*30){   /* 70~130s 有节奏的转向 */
    windShiftT = 0;
    windDir = (windDir + (0.5+Math.random())*Math.PI*(Math.random()<0.5?-1:1) + Math.PI*2) % (Math.PI*2);
    if (scene==="world") toast("风向变了——"+windFromLabel(windDir)+"起了。");
  }
}


// --- tickMove (moved from main script, was main+794-847) ---
function tickMove(dt){
  if (titleOn||chapterOn||mapOpen) return;
  let dx=0, dy=0;
  if (keys.has("a")||keys.has("arrowleft")) dx-=1;
  if (keys.has("d")||keys.has("arrowright")) dx+=1;
  if (keys.has("w")||keys.has("arrowup")) dy-=1;
  if (keys.has("s")||keys.has("arrowdown")) dy+=1;
  /* 钓鱼中：移动 = 收线（不再强制锚船——玩家想走随时能走，消灭「按 E 抛竿后被锁 25s」的卡死感） */
  if (FISH.on){
    if (dx || dy){ endFishing(false, "收线——船一动，鱼群就散了。"); }
    else { boat.moving=false; boat.vx=0; boat.vy=0; return; }
  }
  const p = scene!=="world" ? aiaPlayer : boat;
  p.moving = !!(dx||dy);
  if (!dx&&!dy){ p.vx=0; p.vy=0; return; }   /* 速度清零：相机前瞻随之收回 */
  if (dx&&dy){ dx*=0.7071; dy*=0.7071; }
  if (dx<0) p.face="left"; else if (dx>0) p.face="right";
  else if (dy<0) p.face="up"; else p.face="down";
  /* 风袋顺风：海上航速倍增（暗线③：用风=快旅，贪念=用光） */
  const tail = scene==="world" && performance.now() < (state.tailwindUntil||0);
  /* 批次 I2：风向系数——世界航行读风做决策（顺 1.3 / 侧 1.0 / 逆 0.78）；风袋自带顺风不受自然风影响 */
  /* 海图玩法：航路姿态（沿岸 0.94 / 外海 1.0 / 迷雾 1.14）× 洋流（顺 1.18 / 逆 0.88） */
  const routeMul = scene==="world" ? (typeof seaRouteSpeed==="function" ? seaRouteSpeed() : 1) : 1;
  const curMul = scene==="world" ? (typeof currentFactor==="function" ? currentFactor(dx,dy) : 1) : 1;
  const sp = (scene==="aia"?150:scene==="hades"?120:scene==="aeolia"?130:scene==="strait"?135:scene==="sun"?140:scene==="ogggia"?125:scene==="scheria"?150:scene==="ithaca"?140:PROLOGUE_SITES[scene]?135:tail?Math.round(130*routeMul*curMul):Math.round(62*windFactor()*routeMul*curMul))*dt;   /* 批次 H9：世界尺寸翻倍后航速校准 110→62（横渡全海 ~30s），顺风 230→130；风袋快旅同样吃航路/洋流 */
  const mover = scene==="aia" ? tryMoveAia : scene==="hades" ? tryMoveHades : scene==="aeolia" ? tryMoveAeolia : scene==="strait" ? tryMoveStrait : scene==="sun" ? tryMoveSun : scene==="ogggia" ? tryMoveOggia : scene==="scheria" ? tryMoveScheria : scene==="ithaca" ? tryMoveIthaca : PROLOGUE_SITES[scene] ? tryMovePrologue : tryMoveWorld;
  p.vx = dx*sp/dt; p.vy = dy*sp/dt;   /* 实际速度（px/s），相机前瞻用 */
  /* 碰撞顺滑（游戏手感批）：先按原方向轴分离移动；全被挡时自动尝试 45° 绕行——
     消灭「顶墙完全静止」的卡死感（海图岛屿密集，直线顶岸/贴墙走路是常态） */
  let moved = false;
  if (dx) moved = mover(p.x+dx*sp, p.y) || moved;
  if (dy) moved = mover(p.x, p.y+dy*sp) || moved;
  if (!moved){
    const rx = Math.SQRT1_2;
    const variants = [
      [ (dx-dy)*rx, (dx+dy)*rx ],
      [ (dx+dy)*rx, (dy-dx)*rx ],
    ];
    for (const [vx, vy] of variants){
      if (!vx && !vy) continue;
      let slid = false;
      if (Math.abs(vx) > 0.01 && mover(p.x+vx*sp*0.62, p.y)) slid = true;
      if (Math.abs(vy) > 0.01 && mover(p.x, p.y+vy*sp*0.62)) slid = true;
      if (slid){ moved = true; break; }
    }
  }
  /* 真正卡死（协助也走不动）：累计提示一次，别让玩家以为游戏挂了 */
  if (!moved){
    p.vx=0; p.vy=0;
    _stuckT = (_stuckT||0) + dt;
    if (_stuckT > 1.6 && performance.now()-(tickMove._stuckToastAt||0) > 12000){
      tickMove._stuckToastAt = performance.now();
      toast(scene==="world" ? "船头抵着浅滩——斜一点方向，或者顺岸滑行。" : "前面走不通——贴着边斜一点试试。");
    }
  } else { _stuckT = 0; noteOnboarding("move"); }
  p.step = (p.step||0)+dt*8;
}


// --- tryMoveBoar (moved from main script, was main+851-855) ---
function tryMoveBoar(nx, ny){
  for (const [dx,dy] of [[-13,-7],[13,-7],[-13,7],[13,7]])
    if (ASOLID.has(aiaTile(Math.floor((nx+dx)/ATS), Math.floor((ny+dy)/ATS)))) return false;
  boar.x = nx; boar.y = ny; return true;
}


// --- tickBoar (moved from main script, was main+856-902) ---
function tickBoar(dt){
  if (!boar.alive) return;
  boar.timer -= dt;
  const dx = aiaPlayer.x - boar.x, dy = aiaPlayer.y - boar.y;
  const dist = Math.hypot(dx, dy) || 1;
  const rage = isNight() ? 1.4 : 1;        /* 昼夜威胁：夜里它更凶（survival-crafting 威胁曲线） */
  switch (boar.mode){
    case "idle":
      /* 游荡：在家附近小步踱步 */
      if (dist < 140*rage){ boar.mode = "aggro"; sfx("alert"); break; }
      if (((performance.now()/900)|0) % 2 === 0){
        const hx = boar.home.x - boar.x, hy = boar.home.y - boar.y;
        if (Math.hypot(hx, hy) > 26) tryMoveBoar(boar.x + Math.sign(hx)*22*dt, boar.y + Math.sign(hy)*22*dt);
      }
      break;
    case "aggro":
      if (dist > 210*rage){ boar.mode = "idle"; break; }
      if (dist < 95){
        boar.mode = "windup"; boar.timer = 0.5;
        boar.dir = {x:dx/dist, y:dy/dist};   /* 方向在蓄力开始时锁定 → 玩家可走位躲 */
        break;
      }
      tryMoveBoar(boar.x + dx/dist*34*dt*(isNight()?1.15:1), boar.y + dy/dist*34*dt*(isNight()?1.15:1));
      break;
    case "windup":
      if (boar.timer <= 0){ boar.mode = "dash"; boar.timer = 0.55; sfx("dash"); }
      break;
    case "dash": {
      const sp = 300*dt;
      if (!tryMoveBoar(boar.x + boar.dir.x*sp, boar.y + boar.dir.y*sp)){
        boar.mode = "tired"; boar.timer = 1.3; break;
      }
      if (Math.hypot(aiaPlayer.x-boar.x, aiaPlayer.y-boar.y) < 22){
        const dmg = 12 + Math.floor(Math.random()*5) + (isNight()?2:0);
        hurtPlayer(dmg, "野猪把你撞了个趔趄");
        const kb = 26;
        tryMoveAia(aiaPlayer.x + boar.dir.x*kb, aiaPlayer.y);
        tryMoveAia(aiaPlayer.x, aiaPlayer.y + boar.dir.y*kb);
        boar.mode = "tired"; boar.timer = 1.3;
      } else if (boar.timer <= 0){ boar.mode = "tired"; boar.timer = 1.3; }
      break;
    }
    case "tired":
      if (boar.timer <= 0) boar.mode = "idle";
      break;
  }
}


// --- flashHit (moved from main script, was main+918-923) ---
function flashHit(){
  const f = document.getElementById("hitFlash");
  if (!f) return;
  f.style.transition = "none"; f.style.opacity = 1;
  requestAnimationFrame(()=>{ f.style.transition = "opacity .55s"; f.style.opacity = 0; });
}


// --- shakeHp (moved from main script, was main+924-928) ---
function shakeHp(){
  const el = document.getElementById("hudHpBarWrap");
  if (!el) return;
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
}


// --- sfx (moved from main script, was main+1021-1037) ---
function sfx(kind){
  if (!sndOn || !SFX_CFG[kind]) return;
  try{
    audioInit(); if (!AC) return;
    if (AC.state === "suspended") AC.resume();
    const c = SFX_CFG[kind], t = AC.currentTime;
    const jitter = 0.94 + Math.random()*0.12;   /* ±6% 变调，去"机枪感"（SFX variation） */
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = c[3];
    o.frequency.setValueAtTime(c[0]*jitter, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, c[1]*jitter), t+c[2]);
    g.gain.setValueAtTime(c[4], t);
    g.gain.exponentialRampToValueAtTime(0.001, t+c[2]);
    o.connect(g); g.connect(sfxGain||AC.destination);
    o.start(t); o.stop(t+c[2]+0.02);
  }catch(e){}
}


// --- thunderSfx (moved from main script, was main+1039-1058) ---
function thunderSfx(){
  if (!sndOn) return;
  try{
    audioInit(); if (!AC) return;
    if (AC.state === "suspended") AC.resume();
    const t = AC.currentTime;
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(60, t+1.6);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t+0.05);   /* 首劈 */
    g.gain.exponentialRampToValueAtTime(0.12, t+0.45);
    g.gain.exponentialRampToValueAtTime(0.42, t+0.62);   /* 回响第二击 */
    g.gain.exponentialRampToValueAtTime(0.001, t+1.8);
    n.connect(f); f.connect(g); g.connect(sfxGain||AC.destination);
    n.start(t); n.stop(t+1.9);
  }catch(e){}
}


// --- waveSfx (moved from main script, was main+1060-1079) ---
function waveSfx(){
  if (!sndOn) return;
  try{
    audioInit(); if (!AC) return;
    if (AC.state === "suspended") AC.resume();
    const t = AC.currentTime;
    const n = AC.createBufferSource(); n.buffer = getNoise(); n.loop = true;
    const f = AC.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(240, t);
    f.frequency.exponentialRampToValueAtTime(40, t+2.2);
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t+0.35);    /* 涌起 */
    g.gain.exponentialRampToValueAtTime(0.18, t+1.1);
    g.gain.exponentialRampToValueAtTime(0.38, t+1.5);    /* 砸落 */
    g.gain.exponentialRampToValueAtTime(0.001, t+2.4);
    n.connect(f); f.connect(g); g.connect(sfxGain||AC.destination);
    n.start(t); n.stop(t+2.5);
  }catch(e){}
}


// --- ambTick (moved from main script, was main+1219-1266) ---
function ambTick(dt){
  if (!AC || !sndOn) return;
  if (AC.state === "suspended") AC.resume();
  if (ambGain){
    /* ducking：对话/标题/过场/海图时环境音让位（sidechain 的手写替身，慢恢复不喘）；总环境音量滑条在此乘算 */
    const target = (dlgOpen||titleOn||chapterOn||mapOpen ? 0.2 : 1) * 0.9 * (audioPrefs.volAmb||1);
    const cur = ambGain.gain.value;
    ambGain.gain.value = cur + (target-cur)*Math.min(1, dt*2.5);
  }
  if (lastAmbScene !== scene){ lastAmbScene = scene; setAmbience(); }
  if (dlgOpen || titleOn || chapterOn) return;
  if (scene === "aia"){
    /* 近篝火：随机高频噼啪 */
    const d = Math.hypot(aiaPlayer.x-(16*ATS+ATS/2), aiaPlayer.y-(8*ATS+ATS*0.95));
    if (d < 130){
      crackleT -= dt;
      if (crackleT <= 0){
        crackleT = 0.12 + Math.random()*0.5;
        try{
          const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
          src.buffer = getNoise(); f.type="highpass"; f.frequency.value=2500;
          g.gain.setValueAtTime(0.10+Math.random()*0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t+0.06);
          src.connect(f); f.connect(g); g.connect(ambGain||AC.destination);
          src.start(t, Math.random()*1.5, 0.07);
        }catch(e){}
      }
    }
  }
  if (scene === "world"){
    /* 海面偶发鸥鸣 */
    gullT -= dt;
    if (gullT <= 0){
      gullT = 9 + Math.random()*10;
      try{
        const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
        o.type="sine";
        o.frequency.setValueAtTime(1150, t);
        o.frequency.exponentialRampToValueAtTime(750, t+0.28);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t+0.3);
        o.connect(g); g.connect(ambGain||AC.destination);
        o.start(t); o.stop(t+0.32);
      }catch(e){}
    }
  }
}


// --- sunNoiseTick (moved from main script, was main+2583-2589) ---
function sunNoiseTick(dt){
  if (scene!=="sun"){ sunNoiseT=0; return; }
  if (state.crewNoiseDone || !state.crewLit || !(state.crew>0) || state.sunWrath || state.sunBlessed) return;
  if (chapterOn || askOn || dlgOpen || mapOpen || titleOn) return;   /* 界面都清了才开口 */
  sunNoiseT += dt;
  if (sunNoiseT >= 2.4){ sunNoiseT = 0; crewNoiseEvent(); }
}


// --- fishingTick (moved from main script, was main+2960-2973) ---
function fishingTick(dt){
  if (!FISH.on) return;
  FISH.tLeft -= dt;
  if (FISH.tLeft <= 0){ endFishing(false, "漂了半天没动静——收线，换个时辰再来。"); return; }
  /* 鱼影：基础速度 + 随机窜逃 */
  FISH.fish += FISH.fishDir * FISH.fishSp * dt * (0.7 + Math.random()*0.6);
  if (Math.random() < dt*0.9) FISH.fishDir *= -1;
  if (FISH.fish < 0.06){ FISH.fish = 0.06; FISH.fishDir = 1; }
  if (FISH.fish > 0.94){ FISH.fish = 0.94; FISH.fishDir = -1; }
  /* 绿区往复 */
  FISH.zone += FISH.zoneDir * 0.34 * dt;
  if (FISH.zone < 0.02){ FISH.zone = 0.02; FISH.zoneDir = 1; }
  if (FISH.zone > 0.98-FISH.ZONE_W){ FISH.zone = 0.98-FISH.ZONE_W; FISH.zoneDir = -1; }
}


// --- driftSpotOK (moved from main script, was main+3044-3052) ---
function driftSpotOK(x, y){
  if (worldTile(Math.floor(x/WTS), Math.floor(y/WTS)) !== "~") return false;
  for (const is of ISLANDS){
    if (Math.hypot(x-(is.gx*WTS+WTS/2), y-(is.gy*WTS+WTS/2)) < 12) return false;   /* 只避开岛中心本身（瓦片已保证在水上）——13 岛间距仅 40~80px，大排除圈会把全图盖满 */
  }
  if (Math.hypot(x-boat.x, y-boat.y) < 40) return false;
  for (const d of drifts){ if (Math.hypot(x-d.x, y-d.y) < 40) return false; }
  return true;
}


// --- driftTick (moved from main script, was main+3089-3092) ---
function driftTick(now){
  if (scene !== "world") return;
  if (drifts.length < 7 && now > driftNextAt){ spawnDrift(); driftNextAt = now + 95000 + Math.random()*55000; }   /* 批次 H8：海上可遇可捞物加密（4→7 上限，间隔 150-210s→95-150s） */
}


// --- meteorTick (moved from main script, was main+3126-3135) ---
function meteorTick(now){
  if (scene==="world" && nightAmount() > 0.5 && meteors.length < 2 && now > meteorNextAt){
    meteors.push({ x: 120+Math.random()*760, y: 20+Math.random()*130,
      vx: (Math.random()<0.5?-1:1)*(340+Math.random()*180), vy: 170+Math.random()*130,
      born: now, max: 900+Math.random()*500, len: 90+Math.random()*70 });
    meteorNextAt = now + 6000 + Math.random()*10000;
    if (!state.meteorSeen){ state.meteorSeen = 1; toast("流星划过海面——这一夜，奥德修斯替自己许了个愿。"); save(); }
  }
  meteors = meteors.filter(m => now - m.born < m.max);
}


// --- toast (moved from main script, was main+4782-4786) ---
function toast(msg){
  const el=document.getElementById("toast");
  el.textContent=msg; el.style.opacity=1;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.style.opacity=0, 2400);
}


// --- boatMapPos (moved from main script, was main+5072-5081) ---
function boatMapPos(){
  /* 精确投影：世界像素 → 海图百分比。WORLD（46×18）与底图（3312×1296）同宽高比，
     岛屿标记也由 mapPct(gx,gy) 派生 —— 船位、岛位、海岸线共用一套坐标，不再近似内插。 */
  return [ boat.x/(WCOLS*WTS)*100, boat.y/(WROWS*WTS)*100 ];
}


// --- loop (moved from main script, was main+6438-6505) ---
function loop(t){
  const et=(t-T0)/1000;
  /* 输入缓冲（input-systems）：交互预按 0.12s 内，走进可交互范围即触发 */
  if (eBufAt && performance.now()-eBufAt < 120 && !dlgOpen && !mapOpen && !titleOn && !chapterOn){
    const near = scene==="world" ? islandNear() : aiaNear();
    if (near){ eBufAt = 0; interact(); }
  }
  /* 锐评 A：backing 跟随舞台（DPR 适配），逻辑坐标仍 1000×600 —— setTransform 后所有绘制零改动 */
  fitCanvasBacking();
  ctx.setTransform(cv.width/VIEW_W, 0, 0, cv.height/VIEW_H, 0, 0);
  ctx.clearRect(0,0,VIEW_W,VIEW_H);
  /* 世界图 3D 大陆视觉：W3D 就绪时 2D 画布只留透明合成层（日光/夜色/浮字），岛内场景不受影响 */
  if (qualityMode==="2d" && scene==="world"){
    const cv3 = document.getElementById("cv3d");
    if (cv3 && cv3.style.display !== "none") cv3.style.display = "none";   /* 持久化的 2D 偏好：模块插入画布后补隐藏 */
  }
  const w3dOn = w3dActive();
  if (w3dOn) W3D.frame(et);
  const bgc = w3dOn ? null : sceneBackdrop();   /* 岛外底色：岛屿只画岛体，其余区域必须补齐（根治 void 黑区） */
  if (bgc){ ctx.fillStyle=bgc; ctx.fillRect(0,0,1000,600); }
  const [shx,shy,shr]=camOffset();
  const [ccx,ccy]=camCenter();
  ctx.save();
  ctx.translate(shx, shy);
  ctx.translate(ccx, ccy);
  ctx.rotate(shr);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  if (scene==="world"){ if (!w3dOn) drawWorld(et); drawDrifts(et); } else if (scene==="hades") drawHades(et); else if (scene==="aeolia") drawAeolia(et); else if (scene==="strait") drawStrait(et); else if (scene==="sun") drawSun(et); else if (scene==="ogggia") drawOggia(et); else if (scene==="scheria") drawScheria(et); else if (scene==="ithaca") drawIthaca(et); else if (PROLOGUE_SITES[scene]) drawPrologue(et); else drawAia(et);   /* P2.3 石柱由 drawWorld 内 drawStonePillar 承担（W3D 路径走 world3d.js 三维石柱） */
  drawDaylight(et);
  drawFloatTexts();
  drawParts();
  drawGrain();
  drawCareBadge(et);
  ctx.restore();
  meteorTick(performance.now());
  drawMeteors(performance.now());   /* 夜间流星（Steam 化美观批）：海夜偶尔一道拖尾，画在 HUD 之下 */
  drawFleetHud();   /* 守船战计数（屏幕空间 HUD，restore 后画不随镜头漂移） */
  drawScyllaHud();  /* F5 斯库拉快反战 HUD：六头计数 + 窗口条 */
  drawSuitorHud();  /* F6 求婚者肃清战 HUD：肃清计数 + 窗口条 */
  drawCampHud();    /* F3 伊斯玛洛斯守营战 HUD：火把波 + 窗口条 */
  drawRamHud();     /* F4 独眼巨人羊腹潜行 HUD：摸羊计数 + 窗口条 */
  drawFishingHud(); /* 钓鱼 HUD：绿区扫动 + 鱼影游动 + 中/脱钩计数（屏幕空间） */
  if (scene!=="world") markLeg(scene);
  seaEncounterTick();
  maleaTick();
  updateHintDOM();
  updateCompassArrow();   /* Steam 化：航向罗盘箭头每帧轻量刷新（DOM 仅文案变化时写入） */
  pollGamepad();   /* Steam 化：手柄轮询（左摇杆/十字键移动，A 互动） */
  renderAmbient();
  /* 自适应画质：连续窗口平均帧率过低 → 先降 DPR、再切 2D 海图（仅 auto 模式，尊重手动选择）。
     锐评 D（实玩批）：2s 窗口 + 单次低帧即切 2D，开局几秒就可能视觉突变（后台标签/慢盘加载也算）。
     改为：3.5s 窗口 + 切 2D 前要求连续 2 个低帧窗口，给「先降 DPR」留出生效时间。 */
  if (lastLoopT && t > lastLoopT){
    perfT += Math.min((t - lastLoopT) / 1000, 0.5); perfAcc += 1;
    if (perfT >= 3.5){
      perfFps = perfAcc / perfT; perfAcc = 0; perfT = 0;
      if (w3dOn && qualityMode === "auto"){
        if (qualityDegrade < 1 && perfFps < 40){ qualityDegrade = 1; if (window.W3D && W3D.setDPR) W3D.setDPR(1.0); }
        else if (qualityDegrade === 1 && perfFps < 26){
          perfLowStreak = (perfLowStreak||0) + 1;
          if (perfLowStreak >= 2){
            qualityDegrade = 2; qualityMode = "2d"; applyQuality(true);   /* 会话内降级，不写偏好——避免一次卡顿把用户永久锁在 2D */
            toast("帧率偏低——已自动切到 2D 海图（右上「画质」可切回）。");
          }
        } else perfLowStreak = 0;
      }
    }
  }
  lastLoopT = t;
  if (perfOn){
    const pb = document.getElementById("perfBadge");
    if (pb) pb.textContent = `fps ${Math.round(perfFps||0)} · 画质 ${qualityMode==="2d"?"2D":"3D"}${qualityDegrade===1?"·低DPR":""}`;
  }
  requestAnimationFrame(loop);
}

// === 全局声明（自主脚本迁入） ===

// --- ambTimer (migrated from main script) ---
let ambTimer=0, ambUntil=0, ambAnchor=null, ambText="", ambActive=null;

// --- achTimer (migrated from main script) ---
let achTimer = 0;   /* 成就轮询节流（命运双轨：2s 扫一次 ACHIV） */

// --- ambientCooldown (migrated from main script) ---
const ambientCooldown = {};

// --- WALKERS (migrated from main script) ---
const WALKERS = [
  { o:seer,     bx:seer.x,     by:seer.y,     amp:22, sp:0.28, ph:0.0 },   /* 先知在路尽头缓步 */
  { o:aeolus,   bx:aeolus.x,   by:aeolus.y,   amp:26, sp:0.22, ph:1.7 },   /* 风神宫前踱步 */
  { o:calypso,  bx:calypso.x,  by:calypso.y,  amp:24, sp:0.26, ph:3.1 },   /* 卡吕普索洞前 */
  { o:nausicaa, bx:nausicaa.x, by:nausicaa.y, amp:28, sp:0.34, ph:4.4 },   /* 瑙西亚娅宫前草场 */
];

// --- witchAI (migrated from main script) ---
const witchAI = { mode:"stir", t:0, hyst:0.08, tx:witch.x, ty:witch.y, bored:0, fatigue:0 };

// --- windDir (migrated from main script) ---
let windDir = Math.PI*0.75;      /* 风吹向（弧度，0=东，π/2=南——px 空间 y 向下为南） */

// --- windShiftT (migrated from main script) ---
let windShiftT = 0;

// --- _stuckT (migrated from main script) ---
let _stuckT = 0;

// --- _compassCache (migrated from main script) ---
let _compassCache = "";

// --- sunNoiseT (migrated from main script) ---
let sunNoiseT = 0;   /* 进 sun 场景后的鼓噪等待（离开场景即清零） */

// --- T0 (migrated from main script) ---
let T0 = performance.now();

// --- _gradCache (migrated from main script) ---
const _gradCache = new Map();

// --- boatTrail (migrated from main script) ---
const boatTrail = []; let _trailLast = null;

// --- lastLogic (migrated from main script) ---
let lastLogic = performance.now();

// --- hudTick (migrated from main script) ---
let hudTick = 0;   /* Steam 化：HUD 实时刷新计时（1s 一刷——原实现只住事件驱动刷，航行中时钟/需求条静止不动） */

