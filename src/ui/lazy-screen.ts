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
      notice(root, '畫面載入失敗，請重新整理再試。', 'screen-load-error');
      const retry = root.ownerDocument.createElement('button');
      retry.className = 'btn';
      retry.textContent = '重新整理';
      retry.addEventListener('click', () => root.ownerDocument.defaultView?.location.reload());
      root.append(retry);
    });
  });
}
