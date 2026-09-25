// 검사 꾸러미 — 페이지마다 검사자에게 줄 한 장짜리 목록(마크다운)을 만든다.
// 모든 단위가 id와 함께 순서대로 있고, 기계 표시(lint)가 단위 옆에 붙는다.
// 검사자는 이 표의 **모든 줄**에 판정을 적어야 한다(빈 줄 = 검사 미완료).
//   node scripts/audit/packet.mjs <inventory.json> <lint.json> [runtime.json|-] <출력폴더> [ledger.json|-]
// ledger를 주면 이미 통과한 단위는 "(장부 통과)"로 표시만 하고 판정을 요구하지 않는다(증분 검사).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ── 상수 ───────────────────────────────────────────────────
/** 표 칸 글자 수 상한. 단위 글자는 자르지 않는다(자르면 뒤쪽 결함이 안 보인다). */
const CELL_LIMIT = 100000;
const PASS = new Set(["OK", "ACCEPTED"]);
/** 단위 판정자 한 명이 맡는 단위 수 상한과 경계 겹침(피로·문맥 손실 방지). */
const CHUNK_SIZE = 90;
const CHUNK_OVERLAP = 5;

const [invPath, lintPath, runtimePath, outDir, ledgerPath] = process.argv.slice(2);
const inv = JSON.parse(readFileSync(resolve(invPath), "utf8"));
const flags = JSON.parse(readFileSync(resolve(lintPath), "utf8"));
const runtime = runtimePath && runtimePath !== "-" && existsSync(runtimePath) ? JSON.parse(readFileSync(resolve(runtimePath), "utf8")) : null;
const ledger = ledgerPath && ledgerPath !== "-" && existsSync(ledgerPath) ? JSON.parse(readFileSync(resolve(ledgerPath), "utf8")) : null;
mkdirSync(resolve(outDir), { recursive: true });

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, CELL_LIMIT);
const flagsByUnit = new Map();
for (const f of flags) if (f.unitId) { const a = flagsByUnit.get(f.unitId) ?? []; a.push(f); flagsByUnit.set(f.unitId, a); }

function packet_write(name, title, units, extra) {
  const lines = [`# 검사 꾸러미 — ${title}`, "", extra.head ?? "", "", `단위 ${units.length}개. **모든 줄에 판정**(OK/FALSE/INACCURATE/UNVERIFIED + 근거)을 적는다.`, "", "| # | id | 종류 | 절 | 글자 | 기계 표시 |", "|---|---|---|---|---|---|"];
  units.forEach((u, i) => {
    const done = ledger?.units?.[u.id] && PASS.has(ledger.units[u.id].verdict);
    const fl = (flagsByUnit.get(u.id) ?? []).map((f) => `${f.rule}(${f.classes.join(",")})`).join(" ");
    lines.push(`| ${i + 1} | ${u.id} | ${u.kind}${u.where ? `:${u.where}` : ""}${u.figure !== undefined ? ` fig${u.figure}` : ""} | ${cell(u.section).slice(0, 40)} | ${cell(u.text)}${done ? " _(장부 통과)_" : ""} | ${cell(fl)} |`);
  });
  if (extra.pageFlags?.length) {
    lines.push("", "## 단위에 묶이지 않은 기계 표시 — 하나씩 처분할 것", "", "| key | 규칙 | 내용 |", "|---|---|---|");
    for (const f of extra.pageFlags) lines.push(`| ${f.key} | ${f.rule} | ${cell(typeof f.detail === "string" ? f.detail : f.detail.what).slice(0, 1200)} |`);
  }
  if (extra.unitFlagDetail?.length) {
    lines.push("", "## 단위 표시의 세부", "");
    for (const f of extra.unitFlagDetail) lines.push(`- ${f.unitId} ${f.rule}: ${typeof f.detail === "string" ? f.detail : f.detail.what}`);
  }
  if (extra.tail) lines.push("", extra.tail);
  writeFileSync(join(resolve(outDir), `${name}.md`), `${lines.join("\n")}\n`);
}

for (const p of inv.pages) {
  const rt = runtime?.pages.find((r) => r.page === p.page);
  const pageFlags = flags.filter((f) => !f.unitId && (f.page === p.page || f.detail?.page === p.page));
  const unitFlagDetail = flags.filter((f) => f.unitId && p.units.some((u) => u.id === f.unitId) && ["L-REF", "L-SIBLING", "L-CONSIST", "L-UNPUB"].includes(f.rule));
  const head = [
    `페이지: \`${p.page}\` · dist 파일: \`${inv.dist}${p.page === "/" ? "/index.html" : p.page === "/404" ? "/404.html" : `${p.page}/index.html`}\``,
    `위치 표지(단위 순번 기준): ${p.landmarks.filter((l) => l.type !== "h2").map((l) => `${l.type}${l.index !== undefined ? `#${l.index}` : ""}@${l.at}`).join(", ") || "없음"}`,
    rt ? `스크린숏: ${rt.shots.map((s) => `\`${s}\``).join(", ")}` : "스크린숏: 없음(runtime-scan 미실행)",
  ].join("\n\n");
  let tail = "";
  for (const w of rt?.widgets ?? []) {
    tail += `## 위젯 ${w.name} 실행 문형 — 서로 다른 상태 ${w.distinctStates}개(앞 두 입력 전수 ${w.exhaustiveStates}개 + 경계 격자 + 버튼, 폭 ${w.viewports.join("·")}), input 경로 불일치 ${w.inputPathMismatches.length}건\n\n`;
    tail += `입력: ${w.controls.map((c) => `${c.id || c.type}(${c.type}${c.min !== undefined ? ` 기본값 ${c.value}` : ""})`).join(" · ")} · 상태별 전체 출력: \`states-${p.page === "/" ? "home" : p.page.slice(1)}.jsonl\`\n\n캔버스 선: ${w.strokes.join(" ; ")}\n\n| 상태 수 | 문형 | 예시 |\n|---|---|---|\n`;
    for (const t of w.templates) tail += `| ${t.states}${t.onlyIn ? ` (${t.onlyIn}만)` : ""} | ${cell(t.template)} | ${cell(t.examples.map((e) => `"${e.text}" @${e.state}`).join(" ; "))} |\n`;
  }
  for (const e of rt?.environments ?? []) if (e.note) tail += `\n환경 ${e.name}: ${e.note}\n`;
  packet_write(p.page === "/" ? "home" : p.page.slice(1).replace(/\//g, "_"), p.page, p.units, { head, pageFlags, unitFlagDetail, tail });
  if (p.units.length > CHUNK_SIZE) console.log(`  ${p.page}: 단위 ${p.units.length}개 — 검사자 한 명에 ${CHUNK_SIZE}개 이하로 나눌 것(앞뒤 ${CHUNK_OVERLAP}줄 겹침)`);
}
// 어느 페이지에도 속하지 않는 표시(사이트 전체 "*", 배포 파일 "/og" 등)는 공통 꾸러미가 맡는다 — 주인 없는 표시가 없게.
const pageNames = new Set(inv.pages.map((p) => p.page));
const orphanFlags = flags.filter((f) => !f.unitId && !pageNames.has(f.page));
packet_write("_common", "공통 머리·꼬리·사이트 전체 파일 (모든 페이지)", inv.common, { head: "여러 페이지에 똑같이 나오는 nav/header/footer 글자, robots·사이트맵·CSS, 그리고 어느 페이지에도 속하지 않는 표시. 한 번만 판정한다.", pageFlags: orphanFlags });
console.log(`꾸러미 ${inv.pages.length + 1}개 → ${resolve(outDir)}`);
