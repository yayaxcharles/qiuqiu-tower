import type { FrameMotion } from './frame-motion.ts';

// 舊立繪依 alpha > 16 的可見高度校準為 252 px；腳底沿用原圖實際位置。
function hitMotion(file: string, imageHeight: number, top: number, foot: number): FrameMotion {
  return {
    texture: `assets/sprites/hero/${file}_hit.webp`,
    scale: 252 / (foot - top),
    loop: false,
    frames: [{ rect: [0, 0, 560, imageHeight], pivot: [280, foot], duration: .65 }],
  };
}

export const LEGACY_HIT_MOTIONS = {
  qiuqiu: hitMotion('ninja', 547, 16, 541),
  feifei: hitMotion('feifei', 547, 5, 543),
  dangdang: hitMotion('dangdang', 547, 5, 543),
  fengfeng: hitMotion('fengfeng', 560, 22, 539),
};
