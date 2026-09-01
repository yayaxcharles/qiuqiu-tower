import { playCombat } from '../src/engine/bot';
import { startCombat } from '../src/engine/combat';
import { Rng, seedFromString } from '../src/engine/rng';

// 典型 15F 牌組：起手 10 張＋常見獎勵五張＋絕學一張，升三張
const DECK = [
  'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
  'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
  'shengdong', 'shengdong', 'fantan', 'shunfenger', 'qinna', 'jinzhong',
];
const RELICS = process.argv[2] ? process.argv[2].split(',') : [];
const ACT2 = ['ronin_duo', 'lantern_pair', 'ink_shami', 'tanuki_gang'];
const ACT3 = ['moon_rabbit', 'owl_sentry', 'paper_crane', 'night_panther', 'miasma_blob', 'crane_pair', 'night_hunt', 'shadow_cat'];
// 第三關等級的牌組：多四張常見攻防、升 12 張、帶鈴鐺＋鮪魚罐頭、85 血
const DECK3 = [...DECK, 'shengdong', 'shengdong', 'youcike', 'youcike'];
for (const enc of [...ACT2, ...ACT3]) {
  const late = ACT3.includes(enc);
  let win = 0, hpSum = 0;
  for (let i = 0; i < 40; i++) {
    const rng = new Rng(seedFromString(`probe-${enc}-${i}`));
    const deck = late ? DECK3 : DECK;
    const cs = startCombat({ encounterId: enc, deck: deck.map((id, j) => ({ uid: j, cardId: id, upgraded: j < (late ? 12 : 8) })), hp: late ? 85 : 70, maxHp: late ? 85 : 70, rng, relics: late ? ['bell', 'tuna_can'] : RELICS, potions: [] });
    playCombat(cs, rng, 120, `probe-${i}`);
    if (cs.phase === 'won') { win++; hpSum += cs.player.hp; }
    if (i < 0) console.log(`  種子${i}: ${cs.phase} 回合${cs.turn} 關主剩 ${cs.enemies[0]!.hp}/${cs.enemies[0]!.maxHp}`);
  }
  console.log(`${enc}: 勝 ${win}/40${win ? `，贏家平均剩血 ${(hpSum / win).toFixed(0)}` : ''}`);
}
