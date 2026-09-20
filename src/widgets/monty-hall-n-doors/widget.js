/**
 * 몬티 홀 — 문 N개 위젯 (DOM·이벤트·렌더)
 *
 * 계산은 전부 model.js가 한다. 이 파일은 그리기와 입력만 담당한다.
 * 상태는 URL 쿼리스트링에 싣는다. localStorage를 쓰지 않는다.
 */
import {
  MONTY_DOOR_MIN,
  MONTY_DOOR_MAX,
  MONTY_DOOR_DEFAULT,
  MONTY_OPENED_MIN,
  MONTY_OPENED_DEFAULT,
  MONTY_TRIAL_MIN,
  MONTY_TRIAL_MAX,
  MONTY_TRIAL_DEFAULT,
  MONTY_SEED_DEFAULT,
  CONVERGENCE_FIRST_TRIAL,
  model_calculate_opened_max,
  model_calculate_remaining_count,
  model_calculate_stay_win_rate,
  model_calculate_switch_win_rate,
  model_calculate_switch_advantage,
  model_clamp_value,
  model_clamp_door_count,
  model_clamp_opened_count,
  model_clamp_trial_count,
  model_clamp_seed,
  sim_run_convergence,
} from './model.js';

import { num_calculate_decimal_digits, num_format_count, num_format_plural } from '../_shared/numbers.js';
import { ticks_calculate_step, ticks_build_decade } from '../_shared/ticks.js';
import { canvas_read_css_color, canvas_setup_context } from '../_shared/canvas.js';
import { urlstate_read_numbers, urlstate_write } from '../_shared/urlstate.js';
import { control_build_button_group } from '../_shared/controls.js';

// ── DOM 훅 ─────────────────────────────────────────────────
const ROOT_SELECTOR = '[data-widget="monty-hall-n-doors"]';

// ── URL 쿼리 키 ────────────────────────────────────────────
const URL_KEY_DOORS = 'doors';
const URL_KEY_OPENED = 'opened';
const URL_KEY_TRIALS = 'trials';
const URL_KEY_SEED = 'seed';

// ── 시행 횟수 슬라이더 ──────────────────────────────────────
// 1-2-5 배열로 끊어 슬라이더가 언제나 눈에 익은 값을 준다.
// (연속 로그 매핑은 9,772 같은 값을 만들어 x축 10의 거듭제곱 라벨과 어긋난다)
const TRIAL_STEP_LIST = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
const TRIAL_SLIDER_MIN = 0;
const TRIAL_SLIDER_STEP = 1;

// ── 그래프 치수 ────────────────────────────────────────────
const CHART_HEIGHT_PX = 320;
const CHART_PAD_TOP = 16;
const CHART_PAD_RIGHT = 14;
const CHART_PAD_BOTTOM = 54; // x축 눈금 + 축 제목
const CHART_PAD_LEFT = 74; // y축 눈금 + 세로 축 제목
const CHART_AXIS_TITLE_GAP = 16;
const CHART_X_TICK_MIN_GAP = 0.12; // 양 끝 라벨과 이만큼(로그 폭 비율)은 떨어져야 찍는다
const CHART_LABEL_MIN_GAP_PX = 8; // 라벨끼리 최소한 이만큼 벌어져야 한다
// y축 자동 스케일. N이 커지면 승률이 1% 근처로 눌리는데
// 0~100% 고정 축에서는 두 곡선이 바닥에 붙어 구분되지 않는다.
const CHART_SCALE_PAD_RATIO = 0.35; // 위아래 여유
const CHART_SCALE_MIN_SPAN = 0.005; // 최소 표시 폭 (두 값이 거의 같을 때)

// 축 경계를 캡션에 찍을 때 허용하는 반올림 오차 (축 폭 대비).
// 이 값을 넘으면 자릿수를 늘린다 — 캡션이 그림과 갈라지는 것을 막는 유일한 장치다.
const AXIS_BOUND_MAX_ERROR_RATIO = 0.01;
const AXIS_BOUND_DIGITS_MAX = 4;

// 두 이론선이 이보다 가깝게 붙으면 눈으로 구분할 수 없다.
// 축을 더 조여 붙이면 노이즈가 큰 실측 곡선이 창 밖으로 나가버리므로,
// 화면을 속이는 대신 "이 설정에서는 분해되지 않는다"고 캡션에 적는다.
const CHART_LINES_MERGED_PX = 4;
// 축 산정에는 마지막 한 데케이드만 쓴다.
// 표본점이 로그 간격이라 '뒤쪽 몇 %' 로 자르면 실제로는 시행 10회 지점이 잡힌다.
const CHART_SCALE_SETTLED_FRACTION = 0.1;

// x축 왼쪽은 **언제나 첫 시행**이다. 곡선이 창 안에 들어오는 지점에서 축을 시작하면
// 시행을 늘릴수록 좌측 끝이 오른쪽으로 밀린다 — 데이터를 더 모았는데 보여주는 구간이
// 줄어드는 것처럼 읽히고, 두 설정을 나란히 놓고 비교할 수도 없다.
// (측정: N=49·K=27에서 좌측 끝이 시행 1,000→1, 10,000→53, 100,000→542, 1,000,000→1,564)
// 그리지 않는 구간은 그대로 비워 둔다. 비워 두되 **왜 비었는지를 그림 안에 적는다.**
const CHART_X_AXIS_START = CONVERGENCE_FIRST_TRIAL;

const CHART_RATE_FLOOR = 0;
const CHART_RATE_CEILING = 1;
const CHART_CURVE_WIDTH = 2;
const CHART_CURVE_WIDTH_ALT = 3.5; // stay 곡선. 색 말고 굵기로도 구분되게 한다
const CHART_THEORY_WIDTH = 1.5;
const CHART_THEORY_DASH = [5, 4];
const CHART_GRID_WIDTH = 1;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
// 12px 글꼴 한 줄이 차지하는 세로 폭. 캔버스는 글자 높이를 재주지 않는다.
const CHART_LABEL_HEIGHT_PX = 12;

// ── 비어 있는 왼쪽 구간 ────────────────────────────────────
// 축을 1로 고정하면 곡선이 아직 창 밖인 왼쪽이 빈다. 그냥 비워 두면 독자는
// "여기 데이터가 없나?"로 읽는다. 옅은 띠 + 경계선 + 그 안의 글자로 답을 그림 안에 둔다.
// (툴팁 뒤에 숨기지 않는다 — 독자의 10~15%만 인터랙션을 건드린다)
const CHART_BLANK_EDGE_DASH = [3, 3];
const CHART_BLANK_LABEL_PAD_PX = 8;
const CHART_BLANK_LABEL_TOP_PX = 6;
const CHART_BLANK_LABEL_SHORT = 'Too jumpy';

// ── 그림 안의 계열 이름 ────────────────────────────────────
// 범례까지 눈을 옮기지 않아도 어느 선이 무엇인지 알게 한다.
const CHART_SERIES_TITLE_SWITCH = 'Switch';
const CHART_SERIES_TITLE_STAY = 'Stay';
const CHART_SERIES_LABEL_PAD_PX = 6; // 오른쪽 끝에서 안쪽으로
const CHART_SERIES_LABEL_GAP_PX = 4; // 선과 글자 사이
const CHART_SERIES_LABEL_BOX_PAD_PX = 3; // 글자 뒤 바탕색 상자의 여백

// ── 색 토큰 (global.css에서 읽는다. 다크 토큰이 추가되면 자동으로 따라간다) ──
const COLOR_VAR_SWITCH = '--series-1';
const COLOR_VAR_STAY = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
// 비어 있는 구간의 띠와, 그림 안 계열 이름 뒤에 까는 바탕.
// 판정 3색(--hold/--edge/--break)도 계열색도 쓰지 않는다 — 그 색들은 다른 뜻을 갖고 있다.
const COLOR_VAR_BLANK = '--paper-sunk';
const COLOR_VAR_SURFACE = '--surface';
const COLOR_FALLBACK_SWITCH = '#1f4e79';
const COLOR_FALLBACK_STAY = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_TEXT = '#5f666b';
const COLOR_FALLBACK_BLANK = '#f0f0ea';
const COLOR_FALLBACK_SURFACE = '#ffffff';

// 축 제목 (모든 위젯이 축에 이름을 단다)
const CHART_TITLE_Y = 'Share of games won';
const CHART_TITLE_X = 'Games played (each mark is 10×)';

// 범례에서 **선 종류의 뜻**을 적는 문장. 축 문장과 분리해 상수로 둔다 —
// 캔버스가 화면에 없으면(숨긴 탭·display:none) 렌더가 null을 내는데,
// 그때 범례 전체를 비우면 색 견본만 남고 무엇이 무엇인지 사라진다.
const LEGEND_KEY_TEXT = 'Dashed = what the math says. Solid = the score so far in the games played.';

// ── 표시 형식 ──────────────────────────────────────────────
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
// 승률이 작을 때는 자릿수를 늘린다. N=100·K=1의 1.01% vs 1.00% 차이가
// 이 페이지의 핵심인데 소수 한 자리로는 둘 다 "1.0%"가 되어 사라진다.
const PERCENT_SMALL_THRESHOLD = 0.1;
const PERCENT_SMALL_DIGITS = 2;
// 눈금 라벨 자릿수·눈금 간격·픽셀비 상한은 `_shared/`가 정한다.
// 같은 상수를 여기 다시 두면, 나중에 죽은 쪽을 고치고 고쳤다고 믿게 된다.
const ADVANTAGE_DIGITS = 2;
const RECOMPUTE_DELAY_MS = 120;

// ── 민감도 표에 쓸 문 개수 ──────────────────────────────────
const SENSITIVITY_DOOR_LIST = [3, 5, 10, 25, 50, 100];

// ── 프리셋 ─────────────────────────────────────────────────
// 셋 다 K = 1(host가 문 하나만 연다)로 고정하고 N만 키운다 — 남는 문이
// 많아질수록 스위치가 그 많은 문에 얇게 퍼져 이득비가 1배로 가라앉는다.
// 그렇게 세 판정 구간(hold/edge/break)을 대표하는 (N, K) 조합을 고른다.
// 실측(model_calculate_switch_advantage, 시행 횟수·시드는 건드리지 않는다):
//   N=3·K=1 → 2.000배(hold 경계) / N=10·K=1 → 1.125배(edge) / N=100·K=1 → 1.010배(break)
/**
 * Stay 카드 아래 한 줄. 다른 카드는 "exact — simulated x"를 쓰는데 이 카드만 다르다.
 * stay 승률은 정확히 1/N이고 **K에 전혀 의존하지 않는다** — 호스트가 몇 문을 열든
 * 처음 고른 문이 상품일 확률은 그대로다. 이 불변성이 글의 논지 자체인데 화면이
 * 한 번도 말하지 않았다. 시뮬레이션 값은 그림의 실선이 계속 보여준다.
 */
const STAY_INVARIANT_NOTE = '1 out of N — the doors he opens never change this';

/** 민감도 표에서 행 제목이 되는 칸의 자리. 첫 칸(문 개수)이다. */
const ROW_HEADER_INDEX = 0;

/** 위젯 맨 위 한 줄 — 이 모델이 지키는 규칙과, 드래그 말고 다른 조작 경로. */
const WIDGET_RULE_LINE =
  'In this model the host knows where the prize is and opens only losing doors — ' +
  'never the door you picked, never the prize. Each slider takes arrow keys; ' +
  'a preset button jumps to a setting in one press.';

const PRESET_GROUP_LABEL = 'Try a setup';
const MONTY_PRESETS = [
  // 교과서 그 문제. 이득비 정확히 2배 — hold 구간의 경계 값.
  { key: 'classic', label: 'Classic problem (3 doors)', doorCount: 3, openedCount: 1 },
  // 문 10개 중 하나만 연다 — 이득비 1.125배, edge 구간.
  { key: 'ten-doors', label: '10 doors, one opened', doorCount: 10, openedCount: 1 },
  // 문 100개 중에서도 딱 하나만 연다 — 남는 99문에 스위치 확률이 흩어져
  // 이득비가 1.01배까지 가라앉는다(break 구간). "문이 많으면 유리하다"는
  // 직관과 반대로, 여는 문 수가 늘지 않으면 오히려 이득이 사라진다.
  { key: 'hundred-doors', label: '100 doors, one opened', doorCount: 100, openedCount: 1 },
];

/**
 * 지금 슬라이더 값과 똑같은 프리셋의 key. 없으면 null.
 * 순수 함수로 빼둔다 — DOM 없이 시험할 수 있어야 "칩이 안 눌린다"가 다시 안 샌다.
 */
export function preset_check_matching(doorCount, openedCount) {
  const found = MONTY_PRESETS.find(
    (entry) => entry.doorCount === doorCount && entry.openedCount === openedCount
  );
  return found ? found.key : null;
}

// ── 판정 배너 임계값 ────────────────────────────────────────
// 사이트의 hold/edge/break 논지를 이 위젯에 적용한 것.
// 여기서 시험대에 오르는 통념은 "바꾸면 크게 이득"이다.
// 이득비 2배(3문 교과서 값)면 통념 성립, 1.1배 미만이면 통념이 깨진 구간.
const VERDICT_HOLD_MIN_ADVANTAGE = 2;
const VERDICT_EDGE_MIN_ADVANTAGE = 1.1;

// 판정 한 줄. 배너의 첫 문장이 결론이어야 한다 — 숫자를 찾아 읽게 만들지 않는다.
// 주어는 언제나 모델이다. "바꾸는 게 낫다"가 아니라 "모델이 ~라고 놓는다".
const VERDICT_HEADLINE = {
  hold: 'The classic 2× gap holds:',
  edge: 'The gap is shrinking:',
  break: 'The gap is nearly gone:',
};

/** 0~1 값을 백분율 문자열로. 작은 값은 자릿수를 한 자리 더 준다. */
export function display_format_percent(rate) {
  const digits = rate < PERCENT_SMALL_THRESHOLD ? PERCENT_SMALL_DIGITS : PERCENT_DIGITS;
  return `${(rate * PERCENT_SCALE).toFixed(digits)}%`;
}

/**
 * 눈금 간격을 오차 없이 표기하는 데 필요한 소수 자릿수.
 * step=1%p면 0자리, 2.5%p면 1자리, 0.25%p면 2자리.
 */
export function display_calculate_tick_digits(step) {
  return num_calculate_decimal_digits(step * PERCENT_SCALE);
}

/**
 * 축 눈금용 백분율. 간격이 정확히 표기되는 자릿수를 쓴다.
 * (크기 구간으로 자릿수를 정하면 7.5%가 "8%"로 나가 화면의 숫자가 거짓이 된다)
 */
export function display_format_percent_tick(rate, step = 1 / PERCENT_SCALE) {
  return `${(rate * PERCENT_SCALE).toFixed(display_calculate_tick_digits(step))}%`;
}

/**
 * 축 **경계** 표기에 필요한 소수 자릿수.
 *
 * 눈금 라벨과 규칙이 다르다. 눈금은 간격의 배수라 간격의 정밀도로 정확히 찍히지만,
 * **축 경계는 데이터에서 나온 값이라 눈금 배수가 아니다** (`chart_calculate_scale`이
 * 눈금 배수로 스냅하지 않는 것은 의도된 설계다). 그 값을 간격의 자릿수로 찍으면
 * 반올림이 값을 바꾼다 — 3.4133%가 "3%"로 나가 캡션이 그림과 갈라진다.
 *
 * 그래서 자릿수를 축 폭에 맞춘다: 반올림 오차가 축 폭의 `AXIS_BOUND_MAX_ERROR_RATIO`를
 * 넘지 않는 최소 자릿수. 폭이 좁아지면 자릿수가 저절로 늘어난다.
 */
export function display_calculate_bound_digits(span, step = 1 / PERCENT_SCALE) {
  const spanPercent = Math.abs(span) * PERCENT_SCALE;
  const tolerance = spanPercent * AXIS_BOUND_MAX_ERROR_RATIO;
  const needed = tolerance > 0 ? Math.ceil(Math.log10(1 / tolerance)) : AXIS_BOUND_DIGITS_MAX;
  // 아래의 `Math.max`는 **지금 차트에서는 한 번도 결정을 바꾸지 않는다** — 실제 축
  // 스팬 783개 전수에서 `needed`가 언제나 눈금 자릿수 이상이었다(간격이 대략 스팬의
  // 1/5이라 구조적으로 그렇다). 그래도 남긴다: 이 함수는 export된 공개 함수이고
  // 스팬과 간격을 **따로** 받는다. 차트가 주지 않는 조합(예: 스팬 1, 간격 0.025)이
  // 들어오면 눈금 자릿수 쪽이 더 크고, 이것을 지우면 "간격은 적어도 정확히 찍는다"는
  // 약속이 조용히 깨진다. `chart_calculate_scale`이 간격 규칙을 바꾸는 날 그렇게 된다.
  // 그 조합을 caption.test.js가 리터럴로 못박고 있다 — 지우면 그 테스트가 죽는다.
  const digits = Math.max(display_calculate_tick_digits(step), needed);
  return model_clamp_value(digits, 0, AXIS_BOUND_DIGITS_MAX);
}

/**
 * 축 경계용 백분율. **캡션이 인용하는 값은 렌더가 실제로 쓴 값이어야 한다**는
 * 규약을 지키려면 값을 넘겨받는 것만으로는 부족하고, 그 값을 거짓 없이 찍어야 한다.
 */
export function display_format_percent_bound(rate, span, step = 1 / PERCENT_SCALE) {
  return `${(rate * PERCENT_SCALE).toFixed(display_calculate_bound_digits(span, step))}%`;
}

/** 큰 정수를 천 단위 구분해서. */
export const display_format_count = num_format_count;

/** 슬라이더 위치 → 실제 시행 횟수. */
export function slider_calculate_trial_count(sliderValue) {
  const index = Math.round(model_clamp_value(sliderValue, TRIAL_SLIDER_MIN, TRIAL_STEP_LIST.length - 1));
  return model_clamp_trial_count(TRIAL_STEP_LIST[index]);
}

/** 실제 시행 횟수 → 가장 가까운 슬라이더 위치. */
export function slider_calculate_trial_position(trialCount) {
  let bestIndex = TRIAL_SLIDER_MIN;
  let bestGap = Number.POSITIVE_INFINITY;
  TRIAL_STEP_LIST.forEach((stepValue, index) => {
    const gap = Math.abs(Math.log(stepValue) - Math.log(trialCount));
    if (gap < bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** URL 쿼리스트링에서 상태를 읽는다. 없거나 깨졌으면 기본값. */
export function url_read_state(search) {
  // K의 유효범위가 N에 따라 변하므로 두 번에 나눠 읽는다.
  const first = urlstate_read_numbers(search, {
    [URL_KEY_DOORS]: { fallback: MONTY_DOOR_DEFAULT, clamp: model_clamp_door_count },
  });
  const doors = first[URL_KEY_DOORS];
  const rest = urlstate_read_numbers(search, {
    [URL_KEY_OPENED]: {
      fallback: MONTY_OPENED_DEFAULT,
      clamp: (value) => model_clamp_opened_count(value, doors),
    },
    [URL_KEY_TRIALS]: { fallback: MONTY_TRIAL_DEFAULT, clamp: model_clamp_trial_count },
    [URL_KEY_SEED]: { fallback: MONTY_SEED_DEFAULT, clamp: model_clamp_seed },
  });
  return {
    doorCount: doors,
    openedCount: rest[URL_KEY_OPENED],
    trialCount: rest[URL_KEY_TRIALS],
    seed: rest[URL_KEY_SEED],
  };
}

/** 현재 상태를 주소창에 쓴다. 히스토리를 쌓지 않는다. */
export function url_write_state(state) {
  urlstate_write({
    [URL_KEY_DOORS]: state.doorCount,
    [URL_KEY_OPENED]: state.openedCount,
    [URL_KEY_TRIALS]: state.trialCount,
    [URL_KEY_SEED]: state.seed,
  });
}

/** CSS 변수에서 색을 읽는다. 공통 모듈을 그대로 쓴다. */
const chart_read_color = canvas_read_css_color;

/**
 * 이득비를 hold / edge / break 로 판정한다.
 * 이 위젯이 시험하는 통념은 "바꾸면 크게 이득"이다.
 */
export function state_calculate_verdict(advantage) {
  if (advantage >= VERDICT_HOLD_MIN_ADVANTAGE) return 'hold';
  if (advantage >= VERDICT_EDGE_MIN_ADVANTAGE) return 'edge';
  return 'break';
}

/** 눈금 간격을 1-2-2.5-5 계열의 보기 좋은 값으로 고른다. 공통 모듈을 그대로 쓴다. */
export const chart_calculate_tick_step = ticks_calculate_step;

/**
 * y축 범위를 데이터에 맞춰 정한다.
 * 이론값 두 개와, 수렴이 끝난 뒷구간의 실측값만 본다.
 * 시행 초반의 0%/100% 요동까지 넣으면 축이 언제나 0~100%로 벌어져 의미가 없다.
 */
export function chart_calculate_scale(result) {
  const values = [result.stayWinRateTheory, result.switchWinRateTheory];
  const settledFrom = result.trialCount * CHART_SCALE_SETTLED_FRACTION;
  for (const point of result.points) {
    if (point.trial >= settledFrom) values.push(point.stayWinRate, point.switchWinRate);
  }

  let low = Math.min(...values);
  let high = Math.max(...values);

  if (high - low < CHART_SCALE_MIN_SPAN) {
    const middle = (low + high) / 2;
    low = middle - CHART_SCALE_MIN_SPAN / 2;
    high = middle + CHART_SCALE_MIN_SPAN / 2;
  }

  const pad = (high - low) * CHART_SCALE_PAD_RATIO;
  const rateMin = Math.max(CHART_RATE_FLOOR, low - pad);
  const rateMax = Math.min(CHART_RATE_CEILING, high + pad);

  // 축 경계는 데이터에 맞춘다. 눈금 배수로 경계를 바깥으로 스냅하면
  // 0.18~0.82 같은 범위가 0~1로 벌어져 애써 확대한 것이 도로 풀린다.
  return { rateMin, rateMax, step: chart_calculate_tick_step(rateMax - rateMin) };
}

/**
 * 그래프를 시작할 시행 횟수를 고른다.
 *
 * 시행 초반의 running average는 0%~100%를 오간다. 축을 확대해 놓으면 그 구간이
 * 창 안팎을 넘나들며 세로 줄무늬만 남기고, 축이 고장난 것처럼 보인다.
 * 곡선이 축 범위 안으로 들어와 '계속 머무는' 지점을 찾아 거기서부터 그린다.
 */
export function chart_calculate_plot_start(result, scale) {
  const points = result.points;
  if (points.length === 0) return 1;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    const outside =
      point.stayWinRate < scale.rateMin ||
      point.stayWinRate > scale.rateMax ||
      point.switchWinRate < scale.rateMin ||
      point.switchWinRate > scale.rateMax;
    if (outside) return points[Math.min(i + 1, points.length - 1)].trial;
  }
  return points[0].trial;
}

/**
 * 두 이론선이 화면에서 몇 픽셀 떨어지는가.
 * 이 값이 작으면 차트로는 두 전략을 구분할 수 없다 — 숨기지 말고 그렇다고 말해야 한다.
 */
export function chart_calculate_line_gap_px(result, scale, plotHeight) {
  const span = scale.rateMax - scale.rateMin;
  if (!(span > 0)) return 0;
  const gap = Math.abs(result.switchWinRateTheory - result.stayWinRateTheory);
  return (gap / span) * plotHeight;
}

/**
 * 시행 횟수(로그) → 캔버스 x 좌표.
 * **축의 양 끝을 받는다.** 곡선이 시작하는 지점이 아니다 — 축은 언제나 첫 시행에서
 * 시작하고, 곡선의 시작점은 어디서부터 선을 긋느냐만 정한다.
 */
function chart_calculate_x(trial, axisStart, axisEnd, plotWidth) {
  const logStart = Math.log(axisStart);
  const logSpan = Math.log(axisEnd) - logStart;
  const ratio = logSpan <= 0 ? 1 : (Math.log(trial) - logStart) / logSpan;
  return CHART_PAD_LEFT + plotWidth * ratio;
}

/**
 * 비어 있는 왼쪽 띠 안에 적을 문구를 고른다.
 * 띠 폭에 들어가는 가장 긴 것을 쓰고, 어느 것도 안 들어가면 빈 문자열 —
 * 글자를 밀어 넣어 축 위로 올라타게 하지 않는다 (라벨은 밀지 말고 버린다).
 * 폭 재기를 인자로 받아 캔버스 없이도 계측할 수 있게 한다.
 */
export function chart_pick_blank_label(startTrial, bandWidthPx, measureWidth) {
  if (!(startTrial > CHART_X_AXIS_START) || !(bandWidthPx > 0)) return '';
  const room = bandWidthPx - CHART_BLANK_LABEL_PAD_PX * 2;
  const candidates = [
    `Too jumpy before game ${display_format_count(startTrial)}`,
    CHART_BLANK_LABEL_SHORT,
  ];
  for (const text of candidates) {
    if (measureWidth(text) <= room) return text;
  }
  return '';
}

/**
 * x축 눈금 위치. 10의 거듭제곱을 쓰되 양 끝(실제 그린 구간)도 항상 표시한다.
 * 끝값과 너무 붙는 거듭제곱은 라벨이 겹치므로 뺀다.
 */
export function chart_calculate_x_ticks(startTrial, trialCount) {
  return ticks_build_decade(startTrial, trialCount, CHART_X_TICK_MIN_GAP);
}

/** 승률 → 캔버스 y 좌표. */
function chart_calculate_y(rate, plotHeight, scale) {
  const ratio = (rate - scale.rateMin) / (scale.rateMax - scale.rateMin);
  return CHART_PAD_TOP + plotHeight * (1 - ratio);
}

/**
 * 수렴 곡선을 그린다.
 * 몬테카를로 두 줄 + 이론값 두 줄(점선). 둘이 겹쳐야 모델이 맞는 것이다.
 */
export function chart_render_convergence(canvasEl, result) {
  const surface = canvas_setup_context(canvasEl, CHART_HEIGHT_PX);
  if (!surface) return null;
  const { context, width: cssWidth, height: cssHeight } = surface;

  const plotWidth = cssWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotHeight = cssHeight - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  if (plotWidth <= 0 || plotHeight <= 0) return null;

  const colorSwitch = chart_read_color(canvasEl, COLOR_VAR_SWITCH, COLOR_FALLBACK_SWITCH);
  const colorStay = chart_read_color(canvasEl, COLOR_VAR_STAY, COLOR_FALLBACK_STAY);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);
  const colorBlank = chart_read_color(canvasEl, COLOR_VAR_BLANK, COLOR_FALLBACK_BLANK);
  const colorSurface = chart_read_color(canvasEl, COLOR_VAR_SURFACE, COLOR_FALLBACK_SURFACE);

  const scale = chart_calculate_scale(result);
  const startTrial = chart_calculate_plot_start(result, scale);

  // 축은 설정과 무관하게 언제나 [첫 시행, 시행 수]다.
  const axisStart = CHART_X_AXIS_START;
  const axisEnd = result.trialCount;

  // 곡선이 아직 창 밖인 왼쪽 구간. 여기에는 실측 곡선을 그리지 않는다.
  const blankRight = chart_calculate_x(
    model_clamp_value(startTrial, axisStart, axisEnd),
    axisStart,
    axisEnd,
    plotWidth,
  );
  const blankWidth = Math.max(0, blankRight - CHART_PAD_LEFT);
  if (blankWidth > 0) {
    context.fillStyle = colorBlank;
    context.fillRect(CHART_PAD_LEFT, CHART_PAD_TOP, blankWidth, plotHeight);
  }

  // 가로 눈금선과 y축 라벨
  context.font = CHART_LABEL_FONT;
  context.textBaseline = 'middle';
  context.textAlign = 'right';
  const firstTick = Math.ceil(scale.rateMin / scale.step) * scale.step;
  const tickCount = Math.floor((scale.rateMax - firstTick) / scale.step);
  for (let i = 0; i <= tickCount; i += 1) {
    const rate = firstTick + scale.step * i;
    const y = chart_calculate_y(rate, plotHeight, scale);
    context.strokeStyle = colorGrid;
    context.lineWidth = CHART_GRID_WIDTH;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(CHART_PAD_LEFT, y);
    context.lineTo(CHART_PAD_LEFT + plotWidth, y);
    context.stroke();
    context.fillStyle = colorText;
    context.fillText(
      display_format_percent_tick(rate, scale.step),
      CHART_PAD_LEFT - CHART_LABEL_GAP,
      y,
    );
  }

  // x축 라벨.
  // 겹칠 때 옆으로 밀면 앞 라벨 위로 올라타 뭉개진다. 겹치는 눈금은 버린다.
  // 양 끝(실제로 그린 구간)은 반드시 남기고, 가운데 눈금부터 희생시킨다.
  context.textAlign = 'center';
  context.textBaseline = 'top';
  const xTicks = chart_calculate_x_ticks(axisStart, axisEnd);
  const placed = xTicks.map((trial) => {
    const labelText = display_format_count(trial);
    const halfWidth = context.measureText(labelText).width / 2;
    const x = model_clamp_value(
      chart_calculate_x(trial, axisStart, axisEnd, plotWidth),
      halfWidth,
      cssWidth - halfWidth,
    );
    return { labelText, halfWidth, x, keep: true };
  });
  for (let i = 1; i < placed.length - 1; i += 1) {
    const previous = placed.slice(0, i).filter((label) => label.keep).pop();
    const next = placed[placed.length - 1];
    const clearsPrevious =
      !previous || placed[i].x - placed[i].halfWidth >= previous.x + previous.halfWidth + CHART_LABEL_MIN_GAP_PX;
    const clearsNext = next.x - next.halfWidth >= placed[i].x + placed[i].halfWidth + CHART_LABEL_MIN_GAP_PX;
    placed[i].keep = clearsPrevious && clearsNext;
  }
  // 양 끝끼리 겹치면 시작 라벨을 버린다 (끝값이 더 중요하다)
  if (placed.length > 1) {
    const first = placed[0];
    const last = placed[placed.length - 1];
    if (last.x - last.halfWidth < first.x + first.halfWidth + CHART_LABEL_MIN_GAP_PX) first.keep = false;
  }
  context.fillStyle = colorText;
  for (const label of placed) {
    if (label.keep) context.fillText(label.labelText, label.x, CHART_PAD_TOP + plotHeight + CHART_LABEL_GAP);
  }

  // 축 제목 — 축에는 언제나 이름을 단다
  context.fillStyle = colorAxis;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillText(CHART_TITLE_X, CHART_PAD_LEFT + plotWidth / 2, cssHeight);

  context.save();
  context.translate(CHART_AXIS_TITLE_GAP, CHART_PAD_TOP + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(CHART_TITLE_Y, 0, 0);
  context.restore();

  // 축 범위를 벗어난 초반 요동은 그리지 않는다 (억지로 눌러 붙이면 거짓 평평한 선이 된다)
  context.save();
  context.beginPath();
  context.rect(CHART_PAD_LEFT, CHART_PAD_TOP, plotWidth, plotHeight);
  context.clip();

  // 비어 있는 왼쪽의 경계와 설명. **왜 비었는지를 그림 안에서 답한다.**
  if (blankWidth > 0) {
    context.strokeStyle = colorText;
    context.lineWidth = CHART_GRID_WIDTH;
    context.setLineDash(CHART_BLANK_EDGE_DASH);
    context.beginPath();
    context.moveTo(blankRight, CHART_PAD_TOP);
    context.lineTo(blankRight, CHART_PAD_TOP + plotHeight);
    context.stroke();
    context.setLineDash([]);

    const blankLabel = chart_pick_blank_label(startTrial, blankWidth, (text) => context.measureText(text).width);
    if (blankLabel) {
      context.fillStyle = colorText;
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillText(
        blankLabel,
        CHART_PAD_LEFT + CHART_BLANK_LABEL_PAD_PX,
        CHART_PAD_TOP + CHART_BLANK_LABEL_TOP_PX,
      );
    }
  }

  // 이론값 수평선
  const theoryLines = [
    { rate: result.switchWinRateTheory, color: colorSwitch },
    { rate: result.stayWinRateTheory, color: colorStay },
  ];
  context.setLineDash(CHART_THEORY_DASH);
  context.lineWidth = CHART_THEORY_WIDTH;
  for (const line of theoryLines) {
    const y = chart_calculate_y(line.rate, plotHeight, scale);
    context.strokeStyle = line.color;
    context.beginPath();
    context.moveTo(CHART_PAD_LEFT, y);
    context.lineTo(CHART_PAD_LEFT + plotWidth, y);
    context.stroke();
  }

  // 몬테카를로 곡선.
  // 두 계열을 색으로만 가르면 색각이상에서 구분되지 않는다.
  // stay 쪽에 굵기 차이를 줘서 형태로도 갈리게 한다.
  const curves = [
    { key: 'switchWinRate', color: colorSwitch, width: CHART_CURVE_WIDTH },
    { key: 'stayWinRate', color: colorStay, width: CHART_CURVE_WIDTH_ALT },
  ];
  context.setLineDash([]);
  context.lineJoin = 'round';
  for (const curve of curves) {
    context.lineWidth = curve.width;
    context.strokeStyle = curve.color;
    context.beginPath();
    let started = false;
    for (const point of result.points) {
      if (point.trial < startTrial) continue;
      const x = chart_calculate_x(point.trial, axisStart, axisEnd, plotWidth);
      const y = chart_calculate_y(point[curve.key], plotHeight, scale);
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
  }

  // 그림 안에 계열 이름을 적는다. 범례까지 눈을 옮기지 않아도 어느 선이 무엇인지 알게 한다.
  // 이득비는 1 이상이라 switch 선은 언제나 stay 선 위(또는 같은 높이)에 있다.
  // 위쪽 선은 위에, 아래쪽 선은 아래에 붙여 두 선이 붙어도 글자가 겹치지 않는다.
  const labelRight = CHART_PAD_LEFT + plotWidth - CHART_SERIES_LABEL_PAD_PX;
  const plotBottom = CHART_PAD_TOP + plotHeight;
  const seriesTitles = [
    { text: CHART_SERIES_TITLE_SWITCH, rate: result.switchWinRateTheory, color: colorSwitch, above: true },
    { text: CHART_SERIES_TITLE_STAY, rate: result.stayWinRateTheory, color: colorStay, above: false },
  ];
  context.textAlign = 'right';
  context.textBaseline = 'top';
  for (const title of seriesTitles) {
    const lineY = chart_calculate_y(title.rate, plotHeight, scale);
    const aboveTop = lineY - CHART_SERIES_LABEL_GAP_PX - CHART_LABEL_HEIGHT_PX;
    const belowTop = lineY + CHART_SERIES_LABEL_GAP_PX;
    // 선호하는 쪽이 그림 밖으로 나가면 반대쪽으로 뒤집는다. 잘려 나가면 이름이 사라진다.
    let top = title.above ? aboveTop : belowTop;
    if (top < CHART_PAD_TOP) top = belowTop;
    if (top + CHART_LABEL_HEIGHT_PX > plotBottom) top = aboveTop;
    const textWidth = context.measureText(title.text).width;
    // 곡선 위에 얹히면 글자가 읽히지 않는다. 바탕색을 먼저 깔고 그 위에 쓴다.
    context.fillStyle = colorSurface;
    context.fillRect(
      labelRight - textWidth - CHART_SERIES_LABEL_BOX_PAD_PX,
      top - CHART_SERIES_LABEL_BOX_PAD_PX,
      textWidth + CHART_SERIES_LABEL_BOX_PAD_PX * 2,
      CHART_LABEL_HEIGHT_PX + CHART_SERIES_LABEL_BOX_PAD_PX * 2,
    );
    context.fillStyle = title.color;
    context.fillText(title.text, labelRight, top);
  }

  context.restore();

  // 캡션이 실제로 그린 축을 그대로 인용할 수 있게 돌려준다.
  return {
    scale,
    axisStart,
    axisEnd,
    startTrial,
    blankWidthPx: blankWidth,
    lineGapPx: chart_calculate_line_gap_px(result, scale, plotHeight),
  };
}

/**
 * 슬라이더 한 줄을 만든다.
 * 설명(hint)을 라벨 바로 아래 붙인다 — 조작하는 자리에서 뜻을 알 수 있어야 한다.
 */
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
  // <output>은 암묵적으로 live region이다. 슬라이더 하나를 끌 때마다
  // 값 3개 + 판정문이 순차 발화되지 않도록 끈다. 발화는 판정문 하나로 모은다.
  output.setAttribute('aria-live', 'off');

  row.append(labelBox, input, output);
  return { row, input, output };
}

/**
 * 읽기값 카드 하나를 만든다.
 * 값과 단위를 한 줄에 두어 카드 높이를 낮춘다 — 슬라이더 옆에 세로로 쌓기 위함.
 */
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

  line.append(value, unit);
  box.append(label, line);
  // 단위 줄도 돌려준다 — 큰 숫자(모델의 값) 밑에 작은 글씨로 대조값을 붙이려면
  // 갱신할 수 있어야 한다. 카드 안에서 무엇이 주인지 크기로 갈린다.
  return { box, value, unit };
}

/**
 * 민감도 표를 그린다. 슬라이더를 안 움직이는 독자도 경향을 보게 하는 장치.
 * 호스트가 열 수 있는 최대치(K = N-2)에서 문 개수만 바꿔가며 비교한다.
 */
function display_render_sensitivity(tableBodyEl, currentDoorCount) {
  tableBodyEl.textContent = '';
  for (const doorCount of SENSITIVITY_DOOR_LIST) {
    const openedCount = model_calculate_opened_max(doorCount);
    const row = document.createElement('tr');
    if (doorCount === currentDoorCount) row.setAttribute('aria-current', 'true');
    const cells = [
      display_format_count(doorCount),
      display_format_count(openedCount),
      display_format_percent(model_calculate_stay_win_rate(doorCount)),
      display_format_percent(model_calculate_switch_win_rate(doorCount, openedCount)),
      `${model_calculate_switch_advantage(doorCount, openedCount).toFixed(ADVANTAGE_DIGITS)}×`,
    ];
    cells.forEach((text, index) => {
      // 첫 칸은 행 제목이다. 전부 <td>로 두면 스크린리더가 나머지 칸을 읽을 때
      // 그것이 몇 문짜리 행인지 말해주지 못한다 (WCAG 1.3.1).
      const cell = document.createElement(index === ROW_HEADER_INDEX ? 'th' : 'td');
      if (index === ROW_HEADER_INDEX) cell.setAttribute('scope', 'row');
      cell.textContent = text;
      row.appendChild(cell);
    });
    tableBodyEl.appendChild(row);
  }
}

/** 위젯 전체를 만들고 첫 렌더까지 끝낸다. 빈 폼 상태로 두지 않는다. 해제 함수를 돌려준다. */
export function widget_mount(rootEl) {
  if (!rootEl) return null;
  // 모듈이 두 번 평가되면(HMR, 스크립트 중복) 같은 자리에 위젯이 두 벌 붙는다.
  if (rootEl.dataset.mounted === 'true') return null;
  rootEl.dataset.mounted = 'true';

  const initialState = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  rootEl.classList.add('widget');
  rootEl.textContent = '';

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Monty Hall simulator with N doors';

  const doorSlider = widget_build_slider(
    'monty-doors',
    'Number of doors',
    'How many doors the game starts with. One hides the prize. The working below calls this N.',
    { min: MONTY_DOOR_MIN, max: MONTY_DOOR_MAX, step: 1, value: initialState.doorCount },
  );
  const openedSlider = widget_build_slider(
    'monty-opened',
    'Doors the host opens',
    'Empty doors the host opens after your pick. Never your door, never the prize. ' +
      'Each one is one fewer door to swap to. The working below calls this K.',
    {
      min: MONTY_OPENED_MIN,
      max: model_calculate_opened_max(initialState.doorCount),
      step: 1,
      value: initialState.openedCount,
    },
  );
  const trialSlider = widget_build_slider(
    'monty-trials',
    'Games to play',
    'How many games the page plays. More games, steadier numbers.',
    {
      min: TRIAL_SLIDER_MIN,
      max: TRIAL_STEP_LIST.length - 1,
      step: TRIAL_SLIDER_STEP,
      value: slider_calculate_trial_position(initialState.trialCount),
    },
  );

  const canvas = document.createElement('canvas');
  canvas.className = 'widget-chart';
  canvas.setAttribute('role', 'img');

  const legend = document.createElement('p');
  legend.className = 'widget-legend';
  legend.innerHTML =
    '<span class="legend-key legend-switch"></span>Switch' +
    '<span class="legend-key legend-stay"></span>Stay';
  const legendNote = document.createElement('span');
  legendNote.className = 'legend-note';
  legend.appendChild(legendNote);

  // 카드 안의 위계: 큰 숫자는 **모델이 내는 정확한 값**, 그 밑 작은 글씨가 시뮬레이션의
  // 대조값이다. 그림의 점선/실선과 같은 짝이라 카드와 그래프가 같은 것을 말한다.
  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const switchReadout = widget_build_readout('Switch wins', '');
  const stayReadout = widget_build_readout('Stay wins', '');
  const advantageReadout = widget_build_readout('How much swapping helps', 'times as many wins as staying');
  // R = N − 1 − K. 이득비를 실제로 움직이는 값인데 지금까지 화면 어디에도 없었다 —
  // K를 늘려도 왜 이득이 줄어드는지를 이 숫자 하나가 설명한다.
  const remainingReadout = widget_build_readout(
    'Doors you could swap to',
    'not counting your own (R = N − 1 − K)',
  );
  readouts.append(switchReadout.box, stayReadout.box, advantageReadout.box, remainingReadout.box);

  // 판정 배너 — 첫 줄이 결론, 그 뒤가 근거. 굵은 글씨가 눈에 먼저 걸리게 한다.
  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  verdict.setAttribute('aria-live', 'polite');
  const verdictHeadline = document.createElement('strong');

  verdict.append(verdictHeadline);

  const table = document.createElement('table');
  table.className = 'widget-table';
  table.innerHTML =
    '<caption>What the door count does on its own. Here the host opens every door but ' +
    'one, so only the door count changes down the rows. Your current setting is the marked row.</caption>' +
    '<thead><tr><th scope="col">Doors</th><th scope="col">Opened</th>' +
    '<th scope="col">Stay</th><th scope="col">Switch</th><th scope="col">Ratio</th></tr></thead>' +
    '<tbody></tbody>';
  const tableBody = table.querySelector('tbody');

  // 표만 따로 스크롤. 페이지 전체에 가로 스크롤이 생기면 WCAG Reflow 위반이다.
  const tableScroll = document.createElement('div');
  tableScroll.className = 'widget-table-scroll';
  tableScroll.setAttribute('tabindex', '0');
  tableScroll.setAttribute('role', 'region');
  tableScroll.setAttribute('aria-label', 'Exact probabilities table');
  tableScroll.appendChild(table);

  // ── 프리셋 버튼 ──
  const presets = control_build_button_group(
    PRESET_GROUP_LABEL,
    MONTY_PRESETS.map((preset) => ({ key: preset.key, label: preset.label })),
  );

  // 규칙 한 줄. 독자가 무엇을 움직이는지 모른 채 움직이지 않게, 첫 컨트롤보다 위에 둔다.
  // 두 번째 문장은 드래그 말고도 길이 있다는 안내다 — 키보드·스위치 사용자에게
  // "드래그해 보라"는 지시는 성립하지 않는다.
  const rules = document.createElement('p');
  rules.className = 'widget-rules';
  rules.textContent = WIDGET_RULE_LINE;

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  // Trials는 위가 아니라 **그림 아래**로 간다. 컨트롤 묶음이 625px이면 슬라이더를
  // 움직여도 바뀌는 숫자가 폰 화면 밖이었다(첫 컨트롤 → 첫 판독값 894px > 844px).
  // Trials가 실제로 바꾸는 것은 곡선의 오른쪽 끝이므로, 그 축 바로 아래가 제자리다.
  controls.append(rules, presets.group, doorSlider.row, openedSlider.row);

  const trialControls = document.createElement('div');
  trialControls.className = 'widget-controls widget-controls-trailing';
  trialControls.append(trialSlider.row);

  // 순서가 곧 읽는 순서다. 조작 → 결론 한 줄 → 숫자 → 그림 → 범례 → 표.
  // 판정 배너를 그래프 아래에 두면 결론을 보려고 그림을 지나쳐 내려가야 한다.
  rootEl.append(heading, controls, verdict, readouts, canvas, legend, trialControls, tableScroll);

  let recomputeTimer = 0;

  function state_read_current() {
    const doorCount = model_clamp_door_count(Number(doorSlider.input.value));
    const openedMax = model_calculate_opened_max(doorCount);
    // 문 개수를 줄이면 K가 유효범위 밖으로 나갈 수 있다. 슬라이더 자체를 다시 맞춘다.
    openedSlider.input.max = String(openedMax);
    const openedCount = model_clamp_opened_count(Number(openedSlider.input.value), doorCount);
    openedSlider.input.value = String(openedCount);
    const trialCount = slider_calculate_trial_count(Number(trialSlider.input.value));
    return { doorCount, openedCount, trialCount, seed: initialState.seed };
  }

  function display_update_labels(state) {
    doorSlider.output.textContent = display_format_count(state.doorCount);
    openedSlider.output.textContent = display_format_count(state.openedCount);
    trialSlider.output.textContent = display_format_count(state.trialCount);

    // 시행 슬라이더는 값이 0~9(눈금 인덱스)라 스크린리더가 "9"로 읽는다.
    // 실제 의미를 aria-valuetext로 준다.
    // **단수는 공용 헬퍼가 고른다.** K의 기본값이 1이라 여기서는 기본 상태부터
    // "1 doors opened"가 발화됐다 — 화면에는 아무 표시도 나지 않는 결함이다.
    doorSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_count(state.doorCount)} ${num_format_plural(state.doorCount, 'door')}`,
    );
    openedSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_count(state.openedCount)} ${num_format_plural(state.openedCount, 'door')} opened`,
    );
    trialSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_count(state.trialCount)} ${num_format_plural(state.trialCount, 'trial')}`,
    );
  }

  // 마지막 시뮬레이션 결과. 창 크기만 바뀌었을 때 다시 돌리지 않기 위해 붙들어 둔다.
  let lastResult = null;
  let redrawTimer = 0;

  function widget_update() {
    const state = state_read_current();
    display_update_labels(state);

    // 슬라이더가 프리셋과 같은 값이면 그 칩을 눌린 상태로 둔다. 이게 빠져 있어서
    // aria-pressed가 영영 'false'였다 — 어느 설정을 보고 있는지 칩 줄에서 알 수 없었고,
    // 스크린리더에도 "선택됨"이 안 들렸다.
    const matchingPreset = preset_check_matching(state.doorCount, state.openedCount);
    for (const [key, button] of Object.entries(presets.buttons)) {
      button.setAttribute('aria-pressed', String(key === matchingPreset));
    }

    const result = sim_run_convergence(state.doorCount, state.openedCount, state.trialCount, {
      seed: state.seed,
    });
    lastResult = result;

    const advantage = model_calculate_switch_advantage(state.doorCount, state.openedCount);
    const remainingCount = model_calculate_remaining_count(state.doorCount, state.openedCount);

    // 큰 숫자는 모델의 정확한 값(그림의 점선), 작은 글씨가 시뮬레이션(그림의 실선)이다.
    switchReadout.value.textContent = display_format_percent(result.switchWinRateTheory);
    switchReadout.unit.textContent = `by the math — ${display_format_percent(result.switchWinRate)} in the games played`;
    stayReadout.value.textContent = display_format_percent(result.stayWinRateTheory);
    stayReadout.unit.textContent = STAY_INVARIANT_NOTE;
    advantageReadout.value.textContent = `${advantage.toFixed(ADVANTAGE_DIGITS)}×`;
    remainingReadout.value.textContent = display_format_count(remainingCount);

    // 판정 배너 — 사이트 시그니처. 통념("바꾸면 크게 이득")이 어느 구간에서 깨지는지.
    const verdictState = state_calculate_verdict(advantage);
    verdict.dataset.state = verdictState;

    // 첫 줄에 결론과 그 근거가 되는 숫자 하나. 나머지는 뒤 문장으로 민다.
    const headlineText =
      `${VERDICT_HEADLINE[verdictState]} the model has swapping win ` +
      `${advantage.toFixed(ADVANTAGE_DIGITS)}× as often as staying.`;
    // 그림에는 눈으로 못 읽는 독자를 위해 설정과 결과를 함께 적는다. 화면에는
    // 배너가 판정 한 줄만 싣고, 숫자는 바로 아래 판독 네 장이 진다.
    const chartLabel =
      `${headlineText} With ${display_format_count(state.doorCount)} ` +
      `${num_format_plural(state.doorCount, 'door')} and ${display_format_count(state.openedCount)} opened, ` +
      `${display_format_count(remainingCount)} ${num_format_plural(remainingCount, 'door is', 'doors are')} ` +
      `left to switch into. After ${display_format_count(state.trialCount)} simulated games the running ` +
      `averages are ${display_format_percent(result.switchWinRate)} and ` +
      `${display_format_percent(result.stayWinRate)}.`;
    verdictHeadline.textContent = headlineText;
    canvas.setAttribute('aria-label', chartLabel);

    display_render_sensitivity(tableBody, state.doorCount);
    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 시뮬레이션은 돌리지 않는다. */
  function widget_redraw() {
    if (!lastResult) return;
    const drawn = chart_render_convergence(canvas, lastResult);
    // 폭 0(숨긴 탭, `display:none`)이면 렌더가 null을 준다. 그때 **그냥 돌아가면
    // 범례 문구가 영영 빈 문자열로 남는다** — 색 견본만 있고 선 종류의 뜻이 없다.
    // 축을 인용하는 문장만 빼고, 그림과 무관한 범례 문구는 언제나 채운다.
    if (!drawn) {
      legendNote.textContent = LEGEND_KEY_TEXT;
      return;
    }
    const axisSpan = drawn.scale.rateMax - drawn.scale.rateMin;
    // 캡션이 말하는 축과 실제로 그린 축이 갈라지지 않도록 렌더가 쓴 값을 그대로 받는다.
    const merged =
      drawn.lineGapPx < CHART_LINES_MERGED_PX
        ? ` At this setting the two exact probabilities land within ${CHART_LINES_MERGED_PX} pixels of ` +
          `each other, so the chart cannot separate them — read the advantage figure instead.`
        : '';
    // 왼쪽이 왜 비었는지는 그림 안에도 적지만, 캡션에서도 한 번 더 말한다.
    // 빈 구간이 없을 때 "trial 1부터 그렸다"고 적으면 없는 구간을 있다고 말하는 셈이다.
    const blankNote =
      drawn.startTrial > drawn.axisStart
        ? ` The solid curves begin at trial ${display_format_count(drawn.startTrial)}; ` +
          `the shaded strip to its left is where the running average was still outside this window, ` +
          `so nothing is drawn there.`
        : ' The solid curves run the full width of the axis.';
    legendNote.textContent =
      `${LEGEND_KEY_TEXT} ` +
      `Horizontal axis ${display_format_count(drawn.axisStart)}–${display_format_count(drawn.axisEnd)} trials ` +
      `on a log scale; the left edge sits at trial ${display_format_count(drawn.axisStart)} at every setting, ` +
      `but the right edge is the trial count, so the span widens as the trials slider goes up. ` +
      `Vertical axis ${display_format_percent_bound(drawn.scale.rateMin, axisSpan, drawn.scale.step)}–` +
      `${display_format_percent_bound(drawn.scale.rateMax, axisSpan, drawn.scale.step)}, ` +
      `rescaled to fit — read it before comparing two settings.${blankNote}${merged}`;
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(widget_update, RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  /** 프리셋 하나를 슬라이더에 싣는다. 시행 횟수·시드는 그대로 둔다. */
  function widget_load_preset(key) {
    const preset = MONTY_PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    doorSlider.input.value = String(preset.doorCount);
    // openedSlider의 max는 state_read_current가 새 문 개수로 다시 맞춘다.
    openedSlider.input.value = String(preset.openedCount);
    widget_update();
  }

  // 붙인 리스너를 그대로 들고 있어야 뗄 수 있다. 배열에 담지 않으면
  // `widget_reset`이 슬라이더 쪽을 못 떼고, 위젯을 두 번 붙일 때 누수된다.
  const bound = [];
  function widget_bind(target, type, handler) {
    target.addEventListener(type, handler);
    bound.push([target, type, handler]);
  }

  for (const input of [doorSlider.input, openedSlider.input, trialSlider.input]) {
    widget_bind(input, 'input', widget_update_deferred);
    widget_bind(input, 'change', widget_update);
  }
  widget_bind(window, 'resize', widget_redraw_deferred);
  for (const [key, button] of Object.entries(presets.buttons)) {
    widget_bind(button, 'click', () => widget_load_preset(key));
  }

  widget_update();

  // 리스너를 떼어낼 경로를 반환값으로 남긴다. 없으면 위젯을 두 번 붙일 때 누수된다.
  // **붙인 것을 전부 떼야 한다** — resize만 떼고 슬라이더를 남기면
  // reset 뒤에도 슬라이더가 시뮬레이션을 돌리고 주소창을 갱신한다.
  return function widget_reset() {
    for (const [target, type, handler] of bound) target.removeEventListener(type, handler);
    bound.length = 0;
    window.clearTimeout(recomputeTimer);
    window.clearTimeout(redrawTimer);
    delete rootEl.dataset.mounted;
    rootEl.textContent = '';
  };
}

/** 페이지에 위젯 컨테이너가 있으면 자동으로 붙는다. */
export function widget_run_autoload() {
  if (typeof document === 'undefined') return;
  for (const rootEl of document.querySelectorAll(ROOT_SELECTOR)) {
    widget_mount(rootEl);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', widget_run_autoload);
  } else {
    widget_run_autoload();
  }
}
