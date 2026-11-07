# HANDOFF — xing4-npc-eval 跨会话交接

> **更新**: 2026-11-07 · 五次修订（**v0.2.0 发版门实测**：第二章冥界词表 14 条并入评测集（227 条/12 组）→ 首跑 50% 判据深红 → schema v2.2 补丁复测 85.7% 仍差判据线 2.2pp → **不打 tag**；通用岛基线对照首跑，结论入 README；五次微补：体检复核发现游戏正式地名「俄刻阿诺斯之岸」无评测用例，列入 v2.3 候选，见 §三.3）；**六次微补（内容级对账）**：§一.3 两处计数漂移修正（index.html 1127→1656 行、场景图 6→7），「献祭之沟」变体与世界地图地名导航零覆盖并入 v2.3 顺手项，见 §三.3/§六）；**七次微补（内容级对账·第二轮）**：§2.5 补丁口径修正（「8 处描述」实为 7 类描述+1 类 args）、multi 组「三轮不动」修正为 53.8%↔61.5% 五轮交替（7/13↔8/13，上限未破）；其余硬计数/地名/快照数字/PRODUCT/README 交叉复核全部一致；**八次微补（内容级对账·第三轮，11-07）**：30+ 项声明复核全绿（cases 227/12 组、index.html 1656 行、六快照 summary+延迟逐值、multi 五轮交替 53.8↔61.5、弱组四组、concept-art 7+6+3+3、地名计数、story 八章+勘误在案、PLAN/PRODUCT/README 交叉一致），仅两处口径修正——存档「version 字段」实为 key 名版本化（`odyssey-med-v2`，对象内无字段）、§一.2 v2.2 指路笔误（§一.6→§一.2.5）；**九次微补（内容级对账·第四轮，11-07）**：机械体检 8 项全绿 + 30+ 项硬声明逐值复核全绿（六快照 summary/延迟/multi 五轮/弱组/cases 227·12 组·hades 14 条/index.html 1656 行/地名计数/story 八章+勘误/schema 30+29 类/文件在场性/results 对照表六行），唯一缺口是 §五 文件地图漏记 `concept-art/characters/`（角色图 6 张在子目录、场景图在根目录），已补记；发版门判据复核仍 **RED（85.7% < 87.9%）**，维持不打 tag；**十次微补（内容级对账·第五轮，11-07）**：零缺口轮——机械体检 8 项全绿 + 第五轮自动断言全绿（六快照 summary/延迟逐值、multi 五轮 53.8↔61.5、弱组四组、cases 227·12 组·hades 14 条、index.html 1656 行·地名计数·存档 key、schema 30+29 类、资产 7+6+3+3、story 八章+勘误、README/PRODUCT/results-README 交叉），另抽查死亡复活逻辑（index.html:455-459 扣 5 币送女巫屋外）与 odyssey-witch 目录逐文件比对 §五 无漏记；发版门第三次复核仍 RED（85.7% < 87.9%，差 1 条）维持不打 tag ｜ **用法**: 新会话第一句说"先读HANDOFF.md" ｜ 总计划看 `PLAN.md`，**产品定位/路线图/成本账看 `PRODUCT.md`**，评测细节看 `README.md`，剧情看 `odyssey-witch/odyssey-story.md`
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

> **11-07 起 schema.json 已是 v2.2 版**（冥界词表回归补丁，见 §一.2.5）；上表 v1→v2.1 为 213 条用例时期的历史轮次，v2.1 备份在 `.temp/schema-v21-backup.json`。

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
- 纯 Web 技术栈：`index.html`（Canvas 2.5D，1656 行，第二章实装后；11-06 首版 1127 行）+ `server.py`（零依赖 Python 本地服务，key 只留服务端）
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

---

## 二、卡住的问题

1. **（11-07 调优后大部分已解决，剩两小块）**：类别 92.1%（v2.2，227 条）✅、误触发 3.8% ✅。剩：**完全正确 79.7% 差 0.3pp**（≥80% 线上）；**multi 组 53.8%↔61.5% 五轮交替、上限 61.5% 未破**——一句话多意图拆分是模型能力短板，schema 描述已到头，再磨收益低，考虑游戏侧引导玩家分句说；**"X在哪"三向边界**（导航/附近目标/地点信息）每轮稳定掉 2-3 条（boundary_07/hades_14），是下一个值得专项的混淆簇。
2. **v0.2.0 发版门 RED（11-07）**：hades_oov 85.7% < 判据线 87.9%（差 1 条），**未打 tag**。详见 §2.5。v2.3 方向：先修"X在哪"三向边界（收益覆盖 boundary+confuse+hades 三组），顺带 hades_07"怎么渡过X"边界；**判据全绿才打 tag**。
3. **对话节奏（时段波动大，按实测规划）**：Intent P50 同一 schema 隔天测出 1169ms（11-07 凌晨）与 866-879ms（11-07 白天），P99 最高 2836ms——**别按单次实测设计节奏，按 P99 ≥2.5s 兜底**。PRODUCT §7 v0.4.0 的 P50<600ms 判据仍差得远，schema 瘦身（§三.3）不动摇。v2.2 加长的 8 处（7 类描述+1 类 args）在同日对照下代价可忽略（879→866ms）。
4. **多会话并行写入同一工作区**：初始 git 提交只是某刻快照，接手任何文件前先确认现状（11-07 教训：HANDOFF 曾落后 3D 线两个阶段、评测调优两轮的数字也没进 HANDOFF——本次四次修订才补上）。
5. 3D 线 P2 参考表卡在图像生成（prompt 在 PIPELINE.md §2，需要用户侧操作）；Tripo 资产未提交。
6. （已处理 11-07）根目录 18 张未引用截图/贴图残片归档 `shots/`，误建空目录 `-p/`、`copy/` 已删；以后会话产物别丢在根目录，体检脚本会盯（§六）。
7. （已处理 11-07）**评测证据只在本机**：`result-*.json` 被 gitignore，仓库里查无此数——已把三轮 summary 快照入库 `results/`（含对照表 README），复测请提新快照，别覆盖。
8. （新增 11-07）**天翼 429 在 workers=3/4 下仍会撞**（v3 撞 14 条、v22 撞 3 条、generic 撞 2 条）：全量跑完先查 `error` 字段，用 `.temp/rerun_*_failed.py` 模式单并发补跑合并，别直接采信带 error 的 summary——三个快照都是补跑后才提的。

---

## 三、下一步计划（双线并行，互不阻塞；先推哪条由用户定）

**3D 线（odyssey-witch/3d/，P0/PD/P1 ✅，阶段账本见 3d/HANDOFF.md §0）**
1. **P2 · 参考表与资产**：A1（场景多视角）/A2（角色四视图 T-pose）prompt 已写好在 `PIPELINE.md` §2，需用户拿去图像模型（即梦/MJ/GPT-Image）生成 → Tripo 提交（唯一需要用户参与的阶段；P4 角色可先用占位胶囊，不阻塞）
2. **P3 · 场景组装与盲评**：前置 P2（或角色占位）；GLTFLoader + LAYOUT 常量表按参考图摆位，≥2 轮独立盲评，任务在 `3d/HANDOFF.md` §4-P3

**2D 线（评测 + 剧情）**
3. **schema 瘦身（延迟回收）+ multi 专项**（下一程，瘦身前先把 v2.3 边界专项做掉）：
   - **v2.3 候选：修"X在哪"三向边界**（§二.1/二.2，收益覆盖 boundary/confuse/hades 三组）+ hades_07"怎么渡过X"求助/导航边界；修完判据线过了才谈 v0.2.0
   - v2.3 顺手项（11-07 体检复核发现）：游戏内正式地名「**俄刻阿诺斯之岸**」（index.html 出现 7 次、story 1 次）评测集只覆盖了俗称「冥界之岸」（hades_01）——补 1~2 条别名用例进 hades_oov，同时确认 schema 导航/查询类描述能兜住正式名（schema 里两名字都没写，全靠泛化）
   - v2.3 顺手项补充（11-07 内容级对账）：① index.html 存在变体写法「**献祭之沟**」×1（schema/cases 只认「献祭沟」），补用例时顺带覆盖；② **世界地图目的地导航用例零覆盖**——cases 里唯一真实地名是伊萨卡 ×3，游戏地图的太阳岛/克里特岛/西西里岛/第勒尼安海等 6 海域均无用例（intent 层「去X/X在哪」可泛化、风险低，仅记录；下次加组时顺带抽 1~2 条，祭坛/松林等岛内小地名同理）
   - v2.2 准确率的代价可控（同日对照 P50 879→866ms），但 v0.4.0 判据 P50<600ms 仍要瘦身：裁剪 description 冗余、压缩枚举列表
   - **完全正确 79.7%→80%+**：差 0.3pp，从 v22 失败清单里挑可修的
   - multi 组 53.8%↔61.5% 交替、上限未破：先分析失败模式（拆分缺失 or 参数张冠李戴），再决定是游戏侧引导分句还是接受现状
   - 用 `eval.py --group multi,hades_oov,oov` 小组快跑迭代，瘦身复测跑全量并对 `results/` 提新快照
4. **第三章·声之海（2D）**：剧本已补全（`odyssey-story.md`）——塞壬日志歌词（分享时刻预埋）、物品级代价（六头吃背包）、斯库拉接话"不怪你"；实装前把第三章新词表（塞壬歌/蜡/桅杆/旧名/歌词残页…）按本轮流程新增 `ch3_oov` 组跑回归（**流程模板就是本轮 §2.5**：加组→首跑→归因→补 schema→复测→对判据）
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
                         （schema.json 已是 v2.2 冥界回归版：hades_oov 85.7%；v2.1 备份 .temp/schema-v21-backup.json，v1 备份 .temp/schema-v1-backup.json）
schema-island-generic.json   通用岛对照（已实跑：68.7% vs 奥德赛 92.1%，见 results/）
result-*.json            各轮全量结果（v3/v22/generic 为本轮三份），体积大被 gitignore、只在本机（勿覆盖，复测用新文件名）
results/                 ★评测证据入库处：六份 summary 快照 + 对照表 README（仓库内查数字以它为准）
key.txt                  天翼 API key（gitignored）
shots/                   2D/评测线截图归档（实机验证用；3D 线截图在 3d/tools/shots/，不入库）
odyssey-witch/
  index.html             游戏全部前端（地图/渲染/对话/30类handler/存档；第二章冥界已实装）
  server.py              本地服务 :8765（静态托管 + /api/schema|parse|chat 代理）
  启动游戏.bat + start-service.vbs   一键启动（vbs 静默拉起 server.py）
  odyssey-story.md       剧情圣经（八章全写完：第一章+第二章已实装）
  odyssey-lore.md        知识库（神话事实红线）
  odyssey-visual.md      视觉稿（3D 线的色板来源）
  concept-art/           7 场景（根目录 01~07，07-冥界之岸为第二章新增）+ characters/（6 角色）+ brand/（IP 立绘×2+徽章）+ maps/（世界/埃亚岛/冥界之岸 3 张）
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

> **内容级对账（机械 8 项之外的定期项）**：改动 index.html / 资产 / 用例后，对一遍 §一 的硬计数（index.html 行数、concept-art 图数、cases 总数与分组）和 README/PRODUCT 里的关键数字——11-07 曾漂移两处（1127→1656 行、6→7 场景图）。可参照 `.temp/` 历轮审计脚本（本机，不入库）的思路：`audit_handoff.py` + `audit_1107_second/third/fourth/fifth.py`——计数 + 地名在场性 grep + 快照 summary/延迟逐值断言（fifth 版已把六快照数字做成自动 PASS/FAIL，可直接复跑）。
