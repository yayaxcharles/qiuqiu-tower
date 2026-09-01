import { playRun } from '../src/engine/bot';
let reach15 = 0, past = 0, sum = 0;
const N = 300;
for (let i = 0; i < N; i++) {
  const r = playRun(`nerf-${i}`);
  sum += Math.min(r.floor, 15);
  if (r.floor >= 15) reach15++;
  if (r.floor >= 16) past++;   // 過了第一關關主
}
console.log(`平均樓層 ${(sum / N).toFixed(1)}；走到關主 ${reach15}；打贏關主 ${past}`);
