// 사실 검사의 "실행 목록" — 브라우저로 dist를 띄워서 **실행해야만 보이는 것**을 뽑는다.
//   1) 위젯: 앞의 두 슬라이더는 **모든 조합**(종속 범위 포함), 나머지 입력은 경계·기본값 조합, 프리셋 버튼 전부.
//      상태마다 화면 글자·aria·aria-pressed·캔버스 글자(좌표 포함)를 모아 숫자를 {#}로 바꾼 "문형"으로 묶는다.
//      상태별 전체 출력은 states-<page>.jsonl에 남긴다(숫자 대조 시험의 입력).
//   2) 붙은 글자: 요소 경계에서 공백 없이 만나는 글자 조각(글자-글자는 간격과 무관하게, 그 밖은 화면에서 붙을 때).
//   3) 색-뜻 표: 도해 글자·도형·범례의 실제 계산된 색과 그 글자.
//   4) 환경: 강제 색 모드(고대비)에서 범례 색이 살아 있는지, JS를 끈 독자에게 본문이 가리키는 위젯이 있는지.
//   5) 스크린숏: 페이지 전체(390·1280폭), 도해 하나하나, 위젯 기본 상태, 강제 색 모드.
//
//   PLAYWRIGHT_MODULE=/절대경로/playwright/index.mjs [CHROMIUM_PATH=…] node scripts/audit/runtime-scan.mjs <dist> <출력폴더>
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, readdirSync, createWriteStream } from "node:fs";
import { join, extname, resolve } from "node:path";
import { inventory_list_pages } from "./inventory.mjs";

// ── 상수 ───────────────────────────────────────────────────
const VIEWPORTS = [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 900 }];
/** 경계 격자의 비율 지점(끝값·끝 바로 안쪽·사분점). 기본값은 따로 넣는다. */
const BOUNDARY_FRACTIONS = [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1];
/** 앞 두 슬라이더를 전수로 돌릴 상태 수 상한. 넘으면 경계 격자만. */
const EXHAUSTIVE_LIMIT = 12000;
/** 경계 격자 상태 수 상한(입력이 많을 때 지점 수를 줄인다 — 끝값 0·1은 항상 남긴다). */
const BOUNDARY_LIMIT = 800;
/** input 경로(지연 갱신)와 change 경로가 같은 결과를 내는지 표본으로 확인하는 상태 수·대기 시간. */
const INPUT_PATH_SAMPLES = 12;
const INPUT_PATH_WAIT_MS = 400;
/** 이보다 좁게 붙은 조각은 "붙음"(px). */
const GLUE_GAP_PX = 2;
const NUMBER_RE = /[-−+]?\d[\d,]*(?:\.\d+)?/g;
const TEMPLATE_EXAMPLES = 8;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };

const DIST = resolve(process.argv[2] ?? "dist");
const OUT = resolve(process.argv[3] ?? "audit-out");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH;

function server_start() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const candidates = [join(DIST, path), join(DIST, path, "index.html"), join(DIST, `${path}.html`)];
    const file = candidates.find((p) => existsSync(p) && statSync(p).isFile());
    if (!file) { res.writeHead(404, { "content-type": "text/html" }); res.end(existsSync(join(DIST, "404.html")) ? readFileSync(join(DIST, "404.html")) : "404"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ── 브라우저 쪽 코드 ────────────────────────────────────────
const CANVAS_HOOK = `(() => {
  window.__canvasLog = [];
  const P = CanvasRenderingContext2D.prototype;
  const fillText = P.fillText, stroke = P.stroke, fill = P.fill, fillRect = P.fillRect, beginPath = P.beginPath, moveTo = P.moveTo, lineTo = P.lineTo, rect = P.rect;
  const box = (ctx) => (ctx.__box ??= { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const grow = (ctx, x, y) => { const b = box(ctx); b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); };
  const bbox = (ctx) => { const b = box(ctx); return Number.isFinite(b.x0) ? [Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1)].join(",") : ""; };
  P.beginPath = function (...a) { this.__box = null; return beginPath.apply(this, a); };
  P.moveTo = function (x, y) { grow(this, x, y); return moveTo.call(this, x, y); };
  P.lineTo = function (x, y) { grow(this, x, y); return lineTo.call(this, x, y); };
  P.rect = function (x, y, w, h) { grow(this, x, y); grow(this, x + w, y + h); return rect.call(this, x, y, w, h); };
  P.fillText = function (text, x, y, ...rest) { window.__canvasLog.push({ op: "text", text: String(text), color: String(this.fillStyle), x: Math.round(x), y: Math.round(y) }); return fillText.call(this, text, x, y, ...rest); };
  P.stroke = function (...a) { window.__canvasLog.push({ op: "stroke", color: String(this.strokeStyle), dash: this.getLineDash().join(","), width: this.lineWidth, box: bbox(this) }); return stroke.apply(this, a); };
  P.fill = function (...a) { window.__canvasLog.push({ op: "fill", color: String(this.fillStyle), box: bbox(this) }); return fill.apply(this, a); };
  P.fillRect = function (x, y, w, h) { window.__canvasLog.push({ op: "fillRect", color: String(this.fillStyle), box: [x, y, x + w, y + h].map(Math.round).join(",") }); return fillRect.call(this, x, y, w, h); };
})();`;

function browser_find_glued(gapPx) {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.data.trim()) { nodes.push(null); continue; }
    const p = n.parentElement;
    if (!p || p.closest("script,style,noscript")) { nodes.push(null); continue; }
    const style = getComputedStyle(p);
    if (style.display === "none" || style.visibility === "hidden") { nodes.push(null); continue; }
    nodes.push(n);
  }
  // <sub>/<sup> 안의 글자는 화면에 그려지는 보통 글자다 — 걸러내면 그 뒤 노드까지 같이
  // 버려져서 `</sub>` 경계에 붙은 글자를 영원히 못 본다. 대신 경계의 방향을 본다.
  const subOf = (n) => n.parentElement?.closest("sub,sup") ?? null;
  const blockOf = (n) => {
    for (let el = n.parentElement; el; el = el.parentElement) {
      if (el instanceof SVGElement && el.tagName.toLowerCase() === "text") return el;
      const d = getComputedStyle(el).display;
      if (!d.startsWith("inline") && d !== "contents") return el;
    }
    return document.body;
  };
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    if (!a || !b) continue;
    if (blockOf(a) !== blockOf(b)) continue;
    // 첨자로 **들어가는** 경계는 공백이 없는 것이 정상 조판이다 (P<sub>stay</sub>).
    // 첨자에서 **나오는** 경계는 본다 — `</sub>` 뒤에 빠진 공백이 바로 그것이다.
    if (subOf(b) && subOf(b) !== subOf(a)) continue;
    const endA = a.data.slice(-1), startB = b.data.charAt(0);
    if (/\s/.test(endA) || /\s/.test(startB)) continue;
    if (/[(\[“‘"'\/]/.test(endA) || /[.,;:!?)\]”’"'\/…%]/.test(startB)) continue;
    const letterLetter = /[\p{L}\p{N}%)×]/u.test(endA) && /[\p{L}\p{N}]/u.test(startB);
    const ra = document.createRange(); ra.setStart(a, a.data.length - 1); ra.setEnd(a, a.data.length);
    const rb = document.createRange(); rb.setStart(b, 0); rb.setEnd(b, 1);
    const A = ra.getBoundingClientRect(), B = rb.getBoundingClientRect();
    if (!A.width || !B.width) continue;
    const sameLine = Math.abs(A.top - B.top) < Math.max(A.height, B.height) / 2;
    const gap = B.left - A.right;
    if (sameLine && (letterLetter || (gap > -gapPx && gap < gapPx))) out.push({ left: a.data.slice(-30), right: b.data.slice(0, 30), gap: Math.round(gap * 10) / 10, kind: letterLetter ? "letters" : "punct" });
  }
  // 한 텍스트 노드 안에서 마침표 뒤 공백 없이 대문자(붙은 문장)
  for (const n of nodes) if (n && /[a-z0-9%)][.!?][A-Z][a-z]/.test(n.data)) out.push({ left: n.data.slice(0, 40), right: "(한 노드 안 붙은 문장)", gap: 0, kind: "sentence" });
  return out;
}

function browser_color_map() {
  const rows = [];
  document.querySelectorAll("figure").forEach((fig, index) => {
    fig.querySelectorAll("svg text").forEach((t) => rows.push({ where: `figure#${index} text`, color: getComputedStyle(t).fill, text: t.textContent.trim() }));
    fig.querySelectorAll("svg rect, svg path, svg circle, svg line, svg polygon, svg ellipse").forEach((s) => {
      const cs = getComputedStyle(s);
      const g = s.closest("g");
      const label = g?.querySelector("text")?.textContent.trim() ?? "";
      if (cs.fill && cs.fill !== "none") rows.push({ where: `figure#${index} fill`, color: cs.fill, text: label });
      if (cs.stroke && cs.stroke !== "none") rows.push({ where: `figure#${index} stroke`, color: cs.stroke, text: label });
    });
  });
  document.querySelectorAll("[class*=legend], [class*=swatch], [class*=key]").forEach((el) => {
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, "::before");
    const color = before.backgroundColor && before.backgroundColor !== "rgba(0, 0, 0, 0)" ? before.backgroundColor : cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : cs.color;
    rows.push({ where: `legend .${el.className}`, color, text: (el.textContent || "").trim().slice(0, 80) });
  });
  return rows;
}

/** 위젯 하나의 현재 상태 스냅숏. */
function browser_widget_snapshot(index) {
  const root = document.querySelectorAll("[data-widget]")[index];
  if (!root) return null;
  const lines = root.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
  const attrs = [];
  root.querySelectorAll("*").forEach((el) => {
    for (const a of ["aria-label", "aria-valuetext", "title", "alt", "aria-description", "aria-pressed", "aria-checked"]) if (el.hasAttribute(a)) attrs.push(`[${a}${a.startsWith("aria-p") || a.startsWith("aria-c") ? `:${(el.textContent || "").trim().slice(0, 30)}` : ""}] ${el.getAttribute(a)}`);
  });
  const log = window.__canvasLog || [];
  const canvas = log.filter((e) => e.op === "text").map((e) => `[canvas ${e.color} @${e.x},${e.y}] ${e.text}`);
  const strokes = [...new Set(log.filter((e) => e.op === "stroke").map((e) => `${e.color}|dash:${e.dash || "solid"}|w:${e.width}`))];
  // 그리기 기록(선·채움의 색·모양·범위). "그 구간에는 아무것도 안 그린다" 같은 본문 서술을 대조하는 데 쓴다.
  const draws = log.filter((e) => e.op !== "text").map((e) => `${e.op} ${e.color}${e.dash !== undefined ? ` dash:${e.dash || "solid"} w:${e.width}` : ""} [${e.box}]`);
  return { lines, attrs, canvas, strokes, draws, url: location.search };
}

/** 위젯 입력 목록. */
function browser_widget_controls(index) {
  const root = document.querySelectorAll("[data-widget]")[index];
  const out = [];
  root.querySelectorAll("input, select").forEach((el, i) => {
    const type = el.tagName === "SELECT" ? "select" : el.type;
    if (type === "range" || type === "number") out.push({ i, type, id: el.id, min: +el.min, max: +el.max, step: +(el.step || 1), value: +el.value });
    else if (type === "select") out.push({ i, type, id: el.id, options: [...el.options].map((o) => o.value), value: el.value });
    else if (type === "checkbox") out.push({ i, type, id: el.id, value: el.checked });
    else if (type === "radio") out.push({ i, type, id: el.id, name: el.name, value: el.checked, option: el.value });
  });
  return out;
}

/** 입력을 차례로 설정한다. c = {i, abs} | {i, frac} | {i, option} | {i, checked}. 마지막에 로그를 비우고 마지막 입력으로 다시 그린다. */
async function browser_set_state({ index, settings, useInput }) {
  const root = document.querySelectorAll("[data-widget]")[index];
  const els = root.querySelectorAll("input, select");
  const fire = (el) => {
    if (useInput) el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  let last = null;
  for (const c of settings) {
    const el = els[c.i];
    if (!el) continue;
    if (el.tagName === "SELECT") el.value = c.option;
    else if (el.type === "checkbox" || el.type === "radio") el.checked = c.checked;
    else {
      const min = +el.min, max = +el.max, step = +(el.step || 1);
      const raw = c.abs !== undefined ? c.abs : min + c.frac * (max - min);
      const v = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
    }
    fire(el);
    last = el;
  }
  window.__canvasLog = [];
  if (last) last.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  return els && [...els].map((e) => (e.type === "checkbox" || e.type === "radio" ? `${e.id || e.name}=${e.checked}` : `${e.id || e.name || "in"}=${e.value}`)).join("&");
}

// ── 위젯 스윕 ───────────────────────────────────────────────
async function widget_sweep(page, index, statesFile, viewportName, exhaustive) {
  const controls = await page.evaluate(browser_widget_controls, index);
  const ranges = controls.filter((c) => c.type === "range" || c.type === "number");
  const others = controls.filter((c) => !(c.type === "range" || c.type === "number"));
  const templates = new Map();
  const strokeSet = new Set();
  const visited = new Set();
  const record = (snapshot, label) => {
    if (!snapshot || visited.has(label)) return;
    visited.add(label);
    snapshot.strokes.forEach((s) => strokeSet.add(s));
    statesFile?.write(`${JSON.stringify({ viewport: viewportName, state: label, ...snapshot })}\n`);
    for (const line of [...snapshot.lines, ...snapshot.attrs, ...snapshot.canvas]) {
      const prefix = (line.match(/^\[[^\]]*\]\s*/) || [""])[0];
      const cleanPrefix = prefix.replace(/ @-?\d+,-?\d+\]/, "]");
      const template = cleanPrefix + line.slice(prefix.length).replace(NUMBER_RE, "{#}");
      const entry = templates.get(template) ?? { template, states: 0, examples: [] };
      entry.states += 1;
      if (entry.examples.length < TEMPLATE_EXAMPLES && !entry.examples.some((e) => e.text === line)) entry.examples.push({ text: line, state: label });
      templates.set(template, entry);
    }
  };
  const run = async (settings, useInput = false) => {
    const label = await page.evaluate(browser_set_state, { index, settings, useInput });
    record(await page.evaluate(browser_widget_snapshot, index), label);
    return label;
  };
  record(await page.evaluate(browser_widget_snapshot, index), "default");

  // 1) 앞 두 범위 입력: 전수(종속 범위는 앞 입력을 정한 뒤 읽는다)
  let exhaustiveDone = 0;
  if (exhaustive && ranges.length >= 1) {
    const a = ranges[0];
    const aCount = Math.floor((a.max - a.min) / a.step) + 1;
    // 종속 범위의 최대 크기는 앞 입력을 최댓값에 두고 읽는다.
    await run([{ i: a.i, abs: a.max }]);
    const bAtMax = ranges[1] ? (await page.evaluate(browser_widget_controls, index)).find((c) => c.i === ranges[1].i) : null;
    const bMaxCount = bAtMax ? Math.floor((bAtMax.max - bAtMax.min) / bAtMax.step) + 1 : 1;
    if (aCount * bMaxCount <= EXHAUSTIVE_LIMIT) {
      for (let va = a.min; va <= a.max; va += a.step) {
        await run([{ i: a.i, abs: va }]);
        if (!ranges[1]) { exhaustiveDone += 1; continue; }
        const b = (await page.evaluate(browser_widget_controls, index)).find((c) => c.i === ranges[1].i);
        for (let vb = b.min; vb <= b.max; vb += b.step) { await run([{ i: a.i, abs: va }, { i: b.i, abs: vb }]); exhaustiveDone += 1; }
      }
    }
  }
  // 2) 모든 입력의 경계 격자
  let fractions = BOUNDARY_FRACTIONS;
  const choicesFor = (c, fr) => (c.type === "select" ? c.options.map((o) => ({ i: c.i, option: o })) : c.type === "checkbox" || c.type === "radio" ? [{ i: c.i, checked: true }, { i: c.i, checked: false }] : [{ i: c.i, abs: c.value }, ...fr.map((f) => ({ i: c.i, frac: f }))]);
  const count = (fr) => controls.reduce((n, c) => n * choicesFor(c, fr).length, 1);
  while (fractions.length > 2 && count(fractions) > BOUNDARY_LIMIT) fractions = fractions.filter((f, k) => f === 0 || f === 1 || k % 2 === 1).slice(0, fractions.length - 1);
  const grid = [];
  (function combine(k, acc) {
    if (grid.length >= BOUNDARY_LIMIT) return;
    if (k === controls.length) { grid.push(acc); return; }
    for (const ch of choicesFor(controls[k], fractions)) combine(k + 1, [...acc, ch]);
  })(0, []);
  for (const settings of grid) await run(settings);
  // 3) 버튼(프리셋 등)
  const buttons = await page.$$(`[data-widget] >> nth=${index} >> button`).catch(() => []);
  const allButtons = await page.$$eval("[data-widget]", (roots, idx) => roots[idx].querySelectorAll("button").length, index);
  for (let bIdx = 0; bIdx < allButtons; bIdx++) {
    await page.evaluate(({ index, bIdx }) => { window.__canvasLog = []; document.querySelectorAll("[data-widget]")[index].querySelectorAll("button")[bIdx].click(); }, { index, bIdx });
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    const name = await page.evaluate(({ index, bIdx }) => document.querySelectorAll("[data-widget]")[index].querySelectorAll("button")[bIdx].innerText.trim(), { index, bIdx });
    record(await page.evaluate(browser_widget_snapshot, index), `button:${name}`);
  }
  void buttons;
  // 4) input 경로(지연 갱신) 표본 — change 경로와 결과가 같아야 한다
  const mismatches = [];
  for (let s = 0; s < Math.min(INPUT_PATH_SAMPLES, grid.length); s++) {
    const settings = grid[Math.floor((s * grid.length) / INPUT_PATH_SAMPLES)];
    await page.evaluate(browser_set_state, { index, settings, useInput: false });
    // change 경로도 같은 시간을 기다린다. 배지처럼 최소 체류 시간(≈344 ms)이 있는
    // 표시는 2프레임 뒤에 아직 앞 상태를 보인다 — 그걸 불일치로 세면 도구의 산물이다.
    await page.waitForTimeout(INPUT_PATH_WAIT_MS);
    const viaChange = await page.evaluate(browser_widget_snapshot, index);
    await page.evaluate(browser_set_state, { index, settings, useInput: true });
    await page.waitForTimeout(INPUT_PATH_WAIT_MS);
    const viaInput = await page.evaluate(browser_widget_snapshot, index);
    if (JSON.stringify(viaChange.lines) !== JSON.stringify(viaInput.lines)) mismatches.push({ settings, change: viaChange.lines.slice(0, 5), input: viaInput.lines.slice(0, 5) });
  }
  return { index, controls, exhaustiveStates: exhaustiveDone, distinctStates: visited.size, templates: [...templates.values()], strokes: [...strokeSet], inputPathMismatches: mismatches };
}

// ── 실행 ───────────────────────────────────────────────────
mkdirSync(join(OUT, "shots"), { recursive: true });
const server = await server_start();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
const report = { dist: DIST, pages: [] };
for (const { page: path } of inventory_list_pages(DIST)) {
  const slug = path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "_");
  const entry = { page: path, glued: [], colors: [], widgets: [], shots: [], consoleErrors: [], environments: [] };
  let statesStream = null;
  const statesFile = { write: (line) => { statesStream ??= createWriteStream(join(OUT, `states-${slug}.jsonl`)); statesStream.write(line); } };
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await context.addInitScript(CANVAS_HOOK);
    const page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") entry.consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => entry.consoleErrors.push(String(e)));
    await page.goto(base + path, { waitUntil: "networkidle" });
    const full = join(OUT, "shots", `${slug}-${vp.name}.png`);
    await page.screenshot({ path: full, fullPage: true });
    entry.shots.push(full);
    for (const g of await page.evaluate(browser_find_glued, GLUE_GAP_PX)) if (!entry.glued.some((x) => x.left === g.left && x.right === g.right)) entry.glued.push({ ...g, viewport: vp.name });
    if (vp.name === "desktop") {
      entry.colors = await page.evaluate(browser_color_map);
      const figs = await page.$$("figure");
      for (let f = 0; f < figs.length; f++) {
        const shot = join(OUT, "shots", `${slug}-figure${f}.png`);
        await figs[f].screenshot({ path: shot }).catch(() => {});
        entry.shots.push(shot);
      }
    }
    const widgetCount = await page.$$eval("[data-widget]", (r) => r.length);
    for (let w = 0; w < widgetCount; w++) {
      if (vp.name === "desktop") {
        const shot = join(OUT, "shots", `${slug}-widget${w}.png`);
        await (await page.$$("[data-widget]"))[w].screenshot({ path: shot }).catch(() => {});
        entry.shots.push(shot);
      }
      const result = await widget_sweep(page, w, statesFile, vp.name, vp.name === "desktop");
      const name = await page.$$eval("[data-widget]", (r, i) => r[i].getAttribute("data-widget"), w);
      const existing = entry.widgets.find((x) => x.name === name);
      if (!existing) entry.widgets.push({ name, ...result, viewports: [vp.name] });
      else {
        existing.viewports.push(vp.name);
        for (const t of result.templates) {
          const e = existing.templates.find((x) => x.template === t.template);
          if (e) e.states += t.states; else existing.templates.push({ ...t, onlyIn: vp.name });
        }
        existing.distinctStates += result.distinctStates;
        existing.exhaustiveStates += result.exhaustiveStates;
        existing.inputPathMismatches.push(...result.inputPathMismatches);
      }
    }
    await context.close();
  }
  statesStream?.end();
  // 환경: 강제 색 모드 / JS 끔
  if (entry.widgets.length || entry.colors.length) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: "active" });
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "networkidle" });
    const shot = join(OUT, "shots", `${slug}-forced-colors.png`);
    await page.screenshot({ path: shot, fullPage: true });
    entry.shots.push(shot);
    const legend = await page.evaluate(browser_color_map);
    const legendColors = legend.filter((r) => r.where.startsWith("legend")).map((r) => r.color);
    if (legendColors.length > 1 && new Set(legendColors).size === 1) entry.environments.push({ name: "forced-colors", note: `범례 색이 모두 ${legendColors[0]} 하나로 같아져 범례가 뜻을 잃음 (${shot})` });
    else entry.environments.push({ name: "forced-colors", note: null, shot });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(base + path, { waitUntil: "load" });
    const text = await page.evaluate(() => document.body.innerText);
    const hasWidgetMount = await page.$$eval("[data-widget]", (r) => r.map((x) => x.innerText.trim().length));
    const refs = (text.match(/\b(the chart|the slider|the sliders|the button|the table below|the readout|press the)\b/gi) ?? []).length;
    if (hasWidgetMount.length && hasWidgetMount.every((n) => n === 0) && refs) entry.environments.push({ name: "no-js", note: `JS를 끄면 위젯이 비어 있는데 본문이 위젯을 ${refs}번 가리킴(<noscript> 안내 없음: ${text.includes("JavaScript") ? "안내 있음" : "안내 없음"})` });
    await ctx.close();
  }
  report.pages.push(entry);
  const ws = entry.widgets.map((w) => `${w.name}: 전수 ${w.exhaustiveStates}·서로 다른 상태 ${w.distinctStates}·문형 ${w.templates.length}·input경로 불일치 ${w.inputPathMismatches.length}`).join("; ");
  console.log(`${path}: 붙은글자 ${entry.glued.length}, 색 ${entry.colors.length}, 위젯 ${ws || "-"}, 환경 ${entry.environments.filter((e) => e.note).length}, 콘솔오류 ${entry.consoleErrors.length}`);
}
await browser.close();
server.close();
writeFileSync(join(OUT, "runtime.json"), JSON.stringify(report, null, 1));
console.log(`→ ${join(OUT, "runtime.json")}`);
