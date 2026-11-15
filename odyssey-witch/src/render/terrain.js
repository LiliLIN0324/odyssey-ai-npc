/* ==================================================================
 *  批次 R2 · 岛内地形材质公共层
 *  ------------------------------------------------------------------
 *  埃阿亚/冥界/风神/海峡/太阳/奥吉吉亚/斯克里/伊萨卡 8 个岛的地形是
 *  同一套四层结构（Pass1 水 → Pass2 水侧 → Pass3 崖面 → Pass4 顶面）的
 *  各自拷贝，差异只在配色。旧版三处质感硬伤（实测 .temp/q-r4/q4-2d-aia.png）：
 *    ① 逐格 2px 高光/暗边 + 逐格平涂 → 整片草地读成「方格纸」；
 *    ② 底色只有两色伪随机（(cx*7+cy*13)%5）→ 大面积色块拼图；
 *    ③ 没有任何方向光（各实体阴影方向/软硬各异）→ 画面是平的。
 *  本模块提供公共件，8 个岛共用：
 *    terrFbm      低频 fbm（种子确定，同帧同结果）
 *    terrMix      两色线性混
 *    terrShade    明暗调
 *    terrTint     低频色变（把「两色伪随机」换成有机色斑）
 *    terrDepth    到岸距离场（连续水深色带）
 *    terrPaint    材质噪点 + 浅滩色带 + 统一方向光洗层（公共后处理）
 * ================================================================== */

/* ---------- 种子噪声（与 world3d.js 同源，保证 2D/3D 观感一致） ---------- */
function terrHash2(x, y, seed) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function terrNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const v00 = terrHash2(xi, yi, seed), v10 = terrHash2(xi + 1, yi, seed);
  const v01 = terrHash2(xi, yi + 1, seed), v11 = terrHash2(xi + 1, yi + 1, seed);
  return v00 + (v10 - v00) * u + (v01 - v00) * v + (v00 - v10 - v01 + v11) * u * v;
}
function terrFbm(x, y, seed, oct) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < (oct || 3); i++) {
    sum += amp * terrNoise(x * freq, y * freq, seed + i * 101);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

/* ---------- 颜色工具（一律返回 #rrggbb，方便再喂回 terrRgb） ---------- */
function terrRgb(hex) {
  const h = String(hex).replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function terrHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function terrMix(a, b, t) {
  const A = terrRgb(a), B = terrRgb(b);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return terrHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function terrShade(hex, amt) {
  const A = terrRgb(hex);
  const ch = (c) => (amt >= 0 ? c + (255 - c) * amt : c + c * amt);
  return terrHex(ch(A[0]), ch(A[1]), ch(A[2]));
}

/* ---------- 低频色变：把「两色伪随机」换成有机色斑 ----------
   相邻格取同一个低频场 → 颜色差 <3%，格边不可见，但大范围有明暗起伏。 */
function terrTint(cA, cB, x, y, seed, freq, lo, hi) {
  const n = terrFbm(x * (freq || 0.16), y * (freq || 0.16), seed || 7, 3);
  return terrMix(cA, cB, (lo !== undefined ? lo : 0) + n * ((hi !== undefined ? hi : 1) - (lo !== undefined ? lo : 0)));
}

/* ---------- 到岸距离场（连续水深色带） ----------
   多源 BFS：陆地格=0，向外每圈 +1。缓存到窗口级，8 个岛共用一张表结构。 */
const _terrDepthCache = new Map();
function terrDepthMap(tileAt, cols, rows, key) {
  if (_terrDepthCache.has(key)) return _terrDepthCache.get(key);
  const d = new Int16Array(cols * rows).fill(-1);
  const q = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (tileAt(cx, cy) === "~") continue;
    d[cy * cols + cx] = 0; q.push(cx, cy);
  }
  let head = 0;
  while (head < q.length) {
    const cx = q[head++], cy = q[head++];
    const cur = d[cy * cols + cx];
    const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      if (d[i] !== -1) continue;
      d[i] = cur + 1; q.push(nx, ny);
    }
  }
  _terrDepthCache.set(key, d);
  return d;
}
function terrDepthAt(depth, cols, cx, cy) {
  const v = depth[cy * cols + cx];
  return v < 0 ? 99 : v;
}

/* ---------- 材质噪点图案（缓存一次，全岛复用） ---------- */
let _terrMatPat = null;
function terrMatPattern() {
  if (_terrMatPat) return _terrMatPat;
  const S = 128;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    /* 批次 R2 调参：幅度 96→64、频率 0.085/0.33→0.14/0.52。
       原参数在暗色岛上（奥吉吉亚的暮海、冥界的黑土）软光叠加后读成「脏斑」，
       不是纸感；细一半、浅一半才是颗粒。 */
    const n = terrFbm(x * 0.14, y * 0.14, 31, 3) * 0.55 + terrFbm(x * 0.52, y * 0.52, 57, 2) * 0.45;
    const v = Math.max(0, Math.min(255, Math.round(128 + (n - 0.5) * 64)));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _terrMatPat = ctx.createPattern(c, "repeat");
  return _terrMatPat;
}

/* ---------- 浅滩色带（离屏低分辨率 → 双线性放大 → 连续水深渐变） ----------
   逐格画的水面只有「近/远」两色硬切，岸线是格子边缘。这里把
   「到岸距离」烘成一张 cols×rows 的小图（近岸不透明、远处透明），
   放大绘制（imageSmoothingQuality=high → 双线性），得到一条连续的
   浅滩→深水过渡带，岸线不再是一格一格跳变。 */
const _terrShoreCache = new Map();
function terrShoreLayer(tileAt, cols, rows, ts, key, shoreHex, reach) {
  const ck = key + "|" + shoreHex + "|" + reach;
  if (_terrShoreCache.has(ck)) return _terrShoreCache.get(ck);
  const depth = terrDepthMap(tileAt, cols, rows, key);
  const c = document.createElement("canvas"); c.width = cols; c.height = rows;
  const g = c.getContext("2d");
  const img = g.createImageData(cols, rows);
  const rgb = terrRgb(shoreHex);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const d = terrDepthAt(depth, cols, cx, cy);
    if (d === 0) continue;                      /* 陆地：透明 */
    const a = d >= reach ? 0 : Math.round(255 * (1 - d / reach) * (1 - d / reach));
    const i = (cy * cols + cx) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
    img.data[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const layer = { canvas: c, w: cols * ts, h: rows * ts };
  _terrShoreCache.set(ck, layer);
  return layer;
}

/* ---------- 水面场（低分辨率离屏 → 双线性放大 → 连续水深渐变） ----------
   逐格平涂的水面，即使按到岸距离调色，相邻格仍有可见色阶 → 岸线一格一格跳。
   这里把水面烘成 cols×rows 的小图（每像素 = 按深度的水色），放大绘制
   （imageSmoothingQuality=high → 双线性）→ 连续的浅滩→深水过渡。
   陆地格在图里垫「最浅水色」，放大后不会在岸边留半透明缝（陆地随后被顶面盖住）。 */
const _terrWaterCache = new Map();
function terrWaterField(tileAt, cols, rows, ts, key, colorFn) {
  const ck = "wf|" + key;
  if (_terrWaterCache.has(ck)) return _terrWaterCache.get(ck);
  const depth = terrDepthMap(tileAt, cols, rows, key);
  const c = document.createElement("canvas"); c.width = cols; c.height = rows;
  const g = c.getContext("2d");
  const img = g.createImageData(cols, rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const isLand = tileAt(cx, cy) !== "~";
    const dep = isLand ? 1 : terrDepthAt(depth, cols, cx, cy);
    const rgb = terrRgb(colorFn(dep));
    const i = (cy * cols + cx) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const layer = { canvas: c, w: cols * ts, h: rows * ts };
  _terrWaterCache.set(ck, layer);
  return layer;
}

/* ---------- 公共后处理：材质噪点 + 浅滩带 + 统一方向光 ----------
   cfg = { tileAt, cols, rows, ts, seed, shore, shoreReach, light } */
function terrPaint(cfg) {
  if (!cfg || !cfg.tileAt) return;
  const cols = cfg.cols, rows = cfg.rows, ts = cfg.ts;
  const W = cols * ts, H = rows * ts;

  /* ① 浅滩色带：铺在整幅岛上（陆地像素透明），双线性放大 → 岸线连续 */
  if (cfg.shore) {
    const layer = terrShoreLayer(cfg.tileAt, cols, rows, ts, cfg.key || "t", cfg.shore, cfg.shoreReach || 5);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(layer.canvas, 0, 0, layer.w, layer.h);
    ctx.restore();
  }

  /* ② 材质噪点：裁剪到陆地格，soft-light 叠加——纸/岩/草都有颗粒，不再是塑料色块 */
  ctx.save();
  ctx.beginPath();
  let any = false;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (cfg.tileAt(cx, cy) === "~") continue;
    ctx.rect(cx * ts, cy * ts, ts, ts);
    any = true;
  }
  if (any) {
    ctx.clip();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = terrMatPattern();
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* ③ 统一方向光：左上暖亮 → 右下冷暗（2D 侧此前完全没有光源方向） */
  if (cfg.light !== false) {
    const g = ctx.createLinearGradient(0, 0, W * 0.85, H);
    g.addColorStop(0, "rgba(255,238,196,0.13)");
    g.addColorStop(0.45, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(24,34,58,0.16)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
