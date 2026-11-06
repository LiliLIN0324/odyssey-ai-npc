// 种子化 2D value noise + fbm(HANDOFF P1 任务 1)。
// 同一种子输出确定:交接后任何人可复现同一座岛(ISLAND_SEED 冻结在 world.js)。

// 整数格点 -> [0,1) 的确定性哈希
function hash2(x, y, seed) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// 双线性插值 value noise,输出 [0,1]
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return v00 + (v10 - v00) * u + (v01 - v00) * v + (v00 - v10 - v01 + v11) * u * v;
}

// 分形布朗运动:多层噪声叠加,输出约 [0,1](均值 0.5 附近)
export function fbm(x, y, seed = 0, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// 种子化伪随机数生成器(草卡分布、火粒参数都用它,保证确定性)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
