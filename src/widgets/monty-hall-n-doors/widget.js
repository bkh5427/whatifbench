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
  model_calculate_opened_max,
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

// 두 이론선이 이보다 가깝게 붙으면 눈으로 구분할 수 없다.
// 축을 더 조여 붙이면 노이즈가 큰 실측 곡선이 창 밖으로 나가버리므로,
// 화면을 속이는 대신 "이 설정에서는 분해되지 않는다"고 캡션에 적는다.
const CHART_LINES_MERGED_PX = 4;
// 축 산정에는 마지막 한 데케이드만 쓴다.
// 표본점이 로그 간격이라 '뒤쪽 몇 %' 로 자르면 실제로는 시행 10회 지점이 잡힌다.
const CHART_SCALE_SETTLED_FRACTION = 0.1;
const CHART_TICK_TARGET = 5; // 눈금 개수 목표
const CHART_TICK_MANTISSA = [1, 2, 2.5, 5];
const CHART_RATE_FLOOR = 0;
const CHART_RATE_CEILING = 1;
const CHART_CURVE_WIDTH = 2;
const CHART_CURVE_WIDTH_ALT = 3.5; // stay 곡선. 색 말고 굵기로도 구분되게 한다
const CHART_THEORY_WIDTH = 1.5;
const CHART_THEORY_DASH = [5, 4];
const CHART_GRID_WIDTH = 1;
const CHART_LABEL_FONT = '12px "IBM Plex Sans", system-ui, sans-serif';
const CHART_LABEL_GAP = 8;
const CHART_MAX_PIXEL_RATIO = 2;

// ── 색 토큰 (global.css에서 읽는다. 다크 토큰이 추가되면 자동으로 따라간다) ──
const COLOR_VAR_SWITCH = '--series-1';
const COLOR_VAR_STAY = '--series-2';
const COLOR_VAR_GRID = '--rule';
const COLOR_VAR_TEXT = '--graphite-soft';
const COLOR_VAR_AXIS = '--graphite';
const COLOR_FALLBACK_SWITCH = '#1f4e79';
const COLOR_FALLBACK_STAY = '#c2570a';
const COLOR_FALLBACK_GRID = '#d6d8d1';
const COLOR_FALLBACK_AXIS = '#2b2f33';
const COLOR_FALLBACK_TEXT = '#5f666b';

// 축 제목 (모든 위젯이 축에 이름을 단다)
const CHART_TITLE_Y = 'Share of games won';
const CHART_TITLE_X = 'Trials played (log scale)';

// ── 표시 형식 ──────────────────────────────────────────────
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
// 승률이 작을 때는 자릿수를 늘린다. N=100·K=1의 1.01% vs 1.00% 차이가
// 이 페이지의 핵심인데 소수 한 자리로는 둘 다 "1.0%"가 되어 사라진다.
const PERCENT_SMALL_THRESHOLD = 0.1;
const PERCENT_SMALL_DIGITS = 2;
// 눈금 라벨 자릿수는 간격의 '크기'가 아니라 '정밀도'로 정한다.
// 크기 구간으로 정하면 step=2.5%p에서 7.5%가 "8%"로 표기된다 — 화면에 틀린 숫자가 뜬다.
const TICK_DIGITS_MAX = 4;
const TICK_DIGIT_EPSILON = 1e-9;
const ADVANTAGE_DIGITS = 2;
const RECOMPUTE_DELAY_MS = 120;

// ── 민감도 표에 쓸 문 개수 ──────────────────────────────────
const SENSITIVITY_DOOR_LIST = [3, 5, 10, 25, 50, 100];

// ── 판정 배너 임계값 ────────────────────────────────────────
// 사이트의 hold/edge/break 논지를 이 위젯에 적용한 것.
// 여기서 시험대에 오르는 통념은 "바꾸면 크게 이득"이다.
// 이득비 2배(3문 교과서 값)면 통념 성립, 1.1배 미만이면 통념이 깨진 구간.
const VERDICT_HOLD_MIN_ADVANTAGE = 2;
const VERDICT_EDGE_MIN_ADVANTAGE = 1.1;

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
  const percentStep = Math.abs(step) * PERCENT_SCALE;
  if (!Number.isFinite(percentStep) || percentStep === 0) return 0;
  for (let digits = 0; digits < TICK_DIGITS_MAX; digits += 1) {
    if (Math.abs(percentStep - Number(percentStep.toFixed(digits))) < TICK_DIGIT_EPSILON) return digits;
  }
  return TICK_DIGITS_MAX;
}

/**
 * 축 눈금용 백분율. 간격이 정확히 표기되는 자릿수를 쓴다.
 * (크기 구간으로 자릿수를 정하면 7.5%가 "8%"로 나가 화면의 숫자가 거짓이 된다)
 */
export function display_format_percent_tick(rate, step = 1 / PERCENT_SCALE) {
  return `${(rate * PERCENT_SCALE).toFixed(display_calculate_tick_digits(step))}%`;
}

/** 큰 정수를 천 단위 구분해서. */
export function display_format_count(value) {
  return value.toLocaleString('en-US');
}

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
  const params = new URLSearchParams(search);

  // 빈 문자열·문자·16진수 표기를 전부 '없음'으로 본다.
  // Number('')는 0, Number('0x10')은 16이므로 ?? 만으로는 걸러지지 않는다.
  // 걸러진 값은 기본값으로 돌아가야 한다 — 최솟값으로 떨어지면 공유 URL의
  // 곡선이 조용히 달라진다(시드가 1이 되어 다른 난수열을 탄다).
  function url_read_number(key, fallbackValue) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return fallbackValue;
    if (!/^-?\d+(\.\d+)?$/.test(raw.trim())) return fallbackValue;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallbackValue;
  }

  const doorCount = model_clamp_door_count(url_read_number(URL_KEY_DOORS, MONTY_DOOR_DEFAULT));
  const openedCount = model_clamp_opened_count(
    url_read_number(URL_KEY_OPENED, MONTY_OPENED_DEFAULT),
    doorCount,
  );
  const trialCount = model_clamp_trial_count(url_read_number(URL_KEY_TRIALS, MONTY_TRIAL_DEFAULT));
  const seed = model_clamp_seed(url_read_number(URL_KEY_SEED, MONTY_SEED_DEFAULT));
  return { doorCount, openedCount, trialCount, seed };
}

/** 현재 상태를 주소창에 쓴다. 히스토리를 쌓지 않는다. */
export function url_write_state(state) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const params = new URLSearchParams(window.location.search);
  params.set(URL_KEY_DOORS, String(state.doorCount));
  params.set(URL_KEY_OPENED, String(state.openedCount));
  params.set(URL_KEY_TRIALS, String(state.trialCount));
  params.set(URL_KEY_SEED, String(state.seed));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

/** CSS 변수에서 색을 읽는다. */
function chart_read_color(rootEl, variableName, fallbackColor) {
  const value = getComputedStyle(rootEl).getPropertyValue(variableName).trim();
  return value || fallbackColor;
}

/**
 * 이득비를 hold / edge / break 로 판정한다.
 * 이 위젯이 시험하는 통념은 "바꾸면 크게 이득"이다.
 */
export function state_calculate_verdict(advantage) {
  if (advantage >= VERDICT_HOLD_MIN_ADVANTAGE) return 'hold';
  if (advantage >= VERDICT_EDGE_MIN_ADVANTAGE) return 'edge';
  return 'break';
}

/** 눈금 간격을 1-2-2.5-5 계열의 보기 좋은 값으로 고른다. */
export function chart_calculate_tick_step(span) {
  const rough = span / CHART_TICK_TARGET;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const mantissa of CHART_TICK_MANTISSA) {
    if (rough <= mantissa * power) return mantissa * power;
  }
  return 10 * power;
}

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

/** 시행 횟수(로그) → 캔버스 x 좌표. */
function chart_calculate_x(trial, startTrial, trialCount, plotWidth) {
  const logStart = Math.log(startTrial);
  const logSpan = Math.log(trialCount) - logStart;
  const ratio = logSpan <= 0 ? 1 : (Math.log(trial) - logStart) / logSpan;
  return CHART_PAD_LEFT + plotWidth * ratio;
}

/**
 * x축 눈금 위치. 10의 거듭제곱을 쓰되 양 끝(실제 그린 구간)도 항상 표시한다.
 * 끝값과 너무 붙는 거듭제곱은 라벨이 겹치므로 뺀다.
 */
export function chart_calculate_x_ticks(startTrial, trialCount) {
  // log10(0) = -Infinity 이고 -Infinity + 1 = -Infinity 라 아래 루프가 끝나지 않는다.
  // 유효하지 않은 입력은 눈금 없이 양 끝만 돌려준다.
  if (!(startTrial > 0) || !(trialCount > 0)) return [startTrial, trialCount];

  const logStart = Math.log10(startTrial);
  const logEnd = Math.log10(trialCount);
  const logSpan = logEnd - logStart;
  const ticks = [startTrial];
  if (logSpan > 0) {
    for (let power = Math.ceil(logStart); power <= Math.floor(logEnd); power += 1) {
      const value = Math.pow(10, power);
      const gapFromStart = (Math.log10(value) - logStart) / logSpan;
      const gapToEnd = (logEnd - Math.log10(value)) / logSpan;
      if (gapFromStart > CHART_X_TICK_MIN_GAP && gapToEnd > CHART_X_TICK_MIN_GAP) ticks.push(value);
    }
  }
  if (trialCount !== startTrial) ticks.push(trialCount);
  return ticks;
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
  const context = canvasEl.getContext('2d');
  if (!context) return null;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, CHART_MAX_PIXEL_RATIO);
  const cssWidth = canvasEl.clientWidth;
  const cssHeight = CHART_HEIGHT_PX;
  canvasEl.width = Math.round(cssWidth * pixelRatio);
  canvasEl.height = Math.round(cssHeight * pixelRatio);
  canvasEl.style.height = `${cssHeight}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const plotWidth = cssWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotHeight = cssHeight - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  if (plotWidth <= 0 || plotHeight <= 0) return null;

  const colorSwitch = chart_read_color(canvasEl, COLOR_VAR_SWITCH, COLOR_FALLBACK_SWITCH);
  const colorStay = chart_read_color(canvasEl, COLOR_VAR_STAY, COLOR_FALLBACK_STAY);
  const colorGrid = chart_read_color(canvasEl, COLOR_VAR_GRID, COLOR_FALLBACK_GRID);
  const colorText = chart_read_color(canvasEl, COLOR_VAR_TEXT, COLOR_FALLBACK_TEXT);
  const colorAxis = chart_read_color(canvasEl, COLOR_VAR_AXIS, COLOR_FALLBACK_AXIS);

  const scale = chart_calculate_scale(result);
  const startTrial = chart_calculate_plot_start(result, scale);

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
  const xTicks = chart_calculate_x_ticks(startTrial, result.trialCount);
  const placed = xTicks.map((trial) => {
    const labelText = display_format_count(trial);
    const halfWidth = context.measureText(labelText).width / 2;
    const x = model_clamp_value(
      chart_calculate_x(trial, startTrial, result.trialCount, plotWidth),
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
      const x = chart_calculate_x(point.trial, startTrial, result.trialCount, plotWidth);
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

  context.restore();

  // 캡션이 실제로 그린 축을 그대로 인용할 수 있게 돌려준다.
  return {
    scale,
    startTrial,
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
  return { box, value };
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
    for (const text of cells) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    }
    tableBodyEl.appendChild(row);
  }
}

/** 위젯 전체를 만들고 첫 렌더까지 끝낸다. 빈 폼 상태로 두지 않는다. */
export function widget_render(rootEl) {
  const initialState = url_read_state(typeof window === 'undefined' ? '' : window.location.search);

  rootEl.classList.add('widget');
  rootEl.textContent = '';

  const heading = document.createElement('h2');
  heading.className = 'sr-only';
  heading.textContent = 'Monty Hall simulator with N doors';

  const doorSlider = widget_build_slider(
    'monty-doors',
    'Doors (N)',
    'How many doors the game starts with. One hides the prize.',
    { min: MONTY_DOOR_MIN, max: MONTY_DOOR_MAX, step: 1, value: initialState.doorCount },
  );
  const openedSlider = widget_build_slider(
    'monty-opened',
    'Host opens (K)',
    'Losing doors the host reveals after your first pick. Never your door, never the prize.',
    {
      min: MONTY_OPENED_MIN,
      max: model_calculate_opened_max(initialState.doorCount),
      step: 1,
      value: initialState.openedCount,
    },
  );
  const trialSlider = widget_build_slider(
    'monty-trials',
    'Trials',
    'How many games the simulator plays. More games, less noise.',
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

  const readouts = document.createElement('div');
  readouts.className = 'readouts';
  const switchReadout = widget_build_readout('Switch wins', 'simulated');
  const stayReadout = widget_build_readout('Stay wins', 'simulated');
  const advantageReadout = widget_build_readout('Switch advantage', 'times better than staying');
  readouts.append(switchReadout.box, stayReadout.box, advantageReadout.box);

  const verdict = document.createElement('p');
  verdict.className = 'verdict';
  verdict.setAttribute('aria-live', 'polite');

  const table = document.createElement('table');
  table.className = 'widget-table';
  table.innerHTML =
    '<caption>Exact probabilities when the host opens every door but one</caption>' +
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

  const controls = document.createElement('div');
  controls.className = 'widget-controls';
  controls.append(doorSlider.row, openedSlider.row, trialSlider.row);

  rootEl.append(heading, controls, canvas, legend, readouts, verdict, tableScroll);

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
    doorSlider.input.setAttribute('aria-valuetext', `${display_format_count(state.doorCount)} doors`);
    openedSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_count(state.openedCount)} doors opened`,
    );
    trialSlider.input.setAttribute(
      'aria-valuetext',
      `${display_format_count(state.trialCount)} trials`,
    );
  }

  // 마지막 시뮬레이션 결과. 창 크기만 바뀌었을 때 다시 돌리지 않기 위해 붙들어 둔다.
  let lastResult = null;
  let redrawTimer = 0;

  function widget_update() {
    const state = state_read_current();
    display_update_labels(state);

    const result = sim_run_convergence(state.doorCount, state.openedCount, state.trialCount, {
      seed: state.seed,
    });
    lastResult = result;

    const advantage = model_calculate_switch_advantage(state.doorCount, state.openedCount);
    switchReadout.value.textContent = display_format_percent(result.switchWinRate);
    stayReadout.value.textContent = display_format_percent(result.stayWinRate);
    advantageReadout.value.textContent = `${advantage.toFixed(ADVANTAGE_DIGITS)}×`;

    // 판정 배너 — 사이트 시그니처. 통념("바꾸면 크게 이득")이 어느 구간에서 깨지는지.
    verdict.dataset.state = state_calculate_verdict(advantage);

    const summaryText =
      `With ${display_format_count(state.doorCount)} doors and ${display_format_count(state.openedCount)} opened, ` +
      `the model puts switching at ${display_format_percent(result.switchWinRateTheory)} ` +
      `and staying at ${display_format_percent(result.stayWinRateTheory)} — ` +
      `an advantage of ${advantage.toFixed(ADVANTAGE_DIGITS)}×. ` +
      `After ${display_format_count(state.trialCount)} simulated games the running averages are ` +
      `${display_format_percent(result.switchWinRate)} and ${display_format_percent(result.stayWinRate)}.`;
    verdict.textContent = summaryText;
    canvas.setAttribute('aria-label', summaryText);

    display_render_sensitivity(tableBody, state.doorCount);
    url_write_state(state);
    widget_redraw();
  }

  /** 다시 그리기만. 시뮬레이션은 돌리지 않는다. */
  function widget_redraw() {
    if (!lastResult) return;
    const drawn = chart_render_convergence(canvas, lastResult);
    if (!drawn) return;
    // 캡션이 말하는 축과 실제로 그린 축이 갈라지지 않도록 렌더가 쓴 값을 그대로 받는다.
    const merged =
      drawn.lineGapPx < CHART_LINES_MERGED_PX
        ? ` At this setting the two exact probabilities are closer together than the line width, ` +
          `so the chart cannot separate them — read the advantage figure instead.`
        : '';
    legendNote.textContent =
      `Dashed = exact probability, solid = simulated running average. ` +
      `Vertical axis ${display_format_percent_tick(drawn.scale.rateMin, drawn.scale.step)}–` +
      `${display_format_percent_tick(drawn.scale.rateMax, drawn.scale.step)}, ` +
      `rescaled to fit; the curve is drawn from trial ${display_format_count(drawn.startTrial)}, ` +
      `once the running average settles inside that window.${merged}`;
  }

  function widget_update_deferred() {
    window.clearTimeout(recomputeTimer);
    recomputeTimer = window.setTimeout(widget_update, RECOMPUTE_DELAY_MS);
  }

  function widget_redraw_deferred() {
    window.clearTimeout(redrawTimer);
    redrawTimer = window.setTimeout(widget_redraw, RECOMPUTE_DELAY_MS);
  }

  for (const input of [doorSlider.input, openedSlider.input, trialSlider.input]) {
    input.addEventListener('input', widget_update_deferred);
    input.addEventListener('change', widget_update);
  }
  window.addEventListener('resize', widget_redraw_deferred);

  widget_update();

  return {
    widget_update,
    widget_redraw,
    // 리스너를 떼어낼 경로를 남긴다. 없으면 위젯을 두 번 붙일 때 누수된다.
    widget_reset() {
      window.removeEventListener('resize', widget_redraw_deferred);
      window.clearTimeout(recomputeTimer);
      window.clearTimeout(redrawTimer);
    },
  };
}

/** 페이지에 위젯 컨테이너가 있으면 자동으로 붙는다. */
export function widget_run_autoload() {
  if (typeof document === 'undefined') return;
  for (const rootEl of document.querySelectorAll(ROOT_SELECTOR)) {
    widget_render(rootEl);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', widget_run_autoload);
  } else {
    widget_run_autoload();
  }
}
