/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * 배치 기준은 `src/data/layout.js`가 갖고, 이 파일은 사실만 적는다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 */
export const meta = {
  slug: "one-line-or-many",
  category: "chance",
  name: "One Line or Many?",
  blurb:
    "A single queue against one queue per counter, on average wait and on a bad visit (the 95th percentile).",
  tags: ["probability", "counterintuitive", "queueing", "errands"],
  grade: "A",
  since: "2026-09-25",
  updated: "2026-09-25",
  changed: "",
  // 5.4배는 창구 4개·80% 바쁨에서만 참이다 — 창구 2개면 2.3배, 8개면 14.0배.
  figure: {
    value: "5.4×",
    label: "the model's cut in mean wait from one line, at four counters 80% busy",
  },
  published: true,
};
