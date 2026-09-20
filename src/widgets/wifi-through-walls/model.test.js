/**
 * Wi-Fi through walls — 모델 테스트
 *
 * **같은 모델을 한 번 더 돌려 "맞습니다"를 받는 것은 검증이 아니다.**
 * 그래서 이 파일은 세 벌의 독립 경로를 직접 구현한다.
 *
 *   FSPL   ① 상수형 32.4478 + 20log₁₀(d_km) + 20log₁₀(f_MHz)   ← model.js
 *          ② 파장형 20·log₁₀(4π·d·f/c), 전부 SI 기본단위        ← reference_
 *   슬래브 ① P.2040-3 식 (43b) 닫힌 형태                        ← model.js
 *          ② 다중 내부반사 4,000항 직접 합산 (Fresnel 계수에서 조립)  ← reference_
 *          ③ 광학 특성행렬 (복소 지수 대신 실수 삼각·쌍곡 함수)   ← reference_
 *
 * ②와 ③은 모델의 복소 제곱근도 쓰지 않는다 — 극형식 대신 대수적 제곱근을 쓴다.
 * 세 경로가 소수 아홉째 자리까지 같으면 신뢰한다.
 */
import { describe, it, expect } from 'vitest';
import {
  SPEED_OF_LIGHT_MS,
  PERMITTIVITY_LOSS_FACTOR_GHZ,
  FSPL_CONSTANT_KM_MHZ,
  FSPL_CONSTANT_M_HZ,
  FSPL_CONSTANT_M_KHZ,
  FSPL_CONSTANT_M_MHZ,
  FSPL_CONSTANT_M_GHZ,
  FSPL_CONSTANT_KM_GHZ,
  WIFI_MATERIALS,
  WIFI_MATERIAL_KEYS,
  WIFI_BANDS,
  WIFI_BAND_24,
  WIFI_BAND_5,
  WIFI_BAND_6,
  WIFI_DISTANCE_LADDER,
  WIFI_AXIS_DISTANCES,
  WIFI_DISTANCE_MIN_M,
  WIFI_DISTANCE_MAX_M,
  WIFI_DISTANCE_DEFAULT_M,
  WIFI_WALL_COUNT_MAX,
  WIFI_WALL_COUNT_DEFAULT,
  WIFI_EIRP_DEFAULT_DBM,
  WIFI_EIRP_MIN_DBM,
  WIFI_EIRP_MAX_DBM,
  WIFI_SENSITIVITY_DEFAULT_DBM,
  WIFI_SENSITIVITY_MIN_DBM,
  WIFI_SENSITIVITY_MAX_DBM,
  WIFI_MARGIN_EDGE_DB,
  WIFI_WALL_LOSS_SMALL_DB,
  model_calculate_fspl_constant,
  model_calculate_free_space_loss,
  model_calculate_distance_from_loss,
  model_calculate_permittivity,
  model_calculate_wall_loss,
  model_calculate_complex_sqrt,
  model_calculate_complex_magnitude,
  model_calculate_slab_phase,
  model_calculate_slab_transmission,
  model_check_wall,
  model_check_parameters,
  model_clamp_thickness,
  model_clamp_material,
  model_clamp_wall_count,
  model_clamp_eirp,
  model_clamp_sensitivity,
  model_clamp_distance,
  model_pick_distance_index,
  model_read_distance,
  model_build_ladder,
  model_calculate_result,
  model_calculate_verdict,
  model_pick_weakest_band,
  model_calculate_curve,
  model_calculate_curves,
  model_calculate_gap_table,
} from './model.js';

// ── 기본 파라미터 ──────────────────────────────────────────
/** 본문 블록 8(손계산)이 그대로 따라가는 설정. 바꾸면 본문도 같이 고쳐야 한다. */
const DEFAULT_PARAMS = {
  distanceM: WIFI_DISTANCE_DEFAULT_M,
  wallCount: WIFI_WALL_COUNT_DEFAULT,
  materialKey: 'concrete',
  thicknessMm: 100,
  eirpDbm: WIFI_EIRP_DEFAULT_DBM,
  sensitivityDbm: WIFI_SENSITIVITY_DEFAULT_DBM,
};

// ── 대조 경로 (테스트 전용) ────────────────────────────────

const reference_calculate_complex_add = (left, right) => ({ re: left.re + right.re, im: left.im + right.im });
const reference_calculate_complex_subtract = (left, right) => ({ re: left.re - right.re, im: left.im - right.im });
const reference_calculate_complex_multiply = (left, right) => ({
  re: left.re * right.re - left.im * right.im,
  im: left.re * right.im + left.im * right.re,
});
function reference_calculate_complex_divide(left, right) {
  const denominator = right.re * right.re + right.im * right.im;
  return {
    re: (left.re * right.re + left.im * right.im) / denominator,
    im: (left.im * right.re - left.re * right.im) / denominator,
  };
}
const reference_calculate_complex_magnitude = (value) => Math.hypot(value.re, value.im);

/**
 * 대수적 복소 제곱근. 모델은 극형식(모듈러스·편각)을 쓴다 —
 * 여기서 같은 경로를 쓰면 √η의 부호 규약을 아무도 검사하지 않게 된다.
 */
function reference_calculate_complex_sqrt(value) {
  const magnitude = reference_calculate_complex_magnitude(value);
  const real = Math.sqrt((magnitude + value.re) / 2);
  const sign = value.im < 0 ? -1 : 1;
  return { re: real, im: sign * Math.sqrt((magnitude - value.re) / 2) };
}

/** 자유공간 손실, 파장형. 단위 환산이 하나도 없다 — 전부 m과 Hz다. */
function reference_calculate_fspl_wavelength(distanceM, frequencyMHz) {
  const frequencyHz = frequencyMHz * 1e6;
  return 20 * Math.log10((4 * Math.PI * distanceM * frequencyHz) / SPEED_OF_LIGHT_MS);
}

/** 권고문이 인쇄한 17.98. 모델은 같은 수를 ε₀에서 만든다. */
const REFERENCE_PRINTED_LOSS_FACTOR = 17.98;

/**
 * 대조 경로가 자기 손으로 적는 물리상수·단위. **모델에서 가져오지 않는다** —
 * `PERMITTIVITY_LOSS_FACTOR_GHZ`를 import해 쓰면 η″의 크기가 다시 한 번
 * 모델의 계산을 지나게 되고, 그 상수가 틀리면 세 경로가 나란히 틀린다.
 * ε₀는 CODATA 2018의 **자료**이지 계산 경로가 아니므로 여기 적어도 된다.
 */
const REFERENCE_VACUUM_PERMITTIVITY_F_PER_M = 8.8541878128e-12;
const REFERENCE_HERTZ_PER_GIGAHERTZ = 1e9;
const REFERENCE_MEGAHERTZ_PER_GIGAHERTZ = 1000;
/** η″ = K·σ/f_GHz 의 K를 대조 경로가 ε₀에서 직접 만든다. 1/(2π·ε₀·10⁹). */
const REFERENCE_DERIVED_LOSS_FACTOR =
  1 / (2 * Math.PI * REFERENCE_VACUUM_PERMITTIVITY_F_PER_M * REFERENCE_HERTZ_PER_GIGAHERTZ);

/**
 * √η 를 **대조 경로가 처음부터 조립한다.**
 *
 * 읽는 것은 `WIFI_MATERIALS`의 a·b·c·d 계수뿐이다 — 그 표는 ITU-R P.2040-3
 * Table 3이라는 **자료**이지 계산 경로가 아니다. 그 뒤의 계산은 전부 여기서 한다:
 *   η′ = a·f^b,  σ = c·f^d,  η″ = K·σ/f_GHz,  √(η′ − j·η″)
 * `model_calculate_permittivity`를 부르지 않는다. 부르면 실수부와 허수부가
 * **한 번도 독립으로 계산되지 않고**, η′·η″의 식이 틀렸을 때 세 경로가
 * 사이좋게 같은 틀린 값에서 일치한다.
 * 제곱근도 모델의 극형식이 아니라 대수적 형태다.
 * `lossFactor`를 넘기면 17.98(권고문 인쇄값)으로도 돌릴 수 있다.
 */
function reference_read_index(materialKey, frequencyMHz, lossFactor = REFERENCE_DERIVED_LOSS_FACTOR) {
  const material = WIFI_MATERIALS[materialKey];
  if (!material) throw new Error(`대조 경로가 모르는 재질: '${materialKey}'`);
  const frequencyGHz = frequencyMHz / REFERENCE_MEGAHERTZ_PER_GIGAHERTZ;
  const real = material.epsilonFactor * Math.pow(frequencyGHz, material.epsilonExponent);
  const conductivity = material.sigmaFactor * Math.pow(frequencyGHz, material.sigmaExponent);
  const imaginary = -lossFactor * (conductivity / frequencyGHz);
  return reference_calculate_complex_sqrt({ re: real, im: imaginary });
}

function reference_read_phase(index, thicknessMm, frequencyMHz) {
  const wavelengthM = SPEED_OF_LIGHT_MS / (frequencyMHz * 1e6);
  const factor = (2 * Math.PI * (thicknessMm / 1000)) / wavelengthM;
  return { re: index.re * factor, im: index.im * factor };
}

/** e^(−jq) 를 실수 지수·삼각으로. −jq = q_im − j·q_re. */
function reference_read_single_pass(phase) {
  const magnitude = Math.exp(phase.im);
  return { re: magnitude * Math.cos(-phase.re), im: magnitude * Math.sin(-phase.re) };
}

const REFERENCE_SERIES_TERMS = 4000;

/**
 * 대조 경로 ② — 슬래브 안의 다중 내부반사를 **직접 더한다.**
 * 첫 항은 t₀₁·t₁₀·e^(−jq), 그다음부터 (r₁₀²·e^(−2jq))를 곱해 나간다.
 * 닫힌 형태의 나눗셈이 실제로 이 급수인지 여기서 확인한다.
 */
function reference_calculate_slab_loss_series(materialKey, thicknessMm, frequencyMHz) {
  const one = { re: 1, im: 0 };
  const index = reference_read_index(materialKey, frequencyMHz);
  const phase = reference_read_phase(index, thicknessMm, frequencyMHz);
  const singlePass = reference_read_single_pass(phase);
  const doublePass = reference_calculate_complex_multiply(singlePass, singlePass);

  const intoSlab = reference_calculate_complex_divide({ re: 2, im: 0 }, reference_calculate_complex_add(one, index));
  const outOfSlab = reference_calculate_complex_divide(
    { re: 2 * index.re, im: 2 * index.im },
    reference_calculate_complex_add(one, index),
  );
  const insideReflection = reference_calculate_complex_divide(
    reference_calculate_complex_subtract(index, one),
    reference_calculate_complex_add(index, one),
  );
  const ratio = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(insideReflection, insideReflection),
    doublePass,
  );

  let sum = { re: 0, im: 0 };
  let term = { re: 1, im: 0 };
  for (let bounce = 0; bounce < REFERENCE_SERIES_TERMS; bounce += 1) {
    sum = reference_calculate_complex_add(sum, term);
    term = reference_calculate_complex_multiply(term, ratio);
  }

  const transmission = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(
      reference_calculate_complex_multiply(intoSlab, outOfSlab),
      singlePass,
    ),
    sum,
  );
  return -20 * Math.log10(reference_calculate_complex_magnitude(transmission));
}

/**
 * 대조 경로 ③ — 광학 특성행렬.
 *   M = [[cos δ, j·sin δ/n], [j·n·sin δ, cos δ]],  t = 2/(m₁₁+m₁₂+m₂₁+m₂₂)
 * 복소 지수를 한 번도 쓰지 않는다: cos(x+jy) = cos x·cosh y − j·sin x·sinh y.
 */
function reference_calculate_slab_loss_matrix(materialKey, thicknessMm, frequencyMHz) {
  const index = reference_read_index(materialKey, frequencyMHz);
  const delta = reference_read_phase(index, thicknessMm, frequencyMHz);
  const cosine = { re: Math.cos(delta.re) * Math.cosh(delta.im), im: -Math.sin(delta.re) * Math.sinh(delta.im) };
  const sine = { re: Math.sin(delta.re) * Math.cosh(delta.im), im: Math.cos(delta.re) * Math.sinh(delta.im) };
  const imaginaryUnit = { re: 0, im: 1 };

  const m12 = reference_calculate_complex_divide(
    reference_calculate_complex_multiply(imaginaryUnit, sine), index,
  );
  const m21 = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(imaginaryUnit, index), sine,
  );
  const denominator = reference_calculate_complex_add(
    reference_calculate_complex_add(cosine, cosine),
    reference_calculate_complex_add(m12, m21),
  );
  const transmission = reference_calculate_complex_divide({ re: 2, im: 0 }, denominator);
  return -20 * Math.log10(reference_calculate_complex_magnitude(transmission));
}

/** 표 안의 모든 재질 × 세 대역 × 두께 다섯 칸. 대조 경로가 훑는 격자다. */
function reference_build_cases() {
  const cases = [];
  for (const key of WIFI_MATERIAL_KEYS) {
    const material = WIFI_MATERIALS[key];
    for (let step = 0; step <= 4; step += 1) {
      const thicknessMm =
        material.thicknessMinMm + ((material.thicknessMaxMm - material.thicknessMinMm) * step) / 4;
      for (const band of WIFI_BANDS) {
        cases.push({ key, thicknessMm: model_clamp_thickness(key, thicknessMm), frequencyMHz: band.frequencyMHz });
      }
    }
  }
  return cases;
}

// ── FSPL 상수의 단위 전제 ──────────────────────────────────

describe('FSPL 상수는 전파가 아니라 단위의 성질이다', () => {
  it('다섯 단위쌍의 상수값을 못박는다', () => {
    // 이 다섯 개가 같은 하나의 식이다. 하나라도 어긋나면 코드가 다른 단위로 계산 중이다.
    expect(FSPL_CONSTANT_KM_MHZ).toBeCloseTo(32.4478, 4);
    expect(FSPL_CONSTANT_M_HZ).toBeCloseTo(-147.5522, 4);
    expect(FSPL_CONSTANT_M_KHZ).toBeCloseTo(-87.5522, 4);
    expect(FSPL_CONSTANT_M_MHZ).toBeCloseTo(-27.5522, 4);
    expect(FSPL_CONSTANT_M_GHZ).toBeCloseTo(32.4478, 4);
    expect(FSPL_CONSTANT_KM_GHZ).toBeCloseTo(92.4478, 4);
  });

  it('P.525-5가 인쇄한 반올림값 32.4와 소수 첫째 자리까지 같다', () => {
    expect(Number(FSPL_CONSTANT_KM_MHZ.toFixed(1))).toBe(32.4);
  });

  it('m·GHz와 km·MHz가 우연히 같다는 것도 못박는다 (두 번째 뜻이 아니다)', () => {
    expect(FSPL_CONSTANT_M_GHZ).toBeCloseTo(FSPL_CONSTANT_KM_MHZ, 12);
    // 우연의 정체: 1000배 두 번이 거리에서 한 번, 주파수에서 한 번 서로 상쇄된다.
    expect(FSPL_CONSTANT_KM_MHZ - FSPL_CONSTANT_M_MHZ).toBeCloseTo(60, 12);
    expect(FSPL_CONSTANT_M_GHZ - FSPL_CONSTANT_M_MHZ).toBeCloseTo(60, 12);
  });

  it('단위를 바꾸면 상수가 20·log₁₀(배율)만큼 움직인다', () => {
    expect(model_calculate_fspl_constant(1000, 1e6) - model_calculate_fspl_constant(1, 1e6)).toBeCloseTo(60, 12);
    expect(model_calculate_fspl_constant(1, 1e9) - model_calculate_fspl_constant(1, 1e6)).toBeCloseTo(60, 12);
  });

  it('단위가 0이나 음수면 던진다', () => {
    expect(() => model_calculate_fspl_constant(0, 1e6)).toThrow();
    expect(() => model_calculate_fspl_constant(1000, -1)).toThrow();
  });

  it('**코드가 실제로 km·MHz를 쓴다** — 미터를 km으로 나누지 않으면 60 dB가 어긋난다', () => {
    // 이것이 이 위젯의 검수 포인트 ①이다.
    // 만약 model.js가 거리를 미터인 채로 상수형에 넣는다면 결과가 정확히 60 dB 커진다.
    const loss = model_calculate_free_space_loss(10, 2437);
    expect(loss).toBeCloseTo(60.1849, 4);
    const naiveMetres = 20 * Math.log10(10) + 20 * Math.log10(2437) + FSPL_CONSTANT_KM_MHZ;
    expect(naiveMetres - loss).toBeCloseTo(60, 9);
  });
});

// ── FSPL — 독립 경로 대조 ──────────────────────────────────

describe('자유공간 손실 — 상수형과 파장형', () => {
  it('두 경로가 소수 아홉째 자리까지 같다', () => {
    for (const distanceM of [0.5, 1, 2.5, 10, 33.3, 50]) {
      for (const band of WIFI_BANDS) {
        expect(model_calculate_free_space_loss(distanceM, band.frequencyMHz)).toBeCloseTo(
          reference_calculate_fspl_wavelength(distanceM, band.frequencyMHz), 9,
        );
      }
    }
  });

  it('거리를 두 배로 하면 6.02 dB가 붙는다 (로그 축에서 곡선이 직선인 이유)', () => {
    const near = model_calculate_free_space_loss(5, 2437);
    const far = model_calculate_free_space_loss(10, 2437);
    expect(far - near).toBeCloseTo(6.0206, 4);
  });

  it('본문 블록 8의 중간값을 못박는다', () => {
    expect(20 * Math.log10(0.01)).toBeCloseTo(-40, 12);
    expect(20 * Math.log10(2437)).toBeCloseTo(67.7371, 4);
    expect(model_calculate_free_space_loss(10, 2437)).toBeCloseTo(60.1849, 4);
    expect(model_calculate_free_space_loss(10, 5500)).toBeCloseTo(67.2550, 4);
  });

  it('거리 0·음수·무한대에서 조용히 숫자를 뱉지 않고 던진다', () => {
    // 로그 축 진입점. 0을 통과시키면 −Infinity가 눈금 루프에 들어가 탭이 얼어붙는다.
    expect(() => model_calculate_free_space_loss(0, 2437)).toThrow();
    expect(() => model_calculate_free_space_loss(-1, 2437)).toThrow();
    expect(() => model_calculate_free_space_loss(Number.POSITIVE_INFINITY, 2437)).toThrow();
    expect(() => model_calculate_free_space_loss(10, 0)).toThrow();
  });

  it('거리 되풀기가 손실 계산의 역함수다', () => {
    for (const distanceM of [0.5, 7, 50]) {
      const loss = model_calculate_free_space_loss(distanceM, 5500);
      expect(model_calculate_distance_from_loss(loss, 5500)).toBeCloseTo(distanceM, 9);
    }
    expect(model_calculate_distance_from_loss(60, 0)).toBeNull();
    expect(model_calculate_distance_from_loss(Number.NaN, 5500)).toBeNull();
  });
});

// ── 슬래브 — 세 경로 대조 ──────────────────────────────────

describe('벽 한 장의 투과손실 — 세 경로', () => {
  it('닫힌 형태 · 다중반사 급수 · 특성행렬이 소수 아홉째 자리까지 같다', () => {
    const cases = reference_build_cases();
    expect(cases.length).toBe(75);
    for (const item of cases) {
      const closed = model_calculate_wall_loss(item.key, item.thicknessMm, item.frequencyMHz);
      expect(closed).toBeCloseTo(reference_calculate_slab_loss_series(item.key, item.thicknessMm, item.frequencyMHz), 8);
      expect(closed).toBeCloseTo(reference_calculate_slab_loss_matrix(item.key, item.thicknessMm, item.frequencyMHz), 8);
    }
  });

  it('급수를 한 항만 더하면 (다중반사를 버리면) 닫힌 형태와 갈라진다', () => {
    // 대조 경로가 실제로 무언가를 지키는지 본다. 급수가 동어반복이면 이 단언이 실패한다.
    const single = reference_calculate_slab_loss_series_terms('glass', 6, 5500, 1);
    const full = model_calculate_wall_loss('glass', 6, 5500);
    expect(Math.abs(single - full)).toBeGreaterThan(0.05);
  });

  it('두께가 0이면 손실이 정확히 0이다 — 슬래브가 없으면 벽도 없다', () => {
    // 이 극한이 깨지면 반사계수의 부호나 e^(−jq)의 방향이 뒤집힌 것이다.
    const index = model_calculate_complex_sqrt(model_calculate_permittivity('concrete', 2.437));
    const phase = model_calculate_slab_phase(index, 0, 2437);
    const transmission = model_calculate_slab_transmission(index, phase);
    expect(-20 * Math.log10(model_calculate_complex_magnitude(transmission))).toBeCloseTo(0, 12);
  });

  it('두께가 늘면 위상이 비례해서 늘고, 감쇠 쪽(허수부)은 음수다', () => {
    const index = model_calculate_complex_sqrt(model_calculate_permittivity('concrete', 2.437));
    const thin = model_calculate_slab_phase(index, 50, 2437);
    const thick = model_calculate_slab_phase(index, 100, 2437);
    expect(thick.re).toBeCloseTo(thin.re * 2, 9);
    expect(thin.im).toBeLessThan(0);
    // 손실 매질의 규약: √η의 허수부가 음수여야 e^(−jq)의 크기가 1보다 작아진다.
    expect(index.im).toBeLessThan(0);
    expect(index.re).toBeGreaterThan(0);
  });

  it('손실은 언제나 0 이상이다 — 벽이 증폭기가 되지 않는다', () => {
    for (const item of reference_build_cases()) {
      expect(model_calculate_wall_loss(item.key, item.thicknessMm, item.frequencyMHz)).toBeGreaterThan(0);
    }
  });
});

// ── 재질 계수표와 본문의 숫자 ──────────────────────────────

describe('재질 계수와 본문이 인용하는 dB', () => {
  it('17.98 계수를 ε₀에서 만들고, 권고문의 인쇄값과 소수 둘째 자리까지 같다', () => {
    expect(PERMITTIVITY_LOSS_FACTOR_GHZ).toBeCloseTo(17.98, 2);
    expect(PERMITTIVITY_LOSS_FACTOR_GHZ).toBeCloseTo(17.9751, 4);
  });

  it('ε₀에서 만든 17.9751과 권고문의 17.98이 결과를 0.02 dB 넘게 가르지 않는다', () => {
    // 상수를 어느 쪽으로 잡든 화면의 숫자가 같다는 것을 못박는다.
    for (const item of reference_build_cases()) {
      const printed = reference_calculate_slab_loss_matrix_printed(item.key, item.thicknessMm, item.frequencyMHz);
      const derived = model_calculate_wall_loss(item.key, item.thicknessMm, item.frequencyMHz);
      expect(Math.abs(printed - derived)).toBeLessThan(0.02);
    }
  });

  it('모든 재질의 η′ 지수가 0이다 — 표는 유전율의 주파수 의존을 보고하지 않는다', () => {
    for (const key of WIFI_MATERIAL_KEYS) expect(WIFI_MATERIALS[key].epsilonExponent).toBe(0);
  });

  it('콘크리트의 σ와 η가 블록 8의 손계산과 같다', () => {
    const permittivity = model_calculate_permittivity('concrete', 2.437);
    expect(permittivity.conductivity).toBeCloseTo(0.0927, 4);
    expect(permittivity.re).toBeCloseTo(5.24, 12);
    expect(permittivity.im).toBeCloseTo(-0.6840, 4);
  });

  it('콘크리트 100 mm — 블록 5·8이 인용하는 8.07 / 14.03 / 15.70 dB', () => {
    expect(model_calculate_wall_loss('concrete', 100, 2437)).toBeCloseTo(8.0714, 4);
    expect(model_calculate_wall_loss('concrete', 100, 5500)).toBeCloseTo(14.0316, 4);
    expect(model_calculate_wall_loss('concrete', 100, 6525)).toBeCloseTo(15.7034, 4);
  });

  it('석고보드 12.5 mm는 1.09 / 1.01 dB — 5 GHz가 오히려 덜 잃는다', () => {
    expect(model_calculate_wall_loss('plasterboard', 12.5, 2437)).toBeCloseTo(1.0870, 4);
    expect(model_calculate_wall_loss('plasterboard', 12.5, 5500)).toBeCloseTo(1.0075, 4);
  });

  it('벽돌 100 mm는 3.20 / 3.63 dB', () => {
    expect(model_calculate_wall_loss('brick', 100, 2437)).toBeCloseTo(3.1985, 4);
    expect(model_calculate_wall_loss('brick', 100, 5500)).toBeCloseTo(3.6299, 4);
  });

  it('3GPP TR 38.901 Table 7.4.3-1의 콘크리트 5+4f와 만나는 두께', () => {
    // 대조는 두 방향이다 — 우리 식이 저쪽 dB를 재현하는 두께가 실제로 200 mm인가.
    expect(model_calculate_wall_loss('concrete', 200, 2437)).toBeCloseTo(5 + 4 * 2.437, 2);
    expect(model_calculate_wall_loss('concrete', 200, 5500)).toBeCloseTo(26.47, 2);
    expect(5 + 4 * 5.5).toBe(27);
  });

  it('ITU-R P.1238-13 Table 5의 10 dB / 13 dB와 만나는 두께', () => {
    // 초안은 120 mm라 적었으나 120 mm는 9.61 dB다. 10 dB에 닿는 것은 130 mm 쪽이다.
    expect(model_calculate_wall_loss('concrete', 120, 2437)).toBeCloseTo(9.6074, 4);
    expect(model_calculate_wall_loss('concrete', 130, 2437)).toBeCloseTo(9.9252, 4);
    expect(model_calculate_wall_loss('concrete', 100, 5200)).toBeCloseTo(13.3412, 4);
  });

  it('두꺼울수록 더 잃는다는 것이 참이 아니다 — 유리 11 mm가 5.5 mm보다 덜 잃는다', () => {
    // 슬래브 안 반파장에서 두 면의 반사가 상쇄된다. 블록 6이 인용하는 뒤집힘.
    const thin = model_calculate_wall_loss('glass', 5.5, 5500);
    const thick = model_calculate_wall_loss('glass', 11, 5500);
    expect(thin).toBeCloseTo(3.3433, 4);
    expect(thick).toBeCloseTo(0.3760, 4);
    expect(thick).toBeLessThan(thin);
  });
});

// ── 유효범위 ───────────────────────────────────────────────

describe('유효범위 밖에서는 조용히 숫자를 뱉지 않는다', () => {
  it('벽돌의 계수는 1–40 GHz 밖에서 던진다', () => {
    expect(WIFI_MATERIALS.brick.fitLowGHz).toBe(1);
    expect(WIFI_MATERIALS.brick.fitHighGHz).toBe(40);
    expect(() => model_calculate_wall_loss('brick', 100, 500)).toThrow(/1~40 GHz/);
    expect(() => model_calculate_wall_loss('brick', 100, 45000)).toThrow(/1~40 GHz/);
    // 이 페이지가 실제로 쓰는 세 대역은 전부 안이다.
    for (const band of WIFI_BANDS) {
      expect(model_check_wall('brick', 100, band.frequencyMHz).ok).toBe(true);
    }
  });

  it('유리의 계수는 0.1 GHz 아래에서 던진다 (콘크리트보다 넓다)', () => {
    expect(model_check_wall('glass', 6, 50).ok).toBe(false);
    expect(model_check_wall('glass', 6, 200).ok).toBe(true);
    expect(model_check_wall('concrete', 100, 200).ok).toBe(false);
  });

  it('두께가 그 재질의 범위 밖이면 던진다', () => {
    expect(() => model_calculate_wall_loss('glass', 100, 2437)).toThrow(/3~12 mm/);
    expect(() => model_calculate_wall_loss('concrete', 10, 2437)).toThrow(/50~300 mm/);
  });

  it('표에 없는 재질은 던진다', () => {
    expect(() => model_calculate_wall_loss('steel', 100, 2437)).toThrow();
    expect(() => model_calculate_permittivity('steel', 2.437)).toThrow();
  });

  it('링크 파라미터 검사가 각 사유를 구분해 돌려준다', () => {
    const bad = (patch) => model_check_parameters({ ...DEFAULT_PARAMS, ...patch });
    expect(bad({}).ok).toBe(true);
    expect(bad({ distanceM: 0 }).ok).toBe(false);
    expect(bad({ distanceM: 51 }).ok).toBe(false);
    expect(bad({ wallCount: 1.5 }).ok).toBe(false);
    expect(bad({ wallCount: -1 }).ok).toBe(false);
    expect(bad({ wallCount: WIFI_WALL_COUNT_MAX + 1 }).ok).toBe(false);
    expect(bad({ eirpDbm: 40 }).ok).toBe(false);
    expect(bad({ sensitivityDbm: -120 }).ok).toBe(false);
    expect(bad({ materialKey: 'steel' }).ok).toBe(false);
    expect(bad({ thicknessMm: 4 }).ok).toBe(false);
    expect(model_check_parameters(undefined).ok).toBe(false);
  });

  it('벽이 0장이어도 재질·두께를 검사한다 (표의 "벽 한 장" 칸이 그 값을 쓴다)', () => {
    expect(model_check_parameters({ ...DEFAULT_PARAMS, wallCount: 0, thicknessMm: 4 }).ok).toBe(false);
  });

  it('결과 진입점이 검사를 통과하지 못한 조합에서 던진다', () => {
    expect(() => model_calculate_result({ ...DEFAULT_PARAMS, distanceM: 0 })).toThrow();
    expect(() => model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 99 })).toThrow();
  });
});

// ── 기본값·클램프 ──────────────────────────────────────────

describe('기본값과 클램프', () => {
  it('모든 기본값이 자기 검사를 통과한다', () => {
    expect(model_check_parameters(DEFAULT_PARAMS).ok).toBe(true);
    for (const key of WIFI_MATERIAL_KEYS) {
      const material = WIFI_MATERIALS[key];
      expect(material.thicknessDefaultMm).toBeGreaterThanOrEqual(material.thicknessMinMm);
      expect(material.thicknessDefaultMm).toBeLessThanOrEqual(material.thicknessMaxMm);
      // 기본 두께가 눈금 위에 있어야 손잡이와 계산이 같은 값을 가리킨다.
      expect(model_clamp_thickness(key, material.thicknessDefaultMm)).toBe(material.thicknessDefaultMm);
    }
    expect(model_clamp_eirp(WIFI_EIRP_DEFAULT_DBM)).toBe(WIFI_EIRP_DEFAULT_DBM);
    expect(model_clamp_sensitivity(WIFI_SENSITIVITY_DEFAULT_DBM)).toBe(WIFI_SENSITIVITY_DEFAULT_DBM);
    expect(model_clamp_distance(WIFI_DISTANCE_DEFAULT_M)).toBe(WIFI_DISTANCE_DEFAULT_M);
  });

  it('거리 사다리는 양 끝을 담고 1-2-5 라벨과 어긋나지 않는다', () => {
    expect(WIFI_DISTANCE_LADDER[0]).toBe(WIFI_DISTANCE_MIN_M);
    expect(WIFI_DISTANCE_LADDER.at(-1)).toBe(WIFI_DISTANCE_MAX_M);
    expect(WIFI_DISTANCE_LADDER.length).toBe(25);
    // 연속 로그 매핑이었다면 9.772 같은 값이 나온다. 사다리는 전부 읽히는 숫자다.
    for (const value of WIFI_DISTANCE_LADDER) {
      expect(String(value).replace('.', '').replace(/0+$/, '').length).toBeLessThanOrEqual(2);
    }
    for (const value of WIFI_AXIS_DISTANCES) expect(WIFI_DISTANCE_LADDER).toContain(value);
    expect(WIFI_AXIS_DISTANCES).toEqual([0.5, 1, 2, 5, 10, 20, 50]);
  });

  it('사다리는 오름차순이고 값이 겹치지 않는다', () => {
    for (let index = 1; index < WIFI_DISTANCE_LADDER.length; index += 1) {
      expect(WIFI_DISTANCE_LADDER[index]).toBeGreaterThan(WIFI_DISTANCE_LADDER[index - 1]);
    }
  });

  it('사다리 만들기가 0·음수·뒤집힌 범위에서 무한루프 대신 빈 배열을 낸다', () => {
    expect(model_build_ladder(0, 50, [1, 2, 5])).toEqual([]);
    expect(model_build_ladder(-1, 50, [1, 2, 5])).toEqual([]);
    expect(model_build_ladder(50, 1, [1, 2, 5])).toEqual([]);
    expect(model_build_ladder(1, Number.POSITIVE_INFINITY, [1])).toEqual([]);
  });

  it('거리 인덱스는 로그 거리로 가장 가까운 칸을 고른다', () => {
    expect(model_read_distance(model_pick_distance_index(10))).toBe(10);
    // 1.35는 선형으로는 1.5에 더 가깝지만 로그로는 1.2와 1.5 사이 한가운데를 조금 넘는다.
    expect(model_read_distance(model_pick_distance_index(1.34))).toBe(1.2);
    expect(model_read_distance(model_pick_distance_index(1.35))).toBe(1.5);
    expect(model_read_distance(model_pick_distance_index(0.1))).toBe(WIFI_DISTANCE_MIN_M);
    expect(model_read_distance(model_pick_distance_index(999))).toBe(WIFI_DISTANCE_MAX_M);
    expect(model_read_distance(model_pick_distance_index(0))).toBe(WIFI_DISTANCE_DEFAULT_M);
    expect(model_read_distance(model_pick_distance_index(Number.NaN))).toBe(WIFI_DISTANCE_DEFAULT_M);
  });

  it('두께 클램프가 재질마다 다른 범위와 눈금을 쓴다', () => {
    expect(model_clamp_thickness('concrete', 1000)).toBe(300);
    expect(model_clamp_thickness('concrete', 102)).toBe(100);
    expect(model_clamp_thickness('plasterboard', 100)).toBe(25);
    expect(model_clamp_thickness('plasterboard', 12.3)).toBe(12.5);
    expect(model_clamp_thickness('glass', 0)).toBe(3);
    expect(model_clamp_thickness('wood', 40.4)).toBe(40);
    expect(model_clamp_thickness('concrete', Number.NaN)).toBe(100);
    // 알 수 없는 재질은 기본 재질의 범위로 떨어진다 — 최솟값이 아니라 기본값이다.
    expect(model_clamp_thickness('steel', Number.NaN)).toBe(WIFI_MATERIALS.concrete.thicknessDefaultMm);
  });

  it('나머지 클램프가 눈금 위로 맞춘다', () => {
    expect(model_clamp_wall_count(3.4)).toBe(3);
    expect(model_clamp_wall_count(-5)).toBe(0);
    expect(model_clamp_wall_count(99)).toBe(WIFI_WALL_COUNT_MAX);
    expect(model_clamp_eirp(20.4)).toBe(20);
    expect(model_clamp_eirp(-3)).toBe(WIFI_EIRP_MIN_DBM);
    expect(model_clamp_eirp(99)).toBe(WIFI_EIRP_MAX_DBM);
    expect(model_clamp_sensitivity(-82.4)).toBe(-82);
    expect(model_clamp_sensitivity(-200)).toBe(WIFI_SENSITIVITY_MIN_DBM);
    expect(model_clamp_sensitivity(0)).toBe(WIFI_SENSITIVITY_MAX_DBM);
    expect(model_clamp_material('brick')).toBe('brick');
    expect(model_clamp_material('steel')).toBe('concrete');
    expect(model_clamp_material(undefined)).toBe('concrete');
  });
});

// ── 링크 버짓과 밴드 격차 ──────────────────────────────────

describe('링크 버짓 — 블록 8의 손계산', () => {
  const result = model_calculate_result(DEFAULT_PARAMS);

  it('2.4 GHz는 −48.26 dBm, 여유 33.7 dB', () => {
    const band = result.byKey[WIFI_BAND_24];
    expect(band.freeSpaceLossDb).toBeCloseTo(60.1849, 4);
    expect(band.wallLossDb).toBeCloseTo(8.0714, 4);
    expect(band.pathLossDb).toBeCloseTo(68.2563, 4);
    expect(band.receivedDbm).toBeCloseTo(-48.2563, 4);
    expect(band.marginDb).toBeCloseTo(33.7437, 4);
  });

  it('5 GHz는 −61.29 dBm, 여유 20.7 dB', () => {
    const band = result.byKey[WIFI_BAND_5];
    expect(band.freeSpaceLossDb).toBeCloseTo(67.2550, 4);
    expect(band.wallLossDb).toBeCloseTo(14.0316, 4);
    expect(band.receivedDbm).toBeCloseTo(-61.2866, 4);
    expect(band.marginDb).toBeCloseTo(20.7134, 4);
  });

  it('두 대역의 차이 13.03 dB는 7.07 + 5.96으로 따로 도착한다', () => {
    expect(result.bandGapDb).toBeCloseTo(13.0303, 4);
    expect(result.bandGapOpenDb).toBeCloseTo(7.0701, 4);
    expect(result.bandGapPerWallDb).toBeCloseTo(5.9602, 4);
    expect(result.bandGapOpenDb + result.bandGapPerWallDb).toBeCloseTo(result.bandGapDb, 9);
  });

  it('감도에 닿는 거리를 대역마다 낸다', () => {
    expect(result.byKey[WIFI_BAND_24].rangeM).toBeCloseTo(486.6, 1);
    expect(result.byKey[WIFI_BAND_5].rangeM).toBeCloseTo(108.6, 1);
    expect(result.byKey[WIFI_BAND_6].rangeM).toBeCloseTo(75.5, 1);
    // 그 거리에서 수신전력이 정확히 감도다.
    for (const band of result.bands) {
      const atRange = model_calculate_result({ ...DEFAULT_PARAMS, distanceM: WIFI_DISTANCE_MAX_M });
      expect(atRange.byKey[band.key].receivedDbm).toBeLessThan(band.receivedDbm);
    }
  });
});

describe('밴드 격차 — 이 페이지의 논점', () => {
  it('벽 0장에서 5 GHz는 이미 2.4 GHz보다 7.07 dB 아래다 (교차점은 없다)', () => {
    const open = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 0 });
    expect(open.bandGapDb).toBeCloseTo(7.0701, 4);
    expect(20 * Math.log10(5500 / 2437)).toBeCloseTo(7.0701, 4);
    // 거리를 아무리 밀어도 벽이 없으면 격차가 변하지 않는다 — FSPL의 거리항이 같기 때문.
    for (const distanceM of WIFI_DISTANCE_LADDER) {
      expect(model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 0, distanceM }).bandGapDb)
        .toBeCloseTo(7.0701, 4);
    }
  });

  it('격차 = 벽 0장 격차 + 벽 개수 × 벽당 증가폭 (모든 벽 개수에서)', () => {
    for (const materialKey of WIFI_MATERIAL_KEYS) {
      const params = {
        ...DEFAULT_PARAMS,
        materialKey,
        thicknessMm: WIFI_MATERIALS[materialKey].thicknessDefaultMm,
      };
      for (const rows of [model_calculate_gap_table(params)]) {
        expect(rows.length).toBe(WIFI_WALL_COUNT_MAX + 1);
        for (const row of rows) {
          const expected = 7.0701432 + row.wallCount * model_calculate_result(params).bandGapPerWallDb;
          expect(row.bandGapDb).toBeCloseTo(expected, 6);
        }
      }
    }
  });

  it('벽당 증가폭이 재질마다 갈린다 — 콘크리트 +5.96 / 벽돌 +0.43 / 석고보드 −0.08', () => {
    const gap = (materialKey, thicknessMm) =>
      model_calculate_result({ ...DEFAULT_PARAMS, materialKey, thicknessMm }).bandGapPerWallDb;
    expect(gap('concrete', 100)).toBeCloseTo(5.9602, 4);
    expect(gap('brick', 100)).toBeCloseTo(0.4314, 4);
    expect(gap('plasterboard', 12.5)).toBeCloseTo(-0.0795, 4);
    // 부호가 갈리는 것이 블록 6의 문장이다.
    expect(gap('plasterboard', 12.5)).toBeLessThan(0);
    expect(gap('concrete', 100)).toBeGreaterThan(gap('brick', 100));
  });

  it('석고보드의 부호는 두께에 딸린 것이다 — 9 mm에서는 다시 +0.60 dB', () => {
    // "석고보드는 격차를 좁힌다"가 재질만의 성질이 아님을 못박는다.
    const gap = (thicknessMm) =>
      model_calculate_result({ ...DEFAULT_PARAMS, materialKey: 'plasterboard', thicknessMm }).bandGapPerWallDb;
    expect(gap(9)).toBeCloseTo(0.6004, 4);
    expect(gap(12.5)).toBeCloseTo(-0.0795, 4);
  });

  it('석고보드 여덟 장을 세워도 격차가 빈 방과 거의 같다', () => {
    const eight = model_calculate_result({
      ...DEFAULT_PARAMS, materialKey: 'plasterboard', thicknessMm: 12.5, wallCount: 8,
    });
    expect(eight.bandGapDb).toBeCloseTo(6.4343, 4);
    expect(Math.abs(eight.bandGapDb - eight.bandGapOpenDb)).toBeLessThan(1);
  });

  it('콘크리트 벽 2장 뒤에 5 GHz가 2.4 GHz와 나란해지려면 EIRP 19.0 dB가 더 있어야 한다', () => {
    const two = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 2 });
    expect(two.bandGapDb).toBeCloseTo(18.9905, 4);
  });

  it('"콘크리트 한 장 ≈ 자유공간 거리 3배"는 2437 MHz·119 mm에서만 정확히 3.0이다', () => {
    const ratio = (thicknessMm, frequencyMHz) =>
      Math.pow(10, model_calculate_wall_loss('concrete', thicknessMm, frequencyMHz) / 20);
    expect(ratio(119, 2437)).toBeCloseTo(3.0, 2);
    // 같은 문장을 다른 자리에서 읽으면 3배가 아니다 — 조건부로만 참이다.
    expect(ratio(100, 2437)).toBeCloseTo(2.53, 2);
    expect(ratio(100, 5500)).toBeCloseTo(5.03, 2);
    expect(ratio(300, 2437)).toBeGreaterThan(11);
  });
});

// ── 판정 ───────────────────────────────────────────────────

describe('판정', () => {
  it('기본 설정에서는 세 대역이 전부 임계 위다', () => {
    const result = model_calculate_result(DEFAULT_PARAMS);
    expect(model_calculate_verdict(result, true)).toBe('hold');
    expect(model_pick_weakest_band(result, true).key).toBe(WIFI_BAND_6);
    expect(model_pick_weakest_band(result, false).key).toBe(WIFI_BAND_5);
  });

  it('여유가 임계 아래로 내려가면 edge, 0 아래면 break', () => {
    const nearly = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 2 });
    expect(nearly.byKey[WIFI_BAND_6].marginDb).toBeCloseTo(1.8538, 4);
    expect(nearly.byKey[WIFI_BAND_6].marginDb).toBeGreaterThan(0);
    expect(nearly.byKey[WIFI_BAND_6].marginDb).toBeLessThan(WIFI_MARGIN_EDGE_DB);
    expect(model_calculate_verdict(nearly, true)).toBe('edge');

    const broken = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 3 });
    expect(broken.byKey[WIFI_BAND_5].marginDb).toBeLessThan(0);
    expect(model_calculate_verdict(broken, true)).toBe('break');
  });

  it('6 GHz를 끄면 판정에서도 빠진다 — 화면에 없는 곡선으로 판정하지 않는다', () => {
    // 벽 2장: 6 GHz 여유 1.85 dB(경계), 5 GHz 여유 6.68 dB(성립).
    const result = model_calculate_result({ ...DEFAULT_PARAMS, wallCount: 2 });
    expect(result.byKey[WIFI_BAND_5].marginDb).toBeCloseTo(6.6817, 4);
    expect(model_calculate_verdict(result, true)).toBe('edge');
    expect(model_calculate_verdict(result, false)).toBe('hold');
  });

  it('임계 상수를 지우면 이 단언들이 무너진다 (경계값 자체를 못박는다)', () => {
    expect(WIFI_MARGIN_EDGE_DB).toBe(6);
    expect(WIFI_WALL_LOSS_SMALL_DB).toBe(1);
  });
});

// ── 얇은 슬래브 경고 ───────────────────────────────────────

describe('투과 최대점 근처를 화면이 말할 수 있게 표시한다', () => {
  it('유리 11 mm의 5 GHz 벽 손실이 1 dB 아래라고 표시된다', () => {
    const result = model_calculate_result({
      ...DEFAULT_PARAMS, materialKey: 'glass', thicknessMm: 11,
    });
    expect(result.byKey[WIFI_BAND_5].smallWallLoss).toBe(true);
    expect(result.byKey[WIFI_BAND_5].wallLossDb).toBeLessThan(WIFI_WALL_LOSS_SMALL_DB);
    expect(result.byKey[WIFI_BAND_24].smallWallLoss).toBe(false);
  });

  it('벽이 0장이면 표시하지 않는다 — 없는 벽의 손실은 화제가 아니다', () => {
    const result = model_calculate_result({
      ...DEFAULT_PARAMS, materialKey: 'glass', thicknessMm: 11, wallCount: 0,
    });
    expect(result.byKey[WIFI_BAND_5].smallWallLoss).toBe(false);
  });

  it('콘크리트에서는 어느 두께에서도 표시되지 않는다', () => {
    for (let thicknessMm = 50; thicknessMm <= 300; thicknessMm += 5) {
      const result = model_calculate_result({ ...DEFAULT_PARAMS, thicknessMm });
      for (const band of result.bands) expect(band.smallWallLoss).toBe(false);
    }
  });
});

// ── 곡선 ───────────────────────────────────────────────────

describe('곡선', () => {
  it('점 개수만큼 나오고 양 끝이 슬라이더 범위와 같다', () => {
    const points = model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[0], 140);
    expect(points.length).toBe(140);
    expect(points[0].distanceM).toBeCloseTo(WIFI_DISTANCE_MIN_M, 12);
    expect(points.at(-1).distanceM).toBeCloseTo(WIFI_DISTANCE_MAX_M, 12);
  });

  it('점 개수가 1 이하면 빈 배열 (0으로 나누지 않는다)', () => {
    expect(model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[0], 1)).toEqual([]);
    expect(model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[0], 0)).toEqual([]);
  });

  it('로그 축에서 직선이다 — 이웃한 점의 dB 간격이 전부 같다', () => {
    const points = model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[1], 40);
    const first = points[1].receivedDbm - points[0].receivedDbm;
    for (let index = 2; index < points.length; index += 1) {
      expect(points[index].receivedDbm - points[index - 1].receivedDbm).toBeCloseTo(first, 9);
    }
    expect(first).toBeLessThan(0);
  });

  it('곡선의 한 점이 같은 거리의 결과와 같다 — 계산 경로가 둘이 아니다', () => {
    const points = model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[0], 3);
    const middleDistance = points[1].distanceM;
    const direct = model_calculate_result({ ...DEFAULT_PARAMS, distanceM: middleDistance });
    expect(points[1].receivedDbm).toBeCloseTo(direct.byKey[WIFI_BAND_24].receivedDbm, 12);
  });

  it('6 GHz를 끄면 곡선이 두 개, 켜면 세 개다', () => {
    expect(model_calculate_curves(DEFAULT_PARAMS, false, 5).map((curve) => curve.key))
      .toEqual([WIFI_BAND_24, WIFI_BAND_5]);
    expect(model_calculate_curves(DEFAULT_PARAMS, true, 5).map((curve) => curve.key))
      .toEqual([WIFI_BAND_24, WIFI_BAND_5, WIFI_BAND_6]);
  });

  it('두 곡선은 어디에서도 만나지 않는다 (같은 EIRP·같은 감도라면)', () => {
    const low = model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[0], 60);
    const high = model_calculate_curve(DEFAULT_PARAMS, WIFI_BANDS[1], 60);
    for (let index = 0; index < low.length; index += 1) {
      expect(low[index].receivedDbm).toBeGreaterThan(high[index].receivedDbm);
    }
  });
});

// ── 대역 정의 ──────────────────────────────────────────────

describe('대역', () => {
  it('중심주파수 셋과 끝에서 끝까지의 자유공간 손실 폭', () => {
    expect(WIFI_BANDS.map((band) => band.frequencyMHz)).toEqual([2437, 5500, 6525]);
    const span = (band) => 20 * Math.log10(band.edgeHighMHz / band.edgeLowMHz);
    expect(span(WIFI_BANDS[0])).toBeCloseTo(0.21, 2);
    expect(span(WIFI_BANDS[1])).toBeCloseTo(1.17, 2);
    expect(span(WIFI_BANDS[2])).toBeCloseTo(1.60, 2);
    // 중심주파수가 대역 안에 있다.
    for (const band of WIFI_BANDS) {
      expect(band.frequencyMHz).toBeGreaterThanOrEqual(band.edgeLowMHz);
      expect(band.frequencyMHz).toBeLessThanOrEqual(band.edgeHighMHz);
    }
  });
});

// ── 급수 항수를 바꿔 부르기 위한 보조 (대조 경로 전용) ─────
function reference_calculate_slab_loss_series_terms(materialKey, thicknessMm, frequencyMHz, terms) {
  const one = { re: 1, im: 0 };
  const index = reference_read_index(materialKey, frequencyMHz);
  const phase = reference_read_phase(index, thicknessMm, frequencyMHz);
  const singlePass = reference_read_single_pass(phase);
  const doublePass = reference_calculate_complex_multiply(singlePass, singlePass);
  const intoSlab = reference_calculate_complex_divide({ re: 2, im: 0 }, reference_calculate_complex_add(one, index));
  const outOfSlab = reference_calculate_complex_divide(
    { re: 2 * index.re, im: 2 * index.im },
    reference_calculate_complex_add(one, index),
  );
  const insideReflection = reference_calculate_complex_divide(
    reference_calculate_complex_subtract(index, one),
    reference_calculate_complex_add(index, one),
  );
  const ratio = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(insideReflection, insideReflection),
    doublePass,
  );
  let sum = { re: 0, im: 0 };
  let term = { re: 1, im: 0 };
  for (let bounce = 0; bounce < terms; bounce += 1) {
    sum = reference_calculate_complex_add(sum, term);
    term = reference_calculate_complex_multiply(term, ratio);
  }
  const transmission = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(
      reference_calculate_complex_multiply(intoSlab, outOfSlab), singlePass,
    ),
    sum,
  );
  return -20 * Math.log10(reference_calculate_complex_magnitude(transmission));
}

/** 대조 경로 ③을 권고문의 인쇄값 17.98로 한 번 더 돌린다. */
function reference_calculate_slab_loss_matrix_printed(materialKey, thicknessMm, frequencyMHz) {
  const index = reference_read_index(materialKey, frequencyMHz, REFERENCE_PRINTED_LOSS_FACTOR);
  const delta = reference_read_phase(index, thicknessMm, frequencyMHz);
  const cosine = { re: Math.cos(delta.re) * Math.cosh(delta.im), im: -Math.sin(delta.re) * Math.sinh(delta.im) };
  const sine = { re: Math.sin(delta.re) * Math.cosh(delta.im), im: Math.cos(delta.re) * Math.sinh(delta.im) };
  const imaginaryUnit = { re: 0, im: 1 };
  const m12 = reference_calculate_complex_divide(
    reference_calculate_complex_multiply(imaginaryUnit, sine), index,
  );
  const m21 = reference_calculate_complex_multiply(
    reference_calculate_complex_multiply(imaginaryUnit, index), sine,
  );
  const denominator = reference_calculate_complex_add(
    reference_calculate_complex_add(cosine, cosine),
    reference_calculate_complex_add(m12, m21),
  );
  return -20 * Math.log10(
    reference_calculate_complex_magnitude(reference_calculate_complex_divide({ re: 2, im: 0 }, denominator)),
  );
}
