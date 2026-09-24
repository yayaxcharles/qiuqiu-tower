/*
 * 圖片離線快取（2026-09-24 使用者：「我想優化載入的速度」「都做」）。
 *
 * 為什麼要：GitHub Pages 對每個檔案只給十分鐘快取，而且**每部署一次，所有檔案的驗證碼都換掉**，
 * 瀏覽器回頭問的時候拿不到「沒變」的回覆，只好整包重新下載——即使那張圖的內容一個位元都沒變。
 * 剛推完新版時背景還在重下幾十 MB 的動作圖，點地圖上的戰鬥格就會卡滿 1.5 秒（實測）。
 *
 * 做法：打包後的圖檔名都帶內容雜湊碼（`tools/vite-asset-hash.ts`，例：`assets/bg/foo-7WQhIcB8.webp`），
 * **檔名一樣內容就一定一樣**，所以這種檔一律「本機有就用本機的，沒有才去網路抓、抓到存一份」。
 * 只收圖（webp／png／jpg）：
 * - 程式檔（js／css）合計才 1.3 MB，交給瀏覽器原本的快取；
 * - 聲音與影片瀏覽器常分段抓（Range），分段的回覆不能整份存，硬存會出錯，一律不碰；
 * - 沒帶雜湊碼的（`index.html`、`assets/manifest.json?v=…`、`sw.js` 自己）一律走網路，出新版時一定拿到新的。
 *
 * 清掉用不到的：頁面讀完素材清單後把「這一版所有圖的路徑」傳過來（`keep`，見 `src/ui/assetcache.ts`），
 * 快取裡不在名單上的圖（舊版換掉的）就刪掉，快取不會一版一版越堆越大。
 */
/*
 * 快取名字帶上這一站的範圍（推前稽核 低-3）：單機版與連線版在同一個網域，快取是整個網域共用的，
 * 名字不分開的話，哪天兩站都掛上這支，換版時會互砍整份、清舊圖時也會互刪對方的圖
 */
const PREFIX = 'qiuqiu-img:' + self.registration.scope + ':';
const CACHE = PREFIX + 'v1';
const HASHED_IMAGE = /\/assets\/.+-[A-Za-z0-9_-]{8}\.(?:webp|png|jpe?g)$/;
/*
 * 最多存幾張（推前稽核 低-1）：快取跟存檔在同一個網域，有些瀏覽器（Firefox）磁碟空間很少時兩者共用配額，
 * 快取塞滿之後存檔可能寫不進去（待真機確認），所以要有上限。
 * 上限 3000 張：整局（四隻角色都玩過）看過的圖約 2600 張、壓縮後約 120 MB，正常玩不會碰到上限，
 * 首頁那批每次都要用的圖不會被擠掉（複審 低-1：原本 1500 張，玩完一整局一定超過，最先刪的正好是首載那批）。
 * 真的超過才從最早存的刪到剩九成——刪掉的下次用到再從網路抓，只是慢一點
 */
const MAX_ENTRIES = 3000;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  // 換版時把舊名字的快取整個丟掉（`CACHE` 改名＝快取規則改了）
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search || !HASHED_IMAGE.test(url.pathname)) return;
  event.respondWith(serve(req));
});

async function serve(req) {
  // 快取本身出錯（儲存被封鎖、隱私模式、儲存壞掉）就直接上網抓，不能讓圖整張載不出來（推前稽核 低-2）；
  // 只接住快取那兩步的錯，網路那一步的錯照樣往外丟——不然斷線時會多抓一次、多等一次逾時（複審 低-2）
  let cache;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
  } catch {
    return fetch(req);
  }
  const res = await fetch(req);
  // 只存完整、同源的成功回覆；存失敗（空間不夠之類）不影響這一次的顯示
  if (res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).then(() => noteStored(cache)).catch(() => undefined);
  return res;
}

/*
 * 超過上限才修剪（複審 低-1）：原本每存一張就把整份目錄讀一次，開場幾百張一起進來時重複讀幾十次。
 * 改成記一個大概的張數（第一次存入時讀一次目錄當起點），超過上限才讀目錄、從最早存的刪到剩九成。
 */
let stored = -1;
let trimming = false;
async function noteStored(cache) {
  if (stored < 0) stored = (await cache.keys()).length;
  else stored += 1;
  if (stored <= MAX_ENTRIES || trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const drop = keys.length - Math.floor(MAX_ENTRIES * 0.9);
    for (let i = 0; i < drop; i++) await cache.delete(keys[i]);
    stored = keys.length - Math.max(0, drop);
  } finally {
    trimming = false;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'keep' || !Array.isArray(data.paths)) return;
  // 名單太短多半是清單沒載到（退回剪影那種情況）：寧可不清，也不要把整份快取砍光
  if (data.paths.length < 500) return;
  const keep = new Set(data.paths);
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const req of await cache.keys()) {
        if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
      }
    }),
  );
});
