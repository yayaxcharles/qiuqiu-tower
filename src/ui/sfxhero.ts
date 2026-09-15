import type { Sfx } from './audio';

/**
 * 角色專屬的音效版本（2026-09-15）：檔名＝`<音效>_<角色>`，放在 `public/assets/sfx/`。
 * 菲菲的貓叫是使用者自己從 Pixabay 載的（`_incoming/feifei_cute_cat_352656.mp3`，`volume=2.0` 對齊既有音效的響度），
 * 受傷與勝利先共用同一顆，之後給了第二顆再拆。沒列在這裡的角色（球球、鐵爪機關貓）照舊用共用的那顆。
 */
const HERO_SFX: Readonly<Record<string, readonly Sfx[]>> = { feifei: ['hurt', 'victory'] };

/** `play()` 進門先過這裡：這個角色有專屬版本就換檔名，沒有就原樣 */
export function sfxFor(name: Sfx, hero: string | undefined): Sfx {
  return hero && HERO_SFX[hero]?.includes(name) ? (`${name}_${hero}` as Sfx) : name;
}
