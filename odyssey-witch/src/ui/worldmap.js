// ============================================================
// 奥德赛 · 世界海图增强层
// canvas 叠加（洋流 / 航迹 / 未探明雾层 / 目标信标 / 罗盘）+ 缩放拖动 + 岛屿笔记卡
// 依赖全局：ISLANDS, state, nextObjective, boatMapPos, windDir, windFromLabel, mapOpen
// ============================================================
(function(){
  const TAU = Math.PI*2;
  const $ = (id)=>document.getElementById(id);

  let board=null, vp=null, layer=null, cv=null, ctx=null, card=null;
  let active=false, raf=0, W=0, H=0, dpr=1;
  let scale=1, tx=0, ty=0;
  let pts=new Map(), pinch=null, dragMoved=false, suppressClick=false;
  let hideTimer=0;

  /* 洋流：与航速结算共用 SEA_CURRENTS（constants.js 的同一份数据，已按实际网格投影） */
  const CURRENTS = (typeof SEA_CURRENTS!=="undefined" && SEA_CURRENTS.length)
    ? SEA_CURRENTS.map(c=>c.pts)
    : [];

  /* 抉择回声：岛 → 该岛留下的关键决定（state.decisions 的键） */
  const DEC_ECHO = {
    troy:["troy_fire"], ismaros:["ismaros_plunder"], lotus:["lotus_fruit"],
    cyclops:["cyclops_name","mead"], telepylos:["telepylos_ship"],
    aeolia:["aeolia_winds"], sun:["crew_noise"], ogggia:["calypso"]
  };

  function isOpen(scene){ return typeof mapOpen!=="undefined" && mapOpen; }

  /* ---------- 尺寸 / 视口 ---------- */
  function syncSize(){
    if (!board) return;
    const r = board.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(W*dpr), bh = Math.round(H*dpr);
    if (cv.width!==bw || cv.height!==bh){ cv.width=bw; cv.height=bh; }
  }

  function clampView(){
    scale = Math.max(1, Math.min(3.2, scale));
    const mw = W*(scale-1), mh = H*(scale-1);
    tx = Math.max(-mw, Math.min(0, tx));
    ty = Math.max(-mh, Math.min(0, ty));
  }

  function apply(){
    const m = `translate(${tx}px, ${ty}px) scale(${scale})`;
    vp.style.transform = m;
    layer.style.transform = m;
    layer.style.setProperty("--inv", String(1/scale));
    board.classList.toggle("zoomed", scale > 1.28);   /* 放大后才显示状态/航序徽章，远景不糊成一团 */
  }

  function zoomAt(px, py, ns){
    ns = Math.max(1, Math.min(3.2, ns));
    const k = ns/scale;
    tx = px - (px - tx)*k;
    ty = py - (py - ty)*k;
    scale = ns;
    clampView(); apply();
  }

  function resetView(){ scale=1; tx=0; ty=0; clampView(); apply(); }

  /* ---------- 绘制 ---------- */
  const pct = (is)=>[is.mp[0]/100*W, is.mp[1]/100*H];

  function smooth(path){
    if (path.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i=1;i<path.length-1;i++){
      const mx=(path[i][0]+path[i+1][0])/2, my=(path[i][1]+path[i+1][1])/2;
      ctx.quadraticCurveTo(path[i][0], path[i][1], mx, my);
    }
    const last=path[path.length-1];
    ctx.lineTo(last[0], last[1]);
  }

  function drawGraticule(){
    ctx.strokeStyle="rgba(238,226,200,.045)";
    ctx.lineWidth=1/scale;
    for (let i=1;i<10;i++){
      const x=W*i/10, y=H*i/10;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
  }

  function drawCurrents(t){
    ctx.save();
    for (const c of CURRENTS){
      const path=c.map(p=>[p[0]/100*W, p[1]/100*H]);
      /* 宽而淡的流带：远看「水在走」，近看细碎流线 */
      ctx.strokeStyle="rgba(120,196,212,.14)";
      ctx.lineWidth=10/scale; ctx.lineJoin="round";
      smooth(path); ctx.stroke();
      ctx.strokeStyle="rgba(154,224,236,.55)";
      ctx.lineWidth=1.5/scale;
      ctx.setLineDash([2/scale, 12/scale]);
      ctx.lineDashOffset = -t*22/scale;
      smooth(path); ctx.stroke();
      /* 泡沫点：沿流线缓慢前移，海面有了颗粒 */
      ctx.setLineDash([]);
      ctx.fillStyle="rgba(214,242,248,.34)";
      for (let i=0;i<c.length;i++){
        const p=c[i], q=c[Math.min(i+1,c.length-1)];
        const ph=(t*0.06 + i*0.17)%1;
        const x=(p[0]+(q[0]-p[0])*ph)/100*W, y=(p[1]+(q[1]-p[1])*ph)/100*H;
        const r=(0.9+1.0*((i+Math.floor(t*0.3))%3))/scale;
        ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* 动态海面：极淡的斜向涌浪带（overlay 只提亮水色，不脏陆地） */
  function drawSeaLife(t){
    ctx.save();
    ctx.globalCompositeOperation="overlay";
    const band=H*0.16;
    for (let i=-1;i<8;i++){
      const y=((t*9 + i*band) % (H+band*2)) - band;
      const g=ctx.createLinearGradient(0,y-band,0,y+band);
      g.addColorStop(0,"rgba(140,205,225,0)");
      g.addColorStop(.5,"rgba(140,205,225,.05)");
      g.addColorStop(1,"rgba(140,205,225,0)");
      ctx.fillStyle=g; ctx.fillRect(0,y-band,W,band*2);
    }
    ctx.restore();
  }

  function trailStops(){
    const arr = (state && Array.isArray(state.trail)) ? state.trail : [];
    const out=[];
    for (const s of arr){
      const is=ISLANDS.find(i=>i.scene===s.k);
      if (is) out.push({is, p:pct(is), leg:(typeof s.leg==="number"?s.leg:is.leg), t:s.t});
    }
    if (out.length) return out;
    /* 旧档兜底：没有 trail 也不让航迹回看失效，按航序点亮还原 */
    if (!state || !state.legs) return [];
    return ISLANDS
      .filter(is=>is.scene && typeof is.leg==="number" && state.legs[is.scene])
      .sort((a,b)=>a.leg-b.leg)
      .map(is=>({is, p:pct(is), leg:is.leg, t:null}));
  }

  function visitedPath(){
    const stops=trailStops();
    if (stops.length>1) return stops.map(s=>s.p);
    /* 旧档兜底：没有 trail 时按航序点亮还原一条大致航迹 */
    if (!state || !state.legs) return [];
    return ISLANDS
      .filter(is=>is.scene && typeof is.leg==="number" && state.legs[is.scene])
      .sort((a,b)=>a.leg-b.leg)
      .map(pct);
  }

  /* 航迹站点：真实到访顺序上的每一站（最近一站带呼吸环） */
  function drawTrailStops(){
    const stops=trailStops();
    if (stops.length<2) return;
    ctx.save();
    for (let i=0;i<stops.length;i++){
      const [x,y]=stops[i].p;
      const last=i===stops.length-1;
      ctx.fillStyle=last?"rgba(255,238,196,.95)":"rgba(240,206,138,.6)";
      ctx.beginPath(); ctx.arc(x,y,(last?3.2:1.9)/scale,0,TAU); ctx.fill();
      if (last){
        ctx.strokeStyle="rgba(255,238,196,.5)"; ctx.lineWidth=1/scale;
        ctx.beginPath(); ctx.arc(x,y,5.5/scale,0,TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 抉择回声：在这座岛做过关键选择的，岛名上方落一枚琥珀色菱形 */
  function drawDecisionEchoes(t){
    if (!state || !state.decisions) return;
    ctx.save();
    for (const is of ISLANDS){
      const keys=DEC_ECHO[is.scene]||[];
      if (!keys.some(k=>state.decisions[k])) continue;
      const [x,y]=pct(is);
      const pulse=(Math.sin(t*1.6+is.mp[0])+1)/2;
      ctx.save();
      ctx.translate(x, y-11/scale);
      ctx.rotate(Math.PI/4);
      const s=3.9/scale;
      ctx.strokeStyle=`rgba(255,190,110,${.55+.35*pulse})`;
      ctx.lineWidth=1.3/scale;
      ctx.strokeRect(-s,-s,s*2,s*2);
      ctx.restore();
    }
    ctx.restore();
  }

  /* 海面事件回声：每一次海遇在发生地留一枚青色小环 */
  function drawSeaEchoes(t){
    if (!state || !Array.isArray(state.seaEchoes)) return;
    ctx.save();
    for (const e of state.seaEchoes){
      const x=e.x/100*W, y=e.y/100*H;
      const pulse=(Math.sin(t*1.4+e.x)+1)/2;
      ctx.strokeStyle=`rgba(150,214,230,${.26+.3*pulse})`;
      ctx.lineWidth=.9/scale;
      ctx.beginPath(); ctx.arc(x,y,4.8/scale,0,TAU); ctx.stroke();
      ctx.fillStyle="rgba(186,236,248,.78)";
      ctx.beginPath(); ctx.arc(x,y,1.7/scale,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 航迹回看 ---------- */
  let replay=null;
  function showTrailTip(text, on){
    const tip=$("mapTrailTip"); if (!tip) return;
    if (text) tip.textContent=text;
    tip.classList.toggle("show", !!on);
  }
  function stopReplay(){ replay=null; showTrailTip("", false); }
  function startReplay(){
    const stops=trailStops();
    if (stops.length<2){
      replay=null;
      showTrailTip("航迹还不够长——再走一座岛，海图才有的回看。", true);
      clearTimeout(hideTimer);
      hideTimer=setTimeout(()=>showTrailTip("", false), 2600);
      return;
    }
    replay={at:performance.now(), stops};
  }
  function drawReplay(){
    if (!replay) return;
    const elapsed=(performance.now()-replay.at)/1000;
    const DUR=Math.min(10, replay.stops.length*0.85);
    const prog=Math.min(1, elapsed/DUR);
    const segs=[]; let total=0;
    for (let i=1;i<replay.stops.length;i++){
      const d=Math.hypot(replay.stops[i].p[0]-replay.stops[i-1].p[0], replay.stops[i].p[1]-replay.stops[i-1].p[1]);
      segs.push(d); total+=d;
    }
    if (total<=0){ stopReplay(); return; }
    let want=prog*total, acc=0, cur=0, f=0;
    for (let i=0;i<segs.length;i++){
      if (want<=acc+segs[i] || i===segs.length-1){
        cur=i; f=segs[i]?Math.min(1,(want-acc)/segs[i]):1; break;
      }
      acc+=segs[i];
    }
    const a=replay.stops[cur].p, b=replay.stops[cur+1].p;
    const x=a[0]+(b[0]-a[0])*f, y=a[1]+(b[1]-a[1])*f;
    ctx.save();
    ctx.shadowColor="rgba(255,220,150,.95)"; ctx.shadowBlur=12/scale;
    ctx.fillStyle="rgba(255,246,214,.98)";
    ctx.beginPath(); ctx.arc(x,y,3.2/scale+1,0,TAU); ctx.fill();
    ctx.restore();
    const idx=Math.min(replay.stops.length-1, cur+(f>=0.999?1:0));
    const target=replay.stops[idx];
    showTrailTip(`航迹回看 ${idx+1}/${replay.stops.length} · ${target.is.name}${target.t!=null?` · 第 ${Math.floor(target.t/60)} 时`:""}`, true);
    if (prog>=1) replay.at=performance.now();   /* 循环回看，直到再按一次 / 关图 */
  }

  function drawRoute(t){
    const path = visitedPath();
    if (path.length > 1){
      ctx.save();
      ctx.strokeStyle="rgba(240,206,138,.20)";
      ctx.lineWidth=5/scale;
      ctx.lineJoin="round";
      smooth(path); ctx.stroke();
      ctx.shadowColor="rgba(240,206,138,.55)";
      ctx.shadowBlur=6/scale;
      ctx.strokeStyle="rgba(246,220,164,.55)";
      ctx.lineWidth=1.3/scale;
      smooth(path); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.strokeStyle="rgba(255,238,196,.75)";
      ctx.setLineDash([9/scale, 11/scale]);
      ctx.lineDashOffset=-t*26/scale;
      smooth(path); ctx.stroke();
      ctx.setLineDash([]);
      /* 航迹流光：一枚金点沿已走过的航程巡航，让海图「活着」 */
      let total=0;
      const segs=[];
      for (let i=1;i<path.length;i++){
        const d=Math.hypot(path[i][0]-path[i-1][0], path[i][1]-path[i-1][1]);
        segs.push(d); total+=d;
      }
      const travel=(t*0.055)%1.35;
      if (total>0 && travel<=1){
        let want=travel*total, acc=0;
        for (let i=0;i<segs.length;i++){
          if (want<=acc+segs[i] && segs[i]>0){
            const f=(want-acc)/segs[i];
            const x=path[i][0]+(path[i+1][0]-path[i][0])*f;
            const y=path[i][1]+(path[i+1][1]-path[i][1])*f;
            ctx.shadowColor="rgba(255,220,150,.95)";
            ctx.shadowBlur=10/scale;
            ctx.fillStyle="rgba(255,242,208,.95)";
            ctx.beginPath(); ctx.arc(x,y, 2.6/scale+1, 0, TAU); ctx.fill();
            ctx.shadowBlur=0;
            break;
          }
          acc+=segs[i];
        }
      }
      ctx.restore();
    }
    /* 船 → 下一段目标：一条只在需要时出现的虚线（不剧透目标细节） */
    const obj = (typeof nextObjective==="function") ? nextObjective() : null;
    const target = obj && obj.k ? ISLANDS.find(is=>is.scene===obj.k) : null;
    if (target && typeof boatMapPos==="function"){
      const [bx,by]=boatMapPos();
      const a=[bx/100*W, by/100*H], b=pct(target);
      const pulse=(Math.sin(t*2.1)+1)/2;
      ctx.save();
      ctx.strokeStyle=`rgba(255,226,160,${.28+.22*pulse})`;
      ctx.lineWidth=1.2/scale;
      ctx.setLineDash([2/scale, 8/scale]);
      ctx.lineDashOffset=-t*18/scale;
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- 动态天气 ----------
     风纹读 windDir / windFactor（与航速同一份风）；昼夜读 state.clock；
     风暴单体读 state.seaEchoes 里真实发生过的 storm / wreckboat 海遇落点。
     全部 canvas 绘制，无外部资源；reduced-motion 下只保留静止天气。 */
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const STORM_IDS = {storm:1, wreckboat:1};
  let windParts=null, cloudParts=null, starParts=null, rainParts=null, flash=0;

  function seedRnd(seed){
    let s=seed;
    return ()=>{ s=(s*16807)%2147483647; return s/2147483647; };
  }
  function ensureWeather(){
    if (windParts) return;
    const r=seedRnd(20261114);
    windParts=Array.from({length:96},()=>({x:r(),y:r(),len:0.5+r(),bend:(r()-0.5)*1.6,ph:r(),a:0.07+r()*0.10}));
    cloudParts=Array.from({length:7},()=>({x:r(),y:r(),s:0.09+r()*0.13,sp:0.3+r()*0.5,a:0.05+r()*0.05}));
    starParts=Array.from({length:44},()=>({x:r(),y:r()*0.72,ph:r(),a:0.25+r()*0.5}));
    rainParts=Array.from({length:56},()=>({x:r(),y:r(),sp:0.6+r()*0.8,len:0.5+r()}));
  }
  function windStrength(){
    if (typeof windFactor==="function"){
      const f=windFactor();
      return Math.max(0.55, Math.min(1.5, 0.55+f*0.6));
    }
    return 1;
  }
  function hourOf(){
    if (typeof hourNow==="function") return hourNow();
    return (state && typeof state.clock==="number") ? state.clock/60 : 12;
  }
  function weatherPhase(){
    const h=hourOf();
    if (h<5.5 || h>=20.5) return "night";
    if (h<8) return "dawn";
    if (h<17) return "day";
    return "dusk";
  }
  function stormCells(){
    const arr=(state && Array.isArray(state.seaEchoes)) ? state.seaEchoes : [];
    const out=[];
    for (const e of arr) if (e && STORM_IDS[e.id]) out.push(e);
    return out.slice(-3);
  }

  /* 风纹：朝风吹向漂移的细羽毛，长度与速度随风力 */
  function drawWindField(t){
    ensureWeather();
    const dir=(typeof windDir==="number")?windDir:0;
    const dx=Math.cos(dir), dy=Math.sin(dir), nx=-dy, ny=dx;
    const str=windStrength(), inv=1/Math.max(1,scale);
    ctx.save();
    ctx.lineCap="round";
    for (const p of windParts){
      const travel=((t*0.020*str + p.ph) % 1);
      const x=(((p.x + dx*travel*1.25)%1)+1)%1*W;
      const y=(((p.y + dy*travel*1.25)%1)+1)%1*H;
      const len=(15+p.len*30)/Math.max(1,scale*0.7);
      const bend=p.bend*len*0.30;
      ctx.strokeStyle=`rgba(228,242,248,${p.a})`;
      ctx.lineWidth=inv;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+dx*len*0.52+nx*bend, y+dy*len*0.52+ny*bend, x+dx*len, y+dy*len);
      ctx.stroke();
      ctx.strokeStyle=`rgba(228,242,248,${p.a*0.65})`;
      ctx.beginPath();
      ctx.moveTo(x+dx*len*0.55, y+dy*len*0.55);
      ctx.lineTo(x+dx*len*0.37+nx*len*0.16, y+dy*len*0.37+ny*len*0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 云影：大团柔和暗云沿海面缓慢漂移 */
  function drawClouds(t){
    ensureWeather();
    const dir=(typeof windDir==="number")?windDir:0;
    const dx=Math.cos(dir), dy=Math.sin(dir);
    ctx.save();
    for (const c of cloudParts){
      const travel=((t*0.006*c.sp) % 1.4) - 0.2;
      const cx=(((c.x + dx*travel)+1)%1)*W;
      const cy=(((c.y + dy*travel*0.35)+1)%1)*H;
      const rr=c.s*Math.max(W,H);
      const g=ctx.createRadialGradient(cx,cy,rr*0.08,cx,cy,rr);
      g.addColorStop(0,`rgba(12,26,38,${c.a})`);
      g.addColorStop(.55,`rgba(12,26,38,${c.a*0.55})`);
      g.addColorStop(1,"rgba(12,26,38,0)");
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(cx,cy,rr,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* 风暴单体：真实海遇留下的风暴海域会转、会下雨、会打闪 */
  function drawStorms(t){
    const cells=stormCells();
    if (!cells.length) return;
    ensureWeather();
    const dir=(typeof windDir==="number")?windDir:0;
    const dx=Math.cos(dir), dy=Math.sin(dir);
    const inv=1/Math.max(1,scale);
    for (let si=0; si<cells.length; si++){
      const e=cells[si];
      const cx=e.x/100*W, cy=e.y/100*H;
      const r=Math.max(W,H)*0.082*(0.9+0.1*Math.sin(t*0.9+si));
      ctx.save();
      const g=ctx.createRadialGradient(cx,cy,r*0.06,cx,cy,r*1.55);
      g.addColorStop(0,"rgba(14,24,36,.58)");
      g.addColorStop(.5,"rgba(16,26,38,.34)");
      g.addColorStop(1,"rgba(16,26,38,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,r*1.55,0,TAU); ctx.fill();
      ctx.lineCap="round";
      for (let k=0;k<3;k++){
        const a0=t*0.55 + k*TAU/3;
        ctx.strokeStyle=`rgba(202,220,230,${.22+.07*Math.sin(t*1.2+k)})`;
        ctx.lineWidth=2.4*inv;
        ctx.beginPath(); ctx.arc(cx,cy,r*(0.62+0.16*k),a0,a0+1.9); ctx.stroke();
      }
      ctx.strokeStyle="rgba(196,222,236,.44)";
      ctx.lineWidth=inv;
      for (const p of rainParts){
        const pr=((t*0.55*p.sp + p.y) % 1);
        const ang=p.x*TAU;
        const rad=r*(0.35+pr*1.25);
        const rx=cx+Math.cos(ang)*rad*1.1 + dx*pr*r*0.5;
        const ry=cy+Math.sin(ang)*rad*0.8 + dy*pr*r*0.5;
        const L=(6+p.len*9)*inv;
        ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-dx*L*0.5, ry-dy*L*0.5+L*0.9); ctx.stroke();
      }
      if (!reduceMotion){
        const cyc=(t + e.x*0.31) % 6.4;
        if (cyc < 0.16){
          const k=1-cyc/0.16;
          ctx.strokeStyle=`rgba(240,248,255,${.55*k})`;
          ctx.lineWidth=1.6*inv;
          ctx.beginPath();
          let lx=cx, ly=cy-r*0.2;
          ctx.moveTo(lx,ly);
          for (let s=1;s<=4;s++){
            lx += (s%2?1:-1)*r*0.12*(0.7+s*0.1);
            ly += r*0.16;
            ctx.lineTo(lx,ly);
          }
          ctx.stroke();
          flash=Math.max(flash, 0.07*k);
        }
      }
      ctx.restore();
    }
  }

  /* 昼夜光照：按游戏内时钟染色（屏幕空间，画在罗盘之前） */
  function drawDaylight(t){
    ensureWeather();
    const ph=weatherPhase();
    if (ph==="night"){
      ctx.fillStyle="rgba(9,22,44,.34)";
      ctx.fillRect(0,0,W,H);
      for (const s of starParts){
        const tw=0.55+0.45*Math.sin(t*1.6+s.ph*7);
        ctx.fillStyle=`rgba(214,230,250,${s.a*0.55*tw})`;
        ctx.beginPath(); ctx.arc(s.x*W, s.y*H, 0.9, 0, TAU); ctx.fill();
      }
      const mx=W*0.78, my=H*0.2, mr=Math.max(W,H)*0.30;
      const mg=ctx.createRadialGradient(mx,my,0,mx,my,mr);
      mg.addColorStop(0,"rgba(198,220,244,.16)");
      mg.addColorStop(1,"rgba(198,220,244,0)");
      ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(mx,my,mr,0,TAU); ctx.fill();
      return;
    }
    const h=hourOf();
    const k=Math.min(1, Math.max(0, (h-6)/13));
    const sunX=W*k, sunY=H*(0.10+0.22*Math.sin(Math.PI*k));
    const sr=Math.max(W,H)*0.34;
    const sg=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,sr);
    if (ph==="dusk"){
      sg.addColorStop(0,"rgba(255,146,68,.18)");
      sg.addColorStop(1,"rgba(255,146,68,0)");
    } else if (ph==="dawn"){
      sg.addColorStop(0,"rgba(255,182,128,.16)");
      sg.addColorStop(1,"rgba(255,182,128,0)");
    } else {
      sg.addColorStop(0,"rgba(255,238,196,.11)");
      sg.addColorStop(1,"rgba(255,238,196,0)");
    }
    ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
    if (ph==="dusk" || ph==="dawn"){
      const g2=ctx.createLinearGradient(0, ph==="dusk"?H:0, 0, ph==="dusk"?0:H);
      g2.addColorStop(0, ph==="dusk" ? "rgba(120,60,40,.10)" : "rgba(90,110,150,.08)");
      g2.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);
    }
  }

  function drawFog(t){
    if (!state || !state.legs) return;
    ctx.save();
    for (const is of ISLANDS){
      if (!is.scene || state.legs[is.scene]) continue;
      const [x,y]=pct(is);
      const r=Math.max(W*0.055, 34);
      const a=0.26+0.04*Math.sin(t*0.7+is.mp[0]);
      const g=ctx.createRadialGradient(x,y,r*0.15,x,y,r);
      g.addColorStop(0,`rgba(12,22,36,${a})`);
      g.addColorStop(0.58,`rgba(12,22,36,${a*0.5})`);
      g.addColorStop(1,"rgba(12,22,36,0)");
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
      /* 雾絮：三团缓慢绕行，未探明海域自己会动（静止首帧也成立） */
      const spin=t*0.12 + is.mp[0]*0.07;
      for (let k=0;k<3;k++){
        const ang=spin + k*TAU/3;
        const orbit=r*(0.55+0.18*k);
        const wx=x+Math.cos(ang)*orbit, wy=y+Math.sin(ang)*orbit*0.62;
        const wr=r*(0.42+0.08*Math.sin(t*0.5+k));
        const wa=0.10+0.03*Math.sin(t*0.9+k*2);
        const wg=ctx.createRadialGradient(wx,wy,0,wx,wy,wr);
        wg.addColorStop(0,`rgba(20,32,48,${wa})`);
        wg.addColorStop(1,"rgba(20,32,48,0)");
        ctx.fillStyle=wg;
        ctx.beginPath(); ctx.arc(wx,wy,wr,0,TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBeacon(t){
    const obj = (typeof nextObjective==="function") ? nextObjective() : null;
    if (!obj || !obj.k) return;
    const target = ISLANDS.find(is=>is.scene===obj.k);
    if (!target) return;
    const [x,y]=pct(target);
    const pulse=(Math.sin(t*2.2)+1)/2;
    ctx.save();
    ctx.strokeStyle=`rgba(255,214,140,${.30+.38*pulse})`;
    ctx.lineWidth=2/scale;
    ctx.beginPath(); ctx.arc(x,y, (9+11*pulse)/(scale>1.6?scale*0.8:1), 0, TAU); ctx.stroke();
    ctx.strokeStyle="rgba(255,230,180,.55)";
    ctx.lineWidth=1/scale;
    ctx.beginPath(); ctx.arc(x,y,3.5,0,TAU); ctx.stroke();
    ctx.restore();
  }

  function drawCompass(){
    const cx=W-44, cy=H*0.55, r=24;
    const dir=(typeof windDir==="number") ? windDir : 0;
    ctx.save();
    const bg=ctx.createRadialGradient(cx,cy,2,cx,cy,r*1.5);
    bg.addColorStop(0,"rgba(8,16,26,.55)");
    bg.addColorStop(1,"rgba(8,16,26,0)");
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.arc(cx,cy,r*1.5,0,TAU); ctx.fill();
    ctx.globalAlpha=.9;
    ctx.strokeStyle="rgba(226,204,160,.45)";
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r*0.62,0,TAU); ctx.stroke();
    for (let i=0;i<8;i++){
      const a=i*TAU/8;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*r*0.72, cy+Math.sin(a)*r*0.72);
      ctx.lineTo(cx+Math.cos(a)*r*0.9, cy+Math.sin(a)*r*0.9);
      ctx.stroke();
    }
    ctx.translate(cx,cy); ctx.rotate(dir);
    ctx.fillStyle="rgba(246,214,150,.9)";
    ctx.beginPath(); ctx.moveTo(r*0.66,0); ctx.lineTo(-r*0.18,r*0.20); ctx.lineTo(-r*0.18,-r*0.20); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(150,216,224,.7)";
    ctx.beginPath(); ctx.moveTo(-r*0.62,0); ctx.lineTo(0,r*0.13); ctx.lineTo(0,-r*0.13); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle="rgba(232,220,190,.78)";
    ctx.font="10px 'Songti SC',serif";
    ctx.textAlign="right";
    const label=(typeof windFromLabel==="function") ? windFromLabel(dir) : "风";
    let cap="风 · "+label;
    if (typeof scene!=="undefined" && scene==="world" && typeof windFactor==="function"){
      const f=windFactor();
      cap += f>1.15 ? " · 顺风" : f<0.9 ? " · 逆风" : " · 侧风";
    }
    ctx.fillText(cap, W-14, cy+r+15);
    const cur=(typeof currentAt==="function") ? currentAt() : null;
    if (cur){
      ctx.fillStyle="rgba(150,214,224,.85)";
      ctx.fillText("洋流 · "+cur.name, W-14, cy+r+28);
    }
    ctx.restore();
  }

  function frame(ts){
    if (!active) return;
    raf=requestAnimationFrame(frame);
    if (!isOpen()) return;
    if (board.classList.contains("siteMap")){ ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); return; }
    syncSize();
    const t=ts/1000;
    const wt=reduceMotion?0:t;          /* 减弱动态：天气参数冻结在静止态 */
    flash = reduceMotion ? 0 : flash*0.72;   /* 闪电余辉逐帧衰减 */
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*tx,dpr*ty);
    drawGraticule();
    drawSeaLife(t);
    drawClouds(wt);
    drawWindField(wt);
    drawCurrents(t);
    drawRoute(t);
    drawTrailStops();
    drawDecisionEchoes(t);
    drawSeaEchoes(t);
    drawStorms(wt);
    drawFog(wt);
    drawBeacon(t);
    drawReplay();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawDaylight(wt);
    if (flash > 0.002){
      ctx.fillStyle=`rgba(228,240,255,${Math.min(.16, flash*1.5).toFixed(3)})`;
      ctx.fillRect(0,0,W,H);
    }
    drawCompass(t);
  }

  /* ---------- 岛屿笔记卡 ---------- */
  function setRow(id, text){
    const row=$(id);
    if (row) row.style.display = text ? "flex" : "none";
  }

  function showCard(scene){
    const is = ISLANDS.find(i=>i.scene===scene);
    if (!is) return;
    const obj = (typeof nextObjective==="function") ? nextObjective() : null;
    const visited = !!(state && state.legs && state.legs[scene]);
    const isNext = !!(obj && obj.k===scene);

    const stopIdx = trailStops().findIndex(s=>s.is.scene===scene);
    $("mcKicker").textContent = isNext
      ? "▶ 下一段航程"
      : visited
        ? ("航程 · #"+(typeof is.leg==="number"?is.leg:"—") + (stopIdx>=0?` · 航迹第 ${stopIdx+1} 站`:""))
        : "未探明的海域";
    $("mcTitle").textContent = is.name;

    if (!visited && !isNext){
      $("mcNote").textContent = "海图上还没落笔的一页——先驶过去，故事才肯写。";
      $("mcStake").textContent = ""; $("mcReward").textContent = "";
      setRow("mcStakeRow",""); setRow("mcRewardRow","");
      $("mcEcho").textContent = "";
    } else {
      $("mcNote").textContent = is.note || "";
      $("mcStake").textContent = is.stake || "";
      setRow("mcStakeRow", is.stake);
      if (visited){
        $("mcReward").textContent = is.reward || "";
        setRow("mcRewardRow", is.reward);
      } else {
        $("mcReward").textContent = ""; setRow("mcRewardRow","");
      }
      const keys = DEC_ECHO[scene] || [];
      const labels = keys.map(k=>state.decisions && state.decisions[k]).filter(Boolean);
      $("mcEcho").textContent = labels.length ? ("回声：你在这里选了「"+labels.join("」「")+"」") : "";
    }
    card.classList.add("show");
  }

  function hideCard(){ if (card) card.classList.remove("show"); }

  /* ---------- 事件 ---------- */
  function bind(){
    board.addEventListener("wheel", (e)=>{
      if (board.classList.contains("siteMap")) return;
      e.preventDefault();
      const r=board.getBoundingClientRect();
      zoomAt(e.clientX-r.left, e.clientY-r.top, scale*(e.deltaY<0?1.14:1/1.14));
    }, {passive:false});

    board.addEventListener("pointerdown", (e)=>{
      if (board.classList.contains("siteMap")) return;
      if (e.target.closest("#mapZoom, #mapClose, #mapCard, #mapRoute, #mapTrailTip")) return;
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      dragMoved=false; suppressClick=false;
      if (pts.size===1) board.classList.add("dragging");
      if (pts.size===2){
        const [a,b]=[...pts.values()];
        pinch={d:Math.hypot(a.x-b.x, a.y-b.y), s:scale};
      }
    });

    window.addEventListener("pointermove", (e)=>{
      if (!pts.has(e.pointerId)) return;
      const prev=pts.get(e.pointerId);
      pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      const r=board.getBoundingClientRect();
      if (pts.size===2 && pinch){
        const [a,b]=[...pts.values()];
        const d=Math.hypot(a.x-b.x, a.y-b.y);
        const ns=pinch.s*(d/Math.max(1,pinch.d));
        const mx=(a.x+b.x)/2-r.left, my=(a.y+b.y)/2-r.top;
        zoomAt(mx,my,ns);
        dragMoved=true;
        return;
      }
      const dx=e.clientX-prev.x, dy=e.clientY-prev.y;
      if (Math.abs(dx)+Math.abs(dy) > 2) dragMoved=true;
      tx+=dx; ty+=dy;
      clampView(); apply();
    });

    const endPt = (e)=>{
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size<2) pinch=null;
      if (pts.size===0){
        board.classList.remove("dragging");
        if (dragMoved){
          suppressClick=true;
          setTimeout(()=>{ suppressClick=false; }, 0);
        }
      }
    };
    window.addEventListener("pointerup", endPt);
    window.addEventListener("pointercancel", endPt);

    board.addEventListener("click", (e)=>{
      if (suppressClick){ suppressClick=false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    board.addEventListener("dblclick", (e)=>{
      if (board.classList.contains("siteMap")) return;
      if (e.target.closest("#mapZoom, #mapClose, #mapCard, #mapRoute, #mapTrailTip")) return;
      resetView();
    });

    layer.addEventListener("mouseover", (e)=>{
      const m=e.target.closest(".mapMark");
      if (m){ clearTimeout(hideTimer); showCard(m.dataset.scene); }
    });
    layer.addEventListener("mouseout", (e)=>{
      const m=e.target.closest(".mapMark");
      if (!m) return;
      clearTimeout(hideTimer);
      hideTimer=setTimeout(hideCard, 160);
    });
    layer.addEventListener("click", (e)=>{
      const m=e.target.closest(".mapMark");
      if (!m) return;
      showCard(m.dataset.scene);
    });

    $("mzIn").addEventListener("click", ()=>zoomAt(W/2,H/2,scale*1.25));
    $("mzOut").addEventListener("click", ()=>zoomAt(W/2,H/2,scale/1.25));
    $("mzFit").addEventListener("click", resetView);
    const trailBtn=$("mzTrail");
    if (trailBtn) trailBtn.addEventListener("click", ()=>{ replay ? stopReplay() : startReplay(); });
    const routeBox=$("mapRoute");
    if (routeBox) routeBox.addEventListener("click", (e)=>{
      const b=e.target.closest("[data-route]");
      if (b && typeof setSeaRoute==="function") setSeaRoute(b.dataset.route);
    });
    window.addEventListener("resize", ()=>{ if (active){ syncSize(); clampView(); apply(); } });
  }

  /* 航路姿态按钮：与 state.seaRoute 同步（打开海图 / 改航路时刷新） */
  function syncRoute(){
    const box=$("mapRoute"); if (!box) return;
    const key=(typeof seaRouteKey==="function") ? seaRouteKey() : "open";
    box.querySelectorAll("[data-route]").forEach(b=>{
      const on=b.dataset.route===key;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on?"true":"false");
    });
  }

  function init(){
    if (board) return;
    board=$("mapBoard"); vp=$("mapViewport"); layer=$("mapLayer"); cv=$("mapFx"); card=$("mapCard");
    if (!board || !vp || !layer || !cv) return;
    ctx=cv.getContext("2d");
    bind();
  }

  const WorldMap = {
    open(){
      init();
      if (!ctx) return;
      active=true;
      resetView(); hideCard(); stopReplay(); syncRoute();
      syncSize(); clampView(); apply();
      if (!raf) raf=requestAnimationFrame(frame);
    },
    close(){
      active=false;
      if (raf){ cancelAnimationFrame(raf); raf=0; }
      hideCard(); stopReplay();
      if (board) board.classList.remove("dragging");
    },
    showCard,
    syncRoute,
    /* 当前天气快照：风读 windDir/windFactor，昼夜读游戏时钟，风暴读真实海遇落点 */
    weather(){
      const dir=(typeof windDir==="number") ? windDir : 0;
      return {
        phase: weatherPhase(),
        hour: +hourOf().toFixed(2),
        windDir: dir,
        windLabel: (typeof windFromLabel==="function") ? windFromLabel(dir) : "",
        strength: +windStrength().toFixed(2),
        storms: stormCells().length,
        reducedMotion: reduceMotion
      };
    },
    /* 聚焦到海图上的某个百分比坐标（商店截图与后续「点岛居中」共用） */
    focus(px, py, ns){
      init(); if (!ctx) return;
      syncSize();
      scale = Math.max(1, Math.min(3.2, ns||1.7));
      tx = -(px/100)*W*scale + W/2;
      ty = -(py/100)*H*scale + H/2;
      clampView(); apply();
    }
  };
  window.WorldMap = WorldMap;
})();
