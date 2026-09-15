// 對著線上中繼跑一次真的兩人對連（Node 22+ 內建 WebSocket）：
//   node tools/relay_e2e.mjs [中繼網址]
// 驗：開房→加入→兩邊都收到 relay open→來回 200 則訊息順序不亂→一邊斷線另一邊收到 away 不被踢、帶 got 接回補齊→
// 說 bye 另一邊立刻收到 relay closed；另外驗三種拒絕：房號沒人開、版本不同、房間滿了。這支不進測試套件（要網路），部署中繼之後手動跑。
const base = (process.argv[2] ?? 'https://qiuqiu-relay.qiuqiu-tower.workers.dev').replace(/^http/, 'ws').replace(/\/+$/, '');
const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const url = (role, build = 'e2e') => `${base}/room/${code}?role=${role}&build=${build}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** 心跳回聲 pong 不是 JSON，解不開就當沒看到 */
const j = (e) => { try { return JSON.parse(e.data); } catch { return null; } };
const open = (ws) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('15 秒沒收到 relay open')), 15000);
  ws.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'relay' && v.s === 'open') { clearTimeout(t); res(); } });
  ws.addEventListener('close', (e) => { clearTimeout(t); rej(new Error(`被關掉 ${e.code} ${e.reason}`)); });
});
const closedWith = (ws) => new Promise((res) => ws.addEventListener('close', (e) => res(`${e.code} ${e.reason}`)));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

// 拒絕一：沒人開房就加入
{ const w = new WebSocket(url('join')); const r = await closedWith(w); check(r.startsWith('4404'), `沒人開房就加入 → ${r}`); }

const t0 = Date.now();
const host = new WebSocket(url('host'));
const hosted = await new Promise((res, rej) => { host.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'relay' && v.s === 'hosting') res(Date.now() - t0); }); host.addEventListener('close', (e) => rej(new Error(`開房被關掉 ${e.code} ${e.reason}`))); });
check(true, `開房 ${hosted} 毫秒後收到 hosting`);
// 心跳：送 ping 要收到 pong（中繼自動回，不吵醒房間）
{ const pong = new Promise((res) => host.addEventListener('message', (e) => { if (e.data === 'pong') res(true); }, { once: true })); host.send('ping'); check(await Promise.race([pong, wait(3000).then(() => false)]), 'ping → pong'); }
// 拒絕二：版本不同（要在真的加入之前測，不然會先被「房間滿了」擋掉）
{ const w = new WebSocket(url('join', 'other')); const r = await closedWith(w); check(r.startsWith('4400'), `版本不同 → ${r.slice(0, 40)}…`); }
let join = new WebSocket(url('join'));
await Promise.all([open(host), open(join)]);
check(true, `開房＋加入 ${Date.now() - t0} 毫秒後兩邊都收到 relay open（房號 ${code}）`);

// 拒絕三：房間滿了
{ const w = new WebSocket(url('join')); const r = await closedWith(w); check(r.startsWith('4403'), `房間滿了 → ${r}`); }
{ const w = new WebSocket(url('host')); const r = await closedWith(w); check(r.startsWith('4409'), `同房號再開房 → ${r}`); }

// 來回 200 則，順序要對
const gotJ = [], gotH = [];
join.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'sync') gotJ.push(v.turn); });
host.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'sync') gotH.push(v.turn); });
const t1 = Date.now();
// 中繼每條連線每秒最多 25 則（超過會被 4429 踢掉），所以分批送：每 100 毫秒 2 則
for (let i = 1; i <= 200; i++) { host.send(JSON.stringify({ m: 'sync', turn: i, fp: 'h' })); join.send(JSON.stringify({ m: 'sync', turn: i, fp: 'j' })); if (i % 2 === 0) await wait(100); }
for (let i = 0; i < 100 && (gotJ.length < 200 || gotH.length < 200); i++) await wait(100);
const ordered = (a) => a.length === 200 && a.every((v, i) => v === i + 1);
check(ordered(gotJ) && ordered(gotH), `來回各 200 則，${Date.now() - t1} 毫秒內全到、順序正確（收到 ${gotJ.length}／${gotH.length}）`);

// 灌爆：一秒內丟 200 則要被中繼踢掉（4429），另一邊收到 relay closed
{
  const flooder = new WebSocket(url('host').replace(code, String((Number(code) + 1) % 1000000).padStart(6, '0')));
  await new Promise((r) => flooder.addEventListener('open', r));
  const kicked = closedWith(flooder);
  for (let i = 0; i < 200; i++) flooder.send('{"m":"sync","turn":1,"fp":"x"}');
  const r = await Promise.race([kicked, wait(5000).then(() => 'timeout')]);
  check(String(r).startsWith('4429'), `一秒 200 則 → 被踢（${r}）`);
}

// 中途斷線接回：加入的人線路斷了（關 socket、不說 bye）→ 開房的人收到 away、沒被踢；期間開房的人送 3 則；
// 別人這時想加入會被擋；加入的人帶 got 接回 → 先補收那 3 則、再收到 open（附中繼收到我幾則）→ 開房的人收到 back
{
  let sawAway = false; let sawBack = false;
  host.addEventListener('message', (e) => { const v = j(e); if (v && v.m === 'relay') { if (v.s === 'away') sawAway = true; if (v.s === 'back') sawBack = true; } });
  const joinRecv = gotJ.length;   // 加入的人到目前為止收到幾則遊戲訊息（全是 sync）
  join.close();
  await wait(800);
  check(sawAway && host.readyState === 1, '加入的人斷線 → 開房的人收到 away、沒被踢');
  for (let i = 201; i <= 203; i++) host.send(JSON.stringify({ m: 'sync', turn: i, fp: 'h' }));
  { const w = new WebSocket(url('join')); const r = await closedWith(w); check(r.startsWith('4403'), `斷線期間別人想加入 → ${r}`); }
  const back = new WebSocket(`${url('join')}&resume=1&got=${joinRecv}`);
  const late = []; let openGot = null;
  back.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'relay' && v.s === 'open') openGot = v.got; else if (v.m === 'sync') late.push(v.turn); });
  await new Promise((res, rej) => {
    back.addEventListener('close', (e) => rej(new Error(`接回被關掉 ${e.code} ${e.reason}`)));
    const t = setInterval(() => { if (openGot !== null) { clearInterval(t); res(); } }, 50);
    setTimeout(() => { clearInterval(t); rej(new Error('15 秒沒接回')); }, 15000);
  });
  check(late.join(',') === '201,202,203', `接回後先補收漏掉的 3 則（${late.join(',')}）`);
  check(openGot === 200, `open 附上中繼收到我幾則（${openGot}，應為 200）`);
  await wait(500);
  check(sawBack, '開房的人收到 back');
  // 接回之後照常通
  const n0 = gotH.length;
  back.send(JSON.stringify({ m: 'sync', turn: 999, fp: 'j' }));
  await wait(800);
  check(gotH.length === n0 + 1 && gotH[gotH.length - 1] === 999, '接回之後照常轉送');
  join = back;
}

// 真的走了：說一句 bye → 對方立刻收到 relay closed 並被關掉（4000），不用等兩分鐘
const hostClosed = closedWith(host);
let closedWhy = null;
host.addEventListener('message', (e) => { const v = j(e); if (!v) return; if (v.m === 'relay' && v.s === 'closed') closedWhy = v.why ?? ''; });
join.send('{"m":"relay","s":"bye"}');
const r = await hostClosed;
check(closedWhy === '對方離開了' && r.startsWith('4000'), `加入的人說 bye → 開房的人收到 relay closed（附原因「${closedWhy}」）並被關掉（${r}）`);

// 房間空了，同房號可以再開
{ const w = new WebSocket(url('host')); const ok = await new Promise((res) => { w.addEventListener('close', () => res(false)); setTimeout(() => res(w.readyState === 1), 1500); }); check(ok, '房間空了之後同房號可以再開'); w.close(); }
console.log(fails ? `\n✗ ${fails} 項失敗` : '\n全部通過');
process.exit(fails ? 1 : 0);
