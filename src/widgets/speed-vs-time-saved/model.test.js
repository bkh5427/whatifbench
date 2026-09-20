/**
 * 속도 vs 절약 시간 — 모델 단위테스트
 *
 * 이 모델에는 계수도 시뮬레이션도 없다. **틀릴 수 있는 자리는 단위 환산 하나뿐이고,
 * 그래서 검증의 전부는 독립된 두 경로의 대조다.**
 *   ① m·m/s로 나눈 뒤 초를 분으로   (reference_calculate_saved_minutes_si)
 *   ② km·km/h로 나눈 뒤 시간을 분으로 (reference_calculate_saved_minutes_hours)
 * 두 경로는 이 파일 안에 따로 구현한다. 모델을 한 번 더 부르는 것은 검증이 아니다.
 *
 * 초안 본문이 인용하는 숫자는 전부 **표시 자릿수까지 리터럴로** 못박는다.
 */
import { describe, it, expect } from 'vitest';
import {
  SECONDS_PER_MINUTE,
  SECONDS_PER_HOUR,
  METRES_PER_KILOMETRE,
  METRES_PER_MILE,
  UNIT_KMH,
  UNIT_MPH,
  UNIT_DEFAULT,
  SPEED_UNITS,
  DISTANCE_LADDER,
  DISTANCE_INDEX_MAX,
  DISTANCE_DEFAULT_UNITS,
  DISTANCE_MIN_METRES,
  DISTANCE_MAX_METRES,
  SPEED_FROM_MIN_MS,
  SPEED_FROM_MAX_MS,
  SPEED_TO_MAX_MS,
  SPEED_GAP_MIN_MS,
  SPEED_FROM_DEFAULT_MS,
  SPEED_TO_DEFAULT_MS,
  DELAY_MAX_MINUTES,
  VERDICT_BREAK_MIN_SHARE,
  VERDICT_EDGE_MIN_SHARE,
  CURVE_POINT_COUNT,
  model_read_unit,
  model_calculate_speed_to_ms,
  model_calculate_speed_from_ms,
  model_calculate_distance_to_metres,
  model_calculate_speed_range,
  model_clamp_to_step,
  model_read_distance_index,
  model_clamp_distance_index,
  model_clamp_distance,
  model_clamp_speed_from,
  model_clamp_speed_to,
  model_clamp_delay_minutes,
  model_check_parameters,
  model_calculate_travel_seconds,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_curve,
  model_calculate_increase_table,
} from './model.js';

// ── 대조 경로 두 벌 ──────────────────────────────────────────

/**
 * 경로 ① — 미터와 m/s. 초안 6번 블록의 첫 계산을 그대로 옮긴 것이다.
 * 환산 계수를 여기서 **다시 적는다**. 모델의 상수를 import하면 대조가 아니다.
 */
function reference_calculate_saved_minutes_si(distanceKm, fromKmh, toKmh) {
  const metres = distanceKm * 1000;
  const fromMs = fromKmh / 3.6;
  const toMs = toKmh / 3.6;
  const savedSeconds = metres / fromMs - metres / toMs;
  return savedSeconds / 60;
}

/** 경로 ② — 킬로미터와 시간. 미터를 한 번도 건드리지 않는다. */
function reference_calculate_saved_minutes_hours(distanceKm, fromKmh, toKmh) {
  const savedHours = distanceKm / fromKmh - distanceKm / toKmh;
  return savedHours * 60;
}

/** 마일 경로 — 마일과 mph. 정의값 1 mile = 1 609.344 m를 여기서 다시 적는다. */
function reference_calculate_saved_minutes_miles(distanceMiles, fromMph, toMph) {
  const metres = distanceMiles * 1609.344;
  const fromMs = (fromMph * 1609.344) / 3600;
  const toMs = (toMph * 1609.344) / 3600;
  return (metres / fromMs - metres / toMs) / 60;
}

/** 모델의 결과를 분으로. 대조에 쓰는 얇은 껍데기다. */
function test_read_saved_minutes(distanceKm, fromKmh, toKmh, delayMinutes = 0) {
  const result = model_calculate_result(
    distanceKm * SPEED_UNITS[UNIT_KMH].metresPerDistance,
    fromKmh * SPEED_UNITS[UNIT_KMH].msPerSpeed,
    toKmh * SPEED_UNITS[UNIT_KMH].msPerSpeed,
    delayMinutes * SECONDS_PER_MINUTE,
  );
  return result.savedSeconds / SECONDS_PER_MINUTE;
}

/** 화면이 쓰는 것과 같은 자릿수 규칙. 리터럴 대조는 표시 자릿수에서 해야 뜻이 있다. */
function test_format_minutes(minutes) {
  if (minutes < 1) return minutes.toFixed(3);
  if (minutes < 10) return minutes.toFixed(2);
  return minutes.toFixed(1);
}

const PERCENT_SCALE = 100;
const test_format_percent = (share) => `${(share * PERCENT_SCALE).toFixed(1)}%`;

/** 결정적 격자. 난수를 쓰지 않는다 — 실패가 재현되어야 한다. */
function enum_build_sweep() {
  const cases = [];
  for (const distanceKm of DISTANCE_LADDER) {
    for (let fromKmh = 20; fromKmh <= 140; fromKmh += 5) {
      for (const gap of [5, 20, 45]) {
        const toKmh = fromKmh + gap;
        if (toKmh > 160) continue;
        cases.push({ distanceKm, fromKmh, toKmh });
      }
    }
  }
  return cases;
}

// ── ① 독립 경로 대조 ─────────────────────────────────────────

describe('독립 경로 대조 — 이 모델에서 틀릴 수 있는 것은 단위뿐이다', () => {
  it('m·m/s 경로와 km·km/h 경로가 초안의 대표 예제에서 일치한다', () => {
    // 초안 6번 블록: 10 km, 40 → 60.
    const si = reference_calculate_saved_minutes_si(10, 40, 60);
    const hours = reference_calculate_saved_minutes_hours(10, 40, 60);
    expect(si).toBeCloseTo(hours, 12);
    expect(test_read_saved_minutes(10, 40, 60)).toBeCloseTo(si, 12);
    expect(test_format_minutes(si)).toBe('5.00');
  });

  it('격자 전체에서 세 경로가 갈리지 않는다', () => {
    const cases = enum_build_sweep();
    // 격자가 비면 이 테스트는 아무것도 지키지 않는다.
    expect(cases.length).toBeGreaterThan(500);
    for (const { distanceKm, fromKmh, toKmh } of cases) {
      const model = test_read_saved_minutes(distanceKm, fromKmh, toKmh);
      expect(model).toBeCloseTo(reference_calculate_saved_minutes_si(distanceKm, fromKmh, toKmh), 9);
      expect(model).toBeCloseTo(reference_calculate_saved_minutes_hours(distanceKm, fromKmh, toKmh), 9);
    }
  });

  it('마일·mph 경로도 같은 값을 낸다 — 표시 단위를 바꿔도 물리는 그대로다', () => {
    for (const [distanceMiles, fromMph, toMph] of [[5, 30, 40], [200, 65, 75], [1, 15, 20]]) {
      const model = model_calculate_result(
        model_calculate_distance_to_metres(distanceMiles, UNIT_MPH),
        model_calculate_speed_to_ms(fromMph, UNIT_MPH),
        model_calculate_speed_to_ms(toMph, UNIT_MPH),
        0,
      ).savedSeconds / SECONDS_PER_MINUTE;
      expect(model).toBeCloseTo(reference_calculate_saved_minutes_miles(distanceMiles, fromMph, toMph), 9);
    }
  });

  it('같은 물리 상황을 두 단위로 넣으면 같은 초가 나온다', () => {
    // 10 마일 = 16.09344 km, 60 mph = 96.5606 km/h. 단위는 표시일 뿐이다.
    const miles = model_calculate_result(
      model_calculate_distance_to_metres(10, UNIT_MPH),
      model_calculate_speed_to_ms(60, UNIT_MPH),
      model_calculate_speed_to_ms(70, UNIT_MPH),
      0,
    );
    const metric = model_calculate_result(
      miles.distanceMetres,
      miles.speedFromMs,
      miles.speedToMs,
      0,
    );
    expect(metric.savedSeconds).toBe(miles.savedSeconds);
  });
});

// ── ② 환산 계수가 정의값 그대로인가 (뮤테이션 표적) ──────────

describe('환산 계수 — 반올림하면 네 번째 자리가 틀어진다', () => {
  it('1 km/h는 정확히 1/3.6 m/s다', () => {
    expect(model_calculate_speed_to_ms(3.6, UNIT_KMH)).toBe(1);
    expect(model_calculate_speed_to_ms(40, UNIT_KMH)).toBeCloseTo(11.1111, 4);
    expect(model_calculate_speed_to_ms(60, UNIT_KMH)).toBeCloseTo(16.6667, 4);
  });

  it('1 mile은 정확히 1 609.344 m다 — 1609으로 반올림하면 이 값이 깨진다', () => {
    expect(METRES_PER_MILE).toBe(1609.344);
    // 60 mph = 26.8224 m/s. 1609을 쓰면 26.81667이 되어 넷째 자리가 달라진다.
    expect(model_calculate_speed_to_ms(60, UNIT_MPH)).toBe(26.8224);
    expect(model_calculate_distance_to_metres(1, UNIT_MPH)).toBe(1609.344);
  });

  it('시간 상수가 SI 정의 그대로다', () => {
    expect(SECONDS_PER_MINUTE).toBe(60);
    expect(SECONDS_PER_HOUR).toBe(3600);
    expect(METRES_PER_KILOMETRE).toBe(1000);
  });

  it('환산은 왕복해도 값을 잃지 않는다', () => {
    for (const unitKey of [UNIT_KMH, UNIT_MPH]) {
      for (const value of [15, 40, 88.5, 137]) {
        expect(model_calculate_speed_from_ms(model_calculate_speed_to_ms(value, unitKey), unitKey))
          .toBeCloseTo(value, 10);
      }
    }
  });

  it('모르는 단위 키는 조용히 기본 단위로 떨어진다', () => {
    expect(model_read_unit('furlongs-per-fortnight').key).toBe(UNIT_DEFAULT);
    expect(model_read_unit(undefined).key).toBe(UNIT_DEFAULT);
  });
});

// ── ③ 초안 본문이 인용하는 숫자 ──────────────────────────────

describe('초안이 인용하는 숫자를 표시 자릿수까지', () => {
  it('블록 4의 여덟 줄이 그대로 나온다 (+20 km/h, 10 km)', () => {
    const rows = model_calculate_increase_table(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH);
    const printed = rows.map((row) => [
      `${row.startUnits} → ${row.toUnits}`,
      test_format_minutes(row.result.savedSeconds / SECONDS_PER_MINUTE),
    ]);
    expect(printed).toEqual([
      ['30 → 50', '8.00'],
      ['40 → 60', '5.00'],
      ['50 → 70', '3.43'],
      ['60 → 80', '2.50'],
      ['70 → 90', '1.90'],
      ['80 → 100', '1.50'],
      ['90 → 110', '1.21'],
      ['100 → 120', '1.00'],
    ]);
  });

  it('첫 줄과 마지막 줄의 차가 여덟 배다 — 같은 +20이 같은 +20이 아니다', () => {
    const rows = model_calculate_increase_table(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH);
    const first = rows[0].result.savedSeconds;
    const last = rows[rows.length - 1].result.savedSeconds;
    expect(first / last).toBeCloseTo(8, 6);
    // 열이 직선이 아니다: 첫 두 줄의 차 3.00분, 마지막 두 줄의 차 0.21분.
    const gapTop = (rows[0].result.savedSeconds - rows[1].result.savedSeconds) / SECONDS_PER_MINUTE;
    const gapBottom = (rows[6].result.savedSeconds - rows[7].result.savedSeconds) / SECONDS_PER_MINUTE;
    expect(gapTop.toFixed(2)).toBe('3.00');
    expect(gapBottom.toFixed(2)).toBe('0.21');
  });

  it('정확히 2.00분이 되는 출발 속도는 68.1 km/h다 (v₁² + 20v₁ = 6000의 양근)', () => {
    // 브리프의 "시내 10 km에서 2분"이 재현되는 유일한 자리. 초안 머리말의 확인 항목이다.
    // 10 · 20 / (v₁(v₁+20)) = 2/60 시간 → v₁² + 20v₁ = 6000.
    const root = (-20 + Math.sqrt(20 * 20 + 4 * 6000)) / 2;
    expect(root.toFixed(1)).toBe('68.1');
    expect(test_format_minutes(test_read_saved_minutes(10, 68.1, 68.1 + 20))).toBe('2.00');
    // 시내에서 자연스러운 출발 속도(40)에서는 5.00분이지 2분이 아니다.
    expect(test_format_minutes(test_read_saved_minutes(10, 40, 60))).toBe('5.00');
  });

  it('블록 6의 총 소요시간과 비율', () => {
    const plain = model_calculate_result(
      10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0,
    );
    expect(test_format_minutes(plain.movingFromSeconds / SECONDS_PER_MINUTE)).toBe('15.0');
    expect(test_format_minutes(plain.movingToSeconds / SECONDS_PER_MINUTE)).toBe('10.0');
    expect(test_format_percent(plain.savedShare)).toBe('33.3%');

    const delayed = model_calculate_result(
      10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 6 * SECONDS_PER_MINUTE,
    );
    expect(test_format_minutes(delayed.totalFromSeconds / SECONDS_PER_MINUTE)).toBe('21.0');
    expect(test_format_minutes(delayed.totalToSeconds / SECONDS_PER_MINUTE)).toBe('16.0');
    expect(test_format_percent(delayed.savedShare)).toBe('23.8%');
  });

  it('100 km에서 100 → 120은 600초다', () => {
    expect(test_read_saved_minutes(100, 100, 120) * SECONDS_PER_MINUTE).toBeCloseTo(600, 9);
  });

  it('천장은 원래 트립의 이동 시간이고, 40 km/h·10 km에서 15.0분이다', () => {
    const result = model_calculate_result(
      10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0,
    );
    expect(test_format_minutes(result.ceilingSeconds / SECONDS_PER_MINUTE)).toBe('15.0');
    // 5.00분은 그 천장의 정확히 3분의 1이다.
    expect(result.ceilingShare).toBeCloseTo(1 / 3, 12);
  });
});

describe('리드 문단의 "다이얼 양 끝" — 표의 여덟 줄이 아니라 슬라이더 자체의 min·max', () => {
  it('20 → 40 km/h는 정확히 15분, 140 → 160 km/h는 15/28분(≈0.536분)이다', () => {
    // 초안이 "다이얼 양 끝에서 8분과 1분"이라 적었던 것은 표(30~100 km/h)의
    // 양 끝이지 슬라이더(다이얼) 자체의 양 끝이 아니었다. 진짜 양 끝은 이것이다.
    const range = model_calculate_speed_range(UNIT_KMH);
    expect(range.fromMin).toBe(20);
    expect(range.fromMax).toBe(140);
    expect(range.toMax).toBe(160);

    const slow = test_read_saved_minutes(10, range.fromMin, range.fromMin + 20);
    const fast = test_read_saved_minutes(10, range.fromMax, Math.min(range.fromMax + 20, range.toMax));

    // 대조 경로: 분수를 손으로 다시 적는다.
    // 10/20 − 10/40 = 1/4 시간 = 15분.
    expect(slow).toBeCloseTo(15, 9);
    // 10/140 − 10/160 = 1/112 시간 = 15/28분.
    expect(fast).toBeCloseTo(15 / 28, 9);
    expect(test_format_minutes(slow)).toBe('15.0');
    expect(test_format_minutes(fast)).toBe('0.536');
  });
});

// ── ④ 고정 지연이 하는 일 (그리고 하지 않는 일) ──────────────

describe('고정 지연 — 뺄셈에서 사라지고 분모에만 남는다', () => {
  it('Δt는 지연에 전혀 의존하지 않는다', () => {
    const base = test_read_saved_minutes(10, 40, 60, 0);
    for (let minutes = 0; minutes <= DELAY_MAX_MINUTES; minutes += 1) {
      expect(test_read_saved_minutes(10, 40, 60, minutes)).toBe(base);
    }
  });

  it('비율은 지연이 커질수록 단조 감소한다', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let minutes = 0; minutes <= DELAY_MAX_MINUTES; minutes += 1) {
      const share = model_calculate_result(
        10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, minutes * SECONDS_PER_MINUTE,
      ).savedShare;
      expect(share).toBeLessThan(previous);
      previous = share;
    }
    expect(previous).toBeGreaterThan(0);
  });

  it('두 시나리오의 총 시간 차는 지연과 무관하게 같다', () => {
    for (const minutes of [0, 3, 6, 30]) {
      const result = model_calculate_result(
        10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, minutes * SECONDS_PER_MINUTE,
      );
      expect(result.totalFromSeconds - result.totalToSeconds).toBeCloseTo(result.savedSeconds, 9);
    }
  });
});

// ── ⑤ 유효범위 검사 (뮤테이션 표적) ──────────────────────────

describe('유효범위 밖에서 조용히 숫자를 뱉지 않는다', () => {
  it('v₂ ≤ v₁이면 throw한다 — 음수 절약은 그럴듯해 보인다', () => {
    const distance = 10 * METRES_PER_KILOMETRE;
    expect(() => model_calculate_result(distance, SPEED_TO_DEFAULT_MS, SPEED_FROM_DEFAULT_MS, 0)).toThrow();
    expect(() => model_calculate_result(distance, SPEED_FROM_DEFAULT_MS, SPEED_FROM_DEFAULT_MS, 0)).toThrow();
    // 검사를 지우면 이 조합이 음수를 낸다. 그것이 이 테스트가 지키는 것이다.
    expect(distance / SPEED_TO_DEFAULT_MS - distance / SPEED_FROM_DEFAULT_MS).toBeLessThan(0);
  });

  it('거리·속도·지연이 범위를 벗어나면 throw한다', () => {
    const ok = [10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0];
    expect(() => model_calculate_result(0, ok[1], ok[2], 0)).toThrow();
    expect(() => model_calculate_result(DISTANCE_MAX_METRES * 2, ok[1], ok[2], 0)).toThrow();
    expect(() => model_calculate_result(ok[0], SPEED_FROM_MIN_MS / 2, ok[2], 0)).toThrow();
    expect(() => model_calculate_result(ok[0], SPEED_FROM_MAX_MS * 2, ok[2], 0)).toThrow();
    expect(() => model_calculate_result(ok[0], ok[1], SPEED_TO_MAX_MS * 2, 0)).toThrow();
    expect(() => model_calculate_result(ok[0], ok[1], ok[2], -1)).toThrow();
    expect(() => model_calculate_result(ok[0], ok[1], ok[2], (DELAY_MAX_MINUTES + 1) * SECONDS_PER_MINUTE)).toThrow();
    expect(() => model_calculate_result(Number.NaN, ok[1], ok[2], 0)).toThrow();
  });

  it('경계값은 통과한다 — 기본값과 슬라이더 끝이 자기 검사를 못 넘으면 안 된다', () => {
    expect(model_check_parameters(DISTANCE_MIN_METRES, SPEED_FROM_MIN_MS, SPEED_TO_MAX_MS, 0).ok).toBe(true);
    expect(model_check_parameters(DISTANCE_MAX_METRES, SPEED_FROM_MAX_MS, SPEED_TO_MAX_MS,
      DELAY_MAX_MINUTES * SECONDS_PER_MINUTE).ok).toBe(true);
    expect(model_check_parameters(
      DISTANCE_DEFAULT_UNITS * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0,
    ).ok).toBe(true);
  });

  it('실패한 검사는 사유 문구를 들고 온다', () => {
    const bad = model_check_parameters(10 * METRES_PER_KILOMETRE, SPEED_TO_DEFAULT_MS, SPEED_FROM_DEFAULT_MS, 0);
    expect(bad.ok).toBe(false);
    expect(bad.message.length).toBeGreaterThan(0);
  });
});

// ── ⑥ 슬라이더 범위·클램프 ───────────────────────────────────

describe('슬라이더 범위와 클램프', () => {
  it('km/h 눈금은 초안이 적은 그대로다', () => {
    expect(model_calculate_speed_range(UNIT_KMH)).toEqual({ step: 5, fromMin: 20, fromMax: 140, toMax: 160, gap: 5 });
  });

  it('mph 눈금은 SI 범위를 안쪽으로 자른 값이다', () => {
    const range = model_calculate_speed_range(UNIT_MPH);
    expect(range).toEqual({ step: 5, fromMin: 15, fromMax: 85, toMax: 95, gap: 5 });
    // 안쪽이어야 한다 — 밖으로 맞추면 슬라이더가 모델이 거부하는 값을 가리킨다.
    expect(model_calculate_speed_to_ms(range.fromMin, UNIT_MPH)).toBeGreaterThanOrEqual(SPEED_FROM_MIN_MS);
    expect(model_calculate_speed_to_ms(range.fromMax, UNIT_MPH)).toBeLessThanOrEqual(SPEED_FROM_MAX_MS);
    expect(model_calculate_speed_to_ms(range.toMax, UNIT_MPH)).toBeLessThanOrEqual(SPEED_TO_MAX_MS);
  });

  it('부동소수 여유가 없으면 슬라이더 끝이 한 칸 줄어든다', () => {
    // 125 km/h를 m/s로 갔다 되돌리면 124.999999999999 99다. 실제로 그렇다:
    const roundTrip = (125 * SPEED_UNITS[UNIT_KMH].msPerSpeed) / SPEED_UNITS[UNIT_KMH].msPerSpeed;
    expect(roundTrip).not.toBe(125);
    expect(Math.floor(roundTrip / 5) * 5).toBe(120);
    // 여유를 둔 모델의 맞춤은 125를 지킨다. STEP_EPSILON을 지우면 이 줄이 깨진다.
    expect(model_clamp_to_step(roundTrip, 5, -1)).toBe(125);
    expect(model_clamp_to_step(roundTrip, 5, 1)).toBe(125);
    // 진짜 눈금 사이의 값은 그대로 안쪽으로 간다.
    expect(model_clamp_to_step(123, 5, -1)).toBe(120);
    expect(model_clamp_to_step(123, 5, 1)).toBe(125);
  });

  it('거리 사다리는 1-2-3-5-7 계열의 둥근 값만 담는다', () => {
    expect(DISTANCE_LADDER).toEqual([1, 2, 3, 5, 7, 10, 20, 30, 50, 70, 100, 200, 300, 500]);
    expect(DISTANCE_LADDER).toContain(DISTANCE_DEFAULT_UNITS);
    for (const value of DISTANCE_LADDER) expect(Number.isInteger(value)).toBe(true);
    // 칸 사이의 배수가 2.5를 넘지 않는다 — 손잡이 한 칸이 너무 크게 뛰지 않게.
    for (let index = 1; index < DISTANCE_LADDER.length; index += 1) {
      expect(DISTANCE_LADDER[index] / DISTANCE_LADDER[index - 1]).toBeLessThanOrEqual(2.5);
    }
  });

  it('거리는 로그 거리로 가장 가까운 칸에 붙는다', () => {
    // 250은 200(비 1.25)보다 300(비 1.2)에 가깝다. 선형 차로 고르면 200이 된다.
    expect(DISTANCE_LADDER[model_read_distance_index(250 * METRES_PER_KILOMETRE, UNIT_KMH)]).toBe(300);
    expect(Math.abs(250 - 200)).toBe(Math.abs(250 - 300));
    expect(DISTANCE_LADDER[model_read_distance_index(9 * METRES_PER_KILOMETRE, UNIT_KMH)]).toBe(10);
    expect(DISTANCE_LADDER[model_read_distance_index(1e9, UNIT_KMH)]).toBe(500);
    expect(DISTANCE_LADDER[model_read_distance_index(1, UNIT_KMH)]).toBe(1);
  });

  it('사다리 인덱스는 정수로 잘린다', () => {
    expect(model_clamp_distance_index(-4)).toBe(0);
    expect(model_clamp_distance_index(999)).toBe(DISTANCE_INDEX_MAX);
    expect(model_clamp_distance_index(3.4)).toBe(3);
    expect(model_clamp_distance_index(Number.NaN)).toBe(0);
  });

  it('거리 스냅은 표시 단위를 따라간다 — 10 km는 mph 화면에서 다른 칸이다', () => {
    const metric = model_clamp_distance(10 * METRES_PER_KILOMETRE, UNIT_KMH);
    expect(metric).toBe(10 * METRES_PER_KILOMETRE);
    const imperial = model_clamp_distance(10 * METRES_PER_KILOMETRE, UNIT_MPH);
    expect(imperial).toBeCloseTo(7 * METRES_PER_MILE, 9);
  });

  it('v₂ 클램프는 v₁에 종속이다', () => {
    expect(model_clamp_speed_to(SPEED_FROM_DEFAULT_MS, SPEED_FROM_DEFAULT_MS))
      .toBeCloseTo(SPEED_FROM_DEFAULT_MS + SPEED_GAP_MIN_MS, 12);
    expect(model_clamp_speed_to(SPEED_TO_MAX_MS * 2, SPEED_FROM_DEFAULT_MS)).toBe(SPEED_TO_MAX_MS);
    // v₁을 최댓값까지 밀어도 v₂가 갈 자리가 남아야 한다.
    expect(model_clamp_speed_to(0, SPEED_FROM_MAX_MS)).toBeLessThanOrEqual(SPEED_TO_MAX_MS);
    expect(model_clamp_speed_to(0, SPEED_FROM_MAX_MS)).toBeGreaterThan(SPEED_FROM_MAX_MS);
  });

  it('v₁ 클램프와 지연 클램프', () => {
    expect(model_clamp_speed_from(0)).toBe(SPEED_FROM_MIN_MS);
    expect(model_clamp_speed_from(1e6)).toBe(SPEED_FROM_MAX_MS);
    expect(model_clamp_delay_minutes(-5)).toBe(0);
    expect(model_clamp_delay_minutes(99)).toBe(DELAY_MAX_MINUTES);
    expect(model_clamp_delay_minutes(6.4)).toBe(6);
  });

  it('클램프를 거친 조합은 언제나 검사를 통과한다', () => {
    for (const index of [0, 5, DISTANCE_INDEX_MAX]) {
      for (const unitKey of [UNIT_KMH, UNIT_MPH]) {
        const distance = model_clamp_distance(
          DISTANCE_LADDER[index] * model_read_unit(unitKey).metresPerDistance, unitKey,
        );
        for (const fromMs of [SPEED_FROM_MIN_MS, SPEED_FROM_DEFAULT_MS, SPEED_FROM_MAX_MS]) {
          const from = model_clamp_speed_from(fromMs);
          const to = model_clamp_speed_to(0, from);
          expect(model_check_parameters(distance, from, to, 0).ok).toBe(true);
        }
      }
    }
  });
});

// ── ⑦ 곡선과 천장 ────────────────────────────────────────────

describe('절약 곡선', () => {
  it('v₂ = v₁에서 0으로 출발해 단조 증가한다', () => {
    const points = model_calculate_curve(10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, UNIT_KMH);
    expect(points.length).toBe(CURVE_POINT_COUNT);
    expect(points[0].savedSeconds).toBeCloseTo(0, 12);
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index].savedSeconds).toBeGreaterThan(points[index - 1].savedSeconds);
      expect(points[index].speedToMs).toBeGreaterThan(points[index - 1].speedToMs);
    }
  });

  it('곡선은 천장에 닿지 않는다 — 그리고 그 천장은 d/v₁이다', () => {
    for (const fromKmh of [20, 40, 100, 140]) {
      const fromMs = fromKmh * SPEED_UNITS[UNIT_KMH].msPerSpeed;
      const distance = 10 * METRES_PER_KILOMETRE;
      const ceiling = distance / fromMs;
      const points = model_calculate_curve(distance, fromMs, UNIT_KMH);
      for (const point of points) expect(point.savedSeconds).toBeLessThan(ceiling);
      expect(points[points.length - 1].savedSeconds / ceiling).toBeLessThan(1);
    }
  });

  it('곡선은 아래로 볼록하다 — 같은 +5가 위로 갈수록 덜 준다', () => {
    const points = model_calculate_curve(10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, UNIT_KMH);
    for (let index = 2; index < points.length; index += 1) {
      const first = points[index - 1].savedSeconds - points[index - 2].savedSeconds;
      const second = points[index].savedSeconds - points[index - 1].savedSeconds;
      expect(second).toBeLessThan(first);
    }
  });

  it('그릴 수 없는 입력에서는 빈 배열을 준다 (0으로 나누지 않는다)', () => {
    expect(model_calculate_curve(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH)).toEqual([]);
    expect(model_calculate_curve(0, SPEED_FROM_DEFAULT_MS, UNIT_KMH)).toEqual([]);
    expect(model_calculate_curve(10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, UNIT_KMH, 1)).toEqual([]);
    expect(model_calculate_curve(10 * METRES_PER_KILOMETRE, SPEED_TO_MAX_MS, UNIT_KMH)).toEqual([]);
  });

  it('곡선의 마지막 점이 슬라이더 상한과 같다', () => {
    for (const unitKey of [UNIT_KMH, UNIT_MPH]) {
      const points = model_calculate_curve(10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, unitKey);
      expect(points[points.length - 1].speedToUnits).toBeCloseTo(model_calculate_speed_range(unitKey).toMax, 9);
    }
  });

  it('곡선 위의 점이 모델 전체 함수와 같은 값을 낸다 — 계산 경로는 하나다', () => {
    const distance = 30 * METRES_PER_KILOMETRE;
    const points = model_calculate_curve(distance, SPEED_FROM_DEFAULT_MS, UNIT_KMH);
    for (const index of [1, 40, 179]) {
      const point = points[index];
      const result = model_calculate_result(distance, SPEED_FROM_DEFAULT_MS, point.speedToMs, 0);
      expect(point.savedSeconds).toBeCloseTo(result.savedSeconds, 12);
    }
  });
});

// ── ⑧ 판정 ──────────────────────────────────────────────────

describe('판정', () => {
  it('세 구간이 임계값에서 갈린다', () => {
    expect(model_calculate_verdict(VERDICT_BREAK_MIN_SHARE)).toBe('break');
    expect(model_calculate_verdict(VERDICT_BREAK_MIN_SHARE - 1e-9)).toBe('edge');
    expect(model_calculate_verdict(VERDICT_EDGE_MIN_SHARE)).toBe('edge');
    expect(model_calculate_verdict(VERDICT_EDGE_MIN_SHARE - 1e-9)).toBe('hold');
    expect(model_calculate_verdict(0)).toBe('hold');
  });

  it('지연을 밀어 넣는 것만으로 판정이 내려간다 — 절약 분은 그대로인데도', () => {
    const distance = 10 * METRES_PER_KILOMETRE;
    const plain = model_calculate_result(distance, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0);
    const delayed = model_calculate_result(
      distance, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, DELAY_MAX_MINUTES * SECONDS_PER_MINUTE,
    );
    expect(delayed.savedSeconds).toBe(plain.savedSeconds);
    expect(model_calculate_verdict(plain.savedShare)).toBe('break');
    expect(model_calculate_verdict(delayed.savedShare)).toBe('edge');
  });
});

// ── ⑨ 민감도 표 ──────────────────────────────────────────────

describe('민감도 표', () => {
  it('표의 모든 줄이 유효범위 안이다', () => {
    for (const unitKey of [UNIT_KMH, UNIT_MPH]) {
      const unit = model_read_unit(unitKey);
      const rows = model_calculate_increase_table(10 * unit.metresPerDistance, 0, unitKey);
      expect(rows.length).toBe(unit.tableStarts.length);
      const range = model_calculate_speed_range(unitKey);
      for (const row of rows) {
        expect(row.startUnits).toBeGreaterThanOrEqual(range.fromMin);
        expect(row.startUnits).toBeLessThanOrEqual(range.fromMax);
        expect(row.toUnits).toBeLessThanOrEqual(range.toMax);
        expect(row.result.savedSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('표의 값이 거리에 비례한다 — 거리는 곱해지기만 한다', () => {
    const near = model_calculate_increase_table(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH);
    const far = model_calculate_increase_table(100 * METRES_PER_KILOMETRE, 0, UNIT_KMH);
    for (let index = 0; index < near.length; index += 1) {
      expect(far[index].result.savedSeconds / near[index].result.savedSeconds).toBeCloseTo(10, 9);
    }
  });

  it('표의 비율은 지연이 있으면 내려가지만 분은 그대로다', () => {
    const plain = model_calculate_increase_table(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH);
    const delayed = model_calculate_increase_table(
      10 * METRES_PER_KILOMETRE, 6 * SECONDS_PER_MINUTE, UNIT_KMH,
    );
    for (let index = 0; index < plain.length; index += 1) {
      expect(delayed[index].result.savedSeconds).toBe(plain[index].result.savedSeconds);
      expect(delayed[index].result.savedShare).toBeLessThan(plain[index].result.savedShare);
    }
  });

  it('거리가 짧으면 mph 표도 전부 유효하다', () => {
    const rows = model_calculate_increase_table(1 * METRES_PER_MILE, 0, UNIT_MPH);
    expect(rows.length).toBe(SPEED_UNITS[UNIT_MPH].tableStarts.length);
  });
});

// ── ⑩ 나눗셈 한 번 ───────────────────────────────────────────

describe('이동 시간', () => {
  it('t = d / v 그대로다', () => {
    expect(model_calculate_travel_seconds(1000, 10)).toBe(100);
    expect(model_calculate_travel_seconds(10000, 40 / 3.6)).toBeCloseTo(900, 9);
    expect(model_calculate_travel_seconds(10000, 60 / 3.6)).toBeCloseTo(600, 9);
  });
});
