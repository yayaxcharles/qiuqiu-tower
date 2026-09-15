import React from "react";
import { Composition, registerRoot } from "remotion";
import { DURATION, FPS, FeifeiOpening, H, W } from "./FeifeiOpening";

// Remotion 的進入點：只登記這一支合成，跟 remotion-video 專案原本的 Root 分開
const Root: React.FC = () => (
  <Composition id="FeifeiOpening" component={FeifeiOpening} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
registerRoot(Root);
