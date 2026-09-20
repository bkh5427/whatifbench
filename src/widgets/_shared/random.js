/**
 * 위젯 공통 — 시드 기반 난수.
 *
 * `Math.random`을 쓰지 않는 이유는 하나다: 공유한 URL이 매번 다른 그림을 내면
 * 본문이 인용하는 숫자를 독자가 확인할 수 없다.
 * 시드는 URL 상태에 실리고, 같은 시드는 언제나 같은 수열을 낸다.
 *
 * 알고리즘은 mulberry32. 32비트 상태이므로 통계용이지 암호용이 아니다.
 */

import { num_clamp_value } from './numbers.js';

export const RNG_SEED_MIN = 1;
export const RNG_SEED_MAX = 99999999; // 날짜 형식(YYYYMMDD) 시드가 범위 안에 들어온다

const RNG_STEP = 0x6d2b79f5;
const RNG_SHIFT_A = 15;
const RNG_SHIFT_B = 7;
const RNG_SHIFT_C = 14;
const RNG_MIX_A = 1;
const RNG_MIX_B = 61;
const RNG_UINT32_RANGE = 4294967296;

/** 시드를 유효범위 안의 정수로. */
export function rng_clamp_seed(value) {
  return Math.round(num_clamp_value(value, RNG_SEED_MIN, RNG_SEED_MAX));
}

/**
 * 시드로 결정되는 [0, 1) 난수 발생기를 만든다.
 * 수열 자체가 골든 벡터 테스트로 고정돼 있다 — 상수를 바꾸면 과거에 공유된
 * URL의 곡선이 조용히 달라지므로, 바꾸려면 테스트를 먼저 봐라.
 */
export function rng_create_seeded(seed) {
  let state = rng_clamp_seed(seed) | 0;
  return function rng_read_next() {
    state = (state + RNG_STEP) | 0;
    let t = Math.imul(state ^ (state >>> RNG_SHIFT_A), RNG_MIX_A | state);
    t = (t + Math.imul(t ^ (t >>> RNG_SHIFT_B), RNG_MIX_B | t)) ^ t;
    return ((t ^ (t >>> RNG_SHIFT_C)) >>> 0) / RNG_UINT32_RANGE;
  };
}
