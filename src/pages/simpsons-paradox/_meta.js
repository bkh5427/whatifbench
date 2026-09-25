/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * 배치 기준은 `src/data/layout.js`가 갖고, 이 파일은 사실만 적는다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 */
export const meta = {
  slug: "simpsons-paradox",
  category: "chance",
  name: "Simpson's Paradox Mixer",
  blurb:
    "Two groups where one option leads in each group, and trails once the model pools them.",
  tags: ["probability", "counterintuitive", "aggregation", "abstract"],
  grade: "A",
  since: "2026-09-25",
  updated: "2026-09-25",
  changed: "",
  // figure의 조건을 라벨에 넣는다 — 프리셋이 바뀌면 다른 값이 되는 수치다.
  figure: {
    value: "19.4 pp",
    label: "the model's pooled gap in the Berkeley preset, against a lead in both departments",
  },
  published: true,
};
