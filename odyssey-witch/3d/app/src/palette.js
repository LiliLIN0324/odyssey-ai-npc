// 全项目唯一色板来源(HANDOFF.md §2.1)——任何模块禁止散落硬编码颜色。
// 取值来自 odyssey-witch/odyssey-visual.md 第三章「转译到我们游戏的色调方案」。
import * as THREE from 'three';

export const PALETTE = {
  oceanDeep:  0x123c58,  // 外海
  oceanMid:   0x2f6590,  // 主海面
  oceanShore: 0x4f8fb5,  // 近岸
  cliffLight: 0xe0bd84,  // 崖面阳面 / 沙滩
  cliffDark:  0x7c5c38,  // 崖面暗面
  grassMain:  0xa8cf8e,  // 草地主绿
  grassDeep:  0x7d9c66,  // 草地深绿
  duskGold:   0xe8a84a,  // 黄昏金色逆光(主光颜色)
  fireOrange: 0xe0783a,  // 火把/坩埚火光
  nightBase:  0x0c1018,  // 夜/冥界近黑(P7 事件用)
  phosphor:   0x7fd1c8,  // 冷磷光(P7 事件用)
  heroTunic:  0xe8dcc0,  // P4 角色：亚麻短衣
  heroSkin:   0xd9a97e,  // P4 角色：皮肤
  heroHair:   0x2a2320,  // P4 角色：头发/长枪杆
};

// 光源统一左上(odyssey-visual.md「统一左上光源」)——P1 的天空 shader、P7 的光照事件都复用此方向。
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.7, 0.45).normalize();
