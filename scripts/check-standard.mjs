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
// D) 문장   — 금지어, 퍼센트 띄어쓰기, 문체(틀 문구·캡션 시작어·단문 연타·model puts 밀도·편간 같은 절 제목)
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

/**
 * 규약 §6 절대규칙 2의 금지 목록 — 절 끝 연결 문장·예고·틀 문구.
 * 2026-09-27 문체 점검에서 6편 모두에 같은 자리에 같은 문장이 나와 대량생산 지문이 됐다.
 * 소문자로 비교한다.
 */
const STYLE_BANNED_PHRASES = [
  "here is how to read", "here is the surprise", "all of it rests on",
  "easier to trust", "drop any one", "stop meaning what they say",
  "comes next", "the whole point", "the whole idea", "load-bearing",
  "the gap is enormous", "two routes, one answer", "settling is not explaining",
];
/** 캡션을 이 말로 시작하지 않는다(§6 절대규칙 1) — 20개 중 18개가 그랬다. */
const STYLE_CAPTION_BANNED_START = /^in this model\b/i;
/** 이 이하 단어 수의 문장이 연속으로 이만큼 오면 스타카토다(§6 절대규칙 0). */
const STYLE_SHORT_SENTENCE_WORDS = 6;
const STYLE_SHORT_RUN_MAX = 2;
/** 문단 하나에 "the model puts"를 이 횟수보다 많이 쓰지 않는다(§6 절대규칙 1). */
const STYLE_MODEL_PUTS_PER_PARAGRAPH_MAX = 1;
const STYLE_MODEL_PUTS_PATTERN = /\b(?:the model|it) puts\b/gi;
/** 편마다 새로 쓰는 절 제목의 예외 — 웹 관례 이름(§7). */
const STYLE_SHARED_HEADINGS = new Set(["about this page"]);

/**
 * 금지 목록 중 낱말 사이가 벌어지는 변형(§6 절대규칙 2 "rest on … rules").
 * `STYLE_BANNED_PHRASES`는 `includes`로 비교해 말줄임 자리를 못 메운다 — 그래서
 * wifi의 "Every figure the model produces rests on these five rules."가 그대로 지나갔다
 * (2026-10-01 확인: 규약 문서에만 있고 코드 목록에는 이 항목이 아예 없었다).
 */
const STYLE_BANNED_PATTERNS = [
  { label: "rest on … rules", pattern: /\brests? on (?:these|those|its|the)\b[^.!?]{0,80}?\brules\b/i },
];

/**
 * 2차 문체 개정(2026-10-01 작업지시서 D3)의 **전환 목록**.
 * 09-27 이후의 문체 규칙(틀 문구·캡션 시작어·단문 연타·model puts·편간 같은 절 제목·
 * 위 변형 금지)은 이 목록에 든 편에서만 **막는다**. 목록 밖의 발행 편은 같은 검사를
 * **경고**로만 받는다 — 라이브 판이 아직 옛 문장이라, 규칙을 한꺼번에 막으면 편 하나씩
 * 내보내는 PR마다 나머지 다섯 편 때문에 게이트가 깨진다.
 * 편 PR이 그 편의 slug를 여기에 더한다. 여섯 편이 다 들어오면 목록을 지우고 전부 막는다.
 * **목록 삭제가 PR-6 완료 정의에 들어간다**(운영자 결정 2026-10-03). 목록이 남아 있는 동안
 * check:full은 `[전환 대기] N편`을 찍는다 — 0편이 되어도 목록을 지울 때까지 찍는다.
 */
const STYLE_REVISED_SLUGS = new Set([
  "shower-vs-bath", // 2026-10-03 새 발행 — 처음부터 막는 규칙으로
]);
/** 시험용: 모든 편을 개정 편으로 본다. */
export const STYLE_REVISED_ALL = "all";

/**
 * 전환 대기 편 = 발행됐는데 전환 목록에 아직 없는 편. check-publish가 개수와 slug를 찍는다.
 * 목록을 지우는 날(PR-6) 이 함수도 같이 지운다.
 */
export function standard_read_pending(tools, { revised = STYLE_REVISED_SLUGS } = {}) {
  if (revised === STYLE_REVISED_ALL) return [];
  return tools.TOOLS.filter((tool) => tool.published && !revised.has(tool.slug)).map((tool) => tool.slug);
}

// ── 경고(사람 판정) — 2026-10-01 작업지시서 PR-0 ─────────────
/** (a) 사이트 전체 n-gram. 이 길이의 낱말 줄이 다른 편에 이 횟수보다 많이 나오면 경고. */
const WARN_NGRAM_WORDS = 4;
const WARN_NGRAM_OTHER_MAX = 2;
/** 낱말이 전부 이 목록이면 틀 문구가 아니라 영어의 뼈다. n-gram에서 뺀다. */
const WARN_NGRAM_STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "is", "are",
  "it", "its", "that", "this", "as", "with", "from", "be", "one", "two", "each", "what",
]);
/** n-gram 경고를 이 줄 수까지만 찍는다(나머지는 개수만). */
const WARN_NGRAM_REPORT_MAX = 40;
/** (b) 격언 결구 — 절의 마지막 두 문장이 둘 다 이 낱말 수 이하. */
const WARN_APHORISM_WORDS_MAX = 8;
/** 절 끝의 이동 단추("Back to the sliders ↑"). 문장이 아니다. */
const WARN_NAV_PARAGRAPH = /^Back to the sliders\b/;
/** (c) 굵은 머리말 문단 — 절당 이 수보다 많으면 경고. "Label. 문장"의 Label 최대 낱말 수. */
const WARN_BOLD_LEAD_PER_SECTION_MAX = 2;
const WARN_LABEL_LEAD_WORDS_MAX = 4;
/** (g) 캡션과 옆 문단이 이 낱말 수만큼 잇따라 겹치면 경고. */
const WARN_CAPTION_OVERLAP_WORDS = 6;
/** (h) About 절 밖의 1인칭 헤지. */
const WARN_HEDGE_PATTERNS = [/\bI could not\b/i, /\breported rather than verified\b/i];
/** (e) 규약 4종. 숫자: 쉼표 천 단위. 자칭: 사이트를 tool 말고 다른 말로 부른 자리. */
const WARN_COMMA_THOUSANDS = /\b\d{1,3}(?:,\d{3})+\b/g;
const WARN_SELF_NAME = /\b(?:(?:this|these|our|my|the site's)\s+(?:workbench(?:es)?|toys?|instruments?|widgets?)|workbench(?:es)?|toys? for)\b/gi;
const WARN_SOURCE_LINK_OK = /<a\b|No DOI|No stable link/i;
const WARN_SOURCE_FIRST_PERSON = /(?:^|[\s(])(?:I|I'm|I've|my|me)(?=[\s,.;:)])/;
/** (e) UI 라벨 — 위젯 소스의 문자열 리터럴에서 뽑는 라벨 사전의 모양. */
const WARN_LABEL_WORDS_MAX = 6;
const WARN_LABEL_CHARS_MIN = 3;
const WARN_LABEL_SHAPE = /^[A-Z][A-Za-z0-9 ,()’'×/–-]*$/;
const WIDGETS_DIR = "src/widgets";
const WIDGET_FILE = "widget.js";
/** 허브 페이지 — n-gram·자칭 경고의 말뭉치에 넣는다(도구 페이지 규칙은 안 건다). */
const HUB_ROUTES = ["index.html", "about/index.html"];

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

/** 문단(<p>)의 읽는 글자 목록. 정의 목록·목록 항목은 뺀다 — 그것들은 원래 짧다. */
function style_read_paragraphs(html) {
  let body = html;
  for (const pattern of PROSE_STRIP_PATTERNS) body = body.replace(pattern, " ");
  return [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => standard_strip_tags(m[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 문장 나누기. 마침표·물음표·느낌표 뒤 공백 + 대문자·숫자·따옴표에서 끊는다. */
function style_split_sentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/).map((s) => s.trim()).filter(Boolean);
}

// ── D2) 문체 — 규약 §6 절대규칙 0·1·2 ───────────────────────
function standard_check_style(route, html) {
  const violations = [];
  const say = (message) => violations.push({ file: `${DIST_DIR}/${route}`, message });

  let body = html;
  for (const pattern of PROSE_STRIP_PATTERNS) body = body.replace(pattern, " ");
  const lower = standard_strip_tags(body).replace(/\s+/g, " ").toLowerCase();
  const captions = [...html.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi)]
    .map((m) => standard_strip_tags(m[1]).replace(/\s+/g, " ").trim());
  const captionLower = captions.join(" ").toLowerCase();

  for (const phrase of STYLE_BANNED_PHRASES) {
    if (lower.includes(phrase) || captionLower.includes(phrase)) {
      say(`틀 문구 "${phrase}" (규약 §6 절대규칙 2) — 절은 마지막 사실로 끝낸다`);
    }
  }
  for (const { label, pattern } of STYLE_BANNED_PATTERNS) {
    const hit = pattern.exec(lower) ?? pattern.exec(captionLower);
    if (hit) say(`틀 문구 "${label}" 변형 (규약 §6 절대규칙 2) — …${hit[0]}…`);
  }
  for (const caption of captions) {
    // 굵은 제목 한 줄("<b>Why …</b> …") 뒤에서 시작해도 같은 틀이다.
    const text = caption.replace(/^[^.]{1,60}\.\s+/, "");
    if (STYLE_CAPTION_BANNED_START.test(caption) || STYLE_CAPTION_BANNED_START.test(text)) {
      say(`캡션이 "In this model"로 시작한다 (규약 §6 절대규칙 1) — …${caption.slice(0, 60)}…`);
    }
  }
  for (const paragraph of style_read_paragraphs(html)) {
    const sentences = style_split_sentences(paragraph);
    let run = 0;
    for (const sentence of sentences) {
      run = sentence.split(/\s+/).length <= STYLE_SHORT_SENTENCE_WORDS ? run + 1 : 0;
      if (run > STYLE_SHORT_RUN_MAX) {
        say(`${STYLE_SHORT_SENTENCE_WORDS}단어 이하 문장이 ${run}개 잇따른다 (규약 §6 절대규칙 0) — …${paragraph.slice(0, 80)}…`);
        break;
      }
    }
    const puts = paragraph.match(STYLE_MODEL_PUTS_PATTERN)?.length ?? 0;
    if (puts > STYLE_MODEL_PUTS_PER_PARAGRAPH_MAX) {
      say(`한 문단에 "the model puts"가 ${puts}회 (규약 §6 절대규칙 1: 문단당 ${STYLE_MODEL_PUTS_PER_PARAGRAPH_MAX}회) — …${paragraph.slice(0, 80)}…`);
    }
  }
  return violations;
}

/** 발행 편끼리 같은 절 제목(§7: 편마다 새로 쓴다). About this page만 예외. */
function standard_check_shared_headings(pages) {
  const violations = [];
  const seen = new Map();
  for (const { route, blocks } of pages) {
    for (const block of blocks) {
      const key = String(block.title ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      // 컴포넌트가 찍는 Read next 같은 역할은 글쓴이가 쓴 제목이 아니다.
      if (!key || STYLE_SHARED_HEADINGS.has(key) || BLOCK_IGNORED.has(block.role)) continue;
      if (seen.has(key) && seen.get(key) !== route) {
        violations.push({ file: `${DIST_DIR}/${route}`, message: `절 제목 "${block.title}"이 ${seen.get(key)}와 같다 (규약 §7 — 편마다 새로 쓴다)` });
      } else seen.set(key, route);
    }
  }
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
export function standard_run(root, tools, { revised = STYLE_REVISED_SLUGS } = {}) {
  const violations = [];
  const isRevised = (slug) => revised === STYLE_REVISED_ALL || revised.has(slug);
  const fontSizes = standard_read_figure_font_sizes(root);
  const pages = [];
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
    // 09-27 이후 문체 규칙은 전환 목록의 편만 막는다(나머지는 standard_warn이 경고).
    if (isRevised(slug)) violations.push(...standard_check_style(route, html));
    violations.push(...standard_check_crumb(root, slug, tool));
    if (isRevised(slug)) pages.push({ route, blocks });
  }
  violations.push(...standard_check_shared_headings(pages));
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
  STYLE_BANNED_PHRASES,
};

// ── F) 경고 — 사람이 판정한다(게이트를 막지 않는다) ────────────
// 2026-10-01 작업지시서 PR-0. 편을 나란히 놓으면 보이는 틀(같은 낱말 줄·격언 결구·
// 굵은 머리말 문단·"A, B and C" 제목)과 사이트 공통 규약 4종(UI 라벨·출처·숫자·자칭)은
// 기계가 **후보**만 찾을 수 있다. 판정은 사람이 한다 — 그래서 막지 않고 찍는다.

/** `<main>` 안에서 독자가 읽는 본문만. 반복 부품(바이라인·카드·Read next)과 그림 속 글자는 뺀다. */
function warn_read_main(html) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  return main
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<article\b[^>]*\bclass="[^"]*\b(?:tool-card|feature)\b[\s\S]*?<\/article>/gi, " ")
    .replace(/<div\b[^>]*\bclass="[^"]*\bbyline\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<h2\b[^>]*data-block="related"[\s\S]*$/i, " ");
}

/** 본문 HTML을 절(H2) 단위로 나눈다. 첫 덩어리는 리드(role "lead"). */
function warn_split_sections(main) {
  const sections = [];
  const scanner = /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi;
  let last = 0;
  let current = { role: "lead", title: "", start: 0 };
  let found;
  while ((found = scanner.exec(main)) !== null) {
    sections.push({ ...current, html: main.slice(last, found.index) });
    current = {
      role: /\bdata-block="([^"]+)"/.exec(found[1])?.[1] ?? null,
      title: standard_strip_tags(found[2]),
    };
    last = scanner.lastIndex;
  }
  sections.push({ ...current, html: main.slice(last) });
  return sections;
}

/** 덩어리 안 `<p>`의 읽는 글자(출처 목록 제외). */
function warn_read_paragraphs(html) {
  const body = html.replace(/<ul\b[^>]*\bclass="[^"]*\bsources\b[\s\S]*?<\/ul>/gi, " ");
  return [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({
    raw: m[1],
    text: standard_strip_tags(m[1]),
  })).filter((p) => p.text);
}

/** 낱말 목록. 소문자, 따옴표·구두점 제거. */
function warn_read_words(text) {
  return text.toLowerCase().replace(/[“”"‘’']/g, "").match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) ?? [];
}

/** 위젯 소스의 문자열 리터럴에서 UI 라벨 후보를 뽑는다. 화면 글자는 위젯이 그리므로 dist에 없다. */
function warn_read_labels(root, slug) {
  const path = join(root, WIDGETS_DIR, slug, WIDGET_FILE);
  if (!existsSync(path)) return [];
  const source = readFileSync(path, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  const labels = new Set();
  for (const m of source.matchAll(/'([^'\n\\]*)'|"([^"\n\\]*)"|`([^`\\]*)`/g)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    // " — " 앞 조각이 제목이고 뒤는 값 설명이다. 자리표시자(${…})가 든 조각은 문장 틀이지 라벨이 아니다
    // ("The model puts ${…}"를 라벨로 잡으면 본문의 귀속 문장이 전부 걸린다).
    for (const piece of literal.split(/\s—\s/)) {
      if (piece.includes("${")) continue;
      const label = piece.trim().replace(/[.:]$/, "");
      const words = label.split(/\s+/).length;
      if (label.length < WARN_LABEL_CHARS_MIN || words > WARN_LABEL_WORDS_MAX) continue;
      if (!WARN_LABEL_SHAPE.test(label) || /\bpx\b|\bsans\b/i.test(label)) continue;
      labels.add(label);
    }
  }
  return [...labels];
}

/** (e) UI 라벨이 “ ” 없이 본문에 나오는 자리. 한 낱말 라벨은 문장 첫머리면 넘긴다. */
function warn_check_labels(file, paragraphs, labels) {
  const out = [];
  const seen = new Set();
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scanner = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g");
    for (const { text } of paragraphs) {
      for (const m of text.matchAll(scanner)) {
        const at = m.index + m[1].length;
        const before = text.slice(Math.max(0, at - 1), at);
        const after = text.slice(at + label.length, at + label.length + 2);
        if (before === "“" && /^[.,]?”/.test(after)) continue;
        const single = !/\s/.test(label);
        if (single && /(^|[.!?:]\s+)$/.test(text.slice(Math.max(0, at - 3), at))) continue;
        const key = `${label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const quote = before === '"' || before === "'" || before === "‘" ? "곧은·작은따옴표" : "따옴표 없음";
        out.push({ file, rule: "label", message: `UI 라벨 "${label}"이 ${quote}로 나온다 — “ ”로 감싼다 (규약 §6 사이트 공통 규약) — …${text.slice(Math.max(0, at - 30), at + label.length + 30)}…` });
      }
    }
  }
  return out;
}

/** 한 도구 페이지의 경고 (b)(c)(d)(e)(g)(h). */
function warn_check_page(root, slug, route, html, revisedCheck) {
  const file = `${DIST_DIR}/${route}`;
  const out = [];
  const say = (rule, message) => out.push({ file, rule, message });
  const main = warn_read_main(html);
  const sections = warn_split_sections(main);

  for (const section of sections) {
    // (d) H2가 "A, B and C" 3항 나열형
    if (section.title && /,[^,]*\band\b/.test(section.title)) {
      say("heading-list", `H2 "${section.title}"이 "A, B and C" 나열형이다 (규약 §7)`);
    }
    const paragraphs = warn_read_paragraphs(section.html).filter((p) => !WARN_NAV_PARAGRAPH.test(p.text));
    // (b') 경구형 두 문장 제목("X. Y.") — 규약 §7: 사이트에 한두 번만
    if (section.title && style_split_sentences(section.title).length >= 2) {
      say("aphorism", `H2 "${section.title}"이 두 문장 경구형이다 (규약 §7 — 사이트에 한두 번만)`);
    }
    // (b) 격언 결구 — 절의 마지막 두 문장이 둘 다 짧은 마침표 문장
    const lastParagraph = paragraphs[paragraphs.length - 1];
    if (lastParagraph && section.role !== "about") {
      const sentences = style_split_sentences(lastParagraph.text);
      const tail = sentences.slice(-2);
      if (tail.length === 2 && tail.every((s) => s.endsWith(".") && s.split(/\s+/).length <= WARN_APHORISM_WORDS_MAX)) {
        say("aphorism", `절 "${section.title || "리드"}"이 두 박자 격언으로 끝난다 — …${tail.join(" ")} (규약 §6 절대규칙 2)`);
      }
    }
    // (c) 굵은 머리말 문단
    const leads = paragraphs.filter(({ raw, text }) => {
      if (/^\s*<(?:strong|b)\b/i.test(raw)) return true;
      const first = style_split_sentences(text)[0] ?? "";
      return first !== text && first.endsWith(".") && first.split(/\s+/).length <= WARN_LABEL_LEAD_WORDS_MAX;
    });
    if (leads.length > WARN_BOLD_LEAD_PER_SECTION_MAX) {
      say("bold-lead", `절 "${section.title || "리드"}"에 굵은 머리말·"Label." 문단이 ${leads.length}개 — 절당 ${WARN_BOLD_LEAD_PER_SECTION_MAX}개까지 (${leads.map((l) => `"${style_split_sentences(l.text)[0]}"`).join(", ")})`);
    }
    // (h) About 절 밖의 1인칭 헤지
    if (section.role !== "about") {
      for (const { text } of paragraphs) {
        const hedge = WARN_HEDGE_PATTERNS.find((p) => p.test(text));
        if (hedge) say("hedge", `About 절 밖의 헤지 "${hedge.source.replace(/\\b/g, "")}" — About 페이지 "What I could not check"로 옮긴다 — …${text.slice(0, 80)}…`);
      }
    }
  }

  // (g) 캡션이 바로 앞·뒤 문단과 낱말 줄로 겹침
  for (const m of main.matchAll(/(<p\b[^>]*>[\s\S]*?<\/p>)?\s*<figure\b[\s\S]*?<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>\s*(<p\b[^>]*>[\s\S]*?<\/p>)?/gi)) {
    const caption = warn_read_words(standard_strip_tags(m[2]));
    const grams = new Set();
    for (let i = 0; i + WARN_CAPTION_OVERLAP_WORDS <= caption.length; i += 1) grams.add(caption.slice(i, i + WARN_CAPTION_OVERLAP_WORDS).join(" "));
    for (const neighbour of [m[1], m[3]].filter(Boolean)) {
      const words = warn_read_words(standard_strip_tags(neighbour));
      for (let i = 0; i + WARN_CAPTION_OVERLAP_WORDS <= words.length; i += 1) {
        const gram = words.slice(i, i + WARN_CAPTION_OVERLAP_WORDS).join(" ");
        if (grams.has(gram)) {
          say("caption-overlap", `캡션이 옆 문단과 ${WARN_CAPTION_OVERLAP_WORDS}낱말 넘게 겹친다 — "${gram}" (규약 §6: 캡션은 옆 본문에 없는 정보만)`);
          break;
        }
      }
    }
  }

  const prose = warn_read_paragraphs(main);
  // (e) 숫자 — 쉼표 천 단위
  for (const { text } of prose) {
    for (const n of text.matchAll(WARN_COMMA_THOUSANDS)) {
      say("number", `천 단위를 쉼표로 썼다 "${n[0]}" — 공백으로(1 259.3, 101 325) (규약 §6 사이트 공통 규약)`);
    }
  }
  // (e) 출처 — 링크 또는 "No DOI"·"No stable link", 1인칭 금지
  const sources = /<ul\b[^>]*\bclass="[^"]*\bsources\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(main)?.[1] ?? "";
  for (const li of sources.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = standard_strip_tags(li[1]);
    if (!WARN_SOURCE_LINK_OK.test(li[1])) say("source", `출처 항목에 링크도 "No DOI"·"No stable link"도 없다 — …${text.slice(0, 70)}…`);
    if (WARN_SOURCE_FIRST_PERSON.test(text)) say("source", `출처 항목에 1인칭 문장 — 검증 메모는 About으로 — …${text.slice(0, 70)}…`);
  }
  // (e) UI 라벨
  out.push(...warn_check_labels(file, prose.concat(
    [...main.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi)].map((c) => ({ raw: c[1], text: standard_strip_tags(c[1]) }))
  ), warn_read_labels(root, slug)));
  // 전환 목록 밖의 편: 막는 문체 규칙을 경고로
  if (revisedCheck) {
    for (const v of standard_check_style(route, html)) out.push({ ...v, rule: "style-pending", message: `[전환 대기] ${v.message}` });
  }
  return out;
}

/** (e) 자칭 — 허브·도구 페이지 모두. */
function warn_check_self_name(file, html) {
  const out = [];
  for (const { text } of warn_read_paragraphs(warn_read_main(html))) {
    for (const m of text.matchAll(WARN_SELF_NAME)) {
      out.push({ file, rule: "self-name", message: `사이트 자칭 "${m[0]}" — "tool"로 통일 ("widget"은 화면 부품만) — …${text.slice(Math.max(0, m.index - 30), m.index + 40)}…` });
    }
  }
  return out;
}

/** (a) 사이트 전체 n-gram. 한 편의 낱말 줄이 **다른** 편에 WARN_NGRAM_OTHER_MAX회 넘게 나오면. */
function warn_check_ngrams(pages) {
  const counts = new Map(); // gram → Map(route → count)
  for (const { route, words } of pages) {
    for (let i = 0; i + WARN_NGRAM_WORDS <= words.length; i += 1) {
      const slice = words.slice(i, i + WARN_NGRAM_WORDS);
      if (slice.every((w) => WARN_NGRAM_STOPWORDS.has(w) || /^\d/.test(w))) continue;
      const gram = slice.join(" ");
      const byRoute = counts.get(gram) ?? new Map();
      byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
      counts.set(gram, byRoute);
    }
  }
  const hits = [];
  for (const [gram, byRoute] of counts) {
    if (byRoute.size < 2) continue;
    const total = [...byRoute.values()].reduce((a, b) => a + b, 0);
    if ([...byRoute.values()].some((c) => total - c > WARN_NGRAM_OTHER_MAX)) hits.push({ gram, byRoute, total });
  }
  hits.sort((a, b) => b.byRoute.size - a.byRoute.size || b.total - a.total);
  const out = hits.slice(0, WARN_NGRAM_REPORT_MAX).map(({ gram, byRoute, total }) => ({
    file: DIST_DIR,
    rule: "ngram",
    message: `"${gram}" ${total}회 · ${[...byRoute.keys()].map((r) => r.replace(/\/?index\.html$/, "") || "/").join(", ")} (편 사이 같은 낱말 줄)`,
  }));
  if (hits.length > WARN_NGRAM_REPORT_MAX) out.push({ file: DIST_DIR, rule: "ngram", message: `… 외 ${hits.length - WARN_NGRAM_REPORT_MAX}줄` });
  return out;
}

/**
 * 경고 목록. 게이트(`standard_run`)와 달리 **막지 않는다** — check-publish가 찍기만 한다.
 * 발행 편 + 허브(홈·About·카테고리)를 본다.
 */
export function standard_warn(root, tools, { revised = STYLE_REVISED_SLUGS } = {}) {
  const warnings = [];
  const isRevised = (slug) => revised === STYLE_REVISED_ALL || revised.has(slug);
  const corpus = [];
  const labelsAll = [];
  for (const tool of tools.TOOLS) {
    if (!tool.published) continue;
    const route = `${tool.slug}/${DIST_PAGE_NAME}`;
    const distPath = join(root, DIST_DIR, tool.slug, DIST_PAGE_NAME);
    if (!existsSync(distPath)) continue;
    const html = readFileSync(distPath, "utf8");
    warnings.push(...warn_check_page(root, tool.slug, route, html, !isRevised(tool.slug)));
    warnings.push(...warn_check_self_name(`${DIST_DIR}/${route}`, html));
    labelsAll.push(...warn_read_labels(root, tool.slug));
    corpus.push({ route, html });
  }
  const hubRoutes = [...HUB_ROUTES, ...(tools.CATEGORIES ?? []).map((c) => `${String(c.href ?? "").replace(/^\//, "")}/${DIST_PAGE_NAME}`)];
  for (const route of hubRoutes) {
    const path = join(root, DIST_DIR, route);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, "utf8");
    warnings.push(...warn_check_self_name(`${DIST_DIR}/${route}`, html));
    corpus.push({ route, html });
  }
  // n-gram 말뭉치: 출처·UI 라벨을 지운 본문 낱말.
  const labelPattern = labelsAll.length
    ? new RegExp(labelsAll.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|"), "g")
    : null;
  const pages = corpus.map(({ route, html }) => {
    const text = warn_read_paragraphs(warn_read_main(html)).map((p) => p.text).join(" ");
    return { route, words: warn_read_words(labelPattern ? text.replace(labelPattern, " ") : text) };
  });
  warnings.push(...warn_check_ngrams(pages));
  return warnings;
}

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
