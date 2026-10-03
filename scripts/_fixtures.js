// 테스트 **사이**에서 공유하는 붙박이. 테스트 파일에서 테스트 파일을 import하면
// 그쪽 `describe`가 통째로 한 번 더 돌아 집계가 부풀고 시간이 두 배가 된다
// (실제로 42건이 중복 집계됐다). 그래서 붙박이만 여기로 뺀다.

/** 규약을 지키는 최소 도구 페이지 HTML. over로 한 조각씩 망가뜨려 시험한다. */
export function fixture_format_article(over = {}) {
  const blocks = over.blocks ?? [
    ["reversal", "The count moves, the answer does not"],
    ["howto", "Reading the chart"],
    ["math", "Why the ratio holds"],
    ["byhand", "One case worked on paper"],
    ["assumptions", "What the model holds fixed"],
    ["limits", "Where the model stops"],
    ["about", "About this page"],
  ];
  const body = blocks
    .map(([role, title]) => `<h2 data-block="${role}">${title}</h2><p>One short line of prose.</p>`)
    .join("");
  // `figures`는 **전부**의 수다. 그중 첫 장은 위젯 앞에 놓인다 (S7).
  const figures = Math.max((over.figures ?? 3) - 1, 0);
  const figs = Array.from(
    { length: figures },
    (_, i) =>
      `<figure class="fig"><svg viewBox="0 0 420 ${over.figHeight ?? 120}"></svg>` +
      `<figcaption>Figure ${i + 1} shows one case.</figcaption></figure>`
  ).join("");
  // 위젯 **앞** 도해 한 장 — 규약 §5.5 S7. 가로 띠여야 한다 (§1.5).
  const leadFig = over.leadFig === null ? "" :
    `<figure class="fig"><svg viewBox="0 0 ${over.leadFigW ?? 420} ${over.leadFigH ?? 120}"></svg>` +
    `<figcaption>The rule, drawn once.</figcaption></figure>`;
  return (
    `<!DOCTYPE html><html><body><main>` +
    `<h1>A clean tool</h1><p class="deck">${over.deck ?? "One line that says why to read."}</p>` +
    `<p>Last reviewed: 2026-01-02</p>` +
    `<p>${over.lead ?? "A finished page with nothing pending."}</p>` +
    leadFig +
    `<div data-widget="clean-tool"></div>` +
    figs +
    body +
    `<ul class="sources"><li>A source.</li></ul>` +
    `</main></body></html>`
  );
}

