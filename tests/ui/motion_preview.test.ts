import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { playCard } from '../../src/engine/combat';
import { cardStats } from '../../src/engine/deck';
import { addStatus, getStatus } from '../../src/engine/statuses';
import {
  FEIFEI_MOTION_PREVIEW_ACTIONS,
  FEIFEI_MOTION_PREVIEW_GROUPS,
  DANGDANG_MOTION_PREVIEW_ACTIONS,
  DANGDANG_MOTION_PREVIEW_GROUPS,
  FENGFENG_MOTION_PREVIEW_ACTIONS,
  FENGFENG_MOTION_PREVIEW_GROUPS,
  MOTION_PREVIEW_ACTIONS,
  MOTION_PREVIEW_GROUPS,
  createMotionPreviewState,
  type MotionPreviewGroup,
} from '../../src/ui/motion-preview';

describe('球球動作試玩局', () => {
  it.each([['sanjo', 6], ['huixuan', 7]] as const)('%s 每次只傷害選定的魔物', (cardId, damage) => {
    for (const targetIndex of [0, 1]) {
      const { cs } = createMotionPreviewState();
      const card = cs.player.hand.find((one) => one.cardId === cardId)!;
      const hpBefore = cs.enemies.map((enemy) => enemy.hp);
      expect(playCard(cs, card.uid, cs.enemies[targetIndex]!.uid, 0)).toBe(true);
      expect(cs.enemies.map((enemy, index) => hpBefore[index]! - enemy.hp))
        .toEqual(targetIndex === 0 ? [damage, 0] : [0, damage]);
    }
  });

  it('快速交替選擇目標，每張牌仍只扣該目標的生命', () => {
    const { cs } = createMotionPreviewState();
    const cards = cs.player.hand.filter((card) => card.cardId !== 'luanwu');
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i]!;
      const targetIndex = i % 2;
      const hpBefore = cs.enemies.map((enemy) => enemy.hp);
      const damage = card.cardId === 'huixuan' ? 7 : card.cardId === 'roubao' ? 8 : 6;
      expect(playCard(cs, card.uid, cs.enemies[targetIndex]!.uid, 0)).toBe(true);
      expect(cs.enemies.map((enemy, index) => hpBefore[index]! - enemy.hp))
        .toEqual(targetIndex === 0 ? [damage, 0] : [0, damage]);
    }
  });

  it.each([5, 10])('同名老鼠以各自的命中紀錄區分格擋，含防禦 %i 的情況', (block) => {
    const { cs } = createMotionPreviewState();
    const target = cs.enemies[1]!;
    target.block = block;
    const hitStart = cs.hits.length;
    expect(cs.enemies[0]!.name).toBe(target.name);
    expect(playCard(cs, cs.player.hand[0]!.uid, target.uid, 0)).toBe(true);
    expect(cs.hits.slice(hitStart)).toEqual([{ uid: target.uid, amount: Math.max(0, 6 - block) }]);
    expect(cs.enemies[0]!.hp).toBe(9999);
    expect(cs.enemies[0]!.block).toBe(0);
  });

  it('每次建立獨立戰鬥，提供爪擊、迴旋踢與手裏劍亂舞', () => {
    const { run, cs } = createMotionPreviewState();
    expect(run.floor).toBe(2);
    expect(cs.player.hand.map((c) => c.cardId)).toEqual([
      'sanjo', 'sanjo', 'sanjo', 'sanjo', 'huixuan', 'roubao', 'luanwu',
    ]);
    const other = createMotionPreviewState();
    cs.player.hp = 1;
    expect(other.cs.player.hp).toBe(other.cs.player.maxHp - 24);
  });

  it('使用真正出牌與傷害規則，目標能承受整套試打', () => {
    const { cs } = createMotionPreviewState();
    const target = cs.enemies[0]!;
    const hp = target.hp;
    for (const card of [...cs.player.hand]) {
      expect(cardStats(card).cost).toBe(card.cardId === 'luanwu' || card.cardId === 'roubao' ? 2 : 1);
      expect(playCard(cs, card.uid, target.uid, 0)).toBe(true);
    }
    expect(cs.player.hand).toHaveLength(0);
    expect(target.hp).toBeLessThan(hp);
    expect(target.dead).toBe(false);
    expect(cs.phase).toBe('player');
  });

  it.each([false, true])('手裏劍照原牌面分兩段打全體，升級=%s', (upgraded) => {
    const { cs } = createMotionPreviewState();
    const card = cs.player.hand.find((one) => one.cardId === 'luanwu')!;
    card.upgraded = upgraded;
    const start = cs.hits.length;
    expect(playCard(cs, card.uid, undefined, 0)).toBe(true);
    for (const enemy of cs.enemies) {
      const damage = upgraded ? 7 : 5;
      expect(cs.hits.slice(start).filter((hit) => hit.uid === enemy.uid).map((hit) => hit.amount))
        .toEqual([damage, damage]);
      expect(enemy.hp).toBe(9999 - damage * 2);
    }
    expect(cs.player.energy).toBe(10);
  });
});

describe('球球動作試玩牌組', () => {
  const groups = Object.keys(MOTION_PREVIEW_GROUPS) as MotionPreviewGroup[];

  it('四組只使用真實球球卡牌，並保留大招組的升級亂舞', () => {
    expect(groups).toEqual(['basic', 'ninjutsu', 'ultimate', 'defense']);
    expect(MOTION_PREVIEW_GROUPS.basic.cards).toEqual([
      { cardId: 'sanjo', upgraded: false },
      { cardId: 'sanjo', upgraded: false },
      { cardId: 'sanjo', upgraded: false },
      { cardId: 'sanjo', upgraded: false },
      { cardId: 'huixuan', upgraded: false },
      { cardId: 'roubao', upgraded: false },
      { cardId: 'luanwu', upgraded: false },
    ]);
    expect(MOTION_PREVIEW_GROUPS.ninjutsu.cards.map((card) => card.cardId))
      .toEqual(['bunshin', 'ruying', 'canying', 'shunkan', 'dilie', 'bengquan', 'caiweiba']);
    expect(MOTION_PREVIEW_GROUPS.ultimate.cards).toEqual([
      { cardId: 'liandao', upgraded: false },
      { cardId: 'shierlian', upgraded: false },
      { cardId: 'shibadie', upgraded: false },
      { cardId: 'luanwu', upgraded: true },
      { cardId: 'lianhuan', upgraded: false },
      { cardId: 'shihou', upgraded: false },
      { cardId: 'tietou', upgraded: false },
    ]);
    expect(MOTION_PREVIEW_GROUPS.defense.cards.map((card) => card.cardId))
      .toEqual(['tanding', 'tiebushan', 'guixi', 'kawarimi', 'zhangyan']);
    for (const group of groups) {
      for (const card of MOTION_PREVIEW_GROUPS[group].cards) {
        expect(cardById[card.cardId], `${group}/${card.cardId} 不是真實卡牌`).toBeDefined();
        expect([undefined, 'ninja']).toContain(cardById[card.cardId]!.hero);
      }
    }
  });

  it.each(groups)('%s 組有足夠飯糰連續打完整手牌，目標不會提早死亡', (group) => {
    const { cs } = createMotionPreviewState(group);
    const cards = [...cs.player.hand];
    const totalCost = cards.reduce((sum, card) => sum + cardStats(card).cost, 0);
    expect(cs.player.energy).toBeGreaterThanOrEqual(totalCost);
    expect(cs.player.maxEnergy).toBe(cs.player.energy);
    for (const card of cards) {
      const def = cardById[card.cardId]!;
      const targetUid = def.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
      expect(playCard(cs, card.uid, targetUid, 0), `${group}/${card.cardId} 應可連續打出`).toBe(true);
    }
    expect(cs.player.energy).toBe(cs.player.maxEnergy - totalCost);
    expect(cs.phase).toBe('player');
    expect(cs.enemies.every((enemy) => !enemy.dead && enemy.maxHp === 9999)).toBe(true);
  });

  it('切組會建立乾淨的新戰鬥狀態，生命與前一組效果不會殘留', () => {
    const first = createMotionPreviewState('ninjutsu');
    first.cs.player.hp = 1;
    first.cs.enemies[0]!.hp = 1;
    first.cs.player.block = 99;
    const second = createMotionPreviewState('defense');
    expect(second.cs.player.hp).toBeLessThan(second.cs.player.maxHp);
    expect(second.cs.player.hp).toBeGreaterThan(1);
    expect(second.cs.player.block).toBe(0);
    expect(second.cs.enemies.every((enemy) => enemy.hp === 9999)).toBe(true);
    expect(second.cs.player.hand.map((card) => card.cardId))
      .toEqual(['tanding', 'tiebushan', 'guixi', 'kawarimi', 'zhangyan']);
  });
});

describe('菲菲共通針術的真實結算', () => {
  it.each([
    ['paozhao', 1], ['roubao', 2], ['lianhuan', 3], ['huixuan', 1], ['dieda', 1],
    ['bengquan', 1], ['jiuweiquan', 1], ['zuiquan', 1], ['caiweiba', 1], ['ehou', 1],
  ] as const)('%s 保留原牌的 %i 段命中', (cardId, waves) => {
    const { run, cs } = createMotionPreviewState('basic', 'feifei');
    const card = { uid: run.nextUid++, cardId, upgraded: false };
    cs.player.hand = [card];
    cs.player.energy = 12;
    const target = cs.enemies[0]!;
    const hitStart = cs.hits.length;
    expect(playCard(cs, card.uid, target.uid, 0)).toBe(true);
    expect(cs.hits.slice(hitStart).filter((hit) => hit.uid === target.uid)).toHaveLength(waves);
  });
});

describe('獨立動作展示', () => {
  it('涵蓋全部球球動作且沒有重複，包含新增攻擊姿勢', () => {
    const actions = MOTION_PREVIEW_ACTIONS.map((entry) => entry.action);
    expect(actions).toEqual([
      'idle', 'hurt', 'down', 'walk', 'run', 'roll', 'jump', 'land',
      'attack1', 'attack2', 'attack3', 'attack4', 'attack_run', 'attack_air',
      'dash', 'clone', 'clone_duo', 'shuriken', 'kick', 'seal', 'storm', 'rush',
      'combo_kick', 'uppercut', 'flying_kick', 'roar', 'ground_slam', 'body_bash', 'palm_combo',
      'ultimate_clone', 'ultimate_storm', 'ultimate_rush',
      'guard', 'eat', 'win', 'poison', 'belly', 'puff', 'stealth', 'defeat',
    ]);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual(expect.arrayContaining(['guard', 'eat', 'win', 'poison', 'belly', 'defeat']));
  });

  it('菲菲頁列出九張針牌的獨立動作、舊相容動作與其他整身動作', () => {
    const actions = FEIFEI_MOTION_PREVIEW_ACTIONS.map((entry) => entry.action);
    expect(actions).toEqual([
      'idle', 'hurt', 'run', 'roll', 'attack1', 'shuriken', 'storm',
      'needle_combo', 'needle_backhand', 'needle_venom', 'needle_pierce',
      'needle_retreat', 'needle_fan', 'needle_rain', 'needle_barrage', 'kick',
      'seal', 'clone', 'guard', 'eat', 'win', 'poison', 'defeat',
    ]);
    expect(new Set(actions).size).toBe(actions.length);
  });
});

describe('菲菲動作試玩局', () => {
  it('四組都只放真實菲菲牌，切換角色會建立獨立菲菲戰鬥', () => {
    for (const group of Object.values(FEIFEI_MOTION_PREVIEW_GROUPS)) {
      for (const card of group.cards) expect(cardById[card.cardId]?.hero).toBe('feifei');
    }
    const { run, cs } = createMotionPreviewState('basic', 'feifei');
    expect(run.players[0]!.hero).toBe('feifei');
    expect(cs.player.hero).toBe('feifei');
    expect(cs.player.hand.map((card) => card.cardId)).toEqual([
      'feifei_feizhen', 'feifei_lianzhen', 'feifei_shouhua',
      'feifei_tuikai', 'feifei_cuidu',
    ]);
    expect(cs.player.energy).toBe(12);
    expect(cs.enemies.every((enemy) => enemy.hp === 9999)).toBe(true);
  });

  it('連針在真實規則中按兩段命中，不修改正式牌表', () => {
    const { cs } = createMotionPreviewState('basic', 'feifei');
    const card = cs.player.hand.find((one) => one.cardId === 'feifei_lianzhen')!;
    const target = cs.enemies[0]!;
    const start = cs.hits.length;
    expect(playCard(cs, card.uid, target.uid, 0)).toBe(true);
    expect(cs.hits.slice(start).filter((hit) => hit.uid === target.uid).map((hit) => hit.amount))
      .toEqual([2, 2]);
  });

  it('升級連針保留三段，隱身只吃掉第一段而不截斷後續命中', () => {
    const { cs } = createMotionPreviewState('ultimate', 'feifei');
    const card = cs.player.hand.find((one) => one.cardId === 'feifei_lianzhen' && one.upgraded)!;
    const target = cs.enemies[0]!;
    addStatus(target, '隱身', 1);
    const start = cs.hits.length;
    expect(playCard(cs, card.uid, target.uid, 0)).toBe(true);
    expect(getStatus(target, '隱身')).toBe(0);
    expect(cs.hits.slice(start).filter((hit) => hit.uid === target.uid).map((hit) => hit.amount))
      .toEqual([2, 2]);
  });

  it('手滑只命中一次並照牌面自傷二點', () => {
    const { cs } = createMotionPreviewState('basic', 'feifei');
    const card = cs.player.hand.find((one) => one.cardId === 'feifei_shouhua')!;
    const target = cs.enemies[0]!;
    const start = cs.hits.length;
    const hp = cs.player.hp;
    expect(playCard(cs, card.uid, target.uid, 0)).toBe(true);
    expect(cs.hits.slice(start).filter((hit) => hit.uid === target.uid)).toHaveLength(1);
    expect(hp - cs.player.hp).toBe(2);
  });

  it('三張全體針牌每隻敵人都只有一筆真命中，畫面散針不增加段數', () => {
    for (const cardId of ['feifei_sazhen', 'feifei_zhenyu', 'feifei_quansale']) {
      const { cs } = createMotionPreviewState('ninjutsu', 'feifei');
      const card = cs.player.hand.find((one) => one.cardId === cardId)!;
      const start = cs.hits.length;
      expect(playCard(cs, card.uid, undefined, 0), cardId).toBe(true);
      for (const enemy of cs.enemies) {
        expect(cs.hits.slice(start).filter((hit) => hit.uid === enemy.uid), `${cardId}/${enemy.uid}`)
          .toHaveLength(1);
      }
    }
  });

  it('一針斃命條件失敗不寫入命中，見血封喉有毒時只命中一次', () => {
    const failed = createMotionPreviewState('ultimate', 'feifei').cs;
    const pierce = failed.player.hand.find((one) => one.cardId === 'feifei_yizhen')!;
    const failedTarget = failed.enemies[0]!;
    const failedStart = failed.hits.length;
    expect(playCard(failed, pierce.uid, failedTarget.uid, 0)).toBe(true);
    expect(failed.hits.slice(failedStart).filter((hit) => hit.uid === failedTarget.uid)).toEqual([]);

    const venom = createMotionPreviewState('ninjutsu', 'feifei').cs;
    const card = venom.player.hand.find((one) => one.cardId === 'feifei_jianxue')!;
    const target = venom.enemies[0]!;
    addStatus(target, '中毒', 5);
    const start = venom.hits.length;
    expect(playCard(venom, card.uid, target.uid, 0)).toBe(true);
    expect(venom.hits.slice(start).filter((hit) => hit.uid === target.uid)).toHaveLength(1);
  });

  it('四組直接涵蓋九張針牌，並保留基礎與升級連針', () => {
    const cards: Array<{ cardId: string; upgraded: boolean }> = [];
    for (const group of Object.values(FEIFEI_MOTION_PREVIEW_GROUPS)) cards.push(...group.cards);
    const needleIds = new Set([
      'feifei_feizhen', 'feifei_lianzhen', 'feifei_shouhua',
      'feifei_jianxue', 'feifei_yizhen', 'feifei_buyaoguolai',
      'feifei_sazhen', 'feifei_zhenyu', 'feifei_quansale',
    ]);
    expect(new Set(cards.filter((card) => needleIds.has(card.cardId)).map((card) => card.cardId)))
      .toEqual(needleIds);
    expect(cards).toEqual(expect.arrayContaining([
      { cardId: 'feifei_lianzhen', upgraded: false },
      { cardId: 'feifei_lianzhen', upgraded: true },
    ]));
  });
});

describe('噹噹動作試玩', () => {
  it('四組都使用真實噹噹牌，建立隔離且耐打的噹噹戰鬥', () => {
    for (const group of Object.values(DANGDANG_MOTION_PREVIEW_GROUPS)) {
      for (const card of group.cards) expect([undefined, 'dangdang']).toContain(cardById[card.cardId]?.hero);
    }
    const { run, cs } = createMotionPreviewState('basic', 'dangdang');
    expect(run.players[0]!.hero).toBe('dangdang');
    expect(cs.player.hero).toBe('dangdang');
    expect(cs.player.energy).toBe(12);
    expect(cs.enemies.every((enemy) => enemy.hp === 9999)).toBe(true);
  });

  it('四組都能依真牌規則連續出完，切組不殘留前場', () => {
    for (const groupName of Object.keys(DANGDANG_MOTION_PREVIEW_GROUPS) as MotionPreviewGroup[]) {
      const { cs } = createMotionPreviewState(groupName, 'dangdang');
      for (const card of [...cs.player.hand]) {
        const def = cardById[card.cardId]!;
        const targetUid = def.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
        expect(playCard(cs, card.uid, targetUid, 0), `${groupName}/${card.cardId}`).toBe(true);
      }
      expect(cs.phase).toBe('player');
      expect(cs.enemies.every((enemy) => !enemy.dead)).toBe(true);
    }
  });

  it('試打直接包含四種新攻擊的代表牌', () => {
    const ids = Object.values(DANGDANG_MOTION_PREVIEW_GROUPS).flatMap((group) => group.cards.map((card) => card.cardId));
    expect(ids).toEqual(expect.arrayContaining([
      'dangdang_fanshou', 'dangdang_bengshan', 'luanwu', 'dangdang_sheshen',
    ]));
  });

  it.each([
    ['dangdang_fanshou', false, 2], ['dangdang_fanshou', true, 3],
    ['roubao', false, 2], ['shierlian', false, 3],
    ['luanwu', false, 2], ['lianhuan', false, 3],
  ] as const)('%s 升級=%s 保留原牌的 %i 段命中', (cardId, upgraded, waves) => {
    const { run, cs } = createMotionPreviewState('basic', 'dangdang');
    const card = { uid: run.nextUid++, cardId, upgraded };
    cs.player.hand = [card];
    cs.player.energy = 12;
    const def = cardById[cardId]!;
    const targetUid = def.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
    const start = cs.hits.length;
    expect(playCard(cs, card.uid, targetUid, 0)).toBe(true);
    const affected = def.target === 'all' ? cs.enemies : [cs.enemies[0]!];
    for (const enemy of affected) {
      expect(cs.hits.slice(start).filter((hit) => hit.uid === enemy.uid)).toHaveLength(waves);
    }
  });

  it('動作頁完整列出二十套整身影格且無重複', () => {
    const actions = DANGDANG_MOTION_PREVIEW_ACTIONS.map((entry) => entry.action);
    expect(actions).toEqual([
      'idle', 'hurt', 'run', 'dodge', 'punch', 'palm', 'kick', 'shoulder',
      'counter', 'ground_slam', 'rapid_combo', 'heavy_palm', 'sweep_combo', 'reckless_bash',
      'guard', 'focus', 'eat', 'win', 'poison', 'defeat',
    ]);
    expect(new Set(actions).size).toBe(actions.length);
  });
});

describe('封封動作試玩', () => {
  it('四組都使用真實封封牌，建立隔離且耐打的封封戰鬥', () => {
    for (const group of Object.values(FENGFENG_MOTION_PREVIEW_GROUPS)) {
      for (const card of group.cards) expect([undefined, 'fengfeng']).toContain(cardById[card.cardId]?.hero);
    }
    const { run, cs } = createMotionPreviewState('basic', 'fengfeng');
    expect(run.players[0]!.hero).toBe('fengfeng');
    expect(cs.player.hero).toBe('fengfeng');
    expect(cs.player.energy).toBe(12);
    expect(cs.enemies.every((enemy) => enemy.hp === 9999)).toBe(true);
  });

  it('四組都能依真牌規則連續出完，切組不殘留前場', () => {
    for (const groupName of Object.keys(FENGFENG_MOTION_PREVIEW_GROUPS) as MotionPreviewGroup[]) {
      const { cs } = createMotionPreviewState(groupName, 'fengfeng');
      for (const card of [...cs.player.hand]) {
        const def = cardById[card.cardId]!;
        const targetUid = def.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
        expect(playCard(cs, card.uid, targetUid, 0), `${groupName}/${card.cardId}`).toBe(true);
      }
      expect(cs.phase).toBe('player');
      expect(cs.enemies.every((enemy) => !enemy.dead)).toBe(true);
    }
  });

  it('試打直接包含四種新攻擊的代表牌', () => {
    const ids = Object.values(FENGFENG_MOTION_PREVIEW_GROUPS).flatMap((group) => group.cards.map((card) => card.cardId));
    expect(ids).toEqual(expect.arrayContaining([
      'liandao', 'fengfeng_duanliu', 'fengfeng_kaishan', 'fengfeng_huibu',
    ]));
  });

  it.each([
    ['liandao', 3], ['fengfeng_duanliu', 1], ['fengfeng_pozhen', 1],
    ['fengfeng_kaishan', 1], ['fengfeng_huibu', 1],
  ] as const)('%s 保留原牌的 %i 段命中', (cardId, waves) => {
    const { run, cs } = createMotionPreviewState('basic', 'fengfeng');
    const card = { uid: run.nextUid++, cardId, upgraded: false };
    cs.player.hand = [card];
    cs.player.energy = 12;
    const def = cardById[cardId]!;
    const targetUid = def.target === 'enemy' ? cs.enemies[0]!.uid : undefined;
    const start = cs.hits.length;
    expect(playCard(cs, card.uid, targetUid, 0)).toBe(true);
    const affected = def.target === 'all' ? cs.enemies : [cs.enemies[0]!];
    for (const enemy of affected) {
      expect(cs.hits.slice(start).filter((hit) => hit.uid === enemy.uid)).toHaveLength(waves);
    }
  });

  it('動作頁完整列出二十套整身影格且無重複', () => {
    const actions = FENGFENG_MOTION_PREVIEW_ACTIONS.map((entry) => entry.action);
    expect(actions).toEqual([
      'idle', 'hurt', 'run', 'dodge', 'slash', 'sweep', 'heavy_slash', 'thrust',
      'double_slash', 'sword_combo', 'qi_cleave', 'earth_split', 'retreat_thrust',
      'guard', 'focus', 'sheath', 'eat', 'win', 'poison', 'defeat',
    ]);
    expect(new Set(actions).size).toBe(actions.length);
  });
});
