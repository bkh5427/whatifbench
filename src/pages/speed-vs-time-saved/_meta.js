/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다(스테이징 값 —
 * 발행 스크립트가 운영자에게 발행일을 물어 이 두 줄을 바꾼다).
 */
export const meta = {
  slug: "speed-vs-time-saved",
  category: "motion",
  name: "How Little Time Speeding Saves",
  blurb: "Time saved against speed, with the fixed delays held constant on both sides.",
  grade: "A",
  since: "2026-10-04",
  updated: "2026-10-04",
  changed: "",
  tags: ["counterintuitive","rates","commute"],
  // 5.00분은 40→60 km/h · 10 km에서만 참이다 — 같은 +20이라도 70→90이면 1.90분이다.
  figure: {value: "5.00 min", label: "the model’s saving from 40 to 60 km/h over 10 km"},
  published: true,
};
