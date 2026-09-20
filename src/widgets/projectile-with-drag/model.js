/**
 * 45°는 여전히 가장 멀리 가는가 — 항력 포함 포물선 운동 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 B (표준 공식 + 공표된 계수).
 *
 * 뉴턴 제2법칙에 힘 두 개:
 *     m·dv/dt = −m·g·ĵ − ½·ρ·Cd·A·|v|·v
 * m으로 나누면 발사체에 관한 모든 것이 k 하나로 모인다:
 *     dv/dt = −g·ĵ − k·|v|·v,   k = ρ·Cd·A / (2m)
 *
 * **경로가 둘이다.**
 *   ① 적분기 — 위 연립방정식을 고전 4차 Runge–Kutta로 전진시킨다.
 *   ② 진공 닫힌형 — 적분기를 전혀 쓰지 않는다. R = v₀²sin2θ/g 등.
 * Cd = 0이면 k가 사라져 두 경로가 같은 답을 내야 한다. 그것이 이 페이지의
 * 검수 포인트이고, **두 경로는 코드를 한 줄도 공유하지 않는다** —
 * 같은 모델을 두 번 돌려 "맞습니다"를 받는 것은 검증이 아니기 때문이다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 물리 상수 ───────────────────────────────────────────────

/**
 * 표준 중력가속도 g. **측정값이 아니라 채택된 규약값이다.**
 * 제3차 CGPM(1901)이 980.665 cm/s²를 표준값으로 채택했고, ISO 80000-3이
 * 그 숫자를 고정한다. 실제 중력은 위도·고도에 따라 천분의 몇씩 다르지만
 * 이 모델은 다르지 않다 — 슬라이더도 없다.
 */
export const PROJECTILE_GRAVITY_MS2 = 9.80665;

/**
 * 해면 표준 공기밀도 ρ. **측정값이 아니라 표준대기가 채택한 입력값이다.**
 * ISO 2533:1975 Table 1의 해면 조건(288.15 K, 101 325 Pa, 건조·청정 공기)에서
 * 채택한 값이다. 표준의 공기 몰질량이 이 값에서 기체법칙으로 유도되지 그 반대가
 * 아니다. 실제 공기가 이 조건에 있는 일이 드물어 슬라이더를 둔다.
 */
export const PROJECTILE_DENSITY_DEFAULT_KGM3 = 1.225;

/** 진공에서 사거리가 최대가 되는 각도. 유도가 두 줄이고 v₀·m·A에 의존하지 않는다. */
export const PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG = 45;

const DEGREES_PER_RADIAN = 180 / Math.PI;
/** 원의 지름 ↔ 단면적. A = π·d²/4 */
const CIRCLE_AREA_FACTOR = Math.PI / 4;
/** 항력식의 ½. 상수로 두면 단위 오류가 눈에 띈다. */
const DRAG_HALF = 0.5;
/** 등가속도 낙하 ½gt²의 ½. 항력식의 ½과 뜻이 다르므로 따로 둔다. */
const KINEMATIC_HALF = 0.5;
/** RK4의 중간 미분을 잡는 반스텝 계수. */
const RK4_HALF_STEP = 0.5;
/** RK4 가중평균 (k1 + 2k2 + 2k3 + k4)/6 의 6과 2. */
const RK4_WEIGHT_DIVISOR = 6;
const RK4_MIDDLE_WEIGHT = 2;
/** 이등분의 중점 — 초기 추정과 뉴턴 이탈 시의 폴백. */
const BISECTION_MIDPOINT = 0.5;
/** 황금분할이 남긴 구간의 중점. */
const OPTIMUM_MIDPOINT = 0.5;

// ── 슬라이더 범위 (위젯이 그대로 읽는다) ─────────────────────

export const PROJECTILE_ANGLE_MIN_DEG = 0;
export const PROJECTILE_ANGLE_MAX_DEG = 90;
export const PROJECTILE_ANGLE_STEP_DEG = 0.5;
export const PROJECTILE_ANGLE_DEFAULT_DEG = 40;

export const PROJECTILE_SPEED_MIN_MS = 5;
export const PROJECTILE_SPEED_MAX_MS = 80;
export const PROJECTILE_SPEED_STEP_MS = 1;
export const PROJECTILE_SPEED_DEFAULT_MS = 40;

/** 질량은 로그 눈금이다 — 2.7 g와 4 kg가 같은 슬라이더에 있어야 한다. */
export const PROJECTILE_MASS_MIN_KG = 0.01;
export const PROJECTILE_MASS_MAX_KG = 5;
export const PROJECTILE_MASS_DEFAULT_KG = 0.145;

export const PROJECTILE_DRAG_MIN = 0;
export const PROJECTILE_DRAG_MAX = 1.2;
export const PROJECTILE_DRAG_STEP = 0.01;
export const PROJECTILE_DRAG_DEFAULT = 0.47;

/** 단면적도 로그 눈금. **지름이 아니라 면적이다** — 모델식에 들어가는 것이 A다. */
export const PROJECTILE_AREA_MIN_M2 = 1e-4;
export const PROJECTILE_AREA_MAX_M2 = 0.2;
export const PROJECTILE_AREA_DEFAULT_M2 = 4.185e-3;

export const PROJECTILE_DENSITY_MIN_KGM3 = 0;
export const PROJECTILE_DENSITY_MAX_KGM3 = 1.5;
export const PROJECTILE_DENSITY_STEP_KGM3 = 0.005;

/**
 * 로그 슬라이더의 한 데케이드를 몇 칸으로 자르는가.
 * 눈금은 **기본값에 앵커한다** — 기본값이 눈금 위에 없으면 로드 즉시 손잡이가
 * 가리키는 값과 계산에 쓰인 값이 갈린다(클램프가 그 차이를 삼킨다).
 */
export const PROJECTILE_LOG_STEPS_PER_DECADE = 80;
/** 로그 눈금 값의 유효숫자. URL과 화면에 같은 숫자가 실리게 자릿수를 고정한다. */
const LOG_VALUE_SIGNIFICANT_DIGITS = 6;

// ── 적분기 설정 ─────────────────────────────────────────────

/**
 * RK4 스텝(초). 표시 정밀도보다 한참 아래에 둔다.
 * 화면의 숫자는 **미분방정식의 답이 아니라 적분기의 답**이므로,
 * 스텝을 바꿔도 표시 자릿수 안에서 변하지 않는 자리까지 내려야 한다.
 */
export const PROJECTILE_STEP_SECONDS = 0.005;
/** 폭주 방지. 유효범위 안에서는 닿지 않는다(v₀ 80 m/s·90°가 16.3초). */
const STEP_MAX_COUNT = 40000;
/** 착지·정점을 스텝 경계에서 자르지 않고 보간해 찾을 때의 허용오차(m, m/s). */
const CROSSING_TOLERANCE = 1e-12;
/** 보간 반복 상한. 뉴턴이 안 먹는 자리(θ=0)에서는 이등분으로 떨어진다. */
const CROSSING_MAX_ITERATIONS = 60;
/** 궤적을 그릴 때 몇 스텝마다 점을 남기는가. 요약값에는 영향이 없다. */
export const PROJECTILE_SAMPLE_EVERY = 4;

/** 각도 스윕을 몇 점으로 훑는가. 0°와 90°를 모두 포함한다. */
export const PROJECTILE_SWEEP_POINT_COUNT = 91;
/** 최적각을 몇 도까지 좁히는가. 스윕 격자 간격과 무관하게 이 값이 정밀도다. */
export const PROJECTILE_OPTIMUM_TOLERANCE_DEG = 0.005;
/** 황금분할 탐색 반복 상한. */
const OPTIMUM_MAX_ITERATIONS = 60;
const GOLDEN_RATIO_INVERSE = (Math.sqrt(5) - 1) / 2;

// ── 판정 임계값 ─────────────────────────────────────────────

/**
 * "45°가 최적"이라는 가정이 어디서 성립하고 어디서 파탄나는가.
 * 45°에서 밀려난 각도(도)로 잰다. 편집 판단이지 검정이 아니다.
 */
export const PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG = 1;
export const PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG = 5;

// ── 클램프 ──────────────────────────────────────────────────

/** 눈금 위로 맞춘다 — 슬라이더가 스냅하는 자리와 모델이 쓰는 값을 같게 둔다. */
function model_clamp_to_step(value, minValue, maxValue, step) {
  const bounded = num_clamp_value(value, minValue, maxValue);
  const snapped = minValue + Math.round((bounded - minValue) / step) * step;
  return Number(num_clamp_value(snapped, minValue, maxValue).toFixed(6));
}

export function model_clamp_angle(value) {
  return model_clamp_to_step(value, PROJECTILE_ANGLE_MIN_DEG, PROJECTILE_ANGLE_MAX_DEG, PROJECTILE_ANGLE_STEP_DEG);
}

export function model_clamp_speed(value) {
  return model_clamp_to_step(value, PROJECTILE_SPEED_MIN_MS, PROJECTILE_SPEED_MAX_MS, PROJECTILE_SPEED_STEP_MS);
}

export function model_clamp_drag(value) {
  return model_clamp_to_step(value, PROJECTILE_DRAG_MIN, PROJECTILE_DRAG_MAX, PROJECTILE_DRAG_STEP);
}

export function model_clamp_density(value) {
  return model_clamp_to_step(value, PROJECTILE_DENSITY_MIN_KGM3, PROJECTILE_DENSITY_MAX_KGM3, PROJECTILE_DENSITY_STEP_KGM3);
}

/**
 * 로그 눈금 한 축. 기본값을 0번 칸에 두고 양쪽으로 칸을 센다.
 * 인덱스가 음수일 수 있다 — 슬라이더의 min이 음수면 된다.
 */
function model_build_log_axis(minValue, maxValue, defaultValue) {
  const perDecade = PROJECTILE_LOG_STEPS_PER_DECADE;
  return {
    minValue,
    maxValue,
    defaultValue,
    perDecade,
    // 양 끝은 바깥쪽으로 한 칸 넘겨 잡고 클램프가 정확히 min·max에 앉힌다.
    indexMin: Math.floor(Math.log10(minValue / defaultValue) * perDecade),
    indexMax: Math.ceil(Math.log10(maxValue / defaultValue) * perDecade),
  };
}

export const PROJECTILE_MASS_AXIS = model_build_log_axis(
  PROJECTILE_MASS_MIN_KG, PROJECTILE_MASS_MAX_KG, PROJECTILE_MASS_DEFAULT_KG,
);
export const PROJECTILE_AREA_AXIS = model_build_log_axis(
  PROJECTILE_AREA_MIN_M2, PROJECTILE_AREA_MAX_M2, PROJECTILE_AREA_DEFAULT_M2,
);

/** 로그 슬라이더의 칸 번호 → 실제 값. */
export function model_calculate_log_value(axis, index) {
  const bounded = num_clamp_value(Math.round(index), axis.indexMin, axis.indexMax);
  const raw = axis.defaultValue * Math.pow(10, bounded / axis.perDecade);
  const clipped = num_clamp_value(raw, axis.minValue, axis.maxValue);
  return Number(clipped.toPrecision(LOG_VALUE_SIGNIFICANT_DIGITS));
}

/** 실제 값 → 가장 가까운 칸 번호. 값이 눈금 밖이면 끝 칸. */
export function model_calculate_log_index(axis, value) {
  if (!(value > 0) || !Number.isFinite(value)) return 0;
  const raw = Math.log10(value / axis.defaultValue) * axis.perDecade;
  return num_clamp_value(Math.round(raw), axis.indexMin, axis.indexMax);
}

/** 눈금 위의 값으로 맞춘다. 로그 축이므로 `log(0)`을 먼저 막는다. */
export function model_clamp_mass(value) {
  return model_calculate_log_value(PROJECTILE_MASS_AXIS, model_calculate_log_index(PROJECTILE_MASS_AXIS, value));
}

export function model_clamp_area(value) {
  return model_calculate_log_value(PROJECTILE_AREA_AXIS, model_calculate_log_index(PROJECTILE_AREA_AXIS, value));
}

// ── 물체 프리셋 ─────────────────────────────────────────────

/**
 * 프리셋의 원 치수. 지름(m)과 질량(kg)으로 적고 단면적은 πd²/4로 만든다 —
 * 슬라이더가 받는 것은 면적이지만 사람이 아는 것은 지름이다.
 * **상표·제품명을 쓰지 않는다** (절대 규칙 4). 종목 도구의 일반명만 쓴다.
 */
const PRESET_SHAPES = [
  { key: 'baseball', label: 'Baseball', massKg: 0.145, diameterM: 0.073 },
  { key: 'tennis', label: 'Tennis ball', massKg: 0.058, diameterM: 0.067 },
  { key: 'shot', label: 'Shot put', massKg: 4, diameterM: 0.095 },
  { key: 'beachball', label: 'Beach ball', massKg: 0.12, diameterM: 0.4 },
];

/**
 * 프리셋은 질량·면적·Cd를 한 번에 갈아끼운다.
 *
 * 값은 **미리 클램프해 둔다** — 로그 슬라이더의 눈금 위에 얹히지 않은 값을
 * 프리셋이 심으면, 버튼을 누른 직후 손잡이 위치와 계산에 쓰인 값이 갈린다.
 * 그러면 `aria-pressed`도 영영 켜지지 않는다.
 *
 * `vacuum`만 예외로 **Cd만 0으로** 둔다 — 질량과 면적을 건드리지 않아야
 * "Cd = 0이면 무거움도 넓이도 답을 바꾸지 못한다"가 화면에서 보인다.
 */
export const PROJECTILE_PRESETS = [
  ...PRESET_SHAPES.map((shape) => ({
    key: shape.key,
    label: shape.label,
    massKg: model_clamp_mass(shape.massKg),
    areaM2: model_clamp_area(model_calculate_area(shape.diameterM)),
    dragCoefficient: PROJECTILE_DRAG_DEFAULT,
  })),
  {
    key: 'vacuum',
    label: 'Vacuum (no air)',
    dragCoefficient: PROJECTILE_DRAG_MIN,
  },
];

/** 기본 파라미터 한 벌. 위젯이 빈 폼으로 뜨지 않게 하는 자리. */
export function model_build_default_parameters() {
  return {
    angleDeg: PROJECTILE_ANGLE_DEFAULT_DEG,
    speedMs: PROJECTILE_SPEED_DEFAULT_MS,
    massKg: PROJECTILE_MASS_DEFAULT_KG,
    dragCoefficient: PROJECTILE_DRAG_DEFAULT,
    areaM2: PROJECTILE_AREA_DEFAULT_M2,
    densityKgM3: PROJECTILE_DENSITY_DEFAULT_KGM3,
  };
}

// ── 파라미터 검사 ───────────────────────────────────────────

/**
 * 유효범위 밖 조합은 **조용히 숫자를 뱉지 않는다.**
 * 질량 0이면 k가 무한대, v₀가 0이면 발사가 아니다 — 둘 다 그럴듯한 숫자를 낸다.
 */
export function model_check_parameters(params) {
  const checks = [
    ['angleDeg', PROJECTILE_ANGLE_MIN_DEG, PROJECTILE_ANGLE_MAX_DEG, '발사각(도)'],
    ['speedMs', PROJECTILE_SPEED_MIN_MS, PROJECTILE_SPEED_MAX_MS, '발사속력(m/s)'],
    ['massKg', PROJECTILE_MASS_MIN_KG, PROJECTILE_MASS_MAX_KG, '질량(kg)'],
    ['dragCoefficient', PROJECTILE_DRAG_MIN, PROJECTILE_DRAG_MAX, '항력계수'],
    ['areaM2', PROJECTILE_AREA_MIN_M2, PROJECTILE_AREA_MAX_M2, '단면적(m²)'],
    ['densityKgM3', PROJECTILE_DENSITY_MIN_KGM3, PROJECTILE_DENSITY_MAX_KGM3, '공기밀도(kg/m³)'],
  ];
  if (!params || typeof params !== 'object') {
    return { ok: false, message: '파라미터 객체가 없다.' };
  }
  for (const [key, minValue, maxValue, name] of checks) {
    const value = params[key];
    if (!Number.isFinite(value) || value < minValue || value > maxValue) {
      return { ok: false, message: `${name}는 ${minValue}~${maxValue} 사이여야 한다 (받은 값: ${value}).` };
    }
  }
  return { ok: true, message: '' };
}

function model_read_checked_parameters(params) {
  const checked = model_check_parameters(params);
  if (!checked.ok) throw new RangeError(checked.message);
  return params;
}

// ── 경로 ① 적분기 ───────────────────────────────────────────

/**
 * 항력 묶음 k = ρ·Cd·A / (2m). 단위는 1/m다 —
 * 그래서 1/k가 길이이고 √(g/k)가 속력(종단속도)이 된다.
 */
export function model_calculate_drag_factor(params) {
  model_read_checked_parameters(params);
  return (DRAG_HALF * params.densityKgM3 * params.dragCoefficient * params.areaM2) / params.massKg;
}

/** 종단속도 √(g/k). k = 0이면 항력이 없어 정의되지 않는다(무한대). */
export function model_calculate_terminal_speed(dragFactor) {
  if (!(dragFactor > 0)) return Number.POSITIVE_INFINITY;
  return Math.sqrt(PROJECTILE_GRAVITY_MS2 / dragFactor);
}

/**
 * 이 발사에 항력이 실제로 있는가 — **항력항 자체**로 판정한다.
 * 두 경로(항력·진공)의 사거리 차이로 판정하면 안 된다: θ=0°나 θ=90°에서는
 * 항력이 있어도 수평 사거리가 우연히 0에 가까워 "공기가 없다"는 오판을 낸다.
 * 항력이 정말 없는 경우는 밀도·항력계수·단면적 셋 중 하나가 정확히 0일 때뿐이다.
 */
export function model_check_has_drag(params) {
  return params.densityKgM3 * params.dragCoefficient * params.areaM2 !== 0;
}

/** 상태 하나의 속력. */
export function model_read_speed(state) {
  return Math.hypot(state.vx, state.vy);
}

/**
 * 연립방정식의 우변.
 *     dx/dt = vx,  dy/dt = vy
 *     dvx/dt = −k·|v|·vx
 *     dvy/dt = −g − k·|v|·vy
 * |v|·v로 적으면 부호 규칙 없이도 항력이 언제나 운동 반대쪽을 가리킨다.
 */
function model_calculate_derivative(state, dragFactor) {
  const speed = Math.hypot(state.vx, state.vy);
  return {
    x: state.vx,
    y: state.vy,
    vx: -dragFactor * speed * state.vx,
    vy: -PROJECTILE_GRAVITY_MS2 - dragFactor * speed * state.vy,
  };
}

function model_calculate_shifted(state, derivative, stepSeconds) {
  return {
    t: state.t + stepSeconds,
    x: state.x + derivative.x * stepSeconds,
    y: state.y + derivative.y * stepSeconds,
    vx: state.vx + derivative.vx * stepSeconds,
    vy: state.vy + derivative.vy * stepSeconds,
  };
}

/**
 * 고전 4차 Runge–Kutta 한 스텝. 미분 네 번을 가중평균한다.
 * 전역 오차가 스텝 크기의 4제곱으로 준다 — 그 수렴 차수를 테스트가 실제로 잰다.
 */
export function model_calculate_step(state, dragFactor, stepSeconds) {
  const half = stepSeconds * RK4_HALF_STEP;
  const k1 = model_calculate_derivative(state, dragFactor);
  const k2 = model_calculate_derivative(model_calculate_shifted(state, k1, half), dragFactor);
  const k3 = model_calculate_derivative(model_calculate_shifted(state, k2, half), dragFactor);
  const k4 = model_calculate_derivative(model_calculate_shifted(state, k3, stepSeconds), dragFactor);
  const weight = stepSeconds / RK4_WEIGHT_DIVISOR;
  return {
    t: state.t + stepSeconds,
    x: state.x + weight * (k1.x + RK4_MIDDLE_WEIGHT * k2.x + RK4_MIDDLE_WEIGHT * k3.x + k4.x),
    y: state.y + weight * (k1.y + RK4_MIDDLE_WEIGHT * k2.y + RK4_MIDDLE_WEIGHT * k3.y + k4.y),
    vx: state.vx + weight * (k1.vx + RK4_MIDDLE_WEIGHT * k2.vx + RK4_MIDDLE_WEIGHT * k3.vx + k4.vx),
    vy: state.vy + weight * (k1.vy + RK4_MIDDLE_WEIGHT * k2.vy + RK4_MIDDLE_WEIGHT * k3.vy + k4.vy),
  };
}

/**
 * 스텝 경계에서 자르지 않고 **부분 스텝을 뉴턴으로 좁혀** 교차점을 찾는다.
 *
 * 경계에서 자르면 사거리가 스텝 크기에 따라 달라진다 — 0.005초 스텝이면
 * 15 cm씩 널뛴다. 선형 보간으로는 진공 해석해와 10자리까지 맞출 수 없다.
 * 그래서 시작 상태에서 크기 h짜리 RK4를 다시 밟으며 h를 푼다.
 * 뉴턴이 구간 밖으로 나가면 이등분으로 떨어진다(θ = 0에서 실제로 그렇다).
 */
function model_calculate_crossing(startState, dragFactor, spanSeconds, read_value, read_slope) {
  let low = 0;
  let high = spanSeconds;
  let guess = spanSeconds * BISECTION_MIDPOINT;
  let best = model_calculate_step(startState, dragFactor, guess);
  for (let index = 0; index < CROSSING_MAX_ITERATIONS; index += 1) {
    const value = read_value(best);
    if (Math.abs(value) <= CROSSING_TOLERANCE) return best;
    if (value > 0) low = guess;
    else high = guess;
    const slope = read_slope(best, dragFactor);
    const stepped = slope === 0 ? Number.NaN : guess - value / slope;
    guess = Number.isFinite(stepped) && stepped > low && stepped < high ? stepped : (low + high) * BISECTION_MIDPOINT;
    best = model_calculate_step(startState, dragFactor, guess);
  }
  return best;
}

const model_read_height = (state) => state.y;
const model_read_height_slope = (state) => state.vy;
const model_read_rise = (state) => state.vy;
const model_read_rise_slope = (state, dragFactor) => model_calculate_derivative(state, dragFactor).vy;

/**
 * 적분 경로 하나. 발사에서 착지까지.
 *
 * options.stepSeconds — 스텝 크기. 기본값은 표시 정밀도보다 훨씬 아래.
 * options.samplePoints — 궤적 점을 남길지. **요약값은 이 옵션과 무관하다** —
 *   모델이 규정하지 않은 자유도를 바꿔도 답이 같아야 한다.
 */
export function model_calculate_flight(params, options = {}) {
  model_read_checked_parameters(params);
  const stepSeconds = options.stepSeconds ?? PROJECTILE_STEP_SECONDS;
  if (!(stepSeconds > 0)) throw new RangeError('적분 스텝은 0보다 커야 한다.');
  const samplePoints = options.samplePoints === true;

  const dragFactor = model_calculate_drag_factor(params);
  const radians = params.angleDeg / DEGREES_PER_RADIAN;
  let state = {
    t: 0,
    x: 0,
    y: 0,
    vx: params.speedMs * Math.cos(radians),
    vy: params.speedMs * Math.sin(radians),
  };

  const points = samplePoints ? [{ x: state.x, y: state.y }] : null;
  let apex = state;
  let previous = state;
  // θ = 0이면 위로 가는 성분이 없어 발사점이 곧 착지점이다. 적분을 시작하면
  // 첫 스텝에서 y가 음수가 되고, 교차점 탐색이 h → 0으로 기어가다 허용오차에서
  // 멈춰 **사거리 0 대신 수십 마이크로미터**를 낸다. 여기서 먼저 끝낸다.
  let landed = state.vy > 0 ? null : state;

  for (let index = 1; landed === null && index <= STEP_MAX_COUNT; index += 1) {
    previous = state;
    state = model_calculate_step(state, dragFactor, stepSeconds);

    // 정점 — vy의 부호가 바뀌는 자리. 경계로 자르면 정점 높이가 스텝에 매인다.
    if (previous.vy > 0 && state.vy <= 0) {
      apex = model_calculate_crossing(previous, dragFactor, stepSeconds, model_read_rise, model_read_rise_slope);
    }

    if (state.y < 0) {
      landed = model_calculate_crossing(previous, dragFactor, stepSeconds, model_read_height, model_read_height_slope);
      if (points) points.push({ x: landed.x, y: 0 });
      break;
    }
    if (points && index % PROJECTILE_SAMPLE_EVERY === 0) points.push({ x: state.x, y: state.y });
  }

  if (!landed) throw new RangeError('적분이 스텝 상한 안에 착지하지 못했다.');
  // vy가 처음부터 0 이하면(θ = 0) 정점은 발사점이다.
  if (apex.t > landed.t) apex = landed;

  const apexSpeedMs = model_read_speed(apex);
  return {
    dragFactor,
    hasDrag: model_check_has_drag(params),
    terminalSpeedMs: model_calculate_terminal_speed(dragFactor),
    rangeMetres: landed.x,
    flightSeconds: landed.t,
    landingSpeedMs: model_read_speed(landed),
    apexHeightMetres: apex.y,
    apexSpeedMs,
    apexSeconds: apex.t,
    apexDragMs2: dragFactor * apexSpeedMs * apexSpeedMs,
    launchDragMs2: dragFactor * params.speedMs * params.speedMs,
    stepSeconds,
    points,
  };
}

// ── 경로 ② 진공 닫힌형 ─────────────────────────────────────

/**
 * **적분기를 부르지 않는다.** 여기가 대조 경로다.
 *     R = v₀²·sin2θ / g,  H = v₀²·sin²θ / 2g,  T = 2·v₀·sinθ / g
 * 질량·면적·Cd·ρ가 식에 없다 — 그래서 그 네 슬라이더가 유령선을 움직이지 못한다.
 */
export function model_calculate_vacuum(params) {
  model_read_checked_parameters(params);
  const radians = params.angleDeg / DEGREES_PER_RADIAN;
  const speed = params.speedMs;
  const rise = speed * Math.sin(radians);
  return {
    rangeMetres: (speed * speed * Math.sin(2 * radians)) / PROJECTILE_GRAVITY_MS2,
    apexHeightMetres: (rise * rise) / (2 * PROJECTILE_GRAVITY_MS2),
    flightSeconds: (2 * rise) / PROJECTILE_GRAVITY_MS2,
    // 대칭이므로 나간 속력 그대로 돌아온다. 정점에서는 수평 성분만 남는다.
    landingSpeedMs: speed,
    apexSpeedMs: speed * Math.cos(radians),
    apexSeconds: rise / PROJECTILE_GRAVITY_MS2,
  };
}

/** 유령선의 점들. 같은 닫힌형에서 나온다 — 여기서도 적분하지 않는다. */
export function model_build_vacuum_path(params, pointCount) {
  const vacuum = model_calculate_vacuum(params);
  const count = Math.max(2, Math.round(pointCount));
  const radians = params.angleDeg / DEGREES_PER_RADIAN;
  const rise = params.speedMs * Math.sin(radians);
  const run = params.speedMs * Math.cos(radians);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const time = (vacuum.flightSeconds * index) / (count - 1);
    points.push({
      x: run * time,
      y: Math.max(0, rise * time - KINEMATIC_HALF * PROJECTILE_GRAVITY_MS2 * time * time),
    });
  }
  return points;
}

// ── 요약 (화면이 읽는 유일한 자리) ──────────────────────────

/**
 * 두 경로를 한 번에. 카드·표·궤적 차트가 전부 이것 하나를 읽는다 —
 * 요약값용 루프를 따로 두면 시간이 지나며 표와 그래프가 갈라진다.
 */
export function model_calculate_summary(params, options = {}) {
  const drag = model_calculate_flight(params, { ...options, samplePoints: true });
  const vacuum = model_calculate_vacuum(params);
  return {
    params,
    drag,
    vacuum,
    vacuumPoints: model_build_vacuum_path(params, drag.points.length),
    rangeRatio: vacuum.rangeMetres > 0 ? drag.rangeMetres / vacuum.rangeMetres : 1,
    rangeLostMetres: vacuum.rangeMetres - drag.rangeMetres,
  };
}

// ── 각도 스윕과 최적각 ──────────────────────────────────────

function model_calculate_range_at(params, angleDeg, options) {
  return model_calculate_flight({ ...params, angleDeg }, options).rangeMetres;
}

/**
 * 황금분할 탐색. **스윕 격자 해상도와 무관하게** 최적각을 좁힌다 —
 * 격자의 최댓값을 그대로 쓰면 격자를 성기게 하는 것만으로 답이 달라진다.
 */
function model_calculate_peak(params, lowDeg, highDeg, options) {
  let low = lowDeg;
  let high = highDeg;
  let innerLow = high - GOLDEN_RATIO_INVERSE * (high - low);
  let innerHigh = low + GOLDEN_RATIO_INVERSE * (high - low);
  let valueLow = model_calculate_range_at(params, innerLow, options);
  let valueHigh = model_calculate_range_at(params, innerHigh, options);

  for (let index = 0; index < OPTIMUM_MAX_ITERATIONS; index += 1) {
    if (high - low <= PROJECTILE_OPTIMUM_TOLERANCE_DEG) break;
    if (valueLow > valueHigh) {
      high = innerHigh;
      innerHigh = innerLow;
      valueHigh = valueLow;
      innerLow = high - GOLDEN_RATIO_INVERSE * (high - low);
      valueLow = model_calculate_range_at(params, innerLow, options);
    } else {
      low = innerLow;
      innerLow = innerHigh;
      valueLow = valueHigh;
      innerHigh = low + GOLDEN_RATIO_INVERSE * (high - low);
      valueHigh = model_calculate_range_at(params, innerHigh, options);
    }
  }
  const angleDeg = (low + high) * OPTIMUM_MIDPOINT;
  return { angleDeg, rangeMetres: model_calculate_range_at(params, angleDeg, options) };
}

/**
 * 0°에서 90°까지 훑어 사거리 곡선 두 벌(항력·진공)을 만들고,
 * 격자 최댓값 주변을 다시 좁혀 최적각을 낸다.
 */
export function model_calculate_sweep(params, options = {}) {
  model_read_checked_parameters(params);
  const count = Math.max(2, Math.round(options.pointCount ?? PROJECTILE_SWEEP_POINT_COUNT));
  const spanDeg = PROJECTILE_ANGLE_MAX_DEG - PROJECTILE_ANGLE_MIN_DEG;
  const gapDeg = spanDeg / (count - 1);

  const points = [];
  let bestIndex = 0;
  for (let index = 0; index < count; index += 1) {
    const angleDeg = PROJECTILE_ANGLE_MIN_DEG + gapDeg * index;
    const point = {
      angleDeg,
      dragRangeMetres: model_calculate_range_at(params, angleDeg, options),
      vacuumRangeMetres: model_calculate_vacuum({ ...params, angleDeg }).rangeMetres,
    };
    points.push(point);
    if (point.dragRangeMetres > points[bestIndex].dragRangeMetres) bestIndex = index;
  }

  const lowDeg = points[Math.max(0, bestIndex - 1)].angleDeg;
  const highDeg = points[Math.min(count - 1, bestIndex + 1)].angleDeg;
  const optimum = model_calculate_peak(params, lowDeg, highDeg, options);

  return {
    points,
    gapDeg,
    optimum,
    vacuumOptimum: {
      angleDeg: PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG,
      rangeMetres: model_calculate_vacuum({ ...params, angleDeg: PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG }).rangeMetres,
    },
  };
}

// ── 판정 ────────────────────────────────────────────────────

/** "45°가 최적"이라는 가정이 성립/경계/파탄 중 어디에 있는가. */
export function model_calculate_verdict(optimumAngleDeg) {
  const shift = Math.abs(PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG - optimumAngleDeg);
  if (shift >= PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG) return 'break';
  if (shift >= PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG) return 'edge';
  return 'hold';
}

// ── 표시용 파생값 ───────────────────────────────────────────

/** 면적에서 같은 넓이를 갖는 원의 지름. 슬라이더는 A지만 사람은 지름으로 읽는다. */
export function model_calculate_diameter(areaM2) {
  if (!(areaM2 > 0)) return 0;
  return Math.sqrt(areaM2 / CIRCLE_AREA_FACTOR);
}

/** 지름에서 단면적. 프리셋 값을 손으로 적을 때 쓰는 역함수다. */
export function model_calculate_area(diameterMetres) {
  return CIRCLE_AREA_FACTOR * diameterMetres * diameterMetres;
}
