import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sfxFor } from '../../src/ui/sfxhero';

/** 菲菲的貓叫（2026-09-15）：受傷、勝利換成她的檔；其他音效與其他角色原樣 */
describe('音效依角色換檔', () => {
  it('菲菲的受傷與勝利換檔，其他不換', () => {
    expect(sfxFor('hurt', 'feifei')).toBe('hurt_feifei');
    expect(sfxFor('victory', 'feifei')).toBe('victory_feifei');
    expect(sfxFor('claw', 'feifei')).toBe('claw');
    expect(sfxFor('hurt', 'ninja')).toBe('hurt');
    expect(sfxFor('hurt', 'samurai')).toBe('hurt');
    expect(sfxFor('hurt', undefined)).toBe('hurt');
  });

  it('換到的檔真的在（不然她一被打就沒聲音）', () => {
    for (const f of ['hurt_feifei', 'victory_feifei']) {
      expect(existsSync(new URL(`../../public/assets/sfx/${f}.mp3`, import.meta.url)), f).toBe(true);
    }
  });
});
