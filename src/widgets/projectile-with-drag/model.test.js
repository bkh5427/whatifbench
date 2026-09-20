/**
 * 항력 포함 포물선 — 모델 테스트
 *
 * 이 페이지의 검수 포인트는 하나다: **Cd = 0으로 두면 진공 해석해와 일치하는가.**
 * 그래서 아래 대조는 전부 **독립 경로**로 한다 — 적분기를 부르지 않고 이 파일에서
 * 다시 적은 닫힌형과 맞춘다. g도 여기서 리터럴로 다시 적는다. 모델의 상수를
 * 그대로 빌려 쓰면 상수를 바꿔도 두 쪽이 같이 움직여 아무것도 지키지 못한다.
 */
import { describe, it, expect } from 'vitest';
import {
  PROJECTILE_GRAVITY_MS2,
  PROJECTILE_DENSITY_DEFAULT_KGM3,
  PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG,
  PROJECTILE_ANGLE_MIN_DEG,
  PROJECTILE_ANGLE_MAX_DEG,
  PROJECTILE_MASS_MIN_KG,
  PROJECTILE_MASS_MAX_KG,
  PROJECTILE_AREA_MIN_M2,
  PROJECTILE_AREA_MAX_M2,
  PROJECTILE_MASS_AXIS,
  PROJECTILE_AREA_AXIS,
  PROJECTILE_STEP_SECONDS,
  PROJECTILE_SWEEP_POINT_COUNT,
  PROJECTILE_PRESETS,
  PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG,
  PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG,
  model_build_default_parameters,
  model_check_parameters,
  model_clamp_angle,
  model_clamp_speed,
  model_clamp_drag,
  model_clamp_density,
  model_clamp_mass,
  model_clamp_area,
  model_calculate_log_value,
  model_calculate_log_index,
  model_calculate_drag_factor,
  model_calculate_terminal_speed,
  model_calculate_flight,
  model_calculate_vacuum,
  model_build_vacuum_path,
  model_calculate_summary,
  model_calculate_sweep,
  model_calculate_verdict,
  model_calculate_diameter,
  model_calculate_area,
} from './model.js';

// ── 대조 경로 ①: 진공 닫힌형을 이 파일에서 다시 적는다 ─────

/** 제3차 CGPM(1901)이 채택한 표준 중력가속도. **여기 리터럴이 그 값을 지킨다.** */
const REFERENCE_GRAVITY_MS2 = 9.80665;

function reference_calculate_radians(angleDeg) {
  return (angleDeg * Math.PI) / 180;
}

/** R = v₀²·sin2θ / g */
function reference_calculate_range(speedMs, angleDeg) {
  return (speedMs * speedMs * Math.sin(2 * reference_calculate_radians(angleDeg))) / REFERENCE_GRAVITY_MS2;
}

/** H = v₀²·sin²θ / 2g */
function reference_calculate_apex(speedMs, angleDeg) {
  const rise = Math.sin(reference_calculate_radians(angleDeg));
  return (speedMs * speedMs * rise * rise) / (2 * REFERENCE_GRAVITY_MS2);
}

/** T = 2·v₀·sinθ / g */
function reference_calculate_flight(speedMs, angleDeg) {
  return (2 * speedMs * Math.sin(reference_calculate_radians(angleDeg))) / REFERENCE_GRAVITY_MS2;
}

function test_read_relative_error(measured, expected) {
  if (expected === 0) return Math.abs(measured);
  return Math.abs(measured - expected) / Math.abs(expected);
}

/** 초안 본문이 인용하는 설정 — 145 g·73 mm 구, 해면 표준 공기, 40 m/s. */
const CHECK_ANGLES_DEG = [15, 30, 45, 60, 75];
/** 두 경로가 맞아야 하는 상대오차 상한. 실제 측정치는 이보다 두 자리 작다. */
const VACUUM_MATCH_TOLERANCE = 1e-12;

// ── 상수 ────────────────────────────────────────────────────

describe('물리 상수는 측정값이 아니라 채택값이다', () => {
  it('g는 제3차 CGPM(1901)이 채택한 9.80665 m/s²로 고정돼 있다', () => {
    expect(PROJECTILE_GRAVITY_MS2).toBe(REFERENCE_GRAVITY_MS2);
  });

  it('ρ 기본값은 ISO 2533:1975 해면 값 1.225 kg/m³다', () => {
    expect(PROJECTILE_DENSITY_DEFAULT_KGM3).toBe(1.225);
  });

  it('기본 파라미터가 전부 자기 유효범위를 통과한다 (로드 즉시 잘리지 않게)', () => {
    expect(model_check_parameters(model_build_default_parameters()).ok).toBe(true);
    const params = model_build_default_parameters();
    expect(model_clamp_angle(params.angleDeg)).toBe(params.angleDeg);
    expect(model_clamp_speed(params.speedMs)).toBe(params.speedMs);
    expect(model_clamp_drag(params.dragCoefficient)).toBe(params.dragCoefficient);
    expect(model_clamp_density(params.densityKgM3)).toBe(params.densityKgM3);
    // 로그 슬라이더의 기본값이 눈금 위에 없으면 손잡이와 계산값이 갈린다.
    expect(model_clamp_mass(params.massKg)).toBe(params.massKg);
    expect(model_clamp_area(params.areaM2)).toBe(params.areaM2);
  });
});

// ── 검수 포인트: Cd = 0 ↔ 진공 닫힌형 ──────────────────────

describe('검수 포인트 — Cd = 0이면 적분기가 진공 해석해와 일치한다', () => {
  it('15·30·45·60·75°에서 사거리·정점·비행시간이 닫힌형과 맞는다', () => {
    const base = { ...model_build_default_parameters(), dragCoefficient: 0 };
    let worst = 0;
    for (const angleDeg of CHECK_ANGLES_DEG) {
      const flight = model_calculate_flight({ ...base, angleDeg });
      const errors = [
        test_read_relative_error(flight.rangeMetres, reference_calculate_range(base.speedMs, angleDeg)),
        test_read_relative_error(flight.apexHeightMetres, reference_calculate_apex(base.speedMs, angleDeg)),
        test_read_relative_error(flight.flightSeconds, reference_calculate_flight(base.speedMs, angleDeg)),
        test_read_relative_error(flight.landingSpeedMs, base.speedMs),
      ];
      for (const error of errors) expect(error).toBeLessThan(VACUUM_MATCH_TOLERANCE);
      worst = Math.max(worst, ...errors);
    }
    // 이 단언이 있어야 "허용오차를 키우면 통과"가 안 된다. 실측 최댓값은 4e-14 근처다.
    expect(worst).toBeLessThan(1e-13);
  });

  it('45°에서 두 경로가 열 자리 넘게 같은 숫자를 낸다 (본문이 인용하는 값)', () => {
    const params = { ...model_build_default_parameters(), angleDeg: 45, dragCoefficient: 0 };
    const integrated = model_calculate_flight(params).rangeMetres;
    const closedForm = reference_calculate_range(params.speedMs, 45);
    expect(integrated.toFixed(6)).toBe('163.154594');
    expect(closedForm.toFixed(6)).toBe('163.154594');
  });

  it('ρ = 0으로 두어도 같은 답이 나온다 — 두 슬라이더가 같은 항을 죽인다', () => {
    const base = model_build_default_parameters();
    for (const angleDeg of CHECK_ANGLES_DEG) {
      const noDrag = model_calculate_flight({ ...base, angleDeg, dragCoefficient: 0 });
      const noAir = model_calculate_flight({ ...base, angleDeg, densityKgM3: 0 });
      expect(test_read_relative_error(noAir.rangeMetres, reference_calculate_range(base.speedMs, angleDeg)))
        .toBeLessThan(VACUUM_MATCH_TOLERANCE);
      expect(noAir.rangeMetres).toBeCloseTo(noDrag.rangeMetres, 10);
    }
  });

  it('Cd = 0이면 질량과 면적을 바꿔도 답이 움직이지 않는다', () => {
    const base = { ...model_build_default_parameters(), dragCoefficient: 0 };
    const light = model_calculate_flight({ ...base, massKg: PROJECTILE_MASS_MIN_KG, areaM2: PROJECTILE_AREA_MAX_M2 });
    const heavy = model_calculate_flight({ ...base, massKg: PROJECTILE_MASS_MAX_KG, areaM2: PROJECTILE_AREA_MIN_M2 });
    expect(light.rangeMetres).toBeCloseTo(heavy.rangeMetres, 10);
  });

  it('Cd = 0이면 최적각이 정확히 45°로 돌아온다', () => {
    const sweep = model_calculate_sweep({ ...model_build_default_parameters(), dragCoefficient: 0 });
    expect(sweep.optimum.angleDeg).toBeCloseTo(PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG, 2);
    expect(model_calculate_verdict(sweep.optimum.angleDeg)).toBe('hold');
  });
});

// ── 진공 닫힌형 자체 ────────────────────────────────────────

describe('진공 닫힌형', () => {
  it('세 식이 이 파일에서 다시 적은 식과 같다', () => {
    for (const angleDeg of [0, 15, 40, 45, 75, 90]) {
      const vacuum = model_calculate_vacuum({ ...model_build_default_parameters(), angleDeg });
      expect(vacuum.rangeMetres).toBeCloseTo(reference_calculate_range(40, angleDeg), 9);
      expect(vacuum.apexHeightMetres).toBeCloseTo(reference_calculate_apex(40, angleDeg), 9);
      expect(vacuum.flightSeconds).toBeCloseTo(reference_calculate_flight(40, angleDeg), 9);
    }
  });

  it('질량·면적·Cd·ρ가 식에 없다 — 유령선은 네 슬라이더에 움직이지 않는다', () => {
    const base = model_build_default_parameters();
    const moved = { ...base, massKg: 4, areaM2: 0.05, dragCoefficient: 1.2, densityKgM3: 0.3 };
    expect(model_calculate_vacuum(moved).rangeMetres).toBe(model_calculate_vacuum(base).rangeMetres);
  });

  it('유령선의 점들이 원점에서 나가 사거리에서 땅에 닿는다', () => {
    const params = model_build_default_parameters();
    const path = model_build_vacuum_path(params, 120);
    const vacuum = model_calculate_vacuum(params);
    expect(path.length).toBe(120);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1).x).toBeCloseTo(vacuum.rangeMetres, 9);
    expect(path.at(-1).y).toBeCloseTo(0, 9);
    const highest = Math.max(...path.map((point) => point.y));
    // 점이 유한개라 정점을 정확히 밟지 못한다. 닫힌형 정점을 넘지는 않아야 한다.
    expect(highest).toBeLessThanOrEqual(vacuum.apexHeightMetres);
    expect(highest).toBeGreaterThan(vacuum.apexHeightMetres * 0.999);
  });
});

// ── 본문이 인용하는 숫자 ────────────────────────────────────

describe('본문이 인용하는 숫자 (145 g·73 mm 구, 40 m/s, 해면 표준 공기)', () => {
  const params = model_build_default_parameters();

  it('k와 그 파생값 — 1/k, 종단속도, 발사 순간의 항력 감속', () => {
    const dragFactor = model_calculate_drag_factor(params);
    expect(dragFactor).toBeCloseTo(8.3087e-3, 7);
    expect(1 / dragFactor).toBeCloseTo(120.36, 2);
    expect(model_calculate_terminal_speed(dragFactor)).toBeCloseTo(34.355, 3);
    // 초안 블록 6은 13.30이라 적었으나 k·40²는 13.29다.
    expect(Number((dragFactor * 40 * 40).toFixed(2))).toBe(13.29);
  });

  it('궤적 요약 — 사거리·정점 높이·정점 속력·정점 항력·착지 속력', () => {
    const flight = model_calculate_flight(params);
    expect(Number(flight.rangeMetres.toFixed(1))).toBe(85.9);
    // 정점 **높이** 23.23 m와 정점 **속력** 19.46 m/s는 서로 다른 양이다.
    // 초안이 한 번 섞어 적었던 자리라 둘을 함께 못박는다.
    expect(Number(flight.apexHeightMetres.toFixed(2))).toBe(23.23);
    expect(Number(flight.apexSpeedMs.toFixed(2))).toBe(19.46);
    expect(Number(flight.apexDragMs2.toFixed(3))).toBe(3.148);
    expect(Number(flight.landingSpeedMs.toFixed(2))).toBe(22.95);
    expect(Number(flight.flightSeconds.toFixed(2))).toBe(4.33);
  });

  it('같은 각도의 진공 사거리와 두 경로의 차이', () => {
    const summary = model_calculate_summary(params);
    expect(Number(summary.vacuum.rangeMetres.toFixed(1))).toBe(160.7);
    expect(Number(summary.rangeLostMetres.toFixed(1))).toBe(74.8);
    expect(summary.rangeRatio).toBeCloseTo(0.5347, 4);
  });

  it('최적각은 45°가 아니라 40.1°이고 그 자리의 사거리가 85.9 m다', () => {
    const sweep = model_calculate_sweep(params);
    expect(Number(sweep.optimum.angleDeg.toFixed(1))).toBe(40.1);
    expect(Number(sweep.optimum.rangeMetres.toFixed(1))).toBe(85.9);
    expect(model_calculate_verdict(sweep.optimum.angleDeg)).toBe('edge');
  });

  it('봉우리가 거의 평평하다 — 35·40·45°가 1% 안에 든다', () => {
    const ranges = [35, 40, 45].map(
      (angleDeg) => model_calculate_flight({ ...params, angleDeg }).rangeMetres,
    );
    expect(ranges.map((value) => Number(value.toFixed(1)))).toEqual([84.9, 85.9, 85.0]);
    const spread = (Math.max(...ranges) - Math.min(...ranges)) / Math.max(...ranges);
    expect(spread).toBeLessThan(0.013);
    expect(spread).toBeGreaterThan(0.008);
  });

  it('질량만 바꾸면 최적각이 진공 답으로 기어 올라간다', () => {
    const table = [
      [0.03, 34.3],
      [0.145, 40.1],
      [0.4, 42.6],
      [5, 44.8],
    ];
    let previous = 0;
    for (const [massKg, expectedDeg] of table) {
      const sweep = model_calculate_sweep({ ...params, massKg });
      expect(Number(sweep.optimum.angleDeg.toFixed(1))).toBe(expectedDeg);
      // 단조성까지 본다 — 리터럴 네 개만으로는 중간이 뒤집혀도 통과한다.
      expect(sweep.optimum.angleDeg).toBeGreaterThan(previous);
      expect(sweep.optimum.angleDeg).toBeLessThan(PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG);
      previous = sweep.optimum.angleDeg;
    }
  });

  it('면적을 키우면 최적각이 내려간다 (질량과 반대 방향)', () => {
    const wide = model_calculate_sweep({ ...params, areaM2: 0.02 });
    const narrow = model_calculate_sweep({ ...params, areaM2: 0.001 });
    expect(wide.optimum.angleDeg).toBeLessThan(narrow.optimum.angleDeg);
  });
});

// ── 적분기의 성질 ───────────────────────────────────────────

describe('적분기', () => {
  const params = model_build_default_parameters();

  it('착지를 스텝 경계에서 자르지 않는다 — 비행시간이 스텝의 정수배가 아니다', () => {
    // 경계에서 자르면 사거리가 스텝 크기에 매인다. 이 단언이 보간을 지킨다.
    const flight = model_calculate_flight(params);
    const steps = flight.flightSeconds / PROJECTILE_STEP_SECONDS;
    expect(Math.abs(steps - Math.round(steps))).toBeGreaterThan(0.01);
    // 착지점의 높이는 0이어야 한다 (경계에서 잘랐다면 음수로 지나가 있다).
    expect(model_calculate_flight(params, { samplePoints: true }).points.at(-1).y).toBe(0);
  });

  it('정점도 경계에서 자르지 않는다 — 정점 시각이 스텝의 정수배가 아니다', () => {
    const flight = model_calculate_flight(params);
    const steps = flight.apexSeconds / PROJECTILE_STEP_SECONDS;
    expect(Math.abs(steps - Math.round(steps))).toBeGreaterThan(0.01);
  });

  it('스텝을 절반으로 줄여도 사거리가 표시 자릿수 안에서 변하지 않는다', () => {
    const coarse = model_calculate_flight(params, { stepSeconds: PROJECTILE_STEP_SECONDS });
    const fine = model_calculate_flight(params, { stepSeconds: PROJECTILE_STEP_SECONDS / 2 });
    // 보간을 빼면 이 차이가 0.07 m로 벌어진다 — 화면의 소수 첫째 자리가 흔들린다.
    expect(Math.abs(coarse.rangeMetres - fine.rangeMetres)).toBeLessThan(1e-6);
    expect(Math.abs(coarse.apexHeightMetres - fine.apexHeightMetres)).toBeLessThan(1e-6);
  });

  it('스텝 크기의 4제곱으로 수렴한다 — RK4가 실제로 RK4다', () => {
    // 오차 자체가 아니라 **수렴 차수**를 잰다. 오일러나 RK2로 낮추면
    // 비(比)가 16이 아니라 2나 4가 되어 여기서 걸린다.
    const ranges = [0.16, 0.08, 0.04, 0.02].map(
      (stepSeconds) => model_calculate_flight(params, { stepSeconds }).rangeMetres,
    );
    const firstGap = Math.abs(ranges[0] - ranges[1]);
    const secondGap = Math.abs(ranges[1] - ranges[2]);
    const thirdGap = Math.abs(ranges[2] - ranges[3]);
    expect(firstGap / secondGap).toBeGreaterThan(8);
    expect(secondGap / thirdGap).toBeGreaterThan(8);
    expect(secondGap / thirdGap).toBeLessThan(32);
  });

  it('궤적 점을 남기든 말든 요약값이 같다 — 모델이 규정하지 않은 자유도', () => {
    const quiet = model_calculate_flight(params);
    const drawn = model_calculate_flight(params, { samplePoints: true });
    expect(quiet.points).toBeNull();
    expect(drawn.points.length).toBeGreaterThan(10);
    for (const key of ['rangeMetres', 'flightSeconds', 'apexHeightMetres', 'apexSpeedMs', 'landingSpeedMs']) {
      expect(drawn[key]).toBe(quiet[key]);
    }
  });

  it('항력이 붙으면 사거리·정점·착지 속력이 전부 진공보다 작다', () => {
    for (const angleDeg of [5, 20, 40, 60, 85]) {
      const flight = model_calculate_flight({ ...params, angleDeg });
      const vacuum = model_calculate_vacuum({ ...params, angleDeg });
      expect(flight.rangeMetres).toBeLessThan(vacuum.rangeMetres);
      expect(flight.apexHeightMetres).toBeLessThan(vacuum.apexHeightMetres);
      expect(flight.landingSpeedMs).toBeLessThan(vacuum.landingSpeedMs);
      expect(flight.flightSeconds).toBeLessThan(vacuum.flightSeconds);
    }
  });

  it('경계 각도에서도 죽지 않는다 — 90°는 사거리 0, 0°도 사거리 0', () => {
    const straightUp = model_calculate_flight({ ...params, angleDeg: 90 });
    expect(straightUp.rangeMetres).toBeLessThan(1e-6);
    expect(straightUp.apexHeightMetres).toBeGreaterThan(0);
    expect(straightUp.flightSeconds).toBeGreaterThan(0);

    const flat = model_calculate_flight({ ...params, angleDeg: 0 });
    expect(flat.rangeMetres).toBeLessThan(1e-4);
    expect(flat.flightSeconds).toBeLessThan(1e-4);
  });

  it('가장 느린 설정과 가장 빠른 설정에서도 착지한다', () => {
    const corners = [
      { speedMs: 5, angleDeg: 0.5, massKg: 0.01, areaM2: 0.2, dragCoefficient: 1.2 },
      { speedMs: 80, angleDeg: 90, massKg: 5, areaM2: 1e-4, dragCoefficient: 0 },
      { speedMs: 80, angleDeg: 89.5, massKg: 0.01, areaM2: 0.2, dragCoefficient: 1.2, densityKgM3: 1.5 },
    ];
    for (const corner of corners) {
      const flight = model_calculate_flight({ ...params, ...corner });
      expect(Number.isFinite(flight.rangeMetres)).toBe(true);
      expect(flight.rangeMetres).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── 스윕과 최적각 ───────────────────────────────────────────

describe('각도 스윕', () => {
  const params = model_build_default_parameters();

  it('0°에서 90°까지 1° 간격으로 훑는다', () => {
    const sweep = model_calculate_sweep(params);
    expect(sweep.points.length).toBe(PROJECTILE_SWEEP_POINT_COUNT);
    expect(sweep.gapDeg).toBe(1);
    expect(sweep.points[0].angleDeg).toBe(PROJECTILE_ANGLE_MIN_DEG);
    expect(sweep.points.at(-1).angleDeg).toBe(PROJECTILE_ANGLE_MAX_DEG);
  });

  it('항력 곡선이 진공 곡선 아래에 있고, 진공 곡선은 45° 대칭이다', () => {
    const sweep = model_calculate_sweep(params);
    for (const point of sweep.points) {
      expect(point.dragRangeMetres).toBeLessThanOrEqual(point.vacuumRangeMetres + 1e-9);
    }
    for (const angleDeg of [5, 15, 30, 44]) {
      const low = sweep.points.find((point) => point.angleDeg === angleDeg);
      const high = sweep.points.find((point) => point.angleDeg === 90 - angleDeg);
      expect(low.vacuumRangeMetres).toBeCloseTo(high.vacuumRangeMetres, 9);
      // 항력 곡선은 대칭이 아니다 — 왼쪽으로 기운다.
      expect(low.dragRangeMetres).toBeGreaterThan(high.dragRangeMetres);
    }
  });

  it('최적각이 격자 해상도가 아니라 재탐색으로 정해진다', () => {
    const fine = model_calculate_sweep(params);
    // 격자를 성기게 해도 최적각은 0.05° 안에서 같아야 한다. 격자의 argmax를
    // 그대로 답으로 쓰면 여기서 0.5° 넘게 갈린다.
    const coarse = model_calculate_sweep(params, { pointCount: 19 });
    expect(Math.abs(fine.optimum.angleDeg - coarse.optimum.angleDeg)).toBeLessThan(0.05);
    // 그러면서도 격자의 최댓값과 한 칸 안에서 만나야 한다 (엉뚱한 봉우리가 아니다).
    const gridBest = fine.points.reduce((best, point) => (point.dragRangeMetres > best.dragRangeMetres ? point : best));
    expect(Math.abs(gridBest.angleDeg - fine.optimum.angleDeg)).toBeLessThanOrEqual(fine.gapDeg);
  });

  it('최적각의 사거리가 격자 위 어느 점보다 크다', () => {
    const sweep = model_calculate_sweep(params);
    for (const point of sweep.points) {
      expect(sweep.optimum.rangeMetres).toBeGreaterThanOrEqual(point.dragRangeMetres - 1e-9);
    }
  });

  it('진공 최적각은 언제나 45°이고 그 사거리는 닫힌형과 같다', () => {
    const sweep = model_calculate_sweep({ ...params, angleDeg: 12 });
    expect(sweep.vacuumOptimum.angleDeg).toBe(45);
    expect(sweep.vacuumOptimum.rangeMetres).toBeCloseTo(reference_calculate_range(params.speedMs, 45), 9);
  });
});

// ── 판정 ────────────────────────────────────────────────────

describe('판정', () => {
  it('45°에서 밀려난 정도로 성립·경계·파탄을 가른다', () => {
    expect(model_calculate_verdict(45)).toBe('hold');
    expect(model_calculate_verdict(45 - PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG + 0.01)).toBe('hold');
    expect(model_calculate_verdict(45 - PROJECTILE_VERDICT_EDGE_MIN_SHIFT_DEG)).toBe('edge');
    expect(model_calculate_verdict(45 - PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG + 0.01)).toBe('edge');
    expect(model_calculate_verdict(45 - PROJECTILE_VERDICT_BREAK_MIN_SHIFT_DEG)).toBe('break');
    expect(model_calculate_verdict(20)).toBe('break');
  });
});

// ── 항력 유무 판정 ──────────────────────────────────────────

/**
 * `hasDrag`의 독립 대조 경로. model.js와 같은 파일에 사는 `model_check_has_drag`를
 * 다시 부르지 않고, 여기서 곱셈을 다시 적는다 — 사거리 차이가 아니라 항력항
 * 그 자체(밀도·항력계수·단면적의 곱)로 판정해야 함을 이 파일이 독립적으로 못박는다.
 */
function reference_check_has_drag(params) {
  return params.densityKgM3 * params.dragCoefficient * params.areaM2 !== 0;
}

describe('hasDrag — "공기가 없다"는 사거리 차이가 아니라 항력항 자체로 정한다', () => {
  const params = model_build_default_parameters();

  it('항력계수 0, 또는 공기밀도 0이면 항력이 없다', () => {
    expect(model_calculate_flight({ ...params, dragCoefficient: 0 }).hasDrag).toBe(false);
    expect(model_calculate_flight({ ...params, densityKgM3: 0 }).hasDrag).toBe(false);
    expect(model_calculate_flight(params).hasDrag).toBe(true);
  });

  /**
   * 치명 결함 재현: θ=0°·θ=90°·v₀=5 m/s는 전부 항력이 걸려 있는데도
   * "항력·진공 두 사거리의 차이"가 우연히 0에 가깝다 (0°·90°는 수평 사거리
   * 자체가 0, 5 m/s는 항력의 절대량이 작다). 절대 간격으로 판정하면 이 셋 모두
   * "공기가 없다"고 잘못 말한다. hasDrag는 여기서 전부 true여야 한다.
   */
  it('θ=0°·θ=90°·v₀=5 m/s — 사거리 차이가 작아도 항력은 켜져 있다', () => {
    const casesWithAirOn = [
      { ...params, angleDeg: 0 },
      { ...params, angleDeg: 90 },
      { ...params, speedMs: 5 },
    ];
    for (const caseParams of casesWithAirOn) {
      expect(reference_check_has_drag(caseParams)).toBe(true);
      const summary = model_calculate_summary(caseParams);
      expect(summary.drag.hasDrag).toBe(true);
      // 대조 경로(밀도×Cd×면적)와 model.js의 판정이 일치해야 한다.
      expect(summary.drag.hasDrag).toBe(reference_check_has_drag(caseParams));
    }
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  const params = model_build_default_parameters();

  it('값이 이미 슬라이더 눈금 위에 있다 (클램프가 다시 움직이지 않는다)', () => {
    for (const preset of PROJECTILE_PRESETS) {
      if (preset.massKg !== undefined) expect(model_clamp_mass(preset.massKg)).toBe(preset.massKg);
      if (preset.areaM2 !== undefined) expect(model_clamp_area(preset.areaM2)).toBe(preset.areaM2);
      expect(model_clamp_drag(preset.dragCoefficient)).toBe(preset.dragCoefficient);
    }
  });

  it('진공 프리셋은 Cd만 0으로 두고 질량·면적을 건드리지 않는다', () => {
    const vacuum = PROJECTILE_PRESETS.find((preset) => preset.key === 'vacuum');
    expect(vacuum.dragCoefficient).toBe(0);
    expect(vacuum.massKg).toBeUndefined();
    expect(vacuum.areaM2).toBeUndefined();
  });

  it('다섯 프리셋이 판정 세 가지를 전부 밟는다 (커버리지)', () => {
    const verdicts = PROJECTILE_PRESETS.map((preset) => {
      const merged = { ...params, ...preset };
      delete merged.key;
      delete merged.label;
      return model_calculate_verdict(model_calculate_sweep(merged).optimum.angleDeg);
    });
    expect(new Set(verdicts)).toEqual(new Set(['hold', 'edge', 'break']));
  });

  it('프리셋의 지름이 원래 치수로 되돌아온다 (면적 ↔ 지름 왕복)', () => {
    const expected = [73, 67, 95, 399];
    const measured = PROJECTILE_PRESETS
      .filter((preset) => preset.areaM2 !== undefined)
      .map((preset) => Math.round(model_calculate_diameter(preset.areaM2) * 1000));
    expect(measured).toEqual(expected);
  });
});

// ── 파라미터 검사 ───────────────────────────────────────────

describe('유효범위 밖은 조용히 숫자를 뱉지 않는다', () => {
  const params = model_build_default_parameters();

  it('질량 0, 속력 0, 각도 100°, 음수 Cd, 면적 0, 음수 밀도가 전부 throw다', () => {
    const broken = [
      { massKg: 0 },
      { speedMs: 0 },
      { angleDeg: 100 },
      { angleDeg: -1 },
      { dragCoefficient: -0.1 },
      { areaM2: 0 },
      { densityKgM3: -1 },
      { massKg: Number.NaN },
      { speedMs: Number.POSITIVE_INFINITY },
    ];
    for (const patch of broken) {
      expect(() => model_calculate_flight({ ...params, ...patch })).toThrow(RangeError);
      expect(model_check_parameters({ ...params, ...patch }).ok).toBe(false);
    }
  });

  it('검사 실패에 사유 문구가 붙는다', () => {
    const checked = model_check_parameters({ ...params, massKg: 0 });
    expect(checked.ok).toBe(false);
    expect(checked.message).toContain('질량');
  });

  it('적분 스텝이 0 이하면 throw한다 (무한루프 대신)', () => {
    expect(() => model_calculate_flight(params, { stepSeconds: 0 })).toThrow(RangeError);
    expect(() => model_calculate_flight(params, { stepSeconds: -1 })).toThrow(RangeError);
  });

  it('파라미터가 아예 없으면 throw한다', () => {
    expect(() => model_calculate_flight(null)).toThrow(RangeError);
    expect(model_check_parameters(null).ok).toBe(false);
  });
});

// ── 클램프와 로그 눈금 ──────────────────────────────────────

describe('클램프와 로그 눈금', () => {
  it('선형 슬라이더는 눈금 위로 맞는다', () => {
    expect(model_clamp_angle(40.3)).toBe(40.5);
    expect(model_clamp_angle(-5)).toBe(0);
    expect(model_clamp_angle(120)).toBe(90);
    expect(model_clamp_speed(40.4)).toBe(40);
    expect(model_clamp_speed(1)).toBe(5);
    expect(model_clamp_drag(0.474)).toBe(0.47);
    expect(model_clamp_drag(-1)).toBe(0);
    expect(model_clamp_drag(9)).toBe(1.2);
    expect(model_clamp_density(1.2263)).toBe(1.225);
  });

  it('로그 축의 양 끝이 정확히 최소·최대값이다', () => {
    expect(model_calculate_log_value(PROJECTILE_MASS_AXIS, PROJECTILE_MASS_AXIS.indexMin)).toBe(PROJECTILE_MASS_MIN_KG);
    expect(model_calculate_log_value(PROJECTILE_MASS_AXIS, PROJECTILE_MASS_AXIS.indexMax)).toBe(PROJECTILE_MASS_MAX_KG);
    expect(model_calculate_log_value(PROJECTILE_AREA_AXIS, PROJECTILE_AREA_AXIS.indexMin)).toBe(PROJECTILE_AREA_MIN_M2);
    expect(model_calculate_log_value(PROJECTILE_AREA_AXIS, PROJECTILE_AREA_AXIS.indexMax)).toBe(PROJECTILE_AREA_MAX_M2);
  });

  it('칸 번호 0이 기본값이다 — 눈금이 기본값에 앵커돼 있다', () => {
    expect(model_calculate_log_value(PROJECTILE_MASS_AXIS, 0)).toBe(0.145);
    expect(model_calculate_log_value(PROJECTILE_AREA_AXIS, 0)).toBe(4.185e-3);
    expect(model_calculate_log_index(PROJECTILE_MASS_AXIS, 0.145)).toBe(0);
    expect(model_calculate_log_index(PROJECTILE_AREA_AXIS, 4.185e-3)).toBe(0);
  });

  it('한 칸이 언제나 같은 배수다 — 로그 눈금이 실제로 로그다', () => {
    const ratios = [-40, 0, 40].map(
      (index) =>
        model_calculate_log_value(PROJECTILE_MASS_AXIS, index + 1) /
        model_calculate_log_value(PROJECTILE_MASS_AXIS, index),
    );
    // 눈금 값은 유효숫자 6자리로 고정돼 있어 비도 그 자리에서만 같다.
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 5);
    // 선형 눈금으로 바꾸면 이 비가 칸마다 달라져 여기서 걸린다.
    expect(ratios[0]).toBeCloseTo(Math.pow(10, 1 / 80), 5);
  });

  it('값 → 칸 → 값 왕복이 제자리로 돌아온다', () => {
    for (const massKg of [0.01, 0.03, 0.145, 1, 5]) {
      const snapped = model_clamp_mass(massKg);
      expect(model_clamp_mass(snapped)).toBe(snapped);
      expect(snapped).toBeGreaterThanOrEqual(PROJECTILE_MASS_MIN_KG);
      expect(snapped).toBeLessThanOrEqual(PROJECTILE_MASS_MAX_KG);
      expect(Math.abs(Math.log10(snapped / massKg))).toBeLessThan(1 / 80);
    }
  });

  it('로그 축에 0과 음수가 들어와도 무한루프나 NaN이 되지 않는다', () => {
    // `log10(0) = -Infinity`, `log10(음수) = NaN`. 가드가 없으면 여기서 축이 무너진다.
    expect(model_clamp_mass(0)).toBe(0.145);
    expect(model_clamp_mass(-3)).toBe(0.145);
    expect(model_clamp_area(Number.NaN)).toBe(4.185e-3);
  });

  it('면적과 지름이 서로의 역함수다', () => {
    for (const diameterM of [0.04, 0.073, 0.4]) {
      expect(model_calculate_diameter(model_calculate_area(diameterM))).toBeCloseTo(diameterM, 12);
    }
    expect(Math.round(model_calculate_diameter(4.185e-3) * 1000)).toBe(73);
    expect(model_calculate_diameter(0)).toBe(0);
  });
});
