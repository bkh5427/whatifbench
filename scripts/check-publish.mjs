// 푸시 게이트. **푸시 = 배포**이므로 검수가 끝나지 않은 페이지가 나가면 그대로 공개된다.
// 규약 `site/CLAUDE.md`의 초안 워크플로 3번("검수가 끝나지 않은 페이지는 푸시하지
// 않는다")을 집행하는 유일한 수단이다. 검수 완료의 표식은 `tools.js`의 `updated`
// 날짜이고, 비어 있으면 `Byline.astro`가 `TODO`를 렌더한다.
//
// ── 쓰는 법 ────────────────────────────────────────────────
//   npm run check          게이트만 돌린다 (dist/가 이미 있어야 한다)
//   npm run check:full     빌드 후 게이트. 푸시 전에 도는 것이 이것이다
//   npm run push           git push (아래 훅이 발화한다)
//
// **훅이 유일한 집행자다.** `.githooks/pre-push`가 `check:full`을 돌리고,
// `package.json`의 `prepare`가 `npm install` 때 `core.hooksPath`를 `.githooks`로
// 맞춘다 — 어느 경로로 `git push`를 하든 게이트를 지난다.
// `.git/hooks/`에 따로 만들지 마라. 훅이 두 벌이 되어 빌드가 두 번 돈다.
// 같은 이유로 `package.json`에 `prepush`를 두지 않는다 — `npm run push`가
// `check:full`을 돌리고 이어지는 `git push`가 훅에서 또 돌려 빌드가 두 번 된다.
// 훅은 `npm run push`가 아닌 경로(직접 `git push`)까지 덮으므로 훅만 남긴다.
// 이 배선 자체를 `gate_check_wiring`이 검사한다 — 훅이나 `prepare`가 사라지면
// 새 클론에서 `git push`가 그냥 나가기 때문이다.
//
// build/prebuild에는 붙이지 않는다. 게이트가 의도대로 실패하는 동안
// 빌드에 물리면 개발이 통째로 막힌다.
//
// ── 무엇을 검사하나 ────────────────────────────────────────
// 0) 배선: package.json 스크립트 + `.githooks/pre-push` + `prepare`.
// 1) 소스 집합: `src/pages/**/*.astro` **전부**. 검사 대상을 tools.js로 잡으면
//    안 된다 — Astro는 파일 라우트라 `published` 플래그와 무관하게 배포된다.
//    하위 디렉터리 자체도 위반이다 (도구 URL에 카테고리가 들어간다).
// 2) 산출물 집합: `dist/**/*.html` **전부**. `dist/404.html`처럼 index.html이
//    아닌 이름으로 나오는 것이 있어 확장자로 잡는다. 컴포넌트·데이터에서
//    흘러드는 문자열(Byline의 REVIEW_PENDING, tools.js의 updated)까지 여기서 잡힌다.
//    발행된 도구·소스 페이지마다 산출물이 실재하는지도 대조한다.
// 3) tools.js 데이터: 발행 게이트 + updated 날짜 형식.
//
// 위반은 **전부 모아서** 보고한다. 첫 건에서 멈추지 않는다.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── 상수 ───────────────────────────────────────────────────
/** 저장소 루트. 이 스크립트가 있는 scripts/의 부모다. cwd에 의존하지 않는다. */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const PAGES_DIR = "src/pages";
const DIST_DIR = "dist";
const TOOLS_MODULE = "src/data/tools.js";
const PAGE_EXT = ".astro";
/**
 * Astro가 라우팅에서 빼는 것. 밑줄로 시작하는 **폴더나 파일**은 URL이 되지 않는다.
 * 게이트도 같은 규칙을 써야 한다 — 아니면 도해(`_fig/`)를 페이지로 착각한다.
 * 실측: `fig/Foo.astro`(밑줄 없음)는 URL이 생기고 sitemap에도 오른다.
 */
const ROUTE_EXCLUDE_PREFIX = "_";
/** 포스팅 폴더 안의 본문 파일. `<slug>/index.astro`의 URL은 `/<slug>`다. */
const FOLDER_PAGE_NAME = "index";
/** Astro는 `.md`도 기본 라우팅한다. 초안 원본이 `.md`라 이 구멍이 실재했다. */
const MARKDOWN_EXT = ".md";
/** 산출물은 파일명이 아니라 **확장자**로 잡는다. Astro는 404를
 *  `dist/404/index.html`이 아니라 `dist/404.html`로 낸다. */
const DIST_PAGE_EXT = ".html";
/** 한 라우트의 산출물이 나올 수 있는 자리. 앞이 기본(directory 형식)이다. */
const DIST_OUTPUT_SUFFIXES = ["/index.html", ".html"];

/** 빌드 신선도 비교에 넣는 소스 경로. 여기가 바뀌면 dist가 낡은 것이다. */
const FRESHNESS_SOURCES = ["src", "astro.config.mjs"];

/**
 * 검사에서 빼는 유일한 예외. `.gitignore`의 **딱 한 줄**이 근거다.
 *
 *   src/pages/preview-*.astro
 *
 * gitignore의 `*`는 `/`를 넘지 않고, 슬래시가 든 패턴은 저장소 루트에 고정된다.
 * 그래서 `src/pages/preview-stuff/real.astro`는 **막히지 않는다** — 커밋되고
 * 배포된다. 예외를 "경로 조각 아무 데나 preview-"로 잡으면 게이트가 그 파일을
 * 통째로 놓친다. 아래 정규식은 gitignore가 실제로 막는 집합과 정확히 같다.
 * (`git check-ignore`는 쓸 수 없다 — `.gitignore`가 `dist/`를 통째로 막고 있어
 *  산출물 검사가 전부 사라진다.)
 * **이 예외를 늘리지 마라.** 늘리는 순간 게이트에 구멍이 생긴다.
 */
const IGNORED_PAGE_PREFIX = "preview-";
const IGNORED_GITIGNORE_LINE = `${PAGES_DIR}/${IGNORED_PAGE_PREFIX}*${PAGE_EXT}`;
const IGNORED_SOURCE_PATTERN = new RegExp(`^${PAGES_DIR}/${IGNORED_PAGE_PREFIX}[^/]*\\${PAGE_EXT}$`);
/** 위 소스가 내는 산출물. dist 최상위 한 겹뿐이다. */
const IGNORED_DIST_PATTERN = new RegExp(
  `^${DIST_DIR}/${IGNORED_PAGE_PREFIX}[^/]*(?:/index\\${DIST_PAGE_EXT}|\\${DIST_PAGE_EXT})$`,
);

/** tools.js에 도구로 등록되지 않아도 되는 고정 페이지. 그 외는 등록을 요구한다. */
const STATIC_PAGES = ["index", "about", "contact", "privacy", "404"];

/** 미완성 표식. 단어 경계로 잡아 `TODOS` 같은 단어가 걸리지 않게 한다. */
const INCOMPLETE_MARKERS = [
  { name: "TODO", pattern: /\bTODO\b/i },
  { name: "TBD", pattern: /\bTBD\b/i },
  { name: "FIXME", pattern: /\bFIXME\b/i },
  { name: "coming soon", pattern: /\bcoming\s+soon\b/i },
  { name: "under construction", pattern: /\bunder\s+construction\b/i },
  // "still being built"만 잡으면 "their tools are being built"가 빠져나간다.
  // 실제로 그 변형이 RelatedTools의 대체 문구에 살아 있었다. 어간으로 잡는다.
  { name: "being built", pattern: /\bbeing\s+(built|written|prepared)\b/i },
];

/** `updated`에 허용하는 형식. 날짜가 아닌 값은 화면에 그대로 찍힌다. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 위반 메시지에 붙이는 문맥 길이. dist HTML은 한 줄이 수만 자라 잘라야 한다. */
const CONTEXT_BEFORE = 40;
const CONTEXT_AFTER = 60;

// ── 배선 상수 ──────────────────────────────────────────────
// 게이트가 **어떻게 불리는가**를 규정하는 파일들. 사람이 직접 칠 때만 도는
// 게이트는 게이트가 아니다. 훅과 prepare가 사라지면 새 클론에서 `git push`가
// 그냥 나간다 — 그래서 배선도 검사 대상이다.
const PKG_FILE = "package.json";
const HOOKS_DIR = ".githooks";
const HOOK_FILE = `${HOOKS_DIR}/pre-push`;
const GITIGNORE_FILE = ".gitignore";
const GIT_DIR = ".git";
const GIT_CONFIG_FILE = `${GIT_DIR}/config`;
/** `prepare`가 반드시 담아야 하는 것. 이것이 훅을 활성화한다. */
const HOOKS_PATH_COMMAND = `core.hooksPath ${HOOKS_DIR}`;
/** 게이트 진입점 파일명. 스크립트가 이것을 가리켜야 한다. */
const GATE_ENTRY = "check-publish.mjs";
/** 게이트를 부르는 스크립트의 **유일한** 이름. 별칭을 두지 않는다 —
 *  문서마다 다른 이름을 쓰게 되고, 하나를 고쳐도 다른 하나가 남는다. */
const SCRIPT_GATE = "check";
const SCRIPT_GATE_FULL = "check:full";
const SCRIPT_BUILD = "build";
const SCRIPT_PREBUILD = "prebuild";
const SCRIPT_PUSH = "push";
const SCRIPT_PREPUSH = "prepush";
const PUSH_COMMAND = "git push";

// ── 도우미 ─────────────────────────────────────────────────
/** 디렉터리를 재귀로 훑어 조건에 맞는 파일 경로(절대)를 모은다. */
function gate_read_files(dir, matchFn) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...gate_read_files(full, matchFn));
    else if (matchFn(full, entry.name)) found.push(full);
  }
  return found;
}

/** 저장소 루트 기준 상대경로를 항상 `/` 구분자로. 패턴 대조는 이 형태로만 한다. */
function gate_format_rel(absPath, root) {
  return relative(root, absPath).split(sep).join("/");
}

/**
 * `.gitignore`가 실제로 막는 것과 **정확히 같은** 집합만 검사에서 뺀다.
 * 경로 조각 아무 데나 `preview-`가 있으면 빼던 옛 판정은 gitignore보다 넓었다.
 */
function gate_check_ignored(absPath, root) {
  const rel = gate_format_rel(absPath, root);
  return IGNORED_SOURCE_PATTERN.test(rel) || IGNORED_DIST_PATTERN.test(rel);
}

/** 파일 트리의 가장 최근 수정시각(ms). 없으면 0. */
function gate_read_newest_mtime(paths) {
  let newest = 0;
  for (const path of paths) {
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const kids = gate_read_files(path, () => true);
      for (const kid of kids) newest = Math.max(newest, statSync(kid).mtimeMs);
    } else {
      newest = Math.max(newest, st.mtimeMs);
    }
  }
  return newest;
}

/** 각 줄이 시작하는 문자 오프셋 표. 매치 위치를 줄 번호로 바꾸는 데 쓴다. */
function gate_build_line_starts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

/** 오프셋이 몇 번째 줄인가(1-기반). 이분 탐색. */
function gate_calculate_line(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * 표식을 찾아 줄 번호·문맥과 함께 돌려준다.
 *
 * **줄 단위로 자르고 나서 찾으면 안 된다.** `\s+`가 줄바꿈을 못 만나
 * `coming\n  soon`이 통째로 빠져나간다(실제로 빠져나갔다). 텍스트 전체에
 * 정규식을 걸고, 매치 **시작 오프셋**에서 줄 번호를 되돌린다 — 보고 형식은
 * 그대로 `파일:줄`이다.
 *
 * 같은 줄에서 같은 표식은 한 번만 보고한다. dist HTML은 한 줄이 수만 자라
 * 전부 보고하면 위반 목록이 같은 문장으로 뒤덮인다.
 */
function gate_scan_markers(text) {
  const hits = [];
  const lineStarts = gate_build_line_starts(text);
  const seen = new Set();

  for (const marker of INCOMPLETE_MARKERS) {
    const flags = marker.pattern.flags.includes("g")
      ? marker.pattern.flags
      : `${marker.pattern.flags}g`;
    const scanner = new RegExp(marker.pattern.source, flags);
    let found;
    while ((found = scanner.exec(text)) !== null) {
      if (found[0].length === 0) {
        scanner.lastIndex += 1;
        continue;
      }
      const at = found.index;
      const end = at + found[0].length;
      const line = gate_calculate_line(lineStarts, at);
      const key = `${line}:${marker.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // 문맥은 매치가 걸친 줄들 안으로만 자른다. 앞뒤 무관한 줄까지 끌어오지 않는다.
      const endLine = gate_calculate_line(lineStarts, end - 1);
      const spanFrom = lineStarts[line - 1];
      const spanTo = endLine < lineStarts.length ? lineStarts[endLine] - 1 : text.length;
      const context = text
        .slice(Math.max(spanFrom, at - CONTEXT_BEFORE), Math.min(spanTo, end + CONTEXT_AFTER))
        .replace(/\s+/g, " ")
        .trim();
      hits.push({ line, marker: marker.name, context });
    }
  }
  hits.sort((a, b) => a.line - b.line);
  return hits;
}

/** 한 라우트의 산출물이 dist에 실재하는가. */
function gate_check_output_exists(root, route) {
  return DIST_OUTPUT_SUFFIXES.some((suffix) =>
    existsSync(join(root, DIST_DIR, ...`${route}${suffix}`.split("/"))),
  );
}

/**
 * 소스 페이지 목록. `{abs, rel, route}`.
 * `route`는 **파일명이 아니라 URL 경로**다 — `src/pages/odds/x.astro`의 route는
 * `odds/x`이지 `x`가 아니다. 파일명만 보면 하위 디렉터리 페이지가 tools.js의
 * 도구와 이름이 같다는 이유로 통과한다.
 */
function gate_read_pages(root) {
  const dir = join(root, PAGES_DIR);
  return gate_read_files(dir, (_full, name) => name.endsWith(PAGE_EXT))
    .filter((p) => !gate_check_ignored(p, root))
    .map((abs) => {
      const rel = gate_format_rel(abs, root);
      const raw = rel.slice(PAGES_DIR.length + 1, -PAGE_EXT.length);
      return { abs, rel, raw, route: gate_normalise_route(raw) };
    })
    // 밑줄로 시작하는 조각이 하나라도 있으면 Astro가 라우팅하지 않는다 — 페이지가 아니다
    .filter((p) => !p.raw.split("/").some((seg) => seg.startsWith(ROUTE_EXCLUDE_PREFIX)));
}

/**
 * 파일 경로를 URL 경로로 바꾼다. `<slug>/index`의 URL은 `/<slug>`다 —
 * 포스팅 폴더는 URL에 아무것도 더하지 않는다.
 */
function gate_normalise_route(raw) {
  const tail = `/${FOLDER_PAGE_NAME}`;
  return raw.endsWith(tail) ? raw.slice(0, -tail.length) : raw;
}

/**
 * 같은 URL을 내는 파일이 둘 이상인지 본다.
 *
 * 왜 따로 보는가: `src/pages/x.astro`와 `src/pages/x/index.astro`가 **둘 다 있어도
 * Astro는 오류를 내지 않는다.** 8페이지를 그대로 빌드하고, 둘 중 하나가 조용히
 * 이긴다 (2026-09-11 실측). 이주 중간 상태에서 실제로 생기는 모양이고,
 * 어느 쪽이 배포될지 알 수 없다는 뜻이라 빌드 성공이 안전을 뜻하지 않는다.
 */
export function gate_check_duplicate_routes(pages) {
  const byRoute = new Map();
  for (const page of pages) {
    if (!byRoute.has(page.route)) byRoute.set(page.route, []);
    byRoute.get(page.route).push(page.rel);
  }
  return [...byRoute.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([route, files]) => ({
      file: files.join(" · "),
      message: `같은 URL /${route}를 내는 파일이 ${files.length}개다 — Astro는 오류 없이 하나를 고른다. 어느 쪽이 배포될지 알 수 없다. 하나만 남긴다`,
    }));
}

/**
 * `src/pages/` 안의 마크다운을 찾는다.
 *
 * 왜 따로 보는가: Astro는 `.md`도 **기본 라우팅한다.** 그런데 이 게이트의 나머지는
 * `.astro`만 훑는다. 초안 원본이 `.md`라서, 실수로 하나 옮기면 아무 검사도 안 걸리고
 * 그대로 배포된다. 실제로 뚫려 있던 구멍이다.
 */
export function gate_check_markdown_pages(root) {
  const dir = join(root, PAGES_DIR);
  if (!existsSync(dir)) return [];
  return gate_read_files(dir, (_full, name) => name.endsWith(MARKDOWN_EXT))
    .filter((abs) => {
      const raw = gate_format_rel(abs, root).slice(PAGES_DIR.length + 1);
      return !raw.split("/").some((seg) => seg.startsWith(ROUTE_EXCLUDE_PREFIX));
    })
    .map((abs) => ({
      file: gate_format_rel(abs, root),
      message: `${PAGES_DIR}에 마크다운을 두지 않는다 — Astro가 그대로 URL로 만든다. 원고는 ../01_drafts/에 둔다`,
    }));
}

/** 동적 라우트는 파일 하나가 여러 URL을 낸다. 이름 대조·산출물 대조에서 뺀다. */
function gate_check_dynamic(route) {
  return route.includes("[");
}

// ── 검사 ───────────────────────────────────────────────────
/**
 * 0) 배선. 게이트가 **자동으로 불리는가**를 본다.
 *    훅 파일이나 `prepare`가 사라지면 새 클론에서 `git push`가 그냥 나간다.
 *    스크립트만 보는 검사는 "사람이 직접 치는 경로"만 본 것이다.
 */
export function gate_check_wiring(root) {
  const violations = [];
  const pkgPath = join(root, PKG_FILE);
  if (!existsSync(pkgPath)) {
    violations.push({ file: PKG_FILE, message: "package.json이 없다. 배선을 확인할 수 없다" });
    return violations;
  }

  let scripts;
  try {
    scripts = JSON.parse(readFileSync(pkgPath, "utf-8")).scripts ?? {};
  } catch (e) {
    violations.push({ file: PKG_FILE, message: `package.json을 읽을 수 없다 — ${e.message}` });
    return violations;
  }

  // 게이트를 부르는 스크립트가 정확히 하나여야 한다.
  // 두 이름이 같은 것을 가리키면 문서마다 다른 이름을 쓰고, 하나를 고쳐도 다른
  // 하나가 남는다 (`check`와 `check:publish`가 실제로 그랬다).
  const gateScripts = Object.keys(scripts).filter((k) => (scripts[k] ?? "").includes(GATE_ENTRY));
  if (!gateScripts.includes(SCRIPT_GATE)) {
    violations.push({
      file: PKG_FILE,
      message: `scripts.${SCRIPT_GATE}가 ${GATE_ENTRY}를 부르지 않는다`,
    });
  }
  if (gateScripts.length > 1) {
    violations.push({
      file: PKG_FILE,
      message: `게이트를 부르는 스크립트가 여럿이다 (${gateScripts.join(", ")}) — 이름은 ${SCRIPT_GATE} 하나만 둔다`,
    });
  }

  const full = scripts[SCRIPT_GATE_FULL] ?? "";
  if (!full.includes(SCRIPT_BUILD) || !full.includes(SCRIPT_GATE)) {
    violations.push({
      file: PKG_FILE,
      message: `scripts.${SCRIPT_GATE_FULL}이 빌드 후 게이트를 돌리지 않는다 — 낡은 dist를 검사하게 된다`,
    });
  }

  // 훅 활성화. 이것이 없으면 새 클론은 core.hooksPath가 기본값이라 훅이 안 돈다.
  if (!(scripts.prepare ?? "").includes(HOOKS_PATH_COMMAND)) {
    violations.push({
      file: PKG_FILE,
      message: `scripts.prepare가 \`git config ${HOOKS_PATH_COMMAND}\`를 하지 않는다 — 새 클론에서 훅이 돌지 않아 검수 안 된 글이 그대로 나간다`,
    });
  }

  // 게이트가 의도대로 실패하는 동안에도 빌드는 돌아야 한다.
  if ((scripts[SCRIPT_BUILD] ?? "").includes(GATE_ENTRY) || scripts[SCRIPT_PREBUILD] != null) {
    violations.push({
      file: PKG_FILE,
      message: `빌드에 게이트를 물리지 마라 — 게이트가 실패하는 동안 개발이 통째로 막힌다`,
    });
  }

  // 빌드 두 번 방지: `npm run push`가 git push를 부르면 훅이 이미 check:full을
  // 돌린다. 여기에 prepush까지 있으면 Astro 빌드가 두 벌 돈다.
  const pushScript = scripts[SCRIPT_PUSH] ?? "";
  if (pushScript.includes(PUSH_COMMAND) && scripts[SCRIPT_PREPUSH] != null) {
    violations.push({
      file: PKG_FILE,
      message: `${SCRIPT_PREPUSH}와 ${HOOK_FILE}가 둘 다 ${SCRIPT_GATE_FULL}을 돌려 빌드가 두 번 된다 — 훅이 최후 방어선이므로 ${SCRIPT_PREPUSH}를 지운다`,
    });
  }

  // 훅 파일 자체. 이것이 최후 방어선이다.
  const hookPath = join(root, ...HOOK_FILE.split("/"));
  if (!existsSync(hookPath)) {
    violations.push({
      file: HOOK_FILE,
      message: `푸시 훅이 없다. 어느 경로로 git push를 하든 게이트를 지나야 한다`,
    });
  } else {
    const hook = readFileSync(hookPath, "utf-8");
    if (!hook.includes(SCRIPT_GATE_FULL)) {
      violations.push({
        file: HOOK_FILE,
        message: `푸시 훅이 \`npm run ${SCRIPT_GATE_FULL}\`을 돌리지 않는다 — 훅이 있어도 아무것도 막지 않는다`,
      });
    }
  }

  // 훅이 **실제로 활성화돼 있는가**. `prepare`는 `npm install` 때만 돈다 —
  // `--ignore-scripts`로 받았거나 누가 core.hooksPath를 다른 값으로 돌려놓으면
  // 스크립트도 훅 파일도 멀쩡한데 `git push`가 그냥 나간다.
  // `prepush`를 지운 뒤로는 이 확인이 그 자리를 대신한다.
  if (existsSync(join(root, GIT_DIR))) {
    let configured = "";
    try {
      configured = execFileSync("git", ["-C", root, "config", "--get", "core.hooksPath"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      configured = "";
    }
    if (configured !== HOOKS_DIR) {
      violations.push({
        file: GIT_CONFIG_FILE,
        message: `core.hooksPath가 ${HOOKS_DIR}가 아니다 (${configured || "설정 없음"}) — 훅이 돌지 않아 git push가 게이트를 지나지 않는다. \`npm install\` 또는 \`git config ${HOOKS_PATH_COMMAND}\``,
      });
    }
  }

  // `.gitignore`가 넓어지면 위 예외 정규식이 그것과 어긋난다. 어긋난 채로 두면
  // 게이트가 커밋되는 파일을 검사에서 빼거나, 안 나가는 파일을 잡는다.
  const ignorePath = join(root, GITIGNORE_FILE);
  if (existsSync(ignorePath)) {
    const lines = readFileSync(ignorePath, "utf-8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes(PAGES_DIR));
    const unexpected = lines.filter((l) => l !== IGNORED_GITIGNORE_LINE);
    if (unexpected.length > 0) {
      violations.push({
        file: GITIGNORE_FILE,
        message: `${PAGES_DIR}에 대한 무시 규칙이 게이트의 예외와 다르다 (${unexpected.join(", ")}) — 게이트의 예외는 \`${IGNORED_GITIGNORE_LINE}\` 하나만 전제한다`,
      });
    }
  }

  return violations;
}

/**
 * 1) 소스 페이지. `src/pages/**\/*.astro` 전부를 연다.
 *    - 미완성 표식
 *    - 하위 디렉터리 (도구 URL에 카테고리가 들어가 재분류 때 URL이 깨진다)
 *    - tools.js와의 정합성: 페이지가 있는데 데이터가 published:false면
 *      **파일 라우트라 그대로 배포된다**. 이것이 이 게이트가 새던 자리다.
 */
function gate_check_pages(root, tools, pages) {
  const violations = [];
  const dir = join(root, PAGES_DIR);
  if (!existsSync(dir)) {
    violations.push({ file: PAGES_DIR, message: "페이지 디렉터리가 없다" });
    return violations;
  }

  for (const page of pages) {
    const src = readFileSync(page.abs, "utf-8");

    for (const hit of gate_scan_markers(src)) {
      violations.push({
        file: page.rel,
        line: hit.line,
        message: `미완성 표식 ${hit.marker} — ${hit.context}`,
      });
    }

    // 규약: **URL 경로에 카테고리를 넣지 않는다.** 넣으면 재분류할 때 공개된
    // URL이 깨진다. 포스팅 폴더(`<slug>/index.astro`)는 URL이 `/<slug>`로 그대로라
    // 이 규약을 어기지 않는다 — 막는 것은 `<카테고리>/<slug>.astro` 쪽이다.
    if (page.route.includes("/")) {
      violations.push({
        file: page.rel,
        message: `URL이 /${page.route}가 되어 경로에 분류가 들어간다 — 재분류하면 공개된 주소가 깨진다. 포스팅은 ${PAGES_DIR}/<slug>.astro 또는 ${PAGES_DIR}/<slug>/${FOLDER_PAGE_NAME}${PAGE_EXT}로 둔다`,
      });
    }

    if (gate_check_dynamic(page.route) || STATIC_PAGES.includes(page.route)) continue;
    const tool = tools.TOOLS.find((t) => t.slug === page.route);
    if (!tool) {
      violations.push({
        file: page.rel,
        message: `tools.js에 없는 페이지다. 파일 라우트라 등록 없이 배포되고 sitemap에도 오른다`,
      });
    } else if (!tool.published) {
      violations.push({
        file: page.rel,
        message: `tools.js는 published:false인데 페이지가 있다. Astro는 파일 라우트라 그대로 배포된다 — 검수 전 초안은 ../01_drafts/에 둔다`,
      });
    }
  }

  // 반대 방향: 발행이라는데 페이지가 없으면 404가 배포된다
  for (const tool of tools.TOOLS.filter((t) => t.published)) {
    const flat = join(root, PAGES_DIR, `${tool.slug}${PAGE_EXT}`);
    const folder = join(root, PAGES_DIR, tool.slug, `${FOLDER_PAGE_NAME}${PAGE_EXT}`);
    if (!existsSync(flat) && !existsSync(folder)) {
      violations.push({
        file: `${PAGES_DIR}/${tool.slug}${PAGE_EXT}`,
        message: `published:true인데 페이지 파일이 없다`,
      });
    }
  }
  return violations;
}

/**
 * 2) 빌드 산출물. 소스가 깨끗해도 컴포넌트·데이터에서 표식이 흘러들 수 있다.
 *    dist/가 없으면 **통과가 아니라 실패**다 (fail-closed).
 *    "페이지가 하나라도 있으면 통과"도 통과가 아니다 — 도구별로 대조한다.
 */
function gate_check_dist(root, tools, pages) {
  const violations = [];
  const dir = join(root, DIST_DIR);
  if (!existsSync(dir)) {
    violations.push({
      file: DIST_DIR,
      message: `빌드 산출물이 없다. 먼저 \`npm run build\`를 돌리고 다시 검사한다`,
    });
    return violations;
  }

  // 파일명이 아니라 확장자로 잡는다 — `dist/404.html`은 index.html이 아니다.
  const built = gate_read_files(dir, (_full, name) => name.endsWith(DIST_PAGE_EXT)).filter(
    (p) => !gate_check_ignored(p, root),
  );
  if (built.length === 0) {
    violations.push({ file: DIST_DIR, message: "산출물에 페이지가 하나도 없다. 빌드가 깨졌다" });
    return violations;
  }

  for (const page of built) {
    const rel = gate_format_rel(page, root);
    const html = readFileSync(page, "utf-8");
    for (const hit of gate_scan_markers(html)) {
      violations.push({
        file: rel,
        line: hit.line,
        message: `산출물에 미완성 표식 ${hit.marker} — ${hit.context}`,
      });
    }
  }

  // 도구별 대조. 발행이라는데 산출물이 없으면 그 URL은 404가 배포된다.
  for (const tool of tools.TOOLS.filter((t) => t.published)) {
    if (!gate_check_output_exists(root, tool.slug)) {
      violations.push({
        file: `${DIST_DIR}/${tool.slug}`,
        message: `published:true인데 산출물이 없다. 이 URL은 404가 배포된다 — \`npm run build\`가 이 페이지를 냈는지 확인한다`,
      });
    }
  }

  // 소스 페이지별 대조. 정적 라우트는 반드시 산출물이 하나 나온다.
  for (const page of pages) {
    if (gate_check_dynamic(page.route)) continue;
    if (!gate_check_output_exists(root, page.route)) {
      violations.push({
        file: page.rel,
        message: `산출물이 없다. 검사한 dist가 이 페이지를 담고 있지 않다 — 빌드가 낡았거나 깨졌다`,
      });
    }
  }

  // 산출물이 소스보다 낡았으면 위에서 본 것은 지금 배포될 것이 아니다
  const newestSource = gate_read_newest_mtime(FRESHNESS_SOURCES.map((p) => join(root, p)));
  const newestDist = gate_read_newest_mtime(built);
  if (newestSource > newestDist) {
    violations.push({
      file: DIST_DIR,
      message: `산출물이 소스보다 낡았다. 지금 검사한 것은 배포될 HTML이 아니다 — \`npm run build\` 후 다시 검사한다`,
    });
  }
  return violations;
}

/**
 * 3) tools.js 데이터.
 *    `tools_check_publishable`은 첫 위반에서 throw하고 이 게이트의 소유가 아니다.
 *    try/catch로 받아 **나머지 검사를 계속 진행**한다.
 */
function gate_check_tools(tools) {
  const violations = [];
  try {
    tools.tools_check_publishable();
  } catch (e) {
    violations.push({ file: TOOLS_MODULE, message: e.message });
  }

  // updated가 truthy면 통과시키던 자리. 날짜가 아니면 화면에 그 값이 그대로 찍힌다
  for (const tool of tools.TOOLS) {
    if (tool.updated == null) {
      if (tool.published) {
        violations.push({
          file: TOOLS_MODULE,
          message: `${tool.slug}: published인데 updated가 비어 있다`,
        });
      }
      continue;
    }
    if (typeof tool.updated !== "string" || !DATE_PATTERN.test(tool.updated)) {
      violations.push({
        file: TOOLS_MODULE,
        message: `${tool.slug}: updated가 날짜(YYYY-MM-DD)가 아니다 — ${JSON.stringify(tool.updated)}`,
      });
    }

    // 검수일은 **사람이 끝까지 읽은 날**이다. 아직 오지 않은 날일 수 없다.
    // 형식만 보고 시점을 안 보면 오탈자가 그대로 통과한다 (실제로 통과했다).
    if (new Date(`${tool.updated}T00:00:00Z`) > new Date()) {
      violations.push({
        file: TOOLS_MODULE,
        message: `${tool.slug}: updated가 미래 날짜다 — ${tool.updated}. 검수일은 사람이 실제로 읽은 날이다`,
      });
    }
  }
  return violations;
}

/**
 * 게이트 전체. 위반 배열을 돌려준다(비어 있으면 푸시 가능).
 * `root`를 받는 이유는 테스트가 임시 저장소 사본을 검사하기 위해서다.
 */
export async function gate_run(root = REPO_ROOT) {
  const violations = [];
  violations.push(...gate_check_wiring(root));

  const toolsPath = join(root, TOOLS_MODULE);
  if (!existsSync(toolsPath)) {
    violations.push({ file: TOOLS_MODULE, message: "도구 데이터가 없다" });
    return violations;
  }
  const tools = await import(pathToFileURL(toolsPath).href);
  const pages = gate_read_pages(root);

  violations.push(...gate_check_tools(tools));
  violations.push(...gate_check_duplicate_routes(pages));
  violations.push(...gate_check_markdown_pages(root));
  violations.push(...gate_check_pages(root, tools, pages));
  violations.push(...gate_check_dist(root, tools, pages));
  return violations;
}

/** 위반 목록을 사람이 읽는 줄로. */
export function gate_format_violations(violations) {
  return violations.map((v) => `  ✗ ${v.file}${v.line ? `:${v.line}` : ""} — ${v.message}`);
}

// ── 실행 ───────────────────────────────────────────────────
const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const violations = await gate_run();
  if (violations.length === 0) {
    console.log("  ✓ 배선 / 데이터 게이트 / 소스 페이지 / 빌드 산출물 — 미완성 표식 없음");
    console.log("\n푸시 가능.");
  } else {
    console.error(`푸시 게이트 위반 ${violations.length}건:\n`);
    for (const line of gate_format_violations(violations)) console.error(line);
    console.error("\n푸시하지 마라. 위 항목을 전부 해결한다.");
    process.exit(1);
  }
}
