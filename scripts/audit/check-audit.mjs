// 푸시 게이트의 사실 검사 부분. check-publish.mjs의 gate_run이 부른다(Cloudflare 빌드에서도 돈다).
// 막는 것:
//   1) 배포될 모든 단위(문장·속성·메타·JSON-LD·링크·도해 도형·페이지 짜임·공유 카드·robots·사이트맵·CSS)가
//      장부에 통과로 없으면 — 새로 쓰였거나, 고쳐졌거나, 앞 문장이 바뀌었거나, 근거 파일이 바뀐 것
//   2) 정적 기계 표시(깨진 링크·구조·미공개 노출·공유 카드 불일치…) 중 처분 안 된 것
//   3) 위젯 소스(위젯 폴더·_shared·CSS)가 장부의 위젯 검사 뒤에 바뀐 것
//   4) 공유 카드 PNG·기록이 tools.js와 어긋난 것
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inventory_build } from "./inventory.mjs";
import { ledger_read, ledger_find_todo, ledger_find_flag_todo, PASS_VERDICTS } from "./ledger.mjs";
import { lint_run, widget_hash_source } from "./lint.mjs";

// ── 상수 ───────────────────────────────────────────────────
const SHOW_LIMIT = 8;
const LEDGER_REL = "audit/ledger.json";
const OG_MANIFEST_REL = "scripts/audit/og-manifest.json";

/**
 * @param {string} root  저장소 루트(site/)
 * @param {{TOOLS: object[], CATEGORIES: object[]}} data
 * @returns {string[]} 위반
 */
export function audit_run(root, { TOOLS, CATEGORIES = [] }) {
  const violations = [];
  // 미공개 도구의 공유 카드가 `public/og/`에 남아 있는지.
  // `public/`은 그대로 배포되므로 `/og/<slug>.png`를 누구나 받을 수 있다 —
  // `tools.js`가 적어 둔 "미공개는 사이트 어디에도 나오지 않는다"가 조용히 깨진다.
  // build-og.mjs는 공개된 도구만 새로 그리지만, **이미 있는 파일을 지우지는 않는다.**
  // 2026-09-25에 실제로 남아 있었다(미공개 도구 7개의 카드).
  const ogDir = join(root, "public/og");
  if (existsSync(ogDir)) {
    const allowed = new Set([...TOOLS.filter((t) => t.published).map((t) => `${t.slug}.png`), "default.png"]);
    const stray = readdirSync(ogDir).filter((n) => n.endsWith(".png") && !allowed.has(n));
    if (stray.length) {
      violations.push(
        `사실 검사: 미공개 도구의 공유 카드가 public/og/에 남아 있다 — 배포되면 /og/<slug>.png로 읽힌다: ${stray.join(", ")}`,
      );
    }
  }
  const dist = join(root, "dist");
  if (!existsSync(dist)) return [...violations, "사실 검사: dist가 없다 — 빌드 먼저"];
  const ledger = ledger_read(join(root, LEDGER_REL));
  if (!ledger) return [...violations, `사실 검사: 장부(${LEDGER_REL})가 없다 — 사실 전수검사 SKILL을 먼저 돌려 장부를 만들 것`];
  const manifestPath = join(root, OG_MANIFEST_REL);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

  const inv = inventory_build(dist, manifest);
  const show = (list, fmt) => list.slice(0, SHOW_LIMIT).map((x) => `      ${fmt(x)}`).join("\n") + (list.length > SHOW_LIMIT ? `\n      … 외 ${list.length - SHOW_LIMIT}개` : "");
  const todo = ledger_find_todo(ledger, inv, root);
  if (todo.length) violations.push(`사실 검사: 장부에 통과로 없는 단위 ${todo.length}개 — 그 단위만 다시 검사할 것(node scripts/audit/ledger.mjs todo … --list 1)\n${show(todo, (u) => `[${u.page}] ${u.kind}: ${u.text.slice(0, 90)}`)}`);

  const flags = lint_run(inv, null, { tools: TOOLS, categories: CATEGORIES, ogManifest: manifest, root, dist, staticOnly: true });
  const flagTodo = ledger_find_flag_todo(ledger, flags);
  if (flagTodo.length) violations.push(`사실 검사: 처분 안 된 기계 표시 ${flagTodo.length}개\n${show(flagTodo, (f) => `${f.rule} [${f.page}] ${String(f.detail).slice(0, 110)}`)}`);

  for (const tool of TOOLS.filter((t) => t.published)) {
    if (existsSync(join(root, "src/widgets", tool.slug))) {
      const now = widget_hash_source(root, tool.slug);
      const rec = ledger.widgets?.[tool.slug];
      if (!rec) violations.push(`사실 검사: 위젯 ${tool.slug}의 실행 검사(전 상태 스윕) 기록이 장부에 없다`);
      else if (rec.sourceHash !== now) violations.push(`사실 검사: 위젯 ${tool.slug} 소스(위젯·_shared·CSS)가 검사 뒤에 바뀌었다(${rec.sourceHash} → ${now}) — runtime-scan과 위젯 검사를 다시 할 것`);
      else if (!PASS_VERDICTS.has(rec.verdict)) violations.push(`사실 검사: 위젯 ${tool.slug} 판정이 ${rec.verdict}`);
    }
    const cat = CATEGORIES.find((c) => c.key === tool.category);
    const og = manifest?.[tool.slug];
    const png = join(root, "public/og", `${tool.slug}.png`);
    if (!existsSync(png)) violations.push(`사실 검사: 공유 카드 PNG가 없다(${tool.slug})`);
    if (!og) violations.push(`사실 검사: 공유 카드 기록이 없다(${tool.slug}) — node scripts/build-og.mjs`);
    else {
      if (cat && og.eyebrow !== cat.name) violations.push(`사실 검사: 공유 카드 분류 "${og.eyebrow}" ≠ 사이트 "${cat.name}" (${tool.slug})`);
      if (og.headline !== tool.name) violations.push(`사실 검사: 공유 카드 제목 "${og.headline}" ≠ "${tool.name}"`);
      if ((og.figureValue ?? null) !== (tool.figure?.value ?? null) || (og.figureLabel ?? null) !== (tool.figure?.label ?? null)) violations.push(`사실 검사: 공유 카드 숫자가 tools.js와 다르다(${tool.slug}) — build-og를 다시 돌릴 것`);
      if (existsSync(png) && createHash("sha256").update(readFileSync(png)).digest("hex") !== og.sha256) violations.push(`사실 검사: 공유 카드 PNG가 기록과 다르다(${tool.slug})`);
    }
  }
  return violations;
}
