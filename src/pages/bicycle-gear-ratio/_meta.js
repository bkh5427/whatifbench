/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다(스테이징 값 —
 * 발행 스크립트가 운영자에게 발행일을 물어 이 두 줄을 바꾼다).
 */
export const meta = {
  slug: "bicycle-gear-ratio",
  category: "motion",
  name: "Bicycle Gear Ratios",
  blurb: "Gear inches, gain ratio and speed against cadence, with duplicate gears marked.",
  grade: "A",
  since: "2026-10-04",
  updated: "2026-10-04",
  changed: "",
  tags: ["rates","mechanics","outdoors"],
  // “6 of 22”는 허용오차 5%에서의 값이다. 중복은 정의마다 갈리므로 라벨에 조건을 넣는다.
  figure: {value: "6 of 22", label: "the combinations the model can drop at a 5% tolerance, on a 50/34 with 11–28"},
  published: true,
};
