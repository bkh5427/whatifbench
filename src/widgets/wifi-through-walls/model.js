/**
 * Wi-Fi through walls — 링크 버짓 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 B (표준 공식 + 공표된 계수, 유효범위가 문헌에 있음).
 *
 * 세 조각이다.
 *   ① 자유공간 손실 FSPL — Recommendation ITU-R P.525-5, 식 (6)
 *   ② 벽 한 장의 투과손실 L — Recommendation ITU-R P.2040-4, 식 (43b)·(44)(q).
 *      공기 중에 놓인 균질 슬래브 한 겹, 평면파 수직 입사
 *   ③ 링크 버짓 — 그 둘의 뺄셈:  P_rx = EIRP − FSPL(d, f) − Σ Lᵢ
 *
 * **단위 전제가 이 파일에서 가장 위험한 자리다.**
 * 32.4478이라는 상수는 전파의 성질이 아니라 **km와 MHz라는 단위 한 쌍의 성질**이다.
 * 같은 식을 미터·헤르츠로 적으면 상수가 −147.55가 되고, km·GHz면 +92.45,
 * m·MHz면 −27.55가 된다. 상수를 손으로 적어 두면 단위를 바꾼 사람이
 * **그럴듯한 숫자를 얻고 60 dB를 잃는다.**
 * 그래서 이 파일은 상수를 적지 않고 `model_calculate_fspl_constant`가
 * 단위에서 만든다. 상수 이름에 단위쌍을 박아 두었고, model.test.js가
 * 다섯 단위쌍의 값을 전부 리터럴로 못박는다.
 *
 * 복소수 헬퍼가 이 파일 안에 있다. `_shared/`에 올리지 않은 이유는 하나다 —
 * 지금 이것을 쓰는 위젯이 하나뿐이고, 공용 모듈은 **둘 이상이 쓸 때** 올라간다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 물리상수·단위 환산 ─────────────────────────────────────
export const SPEED_OF_LIGHT_MS = 299792458;
/** 진공 유전율. η″ = σ/(2πfε₀)를 만드는 데만 쓴다. CODATA 2018. */
const VACUUM_PERMITTIVITY_F_PER_M = 8.8541878128e-12;

const METRES_PER_KILOMETRE = 1000;
const MILLIMETRES_PER_METRE = 1000;
const HERTZ_PER_KILOHERTZ = 1e3;
const HERTZ_PER_MEGAHERTZ = 1e6;
const HERTZ_PER_GIGAHERTZ = 1e9;
const MEGAHERTZ_PER_GIGAHERTZ = 1000;

/** 전계 진폭을 dB로 옮기는 계수. 전력이면 10, 진폭이면 20. */
const DECIBEL_FIELD_FACTOR = 20;
const FOUR_PI = 4 * Math.PI;
const TWO_PI = 2 * Math.PI;

/**
 * η″ = 17.98·σ/f_GHz 의 17.98. P.2040이 인쇄해 둔 값이지만
 * 여기서는 ε₀에서 만든다 — 인쇄값을 베끼면 그것이 어디서 온 수인지가 코드에서 사라진다.
 * 1/(2π·ε₀·10⁹) = 17.9751. 권고문의 17.98과 소수 둘째 자리에서 같다.
 */
export const PERMITTIVITY_LOSS_FACTOR_GHZ =
  1 / (TWO_PI * VACUUM_PERMITTIVITY_F_PER_M * HERTZ_PER_GIGAHERTZ);

// ── 자유공간 손실의 상수 ───────────────────────────────────

/**
 * FSPL 식의 상수항을 **단위쌍에서** 만든다.
 *
 *   FSPL(dB) = 20·log₁₀(d) + 20·log₁₀(f) + K(단위)
 *   K(단위)  = 20·log₁₀(4π/c) + 20·log₁₀(거리단위의 미터값) + 20·log₁₀(주파수단위의 헤르츠값)
 *
 * @param {number} distanceUnitMetres  거리 1단위가 몇 미터인가 (km이면 1000)
 * @param {number} frequencyUnitHertz  주파수 1단위가 몇 헤르츠인가 (MHz이면 1e6)
 */
export function model_calculate_fspl_constant(distanceUnitMetres, frequencyUnitHertz) {
  if (!(distanceUnitMetres > 0) || !(frequencyUnitHertz > 0)) {
    throw new Error('FSPL 상수의 단위는 양수여야 한다.');
  }
  return (
    DECIBEL_FIELD_FACTOR * Math.log10(FOUR_PI / SPEED_OF_LIGHT_MS) +
    DECIBEL_FIELD_FACTOR * Math.log10(distanceUnitMetres) +
    DECIBEL_FIELD_FACTOR * Math.log10(frequencyUnitHertz)
  );
}

/** 이 모델이 실제로 쓰는 단위쌍은 **km과 MHz** 하나뿐이다. 나머지는 대조용이다. */
export const FSPL_CONSTANT_KM_MHZ = model_calculate_fspl_constant(METRES_PER_KILOMETRE, HERTZ_PER_MEGAHERTZ);
export const FSPL_CONSTANT_M_HZ = model_calculate_fspl_constant(1, 1);
export const FSPL_CONSTANT_M_KHZ = model_calculate_fspl_constant(1, HERTZ_PER_KILOHERTZ);
export const FSPL_CONSTANT_M_MHZ = model_calculate_fspl_constant(1, HERTZ_PER_MEGAHERTZ);
export const FSPL_CONSTANT_M_GHZ = model_calculate_fspl_constant(1, HERTZ_PER_GIGAHERTZ);
export const FSPL_CONSTANT_KM_GHZ = model_calculate_fspl_constant(METRES_PER_KILOMETRE, HERTZ_PER_GIGAHERTZ);

// ── 재질 계수표 ────────────────────────────────────────────
/**
 * Recommendation ITU-R P.2040-4 (09/2025), § 3, Table 3 "Examples of material properties" (1–100 GHz 행은 -3과 같다).
 * η′ = a·f^b, σ = c·f^d, f는 GHz. `fitLowGHz`~`fitHighGHz`는 그 표가 밝힌
 * **측정이 맞춰진 주파수 구간**이다 — 밖에서 값을 뽑으면 외삽이고, 이 모델은 던진다.
 *
 * 모든 b가 0이다: 표는 유전율의 주파수 의존을 보고하지 않는다.
 * 그래서 이 모델의 밴드 의존성은 전부 σ와 파장에서 온다.
 *
 * `unitNoun`은 화면이 "벽 한 장"을 부르는 이름이다 — 석고보드는 sheet, 유리는 pane.
 *
 * 두께의 min/max/default/step은 **인용이 아니라 슬라이더 설정**이다.
 * "벽 한 장이 몇 mm인가"를 정하는 표준은 찾지 못했다.
 */
export const WIFI_MATERIALS = {
  concrete: {
    key: 'concrete',
    label: 'Concrete',
    unitNoun: 'wall',
    // P.2040-4 Table 3: concrete, 1–100 GHz
    epsilonFactor: 5.24, epsilonExponent: 0, sigmaFactor: 0.0462, sigmaExponent: 0.7822,
    fitLowGHz: 1, fitHighGHz: 100,
    thicknessMinMm: 50, thicknessMaxMm: 300, thicknessStepMm: 5, thicknessDefaultMm: 100,
  },
  brick: {
    key: 'brick',
    label: 'Brick',
    unitNoun: 'wall',
    // P.2040-4 Table 3: brick, 1–40 GHz — 이 모델의 재질 중 유효구간이 가장 좁다
    epsilonFactor: 3.91, epsilonExponent: 0, sigmaFactor: 0.0238, sigmaExponent: 0.16,
    fitLowGHz: 1, fitHighGHz: 40,
    thicknessMinMm: 50, thicknessMaxMm: 250, thicknessStepMm: 5, thicknessDefaultMm: 100,
  },
  plasterboard: {
    key: 'plasterboard',
    label: 'Plasterboard',
    unitNoun: 'sheet',
    // P.2040-4 Table 3: plasterboard, 1–100 GHz
    epsilonFactor: 2.73, epsilonExponent: 0, sigmaFactor: 0.0085, sigmaExponent: 0.9395,
    fitLowGHz: 1, fitHighGHz: 100,
    thicknessMinMm: 9, thicknessMaxMm: 25, thicknessStepMm: 0.5, thicknessDefaultMm: 12.5,
  },
  wood: {
    key: 'wood',
    label: 'Wood',
    unitNoun: 'panel',
    // P.2040-4 Table 3: wood, 0.001–100 GHz
    epsilonFactor: 1.99, epsilonExponent: 0, sigmaFactor: 0.0047, sigmaExponent: 1.0718,
    fitLowGHz: 0.001, fitHighGHz: 100,
    thicknessMinMm: 15, thicknessMaxMm: 60, thicknessStepMm: 1, thicknessDefaultMm: 40,
  },
  glass: {
    key: 'glass',
    label: 'Glass',
    unitNoun: 'pane',
    // P.2040-4 Table 3: glass, 0.1–100 GHz
    epsilonFactor: 6.31, epsilonExponent: 0, sigmaFactor: 0.0036, sigmaExponent: 1.3394,
    fitLowGHz: 0.1, fitHighGHz: 100,
    thicknessMinMm: 3, thicknessMaxMm: 12, thicknessStepMm: 0.5, thicknessDefaultMm: 6,
  },
};

export const WIFI_MATERIAL_KEYS = Object.keys(WIFI_MATERIALS);
export const WIFI_MATERIAL_DEFAULT = 'concrete';

// ── 대역 ───────────────────────────────────────────────────
/**
 * 중심주파수는 **고른 것이지 유도한 것이 아니다.** 셋 다 대역 한가운데 근처의 한 점이다.
 * 대역 끝에서 끝까지가 자유공간 손실로 몇 dB인지는 블록 7이 적는다.
 */
export const WIFI_BAND_24 = 'b24';
export const WIFI_BAND_5 = 'b5';
export const WIFI_BAND_6 = 'b6';

export const WIFI_BANDS = [
  { key: WIFI_BAND_24, label: '2.4 GHz', frequencyMHz: 2437, edgeLowMHz: 2412, edgeHighMHz: 2472 },
  { key: WIFI_BAND_5, label: '5 GHz', frequencyMHz: 5500, edgeLowMHz: 5150, edgeHighMHz: 5895 },
  { key: WIFI_BAND_6, label: '6 GHz', frequencyMHz: 6525, edgeLowMHz: 5925, edgeHighMHz: 7125 },
];

// ── 슬라이더 범위 ──────────────────────────────────────────

/** 거리. 로그 눈금이지만 **연속 매핑이 아니다** — 아래 사다리의 인덱스를 슬라이더가 민다. */
export const WIFI_DISTANCE_MIN_M = 0.5;
export const WIFI_DISTANCE_MAX_M = 50;
export const WIFI_DISTANCE_DEFAULT_M = 10;
/**
 * 1-1.2-1.5-2-2.5-3-4-5-6-7-8-9 계열. 연속 로그 매핑을 쓰면 9.772 m 같은 값이 나와
 * x축의 10ⁿ 라벨과 손잡이가 어긋난다. 사다리를 쓰면 손잡이가 늘 읽히는 자리에 선다.
 */
const DISTANCE_MANTISSA = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];
/** x축 눈금은 1-2-5만 쓴다. 사다리 전부에 라벨을 달면 겹친다. */
const AXIS_MANTISSA = [1, 2, 5];

/**
 * [min, max] 안의 사다리를 만든다. 로그 축 진입점이므로 min > 0을 먼저 본다 —
 * 0을 넣으면 `log10(0) = −Infinity`가 되어 데케이드 루프가 **예외가 아니라 무한루프**다.
 */
export function model_build_ladder(minValue, maxValue, mantissa) {
  if (!(minValue > 0) || !(maxValue > minValue) || !Number.isFinite(maxValue)) return [];
  const values = [];
  const lowPower = Math.floor(Math.log10(minValue));
  const highPower = Math.floor(Math.log10(maxValue));
  for (let power = lowPower; power <= highPower; power += 1) {
    for (const step of mantissa) {
      const value = Number((step * Math.pow(10, power)).toPrecision(6));
      if (value >= minValue && value <= maxValue) values.push(value);
    }
  }
  return values;
}

export const WIFI_DISTANCE_LADDER = model_build_ladder(
  WIFI_DISTANCE_MIN_M, WIFI_DISTANCE_MAX_M, DISTANCE_MANTISSA,
);
export const WIFI_AXIS_DISTANCES = model_build_ladder(
  WIFI_DISTANCE_MIN_M, WIFI_DISTANCE_MAX_M, AXIS_MANTISSA,
);

export const WIFI_WALL_COUNT_MIN = 0;
export const WIFI_WALL_COUNT_MAX = 8;
export const WIFI_WALL_COUNT_STEP = 1;
export const WIFI_WALL_COUNT_DEFAULT = 1;

/** EIRP — 안테나 이득까지 포함한 실효 복사전력. 규제 상한이 아니라 슬라이더 상한이다. */
export const WIFI_EIRP_MIN_DBM = 0;
export const WIFI_EIRP_MAX_DBM = 36;
export const WIFI_EIRP_STEP_DBM = 1;
export const WIFI_EIRP_DEFAULT_DBM = 20;

/** 수신 감도 임계값. 어떤 표준값도 주장하지 않는다 — 독자가 정하는 선이다. */
export const WIFI_SENSITIVITY_MIN_DBM = -95;
export const WIFI_SENSITIVITY_MAX_DBM = -60;
export const WIFI_SENSITIVITY_STEP_DBM = 1;
export const WIFI_SENSITIVITY_DEFAULT_DBM = -82;

/** 곡선을 그릴 때 거리를 몇 점으로 훑는가. */
export const WIFI_CURVE_POINT_COUNT = 140;

// ── 판정 임계값 ────────────────────────────────────────────
/** 여유가 이 아래로 내려오면 '경계'. 편집 판단이지 규격이 아니다. */
export const WIFI_MARGIN_EDGE_DB = 6;
/**
 * 벽 한 장의 손실이 이보다 작으면 화면이 그 사실을 말한다.
 * 슬래브 두께가 재질 안 반파장에 가까우면 두 면의 반사가 상쇄되어
 * 투과가 최대가 된다 — **조용히 0에 가까운 숫자를 뱉지 않는다.**
 */
export const WIFI_WALL_LOSS_SMALL_DB = 1;

// ── 복소수 ─────────────────────────────────────────────────
// {re, im} 두 필드. 이 파일 밖으로 나가지 않는다.

const COMPLEX_ONE = { re: 1, im: 0 };
/** −j. e^(−jq)를 만들 때 q에 곱한다. */
const COMPLEX_MINUS_J = { re: 0, im: -1 };

export function model_calculate_complex_add(left, right) {
  return { re: left.re + right.re, im: left.im + right.im };
}

export function model_calculate_complex_subtract(left, right) {
  return { re: left.re - right.re, im: left.im - right.im };
}

export function model_calculate_complex_multiply(left, right) {
  return {
    re: left.re * right.re - left.im * right.im,
    im: left.re * right.im + left.im * right.re,
  };
}

export function model_calculate_complex_divide(left, right) {
  const denominator = right.re * right.re + right.im * right.im;
  if (!(denominator > 0)) throw new Error('복소수 나눗셈의 분모가 0이다.');
  return {
    re: (left.re * right.re + left.im * right.im) / denominator,
    im: (left.im * right.re - left.re * right.im) / denominator,
  };
}

export function model_calculate_complex_scale(value, factor) {
  return { re: value.re * factor, im: value.im * factor };
}

export function model_calculate_complex_magnitude(value) {
  return Math.hypot(value.re, value.im);
}

/** 극형식 제곱근. 주값(실수부 ≥ 0)을 준다 — 물리적으로 감쇠하는 쪽이다. */
export function model_calculate_complex_sqrt(value) {
  const modulus = Math.sqrt(model_calculate_complex_magnitude(value));
  const argument = Math.atan2(value.im, value.re) / 2;
  return { re: modulus * Math.cos(argument), im: modulus * Math.sin(argument) };
}

/** e^z = e^x·(cos y + j sin y) */
export function model_calculate_complex_exponential(value) {
  const magnitude = Math.exp(value.re);
  return { re: magnitude * Math.cos(value.im), im: magnitude * Math.sin(value.im) };
}

// ── 유효범위 검사 ──────────────────────────────────────────

/**
 * 벽 하나의 파라미터가 유효한가.
 * **유효범위 밖에서 조용히 숫자를 뱉지 않는다** — P.2040-4의 계수는
 * 표가 밝힌 구간에 맞춰진 것이고, 밖에서 f^d를 계속 미는 것은 외삽이다.
 */
export function model_check_wall(materialKey, thicknessMm, frequencyMHz) {
  const material = WIFI_MATERIALS[materialKey];
  if (!material) {
    return { ok: false, message: `재질 '${materialKey}'는 이 모델의 표에 없다.` };
  }
  if (!Number.isFinite(thicknessMm) || thicknessMm < material.thicknessMinMm || thicknessMm > material.thicknessMaxMm) {
    return {
      ok: false,
      message: `${material.label} 두께는 ${material.thicknessMinMm}~${material.thicknessMaxMm} mm여야 한다.`,
    };
  }
  if (!Number.isFinite(frequencyMHz) || !(frequencyMHz > 0)) {
    return { ok: false, message: '주파수는 0보다 큰 유한한 값이어야 한다.' };
  }
  const frequencyGHz = frequencyMHz / MEGAHERTZ_PER_GIGAHERTZ;
  if (frequencyGHz < material.fitLowGHz || frequencyGHz > material.fitHighGHz) {
    return {
      ok: false,
      message:
        `${material.label}의 계수는 ${material.fitLowGHz}~${material.fitHighGHz} GHz에서만 맞춰져 있다 ` +
        `(요청: ${frequencyGHz} GHz).`,
    };
  }
  return { ok: true, message: '' };
}

/**
 * 링크 전체의 파라미터 검사. 모델 진입점이 이것을 먼저 부른다.
 * 거리 0은 여기서 막는다 — 그 뒤의 `log10(d)`가 −Infinity를 내고
 * 로그 축 눈금 루프가 **탭을 얼린다.**
 */
export function model_check_parameters(params) {
  const { distanceM, wallCount, materialKey, thicknessMm, eirpDbm, sensitivityDbm } = params ?? {};
  if (!Number.isFinite(distanceM) || distanceM < WIFI_DISTANCE_MIN_M || distanceM > WIFI_DISTANCE_MAX_M) {
    return {
      ok: false,
      message: `거리는 ${WIFI_DISTANCE_MIN_M}~${WIFI_DISTANCE_MAX_M} m여야 한다 (0에서는 로그가 정의되지 않는다).`,
    };
  }
  if (!Number.isInteger(wallCount) || wallCount < WIFI_WALL_COUNT_MIN || wallCount > WIFI_WALL_COUNT_MAX) {
    return { ok: false, message: `벽 개수는 ${WIFI_WALL_COUNT_MIN}~${WIFI_WALL_COUNT_MAX}의 정수여야 한다.` };
  }
  if (!Number.isFinite(eirpDbm) || eirpDbm < WIFI_EIRP_MIN_DBM || eirpDbm > WIFI_EIRP_MAX_DBM) {
    return { ok: false, message: `EIRP는 ${WIFI_EIRP_MIN_DBM}~${WIFI_EIRP_MAX_DBM} dBm이어야 한다.` };
  }
  if (
    !Number.isFinite(sensitivityDbm) ||
    sensitivityDbm < WIFI_SENSITIVITY_MIN_DBM ||
    sensitivityDbm > WIFI_SENSITIVITY_MAX_DBM
  ) {
    return {
      ok: false,
      message: `수신 감도는 ${WIFI_SENSITIVITY_MIN_DBM}~${WIFI_SENSITIVITY_MAX_DBM} dBm이어야 한다.`,
    };
  }
  // 벽 개수가 0이어도 재질·두께는 검사한다 — 표의 '벽 한 장' 칸이 그 값을 쓴다.
  for (const band of WIFI_BANDS) {
    const wall = model_check_wall(materialKey, thicknessMm, band.frequencyMHz);
    if (!wall.ok) return wall;
  }
  return { ok: true, message: '' };
}

// ── 클램프 ─────────────────────────────────────────────────

/** 사다리 위의 가장 가까운 칸. **로그 거리로 잰다** — 선형으로 재면 위 칸으로 쏠린다. */
export function model_pick_distance_index(distanceM) {
  if (!(distanceM > 0) || !Number.isFinite(distanceM)) {
    return model_pick_distance_index(WIFI_DISTANCE_DEFAULT_M);
  }
  const target = Math.log10(distanceM);
  let bestIndex = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  WIFI_DISTANCE_LADDER.forEach((value, index) => {
    const gap = Math.abs(Math.log10(value) - target);
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function model_clamp_distance_index(index) {
  return Math.round(num_clamp_value(index, 0, WIFI_DISTANCE_LADDER.length - 1));
}

export function model_read_distance(index) {
  return WIFI_DISTANCE_LADDER[model_clamp_distance_index(index)];
}

export function model_clamp_distance(distanceM) {
  return model_read_distance(model_pick_distance_index(distanceM));
}

export function model_clamp_wall_count(value) {
  return Math.round(num_clamp_value(value, WIFI_WALL_COUNT_MIN, WIFI_WALL_COUNT_MAX));
}

export function model_clamp_material(key) {
  return Object.prototype.hasOwnProperty.call(WIFI_MATERIALS, key) ? key : WIFI_MATERIAL_DEFAULT;
}

/**
 * 두께를 **그 재질의** 범위와 눈금으로 자른다.
 * 재질이 바뀌면 범위 자체가 바뀐다 — 부모가 바뀌었는데 자식 슬라이더가 그대로면
 * 손잡이가 가리키는 값과 계산에 쓰인 값이 달라진다(클램프가 삼킨다).
 */
export function model_clamp_thickness(materialKey, thicknessMm) {
  const material = WIFI_MATERIALS[model_clamp_material(materialKey)];
  if (!Number.isFinite(thicknessMm)) return material.thicknessDefaultMm;
  const bounded = num_clamp_value(thicknessMm, material.thicknessMinMm, material.thicknessMaxMm);
  const snapped =
    material.thicknessMinMm +
    Math.round((bounded - material.thicknessMinMm) / material.thicknessStepMm) * material.thicknessStepMm;
  return Number(num_clamp_value(snapped, material.thicknessMinMm, material.thicknessMaxMm).toFixed(4));
}

export function model_clamp_eirp(value) {
  const bounded = num_clamp_value(value, WIFI_EIRP_MIN_DBM, WIFI_EIRP_MAX_DBM);
  return Math.round(bounded / WIFI_EIRP_STEP_DBM) * WIFI_EIRP_STEP_DBM;
}

export function model_clamp_sensitivity(value) {
  const bounded = num_clamp_value(value, WIFI_SENSITIVITY_MIN_DBM, WIFI_SENSITIVITY_MAX_DBM);
  return Math.round(bounded / WIFI_SENSITIVITY_STEP_DBM) * WIFI_SENSITIVITY_STEP_DBM;
}

// ── 자유공간 손실 ──────────────────────────────────────────

/**
 * FSPL(dB) = 20·log₁₀(d_km) + 20·log₁₀(f_MHz) + 32.4478
 *
 * **입력은 미터와 MHz로 받고, 식에 넣기 직전에 km으로 나눈다.**
 * 그 나눗셈이 상수 32.4478의 단위 전제를 코드에서 갚는 자리다.
 */
export function model_calculate_free_space_loss(distanceM, frequencyMHz) {
  if (!(distanceM > 0) || !Number.isFinite(distanceM)) {
    throw new Error('자유공간 손실은 거리가 0보다 클 때만 정의된다.');
  }
  if (!(frequencyMHz > 0) || !Number.isFinite(frequencyMHz)) {
    throw new Error('자유공간 손실은 주파수가 0보다 클 때만 정의된다.');
  }
  const distanceKm = distanceM / METRES_PER_KILOMETRE;
  return (
    DECIBEL_FIELD_FACTOR * Math.log10(distanceKm) +
    DECIBEL_FIELD_FACTOR * Math.log10(frequencyMHz) +
    FSPL_CONSTANT_KM_MHZ
  );
}

/** FSPL이 이만큼일 때 거리는 얼마인가. 위 식을 d에 대해 되돌린 것뿐이다. */
export function model_calculate_distance_from_loss(lossDb, frequencyMHz) {
  if (!(frequencyMHz > 0) || !Number.isFinite(frequencyMHz) || !Number.isFinite(lossDb)) return null;
  const logKm =
    (lossDb - FSPL_CONSTANT_KM_MHZ - DECIBEL_FIELD_FACTOR * Math.log10(frequencyMHz)) / DECIBEL_FIELD_FACTOR;
  const metres = Math.pow(10, logKm) * METRES_PER_KILOMETRE;
  return Number.isFinite(metres) && metres > 0 ? metres : null;
}

// ── 벽 한 장 ───────────────────────────────────────────────

/**
 * 복소 상대 유전율 η = η′ − j·η″,  η′ = a·f^b,  η″ = 17.98·σ/f_GHz,  σ = c·f^d.
 * 허수부의 부호가 음수인 것이 손실 매질의 규약이다 — 뒤집으면 벽이 증폭기가 된다.
 */
export function model_calculate_permittivity(materialKey, frequencyGHz) {
  const material = WIFI_MATERIALS[materialKey];
  if (!material) throw new Error(`재질 '${materialKey}'는 이 모델의 표에 없다.`);
  if (!(frequencyGHz > 0)) throw new Error('유전율은 주파수가 0보다 클 때만 정의된다.');
  const conductivity = material.sigmaFactor * Math.pow(frequencyGHz, material.sigmaExponent);
  return {
    re: material.epsilonFactor * Math.pow(frequencyGHz, material.epsilonExponent),
    im: -PERMITTIVITY_LOSS_FACTOR_GHZ * (conductivity / frequencyGHz),
    conductivity,
  };
}

/**
 * 슬래브 한 겹의 투과계수 — P.2040-4 식 (43b).
 *
 *   T = (1 − R²)·e^(−jq) / (1 − R²·e^(−2jq))
 *   R = (1 − √η)/(1 + √η),   q = (2πt/λ)·√η
 *
 * 분모의 e^(−2jq) 항이 **슬래브 내부의 다중 반사를 전부 더한 것**이다.
 * 그래서 얇은 슬래브의 손실이 두께에 대해 단조롭지 않다 —
 * 두께가 매질 안 반파장에 가까우면 두 면의 반사가 상쇄되어 투과가 최대가 된다.
 */
export function model_calculate_slab_transmission(refractiveIndex, phase) {
  const reflection = model_calculate_complex_divide(
    model_calculate_complex_subtract(COMPLEX_ONE, refractiveIndex),
    model_calculate_complex_add(COMPLEX_ONE, refractiveIndex),
  );
  const reflectionSquared = model_calculate_complex_multiply(reflection, reflection);
  const singlePass = model_calculate_complex_exponential(
    model_calculate_complex_multiply(COMPLEX_MINUS_J, phase),
  );
  const doublePass = model_calculate_complex_multiply(singlePass, singlePass);
  return model_calculate_complex_divide(
    model_calculate_complex_multiply(
      model_calculate_complex_subtract(COMPLEX_ONE, reflectionSquared),
      singlePass,
    ),
    model_calculate_complex_subtract(
      COMPLEX_ONE,
      model_calculate_complex_multiply(reflectionSquared, doublePass),
    ),
  );
}

/** 슬래브 안에서의 전기적 두께 q = (2πt/λ)·√η. λ는 자유공간 파장이다. */
export function model_calculate_slab_phase(refractiveIndex, thicknessMm, frequencyMHz) {
  const wavelengthM = SPEED_OF_LIGHT_MS / (frequencyMHz * HERTZ_PER_MEGAHERTZ);
  const thicknessM = thicknessMm / MILLIMETRES_PER_METRE;
  return model_calculate_complex_scale(refractiveIndex, (TWO_PI * thicknessM) / wavelengthM);
}

/**
 * 벽 한 장의 투과손실, dB. L = −20·log₁₀|T| — 식 (43b)의 T에서(식 (44)는 q의 정의).
 * 유효범위 밖이면 던진다.
 */
export function model_calculate_wall_loss(materialKey, thicknessMm, frequencyMHz) {
  const check = model_check_wall(materialKey, thicknessMm, frequencyMHz);
  if (!check.ok) throw new Error(check.message);
  const permittivity = model_calculate_permittivity(materialKey, frequencyMHz / MEGAHERTZ_PER_GIGAHERTZ);
  const refractiveIndex = model_calculate_complex_sqrt(permittivity);
  const phase = model_calculate_slab_phase(refractiveIndex, thicknessMm, frequencyMHz);
  const transmission = model_calculate_slab_transmission(refractiveIndex, phase);
  return -DECIBEL_FIELD_FACTOR * Math.log10(model_calculate_complex_magnitude(transmission));
}

// ── 링크 버짓 ──────────────────────────────────────────────

/**
 * 한 대역의 링크 버짓. **검사는 부르는 쪽이 이미 했다고 보지 않는다** —
 * 벽 손실 함수가 자기 유효범위를 다시 본다.
 */
export function model_calculate_band(params, band) {
  const wallLossDb = model_calculate_wall_loss(params.materialKey, params.thicknessMm, band.frequencyMHz);
  const freeSpaceLossDb = model_calculate_free_space_loss(params.distanceM, band.frequencyMHz);
  const wallTotalDb = params.wallCount * wallLossDb;
  const pathLossDb = freeSpaceLossDb + wallTotalDb;
  const receivedDbm = params.eirpDbm - pathLossDb;
  const marginDb = receivedDbm - params.sensitivityDbm;
  const rangeM = model_calculate_distance_from_loss(
    params.eirpDbm - params.sensitivityDbm - wallTotalDb,
    band.frequencyMHz,
  );
  return {
    key: band.key,
    label: band.label,
    frequencyMHz: band.frequencyMHz,
    freeSpaceLossDb,
    wallLossDb,
    wallTotalDb,
    pathLossDb,
    receivedDbm,
    marginDb,
    rangeM,
    reaches: marginDb >= 0,
    /** 이 두께에서 슬래브가 투과 최대점 근처인가. 화면이 그 사실을 말한다. */
    smallWallLoss: params.wallCount > 0 && wallLossDb < WIFI_WALL_LOSS_SMALL_DB,
  };
}

/**
 * 링크 전체. **계산 경로는 여기 하나뿐이다** — 카드·배지·곡선·표가 전부 이것을 부른다.
 * 6 GHz 체크박스는 그리기의 문제이므로 세 대역을 언제나 계산한다.
 */
export function model_calculate_result(params) {
  const check = model_check_parameters(params);
  if (!check.ok) throw new Error(check.message);

  const bands = WIFI_BANDS.map((band) => model_calculate_band(params, band));
  const byKey = Object.fromEntries(bands.map((band) => [band.key, band]));
  const low = byKey[WIFI_BAND_24];
  const high = byKey[WIFI_BAND_5];

  return {
    params: { ...params },
    bands,
    byKey,
    /** 지금 설정에서 5 GHz가 2.4 GHz보다 몇 dB 아래인가. 이 페이지의 논점. */
    bandGapDb: low.receivedDbm - high.receivedDbm,
    /** 벽이 없을 때의 격차 = 20·log₁₀(f₅/f₂.₄). 거리와 무관한 상수다. */
    bandGapOpenDb:
      DECIBEL_FIELD_FACTOR * Math.log10(high.frequencyMHz / low.frequencyMHz),
    /** 벽 한 장이 격차에 더하는 몫. 재질이 바뀌면 부호까지 바뀔 수 있다. */
    bandGapPerWallDb: high.wallLossDb - low.wallLossDb,
    material: WIFI_MATERIALS[params.materialKey],
  };
}

/**
 * 판정. **가정이 성립하는가**를 여유(dB)로 가른다.
 * 6 GHz를 끄면 그 대역은 판정에 들어가지 않는다 — 화면에 없는 곡선으로 판정할 수 없다.
 */
export function model_calculate_verdict(result, showBand6) {
  const shown = result.bands.filter((band) => band.key !== WIFI_BAND_6 || showBand6);
  const worst = shown.reduce((low, band) => (band.marginDb < low.marginDb ? band : low), shown[0]);
  if (worst.marginDb < 0) return 'break';
  if (worst.marginDb < WIFI_MARGIN_EDGE_DB) return 'edge';
  return 'hold';
}

/** 판정에 쓰인 대역 — 배너가 인용하는 숫자가 어디서 왔는지 화면이 말할 수 있어야 한다. */
export function model_pick_weakest_band(result, showBand6) {
  const shown = result.bands.filter((band) => band.key !== WIFI_BAND_6 || showBand6);
  return shown.reduce((low, band) => (band.marginDb < low.marginDb ? band : low), shown[0]);
}

/**
 * 밴드 격차 판정이 '경계'로 보는 폭(dB). 여유(marginDb) 판정과는 다른 축이다 —
 * 이건 문턱 통과 여부가 아니라 두 대역 중 **어느 쪽이 앞서는가**를 본다.
 * 편집 판단이지 규격이 아니다 (WIFI_MARGIN_EDGE_DB와 같은 성격).
 */
export const WIFI_BAND_GAP_EDGE_DB = 1;

/**
 * H1의 질문 — "몇 장의 벽에서 2.4 GHz가 5 GHz를 앞서는가" — 에 답하는 판정.
 * `bandGapDb = 2.4 GHz 수신전력 − 5 GHz 수신전력`이므로 양수면 2.4 GHz가 앞선다.
 * 벽이 0장이어도 중심주파수 차이만으로 이미 양수로 시작한다 —
 * 그래서 'hold'는 "이 페이지가 뒤집는 통념이 이 설정에서도 성립한다"는 뜻이다.
 * 절대 기본값으로 떨어지지 않는다 — 입력이 유한하지 않으면 던진다.
 */
export function model_calculate_band_gap_verdict(bandGapDb) {
  if (!Number.isFinite(bandGapDb)) throw new Error('밴드 격차는 유한한 값이어야 한다.');
  if (bandGapDb <= -WIFI_BAND_GAP_EDGE_DB) return 'break'; // 5 GHz가 앞선다 — 통념이 뒤집혔다
  if (bandGapDb < WIFI_BAND_GAP_EDGE_DB) return 'edge'; // 거의 나란하다
  return 'hold'; // 2.4 GHz가 앞선다
}

// ── 곡선 ───────────────────────────────────────────────────

/**
 * 거리를 로그로 훑으며 한 대역의 수신전력을 낸다.
 * 사다리가 아니라 균등 로그 간격으로 뽑는다 — 곡선을 부드럽게 그리기 위한 표본이다.
 *
 * 진입점에서 `> 0`을 본다. 0을 넣으면 `log10(0)`이 −Infinity가 되고
 * 아래 루프는 **예외 없이 NaN 좌표를 쏟아낸다.**
 */
export function model_calculate_curve(params, band, pointCount = WIFI_CURVE_POINT_COUNT) {
  if (!(pointCount >= 2)) return [];
  if (!(WIFI_DISTANCE_MIN_M > 0) || !(WIFI_DISTANCE_MAX_M > WIFI_DISTANCE_MIN_M)) return [];
  const logLow = Math.log10(WIFI_DISTANCE_MIN_M);
  const logHigh = Math.log10(WIFI_DISTANCE_MAX_M);
  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const distanceM = Math.pow(10, logLow + ((logHigh - logLow) * index) / (pointCount - 1));
    const point = model_calculate_band({ ...params, distanceM }, band);
    points.push({ distanceM, receivedDbm: point.receivedDbm });
  }
  return points;
}

/** 화면에 그릴 대역의 곡선을 한 번에. 계산 경로를 늘리지 않는다. */
export function model_calculate_curves(params, showBand6, pointCount = WIFI_CURVE_POINT_COUNT) {
  return WIFI_BANDS.filter((band) => band.key !== WIFI_BAND_6 || showBand6).map((band) => ({
    key: band.key,
    label: band.label,
    points: model_calculate_curve(params, band, pointCount),
  }));
}

/**
 * 벽 개수를 0부터 최대까지 밀면서 밴드 격차가 어떻게 자라는지.
 * 배지가 인용하는 증가폭이 실제로 상수인지 화면 밖에서도 확인할 수 있게 한다.
 */
export function model_calculate_gap_table(params) {
  const rows = [];
  for (let wallCount = WIFI_WALL_COUNT_MIN; wallCount <= WIFI_WALL_COUNT_MAX; wallCount += 1) {
    const result = model_calculate_result({ ...params, wallCount });
    rows.push({ wallCount, bandGapDb: result.bandGapDb, bands: result.bands });
  }
  return rows;
}
