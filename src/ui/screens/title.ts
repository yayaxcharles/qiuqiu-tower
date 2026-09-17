import { DIFFICULTY_NAMES, DIFFICULTY_TEXT, MAX_DIFFICULTY } from '../../content/difficulty';
import { hasSave, loadBestFor, saveRun, selectedDifficulty, setSelectedDifficulty, unlockedDifficulty } from '../../engine/save';
import { SHARE_PREFIX, decodeRun } from '../../engine/sharecode';
import { showCompendium } from '../compendium';
import { showItemCompendium } from '../itemcompendium';
import { registerScreen } from '../app';
import { hasSprite, artUrl } from '../assets';
import { el } from '../dom';
import { screenBg } from '../screenbg';

registerScreen('title', (app, root) => {
  const startBtn = el('button', { class: 'btn primary' }, '新的一局');
  // 「種子」是程式用語，玩家看不懂，還會誤以為是存檔碼（存檔是自動的、存在瀏覽器裡）。
  // 畫面上一律講「本局代碼」，並在提示裡講清楚它的作用。
  const seed = el('input', {
    class: 'seed', placeholder: '本局代碼或局面碼（可留空）',
    title: '短代碼＝生出一模一樣的塔（地圖、遭遇、罐頭鋪的貨全部一樣），從第一層開始；別人給的長局面碼（QQT1~ 開頭）＝直接從他當時的位置接著打，牌組、秘寶、血量都是他的；留空就隨機開一局。',
  }) as HTMLInputElement;
  // 貼進來的是局面碼時，按鈕要改口，而且如果這台機器上有進度，得先講清楚會被蓋掉
  const shareNote = el('div', { class: 'title-note share-note' });
  const isShare = (): boolean => seed.value.trim().startsWith(SHARE_PREFIX);
  const refreshShare = (): void => {
    const share = isShare();
    // 這顆是全遊戲最不可逆的一顆（打到 30F 的存檔一按就沒了），代價要寫在鈕上，
    // 不能只放在旁邊那行小字（介面稽核 2026-09-16 高-5）
    startBtn.textContent = !share ? '新的一局'
      : hasSave() ? '載入這個局面（會蓋掉存檔）' : '載入這個局面';
    shareNote.textContent = !share ? ''
      : hasSave() ? '⚠ 這是別人的局面碼，載入會蓋掉你現在的續玩進度。'
        : '別人的局面碼：會從他當時的位置接著打（牌組、秘寶、血量都是他的）。';
    shareNote.classList.toggle('warn', share && hasSave());
  };
  seed.addEventListener('input', refreshShare);
  // 難度選擇（2026-09-02）：五級；2026-09-03 起預設全開放（unlockedDifficulty 固定回 5），選到哪級就顯示哪級的最佳成績與這級多了什麼
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
    const b = el('button', { class: `btn small diff-btn d${i}` + (locked ? ' locked' : ''), ...(locked ? { disabled: 'disabled' } : {}),
      onclick: () => { level = i; setSelectedDifficulty(i); refreshDiff(); } }, locked ? `🔒 ${i}` : `${i} ${DIFFICULTY_NAMES[i - 1]}`) as HTMLButtonElement;
    if (locked) b.title = `通關難度 ${i - 1} 才解鎖`;
    diffBtns.push(b);
  }
  refreshDiff();
  /**
   * 除錯模式的暗號（2026-09-14 使用者指定）。在這個欄位打  再按開始，
   * 就進到除錯畫面——把事件文字與插圖、牌面、台詞、立繪一次攤開，可以切角色對照。
   *
   * 刻意藏在既有欄位裡、不做成按鈕：那是給使用者自己檢查用的，不是遊戲的一部分。
   */
  const DEBUG_CODE = 'mimi36985';
  startBtn.addEventListener('click', () => {
    if (seed.value.trim().toLowerCase() === DEBUG_CODE) { app.show('debug'); return; }
    if (!isShare()) { app.show('heroselect', { seed: seed.value, difficulty: level }); return; }
    // 解壓縮是非同步的：先鎖住按鈕，免得連點兩次載入兩份
    startBtn.setAttribute('disabled', 'disabled');
    startBtn.textContent = '載入中…';
    void decodeRun(seed.value).then((res) => {
      startBtn.removeAttribute('disabled');
      if (!res.ok) { shareNote.textContent = `✗ ${res.why}`; shareNote.classList.add('warn'); refreshShareLabel(); return; }
      // 先存起來再開，這樣中途重整還能按「續玩」回到這個局面
      saveRun(res.run);
      if (!app.continueRun(res.run)) { shareNote.textContent = '✗ 這個局面載不起來。'; shareNote.classList.add('warn'); refreshShareLabel(); }
    });
  });
  const refreshShareLabel = (): void => { startBtn.textContent = isShare() ? '載入這個局面' : '新的一局'; };

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
      el('div', { class: hasSprite('hero/dangdang_cover') ? 'title-cat-box three' : 'title-cat-box' },
        el('div', { class: 'ground-shadow' }),
        /*
         * 排法：**菲菲左、球球中、噹噹右**（使用者 2026-09-17：「球球擺中間，他是主角」）。
         *
         * 所以 DOM 的順序就是畫面上的順序，不要再照「誰先做好」排。
         * 封面主圖一律用 LINE 貼圖的「參上」那張：爆炸背景加題字，比乾站著的立繪有氣勢。
         * 彈跳各錯開一拍（`base.css` 的 `animation-delay`），三隻才不會同時上下。
         */
        // 她的「參上」貼圖沒進倉時退回勝利姿勢的立繪（矮一截）
        hasSprite('hero/feifei_cover')
          ? el('img', { class: 'title-cat title-cat-second', src: artUrl('sprites', 'hero/feifei_cover'), alt: '菲菲參上' })
          : el('img', { class: 'title-cat title-cat-feifei', src: artUrl('sprites', 'hero/feifei_win'), alt: '菲菲' }),
        el('img', { class: 'title-cat', src: artUrl('sprites', 'hero/cover'), alt: '球球參上' }),
        // 三張並排之後每張都窄了一點，見 `base.css` 的 `.title-cat-box.three`
        ...(hasSprite('hero/dangdang_cover')
          ? [el('img', { class: 'title-cat title-cat-third', src: artUrl('sprites', 'hero/dangdang_cover'), alt: '噹噹參上' })]
          : [])),
      // 正式名（2026-09-01 定案）：主標走「殺戮尖塔」式的四字重名。
      // 副標「－ 球球參上 －」2026-09-15 拿掉（使用者：第三個角色進來之後首頁不該只掛他的名字）
      el('h1', {}, '爪破魔塔'),
      el('div', { class: 'title-buttons' },
        startBtn,
        // 沒存檔時才加 disabled：這個屬性只要存在就會生效，給空字串也一樣
        el('button', { class: 'btn', ...(hasSave() ? {} : { disabled: 'disabled' }), onclick: () => { if (!app.continueRun()) app.show('title'); } }, '續玩'),
        seed),
      el('div', { class: 'diff-picker' }, el('span', { class: 'diff-label' }, '難度'), ...diffBtns),
      // 圖鑑放封面（使用者：秘寶、忍具不需要一直看，不放遊戲內）
      el('div', { class: 'title-books' },
        el('button', { class: 'btn small', onclick: () => showCompendium() }, '📖 卡牌圖鑑'),
        el('button', { class: 'btn small', onclick: () => showItemCompendium() }, '🎒 秘寶與忍具圖鑑'),
        // 連線版還在做，按鈕先放這裡（這個網址本來就是實驗版，不會影響單機的那一份）
        el('button', { class: 'btn small', onclick: () => app.show('lobby') }, '🤝 兩個人一起玩')),
      diffText,
      bestLine,
      shareNote,
      el('div', { class: 'title-note' }, '存檔存在這台電腦的瀏覽器裡。'),
      // 版權列：使用者 2026-09-02 指定放製作者與信箱
      el('div', { class: 'title-credit' }, '© 2026 葉彥呈 Charles Y.C. Yeh ｜ yayaxyayax@gmail.com')));
});
