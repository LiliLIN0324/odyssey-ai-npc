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
};
const LOCKED_LOOK = { r: 1.3, grass: 0x93a3ad, grassDeep: 0x6d7d88, seed: 20261112, mist: true };

let renderer, scene3, camera3, waterU, boatG, sailMesh, isleList = [];
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

/* ---------- 岛屿装配（读全局 ISLANDS——经典脚本顶层 const，模块可读） ---------- */
function buildIslands() {
  const group = new THREE.Group();
  for (const is of ISLANDS) {
    const look = is.scene ? (ISLE_LOOK[is.scene] || LOCKED_LOOK) : { ...LOCKED_LOOK, r: 1.3, seed: 20261112 + is.gx };
    const x3 = px2x(is.gx * 20 + 10), z3 = px2z(is.gy * 20 + 10);
    const mesh = buildIsle(look);
    mesh.position.set(x3, look.floatY || 0, z3);
    group.add(mesh);
    isleList.push({ x: x3, z: z3, r: look.r, mesh });
    if (look.floatY) {
      /* 风神岛：云海托盘（浮岛悬在云上） */
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(look.r * 1.9, 24, 12),
        new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 1, transparent: true, opacity: 0.88, flatShading: true })
      );
      cloud.scale.set(1.25, 0.32, 1.25);
      cloud.position.set(x3, look.floatY - 1.5, z3);
      group.add(cloud);
    }
    if (look.spires) {
      /* 海峡：斯库拉崖与漩涡的方向感——两根黑岩尖 */
      const spireMat = new THREE.MeshStandardMaterial({ color: 0x39434b, flatShading: true, roughness: 1 });
      for (const [dx, dz, h, w] of [[1.1, -0.6, 2.6, 0.42], [-1.4, 0.8, 1.9, 0.34]]) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), spireMat);
        sp.position.set(x3 + dx, h / 2 - 0.2, z3 + dz);
        group.add(sp);
      }
    }
    if (look.mist) {
      /* 待开放远岛：一圈雾感环（低透明白盘） */
      const mist = new THREE.Mesh(
        new THREE.RingGeometry(look.r * 1.15, look.r * 2.1, 24),
        new THREE.MeshBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
      );
      mist.rotation.x = -Math.PI / 2;
      mist.position.set(x3, 0.06, z3);
      group.add(mist);
    }
  }
  return group;
}

/* ---------- 海面（P1 shader 移植：三档色按"到最近岸线距离"，金色光路保留） ---------- */
function buildWater() {
  const geo = new THREE.PlaneGeometry(220, 170, 72, 60);
  geo.rotateX(-Math.PI / 2);
  const isleU = isleList.map(i => new THREE.Vector3(i.x, i.z, i.r));
  waterU = {
    uTime: { value: 0 },
    uIsle: { value: isleU },
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
      uniform vec3 uIsle[${isleU.length}];
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
        /* 到最近岛"岸线"的距离（负值=岛内水域，被岛体遮住） */
        float dmin = 1e9;
        for (int i = 0; i < ${isleU.length}; i++) {
          float d = length(vWorld.xz - uIsle[i].xy) - uIsle[i].z;
          dmin = min(dmin, d);
        }
        vec3 col = mix(uShore, uMid, smoothstep(0.0, 5.0, dmin));
        col = mix(col, uDeep, smoothstep(5.0, 22.0, dmin));
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

/* ---------- 初始化 ---------- */
function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1000, 600);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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

  scene3.add(buildSky());
  scene3.add(buildIslands());   /* 先建岛：水 shader 的 uIsle 岸线数组依赖 isleList */
  scene3.add(buildWater());
  scene3.add(buildClouds());
  boatG = buildBoat();
  boatG.scale.setScalar(1.8);
  scene3.add(boatG);

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
  fit();
  window.addEventListener("resize", fit);

  ready = true;
}

/* ---------- 每帧 ---------- */
function frame(et) {
  if (!ready) return;
  const bx = px2x(boat.x), bz = px2z(boat.y);
  const bob = Math.sin(et * 2.1) * 0.05 + Math.cos(et * 1.4) * 0.03;
  boatG.position.set(bx, bob, bz);
  /* 航向：face(up/down/left/right) → 目标 yaw，平滑转向 */
  const yawT = boat.face === "right" ? Math.PI / 2 : boat.face === "down" ? Math.PI : boat.face === "left" ? -Math.PI / 2 : 0;
  let dy = yawT - yawCur;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  yawCur += dy * 0.12;
  boatG.rotation.y = yawCur;
  boatG.rotation.z = Math.sin(et * 1.7) * 0.03;
  waterU.uTime.value = et;
  /* 相机跟随：帧率无关指数缓动（低帧下也不拖泥带水） */
  const dt = lastEt < 0 ? 0.016 : Math.min(Math.max(et - lastEt, 0.001), 0.12); lastEt = et;
  const camTarget = new THREE.Vector3(bx, 14, bz + 17);
  camera3.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
  camera3.lookAt(bx, 0.8, bz - 2.5);
  renderer.render(scene3, camera3);
}

init();

window.W3D = { get ready() { return ready; }, get failed() { return failed; }, frame,
  debug: () => ({ boat: boatG ? boatG.position.toArray().map(v => Math.round(v * 10) / 10) : null,
                  cam: camera3 ? camera3.position.toArray().map(v => Math.round(v * 10) / 10) : null,
                  isles: isleList.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) };
