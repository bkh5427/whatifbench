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
import { tools_read_published, CATEGORIES } from "../src/data/tools.js";
import { SITE_HEADLINE, SITE_NAME, SITE_DOMAIN } from "../src/data/site.js";
import { createHash } from "node:crypto";
/** 카드마다 그린 글자와 PNG 해시. 사실 검사 게이트가 읽는다. */
const OG_MANIFEST_PATH = fileURLToPath(new URL("./audit/og-manifest.json", import.meta.url));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 상수 (하드코딩 금지 — 값은 전부 이름을 가진다) ──────────────
const OG_WIDTH_PX = 1200;
const OG_HEIGHT_PX = 630;
/** 뷰포트를 절반으로 잡고 2배 밀도로 찍는다 — 같은 1200×630인데 글자가 또렷하다. */
const OG_SCALE = 2;
const OG_DIR = join(ROOT, "public", "og");
const OG_DEFAULT_NAME = "default";
/** 크로뮴 위치. 환경변수가 우선, 없으면 클라우드 기본 위치, 그것도 없으면(Windows 등) Playwright 기본값. */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

/**
 * 사이트가 실제로 쓰는 서체. 컨테이너에 없으므로 파일을 카드에 심는다.
 * `Base.astro`가 import하는 것과 같은 세 가족이다 — 본문 Barlow,
 * 표제 Barlow Condensed, 숫자 IBM Plex Mono (`global.css`의 --sans/--serif/--mono).
 */
const FONT_FILES = [
  { family: "Barlow", weight: 400, file: "@fontsource/barlow/files/barlow-latin-400-normal.woff2" },
  { family: "Barlow", weight: 600, file: "@fontsource/barlow/files/barlow-latin-600-normal.woff2" },
  { family: "Barlow Condensed", weight: 600, file: "@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2" },
  { family: "IBM Plex Mono", weight: 500, file: "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2" },
];

/**
 * `global.css`의 `:root` 토큰과 같은 값. 카드가 사이트와 같은 얼굴이어야 한다.
 * 머리띠와 로고는 판정 3색(hold/edge/break)이 아니라 **강철 계조 3단**이다 —
 * `global.css`의 `.regime-band`와 `Base.astro`의 로고가 그 셋을 쓴다.
 */
const TOKENS = {
  paper: "#f2f2f3",
  sunk: "#e9e9ea",
  surface: "#f5f5f8",
  graphite: "#1d1f20",
  graphiteSoft: "#5d5d60",
  rule: "color-mix(in srgb, #1d1f20 16%, transparent)",
  steel300: "#b5d9fd",
  steel600: "#597ea3",
  steel900: "#1d2d3d",
  link: "#416180",
};

// 제목·이름·주소는 `src/data/site.js`에서 읽는다 — 홈과 같은 문장이어야 한다.
const DEFAULT_HEADLINE = SITE_HEADLINE;
/**
 * 기본 카드(`default.png`)의 눈썹. **발행된 계산기 개수를 약속하는 문구다** —
 * 하나인데 "calculators"라고 쓰면 링크 미리보기가 없는 집합을 약속한다.
 * `src/pages/privacy.astro`의 `CALCULATOR_MIN_FOR_PLURAL_TEXT`,
 * `src/pages/[category].astro`의 `elsewhere_text`와 같은 규율이다: 개수에서
 * 문장을 만든다. 두 번째 도구를 발행하고 이 스크립트를 다시 돌리면 저절로 복수형이 된다.
 */
const CALCULATOR_MIN_FOR_PLURAL_TEXT = 2;
const default_eyebrow_text = (publishedCount) =>
  publishedCount >= CALCULATOR_MIN_FOR_PLURAL_TEXT ? "Interactive calculators" : "Interactive calculator";

/** 서체 파일을 base64로 읽어 `@font-face` 규칙을 만든다. 외부 요청이 없어야 한다. */
function fonts_build_css() {
  return FONT_FILES.map(({ family, weight, file }) => {
    const path = join(ROOT, "node_modules", file);
    if (!existsSync(path)) throw new Error(`서체 파일이 없다: ${file} — npm install을 먼저 한다`);
    const data = readFileSync(path).toString("base64");
    return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
  }).join("");
}

/** 글 폴더의 썸네일 원문. 사이트 카드와 **같은 파일**이다. 없으면 null. */
const THUMB_FILE_NAME = "_thumb.svg";
function thumb_read_svg(slug) {
  const path = join(ROOT, "src", "pages", slug, THUMB_FILE_NAME);
  return existsSync(path) ? readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, "") : null;
}

/**
 * 썸네일 SVG가 읽는 색 토큰. `global.css`의 `:root` 블록을 **그대로** 옮긴다 —
 * 그림의 색이 사이트와 카드에서 같아야 하고, 값을 여기 다시 적으면 둘이 갈라진다.
 */
const GLOBAL_CSS_PATH = join(ROOT, "src", "styles", "global.css");
function tokens_read_root_css() {
  const match = readFileSync(GLOBAL_CSS_PATH, "utf8").match(/:root\s*\{[\s\S]*?\n\}/);
  if (!match) throw new Error("global.css에서 :root 블록을 찾지 못했다");
  return match[0];
}

/** 카드 한 장의 HTML. 값은 전부 인자로 받는다 — 이 함수는 아무것도 알지 않는다. */
function card_build_html({ fontCss, rootCss, eyebrow, headline, figureValue, figureLabel, thumbSvg }) {
  const figureBlock = figureValue
    ? `<div class="fig">
         <div class="fig-value">${card_escape_text(figureValue)}</div>
         <div class="fig-label">${card_escape_text(figureLabel ?? "")}</div>
       </div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
${rootCss}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${OG_WIDTH_PX / OG_SCALE}px;height:${OG_HEIGHT_PX / OG_SCALE}px;overflow:hidden}
body{background:${TOKENS.paper};color:${TOKENS.graphite};
  font-family:"Barlow",system-ui,sans-serif;display:flex;flex-direction:column}
/* 사이트 헤더 아래의 그 삼색 띠 — 이 사이트의 서명이다 */
.band{display:flex;height:6px;flex:0 0 auto}
.band i{flex:1}
.band i:nth-child(1){background:${TOKENS.steel300}}
.band i:nth-child(2){background:${TOKENS.steel600}}
.band i:nth-child(3){background:${TOKENS.steel900}}
.body{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:34px 44px 30px}
.brand{display:flex;align-items:center;gap:9px;
  font-family:"Barlow",system-ui,sans-serif;font-weight:600;font-size:26px;letter-spacing:-0.02em}
.mid{display:flex;align-items:flex-end;gap:26px}
.text{flex:1;min-width:0}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
  color:${TOKENS.graphiteSoft};margin-bottom:12px}
h1{font-family:"Barlow Condensed","Barlow",system-ui,sans-serif;font-weight:600;font-size:50px;
  line-height:1.04;letter-spacing:-0.005em;text-wrap:balance}
/* 도구 카드의 숫자 블록과 같은 모양 — 목록에서 보던 것이 카드에도 있다 */
.fig{flex:0 0 auto;max-width:220px;background:${TOKENS.sunk};
  border-left:3px solid ${TOKENS.link};padding:14px 16px}
.fig-value{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:500;font-size:30px;
  letter-spacing:-0.02em;line-height:1.1}
/* 썸네일이 있는 카드: 글은 왼쪽, 그림은 오른쪽. 숫자 블록은 제목 아래로 내린다 */
.has-thumb .mid{align-items:center;gap:22px}
.has-thumb h1{font-size:33px;line-height:1.04}
.has-thumb .eyebrow{margin-bottom:8px}
.has-thumb .body{padding:30px 44px 26px}
.has-thumb .fig{max-width:none;margin-top:12px;padding:8px 12px}
.has-thumb .fig-value{font-size:21px}
.has-thumb .fig-label{margin-top:4px}
.thumb{flex:0 0 216px;height:135px;border:1px solid ${TOKENS.rule};background:var(--steel-100)}
.thumb svg{display:block;width:100%;height:100%}
.fig-label{font-size:11px;line-height:1.35;color:${TOKENS.graphiteSoft};margin-top:7px}
.foot{display:flex;justify-content:space-between;align-items:baseline;
  border-top:1px solid ${TOKENS.rule};padding-top:12px;
  font-size:12px;color:${TOKENS.graphiteSoft}}
.foot b{font-weight:600;color:${TOKENS.graphite}}
</style></head><body class="${thumbSvg ? "has-thumb" : ""}">
<div class="band"><i></i><i></i><i></i></div>
<div class="body">
  <div class="brand">
    <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
      <rect x="0" y="8" width="10.6" height="5" rx="1.5" fill="${TOKENS.steel300}"/>
      <rect x="10.6" y="8" width="10.7" height="5" fill="${TOKENS.steel600}"/>
      <rect x="21.3" y="8" width="10.7" height="5" rx="1.5" fill="${TOKENS.steel900}"/>
      <circle cx="21.3" cy="10.5" r="5.5" fill="${TOKENS.paper}" stroke="${TOKENS.graphite}" stroke-width="2"/>
    </svg>
    ${SITE_NAME}
  </div>
  ${thumbSvg ? `<div class="mid">
    <div class="text">
      <div class="eyebrow">${card_escape_text(eyebrow)}</div>
      <h1>${card_escape_text(headline)}</h1>
      ${figureBlock}
    </div>
    <div class="thumb">${thumbSvg.replace(/\s(width|height)="\d+"/, "").replace(/\s(width|height)="\d+"/, "")}</div>
  </div>` : `<div class="mid">
    <div class="text">
      <div class="eyebrow">${card_escape_text(eyebrow)}</div>
      <h1>${card_escape_text(headline)}</h1>
    </div>
    ${figureBlock}
  </div>`}
  <div class="foot">
    <span>${card_escape_text(SITE_NAME)}</span>
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

/**
 * 카드로 만들 목록. **발행된 도구만이다.**
 * 카드는 `public/og/`에 그대로 남아 배포되므로, 미발행 도구까지 만들면
 * 이름과 대표 숫자가 `/og/<slug>.png`에서 그냥 읽힌다 — `tools.js`가 적어 둔
 * "미발행은 사이트 어디에도 나오지 않는다"가 깨진다.
 * 발행하는 날 이 스크립트를 다시 돌리면 그 도구의 카드가 생긴다.
 */
function cards_read_list() {
  const published = tools_read_published();
  const list = published.map((tool) => {
    const category = CATEGORIES.find((c) => c.key === tool.category);
    return {
      name: tool.slug,
      eyebrow: category ? category.name : default_eyebrow_text(published.length),
      headline: tool.name,
      figureValue: tool.figure?.value ?? null,
      figureLabel: tool.figure?.label ?? null,
      thumbSvg: thumb_read_svg(tool.slug),
    };
  });
  list.push({
    name: OG_DEFAULT_NAME,
    eyebrow: default_eyebrow_text(published.length),
    headline: DEFAULT_HEADLINE,
    figureValue: null,
    figureLabel: null,
    thumbSvg: null,
  });
  return list;
}

async function og_build_all() {
  const fontCss = fonts_build_css();
  const rootCss = tokens_read_root_css();
  mkdirSync(OG_DIR, { recursive: true });

  const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
  const page = await browser.newPage({
    viewport: { width: OG_WIDTH_PX / OG_SCALE, height: OG_HEIGHT_PX / OG_SCALE },
    deviceScaleFactor: OG_SCALE,
  });

  const written = [];
  const manifest = {};
  for (const card of cards_read_list()) {
    await page.setContent(card_build_html({ fontCss, rootCss, ...card }), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const target = join(OG_DIR, `${card.name}.png`);
    const png = await page.screenshot({ type: "png" });
    writeFileSync(target, png);
    written.push(`${card.name}.png`);
    // 사실 검사용 기록: PNG 안의 글자를 기계가 읽을 수 없으니, 그린 글자와 PNG 해시를 남긴다.
    // 게이트(`scripts/audit/check-audit.mjs`)가 tools.js와 대조해 낡은 카드를 잡는다.
    manifest[card.name] = { eyebrow: card.eyebrow, headline: card.headline, figureValue: card.figureValue, figureLabel: card.figureLabel, sha256: createHash("sha256").update(png).digest("hex") };
  }

  await browser.close();
  writeFileSync(OG_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`공유 카드 ${written.length}장: ${written.join(" ")}`);
}

await og_build_all();
