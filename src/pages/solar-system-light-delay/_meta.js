/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다(스테이징 값).
 */
export const meta = {
  slug: "solar-system-light-delay",
  category: "scale",
  name: "Talking Across the Solar System",
  blurb: "One-way and round-trip light delay as the planets move.",
  grade: "A",
  since: "2026-09-26",
  updated: "2026-09-26",
  changed: "",
  tags: ["distance", "log-axis", "space"],
  // requires: 거리 축이 로그다. 축을 먼저 읽고 오면 표가 다르게 보인다.
  requires: ["folding-paper-moon"],
  figure: { value: "4.82×", label: "the model’s swing in one-way delay to Mars, closest against farthest" },
  published: true,
};
