/**
 * 히어로 애니메이션의 상태 기계 — 순수 함수 테스트
 *
 * 애니메이션은 장식이지만, **틀린 장식은 본문을 무너뜨린다.**
 * 두 줄이 같은 도착열을 받지 않으면 "차이는 배치이지 운이 아니다"라는
 * 본문 문장이 화면에서 거짓이 된다. 그것을 여기서 지킨다.
 *
 * 시계를 주입해 프레임을 손으로 민다 — rAF 없이 돈다.
 */
import { describe, it, expect } from 'vitest';
import {
  SIM_MAX_STEP_SECONDS,
  SIM_MINUTES_PER_SECOND,
  SIM_QUEUE_DRAW_MAX,
  SIM_RANDOM_PER_ARRIVAL,
  sim_calculate_exponential,
  sim_calculate_service,
  sim_calculate_step_minutes,
  sim_create_state,
  sim_advance_state,
  sim_read_frame,
} from './sim.js';
import { model_calculate_result } from './model.js';

const PARAMS = { load: 0.8, serviceMinutes: 3, variation: 1 };
const SEED = 20260906;

/** 상태를 정해진 시간만큼, 정해진 조각으로 나눠 민다. */
function fixture_run_minutes(state, totalMinutes, stepMinutes, params = PARAMS) {
  const stepCount = Math.round(totalMinutes / stepMinutes);
  for (let index = 0; index < stepCount; index += 1) sim_advance_state(state, stepMinutes, params);
  return state;
}

describe('표본 추출', () => {
  it('지수 표본이 0과 1 경계에서도 유한하다', () => {
    expect(Number.isFinite(sim_calculate_exponential(0, 3))).toBe(true);
    expect(Number.isFinite(sim_calculate_exponential(1, 3))).toBe(true);
    expect(sim_calculate_exponential(0, 3)).toBeGreaterThan(0);
  });

  it('지수 표본의 평균이 요청한 평균에 수렴한다', () => {
    // 결정적 격자로 적분한다 — 난수가 아니라 균등 분점을 쓴다.
    const pointCount = 200000;
    let total = 0;
    for (let index = 0; index < pointCount; index += 1) {
      total += sim_calculate_exponential((index + 0.5) / pointCount, 3);
    }
    expect(total / pointCount).toBeCloseTo(3, 2);
  });

  it('로그정규의 모수가 요청한 평균·변동계수와 정확히 맞는다', () => {
    // 격자 적분은 CV가 커지면 꼬리를 못 담아 2차 모멘트가 낮게 나온다.
    // 그래서 모멘트가 아니라 **모수 자체**를 두 지점에서 해석적으로 확인한다.
    //   z = 0  → 중앙값 = mean / √(1 + CV²)   (μ를 고정한다)
    //   z = 1  → 중앙값 × e^σ, σ = √ln(1+CV²) (σ를 고정한다)
    // Box–Muller에서 z = 0은 uB = 0.25, z = 1은 uA = e^(−1/2), uB = 0이다.
    const MEAN = 3;
    for (const variation of [0.25, 0.5, 1, 1.5, 2]) {
      const median = sim_calculate_service(0.5, 0.25, MEAN, variation);
      expect(median).toBeCloseTo(MEAN / Math.sqrt(1 + variation * variation), 10);

      // e^σ이지 √(1+CV²)가 아니다. σ = √ln(1+CV²).
      const oneSigma = sim_calculate_service(Math.exp(-0.5), 0, MEAN, variation);
      expect(oneSigma / median).toBeCloseTo(Math.exp(Math.sqrt(Math.log(1 + variation * variation))), 10);
    }
  });

  it('격자 적분으로도 평균과 변동계수가 맞는다 (꼬리를 담을 수 있는 CV에서)', () => {
    const pointCount = 400;
    for (const variation of [0.25, 1]) {
      let sum = 0;
      let sumSquared = 0;
      let count = 0;
      for (let a = 0; a < pointCount; a += 1) {
        for (let b = 0; b < pointCount; b += 1) {
          const value = sim_calculate_service((a + 0.5) / pointCount, (b + 0.5) / pointCount, 3, variation);
          sum += value;
          sumSquared += value * value;
          count += 1;
        }
      }
      const mean = sum / count;
      const deviation = Math.sqrt(sumSquared / count - mean * mean);
      expect(mean).toBeCloseTo(3, 1);
      expect(deviation / mean).toBeCloseTo(variation, 1);
    }
  });

  it('프레임 간격이 아무리 커도 잘려 들어간다', () => {
    expect(sim_calculate_step_minutes(1000)).toBe(SIM_MAX_STEP_SECONDS * SIM_MINUTES_PER_SECOND);
    expect(sim_calculate_step_minutes(-5)).toBe(0);
    expect(sim_calculate_step_minutes(0.1)).toBeCloseTo(0.1 * SIM_MINUTES_PER_SECOND, 12);
  });
});

describe('같은 도착열을 두 배치가 함께 본다', () => {
  it('두 배치의 도착 인원 합이 언제나 같다', () => {
    const state = sim_create_state(SEED, 4);
    fixture_run_minutes(state, 600, 0.5);
    const separateTotal =
      state.separate.lines.reduce((sum, line) => sum + line.length, 0) +
      state.separate.counters.filter(Boolean).length;
    const singleTotal = state.single.waiting.length + state.single.counters.filter(Boolean).length;
    // 가게 안에 남아 있는 사람 수는 배치와 무관하지 않다(단일 쪽이 빨리 빠진다).
    // 하지만 **들어온 사람 수**는 같은 스트림이므로 하나뿐이다.
    expect(state.arrivedCount).toBeGreaterThan(0);
    expect(singleTotal).toBeLessThanOrEqual(state.arrivedCount);
    expect(separateTotal).toBeLessThanOrEqual(state.arrivedCount);
  });

  it('같은 시드는 같은 그림을 낸다', () => {
    const first = sim_read_frame(fixture_run_minutes(sim_create_state(SEED, 4), 300, 0.5));
    const second = sim_read_frame(fixture_run_minutes(sim_create_state(SEED, 4), 300, 0.5));
    expect(first).toEqual(second);
  });

  it('다른 시드는 다른 그림을 낸다', () => {
    const first = sim_read_frame(fixture_run_minutes(sim_create_state(SEED, 4), 300, 0.5));
    const second = sim_read_frame(fixture_run_minutes(sim_create_state(SEED + 1, 4), 300, 0.5));
    expect(first).not.toEqual(second);
  });

  it('프레임을 잘게 쪼개도 같은 상태에 도달한다 — 시계가 프레임률에 안 묶인다', () => {
    const coarse = fixture_run_minutes(sim_create_state(SEED, 4), 300, 3);
    const fine = fixture_run_minutes(sim_create_state(SEED, 4), 300, 0.25);
    expect(fine.arrivedCount).toBe(coarse.arrivedCount);
    expect(sim_read_frame(fine)).toEqual(sim_read_frame(coarse));
  });
});

describe('배치의 규칙이 실제로 다르다', () => {
  it('단일 대기열은 창구가 비어 있는데 기다리는 사람을 남기지 않는다', () => {
    const state = sim_create_state(SEED, 4);
    for (let index = 0; index < 400; index += 1) {
      sim_advance_state(state, 1.5, PARAMS);
      const idle = state.single.counters.some((counter) => counter === null);
      if (idle) expect(state.single.waiting.length).toBe(0);
    }
  });

  it('창구별 대기열은 옆 창구가 비어 있어도 자기 줄에서만 데려온다', () => {
    // 이것이 두 배치를 가르는 유일한 규칙이다. 실제로 그 상황이 생기는지 센다.
    const state = sim_create_state(SEED, 4);
    let strandedFrames = 0;
    for (let index = 0; index < 600; index += 1) {
      sim_advance_state(state, 1.5, PARAMS);
      const idle = state.separate.counters.some((counter) => counter === null);
      const waiting = state.separate.lines.some((line) => line.length > 0);
      if (idle && waiting) strandedFrames += 1;
    }
    // 한 번도 안 생기면 두 배치가 같은 배치라는 뜻이다 — 페이지의 논지가 화면에서 사라진다.
    expect(strandedFrames).toBeGreaterThan(0);
  });

  it('창구가 하나면 두 배치의 대기 인원이 언제나 같다', () => {
    const state = sim_create_state(SEED, 1);
    for (let index = 0; index < 300; index += 1) {
      sim_advance_state(state, 1.5, { ...PARAMS, load: 0.7 });
      expect(state.single.waiting.length).toBe(state.separate.lines[0].length);
    }
  });

  it('오래 돌리면 창구별 대기열이 단일 대기열보다 길다 — 모델과 방향이 같다', () => {
    // 모델은 닫힌 형태로 평균 대기를 비교한다. 시뮬레이션은 독립된 경로다.
    // 두 경로가 **같은 부호**를 내는지만 본다 (값의 일치를 주장하지 않는다).
    let singleTotal = 0;
    let separateTotal = 0;
    for (const seed of [11, 222, 3333, 44444, 555555]) {
      const state = sim_create_state(seed, 4);
      for (let index = 0; index < 1200; index += 1) {
        sim_advance_state(state, 1, PARAMS);
        singleTotal += state.single.waiting.length;
        separateTotal += state.separate.lines.reduce((sum, line) => sum + line.length, 0);
      }
    }
    expect(separateTotal).toBeGreaterThan(singleTotal);
    // 모델도 같은 방향을 말한다.
    expect(model_calculate_result(4, PARAMS.load, PARAMS.serviceMinutes, PARAMS.variation).meanRatio)
      .toBeGreaterThan(1);
  });
});

describe('그리기 요약', () => {
  it('그릴 인원이 상한을 넘지 않는다 — 긴 줄에서 프레임이 떨어지지 않게', () => {
    // 줄이 26명을 넘으려면 도착이 충분히 많아야 한다 — 처리시간을 짧게 두고 오래 돌린다.
    const state = sim_create_state(SEED, 2);
    let sawOverflow = false;
    let maxDrawn = 0;
    for (let index = 0; index < 20000; index += 1) {
      sim_advance_state(state, 1, { load: 0.95, serviceMinutes: 1, variation: 1 });
      const frame = sim_read_frame(state);
      maxDrawn = Math.max(maxDrawn, frame.single.drawCount, ...frame.separate.drawCounts);
      if (frame.single.waitingCount > SIM_QUEUE_DRAW_MAX) sawOverflow = true;
      if (frame.separate.waitingCounts.some((count) => count > SIM_QUEUE_DRAW_MAX)) sawOverflow = true;
    }
    expect(maxDrawn).toBeLessThanOrEqual(SIM_QUEUE_DRAW_MAX);
    // 상한이 실제로 걸리는 구간을 지나야 이 테스트가 무언가를 지킨다.
    expect(sawOverflow).toBe(true);
  });

  it('도착 하나가 소비하는 난수 개수가 언제나 같다', () => {
    // 분기마다 소비량이 다르면 주변분포는 멀쩡한데 스트림 안에 상관이 생긴다.
    // 통계 검정으로는 안 잡히고 이런 구조적 불변식으로만 잡힌다.
    for (const params of [
      { load: 0.15, serviceMinutes: 0.5, variation: 0.25 },
      { load: 0.8, serviceMinutes: 3, variation: 1 },
      { load: 0.95, serviceMinutes: 10, variation: 2 },
    ]) {
      const state = sim_create_state(SEED, 4);
      const inner = state.random;
      let drawn = 0;
      state.random = () => { drawn += 1; return inner(); };
      for (let index = 0; index < 500; index += 1) sim_advance_state(state, 1, params);
      expect(state.arrivedCount).toBeGreaterThan(0);
      expect(drawn).toBe(state.arrivedCount * SIM_RANDOM_PER_ARRIVAL);
    }
  });

  it('창구 상태 배열의 길이가 창구 수와 같다', () => {
    for (const counterCount of [1, 3, 8]) {
      const frame = sim_read_frame(fixture_run_minutes(sim_create_state(SEED, counterCount), 60, 1));
      expect(frame.single.busy.length).toBe(counterCount);
      expect(frame.separate.busy.length).toBe(counterCount);
      expect(frame.separate.waitingCounts.length).toBe(counterCount);
    }
  });

  it('이벤트 예산이 있어 아무리 큰 걸음도 멈춘다 (탭이 안 얼어붙는다)', () => {
    const state = sim_create_state(SEED, 4);
    const started = Date.now();
    sim_advance_state(state, 100000, PARAMS);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
