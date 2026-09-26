/**
 * 첫 화면 삽화(`src/art/<name>.svg`). 홈은 "home", 카테고리 인덱스는 카테고리 key를 쓴다.
 * 원본은 `scripts/build-art.mjs`가 만든다.
 */
import { svg_prepare_inline } from "./thumb.js";

const ART_FILES = import.meta.glob("../art/*.svg", { query: "?raw", import: "default", eager: true });
const ART_PATH_PATTERN = /\/art\/([^/]+)\.svg$/;

export const ARTS = Object.fromEntries(
  Object.entries(ART_FILES).map(([path, raw]) => [path.match(ART_PATH_PATTERN)[1], raw]),
);

/** 이름이 있는 삽화 목록. 게이트(테스트)가 열린 카테고리마다 있는지 본다. */
export function art_read_names() {
  return Object.keys(ARTS);
}

/** 인라인 마크업. 없으면 null — 그 자리는 그림 없이 선다. */
export function art_read_markup(name) {
  return ARTS[name] ? svg_prepare_inline(ARTS[name]) : null;
}
