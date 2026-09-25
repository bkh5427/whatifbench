// 컴포넌트가 문장을 조립할 때 쓰는 순수 함수. DOM도 Astro도 모른다.
// .astro 프론트매터에 두면 vitest가 import하지 못해 테스트를 붙일 수 없다 —
// 그래서 여기로 뺀다.

/** 마지막 항목 앞의 접속사. 그 앞은 전부 쉼표. */
const LIST_CONJUNCTION = " and ";
const LIST_COMMA = ", ";
/** 첫 항목 앞. 앞 문장과 붙지 않게 공백 하나. */
const LIST_LEAD = " ";

/**
 * 영문 목록의 항목 앞에 붙일 구분자를 고른다.
 *
 * 1개  → "A"
 * 2개  → "A and B"
 * 3개+ → "A, B and C"
 *
 * `index > 0 ? " and " : " "`로 두면 3개에서 "A and B and C"가 된다.
 * 카테고리는 `CATEGORY_MAX_BEFORE_HEADER_CHANGE`가 4를 계획하고 있어
 * 지금은 안 보이지만 예정된 결함이다.
 */
export function prose_format_separator(index, total) {
  if (index <= 0) return LIST_LEAD;
  return index === total - 1 ? LIST_CONJUNCTION : LIST_COMMA;
}

/** 목록 전체를 한 문자열로. 구분자 규칙이 하나뿐임을 보이는 대조 경로다. */
export function prose_format_list(items) {
  return items.map((item, index) => prose_format_separator(index, items.length) + item).join("");
}

/**
 * "Read next"가 빌 때의 첫 구절. **사실이어야 한다** — 비는 이유가 셋이고
 * 문장이 다르다.
 *  ① 아직 발행 전이다 → 카테고리 인덱스에 이 도구가 없다.
 *     "Nothing **else** sits in X"는 "이 도구는 X에 있다"를 전제하므로 거짓이 된다
 *  ② 발행됐고 형제도 있는데 점수가 0이라 아무것도 안 붙었다
 *  ③ 발행됐는데 그 카테고리에 다른 발행 도구가 없다
 *
 * `RelatedTools.astro` 안에 있던 것을 여기로 옮겼다. .astro는 vitest가 import하지
 * 못해 산출물로만 검사할 수 있었는데, 미발행 페이지는 이제 아예 빌드되지 않으므로
 * ①을 산출물에서 만들 수 없다 — 저장소가 망가져야만 나오는 상태다.
 */
export function prose_format_fallback_lead(published, siblingCount) {
  if (!published) return "Nothing here links into ";
  return siblingCount > 0 ? "Nothing here pairs closely with the rest of " : "Nothing else sits in ";
}

/**
 * 목록 끝의 마침표. 마지막 항목이 이미 문장 부호로 끝나면 붙이지 않는다.
 *
 * 2026-09-24 전수검사: /about의 "Finished so far: … One Line or Many?**?.**" —
 * 도구 이름이 물음표로 끝나는데 목록 끝 마침표를 그대로 붙여 "?." 이 찍혔다.
 * 셋째 도구를 발행한 날 처음 생긴 결함이다.
 */
const LIST_TERMINALS = [".", "?", "!", "\u2026"];
export function prose_format_period(lastItem) {
  const text = String(lastItem ?? "").trimEnd();
  return LIST_TERMINALS.some((mark) => text.endsWith(mark)) ? "" : ".";
}
