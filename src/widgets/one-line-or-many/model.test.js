/**
 * 줄 하나 vs 줄 여럿 — 모델 단위테스트
 *
 * 브리프의 검수 포인트가 여기 있다: **Erlang C가 표준 기준값과 맞는가.**
 * 표준 Erlang C 값 일곱 개를 리터럴로 박고, 그 위에 독립 경로를 하나 더 둔다 —
 * 구현은 Erlang B 재귀이고, 대조는 계승·거듭제곱을 그대로 쓰는 닫힌 형태다.
 * 두 경로가 맞아야 신뢰한다. 같은 식을 한 번 더 부르는 것은 검증이 아니다.
 *
 * **그 일곱 값은 어느 공개된 표에서 베낀 것이 아니다.** 아래 닫힌 형태로 재현한
 * 표준값이고, 어느 문헌의 표인지는 특정하지 않는다. 페이지의 Sources 다섯 번째
 * 항목이 그렇게 적는데 이 파일은 "문헌 표"·"공개된 표 값"이라고 정반대로 말하고
 * 있었다 — 페이지를 확인하려고 이 파일을 연 독자가 페이지가 틀렸다고 읽는다.
 * 그래서 낱말에서 '표'를 걷어냈다(2026-09-25 사실검사). 단언 자체는 그대로다.
 */
import { describe, it, expect } from 'vitest';
import {
  QUEUE_COUNTER_MIN,
  QUEUE_COUNTER_MAX,
  QUEUE_COUNTER_DEFAULT,
  QUEUE_LOAD_MIN,
  QUEUE_LOAD_MAX,
  QUEUE_LOAD_DEFAULT,
  QUEUE_SERVICE_MIN_MINUTES,
  QUEUE_SERVICE_MAX_MINUTES,
  QUEUE_SERVICE_DEFAULT_MINUTES,
  QUEUE_CV_MIN,
  QUEUE_CV_MAX,
  QUEUE_CV_DEFAULT,
  QUEUE_CV_EXACT,
  QUEUE_TAIL_PROBABILITY,
  QUEUE_VERDICT_BREAK_MIN_RATIO,
  QUEUE_VERDICT_EDGE_MIN_RATIO,
  model_clamp_counter_count,
  model_clamp_load,
  model_clamp_service_minutes,
  model_clamp_variation,
  model_check_parameters,
  model_calculate_erlang_b,
  model_calculate_erlang_c,
  model_calculate_variation_factor,
  model_calculate_single_queue_wait,
  model_calculate_separate_queue_wait,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_sweep,
  model_calculate_counter_table,
} from './model.js';

// ── 대조 경로 ────────────────────────────────────────────────

/**
 * Erlang C의 **닫힌 형태**. 구현(Erlang B 재귀)과 식은 같지만 계산 경로가 다르다.
 *
 *   C = [aᶜ / (c!(1−ρ))] / [ Σ(k=0..c−1) aᵏ/k! + aᶜ/(c!(1−ρ)) ]
 */
function reference_calculate_erlang_c(counterCount, offeredLoad) {
  const load = offeredLoad / counterCount;
  let factorial = 1;
  let sum = 1; // k = 0 항
  for (let k = 1; k < counterCount; k += 1) {
    factorial *= k;
    sum += Math.pow(offeredLoad, k) / factorial;
  }
  const lastFactorial = factorial * (counterCount > 1 ? counterCount - 1 + 1 : 1);
  const tail = Math.pow(offeredLoad, counterCount) / (lastFactorial * (1 - load));
  return tail / (sum + tail);
}

/**
 * M/G/1의 평균 대기 — Pollaczek–Khinchine 공식. 창구 하나에서는 근사가 아니라 정확하다.
 *   Wq = ρ·E[S]·(1 + CV²) / (2(1 − ρ))
 */
function reference_calculate_pollaczek_khinchine(load, serviceMinutes, variation) {
  return (load * serviceMinutes * (1 + variation * variation)) / (2 * (1 - load));
}

/** 결정적 격자. 난수를 쓰지 않는다 — 실패가 재현되어야 한다. */
function enum_build_sweep() {
  const cases = [];
  for (let counterCount = QUEUE_COUNTER_MIN; counterCount <= QUEUE_COUNTER_MAX; counterCount += 1) {
    for (const load of [0.1, 0.25, 0.4, 0.55, 0.7, 0.8, 0.9, 0.95]) {
      for (const serviceMinutes of [0.5, 3, 10]) {
        for (const variation of [0.25, 1, 2]) cases.push({ counterCount, load, serviceMinutes, variation });
      }
    }
  }
  return cases;
}

// ── ① 표준 기준값 대조 (브리프의 검수 포인트) ─────────────────

describe('Erlang C — 표준 기준값과 맞는가', () => {
  /** [창구 수 c, 제공부하 a(erlang), 닫힌 형태로 재현한 표준 C 값] */
  const ERLANG_C_REFERENCE_VALUES = [
    [2, 1.0, 0.333333],
    [3, 2.0, 0.444444],
    [4, 3.0, 0.509434],
    [4, 3.2, 0.596432],
    [5, 3.0, 0.236152],
    [10, 5.0, 0.036105],
    [2, 1.8, 0.852632],
  ];

  it.each(ERLANG_C_REFERENCE_VALUES)('c=%i, a=%f → %f', (counterCount, offeredLoad, expected) => {
    // 기준값을 소수 여섯 자리로 적었으므로 그 자리까지 본다.
    expect(model_calculate_erlang_c(counterCount, offeredLoad)).toBeCloseTo(expected, 6);
  });

  it('손으로도 나오는 두 값은 분수와 정확히 같다', () => {
    expect(model_calculate_erlang_c(2, 1)).toBeCloseTo(1 / 3, 12);
    expect(model_calculate_erlang_c(3, 2)).toBeCloseTo(4 / 9, 12);
  });

  it('독립 경로(닫힌 형태)와 전 구간에서 일치한다', () => {
    for (let counterCount = QUEUE_COUNTER_MIN; counterCount <= QUEUE_COUNTER_MAX; counterCount += 1) {
      for (const load of [0.05, 0.1, 0.33, 0.5, 0.67, 0.8, 0.9, 0.95, 0.99]) {
        const offeredLoad = counterCount * load;
        expect(model_calculate_erlang_c(counterCount, offeredLoad)).toBeCloseTo(
          reference_calculate_erlang_c(counterCount, offeredLoad),
          12,
        );
      }
    }
  });

  it('창구가 하나면 C = ρ로 떨어진다', () => {
    for (const load of [0.1, 0.5, 0.95]) {
      expect(model_calculate_erlang_c(1, load)).toBeCloseTo(load, 12);
    }
  });

  it('Erlang B는 0과 1 사이이고 창구가 늘면 줄어든다', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let counterCount = 1; counterCount <= QUEUE_COUNTER_MAX; counterCount += 1) {
      const blocking = model_calculate_erlang_b(counterCount, 4);
      expect(blocking).toBeGreaterThan(0);
      expect(blocking).toBeLessThan(1);
      expect(blocking).toBeLessThan(previous);
      previous = blocking;
    }
  });

  it('ρ를 고정하고 창구만 늘리면 대기 확률이 줄어든다', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let counterCount = 1; counterCount <= QUEUE_COUNTER_MAX; counterCount += 1) {
      const value = model_calculate_erlang_c(counterCount, counterCount * 0.8);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });
});

// ── ② 본문이 인용하는 숫자 ──────────────────────────────────

describe('본문이 인용하는 숫자를 그대로 낸다', () => {
  it('블록 4 — 창구 4개, 3분, 80%', () => {
    const result = model_calculate_result(4, 0.8, 3, 1);
    expect(result.separate.meanMinutes).toBeCloseTo(12.0, 6);
    expect(result.single.meanMinutes).toBeCloseTo(2.2366, 3);
    expect(result.separate.percentileMinutes).toBeCloseTo(41.589, 3);
    expect(result.single.percentileMinutes).toBeCloseTo(9.296, 3);
    // 분(分)으로 줄어드는 양은 꼬리 쪽이 세 배 넘게 크다 — 페이지의 논지.
    expect(result.percentileSavedMinutes / result.meanSavedMinutes).toBeGreaterThan(3);
  });

  it('블록 4 — 배치가 평균 대기를 줄이는 배수 (창구 2·4·8)', () => {
    expect(model_calculate_result(2, 0.8, 3, 1).meanRatio).toBeCloseTo(2.25, 2);
    expect(model_calculate_result(4, 0.8, 3, 1).meanRatio).toBeCloseTo(5.37, 2);
    expect(model_calculate_result(8, 0.8, 3, 1).meanRatio).toBeCloseTo(13.98, 2);
  });

  it('블록 6 — 손으로 따라간 예제 (창구 2개, 4분, 50%)', () => {
    const result = model_calculate_result(2, 0.5, 4, 1);
    expect(result.single.delayProbability).toBeCloseTo(1 / 3, 12);
    expect(result.single.meanMinutes).toBeCloseTo(4 / 3, 6);
    expect(result.single.percentileMinutes).toBeCloseTo(4 * Math.log((1 / 3) / 0.05), 6);
    expect(result.single.percentileMinutes).toBeCloseTo(7.59, 2);
    expect(result.separate.meanMinutes).toBeCloseTo(4.0, 6);
    expect(result.separate.percentileMinutes).toBeCloseTo(8 * Math.log(0.5 / 0.05), 6);
    expect(result.separate.percentileMinutes).toBeCloseTo(18.4, 1);
  });

  it('평균 대기의 비는 C(c,a)/(cρ) 하나로 정해진다 — 처리시간·변동계수와 무관', () => {
    for (const serviceMinutes of [0.5, 3, 10]) {
      for (const variation of [0.25, 1, 2]) {
        const result = model_calculate_result(4, 0.8, serviceMinutes, variation);
        const expected = 1 / (model_calculate_erlang_c(4, 3.2) / (4 * 0.8));
        expect(result.meanRatio).toBeCloseTo(expected, 9);
      }
    }
  });
});

// ── ③ 두 배치의 관계 ────────────────────────────────────────

describe('두 배치 — 창구가 하나면 같은 배치다', () => {
  it('c = 1에서 평균과 퍼센타일이 정확히 같다', () => {
    for (const load of [0.1, 0.5, 0.9, 0.95]) {
      for (const variation of [0.25, 1, 2]) {
        const result = model_calculate_result(1, load, 3, variation);
        expect(result.single.meanMinutes).toBeCloseTo(result.separate.meanMinutes, 12);
        expect(result.single.percentileMinutes).toBeCloseTo(result.separate.percentileMinutes, 12);
        expect(result.meanRatio).toBeCloseTo(1, 12);
      }
    }
  });

  it('c ≥ 2에서는 단일 대기열이 언제나 더 짧다 (같지 않다)', () => {
    for (const testCase of enum_build_sweep()) {
      if (testCase.counterCount === 1) continue;
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      expect(result.single.meanMinutes).toBeLessThan(result.separate.meanMinutes);
      expect(result.meanRatio).toBeGreaterThan(1);
    }
  });

  it('두 배치의 이용률이 같다 — 처리량도 유휴시간도 같다는 뜻이다', () => {
    // 이 모델에서 ρ는 입력이고 두 배치가 그것을 공유한다. 배치가 바꾸는 것은
    // 대기의 분배뿐이라는 본문의 주장이 코드에서도 참인지 확인한다.
    for (const testCase of enum_build_sweep()) {
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      expect(result.load).toBe(testCase.load);
      expect(result.offeredLoad).toBeCloseTo(testCase.counterCount * testCase.load, 12);
    }
  });

  it('분(分)으로는 꼬리가 언제나 더 크게 준다 — 예외가 없다', () => {
    // 브리프의 뒤집힘 문장("단일 대기열이 평균보다 최악의 대기를 더 크게 줄인다")을
    // 초안이 **분(分)의 양**으로 다시 쓴 문장이다. 이쪽은 전 구간에서 참이다.
    let checked = 0;
    for (const testCase of enum_build_sweep()) {
      if (testCase.counterCount === 1) continue;
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      if (result.single.percentileMinutes <= 0) continue; // 퍼센타일이 0분이면 비가 정의되지 않는다
      expect(result.percentileSavedMinutes).toBeGreaterThan(result.meanSavedMinutes);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('비(比)로는 평균이 더 크게 준다 — 다만 전 구간이 아니다', () => {
    // **초안의 서술도 여기서 한 번 더 좁혀야 한다.** 초안은 "비율 기준으로는
    // 항상 평균 쪽이 더 크게 준다"고 적었으나, 단일 대기열의 대기 확률 C가
    // 꼬리 확률 0.05 바로 위에 있는 좁은 구간에서는 반대다 —
    // ln(C/0.05)가 0으로 붙어 단일 대기열의 95퍼센타일이 0분에 가까워지고,
    // 퍼센타일 비가 발산한다 (c=4, ρ=0.33에서 2,234배).
    // 그 구간을 지나면(대략 C ≳ 0.1) 평균 쪽이 언제나 크다.
    const SAFE_DELAY_PROBABILITY = 0.1;
    let checked = 0;
    for (const testCase of enum_build_sweep()) {
      if (testCase.counterCount === 1) continue;
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      if (result.single.delayProbability < SAFE_DELAY_PROBABILITY) continue;
      expect(result.meanRatio).toBeGreaterThan(result.percentileRatio);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('예외 구간이 실제로 존재한다 — 위 예외 문구가 장식이 아니다', () => {
    // 이 케이스가 사라지면 위 테스트의 SAFE_DELAY_PROBABILITY 가드는
    // 아무것도 지키지 않는 장식이 된다. 예외를 리터럴로 못박는다.
    const result = model_calculate_result(5, 0.4, 3, 1);
    expect(result.single.delayProbability).toBeGreaterThan(QUEUE_TAIL_PROBABILITY);
    expect(result.single.delayProbability).toBeLessThan(0.1);
    expect(result.percentileRatio).toBeGreaterThan(result.meanRatio);
    // 그래도 분(分)으로는 여전히 꼬리가 더 크게 준다.
    expect(result.percentileSavedMinutes).toBeGreaterThan(result.meanSavedMinutes);
  });
});

// ── ④ 변동계수 ─────────────────────────────────────────────

describe('처리시간 변동 — Allen–Cunneen 배수', () => {
  it('CV = 1에서 배수가 정확히 1이다 (지수 서비스면 식이 그대로 정확하다)', () => {
    expect(model_calculate_variation_factor(QUEUE_CV_EXACT)).toBe(1);
  });

  it('창구 하나에서는 Pollaczek–Khinchine과 정확히 같다 (근사가 아니다)', () => {
    for (const load of [0.1, 0.4, 0.75, 0.95]) {
      for (const variation of [0.25, 0.5, 1, 1.5, 2]) {
        const model = model_calculate_separate_queue_wait(load, 3, variation);
        expect(model.meanMinutes).toBeCloseTo(reference_calculate_pollaczek_khinchine(load, 3, variation), 12);
      }
    }
  });

  it('변동이 커지면 두 배치 모두 대기가 길어진다', () => {
    let previousSingle = 0;
    let previousSeparate = 0;
    for (const variation of [0.25, 0.5, 1, 1.5, 2]) {
      const result = model_calculate_result(4, 0.8, 3, variation);
      expect(result.single.meanMinutes).toBeGreaterThan(previousSingle);
      expect(result.separate.meanMinutes).toBeGreaterThan(previousSeparate);
      previousSingle = result.single.meanMinutes;
      previousSeparate = result.separate.meanMinutes;
    }
  });

  it('exact 표식이 CV = 1에서만 참이다', () => {
    expect(model_calculate_result(4, 0.8, 3, 1).exact).toBe(true);
    expect(model_calculate_result(4, 0.8, 3, 1.5).exact).toBe(false);
    expect(model_calculate_result(4, 0.8, 3, 0.25).exact).toBe(false);
  });
});

// ── ⑤ 퍼센타일 가드 (뮤테이션 점검) ─────────────────────────

describe('95퍼센타일 — 대기 확률이 꼬리보다 작으면 0분이다', () => {
  it('ρ = 0.1, 창구 8개에서 음수가 나오지 않는다', () => {
    // 가드를 지우면 ln(0.0000018 / 0.05)가 음수라 **음수 대기시간**이 찍힌다.
    const result = model_calculate_result(8, 0.1, 3, 1);
    expect(result.single.delayProbability).toBeLessThan(QUEUE_TAIL_PROBABILITY);
    expect(result.single.percentileMinutes).toBe(0);
  });

  it('퍼센타일이 어디서도 음수가 아니고 평균보다 작지 않다', () => {
    for (const testCase of enum_build_sweep()) {
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      for (const layout of [result.single, result.separate]) {
        expect(layout.percentileMinutes).toBeGreaterThanOrEqual(0);
        // 0분으로 잘린 구간을 빼면 퍼센타일은 언제나 평균 이상이다.
        if (layout.percentileMinutes > 0) {
          expect(layout.percentileMinutes).toBeGreaterThan(layout.meanMinutes);
        }
      }
    }
  });

  it('가드가 실제로 걸리는 경우와 안 걸리는 경우가 스윕 안에 둘 다 있다', () => {
    let clipped = 0;
    let open = 0;
    for (const testCase of enum_build_sweep()) {
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      if (result.single.percentileMinutes === 0) clipped += 1;
      else open += 1;
    }
    expect(clipped).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(0);
  });

  it('꼬리 확률 경계에서 퍼센타일이 정확히 0에서 출발한다', () => {
    const wait = model_calculate_single_queue_wait(1, QUEUE_TAIL_PROBABILITY, 3, 1);
    expect(wait.delayProbability).toBeCloseTo(QUEUE_TAIL_PROBABILITY, 12);
    expect(wait.percentileMinutes).toBe(0);
  });
});

// ── ⑥ 유효범위·클램프·기본값 ────────────────────────────────

describe('유효범위와 기본값', () => {
  it('모든 기본값이 자기 클램프·검사를 통과한다', () => {
    expect(model_clamp_counter_count(QUEUE_COUNTER_DEFAULT)).toBe(QUEUE_COUNTER_DEFAULT);
    expect(model_clamp_load(QUEUE_LOAD_DEFAULT)).toBe(QUEUE_LOAD_DEFAULT);
    expect(model_clamp_service_minutes(QUEUE_SERVICE_DEFAULT_MINUTES)).toBe(QUEUE_SERVICE_DEFAULT_MINUTES);
    expect(model_clamp_variation(QUEUE_CV_DEFAULT)).toBe(QUEUE_CV_DEFAULT);
    expect(
      model_check_parameters(QUEUE_COUNTER_DEFAULT, QUEUE_LOAD_DEFAULT, QUEUE_SERVICE_DEFAULT_MINUTES, QUEUE_CV_DEFAULT).ok,
    ).toBe(true);
  });

  it('범위 밖 조합은 조용히 숫자를 뱉지 않고 throw한다', () => {
    expect(() => model_calculate_result(4, 1.2, 3, 1)).toThrow();
    expect(() => model_calculate_result(0, 0.5, 3, 1)).toThrow();
    expect(() => model_calculate_result(4.5, 0.5, 3, 1)).toThrow();
    expect(() => model_calculate_result(4, 0.5, 0, 1)).toThrow();
    expect(() => model_calculate_result(4, 0.5, 3, 5)).toThrow();
    expect(() => model_calculate_result(4, Number.NaN, 3, 1)).toThrow();
  });

  it('클램프가 범위 밖과 숫자 아닌 것을 받아낸다', () => {
    expect(model_clamp_counter_count(99)).toBe(QUEUE_COUNTER_MAX);
    expect(model_clamp_counter_count(-3)).toBe(QUEUE_COUNTER_MIN);
    expect(model_clamp_counter_count(Number.NaN)).toBe(QUEUE_COUNTER_MIN);
    expect(model_clamp_load(2)).toBe(QUEUE_LOAD_MAX);
    expect(model_clamp_load(0)).toBe(QUEUE_LOAD_MIN);
    expect(model_clamp_service_minutes(1000)).toBe(QUEUE_SERVICE_MAX_MINUTES);
    expect(model_clamp_service_minutes(0)).toBe(QUEUE_SERVICE_MIN_MINUTES);
    expect(model_clamp_variation(9)).toBe(QUEUE_CV_MAX);
    expect(model_clamp_variation(0)).toBe(QUEUE_CV_MIN);
  });

  it('클램프가 슬라이더 눈금 위로 맞춘다 — 손잡이와 계산이 갈라지지 않게', () => {
    expect(model_clamp_load(0.8349)).toBe(0.83);
    expect(model_clamp_service_minutes(3.3)).toBe(3.5);
    expect(model_clamp_variation(1.13)).toBe(1.15);
  });
});

// ── ⑦ 곡선과 표 ────────────────────────────────────────────

describe('곡선과 표', () => {
  it('스윕이 ρ 범위 양 끝을 정확히 덮고 단조 증가한다', () => {
    const points = model_calculate_sweep(4, 3, 1);
    expect(points[0].load).toBeCloseTo(QUEUE_LOAD_MIN, 12);
    expect(points.at(-1).load).toBeCloseTo(QUEUE_LOAD_MAX, 12);
    let previous = -1;
    for (const point of points) {
      expect(point.load).toBeGreaterThan(previous);
      expect(point.separateMean).toBeGreaterThanOrEqual(point.singleMean);
      previous = point.load;
    }
  });

  it('스윕은 표본 점이 둘 미만이면 빈 배열이다 (0으로 나누지 않는다)', () => {
    expect(model_calculate_sweep(4, 3, 1, 1)).toEqual([]);
    expect(model_calculate_sweep(4, 3, 1, 0)).toEqual([]);
  });

  it('스윕이 모델 본체와 같은 값을 낸다 — 계산 경로가 둘로 갈리지 않았다', () => {
    const points = model_calculate_sweep(4, 3, 1, 3);
    for (const point of points) {
      const result = model_calculate_result(4, point.load, 3, 1);
      expect(point.singleMean).toBeCloseTo(result.single.meanMinutes, 12);
      expect(point.separatePercentile).toBeCloseTo(result.separate.percentileMinutes, 12);
    }
  });

  it('표가 창구 1~8을 덮고 첫 줄에서 두 배치가 같다', () => {
    const rows = model_calculate_counter_table(0.8, 3, 1);
    expect(rows.length).toBe(QUEUE_COUNTER_MAX - QUEUE_COUNTER_MIN + 1);
    expect(rows[0].counterCount).toBe(1);
    expect(rows[0].meanRatio).toBeCloseTo(1, 12);
    expect(rows.at(-1).counterCount).toBe(QUEUE_COUNTER_MAX);
  });

  it('표에서 창구가 늘수록 배치가 바꾸는 배수가 커진다', () => {
    const rows = model_calculate_counter_table(0.8, 3, 1);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].meanRatio).toBeGreaterThan(rows[index - 1].meanRatio);
    }
  });
});

// ── ⑧ 판정 ─────────────────────────────────────────────────

describe('판정 — 임계값이 실제로 갈린다', () => {
  it('임계값 양쪽에서 판정이 바뀐다', () => {
    expect(model_calculate_verdict(QUEUE_VERDICT_BREAK_MIN_RATIO)).toBe('break');
    expect(model_calculate_verdict(QUEUE_VERDICT_BREAK_MIN_RATIO - 0.01)).toBe('edge');
    expect(model_calculate_verdict(QUEUE_VERDICT_EDGE_MIN_RATIO)).toBe('edge');
    expect(model_calculate_verdict(QUEUE_VERDICT_EDGE_MIN_RATIO - 0.01)).toBe('hold');
    expect(model_calculate_verdict(1)).toBe('hold');
  });

  it('창구가 하나면 언제나 hold다 — 배치가 아무것도 바꾸지 않는 자리', () => {
    for (const load of [0.1, 0.5, 0.95]) {
      expect(model_calculate_verdict(model_calculate_result(1, load, 3, 1).meanRatio)).toBe('hold');
    }
  });

  it('스윕 안에 세 판정이 모두 나타난다', () => {
    const seen = new Set();
    for (const testCase of enum_build_sweep()) {
      const result = model_calculate_result(
        testCase.counterCount, testCase.load, testCase.serviceMinutes, testCase.variation,
      );
      seen.add(model_calculate_verdict(result.meanRatio));
    }
    expect([...seen].sort()).toEqual(['break', 'edge', 'hold']);
  });

  // 감사에서 확인된 결함: 옛 임계값(edge 1.2 / break 3)에서는 창구를 3개 이상으로
  // 고정한 채 이용률만 움직여도 판정이 **항상 break**였다 — c ≥ 3에서 배수의
  // 최솟값(ρ = 0.95)이 이미 3을 넘어 있었기 때문이다. c를 고정하고 ρ만 훑어
  // 두 판정이 실제로 갈리는지 명시적 파라미터로 못박는다.
  it('창구 수를 3~8로 고정해도 이용률만으로 edge와 break가 둘 다 나온다', () => {
    for (const counterCount of [3, 4, 5, 6, 7, 8]) {
      const seenAtCounter = new Set();
      for (const load of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
        const result = model_calculate_result(counterCount, load, 3, 1);
        seenAtCounter.add(model_calculate_verdict(result.meanRatio));
      }
      // hold는 c = 1에서만 정의상 나온다 — 여기서는 edge·break 두 가지가 갈리는지만 본다.
      expect([...seenAtCounter].sort()).toEqual(['break', 'edge']);
    }
  });

  // 세 분기 각각을 실측값(제품 계산 경로가 아니라 손으로 짚은 (c, ρ) 조합)으로 짚는다.
  it('세 판정 각각을 실제로 도달 가능한 (c, ρ) 조합으로 짚는다', () => {
    // hold — 창구 하나. 배수가 정의상 1이라 언제나 hold.
    expect(model_calculate_verdict(model_calculate_result(1, 0.5, 3, 1).meanRatio)).toBe('hold');
    // edge — 창구 8개, 이용률 0.95. 실측 배수 약 9.0배 (edge 2~20배 구간).
    const edgeResult = model_calculate_result(8, 0.95, 3, 1);
    expect(edgeResult.meanRatio).toBeGreaterThanOrEqual(QUEUE_VERDICT_EDGE_MIN_RATIO);
    expect(edgeResult.meanRatio).toBeLessThan(QUEUE_VERDICT_BREAK_MIN_RATIO);
    expect(model_calculate_verdict(edgeResult.meanRatio)).toBe('edge');
    // break — 창구 8개, 이용률 0.1. 실측 배수 약 385,096배.
    const breakResult = model_calculate_result(8, 0.1, 3, 1);
    expect(breakResult.meanRatio).toBeGreaterThanOrEqual(QUEUE_VERDICT_BREAK_MIN_RATIO);
    expect(model_calculate_verdict(breakResult.meanRatio)).toBe('break');
  });
});
