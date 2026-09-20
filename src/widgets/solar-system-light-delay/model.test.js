/**
 * 태양계 통신 지연 — 모델 테스트
 *
 * **같은 식을 한 번 더 부르는 것은 검증이 아니다.** 대조 경로를 두 벌 직접 적는다.
 *   ① 직교좌표: 지구를 (a_E, 0)에, 대상을 (a_p cos θ, a_p sin θ)에 놓고 두 점 사이 거리.
 *      코사인법칙과 산술이 겹치지 않는다 — 제곱·합·제곱근의 순서가 다르다.
 *   ② 양 끝: θ = 0°와 180°에서는 삼각함수 없이 두 반지름의 차와 합이다.
 * 환산도 마찬가지로 둘이다. 모델은 au → 광초 계수 하나를 쓰고,
 * 대조 경로는 au → 미터 → ÷ c로 간다.
 */
import { describe, it, expect } from 'vitest';
import {
  AU_LIGHT_SECONDS,
  AU_METRES,
  BODIES,
  BODY_DEFAULT_KEY,
  BODY_KEYS,
  EARTH_ECCENTRICITY,
  EARTH_SEMI_MAJOR_AXIS_AU,
  LEGS_ROUND_TRIP,
  SECONDS_PER_MINUTE,
  SPEED_OF_LIGHT_MS,
  SWEEP_POINT_COUNT,
  SWING_BREAK_MIN,
  SWING_EDGE_MIN,
  THETA_MAX_DEG,
  THETA_MIN_DEG,
  TURNS_MAX,
  TURNS_MIN,
  VERDICT_BREAK,
  VERDICT_EDGE,
  VERDICT_HOLD,
  model_calculate_body_table,
  model_calculate_delay_seconds,
  model_calculate_distance_au,
  model_calculate_elliptic_band,
  model_calculate_extremes,
  model_calculate_result,
  model_calculate_steepest_theta_deg,
  model_calculate_sweep,
  model_calculate_verdict,
  model_check_parameters,
  model_clamp_body_key,
  model_clamp_theta,
  model_clamp_turns,
  model_read_body,
} from './model.js';

// ── 대조 경로 ───────────────────────────────────────────────

/** ① 직교좌표에서 두 점 사이 거리. 코사인법칙을 쓰지 않는다. */
function reference_calculate_chord_au(semiMajorAxisAu, thetaDegrees) {
  const radians = (thetaDegrees * Math.PI) / 180;
  const earthX = EARTH_SEMI_MAJOR_AXIS_AU;
  const earthY = 0;
  const targetX = semiMajorAxisAu * Math.cos(radians);
  const targetY = semiMajorAxisAu * Math.sin(radians);
  return Math.hypot(targetX - earthX, targetY - earthY);
}

/** ② 양 끝. 삼각함수 없이 차와 합. */
function reference_calculate_extreme_au(semiMajorAxisAu, position) {
  return position === 'closest'
    ? Math.abs(semiMajorAxisAu - EARTH_SEMI_MAJOR_AXIS_AU)
    : semiMajorAxisAu + EARTH_SEMI_MAJOR_AXIS_AU;
}

/** 환산 대조 경로: au → 미터 → ÷ c. 모델은 광초 계수 하나로 간다. */
function reference_calculate_delay_seconds(distanceAu) {
  const metres = distanceAu * 149597870700;
  return metres / 299792458;
}

/** 대화 길이 대조 경로: 곱셈이 아니라 턴마다 왕복을 더한다. */
function reference_count_conversation_seconds(oneWaySeconds, turns) {
  let total = 0;
  for (let turn = 0; turn < turns; turn += 1) total += oneWaySeconds + oneWaySeconds;
  return total;
}

/** 이심률에서 두 극단 배치를 직접 짚는 대조 경로. */
function reference_calculate_elliptic_au(semiMajorAxisAu, eccentricity) {
  const targetPerihelion = semiMajorAxisAu - semiMajorAxisAu * eccentricity;
  const targetAphelion = semiMajorAxisAu + semiMajorAxisAu * eccentricity;
  const earthPerihelion = EARTH_SEMI_MAJOR_AXIS_AU - EARTH_SEMI_MAJOR_AXIS_AU * EARTH_ECCENTRICITY;
  const earthAphelion = EARTH_SEMI_MAJOR_AXIS_AU + EARTH_SEMI_MAJOR_AXIS_AU * EARTH_ECCENTRICITY;
  const closest =
    semiMajorAxisAu > EARTH_SEMI_MAJOR_AXIS_AU
      ? targetPerihelion - earthAphelion
      : earthPerihelion - targetAphelion;
  return { closestAu: Math.max(0, closest), farthestAu: targetAphelion + earthAphelion };
}

/** 분 단위로 읽는다. 본문 표가 인용하는 자릿수와 같게 둔다. */
function test_read_minutes(seconds, digits = 2) {
  return (seconds / SECONDS_PER_MINUTE).toFixed(digits);
}

// ── 정의 상수 ───────────────────────────────────────────────

describe('정의상 정확한 두 상수', () => {
  it('c와 au가 정의값 그대로다', () => {
    expect(SPEED_OF_LIGHT_MS).toBe(299792458);
    expect(AU_METRES).toBe(149597870700);
  });

  it('1 au = 499.004784 광초 — 본문이 인용하는 자릿수까지', () => {
    expect(AU_LIGHT_SECONDS.toFixed(6)).toBe('499.004784');
  });

  it('환산 계수가 두 경로에서 같다', () => {
    for (const distanceAu of [0.25, 1, 2.52371295, 31.07]) {
      expect(model_calculate_delay_seconds(distanceAu)).toBeCloseTo(
        reference_calculate_delay_seconds(distanceAu),
        9,
      );
    }
  });
});

// ── 기하: 대조 경로 ① ───────────────────────────────────────

describe('현(chord) 계산 — 직교좌표 대조', () => {
  it('여덟 천체 × θ 0~180°에서 두 경로가 일치한다', () => {
    let checked = 0;
    for (const body of BODIES) {
      for (let theta = THETA_MIN_DEG; theta <= THETA_MAX_DEG; theta += 1) {
        const model = model_calculate_distance_au(body.semiMajorAxisAu, theta);
        const reference = reference_calculate_chord_au(body.semiMajorAxisAu, theta);
        // 상대오차로 잰다. 해왕성(31 au)과 금성(0.28 au)이 같은 절대 허용오차를 쓸 수 없다.
        expect(Math.abs(model - reference) / Math.max(reference, 1e-12)).toBeLessThan(1e-12);
        checked += 1;
      }
    }
    expect(checked).toBe(BODIES.length * (THETA_MAX_DEG - THETA_MIN_DEG + 1));
  });

  it('거리가 어느 각에서도 NaN이나 음수가 되지 않는다', () => {
    for (const body of BODIES) {
      for (let theta = THETA_MIN_DEG; theta <= THETA_MAX_DEG; theta += 1) {
        const distance = model_calculate_distance_au(body.semiMajorAxisAu, theta);
        expect(Number.isFinite(distance)).toBe(true);
        expect(distance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('θ가 커질수록 거리는 단조 증가한다', () => {
    for (const body of BODIES.filter((entry) => entry.semiMajorAxisAu > 0)) {
      let previous = -Infinity;
      for (let theta = THETA_MIN_DEG; theta <= THETA_MAX_DEG; theta += 1) {
        const distance = model_calculate_distance_au(body.semiMajorAxisAu, theta);
        expect(distance).toBeGreaterThan(previous);
        previous = distance;
      }
    }
  });
});

// ── 기하: 대조 경로 ② ───────────────────────────────────────

describe('양 끝 — 차와 합 대조', () => {
  it('θ = 0°는 반지름의 차, 180°는 합이다', () => {
    for (const body of BODIES) {
      expect(model_calculate_distance_au(body.semiMajorAxisAu, THETA_MIN_DEG)).toBeCloseTo(
        reference_calculate_extreme_au(body.semiMajorAxisAu, 'closest'),
        12,
      );
      expect(model_calculate_distance_au(body.semiMajorAxisAu, THETA_MAX_DEG)).toBeCloseTo(
        reference_calculate_extreme_au(body.semiMajorAxisAu, 'farthest'),
        12,
      );
    }
  });

  it('슬라이더 양 끝의 결과가 `model_calculate_extremes`와 같다 — 계산 경로가 하나다', () => {
    for (const key of BODY_KEYS) {
      const extremes = model_calculate_extremes(key);
      const closest = model_calculate_result(key, THETA_MIN_DEG, false, TURNS_MIN);
      const farthest = model_calculate_result(key, THETA_MAX_DEG, false, TURNS_MIN);
      expect(closest.oneWaySeconds).toBeCloseTo(extremes.closestSeconds, 9);
      expect(farthest.oneWaySeconds).toBeCloseTo(extremes.farthestSeconds, 9);
    }
  });

  it('태양은 θ가 무엇이든 같은 거리다 — 모델이 규정하지 않은 자유도', () => {
    // a = 0이라 θ가 식에서 사라진다. 특수분기가 아니라 기하가 그렇게 만든다.
    const base = model_calculate_distance_au(0, THETA_MIN_DEG);
    for (let theta = THETA_MIN_DEG; theta <= THETA_MAX_DEG; theta += 1) {
      expect(model_calculate_distance_au(0, theta)).toBeCloseTo(base, 12);
    }
    expect(base).toBeCloseTo(EARTH_SEMI_MAJOR_AXIS_AU, 12);
  });
});

// ── 골든 벡터 ───────────────────────────────────────────────

/**
 * 본문 블록 4의 표 그대로. 손계산·스크립트 두 경로가 낸 값이고,
 * **표시 자릿수까지** 못박는다 — 상수를 하나라도 건드리면 여기서 걸린다.
 * [키, 최근접 au, 최근접 분, 최원 au, 최원 분, 흔들림]
 */
const GOLDEN_TABLE = [
  ['sun', '1.000', '8.32', '1.000', '8.32', '1.00'],
  ['mercury', '0.613', '5.10', '1.387', '11.54', '2.26'],
  ['venus', '0.277', '2.30', '1.723', '14.33', '6.23'],
  ['mars', '0.524', '4.36', '2.524', '20.99', '4.82'],
  ['jupiter', '4.203', '34.95', '6.203', '51.59', '1.48'],
  ['saturn', '8.537', '71.00', '10.537', '87.63', '1.23'],
  ['uranus', '18.189', '151.27', '20.189', '167.91', '1.11'],
  ['neptune', '29.070', '241.77', '31.070', '258.40', '1.07'],
];

describe('골든 벡터 — 본문 블록 4의 표', () => {
  it('여덟 행이 표시 자릿수까지 일치한다', () => {
    const rows = model_calculate_body_table();
    expect(rows.length).toBe(GOLDEN_TABLE.length);
    rows.forEach((row, index) => {
      const [key, closestAu, closestMin, farthestAu, farthestMin, swing] = GOLDEN_TABLE[index];
      expect(row.body.key).toBe(key);
      expect(row.closestAu.toFixed(3)).toBe(closestAu);
      expect(test_read_minutes(row.closestSeconds)).toBe(closestMin);
      expect(row.farthestAu.toFixed(3)).toBe(farthestAu);
      expect(test_read_minutes(row.farthestSeconds)).toBe(farthestMin);
      expect(row.swingRatio.toFixed(2)).toBe(swing);
    });
  });

  it('표의 최원 왕복 열이 편도의 정확히 두 배다', () => {
    for (const row of model_calculate_body_table()) {
      expect(row.roundTripFarthestSeconds).toBe(row.farthestSeconds * LEGS_ROUND_TRIP);
    }
  });

  it('표의 각 행이 `model_calculate_extremes`와 같은 값이다 — 두 벌이 아니다', () => {
    for (const row of model_calculate_body_table()) {
      const extremes = model_calculate_extremes(row.body.key);
      expect(row.closestSeconds).toBe(extremes.closestSeconds);
      expect(row.farthestSeconds).toBe(extremes.farthestSeconds);
      expect(row.swingRatio).toBe(extremes.swingRatio);
    }
  });
});

// ── 본문 블록 8의 손계산 ────────────────────────────────────

describe('손으로 따라가는 예제 — 화성', () => {
  it('합(θ = 180°)의 네 숫자가 본문과 같다', () => {
    const result = model_calculate_result('mars', THETA_MAX_DEG, true, 8);
    expect(result.distanceAu.toFixed(8)).toBe('2.52371295');
    expect((result.distanceMetres / 1e11).toFixed(4)).toBe('3.7754');
    expect(result.distanceMillionKm.toFixed(1)).toBe('377.5');
    expect(result.oneWaySeconds.toFixed(1)).toBe('1259.3');
    expect(test_read_minutes(result.oneWaySeconds)).toBe('20.99');
    expect(result.roundTripSeconds.toFixed(1)).toBe('2518.7');
    expect(test_read_minutes(result.roundTripSeconds)).toBe('41.98');
  });

  it('차(θ = 0°)의 네 숫자가 본문과 같다', () => {
    const result = model_calculate_result('mars', THETA_MIN_DEG, true, 8);
    expect(result.distanceAu.toFixed(8)).toBe('0.52370773');
    expect((result.distanceMetres / 1000).toPrecision(4)).toBe('7.835e+7');
    expect(result.oneWaySeconds.toFixed(1)).toBe('261.3');
    expect(test_read_minutes(result.oneWaySeconds, 3)).toBe('4.356');
    expect(test_read_minutes(result.roundTripSeconds)).toBe('8.71');
  });

  it('두 편도의 비가 흔들림 열과 같다 — 거리에서 다시 구해도 4.8189', () => {
    const far = model_calculate_result('mars', THETA_MAX_DEG, false, TURNS_MIN);
    const near = model_calculate_result('mars', THETA_MIN_DEG, false, TURNS_MIN);
    const fromDistances = far.oneWaySeconds / near.oneWaySeconds;
    expect(fromDistances.toFixed(4)).toBe('4.8189');
    expect(fromDistances).toBeCloseTo(far.swingRatio, 12);
    // 같은 비가 au·초·분 어느 단위에서도 같다. 사이에 있는 연산이 상수 나눗셈뿐이다.
    expect(far.distanceAu / near.distanceAu).toBeCloseTo(fromDistances, 12);
    expect(far.distanceMillionKm / near.distanceMillionKm).toBeCloseTo(fromDistances, 12);
  });

  it('여덟 턴이 합에서 5.60시간, 차에서 1.16시간이다', () => {
    const far = model_calculate_result('mars', THETA_MAX_DEG, true, 8);
    const near = model_calculate_result('mars', THETA_MIN_DEG, true, 8);
    expect((far.conversationSeconds / 3600).toFixed(2)).toBe('5.60');
    expect((far.conversationSeconds / SECONDS_PER_MINUTE).toFixed(1)).toBe('335.8');
    expect((near.conversationSeconds / 3600).toFixed(2)).toBe('1.16');
  });
});

// ── 왕복과 대화 ─────────────────────────────────────────────

describe('왕복과 대화', () => {
  it('왕복은 편도의 두 배이고, 토글은 그 둘 중 하나를 고를 뿐이다', () => {
    const oneWay = model_calculate_result('jupiter', 60, false, 3);
    const roundTrip = model_calculate_result('jupiter', 60, true, 3);
    expect(roundTrip.roundTripSeconds).toBe(oneWay.oneWaySeconds * LEGS_ROUND_TRIP);
    expect(oneWay.shownSeconds).toBe(oneWay.oneWaySeconds);
    expect(roundTrip.shownSeconds).toBe(oneWay.oneWaySeconds * LEGS_ROUND_TRIP);
    // 토글은 대화 길이를 바꾸지 않는다 — 한 턴은 언제나 왕복이다.
    expect(roundTrip.conversationSeconds).toBe(oneWay.conversationSeconds);
  });

  it('대화 시간이 곱셈이 아니라 누적으로 계산해도 같다', () => {
    for (const turns of [1, 2, 8, TURNS_MAX]) {
      const result = model_calculate_result('mars', 137, true, turns);
      expect(result.conversationSeconds).toBeCloseTo(
        reference_count_conversation_seconds(result.oneWaySeconds, turns),
        9,
      );
    }
  });
});

// ── 판정 ────────────────────────────────────────────────────

describe('판정', () => {
  it('임계값의 양쪽이 갈린다', () => {
    expect(model_calculate_verdict(SWING_EDGE_MIN - 0.001)).toBe(VERDICT_HOLD);
    expect(model_calculate_verdict(SWING_EDGE_MIN)).toBe(VERDICT_EDGE);
    expect(model_calculate_verdict(SWING_BREAK_MIN - 0.001)).toBe(VERDICT_EDGE);
    expect(model_calculate_verdict(SWING_BREAK_MIN)).toBe(VERDICT_BREAK);
  });

  it('여덟 천체의 판정이 흔들림 순서와 어긋나지 않는다', () => {
    const expected = {
      sun: VERDICT_HOLD,
      mercury: VERDICT_EDGE,
      venus: VERDICT_BREAK,
      mars: VERDICT_BREAK,
      jupiter: VERDICT_EDGE,
      saturn: VERDICT_EDGE,
      uranus: VERDICT_HOLD,
      neptune: VERDICT_HOLD,
    };
    for (const row of model_calculate_body_table()) {
      expect(row.verdict).toBe(expected[row.body.key]);
    }
  });

  it('태양의 흔들림은 정확히 1이다 — 띠가 아니라 점이다', () => {
    const sun = model_calculate_extremes('sun');
    expect(sun.swingRatio).toBe(1);
    expect(sun.closestSeconds).toBe(sun.farthestSeconds);
  });
});

// ── 가드 ────────────────────────────────────────────────────

describe('유효범위 밖에서는 조용히 숫자를 내지 않는다', () => {
  it('목록에 없는 천체는 throw', () => {
    expect(() => model_calculate_result('pluto', 0, false, 1)).toThrow();
    expect(model_check_parameters('pluto', 0, 1).ok).toBe(false);
    expect(() => model_calculate_extremes('pluto')).toThrow();
    expect(() => model_calculate_elliptic_band('pluto')).toThrow();
  });

  it('θ가 범위 밖이면 throw — 음수 θ의 코사인은 그럴듯한 거리를 낸다', () => {
    expect(() => model_calculate_result('mars', -30, false, 1)).toThrow();
    expect(() => model_calculate_result('mars', 181, false, 1)).toThrow();
    expect(() => model_calculate_result('mars', Number.NaN, false, 1)).toThrow();
    // 경계는 유효하다.
    expect(() => model_calculate_result('mars', THETA_MIN_DEG, false, TURNS_MIN)).not.toThrow();
    expect(() => model_calculate_result('mars', THETA_MAX_DEG, false, TURNS_MAX)).not.toThrow();
  });

  it('턴 수가 정수가 아니거나 범위 밖이면 throw', () => {
    expect(() => model_calculate_result('mars', 0, true, 0)).toThrow();
    expect(() => model_calculate_result('mars', 0, true, TURNS_MAX + 1)).toThrow();
    expect(() => model_calculate_result('mars', 0, true, 2.5)).toThrow();
  });

  it('검사 실패는 사유 문구를 단다', () => {
    expect(model_check_parameters('mars', 999, 1).message).toContain('θ');
    expect(model_check_parameters('mars', 0, 99).message).toContain('턴');
  });
});

// ── 클램프 ──────────────────────────────────────────────────

describe('클램프', () => {
  it('알 수 없는 천체 키는 첫 천체가 아니라 기본 천체로 돌아간다', () => {
    // 목록의 첫 항목은 태양이다. 기본값으로 돌아가지 않으면 여기서 걸린다.
    expect(BODY_KEYS[0]).not.toBe(BODY_DEFAULT_KEY);
    expect(model_clamp_body_key('pluto')).toBe(BODY_DEFAULT_KEY);
    expect(model_clamp_body_key(null)).toBe(BODY_DEFAULT_KEY);
    expect(model_clamp_body_key('venus')).toBe('venus');
  });

  it('θ와 턴 수는 눈금 위 정수로 맞는다', () => {
    expect(model_clamp_theta(-40)).toBe(THETA_MIN_DEG);
    expect(model_clamp_theta(400)).toBe(THETA_MAX_DEG);
    expect(model_clamp_theta(90.4)).toBe(90);
    expect(model_clamp_theta(Number.NaN)).toBe(THETA_MIN_DEG);
    expect(model_clamp_turns(0)).toBe(TURNS_MIN);
    expect(model_clamp_turns(99)).toBe(TURNS_MAX);
    expect(model_clamp_turns(3.6)).toBe(4);
  });

  it('클램프를 통과한 값은 검사도 통과한다 — 기본값이 자기 범위 안에 있다', () => {
    for (const raw of [-999, 0, 37.4, 180, 999]) {
      const check = model_check_parameters(
        model_clamp_body_key('mars'),
        model_clamp_theta(raw),
        model_clamp_turns(raw),
      );
      expect(check.ok).toBe(true);
    }
  });

  it('`model_read_body`는 없는 키에 null을 준다 — 조용히 기본값으로 바꾸지 않는다', () => {
    expect(model_read_body('pluto')).toBeNull();
    expect(model_read_body('mars').semiMajorAxisAu).toBe(1.52371034);
  });
});

// ── 곡선 ────────────────────────────────────────────────────

describe('θ 스윕', () => {
  it('점 개수가 슬라이더 눈금과 같고 양 끝이 극단값이다', () => {
    expect(SWEEP_POINT_COUNT).toBe(181);
    const points = model_calculate_sweep('mars');
    expect(points.length).toBe(SWEEP_POINT_COUNT);
    expect(points[0].thetaDegrees).toBe(THETA_MIN_DEG);
    expect(points[points.length - 1].thetaDegrees).toBe(THETA_MAX_DEG);

    const extremes = model_calculate_extremes('mars');
    expect(points[0].oneWaySeconds).toBeCloseTo(extremes.closestSeconds, 9);
    expect(points[points.length - 1].oneWaySeconds).toBeCloseTo(extremes.farthestSeconds, 9);
  });

  it('모든 점에서 왕복이 편도의 두 배다', () => {
    for (const point of model_calculate_sweep('venus')) {
      expect(point.roundTripSeconds).toBe(point.oneWaySeconds * LEGS_ROUND_TRIP);
    }
  });

  it('점이 둘 미만이거나 천체가 없으면 빈 배열 — 0으로 나누지 않는다', () => {
    expect(model_calculate_sweep('mars', 1)).toEqual([]);
    expect(model_calculate_sweep('mars', 0)).toEqual([]);
    expect(model_calculate_sweep('pluto')).toEqual([]);
  });

  it('곡선의 모든 점이 대조 경로와 일치한다', () => {
    for (const key of ['mercury', 'mars', 'neptune']) {
      const body = model_read_body(key);
      for (const point of model_calculate_sweep(key)) {
        expect(point.oneWaySeconds).toBeCloseTo(
          reference_calculate_delay_seconds(reference_calculate_chord_au(body.semiMajorAxisAu, point.thetaDegrees)),
          6,
        );
      }
    }
  });
});

// ── 이 모델 밖의 값 (블록 7) ────────────────────────────────

describe('타원 대조값 — 원궤도 근사가 양 끝에서 얼마나 좁은가', () => {
  it('화성의 3.03분과 22.31분이 본문과 같다', () => {
    const band = model_calculate_elliptic_band('mars');
    expect(band.closestAu.toFixed(4)).toBe('0.3647');
    expect(test_read_minutes(band.closestSeconds)).toBe('3.03');
    expect(band.farthestAu.toFixed(4)).toBe('2.6827');
    expect(test_read_minutes(band.farthestSeconds)).toBe('22.31');
  });

  it('여덟 천체 모두 대조 경로와 일치한다', () => {
    for (const body of BODIES) {
      const band = model_calculate_elliptic_band(body.key);
      const reference = reference_calculate_elliptic_au(body.semiMajorAxisAu, body.eccentricity);
      expect(band.closestAu).toBeCloseTo(reference.closestAu, 12);
      expect(band.farthestAu).toBeCloseTo(reference.farthestAu, 12);
    }
  });

  it('타원 띠가 원궤도 띠를 양쪽으로 넓힌다 — 좁히지 않는다', () => {
    for (const body of BODIES.filter((entry) => entry.eccentricity > 0)) {
      const circular = model_calculate_extremes(body.key);
      const band = model_calculate_elliptic_band(body.key);
      expect(band.closestAu).toBeLessThan(circular.closestAu);
      expect(band.farthestAu).toBeGreaterThan(circular.farthestAu);
    }
  });

  it('타원 값은 원궤도 결과에 섞이지 않는다 — 카드가 쓰는 값은 그대로다', () => {
    // 블록 7이 인용하는 3.03분이 카드로 새면 검수 포인트와 본문이 어긋난다.
    const result = model_calculate_result('mars', THETA_MIN_DEG, false, TURNS_MIN);
    expect(test_read_minutes(result.oneWaySeconds)).toBe('4.36');
  });
});

// ── 본문이 인용하는 중간값 (블록 9) ─────────────────────────

// ── 가장 가파른 각 (본문 "steepest at 90°" 오류 수정 근거) ──

/**
 * 독립 대조 경로: 닫힌 식(arccos)을 쓰지 않고, 거리 함수를 유한차분으로 직접
 * 미분해 |dd/dθ|가 가장 큰 격자점을 찾는다. 닫힌 식과 수치미분은 서로 다른
 * 연산(삼각함수의 극값 대수 vs. 기울기 스캔)이라 같은 모델을 두 번 부르는 것이 아니다.
 */
function reference_scan_steepest_theta_deg(semiMajorAxisAu, gridStepDeg = 0.001) {
  let bestTheta = null;
  let bestSlope = -Infinity;
  for (let theta = gridStepDeg; theta < THETA_MAX_DEG; theta += gridStepDeg) {
    const before = reference_calculate_chord_au(semiMajorAxisAu, theta - gridStepDeg);
    const after = reference_calculate_chord_au(semiMajorAxisAu, theta + gridStepDeg);
    const slope = Math.abs(after - before) / (2 * gridStepDeg);
    if (slope > bestSlope) {
      bestSlope = slope;
      bestTheta = theta;
    }
  }
  return bestTheta;
}

describe('가장 가파른 각 — 90°라는 직관을 대조 경로로 반박한다', () => {
  it('화성은 48.98°에서 가장 가파르다 — 닫힌 식이 손계산 값과 같다', () => {
    // arccos(1.00000261 / 1.52371034)를 손으로 짚은 값. 본문이 인용하는 숫자다.
    expect(model_calculate_steepest_theta_deg('mars').toFixed(2)).toBe('48.98');
  });

  it('닫힌 식과 유한차분 스캔이 0.05° 안에서 일치한다 — 화성·금성·해왕성', () => {
    for (const key of ['mars', 'venus', 'neptune']) {
      const body = model_read_body(key);
      const closedForm = model_calculate_steepest_theta_deg(key);
      const scanned = reference_scan_steepest_theta_deg(body.semiMajorAxisAu);
      expect(Math.abs(closedForm - scanned)).toBeLessThan(0.05);
    }
  });

  it('가장 가파른 각은 90°가 아니다 — 코사인이 그대로 가팔라진다는 직관을 뒤집는다', () => {
    for (const key of BODY_KEYS.filter((key) => key !== 'sun')) {
      expect(model_calculate_steepest_theta_deg(key)).not.toBeCloseTo(90, 0);
    }
  });

  it('반지름 비가 0에 가까워질수록(천체가 훨씬 멀수록) 90°로 다가간다', () => {
    // 지구 반지름을 대상 반지름에 비해 무시할 만큼 작게 두면(비 → 0)
    // cos θ* = min/max → 0, θ* → 90°. 해왕성(비 1/30)이 명왕성 궤도(비 1/40)보다
    // 더 90°에 가까워야 한다 — 비가 작아질수록 극한에 더 다가간다는 방향성 검사다.
    const farAu = EARTH_SEMI_MAJOR_AXIS_AU * 1000;
    const closedFormDeg = (Math.acos(EARTH_SEMI_MAJOR_AXIS_AU / farAu) * 180) / Math.PI;
    const neptuneDeg = model_calculate_steepest_theta_deg('neptune');
    expect(closedFormDeg).toBeGreaterThan(neptuneDeg);
    expect(closedFormDeg).toBeGreaterThan(89);
  });

  it('반지름 비가 1에 가까워질수록(두 궤도가 서로 가까울수록) 0°로 내려간다', () => {
    const nearEarthAu = EARTH_SEMI_MAJOR_AXIS_AU * 1.0001;
    const closedFormDeg = (Math.acos(EARTH_SEMI_MAJOR_AXIS_AU / nearEarthAu) * 180) / Math.PI;
    expect(closedFormDeg).toBeLessThan(1);
  });

  it('태양은 θ와 무관하게 거리가 같아 가파른 각이 정의되지 않는다 — throw', () => {
    expect(() => model_calculate_steepest_theta_deg('sun')).toThrow();
  });

  it('목록에 없는 천체는 throw', () => {
    expect(() => model_calculate_steepest_theta_deg('pluto')).toThrow();
  });
});

describe('타원 대조값의 중간 단계 — 본문이 그대로 적는 숫자들', () => {
  it('화성의 근일점·원일점과 지구 원일점이 본문의 자릿수와 같다', () => {
    const mars = model_read_body('mars');
    const marsPerihelionAu = mars.semiMajorAxisAu * (1 - mars.eccentricity);
    const marsAphelionAu = mars.semiMajorAxisAu * (1 + mars.eccentricity);
    const earthAphelionAu = EARTH_SEMI_MAJOR_AXIS_AU * (1 + EARTH_ECCENTRICITY);
    expect(marsPerihelionAu.toFixed(4)).toBe('1.3814');
    expect(marsAphelionAu.toFixed(4)).toBe('1.6660');
    expect(earthAphelionAu.toFixed(4)).toBe('1.0167');
    // 두 뺄셈·덧셈이 그대로 블록 9의 두 숫자가 된다.
    expect((marsPerihelionAu - earthAphelionAu).toFixed(4)).toBe('0.3647');
    expect((marsAphelionAu + earthAphelionAu).toFixed(4)).toBe('2.6827');
  });
});
