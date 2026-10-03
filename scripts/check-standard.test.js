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
import { standard_run, standard_warn, standard_measure, standard_read_pending, STANDARD_LIMITS, STYLE_REVISED_ALL } from "./check-standard.mjs";
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

/** 문체 규칙까지 막는 상태(모든 편이 전환 목록에 든 것)로 돌린다. 전환 자체는 G1이 시험한다. */
function standard_report(over) {
  return standard_run(standard_fixture(over), TOOLS, { revised: STYLE_REVISED_ALL })
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

  // ── D') 문체 — 규약 §6 절대규칙 0·1·2 ─────────────────────
  it.each(["Here is how to read it.", "All of it rests on four rules.", "That makes it easier to trust."])(
    "D4: 절 끝 연결 틀 문구 %s를 잡는다",
    (line) => {
      expect(standard_report({ article: { lead: `A finished page. ${line}` } })).toContain("틀 문구");
    }
  );

  it("D5: 캡션이 In this model로 시작하면 잡는다 — 굵은 제목 뒤여도 잡는다", () => {
    const plain = fixture_format_article().replace("The rule, drawn once.", "In this model, the rule.");
    expect(standard_report({ html: plain })).toContain("캡션이");
    const titled = fixture_format_article().replace("The rule, drawn once.", "<b>The rule.</b> In this model the host picks.");
    expect(standard_report({ html: titled })).toContain("캡션이");
  });

  it("D6: 6단어 이하 문장이 셋 잇따르면 잡는다 — 둘까지는 통과", () => {
    expect(standard_report({ article: { lead: "Three doors. One car. Two goats. Pick one and see what the host does next." } }))
      .toContain("잇따른다");
    expect(standard_report({ article: { lead: "Three doors. One car. Then the host opens an empty door and offers a swap." } }))
      .toBe("");
  });

  it("D7: 한 문단에 the model puts가 두 번이면 잡는다", () => {
    expect(standard_report({ article: { lead: "The model puts men at 62.1% in the first department. For the second it puts them at 5.9% instead." } }))
      .toContain("the model puts");
  });

  it("D8: 발행 편 둘이 같은 절 제목을 쓰면 잡는다 — About this page는 예외", () => {
    const root = standard_fixture({});
    const other = "other-tool";
    const dist = join(root, "dist", other);
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), fixture_format_article());
    mkdirSync(join(root, "src/pages", other), { recursive: true });
    writeFileSync(join(root, "src/pages", other, "index.astro"), `---\nconst CRUMB = "Other Tool";\n---\n`);
    const tools = { TOOLS: [...TOOLS.TOOLS, { slug: other, name: "Other Tool", published: true }] };
    const report = standard_run(root, tools, { revised: STYLE_REVISED_ALL }).map((v) => v.message).join("\n");
    expect(report).toContain("절 제목");
    expect(report).not.toContain('"About this page"');
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

  // ── G) 전환 목록 — 개정 편만 문체 규칙으로 막는다 ─────────
  it("G1: 전환 목록 밖의 편은 문체 위반을 막지 않고 경고([전환 대기])로 낸다", () => {
    const root = standard_fixture({ article: { lead: "A finished page. Here is how to read it." } });
    expect(standard_run(root, TOOLS).map((v) => v.message).join("\n")).not.toContain("틀 문구");
    expect(standard_run(root, TOOLS, { revised: new Set([SLUG]) }).map((v) => v.message).join("\n")).toContain("틀 문구");
    const warned = standard_warn(root, TOOLS).map((w) => w.message).join("\n");
    expect(warned).toContain("[전환 대기] 틀 문구");
  });

  it("G3: [전환 대기]는 발행됐고 목록에 없는 편만 센다 — 미발행·목록 안 편은 빠진다", () => {
    const tools = { ...TOOLS, TOOLS: [
      { slug: "a-tool", published: true }, { slug: "b-tool", published: true }, { slug: "c-tool", published: false },
    ] };
    expect(standard_read_pending(tools, { revised: new Set() })).toEqual(["a-tool", "b-tool"]);
    expect(standard_read_pending(tools, { revised: new Set(["a-tool"]) })).toEqual(["b-tool"]);
    expect(standard_read_pending(tools, { revised: new Set(["a-tool", "b-tool"]) })).toEqual([]);
    expect(standard_read_pending(tools, { revised: STYLE_REVISED_ALL })).toEqual([]);
  });

  it("G2: rest on … rules 변형을 잡는다 — wifi 432행이 includes 비교를 빠져나간 경로(f)", () => {
    expect(standard_report({ article: { lead: "A finished page. Every figure the model produces rests on these five rules." } }))
      .toContain("rest on … rules");
    expect(standard_report({ article: { lead: "A finished page. The model keeps five things fixed." } })).toBe("");
  });

  // ── W) 경고 — 막지 않고 사람에게 보인다 ───────────────────
  const WARN_CLEAN_SOURCE = '<li>A source, <a href="https://example.org/a">example.org</a>.</li>';
  /** 깨끗한 출처 목록으로 바꾼 페이지에서 경고 메시지만 모은다. */
  function warn_report(edit = (html) => html, over = {}) {
    const html = edit(fixture_format_article(over.article ?? {}).replace("<li>A source.</li>", WARN_CLEAN_SOURCE));
    const root = standard_fixture({ html, files: over.files });
    return standard_warn(root, TOOLS, { revised: STYLE_REVISED_ALL }).map((w) => `[${w.rule}] ${w.message}`).join("\n");
  }
  const section_add = (html, extra) => html.replace('<h2 data-block="limits">', `${extra}<h2 data-block="limits">`);

  it("W0: 규약을 지킨 페이지는 경고가 없다", () => {
    expect(warn_report()).toBe("");
  });

  it("Wa: 같은 4낱말 줄이 다른 편에 두 번 넘게 나오면 경고 — 두 번까지는 통과", () => {
    const line = "<p>The red counter wins twice over the evening.</p>";
    const page = (n) => fixture_format_article().replace("<li>A source.</li>", WARN_CLEAN_SOURCE)
      .replace('<h2 data-block="about">', `${line.repeat(n)}<h2 data-block="about">`);
    for (const [others, expected] of [[3, true], [2, false]]) {
      const root = standard_fixture({ html: page(1) });
      const second = "other-tool";
      mkdirSync(join(root, "dist", second), { recursive: true });
      writeFileSync(join(root, "dist", second, "index.html"), page(others));
      const tools = { TOOLS: [...TOOLS.TOOLS, { slug: second, name: "Other Tool", published: true }] };
      const warned = standard_warn(root, tools, { revised: STYLE_REVISED_ALL }).filter((w) => w.rule === "ngram" && w.message.includes("red counter"));
      expect(warned.length > 0).toBe(expected);
    }
  });

  it("Wb: 절이 두 박자 격언(짧은 마침표 문장 둘)으로 끝나면 경고, 경구형 두 문장 H2도 경고", () => {
    expect(warn_report((h) => section_add(h, "<p>The long line held for every setting the sliders allow. The simulation agreed. It did not explain.</p>")))
      .toContain("[aphorism]");
    expect(warn_report((h) => h.replace("Where the model stops", "Doors do not help. Opening does.")))
      .toContain("두 문장 경구형");
    expect(warn_report((h) => section_add(h, "<p>The simulation agreed with the formula at every setting it ran.</p>")))
      .not.toContain("[aphorism]");
  });

  it("Wc: 굵은 머리말·Label. 문단이 절당 셋이면 경고 — 둘까지는 통과", () => {
    const leads = (n) => Array.from({ length: n }, (_, i) => `<p><strong>Rule ${i}.</strong> The host opens a door at random.</p>`).join("");
    expect(warn_report((h) => section_add(h, leads(3)))).toContain("[bold-lead]");
    expect(warn_report((h) => section_add(h, leads(2)))).not.toContain("[bold-lead]");
    const plain = ["The slab.", "The walls.", "The spread."].map((l) => `<p>${l} Each one is counted on its own line here.</p>`).join("");
    expect(warn_report((h) => section_add(h, plain))).toContain("[bold-lead]");
  });

  it("Wd: H2가 A, B and C 나열형이면 경고", () => {
    expect(warn_report((h) => h.replace("Reading the chart", "The bars, the strip and the banner"))).toContain("[heading-list]");
    expect(warn_report((h) => h.replace("Reading the chart", "Reading the bars and the strip"))).not.toContain("[heading-list]");
  });

  it("We1: UI 라벨이 “ ” 없이 나오면 경고 — 곧은 따옴표도 경고, “ ”는 통과", () => {
    const files = { "src/widgets/clean-tool/widget.js": "const LABEL = 'Number of doors';\nconst X = `The model puts ${n}`;\n" };
    const say = (text) => warn_report((h) => section_add(h, `<p>${text}</p>`), { files });
    expect(say("Move the Number of doors slider to the right.")).toContain('UI 라벨 "Number of doors"');
    expect(say('Move the "Number of doors" slider to the right.')).toContain("곧은");
    expect(say("Move the “Number of doors” slider to the right.")).not.toContain("UI 라벨");
    expect(say("The model puts the edge at two games in three.")).not.toContain("UI 라벨");
  });

  it("We2: 출처 항목에 링크·No DOI가 없거나 1인칭이 있으면 경고", () => {
    const edit = (li) => (h) => h.replace(WARN_CLEAN_SOURCE, li);
    expect(warn_report(edit("<li>Smith, J., 1990, A Book, Press.</li>"))).toContain("[source]");
    expect(warn_report(edit("<li>Smith, J., 1990, A Book, Press. No DOI; official text linked.</li>"))).not.toContain("[source]");
    expect(warn_report(edit('<li><a href="https://x.org">Smith</a>, which I could not open.</li>'))).toContain("1인칭");
  });

  it("We3: 천 단위 쉼표를 경고 — 공백 표기는 통과", () => {
    expect(warn_report((h) => section_add(h, "<p>The stack is 439,805 km tall at that fold.</p>"))).toContain("[number]");
    expect(warn_report((h) => section_add(h, "<p>The stack is 439 805 km tall at that fold.</p>"))).not.toContain("[number]");
  });

  it("We4: 사이트 자칭(workbench·toys·this widget)을 경고", () => {
    expect(warn_report((h) => section_add(h, "<p>This workbench draws each curve once.</p>"))).toContain("[self-name]");
    expect(warn_report((h) => section_add(h, "<p>Toys for thinking with, each drawn once.</p>"))).toContain("[self-name]");
    expect(warn_report((h) => section_add(h, "<p>The tool draws each curve once.</p>"))).not.toContain("[self-name]");
  });

  it("Wg: 캡션이 옆 문단과 6낱말 넘게 겹치면 경고", () => {
    const fig = (cap) => `<p>The pooled bar is a weighted average of the two groups here.</p><figure class="fig"><svg viewBox="0 0 420 120"></svg><figcaption>${cap}</figcaption></figure>`;
    expect(warn_report((h) => section_add(h, fig("Each pooled bar is a weighted average of the two groups.")))).toContain("[caption-overlap]");
    expect(warn_report((h) => section_add(h, fig("The weight is the strip below the bars.")))).not.toContain("[caption-overlap]");
  });

  it("Wh: About 절 밖의 1인칭 헤지를 경고 — About 절 안은 통과", () => {
    expect(warn_report((h) => section_add(h, "<p>I could not open the 1676 original.</p>"))).toContain("[hedge]");
    expect(warn_report((h) => h.replace('<ul class="sources">', "<p>I could not open the 1676 original.</p><ul class=\"sources\">")))
      .not.toContain("[hedge]");
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
