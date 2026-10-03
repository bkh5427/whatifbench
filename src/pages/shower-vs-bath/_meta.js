/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다(스테이징 값 —
 * 2026-10-03 발행 지시에 맞춰 넣었고, 운영자가 프리뷰를 읽은 뒤 확정한다).
 */
export const meta = {
  slug: "shower-vs-bath",
  category: "energy",
  name: "Shower vs Bath",
  // 2026-10-03: "does not put the two in the same place"는 상승폭이 같으면 거짓이라 뺐다(독립 점검).
  blurb: "Water and heating energy on two panels sharing one time axis, each with its own crossing minute marked.",
  grade: "A",
  since: "2026-10-03",
  updated: "2026-10-03",
  changed: "",
  tags: ["rates", "energy", "home"],
  // 8.4분은 기본값(80 L 욕조, 9.5 L/min)에서만 참이다 — 조건을 라벨에 넣는다.
  figure: { value: "8.4 min", label: "the minute the model has a 9.5 L/min shower pass an 80 L bath" },
  published: true,
};
