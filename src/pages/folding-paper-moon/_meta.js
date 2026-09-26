/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다(스테이징 값).
 */
export const meta = {
  slug: "folding-paper-moon",
  category: "scale",
  name: "Folding Paper to the Moon",
  blurb: "Doubling thickness, on a linear axis and a log axis. The same numbers, two different stories.",
  grade: "A",
  since: "2026-09-26",
  updated: "2026-09-26",
  changed: "",
  tags: ["exponential", "log-axis", "counterintuitive", "abstract"],
  // 42는 기본 두께 0.1 mm에서만 참이다 — 0.05 mm면 43, 0.5 mm면 40.
  // 조건을 라벨에 넣지 않으면 카드가 두께와 무관한 상수처럼 읽힌다.
  figure: { value: "42", label: "folds until the model's stack passes the Moon, at 0.1\u00a0mm paper" },
  published: true,
};
