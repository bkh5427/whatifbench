/**
 * 종이접기 위젯 테스트 — 순수 함수만.
 *
 * 이 위젯에서 눈으로는 절대 못 잡는 것이 하나 있다:
 * **자 위에서 한 번 접기가 차지하는 거리가 언제나 같아야 한다.**
 * 자의 범위를 데이터에 맞춰 자동 조정하는 순간 이 성질이 깨지는데,
 * 화면은 여전히 멀쩡해 보인다. 그래서 여기서 못박는다.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RAIL_LOW_M,
  RAIL_HIGH_M,
  BADGE_MIN_DWELL_MS,
  rail_calculate_x,
  rail_calculate_fold_step_px,
  rail_calculate_label_stride,
  rail_calculate_decade_gap_px,
  rail_pick_decade_labels,
  rail_render,
  rail_format_note,
  RAIL_LEGEND_COMB_TEXT,
  cursor_calculate_position,
  cursor_start_travel,
  badge_create_gate,
  chart_calculate_scale,
  chart_calculate_y,
  chart_calculate_flat_until,
  chart_render_thickness,
  display_format_axis_value,
  display_format_crossing,
  display_format_table_caption,
  display_format_reference_phrase,
  display_describe_length_scale,
  chart_format_note,
  url_read_state,
} from './widget.js';
import {
  FOLD_THICKNESS_MIN_MM,
  FOLD_THICKNESS_MAX_MM,
  FOLD_THICKNESS_DEFAULT_MM,
  FOLD_THICKNESS_STEP_MM,
  FOLD_COUNT_DEFAULT,
  FOLD_COUNT_MAX,
  FOLD_REFERENCE_LIST,
  model_calculate_thickness_m,
  model_calculate_length_required_m,
  model_read_last_passed,
  model_read_next_target,
  model_build_series,
  model_build_crossings,
} from './model.js';
import { logscale_build_decades } from '../_shared/logscale.js';

const PLOT_LEFT = 18;
const PLOT_WIDTH = 834;
/** 광과민성 여유 — 화면이 초당 이보다 많이 바뀌면 안 된다. */
const PHOTOSENSITIVE_MAX_PER_SECOND = 3;

/** 자 캔버스 좌우 여백. 프로덕션 상수와 같아야 plotWidth 계산이 맞는다. */
const RAIL_PAD_X = 18;
/** `.wrap` 최대 폭 60rem과 좌우 padding 1.25rem — 뷰포트에서 plotWidth를 낸다. */
const WRAP_MAX_PX = 960;
const WRAP_PAD_PX = 20;
/**
 * 데케이드 라벨 최소 간격(px). **프로덕션 상수를 import하지 않고 리터럴로 박는다** —
 * 상수를 그 상수로 재면 34를 10으로 바꿔도 통과한다.
 */
const DECADE_LABEL_MIN_GAP_PX = 34;
/** 실측 대상 뷰포트. 감사에서 실제로 라벨이 붙었던 폭들을 포함한다. */
const VIEWPORTS_PX = [320, 360, 375, 430, 600, 900, 1200];

// ── 자 렌더를 직접 돌리기 위한 캔버스 스텁 ────────────────────
// DOM이 없으므로 호출을 기록만 하는 컨텍스트를 넣는다. 실제로 칠하지 않아도
// **어떤 글자가 어느 x에 찍혔는지**는 전부 남는다 — 라벨 간격은 그것으로 잰다.
function rail_build_canvas(plotWidth) {
  const texts = [];
  const noop = () => {};
  const context = {
    texts,
    setTransform: noop, clearRect: noop, save: noop, restore: noop, rotate: noop,
    translate: noop, scale: noop, fill: noop, stroke: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, closePath: noop, arc: noop, fillRect: noop,
    rect: noop, clip: noop, setLineDash: noop,
    measureText: (text) => ({ width: text.length * 6 }),
    fillText: (text, x, y) => texts.push({ text, x, y }),
    font: '', textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '',
    lineWidth: 0, lineJoin: '', lineCap: '', globalAlpha: 1,
  };
  return {
    clientWidth: plotWidth + RAIL_PAD_X * 2,
    width: 0, height: 0, style: {}, context,
    getContext: () => context,
  };
}

function rail_calculate_plot_width(viewportPx) {
  return Math.min(viewportPx, WRAP_MAX_PX) - WRAP_PAD_PX * 2 - RAIL_PAD_X * 2;
}

/**
 * 자 위에서 실제로 찍힌 데케이드 라벨의 x들.
 *
 * 자에는 글자 줄이 셋이다 — 맨 위 커서 값, 띠 아래 데케이드 라벨, 아이콘 아래
 * 기준점 이름표. **줄을 y 임계로 짐작하지 않는다**: 이름표 줄이 생겼을 때
 * `y > 10`이 그것까지 함께 세어 개수 단언이 조용히 어긋났다.
 * 렌더가 자기가 쓴 줄의 y를 돌려주므로 그것으로 정확히 고른다.
 */
function rail_read_label_xs(canvas, drawn) {
  return canvas.context.texts.filter((entry) => entry.y === drawn.decadeLabelY).map((entry) => entry.x);
}

function rail_calculate_min_gap(positions) {
  if (positions.length < 2) return Infinity;
  let smallest = Infinity;
  for (let i = 1; i < positions.length; i += 1) {
    smallest = Math.min(smallest, positions[i] - positions[i - 1]);
  }
  return smallest;
}

describe('로그 자 — 한 번 접기는 언제나 같은 거리다', () => {
  it('50번 접는 동안 마커가 움직이는 거리가 전부 같다', () => {
    for (const thicknessMm of [FOLD_THICKNESS_MIN_MM, 0.1, 0.33, FOLD_THICKNESS_MAX_MM]) {
      const xs = [];
      for (let fold = 0; fold <= FOLD_COUNT_MAX; fold += 1) {
        xs.push(rail_calculate_x(model_calculate_thickness_m(thicknessMm, fold), PLOT_LEFT, PLOT_WIDTH).x);
      }
      const gaps = xs.slice(1).map((x, i) => x - xs[i]);
      const first = gaps[0];
      for (const gap of gaps) expect(gap).toBeCloseTo(first, 9);
      // 그리고 그 거리는 자가 스스로 말하는 값과 같아야 한다
      expect(first).toBeCloseTo(rail_calculate_fold_step_px(PLOT_WIDTH), 9);
    }
  });

  it('초기 두께를 바꿔도 한 칸의 크기는 그대로다 — 자는 데이터를 따라가지 않는다', () => {
    // 자의 범위를 데이터에 맞추면 여기서 갈라진다. 그것이 이 테스트의 목적.
    const thin = rail_calculate_x(model_calculate_thickness_m(0.05, 10), PLOT_LEFT, PLOT_WIDTH).x;
    const thin1 = rail_calculate_x(model_calculate_thickness_m(0.05, 11), PLOT_LEFT, PLOT_WIDTH).x;
    const thick = rail_calculate_x(model_calculate_thickness_m(0.5, 10), PLOT_LEFT, PLOT_WIDTH).x;
    const thick1 = rail_calculate_x(model_calculate_thickness_m(0.5, 11), PLOT_LEFT, PLOT_WIDTH).x;
    expect(thin1 - thin).toBeCloseTo(thick1 - thick, 9);
  });

  it('한 칸은 폭에 비례한다', () => {
    expect(rail_calculate_fold_step_px(834)).toBeCloseTo(rail_calculate_fold_step_px(417) * 2, 9);
    expect(rail_calculate_fold_step_px(0)).toBe(0);
  });

  it('자의 양 끝과 한 칸의 픽셀 폭이 못박혀 있다', () => {
    // 자의 범위를 바꾸면 접기 한 칸의 픽셀 폭이 통째로 달라지는데,
    // "간격이 전부 같다"류의 단언은 범위가 무엇이든 전부 통과한다.
    // 등간격 성질과 별개로 **값 자체**를 리터럴로 고정한다.
    expect(RAIL_LOW_M).toBe(1e-5);
    expect(RAIL_HIGH_M).toBe(1e12);
    // 10⁻⁵~10¹²는 17데케이드. 한 칸 = log10(2)/17 × 폭.
    expect(rail_calculate_fold_step_px(PLOT_WIDTH)).toBeCloseTo((PLOT_WIDTH * Math.log10(2)) / 17, 9);
    expect(rail_calculate_fold_step_px(834)).toBeCloseTo(14.7682, 3);
  });

  it('슬라이더가 낼 수 있는 가장 얇은 값과 가장 두꺼운 값이 자 안에 있다', () => {
    // 자의 왼쪽 끝이 t₀보다 두꺼우면 n=0 마커가 띠 밖으로 나간다.
    // 왼쪽만 새는 비대칭 결함이라 눈으로는 잘 안 보인다.
    const thinnest = rail_calculate_x(model_calculate_thickness_m(FOLD_THICKNESS_MIN_MM, 0), PLOT_LEFT, PLOT_WIDTH);
    const thickest = rail_calculate_x(
      model_calculate_thickness_m(FOLD_THICKNESS_MAX_MM, FOLD_COUNT_MAX),
      PLOT_LEFT,
      PLOT_WIDTH,
    );
    expect(thinnest.clipped).toBe('inside');
    expect(thickest.clipped).toBe('inside');
    expect(thinnest.x).toBeGreaterThan(PLOT_LEFT);
    expect(thickest.x).toBeLessThan(PLOT_LEFT + PLOT_WIDTH);
  });

  it('모든 기준점도 자 안에 있다 — 밖이면 점이 끝에 뭉친다', () => {
    for (const item of FOLD_REFERENCE_LIST) {
      const spot = rail_calculate_x(item.metres, PLOT_LEFT, PLOT_WIDTH);
      expect(spot).not.toBe(null);
      expect(spot.clipped).toBe('inside');
    }
  });

  it('유효하지 않은 값에서 NaN 좌표를 만들지 않는다', () => {
    expect(rail_calculate_x(0, PLOT_LEFT, PLOT_WIDTH)).toBe(null);
    expect(rail_calculate_x(-1, PLOT_LEFT, PLOT_WIDTH)).toBe(null);
    expect(rail_calculate_x(NaN, PLOT_LEFT, PLOT_WIDTH)).toBe(null);
  });

  it('좁은 화면에서는 데케이드 라벨을 몇 칸씩 건너뛴다', () => {
    expect(rail_calculate_label_stride(834, 18)).toBe(1); // 데스크톱은 전부 찍는다
    expect(rail_calculate_label_stride(285, 18)).toBeGreaterThan(1); // 모바일은 솎는다
    expect(rail_calculate_label_stride(0, 18)).toBe(1);
    expect(rail_calculate_label_stride(834, 1)).toBe(1);
  });
});

describe('데케이드 라벨 간격 — stride만으로는 마지막 두 개가 붙는다', () => {
  const decades = logscale_build_decades(RAIL_LOW_M, RAIL_HIGH_M);

  it('데케이드 한 칸의 픽셀 폭', () => {
    expect(decades).toHaveLength(18);
    expect(rail_calculate_decade_gap_px(299, 18)).toBeCloseTo(299 / 17, 9);
    expect(rail_calculate_decade_gap_px(0, 18)).toBe(0);
    expect(rail_calculate_decade_gap_px(299, 1)).toBe(0);
  });

  it('뷰포트 7종 어디서도 라벨이 34px보다 가까이 붙지 않는다', () => {
    // 고치기 전에는 stride가 마지막 데케이드를 건너뛰는데도 마지막 하나가
    // 무조건 밀려 들어와, 375px에서 10¹¹과 10¹²가 17.6px 간격으로 붙었다.
    // 11px 폰트의 "10¹¹"이 약 19~21px이므로 화면에서 실제로 겹친다.
    for (const viewportPx of VIEWPORTS_PX) {
      const plotWidth = rail_calculate_plot_width(viewportPx);
      const gapPx = rail_calculate_decade_gap_px(plotWidth, decades.length);
      const kept = rail_pick_decade_labels(plotWidth, decades);
      const positions = kept.map((power) => decades.indexOf(power) * gapPx);
      expect(rail_calculate_min_gap(positions)).toBeGreaterThanOrEqual(DECADE_LABEL_MIN_GAP_PX);
      // 양 끝은 언제나 남는다 — 자의 범위를 모르면 위치를 읽을 수 없다
      expect(kept[0]).toBe(-5);
      expect(kept[kept.length - 1]).toBe(12);
    }
  });

  it('폭 60~1000px 어디에서도 34px보다 붙지 않는다 — CSS가 바뀌어도 성립해야 한다', () => {
    // 뷰포트 7종만 재면 `.wrap`·`.widget`의 padding이 바뀌는 순간 검사가 헛돈다
    // (실제 자 폭은 감사 추정치보다 좁다: 375px 화면에서 299가 아니라 249다).
    // 그래서 폭 자체를 훑는다. 양 끝은 언제나 남으므로 이것이 진짜 불변식이다.
    let worstGap = Infinity;
    for (let plotWidth = 60; plotWidth <= 1000; plotWidth += 1) {
      const gapPx = rail_calculate_decade_gap_px(plotWidth, decades.length);
      const kept = rail_pick_decade_labels(plotWidth, decades);
      expect(kept[0]).toBe(-5);
      expect(kept[kept.length - 1]).toBe(12);
      const positions = kept.map((power) => decades.indexOf(power) * gapPx);
      worstGap = Math.min(worstGap, rail_calculate_min_gap(positions));
    }
    expect(worstGap).toBeGreaterThanOrEqual(DECADE_LABEL_MIN_GAP_PX);
    // 가장 빠듯한 폭에서 딱 34.0이 나온다. 여유를 못박아 두면 상수를 20으로
    // 낮춰도 통과하므로, 하한에 닿는다는 사실 자체를 적는다.
    expect(worstGap).toBeCloseTo(DECADE_LABEL_MIN_GAP_PX, 9);
  });

  it('남는 라벨 목록 자체를 못박는다 — 개수만 세면 무엇을 버렸는지 안 보인다', () => {
    // 실제 출력을 받아 적은 값이다. 버리는 쪽이 "가운데부터"인지 여기서 드러난다:
    // 375px에서 사라지는 것은 끝(10¹²)이 아니라 그 앞의 10¹¹이다.
    expect(rail_pick_decade_labels(rail_calculate_plot_width(320), decades)).toEqual([-5, -2, 1, 4, 7, 12]);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(360), decades)).toEqual([-5, -2, 1, 4, 7, 12]);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(375), decades)).toEqual([-5, -3, -1, 1, 3, 5, 7, 9, 12]);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(430), decades)).toEqual([-5, -3, -1, 1, 3, 5, 7, 9, 12]);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(600), decades)).toEqual([-5, -3, -1, 1, 3, 5, 7, 9, 12]);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(900), decades)).toEqual(decades);
    expect(rail_pick_decade_labels(rail_calculate_plot_width(1200), decades)).toEqual(decades);
  });

  it('렌더가 실제로 찍는 라벨도 34px 이상 떨어져 있다 — 호출부가 검사를 우회하면 여기서 죽는다', () => {
    // 위의 테스트는 고르는 함수만 본다. 자가 그 함수를 안 쓰고 예전처럼
    // stride만으로 찍으면 그 테스트는 통과한다. 그래서 그린 결과를 직접 잰다.
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    const cursorMetres = series[series.length - 1].thicknessM;
    for (const viewportPx of VIEWPORTS_PX) {
      const plotWidth = rail_calculate_plot_width(viewportPx);
      const canvas = rail_build_canvas(plotWidth);
      const drawn = rail_render(canvas, { series, cursorMetres });
      const xs = rail_read_label_xs(canvas, drawn);
      expect(xs.length).toBe(drawn.labelledDecades.length);
      expect(rail_calculate_min_gap(xs)).toBeGreaterThanOrEqual(DECADE_LABEL_MIN_GAP_PX);
    }
  });
});

describe('자 캡션 — 빗살 개수와 스텝 개수는 다르다', () => {
  it('42번 접으면 빗살은 43개이고 그 사이 칸이 42개다', () => {
    // fold 0(안 접은 낱장) 자리에도 빗살이 있다. 계열 길이를 그대로 "steps"로
    // 적으면 기본값에서 캡션이 43이라고 말하는데 화면의 칸은 42개다.
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const drawn = rail_render(canvas, { series, cursorMetres: series[series.length - 1].thicknessM });
    expect(series).toHaveLength(43);
    expect(drawn.foldTickCount).toBe(43);
    expect(drawn.foldStepCount).toBe(42);
    expect(drawn.foldStepCount).toBe(FOLD_COUNT_DEFAULT);
  });

  it('캡션은 렌더가 돌려준 값만 인용한다 — 문장 전체를 골든으로 박는다', () => {
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const drawn = rail_render(canvas, { series, cursorMetres: series[series.length - 1].thicknessM });
    // 실제 출력을 받아 적은 문장이다. 예측해서 쓰지 않았다.
    expect(rail_format_note(drawn)).toBe(
      'Rail fixed at 10⁻⁵ to 10¹² metres — it never rescales. ' +
        'One fold moves the marker 14.8 px, the same at every setting, ' +
        'and 43 ticks are drawn above it, with 42 equal steps between them. ' +
        'Each small drawing under the rail is one row of the table below, in the same order.',
    );
  });

  it('빗살이 하나뿐이어도 문장이 단수를 안다 — "1 ticks"가 나가지 않는다', () => {
    // 접기 0회는 슬라이더의 최솟값이다. 기본 상태 바로 옆에서 나가던 문장이다.
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, 0);
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const drawn = rail_render(canvas, { series, cursorMetres: series[0].thicknessM });
    expect(drawn.foldTickCount).toBe(1);
    expect(drawn.foldStepCount).toBe(0);
    const note = rail_format_note(drawn);
    expect(note).toContain('1 tick is drawn above it, with 0 equal steps between them');
    expect(note).not.toContain('1 ticks');
  });

  it('빗살이 자 밖으로 잘리면 두 숫자가 같이 줄어든다', () => {
    // 잘린 빗살은 그려지지 않는다. 캡션이 계열 길이를 인용하면 화면에 없는
    // 빗살까지 세게 된다. 두께는 단조증가라 잘리는 것은 언제나 양 끝쪽이다.
    const series = [1e-9, 1e-8, 1e-4, 1e-3, 1e20].map((thicknessM, fold) => ({ fold, thicknessM }));
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const drawn = rail_render(canvas, { series, cursorMetres: 1e-3 });
    expect(drawn.foldTickCount).toBe(2); // 10⁻⁴와 10⁻³만 자 안에 있다
    expect(drawn.foldStepCount).toBe(1);
    expect(rail_format_note(drawn)).toContain('2 ticks are drawn above it, with 1 equal step between them');
  });

  it('범례가 빗살을 접기 횟수와 같다고 말하지 않는다', () => {
    // 'Ticks — one per fold'는 캡션과 똑같이 하나를 덜 센다. fold 0에도 빗살이 있다.
    expect(RAIL_LEGEND_COMB_TEXT).not.toMatch(/one per fold/i);
    expect(RAIL_LEGEND_COMB_TEXT).toMatch(/flat sheet/i);
    expect(RAIL_LEGEND_COMB_TEXT).toMatch(/fold/i);
  });

  it('빗살이 하나도 안 그려져도 스텝이 음수가 되지 않는다', () => {
    const series = [{ fold: 0, thicknessM: 1e-9 }];
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const drawn = rail_render(canvas, { series, cursorMetres: 1e-9 });
    expect(drawn.foldTickCount).toBe(0);
    expect(drawn.foldStepCount).toBe(0);
  });
});

describe('판정 배너 — 판정 3색은 이 위젯의 것이 아니다', () => {
  // 렌더 뒤에 실제로 `data-state`가 붙었는지는 `lifecycle.test.js`가 본다.
  // 여기서 소스 문자열을 훑던 앞선 판본은 `setAttribute('data-state', …)`로
  // 우회됐다 — **소스가 아니라 DOM을 봐야 한다.** 이 파일에는 그 판단의 근거만 남긴다.
  it('이 위젯에는 "파탄" 상태가 아예 없다 — 슬라이더 전 구간에서 모델이 답을 낸다', () => {
    // 위 판단의 근거다. 두께 슬라이더 어디에서도 달은 접기 상한 안에 들어온다.
    // 상한을 넘기는 기준(태양 등)은 배너가 아니라 표가 "try thicker paper"로 적는다.
    let minFolds = Infinity;
    let maxFolds = -Infinity;
    let settings = 0;
    for (let mm = FOLD_THICKNESS_MIN_MM; mm <= FOLD_THICKNESS_MAX_MM + 1e-9; mm += FOLD_THICKNESS_STEP_MM) {
      const moon = model_build_crossings(Number(mm.toFixed(2)), FOLD_COUNT_MAX)
        .find((row) => row.key === 'moon');
      expect(moon.reachable).toBe(true);
      minFolds = Math.min(minFolds, moon.folds);
      maxFolds = Math.max(maxFolds, moon.folds);
      settings += 1;
    }
    // 실측값을 리터럴로 박는다. "언제나 reachable"만으로는 상한이 5000이 되어도 통과한다.
    expect(settings).toBe(46);
    expect(minFolds).toBe(40);
    expect(maxFolds).toBe(43);
    expect(FOLD_COUNT_MAX).toBe(50);
    expect(maxFolds).toBeLessThan(FOLD_COUNT_MAX);
  });
});

describe('차트 y축 — 여기는 반대로 데이터를 따라간다', () => {
  it('선형 축은 0에서 시작한다 — 바닥을 자르면 이 축의 논지가 사라진다', () => {
    const scale = chart_calculate_scale(model_build_series(0.1, 42), 'linear');
    expect(scale.kind).toBe('linear');
    expect(scale.low).toBe(0);
    expect(scale.high).toBeGreaterThan(model_calculate_thickness_m(0.1, 42));
  });

  it('로그 축은 데이터 범위를 그대로 쓴다', () => {
    const series = model_build_series(0.1, 42);
    const scale = chart_calculate_scale(series, 'log');
    expect(scale.kind).toBe('log');
    expect(scale.low).toBeCloseTo(series[0].thicknessM, 12);
    expect(scale.high).toBeCloseTo(series[series.length - 1].thicknessM, 12);
  });

  it('n=0이면 점이 하나뿐이라 로그 스팬이 0이 된다 — 최소 폭을 준다', () => {
    const scale = chart_calculate_scale(model_build_series(0.1, 0), 'log');
    expect(scale.high).toBeGreaterThan(scale.low);
    const y = chart_calculate_y(model_calculate_thickness_m(0.1, 0), scale, 18, 200);
    expect(Number.isFinite(y)).toBe(true); // NaN 좌표면 아무것도 안 그려진다
  });

  it('축 범위 밖이나 0 이하는 null이다', () => {
    const scale = chart_calculate_scale(model_build_series(0.1, 10), 'log');
    expect(chart_calculate_y(0, scale, 18, 200)).toBe(null);
    expect(chart_calculate_y(-5, scale, 18, 200)).toBe(null);
    expect(chart_calculate_y(NaN, scale, 18, 200)).toBe(null);
    expect(chart_calculate_y(1, null, 18, 200)).toBe(null);
  });

  it('y가 위로 갈수록 작아진다 (캔버스 좌표)', () => {
    const series = model_build_series(0.1, 42);
    const scale = chart_calculate_scale(series, 'log');
    const low = chart_calculate_y(series[0].thicknessM, scale, 18, 200);
    const high = chart_calculate_y(series[42].thicknessM, scale, 18, 200);
    expect(high).toBeLessThan(low);
  });

  it('선형 축에서 곡선이 바닥에 눌리는 구간을 세어 캡션에 넘긴다', () => {
    const series = model_build_series(0.1, 42);
    const scale = chart_calculate_scale(series, 'linear');
    const flat = chart_calculate_flat_until(series, scale, 18, 200);
    // 이 값이 캡션에 그대로 인쇄된다. 범위만 걸면 "1픽셀 안"이라는 판정 기준을
    // 3픽셀로 바꿔도(=34가 36이 되어도) 통과한다. 값을 못박는다.
    //
    // 200px 높이·상단 여백 8%의 축에서 t ≤ 축상단/200이면 0과 1픽셀 안이다.
    // 0.1 mm × 2ⁿ이 그 아래인 마지막 n이 34다.
    expect(flat).toBe(34);
    // 축을 두 배로 늘려 잡으면 1픽셀에 해당하는 두께도 두 배가 되어 한 칸 늘어난다
    expect(chart_calculate_flat_until(series, scale, 18, 400)).toBe(33);
  });

  it('로그 축에서는 눌리는 구간이라는 개념이 없다', () => {
    const series = model_build_series(0.1, 42);
    const scale = chart_calculate_scale(series, 'log');
    expect(chart_calculate_flat_until(series, scale, 18, 200)).toBe(null);
  });
});

describe('교차표 문구', () => {
  it('접기 전부터 두꺼우면 "0번"이 아니라 그렇게 적는다', () => {
    // t₀ = 0.5 mm는 모래알(0.063 mm)보다 이미 두껍다. "0 folds"로 찍으면
    // "한 번도 안 접고 넘는다"가 아니라 "접으면 넘는다"로 읽힌다.
    const sand = model_build_crossings(0.5, FOLD_COUNT_MAX).find((row) => row.key === 'sand');
    expect(sand.folds).toBe(0);
    expect(display_format_crossing(sand, FOLD_COUNT_MAX).text).toBe('already thicker');
  });

  it('슬라이더 밖이면 그 사실을 적는다', () => {
    const sun = model_build_crossings(0.1, FOLD_COUNT_MAX).find((row) => row.key === 'sun');
    expect(sun.reachable).toBe(false);
    expect(display_format_crossing(sun, FOLD_COUNT_MAX).text).toContain('try thicker paper');
  });

  it('캡션이 무엇을 비교하라는 표인지와 상한을 미리 말한다', () => {
    // 제목만 있으면 독자는 열여덟 줄을 훑고 아무 결론 없이 지나간다.
    // 상한을 인자로 받아 쓰는지도 같이 본다 — 손으로 적으면 여기서 죽는다.
    const caption = display_format_table_caption();
    expect(caption).toContain(`The slider stops at ${FOLD_COUNT_MAX} folds`);
    // 상한을 넘는 행이 막다른 골목으로 읽히면 안 된다 — 캡션이 빠져나갈 길을 준다.
    expect(caption).toContain('thickness slider brings them back into reach');
    expect(caption).toMatch(/heights climb by huge factors/);
    expect(display_format_table_caption(7)).toContain('stops at 7 folds');
  });

  it('닿는 것은 숫자만 적는다', () => {
    const moon = model_build_crossings(0.1, FOLD_COUNT_MAX).find((row) => row.key === 'moon');
    expect(display_format_crossing(moon, FOLD_COUNT_MAX).text).toBe('42');
  });
});

describe('URL 상태', () => {
  it('없으면 기본값으로 로드된다 — 빈 화면이 뜨지 않는다', () => {
    expect(url_read_state('')).toEqual({
      thicknessMm: FOLD_THICKNESS_DEFAULT_MM,
      foldCount: FOLD_COUNT_DEFAULT,
      axisKind: 'linear',
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // 최솟값으로 떨어지면 공유한 링크가 다른 그림을 낸다.
    expect(url_read_state('?mm=&folds=0x10&axis=abc')).toEqual({
      thicknessMm: FOLD_THICKNESS_DEFAULT_MM,
      foldCount: FOLD_COUNT_DEFAULT,
      axisKind: 'linear',
    });
  });

  it('정상 값을 읽고 범위로 자른다', () => {
    expect(url_read_state('?mm=0.5&folds=50&axis=1')).toEqual({
      thicknessMm: 0.5,
      foldCount: 50,
      axisKind: 'log',
    });
    expect(url_read_state('?mm=99&folds=999').thicknessMm).toBe(FOLD_THICKNESS_MAX_MM);
    expect(url_read_state('?mm=99&folds=999').foldCount).toBe(FOLD_COUNT_MAX);
  });

  it('축 값이 1이 아니면 선형이다', () => {
    expect(url_read_state('?axis=0').axisKind).toBe('linear');
    expect(url_read_state('?axis=7').axisKind).toBe('linear');
    expect(url_read_state('?axis=1').axisKind).toBe('log');
  });
});

describe('마커 이동 — 보간은 로그 공간에서 한다', () => {
  it('양 끝이 정확히 시작값과 목표값이다', () => {
    expect(cursor_calculate_position(1e-4, 1e8, 0)).toBeCloseTo(1e-4, 12);
    expect(cursor_calculate_position(1e-4, 1e8, 1)).toBeCloseTo(1e8, 6);
  });

  it('중간 지점이 로그 중앙 쪽에 있다 — 선형 보간이면 훨씬 작다', () => {
    // 1e-4 → 1e8의 로그 중앙은 1e2. 선형 보간이면 같은 지점에서 5e7 근처가 나온다.
    // ease-out이라 절반 시점은 로그 중앙보다 이미 앞서 있다.
    const half = cursor_calculate_position(1e-4, 1e8, 0.5);
    expect(half).toBeGreaterThan(1e2);
    expect(half).toBeLessThan(1e8);
    // 선형 보간이었다면 이 값보다 압도적으로 컸을 것이다
    expect(half).toBeLessThan(5e7);
  });

  it('자 위에서 매 프레임이 앞으로만 간다 — 되돌아가면 눈에 띈다', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const metres = cursor_calculate_position(1e-4, 1e8, i / 20);
      const x = rail_calculate_x(metres, PLOT_LEFT, PLOT_WIDTH).x;
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('뒤로 가는 이동도 같은 방식으로 다룬다', () => {
    expect(cursor_calculate_position(1e8, 1e-4, 0)).toBeCloseTo(1e8, 6);
    expect(cursor_calculate_position(1e8, 1e-4, 1)).toBeCloseTo(1e-4, 12);
  });

  it('ratio가 범위를 벗어나거나 값이 0 이하면 목표값을 그대로 준다', () => {
    expect(cursor_calculate_position(1e-4, 1e8, -1)).toBeCloseTo(1e-4, 12);
    expect(cursor_calculate_position(1e-4, 1e8, 99)).toBeCloseTo(1e8, 6);
    expect(cursor_calculate_position(0, 1e8, 0.5)).toBe(1e8);
    expect(cursor_calculate_position(1e-4, 0, 0.5)).toBe(0);
    expect(cursor_calculate_position(NaN, 1e8, 0.5)).toBe(1e8);
  });
});

describe('마커 이동 루프 — 시계를 주입해 프레임을 직접 민다', () => {
  function make_clock() {
    let stamp = 0;
    const queue = [];
    return {
      now: () => stamp,
      schedule: (callback) => queue.push(callback),
      cancel: (handle) => { queue[handle - 1] = null; },
      tick(ms) {
        stamp += ms;
        const due = queue.splice(0).filter(Boolean);
        for (const callback of due) callback(stamp);
      },
      pending: () => queue.filter(Boolean).length,
    };
  }

  it('프레임이 여러 번 그려진다 — 한 번에 점프하면 이 테스트가 죽는다', () => {
    const clock = make_clock();
    const seen = [];
    cursor_start_travel({
      fromMetres: 1e-4, toMetres: 1e8, durationMs: 420,
      now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
      onStep: (m) => seen.push(m),
    });
    for (let i = 0; i < 40 && clock.pending(); i += 1) clock.tick(16);
    expect(seen.length).toBeGreaterThan(5);
    expect(seen[seen.length - 1]).toBeCloseTo(1e8, 6);
  });

  it('중간값이 시작과 목표 사이에 있고 뒤로 가지 않는다', () => {
    const clock = make_clock();
    const seen = [];
    cursor_start_travel({
      fromMetres: 1e-4, toMetres: 1e8, durationMs: 420,
      now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
      onStep: (m) => seen.push(m),
    });
    clock.tick(16); clock.tick(16); clock.tick(16);
    for (const metres of seen) {
      expect(metres).toBeGreaterThan(1e-4);
      expect(metres).toBeLessThan(1e8);
    }
    expect(seen[0]).toBeLessThan(seen[1]);
    expect(seen[1]).toBeLessThan(seen[2]);
  });

  it('취소하면 더 그리지 않고 끝 알림도 안 온다. 두 번 불러도 안전하다', () => {
    const clock = make_clock();
    let steps = 0;
    let done = 0;
    const stop = cursor_start_travel({
      fromMetres: 1e-4, toMetres: 1e8, durationMs: 420,
      now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
      onStep: () => { steps += 1; }, onDone: () => { done += 1; },
    });
    clock.tick(16);
    const after = steps;
    stop();
    stop();
    clock.tick(16); clock.tick(16);
    expect(steps).toBe(after);
    expect(done).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it('시간이 0이면 목표값으로 한 번만 부르고 끝난다 — reduced-motion·숨긴 탭', () => {
    const clock = make_clock();
    const seen = [];
    let done = 0;
    cursor_start_travel({
      fromMetres: 1e-4, toMetres: 1e8, durationMs: 0,
      now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
      onStep: (m) => seen.push(m), onDone: () => { done += 1; },
    });
    expect(seen).toEqual([1e8]);
    expect(done).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  it('유효하지 않은 값도 목표로 한 번에 붙인다', () => {
    const clock = make_clock();
    const seen = [];
    cursor_start_travel({
      fromMetres: 0, toMetres: 1e8, durationMs: 420,
      now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
      onStep: (m) => seen.push(m),
    });
    expect(seen).toEqual([1e8]);
    expect(clock.pending()).toBe(0);
  });
});

describe('배지 게이트 — 너무 빨리 넘어가지 않게 막는다', () => {
  function make_timers() {
    let stamp = 0;
    const jobs = new Map();
    let id = 0;
    return {
      now: () => stamp,
      schedule: (fn, ms) => { id += 1; jobs.set(id, { fn, at: stamp + ms }); return id; },
      cancel: (handle) => { jobs.delete(handle); },
      tick(ms) {
        stamp += ms;
        for (const [key, job] of [...jobs]) {
          if (job.at <= stamp) { jobs.delete(key); job.fn(); }
        }
      },
    };
  }

  // **프로덕션 상수를 그대로 쓴다.** 여기에 344를 다시 적어 두면 광과민성 방어가
  // 테스트 자신의 기본값만 검사하게 되고, 프로덕션이 100ms가 되어도 통과한다.
  function make_gate(timers, shown, dwellMs = BADGE_MIN_DWELL_MS) {
    return badge_create_gate({
      dwellMs,
      now: timers.now,
      schedule: timers.schedule,
      cancel: timers.cancel,
      onShow: (value) => shown.push(value),
    });
  }

  it('첫 요청은 즉시 보인다 — 손을 따라가야 한다', () => {
    const timers = make_timers();
    const shown = [];
    make_gate(timers, shown).request('a');
    expect(shown).toEqual(['a']);
  });

  it('체류 중에는 쌓지 않고 마지막 것만 남는다', () => {
    const timers = make_timers();
    const shown = [];
    const gate = make_gate(timers, shown);
    gate.request('a');
    timers.tick(50); gate.request('b');
    timers.tick(50); gate.request('c');
    timers.tick(50); gate.request('d');
    expect(shown).toEqual(['a']); // 아직 아무것도 안 나갔다
    timers.tick(300);
    expect(shown).toEqual(['a', 'd']); // b와 c는 버려진다
  });

  it('체류 중 마지막 변경이 반드시 나온다 — 없으면 틀린 배지에 멈춘다', () => {
    const timers = make_timers();
    const shown = [];
    const gate = make_gate(timers, shown);
    gate.request('a');
    timers.tick(10); gate.request('final');
    timers.tick(1000);
    expect(shown[shown.length - 1]).toBe('final');
  });

  it('체류가 지나면 다시 즉시 보인다', () => {
    const timers = make_timers();
    const shown = [];
    const gate = make_gate(timers, shown);
    gate.request('a');
    timers.tick(400);
    gate.request('b');
    expect(shown).toEqual(['a', 'b']);
  });

  it('프로덕션 체류 시간이 3 Hz 한계보다 길다 — 상수 자체를 검사한다', () => {
    // 광과민성 여유는 초당 3장. 한 장이 최소 1000/3 = 333.3 ms는 머물러야 한다.
    // 아래 스로틀 테스트만 있으면 상수를 100 ms로 바꿔도 게이트는 여전히
    // "요청보다 덜 보여주므로" 멀쩡히 동작한다 — 한계를 넘긴 사실만 안 보인다.
    expect(BADGE_MIN_DWELL_MS).toBeGreaterThan(1000 / PHOTOSENSITIVE_MAX_PER_SECOND);
    expect(BADGE_MIN_DWELL_MS).toBe(344);
    // 슬라이드 시간(180 ms)보다 길어야 카드가 잠시라도 멈춰 선다
    expect(BADGE_MIN_DWELL_MS).toBeGreaterThan(180);
  });

  it('초당 3장을 넘지 않는다 — 광과민성 여유', () => {
    const timers = make_timers();
    const shown = [];
    const gate = make_gate(timers, shown); // 프로덕션 상수로 만든 게이트
    // 1초 동안 16ms마다 다른 값을 요청한다 (초당 62회)
    for (let i = 0; i < 62; i += 1) { gate.request(`v${i}`); timers.tick(16); }
    expect(shown.length).toBeLessThanOrEqual(PHOTOSENSITIVE_MAX_PER_SECOND);
  });

  it('멈추면 대기 중인 것도 나오지 않는다', () => {
    const timers = make_timers();
    const shown = [];
    const gate = make_gate(timers, shown);
    gate.request('a');
    timers.tick(10); gate.request('b');
    gate.stop();
    timers.tick(1000);
    expect(shown).toEqual(['a']);
  });
});

// ═══════════════════════════════════════════════════════════
// 상수를 리터럴로 못박는다.
// 아래 넷은 전부 "값을 바꿔도 347건이 통과했다"에서 나왔다. 상수를 그 상수로 재면
// 무엇도 지키지 못하므로, **실제 출력을 받아 적은 값**을 양쪽으로 눌러 둔다.
// ═══════════════════════════════════════════════════════════

describe('로그 축 라벨 — 10의 거듭제곱이 아닌 값에 "10ⁿ"이라 적지 않는다', () => {
  // `ticks_build_decade`는 양 끝에 **데이터 경계값**도 넣는다. 그것을 반올림해
  // 지수 표기로 찍으면 4.398×10⁸ 자리에 "10⁹"이 적힌다 — 축이 거짓말을 한다.
  // 규약이 "이 사고는 실제로 한 번 났다"고 적어 둔 바로 그것이다.
  const LOG = { kind: 'log' };

  it('진짜 거듭제곱은 지수 표기로 간다', () => {
    // 여유(epsilon)를 0으로 만들면 `|0| < 0`이 거짓이라 이쪽이 죽는다.
    expect(display_format_axis_value(1e-5, LOG, 3)).toBe('10⁻⁵');
    expect(display_format_axis_value(1e-4, LOG, 3)).toBe('10⁻⁴');
    expect(display_format_axis_value(1e9, LOG, 3)).toBe('10⁹');
    expect(display_format_axis_value(1e12, LOG, 3)).toBe('10¹²');
  });

  it('거듭제곱이 아니면 가수를 그대로 적는다', () => {
    // 여유를 키우면 이쪽이 죽는다. 셋 다 감사 보고서에 적힌 실제 축 경계값이다.
    expect(display_format_axis_value(4.398046511104e8, LOG, 3)).toBe('4.4 × 10⁸');
    expect(display_format_axis_value(5.7909e10, LOG, 3)).toBe('5.79 × 10¹⁰');
    expect(display_format_axis_value(3.3e-4, LOG, 3)).toBe('3.3 × 10⁻⁴');
  });

  it('거듭제곱에 가장 가까운 도달 가능한 경계도 지수 표기로 새지 않는다', () => {
    // t₀ = 0.39 mm, 8접기 → 0.09984 m. log10이 −1.0007이라 여유가 7×10⁻⁴만
    // 되어도 "10⁻¹"로 새어 나간다. 슬라이더로 실제로 도달할 수 있는 값 중
    // 거듭제곱에 가장 가까운 것이 이것이다.
    const series = model_build_series(0.39, 8);
    const closest = series[series.length - 1].thicknessM;
    expect(closest).toBeCloseTo(0.09984, 9);
    expect(display_format_axis_value(closest, LOG, 4)).toBe('9.984 × 10⁻²');
  });

  it('슬라이더로 도달 가능한 축 경계 전수에서 거짓 지수가 하나도 없다', () => {
    // 지수 문자열은 **테스트가 따로 만든다.** 프로덕션 포맷터를 불러 쓰면
    // 위첨자 표를 통째로 바꿔도 양쪽이 같이 틀려 통과한다.
    const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const test_format_exponent = (power) =>
      `10${String(power).split('').map((d) => SUPERSCRIPT[d]).join('')}`;

    let checked = 0;
    let exactDecades = 0;
    for (let hundredths = FOLD_THICKNESS_MIN_MM * 100; hundredths <= FOLD_THICKNESS_MAX_MM * 100; hundredths += 1) {
      const series = model_build_series(Number((hundredths / 100).toFixed(2)), FOLD_COUNT_MAX);
      for (const point of series) {
        const power = Math.log10(point.thicknessM);
        const printed = display_format_axis_value(point.thicknessM, LOG, 4);
        checked += 1;
        if (power === Math.round(power)) {
          exactDecades += 1;
          expect(printed).toBe(test_format_exponent(Math.round(power)));
        } else {
          // 거듭제곱이 아닌데 "10ⁿ"으로 찍히면 축이 거짓말을 한 것이다.
          expect(printed).toMatch(/ × 10/);
        }
      }
    }
    // 전수 규모를 리터럴로 남긴다. 루프가 조용히 비면 이 단언이 잡는다.
    expect(checked).toBe(2346);
    expect(exactDecades).toBe(4);
  });
});

describe('좁은 화면에서 y축 라벨 자릿수를 줄인다', () => {
  // 420px 미만이면 유효숫자 2자리, 이상이면 3자리. 임계를 0으로 내리면 ①이,
  // 크게 올리면 ②가 죽는다.
  function chart_read_labels(cssWidth) {
    const canvas = rail_build_canvas(cssWidth - RAIL_PAD_X * 2);
    chart_render_thickness(canvas, model_build_series(0.1, 10), 'log');
    return canvas.context.texts.map((entry) => entry.text);
  }

  it('① 419px에서는 "1 × 10⁻¹"로 줄여 찍는다', () => {
    expect(chart_read_labels(419)).toContain('1 × 10⁻¹');
  });

  it('② 420px부터는 "1.02 × 10⁻¹"로 세 자리를 준다', () => {
    expect(chart_read_labels(420)).toContain('1.02 × 10⁻¹');
    expect(chart_read_labels(420)).not.toContain('1 × 10⁻¹');
  });
});

describe('자 아이콘 — 겹치면 밀지 말고 버린다', () => {
  // `canvas_draw_icon`은 `Path2D`가 없으면 조용히 아무것도 안 그리고 false를 낸다.
  // 아이콘 개수를 세려면 그 클래스가 있어야 한다.
  const savedPath2D = Object.getOwnPropertyDescriptor(globalThis, 'Path2D');
  beforeAll(() => {
    globalThis.Path2D = class TestPath2D {
      constructor(d) { this.d = d; }
    };
  });
  afterAll(() => {
    if (savedPath2D) Object.defineProperty(globalThis, 'Path2D', savedPath2D);
    else delete globalThis.Path2D;
  });

  function rail_read_icon_count(plotWidth) {
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    const canvas = rail_build_canvas(plotWidth);
    return rail_render(canvas, { series, cursorMetres: series[series.length - 1].thicknessM }).iconCount;
  }

  it('최소 간격이 정확히 4px이다 — 실측 개수를 양쪽으로 눌러 둔다', () => {
    // 214px에서 간격 3 이하는 9개, 4는 8개.
    // 225px에서 간격 4는 9개, 5 이상은 8개.
    // 두 값을 같이 박으면 임계가 4가 아닌 어떤 값도 통과하지 못한다.
    expect(rail_read_icon_count(214)).toBe(8);
    expect(rail_read_icon_count(225)).toBe(9);
  });

  it('넓으면 거의 다 살아남는다 — 기준점은 18개다', () => {
    expect(FOLD_REFERENCE_LIST).toHaveLength(18);
    expect(rail_read_icon_count(884)).toBe(17);
  });
});

describe('빗살 상한 가드', () => {
  it('계열이 상한보다 길면 빗살을 아예 안 그린다', () => {
    // 지금 슬라이더(0~50 → 계열 51)로는 이 가드가 늘 통과한다. 그래서 가드를
    // 통째로 지워도 화면이 그대로다. 상한을 넘는 계열을 직접 넣어 가드를 깨운다.
    const series = Array.from({ length: 62 }, (_, fold) => ({ fold, thicknessM: 1e-4 * Math.pow(2, fold) }));
    const canvas = rail_build_canvas(PLOT_WIDTH);
    expect(rail_render(canvas, { series, cursorMetres: 1e-4 }).foldTickCount).toBe(0);
  });

  it('상한 바로 아래(61개)까지는 그린다', () => {
    const series = Array.from({ length: 61 }, (_, fold) => ({ fold, thicknessM: 1e-4 * Math.pow(2, fold) }));
    const canvas = rail_build_canvas(PLOT_WIDTH);
    expect(rail_render(canvas, { series, cursorMetres: 1e-4 }).foldTickCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 이해 비용 — 그림 하나에 이름이 하나도 없으면 표까지 내려가야 뜻을 안다
// ═══════════════════════════════════════════════════════════

describe('자 이름표 — 지금 보고 있는 기준점에 글자를 붙인다', () => {
  /** 자를 실제로 그리고, **이름표 줄에 찍힌 글자만** 골라낸다. */
  function rail_read_names(thicknessMm, foldCount, plotWidth = PLOT_WIDTH) {
    const series = model_build_series(thicknessMm, foldCount);
    const canvas = rail_build_canvas(plotWidth);
    const cursorMetres = series[series.length - 1].thicknessM;
    const drawn = rail_render(canvas, { series, cursorMetres });
    return { drawn, texts: canvas.context.texts.filter((entry) => entry.y === drawn.nameLabelY) };
  }

  it('기본 설정에서 다음 기준점의 이름이 자 위에 글자로 나온다', () => {
    // 이름표를 통째로 지우면 여기서 죽는다. 실제 출력을 받아 적은 값이다.
    const { drawn, texts } = rail_read_names(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    expect(drawn.namedKeys).toEqual(['sundisc']);
    expect(texts.map((entry) => entry.text)).toEqual(['The Sun, edge to edge']);
    // 이름표 줄은 데케이드 라벨 줄보다 아래에 있어야 한다 (아이콘 줄 밑).
    expect(drawn.nameLabelY).toBeGreaterThan(drawn.decadeLabelY);
  });

  it('접기를 옮기면 이름표도 따라 옮겨간다 — 첫 렌더에 굳지 않는다', () => {
    expect(rail_read_names(0.1, 0).drawn.namedKeys).toEqual(['card']);
    expect(rail_read_names(0.1, 12).drawn.namedKeys).toEqual(['human']);
    expect(rail_read_names(0.1, 20).drawn.namedKeys).toEqual(['track']);
    expect(rail_read_names(0.1, 30).drawn.namedKeys).toEqual(['iss']);
    expect(rail_read_names(0.1, FOLD_COUNT_MAX).drawn.namedKeys).toEqual(['sun']);
  });

  it('슬라이더 전 구간에서 이름표는 모델의 판정과 같은 것을 가리킨다', () => {
    // 자가 판정을 따로 하면 배지·자·표가 언젠가 서로 다른 기준점을 든다.
    // 다음 것이 없으면(전부 넘었으면) 방금 지난 것을 든다.
    let checked = 0;
    for (const thicknessMm of [FOLD_THICKNESS_MIN_MM, 0.1, FOLD_THICKNESS_MAX_MM]) {
      for (let folds = 0; folds <= FOLD_COUNT_MAX; folds += 1) {
        const metres = model_calculate_thickness_m(thicknessMm, folds);
        const expected = model_read_next_target(metres) ?? model_read_last_passed(metres);
        expect(rail_read_names(thicknessMm, folds).drawn.namedKeys[0]).toBe(expected.key);
        checked += 1;
      }
    }
    expect(checked).toBe(153);
  });

  it('이름표가 자 밖으로 나가지 않는다 — 잘리면 뜻이 반쯤 사라진다', () => {
    // 스텁의 `measureText`와 같은 잣대(글자당 6px)로 상자를 만든다.
    for (const [mm, folds] of [[FOLD_THICKNESS_MIN_MM, 0], [FOLD_THICKNESS_MAX_MM, FOLD_COUNT_MAX], [0.1, 42]]) {
      for (const entry of rail_read_names(mm, folds).texts) {
        const half = (entry.text.length * 6) / 2;
        expect(entry.x - half).toBeGreaterThanOrEqual(PLOT_LEFT - 1e-9);
        expect(entry.x + half).toBeLessThanOrEqual(PLOT_LEFT + PLOT_WIDTH + 1e-9);
      }
    }
  });

  it('이름표 둘이 나란히 설 만큼 넓으면 둘 다 나오고, 그래도 겹치지 않는다', () => {
    // 좁은 폭에서는 늘 하나만 남아 겹침 판정이 한 번도 안 돈다 —
    // 판정을 통째로 지워도 통과한다. 넓은 자로 두 개짜리 경우를 깨운다.
    let seenPairs = 0;
    for (let folds = 0; folds <= FOLD_COUNT_MAX; folds += 1) {
      const { texts } = rail_read_names(0.1, folds, 2400);
      if (texts.length === 2) seenPairs += 1;
      const boxes = texts
        .map((entry) => ({
          lo: entry.x - (entry.text.length * 6) / 2,
          hi: entry.x + (entry.text.length * 6) / 2,
        }))
        .sort((a, b) => a.lo - b.lo);
      for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].lo).toBeGreaterThan(boxes[i - 1].hi);
    }
    expect(seenPairs).toBeGreaterThan(0);
  });
});

describe('곡선 캡션 — 축의 양 끝을 숫자로 적는다', () => {
  // "설정마다 달라진다"고만 적으면 독자는 두 설정을 비교할 방법이 없다.
  // 렌더가 실제로 쓴 축의 양 끝을 숫자로 적어야 읽어서 비교할 수 있다.
  function chart_read(kind) {
    const canvas = rail_build_canvas(PLOT_WIDTH);
    const series = model_build_series(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    const drawn = chart_render_thickness(canvas, series, kind);
    return { drawn, note: chart_format_note(drawn) };
  }

  it('선형 — 문장 전체를 골든으로 박는다', () => {
    expect(chart_read('linear').note).toBe(
      'Both axes rescale with the sliders — read them before comparing two settings. ' +
        'Vertical: linear, 0 m to 475,000 km. Horizontal: 0 to 42 folds. ' +
        'The rail above never rescales, so two settings can be compared there. ' +
        'On this axis folds 0 to 34 and 12 of the 18 marked heights sit within one pixel of zero.',
    );
  });

  it('로그 — 눌리는 구간이 없으므로 그 문장도 없다', () => {
    expect(chart_read('log').note).toBe(
      'Both axes rescale with the sliders — read them before comparing two settings. ' +
        'Vertical: logarithmic, 0.1 mm to 439,800 km. Horizontal: 0 to 42 folds. ' +
        'The rail above never rescales, so two settings can be compared there.',
    );
  });

  it('선형 축이 기준점 열여덟 중 열둘을 바닥 1픽셀에 눌러 놓는다', () => {
    // 화면만 보면 모래알과 정지궤도가 같은 높이로 보인다. 세는 코드를 지우면
    // 캡션에서 문장이 사라져 위 골든이 죽고, 여기서는 수를 직접 잰다.
    expect(chart_read('linear').drawn.crushedReferenceCount).toBe(12);
    expect(chart_read('linear').drawn.referenceCount).toBe(FOLD_REFERENCE_LIST.length);
    expect(chart_read('log').drawn.crushedReferenceCount).toBe(0);
  });

  it('캡션은 렌더가 준 값만 읽는다 — 값을 바꿔 넣으면 문장이 따라 바뀐다', () => {
    // 캡션이 계열에서 축을 다시 계산하면 이 단언이 죽는다.
    const note = chart_format_note({
      axisKind: 'linear',
      lowM: 0,
      highM: 1,
      foldMax: 7,
      crushedReferenceCount: 3,
      referenceCount: 18,
      flatUntilFold: 2,
    });
    expect(note).toContain('0 m to 1 m');
    expect(note).toContain('0 to 7 folds');
    expect(note).toContain('folds 0 to 2 and 3 of the 18 marked heights');
  });

  it('접기 1회에서 "1 folds"라고 적지 않는다', () => {
    const note = chart_format_note({
      axisKind: 'log',
      lowM: 1e-4,
      highM: 2e-4,
      foldMax: 1,
      crushedReferenceCount: 0,
      referenceCount: 18,
      flatUntilFold: null,
    });
    expect(note).toContain('0 to 1 fold.');
    expect(note).not.toContain('1 folds');
  });
});

describe('길이 카드 — 10²¹ m는 크다는 것 말고 아무것도 말하지 않는다', () => {
  it('문장 가운데 들어갈 이름은 관사만 소문자로 내린다', () => {
    expect(display_format_reference_phrase('The Moon')).toBe('the Moon');
    expect(display_format_reference_phrase('A bank card')).toBe('a bank card');
    expect(display_format_reference_phrase('An adult standing')).toBe('an adult standing');
    expect(display_format_reference_phrase('One lap of a running track')).toBe('one lap of a running track');
    // 고유명사로 시작하는 것은 건드리지 않는다 — 내리면 그것이 오히려 틀린 글이다.
    expect(display_format_reference_phrase('Mount Everest')).toBe('Mount Everest');
    expect(display_format_reference_phrase('Airliner cruise altitude')).toBe('Airliner cruise altitude');
  });

  it('기본 설정의 필요 길이에 크기가 붙는다 — 실제 출력을 받아 적었다', () => {
    const lengthM = model_calculate_length_required_m(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT);
    expect(display_describe_length_scale(lengthM)).toBe('about 6.8 billion × the distance to the Sun');
  });

  it('잴 자가 없으면 아무 말도 하지 않는다 — 억지로 비교하지 않는다', () => {
    expect(display_describe_length_scale(0)).toBe('');
    expect(display_describe_length_scale(1e-9)).toBe('');
    expect(display_describe_length_scale(NaN)).toBe('');
  });

  it('고르는 자가 목록을 독립적으로 훑은 결과와 같다', () => {
    // 판정 함수를 다른 것으로 바꿔치기하면(예: 늘 첫 항목) 여기서 죽는다.
    let compared = 0;
    // 0접기는 필요 길이가 0이라 잴 자가 없다 — 그 갈래도 같이 지난다.
    for (let folds = 0; folds <= FOLD_COUNT_MAX; folds += 1) {
      const lengthM = model_calculate_length_required_m(FOLD_THICKNESS_DEFAULT_MM, folds);
      // 대조 경로 — 모델 함수를 부르지 않고 목록을 직접 훑는다.
      const independent = FOLD_REFERENCE_LIST.filter((item) => item.metres < lengthM).pop();
      const text = display_describe_length_scale(lengthM);
      if (!independent) {
        expect(text).toBe('');
        continue;
      }
      expect(text).toContain(display_format_reference_phrase(independent.label));
      compared += 1;
    }
    expect(compared).toBe(FOLD_COUNT_MAX);
  });
});
