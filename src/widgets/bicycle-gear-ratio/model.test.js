/**
 * 자전거 기어비 — 모델 테스트
 *
 * 이 도구의 유일한 산술 위험은 단위 섞기다. 그래서 검증의 중심은
 * **독립 경로 대조**다 — 같은 함수를 한 번 더 부르지 않고, 여기에 두 번째
 * 계산 경로를 직접 적어 맞춘다. 두 경로가 일치할 때만 신뢰한다.
 *
 *   ① 밀리미터로 전부 계산한 뒤 마지막에 25.4로 나눈다
 *   ② 지름을 먼저 인치로 바꾼 뒤 계산한다
 *   ③ 속도: 발전량(m/rev) × 케이던스
 *   ④ 속도: 크랭크 각속도 → 휠 회전수 → 둘레
 *
 * 중복 판정은 정의에 따라 값이 갈린다. **어느 하나를 대표값으로 삼지 않는다** —
 * 세 정의를 각각 못박는다.
 */
import { describe, it, expect } from 'vitest';
import {
  MM_PER_INCH,
  MM_PER_METRE,
  METRES_PER_KM,
  MINUTES_PER_HOUR,
  PERCENT_SCALE,
  GEAR_CHAINRING_MIN,
  GEAR_CHAINRING_MAX,
  GEAR_CHAINRING_NONE,
  GEAR_CHAINRING_DEFAULT_LARGE,
  GEAR_CHAINRING_DEFAULT_SMALL,
  GEAR_SPROCKET_MIN,
  GEAR_SPROCKET_MAX,
  GEAR_SPROCKET_COUNT_MAX,
  GEAR_CASSETTE_DEFAULT,
  GEAR_CASSETTE_PRESETS,
  GEAR_BIKE_PRESETS,
  GEAR_TYRE_WIDTH_DEFAULT,
  GEAR_TYRE_WIDTH_MIN,
  GEAR_TYRE_WIDTH_MAX,
  GEAR_BEAD_SEAT_CHOICES,
  GEAR_BEAD_SEAT_DEFAULT,
  GEAR_CRANK_MIN,
  GEAR_CRANK_MAX,
  GEAR_CRANK_STEP,
  GEAR_CRANK_DEFAULT,
  GEAR_CADENCE_MIN,
  GEAR_CADENCE_MAX,
  GEAR_CADENCE_DEFAULT,
  GEAR_TOLERANCE_MIN,
  GEAR_TOLERANCE_MAX,
  GEAR_TOLERANCE_DEFAULT,
  GEAR_VERDICT_EDGE_MIN_SHARE,
  GEAR_VERDICT_BREAK_MIN_SHARE,
  model_clamp_chainring,
  model_clamp_chainring_optional,
  model_clamp_tyre_width,
  model_clamp_bead_seat,
  model_clamp_crank,
  model_clamp_cadence,
  model_clamp_tolerance,
  model_read_cassette,
  model_read_cassette_or_default,
  model_read_chainring_slot,
  model_format_cassette,
  model_calculate_wheel_diameter,
  model_calculate_wheel_circumference,
  model_calculate_speed,
  model_check_parameters,
  model_calculate_combinations,
  model_calculate_relative_gap,
  model_check_duplicate_pair,
  model_pick_removable_duplicates,
  model_pick_paired_duplicates,
  model_calculate_overlap_share,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_bike_preset_state,
  model_pick_matching_bike_preset,
  model_pick_matching_cassette_preset,
} from './model.js';

// ── 픽스처 ──────────────────────────────────────────────────

/** 본문의 모든 수치가 나오는 설정. 초안 머리말이 못박은 자리다. */
function fixture_build_state(overrides = {}) {
  return {
    chainrings: [GEAR_CHAINRING_DEFAULT_LARGE, GEAR_CHAINRING_DEFAULT_SMALL],
    cassette: GEAR_CASSETTE_DEFAULT.slice(),
    tyreWidthMm: GEAR_TYRE_WIDTH_DEFAULT,
    beadSeatMm: GEAR_BEAD_SEAT_DEFAULT,
    crankMm: GEAR_CRANK_DEFAULT,
    cadenceRpm: GEAR_CADENCE_DEFAULT,
    tolerancePercent: GEAR_TOLERANCE_DEFAULT,
    ...overrides,
  };
}

function fixture_read_combination(result, chainring, sprocket) {
  return result.combinations.find(
    (combination) => combination.chainring === chainring && combination.sprocket === sprocket,
  );
}

// ── 독립 경로 (대조 전용) ───────────────────────────────────

/** ① 밀리미터로 전부 계산한 뒤 마지막에 인치로. */
function reference_calculate_gear_inches_via_mm(chainring, sprocket, beadSeatMm, widthMm) {
  const diameterMm = beadSeatMm + widthMm + widthMm;
  const drivenDiameterMm = (diameterMm * chainring) / sprocket;
  return drivenDiameterMm / MM_PER_INCH;
}

/** ② 지름을 먼저 인치로 바꾼 뒤 계산. 같은 값이 나와야 한다. */
function reference_calculate_gear_inches_via_inch(chainring, sprocket, beadSeatMm, widthMm) {
  const diameterInch = beadSeatMm / MM_PER_INCH + (2 * widthMm) / MM_PER_INCH;
  return diameterInch * (chainring / sprocket);
}

/** ③ 발전량(m/rev) × 케이던스 → km/h. */
function reference_calculate_speed_via_development(chainring, sprocket, beadSeatMm, widthMm, cadenceRpm) {
  const circumferenceM = (Math.PI * (beadSeatMm + 2 * widthMm)) / MM_PER_METRE;
  const metresPerCrankTurn = circumferenceM * (chainring / sprocket);
  const metresPerMinute = metresPerCrankTurn * cadenceRpm;
  return (metresPerMinute * MINUTES_PER_HOUR) / METRES_PER_KM;
}

/**
 * ④ 각속도 경로. 크랭크가 분당 N바퀴 → 휠은 분당 N·R바퀴 → 초당 회전수에
 * 둘레를 곱해 m/s, 3.6배로 km/h. **발전량이라는 말을 한 번도 쓰지 않는다.**
 */
function reference_calculate_speed_via_angular(chainring, sprocket, beadSeatMm, widthMm, cadenceRpm) {
  const radiusM = (beadSeatMm + 2 * widthMm) / 2 / MM_PER_METRE;
  const wheelRadiansPerSecond = ((2 * Math.PI * cadenceRpm) / 60) * (chainring / sprocket);
  const metresPerSecond = wheelRadiansPerSecond * radiusM;
  return (metresPerSecond * 3600) / METRES_PER_KM;
}

/** 세 정의 중 ①을 전수 대조하는 독립 경로. 정렬 없이 O(n²)로 훑는다. */
function reference_count_removable(ratios, toleranceFraction) {
  const order = ratios.slice().sort((a, b) => a - b);
  const kept = [];
  let removed = 0;
  for (const ratio of order) {
    let hasTwin = false;
    for (const other of kept) {
      if (Math.abs(ratio - other) / Math.min(ratio, other) < toleranceFraction) hasTwin = true;
    }
    if (hasTwin) removed += 1;
    else kept.push(ratio);
  }
  return { removed, kept: kept.length };
}

// ── 단위 일관성 ─────────────────────────────────────────────

describe('단위 일관성 — 두 독립 경로가 같은 값을 낸다', () => {
  it('mm 경로와 inch 경로가 전 조합에서 일치한다', () => {
    const result = model_calculate_result(fixture_build_state());
    for (const combination of result.combinations) {
      const viaMm = reference_calculate_gear_inches_via_mm(
        combination.chainring, combination.sprocket, GEAR_BEAD_SEAT_DEFAULT, GEAR_TYRE_WIDTH_DEFAULT,
      );
      const viaInch = reference_calculate_gear_inches_via_inch(
        combination.chainring, combination.sprocket, GEAR_BEAD_SEAT_DEFAULT, GEAR_TYRE_WIDTH_DEFAULT,
      );
      expect(Math.abs(viaMm - viaInch) / viaMm).toBeLessThan(1e-12);
      expect(Math.abs(combination.gearInches - viaMm) / viaMm).toBeLessThan(1e-12);
    }
  });

  it('휠·크랭크·톱니를 흔들어도 두 경로가 갈라지지 않는다', () => {
    for (const beadSeatMm of GEAR_BEAD_SEAT_CHOICES) {
      for (const widthMm of [GEAR_TYRE_WIDTH_MIN, 25, 40, GEAR_TYRE_WIDTH_MAX]) {
        for (const chainring of [GEAR_CHAINRING_MIN, 34, GEAR_CHAINRING_MAX]) {
          for (const sprocket of [GEAR_SPROCKET_MIN, 17, GEAR_SPROCKET_MAX]) {
            const viaMm = reference_calculate_gear_inches_via_mm(chainring, sprocket, beadSeatMm, widthMm);
            const viaInch = reference_calculate_gear_inches_via_inch(chainring, sprocket, beadSeatMm, widthMm);
            expect(Math.abs(viaMm - viaInch) / viaMm).toBeLessThan(1e-12);
          }
        }
      }
    }
  });

  it('속도도 발전량 경로와 각속도 경로가 일치한다', () => {
    const result = model_calculate_result(fixture_build_state());
    for (const combination of result.combinations) {
      const viaDevelopment = reference_calculate_speed_via_development(
        combination.chainring, combination.sprocket, GEAR_BEAD_SEAT_DEFAULT,
        GEAR_TYRE_WIDTH_DEFAULT, GEAR_CADENCE_DEFAULT,
      );
      const viaAngular = reference_calculate_speed_via_angular(
        combination.chainring, combination.sprocket, GEAR_BEAD_SEAT_DEFAULT,
        GEAR_TYRE_WIDTH_DEFAULT, GEAR_CADENCE_DEFAULT,
      );
      expect(Math.abs(viaDevelopment - viaAngular) / viaDevelopment).toBeLessThan(1e-12);
      expect(Math.abs(combination.speedKmh - viaAngular) / viaAngular).toBeLessThan(1e-12);
    }
  });

  it('케이던스 전 범위에서 속도가 케이던스에 정확히 비례한다', () => {
    const base = model_calculate_result(fixture_build_state({ cadenceRpm: GEAR_CADENCE_MIN }));
    for (const cadenceRpm of [60, 75, GEAR_CADENCE_DEFAULT, 110, GEAR_CADENCE_MAX]) {
      const moved = model_calculate_result(fixture_build_state({ cadenceRpm }));
      moved.combinations.forEach((combination, index) => {
        const scaled = (base.combinations[index].speedKmh * cadenceRpm) / GEAR_CADENCE_MIN;
        expect(Math.abs(combination.speedKmh - scaled) / scaled).toBeLessThan(1e-12);
      });
    }
  });
});

// ── 초안이 못박은 값 ────────────────────────────────────────

describe('본문이 인용하는 수치', () => {
  const result = model_calculate_result(fixture_build_state());
  const top = fixture_read_combination(result, GEAR_CHAINRING_DEFAULT_LARGE, 11);

  it('휠 지름 672 mm, 26.457 인치, 둘레 2.111 m', () => {
    expect(result.diameterMm).toBe(672);
    expect(result.diameterMm / MM_PER_INCH).toBeCloseTo(26.4567, 4);
    expect(result.circumferenceM).toBeCloseTo(2.1112, 4);
  });

  it('50/11에서 120.26 gear inches · 8.854 gain ratio · 9.596 m · 51.82 km/h', () => {
    expect(top.gearInches).toBeCloseTo(120.26, 2);
    expect(top.gainRatio).toBeCloseTo(8.854, 3);
    expect(top.developmentM).toBeCloseTo(9.596, 3);
    expect(top.speedKmh).toBeCloseTo(51.82, 2);
  });

  it('22개 조합이 32.1에서 120.3 gear inches, 3.74배를 덮는다', () => {
    expect(result.combinationCount).toBe(22);
    expect(result.lowest.gearInches).toBeCloseTo(32.1, 1);
    expect(result.highest.gearInches).toBeCloseTo(120.3, 1);
    expect(result.rangeFactor).toBeCloseTo(3.74, 2);
  });

  it('앞을 53으로 키우면 54.9 km/h — 11↔12 한 칸(9%)보다 작은 6% 변화', () => {
    const bigger = model_calculate_result(fixture_build_state({ chainrings: [53, GEAR_CHAINRING_DEFAULT_SMALL] }));
    const moved = fixture_read_combination(bigger, 53, 11);
    expect(moved.speedKmh).toBeCloseTo(54.93, 2);
    const chainringGain = moved.speedKmh / top.speedKmh - 1;
    expect(chainringGain * PERCENT_SCALE).toBeCloseTo(6.0, 1);

    const nextSprocket = fixture_read_combination(result, GEAR_CHAINRING_DEFAULT_LARGE, 12);
    const sprocketStep = top.speedKmh / nextSprocket.speedKmh - 1;
    expect(sprocketStep * PERCENT_SCALE).toBeCloseTo(9.09, 2);
    expect(chainringGain).toBeLessThan(sprocketStep);
  });

  it('같은 앞으로 100 rpm을 돌리면 57.6 km/h — 11% 변화', () => {
    const faster = model_calculate_result(fixture_build_state({ cadenceRpm: 100 }));
    const moved = fixture_read_combination(faster, GEAR_CHAINRING_DEFAULT_LARGE, 11);
    expect(moved.speedKmh).toBeCloseTo(57.58, 2);
    expect((moved.speedKmh / top.speedKmh - 1) * PERCENT_SCALE).toBeCloseTo(11.1, 1);
  });

  it('케이던스 70→100은 어느 조합에서나 1.43배다', () => {
    const slow = model_calculate_result(fixture_build_state({ cadenceRpm: 70 }));
    const fast = model_calculate_result(fixture_build_state({ cadenceRpm: 100 }));
    for (let index = 0; index < slow.combinations.length; index += 1) {
      expect(fast.combinations[index].speedKmh / slow.combinations[index].speedKmh).toBeCloseTo(1.4286, 4);
    }
  });

  it('크랭크 165→175는 L을 6.06% 늘리고 gain ratio를 5.71% 떨어뜨린다 — gear inches는 꿈쩍 않는다', () => {
    const short = model_calculate_result(fixture_build_state({ crankMm: 165 }));
    const long = model_calculate_result(fixture_build_state({ crankMm: 175 }));
    expect((175 / 165 - 1) * PERCENT_SCALE).toBeCloseTo(6.06, 2);
    const shortTop = fixture_read_combination(short, GEAR_CHAINRING_DEFAULT_LARGE, 11);
    const longTop = fixture_read_combination(long, GEAR_CHAINRING_DEFAULT_LARGE, 11);
    expect((longTop.gainRatio / shortTop.gainRatio - 1) * PERCENT_SCALE).toBeCloseTo(-5.71, 2);
    // 크랭크는 gear inches·development·속도 어디에도 들어가지 않는다.
    expect(longTop.gearInches).toBe(shortTop.gearInches);
    expect(longTop.developmentM).toBe(shortTop.developmentM);
    expect(longTop.speedKmh).toBe(shortTop.speedKmh);
  });

  it('25-622에서 28-622로 가면 지름이 0.89% 움직인다', () => {
    const wider = model_calculate_wheel_diameter(GEAR_BEAD_SEAT_DEFAULT, 28);
    const narrow = model_calculate_wheel_diameter(GEAR_BEAD_SEAT_DEFAULT, 25);
    expect((wider / narrow - 1) * PERCENT_SCALE).toBeCloseTo(0.89, 2);
    // 50 → 51톱니가 만드는 2%보다 작다는 것이 본문의 논지다.
    expect(wider / narrow - 1).toBeLessThan(51 / 50 - 1);
  });

  it('손 계산 예제의 중간값들이 그대로 나온다', () => {
    expect(model_calculate_wheel_diameter(622, 25)).toBe(672);
    expect(model_calculate_wheel_circumference(672)).toBeCloseTo(2.11115, 5);
    expect(672 / 2 / GEAR_CRANK_DEFAULT).toBeCloseTo(1.948, 3);
    expect(model_calculate_speed(9.5961, 90)).toBeCloseTo(51.82, 2);
  });
});

// ── 중복 판정: 세 정의 ──────────────────────────────────────

describe('중복 판정 — 정의에 따라 값이 갈린다', () => {
  const result = model_calculate_result(fixture_build_state());

  it('정의 ① 지울 수 있는 조합 6 / 22 = 27%', () => {
    expect(result.removableCount).toBe(6);
    expect(result.combinationCount).toBe(22);
    expect(result.removableShare * PERCENT_SCALE).toBeCloseTo(27.3, 1);
    expect(result.distinctCount).toBe(16);
  });

  it('정의 ② 짝이 있는 조합 12 / 22 = 55%', () => {
    expect(result.pairedCount).toBe(12);
    expect(result.pairedShare * PERCENT_SCALE).toBeCloseTo(54.5, 1);
  });

  it('정의 ③ 두 체인링이 겹쳐 덮는 구간 42%', () => {
    expect(result.overlapShare * PERCENT_SCALE).toBeCloseTo(41.6, 1);
    // 초안이 손으로 적은 로그 비율과 맞춘다 — 독립 경로.
    const byHand = Math.log(3.0909 / 1.7857) / Math.log(4.5455 / 1.2143);
    expect(Math.abs(result.overlapShare - byHand)).toBeLessThan(2e-4);
  });

  it('세 값이 서로 다르다 — 어느 하나가 대표값이 아니다', () => {
    const three = [result.removableShare, result.pairedShare, result.overlapShare];
    expect(new Set(three.map((share) => Math.round(share * PERCENT_SCALE))).size).toBe(3);
  });

  it('초안이 적은 여섯 쌍이 그대로 나온다', () => {
    const named = result.pairs.map((pair) => {
      const first = result.combinations[pair.first];
      const second = result.combinations[pair.second];
      return `${first.chainring}/${first.sprocket}=${second.chainring}/${second.sprocket}`;
    });
    expect(named).toEqual([
      '50/17=34/12', '50/19=34/13', '50/21=34/14', '50/23=34/15', '50/25=34/17', '50/28=34/19',
    ]);
    const gaps = result.pairs.map((pair) => Number((pair.gap * PERCENT_SCALE).toFixed(1)));
    expect(gaps).toEqual([3.8, 0.6, 2.0, 4.3, 0.0, 0.2]);
  });

  it('50/25와 34/17은 정확히 같은 비다 (차이 0)', () => {
    expect(model_calculate_relative_gap(50 / 25, 34 / 17)).toBe(0);
  });
});

describe('중복 판정의 성질', () => {
  it('대칭이다 — A가 B의 중복이면 B도 A의 중복', () => {
    const result = model_calculate_result(fixture_build_state());
    for (const first of result.combinations) {
      for (const second of result.combinations) {
        expect(model_check_duplicate_pair(first.ratio, second.ratio, 0.05)).toBe(
          model_check_duplicate_pair(second.ratio, first.ratio, 0.05),
        );
        expect(model_calculate_relative_gap(first.ratio, second.ratio)).toBe(
          model_calculate_relative_gap(second.ratio, first.ratio),
        );
      }
    }
  });

  it('자기 자신과는 언제나 중복이다 (차이 0)', () => {
    expect(model_check_duplicate_pair(2.5, 2.5, GEAR_TOLERANCE_MIN / PERCENT_SCALE)).toBe(true);
  });

  it('경계는 열려 있다 — 차이가 정확히 τ면 중복이 아니다', () => {
    // 리터럴 0.05를 τ로 쓰면 부동소수 꼬리 때문에 `<=`로 바꿔도 통과한다.
    // 상대차 자체를 τ로 넘겨 **정확히 같은 값**을 만든다.
    const gap = model_calculate_relative_gap(1, 1.05);
    expect(model_check_duplicate_pair(1, 1.05, gap)).toBe(false);
    expect(model_check_duplicate_pair(1, 1.05, gap * 1.000001)).toBe(true);
    expect(model_check_duplicate_pair(1, 1.0499, 0.05)).toBe(true);
  });

  it('0이나 음수 비가 들어오면 상대차가 null이고 중복이 아니다', () => {
    expect(model_calculate_relative_gap(0, 1)).toBeNull();
    expect(model_calculate_relative_gap(-1, 1)).toBeNull();
    expect(model_check_duplicate_pair(0, 0, 0.05)).toBe(false);
  });

  it('전수 대조 경로가 정의 ①과 같은 수를 센다', () => {
    for (const tolerancePercent of [GEAR_TOLERANCE_MIN, 3.5, GEAR_TOLERANCE_DEFAULT, 8, GEAR_TOLERANCE_MAX]) {
      const result = model_calculate_result(fixture_build_state({ tolerancePercent }));
      const reference = reference_count_removable(
        result.combinations.map((combination) => combination.ratio),
        tolerancePercent / PERCENT_SCALE,
      );
      expect(result.removableCount).toBe(reference.removed);
      expect(result.distinctCount).toBe(reference.kept);
      expect(result.removableCount + result.distinctCount).toBe(result.combinationCount);
    }
  });
});

describe('허용오차 슬라이더가 실제로 무언가를 한다', () => {
  it('τ를 넓히면 지울 수 있는 조합이 단조 증가한다', () => {
    let previous = -1;
    const seen = new Set();
    for (let tolerancePercent = GEAR_TOLERANCE_MIN; tolerancePercent <= GEAR_TOLERANCE_MAX; tolerancePercent += 0.5) {
      const result = model_calculate_result(fixture_build_state({ tolerancePercent }));
      expect(result.removableCount).toBeGreaterThanOrEqual(previous);
      previous = result.removableCount;
      seen.add(result.removableCount);
    }
    // 슬라이더가 장식이 아니라는 것: 범위 안에서 값이 여러 번 실제로 바뀐다.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('가장 좁은 τ에서도 정확히 같은 비(50/25 = 34/17)는 중복으로 남는다', () => {
    const tight = model_calculate_result(fixture_build_state({ tolerancePercent: GEAR_TOLERANCE_MIN }));
    expect(tight.removableCount).toBeGreaterThanOrEqual(1);
    expect(tight.pairs.some((pair) => pair.gap === 0)).toBe(true);
  });

  it('정의 ③은 τ와 무관하다 — 폭을 재는 것이지 개수를 세는 것이 아니다', () => {
    const shares = [GEAR_TOLERANCE_MIN, GEAR_TOLERANCE_DEFAULT, GEAR_TOLERANCE_MAX].map(
      (tolerancePercent) => model_calculate_result(fixture_build_state({ tolerancePercent })).overlapShare,
    );
    expect(shares[0]).toBe(shares[1]);
    expect(shares[1]).toBe(shares[2]);
  });

  it('앞이 하나뿐이면 겹치는 구간이 0이다', () => {
    const single = model_calculate_result(fixture_build_state({ chainrings: [42] }));
    expect(single.overlapShare).toBe(0);
    expect(model_calculate_overlap_share(single.combinations)).toBe(0);
  });

  it('두 앞이 같은 톱니 수면 구간이 통째로 겹친다', () => {
    const twins = model_calculate_result(fixture_build_state({ chainrings: [40, 40] }));
    expect(twins.overlapShare).toBeCloseTo(1, 12);
    // 모든 조합이 짝을 갖는다.
    expect(twins.pairedCount).toBe(twins.combinationCount);
    expect(twins.removableCount).toBe(twins.combinationCount / 2);
  });
});

// ── 판정 ────────────────────────────────────────────────────

describe('판정 등급', () => {
  it('임계값 양쪽에서 등급이 갈린다', () => {
    expect(model_calculate_verdict(0)).toBe('hold');
    expect(model_calculate_verdict(GEAR_VERDICT_EDGE_MIN_SHARE - 1e-9)).toBe('hold');
    expect(model_calculate_verdict(GEAR_VERDICT_EDGE_MIN_SHARE)).toBe('edge');
    expect(model_calculate_verdict(GEAR_VERDICT_BREAK_MIN_SHARE - 1e-9)).toBe('edge');
    expect(model_calculate_verdict(GEAR_VERDICT_BREAK_MIN_SHARE)).toBe('break');
    expect(model_calculate_verdict(1)).toBe('break');
  });

  it('기본 설정은 edge — 27%는 15%와 35% 사이다', () => {
    expect(model_calculate_result(fixture_build_state()).verdict).toBe('edge');
  });

  it('1× 구동계는 hold — 지울 것이 없다', () => {
    const single = model_calculate_result(fixture_build_state({ chainrings: [42], cassette: GEAR_CASSETTE_PRESETS[2].teeth.slice() }));
    expect(single.removableCount).toBe(0);
    expect(single.verdict).toBe('hold');
  });
});

// ── 유효범위 검사 ───────────────────────────────────────────

describe('유효범위 밖은 숫자를 뱉지 않는다', () => {
  const bad = [
    ['앞 체인링이 하나도 없다', { chainrings: [] }],
    ['앞 체인링이 셋', { chainrings: [50, 39, 30] }],
    ['앞 체인링 톱니 0', { chainrings: [0] }],
    ['앞 체인링이 범위를 넘음', { chainrings: [GEAR_CHAINRING_MAX + 1] }],
    ['앞 체인링이 정수가 아님', { chainrings: [42.5] }],
    ['카세트가 비었다', { cassette: [] }],
    ['카세트 톱니 0', { cassette: [0, 12] }],
    ['카세트가 범위를 넘음', { cassette: [GEAR_SPROCKET_MAX + 1] }],
    ['카세트가 너무 길다', { cassette: new Array(GEAR_SPROCKET_COUNT_MAX + 1).fill(11) }],
    ['타이어 폭이 범위 밖', { tyreWidthMm: GEAR_TYRE_WIDTH_MAX + 1 }],
    ['비드시트 지름이 목록에 없다', { beadSeatMm: 700 }],
    ['크랭크가 범위 밖', { crankMm: 0 }],
    ['케이던스 0', { cadenceRpm: 0 }],
    ['케이던스가 범위를 넘음', { cadenceRpm: GEAR_CADENCE_MAX + 1 }],
    ['허용오차가 범위 밖', { tolerancePercent: 0 }],
    ['허용오차가 NaN', { tolerancePercent: Number.NaN }],
  ];

  for (const [name, overrides] of bad) {
    it(`${name} → 사유를 붙여 막는다`, () => {
      const state = fixture_build_state(overrides);
      const check = model_check_parameters(state);
      expect(check.ok).toBe(false);
      expect(check.message.length).toBeGreaterThan(10);
      expect(() => model_calculate_result(state)).toThrow();
      expect(() => model_calculate_combinations(state)).toThrow();
    });
  }

  it('기본값은 자기 검사를 통과한다 (로드 즉시 잘리지 않게)', () => {
    expect(model_check_parameters(fixture_build_state()).ok).toBe(true);
  });

  it('모든 기본값이 자기 클램프를 통과한다', () => {
    expect(model_clamp_chainring(GEAR_CHAINRING_DEFAULT_LARGE)).toBe(GEAR_CHAINRING_DEFAULT_LARGE);
    expect(model_clamp_chainring(GEAR_CHAINRING_DEFAULT_SMALL)).toBe(GEAR_CHAINRING_DEFAULT_SMALL);
    expect(model_clamp_tyre_width(GEAR_TYRE_WIDTH_DEFAULT)).toBe(GEAR_TYRE_WIDTH_DEFAULT);
    expect(model_clamp_bead_seat(GEAR_BEAD_SEAT_DEFAULT)).toBe(GEAR_BEAD_SEAT_DEFAULT);
    expect(model_clamp_crank(GEAR_CRANK_DEFAULT)).toBe(GEAR_CRANK_DEFAULT);
    expect(model_clamp_cadence(GEAR_CADENCE_DEFAULT)).toBe(GEAR_CADENCE_DEFAULT);
    expect(model_clamp_tolerance(GEAR_TOLERANCE_DEFAULT)).toBe(GEAR_TOLERANCE_DEFAULT);
  });

  it('모든 프리셋이 검사를 통과한다', () => {
    for (const preset of GEAR_BIKE_PRESETS) {
      const state = model_calculate_bike_preset_state(preset.key, fixture_build_state());
      expect(model_check_parameters(state).ok).toBe(true);
      expect(model_calculate_result(state).combinationCount).toBeGreaterThan(0);
    }
    for (const preset of GEAR_CASSETTE_PRESETS) {
      const state = fixture_build_state({ cassette: preset.teeth.slice() });
      expect(model_check_parameters(state).ok).toBe(true);
      // 카세트는 큰 톱니 쪽으로 단조 증가해야 사다리가 뒤집히지 않는다.
      for (let index = 1; index < preset.teeth.length; index += 1) {
        expect(preset.teeth[index]).toBeGreaterThan(preset.teeth[index - 1]);
      }
    }
  });
});

// ── 로그 축 진입 가드 ───────────────────────────────────────

describe('로그 축이 받는 값', () => {
  it('어떤 유효한 설정에서도 gear inches가 0보다 크고 유한하다', () => {
    for (const beadSeatMm of GEAR_BEAD_SEAT_CHOICES) {
      for (const widthMm of [GEAR_TYRE_WIDTH_MIN, GEAR_TYRE_WIDTH_MAX]) {
        for (const chainrings of [[GEAR_CHAINRING_MIN], [GEAR_CHAINRING_MAX, GEAR_CHAINRING_MIN]]) {
          const state = fixture_build_state({
            beadSeatMm, tyreWidthMm: widthMm, chainrings,
            cassette: [GEAR_SPROCKET_MIN, GEAR_SPROCKET_MAX],
          });
          for (const combination of model_calculate_result(state).combinations) {
            expect(combination.gearInches).toBeGreaterThan(0);
            expect(Number.isFinite(combination.gearInches)).toBe(true);
            expect(combination.ratio).toBeGreaterThan(0);
            expect(combination.developmentM).toBeGreaterThan(0);
            expect(combination.gainRatio).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('가장 작은 비도 0에 닿지 않는다 — log(0)이 축 눈금 루프를 얼리지 못한다', () => {
    const state = fixture_build_state({ chainrings: [GEAR_CHAINRING_MIN], cassette: [GEAR_SPROCKET_MAX] });
    const result = model_calculate_result(state);
    expect(result.lowest.ratio).toBeCloseTo(GEAR_CHAINRING_MIN / GEAR_SPROCKET_MAX, 12);
    expect(result.lowest.gearInches).toBeGreaterThan(0);
  });

  it('사다리의 축 스팬이 0이 되는 설정(조합 1개)에서도 비가 유한하다', () => {
    const result = model_calculate_result(fixture_build_state({ chainrings: [40], cassette: [16] }));
    expect(result.combinationCount).toBe(1);
    expect(result.rangeFactor).toBe(1);
    expect(result.overlapShare).toBe(0);
  });
});

// ── 카세트 문자열 ───────────────────────────────────────────

describe('카세트 입력 파서', () => {
  it('정상 입력을 읽는다 (공백을 허용한다)', () => {
    expect(model_read_cassette('11,12,13').teeth).toEqual([11, 12, 13]);
    expect(model_read_cassette(' 11 , 12 ,13 ').teeth).toEqual([11, 12, 13]);
    expect(model_read_cassette(model_format_cassette(GEAR_CASSETTE_DEFAULT)).teeth).toEqual(GEAR_CASSETTE_DEFAULT);
  });

  const broken = [
    ['빈 문자열', '', 'at least one sprocket'],
    ['공백만', '   ', 'at least one sprocket'],
    ['쉼표만', ',', 'empty slot'],
    ['꼬리 쉼표', '11,12,', 'empty slot'],
    ['16진수 표기', '0x10', 'not a whole number'],
    ['글자', 'abc', 'not a whole number'],
    ['소수', '11.5,12', 'not a whole number'],
    ['음수', '-11,12', 'not a whole number'],
    ['너무 작은 톱니', '8,12', 'outside the'],
    ['너무 큰 톱니', '11,60', 'outside the'],
    ['너무 많은 톱니', '11,12,13,14,15,16,17,18,19,20,21,22,23,24', 'at most'],
  ];

  for (const [name, raw, fragment] of broken) {
    it(`${name} → 이유를 평이한 영어로 돌려준다`, () => {
      const parsed = model_read_cassette(raw);
      expect(parsed.ok).toBe(false);
      expect(parsed.teeth).toEqual([]);
      expect(parsed.message).toContain(fragment);
      // 조용히 NaN을 흘리지 않는다.
      expect(parsed.message).not.toContain('NaN');
    });
  }

  it('깨진 입력은 최솟값이 아니라 기본 배열로 돌아간다', () => {
    for (const raw of ['', '0x10', 'abc', ',', '11,60']) {
      expect(model_read_cassette_or_default(raw)).toEqual(GEAR_CASSETTE_DEFAULT);
    }
    expect(model_read_cassette_or_default('11,13,15')).toEqual([11, 13, 15]);
  });

  it('톱니 수 13개는 통과하고 14개는 막힌다 (상한이 실제로 상한이다)', () => {
    const thirteen = new Array(GEAR_SPROCKET_COUNT_MAX).fill(0).map((_, index) => 11 + index);
    expect(model_read_cassette(thirteen.join(',')).ok).toBe(true);
    expect(model_read_cassette([...thirteen, 25].join(',')).ok).toBe(false);
  });

  it('경계 톱니 수는 통과한다', () => {
    expect(model_read_cassette(`${GEAR_SPROCKET_MIN},${GEAR_SPROCKET_MAX}`).ok).toBe(true);
    expect(model_read_cassette(String(GEAR_SPROCKET_MIN - 1)).ok).toBe(false);
    expect(model_read_cassette(String(GEAR_SPROCKET_MAX + 1)).ok).toBe(false);
  });
});

describe('앞 체인링 칸 파서', () => {
  it('빈 칸은 "없음"이다 — 1× 구동계', () => {
    expect(model_read_chainring_slot('', 34)).toBe(GEAR_CHAINRING_NONE);
    expect(model_read_chainring_slot('   ', 34)).toBe(GEAR_CHAINRING_NONE);
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    expect(model_read_chainring_slot('0x10', 34)).toBe(34);
    expect(model_read_chainring_slot('abc', 34)).toBe(34);
    expect(model_read_chainring_slot('34.5', 34)).toBe(34);
  });

  it('정상 값은 그대로 통과한다', () => {
    expect(model_read_chainring_slot('46', 34)).toBe(46);
  });
});

// ── 클램프 ──────────────────────────────────────────────────

describe('클램프와 눈금 스냅', () => {
  it('범위를 넘으면 자른다', () => {
    expect(model_clamp_chainring(999)).toBe(GEAR_CHAINRING_MAX);
    expect(model_clamp_chainring(-5)).toBe(GEAR_CHAINRING_MIN);
    expect(model_clamp_cadence(999)).toBe(GEAR_CADENCE_MAX);
    expect(model_clamp_cadence(1)).toBe(GEAR_CADENCE_MIN);
    expect(model_clamp_tolerance(99)).toBe(GEAR_TOLERANCE_MAX);
    expect(model_clamp_tolerance(0)).toBe(GEAR_TOLERANCE_MIN);
  });

  it('크랭크는 2.5 눈금 위로 스냅한다 — 손잡이와 계산이 갈리지 않게', () => {
    expect(model_clamp_crank(171)).toBe(170);
    expect(model_clamp_crank(172)).toBe(172.5);
    expect(model_clamp_crank(GEAR_CRANK_MIN)).toBe(GEAR_CRANK_MIN);
    expect(model_clamp_crank(GEAR_CRANK_MAX)).toBe(GEAR_CRANK_MAX);
    // 부동소수 꼬리가 남지 않는다.
    for (let value = GEAR_CRANK_MIN; value <= GEAR_CRANK_MAX; value += GEAR_CRANK_STEP) {
      expect(model_clamp_crank(value)).toBe(value);
    }
  });

  it('허용오차는 0.5 눈금 위로 스냅한다', () => {
    expect(model_clamp_tolerance(5.2)).toBe(5);
    expect(model_clamp_tolerance(5.3)).toBe(5.5);
  });

  it('비드시트 지름은 목록 밖이면 기본값으로 (최솟값이 아니다)', () => {
    expect(model_clamp_bead_seat(700)).toBe(GEAR_BEAD_SEAT_DEFAULT);
    expect(model_clamp_bead_seat(0)).toBe(GEAR_BEAD_SEAT_DEFAULT);
    expect(model_clamp_bead_seat(406)).toBe(406);
    expect(GEAR_BEAD_SEAT_CHOICES).toContain(GEAR_BEAD_SEAT_DEFAULT);
  });

  it('두 번째 앞 칸의 0은 "없음"으로 남고 최솟값으로 밀리지 않는다', () => {
    expect(model_clamp_chainring_optional(GEAR_CHAINRING_NONE)).toBe(GEAR_CHAINRING_NONE);
    expect(model_clamp_chainring_optional(-3)).toBe(GEAR_CHAINRING_NONE);
    expect(model_clamp_chainring_optional(34)).toBe(34);
    expect(model_clamp_chainring_optional(999)).toBe(GEAR_CHAINRING_MAX);
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  it('자전거 프리셋은 케이던스와 허용오차를 건드리지 않는다', () => {
    const state = fixture_build_state({ cadenceRpm: 77, tolerancePercent: 7.5 });
    for (const preset of GEAR_BIKE_PRESETS) {
      const loaded = model_calculate_bike_preset_state(preset.key, state);
      expect(loaded.cadenceRpm).toBe(77);
      expect(loaded.tolerancePercent).toBe(7.5);
    }
  });

  it('프리셋을 얹으면 그 프리셋으로 인식된다 (버튼의 눌림 상태가 거짓말하지 않게)', () => {
    for (const preset of GEAR_BIKE_PRESETS) {
      const loaded = model_calculate_bike_preset_state(preset.key, fixture_build_state());
      expect(model_pick_matching_bike_preset(loaded)).toBe(preset.key);
    }
  });

  it('한 칸이라도 다르면 어느 프리셋과도 같지 않다', () => {
    const loaded = model_calculate_bike_preset_state('road', fixture_build_state());
    expect(model_pick_matching_bike_preset({ ...loaded, crankMm: 165 })).toBeNull();
    expect(model_pick_matching_bike_preset({ ...loaded, tyreWidthMm: 28 })).toBeNull();
    expect(model_pick_matching_bike_preset({ ...loaded, chainrings: [50] })).toBeNull();
  });

  it('1× 프리셋은 앞 칸이 하나다', () => {
    const gravel = model_calculate_bike_preset_state('gravel', fixture_build_state());
    expect(gravel.chainrings.length).toBe(1);
    expect(model_calculate_result(gravel).overlapShare).toBe(0);
  });

  it('없는 프리셋 키는 null이다', () => {
    expect(model_calculate_bike_preset_state('nope', fixture_build_state())).toBeNull();
  });

  it('카세트 프리셋도 되짚어진다', () => {
    for (const preset of GEAR_CASSETTE_PRESETS) {
      expect(model_pick_matching_cassette_preset(preset.teeth.slice())).toBe(preset.key);
    }
    expect(model_pick_matching_cassette_preset([11, 12])).toBeNull();
  });

  it('기본 카세트는 첫 프리셋과 같다', () => {
    expect(GEAR_CASSETTE_PRESETS[0].teeth).toEqual(GEAR_CASSETTE_DEFAULT);
  });
});

// ── 계산 경로가 하나다 ──────────────────────────────────────

describe('계산 경로', () => {
  it('요약값이 조합 배열에서 직접 나온다 — 두 벌이 아니다', () => {
    const result = model_calculate_result(fixture_build_state());
    expect(result.combinationCount).toBe(result.combinations.length);
    expect(result.removableCount).toBe(result.removableIndexes.length);
    expect(result.pairedCount).toBe(result.pairedIndexes.length);
    // 표가 읽는 조합과 사다리가 읽는 조합이 같은 객체다.
    for (const index of result.removableIndexes) {
      expect(result.combinations[index]).toBeDefined();
    }
    for (const pair of result.pairs) {
      expect(result.combinations[pair.first]).toBeDefined();
      expect(result.combinations[pair.second]).toBeDefined();
    }
  });

  it('직접 부른 중복 함수와 결과 객체가 같은 답을 준다', () => {
    const state = fixture_build_state({ tolerancePercent: 8 });
    const result = model_calculate_result(state);
    const direct = model_pick_removable_duplicates(result.combinations, 0.08);
    expect(direct.removableIndexes).toEqual(result.removableIndexes);
    const paired = model_pick_paired_duplicates(result.combinations, 0.08);
    expect(paired.pairedIndexes).toEqual(result.pairedIndexes);
  });

  it('조합의 순서는 앞 체인링 먼저, 그 안에서 카세트 순서다', () => {
    const result = model_calculate_result(fixture_build_state());
    expect(result.combinations[0].chainring).toBe(GEAR_CHAINRING_DEFAULT_LARGE);
    expect(result.combinations[0].sprocket).toBe(GEAR_CASSETTE_DEFAULT[0]);
    expect(result.combinations[0].ringIndex).toBe(0);
    expect(result.combinations[GEAR_CASSETTE_DEFAULT.length].chainring).toBe(GEAR_CHAINRING_DEFAULT_SMALL);
    expect(result.combinations[GEAR_CASSETTE_DEFAULT.length].ringIndex).toBe(1);
  });
});
