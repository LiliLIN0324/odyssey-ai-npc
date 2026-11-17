#!/usr/bin/env node
// 离线引擎评测适配器：从标准输入读取评分入口筛出的安全用例 JSON
// （{cases:[...]}，也兼容直接传数组），输出 [{id,preds}]。
// 这里不做评分，评分统一走根目录 eval.py 的 score_case。
const fs = require("node:fs");
const path = require("node:path");
const { localIntentParse } = require(
  path.join(__dirname, "..", "odyssey-witch", "src", "agent", "localIntent.js")
);

function readInput() {
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw.trim() ? JSON.parse(raw) : []);
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

async function main() {
  const payload = await readInput();
  // 评分入口只发送预测所需字段；适配器不读取 cases.jsonl 的 expect 黄金答案。
  const cases = Array.isArray(payload) ? payload : (payload.cases || []);
  const out = cases.map((testCase) => ({
    id: testCase.id,
    // history 是考卷多轮口径；npcKey 仅在游戏调用链场景夹具中由评分入口显式提供。
    preds: localIntentParse(testCase.text, {
      history: testCase.history || [],
      npcKey: testCase.npcKey || "",
    }),
  }));
  process.stdout.write(JSON.stringify(out));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
