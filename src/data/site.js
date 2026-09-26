/**
 * 사이트가 자기를 소개하는 **한 벌의 말**. 홈 첫 화면과 공유 카드가 같은 문장을
 * 읽는다.
 *
 * 왜 따로 두는가: 2026-09-24 전수검사에서 기본 공유 카드(`og/default.png`)가
 * 사이트 어디에도 없는 두 문장("Move the slider. Watch the intuition break.",
 * "Drag a slider — the model answers.")을 싣고 있었다. 링크를 눌러 온 사람이
 * 카드에서 읽은 말을 페이지에서 찾을 수 없으면, 그것은 카드가 페이지를 대신
 * 약속한 것이다. 게다가 그 카드는 `/404`·`/contact`·`/about`·`/privacy`에도
 * 붙는데 그 페이지들에는 슬라이더가 없다.
 *
 * 그래서 문장을 여기 한 번만 적고, 홈(`pages/index.astro`)과 카드
 * (`scripts/build-og.mjs`)가 같은 상수를 읽는다. 한쪽만 바뀌는 일이 없다.
 */

/** 홈 h1 = 기본 공유 카드의 제목. */
export const SITE_HEADLINE = "Move the number and see what happens.";

/** 홈 h1 바로 아래 줄. 카드에는 넣지 않는다 — 카드 아래 줄은 주소만 싣는다. */
export const SITE_SUBLINE =
  "A worked example gives you one setting and one answer. Here you get the slider.";

export const SITE_NAME = "whatifbench";
export const SITE_DOMAIN = "whatifbench.com";

/** 머리말 워드마크 아래 작은 한 줄. 모든 도구가 움직일 수 있는 모델이라는 것만 말한다. */
export const SITE_TAGLINE = "Models you can move";
