// check-assets.mjs —— Tripo 产出物体检（PIPELINE.md §3 面数预算 + §6 体积/贴图预算）
//
// 用法：node tools/check-assets.mjs          （在 3d/app 下）
// 退出码：0 = 全部就绪且合规；1 = 有资产超预算或解析失败（缺失只记为"待产出"，不算失败）
//
// 读 public/assets/props.json，逐个检查：
//   · 文件是否存在（缺失 = Tripo 还没产出，记为待产出）
//   · 解析 GLB 头 → 三角面数、贴图张数、文件体积
//   · 面数对比 manifest.budgetTris；总量对比 §6 性能预算（150k tris / 30MB / 12 tex）
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', 'public', 'assets');
const manifest = JSON.parse(readFileSync(join(assetsDir, 'props.json'), 'utf8'));

function parseGlbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB（magic 不符）');
  const total = buf.readUInt32LE(8);
  let off = 12;
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    }
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  throw new Error('GLB 缺少 JSON chunk');
}

function triangleCount(gltf) {
  const accessors = gltf.accessors || [];
  let tris = 0;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.indices != null) tris += Math.round((accessors[prim.indices]?.count || 0) / 3);
      else if (prim.attributes && prim.attributes.POSITION != null) {
        tris += Math.round((accessors[prim.attributes.POSITION]?.count || 0) / 3);
      }
    }
  }
  return tris;
}

const MAX_TOTAL_TRIS = 150000;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_TEX_TOTAL = 12;

let ok = true;
let totalTris = 0;
let totalBytes = 0;
let totalTex = 0;
const rows = [];

for (const spec of manifest.props) {
  const file = join(assetsDir, spec.file);
  if (!existsSync(file)) {
    rows.push({ id: spec.id, state: '待产出', detail: spec.file });
    continue;
  }
  try {
    const bytes = statSync(file).size;
    const gltf = parseGlbJson(readFileSync(file));
    const tris = triangleCount(gltf);
    const tex = (gltf.images || []).length;
    const copies = 1 + (spec.repeat ? spec.repeat.length : 0);
    totalTris += tris * copies;
    totalBytes += bytes;
    totalTex += tex;
    let detail = `${tris} tris ×${copies} · ${tex} tex · ${(bytes / 1048576).toFixed(2)} MB`;
    if (spec.budgetTris && tris > spec.budgetTris) {
      detail += ` · 超预算(${spec.budgetTris})`;
      ok = false;
    }
    rows.push({ id: spec.id, state: '已产出', detail });
  } catch (e) {
    ok = false;
    rows.push({ id: spec.id, state: '解析失败', detail: e.message });
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n  资产              状态      详情');
console.log('  ' + '-'.repeat(84));
for (const r of rows) console.log(`  ${pad(r.id, 16)}${pad(r.state, 10)}${r.detail}`);
console.log('  ' + '-'.repeat(84));
const ready = rows.filter((r) => r.state === '已产出').length;
console.log(`  合计：${ready}/${rows.length} 就绪 · ${totalTris} tris · ${(totalBytes / 1048576).toFixed(2)} MB · ${totalTex} tex`);
console.log(`  预算：tris ≤ ${MAX_TOTAL_TRIS} · GLB ≤ 30 MB · 贴图 ≤ ${MAX_TEX_TOTAL} 张`);
if (totalTris > MAX_TOTAL_TRIS || totalBytes > MAX_TOTAL_BYTES || totalTex > MAX_TEX_TOTAL) {
  console.log('  ✗ 超出管线总预算');
  ok = false;
} else {
  console.log('  ✓ 未超总预算');
}
process.exit(ok ? 0 : 1);