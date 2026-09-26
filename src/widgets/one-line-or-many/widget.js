/**
 * 줄 하나 vs 줄 여럿 — 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 model.js(닫힌 형태)가, 히어로 애니메이션의 상태는 sim.js가 한다.
 * 이 파일은 그리기와 입력만 담당한다. 상태는 URL 쿼리스트링에 싣는다.
 *
 * **애니메이션은 어떤 숫자도 만들지 않는다.** 카드·곡선·표는 전부 model.js에서
 * 나온다. 애니메이션이 하는 일은 같은 도착열을 두 배치에 흘려보내는 것뿐이다.
 */
import {
  QUEUE_COUNTER_MIN,
  QUEUE_COUNTER_MAX,
  QUEUE_COUNTER_STEP,
  QUEUE_COUNTER_DEFAULT,
  QUEUE_LOAD_MIN,
  QUEUE_LOAD_MAX,
  QUEUE_LOAD_STEP,
  QUEUE_LOAD_DEFAULT,
  QUEUE_SERVICE_MIN_MINUTES,
  QUEUE_SERVICE_MAX_MINUTES,
  QUEUE_SERVICE_STEP_MINUTES,
  QUEUE_SERVICE_DEFAULT_MINUTES,
  QUEUE_CV_MIN,
  QUEUE_CV_MAX,
  QUEUE_CV_STEP,
  QUEUE_CV_DEFAULT,
  QUEUE_CV_EXACT,
  QUEUE_PERCENTILE,
  model_clamp_counter_count,
  model_clamp_load,
  model_clamp_service_minutes,
  model_clamp_variation,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_sweep,
  model_calculate_counter_table,
} from './model.js';
import {
  sim_create_state,
  sim_advance_state,
  sim_read_frame,
  sim_calculate_step_minutes,
  SIM_QUEUE_DRAW_MAX,
} from './sim.js';

import { num_format_count, num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear, ticks_build_decade, ticks_drop_crowded } from '../_shared/ticks.js';
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
const ROOT_SELECTOR = '[data-widget="one-line-or-many"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_COUNTERS = 'c';
const URL_KEY_LOAD = 'rho';
const URL_KEY_SERVICE = 'es';
const URL_KEY_VARIATION = 'cv';
const URL_KEY_SEED = 'seed';
/** 애니메이션 시드. 같은 링크가 같은 도착열을 재생해야 한다. */
export const QUEUE_SEED_DEFAULT = 20260906;

// ── 표시 형식 ──────────────────────────────────────────────
const MINUTE_DIGITS = 1;
/** 1분 아래는 자릿수를 늘린다 — 0.3분과 0.4분이 둘 다 "0분"이면 카드가 죽는다. */
const MINUTE_SMALL_THRESHOLD = 1;
const MINUTE_SMALL_DIGITS = 2;
/**
 * 소수 MINUTE_SMALL_DIGITS 자리에서 반올림하면 사라지는 값의 경계(그 절반).
 * 이 밑으로는 고정 자릿수로 찍으면 0이 아닌 값이 "0.00"으로 나간다 —
 * c가 크고 ρ가 낮을 때(예: c=8, ρ=0.1) 단일 대기열의 평균 대기가 실제로 이 구간에 든다.
 */
const MINUTE_ROUND_TO_ZERO_MINUTES = 0.5 * Math.pow(10, -MINUTE_SMALL_DIGITS);
/** 그 경계 밑에서 쓰는 유효숫자. display_format_axis_minutes와 같은 발상이다. */
const MINUTE_SMALL_SIGNIFICANT = 2;
/** 자릿수 상한. 없으면 극단적으로 작은 값에서 소수점 뒤가 한없이 늘어난다. */
const MINUTE_SMALL_DECIMALS_MAX = 6;
const PERCENT_SCALE = 100;
const RATIO_DIGITS = 1;
/**
 * 비율의 분모(단일 대기열의 평균 대기)가 이 밑이면 비율을 찍지 않는다.
 * 표기를 고쳐도(위 유효숫자 확장) 분모 자체가 초 단위 이하로 작으면 —
 * c가 크고 ρ가 낮은 구석(예: c=8, ρ=0.1)에서 실제로 일어난다 — 비율은
 * 부동소수 반올림 하나에도 크게 출렁이는 불안정한 숫자가 된다.
 * 그 자리에서는 비율이 아니라 두 절댓값과 "비율이 의미가 없다"는 문장으로 대신한다.
 * 경계는 카드의 반올림 경계(위 상수)와 같은 자리로 둔다 — 그보다 작은 분모는
 * 어차피 카드 정밀도로도 신뢰할 만큼 재지 못한다.
 */
const RATIO_MIN_DENOMINATOR_MINUTES = MINUTE_ROUND_TO_ZERO_MINUTES;
/** 이 값 이상은 정수로 찍는다. 212.4분에 소수점을 붙일 이유가 없다. */
const AXIS_LABEL_WHOLE_MIN = 10;
/** 축 눈금 라벨의 유효숫자. */
const AXIS_LABEL_SIGNIFICANT = 2;
/** 소수 자릿수 상한. 이보다 작은 값은 소수 대신 10의 거듭제곱 표기(6.4×10⁻⁸)로 적는다. */
const AXIS_LABEL_DECIMALS_MAX = 5;
/** 거듭제곱 표기의 지수에 쓰는 위첨자 글자. */
const AXIS_SUPERSCRIPT_DIGITS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** 가수의 밑. 가수가 반올림으로 이 값에 닿으면 지수를 하나 올린다. */
const AXIS_MANTISSA_BASE = 10;
const RECOMPUTE_DELAY_MS = 110;

// ── 애니메이션 치수 ────────────────────────────────────────
const HERO_HEIGHT_PX = 244;
const HERO_STRIP_GAP_PX = 18;
const HERO_PAD_X = 8;
const HERO_PAD_Y = 6;
/** 줄 사이 간격. 창구 상자가 서로 붙으면 몇 줄인지 세어지지 않는다. */
const HERO_LANE_GAP_PX = 4;
const HERO_LABEL_HEIGHT_PX = 16;
const HERO_COUNTER_WIDTH_PX = 30;
const HERO_COUNTER_GAP_PX = 6;
/** 좁은 화면에서 줄여도 이보다 좁게는 그리지 않는다(상자로 읽혀야 한다). */
const HERO_COUNTER_MIN_WIDTH_PX = 12;
/** 카드 눈금 색 클래스(global.css). */
const READOUT_CLASS_SINGLE = 'readout-single';
const READOUT_CLASS_SEPARATE = 'readout-separate';
/** 그림 위 표지. 움직임을 끈 화면은 정지 그림이라고 적는다. */
const HERO_TAG_LIVE = 'Animation · a sample shop, not the calculation';
const HERO_TAG_STILL = 'Still picture · a sample shop, not the calculation';
/** 좁은 화면에서도 위 띠에 남기는 대기 점 자리 수. */
const HERO_QUEUE_RESERVE_DOTS = 3;
const HERO_DOT_RADIUS_PX = 6;
const HERO_DOT_GAP_PX = 4;
const HERO_COUNTER_BORDER_PX = 2;
/** 줄이 비었을 때도 '줄이 거기 있다'는 것을 보이게 하는 바닥선. */
const HERO_LANE_LINE_PX = 1;
/** 첫 화면이 빈 가게가 아니도록 미리 돌려 두는 시간(분). */
const HERO_WARMUP_MINUTES = 160;
const HERO_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 330;
const CHART_PAD_TOP = 16;
const CHART_PAD_RIGHT = 16;
const CHART_PAD_BOTTOM = 54;
const CHART_PAD_LEFT = 80;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_LABEL_MIN_GAP_PX = 8;
const CHART_CURVE_WIDTH = 2;
const CHART_CURVE_WIDTH_ALT = 3;
const CHART_PERCENTILE_DASH = [5, 4];
const CHART_GRID_WIDTH = 1;
const CHART_CURSOR_DASH = [2, 3];
/** 로그 축 위아래 여유(데케이드 비율). 곡선이 축선에 붙지 않게 한다. */
const CHART_LOG_PAD_DECADES = 0.08;
/** 축 스팬이 0이 될 때 최소 표시 폭(데케이드). 없으면 좌표가 NaN이 된다. */
const CHART_LOG_MIN_SPAN = 0.5;

// ── 색 토큰 ────────────────────────────────────────────────
const COLOR_VAR_SINGLE = '--series-1';
const COLOR_VAR_SEPARATE = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_VAR_SUNK = '--paper-sunk';
const COLOR_VAR_SURFACE = '--surface';
const COLOR_FALLBACK_SINGLE = '#1f4e79';
const COLOR_FALLBACK_SEPARATE = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_SUNK = '#f0f0ea';
const COLOR_FALLBACK_SURFACE = '#ffffff';

// ── 문구 ───────────────────────────────────────────────────
const CHART_TITLE_X = 'How busy the counters are (ρ)';
const CHART_TITLE_Y = 'Wait, minutes (log scale)';
const LAYOUT_NAME_SINGLE = 'One line';
const LAYOUT_NAME_SEPARATE = 'A line per counter';
/** 범례용 짧은 이름. 360px에서 긴 이름은 한 칸이 화면 폭을 넘는다. */
const LAYOUT_SHORT_SEPARATE = 'Per counter';
const LAYOUT_SHORT_SINGLE = 'One line';
const LEGEND_KEY_TEXT =
  'Solid = mean wait, dashed = 95th percentile. Blue is one line into every counter, orange is a line per counter.';
const VERDICT_HEADLINE = {
  hold: 'The layout barely matters here.',
  edge: 'The layout starts to matter.',
  break: 'The layout dominates.',
};
/** 범례 네 칸. 색 견본은 CSS가, 뜻은 여기의 글이 맡는다. */
const CHART_LEGEND_KEYS = [
  { swatch: 'legend-mean-1', label: `${LAYOUT_SHORT_SINGLE} — mean` },
  { swatch: 'legend-tail-1', label: `${LAYOUT_SHORT_SINGLE} — 95th` },
  { swatch: 'legend-mean-2', label: `${LAYOUT_SHORT_SEPARATE} — mean` },
  { swatch: 'legend-tail-2', label: `${LAYOUT_SHORT_SEPARATE} — 95th` },
];

const TABLE_HEADINGS = ['Counters', 'One line, mean', 'Per counter, mean', 'One line, 95th', 'Per counter, 95th', 'Mean cut by'];

// ── 프리셋 ─────────────────────────────────────────────────
// 세 가지 서로 다른 체제. meanRatio = c·ρ / C(c, cρ)이고 서비스시간·변동계수는
// 지워지므로(model.js 주석 참고) c·ρ만으로 어느 체제인지 정해진다.
// 실측(model_calculate_result, 소스는 위 계산 경로 하나뿐이다):
//   c=2·ρ=0.5 → 3.0배(edge) / c=3·ρ=0.2 → 24.3배(break) /
//   c=8·ρ=0.1 → 385,096배지만 분모(단일 대기열 평균)가 0.001분 아래 —
//   비율 자체가 의미를 잃는 경계(display_check_ratio_meaningless가 true를 낸다)
const PRESET_GROUP_LABEL = 'Jump to a setting';
const QUEUE_PRESETS = [
  // 두 창구, 중간 이용률 — 배치가 "막 영향을 주기 시작하는" 자리.
  { key: 'two-moderate', label: 'Two counters, half busy', counterCount: 2, load: 0.5 },
  // 세 창구인데 한산하다 — 이용률이 낮을수록 풀링 이득이 커져 배치가 지배한다.
  { key: 'three-quiet', label: 'Three counters, quiet', counterCount: 3, load: 0.2 },
  // 여덟 창구가 거의 논다 — 단일 대기열의 평균 대기가 사실상 0이라 비율이
  // 의미를 잃는 경계 그 자체(결함 6에서 고친 자리).
  { key: 'eight-idle', label: 'Eight counters, mostly idle', counterCount: 8, load: 0.1 },
];

// ── 표시 함수 ──────────────────────────────────────────────

/**
 * 분 단위 표기. 자릿수를 값의 크기가 아니라 **읽어야 하는 정밀도**로 정한다.
 * 1분 아래에서 한 자리만 쓰면 0.34분과 0.44분이 둘 다 "0.3분/0.4분"으로 뭉개진다.
 *
 * **0이 아닌 값을 "0.00"으로 찍지 않는다.** 고정 두 자리는 0.005분 밑에서
 * 반올림에 삼켜진다 — c가 크고 ρ가 낮으면(c=8, ρ=0.1) 단일 대기열의 평균이
 * 실제로 그 밑으로 떨어진다. 그 구간에서는 `display_format_axis_minutes`와
 * 같은 유효숫자 방식으로 자릿수를 늘린다(무한히 늘지 않게 상한을 둔다).
 */
/**
 * 소수 `digits`자리로 **0.5는 올림** 반올림한다.
 *
 * `toFixed`를 부동소수에 그대로 걸면 정확히 …5인 값이 한 칸 내림된다. 이 위젯에서
 * 실제로 났다(2026-09-24 shown.test.js): c=2·ρ=0.80의 배수는 정확히 2.25인데 `2.2×`로
 * 찍혀 식에서 지워진 두 슬라이더(처리시간·변동계수)가 배수를 움직이는 것처럼 보였고,
 * c=1에서 같은 양인 두 배치의 카드가 3.7과 3.8로 갈렸다.
 *
 * 참값이 반올림 경계에서 떨어진 거리는 이 모델의 분모에서 ROUND_EPS보다 훨씬 크므로,
 * 이 보정은 경계에 **정확히** 놓인 값만 올리고 나머지는 건드리지 않는다.
 */
const ROUND_EPS = 1e-9;
function display_round_half_up(value, digits) {
  const scale = 10 ** digits;
  return Math.floor(value * scale + 0.5 + ROUND_EPS) / scale;
}

export function display_format_minutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes > 0 && minutes < MINUTE_ROUND_TO_ZERO_MINUTES) {
    const decimals = Math.min(
      MINUTE_SMALL_DECIMALS_MAX,
      Math.max(MINUTE_SMALL_DIGITS, MINUTE_SMALL_SIGNIFICANT - 1 - Math.floor(Math.log10(minutes))),
    );
    return display_round_half_up(minutes, decimals).toFixed(decimals);
  }
  const digits = minutes < MINUTE_SMALL_THRESHOLD ? MINUTE_SMALL_DIGITS : MINUTE_DIGITS;
  return display_round_half_up(minutes, digits).toFixed(digits);
}

/**
 * 로그 축 눈금 라벨. **고정 소수 자릿수를 쓰지 않는다.**
 * 로그 축의 아래 끝은 0.004처럼 작을 수 있는데, 소수 두 자리로 찍으면 "0.00"이 된다 —
 * 축의 바닥이 0이라고 적힌 그림은 로그 축에서 있을 수 없는 값이다.
 * 유효숫자로 정하고, 지수 표기로 새지 않게 자릿수를 되돌린다.
 */
export function display_format_axis_minutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes >= AXIS_LABEL_WHOLE_MIN) return String(Math.round(minutes));
  const decimals = Math.max(0, AXIS_LABEL_SIGNIFICANT - 1 - Math.floor(Math.log10(minutes)));
  if (decimals <= AXIS_LABEL_DECIMALS_MAX) return minutes.toFixed(decimals);
  // 소수 다섯째 자리(AXIS_LABEL_DECIMALS_MAX)로 유효숫자 둘을 못 담는 값. 예전에는 넷째 자리 상한에서 잘라 "0.0000"(로그 축에
  // 0)이나 "0.0001"(9.2×10⁻⁵를 한 자리로)이 찍혔고, 다음 판은 "<0.0001"로 적었다가 한 축의
  // 10⁻⁵·10⁻⁶ 눈금과 바닥이 같은 글자가 됐다(2026-09-26 검사). 값을 그대로 거듭제곱으로 적는다.
  return display_format_power_of_ten(minutes);
}

/** 유효숫자 둘의 10의 거듭제곱 표기. 가수가 1이면 가수를 뺀다(10⁻⁵). */
export function display_format_power_of_ten(value) {
  let exponent = Math.floor(Math.log10(value));
  let mantissa = display_round_half_up(value / 10 ** exponent, AXIS_LABEL_SIGNIFICANT - 1);
  if (mantissa >= AXIS_MANTISSA_BASE) {
    mantissa /= AXIS_MANTISSA_BASE;
    exponent += 1;
  }
  const power = `10${String(exponent).split('').map((c) => AXIS_SUPERSCRIPT_DIGITS[c]).join('')}`;
  return mantissa === 1 ? power : `${mantissa.toFixed(AXIS_LABEL_SIGNIFICANT - 1)}×${power}`;
}

export function display_format_ratio(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  return `${display_round_half_up(ratio, RATIO_DIGITS).toFixed(RATIO_DIGITS)}×`;
}

/**
 * 표의 "Mean cut by" 칸. 분모(단일 대기열의 평균)가 신뢰할 만큼 크지 않으면
 * 배수 대신 대시를 찍는다 — 옆 두 칸(절댓값)이 이미 두 값을 보여준다.
 */
export function display_format_ratio_cell(row) {
  if (display_check_ratio_meaningless(row.single.meanMinutes)) return '—';
  return display_format_ratio(row.meanRatio);
}

export function display_format_percent(fraction) {
  return `${Math.round(fraction * PERCENT_SCALE)}%`;
}

export const display_format_count = num_format_count;

/**
 * 판정 문장. 첫 줄에 결론과 근거가 되는 숫자 하나, 나머지는 뒤 문장으로.
 * **주어는 언제나 모델이다.**
 */
/**
 * 비율의 분모(단일 대기열의 평균 대기)가 믿을 만큼 크지 않은가.
 * 그 자리에서는 비율 대신 두 절댓값과 "비율이 의미 없다"는 문장을 쓴다.
 */
export function display_check_ratio_meaningless(meanMinutes) {
  return meanMinutes < RATIO_MIN_DENOMINATOR_MINUTES;
}

export function display_describe_verdict(result) {
  const verdict = model_calculate_verdict(result.meanRatio);
  const ratioMeaningless = display_check_ratio_meaningless(result.single.meanMinutes);

  let headline;
  if (result.counterCount === 1) {
    headline = 'With one counter the two layouts are the same layout.';
  } else if (ratioMeaningless) {
    // 분모가 실질적으로 0이라 배수를 찍으면 반올림 하나에 값이 출렁인다.
    // 절댓값 둘과, 비율이 의미가 없다는 문장으로 대신한다.
    headline =
      `${VERDICT_HEADLINE[verdict]} The model puts the single line's mean wait at ` +
      `${display_format_minutes(result.single.meanMinutes)} minutes against ` +
      `${display_format_minutes(result.separate.meanMinutes)} for separate lines — the single line's ` +
      `wait sits too close to zero for a ratio between the two to mean anything here.`;
  } else {
    headline =
      `${VERDICT_HEADLINE[verdict]} The model puts the single line ${display_format_ratio(result.meanRatio)} below the separate lines on the mean wait.`;
  }

  const tail =
    result.single.percentileMinutes > 0
      ? `the ${display_format_percent(QUEUE_PERCENTILE)} wait from ` +
        `${display_format_minutes(result.separate.percentileMinutes)} to ` +
        `${display_format_minutes(result.single.percentileMinutes)} minutes`
      : `the ${display_format_percent(QUEUE_PERCENTILE)} wait from ` +
        `${display_format_minutes(result.separate.percentileMinutes)} minutes to none at all — ` +
        `fewer than one arrival in twenty waits at the single line`;

  const detail =
    `With ${display_format_count(result.counterCount)} ` +
    `${num_format_plural(result.counterCount, 'counter')} busy ` +
    `${display_format_percent(result.load)} of the time, the model puts the mean wait at ` +
    `${display_format_minutes(result.separate.meanMinutes)} minutes for separate lines and ` +
    `${display_format_minutes(result.single.meanMinutes)} for one line, and ${tail}. ` +
    `Both layouts serve the same customers per hour and leave each counter idle the same ` +
    `${display_format_percent(1 - result.load)} of the time.`;

  return { verdict, headline, detail };
}

/**
 * 변동계수가 1이 아니면 카드가 근사임을 말한다. 정확한 자리와 섞어 두지 않는다.
 *
 * 무엇이 근사인지 **배치와 창구 수로 나눠** 말한다(2026-09-26 사실검사).
 *   · 창구마다 줄: 손님이 줄을 무작위·같은 확률로 고르므로 줄마다 M/G/1이고, 평균 대기는
 *     Pollaczek–Khinchine으로 창구 수와 상관없이 정확하다(model.js의 separate 식에 c가 없다).
 *   · 한 줄: 창구 하나면 같은 P–K라 정확, 둘 이상이면 M/M/c에 배수를 곱한 두 모멘트 근사.
 *   · 95퍼센타일: 어느 배치든 평균에 맞춘 지수 꼬리 — CV≠1이면 맞춤값이다.
 * CV 1.00은 **모든** 수를 정확하게 남긴다. 본문 Four rules 절이 같은 구분을 적는다.
 */
export function display_describe_exactness(result) {
  if (result.exact) {
    return `Exponential service times, so both layouts are the model's closed forms with nothing approximated.`;
  }
  const spread = result.variation > QUEUE_CV_EXACT ? 'more' : 'less';
  // 표는 창구 수 슬라이더와 상관없이 1~8 창구를 다 보인다 — 문장도 창구 수로 가르지 않고
  // 표 전체에 대해 말한다(2026-09-26 5차 검사).
  return (
    `Service times vary ${spread} than the exponential case (CV ${result.variation.toFixed(2)}), so the one-line mean ` +
    `is exact at one counter and a two-moment approximation at two or more, a line per counter keeps an exact mean ` +
    `at every counter count, and each ${display_format_percent(QUEUE_PERCENTILE)} figure comes from an exponential ` +
    `tail shape fitted to its layout's mean. Only CV ${QUEUE_CV_EXACT.toFixed(2)} leaves every figure exact.`
  );
}

// ── URL 상태 ────────────────────────────────────────────────

export function url_read_state(search) {
  const state = urlstate_read_numbers(search, {
    [URL_KEY_COUNTERS]: { fallback: QUEUE_COUNTER_DEFAULT, clamp: model_clamp_counter_count },
    [URL_KEY_LOAD]: { fallback: QUEUE_LOAD_DEFAULT, clamp: model_clamp_load },
    [URL_KEY_SERVICE]: { fallback: QUEUE_SERVICE_DEFAULT_MINUTES, clamp: model_clamp_service_minutes },
    [URL_KEY_VARIATION]: { fallback: QUEUE_CV_DEFAULT, clamp: model_clamp_variation },
    [URL_KEY_SEED]: { fallback: QUEUE_SEED_DEFAULT, clamp: (value) => Math.round(value) },
  });
  return {
    counterCount: state[URL_KEY_COUNTERS],
    load: state[URL_KEY_LOAD],
    serviceMinutes: state[URL_KEY_SERVICE],
    variation: state[URL_KEY_VARIATION],
    seed: state[URL_KEY_SEED],
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_COUNTERS]: state.counterCount,
    [URL_KEY_LOAD]: state.load,
    [URL_KEY_SERVICE]: state.serviceMinutes,
    [URL_KEY_VARIATION]: state.variation,
    [URL_KEY_SEED]: state.seed,
  });
}

// ── 그래프 ──────────────────────────────────────────────────

const chart_read_color = canvas_read_css_color;

/**
 * 로그 세로축의 범위를 데이터에서 정한다.
 *
 * 0분(퍼센타일이 잘린 구간)은 로그를 취할 수 없으므로 **범위 계산에서 뺀다** —
 * 넣으면 `log(0) = −Infinity`가 되어 축이 통째로 무너진다.
 * 양수 값이 하나도 없거나 스팬이 0이면 최소 표시 폭을 준다.
 */
export function chart_calculate_scale(points) {
  let low = Number.POSITIVE_INFINITY;
  let high = 0;
  for (const point of points) {
    for (const value of [point.singleMean, point.separateMean, point.singlePercentile, point.separatePercentile]) {
      if (!(value > 0) || !Number.isFinite(value)) continue;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }
  if (!(high > 0)) return { low: 1, high: 10 };
  if (!Number.isFinite(low) || low <= 0) low = high / 10;

  let logLow = Math.log10(low) - CHART_LOG_PAD_DECADES;
  let logHigh = Math.log10(high) + CHART_LOG_PAD_DECADES;
  if (logHigh - logLow < CHART_LOG_MIN_SPAN) {
    const middle = (logHigh + logLow) / 2;
    logLow = middle - CHART_LOG_MIN_SPAN / 2;
    logHigh = middle + CHART_LOG_MIN_SPAN / 2;
  }
  return { low: Math.pow(10, logLow), high: Math.pow(10, logHigh) };
}

/**
 * 한 계열이 축 안에서 그려지기 시작하는 지점.
 * 퍼센타일은 왼쪽 구간에서 0분이라 그릴 수 없다 — **없는 선을 0에 눌러 붙이지 않고**
 * 시작점을 캡션이 말한다.
 */
export function chart_calculate_series_start(points, key) {
  for (let index = 0; index < points.length; index += 1) {
    if (points[index][key] > 0) return index;
  }
  return -1;
}

function chart_calculate_x(load, plotWidth) {
  return ((load - QUEUE_LOAD_MIN) / (QUEUE_LOAD_MAX - QUEUE_LOAD_MIN)) * plotWidth;
}

function chart_calculate_y(minutes, plotHeight, scale) {
  const logLow = Math.log10(scale.low);
  const logHigh = Math.log10(scale.high);
  const ratio = (Math.log10(minutes) - logLow) / (logHigh - logLow);
  return plotHeight - ratio * plotHeight;
}

/** 한 계열을 그린다. 0분 구간은 건너뛴다. */
function chart_draw_series(context, points, key, plotWidth, plotHeight, scale, style) {
  context.save();
  context.strokeStyle = style.color;
  context.lineWidth = style.width;
  context.setLineDash(style.dash ?? []);
  context.beginPath();
  let started = false;
  for (const point of points) {
    const value = point[key];
    if (!(value > 0)) {
      started = false;
      continue;
    }
    const x = chart_calculate_x(point.load, plotWidth);
    const y = chart_calculate_y(value, plotHeight, scale);
    if (started) context.lineTo(x, y);
    else context.moveTo(x, y);
    started = true;
  }
  context.stroke();
  context.restore();
}

/**
 * ρ 스윕 곡선을 그린다. **자기가 쓴 축을 반환한다** —
 * 캡션이 축을 다시 계산하면 그림과 갈라져 틀린 축 범위가 그림 밑에 적힌다.
 */
export function chart_render_sweep(canvasEl, points, currentLoad) {
  const setup = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!setup || points.length === 0) return null;
  const { context, width, height } = setup;

  const plotWidth = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT);
  const plotHeight = Math.max(1, height - CHART_PAD_TOP - CHART_PAD_BOTTOM);
  const scale = chart_calculate_scale(points);

  const colorSingle = chart_read_color(canvasEl, COLOR_VAR_SINGLE, COLOR_FALLBACK_SINGLE);
  const colorSeparate = chart_read_color(canvasEl, COLOR_VAR_SEPARATE, COLOR_FALLBACK_SEPARATE);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  context.save();
  context.translate(CHART_PAD_LEFT, CHART_PAD_TOP);
  context.font = CHART_LABEL_FONT;

  // ── 세로축 눈금 (로그) ──
  const yTicks = ticks_build_decade(scale.low, scale.high);
  const yItems = yTicks.map((value) => ({
    value,
    position: chart_calculate_y(value, plotHeight, scale),
    width: CHART_LABEL_MIN_GAP_PX,
  }));
  const yKept = ticks_drop_crowded(yItems, CHART_LABEL_MIN_GAP_PX);
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

  // ── 가로축 눈금 (선형 ρ) ──
  const xStep = ticks_calculate_step(QUEUE_LOAD_MAX - QUEUE_LOAD_MIN);
  const xTicks = ticks_build_linear(QUEUE_LOAD_MIN, QUEUE_LOAD_MAX, xStep);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const value of xTicks) {
    const x = chart_calculate_x(value, plotWidth);
    context.fillText(display_format_percent(value), x, plotHeight + CHART_LABEL_GAP);
  }

  // ── 현재 ρ 커서 ──
  const cursorX = chart_calculate_x(currentLoad, plotWidth);
  context.save();
  context.strokeStyle = colorAxis;
  context.setLineDash(CHART_CURSOR_DASH);
  context.beginPath();
  context.moveTo(cursorX, 0);
  context.lineTo(cursorX, plotHeight);
  context.stroke();
  context.restore();

  // ── 곡선 네 개 ──
  // 창구별 대기열을 굵게 그린다 — 색만이 아니라 굵기로도 갈리게.
  chart_draw_series(context, points, 'separateMean', plotWidth, plotHeight, scale, {
    color: colorSeparate, width: CHART_CURVE_WIDTH_ALT,
  });
  chart_draw_series(context, points, 'separatePercentile', plotWidth, plotHeight, scale, {
    color: colorSeparate, width: CHART_CURVE_WIDTH_ALT, dash: CHART_PERCENTILE_DASH,
  });
  chart_draw_series(context, points, 'singleMean', plotWidth, plotHeight, scale, {
    color: colorSingle, width: CHART_CURVE_WIDTH,
  });
  chart_draw_series(context, points, 'singlePercentile', plotWidth, plotHeight, scale, {
    color: colorSingle, width: CHART_CURVE_WIDTH, dash: CHART_PERCENTILE_DASH,
  });

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
  context.fillText(CHART_TITLE_X, plotWidth / 2, plotHeight + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP);
  context.save();
  context.translate(-CHART_PAD_LEFT + CHART_AXIS_TITLE_GAP / 2, plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = 'top';
  context.fillText(CHART_TITLE_Y, 0, 0);
  context.restore();

  context.restore();

  return {
    scale,
    singlePercentileStart: chart_calculate_series_start(points, 'singlePercentile'),
    points,
  };
}

// ── 히어로 애니메이션 ───────────────────────────────────────

/**
 * 두 배치를 위아래 띠로 그린다. 오른쪽이 창구, 왼쪽으로 대기열이 늘어난다.
 * **시뮬레이션은 여기서 돌지 않는다** — 프레임 요약만 받아 그린다.
 */
/**
 * 위 띠에서 창구 한 칸(상자+틈)의 폭. 보통은 고정 폭이지만, 좁은 캔버스에 창구가 많으면
 * 줄여서 모두 들어가게 한다 — 예전에는 320px·창구 8개에서 위 띠 창구 둘이 캔버스 왼쪽 밖으로
 * 나가 "같은 8개 창구"라는 캡션과 그림이 어긋났다.
 */
export function hero_calculate_counter_pitch(width, counterCount) {
  const fullPitch = HERO_COUNTER_WIDTH_PX + HERO_COUNTER_GAP_PX;
  // 위 띠 왼쪽에 대기 점 몇 개 자리는 남긴다 — 창구가 폭을 다 먹으면 한 줄 쪽 줄이 아예 안 보인다.
  const queueReserve = HERO_QUEUE_RESERVE_DOTS * (HERO_DOT_RADIUS_PX * 2 + HERO_DOT_GAP_PX) + HERO_COUNTER_GAP_PX;
  const room = (width - HERO_PAD_X * 2 - queueReserve) / Math.max(1, counterCount);
  return Math.max(HERO_COUNTER_GAP_PX + HERO_COUNTER_MIN_WIDTH_PX, Math.min(fullPitch, room));
}

export function hero_render_frame(canvasEl, frame, counterCount) {
  const setup = canvas_setup_context(canvasEl, HERO_HEIGHT_PX);
  if (!setup) return null;
  const { context, width, height } = setup;

  const colorSingle = chart_read_color(canvasEl, COLOR_VAR_SINGLE, COLOR_FALLBACK_SINGLE);
  const colorSeparate = chart_read_color(canvasEl, COLOR_VAR_SEPARATE, COLOR_FALLBACK_SEPARATE);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorSurface = chart_read_color(canvasEl, COLOR_VAR_SURFACE, COLOR_FALLBACK_SURFACE);

  const stripHeight = (height - HERO_STRIP_GAP_PX - HERO_PAD_Y * 2) / 2;
  context.font = HERO_LABEL_FONT;

  /**
   * 창구 하나를 그린다. 손님을 받고 있으면 채우고, 비어 있으면 **같은 색 테두리의 흰 상자**로.
   * 예전에는 빈 창구를 배경색에 옅은 선으로 칠해 거의 안 보였다 — 창구 수는 그대로인데
   * 상자가 "생겼다 없어졌다" 하는 것처럼 보였다(2026-09-26 운영자 지적).
   */
  function hero_draw_counter(x, y, boxHeight, busy, color, boxWidth = HERO_COUNTER_WIDTH_PX) {
    const inset = HERO_COUNTER_BORDER_PX / 2;
    context.fillStyle = busy ? color : colorSurface;
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeStyle = color;
    context.lineWidth = HERO_COUNTER_BORDER_PX;
    context.beginPath();
    context.rect(x + inset, y + inset, boxWidth - HERO_COUNTER_BORDER_PX, boxHeight - HERO_COUNTER_BORDER_PX);
    context.stroke();
  }

  /** 줄이 놓이는 자리에 바닥선을 긋는다. 비어 있어도 줄로 읽히게. */
  function hero_draw_lane(rightX, centreY, limitX) {
    context.strokeStyle = colorGrid;
    context.lineWidth = HERO_LANE_LINE_PX;
    context.beginPath();
    context.moveTo(limitX, centreY + HERO_DOT_RADIUS_PX + 3);
    context.lineTo(rightX + HERO_DOT_RADIUS_PX, centreY + HERO_DOT_RADIUS_PX + 3);
    context.stroke();
  }

  /** 대기 인원을 창구 왼쪽으로 늘어놓는다. 폭을 넘으면 거기서 멈춘다. */
  function hero_draw_queue(rightX, centreY, count, color, limitX) {
    hero_draw_lane(rightX, centreY, limitX);
    context.fillStyle = color;
    const step = HERO_DOT_RADIUS_PX * 2 + HERO_DOT_GAP_PX;
    for (let index = 0; index < count; index += 1) {
      const x = rightX - index * step;
      if (x < limitX) break;
      context.beginPath();
      context.arc(x, centreY, HERO_DOT_RADIUS_PX, 0, Math.PI * 2);
      context.fill();
    }
  }

  // ── 위 띠: 단일 대기열 ──
  const topY = HERO_PAD_Y;
  context.fillStyle = colorText;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillText(`${LAYOUT_NAME_SINGLE} — ${frame.single.waitingCount} waiting`, HERO_PAD_X, topY);

  const bandTop = topY + HERO_LABEL_HEIGHT_PX;
  const bandHeight = stripHeight - HERO_LABEL_HEIGHT_PX;
  const counterPitch = hero_calculate_counter_pitch(width, counterCount);
  const counterBlockWidth = counterCount * counterPitch;
  // 마지막 칸의 틈은 오른쪽 여백에 들어가지 않는다 — 빼 두면 위 띠가 아래 띠보다 6px 왼쪽에
  // 서서, 창구 하나일 때 같은 줄인데도 점이 하나 덜 그려졌다.
  const countersLeft = width - HERO_PAD_X - counterBlockWidth + HERO_COUNTER_GAP_PX;
  for (let index = 0; index < counterCount; index += 1) {
    hero_draw_counter(
      countersLeft + index * counterPitch,
      bandTop,
      bandHeight,
      frame.single.busy[index],
      colorSingle,
      counterPitch - HERO_COUNTER_GAP_PX,
    );
  }
  hero_draw_queue(
    countersLeft - HERO_COUNTER_GAP_PX - HERO_DOT_RADIUS_PX,
    bandTop + bandHeight / 2,
    frame.single.drawCount,
    colorSingle,
    HERO_PAD_X,
  );

  // ── 아래 띠: 창구별 대기열 ──
  const lowerTop = HERO_PAD_Y + stripHeight + HERO_STRIP_GAP_PX;
  context.fillStyle = colorText;
  const separateWaiting = frame.separate.waitingCounts.reduce((sum, count) => sum + count, 0);
  const idleCount = frame.separate.busy.filter((busy) => !busy).length;
  // 좁은 화면(320px 폭)에서는 빈 창구 수까지 붙이면 라벨이 캔버스를 넘친다.
  // 그때는 대기 수만 적는다 — 빈 창구는 옅은 상자로 이미 보인다.
  const labelRoom = width - HERO_PAD_X * 2;
  const fullLabel = hero_format_separate_label(separateWaiting, idleCount);
  const label =
    context.measureText(fullLabel).width <= labelRoom ? fullLabel : hero_format_separate_label(separateWaiting, 0);
  context.fillText(label, HERO_PAD_X, lowerTop);

  const lanesTop = lowerTop + HERO_LABEL_HEIGHT_PX;
  const laneHeight = (stripHeight - HERO_LABEL_HEIGHT_PX) / counterCount;
  for (let index = 0; index < counterCount; index += 1) {
    const laneY = lanesTop + index * laneHeight;
    const boxHeight = Math.max(4, laneHeight - HERO_LANE_GAP_PX);
    hero_draw_counter(width - HERO_PAD_X - HERO_COUNTER_WIDTH_PX, laneY, boxHeight, frame.separate.busy[index], colorSeparate);
    hero_draw_queue(
      width - HERO_PAD_X - HERO_COUNTER_WIDTH_PX - HERO_COUNTER_GAP_PX - HERO_DOT_RADIUS_PX,
      laneY + boxHeight / 2,
      frame.separate.drawCounts[index],
      colorSeparate,
      HERO_PAD_X,
    );
  }

  // 배경색을 한 번 읽어 둔다 — 폴백이 죽으면 무색이 되는 것을 여기서 막는다.
  context.strokeStyle = colorSurface;
  return { width, height, stripHeight };
}

/**
 * 아래 띠의 라벨. 줄이 서 있는데 빈 창구가 있으면 그 수를 붙인다 — 한 줄 배치가 없애는 낭비다.
 * **실시간 숫자는 캔버스 안에만 둔다.** 예전에는 캡션 문단이 매 프레임 숫자를 다시 쓰고
 * "Right now …" 절이 붙었다 떨어지면서 문단 높이가 바뀌어, 아래 슬라이더가 위아래로 튀었다.
 */
export function hero_format_separate_label(waitingCount, idleCount) {
  const idle = waitingCount > 0 && idleCount > 0 ? `, ${display_format_count(idleCount)} idle` : '';
  return `${LAYOUT_NAME_SEPARATE} — ${display_format_count(waitingCount)} waiting${idle}`;
}

/**
 * 애니메이션 아래 캡션. **고정 문장이다** — 프레임마다 바뀌는 숫자를 넣지 않는다
 * (읽는 도중 글이 바뀌고, 문단 높이가 흔들려 아래 조작부가 밀린다). 창구 수는 슬라이더를
 * 움직일 때만 바뀌므로 넣는다.
 */
export function hero_describe_strips(counterCount, still = false) {
  // 창구가 하나면 "다른 줄"이 없다 — 두 배치가 같은 가게라 낭비 문장을 뺀다.
  const waste =
    counterCount > 1
      ? 'An empty box in the lower strip while people still wait in other lines is the waste ' +
        'the single line removes. '
      : 'With one counter the two layouts are the same shop. ';
  return (
    (still
      ? 'Motion is switched off in your system settings, so this is a still picture of a sample ' +
        'shop, redrawn each time you move a slider. '
      : 'This is a sample shop running live. It follows the four sliders. ') +
    'Nothing below reads from it — the cards, curve and table are calculated. A filled box is a counter serving ' +
    'someone, an empty box is a free counter, and each dot is a person waiting. ' +
    `Both strips are fed the same arrivals from the same seed and get the same ` +
    `${display_format_count(counterCount)} ${num_format_plural(counterCount, 'counter')}, so any ` +
    `difference between them is the layout and not luck. ${waste}` +
    // 한계가 둘이다 — sim.js의 26(`SIM_QUEUE_DRAW_MAX`)과 캔버스 폭. 넓은 화면에서는 26이 먼저
    // 걸리고, 좁은 화면에서는 폭이 먼저 걸린다. 위 띠에는 점 HERO_QUEUE_RESERVE_DOTS개 자리를
    // 늘 남긴다(hero_calculate_counter_pitch) — 자리가 0이면 줄이 통째로 안 보였다.
    `A long queue is drawn up to ${SIM_QUEUE_DRAW_MAX} waiting, and only as far as the ` +
    'strip has room; the count in each label is the real one.'
  );
}

/**
 * 캔버스의 aria-label. 캡션 문단과 같은 글을 두 번 읽히지 않게 그림만 짧게 말한다.
 * 실시간 대기 수는 그림 안 라벨에만 있으므로 그렇게 밝힌다.
 */
export function hero_describe_canvas(counterCount, still = false) {
  const kind = still ? 'Still picture' : 'Animation';
  const counts = still ? 'The waiting counts are' : 'The live waiting counts are';
  return (
    `${kind} of ${display_format_count(counterCount)} ${num_format_plural(counterCount, 'counter')} ` +
    `twice: one shared line above, a line per counter below. ${counts} drawn ` +
    'in the picture only; the caption below explains it.'
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
  heading.textContent = 'Single queue against one queue per counter';

  // ── 히어로 ──
  const heroCanvas = document.createElement('canvas');
  heroCanvas.className = 'widget-chart hero-canvas';
  heroCanvas.setAttribute('role', 'img');

  // 그림이 애니메이션(표본 가게)이라는 것을 그림 **위에** 먼저 밝힌다 — 아래 카드·곡선과
  // 같은 계산 결과로 읽히지 않게(2026-09-26 운영자 지적).
  const heroTag = document.createElement('p');
  heroTag.className = 'hero-tag';

  const heroNote = document.createElement('p');
  heroNote.className = 'legend-note';

  // ── 슬라이더 ──
  const counterSlider = control_build_slider(
    'queue-counters',
    'Counters',
    'How many people are serving. Both layouts get the same number.',
    { min: QUEUE_COUNTER_MIN, max: QUEUE_COUNTER_MAX, step: QUEUE_COUNTER_STEP, value: state.counterCount },
  );
  const loadSlider = control_build_slider(
    'queue-load',
    'How busy the counters are',
    'The share of the time a counter has someone at it. Both layouts share this number, so both serve the same customers per hour.',
    { min: QUEUE_LOAD_MIN, max: QUEUE_LOAD_MAX, step: QUEUE_LOAD_STEP, value: state.load },
  );
  const serviceSlider = control_build_slider(
    'queue-service',
    'Minutes at the counter',
    'How long one transaction takes on average. It scales every wait on this page and leaves the ratios between the layouts unchanged.',
    {
      min: QUEUE_SERVICE_MIN_MINUTES,
      max: QUEUE_SERVICE_MAX_MINUTES,
      step: QUEUE_SERVICE_STEP_MINUTES,
      value: state.serviceMinutes,
    },
  );
  const variationSlider = control_build_slider(
    'queue-variation',
    'How much the transaction time varies',
    'Coefficient of variation: 1.00 is the exponential case the formulas are exact for, 0.25 is nearly fixed-length, 2.00 is mostly short with occasional very long ones.',
    { min: QUEUE_CV_MIN, max: QUEUE_CV_MAX, step: QUEUE_CV_STEP, value: state.variation },
  );
  const sliders = [counterSlider, loadSlider, serviceSlider, variationSlider];

  // ── 프리셋 버튼 ──
  const presets = control_build_button_group(
    PRESET_GROUP_LABEL,
    QUEUE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(presets.group, counterSlider.row, loadSlider.row, serviceSlider.row, variationSlider.row);

  // ── 카드 ──
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const cards = {
    singleMean: control_build_readout(`${LAYOUT_NAME_SINGLE} — mean wait`, 'min'),
    separateMean: control_build_readout(`${LAYOUT_NAME_SEPARATE} — mean wait`, 'min'),
    singlePercentile: control_build_readout(`${LAYOUT_NAME_SINGLE} — 95th percentile`, 'min'),
    separatePercentile: control_build_readout(`${LAYOUT_NAME_SEPARATE} — 95th percentile`, 'min'),
  };
  // 카드 왼쪽 눈금을 배치 색으로 — 이 페이지에서 파랑은 한 줄, 주황은 창구별 줄이다.
  // 공통 강철색이면 "A line per counter" 카드도 파랑 눈금을 달아 뜻이 엇갈렸다.
  cards.singleMean.box.classList.add(READOUT_CLASS_SINGLE);
  cards.singlePercentile.box.classList.add(READOUT_CLASS_SINGLE);
  cards.separateMean.box.classList.add(READOUT_CLASS_SEPARATE);
  cards.separatePercentile.box.classList.add(READOUT_CLASS_SEPARATE);
  readouts.append(cards.singleMean.box, cards.separateMean.box, cards.singlePercentile.box, cards.separatePercentile.box);

  // ── 판정 ──
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  const verdictHeadline = document.createElement('strong');
  const verdictDetail = document.createElement('span');
  verdict.append(verdictHeadline, document.createTextNode(' '), verdictDetail);

  // ── 곡선 ──
  const chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'widget-chart';
  chartCanvas.setAttribute('role', 'img');

  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  for (const key of CHART_LEGEND_KEYS) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('span');
    // 견본 클래스는 `legend-key` + 수식자. 기존 두 위젯과 같은 형태다.
    swatch.className = `legend-key ${key.swatch}`;
    item.append(swatch, document.createTextNode(` ${key.label}`));
    legend.appendChild(item);
  }
  const legendNote = document.createElement('p');
  legendNote.className = 'legend-note';

  // ── 표 ──
  const table = control_build_table('Both layouts at every counter count', TABLE_HEADINGS);

  const exactNote = document.createElement('p');
  exactNote.className = 'legend-note';

  rootEl.append(
    heading, heroTag, heroCanvas, heroNote, controls, verdict, readouts,
    chartCanvas, legend, legendNote, table.scroll, exactNote,
  );

  // ── 상태 ──
  let recomputeTimer = 0;
  let redrawTimer = 0;
  let animationId = 0;
  let heroResizeObserver = null;
  let lastFrameMs = 0;
  let lastResult = null;
  let lastPoints = [];
  let simState = sim_create_state(state.seed, state.counterCount);

  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  function state_read_sliders() {
    return {
      counterCount: model_clamp_counter_count(Number(counterSlider.input.value)),
      load: model_clamp_load(Number(loadSlider.input.value)),
      serviceMinutes: model_clamp_service_minutes(Number(serviceSlider.input.value)),
      variation: model_clamp_variation(Number(variationSlider.input.value)),
      seed: state.seed,
    };
  }

  function display_show_sliders(current) {
    counterSlider.output.textContent = display_format_count(current.counterCount);
    loadSlider.output.textContent = display_format_percent(current.load);
    serviceSlider.output.textContent = `${current.serviceMinutes} min`;
    variationSlider.output.textContent = current.variation.toFixed(2);
    // 이용률은 0.8이 아니라 80%로 읽혀야 한다.
    loadSlider.input.setAttribute('aria-valuetext', display_format_percent(current.load));
  }

  function display_show_table(current) {
    table.body.textContent = '';
    for (const row of model_calculate_counter_table(current.load, current.serviceMinutes, current.variation)) {
      table.body.appendChild(
        control_build_table_row(
          [
            display_format_count(row.counterCount),
            display_format_minutes(row.single.meanMinutes),
            display_format_minutes(row.separate.meanMinutes),
            display_format_minutes(row.single.percentileMinutes),
            display_format_minutes(row.separate.percentileMinutes),
            display_format_ratio_cell(row),
          ],
          { current: row.counterCount === current.counterCount },
        ),
      );
    }
  }

  /** 상태 하나를 받아 화면 전체를 맞춘다. 계산 경로는 여기 하나뿐이다. */
  function widget_update() {
    const current = state_read_sliders();
    state.counterCount = current.counterCount;
    state.load = current.load;
    state.serviceMinutes = current.serviceMinutes;
    state.variation = current.variation;

    display_show_sliders(current);

    const result = model_calculate_result(
      current.counterCount, current.load, current.serviceMinutes, current.variation,
    );
    lastResult = result;
    lastPoints = model_calculate_sweep(current.counterCount, current.serviceMinutes, current.variation);

    cards.singleMean.value.textContent = display_format_minutes(result.single.meanMinutes);
    cards.separateMean.value.textContent = display_format_minutes(result.separate.meanMinutes);
    cards.singlePercentile.value.textContent = display_format_minutes(result.single.percentileMinutes);
    cards.separatePercentile.value.textContent = display_format_minutes(result.separate.percentileMinutes);

    const spoken = display_describe_verdict(result);
    verdict.dataset.state = spoken.verdict;
    verdictHeadline.textContent = spoken.headline;
    verdictDetail.textContent = spoken.detail;
    exactNote.textContent = display_describe_exactness(result);

    display_show_table(current);

    // 창구 수가 바뀌면 애니메이션의 줄 개수 자체가 달라진다 — 상태를 다시 세운다.
    // 움직임을 끈 화면은 정지 그림 한 장이 전부라, 슬라이더 넷 중 무엇이 바뀌어도 새로 세워
    // 지금 값으로 미리 돌린다 — 그래야 "네 슬라이더를 따른다"가 그 화면에서도 참이다.
    if (reducedMotion || simState.counterCount !== current.counterCount) {
      simState = sim_create_state(state.seed, current.counterCount);
      // 새 가게도 빈 채로 시작하지 않게 처음과 같이 미리 돌린다(움직임을 끈 화면은 이 한 장이 전부다).
      sim_advance_state(simState, HERO_WARMUP_MINUTES, {
        load: current.load, serviceMinutes: current.serviceMinutes, variation: current.variation,
      });
    }

    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 모델을 다시 부르지 않는다 — 마지막 결과를 붙들어 둔다. */
  function widget_redraw() {
    if (!lastResult) return;
    const drawn = chart_render_sweep(chartCanvas, lastPoints, lastResult.load);
    hero_redraw();

    if (!drawn) {
      // 폭 0(숨긴 탭)이면 축을 인용할 수 없다. 그림과 무관한 범례 문구는 언제나 채운다.
      legendNote.textContent = LEGEND_KEY_TEXT;
      return;
    }
    const clipped =
      drawn.singlePercentileStart > 0
        ? ` The single line's dashed curve starts at ρ ` +
          `${display_format_percent(lastPoints[drawn.singlePercentileStart].load)}; to its left fewer than ` +
          `one arrival in twenty waits at all, so its ${display_format_percent(QUEUE_PERCENTILE)} wait is zero ` +
          `and nothing is drawn.`
        : '';
    legendNote.textContent =
      `${LEGEND_KEY_TEXT} Vertical axis ${display_format_axis_minutes(drawn.scale.low)}–` +
      `${display_format_axis_minutes(drawn.scale.high)} minutes on a log scale, rescaled to fit — ` +
      `read it before comparing two settings. The dashed vertical line is where the busy slider sits.` +
      `${clipped}`;

    const summary = display_describe_verdict(lastResult);
    chartCanvas.setAttribute('aria-label', `${summary.headline} ${summary.detail}`);
  }

  function hero_redraw() {
    const frame = sim_read_frame(simState);
    hero_render_frame(heroCanvas, frame, simState.counterCount);
    // 캡션은 고정 문장이라 바뀔 때만 쓴다 — 매 프레임 DOM을 건드리지 않는다.
    const tag = reducedMotion ? HERO_TAG_STILL : HERO_TAG_LIVE;
    if (heroTag.textContent !== tag) heroTag.textContent = tag;
    const note = hero_describe_strips(simState.counterCount, reducedMotion);
    if (heroNote.textContent !== note) heroNote.textContent = note;
    const canvasLabel = hero_describe_canvas(simState.counterCount, reducedMotion);
    if (heroCanvas.getAttribute('aria-label') !== canvasLabel) heroCanvas.setAttribute('aria-label', canvasLabel);
  }

  function widget_animate(timestampMs) {
    if (lastResult) {
      const elapsedSeconds = lastFrameMs === 0 ? 0 : (timestampMs - lastFrameMs) / 1000;
      lastFrameMs = timestampMs;
      sim_advance_state(simState, sim_calculate_step_minutes(elapsedSeconds), {
        load: lastResult.load,
        serviceMinutes: lastResult.serviceMinutes,
        variation: lastResult.variation,
      });
      hero_redraw();
    }
    animationId = window.requestAnimationFrame(widget_animate);
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
  widget_bind(window, 'resize', widget_redraw_deferred);

  /** 프리셋 하나를 싣는다. 처리시간·변동계수는 건드리지 않는다(비율에서 지워지는 값이다). */
  function widget_load_preset(key) {
    const preset = QUEUE_PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    counterSlider.input.value = String(preset.counterCount);
    loadSlider.input.value = String(preset.load);
    widget_update();
  }
  for (const [key, button] of Object.entries(presets.buttons)) {
    widget_bind(button, 'click', () => widget_load_preset(key));
  }

  widget_update();

  // 움직임을 줄이도록 설정한 사람에게는 정지 스냅샷만 준다.
  if (!reducedMotion && typeof window.requestAnimationFrame === 'function') {
    // 첫 화면이 빈 가게가 아니도록 미리 돌려 둔다.
    sim_advance_state(simState, HERO_WARMUP_MINUTES, {
      load: state.load, serviceMinutes: state.serviceMinutes, variation: state.variation,
    });
    animationId = window.requestAnimationFrame(widget_animate);
  } else {
    sim_advance_state(simState, HERO_WARMUP_MINUTES, {
      load: state.load, serviceMinutes: state.serviceMinutes, variation: state.variation,
    });
    hero_redraw();
    // 정지 그림은 한 번만 그린다. 첫 그림 뒤에 레이아웃이 자리를 잡으며 캔버스 폭이 바뀌면
    // 비트맵이 눌린 채 남는다(390px에서 350 대 300). 폭이 바뀔 때마다 다시 그린다 —
    // 움직이는 화면은 매 프레임 다시 그려 문제없다.
    if (typeof window.ResizeObserver === 'function') {
      heroResizeObserver = new window.ResizeObserver(() => hero_redraw());
      heroResizeObserver.observe(heroCanvas);
    }
  }

  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    if (animationId && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(animationId);
    }
    animationId = 0;
    if (heroResizeObserver) heroResizeObserver.disconnect();
    heroResizeObserver = null;
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
