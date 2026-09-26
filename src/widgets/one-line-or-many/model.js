/**
 * 줄 하나 vs 줄 여럿 — 대기행렬 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (확률).
 *
 * 두 배치를 같은 도착률·같은 창구 수로 비교한다.
 *   단일 대기열  : M/M/c — 줄 하나가 창구 c개를 먹인다. 대기 확률은 Erlang C.
 *   창구별 대기열 : M/M/1 × c — 각 창구가 자기 줄을 λ/c로 받는다.
 * 두 배치의 ρ가 같으므로 처리량도 유휴시간도 같다. 달라지는 것은 대기의 분배뿐이다.
 *
 * **Erlang C는 닫힌 형태가 아니라 Erlang B 재귀로 계산한다.**
 * 닫힌 형태는 aᶜ와 c!이 둘 다 커져 큰 c에서 부동소수가 갈린다. 지금은 c ≤ 8이라
 * 문제가 없지만 재귀 쪽이 같은 식이면서 안전하다. 닫힌 형태는 model.test.js의
 * 대조 경로로 남겼다 — 두 경로가 맞아야 신뢰한다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ─────────────────
export const QUEUE_COUNTER_MIN = 1;
export const QUEUE_COUNTER_MAX = 8;
export const QUEUE_COUNTER_STEP = 1;
export const QUEUE_COUNTER_DEFAULT = 4;

/** ρ = 창구가 손님을 받고 있는 시간의 비율. 1에서는 정상상태가 없어 슬라이더가 못 닿는다. */
export const QUEUE_LOAD_MIN = 0.1;
export const QUEUE_LOAD_MAX = 0.95;
export const QUEUE_LOAD_STEP = 0.01;
export const QUEUE_LOAD_DEFAULT = 0.8;

/** 창구에서 한 사람이 쓰는 평균 시간(분). 결과 전체에 곱해지는 배율이다. */
export const QUEUE_SERVICE_MIN_MINUTES = 0.5;
export const QUEUE_SERVICE_MAX_MINUTES = 10;
export const QUEUE_SERVICE_STEP_MINUTES = 0.5;
export const QUEUE_SERVICE_DEFAULT_MINUTES = 3;

/** 처리시간의 변동계수. 1이 지수분포, 0에 가까울수록 일정, 2는 "대부분 짧고 가끔 아주 김". */
export const QUEUE_CV_MIN = 0.25;
export const QUEUE_CV_MAX = 2;
export const QUEUE_CV_STEP = 0.05;
export const QUEUE_CV_DEFAULT = 1;
/** 이 값에서만 모든 수(두 배치의 평균·95퍼센타일)가 정확하다. 벗어나면 무엇이 근사인지 화면이 말한다. */
export const QUEUE_CV_EXACT = 1;

// ── 퍼센타일 ────────────────────────────────────────────────
/** 95퍼센타일. "스무 번 중 열아홉 번은 이 시간 안에 끝난다". */
export const QUEUE_PERCENTILE = 0.95;
/** 위 퍼센타일이 남기는 꼬리 확률. 대기 확률이 이보다 작으면 퍼센타일은 0분이다. */
export const QUEUE_TAIL_PROBABILITY = 1 - QUEUE_PERCENTILE;

// ── 판정 임계값 ─────────────────────────────────────────────
/**
 * 배치가 바꾸는 평균 대기의 배수. 편집 판단이지 통계 검정이 아니다.
 * 1배는 c = 1, 즉 두 배치가 같은 배치가 되는 자리다.
 *
 * meanRatio = c·ρ / C(c, cρ)이고 서비스시간·변동계수는 분자·분모에서 지워진다
 * (두 배치 모두 같은 배로 곱해지므로) — 그래서 이 배수는 오직 c와 ρ로만 정해진다.
 * 문제는 **c가 배수를 지수적으로 밀어 올린다는 것**이다: 슬라이더가 허용하는
 * ρ ∈ [0.1, 0.95] 전체에서 c = 3만 되어도 배수가 최소 약 3.1배다(ρ = 0.95에서).
 * 옛 임계값(edge 1.2 / break 3)에서는 그 최솟값이 이미 break 문턱을 넘어 있었다 —
 * c ≥ 3인 채로 ρ만 움직이면 판정이 **항상 break였고 edge에 닿을 수 없었다.**
 * 실측(전 격자 c=1..8 × ρ=0.10..0.95 step 0.01, model_calculate_erlang_c 대조):
 *   c=1 배수 항상 1(hold, 위에서 이미 트리비얼하게 처리) / c=2 배수 2.05~11 /
 *   c=3 배수 3.1~81 / c=8 배수 9~385,096.
 * 새 임계값은 c=2에서는 전부 edge, c=3~8에서는 ρ가 낮으면 break·높으면 edge로
 * **c를 고정한 채 ρ만 움직여도 판정이 실제로 갈리도록** 잡았다(model.test.js가
 * c별로 두 판정이 모두 나오는지 못박는다).
 */
export const QUEUE_VERDICT_EDGE_MIN_RATIO = 2;
export const QUEUE_VERDICT_BREAK_MIN_RATIO = 20;

/** 곡선을 그릴 때 ρ를 몇 점으로 훑는가. */
export const QUEUE_SWEEP_POINT_COUNT = 160;

// ── 클램프 ──────────────────────────────────────────────────

export function model_clamp_counter_count(value) {
  return Math.round(num_clamp_value(value, QUEUE_COUNTER_MIN, QUEUE_COUNTER_MAX));
}

/** 눈금 위로 맞춘다 — 슬라이더가 스냅하는 자리와 모델이 쓰는 값을 같게 둔다. */
export function model_clamp_load(value) {
  const bounded = num_clamp_value(value, QUEUE_LOAD_MIN, QUEUE_LOAD_MAX);
  return Number((Math.round(bounded / QUEUE_LOAD_STEP) * QUEUE_LOAD_STEP).toFixed(4));
}

export function model_clamp_service_minutes(value) {
  const bounded = num_clamp_value(value, QUEUE_SERVICE_MIN_MINUTES, QUEUE_SERVICE_MAX_MINUTES);
  return Number((Math.round(bounded / QUEUE_SERVICE_STEP_MINUTES) * QUEUE_SERVICE_STEP_MINUTES).toFixed(4));
}

export function model_clamp_variation(value) {
  const bounded = num_clamp_value(value, QUEUE_CV_MIN, QUEUE_CV_MAX);
  return Number((Math.round(bounded / QUEUE_CV_STEP) * QUEUE_CV_STEP).toFixed(4));
}

/**
 * 파라미터가 모델의 유효범위 안에 있는지. 밖에서 조용히 숫자를 뱉지 않는다 —
 * ρ ≥ 1이면 정상상태가 없고, 식은 음수 대기시간을 낸다.
 */
export function model_check_parameters(counterCount, load, serviceMinutes, variation) {
  if (!Number.isInteger(counterCount) || counterCount < QUEUE_COUNTER_MIN || counterCount > QUEUE_COUNTER_MAX) {
    return { ok: false, message: `창구 수는 ${QUEUE_COUNTER_MIN}~${QUEUE_COUNTER_MAX}의 정수여야 한다.` };
  }
  if (!Number.isFinite(load) || load < QUEUE_LOAD_MIN || load > QUEUE_LOAD_MAX) {
    return { ok: false, message: `이용률은 ${QUEUE_LOAD_MIN}~${QUEUE_LOAD_MAX} 사이여야 한다 (ρ ≥ 1이면 정상상태가 없다).` };
  }
  if (!Number.isFinite(serviceMinutes) || serviceMinutes < QUEUE_SERVICE_MIN_MINUTES || serviceMinutes > QUEUE_SERVICE_MAX_MINUTES) {
    return { ok: false, message: `평균 처리시간은 ${QUEUE_SERVICE_MIN_MINUTES}~${QUEUE_SERVICE_MAX_MINUTES}분이어야 한다.` };
  }
  if (!Number.isFinite(variation) || variation < QUEUE_CV_MIN || variation > QUEUE_CV_MAX) {
    return { ok: false, message: `변동계수는 ${QUEUE_CV_MIN}~${QUEUE_CV_MAX} 사이여야 한다.` };
  }
  return { ok: true, message: '' };
}

// ── Erlang ──────────────────────────────────────────────────

/**
 * Erlang B — 창구 c개가 전부 차서 손님이 되돌아갈 확률.
 * 재귀 B(k) = a·B(k−1) / (k + a·B(k−1)), B(0) = 1.
 * 계승도 거듭제곱도 쓰지 않아 오버플로가 없다.
 */
export function model_calculate_erlang_b(counterCount, offeredLoad) {
  let blocking = 1;
  for (let index = 1; index <= counterCount; index += 1) {
    const weighted = offeredLoad * blocking;
    blocking = weighted / (index + weighted);
  }
  return blocking;
}

/**
 * Erlang C — 도착한 손님이 창구를 하나도 못 잡아 **기다리게 될** 확률.
 * Erlang B와의 항등식: C = B / (1 − ρ(1 − B)), ρ = a/c.
 *
 * c = 1이면 C = ρ로 떨어진다 (창구가 하나면 두 배치가 같은 배치다).
 */
export function model_calculate_erlang_c(counterCount, offeredLoad) {
  const load = offeredLoad / counterCount;
  const blocking = model_calculate_erlang_b(counterCount, offeredLoad);
  return blocking / (1 - load * (1 - blocking));
}

/**
 * 처리시간의 변동을 반영하는 배수 — Allen–Cunneen의 두 모멘트 근사.
 * 도착이 포아송(Ca² = 1)이므로 (1 + CV²)/2만 남는다.
 * CV = 1에서 정확히 1이라 지수 서비스일 때는 식이 그대로 정확하다.
 */
export function model_calculate_variation_factor(variation) {
  return (1 + variation * variation) / 2;
}

// ── 두 배치 ─────────────────────────────────────────────────

/**
 * 한 배치의 대기시간 두 가지를, **대기 확률과 평균 대기 하나에서** 함께 낸다.
 *
 * 대기시간 분포를 P(W > t) = p·exp(−t/scale)로 두고, 평균이 p·scale이 되도록
 * scale을 정한다. CV = 1이면 이것이 곧 M/M/c(그리고 M/M/1)의 정확한 분포다.
 * CV ≠ 1이면 평균만 근사로 옮기고 꼬리 모양은 그대로 쓴다 — 편의이지 결과가 아니고,
 * 화면과 본문이 그렇게 적는다.
 *
 * 대기 확률이 꼬리 확률(0.05)보다 작으면 **퍼센타일은 0분이다.**
 * 이 가드가 없으면 ln이 음수가 되어 음수 대기시간이 화면에 찍힌다.
 */
export function model_calculate_wait(delayProbability, meanWaitMinutes) {
  if (!(delayProbability > 0) || !(meanWaitMinutes > 0)) {
    return { delayProbability, meanMinutes: 0, percentileMinutes: 0 };
  }
  const scaleMinutes = meanWaitMinutes / delayProbability;
  const percentileMinutes =
    delayProbability <= QUEUE_TAIL_PROBABILITY
      ? 0
      : scaleMinutes * Math.log(delayProbability / QUEUE_TAIL_PROBABILITY);
  return { delayProbability, meanMinutes: meanWaitMinutes, percentileMinutes };
}

/**
 * 줄 하나가 창구 c개를 먹이는 배치 (M/M/c).
 *   Wq = C(c, a) · E[S] / (c(1 − ρ)) × (1 + CV²)/2
 */
export function model_calculate_single_queue_wait(counterCount, load, serviceMinutes, variation) {
  const delayProbability = model_calculate_erlang_c(counterCount, counterCount * load);
  const meanMinutes =
    (delayProbability * serviceMinutes * model_calculate_variation_factor(variation)) /
    (counterCount * (1 - load));
  return model_calculate_wait(delayProbability, meanMinutes);
}

/**
 * 창구마다 자기 줄이 있는 배치 (M/M/1 × c).
 * 각 줄이 λ/c를 받으므로 창구 수는 결과에서 사라진다 — 위 식에 c = 1을 넣은 것과 같다.
 *   Wq = ρ · E[S] / (1 − ρ) × (1 + CV²)/2
 */
export function model_calculate_separate_queue_wait(load, serviceMinutes, variation) {
  const meanMinutes = (load * serviceMinutes * model_calculate_variation_factor(variation)) / (1 - load);
  return model_calculate_wait(load, meanMinutes);
}

/** 두 배치를 한 번에. 계산 경로는 여기 하나뿐이다 — 카드·곡선·표가 전부 이것을 부른다. */
export function model_calculate_result(counterCount, load, serviceMinutes, variation) {
  const check = model_check_parameters(counterCount, load, serviceMinutes, variation);
  if (!check.ok) throw new Error(check.message);

  const single = model_calculate_single_queue_wait(counterCount, load, serviceMinutes, variation);
  const separate = model_calculate_separate_queue_wait(load, serviceMinutes, variation);

  return {
    counterCount,
    load,
    serviceMinutes,
    variation,
    offeredLoad: counterCount * load,
    exact: variation === QUEUE_CV_EXACT,
    single,
    separate,
    // 배치가 바꾸는 배수와 분(分). 비율은 평균 쪽이 크고, 분은 꼬리 쪽이 크다 —
    // 이 두 문장이 갈리는 것이 이 페이지의 논점이다.
    meanRatio: single.meanMinutes > 0 ? separate.meanMinutes / single.meanMinutes : 1,
    percentileRatio: single.percentileMinutes > 0 ? separate.percentileMinutes / single.percentileMinutes : 1,
    meanSavedMinutes: separate.meanMinutes - single.meanMinutes,
    percentileSavedMinutes: separate.percentileMinutes - single.percentileMinutes,
  };
}

/** 판정. 배치가 평균 대기를 몇 배로 줄이는가로 가른다. */
export function model_calculate_verdict(meanRatio) {
  if (meanRatio >= QUEUE_VERDICT_BREAK_MIN_RATIO) return 'break';
  if (meanRatio >= QUEUE_VERDICT_EDGE_MIN_RATIO) return 'edge';
  return 'hold';
}

// ── 곡선·표 ─────────────────────────────────────────────────

/**
 * ρ를 훑으며 네 값을 낸다 — 두 배치 × (평균, 95퍼센타일).
 * 창구 수·처리시간·변동계수는 슬라이더가 둔 자리에 고정한다.
 */
export function model_calculate_sweep(counterCount, serviceMinutes, variation, pointCount = QUEUE_SWEEP_POINT_COUNT) {
  if (!(pointCount >= 2)) return [];
  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const load = QUEUE_LOAD_MIN + ((QUEUE_LOAD_MAX - QUEUE_LOAD_MIN) * index) / (pointCount - 1);
    const single = model_calculate_single_queue_wait(counterCount, load, serviceMinutes, variation);
    const separate = model_calculate_separate_queue_wait(load, serviceMinutes, variation);
    points.push({
      load,
      singleMean: single.meanMinutes,
      singlePercentile: single.percentileMinutes,
      separateMean: separate.meanMinutes,
      separatePercentile: separate.percentileMinutes,
    });
  }
  return points;
}

/**
 * 창구 수 1~8에서 두 배치를 나란히. 슬라이더를 안 움직이는 독자도 경향을 보게 하는 장치.
 * 첫 줄(c = 1)은 모델 자신의 점검이다 — 창구가 하나면 두 배치가 같아야 한다.
 */
export function model_calculate_counter_table(load, serviceMinutes, variation) {
  const rows = [];
  for (let counterCount = QUEUE_COUNTER_MIN; counterCount <= QUEUE_COUNTER_MAX; counterCount += 1) {
    rows.push(model_calculate_result(counterCount, load, serviceMinutes, variation));
  }
  return rows;
}
