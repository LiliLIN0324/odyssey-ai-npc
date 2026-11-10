# 部署指南：修复线上版 /api 间歇 403（2026-11-10）

## 诊断结论

线上 `odyssey-1c9.pages.dev` 的 403 响应体为 `{"error":"HTTP 403｜Forbidden"}`——该格式与
`server.py` 的错误透传完全一致，证明 **403 来自上游天翼 MaaS，Function 只是原样转发**。
复现规律：本机/家宽 IP 请求稳定 200，Cloudflare Function 出口（数据中心 IP 池）高频 403——
上游对数据中心出口 IP 存在间歇性限制（或共享配额限流），与账号权限无关。

## 三层修复（本分支已含前两层）

1. **游戏端**：解析结果本地缓存（温度 0，确定输出）+ 并发单飞 + 600ms 退避重试——
   重复意图零请求，撞 403 的绝对次数大幅下降。
2. **函数端（本目录）**：服务端退避重试两次（500/1200ms，仅对 403/429/5xx），
   玩家端无感；`/api/schema` 加 10 分钟边缘缓存。
3. **密钥**：只存 Cloudflare 环境变量，绝不进前端/仓库。

## 部署步骤（有 Pages 权限的账号执行）

```bash
cd odyssey-witch

# 0. schema 部署件同步（根 schema.json 是唯一源；Pages Functions 不允许跨目录 import）
node ../tools/sync_schema.mjs          # 部署前必跑；--check 为漂移自检

# 1. 登录 Cloudflare（浏览器 OAuth 一次）
npx wrangler login

# 2. 多账号时指定账号（本机双账号：odyssey 项目在 Lily 账号下）
$env:CLOUDFLARE_ACCOUNT_ID='f0273e54d22c215389dd6065a802ddae'   # PowerShell
# export CLOUDFLARE_ACCOUNT_ID=f0273e54d22c215389dd6065a802ddae  # bash/zsh

# 3. 密钥已在线上（首次才需要）：
# npx wrangler pages secret put TELEAI_API_KEY --project-name odyssey

# 4. 部署（项目名是 odyssey，不是 odyssey-1c9——后者是子域名）
npx wrangler pages deploy . --project-name odyssey
```

## 验证（2026-11-10 已由本机实际部署并验证）

```bash
# 2026-11-10 实测：schema 200 / parse 200 / chat 200（偶发 403 已被服务端重试吸收）
curl https://odyssey-1c9.pages.dev/api/schema | head -c 80
curl -X POST https://odyssey-1c9.pages.dev/api/chat -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

## 重试策略（v2，2026-11-10 压测后升级）

- parse：4 次尝试，退避 400/1000/2200ms（±35% 抖动）
- chat：5 次尝试，退避 500/1300/2800/5000ms（±35% 抖动）
- 实测 8 连发 chat 在 3 次尝试下 3 败（403 成簇出现，短退避逃不出去）→ 升级后复测见 HANDOFF §17x。

## 注意

- 部署会把 `odyssey-witch/` 目录作为静态站点根（index.html + concept-art/ + world3d.js +
  vendor/），`functions/api/*` 编译为 /api/*。与现行线上结构一致（2026-11-10 已实际部署验证）。
- 若上游 403 在函数侧重试后仍高频出现，下一步是给天翼提交工单确认出口 IP 策略，
  或改用自部署 vLLM（PRODUCT §9 的公测阶梯方案）。

> AI生成
