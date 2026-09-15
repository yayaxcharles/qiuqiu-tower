import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/NotoSansTC";
import { loadFont as loadSerif } from "@remotion/google-fonts/NotoSerifTC";
import { loadFont as loadGaramond } from "@remotion/google-fonts/EBGaramond";

/**
 * 菲菲的開頭影片（2026-09-15）：照球球那支的拼法——遊戲現成的立繪貼在背景上做動作，
 * 中文字幕配一行英文小字，最後一張標題卡。1280×720、30 fps、約 16.5 秒，配樂 act1 烤進檔案裡。
 *
 * 五段照她的序章四句走（`src/content/dialogue.ts` 的 feifei prologue）：
 *   一、夕陽村口：師父盤坐、她練飛針——「力氣小，就別跟人比力氣。」
 *   二、夜裡紫光：師父被魔氣纏上、衝向塔；球球追上去
 *   三、門口守著：三天（天色亮暗三次）
 *   四、塔門前：拉上口罩，走進去
 *   五、標題卡：她的剪影＋「爪破魔塔：菲菲參上」
 *
 * 場與場之間用 12 格的溶接（後一場疊在上面淡入，前一場不動）。
 * 素材路徑 `public/qiuqiu/…`，由 `render.sh` 從遊戲倉庫複製過來。
 */

// 中文字型一個子集就是上百個小檔，Remotion 會警告請求太多；那是字型本身的切法，不是這裡多載了什麼
const sans = loadSans("normal", { weights: ["500"], subsets: ["chinese-traditional", "latin"], ignoreTooManyRequestsWarning: true });
const serif = loadSerif("normal", { weights: ["700"], subsets: ["chinese-traditional", "latin"], ignoreTooManyRequestsWarning: true });
const garamond = loadGaramond("normal", { weights: ["500"], subsets: ["latin"] });

export const FPS = 30;
export const W = 1280;
export const H = 720;
const FADE = 12;

// 五段的起訖（全域格數）；後一段提早 FADE 格開始，疊在前一段上淡入
const S1 = [0, 96] as const;
const S2 = [84, 246] as const;
const S3 = [234, 336] as const;
const S4 = [324, 426] as const;
const S5 = [414, 495] as const;
export const DURATION = S5[1];

const asset = (p: string): string => staticFile(`qiuqiu/${p}`);
const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** 立繪：以「腳底在 y 幾、多高、中心在 x 幾」擺；圖本身底邊只留 2～4 px 透明，所以腳底就是圖的底邊 */
const Sprite: React.FC<{
  src: string; x: number; foot: number; height: number;
  flip?: boolean; opacity?: number; filter?: string;
}> = ({ src, x, foot, height, flip, opacity = 1, filter }) => (
  <Img
    src={asset(`sprites/${src}.webp`)}
    style={{
      position: "absolute", left: x, bottom: H - foot, height, opacity, filter,
      transform: `translateX(-50%) scaleX(${flip ? -1 : 1})`,
    }}
  />
);

/** 背景：整段慢慢推近一點點（球球那支也有） */
const Bg: React.FC<{ src: string; zoom: [number, number]; dur: number; filter?: string }> = ({ src, zoom, dur, filter }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, dur], zoom, clamp);
  return (
    <Img
      src={asset(`bg/${src}.webp`)}
      style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${s})`, filter }}
    />
  );
};

/** 字幕：中文一行、英文小字一行，貼底置中，前後各 8 格淡入淡出 */
const Sub: React.FC<{ zh: string; en: string; from: number; to: number }> = ({ zh, en, from, to }) => {
  const f = useCurrentFrame();
  if (f < from || f > to) return null;
  const o = interpolate(f, [from, from + 8, to - 8, to], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, textAlign: "center", opacity: o }}>
      <div style={{
        fontFamily: sans.fontFamily, fontWeight: 500, fontSize: 30, color: "#fff", letterSpacing: 1,
        textShadow: "0 2px 8px rgba(0,0,0,.95), 0 0 2px #000",
      }}>{zh}</div>
      <div style={{
        fontFamily: garamond.fontFamily, fontWeight: 500, fontSize: 15, color: "#d8d0c0", letterSpacing: 1.5, marginTop: 4,
        textShadow: "0 1px 4px rgba(0,0,0,.9)",
      }}>{en}</div>
    </div>
  );
};

/** 一段：疊在前一段上、開頭 FADE 格淡入（第一段不淡、由黑幕自己開） */
const SceneBody: React.FC<{ first?: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useCurrentFrame();
  const o = first ? 1 : interpolate(f, [0, FADE], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
const Scene: React.FC<{ span: readonly [number, number]; first?: boolean; children: React.ReactNode }> = ({ span, first, children }) => (
  <Sequence from={span[0]} durationInFrames={span[1] - span[0]}>
    <SceneBody first={first}>{children}</SceneBody>
  </Sequence>
);

/* ───── 一、夕陽村口 ───── */
const Dusk: React.FC = () => {
  const f = useCurrentFrame();
  const dur = S1[1] - S1[0];
  const black = interpolate(f, [0, 16], [1, 0], clamp);
  // 飛針：從她手上射出去兩次（第 20 與第 56 格），飛到師父面前就沒了
  const needle = (start: number): React.ReactNode => {
    if (f < start || f > start + 14) return null;
    const x = interpolate(f, [start, start + 14], [396, 585], clamp);
    const y = interpolate(f, [start, start + 14], [488, 498], clamp);
    return <div style={{ position: "absolute", left: x, top: y, width: 34, height: 3, background: "#e8e8e8", boxShadow: "0 0 3px #fff", borderRadius: 2 }} />;
  };
  return (
    <>
      <Bg src="screen_result_win" zoom={[1, 1.05]} dur={dur} />
      <Sprite src="seclude" x={820} foot={610} height={400} />
      <Sprite src="feifei_throw" x={330} foot={610} height={240} />
      {needle(20)}
      {needle(56)}
      <Sub zh="力氣小，就別跟人比力氣。" en="Small? Then never fight strength with strength." from={14} to={dur - 2} />
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </>
  );
};

/* ───── 二、夜裡紫光 ───── */
const Night: React.FC = () => {
  const f = useCurrentFrame();
  const dur = S2[1] - S2[0];
  // 天上的紫光：慢慢亮起來，然後一直脈動
  const glow = interpolate(f, [0, 40], [0, 1], clamp) * (0.55 + 0.25 * Math.sin(f / 5));
  // 師父：先是平常的樣子，第 50～75 格變成魔氣纏身，第 95～135 格衝向塔頂
  const corrupt = interpolate(f, [50, 75], [0, 1], clamp);
  const aura = interpolate(f, [45, 85], [0, 0.9], clamp);
  const shake = f >= 50 && f <= 95 ? Math.sin(f * 2.5) * 4 : 0;
  const fly = interpolate(f, [95, 135], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const mx = 640 + shake + fly * 400;
  const mFoot = 660 - fly * 460;
  const mH = 400 - fly * 300;
  const standing = f < 98;
  const flyO = interpolate(f, [92, 98], [0, 1], clamp);
  const gone = f > 135;
  const auraR = 250 * (1 - fly * 0.7);
  // 鑽進塔頂那一下：紫光閃一下就沒了
  const flash = interpolate(f, [133, 140, 154], [0, 0.95, 0], clamp);
  // 球球：第 110 格從左邊衝進來，跑向塔
  const run = interpolate(f, [110, dur], [0, 1], clamp);
  const qx = 60 + run * 900;
  const qH = 210 - run * 120;
  const qFoot = 650 - run * 130 + Math.abs(Math.sin(f * 0.9)) * 6;
  const qO = interpolate(f, [110, 118, 148, 160], [0, 1, 1, 0], clamp);   // 跑遠了就淡掉，下一段溶接時村口是空的
  return (
    <>
      <Bg src="screen_title" zoom={[1, 1.04]} dur={dur} />
      <div style={{
        position: "absolute", left: 0, right: 0, top: -120, height: 460, opacity: glow,
        background: "radial-gradient(ellipse at 50% 0%, rgba(160,70,230,.9) 0%, rgba(100,40,170,.45) 40%, rgba(60,20,120,0) 70%)",
      }} />
      {!gone && (
        <div style={{
          position: "absolute", left: mx - auraR, top: mFoot - mH / 2 - auraR,
          width: auraR * 2, height: auraR * 2, borderRadius: "50%", opacity: aura,
          background: "radial-gradient(circle, rgba(150,60,220,.85) 0%, rgba(120,40,200,.35) 45%, rgba(80,20,150,0) 70%)",
          filter: "blur(18px)",
        }} />
      )}
      {standing && <Sprite src="idle1" x={mx} foot={mFoot} height={mH} opacity={1 - corrupt} />}
      {standing && <Sprite src="idle3" x={mx} foot={mFoot} height={mH} opacity={corrupt} />}
      {!standing && !gone && <Sprite src="headbutt3" x={mx} foot={mFoot} height={mH} flip opacity={flyO} />}
      <div style={{
        position: "absolute", left: 1040 - 110, top: 150 - 110, width: 220, height: 220, borderRadius: "50%", opacity: flash,
        background: "radial-gradient(circle, rgba(220,170,255,.95) 0%, rgba(160,80,240,.6) 40%, rgba(100,30,180,0) 70%)",
        filter: "blur(6px)",
      }} />
      {f >= 110 && <Sprite src="ninja_dash" x={qx} foot={qFoot} height={qH} opacity={qO} />}
      <Sub zh="那天夜裡，魔塔在村外拔地而起，魔氣找上了師父。" en="That night the tower rose outside the village, and its miasma came for the master." from={12} to={92} />
      <Sub zh="球球抓起頭巾就追了上去。" en="Qiuqiu grabbed his headband and ran after him." from={106} to={dur - 2} />
    </>
  );
};

/* ───── 三、門口守著三天 ───── */
const Wait: React.FC = () => {
  const f = useCurrentFrame();
  const dur = S3[1] - S3[0];
  // 天亮天黑三次＝三天：太陽從左邊地平線畫弧到右邊，同時把夜景提亮、偏暖
  //（只提亮不夠看——夜景太暗，亮 1.6 倍肉眼幾乎分不出來；疊一層 screen 暖色又會變成一片灰霧，都試過）
  const t = ((f * 3) / dur) % 1;                 // 一天裡的進度：0 半夜、0.5 正午
  const day = Math.sin(Math.PI * t);
  const sunX = 200 + t * 880;
  const sunY = 330 - day * 230;
  const daylight = `brightness(${1 + 1.1 * day}) sepia(${0.4 * day}) saturate(${1 + 0.2 * day})`;
  return (
    <>
      <Bg src="screen_title" zoom={[1.04, 1.08]} dur={dur} filter={daylight} />
      <div style={{
        position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.32 * day,
        background: "linear-gradient(to bottom, rgba(255,190,110,1) 0%, rgba(255,215,160,.8) 50%, rgba(255,230,200,.3) 100%)",
      }} />
      <div style={{
        position: "absolute", left: sunX - 60, top: sunY - 60, width: 120, height: 120, borderRadius: "50%", opacity: day,
        background: "radial-gradient(circle, rgba(255,250,220,1) 0%, rgba(255,220,140,.9) 35%, rgba(255,190,90,0) 70%)",
        filter: "blur(4px)",
      }} />
      <Sprite src="feifei_lose" x={300} foot={665} height={210} />
      <Sub zh="……三天了。師父沒回來，師兄也沒回來。" en="Three days. Master hasn't come back. Neither has Qiuqiu." from={14} to={dur - 2} />
    </>
  );
};

/* ───── 四、塔門前 ───── */
const Gate: React.FC = () => {
  const f = useCurrentFrame();
  const dur = S4[1] - S4[0];
  const walk = interpolate(f, [0, 66], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const x = 140 + walk * 420;
  const bob = f < 66 ? Math.abs(Math.sin(f * 0.55)) * 7 : 0;
  return (
    <>
      <Bg src="low" zoom={[1, 1.04]} dur={dur} />
      <Sprite src="feifei_stealth" x={x} foot={650 + bob} height={260} />
      <Sub zh="我真的很怕痛。可是，只剩我能去找他們了。" en="I really hate getting hurt. But I'm the only one left who can go find them." from={14} to={dur - 2} />
    </>
  );
};

/* ───── 五、標題卡 ───── */
const Title: React.FC = () => {
  const f = useCurrentFrame();
  const dur = S5[1] - S5[0];
  const silO = interpolate(f, [6, 26], [0, 1], clamp);
  const silY = interpolate(f, [6, 26], [20, 0], { ...clamp, easing: Easing.out(Easing.quad) });
  const zhO = interpolate(f, [14, 34], [0, 1], clamp);
  const enO = interpolate(f, [24, 44], [0, 1], clamp);
  const black = interpolate(f, [dur - 18, dur - 1], [0, 1], clamp);
  return (
    <>
      <Bg src="screen_title" zoom={[1.02, 1.05]} dur={dur} filter="sepia(.85) brightness(1.45) contrast(.8) saturate(.9)" />
      <div style={{
        position: "absolute", left: 0, top: 0, width: W, height: H,
        background: "radial-gradient(ellipse at 50% 48%, rgba(255,248,230,.8) 0%, rgba(255,240,215,.45) 40%, rgba(40,30,20,.55) 100%)",
      }} />
      <Sprite src="feifei_win" x={640} foot={470 + silY} height={250} opacity={silO} filter="brightness(0)" />
      <div style={{
        position: "absolute", left: 0, right: 0, top: 488, textAlign: "center", opacity: zhO,
        fontFamily: serif.fontFamily, fontWeight: 700, fontSize: 64, color: "#9a7430", letterSpacing: 4,
        textShadow: "0 1px 0 rgba(255,240,200,.8), 0 2px 12px rgba(80,50,10,.45)",
      }}>爪破魔塔：菲菲參上</div>
      <div style={{
        position: "absolute", left: 0, right: 0, top: 582, textAlign: "center", opacity: enO,
        fontFamily: garamond.fontFamily, fontWeight: 500, fontSize: 19, color: "#6e5a38", letterSpacing: 7,
      }}>CLAW THROUGH THE TOWER</div>
      <AbsoluteFill style={{ background: "#000", opacity: black }} />
    </>
  );
};

export const FeifeiOpening: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Audio
      src={asset("bgm/act1.mp3")}
      volume={(f) => interpolate(f, [0, 20, DURATION - 50, DURATION - 1], [0, 0.8, 0.8, 0], clamp)}
    />
    <Scene span={S1} first><Dusk /></Scene>
    <Scene span={S2}><Night /></Scene>
    <Scene span={S3}><Wait /></Scene>
    <Scene span={S4}><Gate /></Scene>
    <Scene span={S5}><Title /></Scene>
  </AbsoluteFill>
);
