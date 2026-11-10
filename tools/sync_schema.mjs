#!/usr/bin/env node
/**
 * schema.json 同步：仓库根 schema.json（唯一数据源）→ odyssey-witch/functions/api/schema.json
 * Cloudflare Pages Functions 的 esbuild 不允许 import 出 functions 目录，
 * 因此部署件必须持有目录内副本；本脚本负责复制与漂移自检。
 *
 * 用法：
 *   node tools/sync_schema.mjs          # 同步（schema.json 改动后、部署前执行）
 *   node tools/sync_schema.mjs --check  # 只检查，漂移则退出码 1（收尾体检用）
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "schema.json");
const dst = resolve(root, "odyssey-witch/functions/api/schema.json");
const checkOnly = process.argv.includes("--check");

const canonical = (txt) => JSON.stringify(JSON.parse(txt));

const srcTxt = readFileSync(src, "utf-8");
if (checkOnly) {
  if (!existsSync(dst)) {
    console.error(`[sync-schema] 缺少部署件副本：${dst}（先运行 node tools/sync_schema.mjs）`);
    process.exit(1);
  }
  const same = canonical(srcTxt) === canonical(readFileSync(dst, "utf-8"));
  if (!same) {
    console.error("[sync-schema] 漂移：functions/api/schema.json 与根 schema.json 不一致，请重新同步");
    process.exit(1);
  }
  console.log("[sync-schema] OK：部署件副本与根 schema.json 一致");
} else {
  const out = JSON.stringify(JSON.parse(srcTxt), null, 2) + "\n";
  writeFileSync(dst, out, "utf-8");
  console.log(`[sync-schema] 已同步 → ${dst}（${out.length} chars）`);
}