// Cloudflare Pages Function：GET /api/schema
// 与 server.py 契约一致：返回 schema.json 的 JSON 数组（意图菜单，单一数据源）。
// Pages Functions 的 esbuild 不允许 import 出 functions 目录 → 目录内副本由
// tools/sync_schema.mjs 从仓库根 schema.json 同步（--check 可做漂移自检）。
import schema from "./schema.json";

export function onRequestGet() {
  return new Response(JSON.stringify(schema), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=600",   // 意图菜单十分钟内可走缓存，减轻函数冷启动
    },
  });
}
