import type { FrameMotion } from './frame-motion.ts';
import data from './hit-recoil-motion-data.json';

/**
 * 挨打那一下：一張新畫風的挨打立繪停 0.65 秒（2026-09-22 換圖）。
 *
 * 停留時間是 09-20 依使用者「挨打看不清楚」刻意拉長的——真正痛的那一格要停夠久，
 * 所以不跟其他逐格動作一起換成 1.5 倍速（比照舊版靜態演出的 650 毫秒）。
 * 09-22 之前這一格借的是舊版靜態挨打立繪（`assets/sprites/hero/<代號>_hit.webp`，
 * 現在只剩 `?motion=0` 的舊版演出在用）；新圖由 `tools/gen_hit_recoil_art.py` 生、
 * `tools/pack_hit_recoil_motion.py` 打包，比例尺與腳底定位點都是打包時對著新版待機第 1 格算的。
 */
export const HIT_HOLD_SECONDS = .65;

type Entry = Readonly<{
  texture: string;
  scale: number;
  rect: readonly [number, number, number, number];
  pivot: readonly [number, number];
}>;

function hitMotion(entry: Entry): FrameMotion {
  return {
    texture: entry.texture,
    scale: entry.scale,
    loop: false,
    frames: [{ rect: entry.rect, pivot: entry.pivot, duration: HIT_HOLD_SECONDS }],
  };
}

const heroes = data.heroes as unknown as Readonly<Record<'qiuqiu' | 'feifei' | 'dangdang' | 'fengfeng', Entry>>;

export const HIT_RECOIL_MOTIONS = {
  qiuqiu: hitMotion(heroes.qiuqiu),
  feifei: hitMotion(heroes.feifei),
  dangdang: hitMotion(heroes.dangdang),
  fengfeng: hitMotion(heroes.fengfeng),
};
