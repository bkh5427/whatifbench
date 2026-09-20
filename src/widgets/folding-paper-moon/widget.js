/**
 * 종이접기 위젯 — DOM·이벤트·렌더.
 *
 * 화면은 두 장이다.
 *   ① 두께 곡선 — 세로축을 linear ↔ log로 토글한다. 같은 숫자가 두 그림이 된다.
 *   ② 로그 자 — 10⁻⁵ m부터 10¹² m까지 **고정된** 띠. 마커가 한 번 접을 때마다
 *      정확히 같은 거리씩 오른쪽으로 간다.
 *
 * **자의 범위는 절대 데이터에 맞춰 자동 조정하지 않는다.** 등간격은 범위가 상수일
 * 때만 성립하고, 그 등간격이 이 도구가 하려는 말 전부다. 차트 y축은 반대로 자동
 * 조정한다 — 두 규칙이 정반대라는 것이 이 위젯 고유의 함정이다.
 */

import {
  FOLD_THICKNESS_MIN_MM,
  FOLD_THICKNESS_MAX_MM,
  FOLD_THICKNESS_DEFAULT_MM,
  FOLD_THICKNESS_STEP_MM,
  FOLD_COUNT_MIN,
  FOLD_COUNT_MAX,
  FOLD_COUNT_DEFAULT,
  FOLD_THICKNESS_FACTOR,
  FOLD_REFERENCE_LIST,
  model_clamp_thickness_mm,
  model_clamp_fold_count,
  model_calculate_thickness_m,
  model_calculate_layer_count,
  model_calculate_folds_to_reach,
  model_check_passed,
  model_read_last_passed,
  model_read_next_target,
  model_calculate_length_required_m,
  model_build_series,
  model_build_crossings,
} from './model.js';

import { num_clamp_value, num_calculate_decimal_digits, num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_linear, ticks_build_decade, ticks_drop_crowded } from '../_shared/ticks.js';
import {
  canvas_read_css_color,
  canvas_setup_context,
  canvas_draw_icon,
  CANVAS_ICON_VIEWBOX,
  CANVAS_ICON_STROKE_WIDTH,
} from '../_shared/canvas.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import { control_build_button_group } from '../_shared/controls.js';
import {
  LOGSCALE_INSIDE,
  logscale_calculate_position,
  logscale_calculate_step_ratio,
  logscale_build_decades,
  logscale_pick_label_decades,
} from '../_shared/logscale.js';
import {
  units_format_exponent,
  units_format_length,
  units_format_scientific,
  units_format_count_words,
} from '../_shared/units.js';

// ── DOM 훅 ─────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="folding-paper-moon"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_THICKNESS = 'mm';
const URL_KEY_FOLDS = 'folds';
const URL_KEY_AXIS = 'axis';

// ── 축 종류 ────────────────────────────────────────────────
const AXIS_LINEAR = 'linear';
const AXIS_LOG = 'log';
const AXIS_DEFAULT = AXIS_LINEAR; // 논지는 "선형에서는 아무 일도 없어 보인다"에서 시작한다
const AXIS_URL_CODE = { [AXIS_LINEAR]: 0, [AXIS_LOG]: 1 };

// ── 프리셋 ─────────────────────────────────────────────────
// 두께·접기 횟수를 함께 바꿔 서로 다른 규모를 보여준다.
// 실측(model_calculate_thickness_m, 소스는 위 코드 경로 하나뿐이다):
//   0.1 mm·42회 → 4.40×10⁸ m (달 궤도 반장축 3.844×10⁸ m 근처)
//   0.5 mm·13회 → 4.10 m (사람 키 규모, 몇 번만 접어도 닿는다)
//   0.05 mm·50회 → 5.63×10¹⁰ m (수성 궤도 5.79×10¹⁰ m 근처, 접기 상한에서)
const PRESET_GROUP_LABEL = 'Jump to a setting';
const FOLD_PRESETS = [
  // 기본값과 같다 — 종이접기 논지의 그 지점(42회면 달에 닿는다).
  { key: 'office-moon', label: 'Office paper to the Moon', thicknessMm: 0.1, foldCount: 42 },
  // 가장 두꺼운 종이는 몇 번 접지 않아도 사람 키를 넘는다 — 대비용.
  { key: 'card-few-folds', label: 'Thick card, few folds', thicknessMm: 0.5, foldCount: 13 },
  // 가장 얇은 종이도 슬라이더 상한(50회)까지 접으면 행성 궤도 규모에 닿는다.
  { key: 'foil-many-folds', label: 'Thin foil, fifty folds', thicknessMm: 0.05, foldCount: 50 },
];

// ── 로그 자 (상수. 절대 자동 조정하지 않는다) ────────────────
// 왼쪽 끝은 가장 얇은 종이(0.05 mm = 5×10⁻⁵ m)보다 아래여야 한다.
// 오른쪽 끝은 가장 두꺼운 결과(0.5 mm × 2⁵⁰ = 5.6×10¹¹ m)보다 위여야 한다.
// **접기 상한(`FOLD_COUNT_MAX`)을 올리면 이 값도 같이 올려야 한다** — 안 올리면
// 마커가 띠 밖으로 나가 조용히 사라진다(`rail_calculate_x`가 null을 낸다).
// 그 짝은 `_shared/logscale.test.js`의 데케이드 수 단언이 지킨다.
export const RAIL_LOW_M = 1e-5;
export const RAIL_HIGH_M = 1e12;
const RAIL_HEIGHT_PX = 168;
const RAIL_PAD_X = 18;
const RAIL_BASELINE_RATIO = 0.46; // 띠의 세로 위치 (위: 마커, 아래: 기준점 라벨)
const RAIL_BAR_HEIGHT = 10;
const RAIL_DECADE_TICK = 7;
const RAIL_FOLD_TICK = 13; // 접기 한 번마다 찍는 빗살. 이 띠의 논지라 크게 그린다
const RAIL_FOLD_TICK_GAP = 3; // 빗살과 띠 사이
const RAIL_FOLD_TICK_MAX = 60; // 빗살이 이보다 촘촘하면 그리지 않는다 (0~50이라 늘 통과)
const RAIL_MARK_RADIUS = 3.5;
const RAIL_MARK_RADIUS_PASSED = 4.5;
const RAIL_ICON_SIZE = 17;
const RAIL_ICON_GAP = 13; // 띠 아래 아이콘 중심까지
const RAIL_LABEL_MIN_GAP_PX = 4;
const RAIL_DECADE_LABEL_MIN_GAP_PX = 34;
const RAIL_FOLD_TICK_WIDTH = 1.6;
const RAIL_FOLD_TICK_ALPHA = 0.85;
const RAIL_ICON_ALPHA_AHEAD = 0.55; // 아직 안 지난 기준점
const RAIL_LEADER_ALPHA = 0.35; // 점과 아이콘을 잇는 실선
const RAIL_MARK_LINE_WIDTH = 1.25;
// 아이콘 줄 아래 이름표. **아이콘 18개에 전부 이름을 달 자리는 없다**(글자
// 라벨을 달던 판본이 그래서 아이콘으로 바뀌었다). 그래서 마커를 사이에 둔
// 둘 — 다음 것과 방금 지난 것 — 만 후보로 두고, 겹치면 버린다.
// 기준점이 자 위에서 한 데케이드(≈50 px) 간격인데 이름은 그보다 넓어서,
// 실제 폭에서는 대개 **하나만 남는다.** 남길 순서를 "다음 것 먼저"로 둔 이유가
// 그것이다 — 지난 것의 이름은 히어로 배지가 이미 글자로 들고 있다.
const RAIL_NAME_GAP = 7; // 아이콘 아래쪽 끝에서 글자 위쪽까지
const RAIL_NAME_MIN_GAP_PX = 8; // 두 이름표 사이 최소 간격. 못 지키면 하나를 버린다
const RAIL_CURSOR_HEAD_RATIO = 1.6;
const RAIL_CURSOR_WIDTH = 2.5;
const RAIL_CURSOR_HEAD = 7;

// ── 마커 이동 ──────────────────────────────────────────────
const CURSOR_TRAVEL_MS = 420;
const CURSOR_SNAP_RATIO = 0.0008; // 이보다 가까우면 애니메이션 없이 붙인다
const CURSOR_EASE_POWER = 3; // ease-out. 처음 빠르고 끝에서 잦아든다

// ── 스케일 배지 ────────────────────────────────────────────
// 배지 한 장이 화면에 머무는 최소 시간. 3 Hz(333ms)보다 길게 잡는다.
// 이보다 빨리 넘기면 읽을 수 없고, 잔상만 남는다.
export const BADGE_MIN_DWELL_MS = 344;
// 슬라이드 시간. 체류 시간보다 짧아야 카드가 잠시라도 멈춰 선다.
const BADGE_SLIDE_MS = 180;

// ── 두께 곡선 차트 ─────────────────────────────────────────
const CHART_HEIGHT_PX = 300;
const CHART_PAD_TOP = 18;
const CHART_PAD_RIGHT = 12;
const CHART_PAD_BOTTOM = 52;
const CHART_AXIS_TITLE_GAP = 16;
const CHART_SCALE_PAD_RATIO = 0.08;
const CHART_LABEL_MIN_GAP_PX = 14;
// 기준선 라벨은 세로로 쌓인다. 겹침 판정에 써야 할 크기는 글자 폭이 아니라 줄 높이다.
// 폭을 넣으면 실제보다 훨씬 넓게 잡혀 라벨이 두 개밖에 안 남는다.
const CHART_REFERENCE_LABEL_HEIGHT = 13;
const CHART_REFERENCE_MIN_GAP_PX = 3;
const CHART_CURVE_WIDTH = 2.5;
const CHART_POINT_RADIUS = 3.5;
const CHART_REFERENCE_WIDTH = 1.25;
const CHART_REFERENCE_DASH = [5, 4];
const CHART_REFERENCE_ALPHA = 0.45;
const CHART_GRID_WIDTH = 1;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_FONT_SMALL = '11px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_X_TICK_TARGET_MIN = 1; // 접기 횟수는 정수라 간격이 1보다 작아지면 안 된다
/** 바닥선에서 이 픽셀 안이면 "0에 눌렸다"고 본다. 곡선과 기준선이 같은 잣대를 쓴다. */
const CHART_CRUSHED_PX = 1;
/** 이 안에 들면 10의 거듭제곱으로 본다. */
const AXIS_DECADE_EPSILON = 1e-9;
/** y축 자리는 라벨을 재서 정한다. 아래는 그 하한·상한. */
const CHART_PAD_LEFT_MIN = 44;
const CHART_PAD_LEFT_RATIO_MAX = 0.42;
// 좁은 화면에서는 y축 자리를 줄이고 라벨도 짧게 쓴다.
// 안 그러면 285px 캔버스에서 그림이 그려질 자리가 187px밖에 안 남는다.
const CHART_NARROW_WIDTH = 420;
const CHART_DIGITS_NARROW = 2;
const CHART_DIGITS_WIDE = 3;

// ── 색 토큰 (global.css에서 읽는다. 다크 토큰이 추가되면 자동으로 따라간다) ──
const COLOR_VAR_CURVE = '--series-1';
const COLOR_VAR_CURSOR = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_VAR_RAIL_BG = '--paper-sunk';
const COLOR_FALLBACK_CURVE = '#1f4e79';
const COLOR_FALLBACK_CURSOR = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_RAIL_BG = '#f0f0ea';

/**
 * 자 범례의 빗살 항목. **"one per fold"가 아니다** — fold 0(안 접은 낱장)
 * 자리에도 빗살이 있어 빗살은 접기 횟수보다 하나 많다.
 * 상수로 뽑아 둔 이유는 이 문장이 캡션의 숫자와 같은 것을 세기 때문이다.
 */
export const RAIL_LEGEND_COMB_TEXT = 'Ticks — the flat sheet and every fold after it';

/**
 * 아이콘 줄이 무엇인지 밝히는 한 문장. 자의 캡션 끝에 붙는다.
 * 상수로 뽑아 둔 이유는 표의 캡션과 **같은 표를 가리켜야** 하기 때문이다.
 */
export const RAIL_LEGEND_ICON_TEXT =
  'Each small drawing under the rail is one row of the table below, in the same order.';

// ── 축 제목 ────────────────────────────────────────────────
const CHART_TITLE_X = 'Number of folds';
const CHART_TITLE_Y_LINEAR = 'Thickness in metres (linear scale)';
const CHART_TITLE_Y_LOG = 'Thickness in metres (log scale)';

const RECOMPUTE_DELAY_MS = 90;
const SIGNIFICANT_DIGITS = 4;
// 슬라이더 눈금이 0.01이므로 소수 두 자리. **간격에서 유도한다** —
// 자릿수를 손으로 박아 두면 step을 바꿨을 때 화면 숫자가 조용히 반올림된다.
const THICKNESS_DIGITS = num_calculate_decimal_digits(FOLD_THICKNESS_STEP_MM);

// ── 판정 배너 임계값 ────────────────────────────────────────
// 이 위젯이 시험하는 통념은 "종이가 얇아서 달까지 간다"이다.
// 곡선이 어느 기준을 넘었는지가 아니라 **초기 두께가 답을 얼마나 바꾸는가**를 본다.
const VERDICT_REACHED_KEY = 'moon';

/**
 * 자 위의 값 하나를 픽셀 x로. 자의 범위는 상수이므로 이 함수도 상태를 갖지 않는다.
 * 범위 밖이면 null — 조용히 끝에 붙이면 독자가 "끝에 있다"고 읽는다.
 */
export function rail_calculate_x(metres, plotLeft, plotWidth) {
  const position = logscale_calculate_position(metres, RAIL_LOW_M, RAIL_HIGH_M);
  if (position === null) return null;
  return {
    x: plotLeft + plotWidth * position.ratio,
    clipped: position.clipped,
  };
}

/** 접기 한 번이 자 위에서 차지하는 픽셀. n과 무관한 상수여야 한다. */
export function rail_calculate_fold_step_px(plotWidth) {
  const ratio = logscale_calculate_step_ratio(FOLD_THICKNESS_FACTOR, RAIL_LOW_M, RAIL_HIGH_M);
  return ratio === null ? 0 : plotWidth * ratio;
}

/**
 * 마커가 이동하는 중간 위치. **로그 공간에서 보간한다** —
 * 선형으로 보간하면 마커가 앞부분에 한참 머물다 끝에서 튄다.
 * ratio는 0~1의 경과 비율, 반환은 미터. 유효하지 않은 입력은 목표값 그대로.
 */
export function cursor_calculate_position(fromMetres, toMetres, ratio) {
  if (!(fromMetres > 0) || !(toMetres > 0)) return toMetres;
  const eased = 1 - Math.pow(1 - num_clamp_value(ratio, 0, 1), CURSOR_EASE_POWER);
  const logFrom = Math.log10(fromMetres);
  const logTo = Math.log10(toMetres);
  return Math.pow(10, logFrom + (logTo - logFrom) * eased);
}

/**
 * 마커를 fromMetres에서 toMetres까지 durationMs 동안 옮긴다.
 *
 * 시계와 프레임 예약을 **밖에서 주입받는다.** 그래야 `requestAnimationFrame` 없이
 * 테스트할 수 있다 — 이 루프가 한 번도 안 도는 사고를 실제로 냈고, 그때
 * 화면도 테스트도 아무 말이 없었다.
 *
 * durationMs가 0이면 목표값으로 한 번 부르고 끝낸다 (reduced-motion, 숨긴 탭, 제자리).
 * 반환값은 취소 핸들이고 **여러 번 불러도 안전하다.**
 */
export function cursor_start_travel(options) {
  const { fromMetres, toMetres, durationMs, now, schedule, cancel, onStep, onDone } = options;
  const jump = !(fromMetres > 0) || !(toMetres > 0) || !(durationMs > 0);
  if (jump) {
    onStep(toMetres);
    if (onDone) onDone();
    return function cursor_cancel_noop() {};
  }

  const startedAt = now();
  let handle = null;
  let live = true;

  const stepFrame = (stamp) => {
    if (!live) return;
    const ratio = num_clamp_value((stamp - startedAt) / durationMs, 0, 1);
    if (ratio < 1) {
      onStep(cursor_calculate_position(fromMetres, toMetres, ratio));
      handle = schedule(stepFrame);
    } else {
      onStep(toMetres);
      live = false;
      handle = null;
      if (onDone) onDone();
    }
  };

  handle = schedule(stepFrame);
  return function cursor_cancel_travel() {
    if (!live) return;
    live = false;
    if (handle !== null) cancel(handle);
    handle = null;
  };
}

/**
 * 배지가 너무 빨리 넘어가지 않게 막는 문(leading + trailing 스로틀).
 *
 * - 첫 요청은 즉시 보여준다 (손을 따라가야 한다)
 * - 체류 중에 온 요청은 **큐에 쌓지 않고 마지막 것만 들고 있다가** 만료 시 그리로 간다.
 *   쌓으면 배지가 손가락 뒤를 한참 따라와 고장으로 읽힌다.
 * - **트레일링이 반드시 있어야 한다.** 체류 중 변경을 그냥 버리면 손을 뗐을 때
 *   틀린 배지에 멈춘다.
 *
 * 시계와 타이머를 주입받는다 — 그래야 테스트할 수 있다.
 */
export function badge_create_gate(options) {
  const { dwellMs, now, schedule, cancel, onShow } = options;
  let shownAt = -Infinity;
  let pending = null;
  let hasPending = false;
  let timer = null;

  function release() {
    timer = null;
    if (!hasPending) return;
    const next = pending;
    pending = null;
    hasPending = false;
    shownAt = now();
    onShow(next);
  }

  return {
    request(value) {
      const stamp = now();
      if (stamp - shownAt >= dwellMs) {
        if (timer !== null) cancel(timer);
        timer = null;
        pending = null;
        hasPending = false;
        shownAt = stamp;
        onShow(value);
        return;
      }
      pending = value;
      hasPending = true;
      if (timer === null) timer = schedule(release, dwellMs - (stamp - shownAt));
    },
    stop() {
      if (timer !== null) cancel(timer);
      timer = null;
      pending = null;
      hasPending = false;
    },
  };
}

/** 데케이드 한 칸이 차지하는 픽셀. stride와 간격 검사가 **같은 값**을 봐야 한다. */
export function rail_calculate_decade_gap_px(plotWidth, decadeCount) {
  if (!(plotWidth > 0) || decadeCount < 2) return 0;
  return plotWidth / (decadeCount - 1);
}

/** 좁은 화면에서 데케이드 라벨을 몇 칸마다 남길지. */
export function rail_calculate_label_stride(plotWidth, decadeCount) {
  const gap = rail_calculate_decade_gap_px(plotWidth, decadeCount);
  if (!(gap > 0)) return 1;
  return Math.max(1, Math.ceil(RAIL_DECADE_LABEL_MIN_GAP_PX / gap));
}

/**
 * 이 폭에서 실제로 라벨을 달 데케이드들.
 *
 * stride만으로는 부족하다. 마지막 데케이드가 stride를 무시하고 들어오기 때문에
 * 마지막 두 라벨 사이만 한 칸(=stride분의 1)으로 좁아진다. 그래서 stride를 낸 뒤
 * 같은 잣대(`RAIL_DECADE_LABEL_MIN_GAP_PX`)로 한 번 더 솎는다.
 * **자의 라벨 행도 다른 라벨 행과 똑같이 겹침 검사를 지나간다.**
 */
export function rail_pick_decade_labels(plotWidth, decades) {
  const gapPx = rail_calculate_decade_gap_px(plotWidth, decades.length);
  const stride = rail_calculate_label_stride(plotWidth, decades.length);
  return logscale_pick_label_decades(decades, stride, {
    gapPx,
    minGapPx: RAIL_DECADE_LABEL_MIN_GAP_PX,
  });
}

/** 곡선 차트의 y축 범위. **여기는 데이터에 맞춘다** (자와 정반대). */
export function chart_calculate_scale(series, axisKind) {
  const values = series.map((point) => point.thicknessM).filter((value) => value > 0);
  if (values.length === 0) return null;
  const dataLow = Math.min(...values);
  const dataHigh = Math.max(...values);

  if (axisKind === AXIS_LOG) {
    // 값이 하나뿐이면(n=0) 로그 스팬이 0이 되어 좌표가 NaN이 된다. 한 데케이드를 준다.
    const low = dataLow === dataHigh ? dataLow / Math.sqrt(10) : dataLow;
    const high = dataLow === dataHigh ? dataHigh * Math.sqrt(10) : dataHigh;
    return { kind: AXIS_LOG, low, high };
  }

  // 선형 축은 0에서 시작한다. "30번까지 아무 일도 없다"가 이 축의 논지이고,
  // 바닥을 잘라내면 그 논지가 사라진다.
  const high = dataHigh === 0 ? 1 : dataHigh * (1 + CHART_SCALE_PAD_RATIO);
  return { kind: AXIS_LINEAR, low: 0, high };
}

/** 두께 → 차트 y 좌표. 범위 밖이면 null. */
export function chart_calculate_y(metres, scale, plotTop, plotHeight) {
  if (!scale || !Number.isFinite(metres)) return null;
  if (scale.kind === AXIS_LOG) {
    if (!(metres > 0) || !(scale.high > scale.low)) return null;
    const span = Math.log10(scale.high) - Math.log10(scale.low);
    if (!(span > 0)) return null;
    const ratio = (Math.log10(metres) - Math.log10(scale.low)) / span;
    return plotTop + plotHeight * (1 - ratio);
  }
  const span = scale.high - scale.low;
  if (!(span > 0)) return null;
  return plotTop + plotHeight * (1 - (metres - scale.low) / span);
}

/**
 * 선형 축에서 곡선이 축의 1픽셀 안에 눌려 있는 마지막 접기 횟수.
 * 캡션이 이 값을 인용한다 — **렌더가 실제로 쓴 값이어야 한다.**
 */
export function chart_calculate_flat_until(series, scale, plotTop, plotHeight) {
  if (!scale || scale.kind !== AXIS_LINEAR) return null;
  const zeroY = chart_calculate_y(0, scale, plotTop, plotHeight);
  if (zeroY === null) return null;
  let last = null;
  for (const point of series) {
    const y = chart_calculate_y(point.thicknessM, scale, plotTop, plotHeight);
    if (y === null) break;
    if (zeroY - y <= CHART_CRUSHED_PX) last = point.fold;
    else break;
  }
  return last;
}

/**
 * y 눈금 라벨. 축이 좁으면 자릿수를 늘린다.
 *
 * export하는 이유는 하나다: `AXIS_DECADE_EPSILON`을 느슨하게 하면 축 라벨이
 * **거짓말을 한다**(4.398×10⁸ 자리에 "10⁹"). 렌더를 통째로 돌려 글자를 훑는 것보다
 * 이 함수에 값을 직접 넣어 골든 문자열로 못박는 편이 그 사고를 정확히 겨눈다.
 */
export function display_format_axis_value(metres, scale, digits = 3) {
  if (metres === 0) return '0';
  if (scale.kind === AXIS_LOG) {
    // `ticks_build_decade`는 양 끝에 **데이터 경계값**도 넣는다. 그것을 반올림해
    // 10ⁿ으로 찍으면 4.4×10⁸ 자리에 "10⁹"이라고 적힌다 — 축이 거짓말을 한다.
    // 10의 거듭제곱일 때만 지수 표기를 쓴다.
    const power = Math.log10(metres);
    if (Math.abs(power - Math.round(power)) < AXIS_DECADE_EPSILON) {
      return units_format_exponent(Math.round(power));
    }
  }
  return units_format_scientific(metres, digits);
}

// ═══════════════════════════════════════════════════════════
// 곡선 차트
// ═══════════════════════════════════════════════════════════

export function chart_render_thickness(canvasEl, series, axisKind) {
  const surface = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!surface) return null;
  const { context, width: cssWidth, height: cssHeight } = surface;

  const narrow = cssWidth < CHART_NARROW_WIDTH;
  const labelDigits = narrow ? CHART_DIGITS_NARROW : CHART_DIGITS_WIDE;
  const plotHeight = cssHeight - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  if (plotHeight <= 0) return null;

  const scale = chart_calculate_scale(series, axisKind);
  if (!scale) return null;

  // y 눈금을 먼저 만들고 **라벨을 재서** 축 자리를 정한다.
  // 자리를 상수로 박아 두면 좁은 화면에서 "4.4 × 10⁸"이 잘려 나간다.
  context.font = CHART_LABEL_FONT;
  const yTicks =
    scale.kind === AXIS_LOG
      ? ticks_build_decade(scale.low, scale.high).filter((v) => v > 0)
      : ticks_build_linear(scale.low, scale.high, ticks_calculate_step(scale.high - scale.low));
  const yLabels = yTicks.map((value) => display_format_axis_value(value, scale, labelDigits));
  const widestLabel = yLabels.reduce((widest, text) => Math.max(widest, context.measureText(text).width), 0);
  const padLeft = Math.min(
    Math.max(widestLabel + CHART_LABEL_GAP + CHART_AXIS_TITLE_GAP + 4, CHART_PAD_LEFT_MIN),
    cssWidth * CHART_PAD_LEFT_RATIO_MAX,
  );
  const plotWidth = cssWidth - padLeft - CHART_PAD_RIGHT;
  if (plotWidth <= 0) return null;

  const colorCurve = canvas_read_css_color(canvasEl, COLOR_VAR_CURVE, COLOR_FALLBACK_CURVE);
  const colorGrid = canvas_read_css_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = canvas_read_css_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = canvas_read_css_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  const foldMax = Math.max(series[series.length - 1].fold, 1);
  const xOf = (fold) => padLeft + (plotWidth * fold) / foldMax;
  const yOf = (metres) => chart_calculate_y(metres, scale, CHART_PAD_TOP, plotHeight);

  context.textBaseline = 'middle';

  // ── y 눈금 ── 축 안쪽 것만 남기고, 겹치면 **양 끝은 남기고 가운데부터** 버린다
  const inRange = [];
  yTicks.forEach((value, index) => {
    const y = yOf(value);
    if (y === null || y < CHART_PAD_TOP - 1 || y > CHART_PAD_TOP + plotHeight + 1) return;
    inRange.push({ value: yLabels[index], position: y, width: CHART_REFERENCE_LABEL_HEIGHT });
  });
  const drawnYTicks = ticks_drop_crowded(inRange, CHART_LABEL_MIN_GAP_PX - CHART_REFERENCE_LABEL_HEIGHT);

  context.strokeStyle = colorGrid;
  context.lineWidth = CHART_GRID_WIDTH;
  context.textAlign = 'right';
  context.fillStyle = colorText;
  for (const tick of drawnYTicks) {
    context.beginPath();
    context.moveTo(padLeft, tick.position);
    context.lineTo(padLeft + plotWidth, tick.position);
    context.stroke();
    context.fillText(tick.value, padLeft - CHART_LABEL_GAP, tick.position);
  }

  // ── 기준선 (점선). 축 밖이면 그리지 않는다 — 가장자리에 붙이면 "곧 닿는다"는 거짓 인상 ──
  // 선형 축에서는 기준선 대부분이 바닥 1픽셀 안에 겹쳐 눌린다. 화면만 보면
  // "모래알과 정지궤도가 비슷한 높이"라는 **정반대 인상**이 남는다. 그래서
  // 몇 개가 눌렸는지를 세어 캡션이 그것을 말로 뒤집게 한다 —
  // 세는 자리는 그리는 자리와 같아야 한다(따로 세면 그림과 글이 갈라진다).
  const zeroY = chart_calculate_y(0, scale, CHART_PAD_TOP, plotHeight);
  let crushedReferenceCount = 0;
  const referenceLabels = [];
  context.save();
  context.setLineDash(CHART_REFERENCE_DASH);
  context.lineWidth = CHART_REFERENCE_WIDTH;
  context.strokeStyle = colorAxis;
  context.globalAlpha = CHART_REFERENCE_ALPHA;
  for (const item of FOLD_REFERENCE_LIST) {
    const y = yOf(item.metres);
    if (y === null || y < CHART_PAD_TOP || y > CHART_PAD_TOP + plotHeight) continue;
    context.beginPath();
    context.moveTo(padLeft, y);
    context.lineTo(padLeft + plotWidth, y);
    context.stroke();
    if (zeroY !== null && zeroY - y <= CHART_CRUSHED_PX) crushedReferenceCount += 1;
    referenceLabels.push({ value: item.label, position: y, width: CHART_REFERENCE_LABEL_HEIGHT });
  }
  context.restore();

  // 라벨은 겹치면 밀지 말고 버린다. 양 끝은 남기고 가운데부터 희생한다.
  const keptLabels = ticks_drop_crowded(referenceLabels, CHART_REFERENCE_MIN_GAP_PX);
  context.font = CHART_LABEL_FONT_SMALL;
  context.textAlign = 'right';
  context.fillStyle = colorText;
  for (const label of keptLabels) {
    // 오른쪽 끝에 붙여 그리되 캔버스 밖으로 나가지 않게 잰다.
    // 라벨이 잘리면 "The Moo"처럼 뜻이 반쯤 사라진다.
    const textWidth = context.measureText(label.value).width;
    const right = Math.min(padLeft + plotWidth - CHART_LABEL_GAP, cssWidth - CHART_PAD_RIGHT);
    const x = Math.max(right, padLeft + textWidth + 2);
    context.fillText(label.value, x, label.position - 8);
  }

  // ── x 눈금 ──
  context.font = CHART_LABEL_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const xStep = Math.max(CHART_X_TICK_TARGET_MIN, Math.round(ticks_calculate_step(foldMax)));
  context.strokeStyle = colorGrid;
  for (let fold = 0; fold <= foldMax; fold += xStep) {
    const x = xOf(fold);
    context.beginPath();
    context.moveTo(x, CHART_PAD_TOP);
    context.lineTo(x, CHART_PAD_TOP + plotHeight);
    context.stroke();
    context.fillStyle = colorText;
    context.fillText(String(fold), x, CHART_PAD_TOP + plotHeight + CHART_LABEL_GAP);
  }

  // ── 축선 ──
  context.strokeStyle = colorAxis;
  context.lineWidth = CHART_GRID_WIDTH;
  context.beginPath();
  context.moveTo(padLeft, CHART_PAD_TOP);
  context.lineTo(padLeft, CHART_PAD_TOP + plotHeight);
  context.lineTo(padLeft + plotWidth, CHART_PAD_TOP + plotHeight);
  context.stroke();

  // ── 축 제목 ──
  context.fillStyle = colorAxis;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillText(CHART_TITLE_X, padLeft + plotWidth / 2, cssHeight - CHART_AXIS_TITLE_GAP / 2);
  context.save();
  context.translate(CHART_AXIS_TITLE_GAP, CHART_PAD_TOP + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.fillText(scale.kind === AXIS_LOG ? CHART_TITLE_Y_LOG : CHART_TITLE_Y_LINEAR, 0, 0);
  context.restore();

  // ── 곡선 ──
  context.strokeStyle = colorCurve;
  context.fillStyle = colorCurve;
  context.lineWidth = CHART_CURVE_WIDTH;
  context.lineJoin = 'round';
  context.beginPath();
  let started = false;
  for (const point of series) {
    const y = yOf(point.thicknessM);
    if (y === null) continue;
    const x = xOf(point.fold);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }
  if (started) context.stroke();

  // 점이 하나뿐이면(n=0) 선이 그려지지 않는다. 점을 찍는다.
  if (series.length === 1) {
    const y = yOf(series[0].thicknessM);
    if (y !== null) {
      context.beginPath();
      context.arc(xOf(0), y, CHART_POINT_RADIUS, 0, Math.PI * 2);
      context.fill();
    }
  }

  return {
    axisKind: scale.kind,
    lowM: scale.low,
    highM: scale.high,
    // 캡션이 가로축도 인용한다. 렌더가 쓴 값을 돌려주지 않으면 캡션이 축을
    // 다시 계산하게 되고, 그림과 글이 갈라진다.
    foldMax,
    crushedReferenceCount,
    referenceCount: FOLD_REFERENCE_LIST.length,
    flatUntilFold: chart_calculate_flat_until(series, scale, CHART_PAD_TOP, plotHeight),
  };
}

/**
 * 곡선 밑에 붙는 캡션. **인자는 `chart_render_thickness`가 돌려준 것 하나뿐이다.**
 *
 * 축 범위를 말로만 "설정마다 달라진다"고 적으면 독자는 두 설정을 나란히 놓고
 * 비교할 방법이 없다. **렌더가 실제로 쓴 축의 양 끝을 숫자로 적는다** — 그러면
 * 눈으로 못 하는 비교를 읽어서 할 수 있다. 그리고 눈으로 비교할 수 있는 그림
 * (범위가 상수인 자)이 어디에 있는지 가리킨다.
 */
export function chart_format_note(drawn) {
  const scaleWord = drawn.axisKind === AXIS_LOG ? 'logarithmic' : 'linear';
  // 선형 축에서 바닥에 눌린 것을 **세어서** 적는다. 그림만 보면 모래알과
  // 정지궤도가 같은 높이로 보이는데, 그 인상이야말로 이 페이지가 뒤집으려는
  // 것이다. 몇 개가 눌렸는지를 숫자로 적으면 시각 잡음이 논지로 바뀐다.
  const crushed =
    drawn.crushedReferenceCount > 0
      ? ` and ${drawn.crushedReferenceCount} of the ${drawn.referenceCount} marked heights`
      : '';
  const flat =
    drawn.flatUntilFold !== null && drawn.flatUntilFold >= 1
      ? ` On this axis folds 0 to ${drawn.flatUntilFold}${crushed} sit within one pixel of zero.`
      : '';
  return (
    'Both axes rescale with the sliders — read them before comparing two settings. ' +
    `Vertical: ${scaleWord}, ${units_format_length(drawn.lowM, SIGNIFICANT_DIGITS)} ` +
    `to ${units_format_length(drawn.highM, SIGNIFICANT_DIGITS)}. ` +
    `Horizontal: 0 to ${drawn.foldMax} ${num_format_plural(drawn.foldMax, 'fold')}. ` +
    'The rail above never rescales, so two settings can be compared there.' +
    flat
  );
}

// ═══════════════════════════════════════════════════════════
// 로그 자
// ═══════════════════════════════════════════════════════════

/**
 * 자를 그린다. cursorMetres는 애니메이션 중간값일 수 있으므로 series와 따로 받는다.
 * **자의 범위는 상수다.** 여기서 데이터에 맞춰 범위를 바꾸면 등간격이 깨진다.
 */
export function rail_render(canvasEl, options) {
  const { series, cursorMetres } = options;
  const surface = canvas_setup_context(canvasEl, RAIL_HEIGHT_PX);
  if (!surface) return null;
  const { context, width: cssWidth, height: cssHeight } = surface;

  const plotLeft = RAIL_PAD_X;
  const plotWidth = cssWidth - RAIL_PAD_X * 2;
  if (plotWidth <= 0) return null;
  const baseline = Math.round(cssHeight * RAIL_BASELINE_RATIO);

  const colorGrid = canvas_read_css_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = canvas_read_css_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = canvas_read_css_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);
  const colorCursor = canvas_read_css_color(canvasEl, COLOR_VAR_CURSOR, COLOR_FALLBACK_CURSOR);
  const colorCurve = canvas_read_css_color(canvasEl, COLOR_VAR_CURVE, COLOR_FALLBACK_CURVE);
  const colorRail = canvas_read_css_color(canvasEl, COLOR_VAR_RAIL_BG, COLOR_FALLBACK_RAIL_BG);

  // ── 띠 ──
  context.fillStyle = colorRail;
  context.fillRect(plotLeft, baseline - RAIL_BAR_HEIGHT / 2, plotWidth, RAIL_BAR_HEIGHT);

  // ── 데케이드 눈금 ──
  const decades = logscale_build_decades(RAIL_LOW_M, RAIL_HIGH_M);
  const labelledDecades = rail_pick_decade_labels(plotWidth, decades);
  const labelled = new Set(labelledDecades);

  context.font = CHART_LABEL_FONT_SMALL;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  // 데케이드 라벨이 앉는 줄. 자에는 글자 줄이 셋(커서 값·데케이드·이름표)이라,
  // 어느 줄인지를 렌더가 돌려주지 않으면 밖에서는 y로 짐작할 수밖에 없다.
  const decadeLabelY = baseline + RAIL_BAR_HEIGHT / 2 + RAIL_DECADE_TICK + 2;
  for (const power of decades) {
    const spot = rail_calculate_x(Math.pow(10, power), plotLeft, plotWidth);
    if (!spot) continue;
    const tall = labelled.has(power);
    context.strokeStyle = colorGrid;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(spot.x, baseline + RAIL_BAR_HEIGHT / 2);
    context.lineTo(spot.x, baseline + RAIL_BAR_HEIGHT / 2 + (tall ? RAIL_DECADE_TICK : RAIL_DECADE_TICK / 2));
    context.stroke();
    if (tall) {
      context.fillStyle = colorText;
      context.fillText(units_format_exponent(power), spot.x, decadeLabelY);
    }
  }

  // ── 접기 빗살: 0..n의 위치를 전부 찍는다 ──
  // 이 빗살이 등간격이라는 것이 이 띠의 논지 전체다. 눈으로 셀 수 있게 그린다.
  // 빗살은 차트가 쓰는 것과 **같은 계열**에서 나온다. 여기서 다시 계산하면
  // 두 그림이 시간이 지나며 갈라진다.
  const stepPx = rail_calculate_fold_step_px(plotWidth);
  // **빗살 개수와 스텝 개수는 다르다.** fold 0(안 접은 낱장) 자리에도 빗살이 있어
  // 빗살은 접기 횟수보다 하나 많다. 캡션이 "steps"라고 말하므로 render가
  // 스텝(빗살 사이의 칸) 개수까지 세어 돌려주고, 캡션은 그것을 그대로 읽는다.
  let foldTickCount = 0;
  if (series.length <= RAIL_FOLD_TICK_MAX + 1 && stepPx > 0) {
    context.strokeStyle = colorCurve;
    context.lineWidth = RAIL_FOLD_TICK_WIDTH;
    context.globalAlpha = RAIL_FOLD_TICK_ALPHA;
    for (const point of series) {
      const spot = rail_calculate_x(point.thicknessM, plotLeft, plotWidth);
      if (!spot || spot.clipped !== LOGSCALE_INSIDE) continue;
      context.beginPath();
      context.moveTo(spot.x, baseline - RAIL_BAR_HEIGHT / 2 - RAIL_FOLD_TICK_GAP - RAIL_FOLD_TICK);
      context.lineTo(spot.x, baseline - RAIL_BAR_HEIGHT / 2 - RAIL_FOLD_TICK_GAP);
      context.stroke();
      foldTickCount += 1;
    }
    context.globalAlpha = 1;
  }

  // ── 기준점: 띠 위의 점 + 아래 라벨 ──
  const cursorSpot = rail_calculate_x(cursorMetres, plotLeft, plotWidth);
  const markLabels = [];
  for (const item of FOLD_REFERENCE_LIST) {
    const spot = rail_calculate_x(item.metres, plotLeft, plotWidth);
    if (!spot) continue;
    // 통과 판정은 모델이 한다. 여기서 다시 비교하면 배지와 자가 언젠가 갈라진다.
    const passed = model_check_passed(cursorMetres, item);
    context.beginPath();
    context.arc(spot.x, baseline, passed ? RAIL_MARK_RADIUS_PASSED : RAIL_MARK_RADIUS, 0, Math.PI * 2);
    if (passed) {
      context.fillStyle = colorAxis;
      context.fill();
    } else {
      context.strokeStyle = colorAxis;
      context.lineWidth = RAIL_MARK_LINE_WIDTH;
      context.stroke();
    }
    markLabels.push({ value: item.icon, position: spot.x, width: RAIL_ICON_SIZE, passed });
  }

  // 아이콘끼리 겹치면 밀지 말고 버린다 — 밀면 앞 아이콘 위로 올라탄다.
  // 글자 라벨이 50px씩 먹던 자리를 17px로 줄였으므로 훨씬 많이 살아남는다.
  const keptMarks = ticks_drop_crowded(markLabels, RAIL_LABEL_MIN_GAP_PX);
  const iconY = baseline + RAIL_BAR_HEIGHT / 2 + RAIL_DECADE_TICK + RAIL_ICON_GAP + RAIL_ICON_SIZE / 2;
  let iconCount = 0;
  for (const mark of keptMarks) {
    // 지나간 것은 진하게, 아직 아닌 것은 흐리게 — 색이 아니라 농도로 가른다
    context.fillStyle = mark.passed ? colorAxis : colorText;
    context.globalAlpha = mark.passed ? 1 : RAIL_ICON_ALPHA_AHEAD;
    const half = RAIL_ICON_SIZE / 2;
    const x = num_clamp_value(mark.position, plotLeft + half, plotLeft + plotWidth - half);
    if (canvas_draw_icon(context, mark.value, x, iconY, RAIL_ICON_SIZE)) iconCount += 1;
    // 점과 아이콘을 실선으로 잇는다. 안 이으면 어느 아이콘이 어느 점인지 못 읽는다.
    context.globalAlpha = RAIL_LEADER_ALPHA;
    context.strokeStyle = colorAxis;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(mark.position, baseline + RAIL_BAR_HEIGHT / 2);
    context.lineTo(mark.position, iconY - RAIL_ICON_SIZE / 2 - 1);
    if (x !== mark.position) context.lineTo(x, iconY - RAIL_ICON_SIZE / 2 - 1);
    context.stroke();
    context.globalAlpha = 1;
  }

  // ── 아이콘 이름표: 마커를 사이에 둔 둘만 ──
  // 아이콘만 있으면 "이 그림들이 무엇인가"를 표까지 내려가야 알 수 있다.
  // 마커 왼쪽(방금 지난 것)과 오른쪽(다음 것)에 이름을 달아 그 왕복을 없앤다.
  // **다음 것을 먼저 자리에 놓는다** — 자리가 하나뿐이면 남길 것은 "다음"이다
  // (지난 것의 이름은 히어로 배지가 이미 글자로 들고 있다).
  const nameY = iconY + RAIL_ICON_SIZE / 2 + RAIL_NAME_GAP;
  const drawnNames = [];
  context.font = CHART_LABEL_FONT_SMALL;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = colorText;
  for (const item of [model_read_next_target(cursorMetres), model_read_last_passed(cursorMetres)]) {
    if (!item) continue;
    const spot = rail_calculate_x(item.metres, plotLeft, plotWidth);
    if (!spot || spot.clipped !== LOGSCALE_INSIDE) continue;
    const half = context.measureText(item.label).width / 2;
    // 캔버스 밖으로 나가면 글자가 잘린다 — "The Moo"가 되지 않게 안으로 민다.
    const x = num_clamp_value(spot.x, plotLeft + half, plotLeft + plotWidth - half);
    // 겹치면 밀지 말고 버린다. 두 이름표가 서로 올라타면 둘 다 못 읽는다.
    const collides = drawnNames.some(
      (placed) => Math.abs(placed.x - x) < placed.half + half + RAIL_NAME_MIN_GAP_PX,
    );
    if (collides) continue;
    context.fillText(item.label, x, nameY);
    // 이름표는 아이콘보다 훨씬 넓어 이웃 아이콘 밑까지 뻗는다. 어느 아이콘의
    // 이름인지 짧은 세로선으로 못박는다 — 없으면 옆 아이콘의 이름으로 읽힌다.
    context.save();
    context.globalAlpha = RAIL_LEADER_ALPHA;
    context.strokeStyle = colorAxis;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(spot.x, iconY + RAIL_ICON_SIZE / 2);
    context.lineTo(spot.x, nameY - 1);
    context.stroke();
    context.restore();
    drawnNames.push({ key: item.key, label: item.label, x, half });
  }

  // ── 현재 두께 마커: 띠 **위쪽** 레인. 기준점 라벨과 절대 겹치지 않는다 ──
  if (cursorSpot) {
    const topY = baseline - RAIL_BAR_HEIGHT / 2 - RAIL_FOLD_TICK_GAP - RAIL_FOLD_TICK - 5;
    context.strokeStyle = colorCursor;
    context.fillStyle = colorCursor;
    context.lineWidth = RAIL_CURSOR_WIDTH;
    context.beginPath();
    context.moveTo(cursorSpot.x, topY);
    context.lineTo(cursorSpot.x, baseline + RAIL_BAR_HEIGHT / 2);
    context.stroke();
    // 아래를 가리키는 삼각형
    context.beginPath();
    context.moveTo(cursorSpot.x, topY + RAIL_CURSOR_HEAD);
    context.lineTo(cursorSpot.x - RAIL_CURSOR_HEAD / RAIL_CURSOR_HEAD_RATIO, topY);
    context.lineTo(cursorSpot.x + RAIL_CURSOR_HEAD / RAIL_CURSOR_HEAD_RATIO, topY);
    context.closePath();
    context.fill();

    context.font = CHART_LABEL_FONT;
    context.textBaseline = 'top';
    context.textAlign = 'center';
    const text = units_format_length(cursorMetres, SIGNIFICANT_DIGITS);
    const half = context.measureText(text).width / 2;
    const x = num_clamp_value(cursorSpot.x, plotLeft + half, plotLeft + plotWidth - half);
    context.fillText(text, x, 1);
  }

  return {
    stepPx,
    foldTickCount,
    // 두께는 단조증가라 자 밖으로 잘리는 빗살은 언제나 양 끝쪽이다 — 그려진
    // 빗살은 끊기지 않은 한 줄이고, 그 사이의 칸은 빗살 개수보다 하나 적다.
    foldStepCount: Math.max(0, foldTickCount - 1),
    iconCount,
    // 자에 실제로 글자가 붙은 기준점들. 캡션·테스트가 그림을 다시 계산하지 않고
    // 여기서 읽는다.
    namedKeys: drawnNames.map((placed) => placed.key),
    decadeLabelY,
    nameLabelY: nameY,
    labelledDecades,
    cursorClipped: cursorSpot ? cursorSpot.clipped : null,
  };
}

/**
 * 자 밑에 붙는 캡션. **인자는 `rail_render`가 돌려준 것 하나뿐이다.**
 * 여기서 축이나 개수를 다시 계산하면 그림과 글이 갈라진다.
 *
 * 빗살과 스텝을 둘 다 적는다. 42번 접으면 빗살은 43개이고 그 사이 칸이 42개다 —
 * 한 숫자만 적으면 화면을 세어 본 독자와 어긋난다.
 */
export function rail_format_note(drawn) {
  const lowPower = Math.round(Math.log10(RAIL_LOW_M));
  const highPower = Math.round(Math.log10(RAIL_HIGH_M));
  return (
    `Rail fixed at ${units_format_exponent(lowPower)} to ${units_format_exponent(highPower)} metres — ` +
    `it never rescales. One fold moves the marker ${drawn.stepPx.toFixed(1)} px, ` +
    // 접기 0회(슬라이더 최솟값)에서는 빗살이 하나뿐이라 "between 1 ticks"가 나갔었다.
    // 단수는 공용 헬퍼가 고른다 — 동사 일치까지 함께 넘긴다.
    `the same at every setting, and ${drawn.foldTickCount} ` +
    `${num_format_plural(drawn.foldTickCount, 'tick is', 'ticks are')} drawn above it, ` +
    `with ${drawn.foldStepCount} equal ${num_format_plural(drawn.foldStepCount, 'step')} between them. ` +
    // 아이콘 줄이 무엇인지 한 줄로 밝힌다. 이 문장이 없으면 독자는 그림 열여덟
    // 개를 보고 표까지 내려가 하나씩 맞춰 봐야 한다 — 대부분은 그냥 나간다.
    RAIL_LEGEND_ICON_TEXT
  );
}

// ═══════════════════════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════════════════════

export function url_read_state(search) {
  const numbers = urlstate_read_numbers(search, {
    [URL_KEY_THICKNESS]: { fallback: FOLD_THICKNESS_DEFAULT_MM, clamp: model_clamp_thickness_mm },
    [URL_KEY_FOLDS]: { fallback: FOLD_COUNT_DEFAULT, clamp: model_clamp_fold_count },
    [URL_KEY_AXIS]: { fallback: AXIS_URL_CODE[AXIS_DEFAULT] },
  });
  return {
    thicknessMm: numbers[URL_KEY_THICKNESS],
    foldCount: numbers[URL_KEY_FOLDS],
    axisKind: numbers[URL_KEY_AXIS] === AXIS_URL_CODE[AXIS_LOG] ? AXIS_LOG : AXIS_DEFAULT,
  };
}

export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_THICKNESS]: state.thicknessMm,
    [URL_KEY_FOLDS]: state.foldCount,
    [URL_KEY_AXIS]: AXIS_URL_CODE[state.axisKind],
  });
}

/**
 * 기준점 이름을 문장 가운데에 넣을 형태로. "The Moon" → "the Moon".
 * 앞머리 관사만 소문자로 내린다 — "Mount Everest"나 "Mercury's orbit"처럼
 * 고유명사로 시작하는 것은 건드리지 않는다.
 */
const REFERENCE_ARTICLES = ['A ', 'An ', 'The ', 'One '];

export function display_format_reference_phrase(label) {
  for (const article of REFERENCE_ARTICLES) {
    if (label.startsWith(article)) return label[0].toLowerCase() + label.slice(1);
  }
  return label;
}

/**
 * 길이 하나를 기준점 목록으로 재서 사람이 읽는 배수로. 10²¹ m는 크다는 것
 * 말고는 아무것도 말하지 않는다 — 무엇의 몇 배인지가 붙어야 크기가 생긴다.
 *
 * 자를 고르는 판정은 `model_read_last_passed` 하나를 쓴다. 여기서 따로 고르면
 * 자와 배지와 이 줄이 언젠가 서로 다른 기준을 든다.
 */
export function display_describe_length_scale(metres) {
  const yardstick = model_read_last_passed(metres);
  if (!yardstick) return '';
  const ratio = metres / yardstick.metres;
  if (!Number.isFinite(ratio) || ratio < 1) return '';
  return `about ${units_format_count_words(ratio)} × ${display_format_reference_phrase(yardstick.label)}`;
}

/**
 * 표의 캡션. **무엇을 비교하라는 표인지**까지 말한다 — 제목만 있으면 독자는
 * 열여덟 줄을 훑고 아무 결론 없이 지나간다.
 *
 * 상한은 상수에서 읽는다. 손으로 적으면 슬라이더 범위를 바꿨을 때 캡션만 거짓이 된다.
 */
export function display_format_table_caption(foldMax = FOLD_COUNT_MAX) {
  return (
    'First fold at which the stack passes each height. ' +
    'The heights climb by huge factors; the fold counts creep up by ones. ' +
    `The slider stops at ${foldMax} folds, so the last row or two can land just beyond it. ` +
    'Thicker paper needs fewer folds, so the thickness slider brings them back into reach.'
  );
}

/** 교차표 한 행의 문구. 접기 전부터 두꺼운 경우를 "0번"으로 적으면 거짓말이 된다. */
export function display_format_crossing(row, foldMax) {
  if (row.folds === null) return { text: 'outside the model', reached: false };
  if (row.folds === 0) return { text: 'already thicker', reached: true };
  // **막다른 골목처럼 보이면 안 된다.** 손잡이를 끝까지 밀어도 안 닿는 행이지만,
  // 어떤 행도 영구히 도달 불가는 아니다 — 종이를 두껍게 하면 접기 수가 줄어 전부
  // 닿는다(수성 51→47, 태양까지 52→49). "past the slider"만 적으면 독자가 거기서
  // 멈춘다. 빠져나갈 길을 같은 칸에 적는다.
  if (!row.reachable) {
    return { text: `${row.folds} — try thicker paper`, reached: false };
  }
  return { text: String(row.folds), reached: row.folds <= foldMax };
}

// ═══════════════════════════════════════════════════════════
// 조립
// ═══════════════════════════════════════════════════════════

function widget_build_slider(id, labelText, hintText, config) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';

  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;

  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.id = `${id}-hint`;
  hint.textContent = hintText;

  labelBox.append(label, hint);

  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(config.value);
  input.setAttribute('aria-describedby', hint.id);

  const output = document.createElement('output');
  output.className = 'widget-out';
  output.setAttribute('for', id);
  // <output>은 암묵적 live region이다. 슬라이더 한 번에 값 셋이 순차 발화되지
  // 않도록 끄고, 발화는 판정문 하나로 모은다.
  output.setAttribute('aria-live', 'off');

  row.append(labelBox, input, output);
  return { row, input, output };
}

function widget_build_readout(labelText, unitText) {
  const box = document.createElement('div');
  box.className = 'readout';

  const label = document.createElement('p');
  label.className = 'readout-label';
  label.textContent = labelText;

  const line = document.createElement('p');
  line.className = 'readout-line';

  const value = document.createElement('span');
  value.className = 'readout-value';

  const unit = document.createElement('span');
  unit.className = 'readout-unit';
  unit.textContent = unitText;

  // 숫자 아래 한 줄. 지수 표기는 크기를 말하지 않는다 — "10²¹ m"를 읽고
  // 크기를 떠올릴 수 있는 독자는 거의 없다. 무엇의 몇 배인지가 그 자리를 채운다.
  // 라벨과 같은 관용구(`.readout-label`)를 쓴다 — 새 시각 언어를 만들지 않는다.
  const note = document.createElement('p');
  note.className = 'readout-label';

  line.append(value, unit);
  box.append(label, line, note);
  return { box, value, note };
}

/**
 * 축 토글. 사이트에 버튼·탭 선례가 없어 라디오 그룹으로 만든다 —
 * "둘 중 하나"라는 뜻이 맞고, 화살표 키 이동이 공짜로 따라온다.
 */
function widget_build_axis_toggle(name, hintText, initialKind) {
  const row = document.createElement('div');
  row.className = 'widget-row';

  const labelBox = document.createElement('div');
  labelBox.className = 'widget-label';
  const label = document.createElement('span');
  label.id = `${name}-label`;
  label.textContent = 'Vertical axis';
  const hint = document.createElement('span');
  hint.className = 'widget-hint';
  hint.id = `${name}-hint`;
  hint.textContent = hintText;
  labelBox.append(label, hint);

  const group = document.createElement('div');
  group.className = 'widget-toggle';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', `${name}-label`);
  group.setAttribute('aria-describedby', hint.id);

  const inputs = {};
  for (const kind of [AXIS_LINEAR, AXIS_LOG]) {
    const option = document.createElement('label');
    option.className = 'widget-toggle-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = kind;
    input.checked = kind === initialKind;

    const text = document.createElement('span');
    text.textContent = kind === AXIS_LINEAR ? 'Linear' : 'Logarithmic';

    option.append(input, text);
    group.appendChild(option);
    inputs[kind] = input;
  }

  row.append(labelBox, group);
  return { row, inputs };
}

/**
 * 표에 넣을 인라인 SVG 아이콘. 자에 그린 것과 같은 path를 쓴다.
 * 장식이므로 접근성 트리에서 숨긴다 — 이름은 바로 옆 글자가 들고 있다.
 */
function display_build_icon(icon, className = 'row-icon') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${CANVAS_ICON_VIEWBOX} ${CANVAS_ICON_VIEWBOX}`);
  // 클래스가 크기를 정한다. 표는 글자 높이에 맞추고 배지는 원을 꽉 채운다 —
  // 같은 클래스를 쓰면 배지가 표 크기로 그려진다 (실제로 그랬다).
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const face = document.createElementNS(NS, 'path');
  face.setAttribute('d', icon.fill);
  face.setAttribute('fill', 'currentColor');
  svg.appendChild(face);

  if (icon.stroke) {
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', icon.stroke);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', String(CANVAS_ICON_STROKE_WIDTH));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
  }
  return svg;
}

/** 접근성용 자 설명. 캔버스는 접근성 트리에 텍스트가 없다. */
function display_describe_rail(thicknessMm, foldCount, crossings) {
  const metres = model_calculate_thickness_m(thicknessMm, foldCount);
  const passed = crossings.filter((row) => row.folds !== null && row.folds <= foldCount);
  const names = passed.map((row) => row.label).join(', ');
  return (
    `A logarithmic rail from ${units_format_exponent(-5)} to ${units_format_exponent(12)} metres. ` +
    `After ${foldCount} ${num_format_plural(foldCount, 'fold')} the stack is ` +
    `${units_format_length(metres, SIGNIFICANT_DIGITS)}, ` +
    `and every fold moves the marker the same distance along the rail. ` +
    (names ? `Passed so far: ${names}.` : 'It has not passed any of the marked heights yet.')
  );
}

export function widget_mount(rootEl) {
  if (!rootEl) return null;
  // 모듈이 두 번 평가되면(HMR, 스크립트 중복) 같은 자리에 위젯이 두 벌 붙는다.
  // 리스너도 두 벌이 되어 조용히 새기 시작한다.
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';
  rootEl.classList.add('widget');

  const initialState = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Paper folding thickness explorer';

  const thicknessSlider = widget_build_slider(
    'fold-thickness',
    'Starting thickness',
    'Office paper is about 0.10 mm. The whole range is a factor of ten.',
    {
      min: FOLD_THICKNESS_MIN_MM,
      max: FOLD_THICKNESS_MAX_MM,
      step: FOLD_THICKNESS_STEP_MM,
      value: initialState.thicknessMm,
    },
  );

  const foldSlider = widget_build_slider('fold-count', 'Folds', 'Each fold doubles the number of layers.', {
    min: FOLD_COUNT_MIN,
    max: FOLD_COUNT_MAX,
    step: 1,
    value: initialState.foldCount,
  });

  // 이 토글이 페이지의 논점이다. "두 가지로 그린다"만 적으면 왜 눌러 봐야
  // 하는지가 없어 대부분 그냥 지나간다. 무엇이 달라지는지를 적는다.
  const axisToggle = widget_build_axis_toggle(
    'fold-axis',
    'Same numbers, two axes. Linear flattens the early folds onto zero; logarithmic turns the doubling into a straight line.',
    initialState.axisKind,
  );

  // ── 프리셋 버튼 ──
  const presets = control_build_button_group(
    PRESET_GROUP_LABEL,
    FOLD_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(presets.group, thicknessSlider.row, foldSlider.row);

  // 축 토글은 자기가 조종하는 그림 옆으로 내린다.
  const axisControls = document.createElement('div');
  axisControls.className = 'widget-controls';
  axisControls.append(axisToggle.row);

  // ── 스케일 히어로: 이 위젯의 주인공 ──
  // 슬라이더 바로 아래에 둔다. 원인과 결과가 한 눈에 들어와야 한다.
  // 전체를 `aria-hidden`으로 두고, 같은 정보는 슬라이더의 `aria-valuetext`와
  // 판정문이 들고 간다 — 규약대로 발화는 한 곳으로 모은다.
  const hero = document.createElement('div');
  hero.className = 'scale-hero';
  hero.setAttribute('aria-hidden', 'true');

  const badge = document.createElement('div');
  badge.className = 'scale-badge';

  const figures = document.createElement('div');
  figures.className = 'scale-figures';
  const valueEl = document.createElement('p');
  valueEl.className = 'scale-value';
  const humanEl = document.createElement('p');
  humanEl.className = 'scale-human';
  const captionEl = document.createElement('p');
  captionEl.className = 'scale-caption';
  // 배지는 "여기까지 왔다"만 말한다. 슬라이더를 더 밀 이유는 **다음이 무엇이고
  // 몇 번 남았는가**이고, 그것이 없으면 첫 화면이 결론만 보여주고 끝난다.
  // 배지 게이트(체류 시간)가 아니라 상태에서 직접 갱신한다 — 게이트에 태우면
  // 기준점이 안 바뀌는 동안 "몇 번 남음"이 옛 숫자로 굳는다.
  const nextEl = document.createElement('p');
  nextEl.className = 'scale-human';
  figures.append(valueEl, humanEl, captionEl, nextEl);
  hero.append(badge, figures);

  const chartCanvas = document.createElement('canvas');
  chartCanvas.className = 'widget-chart';
  chartCanvas.setAttribute('role', 'img');
  // 폭이 0이면 렌더가 조기 반환해 라벨이 안 붙는다. 라벨 없는 role="img"가
  // 남지 않도록 기본 문구를 먼저 달아 둔다.
  chartCanvas.setAttribute('aria-label', 'Thickness against fold count.');

  const chartLegend = document.createElement('p');
  chartLegend.className = 'widget-legend';
  const keyCurve = document.createElement('span');
  keyCurve.className = 'legend-key legend-thickness';
  const keyCurveText = document.createElement('span');
  keyCurveText.textContent = 'Solid — paper thickness';
  const keyReference = document.createElement('span');
  keyReference.className = 'legend-key legend-reference';
  const keyReferenceText = document.createElement('span');
  keyReferenceText.textContent = 'Dashed — reference heights';
  const chartNote = document.createElement('span');
  chartNote.className = 'legend-note';
  chartLegend.append(keyCurve, keyCurveText, keyReference, keyReferenceText, chartNote);

  const railCanvas = document.createElement('canvas');
  railCanvas.className = 'widget-chart';
  railCanvas.setAttribute('role', 'img');

  const railNote = document.createElement('p');
  railNote.className = 'widget-legend';
  const keyCursor = document.createElement('span');
  keyCursor.className = 'legend-key legend-cursor';
  const keyCursorText = document.createElement('span');
  keyCursorText.textContent = 'Marker — thickness now';
  const keyComb = document.createElement('span');
  keyComb.className = 'legend-key legend-comb';
  const keyCombText = document.createElement('span');
  keyCombText.textContent = RAIL_LEGEND_COMB_TEXT;
  const keyDot = document.createElement('span');
  keyDot.className = 'legend-key legend-dot';
  const keyDotText = document.createElement('span');
  keyDotText.textContent = 'Solid dot and dark icon — already passed';
  const railNoteText = document.createElement('span');
  railNoteText.className = 'legend-note';
  railNote.append(keyCursor, keyCursorText, keyComb, keyCombText, keyDot, keyDotText, railNoteText);

  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  // 두께는 히어로가 크게 들고 있다. 카드로 한 번 더 찍으면 중복이다.
  const layerReadout = widget_build_readout('Layers', 'sheets stacked');
  const lengthReadout = widget_build_readout('Length needed', 'to fold one way');
  readouts.append(layerReadout.box, lengthReadout.box);

  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  verdict.setAttribute('aria-live', 'polite');

  const table = document.createElement('table');
  table.className = 'widget-table';
  table.innerHTML =
    `<caption>${display_format_table_caption()}</caption>` +
    '<thead><tr><th scope="col">Height</th><th scope="col">Metres</th>' +
    '<th scope="col">Folds</th><th scope="col">Note</th></tr></thead>' +
    '<tbody></tbody>';
  const tableBody = table.querySelector('tbody');

  const tableScroll = document.createElement('div');
  tableScroll.className = 'widget-table-scroll';
  tableScroll.setAttribute('tabindex', '0');
  tableScroll.setAttribute('role', 'region');
  tableScroll.setAttribute('aria-label', 'Fold counts for each reference height');
  tableScroll.appendChild(table);

  // 순서가 곧 논지다: 원인(슬라이더) → 결과(배지) → 그 결과를 말로(판정문)
  // → 왜 그렇게 갔는가(자) → 곁가지 수치(카드) → 느리게 읽는 2막(곡선) → 조회용(표)
  rootEl.append(
    heading,
    controls,
    hero,
    verdict,
    railCanvas,
    railNote,
    readouts,
    axisControls,
    chartCanvas,
    chartLegend,
    tableScroll,
  );

  // ── 상태와 렌더 ──
  // `lastSeries`·`lastState`는 **언제나 짝이 맞는다.** 드래그 중 마커만 앞서 나가야
  // 하므로 자에는 별도 계열 `railSeries`를 둔다. 하나로 합치면 resize가 끼어들 때
  // 옛 계열을 새 축으로 그리게 된다.
  let lastSeries = null;
  let lastState = null;
  let railSeries = null;
  let cursorMetres = model_calculate_thickness_m(initialState.thicknessMm, initialState.foldCount);
  let cursorTarget = cursorMetres;
  let cursorStop = null; // 진행 중인 이동의 취소 핸들
  let pointerHeld = false;
  let badgeKey = null;      // 지금 배지에 떠 있는 기준점의 key ('' = 아직 못 넘음)
  let badgeMetres = 0;      // 그 배지를 띄웠을 때의 두께. 방향 판정에 쓴다
  let badgeCleanup = 0;     // 나가는 카드를 치우는 타이머
  let recomputeTimer = 0;

  const reduceMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

  /**
   * 슬라이더 양 끝에서 달을 넘는 접기 횟수의 차. 판정문이 이 숫자를 인용한다.
   * 산문에 "three"라고 박아 두면 슬라이더 범위를 바꿨을 때 문장이 거짓이 된다.
   */
  function state_calculate_moon_spread() {
    const moonMetres = FOLD_REFERENCE_LIST.find((item) => item.key === VERDICT_REACHED_KEY).metres;
    const thinnest = model_calculate_folds_to_reach(FOLD_THICKNESS_MIN_MM, moonMetres);
    const thickest = model_calculate_folds_to_reach(FOLD_THICKNESS_MAX_MM, moonMetres);
    return thinnest - thickest;
  }

  function state_read_current() {
    const thicknessMm = model_clamp_thickness_mm(Number(thicknessSlider.input.value));
    const foldCount = model_clamp_fold_count(Number(foldSlider.input.value));
    const axisKind = axisToggle.inputs[AXIS_LOG].checked ? AXIS_LOG : AXIS_LINEAR;
    return { thicknessMm, foldCount, axisKind };
  }

  function display_update_labels(state, metres) {
    // t₀는 step이 0.01이므로 언제나 소수 두 자리다 — 간격의 정밀도가 자릿수를 정한다.
    const thicknessText = state.thicknessMm.toFixed(THICKNESS_DIGITS);
    thicknessSlider.output.textContent = `${thicknessText} mm`;
    foldSlider.output.textContent = String(state.foldCount);
    thicknessSlider.input.setAttribute('aria-valuetext', `${thicknessText} millimetres`);
    // 히어로는 aria-hidden이므로, 그 정보의 비시각 경로가 여기다.
    const passed = model_read_last_passed(metres);
    // 히어로의 "다음 기준점" 줄도 시각 전용이므로, 여기에 **짧은 형태로** 같이 싣는다.
    // 화살표 키를 한 번 누를 때마다 다시 읽히는 문자열이라 `short`를 쓴다 —
    // 전체 라벨을 넣으면 한 칸 움직일 때마다 긴 문장이 통째로 발화된다.
    const next = model_read_next_target(metres);
    const nextFolds = next === null ? null : model_calculate_folds_to_reach(state.thicknessMm, next.metres);
    // 접기 1회에서 "1 folds"가 발화됐다. 0은 복수가 맞다("0 folds").
    foldSlider.input.setAttribute(
      'aria-valuetext',
      `${state.foldCount} ${num_format_plural(state.foldCount, 'fold')} — ` +
        `${units_format_length(metres, SIGNIFICANT_DIGITS)}` +
        (passed ? `, past ${passed.label}` : ', not past the first mark yet') +
        (next === null ? ', past every mark' : `, next ${next.short} at ${nextFolds}`),
    );
  }

  function display_render_table(state, crossings) {
    tableBody.textContent = '';
    for (const row of crossings) {
      const tr = document.createElement('tr');
      const note = display_format_crossing(row, FOLD_COUNT_MAX);
      if (row.folds !== null && row.folds === state.foldCount) tr.setAttribute('aria-current', 'true');
      // **답과 그 답의 상태는 같은 칸에 있어야 한다.** 앞선 판본은 접기 칸에
      // 숫자만 찍고 "past the slider"를 맨 오른쪽 Note 칸에 출처 문구와 함께
      // 붙여 두었다 — 손잡이를 끝까지 밀어도 안 닿는 행인데, 그 사실이 표의
      // 반대쪽 끝에 있어 읽히지 않았다. 상태를 답 칸으로 옮기고 Note는 출처만 든다.
      const cells = [
        row.label,
        units_format_length(row.metres, SIGNIFICANT_DIGITS),
        row.folds === null ? '—' : note.text,
        row.note,
      ];
      cells.forEach((text, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) {
          cell.setAttribute('scope', 'row');
          // 자에 그린 것과 **같은 도형**을 표에도 넣는다. 그래야 표가 범례가 된다 —
          // 그림만 있고 이름이 어디에도 없으면 읽을 수 없다.
          cell.appendChild(display_build_icon(row.icon));
        }
        cell.appendChild(document.createTextNode(text));
        tr.appendChild(cell);
      });
      tableBody.appendChild(tr);
    }
  }

  /**
   * 배지 한 장을 바꾼다. 나가는 카드와 들어오는 카드를 겹쳐 두고 밀어 올린다.
   * `up`이면 아래에서 위로(두꺼워짐), 아니면 반대로 — 한 방향으로만 움직이면
   * 위치 변화가 아니라 로딩 표시로 읽힌다.
   */
  function display_show_badge(item, up) {
    const previous = badge.querySelector('.scale-badge-card');
    const card = document.createElement('div');
    card.className = 'scale-badge-card';
    card.appendChild(display_build_icon(item ? item.icon : model_read_next_target(0).icon, 'scale-badge-icon'));
    badge.dataset.state = item ? 'passed' : 'ahead';

    if (!previous) {
      badge.appendChild(card);
      return;
    }
    // 들어오는 카드를 반대편에 세워 두고, 다음 프레임에 제자리로 보낸다.
    card.classList.add(up ? 'is-entering-up' : 'is-entering-down');
    badge.appendChild(card);
    // 강제 리플로우 — 이게 없으면 브라우저가 시작 상태를 건너뛰어 전환이 안 보인다.
    void card.offsetWidth;
    card.classList.remove('is-entering-up', 'is-entering-down');
    previous.classList.add(up ? 'is-leaving-up' : 'is-leaving-down');

    window.clearTimeout(badgeCleanup);
    // `transitionend`에 걸지 않는다 — reduced-motion에서는 0.01ms에 끝나 순서가 꼬인다.
    badgeCleanup = window.setTimeout(() => {
      for (const stale of badge.querySelectorAll('.scale-badge-card')) {
        if (stale !== card) stale.remove();
      }
    }, BADGE_SLIDE_MS + 40);
  }

  /**
   * 히어로를 매 프레임 갱신한다.
   * **숫자는 게이트 없이** 매번 바뀐다 — 접기 한 번에 가수 네 자리가 전부 굴러가는
   * 것이 이 화면의 맛이다. 작은 글자 변화라 섬광에 해당하지 않는다.
   * **배지는 게이트를 지난다** — 초당 열다섯 장이 넘어가면 아무것도 안 읽힌다.
   */
  function display_update_hero(metres) {
    const exact = `${units_format_scientific(metres, SIGNIFICANT_DIGITS)} m`;
    if (valueEl.textContent !== exact) valueEl.textContent = exact;
    const human = units_format_length(metres, SIGNIFICANT_DIGITS);
    if (humanEl.textContent !== human) humanEl.textContent = human;

    const passed = model_read_last_passed(metres);
    badgeGate.request({ key: passed ? passed.key : '', item: passed, metres });
  }

  const badgeGate = badge_create_gate({
    dwellMs: BADGE_MIN_DWELL_MS,
    now: () => Date.now(),
    schedule: (callback, ms) => window.setTimeout(callback, ms),
    cancel: (handle) => window.clearTimeout(handle),
    onShow: ({ key, item, metres }) => {
      const changed = key !== badgeKey;
      const up = metres >= badgeMetres;
      badgeMetres = metres;
      if (!changed) return;
      badgeKey = key;
      display_show_badge(item, up);
      captionEl.innerHTML = '';
      const lead = document.createTextNode(item ? 'Taller than ' : 'Not yet past ');
      const name = document.createElement('strong');
      name.textContent = (item ?? model_read_next_target(metres) ?? FOLD_REFERENCE_LIST[0]).label;
      captionEl.append(lead, name);
    },
  });

  function rail_redraw() {
    if (!railSeries) return;
    // 자가 못 그려지는 순간(폭 0)에도 히어로는 갱신한다 — DOM이라 캔버스와 무관하다.
    display_update_hero(cursorMetres);
    const drawn = rail_render(railCanvas, { series: railSeries, cursorMetres });
    if (!drawn) return;
    // 캡션은 렌더가 실제로 쓴 값만 인용한다. 다시 계산하면 그림과 갈라진다.
    railNoteText.textContent = rail_format_note(drawn);
  }

  /**
   * 이번 이동에 줄 시간. 0이면 미끄러지지 않고 바로 붙는다.
   * 환경 판정을 전부 여기 모아 `cursor_start_travel`을 순수하게 유지한다.
   */
  function cursor_calculate_duration(from, to) {
    if (!(from > 0) || !(to > 0)) return 0;
    if (reduceMotion.matches) return 0;
    // 눈에 안 보일 만큼 작은 이동은 미끄러질 것도 없다 (로그 거리로 잰다).
    if (Math.abs(Math.log10(to) - Math.log10(from)) < CURSOR_SNAP_RATIO) return 0;
    if (typeof window.requestAnimationFrame !== 'function' || typeof performance === 'undefined') return 0;
    // 숨긴 탭에서는 rAF가 멈춰 마커가 중간값에 얼어붙는다. 안 보이는 동안 미끄러질 이유도 없다.
    if (typeof document !== 'undefined' && document.hidden) return 0;
    return CURSOR_TRAVEL_MS;
  }

  function cursor_halt() {
    if (cursorStop) cursorStop();
    cursorStop = null;
  }

  function cursor_animate() {
    cursor_halt();
    cursorStop = cursor_start_travel({
      fromMetres: cursorMetres,
      toMetres: cursorTarget,
      durationMs: cursor_calculate_duration(cursorMetres, cursorTarget),
      now: () => performance.now(),
      schedule: (callback) => window.requestAnimationFrame(callback),
      cancel: (handle) => window.cancelAnimationFrame(handle),
      onStep: (metres) => {
        cursorMetres = metres;
        rail_redraw();
      },
      onDone: () => {
        cursorStop = null;
      },
    });
  }

  function chart_redraw() {
    if (!lastSeries || !lastState) return;
    const drawn = chart_render_thickness(chartCanvas, lastSeries, lastState.axisKind);
    if (!drawn) return;
    const scaleWord = drawn.axisKind === AXIS_LOG ? 'logarithmic' : 'linear';
    chartNote.textContent = chart_format_note(drawn);
    chartCanvas.setAttribute(
      'aria-label',
      `Thickness against fold count on a ${scaleWord} vertical axis, ` +
        `from ${units_format_length(lastSeries[0].thicknessM, SIGNIFICANT_DIGITS)} ` +
        `to ${units_format_length(lastSeries[lastSeries.length - 1].thicknessM, SIGNIFICANT_DIGITS)}.`,
    );
  }

  function widget_update(options = {}) {
    // 예약된 디바운스가 남아 있으면 같은 계산과 같은 발화가 한 번 더 돈다.
    window.clearTimeout(recomputeTimer);
    const state = state_read_current();
    lastState = state;
    lastSeries = model_build_series(state.thicknessMm, state.foldCount);
    railSeries = lastSeries;

    const metres = lastSeries[lastSeries.length - 1].thicknessM;
    const crossings = model_build_crossings(state.thicknessMm, FOLD_COUNT_MAX);

    display_update_labels(state, metres);
    layerReadout.value.textContent = units_format_count_words(model_calculate_layer_count(state.foldCount));
    // "4.4 trillion"이 어디서 나온 숫자인지 한 줄로 밝힌다. 이 도구의 전부가
    // 이 한 문장이고, 그것이 카드 안에 없으면 큰 숫자 하나로 끝난다.
    layerReadout.note.textContent =
      `one sheet doubled ${state.foldCount} ${num_format_plural(state.foldCount, 'time')}`;

    const lengthM = model_calculate_length_required_m(state.thicknessMm, state.foldCount);
    lengthReadout.value.textContent = units_format_length(lengthM, SIGNIFICANT_DIGITS);
    lengthReadout.note.textContent = display_describe_length_scale(lengthM);

    // 다음 기준점과 남은 접기. **배지 게이트를 타지 않는다** — 기준점이 그대로인
    // 동안에도 "몇 번 남음"은 접을 때마다 바뀌므로, 게이트에 태우면 굳은 숫자가 남는다.
    const nextTarget = model_read_next_target(metres);
    if (!nextTarget) {
      nextEl.textContent = 'Every height in the table is behind it now.';
    } else {
      const nextRow = crossings.find((row) => row.key === nextTarget.key);
      const moreFolds = nextRow.folds - state.foldCount;
      // 라벨 자체에 쉼표가 들어 있는 것이 있다("The Sun, edge to edge").
      // 뒤를 또 쉼표로 이으면 어디까지가 이름인지 안 보인다 — 줄표로 끊는다.
      nextEl.textContent =
        `Next mark: ${nextTarget.label} — ${moreFolds} more ${num_format_plural(moreFolds, 'fold')} away.`;
    }

    const moon = crossings.find((row) => row.key === VERDICT_REACHED_KEY);
    const reached = state.foldCount >= moon.folds;
    const thicknessText = state.thicknessMm.toFixed(THICKNESS_DIGITS);
    const moonSpread = state_calculate_moon_spread();
    // `dataset.state = null`은 속성을 지우지 않고 문자열 "null"을 넣는다.
    // 그러면 `:not([data-state])`에 안 걸려 중립 스타일로 떨어지지 않는다.
    // **판정 배너에 `data-state`를 붙이지 않는다.** 3색(`--hold`/`--edge`/`--break`)은
    // "가정이 성립/경계/파탄" 전용이고 이 배너는 그런 주장을 하지 않는다. 슬라이더가
    // 달에 못 미친 것은 모델의 파탄이 아니라 손잡이가 왼쪽에 있다는 사실일 뿐이다.
    // 이 위젯에는 파탄 상태 자체가 없다 — 두께 46설정 전부에서 달은 40~43접기,
    // 슬라이더 상한은 50이라 언제나 답이 나온다. 상한 밖 기준은 표가 적는다.
    // 속성을 지워 `.verdict:not([data-state])` 중립 스타일로 떨어뜨린다.
    verdict.removeAttribute('data-state');
    verdict.textContent = reached
      ? `At ${thicknessText} mm the model puts the stack past the Moon from fold ${moon.folds}. ` +
        `The whole thickness slider moves that answer by ${moonSpread} ` +
        `${num_format_plural(moonSpread, 'fold')}.`
      : `At ${thicknessText} mm the model needs ${moon.folds} ` +
        `${num_format_plural(moon.folds, 'fold')} to pass the Moon — ` +
        `${moon.folds - state.foldCount} more than the ${state.foldCount} set here.`;

    display_render_table(state, crossings);
    railCanvas.setAttribute('aria-label', display_describe_rail(state.thicknessMm, state.foldCount, crossings));

    url_write_state(state);
    chart_redraw();

    cursorTarget = metres;
    // `keepTravel`이면 진행 중인 이동을 건드리지 않는다. 디바운스 타이머가
    // 이동 도중에 도착하는데, 여기서 죽이면 미끄러짐이 매번 잘린다.
    if (options.keepTravel && cursorStop) return;
    cursor_halt();
    if (options.immediate === false) {
      cursor_animate();
    } else {
      cursorMetres = cursorTarget;
      rail_redraw();
    }
  }

  /**
   * `input`에서 부른다. 곡선·표는 디바운스하되 **마커와 숫자는 여기서 처리한다.**
   *
   * 애니메이션의 입구가 여기인 이유: `<input type=range>`는 언제나
   * `input` → `change` 순서로 발화한다. `change`에 애니메이션을 걸어 두면
   * 그때는 이미 `input`이 마커를 목표에 붙여 놓은 뒤라 **한 번도 안 돈다.**
   * 실제로 그렇게 짜여 있었고, 화면도 테스트도 아무 말이 없었다.
   */
  function widget_update_deferred() {
    const state = state_read_current();
    railSeries = model_build_series(state.thicknessMm, state.foldCount);
    cursorTarget = railSeries[railSeries.length - 1].thicknessM;
    // 손잡이 옆 숫자는 언제나 즉시. 마커만 움직이고 숫자가 멈춰 있으면 이상하다.
    display_update_labels(state, cursorTarget);

    if (pointerHeld) {
      // 드래그 중에는 마커가 손가락을 그대로 따라가야 한다 —
      // 등간격으로 움직이는 것이 이 띠의 논지다.
      cursor_halt();
      cursorMetres = cursorTarget;
      rail_redraw();
    } else {
      // 키보드·프로그램 조작은 미끄러진다. 한 칸이 자 폭의 1/17이라
      // 순간 이동하면 얼마나 갔는지가 안 읽힌다.
      cursor_animate();
    }

    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(() => widget_update({ keepTravel: !pointerHeld }), RECOMPUTE_DELAY_MS);
  }

  let redrawTimer = 0;
  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(() => {
      // 창 크기만 바뀌었을 때 계산을 다시 하지 않는다. 마지막 결과를 다시 그린다.
      chart_redraw();
      rail_redraw();
    }, RECOMPUTE_DELAY_MS);
  }

  /** 프리셋 하나를 슬라이더에 싣는다. */
  function widget_load_preset(key) {
    const preset = FOLD_PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    thicknessSlider.input.value = String(preset.thicknessMm);
    foldSlider.input.value = String(preset.foldCount);
    widget_update({ immediate: true });
  }
  const onPreset = (key) => () => widget_load_preset(key);
  const presetHandlers = new Map();
  for (const [key, button] of Object.entries(presets.buttons)) {
    const handler = onPreset(key);
    presetHandlers.set(button, handler);
    button.addEventListener('click', handler);
  }

  const sliders = [thicknessSlider.input, foldSlider.input];
  // 드래그 중에는 마커가 손가락을 그대로 따라가야 한다(등간격이 논지다).
  // 손을 뗐거나 키보드로 움직였을 때만 미끄러지게 한다.
  const onPointerDown = () => { pointerHeld = true; };
  const onPointerUp = () => { pointerHeld = false; };
  const onInput = () => widget_update_deferred();
  // `change`는 언제나 `input` 뒤에 온다. 값은 이미 반영돼 있으므로 여기서는
  // 진행 중인 이동을 살려 둔 채 곡선·표만 확정한다.
  const onChange = () => widget_update({ keepTravel: true });
  const onAxis = () => widget_update({ immediate: true });

  for (const input of sliders) {
    input.addEventListener('pointerdown', onPointerDown);
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);
  }
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  for (const kind of [AXIS_LINEAR, AXIS_LOG]) {
    axisToggle.inputs[kind].addEventListener('change', onAxis);
  }
  window.addEventListener('resize', widget_redraw_deferred);

  widget_update({ immediate: true });

  // 해제 경로를 반환한다. 두 번 붙이면 누수다.
  return function widget_reset() {
    for (const input of sliders) {
      input.removeEventListener('pointerdown', onPointerDown);
      input.removeEventListener('input', onInput);
      input.removeEventListener('change', onChange);
    }
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    for (const kind of [AXIS_LINEAR, AXIS_LOG]) {
      axisToggle.inputs[kind].removeEventListener('change', onAxis);
    }
    window.removeEventListener('resize', widget_redraw_deferred);
    for (const [button, handler] of presetHandlers) button.removeEventListener('click', handler);
    presetHandlers.clear();
    delete rootEl.dataset.mounted;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    window.clearTimeout(badgeCleanup);
    badgeGate.stop();
    cursor_halt();
    rootEl.textContent = '';
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector(ROOT_SELECTOR);
  if (root) widget_mount(root);
}
