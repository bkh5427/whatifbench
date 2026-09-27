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

/**
 * RSS 피드 주소. 피드 파일(`pages/rss.xml.js`)과 모든 페이지 머리의
 * `<link rel="alternate">`가 이 한 값을 읽는다 — 둘이 갈라지면 구독 앱이 없는 주소를 찾는다.
 */
export const SITE_FEED_PATH = "/rss.xml";

/**
 * 검색엔진 소유 확인 값. 사이트가 우리 것임을 보이는 공개 값이다(비밀이 아니다).
 * 인증이 끝난 뒤에도 지우지 않는다 — 검색엔진이 나중에 다시 확인할 수 있다.
 * - 네이버 서치어드바이저: HTML 태그 방식(`<meta name="naver-site-verification">`).
 *   파일 방식을 쓰지 않는 이유: Cloudflare Pages가 `…​.html` 주소를 확장자 없는 주소로 넘긴다.
 */
export const SITE_VERIFY_NAVER = "eac6f012d223140f19d10fbe05e6babdc29f1840";
