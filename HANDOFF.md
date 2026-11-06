# HANDOFF — xing4-npc-eval 跨会话交接

> **更新**: 2026-11-07 · 三次修订（**schema 调优对账**：v2→v2.1 两轮复测数字回填、评测证据入库 `results/`、v0.2.0 发版门复核不打 tag） ｜ **用法**: 新会话第一句说"先读HANDOFF.md" ｜ 总计划看 `PLAN.md`，**产品定位/路线图/成本账看 `PRODUCT.md`**，评测细节看 `README.md`，剧情看 `odyssey-witch/odyssey-story.md`
> **仓库**: https://github.com/LiliLIN0324/odyssey-ai-npc （public）｜ 3D 线总控账本：`odyssey-witch/3d/HANDOFF.md`

**项目一句话**：为《奥德赛》主题开放世界 AI NPC 游戏打地基——先用 213 条用例量化 Xing4.0-29B-Intent 的意图/填参/误触发能力，再用它 + 通用大模型搭出双层大脑的灰盒原型（女巫喀耳刻）。架构 = 大模型负责"想"，XingIntent 把"想"变成引擎能执行的 `{category, args}` JSON。

---

## 一、已完成

### 1. 意图评测套件（11-05）
- `schema.json`：奥德赛版 30 个意图类别（神话实体自带易混对：塞壬/斯库拉、雅典娜/赫尔墨斯）
- `schema-island-generic.json`：通用岛基线对照（同结构、仅词表不同，分差可归因 OOV）
- `cases.jsonl`：213 条用例、11 分组（clear/confuse/boundary/slot_missing/chitchat/oov/multi/negative/multiturn/hostile/state_set）
- `eval.py`：双后端（teleai / local-vLLM-LMStudio-Ollama）+ mock 冒烟；指标含类别准确率、参数级 F1（值级 exact match）、完全正确率、**负例误触发率**、延迟分位
- `fake_server.py`：免 key 链路自检端点；README.md 全套文档已写完

### 2. 天翼平台实跑 + schema 两轮调优（11-06 首跑，11-07 凌晨调优复测）

**"改 schema 不换模型"的结论已被两轮调优验证**：类别准确率 77% → 93%，误触发 39.1% → 4.3%。
补丁脚本与 v1 备份在 `.temp/`（`schema_v2_patch.py` / `schema_v21_patch.py` / `schema-v1-backup.json`）；
**当前已提交的 `schema.json` 就是 v2.1 版**（24/30 类 description 补了边界句：如"X在哪"归查询附近目标、
"嗯/对"应答词归闲聊、接/交任务分界、贬斥辱骂归威胁等；15/30 类 args 描述同步补强）。
三轮 summary 快照已入库 `results/`（原始 result 文件被 gitignore，勿覆盖、复测用新文件名）：

| 指标 | v1（11-06 基线） | v2（一轮调优） | **v2.1（当前 schema）** | 对照 |
|---|---|---|---|---|
| 类别准确率 | 77% | 92.5% | **93.0%** | PLAN P0 目标 ≥90% ✅ |
| 参数级 F1 | 87.1% | 89.8% | **92.0%** | 优势项保持 |
| 完全正确率 | 63.9% | 77.0% | **79.8%** | 目标 ≥80%，**差 0.2pp** |
| 负例误触发率 | 39.1% | 13.0% | **4.3%** | <10% ✅（原最致命指标） |
| 延迟 P50 / P99 | 857 / 1346ms | 1164 / 5179ms | **1169 / 2836ms** | ⚠️ 描述加长的代价，见坑 11 |

弱组变化：state_set 41.7%→**100%**、confuse 50%→**91.7%**、chitchat 57.1%→**100%**、oov 78.6%→92.9%。
**multi 53.8% 两轮纹丝不动，是剩下的硬骨头**（多意图拆分是模型能力短板，不是 schema 描述问题）。
Top 混淆对从"查询附近目标→查询地点信息(6次)"降到最高仅 2 次。
`schema-island-generic` 基线对照仍未实跑。

### 3. 游戏原型 `odyssey-witch/`（11-06 深夜，第一个"活 NPC"灰盒）
- 纯 Web 技术栈：`index.html`（Canvas 2.5D，1127 行）+ `server.py`（零依赖 Python 本地服务，key 只留服务端）
- 双层大脑已跑通：玩家输入 → `/api/parse`（XingIntent，T2）→ 30 类 handler 本地结算（金钱/背包/任务/状态真实变更）→ 低置信落 `/api/chat`（TeleChat3-438B，T3 女巫人格台词 ≤55 字）
- 已实装内容：世界地图（地中海驾船）+ 埃亚岛（2.5D 挤出瓦片、y 排序遮挡）；采玛草任务链（接/查进度/交/弃，含野猪 3 币彩蛋）、野猪战斗（E 键本地结算数值，死亡→屋外复活扣 5 币）、买卖/装备/消耗品/状态查询、祭坛彩蛋
- 包装层（11-07 凌晨最后一批工作）：标题屏（继续/新开）、章节过场卡（概念图 + 3s 自动跳过）、对话立绘（dlgPortrait）
- 叙事资产：`odyssey-story.md`（八章剧情圣经，第一章已实装，后续章剧本全写好）、`odyssey-lore.md`（知识库红线）、`odyssey-visual.md` + `concept-art/`（6 场景图 + 6 角色图）
- 存档：localStorage 带 version 字段 + migrate()（save-systems 原则从第一天遵守）

### 4. 3D 线 `odyssey-witch/3d/`（11-07 定向，P0/PD/P1 已完成）
- **已拍板**：不走 Godot 迁移，改做 **Three.js 浏览器 3D 垂直切片**（埃阿亚岛一岛），与 2D 版并行、2D `index.html` 不动（方法论来自 Sac《小王子：星辰之旅》16 天工作流转译）
- **`3d/HANDOFF.md` 是 3D 线唯一总控与进度账本（P0–P7 + PD 九阶段，含验收命令/目录契约/数据契约）**——3D 相关一律以它为准，本节只是摘要（体检脚本会打印 §0 供比对）
- **P0 ✅**：`3d/app/` Vite + three 骨架（three ^0.170 / vite ^5，构建 488.8 KB gzip 122.8 KB）；加载页（渐变+标题）+ 占位场景 + `palette.js` 色板常量
- **PD ✅**：Cloudflare Pages 已上线 **https://aeaea-3d.pages.dev**（`npm run deploy` 直传；`wrangler.toml`/`_headers` 已配；回滚见 3d/HANDOFF §8.3）
- **P1 ✅**：程序化世界全量落地——noise.js 种子噪声、岛体 fbm 顶点色、三档海色 + 金色光路 shader、天空穹顶暖光、黄昏金平行光、双档绿草卡、火堆粒子、debug HUD。实测 @1280×720：**fps 108 ｜ tris 44.0k ｜ calls 5**（预算内）；验收截图 `3d/tools/shots/p1-persp.png`。ShaderMaterial sRGB 踩坑见 §四-10
- 待办：**P2 资产生产**（唯一需要用户动手的阶段：A1/A2 参考表 prompt 在 `PIPELINE.md` §2，生成后 Tripo 提交）；P3 组装前置 P2，但 P4 角色控制可用占位胶囊先行；`tools/clean_asset.py`、`tools/review_shots.py`（Blender 4.x）已就绪

### 5. 第二章冥界（2D）实装 + 剧情圣经全章补全（11-07）
- **第二章·冥界已实装**（并行会话完成，实机截图 `shots/hades-final.png`）：冥界之岸（俄刻阿诺斯之岸）+ 献祭沟（蜂蜜酒+面包+淡水，跨岛采买）+ 特瑞西阿斯二选一预言（`state.prophecy` flag，「查询神谕」意图）
- **剧情圣经全章补全**（`odyssey-story.md`）：序幕~终章全部配齐原版骨/自由肉/故事弧/任务树/新机制；三条暗线给出种植→收束对照；新增**名字机制**（自称/旧名/被唱出的/新写的，终章认名）与**结局矩阵**（4 维 flag 拼装判词，10 个段落模块）；第六章 NPC 笔误更正（玛西亚雅→瑙西亚娅+德摩多科斯）；每章带"实装清单"硬性交付
- 品牌资产：IP 立绘（无名旅人/喀耳刻）、奥德赛徽章、三张地图概念图（并行会话产出）

---

## 二、卡住的问题

1. **（11-07 调优后大部分已解决，剩两小块）**：类别 93.0% ✅、误触发 4.3% ✅。剩：**完全正确 79.8% 差 0.2pp**（≥80% 线上）；**multi 组 53.8% 两轮不动**——一句话多意图拆分是模型能力短板，schema 描述已到头，再磨收益低，考虑游戏侧引导玩家分句说。
2. **（已解决 11-07 调优）**~~负例误触发 39%~~ → 4.3%。"其他意图"描述补强（"嗯/对/测试文本不是寒暄"）立竿见影。
3. **对话节奏隐患（调优后恶化了）**：Intent P50 1169ms、P99 2836ms（v1 时 857/1346ms）——schema 描述加长换准确率的直接代价，单次 prompt ≈6.5K token。加 T3 台词 300ms+，一次对话 >1.5s。**PRODUCT.md §7 v0.4.0 的 P50<600ms 判据目前差得远**，下轮要做 schema 瘦身（裁剪 description/枚举，见 §三.3）。
4. **多会话并行写入同一工作区**：初始 git 提交只是某刻快照，接手任何文件前先确认现状（11-07 教训：HANDOFF 曾落后 3D 线两个阶段、评测调优两轮的数字也没进 HANDOFF——本次三次修订才补上）。
5. 3D 线 P2 参考表卡在图像生成（prompt 在 PIPELINE.md §2，需要用户侧操作）；Tripo 资产未提交。
6. （已处理 11-07）根目录 18 张未引用截图/贴图残片归档 `shots/`，误建空目录 `-p/`、`copy/` 已删；以后会话产物别丢在根目录，体检脚本会盯（§六）。
7. （已处理 11-07）**评测证据只在本机**：`result-*.json` 被 gitignore，仓库里查无此数——已把三轮 summary 快照入库 `results/`（含对照表 README），复测请提新快照，别覆盖。

---

## 三、下一步计划（双线并行，互不阻塞；先推哪条由用户定）

**3D 线（odyssey-witch/3d/，P0/PD/P1 ✅，阶段账本见 3d/HANDOFF.md §0）**
1. **P2 · 参考表与资产**：A1（场景多视角）/A2（角色四视图 T-pose）prompt 已写好在 `PIPELINE.md` §2，需用户拿去图像模型（即梦/MJ/GPT-Image）生成 → Tripo 提交（唯一需要用户参与的阶段；P4 角色可先用占位胶囊，不阻塞）
2. **P3 · 场景组装与盲评**：前置 P2（或角色占位）；GLTFLoader + LAYOUT 常量表按参考图摆位，≥2 轮独立盲评，任务在 `3d/HANDOFF.md` §4-P3

**2D 线（评测 + 剧情）**
3. **schema 瘦身（延迟回收）+ multi 专项**（调优已完成 93%，下一程）：
   - v2.1 准确率的代价是延迟：P50 1169ms / prompt 6.5K token。裁剪 description 冗余、压缩枚举列表，目标 P50 回到 1s 内（PRODUCT §7 v0.4.0 判据 P50<600ms 的前置）
   - **完全正确 79.8%→80%+**：差 0.2pp，从 v21 失败清单（`.temp/check_v21.py` 可复跑）里挑可修的
   - multi 组 53.8% 两轮不动：先分析失败模式（拆分缺失 or 参数张冠李戴），再决定是游戏侧引导分句还是接受现状
   - 用 `eval.py --group multi` 小组快跑迭代，瘦身复测跑全量并对 `results/` 提新快照
4. **第三章·声之海（2D）**：剧本已补全（`odyssey-story.md`）——塞壬日志歌词（分享时刻预埋）、物品级代价（六头吃背包）、斯库拉接话"不怪你"；实装前把第二章新增实体词表（渡口/冥河/亡魂/旧名/预言）并入 `cases.jsonl` 跑 OOV 回归
5. **v0.2.0 发版门（tag 纪律）——11-07 复核：不打 tag**。第二章已实装，但 PRODUCT.md §7 判据里"冥界词表 OOV 评测不差于基线 -5pp"**仍未验**（`cases.jsonl` 自 11-05 后未更新，第二章词表还没并进去）。跑完上条 OOV 回归、数字达标，才打 `v0.2.0` 并回填 PRODUCT.md §7。**判据不绿不打 tag**（v0.1.0 已在远端，别动）
6. （顺手）跑一次 `schema-island-generic.json` 基线对照，把 OOV 分差数字补进 README。

---

## 四、踩过的坑（必读）

1. **天翼 API 429 限流**：eval.py 多并发必撞。补救脚本 `tools/rerun_failed.py`——单并发重跑失败用例并合并回原结果文件。
2. **必须关深度思考**：`chat_template_kwargs: {enable_thinking: false}`，否则同题 0.6s→2.6s。eval.py 和 server.py 都已内置。
3. **天翼接口格式**：只收单条 `role:user` 消息（system 由服务方预置、禁传），任务说明+schema+输入拼一条 content。local 后端用同格式保证可比。
4. **延迟按实测规划**：官方 ≤200ms，第三方 334ms，本仓库 v2.1 实测 P50 1169ms（描述加长前 857ms）。别按 150ms 设计对话节奏，按 ≥1.2s 规划。
5. **托管 API 不支持批量推理**，别省这点 token。
6. **模型填"斯库拉"而非"斯库拉海峡"是对的**——专有名词保留原话，归一化是游戏代码的活，不是模型的活（schema 第 3 原则）。
7. **参数用值级 exact match**：部分给分会掩盖"三瓶药填成三瓶油"这类硬伤。
8. **Windows shell 没有 ls**，用 dir / powershell。
9. **key.txt 绝不进版本库**（.gitignore 已配，只有 key.example.txt 模板）；浏览器侧永远拿不到 key（全走 server.py 代理）。
10. **three.js 自定义 ShaderMaterial 不自动做线性→sRGB 输出**：fragment 末尾必须手动 `#include <colorspace_fragment>`（放在 fog 混合之后），否则颜色整体发暗、暖金变暗红。`3d/app/src/world.js` 的水/天 shader 已带，照抄。
11. **schema 调优是准确率/延迟的交易**：v2.1 给 24/30 类补边界句换来 77%→93%，但 prompt 涨到 ≈6.5K token、P50 857→1169ms、P99 1346→2836ms。每次改 schema 必须**同时复测准确率和延迟**（全量跑，别只看 group 分数），瘦身同理反向验证。
12. **result-*.json 被 gitignore，"勿覆盖"管不住换机器**：仓库内证据只有 `results/` 的 summary 快照。复测新文件名跑完后，把 summary 块提一条新快照进 `results/` 并更新其 README 对照表。

---

## 五、文件地图 & 启动速查

```
PLAN.md                  总计划：四层决策栈 T0-T3、P0-P4 阶段、风险清单
PRODUCT.md               产品计划：北极星/画像/竞品/版本路线图（带判据）/成本 token 账/GTM/合规/风险登记册/待拍板决策点
README.md                评测套件文档（指标定义、分组、调优顺序）
schema.json / cases.jsonl / eval.py / fake_server.py
                         （schema.json 已是 v2.1 调优版：93.0%，v1 备份在 .temp/schema-v1-backup.json）
schema-island-generic.json   通用岛基线（未实跑）
result-*.json            三轮全量结果，体积大被 gitignore、只在本机（勿覆盖，复测用新文件名）
results/                 ★评测证据入库处：三轮 summary 快照 + 对照表 README（仓库内查数字以它为准）
key.txt                  天翼 API key（gitignored）
shots/                   2D/评测线截图归档（实机验证用；3D 线截图在 3d/tools/shots/，不入库）
odyssey-witch/
  index.html             游戏全部前端（地图/渲染/对话/30类handler/存档；第二章冥界已实装）
  server.py              本地服务 :8765（静态托管 + /api/schema|parse|chat 代理）
  启动游戏.bat + start-service.vbs   一键启动（vbs 静默拉起 server.py）
  odyssey-story.md       剧情圣经（八章全写完：第一章+第二章已实装）
  odyssey-lore.md        知识库（神话事实红线）
  odyssey-visual.md      视觉稿（3D 线的色板来源）
  concept-art/           7 场景 + 6 角色 + brand/（IP 立绘×2+徽章）+ maps/（世界/埃亚岛/冥界之岸 3 张）
  3d/
    HANDOFF.md           ★3D 线总控账本：P0–P7+PD 阶段/验收命令/目录契约（进度以它为准；P0/PD/P1 ✅）
    PIPELINE.md          方法论：Sac 工作流转译 + A1/A2 prompt + 资产分诊表
    tools/clean_asset.py   Blender 资产清理（减面/原点/glb 导出 + 面数报告）
    tools/review_shots.py  Blender 四视角截图（喂独立审查盲评）
    app/                   Vite+three（P0/PD/P1 ✅；npm run dev 本地跑、npm run deploy 发 Cloudflare Pages；node_modules/dist/raw-assets 已 ignore）
tools/rerun_failed.py    429 失败用例重跑合并脚本（源自 .temp，已转正）
tools/handoff_check.py   HANDOFF 体检脚本（§六机制的机械部分，收尾必跑）
```

```bash
# 游戏
cd odyssey-witch && py -3 server.py 8765        # 或双击 启动游戏.bat
# 评测
py -3 eval.py --backend mock                    # 冒烟，免 key
py -3 eval.py --backend teleai --out result-new.json --workers 4   # 实跑，见坑1
py -3 eval.py --group confuse,state_set --verbose                  # 弱组单跑
```

> 每次会话结束前把新进展合进本文件（流程见 §六）。改 schema 后必须复测并更新第二节数字。

---

## 六、会话收尾体检（"定期补充"机制）

> 用户要求：HANDOFF 必须**定期补充、不许与现实失配**（11-07 曾落后 3D 线两个阶段）。机械部分固化成脚本，收尾四步：

```bash
py -3 tools/handoff_check.py
```

脚本 8 项自检：工作区干净 / 本地是否领先远端 / tag 推送比对 / 密钥未入库 / 文件地图存在性 / HANDOFF 引用的 result 文件 / 根目录散落图片 / **3d/HANDOFF §0 状态摘要打印**（人工比对用）。

1. 跑脚本，把 `[!!]` 项逐条清零；
2. 人工比对脚本打出的 3D 账本 §0 摘要 vs 本文件 §一.4——**3D 进度只认 `3d/HANDOFF.md`**，本文件摘要跟着它走；
3. 评测数字变了 → 回填本文件第二节 + `PRODUCT.md` §12；要发版 → 对 `PRODUCT.md` §7 判据，**全绿才打 tag**，不绿不动 tag；
4. commit + push 收尾——HANDOFF 不许领先远端过夜。
