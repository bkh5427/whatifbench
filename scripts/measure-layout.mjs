// 폰 실측. 게이트가 **볼 수 없는** 것을 잰다 — 규약 §8의 위젯 상단 깊이와
// §5.5 S5(컨트롤 → 첫 판독 거리)는 렌더해 봐야 알 수 있는 값이다.
//
//   node scripts/measure-layout.mjs <dist 경로> <스크린샷 폴더>
//
// 왜 게이트에 넣지 않았나: 게이트는 푸시마다 돌고, 브라우저를 띄우면 몇 초가
// 몇 십 초가 된다. 이 값들은 조판을 바꿀 때만 움직이므로 **손으로 돌리는 자**로 둔다.
// 규약 §10의 집필 순서에 이 명령이 들어 있다.
// 폰 실측. 규약 §8의 위젯 상단 깊이와 §5.5 S5(컨트롤→판독)를 잰다.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = process.argv[2];
const SHOT_DIR = process.argv[3];
const PORT = 4321;
const PHONE = { width: 390, height: 844 };
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".xml": "application/xml", ".json": "application/json" };

const server = createServer((req, res) => {
  let path = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (existsSync(path) && !extname(path)) path = join(path, "index.html");
  if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((ok) => server.listen(PORT, ok));
mkdirSync(SHOT_DIR, { recursive: true });

const slugs = readdirSync(DIST, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(DIST, e.name, "index.html")))
  .map((e) => e.name)
  .filter((n) => readFileSync(join(DIST, n, "index.html"), "utf8").includes("data-widget"));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 2 });
console.log("slug".padEnd(26), "위젯상단".padStart(8), "컨트롤→판독".padStart(11), "문서높이".padStart(8), "가로넘침".padStart(8));
for (const slug of slugs) {
  await page.goto(`http://localhost:${PORT}/${slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const top = (el) => (el ? el.getBoundingClientRect().top + window.scrollY : null);
    const widget = document.querySelector("[data-widget]");
    const control = document.querySelector(".widget-controls");
    const readout = document.querySelector(".readouts, .verdict, .widget-verdict");
    return {
      widgetTop: Math.round(top(widget) ?? -1),
      // 부호를 살린다. 음수는 **판독이 컨트롤보다 위**라는 뜻이고 그것은 위반이
      // 아니라 오히려 좋은 배치다 — 절댓값으로 접으면 그 구별이 사라진다.
      seam: control && readout ? Math.round(top(readout) - top(control)) : null,
      docHeight: Math.round(document.documentElement.scrollHeight),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  // 규약 §8 개정판: 목표 1,300 / 한계 1,400. 덱(②)과 위젯 앞 도해가 둘 다 없던
  // 때의 1,150/1,200은 지금 조판에서 아무도 못 지킨다 — 본보기 몬티홀이 1,324다.
  const DEPTH_LIMIT = 1400;
  const SEAM_LIMIT = 844;
  const flag = m.widgetTop > DEPTH_LIMIT ? "⚠" : " ";
  const seamFlag = m.seam !== null && m.seam > SEAM_LIMIT ? "⚠" : " ";
  console.log(slug.padEnd(26), `${m.widgetTop}${flag}`.padStart(8),
    `${m.seam ?? "—"}${seamFlag}`.padStart(11), String(m.docHeight).padStart(8), String(m.overflow).padStart(8));
  await page.screenshot({ path: join(SHOT_DIR, `${slug}.png`), fullPage: true });
}
await browser.close();
server.close();
