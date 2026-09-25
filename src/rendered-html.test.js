// 빌드 산출물(`dist/**/index.html`)을 파싱해 검사한다.
//
// **왜 소스가 아니라 산출물인가.** `Base.astro`와 `RelatedTools.astro`는 .astro라
// vitest가 직접 import하지 못한다. 그래서 레이아웃·컴포넌트에 테스트가 0건이었고,
// 아래 다섯 가지를 손으로 망가뜨려도 `npm test`가 전부 통과했다:
//   ① `<main>`의 `tabindex="-1"` 제거   ② 스킵 링크 통째 삭제
//   ③ `crumbLabel ?? title` → `title` (구조화 데이터가 화면과 갈라진다)
//   ④ `RelatedTools`의 대체 문구 분기 반전 (거짓 문장 출고)
//   ⑤ 대체 문구를 미완성 표식이 든 문장으로 되돌리기
// 산출물을 읽으면 다섯 개가 전부 죽는다. 배포되는 것이 이 HTML이기도 하다.
//
// **`dist/`가 없으면 건너뛰지 않고 실패한다.** 근거 셋:
//   - 건너뛰면 위 다섯 뮤턴트가 CI에서 조용히 되살아난다. 침묵하는 테스트는
//     테스트가 없는 것과 같고, 그것이 지금 고치는 결함 그 자체다.
//   - 테스트 안에서 `astro build`를 부르면 `npm test`가 매번 풀빌드를 끌고 다닌다.
//     `check:full`(빌드 → 게이트)이 이미 그 일을 하고 푸시 훅이 그것을 돌린다.
//   - `npm run check`도 같은 전제를 이미 요구한다 — 저장소의 기존 관례다.
// 실패 문구가 `npm run build`를 먼저 돌리라고 직접 말한다.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST_DIR = join(SITE_ROOT, "dist");
/** `.gitignore`가 막는 로컬 전용 페이지. 게이트도 이것만 건너뛴다. */
const PREVIEW_PREFIX = "preview-";
/** 스킵 링크가 가리키는 자리. `Base.astro`의 `MAIN_ID`와 같아야 한다. */
const MAIN_ID = "main";
const MAIN_TABINDEX = "-1";

/** 산출물 페이지 하나. `path`는 dist 기준 상대경로, `html`은 원문. */
function fixture_read_built_pages() {
  if (!existsSync(DIST_DIR)) {
    throw new Error(
      "dist/가 없다. 이 테스트는 배포될 HTML을 검사한다 — 먼저 `npm run build`를 돌려라.",
    );
  }
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") pages.push(full);
    }
  };
  walk(DIST_DIR);
  const built = pages
    .map((full) => ({
      path: relative(DIST_DIR, full).split(sep).join("/"),
      html: readFileSync(full, "utf8"),
    }))
    .filter((page) => !page.path.startsWith(PREVIEW_PREFIX));
  if (built.length === 0) {
    throw new Error("dist/에 index.html이 없다. `npm run build`를 먼저 돌려라.");
  }
  return built;
}

/** `&amp;` 같은 것만 되돌린다. 산출물이 쓰는 엔티티가 이것뿐이다. */
function test_format_text(raw) {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function test_read_skip_link(html) {
  const match = html.match(/<a class="skip-link" href="([^"]+)"[^>]*>([^<]*)<\/a>/);
  return match ? { href: match[1], text: test_format_text(match[2]), index: match.index } : null;
}

function test_read_main_tag(html) {
  const match = html.match(/<main\b[^>]*>/);
  if (!match) return null;
  const tag = match[0];
  return {
    tag,
    index: match.index,
    id: (tag.match(/\bid="([^"]*)"/) ?? [])[1] ?? null,
    tabindex: (tag.match(/\btabindex="([^"]*)"/) ?? [])[1] ?? null,
  };
}

/** 문서 안에 그 id를 가진 요소가 실제로 있는가. */
function test_check_anchor_exists(html, hash) {
  const id = hash.replace(/^#/, "");
  return new RegExp(`\\bid="${id}"`).test(html);
}

/** 구조화 데이터의 브레드크럼 항목 이름들. 없으면 null. */
function test_read_jsonld_breadcrumb(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  const data = JSON.parse(match[1]);
  if (data["@type"] !== "BreadcrumbList") return null;
  return data.itemListElement.map((item) => ({ position: item.position, name: item.name }));
}

/** 화면 브레드크럼의 마지막 항목 — 링크가 아닌 꼬리 텍스트. */
function test_read_visible_crumb(html) {
  const nav = html.match(/<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/);
  if (!nav) return null;
  const tail = nav[1].slice(nav[1].lastIndexOf("</span>") + "</span>".length);
  return test_format_text(tail);
}

/** `RelatedTools`가 관련 도구 대신 내보낸 문단. 카드가 나왔으면 null. */
function test_read_fallback_sentence(html) {
  const section = html.match(/<section class="read-next">([\s\S]*?)<\/section>/);
  if (!section) return null;
  const paragraph = section[1].match(/<p>([\s\S]*?)<\/p>/);
  if (!paragraph) return null;
  return test_format_text(paragraph[1].replace(/<[^>]+>/g, ""));
}

const PAGES = fixture_read_built_pages();
const CRUMB_PAGES = PAGES.filter((page) => test_read_jsonld_breadcrumb(page.html) !== null);
const FALLBACK_PAGES = PAGES.filter((page) => test_read_fallback_sentence(page.html) !== null);

describe("산출물 — 스킵 링크 (WCAG 2.4.1 Bypass Blocks)", () => {
  it.each(PAGES.map((page) => page.path))("%s 에 스킵 링크가 있다", (path) => {
    const page = PAGES.find((p) => p.path === path);
    const skip = test_read_skip_link(page.html);
    expect(skip, "스킵 링크가 사라졌다 — 헤더 링크 5개를 건너뛸 길이 없다").not.toBeNull();
    expect(skip.text).toBe("Skip to content");
  });

  it.each(PAGES.map((page) => page.path))("%s 의 스킵 링크가 실재하는 id를 가리킨다", (path) => {
    const page = PAGES.find((p) => p.path === path);
    const skip = test_read_skip_link(page.html);
    expect(skip.href).toBe(`#${MAIN_ID}`);
    // href만 맞추면 대상이 없어도 통과한다. 그 자리에 요소가 있는지 본다.
    expect(test_check_anchor_exists(page.html, skip.href)).toBe(true);
  });

  it.each(PAGES.map((page) => page.path))("%s 에서 스킵 링크가 main보다 앞에 있다", (path) => {
    const page = PAGES.find((p) => p.path === path);
    // 뒤에 있으면 첫 Tab에서 잡히지 않아 아무 일도 하지 않는다.
    expect(test_read_skip_link(page.html).index).toBeLessThan(test_read_main_tag(page.html).index);
  });
});

describe("산출물 — main의 포커스 대상 계약", () => {
  it.each(PAGES.map((page) => page.path))("%s 의 main이 id와 tabindex를 갖는다", (path) => {
    const page = PAGES.find((p) => p.path === path);
    const main = test_read_main_tag(page.html);
    expect(main, "main 요소가 없다").not.toBeNull();
    expect(main.id).toBe(MAIN_ID);
    // tabindex가 없으면 일부 브라우저에서 스크롤만 하고 포커스는 헤더에 남는다 —
    // 다음 Tab이 네비게이션으로 되돌아간다. 화면으로는 멀쩡해 보인다.
    expect(main.tabindex, `${path}: main에 tabindex가 없다`).toBe(MAIN_TABINDEX);
  });
});

describe("산출물 — 브레드크럼 구조화 데이터가 화면과 같은 문자열이다", () => {
  it("브레드크럼을 붙인 페이지가 있다", () => {
    expect(CRUMB_PAGES.length).toBeGreaterThan(0);
  });

  it.each(CRUMB_PAGES.map((page) => page.path))("%s — position 3 == 화면 마지막 항목", (path) => {
    const page = CRUMB_PAGES.find((p) => p.path === path);
    const crumbs = test_read_jsonld_breadcrumb(page.html);
    const last = crumbs.find((item) => item.position === 3);
    expect(last, "position 3이 없다").toBeDefined();
    // Google 구조화 데이터 정책: 마크업은 화면에 보이는 것과 일치해야 한다.
    expect(last.name).toBe(test_read_visible_crumb(page.html));
  });

  // 골든 값. 실제 산출물에서 받아 적었다. `crumbLabel`이 `title`로 떨어지면
  // 여기가 긴 SEO 제목이 되어 죽는다 — 위의 동일성 검사만으로는 두 곳이 같이
  // 움직이는 변경을 못 잡는다.
  it("도구 페이지의 마지막 항목은 짧은 이름이지 SEO 제목이 아니다", () => {
    const page = PAGES.find((p) => p.path === "monty-hall-n-doors/index.html");
    expect(page, "monty-hall-n-doors가 빌드되지 않았다").toBeDefined();
    const crumbs = test_read_jsonld_breadcrumb(page.html);
    expect(crumbs.map((item) => item.name)).toEqual([
      "Home",
      "Chance",
      "Monty Hall with N doors",
    ]);
    expect(page.html).toContain(
      "<title>Monty Hall with N doors: does switching still win? — whatifbench</title>",
    );
  });
});

describe("산출물 — RelatedTools 대체 문구", () => {
  // 게이트가 잡는 목록과 같다. 게이트는 푸시에서만 돌고, 이 문구는
  // 컴포넌트에서 흘러들어 소스 grep으로는 안 잡힌다.
  const INCOMPLETE_MARKERS =
    /\b(TODO|TBD|FIXME|coming soon|under construction|being (built|written|prepared))\b/i;

  it("대체 문구를 내보내는 페이지가 있다", () => {
    expect(FALLBACK_PAGES.length).toBeGreaterThan(0);
  });

  it.each(FALLBACK_PAGES.map((page) => page.path))("%s 에 미완성 표식이 없다", (path) => {
    const page = FALLBACK_PAGES.find((p) => p.path === path);
    expect(test_read_fallback_sentence(page.html)).not.toMatch(INCOMPLETE_MARKERS);
  });

  // 2026-09-10: 미발행 도구의 페이지를 산출물에서 찾던 단언이 여기 있었다.
  // 미발행 페이지가 더 이상 빌드되지 않으므로(초안은 `../01_drafts/`로 나갔다)
  // 산출물로는 그 분기를 만들 수 없다 — 만들려면 저장소가 망가져야 한다.
  // 세 분기는 `prose.test.js`의 `prose_format_fallback_lead`가 지킨다.

  // 2026-09-24: 여기 있던 두 단언은 "chance에 발행된 형제가 없다"는 세계를 못박고
  // 있었다. simpsons-paradox와 one-line-or-many가 발행되면서 세 도구 모두 형제가
  // 생겨, 대체 문구 분기를 **산출물로는 만들 수 없다** — 만들려면 저장소가
  // 망가져야 한다. 세 분기와 목록 구분자는 `prose.test.js`의
  // `prose_format_fallback_lead`가 지킨다. 여기서는 형제 카드가 실제로 실렸는지만 본다.
  it("발행된 도구는 형제 카드를 싣는다 (대체 문구가 아니다)", () => {
    const page = PAGES.find((p) => p.path === "monty-hall-n-doors/index.html");
    // 대체 문구 대신 형제 카드가 실렸다 — 첫 문단이 형제의 blurb다.
    expect(test_read_fallback_sentence(page.html)).not.toContain("Nothing else sits in");
    expect(page.html).toContain('href="/simpsons-paradox"');
    expect(page.html).toContain('href="/one-line-or-many"');
  });
});
