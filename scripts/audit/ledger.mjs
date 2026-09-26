// 사실 검사 장부. 단위(id)마다 판정·근거·근거가 기댄 파일의 해시·날짜를 남긴다.
// - 글자가 바뀌면 id가 바뀐다 → 옛 판정은 자동 무효(바로 뒤 문장도 id에 앞 문장이 들어 있어 같이 무효).
// - 근거가 기댄 파일(CODE:/TEST:/SRC:)이 바뀌면 그 판정도 무효.
// - 근거가 가리킨 다른 단위(SITE:)가 통과가 아니면 그 판정도 무효.
// - 통과 판정은 기계가 풀 수 있는 근거 문법을 지켜야 한다(파일:줄이 실재, 인용문이 파일 안에 실재 …).
// - ACCEPTED(사람이 결정한 미결)는 accept 명령으로만, 누가·왜를 남긴다.
//
//   node scripts/audit/ledger.mjs validate <verdicts.json> <inventory.json> <lint.json> [--pages /a,/b]
//   node scripts/audit/ledger.mjs validate <verdicts.json> <inventory.json> <lint.json> --role B1   (클래스 전문가)
//   node scripts/audit/ledger.mjs combine  <합친.json> <A1.json> <A2.json> <B1.json> …          (단위별로 합침: x 우선)
//   node scripts/audit/ledger.mjs merge    <verdicts.json> <inventory.json> <lint.json>   (validate를 통과해야 들어간다)
//   node scripts/audit/ledger.mjs widget   <slug> <runtime.json> <verdict: OK|INACCURATE|…> "<근거>"
//   node scripts/audit/ledger.mjs accept   <unitId|flagKey> --by <이름> --reason "<이유>"
//   node scripts/audit/ledger.mjs todo     <inventory.json> [lint.json]
//   node scripts/audit/ledger.mjs prune    <inventory.json> [lint.json]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { cli_is_main } from "./inventory.mjs";
import { widget_hash_source } from "./lint.mjs";

// ── 상수 ───────────────────────────────────────────────────
const TOOL_ROOT = fileURLToPath(new URL("../..", import.meta.url));
/**
 * 근거 경로(CODE:/TEST:/SRC:)를 풀 저장소 루트. AUDIT_ROOT → 현재 폴더(저장소 루트처럼 보이면) → 이 도구가 든 저장소.
 * 사본(벤치마크·초안 샌드박스)을 검사할 때 도구가 원본 저장소를 보고 판정하는 일을 막는다.
 */
export const REPO_ROOT = process.env.AUDIT_ROOT ?? (existsSync(join(process.cwd(), "src", "data", "tools.js")) ? process.cwd() : TOOL_ROOT);
export const LEDGER_PATH = join(REPO_ROOT, "audit", "ledger.json");
export const SOURCES_DIR = join(REPO_ROOT, "audit", "sources");
/** 장부에 "통과"로 남길 수 있는 판정. ACCEPTED는 사람이 accept 명령으로만. */
export const PASS_VERDICTS = new Set(["OK", "ACCEPTED"]);
export const ALL_VERDICTS = new Set(["OK", "ACCEPTED", "FALSE", "INACCURATE", "UNVERIFIED"]);
/** 오류 클래스 수. checks는 E1..E22 순서로 한 글자씩: o=봤고 이상 없음, x=문제, -=해당 없음. */
export const CLASS_COUNT = 22;
const CHECKS_RE = new RegExp(`^[ox-]{${CLASS_COUNT}}$`);
export const EVIDENCE_TYPES = ["CALC:", "CODE:", "TEST:", "SRC:", "SITE:", "DEF:", "VIS:", "EDIT:"];
const EVIDENCE_MIN_CHARS = 20;
/** 기계 표시 → 통과 근거로 반드시 들어가야 하는 근거 종류(하나 이상). */
export const FLAG_EVIDENCE = {
  "L-NUM": ["CALC:", "SRC:", "SITE:", "TEST:"],
  "L-SELF": ["CODE:", "SRC:", "SITE:"],
  "L-CODE": ["CODE:", "TEST:"],
  // L-3P의 정규식은 재현율을 앞세워 넓다 — 연도 하나, "browser", "Google", "It's"만
  // 있어도 걸린다. 그래서 제3자 주장이 **없는** 자기 서술까지 표시되는데, SRC:만
  // 받으면 그런 단위는 통과시킬 길이 없어 UNVERIFIED로 쌓인다(2026-09-24 전수검사에서
  // /privacy·/one-line-or-many에서 9건). DEF:를 허용해 "이 문장에는 제3자 주장이
  // 없다"를 **글로 적게** 한다 — 판정관이 읽고 되짚을 수 있는 형태다.
  "L-3P": ["SRC:", "DEF:"],
  "L-CITE": ["SRC:"],
  "L-REF": ["SITE:", "VIS:"],
  "L-GEOM": ["VIS:", "CALC:"],
  "L-OG": ["VIS:"],
  "L-LAYOUT": ["SITE:", "VIS:", "DEF:"],
  "L-HEAD": ["CODE:", "DEF:", "SITE:"],
  "L-LINKTXT": ["SRC:", "SITE:", "DEF:", "CODE:"],
};
/** 검사자 역할별 담당 클래스와 담당 페이지 표시(SKILL §6). A는 전부. */
export const ROLE_CLASSES = {
  A: Array.from({ length: CLASS_COUNT }, (_, i) => i + 1),
  B1: [2, 12, 14, 17],
  B2: [3, 7, 9, 13, 18, 20, 22],
  B3: [1, 4, 5, 8],
  B4: [6, 15],
  B5: [10, 11, 16, 19, 21],
};
export const ROLE_RULES = {
  B1: ["L-QUANT"],
  B2: ["L-REF", "L-SIBLING", "L-CONSIST", "L-SURFACE", "L-LINK", "L-EXTLINK", "L-OG", "L-STRUCT", "L-UNPUB", "L-CONTRA", "L-LAYOUT", "L-HEAD", "L-LINKTXT"],
  B3: ["L-NUM", "L-SELF", "L-CODE", "L-ORACLE", "L-RUNTIME"],
  B4: ["L-3P", "L-CITE", "L-EXTLINK"],
  B5: ["L-GLUE", "L-COLOR", "L-TYPO", "L-GEOM", "L-ENV"],
  B6: ["L-WIDGET"],
};
/** 이 표시가 붙은 단위는 EDIT:(사실 주장 없음)로 통과시킬 수 없다. */
const NO_EDIT_RULES = new Set(["L-NUM", "L-SELF", "L-CODE", "L-3P", "L-CITE", "L-GEOM", "L-OG"]);
/** OK로 처분할 수 없는 페이지 표시(실행 목록 없이 넘어가는 것 방지). */
const UNDISPOSABLE_RULES = new Set(["L-RUNTIME"]);
const NUMBER_TOKEN_RE = /(?<![\w.])[-−+]?\d[\d,]*(?:\.\d+)?(?![\w])/g;
const ID_RE = /\b[0-9a-f]{12}(?:-\d+)?\b/g;

export function ledger_read(path = LEDGER_PATH) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function ledger_write(ledger, path = LEDGER_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = { ...ledger, units: Object.fromEntries(Object.entries(ledger.units).sort()), flags: Object.fromEntries(Object.entries(ledger.flags).sort()) };
  writeFileSync(path, `${JSON.stringify(sorted, null, 1)}\n`);
}

export function ledger_empty() {
  return { schema: 2, note: "사실 검사 장부 — 손으로 고치지 말 것. scripts/audit/ledger.mjs의 validate→merge, accept만 쓴다.", units: {}, flags: {}, widgets: {}, runs: [] };
}

function file_sha(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

function path_resolve(root, p) {
  const clean = p.replace(/^["'`]|["'`,;)]$/g, "");
  return isAbsolute(clean) ? clean : join(root, clean);
}

/** 근거 문자열에서 기계가 확인할 수 있는 것을 뽑고 확인한다. @returns {{problems:string[], deps:Object<string,string>, siteRefs:string[]}} */
export function evidence_resolve(evidence, root, invIds) {
  const e = String(evidence ?? "");
  const problems = [];
  const deps = {};
  const siteRefs = [];
  const quotes = [...e.matchAll(/"([^"]{6,})"|“([^”]{6,})”/g)].map((m) => m[1] ?? m[2]);
  for (const m of e.matchAll(/CODE:\s*([^\s:]+\.[a-z]{2,5}):(\d+)/gi)) {
    const f = path_resolve(root, m[1]);
    if (!existsSync(f)) { problems.push(`CODE: 파일 없음 ${m[1]}`); continue; }
    const lines = readFileSync(f, "utf8").split("\n").length;
    if (Number(m[2]) > lines) problems.push(`CODE: ${m[1]}에 ${m[2]}번째 줄 없음(${lines}줄)`);
    deps[m[1]] = file_sha(f);
  }
  if (/CODE:/.test(e) && !/CODE:\s*[^\s:]+\.[a-z]{2,5}:\d+/i.test(e)) problems.push("CODE: 근거에 파일:줄이 없음");
  for (const m of e.matchAll(/TEST:\s*([^\s]+\.test\.[a-z]+)/gi)) {
    const f = path_resolve(root, m[1]);
    if (!existsSync(f)) { problems.push(`TEST: 파일 없음 ${m[1]}`); continue; }
    const body = readFileSync(f, "utf8");
    if (!quotes.some((q) => body.includes(q))) problems.push(`TEST: ${m[1]} 안에 인용한 단언문("…")이 그대로 없음`);
    deps[m[1]] = file_sha(f);
  }
  if (/TEST:/.test(e) && !/TEST:\s*[^\s]+\.test\.[a-z]+/i.test(e)) problems.push("TEST: 근거에 시험 파일 경로가 없음");
  for (const m of e.matchAll(/SRC:\s*([a-z0-9][a-z0-9._-]*)/gi)) {
    const f = join(root, "audit", "sources", `${m[1]}.md`);
    if (!existsSync(f)) { problems.push(`SRC: 출처 캐시 없음 audit/sources/${m[1]}.md`); continue; }
    const body = readFileSync(f, "utf8");
    if (!quotes.some((q) => body.includes(q))) problems.push(`SRC: ${m[1]} 캐시 안에 인용문("…")이 그대로 없음`);
    if (!/^verified-by:[ \t]*\S+/m.test(body)) problems.push(`SRC: ${m[1]} 캐시를 두 번째 검사자가 다시 가져와 확인하지 않음(verified-by 줄 없음)`);
    deps[`audit/sources/${m[1]}.md`] = file_sha(f);
  }
  if (/SITE:/.test(e)) {
    const ids = [...e.slice(e.indexOf("SITE:")).matchAll(ID_RE)].map((m) => m[0]);
    if (!ids.length) problems.push("SITE: 근거에 단위 id가 없음");
    for (const id of ids) { if (invIds && !invIds.has(id)) problems.push(`SITE: 없는 단위 id ${id}`); siteRefs.push(id); }
  }
  if (/CALC:/.test(e) && !/CALC:[^]*?(→|=|->)[^]*?\d/.test(e)) problems.push("CALC: 계산식과 결과(→ 또는 =)가 없음");
  return { problems, deps, siteRefs };
}

/**
 * 판정 파일이 규약을 지켰는가 — 기계가 확인하는 완결성과 근거 문법.
 * @returns {string[]} 문제 목록(비면 완결)
 */
export function verdicts_validate(verdicts, inv, flags, { pages = null, root = REPO_ROOT, role = "A" } = {}) {
  if (role !== "A") return verdicts_validate_role(verdicts, inv, flags, { pages, root, role });
  const problems = [];
  const allUnits = [...inv.common, ...inv.pages.flatMap((p) => p.units)];
  const invIds = new Set(allUnits.map((u) => u.id));
  const units = allUnits.filter((u) => !pages || pages.includes(u.page));
  const byId = new Map();
  for (const v of verdicts.units ?? []) { if (byId.has(v.id)) problems.push(`같은 단위 판정이 두 번: ${v.id}`); byId.set(v.id, v); }
  const unitFlags = new Map();
  for (const f of flags) if (f.unitId) { const a = unitFlags.get(f.unitId) ?? []; a.push(f); unitFlags.set(f.unitId, a); }
  for (const u of units) {
    const v = byId.get(u.id);
    if (!v) { problems.push(`판정 없음: ${u.id} [${u.page}] ${u.text.slice(0, 60)}`); continue; }
    if (v.text !== undefined && v.text !== u.text) problems.push(`판정의 글자가 목록과 다름(다른 판본을 봤음): ${u.id}`);
    if (!ALL_VERDICTS.has(v.verdict)) { problems.push(`판정 이름 틀림: ${u.id} ${v.verdict}`); continue; }
    if (v.verdict === "ACCEPTED") problems.push(`검사자는 ACCEPTED를 쓸 수 없음(사람이 accept로): ${u.id}`);
    if (!CHECKS_RE.test(v.checks ?? "")) { problems.push(`checks 형식 틀림(${CLASS_COUNT}자 o/x/-): ${u.id} "${v.checks}"`); continue; }
    const fl = unitFlags.get(u.id) ?? [];
    for (const f of fl) for (const c of f.classes) { const n = Number(c.slice(1)); if (v.checks[n - 1] === "-") problems.push(`기계 표시(${f.rule})된 ${c}를 해당 없음(-)으로 건너뜀: ${u.id} "${u.text.slice(0, 50)}"`); }
    if (v.checks.includes("x") && v.verdict === "OK") problems.push(`문제(x)가 있는데 OK: ${u.id}`);
    if (!v.checks.includes("x") && (v.verdict === "FALSE" || v.verdict === "INACCURATE")) problems.push(`결함 판정인데 x가 없음: ${u.id}`);
    const ev = String(v.evidence ?? "");
    if (v.verdict === "OK") {
      if (ev.length < EVIDENCE_MIN_CHARS) problems.push(`근거가 너무 짧음: ${u.id}`);
      if (!EVIDENCE_TYPES.some((t) => ev.includes(t))) problems.push(`근거 종류 없음: ${u.id}`);
      const rules = new Set(fl.map((f) => f.rule));
      for (const r of rules) if (FLAG_EVIDENCE[r] && !FLAG_EVIDENCE[r].some((t) => ev.includes(t))) problems.push(`${r} 표시 단위의 근거에 ${FLAG_EVIDENCE[r].join("/")} 중 하나가 필요: ${u.id} "${u.text.slice(0, 50)}"`);
      if (/EDIT:/.test(ev) && !EVIDENCE_TYPES.filter((t) => t !== "EDIT:").some((t) => ev.includes(t)) && [...rules].some((r) => NO_EDIT_RULES.has(r))) problems.push(`사실 주장 표시(${[...rules].filter((r) => NO_EDIT_RULES.has(r)).join(",")})가 있는 단위를 EDIT:로만 통과시킬 수 없음: ${u.id}`);
      if (rules.has("L-NUM")) {
        const nums = (u.text.match(NUMBER_TOKEN_RE) ?? []).filter((n) => /\d/.test(n));
        const missing = nums.filter((n) => !ev.includes(n.replace(/^[-−+]/, "")));
        if (missing.length) problems.push(`숫자 ${missing.join(",")}가 근거에 안 나옴(숫자마다 근거): ${u.id}`);
      }
      const r = evidence_resolve(ev, root, invIds);
      for (const p of r.problems) problems.push(`${p}: ${u.id}`);
    }
    if (v.verdict === "UNVERIFIED" && !/tried:/i.test(ev)) problems.push(`UNVERIFIED인데 시도 기록(tried: …)이 없음: ${u.id}`);
    if ((v.verdict === "FALSE" || v.verdict === "INACCURATE") && !String(v.problem ?? "").trim()) problems.push(`결함 판정에 problem이 없음: ${u.id}`);
  }
  const disposed = new Map();
  for (const f of verdicts.flags ?? []) { if (disposed.has(f.key)) problems.push(`같은 표시 처분이 두 번: ${f.key}`); disposed.set(f.key, f); }
  const pageNames = new Set(inv.pages.map((p) => p.page));
  const flagPage = (f) => (pageNames.has(f.page) ? f.page : "_common");
  for (const f of flags) {
    if (f.unitId) continue;
    if (pages && !pages.includes(flagPage(f))) continue;
    const d = disposed.get(f.key);
    if (!d) { problems.push(`처분 안 된 페이지 표시: ${f.key} ${f.rule} ${String(f.detail).slice(0, 80)}`); continue; }
    if (!ALL_VERDICTS.has(d.verdict) || d.verdict === "ACCEPTED") problems.push(`표시 처분 판정 이름 틀림: ${f.key} ${d.verdict}`);
    if (d.verdict === "OK" && UNDISPOSABLE_RULES.has(f.rule)) problems.push(`${f.rule}은 OK로 처분할 수 없음: ${f.key}`);
    if (d.verdict === "OK" && (String(d.note ?? "").length < EVIDENCE_MIN_CHARS || !EVIDENCE_TYPES.some((t) => String(d.note).includes(t)))) problems.push(`표시 처분 OK의 근거 부족: ${f.key} ${f.rule}`);
  }
  if (pages) problems.push(`(참고) 범위 한정 검사: ${pages.join(",")} — 최종 완결은 범위 없이 다시 돌릴 것`);
  return problems;
}

/**
 * 클래스 전문가(B1~B6)의 판정 파일 검사. 담당 클래스를 **모든 단위**에 대해 적었는지(표시 없는 단위 포함),
 * 담당 규칙의 페이지 표시를 모두 처분했는지, 담당 클래스에 x가 있으면 결함 판정·problem이 있는지,
 * 담당 표시가 붙은 단위의 통과 근거가 근거 문법을 지키는지.
 */
export function verdicts_validate_role(verdicts, inv, flags, { pages = null, root = REPO_ROOT, role }) {
  const problems = [];
  const classes = ROLE_CLASSES[role] ?? [];
  const rules = new Set(ROLE_RULES[role] ?? []);
  const allUnits = [...inv.common, ...inv.pages.flatMap((p) => p.units)];
  const invIds = new Set(allUnits.map((u) => u.id));
  const units = allUnits.filter((u) => !pages || pages.includes(u.page));
  const byId = new Map((verdicts.units ?? []).map((v) => [v.id, v]));
  const unitFlags = new Map();
  for (const f of flags) if (f.unitId) { const a = unitFlags.get(f.unitId) ?? []; a.push(f); unitFlags.set(f.unitId, a); }
  if (classes.length) for (const u of units) {
    const v = byId.get(u.id);
    if (!v) { problems.push(`${role}: 판정 없음(표시 없는 단위도 담당 클래스를 본다): ${u.id} ${u.text.slice(0, 50)}`); continue; }
    if (!CHECKS_RE.test(v.checks ?? "")) { problems.push(`${role}: checks 형식 틀림: ${u.id}`); continue; }
    const fl = (unitFlags.get(u.id) ?? []).filter((f) => f.classes.some((c) => classes.includes(Number(c.slice(1)))));
    for (const f of fl) for (const c of f.classes) { const n = Number(c.slice(1)); if (classes.includes(n) && v.checks[n - 1] === "-") problems.push(`${role}: 표시된 ${c}를 -로 건너뜀: ${u.id}`); }
    const hasX = classes.some((n) => v.checks[n - 1] === "x");
    if (hasX && !["FALSE", "INACCURATE"].includes(v.verdict)) problems.push(`${role}: 담당 클래스에 x가 있는데 결함 판정이 아님: ${u.id}`);
    if (hasX && !String(v.problem ?? "").trim()) problems.push(`${role}: problem 없음: ${u.id}`);
    if (!hasX && v.verdict === "UNVERIFIED" && !/tried:/i.test(String(v.evidence ?? ""))) problems.push(`${role}: UNVERIFIED인데 tried: 없음: ${u.id}`);
    if (!hasX && v.verdict !== "UNVERIFIED") {
      const ev = String(v.evidence ?? "");
      for (const r of new Set(fl.map((f) => f.rule))) if (FLAG_EVIDENCE[r] && !FLAG_EVIDENCE[r].some((t) => ev.includes(t))) problems.push(`${role}: ${r} 표시 단위의 근거에 ${FLAG_EVIDENCE[r].join("/")} 필요: ${u.id}`);
      if (fl.length) for (const p of evidence_resolve(ev, root, invIds).problems) problems.push(`${role}: ${p}: ${u.id}`);
    }
  }
  const disposed = new Map((verdicts.flags ?? []).map((f) => [f.key, f]));
  for (const f of flags) {
    if (f.unitId || !rules.has(f.rule) || (pages && !pages.includes(inv.pages.some((p) => p.page === f.page) ? f.page : "_common"))) continue;
    const d = disposed.get(f.key);
    if (!d) problems.push(`${role}: 처분 안 된 담당 표시 ${f.key} ${f.rule} ${String(f.detail).slice(0, 70)}`);
    else if (d.verdict === "OK" && (String(d.note ?? "").length < EVIDENCE_MIN_CHARS || !EVIDENCE_TYPES.some((t) => String(d.note).includes(t)))) problems.push(`${role}: 표시 처분 OK의 근거 부족 ${f.key}`);
    else if (d.verdict === "OK" && UNDISPOSABLE_RULES.has(f.rule)) problems.push(`${role}: ${f.rule}은 OK로 처분 불가`);
  }
  return problems;
}

/** 여러 검사자의 판정 파일을 단위마다 합친다: checks는 x 우선, 판정은 가장 나쁜 것, 근거·문제는 모두 이어 붙인다. */
export function verdicts_combine(files) {
  const rank = { FALSE: 4, INACCURATE: 3, UNVERIFIED: 2, OK: 1 };
  const units = new Map();
  const flags = new Map();
  const findings = [];
  for (const { who, data } of files) {
    for (const v of data.units ?? []) {
      const cur = units.get(v.id);
      if (!cur) { units.set(v.id, { ...v, by: [who], checks: v.checks }); continue; }
      const merged = [...cur.checks].map((ch, i) => (ch === "x" || v.checks?.[i] === "x" ? "x" : ch === "o" || v.checks?.[i] === "o" ? "o" : "-")).join("");
      const worse = (rank[v.verdict] ?? 0) > (rank[cur.verdict] ?? 0);
      units.set(v.id, { ...cur, checks: merged, verdict: worse ? v.verdict : cur.verdict, evidence: [cur.evidence, v.evidence].filter(Boolean).join(" ‖ "), problem: [cur.problem, v.problem].filter(Boolean).join(" ‖ ") || undefined, fix: [cur.fix, v.fix].filter(Boolean).join(" ‖ ") || undefined, by: [...cur.by, who] });
    }
    for (const f of data.flags ?? []) {
      const cur = flags.get(f.key);
      if (!cur || (rank[f.verdict] ?? 0) > (rank[cur.verdict] ?? 0)) flags.set(f.key, { ...f, by: who });
    }
    for (const f of data.findings ?? []) findings.push({ ...f, by: who });
  }
  return { units: [...units.values()], flags: [...flags.values()], findings };
}

/** 지금 목록 중 장부에 통과로 없는 단위(근거 파일이 바뀌었거나 가리킨 단위가 무효인 것 포함). */
export function ledger_find_todo(ledger, inv, root = REPO_ROOT) {
  const units = [...inv.common, ...inv.pages.flatMap((p) => p.units)];
  const invIds = new Set(units.map((u) => u.id));
  const ok = (id, seen = new Set()) => {
    const e = ledger?.units?.[id];
    if (!e || !PASS_VERDICTS.has(e.verdict) || !invIds.has(id)) return false;
    if (e.verdict === "ACCEPTED" && (!e.by || !e.reason)) return false;
    for (const [path, sha] of Object.entries(e.deps ?? {})) { const f = path_resolve(root, path); if (!existsSync(f) || file_sha(f) !== sha) return false; }
    if (seen.has(id)) return true;
    seen.add(id);
    return (e.siteRefs ?? []).every((ref) => ok(ref, seen));
  };
  return units.filter((u) => !ok(u.id));
}

/** 장부에 통과로 처분되지 않은 페이지 표시. */
export function ledger_find_flag_todo(ledger, flags) {
  return flags.filter((f) => !f.unitId && !PASS_VERDICTS.has(ledger?.flags?.[f.key]?.verdict));
}

function args_read(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i]; else out._.push(argv[i]);
  return out;
}

function main() {
  const args = args_read(process.argv.slice(2));
  const [cmd, a, b, c] = args._;
  const ledger = ledger_read() ?? ledger_empty();
  const readJson = (p) => JSON.parse(readFileSync(resolve(p), "utf8"));
  if (cmd === "validate" || cmd === "merge") {
    const verdicts = readJson(a), inv = readJson(b), flags = readJson(c);
    const pages = args.pages ? args.pages.split(",") : null;
    const role = args.role ?? "A";
    if (cmd === "validate" && role !== "A") {
      const problems = verdicts_validate(verdicts, inv, flags, { pages, role });
      for (const p of problems.slice(0, 300)) console.log(`  ✗ ${p}`);
      console.log(problems.length ? `${role} 완결성 위반 ${problems.length}건` : `${role} 완결성 통과`);
      if (problems.length) process.exitCode = 1;
      return;
    }
    if (cmd === "merge" && pages) { console.error("merge는 범위 한정 없이 전체 판정 파일로만 한다"); process.exitCode = 1; return; }
    const problems = verdicts_validate(verdicts, inv, flags, { pages });
    const real = problems.filter((p) => !p.startsWith("(참고)"));
    for (const p of problems.slice(0, 300)) console.log(`  ✗ ${p}`);
    if (cmd === "validate") { console.log(real.length ? `완결성 위반 ${real.length}건` : "완결성 통과"); if (real.length) process.exitCode = 1; return; }
    if (real.length) { console.log(`완결성 위반 ${real.length}건 — 장부에 아무것도 넣지 않았다`); process.exitCode = 1; return; }
    const today = new Date().toISOString().slice(0, 10);
    const runId = createHash("sha256").update(readFileSync(resolve(a))).digest("hex").slice(0, 12);
    const invIds = new Set([...inv.common, ...inv.pages.flatMap((p) => p.units)].map((u) => u.id));
    let n = 0;
    for (const v of verdicts.units ?? []) {
      if (!invIds.has(v.id)) continue;
      const r = v.verdict === "OK" ? evidence_resolve(v.evidence, REPO_ROOT, invIds) : { deps: {}, siteRefs: [] };
      ledger.units[v.id] = { page: v.page, kind: v.kind, text: v.text, verdict: v.verdict, checks: v.checks, evidence: v.evidence, problem: v.problem || undefined, deps: r.deps, siteRefs: r.siteRefs, run: runId, date: today };
      n += 1;
    }
    for (const f of verdicts.flags ?? []) { ledger.flags[f.key] = { rule: f.rule, verdict: f.verdict, note: f.note, run: runId, date: today }; n += 1; }
    ledger.runs.push({ run: runId, date: today, auditors: verdicts.meta?.auditors ?? null, promptHash: verdicts.meta?.promptHash ?? null, units: (verdicts.units ?? []).length });
    ledger_write(ledger);
    console.log(`장부에 ${n}건 반영(run ${runId})`);
    return;
  }
  if (cmd === "combine") {
    // combine <출력.json> <판정1.json> <판정2.json> …
    const files = args._.slice(2).map((f) => ({ who: f.replace(/^.*[\\/]/, "").replace(/\.json$/, ""), data: readJson(f) }));
    writeFileSync(resolve(a), `${JSON.stringify(verdicts_combine(files), null, 1)}\n`);
    console.log(`합침: ${files.length}개 → ${a}`);
    return;
  }
  if (cmd === "widget") {
    const [slug, runtimePath, verdict, evidence] = [a, b, c, args._[4]];
    const runtime = readJson(runtimePath);
    const w = runtime.pages.flatMap((p) => p.widgets ?? []).find((x) => x.name === slug);
    if (!w) { console.error(`runtime.json에 위젯 ${slug}이 없다`); process.exitCode = 1; return; }
    if (!ALL_VERDICTS.has(verdict) || verdict === "ACCEPTED") { console.error("판정 이름 틀림"); process.exitCode = 1; return; }
    if (verdict === "OK" && (!evidence || !/TEST:|CALC:/.test(evidence))) { console.error("위젯 OK에는 TEST:/CALC: 근거(전 상태 대조)가 필요"); process.exitCode = 1; return; }
    ledger.widgets[slug] = { sourceHash: widget_hash_source(REPO_ROOT, slug), verdict, evidence, distinctStates: w.distinctStates, templates: w.templates.length, date: new Date().toISOString().slice(0, 10) };
    ledger_write(ledger);
    console.log(`위젯 ${slug}: ${verdict}, 소스 ${ledger.widgets[slug].sourceHash}`);
    return;
  }
  if (cmd === "accept") {
    if (!args.by || !args.reason) { console.error("accept에는 --by <이름> --reason \"이유\"가 필요(사람이 결정한 미결만)"); process.exitCode = 1; return; }
    const target = ledger.units[a] ?? ledger.flags[a];
    if (!target) { console.error(`장부에 ${a}가 없다 — 먼저 검사 판정이 merge돼야 한다`); process.exitCode = 1; return; }
    Object.assign(target, { verdict: "ACCEPTED", by: args.by, reason: args.reason, acceptedOn: new Date().toISOString().slice(0, 10) });
    ledger_write(ledger);
    console.log(`${a}: ACCEPTED (${args.by})`);
    return;
  }
  if (cmd === "todo") {
    const inv = readJson(a);
    const todo = ledger_find_todo(ledger, inv);
    const flagTodo = b ? ledger_find_flag_todo(ledger, readJson(b)) : [];
    const byPage = {};
    for (const u of todo) byPage[u.page] = (byPage[u.page] ?? 0) + 1;
    console.log(`검사 안 된 단위 ${todo.length}개`, byPage, `· 처분 안 된 페이지 표시 ${flagTodo.length}개`);
    if (args.list) for (const u of todo) console.log(`  ${u.id} [${u.page}] ${u.text.slice(0, 100)}`);
    return;
  }
  if (cmd === "prune") {
    const inv = readJson(a);
    const live = new Set([...inv.common, ...inv.pages.flatMap((p) => p.units)].map((u) => u.id));
    const before = Object.keys(ledger.units).length;
    for (const id of Object.keys(ledger.units)) if (!live.has(id)) delete ledger.units[id];
    if (b) { const keys = new Set(readJson(b).map((f) => f.key)); for (const k of Object.keys(ledger.flags)) if (!keys.has(k)) delete ledger.flags[k]; }
    ledger_write(ledger);
    console.log(`장부 단위 ${before} → ${Object.keys(ledger.units).length}`);
    return;
  }
  console.log("쓰는 법: validate|merge <verdicts> <inventory> <lint> · widget <slug> <runtime> <판정> \"근거\" · accept <id> --by 이름 --reason 이유 · todo <inventory> [lint] [--list 1] · prune <inventory> [lint]");
}

if (cli_is_main(import.meta.url)) main();
