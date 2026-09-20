/**
 * 태그 허용 목록. 자유 입력이면 오타로 태그가 갈라지고, 갈라지면 관련 도구가
 * 조용히 나빠진다 (`CRUMB` 대소문자가 실제로 그렇게 갈렸다).
 *
 * 축은 **둘뿐이다.** 다섯 개 후보에 도구 10개를 전부 채워 본 결과,
 * 나머지 셋은 값이 갈리지 않았다 — 값이 갈리지 않는 축은 쓸모가 없다.
 */

/** 무엇을 다루나. 관련 도구 점수의 주 신호다. */
export const TAGS_DOMAIN = [
  "probability",
  "counterintuitive",
  "simulation",
  "aggregation",
  "queueing",
  "rates",
  "energy",
  "distance",
  "log-axis",
  "mechanics",
  "waves",
  "exponential",
];

/**
 * 어디서 만나나. 홈을 "집에서 쓰는 계산기" 같은 묶음으로 재배치할 때 쓴다.
 * 글은 그대로 두고 `layout.js`의 기준만 바꾸면 된다 — 이 축이 있는 이유다.
 */
export const TAGS_SITUATION = ["home", "commute", "outdoors", "errands", "space", "abstract"];

export const TAGS_ALLOWED = [...TAGS_DOMAIN, ...TAGS_SITUATION];

/** 한 글에 상황 태그는 정확히 하나다. 둘이면 묶음이 겹쳐 배치가 모호해진다. */
export const TAGS_SITUATION_REQUIRED = 1;

/** 허용 목록에 없는 태그를 돌려준다. 빈 배열이면 깨끗하다. */
export function tags_check_unknown(tags = []) {
  return tags.filter((t) => !TAGS_ALLOWED.includes(t));
}

/**
 * 도메인 축 태그만 골라낸다. 관련 도구 점수는 이것만 센다.
 *
 * **"상황이 아닌 것"으로 정의한다** — `TAGS_DOMAIN`에 있는 것으로 정의하면,
 * 새 도메인 태그를 허용 목록에 넣는 것을 잊었을 때 점수에서 조용히 빠진다.
 * 허용 목록 위반은 `tags_check_unknown`이 따로 잡는다. 둘의 일이 다르다.
 */
export function tags_read_domain(tags = []) {
  return tags.filter((t) => !TAGS_SITUATION.includes(t));
}

/** 상황 축 태그만 골라낸다. 배치(`layout.js`)가 쓴다. */
export function tags_read_situation(tags = []) {
  return tags.filter((t) => TAGS_SITUATION.includes(t));
}
