/* ==================================================================
 * island3d.js — 岛内 3D 开放大陆渲染器（渲染层替换，玩法零改动）
 * 与 world3d.js 同模式：读取经典脚本挂载的 window.__ISL3D + window.__game，
 * 把 2.5D 瓦片场景渲染成 3D 开放大陆（地表按瓦片分色 + 道具 + 玩家胶囊 + 交互环）。
 * 碰撞/交互/状态仍全部在 index.html 的逻辑坐标（aiaPlayer 像素）跑，这里只负责"看"。
 * WebGL 失败 → failed=true，主循环自动回退 2D drawXxx。
 * ================================================================== */
import * as THREE from './vendor/three.module.min.js';

const PAL = {
  oceanMid: 0x2e96c4, oceanDeep: 0x1f6f9e, grassMain: 0xa8cf8e, grassDeep: 0x7d9c66,
  path: 0xd9cf9a, plank: 0xc9a06a, trunk: 0x6b4a2a, leaf: 0x2f6b41,
  fire: 0xe0783a, stone: 0x8a8f96, wall: 0xc99b6a, roof: 0x8a5a34, waterTint: 0x7ec8e5,
};
const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.7, 0.45).normalize();

let renderer = null, scene = null, camera = null, ready = false, failed = false;
let mainland = null, ringsG = null, playerMesh = null, lastScene = null;

const IS_SCALE = 0.12;              /* 1 逻辑像素 → 3D 单位（40px 瓦片 → 4.8 单位） */
const COLS = 20, ROWS = 12;
const CX = COLS * 20, CY = ROWS * 20;   /* 像素中心 (400,240) */
const W = COLS * 4.8, H = ROWS * 4.8;   /* 地表宽高（单位） */
const px2x = (px) => (px - CX) * IS_SCALE;
const px2z = (py) => (py - CY) * IS_SCALE;
const tileX = (cx) => px2x(cx * 40 + 20);
const tileZ = (cy) => px2z(cy * 40 + 20);

/* ---------- 材质 ---------- */
const MAT = {
  trunk: new THREE.MeshStandardMaterial({ color: PAL.trunk, roughness: 1, flatShading: true }),
  leaf:  new THREE.MeshStandardMaterial({ color: PAL.leaf, roughness: 1, flatShading: true }),
  stone: new THREE.MeshStandardMaterial({ color: PAL.stone, roughness: 1, flatShading: true }),
  wall:  new THREE.MeshStandardMaterial({ color: PAL.wall, roughness: 1, flatShading: true }),
  roof:  new THREE.MeshStandardMaterial({ color: PAL.roof, roughness: 1, flatShading: true }),
  fire:  new THREE.MeshBasicMaterial({ color: PAL.fire }),
  water: new THREE.MeshStandardMaterial({ color: 0x7ec8e5, roughness: 0.3, transparent: true, opacity: 0.85 }),
  plank: new THREE.MeshStandardMaterial({ color: PAL.plank, roughness: 1, flatShading: true }),
};

/* ---------- 道具 ---------- */
function makeTree(){ const g=new THREE.Group();
  const t=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.42,1.2,6),MAT.trunk); t.position.y=0.6; g.add(t);
  const l=new THREE.Mesh(new THREE.SphereGeometry(1.05,7,5),MAT.leaf); l.position.y=1.7; g.add(l); return g; }
function makeHouse(){ const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.0,3.2),MAT.wall); b.position.y=1.0; g.add(b);
  const r=new THREE.Mesh(new THREE.ConeGeometry(2.5,1.2,4),MAT.roof); r.rotation.y=Math.PI/4; r.position.y=2.6; g.add(r); return g; }
function makeFire(){ const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.8,0.3,8),MAT.stone); base.position.y=0.15; g.add(base);
  const fl=new THREE.Mesh(new THREE.SphereGeometry(0.45,6,4),MAT.fire); fl.position.y=0.6; g.add(fl); return g; }
function makeWell(){ const g=new THREE.Group();
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.95,0.5,8),MAT.stone); rim.position.y=0.25; g.add(rim);
  const inner=new THREE.Mesh(new THREE.SphereGeometry(0.6,7,4),MAT.water); inner.position.y=0.3; inner.scale.y=0.4; g.add(inner); return g; }
function makeStone(){ const s=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.8,1.0),MAT.stone); s.position.y=0.9; return s; }
function makePillar(){ const p=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,2.4,6),MAT.stone); p.position.y=1.2; return p; }
function makeShrub(){ const m=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,4),MAT.leaf); m.position.y=0.3; return m; }
function makeDock(){ const d=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.3,4.4),MAT.plank); d.position.y=0.15; return d; }

/* 字符 → 3D 物件 */
function propFor(ch){
  switch (ch) {
    case 'T': return makeTree();
    case 'H': case 'D': return makeHouse();
    case 'P': case 'G': return makeWell();
    case 'A': case 'C': case 'S': case 'X': case 'R': case 'K': case 'L': case 'V': return makeStone();
    case 'F': return makeFire();
    case 'W': return makePillar();
    case 'B': case 'M': return makeShrub();
    case '_': return makeDock();
    default: return null;
  }
}
/* 瓦片地面颜色 */
function groundColorFor(ch){
  switch (ch) {
    case '~': return 0x2e96c4;      /* 水格：海蓝 */
    case ',': return 0xd9bb9a;      /* 小径 */
    case '_': return 0xc9a06a;      /* 栈桥 */
    default:  return 0xa8cf8e;      /* 草地 */
  }
}

/* 地表：按瓦片逐格着色（顶点色 + flatShading），外圈海面低一档 */
function buildTerrain(mapArr){
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(W, H, COLS, ROWS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    /* 顶点所在瓦片（PlaneGeometry 0..COLS × 0..ROWS 网格） */
    const gx = Math.min(COLS - 1, Math.max(0, Math.round((pos.getX(i) / W + 0.5) * COLS)));
    const gy = Math.min(ROWS - 1, Math.max(0, Math.round((pos.getZ(i) / H + 0.5) * ROWS)));
    const ch = (mapArr[gy] || []).charAt(gx) || '~';
    c.set(groundColorFor(ch));
    const h = ch === '~' ? -0.3 : 0.0;      /* 水格微沉 */
    pos.setY(i, h);
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  g.add(mesh);
  /* 外圈海面（围绕地表大平面） */
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, H + 60, 1, 1),
    new THREE.MeshStandardMaterial({ color: PAL.oceanDeep, roughness: 0.5, metalness: 0.15, transparent: true, opacity: 0.95 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.9, 0);
  
  g.add(sea);
  return g;
}

/* 装配大陆：地表 + 每个瓦片道具 */
function buildMainland(mapArr){
  const g = buildTerrain(mapArr);
  for (let cy = 0; cy < mapArr.length && cy < ROWS; cy++) {
    const row = mapArr[cy];
    for (let cx = 0; cx < row.length && cx < COLS; cx++) {
      const ch = row[cx];
      const obj = propFor(ch);
      if (obj) { obj.position.x += tileX(cx); obj.position.z += tileZ(cy); g.add(obj); }
    }
  }
  return g;
}

/* 取当前场景瓦片矩阵（AIA 等是数组；PROLOGUE_SITES[sc] 是对象含 .map） */
function mapFor(sc){
  const maps = (window.__ISL3D && window.__ISL3D.maps) || {};
  const m = maps[sc];
  if (Array.isArray(m)) return m;
  if (m && Array.isArray(m.map)) return m.map;
  return null;
}

/* ---------- 玩家胶囊 ---------- */
function buildPlayer(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x243244, roughness: 1, flatShading: true }));
  body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xf2d8b0, roughness: 1, flatShading: true }));
  head.position.y = 1.8; g.add(head);
  return g;
}

/* ---------- 交互点金环 ---------- */
function buildSpotRings(sceneKey){
  const g = new THREE.Group();
  const spots = (window.__ISL3D && window.__ISL3D.spots && window.__ISL3D.spots[sceneKey]);
  const list = spots ? spots() : [];
  for (const s of list) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0xffd66b, roughness: 0.5, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px2x(s.x), 0.06, px2z(s.y));
    g.add(ring);
  }
  return g;
}

/* ---------- 初始化 ---------- */
function init(){
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); }
  catch (e) { failed = true; return; }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.oceanMid);
  scene.fog = null;   /* [调试] 验证雾是否导致灰蒙 */
  camera = new THREE.PerspectiveCamera(52, 1000 / 600, 0.1, 300);
  camera.position.set(0, 8, 20);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0c0b0, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.4);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(90);
  scene.add(sun);
  playerMesh = buildPlayer();
  scene.add(playerMesh);
  const cv = renderer.domElement;
  cv.id = "cv3dIsland";
  cv.style.cssText = "position:absolute; inset:0; width:100%; height:100%; border-radius:14px;";
  const stage = document.getElementById("stage");
  const cv2 = document.getElementById("cv");
  stage.insertBefore(cv, cv2);
  function fit(){
    const w = Math.max(320, stage.clientWidth), h = Math.max(200, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  fit();
  window.addEventListener("resize", fit);
  ready = true;
}

/* 每帧 */
function frame(et){
  if (!ready) return;
  const G = window.__game;
  if (!G) return;
  const sc = G.getScene();
  if (sc === "world"){ /* 世界图交给 world3d.js */ return; }
  if (sc !== lastScene){
    lastScene = sc;
    if (mainland) scene.remove(mainland);
    if (ringsG) scene.remove(ringsG);
    mainland = buildMainland(mapFor(sc) || []);
    scene.add(mainland);
    ringsG = buildSpotRings(sc);
    scene.add(ringsG);
  }
  if (mainland) mainland.visible = true;
  if (ringsG) ringsG.visible = true;
  const p = G.player;
  if (playerMesh){
    const bob = Math.sin(et * 3.2) * 0.05;
    playerMesh.position.set(px2x(p.x), bob + 0.55, px2z(p.y));
  }
  const px = px2x(p.x), pz = px2z(p.y);
  /* 第三人称跟随：相机在玩家北侧上方（z-，岛内），视线朝南看向玩家，画面下部为岛内地表不越界 */
  const camTarget = new THREE.Vector3(px + 6, 8, pz - 9);
  camera.position.lerp(camTarget, 1 - Math.exp(-3.5 * 0.016));
  camera.lookAt(px, 0.8, pz);
  renderer.render(scene, camera);
}

init();
window.I3D = { get ready(){ return ready; }, get failed(){ return failed; }, frame,
  debug: () => ({ scene: lastScene,
    cam: camera ? camera.position.toArray().map(v=>Math.round(v*10)/10) : null,
    calls: renderer ? renderer.info.render.calls : null,
    tris: renderer ? renderer.info.render.triangles : null }) };