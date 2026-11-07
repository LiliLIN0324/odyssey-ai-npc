# HANDOFF — xing4-npc-eval 跨会话交接

> **更新**: 2026-11-07 · 五次修订（**v0.2.0 发版门实测**：第二章冥界词表 14 条并入评测集（227 条/12 组）→ 首跑 50% 判据深红 → schema v2.2 补丁复测 85.7% 仍差判据线 2.2pp → **不打 tag**；通用岛基线对照首跑，结论入 README；五次微补：体检复核发现游戏正式地名「俄刻阿诺斯之岸」无评测用例，列入 v2.3 候选，见 §三.3）；**六次微补（内容级对账）**：§一.3 两处计数漂移修正（index.html 1127→1656 行、场景图 6→7），「献祭之沟」变体与世界地图地名导航零覆盖并入 v2.3 顺手项，见 §三.3/§六）；**七次微补（内容级对账·第二轮）**：§2.5 补丁口径修正（「8 处描述」实为 7 类描述+1 类 args）、multi 组「三轮不动」修正为 53.8%↔61.5% 五轮交替（7/13↔8/13，上限未破）；其余硬计数/地名/快照数字/PRODUCT/README 交叉复核全部一致；**八次微补（内容级对账·第三轮，11-07）**：30+ 项声明复核全绿（cases 227/12 组、index.html 1656 行、六快照 summary+延迟逐值、multi 五轮交替 53.8↔61.5、弱组四组、concept-art 7+6+3+3、地名计数、story 八章+勘误在案、PLAN/PRODUCT/README 交叉一致），仅两处口径修正——存档「version 字段」实为 key 名版本化（`odyssey-med-v2`，对象内无字段）、§一.2 v2.2 指路笔误（§一.6→§一.2.5）；**九次微补（内容级对账·第四轮，11-07）**：机械体检 8 项全绿 + 30+ 项硬声明逐值复核全绿（六快照 summary/延迟/multi 五轮/弱组/cases 227·12 组·hades 14 条/index.html 1656 行/地名计数/story 八章+勘误/schema 30+29 类/文件在场性/results 对照表六行），唯一缺口是 §五 文件地图漏记 `concept-art/characters/`（角色图 6 张在子目录、场景图在根目录），已补记；发版门判据复核仍 **RED（85.7% < 87.9%）**，维持不打 tag；**十次微补（内容级对账·第五轮，11-07）**：零缺口轮——机械体检 8 项全绿 + 第五轮自动断言全绿（六快照 summary/延迟逐值、multi 五轮 53.8↔61.5、弱组四组、cases 227·12 组·hades 14 条、index.html 1656 行·地名计数·存档 key、schema 30+29 类、资产 7+6+3+3、story 八章+勘误、README/PRODUCT/results-README 交叉），另抽查死亡复活逻辑（index.html:455-459 扣 5 币送女巫屋外）与 odyssey-witch 目录逐文件比对 §五 无漏记；发版门第三次复核仍 RED（85.7% < 87.9%，差 1 条）维持不打 tag；**十一次微补（内容级对账·第六轮，11-07）**：零缺口轮——机械体检 8 项全绿 + 五轮断言复跑 0 不一致，另用 v3/v21/v22 原始快照把前五轮未逐条核过的声明坐实（hades 失败身份 = hades_07"怎么渡过冥河"期望请求帮助答导航 + hades_14"献祭沟在哪"期望查询附近目标答查询地点信息，与 §2.5 定性一致；boundary_18"喝"v21 对→v22 错，§四.11 扰动坐实；v22 唯一误触发 = oov_12；完全正确 181/227 = 79.74% 差 0.26pp）；results/ 六快照+README 与账面一致、远端 v0.1.0 tag 在场；发版门第四次复核仍 RED（85.7% < 87.9%，差 1 条）维持不打 tag；**十二次微补（11-07 傍晚，本会话）**：接手时发现并行会话 16:01 在 index.html 落了一批**未记录**的新工作（§一.7：风神岛场景+WebAudio 音效系统+多任务账本+M 海图+favicon，1656→2819 行）——按 §二.4 教训先查清再入库：JS 语法体检（node --check）✅、实机冒烟 ✅（启航/世界图渲染/E 登陆风神岛/风神岛渲染/M 海图全绿；两处非阻塞小瑕疵见 §二.9）；对账第七轮：机械体检 8 项除"工作区未提交"外全绿，第五轮断言复跑 123 项仅 3 红且恰好全是该批次（行数 2819、献祭之沟 ×2、brand+favicon）、第六轮断言复跑全绿=评测侧零漂移；该批次已回填 §一.7/§二.9/§三.3/§五；发版门第五次复核仍 RED（85.7% < 87.9%，差 1 条）维持不打 tag；**十三次微补（11-07 16:42 终局，本会话）**：并行会话批次于 16:37 静默、最终规模远超十二次微补时点——index.html 2819→**3343 行**（新增：风袋玩法全量实装「放风=航速倍增/贪念用光写记忆流」、**第三章声之海峡场景部分实装**（scene `strait`、siren NPC、塞壬立绘已接）、标题屏改全幅概念图双按钮（继续航程/从头开始））；cases 227→**257 条 14 组**（wind_oov 14 已随 v4 首跑 **100%**；hades_15/16（正是 §三.3 两个顺手项：俄刻阿诺斯之岸/献祭之沟变体）+ ch3_oov 14 共 **16 条 16:36 增补、尚未评测**，v4 快照为 241 条时点）；schema v2.3（使用消耗品 args 补"风袋"）；**剧情圣经已补「插章·风神岛·风的账」**（十二次微补"圣经缺岛"一项已被其自行修复）；新资产：characters/07-塞壬、08-斯库拉、09-埃俄罗斯 + maps/04-风神岛图（**后三张尚未被 index.html 接线**，NPCS.aeolus portrait 仍 SVG 兜底）；3D 线 world.js/3d index.html 有改动+polish 截图（细节待 3d/HANDOFF 下轮记账）；本会话终局复跑冒烟全绿（语法/启航/海图/E 登陆风神岛/风袋按钮/4 NPC）；评测侧复跑第六轮断言全绿、v4 数字与 results/README 声明逐项一致（wind_oov 100%、误触发 3.7%、无 429）；README 计数由 241/13 修正为 257/14 并补 ch3_oov 行；**发版门第六次复核仍 RED（v4 全量再证 hades_oov 85.7% < 87.9%）维持不打 tag** ｜ **用法**: 新会话第一句说"先读HANDOFF.md" ｜ 总计划看 `PLAN.md`，**产品定位/路线图/成本账看 `PRODUCT.md`**，评测细节看 `README.md`，剧情看 `odyssey-witch/odyssey-story.md`
> **仓库**: https://github.com/LiliLIN0324/odyssey-ai-npc （public）｜ 3D 线总控账本：`odyssey-witch/3d/HANDOFF.md`

**项目一句话**：为《奥德赛》主题开放世界 AI NPC 游戏打地基——先用 227 条用例量化 Xing4.0-29B-Intent 的意图/填参/误触发能力，再用它 + 通用大模型搭出双层大脑的灰盒原型（女巫喀耳刻）。架构 = 大模型负责"想"，XingIntent 把"想"变成引擎能执行的 `{category, args}` JSON。

---

## 一、已完成

### 1. 意图评测套件（11-05）
- `schema.json`：奥德赛版 30 个意图类别（神话实体自带易混对：塞壬/斯库拉、雅典娜/赫尔墨斯）
- `schema-island-generic.json`：通用岛对照（29 类、无查询神谕、通用词表；**11-07 已实跑**，见 §一.6）
- `cases.jsonl`：227 条用例、12 分组（clear/confuse/boundary/slot_missing/chitchat/oov/hades_oov/multi/negative/multiturn/hostile/state_set）
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
**multi 组五轮实测 53.8%↔61.5%（7/13↔8/13）每轮交替、上限 61.5% 从未突破，是剩下的硬骨头**（多意图拆分是模型能力短板，不是 schema 描述问题；v3 与 v22 同为 schema v2.1 也在两值间摆——单轮 multi 数字别过度解读，±1 条是采样方差）。
Top 混淆对从"查询附近目标→查询地点信息(6次)"降到最高仅 2 次。
`schema-island-generic` 基线对照已于 11-07 实跑（§一.6）。

> **11-07 起 schema.json 已是 v2.4.1 版**（风袋 → ch3 边界专项两轮补丁，见 §一.9）；上表 v1→v2.1 为 213 条用例时期的历史轮次，v2.1 备份在 `.temp/schema-v21-backup.json`。

### 2.5 v0.2.0 发版门实测：冥界词表 OOV 回归 + schema v2.2（11-07，判据 RED 不打 tag）

**流程**：第二章已实装词表（冥界之岸/俄刻阿诺斯之岸、献祭沟、蜂蜜酒/面包/淡水、特瑞西阿斯、亡魂、
冥河、预言/神谕、长路/捷径）新增 `hades_oov` 组 14 条并入 `cases.jsonl`（213→227）→ 天翼全量跑 →
失败归因 → schema v2.2 补丁（**7 类描述 + 1 类 args 共 8 处补强**——描述：给予物品/查询神谕/接取任务/其他意图/闲聊/查询地点信息/查询生物情报；args：给予物品（接收方可填设施名），`.temp/schema_v22_patch.py`，v2.1 备份在 `.temp/`）→ 复测。

| 指标（227 条） | v3 首跑（schema v2.1 未动） | **v2.2 复测（当前 schema.json）** | 判据 |
|---|---|---|---|
| **hades_oov 类别准确** | 50.0% | **85.7%（12/14）** | oov 组同轮 92.9% − 5pp = 87.9% → **RED，差 1 条** |
| 整套类别准确率 | 90.8%* | **92.1%** | 与 v2.1 时期 93.0% 持平 |
| 完全正确率 | 77.5%* | 79.7% | 仍差 80% 线 0.3pp |
| 负例误触发 | 7.7%* | **3.8%**（唯一误触发是既有 oov_12） | <10% ✅ |
| P50 / P99 | 879 / 1483ms | 866 / 1374ms | 同日 v2.1 复测 P50 879ms → v2.2 加长代价可忽略；较前日 1169ms 的下降是时段波动 |

\* 含 429 限流失败，已按坑 1 流程单并发补跑修复后汇总。快照：`results/teleai-v3-hades-20261107.json`、`teleai-v22-hades2-20261107.json`。

**剩余 2 条 hades 失败的定性（为什么不再磨）**：hades_14"献祭沟在哪"→查询地点信息、
hades_07"怎么渡过冥河"→导航到地点——前者就是全仓库头号混淆对"X在哪"三向边界
（导航/附近目标/地点信息；boundary_07"提洛在哪"每轮同翻，**既有弱点非第二章特有**），
后者期望本身在薄边界上（模型答导航站得住）。都不是干净的描述缺口，继续调有过拟合 2 条用例、
扰动 213 条基线套件的风险（v2.2 已扰动 boundary_18"喝"一次），留待 v2.3 与"X在哪"专项一起处理。
**教训**：新章节词表首轮大面积翻车是流程预期（50%），"先跑→归因→补 schema→复测"一轮就能回收大半。

### 3. 游戏原型 `odyssey-witch/`（11-06 深夜，第一个"活 NPC"灰盒）
- 纯 Web 技术栈：`index.html`（Canvas 2.5D，**3343 行**，风神岛插章+声之海峡场景后，见 §一.7；第二章实装后 1656 行；11-06 首版 1127 行）+ `server.py`（零依赖 Python 本地服务，key 只留服务端）
- 双层大脑已跑通：玩家输入 → `/api/parse`（XingIntent，T2）→ 30 类 handler 本地结算（金钱/背包/任务/状态真实变更）→ 低置信落 `/api/chat`（TeleChat3-438B，T3 女巫人格台词 ≤55 字）
- 已实装内容：世界地图（地中海驾船）+ 埃亚岛（2.5D 挤出瓦片、y 排序遮挡）；采玛草任务链（接/查进度/交/弃，含野猪 3 币彩蛋）、野猪战斗（E 键本地结算数值，死亡→屋外复活扣 5 币）、买卖/装备/消耗品/状态查询、祭坛彩蛋
- 包装层（11-07 凌晨最后一批工作）：标题屏（继续/新开）、章节过场卡（概念图 + 3s 自动跳过）、对话立绘（dlgPortrait）
- 叙事资产：`odyssey-story.md`（八章剧情圣经，第一章已实装，后续章剧本全写好）、`odyssey-lore.md`（知识库红线）、`odyssey-visual.md` + `concept-art/`（7 场景图在根目录 01~07 + 6 角色图在 `characters/` 子目录；07-冥界之岸为第二章新增）
- 存档：localStorage，key `odyssey-med-v2`（版本化落在 key 名上、存档对象内**无 version 字段**，v1 旧 key 由 migrate() 一次性迁入；PLAN「version 字段从第一天就有」一项如实记未做，save-systems 原则按此轻量遵守）

### 4. 3D 线 `odyssey-witch/3d/`（11-07 定向，P0/PD/P1 已完成）
- **已拍板**：不走 Godot 迁移，改做 **Three.js 浏览器 3D 垂直切片**（埃阿亚岛一岛），与 2D 版并行、2D `index.html` 不动（方法论来自 Sac《小王子：星辰之旅》16 天工作流转译）
- **`3d/HANDOFF.md` 是 3D 线唯一总控与进度账本（P0–P7 + PD 九阶段，含验收命令/目录契约/数据契约）**——3D 相关一律以它为准，本节只是摘要（体检脚本会打印 §0 供比对）
- **P0 ✅**：`3d/app/` Vite + three 骨架（three ^0.170 / vite ^5，构建 488.8 KB gzip 122.8 KB）；加载页（渐变+标题）+ 占位场景 + `palette.js` 色板常量
- **PD ✅**：Cloudflare Pages 已上线 **https://aeaea-3d.pages.dev**（`npm run deploy` 直传；`wrangler.toml`/`_headers` 已配；回滚见 3d/HANDOFF §8.3）
- **P1 ✅**：程序化世界全量落地——noise.js 种子噪声、岛体 fbm 顶点色、三档海色 + 金色光路 shader、天空穹顶暖光、黄昏金平行光、双档绿草卡、火堆粒子、debug HUD。实测 @1280×720：**fps 108 ｜ tris 44.0k ｜ calls 5**（预算内）；验收截图 `3d/tools/shots/p1-persp.png`。ShaderMaterial sRGB 踩坑见 §四-10
- 待办：**P2 资产生产**（唯一需要用户动手的阶段：A1/A2 参考表 prompt 在 `PIPELINE.md` §2，生成后 Tripo 提交）；P3 组装前置 P2，但 P4 角色控制可用占位胶囊先行；`tools/clean_asset.py`、`tools/review_shots.py`（Blender 4.x）已就绪
- **（11-07 傍晚未记账改动，待 3D 会话补账）**：3d/app/src/world.js 有 P1 遗留项 polish（①草叶"芯片感"→收尖叶片；②天水交界缝→地平线取雾色本尊；火粒 additive 堆白→顶点色渐变）+ favicon 进 3d app（`public/ui/`）+ 截图 `shots/3d-polish.png`/`3d-scene-polish.png`——**3d/HANDOFF.md 尚未更新**，阶段状态无变化（仍 P0/PD/P1 ✅），仅 polish 事实待其 ledger 记录

### 5. 第二章冥界（2D）实装 + 剧情圣经全章补全（11-07）
- **第二章·冥界已实装**（并行会话完成，实机截图 `shots/hades-final.png`）：冥界之岸（俄刻阿诺斯之岸）+ 献祭沟（蜂蜜酒+面包+淡水，跨岛采买）+ 特瑞西阿斯二选一预言（`state.prophecy` flag，「查询神谕」意图）
- **剧情圣经全章补全**（`odyssey-story.md`）：序幕~终章全部配齐原版骨/自由肉/故事弧/任务树/新机制；三条暗线给出种植→收束对照；新增**名字机制**（自称/旧名/被唱出的/新写的，终章认名）与**结局矩阵**（4 维 flag 拼装判词，10 个段落模块）；第六章 NPC 笔误更正（玛西亚雅→瑙西亚娅+德摩多科斯）；每章带"实装清单"硬性交付
- 品牌资产：IP 立绘（无名旅人/喀耳刻）、奥德赛徽章、三张地图概念图（并行会话产出）
- OOV 回归发版门实测：见 §2.5（判据 RED，未打 tag）

### 6. 通用岛 schema 对照首跑（11-07，HANDOFF §三.6 顺手项清账）
- 同 227 条奥德赛用例换 `schema-island-generic.json`（29 类、无查询神谕、通用词表）：
  **类别 68.7% / F1 82.2% / 完全正确 62.1% / 误触发 30.8% / P50 707ms**
  （快照 `results/generic-baseline-20261107.json`；神谕类用例在通用岛下无可匹配类别，分差含此结构性成分）
- 结论：**schema 词表与描述必须随章节内容演进，不能通用复用**——PRODUCT §8"每章词表进评测集"
  流水线从纪律变成实测结论。README"为什么是奥德赛主题"一节已按实测改写（原"乐观基线"说法过时）。

### 7. 风神岛插章批次：暗线③落地 + 音效/多任务账本/声之海峡开篇（11-07 16:01~16:37，并行会话产出；十二次微补体检入库、十三次微补终局定稿）
- **来源与验证**：并行会话持续写入 `index.html`（1656→**3343 行**）+ favicon ×2 + 塞壬/斯库拉/埃俄罗斯立绘 + 风神岛图，未留 HANDOFF 记录；
  本会话接手后查清定性 → `node --check` 语法体检 ✅ → **两轮实机冒烟 ✅**（16:01 版与 16:37 终版各一轮：启航→世界图→M 海图→E 登陆风神岛→
  风神岛渲染（云海浮岛/风牢笼/南风标记/埃俄罗斯 NPC）→风袋按钮在位，全绿）→ 才提交入库
- **风神岛（aeolia）新场景**：云海漂浮岛 + 风神埃俄罗斯 NPC（PERSONA_AEOLUS，"一次放一阵，贪念会把它们一次放光"）+
  4 处"释放囚禁的风"风牢笼（`state.windFreed[4]`）+ 风之祭坛 + 乘云梯下海；落的是剧情圣经**暗线③"风袋"**，
  **圣经已由并行会话补「插章·风神岛·风的账」（增补·已实装）**——§二.9 对账项①已闭
- **风袋玩法**（插章奖励）：归还风袋祭坛得风袋 → 世界地图 HUD「风袋」按钮或对 NPC 说「用风袋」→ 消耗 1 阵顺风航速倍增 60s，
  贪念用光触发埃俄罗斯警告写入记忆流（暗线③收束预埋）
- **多任务账本**：`state.quests{}` 取代单任务槽（现有 witch_grass / aeolia_winds 两任务），旧档 migrate() 自动迁移
  （"释放四风"→aeolia_winds，其余→witch_grass），只加 migration 不坏老档（save-systems 原则）；存档 key 不变 `odyssey-med-v2`
- **state 新字段**：affinity（喀耳刻好感 0..100，dialogue-systems 关系变量）、clock（游戏内分钟，HUD 显示"上午 09:00"）、
  memory（NPC 记忆流，Generative Agents 式）——旧档 migrate() 补默认值
- **WebAudio 音效系统**（零依赖，audio-design 方法论）：总线 sfxGain/ambGain、10 种 SFX（attack/hurt/dash/alert/die/cook/pick/level/warn/bless）、
  ±6% 变调去"机枪感"、环境层按场景切换（海浪+风/冥界低鸣/近篝火/海面鸥鸣）、对话/标题/章节卡时 ducking 降 0.2、🔊/🔇 开关
- **多 NPC 框架**：`NPCS` 配置表现 4 位 {witch, seer, aeolus, **siren**}（注释约定：新增岛屿只在此加一项人格 prompt），agent 仍是两层（意图解析+台词）；
  塞壬立绘（07-塞壬.jpg）已接线；**埃俄罗斯立绘 09-埃俄罗斯.jpg 已生成但 index.html 未接线**（NPCS.aeolus portrait 仍 null，云海渐变+风纹 SVG 兜底）
- **第三章·声之海峡场景开篇**（部分实装）：scene `strait`（斯库拉海峡地图、卡律布狄斯漩涡 K 瓦片），塞壬相关实机截图 `shots/strait-final.png`；
  未完部分是下一会话的工作面
- **标题屏升级**：全幅概念图（幸存者抱桅远望孤岛）+ 双按钮「继续航程/从头开始」（带存档预览行）+ favicon
- **M 键海图** + **favicon**（`concept-art/brand/favicon.png` ×256 + `favicon-32.png`，3 个 link 标签）
- 评测联动见 §一.8：wind_oov 组 14 条（v4 首跑 100%）+ schema v2.3（使用消耗品 args 补"风袋"）

### 8. 评测线跟进：wind_oov 首跑 + 16 条待评测清单（11-07 傍晚，并行会话产出、十三次微补记账）
- **v4 全量快照** `results/teleai-v4-wind-20261107.json`（241 条 13 组时点，workers=2 一次跑完无 429）：
  类别 92.1%（持平）/ 参数 F1 91.9% / 完全正确 79.7% / 误触发 3.7% / P50 779ms；
  **wind_oov 首跑 14/14 = 100%**（词表随章节预埋流水线再次验证）；confuse 87.5%（-4.2pp，"埃俄罗斯岛在哪"叠上"X在哪"三向边界既有弱点）；
  multi 53.8%（五轮交替值再现，非退化）；**hades_oov 85.7% 未动 → 发版门第六次复核仍 RED**
- **16 条已加未评测**（16:36 增补，v4 之后）：hades_15「我要去俄刻阿诺斯之岸」+ hades_16「把面包放进献祭之沟」（正是 §三.3 两个顺手项落地）+
  ch3_oov 14 条（第三章声之海词表：塞壬海域/蜡/桅杆/歌词残页/卡律布狄斯）。**ch3 对应 schema 词表还没补**（蜡/桅杆/歌词残页 ×0）——
  首跑大面积翻车属流程预期（坑 13），下一步按 §2.5 流程走"首跑→归因→补 schema→复测"
- README 计数已同步（257 条/14 组/ch3_oov 行）；`results/README.md` 对照表已由并行会话补 v4 行与结论块

### 9. 评测线 v2.4/v2.4.1 完成：ch3 回归全绿 + 发版门转绿（11-07 傍晚，评测线会话产出）
- **分工背景**：游戏线并行会话在 index.html 做相机/存档/任务总线修复（§二.9⑤ 两处瑕疵已由其相机重构+底色根治，本会话实机复核通过，
  前后对比截图 `shots/2d-void-fix-before-strait.png` / `2d-void-fix-after-strait.png`），本会话接手其留下的评测工作面（§一.8）
- **首跑→归因→补 schema→复测全流程走完**：ch3 首跑 78.6%（5 失败）→ **v2.4**（6 类描述补强 +
  ch3_chat01 期望透明修正：与 clear_bio_01/confuse_16 同族，均应归查询生物情报，快照 meta 留痕）→
  单并发探测发现 3 条稳定回退（2/2 复现才动刀，hades_04 探测 2/2 通过判为方差不动）→ **v2.4.1**（4 类收口：
  捎话≠求助 / 夸口要求归其他意图 / 放进设施=献祭）→ **终局全绿**
- **终局指标（257 条，result-ch3-v241.json，0 error）**：类别 **94.2%** 历史新高 / F1 92.8% /
  **完全正确 82.1% 首次跨过 80% 线** / 误触发 **3.3%** 历史最低 / P50 809ms（加长 +150 字符代价可忽略）；
  **ch3_oov 100%（14/14）、hades_oov 100%（16/16，含 hades_07/hades_14 两块历史硬骨头）**、wind_oov 100%、
  multi 61.5% 首次摸到上限；剩余 15 条失败均为既有已知难点（boundary_07/18、confuse_10/19、multiturn 应答词、
  multi 上限内、slot_missing 给/脱单字、oov_12）
- **v0.2.0 发版门判据全绿（hades_oov 100% ≥ 87.9%）**——打 tag 与回填 PRODUCT §7 由下次会话执行（本会话不抢）
- 快照 `results/teleai-v5-ch3-20261107.json` + README 对照表 v5 行；补丁脚本与两版备份在 `.temp/`（schema_v24_patch.py /
  schema_v241_patch.py / schema-v23-backup.json / schema-v24-backup.json / cases-pre-ch3fix.jsonl）

### 10. 游戏技能补全批次：视觉/玩法/Agent 三线（11-07 晚，游戏线会话产出）

**依据**：用户要求"根据本地的优秀的游戏的 skills，补全游戏的视觉、玩法、agent能力"。技能库在 `C:\Users\13266\.agents\skills\`（80+ 游戏 skill），消化 18 个相关项后落地 `index.html`（3343→**3685 行**）：

- **视觉（camera-systems/game-ui-ux/animate/review-animations/procedural-gen）**：
  - ★**相机锚点根因修复**：`cam.x/y` 本是"屏幕中心"语义（loop 里 `translate(ccx,ccy)` 后 `-cam.x`），钳制却按左上角写 → 登陆点靠西时左半画布 void、岛东侧永不可见（§二.9⑤ 瑕疵①的根因）。统一为中心锚点钳制（`cam∈[vw/2, b-vw/2]`，景小于视口整景居中）+ 死区 42×26px + 速度前瞻 ≤64px 缓入缓出 + 传送硬切吸附（>500px 跳变）+ `sceneBackdrop()` 岛外底色。实机像素采样：左缘 rgb(65,119,152) 水色（修复前 body 底色 rgb(11,21,38)）；俯瞰整景居中实测 tx=400/ty=248.5。
  - 动效标定：`#dlg` 入场 240ms `cubic-bezier(0.23,1,0.32,1)`、气泡 180ms ease-out、按钮 :active scale(.97)、`prefers-reduced-motion` 降级；海图打开时 `.hud/#zone/#keys` 淡出让位（修 `#mapClose` 压 HUD 按钮，§二.9⑤ 瑕疵②的实锤修法）。
  - 埃亚岛补齐边缘暗角（此前仅冥/风/峡有）；世界图加两层速度差视差云影（种子随机可复现）；对话加打字机（~0.75s 封顶，历史回放 instant）。
- **玩法（game-feel/rpg/save-systems/input-systems/game-ai）**：
  - game-feel 三档对齐：small 0.15 / medium 0.40+55ms / large 0.80+110ms。
  - 任务系统数据化：`QUEST_DEFS` + `acceptQuest()` + `questEvent(kind,data)` 事件总线（collect/wind 驱动）+ `ready`（可交付）/`turned`（已交付）状态机（HUD/任务面板三态展示）；**set-once**：提交以 `q.done&&q.turned` 守卫，实机二次提交被拒（"已经结清了，别想多领一份"）。
  - 存档 v3：对象内 `v:3` + 未来版本拒绝 + 主档写前留 `.bak` 双份 + `parseSave` 最小校验（localStorage 无 rename，双份即原子写等价物）。
  - E 键输入缓冲 0.12s（远处预按走进范围自动触发，实机 grass 0→1）；dt 钳制此前已有（`Math.min(dt,0.05)`，本次核实留档）。
  - 清理 interact() 内 aeolia dock/wind/altar 整段重复死代码。
- **Agent（dialogue-systems/ai-behavior-trees-utility-ai）**：
  - **NPC 主动开口**：`AMBIENT` 表（4 NPC × 4-7 条情境台词，cond 门控引用 affinity/clock/quests/memory）+ `npcAmbientTick`（1.2s 决策步、权重排序、单句 90s 冷却、180px 距离门控、说完停一轮防接龙）+ `renderAmbient`。零模型调用。实机：接玛草任务靠近女巫 → "草还差 3 株——别在林子里晃到天黑。"。
  - **记忆流可视化**：对话头部「记忆」按钮 → `#memStrip` chips（`recallMemories(6,currentNPC)`）；副标题追加"记得你的 N 件事"。
  - **意图覆盖审计**：`HANDLED` + `NPC_JOB_MAPS`（人格引导表补满：seer 19 类/aeolus 17 类/siren 19 类，全部带人设口吻）+ `auditHandlers()`（覆盖 = handler ∪ 有人格引导）。启动对账 **30 类 × 4 NPC 全覆盖 ✓**（schema v2.4.1 类别集不变，仅描述改动，账本不受影响）。
  - **风神立绘接线**：`NPCS.aeolus.portrait = "characters/09-埃俄罗斯.jpg"`（实机 200 + 目检通过；`.aeolusPortrait` 渐变保留为加载失败兜底）→ §二.9③ 三图未接线已闭一张。
- **验收**：node --check ✅；Playwright 实机冒烟全绿（标题→相机死区/前瞻数值→东西边界钳制→void 像素采样→风神岛立绘对话→记忆条开合→海图 HUD 让位→俯瞰居中→E 缓冲→任务状态机→野猪普攻-10/弱点暴击-18/trauma 0.15→ambient 决策渲染→存档 v3+bak）。
- **坑（新）**：Edit 工具 oldString 含模板字符串（反引号+`${}`）时匹配会在该行截断、替换只吃前缀留孤儿尾（本会话两次复现）——**含反引号模板块的编辑用 Python/PowerShell 按行号操作，改完必跑 node --check**。

### 11. 三线补全验收 + 出峡刷历练修复 + 风神岛章节卡接线（11-07 晚，本会话）

- **接手背景**：用户再提"按本地游戏 skills 补全视觉/玩法/agent"——核实 §一.10 批次已完成且特性全部在场（AMBIENT/npcAmbientTick/QUEST_DEFS/questEvent/acceptQuest/memStrip/auditHandlers/SAVE_VERSION=3+.bak/prefers-reduced-motion/NPC_JOB_MAPS，语法体检 exit=0），不重做；转做增量：验收并行新场景 + 剩余视觉缺口。
- **实机冒烟验收（第三章声之海峡 + 第四章太阳岛，Playwright 坐标路径）**：太阳岛全链 ✓——圣火空手提示/钓鱼 60%/海藻/山泉（渴度回满）/圣牛对话（PERSONA_CATTLE 完整注册，5 NPC）/黄昏祭坛报名字（黄昏=时钟 1020~1190；冒名"奥德修斯"被听穿 ✓、真名得「走得过黑暗的光」+章节卡"光" ✓）/宰牛二段确认（sunWrath+牛肉×2+饥饿回满）✓；海峡链（蜡封耳→斯库拉付价→出峡）由并行会话实机触发、记忆流逐条还原 ✓，takeShine 按价值吃 6 件复核一致。全程控制台 0 error；截图 `shots/2d-sun-island-smoke.png` 等 3 张。
- **修复：出峡 exit 点缺 set-once 守卫**——straitStage>=2 后每按 E 白给 +25 历练+写记忆（记忆流坐实连按 7 次连升 2 级）；补 `straitStage>=3` 守卫 toast，实测 xp/记忆不再增长。其余交互点（蜡/桅杆/斯库拉/祭坛/宰牛/风牢）守卫齐全。
- **视觉补全：风神岛章节卡接图**——`showChapter(null,…)` → `concept-art/maps/04-风神岛图.jpg`（预加载列表同步），实机验证 cardBg ✓，§二.9③ 收口。index.html 现 **4109 行**。
- **多会话实时并行观察（新坑预警）**：18:18~18:21 有另一会话在同一存档上实机操作（记忆流时间线 + 18:22 新 node/chrome 进程坐实）；index.html 18:11:29 被并行写入（行数不变，本会话编辑未受损）。**接手前查 mtime、编辑前重读目标行、提交前再查 mtime**，三步缺一不可。

---

## 二、卡住的问题

1. **（11-07 晚已大幅收敛）**：类别 **94.2%**（v2.4.1，257 条）✅、误触发 **3.3%** ✅、**完全正确 82.1% 已跨过 80% 线** ✅。剩：**multi 组 53.8%↔61.5% 交替、本轮摸到上限 61.5%**——一句话多意图拆分是模型能力短板，schema 描述已到头，考虑游戏侧引导玩家分句说；**"X在哪/怎么过X/住哪座岛"薄边界**还有 4 条稳定难点（boundary_07/confuse_10/confuse_19/boundary_18），收益递减，建议接受现状或游戏侧引导。
2. **v0.2.0 发版门（11-07 晚）：判据 GREEN，可打 tag**——hades_oov 100% ≥ 判据线 87.9%（v3 首跑 50% → v2.2 85.7% → v2.4.1 100%，含 hades_15/16 别名用例）；ch3_oov 同公式也 100% 过线。**打 tag + 回填 PRODUCT §7 由下次会话按流程执行。**
3. **对话节奏（时段波动大，按实测规划）**：Intent P50 同一 schema 隔天测出 1169ms（11-07 凌晨）与 866-879ms（11-07 白天），P99 最高 2836ms——**别按单次实测设计节奏，按 P99 ≥2.5s 兜底**。PRODUCT §7 v0.4.0 的 P50<600ms 判据仍差得远，schema 瘦身（§三.3）不动摇。v2.2 加长的 8 处（7 类描述+1 类 args）在同日对照下代价可忽略（879→866ms）。
4. **多会话并行写入同一工作区**：初始 git 提交只是某刻快照，接手任何文件前先确认现状（11-07 教训：HANDOFF 曾落后 3D 线两个阶段、评测调优两轮的数字也没进 HANDOFF——本次四次修订才补上）。
5. 3D 线 P2 参考表卡在图像生成（prompt 在 PIPELINE.md §2，需要用户侧操作）；Tripo 资产未提交。
6. （已处理 11-07）根目录 18 张未引用截图/贴图残片归档 `shots/`，误建空目录 `-p/`、`copy/` 已删；以后会话产物别丢在根目录，体检脚本会盯（§六）。
7. （已处理 11-07）**评测证据只在本机**：`result-*.json` 被 gitignore，仓库里查无此数——已把三轮 summary 快照入库 `results/`（含对照表 README），复测请提新快照，别覆盖。
8. （新增 11-07）**天翼 429 在 workers=3/4 下仍会撞**（v3 撞 14 条、v22 撞 3 条、generic 撞 2 条）：全量跑完先查 `error` 字段，用 `.temp/rerun_*_failed.py` 模式单并发补跑合并，别直接采信带 error 的 summary——三个快照都是补跑后才提的。
9. （11-07 傍晚风神岛批次对账，十三次微补终局更新）**遗留对齐项**：① ~~圣经没有风神岛~~ **已闭**——并行会话已补「插章·风神岛·风的账」；② 风神名字在圣经内两写（原版骨引荷马作"埃俄斯"、自由肉/游戏用"埃俄罗斯"），插章内混用，建议下轮圣经通稿统一；③ **三张新图未接线 → 已全部收口**——`NPCS.aeolus.portrait` 已接（§一.10）；塞壬 `07-塞壬.jpg` 此前已接；`08-斯库拉.jpg` 已接进"六头·付价"章节卡、`maps/04-风神岛图.jpg` 已接进风神岛章节卡（§一.11，实机验证通过）；④ **16 条用例待评测 + ch3 schema 词表未补**（见 §一.8，下一步评测工作面）；⑤ 两处小瑕疵（十二次微补冒烟目检遗留，终局冒烟未复核）：风神岛场景画面左侧 void 黑区（疑似相机边界）、顶部"点击任意处跳过"提示与 HUD 重叠；⑥ 自动化冒烟怪癖（不影响真人游玩）：新标题屏的按钮用 DOM locator 点击会超时，坐标点击/真人鼠标正常——写自动化测试时走坐标路径。

---

## 三、下一步计划（双线并行，互不阻塞；先推哪条由用户定）

**3D 线（odyssey-witch/3d/，P0/PD/P1 ✅，阶段账本见 3d/HANDOFF.md §0）**
1. **P2 · 参考表与资产**：A1（场景多视角）/A2（角色四视图 T-pose）prompt 已写好在 `PIPELINE.md` §2，需用户拿去图像模型（即梦/MJ/GPT-Image）生成 → Tripo 提交（唯一需要用户参与的阶段；P4 角色可先用占位胶囊，不阻塞）
2. **P3 · 场景组装与盲评**：前置 P2（或角色占位）；GLTFLoader + LAYOUT 常量表按参考图摆位，≥2 轮独立盲评，任务在 `3d/HANDOFF.md` §4-P3

**2D 线（评测 + 剧情）**
3. **schema 瘦身（延迟回收）+ multi 专项**（下一程，瘦身前先把 v2.3 边界专项做掉）：
   - **v2.3 候选：修"X在哪"三向边界**（§二.1/二.2，收益覆盖 boundary/confuse/hades 三组）+ hades_07"怎么渡过X"求助/导航边界；修完判据线过了才谈 v0.2.0
   - v2.3 顺手项（11-07 体检复核发现）：游戏内正式地名「**俄刻阿诺斯之岸**」（index.html 出现 7 次、story 1 次）评测集只覆盖了俗称「冥界之岸」（hades_01）——补 1~2 条别名用例进 hades_oov，同时确认 schema 导航/查询类描述能兜住正式名（schema 里两名字都没写，全靠泛化）
   - v2.3 顺手项补充（11-07 内容级对账）：① ~~俄刻阿诺斯之岸/献祭之沟无用例~~ **已落地**——并行会话已加 hades_15「我要去俄刻阿诺斯之岸」/hades_16「把面包放进献祭之沟」（16:36，随 §一.8 的 16 条待评测一起跑）；② index.html「献祭之沟」变体现在 ×2（HSPOTS 标签"献祭之沟（倒祭品）"），hades_16 已覆盖；③ **世界地图目的地导航用例零覆盖**——cases 里唯一真实地名是伊萨卡 ×3，游戏地图的太阳岛/克里特岛/西西里岛/第勒尼安海等 6 海域均无用例（intent 层「去X/X在哪」可泛化、风险低，仅记录；下次加组时顺带抽 1~2 条，祭坛/松林等岛内小地名同理）
   - v2.2 准确率的代价可控（同日对照 P50 879→866ms），但 v0.4.0 判据 P50<600ms 仍要瘦身：裁剪 description 冗余、压缩枚举列表
   - **完全正确 79.7%→80%+**：差 0.3pp，从 v22 失败清单里挑可修的
   - multi 组 53.8%↔61.5% 交替、上限未破：先分析失败模式（拆分缺失 or 参数张冠李戴），再决定是游戏侧引导分句还是接受现状
   - 用 `eval.py --group multi,hades_oov,oov` 小组快跑迭代，瘦身复测跑全量并对 `results/` 提新快照
4. **第三章·声之海（2D）**：剧本已补全（`odyssey-story.md`）——塞壬日志歌词（分享时刻预埋）、物品级代价（六头吃背包）、斯库拉接话"不怪你"；**11-07 傍晚已开篇**：声之海峡场景部分实装（scene `strait`、siren NPC、塞壬立绘已接）+ `ch3_oov` 组 14 条已加——**下一步就是 §2.5 流程跑一遍**：首跑（预期大面积翻车，蜡/桅杆/歌词残页不在 schema）→归因→补 schema 词表→复测→对判据
5. **v0.2.0 发版门（tag 纪律）——11-07 实测：判据 RED，不打 tag**。交互判据（三条冥界交互走通）✅；OOV 判据 hades_oov 85.7% < 87.9%（差 1 条）。走 §三.3 v2.3 专项，复测全绿才打 `v0.2.0` 并回填 PRODUCT.md §7。**判据不绿不打 tag**（v0.1.0 已在远端，别动）
6. （已完成 11-07）`schema-island-generic.json` 基线对照已实跑：68.7% vs 奥德赛 92.1%，README 已改写，快照在 `results/generic-baseline-20261107.json`。

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
11. **schema 调优是准确率/延迟的交易，且会扰动无关用例**：v2.1 给 24/30 类补边界句换来 77%→93%；v2.2 冥界补丁把 hades_oov 50%→85.7%，但 boundary_18"喝"（单字）从对翻错——单字/薄边界用例本身方差大。每次改 schema 必须**同时复测准确率和延迟（全量跑）**，并对老分组做回归比对（v22 快照 vs v21 快照逐组看）。
12. **result-*.json 被 gitignore，"勿覆盖"管不住换机器**：仓库内证据只有 `results/` 的 summary 快照。复测新文件名跑完后，把 summary 块提一条新快照进 `results/` 并更新其 README 对照表。
13. **新章节词表首轮评测翻车是流程预期，别慌也别硬调**：hades_oov 首跑 50%，一轮"归因→补 schema 描述→复测"回收大半（85.7%）。但期望值要对着 schema 既有边界设计（hades_14"献祭沟在哪"首版期望设成导航，与 schema"码头在哪→查询附近目标"既有规则打架，跑后修正留痕）；跑完发现期望错了要**透明修正**，不许为了让判据变绿而改期望。
14. **429 补跑后才准提快照**（见 §二.8）：全量 summary 里只要还有 `error` 字段，数字就是被污染的。

---

## 五、文件地图 & 启动速查

```
PLAN.md                  总计划：四层决策栈 T0-T3、P0-P4 阶段、风险清单
PRODUCT.md               产品计划：北极星/画像/竞品/版本路线图（带判据）/成本 token 账/GTM/合规/风险登记册/待拍板决策点
README.md                评测套件文档（指标定义、分组、调优顺序）
schema.json / cases.jsonl / eval.py / fake_server.py
                         （schema.json 已是 v2.4.1：hades_oov/ch3_oov 双 100%、完全正确 82.1%；v2.3/v2.4 备份 .temp/schema-v23-backup.json / schema-v24-backup.json，更早 v2.1/v1 备份同目录）
schema-island-generic.json   通用岛对照（已实跑：68.7% vs 奥德赛 92.1%，见 results/）
result-*.json            各轮全量结果（v3/v22/generic 为本轮三份），体积大被 gitignore、只在本机（勿覆盖，复测用新文件名）
results/                 ★评测证据入库处：六份 summary 快照 + 对照表 README（仓库内查数字以它为准）
key.txt                  天翼 API key（gitignored）
shots/                   2D/评测线截图归档（实机验证用；3D 线截图在 3d/tools/shots/，不入库）
odyssey-witch/
  index.html             游戏全部前端（地图/渲染/对话/30类handler/存档；第二章冥界+风神岛插章+声之海峡开篇已实装，3343 行）
  server.py              本地服务 :8765（静态托管 + /api/schema|parse|chat 代理）
  启动游戏.bat + start-service.vbs   一键启动（vbs 静默拉起 server.py）
  odyssey-story.md       剧情圣经（八章全写完：第一章+第二章已实装）
  odyssey-lore.md        知识库（神话事实红线）
  odyssey-visual.md      视觉稿（3D 线的色板来源）
  concept-art/           7 场景（根目录 01~07，07-冥界之岸为第二章新增）+ characters/（9 角色：原 6 + 07-塞壬/08-斯库拉/09-埃俄罗斯，后两张未接线）+ brand/（IP 立绘×2+徽章+favicon×2）+ maps/（世界/埃亚岛/冥界之岸/风神岛图 4 张）
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

> **内容级对账（机械 8 项之外的定期项）**：改动 index.html / 资产 / 用例后，对一遍 §一 的硬计数（index.html 行数、concept-art 图数、cases 总数与分组）和 README/PRODUCT 里的关键数字——11-07 曾漂移两处（1127→1656 行、6→7 场景图）。可参照 `.temp/` 历轮审计脚本（本机，不入库）的思路：`audit_handoff.py` + `audit_1107_second/third/fourth/fifth/sixth.py`——计数 + 地名在场性 grep + 快照 summary/延迟逐值断言（fifth 版已把六快照数字做成自动 PASS/FAIL，可直接复跑；sixth 版补失败用例身份/扰动/误触发/远端 tag 四类逐条核验）。

> AI生成
