/**
 * 속도를 올리면 시간이 얼마나 줄어드는가 — 산술 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (산술).
 *
 * 모델은 나눗셈 두 번과 뺄셈 하나다.
 *   t(v) = d / v
 *   Δt   = d · (1/v₁ − 1/v₂) = d · (v₂ − v₁) / (v₁ · v₂)
 * 고정 지연 T는 두 시나리오에 같은 값으로 들어가 뺄셈에서 사라진다 —
 * **Δt는 T에 전혀 의존하지 않는다.** T가 바꾸는 것은 비율의 분모뿐이다.
 *
 * **내부 계산은 언제나 SI(m, m/s, s)로 한다. 단위는 표시할 때만 바꾼다.**
 * 이 모델이 틀릴 수 있는 자리는 단위 환산 하나뿐이라, 환산 계수를 계산식 안에
 * 리터럴로 적지 않고 전부 이 파일 위쪽 상수로 모아 둔다.
 *
 * 환산 계수는 둘 다 **정의값**이고 측정값이 아니다:
 *   1 km/h = 1000/3600 m/s — km와 h가 둘 다 SI 단위의 고정 배수다
 *   1 mile = 1 609.344 m   — 국제 피트가 0.304 8 m로 고정되어 있다
 * 1609으로 반올림하면 네 번째 자리에 오차가 들어간다. 전 자릿수로 둔다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 시간·길이 환산 (전부 정의값) ────────────────────────────
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const MINUTES_PER_HOUR = SECONDS_PER_HOUR / SECONDS_PER_MINUTE;
export const METRES_PER_KILOMETRE = 1000;
/** 국제 마일. NIST가 피트를 0.304 8 m로 고정한 데서 나오는 정확한 값이다. */
export const METRES_PER_MILE = 1609.344;

// ── 표시 단위 ───────────────────────────────────────────────
export const UNIT_KMH = 'kmh';
export const UNIT_MPH = 'mph';
export const UNIT_DEFAULT = UNIT_KMH;

/**
 * 표시 단위 한 벌. 슬라이더 눈금·표의 행까지 여기서 정한다 —
 * mph 화면에서 "+20 km/h"를 보여줄 수는 없으므로, 표의 증분도 단위마다 다르다.
 */
export const SPEED_UNITS = {
  [UNIT_KMH]: {
    key: UNIT_KMH,
    speedLabel: 'km/h',
    distanceLabel: 'km',
    metresPerDistance: METRES_PER_KILOMETRE,
    msPerSpeed: METRES_PER_KILOMETRE / SECONDS_PER_HOUR,
    speedStep: 5,
    /** 민감도 표가 쓰는 증분과 출발 속도들. 초안 4번 블록의 여덟 줄이 이것이다. */
    tableIncrease: 20,
    tableStarts: [30, 40, 50, 60, 70, 80, 90, 100],
  },
  [UNIT_MPH]: {
    key: UNIT_MPH,
    speedLabel: 'mph',
    distanceLabel: 'mi',
    metresPerDistance: METRES_PER_MILE,
    msPerSpeed: METRES_PER_MILE / SECONDS_PER_HOUR,
    speedStep: 5,
    tableIncrease: 10,
    tableStarts: [20, 30, 40, 50, 60, 70, 80],
  },
};

export const UNIT_KEYS = [UNIT_KMH, UNIT_MPH];

// ── 거리 사다리 ─────────────────────────────────────────────
/**
 * 거리 슬라이더는 **인덱스 슬라이더**다. 연속 로그 매핑은 9,772 같은 값을 만들어
 * 로그 축의 10의 거듭제곱 라벨과 어긋난다. 그래서 자릿수마다 1-2-3-5-7만 남긴
 * 사다리를 만들어 두고 손잡이는 그 위를 걷는다.
 */
const DISTANCE_MANTISSA = [1, 2, 3, 5, 7];
const DISTANCE_DECADES = [1, 10, 100];
const DISTANCE_LADDER_MAX = 500;

export const DISTANCE_LADDER = DISTANCE_DECADES.flatMap((decade) =>
  DISTANCE_MANTISSA.map((mantissa) => mantissa * decade),
).filter((value) => value <= DISTANCE_LADDER_MAX);

export const DISTANCE_INDEX_MIN = 0;
export const DISTANCE_INDEX_MAX = DISTANCE_LADDER.length - 1;
export const DISTANCE_INDEX_STEP = 1;
/** 기본 거리. 초안이 대표 숫자로 삼은 "10 km, 40 → 60"의 10이다. */
export const DISTANCE_DEFAULT_UNITS = 10;

const DISTANCE_UNIT_FACTORS = UNIT_KEYS.map((key) => SPEED_UNITS[key].metresPerDistance);
/** SI 유효범위. 두 단위의 사다리를 모두 담아야 한다 (500 mi > 500 km). */
export const DISTANCE_MIN_METRES = DISTANCE_LADDER[0] * Math.min(...DISTANCE_UNIT_FACTORS);
export const DISTANCE_MAX_METRES = DISTANCE_LADDER[DISTANCE_INDEX_MAX] * Math.max(...DISTANCE_UNIT_FACTORS);

// ── 속도 범위 ───────────────────────────────────────────────
/** 기준은 km/h 눈금이고, mph 슬라이더의 끝은 여기서 계산해 안쪽으로 맞춘다. */
const SPEED_FROM_MIN_KMH = 20;
const SPEED_FROM_MAX_KMH = 140;
const SPEED_TO_MAX_KMH = 160;
const SPEED_GAP_MIN_KMH = 5;

const KMH_TO_MS = SPEED_UNITS[UNIT_KMH].msPerSpeed;
export const SPEED_FROM_MIN_MS = SPEED_FROM_MIN_KMH * KMH_TO_MS;
export const SPEED_FROM_MAX_MS = SPEED_FROM_MAX_KMH * KMH_TO_MS;
export const SPEED_TO_MAX_MS = SPEED_TO_MAX_KMH * KMH_TO_MS;
/** v₂가 v₁보다 최소 이만큼은 높아야 한다. 종속 슬라이더의 min이 여기서 나온다. */
export const SPEED_GAP_MIN_MS = SPEED_GAP_MIN_KMH * KMH_TO_MS;

export const SPEED_FROM_DEFAULT_MS = 40 * KMH_TO_MS;
export const SPEED_TO_DEFAULT_MS = 60 * KMH_TO_MS;

/**
 * 눈금 위로 맞출 때 쓰는 여유.
 * 125 km/h를 m/s로 갔다가 되돌리면 124.999999999999 99가 나온다 —
 * 그대로 floor하면 그 슬라이더 끝이 120으로 한 칸 줄어든다.
 */
const STEP_EPSILON = 1e-9;

// ── 고정 지연 ───────────────────────────────────────────────
export const DELAY_MIN_MINUTES = 0;
export const DELAY_MAX_MINUTES = 30;
export const DELAY_STEP_MINUTES = 1;
/** 기본은 0분이다 — 첫 화면이 지연 없는 순수한 경우여야 카드가 논지를 그대로 말한다. */
export const DELAY_DEFAULT_MINUTES = 0;

// ── 판정 임계값 ─────────────────────────────────────────────
/**
 * 절약 시간이 원래 총 소요시간에서 차지하는 비율. 편집 판단이지 통계 검정이 아니다.
 * 세 색은 "효과가 미미 / 경계 / 큰 자리를 먹는다"를 가른다.
 */
export const VERDICT_BREAK_MIN_SHARE = 0.25;
export const VERDICT_EDGE_MIN_SHARE = 0.1;

/** 곡선을 그릴 때 v₂를 몇 점으로 훑는가. */
export const CURVE_POINT_COUNT = 180;

// ── 단위 환산 ───────────────────────────────────────────────

export function model_read_unit(unitKey) {
  return SPEED_UNITS[unitKey] ?? SPEED_UNITS[UNIT_DEFAULT];
}

export function model_calculate_speed_to_ms(value, unitKey) {
  return value * model_read_unit(unitKey).msPerSpeed;
}

export function model_calculate_speed_from_ms(speedMs, unitKey) {
  return speedMs / model_read_unit(unitKey).msPerSpeed;
}

export function model_calculate_distance_to_metres(value, unitKey) {
  return value * model_read_unit(unitKey).metresPerDistance;
}

export function model_calculate_distance_from_metres(metres, unitKey) {
  return metres / model_read_unit(unitKey).metresPerDistance;
}

// ── 슬라이더 범위 ───────────────────────────────────────────

/**
 * 눈금 위로 안쪽으로 맞춘다. `direction`이 1이면 올림, −1이면 내림.
 *
 * 여유(STEP_EPSILON)가 load-bearing이다. 125 km/h를 m/s로 갔다 되돌리면
 * 124.999999999999 99가 나오는데, 그대로 내림하면 **슬라이더의 끝이 한 칸 줄어든다.**
 */
export function model_clamp_to_step(value, step, direction) {
  const scaled = value / step;
  return direction > 0
    ? Math.ceil(scaled - STEP_EPSILON) * step
    : Math.floor(scaled + STEP_EPSILON) * step;
}

/**
 * 이 단위에서 속도 슬라이더 둘이 쓸 범위.
 * SI 유효범위를 **안쪽으로** 눈금에 맞춘다 — 밖으로 맞추면 슬라이더가
 * 모델이 거부하는 값을 가리킬 수 있다.
 */
export function model_calculate_speed_range(unitKey) {
  const unit = model_read_unit(unitKey);
  const step = unit.speedStep;
  return {
    step,
    fromMin: model_clamp_to_step(SPEED_FROM_MIN_MS / unit.msPerSpeed, step, 1),
    fromMax: model_clamp_to_step(SPEED_FROM_MAX_MS / unit.msPerSpeed, step, -1),
    toMax: model_clamp_to_step(SPEED_TO_MAX_MS / unit.msPerSpeed, step, -1),
    gap: model_clamp_to_step(SPEED_GAP_MIN_MS / unit.msPerSpeed, step, 1),
  };
}

/**
 * 거리 사다리에서 이 거리에 가장 가까운 칸.
 * **비교는 로그 거리로 한다** — 사다리가 로그 간격이라, 선형 차로 고르면
 * 위쪽 칸이 언제나 이긴다 (200과 300 사이에서 250은 300으로 가야 한다).
 */
export function model_read_distance_index(distanceMetres, unitKey) {
  const unit = model_read_unit(unitKey);
  const value = distanceMetres / unit.metresPerDistance;
  if (!(value > 0) || !Number.isFinite(value)) return DISTANCE_LADDER.indexOf(DISTANCE_DEFAULT_UNITS);
  let bestIndex = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < DISTANCE_LADDER.length; index += 1) {
    const gap = Math.abs(Math.log(value / DISTANCE_LADDER[index]));
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function model_clamp_distance_index(index) {
  return Math.round(num_clamp_value(index, DISTANCE_INDEX_MIN, DISTANCE_INDEX_MAX));
}

/** 거리를 사다리 칸 위로 스냅한 SI 값. 손잡이가 가리키는 값과 계산값을 같게 둔다. */
export function model_clamp_distance(distanceMetres, unitKey) {
  const index = model_read_distance_index(distanceMetres, unitKey);
  return DISTANCE_LADDER[index] * model_read_unit(unitKey).metresPerDistance;
}

export function model_clamp_speed_from(speedMs) {
  return num_clamp_value(speedMs, SPEED_FROM_MIN_MS, SPEED_FROM_MAX_MS);
}

/**
 * 올린 속도. **v₁에 종속이다** — 아래로는 v₁ + 최소 간격이 바닥이다.
 * 이 함수가 없으면 v₁을 밀어 올렸을 때 v₂가 뒤에 남아 Δt가 음수가 된다.
 */
export function model_clamp_speed_to(speedMs, speedFromMs) {
  return num_clamp_value(speedMs, speedFromMs + SPEED_GAP_MIN_MS, SPEED_TO_MAX_MS);
}

export function model_clamp_delay_minutes(minutes) {
  const bounded = num_clamp_value(minutes, DELAY_MIN_MINUTES, DELAY_MAX_MINUTES);
  return Math.round(bounded / DELAY_STEP_MINUTES) * DELAY_STEP_MINUTES;
}

// ── 유효범위 검사 ───────────────────────────────────────────

/**
 * 유효범위 밖 조합에서 조용히 숫자를 뱉지 않는다.
 * 특히 v₂ ≤ v₁은 **그럴듯한 음수**를 내므로 화면에서 알아채기 어렵다.
 */
export function model_check_parameters(distanceMetres, speedFromMs, speedToMs, delaySeconds) {
  if (!Number.isFinite(distanceMetres) || distanceMetres < DISTANCE_MIN_METRES || distanceMetres > DISTANCE_MAX_METRES) {
    return { ok: false, message: `거리는 ${DISTANCE_MIN_METRES}~${DISTANCE_MAX_METRES} m 사이여야 한다.` };
  }
  if (!Number.isFinite(speedFromMs) || speedFromMs < SPEED_FROM_MIN_MS || speedFromMs > SPEED_FROM_MAX_MS) {
    return { ok: false, message: `출발 속도는 ${SPEED_FROM_MIN_MS}~${SPEED_FROM_MAX_MS} m/s 사이여야 한다.` };
  }
  if (!Number.isFinite(speedToMs) || speedToMs > SPEED_TO_MAX_MS) {
    return { ok: false, message: `올린 속도는 ${SPEED_TO_MAX_MS} m/s 이하여야 한다.` };
  }
  if (!(speedToMs > speedFromMs)) {
    return { ok: false, message: '올린 속도가 출발 속도보다 커야 한다 (아니면 Δt가 음수가 된다).' };
  }
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > DELAY_MAX_MINUTES * SECONDS_PER_MINUTE) {
    return { ok: false, message: `고정 지연은 0~${DELAY_MAX_MINUTES}분 사이여야 한다.` };
  }
  return { ok: true, message: '' };
}

// ── 계산 ────────────────────────────────────────────────────

/** 한 속도로 그 거리를 갈 때의 이동 시간(초). 모델의 전부가 이 나눗셈이다. */
export function model_calculate_travel_seconds(distanceMetres, speedMs) {
  return distanceMetres / speedMs;
}

/**
 * 두 시나리오를 한 번에. **계산 경로는 여기 하나뿐이다** —
 * 카드·막대·곡선·표가 전부 이 함수를 부른다.
 */
export function model_calculate_result(distanceMetres, speedFromMs, speedToMs, delaySeconds) {
  const check = model_check_parameters(distanceMetres, speedFromMs, speedToMs, delaySeconds);
  if (!check.ok) throw new Error(check.message);

  const movingFromSeconds = model_calculate_travel_seconds(distanceMetres, speedFromMs);
  const movingToSeconds = model_calculate_travel_seconds(distanceMetres, speedToMs);
  const totalFromSeconds = movingFromSeconds + delaySeconds;
  const totalToSeconds = movingToSeconds + delaySeconds;
  const savedSeconds = movingFromSeconds - movingToSeconds;

  return {
    distanceMetres,
    speedFromMs,
    speedToMs,
    delaySeconds,
    movingFromSeconds,
    movingToSeconds,
    totalFromSeconds,
    totalToSeconds,
    savedSeconds,
    /** 절약이 원래 총 소요시간에서 차지하는 비율. 고정 지연이 움직이는 것은 이 값이다. */
    savedShare: savedSeconds / totalFromSeconds,
    /**
     * 천장. v₂ → ∞에서 Δt는 d/v₁으로 간다 —
     * 어떤 속도도 원래 트립의 **이동 시간**보다 더 줄일 수는 없다.
     */
    ceilingSeconds: movingFromSeconds,
    /** 지금 설정이 그 천장의 몇 할을 가져갔는가. */
    ceilingShare: savedSeconds / movingFromSeconds,
  };
}

/** 판정. 절약이 원래 총 소요시간의 몇 할인가로 가른다. */
export function model_calculate_verdict(savedShare) {
  if (savedShare >= VERDICT_BREAK_MIN_SHARE) return 'break';
  if (savedShare >= VERDICT_EDGE_MIN_SHARE) return 'edge';
  return 'hold';
}

// ── 곡선·표 ─────────────────────────────────────────────────

/**
 * v₂를 v₁에서 이 단위의 상한까지 훑으며 절약 시간을 낸다.
 * 시작점은 v₂ = v₁, 즉 절약 0이다 — 곡선이 0에서 출발해 천장으로 붙는 모양이
 * 이 그림의 논지다.
 */
export function model_calculate_curve(distanceMetres, speedFromMs, unitKey, pointCount = CURVE_POINT_COUNT) {
  if (!(pointCount >= 2)) return [];
  if (!(speedFromMs > 0) || !(distanceMetres > 0)) return [];
  const range = model_calculate_speed_range(unitKey);
  const unit = model_read_unit(unitKey);
  const topMs = Math.min(SPEED_TO_MAX_MS, range.toMax * unit.msPerSpeed);
  if (!(topMs > speedFromMs)) return [];

  const movingFromSeconds = model_calculate_travel_seconds(distanceMetres, speedFromMs);
  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const speedToMs = speedFromMs + ((topMs - speedFromMs) * index) / (pointCount - 1);
    points.push({
      speedToMs,
      speedToUnits: speedToMs / unit.msPerSpeed,
      savedSeconds: movingFromSeconds - model_calculate_travel_seconds(distanceMetres, speedToMs),
    });
  }
  return points;
}

/**
 * 같은 증분을 여러 출발 속도에서. 슬라이더를 안 움직이는 독자도 경향을 보게 하는 장치이자,
 * 이 페이지의 논지("+20은 같은 +20이 아니다")를 표로 못박는 자리다.
 */
export function model_calculate_increase_table(distanceMetres, delaySeconds, unitKey) {
  const unit = model_read_unit(unitKey);
  const rows = [];
  for (const startUnits of unit.tableStarts) {
    const speedFromMs = startUnits * unit.msPerSpeed;
    const toUnits = startUnits + unit.tableIncrease;
    const speedToMs = toUnits * unit.msPerSpeed;
    const check = model_check_parameters(distanceMetres, speedFromMs, speedToMs, delaySeconds);
    if (!check.ok) continue;
    const result = model_calculate_result(distanceMetres, speedFromMs, speedToMs, delaySeconds);
    rows.push({ startUnits, toUnits, increaseUnits: unit.tableIncrease, result });
  }
  return rows;
}
