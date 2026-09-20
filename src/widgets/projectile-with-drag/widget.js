/**
 * 45°는 여전히 가장 멀리 가는가 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에만 싣는다(localStorage 금지). **난수를 쓰지 않는다** —
 * 이 모델에는 뽑을 것이 없고, 같은 링크는 언제나 같은 그림을 낸다.
 */
import {
  PROJECTILE_ANGLE_MIN_DEG,
  PROJECTILE_ANGLE_MAX_DEG,
  PROJECTILE_ANGLE_STEP_DEG,
  PROJECTILE_ANGLE_DEFAULT_DEG,
  PROJECTILE_SPEED_MIN_MS,
  PROJECTILE_SPEED_MAX_MS,
  PROJECTILE_SPEED_STEP_MS,
  PROJECTILE_SPEED_DEFAULT_MS,
  PROJECTILE_MASS_DEFAULT_KG,
  PROJECTILE_DRAG_MIN,
  PROJECTILE_DRAG_MAX,
  PROJECTILE_DRAG_STEP,
  PROJECTILE_DRAG_DEFAULT,
  PROJECTILE_AREA_DEFAULT_M2,
  PROJECTILE_DENSITY_MIN_KGM3,
  PROJECTILE_DENSITY_MAX_KGM3,
  PROJECTILE_DENSITY_STEP_KGM3,
  PROJECTILE_DENSITY_DEFAULT_KGM3,
  PROJECTILE_MASS_AXIS,
  PROJECTILE_AREA_AXIS,
  PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG,
  PROJECTILE_PRESETS,
  model_clamp_angle,
  model_clamp_speed,
  model_clamp_drag,
  model_clamp_density,
  model_clamp_mass,
  model_clamp_area,
  model_calculate_log_value,
  model_calculate_log_index,
  model_calculate_summary,
  model_calculate_sweep,
  model_calculate_verdict,
  model_calculate_diameter,
} from './model.js';

import { num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear, ticks_drop_crowded } from '../_shared/ticks.js';
import { units_format_scientific } from '../_shared/units.js';
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
const ROOT_SELECTOR = '[data-widget="projectile-with-drag"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_ANGLE = 'th';
const URL_KEY_SPEED = 'v0';
const URL_KEY_MASS = 'm';
const URL_KEY_DRAG = 'cd';
const URL_KEY_AREA = 'a';
const URL_KEY_DENSITY = 'rho';

// ── 표시 자릿수 ────────────────────────────────────────────
const ANGLE_DIGITS = 1;
const METRE_DIGITS = 1;
/** 1 m 아래는 자릿수를 늘린다 — 0.34 m와 0.44 m가 둘 다 "0.3 m"이면 카드가 죽는다. */
const METRE_SMALL_THRESHOLD = 1;
const METRE_SMALL_DIGITS = 2;
const SECOND_DIGITS = 2;
const SPEED_DIGITS = 1;
const DRAG_DIGITS = 2;
const DENSITY_DIGITS = 3;
const MASS_KG_DIGITS = 3;
/** 이 아래는 그램으로 읽는다. 0.058 kg보다 58 g이 읽힌다. */
const MASS_GRAM_CEILING_KG = 1;
const MASS_GRAM_DIGITS = 1;
const GRAMS_PER_KG = 1000;
const MM_PER_M = 1000;
const AREA_SIGNIFICANT_DIGITS = 4;
const PERCENT_SCALE = 100;
/** 빼기 부호. ASCII 하이픈과 섞이면 같은 표에 두 글자가 나온다. */
const MINUS_SIGN = '\u2212';
const PERCENT_DIGITS = 0;
/**
 * 두 곡선이 이보다 가까우면 "그림으로는 구분되지 않는다"고 적는다(m).
 * **"공기가 없다"는 판정에는 쓰지 않는다** — θ=0°·90°에서는 항력이 있어도
 * 수평 사거리가 우연히 0에 가까워진다. 그 판정은 model.js의 `hasDrag`로 한다.
 */
const CURVE_MERGE_LIMIT_M = 0.05;

const RECOMPUTE_DELAY_MS = 110;

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 300;
const SWEEP_HEIGHT_PX = 280;
const CHART_PAD_TOP = 16;
const CHART_PAD_RIGHT = 18;
const CHART_PAD_BOTTOM = 54;
const CHART_PAD_LEFT = 60;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_LABEL_MIN_GAP_PX = 10;
const CHART_CURVE_WIDTH = 2;
const CHART_GHOST_WIDTH = 3;
const CHART_GHOST_DASH = [6, 5];
/** 유령선의 채도를 낮춘다. 같은 굵기·같은 채도면 어느 쪽이 모델의 답인지 흐려진다. */
const CHART_GHOST_ALPHA = 0.5;
const CHART_GRID_WIDTH = 1;
const CHART_CURSOR_DASH = [2, 3];
const CHART_CURSOR_RADIUS = 4;
/** 축 위쪽 여유. 곡선이 천장에 붙지 않게. */
const CHART_TOP_PAD_RATIO = 1.1;
const CHART_RIGHT_PAD_RATIO = 1.02;
/** 축 스팬이 0이 될 때 최소 표시 폭(m). 없으면 좌표가 NaN이 되어 아무것도 안 그려진다. */
const CHART_MIN_SPAN_M = 1;
/** 각도 축 눈금 간격(도). 1-2-5 자동 눈금은 20°를 골라 45°가 눈금에서 빠진다. */
const SWEEP_TICK_STEP_DEG = 15;

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_DRAG = '--series-1';
const COLOR_VAR_VACUUM = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_FALLBACK_DRAG = '#1f4e79';
const COLOR_FALLBACK_VACUUM = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';

// ── 문구 ───────────────────────────────────────────────────
const NAME_DRAG = 'With drag';
const NAME_VACUUM = 'In a vacuum';
const CHART_TITLE_X = 'Distance, m (linear)';
const CHART_TITLE_Y = 'Height, m (linear)';
const SWEEP_TITLE_X = 'Launch angle, degrees (linear)';
const SWEEP_TITLE_Y = 'Range, m (linear)';
const LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: 'Solid — the path this model integrates' },
  { swatch: 'legend-tail-2', label: 'Dotted — the same launch with the air taken out' },
];
const TABLE_HEADINGS = ['What', NAME_DRAG, NAME_VACUUM, 'Difference'];
const VERDICT_HEADLINE = {
  hold: 'In this model 45° is still the angle to beat.',
  edge: 'In this model the best angle has left 45°.',
  break: 'In this model 45° is not close to the best angle.',
};

// ── 표시 함수 ──────────────────────────────────────────────

/** 미터. 자릿수를 값의 크기가 아니라 읽어야 하는 정밀도로 정한다. */
export function display_format_metres(metres) {
  if (!Number.isFinite(metres)) return '—';
  const digits = Math.abs(metres) < METRE_SMALL_THRESHOLD ? METRE_SMALL_DIGITS : METRE_DIGITS;
  return metres.toFixed(digits);
}

export function display_format_seconds(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return seconds.toFixed(SECOND_DIGITS);
}

export function display_format_speed(speedMs) {
  if (!Number.isFinite(speedMs)) return '—';
  return speedMs.toFixed(SPEED_DIGITS);
}

export function display_format_angle(angleDeg) {
  if (!Number.isFinite(angleDeg)) return '—';
  return `${angleDeg.toFixed(ANGLE_DIGITS)}°`;
}

/** 질량. 1 kg 아래는 그램으로 — 0.058 kg보다 58 g이 읽힌다. */
export function display_format_mass(massKg) {
  if (!Number.isFinite(massKg)) return '—';
  if (massKg < MASS_GRAM_CEILING_KG) return `${(massKg * GRAMS_PER_KG).toFixed(MASS_GRAM_DIGITS)} g`;
  return `${massKg.toFixed(MASS_KG_DIGITS)} kg`;
}

/**
 * 단면적. 슬라이더가 주는 것은 A지만 사람이 아는 것은 지름이라 **둘 다 적는다.**
 * 지름은 A에서 계산한 값이다 — 따로 들고 다니면 두 숫자가 갈린다.
 */
export function display_format_area(areaM2) {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return '—';
  const diameterMm = model_calculate_diameter(areaM2) * MM_PER_M;
  return `${units_format_scientific(areaM2, AREA_SIGNIFICANT_DIGITS)} m² (d = ${Math.round(diameterMm)} mm sphere)`;
}

export function display_format_percent(fraction) {
  return `${(fraction * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%`;
}

/**
 * 차이 칸. **표시 자릿수 아래로 내려간 차이에는 부호를 붙이지 않는다** —
 * Cd = 0에서 두 경로의 차이는 1e-14 m이고, 그대로 찍으면 "−0.00"이 되어
 * 화면이 없는 차이가 있다고 말한다.
 */
export function display_format_gap(value, format_value) {
  const text = format_value(Math.abs(value));
  return Number(text) === 0 ? text : `${MINUS_SIGN}${text}`;
}

/** 축 눈금 라벨. 범위가 좁아지면 자릿수를 늘린다 (1 m 단위로는 뭉개진다). */
export function display_format_axis(value, spanValue) {
  if (!Number.isFinite(value)) return '—';
  if (spanValue >= 20) return String(Math.round(value));
  if (spanValue >= 2) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * 판정 문장. 첫 줄에 결론과 근거가 되는 숫자 하나, 나머지는 뒤 문장으로.
 * **주어는 언제나 모델이다.**
 */
export function display_describe_verdict(summary, sweep) {
  const optimumDeg = sweep.optimum.angleDeg;
  const verdict = model_calculate_verdict(optimumDeg);
  // "공기가 없다"는 항력항 자체(hasDrag)로만 판정한다 — 사거리 차이로는 안 된다.
  const merged = !summary.drag.hasDrag;
  // 항력은 있지만 이 각도·속력에서는 그림으로 두 곡선을 구분할 수 없는 경우.
  const barelyVisible = summary.drag.hasDrag && summary.rangeLostMetres < CURVE_MERGE_LIMIT_M;

  const headline = merged
    ? 'With no air in the model, both paths are the same path.'
    : `${VERDICT_HEADLINE[verdict]} It puts the longest shot at ${display_format_angle(optimumDeg)}.`;

  const shiftDeg = PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG - optimumDeg;
  const detail = merged
    ? `The drag coefficient is ${summary.params.dragCoefficient.toFixed(DRAG_DIGITS)} and the air density is ` +
      `${summary.params.densityKgM3.toFixed(DENSITY_DIGITS)} kg/m³, so the integrator is solving the vacuum problem: ` +
      `it peaks at ${display_format_angle(sweep.optimum.angleDeg)} and returns ` +
      `${display_format_metres(sweep.optimum.rangeMetres)} m, against ` +
      `${display_format_metres(sweep.vacuumOptimum.rangeMetres)} m from the closed form v₀²sin2θ/g. ` +
      `Those two numbers come from code that shares nothing, and they agree.`
    : barelyVisible
      ? `At the angle set below the model gives ${display_format_metres(summary.drag.rangeMetres)} m, against ` +
        `${display_format_metres(summary.vacuum.rangeMetres)} m with the air taken out — a gap under ` +
        `${CURVE_MERGE_LIMIT_M} m at this launch. The drag term has not dropped to zero here; it is just too ` +
        `small at this angle and speed to move the range by much.`
      : `At the angle set below the model gives ${display_format_metres(summary.drag.rangeMetres)} m, against ` +
        `${display_format_metres(summary.vacuum.rangeMetres)} m for the same launch with the air taken out — ` +
        `${display_format_percent(1 - summary.rangeRatio)} of the distance gone. The peak has moved ` +
        `${shiftDeg.toFixed(ANGLE_DIGITS)} ${num_format_plural(Number(shiftDeg.toFixed(ANGLE_DIGITS)), 'degree')} ` +
        `off the vacuum answer of 45°, and the model puts ` +
        `${display_format_metres(sweep.optimum.rangeMetres)} m there.`;

  return { verdict, headline, detail, merged };
}

/** 궤적 그림이 무엇을 말하는지. 캡션은 **그림이 실제로 쓴 축만** 인용한다. */
export function display_describe_path(summary, drawn) {
  const axes = drawn
    ? `The axes run to ${display_format_metres(drawn.spanX)} m across and ` +
      `${display_format_metres(drawn.spanY)} m up, and they rescale with every slider — ` +
      `read them before comparing two settings. They are not to the same scale as each other, ` +
      `so the arc is stretched upward.`
    : '';
  const gap = !summary.drag.hasDrag
    ? `The two paths sit on top of each other here: the drag coefficient and air density multiply to zero, ` +
      `so the integrated path and the closed-form vacuum path cannot be told apart.`
    : summary.rangeLostMetres < CURVE_MERGE_LIMIT_M
      ? `The two paths sit within ${CURVE_MERGE_LIMIT_M} m of each other here and cannot be told apart at this ` +
        `scale, but the model still has an air term at this launch — it is just too small to draw apart.`
      : `The model lands the solid path ${display_format_metres(summary.rangeLostMetres)} m short of the dotted one ` +
        `and ${display_format_seconds(summary.vacuum.flightSeconds - summary.drag.flightSeconds)} s sooner.`;
  return `${gap} ${axes}`.trim();
}

/** 스윕 그림의 캡션. **최대점의 각도를 숫자로 적는다.** */
export function display_describe_sweep(sweep, currentAngleDeg, drawn) {
  const optimumDeg = sweep.optimum.angleDeg;
  const currentRange = sweep.points.reduce(
    (best, point) => (Math.abs(point.angleDeg - currentAngleDeg) < Math.abs(best.angleDeg - currentAngleDeg) ? point : best),
    sweep.points[0],
  );
  const axis = drawn ? ` The vertical axis runs to ${display_format_metres(drawn.spanY)} m.` : '';
  return (
    `Every point on the solid curve is one full integration at that angle, everything else held. ` +
    `The model puts its highest point at ${display_format_angle(optimumDeg)} — the vertical line — where the range is ` +
    `${display_format_metres(sweep.optimum.rangeMetres)} m. The dotted vacuum curve is symmetric about ` +
    `${display_format_angle(PROJECTILE_VACUUM_OPTIMUM_ANGLE_DEG)}, where it reaches ` +
    `${display_format_metres(sweep.vacuumOptimum.rangeMetres)} m. The dot marks the angle set on the slider, ` +
    `${display_format_angle(currentAngleDeg)}, worth about ${display_format_metres(currentRange.dragRangeMetres)} m.` +
    `${axis}`
  );
}

// ── URL 상태 ────────────────────────────────────────────────

export function url_read_state(search) {
  const state = urlstate_read_numbers(search, {
    [URL_KEY_ANGLE]: { fallback: PROJECTILE_ANGLE_DEFAULT_DEG, clamp: model_clamp_angle },
    [URL_KEY_SPEED]: { fallback: PROJECTILE_SPEED_DEFAULT_MS, clamp: model_clamp_speed },
    [URL_KEY_MASS]: { fallback: PROJECTILE_MASS_DEFAULT_KG, clamp: model_clamp_mass },
    [URL_KEY_DRAG]: { fallback: PROJECTILE_DRAG_DEFAULT, clamp: model_clamp_drag },
    [URL_KEY_AREA]: { fallback: PROJECTILE_AREA_DEFAULT_M2, clamp: model_clamp_area },
    [URL_KEY_DENSITY]: { fallback: PROJECTILE_DENSITY_DEFAULT_KGM3, clamp: model_clamp_density },
  });
  return {
    angleDeg: state[URL_KEY_ANGLE],
    speedMs: state[URL_KEY_SPEED],
    massKg: state[URL_KEY_MASS],
    dragCoefficient: state[URL_KEY_DRAG],
    areaM2: state[URL_KEY_AREA],
    densityKgM3: state[URL_KEY_DENSITY],
  };
}

export function url_write_state(params) {
  urlstate_write({
    [URL_KEY_ANGLE]: params.angleDeg,
    [URL_KEY_SPEED]: params.speedMs,
    [URL_KEY_MASS]: params.massKg,
    [URL_KEY_DRAG]: params.dragCoefficient,
    [URL_KEY_AREA]: params.areaM2,
    [URL_KEY_DENSITY]: params.densityKgM3,
  });
}

// ── 그래프 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/** 축 위쪽 한계. 두 값이 거의 같아도 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게). */
export function chart_calculate_span(values, padRatio) {
  const highest = Math.max(0, ...values.filter((value) => Number.isFinite(value)));
  return Math.max(highest * padRatio, CHART_MIN_SPAN_M);
}

/** 공용 눈금 간격. 스팬이 0이면 공용 쪽이 0을 주므로 최소 표시 폭으로 되돌린다. */
function chart_calculate_step(span) {
  return ticks_calculate_step(span) || CHART_MIN_SPAN_M;
}

/** 눈금 라벨을 겹치는 만큼 버린다. 밀지 않는다 — 밀면 앞 라벨 위로 올라탄다. */
function chart_pick_labels(values, calculate_position, spanValue, context) {
  const items = values.map((value) => ({
    value,
    position: calculate_position(value),
    width: context.measureText(display_format_axis(value, spanValue)).width,
  }));
  return ticks_drop_crowded(items, CHART_LABEL_MIN_GAP_PX);
}

function chart_draw_frame(context, plotWidth, plotHeight, colorAxis) {
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();
}

function chart_draw_titles(context, plotWidth, plotHeight, colorText, titleX, titleY) {
  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(titleX, plotWidth / 2, plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP);
  context.save();
  context.translate(-CHART_PAD_LEFT + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  context.fillText(titleY, 0, 0);
  context.restore();
}

/** 점 목록을 하나의 곡선으로. 좌표 변환은 부르는 쪽이 준다. */
function chart_draw_path(context, points, toX, toY, style) {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.globalAlpha = style.alpha ?? 1;
  context.setLineDash(style.dash ?? []);
  context.beginPath();
  points.forEach((point, index) => {
    const x = toX(point.x ?? point.angleDeg);
    const y = toY(point.y ?? point.value);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();
}

/**
 * 궤적 두 벌을 한 쌍의 축에 그린다. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 */
export function chart_render_path(canvasEl, summary) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);
  const spanX = chart_calculate_span(
    [summary.drag.rangeMetres, summary.vacuum.rangeMetres], CHART_RIGHT_PAD_RATIO,
  );
  const spanY = chart_calculate_span(
    [summary.drag.apexHeightMetres, summary.vacuum.apexHeightMetres], CHART_TOP_PAD_RATIO,
  );

  const colorDrag = chart_read_color(canvasEl, COLOR_VAR_DRAG, COLOR_FALLBACK_DRAG);
  const colorVacuum = chart_read_color(canvasEl, COLOR_VAR_VACUUM, COLOR_FALLBACK_VACUUM);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  const toX = (metres) => (metres / spanX) * plotWidth;
  const toY = (metres) => plotHeight - (metres / spanY) * plotHeight;

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로 눈금 ──
  const yStep = chart_calculate_step(spanY);
  const yTicks = ticks_build_linear(0, spanY, yStep);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const item of chart_pick_labels(yTicks, toY, spanY, context)) {
    context.beginPath();
    context.moveTo(0, item.position);
    context.lineTo(plotWidth, item.position);
    context.stroke();
    context.fillText(display_format_axis(item.value, spanY), -CHART_LABEL_GAP, item.position);
  }

  // ── 가로 눈금 ──
  const xStep = chart_calculate_step(spanX);
  const xTicks = ticks_build_linear(0, spanX, xStep);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = colorText;
  for (const item of chart_pick_labels(xTicks, toX, spanX, context)) {
    context.fillText(display_format_axis(item.value, spanX), item.position, plotHeight + CHART_LABEL_GAP);
  }

  // 유령선을 먼저 — 실선이 위에 오게.
  chart_draw_path(context, summary.vacuumPoints, toX, toY, {
    color: colorVacuum, width: CHART_GHOST_WIDTH, dash: CHART_GHOST_DASH, alpha: CHART_GHOST_ALPHA,
  });
  chart_draw_path(context, summary.drag.points, toX, toY, { color: colorDrag, width: CHART_CURVE_WIDTH });

  chart_draw_frame(context, plotWidth, plotHeight, colorAxis);
  chart_draw_titles(context, plotWidth, plotHeight, colorText, CHART_TITLE_X, CHART_TITLE_Y);
  context.restore();

  return { spanX, spanY };
}

/**
 * 각도 스윕 곡선. 항력 곡선의 최대점에 세로선, 현재 각도에 점.
 * 여기서도 **자기가 쓴 축을 반환한다.**
 */
export function chart_render_sweep(canvasEl, sweep, currentAngleDeg) {
  const setup = canvas_setup_context(canvasEl, SWEEP_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);
  const spanY = chart_calculate_span(
    sweep.points.map((point) => point.vacuumRangeMetres), CHART_TOP_PAD_RATIO,
  );

  const colorDrag = chart_read_color(canvasEl, COLOR_VAR_DRAG, COLOR_FALLBACK_DRAG);
  const colorVacuum = chart_read_color(canvasEl, COLOR_VAR_VACUUM, COLOR_FALLBACK_VACUUM);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  const toX = (angleDeg) =>
    ((angleDeg - PROJECTILE_ANGLE_MIN_DEG) / (PROJECTILE_ANGLE_MAX_DEG - PROJECTILE_ANGLE_MIN_DEG)) * plotWidth;
  const toY = (metres) => plotHeight - (metres / spanY) * plotHeight;

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  const yTicks = ticks_build_linear(0, spanY, chart_calculate_step(spanY));
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const item of chart_pick_labels(yTicks, toY, spanY, context)) {
    context.beginPath();
    context.moveTo(0, item.position);
    context.lineTo(plotWidth, item.position);
    context.stroke();
    context.fillText(display_format_axis(item.value, spanY), -CHART_LABEL_GAP, item.position);
  }

  const xTicks = ticks_build_linear(PROJECTILE_ANGLE_MIN_DEG, PROJECTILE_ANGLE_MAX_DEG, SWEEP_TICK_STEP_DEG);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = colorText;
  for (const item of chart_pick_labels(xTicks, toX, PROJECTILE_ANGLE_MAX_DEG, context)) {
    context.fillText(`${Math.round(item.value)}°`, item.position, plotHeight + CHART_LABEL_GAP);
  }

  chart_draw_path(
    context,
    sweep.points.map((point) => ({ x: point.angleDeg, y: point.vacuumRangeMetres })),
    toX, toY,
    { color: colorVacuum, width: CHART_GHOST_WIDTH, dash: CHART_GHOST_DASH, alpha: CHART_GHOST_ALPHA },
  );
  chart_draw_path(
    context,
    sweep.points.map((point) => ({ x: point.angleDeg, y: point.dragRangeMetres })),
    toX, toY,
    { color: colorDrag, width: CHART_CURVE_WIDTH },
  );

  // ── 최대점 세로선 ──
  context.save();
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash(CHART_CURSOR_DASH);
  context.beginPath();
  context.moveTo(toX(sweep.optimum.angleDeg), toY(sweep.optimum.rangeMetres));
  context.lineTo(toX(sweep.optimum.angleDeg), plotHeight);
  context.stroke();
  context.restore();

  // ── 현재 각도의 점 ──
  const currentPoint = sweep.points.reduce(
    (best, point) =>
      Math.abs(point.angleDeg - currentAngleDeg) < Math.abs(best.angleDeg - currentAngleDeg) ? point : best,
    sweep.points[0],
  );
  context.save();
  context.fillStyle = colorDrag;
  context.beginPath();
  context.arc(toX(currentAngleDeg), toY(currentPoint.dragRangeMetres), CHART_CURSOR_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.restore();

  chart_draw_frame(context, plotWidth, plotHeight, colorAxis);
  chart_draw_titles(context, plotWidth, plotHeight, colorText, SWEEP_TITLE_X, SWEEP_TITLE_Y);
  context.restore();

  return { spanY, optimumAngleDeg: sweep.optimum.angleDeg };
}

// ── 위젯 ───────────────────────────────────────────────────

/** 범례 한 줄. 색 견본과 함께 **선 종류의 뜻**을 글로 적는다. */
function widget_build_legend() {
  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  for (const key of LEGEND_KEYS) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = `legend-key ${key.swatch}`;
    item.append(swatch, document.createTextNode(` ${key.label}`));
    legend.appendChild(item);
  }
  return legend;
}

/**
 * Cd 슬라이더 아래의 눈금 줄. **0 자리에 라벨을 찍는 것이 요점이다** —
 * 이 페이지의 검수 포인트가 그 지점이고, 독자가 유령선과 실선을 겹쳐볼 수 있는
 * 유일한 조작이 여기다. 열 너비는 슬라이더 행과 같은 클래스로 맞춘다.
 */
function widget_build_scale_row(labels) {
  const row = document.createElement('div');
  row.className = 'widget-row';
  row.style.marginTop = '-0.7rem';

  const spacer = document.createElement('span');
  spacer.className = 'widget-label';

  const scale = document.createElement('span');
  scale.className = 'widget-hint';
  scale.style.flex = '1';
  scale.style.display = 'flex';
  scale.style.justifyContent = 'space-between';
  scale.style.gap = '0.5rem';
  for (const label of labels) {
    const mark = document.createElement('span');
    mark.textContent = label;
    scale.appendChild(mark);
  }

  const tail = document.createElement('span');
  tail.className = 'widget-out';

  row.append(spacer, scale, tail);
  return row;
}

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const params = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Launch angle, drag, and the range the model gives';

  // ── 프리셋 ──
  const presets = control_build_button_group(
    'Try one of these',
    PROJECTILE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // ── 슬라이더 ──
  const angleSlider = control_build_slider(
    'projectile-angle',
    'Launch angle',
    'Measured up from level ground. 45° is the answer with no air in the way.',
    {
      min: PROJECTILE_ANGLE_MIN_DEG,
      max: PROJECTILE_ANGLE_MAX_DEG,
      step: PROJECTILE_ANGLE_STEP_DEG,
      value: params.angleDeg,
    },
  );
  const speedSlider = control_build_slider(
    'projectile-speed',
    'Launch speed',
    'Speed the instant it leaves, not the average over the flight.',
    {
      min: PROJECTILE_SPEED_MIN_MS,
      max: PROJECTILE_SPEED_MAX_MS,
      step: PROJECTILE_SPEED_STEP_MS,
      value: params.speedMs,
    },
  );
  const massSlider = control_build_slider(
    'projectile-mass',
    'Mass',
    'Only the drag term is divided by mass, so a heavier object of the same size is a less-drag object. ' +
      'Try sliding from a few grams to several kilograms and watch the optimal angle in the lower chart creep back toward 45°.',
    {
      min: PROJECTILE_MASS_AXIS.indexMin,
      max: PROJECTILE_MASS_AXIS.indexMax,
      step: 1,
      value: model_calculate_log_index(PROJECTILE_MASS_AXIS, params.massKg),
    },
  );
  const dragSlider = control_build_slider(
    'projectile-drag',
    'Drag coefficient',
    'How much the shape resists the air. Set it to 0 to take the air out and get the vacuum answer back.',
    {
      min: PROJECTILE_DRAG_MIN,
      max: PROJECTILE_DRAG_MAX,
      step: PROJECTILE_DRAG_STEP,
      value: params.dragCoefficient,
    },
  );
  const areaSlider = control_build_slider(
    'projectile-area',
    'Cross-section',
    'The area the air sees head-on, not the surface area. The matching sphere diameter is shown beside it.',
    {
      min: PROJECTILE_AREA_AXIS.indexMin,
      max: PROJECTILE_AREA_AXIS.indexMax,
      step: 1,
      value: model_calculate_log_index(PROJECTILE_AREA_AXIS, params.areaM2),
    },
  );
  const densitySlider = control_build_slider(
    'projectile-density',
    'Air density',
    'How thick the air is. 1.225 kg/m³ is the sea-level standard value; 0 is no air at all.',
    {
      min: PROJECTILE_DENSITY_MIN_KGM3,
      max: PROJECTILE_DENSITY_MAX_KGM3,
      step: PROJECTILE_DENSITY_STEP_KGM3,
      value: params.densityKgM3,
    },
  );
  const sliders = [angleSlider, speedSlider, massSlider, dragSlider, areaSlider, densitySlider];

  const dragScale = widget_build_scale_row([
    `${PROJECTILE_DRAG_MIN.toFixed(DRAG_DIGITS)} — no air`,
    PROJECTILE_DRAG_DEFAULT.toFixed(DRAG_DIGITS),
    PROJECTILE_DRAG_MAX.toFixed(DRAG_DIGITS),
  ]);

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(
    angleSlider.row, speedSlider.row, massSlider.row,
    dragSlider.row, dragScale, areaSlider.row, densitySlider.row,
  );

  // ── 판정 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 궤적 ──
  const pathCanvas = document.createElement('canvas');
  pathCanvas.className = 'widget-chart';
  pathCanvas.setAttribute('role', 'img');
  const pathLegend = widget_build_legend();
  const pathNote = document.createElement('p');
  pathNote.className = 'legend-note';

  // ── 카드 ──
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const cards = {
    range: control_build_readout('Range', 'm'),
    apex: control_build_readout('Highest point', 'm'),
    time: control_build_readout('Time in the air', 's'),
    landing: control_build_readout('Speed on landing', 'm/s'),
  };
  readouts.append(cards.range.box, cards.apex.box, cards.time.box, cards.landing.box);

  // ── 스윕 ──
  const sweepCanvas = document.createElement('canvas');
  sweepCanvas.className = 'widget-chart';
  sweepCanvas.setAttribute('role', 'img');
  const sweepLegend = widget_build_legend();
  const sweepNote = document.createElement('p');
  sweepNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table('The same launch with drag and without it', TABLE_HEADINGS);

  rootEl.append(
    heading, presets.group, controls, verdict,
    pathCanvas, pathLegend, pathNote, readouts,
    sweepCanvas, sweepLegend, sweepNote, table.scroll,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastSummary = null;
  let lastSweep = null;

  function state_read_sliders() {
    return {
      angleDeg: model_clamp_angle(Number(angleSlider.input.value)),
      speedMs: model_clamp_speed(Number(speedSlider.input.value)),
      massKg: model_calculate_log_value(PROJECTILE_MASS_AXIS, Number(massSlider.input.value)),
      dragCoefficient: model_clamp_drag(Number(dragSlider.input.value)),
      areaM2: model_calculate_log_value(PROJECTILE_AREA_AXIS, Number(areaSlider.input.value)),
      densityKgM3: model_clamp_density(Number(densitySlider.input.value)),
    };
  }

  function display_show_sliders(current) {
    angleSlider.output.textContent = display_format_angle(current.angleDeg);
    speedSlider.output.textContent = `${current.speedMs} m/s`;
    massSlider.output.textContent = display_format_mass(current.massKg);
    dragSlider.output.textContent = current.dragCoefficient.toFixed(DRAG_DIGITS);
    areaSlider.output.textContent = display_format_area(current.areaM2);
    densitySlider.output.textContent = `${current.densityKgM3.toFixed(DENSITY_DIGITS)} kg/m³`;

    // 인덱스형(로그) 슬라이더는 값을 그대로 읽히면 "-40"이 된다.
    massSlider.input.setAttribute('aria-valuetext', display_format_mass(current.massKg));
    areaSlider.input.setAttribute('aria-valuetext', display_format_area(current.areaM2));
    angleSlider.input.setAttribute('aria-valuetext', `${current.angleDeg.toFixed(ANGLE_DIGITS)} degrees`);
    speedSlider.input.setAttribute('aria-valuetext', `${current.speedMs} metres per second`);
    densitySlider.input.setAttribute(
      'aria-valuetext', `${current.densityKgM3.toFixed(DENSITY_DIGITS)} kilograms per cubic metre`,
    );
  }

  /** 지금 설정이 어느 프리셋과 같은지. 라디오가 아니라 버튼이므로 상태만 알린다. */
  function display_show_presets(current) {
    for (const preset of PROJECTILE_PRESETS) {
      const pressed = ['massKg', 'areaM2', 'dragCoefficient'].every(
        (key) => preset[key] === undefined || preset[key] === current[key],
      );
      presets.buttons[preset.key].setAttribute('aria-pressed', String(pressed));
    }
  }

  function display_show_table(summary) {
    const rows = [
      ['Range', 'rangeMetres', 'm', display_format_metres],
      ['Highest point', 'apexHeightMetres', 'm', display_format_metres],
      ['Time in the air', 'flightSeconds', 's', display_format_seconds],
      ['Speed on landing', 'landingSpeedMs', 'm/s', display_format_speed],
    ];
    table.body.textContent = '';
    for (const [name, key, unit, format_value] of rows) {
      const withDrag = summary.drag[key];
      const without = summary.vacuum[key];
      table.body.appendChild(
        control_build_table_row([
          name,
          `${format_value(withDrag)} ${unit}`,
          `${format_value(without)} ${unit}`,
          `${display_format_gap(without - withDrag, format_value)} ${unit}`,
        ]),
      );
    }
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. **계산 경로는 여기 하나뿐이다.** */
  function widget_update() {
    const current = state_read_sliders();
    display_show_sliders(current);
    display_show_presets(current);

    lastSummary = model_calculate_summary(current);
    lastSweep = model_calculate_sweep(current);

    cards.range.value.textContent = display_format_metres(lastSummary.drag.rangeMetres);
    cards.range.unit.textContent = `m · ${NAME_VACUUM} ${display_format_metres(lastSummary.vacuum.rangeMetres)} m`;
    cards.apex.value.textContent = display_format_metres(lastSummary.drag.apexHeightMetres);
    cards.apex.unit.textContent = `m · ${NAME_VACUUM} ${display_format_metres(lastSummary.vacuum.apexHeightMetres)} m`;
    cards.time.value.textContent = display_format_seconds(lastSummary.drag.flightSeconds);
    cards.time.unit.textContent = `s · ${NAME_VACUUM} ${display_format_seconds(lastSummary.vacuum.flightSeconds)} s`;
    cards.landing.value.textContent = display_format_speed(lastSummary.drag.landingSpeedMs);
    cards.landing.unit.textContent = `m/s · ${NAME_VACUUM} ${display_format_speed(lastSummary.vacuum.landingSpeedMs)} m/s`;

    const spoken = display_describe_verdict(lastSummary, lastSweep);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    display_show_table(lastSummary);
    url_write_state(current);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastSummary || !lastSweep) return;
    const drawnPath = chart_render_path(pathCanvas, lastSummary);
    const drawnSweep = chart_render_sweep(sweepCanvas, lastSweep, lastSummary.params.angleDeg);

    pathNote.textContent = display_describe_path(lastSummary, drawnPath);
    sweepNote.textContent = display_describe_sweep(lastSweep, lastSummary.params.angleDeg, drawnSweep);
    pathCanvas.setAttribute('aria-label', pathNote.textContent);
    sweepCanvas.setAttribute('aria-label', sweepNote.textContent);
  }

  /** 프리셋 한 번에 여러 슬라이더가 바뀐다. 슬라이더를 먼저 옮기고 한 번만 계산한다. */
  function widget_apply_preset(preset) {
    if (preset.massKg !== undefined) {
      massSlider.input.value = String(model_calculate_log_index(PROJECTILE_MASS_AXIS, preset.massKg));
    }
    if (preset.areaM2 !== undefined) {
      areaSlider.input.value = String(model_calculate_log_index(PROJECTILE_AREA_AXIS, preset.areaM2));
    }
    if (preset.dragCoefficient !== undefined) {
      dragSlider.input.value = String(preset.dragCoefficient);
    }
    widget_update();
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    // 각도 스윕은 슬라이더 한 번에 궤적을 백 번 넘게 적분한다. 반드시 디바운스한다.
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
  for (const preset of PROJECTILE_PRESETS) {
    widget_bind(presets.buttons[preset.key], 'click', () => widget_apply_preset(preset));
  }
  // resize는 재적분 없이 재드로우만. 아니면 창을 끌 때마다 스윕이 다시 돈다.
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

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
