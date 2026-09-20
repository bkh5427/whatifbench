/**
 * 공유 카드(og:image) 생성기.
 *
 * 왜 필요한가: 위젯은 캔버스에 그린다 — JS가 돌아야 보인다. 검색 결과 미리보기와
 * 메신저·SNS의 링크 카드는 JS를 돌리지 않는다. 그래서 **정지 이미지**가 따로 있어야
 * 링크가 그림 없는 맨 줄로 나가지 않는다.
 *
 * 저작권 위험 0 조항: 여기서 그리는 것은 전부 직접 만든 도형과 글자뿐이다.
 * 사진·스톡·외부 아이콘을 쓰지 않는다.
 *
 * 진실 원본은 `src/data/tools.js` 하나다. 이름·카테고리·숫자를 여기 적지 않는다.
 *
 * 산출물은 PNG 파일이라 **한 번 만들어 두면 저장소에 그대로 남는다.** 도구 이름이나
 * 카드 숫자가 바뀔 때만 다시 돌리면 된다. 그래서 브라우저를 이 저장소의 의존성으로
 * 넣지 않았다 — PC에 130MB짜리 브라우저를 받게 할 이유가 없다.
 *
 * 실행 (브라우저가 있는 환경에서):
 *   PLAYWRIGHT_MODULE=/절대경로/playwright/index.mjs node scripts/build-og.mjs
 * 저장소에 playwright가 설치돼 있으면 환경변수 없이 그냥 돌아간다.
 *
 * 산출: public/og/<slug>.png (1200×630), public/og/default.png
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, CATEGORIES } from "../src/data/tools.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 상수 (하드코딩 금지 — 값은 전부 이름을 가진다) ──────────────
const OG_WIDTH_PX = 1200;
const OG_HEIGHT_PX = 630;
/** 뷰포트를 절반으로 잡고 2배 밀도로 찍는다 — 같은 1200×630인데 글자가 또렷하다. */
const OG_SCALE = 2;
const OG_DIR = join(ROOT, "public", "og");
const OG_DEFAULT_NAME = "default";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";

/** 사이트가 실제로 쓰는 서체. 컨테이너에 없으므로 파일을 카드에 심는다. */
const FONT_FILES = [
  { family: "IBM Plex Sans", weight: 400, file: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2" },
  { family: "IBM Plex Sans", weight: 600, file: "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2" },
  { family: "IBM Plex Mono", weight: 500, file: "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2" },
  { family: "Source Serif 4", weight: 600, file: "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2" },
];

/** `global.css`의 `:root` 토큰과 같은 값. 카드가 사이트와 같은 얼굴이어야 한다. */
const TOKENS = {
  paper: "#faf9f6",
  sunk: "#f0f0ea",
  surface: "#ffffff",
  graphite: "#2b2f33",
  graphiteSoft: "#5f666b",
  rule: "#d6d8d1",
  hold: "#2f5d50",
  edge: "#8a6414",
  break: "#a63d2e",
  link: "#1f4e79",
};

const SITE_NAME = "whatifbench";
const SITE_DOMAIN = "whatifbench.com";
const DEFAULT_HEADLINE = "Move the slider. Watch the intuition break.";
const DEFAULT_EYEBROW = "Interactive calculators";

/** 서체 파일을 base64로 읽어 `@font-face` 규칙을 만든다. 외부 요청이 없어야 한다. */
function fonts_build_css() {
  return FONT_FILES.map(({ family, weight, file }) => {
    const path = join(ROOT, "node_modules", file);
    if (!existsSync(path)) throw new Error(`서체 파일이 없다: ${file} — npm install을 먼저 한다`);
    const data = readFileSync(path).toString("base64");
    return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
  }).join("");
}

/** 카드 한 장의 HTML. 값은 전부 인자로 받는다 — 이 함수는 아무것도 알지 않는다. */
function card_build_html({ fontCss, eyebrow, headline, figureValue, figureLabel }) {
  const figureBlock = figureValue
    ? `<div class="fig">
         <div class="fig-value">${card_escape_text(figureValue)}</div>
         <div class="fig-label">${card_escape_text(figureLabel ?? "")}</div>
       </div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${OG_WIDTH_PX / OG_SCALE}px;height:${OG_HEIGHT_PX / OG_SCALE}px;overflow:hidden}
body{background:${TOKENS.paper};color:${TOKENS.graphite};
  font-family:"IBM Plex Sans",system-ui,sans-serif;display:flex;flex-direction:column}
/* 사이트 헤더 아래의 그 삼색 띠 — 이 사이트의 서명이다 */
.band{display:flex;height:6px;flex:0 0 auto}
.band i{flex:1}
.band i:nth-child(1){background:${TOKENS.hold}}
.band i:nth-child(2){background:${TOKENS.edge}}
.band i:nth-child(3){background:${TOKENS.break}}
.body{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:34px 44px 30px}
.brand{display:flex;align-items:center;gap:10px;
  font-family:"Source Serif 4",Georgia,serif;font-weight:600;font-size:22px;letter-spacing:-0.01em}
.mid{display:flex;align-items:flex-end;gap:26px}
.text{flex:1;min-width:0}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
  color:${TOKENS.graphiteSoft};margin-bottom:12px}
h1{font-family:"Source Serif 4",Georgia,serif;font-weight:600;font-size:44px;line-height:1.14;
  letter-spacing:-0.015em;text-wrap:balance}
/* 도구 카드의 숫자 블록과 같은 모양 — 목록에서 보던 것이 카드에도 있다 */
.fig{flex:0 0 auto;max-width:220px;background:${TOKENS.sunk};
  border-left:3px solid ${TOKENS.link};padding:14px 16px}
.fig-value{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:500;font-size:30px;
  letter-spacing:-0.02em;line-height:1.1}
.fig-label{font-size:11px;line-height:1.35;color:${TOKENS.graphiteSoft};margin-top:7px}
.foot{display:flex;justify-content:space-between;align-items:baseline;
  border-top:1px solid ${TOKENS.rule};padding-top:12px;
  font-size:12px;color:${TOKENS.graphiteSoft}}
.foot b{font-weight:600;color:${TOKENS.graphite}}
</style></head><body>
<div class="band"><i></i><i></i><i></i></div>
<div class="body">
  <div class="brand">
    <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
      <rect x="0" y="8" width="10.6" height="5" rx="1.5" fill="${TOKENS.hold}"/>
      <rect x="10.6" y="8" width="10.7" height="5" fill="${TOKENS.edge}"/>
      <rect x="21.3" y="8" width="10.7" height="5" rx="1.5" fill="${TOKENS.break}"/>
      <circle cx="21.3" cy="10.5" r="5.5" fill="${TOKENS.paper}" stroke="${TOKENS.graphite}" stroke-width="2"/>
    </svg>
    ${SITE_NAME}
  </div>
  <div class="mid">
    <div class="text">
      <div class="eyebrow">${card_escape_text(eyebrow)}</div>
      <h1>${card_escape_text(headline)}</h1>
    </div>
    ${figureBlock}
  </div>
  <div class="foot">
    <span>Drag a slider — the model answers.</span>
    <span><b>${SITE_DOMAIN}</b></span>
  </div>
</div>
</body></html>`;
}

/** 도구 이름·설명에 따옴표나 꺾쇠가 들어가도 카드가 깨지지 않게 한다. */
function card_escape_text(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 카드로 만들 목록. 발행 여부와 무관하게 전부 만든다 — 발행 순간 바로 쓰이게. */
function cards_read_list() {
  const list = TOOLS.map((tool) => {
    const category = CATEGORIES.find((c) => c.key === tool.category);
    return {
      name: tool.slug,
      eyebrow: category ? category.name : DEFAULT_EYEBROW,
      headline: tool.name,
      figureValue: tool.figure?.value ?? null,
      figureLabel: tool.figure?.label ?? null,
    };
  });
  list.push({
    name: OG_DEFAULT_NAME,
    eyebrow: DEFAULT_EYEBROW,
    headline: DEFAULT_HEADLINE,
    figureValue: null,
    figureLabel: null,
  });
  return list;
}

async function og_build_all() {
  const fontCss = fonts_build_css();
  mkdirSync(OG_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const page = await browser.newPage({
    viewport: { width: OG_WIDTH_PX / OG_SCALE, height: OG_HEIGHT_PX / OG_SCALE },
    deviceScaleFactor: OG_SCALE,
  });

  const written = [];
  for (const card of cards_read_list()) {
    await page.setContent(card_build_html({ fontCss, ...card }), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const target = join(OG_DIR, `${card.name}.png`);
    writeFileSync(target, await page.screenshot({ type: "png" }));
    written.push(`${card.name}.png`);
  }

  await browser.close();
  console.log(`공유 카드 ${written.length}장: ${written.join(" ")}`);
}

await og_build_all();
