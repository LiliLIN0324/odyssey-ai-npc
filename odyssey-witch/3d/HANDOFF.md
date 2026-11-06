# 埃阿亚岛 3D · 分期实施与交接文档（HANDOFF）

> **本文件是唯一的执行总控与交接入口。** 任何新会话/新执行者只需：读本文 → 看「§0 当前进度」找到下一个未完成阶段 → 跳到该阶段详情执行 → 完成后回来勾选。
> 战略背景与方法论见同目录 `PIPELINE.md`（Sac 工作流转译），本文只管**怎么分期落地**。

---

## §0 当前进度（每次完成阶段后必须更新本节）

| 阶段 | 名称 | 状态 | 产出位置 |
|---|---|---|---|
| P0 | 应用骨架 | ✅ 已完成 | `3d/app/`（可 `npm run dev`） |
| P1 | 程序化世界（岛/海/天/光） | ⬜ 未开始 | `app/src/world.js` 等 |
| P2 | 资产生产（参考图/Tripo/清理） | ⬜ 未开始 | `app/public/assets/` + `assets.manifest.json` |
| P3 | 场景组装与盲评 | ⬜ 未开始 | `app/src/scene-setup.js` + `tools/shots/` |
| P4 | 角色与控制 | ⬜ 未开始 | `app/src/character.js` |
| P5 | 交互与叙事 | ⬜ 未开始 | `app/src/dialogue.js`、`interact.js` |
| P6 | Xing 意图接入 | ⬜ 未开始 | `app/src/intent.js`、`server/intent-proxy.py` |
| P7 | 打磨与发布 | ⬜ 未开始 | 后处理、音频、`app/dist/` |

状态取值：⬜ 未开始 / 🔶 进行中（写明卡点）/ ✅ 完成（附验证输出摘要）/ ⏸ 阻塞（写明等谁）。

**交接三步**：① 读 §0 找阶段 → ② 读 §2 全局规约 + 该阶段详情 → ③ 完成后跑该阶段「验收命令」，全绿才允许勾选并更新本表。

---

## §1 一页速览

| 项 | 内容 |
|---|---|
| 做什么 | 把 2D 版第一章「埃阿亚岛 · 女巫的领地」做成 Three.js 浏览器 3D 垂直切片 |
| 交付形态 | `3d/app/` 的 Vite 项目，`npm run build` 出纯静态 `dist/`，任意静态托管链接即玩 |
| 范围 | 1 岛 + 2 角色 + 3 交互（对话四选一 / 采玛草交付 / 石碑阅读）；**不做**战斗、多岛、存档、移动端 |
| 明确不动 | 2D 版 `odyssey-witch/index.html` 及其 server.py 零改动 |
| 上下游 | 与根目录 `PLAN.md` 的双层架构衔接：P6 预埋 Xing4.0-29B-Intent 意图接入口 |
| 总工期 | 8 个阶段 ≈ 7 个工作日（P2 与 P1/P3 可并行，见 §4 时间表） |

### 上下文速查（执行任何阶段前按需读）

| 文件 | 何时读 |
|---|---|
| `odyssey-witch/odyssey-visual.md` | P1（色板/光照）、P7（胶片颗粒）——**色板唯一来源** |
| `odyssey-witch/odyssey-story.md` 第一章 | P5（对话分支/交互文本） |
| `odyssey-witch/odyssey-lore.md` | P5 涉及神话细节时 |
| `odyssey-witch/index.html` | P4/P5（沿用 WASD+E 操作心智、UI 布局习惯） |
| `odyssey-witch/3d/PIPELINE.md` | P2（提示词、Tripo 参数）、P3（盲评循环） |
| 根目录 `README.md` / `eval.py` | P6（意图 schema、请求格式、双后端模式） |
| `concept-art/` 全部 | P2（参考图基准）、P5（对话立绘）、P7（加载页） |

---

## §2 全局规约（所有阶段共同遵守）

### 2.1 色板常量（唯一来源，写入 `app/src/palette.js`，禁止散落硬编码）

```js
export const PALETTE = {
  oceanDeep:  0x123c58,  // 外海
  oceanMid:   0x2f6590,  // 主海面
  oceanShore: 0x4f8fb5,  // 近岸
  cliffLight: 0xe0bd84,  // 崖面阳面 / 沙滩
  cliffDark:  0x7c5c38,  // 崖面暗面
  grassMain:  0xa8cf8e,  // 草地主绿
  grassDeep:  0x7d9c66,  // 草地深绿
  duskGold:   0xe8a84a,  // 黄昏金色逆光（主光颜色）
  fireOrange: 0xe0783a,  // 火把/坩埚火光
  nightBase:  0x0c1018,  // 夜/冥界近黑（P7 事件用）
  phosphor:   0x7fd1c8,  // 冷磷光（P7 事件用）
};
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.7, 0.45).normalize(); // 光源统一左上
```

### 2.2 性能预算（P7 验收红线，P1 起就不得超）

| 指标 | 预算 | 测法 |
|---|---|---|
| 三角面总数 | ≤ 150k | `renderer.info.render.triangles` 打进 debug HUD |
| Draw call | ≤ 150 | 同上 `calls` |
| GLB 总体积 | ≤ 30 MB | `du -sh app/public/assets` |
| 贴图 | 单张 ≤ 2K，≤ 12 张 | manifest 统计 |
| 首屏可玩 | ≤ 5 s（本地） | 加载计时进 HUD |

### 2.3 代码与资产命名

- 模块职责一个文件一件事：`world.js`（岛海天草）、`character.js`（控制器+动画）、`interact.js`（交互点）、`dialogue.js`（对话数据+UI）、`intent.js`（意图客户端）、`ui.js`（HUD/加载页）、`palette.js`、`noise.js`（种子噪声）。
- 资产命名：`{prefix}_{name}.glb`，prefix 用 clean_asset.py 的 `--prefix`（`hut / cauldron / boat / dock / stele / herb / tree / circe / traveler`）。
- glb 一律经 `clean_asset.py` 入库，原点脚底 z=0、+Y up；未经清理的原始件放 `app/raw-assets/`（不进 git）。
- 对话/意图等叙事数据用 JS 模块或 JSON，**不许硬编码在渲染代码里**（为将来 EN/日化留门）。

### 2.4 工作方式

- 每阶段一个工作会话；会话结束前必须：验收命令全绿 → 更新 §0 → 提交（建议 git，见 2.5）。
- 生成类工作（图像、3D 资产）需要用户动手或提供账号的，阶段详情里标了「👤 用户动作」；其余全部可由 agent 完成。
- 截图审查：web 端用 `npm run dev` 后人工/agent 截屏；Blender 端用 `review_shots.py`。所有截图归档 `3d/tools/shots/`，带阶段前缀（`p3-round1-top.png`）。

### 2.5 版本管理（若仓库未 git 化则先 `git init`）

- 提交粒度 = 阶段内任务级；信息格式 `3d(P{n}): {做了什么}`。
- `app/node_modules/`、`app/dist/`、`app/raw-assets/`、`tools/shots/` 进 `.gitignore`。

---

## §3 目录契约（全部完成后的最终形态，括号为所属阶段）

```
odyssey-witch/3d/
  PIPELINE.md                 ← 方法论（已存在）
  HANDOFF.md                  ← 本文件：总控 + 进度账本（已存在）
  tools/
    clean_asset.py            ← 已存在
    review_shots.py           ← 已存在
    shots/                    ← 审查截图归档 (P3+)
  app/
    package.json  vite.config.js  index.html   (P0 ✅)
    public/
      assets/                 ← 清理后的 glb + 贴图 (P2/P3)
        assets.manifest.json  ← 资产清单(面数/体积/来源) (P2)
      ui/                     ← 对话立绘(从 concept-art 复制) (P5)
    src/
      main.js       ← 渲染器/循环/resize/启动入口 (P0 ✅, 后续阶段扩展)
      palette.js    ← 色板常量 (P0 ✅)
      world.js      ← 岛体/海/天/光/雾/草/火 (P1)
      noise.js      ← 种子化 value noise + fbm (P1)
      scene-setup.js← 资产加载与按参考表摆放 (P3)
      character.js  ← 玩家控制器 + 相机跟随 + 动画状态机 (P4)
      npc.js        ← 喀耳刻待机/面向玩家 (P4)
      interact.js   ← 交互点注册/最近检测/E 提示 (P5)
      dialogue.js   ← 对话数据(四选一/采草交付/石碑) + UI 渲染 (P5)
      intent.js     ← 意图客户端(输入框→端点→动作) + 离线兜底 (P6)
      ui.js         ← HUD/加载页/调试面板 (P0 ✅, 后续扩展)
      postfx.js     ← 胶片颗粒+vignette (P7)
      audio.js      ← 海浪/火/里拉琴 (P7)
    server/
      intent-proxy.py  ← 本地意图代理(复用 eval.py 的请求格式) (P6)
    dist/             ← 构建产物 (P7)
```

### 数据契约

**`assets.manifest.json`**（P2 产出，P3/P7 消费）：

```json
{
  "hut":  { "file": "hut.glb", "tris": 14200, "budget": 15000, "bytes": 3800000,
            "origin": "foot", "source": "tripo-image3d", "cleaned": true, "ok": true },
  "circe": { "file": "circe.glb", "tris": 28500, "budget": 30000,
             "animations": ["idle", "walk"], "rig": "mixamo", "...": "..." }
}
```

**对话脚本**（P5，`dialogue.js` 数据段）——节点图，动作用枚举，不写死在渲染层：

```json
{ "id": "circe_root", "speaker": "喀耳刻", "portrait": "ui/circe.jpg",
  "text": "又一个被海冲来的。……买药、问路、听预言、讨活儿，你要哪样？",
  "choices": [
    { "label": "买药",   "next": "circe_buy",   "action": "buy_item" },
    { "label": "问路",   "next": "circe_ask",   "action": null },
    { "label": "听预言", "next": "circe_prophecy", "action": null },
    { "label": "讨活儿", "next": "circe_job",   "action": "start_quest_gather" } ] }
```

**意图协议**（P6，对齐根目录 README 的 schema 习惯——扁平字段、保留原话、兜底诚实）：

```
请求:  { "input": "玩家原话", "schema_version": "1", "allowed": ["talk_to","gather","buy_item","other"] }
响应:  { "category": "gather", "args": { "item": "玛草", "count": 3 }, "confidence": 0.87 }
       category=other 或 confidence<0.6 → UI 反问，不猜。
```

---

## §4 阶段详情

### P0 · 应用骨架 ✅（已完成，本节留作验收复现）

- 产出：`app/` 内 Vite + three 跑起来；加载页（海洋深蓝→暮色金渐变，标题「埃阿亚岛 · 女巫的领地」，开始按钮后进场景）；占位场景 = 草绿圆盘 + 半球光 + 金色平行光 + 雾 + OrbitControls。
- `palette.js` 建立并作为唯一色板来源。
- 验收命令：`cd 3d/app && npm install && npm run build`（0 error）；`npm run dev` 打开 http://localhost:5173 可看到场景且加载页→场景过渡正常。
- 决策记录：three ^0.170 / vite ^5（已知稳定组合）；`vite.config.js` 用 `base: './'` 保证 dist 可放任意子路径托管。
- 实测记录（2026-11-07）：`npm install` 12 packages；`vite build` ✓ 8 modules，`dist/` 488.8 KB（gzip 122.8 KB）；`vite preview` 冒烟 HTTP 200。dev 页面目检（加载页渐变/轨道相机）待用户首次打开时顺手确认。

### P1 · 程序化世界（岛/海/天/光）——不依赖任何生成资产

**目标**：只有代码就能看到"黄昏金逆光下的埃阿亚岛"，达到 2D 版没有的纵深与氛围。
**前置**：P0。**读**：odyssey-visual.md 第二、三章。

任务清单：
1. `noise.js`：种子化 value noise + fbm（2D），同种子输出确定（交接后别人能复现同一座岛）。
2. `world.js` 岛体：半径 ~60m 圆盘，顶点高度 = fbm 位移（边缘 0 → 中心 6~9m），斜率贴崖面色（`cliffLight/cliffDark`），高度带贴草色（两档绿），低处一圈沙滩 `cliffLight`；顶点色 + `MeshStandardMaterial({vertexColors:true, flatShading:true})`——flatShading 是低多边形史诗感的关键开关。
3. 海面：600×600 平面 + ShaderMaterial，按到岛心距离混三档海色（近岸→外海），加时间驱动的微小起伏与近岸白色泡沫带；透明度近岸略降。
4. 天空穹顶：大球背面 + 渐变 shader（地平线暖金 `duskGold` → 天顶 `oceanMid` 深化），太阳方向取 `SUN_DIRECTION`，在 shader 里对太阳方向做一圈暖光加权。
5. 光照：半球光（天 `oceanShore`/地 `cliffLight`，0.5）+ 平行光（`duskGold`，1.2，方向 = SUN_DIRECTION，开阴影 2048 shadowmap）+ `FogExp2(oceanMid, 0.008)`。
6. 草卡：InstancedMesh 双面交叉双三角 ×~1500，按噪声掩码撒在草地带，颜色在两档绿间随机抖动。
7. 火堆：坩埚旁占位处 Points 粒子（60 颗，`fireOrange`，上升渐隐循环）+ 闪烁点光源（强度噪声）。
8. debug HUD：左上角显示 tris/calls/fps（`renderer.info`），P7 验收要用。

**验收命令**：`npm run build` 通过；dev 打开后 HUD 显示 tris ≤ 60k（此时无资产）、fps ≥ 60（集成显卡）；截图 `tools/shots/p1-persp.png` 目检：光源左上、金逆光、近岸浅外海深、草地非纯色。
**风险**：shader 首次写容易裁剪穿帮 → 海面与岛体相交处用"岛缘下沉裙边"（岛体边缘向下延伸 -2m）兜住。
**本阶段无 👤 用户动作。**

### P2 · 资产生产（与 P1 并行；唯一需要用户参与的阶段）

**目标**：8 类道具 + 2 角色 glb 入库并过预算。
**👤 用户动作**（约 1~2 天，agent 无法代替图像/3D 生成）：
1. 拿 `PIPELINE.md` §2 的 A1/A2 提示词 + `02-女巫小屋.jpg` / `02-喀耳刻.jpg` / `01-无名旅人.jpg` 去图像模型生成**场景多视角参考表**与**两张角色四视图 T-pose**，存入 `3d/tools/ref/`。
2. Tripo 生成（参数照 `PIPELINE.md` §3/§4 表）：道具 Image-to-3D、角色 Multi-View to 3D + Smart Mesh；每个先看白模线框，剪影不对就重生成；导出 glb 交给 agent（或放入 `app/raw-assets/`）。
**agent 动作**：收到 glb 后逐个跑 `clean_asset.py`（预算表照 PIPELINE §4），生成 `assets.manifest.json`；超预算或法线/原点问题打回重生成。
**验收命令**：`node -e "const m=require('./app/public/assets/assets.manifest.json'); console.log(Object.values(m).every(a=>a.ok))"` 输出 true；manifest 汇总 tris 总和 ≤ 150k、总体积 ≤ 30MB。
**风险**：Tripo 免费额度/排队 → 先做道具后做角色，角色可用占位胶囊体让 P4 先行。

### P3 · 场景组装与盲评

**目标**：资产按参考表进场，通过 ≥2 轮独立盲评。
**前置**：P1 ✅ + P2 ✅（或角色仍占位）。
任务清单：
1. `scene-setup.js`：GLTFLoader + manifest 驱动加载；每资产实例化时 `position` 按 A1 参考表俯视图摆（先用人工读图填坐标，写死成 `LAYOUT` 常量表，便于盲评后统一微调）；缩放以门高/人高为锚（角色 1.6m 基准校核全场景比例）。
2. 布局锚点（可按参考表微调）：小屋北坡、坩埚火堆小屋前、栈桥由南岸入海、石碑在东侧高地、玛草丛 ×3 分散在草地、树 6~10 棵外围成环、池塘西南洼地。
3. Blender 侧 `review_shots.py` 对组装场景出四视角图（也可直接用 web 截图，二选一，全程同一手段保证可比）。
4. 盲评循环：截图 + A1 参考表 + `PIPELINE.md` §5 审查 prompt → 独立审查 agent → 「大」级问题改 `LAYOUT` 重截，最多 4 轮。
**验收命令**：`tools/shots/p3-round{N}-*.png` 存在且最后一轮审查输出含「通过」；`npm run build` 通过。
**风险**：参考表与地形起伏冲突（如栈桥对不上岸线）→ 允许微调地形噪声种子，但须在 P3 记录最终种子号，之后冻结。

### P4 · 角色与控制

**目标**：能以无名旅人视角在岛上行走，手感与 2D 版一致（WASD+E）。
**前置**：P3 布局冻结。
任务清单：
1. `character.js`：WASD 相对相机方向移动、加速度/阻尼（起步 0.15s、停步 0.1s，防"漂"）、角色朝向平滑转向移动方向；贴地 = 地形高度函数复用 `world.js` 的同一噪声（保证脚不悬空/不入地）；坡度 >50° 区域拒绝移动（崖爬不上去）。
2. 相机：第三人称跟随（偏移 5m 后上 3m，lerp 0.08），滚轮缩放 3~9m，指针拖拽水平环绕；Esc 无对话时回中。
3. 动画：Mixamo `idle/walk` 经 Blender 重定向入 circe/traveler glb（`clean_asset.py` 清理时保留动画段，manifest 记 `animations`）；AnimationMixer 状态机 idle↔walk，走停过渡 crossFade 0.2s。👤 用户动作（可选）：若 Tripo 角色未好，用 Mixamo 网站任选人形模型先行打通管线。
4. `npc.js`：喀耳刻在坩埚旁 idle + 玩家进入 6m 时缓慢转向玩家。
**验收命令**：build 通过；实测绕岛一周无穿模无悬空；HUD tris ≤ 150k、calls ≤ 150；录屏或连拍 3 张存 `tools/shots/p4-*.png`。
**风险**：Mixamo 重定向变形 → 退路是"无骨骼方案"：角色不绑骨，用两段式（身体浮动 + 位置移动）先保证可玩，绑定为 P4.5 后置任务。

### P5 · 交互与叙事

**目标**：三条交互完整可走通，文本全部来自 odyssey-story.md 第一章。
**前置**：P4。
任务清单：
1. `interact.js`：交互点注册表（位置+半径+prompt 文案+回调）；最近点检测，进入半径显示「E · 与喀耳刻交谈 / E · 采集玛草 / E · 端详石碑」提示条；E 触发。
2. `dialogue.js`：对话数据按 §3 节点图契约写全第一章：根节点四选一（买药/问路/听预言/讨活儿）；讨活儿 → 采玛草任务（3 丛 × 采集 → 回喀耳刻交付 → 她给"真话"分支 + 石碑线索解锁）；石碑文本（斯库拉彩蛋："我把一个急着回海的神女，咒成了六头海怪。"）；结局钩子指向海面（"先学会听懂风向……"）。
3. UI：复用 `concept-art/characters/02-喀耳刻.jpg` 立绘（复制到 `public/ui/`）、半透明面板 + 选项按钮 + Esc 关闭；货币显示沿用「钱袋 N 德拉克马」样式（买药扣 2 德拉克马，给 1 瓶药入背包 UI——背包 P5 只做计数条目）。
4. 金色逆光事件：交付玛草后光照向 `duskGold` 加深 + 光柱一次性特效（P7 再精修）。
**验收命令**：build 通过；走查表三项交互各一遍并截屏（`tools/shots/p5-{a,b,c}.png`）；所有对话文本 grep 确认无占位符残留。
**风险**：文本版权红线——只准用 odyssey-story.md 已有演绎，不新增电影台词式文本。

### P6 · Xing 意图接入（与根目录 PLAN.md 双层架构对接）

**目标**：对话面板的输入框能把玩家原话变成合法动作；离线可玩不劣化。
**前置**：P5。
任务清单：
1. `server/intent-proxy.py`：本地代理（复用根目录 `eval.py` 的请求构造与 `--backend local/teleai/mock` 三模式与 key 读取习惯），端点 `POST /intent`，返回 §3 意图协议；mock 模式零依赖可跑。
2. `intent.js`：输入框（对话 UI 底部）→ 防抖 400ms → proxy → `{category,args}` → 映射动作：`talk_to`（转向喀耳刻开对话）、`gather`（高亮最近玛草丛）、`buy_item`（触发买药分支）；`other`/低置信 → 喀耳刻反问一句（"……说清楚些，外乡人。"），**绝不猜**。
3. 服务端校验桩：动作落地前对照本地状态（德拉克马余额/背包/任务旗标）——对齐根 README「参数落地前必须过一次服务端校验」。
4. 配置：端点地址/后端模式走 `localStorage` + `?intent=mock|teleai|local` URL 参数，默认 mock。
5. 延迟体验：>300ms 显示"喀耳刻正在思索…"占位（对齐根 README 的 334ms 实测口径）。
**验收命令**：`py -3 server/intent-proxy.py --mock` 后在页面输入"采三株玛草"→ 触发 gather 且 count=3；断网状态全流程仍可玩（兜底关键词匹配）；负例输入"打开背包"被归 `other` 并反问。
**风险**：跨域 → vite dev 配 `server.proxy` 指向 8731，生产期建议同源部署。

### P7 · 打磨与发布

**目标**：过全预算红线，出链接。
任务清单：
1. `postfx.js`：全屏 pass——vignette + 动态胶片颗粒（odyssey-visual.md 的"胶片质感"转译；颗粒强度 0.03~0.06 随机帧抖动）；可选色差极轻量（关掉也不影响验收）。
2. `audio.js`：海浪底噪循环 + 火堆噼啪 + 里拉琴单轨循环；总音量 0.4；静音按钮记忆在 localStorage；**全部在开始按钮点击后启动**（浏览器自动播放策略）。
3. 加载页：底图换 `01-序章漂流.jpg` + 加载进度条（LoadingManager 计 manifest 资产）。
4. 性能终审：HUD 四项指标 + GLB 体积 + 贴图张数全绿；不绿则按"草卡数量 → 贴图降 1K → 草卡合批"顺序砍。
5. 发布：`npm run build` → `dist/`；README 写明托管方式（任意静态服务/子路径可用，base 已相对化）；把链接与已用种子号、盲评轮次记录回填本文 §0。
6. 清尾：`PIPELINE.md` §9 验收清单逐条勾选；2D 版回归确认（`index.html` 打开无异常，diff 为空）。
**验收命令**：`npm run build` 产物 `dist/` 体积报告；HUD 四项截图；`tools/shots/p7-final-*.png`。
**风险**：后处理拖帧 → 后处理分辨率减半渲染再上采样（颗粒本来就是低频信号，视觉无损）。

---

## §5 时间表（P2 用户侧并行，日历仅供参考）

```
Day1  P1(世界)        │ Day1-2 P2(👤 参考图+Tripo 提交)
Day2  P1 收尾         │
Day3  P3(组装+盲评)    │ Day3 P2(👤 角色)
Day4  P4(角色控制)     │
Day5  P5(交互叙事)     │
Day6  P6(意图接入)     │
Day7  P7(打磨发布)     │
```

依赖链：P0 → P1 → P3 → P4 → P5 → P6 → P7；P2 只与 P3/P4 硬耦合（其资产就绪即可）。

## §6 总风险与回退

| 风险 | 触发信号 | 回退 |
|---|---|---|
| Tripo 产出质量不稳 | 同一资产重生成 ≥3 次 | 降级为"Blender 基元拼装"（立方体小屋+圆柱树），保氛围保进度，资产后补 |
| 无骨骼动画经验 | 重定向变形修不动 | P4 的无骨骼退路（浮动+移动），绑定为独立后续任务 |
| 性能超预算 | P4 起 HUD 飘红 | 砍单顺序：草卡 → 贴图 1K → 阴影 1024 → 关后处理 |
| 意图端点不可用 | proxy 连不通 | mock/关键词兜底已是 P6 验收项，天然可回退 |
| 范围膨胀 | 任何"顺手加个…" | 回读本表范围行；新想法记进 §7 待办池，不当场做 |

## §7 待办池（不进本期范围，只记录）

- 塞壬/斯库拉海峡等后续岛屿复用本管线（每岛 = 一份 PIPELINE A1 参考表 + 本表副本）
- EN/日本語 文案化（对话数据已按 §3 契约与渲染分离）
- 移动端适配、手柄、存档（对齐根 PLAN P1/P2）
- itch.io 发布（根 PLAN P4 有 itch-publish skill 可用）
