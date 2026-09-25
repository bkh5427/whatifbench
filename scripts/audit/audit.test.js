// 사실 검사 도구의 시험. 레드팀(2026-09-21)이 재현한 구멍마다 뮤턴트를 하나씩 둔다.
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { units_extract, text_split_sentences } from "./html-units.mjs";
import { lint_run, widget_hash_source } from "./lint.mjs";
import { verdicts_validate, ledger_find_todo, evidence_resolve, CLASS_COUNT, FLAG_EVIDENCE } from "./ledger.mjs";

const made = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function temp_root(files) {
  const root = mkdtempSync(join(tmpdir(), "audit-"));
  made.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}
const PAGE = (body) => `<!doctype html><html lang="en"><head><title>T</title><meta name="description" content="D 3 doors"></head><body><main>${body}</main></body></html>`;
const inv_from = (pages) => ({ dist: "/nonexistent", common: [], pages: pages.map(([page, html]) => { const r = units_extract(page, html); return { page, units: r.units.filter((u) => u.page === page), links: r.links, figures: r.figures, landmarks: r.landmarks, ids: r.ids }; }) });
const CHECKS_OK = "o".repeat(CLASS_COUNT);

describe("문장 나누기", () => {
  it("약어는 낱말 전체가 같을 때만 — opened./swap./first.에서 자른다", () => {
    expect(text_split_sentences("The host opened. The swap follows.")).toEqual(["The host opened.", "The swap follows."]);
    expect(text_split_sentences("You swap. Then first. Next.")).toHaveLength(3);
  });
  it("p. 17, e.g., 소수점, 머리글자는 자르지 않는다", () => {
    expect(text_split_sentences("See p. 17 of the book.")).toHaveLength(1);
    expect(text_split_sentences("Use e.g. Three doors.")).toHaveLength(1);
    expect(text_split_sentences("It is 0.667 exactly.")).toHaveLength(1);
    expect(text_split_sentences("By J. R. Smith today.")).toHaveLength(1);
  });
});

describe("단위 id", () => {
  it("앞 문장이 바뀌면 뒤 문장 id도 바뀐다(문맥 의존)", () => {
    const a = units_extract("/p", PAGE("<p>Stay wins one in three. It never changes.</p>")).units.find((u) => u.text === "It never changes.");
    const b = units_extract("/p", PAGE("<p>Stay wins one in two. It never changes.</p>")).units.find((u) => u.text === "It never changes.");
    expect(a.id).not.toBe(b.id);
  });
  it("title과 og:title은 같은 글자여도 다른 id", () => {
    const u = units_extract("/p", `<html><head><title>X</title><meta property="og:title" content="X"></head><body></body></html>`).units.filter((x) => x.text === "X");
    expect(new Set(u.map((x) => x.id)).size).toBe(2);
  });
  it("숨김 상태가 바뀌면 id가 바뀐다", () => {
    const shown = units_extract("/p", PAGE("<p>Caveat <span>in this model</span> only.</p>")).units.map((u) => u.id);
    const hidden = units_extract("/p", PAGE('<p>Caveat <span hidden>in this model</span> only.</p>')).units.map((u) => u.id);
    expect(shown).not.toEqual(hidden);
  });
  it("도해 막대 길이만 바뀌어도 도형 단위 id가 바뀐다", () => {
    const f = (w) => units_extract("/p", PAGE(`<figure><svg viewBox="0 0 420 100"><rect x="0" y="0" width="${w}" height="10"/><text>87.5%</text></svg></figure>`)).units.find((u) => u.kind === "figure-geom").id;
    expect(f(171.5)).not.toBe(f(60));
  });
  it("링크 주소만 바뀌어도 링크 단위 id가 바뀐다", () => {
    const f = (href) => units_extract("/p", PAGE(`<p><a href="${href}">Selvin 1975</a></p>`)).units.find((u) => u.kind === "link").id;
    expect(f("https://doi.org/10.1/a")).not.toBe(f("https://doi.org/10.1/b"));
  });
  it("분수는 (분자)/(분모)로 펼친다 — N − 1/N과 (N − 1)/N이 다르게 나온다", () => {
    const t = units_extract("/p", PAGE('<div class="math-eq"><span class="frac"><span class="frac-num">N − 1</span><span class="frac-den">N</span></span></div>')).units.map((u) => u.text).join(" ");
    expect(t).toContain("(N − 1)/(N)");
  });
});

describe("기계 표시", () => {
  const ctx = { tools: [], categories: [], ogManifest: null, root: "/nonexistent", dist: "/nonexistent", staticOnly: true };
  it("페이지 표시의 key는 내용마다 다르다(한 번 처분으로 규칙 전체가 지워지지 않게)", () => {
    const inv = inv_from([["/p", PAGE('<p><a href="https://a.example/x">A</a> and <a href="https://b.example/y">B</a></p>')]]);
    const ext = lint_run(inv, null, ctx).filter((f) => f.rule === "L-EXTLINK");
    expect(ext).toHaveLength(2);
    expect(new Set(ext.map((f) => f.key)).size).toBe(2);
  });
  it("없는 앵커와 끝 슬래시 링크를 잡는다", () => {
    const inv = inv_from([["/p", PAGE('<p id="here"><a href="#nowhere">x</a> <a href="#here">y</a> <a href="/p/">z</a></p>')]]);
    const what = lint_run(inv, null, ctx).filter((f) => f.rule === "L-LINK").map((f) => f.detail).join("\n");
    expect(what).toContain("#nowhere");
    expect(what).not.toContain("#here\"");
    expect(what).toContain("끝 슬래시");
  });
  it("'There is no company behind it.'에 전칭·자기 서술 표시가 붙는다", () => {
    const inv = inv_from([["/p", PAGE("<p>There is no company behind it.</p>")]]);
    const rules = lint_run(inv, null, ctx).filter((f) => f.unitId).map((f) => f.rule);
    expect(rules).toContain("L-QUANT");
    expect(rules).toContain("L-SELF");
  });
});

describe("판정 파일 완결성", () => {
  const root = temp_root({ "src/a.js": "const x = 1;\nconst y = 2;\n", "src/a.test.js": "expect(p).toEqual(2);\n", "audit/sources/tierney.md": "url: x\nverified-by: B4b\n\"10,000 letters\"\n" });
  const inv = inv_from([["/p", PAGE("<p>Three doors, 2 opened.</p><p>Hello there friend.</p>")]]);
  const flags = lint_run(inv, null, { tools: [], categories: [], ogManifest: null, root, dist: root, staticOnly: true });
  const unit = (text) => inv.pages[0].units.find((u) => u.text === text);
  const base = () => inv.pages[0].units.map((u) => ({ id: u.id, page: u.page, kind: u.kind, text: u.text, verdict: "OK", checks: CHECKS_OK, evidence: "DEF: heading/meta text with no factual claim checked" }));
  const run = (units, extra = {}) => verdicts_validate({ units, flags: flags.filter((f) => !f.unitId).map((f) => ({ key: f.key, rule: f.rule, verdict: "OK", note: "DEF: checked this flag carefully" })), ...extra }, inv, flags, { root });

  it("숫자 표시 단위는 EDIT:만으로 통과 못 하고, 숫자마다 근거에 나와야 한다", () => {
    const u = base();
    const i = u.findIndex((x) => x.id === unit("Three doors, 2 opened.").id);
    u[i].evidence = "EDIT: no factual claim here at all";
    expect(run(u).join("\n")).toMatch(/L-NUM 표시 단위의 근거/);
    u[i].evidence = "CALC: 3 doors → 3 fixed by slider";
    expect(run(u).join("\n")).toMatch(/숫자 2가 근거에 안 나옴/);
  });
  it("CODE:는 실재하는 파일:줄이어야 한다", () => {
    const r = evidence_resolve("CODE: src/nope.js:3 does it", root, new Set());
    expect(r.problems.join()).toContain("파일 없음");
    expect(evidence_resolve("CODE: src/a.js:99 x", root, new Set()).problems.join()).toContain("줄 없음");
    expect(evidence_resolve("CODE: src/a.js:2 const y", root, new Set()).problems).toEqual([]);
  });
  it("TEST:·SRC:는 인용문이 파일 안에 그대로 있어야 하고, SRC는 두 번째 검사자 확인이 있어야 한다", () => {
    expect(evidence_resolve('TEST: src/a.test.js "expect(p).toEqual(3)"', root, new Set()).problems.join()).toContain("단언문");
    expect(evidence_resolve('TEST: src/a.test.js "expect(p).toEqual(2)"', root, new Set()).problems).toEqual([]);
    expect(evidence_resolve('SRC: tierney "10,000 letters"', root, new Set()).problems).toEqual([]);
    expect(evidence_resolve('SRC: tierney "20,000 letters"', root, new Set()).problems.join()).toContain("인용문");
  });
  it("검사자는 ACCEPTED를 못 쓰고, UNVERIFIED는 시도 기록이 있어야 한다", () => {
    const u = base();
    u[0].verdict = "ACCEPTED";
    u[1].verdict = "UNVERIFIED"; u[1].evidence = "could not fetch";
    const p = run(u).join("\n");
    expect(p).toContain("ACCEPTED");
    expect(p).toContain("tried:");
  });
  it("판정이 빠진 단위, 두 번 나온 단위를 잡는다", () => {
    const u = base();
    const p = run([...u.slice(1), u[2]]).join("\n");
    expect(p).toContain("판정 없음");
    expect(p).toContain("두 번");
  });
});

describe("장부 무효화", () => {
  it("근거 파일이 바뀌면 그 판정은 다시 검사 대상이 된다", () => {
    const root = temp_root({ "src/a.js": "x\n" });
    const inv = inv_from([["/p", PAGE("<p>Hi.</p>")]]);
    const u = inv.pages[0].units;
    const ledger = { units: Object.fromEntries(u.map((x) => [x.id, { verdict: "OK", deps: { "src/a.js": "0000000000000000" } }])), flags: {} };
    expect(ledger_find_todo(ledger, inv, root)).toHaveLength(u.length);
  });
  it("위젯 해시는 줄바꿈(CRLF/LF)에 흔들리지 않는다", () => {
    const lf = temp_root({ "src/widgets/w/model.js": "a\nb\n" });
    const crlf = temp_root({ "src/widgets/w/model.js": "a\r\nb\r\n" });
    expect(widget_hash_source(lf, "w")).toBe(widget_hash_source(crlf, "w"));
  });
});

// 2026-09-24: L-3P가 제3자 주장 없는 자기 서술까지 표시해 통과 경로가 없었다.
describe("L-3P 통과 근거", () => {
  it("SRC:와 DEF: 둘 다 받는다 — 둘 중 하나로 처분할 수 있다", () => {
    expect(FLAG_EVIDENCE["L-3P"]).toContain("SRC:");
    expect(FLAG_EVIDENCE["L-3P"]).toContain("DEF:");
  });

  it("서지(L-CITE)는 여전히 SRC:만 받는다 — 기록 없이 통과시킬 수 없다", () => {
    expect(FLAG_EVIDENCE["L-CITE"]).toEqual(["SRC:"]);
  });
});

// 2026-09-25: 애니메이션이 있는 위젯은 스캔마다 문형별 상태 수가 흔들린다. 그 수가
// 표시 key에 들어가 있어 같은 문형이 스캔마다 새 key로 올라왔고 장부에서 닫히지 않았다.
describe("L-WIDGET 표시 key의 안정성", () => {
  function fixture_build_runtime(states) {
    return {
      pages: [
        {
          page: "/w",
          glued: [],
          consoleErrors: [],
          colors: [],
          widgets: [
            {
              name: "w",
              templates: [{ template: "{#} waiting", states, examples: [{ text: "3 waiting", state: "a=1" }] }],
            },
          ],
        },
      ],
    };
  }

  const CTX = { tools: [], categories: [], ogManifest: null, root: "/nonexistent", dist: "/nonexistent", staticOnly: true };

  it("상태 수가 달라도 같은 문형이면 key가 같다", () => {
    const inv = { dist: "dist", pages: [{ page: "/w", units: [], links: [], ids: [], figures: [], landmarks: [], headings: [] }], common: [] };
    const a = lint_run(inv, fixture_build_runtime(17), CTX).filter((f) => f.rule === "L-WIDGET");
    const b = lint_run(inv, fixture_build_runtime(540), CTX).filter((f) => f.rule === "L-WIDGET");
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(a[0].key).toBe(b[0].key);
    // 상태 수는 사라지지 않는다 — 검사자가 읽는 detail에는 남는다.
    expect(a[0].detail).toContain("17상태");
    expect(b[0].detail).toContain("540상태");
  });

  it("문형이 다르면 key가 다르다", () => {
    const inv = { dist: "dist", pages: [{ page: "/w", units: [], links: [], ids: [], figures: [], landmarks: [], headings: [] }], common: [] };
    const one = fixture_build_runtime(10);
    const two = fixture_build_runtime(10);
    two.pages[0].widgets[0].templates[0].template = "{#} served";
    const a = lint_run(inv, one, CTX).filter((f) => f.rule === "L-WIDGET");
    const b = lint_run(inv, two, CTX).filter((f) => f.rule === "L-WIDGET");
    expect(a[0].key).not.toBe(b[0].key);
  });
});
