/**
 * 썸네일 SVG 원문을 읽어 페이지에 박을 형태로 바꾼다.
 * Astro(`Thumb.astro`)와 테스트가 같은 함수를 쓴다.
 */

/** 글 폴더의 `_thumb.svg` 전부. 빌드 시점에 원문 문자열로 들어온다. */
const THUMB_FILES = import.meta.glob("../pages/*/_thumb.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** 경로 → slug. `../pages/<slug>/_thumb.svg` */
const THUMB_PATH_PATTERN = /\/pages\/([^/]+)\/_thumb\.svg$/;

/** 페이지에 박을 때 붙이는 속성. 장식이므로 보조기기와 탭 순서에서 뺀다. */
const THUMB_SVG_ATTRS = 'class="thumb-svg" aria-hidden="true" focusable="false"';

export const THUMBS = Object.fromEntries(
  Object.entries(THUMB_FILES).map(([path, raw]) => [path.match(THUMB_PATH_PATTERN)[1], raw]),
);

/** 썸네일이 있는 slug 목록. 발행 게이트가 읽는다. */
export function thumb_read_slugs() {
  return Object.keys(THUMBS);
}

/**
 * 인라인용 마크업. 주석을 걷고 `<svg`에 속성을 붙인다. 없으면 null.
 * width/height는 지운다 — 크기는 CSS가 정한다(16:10 상자를 채운다).
 */
export function thumb_read_markup(slug) {
  const raw = THUMBS[slug];
  return raw ? svg_prepare_inline(raw) : null;
}

/** SVG 원문 → 페이지에 박을 마크업. 썸네일과 첫 화면 삽화(`art.js`)가 같이 쓴다. */
export function svg_prepare_inline(raw) {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg\b[^>]*>/, (tag) =>
      tag.replace(/\s(width|height)="\d+"/g, "").replace(/^<svg\b/, `<svg ${THUMB_SVG_ATTRS}`),
    )
    .replace(/\n\s*\n/g, "\n")
    .trim();
}
