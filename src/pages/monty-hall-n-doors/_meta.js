/**
 * 이 글이 스스로 밝히는 것. 글·도해와 같은 폴더에 있다.
 *
 * 왜 여기 두는가: 분류를 바꾸거나 홈을 재배치할 때 **글은 건드리지 않는다.**
 * 배치 기준은 `src/data/layout.js`가 갖고, 이 파일은 사실만 적는다.
 *
 * `src/data/tools.js`가 이것을 읽어 목록을 만든다. 명시적 import다 —
 * glob으로 모으면 순서가 파일 시스템에 달리고, 관련 도구 동점 처리가 흔들린다.
 */
export const meta = {
  slug: "monty-hall-n-doors",
  category: "chance",
  name: "Monty Hall with N doors",
  // 기호를 쓰지 않는다: 카드는 홈·형제 페이지에도 실리고, 거기에는 N·R의 정의가 없다.
  blurb:
    "Move the door count and the number of doors the host opens. The model puts switching ahead of staying by the doors you did not pick, divided by the doors you could still swap to — two to one at three doors. Opening more doors raises that edge; adding doors without opening more lowers it.",
  // 태그 축은 둘이다: 무엇을 다루나(도메인) · 어디서 만나나(상황).
  // 허용 목록은 `src/data/tags.js`에 있고 게이트가 대조한다.
  tags: ["probability", "counterintuitive", "simulation", "abstract"],
  grade: "A",
  since: "2026-09-06",
  updated: "2026-09-25",
  changed:
    "Full fact audit: the 1975 Selvin citations corrected to letters to the editor, the host-rule sentence given its missing condition, and two diagram colours taken off the verdict palette.",
  figure: { value: "0.667", label: "the model's switch win rate at three doors" },
  published: true,
};
