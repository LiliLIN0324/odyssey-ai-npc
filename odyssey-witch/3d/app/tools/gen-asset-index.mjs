// gen-asset-index.mjs —— 构建前扫描 public/assets，生成 present.json（已产出的 glb 清单）
//
// 目的：运行时不再逐个 HEAD 探测 glb（缺文件会在控制台刷 404），只读这份清单。
// Tripo 产出新 glb 后重新 build（或 dev 启动）即自动更新清单。
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'public', 'assets');
if (!existsSync(dir)) {
  console.log('[assets] 目录不存在，跳过');
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f)).sort();
writeFileSync(join(dir, 'present.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`[assets] 已产出 ${files.length} 个模型：${files.join(', ') || '（空）'}`);