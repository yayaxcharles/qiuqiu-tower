import { describe, expect, it, vi } from 'vitest';
import { transformWithOxc } from 'vite';
import SRC from '../../src/ui/screens/combat.ts?raw';
import { cardById } from '../../src/content/cards';
import { companionCardAction } from '../../src/ui/companion-motion';
import { qiuqiuShouldPlayHurt } from '../../src/ui/qiuqiu-combat-motion';

function branch(start: string, end: string): string {
  const source = SRC.replace(/\r\n/g, '\n');
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`找不到分支：${start}`);
  return source.slice(first, last);
}

async function execute(source: string, bindings: Record<string, unknown>): Promise<unknown> {
  const result = await transformWithOxc(source, 'qiuqiu-feedback.ts');
  return new Function(...Object.keys(bindings), result.code)(...Object.values(bindings));
}

describe('食物與特殊招式不被通用施術蓋掉', () => {
  it.each([false, true])('偷吃術升級為 %s 時，靜態備援也保持吃飯姿勢', async (upgraded) => {
    const def = cardById.touchi!;
    const code = branch('const EAT_CARDS:', 'const EAT_POTIONS:')
      + branch('function cardPose(', '/** 用忍具時球球')
      + '\nreturn cardPose("ninja", def, effects);';
    const pose = await execute(code, {
      def, effects: upgraded ? def.upgrade.effects : def.effects,
      THROW_CARDS: new Set(), SKILL_POSE: {}, ATTACK_POSE: {},
      POSE: { attack: 'attack' }, posePick: (_hero: string, family: string) => family,
    });
    expect(pose).toEqual({ pose: 'eat', attack: false });
  });

  it.each(['ninja', 'feifei', 'dangdang', 'fengfeng'])('%s 的食物忍具都使用吃喝動作', async (hero) => {
    const code = branch('const EAT_POTIONS:', '/*')
      + branch('function potionPose(', '/** 出手時該用')
      + '\nreturn ids.map(id => potionPose(hero, id));';
    const result = await execute(code, {
      hero, ids: ['onigiri', 'catgrass_tea', 'dried_fish_bundle', 'tuna', 'milk'],
      THROW_POTIONS: new Set(), POSE: { eat: 'eat', skill: 'spell' }, hasHeroSprite: () => true,
    });
    expect(result).toEqual(Array.from({ length: 5 }, () => ({ pose: 'eat' })));
  });

  // 2026-09-22 前這三個家族在同伴身上刻意選不到動作（退回專用靜態立繪）；使用者裁定補新圖後改成有自己的逐格動作：
  // 吼（含獅吼功）、太極是新畫的，輕功沿用閃身，借力使力（攻擊牌裡的太極）沿用既有攻擊。
  it.each([
    ['feifei', ['roar', 'roar', 'roar', 'roar', 'roll', 'roll', 'roll', 'taiji', 'roar', 'kick']],
    ['fengfeng', ['roar', 'roar', 'roar', 'roar', 'dodge', 'dodge', 'dodge', 'taiji', 'roar', 'retreat_thrust']],
  ] as const)('%s 的吼叫、輕功及太極有自己的逐格動作', async (hero, expected) => {
    const cards = ['weihe', 'chudashi', 'youcike', 'boming', 'gaotui', 'yixing', 'diaohu', 'yide', 'shihou', 'jiedao'];
    const code = branch('const SKILL_POSE:', '/** 吃喝姿勢')
      + branch('  const motionForCard = (', '  const scheduleMotionImpact =')
      + '\nreturn cards.map(cardId => motionForCard({ hero }, { cardId }));';
    const bindings = (playable: boolean) => ({
      hero, cards, motionEnabled: true, motionSourceFor: () => hero, ATTACK_POSE: { shihou: 'roar', jiedao: 'taiji' },
      cardStats: (card: { cardId: string }) => ({ def: cardById[card.cardId], effects: cardById[card.cardId]!.effects }),
      companionKind: (source: string) => source, companionCardAction,
      // 新補的吼、太極是延後下載的：圖還沒到時交還靜態立繪（其餘預載的動作照播）
      companionCardMotionPlayable: (_kind: string, action: string) => playable || !['roar', 'taiji'].includes(action),
    });
    expect(await execute(code, bindings(true))).toEqual(expected);
    expect(await execute(code, bindings(false))).toEqual(expected.map((action) => (
      action === 'roar' || action === 'taiji' ? undefined : action)));
  });

  it.each(['qiuqiu', 'feifei', 'dangdang', 'fengfeng'])('%s 自己施展回血招式不再被吃飯反應覆蓋', async (hero) => {
    for (const opts of [{ pose: 'taiji' }, { impactSeat: 0 }, { pose: 'taiji', impactSeat: 0 }]) {
      const playMotion = vi.fn();
      const q = { seat: 0, hp: 45, block: 0, down: false };
      await execute(branch('    for (const q of cs.players) {\n      const source = motionSourceFor(q);', '    const feifeiNeedleAction'), {
        cs: { players: [q] }, motionSourceFor: () => hero, comparison: undefined,
        before: { players: new Map([[0, { hp: 40, block: 0, stealth: 0 }]]) },
        getStatus: () => 0, comparedPhase: 'player', opts, mySeat: 0, impactMotion: undefined,
        qiuqiuShouldPlayHurt, enemyActed: false, fresh: [], motionActors: new Map(), playMotion, idleMotion() {},
      });
      expect(playMotion).not.toHaveBeenCalled();
    }
  });
});
