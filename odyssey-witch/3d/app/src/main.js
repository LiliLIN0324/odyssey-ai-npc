// 入口:渲染器 + 相机 + 主循环;世界装配全部交给 world.js(P1 起)。
// 本文件保持只管"装配与循环",不放任何世界内容。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world.js';
import { initUI } from './ui.js';

const { showHUD } = initUI();

// --- 渲染器 ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- 场景(背景与雾由 buildWorld 设置) ---
const scene = new THREE.Scene();

// --- 相机与轨道控制(P4 将替换为第三人称跟随) ---
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1200);
// 初始机位放在受光面(太阳在 -x/+z 象限),逆光剪影留给叙事镜头
camera.position.set(-46, 30, 52);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.49; // 不许钻到海面以下

// --- 世界(P1:岛/海/天/光/草/火) ---
const world = buildWorld(scene);

// 调试/测试钩子(P7 性能终审与自动化截图用)
window.__AEAEA__ = { renderer, scene, camera, controls };

// --- 自适应 ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 主循环 + 调试 HUD(P7 性能终审看这里) ---
const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let acc = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  world.update(dt, elapsed);
  controls.update();
  renderer.render(scene, camera);

  frames += 1;
  acc += dt;
  if (acc >= 0.5) {
    const r = renderer.info.render;
    showHUD(`fps ${Math.round(frames / acc)} | tris ${(r.triangles / 1000).toFixed(1)}k | calls ${r.calls}`);
    frames = 0;
    acc = 0;
  }
});
