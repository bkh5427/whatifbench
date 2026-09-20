/**
 * 홈이 글을 **어떤 기준으로 묶어 보여줄지**만 정한다.
 *
 * 왜 따로 두는가: 배치를 바꾸려고 글을 건드리는 일이 없어야 한다.
 * 각 글은 자기 폴더의 `_meta.js`에서 **사실만** 밝히고(카테고리·태그),
 * 그 사실을 어떻게 묶을지는 여기서 정한다. 재배치는 이 파일 하나를 고치는 일이다.
 *
 * 예 — "집에서 쓰는 계산기" 묶음을 만들려면 아래 배열에 한 줄 더한다:
 *   { key: "home", name: "Around the house",
 *     lede: "...", filter: (t) => (t.tags ?? []).includes("home") }
 * 글도, `tools.js`도, 페이지도 안 건드린다.
 */
import { CATEGORIES, tools_read_published } from "./tools.js";
import { INTROS } from "./category-intros.js";

/** 한 묶음에 카드가 이만큼을 넘으면 카테고리 인덱스로 넘긴다. 0이면 자르지 않는다. */
export const LAYOUT_SECTION_MAX = 6;
/** 전체 발행 수가 이보다 적으면 자르지 않는다 — 자를 것이 없다. */
export const LAYOUT_TRIM_THRESHOLD = 25;

/**
 * 지금의 묶음 기준: 카테고리 그대로.
 * 각 항목은 `{ key, name, href, lede, filter }`다. `filter`가 없으면 카테고리로 본다.
 */
export const HOME_SECTIONS = CATEGORIES.map((c) => ({
  key: c.key,
  name: c.name,
  href: c.href,
  lede: INTROS[c.key].description,
  filter: (tool) => tool.category === c.key,
}));

/**
 * 묶음마다 실제 도구 목록을 붙여 돌려준다. 순서는 `tools.js`의 배열 순서다 —
 * 정렬 근거가 코드에 없는 동안 "최신순"을 흉내내지 않는다.
 */
export function layout_read_sections(sections = HOME_SECTIONS) {
  const published = tools_read_published();
  const trim = published.length >= LAYOUT_TRIM_THRESHOLD && LAYOUT_SECTION_MAX > 0;
  return sections.map((section) => {
    const tools = published.filter(section.filter);
    return { ...section, tools: trim ? tools.slice(0, LAYOUT_SECTION_MAX) : tools, trimmed: trim };
  });
}
