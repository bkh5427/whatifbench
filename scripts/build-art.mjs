/**
 * 첫 화면 삽화(`src/art/*.svg`) 생성기. 홈과 카테고리 인덱스 맨 위에 서는 그림이다.
 * 곡선의 교차점처럼 **계산해야 맞는 자리**가 있어서 손으로 적지 않고 여기서 만든다.
 * 실행: node scripts/build-art.mjs  (그림을 바꿀 때만. 산출물은 저장소에 남는다)
 * 그림에는 글자도 숫자도 넣지 않는다 — 장식이며, 사실 검사할 주장을 싣지 않는다.
 */
import { writeFileSync } from "node:fs";
const f = (n) => Math.round(n * 10) / 10;
const grid = (w, h, step) => {
  let d = "";
  for (let y = step; y < h; y += step) d += `M0 ${y}H${w}`;
  for (let x = step; x < w; x += step) d += `M${x} 0V${h}`;
  return `  <path d="${d}" style="fill:none;stroke:var(--steel-800);stroke-width:1"/>`;
};
// ── 홈: 직관(점선 직선)과 모델(곡선)이 갈라지는 지점을 슬라이더가 가리킨다 ──
{
  const W = 560, H = 360, X0 = 40, X1 = 520, Y0 = 240;
  const line = (x) => Y0 - (x - X0) * 0.42;
  const model = (x) => Y0 - 120 * (1 - Math.exp(-(x - X0) / 60));
  let xc = X0 + 1;
  for (let x = X0 + 20; x <= X1; x += 0.1) { if (line(x) < model(x)) { xc = x; break; } }
  const yc = model(xc);
  let curve = `M${X0} ${Y0}`;
  for (let x = X0 + 4; x <= X1; x += 4) curve += `L${f(x)} ${f(model(x))}`;
  // 갈라진 뒤의 틈: 교차점 → 직선을 따라 끝 → 곡선을 따라 되돌아온다
  let gap = `M${f(xc)} ${f(yc)}L${X1} ${f(line(X1))}`;
  for (let x = X1; x >= xc; x -= 4) gap += `L${f(x)} ${f(model(x))}`;
  gap += "Z";
  const TRACK_Y = 305;
  let ticks = "";
  for (let x = X0; x <= X1; x += 40) ticks += `M${x} ${TRACK_Y + 16}V${TRACK_Y + 22}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- 사이트의 정체: 숫자를 움직이면(아래 슬라이더) 직관(점선)과 모델(실선)이 갈라지는 지점이 보인다. 글자·숫자 없음 -->
${grid(W, H, 20)}
  <path d="M${X0} 30V${Y0 + 10}H${X1}" style="fill:none;stroke:var(--steel-500);stroke-width:1.5"/>
  <path d="${gap}" style="fill:var(--series-2);fill-opacity:0.35"/>
  <path d="M${X0} ${Y0}L${X1} ${f(line(X1))}" style="fill:none;stroke:var(--steel-400);stroke-width:2;stroke-dasharray:7 6"/>
  <path d="${curve}" style="fill:none;stroke:var(--steel-200);stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round"/>
  <path d="M${f(xc)} ${f(yc + 12)}V${TRACK_Y - 16}" style="fill:none;stroke:var(--steel-400);stroke-width:1.5;stroke-dasharray:4 4"/>
  <circle cx="${f(xc)}" cy="${f(yc)}" r="10" style="fill:none;stroke:var(--series-2);stroke-width:3"/>
  <path d="M${X0} ${TRACK_Y}H${X1}" style="fill:none;stroke:var(--steel-700);stroke-width:6;stroke-linecap:round"/>
  <path d="M${X0} ${TRACK_Y}H${f(xc)}" style="fill:none;stroke:var(--steel-300);stroke-width:6;stroke-linecap:round"/>
  <path d="${ticks}" style="fill:none;stroke:var(--steel-600);stroke-width:1.5"/>
  <circle cx="${f(xc)}" cy="${TRACK_Y}" r="13" style="fill:var(--paper);stroke:var(--steel-300);stroke-width:3"/>
</svg>
`;
  writeFileSync("src/art/home.svg", svg);
}
// ── Chance: 갈림길 나무. 끝 8칸 중 3칸이 이기고, 오른쪽 막대가 그 비율(3/8)이다 ──
{
  const W = 560, H = 360;
  const levels = [[180], [100, 260], [60, 140, 220, 300], [40, 80, 120, 160, 200, 240, 280, 320]];
  const xs = [50, 170, 290, 410];
  const WIN = new Set([1, 2, 5]); // 끝 칸 중 이기는 셋
  const PATH = [0, 0, 1, 2];      // 강조하는 한 갈래 (각 단계의 인덱스)
  let edges = "", hot = "";
  for (let l = 0; l < 3; l++) levels[l].forEach((y, i) => {
    for (const c of [2 * i, 2 * i + 1]) {
      const seg = `M${xs[l]} ${y}L${xs[l + 1]} ${levels[l + 1][c]}`;
      if (PATH[l] === i && PATH[l + 1] === c) hot += seg; else edges += seg;
    }
  });
  let nodes = "";
  for (let l = 0; l < 3; l++) levels[l].forEach((y) => { nodes += `  <circle cx="${xs[l]}" cy="${y}" r="6" style="fill:var(--steel-300)"/>\n`; });
  levels[3].forEach((y, i) => {
    nodes += WIN.has(i)
      ? `  <circle cx="${xs[3]}" cy="${y}" r="9" style="fill:var(--series-2)"/>\n`
      : `  <circle cx="${xs[3]}" cy="${y}" r="9" style="fill:none;stroke:var(--steel-400);stroke-width:2"/>\n`;
  });
  const BX = 480, BW = 30, BT = 36, BB = 324, cell = (BB - BT) / 8;
  let bar = `  <rect x="${BX}" y="${BT}" width="${BW}" height="${BB - BT}" style="fill:none;stroke:var(--steel-400);stroke-width:2"/>\n`;
  bar += `  <rect x="${BX}" y="${f(BB - 3 * cell)}" width="${BW}" height="${f(3 * cell)}" style="fill:var(--series-2)"/>\n`;
  let seps = "";
  for (let k = 1; k < 8; k++) seps += `M${BX} ${f(BT + k * cell)}H${BX + BW}`;
  bar += `  <path d="${seps}" style="fill:none;stroke:var(--steel-900);stroke-width:1.5"/>\n`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Chance: 갈림길 나무의 끝 8칸 중 3칸(주황)이 이기고, 오른쪽 막대가 같은 3/8을 쌓아 보인다. 글자·숫자 없음 -->
${grid(W, H, 20)}
  <path d="${edges}" style="fill:none;stroke:var(--steel-600);stroke-width:1.5"/>
  <path d="${hot}" style="fill:none;stroke:var(--steel-200);stroke-width:3.5;stroke-linecap:round"/>
${nodes}${bar}</svg>
`;
  writeFileSync("src/art/chance.svg", svg);
}

// ── Scale: 같은 두 배 증가를 선형 축(왼쪽: 바닥에 붙어 있다가 벽처럼 솟음)과 로그 축(오른쪽: 곧은 선)에 ──
{
  const W = 560, H = 360;
  const panel = (x0, logAxis) => {
    const X1 = x0 + 220, Y0 = 290, Y1 = 60, N = 20;
    let d = "";
    for (let k = 0; k <= N; k++) {
      const x = x0 + (k / N) * (X1 - x0);
      const v = 2 ** k; // 1 … 2^20
      const t = logAxis ? k / N : (v - 1) / (2 ** N - 1);
      const y = Y0 - t * (Y0 - Y1);
      d += `${k ? "L" : "M"}${f(x)} ${f(y)}`;
    }
    let ticks = "";
    if (logAxis) for (let k = 0; k <= N; k += 5) { const y = Y0 - (k / N) * (Y0 - Y1); ticks += `M${x0 - 6} ${f(y)}H${x0}`; }
    else for (let q = 0; q <= 4; q++) { const y = Y0 - (q / 4) * (Y0 - Y1); ticks += `M${x0 - 6} ${f(y)}H${x0}`; }
    return `  <path d="M${x0} ${Y1 - 10}V${Y0}H${X1 + 10}" style="fill:none;stroke:var(--steel-500);stroke-width:1.5"/>
  <path d="${ticks}" style="fill:none;stroke:var(--steel-500);stroke-width:1.5"/>
  <path d="${d}" style="fill:none;stroke:var(--steel-200);stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round"/>
`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <!-- Scale: 같은 2의 거듭제곱 스무 단계를 왼쪽은 선형 축, 오른쪽은 로그 축에 그렸다. 가운데 주황 화살표는 '같은 수, 다른 축'. 글자·숫자 없음 -->
${grid(W, H, 20)}
${panel(40, false)}${panel(310, true)}  <path d="M270 175H296" style="fill:none;stroke:var(--series-2);stroke-width:3;stroke-linecap:round"/>
  <path d="M304 175L292 168.5V181.5Z" style="fill:var(--series-2)"/>
</svg>
`;
  writeFileSync("src/art/scale.svg", svg);
}
