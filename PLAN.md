# 开放世界 × AI NPC 游戏 —— 执行计划

> 依据：公众号文章《AI小镇太烧钱，这个新开源模型给了解法》+ XingChen-AGI/Xing4.0-29B-Intent 仓库 + 本地游戏开发 skills（rpg / game-ai / ai-behavior-trees-utility-ai / dialogue-systems / level-design / procedural-gen / performance-optimization / save-systems / prototype-fast）+ 外部参考（Generative Agents、Project Sid、AI Town、NVIDIA ACE、SEED）。

---

## 0. 定位（一句话）

做一个**小而密的"活世界"开放世界游戏**：大模型负责"想"（规划、对话、人设），**Xing4.0-29B-Intent 负责把"想"和玩家的话变成引擎能直接执行的 JSON 动作**，引擎规则负责一切结算。核心卖点不是地图大，而是**NPC 真的在生活、真的记得你**。

**反共识提醒（来自 prototype-fast skill）**：开放世界的坑是"地图大而空"。第一版只做 **1 座小镇 = 1 个开放世界切片**（对标 Maple Hill，15-25 个 NPC），密度比面积重要。

---

## 1. 核心架构：四层决策栈（省钱的关键）

文章的核心洞察 = game-ai skill 的第一原则：**"决策层只输出 intent（意图+参数），执行层把它变成运动/结算"**。按调用成本分层：

| 层 | 频率 | 用什么 | 成本 |
|---|---|---|---|
| **T0 运动层** | 每帧 | 引擎内 steering / 寻路 / 碰撞（game-ai：跟随路径点，别每帧重算 A*） | 0 |
| **T1 反应层** | 每 0.5~2s / 每个视野内 NPC | **Utility AI 打分**（饥饿、恐惧、好奇心、社交 → 归一化曲线 + 补偿乘积 + 迟滞防抖动，见 ai-behavior-trees-utility-ai） | 0 |
| **T2 意图层** | 事件驱动 + 每游戏日数次 | **Xing4.0-29B-Intent**：<150ms，把"想法/玩家原话"→ `{category, args}` JSON | 极低 |
| **T3 思考层** | 稀缺配额：每 NPC 每游戏日 1~3 次，或玩家对话时 | 大模型（规划人生、生成台词、反思记忆） | 高 → 配给制 |

**意图模型的三个接入点**（文章四案例的抽象）：
1. **玩家自由输入 → 动作**：玩家打字/说话 → Intent → 合法动作；字段为空 → NPC 反问一句（文章验证过，比猜错好）。
2. **LLM 计划 → 合法动作**：大模型说"我想找人修水管"，Intent 落成 `send_message(店主, 修水管)`——杜绝大模型幻想出不存在的动作（OpenRA/宝可梦案例的用法）。
3. **局势突变 → 小决策**：血量掉了/看到重坦，Intent 读状态在预算动作集里插一次小判断，长计划不用推翻重来（修仙/OpenRA 案例）。

**NPC 大脑数据流**（Generative Agents 内存流 + PIANO 式并行）：
```
观察事件 → 记忆流(写入+检索: 新近度×重要性×相关性) → 反思(定期，T3) 
        → 日程计划(T3 低频) → 意图(T2) → Utility 仲裁(T1) → 引擎执行(T0)
```

---

## 2. 引擎与部署选型

| 选项 | 建议 |
|---|---|
| **引擎：Godot 4.x（推荐）** | 免费、轻、2D/3D 都行、有 headless 测试可做 CI（`godot-gdscript-headless-testing` skill 全套覆盖）；GDScript 迭代快。备选：Web（Three.js）如果你想学 AI Town 用"一个链接就能玩"传播——但 3D 开放世界用 Godot 更省力。 |
| **Intent 模型** | 开发期：天翼 AI 开放平台 API（**3 个月 / 1 亿 tokens 免费**）。上线/规模化：vLLM 自部署开源权重（29B MoE、激活 4B、Apache-2.0，OpenAI 兼容接口）。 |
| **大模型** | 天翼平台同源大模型或任一主流 API；只做 T3，配额烧得起。 |
| **Skill 对应** | 引擎：`godot-*` 全套；先用 `godot-nodes-scenes` + `godot-gdscript`。 |

**决策点（P0 结束时定）**：3D 第三人称（Godot）vs 俯视 2.5D（更便宜、更聚焦"活世界"）。P0 的灰盒会直接告诉你哪个先做。

---

## 3. 阶段计划（可勾选清单）

### P0 — 一周定生死（spike，可抛弃，1 周）
问题只有一个："**意图→动作→引擎结算** 这条链跑通后，有没有'哇'的感觉？"

- [ ] 开通天翼 AI 平台 API，跑通 XingIntent SDK quickstart（`Intent(name, desc, args=[Arg(...)]) → client.predict()`）
- [ ] 定义 **15~25 个游戏意图表**（move_to / buy_item / send_message / repair / gather / craft / attack / talk_to / give_item / ask_info…），每个意图字段**扁平、含义唯一**——文章第一大坑："功能表没写清楚"导致修水管被填成修自行车
- [ ] 自建 **64 条中文指令评测集**：含改口、否定、半句话、多轮补全（照文章的方法）；目标：意图 ≥90%，意图+参数全对 ≥80%（文章实测是 89% / 66%，你的意图集更小应该更好）
- [ ] 灰盒：一块地图、3 个 NPC、一个调试 HUD（显示每个 NPC 当前 intent + args）；玩家打字 → NPC 执行
- [ ] **KEEP 判据**：链路端到端 <1s，未解释操作的情况下陌生人能指挥 NPC 办成一件事；**KILL 判据**：填空错误率高到需要玩家反复重说（那就要改 schema 而不是改模型）

### P1 — 垂直切片（2~4 周，"一座活的小镇"）
- [ ] Godot 项目骨架：`ActionBus`（意图入口，schema 校验、非法意图拒绝并记录）+ `Executor`（把意图翻译成寻路/动画/结算）
- [ ] NPC 大脑 v1：记忆流 + 需求（Utility AI）+ 日程（BT 结构：Selector[Sequence[紧急? 处理], 日常]）+ T3 大模型规划（每游戏日 1~2 次）
- [ ] 对话系统：自定义 JSON runner（dialogue-systems：节点图 + 变量存储 + line ID 本地化，从第一天就别硬编码字符串）；大模型生成台词，Intent 解析玩家回复
- [ ] 小镇内容：1 座镇、15~25 个 NPC、商店/修理工/情报贩子、货币、昼夜循环（对标 Maple Hill 的 Walter 修水管链路）
- [ ] 存档 v1：`version` 字段从第一天就有；原子写（temp+rename+.bak）；存 seed、世界 flag、NPC 记忆摘要（save-systems）
- [ ] 成本仪表盘：每 NPC 每日 token 数、T3 调用次数、API 余额告警

### P2 — 开放世界化（4~8 周）
- [ ] **种子化程序生成**：fBm 地形 + 双轴生物群系（高程/湿度分开 seed！）+ 城镇/POI 布点 + 路网；连通性校验（flood-fill，失败就拒绝/修复——procedural-gen 铁律）
- [ ] **模拟 LOD**（省成本的大头）：视野内全量模拟；远处降频统计模拟（记账不演动画）；屏幕外批量低频 tick；所有 AI tick 在"决策步"而非每帧（performance-optimization）
- [ ] 派系 + 经济模拟：供需影响物价；**谣言传播系统**（NPC 会聊天，玩家干的事会传开 → 涌现任务）
- [ ] 任务系统数据驱动（rpg：事件驱动 objective 更新，flag 要真的改变后续世界状态）；"涌现任务探测器"：世界事件 → 自动生成任务钩子
- [ ] 存档迁移链：schema 变更只加 migration，不破坏老档

### P3 — 内容与手感（4~8 周）
- [ ] 大模型生成 + 人工审校的地标/传说/任务文案；**手工节奏点嵌进程序世界**（level-design：黄金路径、地标引导、锯齿难度曲线——程序生成给多样性，手工给意图）
- [ ] game-feel / 相机 / UI（`game-ui-ux`） / 音频（`audio-design`）三件套
- [ ] 意图表运营：把 playtest 里所有填错/拒判的 case 记录回 schema（这是持续资产）
- [ ] 不可逆操作的确认流程（文章第二大坑：否定句误判 → 撤不回的事必须二次确认）

### P4 — 发布
- [ ] itch.io 早期测试版（`itch-publish`：butler 推版），收集反馈 → Steam（`steam-publish`）
- [ ] 优雅降级：LLM/Intent 断线时 NPC 自动落到 T1 Utility AI 继续生活（世界不能"死机"）
- [ ] 密钥管理、限流、按会话缓存的意图结果

---

## 4. 风险清单

| 风险 | 缓解 |
|---|---|
| **填空不准**（文章实测 42/64 全对，弱项就是填空） | 意图少而字段扁平；constrained decoding（SDK 支持）；空字段→反问；错误日志回灌 schema |
| **否定句误判** | 不可逆操作二次确认（文章原话） |
| **成本失控**（Aivilization 的教训） | 四层分频架构本身；配额制 T3；模拟 LOD；1 亿免费 token 撑过开发期 |
| **延迟** | Intent <150ms 无压力；T3 异步化 + 台词预生成（PIANO 并行思路：部队不等 AI 想完） |
| **记忆爆炸** | 记忆只存摘要+检索 top-k，反思定期合并；版本化存档 |
| **范围爆炸** | prototype-fast：每个新系统先问"这服务于哪个核心动词？"核心动词 = 观察活的 NPC 社会并与它互动 |

---

## 5. 参考项目（按用途）

| 项目 | 学什么 |
|---|---|
| [Stanford Generative Agents](https://github.com/joonspk-research/generative_agents)（Smallville） | 记忆流/反思/规划三件套的原始论文与实现 |
| [Project Sid](https://arxiv.org/abs/2411.00114)（[发布推文](https://x.com/GuangyuRobert/status/1831006762184646829)） | 1000+ agent 涌现出经济/宗教/政治；PIANO 并行认知架构 |
| [AI Town](https://github.com/a16z-infra/ai-town) | 最小可跑的 AI 小镇开源参考（Convex 栈） |
| [NVIDIA ACE](https://developer.nvidia.com/ace-for-games) | 大厂方案：语音→LLM→动作管线；2025-10 起支持开源小模型端侧部署 |
| [SEED（Klang Games）](https://www.seed.game) | 7×24 持续运行的社会模拟，玩家离线世界照常运转 |
| [LARP 论文](https://arxiv.org/abs/2312.17653) | 语言 agent × 开放世界游戏的框架化 |
| Decart [Oasis](https://oasis.decart.ai) / DeepMind Genie 3 | 世界模型路线（另一个流派，知道即可，不用跟进） |
| 文章四案例（Maple Hill / 修仙 / OpenRA / 宝可梦） | Intent 模型三种接法的现成模板 |

---

## 6. 下一步（本仓库内）

1. `01-intent-schema.md`：把 15~25 个游戏意图表写成正式 schema（可直接喂 SDK）
2. `02-eval-set.md`：64 条评测指令 + 评分脚本
3. `03-spike/`：P0 灰盒 demo 代码

> AI生成
