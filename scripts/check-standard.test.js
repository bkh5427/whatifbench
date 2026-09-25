// 집필 규약 게이트의 테스트.
//
// 규약 §9는 오랫동안 이 검사들을 "게이트가 막는다"고 **적어만** 두었다.
// 그래서 여기서 증명하는 것은 두 가지다 — (1) 깨끗한 페이지는 통과한다,
// (2) 조각을 하나씩 망가뜨리면 **그 조각이** 잡힌다. 둘 중 하나만으로는
// "무조건 통과"나 "무조건 실패"를 구별할 수 없다.
//
// 시험 대상은 임시 디렉터리의 가짜 저장소다. 실제 저장소는 건드리지 않는다.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { standard_run, standard_measure, STANDARD_LIMITS } from "./check-standard.mjs";
import { fixture_format_article } from "./_fixtures.js";

const FIXTURE_BASE = join(tmpdir(), "whatifbench-standard-fixtures");
const SLUG = "clean-tool";
const NAME = "Clean Tool";

const madeRoots = [];
afterAll(() => {
  for (const root of madeRoots) rmSync(root, { recursive: true, force: true });
});

/** `<slug>/index.astro` + `dist/<slug>/index.html` + 선택적 `_fig/*.astro`. */
function standard_fixture(over = {}) {
  mkdirSync(FIXTURE_BASE, { recursive: true });
  const root = mkdtempSync(join(FIXTURE_BASE, "repo-"));
  madeRoots.push(root);

  const files = {
    [`src/pages/${SLUG}/index.astro`]:
      over.source ?? `---\nconst CRUMB = ${JSON.stringify(over.crumb ?? NAME)};\n---\n<p>x</p>\n`,
    [`dist/${SLUG}/index.html`]: over.html ?? fixture_format_article(over.article ?? {}),
    ...(over.files ?? {}),
  };
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, ...rel.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const TOOLS = { TOOLS: [{ slug: SLUG, name: NAME, published: true }] };

function standard_report(over) {
  return standard_run(standard_fixture(over), TOOLS)
    .map((v) => `${v.file} ${v.message}`)
    .join("\n");
}

describe("집필 규약 게이트", () => {
  it("규약을 지킨 페이지는 통과한다 (무조건 실패가 아님을 증명)", () => {
    expect(standard_report({})).toBe("");
  });

  it("발행 전 페이지는 검사하지 않는다 — 초안이 규약에 어긋나는 것은 정상이다", () => {
    const root = standard_fixture({ html: "<html><body></body></html>" });
    const drafts = { TOOLS: [{ slug: SLUG, name: NAME, published: false }] };
    expect(standard_run(root, drafts)).toEqual([]);
  });

  // ── A) 구조 ──────────────────────────────────────────────
  it("A1: H2에 data-block이 없으면 잡는다", () => {
    const html = fixture_format_article().replace('<h2 data-block="reversal">', "<h2>");
    expect(standard_report({ html })).toContain("data-block이 없다");
  });

  it("A2: 필수 블록이 빠지면 그 이름으로 잡는다", () => {
    const blocks = [
      ["reversal", "R"], ["howto", "H"], ["math", "M"],
      ["assumptions", "A"], ["limits", "L"], ["about", "About this page"],
    ];
    expect(standard_report({ article: { blocks } })).toContain('블록 "byhand"이 없다');
  });

  it("A3: 마무리 절(closing)은 없어도 된다 — 규약 §4의 유일한 선택 항목", () => {
    expect(standard_report({})).toBe("");
  });

  it("A4: 절 순서가 뒤집히면 잡는다", () => {
    const blocks = [
      ["reversal", "R"], ["math", "M"], ["howto", "H"], ["byhand", "B"],
      ["assumptions", "A"], ["limits", "L"], ["about", "About this page"],
    ];
    expect(standard_report({ article: { blocks } })).toContain("절 순서가 규약 §1과 다르다");
  });

  it("A5: About이 마지막이 아니면 잡는다", () => {
    const blocks = [
      ["reversal", "R"], ["howto", "H"], ["math", "M"], ["byhand", "B"],
      ["assumptions", "A"], ["about", "About this page"], ["limits", "L"],
    ];
    expect(standard_report({ article: { blocks } })).toContain("About(⑭)이 맨 끝이어야 한다");
  });

  it("A6: 위젯이 첫 H2보다 뒤면 잡는다 — 규약 §1은 위젯 다음이 반전 절이다", () => {
    const html = fixture_format_article()
      .replace('<div data-widget="clean-tool"></div>', "")
      .replace("</main>", '<div data-widget="clean-tool"></div></main>');
    expect(standard_report({ html })).toContain("위젯이 첫 H2보다");
  });

  it("A7: 덱이 없으면 잡는다", () => {
    const html = fixture_format_article().replace(/<p class="deck">[^<]*<\/p>/, "");
    expect(standard_report({ html })).toContain("덱(②)이 없다");
  });

  it("A8: 컴포넌트가 찍는 Read next는 절로 세지 않는다", () => {
    const html = fixture_format_article().replace(
      "</main>",
      '<h2 data-block="related">Read next</h2></main>'
    );
    expect(standard_report({ html })).toBe("");
  });

  // ── B) 분량 ──────────────────────────────────────────────
  it("B1: 절이 한도를 넘으면 글자 수와 함께 잡는다", () => {
    const long = "word ".repeat(400);
    const html = fixture_format_article().replace(
      '<h2 data-block="math">Why the ratio holds</h2><p>One short line of prose.</p>',
      `<h2 data-block="math">Why the ratio holds</h2><p>${long}</p>`
    );
    const report = standard_report({ html });
    expect(report).toContain('절 "math"');
    expect(report).toContain(`한도 ${STANDARD_LIMITS.SECTION_CHARS_MAX}자`);
  });

  it("B2: 리드가 한도를 넘으면 잡는다", () => {
    expect(standard_report({ article: { lead: "word ".repeat(200) } }))
      .toContain(`한도 ${STANDARD_LIMITS.LEAD_CHARS_MAX}자`);
  });

  it("B3: 덱은 리드로 세지 않는다 — 덱은 ②이고 리드는 ⑤다", () => {
    expect(standard_report({ article: { deck: "word ".repeat(200) } })).toBe("");
  });

  it("B4: 도해 캡션과 출처는 분량에 넣지 않는다 (규약 §8의 세는 법)", () => {
    const html = fixture_format_article().replace(
      "<li>A source.</li>",
      `<li>${"word ".repeat(400)}</li>`
    );
    expect(standard_report({ html })).toBe("");
  });

  it("B5: Read next 목록은 About 분량에 섞이지 않는다 (경계 회귀)", () => {
    // 실제로 있었던 결함: `related`를 목록에서 **걸러 버리자** About의 구간이
    // 문서 끝까지 늘어나 관련 도구 목록이 본문으로 세어졌다. 발행된 도구가
    // 늘어나자 글을 고치지도 않은 절이 한도를 넘었다.
    const html = fixture_format_article().replace(
      "</main>",
      `<h2 data-block="related">Read next</h2><ul><li>${"word ".repeat(400)}</li></ul></main>`
    );
    expect(standard_report({ html })).toBe("");
  });

  // ── C) 도해 ──────────────────────────────────────────────
  it("C1: 도해가 세 장보다 적으면 잡는다", () => {
    expect(standard_report({ article: { figures: 2 } }))
      .toContain(`최소 ${STANDARD_LIMITS.FIGURE_MIN}장`);
  });

  it("C2: 도입 삽화는 세 장에 넣지 않는다", () => {
    const html = fixture_format_article({ figures: 3 }).replace(
      '<figure class="fig">',
      '<figure class="fig fig-lede">'
    );
    expect(standard_report({ html })).toContain(`최소 ${STANDARD_LIMITS.FIGURE_MIN}장`);
  });

  it("C3: 출처 목록에 class가 없으면 잡는다 — 없으면 분량이 잘못 세어진다", () => {
    const html = fixture_format_article().replace('<ul class="sources">', "<ul>");
    expect(standard_report({ html })).toContain('class="sources"가 없다');
  });

  it("C4: viewBox 가로가 한도를 넘으면 잡는다", () => {
    const files = {
      [`src/pages/${SLUG}/_fig/Wide.astro`]: `---\nconst W = 600;\n---\n<svg viewBox="0 0 600 110"></svg>\n`,
    };
    expect(standard_report({ files })).toContain(
      `한도 ${STANDARD_LIMITS.FIGURE_VIEWBOX_WIDTH_MAX}`
    );
  });

  it("C5: SVG 글자가 14px보다 작으면 잡는다 — 모바일 실렌더는 ×0.786이다", () => {
    const files = {
      [`src/pages/${SLUG}/_fig/Small.astro`]: `---\nconst S = 11;\n---\n<svg viewBox="0 0 420 110"><text style="font-size: 11px">a</text></svg>\n`,
    };
    expect(standard_report({ files })).toContain(
      `최소 ${STANDARD_LIMITS.FIGURE_FONT_PX_MIN}px`
    );
  });

  it("C6: 도해가 프런트매터로 시작하지 않으면 잡는다 — C2PA 전송 사고", () => {
    const files = {
      [`src/pages/${SLUG}/_fig/Bare.astro`]: `<svg viewBox="0 0 420 110"></svg>\n`,
    };
    expect(standard_report({ files })).toContain("프런트매터");
  });

  it("C7: 규격을 지킨 도해는 통과한다", () => {
    const files = {
      [`src/pages/${SLUG}/_fig/Good.astro`]: `---\nconst W = 420;\n---\n<svg viewBox="0 0 420 110"><text style="font-size: 14px">a</text></svg>\n`,
    };
    expect(standard_report({ files })).toBe("");
  });

  it("C8: 도해 글자가 class로 크기를 받는데 그 class가 14px 미만이면 잡는다", () => {
    const files = {
      "src/styles/global.css": ".fig-tiny { font-size: 11px; }\n.fig-label { font-size: 15px; }\n",
      [`src/pages/${SLUG}/_fig/Class.astro`]:
        `---\nconst W = 420;\n---\n<svg viewBox="0 0 420 110"><text class="fig-tiny">a</text></svg>\n`,
    };
    expect(standard_report({ files })).toContain(`최소 ${STANDARD_LIMITS.FIGURE_FONT_PX_MIN}px`);
  });

  it("C9: 도해 글자에 크기를 정하는 것이 아무것도 없으면 잡는다", () => {
    const files = {
      "src/styles/global.css": ".fig-label { font-size: 15px; }\n",
      [`src/pages/${SLUG}/_fig/Bare2.astro`]:
        `---\nconst W = 420;\n---\n<svg viewBox="0 0 420 110"><text>a</text></svg>\n`,
    };
    expect(standard_report({ files })).toContain("크기를 정하는 것이 없다");
  });

  it("C10: class로 크기를 받고 그 class가 한도를 지키면 통과한다", () => {
    const files = {
      "src/styles/global.css": ".fig-label { font-size: 15px; }\n",
      [`src/pages/${SLUG}/_fig/Ok.astro`]:
        `---\nconst W = 420;\n---\n<svg viewBox="0 0 420 110"><text class="fig-label">a</text></svg>\n`,
    };
    expect(standard_report({ files })).toBe("");
  });

  it("C11: 위젯 앞에 도해가 없으면 잡는다 (S7)", () => {
    expect(standard_report({ article: { leadFig: null } })).toContain("위젯 앞에 도해가 없다");
  });

  it("C12: 위젯 앞 도해가 세로로 길면 잡는다 — 그 한 장이 위젯을 화면 밖으로 민다", () => {
    expect(standard_report({ article: { leadFigH: 400 } }))
      .toContain(`한도 ${STANDARD_LIMITS.FIGURE_LEAD_VIEWBOX_HEIGHT_MAX}`);
  });

  it("C13: viewBox 가로는 **산출물**에서 본다 — 소스가 템플릿 리터럴이면 못 읽는다", () => {
    // 실제로 있었던 사각지대: 규약 §5가 치수를 상수로 올리라고 해서
    // 소스에는 `viewBox={`0 0 ${W} ${H}`}`만 남고 리터럴 검사가 한 건도
    // 매칭되지 않았다. 산출물에는 계산된 값이 박혀 있다.
    const files = {
      [`src/pages/${SLUG}/_fig/Templated.astro`]:
        "---\nconst W = 600;\n---\n<svg viewBox={`0 0 ${W} 110`}></svg>\n",
    };
    expect(standard_report({ files, article: { figHeight: 120 } })).toBe("");
    expect(standard_report({ article: { leadFigW: 600 } }))
      .toContain(`한도 ${STANDARD_LIMITS.FIGURE_VIEWBOX_WIDTH_MAX}`);
  });

  // ── D) 문장 ──────────────────────────────────────────────
  it.each(["obviously", "in order to", "Monte Carlo", "the best way to"])(
    "D1: 금지어 %s를 잡는다",
    (word) => {
      expect(standard_report({ article: { lead: `This is ${word} a lead.` } }))
        .toContain("금지어");
    }
  );

  it("D2: 금지어가 태그·속성 안에만 있으면 잡지 않는다 — 읽는 글자만 본다", () => {
    const html = fixture_format_article().replace(
      "<main>",
      '<main><script>const label = "obviously";</script>'
    );
    expect(standard_report({ html })).toBe("");
  });

  it("D3: 퍼센트를 띄어 쓰면 잡는다", () => {
    expect(standard_report({ article: { lead: "The model puts it at 6.06 % here." } }))
      .toContain("퍼센트를 띄어 썼다");
  });

  // ── E) 이름 ──────────────────────────────────────────────
  it("E1: CRUMB가 tools.js의 name과 다르면 잡는다", () => {
    expect(standard_report({ crumb: "Clean tool" }))
      .toContain('tools.js의 name "Clean Tool"과 다르다');
  });

  it("E1b: CATEGORY가 tools.js와 다르면 잡는다 — 아홉 편 중 일곱이 그랬다", () => {
    const source = `---\nconst CRUMB = "${NAME}";\nconst CATEGORY = "odds";\n---\n<p>x</p>\n`;
    const root = standard_fixture({ source });
    const tools = { TOOLS: [{ slug: SLUG, name: NAME, category: "chance", published: true }] };
    expect(standard_run(root, tools).map((v) => v.message).join("\n"))
      .toContain('CATEGORY "odds"');
  });

  it("E2: CRUMB 상수가 아예 없으면 잡는다", () => {
    expect(standard_report({ source: "---\n---\n<p>x</p>\n" })).toContain("CRUMB 상수가 없다");
  });

  // ── 자(measure) ──────────────────────────────────────────
  it("M1: 실측은 발행 여부와 무관하게 잰다 — 고치는 중인 페이지야말로 재야 한다", () => {
    const root = standard_fixture({});
    const m = standard_measure(root, SLUG);
    expect(m.isTool).toBe(true);
    expect(m.figures).toBe(3);
    expect(m.sections.map((s) => s.role)).toContain("byhand");
    expect(m.leadChars).toBeGreaterThan(0);
  });
});
