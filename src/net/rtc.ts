import { packSignal, unpackSignal } from './code';
import type { NetMessage, Transport } from './transport';

/**
 * WebRTC 傳輸：兩個瀏覽器**直接連**，不經過任何伺服器。
 *
 * 這一支刻意寫得薄。真正會出錯的邏輯（誰發號碼、缺號怎麼補、對帳對不上怎麼辦）
 * 都在 `session.ts`，那邊用對接的假傳輸測得到；這裡只負責把位元組送過去。
 * **能測的部分不要跟不能測的部分混在一起**——不然整包都變成只能靠手動試。
 *
 * 連線流程（手動貼代碼，零伺服器）：
 *   1. 主機按「開房」→ 產生一串邀請碼 → 用 LINE 傳給對方
 *   2. 對方貼進去 → 產生一串回應碼 → 傳回來
 *   3. 主機貼進去 → 連上
 *
 * 為什麼要貼兩次：WebRTC 必須雙方交換網路位置才連得起來，正常做法是架一台
 * 伺服器幫忙轉交。手動貼＝玩家自己當那台伺服器。開局麻煩一點，
 * 但換到「純靜態網頁、零費用、不必維護伺服器」。
 */

/** 免費的公開 STUN（只用來問「我的對外位置是什麼」，不經手任何遊戲資料） */
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

/** 要等所有網路候選位置蒐集完才產得出完整的碼，不然對方連不上 */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const check = (): void => {
      if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // 保險：有些網路環境會一直蒐集不完，五秒後就用手上有的先送出去
    setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 5000);
  });
}

function wrap(ch: RTCDataChannel, pc: RTCPeerConnection): Transport {
  let onMsg: ((m: NetMessage) => void) | null = null;
  let onClose: ((w: string) => void) | null = null;
  let closed = false;
  const die = (why: string): void => { if (!closed) { closed = true; onClose?.(why); } };

  ch.addEventListener('message', (e) => {
    try {
      onMsg?.(JSON.parse(e.data as string) as NetMessage);
    } catch {
      // 解不開的訊息代表對面不是同一版的程式，繼續跑只會分岔
      die('收到看不懂的訊息，可能兩邊不是同一版');
    }
  });
  ch.addEventListener('close', () => { die('連線結束了'); });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') die('連線中斷了');
  });

  return {
    send: (m) => { if (ch.readyState === 'open') ch.send(JSON.stringify(m)); },
    onMessage: (fn) => { onMsg = fn; },
    onClose: (fn) => { onClose = fn; },
    close: () => { die('自己關掉了'); ch.close(); pc.close(); },
  };
}

/** 通道開好之前先等一下（`open` 事件），不然第一則訊息會掉 */
function whenOpen(ch: RTCDataChannel): Promise<void> {
  if (ch.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    ch.addEventListener('open', () => { resolve(); }, { once: true });
    ch.addEventListener('error', () => { reject(new Error('通道開不起來')); }, { once: true });
  });
}

/** 主機：開房 → 拿到邀請碼 → 收到回應碼之後就連上了 */
export async function hostRoom(): Promise<{ invite: string; accept: (answerCode: string) => Promise<Transport> }> {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  // `ordered: true`＝通道自己保證順序。就算這樣，動作照樣要照號碼套用——
  // 主機廣播給自己是本機、給對方要走網路，兩條路的時間本來就不一樣
  const ch = pc.createDataChannel('qiuqiu', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);
  const invite = await packSignal('offer', pc.localDescription?.sdp ?? '');
  return {
    invite,
    accept: async (answerCode: string): Promise<Transport> => {
      const { kind, sdp } = await unpackSignal(answerCode);
      if (kind !== 'answer') throw new Error('這是一張邀請碼，不是回應碼——要貼的是對方傳回來的那一串');
      await pc.setRemoteDescription({ type: 'answer', sdp });
      await whenOpen(ch);
      return wrap(ch, pc);
    },
  };
}

/** 加入：貼邀請碼 → 拿到回應碼傳回去 → 對方貼上就連上了 */
export async function joinRoom(inviteCode: string): Promise<{ answer: string; ready: Promise<Transport> }> {
  const { kind, sdp } = await unpackSignal(inviteCode);
  if (kind !== 'offer') throw new Error('這是一張回應碼，不是邀請碼——要貼的是對方開房時給的那一串');
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const got = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener('datachannel', (e) => { resolve(e.channel); }, { once: true });
  });
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  const answer = await packSignal('answer', pc.localDescription?.sdp ?? '');
  const ready = got.then(async (ch) => { await whenOpen(ch); return wrap(ch, pc); });
  return { answer, ready };
}
