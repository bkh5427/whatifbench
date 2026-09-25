// 집필 규약 게이트. `00_project_main/writing-standard.md`가 법이고 이 파일이 집행부다.
//
// ── 왜 따로 있나 ───────────────────────────────────────────
// `check-publish.mjs`는 **배선과 미완성**을 본다 — 라우트가 겹치는가, 산출물이
// 있는가, `TODO`가 남았는가. 그것은 "나가도 되는가"의 검사다.
// 이 파일은 "규약대로 쓰였는가"를 본다. 두 관심사가 달라 파일을 나눴고,
// `gate_run`이 이 모듈의 위반을 자기 목록에 합친다 — 사람이 도는 명령은 하나다.
//
// ── 왜 만들었나 ────────────────────────────────────────────
// 규약 §9는 오랫동안 "게이트가 분량·도해 개수·viewBox·SVG 글자 크기·금지어를
// 막는다"고 적어 두었지만 **그중 어느 것도 구현돼 있지 않았다.** `npm run check`
// 통과를 규약 통과로 오인하게 만드는 상태였다. 이 파일이 그 여섯 줄을 실제로
// 집행한다.
//
// ── 무엇을 검사하나 ────────────────────────────────────────
// A) 구조   — 블록 역할(`data-block`)의 존재와 순서, 위젯이 첫 H2보다 앞인가
// B) 분량   — 절당 본문 글자 수, 리드 3문단 합계
// C) 도해   — 장수, viewBox 가로, SVG 글자 크기
// D) 문장   — 금지어, 퍼센트 띄어쓰기
// E) 이름   — `CRUMB` ↔ `tools.js`의 `name` 대조
//
// ── 왜 `data-block`인가 ────────────────────────────────────
// 규약 §7은 절 이름 중 일부만 고정하고 나머지는 **가변**으로 둔다(반전 절 제목은
// 그 페이지의 뒤집힘을 담아야 하므로 고정될 수 없다). 그러면 기계가 영어 제목을
// 보고 역할을 알아맞혀야 하는데, 그것은 맞힐 수 없는 문제다. 그래서 역할을
// 사람이 **선언**한다 — `<h2 data-block="reversal">`. 제목을 아무리 고쳐 써도
// 순서 검사는 계속 돈다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── 상수 ───────────────────────────────────────────────────
const PAGES_DIR = "src/pages";
const STYLE_FILE = "src/styles/global.css";
const DIST_DIR = "dist";
const FIG_DIR_NAME = "_fig";
const PAGE_EXT = ".astro";
const DIST_PAGE_NAME = "index.html";

/** 블록 역할. `data-block` 값으로 쓴다. 순서가 곧 규약 §1의 뼈대다. */
const BLOCK_REVERSAL = "reversal";
const BLOCK_HOWTO = "howto";
const BLOCK_MATH = "math";
const BLOCK_BYHAND = "byhand";
const BLOCK_ASSUMPTIONS = "assumptions";
const BLOCK_LIMITS = "limits";
const BLOCK_CLOSING = "closing";
const BLOCK_ABOUT = "about";

/** 규약 §1의 ⑦~⑭. 순서를 벗어나면 위반이다. */
const BLOCK_ORDER = [
  BLOCK_REVERSAL,
  BLOCK_HOWTO,
  BLOCK_MATH,
  BLOCK_BYHAND,
  BLOCK_ASSUMPTIONS,
  BLOCK_LIMITS,
  BLOCK_CLOSING,
  BLOCK_ABOUT,
];

/** 마무리 절(⑬)은 "재료가 있을 때만"이다 — 규약 §4. 나머지는 전부 있어야 한다. */
const BLOCK_OPTIONAL = new Set([BLOCK_CLOSING]);

/** 본문 절이 아닌 H2. 컴포넌트가 찍는 것이라 순서·분량 검사에서 아예 뺀다.
    (`RelatedTools`의 "Read next" — 글이 끝난 뒤의 이동 장치다) */
const BLOCK_RELATED = "related";
const BLOCK_IGNORED = new Set([BLOCK_RELATED]);

/** 규약 §8 예산. */
const SECTION_CHARS_MAX = 1500;
const LEAD_CHARS_MAX = 800;

/** 규약 §5. 도입 삽화(`fig-lede`)는 이 수에 넣지 않는다 — 그것은 §1.5의 선택 항목이다. */
const FIGURE_MIN = 3;
const FIGURE_VIEWBOX_WIDTH_MAX = 420;
const FIGURE_FONT_PX_MIN = 14;

/**
 * 위젯 **앞** 도해의 세로 상한. 규약 §1.5가 "가로형 짧은 띠"라고 정한 자리다.
 *
 * 왜 세로만 따로 재나: 이 한 장이 위젯을 아래로 민다. 폰(390×844) 실측에서
 * 위젯 상단이 1,193px(도해 185px)에서 1,651px(도해 513px)까지 갈렸고,
 * **차이는 전부 이 도해 하나**였다 — 덱·H1·바이라인·리드는 열 편이 거의 같았다.
 * 세로 150이면 폰에서 블록 약 250px, 위젯 상단 1,400px 안에 든다.
 */
const FIGURE_LEAD_VIEWBOX_HEIGHT_MAX = 150;

/** 본문으로 세는 태그. 규약 §8 "세는 법을 못박는다". */
const PROSE_TAGS = ["p", "li", "dt", "dd"];

/** 본문에서 **빼는** 덩어리. 도해 블록과 출처 목록, 스크립트. */
const PROSE_STRIP_PATTERNS = [
  /<figure\b[^>]*>[\s\S]*?<\/figure>/gi,
  /<ul\b[^>]*\bclass="[^"]*\bsources\b[^"]*"[^>]*>[\s\S]*?<\/ul>/gi,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style>/gi,
  /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
];

/** 리드에서 빼는 것. 덱은 ②이지 리드가 아니다. 바이라인도 아니다. */
const LEAD_STRIP_PATTERNS = [
  /<p\b[^>]*\bclass="[^"]*\bdeck\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
  /<(?:div|p)\b[^>]*\bclass="[^"]*\bbyline\b[^"]*"[^>]*>[\s\S]*?<\/(?:div|p)>/gi,
];

/** 출처 목록을 기계가 알아보게 하는 표식. 이것이 없으면 분량에 출처가 섞인다. */
const SOURCES_CLASS = "sources";

/** 규약 §6 금지어. 예방 목록이다 — 사이트에 0건인 상태를 유지한다. */
const BANNED_WORDS = [
  "amazing", "incredible", "game-changing", "you won't believe",
  "obviously", "clearly", "of course", "unfortunately",
  "essentially", "basically", "the best way to",
  "note that", "in order to", "utilize", "leverage",
  "we recommend", "i recommend",
  // 규약 §6 절대규칙 0의 금지 낱말 — 중학생이 읽는다
  "unconditional", "monte carlo", "symmetry", "derivation",
  "redistribute", "standard error", "editorial cut-off",
];

/** 도해 글자에 허용하는 class의 접두사. 크기는 `global.css`가 정한다. */
const FIGURE_TEXT_CLASS_PREFIX = "fig-";
const FIGURE_TEXT_TAGS = ["text", "tspan"];

/** 규약 §6 숫자. 퍼센트는 붙여 쓴다 (`6.06 %`가 13건 있었다). */
const PERCENT_LOOSE_PATTERN = /\d\s+%/g;

/** 위반 메시지에 붙이는 문맥 길이. */
const CONTEXT_PAD = 50;

// ── 텍스트 도구 ────────────────────────────────────────────
/** 엔티티를 되돌린다. 글자 수를 세는 것이 목적이라 흔한 것만 본다. */
function standard_decode_entities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

/** 태그를 지우고 공백을 하나로 접는다. */
function standard_strip_tags(html) {
  return standard_decode_entities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** 규약 §8의 세는 법. `<p> <li> <dt> <dd>`만 세고 나머지는 세지 않는다. */
function standard_count_prose(html) {
  let body = html;
  for (const pattern of PROSE_STRIP_PATTERNS) body = body.replace(pattern, " ");
  let total = 0;
  for (const tag of PROSE_TAGS) {
    const scanner = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    let found;
    while ((found = scanner.exec(body)) !== null) {
      total += standard_strip_tags(found[1]).length;
    }
  }
  return total;
}

// ── A) 구조 ────────────────────────────────────────────────
/** H2를 등장 순서대로 뽑는다. `data-block`이 없으면 null로 남겨 위반으로 잡는다. */
function standard_read_blocks(html) {
  const blocks = [];
  const scanner = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
  let found;
  while ((found = scanner.exec(html)) !== null) {
    const attrs = found[1];
    const role = /\bdata-block="([^"]+)"/.exec(attrs);
    blocks.push({
      role: role ? role[1] : null,
      title: standard_strip_tags(found[2]),
      at: found.index,
      end: scanner.lastIndex,
    });
  }
  // **경계로는 남긴다.** 걸러 버리면 앞 절(About)의 구간이 문서 끝까지 늘어나
  // "Read next" 목록의 글자가 About 분량에 섞여 세어진다 — 발행된 도구가 늘수록
  // 그 목록이 길어져, 글을 고치지 않았는데 절이 한도를 넘는 일이 실제로 있었다.
  return blocks;
}

/** 역할 검사에 쓰는 절만. 컴포넌트가 찍는 H2는 뺀다. */
function standard_filter_content(blocks) {
  return blocks.filter((block) => !BLOCK_IGNORED.has(block.role));
}

function standard_check_structure(route, html, allBlocks) {
  const violations = [];
  const blocks = standard_filter_content(allBlocks);
  const say = (message) => violations.push({ file: `${DIST_DIR}/${route}`, message });

  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count !== 1) say(`H1이 ${h1Count}개다. 정확히 하나여야 한다`);

  if (!/class="[^"]*\bdeck\b/.test(html)) say("덱(②)이 없다 — 폰 첫 화면에서 왜 읽는지 답하는 한 줄");

  const widgetAt = html.search(/<[^>]*\bdata-widget=/);
  if (widgetAt < 0) {
    say("위젯(⑥)이 없다");
  } else if (blocks.length > 0 && widgetAt > blocks[0].at) {
    say("위젯이 첫 H2보다 **뒤**에 있다 — 규약 §1은 위젯 다음이 반전 절이다");
  }

  const unlabelled = blocks.filter((b) => b.role === null);
  for (const block of unlabelled) {
    say(`H2 "${block.title}"에 data-block이 없다 — 역할을 선언해야 순서를 검사한다`);
  }

  const known = new Set(BLOCK_ORDER);
  const seen = blocks.filter((b) => b.role !== null).map((b) => b.role);
  for (const role of seen) {
    if (!known.has(role)) say(`data-block="${role}"은 규약에 없는 역할이다`);
  }

  for (const role of BLOCK_ORDER) {
    if (BLOCK_OPTIONAL.has(role)) continue;
    const count = seen.filter((r) => r === role).length;
    if (count === 0) say(`블록 "${role}"이 없다`);
    else if (count > 1) say(`블록 "${role}"이 ${count}개다 — 역할은 페이지당 하나다`);
  }

  // 순서. 알려진 역할만 추려 규약 순서의 부분수열인지 본다.
  const rank = new Map(BLOCK_ORDER.map((role, i) => [role, i]));
  const ranked = seen.filter((role) => rank.has(role)).map((role) => rank.get(role));
  for (let i = 1; i < ranked.length; i += 1) {
    if (ranked[i] <= ranked[i - 1]) {
      say(
        `절 순서가 규약 §1과 다르다 — "${BLOCK_ORDER[ranked[i - 1]]}" 다음에 ` +
        `"${BLOCK_ORDER[ranked[i]]}"가 왔다`
      );
      break;
    }
  }

  const last = seen[seen.length - 1];
  if (last !== undefined && last !== BLOCK_ABOUT) {
    say(`마지막 절이 "${last}"다 — About(⑭)이 맨 끝이어야 한다`);
  }
  return violations;
}

// ── B) 분량 ────────────────────────────────────────────────
function standard_check_length(route, html, blocks) {
  const violations = [];
  const say = (message) => violations.push({ file: `${DIST_DIR}/${route}`, message });

  // 리드(⑤) = 본문 시작부터 위젯까지. 덱과 바이라인은 뺀다.
  const widgetAt = html.search(/<[^>]*\bdata-widget=/);
  const h1End = html.search(/<\/h1>/i);
  if (widgetAt > 0 && h1End > 0 && widgetAt > h1End) {
    let lead = html.slice(h1End, widgetAt);
    for (const pattern of LEAD_STRIP_PATTERNS) lead = lead.replace(pattern, " ");
    const leadChars = standard_count_prose(lead);
    if (leadChars > LEAD_CHARS_MAX) {
      say(`리드가 ${leadChars}자다 — 한도 ${LEAD_CHARS_MAX}자 (규약 §8)`);
    }
  }

  for (let i = 0; i < blocks.length; i += 1) {
    if (BLOCK_IGNORED.has(blocks[i].role)) continue;
    const from = blocks[i].end;
    const to = i + 1 < blocks.length ? blocks[i + 1].at : html.length;
    const chars = standard_count_prose(html.slice(from, to));
    if (chars > SECTION_CHARS_MAX) {
      const name = blocks[i].role ?? blocks[i].title;
      say(`절 "${name}"이 ${chars}자다 — 한도 ${SECTION_CHARS_MAX}자 (규약 §8)`);
    }
  }
  return violations;
}

// ── C) 도해 ────────────────────────────────────────────────
function standard_check_figures(route, html) {
  const violations = [];
  const say = (message) => violations.push({ file: `${DIST_DIR}/${route}`, message });

  const all = html.match(/<figure\b[^>]*>/gi) ?? [];
  const lede = all.filter((tag) => /\bfig-lede\b/.test(tag)).length;
  const counted = all.length - lede;
  if (counted < FIGURE_MIN) {
    say(`도해가 ${counted}장이다 — 최소 ${FIGURE_MIN}장 (규약 §5). 도입 삽화는 세지 않는다`);
  }

  // 위젯 앞에 그림이 한 장 있어야 한다 — 규약 §5.5 S7. 규칙을 모르면 슬라이더를
  // 만질 수가 없다. 그리고 그 한 장은 **가로 띠**여야 한다 (§1.5) — 세로로 길면
  // 위젯이 화면 밖으로 밀린다.
  const widgetAt = html.search(/<[^>]*\bdata-widget=/);
  if (widgetAt > 0) {
    const before = html.slice(0, widgetAt);
    const figureAt = before.lastIndexOf("<figure");
    if (figureAt < 0) {
      say("위젯 앞에 도해가 없다 — 규칙 도해는 위젯 앞이다 (규약 §5.5 S7)");
    } else {
      // **소스가 아니라 산출물에서 읽는다.** 규약 §5는 치수를 이름 있는 상수로
      // 올리라고 하는데, 그러면 소스에는 `viewBox={`0 0 ${W} ${H}`}`만 남아
      // 리터럴을 찾는 검사가 **한 건도 매칭되지 않는다**. 실제로 그렇게 통과한
      // 도해가 있었다. 산출물에는 계산된 값이 박혀 있다.
      const box = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i.exec(
        before.slice(figureAt)
      );
      if (box) {
        const [width, height] = [Number(box[1]), Number(box[2])];
        if (width > FIGURE_VIEWBOX_WIDTH_MAX) {
          say(`위젯 앞 도해의 viewBox 가로가 ${width}다 — 한도 ${FIGURE_VIEWBOX_WIDTH_MAX} (규약 §5)`);
        }
        if (height > FIGURE_LEAD_VIEWBOX_HEIGHT_MAX) {
          say(
            `위젯 앞 도해의 viewBox 세로가 ${height}다 — 한도 ${FIGURE_LEAD_VIEWBOX_HEIGHT_MAX} ` +
            `(규약 §1.5 "가로형 짧은 띠"). 이 한 장이 위젯을 화면 밖으로 민다`
          );
        }
      }
    }
  }
  // 산출물의 모든 도해. 소스 검사가 템플릿 리터럴을 못 읽으므로 여기가 본검사다.
  for (const fig of html.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)) {
    for (const box of fig[1].matchAll(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+[\d.]+\s*"/gi)) {
      const width = Number(box[1]);
      if (width > FIGURE_VIEWBOX_WIDTH_MAX) {
        say(`도해의 viewBox 가로가 ${width}다 — 한도 ${FIGURE_VIEWBOX_WIDTH_MAX} (규약 §5)`);
      }
    }
  }

  if (!new RegExp(`class="[^"]*\\b${SOURCES_CLASS}\\b`).test(html)) {
    say(`출처 목록에 class="${SOURCES_CLASS}"가 없다 — 없으면 분량에 출처가 섞여 세어진다`);
  }
  return violations;
}

/**
 * `global.css`에서 `.fig-*`의 글자 크기를 읽는다.
 *
 * 규약 §9가 스스로 적어 둔 구멍이었다 — "복합 CSS 선택자를 게이트가 못 읽는다".
 * 실제 도해는 `font-size`를 인라인으로 쓰지 않고 `class="fig-label"`을 쓴다.
 * 그래서 인라인만 보던 검사는 **한 건도 못 보고** 통과했다.
 * 같은 class에 규칙이 여럿이면(`.fig-label`과 `.fig-svg .fig-label`) **가장 작은
 * 값**을 그 class의 크기로 잡는다. 화면에 나오는 것은 더 구체적인 쪽이지만,
 * 어느 쪽이 이길지 게이트가 판정하려 들면 틀린다 — 보수적으로 잡는다.
 */
function standard_read_figure_font_sizes(root) {
  const path = join(root, STYLE_FILE);
  if (!existsSync(path)) return null;
  const css = readFileSync(path, "utf8");
  const sizes = new Map();
  const scanner = /([^{}]+)\{([^{}]*)\}/g;
  let rule;
  while ((rule = scanner.exec(css)) !== null) {
    const size = /font-size\s*:\s*([\d.]+)px/.exec(rule[2]);
    if (!size) continue;
    const px = Number(size[1]);
    for (const found of rule[1].matchAll(/\.(fig-[a-z0-9-]+)/gi)) {
      const name = found[1];
      sizes.set(name, Math.min(sizes.get(name) ?? Infinity, px));
    }
  }
  return sizes;
}

/** 도해 소스(`_fig/*.astro`)의 제작 표준. 규약 §5. */
function standard_check_figure_sources(root, slug, fontSizes) {
  const violations = [];
  const dir = join(root, PAGES_DIR, slug, FIG_DIR_NAME);
  if (!existsSync(dir)) return violations;

  for (const name of readdirSync(dir)) {
    if (!name.endsWith(PAGE_EXT)) continue;
    const rel = `${PAGES_DIR}/${slug}/${FIG_DIR_NAME}/${name}`;
    const text = readFileSync(join(dir, name), "utf8");
    const say = (message) => violations.push({ file: rel, message });

    if (!text.startsWith("---")) {
      say("프런트매터(`---`)로 시작하지 않는다 — 전송 중 C2PA 서명이 끼어들어 파일이 깨진다 (규약 §5)");
    }

    const viewBoxes = text.matchAll(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/gi);
    for (const box of viewBoxes) {
      const width = Number(box[1]);
      if (width > FIGURE_VIEWBOX_WIDTH_MAX) {
        say(`viewBox 가로가 ${width}다 — 한도 ${FIGURE_VIEWBOX_WIDTH_MAX} (규약 §5)`);
      }
    }

    // SVG 글자 크기 — 인라인. `font-size: 13px` / `font-size="13"` 둘 다 본다.
    for (const size of text.matchAll(/font-size\s*[:=]\s*"?\s*([\d.]+)\s*(px)?/gi)) {
      const px = Number(size[1]);
      if (px < FIGURE_FONT_PX_MIN) {
        say(`SVG 글자가 ${px}px다 — 최소 ${FIGURE_FONT_PX_MIN}px (규약 §5). 모바일 실렌더는 ×0.786이다`);
      }
    }

    // SVG 글자 크기 — class. 실제 도해는 이쪽을 쓴다.
    for (const tag of FIGURE_TEXT_TAGS) {
      for (const el of text.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))) {
        const attrs = el[1];
        if (/font-size/.test(attrs)) continue; // 인라인은 위에서 봤다
        const classes = /\bclass="([^"]*)"/.exec(attrs);
        const named = (classes?.[1] ?? "")
          .split(/\s+/)
          .filter((name) => name.startsWith(FIGURE_TEXT_CLASS_PREFIX));
        if (named.length === 0) {
          say(`<${tag}>에 크기를 정하는 것이 없다 — \`${FIGURE_TEXT_CLASS_PREFIX}*\` class를 준다 (규약 §5)`);
          continue;
        }
        if (!fontSizes) continue; // 스타일시트를 못 읽으면 판정하지 않는다
        for (const name of named) {
          const px = fontSizes.get(name);
          if (px === undefined) {
            say(`class="${name}"에 글자 크기 규칙이 없다 — ${STYLE_FILE}에서 크기를 정한다`);
          } else if (px < FIGURE_FONT_PX_MIN) {
            say(`class="${name}"이 ${px}px다 — 최소 ${FIGURE_FONT_PX_MIN}px (규약 §5)`);
          }
        }
      }
    }
  }
  return violations;
}

// ── D) 문장 ────────────────────────────────────────────────
function standard_check_prose(route, html) {
  const violations = [];
  const say = (message) => violations.push({ file: `${DIST_DIR}/${route}`, message });

  // 읽는 글자만 본다. 태그·속성·스크립트 안의 낱말은 금지어가 아니다.
  let body = html;
  for (const pattern of PROSE_STRIP_PATTERNS) body = body.replace(pattern, " ");
  const text = standard_strip_tags(body);
  const lower = text.toLowerCase();

  for (const word of BANNED_WORDS) {
    const at = lower.indexOf(word);
    if (at < 0) continue;
    const context = text.slice(Math.max(0, at - CONTEXT_PAD), at + word.length + CONTEXT_PAD);
    say(`금지어 "${word}" (규약 §6) — …${context}…`);
  }

  const loose = text.match(PERCENT_LOOSE_PATTERN);
  if (loose) say(`퍼센트를 띄어 썼다 ${loose.length}건 — 규약 §6은 \`66.7%\`로 붙여 쓴다`);
  return violations;
}

// ── E) 이름 ────────────────────────────────────────────────
/** `CRUMB` ↔ `tools.js`의 `name`. 규약 §7은 "글자 하나까지 같아야" 한다고 못박는다. */
function standard_check_crumb(root, slug, tool) {
  const violations = [];
  // 폴더 라우트(`<slug>/index.astro`)가 정석이지만, 납작한 `<slug>.astro`도
  // 라우트로는 같다. 둘 다 본다 — 한쪽만 보면 나머지에서 검사가 조용히 꺼진다.
  const candidates = [`${PAGES_DIR}/${slug}/index${PAGE_EXT}`, `${PAGES_DIR}/${slug}${PAGE_EXT}`];
  const rel = candidates.find((candidate) => existsSync(join(root, candidate)));
  if (!rel) return violations;
  const path = join(root, rel);

  const found = /const\s+CRUMB\s*=\s*"([^"]*)"/.exec(readFileSync(path, "utf8"));
  if (!found) {
    violations.push({ file: rel, message: "CRUMB 상수가 없다 (규약 §7)" });
    return violations;
  }
  if (found[1] !== tool.name) {
    violations.push({
      file: rel,
      message: `CRUMB "${found[1]}"이 tools.js의 name "${tool.name}"과 다르다 (규약 §7)`,
    });
  }

  // 카테고리. 페이지가 자기 카테고리를 따로 적는데 그것이 등록부와 갈라지면
  // 브레드크럼과 사이드바가 서로 다른 곳을 가리킨다. 아홉 편 중 일곱이 그랬다 —
  // 카테고리 이름을 바꿀 때 페이지가 따라오지 않았기 때문이다.
  const category = /const\s+CATEGORY\s*=\s*"([^"]*)"/.exec(readFileSync(path, "utf8"));
  if (category && tool.category && category[1] !== tool.category) {
    violations.push({
      file: rel,
      message: `CATEGORY "${category[1]}"이 tools.js의 category "${tool.category}"와 다르다`,
    });
  }
  return violations;
}

// ── 전체 ───────────────────────────────────────────────────
/**
 * 발행된 도구 페이지만 검사한다. 초안은 아직 규약에 맞지 않는 것이 정상이고,
 * 맞추기 전에는 `published: false`라 배포되지 않는다.
 */
export function standard_run(root, tools) {
  const violations = [];
  const fontSizes = standard_read_figure_font_sizes(root);
  for (const tool of tools.TOOLS) {
    if (!tool.published) continue;
    const slug = tool.slug;
    const route = `${slug}/${DIST_PAGE_NAME}`;
    const distPath = join(root, DIST_DIR, slug, DIST_PAGE_NAME);
    if (!existsSync(distPath)) continue; // 산출물 부재는 check-publish의 소관이다

    const html = readFileSync(distPath, "utf8");
    const blocks = standard_read_blocks(html);
    violations.push(...standard_check_structure(route, html, blocks));
    violations.push(...standard_check_length(route, html, blocks));
    violations.push(...standard_check_figures(route, html));
    violations.push(...standard_check_figure_sources(root, slug, fontSizes));
    violations.push(...standard_check_prose(route, html));
    violations.push(...standard_check_crumb(root, slug, tool));
  }
  return violations;
}

export const STANDARD_LIMITS = {
  SECTION_CHARS_MAX,
  LEAD_CHARS_MAX,
  FIGURE_MIN,
  FIGURE_VIEWBOX_WIDTH_MAX,
  FIGURE_LEAD_VIEWBOX_HEIGHT_MAX,
  FIGURE_FONT_PX_MIN,
  BLOCK_ORDER,
  BANNED_WORDS,
};

// ── 실측 보고 ──────────────────────────────────────────────
/**
 * 게이트가 아니라 **자**다. 한도를 넘었는지가 아니라 지금 얼마인지를 찍는다.
 * 규약 §8의 예산표를 갱신할 때, 그리고 초안을 고칠 때 이 숫자를 본다.
 * 발행 여부를 보지 않는다 — 고치는 중인 페이지야말로 재어야 한다.
 */
export function standard_measure(root, slug) {
  const distPath = join(root, DIST_DIR, slug, DIST_PAGE_NAME);
  if (!existsSync(distPath)) return null;
  const html = readFileSync(distPath, "utf8");
  const blocks = standard_read_blocks(html);

  const widgetAt = html.search(/<[^>]*\bdata-widget=/);
  const h1End = html.search(/<\/h1>/i);
  let leadChars = 0;
  if (widgetAt > 0 && h1End > 0 && widgetAt > h1End) {
    let lead = html.slice(h1End, widgetAt);
    for (const pattern of LEAD_STRIP_PATTERNS) lead = lead.replace(pattern, " ");
    leadChars = standard_count_prose(lead);
  }

  const sections = blocks
    .map((block, i) => {
      const to = i + 1 < blocks.length ? blocks[i + 1].at : html.length;
      return {
        role: block.role,
        title: block.title,
        chars: standard_count_prose(html.slice(block.end, to)),
      };
    })
    .filter((section) => !BLOCK_IGNORED.has(section.role));

  const figs = html.match(/<figure\b[^>]*>/gi) ?? [];
  return {
    slug,
    isTool: widgetAt >= 0,
    leadChars,
    sections,
    longest: sections.reduce((max, s) => Math.max(max, s.chars), 0),
    over: sections.filter((s) => s.chars > SECTION_CHARS_MAX).length,
    figures: figs.length - figs.filter((t) => /\bfig-lede\b/.test(t)).length,
    hasLede: figs.some((t) => /\bfig-lede\b/.test(t)),
  };
}

const REPORT_FLAG = "--report";
const isMain = process.argv[1] && process.argv[1].endsWith("check-standard.mjs");
if (isMain && process.argv.includes(REPORT_FLAG)) {
  const root = new URL("..", import.meta.url).pathname;
  const slugs = process.argv.slice(2).filter((a) => a !== REPORT_FLAG);
  const pool = slugs.length > 0 ? slugs : readdirSync(join(root, DIST_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, DIST_DIR, e.name, DIST_PAGE_NAME)))
    .map((e) => e.name);

  console.log("slug".padEnd(26), "리드".padStart(6), "최장".padStart(6), "초과".padStart(5), "도해".padStart(5));
  for (const slug of pool) {
    const m = standard_measure(root, slug);
    if (!m || !m.isTool) continue; // 도구 페이지만 잰다 — 규약은 도구 글의 법이다
    const flag = m.leadChars > LEAD_CHARS_MAX ? "⚠" : " ";
    console.log(
      slug.padEnd(26),
      `${m.leadChars}${flag}`.padStart(6),
      String(m.longest).padStart(6),
      String(m.over).padStart(5),
      `${m.figures}${m.hasLede ? "+L" : ""}`.padStart(5)
    );
  }
}
