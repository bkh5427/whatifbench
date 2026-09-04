/**
 * 위젯의 순수 헬퍼 테스트 (DOM 없이 검증 가능한 부분만).
 * 슬라이더 로그 매핑과 URL 상태 왕복은 조용히 깨지면 알아채기 어려워서 고정해 둔다.
 */
import { describe, it, expect } from 'vitest';
import {
  MONTY_TRIAL_MIN,
  MONTY_TRIAL_MAX,
  MONTY_TRIAL_DEFAULT,
  MONTY_DOOR_MAX,
  MONTY_SEED_DEFAULT,
  sim_run_convergence,
  model_calculate_switch_advantage,
} from './model.js';
import {
  chart_calculate_scale,
  chart_calculate_plot_start,
  chart_calculate_tick_step,
  chart_calculate_x_ticks,
  state_calculate_verdict,
  display_calculate_tick_digits,
  display_format_percent,
  display_format_percent_tick,
  display_format_count,
  slider_calculate_trial_count,
  slider_calculate_trial_position,
  url_read_state,
} from './widget.js';

describe('시행 횟수 슬라이더 (1-2-5 눈금)', () => {
  const LAST_POSITION = 9; // TRIAL_STEP_LIST의 마지막 인덱스

  it('슬라이더 양 끝이 시행 횟수 최소·최대와 맞는다', () => {
    expect(slider_calculate_trial_count(0)).toBe(MONTY_TRIAL_MIN);
    expect(slider_calculate_trial_count(LAST_POSITION)).toBe(MONTY_TRIAL_MAX);
  });

  it('위치 → 횟수 → 위치 왕복이 정확히 유지된다', () => {
    for (let position = 0; position <= LAST_POSITION; position += 1) {
      const trialCount = slider_calculate_trial_count(position);
      expect(slider_calculate_trial_position(trialCount)).toBe(position);
    }
  });

  it('기본 시행 횟수가 슬라이더 눈금 위에 정확히 얹힌다', () => {
    const position = slider_calculate_trial_position(MONTY_TRIAL_DEFAULT);
    expect(slider_calculate_trial_count(position)).toBe(MONTY_TRIAL_DEFAULT);
  });

  it('모든 눈금이 10의 거듭제곱 라벨과 어긋나지 않는 값이다', () => {
    for (let position = 0; position <= LAST_POSITION; position += 1) {
      const trialCount = slider_calculate_trial_count(position);
      const mantissa = trialCount / Math.pow(10, Math.floor(Math.log10(trialCount)));
      expect([1, 2, 5]).toContain(Math.round(mantissa));
    }
  });

  it('단조 증가한다', () => {
    let previous = 0;
    for (let position = 0; position <= LAST_POSITION; position += 1) {
      const trialCount = slider_calculate_trial_count(position);
      expect(trialCount).toBeGreaterThan(previous);
      previous = trialCount;
    }
  });

  it('범위 밖 위치는 잘린다', () => {
    expect(slider_calculate_trial_count(-5)).toBe(MONTY_TRIAL_MIN);
    expect(slider_calculate_trial_count(999)).toBe(MONTY_TRIAL_MAX);
  });
});

describe('URL 상태', () => {
  it('쿼리스트링이 없으면 기본값을 준다', () => {
    const state = url_read_state('');
    expect(state.doorCount).toBe(3);
    expect(state.openedCount).toBe(1);
    expect(state.seed).toBe(MONTY_SEED_DEFAULT);
  });

  it('쿼리스트링 값을 읽는다', () => {
    const state = url_read_state('?doors=100&opened=98&trials=50000&seed=777');
    expect(state.doorCount).toBe(100);
    expect(state.openedCount).toBe(98);
    expect(state.trialCount).toBe(50000);
    expect(state.seed).toBe(777);
  });

  it('범위를 넘는 숫자는 유효범위 안으로 잘린다', () => {
    const state = url_read_state('?doors=99999&opened=99999&trials=99999999');
    expect(state.doorCount).toBe(MONTY_DOOR_MAX);
    expect(state.openedCount).toBe(MONTY_DOOR_MAX - 2);
    expect(state.trialCount).toBe(MONTY_TRIAL_MAX);
  });

  it('숫자가 아닌 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // 최솟값으로 떨어지면 공유 URL의 시드가 조용히 1이 되어 곡선이 달라진다.
    for (const search of ['?trials=abc&seed=xyz', '?trials=&seed=', '?trials=0x10&seed=1e5']) {
      const state = url_read_state(search);
      expect(state.trialCount).toBe(MONTY_TRIAL_DEFAULT);
      expect(state.seed).toBe(MONTY_SEED_DEFAULT);
    }
  });

  it('빈 문자열 파라미터도 기본값으로 돌아간다', () => {
    const state = url_read_state('?doors=&opened=&trials=&seed=');
    expect(state.doorCount).toBe(3);
    expect(state.openedCount).toBe(1);
    expect(state.trialCount).toBe(MONTY_TRIAL_DEFAULT);
    expect(state.seed).toBe(MONTY_SEED_DEFAULT);
  });

  it('문 개수가 줄면 K도 따라 잘린다', () => {
    const state = url_read_state('?doors=3&opened=50');
    expect(state.openedCount).toBe(1);
  });
});

describe('y축 자동 스케일', () => {
  // N이 커지면 승률이 1% 근처로 눌린다. 0~100% 고정 축이면 두 곡선이 바닥에 붙는다.
  function scale_read_for(doorCount, openedCount) {
    const result = sim_run_convergence(doorCount, openedCount, 10000, { seed: 20260904 });
    return { scale: chart_calculate_scale(result), result };
  }

  // 주의: chart_calculate_scale은 values에 이론값 2개를 먼저 넣고 min/max를 잡는다.
  // 따라서 "rateMin <= stayTheory" 류의 단언은 정의상 항상 참인 동어반복이다.
  // 실측 점을 실제로 반영하는지, 패딩이 있는지를 봐야 한다.

  it('축이 수렴 구간의 실측 점을 실제로 담는다 (이론값만 보고 정하지 않는다)', () => {
    for (const [doorCount, openedCount] of [[3, 1], [18, 2], [100, 1]]) {
      const { scale, result } = scale_read_for(doorCount, openedCount);
      const settled = result.points.filter((point) => point.trial >= result.trialCount * 0.1);
      expect(settled.length).toBeGreaterThan(0);
      for (const point of settled) {
        expect(point.stayWinRate).toBeGreaterThanOrEqual(scale.rateMin);
        expect(point.stayWinRate).toBeLessThanOrEqual(scale.rateMax);
        expect(point.switchWinRate).toBeGreaterThanOrEqual(scale.rateMin);
        expect(point.switchWinRate).toBeLessThanOrEqual(scale.rateMax);
      }
    }
  });

  it('축에 여백이 있다 — 데이터가 창에 딱 붙지 않는다', () => {
    for (const [doorCount, openedCount] of [[3, 1], [18, 2]]) {
      const { scale, result } = scale_read_for(doorCount, openedCount);
      const settled = result.points.filter((point) => point.trial >= result.trialCount * 0.1);
      const values = settled.flatMap((point) => [point.stayWinRate, point.switchWinRate]);
      const dataLow = Math.min(...values, result.stayWinRateTheory);
      const dataHigh = Math.max(...values, result.switchWinRateTheory);
      // 0/1에 눌리지 않은 쪽은 반드시 여유가 있어야 한다
      if (scale.rateMin > 0) expect(dataLow - scale.rateMin).toBeGreaterThan(0);
      if (scale.rateMax < 1) expect(scale.rateMax - dataHigh).toBeGreaterThan(0);
    }
  });

  it('불필요하게 0~100% 전체로 벌어지지 않는다', () => {
    // N=3,K=1의 실제 데이터 폭은 약 0.34. 창이 그 3배를 넘으면 확대가 무의미하다.
    const { scale, result } = scale_read_for(3, 1);
    const dataSpan = result.switchWinRateTheory - result.stayWinRateTheory;
    expect(scale.rateMax - scale.rateMin).toBeLessThan(dataSpan * 3);
  });

  it('N=100, K=1은 1% 근처를 확대한다', () => {
    const { scale } = scale_read_for(100, 1);
    expect(scale.rateMax).toBeLessThan(0.05);
  });

  it('N=100, K=98처럼 실제로 넓은 경우엔 넓은 축을 준다', () => {
    const { scale } = scale_read_for(100, 98);
    expect(scale.rateMax - scale.rateMin).toBeGreaterThan(0.9);
  });

  it('어떤 조합에서도 축이 유효하다', () => {
    for (const doorCount of [3, 5, 10, 25, 56, 100]) {
      for (const openedCount of [1, Math.max(1, doorCount - 2)]) {
        const { scale } = scale_read_for(doorCount, openedCount);
        expect(scale.rateMin).toBeGreaterThanOrEqual(0);
        expect(scale.rateMax).toBeLessThanOrEqual(1);
        expect(scale.rateMax).toBeGreaterThan(scale.rateMin);
        expect(scale.step).toBeGreaterThan(0);
        expect(Number.isFinite(scale.step)).toBe(true);
      }
    }
  });

  it('눈금 간격은 1-2-2.5-5 계열이다', () => {
    for (const span of [0.02, 0.05, 0.3, 0.9, 1]) {
      const step = chart_calculate_tick_step(span);
      const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)));
      expect([1, 2, 2.5, 5, 10]).toContain(Math.round(mantissa * 10) / 10);
    }
  });
});

describe('x축 시작점 — 초반 요동 잘라내기', () => {
  // 시행 초반 running average는 0~100%를 오간다. 확대된 축에서 그걸 그리면
  // 창 안팎을 넘나드는 세로 줄무늬만 남는다.
  function read_start(doorCount, openedCount, trialCount) {
    const result = sim_run_convergence(doorCount, openedCount, trialCount, { seed: 20260904 });
    const scale = chart_calculate_scale(result);
    return { result, scale, startTrial: chart_calculate_plot_start(result, scale) };
  }

  it('그린 구간의 모든 점이 축 범위 안에 있다', () => {
    for (const [doorCount, openedCount, trialCount] of [
      [3, 1, 10000],
      [18, 2, 50000],
      [100, 1, 100000],
      [10, 8, 20000],
    ]) {
      const { result, scale, startTrial } = read_start(doorCount, openedCount, trialCount);
      const drawn = result.points.filter((point) => point.trial >= startTrial);
      expect(drawn.length).toBeGreaterThan(0);
      for (const point of drawn) {
        expect(point.stayWinRate).toBeGreaterThanOrEqual(scale.rateMin);
        expect(point.stayWinRate).toBeLessThanOrEqual(scale.rateMax);
        expect(point.switchWinRate).toBeGreaterThanOrEqual(scale.rateMin);
        expect(point.switchWinRate).toBeLessThanOrEqual(scale.rateMax);
      }
    }
  });

  it('축이 넓으면(0~100%) 첫 시행부터 그린다', () => {
    const { startTrial } = read_start(100, 98, 10000);
    expect(startTrial).toBe(1);
  });

  it('x축 눈금은 양 끝을 항상 포함하고 단조 증가한다', () => {
    for (const [start, end] of [
      [1, 10000],
      [1628, 50000],
      [589, 100000],
      [900, 1000],
    ]) {
      const ticks = chart_calculate_x_ticks(start, end);
      expect(ticks[0]).toBe(start);
      expect(ticks[ticks.length - 1]).toBe(end);
      for (let i = 1; i < ticks.length; i += 1) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('구간이 넓으면 중간 거듭제곱 눈금이 들어간다', () => {
    expect(chart_calculate_x_ticks(1628, 50000)).toContain(10000);
    expect(chart_calculate_x_ticks(1, 100000).length).toBeGreaterThan(3);
  });

  it('startTrial=0 에서 멈추지 않는다 (log10(0)=-Infinity 무한루프)', () => {
    // 이 입력은 반환되지 않고 탭을 얼려버렸다. 예외가 아니라 hang이라 더 위험했다.
    const ticks = chart_calculate_x_ticks(0, 1000);
    expect(Array.isArray(ticks)).toBe(true);
    expect(ticks.length).toBeLessThan(10);
    for (const bad of [-5, Number.NaN]) {
      expect(Array.isArray(chart_calculate_x_ticks(bad, 1000))).toBe(true);
    }
  });

  it('시작과 끝이 같으면 눈금을 중복시키지 않는다', () => {
    expect(chart_calculate_x_ticks(1000, 1000)).toEqual([1000]);
  });
});

describe('판정 배너 — 사이트 시그니처', () => {
  // data-state가 안 붙어 hold/edge/break 색이 통째로 죽어 있었다.
  it('이득비를 hold / edge / break 로 가른다', () => {
    expect(state_calculate_verdict(2.0)).toBe('hold');
    expect(state_calculate_verdict(99)).toBe('hold');
    expect(state_calculate_verdict(1.5)).toBe('edge');
    expect(state_calculate_verdict(1.1)).toBe('edge');
    expect(state_calculate_verdict(1.01)).toBe('break');
    expect(state_calculate_verdict(1.0)).toBe('break');
  });

  it('3문 교과서 설정은 hold, 문만 늘린 설정은 break', () => {
    expect(state_calculate_verdict(model_calculate_switch_advantage(3, 1))).toBe('hold');
    expect(state_calculate_verdict(model_calculate_switch_advantage(100, 98))).toBe('hold');
    expect(state_calculate_verdict(model_calculate_switch_advantage(100, 1))).toBe('break');
  });

  it('판정은 이득비에 대해 단조롭다', () => {
    const order = { break: 0, edge: 1, hold: 2 };
    let previous = -1;
    for (const advantage of [1, 1.05, 1.1, 1.5, 1.99, 2, 5, 50]) {
      const rank = order[state_calculate_verdict(advantage)];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe('표시 형식', () => {
  it('백분율은 소수 한 자리다', () => {
    expect(display_format_percent(2 / 3)).toBe('66.7%');
    expect(display_format_percent(0.99)).toBe('99.0%');
    expect(display_format_percent(0.25)).toBe('25.0%');
  });

  it('작은 승률은 두 자리로 보여 1.01% vs 1.00%가 구분된다', () => {
    expect(display_format_percent(99 / (100 * 98))).toBe('1.01%');
    expect(display_format_percent(0.01)).toBe('1.00%');
  });

  it('큰 수는 천 단위로 끊는다', () => {
    expect(display_format_count(1000000)).toBe('1,000,000');
  });

  it('축 눈금은 소수점 없이 짧게 나온다 (y축 라벨 잘림 방지)', () => {
    expect(display_format_percent_tick(1)).toBe('100%');
    expect(display_format_percent_tick(0)).toBe('0%');
    expect(display_format_percent_tick(0.25)).toBe('25%');
  });

  it('눈금 라벨이 간격의 정밀도를 그대로 표기한다 — 반올림해서 거짓말하지 않는다', () => {
    // step=2.5%p에서 7.5%가 "8%"로 나가던 버그. 화면의 숫자가 실제 값과 달랐다.
    expect(display_format_percent_tick(0.075, 0.025)).toBe('7.5%');
    expect(display_format_percent_tick(0.125, 0.025)).toBe('12.5%');
    expect(display_format_percent_tick(0.05, 0.025)).toBe('5.0%');
    expect(display_format_percent_tick(0.0175, 0.0025)).toBe('1.75%');
    expect(display_format_percent_tick(0.1, 0.01)).toBe('10%');
  });

  it('눈금 자릿수는 간격을 오차 없이 표기하는 최소 자릿수다', () => {
    expect(display_calculate_tick_digits(0.01)).toBe(0); // 1%p
    expect(display_calculate_tick_digits(0.025)).toBe(1); // 2.5%p
    expect(display_calculate_tick_digits(0.0025)).toBe(2); // 0.25%p
    expect(display_calculate_tick_digits(0.05)).toBe(0); // 5%p
  });

  it('모든 실제 축 조합에서 눈금 라벨이 실제 값과 일치한다', () => {
    for (const [doorCount, openedCount, trialCount] of [
      [3, 1, 10000],
      [18, 8, 50000],
      [18, 2, 50000],
      [56, 1, 10000],
      [100, 1, 100000],
      [100, 98, 10000],
      [25, 5, 1000],
    ]) {
      const result = sim_run_convergence(doorCount, openedCount, trialCount, { seed: 20260904 });
      const scale = chart_calculate_scale(result);
      const firstTick = Math.ceil(scale.rateMin / scale.step) * scale.step;
      const tickCount = Math.floor((scale.rateMax - firstTick) / scale.step);
      for (let i = 0; i <= tickCount; i += 1) {
        const value = firstTick + scale.step * i;
        const label = display_format_percent_tick(value, scale.step);
        // 라벨을 다시 숫자로 읽었을 때 실제 눈금값과 같아야 한다
        expect(Math.abs(parseFloat(label) - value * 100)).toBeLessThan(1e-6);
      }
    }
  });
});
