/**
 * 자전거 기어비 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 조작부를 만들고, 값을 읽고, 그린다.
 * 상태는 URL 쿼리스트링에만 싣는다 (localStorage 없음).
 *
 * 이 도구는 사이트에서 조작부가 가장 많다. 그래서 두 가지를 지킨다.
 *   ① **모든 칸에 평이한 라벨 + 라벨 바로 아래 한 문장 설명.**
 *      chainring·cassette·ETRTO·gear inches 같은 말을 라벨에 그냥 던지지 않는다.
 *   ② **깨진 입력은 조용히 NaN을 흘리지 않고 화면에 이유를 적는다.**
 *      사유 문구는 model.js가 만든다 — 여기서 다시 쓰지 않는다.
 */
import {
  PERCENT_SCALE,
  GEAR_CHAINRING_MIN,
  GEAR_CHAINRING_MAX,
  GEAR_CHAINRING_STEP,
  GEAR_CHAINRING_NONE,
  GEAR_CHAINRING_DEFAULT_LARGE,
  GEAR_CHAINRING_DEFAULT_SMALL,
  GEAR_SPROCKET_MIN,
  GEAR_SPROCKET_MAX,
  GEAR_SPROCKET_COUNT_MAX,
  GEAR_CASSETTE_SEPARATOR,
  GEAR_CASSETTE_PRESETS,
  GEAR_BIKE_PRESETS,
  GEAR_TYRE_WIDTH_MIN,
  GEAR_TYRE_WIDTH_MAX,
  GEAR_TYRE_WIDTH_STEP,
  GEAR_TYRE_WIDTH_DEFAULT,
  GEAR_BEAD_SEAT_CHOICES,
  GEAR_BEAD_SEAT_DEFAULT,
  GEAR_CRANK_MIN,
  GEAR_CRANK_MAX,
  GEAR_CRANK_STEP,
  GEAR_CRANK_DEFAULT,
  GEAR_CADENCE_MIN,
  GEAR_CADENCE_MAX,
  GEAR_CADENCE_STEP,
  GEAR_CADENCE_DEFAULT,
  GEAR_TOLERANCE_MIN,
  GEAR_TOLERANCE_MAX,
  GEAR_TOLERANCE_STEP,
  GEAR_TOLERANCE_DEFAULT,
  model_clamp_chainring,
  model_clamp_chainring_optional,
  model_clamp_tyre_width,
  model_clamp_bead_seat,
  model_clamp_crank,
  model_clamp_cadence,
  model_clamp_tolerance,
  model_read_cassette,
  model_read_cassette_or_default,
  model_format_cassette,
  model_check_parameters,
  model_calculate_result,
  model_calculate_bike_preset_state,
  model_pick_matching_bike_preset,
  model_pick_matching_cassette_preset,
} from './model.js';

import { num_format_count, num_format_plural, num_calculate_decimal_digits } from '../_shared/numbers.js';
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
const ROOT_SELECTOR = '[data-widget="bicycle-gear-ratio"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_RING_1 = 'cr1';
const URL_KEY_RING_2 = 'cr2';
const URL_KEY_CASSETTE = 'cs';
const URL_KEY_WIDTH = 'w';
const URL_KEY_BEAD_SEAT = 'bsd';
const URL_KEY_CRANK = 'l';
const URL_KEY_CADENCE = 'n';
const URL_KEY_TOLERANCE = 'tau';

// ── 표시 자릿수 ────────────────────────────────────────────
const GEAR_INCH_DIGITS = 1;
const GAIN_RATIO_DIGITS = 2;
const DEVELOPMENT_DIGITS = 2;
const SPEED_DIGITS = 1;
const FACTOR_DIGITS = 2;
/** 허용오차의 자릿수는 값의 크기가 아니라 **눈금의 정밀도**로 정한다. */
const TOLERANCE_DIGITS = num_calculate_decimal_digits(GEAR_TOLERANCE_STEP);
const CRANK_DIGITS = num_calculate_decimal_digits(GEAR_CRANK_STEP);
/** 축 눈금 라벨의 유효숫자. */
const AXIS_LABEL_SIGNIFICANT = 3;
const AXIS_LABEL_DECIMALS_MAX = 3;
const AXIS_LABEL_WHOLE_MIN = 10;
/**
 * 비드시트 지름별 설명문. **목록 자체는 모델의 `GEAR_BEAD_SEAT_CHOICES`가 진실 원본이다** —
 * 여기는 설명만 얹는다. 설명이 없는 지름이 상수에 늘면 지름만 적힌 항목으로 뜬다.
 */
const BEAD_SEAT_NOTES = {
  622: 'most road and hybrid wheels',
  584: 'wider-tyre road and off-road wheels',
  559: 'older off-road wheels',
  406: 'small-wheel and folding bicycles',
};
const RECOMPUTE_DELAY_MS = 110;
const VALUE_PLACEHOLDER = '—';

// ── 사다리 치수 ────────────────────────────────────────────
const LADDER_HEIGHT_PX = 210;
const LADDER_PAD_TOP = 26;
const LADDER_PAD_RIGHT = 18;
const LADDER_PAD_BOTTOM = 56;
const LADDER_PAD_LEFT = 18;
const LADDER_MARKER_RADIUS = 5.5;
const LADDER_MARKER_WIDTH = 2;
const LADDER_ROW_LABEL_GAP = 12;
/** 같은 줄 안의 짝은 곧게 이으면 줄의 바닥선과 겹친다. 아래로 이만큼 우회시킨다. */
const LADDER_PAIR_DIP_PX = 14;
const LADDER_PAIR_DASH = [3, 3];
const LADDER_SPROCKET_GAP = 11;
/** 톱니 수 라벨끼리 이만큼은 떨어져야 찍는다. 겹치면 밀지 않고 버린다. */
const LADDER_SPROCKET_MIN_GAP_PX = 4;
/** 로그 축 좌우 여유(데케이드 비율). 마커가 축선에 붙지 않게. */
const LADDER_LOG_PAD_DECADES = 0.035;
/** 축 스팬이 0이 될 때 최소 표시 폭(데케이드). 없으면 좌표가 NaN이 된다. */
const LADDER_LOG_MIN_SPAN = 0.25;
/** 로그 축 눈금 후보. 1-2-5 계열을 촘촘히 깔고 겹치는 것부터 버린다. */
const LADDER_TICK_MANTISSA = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];
const LADDER_TICK_MIN_GAP_PX = 10;

// ── 속도 그래프 치수 ───────────────────────────────────────
const SPEED_HEIGHT_PX = 300;
const SPEED_PAD_TOP = 16;
const SPEED_PAD_RIGHT = 16;
const SPEED_PAD_BOTTOM = 54;
const SPEED_PAD_LEFT = 52;
const SPEED_LINE_WIDTH = 1.6;
const SPEED_LINE_DASH = [5, 4];
const SPEED_CURSOR_DASH = [2, 3];
const SPEED_DOT_RADIUS = 2.6;
/** y축 위쪽 여유. 가장 빠른 선이 천장에 붙지 않게. */
const SPEED_HEAD_ROOM = 1.06;
/** 데이터가 전부 0일 때의 최소 y 상한. 좌표가 NaN이 되는 것을 막는다. */
const SPEED_MIN_HIGH_KMH = 1;

// ── 공통 그리기 치수 ───────────────────────────────────────
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_GRID_WIDTH = 1;
const CHART_LABEL_MIN_GAP_PX = 8;
/** 축 제목이 줄바꿈될 때 한 줄의 세로 높이(px). 360px 화면에서 글자를 줄이는 대신 줄을 늘린다. */
const CHART_TITLE_LINE_HEIGHT_PX = 14;

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_SERIES = ['--series-1', '--series-2'];
const COLOR_FALLBACK_SERIES = ['#1f4e79', '#c2570a'];
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_VAR_SURFACE = '--surface';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_SURFACE = '#ffffff';

// ── 문구 ───────────────────────────────────────────────────
const LADDER_TITLE_X = 'Gear inches — how far one pedal turn takes you (log scale)';
const SPEED_TITLE_X = 'Cadence — pedal turns per minute (linear)';
const SPEED_TITLE_Y = 'Speed, km/h (linear)';
const TABLE_HEADINGS = ['Gear', 'Gear inches', 'Gain ratio', 'Development', 'Speed', 'Near twin'];
const VERDICT_HEADLINE = {
  hold: 'The model finds almost nothing repeated in this drivetrain.',
  edge: 'The model finds part of this drivetrain repeated.',
  break: 'The model finds most of this drivetrain repeated.',
};
const INVALID_HEADLINE = 'The model cannot read that setup yet.';
/** 앞 칸에 숫자가 아닌 것이 들어왔을 때. 카세트와 달리 파서가 따로 없다. */
const RING_TEXT_MESSAGE =
  `Write each front ring as a plain whole number of teeth between ${GEAR_CHAINRING_MIN} and ${GEAR_CHAINRING_MAX}, ` +
  'or leave the second box empty for a single-ring setup.';

// ── 표시 함수 ──────────────────────────────────────────────

export function display_format_gear_inches(value) {
  return Number.isFinite(value) ? value.toFixed(GEAR_INCH_DIGITS) : VALUE_PLACEHOLDER;
}

export function display_format_gain_ratio(value) {
  return Number.isFinite(value) ? value.toFixed(GAIN_RATIO_DIGITS) : VALUE_PLACEHOLDER;
}

export function display_format_development(value) {
  return Number.isFinite(value) ? `${value.toFixed(DEVELOPMENT_DIGITS)} m` : VALUE_PLACEHOLDER;
}

export function display_format_speed(value) {
  return Number.isFinite(value) ? value.toFixed(SPEED_DIGITS) : VALUE_PLACEHOLDER;
}

export function display_format_tolerance(percent) {
  return `${percent.toFixed(TOLERANCE_DIGITS)}%`;
}

/** 지분은 정수 퍼센트로. 조합이 22개면 한 개가 4.5포인트라 자릿수가 남는다. */
export function display_format_share(fraction) {
  return Number.isFinite(fraction) ? `${Math.round(fraction * PERCENT_SCALE)}%` : VALUE_PLACEHOLDER;
}

export function display_format_factor(value) {
  return Number.isFinite(value) ? `${value.toFixed(FACTOR_DIGITS)}×` : VALUE_PLACEHOLDER;
}

/** 조합 이름. 표의 행 제목이자 범례가 인용하는 이름이다. */
export function display_format_gear_name(combination) {
  return `${combination.chainring} × ${combination.sprocket}`;
}

/**
 * 축 눈금 라벨. **고정 소수 자릿수를 쓰지 않는다** — 작은 휠에서는 축 아래 끝이
 * 20 아래로 내려가고, 정수로만 찍으면 두 눈금이 같은 글자가 된다.
 */
export function display_format_axis_number(value) {
  // 0은 유효한 눈금이다 (속도 y축은 0에서 시작한다) — 자리표시자로 삼키지 않는다.
  if (!Number.isFinite(value) || value < 0) return VALUE_PLACEHOLDER;
  if (value === 0) return '0';
  if (value >= AXIS_LABEL_WHOLE_MIN) return String(Math.round(value));
  const decimals = Math.max(0, AXIS_LABEL_SIGNIFICANT - 1 - Math.floor(Math.log10(value)));
  return value.toFixed(Math.min(decimals, AXIS_LABEL_DECIMALS_MAX));
}

/**
 * 판정 문장. **주어는 언제나 모델이다.** 결론 한 문장과 근거 숫자 하나를 앞에 둔다.
 * 장비를 고르라는 말은 하지 않는다 — 이 페이지는 나눗셈만 한다.
 */
export function display_describe_verdict(result) {
  const headline =
    result.combinationCount === 1
      ? 'With one ring and one sprocket the model has a single ratio and nothing to compare it with.'
      : VERDICT_HEADLINE[result.verdict];

  const repeats =
    result.removableCount === 0
      ? `At a ${display_format_tolerance(result.tolerancePercent)} tolerance the model finds no two combinations ` +
        `close enough to call the same gear`
      : `At a ${display_format_tolerance(result.tolerancePercent)} tolerance the model can drop ` +
        `${num_format_count(result.removableCount)} of ${num_format_count(result.combinationCount)} combinations ` +
        `and still reach every ratio the drivetrain has`;

  const detail =
    `${repeats}. It puts the whole range at ${display_format_gear_inches(result.lowest.gearInches)} to ` +
    `${display_format_gear_inches(result.highest.gearInches)} gear inches, a factor of ` +
    `${display_format_factor(result.rangeFactor)}, and at ${num_format_count(result.cadenceRpm)} rpm the top ` +
    `combination (${display_format_gear_name(result.highest)}) comes to ` +
    `${display_format_speed(result.highest.speedKmh)} km/h against ` +
    `${display_format_speed(result.lowest.speedKmh)} for the bottom one.`;

  return { headline, detail };
}

/**
 * 세 정의를 한 문단에 나란히 적는다. **어느 하나를 대표값으로 삼지 않는다** —
 * 같은 여섯 쌍에서 27 %, 55 %, 42 %가 함께 나온다는 것이 이 페이지의 논점이다.
 */
export function display_describe_counting(result) {
  const tolerance = display_format_tolerance(result.tolerancePercent);
  const overlap =
    result.chainrings.length < 2
      ? `With a single front ring there is no second row to overlap, so the third count is 0%.`
      : `Measured as range rather than as count, more than one front ring covers ` +
        `${display_format_share(result.overlapShare)} of the span — that one does not move with the tolerance ` +
        `slider at all, because it measures width and not closeness.`;
  return (
    `Three ways to count the same repetition. ${num_format_count(result.removableCount)} of ` +
    `${num_format_count(result.combinationCount)} combinations (${display_format_share(result.removableShare)}) ` +
    `can be deleted without losing a ratio at ${tolerance}. ` +
    `${num_format_count(result.pairedCount)} of ${num_format_count(result.combinationCount)} ` +
    `(${display_format_share(result.pairedShare)}) have a near twin somewhere in the drivetrain, which counts ` +
    `both halves of every pair. ${overlap}`
  );
}

// ── URL 상태 ────────────────────────────────────────────────

/**
 * 쿼리스트링에서 상태를 읽는다.
 * 깨진 값은 **최솟값이 아니라 기본값**으로 돌아간다 — 카세트 문자열도 같다.
 */
export function url_read_state(search) {
  const numbers = urlstate_read_numbers(search, {
    [URL_KEY_RING_1]: { fallback: GEAR_CHAINRING_DEFAULT_LARGE, clamp: model_clamp_chainring },
    [URL_KEY_RING_2]: { fallback: GEAR_CHAINRING_DEFAULT_SMALL, clamp: model_clamp_chainring_optional },
    [URL_KEY_WIDTH]: { fallback: GEAR_TYRE_WIDTH_DEFAULT, clamp: model_clamp_tyre_width },
    [URL_KEY_BEAD_SEAT]: { fallback: GEAR_BEAD_SEAT_DEFAULT, clamp: model_clamp_bead_seat },
    [URL_KEY_CRANK]: { fallback: GEAR_CRANK_DEFAULT, clamp: model_clamp_crank },
    [URL_KEY_CADENCE]: { fallback: GEAR_CADENCE_DEFAULT, clamp: model_clamp_cadence },
    [URL_KEY_TOLERANCE]: { fallback: GEAR_TOLERANCE_DEFAULT, clamp: model_clamp_tolerance },
  });
  const params = new URLSearchParams(search ?? '');
  const chainrings = [numbers[URL_KEY_RING_1]];
  if (numbers[URL_KEY_RING_2] !== GEAR_CHAINRING_NONE) chainrings.push(numbers[URL_KEY_RING_2]);

  return {
    chainrings,
    cassette: model_read_cassette_or_default(params.get(URL_KEY_CASSETTE)),
    tyreWidthMm: numbers[URL_KEY_WIDTH],
    beadSeatMm: numbers[URL_KEY_BEAD_SEAT],
    crankMm: numbers[URL_KEY_CRANK],
    cadenceRpm: numbers[URL_KEY_CADENCE],
    tolerancePercent: numbers[URL_KEY_TOLERANCE],
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_RING_1]: state.chainrings[0],
    [URL_KEY_RING_2]: state.chainrings[1] ?? GEAR_CHAINRING_NONE,
    [URL_KEY_CASSETTE]: state.cassette.join(GEAR_CASSETTE_SEPARATOR),
    [URL_KEY_WIDTH]: state.tyreWidthMm,
    [URL_KEY_BEAD_SEAT]: state.beadSeatMm,
    [URL_KEY_CRANK]: state.crankMm,
    [URL_KEY_CADENCE]: state.cadenceRpm,
    [URL_KEY_TOLERANCE]: state.tolerancePercent,
  });
}

// ── 축 ──────────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

function chart_read_series_color(canvasEl, ringIndex) {
  const slot = ringIndex % COLOR_VAR_SERIES.length;
  return chart_read_color(canvasEl, COLOR_VAR_SERIES[slot], COLOR_FALLBACK_SERIES[slot]);
}

/**
 * 사다리의 가로 로그축 범위를 데이터에서 정한다.
 *
 * **0 이하는 범위 계산에 넣지 않는다** — `log(0) = −Infinity`가 되면 눈금 루프가
 * 예외가 아니라 무한루프가 되어 탭이 얼어붙는다.
 * 조합이 하나뿐이면 스팬이 0이라 좌표가 NaN이 된다. 최소 표시 폭을 준다.
 */
export function chart_calculate_ladder_scale(combinations) {
  let low = Number.POSITIVE_INFINITY;
  let high = 0;
  for (const combination of combinations ?? []) {
    const value = combination.gearInches;
    if (!(value > 0) || !Number.isFinite(value)) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (!(high > 0) || !Number.isFinite(low)) return { low: 1, high: 10 };

  let logLow = Math.log10(low) - LADDER_LOG_PAD_DECADES;
  let logHigh = Math.log10(high) + LADDER_LOG_PAD_DECADES;
  if (logHigh - logLow < LADDER_LOG_MIN_SPAN) {
    const middle = (logHigh + logLow) / 2;
    logLow = middle - LADDER_LOG_MIN_SPAN / 2;
    logHigh = middle + LADDER_LOG_MIN_SPAN / 2;
  }
  return { low: Math.pow(10, logLow), high: Math.pow(10, logHigh) };
}

/**
 * 로그 축의 눈금 값들. 1-2-5 계열의 후보를 깔고 범위 안의 것만 남긴다.
 * **진입 가드가 없으면 무한루프다** — 0이나 음수, 무한대가 들어오면 빈 배열.
 */
export function chart_build_log_ticks(low, high) {
  if (!(low > 0) || !(high > low) || !Number.isFinite(low) || !Number.isFinite(high)) return [];
  const ticks = [];
  const firstPower = Math.floor(Math.log10(low));
  const lastPower = Math.floor(Math.log10(high));
  for (let power = firstPower; power <= lastPower; power += 1) {
    for (const mantissa of LADDER_TICK_MANTISSA) {
      const value = mantissa * Math.pow(10, power);
      if (value >= low && value <= high) ticks.push(value);
    }
  }
  return ticks;
}

function chart_calculate_log_x(value, scale, plotWidth) {
  const logLow = Math.log10(scale.low);
  const logHigh = Math.log10(scale.high);
  return ((Math.log10(value) - logLow) / (logHigh - logLow)) * plotWidth;
}

// ── 유효하지 않은 입력일 때의 그림 ────────────────────────────
/**
 * 깨진 입력이면 사다리·속도 캔버스가 각자의 정상 높이(210px·300px, 합쳐 ~600px 가까이)로
 * 여전히 예약되면서 안은 비어 있었다 — 빈 덩어리만 남고 이유는 옆의 문단에만 있었다.
 * **이 높이로 줄이고, 이유는 그림 안에 짧게 적는다.**
 */
const CHART_INVALID_HEIGHT_PX = 96;
const CHART_INVALID_PAD_PX = 16;
const CHART_INVALID_LINE_HEIGHT_PX = 18;

/** 긴 문장을 캔버스 폭에 맞춰 단어 단위로 줄바꿈한다. `context.font`가 먼저 설정돼 있어야 한다. */
export function chart_wrap_text(context, text, maxWidth) {
  if (!(maxWidth > 0)) return [text];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

/**
 * 유효하지 않은 입력일 때 그리는 그림. **주어는 모델이다** — 부르는 쪽이 만든
 * `model_check_parameters`의 사유 문구를 그대로 그림 안에 적고, 판이 크게 비지 않게
 * 훨씬 낮은 높이만 예약한다.
 */
function chart_render_invalid_message(canvasEl, message) {
  const setup = canvas_setup_context(canvasEl, CHART_INVALID_HEIGHT_PX);
  if (!setup) return null;
  const { context, width } = setup;
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  context.font = CHART_LABEL_FONT;
  context.fillStyle = colorText;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  const maxWidth = Math.max(1, width - CHART_INVALID_PAD_PX * 2);
  const lines = chart_wrap_text(context, message || INVALID_HEADLINE, maxWidth);
  lines.forEach((line, index) => {
    context.fillText(line, CHART_INVALID_PAD_PX, CHART_INVALID_PAD_PX + index * CHART_INVALID_LINE_HEIGHT_PX);
  });
  return { invalid: true, lineCount: lines.length };
}

// ── 사다리 ──────────────────────────────────────────────────

/**
 * 기어 사다리. 가로는 로그축의 gear inches, 세로는 앞 체인링별 줄.
 *
 * 중복으로 판정된 조합은 **속을 비운 마커 + 점선 연결선**으로 그린다.
 * 색만으로 갈리지 않게 하는 것이 이 그림의 규칙이다.
 * **자기가 쓴 축과 실제로 찍은 라벨 수를 반환한다** — 캡션이 축을 다시 계산하면
 * 그림과 갈라져 틀린 범위가 그림 밑에 적힌다.
 */
export function chart_render_ladder(canvasEl, result, invalidMessage = null) {
  if (!result || result.combinations.length === 0) {
    return chart_render_invalid_message(canvasEl, invalidMessage);
  }
  const setup = canvas_setup_context(canvasEl, LADDER_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;
  context.font = CHART_LABEL_FONT; // 제목 줄바꿈 폭을 재려면 폰트를 먼저 확정해야 한다

  // 360px 화면에서 제목이 잘리지 않게 — 글자를 줄이지 않고 필요하면 줄을 늘린다.
  const xTitleLines = chart_wrap_text(context, LADDER_TITLE_X, Math.max(1, width - LADDER_PAD_LEFT - LADDER_PAD_RIGHT));
  const padBottom = LADDER_PAD_BOTTOM + Math.max(0, xTitleLines.length - 1) * CHART_TITLE_LINE_HEIGHT_PX;

  const plotWidth = Math.max(1, width - LADDER_PAD_LEFT - LADDER_PAD_RIGHT);
  const plotHeight = Math.max(1, height - LADDER_PAD_TOP - padBottom);
  const scale = chart_calculate_ladder_scale(result.combinations);

  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);
  const colorSurface = chart_read_color(canvasEl, COLOR_VAR_SURFACE, COLOR_FALLBACK_SURFACE);

  const rowCount = result.chainrings.length;
  const rowGap = plotHeight / rowCount;
  const rowY = (ringIndex) => (ringIndex + 0.5) * rowGap;
  const pointX = (combination) => chart_calculate_log_x(combination.gearInches, scale, plotWidth);

  context.save();
  context.translate(LADDER_PAD_LEFT, LADDER_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로 격자 + 축 눈금 라벨 ──
  const tickValues = chart_build_log_ticks(scale.low, scale.high);
  const tickItems = tickValues.map((value) => ({
    value,
    position: chart_calculate_log_x(value, scale, plotWidth),
    width: context.measureText(display_format_axis_number(value)).width,
  }));
  const keptTicks = ticks_drop_crowded(tickItems, LADDER_TICK_MIN_GAP_PX);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  for (const item of keptTicks) {
    context.beginPath();
    context.moveTo(item.position, 0);
    context.lineTo(item.position, plotHeight);
    context.stroke();
  }

  // ── 줄 바닥선과 줄 이름 ──
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  for (let ringIndex = 0; ringIndex < rowCount; ringIndex += 1) {
    const y = rowY(ringIndex);
    context.strokeStyle = colorGrid;
    context.lineWidth = CHART_GRID_WIDTH;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(plotWidth, y);
    context.stroke();
    context.fillStyle = chart_read_series_color(canvasEl, ringIndex);
    context.fillText(
      `${result.chainrings[ringIndex]}-tooth front ring`,
      0,
      y - LADDER_MARKER_RADIUS - LADDER_ROW_LABEL_GAP,
    );
  }

  // ── 중복 쌍의 점선 연결선 ──
  const pairedSet = new Set(result.pairedIndexes);
  context.save();
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash(LADDER_PAIR_DASH);
  for (const pair of result.pairs) {
    const first = result.combinations[pair.first];
    const second = result.combinations[pair.second];
    const x1 = pointX(first);
    const x2 = pointX(second);
    const y1 = rowY(first.ringIndex);
    const y2 = rowY(second.ringIndex);
    context.beginPath();
    context.moveTo(x1, y1);
    if (first.ringIndex === second.ringIndex) {
      // 같은 줄이면 바닥선과 겹치므로 아래로 우회시킨다.
      context.lineTo(x1, y1 + LADDER_PAIR_DIP_PX);
      context.lineTo(x2, y2 + LADDER_PAIR_DIP_PX);
    }
    context.lineTo(x2, y2);
    context.stroke();
  }
  context.restore();

  // ── 마커와 톱니 수 라벨 ──
  let labelledCount = 0;
  for (let ringIndex = 0; ringIndex < rowCount; ringIndex += 1) {
    const inRow = result.combinations
      .map((combination, index) => ({ combination, index }))
      .filter((item) => item.combination.ringIndex === ringIndex);

    const color = chart_read_series_color(canvasEl, ringIndex);
    const y = rowY(ringIndex);
    for (const item of inRow) {
      const x = pointX(item.combination);
      const hollow = pairedSet.has(item.index);
      context.beginPath();
      context.arc(x, y, LADDER_MARKER_RADIUS, 0, Math.PI * 2);
      context.fillStyle = hollow ? colorSurface : color;
      context.fill();
      if (hollow) {
        context.strokeStyle = color;
        context.lineWidth = LADDER_MARKER_WIDTH;
        context.stroke();
      }
    }

    // 라벨이 겹치면 밀지 않고 버린다. 양 끝은 남기고 가운데부터 희생한다.
    const labelItems = inRow.map((item) => ({
      value: item.combination.sprocket,
      position: pointX(item.combination),
      width: context.measureText(String(item.combination.sprocket)).width,
    }));
    const keptLabels = ticks_drop_crowded(labelItems, LADDER_SPROCKET_MIN_GAP_PX);
    context.fillStyle = colorText;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const label of keptLabels) {
      context.fillText(String(label.value), label.position, y + LADDER_SPROCKET_GAP);
    }
    labelledCount += keptLabels.length;
  }

  // ── 축선과 눈금 라벨 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(0, plotHeight);
  context.lineTo(plotWidth, plotHeight);
  context.stroke();

  context.fillStyle = colorText;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const item of keptTicks) {
    context.fillText(display_format_axis_number(item.value), item.position, plotHeight + CHART_LABEL_GAP);
  }
  xTitleLines.forEach((line, index) => {
    context.fillText(
      line,
      plotWidth / 2,
      plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP + index * CHART_TITLE_LINE_HEIGHT_PX,
    );
  });

  context.restore();
  return { scale, rowCount, labelledCount, tickCount: keptTicks.length };
}

/** 사다리가 말하는 것. 캡션은 **렌더가 실제로 쓴 축**만 인용한다. */
export function chart_describe_ladder(result, drawn) {
  const rows =
    result.chainrings.length > 1
      ? `Two rows, one per front ring, in the two series colours.`
      : `One row, because this setup has a single front ring.`;
  const axis = drawn
    ? `The axis runs ${display_format_axis_number(drawn.scale.low)} to ` +
      `${display_format_axis_number(drawn.scale.high)} gear inches on a log scale and rescales to the setup — ` +
      `read it before comparing two settings.`
    : `The axis runs across the gear inches the setup reaches, on a log scale.`;
  const twins =
    result.pairedCount > 0
      ? `${num_format_count(result.pairedCount)} ${num_format_plural(result.pairedCount, 'marker is', 'markers are')} ` +
        `drawn hollow and joined by a dashed line: those are within ` +
        `${display_format_tolerance(result.tolerancePercent)} of another combination.`
      : `No marker is hollow, so at ${display_format_tolerance(result.tolerancePercent)} the model finds no pair ` +
        `close enough to call the same gear.`;
  return `${rows} Each marker is one combination, and the number under it is the sprocket. ${twins} ${axis}`;
}

// ── 속도 그래프 ─────────────────────────────────────────────

/**
 * 속도 vs 케이던스. 비가 고정이면 속도는 케이던스에 정확히 비례하므로
 * 조합마다 원점을 지나는 직선 하나다. 세로선이 지금 케이던스 자리다.
 * 앞 체인링은 색과 **선 종류**로 함께 갈린다 — 색만으로 구분하지 않는다.
 */
export function chart_render_speed(canvasEl, result, invalidMessage = null) {
  if (!result || result.combinations.length === 0) {
    return chart_render_invalid_message(canvasEl, invalidMessage);
  }
  const setup = canvas_setup_context(canvasEl, SPEED_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;
  context.font = CHART_LABEL_FONT; // 제목 줄바꿈 폭을 재려면 폰트를 먼저 확정해야 한다

  // 360px 화면에서 두 축 제목이 잘리지 않게 — 글자를 줄이지 않고 필요하면 줄을 늘린다.
  const xTitleLines = chart_wrap_text(context, SPEED_TITLE_X, Math.max(1, width - SPEED_PAD_LEFT - SPEED_PAD_RIGHT));
  const yTitleLines = chart_wrap_text(context, SPEED_TITLE_Y, Math.max(1, height - SPEED_PAD_TOP - SPEED_PAD_BOTTOM));
  const padBottom = SPEED_PAD_BOTTOM + Math.max(0, xTitleLines.length - 1) * CHART_TITLE_LINE_HEIGHT_PX;
  const padLeft = SPEED_PAD_LEFT + Math.max(0, yTitleLines.length - 1) * CHART_TITLE_LINE_HEIGHT_PX;

  const plotWidth = Math.max(1, width - padLeft - SPEED_PAD_RIGHT);
  const plotHeight = Math.max(1, height - SPEED_PAD_TOP - padBottom);

  // 직선의 기울기는 케이던스 1 rpm당 속도다. 지금 케이던스에서의 값으로부터 만든다.
  const slopes = result.combinations.map((combination) => combination.speedKmh / result.cadenceRpm);
  const highKmh = Math.max(SPEED_MIN_HIGH_KMH, Math.max(...slopes) * GEAR_CADENCE_MAX * SPEED_HEAD_ROOM);

  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  const toX = (cadence) =>
    ((cadence - GEAR_CADENCE_MIN) / (GEAR_CADENCE_MAX - GEAR_CADENCE_MIN)) * plotWidth;
  const toY = (kmh) => plotHeight - (kmh / highKmh) * plotHeight;

  context.save();
  context.translate(padLeft, SPEED_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 가로 격자 (속도) ──
  const yStep = ticks_calculate_step(highKmh);
  const yTicks = ticks_build_linear(0, highKmh, yStep);
  const yItems = yTicks.map((value) => ({ value, position: toY(value), width: CHART_LABEL_MIN_GAP_PX }));
  const keptY = ticks_drop_crowded(yItems, CHART_LABEL_MIN_GAP_PX);
  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.fillStyle = colorText;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const item of keptY) {
    context.beginPath();
    context.moveTo(0, item.position);
    context.lineTo(plotWidth, item.position);
    context.stroke();
    context.fillText(display_format_axis_number(item.value), -CHART_LABEL_GAP, item.position);
  }

  // ── 세로 눈금 (케이던스) ──
  const xStep = ticks_calculate_step(GEAR_CADENCE_MAX - GEAR_CADENCE_MIN);
  const xTicks = ticks_build_linear(GEAR_CADENCE_MIN, GEAR_CADENCE_MAX, xStep);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const value of xTicks) {
    context.fillText(String(Math.round(value)), toX(value), plotHeight + CHART_LABEL_GAP);
  }

  // ── 직선 다발 ──
  result.combinations.forEach((combination, index) => {
    context.save();
    context.strokeStyle = chart_read_series_color(canvasEl, combination.ringIndex);
    context.lineWidth = SPEED_LINE_WIDTH;
    context.setLineDash(combination.ringIndex === 0 ? [] : SPEED_LINE_DASH);
    context.beginPath();
    context.moveTo(toX(GEAR_CADENCE_MIN), toY(slopes[index] * GEAR_CADENCE_MIN));
    context.lineTo(toX(GEAR_CADENCE_MAX), toY(slopes[index] * GEAR_CADENCE_MAX));
    context.stroke();
    context.restore();
  });

  // ── 지금 케이던스 ──
  const cursorX = toX(result.cadenceRpm);
  context.save();
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.setLineDash(SPEED_CURSOR_DASH);
  context.beginPath();
  context.moveTo(cursorX, 0);
  context.lineTo(cursorX, plotHeight);
  context.stroke();
  context.restore();

  for (const combination of result.combinations) {
    context.beginPath();
    context.arc(cursorX, toY(combination.speedKmh), SPEED_DOT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = chart_read_series_color(canvasEl, combination.ringIndex);
    context.fill();
  }

  // ── 축선과 제목 ──
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
  xTitleLines.forEach((line, index) => {
    context.fillText(
      line,
      plotWidth / 2,
      plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP + index * CHART_TITLE_LINE_HEIGHT_PX,
    );
  });
  context.save();
  context.translate(-padLeft + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  yTitleLines.forEach((line, index) => {
    context.fillText(line, 0, index * CHART_TITLE_LINE_HEIGHT_PX);
  });
  context.restore();

  context.restore();
  return { highKmh, lineCount: result.combinations.length };
}

/**
 * 속도 그래프의 캡션. 그림이 실제로 쓴 축 상한만 인용한다.
 *
 * 중복으로 판정된 선들은 정의상 서로 τ 안에 있어 이 축에서 선 굵기보다 가깝다.
 * **축을 더 조이지 않고 "구분 불가"라고 적는다** — 더 확대하면 나머지 선이
 * 창 밖으로 나가고, 안 적으면 독자가 별개의 선이라고 오독한다.
 */
export function chart_describe_speed(result, drawn) {
  const ceiling = drawn
    ? `The vertical axis runs 0 to ${display_format_axis_number(drawn.highKmh)} km/h and rescales to the setup.`
    : '';
  const merged =
    result.pairedCount > 0
      ? ` ${num_format_count(result.pairedCount)} of the lines sit within ` +
        `${display_format_tolerance(result.tolerancePercent)} of another and cannot be told apart at this scale; ` +
        `the table below lists them separately rather than the axis being tightened around them.`
      : '';
  return (
    `One straight line per combination, because at a fixed ratio the model makes speed exactly proportional to ` +
    `cadence. Solid lines are the first front ring, dashed lines the second. The dashed vertical line is the ` +
    `cadence slider at ${num_format_count(result.cadenceRpm)} rpm, and the dots on it are the km/h column of the ` +
    `table. ${ceiling}${merged}`
  );
}

// ── 조작부 조각 (공용 모듈에 없는 것만 여기서 만든다) ────────

/** 라벨 + 설명이 붙은 행 하나. 슬라이더 행과 같은 뼈대를 쓴다. */
function widget_build_labelled_row(id, labelText, hintText, useLabelElement) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';

  const label = document.createElement(useLabelElement ? 'label' : 'span');
  if (useLabelElement) label.setAttribute('for', id);
  label.textContent = labelText;

  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.setAttribute('id', `${id}-hint`);
  hint.textContent = hintText;

  labelBox.append(label, hint);
  row.appendChild(labelBox);
  return { row, labelBox, label, hint };
}

/** `<output>` 한 칸. 암묵적 live region을 끈다 — 발화는 판정문 하나로 모은다. */
function widget_create_output(id) {
  const output = document.createElement('output');
  output.className = 'widget-out';
  output.setAttribute('for', id);
  output.setAttribute('aria-live', 'off');
  return output;
}

/** 앞 체인링 두 칸. 숫자 입력이라 슬라이더 빌더로는 만들 수 없다. */
function widget_build_ring_row(id, labelText, hintText, slots) {
  const parts = widget_build_labelled_row(id, labelText, hintText, false);
  const inputs = slots.map((slot) => {
    const input = document.createElement('input');
    input.type = 'number';
    input.setAttribute('id', slot.id);
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('min', String(GEAR_CHAINRING_MIN));
    input.setAttribute('max', String(GEAR_CHAINRING_MAX));
    input.setAttribute('step', String(GEAR_CHAINRING_STEP));
    input.setAttribute('aria-label', slot.ariaLabel);
    input.setAttribute('aria-describedby', `${id}-hint`);
    input.value = slot.value;
    parts.row.appendChild(input);
    return input;
  });
  const output = widget_create_output(slots[0].id);
  parts.row.appendChild(output);
  return { ...parts, inputs, output };
}

/** 카세트 배열을 받는 글자 칸. */
function widget_build_cassette_row(id, labelText, hintText, value) {
  const parts = widget_build_labelled_row(id, labelText, hintText, true);
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('id', id);
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-describedby', `${id}-hint`);
  input.value = value;
  const output = widget_create_output(id);
  parts.row.append(input, output);
  return { ...parts, input, output };
}

/** 비드시트 지름 드롭다운. 값이 네 개뿐이라 슬라이더보다 목록이 맞다. */
function widget_build_select_row(id, labelText, hintText, choices, value) {
  const parts = widget_build_labelled_row(id, labelText, hintText, true);
  const select = document.createElement('select');
  select.setAttribute('id', id);
  select.setAttribute('aria-describedby', `${id}-hint`);
  for (const choice of choices) {
    const option = document.createElement('option');
    option.setAttribute('value', String(choice.value));
    option.value = String(choice.value);
    option.textContent = choice.label;
    select.appendChild(option);
  }
  // 옵션을 붙인 뒤에 값을 정한다 — 실물 DOM은 없는 옵션의 값을 받지 않는다.
  select.value = String(value);
  const output = widget_create_output(id);
  parts.row.append(select, output);
  return { ...parts, select, output };
}

/** 슬라이더를 묶는 상자. 여덟 개가 한 줄로 쌓이면 어느 것이 어느 그룹인지 모른다. */
function widget_build_group(titleText) {
  const block = document.createElement('fieldset');
  block.className = 'widget-group';
  const caption = document.createElement('legend');
  caption.className = 'widget-group-title';
  caption.textContent = titleText;
  block.appendChild(caption);
  return block;
}

/** 범례 한 줄. 견본은 기존 클래스만 쓴다 — 새 클래스를 만들지 않는다. */
function widget_build_legend_item(swatchClass, text) {
  const item = document.createElement('span');
  item.className = 'legend-item';
  const swatch = document.createElement('span');
  swatch.className = `legend-key ${swatchClass}`;
  item.append(swatch, document.createTextNode(` ${text}`));
  return item;
}

const LEGEND_SWATCH_SERIES = ['legend-mean-1', 'legend-mean-2'];
const LEGEND_SWATCH_SERIES_DASHED = ['legend-mean-1', 'legend-tail-2'];
const LEGEND_SWATCH_LINK = 'legend-reference';

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
  heading.textContent = 'Bicycle gear ratio calculator';

  // ── 자전거 유형 프리셋 ──
  const bikePresets = control_build_button_group(
    'Start from a whole bicycle',
    GEAR_BIKE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // ── 구동계 ──
  const drivetrain = widget_build_group('The drivetrain');
  const ringRow = widget_build_ring_row(
    'gear-rings',
    'Front rings (teeth)',
    'The rings the pedals turn, counted in teeth. Leave the second box empty for a single-ring setup.',
    [
      {
        id: 'gear-ring-1',
        ariaLabel: 'First front ring, number of teeth',
        value: String(state.chainrings[0]),
      },
      {
        id: 'gear-ring-2',
        ariaLabel: 'Second front ring, number of teeth. Leave empty for a single-ring setup.',
        value: state.chainrings[1] === undefined ? '' : String(state.chainrings[1]),
      },
    ],
  );
  const cassettePresets = control_build_button_group(
    'Or load a rear sprocket set',
    GEAR_CASSETTE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );
  const cassetteRow = widget_build_cassette_row(
    'gear-cassette',
    'Rear sprockets (teeth)',
    `The sprockets on the back wheel, smallest first, separated by commas. ` +
      `${GEAR_SPROCKET_COUNT_MAX} at most, each between ${GEAR_SPROCKET_MIN} and ${GEAR_SPROCKET_MAX} teeth.`,
    model_format_cassette(state.cassette),
  );
  drivetrain.append(ringRow.row, cassettePresets.group, cassetteRow.row);

  // ── 휠 ──
  const wheelGroup = widget_build_group('The wheel');
  const beadSeatRow = widget_build_select_row(
    'gear-bead-seat',
    'Rim size (mm)',
    'The second number in a tyre marking such as 25-622: the diameter of the rim the tyre is built to fit.',
    GEAR_BEAD_SEAT_CHOICES.map((value) => ({
      value,
      label: BEAD_SEAT_NOTES[value] ? `${value} mm — ${BEAD_SEAT_NOTES[value]}` : `${value} mm`,
    })),
    state.beadSeatMm,
  );
  const widthSlider = control_build_slider(
    'gear-width',
    'Tyre width (mm)',
    'The first number in a marking such as 25-622. The model adds it twice to the rim size to get the outside diameter.',
    {
      min: GEAR_TYRE_WIDTH_MIN,
      max: GEAR_TYRE_WIDTH_MAX,
      step: GEAR_TYRE_WIDTH_STEP,
      value: state.tyreWidthMm,
    },
  );
  wheelGroup.append(beadSeatRow.row, widthSlider.row);

  // ── 페달 ──
  const pedalGroup = widget_build_group('The pedalling');
  const crankSlider = control_build_slider(
    'gear-crank',
    'Crank length (mm)',
    'How far the pedal sits from its axle. Only the gain ratio uses it — gear inches and speed do not.',
    { min: GEAR_CRANK_MIN, max: GEAR_CRANK_MAX, step: GEAR_CRANK_STEP, value: state.crankMm },
  );
  const cadenceSlider = control_build_slider(
    'gear-cadence',
    'Cadence (pedal turns per minute)',
    'How fast the pedals go round. The model treats it as an input and turns it straight into speed.',
    { min: GEAR_CADENCE_MIN, max: GEAR_CADENCE_MAX, step: GEAR_CADENCE_STEP, value: state.cadenceRpm },
  );
  pedalGroup.append(crankSlider.row, cadenceSlider.row);

  // ── 중복 규칙 ──
  const ruleGroup = widget_build_group('How close counts as the same gear');
  const toleranceSlider = control_build_slider(
    'gear-tolerance',
    'Duplicate tolerance (%)',
    'Two combinations count as the same gear when their ratios differ by less than this. Nothing in a standard fixes it — move it and watch the answer move.',
    {
      min: GEAR_TOLERANCE_MIN,
      max: GEAR_TOLERANCE_MAX,
      step: GEAR_TOLERANCE_STEP,
      value: state.tolerancePercent,
    },
  );
  ruleGroup.appendChild(toleranceSlider.row);

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(bikePresets.group, drivetrain, wheelGroup, pedalGroup, ruleGroup);

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
    total: control_build_readout('Combinations', 'front × rear'),
    distinct: control_build_readout('Distinct ratios', ''),
    removable: control_build_readout('Deletable repeats', ''),
    overlap: control_build_readout('Span covered twice', 'of the range'),
  };
  readouts.append(cards.total.box, cards.distinct.box, cards.removable.box, cards.overlap.box);

  const countingNote = document.createElement('p');
  countingNote.className = 'legend-note';

  // ── 사다리 ──
  const ladderCanvas = document.createElement('canvas');
  ladderCanvas.className = 'widget-chart';
  ladderCanvas.setAttribute('role', 'img');
  const ladderLegend = document.createElement('p');
  ladderLegend.className = 'widget-legend';
  const ladderNote = document.createElement('p');
  ladderNote.className = 'legend-note';

  // ── 속도 ──
  const speedCanvas = document.createElement('canvas');
  speedCanvas.className = 'widget-chart';
  speedCanvas.setAttribute('role', 'img');
  const speedLegend = document.createElement('p');
  speedLegend.className = 'widget-legend';
  const speedNote = document.createElement('p');
  speedNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table('Every combination the drivetrain can make', TABLE_HEADINGS);

  rootEl.append(
    heading, controls, verdict, readouts, countingNote,
    ladderCanvas, ladderLegend, ladderNote,
    speedCanvas, speedLegend, speedNote,
    table.scroll,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let lastResult = null;

  /** 조작부에서 상태를 읽는다. 깨진 칸이 있으면 사유를 함께 돌려준다. */
  function state_read_controls() {
    let message = '';
    const chainrings = [];
    for (const input of ringRow.inputs) {
      const text = String(input.value ?? '').trim();
      if (text === '') continue;
      if (!/^\d+$/.test(text)) {
        message = message || RING_TEXT_MESSAGE;
        continue;
      }
      chainrings.push(Number(text));
    }
    const cassette = model_read_cassette(cassetteRow.input.value);
    if (!cassette.ok) message = message || cassette.message;

    return {
      message,
      next: {
        chainrings,
        cassette: cassette.teeth,
        tyreWidthMm: model_clamp_tyre_width(Number(widthSlider.input.value)),
        beadSeatMm: model_clamp_bead_seat(Number(beadSeatRow.select.value)),
        crankMm: model_clamp_crank(Number(crankSlider.input.value)),
        cadenceRpm: model_clamp_cadence(Number(cadenceSlider.input.value)),
        tolerancePercent: model_clamp_tolerance(Number(toleranceSlider.input.value)),
      },
    };
  }

  /**
   * 조작부를 상태에 맞춘다. 프리셋이 값을 갈아끼웠을 때 손잡이가 따라가야 한다.
   *
   * `syncTyped`가 거짓이면 **글자 칸은 건드리지 않는다** — 타이핑 중에 값을
   * 다시 써 넣으면 캐럿이 끝으로 튀어 "11, 12"를 칠 수 없게 된다.
   * 프리셋을 누른 경우에만 참이다.
   */
  function display_show_controls(current, syncTyped) {
    if (syncTyped) {
      ringRow.inputs[0].value = String(current.chainrings[0] ?? '');
      ringRow.inputs[1].value = current.chainrings[1] === undefined ? '' : String(current.chainrings[1]);
      cassetteRow.input.value = model_format_cassette(current.cassette);
    }
    ringRow.output.textContent = current.chainrings.length > 1 ? 'two rings' : 'one ring';
    cassetteRow.output.textContent =
      `${num_format_count(current.cassette.length)} ${num_format_plural(current.cassette.length, 'sprocket')}`;
    beadSeatRow.select.value = String(current.beadSeatMm);
    beadSeatRow.output.textContent = `${current.beadSeatMm} mm`;

    widthSlider.input.value = String(current.tyreWidthMm);
    crankSlider.input.value = String(current.crankMm);
    cadenceSlider.input.value = String(current.cadenceRpm);
    toleranceSlider.input.value = String(current.tolerancePercent);

    widthSlider.output.textContent = `${current.tyreWidthMm} mm`;
    crankSlider.output.textContent = `${current.crankMm.toFixed(CRANK_DIGITS)} mm`;
    cadenceSlider.output.textContent = `${current.cadenceRpm} rpm`;
    toleranceSlider.output.textContent = display_format_tolerance(current.tolerancePercent);

    // 인덱스가 아니라 값이지만, 단위 없이 읽히면 "172.5"가 무엇인지 알 수 없다.
    widthSlider.input.setAttribute('aria-valuetext', `${current.tyreWidthMm} mm`);
    crankSlider.input.setAttribute('aria-valuetext', `${current.crankMm.toFixed(CRANK_DIGITS)} mm`);
    cadenceSlider.input.setAttribute('aria-valuetext', `${current.cadenceRpm} rpm`);
    toleranceSlider.input.setAttribute('aria-valuetext', display_format_tolerance(current.tolerancePercent));

    const bikeKey = model_pick_matching_bike_preset(current);
    for (const [key, button] of Object.entries(bikePresets.buttons)) {
      button.setAttribute('aria-pressed', String(key === bikeKey));
    }
    const cassetteKey = model_pick_matching_cassette_preset(current.cassette);
    for (const [key, button] of Object.entries(cassettePresets.buttons)) {
      button.setAttribute('aria-pressed', String(key === cassetteKey));
    }
  }

  /** 조합마다 가장 가까운 짝. 표의 마지막 칸이 이것을 읽는다. */
  function display_read_nearest_twins(result) {
    const nearest = new Map();
    for (const pair of result.pairs) {
      for (const [self, other] of [[pair.first, pair.second], [pair.second, pair.first]]) {
        const held = nearest.get(self);
        if (!held || pair.gap < held.gap) nearest.set(self, { index: other, gap: pair.gap });
      }
    }
    return nearest;
  }

  function display_show_table(result) {
    table.body.textContent = '';
    const nearest = display_read_nearest_twins(result);
    result.combinations.forEach((combination, index) => {
      const twin = nearest.get(index);
      table.body.appendChild(
        control_build_table_row([
          display_format_gear_name(combination),
          display_format_gear_inches(combination.gearInches),
          display_format_gain_ratio(combination.gainRatio),
          display_format_development(combination.developmentM),
          `${display_format_speed(combination.speedKmh)} km/h`,
          twin
            ? `${display_format_gear_name(result.combinations[twin.index])} (${(twin.gap * PERCENT_SCALE).toFixed(1)}%)`
            : VALUE_PLACEHOLDER,
        ]),
      );
    });
    const headCells = table.table.querySelectorAll('th');
    if (headCells[4]) headCells[4].textContent = `Speed at ${result.cadenceRpm} rpm`;
  }

  function display_show_legends(result) {
    ladderLegend.textContent = '';
    speedLegend.textContent = '';
    result.chainrings.forEach((teeth, ringIndex) => {
      const slot = ringIndex % LEGEND_SWATCH_SERIES.length;
      ladderLegend.appendChild(
        widget_build_legend_item(
          LEGEND_SWATCH_SERIES[slot],
          `${teeth}-tooth ring — ${ringIndex === 0 ? 'upper' : 'lower'} row`,
        ),
      );
      speedLegend.appendChild(
        widget_build_legend_item(
          LEGEND_SWATCH_SERIES_DASHED[slot],
          `${teeth}-tooth ring — ${ringIndex === 0 ? 'solid' : 'dashed'} lines`,
        ),
      );
    });
    ladderLegend.appendChild(
      widget_build_legend_item(
        LEGEND_SWATCH_LINK,
        `Dashed link between hollow markers — a pair within ${display_format_tolerance(result.tolerancePercent)}`,
      ),
    );
    speedLegend.appendChild(widget_build_legend_item(LEGEND_SWATCH_LINK, 'Dashed upright — the cadence slider'));
  }

  /** 깨진 입력. **조용히 NaN을 흘리지 않고 무엇이 잘못됐는지 화면에 적는다.** */
  function display_show_invalid(message) {
    lastResult = null;
    verdict.removeAttribute('data-state');
    verdictHeadline.textContent = INVALID_HEADLINE;
    verdictDetail.textContent = message;
    for (const card of Object.values(cards)) card.value.textContent = VALUE_PLACEHOLDER;
    cards.distinct.unit.textContent = '';
    cards.removable.unit.textContent = '';
    countingNote.textContent = 'The model is waiting for a setup it can read.';
    table.body.textContent = '';
    ladderLegend.textContent = '';
    speedLegend.textContent = '';
    ladderNote.textContent = '';
    speedNote.textContent = '';
    // 그림을 지운다. 낡은 그림 옆에 오류 문구가 있으면 어느 쪽이 지금인지 알 수 없다.
    // 빈 판을 정상 높이(210·300px)로 남기지 않는다 — 낮은 판에 이유를 직접 그린다.
    chart_render_ladder(ladderCanvas, null, message);
    chart_render_speed(speedCanvas, null, message);
    for (const canvas of [ladderCanvas, speedCanvas]) {
      canvas.setAttribute('aria-label', message);
    }
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. 계산 경로는 여기 하나뿐이다. */
  function widget_update(next = null) {
    const read = next ? { message: '', next } : state_read_controls();
    display_show_controls(read.next, Boolean(next));

    if (read.message) {
      display_show_invalid(read.message);
      return;
    }
    const check = model_check_parameters(read.next);
    if (!check.ok) {
      display_show_invalid(check.message);
      return;
    }

    const result = model_calculate_result(read.next);
    lastResult = result;

    const spoken = display_describe_verdict(result);
    verdict.dataset.state = result.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;

    cards.total.value.textContent = num_format_count(result.combinationCount);
    cards.distinct.value.textContent = num_format_count(result.distinctCount);
    cards.distinct.unit.textContent = `at ${display_format_tolerance(result.tolerancePercent)}`;
    cards.removable.value.textContent = num_format_count(result.removableCount);
    cards.removable.unit.textContent = `${display_format_share(result.removableShare)} of ${result.combinationCount}`;
    cards.overlap.value.textContent = display_format_share(result.overlapShare);

    countingNote.textContent = display_describe_counting(result);
    display_show_legends(result);
    display_show_table(result);

    url_write_state(result);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const ladder = chart_render_ladder(ladderCanvas, lastResult);
    const speed = chart_render_speed(speedCanvas, lastResult);

    const ladderText = chart_describe_ladder(lastResult, ladder);
    ladderNote.textContent = ladderText;
    ladderCanvas.setAttribute('aria-label', ladderText);

    const speedText = chart_describe_speed(lastResult, speed);
    speedNote.textContent = speedText;
    speedCanvas.setAttribute('aria-label', speedText);
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(() => widget_update(), RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  function widget_load_bike_preset(key) {
    const loaded = model_calculate_bike_preset_state(key, lastResult ?? state);
    if (loaded) widget_update(loaded);
  }

  function widget_load_cassette_preset(key) {
    const preset = GEAR_CASSETTE_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    const read = state_read_controls();
    // 앞 체인링 칸이 깨져 있어도 카세트 프리셋은 눌려야 한다 — 상태에서 가져온다.
    const chainrings = read.next.chainrings.length > 0 ? read.next.chainrings : state.chainrings;
    widget_update({ ...read.next, chainrings, cassette: preset.teeth.slice() });
  }

  // 붙인 리스너를 그대로 들고 있어야 뗄 수 있다.
  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  const onInput = () => widget_update_deferred();
  const onChange = () => widget_update();
  for (const input of [
    ...ringRow.inputs,
    cassetteRow.input,
    widthSlider.input,
    crankSlider.input,
    cadenceSlider.input,
    toleranceSlider.input,
  ]) {
    widget_bind(input, 'input', onInput);
    widget_bind(input, 'change', onChange);
  }
  widget_bind(beadSeatRow.select, 'change', onChange);
  for (const [key, button] of Object.entries(bikePresets.buttons)) {
    widget_bind(button, 'click', () => widget_load_bike_preset(key));
  }
  for (const [key, button] of Object.entries(cassettePresets.buttons)) {
    widget_bind(button, 'click', () => widget_load_cassette_preset(key));
  }
  widget_bind(window, 'resize', widget_redraw_deferred);

  widget_update(state);

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
