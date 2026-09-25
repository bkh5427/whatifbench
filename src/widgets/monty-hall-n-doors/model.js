/**
 * 몬티 홀 — 문 N개 일반화 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (확률). 참·거짓이 갈리므로 단위테스트로 고정한다.
 *
 * 규칙 가정:
 *   - 문 doorCount개 중 상품은 MONTY_PRIZE_COUNT개
 *   - 참가자가 MONTY_PLAYER_PICK_COUNT개를 먼저 고른다
 *   - 호스트는 상품 위치를 알고, 참가자가 고른 문과 상품이 있는 문을 제외한
 *     꽝 문만 openedCount개 연다
 *   - 참가자는 남은 미개봉 문 중 하나로 바꿀 수 있다
 */

import { num_clamp_value } from '../_shared/numbers.js';
import { rng_clamp_seed, rng_create_seeded } from '../_shared/random.js';

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ─────────────────
export const MONTY_DOOR_MIN = 3;
export const MONTY_DOOR_MAX = 100;
export const MONTY_DOOR_DEFAULT = 3;

export const MONTY_OPENED_MIN = 1;
export const MONTY_OPENED_DEFAULT = 1;

export const MONTY_TRIAL_MIN = 1000;
export const MONTY_TRIAL_MAX = 1000000;
export const MONTY_TRIAL_DEFAULT = 10000;

// 시드 유효범위는 `_shared/random.js`가 정한다. 여기 `MONTY_SEED_MIN/MAX`로
// 다시 두었었는데 아무도 읽지 않았다 — 같은 상수가 두 벌이면 나중에 죽은 쪽을
// 고치고 고쳤다고 믿게 된다. 범위 자체는 `model_clamp_seed`가 들고 있고,
// **기본 시드가 그 범위 안에 있는지**는 model.test.js가 리터럴로 못박는다.
export const MONTY_SEED_DEFAULT = 20260904;

// ── 게임 규칙 상수 ──────────────────────────────────────────
export const MONTY_PRIZE_COUNT = 1;        // 상품이 놓인 문의 수
export const MONTY_PLAYER_PICK_COUNT = 1;  // 참가자가 처음 고르는 문의 수
export const MONTY_SWITCH_TARGET_MIN = 1;  // 스위치하려면 남아 있어야 하는 최소 문 수
export const MONTY_PRIZE_SLOT_INDEX = 0;   // 남은 문 중 상품이 놓인 슬롯 (번호 붙이기는 임의)

// ── 수렴 곡선 표본 ──────────────────────────────────────────
export const CONVERGENCE_POINT_COUNT = 140; // 로그 간격 표본 점 개수
export const CONVERGENCE_FIRST_TRIAL = 1;   // 첫 표본 지점


/**
 * 문 doorCount개일 때 호스트가 열 수 있는 문의 최대 개수.
 * 참가자의 문과, 바꿔갈 문 최소 1개는 남겨야 한다. → doorCount - 2
 */
export function model_calculate_opened_max(doorCount) {
  return doorCount - MONTY_PLAYER_PICK_COUNT - MONTY_SWITCH_TARGET_MIN;
}

/**
 * 호스트가 문을 연 뒤, 참가자가 바꿔갈 수 있는 미개봉 문의 개수. → N - 1 - K
 */
export function model_calculate_remaining_count(doorCount, openedCount) {
  return doorCount - MONTY_PLAYER_PICK_COUNT - openedCount;
}

/**
 * 유지했을 때의 이론 승률. 호스트가 무엇을 열든 처음 고른 순간의 확률 그대로다. → 1/N
 */
export function model_calculate_stay_win_rate(doorCount) {
  return MONTY_PRIZE_COUNT / doorCount;
}

/**
 * 바꿨을 때의 이론 승률. → (N-1) / (N · (N-1-K))
 * 처음 고른 문이 틀렸을 확률 (N-1)/N × 남은 문 중 상품을 집을 확률 1/(N-1-K)
 */
export function model_calculate_switch_win_rate(doorCount, openedCount) {
  const remainingCount = model_calculate_remaining_count(doorCount, openedCount);
  return (doorCount - MONTY_PLAYER_PICK_COUNT) / (doorCount * remainingCount);
}

/**
 * 바꾸기가 유지 대비 몇 배 유리한지. → (N-1)/(N-1-K)
 */
export function model_calculate_switch_advantage(doorCount, openedCount) {
  // 확률 둘을 나누지 않고 (N−1)/R로 바로 낸다. 나눗셈 두 번을 거치면 19/8이
  // 2.3749…가 되어 화면에 2.37×로 찍혔다(정확값 2.375 → 2.38). 2026-09-21 검사.
  return (doorCount - 1) / (doorCount - 1 - openedCount);
}

/**
 * 이득비를 화면 문자열로 — **정수 연산으로** 반올림한다.
 *
 * `toFixed`는 이진 부동소수를 반올림한다. 41/40 = 1.025는 이진으로 1.02499…라
 * 1.02로 찍혔다(정확한 반올림은 1.03). 그런 상태가 슬라이더 격자에 14개 있었다
 * (2026-09-21, 회귀 테스트가 잡음). (N−1)/R은 정수의 비이므로 반올림도 정수로 한다:
 * round-half-up(x) = floor((2·(N−1)·10^d + R) / (2R)) / 10^d.
 */
export function model_format_switch_advantage(doorCount, openedCount, digits) {
  const remaining = doorCount - 1 - openedCount;
  const scale = 10 ** digits;
  const scaled = Math.floor((2 * (doorCount - 1) * scale + remaining) / (2 * remaining));
  return (scaled / scale).toFixed(digits);
}

/** 값을 [min, max] 안으로 자른다. 공통 모듈을 그대로 쓴다. */
export const model_clamp_value = num_clamp_value;

export function model_clamp_door_count(value) {
  return Math.round(model_clamp_value(value, MONTY_DOOR_MIN, MONTY_DOOR_MAX));
}

export function model_clamp_opened_count(value, doorCount) {
  return Math.round(model_clamp_value(value, MONTY_OPENED_MIN, model_calculate_opened_max(doorCount)));
}

export function model_clamp_trial_count(value) {
  return Math.round(model_clamp_value(value, MONTY_TRIAL_MIN, MONTY_TRIAL_MAX));
}

export const model_clamp_seed = rng_clamp_seed;

/**
 * 파라미터가 모델의 유효범위 안에 있는지 확인한다.
 * 유효범위를 벗어난 조합에서 조용히 숫자를 뱉지 않게 하는 것이 목적.
 */
export function model_check_parameters(doorCount, openedCount, trialCount) {
  if (!Number.isInteger(doorCount) || doorCount < MONTY_DOOR_MIN || doorCount > MONTY_DOOR_MAX) {
    return { ok: false, message: `doorCount는 ${MONTY_DOOR_MIN}~${MONTY_DOOR_MAX}의 정수여야 한다.` };
  }
  const openedMax = model_calculate_opened_max(doorCount);
  if (!Number.isInteger(openedCount) || openedCount < MONTY_OPENED_MIN || openedCount > openedMax) {
    return { ok: false, message: `openedCount는 ${MONTY_OPENED_MIN}~${openedMax}의 정수여야 한다.` };
  }
  if (!Number.isInteger(trialCount) || trialCount < MONTY_TRIAL_MIN || trialCount > MONTY_TRIAL_MAX) {
    return { ok: false, message: `trialCount는 ${MONTY_TRIAL_MIN}~${MONTY_TRIAL_MAX}의 정수여야 한다.` };
  }
  return { ok: true, message: '' };
}

/**
 * 씨앗값으로 결정되는 난수 발생기. 공통 모듈(mulberry32)을 그대로 쓴다.
 * 같은 씨앗 → 같은 곡선. 골든 벡터 테스트가 수열 자체를 고정하고 있다.
 */
export const sim_create_random = rng_create_seeded;

/**
 * 수렴 곡선을 그릴 표본 지점(누적 시행 횟수)을 로그 간격으로 만든다.
 * 초반 요동과 후반 수렴을 한 화면에 같이 보이게 하는 것이 목적.
 */
export function sim_calculate_checkpoints(trialCount, pointCount = CONVERGENCE_POINT_COUNT) {
  // 유효하지 않은 시행 수는 빈 배열. log(0) = -Infinity, log(음수) = NaN 이라
  // 그대로 두면 체크포인트가 전부 NaN이 된다.
  if (!(trialCount >= CONVERGENCE_FIRST_TRIAL) || !(pointCount >= 1)) return [];

  const checkpoints = [];
  const logFirst = Math.log(CONVERGENCE_FIRST_TRIAL);
  const logLast = Math.log(trialCount);
  for (let i = 0; i < pointCount; i += 1) {
    // pointCount가 1이면 0으로 나눈다. 이때 표본은 '첫 지점' 하나여야 한다.
    const ratio = pointCount === 1 ? 0 : i / (pointCount - 1);
    const value = Math.round(Math.exp(logFirst + (logLast - logFirst) * ratio));
    const clamped = Math.min(Math.max(value, CONVERGENCE_FIRST_TRIAL), trialCount);
    if (checkpoints[checkpoints.length - 1] !== clamped) checkpoints.push(clamped);
  }
  return checkpoints;
}

/**
 * 몬테카를로 시행을 한 번 훑으면서 체크포인트마다 누적 승률을 기록한다.
 *
 * 한 시행:
 *   상품 문과 참가자 문을 각각 균등하게 뽑는다.
 *   - 처음 고른 문이 맞았으면 → 유지 승. 남은 문은 전부 꽝이므로 스위치는 반드시 진다.
 *   - 틀렸으면 → 상품은 호스트가 열지 않은 remainingCount개 중 하나에 있다.
 *     남은 문에 번호를 붙이는 순서는 임의이므로 상품을 MONTY_PRIZE_SLOT_INDEX에 둬도
 *     일반성을 잃지 않는다. 참가자는 그중 하나를 균등하게 집는다.
 */
export function sim_run_convergence(doorCount, openedCount, trialCount, options = {}) {
  const seed = options.seed ?? MONTY_SEED_DEFAULT;
  const randomFn = options.randomFn ?? sim_create_random(seed);
  const pointCount = options.pointCount ?? CONVERGENCE_POINT_COUNT;

  const check = model_check_parameters(doorCount, openedCount, trialCount);
  if (!check.ok) throw new Error(check.message);

  const remainingCount = model_calculate_remaining_count(doorCount, openedCount);
  const checkpoints = sim_calculate_checkpoints(trialCount, pointCount);

  const points = [];
  let stayWinCount = 0;
  let switchWinCount = 0;
  let checkpointIndex = 0;

  for (let trial = 1; trial <= trialCount; trial += 1) {
    const prizeDoor = Math.floor(randomFn() * doorCount);
    const playerDoor = Math.floor(randomFn() * doorCount);
    // 스위치 선택은 결과와 무관하게 '항상' 뽑는다.
    // 승패에 따라 난수 소비 개수를 바꾸면 스트림 정렬이 결과와 얽혀 편향이 생긴다.
    // (조건부 소비 시 N=3~100 구간에서 stay 승률 z평균이 -1.64까지 치우쳤다)
    const switchSlot = Math.floor(randomFn() * remainingCount);
    if (prizeDoor === playerDoor) {
      stayWinCount += 1;
    } else if (switchSlot === MONTY_PRIZE_SLOT_INDEX) {
      switchWinCount += 1;
    }
    if (trial === checkpoints[checkpointIndex]) {
      points.push({
        trial,
        stayWinRate: stayWinCount / trial,
        switchWinRate: switchWinCount / trial,
      });
      checkpointIndex += 1;
    }
  }

  return {
    doorCount,
    openedCount,
    trialCount,
    remainingCount,
    seed,
    points,
    stayWinCount,
    switchWinCount,
    stayWinRate: stayWinCount / trialCount,
    switchWinRate: switchWinCount / trialCount,
    stayWinRateTheory: model_calculate_stay_win_rate(doorCount),
    switchWinRateTheory: model_calculate_switch_win_rate(doorCount, openedCount),
  };
}

/**
 * 수렴 곡선 없이 최종 승률만 필요할 때. 루프는 sim_run_convergence 하나만 쓴다.
 *
 * **프로덕션에 호출부가 없다** — 위젯은 곡선이 필요해서 언제나 전체를 부른다.
 * 그래도 남긴다: model.test.js의 스윕·난수소비 대조가 전부 이 요약 경로를 쓰고,
 * 이것을 지우면 그 테스트들이 곡선 배열까지 들고 다녀야 한다. 계산은 여기서
 * 한 줄도 다시 하지 않으므로 "계산 경로는 하나만" 규약에 걸리지 않는다.
 */
export function sim_run_trials(doorCount, openedCount, trialCount, options = {}) {
  const result = sim_run_convergence(doorCount, openedCount, trialCount, options);
  return {
    trialCount: result.trialCount,
    stayWinCount: result.stayWinCount,
    switchWinCount: result.switchWinCount,
    stayWinRate: result.stayWinRate,
    switchWinRate: result.switchWinRate,
  };
}
