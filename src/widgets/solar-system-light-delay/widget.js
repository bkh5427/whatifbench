/**
 * 태양계 통신 지연 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 맡는다.
 * 상태는 URL 쿼리스트링에만 싣는다 (localStorage 금지).
 *
 * 화면에 있는 숫자는 하나도 여기서 만들어지지 않는다 —
 * 카드·곡선·막대·표가 전부 `model_calculate_*`의 반환값을 읽는다.
 */

import {
  BODIES,
  BODY_DEFAULT_KEY,
  MINUTES_PER_HOUR,
  ROUND_TRIP_DEFAULT,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  THETA_DEFAULT_DEG,
  THETA_MAX_DEG,
  THETA_MIN_DEG,
  THETA_STEP_DEG,
  TURNS_DEFAULT,
  TURNS_MAX,
  TURNS_MIN,
  TURNS_STEP,
  model_calculate_body_table,
  model_calculate_elliptic_band,
  model_calculate_result,
  model_calculate_sweep,
  model_clamp_body_key,
  model_clamp_theta,
  model_clamp_turns,
} from './model.js';

import { num_format_plural } from '../_shared/numbers.js';
import { layout_split } from '../_shared/layout.js';
import { ticks_build_decade, ticks_build_linear, ticks_calculate_step, ticks_drop_crowded } from '../_shared/ticks.js';
import { logscale_calculate_position } from '../_shared/logscale.js';
import { canvas_read_css_color, canvas_setup_context } from '../_shared/canvas.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import {
  control_build_button_group,
  control_build_readout,
  control_build_slider,
  control_build_table,
  control_build_table_row,
} from '../_shared/controls.js';

// ── DOM 훅 ──────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="solar-system-light-delay"]';

// ── URL 쿼리 키 ─────────────────────────────────────────────
const URL_KEY_BODY = 'body';
const URL_KEY_THETA = 'theta';
const URL_KEY_ROUND_TRIP = 'rt';
const URL_KEY_TURNS = 'turns';
const ROUND_TRIP_ON = 1;
const ROUND_TRIP_OFF = 0;

// ── 표시 형식 ───────────────────────────────────────────────
/** 이 값 아래는 초로 읽는다. 분으로 쓰면 "0.1 min"이 되어 아무 감이 안 온다. */
const DURATION_MINUTE_FLOOR_S = SECONDS_PER_MINUTE;
/** 이 값 이상은 시·분으로 읽는다. "258.4 min"은 사람이 시간으로 못 옮긴다. */
const DURATION_HOUR_FLOOR_S = SECONDS_PER_HOUR;
const DURATION_SECOND_DIGITS = 1;
const DURATION_MINUTE_DIGITS = 1;
const AU_DIGITS = 4;
const MILLION_KM_DIGITS = 1;
const SWING_DIGITS = 2;
/** 축 눈금 라벨의 유효숫자. 자릿수를 크기가 아니라 정밀도로 정한다. */
const AXIS_LABEL_SIGNIFICANT = 2;
const AXIS_LABEL_DECIMALS_MAX = 3;
const AXIS_LABEL_WHOLE_MIN = 10;
const RECOMPUTE_DELAY_MS = 110;

// ── θ 곡선 치수 ─────────────────────────────────────────────
const CHART_HEIGHT_PX = 300;
const CHART_PAD_TOP = 14;
const CHART_PAD_RIGHT = 16;
const CHART_PAD_BOTTOM = 52;
const CHART_PAD_LEFT = 62;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_GAP = 8;
const CHART_LABEL_MIN_GAP_PX = 10;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_CURVE_WIDTH_ONE_WAY = 2;
const CHART_CURVE_WIDTH_ROUND_TRIP = 3;
const CHART_ROUND_TRIP_DASH = [5, 4];
const CHART_CURSOR_DASH = [2, 3];
const CHART_GRID_WIDTH = 1;
const CHART_MARKER_RADIUS_PX = 4;
/** 세로축 위아래 여유(값 폭 대비). 곡선이 축선에 붙지 않게 한다. */
const CHART_PAD_RATIO = 0.06;
/** 축 스팬이 0이 될 때의 최소 표시 폭(분). 없으면 좌표가 NaN이 되어 아무것도 안 그려진다. */
const CHART_MIN_SPAN_MINUTES = 0.5;
/** x축 눈금 간격(도). 0·45·90·135·180이 되어 라벨과 위상이 맞는다. */
const CHART_THETA_TICK_DEG = 45;

// ── 막대 비교 치수 ──────────────────────────────────────────
const BARS_ROW_HEIGHT_PX = 24;
const BARS_PAD_TOP = 10;
const BARS_PAD_RIGHT = 16;
const BARS_PAD_LEFT = 68;
const BARS_AXIS_HEIGHT_PX = 40;
const BARS_HEIGHT_PX = BODIES.length * BARS_ROW_HEIGHT_PX + BARS_PAD_TOP + BARS_AXIS_HEIGHT_PX;
const BARS_BAR_HEIGHT_PX = 9;
const BARS_BAR_HEIGHT_CURRENT_PX = 14;
/** 흔들림이 없는 천체(태양)도 자리를 보이게 하는 최소 폭. */
const BARS_MIN_WIDTH_PX = 3;
/** 로그 축 양 끝 여유(데케이드). 막대가 축 끝에 붙지 않게 한다. */
const BARS_LOG_PAD_DECADES = 0.04;
const BARS_CARET_PX = 5;
const BARS_LABEL_GAP_PX = 8;

// ── 색 토큰 ─────────────────────────────────────────────────
const COLOR_VAR_ONE_WAY = '--series-1';
const COLOR_VAR_ROUND_TRIP = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_FALLBACK_ONE_WAY = '#1f4e79';
const COLOR_FALLBACK_ROUND_TRIP = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_VAR_PICKED = '--graphite';
const COLOR_FALLBACK_PICKED = '#2b2f33';

// ── 문구 ────────────────────────────────────────────────────
const NAME_ONE_WAY = 'one way';
const NAME_ROUND_TRIP = 'there and back';
const CHART_TITLE_X = 'Angle θ at the Sun (degrees)';
const CHART_TITLE_Y = 'Delay (minutes)';
const BARS_TITLE_X = 'One-way delay, minutes (log scale)';

/** 범례 칸. 색 견본 클래스는 global.css에 이미 있는 것만 쓴다. */
const CHART_LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: 'One way (solid)' },
  { swatch: 'legend-tail-2', label: 'There and back (dashed)' },
];
const BARS_LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: 'Closest to farthest' },
  { swatch: 'legend-picked', label: 'The one you picked' },
];

const VERDICT_HEADLINE = {
  hold: 'One number very nearly covers this delay.',
  edge: 'One number is already stretched here.',
  break: 'One number cannot stand for this delay.',
};
// 흔들림이 정확히 1.00×(태양)일 때 — "very nearly"가 아니라 그냥 덮는다.
const VERDICT_HEADLINE_EXACT = 'One number covers this delay.';

const TABLE_HEADINGS = [
  'Body',
  'Closest (au)',
  'Closest, one way',
  'Farthest (au)',
  'Farthest, one way',
  'Round trip, farthest',
  'Swing',
];

/**
 * 프리셋. 버튼 라벨만 읽고도 무엇이 로드되는지 알 수 있어야 한다.
 * 슬라이더를 하나도 움직이지 않는 독자가 보는 대표 배치들이다.
 */
export const PRESETS = [
  { key: 'mars-close', label: 'Mars at its closest', state: { bodyKey: 'mars', thetaDegrees: 0, roundTrip: true, turns: 8 } },
  { key: 'mars-far', label: 'Mars at its farthest', state: { bodyKey: 'mars', thetaDegrees: 180, roundTrip: true, turns: 8 } },
  { key: 'venus-close', label: 'Venus at its closest', state: { bodyKey: 'venus', thetaDegrees: 0, roundTrip: true, turns: 8 } },
  { key: 'sunlight', label: 'Sunlight reaching Earth', state: { bodyKey: 'sun', thetaDegrees: 0, roundTrip: false, turns: 1 } },
  { key: 'neptune-chat', label: 'Ten questions to Neptune', state: { bodyKey: 'neptune', thetaDegrees: 180, roundTrip: true, turns: 10 } },
];
export const PRESET_CUSTOM = 'custom';

// ── 표시 함수 ───────────────────────────────────────────────

/**
 * 지연 표기. 초 → 분 → 시·분으로 단위를 바꾼다.
 * 자릿수는 값의 크기가 아니라 **읽어야 하는 정밀도**로 고정한다.
 */
export function display_format_duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  // 단위는 **찍힐 값(반올림 뒤)**으로 고른다. 반올림 전 값으로 고르면
  // 59.96 s가 "60.0 s", 3599.7 s가 "60.0 min"이 된다 — 둘 다 윗단위의 몫이다.
  // 반올림은 정수 연산으로. (69 / 60).toFixed(1)은 부동소수 때문에 1.15를 "1.1"로 내린다.
  const secondScale = 10 ** DURATION_SECOND_DIGITS;
  const minuteScale = 10 ** DURATION_MINUTE_DIGITS;
  const secondsShown = Math.round(seconds * secondScale) / secondScale;
  if (secondsShown < DURATION_MINUTE_FLOOR_S) {
    return `${secondsShown.toFixed(DURATION_SECOND_DIGITS)} s`;
  }
  const minutesShown = Math.round((seconds * minuteScale) / SECONDS_PER_MINUTE) / minuteScale;
  if (minutesShown < DURATION_HOUR_FLOOR_S / SECONDS_PER_MINUTE) {
    return `${minutesShown.toFixed(DURATION_MINUTE_DIGITS)} min`;
  }
  let hours = Math.floor(seconds / SECONDS_PER_HOUR);
  let minutes = Math.round((seconds - hours * SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  // 59.6분이 60분으로 반올림되면 "3 h 60 min"이 된다. 그런 시각은 없다.
  if (minutes >= MINUTES_PER_HOUR) {
    hours += 1;
    minutes -= MINUTES_PER_HOUR;
  }
  return `${hours} h ${minutes} min`;
}

/** 같은 값을 초로도 적는다. 카드의 큰 숫자 옆에 붙는 대조값이다. */
export function display_format_seconds(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds.toLocaleString('en-US', {
    minimumFractionDigits: DURATION_SECOND_DIGITS,
    maximumFractionDigits: DURATION_SECOND_DIGITS,
  })} s`;
}

export function display_format_au(au) {
  if (!Number.isFinite(au)) return '—';
  return `${au.toFixed(AU_DIGITS)} au`;
}

export function display_format_million_km(millionKm) {
  if (!Number.isFinite(millionKm)) return '—';
  return `${millionKm.toLocaleString('en-US', {
    minimumFractionDigits: MILLION_KM_DIGITS,
    maximumFractionDigits: MILLION_KM_DIGITS,
  })} million km`;
}

export function display_format_swing(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  return `${ratio.toFixed(SWING_DIGITS)}×`;
}

export function display_format_degrees(degrees) {
  return `${Math.round(degrees)}°`;
}

/**
 * 축 눈금 라벨(분). 고정 소수 자릿수를 쓰지 않는다 —
 * 축이 2.3분에서 시작하는 화면과 240분에서 시작하는 화면이 같은 함수를 쓴다.
 */
export function display_format_axis_minutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes >= AXIS_LABEL_WHOLE_MIN) return String(Math.round(minutes));
  const decimals = Math.max(0, AXIS_LABEL_SIGNIFICANT - 1 - Math.floor(Math.log10(minutes)));
  return minutes.toFixed(Math.min(decimals, AXIS_LABEL_DECIMALS_MAX));
}

/**
 * 판정 문장. 평이한 한 문장 + 근거 숫자 하나, 그다음에 지금 설정의 값.
 * **주어는 언제나 모델이다** — "실제로 ~이다", "~하는 게 낫다"라고 쓰지 않는다.
 */
export function display_describe_verdict(result) {
  const name = result.body.name;
  const headline = result.swingRatio === 1 ? VERDICT_HEADLINE_EXACT : VERDICT_HEADLINE[result.verdict];

  const band =
    result.swingRatio > 1
      ? `The model puts the one-way delay to ${name} anywhere between ` +
        `${display_format_duration(result.closestSeconds)} and ${display_format_duration(result.farthestSeconds)} — ` +
        `${display_format_swing(result.swingRatio)} apart, decided by nothing but where the two are standing.`
      : `The model gives ${name} the same ${display_format_duration(result.closestSeconds)} at every angle, ` +
        `because the distance it uses is Earth's own orbital radius and θ cannot change it.`;

  const now =
    `At θ = ${display_format_degrees(result.thetaDegrees)} it reads ` +
    `${display_format_duration(result.oneWaySeconds)} ${NAME_ONE_WAY}, ` +
    `${display_format_duration(result.roundTripSeconds)} ${NAME_ROUND_TRIP}, and ` +
    `${display_format_duration(result.conversationSeconds)} for ${result.turns} ` +
    `${num_format_plural(result.turns, 'turn')} of a conversation.`;

  return { verdict: result.verdict, headline, detail: `${band} ${now}` };
}

/**
 * 원궤도 근사가 양 끝에서 얼마나 좁은지. **이 값은 화면의 다른 숫자를 만들지 않는다** —
 * 표 아래 한 줄로만 나가고, 카드·곡선·막대는 전부 원궤도 값이다.
 */
export function display_describe_elliptic_band(result) {
  const band = model_calculate_elliptic_band(result.body.key);
  return (
    `Everything above treats the orbits as circles. Feeding the same source's eccentricities into the ` +
    `two extreme line-ups instead puts ${result.body.name} between ` +
    `${display_format_duration(band.closestSeconds)} and ${display_format_duration(band.farthestSeconds)} one way, ` +
    `against ${display_format_duration(result.closestSeconds)} and ` +
    `${display_format_duration(result.farthestSeconds)} here. The circular figures are the ones this page uses.`
  );
}

/** θ 슬라이더가 무엇을 뜻하는지 한 문장으로. 태양은 θ가 아무 일도 하지 않는다. */
export function display_describe_theta(result) {
  if (result.swingRatio === 1) {
    return `The Sun sits at the centre of every orbit, so this slider is switched off — no angle changes the distance.`;
  }
  if (result.thetaDegrees === THETA_MIN_DEG) {
    return `Both are on the same side of the Sun, so the model subtracts the two orbital radii.`;
  }
  if (result.thetaDegrees === THETA_MAX_DEG) {
    return `The Sun is between the two, so the model adds the two orbital radii.`;
  }
  return `The model takes the straight chord between the two circles at this angle.`;
}

// ── URL 상태 ────────────────────────────────────────────────

export function url_read_state(search) {
  const numbers = urlstate_read_numbers(search, {
    [URL_KEY_THETA]: { fallback: THETA_DEFAULT_DEG, clamp: model_clamp_theta },
    [URL_KEY_TURNS]: { fallback: TURNS_DEFAULT, clamp: model_clamp_turns },
    [URL_KEY_ROUND_TRIP]: {
      fallback: ROUND_TRIP_DEFAULT ? ROUND_TRIP_ON : ROUND_TRIP_OFF,
      clamp: (value) => (value >= ROUND_TRIP_ON ? ROUND_TRIP_ON : ROUND_TRIP_OFF),
    },
  });
  // 천체는 숫자가 아니다. 목록에 없는 이름은 기본 천체로 되돌린다 (첫 천체가 아니라).
  const params = new URLSearchParams(search ?? '');
  return {
    bodyKey: model_clamp_body_key(params.get(URL_KEY_BODY)),
    thetaDegrees: numbers[URL_KEY_THETA],
    roundTrip: numbers[URL_KEY_ROUND_TRIP] === ROUND_TRIP_ON,
    turns: numbers[URL_KEY_TURNS],
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_BODY]: state.bodyKey,
    [URL_KEY_THETA]: state.thetaDegrees,
    [URL_KEY_ROUND_TRIP]: state.roundTrip ? ROUND_TRIP_ON : ROUND_TRIP_OFF,
    [URL_KEY_TURNS]: state.turns,
  });
}

/** 지금 상태와 값이 같은 프리셋의 키. 없으면 custom — 버튼이 거짓말을 하지 않게. */
export function state_pick_matching_preset(state) {
  const found = PRESETS.find(
    (preset) =>
      preset.state.bodyKey === state.bodyKey &&
      preset.state.thetaDegrees === state.thetaDegrees &&
      preset.state.roundTrip === state.roundTrip &&
      preset.state.turns === state.turns,
  );
  return found ? found.key : PRESET_CUSTOM;
}

// ── θ 곡선 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/**
 * 세로축 범위를 데이터에서 정한다. 0~100처럼 고정하면 태양(8분)과 해왕성(516분)이
 * 같은 축을 쓰게 되어 한쪽 곡선이 바닥에 눌린다.
 * 두 값이 거의 같아도 최소 표시 폭을 준다 — 스팬이 0이면 좌표가 NaN이다.
 */
export function chart_calculate_scale(points) {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    for (const seconds of [point.oneWaySeconds, point.roundTripSeconds]) {
      if (!Number.isFinite(seconds)) continue;
      const minutes = seconds / SECONDS_PER_MINUTE;
      if (minutes < low) low = minutes;
      if (minutes > high) high = minutes;
    }
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { low: 0, high: CHART_MIN_SPAN_MINUTES };

  const pad = Math.max((high - low) * CHART_PAD_RATIO, CHART_MIN_SPAN_MINUTES / 2);
  let paddedLow = Math.max(0, low - pad);
  let paddedHigh = high + pad;
  if (paddedHigh - paddedLow < CHART_MIN_SPAN_MINUTES) {
    const middle = (paddedHigh + paddedLow) / 2;
    paddedLow = Math.max(0, middle - CHART_MIN_SPAN_MINUTES / 2);
    paddedHigh = paddedLow + CHART_MIN_SPAN_MINUTES;
  }
  return { low: paddedLow, high: paddedHigh };
}

function chart_calculate_x(thetaDegrees, plotWidth) {
  return ((thetaDegrees - THETA_MIN_DEG) / (THETA_MAX_DEG - THETA_MIN_DEG)) * plotWidth;
}

function chart_calculate_y(minutes, plotHeight, scale) {
  const ratio = (minutes - scale.low) / (scale.high - scale.low);
  return plotHeight - ratio * plotHeight;
}

function chart_draw_series(context, points, key, plotWidth, plotHeight, scale, style) {
  context.save();
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.setLineDash(style.dash ?? []);
  context.beginPath();
  points.forEach((point, index) => {
    const x = chart_calculate_x(point.thetaDegrees, plotWidth);
    const y = chart_calculate_y(point[key] / SECONDS_PER_MINUTE, plotHeight, scale);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();
}

/**
 * θ에 대한 지연 곡선. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 */
export function chart_render_sweep(canvasEl, points, result) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup || points.length === 0) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);
  const scale = chart_calculate_scale(points);

  const colorOneWay = chart_read_color(canvasEl, COLOR_VAR_ONE_WAY, COLOR_FALLBACK_ONE_WAY);
  const colorRoundTrip = chart_read_color(canvasEl, COLOR_VAR_ROUND_TRIP, COLOR_FALLBACK_ROUND_TRIP);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로 눈금 ──
  const yStep = ticks_calculate_step(scale.high - scale.low);
  const yValues = ticks_build_linear(scale.low, scale.high, yStep);
  const yKept = ticks_drop_crowded(
    yValues.map((value) => ({ value, position: chart_calculate_y(value, plotHeight, scale), width: 0 })),
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
    context.fillText(display_format_axis_minutes(item.value), -CHART_LABEL_GAP, item.position);
  }

  // ── 가로 눈금 ──
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const value of ticks_build_linear(THETA_MIN_DEG, THETA_MAX_DEG, CHART_THETA_TICK_DEG)) {
    context.fillText(display_format_degrees(value), chart_calculate_x(value, plotWidth), plotHeight + CHART_LABEL_GAP);
  }

  // ── 지금 θ 커서 ──
  const cursorX = chart_calculate_x(result.thetaDegrees, plotWidth);
  context.save();
  context.strokeStyle = colorAxis;
  context.setLineDash(CHART_CURSOR_DASH);
  context.beginPath();
  context.moveTo(cursorX, 0);
  context.lineTo(cursorX, plotHeight);
  context.stroke();
  context.restore();

  // ── 곡선 둘 ──
  chart_draw_series(context, points, 'roundTripSeconds', plotWidth, plotHeight, scale, {
    color: colorRoundTrip,
    width: CHART_CURVE_WIDTH_ROUND_TRIP,
    dash: CHART_ROUND_TRIP_DASH,
  });
  chart_draw_series(context, points, 'oneWaySeconds', plotWidth, plotHeight, scale, {
    color: colorOneWay,
    width: CHART_CURVE_WIDTH_ONE_WAY,
  });

  // ── 지금 값 표시점 ──
  context.fillStyle = colorOneWay;
  context.beginPath();
  context.arc(
    cursorX,
    chart_calculate_y(result.oneWaySeconds / SECONDS_PER_MINUTE, plotHeight, scale),
    CHART_MARKER_RADIUS_PX,
    0,
    Math.PI * 2,
  );
  context.fill();

  // ── 축선·축 제목 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(CHART_TITLE_X, plotWidth / 2, plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP);
  context.save();
  context.translate(-CHART_PAD_LEFT + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  context.fillText(CHART_TITLE_Y, 0, 0);
  context.restore();

  context.restore();
  return { scale };
}

// ── 천체별 막대 (가로 로그 축) ──────────────────────────────

/**
 * 여덟 천체의 최근접–최원 구간을 한 로그 축에 나란히 둔다.
 * 막대 **길이**가 흔들림, 막대 **위치**가 거리다 — 곡선이 할 수 없는 비교가 이것이다.
 */
export function chart_calculate_body_scale(rows) {
  let low = Number.POSITIVE_INFINITY;
  let high = 0;
  for (const row of rows) {
    const closest = row.closestSeconds / SECONDS_PER_MINUTE;
    const farthest = row.farthestSeconds / SECONDS_PER_MINUTE;
    if (closest > 0 && closest < low) low = closest;
    if (farthest > high) high = farthest;
  }
  // 로그 축의 진입점을 방어한다. log(0) = −Infinity, log(음수) = NaN이다.
  if (!(low > 0) || !(high > low) || !Number.isFinite(low) || !Number.isFinite(high)) {
    return { low: 1, high: 10 };
  }
  return {
    low: Math.pow(10, Math.log10(low) - BARS_LOG_PAD_DECADES),
    high: Math.pow(10, Math.log10(high) + BARS_LOG_PAD_DECADES),
  };
}

export function chart_render_bodies(canvasEl, rows, currentKey) {
  const setup = canvas_setup_context(canvasEl, BARS_HEIGHT_PX);
  if (!setup || rows.length === 0) return null;
  const { context, width } = setup;

  const plotWidth = Math.max(1, width - BARS_PAD_LEFT - BARS_PAD_RIGHT);
  const scale = chart_calculate_body_scale(rows);

  const colorBand = chart_read_color(canvasEl, COLOR_VAR_ONE_WAY, COLOR_FALLBACK_ONE_WAY);
  // 고른 막대는 흑연색. 주황(--series-2)은 바로 위 곡선에서 '왕복'이라, 여기서
  // 같은 색을 쓰면 편도 막대가 왕복으로 읽힌다.
  const colorCurrent = chart_read_color(canvasEl, COLOR_VAR_PICKED, COLOR_FALLBACK_PICKED);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  /** 분 값을 막대 영역의 x 좌표로. 축 밖이면 null — 조용히 끝에 붙이지 않는다. */
  function chart_calculate_body_x(minutes) {
    const placed = logscale_calculate_position(minutes, scale.low, scale.high);
    return placed === null ? null : placed.ratio * plotWidth;
  }

  context.save();
  context.translate(BARS_PAD_LEFT, BARS_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  const plotHeight = rows.length * BARS_ROW_HEIGHT_PX;

  // ── 데케이드 격자 ──
  const decades = ticks_build_decade(scale.low, scale.high);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const value of decades) {
    const x = chart_calculate_body_x(value);
    if (x === null) continue;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, plotHeight);
    context.stroke();
    context.fillText(display_format_axis_minutes(value), x, plotHeight + CHART_LABEL_GAP);
  }

  // ── 막대 여덟 개 ──
  rows.forEach((row, index) => {
    const current = row.body.key === currentKey;
    const centreY = index * BARS_ROW_HEIGHT_PX + BARS_ROW_HEIGHT_PX / 2;
    const barHeight = current ? BARS_BAR_HEIGHT_CURRENT_PX : BARS_BAR_HEIGHT_PX;

    context.fillStyle = colorText;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(row.body.label, -BARS_LABEL_GAP_PX, centreY);

    // 고른 천체는 색만이 아니라 굵기와 삼각 표시로도 갈린다.
    if (current) {
      context.fillStyle = colorAxis;
      context.beginPath();
      context.moveTo(-BARS_CARET_PX, centreY - BARS_CARET_PX);
      context.lineTo(0, centreY);
      context.lineTo(-BARS_CARET_PX, centreY + BARS_CARET_PX);
      context.fill();
    }

    const startX = chart_calculate_body_x(row.closestSeconds / SECONDS_PER_MINUTE);
    const endX = chart_calculate_body_x(row.farthestSeconds / SECONDS_PER_MINUTE);
    if (startX === null || endX === null) return;
    context.fillStyle = current ? colorCurrent : colorBand;
    context.fillRect(
      startX,
      centreY - barHeight / 2,
      Math.max(BARS_MIN_WIDTH_PX, endX - startX),
      barHeight,
    );
  });

  // ── 축선·축 제목 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(BARS_TITLE_X, plotWidth / 2, plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP);

  context.restore();
  return { scale };
}

// ── 토글 ────────────────────────────────────────────────────

/**
 * 편도 ↔ 왕복. 라디오 그룹이라 화살표 키 이동이 그대로 따라온다.
 * `id`는 속성으로 쓴다 — `aria-describedby`가 가리키는 자리가 실제로 있는지
 * 테스트가 확인할 수 있어야 한다.
 */
function widget_build_toggle(name, labelText, hintText, roundTrip) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';
  const label = document.createElement('span');
  label.setAttribute('id', `${name}-label`);
  label.textContent = labelText;
  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.setAttribute('id', `${name}-hint`);
  hint.textContent = hintText;
  labelBox.append(label, hint);

  const group = document.createElement('div');
  group.className = 'widget-toggle';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', `${name}-label`);
  group.setAttribute('aria-describedby', `${name}-hint`);

  const inputs = {};
  for (const option of [
    { key: 'one', text: 'One way', checked: !roundTrip },
    { key: 'both', text: 'There and back', checked: roundTrip },
  ]) {
    const wrap = document.createElement('label');
    wrap.className = 'widget-toggle-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.key;
    input.checked = option.checked;
    const text = document.createElement('span');
    text.textContent = option.text;
    wrap.append(input, text);
    group.appendChild(wrap);
    inputs[option.key] = input;
  }

  row.append(labelBox, group);
  return { row, inputs };
}

// ── 위젯 ────────────────────────────────────────────────────

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  // 모듈이 두 번 평가되면(HMR, 스크립트 중복) 같은 자리에 위젯이 두 벌 붙는다.
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const state = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Light delay across the Solar System';

  // ── 프리셋 ──
  const presets = control_build_button_group(
    'Jump straight to a case',
    PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // ── 천체 고르기 ──
  const bodyPicker = control_build_button_group(
    'Who you are talking to',
    BODIES.map((body) => ({ key: body.key, label: body.label })),
  );

  // ── 슬라이더·토글 ──
  const thetaSlider = control_build_slider(
    'ssld-theta',
    'How far around its orbit the other body is',
    'The angle θ measured at the Sun, between Earth and the target. 0° puts both on the same side of the Sun, which is as close as they get; 180° puts the Sun between them, which is as far as they get. Try sweeping slowly across the range and watching the curve below — the steepest stretch is not at the halfway mark.',
    { min: THETA_MIN_DEG, max: THETA_MAX_DEG, step: THETA_STEP_DEG, value: state.thetaDegrees },
  );
  const toggle = widget_build_toggle(
    'ssld-trip',
    'What the big number counts',
    'One way is the signal going out. There and back is the same trip doubled, because the reply travels the same distance home.',
    state.roundTrip,
  );
  const turnsSlider = control_build_slider(
    'ssld-turns',
    'How many times you each speak',
    'One turn is a question and its answer. Everybody replies the instant the message lands, so this only counts travel.',
    { min: TURNS_MIN, max: TURNS_MAX, step: TURNS_STEP, value: state.turns },
  );

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(presets.group, bodyPicker.group, thetaSlider.row, toggle.row, turnsSlider.row);

  // ── 판정 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 카드 ──
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const cards = {
    delay: control_build_readout('Signal delay now', ''),
    distance: control_build_readout('Distance now', ''),
    conversation: control_build_readout('Whole conversation', ''),
    swing: control_build_readout('Closest to farthest', ''),
  };
  readouts.append(cards.delay.box, cards.distance.box, cards.conversation.box, cards.swing.box);

  // ── θ 곡선 ──
  const chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'widget-chart';
  chartCanvas.setAttribute('role', 'img');
  const chartLegend = widget_build_legend(CHART_LEGEND_KEYS);
  const chartNote = document.createElement('p');
  chartNote.className = 'legend-note';

  // ── 천체 막대 ──
  const barsCanvas = document.createElement('canvas');
  barsCanvas.className = 'widget-chart';
  barsCanvas.setAttribute('role', 'img');
  const barsLegend = widget_build_legend(BARS_LEGEND_KEYS);
  const barsNote = document.createElement('p');
  barsNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table('Every body, closest and farthest', TABLE_HEADINGS);
  const tableNote = document.createElement('p');
  tableNote.className = 'legend-note';

  rootEl.append(
    heading,
    controls,
    verdict,
    readouts,
    chartCanvas,
    chartLegend,
    chartNote,
    barsCanvas,
    barsLegend,
    barsNote,
    table.scroll,
    tableNote,
  );
  // 조작부·결과·자세히를 나눠 감싼다 — 결과가 조작부 옆(넓은 화면)·위(좁은 화면)에 보인다.
  layout_split(rootEl);

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastResult = null;
  let lastPoints = [];
  let lastRows = [];

  function state_read_controls() {
    return {
      bodyKey: state.bodyKey,
      thetaDegrees: model_clamp_theta(Number(thetaSlider.input.value)),
      roundTrip: Boolean(toggle.inputs.both.checked),
      turns: model_clamp_turns(Number(turnsSlider.input.value)),
    };
  }

  function display_show_controls(current, result) {
    thetaSlider.input.value = String(current.thetaDegrees);
    turnsSlider.input.value = String(current.turns);
    toggle.inputs.one.checked = !current.roundTrip;
    toggle.inputs.both.checked = current.roundTrip;

    thetaSlider.output.textContent = display_format_degrees(current.thetaDegrees);
    turnsSlider.output.textContent = `${current.turns} ${num_format_plural(current.turns, 'turn')}`;

    // 슬라이더 숫자만으로는 무슨 뜻인지 알 수 없다. 실제 값을 같이 읽어 준다.
    thetaSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_degrees(current.thetaDegrees)}, one way ${display_format_duration(result.oneWaySeconds)}`,
    );
    turnsSlider.input.setAttribute(
      'aria-valuetext',
      `${current.turns} ${num_format_plural(current.turns, 'turn')}, ` +
        `${display_format_duration(result.conversationSeconds)} in total`,
    );

    // 태양은 θ가 아무 일도 하지 않는다. 움직여도 값이 안 변하는 손잡이를 남겨두지 않는다.
    const frozen = result.swingRatio === 1;
    thetaSlider.input.disabled = frozen;
    if (frozen) thetaSlider.input.setAttribute('aria-disabled', 'true');
    else thetaSlider.input.removeAttribute('aria-disabled');

    for (const [key, button] of Object.entries(bodyPicker.buttons)) {
      button.setAttribute('aria-pressed', String(key === current.bodyKey));
    }
    const matching = state_pick_matching_preset(current);
    for (const [key, button] of Object.entries(presets.buttons)) {
      button.setAttribute('aria-pressed', String(key === matching));
    }
  }

  function display_show_cards(result) {
    const legName = result.roundTrip ? NAME_ROUND_TRIP : NAME_ONE_WAY;
    const otherName = result.roundTrip ? NAME_ONE_WAY : NAME_ROUND_TRIP;
    const otherSeconds = result.roundTrip ? result.oneWaySeconds : result.roundTripSeconds;

    cards.delay.box.querySelector('.readout-label').textContent = `Signal delay, ${legName}`;
    cards.delay.value.textContent = display_format_duration(result.shownSeconds);
    cards.delay.unit.textContent =
      `${display_format_seconds(result.shownSeconds)} · ${display_format_duration(otherSeconds)} ${otherName}`;

    cards.distance.value.textContent = display_format_au(result.distanceAu);
    cards.distance.unit.textContent = display_format_million_km(result.distanceMillionKm);

    cards.conversation.box.querySelector('.readout-label').textContent =
      `${result.turns} ${num_format_plural(result.turns, 'turn')} of conversation`;
    cards.conversation.value.textContent = display_format_duration(result.conversationSeconds);
    cards.conversation.unit.textContent =
      `${result.turns} × ${display_format_duration(result.roundTripSeconds)} ${NAME_ROUND_TRIP}`;

    cards.swing.value.textContent = display_format_swing(result.swingRatio);
    cards.swing.unit.textContent =
      `${display_format_duration(result.closestSeconds)} → ${display_format_duration(result.farthestSeconds)} ${NAME_ONE_WAY}`;
  }

  function display_show_table(result) {
    table.body.textContent = '';
    for (const row of lastRows) {
      table.body.appendChild(
        control_build_table_row(
          [
            row.body.label,
            row.closestAu.toFixed(AU_DIGITS - 1),
            display_format_duration(row.closestSeconds),
            row.farthestAu.toFixed(AU_DIGITS - 1),
            display_format_duration(row.farthestSeconds),
            display_format_duration(row.roundTripFarthestSeconds),
            display_format_swing(row.swingRatio),
          ],
          { current: row.body.key === result.body.key },
        ),
      );
    }
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. 계산 경로는 여기 하나뿐이다. */
  function widget_update(next = null) {
    const current = next ?? state_read_controls();
    state.bodyKey = model_clamp_body_key(current.bodyKey);
    state.thetaDegrees = model_clamp_theta(current.thetaDegrees);
    state.roundTrip = Boolean(current.roundTrip);
    state.turns = model_clamp_turns(current.turns);

    const result = model_calculate_result(state.bodyKey, state.thetaDegrees, state.roundTrip, state.turns);
    lastResult = result;
    lastPoints = model_calculate_sweep(state.bodyKey);
    lastRows = model_calculate_body_table();

    display_show_controls(state, result);
    display_show_cards(result);
    display_show_table(result);

    const spoken = display_describe_verdict(result);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    tableNote.textContent = display_describe_elliptic_band(result);

    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const drawnChart = chart_render_sweep(chartCanvas, lastPoints, lastResult);
    const drawnBars = chart_render_bodies(barsCanvas, lastRows, lastResult.body.key);

    const chartLead =
      `One-way delay to ${lastResult.body.name} against the angle θ, with the round trip above it. ` +
      `${display_describe_theta(lastResult)}`;
    // 캡션이 인용하는 축 값은 렌더가 실제로 쓴 값이다. 축을 다시 계산하지 않는다.
    chartNote.textContent = drawnChart
      ? `${chartLead} Vertical axis ${display_format_axis_minutes(drawnChart.scale.low)}–` +
        `${display_format_axis_minutes(drawnChart.scale.high)} minutes, rescaled for each body — ` +
        `read it before comparing two screens. The dotted line marks where the θ slider sits.`
      : chartLead;

    const barsLead =
      `Each bar runs from a body's closest one-way delay to its farthest, all on one logarithmic axis, ` +
      `so bar length is the swing and bar position is the distance.`;
    barsNote.textContent = drawnBars
      ? `${barsLead} Axis ${display_format_axis_minutes(drawnBars.scale.low)}–` +
        `${display_format_axis_minutes(drawnBars.scale.high)} minutes. The Sun's bar is a mark rather than a ` +
        `band, because its swing is ${display_format_swing(1)}.`
      : barsLead;

    const spoken = display_describe_verdict(lastResult);
    chartCanvas.setAttribute('aria-label', `${spoken.headline} ${spoken.detail}`);
    barsCanvas.setAttribute(
      'aria-label',
      `${barsLead} ${lastRows
        .map(
          (row) =>
            `${row.body.label} ${display_format_duration(row.closestSeconds)} to ` +
            `${display_format_duration(row.farthestSeconds)}`,
        )
        .join('; ')}.`,
    );
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(() => widget_update(), RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  function widget_load_preset(key) {
    const preset = PRESETS.find((entry) => entry.key === key);
    if (preset) widget_update({ ...preset.state });
  }

  function widget_pick_body(key) {
    widget_update({ ...state_read_controls(), bodyKey: key });
  }

  // 붙인 리스너를 그대로 들고 있어야 뗄 수 있다.
  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  const onInput = () => widget_update_deferred();
  const onChange = () => widget_update();
  for (const slider of [thetaSlider, turnsSlider]) {
    widget_bind(slider.input, 'input', onInput);
    widget_bind(slider.input, 'change', onChange);
  }
  for (const input of Object.values(toggle.inputs)) {
    widget_bind(input, 'change', onChange);
  }
  for (const [key, button] of Object.entries(bodyPicker.buttons)) {
    widget_bind(button, 'click', () => widget_pick_body(key));
  }
  for (const [key, button] of Object.entries(presets.buttons)) {
    widget_bind(button, 'click', () => widget_load_preset(key));
  }
  widget_bind(window, 'resize', widget_redraw_deferred);

  widget_update({ ...state });

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

/** 범례 한 줄. 견본 클래스는 global.css에 이미 있는 것만 쓴다 — 새 이름을 짓지 않는다. */
function widget_build_legend(keys) {
  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  for (const key of keys) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = `legend-key ${key.swatch}`;
    item.append(swatch, document.createTextNode(` ${key.label}`));
    legend.appendChild(item);
  }
  return legend;
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
