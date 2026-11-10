// P4 角色与控制：低多边形船长 + 第三人称跟随相机（键鼠 / 手柄）。
// 约束：零新依赖；贴地用 world.islandHeight；活动范围封顶在岛半径内（不下海）。
// 输入语义：WASD/方向键移动（相机相对）· Shift 奔跑 · 拖拽旋转相机 · 滚轮缩放 ·
// 手柄：左摇杆移动 / 右摇杆转相机 / RT 奔跑。
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { islandHeight, ISLAND_RADIUS } from './world.js';

const SPAWN = { x: 9, z: 5 };          // 火堆(12,8)旁的空地
const WALK_SPEED = 5.5;                // m/s
const RUN_SPEED = 9.5;
const TURN_RATE = 12;                  // 朝向平滑
const CAM_DIST_MIN = 7, CAM_DIST_MAX = 46;

export function createCharacterController(scene, camera, dom) {
  /* ---------- 模型（低多边形，与全项目 flatShading 风格一致） ---------- */
  const root = new THREE.Group();
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...opts });
  const tunicMat = mat(PALETTE.heroTunic);
  const cloakMat = new THREE.MeshStandardMaterial({ color: PALETTE.oceanDeep, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const skinMat = mat(PALETTE.heroSkin);
  const hairMat = mat(PALETTE.heroHair);
  const bootMat = mat(PALETTE.cliffDark);

  // 腿（两条盒子，走路摆动）
  const legGeo = new THREE.BoxGeometry(0.17, 0.62, 0.2);
  const legL = new THREE.Mesh(legGeo, bootMat); legL.position.set(-0.12, 0.31, 0);
  const legR = new THREE.Mesh(legGeo, bootMat); legR.position.set(0.12, 0.31, 0);
  root.add(legL, legR);

  // 束腰短衣（锥台）
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.44, 0.72, 8), tunicMat);
  tunic.position.y = 0.98;
  root.add(tunic);

  // 腰带
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8), mat(PALETTE.cliffDark));
  belt.position.y = 0.72;
  root.add(belt);

  // 肩+头
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), tunicMat);
  shoulders.position.y = 1.32; shoulders.scale.set(1.15, 0.55, 0.9);
  root.add(shoulders);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 6), skinMat);
  neck.position.y = 1.42;
  root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.66;
  root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.275, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.set(0, 1.68, -0.02);
  root.add(hair);

  // 披风（背后斜垂，行走时摆动）
  const cloakGeo = new THREE.BufferGeometry();
  cloakGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.34, 1.42, -0.1,   0.34, 1.42, -0.1,   0.28, 0.55, -0.3,   -0.28, 0.55, -0.3,
  ], 3));
  cloakGeo.setIndex([0, 1, 2, 0, 2, 3]);
  cloakGeo.computeVertexNormals();
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  root.add(cloak);

  // 长枪（右手，叙事物件：船长的枪）
  const spear = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.9, 6), mat(PALETTE.heroHair));
  spear.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), mat(PALETTE.duskGold, { metalness: 0.35, roughness: 0.5 }));
  tip.position.y = 1.04;
  spear.add(tip);
  spear.position.set(0.42, 0.95, 0.05);
  spear.rotation.z = -0.12;
  root.add(spear);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(root);

  /* ---------- 状态 ---------- */
  const state = {
    x: SPAWN.x, z: SPAWN.z, y: 0,
    faceYaw: Math.PI,          // 初始面向火堆方向
    camYaw: Math.PI * 0.15,    // 相机在角色南侧偏东
    camPitch: 0.34,
    dist: 14,
    moving: false,
    running: false,
  };
  state.y = islandHeight(state.x, state.z);

  /* ---------- 输入 ---------- */
  const keys = new Set();
  const keyMap = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
  window.addEventListener('keydown', (e) => { const k = keyMap[e.key.toLowerCase()]; if (k) { keys.add(k); e.preventDefault(); } if (e.key === 'Shift') keys.add('shift'); });
  window.addEventListener('keyup', (e) => { const k = keyMap[e.key.toLowerCase()]; if (k) keys.delete(k); if (e.key === 'Shift') keys.delete('shift'); });
  window.addEventListener('blur', () => keys.clear());

  let dragging = false, lastX = 0, lastY = 0;
  dom.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointerup', (e) => { dragging = false; try { dom.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } });
  dom.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    state.camYaw -= (e.clientX - lastX) * 0.006;
    state.camPitch = Math.min(1.15, Math.max(0.12, state.camPitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  });
  dom.addEventListener('wheel', (e) => {
    state.dist = Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, state.dist + Math.sign(e.deltaY) * 2));
    e.preventDefault();
  }, { passive: false });

  /* ---------- 相机 ---------- */
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let camInit = false;

  /* ---------- 每帧 ---------- */
  const tmpFwd = new THREE.Vector3();
  let bobT = 0;

  function update(dt) {
    /* 手柄输入合并 */
    let ix = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    let iz = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    let run = keys.has('shift');
    let gpyaw = 0, gppitch = 0, gpmove = false;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { ix += ax; iz += ay; gpmove = true; }
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      if (Math.abs(rx) > 0.15) gpyaw = rx;
      if (Math.abs(ry) > 0.15) gppitch = ry;
      if (gp.buttons[7] && gp.buttons[7].value > 0.3) run = true;   // RT
    }
    if (gpyaw) state.camYaw -= gpyaw * 2.2 * dt;
    if (gppitch) state.camPitch = Math.min(1.15, Math.max(0.12, state.camPitch + gppitch * 1.4 * dt));

    /* 相机朝向 → 移动向量（相机相对） */
    tmpFwd.set(-Math.sin(state.camYaw), 0, -Math.cos(state.camYaw));
    const right = new THREE.Vector3(-tmpFwd.z, 0, tmpFwd.x);
    const mv = new THREE.Vector3().addScaledVector(tmpFwd, -iz).addScaledVector(right, ix);
    state.moving = mv.lengthSq() > 0.0004;
    state.running = run && state.moving;

    if (state.moving) {
      mv.normalize();
      const sp = (run ? RUN_SPEED : WALK_SPEED) * dt;
      state.x += mv.x * sp;
      state.z += mv.z * sp;
      /* 朝向平滑 */
      const want = Math.atan2(mv.x, mv.z);
      let dy = want - state.faceYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      state.faceYaw += dy * Math.min(1, TURN_RATE * dt);
    }
    /* 无条件封顶在岛内（离岸 8% 处，不下水）；任何来源的越界都拉回 */
    {
      const r = Math.hypot(state.x, state.z);
      const lim = ISLAND_RADIUS * 0.92;
      if (r > lim) { state.x *= lim / r; state.z *= lim / r; }
    }
    state.y = islandHeight(state.x, state.z);

    /* 角色姿态：位置/朝向/走路摆动 */
    root.position.set(state.x, state.y, state.z);
    root.rotation.y = state.faceYaw;
    if (state.moving) {
      bobT += dt * (run ? 13 : 9);
      const sw = Math.sin(bobT) * (run ? 0.62 : 0.4);
      legL.rotation.x = sw; legR.rotation.x = -sw;
      cloak.rotation.x = 0.12 + Math.abs(Math.sin(bobT)) * 0.16;
      root.position.y += Math.abs(Math.sin(bobT)) * 0.05;
    } else {
      /* 待机呼吸 */
      bobT += dt * 1.6;
      legL.rotation.x = legR.rotation.x = 0;
      cloak.rotation.x = 0.08 + Math.sin(bobT) * 0.03;
      root.position.y += Math.sin(bobT) * 0.015;
    }

    /* 第三人称相机跟随（帧率无关缓动） */
    target.set(state.x, state.y + 1.5, state.z);
    const cp = Math.cos(state.camPitch), sp2 = Math.sin(state.camPitch);
    desired.set(
      target.x + Math.sin(state.camYaw) * cp * state.dist,
      target.y + sp2 * state.dist,
      target.z + Math.cos(state.camYaw) * cp * state.dist,
    );
    if (!camInit) { camera.position.copy(desired); camInit = true; }
    else camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    camera.lookAt(target);
  }

  /* 初次摆位（不等第一帧：截图/首测就有构图） */
  target.set(state.x, state.y + 1.5, state.z);
  camera.position.set(
    target.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * state.dist,
    target.y + Math.sin(state.camPitch) * state.dist,
    target.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * state.dist,
  );
  camera.lookAt(target);
  root.position.set(state.x, state.y, state.z);
  root.rotation.y = state.faceYaw;

  return {
    update,
    state,
    root,
    setPos(x, z) { state.x = x; state.z = z; state.y = islandHeight(x, z); },
  };
}