// 기계 점검 — 사람(에이전트)이 판단하기 전에, 기계가 **빠짐없이** 표시할 수 있는 것을 표시한다.
// 표시(flag)는 판정이 아니다. 표시마다 검사자가 반드시 처분(OK/결함)을 적어야 하고,
// 처분은 장부에 남아 같은 글자에서 다시 묻지 않는다. 표시 key는 규칙·페이지·내용의 해시라서
// 내용이 바뀌면 다시 묻는다.
//
// 규칙은 7차까지의 결함 84건과 레드팀 3개 보고서에서 거꾸로 뽑았다.
//   node scripts/audit/lint.mjs <inventory.json> [runtime.json|-] [출력.json]
// 게이트는 lint_run(inv, null, ctx)로 **정적 규칙만** 다시 돌려 처분 여부를 대조한다.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli_is_main } from "./inventory.mjs";

// ── 상수 ───────────────────────────────────────────────────
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** 전칭·단정·부정. 참인 범위를 반드시 확인한다. [GT: Every page, never, nothing changes, no company] */
const QUANTIFIER_RE = /\b(all|every|each|always|never|none|no|not|neither|nor|no one|nobody|nothing|only|exactly|any|entire|whole|completely|guarantee[sd]?|proves?|impossible|must|cannot|can't|won't|certainly|everything|anywhere|nowhere|mainstream|most|almost|the same|both|same|either)\b/i;
/** 위치·대상 지시어. 가리키는 것이 그 방향에 실제로 있는지 본다. [GT: linked above, letter counts above] */
const REFERENCE_RE = /\b(above|below|earlier|later on|previous|next|following|linked|here|these|those|this (?:chart|table|figure|page|section|slider|button|tool|model|site|one|rule|game)|the (?:charts?|tables?|figures?|diagrams?|widget|sliders?|buttons?|captions?|strip|curves?|lines?|readouts?|banner|list|working|formula|marks?|axis|labels?)|see )\b/i;
/** 사이트·구현·운영자에 대한 자기 서술. 코드 근거가 있어야 한다. [GT: Google Fonts, URL 상태, no company] */
const SELF_CLAIM_RE = /\b(costs?|free|price|domain|hosting|available|works|live|this (?:site|page|tool|model)|we |our |I |I'm|I've|me\b|my\b|the page|the site|company|business|cookies?|local ?storage|stores?|stored|fonts?|address bar|address|URL|browser|server|sends?|collects?|track(?:s|ing)?|ads?\b|advert\w*|Google|AdSense|Cloudflare|analytics|log(?:s|ged)?\b|e-?mail|reply|replies|nothing leaves|self-hosted|pen name|hobby|free)\b/i;
/** 코드·테스트·시뮬레이션이 한다는 일. 그 코드/테스트의 단언문을 인용해야 한다. [GT-78, "plays the game"] */
const CODE_CLAIM_RE = /\b(tests?|checks?|checked|verif(?:y|ies|ied)|enumerat\w*|counts?|counted|simulat\w*|plays?|played|random(?:ly)?|seed(?:ed)?|draws?|drawn|shade[sd]?|rounds?|rounded|computes?|works? out|worked out|calculat\w*|generator|updates?|moves?|marks?|marked)\b/i;
/** 사람·역사·제3자. 출처가 있어야 한다. [E15] */
const THIRD_PARTY_RE = /\b(1[5-9]\d\d|20[0-2]\d)\b|\b[A-Z][a-z]+(?:'s)? (?:said|says|wrote|told|argued|claimed|believed)\b|\b(arguing|convinced|convinces|persuaded|settled|disputes?|letters?|readers?|people|most people|nobody|everyone|column|magazine|newspaper|book|paper|journal|professor|mathematician|reported|according to|account|credited|popularized|published|known as|famous|puzzle|problem|textbooks?|browsers?|vendors?|Google|Cloudflare|providers?|law|regulation)\b|\b[A-Z][a-z]+'s\b/;
/** 서지 흔적. */
const CITATION_RE = /\b(?:vol\.?|pp?\.\s*\d|\d+\(\d+\)|doi|isbn|journal|edition)\b|\bNo\.\s*\d|\b(?:University|[A-Z][a-z]+) Press\b|\bcolumn\b|\bissue\b/;
const NUMBER_TOKEN_RE = /(?<![\w.])[-−+]?\d[\d,]*(?:\.\d+)?(?![\w])/g;
const NEGATION_RE = /\b(not|no|never|none|nothing|without|doesn't|does not|don't|isn't|aren't|cannot|can't)\b/i;
/** 공백·구두점 흔한 실수. glue:true는 실행 목록이 있으면 L-GLUE가 대신한다. */
const TYPO_RULES = [
  { re: /\s[,.;:!?](?!\d)/, what: "구두점 앞 공백" },
  { re: /\d\s%/, what: "숫자와 % 사이 공백" },
  { re: /[a-z0-9%)][.!?][A-Z][a-z]/, what: "마침표 뒤 공백 없이 다음 문장(붙은 문장)" },
  { re: /\s{2,}/, what: "공백 두 칸" },
  { re: /([a-z])([A-Z])(?=[a-z])/, what: "소문자 바로 뒤 대문자(붙은 단어 의심)", glue: true },
  { re: /[a-z]\d/i, what: "글자 뒤에 숫자가 붙음(붙은 단어 의심)", glue: true },
  // **런타임이 있어도 끄지 않는다.** 위 규칙의 반대 방향이다. Astro가 `{식}`을 앞 글자와
  // 한 텍스트 노드로 합쳐 버리면 요소 경계가 없어 실행 검출이 통과시킨다 —
  // 2026-09-25에 `snap512/825`가 그렇게 화면에 나갔다. 낱말(글자 3자 이상) 바로 뒤에
  // 숫자가 붙은 자리만 본다: 수식의 `nA1`·`pA1`·`ac` 같은 기호는 걸리지 않는다.
  { re: /[A-Za-z]{3,}\d/, what: "낱말 바로 뒤에 숫자가 붙음(요소 경계가 없어 실행 검출이 놓치는 자리)" },
  // **런타임이 있어도 끈지 않는다.** 실행 스캔의 붙은글자 검출은 요소 경계만 본다.
  // 한 텍스트 노드 안에서 붙은 자리(Astro가 `{식}` 다음 줄머리 공백을 지워 생기는
  // `12,763applications` 같은 것)는 경계가 없어 그 검출을 통과한다 — 2026-09-24에
  // 리드 첫 문단에서 실제로 났다. 단위 접미사는 걸러 낸다.
  { re: /\d(?!(?:px|rem|em|pt|vh|vw|st|nd|rd|th|s|x|e\d|GHz|MHz|kHz|Hz|dB|mm|cm|km|kg|min|ms|L|pp|bit|byte|kB|MB)\b)[A-Za-z]{3,}/, what: "숫자 바로 뒤에 낱말이 붙음(요소 경계가 없어 실행 검출이 놓치는 자리)" },
  { re: /\(\s|\s\)/, what: "괄호 안쪽 공백" },
];
const NEAR_DUP_JACCARD = 0.6;
const NEAR_DUP_MIN_WORDS = 6;
/** 모순 후보: 같은 페이지에서 핵심어를 이만큼 공유하고 부정 여부가 다른 문장 쌍. */
const CONTRA_MIN_SHARED = 2;
const CONTRA_STOPWORDS = new Set(["the", "and", "that", "this", "with", "for", "you", "your", "are", "was", "not", "but", "its", "has", "have", "from", "one", "all", "can", "will", "does", "any", "only", "they", "them", "when", "what", "which", "into", "than", "then", "there", "their", "here", "how", "who", "may", "more", "most", "each", "same"]);
/** 사이트 규칙: 카테고리는 공개 도구가 이만큼 있어야 연다(tools.js 주석). */
const CATEGORY_MIN_PUBLISHED = 2;

function flag_key(rule, page, what) {
  return createHash("sha1").update(`${rule}|${page}|${what}`).digest("hex").slice(0, 12);
}

function unit_words(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9% ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !CONTRA_STOPWORDS.has(w)));
}

function jaccard(a, b) {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

/** 해시 전에 줄바꿈을 LF로 맞춘다(Windows CRLF 체크아웃과 Cloudflare 빌드가 같은 값을 내게). */
function file_hash_update(h, path) {
  h.update(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
}

/**
 * 위젯 출력에 영향을 주는 모든 소스의 해시. 장부의 위젯 판정이 이 해시에 묶인다.
 * 위젯 폴더(시험 포함 — 본문이 시험 내용을 인용한다), _shared, 전역 CSS(캔버스 색), 페이지 파일.
 */
export function widget_hash_source(root, slug) {
  const h = createHash("sha256");
  const add = (dir, filter) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isFile() && filter(name)) { h.update(name); file_hash_update(h, full); }
    }
  };
  add(join(root, "src/widgets", slug), (n) => n.endsWith(".js"));
  add(join(root, "src/widgets/_shared"), (n) => n.endsWith(".js") && n !== "dom-stub.js");
  add(join(root, "src/styles"), (n) => n.endsWith(".css"));
  return h.digest("hex").slice(0, 16);
}

/**
 * @param {object} inv  inventory.json
 * @param {object|null} runtime  runtime.json (없으면 정적 규칙만)
 * @param {object} ctx  { tools, categories, ogManifest, root, dist }
 */
export function lint_run(inv, runtime, ctx) {
  const flags = [];
  const seenKeys = new Set();
  /**
   * 표시 하나를 올린다.
   *
   * `what`은 **key에 들어간다** — 그래서 스캔마다 달라지는 값(상태 수, 예시)을 거기
   * 넣으면 같은 표시가 매번 새 key로 올라와 장부에서 닫히지 않는다. 그런 참고 정보는
   * `note`로 넘긴다: 검사자가 읽는 detail에는 붙지만 key에는 들어가지 않는다.
   */
  const add = (rule, classes, unit, page, what, note = "") => {
    const key = flag_key(rule, unit ? unit.id : page, what);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    flags.push({ key, rule, classes, page: unit?.page ?? page, unitId: unit?.id ?? null, text: unit?.text ?? "", detail: `${what}${note}` });
  };
  const allUnits = [...inv.common, ...inv.pages.flatMap((p) => p.units)];
  const published = ctx.tools.filter((t) => t.published);
  const unpublished = ctx.tools.filter((t) => !t.published);
  const pageSet = new Set(inv.pages.map((p) => p.page));
  const dist = ctx.dist ?? inv.dist;

  const unitRules = (u, p) => {
    const t = u.text;
    const skip = u.kind === "head" || u.kind === "layout" || u.kind === "figure-geom" || u.kind === "og-image";
    if (!skip) {
      const q = t.match(QUANTIFIER_RE);
      if (q) add("L-QUANT", ["E2", "E14"], u, u.page, `전칭/단정/부정어 "${q[0]}" — 참인 범위(모델 안? 모든 페이지? 모든 상태?)를 적을 것`);
      const ref = t.match(REFERENCE_RE);
      if (ref) {
        const w = ref[0].toLowerCase();
        let hint = "";
        if (p) {
          const widgetAt = p.landmarks.filter((l) => l.type === "widget").map((l) => l.at);
          const figureAt = p.landmarks.filter((l) => l.type === "figure").map((l) => l.at);
          if (/chart|widget|slider|button|readout|banner|curve|line|strip|table|mark|axis|label/.test(w) || /chart|table/.test(t.toLowerCase())) hint += ` 위젯 위치: ${widgetAt.map((a) => (a < u.order ? "이 문장보다 위" : "이 문장보다 아래")).join(", ") || "이 페이지에 없음"}`;
          if (/figure|diagram/.test(w)) hint += ` 도해 위치: ${figureAt.map((a) => (a < u.order ? "위" : "아래")).join(",") || "없음"}`;
        }
        add("L-REF", ["E3"], u, u.page, `지시어 "${ref[0]}" — 가리키는 대상이 그 방향·그 페이지에 실제로 있고 내용이 맞는지. JS가 꺼진 독자에게도 있는지.${hint}`);
      }
      if (SELF_CLAIM_RE.test(t)) add("L-SELF", ["E8"], u, u.page, "사이트·구현·운영자 자기 서술 — CODE:(파일:줄) 근거. 운영자 본인 사실은 ACCEPTED 후보(사람이 결정)");
      if (CODE_CLAIM_RE.test(t)) add("L-CODE", ["E12", "E8"], u, u.page, "코드·테스트·시뮬레이션이 하는 일 — 그 코드/테스트 단언문을 CODE:/TEST:로 인용(재계산으로 대신 못 함)");
      if (THIRD_PARTY_RE.test(t)) add("L-3P", ["E15", "E6"], u, u.page, "사람·역사·제3자 서술 — SRC:(출처 캐시) 원문과 문구 대조");
      if (CITATION_RE.test(t)) add("L-CITE", ["E6"], u, u.page, "서지 — 저자·제목·권(호)·쪽·날짜를 원문과 한 글자씩");
      const nums = (t.match(NUMBER_TOKEN_RE) ?? []).filter((s) => /\d/.test(s));
      if (nums.length && u.kind !== "jsonld" && u.kind !== "link") add("L-NUM", ["E4", "E5"], u, u.page, `숫자 ${nums.join(" · ")} — 숫자마다 CALC:/SRC:/SITE: 근거, 반올림(0.5 올림)·자릿수`);
      for (const rule of TYPO_RULES) {
        if (rule.glue && runtime) continue;
        if (rule.re.test(t) && u.kind !== "attr" && u.kind !== "jsonld") add("L-TYPO", ["E11"], u, u.page, rule.what);
      }
      for (const tool of unpublished) {
        const hits = [tool.name, `/${tool.slug}`, tool.figure?.value].filter((x) => x && t.includes(x));
        if (hits.length) add("L-UNPUB", ["E22", "E13"], u, u.page, `미공개 도구 "${tool.name}"의 이름·주소·숫자(${hits.join(", ")})가 공개 페이지에 나옴`);
      }
      if (["meta", "jsonld", "attr", "svg-text", "caption", "og-card", "link"].includes(u.kind)) add("L-SURFACE", ["E9"], u, u.page, `${u.kind} — 본문·위젯·다른 페이지와 같은 사실을 같은 말로 하는지`);
    }
    if (u.kind === "figure-geom") add("L-GEOM", ["E16", "E10"], u, u.page, "도해 도형의 크기·위치·색이 글자(숫자·범례)와 맞는지 — 스크린숏과 좌표로(VIS:/CALC:)");
    if (u.kind === "layout") add("L-LAYOUT", ["E3", "E19"], u, u.page, "페이지 짜임(절·위젯·도해·표·출처 순서)이 본문의 '위/아래/다음' 서술과 맞는지");
    if (u.kind === "head") add("L-HEAD", ["E20", "E9"], u, u.page, "머리 정보 — canonical=이 페이지 주소, og:url=canonical, robots가 noindex 아님, lang=en, 이미지 크기");
    if (u.kind === "og-card") add("L-OG", ["E9", "E7", "E4"], u, u.page, "공유 카드 글자 — 분류 이름·제목·숫자가 사이트와 같은지(PNG를 직접 연다)");
    if (u.kind === "link") add("L-LINKTXT", ["E20", "E6"], u, u.page, "링크 글과 대상이 맞는지(외부는 열어 본다)");
  };

  for (const u of inv.common) unitRules(u, null);
  for (const p of inv.pages) {
    for (const u of p.units) unitRules(u, p);
    const ids = new Set(p.ids ?? []);
    for (const link of p.links) {
      const href = link.href;
      if (/^(mailto|tel):/.test(href)) { add("L-EXTLINK", ["E20"], null, p.page, `연락 링크 ${href} ("${link.text}") — 주소가 사이트에 적힌 것과 같은지, 실제로 받는지`); continue; }
      if (href.startsWith("#")) { if (href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) add("L-LINK", ["E20", "E3"], null, p.page, `없는 앵커 ${href} ("${link.text}")`); continue; }
      if (/^https?:/.test(href) || href.startsWith("//")) { add("L-EXTLINK", ["E20", "E6"], null, p.page, `외부 링크 ${href} ("${link.text}") — 열어서 링크 글과 내용이 맞는지`); continue; }
      if (!href.startsWith("/")) { add("L-LINK", ["E20"], null, p.page, `상대 링크 ${href} ("${link.text}") — 절대 경로로`); continue; }
      const [pathPart, anchor] = href.split("#");
      const path = pathPart.split("?")[0];
      if (path.length > 1 && path.endsWith("/")) add("L-LINK", ["E20"], null, p.page, `끝 슬래시 링크 ${href} — trailingSlash:'never' 규칙 위반(리다이렉트/404)`);
      const clean = path.replace(/\/$/, "") || "/";
      const isAsset = /\.[a-z0-9]+$/i.test(clean);
      if (isAsset ? !existsSync(join(dist, clean)) : !pageSet.has(clean)) add("L-LINK", ["E20", "E13"], null, p.page, `깨진 내부 링크 ${href} ("${link.text}")`);
      else if (anchor && !isAsset) {
        const target = inv.pages.find((x) => x.page === clean);
        if (target && !(target.ids ?? []).includes(anchor)) add("L-LINK", ["E20"], null, p.page, `대상 페이지에 없는 앵커 ${href}`);
      }
    }
    // 같은 페이지 안의 모순 후보(E18): 핵심어를 공유하고 한쪽만 부정하는 자기 서술 쌍
    const selfUnits = p.units.filter((u) => (u.kind === "text" || u.kind === "meta") && SELF_CLAIM_RE.test(u.text)).map((u) => ({ u, w: unit_words(u.text), neg: NEGATION_RE.test(u.text) }));
    for (let i = 0; i < selfUnits.length; i++) for (let j = i + 1; j < selfUnits.length; j++) {
      const a = selfUnits[i], b = selfUnits[j];
      if (a.neg === b.neg) continue;
      let shared = 0; for (const w of a.w) if (b.w.has(w)) shared += 1;
      if (shared >= CONTRA_MIN_SHARED) add("L-CONTRA", ["E18"], a.u, p.page, `모순 후보: "${b.u.text.slice(0, 140)}" — 두 문장이 함께 참인지`);
    }
  }

  // 같은 사실을 두 곳에서 조금 다르게 말하는가 (고친 뒤 형제 문장이 남는 문제 포함) [GT-58]
  const pool = allUnits.filter((u) => ["text", "caption", "meta", "attr", "svg-text"].includes(u.kind)).map((u) => ({ u, w: unit_words(u.text) })).filter((x) => x.w.size >= NEAR_DUP_MIN_WORDS);
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].u.text === pool[j].u.text) continue;
      const s = jaccard(pool[i].w, pool[j].w);
      if (s >= NEAR_DUP_JACCARD) {
        add("L-SIBLING", ["E9", "E18"], pool[i].u, pool[i].u.page, `비슷한 문장(${s.toFixed(2)}): [${pool[j].u.page}] "${pool[j].u.text.slice(0, 160)}" — 두 문장이 서로 맞는지, 한쪽만 고쳐진 것은 아닌지`);
        add("L-SIBLING", ["E9", "E18"], pool[j].u, pool[j].u.page, `비슷한 문장(${s.toFixed(2)}): [${pool[i].u.page}] "${pool[i].u.text.slice(0, 160)}" — 두 문장이 서로 맞는지, 한쪽만 고쳐진 것은 아닌지`);
      }
    }
  }

  // 필수 구조 [GT-41 404 없음]
  for (const need of ["/404", "/about", "/contact", "/privacy"]) if (!pageSet.has(need)) add("L-STRUCT", ["E13"], null, need, `필수 페이지 ${need} 없음`);
  for (const cat of ctx.categories) {
    const n = published.filter((t) => t.category === cat.key).length;
    if (pageSet.has(`/${cat.key}`) && n < CATEGORY_MIN_PUBLISHED) add("L-STRUCT", ["E22", "E13"], null, `/${cat.key}`, `카테고리 /${cat.key}가 공개 도구 ${n}개로 열려 있음(규칙: ${CATEGORY_MIN_PUBLISHED}개 이상) — 소개글이 미공개 도구를 설명하는지`);
  }
  if (existsSync(join(dist, "og"))) {
    for (const t of unpublished) if (existsSync(join(dist, "og", `${t.slug}.png`))) add("L-UNPUB", ["E22"], null, "/og", `미공개 도구의 공유 카드 dist/og/${t.slug}.png가 배포됨`);
  }
  for (const tool of published) {
    const p = inv.pages.find((x) => x.page === `/${tool.slug}`);
    if (!p) { add("L-STRUCT", ["E13"], null, `/${tool.slug}`, "발행 도구 페이지 없음"); continue; }
    if (!p.landmarks.some((l) => l.type === "sources")) add("L-STRUCT", ["E13", "E6"], null, p.page, "출처 목록(class=sources) 없음");
    const cat = ctx.categories.find((c) => c.key === tool.category);
    const crumbs = p.units.filter((u) => u.kind === "jsonld").map((u) => u.text);
    if (cat && !crumbs.some((c) => c.endsWith(`= ${cat.name}`))) add("L-CONSIST", ["E9", "E7"], null, p.page, `JSON-LD 빵부스러기에 카테고리 "${cat.name}" 없음`);
    const og = ctx.ogManifest?.[tool.slug];
    const pngPath = join(ctx.root, "public/og", `${tool.slug}.png`);
    if (!existsSync(pngPath)) add("L-OG", ["E13"], null, p.page, `공유 카드 PNG 없음: public/og/${tool.slug}.png`);
    if (!og) add("L-OG", ["E9", "E7"], null, p.page, "공유 카드 기록(og-manifest) 없음 — build-og를 다시 돌리고, PNG를 직접 열어 글자를 읽을 것");
    else {
      if (cat && og.eyebrow !== cat.name) add("L-OG", ["E9", "E7"], null, p.page, `공유 카드 분류 "${og.eyebrow}" ≠ 사이트 "${cat.name}"`);
      if (og.headline !== tool.name) add("L-OG", ["E9"], null, p.page, `공유 카드 제목 "${og.headline}" ≠ "${tool.name}"`);
      if (existsSync(pngPath) && createHash("sha256").update(readFileSync(pngPath)).digest("hex") !== og.sha256) add("L-OG", ["E7"], null, p.page, "공유 카드 PNG가 기록과 다름(기록 뒤에 바뀜) — 다시 만들 것");
    }
    // 메타 설명의 숫자는 본문·위젯에 같은 토큰으로 있어야 한다
    const body = new Set(p.units.filter((u) => u.kind !== "meta").flatMap((u) => u.text.match(NUMBER_TOKEN_RE) ?? []));
    for (const m of p.units.filter((u) => u.kind === "meta")) for (const n of m.text.match(NUMBER_TOKEN_RE) ?? []) if (!body.has(n)) add("L-CONSIST", ["E9", "E4"], m, p.page, `메타의 숫자 ${n}이 본문에 같은 모양으로 없음 — 위젯 출력이나 계산으로 확인`);
    const wdir = join(ctx.root, "src/widgets", tool.slug);
    if (existsSync(wdir) && !readdirSync(wdir).some((n) => /oracle|shown/.test(n) && n.endsWith(".test.js"))) add("L-ORACLE", ["E4"], null, p.page, "화면에 보이는 숫자를 정수·분수로 따로 계산해 전 상태 대조하는 시험 파일(*oracle*/*shown*.test.js) 없음");
  }

  // 실행해야 보이는 것
  if (runtime) {
    for (const rp of runtime.pages) {
      for (const g of rp.glued) add("L-GLUE", ["E11", "E21"], null, rp.page, `${g.kind === "letters" ? "요소 경계에서 글자끼리 공백 없이 만남(복사·스크린리더에는 붙어 있음)" : "화면에서 붙어 보임"}: "…${g.left}|${g.right}…" (화면 간격 ${g.gap ?? "-"}px, ${g.viewport})`);
      for (const e of rp.consoleErrors) add("L-RUNTIME", ["E13"], null, rp.page, `콘솔 오류: ${e.slice(0, 200)}`);
      for (const w of rp.widgets ?? []) {
        // **표시 key에 상태 수·예시를 넣지 않는다.** key는 `sha1(rule|page|what)`이고,
        // 애니메이션이 있는 위젯은 스캔마다 문형별 상태 수가 몇씩 흔들린다(히어로가
        // 프레임을 계속 돌린다). 상태 수를 what에 넣으면 스캔을 다시 돌릴 때마다 key가
        // 새로 나서 **장부에서 영원히 닫히지 않는다** — 2026-09-25에 같은 문형이 세
        // 스캔에 걸쳐 세 번 새 key로 올라왔다. 판정 대상은 문형(찍히는 문장의 모양)이고,
        // 상태 수와 예시는 검사자가 보는 참고 정보라 detail 뒤에 붙이기만 한다.
        for (const t of w.templates) {
          add("L-WIDGET", ["E1", "E4", "E12"], null, rp.page, `위젯 ${w.name} 문형: "${t.template}"`,
            ` — ${t.states}상태, 예: ${t.examples.slice(0, 3).map((e) => `"${e.text.slice(0, 120)}"@${e.state}`).join(" ; ")}`);
        }
      }
      if (rp.colors?.length) {
        const byColor = new Map();
        for (const c of rp.colors) { if (!c.text) continue; const s = byColor.get(c.color) ?? new Set(); s.add(c.text.slice(0, 40)); byColor.set(c.color, s); }
        const strokes = (rp.widgets ?? []).flatMap((w) => w.strokes);
        add("L-COLOR", ["E10"], null, rp.page, `색-뜻 표 — 같은 색이 모든 도해·범례·위젯에서 같은 뜻인지: ${[...byColor].map(([c, s]) => `${c}: ${[...s].slice(0, 10).join(" / ")}`).join(" ‖ ")} ‖ 위젯 선: ${strokes.join(" ; ")}`);
      }
      for (const env of rp.environments ?? []) if (env.note) add("L-ENV", ["E19", "E21"], null, rp.page, `환경 ${env.name}: ${env.note}`);
    }
  } else if (!ctx.staticOnly) {
    add("L-RUNTIME", ["E10", "E11", "E4"], null, "*", "runtime.json 없음 — 붙은 글자·색·위젯 문형·환경을 못 봤다. runtime-scan을 돌릴 것(이 표시는 OK로 처분할 수 없다)");
  }
  return flags;
}

if (cli_is_main(import.meta.url)) {
  const inv = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8"));
  const runtimePath = process.argv[3] && process.argv[3] !== "-" ? resolve(process.argv[3]) : null;
  const runtime = runtimePath && existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf8")) : null;
  const root = resolve(process.env.AUDIT_ROOT ?? REPO_ROOT);
  const { TOOLS, CATEGORIES } = await import(pathToFileURL(join(root, "src/data/tools.js")).href);
  const manifestPath = join(root, "scripts/audit/og-manifest.json");
  const ogManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const flags = lint_run(inv, runtime, { tools: TOOLS, categories: CATEGORIES, ogManifest, root, dist: inv.dist });
  const out = resolve(process.argv[4] ?? "audit-lint.json");
  writeFileSync(out, JSON.stringify(flags, null, 1));
  const byRule = {};
  for (const f of flags) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  console.log(Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(" · "), `→ 합계 ${flags.length}`);
}
