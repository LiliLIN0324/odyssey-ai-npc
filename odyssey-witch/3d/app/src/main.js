// 入口:渲染器 + 相机 + 主循环;世界装配全部交给 world.js(P1 起),角色与控制交给 character.js(P4)。
// 本文件保持只管"装配与循环",不放任何世界内容。
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCharacterController } from './character.js';
import { createProps } from './props.js';
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

// --- 相机(P4 起由 character.js 第三人称跟随接管机位) ---
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1200);
// 初始机位放在受光面(太阳在 -x/+z 象限),逆光剪影留给叙事镜头
camera.position.set(-46, 30, 52);

// --- 世界(P1:岛/海/天/光/草/火) ---
const world = buildWorld(scene);

// --- Tripo 资产接入(P3 预留：依赖 public/assets/props.json；glb 缺失时静默跳过) ---
const props = createProps(scene);

// --- 角色与控制(P4:WASD/手柄移动 + 拖拽相机 + 滚轮缩放) ---
const character = createCharacterController(scene, camera, renderer.domElement);

// 调试/测试钩子(P7 性能终审与自动化截图用)
window.__AEAEA__ = { renderer, scene, camera, character, props };

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
  character.update(dt);
  renderer.render(scene, camera);

  frames += 1;
  acc += dt;
  if (acc >= 0.5) {
    const r = renderer.info.render;
    const s = character.state;
    showHUD(`fps ${Math.round(frames / acc)} | tris ${(r.triangles / 1000).toFixed(1)}k | calls ${r.calls}\nx ${s.x.toFixed(1)} z ${s.z.toFixed(1)} | WASD 移动 · Shift 奔跑 · 拖拽旋转`);
    frames = 0;
    acc = 0;
  }
});
