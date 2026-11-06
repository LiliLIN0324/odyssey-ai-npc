# HANDOFF — xing4-npc-eval 跨会话交接

> **更新**: 2026-11-07（上传 GitHub 时修订） ｜ **用法**: 新会话第一句说"先读HANDOFF.md" ｜ 总计划看 `PLAN.md`，**产品定位/路线图/成本账看 `PRODUCT.md`**，评测细节看 `README.md`，剧情看 `odyssey-witch/odyssey-story.md`
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

### 2. 天翼平台实跑结果 `result-teleai.json`（11-06，关键数字）
| 指标 | 值 | 对照 |
|---|---|---|
| 类别准确率 | **77%** | PLAN P0 目标 ≥90%，未达 |
| 参数级 F1 | 87.1% | 优势项（官方口径一致） |
| 完全正确率 | **63.9%** | 目标 ≥80%，未达 |
| 负例误触发率 | **39.1%** | 最致命指标 |
| 延迟 P50 / P99 | **857ms / 1346ms** | 官方 ≤200ms 不可信 |

弱组：state_set 41.7%（状态型 vs 设定型）、confuse 50%（神话消歧）、multi 53.8%、chitchat 57.1%。
Top 混淆对：**查询附近目标→查询地点信息(6次)**、闲聊→其他意图(3)、其他意图→使用消耗品(3)。
强组：clear 100% 类别准、boundary 90.9%、hostile 87.5%。`schema-island-generic` 基线尚未实跑。

### 3. 游戏原型 `odyssey-witch/`（11-06 深夜，第一个"活 NPC"灰盒）
- 纯 Web 技术栈：`index.html`（Canvas 2.5D，1127 行）+ `server.py`（零依赖 Python 本地服务，key 只留服务端）
- 双层大脑已跑通：玩家输入 → `/api/parse`（XingIntent，T2）→ 30 类 handler 本地结算（金钱/背包/任务/状态真实变更）→ 低置信落 `/api/chat`（TeleChat3-438B，T3 女巫人格台词 ≤55 字）
- 已实装内容：世界地图（地中海驾船）+ 埃亚岛（2.5D 挤出瓦片、y 排序遮挡）；采玛草任务链（接/查进度/交/弃，含野猪 3 币彩蛋）、野猪战斗（E 键本地结算数值，死亡→屋外复活扣 5 币）、买卖/装备/消耗品/状态查询、祭坛彩蛋
- 包装层（11-07 凌晨最后一批工作）：标题屏（继续/新开）、章节过场卡（概念图 + 3s 自动跳过）、对话立绘（dlgPortrait）
- 叙事资产：`odyssey-story.md`（八章剧情圣经，第一章已实装，后续章剧本全写好）、`odyssey-lore.md`（知识库红线）、`odyssey-visual.md` + `concept-art/`（6 场景图 + 6 角色图）
- 存档：localStorage 带 version 字段 + migrate()（save-systems 原则从第一天遵守）

### 4. 3D 线 `odyssey-witch/3d/`（11-07 定向，P0 已完成）
- **已拍板**：不走 Godot 迁移，改做 **Three.js 浏览器 3D 垂直切片**（埃阿亚岛一岛），与 2D 版并行、2D `index.html` 不动（方法论来自 Sac《小王子：星辰之旅》16 天工作流转译）
- **`3d/HANDOFF.md` 是 3D 线唯一总控与进度账本（P0–P7 八阶段，含验收命令/目录契约/数据契约）**——3D 相关一律以它为准
- **P0 ✅**：`3d/app/` Vite + three 骨架可跑（three ^0.170 / vite ^5，`npm install && npm run build` 已验证，dist 488.8 KB gzip 122.8 KB）；加载页（渐变+标题）+ 占位场景 + `palette.js` 色板常量就位
- 待启动：**P1 程序化世界**（noise.js/岛体/海面 shader/天空穹顶/光照/草卡/火堆，纯代码不依赖资产）；**P2 资产生产**（唯一需要用户动手的阶段：A1/A2 参考表 prompt 在 `PIPELINE.md` §2，生成后 Tripo 提交）
- `tools/clean_asset.py`、`tools/review_shots.py`：Blender 4.x 自动化脚本已就绪

---

## 二、卡住的问题

1. **P0 KEEP 判据未达标**：类别 77% < 90%，完全正确 63.9% < 80%。结论和文章一致——该改 schema 描述而非换模型。confuse/state_set/multi 是三个硬骨头。
2. **负例误触发 39%**：该落"其他意图"的没落。游戏后果 = NPC 乱触发交易/任务，比填错参数伤。
3. **对话节奏隐患**：Intent 实测 P50 857ms（官方承诺的 1/4），加 T3 台词 300ms+，一次对话 >1.2s。PLAN 里"台词预生成 + Intent <150ms"的假设要重新校。
4. **多会话并行写入同一工作区**：本文件修订时检测到并行会话正在推进 2D 第二章冥界（实机截图 `hades-final.png`、新概念图 `concept-art/07-冥界之岸.jpg`）——初始 git 提交只是某刻快照，接手任何文件前先确认现状。
5. 3D 线 P2 参考表卡在图像生成（prompt 在 PIPELINE.md §2，需要用户侧操作）；Tripo 资产未提交。
6. （小）`-p/` 目录是误建产物（后台任务日志），可删；根目录散落一批 `*.png` 验证截图可归档。

---

## 三、下一步计划（双线并行，互不阻塞；先推哪条由用户定）

**3D 线（odyssey-witch/3d/，P0 ✅，阶段账本见 3d/HANDOFF.md §0）**
1. **P1 · 程序化世界**：noise.js + 岛体/海面 shader/天空穹顶/光照/草卡/火堆——不依赖任何生成资产，任务清单与验收命令在 `3d/HANDOFF.md` §4-P1
2. **P2 · 参考表与资产**：A1（场景多视角）/A2（角色四视图 T-pose）prompt 已写好在 `PIPELINE.md` §2，需用户拿去图像模型（即梦/MJ/GPT-Image）生成 → Tripo 提交（唯一需要用户参与的阶段，可与 P1 并行）

**2D 线（评测 + 剧情）**
3. **schema 调优一轮 + 复测**（评测侧收益最大）：
   - 重写"查询附近目标" vs "查询地点信息"的 description 边界（错 6 次的大头）
   - state_set 组：description 已写死"只读不改"仍 41.7%，试把状态读取与设定的例子/反例写得更狠
   - "其他意图"补强：压负例误触发（39% 是最致命指标）
   - 用 `eval.py --group confuse,state_set,multi` 小组快速迭代，最后全量复测
4. **第二章·冥界（2D）**：剧本已在 `odyssey-story.md`（卡戎渡口 + 特瑞西阿斯二选一预言），冥界词表是现成 OOV 测试。**注意：检测到并行会话已在动工**（`hades-final.png` 实机截图、`concept-art/07-冥界之岸.jpg` 已出现）——接手前先看 `index.html` 当前实际状态
5. **校 PLAN.md 勾选状态**：P0 的意图表/评测集/灰盒三项实际已落地，但 PLAN.md 全是空 checkbox；引擎选型段落也已被 Three.js 决定超越
6. （顺手）跑一次 `schema-island-generic.json` 基线对照，把 OOV 分差数字补进 README。

---

## 四、踩过的坑（必读）

1. **天翼 API 429 限流**：eval.py 多并发必撞。补救脚本 `tools/rerun_failed.py`——单并发重跑失败用例并合并回原结果文件。
2. **必须关深度思考**：`chat_template_kwargs: {enable_thinking: false}`，否则同题 0.6s→2.6s。eval.py 和 server.py 都已内置。
3. **天翼接口格式**：只收单条 `role:user` 消息（system 由服务方预置、禁传），任务说明+schema+输入拼一条 content。local 后端用同格式保证可比。
4. **延迟按实测规划**：官方 ≤200ms，第三方 334ms，本仓库 P50 857ms。别按 150ms 设计对话节奏。
5. **托管 API 不支持批量推理**，别省这点 token。
6. **模型填"斯库拉"而非"斯库拉海峡"是对的**——专有名词保留原话，归一化是游戏代码的活，不是模型的活（schema 第 3 原则）。
7. **参数用值级 exact match**：部分给分会掩盖"三瓶药填成三瓶油"这类硬伤。
8. **Windows shell 没有 ls**，用 dir / powershell。
9. **key.txt 绝不进版本库**（.gitignore 已配，只有 key.example.txt 模板）；浏览器侧永远拿不到 key（全走 server.py 代理）。

---

## 五、文件地图 & 启动速查

```
PLAN.md                  总计划：四层决策栈 T0-T3、P0-P4 阶段、风险清单
PRODUCT.md               产品计划：北极星/画像/竞品/版本路线图（带判据）/成本 token 账/GTM/合规/风险登记册/待拍板决策点
README.md                评测套件文档（指标定义、分组、调优顺序）
schema.json / cases.jsonl / eval.py / fake_server.py
schema-island-generic.json   通用岛基线（未实跑）
result-teleai.json       天翼实跑结果（勿覆盖，复测请用新文件名）
key.txt                  天翼 API key（gitignored）
odyssey-witch/
  index.html             游戏全部前端（地图/渲染/对话/30类handler/存档）
  server.py              本地服务 :8765（静态托管 + /api/schema|parse|chat 代理）
  odyssey-story.md       剧情圣经（八章，第一章已实装）
  odyssey-lore.md        知识库（神话事实红线）
  odyssey-visual.md      视觉稿（3D 线的色板来源）
  concept-art/           6 场景 + 6 角色（chapter card / 立绘 / 3D 参考图底图在用）
  3d/
    HANDOFF.md           ★3D 线总控账本：P0–P7 阶段/验收命令/目录契约（进度以它为准）
    PIPELINE.md          方法论：Sac 工作流转译 + A1/A2 prompt + 资产分诊表
    tools/clean_asset.py   Blender 资产清理（减面/原点/glb 导出 + 面数报告）
    tools/review_shots.py  Blender 四视角截图（喂独立审查盲评）
    app/                   Vite+three 骨架（P0 ✅；npm run dev 即可跑；node_modules/dist 已 ignore）
tools/rerun_failed.py    429 失败用例重跑合并脚本（源自 .temp，已转正）
```

```bash
# 游戏
cd odyssey-witch && py -3 server.py 8765        # 或双击 启动游戏.bat
# 评测
py -3 eval.py --backend mock                    # 冒烟，免 key
py -3 eval.py --backend teleai --out result-new.json --workers 4   # 实跑，见坑1
py -3 eval.py --group confuse,state_set --verbose                  # 弱组单跑
```

> 每次会话结束前把新进展合进本文件。改 schema 后必须复测并更新第二节数字。
