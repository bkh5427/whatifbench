// 푸시 게이트 자체의 테스트.
//
// 감사에서 확정된 "새는 경우" 하나하나에 대해 **게이트가 실제로 잡는다**를 증명한다.
// 게이트가 무조건 실패하기만 해도 아래 테스트 중 하나(깨끗한 저장소 → 위반 0)가
// 깨지므로, 통과 = 잡을 것만 잡는다는 뜻이다.
//
// 시험은 **임시 디렉터리에 만든 가짜 저장소 사본**에 대고 한다.
// 실제 저장소 파일을 고쳤다 되돌리는 방식은 쓰지 않는다 — 다른 담당자가 동시에
// 같은 파일을 만지고 있고, 되돌리기가 실패하면 검수 안 된 글이 남는다.
//
// 배선(훅·prepare·스크립트)도 같은 방식으로 시험한다. 배선을 실제 저장소에서만
// 단언하면 "지금 맞다"만 알 뿐 "틀어지면 잡힌다"를 모른다 — 뮤턴트가 살아남는다.
import { describe, it, expect, afterAll } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { gate_run, gate_check_wiring } from "./check-publish.mjs";
import { fixture_format_article } from "./_fixtures.js";

/** 픽스처 저장소에는 사실 검사 장부가 없다. 다른 규칙을 따로 시험할 때는 사실 검사를 끈다(아래 전용 시험이 켠 경우를 본다). */
const FIXTURE_GATE = { audit: false };

const FIXTURE_BASE = join(tmpdir(), "whatifbench-gate-fixtures");
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** 낡음 판정을 흔들림 없이 만들기 위한 시간차(초). mtime 해상도보다 충분히 크다. */
const STALE_SKEW_SEC = 60;

/** 배선 파일. 가짜 저장소는 실제 저장소의 것을 그대로 복사해 쓴다 —
 *  실제 배선이 망가지면 가짜 저장소도 같이 망가져 "깨끗한 저장소" 테스트가 깨진다. */
const PKG_FILE = "package.json";
const HOOK_FILE = ".githooks/pre-push";
const GITIGNORE_FILE = ".gitignore";
const GATE_ENTRY = "check-publish.mjs";
const PREVIEW_IGNORE_LINE = "src/pages/preview-*.astro";

/** 실제 저장소의 배선 파일을 읽는다. 없으면 null — 가짜 저장소도 없는 채로 만든다. */
function fixture_read_repo_file(rel) {
  const full = join(REPO_ROOT, ...rel.split("/"));
  return existsSync(full) ? readFileSync(full, "utf-8") : null;
}

const madeRoots = [];
afterAll(() => {
  for (const root of madeRoots) rmSync(root, { recursive: true, force: true });
});

/** 가짜 저장소를 하나 만든다. files는 {상대경로: 내용}. null이면 그 파일을 두지 않는다. */
function fixture_write(files, tools) {
  mkdirSync(FIXTURE_BASE, { recursive: true });
  const root = mkdtempSync(join(FIXTURE_BASE, "repo-"));
  madeRoots.push(root);

  // 배선 기본값 — 실제 저장소의 것을 그대로 옮긴다. 실제 배선이 망가지면
  // 가짜 저장소도 같이 망가져 "깨끗한 저장소" 테스트에서 드러난다.
  const wiring = {
    [PKG_FILE]: fixture_read_repo_file(PKG_FILE),
    [HOOK_FILE]: fixture_read_repo_file(HOOK_FILE),
    [GITIGNORE_FILE]: `${PREVIEW_IGNORE_LINE}\ndist/\nnode_modules/\n`,
    "src/data/tools.js": fixture_format_tools(tools),
  };
  for (const [rel, body] of Object.entries({ ...wiring, ...files })) {
    if (body == null) continue; // null이면 그 파일을 두지 않는다 (배선 뮤턴트)
    fixture_write_file(root, rel, body);
  }
  return root;
}

function fixture_write_file(root, rel, body) {
  const full = join(root, ...rel.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body, "utf-8");
  return full;
}

/** 실제 package.json을 읽어 스크립트를 갈아끼운 사본을 돌려준다 (배선 뮤턴트용). */
function fixture_format_pkg(mutate) {
  const pkg = JSON.parse(fixture_read_repo_file(PKG_FILE));
  mutate(pkg.scripts);
  return JSON.stringify(pkg, null, 2);
}

/** 실제 tools.js와 같은 계약(TOOLS + 첫 위반에서 throw하는 게이트)을 흉내낸다. */
function fixture_format_tools(tools) {
  return `export const TOOLS = ${JSON.stringify(tools, null, 2)};
export function tools_check_publishable(pool = TOOLS) {
  const bad = pool.filter((t) => t.published && !t.updated);
  if (bad.length > 0) throw new Error("updated 없음: " + bad.map((t) => t.slug).join(", "));
  return true;
}
`;
}

/** 검수가 끝난 정상 도구 하나. */
function fixture_format_tool(over = {}) {
  return {
    slug: "clean-tool",
    category: "odds",
    name: "Clean Tool",
    grade: "A",
    since: "2026-01-01",
    updated: "2026-01-02",
    tags: ["probability"],
    published: true,
    ...over,
  };
}

const PAGE_CLEAN = `---
const LAST_REVIEWED = "2026-01-02";
const CRUMB = "Clean Tool";
---
<p>A finished page with nothing pending.</p>
`;

/** 집필 규약(`check-standard.mjs`)까지 통과하는 최소 산출물.
 *  게이트가 **둘 다** 보므로 "깨끗한 저장소"는 양쪽을 다 만족해야 한다.
 *  일부러 뼈대만 남겼다 — 규약 자체의 시험은 `check-standard.test.js`에 있다. */
const DIST_CLEAN = fixture_format_article();

/** 위반 목록을 한 덩어리 문자열로. 포함 여부 단언을 읽기 쉽게 하려는 것뿐이다. */
function fixture_format_report(violations) {
  return violations.map((v) => `${v.file}:${v.line ?? ""} ${v.message}`).join("\n");
}

describe("푸시 게이트", () => {
  it("깨끗한 저장소는 통과한다 (게이트가 무조건 실패하는 것이 아님을 증명)", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/index.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toBe("");
  });

  // FN1 — 검사 대상 집합이 tools.js였다. Astro는 파일 라우트라 published:false여도
  //       src/pages에 있으면 배포된다. 옛 게이트는 이 파일을 한 번도 열지 않았다.
  it("FN1: published:false인 도구의 페이지가 src/pages에 있으면 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/draft-tool.astro": `---\nconst LAST_REVIEWED = "TODO";\n---\n<p>draft</p>\n`,
        "dist/draft-tool/index.html": `<p>Last reviewed: TODO</p>`,
      },
      [fixture_format_tool({ slug: "draft-tool", updated: null, since: null, published: false })],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    // 페이지가 존재한다는 사실 자체가 위반이다 (옛 게이트가 통째로 놓치던 자리)
    expect(report).toMatch(/src\/pages\/draft-tool\.astro.*published:false인데 페이지가 있다/s);
    // 그리고 그 파일 안의 표식도 잡힌다
    expect(report).toContain("src/pages/draft-tool.astro:2");
  });

  it("FN1: tools.js에 등록조차 없는 페이지도 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/stray.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/stray/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("tools.js에 없는 페이지다");
  });

  it("FN1: published:true인데 페이지 파일이 없으면 잡는다", async () => {
    const root = fixture_write(
      { "src/pages/index.astro": PAGE_CLEAN, "dist/index.html": DIST_CLEAN },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      "published:true인데 페이지 파일이 없다",
    );
  });

  // FN2 — 옛 패턴은 `"TODO"`(따옴표)와 `>TODO<`(태그 사이)뿐이라 산문 속 TODO를 놓쳤다.
  it("FN2: 앞뒤가 공백인 산문 속 TODO를 잡는다", async () => {
    const prose = `---\nconst LAST_REVIEWED = "2026-01-02";\n---\n<p><strong>Sources.</strong> TODO — the author has not yet verified these links.</p>\n`;
    // 옛 패턴이 정말로 못 잡는 형태인지 먼저 확인한다 (동어반복 방지)
    expect(prose.includes(`"TODO"`)).toBe(false);
    expect(prose.includes(`>TODO<`)).toBe(false);

    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": prose,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("src/pages/clean-tool.astro:4");
  });

  // 화면에 쓰는 문구와 게이트가 보고하는 표식 **이름**은 다르다.
  // 둘을 같은 문자열로 묶으면, 이름을 넓히는 순간 탐지가 멀쩡한데도 테스트가 깨진다.
  it("FN2: TODO 외의 미완성 표식도 잡는다", async () => {
    const cases = [
      { text: "This section is TBD for now.", name: "TBD" },
      { text: "FIXME before publishing.", name: "FIXME" },
      { text: "The rest is coming soon.", name: "coming soon" },
      { text: "This page is under construction.", name: "under construction" },
      { text: "The tools are still being built.", name: "being built" },
      // 이 변형이 실제로 빠져나갔다 — RelatedTools의 대체 문구에 살아 있었다.
      { text: "their tools are being built", name: "being built" },
      { text: "the pages are being written", name: "being built" },
    ];
    for (const { text, name } of cases) {
      const root = fixture_write(
        {
          "src/pages/clean-tool.astro": `---
const LAST_REVIEWED = "2026-01-02";
---
<p>${text}</p>
`,
          "dist/clean-tool/index.html": DIST_CLEAN,
        },
        [fixture_format_tool()],
      );
      expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(`미완성 표식 ${name}`);
    }
  });

  it("FN2: 단어 경계 — TODOS·TBDX 같은 단어에는 걸리지 않는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": `---\nconst LAST_REVIEWED = "2026-01-02";\nconst CRUMB = "Clean Tool";\n---\n<p>TODOS and TBDX and FIXMEISH are ordinary words here.</p>\n`,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toBe("");
  });

  // FN3 — `!t.updated`는 truthy면 통과했다. "TODO"가 화면에 그대로 찍히는데 통과.
  it("FN3: updated가 날짜 형식이 아니면 잡는다", async () => {
    for (const bad of ["TODO", "2026-1-2", "soon", "20260102", 20260102]) {
      const root = fixture_write(
        {
          "src/pages/clean-tool.astro": PAGE_CLEAN,
          "dist/clean-tool/index.html": DIST_CLEAN,
        },
        [fixture_format_tool({ updated: bad })],
      );
      const violations = await gate_run(root, FIXTURE_GATE);
      // 데이터 게이트(tools_check_publishable)는 truthy라 통과시킨다 — 그래서 별도 검사가 필요하다
      expect(fixture_format_report(violations)).toContain("updated가 날짜(YYYY-MM-DD)가 아니다");
    }
  });

  // FN4 — 소스가 깨끗해도 컴포넌트·데이터에서 표식이 산출물로 흘러든다.
  it("FN4: 소스는 깨끗한데 빌드 산출물에만 표식이 있으면 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        // Byline.astro의 REVIEW_PENDING이 흘러든 형태
        "dist/clean-tool/index.html": `<!DOCTYPE html><html><body><span>Last reviewed: TODO</span></body></html>`,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("dist/clean-tool/index.html");
    expect(report).toContain("산출물에 미완성 표식 TODO");
  });

  it("dist가 없으면 통과가 아니라 실패다 (fail-closed)", async () => {
    const root = fixture_write({ "src/pages/clean-tool.astro": PAGE_CLEAN }, [
      fixture_format_tool(),
    ]);
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("npm run build");
  });

  it("dist가 소스보다 낡으면 잡는다 (낡은 산출물 검사는 검사가 아니다)", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const future = new Date(Date.now() + STALE_SKEW_SEC * 1000);
    utimesSync(join(root, "src", "pages", "clean-tool.astro"), future, future);
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("산출물이 소스보다 낡았다");
  });

  it("preview-* 는 소스·산출물 양쪽에서 제외된다 (.gitignore가 막는 유일한 예외)", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/preview-clean.astro": `---\nconst LAST_REVIEWED = "TODO";\n---\n<p>TBD</p>\n`,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/preview-clean/index.html": `<p>Last reviewed: TODO</p>`,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toBe("");
  });

  // FN6 — 옛 게이트는 tools_check_publishable의 throw에서 멈춰 나머지가 안 보였다.
  it("FN6: 데이터 위반이 있어도 멈추지 않고 페이지·산출물 위반까지 전부 모은다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": `---\nconst LAST_REVIEWED = "TODO";\n---\n<p>ok</p>\n`,
        "src/pages/[category].astro": `<p>The tools are still being built, so here is what works.</p>\n`,
        "dist/clean-tool/index.html": `<p>Last reviewed: TODO</p>`,
      },
      [fixture_format_tool({ updated: null })],
    );
    const violations = await gate_run(root, FIXTURE_GATE);
    const files = new Set(violations.map((v) => v.file));
    expect(files.has("src/data/tools.js")).toBe(true);
    expect(files.has("src/pages/clean-tool.astro")).toBe(true);
    expect(files.has("src/pages/[category].astro")).toBe(true); // 동적 라우트도 검사한다
    expect(files.has("dist/clean-tool/index.html")).toBe(true);
    expect(violations.length).toBeGreaterThanOrEqual(4);
  });

  // ── 재감사에서 나온 결함들 ────────────────────────────────
  // 아래는 전부 "고치기 전에는 위반 0"으로 재현된 것들이다.

  // G1 — 산출물을 파일명 `index.html`로만 모았다. Astro는 404를
  //      `dist/404/index.html`이 아니라 `dist/404.html`로 낸다.
  it("G1: dist/404.html 처럼 index.html이 아닌 산출물도 검사한다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/404.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/404.html": `<!DOCTYPE html><html><body><p>Last reviewed: TODO</p></body></html>`,
        "dist/embed.html": `<!DOCTYPE html><html><body><p>FIXME before publishing.</p></body></html>`,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("dist/404.html:1");
    expect(report).toContain("dist/embed.html:1");
    expect(report).toContain("산출물에 미완성 표식 FIXME");
  });

  // 뮤턴트: STATIC_PAGES에서 "404"를 지우면 이 테스트가 죽는다.
  it("G1: 404는 tools.js 등록을 요구하지 않는 고정 페이지다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/404.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/404.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toBe("");
  });

  // G2 — 예외가 `.gitignore`보다 넓었다. gitignore의 `*`는 `/`를 넘지 않아
  //      `src/pages/preview-stuff/real.astro`는 커밋되고 배포된다.
  it("G2: preview- 로 시작하는 **디렉터리** 안의 페이지는 예외가 아니다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/preview-stuff/real.astro": `---\nconst X = "TODO";\n---\n<p>shipped</p>\n`,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/preview-stuff/real/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("src/pages/preview-stuff/real.astro:2");
    expect(report).toContain("미완성 표식 TODO");
  });

  it("G2: dist 쪽 예외도 preview-<이름>/index.html 한 겹뿐이다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        // preview- 디렉터리 **아래의** 산출물은 예외가 아니다
        "dist/preview-stuff/real/index.html": `<p>Last reviewed: TODO</p>`,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      "dist/preview-stuff/real/index.html:1",
    );
  });

  it("G2: .gitignore가 넓어지면 게이트가 그것을 알아챈다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        [GITIGNORE_FILE]: `src/pages/preview-*\ndist/\n`,
      },
      [fixture_format_tool()],
    );
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      "무시 규칙이 게이트의 예외와 다르다",
    );
  });

  // G3 — slug를 파일명만으로 잘라 `src/pages/odds/clean-tool.astro`가 통과했다.
  //      실제 URL은 `/odds/clean-tool`이고 tools.js에는 그런 도구가 없다.
  //      2026-09-10: 규약을 "디렉터리 금지"에서 **"URL에 분류 금지"**로 좁혔다.
  //      포스팅 폴더(`<slug>/index.astro`)는 URL이 `/<slug>`로 그대로라 허용한다.
  it("G3: URL 경로에 분류가 들어가면 위반이다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/odds/clean-tool.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        "dist/odds/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("src/pages/odds/clean-tool.astro");
    expect(report).toContain("경로에 분류가 들어간다");
    // 파일명이 아니라 URL 경로로 대조하므로 tools.js 미등록으로도 잡힌다
    expect(report).toContain("tools.js에 없는 페이지다");
  });

  // G3b — 포스팅 폴더. `<slug>/index.astro`의 URL은 `/<slug>`다 (실측 확인).
  //        분류가 경로에 안 들어가므로 막을 이유가 없다.
  it("G3b: <slug>/index.astro는 통과한다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool/index.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).not.toContain("경로에 분류가 들어간다");
    expect(report).not.toContain("tools.js에 없는 페이지다");
    expect(report).not.toContain("페이지 파일이 없다");
  });

  // G3c — 밑줄로 시작하는 것은 Astro가 라우팅하지 않는다. 게이트도 같은 규칙을 써야
  //        도해(`_fig/`)를 페이지로 착각하지 않는다.
  it("G3c: 밑줄 폴더 안의 .astro는 페이지가 아니다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool/index.astro": PAGE_CLEAN,
        "src/pages/clean-tool/_fig/Steps.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).not.toContain("_fig/Steps.astro");
  });

  // G3e — 이주 중간 상태. Astro는 이걸 오류로 보지 않고 하나를 조용히 고른다.
  it("G3e: 같은 URL을 내는 파일이 둘이면 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/clean-tool/index.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("같은 URL /clean-tool를 내는 파일이 2개다");
  });

  // G3d — `.md`는 Astro가 그대로 URL로 만드는데 게이트는 `.astro`만 훑었다.
  //        초안 원본이 `.md`라 실재하던 구멍이다.
  it("G3d: src/pages의 마크다운을 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/stray-draft.md": "# 초안\n",
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("src/pages/stray-draft.md");
    expect(report).toContain("마크다운을 두지 않는다");
  });

  // G4 — dist 페이지가 하나라도 있으면 넘어갔다. 도구별 대조가 없었다.
  it("G4: published 도구의 산출물이 통째로 없으면 잡는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "src/pages/index.astro": PAGE_CLEAN,
        // dist/clean-tool/ 이 통째로 없다
        "dist/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const report = fixture_format_report(await gate_run(root, FIXTURE_GATE));
    expect(report).toContain("dist/clean-tool");
    expect(report).toContain("published:true인데 산출물이 없다");
    // 소스 페이지 쪽에서도 같은 사실을 잡는다
    expect(report).toContain("src/pages/clean-tool.astro: 산출물이 없다");
  });

  // G5 — 줄 단위로 잘라 놓고 `\s+`를 걸어 줄바꿈을 넘는 표식을 놓쳤다.
  it("G5: 줄바꿈을 넘는 표식도 잡고, 줄 번호는 표식이 시작한 줄이다", async () => {
    const page = `---\nconst LAST_REVIEWED = "2026-01-02";\n---\n<p>The rest is coming\n  soon.</p>\n`;
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": page,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const violations = await gate_run(root, FIXTURE_GATE);
    const hit = violations.find((v) => v.message.includes("미완성 표식 coming soon"));
    expect(hit).toBeDefined();
    expect(hit.file).toBe("src/pages/clean-tool.astro");
    expect(hit.line).toBe(4); // "coming"이 있는 줄
  });

  it("G5: under construction·being built도 줄바꿈을 넘어 잡힌다", async () => {
    for (const [text, name] of [
      ["This page is under\nconstruction.", "under construction"],
      ["The tools are being\n\t built.", "being built"],
    ]) {
      const root = fixture_write(
        {
          "src/pages/clean-tool.astro": `---\nconst LAST_REVIEWED = "2026-01-02";\n---\n<p>${text}</p>\n`,
          "dist/clean-tool/index.html": DIST_CLEAN,
        },
        [fixture_format_tool()],
      );
      expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(`미완성 표식 ${name}`);
    }
  });

  // 뮤턴트: CONTEXT_BEFORE/AFTER를 0으로 만들면 이 테스트가 죽는다.
  // 문맥이 없으면 위반 메시지가 "TODO"만 남아 어디를 고쳐야 할지 알 수 없다.
  it("위반 메시지는 표식 앞뒤 문맥을 담는다", async () => {
    const root = fixture_write(
      {
        "src/pages/clean-tool.astro": `---\nconst LAST_REVIEWED = "2026-01-02";\n---\n<p><strong>Sources.</strong> TODO — the author has not verified these.</p>\n`,
        "dist/clean-tool/index.html": DIST_CLEAN,
      },
      [fixture_format_tool()],
    );
    const hit = (await gate_run(root, FIXTURE_GATE)).find((v) => v.message.includes("미완성 표식 TODO"));
    expect(hit).toBeDefined();
    expect(hit.message).toContain("Sources."); // 앞쪽 문맥
    expect(hit.message).toContain("the author"); // 뒤쪽 문맥
  });
});

// FN5 — 사람이 직접 칠 때만 도는 게이트는 게이트가 아니다.
//
// 옛 FN5는 `package.json`의 스크립트 4개만 봤다. 그런데 그 스크립트들이 바로
// "사람이 직접 치는" 경로다. **훅 파일과 `prepare`가 사라지면 새 클론에서
// `git push`가 그냥 나간다** — 스크립트는 멀쩡한 채로. 그래서 배선도 게이트의
// 검사 대상이고(`gate_check_wiring`), 아래는 그것이 틀어졌을 때 죽는지를 본다.
describe("FN5: 게이트 배선", () => {
  /** 배선만 갈아끼운 가짜 저장소. 나머지는 깨끗하다. */
  function fixture_write_wired(overrides) {
    return fixture_write(
      {
        "src/pages/clean-tool.astro": PAGE_CLEAN,
        "dist/clean-tool/index.html": DIST_CLEAN,
        ...overrides,
      },
      [fixture_format_tool()],
    );
  }

  it("실제 저장소의 배선은 온전하다", () => {
    expect(fixture_format_report(gate_check_wiring(REPO_ROOT))).toBe("");
  });

  it("실제 저장소에 훅 파일이 있고 check:full을 돌린다", () => {
    const hook = fixture_read_repo_file(HOOK_FILE);
    expect(hook).not.toBeNull();
    expect(hook).toContain("check:full");
  });

  it("뮤턴트: prepare에서 core.hooksPath 설정을 지우면 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        delete s.prepare;
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("core.hooksPath");
  });

  it("뮤턴트: 훅 파일을 지우면 잡힌다", async () => {
    const root = fixture_write_wired({ [HOOK_FILE]: null });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("푸시 훅이 없다");
  });

  it("뮤턴트: 훅이 check:full 대신 다른 것을 돌리면 잡힌다", async () => {
    const root = fixture_write_wired({ [HOOK_FILE]: `#!/bin/sh\necho skip\n` });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      "푸시 훅이 `npm run check:full`을 돌리지 않는다",
    );
  });

  // `prepush`를 지운 자리를 메우는 확인. `prepare`는 `npm install` 때만 도니
  // `--ignore-scripts`로 받은 클론은 스크립트·훅 파일이 멀쩡해도 훅이 안 돈다.
  it("뮤턴트: core.hooksPath가 .githooks가 아니면 잡힌다", async () => {
    const root = fixture_write_wired({
      // 저장소이긴 한데 hooksPath가 설정돼 있지 않은 상태
      ".git/config": "[core]\n\trepositoryformatversion = 0\n",
      ".git/HEAD": "ref: refs/heads/main\n",
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("core.hooksPath가 .githooks가 아니다");
  });

  it("실제 저장소는 core.hooksPath가 .githooks로 잡혀 있다", () => {
    expect(fixture_format_report(gate_check_wiring(REPO_ROOT))).not.toContain("core.hooksPath");
  });

  it("뮤턴트: check 스크립트가 게이트를 안 부르면 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        s.check = "echo ok";
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      `scripts.check가 ${GATE_ENTRY}를 부르지 않는다`,
    );
  });

  it("뮤턴트: check:full이 빌드를 건너뛰면 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        s["check:full"] = "npm run check";
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("빌드 후 게이트를 돌리지 않는다");
  });

  // G7 — prepush와 훅이 둘 다 check:full을 돌려 Astro 빌드가 두 번 돌았다.
  //      훅이 최후 방어선이므로 훅을 남기고 prepush를 지운다.
  it("G7: prepush가 다시 생기면 빌드 두 번으로 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        s.prepush = "npm run check:full";
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("빌드가 두 번 된다");
  });

  it("사실 검사: 게이트 기본값은 사실 검사를 켠다 — 장부가 없으면 막힌다", async () => {
    const root = fixture_write({}, [fixture_format_tool()]);
    expect(fixture_format_report(await gate_run(root))).toContain("사실 검사");
  });

  it("사실 검사: 실행 경로가 audit_run을 부른다(배선이 끊기면 잡힌다)", () => {
    const src = fixture_read_repo_file("scripts/check-publish.mjs");
    expect(src).toContain("audit_run(root, tools)");
    expect(src).toMatch(/gate_run\(root = REPO_ROOT, \{ audit = true \}/);
  });

  it("G7: 실제 저장소의 push 경로는 게이트를 한 번만 돌린다", () => {
    const pkg = JSON.parse(fixture_read_repo_file(PKG_FILE));
    expect(pkg.scripts.push).toContain("git push"); // 훅이 발화한다
    expect(pkg.scripts.prepush).toBeUndefined(); // 훅과 겹치지 않는다
  });

  // 중복 스크립트 — `check`와 `check:publish`가 같은 것을 가리켜 문서마다
  // 다른 이름을 썼다. 이름은 `check` 하나만 둔다.
  it("게이트를 부르는 스크립트 이름은 check 하나뿐이다", () => {
    const pkg = JSON.parse(fixture_read_repo_file(PKG_FILE));
    const gateScripts = Object.entries(pkg.scripts)
      .filter(([, v]) => v.includes(GATE_ENTRY))
      .map(([k]) => k);
    expect(gateScripts).toEqual(["check"]);
  });

  it("뮤턴트: 게이트 별칭을 다시 만들면 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        s["check:publish"] = "node scripts/check-publish.mjs";
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain(
      "게이트를 부르는 스크립트가 여럿이다",
    );
  });

  it("build는 게이트를 부르지 않는다 (게이트가 실패 중이어도 빌드는 돌아야 한다)", () => {
    const pkg = JSON.parse(fixture_read_repo_file(PKG_FILE));
    expect(pkg.scripts.build).not.toContain("check-publish");
    expect(pkg.scripts.prebuild).toBeUndefined();
  });

  it("뮤턴트: 빌드에 게이트를 물리면 잡힌다", async () => {
    const root = fixture_write_wired({
      [PKG_FILE]: fixture_format_pkg((s) => {
        s.prebuild = "npm run check";
      }),
    });
    expect(fixture_format_report(await gate_run(root, FIXTURE_GATE))).toContain("빌드에 게이트를 물리지 마라");
  });
});

// 2026-09-25: `public/`은 그대로 배포되므로 미공개 도구의 공유 카드가 남아 있으면
// /og/<slug>.png로 누구나 받는다. build-og.mjs는 공개된 것만 새로 그리지만 남은 파일을
// 지우지는 않아, PC 쪽 폴더에 미공개 도구 7개의 카드가 실제로 남아 있었다.
describe("공유 카드 — 미공개 도구의 카드가 남아 있으면 막는다", () => {
  it("audit_run이 그 파일 이름을 대고 막는다", async () => {
    const { audit_run } = await import("./audit/check-audit.mjs");
    const root = mkdtempSync(join(tmpdir(), "og-stray-"));
    mkdirSync(join(root, "public/og"), { recursive: true });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "public/og/default.png"), "x");
    writeFileSync(join(root, "public/og/unpublished-tool.png"), "x");
    const TOOLS = [{ slug: "published-tool", published: true, category: "chance" }];
    const out = audit_run(root, { TOOLS, CATEGORIES: [] });
    const hit = out.filter((m) => m.includes("미공개 도구의 공유 카드"));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toContain("unpublished-tool.png");
    expect(hit[0]).not.toContain("default.png");
    rmSync(root, { recursive: true, force: true });
  });
});
