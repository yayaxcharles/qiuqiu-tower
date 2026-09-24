import { registerScreen, type App, type ScreenName } from './app';

type LazyScreenApp = Pick<App, 'show' | 'stage'>;

function notice(root: HTMLElement, text: string, className: string): void {
  const node = root.ownerDocument.createElement('div');
  node.className = className;
  node.textContent = text;
  root.replaceChildren(node);
}

/**
 * 先登記一個很小的載入畫面；真正模組載入時會用同名 `registerScreen` 取代它。
 * 每次顯示都有序號，較早的 Promise 完成後不能把使用者已切走或重入的新畫面蓋掉。
 */
export function registerLazyScreen(
  name: ScreenName,
  load: () => Promise<unknown>,
  label = '正在準備畫面……',
): void {
  let latestRequest = 0;
  registerScreen(name, (app: LazyScreenApp, root: HTMLElement, props: unknown) => {
    const request = ++latestRequest;
    notice(root, label, 'screen-loading');
    void load().then(() => {
      if (request !== latestRequest || app.stage.dataset['screen'] !== name) return;
      app.show(name, props, { quiet: true });
    }, () => {
      if (request !== latestRequest || app.stage.dataset['screen'] !== name) return;
      /*
       * 先給「再試一次」（2026-09-23 推前審查 低-1）：原本只有「重新整理」，連線時重新整理等於這一局結束。
       * 再試一次就是再畫一次這個載入畫面、再叫一次 `load`（事件畫面那支失敗後會換網址參數重抓，見 event-loader.ts）。
       */
      notice(root, '畫面載入失敗，可能是網路斷了一下。先按「再試一次」；還是不行再重新整理（連線中重新整理會中斷這一局）。', 'screen-load-error');
      const again = root.ownerDocument.createElement('button');
      again.className = 'btn primary';
      again.textContent = '再試一次';
      again.addEventListener('click', () => {
        if (app.stage.dataset['screen'] === name) app.show(name, props, { quiet: true });
      });
      const retry = root.ownerDocument.createElement('button');
      retry.className = 'btn';
      retry.textContent = '重新整理';
      retry.addEventListener('click', () => root.ownerDocument.defaultView?.location.reload());
      root.append(again, retry);
    });
  });
}
