/**
 * 속도 vs 절약 시간 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에만 싣는다 (localStorage 금지).
 *
 * **위젯이 들고 있는 상태는 언제나 SI다.** 슬라이더의 숫자와 화면의 글자만
 * 표시 단위로 바뀐다 — km/h ↔ mph 토글이 바꾸는 것은 눈금과 라벨이고,
 * 트립 자체가 아니다.
 */
import {
  SECONDS_PER_MINUTE,
  UNIT_KMH,
  UNIT_MPH,
  UNIT_DEFAULT,
  UNIT_KEYS,
  DISTANCE_LADDER,
  DISTANCE_INDEX_MIN,
  DISTANCE_INDEX_MAX,
  DISTANCE_INDEX_STEP,
  DISTANCE_DEFAULT_UNITS,
  SPEED_FROM_DEFAULT_MS,
  SPEED_TO_DEFAULT_MS,
  DELAY_MIN_MINUTES,
  DELAY_MAX_MINUTES,
  DELAY_STEP_MINUTES,
  DELAY_DEFAULT_MINUTES,
  model_read_unit,
  model_calculate_speed_to_ms,
  model_calculate_speed_from_ms,
  model_calculate_distance_to_metres,
  model_calculate_distance_from_metres,
  model_calculate_speed_range,
  model_read_distance_index,
  model_clamp_distance_index,
  model_clamp_distance,
  model_clamp_speed_from,
  model_clamp_speed_to,
  model_clamp_delay_minutes,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_curve,
  model_calculate_increase_table,
} from './model.js';

import { num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear } from '../_shared/ticks.js';
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
const ROOT_SELECTOR = '[data-widget="speed-vs-time-saved"]';

// ── 슬라이더 id ────────────────────────────────────────────
const ID_DISTANCE = 'speed-distance';
const ID_FROM = 'speed-from';
const ID_TO = 'speed-to';
const ID_DELAY = 'speed-delay';
const ID_UNIT = 'speed-unit';

// ── URL 쿼리 키 ────────────────────────────────────────────
/** 거리와 속도는 언제나 km·km/h로 싣는다 — 링크의 뜻이 표시 단위에 흔들리지 않게. */
const URL_KEY_DISTANCE = 'd';
const URL_KEY_FROM = 'v1';
const URL_KEY_TO = 'v2';
const URL_KEY_DELAY = 't';
const URL_KEY_UNIT = 'u';
/** 주소창에 싣는 소수 자릿수. 마일에서 넘어온 값도 이 자리면 왕복해서 같은 칸에 붙는다. */
const URL_DIGITS = 6;

// ── 표시 형식 ──────────────────────────────────────────────
/**
 * 분 표기의 자릿수는 값의 '크기'가 아니라 **읽어야 하는 정밀도**로 정한다.
 * 1분 아래에서 두 자리만 쓰면 0.014분과 0.019분이 둘 다 "0.01분"이 된다.
 */
const MINUTE_SMALL_THRESHOLD = 1;
const MINUTE_SMALL_DIGITS = 3;
const MINUTE_MEDIUM_THRESHOLD = 10;
const MINUTE_MEDIUM_DIGITS = 2;
const MINUTE_LARGE_DIGITS = 1;
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
const SPEED_DIGITS = 0;
/** 거리 표기의 유효숫자. 마일 왕복 환산이 남기는 6.999999999999999를 잘라낸다. */
const DISTANCE_SIGNIFICANT = 6;
const SECOND_DIGITS = 0;
const RECOMPUTE_DELAY_MS = 110;
/** 프리셋이 지금 상태와 같은지 볼 때의 허용 오차(초). 왕복 환산 오차만 삼킨다. */
const PRESET_MATCH_EPSILON = 1e-6;

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 320;
const CHART_PAD_TOP = 18;
const CHART_PAD_RIGHT = 18;
const CHART_PAD_BOTTOM = 54;
const CHART_PAD_LEFT = 62;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_CURVE_WIDTH = 2.5;
const CHART_GRID_WIDTH = 1;
const CHART_CEILING_WIDTH = 2;
const CHART_CEILING_DASH = [6, 4];
const CHART_CURSOR_DASH = [2, 3];
const CHART_CURSOR_RADIUS = 4;
/** 천장선이 위 테두리에 붙지 않게 두는 여유(세로축 비율). */
const CHART_TOP_PAD_RATIO = 0.08;
/** 세로축이 0이 되는 것을 막는 최소 표시 폭(분). 없으면 좌표가 NaN이 된다. */
const CHART_MIN_SPAN_MINUTES = 0.01;
/** 축 라벨의 유효숫자. 축이 좁아지면 자릿수를 늘려야 1분 단위로 뭉개지지 않는다. */
const AXIS_LABEL_SIGNIFICANT = 3;
const AXIS_LABEL_DECIMALS_MAX = 3;

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_CURVE = '--series-1';
const COLOR_VAR_CEILING = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_FALLBACK_CURVE = '#1f4e79';
const COLOR_FALLBACK_CEILING = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';

// ── 문구 ───────────────────────────────────────────────────
const CHART_TITLE_Y = 'Time saved (minutes)';
/**
 * 가로축 제목. 단위 라벨만 바뀌므로 자리표시자를 두고 렌더에서 치운다 —
 * 제목은 두 축 모두 여기에 산다. 렌더 함수 안에 문구를 두지 않는다.
 */
const CHART_TITLE_X_UNIT_TOKEN = '{unit}';
const CHART_TITLE_X = `Raised speed (${CHART_TITLE_X_UNIT_TOKEN}, linear)`;
const LEGEND_CURVE_LABEL = 'Time saved';
const LEGEND_CEILING_LABEL = 'Ceiling d/v₁';
const LEGEND_KEY_TEXT =
  'Solid = minutes saved by the raised speed. Dashed = the ceiling d/v₁, the whole moving time of the original trip.';
const VERDICT_HEADLINE = {
  hold: 'The model returns very little time here.',
  edge: 'The model returns a noticeable slice of the trip.',
  break: 'The model returns a large slice of the trip.',
};
const TABLE_HEADINGS = ['Starting speed', 'Raised to', 'Time saved', 'Share of trip'];

/**
 * 프리셋. **단위마다 따로 적는다** — mph 화면에서 "10 km, 40 → 60"을 누르게 할
 * 수는 없다. 버튼 라벨은 이 숫자에서 만들어지므로 라벨과 로드되는 값이 갈릴 수 없다.
 */
export const PRESETS = {
  [UNIT_KMH]: [
    { key: 'city', name: 'City run', distance: 10, from: 40, to: 60, delay: 0 },
    { key: 'lights', name: 'Short hop, lights', distance: 5, from: 30, to: 50, delay: 6 },
    { key: 'motorway', name: 'Motorway', distance: 300, from: 110, to: 130, delay: 0 },
    { key: 'longhaul', name: 'Long haul', distance: 500, from: 100, to: 120, delay: 0 },
  ],
  [UNIT_MPH]: [
    { key: 'city', name: 'City run', distance: 5, from: 25, to: 40, delay: 0 },
    { key: 'lights', name: 'Short hop, lights', distance: 3, from: 20, to: 30, delay: 6 },
    { key: 'motorway', name: 'Motorway', distance: 200, from: 65, to: 80, delay: 0 },
    { key: 'longhaul', name: 'Long haul', distance: 300, from: 60, to: 75, delay: 0 },
  ],
};

export const PRESET_KEYS = PRESETS[UNIT_KMH].map((preset) => preset.key);

// ── 표시 함수 ──────────────────────────────────────────────

/** 분. 초안이 인용하는 8.00 / 5.00 / 15.0 / 21.0이 이 규칙에서 그대로 나온다. */
export function display_format_minutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < MINUTE_SMALL_THRESHOLD) return minutes.toFixed(MINUTE_SMALL_DIGITS);
  if (minutes < MINUTE_MEDIUM_THRESHOLD) return minutes.toFixed(MINUTE_MEDIUM_DIGITS);
  return minutes.toFixed(MINUTE_LARGE_DIGITS);
}

export function display_format_seconds(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return seconds.toFixed(SECOND_DIGITS);
}

/** 백분율의 숫자만. 카드의 값과 단위를 따로 채워야 해서 둘로 나눠 둔다. */
export function display_format_percent_number(share) {
  if (!Number.isFinite(share)) return '—';
  return (share * PERCENT_SCALE).toFixed(PERCENT_DIGITS);
}

export function display_format_percent(share) {
  if (!Number.isFinite(share)) return '—';
  return `${display_format_percent_number(share)}%`;
}

export function display_format_speed(speedMs, unitKey) {
  const unit = model_read_unit(unitKey);
  return `${model_calculate_speed_from_ms(speedMs, unitKey).toFixed(SPEED_DIGITS)} ${unit.speedLabel}`;
}

/**
 * 거리는 언제나 사다리 칸 위에 있다. 그래도 마일↔미터 왕복이 6.999999999999999를
 * 남기므로 유효숫자로 한 번 자른다 — 안 자르면 카드에 그 열여섯 자리가 그대로 찍힌다.
 */
export function display_format_distance(distanceMetres, unitKey) {
  const unit = model_read_unit(unitKey);
  const value = model_calculate_distance_from_metres(distanceMetres, unitKey);
  if (!Number.isFinite(value)) return '—';
  return `${Number(value.toPrecision(DISTANCE_SIGNIFICANT))} ${unit.distanceLabel}`;
}

/**
 * 축 눈금 라벨. **고정 자릿수를 쓰지 않는다** — 축이 좁아지면 1분 단위로 뭉개져
 * 눈금 셋이 전부 "0"이나 "1"로 찍힌다.
 */
export function display_format_axis_minutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes === 0) return '0';
  const size = Math.abs(minutes);
  const decimals = Math.max(0, AXIS_LABEL_SIGNIFICANT - 1 - Math.floor(Math.log10(size)));
  return minutes.toFixed(Math.min(decimals, AXIS_LABEL_DECIMALS_MAX));
}

/** 프리셋 버튼의 글자. 버튼 라벨만 읽고도 무엇이 로드되는지 알 수 있어야 한다. */
export function display_describe_preset(preset, unitKey) {
  const unit = model_read_unit(unitKey);
  const delay = preset.delay > 0 ? ` +${preset.delay} min` : '';
  return `${preset.name} · ${preset.distance} ${unit.distanceLabel}, ${preset.from}→${preset.to}${delay}`;
}

/**
 * 판정 문장. 평이한 한 문장 + 근거 숫자 하나, 나머지는 뒤 문장으로.
 * **주어는 언제나 모델이다.** 이 페이지는 속도·안전·연비에 대한 권고를 쓰지 않는다.
 */
export function display_describe_verdict(result, unitKey) {
  const verdict = model_calculate_verdict(result.savedShare);
  const savedMinutes = result.savedSeconds / SECONDS_PER_MINUTE;
  const tripMinutes = result.totalFromSeconds / SECONDS_PER_MINUTE;
  const ceilingMinutes = result.ceilingSeconds / SECONDS_PER_MINUTE;

  const headline =
    `${VERDICT_HEADLINE[verdict]} It puts the saving at ${display_format_minutes(savedMinutes)} ` +
    `${num_format_plural(Number(display_format_minutes(savedMinutes)), 'minute')}, ` +
    `${display_format_percent(result.savedShare)} of the ${display_format_minutes(tripMinutes)}-minute trip.`;

  const delayNote =
    result.delaySeconds > 0
      ? ` Of that trip, ${display_format_minutes(result.delaySeconds / SECONDS_PER_MINUTE)} minutes are the ` +
        `fixed delay, which sits in both scenarios and cancels out of the subtraction — the minutes saved do ` +
        `not move when you drag it, only their share does.`
      : ' With no fixed delay entered, the whole trip is moving time.';

  const detail =
    `Over ${display_format_distance(result.distanceMetres, unitKey)}, going from ` +
    `${display_format_speed(result.speedFromMs, unitKey)} to ${display_format_speed(result.speedToMs, unitKey)} ` +
    `takes the trip from ${display_format_minutes(tripMinutes)} to ` +
    `${display_format_minutes(result.totalToSeconds / SECONDS_PER_MINUTE)} minutes. ` +
    `No speed at all could save more than ${display_format_minutes(ceilingMinutes)} minutes here, the whole ` +
    `moving time of the original trip, and this setting takes ` +
    `${display_format_percent(result.ceilingShare)} of it.${delayNote}`;

  return { verdict, headline, detail };
}

// ── URL 상태 ────────────────────────────────────────────────

/** 표시 단위. 십진수가 아니라 문자열이므로 화이트리스트로 거른다. */
export function url_read_unit(search) {
  const params = new URLSearchParams(search ?? '');
  const raw = params.get(URL_KEY_UNIT);
  return UNIT_KEYS.includes(raw) ? raw : UNIT_DEFAULT;
}

/**
 * 쿼리스트링에서 상태를 읽어 **SI로** 돌려준다.
 * 깨진 값은 최솟값이 아니라 기본값으로 돌아간다 (`Number('')`는 0, `Number('0x10')`은 16).
 */
export function url_read_state(search) {
  const unit = url_read_unit(search);
  const raw = urlstate_read_numbers(search, {
    [URL_KEY_DISTANCE]: { fallback: DISTANCE_DEFAULT_UNITS },
    [URL_KEY_FROM]: { fallback: model_calculate_speed_from_ms(SPEED_FROM_DEFAULT_MS, UNIT_KMH) },
    [URL_KEY_TO]: { fallback: model_calculate_speed_from_ms(SPEED_TO_DEFAULT_MS, UNIT_KMH) },
    [URL_KEY_DELAY]: { fallback: DELAY_DEFAULT_MINUTES, clamp: model_clamp_delay_minutes },
  });

  const speedFromMs = model_clamp_speed_from(model_calculate_speed_to_ms(raw[URL_KEY_FROM], UNIT_KMH));
  return {
    unit,
    distanceMetres: model_clamp_distance(model_calculate_distance_to_metres(raw[URL_KEY_DISTANCE], UNIT_KMH), unit),
    speedFromMs,
    speedToMs: model_clamp_speed_to(model_calculate_speed_to_ms(raw[URL_KEY_TO], UNIT_KMH), speedFromMs),
    delayMinutes: raw[URL_KEY_DELAY],
  };
}

export function url_write_state(state) {
  const trim = (value) => Number(value.toFixed(URL_DIGITS));
  urlstate_write({
    [URL_KEY_DISTANCE]: trim(model_calculate_distance_from_metres(state.distanceMetres, UNIT_KMH)),
    [URL_KEY_FROM]: trim(model_calculate_speed_from_ms(state.speedFromMs, UNIT_KMH)),
    [URL_KEY_TO]: trim(model_calculate_speed_from_ms(state.speedToMs, UNIT_KMH)),
    [URL_KEY_DELAY]: state.delayMinutes,
    [URL_KEY_UNIT]: state.unit,
  });
}

// ── 프리셋 ──────────────────────────────────────────────────

/** 프리셋 하나를 SI 상태로. 버튼이 로드하는 값과 라벨이 같은 자리에서 나온다. */
export function state_build_preset(presetKey, unitKey) {
  const preset = (PRESETS[unitKey] ?? PRESETS[UNIT_DEFAULT]).find((item) => item.key === presetKey);
  if (!preset) return null;
  const speedFromMs = model_calculate_speed_to_ms(preset.from, unitKey);
  return {
    unit: unitKey,
    distanceMetres: model_calculate_distance_to_metres(preset.distance, unitKey),
    speedFromMs,
    speedToMs: model_clamp_speed_to(model_calculate_speed_to_ms(preset.to, unitKey), speedFromMs),
    delayMinutes: preset.delay,
  };
}

/** 지금 상태와 같은 프리셋이 있는가. 없으면 null — 슬라이더를 움직이면 아무것도 눌리지 않는다. */
export function state_pick_matching_preset(state) {
  for (const preset of PRESETS[state.unit] ?? []) {
    const candidate = state_build_preset(preset.key, state.unit);
    if (!candidate) continue;
    const same =
      Math.abs(candidate.distanceMetres - state.distanceMetres) < PRESET_MATCH_EPSILON &&
      Math.abs(candidate.speedFromMs - state.speedFromMs) < PRESET_MATCH_EPSILON &&
      Math.abs(candidate.speedToMs - state.speedToMs) < PRESET_MATCH_EPSILON &&
      candidate.delayMinutes === state.delayMinutes;
    if (same) return preset.key;
  }
  return null;
}

// ── 그래프 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/**
 * 세로축 범위. **0에서 천장까지**로 고정한다 — 곡선의 높이가 곧
 * "이 트립의 이동 시간 중 몇 할을 다이얼이 살 수 있는가"가 되어,
 * 설정을 바꿔도 그림의 뜻이 같은 자리에 남는다.
 * 천장이 0에 가까운 병적인 경우에는 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게).
 */
export function chart_calculate_scale(ceilingMinutes) {
  const top = Math.max(ceilingMinutes * (1 + CHART_TOP_PAD_RATIO), CHART_MIN_SPAN_MINUTES);
  return { low: 0, high: top };
}

function chart_calculate_x(speedUnits, low, high, plotWidth) {
  return ((speedUnits - low) / (high - low)) * plotWidth;
}

function chart_calculate_y(minutes, scale, plotHeight) {
  return plotHeight - ((minutes - scale.low) / (scale.high - scale.low)) * plotHeight;
}

/**
 * 절약 곡선과 천장선을 그린다. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 */
export function chart_render_curve(canvasEl, points, result, unitKey) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup || points.length < 2) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);

  const unit = model_read_unit(unitKey);
  const ceilingMinutes = result.ceilingSeconds / SECONDS_PER_MINUTE;
  const scale = chart_calculate_scale(ceilingMinutes);
  const speedLow = points[0].speedToUnits;
  const speedHigh = points[points.length - 1].speedToUnits;

  const colorCurve = chart_read_color(canvasEl, COLOR_VAR_CURVE, COLOR_FALLBACK_CURVE);
  const colorCeiling = chart_read_color(canvasEl, COLOR_VAR_CEILING, COLOR_FALLBACK_CEILING);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로축 눈금 ──
  const yStep = ticks_calculate_step(scale.high - scale.low);
  const yTicks = ticks_build_linear(scale.low, scale.high, yStep);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const value of yTicks) {
    const y = chart_calculate_y(value, scale, plotHeight);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(plotWidth, y);
    context.stroke();
    context.fillText(display_format_axis_minutes(value), -CHART_LABEL_GAP, y);
  }

  // ── 가로축 눈금 ──
  const xStep = ticks_calculate_step(speedHigh - speedLow);
  const xTicks = ticks_build_linear(speedLow, speedHigh, xStep);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const value of xTicks) {
    context.fillText(
      String(Math.round(value)),
      chart_calculate_x(value, speedLow, speedHigh, plotWidth),
      plotHeight + CHART_LABEL_GAP,
    );
  }

  // ── 천장선 (점선) ──
  const ceilingY = chart_calculate_y(ceilingMinutes, scale, plotHeight);
  context.save();
  context.strokeStyle = colorCeiling;
  context.lineWidth = CHART_CEILING_WIDTH;
  context.setLineDash(CHART_CEILING_DASH);
  context.beginPath();
  context.moveTo(0, ceilingY);
  context.lineTo(plotWidth, ceilingY);
  context.stroke();
  context.restore();

  // ── 곡선 ──
  context.save();
  context.strokeStyle = colorCurve;
  context.lineWidth = CHART_CURVE_WIDTH;
  context.setLineDash([]);
  context.beginPath();
  points.forEach((point, index) => {
    const x = chart_calculate_x(point.speedToUnits, speedLow, speedHigh, plotWidth);
    const y = chart_calculate_y(point.savedSeconds / SECONDS_PER_MINUTE, scale, plotHeight);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();

  // ── 지금 v₂가 어디인가 ──
  const cursorUnits = model_calculate_speed_from_ms(result.speedToMs, unitKey);
  const cursorX = chart_calculate_x(cursorUnits, speedLow, speedHigh, plotWidth);
  const cursorY = chart_calculate_y(result.savedSeconds / SECONDS_PER_MINUTE, scale, plotHeight);
  context.save();
  context.strokeStyle = colorAxis;
  context.setLineDash(CHART_CURSOR_DASH);
  context.beginPath();
  context.moveTo(cursorX, plotHeight);
  context.lineTo(cursorX, cursorY);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colorCurve;
  context.beginPath();
  context.arc(cursorX, cursorY, CHART_CURSOR_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // ── 축선 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  // ── 축 제목 ──
  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(
    CHART_TITLE_X.replace(CHART_TITLE_X_UNIT_TOKEN, unit.speedLabel),
    plotWidth / 2,
    plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP,
  );
  context.save();
  context.translate(-CHART_PAD_LEFT + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  context.fillText(CHART_TITLE_Y, 0, 0);
  context.restore();

  context.restore();

  return { scale, speedLow, speedHigh, ceilingMinutes, cursorUnits };
}

/** 그림이 실제로 쓴 값만 인용한다. 축을 다시 계산하지 않는다. */
export function chart_describe_axes(drawn, unitKey) {
  const unit = model_read_unit(unitKey);
  return (
    `${LEGEND_KEY_TEXT} Vertical axis 0–${display_format_axis_minutes(drawn.scale.high)} minutes, ` +
    `horizontal axis ${Math.round(drawn.speedLow)}–${Math.round(drawn.speedHigh)} ${unit.speedLabel}, both linear. ` +
    `Both rescale with the sliders, so read them before comparing two settings. The dotted vertical line marks ` +
    `where the raised-speed slider sits. The curve approaches the dashed ceiling and never reaches it.`
  );
}

// ── 막대 ────────────────────────────────────────────────────

/** 누적 막대 한 줄. 이동 시간과 고정 지연을 색으로 나눠 쌓는다. */
function widget_build_bar() {
  const row = document.createElement('div');
  row.className = 'bar-row';

  const label = document.createElement('span');
  label.className = 'bar-label';

  const track = document.createElement('span');
  track.className = 'bar-track';

  const moving = document.createElement('span');
  moving.className = 'bar-fill';
  moving.dataset.series = '1';

  const fixed = document.createElement('span');
  fixed.className = 'bar-fill';
  fixed.dataset.series = '2';

  track.append(moving, fixed);

  const value = document.createElement('span');
  value.className = 'bar-value';

  const share = document.createElement('span');
  share.className = 'bar-share';

  row.append(label, track, value, share);
  return { row, label, track, moving, fixed, value, share };
}

/**
 * 막대 한 줄을 갱신한다. **두 막대는 같은 축을 쓴다** — 폭의 기준은 언제나
 * 원래 트립의 총 시간이라, 두 막대의 길이 차가 곧 절약된 시간이다.
 */
function display_update_bar(bar, labelText, movingSeconds, delaySeconds, axisSeconds, shareText) {
  bar.label.textContent = labelText;
  bar.moving.style.width = `${(movingSeconds / axisSeconds) * PERCENT_SCALE}%`;
  bar.fixed.style.width = `${(delaySeconds / axisSeconds) * PERCENT_SCALE}%`;
  bar.value.textContent = `${display_format_minutes((movingSeconds + delaySeconds) / SECONDS_PER_MINUTE)} min`;
  bar.share.textContent = shareText;
}

// ── 위젯 ───────────────────────────────────────────────────

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  // 모듈이 두 번 평가되면(HMR, 스크립트 중복) 같은 자리에 위젯이 두 벌 붙는다.
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const state = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Time saved by raising a held speed over a fixed distance';

  // ── 프리셋 ──
  const presets = control_build_button_group(
    'Load an example trip',
    PRESET_KEYS.map((key) => ({ key, label: key })),
  );

  // ── 슬라이더 ──
  const distanceSlider = control_build_slider(
    ID_DISTANCE,
    'How far you are going',
    'The distance of the trip. The handle steps through round distances, and every figure on this page scales straight up and down with it.',
    {
      min: DISTANCE_INDEX_MIN,
      max: DISTANCE_INDEX_MAX,
      step: DISTANCE_INDEX_STEP,
      value: model_read_distance_index(state.distanceMetres, state.unit),
    },
  );
  const fromSlider = control_build_slider(
    ID_FROM,
    'The speed you were doing',
    'The speed held for the whole trip in the first scenario. This is the number that decides how much the raise is worth. ' +
      'Try the same raise from a low starting speed and then from a high one — the minutes saved are not close.',
    { min: 0, max: 1, step: 1, value: 0 },
  );
  const toSlider = control_build_slider(
    ID_TO,
    'The speed you raise it to',
    'The speed held for the whole trip in the second scenario. Its lowest setting follows the slider above, so it can never fall below it.',
    { min: 0, max: 1, step: 1, value: 0 },
  );
  const delaySlider = control_build_slider(
    ID_DELAY,
    'Minutes stuck not moving',
    'Red lights, junctions and standing traffic — time the trip spends at a standstill. It is added to both scenarios, so it changes the share of the trip that is saved but not the minutes.',
    {
      min: DELAY_MIN_MINUTES,
      max: DELAY_MAX_MINUTES,
      step: DELAY_STEP_MINUTES,
      value: state.delayMinutes,
    },
  );
  const sliders = [distanceSlider, fromSlider, toSlider, delaySlider];

  // ── 단위 토글 ──
  const unitRow = document.createElement('div');
  unitRow.className = 'widget-row';
  const unitLabelBox = document.createElement('div');
  unitLabelBox.className = 'widget-label';
  const unitLabel = document.createElement('span');
  unitLabel.setAttribute('id', `${ID_UNIT}-label`);
  unitLabel.textContent = 'Units on screen';
  const unitHint = document.createElement('span');
  unitHint.className = 'widget-hint';
  unitHint.setAttribute('id', `${ID_UNIT}-hint`);
  unitHint.textContent =
    'Which units the sliders and cards are written in. The trip itself does not change — the model works in metres and metres per second either way, and the handles land on the nearest round step of the new scale.';
  unitLabelBox.append(unitLabel, unitHint);

  const unitGroup = document.createElement('div');
  unitGroup.className = 'widget-toggle';
  unitGroup.setAttribute('role', 'radiogroup');
  unitGroup.setAttribute('aria-labelledby', `${ID_UNIT}-label`);
  unitGroup.setAttribute('aria-describedby', `${ID_UNIT}-hint`);

  const unitInputs = {};
  for (const key of UNIT_KEYS) {
    const option = document.createElement('label');
    option.className = 'widget-toggle-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = ID_UNIT;
    input.value = key;
    input.setAttribute('id', `${ID_UNIT}-${key}`);
    input.checked = key === state.unit;
    const text = document.createElement('span');
    text.textContent = model_read_unit(key).speedLabel;
    option.append(input, text);
    unitGroup.appendChild(option);
    unitInputs[key] = input;
  }
  unitRow.append(unitLabelBox, unitGroup);

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(
    presets.group,
    distanceSlider.row,
    fromSlider.row,
    toSlider.row,
    delaySlider.row,
    unitRow,
  );

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
    saved: control_build_readout('Time saved', 'min'),
    share: control_build_readout('Share of the trip saved', '%'),
    before: control_build_readout('Trip before', 'min'),
    after: control_build_readout('Trip after', 'min'),
    ceiling: control_build_readout('Ceiling on any saving', 'min'),
  };
  readouts.append(cards.saved.box, cards.share.box, cards.before.box, cards.after.box, cards.ceiling.box);

  // ── 막대 ──
  const barsBox = document.createElement('div');
  barsBox.className = 'bars';
  const barBlock = document.createElement('div');
  barBlock.className = 'bar-block';
  const barTitle = document.createElement('p');
  barTitle.className = 'bar-block-title';
  barTitle.textContent = 'The two trips, drawn on one scale';
  const bars = { from: widget_build_bar(), to: widget_build_bar() };
  barBlock.append(barTitle, bars.from.row, bars.to.row);
  const barNote = document.createElement('p');
  barNote.className = 'legend-note';
  barsBox.append(barBlock, barNote);

  // ── 곡선 ──
  const chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'widget-chart';
  chartCanvas.setAttribute('role', 'img');

  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  for (const key of [
    { swatch: 'legend-mean-1', label: LEGEND_CURVE_LABEL },
    { swatch: 'legend-tail-2', label: LEGEND_CEILING_LABEL },
  ]) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = `legend-key ${key.swatch}`;
    item.append(swatch, document.createTextNode(` ${key.label}`));
    legend.appendChild(item);
  }
  const legendNote = document.createElement('p');
  legendNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table('The same increase at several starting speeds', TABLE_HEADINGS);
  const tableNote = document.createElement('p');
  tableNote.className = 'legend-note';

  rootEl.append(
    heading, controls, verdict, readouts, barsBox,
    chartCanvas, legend, legendNote, table.scroll, tableNote,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastResult = null;
  let lastPoints = [];

  /**
   * 값을 이 단위의 눈금 위로, 그리고 허용범위 안으로. 반올림이 아니라 클램프까지
   * 해야 한다 — 140 km/h는 mph로 86.99이고, 반올림만 하면 손잡이가 상한(85) 밖의
   * 87을 가리킨다.
   */
  function slider_pick_grid_value(units, step, low, high) {
    const snapped = Math.round(units / step) * step;
    return Math.min(Math.max(snapped, low), high);
  }

  /** 지금 단위의 눈금으로 슬라이더 넷을 다시 세운다. 단위 토글과 프리셋이 부른다. */
  function slider_reset_ranges() {
    const range = model_calculate_speed_range(state.unit);

    distanceSlider.input.min = String(DISTANCE_INDEX_MIN);
    distanceSlider.input.max = String(DISTANCE_INDEX_MAX);
    distanceSlider.input.step = String(DISTANCE_INDEX_STEP);
    distanceSlider.input.value = String(model_read_distance_index(state.distanceMetres, state.unit));

    const fromUnits = slider_pick_grid_value(
      model_calculate_speed_from_ms(state.speedFromMs, state.unit), range.step, range.fromMin, range.fromMax,
    );
    fromSlider.input.min = String(range.fromMin);
    fromSlider.input.max = String(range.fromMax);
    fromSlider.input.step = String(range.step);
    fromSlider.input.value = String(fromUnits);

    toSlider.input.max = String(range.toMax);
    toSlider.input.step = String(range.step);
    toSlider.input.value = String(slider_pick_grid_value(
      model_calculate_speed_from_ms(state.speedToMs, state.unit), range.step, fromUnits + range.gap, range.toMax,
    ));

    delaySlider.input.value = String(state.delayMinutes);

    // 프리셋 라벨은 단위마다 다르다. 라벨이 로드되는 값과 갈리지 않게 여기서 다시 쓴다.
    for (const preset of PRESETS[state.unit] ?? []) {
      const button = presets.buttons[preset.key];
      if (button) button.textContent = display_describe_preset(preset, state.unit);
    }
  }

  /**
   * **종속 슬라이더.** v₁이 움직이면 v₂의 `min`과, 필요하면 `value`까지 다시 맞춘다.
   * 안 맞추면 손잡이가 가리키는 값과 계산에 쓰인 값이 갈라진다 (클램프가 삼킨다).
   */
  function slider_sync_speed_to() {
    const range = model_calculate_speed_range(state.unit);
    const fromUnits = Number(fromSlider.input.value);
    const floor = fromUnits + range.gap;
    toSlider.input.min = String(floor);
    if (!(Number(toSlider.input.value) >= floor)) toSlider.input.value = String(floor);
  }

  /** 슬라이더가 가리키는 것을 SI 상태로 읽는다. */
  function state_read_sliders() {
    const unitKey = state.unit;
    const index = model_clamp_distance_index(Number(distanceSlider.input.value));
    const speedFromMs = model_clamp_speed_from(
      model_calculate_speed_to_ms(Number(fromSlider.input.value), unitKey),
    );
    return {
      unit: unitKey,
      distanceMetres: model_calculate_distance_to_metres(DISTANCE_LADDER[index], unitKey),
      speedFromMs,
      speedToMs: model_clamp_speed_to(model_calculate_speed_to_ms(Number(toSlider.input.value), unitKey), speedFromMs),
      delayMinutes: model_clamp_delay_minutes(Number(delaySlider.input.value)),
    };
  }

  /** 인덱스 슬라이더는 스크린리더에 "5"라고 읽힌다. 실제 값을 붙여 준다. */
  function display_show_sliders() {
    const distanceText = display_format_distance(state.distanceMetres, state.unit);
    distanceSlider.output.textContent = distanceText;
    distanceSlider.input.setAttribute('aria-valuetext', distanceText);

    const fromText = display_format_speed(state.speedFromMs, state.unit);
    fromSlider.output.textContent = fromText;
    fromSlider.input.setAttribute('aria-valuetext', fromText);

    const toText = display_format_speed(state.speedToMs, state.unit);
    toSlider.output.textContent = toText;
    toSlider.input.setAttribute('aria-valuetext', toText);

    const delayText = `${state.delayMinutes} ${num_format_plural(state.delayMinutes, 'min')}`;
    delaySlider.output.textContent = delayText;
    delaySlider.input.setAttribute('aria-valuetext', delayText);
  }

  function display_show_table() {
    const unit = model_read_unit(state.unit);
    table.body.textContent = '';
    const rows = model_calculate_increase_table(
      state.distanceMetres, state.delayMinutes * SECONDS_PER_MINUTE, state.unit,
    );
    let currentCount = 0;
    for (const row of rows) {
      const isCurrent =
        Math.abs(row.result.speedFromMs - state.speedFromMs) < PRESET_MATCH_EPSILON &&
        Math.abs(row.result.speedToMs - state.speedToMs) < PRESET_MATCH_EPSILON;
      if (isCurrent) currentCount += 1;
      table.body.appendChild(
        control_build_table_row(
          [
            `${row.startUnits} ${unit.speedLabel}`,
            `${row.toUnits} ${unit.speedLabel}`,
            `${display_format_minutes(row.result.savedSeconds / SECONDS_PER_MINUTE)} min`,
            display_format_percent(row.result.savedShare),
          ],
          { current: isCurrent },
        ),
      );
    }
    tableNote.textContent =
      `Every row is the same increase of ${unit.tableIncrease} ${unit.speedLabel} over the same ` +
      `${display_format_distance(state.distanceMetres, state.unit)}, and only the starting speed differs. ` +
      `The minutes column is what the model returns for that increase; the share column is that saving against ` +
      `the whole trip, so it is the only column the fixed-delay slider moves.` +
      (currentCount > 0 ? ' The marked row is the pair the sliders are set to.' : '');
  }

  /**
   * 상태 하나를 받아 화면 전체를 맞춘다. **계산 경로는 여기 하나뿐이다.**
   *
   * **캐노니컬 값은 SI(m, m/s) 하나뿐이다.** `next`가 있으면(단위 토글·프리셋·URL
   * 로드) 그 SI 값을 그대로 유일한 진실로 삼고, 슬라이더는 그것을 **보여주기만**
   * 한다 — `slider_reset_ranges`가 눈금 위 가장 가까운 칸으로 손잡이를 옮겨도
   * 그 결과를 다시 읽어 state에 되먹이지 않는다. 되먹이면 표시용 반올림이 그대로
   * 상태가 되어, km→mi→km처럼 단위를 오가는 사이 트립 자체가 달라진다.
   * `next`가 없을 때(사용자가 손잡이를 직접 움직였을 때)만 슬라이더가 진실이고,
   * 그때는 `state_read_sliders`로 SI 상태를 다시 읽는다.
   */
  function widget_update(next = null) {
    if (next) {
      Object.assign(state, next);
      slider_reset_ranges();
      slider_sync_speed_to();
    } else {
      slider_sync_speed_to();
      Object.assign(state, state_read_sliders());
    }

    display_show_sliders();

    const result = model_calculate_result(
      state.distanceMetres, state.speedFromMs, state.speedToMs, state.delayMinutes * SECONDS_PER_MINUTE,
    );
    lastResult = result;
    lastPoints = model_calculate_curve(state.distanceMetres, state.speedFromMs, state.unit);

    // 프리셋 버튼은 지금 상태가 어느 프리셋과 같은지만 알린다 (라디오가 아니다).
    const matching = state_pick_matching_preset(state);
    for (const [key, button] of Object.entries(presets.buttons)) {
      button.setAttribute('aria-pressed', String(key === matching));
    }

    const savedMinutes = result.savedSeconds / SECONDS_PER_MINUTE;
    cards.saved.value.textContent = display_format_minutes(savedMinutes);
    cards.saved.unit.textContent = `min (${display_format_seconds(result.savedSeconds)} s)`;
    cards.share.value.textContent = display_format_percent_number(result.savedShare);
    cards.share.unit.textContent =
      `% of the ${display_format_minutes(result.totalFromSeconds / SECONDS_PER_MINUTE)} min trip`;
    cards.before.value.textContent = display_format_minutes(result.totalFromSeconds / SECONDS_PER_MINUTE);
    cards.before.unit.textContent = `min at ${display_format_speed(result.speedFromMs, state.unit)}`;
    cards.after.value.textContent = display_format_minutes(result.totalToSeconds / SECONDS_PER_MINUTE);
    cards.after.unit.textContent = `min at ${display_format_speed(result.speedToMs, state.unit)}`;
    cards.ceiling.value.textContent = display_format_minutes(result.ceilingSeconds / SECONDS_PER_MINUTE);
    cards.ceiling.unit.textContent = `min — this setting takes ${display_format_percent(result.ceilingShare)}`;

    const spoken = display_describe_verdict(result, state.unit);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    // ── 막대 ──
    const axisSeconds = result.totalFromSeconds;
    display_update_bar(
      bars.from,
      `At ${display_format_speed(result.speedFromMs, state.unit)}`,
      result.movingFromSeconds,
      result.delaySeconds,
      axisSeconds,
      `${display_format_minutes(result.movingFromSeconds / SECONDS_PER_MINUTE)} moving`,
    );
    display_update_bar(
      bars.to,
      `At ${display_format_speed(result.speedToMs, state.unit)}`,
      result.movingToSeconds,
      result.delaySeconds,
      axisSeconds,
      `${display_format_minutes(savedMinutes)} min shorter`,
    );
    barNote.textContent =
      `Both bars are drawn against the same total, the ` +
      `${display_format_minutes(result.totalFromSeconds / SECONDS_PER_MINUTE)}-minute trip, so the empty space ` +
      `at the end of the lower bar is the time saved. The solid segment is moving time and the hatched segment ` +
      `is the fixed delay; the hatched segment is identical in both bars, which is the cancellation in the ` +
      `formula drawn out. Only the solid segment ever shrinks.`;

    display_show_table();

    url_write_state(state);
    widget_redraw();
    return result;
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const drawn = chart_render_curve(chartCanvas, lastPoints, lastResult, state.unit);
    if (!drawn) {
      // 폭 0(숨긴 탭)이면 축을 인용할 수 없다. 그림과 무관한 범례 문구는 언제나 채운다.
      legendNote.textContent = LEGEND_KEY_TEXT;
      return;
    }
    legendNote.textContent = chart_describe_axes(drawn, state.unit);
    const spoken = display_describe_verdict(lastResult, state.unit);
    chartCanvas.setAttribute(
      'aria-label',
      `Time saved against the raised speed, rising steeply and then flattening toward the ceiling. ` +
        `${spoken.headline} ${spoken.detail}`,
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

  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  // 손잡이가 움직이는 동안에도 v₂의 바닥은 **즉시** 따라가야 한다.
  // 디바운스 뒤로 미루면 그 사이 손잡이가 가리키는 값과 계산값이 갈라진다.
  const onInput = () => {
    slider_sync_speed_to();
    widget_update_deferred();
  };
  const onChange = () => widget_update();
  for (const slider of sliders) {
    widget_bind(slider.input, 'input', onInput);
    widget_bind(slider.input, 'change', onChange);
  }
  for (const [key, button] of Object.entries(presets.buttons)) {
    widget_bind(button, 'click', () => widget_update(state_build_preset(key, state.unit)));
  }
  for (const key of UNIT_KEYS) {
    widget_bind(unitInputs[key], 'change', () => {
      // 단위는 표시일 뿐이다. 유일한 진실은 state의 SI 값(m, m/s)이고,
      // 여기서 절대 다시 스냅하지 않는다 — 스냅하면 1 km가 mi를 거쳐
      // 다시 km로 돌아올 때 2 km가 되는 왕복 손실이 생긴다. 손잡이 위치는
      // model_read_distance_index가 매 렌더마다 이 값에서 다시 읽으므로
      // 새 눈금의 가장 가까운 칸으로 **보이기만** 하고, state는 그대로 둔다.
      widget_update({ ...state, unit: key });
    });
  }
  widget_bind(window, 'resize', widget_redraw_deferred);

  slider_reset_ranges();
  widget_update();

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
