// P1 程序化世界:岛体 / 海面 / 天穹 / 光照 / 草卡 / 火堆(HANDOFF §4 P1)。
// 全部几何由种子噪声生成;色板唯一来源 palette.js;光照统一左上(SUN_DIRECTION)。
// 注意:ISLAND_SEED 即 HANDOFF 说的"种子号",P3 定稿后冻结,勿随手改。
import * as THREE from 'three';
import { PALETTE, SUN_DIRECTION } from './palette.js';
import { fbm, mulberry32 } from './noise.js';

export const ISLAND_SEED = 20261107;
export const ISLAND_RADIUS = 60; // 米,岸线半径;地形网格比它大一圈(水下裙边)

const SIZE = 170; // 地形网格边长
const SEG = 120;  // 地形网格分段(28.8k tris)
const GRASS_COUNT = 1500;
const WATER_SEG = 64;

// 坩埚火堆占位点(P3 按参考表定稿布局时调整)
const FIRE_POS = new THREE.Vector3(12, 0, 8);

// 崖面坡度阈值(有限差分梯度):0.55 起坡,0.95 全崖
const CLIFF_START = 0.55;
const CLIFF_FULL = 0.95;

const sstep = (x, min, max) => THREE.MathUtils.smoothstep(x, min, max);
const LIGHT2D = new THREE.Vector2(SUN_DIRECTION.x, SUN_DIRECTION.z).normalize();

const C = {
  sand: new THREE.Color(PALETTE.cliffLight),
  cliffLight: new THREE.Color(PALETTE.cliffLight),
  cliffDark: new THREE.Color(PALETTE.cliffDark),
  grassMain: new THREE.Color(PALETTE.grassMain),
  grassDeep: new THREE.Color(PALETTE.grassDeep),
  oceanMid: new THREE.Color(PALETTE.oceanMid),
};

// ---------- 高程场 ----------
// 径向剖面:高地(0~0.55R) -> 缓坡(0.55~0.9R) -> 沙滩(0.9~1.0R) -> 水下裙边(>1.0R)。
// P4 角色贴地复用此函数,签名不要动。
export function islandHeight(x, z, seed = ISLAND_SEED) {
  const r = Math.hypot(x, z);
  const n = r / ISLAND_RADIUS;
  const detail = fbm(x * 0.045, z * 0.045, seed, 4);              // 大起伏
  const fine = fbm(x * 0.12 + 7.3, z * 0.12 - 4.1, seed + 999, 3); // 细碎

  if (n < 0.55) {
    const dome = Math.pow(1 - n / 0.55, 1.5); // 中心略隆起
    return 4.6 + detail * 3.0 + dome * 1.6 + fine * 0.6;
  }
  if (n < 0.9) {
    const t = sstep((n - 0.55) / 0.35, 0, 1);
    return THREE.MathUtils.lerp(4.6 + detail * 3.0, 0.5, t) + (detail * 1.2 + fine * 0.4) * (1 - t);
  }
  if (n < 1.0) {
    const t = sstep((n - 0.9) / 0.1, 0, 1);
    return THREE.MathUtils.lerp(0.5, -0.7, t); // 沙滩入水
  }
  const t = sstep(Math.min((n - 1.0) / 0.3, 1), 0, 1);
  return THREE.MathUtils.lerp(-0.7, -3.2, t);  // 裙边藏住水线相交
}

// ---------- 顶点色 ----------
const _c = new THREE.Color();
const _cliff = new THREE.Color();

function vertexColor(x, z, h, gx, gz, out) {
  const detail = fbm(x * 0.11 + 3.7, z * 0.11 - 2.9, ISLAND_SEED + 77, 3);
  // 草地:两档绿按细节噪声混合,破"纯色块"感
  out.copy(C.grassMain).lerp(C.grassDeep, THREE.MathUtils.clamp(detail * 1.4 - 0.2, 0, 1));
  // 低处渐变为沙滩
  out.lerp(C.sand, 1 - sstep(h, 0.35, 1.7));
  // 水下沉入海色
  if (h < 0) out.lerp(C.oceanMid, Math.min(-h / 2.4, 0.85));
  // 陡坡覆盖崖面色:坡面朝光用阳面色,背光用暗面色
  const g = Math.hypot(gx, gz);
  if (g > 1e-4 && h > 0.25) {
    const t = sstep(g, CLIFF_START, CLIFF_FULL);
    if (t > 0) {
      const lit = ((-gx * LIGHT2D.x - gz * LIGHT2D.y) / g) * 0.5 + 0.5;
      _cliff.copy(C.cliffLight).lerp(C.cliffDark, THREE.MathUtils.clamp(lit, 0, 1));
      out.lerp(_cliff, t);
    }
  }
  return out;
}

function buildIsland() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const eps = 0.8;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = islandHeight(x, z);
    pos.setY(i, h);
    const gx = (islandHeight(x + eps, z) - islandHeight(x - eps, z)) / (2 * eps);
    const gz = (islandHeight(x, z + eps) - islandHeight(x, z - eps)) / (2 * eps);
    vertexColor(x, z, h, gx, gz, _c);
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // flatShading 是低多边形史诗感的关键开关(HANDOFF P1 任务 2)
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- 海面 ----------
function buildWater() {
  const geo = new THREE.PlaneGeometry(600, 600, WATER_SEG, WATER_SEG);
  geo.rotateX(-Math.PI / 2);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uRadius: { value: ISLAND_RADIUS },
      uShore: { value: new THREE.Color(PALETTE.oceanShore) },
      uMid: { value: new THREE.Color(PALETTE.oceanMid) },
      uDeep: { value: new THREE.Color(PALETTE.oceanDeep) },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true, // 让海面接入场景雾,远海融进天际
    transparent: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      uniform float uTime;
      void main() {
        vec3 pos = position;
        pos.y += sin(pos.x * 0.08 + uTime * 0.9) * 0.09
               + cos(pos.z * 0.065 + uTime * 0.7) * 0.09;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorld = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec3 vWorld;
      uniform float uTime;
      uniform float uRadius;
      uniform vec3 uShore;
      uniform vec3 uMid;
      uniform vec3 uDeep;

      float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y);
      }

      void main() {
        float d = length(vWorld.xz);
        // 近岸浅 -> 中海 -> 外海深("近岸浅→外海深"沿用 2D 版规则)
        vec3 col = mix(uShore, uMid, smoothstep(uRadius * 0.7, uRadius * 1.15, d));
        col = mix(col, uDeep, smoothstep(uRadius * 1.35, uRadius * 2.8, d));
        // 贴岸一圈碎沫
        float band = smoothstep(uRadius * 0.86, uRadius * 0.93, d)
                   * (1.0 - smoothstep(uRadius * 0.96, uRadius * 1.05, d));
        float foam = band * (0.3 + 0.7 * vnoise(vWorld.xz * 0.9 + vec2(uTime * 0.22, -uTime * 0.16)));
        col = mix(col, vec3(0.94, 0.97, 1.0), foam * 0.7);
        // 细碎波光
        float sparkle = vnoise(vWorld.xz * 0.35 + vec2(uTime * 0.1, -uTime * 0.08));
        col += vec3(0.05, 0.05, 0.045) * smoothstep(0.7, 0.95, sparkle);
        // 近岸略透
        float alpha = mix(0.8, 0.94, smoothstep(uRadius * 0.75, uRadius * 1.05, d));
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}

// ---------- 天穹 ----------
function buildSky() {
  const uniforms = {
    uHorizon: { value: new THREE.Color(PALETTE.duskGold).lerp(new THREE.Color(0xffffff), 0.15) },
    uZenith: { value: new THREE.Color(PALETTE.oceanMid).lerp(new THREE.Color(PALETTE.nightBase), 0.35) },
    uSunColor: { value: new THREE.Color(PALETTE.duskGold) },
    uSunDir: { value: SUN_DIRECTION.clone().normalize() },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false, // 天穹不吃雾,否则渐变会被雾色吃掉
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.55, d.y));
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        // 太阳方向暖光加权:一圈窄光晕 + 大范围暖色过渡
        col += uSunColor * (pow(sunDot, 30.0) * 0.5 + pow(sunDot, 5.0) * 0.16);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
}

// ---------- 草卡 ----------
function buildGrass() {
  // 交叉双三角:两个正交四边形,底部为轴
  const w = 0.55;
  const h = 0.75;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const quads = [
    [[-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, h, 0], [-w / 2, h, 0]],
    [[0, 0, -w / 2], [0, 0, w / 2], [0, h, w / 2], [0, h, -w / 2]],
  ];
  quads.forEach((q, qi) => {
    const base = qi * 4;
    for (const p of q) positions.push(...p);
    for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, GRASS_COUNT);

  const rand = mulberry32(ISLAND_SEED ^ 0x9e3779b9);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  let placed = 0;
  let guard = 0;

  while (placed < GRASS_COUNT && guard++ < GRASS_COUNT * 40) {
    const r = Math.sqrt(rand()) * ISLAND_RADIUS * 0.92;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (fbm(x * 0.08, z * 0.08, ISLAND_SEED + 55, 3) < 0.46) continue; // 掩码:一簇一簇
    const y = islandHeight(x, z);
    if (y < 0.5 || y > 5.6) continue;                                  // 只长草地带
    const gx = islandHeight(x + 0.5, z) - islandHeight(x - 0.5, z);
    const gz = islandHeight(x, z + 0.5) - islandHeight(x, z - 0.5);
    if (Math.hypot(gx, gz) > 0.55) continue;                           // 陡坡不长
    dummy.position.set(x, y, z);
    dummy.rotation.y = rand() * Math.PI;
    const s = 0.7 + rand() * 0.8;
    dummy.scale.set(s, s * (0.85 + rand() * 0.4), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    c.copy(C.grassMain).lerp(C.grassDeep, rand());
    mesh.setColorAt(placed, c);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // 实例散布全岛,包围球按基几何算会误剔除
  return mesh;
}

// ---------- 火堆 ----------
function buildFire() {
  const COUNT = 60;
  const rand = mulberry32(ISLAND_SEED ^ 0x51f3ea1d);
  const seeds = [];
  for (let i = 0; i < COUNT; i++) {
    seeds.push({ off: rand(), speed: 0.35 + rand() * 0.4, sway: rand() * Math.PI * 2 });
  }
  const positions = new Float32Array(COUNT * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: PALETTE.fireOrange,
    size: 0.42,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  const base = FIRE_POS.clone();
  base.y = islandHeight(FIRE_POS.x, FIRE_POS.z) + 0.05;
  points.position.copy(base);
  points.renderOrder = 2;
  points.frustumCulled = false;

  const light = new THREE.PointLight(PALETTE.fireOrange, 1.4, 14, 2);
  light.position.copy(base).add(new THREE.Vector3(0, 0.8, 0));

  return { points, light, seeds, positions, count: COUNT };
}

function updateFire(fire, elapsed) {
  const { seeds, positions, count } = fire;
  for (let i = 0; i < count; i++) {
    const s = seeds[i];
    const t = (elapsed * s.speed + s.off) % 1;
    const sway = 0.14 * (1 - t); // 越高摆幅越小
    positions[i * 3] = Math.sin(elapsed * 2.2 + s.sway) * sway;
    positions[i * 3 + 1] = t * 1.7;
    positions[i * 3 + 2] = Math.cos(elapsed * 1.9 + s.sway * 1.3) * sway;
  }
  fire.points.geometry.attributes.position.needsUpdate = true;
  // 火光闪烁:双正弦叠加,不需要噪声函数
  fire.light.intensity = 1.2 + (Math.sin(elapsed * 11) + Math.sin(elapsed * 23 + 1.7)) * 0.22;
}

// ---------- 装配 ----------
export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.oceanMid);
  scene.fog = new THREE.FogExp2(PALETTE.oceanMid, 0.008);

  const hemi = new THREE.HemisphereLight(PALETTE.oceanShore, PALETTE.cliffLight, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.duskGold, 1.25);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 250;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.5;
  scene.add(sun);

  scene.add(buildIsland());

  const water = buildWater();
  scene.add(water.mesh);

  scene.add(buildSky());
  scene.add(buildGrass());

  const fire = buildFire();
  scene.add(fire.points);
  scene.add(fire.light);

  return {
    update(_dt, elapsed) {
      water.uniforms.uTime.value = elapsed;
      updateFire(fire, elapsed);
    },
  };
}
