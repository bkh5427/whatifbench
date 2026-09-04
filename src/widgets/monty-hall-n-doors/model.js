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

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ─────────────────
export const MONTY_DOOR_MIN = 3;
export const MONTY_DOOR_MAX = 100;
export const MONTY_DOOR_DEFAULT = 3;

export const MONTY_OPENED_MIN = 1;
export const MONTY_OPENED_DEFAULT = 1;

export const MONTY_TRIAL_MIN = 1000;
export const MONTY_TRIAL_MAX = 1000000;
export const MONTY_TRIAL_DEFAULT = 10000;

export const MONTY_SEED_MIN = 1;
export const MONTY_SEED_MAX = 99999999; // 기본 씨앗(날짜 형식)이 범위 안에 들어와야 한다
export const MONTY_SEED_DEFAULT = 20260904;

// ── 게임 규칙 상수 ──────────────────────────────────────────
export const MONTY_PRIZE_COUNT = 1;        // 상품이 놓인 문의 수
export const MONTY_PLAYER_PICK_COUNT = 1;  // 참가자가 처음 고르는 문의 수
export const MONTY_SWITCH_TARGET_MIN = 1;  // 스위치하려면 남아 있어야 하는 최소 문 수
export const MONTY_PRIZE_SLOT_INDEX = 0;   // 남은 문 중 상품이 놓인 슬롯 (번호 붙이기는 임의)

// ── 수렴 곡선 표본 ──────────────────────────────────────────
export const CONVERGENCE_POINT_COUNT = 140; // 로그 간격 표본 점 개수
export const CONVERGENCE_FIRST_TRIAL = 1;   // 첫 표본 지점

// ── 난수 발생기 상수 (mulberry32) ───────────────────────────
const RNG_STEP = 0x6d2b79f5;
const RNG_SHIFT_A = 15;
const RNG_SHIFT_B = 7;
const RNG_SHIFT_C = 14;
const RNG_MIX_A = 1;
const RNG_MIX_B = 61;
const RNG_UINT32_RANGE = 4294967296;

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
  return model_calculate_switch_win_rate(doorCount, openedCount) / model_calculate_stay_win_rate(doorCount);
}

/** 값을 [min, max] 안으로 자른다. */
export function model_clamp_value(value, minValue, maxValue) {
  if (!Number.isFinite(value)) return minValue;
  return Math.min(Math.max(value, minValue), maxValue);
}

export function model_clamp_door_count(value) {
  return Math.round(model_clamp_value(value, MONTY_DOOR_MIN, MONTY_DOOR_MAX));
}

export function model_clamp_opened_count(value, doorCount) {
  return Math.round(model_clamp_value(value, MONTY_OPENED_MIN, model_calculate_opened_max(doorCount)));
}

export function model_clamp_trial_count(value) {
  return Math.round(model_clamp_value(value, MONTY_TRIAL_MIN, MONTY_TRIAL_MAX));
}

export function model_clamp_seed(value) {
  return Math.round(model_clamp_value(value, MONTY_SEED_MIN, MONTY_SEED_MAX));
}

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
 * 씨앗값으로 결정되는 난수 발생기를 만든다 (mulberry32).
 * 같은 씨앗 → 같은 곡선. URL 공유 시 재현성을 위해 Math.random을 쓰지 않는다.
 */
export function sim_create_random(seed) {
  let state = model_clamp_seed(seed) | 0;
  return function random_read_next() {
    state = (state + RNG_STEP) | 0;
    let t = Math.imul(state ^ (state >>> RNG_SHIFT_A), RNG_MIX_A | state);
    t = (t + Math.imul(t ^ (t >>> RNG_SHIFT_B), RNG_MIX_B | t)) ^ t;
    return ((t ^ (t >>> RNG_SHIFT_C)) >>> 0) / RNG_UINT32_RANGE;
  };
}

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
