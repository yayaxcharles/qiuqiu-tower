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
for (const enc of ['nekomata', 'iron_claw']) {
  let win = 0, hpSum = 0;
  for (let i = 0; i < 60; i++) {
    const rng = new Rng(seedFromString(`probe-${enc}-${i}`));
    const cs = startCombat({ encounterId: enc, deck: DECK.map((id, j) => ({ uid: j, cardId: id, upgraded: j < 8 })), hp: 70, maxHp: 70, rng, relics: RELICS, potions: [] });
    playCombat(cs, rng, 120, `probe-${i}`);
    if (cs.phase === 'won') { win++; hpSum += cs.player.hp; }
    if (i < 0) console.log(`  種子${i}: ${cs.phase} 回合${cs.turn} 關主剩 ${cs.enemies[0]!.hp}/${cs.enemies[0]!.maxHp}`);
  }
  console.log(`${enc}: 勝 ${win}/60${win ? `，贏家平均剩血 ${(hpSum / win).toFixed(0)}` : ''}`);
}
