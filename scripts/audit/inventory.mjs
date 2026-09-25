// 전수 목록 만들기. dist의 모든 HTML에서 단위를 뽑아 하나의 JSON으로 쓴다.
// 공통 머리·꼬리(nav/header/footer)는 "_common" 페이지로 한 번만 센다.
//   node scripts/audit/inventory.mjs [dist] [출력.json]
import { readFileSync, readdirSync, statSync, writeFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { units_extract } from "./html-units.mjs";

// ── 상수 ───────────────────────────────────────────────────
const SKIP_DIRS = new Set(["_astro", "og"]);

/** 명령줄로 직접 실행됐는가. 심볼릭 링크·Windows 드라이브 대소문자에도 맞게 실제 경로로 비교한다. */
export function cli_is_main(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    const a = realpathSync(process.argv[1]);
    const b = realpathSync(fileURLToPath(metaUrl));
    return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
}

/** dist 안의 HTML 페이지 경로 목록(`/`, `/about`, `/404` …). */
export function inventory_list_pages(dist) {
  const out = [];
  (function walk(dir, rel) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, `${rel}/${name}`); }
      else if (name === "index.html") out.push({ page: rel || "/", file: full });
      else if (name.endsWith(".html")) out.push({ page: `${rel}/${name.slice(0, -5)}`, file: full });
    }
  })(dist, "");
  return out.sort((a, b) => a.page.localeCompare(b.page));
}

/** 공유 카드 PNG의 글자. PNG는 기계가 못 읽으니 build-og가 남긴 기록(og-manifest)과 PNG 해시로 단위를 만든다. */
function og_card_unit(dist, page, ogUrl, manifest) {
  const name = (ogUrl.match(/\/og\/([^/?#]+)\.png/) || [])[1];
  if (!name) return null;
  const file = join(dist, "og", `${name}.png`);
  const sha = existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "(파일 없음)";
  const m = manifest?.[name];
  const text = m && m.sha256 === sha
    ? `공유 카드 ${name}.png: 분류 "${m.eyebrow}" · 제목 "${m.headline}"${m.figureValue ? ` · 숫자 "${m.figureValue}" · 설명 "${m.figureLabel}"` : ""}`
    : `공유 카드 ${name}.png: 기록 없음 또는 PNG가 기록과 다름 — 이미지를 직접 열어 글자를 읽을 것 (sha ${sha.slice(0, 16)})`;
  const id = createHash("sha1").update(`${page}\u0001og-card\u0001${text}\u0001${sha}`).digest("hex").slice(0, 12);
  return { id, page, kind: "og-card", section: "(meta)", block: "", text, where: `og/${name}.png`, order: -1 };
}

/** 모든 페이지의 단위. 공통 단위는 id가 같으면 한 번만 남긴다. manifest를 주면 공유 카드 단위를 붙인다. */
export function inventory_build(dist, manifest = null) {
  const pages = [];
  const common = new Map();
  for (const { page, file } of inventory_list_pages(dist)) {
    const r = units_extract(page, readFileSync(file, "utf8"));
    const own = [];
    for (const u of r.units) {
      if (u.page === "_common") { const c = common.get(u.id); if (c) c.pages.push(page); else common.set(u.id, { ...u, pages: [page] }); }
      else own.push(u);
    }
    const og = own.find((u) => u.kind === "og-image" && u.where === "og:image");
    const card = og ? og_card_unit(dist, page, og.text, manifest) : null;
    if (card) own.push(card);
    pages.push({ page, units: own, links: r.links, figures: r.figures, landmarks: r.landmarks, ids: r.ids });
  }
  // 사이트 전체 파일: robots.txt·사이트맵(글자 그대로), 전역 CSS(해시 — 색·배치가 바뀌면 다시 본다)
  const siteUnit = (kind, where, text) => ({ id: createHash("sha1").update(`_site\u0001${kind}\u0001${where}\u0001${text}`).digest("hex").slice(0, 12), page: "_common", kind, section: "(site)", block: "", text, where, order: -1, pages: ["*"] });
  const extra = [];
  const robots = join(dist, "robots.txt");
  if (existsSync(robots)) extra.push(siteUnit("site-file", "robots.txt", `robots.txt: ${readFileSync(robots, "utf8").replace(/\s+/g, " ").trim()}`));
  for (const name of readdirSync(dist).filter((n) => /^sitemap.*\.xml$/.test(n)).sort()) {
    const locs = [...readFileSync(join(dist, name), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    extra.push(siteUnit("site-file", name, `${name}: ${locs.join(" ")}`));
  }
  const astroDir = join(dist, "_astro");
  if (existsSync(astroDir)) {
    const h = createHash("sha256");
    for (const n of readdirSync(astroDir).filter((x) => x.endsWith(".css")).sort()) h.update(readFileSync(join(astroDir, n), "utf8").replace(/\r\n/g, "\n"));
    extra.push(siteUnit("style", "_astro/*.css", `전역 CSS sha ${h.digest("hex").slice(0, 16)} — 색·선·배치가 바뀌었다면 스크린숏으로 도해·범례·위젯의 색 뜻과 글자 겹침을 다시 볼 것`));
  }
  return { dist, pages, common: [...common.values(), ...extra] };
}

if (cli_is_main(import.meta.url)) {
  const dist = resolve(process.argv[2] ?? "dist");
  const out = resolve(process.argv[3] ?? "audit-inventory.json");
  const manifestPath = join(fileURLToPath(new URL(".", import.meta.url)), "og-manifest.json");
  const inv = inventory_build(dist, existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null);
  writeFileSync(out, JSON.stringify(inv, null, 1));
  const total = inv.pages.reduce((n, p) => n + p.units.length, 0) + inv.common.length;
  for (const p of inv.pages) console.log(`${p.page.padEnd(24)} ${String(p.units.length).padStart(4)}단위  링크 ${p.links.length}  도해 ${p.figures.length}`);
  console.log(`공통 ${inv.common.length}단위 · 합계 ${total}단위 → ${out}`);
}
