/* ==================================================================
 * world3d.js — 世界图 3D 大陆视觉（ocean 闭环替换 drawWorld，玩法零改动）
 * 移植自 3d/app P1 验收过的管线（HANDOFF §一.4）：
 *   海面三档色+金色光路 shader / 天穹地平线取雾色 / 统一左上光源 / flatShading 低多边形
 * 世界坐标映射：2D 像素 (0..920, 0..360) × 0.1 → 3D 单位，x-46 / z-18 居中。
 * 岛屿/船/门控逻辑全部仍在 index.html（islandNear/interact 不动），这里只负责"看"。
 * WebGL 初始化失败 → W3D.failed=true，主循环自动回退 2D drawWorld。
 * ================================================================== */
import * as THREE from './vendor/three.module.min.js';

/* ---------- 色板（唯一来源 odyssey-visual.md，与 3d/app/src/palette.js 同源） ---------- */
const PAL = {
  oceanDeep: 0x17618f, oceanMid: 0x2e96c4, oceanShore: 0x59c8dc,
  cliffLight: 0xe0bd84, cliffDark: 0x7c5c38,
  grassMain: 0xa8cf8e, grassDeep: 0x7d9c66,
  duskGold: 0xe8a84a, nightBase: 0x0c1018,
};
const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.7, 0.45).normalize();
const LIGHT2D = new THREE.Vector2(SUN_DIRECTION.x, SUN_DIRECTION.z).normalize();
const sstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

/* ---------- 种子噪声（与 3d/app/src/noise.js 同源，保证可复现） ---------- */
function hash2(x, y, seed) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return v00 + (v10 - v00) * u + (v01 - v00) * v + (v00 - v10 - v01 + v11) * u * v;
}
function fbm(x, y, seed = 0, oct = 4, lac = 2.0, gain = 0.5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 坐标映射 ---------- */
const SCALE = 0.1, OX = 46, OZ = 18;
const px2x = (px) => px * SCALE - OX;
const px2z = (px) => px * SCALE - OZ;

/* ---------- 岛屿视觉定义（与 ISLANDS 顺序一一对应，运行时按 scene 名匹配） ---------- */
const ISLE_LOOK = {
  aia:     { r: 3.4, grass: 0xa8cf8e, grassDeep: 0x7d9c66, seed: 20261107, mh: 1.15 },
  hades:   { r: 2.5, grass: 0x8a9a8c, grassDeep: 0x5d6f66, seed: 20261108, ash: true, mh: 0.9 },
  aeolia:  { r: 2.7, grass: 0xe8ecef, grassDeep: 0xc3d2da, seed: 20261109, floatY: 3.4, cloud: true, mh: 1.0 },
  strait:  { r: 2.9, grass: 0x5d6b74, grassDeep: 0x3e4a52, seed: 20261110, spires: true, mh: 1.1 },
  sun:     { r: 2.7, grass: 0xd8bd76, grassDeep: 0xb09250, seed: 20261111, gold: true, mh: 0.75 },
  /* 圣经收官三岛：奥吉吉亚暮紫 / 斯克里白亮橄榄 / 伊萨卡黎明青灰 */
  ogggia:  { r: 2.4, grass: 0xb08890, grassDeep: 0x8a6878, seed: 20261113, mh: 0.8 },
  scheria: { r: 2.6, grass: 0xc8d8a8, grassDeep: 0x9ab088, seed: 20261114, mh: 0.7 },
  ithaca:  { r: 2.8, grass: 0x8a9a88, grassDeep: 0x6a7a68, seed: 20261115, mh: 1.0 },
  /* 特洛伊（17h）：战火余烬——焦土黄褐 + 灰烬 */
  troy:    { r: 2.6, grass: 0xb09870, grassDeep: 0x8a7250, seed: 20261116, ash: true, mh: 0.9 },
};
const LOCKED_LOOK = { r: 1.3, grass: 0x93a3ad, grassDeep: 0x6d7d88, seed: 20261112, mist: true };
/* 大陆默认地貌（地中海橄榄绿）：不属于任何剧情岛的陆块用它，避免被邻近小岛的焦土/黄金色污染 */
const MAINLAND_LOOK = { r: 2.0, grass: 0x9dbf82, grassDeep: 0x78925f, seed: 20261120, mh: 1.0 };

let renderer, scene3, camera3, waterU, boatG, sailMesh, isleList = [];
let escortG = null, escortBoats = [], escPrev = null, escHead = { x: 0, z: -1 };
let fitFn = null;   /* init 内 fit 的稳定引用（setDPR 重算尺寸用） */
let driftG = null, driftSlots = [];   /* 漂流物（Steam 化玩法批）：预建 4 槽，随 __game.drifts 同步 */
let worldGroup = null, waterMesh = null, skyGroup = null, cloudGroup = null, troyGroup = null;
let yawCur = 0; let ready = false; let failed = false; let lastEt = -1;

/* ---------- 岛屿网格（顶点色 + flatShading，P1 同款风格） ---------- */
function buildIsle(cfg) {
  const r = cfg.r, seed = cfg.seed;
  const geo = new THREE.PlaneGeometry(r * 5.2, r * 5.2, 44, 44);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(cfg.grass), cGrassD = new THREE.Color(cfg.grassDeep);
  const cSand = new THREE.Color(PAL.cliffLight), cCliffL = new THREE.Color(PAL.cliffLight);
  const cCliffD = new THREE.Color(PAL.cliffDark), cOcean = new THREE.Color(PAL.oceanMid);
  const maxH = (0.62 * r + 1.15) * (cfg.mh || 1);
  const eps = 0.25;
  const hAt = (x, z) => {
    const n = Math.hypot(x, z) / r;
    const detail = fbm(x * 0.5, z * 0.5, seed, 4);
    const fine = fbm(x * 1.3 + 7.3, z * 1.3 - 4.1, seed + 999, 3);
    if (n < 1.0) {
      /* 自然锥体 + 噪声起伏：消灭“石盘上放山”的割裂感 */
      const cone = Math.max(0.08, maxH * (1 - n) * (0.8 + fbm(x * 0.9, z * 0.9, seed + 55, 3) * 0.45));
      return cone + fine * 0.18;
    }
    if (n < 1.12) return THREE.MathUtils.lerp(0.08, -0.55, sstep((n - 1.0) / 0.12, 0, 1));
    return THREE.MathUtils.lerp(-0.55, -1.5, sstep(Math.min((n - 1.12) / 0.26, 1), 0, 1));
  };
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = hAt(x, z);
    pos.setY(i, h);
    /* 浮岛：裙边向内收锥+岩石色，消除方形悬空底板（穿模 bug 根治） */
    if (h < -0.55 && cfg.floatY) {
      const t = Math.min((-h - 0.55) / 0.95, 1) * (0.72 + fbm(x * 2.1, z * 2.1, seed + 31, 2) * 0.28);
      pos.setX(i, x * (1 - t * 0.42));
      pos.setZ(i, z * (1 - t * 0.42));
      pos.setY(i, -0.42 - t * 1.1);
    }
    const gx = (hAt(x + eps, z) - hAt(x - eps, z)) / (2 * eps);
    const gz = (hAt(x, z + eps) - hAt(x, z - eps)) / (2 * eps);
    const detail = fbm(x * 1.1 + 3.7, z * 1.1 - 2.9, seed + 77, 3);
    c.copy(cGrass).lerp(cGrassD, THREE.MathUtils.clamp(detail * 1.4 - 0.2, 0, 1));
    c.lerp(cSand, 1 - sstep(h, 0.12, maxH * 0.4));
    if (h < 0) c.lerp(cfg.floatY ? cCliffD : cOcean, Math.min(-h / (cfg.floatY ? 3.2 : 1.6), 0.85));
    const g = Math.hypot(gx, gz);
    if (g > 1e-4 && h > 0.1) {
      const t = sstep(g, 0.55, 0.95);
      if (t > 0) {
        const lit = ((-gx * LIGHT2D.x - gz * LIGHT2D.y) / g) * 0.5 + 0.5;
        c.lerp(new THREE.Color().copy(cCliffL).lerp(cCliffD, THREE.MathUtils.clamp(lit, 0, 1)), t);
      }
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  return mesh;
}

/* ---------- 岛屿装配（读 window.ISLANDS——主脚本显式挂载；实测 ES 模块读不到经典脚本顶层 const） ---------- */
function buildIslands() {
  const group = new THREE.Group();
  const ISLES = window.ISLANDS || [];
  if (!ISLES.length) { console.warn("[W3D] window.ISLANDS 缺失：岛屿未装配（index.html 主脚本是否执行到位？）"); return group; }
  const G = window.__game;
  const grid = (G && G.worldGrid) ? G.worldGrid() : null;
  /* ---------- 对齐批：按碰撞格生成岛体（视觉水线＝陆块边界，3D/2D 碰撞不再有形差） ----------
     不再用「半径 r 的圆形锥体」，而是：连通陆块 → 每格离岸深度 → 角点高度场 → 半格精度三角化；
     海面一侧角点负高、内陆按深度抬升，水线精确落在 land/water 格边界上。 */
  if (grid) {
    const H = grid.length, W = grid[0].length;
    const WTS = (G.worldTileSize ? G.worldTileSize() : 20);
    const LAND = new Set(["#", "X", "G"]);
    const isLand = (x, y) => x >= 0 && y >= 0 && x < W && y < H && LAND.has(grid[y][x]);
    /* 连通陆块 */
    const seen = Array.from({ length: H }, () => new Array(W).fill(false));
    const comps = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isLand(x, y) || seen[y][x]) continue;
      const stack = [[x, y]], cells = [];
      seen[y][x] = true;
      while (stack.length) {
        const [cx, cy] = stack.pop(); cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (isLand(nx, ny) && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
        }
      }
      comps.push(cells);
    }
    const nearestLook = (cxPx, cyPx) => {
      let best = null, bd = 1e9;
      for (const is of ISLES) {
        const d = Math.hypot(cxPx - (is.gx * WTS + WTS / 2), cyPx - (is.gy * WTS + WTS / 2));
        if (d < bd) { bd = d; best = is; }
      }
      const look = best && best.scene ? (ISLE_LOOK[best.scene] || LOCKED_LOOK) : { ...LOCKED_LOOK };
      return { is: best, look };
    };
    for (const cells of comps) {
      const set = new Set(cells.map(([x, y]) => x + "," + y));
      /* 每格离岸深度（BFS 向内） */
      const depth = new Map();
      let frontier = [];
      for (const [x, y] of cells) {
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!set.has((x + dx) + "," + (y + dy))) edge = true;
        if (edge) { depth.set(x + "," + y, 1); frontier.push([x, y]); }
      }
      let d0 = 1;
      while (frontier.length) {
        const next = [];
        for (const [x, y] of frontier) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = (x + dx) + "," + (y + dy);
            if (set.has(k) && !depth.has(k)) { depth.set(k, d0 + 1); next.push([x + dx, y + dy]); }
          }
        }
        frontier = next; d0++;
      }
      let sx = 0, sy = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const [x, y] of cells) {
        sx += x * WTS + WTS / 2; sy += y * WTS + WTS / 2;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      const cxp = sx / cells.length, cyp = sy / cells.length;
      const nk = nearestLook(cxp, cyp);
      /* 主题色只在「该岛确实属于这个陆块」时启用：否则小岛的焦土/黄金色会把整片大陆染成褐色 */
      const owned = !!(nk.is && nk.is.scene && set.has(nk.is.gx + "," + nk.is.gy));
      const look = owned ? nk.look : MAINLAND_LOOK;
      const mh = (look.mh || 1);
      /* 体积按陆块面积给上限（大洲隆起、小岛也立得住），高度按离岸距离平滑抬升：
         旧版按格线性叠加会出现「每格跳 1.3 单位」的台阶，改为指数饱和曲线，坡面连续。 */
      const hMax = THREE.MathUtils.clamp(0.9 + cells.length * 0.018, 1.15, 3.4) * mh;
      const hCell = (x, y) => {
        const k = x + "," + y;
        if (!set.has(k)) return null;
        const d = depth.get(k) || 1;
        if (d <= 1) return 0.35;   /* 岸唇高于浪峰（±0.21），避免海面波浪穿入陆地 */
        return 0.35 + hMax * (1 - Math.exp(-(d - 1) / 2.4));
      };
      /* 角点高度（4 格平均；全水则按到陆块的距离下沉） */
      const vh = (cx, cy) => {
        let sum = 0, n = 0;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const h = hCell(cx + dx, cy + dy);
          if (h !== null) { sum += h; n++; }
        }
        if (n) return sum / n;
        let dmin = 1e9;
        for (const [x, y] of cells) {
          const ddx = Math.max(cx - (x + 1), x - cx, 0);
          const ddy = Math.max(cy - (y + 1), y - cy, 0);
          dmin = Math.min(dmin, Math.hypot(ddx, ddy));
        }
        return -0.32 - Math.min(dmin, 3) * 0.5;
      };
      /* 三角化：包围盒外扩 2 格（水下裙边） */
      const P1 = new THREE.Color(look.grass), P2 = new THREE.Color(look.grassDeep);
      const SAND = new THREE.Color(PAL.cliffLight), DEEP = new THREE.Color(PAL.oceanDeep);
      const ROCK = new THREE.Color(PAL.cliffDark);
      const positions = [], colors = [];
      const pushV = (px, py, h, tint) => {
        positions.push(px2x(px), h + (look.floatY ? look.floatY : 0), px2z(py));
        colors.push(tint.r, tint.g, tint.b);
      };
      const colFor = (h, cx, cy) => {
        /* 贴岸一圈（depth=1）为沙；向内有草丛/丘陵色，小岛不再整块染沙 */
        let shore = false;
        for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
          const k = (Math.floor(cx) + dx) + "," + (Math.floor(cy) + dy);
          if (set.has(k) && (depth.get(k) || 9) <= 1) shore = true;
        }
        if (h <= -0.05) return DEEP;
        if (shore) return SAND;
        const noise = fbm(cx * 0.4 + 11.3, cy * 0.4 - 7.9, look.seed || 1, 3);
        const t = THREE.MathUtils.clamp((h - 0.3) / 1.2, 0, 1);
        const c = SAND.clone().lerp(P1, t).lerp(P2, THREE.MathUtils.clamp(noise * 1.2, 0, 1) * 0.5);
        return c;
      };
      /* 岛顶：半格细分（1 单位步长）的高度场——平滑的海岸过渡，避免大块直角 */
      const vhHalf = (hx, hy) => {
        const x0 = Math.floor(hx), y0 = Math.floor(hy), x1 = Math.ceil(hx), y1 = Math.ceil(hy);
        return (vh(x0, y0) + vh(x1, y0) + vh(x0, y1) + vh(x1, y1)) / 4;
      };
      const STEP = 0.5;
      for (let y = minY - 1; y < maxY + 1.5; y += STEP) for (let x = minX - 1; x < maxX + 1.5; x += STEP) {
        const h1 = vhHalf(x, y), h2 = vhHalf(x + STEP, y), h3 = vhHalf(x, y + STEP), h4 = vhHalf(x + STEP, y + STEP);
        if (Math.max(h1, h2, h3, h4) < -0.05) continue;   /* 纯水格不建面 */
        const c1 = colFor(h1, x, y), c2 = colFor(h2, x + STEP, y), c3 = colFor(h3, x, y + STEP), c4 = colFor(h4, x + STEP, y + STEP);
        pushV(x * WTS, y * WTS, h1, c1); pushV(x * WTS, (y + STEP) * WTS, h3, c3); pushV((x + STEP) * WTS, y * WTS, h2, c2);
        pushV((x + STEP) * WTS, y * WTS, h2, c2); pushV(x * WTS, (y + STEP) * WTS, h3, c3); pushV((x + STEP) * WTS, (y + STEP) * WTS, h4, c4);
      }
      /* 岸线裙边：每条 land→water 边建「沙滩坡 + 岩壁」两层——
         坡顶严格在格边界（等碰撞线），向外 0.5 格落入水面、再 0.9 格沉入岩壁，消除悬浮感。 */
      const dirs = [
        { d: [1, 0],  a: [1, 0], b: [1, 1], out: [1, 0] },   /* 东边 */
        { d: [-1, 0], a: [0, 0], b: [0, 1], out: [-1, 0] },  /* 西边 */
        { d: [0, 1],  a: [0, 1], b: [1, 1], out: [0, 1] },   /* 南边 */
        { d: [0, -1], a: [0, 0], b: [1, 0], out: [0, -1] },  /* 北边 */
      ];
      const H_BEACH = -0.8, H_CLIFF = -2.2;
      for (const [x, y] of cells) {
        for (const { d, a, b, out } of dirs) {
          if (set.has((x + d[0]) + "," + (y + d[1]))) continue;   /* 邻居也是陆地：无岸线 */
          const ax = (x + a[0]) * WTS, ay = (y + a[1]) * WTS;
          const bx2 = (x + b[0]) * WTS, by2 = (y + b[1]) * WTS;
          const o = 2.2 * WTS;   /* 向水下延伸 1.1 格左右，水线之上留出可见沙坡 */
          /* 裙边内沿高度＝岛顶同点高度（vh 在整数格角与顶面完全一致），彻底消除接缝发丝缝 */
          const hA = Math.max(vh(x + a[0], y + a[1]), 0.35);
          const hB = Math.max(vh(x + b[0], y + b[1]), 0.35);
          /* 沙滩坡 + 岩壁裙边（水下）：岛体有厚度，岸线严格在格边界 */
          pushV(ax, ay, hA, SAND); pushV(bx2, by2, hB, SAND); pushV(ax + out[0] * o, ay + out[1] * o, H_BEACH, SAND);
          pushV(ax + out[0] * o, ay + out[1] * o, H_BEACH, SAND); pushV(bx2, by2, hB, SAND); pushV(bx2 + out[0] * o, by2 + out[1] * o, H_BEACH, SAND);
          const o2 = 3.0 * WTS;
          pushV(ax + out[0] * o, ay + out[1] * o, H_BEACH, ROCK); pushV(bx2 + out[0] * o, by2 + out[1] * o, H_BEACH, ROCK); pushV(ax + out[0] * o2, ay + out[1] * o2, H_CLIFF, ROCK);
          pushV(ax + out[0] * o2, ay + out[1] * o2, H_CLIFF, ROCK); pushV(bx2 + out[0] * o, by2 + out[1] * o, H_BEACH, ROCK); pushV(bx2 + out[0] * o2, by2 + out[1] * o2, H_CLIFF, ROCK);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
      /* 有效半径（供水面色带用）：质心到最远陆格角 + 余量 */
      let maxR = 0;
      for (const [x, y] of cells) {
        const cx = Math.max(Math.abs((x) * WTS - cxp), Math.abs((x + 1) * WTS - cxp));
        const cy = Math.max(Math.abs((y) * WTS - cyp), Math.abs((y + 1) * WTS - cyp));
        maxR = Math.max(maxR, Math.hypot(cx, cy));
      }
      const rU = maxR * SCALE + 0.25;
      const x3 = px2x(cxp), z3 = px2z(cyp);
      isleList.push({ x: x3, z: z3, r: rU, mesh });
      /* 主题装饰（保持原风格） */
      if (look.floatY) {
        const cloud = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(rU * 1.7, 2.6), 24, 12),
          new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 1, transparent: true, opacity: 0.88, flatShading: true })
        );
        cloud.scale.set(1.25, 0.32, 1.25);
        cloud.position.set(x3, look.floatY - 1.5, z3);
        group.add(cloud);
        const rock = new THREE.Mesh(new THREE.ConeGeometry(rU * 0.72, 1.8, 7),
          new THREE.MeshStandardMaterial({ color: PAL.cliffDark, flatShading: true, roughness: 1 }));
        rock.position.set(x3, look.floatY - 0.95, z3);
        group.add(rock);
      }
      if (look.spires) {
        const spireMat = new THREE.MeshStandardMaterial({ color: 0x39434b, flatShading: true, roughness: 1 });
        for (const [dx, dz, h, w] of [[1.1, -0.6, 2.6, 0.42], [-1.4, 0.8, 1.9, 0.34]]) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), spireMat);
          sp.position.set(x3 + dx, h / 2 - 0.2, z3 + dz);
          group.add(sp);
        }
      }
    }
    return group;
  }
  /* 兜底：旧圆形岛（worldGrid 不可用时） */
  for (const is of ISLES) {
    const look = is.scene ? (ISLE_LOOK[is.scene] || LOCKED_LOOK) : { ...LOCKED_LOOK, r: 1.3, seed: 20261112 + is.gx };
    const x3 = px2x(is.gx * 20 + 10), z3 = px2z(is.gy * 20 + 10);
    const mesh = buildIsle(look);
    mesh.position.set(x3, look.floatY || 0, z3);
    group.add(mesh);
    isleList.push({ x: x3, z: z3, r: look.r, mesh });
  }
  return group;
}

/* ---------- 海面（P1 shader 移植：三档色按"到最近岸线距离"，金色光路保留） ---------- */
function buildWater() {
  const geo = new THREE.PlaneGeometry(220, 170, 72, 60);
  geo.rotateX(-Math.PI / 2);
  /* 岸距纹理（对齐批）：按碰撞格烘焙「到陆地格的距离」，海面近岸色/浪花沿真实海岸线（不再用圆形近似） */
  const G0 = window.__game;
  const grid0 = (G0 && G0.worldGrid) ? G0.worldGrid() : null;
  let coastTex = null;
  const coastRect = new THREE.Vector4(px2x(0), px2z(0), 92, 36);
  const FAR = 40;
  if (grid0) {
    const H0 = grid0.length, W0 = grid0[0].length;
    const WTS0 = (G0.worldTileSize ? G0.worldTileSize() : 20);
    const cellW = WTS0 * SCALE;
    const minX = px2x(0), minZ = px2z(0);
    const worldW = W0 * cellW, worldH = H0 * cellW;
    coastRect.set(minX, minZ, worldW, worldH);
    const LAND0 = new Set(["#", "X", "G"]);
    const landC = [];
    for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) if (LAND0.has(grid0[y][x])) landC.push([minX + (x + 0.5) * cellW, minZ + (y + 0.5) * cellW]);
    const TW = W0 * 4, TH = H0 * 4;   /* 4 纹素/格：近岸色带与浪花过渡不再有格状锯齿 */
    const data = new Uint8Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const px = minX + (tx + 0.5) * (worldW / TW);
      const pz = minZ + (ty + 0.5) * (worldH / TH);
      let best = FAR;
      for (let i = 0; i < landC.length; i++) {
        const d = Math.hypot(px - landC[i][0], pz - landC[i][1]) - cellW * 0.5;
        if (d < best) { best = d; if (best <= 0) break; }
      }
      data[ty * TW + tx] = Math.max(0, Math.min(255, Math.round(Math.max(0, best) / FAR * 255)));
    }
    coastTex = new THREE.DataTexture(data, TW, TH, THREE.RedFormat, THREE.UnsignedByteType);
    coastTex.wrapS = coastTex.wrapT = THREE.ClampToEdgeWrapping;
    coastTex.magFilter = THREE.LinearFilter; coastTex.minFilter = THREE.LinearFilter;
    coastTex.needsUpdate = true;
  }
  waterU = {
    uTime: { value: 0 },
    uCoast: { value: coastTex },
    uCoastRect: { value: coastRect },
    uShore: { value: new THREE.Color(PAL.oceanShore) },
    uMid: { value: new THREE.Color(PAL.oceanMid) },
    uDeep: { value: new THREE.Color(PAL.oceanDeep) },
    uGold: { value: new THREE.Color(PAL.duskGold) },
    uSunH: { value: LIGHT2D.clone().multiplyScalar(-1) },  /* 光路指向航向前方（否则金光在镜头背后看不见） */
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), waterU),
    fog: false, transparent: false,
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      uniform float uTime;
      void main() {
        vec3 pos = position;
        pos.y += sin(pos.x * 0.14 + uTime * 0.9) * 0.085
               + cos(pos.z * 0.11 + uTime * 0.7) * 0.085
               + sin((pos.x + pos.z) * 0.23 + uTime * 1.3) * 0.04;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorld = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      varying vec3 vWorld;
      uniform float uTime;
      uniform sampler2D uCoast;
      uniform vec4 uCoastRect;
      uniform vec3 uShore;
      uniform vec3 uMid;
      uniform vec3 uDeep;
      uniform vec3 uGold;
      uniform vec2 uSunH;
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                   mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        /* 到最近陆地的距离（烘焙自碰撞格，单位：世界单位） */
        vec2 cuvRaw = vec2((vWorld.x - uCoastRect.x) / uCoastRect.z, (vWorld.z - uCoastRect.y) / uCoastRect.w);
        float inside = step(0.0, cuvRaw.x) * step(cuvRaw.x, 1.0) * step(0.0, cuvRaw.y) * step(cuvRaw.y, 1.0);
        float dmin = mix(${FAR.toFixed(1)}, texture2D(uCoast, clamp(cuvRaw, 0.0, 1.0)).r * ${FAR.toFixed(1)}, inside);   /* 海图外一律深水 */
        vec3 col = mix(uShore, uMid, smoothstep(0.0, 6.5, dmin));
        col = mix(col, uDeep, smoothstep(6.5, 26.0, dmin));
        /* 大尺度海色起伏 + 近岸透亮浅色层（地中海的“看得到沙底”感） */
        col = mix(col, uMid, 0.09 * vnoise(vWorld.xz * 0.045 + vec2(3.1, 7.7)));
        col = mix(col, vec3(0.55, 0.85, 0.88), (1.0 - smoothstep(0.0, 2.6, dmin)) * 0.22);
        /* 朝太阳方向的金色光路（P1 同款） */
        float toSun = max(dot(normalize(vWorld.xz), normalize(uSunH)), 0.0);
        col += uGold * (pow(toSun, 6.0) * 0.24 + pow(toSun, 16.0) * 0.10) * smoothstep(2.0, 14.0, dmin);
        /* 贴岸碎沫（加宽加清） + 细碎波光（提频去白块感） */
        float band = smoothstep(-0.12, 0.06, dmin) * (1.0 - smoothstep(0.10, 0.75, dmin));
        float foam = band * (0.3 + 0.7 * vnoise(vWorld.xz * 1.4 + vec2(uTime * 0.22, -uTime * 0.16)));
        col = mix(col, vec3(0.94, 0.97, 1.0), foam * 0.85);
        float sparkle = vnoise(vWorld.xz * 1.6 + vec2(uTime * 0.1, -uTime * 0.08));
        col += vec3(0.05, 0.05, 0.045) * smoothstep(0.78, 0.96, sparkle) * 0.7;
        float alpha = 1.0;   /* 不透明海面：岛体方形裙边不再透出（根治黑方块伪影） */
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

/* ---------- 天穹（P1 移植：地平线取雾色本尊，天水交界缝消失） ---------- */
function buildSky() {
  const uniforms = {
    uHorizon: { value: new THREE.Color(PAL.oceanMid) },
    uZenith: { value: new THREE.Color(0x4a9fd8) },
    uSunColor: { value: new THREE.Color(PAL.duskGold) },
    uSunDir: { value: SUN_DIRECTION.clone().normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.4, d.y));
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sunDot, 40.0) * 0.85 + pow(sunDot, 6.0) * 0.2);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
}

/* ---------- 高积云（低模白朵，给天际添呼吸感） ---------- */
function buildClouds() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  const rand = mulberry32(777);
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.3 + rand() * 1.7, 10, 7), mat);
    c.scale.set(1.7, 0.4, 1.0);
    c.position.set((rand() * 2 - 1) * 42, 6.5 + rand() * 4, (rand() * 2 - 1) * 17);
    g.add(c);
  }
  return g;
}

/* ---------- 帆船（程序化低模：船体+桅杆+帆，随航向平滑转头，随浪起伏） ---------- */
function buildBoat() {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.42, -0.75);
  hullShape.quadraticCurveTo(0.52, -0.55, 0.34, 0.1);
  hullShape.quadraticCurveTo(0.18, 0.85, 0.0, 0.95);
  hullShape.quadraticCurveTo(-0.18, 0.85, -0.34, 0.1);
  hullShape.quadraticCurveTo(-0.52, -0.55, -0.42, -0.75);
  const hull = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hullShape, { depth: 0.26, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9, flatShading: true })
  );
  hull.rotation.x = -Math.PI / 2;
  hull.position.y = 0.13;
  g.add(hull);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.05, 1.3),
    new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9, flatShading: true })
  );
  deck.position.y = 0.28;
  g.add(deck);
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 1.15, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 })
  );
  mast.position.set(0, 0.82, 0.1);
  g.add(mast);
  /* 横桁帆：始终正对南方相机，任何航向都看得见帆（背桅帆侧对镜头会消失） */
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.55, 0.30, 0.06,  0.55, 0.30, 0.06,  0.0, 1.38, 0.06,
  ], 3));
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshBasicMaterial({ color: 0xf5eeda, side: THREE.DoubleSide }));  /* 无光照恒亮：背光面不发暗 */
  g.add(sail);
  sailMesh = sail;
  return g;
}


/* ---------- 护航船队（17h 船队折损可视化：V 字跟航，随 state.fleet 折损增减；航向用运动方向，与模型朝向约定解耦） ---------- */
function buildEscortFleet() {
  const g = new THREE.Group();
  escortBoats = [];
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6d4a2b, roughness: 1, flatShading: true });
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xe8e0cc, side: THREE.DoubleSide });
  for (let i = 0; i < 11; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 1.3), hullMat);
    hull.position.y = 0.12; b.add(hull);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.34, 0.24, 0.04,  0.34, 0.24, 0.04,  0.0, 0.98, 0.04,
    ], 3));
    sailGeo.computeVertexNormals();
    b.add(new THREE.Mesh(sailGeo, sailMat));
    b.visible = false; g.add(b); escortBoats.push(b);
  }
  g.visible = false;
  return g;
}

/* ---------- 漂流物（Steam 化玩法批：漂流瓶/木箱 3D 浮标，位置与类型随主脚本 drifts 数组同步） ---------- */
function buildDrifts() {
  const g = new THREE.Group();
  driftSlots = [];
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fae8f, roughness: 0.35, flatShading: true });
  const paperMat = new THREE.MeshBasicMaterial({ color: 0xfff6d6 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.95, flatShading: true });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const slot = new THREE.Group();
    /* 漂流瓶：瓶身 + 颈 + 软木塞 + 内卷纸 */
    const bottle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.3, 8), glassMat);
    body.position.y = 0.15; bottle.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8), glassMat);
    neck.position.y = 0.34; bottle.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), bandMat);
    cork.position.y = 0.41; bottle.add(cork);
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), paperMat);
    note.position.y = 0.16; bottle.add(note);
    /* 木箱：箱体 + 两条加固带 */
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), woodMat);
    box.position.y = 0.15; crate.add(box);
    const bandA = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.32), bandMat);
    bandA.position.y = 0.15; crate.add(bandA);
    const bandB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.32), bandMat);
    bandB.position.y = 0.15; crate.add(bandB);
    slot.add(bottle); slot.add(crate);
    slot.visible = false; g.add(slot);
    driftSlots.push({ g: slot, bottle, crate });
  }
  return g;
}

/* ---------- P2.3 石化送客船：白石柱（17g 原著第 13 卷末；主脚本置 state.stonePillarDone 后显现） ---------- */
let pillarG = null;
function buildStonePillar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 7.5, 7),
    new THREE.MeshStandardMaterial({ color: 0xcfd6da, roughness: .92, flatShading: true }));
  body.position.y = 2.6; g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xdde2e5, roughness: .9, flatShading: true }));
  cap.position.y = 6.6; cap.rotation.y = 0.3; g.add(cap);
  const foam = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.2, 6, 18),
    new THREE.MeshBasicMaterial({ color: 0xeef4f8, transparent: true, opacity: 0.5 }));
  foam.rotation.x = Math.PI / 2; foam.position.y = 0.1; g.add(foam);
  g.visible = false;
  return g;
}


/* ---------- 特洛伊 3D 战场（首个岛内 3D 样板：地面/城墙/巨木马/营火，2D 层只叠玩家与战斗实体） ---------- */
function buildTroy() {
  const g = new THREE.Group();
  /* 平原沙地 */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 22, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8a6a4f, roughness: 1, flatShading: true })
  );
  ground.rotation.x = -Math.PI / 2; g.add(ground);
  /* 三面城墙 + 门楼（东侧城门洞，西/北墙） */
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a8a70, roughness: 1, flatShading: true });
  const gate = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 0.7), wallMat); gate.position.set(0, 1.9, -9); g.add(gate);
  const gatePost = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.2, 0.7), wallMat); gatePost.position.set(-2.6, 2.1, -9); g.add(gatePost);
  const gatePost2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.2, 0.7), wallMat); gatePost2.position.set(2.6, 2.1, -9); g.add(gatePost2);
  for (const [sx, h] of [[-4, 2.4], [3, 2.4], [-5.4, 1.6], [5.4, 1.6]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 0.7), wallMat); w.position.set(sx, h / 2, -7); g.add(w);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 1.6, 0.5), wallMat); back.position.set(0, 0.8, 7); g.add(back);
  for (const [sx] of [[-7.4], [7.4]]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 12), wallMat); side.position.set(sx, 1.1, 0); g.add(side);
  }
  /* 营火 + 火把点（暖光粒子氛围，闪烁）；木马/卫兵/玩家由 2D 实体层承载（避免双木马） */
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
  for (const [fx, fz] of [[-4.2, 2.6], [4.4, -3.4]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), fireMat); f.position.set(fx, 0.3, fz); g.add(f);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), fireMat); t.position.set(Math.cos(a) * 6.2, 0.35, Math.sin(a) * 6.2); g.add(t);
  }
  const pl = new THREE.PointLight(0xff9a4a, 1.2, 20); pl.position.set(0, 5, 0); g.add(pl);
  return g;
}

/* ---------- 初始化 ---------- */
function init() {
  try {
    /* 性能：去掉 preserveDrawingBuffer（每帧强制拷贝，弱 GPU 掉帧元凶之一）；
       分享卡改用 W3D.grabFrame()（现渲现读，同帧内 toDataURL 不需保留缓冲）。
       DPR 上限从 1.75 降到 1.25：填充率降 50%+，画面差异在这个美术风格下几乎不可见。 */
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setSize(1000, 600);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  } catch (e) { failed = true; return; }

  scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(PAL.oceanMid);
  scene3.fog = new THREE.FogExp2(PAL.oceanMid, 0.0062);

  camera3 = new THREE.PerspectiveCamera(48, 1000 / 600, 0.1, 600);
  camera3.position.set(0, 20, 26);

  const hemi = new THREE.HemisphereLight(PAL.oceanShore, PAL.cliffLight, 0.65);
  scene3.add(hemi);
  const sun = new THREE.DirectionalLight(
    new THREE.Color(PAL.duskGold).lerp(new THREE.Color(0xffffff), 0.4), 1.35
  );
  sun.position.copy(SUN_DIRECTION).multiplyScalar(90);
  scene3.add(sun);

  skyGroup = buildSky(); scene3.add(skyGroup);
  worldGroup = new THREE.Group();
  worldGroup.add(buildIslands());   /* 先建岛：水 shader 的 uIsle 岸线数组依赖 isleList */
  scene3.add(worldGroup);
  waterMesh = buildWater(); scene3.add(waterMesh);
  cloudGroup = buildClouds(); scene3.add(cloudGroup);
  boatG = buildBoat();
  boatG.scale.setScalar(1.8);
  scene3.add(boatG);
  escortG = buildEscortFleet();
  scene3.add(escortG);
  driftG = buildDrifts();
  scene3.add(driftG);
  troyGroup = buildTroy(); troyGroup.visible = false; scene3.add(troyGroup);

  const cv = renderer.domElement;
  cv.id = "cv3d";
  /* 跟 #cv 同款铺满响应式舞台：固定 1000×600 会在大窗口露出底下 2D 画布（两个空间堆叠 bug） */
  cv.style.cssText = "position:absolute; inset:0; width:100%; height:100%; border-radius:14px;";
  const stage = document.getElementById("stage");
  const cv2 = document.getElementById("cv");
  stage.insertBefore(cv, cv2);   /* 垫在 2D 画布下面：日光/夜色/浮字仍由 2D 层合成 */

  /* 渲染分辨率跟随舞台实际尺寸（含窗口缩放），CSS 尺寸交给样式表 */
  function fit() {
    const w = Math.max(320, stage.clientWidth), h = Math.max(200, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera3.aspect = w / h;
    camera3.updateProjectionMatrix();
  }
  fitFn = fit;
  fit();
  window.addEventListener("resize", fit);

  ready = true;
}

/* ---------- 每帧 ---------- */
let lastFrameT = -1;
function frame(et) {
  if (!ready) return;
  /* 帧率无关的 dt（与主循环同源，防止高刷屏下转向过快/低帧下拖尾） */
  const fdt = lastFrameT < 0 ? 0.016 : Math.min(Math.max(et - lastFrameT, 0.001), 0.12);
  lastFrameT = et;
  /* 经典脚本顶层 let/const 模块读不到（实测 ReferenceError），统一走主脚本挂载的 __game 接口 */
  const G = window.__game;
  const sc = (G && G.getScene) ? G.getScene() : "world";
  if (sc === "troy") return frameTroy(et);
  /* 恢复世界图可见（特洛伊→世界 切换用） */
  if (troyGroup && !troyGroup.visible){ worldGroup.visible=true; waterMesh.visible=true; boatG.visible=true; cloudGroup.visible=true; if (driftG) driftG.visible=true; troyGroup.visible=false; }
  const b = (G && G.boat) || { x: 460, y: 180, face: "up" };
  const bx = px2x(b.x), bz = px2z(b.y);
  const bob = Math.sin(et * 2.1) * 0.05 + Math.cos(et * 1.4) * 0.03;
  boatG.position.set(bx, bob, bz);
  /* 航向：face(up/down/left/right) → 目标 yaw，平滑转向 */
  const yawT = b.face === "right" ? Math.PI / 2 : b.face === "down" ? Math.PI : b.face === "left" ? -Math.PI / 2 : 0;
  let dy = yawT - yawCur;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  yawCur += dy * Math.min(1, fdt * 8);   /* 帧率无关转向（原来 0.12/帧，60fps 时约合 0.12，弱机低帧下不再拖） */
  boatG.rotation.y = yawCur;
  boatG.rotation.z = Math.sin(et * 1.7) * 0.03;
  waterU.uTime.value = et;
  /* 相机跟随：帧率无关指数缓动（低帧下也不拖泥带水） */
  const dt = lastEt < 0 ? 0.016 : Math.min(Math.max(et - lastEt, 0.001), 0.12); lastEt = et;
  /* 护航船队：航向取运动方向（指数平滑），V 字编队挂在主船尾迹上；折损后队列缩短 */
  if (escPrev) {
    const dxh = bx - escPrev.x, dzh = bz - escPrev.z, dl = Math.hypot(dxh, dzh);
    if (dl > 0.02) {
      const k = 1 - Math.exp(-3 * dt);
      escHead.x += (dxh / dl - escHead.x) * k; escHead.z += (dzh / dl - escHead.z) * k;
      const hl = Math.hypot(escHead.x, escHead.z) || 1; escHead.x /= hl; escHead.z /= hl;
    }
  }
  escPrev = { x: bx, z: bz };
  if (escortG) {
    const fl = Math.max(0, Math.min(12, (G && G.state && G.state.fleet) || 0));
    const n = Math.max(0, fl - 1);
    escortG.visible = n > 0;
    const pxh = -escHead.z, pzh = escHead.x;   /* 航向左手垂直向 */
    for (let i = 0; i < escortBoats.length; i++) {
      const eb = escortBoats[i];
      if (i >= n) { eb.visible = false; continue; }
      eb.visible = true;
      const back = 2.2 + i * 1.35, side = (i % 2 ? 1 : -1) * (0.9 + Math.floor(i / 2) * 0.8);
      eb.position.set(bx - escHead.x * back + pxh * side,
                      Math.sin(et * 2.1 + i * 1.7) * 0.05,
                      bz - escHead.z * back + pzh * side);
      eb.rotation.y = Math.atan2(-escHead.x, -escHead.z);
      eb.rotation.z = Math.sin(et * 1.7 + i) * 0.03;
    }
  }
  /* P2.3 石柱：主脚本置 state.stonePillarDone 后显现（斯克里东南海面，SCHERIA_EXIT 经 __game 挂载） */
  if (!pillarG){ pillarG = buildStonePillar(); scene3.add(pillarG); }
  pillarG.visible = !!(G && G.state && G.state.stonePillarDone);
  if (pillarG.visible && G.scheriaExit){
    pillarG.position.set(px2x(G.scheriaExit.x + 92), 0, px2z(G.scheriaExit.y + 58));
  }
  /* 漂流物：随主脚本 drifts 数组同步（瓶/箱形态切换 + 浮沉摇摆；最多 4 个） */
  if (driftG) {
    const ds = (G && G.drifts && G.drifts()) || [];
    for (let i = 0; i < driftSlots.length; i++) {
      const s = driftSlots[i], d = ds[i];
      if (!d) { s.g.visible = false; continue; }
      s.g.visible = true;
      s.bottle.visible = d.kind === "bottle";
      s.crate.visible = d.kind !== "bottle";
      s.g.position.set(px2x(d.x), Math.sin(et * 2.2 + d.x) * 0.06 - 0.02, px2z(d.y));
      s.g.rotation.y = Math.sin(et * 1.3 + d.x) * 0.4;
      s.g.rotation.z = Math.sin(et * 1.6 + d.y) * 0.12;
    }
  }
  const camTarget = new THREE.Vector3(bx, 14, bz + 17);
  camera3.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
  camera3.lookAt(bx, 0.8, bz - 2.5);
  renderer.render(scene3, camera3);
}

/* 特洛伊 3D 战场渲染（固定相机俯视 + 火光闪烁；木马/卫兵/玩家由 2D 层叠加） */
let troyCamInit = false;
function frameTroy(et) {
  if (troyGroup) { worldGroup.visible = false; waterMesh.visible = false; boatG.visible = false; cloudGroup.visible = false; if (escortG) escortG.visible = false; if (driftG) driftG.visible = false; troyGroup.visible = true; }
  const flick = 0.85 + 0.3 * Math.sin(et * 3.1) * Math.sin(et * 2.3);
  if (!troyCamInit) { camera3.position.set(0, 8.5, 13); troyCamInit = true; }
  camera3.lookAt(0, 1.2, 0);
  const amb = 0.55 + 0.18 * Math.sin(et * 1.7);
  renderer.render(scene3, camera3);
}

init();

window.W3D = { get ready() { return ready; }, get failed() { return failed; }, frame,
  canvas: renderer.domElement,   /* 航迹分享卡读帧用；读帧请优先用 grabFrame() */
  /** 现渲现读一帧（preserveDrawingBuffer 已关，必须同帧内 render→toDataURL） */
  grabFrame: () => {
    if (!ready || !renderer) return null;
    try { renderer.render(scene3, camera3); return renderer.domElement.toDataURL("image/png"); }
    catch (e) { return null; }
  },
  /** 动态调渲染分辨率倍率（自适应画质用：1.25 → 1 → 0.85） */
  setDPR: (r) => {
    if (!ready || !renderer) return;
    renderer.setPixelRatio(Math.max(0.75, Math.min(2, +r || 1)));
    if (fitFn) fitFn();
  },
  debug: () => ({ boat: boatG ? boatG.position.toArray().map(v => Math.round(v * 10) / 10) : null,
                  cam: camera3 ? camera3.position.toArray().map(v => Math.round(v * 10) / 10) : null,
                  isles: isleList.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) };
