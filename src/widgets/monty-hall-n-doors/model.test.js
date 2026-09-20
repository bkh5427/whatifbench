/**
 * 몬티 홀 모델 단위테스트
 *
 * 검수 포인트(content-brief 01): N=3, K=1에서 2/3에 수렴하는가 — 이것만.
 * 나머지는 그 검수 포인트가 깨지지 않게 지키는 울타리다.
 */
import { describe, it, expect } from 'vitest';
import {
  MONTY_DOOR_MIN,
  MONTY_DOOR_MAX,
  MONTY_DOOR_DEFAULT,
  MONTY_OPENED_DEFAULT,
  MONTY_TRIAL_MIN,
  MONTY_TRIAL_MAX,
  MONTY_TRIAL_DEFAULT,
  MONTY_SEED_DEFAULT,
  model_clamp_seed,
  model_calculate_opened_max,
  model_calculate_remaining_count,
  model_calculate_stay_win_rate,
  model_calculate_switch_win_rate,
  model_calculate_switch_advantage,
  model_check_parameters,
  model_clamp_door_count,
  model_clamp_opened_count,
  model_clamp_trial_count,
  sim_calculate_checkpoints,
  sim_create_random,
  sim_run_convergence,
  sim_run_trials,
} from './model.js';

// 몬테카를로 허용 오차는 '절대값'으로 잡으면 안 된다.
// 0.01은 N=100(이론값 0.01)에서 45 SE에 해당해, 2배 틀려도 통과시킨다.
// 표준오차로 정규화해서 본다.
const MONTE_CARLO_Z_LIMIT = 4;
const TEST_TRIAL_COUNT = 200000;
const TEST_SEED = 20260904;

/** 측정값이 이론값에서 몇 표준오차 떨어졌는가. */
function test_calculate_z(measured, probability, trialCount) {
  return Math.abs(measured - probability) / Math.sqrt((probability * (1 - probability)) / trialCount);
}

describe('검수 포인트 — N=3, K=1', () => {
  it('이론 승률이 유지 1/3, 스위치 2/3이다', () => {
    expect(model_calculate_stay_win_rate(3)).toBeCloseTo(1 / 3, 12);
    expect(model_calculate_switch_win_rate(3, 1)).toBeCloseTo(2 / 3, 12);
  });

  it('몬테카를로가 2/3에 수렴한다', () => {
    const result = sim_run_convergence(3, 1, TEST_TRIAL_COUNT, { seed: TEST_SEED });
    // `toBeCloseTo(2/3, 2)`는 이 시행 수에서 4.74 SE다 — 이 파일이 세운 4 SE 기준을
    // 넘고, 시행 수를 줄이면 조용히 더 커진다. 허용오차는 전부 표준오차로 잡는다.
    expect(test_calculate_z(result.switchWinRate, 2 / 3, TEST_TRIAL_COUNT)).toBeLessThan(
      MONTE_CARLO_Z_LIMIT,
    );
    expect(test_calculate_z(result.stayWinRate, 1 / 3, TEST_TRIAL_COUNT)).toBeLessThan(
      MONTE_CARLO_Z_LIMIT,
    );
  });

  it('N=3, K=1에서는 유지와 스위치 승률의 합이 1이다', () => {
    const stay = model_calculate_stay_win_rate(3);
    const switchRate = model_calculate_switch_win_rate(3, 1);
    expect(stay + switchRate).toBeCloseTo(1, 12);
  });
});

describe('이론 승률 — 일반 N, K', () => {
  it('유지 승률은 K와 무관하게 1/N이다', () => {
    expect(model_calculate_stay_win_rate(100)).toBeCloseTo(0.01, 12);
    expect(model_calculate_stay_win_rate(10)).toBeCloseTo(0.1, 12);
  });

  it('N=100에서 호스트가 98개를 열면 스위치 승률이 0.99다', () => {
    expect(model_calculate_switch_win_rate(100, 98)).toBeCloseTo(0.99, 12);
  });

  it('N=100에서 호스트가 1개만 열면 스위치 이득이 거의 없다', () => {
    const switchRate = model_calculate_switch_win_rate(100, 1);
    expect(switchRate).toBeCloseTo(99 / (100 * 98), 12);
    expect(switchRate - model_calculate_stay_win_rate(100)).toBeLessThan(0.001);
  });

  it('K = N-2일 때 유지와 스위치의 합이 1이다', () => {
    for (const doorCount of [3, 7, 25, 100]) {
      const openedCount = model_calculate_opened_max(doorCount);
      const total =
        model_calculate_stay_win_rate(doorCount) + model_calculate_switch_win_rate(doorCount, openedCount);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it('스위치 승률은 언제나 유지 승률 이상이고, K가 커질수록 커진다', () => {
    for (const doorCount of [3, 10, 50, 100]) {
      const openedMax = model_calculate_opened_max(doorCount);
      let previous = 0;
      for (let openedCount = 1; openedCount <= openedMax; openedCount += 1) {
        const switchRate = model_calculate_switch_win_rate(doorCount, openedCount);
        // K ≥ 1이므로 순부등호다. `>=`로 두면 두 승률이 같아지는 구현도 통과한다.
        expect(switchRate).toBeGreaterThan(model_calculate_stay_win_rate(doorCount));
        expect(switchRate).toBeGreaterThan(previous);
        previous = switchRate;
      }
    }
  });

  it('스위치 이득 배수는 (N-1)/(N-1-K)와 같다', () => {
    expect(model_calculate_switch_advantage(3, 1)).toBeCloseTo(2, 12);
    expect(model_calculate_switch_advantage(100, 98)).toBeCloseTo(99, 12);
  });

  it('남은 문 개수는 N-1-K다', () => {
    expect(model_calculate_remaining_count(3, 1)).toBe(1);
    expect(model_calculate_remaining_count(100, 1)).toBe(98);
    expect(model_calculate_opened_max(100)).toBe(98);
  });
});

describe('몬테카를로가 이론값을 따라간다', () => {
  const cases = [
    { doorCount: 3, openedCount: 1 },
    { doorCount: 10, openedCount: 1 },
    { doorCount: 10, openedCount: 8 },
    { doorCount: 100, openedCount: 98 },
  ];

  for (const { doorCount, openedCount } of cases) {
    it(`N=${doorCount}, K=${openedCount}`, () => {
      const result = sim_run_convergence(doorCount, openedCount, TEST_TRIAL_COUNT, { seed: TEST_SEED });
      expect(
        test_calculate_z(result.switchWinRate, result.switchWinRateTheory, TEST_TRIAL_COUNT),
      ).toBeLessThan(MONTE_CARLO_Z_LIMIT);
      expect(
        test_calculate_z(result.stayWinRate, result.stayWinRateTheory, TEST_TRIAL_COUNT),
      ).toBeLessThan(MONTE_CARLO_Z_LIMIT);
    });
  }

  it('같은 씨앗은 같은 결과를 준다 (URL 공유 재현성)', () => {
    const first = sim_run_trials(3, 1, MONTY_TRIAL_MIN, { seed: 12345 });
    const second = sim_run_trials(3, 1, MONTY_TRIAL_MIN, { seed: 12345 });
    expect(first.switchWinCount).toBe(second.switchWinCount);
    expect(first.stayWinCount).toBe(second.stayWinCount);
  });

  it('다른 씨앗은 다른 결과를 준다', () => {
    const first = sim_run_trials(3, 1, MONTY_TRIAL_MIN, { seed: 12345 });
    const second = sim_run_trials(3, 1, MONTY_TRIAL_MIN, { seed: 54321 });
    expect(first.switchWinCount).not.toBe(second.switchWinCount);
  });

  it('유지 승리와 스위치 승리는 한 시행에서 동시에 일어나지 않는다', () => {
    // `합 <= 시행 수`만 걸면 **한 판도 못 이기는 시뮬레이터도 통과한다.**
    // 배타성을 실제로 재려면 합이 얼마여야 하는지를 알아야 한다.
    //
    // N=3, K=1은 호스트가 연 뒤 남는 문이 하나뿐이다. 그래서 "스위치 승"은
    // "유지 패"와 정확히 같은 사건이고, 둘의 합은 시행 수와 **정확히** 일치한다.
    const tight = sim_run_trials(3, 1, MONTY_TRIAL_MIN, { seed: TEST_SEED });
    expect(tight.stayWinCount + tight.switchWinCount).toBe(tight.trialCount);
    expect(tight.stayWinCount).toBeGreaterThan(0);
    expect(tight.switchWinCount).toBeGreaterThan(0);

    // N=10, K=1은 남는 문이 여덟 개다. 둘 다 지는 시행이 생기므로 합이 모자란다.
    // 여기서 합이 시행 수와 같아지면 둘 중 하나가 반드시 이기는 잘못된 판정이다.
    const loose = sim_run_trials(10, 1, MONTY_TRIAL_MIN, { seed: TEST_SEED });
    expect(loose.stayWinCount + loose.switchWinCount).toBeLessThan(loose.trialCount);
    expect(loose.stayWinCount).toBeGreaterThan(0);
    expect(loose.switchWinCount).toBeGreaterThan(0);
  });
});

describe('시뮬레이터 편향 검정 — 절대 허용오차로는 못 잡는 것', () => {
  // p가 작을 때(N=100이면 0.01) 절대 허용오차 0.01은 사실상 아무것도 검사하지 못한다.
  // 표준오차로 정규화한 z점수로 본다.
  // 시드 하나로 N만 쓸면 z점수들이 같은 난수 스트림을 공유해 서로 상관된다.
  // 그러면 z평균이 시드마다 통째로 치우쳐 보인다. 독립 시드 여러 개로 평균낸다.
  const SWEEP_DOOR_MIN = 3;
  const SWEEP_DOOR_MAX = 100;
  const SWEEP_DOOR_STEP = 7;
  const SWEEP_TRIAL_COUNT = 10000;
  const SWEEP_SEED_LIST = [20260904, 12345, 1, 777, 42, 99999999, 314159, 2718281];
  // 이 블록이 잡는 것: 승률을 통째로 어긋내는 결함(공식 오류, 판정 반전, 상수 오기).
  // 이 블록이 못 잡는 것: 난수 소비 정렬 결함. 그건 스트림 내부 상관이라
  //   z평균에서 상쇄되고, 정상 구현도 시드에 따라 |z평균| 1.3까지 나와 분리되지 않는다.
  //   그 결함은 위 '난수 소비량' 불변식 테스트가 담당한다.
  // 한계값을 더 조이면 정상 구현이 시드 운에 따라 실패한다.
  const Z_MEAN_LIMIT = 1.0;
  const Z_OUTLIER_RATIO_LIMIT = 0.15; // |z|>2 기대 비율은 0.046

  function sweep_calculate_z_scores(rateKey, theoryFn) {
    const zScores = [];
    for (const seed of SWEEP_SEED_LIST) {
      for (let doorCount = SWEEP_DOOR_MIN; doorCount <= SWEEP_DOOR_MAX; doorCount += SWEEP_DOOR_STEP) {
        const openedCount = 1;
        const probability = theoryFn(doorCount, openedCount);
        const standardError = Math.sqrt((probability * (1 - probability)) / SWEEP_TRIAL_COUNT);
        const result = sim_run_trials(doorCount, openedCount, SWEEP_TRIAL_COUNT, { seed });
        zScores.push((result[rateKey] - probability) / standardError);
      }
    }
    return zScores;
  }

  it('유지 승률이 N 전 구간에서 이론값 주위에 고르게 분포한다', () => {
    const zScores = sweep_calculate_z_scores('stayWinRate', (doorCount) =>
      model_calculate_stay_win_rate(doorCount),
    );
    const meanZ = zScores.reduce((sum, z) => sum + z, 0) / zScores.length;
    const outlierRatio = zScores.filter((z) => Math.abs(z) > 2).length / zScores.length;
    expect(Math.abs(meanZ)).toBeLessThan(Z_MEAN_LIMIT);
    expect(outlierRatio).toBeLessThan(Z_OUTLIER_RATIO_LIMIT);
  });

  it('스위치 승률도 N 전 구간에서 이론값 주위에 고르게 분포한다', () => {
    const zScores = sweep_calculate_z_scores('switchWinRate', (doorCount, openedCount) =>
      model_calculate_switch_win_rate(doorCount, openedCount),
    );
    const meanZ = zScores.reduce((sum, z) => sum + z, 0) / zScores.length;
    const outlierRatio = zScores.filter((z) => Math.abs(z) > 2).length / zScores.length;
    expect(Math.abs(meanZ)).toBeLessThan(Z_MEAN_LIMIT);
    expect(outlierRatio).toBeLessThan(Z_OUTLIER_RATIO_LIMIT);
  });

  it('시행당 난수 소비량이 승패와 무관하다 — 편향의 실제 원인', () => {
    // 이 결함은 주변분포를 왜곡하지 않는다. 같은 난수열 안에서 정렬을 어긋내
    // 스트림 내부에 상관을 만든다. 그래서 z평균·이상치 같은 통계 검정으로는
    // 안정적으로 잡히지 않는다(정상 구현도 시드에 따라 |z평균| 1.3까지 나온다).
    // 잡을 수 있는 것은 알고리즘의 불변식뿐이다: 소비량이 결과에 의존하면 안 된다.
    //
    // 소비 개수를 3으로 못박지는 않는다. 그러면 소비량이 일정한 다른 구현으로
    // 리팩터할 때 정상 코드가 실패한다. '두 경로의 소비량이 같은가'만 본다.
    const TRIAL_COUNT = MONTY_TRIAL_MIN;

    function count_draws(valueFn) {
      let drawCount = 0;
      const countingRandom = () => {
        const value = valueFn(drawCount);
        drawCount += 1;
        return value;
      };
      sim_run_trials(3, 1, TRIAL_COUNT, { randomFn: countingRandom });
      return drawCount;
    }

    // 항상 0 → 상품 문과 참가자 문이 같다 (유지 승리 경로만 탄다)
    const drawsWhenStayWins = count_draws(() => 0);
    // 0과 0.5를 번갈아 → 두 문이 항상 다르다 (스위치 판정 경로만 탄다)
    const drawsWhenPicksDiffer = count_draws((index) => (index % 2 === 0 ? 0 : 0.5));

    expect(drawsWhenStayWins).toBe(drawsWhenPicksDiffer);
    expect(drawsWhenStayWins % TRIAL_COUNT).toBe(0);
  });
});

describe('독립 구현과의 대조 — 유도를 쓰지 않는 검증', () => {
  /**
   * model.js의 시뮬레이션은 "첫 선택이 틀렸으면 남은 R개 중 1/R"이라는
   * 대칭성 논증을 이미 쓰고 있다. 그래서 그것만으로는 유도의 독립 검증이 못 된다.
   *
   * 아래는 문 배열을 실제로 만들고, 호스트가 실제로 꽝 문을 골라 열고,
   * 참가자가 남은 문 중 하나를 실제로 집는다. 공식도 대칭성도 쓰지 않는다.
   */
  function explicit_run_trials(doorCount, openedCount, trialCount, randomFn, hostRule) {
    let stayWinCount = 0;
    let switchWinCount = 0;

    for (let trial = 0; trial < trialCount; trial += 1) {
      const prizeDoor = Math.floor(randomFn() * doorCount);
      const playerDoor = Math.floor(randomFn() * doorCount);

      // 호스트가 열 수 있는 문: 참가자 문도 상품 문도 아닌 것
      const candidates = [];
      for (let door = 0; door < doorCount; door += 1) {
        if (door !== playerDoor && door !== prizeDoor) candidates.push(door);
      }

      const opened = new Set();
      if (hostRule === 'lowest') {
        for (let i = 0; i < openedCount; i += 1) opened.add(candidates[i]);
      } else {
        const pool = candidates.slice();
        for (let i = 0; i < openedCount; i += 1) {
          opened.add(...pool.splice(Math.floor(randomFn() * pool.length), 1));
        }
      }

      const survivors = [];
      for (let door = 0; door < doorCount; door += 1) {
        if (door !== playerDoor && !opened.has(door)) survivors.push(door);
      }

      if (playerDoor === prizeDoor) stayWinCount += 1;
      if (survivors[Math.floor(randomFn() * survivors.length)] === prizeDoor) switchWinCount += 1;
    }

    return { stayWinRate: stayWinCount / trialCount, switchWinRate: switchWinCount / trialCount };
  }

  const EXPLICIT_TRIAL_COUNT = 100000;
  const EXPLICIT_Z_LIMIT = 4;
  const cases = [
    { doorCount: 3, openedCount: 1 },
    { doorCount: 4, openedCount: 1 },
    { doorCount: 10, openedCount: 8 },
    { doorCount: 18, openedCount: 2 },
  ];

  // 호스트 규칙이 달라도 결과가 같아야 한다.
  // 결과가 규칙에 의존한다면 공식이 규칙 하나에만 맞는 것이므로 유도가 틀린 것이다.
  for (const hostRule of ['uniform', 'lowest']) {
    for (const { doorCount, openedCount } of cases) {
      it(`N=${doorCount}, K=${openedCount} — 호스트 규칙 ${hostRule}`, () => {
        const random = sim_create_random(TEST_SEED);
        const measured = explicit_run_trials(
          doorCount,
          openedCount,
          EXPLICIT_TRIAL_COUNT,
          random,
          hostRule,
        );
        const stayTheory = model_calculate_stay_win_rate(doorCount);
        const switchTheory = model_calculate_switch_win_rate(doorCount, openedCount);
        const stayError = Math.sqrt((stayTheory * (1 - stayTheory)) / EXPLICIT_TRIAL_COUNT);
        const switchError = Math.sqrt((switchTheory * (1 - switchTheory)) / EXPLICIT_TRIAL_COUNT);

        expect(Math.abs(measured.stayWinRate - stayTheory) / stayError).toBeLessThan(EXPLICIT_Z_LIMIT);
        expect(Math.abs(measured.switchWinRate - switchTheory) / switchError).toBeLessThan(
          EXPLICIT_Z_LIMIT,
        );
      });
    }
  }

  it('빠른 시뮬레이션과 명시적 시뮬레이션이 서로 일치한다', () => {
    const doorCount = 10;
    const openedCount = 3;
    const explicitResult = explicit_run_trials(
      doorCount,
      openedCount,
      EXPLICIT_TRIAL_COUNT,
      sim_create_random(TEST_SEED),
      'uniform',
    );
    const fastResult = sim_run_trials(doorCount, openedCount, EXPLICIT_TRIAL_COUNT, {
      seed: TEST_SEED,
    });
    const switchTheory = model_calculate_switch_win_rate(doorCount, openedCount);
    const switchError = Math.sqrt((switchTheory * (1 - switchTheory)) / EXPLICIT_TRIAL_COUNT);
    expect(
      Math.abs(explicitResult.switchWinRate - fastResult.switchWinRate) / switchError,
    ).toBeLessThan(EXPLICIT_Z_LIMIT);
  });
});

describe('난수 발생기', () => {
  it('0 이상 1 미만을 낸다', () => {
    const random = sim_create_random(TEST_SEED);
    for (let i = 0; i < 10000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('난수열이 고정돼 있다 (골든 벡터) — URL 공유 재현성의 근거', () => {
    // 분포 스모크(범위·평균)만으로는 RNG 상수를 바꿔도 통과한다.
    // 그러면 예전에 공유한 URL의 곡선이 조용히 달라진다. 스트림 자체를 못박는다.
    const random = sim_create_random(MONTY_SEED_DEFAULT);
    const golden = [
      0.283611307386309, 0.700265703257173, 0.263604806968942, 0.12938253255561,
      0.45396000216715,
    ];
    for (const expected of golden) {
      expect(random()).toBeCloseTo(expected, 12);
    }
  });

  it('평균이 0.5 근처다', () => {
    const random = sim_create_random(TEST_SEED);
    let total = 0;
    const sampleCount = 100000;
    for (let i = 0; i < sampleCount; i += 1) total += random();
    // `toBeCloseTo(0.5, 2)`는 이 표본 수에서 5.48 SE다 — 이 파일이 세운 4 SE
    // 기준을 넘고, 대신 봐 줄 검정도 없다. 균등분포의 표준편차 1/√12로 정규화한다.
    const standardError = Math.sqrt(1 / 12 / sampleCount);
    const z = Math.abs(total / sampleCount - 0.5) / standardError;
    expect(z).toBeLessThan(MONTE_CARLO_Z_LIMIT);
  });
});

describe('수렴 곡선 표본', () => {
  it('첫 점은 1, 마지막 점은 trialCount다', () => {
    const checkpoints = sim_calculate_checkpoints(MONTY_TRIAL_MIN);
    expect(checkpoints[0]).toBe(1);
    expect(checkpoints[checkpoints.length - 1]).toBe(MONTY_TRIAL_MIN);
  });

  it('단조 증가하고 중복이 없다', () => {
    const checkpoints = sim_calculate_checkpoints(MONTY_TRIAL_MAX);
    for (let i = 1; i < checkpoints.length; i += 1) {
      expect(checkpoints[i]).toBeGreaterThan(checkpoints[i - 1]);
    }
  });

  it('간격이 선형이 아니라 로그다 — 이 함수의 존재 이유', () => {
    // 선형 간격으로 바꿔도 "첫 점=1 / 마지막=trialCount / 단조증가 / 중복없음"은
    // 전부 만족한다. 그 상태로 두면 x축 로그 스케일이 통째로 무의미해진다.
    const checkpoints = sim_calculate_checkpoints(MONTY_TRIAL_MAX);
    const tail = checkpoints.slice(Math.floor(checkpoints.length / 2));
    const ratios = [];
    for (let i = 1; i < tail.length; i += 1) ratios.push(tail[i] / tail[i - 1]);
    const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    // 로그 간격이면 연속 비율이 거의 일정하다
    for (const ratio of ratios) expect(Math.abs(ratio - mean)).toBeLessThan(mean * 0.15);
    expect(mean).toBeGreaterThan(1.02);

    // 앞쪽 절반이 뒤쪽 절반보다 훨씬 촘촘해야 한다 (선형이면 균등하다)
    const half = Math.floor(checkpoints.length / 2);
    const frontSpan = checkpoints[half] - checkpoints[0];
    const backSpan = checkpoints[checkpoints.length - 1] - checkpoints[half];
    expect(backSpan).toBeGreaterThan(frontSpan * 10);
  });

  it('표본 점 개수가 곡선을 그릴 만큼 충분하되, 픽셀보다 촘촘하지는 않다', () => {
    // 140 → 3 으로 줄여도 기존 단언은 전부 통과했다. 곡선이 꺾은선이 된다.
    // 하한만 걸면 반대 방향(140 → 400)이 그대로 통과한다. 그러면 캔버스 폭보다
    // 점이 많아져 시행 루프 안의 기록 비용만 늘고 그림은 달라지지 않는다.
    // 중복 제거 뒤 실제로 남는 개수를 양쪽에서 못박는다.
    expect(sim_calculate_checkpoints(MONTY_TRIAL_MAX)).toHaveLength(126);
    expect(sim_calculate_checkpoints(MONTY_TRIAL_MIN)).toHaveLength(99);
    // 표본 점은 요청한 개수를 절대 넘지 않는다 (중복만 걷어낸다)
    expect(sim_calculate_checkpoints(MONTY_TRIAL_MAX).length).toBeLessThanOrEqual(140);
  });

  it('유효하지 않은 시행 수에서 NaN 배열을 만들지 않는다', () => {
    for (const bad of [0, -5, Number.NaN]) {
      expect(sim_calculate_checkpoints(bad)).toEqual([]);
    }
  });

  it('표본 점이 1개면 첫 지점 하나만 준다', () => {
    expect(sim_calculate_checkpoints(1000, 1)).toEqual([1]);
  });

  it('곡선 점의 승률은 전부 0~1 범위다', () => {
    const result = sim_run_convergence(3, 1, MONTY_TRIAL_MIN, { seed: TEST_SEED });
    expect(result.points.length).toBeGreaterThan(0);
    for (const point of result.points) {
      expect(point.stayWinRate).toBeGreaterThanOrEqual(0);
      expect(point.stayWinRate).toBeLessThanOrEqual(1);
      expect(point.switchWinRate).toBeGreaterThanOrEqual(0);
      expect(point.switchWinRate).toBeLessThanOrEqual(1);
    }
  });

  it('마지막 곡선 점은 최종 승률과 일치한다', () => {
    const result = sim_run_convergence(3, 1, MONTY_TRIAL_MIN, { seed: TEST_SEED });
    const last = result.points[result.points.length - 1];
    expect(last.trial).toBe(result.trialCount);
    expect(last.switchWinRate).toBeCloseTo(result.switchWinRate, 12);
  });
});

describe('유효범위 밖 입력', () => {
  it('K가 N-2를 넘으면 거부한다', () => {
    expect(model_check_parameters(3, 2, MONTY_TRIAL_MIN).ok).toBe(false);
    expect(model_check_parameters(100, 99, MONTY_TRIAL_MIN).ok).toBe(false);
  });

  it('문 개수가 범위 밖이면 거부한다', () => {
    expect(model_check_parameters(2, 1, MONTY_TRIAL_MIN).ok).toBe(false);
    expect(model_check_parameters(101, 1, MONTY_TRIAL_MIN).ok).toBe(false);
  });

  it('유효한 조합은 통과한다', () => {
    expect(model_check_parameters(3, 1, MONTY_TRIAL_MIN).ok).toBe(true);
    expect(model_check_parameters(100, 98, MONTY_TRIAL_MAX).ok).toBe(true);
  });

  it('시행 횟수 분기도 실제로 검사한다', () => {
    // 이 분기를 통째로 무력화해도 기존 테스트는 전부 통과했다.
    expect(model_check_parameters(3, 1, MONTY_TRIAL_MIN - 1).ok).toBe(false);
    expect(model_check_parameters(3, 1, MONTY_TRIAL_MAX + 1).ok).toBe(false);
    expect(model_check_parameters(3, 1, 5000.5).ok).toBe(false);
    expect(model_check_parameters(3, 1, Number.NaN).ok).toBe(false);
  });

  it('정수가 아닌 문·개방 수를 거부한다', () => {
    expect(model_check_parameters(3.5, 1, MONTY_TRIAL_MIN).ok).toBe(false);
    expect(model_check_parameters(10, 1.5, MONTY_TRIAL_MIN).ok).toBe(false);
    expect(model_check_parameters(Number.NaN, 1, MONTY_TRIAL_MIN).ok).toBe(false);
  });

  it('거부 사유 문구가 비어 있지 않다', () => {
    for (const args of [[2, 1, MONTY_TRIAL_MIN], [3, 2, MONTY_TRIAL_MIN], [3, 1, 1]]) {
      const check = model_check_parameters(...args);
      expect(check.ok).toBe(false);
      expect(check.message.length).toBeGreaterThan(0);
    }
  });

  it('유효범위 밖이면 시뮬레이션이 조용히 숫자를 뱉지 않고 던진다', () => {
    expect(() => sim_run_convergence(3, 2, MONTY_TRIAL_MIN)).toThrow();
  });

  it('클램프가 값을 범위 안으로 되돌린다', () => {
    expect(model_clamp_door_count(1)).toBe(MONTY_DOOR_MIN);
    expect(model_clamp_door_count(9999)).toBe(MONTY_DOOR_MAX);
    expect(model_clamp_door_count(Number.NaN)).toBe(MONTY_DOOR_MIN);
    expect(model_clamp_opened_count(50, 3)).toBe(1);
    expect(model_clamp_opened_count(0, 100)).toBe(1);
    expect(model_clamp_trial_count(1)).toBe(MONTY_TRIAL_MIN);
    expect(model_clamp_trial_count(1e9)).toBe(MONTY_TRIAL_MAX);
  });

  it('기본값들은 자기 유효범위 안에 있다 (클램프에 잘리면 안 된다)', () => {
    expect(model_clamp_door_count(MONTY_DOOR_DEFAULT)).toBe(MONTY_DOOR_DEFAULT);
    expect(model_clamp_opened_count(MONTY_OPENED_DEFAULT, MONTY_DOOR_DEFAULT)).toBe(MONTY_OPENED_DEFAULT);
    expect(model_clamp_trial_count(MONTY_TRIAL_DEFAULT)).toBe(MONTY_TRIAL_DEFAULT);
    expect(model_clamp_seed(MONTY_SEED_DEFAULT)).toBe(MONTY_SEED_DEFAULT);
  });

  it('기본 시드가 시드 유효범위 안에 있다 — 밖이면 로드 즉시 잘린다', () => {
    // 규약의 점검 항목이다. `model_clamp_seed(기본값) === 기본값`만으로는
    // 클램프와 기본값이 같이 틀려도 통과할 수 있으므로 **범위를 리터럴로** 박는다.
    // (`_shared/random.js`의 RNG_SEED_MIN=1 / RNG_SEED_MAX=99999999)
    expect(MONTY_SEED_DEFAULT).toBeGreaterThanOrEqual(1);
    expect(MONTY_SEED_DEFAULT).toBeLessThanOrEqual(99999999);
    expect(Number.isInteger(MONTY_SEED_DEFAULT)).toBe(true);
    // 범위 밖 시드는 실제로 잘린다 — 클램프가 살아 있다는 대조.
    expect(model_clamp_seed(0)).toBe(1);
    expect(model_clamp_seed(1e12)).toBe(99999999);
  });

  it('클램프를 거친 값은 언제나 검사를 통과한다', () => {
    for (const rawDoor of [-5, 3, 42, 1000]) {
      const doorCount = model_clamp_door_count(rawDoor);
      const openedCount = model_clamp_opened_count(1e6, doorCount);
      const trialCount = model_clamp_trial_count(0);
      expect(model_check_parameters(doorCount, openedCount, trialCount).ok).toBe(true);
    }
  });
});
