/**
 * 샤워 vs 욕조 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에만 싣는다 (localStorage 없음).
 *
 * 패널이 둘이고 x축(분)을 공유한다. **두 패널의 x축 범위는 같은 값 하나에서 나온다** —
 * 따로 잡으면 두 세로선이 서로 다른 축 위에 서서, 겹쳐 보이거나 갈라져 보이는 것이
 * 실제 차이가 아니라 축의 차이가 된다.
 */
import {
  SHOWER_FLOW_MIN_LPM,
  SHOWER_FLOW_MAX_LPM,
  SHOWER_FLOW_STEP_LPM,
  SHOWER_FLOW_DEFAULT_LPM,
  SHOWER_MINUTES_MIN,
  SHOWER_MINUTES_MAX,
  SHOWER_MINUTES_STEP,
  SHOWER_MINUTES_DEFAULT,
  BATH_LITRES_MIN,
  BATH_LITRES_MAX,
  BATH_LITRES_STEP,
  BATH_LITRES_DEFAULT,
  RISE_MIN_K,
  RISE_MAX_K,
  RISE_STEP_K,
  RISE_SHOWER_DEFAULT_K,
  RISE_BATH_DEFAULT_K,
  SHOWER_FLOW_PRESETS,
  SHOWER_SITUATION_PRESETS,
  TABLE_BATH_LITRES,
  TABLE_FLOWS_LPM,
  model_clamp_flow,
  model_clamp_minutes,
  model_clamp_bath_litres,
  model_clamp_rise,
  model_clamp_price,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_cost,
  model_calculate_crossover_table,
} from './model.js';

import { num_read_decimal, num_calculate_decimal_digits } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear, ticks_drop_crowded } from '../_shared/ticks.js';
import { canvas_read_css_color, canvas_setup_context } from '../_shared/canvas.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import {
  control_build_slider,
  control_build_readout,
  control_build_button_group,
  control_build_table,
  control_build_table_row,
} from '../_shared/controls.js';

// ── DOM 훅 ─────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="shower-vs-bath"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_FLOW = 'q';
const URL_KEY_MINUTES = 't';
const URL_KEY_BATH = 'v';
const URL_KEY_RISE_SHOWER = 'ds';
const URL_KEY_RISE_BATH = 'db';
const URL_KEY_PRICE = 'p';

// ── 표시 자릿수 ────────────────────────────────────────────
/** 분은 0.1 단위로 읽는다. 이 정밀도가 곧 두 교차 시점이 갈리는 기준이다. */
const MINUTE_DIGITS = 1;
/** 1분 아래에서는 한 자리 더. 0.34분과 0.44분이 둘 다 "0.3/0.4"로 뭉개지지 않게. */
const MINUTE_SMALL_THRESHOLD = 1;
const MINUTE_SMALL_DIGITS = 2;
const SECONDS_PER_MINUTE = 60;
/** 초로 바꿔 읽어 주는 경계. 1분 미만의 간격은 "0.6분"보다 "38초"가 읽힌다. */
const GAP_SECONDS_THRESHOLD_MINUTES = 1;
const LITRE_DIGITS = 1;
const KWH_DIGITS = 2;
const KWH_SMALL_THRESHOLD = 1;
const KWH_SMALL_DIGITS = 3;
const FLOW_DIGITS = 2;
const COST_DIGITS = 2;
/** 축 눈금 라벨의 소수 자릿수 상한. 이보다 잘면 축이 그 값을 구분해 보여주지 못한다. */
const AXIS_DIGITS_MAX = 3;
/**
 * 캡션이 인용하는 축 **끝값**은 눈금 라벨보다 한 자리 더 적는다.
 * 눈금 간격의 정밀도로 적으면 3.12로 끝나는 축이 캡션에서 "3"이 되어,
 * 그림 밑에 실제와 다른 축 범위가 적힌다.
 */
export const CAPTION_AXIS_PRECISION_DIVISOR = 10;
/** 음수 부호. ASCII 하이픈과 섞이면 같은 화면에 두 글자가 나온다. */
const MINUS = '−';
/**
 * 반올림 허용오차(상대). 9.5 × 8.4 같은 곱은 부동소수에서 …4999로 떨어져
 * `toFixed`가 0.5를 내림한다(31.25 → "31.2"). 사이트 규칙은 0.5 올림이다.
 * 2026-10-03 오라클(shown.test.js)이 잡았다.
 */
const DISPLAY_ROUND_EPSILON = 1e-9;

const RECOMPUTE_DELAY_MS = 110;

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 230;
const CHART_PAD_TOP = 14;
const CHART_PAD_RIGHT = 14;
const CHART_PAD_BOTTOM = 50;
const CHART_PAD_LEFT = 58;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_LABEL_MIN_GAP_PX = 10;
const CHART_TICK_LABEL_HEIGHT_PX = 12;
const CHART_LINE_WIDTH_SHOWER = 2;
const CHART_LINE_WIDTH_BATH = 3;
const CHART_GRID_WIDTH = 1;
const CHART_CROSSOVER_DASH = [5, 4];
const CHART_NOW_DASH = [2, 3];
const CHART_NOW_DOT_RADIUS = 3.5;
/** 곡선이 축선에 붙지 않게 하는 세로 여유. */
const CHART_Y_HEADROOM = 1.08;
/** 오른쪽 끝에 두는 가로 여유. 교차 세로선이 축선 위에 겹치지 않게 한다. */
const CHART_X_HEADROOM = 1.15;
/** x축 최소 폭(분). 두 값이 거의 같을 때 좌표가 NaN이 되는 것을 막는다. */
const CHART_X_MIN_MINUTES = 2;
/** y축 최소 폭. 같은 이유다. */
const CHART_Y_MIN_LITRES = 1;
const CHART_Y_MIN_KWH = 0.05;

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_SHOWER = '--series-1';
const COLOR_VAR_BATH = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_VAR_BAND = '--paper-sunk';
const COLOR_FALLBACK_SHOWER = '#1f4e79';
const COLOR_FALLBACK_BATH = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_BAND = '#f0f0ea';

// ── 문구 ───────────────────────────────────────────────────
const CHART_TITLE_X = 'Minutes of shower (linear)';
const CHART_TITLE_Y_WATER = 'Water, litres (linear)';
const CHART_TITLE_Y_ENERGY = 'Energy, kWh (linear)';
const PANEL_NAME_WATER = 'Water panel';
const PANEL_NAME_ENERGY = 'Energy panel';
/** 범례는 짧게. 360px에서 긴 라벨 한 칸이 화면 폭을 넘는다. */
const CHART_LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: 'Shower — rises' },
  { swatch: 'legend-mean-2', label: 'Bath — flat' },
  { swatch: 'legend-reference', label: 'Crossover' },
];
const TABLE_CAPTION = 'Minute the shower passes the tub, five flow rates against four tub volumes';
/**
 * 표 아래 설명. 유량 슬라이더가 표의 다섯 행 사이에 있으면 어느 행도 강조되지
 * 않는다 — 그래서 "그 행이 강조된다"고 무조건 적지 않고, 실제로 강조된 행이
 * 있는지를 매 렌더에서 보고(`display_show_table`) 그 결과로 문장을 가른다.
 */
const TABLE_NOTE_BASE =
  'The water crossover is V divided by Q and uses neither temperature, so this grid does not move when the two ' +
  'temperature sliders move.';
const TABLE_NOTE_ROW_MARKED = ' The row matching the flow slider is marked.';
// 유량 슬라이더가 표의 행 범위 안이면 "두 행 사이", 밖이면 "가장 가까운 끝 행"이라고 쓴다 —
// 슬라이더(4~20)가 표(6~15)보다 넓어 "사이"가 거짓이 되는 상태가 있었다(B6 대조, 2026-10-03).
const TABLE_NOTE_ROW_BETWEEN =
  ' The flow slider sits between two of these rows right now, so none is marked — read the neighbouring rows on ' +
  'either side instead.';
const TABLE_NOTE_ROW_BELOW = (flowText) =>
  ` The flow slider is below the lowest row right now, so none is marked — the ${flowText} row is the nearest.`;
const TABLE_NOTE_ROW_ABOVE = (flowText) =>
  ` The flow slider is above the highest row right now, so none is marked — the ${flowText} row is the nearest.`;

const VERDICT_HEADLINE = {
  hold: 'Both crossovers land on the same minute.',
  edge: 'The two crossovers sit apart, and the shower time is not between them.',
  break: 'At this shower time the two panels disagree.',
};

// ── 표시 함수 ──────────────────────────────────────────────

/** 표 아래 문장의 꼬리 — 강조 행이 있는지, 없으면 슬라이더가 표 범위의 안·아래·위 어디인지. */
export function display_describe_table_row(rowMarked, flow) {
  if (rowMarked) return TABLE_NOTE_ROW_MARKED;
  const lowest = Math.min(...TABLE_FLOWS_LPM);
  const highest = Math.max(...TABLE_FLOWS_LPM);
  if (flow < lowest) return TABLE_NOTE_ROW_BELOW(lowest.toFixed(FLOW_DIGITS));
  if (flow > highest) return TABLE_NOTE_ROW_ABOVE(highest.toFixed(FLOW_DIGITS));
  return TABLE_NOTE_ROW_BETWEEN;
}

/**
 * 고정 자릿수 표기. **0.5는 올림**(크기 기준)이고, 반올림해서 0이 되면 부호를 버린다 —
 * `toFixed`는 부동소수 오차로 동점을 내림하고 −0.000을 찍는다.
 */
export function display_format_fixed(value, digits) {
  const scale = 10 ** digits;
  const scaled = Math.abs(value) * scale;
  const rounded = Math.floor(scaled + 0.5 + DISPLAY_ROUND_EPSILON * Math.max(1, scaled));
  const text = (rounded / scale).toFixed(digits);
  return value < 0 && rounded !== 0 ? `-${text}` : text;
}

/** 분 표기. 자릿수를 값의 크기가 아니라 **읽어야 하는 정밀도**로 정한다. */
export function display_format_minutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  // 문턱도 허용오차로 본다 — 정확히 1분인 값이 0.999…로 떨어져 두 자리로 찍히지 않게.
  const digits = Math.abs(minutes) < MINUTE_SMALL_THRESHOLD - DISPLAY_ROUND_EPSILON ? MINUTE_SMALL_DIGITS : MINUTE_DIGITS;
  return display_format_fixed(minutes, digits);
}

/** 두 교차 시점의 간격. 1분 아래에서는 초로 읽어 준다. */
export function display_format_gap(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const size = Math.abs(minutes);
  if (size < GAP_SECONDS_THRESHOLD_MINUTES - DISPLAY_ROUND_EPSILON) {
    return `${display_format_fixed(size * SECONDS_PER_MINUTE, 0)} s`;
  }
  return `${display_format_fixed(size, MINUTE_DIGITS)} min`;
}

export function display_format_litres(litres) {
  if (!Number.isFinite(litres)) return '—';
  return display_format_fixed(litres, LITRE_DIGITS);
}

export function display_format_kwh(kwh) {
  if (!Number.isFinite(kwh)) return '—';
  const digits = Math.abs(kwh) < KWH_SMALL_THRESHOLD - DISPLAY_ROUND_EPSILON ? KWH_SMALL_DIGITS : KWH_DIGITS;
  return display_format_fixed(kwh, digits);
}

/**
 * 부호를 붙인 차이. **정확히 0인 차이**에는 부호를 붙이지 않는다 — 부동소수 오차로
 * −1e-16이 된 0이 "−0.000"으로 찍히지 않게 허용오차 안을 0으로 본다.
 * 0이 아닌 작은 차이는 반올림해 0이 찍혀도 부호로 방향을 남긴다("+0.0").
 */
export function display_format_signed(value, formatValue) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < DISPLAY_ROUND_EPSILON) return formatValue(0);
  const sizeText = formatValue(Math.abs(value));
  return value > 0 ? `+${sizeText}` : `${MINUS}${sizeText}`;
}

export function display_format_cost(cost) {
  if (cost === null || !Number.isFinite(cost)) return '—';
  return display_format_fixed(cost, COST_DIGITS);
}

/**
 * 축 눈금 라벨. 자릿수를 **눈금 간격의 정밀도**로 정한다.
 * 크기로 정하면 간격 2.5에서 7.5가 "8"로 찍혀 화면의 숫자가 실제 값과 달라진다.
 */
export function display_format_axis(value, step) {
  if (!Number.isFinite(value)) return '—';
  const digits = Math.min(num_calculate_decimal_digits(step), AXIS_DIGITS_MAX);
  return display_format_fixed(value, digits);
}

/**
 * 판정 문장. **주어는 언제나 모델이다.** 권고를 하지 않는다 —
 * 모델은 교차 시점만 말한다.
 */
export function display_describe_verdict(result) {
  const verdict = model_calculate_verdict(result);
  const waterText = display_format_minutes(result.waterCrossoverMinutes);
  const energyText = display_format_minutes(result.energyCrossoverMinutes);

  let headline = VERDICT_HEADLINE[verdict];
  if (verdict === 'hold') {
    headline = `${VERDICT_HEADLINE.hold} The model puts both at ${waterText} minutes.`;
  } else if (verdict === 'break') {
    const wetter = result.waterDifferenceLitres > 0;
    headline =
      `${VERDICT_HEADLINE.break} At ${display_format_minutes(result.minutes)} minutes the model has the shower ` +
      `using ${wetter ? 'more' : 'less'} water than the tub and ` +
      `${wetter ? 'less' : 'more'} energy than it, at the same time.`;
  } else {
    headline = `${VERDICT_HEADLINE.edge} The model puts them ${display_format_gap(result.crossoverGapMinutes)} apart.`;
  }

  const detail =
    `Water crosses at ${waterText} minutes, energy at ${energyText}. ` +
    `At ${display_format_minutes(result.minutes)} minutes the shower has run ` +
    `${display_format_litres(result.showerLitres)} litres against the tub's ${display_format_litres(result.bathLitres)}, ` +
    `and ${display_format_kwh(result.showerKwh)} kWh against its ${display_format_kwh(result.bathKwh)}. ` +
    `The model reports crossover minutes; it ranks nothing.`;

  return { verdict, headline, detail };
}

// ── URL 상태 ────────────────────────────────────────────────

/**
 * 쿼리스트링에서 상태를 읽는다. 깨진 값은 **최솟값이 아니라 기본값**으로 돌아간다 —
 * `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
 */
export function url_read_state(search) {
  const numbers = urlstate_read_numbers(search, {
    [URL_KEY_FLOW]: { fallback: SHOWER_FLOW_DEFAULT_LPM, clamp: model_clamp_flow },
    [URL_KEY_MINUTES]: { fallback: SHOWER_MINUTES_DEFAULT, clamp: model_clamp_minutes },
    [URL_KEY_BATH]: { fallback: BATH_LITRES_DEFAULT, clamp: model_clamp_bath_litres },
    [URL_KEY_RISE_SHOWER]: { fallback: RISE_SHOWER_DEFAULT_K, clamp: model_clamp_rise },
    [URL_KEY_RISE_BATH]: { fallback: RISE_BATH_DEFAULT_K, clamp: model_clamp_rise },
  });

  // 단가만 기본값이 없다. 비어 있음은 0이 아니라 "입력하지 않았다"이므로
  // 위 헬퍼(숫자 fallback을 전제한다)에 실을 수 없다.
  const raw = new URLSearchParams(search ?? '').get(URL_KEY_PRICE);
  const price = raw === null ? null : model_clamp_price(num_read_decimal(raw, null));

  return {
    flow: numbers[URL_KEY_FLOW],
    minutes: numbers[URL_KEY_MINUTES],
    bathLitres: numbers[URL_KEY_BATH],
    riseShower: numbers[URL_KEY_RISE_SHOWER],
    riseBath: numbers[URL_KEY_RISE_BATH],
    price,
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_FLOW]: state.flow,
    [URL_KEY_MINUTES]: state.minutes,
    [URL_KEY_BATH]: state.bathLitres,
    [URL_KEY_RISE_SHOWER]: state.riseShower,
    [URL_KEY_RISE_BATH]: state.riseBath,
    // null을 String()에 넣으면 'null'이 실린다. 비어 있음은 빈 문자열로 쓴다.
    [URL_KEY_PRICE]: state.price === null ? '' : state.price,
  });
}

// ── 프리셋 대조 ─────────────────────────────────────────────

/** 지금 유량이 어느 규격 프리셋과 같은가. 아니면 null. */
export function state_pick_matching_flow(flow) {
  const found = SHOWER_FLOW_PRESETS.find((preset) => preset.flow === flow);
  return found ? found.key : null;
}

/** 지금 다섯 슬라이더가 어느 상황 프리셋과 통째로 같은가. 아니면 null. */
export function state_pick_matching_situation(state) {
  const found = SHOWER_SITUATION_PRESETS.find(
    (preset) =>
      preset.state.flow === state.flow &&
      preset.state.minutes === state.minutes &&
      preset.state.bathLitres === state.bathLitres &&
      preset.state.riseShower === state.riseShower &&
      preset.state.riseBath === state.riseBath,
  );
  return found ? found.key : null;
}

// ── 그래프 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/**
 * 두 패널이 함께 쓰는 x축 범위. **한 곳에서만 정한다** —
 * 패널마다 따로 잡으면 두 세로선이 다른 축 위에 서서, 화면의 간격이 실제 간격과 달라진다.
 */
export function chart_calculate_x_max(result) {
  const reach = Math.max(
    result.minutes,
    result.waterCrossoverMinutes,
    result.energyCrossoverMinutes,
    CHART_X_MIN_MINUTES,
  );
  return reach * CHART_X_HEADROOM;
}

/** 한 패널의 y축 위 끝. 상승 직선의 오른쪽 끝과 수평선 중 큰 쪽에 여유를 준다. */
export function chart_calculate_y_max(ratePerMinute, flatValue, xMax, minimumSpan) {
  const top = Math.max(ratePerMinute * xMax, flatValue) * CHART_Y_HEADROOM;
  return Math.max(top, minimumSpan);
}

/**
 * 패널 하나를 그린다. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 *
 * panel: { ratePerMinute, flatValue, crossoverMinutes, bandFromMinutes, bandToMinutes,
 *          nowMinutes, xMax, yMax, titleY, formatValue }
 */
export function chart_render_panel(canvasEl, panel) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);

  const colorShower = chart_read_color(canvasEl, COLOR_VAR_SHOWER, COLOR_FALLBACK_SHOWER);
  const colorBath = chart_read_color(canvasEl, COLOR_VAR_BATH, COLOR_FALLBACK_BATH);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);
  const colorBand = chart_read_color(canvasEl, COLOR_VAR_BAND, COLOR_FALLBACK_BAND);

  const chart_calculate_x = (minutes) => (minutes / panel.xMax) * plotWidth;
  const chart_calculate_y = (value) => plotHeight - (value / panel.yMax) * plotHeight;

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 두 교차 시점 사이의 띠. 격자보다 먼저 깔아 선들을 가리지 않게 한다 ──
  if (Number.isFinite(panel.bandFromMinutes) && Number.isFinite(panel.bandToMinutes)) {
    const bandLeft = chart_calculate_x(Math.min(panel.bandFromMinutes, panel.bandToMinutes));
    const bandRight = chart_calculate_x(Math.max(panel.bandFromMinutes, panel.bandToMinutes));
    context.fillStyle = colorBand;
    context.fillRect(bandLeft, 0, Math.max(1, bandRight - bandLeft), plotHeight);
  }

  // ── 세로축 눈금 ──
  const yStep = ticks_calculate_step(panel.yMax);
  const yValues = ticks_build_linear(0, panel.yMax, yStep);
  const yKept = ticks_drop_crowded(
    yValues.map((value) => ({ value, position: chart_calculate_y(value), width: CHART_TICK_LABEL_HEIGHT_PX })),
    CHART_LABEL_MIN_GAP_PX,
  );
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const item of yKept) {
    context.beginPath();
    context.moveTo(0, item.position);
    context.lineTo(plotWidth, item.position);
    context.stroke();
    context.fillText(display_format_axis(item.value, yStep), -CHART_LABEL_GAP, item.position);
  }

  // ── 가로축 눈금. 라벨이 겹치면 밀지 말고 버린다 ──
  const xStep = ticks_calculate_step(panel.xMax);
  const xValues = ticks_build_linear(0, panel.xMax, xStep);
  const xKept = ticks_drop_crowded(
    xValues.map((value) => ({
      value,
      position: chart_calculate_x(value),
      width: context.measureText(display_format_axis(value, xStep)).width,
    })),
    CHART_LABEL_MIN_GAP_PX,
  );
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const item of xKept) {
    context.fillText(display_format_axis(item.value, xStep), item.position, plotHeight + CHART_LABEL_GAP);
  }

  // ── 수평선(욕조) ──
  context.strokeStyle = colorBath;
  context.lineWidth = CHART_LINE_WIDTH_BATH;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(0, chart_calculate_y(panel.flatValue));
  context.lineTo(plotWidth, chart_calculate_y(panel.flatValue));
  context.stroke();

  // ── 상승 직선(샤워) ──
  context.strokeStyle = colorShower;
  context.lineWidth = CHART_LINE_WIDTH_SHOWER;
  context.beginPath();
  context.moveTo(chart_calculate_x(0), chart_calculate_y(0));
  context.lineTo(chart_calculate_x(panel.xMax), chart_calculate_y(panel.ratePerMinute * panel.xMax));
  context.stroke();

  // ── 이 패널의 교차 세로선 ──
  context.save();
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash(CHART_CROSSOVER_DASH);
  const crossoverX = chart_calculate_x(panel.crossoverMinutes);
  context.beginPath();
  context.moveTo(crossoverX, 0);
  context.lineTo(crossoverX, plotHeight);
  context.stroke();
  context.restore();

  // ── 지금 시간 ──
  context.save();
  context.strokeStyle = colorText;
  context.setLineDash(CHART_NOW_DASH);
  const nowX = chart_calculate_x(panel.nowMinutes);
  context.beginPath();
  context.moveTo(nowX, 0);
  context.lineTo(nowX, plotHeight);
  context.stroke();
  context.restore();

  context.fillStyle = colorShower;
  context.beginPath();
  context.arc(nowX, chart_calculate_y(panel.ratePerMinute * panel.nowMinutes), CHART_NOW_DOT_RADIUS, 0, Math.PI * 2);
  context.fill();

  // ── 축선 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  // ── 축 제목 ──
  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(CHART_TITLE_X, plotWidth / 2, plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP);
  context.save();
  context.translate(-CHART_PAD_LEFT + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  context.fillText(panel.titleY, 0, 0);
  context.restore();

  context.restore();
  return { xMax: panel.xMax, yMax: panel.yMax, xStep, yStep };
}

/** 패널 하나가 무엇을 그렸는지. 캡션은 렌더가 실제로 쓴 축만 인용한다. */
export function chart_describe_panel(name, drawn, panel, formatValue) {
  if (!drawn) {
    return `${name}: the chart has no width to draw into, so nothing is plotted.`;
  }
  return (
    `${name}. Horizontal axis 0 to ` +
    `${display_format_axis(drawn.xMax, drawn.xStep / CAPTION_AXIS_PRECISION_DIVISOR)} minutes, ` +
    `vertical axis 0 to ${display_format_axis(drawn.yMax, drawn.yStep / CAPTION_AXIS_PRECISION_DIVISOR)}, ` +
    `both rescaled to fit — ` +
    `read them before comparing two settings. The rising line is the shower, the flat line the tub at ` +
    `${formatValue(panel.flatValue)}, and the dashed vertical is the crossover at ` +
    `${display_format_minutes(panel.crossoverMinutes)} minutes. The dotted vertical with a dot on it is where the ` +
    `shower-time slider sits.`
  );
}

// ── 위젯 ───────────────────────────────────────────────────

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const state = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Shower volume and energy against a tub, minute by minute';

  // ── 프리셋 두 묶음 ──
  const flowPresets = control_build_button_group(
    'Showerhead flow presets — product standards, not measurements',
    SHOWER_FLOW_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );
  const situationPresets = control_build_button_group(
    'Situations — each button sets all five sliders',
    SHOWER_SITUATION_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // ── 슬라이더 다섯 개 ──
  const flowSlider = control_build_slider(
    'shower-flow',
    'Showerhead flow rate',
    'How many litres the head puts out every minute. The flow preset buttons above are the ceilings in the sources listed at the foot of this page.',
    { min: SHOWER_FLOW_MIN_LPM, max: SHOWER_FLOW_MAX_LPM, step: SHOWER_FLOW_STEP_LPM, value: state.flow },
  );
  const minutesSlider = control_build_slider(
    'shower-minutes',
    'How long the shower runs',
    'Minutes with the water on. It sets the dotted marker on the bottom axis of both panels.',
    { min: SHOWER_MINUTES_MIN, max: SHOWER_MINUTES_MAX, step: SHOWER_MINUTES_STEP, value: state.minutes },
  );
  const bathSlider = control_build_slider(
    'shower-bath',
    'Water drawn for the bath',
    'Litres put into the tub. None of the sources on this page sets this number, so it is yours to choose.',
    { min: BATH_LITRES_MIN, max: BATH_LITRES_MAX, step: BATH_LITRES_STEP, value: state.bathLitres },
  );
  const riseShowerSlider = control_build_slider(
    'shower-rise-shower',
    'Temperature rise for the shower',
    'How much the heater has to raise the water — from the cold tap up to what comes out of the head. A 27 K rise is roughly 10 °C tap water arriving at 37 °C.',
    { min: RISE_MIN_K, max: RISE_MAX_K, step: RISE_STEP_K, value: state.riseShower },
  );
  const riseBathSlider = control_build_slider(
    'shower-rise-bath',
    'Temperature rise for the bath',
    'The same rise for the tub. Move it away from the shower rise and the energy panel starts telling a different story from the water panel.',
    { min: RISE_MIN_K, max: RISE_MAX_K, step: RISE_STEP_K, value: state.riseBath },
  );
  const sliders = [flowSlider, minutesSlider, bathSlider, riseShowerSlider, riseBathSlider];

  const volumeGroup = widget_build_group('The two volumes', [flowSlider.row, minutesSlider.row, bathSlider.row]);
  const riseGroup = widget_build_group('The two temperature rises', [riseShowerSlider.row, riseBathSlider.row]);

  // ── 단가 (기본값 없음) ──
  const priceField = widget_build_price_field(state.price);

  // ── 판정 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 요약 카드 ──
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const cards = {
    waterCrossover: control_build_readout('Water crossover', 'min'),
    energyCrossover: control_build_readout('Energy crossover', 'min'),
    waterNow: control_build_readout('Water, shower minus tub', 'L'),
    energyNow: control_build_readout('Energy, shower minus tub', 'kWh'),
  };
  readouts.append(cards.waterCrossover.box, cards.energyCrossover.box, cards.waterNow.box, cards.energyNow.box);

  // ── 비용 카드. 단가를 비우면 이 두 장이 DOM에서 빠진다 ──
  const costBox = document.createElement('div');
  costBox.className = 'readouts';
  const costCards = {
    shower: control_build_readout('Shower — energy cost so far', 'in your currency'),
    bath: control_build_readout('Bath — energy cost', 'in your currency'),
  };
  let costAttached = false;

  // ── 두 패널 ──
  const waterCanvas = document.createElement('canvas');
  waterCanvas.className = 'widget-chart';
  waterCanvas.setAttribute('role', 'img');
  const energyCanvas = document.createElement('canvas');
  energyCanvas.className = 'widget-chart';
  energyCanvas.setAttribute('role', 'img');

  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  for (const key of CHART_LEGEND_KEYS) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    // 견본 클래스는 `legend-key` + 수식자. 기존 위젯들과 같은 형태다.
    swatch.className = `legend-key ${key.swatch}`;
    item.append(swatch, document.createTextNode(` ${key.label}`));
    legend.appendChild(item);
  }
  const legendNote = document.createElement('p');
  legendNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table(TABLE_CAPTION, ['Flow, L/min', ...TABLE_BATH_LITRES.map((litres) => `${litres} L`)]);
  const tableNote = document.createElement('p');
  tableNote.className = 'legend-note';
  // 처음 글자는 여기서 채우고, 강조 행이 있는지에 따라 뒷문장은 display_show_table이 매번 다시 정한다.
  tableNote.textContent = TABLE_NOTE_BASE;

  rootEl.append(
    heading,
    flowPresets.group,
    situationPresets.group,
    volumeGroup,
    riseGroup,
    priceField.row,
    verdict,
    readouts,
    costBox,
    waterCanvas,
    energyCanvas,
    legend,
    legendNote,
    table.scroll,
    tableNote,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastResult = null;

  function state_read_controls() {
    return {
      flow: model_clamp_flow(Number(flowSlider.input.value)),
      minutes: model_clamp_minutes(Number(minutesSlider.input.value)),
      bathLitres: model_clamp_bath_litres(Number(bathSlider.input.value)),
      riseShower: model_clamp_rise(Number(riseShowerSlider.input.value)),
      riseBath: model_clamp_rise(Number(riseBathSlider.input.value)),
      price: model_clamp_price(num_read_decimal(String(priceField.input.value ?? ''), null)),
    };
  }

  function display_show_controls(current) {
    flowSlider.output.textContent = `${current.flow.toFixed(FLOW_DIGITS)} L/min`;
    minutesSlider.output.textContent = `${current.minutes.toFixed(MINUTE_DIGITS)} min`;
    bathSlider.output.textContent = `${current.bathLitres} L`;
    riseShowerSlider.output.textContent = `${current.riseShower} K`;
    riseBathSlider.output.textContent = `${current.riseBath} K`;
    // 손잡이 값에 단위를 붙여 읽힌다. 없으면 스크린리더가 "9.5"라고만 읽는다.
    flowSlider.input.setAttribute('aria-valuetext', `${current.flow.toFixed(FLOW_DIGITS)} litres per minute`);
    minutesSlider.input.setAttribute('aria-valuetext', `${current.minutes.toFixed(MINUTE_DIGITS)} minutes`);
    bathSlider.input.setAttribute('aria-valuetext', `${current.bathLitres} litres`);
    riseShowerSlider.input.setAttribute('aria-valuetext', `${current.riseShower} kelvin rise`);
    riseBathSlider.input.setAttribute('aria-valuetext', `${current.riseBath} kelvin rise`);

    const flowKey = state_pick_matching_flow(current.flow);
    for (const [key, button] of Object.entries(flowPresets.buttons)) {
      button.setAttribute('aria-pressed', String(key === flowKey));
    }
    const situationKey = state_pick_matching_situation(current);
    for (const [key, button] of Object.entries(situationPresets.buttons)) {
      button.setAttribute('aria-pressed', String(key === situationKey));
    }
  }

  function display_show_cost(result, price) {
    // 단가가 비어 있으면 비용 카드를 DOM에서 뺀다. 숨기는 것이 아니라 없앤다 —
    // 값이 없는 카드가 남아 있으면 화면이 "0"이라고 말하게 된다.
    if (price === null) {
      if (costAttached) {
        costCards.shower.box.remove();
        costCards.bath.box.remove();
        costAttached = false;
      }
      return;
    }
    if (!costAttached) {
      costBox.append(costCards.shower.box, costCards.bath.box);
      costAttached = true;
    }
    costCards.shower.value.textContent = display_format_cost(model_calculate_cost(result.showerKwh, price));
    costCards.bath.value.textContent = display_format_cost(model_calculate_cost(result.bathKwh, price));
  }

  function display_show_table(current) {
    table.body.textContent = '';
    let rowMarked = false;
    for (const row of model_calculate_crossover_table()) {
      const isCurrentRow = Math.abs(row.flow - current.flow) < SHOWER_FLOW_STEP_LPM / 2;
      if (isCurrentRow) rowMarked = true;
      table.body.appendChild(
        control_build_table_row(
          [row.flow.toFixed(FLOW_DIGITS), ...row.minutes.map((minutes) => display_format_minutes(minutes))],
          { current: isCurrentRow },
        ),
      );
    }
    // 슬라이더가 표의 다섯 값 중 하나와 맞아떨어질 때만 강조 행이 생긴다 —
    // 대부분의 위치에서는 아무 행도 강조되지 않으므로 문장이 그 사실을 따라간다.
    tableNote.textContent = TABLE_NOTE_BASE + display_describe_table_row(rowMarked, current.flow);
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. 계산 경로는 여기 하나뿐이다. */
  function widget_update() {
    const current = state_read_controls();
    Object.assign(state, current);

    display_show_controls(current);

    const result = model_calculate_result(
      current.flow, current.minutes, current.bathLitres, current.riseShower, current.riseBath,
    );
    lastResult = result;

    cards.waterCrossover.value.textContent = display_format_minutes(result.waterCrossoverMinutes);
    cards.energyCrossover.value.textContent = display_format_minutes(result.energyCrossoverMinutes);
    cards.waterNow.value.textContent = display_format_signed(result.waterDifferenceLitres, display_format_litres);
    cards.energyNow.value.textContent = display_format_signed(result.energyDifferenceKwh, display_format_kwh);

    const spoken = display_describe_verdict(result);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    display_show_cost(result, current.price);
    display_show_table(current);

    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const result = lastResult;
    const xMax = chart_calculate_x_max(result);
    // 두 시점이 갈렸을 때만 띠를 그린다. 겹쳐 있으면 폭 0짜리 띠가 되어 의미가 없다.
    const bandFrom = result.merged ? Number.NaN : result.waterCrossoverMinutes;
    const bandTo = result.merged ? Number.NaN : result.energyCrossoverMinutes;

    const waterPanel = {
      ratePerMinute: result.litresPerMinute,
      flatValue: result.bathLitres,
      crossoverMinutes: result.waterCrossoverMinutes,
      bandFromMinutes: bandFrom,
      bandToMinutes: bandTo,
      nowMinutes: result.minutes,
      xMax,
      yMax: chart_calculate_y_max(result.litresPerMinute, result.bathLitres, xMax, CHART_Y_MIN_LITRES),
      titleY: CHART_TITLE_Y_WATER,
    };
    const energyPanel = {
      ratePerMinute: result.kwhPerMinute,
      flatValue: result.bathKwh,
      crossoverMinutes: result.energyCrossoverMinutes,
      bandFromMinutes: bandFrom,
      bandToMinutes: bandTo,
      nowMinutes: result.minutes,
      xMax,
      yMax: chart_calculate_y_max(result.kwhPerMinute, result.bathKwh, xMax, CHART_Y_MIN_KWH),
      titleY: CHART_TITLE_Y_ENERGY,
    };

    const waterDrawn = chart_render_panel(waterCanvas, waterPanel);
    const energyDrawn = chart_render_panel(energyCanvas, energyPanel);

    const waterCaption = chart_describe_panel(PANEL_NAME_WATER, waterDrawn, waterPanel, display_format_litres);
    const energyCaption = chart_describe_panel(PANEL_NAME_ENERGY, energyDrawn, energyPanel, display_format_kwh);
    waterCanvas.setAttribute('aria-label', waterCaption);
    energyCanvas.setAttribute('aria-label', energyCaption);

    const together = result.merged
      ? `The two crossovers land on the same minute here, so the two dashed verticals sit on top of each other ` +
        `and there is one line to see rather than two.`
      : `The two dashed verticals are ${display_format_gap(result.crossoverGapMinutes)} apart, and the shaded band ` +
        `between them — drawn on both panels — is the stretch of minutes in which the model reports the shower ` +
        `ahead on one axis and behind on the other.`;

    legendNote.textContent =
      `Both panels share the same horizontal axis, minutes of shower. ${together} ` +
      `The dotted vertical marks the shower-time slider. ${waterCaption} ${energyCaption}`;
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(widget_update, RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  const onInput = () => widget_update_deferred();
  const onChange = () => widget_update();
  for (const slider of sliders) {
    widget_bind(slider.input, 'input', onInput);
    widget_bind(slider.input, 'change', onChange);
  }
  widget_bind(priceField.input, 'input', onInput);
  widget_bind(priceField.input, 'change', onChange);

  // 프리셋 버튼은 슬라이더 값을 갈아끼운 뒤 갱신을 **한 번만** 부른다.
  // 슬라이더마다 이벤트를 흉내내면 판정문이 다섯 번 갈린다.
  for (const preset of SHOWER_FLOW_PRESETS) {
    widget_bind(flowPresets.buttons[preset.key], 'click', () => {
      flowSlider.input.value = String(preset.flow);
      widget_update();
    });
  }
  for (const preset of SHOWER_SITUATION_PRESETS) {
    widget_bind(situationPresets.buttons[preset.key], 'click', () => {
      flowSlider.input.value = String(preset.state.flow);
      minutesSlider.input.value = String(preset.state.minutes);
      bathSlider.input.value = String(preset.state.bathLitres);
      riseShowerSlider.input.value = String(preset.state.riseShower);
      riseBathSlider.input.value = String(preset.state.riseBath);
      widget_update();
    });
  }

  widget_bind(window, 'resize', widget_redraw_deferred);

  widget_update();

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    recomputeTimer = 0;
    redrawTimer = 0;
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

/** 슬라이더 몇 개를 fieldset으로 묶는다. 스크린리더도 같은 묶음을 듣는다. */
function widget_build_group(titleText, rows) {
  const group = document.createElement('fieldset');
  group.className = 'widget-group';
  const title = document.createElement('legend');
  title.className = 'widget-group-title';
  title.textContent = titleText;
  group.append(title, ...rows);
  return group;
}

/**
 * 단가 입력 한 줄. **슬라이더가 아니다** — 비어 있는 상태가 있어야 하고,
 * 슬라이더에는 그런 상태가 없다.
 *
 * `type="text"` + `inputmode="decimal"`을 쓴다. `type="number"`는 브라우저마다
 * 빈 값·부분 입력을 다르게 돌려주고, 여기서는 십진수만 통과시키는 규칙
 * (`num_read_decimal`)을 한 곳에서 쓰고 싶다.
 */
function widget_build_price_field(price) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';
  const label = document.createElement('label');
  label.setAttribute('for', 'shower-price');
  label.textContent = 'Energy price per kWh (optional)';
  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.setAttribute('id', 'shower-price-hint');
  hint.textContent =
    'Type what one kilowatt-hour costs you, in whatever currency you pay in. Leave it empty and no cost is shown — the model has no tariff of its own.';
  labelBox.append(label, hint);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'widget-price';
  input.setAttribute('id', 'shower-price');
  input.setAttribute('inputmode', 'decimal');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('placeholder', 'e.g. 0.28');
  input.setAttribute('aria-describedby', 'shower-price-hint');
  input.value = price === null ? '' : String(price);

  row.append(labelBox, input);
  return { row, input, label, hint };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
