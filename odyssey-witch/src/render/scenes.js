// ============================================================
// 奥德赛 · 渲染层 —— scenes
// 32 个 draw/render 场景函数 + 辅助函数
// 依赖 src/data/* (state, constants, quests, npcs)
// 依赖 src/engine/core.js (hTile, isSolidTile, windFactor, ...)
// ============================================================

// --- drawPrologue (was main+196-327, 132 lines) ---
function drawPrologue(et){
  const p = PROLOGUE_SITES[scene];
  ctx.fillStyle = p.tint; ctx.fillRect(0,0,VIEW_W,VIEW_H);
  for (let cy=0;cy<p.map.length;cy++){
    const row=p.map[cy];
    for (let cx=0;cx<row.length;cx++){
      const ch=row[cx], x=cx*ATS, y=cy*ATS;
      switch(ch){
        case "~": ctx.fillStyle="rgba(30,52,74,.55)"; ctx.fillRect(x,y,ATS,ATS); break;
        case "T": ctx.fillStyle="#2e4d3a"; ctx.fillRect(x+6,y+8,ATS-12,ATS-10);
                  ctx.fillStyle="#3c6a4d"; ctx.fillRect(x+6,y+6,ATS-12,8); break;
        case "W": if (scene==="ismaros"){ ctx.fillStyle="#1c1c1e"; ctx.fillRect(x+2,y+6,ATS-4,ATS-8);
                    ctx.fillStyle="#3a3230"; ctx.fillRect(x+2,y+4,ATS-4,6); }   /* 烧焦残墙 */
                  else { ctx.fillStyle="#3d3630"; ctx.beginPath();
                    ctx.moveTo(x+3,y+ATS-6); ctx.lineTo(x+ATS/2,y+6); ctx.lineTo(x+ATS-3,y+ATS-6); ctx.closePath(); ctx.fill(); } break;  /* 碎船骸 */
        case "M": ctx.fillStyle="#5a3d2e"; ctx.fillRect(x+4,y+8,ATS-8,ATS-10);
                  ctx.fillStyle="#e8a84a"; ctx.fillRect(x+4,y+6,ATS-8,6); break;
        case "X": ctx.fillStyle="#6b4a2f"; ctx.fillRect(x+ATS/2-3,y+4,6,ATS-8);
                  ctx.fillStyle="#8a6a3a"; ctx.beginPath(); ctx.arc(x+ATS/2,y+6,7,0,7); ctx.fill(); break;
        case "L": ctx.fillStyle="rgba(240,190,210,.85)"; ctx.beginPath();
                  ctx.arc(x+ATS/2+Math.sin(et/700+cx)*2,y+ATS/2,5,0,7); ctx.fill();
                  ctx.fillStyle="rgba(180,220,170,.5)"; ctx.fillRect(x+2,y+ATS/2,ATS-4,3); break;
        case "B": ctx.fillStyle="#d8c9a8"; ctx.beginPath(); ctx.ellipse(x+ATS/2,y+ATS/2+2,8,5,0,0,7); ctx.fill(); break;
        case "R": ctx.fillStyle="#26221f"; ctx.fillRect(x,y+4,ATS,ATS-4);
                  ctx.fillStyle="#3b342e"; ctx.fillRect(x,y+2,ATS,6); break;
        case "S": { const b=Math.sin(et/600+cx*1.3)>0?1:0;
                  ctx.fillStyle="#cfc4b0"; ctx.beginPath(); ctx.ellipse(x+ATS/2,y+ATS/2+b,9,6,0,0,7); ctx.fill();
                  ctx.fillStyle="#8a7a66"; ctx.beginPath(); ctx.arc(x+ATS/2+7,y+ATS/2-3+b,4,0,7); ctx.fill(); break; }
        case "C": ctx.fillStyle="#121014"; ctx.fillRect(x+4,y+2,ATS-8,ATS-4);
                  if (scene==="cyclops" && !state.polHeard){
                    const gl=0.5+0.5*Math.sin(et/300);
                    ctx.fillStyle=`rgba(255,80,60,${0.25+gl*0.3})`; ctx.fillRect(x+ATS/2-2,y+ATS/2-2,4,4);
                  } break;
        case "_": ctx.fillStyle="#7a5c38"; ctx.fillRect(x,y+10,ATS,6); break;
        case ",": ctx.fillStyle="rgba(220,200,160,.18)"; ctx.fillRect(x+ATS/2-2,y,4,ATS); break;
        /* —— 特洛伊专属 tiles —— */
        case "G": ctx.fillStyle="#4a3826"; ctx.fillRect(x,y,ATS,ATS);           /* 城门洞深影 */
                  ctx.fillStyle="#6a5236"; ctx.fillRect(x+2,y+2,ATS-4,10); break;
        case "F": { const fl = 0.5+0.5*Math.sin(et/240+cx*1.7);                 /* 焚城余烬：暗红闪烁 */
                  ctx.fillStyle="#241a14"; ctx.fillRect(x,y,ATS,ATS);
                  ctx.fillStyle=`rgba(255,110,40,${0.35+fl*0.45})`;
                  ctx.beginPath(); ctx.arc(x+ATS/2,y+ATS/2,4+fl*2,0,7); ctx.fill(); break; }
        case "P": ctx.fillStyle="#8a7248"; ctx.beginPath();                     /* 盾牌堆 */
                  ctx.ellipse(x+ATS/2,y+ATS/2+3,9,7,0,0,7); ctx.fill();
                  ctx.strokeStyle="#5f4d33"; ctx.lineWidth=2;
                  ctx.beginPath(); ctx.arc(x+ATS/2,y+ATS/2+3,4,0,7); ctx.stroke(); break;
        case "H": break;   /* 木马单独绘制（马成前画木料堆，成后画巨马） */
        default:  ctx.fillStyle="rgba(120,140,110,.16)"; ctx.fillRect(x,y,ATS,ATS); break;
      }
    }
  }
  /* —— 特洛伊实体层：木马（阶段化）/ 卫兵 / 厄佩俄斯 —— */
  if (scene==="troy"){
    const hx=8*ATS+ATS/2, hy=5*ATS+ATS/2;
    if (state.troyStage<2){                      /* 木料堆 → 马基座 */
      ctx.fillStyle="#6b4a2f"; ctx.beginPath(); ctx.ellipse(hx,hy+8,16,8,0,0,7); ctx.fill();
      ctx.fillStyle="#8a6a44";
      for (let i=0;i<3;i++) ctx.fillRect(hx-14+i*10, hy-4+i*3, 16, 5);
    } else {                                     /* 巨木马：马身+头颈+鬃+梯 */
      const sway=Math.sin(et/900)*0.6;
      ctx.fillStyle="rgba(20,35,50,.28)"; ctx.beginPath(); ctx.ellipse(hx+10,hy+26,26,8,0,0,7); ctx.fill();
      ctx.fillStyle="#7a5a38"; ctx.beginPath(); ctx.ellipse(hx,hy+6,24,14,sway*0.05,0,7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx-16,hy-8); ctx.quadraticCurveTo(hx-10,hy-34,hx+8,hy-38+sway);
      ctx.lineTo(hx+18,hy-30+sway); ctx.quadraticCurveTo(hx-2,hy-24,hx-4,hy-2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="#5a3f26"; ctx.lineWidth=3;
      for (let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(hx-12+i*6,hy-28+i*1.5);
        ctx.lineTo(hx-14+i*6,hy-40+i*2); ctx.stroke(); }
      ctx.fillStyle="#3d2c1c";
      for (const s of [[-14,18],[8,20]]) ctx.fillRect(hx+s[0],hy+16,5,12);
      ctx.fillStyle="#241a12"; ctx.beginPath(); ctx.arc(hx+14,hy-32+sway,2,0,7); ctx.fill();
      if (state.troyStage>=3){                   /* 已入城：门内火光下的马剪影感 */
        ctx.fillStyle="rgba(255,110,40,.08)"; ctx.beginPath(); ctx.arc(hx,hy,60,0,7); ctx.fill();
      }
    }
    /* 卫兵：铜甲剪影 + 受击抖动 + 血条 */
    TROY_GUARDS.forEach(gd=>{
      if (!gd.alive || state.troyStage!==3) return;
      const sh=(performance.now()-gd.hitAt<260)?Math.sin(performance.now()/22)*3:0;
      const x=gd.x+sh, y=gd.y;
      ctx.fillStyle="rgba(20,35,50,.3)"; ctx.beginPath(); ctx.ellipse(x+3,y+12,12,4,0,0,7); ctx.fill();
      ctx.fillStyle="#9a7a4a"; ctx.fillRect(x-8,y-2,16,12);            /* 铜甲身 */
      ctx.fillStyle="#c9a06a"; ctx.beginPath(); ctx.arc(x,y-10,5.5,0,7); ctx.fill();  /* 头盔 */
      ctx.fillStyle="#7a5c36"; ctx.fillRect(x-2,y-17,4,8);            /* 盔缨 */
      ctx.strokeStyle="#e8b04b"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+9,y-6); ctx.lineTo(x+15,y+8); ctx.stroke();       /* 矛 */
      ctx.fillStyle="#241a12"; ctx.beginPath(); ctx.arc(x-2,y-11,1.4,0,7); ctx.fill();
      if (gd.hp<gd.max){
        ctx.fillStyle="rgba(10,16,24,.7)"; ctx.fillRect(x-16,y-22,32,5);
        ctx.fillStyle="#e05252"; ctx.fillRect(x-15,y-21,30*(gd.hp/gd.max),3);
      }
    });
    /* 厄佩俄斯：造马师（stage<3 白天在场；夜袭后已登船） */
    if (state.troyStage<3){
      const ex=7*ATS+ATS/2, ey=6*ATS+ATS/2, bob=Math.sin(et/600)*1.2;
      ctx.fillStyle="rgba(20,35,50,.3)"; ctx.beginPath(); ctx.ellipse(ex+3,ey+12,11,4,0,0,7); ctx.fill();
      ctx.fillStyle="#8a6a4a"; ctx.fillRect(ex-7,ey-4+bob,14,14);
      ctx.fillStyle="#d8b88a"; ctx.beginPath(); ctx.arc(ex,ey-10+bob,5.5,0,7); ctx.fill();
      ctx.fillStyle="#5f4d33"; ctx.fillRect(ex-7,ey-13+bob,14,4);
      ctx.strokeStyle="#8a6a44"; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(ex+8,ey-14+bob); ctx.lineTo(ex+8,ey+10+bob); ctx.stroke();  /* 刨子杆 */
    }
  }
  /* —— 忒勒皮洛斯实体层：滩头船队（F2 守船战：预警红圈/拖回绿帆/碎石残骸）—— */
  if (scene==="telepylos"){
    const boats = (FD.on||FD.done) ? FD.boats : (state.fleet>0 && !state.fleetGuard ? fdBoatRow() : null);
    if (boats) for (const b of boats){
      if (b.st==="wreck"){ ctx.fillStyle="#3a3f45"; ctx.fillRect(b.x-12,b.y-3,24,5);
        ctx.fillStyle="#59616b"; ctx.fillRect(b.x-8,b.y-7,10,4); continue; }
      const rock=Math.sin(et*1.6+b.x)*1.5, sv=b.st==="saved";
      ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(b.x,b.y+7,11,4,0,0,7); ctx.fill();
      ctx.fillStyle=sv?"#4a7a5a":"#6d4a2b"; ctx.beginPath();
      ctx.moveTo(b.x-11,b.y+2+rock); ctx.quadraticCurveTo(b.x,b.y+6+rock,b.x+11,b.y+2+rock);
      ctx.lineTo(b.x+8,b.y-1+rock); ctx.lineTo(b.x-8,b.y-1+rock); ctx.closePath(); ctx.fill();
      ctx.fillStyle=sv?"#7fd0a0":"#a97a4d"; ctx.fillRect(b.x-1,b.y-10+rock,2,9);
      ctx.fillStyle=sv?"rgba(200,240,215,.85)":"rgba(235,230,215,.8)"; ctx.beginPath();
      ctx.moveTo(b.x+1,b.y-9+rock); ctx.quadraticCurveTo(b.x+7,b.y-4+rock,b.x+1,b.y-1+rock); ctx.closePath(); ctx.fill();
      if (FD.on && FD.target===b && FD.phase==="warn"){
        const k=Math.min(1,FD.pt/FD_WARN), r=10+k*26;
        ctx.fillStyle=`rgba(224,90,70,${0.10+k*0.14})`;
        ctx.beginPath(); ctx.ellipse(b.x,b.y+2,r,r*0.42,0,0,7); ctx.fill();
        ctx.strokeStyle=`rgba(224,90,70,${0.35+k*0.5})`; ctx.lineWidth=2;
        ctx.beginPath(); ctx.ellipse(b.x,b.y+2,r,r*0.42,0,0,7); ctx.stroke();
      }
    }
  }
  const px=aiaPlayer.x, py=aiaPlayer.y;
  ctx.fillStyle="#2b3a4a"; ctx.beginPath(); ctx.ellipse(px,py+4,8,10,0,0,7); ctx.fill();
  ctx.fillStyle="#c9a978"; ctx.beginPath(); ctx.arc(px,py-8,6,0,7); ctx.fill();
  const g=ctx.createRadialGradient(VIEW_W/2,VIEW_H/2,VIEW_H*0.42,VIEW_W/2,VIEW_H/2,VIEW_H*0.86);
  g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,.36)");
  ctx.fillStyle=g; ctx.fillRect(0,0,VIEW_W,VIEW_H);
}


// --- renderAmbient (was main+369-377, 9 lines) ---
function renderAmbient(){
  if (!ambActive || !ambAnchor || performance.now()>ambUntil){
    if (ambEl.style.display!=="none") ambEl.style.display="none";
    return;
  }
  const [ax,ay]=w2s(ambAnchor.x, ambAnchor.y-38);
  ambEl.style.display="block"; ambEl.style.left=(ax*100)+"%"; ambEl.style.top=(ay*100)+"%";
  ambEl.textContent=ambText;
}


// --- careBadgeFor (was main+446-453, 8 lines) ---
function careBadgeFor(){
  const p = [];
  if (state.hunger <= 30) p.push("🍚");
  if (state.thirst <= 22) p.push("💧");
  if (state.hp <= 35) p.push("🩸");
  if (isNight()) p.push("🌙");
  return p;
}


// --- sceneNpcPos (was main+…, 10 lines) ---
/* 当前场景里「该显示关怀徽章的 NPC」站在哪：SCENE_NPC 只列了 5 个场景，
   海峡/太阳岛/伊萨卡与五个序章场景的 NPC 头顶从来看不到饥饿口渴图标。 */
function sceneNpcPos(sc){
  const direct = SCENE_NPC[sc]; if (direct) return direct;
  const spotNpc = {strait:"siren", sun:"cattle", ismaros:"rebuilder", lotus:"lotusman", cyclops:"polyphemus", ithaca:"telemachus"};
  const key = spotNpc[sc]; if (!key) return null;
  return ambientAnchor(key);
}


// --- drawCareBadge (was main+454-468, 15 lines) ---
function drawCareBadge(et){
  if (dlgOpen || titleOn || chapterOn || mapOpen) return;
  const npc = sceneNpcPos(scene); if (!npc) return;
  const badges = careBadgeFor(); if (!badges.length) return;
  const dx = npc.x - aiaPlayer.x, dy = npc.y - aiaPlayer.y;
  if (Math.hypot(dx, dy) > 210) return;
  const p = w2s(npc.x, npc.y - 56);
  ctx.save(); ctx.textAlign = "center"; ctx.font = "13px sans-serif";
  badges.forEach((b, idx) => {
    const bob = Math.sin(et*2 + idx) * 2;
    ctx.fillStyle = "rgba(8,14,26,.55)"; ctx.beginPath(); ctx.arc(p[0]+idx*16, p[1]+bob, 9.5, 0, 7); ctx.fill();
    ctx.fillText(b, p[0]+idx*16, p[1]+bob+4);
  });
  ctx.restore();
}


// --- drawGrain (was main+471-481, 11 lines) ---
function drawGrain(){
  if (!_grainPat){
    const g = document.createElement("canvas"); g.width = g.height = 160;
    const gc = g.getContext("2d");
    for (let i=0;i<220;i++){ gc.fillStyle = Math.random()<0.5 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.04)";
      gc.fillRect(Math.random()*160, Math.random()*160, 1+Math.random()*2, 1+Math.random()*2); }
    _grainPat = ctx.createPattern(g, "repeat");
  }
  const vx=cam.x-60, vy=cam.y-60, vw=VIEW_W/cam.zoom+120, vh=VIEW_H/cam.zoom+120;
  ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = _grainPat; ctx.fillRect(vx,vy,vw,vh); ctx.restore();
}


// --- drawStars (was main+485-495, 11 lines) ---
function drawStars(et, n){
  if (scene !== "world" || n <= 0) return;
  /* 批次 R1（画质）：3D 海图激活时不再画这层 2D 星空。
     实测（.temp/q-base2/q2-3d-world-night.png）：3D 天空 shader 已有真星空（只在天穹上半球），
     但这层 2D 星星是屏幕空间的——它撒在海面和陆地上，满屏白圆点像雪花屏。
     3D 下交给 shader，2D 下才用这层。 */
  if (w3dActive()) return;
  const vx=cam.x-60, vy=cam.y-60, vw=VIEW_W/cam.zoom+120, vh=VIEW_H/cam.zoom+120;
  ctx.save();
  for (const s of STARS){
    const tw = 0.5 + 0.5*Math.sin(et*1.6 + s.p);
    ctx.globalAlpha = n*(0.5 + 0.5*tw);
    ctx.fillStyle = "#f2fbff"; ctx.beginPath(); ctx.arc(vx+s.x/100*vw, vy+s.y/58*vh*0.72, s.r*1.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}


// --- aiaTile (was main+662-662, 1 lines) ---
function aiaTile(cx,cy){ return (cx<0||cy<0||cx>=ACOLS||cy>=AROWS)?"~":AIA[cy][cx]; }


// --- worldTile (was main+664-664, 1 lines) ---
function worldTile(cx,cy){ return (cx<0||cy<0||cx>=WCOLS||cy>=WROWS)?"~":WORLD[cy][cx]; }


// --- w3dActive (was main+759-761, 3 lines) ---
function w3dActive(){
  return scene==="world" && qualityMode!=="2d" && !!(window.W3D && W3D.ready && !W3D.failed);
}


// --- islandOpen (was main+982-987, 6 lines) ---
function islandOpen(is){
  if (typeof is.scene!=="string") return !!is.open;   /* 无场景的远岛（西西里）维持待开放；特洛伊 17h 起已开放（scene:"troy"） */
  if (state.freeSail) return true;                    /* 终章后自由漂流 */
  const g=GATES[is.scene];
  return g ? !!g.cond() : !!is.open;
}


// --- compassHTML (was main+1000-1009, 10 lines) ---
function compassHTML(obj){
  /* 批次 I1b：顶栏只显示短航向（obj.short），完整文案挪到 title 悬停 */
  const is = objectiveIsland(obj);
  const short = obj.short || obj.text;
  if (!is || scene!=="world") return `⛵ ${short}`;
  const dx = is.gx*WTS+WTS/2 - boat.x, dy = is.gy*WTS+WTS/2 - boat.y;
  if (Math.hypot(dx, dy) < 180) return `⛵ ${short}（按 E 登陆）`;
  const d = DIR8[(Math.round(Math.atan2(dy, dx)/(Math.PI/4))+8)%8];
  return `⛵ ${d.g} ${short}`;
}


// --- nextObjective (was main+1024-1040, 17 lines) ---
function nextObjective(){
  let obj;
  const q=getQuest("witch_grass");
  /* B2：六段旧路并入主线——13 段故事全部必经，开局就是特洛伊的木马之夜 */
  if (!state.troyDone) obj={k:"troy", text:"特洛伊 · 木马之夜——十二艘船的起点", short:"特洛伊 · 夜袭"};
  else if (!state.ismarosDone) obj={k:"ismaros", text:"伊斯玛洛斯——天亮前把这一站走完", short:"伊斯玛洛斯 · 战利品"};
  else if (!state.lotusDone) obj={k:"lotus", text:"食莲岛——尝一颗莲子，还是拖一个人上船", short:"食莲岛 · 莲子"};
  else if (!state.cyclopDone) obj={k:"cyclops", text:"独眼巨人岛——洞里那个声音还在问你的名字", short:"独眼巨人 · 名字"};
  else if (!state.telepylosDone) obj={k:"telepylos", text:"忒勒皮洛斯——最后一条船，守还是弃", short:"忒勒皮洛斯 · 船"};
  else if (!q) obj={k:"aia", text:"去埃阿亚岛找喀耳刻接下委托", short:"埃阿亚岛 · 接委托"};
  else if (!q.done) obj={k:"aia", text:q.ready?"回埃阿亚岛向喀耳刻复命":`采玛草 ${q.have}/${q.need}（岛东北草丛）`, short:q.ready?"埃阿亚岛 · 复命":`埃阿亚岛 · 玛草 ${q.have}/${q.need}`};
  else if (!state.prophecy) obj={k:"hades", text:"去冥界之岸：献上蜂蜜酒、面包、淡水，向特瑞西阿斯问路", short:"冥界之岸 · 问路"};
  else if (!state.aeoliaDone) obj={k:"aeolia", text:"风神岛——四阵风还锁在石牢里，风袋等着你", short:"风神岛 · 四风"};
  else if (state.straitStage<2 && !state.straitCleared) obj={k:"strait", text:"穿过声之海峡（先处置塞壬的歌：蜡，或桅杆）", short:"声之海峡"};
  else if (!state.sunStage && !state.sunBlessed && !state.sunWrath) obj={k:"sun", text:"去太阳岛——守住圣牛，或付出代价", short:"太阳岛 · 圣牛"};
  else if (!state.epilogueDone && !state.farewellHint) obj={k:"aia", text:"回埃阿亚岛——喀耳刻等你复命", short:"埃阿亚岛 · 复命"};
  else if (!state.ogygiaLeft) obj={k:"ogggia", text:"雾外还有一座岛——完美的天气，完美的一天", short:"奥吉吉亚 · 正题"};
  else if (!state.scheriaFarewell) obj={k:"scheria", text:"把你的故事讲给愿意听的人（斯克里岛）", short:"斯克里岛 · 讲故事"};
  else if (!state.finaleDone) obj={k:"ithaca", text:"雾散了——伊萨卡。回家，或者不归", short:"伊萨卡 · 归乡"};
  else obj={k:null, text:state.freeSail?"自由漂流 · 海图全开":"航程已完——想漂去哪就去哪", short:"自由漂流"};
  /* 批次 I1b：旧路未访清单撤出顶栏（顶栏只留一行短航向）——可选旧路的完整视图在任务面板（H2） */
  return obj;
}


// --- cg (was main+2373-2382, 10 lines) ---
function cg(x0,y0,x1,y1,stops){
  const key = x0+","+y0+","+x1+","+y1+";"+stops;
  let g = _gradCache.get(key);
  if (!g){
    g = ctx.createLinearGradient(x0,y0,x1,y1);
    for (let i=0;i<stops.length;i+=2) g.addColorStop(stops[i],stops[i+1]);
    _gradCache.set(key,g);
  }
  return g;
}


// --- drawWorld (was main+2383-2436, 54 lines) ---
// --- chartBg (was main+…, 21 lines) ---
/* 2D 世界底图：直接铺羊皮纸海图。
   旧版 2D 降级是逐格色块（青一块绿一块的方格阵），跟「地中海」毫无关系，
   也和玩家按 M 看到的海图完全不是一张图——照着图找岸会找不到岸。
   现在铺 scripts/build_seamap.py 用同一份 WORLD 网格生成的底图：
   底图 CELL=72px/格，游戏 WTS=40px/格 → 缩放到 WCOLS*WTS × WROWS*WTS 正好对齐。
   先预缩到一张离屏 canvas（1840×720），每帧只做 1:1 drawImage，避免每帧缩放大图。 */
let _chartCanvas = null, _chartTried = false;
function chartBg(){
  if (_chartTried) return _chartCanvas;
  _chartTried = true;
  try{
    const img = new Image();
    img.onload = ()=>{
      try{
        const c = document.createElement("canvas");
        c.width = WCOLS*WTS; c.height = WROWS*WTS;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, c.width, c.height);
        _chartCanvas = c;
      }catch(e){ _chartCanvas = null; }
    };
    img.onerror = ()=>{ _chartCanvas = null; };
    img.src = "concept-art/maps/01-世界海图.jpg";
  }catch(e){ _chartCanvas = null; }
  return _chartCanvas;
}


function drawWorld(et){
  const chart = chartBg();
  if (chart) ctx.drawImage(chart, 0, 0);
  else { ctx.fillStyle="#1b4e72"; ctx.fillRect(0,0,1000,600); }
  for (let cy=0; cy<WROWS; cy++) for (let cx=0; cx<WCOLS; cx++){
    const ch = worldTile(cx,cy), x=cx*WTS, y=cy*WTS;
    if (ch==="#"){
      if (!chart){
        ctx.fillStyle = ((cx+cy)%2)?GRASS_C:GRASS_D; ctx.fillRect(x,y,WTS,WTS);
        const g2=cg(0,y+WTS-3,0,y+WTS+9,[0,"#d4b078",.5,"#c9a06a",1,"#8f6b40"]); ctx.fillStyle=g2; ctx.fillRect(x,y+WTS-3,WTS,12);
      }
      continue;
    }
    if (ch==="G"){
      ctx.fillStyle=SAND; ctx.fillRect(x,y,WTS,WTS);
      ctx.fillStyle="#d8bf8a"; ctx.fillRect(x,y+WTS-3,WTS,3);
      continue;
    }
    if (ch==="X"){
      if (!chart){
        ctx.fillStyle="#2c6285"; ctx.fillRect(x,y,WTS,WTS);
        ctx.fillStyle="#5b7f96";
        ctx.beginPath(); ctx.moveTo(x+WTS/2-7,y+WTS/2+4); ctx.lineTo(x+WTS/2,y+WTS/2-7); ctx.lineTo(x+WTS/2+7,y+WTS/2+4); ctx.closePath(); ctx.fill();
      }else{
        /* 羊皮纸底图上不铺生硬的蓝色方块，只补一枚礁石标记 */
        ctx.fillStyle="rgba(104,132,152,.6)";
        ctx.beginPath(); ctx.ellipse(x+WTS/2, y+WTS/2+1, 7, 4, .4, 0, 7); ctx.fill();
        ctx.strokeStyle="rgba(255,255,255,.34)"; ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(x+WTS/2, y+WTS/2+4, 9, 4.5, .4, 0, 7); ctx.stroke();
      }
      continue;
    }
    if (!chart){
      const near = worldTile(cx,cy-1)!=="~"&&worldTile(cx,cy-1)!=="."||worldTile(cx,cy+1)!=="~"&&worldTile(cx,cy+1)!=="."||worldTile(cx-1,cy)!=="~"&&worldTile(cx-1,cy)!=="."||worldTile(cx+1,cy)!=="~"&&worldTile(cx+1,cy)!==".";
      ctx.fillStyle = near ? "#3f7fa8" : "#255a7f"; ctx.fillRect(x,y,WTS,WTS);
    }
    if ((cx*13+cy*7)%4===0){
      ctx.strokeStyle="rgba(255,255,255,.22)"; ctx.lineWidth=1.2;
      const ph=Math.sin(et*1.8+cx*1.7+cy*2.3)*2;
      ctx.beginPath(); ctx.moveTo(x+5,y+12+ph); ctx.lineTo(x+18,y+12+ph); ctx.stroke();
    }
  }
  /* 岛名标签 */
  ctx.textAlign="center"; ctx.font="600 11px 'Segoe UI','Microsoft YaHei'";
  for (const is of ISLANDS){
    const x=is.gx*WTS+WTS/2, y=is.gy*WTS-6;
    const isOpen = islandOpen(is);
    ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillText(is.name, x+1, y+1);
    ctx.fillStyle = isOpen ? "#ffffff" : "rgba(255,255,255,.55)"; ctx.fillText(is.name, x, y);
    if (!isOpen){
      ctx.fillStyle="rgba(255,255,255,.4)"; ctx.font="10px 'Segoe UI'";
      ctx.fillText("（待开放）", x, y+11); ctx.font="600 11px 'Segoe UI','Microsoft YaHei'";
    }
  }
  /* 海域名标签 */
  ctx.font="600 10px 'Segoe UI','Microsoft YaHei'";
  for (const s of SEAS){
    ctx.fillStyle="rgba(255,255,255,.42)";
    ctx.fillText(s.label, s.x*WTS+WTS/2, s.y*WTS+WTS/2);
  }
  ctx.font="600 11px 'Segoe UI','Microsoft YaHei'";
  drawWorldClouds(et);   /* 视差云影（两层速度差 → 航行时的空间纵深） */
  drawDolphins2D(et);    /* 批次 H8：海豚伴航（奥德修斯被海豚所救的本命意象） */
  drawGulls2D(et);       /* 批次 H8：岛际鸥群 */
  drawWindStreaks(et);   /* 批次 I2：风纹——水面短痕随风漂移，读得出风往哪边走 */
  drawFleets2D(et);      /* 批次 K3 · B1：海上势力船队——海上不只有你一条船 */
  drawStonePillar(et);   /* P2.3 石化石柱（world 图层内，W3D 关闭时由 2D 承担） */
  drawBoat(et);
}


// --- drawWindStreaks (was main+2438-2447, 10 lines) ---
function drawWindStreaks(et){
  if (scene!=="world" || w3dActive()) return;
  const wx = Math.cos(windDir), wy = Math.sin(windDir);
  ctx.strokeStyle="rgba(255,255,255,.15)"; ctx.lineWidth=1.5;
  for (let i=0;i<9;i++){
    const sx = (((i*173 + et*46*wx) % 1040) + 1040) % 1040 - 20;
    const sy = (((i*97 + et*46*wy) % 640) + 640) % 640 - 20;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx+wx*26, sy+wy*26); ctx.stroke();
  }
}


// --- drawDolphins2D (was main+2473-2490, 18 lines) ---
function drawDolphins2D(et){
  if (scene!=="world" || w3dActive()) return;   /* 3D 世界图有 3D 版海豚（world3d.js） */
  const leap = performance.now() < dolphinLeapUntil;
  for (const pod of DOLPHIN_PODS){
    for (let i=0;i<3;i++){
      const a = et*0.55 + i*2.1 + pod.r*0.01;
      const dx = pod.x + Math.cos(a)*pod.r, dy = pod.y + Math.sin(a)*pod.r*0.6;
      const face = Math.atan2(Math.cos(a)*0.6, -Math.sin(a));
      const hop = Math.max(0, Math.sin(et*(leap?4.5:2.4) + i*2.1)) * (leap?7:3);
      ctx.save(); ctx.translate(dx, dy - hop); ctx.rotate(face);
      ctx.fillStyle="#3d4c5c";
      ctx.beginPath(); ctx.ellipse(0,0,7,2.2,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2,-2); ctx.lineTo(1,-5); ctx.lineTo(3,-1.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle="rgba(255,255,255,.45)"; ctx.beginPath(); ctx.ellipse(-9,1.5,6,1.6,0,0,7); ctx.fill();
      ctx.restore();
    }
  }
}


// --- drawGulls2D (was main+2491-2506, 16 lines) ---
function drawGulls2D(et){
  if (scene!=="world" || w3dActive()) return;
  for (const is of ISLANDS){
    const cx = is.gx*WTS+WTS/2, cy = is.gy*WTS+WTS/2 - 6;
    for (let i=0;i<2;i++){
      const a = et*0.8*(i?1:-1) + i*2.4 + is.gx*0.1;
      const gx = cx + Math.cos(a)*(12+(i?6:0)), gy = cy + Math.sin(a)*7;
      const flap = Math.sin(et*9 + i*3)*2.4;
      ctx.strokeStyle="rgba(250,252,255,.85)"; ctx.lineWidth=1.6;
      ctx.beginPath();
      ctx.moveTo(gx-4, gy-flap*0.4); ctx.quadraticCurveTo(gx-1.5, gy-flap, gx, gy);
      ctx.quadraticCurveTo(gx+1.5, gy-flap, gx+4, gy-flap*0.4);
      ctx.stroke();
    }
  }
}


// --- drawWorldClouds (was main+2514-2522, 9 lines) ---
function drawWorldClouds(et){
  for (const c of CLOUDS){
    const x=((c.x + et*c.sp) % 1240) - 120;
    ctx.fillStyle=`rgba(232,240,248,${c.a})`;                       /* 云体受光面 */
    ctx.beginPath(); ctx.ellipse(x, c.y, c.r, c.r*0.40, 0, 0, 7); ctx.fill();
    ctx.fillStyle=`rgba(8,30,48,${(c.a*0.85).toFixed(3)})`;         /* 云影：稍滞后偏移 */
    ctx.beginPath(); ctx.ellipse(x+7, c.y+6, c.r*0.9, c.r*0.36, 0, 0, 7); ctx.fill();
  }
}


// --- drawEscortFleet (was main+2525-2542, 18 lines) ---
function drawEscortFleet(et){
  const n = Math.max(0, Math.min(11, (state.fleet||0)-1));
  if (!n || !boatTrail.length) return;
  const ES = 0.66;   /* 批次 H8：护航船随主船缩放 */
  for (let i=0;i<n;i++){
    const p = boatTrail[Math.max(0, boatTrail.length-1-(i+1)*14)];
    if (!p) break;
    const rock=Math.sin(et*1.9+i*1.3)*1.2;
    ctx.save(); ctx.translate(p.x, p.y+rock); ctx.scale(ES,ES);
    ctx.fillStyle="rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0,6,9,3.4,0,0,7); ctx.fill();
    ctx.fillStyle = i%2 ? "#5d3f24" : "#77522f";   /* 深浅两色剪影，前后可辨 */
    ctx.beginPath(); ctx.moveTo(-9,2); ctx.quadraticCurveTo(0,5,9,2);
    ctx.lineTo(6.5,-0.5); ctx.lineTo(-6.5,-0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(238,232,216,.72)"; ctx.beginPath();
    ctx.moveTo(0.8,-7); ctx.quadraticCurveTo(5.5,-3,0.8,-0.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}


// --- drawStonePillar (was main+2544-2553, 10 lines) ---
function drawStonePillar(et){
  if (scene!=="world" || !state.stonePillarDone) return;
  const px=SCHERIA_EXIT.x+184, py=SCHERIA_EXIT.y+116, sw=Math.sin(et*0.7)*1.2;   /* 批次 H9：石柱偏移同瓦距翻倍 */
  ctx.fillStyle="rgba(255,255,255,.30)"; ctx.beginPath(); ctx.ellipse(px,py+14,15+sw,4.5,0,0,7); ctx.fill();   /* 柱脚白沫 */
  ctx.fillStyle="#9aa4ab"; ctx.fillRect(px+2,py-28+sw*.4,5,42);                                               /* 柱身暗侧 */
  ctx.fillStyle="#cfd6da"; ctx.fillRect(px-6,py-28+sw*.4,9,42);                                               /* 柱身 */
  ctx.fillStyle="#eef1f3"; ctx.fillRect(px-6,py-28+sw*.4,4,42);                                               /* 受光棱 */
  ctx.fillStyle="#dde2e5"; ctx.fillRect(px-8,py-32+sw*.4,16,5);                                               /* 残檐 */
  ctx.fillStyle="rgba(0,0,0,.20)"; ctx.beginPath(); ctx.ellipse(px+11,py+15,9,2.8,0,0,7); ctx.fill();         /* 投影 */
}


// --- drawFleetHud (was main+2555-2561, 7 lines) ---
function drawFleetHud(){
  if (scene!=="telepylos" || !FD.on) return;
  ctx.font="600 14px 'Segoe UI','Microsoft YaHei'"; ctx.textAlign="center";
  const t = `守船 ${FD.wave}/${FD_WAVES} · 拖回 ${FD.saved} · 碎 ${FD.lost}`;
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillText(t, 501, 41);
  ctx.fillStyle="#f4efe4"; ctx.fillText(t, 500, 40);
}


// --- drawScyllaHud (was main+2563-2577, 15 lines) ---
function drawScyllaHud(){
  if (scene!=="strait" || !SC.on) return;
  ctx.textAlign="center";
  const t = `斯库拉六头 ${Math.min(SC.head+ (SC.phase==="return"||SC.phase==="idle"?1:0), SC_HEADS)}/${SC_HEADS} · 救回 ${SC.saved} · 被叼 ${SC.lost}`;
  ctx.font="600 14px 'Segoe UI','Microsoft YaHei'";
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillText(t, 501, 41);
  ctx.fillStyle="#e8eef4"; ctx.fillText(t, 500, 40);
  if (SC.phase==="strike"){                              /* 窗口提示条（0.6s 倒计时） */
    const r = Math.max(0, SC.pt/SC_WINDOW);
    ctx.fillStyle="rgba(30,60,80,.6)"; ctx.fillRect(380,56,240,10);
    ctx.fillStyle= r>0.6 ? "#ffd66b" : "#ff7a6b"; ctx.fillRect(382,58,236*r,6);
    ctx.font="600 12px 'Segoe UI'"; ctx.fillStyle="#ffd66b";
    ctx.fillText("按 E 砍/拉——救回这头船员！", 500, 84);
  }
}


// --- drawSuitorHud (was main+2578-2594, 17 lines) ---
function drawSuitorHud(){
  if (scene!=="ithaca" || !SU.on) return;
  ctx.textAlign="center";
  const t = `求婚者 ${SU.kills}/${SU_N} 已肃清 · 失手 ${SU.missed}`;
  ctx.font="600 14px 'Segoe UI','Microsoft YaHei'";
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillText(t, 501, 41);
  ctx.fillStyle="#e8eef4"; ctx.fillText(t, 500, 40);
  if (SU.phase==="strike"){
    const r = Math.max(0, SU.pt/SU_WINDOW);
    ctx.fillStyle="rgba(60,30,20,.6)"; ctx.fillRect(380,56,240,10);
    ctx.fillStyle= r>0.6 ? "#ffd66b" : "#ff7a6b"; ctx.fillRect(382,58,236*r,6);
    ctx.font="600 12px 'Segoe UI'"; ctx.fillStyle="#ffd66b";
    ctx.fillText("按 E 放箭——别让他近身！", 500, 84);
    ctx.fillStyle="rgba(240,220,190,.9)";
    ctx.fillText("「"+SU_NAMES[(SU.kills+SU.missed)%SU_NAMES.length]+"」扑上来了", 500, 102);
  }
}


// --- drawCampHud (was main+2596-2610, 15 lines) ---
function drawCampHud(){
  if (scene!=="ismaros" || !CAMP.on) return;
  ctx.textAlign="center";
  const t = `守营 · 火把波 ${Math.min(CAMP.wave+ (CAMP.phase==="retreat"?1:0), CAMP_N)}/${CAMP_N}`;
  ctx.font="600 14px 'Segoe UI','Microsoft YaHei'";
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillText(t, 501, 41);
  ctx.fillStyle="#ffd9b8"; ctx.fillText(t, 500, 40);
  if (CAMP.phase==="strike"){
    const r = Math.max(0, CAMP.pt/CAMP_WINDOW);
    ctx.fillStyle="rgba(80,35,15,.6)"; ctx.fillRect(380,56,240,10);
    ctx.fillStyle= r>0.6 ? "#ffd66b" : "#ff7a6b"; ctx.fillRect(382,58,236*r,6);
    ctx.font="600 12px 'Segoe UI'"; ctx.fillStyle="#ffd66b";
    ctx.fillText("火把扫过来——按 E 拍开！", 500, 84);
  }
}


// --- drawRamHud (was main+2612-2626, 15 lines) ---
function drawRamHud(){
  if (scene!=="cyclops" || !HIDE.on) return;
  ctx.textAlign="center";
  const t = `羊腹之下 ${Math.min(HIDE.n+(HIDE.phase==="ret"?1:0), HIDE_N)}/${HIDE_N} · 被抓 ${HIDE.caught}/${HIDE_MAX_CAUGHT}`;
  ctx.font="600 14px 'Segoe UI','Microsoft YaHei'";
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillText(t, 501, 41);
  ctx.fillStyle="#efe7d8"; ctx.fillText(t, 500, 40);
  if (HIDE.phase==="strike"){
    const r = Math.max(0, HIDE.pt/HIDE_WINDOW);
    ctx.fillStyle="rgba(40,25,15,.6)"; ctx.fillRect(380,56,240,10);
    ctx.fillStyle= r>0.6 ? "#ffd66b" : "#ff7a6b"; ctx.fillRect(382,58,236*r,6);
    ctx.font="600 12px 'Segoe UI'"; ctx.fillStyle="#ffd66b";
    ctx.fillText("巨人的手扫过来——屏息低头（E）！", 500, 84);
  }
}


// --- drawFishingHud (was main+2674-2701, 28 lines) ---
function drawFishingHud(){
  if (scene!=="world" || !FISH.on) return;
  const bx=270, by=486, bw=460, bh=58;
  ctx.fillStyle="rgba(8,14,24,.72)"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle="rgba(255,214,107,.5)"; ctx.fillRect(bx, by, bw, 2); ctx.fillRect(bx, by+bh-2, bw, 2);
  /* 轨道 */
  const tx=bx+16, tw=bw-32, ty=by+30;
  ctx.fillStyle="rgba(255,255,255,.14)"; ctx.fillRect(tx, ty-7, tw, 14);
  /* 绿区 */
  ctx.fillStyle="rgba(127,211,137,.45)";
  ctx.fillRect(tx + FISH.zone*tw, ty-10, FISH.ZONE_W*tw, 20);
  ctx.strokeStyle="rgba(127,211,137,.9)"; ctx.strokeRect(tx + FISH.zone*tw, ty-10, FISH.ZONE_W*tw, 20);
  /* 鱼影（小三角，随方向翻转） */
  const fx = tx + FISH.fish*tw;
  ctx.fillStyle="#9fd8ff";
  ctx.beginPath();
  ctx.moveTo(fx + FISH.fishDir*8, ty);
  ctx.lineTo(fx - FISH.fishDir*6, ty-6); ctx.lineTo(fx - FISH.fishDir*6, ty+6);
  ctx.closePath(); ctx.fill();
  /* 文案行 */
  ctx.textAlign="center"; ctx.font="600 12px 'Segoe UI','Microsoft YaHei'";
  ctx.fillStyle="#ffd66b";
  ctx.fillText(`上钩 ${FISH.hits}/${FISH.HITS} · 脱钩 ${FISH.miss}/${FISH.MISS} · ${Math.ceil(FISH.tLeft)}s —— E/F 提竿`, bx+bw/2, by-8);
  /* 时间条 */
  const tr = Math.max(0, FISH.tLeft/25);
  ctx.fillStyle="rgba(255,255,255,.16)"; ctx.fillRect(bx+16, by+bh-9, bw-32, 4);
  ctx.fillStyle= tr>0.35 ? "#7fd389" : "#ff7a6b"; ctx.fillRect(bx+16, by+bh-9, (bw-32)*tr, 4);
}


// --- drawDrifts (was main+2756-2784, 29 lines) ---
function drawDrifts(et){
  const w3dOn = !!w3dActive();   /* 2D 海图偏好/自动降级时走 2D 绘制 */
  if (scene!=="world" || w3dOn) return;
  for (const d of drifts){
    const bob = Math.sin(et*2.2 + d.x)*2.2;
    ctx.save(); ctx.translate(d.x, d.y + bob);
    ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, 5, 9, 3.2, 0, 0, 7); ctx.fill();
    if (d.kind === "bottle"){
      ctx.rotate(Math.sin(et*1.5 + d.x)*0.16);
      ctx.fillStyle="#7fae8f"; ctx.fillRect(-3, -8, 6, 14);
      ctx.fillStyle="#5d8a6c"; ctx.fillRect(-2, -11, 4, 4);
      ctx.fillStyle="rgba(255,246,214,.85)"; ctx.fillRect(-2, -5, 4, 7);
    } else {
      ctx.rotate(Math.sin(et*1.2 + d.y)*0.1);
      ctx.fillStyle="#8a6b42"; ctx.fillRect(-9, -6, 18, 12);
      ctx.strokeStyle="#6b5233"; ctx.lineWidth=1.5;
      ctx.strokeRect(-9, -6, 18, 12);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
    }
    /* 提示脉冲圈（近船时更亮） */
    const near = Math.hypot(boat.x-d.x, boat.y-d.y) < 90;
    if (near){
      const pr = 13 + Math.sin(et*4)*2.5;
      ctx.strokeStyle="rgba(255,214,107,.55)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
}


// --- drawMeteors (was main+2790-2805, 16 lines) ---
function drawMeteors(now){
  for (const m of meteors){
    const t = (now - m.born) / m.max;
    if (t < 0 || t > 1) continue;
    const a = t < 0.25 ? t/0.25 : 1-(t-0.25)/0.75;
    const sec = (now - m.born) / 1000;
    const x = m.x + m.vx*sec, y = m.y + m.vy*sec;
    const nl = Math.hypot(m.vx, m.vy)||1;
    const tx = x - m.vx/nl*m.len, ty = y - m.vy/nl*m.len;
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, `rgba(255,246,220,${(0.85*a).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,246,220,0)");
    ctx.strokeStyle = g; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  }
}


// --- drawBoat (was main+2806-2840, 35 lines) ---
function drawBoat(et){
  /* 尾迹采样：移动才推入，护航队沿真实航迹排布（停船时保持编队不塌） */
  if (scene==="world"){
    if (!_trailLast || Math.hypot(boat.x-_trailLast.x, boat.y-_trailLast.y) > 2.2){
      boatTrail.push({x:boat.x, y:boat.y}); _trailLast={x:boat.x, y:boat.y};
      if (boatTrail.length>240) boatTrail.shift();
    }
  }
  drawEscortFleet(et);
  const x=boat.x, y=boat.y, rock=Math.sin(et*1.6)*1.5;
  /* 批次 H8：船视尺度 ×0.62——旧比例船占 1.6 瓦（世界才 46×18 瓦），地中海读成澡盆；
     缩船=世界等效放大 1.6 倍，航行距离感/海面空旷感同步回归。逻辑坐标（碰撞/交互半径）不动。 */
  const BS = 0.62;
  const tw = performance.now() < (state.tailwindUntil||0);   /* 顺风中：尾迹加速线 */
  if (tw){
    ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=2;
    for (let i=0;i<3;i++){
      const l=24+i*11, o=(et*150)%16;
      ctx.globalAlpha=0.55-i*0.15;
      ctx.beginPath(); ctx.moveTo(x-20-l+o, y-6+i*6); ctx.lineTo(x-20+o, y-6+i*6); ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  ctx.fillStyle="rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x,y+8*BS,14*BS,5*BS,0,0,7); ctx.fill();
  ctx.save(); ctx.translate(x,y+rock); ctx.scale(BS,BS);
  ctx.fillStyle="#8a5a33"; ctx.beginPath();
  ctx.moveTo(-16,2); ctx.quadraticCurveTo(0,9,16,2); ctx.lineTo(12,-2); ctx.lineTo(-12,-2); ctx.closePath(); ctx.fill();
  ctx.fillStyle="#a97a4d"; ctx.fillRect(-2,-16,3,15);
  ctx.fillStyle="#f4efe4"; ctx.beginPath();
  if (tw){ ctx.moveTo(2,-19); ctx.quadraticCurveTo(13,-7,2,1); ctx.closePath(); }   /* 顺风满帆 */
  else { ctx.moveTo(2,-15); ctx.quadraticCurveTo(11,-6,2,0); ctx.closePath(); }
  ctx.fill();
  ctx.fillStyle="#243244"; ctx.fillRect(-4,-2,2,4);
  ctx.restore();
}


// --- drawAia (was main+2844-3185, 342 lines) ---
function drawAia(et){
  /* Pass1 水面：低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边） */
  const wf = terrWaterField(aiaTile, ACOLS, AROWS, ATS, "aia",
    (dep)=> terrMix("#2f6f96", "#4f8fb5", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  /* Pass1b 水面波纹（逐格短浪线，画在平滑水面之上） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aiaTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*11+cy*5)%3===0){
      ctx.strokeStyle="rgba(255,255,255,.25)"; ctx.lineWidth=1.5;
      const ph=Math.sin(et*1.7+cx*1.3+cy*2.1)*3;
      ctx.beginPath(); ctx.moveTo(x+8,y+20+ph); ctx.lineTo(x+22,y+20+ph); ctx.stroke();
    }
  }
  /* Pass1.5 岛屿整体投影 + 倒影：让岛"悬浮"在海面上 */
  ctx.save();
  ctx.fillStyle="rgba(8,24,38,.30)";
  ctx.beginPath(); ctx.ellipse(400, 448, 348, 52, 0, 0, 7); ctx.fill();
  ctx.fillStyle="rgba(140,180,120,.14)";   /* 岛的绿色倒影 */
  ctx.beginPath(); ctx.ellipse(400, 452, 320, 30, 0, 0, 7); ctx.fill();
  ctx.restore();
  /* Pass2 水侧装饰：崖下深水带 + 泡沫渐变 + 碎沫（都在崖面底沿以下） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aiaTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (aiaTile(cx,cy+1)==="~"){
      /* 深水带：崖脚下的暗色 */
      const dg=cg(0,y+ATS+TH-2,0,y+ATS+TH+13,[0,"rgba(18,48,68,.55)",1,"rgba(18,48,68,0)"]);
      ctx.fillStyle=dg; ctx.fillRect(x,y+ATS+TH-2,ATS,13);
      /* 泡沫渐变带 */
      const g=cg(0,y+ATS+TH,0,y+ATS+TH+11,[0,"rgba(255,255,255,.75)",.55,"rgba(255,255,255,.3)",1,"rgba(255,255,255,0)"]);
      ctx.fillStyle=g; ctx.fillRect(x,y+ATS+TH,ATS,11);
      /* 碎沫点（动） */
      ctx.fillStyle="rgba(255,255,255,.9)";
      for (let i=0;i<4;i++){
        const px=x+((cx*17+i*29)%5)*8+4, py=y+ATS+TH+1+((et*1.1+i*0.7+cx)%1)*8;
        ctx.fillRect(px,py,4,2);
      }
    }
    if (aiaTile(cx,cy-1)==="~"){ ctx.fillStyle=cg(0,y-8,0,y,[0,"rgba(255,255,255,0)",1,"rgba(255,255,255,.5)"]); ctx.fillRect(x,y-8,ATS,8); }
    if (aiaTile(cx-1,cy)==="~"){ ctx.fillStyle=cg(x-8,0,x,0,[0,"rgba(255,255,255,0)",1,"rgba(255,255,255,.5)"]); ctx.fillRect(x-8,y,8,ATS); }
    if (aiaTile(cx+1,cy)==="~"){ ctx.fillStyle=cg(x+ATS,0,x+ATS+8,0,[0,"rgba(255,255,255,.5)",1,"rgba(255,255,255,0)"]); ctx.fillRect(x+ATS,y,8,ATS); }
  }
  /* Pass3 崖面：盖在下方水格上部 → 陆地“浮”在海上
     批次 R2：只给「下邻是水」的边界格建崖面——旧版每格都建，
     内陆格只剩顶部 2px 露在顶面之外 → 整片草地被切出一条条横线（方格纸）。 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=aiaTile(cx,cy); if (ch==="~") continue;
    if (aiaTile(cx,cy+1)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#e0bd84",.35,"#c9a06a",.75,"#a37d4e",1,"#7c5c38"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
    ctx.strokeStyle="rgba(0,0,0,.16)"; ctx.lineWidth=1;
    for (let i=0;i<2;i++){
      const ox = ((cx*13+i*17)%3)*11+5;
      ctx.beginPath(); ctx.moveTo(x+ox, y+ATS+1); ctx.lineTo(x+ox-2, y+ATS+TH-2); ctx.stroke();
    }
    if ((cx*5+cy*3)%3===0){ ctx.fillStyle="rgba(0,0,0,.13)"; ctx.fillRect(x+7,y+ATS+5,9,3); }
    if ((cx*3+cy*7)%4===0){ ctx.fillStyle="rgba(255,255,255,.14)"; ctx.fillRect(x+21,y+ATS+9,7,2); }
  }
  /* Pass4 陆地顶面：最后画（盖住自身崖面顶部 2px，内部格崖面被下一行顶面遮盖） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=aiaTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch===","){
      /* 批次 R2：沙地多铺 1px 消接缝；删掉逐格「底 4px 暗边」（它在沙路上切出一条条横线） */
      ctx.fillStyle=SAND; ctx.fillRect(x-1,y-1,ATS+2,ATS+2);
      ctx.fillStyle="rgba(126,106,66,.22)";
      ctx.fillRect(x+8+((cx*13)%9), y+9+((cy*7)%11), 3, 2);
      ctx.fillRect(x+29-((cx*5)%7), y+27-((cy*3)%9), 2, 2);
      ctx.fillStyle="rgba(255,255,255,.5)";
      const ph=Math.sin(et*2+cx)*1.5;
      ctx.fillRect(x+4+ph, y+ATS+TH+4, 6, 2); ctx.fillRect(x+24-ph, y+ATS+TH+4, 5, 2);
      continue;
    }
    /* 批次 R2：底色改低频色变——旧版 ((cx*7+cy*13)%5) 两色伪随机，
       大面积读成色块拼图；低频 fbm 让相邻格几乎同色（格边不可见）而大范围有起伏 */
    ctx.fillStyle = terrTint(GRASS_C, GRASS_D, cx, cy, 20261107, 0.17);
    /* 批次 R2：向四周多铺 1px——相邻 fillRect 的抗锯齿边会露出底色，缝合成蓝色网格线 */
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);
    /* 羊皮纸底纹：每格几笔干草与墨点，破掉纯色方格；同一格位置固定，不会闪 */
    ctx.fillStyle="rgba(60,68,44,.16)";
    const g1=(cx*17+cy*29)%7, g2=(cx*31+cy*11)%7;
    ctx.fillRect(x+6+g1, y+10+g2, 6, 2);
    ctx.fillRect(x+24-g2, y+21+g1, 5, 2);
    if ((cx+cy)%2===0){
      ctx.strokeStyle="rgba(44,58,38,.16)"; ctx.lineWidth=1;
      const bx=x+8+((cx*5)%9), by=y+ATS-7;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+2,by-7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+30+((cy*7)%7), y+ATS-6); ctx.lineTo(x+27+((cy*7)%7), y+ATS-13); ctx.stroke();
    }
    if ((cx*3+cy*5)%7===0){ ctx.fillStyle="rgba(176,164,110,.26)"; ctx.fillRect(x+12,y+16,15,6); }
    /* 批次 R2：删掉逐格「顶 2px 白高光 + 底 2px 暗边」——这两条是「方格纸」观感的元凶 */
    if (ch==="F"){
      ctx.fillStyle="#463828"; ctx.fillRect(x+5,y+5,ATS-10,ATS-10);
      ctx.fillStyle="#5a4a35"; ctx.fillRect(x+9,y+9,ATS-18,ATS-18);
    }
    if (ch==="_"){
      ctx.fillStyle="#b98c5a"; ctx.fillRect(x-1,y-1,ATS+2,ATS+2);
      ctx.strokeStyle="rgba(0,0,0,.15)"; ctx.beginPath();
      ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke();
      ctx.fillStyle="#8a6134"; ctx.fillRect(x+4,y+ATS-4,4,TH+6); ctx.fillRect(x+ATS-8,y+ATS-4,4,TH+6);
      continue;
    }
    if (ch==="P"){
      ctx.fillStyle="#bfe3f5"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(255,255,255,.7)";
      const ph=Math.sin(et*2+cx)*2;
      ctx.beginPath(); ctx.moveTo(x+6,y+18+ph); ctx.lineTo(x+22,y+18+ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+16,y+30-ph); ctx.lineTo(x+34,y+30-ph); ctx.stroke();
      continue;
    }
  }
  /* 岸线：先压一条暗墨刻线，再点亮细白浪——向海图的铜版刻线靠拢 */
  const coastPath = ()=>{
    for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
      if (aiaTile(cx,cy)==="~") continue;
      const x=cx*ATS, y=cy*ATS;
      ctx.beginPath();
      if (aiaTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
      if (aiaTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
      if (aiaTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
      if (aiaTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
      ctx.stroke();
    }
  };
  ctx.strokeStyle="rgba(26,38,42,.42)"; ctx.lineWidth=4; coastPath();
  ctx.strokeStyle="rgba(246,238,214,.75)"; ctx.lineWidth=1.5; coastPath();

  /* ---------- 实体层：y-sort ---------- */
  const ents = [];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aiaTile(cx,cy)!=="T") continue;
    ents.push({y:cy*ATS+ATS*0.75, draw(){
      const x=cx*ATS+ATS/2, ty=cy*ATS+ATS*0.75, sway=Math.sin(et*1.2+cx)*1.4;
      ctx.fillStyle="rgba(20,40,25,.3)"; ctx.beginPath(); ctx.ellipse(x+7,ty+4,17,6,0,0,7); ctx.fill();
      ctx.fillStyle="#7a5230"; ctx.beginPath();
      ctx.moveTo(x-4.5,ty-2); ctx.lineTo(x-3,ty-20); ctx.lineTo(x+3,ty-20); ctx.lineTo(x+4.5,ty-2); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#3f5c39";
      ctx.beginPath(); ctx.arc(x+sway,ty-38,19,0,7); ctx.arc(x-13+sway,ty-27,12,0,7); ctx.arc(x+13+sway,ty-29,12,0,7); ctx.fill();
      ctx.strokeStyle="rgba(22,38,26,.35)"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(x+sway,ty-38,19,0,7); ctx.arc(x-13+sway,ty-27,12,0,7); ctx.arc(x+13+sway,ty-29,12,0,7); ctx.stroke();
      ctx.fillStyle="#5f7d4f";
      ctx.beginPath(); ctx.arc(x-7+sway,ty-39,8.5,0,7); ctx.arc(x+8+sway,ty-35,7,0,7); ctx.fill();
      ctx.fillStyle="rgba(226,232,196,.18)"; ctx.beginPath(); ctx.arc(x-4+sway,ty-43,5,0,7); ctx.fill();
    }});
  }
  ents.push({y:3*ATS+ATS, draw(){
    const hx=3.5*ATS, hy=3*ATS;
    ctx.fillStyle="rgba(20,35,50,.32)"; ctx.beginPath(); ctx.ellipse(hx+14,hy+ATS+2,62,15,0,0,7); ctx.fill();
    ctx.fillStyle="#c99b6a"; ctx.fillRect(hx-46,hy-34,92,ATS+30);
    ctx.fillStyle="#b07f4e"; ctx.fillRect(hx-46,hy-34,10,ATS+30);
    ctx.strokeStyle="#8a6134"; ctx.lineWidth=2; ctx.strokeRect(hx-46,hy-34,92,ATS+30);
    ctx.fillStyle="rgba(0,0,0,.1)"; ctx.fillRect(hx-46,hy-34,92,7);
    ctx.fillStyle="#6b4a2b"; ctx.fillRect(hx-13,hy-10,26,ATS+4);
    ctx.fillStyle="#d9b96a"; ctx.beginPath(); ctx.arc(hx+7,hy+10,2.5,0,7); ctx.fill();
    ctx.fillStyle="#5f8f6e"; ctx.fillRect(hx-38,hy-24,16,14); ctx.fillStyle="#cfe8f5"; ctx.fillRect(hx+22,hy-24,16,14);
    ctx.strokeStyle="#8a6134"; ctx.strokeRect(hx-38,hy-24,16,14); ctx.strokeRect(hx+22,hy-24,16,14);
    ctx.fillStyle="#7a4a26"; ctx.beginPath(); ctx.moveTo(hx-58,hy-30); ctx.lineTo(hx,hy-66); ctx.lineTo(hx+58,hy-30); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#a0522d"; ctx.beginPath(); ctx.moveTo(hx-56,hy-31); ctx.lineTo(hx,hy-64); ctx.lineTo(hx+56,hy-31); ctx.lineTo(hx+50,hy-27); ctx.lineTo(hx-50,hy-27); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(hx-54,hy-32); ctx.lineTo(hx,hy-62); ctx.lineTo(hx-6,hy-31); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#8a3d1f"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(hx-58,hy-30); ctx.lineTo(hx,hy-66); ctx.lineTo(hx+58,hy-30); ctx.stroke();
    ctx.fillStyle="#e8d9b0"; ctx.fillRect(hx-2,hy-70,4,8);
  }});
  ents.push({y:3*ATS+ATS*0.8, draw(){
    const x=9*ATS+ATS/2, y=3*ATS+ATS*0.8;
    ctx.fillStyle="rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x,y+8,13,4,0,0,7); ctx.fill();
    ctx.fillStyle="#2e3440"; ctx.beginPath(); ctx.ellipse(x,y,13,9,0,0,7); ctx.fill();
    ctx.fillStyle="#3b4252"; ctx.fillRect(x-13,y-6,26,7);
    ctx.fillStyle="#7bd389";
    for (let i=0;i<3;i++){ const ph=(et*1.4+i*0.9)%1;
      ctx.globalAlpha=1-ph; ctx.beginPath(); ctx.arc(x-7+i*7, y-9-ph*12, 2.4+ph*1.5, 0, 7); ctx.fill(); }
    ctx.globalAlpha=1;
  }});
  ents.push({y:8*ATS+ATS*0.85, draw(){
    const x=15*ATS+ATS/2, y=8*ATS+ATS*0.85;
    ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x,y+4,13,4.5,0,0,7); ctx.fill();
    ctx.fillStyle="#9aa7b4"; ctx.beginPath();
    ctx.moveTo(x-10,y+3); ctx.lineTo(x-9,y-24); ctx.quadraticCurveTo(x,y-31,x+9,y-24); ctx.lineTo(x+10,y+3); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#7f8c99";
    ctx.fillRect(x-6,y-20,12,3); ctx.fillRect(x-6,y-13,12,3); ctx.fillRect(x-5,y-6,10,6);
  }});
  for (const g of GRASS_NODES){
    ents.push({y:g.y+14, draw(){
      const x=g.x, y=g.y;
      ctx.fillStyle="rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x,y+13,11,4,0,0,7); ctx.fill();
      ctx.strokeStyle="#2f7d46"; ctx.lineWidth=2.4; ctx.lineCap="round";
      for (const [dx,h,tilt] of [[-8,15,-3],[0,20,0],[8,14,3]]){
        ctx.beginPath(); ctx.moveTo(dx+x, y+13); ctx.quadraticCurveTo(dx+tilt+x, y+13-h/2, dx+tilt*1.7+x, y+13-h); ctx.stroke();
      }
      const gl=0.6+Math.sin(et*2.4)*0.35;
      ctx.fillStyle=`rgba(234,247,255,${gl})`;
      ctx.beginPath(); ctx.arc(x, y-7, 2.6, 0, 7); ctx.arc(x+5, y-3, 1.8, 0, 7); ctx.arc(x-5, y-4, 1.8, 0, 7); ctx.fill();
    }});
  }
  /* 篝火（F：烤肉点，动态火苗 + 火星） */
  ents.push({y:8*ATS+ATS*0.95, draw(){
    const x=16*ATS+ATS/2, y=8*ATS+ATS*0.95;
    ctx.fillStyle="rgba(20,35,50,.25)"; ctx.beginPath(); ctx.ellipse(x,y+4,17,6,0,0,7); ctx.fill();
    ctx.fillStyle="#8b8f96";
    for (let i=0;i<7;i++){ const a=i*0.9; ctx.beginPath(); ctx.arc(x+Math.cos(a)*14, y+Math.sin(a)*5+2, 2.8, 0, 7); ctx.fill(); }
    ctx.strokeStyle="#6e4a2b"; ctx.lineWidth=4; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x-9,y+1); ctx.lineTo(x+9,y-4); ctx.moveTo(x+9,y+1); ctx.lineTo(x-9,y-4); ctx.stroke();
    const fl=Math.sin(et*7)*2, fl2=Math.sin(et*11+1)*1.6;
    ctx.fillStyle="#e0782e"; ctx.beginPath();
    ctx.moveTo(x-7,y-2); ctx.quadraticCurveTo(x-3,y-13-fl2, x+fl*0.5, y-17-fl);
    ctx.quadraticCurveTo(x+4,y-12+fl2, x+7,y-2); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#f7c74a"; ctx.beginPath();
    ctx.moveTo(x-4,y-2); ctx.quadraticCurveTo(x+fl*0.4,y-9-fl2, x+fl*0.6,y-11-fl);
    ctx.quadraticCurveTo(x+3,y-7+fl2, x+4,y-2); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,190,80,.85)";
    for (let i=0;i<3;i++){ const p=(et*1.2+i*0.37)%1; ctx.globalAlpha=1-p; ctx.fillRect(x-5+i*5+Math.sin(et*3+i)*2, y-15-p*15, 2, 2); }
    ctx.globalAlpha=1;
  }});
  /* 野猪（战斗实体：血条 + AI 状态可视化） */
  if (boar.alive) ents.push({y:boar.y+12, draw(){
    const sh = (performance.now()-boar.hitAt < 260) ? Math.sin(performance.now()/22)*3 : 0;
    const m = boar.mode, bx = boar.x + sh, by = boar.y;
    const hitK = (performance.now()-boar.hitAt < 170) ? 1 - (performance.now()-boar.hitAt)/170 : 0;   /* 受击压缩强度 */
    const oink = m==="tired" ? Math.sin(et*4)*2.5 : (boar.hp < boar.max ? Math.sin(et*6)*1 : 0);
    /* dash 残影：身后两道渐隐身形 */
    if (m==="dash" && boar.dir){
      for (let g=1; g<=2; g++){
        ctx.globalAlpha = 0.16/g;
        ctx.fillStyle = "#6e4b32";
        ctx.beginPath(); ctx.ellipse(bx-boar.dir.x*11*g, by-boar.dir.y*11*g, 14, 8, 0, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle="rgba(20,35,50,.28)"; ctx.beginPath(); ctx.ellipse(bx+4,by+12,15,5,0,0,7); ctx.fill();
    const flip = (m!=="idle" && boar.dir && boar.dir.x>0) ? -1 : 1;   /* 冲撞方向朝右时镜像 */
    const lean = m==="windup" ? 4 : 0;                              /* 蓄力后倾 */
    ctx.save();
    ctx.translate(bx, by); ctx.scale(flip*(1+hitK*0.16), 1-hitK*0.22);   /* squash&stretch：受击压扁瞬间回弹 */
    ctx.fillStyle="#6e4b32"; ctx.beginPath(); ctx.ellipse(lean, oink, 15, 9, 0, 0, 7); ctx.fill();          /* 身 */
    ctx.fillStyle="#5a3c27"; ctx.beginPath(); ctx.arc(lean-13, oink, 7, 0, 7); ctx.fill();                    /* 头 */
    ctx.fillStyle="#4c301e"; ctx.beginPath(); ctx.ellipse(lean-18, 2+oink, 3.5, 2.5, 0.3, 0, 7); ctx.fill();  /* 吻 */
    ctx.fillStyle="#efe3d0";                                                                    /* 獠牙 */
    ctx.beginPath(); ctx.moveTo(lean-19,oink); ctx.lineTo(lean-23,-5+oink); ctx.lineTo(lean-17,-1+oink); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#4c301e"; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(lean-6,8+oink); ctx.lineTo(lean-8,14); ctx.moveTo(lean+6,8+oink); ctx.lineTo(lean+8,14); ctx.stroke(); /* 腿 */
    ctx.strokeStyle="#e8b04b"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(lean+9,2+oink); ctx.lineTo(lean+13,2+oink); ctx.stroke();            /* 尾 */
    ctx.fillStyle="#241a12"; ctx.beginPath(); ctx.arc(lean-14,-3+oink,1.6,0,7); ctx.fill();       /* 眼 */
    if (nightAmount()>0.3){                                   /* 夜间威胁：月光下眼睛发红 */
      ctx.fillStyle=`rgba(255,60,40,${0.75*nightAmount()})`;
      ctx.beginPath(); ctx.arc(lean-14,-3+oink,2.1,0,7); ctx.fill();
    }
    if (m==="windup"){                                       /* 蓄力尘土：脚下向后扬 */
      ctx.fillStyle="rgba(160,130,90,.55)";
      for (let i=0;i<3;i++){
        const p=(et*3+i*0.33)%1; ctx.globalAlpha=(1-p)*0.55;
        ctx.fillRect(lean+8+p*10, 10-p*4, 3, 3);
      }
      ctx.globalAlpha=1;
    }
    if (m==="tired"){                                        /* 硬直喘气：汗滴 */
      ctx.fillStyle="rgba(140,200,240,.85)";
      ctx.beginPath(); ctx.arc(lean-10,-12+Math.sin(et*5)*1.5,1.8,0,7); ctx.arc(lean-4,-14+Math.cos(et*5)*1.5,1.5,0,7); ctx.fill();
    }
    ctx.restore();
    ctx.textAlign="center";
    if (m==="aggro"){ ctx.fillStyle="#ffd23e"; ctx.font="bold 13px 'Segoe UI'"; ctx.fillText("!", bx, by-18); }
    if (m==="windup"){ ctx.fillStyle="#ff9d3e"; ctx.font="bold 12px 'Segoe UI'"; ctx.fillText(boar.dir.x>0?"▶▶":"◀◀", bx, by-19); }
    /* 头顶血条 */
    if (boar.hp < boar.max){
      const w = 34, pct = Math.max(0, boar.hp/boar.max);
      ctx.fillStyle="rgba(10,16,24,.7)"; ctx.fillRect(bx-w/2-1, by-16, w+2, 6);
      ctx.fillStyle="#e05252"; ctx.fillRect(bx-w/2, by-15, w*pct, 4);
      ctx.strokeStyle="rgba(255,255,255,.5)"; ctx.lineWidth=1; ctx.strokeRect(bx-w/2-1.5, by-16.5, w+3, 7);
    }
  }});
  ents.push({y:witch.y+13, draw(){
    const x=witch.x, y=witch.y, bob=Math.sin(et*2)*1.5;
    const gazeOff = witchAI.mode==="gaze" ? -3 : 0;           /* 望海：面朝西 */
    ctx.fillStyle="rgba(20,35,50,.3)"; ctx.beginPath(); ctx.ellipse(x+6,y+15,14,5,0,0,7); ctx.fill();
    ctx.fillStyle="#5b4a8a"; ctx.beginPath(); ctx.moveTo(x-12,y+12); ctx.lineTo(x+12,y+12); ctx.lineTo(x,y-9-bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#f1c9a5"; ctx.beginPath(); ctx.arc(x,y-13-bob,7,0,7); ctx.fill();
    ctx.fillStyle="#2c2440"; ctx.beginPath(); ctx.arc(x+gazeOff,y-16-bob,8,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-9+gazeOff,y-14-bob); ctx.lineTo(x-15+gazeOff,y+3-bob); ctx.lineTo(x-8+gazeOff,y-6-bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#2c2440"; ctx.beginPath(); ctx.ellipse(x-2+gazeOff,y-27-bob,10,4,-0.4,0,7); ctx.fill();
    ctx.fillStyle="#ffd66b"; ctx.beginPath(); ctx.moveTo(x-1,y-26-bob); ctx.lineTo(x+6,y-22-bob); ctx.lineTo(x-1,y-18-bob); ctx.closePath(); ctx.fill();
    if (witchAI.mode==="stir"){                               /* 搅药：木勺朝坩埚摆动 */
      const px=9*ATS+ATS/2, py=3*ATS+ATS*0.8;
      const sw=Math.sin(et*3.2)*5;
      ctx.strokeStyle="#8a6134"; ctx.lineWidth=3; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(x+8,y-bob);
      ctx.quadraticCurveTo(x+8+(px-x)*0.5, y-bob+(py-y)*0.5-8, px-6+sw, py-6);
      ctx.stroke();
      ctx.fillStyle="rgba(123,211,137,.6)";
      ctx.beginPath(); ctx.arc(px-6+sw, py-5, 2.2, 0, 7); ctx.fill();
    }
    if (witchAI.mode==="pace" && Math.hypot(witch.x-witchAI.tx, witch.y-witchAI.ty)>3){ /* 踱步时裙摆微摆 */
      ctx.strokeStyle="rgba(91,74,138,.5)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x-10,y+10); ctx.lineTo(x-14-Math.sin(et*6)*3,y+14); ctx.stroke();
    }
  }});
  /* P1.2 赫尔墨斯：金杖少年（赠魔草后只留一圈淡金残光——game-feel：光晕呼吸+双蛇杖微缠） */
  ents.push({y:7*ATS+ATS/2+14, draw(){
    const x=6*ATS+ATS/2, y=7*ATS+ATS/2, met=state.hermesMet;
    const bob = met?0:Math.sin(et*2.4)*2;
    const glow = met ? 0.16 : 0.30+Math.sin(et*1.2)*0.10;
    const rg = ctx.createRadialGradient(x,y-8,2, x,y-8,34);
    rg.addColorStop(0,`rgba(255,214,107,${glow})`); rg.addColorStop(1,"rgba(255,214,107,0)");
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(x,y-8,34,0,7); ctx.fill();
    if (met) return;
    ctx.fillStyle="rgba(20,35,50,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+13,11,4,0,0,7); ctx.fill();
    ctx.fillStyle="#e8c766"; ctx.beginPath(); ctx.moveTo(x-9,y+11); ctx.lineTo(x+9,y+11); ctx.lineTo(x,y-7-bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#f1d9b8"; ctx.beginPath(); ctx.arc(x,y-11-bob,6,0,7); ctx.fill();
    ctx.fillStyle="#caa14e"; ctx.beginPath(); ctx.arc(x,y-14-bob,6.5,Math.PI,0); ctx.fill();
    /* 双蛇杖：细杖 + 两条相向缠绕的 sin 蛇（信使/医杖） */
    ctx.strokeStyle="#caa14e"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x+7,y+9-bob); ctx.lineTo(x+7,y-20-bob); ctx.stroke();
    for (const s of [-1,1]){
      ctx.strokeStyle = s<0 ? "#7bc389" : "#e08f5c"; ctx.lineWidth=1.6; ctx.beginPath();
      for (let t=0;t<=1;t+=0.12){
        const wy = y-19-bob+t*12, wx = x+7+Math.sin(t*Math.PI*3+et*2)*2.4*s;
        t===0 ? ctx.moveTo(wx,wy) : ctx.lineTo(wx,wy);
      }
      ctx.stroke();
    }
  }});
  /* P2.4 猪栏：立誓前=猪群伏笔（最老那头眼睛清醒得不像牲口）；立誓后=恢复人形的水手在搓洗 */
  ents.push({y:6*ATS+ATS/2+12, draw(){
    const x=11*ATS+ATS/2, y=6*ATS+ATS/2;
    ctx.fillStyle="rgba(90,68,44,.4)"; ctx.beginPath(); ctx.ellipse(x,y+6,34,10,0,0,7); ctx.fill();
    ctx.strokeStyle="#7a5c38"; ctx.lineWidth=3; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x-40,y-6); ctx.lineTo(x+40,y-6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-40,y+2); ctx.lineTo(x+40,y+2); ctx.stroke();
    if (!state.circeSworn){
      for (const [dx,dy,ph,old] of [[-16,3,0,false],[10,-2,2.1,false],[26,6,4.2,true]]){
        const bx=x+dx, by=y+dy+Math.sin(et*1.5+ph)*1.2;
        ctx.fillStyle= old ? "#d9a08a" : "#e6b8a4";
        ctx.beginPath(); ctx.ellipse(bx,by,10,6.5,0,0,7); ctx.fill();
        ctx.beginPath(); ctx.arc(bx+9,by-3,4.5,0,7); ctx.fill();
        ctx.fillStyle="#b87f6e"; ctx.beginPath(); ctx.ellipse(bx+13,by-3,2,1.6,0,0,7); ctx.fill();
        if (old){ ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(bx+9,by-4,1.4,0,7); ctx.arc(bx+11.5,by-4.6,1.4,0,7); ctx.fill();
          ctx.fillStyle="#1c2b3a"; ctx.beginPath(); ctx.arc(bx+9,by-4,.7,0,7); ctx.arc(bx+11.5,by-4.6,.7,0,7); ctx.fill(); }
        ctx.strokeStyle="#e6b8a4"; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(bx-11,by-1,3,Math.PI*0.2,Math.PI*1.4); ctx.stroke();
      }
    } else {
      for (const [dx,dy,ph] of [[-16,4,0],[8,0,1.4],[26,6,2.8]]){
        const px=x+dx, py=y+dy+Math.sin(et*1.2+ph)*0.8;
        ctx.fillStyle="rgba(20,35,50,.25)"; ctx.beginPath(); ctx.ellipse(px,py+9,9,3.5,0,0,7); ctx.fill();
        ctx.fillStyle="#4a5a6e"; ctx.beginPath(); ctx.ellipse(px,py+2,7,9,0,0,7); ctx.fill();
        ctx.fillStyle="#f1c9a5"; ctx.beginPath(); ctx.arc(px,py-10,5.5,0,7); ctx.fill();
        ctx.fillStyle="#5a4632"; ctx.beginPath(); ctx.arc(px,py-13,5.5,Math.PI,0); ctx.fill();
        ctx.strokeStyle="#4a5a6e"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(px+5,py-2); ctx.lineTo(px+9,py-5+Math.sin(et*3+ph)*1.5); ctx.stroke();
      }
    }
  }});
  pushPlayerEnt(ents);

  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();

  /* 暗线②收束：债清后的埃阿亚岛第一次天亮——恒常暖金晨光层 */
  if (scene==="aia" && state.sunlit){
    const g=cg(0,0,0,497,[0,"rgba(255,214,140,.20)",.55,"rgba(255,196,110,.10)",1,"rgba(255,190,90,.16)"]);
    ctx.fillStyle=g; ctx.fillRect(0,0,800,497);
  }
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: aiaTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "aia" });
  /* 边缘暗角（与冥界/风神岛/海峡统一：四景一致的电影感） */
  const vg=ctx.createRadialGradient(400,240,200, 400,240,560);
  vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(6,18,32,.34)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- pushPlayerEnt (was main+3187-3202, 16 lines) ---
function pushPlayerEnt(ents){
  ents.push({y:aiaPlayer.y+13, draw(){
    const x=aiaPlayer.x, y=aiaPlayer.y, sw=aiaPlayer.moving?Math.sin(aiaPlayer.step)*2.5:0;
    ctx.fillStyle="rgba(20,35,50,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+15,10,4,0,0,7); ctx.fill();
    ctx.fillStyle="#e8b04b"; ctx.fillRect(x-7+sw*0.3, y+2, 5, 10); ctx.fillRect(x+2-sw*0.3, y+2, 5, 10);
    ctx.fillStyle="#3b82f6"; ctx.fillRect(x-8, y-8, 16, 12);
    ctx.fillStyle="rgba(255,255,255,.18)"; ctx.fillRect(x-8, y-8, 16, 4);
    ctx.fillStyle="#f1c9a5"; ctx.beginPath(); ctx.arc(x, y-14, 7, 0, 7); ctx.fill();
    ctx.fillStyle="#5a3d2b"; ctx.beginPath(); ctx.arc(x, y-16, 7, Math.PI, 0); ctx.fill();
    if (aiaPlayer.face==="left"){ ctx.fillStyle="#243244"; ctx.fillRect(x-5,y-15,2,2); }
    else if (aiaPlayer.face==="right"){ ctx.fillStyle="#243244"; ctx.fillRect(x+3,y-15,2,2); }
    else { ctx.fillStyle="#243244"; ctx.fillRect(x-4,y-15,2,2); ctx.fillRect(x+2,y-15,2,2); }
    if (state.equipped){ ctx.strokeStyle="#8a6b47"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(x+9,y+6); ctx.lineTo(x+15,y-14); ctx.stroke(); }
  }});
}


// --- drawHades (was main+3205-3418, 214 lines) ---
function drawHades(et){
  /* Pass1 冥河水格 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (hTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(hTile, ACOLS, AROWS, ATS, "hades",
    (dep)=> terrMix("#0c1622", "#14202e", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (hTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*11+cy*5)%3===0){
      ctx.strokeStyle="rgba(127,209,200,.20)"; ctx.lineWidth=1.4;
      const ph=Math.sin(et*1.1+cx*1.3+cy*2.1)*3;
      ctx.beginPath(); ctx.moveTo(x+8,y+20+ph); ctx.lineTo(x+22,y+20+ph); ctx.stroke();
    }
  }
  /* 整体投影（冥界浮在更黑的水上） */
  ctx.fillStyle="rgba(2,6,10,.5)";
  ctx.beginPath(); ctx.ellipse(400, 448, 348, 52, 0, 0, 7); ctx.fill();
  /* Pass2 水侧磷光边 + 深暗带 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (hTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (hTile(cx,cy+1)==="~"){
      const dg=cg(0,y+ATS+TH-2,0,y+ATS+TH+13,[0,"rgba(2,6,10,.6)",1,"rgba(2,6,10,0)"]);
      ctx.fillStyle=dg; ctx.fillRect(x,y+ATS+TH-2,ATS,13);
      const g=cg(0,y+ATS+TH,0,y+ATS+TH+10,[0,"rgba(127,209,200,.28)",.5,"rgba(127,209,200,.1)",1,"rgba(127,209,200,0)"]);
      ctx.fillStyle=g; ctx.fillRect(x,y+ATS+TH,ATS,10);
    }
    if (hTile(cx,cy-1)==="~"){ ctx.fillStyle=cg(0,y-8,0,y,[0,"rgba(127,209,200,0)",1,"rgba(127,209,200,.22)"]); ctx.fillRect(x,y-8,ATS,8); }
    if (hTile(cx-1,cy)==="~"){ ctx.fillStyle=cg(x-8,0,x,0,[0,"rgba(127,209,200,0)",1,"rgba(127,209,200,.22)"]); ctx.fillRect(x-8,y,8,ATS); }
    if (hTile(cx+1,cy)==="~"){ ctx.fillStyle=cg(x+ATS,0,x+ATS+8,0,[0,"rgba(127,209,200,.22)",1,"rgba(127,209,200,0)"]); ctx.fillRect(x+ATS,y,8,ATS); }
  }
  /* Pass3 冷崖面 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=hTile(cx,cy); if (ch==="~") continue;
    if (hTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#322e40",.35,"#282437",.75,"#1c1928",1,"#14111e"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
    ctx.strokeStyle="rgba(0,0,0,.3)"; ctx.lineWidth=1;
    for (let i=0;i<2;i++){
      const ox = ((cx*13+i*17)%3)*11+5;
      ctx.beginPath(); ctx.moveTo(x+ox, y+ATS+1); ctx.lineTo(x+ox-2, y+ATS+TH-2); ctx.stroke();
    }
  }
  /* Pass4 地面 / 冥路 / 栈桥 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=hTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch===","){
      ctx.fillStyle="#3d4552"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="#2b3240"; ctx.fillRect(x,y+ATS-4,ATS,4);
      ctx.fillStyle="rgba(127,209,200,.14)";
      const ph=Math.sin(et*1.6+cx)*1.5;
      ctx.fillRect(x+4+ph, y+ATS+TH+4, 6, 2); ctx.fillRect(x+24-ph, y+ATS+TH+4, 5, 2);
      continue;
    }
    /* 批次 R2：底色改低频色变（terrTint）——旧版单色平涂，无起伏 */
    ctx.fillStyle = terrTint("#141a24", "#1d2532", cx, cy, 20261108, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    if ((cx*5+cy*3)%4===0){ ctx.fillStyle="rgba(127,209,200,.08)"; ctx.fillRect(x+6,y+8,8,3); }
    if ((cx*3+cy*7)%5===0){ ctx.fillStyle="rgba(127,209,200,.05)"; ctx.fillRect(x+20,y+22,10,4); }
    if (ch==="_"){
      ctx.fillStyle="#343945"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.35)"; ctx.beginPath();
      ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke();
      ctx.fillStyle="#262b36"; ctx.fillRect(x+4,y+ATS-4,4,TH+6); ctx.fillRect(x+ATS-8,y+ATS-4,4,TH+6);
      continue;
    }
  }
  /* 岸线磷光亮边 */
  ctx.strokeStyle="rgba(127,209,200,.5)"; ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (hTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (hTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (hTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (hTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (hTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }

  /* ---------- 实体层 y-sort ---------- */
  const ents = [];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (hTile(cx,cy)!=="T") continue;
    ents.push({y:cy*ATS+ATS*0.75, draw(){
      const x=cx*ATS+ATS/2, ty=cy*ATS+ATS*0.75, sway=Math.sin(et*0.8+cx)*0.8;
      /* 白杨：银灰细干 + 狭长暗青冠 */
      ctx.fillStyle="rgba(4,8,14,.45)"; ctx.beginPath(); ctx.ellipse(x+6,ty+4,10,4,0,0,7); ctx.fill();
      ctx.fillStyle="#5a5f6e"; ctx.fillRect(x-2.5+sway*0.5, ty-34, 5, 34);
      ctx.strokeStyle="rgba(127,209,200,.16)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x-2+sway, ty-12); ctx.lineTo(x+2+sway, ty-30); ctx.stroke();
      ctx.fillStyle="#24444e";
      ctx.beginPath(); ctx.ellipse(x+sway, ty-46, 8, 16, 0, 0, 7); ctx.fill();
      ctx.fillStyle="#2f5560";
      ctx.beginPath(); ctx.ellipse(x-4+sway, ty-38, 5, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle="rgba(127,209,200,.10)"; ctx.beginPath(); ctx.ellipse(x+2+sway, ty-50, 4, 8, 0, 0, 7); ctx.fill();
    }});
  }
  /* 献祭沟 */
  ents.push({y:3*ATS+ATS*0.9, draw(){
    const x=11*ATS+ATS/2, y=3*ATS+ATS*0.9;
    ctx.fillStyle="rgba(4,8,14,.5)"; ctx.beginPath(); ctx.ellipse(x,y+6,26,8,0,0,7); ctx.fill();
    ctx.fillStyle="#4a4f5e";
    for (let i=0;i<8;i++){ const a=i*0.785; ctx.beginPath(); ctx.arc(x+Math.cos(a)*24, y+Math.sin(a)*9+3, 4, 0, 7); ctx.fill(); }
    ctx.fillStyle="#05070c"; ctx.beginPath(); ctx.ellipse(x, y+2, 17, 7, 0, 0, 7); ctx.fill();
    const glow = state.offered ? 0.55 : 0.22;
    ctx.fillStyle=`rgba(200,60,45,${glow})`; ctx.beginPath(); ctx.ellipse(x, y+2, 14, 5, 0, 0, 7); ctx.fill();
    if (state.offered){ ctx.fillStyle="rgba(255,110,70,.30)"; ctx.beginPath(); ctx.ellipse(x, y+1, 10, 3.5, 0, 0, 7); ctx.fill(); }
    /* 烟气：青白磷光粒子上升 */
    for (let i=0;i<4;i++){
      const p=(et*0.55+i*0.25)%1;
      ctx.globalAlpha=(1-p)*0.35;
      ctx.fillStyle = state.offered ? "#c76a5a" : "#9fd8cf";
      ctx.fillRect(x-8+((i*17)%12)+Math.sin(et*2+i)*3, y-4-p*22, 3, 3);
    }
    ctx.globalAlpha=1;
  }});
  /* P1.4 冥界三影（y-sort 实体）：亡母安提克勒娅 / 阿喀琉斯 / 阿伽门农 */
  ents.push({y:8*ATS+ATS*0.9, draw(){
    const x=14*ATS+ATS/2, y=8*ATS+ATS*0.9, sway=Math.sin(et*0.6)*1.2;
    const a = state.oldName ? 0.50 : 0.42;   /* 幽灵感保留、但可读（原 0.34/0.26 偏淡） */
    ctx.fillStyle="rgba(5,9,14,.5)"; ctx.beginPath(); ctx.ellipse(x,y+4,14,5,0,0,7); ctx.fill();
    ctx.fillStyle=`rgba(210,224,232,${a})`;
    ctx.beginPath(); ctx.moveTo(x-9,y+3); ctx.quadraticCurveTo(x-11+sway,y-22,x-4+sway,y-34);
    ctx.quadraticCurveTo(x+sway,y-40,x+5+sway,y-33); ctx.quadraticCurveTo(x+11+sway,y-20,x+9,y+3); ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(214,228,236,${a+0.08})`;
    ctx.beginPath(); ctx.ellipse(x+sway*0.7,y-36,6,7,0,0,7); ctx.fill();
    ctx.strokeStyle=`rgba(180,205,215,${a*0.8})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x-4+sway*0.7,y-32); ctx.quadraticCurveTo(x-7+sway,y-20,x-5+sway,y-10); ctx.stroke();
    const g=ctx.createRadialGradient(x,y-18,2,x,y-18,26);
    g.addColorStop(0,`rgba(159,216,207,${0.10+(state.motherHug||0)*0.02})`); g.addColorStop(1,"rgba(159,216,207,0)");
    ctx.fillStyle=g; ctx.fillRect(x-26,y-46,52,56);
  }});
  ents.push({y:4*ATS+ATS*0.9, draw(){
    const x=14*ATS+ATS/2, y=4*ATS+ATS*0.9, sway=Math.sin(et*0.5+2)*1.0;
    const a = state.achillesHeard ? 0.36 : 0.44;
    ctx.fillStyle="rgba(5,9,14,.5)"; ctx.beginPath(); ctx.ellipse(x,y+4,15,5,0,0,7); ctx.fill();
    ctx.fillStyle=`rgba(186,200,214,${a})`;
    ctx.beginPath(); ctx.moveTo(x-8,y+3); ctx.lineTo(x-6+sway*0.4,y-30); ctx.lineTo(x+6+sway*0.4,y-30); ctx.lineTo(x+8,y+3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+sway*0.4,y-36,6.5,7,0,0,7); ctx.fill();
    ctx.strokeStyle=`rgba(140,160,180,${a+0.12})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+10,y+2); ctx.lineTo(x+16+sway,y-44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+13.5+sway,y-38); ctx.lineTo(x+19+sway,y-42); ctx.stroke();
    ctx.fillStyle=`rgba(255,200,120,${0.10+Math.sin(et*1.3)*0.04})`; ctx.beginPath(); ctx.arc(x+sway*0.4,y-36,9,0,7); ctx.fill();
  }});
  ents.push({y:10*ATS+ATS*0.9, draw(){
    const x=13*ATS+ATS/2, y=10*ATS+ATS*0.9, sway=Math.sin(et*0.45+4)*0.9;
    const a = state.agamemnonHeard ? 0.36 : 0.44;
    ctx.fillStyle="rgba(5,9,14,.5)"; ctx.beginPath(); ctx.ellipse(x,y+4,14,5,0,0,7); ctx.fill();
    ctx.fillStyle=`rgba(198,188,170,${a})`;
    ctx.beginPath(); ctx.moveTo(x-8,y+3); ctx.lineTo(x-7+sway*0.4,y-26); ctx.lineTo(x+7+sway*0.4,y-26); ctx.lineTo(x+8,y+3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+sway*0.4,y-32,6,6.5,0,0,7); ctx.fill();
    ctx.strokeStyle=`rgba(120,108,88,${a+0.14})`; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(x-11,y+3); ctx.lineTo(x-14+sway,y-28); ctx.stroke();
    ctx.fillStyle=`rgba(230,190,90,${a+0.16})`;
    ctx.fillRect(x-2+sway*0.4,y-34,1.6,1.6); ctx.fillRect(x+2.4+sway*0.4,y-34,1.6,1.6);
  }});
  /* 亡魂（游荡的半透明轮廓，纯装饰） */
  for (let gh of GHOSTS){
    ents.push({y:gh.by+10, draw(){
      const x = gh.bx + Math.sin(et*gh.p)*gh.ax;
      const y = gh.by + Math.sin(et*gh.p*1.3)*gh.ay;
      const a = 0.28 + Math.sin(et*1.5+gh.p)*0.1;
      ctx.globalAlpha = a;
      ctx.fillStyle="#bfe8e2";
      ctx.beginPath(); ctx.moveTo(x-8,y+10); ctx.quadraticCurveTo(x-10,y-4,x,y-6);
      ctx.quadraticCurveTo(x+10,y-4,x+8,y+10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y-12, 5.5, 0, 7); ctx.fill();
      ctx.globalAlpha = a*0.6;
      ctx.fillStyle="#7fd1c8"; ctx.fillRect(x-10, y+10, 20, 2);
      ctx.globalAlpha = 1;
    }});
  }
  /* 特瑞西阿斯（献祭前模糊半透明，献祭后显形） */
  ents.push({y:seer.y+13, draw(){
    const x=seer.x, y=seer.y+Math.sin(et*1.2)*1.2;
    ctx.globalAlpha = state.offered ? 1 : 0.55;
    /* 淡青 aura */
    ctx.fillStyle="rgba(127,209,200,.10)"; ctx.beginPath(); ctx.arc(x, y-4, 26, 0, 7); ctx.fill();
    ctx.fillStyle="rgba(4,8,14,.4)"; ctx.beginPath(); ctx.ellipse(x+4,y+14,12,4,0,0,7); ctx.fill();
    /* 白袍 */
    ctx.fillStyle="#dfe3ea"; ctx.beginPath();
    ctx.moveTo(x-11,y+12); ctx.quadraticCurveTo(x-9,y-12,x-4,y-16);
    ctx.lineTo(x+4,y-16); ctx.quadraticCurveTo(x+9,y-12,x+11,y+12); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#c3c9d6"; ctx.fillRect(x-11,y+4,22,8);
    /* 头（闭眼盲者） */
    ctx.fillStyle="#e8dcc8"; ctx.beginPath(); ctx.arc(x, y-21, 7, 0, 7); ctx.fill();
    ctx.strokeStyle="#4a4438"; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(x-5,y-21); ctx.lineTo(x+5,y-21); ctx.stroke();
    /* 光头/白发 */
    ctx.fillStyle="#cdd4e0"; ctx.beginPath(); ctx.arc(x, y-24, 6.5, Math.PI, 0); ctx.fill();
    /* 曲杖 */
    ctx.strokeStyle="#2b2f3a"; ctx.lineWidth=2.6;
    ctx.beginPath(); ctx.moveTo(x+12,y+12); ctx.lineTo(x+10,y-18);
    ctx.quadraticCurveTo(x+9,y-26,x+3,y-26); ctx.stroke();
    /* 杖顶微光（亡者之眼） */
    ctx.fillStyle="rgba(159,216,207,.85)"; ctx.beginPath(); ctx.arc(x+3, y-26, 2.2+Math.sin(et*2.4)*0.7, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }});
  pushPlayerEnt(ents);

  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();

  /* 全屏磷光浮游粒子 + 边缘暗角 */
  for (let i=0;i<14;i++){
    const p=(et*0.12+i*0.071)%1;
    const px=((i*137)%780)+Math.sin(et*0.5+i)*20, py=p*480;
    ctx.globalAlpha=0.10+Math.sin(et+i)*0.06;
    ctx.fillStyle="#9fd8cf"; ctx.fillRect(px, py, 2, 2);
  }
  ctx.globalAlpha=1;
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: hTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "hades" });
  const vg=ctx.createRadialGradient(400,240,180, 400,240,560);
  vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(2,4,8,.55)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawAeolia (was main+3421-3646, 226 lines) ---
function drawAeolia(et){
  /* Pass1 云海格 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aeTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(aeTile, ACOLS, AROWS, ATS, "aeolia",
    (dep)=> terrMix("#c3d2e2", "#dce7f2", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aeTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*11+cy*5)%3===0){
      ctx.strokeStyle="rgba(255,255,255,.5)"; ctx.lineWidth=2;
      const ph=Math.sin(et*0.9+cx*1.3+cy*2.1)*4;
      ctx.beginPath(); ctx.moveTo(x+6,y+20+ph); ctx.lineTo(x+24,y+20+ph); ctx.stroke();
    }
  }
  /* 岛在云上的投影 + 云面反光 */
  ctx.fillStyle="rgba(60,84,110,.30)";
  ctx.beginPath(); ctx.ellipse(400, 448, 348, 52, 0, 0, 7); ctx.fill();
  ctx.fillStyle="rgba(255,255,255,.30)";
  ctx.beginPath(); ctx.ellipse(400, 452, 320, 30, 0, 0, 7); ctx.fill();
  /* Pass2 云缘流 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aeTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (aeTile(cx,cy+1)==="~"){
      const dg=cg(0,y+ATS+TH-2,0,y+ATS+TH+13,[0,"rgba(52,76,100,.5)",1,"rgba(52,76,100,0)"]);
      ctx.fillStyle=dg; ctx.fillRect(x,y+ATS+TH-2,ATS,13);
      const g=cg(0,y+ATS+TH,0,y+ATS+TH+11,[0,"rgba(255,255,255,.9)",.55,"rgba(255,255,255,.4)",1,"rgba(255,255,255,0)"]);
      ctx.fillStyle=g; ctx.fillRect(x,y+ATS+TH,ATS,11);
      ctx.fillStyle="rgba(255,255,255,.95)";
      for (let i=0;i<4;i++){
        const px=x+((cx*17+i*29)%5)*8+4, py=y+ATS+TH+1+((et*0.8+i*0.7+cx)%1)*8;
        ctx.fillRect(px,py,5,2);
      }
    }
    if (aeTile(cx,cy-1)==="~"){ ctx.fillStyle=cg(0,y-8,0,y,[0,"rgba(255,255,255,0)",1,"rgba(255,255,255,.6)"]); ctx.fillRect(x,y-8,ATS,8); }
    if (aeTile(cx-1,cy)==="~"){ ctx.fillStyle=cg(x-8,0,x,0,[0,"rgba(255,255,255,0)",1,"rgba(255,255,255,.6)"]); ctx.fillRect(x-8,y,8,ATS); }
    if (aeTile(cx+1,cy)==="~"){ ctx.fillStyle=cg(x+ATS,0,x+ATS+8,0,[0,"rgba(255,255,255,.6)",1,"rgba(255,255,255,0)"]); ctx.fillRect(x+ATS,y,8,ATS); }
  }
  /* Pass3 崖面（浮岛岩：暖白岩 → 蜜色） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=aeTile(cx,cy); if (ch==="~") continue;
    if (aeTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#f2e3c4",.35,"#dcc39a",.75,"#b3926a",1,"#8a6c48"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
    ctx.strokeStyle="rgba(0,0,0,.12)"; ctx.lineWidth=1;
    for (let i=0;i<2;i++){
      const ox = ((cx*13+i*17)%3)*11+5;
      ctx.beginPath(); ctx.moveTo(x+ox, y+ATS+1); ctx.lineTo(x+ox-2, y+ATS+TH-2); ctx.stroke();
    }
  }
  /* Pass4 地面 / 云径 / 云桥 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=aeTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch===","){
      ctx.fillStyle="#eee7d2"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="#d6cbaa"; ctx.fillRect(x,y+ATS-4,ATS,4);
      ctx.fillStyle="rgba(255,255,255,.6)";
      const ph=Math.sin(et*2.4+cx)*2;
      ctx.fillRect(x+4+ph, y+ATS+TH+4, 7, 2); ctx.fillRect(x+24-ph, y+ATS+TH+4, 5, 2);
      continue;
    }
    /* 批次 R2：底色改低频色变（terrTint）——旧版两色伪随机拼成色块图 */
    ctx.fillStyle = terrTint("#cfe3b0", "#b9d69c", cx, cy, 20261109, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="#a3c788"; ctx.fillRect(x+9,y+24,7,4);
    /* 批次 R2：删掉逐格「顶 3px 白高光 + 底 3px 暗边」——方格纸观感的元凶 */
    if (ch==="_"){
      ctx.fillStyle="#eef3f8"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(140,160,185,.4)"; ctx.beginPath();
      ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke();
      ctx.fillStyle="#c7d4e2"; ctx.fillRect(x+4,y+ATS-4,4,TH+6); ctx.fillRect(x+ATS-8,y+ATS-4,4,TH+6);
      continue;
    }
  }
  /* 岸线亮边 */
  ctx.strokeStyle="rgba(255,255,255,.85)"; ctx.lineWidth=2;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aeTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (aeTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (aeTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (aeTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (aeTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }

  /* ---------- 实体层：y-sort ---------- */
  const ents = [];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (aeTile(cx,cy)!=="T") continue;
    ents.push({y:cy*ATS+ATS*0.75, draw(){
      /* 风柱：白石柱 + 螺旋风纹 + 环绕风丝 */
      const x=cx*ATS+ATS/2, ty=cy*ATS+ATS*0.75;
      ctx.fillStyle="rgba(70,95,120,.28)"; ctx.beginPath(); ctx.ellipse(x+6,ty+4,13,5,0,0,7); ctx.fill();
      ctx.fillStyle="#eee6d2"; ctx.fillRect(x-5,ty-34,10,36);
      ctx.fillStyle="#d8cdb2"; ctx.fillRect(x+1,ty-34,4,36);
      ctx.strokeStyle="#b7a888"; ctx.lineWidth=1.6;
      for (let i=0;i<3;i++){ const wy=ty-28+i*10;
        ctx.beginPath(); ctx.moveTo(x-4,wy); ctx.quadraticCurveTo(x+3,wy-3,x+4,wy); ctx.stroke(); }
      const a=et*1.3+cx;
      ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(x+Math.sin(a)*3, ty-40, 6+Math.sin(a*0.7)*2, 0.4, 3.4); ctx.stroke();
    }});
  }
  /* 风之祭坛（青铜 + 十二道风纹） */
  ents.push({y:3*ATS+ATS*0.85, draw(){
    const x=9*ATS+ATS/2, y=3*ATS+ATS*0.85;
    const lit = getQuest("aeolia_winds") && getQuest("aeolia_winds").done;
    ctx.fillStyle="rgba(70,95,120,.25)"; ctx.beginPath(); ctx.ellipse(x+4,y+5,15,5,0,0,7); ctx.fill();
    ctx.fillStyle="#8f9aa8"; ctx.fillRect(x-13,y-14,26,16);
    ctx.fillStyle="#aab6c4"; ctx.fillRect(x-16,y-18,32,6);
    ctx.strokeStyle=lit?"rgba(120,200,255,.95)":"rgba(160,180,200,.4)"; ctx.lineWidth=1.4;
    for (let i=0;i<6;i++){ const wy=y-11+i*2.4;
      ctx.beginPath(); ctx.moveTo(x-10,wy); ctx.quadraticCurveTo(x,wy-2.4,x+10,wy); ctx.stroke(); }
    const gl=lit?0.85:0.3+Math.sin(et*2)*0.12;
    ctx.fillStyle=`rgba(190,225,255,${gl})`;
    ctx.beginPath(); ctx.arc(x, y-22, 2.6+Math.sin(et*2.6)*0.8, 0, 7); ctx.fill();
  }});
  /* 风牢笼（W×4：石环 + 旋转风带；释放后变开放风环 + 上升风丝） */
  for (const sp of AESPOTS.filter(s=>s.type==="wind")){
    ents.push({y:sp.y+14, draw(){
      const x=sp.x, y=sp.y, freed=state.windFreed[sp.idx];
      ctx.fillStyle="rgba(70,95,120,.26)"; ctx.beginPath(); ctx.ellipse(x+3,y+13,14,5,0,0,7); ctx.fill();
      if (!freed){
        ctx.strokeStyle="#9aa7b4"; ctx.lineWidth=3;
        for (let i=0;i<4;i++){ const a=et*1.8+sp.idx*1.5+i*Math.PI/2;
          ctx.beginPath(); ctx.arc(x,y-4,12, a, a+1.1); ctx.stroke(); }
        ctx.fillStyle="#c4ceda";
        for (let i=0;i<4;i++){ const a=i*Math.PI/2+0.4;
          ctx.beginPath(); ctx.arc(x+Math.cos(a)*13, y-4+Math.sin(a)*6, 2.6, 0, 7); ctx.fill(); }
        const g=ctx.createRadialGradient(x,y-4,2,x,y-4,11);
        g.addColorStop(0,"rgba(190,225,255,.6)"); g.addColorStop(1,"rgba(190,225,255,0)");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y-4,11,0,7); ctx.fill();
        ctx.fillStyle="rgba(110,125,145,.9)"; ctx.font="bold 10px 'Segoe UI'"; ctx.textAlign="center";
        ctx.fillText(WIND_DIRS[sp.idx], x, y-22);
      } else {
        ctx.strokeStyle="rgba(200,230,255,.65)"; ctx.lineWidth=2;
        for (let i=0;i<3;i++){ const p=(et*0.9+i*0.33)%1;
          ctx.globalAlpha=1-p; ctx.beginPath();
          ctx.arc(x, y-8-p*24, 4+p*7, 0, 6.3); ctx.stroke(); }
        ctx.globalAlpha=1;
      }
    }});
  }
  /* 风神宫殿（石厅 + 青蓝锥顶 + 猎猎旗） */
  ents.push({y:3*ATS+ATS, draw(){
    const hx=4*ATS, hy=3*ATS;
    ctx.fillStyle="rgba(70,95,120,.30)"; ctx.beginPath(); ctx.ellipse(hx+14,hy+ATS+2,66,16,0,0,7); ctx.fill();
    ctx.fillStyle="#e3dac6"; ctx.fillRect(hx-48,hy-36,96,ATS+34);
    ctx.fillStyle="#cec2a8"; ctx.fillRect(hx-48,hy-36,10,ATS+34);
    ctx.strokeStyle="#a8967a"; ctx.lineWidth=2; ctx.strokeRect(hx-48,hy-36,96,ATS+34);
    ctx.fillStyle="rgba(0,0,0,.08)"; ctx.fillRect(hx-48,hy-36,96,7);
    ctx.fillStyle="#5d7fa3";
    ctx.beginPath(); ctx.moveTo(hx-56,hy-32); ctx.lineTo(hx-34,hy-62); ctx.lineTo(hx-12,hy-32); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx+12,hy-32); ctx.lineTo(hx+34,hy-62); ctx.lineTo(hx+56,hy-32); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#46688c";
    ctx.beginPath(); ctx.moveTo(hx-54,hy-33); ctx.lineTo(hx-34,hy-60); ctx.lineTo(hx-14,hy-33); ctx.lineTo(hx-18,hy-29); ctx.lineTo(hx-50,hy-29); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx+14,hy-33); ctx.lineTo(hx+34,hy-60); ctx.lineTo(hx+54,hy-33); ctx.lineTo(hx+50,hy-29); ctx.lineTo(hx+18,hy-29); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#6b4a2b"; ctx.fillRect(hx-13,hy-12,26,ATS+8);
    ctx.fillStyle="#8fc4e8"; ctx.fillRect(hx-40,hy-26,14,12); ctx.fillRect(hx+26,hy-26,14,12);
    ctx.strokeStyle="#a8967a"; ctx.strokeRect(hx-40,hy-26,14,12); ctx.strokeRect(hx+26,hy-26,14,12);
    /* 旗：风里猎猎 */
    ctx.strokeStyle="#8a6134"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(hx,hy-62); ctx.lineTo(hx,hy-80); ctx.stroke();
    const fl=Math.sin(et*5)*4;
    ctx.fillStyle="#4ea1ff"; ctx.beginPath();
    ctx.moveTo(hx,hy-80); ctx.quadraticCurveTo(hx+10,hy-78+fl,hx+18,hy-74+fl);
    ctx.lineTo(hx,hy-70); ctx.closePath(); ctx.fill();
  }});
  /* 埃俄罗斯（浮立：袍内灌风，脚下不沾地） */
  ents.push({y:aeolus.y+13, draw(){
    const x=aeolus.x, y=aeolus.y+Math.sin(et*1.6)*2.6;
    /* 环身风环 */
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=1.8;
    const a0=et*1.4;
    ctx.beginPath(); ctx.arc(x,y-4,20,a0,a0+1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x,y-6,24,a0+2.6,a0+4.4); ctx.stroke();
    ctx.fillStyle="rgba(90,115,140,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+14,12,4,0,0,7); ctx.fill();
    /* 银灰长袍（下摆飘） */
    const sway=Math.sin(et*2.2)*3;
    ctx.fillStyle="#c9d4e2"; ctx.beginPath();
    ctx.moveTo(x-10,y+12); ctx.quadraticCurveTo(x-12+sway,y-6,x-4,y-14);
    ctx.lineTo(x+4,y-14); ctx.quadraticCurveTo(x+12+sway,y-6,x+10,y+12); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#aab8ca"; ctx.fillRect(x-10,y+4,20+sway*0.4,4);
    /* 头：云白发 */
    ctx.fillStyle="#f1c9a5"; ctx.beginPath(); ctx.arc(x,y-19,6.5,0,7); ctx.fill();
    ctx.fillStyle="#e8edf4"; ctx.beginPath(); ctx.ellipse(x,y-23,9,4.5,-0.25,0,7); ctx.fill();
    ctx.fillStyle="#243244"; ctx.fillRect(x-3,y-20,1.8,1.8); ctx.fillRect(x+2,y-20,1.8,1.8);
    /* 青铜短杖 */
    ctx.strokeStyle="#b08d57"; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(x+12,y+12); ctx.lineTo(x+14,y-16); ctx.stroke();
    ctx.fillStyle="#e8c88a"; ctx.beginPath(); ctx.arc(x+14,y-18,2.6,0,7); ctx.fill();
  }});
  /* 已释放的风在岛上打转（释放几阵出几缕） */
  state.windFreed.forEach((f,i)=>{
    if (!f) return;
    const par=[{bx:300,by:160,ax:90,ay:40,p:0.9},{bx:560,by:200,ax:70,ay:56,p:1.4},
               {bx:180,by:280,ax:56,ay:34,p:1.9},{bx:520,by:340,ax:80,ay:30,p:2.5}][i];
    ents.push({y:par.by+10, draw(){
      const x=par.bx+Math.sin(et*par.p)*par.ax, y=par.by+Math.sin(et*par.p*1.3)*par.ay;
      const a=0.4+Math.sin(et*2+i)*0.15;
      ctx.globalAlpha=a;
      ctx.strokeStyle="#eaf6ff"; ctx.lineWidth=2.2; ctx.lineCap="round";
      ctx.beginPath(); ctx.arc(x,y,9,0.4,3.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(x+6,y-7,5,2.4,5.6); ctx.stroke();
      ctx.globalAlpha=1;
    }});
  });
  pushPlayerEnt(ents);

  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();

  /* 全屏漂浮云絮 + 亮色边缘 */
  for (let i=0;i<10;i++){
    const p=(et*0.05+i*0.1)%1;
    const px=((i*173)%860)+Math.sin(et*0.4+i)*24, py=p*540-20;
    ctx.globalAlpha=0.10+Math.sin(et+i)*0.04;
    ctx.fillStyle="#ffffff";
    ctx.beginPath(); ctx.ellipse(px,py,26,8,0,0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: aeTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "aeolia" });
  const vg=ctx.createRadialGradient(400,240,200, 400,240,560);
  vg.addColorStop(0,"rgba(255,250,235,0)"); vg.addColorStop(1,"rgba(90,110,140,.18)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawStrait (was main+3649-3841, 193 lines) ---
function drawStrait(et){
  /* Pass1 雾海水格 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(sTile, ACOLS, AROWS, ATS, "strait",
    (dep)=> terrMix("#3c5165", "#4a6076", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*11+cy*5)%3===0){
      ctx.strokeStyle="rgba(214,228,240,.14)"; ctx.lineWidth=1.4;
      const ph=Math.sin(et*0.8+cx*1.3+cy*2.1)*3;
      ctx.beginPath(); ctx.moveTo(x+8,y+20+ph); ctx.lineTo(x+22,y+20+ph); ctx.stroke();
    }
  }
  /* 投影 + 反光 */
  ctx.fillStyle="rgba(10,18,30,.35)";
  ctx.beginPath(); ctx.ellipse(400, 448, 348, 52, 0, 0, 7); ctx.fill();
  ctx.fillStyle="rgba(180,205,225,.10)";
  ctx.beginPath(); ctx.ellipse(400, 452, 320, 30, 0, 0, 7); ctx.fill();
  /* Pass2 水侧雾带 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (sTile(cx,cy+1)==="~"){
      const dg=cg(0,y+ATS+TH-2,0,y+ATS+TH+13,[0,"rgba(12,22,36,.5)",1,"rgba(12,22,36,0)"]);
      ctx.fillStyle=dg; ctx.fillRect(x,y+ATS+TH-2,ATS,13);
      const g=cg(0,y+ATS+TH,0,y+ATS+TH+11,[0,"rgba(220,232,244,.42)",.55,"rgba(220,232,244,.16)",1,"rgba(220,232,244,0)"]);
      ctx.fillStyle=g; ctx.fillRect(x,y+ATS+TH,ATS,11);
    }
    if (sTile(cx,cy-1)==="~"){ ctx.fillStyle=cg(0,y-8,0,y,[0,"rgba(220,232,244,0)",1,"rgba(220,232,244,.4)"]); ctx.fillRect(x,y-8,ATS,8); }
    if (sTile(cx-1,cy)==="~"){ ctx.fillStyle=cg(x-8,0,x,0,[0,"rgba(220,232,244,0)",1,"rgba(220,232,244,.4)"]); ctx.fillRect(x-8,y,8,ATS); }
    if (sTile(cx+1,cy)==="~"){ ctx.fillStyle=cg(x+ATS,0,x+ATS+8,0,[0,"rgba(220,232,244,.4)",1,"rgba(220,232,244,0)"]); ctx.fillRect(x+ATS,y,8,ATS); }
  }
  /* Pass3 礁崖（冷灰蓝） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=sTile(cx,cy); if (ch==="~") continue;
    if (sTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#5d6b7c",.35,"#4a5666",.75,"#333c4a",1,"#232a35"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
    ctx.strokeStyle="rgba(0,0,0,.22)"; ctx.lineWidth=1;
    for (let i=0;i<2;i++){
      const ox = ((cx*13+i*17)%3)*11+5;
      ctx.beginPath(); ctx.moveTo(x+ox, y+ATS+1); ctx.lineTo(x+ox-2, y+ATS+TH-2); ctx.stroke();
    }
  }
  /* Pass4 顶面（礁石/甲板） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=sTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch==="_"){
      ctx.fillStyle="#7a5c3d"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.18)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,.06)"; ctx.fillRect(x,y,ATS,3);
      ctx.fillStyle="rgba(0,0,0,.10)"; ctx.fillRect(x,y+ATS-3,ATS,3);
      continue;
    }
    ctx.fillStyle = terrTint("#39434f", "#46525f", cx, cy, 20261110, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="#424e5c";
    ctx.beginPath(); ctx.ellipse(x+20,y+20,14,10,0.4,0,7); ctx.fill();
    ctx.fillStyle="rgba(220,232,244,.10)"; ctx.fillRect(x+6,y+8,9,3);
  }
  /* 岸线雾光边 */
  ctx.strokeStyle="rgba(214,228,240,.4)"; ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (sTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (sTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (sTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (sTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }

  /* ---------- 实体层 y-sort ---------- */
  const ents = [];
  /* 桅杆（M：帆布 + 横桥；绑桅后画缆绳） */
  ents.push({y:straitMast.y+6, draw(){
    const x=straitMast.x, y=straitMast.y;
    ctx.fillStyle="rgba(10,18,30,.35)"; ctx.beginPath(); ctx.ellipse(x+6,y+12,14,5,0,0,7); ctx.fill();
    ctx.strokeStyle="#5c452c"; ctx.lineWidth=6; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x,y+10); ctx.lineTo(x,y-56); ctx.stroke();
    ctx.strokeStyle="#6b5133"; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(x-30,y-44); ctx.lineTo(x+30,y-44); ctx.stroke();
    ctx.fillStyle="#e8e2d2";
    ctx.beginPath(); ctx.moveTo(x+3,y-42); ctx.quadraticCurveTo(x+22,y-20,x+3,y+2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,.2)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+8,y-40); ctx.lineTo(x+8,y+0); ctx.stroke();
    if (state.mastTied){
      ctx.strokeStyle="#c9b58a"; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.arc(x, y-6, 9, 0.5, 5.6); ctx.stroke();
      ctx.fillStyle="#c9b58a"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center";
      ctx.fillText("绑", x, y+2);
    }
  }});
  /* 蜡罐（W：未选听歌方式时发光提示） */
  ents.push({y:9*ATS+ATS*0.9, draw(){
    const x=3*ATS+ATS/2, y=9*ATS+ATS*0.9;
    ctx.fillStyle="rgba(10,18,30,.3)"; ctx.beginPath(); ctx.ellipse(x+3,y+6,10,3.6,0,0,7); ctx.fill();
    ctx.fillStyle="#a8845c"; ctx.fillRect(x-7,y-12,14,16);
    ctx.fillStyle="#8f6d47"; ctx.fillRect(x-7,y-2,14,6);
    ctx.fillStyle="#e8d9b8"; ctx.beginPath(); ctx.ellipse(x,y-13,7,3,0,0,7); ctx.fill();
    if (!state.waxEars && state.straitStage<1){
      const gl=0.5+Math.sin(et*2.2)*0.25;
      ctx.fillStyle=`rgba(240,228,190,${gl})`;
      ctx.beginPath(); ctx.arc(x,y-16,2.2,0,7); ctx.fill();
    }
  }});
  /* 塞壬三姐妹（S 礁：苍白歌声身影×3 + 歌声涟漪） */
  ents.push({y:5*ATS+ATS*0.35, draw(){
    const bx=3*ATS+ATS/2, by=4*ATS+ATS*0.55;
    for (let i=0;i<3;i++){
      const x=bx+(i-1)*26, y=by+Math.sin(et*1.2+i*2)*3-(i===1?8:0);
      ctx.fillStyle="rgba(214,228,240,.16)"; ctx.beginPath(); ctx.ellipse(x+4,y+9,11,4,0,0,7); ctx.fill();
      ctx.globalAlpha=0.82;
      ctx.fillStyle="#cfd8e2";
      ctx.beginPath(); ctx.moveTo(x-7,y+8); ctx.quadraticCurveTo(x-8,y-8,x,y-12);
      ctx.quadraticCurveTo(x+8,y-8,x+7,y+8); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#e6eef6"; ctx.beginPath(); ctx.arc(x,y-16,4.6,0,7); ctx.fill();
      ctx.fillStyle="#aebccb";
      ctx.beginPath(); ctx.ellipse(x,y-21,6,3,-0.3,0,7); ctx.fill();
      ctx.globalAlpha=1;
    }
    for (let i=0;i<3;i++){
      const p=(et*0.5+i*0.33)%1;
      ctx.globalAlpha=(1-p)*0.35;
      ctx.strokeStyle="#e6eef6"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(bx, by-14, 8+p*30, 0.5, 2.6); ctx.stroke();
    }
    ctx.globalAlpha=1;
  }});
  /* 斯库拉（K 崖：六条长颈犬首错落摆动 + 本体剪影；带话后颈子静止、雾色变亮） */
  ents.push({y:2*ATS+ATS*0.8, draw(){
    const bx=11*ATS+ATS/2, by=1*ATS+ATS*0.35;
    const paid = state.scyllaDebtPaid;
    for (let i=0;i<6;i++){
      const nx=bx+(i-2.5)*17, base=by+10, sway=Math.sin(et*0.9+i*1.7)*(paid?2:6);
      const h=34+(i%3)*10;
      ctx.strokeStyle=paid?"#3d4a56":"#2f3b46"; ctx.lineWidth=7; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(nx, base+h*0.4);
      ctx.quadraticCurveTo(nx+sway*0.6, base+h*0.1, nx+sway, base-h*0.45);
      ctx.stroke();
      ctx.fillStyle=paid?"#4a5a68":"#39434f";
      ctx.beginPath(); ctx.ellipse(nx+sway, base-h*0.5, 5.5, 4.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = paid ? "rgba(160,180,200,.5)" : "rgba(220,232,240,.75)";
      ctx.beginPath(); ctx.arc(nx+sway-1.6, base-h*0.5-1, 1.1, 0, 7); ctx.fill();
    }
    ctx.globalAlpha=0.5;
    ctx.fillStyle="#cfd8e2";
    ctx.beginPath(); ctx.moveTo(bx-8,by+22); ctx.quadraticCurveTo(bx-9,by-2,bx,by-8);
    ctx.quadraticCurveTo(bx+9,by-2,bx+8,by+22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=1;
    if (!paid && state.straitStage>=1){
      ctx.fillStyle="rgba(230,238,246,.75)"; ctx.font="10px 'Segoe UI'"; ctx.textAlign="center";
      ctx.fillText("六只眼睛数着你的行囊", bx, by-24);
    }
    if (paid){
      ctx.fillStyle="rgba(159,216,207,.6)"; ctx.font="10px 'Segoe UI'"; ctx.textAlign="center";
      ctx.fillText("静 水", bx, by-24);
    }
  }});
  /* 卡律布狄斯漩涡（V：三圈螺旋旋转 + 吞吐白沫） */
  ents.push({y:4*ATS+ATS*0.85, draw(){
    const x=16*ATS+ATS/2, y=4*ATS+ATS*0.75;
    ctx.fillStyle="rgba(6,12,22,.6)";
    ctx.beginPath(); ctx.ellipse(x,y,26,15,0,0,7); ctx.fill();
    ctx.strokeStyle="rgba(214,228,240,.55)"; ctx.lineWidth=2;
    for (let ring=0; ring<3; ring++){
      const a0=et*1.6+ring*2.1, r=22-ring*6;
      ctx.beginPath(); ctx.arc(x,y,r, a0, a0+4.4); ctx.stroke();
    }
    ctx.fillStyle="rgba(240,246,252,.85)";
    for (let i=0;i<6;i++){ const a=et*2.4+i*1.05;
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*20, y+Math.sin(a)*11, 1.8, 0, 7); ctx.fill(); }
  }});
  pushPlayerEnt(ents);

  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();

  /* 全屏漂雾带 + 冷 vignette */
  for (let i=0;i<7;i++){
    const p=((et*0.02+i*0.15)%1.2)-0.1;
    const py=40+i*72+Math.sin(et*0.3+i)*10;
    ctx.globalAlpha=0.10+Math.sin(et*0.5+i)*0.04;
    ctx.fillStyle="#dfe9f2";
    ctx.beginPath(); ctx.ellipse(p*1000, py, 130, 12, 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha=1;
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: sTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "strait" });
  const vg=ctx.createRadialGradient(400,240,170, 400,240,560);
  vg.addColorStop(0,"rgba(8,14,26,0)"); vg.addColorStop(1,"rgba(8,14,26,.6)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawSun (was main+3844-4031, 188 lines) ---
function drawSun(et){
  const wrath = state.sunWrath;
  /* Pass1 外海（金色日辉碎光；记恨后转铅灰） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sunTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（记恨后天色转铅灰，场键随之切换） */
  const wf = terrWaterField(sunTile, ACOLS, AROWS, ATS, wrath ? "sun-w" : "sun",
    (dep)=>{ const k = Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5));
      return wrath ? terrMix("#51606a", "#5d6d76", k) : terrMix("#276a84", "#2f7a94", k); });
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sunTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*13+cy*7)%4===0 && !wrath){
      ctx.strokeStyle="rgba(255,222,140,.28)"; ctx.lineWidth=1.3;
      const ph=Math.sin(et*1.4+cx*1.9+cy*1.3)*2.5;
      ctx.beginPath(); ctx.moveTo(x+5,y+14+ph); ctx.lineTo(x+19,y+14+ph); ctx.stroke();
    }
  }
  /* Pass2 岸线金边（记恨后变灰） */
  ctx.strokeStyle = wrath ? "rgba(190,196,204,.35)" : "rgba(255,224,150,.42)";
  ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sunTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (sunTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (sunTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (sunTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (sunTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }
  /* Pass3 崖体挤出（蜜色岩层） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=sunTile(cx,cy); if (ch==="~") continue;
    if (sunTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#c49a5c",.35,"#a97f45",.75,"#7d5a2e",1,"#5c401f"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
    ctx.strokeStyle="rgba(0,0,0,.18)"; ctx.lineWidth=1;
    const ox = ((cx*11)%3)*12+6;
    ctx.beginPath(); ctx.moveTo(x+ox, y+ATS+1); ctx.lineTo(x+ox-2, y+ATS+TH-2); ctx.stroke();
  }
  /* Pass4 顶面（金草地/牧场/小径/栈桥） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=sunTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch==="_"){
      ctx.fillStyle="#8a6a42"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.16)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke();
      ctx.fillStyle="rgba(255,255,255,.05)"; ctx.fillRect(x,y,ATS,3);
      continue;
    }
    if (ch===","){ ctx.fillStyle="#cbb26e"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="rgba(255,244,200,.25)"; for(let i=0;i<3;i++) ctx.fillRect(x+6+i*11, y+10+((cx+cy+i)%3)*8, 5,2); continue; }
    if (ch==="B"){ ctx.fillStyle=wrath?"#a8a26a":"#d3b96a"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="rgba(120,90,40,.22)";
      ctx.beginPath(); ctx.ellipse(x+13,y+15,4,2.4,0.4,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+27,y+27,4,2.4,-0.3,0,7); ctx.fill();
      ctx.fillStyle="rgba(255,240,180,.14)"; ctx.fillRect(x+4,y+4,10,2);
      continue; }
    if (ch==="S"||ch==="A"){ ctx.fillStyle="#e9e0cc"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="#c9bda0"; ctx.lineWidth=1; ctx.strokeRect(x+3.5,y+3.5,ATS-7,ATS-7);
      ctx.fillStyle="rgba(0,0,0,.06)"; ctx.fillRect(x+3.5,y+ATS-8,ATS-7,4);
      if (ch==="A"){ ctx.fillStyle="#e8b84b"; ctx.beginPath(); ctx.arc(x+20,y+20,7,0,7); ctx.fill();
        ctx.strokeStyle="#b98d2e"; ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(x+20,y+20,10,0,7); ctx.stroke(); }
      continue; }
    /* 批次 R2：底色改低频色变（terrTint）——记恨前金草、记恨后枯灰 */
    ctx.fillStyle = wrath ? terrTint("#b3ab77", "#a09a68", cx, cy, 20261111, 0.17)
                          : terrTint("#dcc274", "#c6ab63", cx, cy, 20261111, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="rgba(255,244,200,.16)";
    if ((cx*7+cy*5)%3===0) ctx.fillRect(x+8,y+12,7,2);
    if (ch==="T"){}
  }
  /* ---------- 实体层 y-sort ---------- */
  const ents = [];
  /* 柏树（T） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (sunTile(cx,cy)!=="T") continue;
    const x=cx*ATS+ATS/2, y=cy*ATS+ATS*0.8;
    ents.push({y, draw(){
      ctx.fillStyle="rgba(80,50,20,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+7,12,4,0,0,7); ctx.fill();
      ctx.fillStyle="#5c4022"; ctx.fillRect(x-2.5,y-10,5,12);
      ctx.fillStyle=wrath?"#3f4a41":"#2f5c3a";
      ctx.beginPath(); ctx.ellipse(x,y-22,9,16,0,0,7); ctx.fill();
      ctx.fillStyle="rgba(255,255,255,.08)"; ctx.beginPath(); ctx.ellipse(x-3,y-26,4,8,0,0,7); ctx.fill();
    }});
  }
  /* 圣殿（S 区域柱廊 + 日辉圆盘） */
  ents.push({y:3*ATS+ATS*0.9, draw(){
    const bx=4*ATS, by=2*ATS+6;
    ctx.fillStyle="rgba(80,50,20,.25)"; ctx.beginPath(); ctx.ellipse(bx+60,by+38,74,10,0,0,7); ctx.fill();
    ctx.fillStyle="#efe8d8"; ctx.fillRect(bx,by,124,34);
    for (let i=0;i<5;i++){
      ctx.fillStyle="#f7f2e4"; ctx.fillRect(bx+8+i*24, by-26, 10, 60);
      ctx.fillStyle="rgba(0,0,0,.10)"; ctx.fillRect(bx+16+i*24, by-26, 2, 60);
    }
    ctx.fillStyle="#e8c05a"; ctx.beginPath(); ctx.arc(bx+62, by-40, 15, 0, 7); ctx.fill();
    ctx.strokeStyle="#c99a2e"; ctx.lineWidth=2;
    for (let i=0;i<8;i++){ const a=et*0.6+i*Math.PI/4;
      ctx.beginPath(); ctx.moveTo(bx+62+Math.cos(a)*18, by-40+Math.sin(a)*18);
      ctx.lineTo(bx+62+Math.cos(a)*25, by-40+Math.sin(a)*25); ctx.stroke(); }
    if (wrath){ ctx.fillStyle="rgba(90,95,110,.4)"; ctx.beginPath(); ctx.ellipse(bx+62,by-40,19,19,0,0,7); ctx.fill(); }
  }});
  /* 圣牛群（B 牧场：三头，缓慢摇摆+反刍；玩家靠近时抬头看向玩家；记恨后低头背对） */
  const COWS = [{x:14.6,y:4.3},{x:15.9,y:5.0},{x:14.9,y:5.7}];
  COWS.forEach((c,i)=>{
    const px=c.x*ATS, py=c.y*ATS;
    ents.push({y:py+10, draw(){
      const nearP = Math.hypot(aiaPlayer.x-px, aiaPlayer.y-py)<200;
      const bob = Math.sin(et*0.8+i*2.1)*2;
      const look = (wrath ? -1 : nearP ? 1 : 0);
      ctx.fillStyle="rgba(80,50,20,.28)"; ctx.beginPath(); ctx.ellipse(px+5,py+12,17,5,0,0,7); ctx.fill();
      ctx.fillStyle="#8a5a34"; ctx.beginPath(); ctx.ellipse(px,py+bob*0.4,16,9,0,0,7); ctx.fill();
      ctx.fillStyle="#c99e6a"; ctx.beginPath(); ctx.ellipse(px-3,py-2+bob*0.4,7,4.5,0,0,7); ctx.fill();
      const hx = px + (look>=0?13:-13), hy = py-6+bob+(look>0?-4:2);
      ctx.fillStyle="#7c4e2c"; ctx.beginPath(); ctx.ellipse(hx,hy,7,5.5,0,0,7); ctx.fill();
      ctx.strokeStyle="#e8c05a"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(hx-4,hy-4); ctx.quadraticCurveTo(hx-7,hy-10,hx-3,hy-11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx+4,hy-4); ctx.quadraticCurveTo(hx+7,hy-10,hx+3,hy-11); ctx.stroke();
      if (look>0){ ctx.fillStyle="#2c1c10"; ctx.beginPath(); ctx.arc(hx+(aiaPlayer.x>px?3:-3),hy-1,1.3,0,7); ctx.fill(); }
      if (i===0 && !wrath){
        ctx.fillStyle="rgba(120,86,40,.8)"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center";
        ctx.fillText(nearP?"（她看着你）":"（牛群在反刍）", px, py-24);
      }
    }});
  });
  /* P1.3 船员剪影（game-ai 空间感：鼓噪前原著张力——瘦削弯腰的人影围在牛群旁，微晃；抉择后消失） */
  if (state.crewLit && (state.crew||0)>0 && !state.sunWrath && !state.sunBlessed){
    const NOISE_MEN = [{x:13.6,y:4.9},{x:15.2,y:6.3},{x:16.4,y:4.6},{x:14.3,y:6.6}];
    NOISE_MEN.forEach((m,i)=>{
      const px=m.x*ATS, py=m.y*ATS;
      ents.push({y:py+8, draw(){
        const sway = Math.sin(et*1.9+i*2.4)*1.6;
        ctx.fillStyle="rgba(20,16,10,.40)";
        ctx.beginPath(); ctx.ellipse(px+sway*0.4,py+9,7,2.4,0,0,7); ctx.fill();
        ctx.fillStyle="#241a12";
        ctx.beginPath(); ctx.ellipse(px+sway*0.5,py,3.2,7.5,0,0,7); ctx.fill();
        ctx.beginPath(); ctx.arc(px+sway*0.5,py-8.5,2.6,0,7); ctx.fill();
        ctx.strokeStyle="#241a12"; ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(px+sway*0.5,py-4); ctx.lineTo(px+3.4+sway,py+1.5); ctx.stroke();
      }});
    });
  }
  /* 海藻（西滩） */
  ents.push({y:8*ATS+ATS*0.9, draw(){
    const x=2*ATS, y=8*ATS+ATS*0.9;
    for (let i=0;i<4;i++){
      const sw=Math.sin(et*1.6+i*1.4)*3;
      ctx.strokeStyle="#3e7a52"; ctx.lineWidth=2.4; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(x+i*6, y);
      ctx.quadraticCurveTo(x+i*6+sw, y-9, x+i*6+sw*1.6, y-15-i*2); ctx.stroke();
    }
  }});
  /* 火盆（圣火笔直） */
  ents.push({y:6*ATS+ATS*0.95, draw(){
    const x=3*ATS+ATS/2, y=6*ATS+ATS*0.7;
    ctx.fillStyle="rgba(80,50,20,.3)"; ctx.beginPath(); ctx.ellipse(x+3,y+8,10,3.5,0,0,7); ctx.fill();
    ctx.fillStyle="#6e5a44"; ctx.beginPath(); ctx.ellipse(x,y,10,5,0,0,7); ctx.fill();
    const fl = wrath?0.4:1;
    const fg=ctx.createRadialGradient(x,y-4,1,x,y-4,12);
    fg.addColorStop(0,`rgba(255,214,120,${0.9*fl})`); fg.addColorStop(1,"rgba(255,150,60,0)");
    ctx.fillStyle=fg; ctx.beginPath(); ctx.ellipse(x,y-5,7,12+Math.sin(et*7)*2,0,0,7); ctx.fill();
  }});
  pushPlayerEnt(ents);
  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();

  /* 天光层：日辉旋转光斑；记恨后 → 乌云压顶 */
  if (!wrath){
    ctx.save(); ctx.globalCompositeOperation="lighter";
    const cx0=sunAltar.x, cy0=sunAltar.y-20;
    for (let i=0;i<5;i++){
      const a=et*0.35+i*1.256;
      ctx.globalAlpha=0.05;
      ctx.fillStyle="#ffd873";
      ctx.beginPath(); ctx.ellipse(cx0+Math.cos(a)*190, cy0+Math.sin(a)*130, 150, 60, a, 0, 7); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha=1;
  } else {
    for (let i=0;i<6;i++){
      const p=((et*0.03+i*0.17)%1.3)-0.15;
      const py=50+i*88+Math.sin(et*0.4+i)*12;
      ctx.globalAlpha=0.16+Math.sin(et*0.6+i)*0.05;
      ctx.fillStyle="#3a3f4a";
      ctx.beginPath(); ctx.ellipse(p*1100-50, py, 150, 16, 0, 0, 7); ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: sunTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "sun" });
  const vg=ctx.createRadialGradient(400,240,180, 400,240,560);
  vg.addColorStop(0, wrath?"rgba(40,42,52,0)":"rgba(255,240,200,0)");
  vg.addColorStop(1, wrath?"rgba(30,32,40,.5)":"rgba(160,110,30,.16)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawOggia (was main+4034-4141, 108 lines) ---
function drawOggia(et){
  /* Pass1 外海：紫金暮海（恒定暮光——日历冻结，不随昼夜系统） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (ogTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(ogTile, ACOLS, AROWS, ATS, "oggia",
    (dep)=> terrMix("#6a4d63", "#7a5a70", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (ogTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*13+cy*7)%4===0){
      ctx.strokeStyle="rgba(255,206,140,.30)"; ctx.lineWidth=1.3;
      const ph=Math.sin(et*1.1+cx*1.7+cy*1.1)*2.5;
      ctx.beginPath(); ctx.moveTo(x+5,y+13+ph); ctx.lineTo(x+19,y+13+ph); ctx.stroke();
    }
  }
  /* Pass2 岸线暖金边 */
  ctx.strokeStyle="rgba(255,214,150,.40)"; ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (ogTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (ogTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (ogTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (ogTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (ogTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }
  /* Pass3 崖体挤出（暖紫岩层） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=ogTile(cx,cy); if (ch==="~") continue;
    if (ogTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#9a7668",.4,"#7c5a52",1,"#4e3a3a"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
  }
  /* Pass4 顶面 */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=ogTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch==="_"){ ctx.fillStyle="#7c5f42"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.16)"; ctx.beginPath(); ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke(); continue; }
    if (ch===","){ ctx.fillStyle="#a98d7c"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="H"){ ctx.fillStyle="#8f6f60"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="rgba(0,0,0,.18)"; if((cx+cy)%2)ctx.fillRect(x+4,y+6,12,20); else ctx.fillRect(x+8,y+10,9,16);
      if (ogTile(cx-1,cy)!=="H"){ /* 洞口暖光 */ }
      continue; }
    if (ch==="L"){ ctx.fillStyle="#9c8273"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="O"){ ctx.fillStyle="#5a7048"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="#e8b84b"; ctx.beginPath(); ctx.arc(x+13,y+14,3.5,0,7); ctx.arc(x+26,y+22,3.5,0,7); ctx.fill(); continue; }
    if (ch==="V"){ ctx.fillStyle="#5c4a52"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(255,214,150,.35)"; ctx.beginPath(); ctx.arc(x+20,y+20,8,0,7); ctx.stroke(); continue; }
    if (ch==="W"){ ctx.fillStyle="#8a6a48"; ctx.fillRect(x,y,ATS,ATS);
      ctx.fillStyle="rgba(0,0,0,.2)"; for(let i=0;i<3;i++)ctx.fillRect(x+2,y+4+i*10,36,3); continue; }
    if (ch==="B"){ ctx.fillStyle="#6a5346"; ctx.fillRect(x,y,ATS,ATS); continue; }
    ctx.fillStyle = terrTint("#75835c", "#68764f", cx, cy, 20261112, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="rgba(255,236,200,.10)";
    if ((cx*7+cy*5)%3===0) ctx.fillRect(x+8,y+12,7,2);
  }
  /* 实体层 */
  const ents=[];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (ogTile(cx,cy)!=="T") continue;
    const x=cx*ATS+ATS/2, y=cy*ATS+ATS*0.8;
    ents.push({y, draw(){
      ctx.fillStyle="rgba(60,40,40,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+7,12,4,0,0,7); ctx.fill();
      ctx.fillStyle="#4e3a2e"; ctx.fillRect(x-2.5,y-10,5,12);
      ctx.fillStyle="#4a5c48"; ctx.beginPath(); ctx.ellipse(x,y-22,9,16,0,0,7); ctx.fill();
    }});
  }
  /* 织机（洞窟口：架上绷着布，卡吕普索织了拆拆了织） */
  ents.push({y:2*ATS+ATS*0.9, draw(){
    const bx=4*ATS+6, by=2*ATS+2;
    ctx.fillStyle="rgba(60,40,40,.3)"; ctx.beginPath(); ctx.ellipse(bx+20,by+34,26,6,0,0,7); ctx.fill();
    ctx.fillStyle="#6a4a34"; ctx.fillRect(bx,by-30,5,64); ctx.fillRect(bx+34,by-30,5,64); ctx.fillRect(bx,by-32,39,5);
    ctx.fillStyle="#e8dcc8"; ctx.fillRect(bx+5,by-26,29,40);
    ctx.strokeStyle="rgba(120,90,80,.5)"; ctx.lineWidth=1;
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(bx+8+i*6,by-26); ctx.lineTo(bx+8+i*6,by+14); ctx.stroke(); }
    ctx.strokeStyle="rgba(180,120,90,.8)"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(bx+5,by-16+Math.sin(et*1.3)*3); ctx.lineTo(bx+34,by-16-Math.sin(et*1.3)*3); ctx.stroke();
  }});
  /* 卡吕普索（紫裙黑发，立于织机旁；靠近时回头） */
  ents.push({y:calypso.y+8, draw(){
    const x=calypso.x, y=calypso.y;
    const nearP = Math.hypot(aiaPlayer.x-x, aiaPlayer.y-y)<160;
    ctx.fillStyle="rgba(60,40,40,.3)"; ctx.beginPath(); ctx.ellipse(x+3,y+14,13,4.5,0,0,7); ctx.fill();
    ctx.fillStyle="#5c4468"; ctx.beginPath(); ctx.moveTo(x-10,y+14); ctx.lineTo(x+10,y+14); ctx.lineTo(x+6,y-8); ctx.lineTo(x-6,y-8); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#e8d0b8"; ctx.beginPath(); ctx.arc(x,y-14,6.5,0,7); ctx.fill();
    ctx.fillStyle="#2c2030"; ctx.beginPath(); ctx.ellipse(x,y-16,7.5,9,0,0,7); ctx.fill();
    ctx.fillStyle="#e8d0b8"; ctx.beginPath(); ctx.ellipse(x-2,y-10,2.5,6,0,0,7); ctx.fill();
    if (nearP){ ctx.fillStyle="rgba(255,236,200,.85)"; ctx.font="10px 'Segoe UI'"; ctx.textAlign="center"; ctx.fillText("（她回头看了你一眼）", x, y-30); }
  }});
  /* 篝火（同一时刻烧旺） */
  ents.push({y:8*ATS+ATS*0.95, draw(){
    const x=16*ATS+ATS/2, y=8*ATS+ATS*0.7;
    ctx.fillStyle="rgba(60,40,40,.3)"; ctx.beginPath(); ctx.ellipse(x+3,y+8,10,3.5,0,0,7); ctx.fill();
    ctx.fillStyle="#6e5a44"; ctx.beginPath(); ctx.ellipse(x,y,10,5,0,0,7); ctx.fill();
    const fg=ctx.createRadialGradient(x,y-4,1,x,y-4,12);
    fg.addColorStop(0,"rgba(255,214,120,.9)"); fg.addColorStop(1,"rgba(255,150,60,0)");
    ctx.fillStyle=fg; ctx.beginPath(); ctx.ellipse(x,y-5,7,12+Math.sin(et*7)*2,0,0,7); ctx.fill();
  }});
  pushPlayerEnt(ents);
  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();
  /* 恒定暮光层（日历冻结的视觉锚：右上金光 + 紫晕） */
  const lg=cg(1000,0,300,600,[0,"rgba(255,190,110,.30)",.55,"rgba(210,140,120,.16)",1,"rgba(120,70,110,.26)"]);
  ctx.fillStyle=lg; ctx.fillRect(0,0,1000,600);
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: ogTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "oggia" });
  const vg=ctx.createRadialGradient(400,240,200, 400,240,560);
  vg.addColorStop(0,"rgba(120,70,110,0)"); vg.addColorStop(1,"rgba(70,40,80,.45)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawScheria (was main+4144-4240, 97 lines) ---
function drawScheria(et){
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (scTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(scTile, ACOLS, AROWS, ATS, "scheria",
    (dep)=> terrMix("#27798f", "#2f8ba4", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (scTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*13+cy*7)%4===0){
      ctx.strokeStyle="rgba(255,255,255,.20)"; ctx.lineWidth=1.2;
      const ph=Math.sin(et*1.6+cx*1.9+cy*1.3)*2.5;
      ctx.beginPath(); ctx.moveTo(x+5,y+14+ph); ctx.lineTo(x+19,y+14+ph); ctx.stroke();
    }
  }
  ctx.strokeStyle="rgba(255,244,214,.45)"; ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (scTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (scTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (scTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (scTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (scTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=scTile(cx,cy); if (ch==="~") continue;
    if (scTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#d8bc8c",.5,"#b89568",1,"#7c5f42"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
  }
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=scTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch==="_"){ ctx.fillStyle="#9a7a52"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.16)"; ctx.beginPath(); ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke(); continue; }
    if (ch===","){ ctx.fillStyle="#c2b088"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="P"){ ctx.fillStyle="#f0ead8"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="#c8bfa8"; ctx.lineWidth=1; ctx.strokeRect(x+2.5,y+2.5,ATS-5,ATS-5); continue; }
    if (ch==="S"){ ctx.fillStyle="#5a8a9c"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="B"){ ctx.fillStyle="#8aa06e"; ctx.fillRect(x,y,ATS,ATS); continue; }
    ctx.fillStyle = terrTint("#a8c078", "#98b068", cx, cy, 20261113, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="rgba(255,255,255,.14)";
    if ((cx*7+cy*5)%3===0) ctx.fillRect(x+8,y+12,7,2);
  }
  const ents=[];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (scTile(cx,cy)!=="T") continue;
    const x=cx*ATS+ATS/2, y=cy*ATS+ATS*0.8;
    ents.push({y, draw(){
      ctx.fillStyle="rgba(80,60,30,.28)"; ctx.beginPath(); ctx.ellipse(x+4,y+7,12,4,0,0,7); ctx.fill();
      ctx.fillStyle="#7c5f42"; ctx.fillRect(x-2.5,y-10,5,12);
      ctx.fillStyle="#6f8a5a"; ctx.beginPath(); ctx.ellipse(x,y-20,10,13,0,0,7); ctx.fill();
      ctx.fillStyle="rgba(230,240,200,.35)"; ctx.beginPath(); ctx.arc(x-3,y-24,3,0,7); ctx.fill();
    }});
  }
  /* 宫殿柱廊（P 区整体：白柱+楣梁+旗） */
  ents.push({y:2*ATS+ATS*0.85, draw(){
    const bx=5*ATS, by=1*ATS+4;
    ctx.fillStyle="rgba(80,60,30,.22)"; ctx.beginPath(); ctx.ellipse(bx+95,by+50,110,12,0,0,7); ctx.fill();
    ctx.fillStyle="#f4efe0"; ctx.fillRect(bx-6,by-8,208,56);
    for (let i=0;i<7;i++){
      ctx.fillStyle="#faf6ea"; ctx.fillRect(bx+6+i*29, by-34, 13, 82);
      ctx.fillStyle="rgba(0,0,0,.08)"; ctx.fillRect(bx+15+i*29, by-34, 3, 82);
    }
    ctx.fillStyle="#e8ddc4"; ctx.fillRect(bx-10,by-44,216,12);
    ctx.strokeStyle="#b8452e"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(bx+100,by-44); ctx.lineTo(bx+100,by-66);
    ctx.fillStyle="#b8452e"; ctx.beginPath(); ctx.moveTo(bx+100,by-66); ctx.lineTo(bx+126,by-60); ctx.lineTo(bx+100,by-54); ctx.closePath(); ctx.fill();
  }});
  /* 瑙西亚娅（白裙金发，宫前草场） */
  ents.push({y:nausicaa.y+8, draw(){
    const x=nausicaa.x, y=nausicaa.y;
    const nearP = Math.hypot(aiaPlayer.x-x, aiaPlayer.y-y)<160;
    const bob=Math.sin(et*1.6)*1.5;
    ctx.fillStyle="rgba(80,60,30,.28)"; ctx.beginPath(); ctx.ellipse(x+3,y+13,12,4,0,0,7); ctx.fill();
    ctx.fillStyle="#f4f0e4"; ctx.beginPath(); ctx.moveTo(x-9,y+13); ctx.lineTo(x+9,y+13); ctx.lineTo(x+5,y-6); ctx.lineTo(x-5,y-6); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#ecd0b0"; ctx.beginPath(); ctx.arc(x,y-12+bob*0.2,6,0,7); ctx.fill();
    ctx.fillStyle="#d8a850"; ctx.beginPath(); ctx.ellipse(x,y-15+bob*0.2,7,7.5,0,0,7); ctx.fill();
    if (nearP){ ctx.fillStyle="rgba(255,255,240,.9)"; ctx.font="10px 'Segoe UI'"; ctx.textAlign="center"; ctx.fillText("（她在等你开口）", x, y-28); }
  }});
  /* 送行船（黑船首快船泊在滩边） */
  ents.push({y:9*ATS+ATS*0.9, draw(){
    const x=12*ATS+10, y=9*ATS+6;
    ctx.fillStyle="rgba(80,60,30,.25)"; ctx.beginPath(); ctx.ellipse(x+20,y+16,30,5,0,0,7); ctx.fill();
    ctx.fillStyle="#2c3038"; ctx.beginPath(); ctx.moveTo(x-6,y+12); ctx.lineTo(x+44,y+12); ctx.lineTo(x+36,y+2); ctx.lineTo(x+2,y+2); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#1c2026"; ctx.beginPath(); ctx.moveTo(x-6,y+12); ctx.lineTo(x-16,y+16); ctx.lineTo(x-6,y+5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#6a4a2e"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x+20,y+2); ctx.lineTo(x+20,y-18); ctx.stroke();
    ctx.fillStyle="#f0ead8"; ctx.beginPath(); ctx.moveTo(x+20,y-17); ctx.lineTo(x+34,y-4); ctx.lineTo(x+20,y-2); ctx.closePath(); ctx.fill();
  }});
  pushPlayerEnt(ents);
  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();
  /* 正午白亮层 */
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: scTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "scheria" });
  const vg=ctx.createRadialGradient(400,240,220, 400,240,560);
  vg.addColorStop(0,"rgba(255,252,240,0)"); vg.addColorStop(1,"rgba(255,244,214,.14)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- drawIthaca (was main+4243-4385, 143 lines) ---
function drawIthaca(et){
  const dawn = 0.5+Math.sin(et*0.05)*0.0;   /* 黎明不随昼夜（终章定格感） */
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (itTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
  }
  /* 批次 R2：外海低分辨率场双线性放大 → 连续水深渐变（逐格平涂会留色阶格边，
     岸线一格一格跳变） */
  const wf = terrWaterField(itTile, ACOLS, AROWS, ATS, "ithaca",
    (dep)=> terrMix("#33566d", "#3d627c", Math.max(0, Math.min(1, 1 - (dep - 1) / 3.5))));
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(wf.canvas, 0, 0, wf.w, wf.h);
  ctx.restore();
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (itTile(cx,cy)!=="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if ((cx*13+cy*7)%4===0){
      ctx.strokeStyle="rgba(255,226,170,.22)"; ctx.lineWidth=1.2;
      const ph=Math.sin(et*1.2+cx*1.7+cy*1.1)*2;
      ctx.beginPath(); ctx.moveTo(x+5,y+14+ph); ctx.lineTo(x+19,y+14+ph); ctx.stroke();
    }
  }
  ctx.strokeStyle="rgba(220,228,238,.4)"; ctx.lineWidth=1.6;
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (itTile(cx,cy)==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    ctx.beginPath();
    if (itTile(cx,cy+1)==="~"){ ctx.moveTo(x,y+ATS); ctx.lineTo(x+ATS,y+ATS); }
    if (itTile(cx,cy-1)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x+ATS,y); }
    if (itTile(cx-1,cy)==="~"){ ctx.moveTo(x,y); ctx.lineTo(x,y+ATS); }
    if (itTile(cx+1,cy)==="~"){ ctx.moveTo(x+ATS,y); ctx.lineTo(x+ATS,y+ATS); }
    ctx.stroke();
  }
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=itTile(cx,cy); if (ch==="~") continue;
    if (itTile(cx,cy+1)!=="~") continue;   /* 批次 R2：崖面只给下邻是水的边界格建——
       旧版每格都建，内陆格只露出顶部 2px 暗带，把地面切出一条条横线（方格纸观感） */
    const x=cx*ATS, y=cy*ATS;
    const grd=cg(0,y+ATS-2,0,y+ATS+TH,[0,"#9a8a74",.5,"#7a6a56",1,"#4e4438"]);
    ctx.fillStyle=grd; ctx.fillRect(x,y+ATS-2,ATS,TH+2);
  }
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    const ch=itTile(cx,cy); if (ch==="~") continue;
    const x=cx*ATS, y=cy*ATS;
    if (ch==="_"){ ctx.fillStyle="#7a6a4e"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="rgba(0,0,0,.16)"; ctx.beginPath(); ctx.moveTo(x,y+13); ctx.lineTo(x+ATS,y+13); ctx.moveTo(x,y+27); ctx.lineTo(x+ATS,y+27); ctx.stroke(); continue; }
    if (ch===","){ ctx.fillStyle="#97896e"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="P"){ ctx.fillStyle="#8f8678"; ctx.fillRect(x,y,ATS,ATS);
      if ((cx*5+cy)%4===0){ ctx.fillStyle="rgba(255,180,90,.5)"; ctx.fillRect(x+10,y+12,8,10); } continue; }
    if (ch==="X"){ ctx.fillStyle="#8a7c68"; ctx.fillRect(x,y,ATS,ATS);
      ctx.strokeStyle="#c8b060"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x+20,y+12,9,0,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+20,y+21); ctx.lineTo(x+20,y+38); ctx.stroke(); continue; }
    if (ch==="C"){ ctx.fillStyle="#8a7c68"; ctx.fillRect(x,y,ATS,ATS); continue; }
    if (ch==="H"){ ctx.fillStyle="#7d8a6e"; ctx.fillRect(x,y,ATS,ATS); continue; }
    ctx.fillStyle = terrTint("#9aa486", "#8c9678", cx, cy, 20261114, 0.17);
    ctx.fillRect(x-1,y-1,ATS+2,ATS+2);   /* 批次 R2：多铺 1px 消格间接缝 */
    ctx.fillStyle="rgba(255,255,255,.10)";
    if ((cx*7+cy*5)%3===0) ctx.fillRect(x+8,y+12,7,2);
  }
  const ents=[];
  for (let cy=0; cy<AROWS; cy++) for (let cx=0; cx<ACOLS; cx++){
    if (itTile(cx,cy)!=="T") continue;
    const x=cx*ATS+ATS/2, y=cy*ATS+ATS*0.8;
    ents.push({y, draw(){
      ctx.fillStyle="rgba(50,55,45,.3)"; ctx.beginPath(); ctx.ellipse(x+4,y+7,12,4,0,0,7); ctx.fill();
      ctx.fillStyle="#4e4438"; ctx.fillRect(x-2.5,y-10,5,12);
      ctx.fillStyle="#5c7050"; ctx.beginPath(); ctx.ellipse(x,y-20,9,14,0,0,7); ctx.fill();
    }});
  }
  /* 宴厅（火光+喧闹的窗，求婚者的影子晃动） */
  ents.push({y:2*ATS+ATS*0.85, draw(){
    const bx=4*ATS, by=1*ATS+4;
    ctx.fillStyle="rgba(50,55,45,.25)"; ctx.beginPath(); ctx.ellipse(bx+100,by+52,115,12,0,0,7); ctx.fill();
    ctx.fillStyle="#9a9080"; ctx.fillRect(bx-6,by-8,215,58);
    ctx.fillStyle="#7c7264"; ctx.fillRect(bx-10,by-44,222,12);
    for (let i=0;i<6;i++){
      const fl=0.4+Math.abs(Math.sin(et*2.2+i*1.7))*0.5;
      ctx.fillStyle=`rgba(255,170,80,${fl})`; ctx.fillRect(bx+14+i*34, by+4, 18, 24);
      ctx.fillStyle="rgba(30,26,22,.55)";
      ctx.beginPath(); ctx.ellipse(bx+23+i*34, by+18+Math.sin(et*3+i)*2, 5, 9, 0, 0, 7); ctx.fill();
    }
  }});
  /* 十二斧阵（斧环成排，已过试后泛金） */
  ents.push({y:5*ATS+ATS*0.9, draw(){
    const bx=10*ATS+6, by=5*ATS+8;
    for (let i=0;i<4;i++){
      const x=bx+i*22, y=by+ (i%2)*4;
      ctx.fillStyle="#5c5044"; ctx.fillRect(x-1.5,y+6,3,22);
      ctx.strokeStyle=state.ithacaStage>=3?"#e8c05a":"#9a8a74"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y+2,7,0,7); ctx.stroke();
    }
    if (state.ithacaStage<3){ ctx.fillStyle="rgba(220,228,238,.6)"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center"; ctx.fillText("（十二道斧环 · 无人拉开的弓）", bx+38, by-8); }
  }});
  /* 佩涅洛佩与织机（P1.7 视觉：考官在场——未考她在织，考过之后布停在同一处；审判通过后织机彻底停了） */
  ents.push({y:7*ATS+ATS*0.9, draw(){
    const bx=11*ATS+4, by=7*ATS+6;
    ctx.fillStyle="#5c5044"; ctx.fillRect(bx,by-24,4,34); ctx.fillRect(bx+30,by-24,4,34);
    ctx.fillStyle="#d8ccb8"; ctx.fillRect(bx+4,by-20,26,26);
    ctx.strokeStyle="rgba(120,80,60,.55)"; ctx.lineWidth=1;
    for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo(bx+7+i*7,by-20); ctx.lineTo(bx+7+i*7,by+6); ctx.stroke(); }
    if (!state.examAsked && Math.sin(et*1.5)>0){ ctx.fillStyle="rgba(255,225,170,.32)"; ctx.fillRect(bx+4,by-9,26,6); }   /* 梭子来回的亮纬线（未考时） */
    /* 佩涅洛佩本人：织机旁站定——考过之后抬眼，眼里有一点烛光 */
    const px=bx+45, py=by+10;
    ctx.fillStyle="rgba(50,55,45,.28)"; ctx.beginPath(); ctx.ellipse(px,py+7,8,3,0,0,7); ctx.fill();
    ctx.fillStyle="#5a4a58"; ctx.beginPath(); ctx.moveTo(px-6,py-9); ctx.lineTo(px+6,py-9); ctx.lineTo(px+8,py+8); ctx.lineTo(px-8,py+8); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#d8c8b8"; ctx.beginPath(); ctx.arc(px,py-13,5,0,7); ctx.fill();
    ctx.fillStyle="#3a2e26"; ctx.fillRect(px-6,py-18,12,5);
    if (state.examAsked){ ctx.fillStyle="rgba(232,192,90,.9)"; ctx.fillRect(px-1,py-15,2,2); }
    const plabel = state.finaleDone ? "她等你，很久了"
      : !state.examAsked ? "织机声，不紧不慢"
      : (state.examScar&&state.examBed) ? "织机停了——她在听"
      : "她的眼神没离开过你";
    ctx.fillStyle="rgba(240,220,190,.85)"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center";
    ctx.fillText(plabel, bx+24, by-28);
  }});
  /* 忒勒玛科斯（P1.9 · 原著第 16 卷）：寻父归来的年轻人——未认时望海数帆，认后站直 */
  {
    const tx=15*ATS+ATS/2, ty=6*ATS+ATS/2;
    ents.push({y:ty+8, draw(){
      ctx.fillStyle="rgba(50,55,45,.28)"; ctx.beginPath(); ctx.ellipse(tx,ty+6,8,3,0,0,7); ctx.fill();
      ctx.fillStyle="#4a5a68"; ctx.beginPath(); ctx.moveTo(tx-6,ty-8); ctx.lineTo(tx+6,ty-8); ctx.lineTo(tx+7,ty+7); ctx.lineTo(tx-7,ty+7); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#e0c8a8"; ctx.beginPath(); ctx.arc(tx,ty-12,5,0,7); ctx.fill();
      ctx.fillStyle="#2e2620"; ctx.fillRect(tx-5,ty-17,10,4);
      ctx.strokeStyle="#8a9098"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(tx+9,ty+4); ctx.lineTo(tx+9,ty-16); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tx+6,ty-16); ctx.lineTo(tx+12,ty-16); ctx.stroke();
      if (state.telRevealed){ ctx.fillStyle="rgba(232,192,90,.9)"; ctx.fillRect(tx-2,ty-14,2,2); ctx.fillRect(tx+2,ty-14,2,2); }   /* 相认后的眼点 */
      const tlabel = state.telRevealed ? (state.suitorsSwept?"他站直了——不用再找了":"「大厅里剩下的，我们一起算」")
        : state.finaleDone ? "他守着大厅——也守着一句话"
        : "他在数海上的帆";
      ctx.fillStyle="rgba(240,220,190,.85)"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center";
      ctx.fillText(tlabel, tx, ty-26);
    }});
  }
  /* 乞丐斗篷（墙角：杖+斗篷） */
  ents.push({y:7*ATS+ATS*0.75, draw(){
    const x=17*ATS+ATS/2, y=7*ATS+ATS/2;
    if (!state.disguise){
      ctx.fillStyle="#6a5c48"; ctx.beginPath(); ctx.ellipse(x,y+4,10,7,0,0,7); ctx.fill();
      ctx.strokeStyle="#4a4034"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(x+8,y+2); ctx.lineTo(x+14,y-18); ctx.stroke();
      ctx.fillStyle="rgba(240,220,190,.7)"; ctx.font="9px 'Segoe UI'"; ctx.textAlign="center";
      ctx.fillText("一件旧斗篷", x, y-24);
    } else {
      ctx.fillStyle="rgba(60,55,45,.35)"; ctx.beginPath(); ctx.ellipse(x,y+4,10,4,0,0,7); ctx.fill();
    }
  }});
  pushPlayerEnt(ents);
  ents.sort((a,b)=>a.y-b.y);
  for (const e of ents) e.draw();
  /* 黎明层：雾在散（青灰→暖金的渐变，终章的调色） */
  const lg=cg(0,0,0,600,[0,"rgba(120,140,165,.22)",1,"rgba(255,214,150,.10)"]);
  ctx.fillStyle=lg; ctx.fillRect(0,0,1000,600);
  /* 批次 R2：公共材质后处理——陆地材质噪点 + 统一方向光（画在实体层之后，
     连树与建筑一起受光，整岛不再像一堆各自为政的贴纸） */
  terrPaint({ tileAt: itTile, cols: ACOLS, rows: AROWS, ts: ATS, key: "ithaca" });
  const vg=ctx.createRadialGradient(400,240,200, 400,240,560);
  vg.addColorStop(0,"rgba(60,80,100,0)"); vg.addColorStop(1,"rgba(30,40,60,.32)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,1000,600);
}


// --- renderHUD (was main+4437-4509, 73 lines) ---
function renderHUD(){
  document.getElementById("hudCoins").textContent = state.coins;
  document.getElementById("hudHp").textContent = state.hp;
  /* 批次 I2：风旗——风向箭头 + 顺/侧/逆航速档（只在海上显示） */
  const hw = document.getElementById("hudWind");
  if (hw){
    const show = scene==="world" && !titleOn;
    hw.style.display = show ? "" : "none";
    if (show){
      const f = windFactor();
      const deg = Math.round(windDir*180/Math.PI);
      const tag = f>1.15 ? ["顺风 ×1.3","#2e7d52"] : f<0.95 ? ["逆风 ×0.78","#a04a4a"] : ["侧风","#4a6b8a"];
      const route = (typeof seaRoute==="function") ? seaRoute() : null;
      const cur = (typeof currentAt==="function") ? currentAt() : null;
      /* 窄屏截断实测：风旗整句 232px 塞进 131px 的 pill → 后半截（航路/洋流）被裁掉。
         窄屏只留「风向 + 档位」，完整信息进 title（悬停/长按可看）。 */
      const tight = (typeof window!=="undefined") ? window.innerWidth < 760 : false;
      const routeTxt = (route && !tight) ? ` · ${route.label}` : "";
      const curTxt = (cur && !tight) ? ` <span style="color:#1f6f7a">· ${cur.name}</span>` : "";
      hw.innerHTML = `<span style="display:inline-block;transform:rotate(${deg}deg)">➤</span> ${windFromLabel(windDir)} · ${tag[0]}${routeTxt}${curTxt}`;
      hw.title = `风：${windFromLabel(windDir)}（${tag[0]}）` + (route?` ｜ 航路：${route.name}`:"") + (cur?` ｜ 洋流：${cur.name}`:"");
      hw.style.color = tag[1];
    }
  }
  const bar = document.getElementById("hudHpBar");
  const pct = Math.max(0, Math.min(100, state.hp))/100;
  bar.style.width = (pct*100)+"%";
  bar.style.background = state.hp>60 ? "#3fae6a" : state.hp>30 ? "#e0a23c" : "#e05252";
  /* 生存需求 / 等级 / 时辰 */
  const hb=document.getElementById("hudHungerBar"), tb=document.getElementById("hudThirstBar");
  hb.style.width = Math.max(0,Math.min(100,state.hunger))+"%"; hb.style.background = state.hunger>40?"#c9933f":"#e05252";
  tb.style.width = Math.max(0,Math.min(100,state.thirst))+"%"; tb.style.background = state.thirst>40?"#3f8fae":"#e05252";
  document.getElementById("hudHungerVal").textContent = Math.round(state.hunger);   /* Steam 化：需求条数值化（原只有进度条，玩家不知还剩多少） */
  document.getElementById("hudThirstVal").textContent = Math.round(state.thirst);
  /* 主界面只报一条「补给」：取饿与渴里更紧的那个，细节展开在航海日记 */
  const supplyEl = document.getElementById("hudSupplyVal");
  if (supplyEl) supplyEl.textContent = Math.round(Math.min(state.hunger, state.thirst));
  document.getElementById("hudLv").textContent = state.level;
  document.getElementById("hudXpBar").style.width = Math.min(100, state.xp/xpToNext(state.level)*100)+"%";
  /* 船队（17h）：特洛伊出海后点亮 12 艘，折损肉眼可见 */
  const hClockEl = document.getElementById("hudClock");
  if (state.fleet>0 && !hClockEl.dataset.fleetPill){
    const pill=document.createElement("span"); pill.className="pill"; pill.id="hudFleet";
    hClockEl.parentNode.insertBefore(pill, hClockEl);
    hClockEl.dataset.fleetPill="1";
  }
  const fPill=document.getElementById("hudFleet");
  if (fPill){ fPill.innerHTML = `⛵ 船队 <b>${state.fleet}</b>/12`; fPill.style.display = state.fleet>0 ? "" : "none"; }
  /* 船员 pill（P1.1）：账本点亮后常驻——清零也留着，「最后一人」的重量肉眼可见 */
  if (state.crewLit && !hClockEl.dataset.crewPill){
    const cP=document.createElement("span"); cP.className="pill"; cP.id="hudCrew";
    hClockEl.parentNode.insertBefore(cP, hClockEl);
    hClockEl.dataset.crewPill="1";
  }
  const crewPill=document.getElementById("hudCrew");
  if (crewPill){ crewPill.innerHTML = `⚑ 船员 <b>${state.crew||0}</b>/12`; crewPill.style.display = state.crewLit ? "" : "none";
    crewPill.style.color = (state.crew||0)<=6 ? "#e6a09a" : "";
    crewPill.title="查看具名船员名册"; crewPill.style.cursor="pointer";
    crewPill.onclick=()=>{ document.getElementById("questPanel").style.display="block"; setQuestTab("crew"); }; }
  const hh=Math.floor(hourNow()), mm=Math.floor(state.clock%60);
  document.getElementById("hudClock").textContent = `${clockName()} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  /* 批次 K3 · B2：海域状态 pill——「这片海正在发生什么」常驻在顶栏（只有出海时出现）
     注意插入点：必须挂在**顶栏**（#hudQuest 之前），不能挂在 hudClock 旁边——
     hudClock 在「航海日记」折叠面板里（index.html 的 #hudLogClockRow），
     挂那儿玩家根本看不见（第一版就是这么写的，截图里查无此 pill 才被发现）。
     刷新逻辑搬到 events.js 的 updateRegionPill()：它挂在**主循环**里每帧跑，
     因为 loop() 不调 renderHUD()——挂在 renderHUD 里的话，航行中跨海域 pill 不跟着变。 */
  if (typeof updateRegionPill==="function") updateRegionPill();
  /* 多任务账本：进行中的全部展示，全完成则示「委托已完成」 */
  const q=document.getElementById("hudQuest");
  const qs=Object.values(state.quests||{});
  const active=qs.filter(v=>!v.done);
  if (active.length){ q.style.display=""; q.innerHTML = active.map(v=>`「${v.name}」 ${v.ready?"<b>可交付</b>":`<b>${v.have}/${v.need}</b>`}`).join("　"); }
  else if (qs.length){ q.style.display=""; q.innerHTML=`委托已完成`; }
  else q.style.display="none";
  /* 航向引导（闭环）：当前该去哪，一行说清（纯规则零模型） */
  const cp=document.getElementById("hudCompass");
  const obj=nextObjective();
  if (obj && !titleOn && !dlgOpen && !mapOpen && !chapterOn){ cp.style.display=""; cp.innerHTML=compassHTML(obj); cp.title=obj.text; }   /* 批次 I1b：悬停看全文 */
  else cp.style.display="none";
  /* 风袋快捷键（有风袋才出现） */
  const wb=document.getElementById("windBtn");
  if (state.backpack["风袋"]){ wb.style.display=""; wb.textContent = `风袋 ×${state.backpack["风袋"]}`; }
  else wb.style.display="none";
  if (document.getElementById("questPanel").style.display==="block") renderQuests();
  const ks=Object.keys(state.backpack);
  if (document.getElementById("bagPanel").style.display==="block"){   /* 面板开着才重建 DOM（原来 renderHUD 每秒全量重建背包，白耗且开着时 hover 态闪烁；关闭→打开由 bagBtn onclick 里的 renderHUD 补刷） */
    document.getElementById("bagList").innerHTML = ks.length
      ? ks.map(k=>`<div class="it"><span>${k}</span><b>×${state.backpack[k]}</b></div>`).join("")
        + (state.equipped?`<div class="it"><span>手持</span><b>${state.equipped}</b></div>`:"")
      : '<div style="color:#b6c2d2;font-size:12px">（空空如也）</div>';
  }
}


// --- renderQuests (was main+4889-4919, 31 lines) ---
let questTab = "journey";
function setQuestTab(tab){
  questTab = tab==="fate" ? "fate" : tab==="runs" ? "runs" : tab==="crew" ? "crew" : "journey";
  for (const [id,key] of [["questJourneyTab","journey"],["questCrewTab","crew"],["questFateTab","fate"],["questRunsTab","runs"]]){
    const b=document.getElementById(id);
    b.classList.toggle("active",questTab===key);
    b.setAttribute("aria-selected",questTab===key?"true":"false");
  }
  renderQuests();
}
function renderCrew(){
  if (!state.crewLit) return '<div class="empty">（十二人的名字，要等特洛伊出海后才会写进这本船册。）</div>';
  const alive=new Set(Array.isArray(state.crewList)?state.crewList:[]);
  const losses=new Map((state.crewLost||[]).map(entry=>[entry.name,entry]));
  const rows=CREW_ROSTER.map((name,i)=>{
    const living=alive.has(name), loss=losses.get(name);
    return `<div class="q crew ${living?"alive":"lost"}"><b>${String(i+1).padStart(2,"0")} · ${name}</b><span class="crewState">${living?"在船":"折损"}</span><br><span class="sub">${CREW_ROLES[i]||"旗舰班底"}${loss?` · ${loss.why}`:""}</span></div>`;
  }).join("");
  return `<div class="secT">旗 舰 班 底<span class="fateCount">${alive.size} / ${CREW_ROSTER.length}</span></div>
    <div class="crewSummary">在船 ${alive.size} 人 · 折损 ${losses.size} 人<span>船队 ${state.fleet||0}/12 与旗舰班底分账记载</span></div>${rows}`;
}
function renderIslandCodex(){
  const visited=state.legs||{};
  const count=ISLANDS.filter(is=>visited[is.scene]).length;
  const rows=ISLANDS.map(is=>visited[is.scene]
    ? `<div class="q codex island done"><b>✓ ${is.name}</b><br><span class="sub">${is.note}</span><br><span class="sub codexRisk">赌注 · ${is.stake}<br>回报 · ${is.reward}</span></div>`
    : '<div class="q codex island locked"><span class="sub">○ 未知海域</span></div>').join("");
  return `<div class="secT">群 岛 图 鉴<span class="fateCount">${count} / ${ISLANDS.length}</span></div>${rows}`;
}
function renderRelicCodex(){
  const rows=CODEX_RELICS.map(item=>{
    let got=false; try{ got=!!item.cond(); }catch(e){}
    return got
      ? `<div class="q codex relic done"><b>✓ ${item.name}</b><br><span class="sub">${item.desc}</span></div>`
      : '<div class="q codex relic locked"><span class="sub">○ 尚未亲历</span></div>';
  }).join("");
  const count=CODEX_RELICS.filter(item=>{try{return !!item.cond();}catch(e){return false;}}).length;
  return `<div class="secT">旅 途 信 物<span class="fateCount">${count} / ${CODEX_RELICS.length}</span></div>${rows}`;
}
function renderFate(){
  const got=state.achiv||[];
  const lines=[
    {name:"荷马之线",items:ACHIV.filter(a=>a.canon)},
    {name:"改写之线",items:ACHIV.filter(a=>a.dev)},
  ];
  const fate=lines.map(line=>{
    const count=line.items.filter(a=>got.includes(a.id)).length;
    const rows=line.items.map(a=>got.includes(a.id)
      ? `<div class="q fate done"><b>✓ ${a.name}</b><br><span class="sub">${a.desc}</span></div>`
      : '<div class="q fate locked"><span class="sub">○ 尚未点亮</span></div>').join("");
    return `<div class="secT">${line.name}<span class="fateCount">${count} / ${line.items.length}</span></div>${rows}`;
  }).join("");
  return fate+renderIslandCodex()+renderRelicCodex();
}
function renderRuns(){
  const list=runArchive();
  if (!list.length) return '<div class="empty">（还没有归档的航程——把一段路走完，海会替你记住。）</div>';
  const best=runBest(list);
  const rows=list.map(r=>{
    const d=new Date(r.at);
    const stamp=`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
    return `<div class="q run"><b>${r.name}</b> · ${r.ending}<br><span class="sub">${stamp} · 原著 ${r.canon} · 改写 ${r.dev} · 航序 ${r.legs}/14 · Lv.${r.level}${r.crewLit?` · 船员 ${r.crew}/12`:""}</span></div>`;
  }).join("");
  return `<div class="secT">本 机 纪 录<span class="fateCount">${best.runs} 次航程</span></div>`+
    `<div class="q run best">各项最佳 · 原著 ${best.canon} · 改写 ${best.dev} · 船员 ${best.crew}/12 · Lv.${best.level}</div>`+
    `<div class="secT">历 次 归 档</div>${rows}`;
}
function renderQuests(){
  const box=document.getElementById("questList");
  if (questTab==="crew"){ box.innerHTML=renderCrew(); return; }
  if (questTab==="fate"){ box.innerHTML=renderFate(); return; }
  if (questTab==="runs"){ box.innerHTML=renderRuns(); return; }
  /* —— 主线航程：只露已走完的路与眼前这一步，后面的海留给罗盘 —— */
  let curIdx = MAIN_STEPS.findIndex(s=>!s.done());
  const cur = curIdx>=0 ? MAIN_STEPS[curIdx] : null;
  const mainRows = MAIN_STEPS.map((s,i)=>{
    const ok = s.done();
    const isCur = cur && s.k===cur.k;
    if (!ok && !isCur) return "";             /* 不在前方报站：未到的岛连名字都不给 */
    const sub = isCur ? (s.hint + (s.alt?`（${s.alt}）`:"")) : (s.alt||"已点亮");
    return `<div class="q step${ok?" done":""}${isCur?" now":""}">
      <b>${ok?"✓":"○"} ${s.name}</b>${isCur?'<span class="curTag">当前</span>':""}${sub?`<br><span class="sub">${sub}</span>`:""}
    </div>`;}).join("");
  const sealedRow = (cur && MAIN_STEPS.length-curIdx-1 > 0)
    ? `<div class="q step sealed"><b>○ 未命名的海域</b><br><span class="sub">罗盘只说下一段</span></div>`
    : "";
  /* —— 近期抉择：保留选择及其真实代价，跨存档可回看 —— */
  const choiceRows = (state.choiceLog||[]).slice(0,3).map(entry=>`
    <div class="q choice"><b>${entry.title} · ${entry.choice}</b><br>
      <span class="sub">${entry.changes.length?entry.changes.join(" · "):"命运已记下这次选择；没有即时数值变化"}</span>
    </div>`).join("");
  /* —— 抉择回声：跨场景持久化的选择（这些会在后续岛的对话与选项里产生回响） ——
     锐评 F（实玩批）：原样打印 state.decisions 的键名，玩家看到的是 `troy_fire → 放下火把`，
     内部 ID 直接漏到 UI。补一张中文标签表，未知键回退原样（新抉择上线忘加标签也不炸）。 */
  const DEC_LABELS = {
    troy_fire:"特洛伊之夜", ismaros_plunder:"伊斯玛洛斯 · 劫掠", lotus_fruit:"食莲",
    cyclops_name:"巨人的名字", mead:"蜜酒之约", telepylos_ship:"忒勒皮洛斯 · 守船",
    aeolia_winds:"风袋的代价", crew_noise:"太阳岛 · 声响", calypso:"奥吉吉亚 · 去留",
    scheria_guest:"斯克里 · 做客", tel_reveal:"忒勒皮洛斯 · 相认", troy_song:"特洛伊 · 挽歌",
  };
  const decEntries = Object.entries(state.decisions||{});
  const decRows = decEntries.length ? decEntries.map(([k,v])=>`
    <div class="q decision"><b>${DEC_LABELS[k]||k} → ${v}</b></div>`).join("") : "";
  /* —— 可选旧路 —— */
  const optRows = OPT_STEPS.map(s=>{
    const ok = s.done();
    return `<div class="q opt${ok?" done":""}"><b>${ok?"✓":"○"} ${s.name}</b><br><span class="sub">${ok?"已点亮":s.hook}</span></div>`;
  }).join("");
  /* —— 委托账本（原样保留） —— */
  const qs=Object.values(state.quests||{});
  const questRows = qs.length ? qs.map(v=>`
    <div class="q${v.done?" done":""}">
      <b>${v.name}</b> · ${v.who==="aeolus"?"埃俄罗斯":"喀耳刻"}<br>
      ${v.done?(v.turned?"已交付（结清）":"已完成") : v.ready?"<b style='color:#2563eb'>目标达成 · 可交付</b>" : `进度 ${v.have}/${v.need}`}
      ${!v.done?`<span class="bar"><i style="width:${Math.min(100,Math.round(v.have/v.need*100))}%"></i></span>`:""}
    </div>`).join("") : '<div class="empty">（暂无委托在身——支线找 NPC 谈）</div>';
  box.innerHTML = `
    <div class="secT">主 线 航 程</div>${mainRows}${sealedRow}
    ${choiceRows?`<div class="secT">近 期 抉 择</div>${choiceRows}`:""}
    ${decRows?`<div class="secT">抉 择 回 声（持久）</div>${decRows}`:""}
    <div class="secT">可 选 旧 路</div>${optRows}
    <div class="secT">委 托 账 本</div>${questRows}`;
}


// --- dynamicSamples (was main+5839-5852, 14 lines) ---
function dynamicSamples(){
  const base = NPCS[currentNPC].samples.slice();
  const wq = getQuest("witch_grass");
  if (currentNPC==="witch"){
    if (wq && !wq.done) return ["交玛草给她","采到玛草了","有什么活儿？","我想买一瓶治疗草药","再见"];
  }
  if (currentNPC==="seer"){
    if (state.offered && !state.prophecy) return ["我选长路","我选捷径","预言我回家的事","这里都有些谁？","再见"];
  }
  if (currentNPC==="cattle" && state.backpack["鱼"]){
    return ["讲讲赫利俄斯的规矩","我快饿死了","你们是谁","再见"];
  }
  return base;
}


// --- renderSamples (was main+5853-5860, 8 lines) ---
function renderSamples(){
  const box = document.getElementById("samples");
  box.innerHTML = "";
  dynamicSamples().forEach(s=>{
    const b=document.createElement("button"); b.textContent=s; b.onclick=()=>send(s);
    box.appendChild(b);
  });
}

// === 全局声明（自主脚本迁入） ===

// --- _grainPat (migrated from main script) ---
let _grainPat = null;

// --- STARS (migrated from main script) ---
const STARS = (() => { let s=54321; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
  const a=[]; for (let i=0;i<70;i++) a.push({x:rnd()*100, y:rnd()*58, r:0.9+rnd()*1.5, p:rnd()*6.28}); return a; })();

// --- gullT (migrated from main script) ---
let gullT = 8, crackleT = 0;

// --- cv (migrated from main script) ---
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");

/* 锐评 A（实玩批）：主画布 backing 固定 1000×600 被 CSS 拉伸到舞台尺寸 → 桌面大窗口/高 DPI 屏全糊
   （海图浮层早就做了 DPR，主画面反而没有，对比之下更明显）。
   改为 backing 跟随舞台实际尺寸 × devicePixelRatio（上限 2，4K 下不炸填充率），
   逻辑坐标仍是 1000×600：主循环每帧开头 setTransform(kx,0,0,ky,0,0)，全部绘制代码零改动。 */
function fitCanvasBacking(){
  const stage = document.getElementById("stage");
  if (!stage) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round(stage.clientWidth * dpr));
  const h = Math.max(200, Math.round(stage.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
}
fitCanvasBacking();
window.addEventListener("resize", fitCanvasBacking);

// --- dolphinLeapUntil (migrated from main script) ---
let dolphinLeapUntil = 0;                        /* J4：互动后 3s 大跃出 */

// --- dolphinCool (migrated from main script) ---
const dolphinCool = {};                          /* J4：每群冷却（会话级，防刷历练） */

// --- FISH (migrated from main script) ---
const FISH = { on:false, fish:0.5, fishDir:1, fishSp:0.55, zone:0.40, zoneDir:1, ZONE_W:0.22, hits:0, miss:0, HITS:3, MISS:3, tLeft:25, cdUntil:0 };

// --- drifts (migrated from main script) ---
let drifts = [];   /* {x,y,kind:'bottle'|'crate', born} —— 稳定引用，W3D 经 __game.drifts 同步 */

// --- driftNextAt (migrated from main script) ---
let driftNextAt = 0;

// --- meteors (migrated from main script) ---
let meteors = [], meteorNextAt = performance.now() + 8000;

// --- toastTimer (migrated from main script) ---
let toastTimer=null;

// --- _shotBusy (migrated from main script) ---
let _shotBusy = false;

// === 主脚本残留（第二批迁入） ===

// --- CLOUDS (migrated from main script) ---
const CLOUDS = (()=>{
  const arr=[]; let s=20261107;
  const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  for (let i=0;i<12;i++) arr.push({x:rnd()*1200, y:rnd()*620, r:46+rnd()*86, sp:5+rnd()*11, a:0.045+rnd()*0.05});
  return arr;
})();

