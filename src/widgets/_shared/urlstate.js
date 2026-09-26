/**
 * 위젯 공통 — URL 쿼리스트링 상태.
 *
 * 계정도 서버도 없으므로 상태는 주소창에만 산다. localStorage에 두지 않는다.
 * 링크를 복사한 사람이 같은 그림을 봐야 본문의 숫자를 확인할 수 있다.
 */

import { num_read_decimal } from './numbers.js';

/**
 * 쿼리스트링에서 숫자 상태를 읽는다.
 *
 * spec: { 키: { fallback, clamp? } }
 *   fallback — 파라미터가 없거나 깨졌을 때 돌아갈 값. **최솟값이 아니라 기본값이다.**
 *   clamp    — (값) => 값. 유효범위로 자르는 함수. 없으면 그대로 둔다.
 *
 * clamp는 fallback에도 적용된다. 기본값이 자기 유효범위 밖이면 로드 즉시 잘리는데,
 * 그 사고를 여기서 한 번에 드러나게 하는 편이 낫다.
 */
export function urlstate_read_numbers(search, spec) {
  const params = new URLSearchParams(search ?? '');
  const state = {};
  for (const [key, rule] of Object.entries(spec)) {
    const raw = num_read_decimal(params.get(key), rule.fallback);
    state[key] = rule.clamp ? rule.clamp(raw) : raw;
  }
  return state;
}

/**
 * 현재 상태를 주소창에 쓴다. **히스토리를 쌓지 않는다** —
 * 슬라이더를 한 번 끌 때마다 뒤로가기 항목이 수십 개 생기면 안 된다.
 * 다른 쿼리 파라미터(utm 등)는 건드리지 않는다.
 */
// 주소를 바꿀 수 없는 문서(srcdoc·about:blank)의 프로토콜
const URLSTATE_BLOCKED_PROTOCOL = 'about:';

export function urlstate_write(state) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  // srcdoc·샌드박스 iframe(미리보기 창 등)에서는 replaceState가 SecurityError를 던져
  // 위젯 갱신이 중간에 끊긴다. 그런 문서는 주소가 about:이거나 origin이 'null'이다.
  // 주소창 기록은 부가 기능이므로 그런 곳에서는 건너뛴다.
  if (window.location.protocol === URLSTATE_BLOCKED_PROTOCOL || window.origin === 'null') return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(state)) params.set(key, String(value));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}
