// 對著線上中繼跑一次真的兩人對連（Node 22+ 內建 WebSocket）：
//   node tools/relay_e2e.mjs [中繼網址]
// 驗：開房→加入→兩邊都收到 relay open→來回 200 則訊息順序不亂→一邊關掉另一邊收到 relay closed；
// 另外驗三種拒絕：房號沒人開、版本不同、房間滿了。這支不進測試套件（要網路），部署中繼之後手動跑。
const base = (process.argv[2] ?? 'https://qiuqiu-relay.qiuqiu-tower.workers.dev').replace(/^http/, 'ws').replace(/\/+$/, '');
const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const url = (role, build = 'e2e') => `${base}/room/${code}?role=${role}&build=${build}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (ws) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('15 秒沒收到 relay open')), 15000);
  ws.addEventListener('message', (e) => { const v = JSON.parse(e.data); if (v.m === 'relay' && v.s === 'open') { clearTimeout(t); res(); } });
  ws.addEventListener('close', (e) => { clearTimeout(t); rej(new Error(`被關掉 ${e.code} ${e.reason}`)); });
});
const closedWith = (ws) => new Promise((res) => ws.addEventListener('close', (e) => res(`${e.code} ${e.reason}`)));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

// 拒絕一：沒人開房就加入
{ const w = new WebSocket(url('join')); const r = await closedWith(w); check(r.startsWith('4404'), `沒人開房就加入 → ${r}`); }

const t0 = Date.now();
const host = new WebSocket(url('host'));
await new Promise((r) => host.addEventListener('open', r));   // 開房的人先連上（真的玩也是先開房、再把房號給對方）
// 拒絕二：版本不同（要在真的加入之前測，不然會先被「房間滿了」擋掉）
{ const w = new WebSocket(url('join', 'other')); const r = await closedWith(w); check(r.startsWith('4400'), `版本不同 → ${r.slice(0, 40)}…`); }
const join = new WebSocket(url('join'));
await Promise.all([open(host), open(join)]);
check(true, `開房＋加入 ${Date.now() - t0} 毫秒後兩邊都收到 relay open（房號 ${code}）`);

// 拒絕三：房間滿了
{ const w = new WebSocket(url('join')); const r = await closedWith(w); check(r.startsWith('4403'), `房間滿了 → ${r}`); }
{ const w = new WebSocket(url('host')); const r = await closedWith(w); check(r.startsWith('4409'), `同房號再開房 → ${r}`); }

// 來回 200 則，順序要對
const gotJ = [], gotH = [];
join.addEventListener('message', (e) => { const v = JSON.parse(e.data); if (v.m === 'sync') gotJ.push(v.turn); });
host.addEventListener('message', (e) => { const v = JSON.parse(e.data); if (v.m === 'sync') gotH.push(v.turn); });
const t1 = Date.now();
for (let i = 1; i <= 200; i++) { host.send(JSON.stringify({ m: 'sync', turn: i, fp: 'h' })); join.send(JSON.stringify({ m: 'sync', turn: i, fp: 'j' })); }
for (let i = 0; i < 100 && (gotJ.length < 200 || gotH.length < 200); i++) await wait(100);
const ordered = (a) => a.length === 200 && a.every((v, i) => v === i + 1);
check(ordered(gotJ) && ordered(gotH), `來回各 200 則，${Date.now() - t1} 毫秒內全到、順序正確（收到 ${gotJ.length}／${gotH.length}）`);

// 一邊走了
const hostClosed = closedWith(host);
let sawClosed = false;
host.addEventListener('message', (e) => { const v = JSON.parse(e.data); if (v.m === 'relay' && v.s === 'closed') sawClosed = true; });
join.close();
const r = await hostClosed;
check(sawClosed && r.startsWith('4000'), `加入的人關掉 → 開房的人收到 relay closed 並被關掉（${r}）`);

// 房間空了，同房號可以再開
{ const w = new WebSocket(url('host')); const ok = await new Promise((res) => { w.addEventListener('close', () => res(false)); setTimeout(() => res(w.readyState === 1), 1500); }); check(ok, '房間空了之後同房號可以再開'); w.close(); }
console.log(fails ? `\n✗ ${fails} 項失敗` : '\n全部通過');
process.exit(fails ? 1 : 0);
