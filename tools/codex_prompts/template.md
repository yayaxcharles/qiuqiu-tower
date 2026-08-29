# 生圖提示詞模板（每張＝共同段＋主題段＋存檔指示）

## 共同段（所有圖）
Style: same art style as the reference sticker sheet at `<REF>`: thick black outlines, flat colors with subtle soft gradients,
cute cartoon sticker look, no photorealism. Single subject, centered, filling about 80% of the canvas, no text, no letters,
no watermark, no sparkles or stars. Background must be a solid pure green (#00FF00) with no shading, for chroma keying.
Output 1024x1024 PNG.

## 主題段
（由 subjects.json 的 `subject` 欄位帶入）

## 存檔指示
Save the image as `<FILE>` in the current directory and report the path.

## 背景圖例外
背景（bg/*）不要綠幕：主題段自帶場景描述，畫滿整張 1792x1024，不放角色。
