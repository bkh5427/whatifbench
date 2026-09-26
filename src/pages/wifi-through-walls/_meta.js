/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다.
 * since·updated는 **발행하는 날, 운영자가 끝까지 읽은 뒤** 그 날짜로 적는다.
 */
export const meta = {
  slug: "wifi-through-walls",
  category: "scale",
  name: "Wi-Fi Through Walls",
  // 방향은 재질·두께가 정한다 — 콘크리트는 벌어지기만, 유리 11 mm는 좁혀서 뒤집는다.
  blurb: "Path loss by band and wall material. With the same power and antenna gain the model puts 5 GHz below 2.4 GHz with no walls at all, and the wall decides which way the gap moves from there.",
  grade: "B",
  since: "2026-09-26",
  updated: "2026-09-26",
  changed: "",
  tags: ["log-axis", "counterintuitive", "waves", "home"],
  // requires: 로그 축을 읽는 법 자체를 다루는 페이지가 folding-paper-moon이다.
  // 이 페이지의 x축은 로그이고, "거리 두 배마다 6.02 dB"라는 읽기법이 거기에 기댄다.
  requires: ["folding-paper-moon"],
  // 7.07은 등방성 안테나(두 대역 같은 이득)라는 규칙 1 아래에서만 참이다 — 조건을 라벨에 넣는다.
  figure: { value: "7.07 dB", label: "the model’s 5 GHz shortfall with no walls, at equal power and antenna gain" },
  published: true,
};
