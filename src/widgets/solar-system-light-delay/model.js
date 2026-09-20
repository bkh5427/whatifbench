/**
 * 태양계 통신 지연 — 모델 (순수 계산만. DOM 접근 금지)
 *
 * 모델 등급 A (산술). 전체가 나눗셈 하나다: t = d / c.
 * 페이지의 나머지는 전부 **d를 어떻게 얻는가**의 문제다.
 *
 * 각 천체를 태양 중심의 원(반지름 = 궤도 장반경 a)에 올리고, 모두 한 평면에 둔다.
 * 태양에서 본 두 천체의 사잇각 θ에 대해 둘 사이는 코사인법칙의 현(chord)이다.
 *
 *   d(θ) = √( a_p² + a_E² − 2·a_p·a_E·cos θ )
 *
 * 태양은 a = 0으로 두면 이 식이 그대로 d = a_E를 낸다 — 특수분기가 필요 없다.
 * θ가 태양에게 아무 일도 하지 않는다는 사실이 식에서 저절로 나온다.
 *
 * **이심률은 이 모델에 들어가지 않는다.** 원궤도 근사다. 타원으로 재면 띠가
 * 양끝에서 더 벌어지고, 그 차이는 `model_calculate_elliptic_band`이 따로 낸다 —
 * 본문 블록 7이 인용하는 것이 그 값이고, 카드·곡선·표는 그것을 쓰지 않는다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 정의상 정확한 두 상수 ────────────────────────────────────
/** 진공 중 빛의 속도. 1983년 제17차 CGPM이 미터를 이 값으로 정의했다 (측정값이 아니다). */
export const SPEED_OF_LIGHT_MS = 299792458;
/** 천문단위. 2012년 IAU 결의 B2가 채택한 관례상 정확한 값. */
export const AU_METRES = 149597870700;
/** 위 둘에서 나오는 환산 계수. 둘 다 불확도가 없으므로 이 값도 정확하다. */
export const AU_LIGHT_SECONDS = AU_METRES / SPEED_OF_LIGHT_MS;

// ── 단위 환산 ────────────────────────────────────────────────
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const MINUTES_PER_HOUR = 60;
export const METRES_PER_KM = 1000;
export const MILLION = 1e6;
export const DEGREES_TO_RADIANS = Math.PI / 180;

// ── 신호가 지나는 구간 수 ────────────────────────────────────
export const LEGS_ONE_WAY = 1;
export const LEGS_ROUND_TRIP = 2;
/** 대화 한 턴 = 질문 하나와 답 하나. 언제나 왕복이다. */
export const LEGS_PER_TURN = LEGS_ROUND_TRIP;

// ── 관측자 ───────────────────────────────────────────────────
/**
 * 지구의 궤도 장반경과 이심률. JPL "Approximate Positions of the Major Planets"의
 * J2000 케플러 원소이며, 이 행은 지구 중심이 아니라 **지구–달 질량중심**이다.
 */
export const EARTH_SEMI_MAJOR_AXIS_AU = 1.00000261;
export const EARTH_ECCENTRICITY = 0.01671123;

// ── 대상 천체 ────────────────────────────────────────────────
/**
 * 태양은 a = 0이다. 원 위의 반지름 0인 점이라 θ와 무관하게 지구에서 a_E만큼 떨어진다.
 * 이심률은 원궤도 모델이 쓰지 않는다 — 블록 7의 대조값에만 들어간다.
 */
export const BODIES = [
  { key: 'sun', name: 'the Sun', label: 'Sun', semiMajorAxisAu: 0, eccentricity: 0 },
  { key: 'mercury', name: 'Mercury', label: 'Mercury', semiMajorAxisAu: 0.38709927, eccentricity: 0.20563593 },
  { key: 'venus', name: 'Venus', label: 'Venus', semiMajorAxisAu: 0.72333566, eccentricity: 0.00677672 },
  { key: 'mars', name: 'Mars', label: 'Mars', semiMajorAxisAu: 1.52371034, eccentricity: 0.09339410 },
  { key: 'jupiter', name: 'Jupiter', label: 'Jupiter', semiMajorAxisAu: 5.20288700, eccentricity: 0.04838624 },
  { key: 'saturn', name: 'Saturn', label: 'Saturn', semiMajorAxisAu: 9.53667594, eccentricity: 0.05386179 },
  { key: 'uranus', name: 'Uranus', label: 'Uranus', semiMajorAxisAu: 19.18916464, eccentricity: 0.04725744 },
  { key: 'neptune', name: 'Neptune', label: 'Neptune', semiMajorAxisAu: 30.06992276, eccentricity: 0.00859048 },
];

export const BODY_KEYS = BODIES.map((body) => body.key);
export const BODY_DEFAULT_KEY = 'mars';

// ── 슬라이더 범위 ────────────────────────────────────────────
/** θ = 태양에서 본 지구와 대상의 사잇각. 0° = 최근접, 180° = 태양 반대편. */
export const THETA_MIN_DEG = 0;
export const THETA_MAX_DEG = 180;
export const THETA_STEP_DEG = 1;
export const THETA_DEFAULT_DEG = 90;

/** 대화 턴 수. 한 턴은 질문 하나 + 답 하나다. */
export const TURNS_MIN = 1;
export const TURNS_MAX = 20;
export const TURNS_STEP = 1;
export const TURNS_DEFAULT = 8;

export const ROUND_TRIP_DEFAULT = true;

// ── 판정 임계값 ──────────────────────────────────────────────
/**
 * "이 천체의 지연"이라는 하나의 숫자가 얼마나 성립하는가를 **흔들림 배수**
 * (최원 지연 ÷ 최근접 지연)로 가른다. 편집 판단이지 통계 검정이 아니다.
 * 1.00배는 태양 — 지구 궤도 위 어디에 있든 같은 값이 나오는 유일한 대상이다.
 */
export const SWING_EDGE_MIN = 1.2;
export const SWING_BREAK_MIN = 3;

export const VERDICT_HOLD = 'hold';
export const VERDICT_EDGE = 'edge';
export const VERDICT_BREAK = 'break';

/** θ 곡선을 몇 점으로 훑는가. 슬라이더 눈금(1°)과 같은 간격이 되게 181로 둔다. */
export const SWEEP_POINT_COUNT = (THETA_MAX_DEG - THETA_MIN_DEG) / THETA_STEP_DEG + 1;

// ── 클램프 ───────────────────────────────────────────────────

/** 알 수 없는 키는 최솟값이 아니라 기본 천체로 돌아간다. */
export function model_clamp_body_key(key) {
  return BODY_KEYS.includes(key) ? key : BODY_DEFAULT_KEY;
}

export function model_clamp_theta(value) {
  const bounded = num_clamp_value(value, THETA_MIN_DEG, THETA_MAX_DEG);
  return Math.round(bounded / THETA_STEP_DEG) * THETA_STEP_DEG;
}

export function model_clamp_turns(value) {
  const bounded = num_clamp_value(value, TURNS_MIN, TURNS_MAX);
  return Math.round(bounded / TURNS_STEP) * TURNS_STEP;
}

/** 천체 하나를 키로 찾는다. 없으면 null — 조용히 기본값으로 바꾸지 않는다. */
export function model_read_body(key) {
  return BODIES.find((body) => body.key === key) ?? null;
}

/**
 * 유효범위 밖 조합은 조용히 숫자를 뱉지 않는다.
 * θ가 음수면 코사인이 같은 값을 내어 그럴듯한 거리가 나오고, 턴 수가 0.5면
 * "반 번의 대화"라는 없는 양이 카드에 찍힌다.
 */
export function model_check_parameters(bodyKey, thetaDegrees, turns) {
  if (!model_read_body(bodyKey)) {
    return { ok: false, message: `대상 천체 키가 목록에 없다: ${String(bodyKey)}` };
  }
  if (!Number.isFinite(thetaDegrees) || thetaDegrees < THETA_MIN_DEG || thetaDegrees > THETA_MAX_DEG) {
    return { ok: false, message: `θ는 ${THETA_MIN_DEG}~${THETA_MAX_DEG}° 사이여야 한다.` };
  }
  if (!Number.isInteger(turns) || turns < TURNS_MIN || turns > TURNS_MAX) {
    return { ok: false, message: `턴 수는 ${TURNS_MIN}~${TURNS_MAX}의 정수여야 한다.` };
  }
  return { ok: true, message: '' };
}

// ── 기하 ─────────────────────────────────────────────────────

/**
 * 사잇각 θ에서 두 원 위의 점 사이 거리(au). 코사인법칙 그대로다.
 * 태양(a = 0)이면 θ가 사라지고 a_E만 남는다.
 */
export function model_calculate_distance_au(semiMajorAxisAu, thetaDegrees) {
  const target = semiMajorAxisAu;
  const earth = EARTH_SEMI_MAJOR_AXIS_AU;
  const cosine = Math.cos(thetaDegrees * DEGREES_TO_RADIANS);
  const square = target * target + earth * earth - 2 * target * earth * cosine;
  // 부동소수점 때문에 θ = 0, a_p = a_E에서 −1e−17이 나올 수 있다. √(음수)는 NaN이다.
  return Math.sqrt(Math.max(0, square));
}

/** 거리(au) → 편도 지연(초). 환산 계수가 하나뿐이라 자릿수 사고가 날 자리가 없다. */
export function model_calculate_delay_seconds(distanceAu) {
  return distanceAu * AU_LIGHT_SECONDS;
}

/**
 * θ에 대한 거리 d(θ)가 가장 가파른 각.
 *
 * d(θ)는 코사인법칙의 현이라 **cos θ 자체가 아니다** — "90°에서 가장 가파르다"는
 * 직관은 d가 cos θ에 비례할 때만 맞는다. 실제로는 d² = a_p² + a_E² − 2a_pa_E·cosθ의
 * 극값 조건 d(d²)/dθ = 0을 풀어야 하고, 그 결과는
 *
 *   cos θ* = min(a_p, a_E) / max(a_p, a_E)
 *
 * 이다(두 반지름의 작은 쪽 나누기 큰 쪽). model.test.js가 이 식을 코드로 한 번 더
 * 부르는 대신, 거리 함수를 유한차분으로 직접 미분해 독립적으로 대조한다.
 *
 * 두 반지름의 비가 0에 가까워질 때(대상이 지구보다 훨씬 크거나 훨씬 작을 때)만
 * 90°로 다가간다 — 그 극한에서 d(θ) ≈ 큰 반지름 − 작은 반지름·cos θ로 근사되어
 * 실제로 cos θ 하나에 비례하기 때문이다. 두 반지름이 서로 가까울수록(비가 1에
 * 가까울수록) θ*는 0°로 내려간다. 화성(비 0.656)은 그 사이 어딘가, 48.98°다.
 */
export function model_calculate_steepest_theta_deg(bodyKey) {
  const body = model_read_body(bodyKey);
  if (!body) throw new Error(`대상 천체 키가 목록에 없다: ${String(bodyKey)}`);
  // 태양(a_p = 0)은 d(θ)가 애초에 θ와 무관하다(위 '태양은 θ가 무엇이든 같은 거리다' 참고) —
  // 어디서도 가팔라지지 않으니 "가장 가파른 각" 자체가 정의되지 않는다.
  if (!(body.semiMajorAxisAu > 0)) {
    throw new Error('대상 반지름이 0이면 거리가 θ와 무관해 가장 가파른 각이 정의되지 않는다.');
  }
  const larger = Math.max(body.semiMajorAxisAu, EARTH_SEMI_MAJOR_AXIS_AU);
  const smaller = Math.min(body.semiMajorAxisAu, EARTH_SEMI_MAJOR_AXIS_AU);
  return Math.acos(smaller / larger) / DEGREES_TO_RADIANS;
}

// ── 한 천체의 띠 ─────────────────────────────────────────────

/**
 * θ가 낼 수 있는 양 끝. 원궤도에서는 차와 합이다.
 *   |a_p − a_E| ≤ d ≤ a_p + a_E
 * 흔들림 배수는 그 둘의 비이고, 거리·초·분 어느 단위로 재도 같다.
 */
export function model_calculate_extremes(bodyKey) {
  const body = model_read_body(bodyKey);
  if (!body) throw new Error(`대상 천체 키가 목록에 없다: ${String(bodyKey)}`);

  const closestAu = Math.abs(body.semiMajorAxisAu - EARTH_SEMI_MAJOR_AXIS_AU);
  const farthestAu = body.semiMajorAxisAu + EARTH_SEMI_MAJOR_AXIS_AU;
  const closestSeconds = model_calculate_delay_seconds(closestAu);
  const farthestSeconds = model_calculate_delay_seconds(farthestAu);
  return {
    body,
    closestAu,
    farthestAu,
    closestSeconds,
    farthestSeconds,
    // 최근접이 0이 되는 천체는 목록에 없다(지구는 대상이 아니다). 그래도 0으로 나누지 않는다.
    swingRatio: closestSeconds > 0 ? farthestSeconds / closestSeconds : 1,
  };
}

/**
 * **이 모델 밖의 값.** 타원 궤도에서 두 천체가 가장 가까워지는 배치(바깥쪽의 근일점과
 * 안쪽의 원일점)와 가장 멀어지는 배치(양쪽 다 원일점, 태양을 사이에 두고)를 잰다.
 * 원궤도 근사가 양 끝에서 얼마나 좁은지를 본문 블록 7이 이 값으로 보인다.
 */
export function model_calculate_elliptic_band(bodyKey) {
  const body = model_read_body(bodyKey);
  if (!body) throw new Error(`대상 천체 키가 목록에 없다: ${String(bodyKey)}`);

  const targetPerihelionAu = body.semiMajorAxisAu * (1 - body.eccentricity);
  const targetAphelionAu = body.semiMajorAxisAu * (1 + body.eccentricity);
  const earthPerihelionAu = EARTH_SEMI_MAJOR_AXIS_AU * (1 - EARTH_ECCENTRICITY);
  const earthAphelionAu = EARTH_SEMI_MAJOR_AXIS_AU * (1 + EARTH_ECCENTRICITY);

  // 바깥쪽 궤도가 근일점에, 안쪽 궤도가 원일점에 있을 때 가장 가깝다.
  const outerPerihelionAu = body.semiMajorAxisAu > EARTH_SEMI_MAJOR_AXIS_AU ? targetPerihelionAu : earthPerihelionAu;
  const innerAphelionAu = body.semiMajorAxisAu > EARTH_SEMI_MAJOR_AXIS_AU ? earthAphelionAu : targetAphelionAu;

  const closestAu = Math.max(0, outerPerihelionAu - innerAphelionAu);
  const farthestAu = targetAphelionAu + earthAphelionAu;
  return {
    closestAu,
    farthestAu,
    closestSeconds: model_calculate_delay_seconds(closestAu),
    farthestSeconds: model_calculate_delay_seconds(farthestAu),
  };
}

// ── 판정 ─────────────────────────────────────────────────────

/** "이 천체의 지연"이 하나의 숫자로 성립하는가. 주어는 모델이다. */
export function model_calculate_verdict(swingRatio) {
  if (!(swingRatio >= SWING_EDGE_MIN)) return VERDICT_HOLD;
  if (swingRatio >= SWING_BREAK_MIN) return VERDICT_BREAK;
  return VERDICT_EDGE;
}

// ── 진입점 ───────────────────────────────────────────────────

/**
 * 화면 전체가 부르는 유일한 계산 경로. 카드·곡선·표가 전부 여기(또는 여기가 부르는
 * 함수)를 통과한다 — 두 벌을 두면 시간이 지나며 갈라진다.
 */
export function model_calculate_result(bodyKey, thetaDegrees, roundTrip, turns) {
  const check = model_check_parameters(bodyKey, thetaDegrees, turns);
  if (!check.ok) throw new Error(check.message);

  const extremes = model_calculate_extremes(bodyKey);
  const distanceAu = model_calculate_distance_au(extremes.body.semiMajorAxisAu, thetaDegrees);
  const oneWaySeconds = model_calculate_delay_seconds(distanceAu);
  const legCount = roundTrip ? LEGS_ROUND_TRIP : LEGS_ONE_WAY;

  return {
    body: extremes.body,
    thetaDegrees,
    roundTrip,
    turns,
    legCount,
    distanceAu,
    distanceMetres: distanceAu * AU_METRES,
    distanceMillionKm: (distanceAu * AU_METRES) / METRES_PER_KM / MILLION,
    oneWaySeconds,
    roundTripSeconds: oneWaySeconds * LEGS_ROUND_TRIP,
    /** 토글이 고른 쪽. 카드의 큰 숫자가 이것이다. */
    shownSeconds: oneWaySeconds * legCount,
    /** 대화 전체. 턴 수는 토글과 무관하게 언제나 왕복을 센다. */
    conversationSeconds: oneWaySeconds * LEGS_PER_TURN * turns,
    closestAu: extremes.closestAu,
    farthestAu: extremes.farthestAu,
    closestSeconds: extremes.closestSeconds,
    farthestSeconds: extremes.farthestSeconds,
    swingRatio: extremes.swingRatio,
    verdict: model_calculate_verdict(extremes.swingRatio),
    /** 지금 거리가 띠의 어디쯤인가 (0 = 최근접, 1 = 최원). 곡선의 커서가 쓴다. */
    bandPosition:
      extremes.farthestAu > extremes.closestAu
        ? (distanceAu - extremes.closestAu) / (extremes.farthestAu - extremes.closestAu)
        : 0,
  };
}

/** θ를 훑은 곡선. 편도와 왕복을 함께 낸다 — 두 선이 같은 축에서 두 배 차이로 보인다. */
export function model_calculate_sweep(bodyKey, pointCount = SWEEP_POINT_COUNT) {
  const body = model_read_body(bodyKey);
  if (!body || !(pointCount >= 2)) return [];

  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const thetaDegrees = THETA_MIN_DEG + ((THETA_MAX_DEG - THETA_MIN_DEG) * index) / (pointCount - 1);
    const oneWaySeconds = model_calculate_delay_seconds(
      model_calculate_distance_au(body.semiMajorAxisAu, thetaDegrees),
    );
    points.push({
      thetaDegrees,
      oneWaySeconds,
      roundTripSeconds: oneWaySeconds * LEGS_ROUND_TRIP,
    });
  }
  return points;
}

/**
 * 천체 여덟 개를 한 표로. 슬라이더를 하나도 안 움직이는 독자가 보는 것이 이것이다.
 * 각 행은 `model_calculate_extremes`가 낸 값 그대로다.
 */
export function model_calculate_body_table() {
  return BODY_KEYS.map((key) => {
    const extremes = model_calculate_extremes(key);
    return {
      ...extremes,
      roundTripFarthestSeconds: extremes.farthestSeconds * LEGS_ROUND_TRIP,
      verdict: model_calculate_verdict(extremes.swingRatio),
    };
  });
}
