// props.js —— Tripo 产出物的落位与加载（Phase C 接入层）
//
// 契约：public/assets/props.json 描述"哪个 glb 放在哪个坐标"；glb 缺失时静默跳过，
// 因此 Tripo 还没产出的阶段，场景与现在完全一致（不报错、不闪烁、不影响帧率）。
//
// 用法：createProps(scene) 返回 { stats, missing, ready, update(dt) }。
// 全部处理完后在控制台打印一行汇总；window.__AEAEA__.props 可查同款信息。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { islandHeight } from './world.js';

const MANIFEST_URL = 'assets/props.json';

// 三角面数（Tripo 常见非索引网格，按 POSITION.count/3 计）
function countTriangles(root) {
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const pos = g.attributes && g.attributes.position;
    if (!pos) return;
    tris += g.index ? g.index.count / 3 : pos.count / 3;
  });
  return Math.round(tris);
}

function prepMesh(root, castShadow) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !!castShadow;
    o.receiveShadow = true;
    // Tripo 材质常见 metallic=1，在没有环境贴图的场景里会发黑，归一到非金属
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if ('metalness' in m && m.metalness > 0.6) m.metalness = 0.05;
      if ('roughness' in m && m.roughness < 0.35) m.roughness = 0.8;
      m.envMapIntensity = 0;
    }
  });
}

const loadGlb = (loader, url) =>
  new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));

export function createProps(scene) {
  const stats = { loaded: 0, failed: [], totalTris: 0, perAsset: [] };
  const missing = [];
  const loaded = new Map();
  let ready = false;

  run();

  async function run() {
    let list = [];
    let present = new Set();
    try {
      const manifestRes = await fetch(MANIFEST_URL);
      if (!manifestRes.ok) throw new Error(`manifest ${manifestRes.status}`);
      list = (await manifestRes.json()).props || [];
      /* 构建期生成的「已产出清单」（tools/gen-asset-index.mjs）：避免逐个探测 404 */
      const idxRes = await fetch('assets/present.json');
      if (idxRes.ok) present = new Set((await idxRes.json()).files || []);
    } catch (e) {
      console.warn('[props] 落位表不可用，跳过 Tripo 资产接入：', e.message);
      ready = true;
      return;
    }

    const loader = new GLTFLoader();

    for (const spec of list) {
      const url = `assets/${spec.file}`;
      try {
        if (!present.has(spec.file)) {
          missing.push(spec.id);
          continue;
        }
        const gltf = await loadGlb(loader, url);
        const tris = countTriangles(gltf.scene);
        const copies = 1 + (spec.repeat ? spec.repeat.length : 0);
        stats.loaded += 1;
        stats.totalTris += tris * copies;
        stats.perAsset.push({
          id: spec.id,
          tris,
          copies,
          budget: spec.budgetTris || null,
          over: !!(spec.budgetTris && tris > spec.budgetTris),
        });
        loaded.set(spec.id, { gltf, spec, tris });

        const spots = [[spec.pos[0], spec.pos[1]]].concat(spec.repeat || []);
        spots.forEach(([x, z], i) => {
          const node = i === 0 ? gltf.scene : gltf.scene.clone(true);
          prepMesh(node, spec.castShadow);
          node.position.set(x, islandHeight(x, z), z);
          node.rotation.y = spec.rotY || 0;
          node.scale.setScalar(spec.scale || 1);
          node.name = `prop:${spec.id}${i ? `#${i}` : ''}`;
          scene.add(node);
        });

        if (spec.budgetTris && tris > spec.budgetTris) {
          console.warn(`[props] ${spec.id} 面数超预算：${tris} > ${spec.budgetTris}`);
        }
      } catch (e) {
        stats.failed.push({ id: spec.id, error: String((e && e.message) || e) });
        console.warn(`[props] ${spec.id} 加载失败：`, e);
      }
    }

    ready = true;
    console.info(
      `[props] 接入完成：已加载 ${stats.loaded} / 待产出 ${missing.length} / 失败 ${stats.failed.length}` +
      `；三角面合计 ${stats.totalTris}`,
    );
  }

  return {
    stats,
    missing,
    get ready() { return ready; },
    get(id) { return loaded.get(id) || null; },
    update() {},
  };
}