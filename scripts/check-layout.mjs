/**
 * 배치 겹침 검사. 홈·카테고리 인덱스를 폭 320~1920px(16px 간격)로 열어
 * 그림 칸과 글 칸이 겹치는지, 그림이 제 칸을 벗어나는지, 가로 스크롤이 생기는지 본다.
 * 2026-09-25: 대표 카드의 그림이 폭 944px에서 글 위로 넘친 일이 있었다 — 그 재발 방지.
 * 실행: dist를 아무 정적 서버로 띄운 뒤
 *   PLAYWRIGHT_MODULE=/절대경로/playwright/index.mjs node scripts/check-layout.mjs http://localhost:4399
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const BASE = process.argv[2] ?? 'http://localhost:4399';
const WIDTH_MIN = 320, WIDTH_MAX = 1920, WIDTH_STEP = 16;
const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const bad = [];
for (const url of ['/', '/chance/']) for (let w = WIDTH_MIN; w <= WIDTH_MAX; w += WIDTH_STEP) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(BASE + url);
  const r = await p.evaluate(() => {
    const out = [];
    const box = (el) => el.getBoundingClientRect();
    const ov = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    // 대표 카드: 그림(svg)이 글 칸과 겹치는가, 제 칸을 벗어나는가
    for (const f of document.querySelectorAll('.feature')) {
      const svg = box(f.querySelector('.feature-thumb svg')), cell = box(f.querySelector('.feature-thumb')), copy = box(f.querySelector('.feature-copy'));
      if (ov(svg, copy)) out.push('feature svg∩copy');
      if (svg.right > cell.right + 0.5 || svg.left < cell.left - 0.5) out.push('feature svg outside cell');
    }
    // 첫 화면 판: 그림과 글
    for (const h of document.querySelectorAll('.hero-panel')) {
      const art = h.querySelector('.hero-art'), text = h.querySelector('.hero-panel-text');
      if (art && ov(box(art), box(text))) out.push('hero art∩text');
    }
    // 카드: 썸네일과 본문
    for (const c of document.querySelectorAll('.tool-card')) {
      const t = c.querySelector('.thumb'), body = c.querySelector('.tool-body');
      if (t && ov(box(t), box(body))) out.push('card thumb∩body');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('horizontal scroll');
    // 스티키 머리말이 앵커 착지 여백(scroll-padding-top)보다 높으면 착지한 제목이 가린다
    const headH = document.querySelector('.site-head').getBoundingClientRect().height;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    if (headH > pad) out.push(`header ${Math.round(headH)}px > scroll-padding ${Math.round(pad)}px`);
    return out;
  });
  if (r.length) bad.push(`${url} @${w}: ${[...new Set(r)].join(', ')}`);
  await p.close();
}
await b.close();
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('겹침 없음');
