# 埃阿亚岛 3D（aeaea-3d）

《奥德赛 · 女巫的领地》第一章的 Three.js 浏览器 3D 垂直切片。
计划与进度见 [`../HANDOFF.md`](../HANDOFF.md)（总控/交接），方法论见 [`../PIPELINE.md`](../PIPELINE.md)。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/,任意静态托管可用(base 已相对化)
```

## 目录速览

| 路径 | 职责 |
|---|---|
| `src/palette.js` | 全项目唯一色板来源(odyssey-visual.md) |
| `src/main.js` | 渲染器/装配/主循环 |
| `src/ui.js` | 加载页 + 调试 HUD |
| `public/assets/` | 清理后的 glb 资产(P2 入库) + assets.manifest.json |
