import { DIFFICULTY_NAMES, DIFFICULTY_TEXT, MAX_DIFFICULTY } from '../../content/difficulty';
import { hasSave, loadBestFor, selectedDifficulty, setSelectedDifficulty, unlockedDifficulty } from '../../engine/save';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { el } from '../dom';
import { screenBg } from '../screenbg';

registerScreen('title', (app, root) => {
  // 「種子」是程式用語，玩家看不懂，還會誤以為是存檔碼（存檔是自動的、存在瀏覽器裡）。
  // 畫面上一律講「本局代碼」，並在提示裡講清楚它的作用。
  const seed = el('input', {
    class: 'seed', placeholder: '本局代碼（可留空）',
    title: '填同一組代碼會生出一模一樣的塔：地圖、遭遇、罐頭鋪的貨全部一樣。留空就隨機開一局。',
  });
  // 難度選擇（2026-09-02）：五級、通關才解鎖下一級；選到哪級就顯示哪級的最佳成績與這級多了什麼
  let level = selectedDifficulty();
  const unlocked = unlockedDifficulty();
  const bestLine = el('div', { class: 'title-best' });
  const diffText = el('div', { class: 'diff-text' });
  const diffBtns: HTMLButtonElement[] = [];
  const refreshDiff = (): void => {
    const best = loadBestFor(level);
    bestLine.textContent = best ? `難度 ${level} 最佳成績：到達 ${best.floor}F${best.won ? '（通關）' : ''}` : `難度 ${level} 還沒有成績`;
    diffText.textContent = `${DIFFICULTY_NAMES[level - 1]}：${DIFFICULTY_TEXT[level - 1]}${level > 1 ? '（含前面各級）' : ''}`;
    diffBtns.forEach((b, i) => b.classList.toggle('selected', i + 1 === level));
  };
  for (let i = 1; i <= MAX_DIFFICULTY; i++) {
    const locked = i > unlocked;
    const b = el('button', { class: 'btn small diff-btn' + (locked ? ' locked' : ''), ...(locked ? { disabled: 'disabled' } : {}),
      onclick: () => { level = i; setSelectedDifficulty(i); refreshDiff(); } }, locked ? `🔒 ${i}` : `${i} ${DIFFICULTY_NAMES[i - 1]}`) as HTMLButtonElement;
    if (locked) b.title = `通關難度 ${i - 1} 才解鎖`;
    diffBtns.push(b);
  }
  refreshDiff();
  root.append(screenBg('bg/screen_title'));
  // 飄落的花瓣與落葉：畫面靜止時總得有東西在動（跟戰鬥的浮塵同一個道理）。
  // 十片各自的起點、時長、延遲都拉開，看起來才不像輸送帶。
  root.append(el('div', { class: 'title-petals' },
    ...Array.from({ length: 10 }, (_, i) => el('i', {
      style: `left:${(i * 9.7 + 3) % 100}%; animation-duration:${9 + (i * 2.3) % 8}s; ` +
        `animation-delay:${-(i * 1.7) % 12}s; --sway:${34 + (i * 13) % 40}px;`,
      class: i % 3 === 0 ? 'sakura' : 'leaf',
    }))));
  root.append(
    el('div', { class: 'title-screen' },
      // 陰影跟戰鬥畫面同一招：去背的角色貼在背景上就是浮著，腳下墊一片橢圓才像站著
      el('div', { class: 'title-cat-box' },
        el('div', { class: 'ground-shadow' }),
        // 封面主圖用 LINE 貼圖的「參上」那張（使用者指定）：爆炸背景＋題字，比乾站著的立繪有氣勢
        el('img', { class: 'title-cat', src: artUrl('sprites', 'hero/cover'), alt: '球球參上' })),
      // 正式名（2026-09-01 定案）：主標走「殺戮尖塔」式的四字重名，球球退到副標——
      // 他還是主角，但招牌要像作品名，不是一句口語
      el('h1', {}, '爪破魔塔'),
      el('div', { class: 'title-sub' }, '－ 球球參上 －'),
      el('div', { class: 'title-buttons' },
        el('button', { class: 'btn primary', onclick: () => app.newRun(seed.value, level) }, '新的一局'),
        // 沒存檔時才加 disabled：這個屬性只要存在就會生效，給空字串也一樣
        el('button', { class: 'btn', ...(hasSave() ? {} : { disabled: 'disabled' }), onclick: () => { if (!app.continueRun()) app.show('title'); } }, '續玩'),
        seed),
      el('div', { class: 'diff-picker' }, el('span', { class: 'diff-label' }, '難度'), ...diffBtns),
      diffText,
      bestLine,
      el('div', { class: 'title-note' }, '存檔存在這台電腦的瀏覽器裡。'),
      // 版權列：使用者 2026-09-02 指定放製作者與信箱
      el('div', { class: 'title-credit' }, '© 2026 葉彥呈 Charles Y.C. Yeh ｜ yayaxyayax@gmail.com')));
});
