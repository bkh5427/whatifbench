/**
 * 샤워 vs 욕조 — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 한 종류다: **표시 단계가 값을 바꾼다.**
 * 모델이 옳은 분·L·kWh를 내도 카드·표·판정 배너에 틀린 글자가 찍히면 독자가 읽는 것은
 * 그 글자다. 곡선도, 판정 색도 그대로라서 화면에는 아무 흔적이 없다.
 *
 * 이 파일이 처음 잡아낸 것 (2026-10-03). 당시 위젯은 부동소수에 `toFixed`·`Math.round`·`<`를
 * 그대로 걸었고, 수학적으로 정확히 경계에 얹히는 상태에서 화면이 정확한 값과 갈렸다.
 * 아래는 전부 슬라이더로 만들 수 있는 상태이고, 회귀를 재현하는 좌표로 남겨 둔다.
 *   ① 반올림 동점(…5)이 한 칸 내림됐다.
 *      Q=4.32 V=135 → t* = 31.25분인데 "31.2" (정확 "31.3")
 *      Q=4.00 V=45 ΔTs=10 ΔTb=14 → t*_E = 15.75분인데 "15.7" (정확 "15.8")
 *      Q=4.02 t=22.5 V=80 → 물 차이 +10.45 L인데 "+10.4" (정확 "+10.5")
 *      V=200 ΔTb=45 (두 슬라이더의 최댓값) → 욕조 10.465 kWh인데 "10.46" (정확 "10.47")
 *      Q=4.00 V=45 ΔTs=10 ΔTb=28 → 간격 20.25분인데 "20.2 min" (정확 "20.3 min")
 *      Q=8.75 t=8 ΔTs=27 단가 100 → 비용 219.765인데 "219.76" (정확 "219.77")
 *   ② 정확히 0인 차이에 부호가 붙었다.
 *      Q=6.00 t=8 V=50 ΔTs=25 ΔTb=24 → 에너지 차이가 정확히 0인데 "−0.000"
 *   ③ 판정 상태가 뒤집혔다.
 *      Q=9.50 t=8 V=80 ΔTs=20 ΔTb=19 → t*_E = 8.0분 = t, "사이"가 아니므로 edge인데 화면은 break
 *      Q=9.20 t=12.5 V=115 (기본 상승폭) → t* = 12.5분 = t인데 화면은 break
 *      Q=20.00 V=40 ΔTs=40 ΔTb=41 → 당시의 0.05분 합쳐짐 문턱 위에서 hold로 찍혔다
 *
 * **지금 명세(2026-10-03 개정).** 위젯이 0.5 올림·정확한 0·자릿수 문턱을 고쳤고,
 * 0.05분 합쳐짐 문턱은 **폐기**됐다: hold는 두 상승폭이 정확히 같을 때(비 = 1, 곧 두 교차가
 * 정확히 같을 때)뿐이다. 가장 좁은 다른 상태(Q=20 V=40 상승 45/44, 간격 0.044분)도 hold가
 * 아니고, 머리문장은 두 교차가 떨어져 있다고 말해야 한다. 표 설명의 꼬리는 넷으로 갈린다
 * (강조 행 / 표보다 아래 / 표보다 위 / 두 행 사이). 축 끝 라벨도 0.5 올림이다
 * (Q=4 V=200이면 x축 끝이 정확히 57.5분이고, 눈금 20의 캡션 자릿수 0에서 "58").
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 오라클은 model.js의 **어떤 계산 함수도 import하지 않는다.** 식을 여기서 다시 쓴다:
 *      · 샤워 물      V_s = Q·t
 *      · 물 교차      t*  = V/Q
 *      · 에너지       E   = ρ·V·c·ΔT (kJ),  kWh = kJ/3600
 *      · 에너지 교차  t*_E = V·ΔT_b/(Q·ΔT_s)   — 모델은 t*·(ΔT_b/ΔT_s) 꼴로 쓴다. 다른 식이다.
 *      · 비용         kWh·단가
 *      ρ와 c는 model.js에서 **데이터로만** 읽어 십진 문자열 → 정확한 유리수로 바꾼다.
 *   ⓑ 연산은 BigInt 분자/분모 **정확 유리수**다. 반올림은 정수 나눗셈 한 번
 *      (0.5는 올림 = `toFixed`·`Math.round`의 명세)이라 부동소수를 거치지 않는다 —
 *      **경계가 경계로 남는다.** hold(두 교차가 정확히 같다)와 "지금 시간이 두 교차
 *      사이에 있는가"의 엄격한 부등호(같으면 사이가 아니다)도 유리수끼리 비교한다.
 *   ⓒ 격자(슬라이더 min/max/step, 기본값, 프리셋, 표의 유량·물량)는
 *      model.js에서 **데이터로만** 읽는다. 위젯이 범위를 바꾸면 이 파일도 따라간다.
 *      표기 자리수와 문구 틀은 **이 파일의 명세**다 — 위젯이 바꾸면 걸리는 것이 맞다:
 *        분 1자리(1분 미만은 2자리) · 간격은 1분 미만이면 정수 초 "N s", 아니면 "N.N min"
 *        L 1자리 · kWh 2자리(1 미만은 3자리) · 비용 2자리 · 유량 손잡이 2자리
 *        차이 카드는 양수 "+", 음수 "−"(U+2212), 정확히 0이면 부호 없음.
 *        자릿수(1분 미만·1 kWh 미만)는 **반올림 전** 값으로 고른다.
 *        패널 캡션의 축 끝값: x 끝 = max(t, t*, t*_E, 2분)×1.15, y 끝 = max(기울기×x 끝, 욕조값)
 *        ×1.08(최소 1 L / 0.05 kWh), 눈금 간격 = 끝값/5 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ,
 *        캡션 자릿수 = (간격/10)의 소수 자릿수(최대 3). 그림의 명세라 여기에 따로 적는다.
 *        표 설명 꼬리의 끝 행 유량은 model.js의 TABLE_FLOWS_LPM에서 데이터로 읽는다.
 *   ⓓ 피검 대상은 두 경로다.
 *      · 표시 함수 경로: model_calculate_result(피검 대상이므로 불러도 된다)의 결과를
 *        export된 display_* 함수에 넣어 나온 문자열.
 *      · 마운트 경로: 위젯을 DOM 스텁에 **실제로 붙이고** 슬라이더·단가 칸을 바꿔 change를
 *        발화시킨 뒤 화면 글자를 읽는다. widget_update가 표시 함수를 어느 자리에 몇 자리로
 *        꽂는지, 그리고 **어느 상승폭을 모델의 어느 인자로 넘기는지**까지 본다.
 *
 * 격자를 줄인 이유. 슬라이더 전 조합은 유량 1,601 × 시간 51 × 물량 33 × 상승폭 36 × 36
 * ≈ 35억 상태다. 칸마다 무엇에 의존하는지로 쪼개어 **각 의존 부분공간은 전수**로 돈다:
 *   · 물 교차·표           (Q, V)               — Q 전수 × V 전수
 *   · 샤워 물·물 차이       (Q, t)  (+V)         — Q 전수 × t 전수
 *   · 에너지 교차·간격·hold  (Q, V, ΔT_s, ΔT_b)  — 상승폭 전수 × V 전수 × Q 대표값 6개
 *   · 패널 캡션의 축 끝값    (Q, V)·(Q, t)        — 위 두 격자 (+ 마운트 격자)
 *   · 표 설명 꼬리           (Q)                  — Q 전수
 *   · 샤워 kWh·에너지 차이  (Q, t, ΔT_s, ΔT_b)   — 상승폭 전수 × t 전수
 *   · 판정이 갈리는 경계는 위 격자가 우연히 밟지 않으므로 **정확 연산으로 찾아서 넣는다**:
 *     ① 에너지 교차가 시간 눈금 위에 정확히 떨어지는 상태 전부
 *     ② 물 교차가 시간 눈금 위에 정확히 떨어지는 상태 전부 × 상승폭 대표값
 *     ③ 가장 좁은 다른 상승폭(Q=20 V=40, 45/44와 44/45) × 시간 전수
 *   경계 밖에서는 부동소수가 판정을 못 뒤집는다: 교차 시점과 시간 눈금의
 *   차는 분모가 200만 이하인 유리수라 0이 아니면 10⁻⁶분 이상인데, 부동소수 오차는 10⁻¹³분
 *   아래다. 반올림 동점·정확한 0은 이렇게 좁혀지지 않으므로 위 부분공간 안에서만 전수다.
 * 마운트 경로는 갱신 한 번이 표·두 패널을 다시 만들므로 대표값 격자만 돈다:
 * 슬라이더마다 양 끝·기본값·모든 프리셋·표의 값, 단가는 비움·0·최댓값 포함 다섯 가지.
 * 여기에 경계 ②③과 프리셋 버튼 클릭을 더한다.
 *
 * 마운트 경로는 두 캔버스의 aria-label(캡션 전문)과 범례 문단 전문까지 대조한다.
 */
import { describe, it, expect } from 'vitest';
import {
  WATER_SPECIFIC_HEAT_KJ_PER_KG_K,
  WATER_DENSITY_KG_PER_LITRE,
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
  PRICE_MAX,
  SHOWER_FLOW_PRESETS,
  SHOWER_SITUATION_PRESETS,
  TABLE_FLOWS_LPM,
  TABLE_BATH_LITRES,
  model_clamp_flow,
  model_clamp_minutes,
  model_clamp_bath_litres,
  model_clamp_rise,
  model_clamp_price,
  model_calculate_result,
  model_calculate_cost,
  model_calculate_crossover_table,
} from './model.js';
import {
  widget_mount,
  display_format_minutes,
  display_format_gap,
  display_format_litres,
  display_format_kwh,
  display_format_signed,
  display_format_cost,
  display_format_axis,
  display_describe_verdict,
  display_describe_table_row,
  chart_calculate_x_max,
  chart_calculate_y_max,
  chart_describe_panel,
} from './widget.js';
import { ticks_calculate_step } from '../_shared/ticks.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 정확 유리수 ──────────────────────────────────────────────
/** { n, d } — d > 0. 약분하지 않는다(비교·반올림은 교차곱과 정수 나눗셈이라 필요 없다). */
const frac_create = (n, d = 1n) => (d < 0n ? { n: -BigInt(n), d: -BigInt(d) } : { n: BigInt(n), d: BigInt(d) });

/** 십진 문자열 → 정확한 분자/분모. 지수 표기는 받지 않는다(받을 일이 없다). */
function frac_read_decimal(text) {
  const found = String(text).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[3] ?? '';
  const n = BigInt(found[2] + fraction);
  return frac_create(found[1] === '-' ? -n : n, 10n ** BigInt(fraction.length));
}

const frac_multiply = (left, right) => frac_create(left.n * right.n, left.d * right.d);
const frac_divide = (left, right) => frac_create(left.n * right.d, left.d * right.n);
const frac_subtract = (left, right) => frac_create(left.n * right.d - right.n * left.d, left.d * right.d);
const frac_read_abs = (value) => (value.n < 0n ? frac_create(-value.n, value.d) : value);
/** 부호 −1 / 0 / 1. */
const frac_read_sign = (value) => (value.n > 0n ? 1 : value.n < 0n ? -1 : 0);
/** left − right의 부호. */
const frac_compare = (left, right) => {
  const cross = left.n * right.d - right.n * left.d;
  return cross > 0n ? 1 : cross < 0n ? -1 : 0;
};
const FRAC_ONE = frac_create(1n);

/** |값|을 소수 digits자리로 반올림한 정수(= |값|×10^digits). 0.5는 올린다. */
function frac_round_fixed(value, digits) {
  const size = value.n < 0n ? -value.n : value.n;
  return (2n * size * 10n ** BigInt(digits) + value.d) / (2n * value.d);
}

/** 정수 scaled(= 값×10^digits)를 소수 digits자리 고정 문자열로. */
function frac_format_scaled(scaled, digits) {
  let body = scaled.toString();
  if (digits === 0) return body;
  body = body.padStart(digits + 1, '0');
  return `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
}

/** |값|의 고정 자리 문자열. 부호는 부르는 쪽이 붙인다. */
const frac_format_fixed = (value, digits) => frac_format_scaled(frac_round_fixed(value, digits), digits);

// ── 오라클 상수 ──────────────────────────────────────────────
/** 물성 두 개는 검수 대상 데이터다 — model.js에서 읽되 문자열 → 정확 유리수로. */
const REFERENCE_DENSITY = frac_read_decimal(String(WATER_DENSITY_KG_PER_LITRE));
const REFERENCE_SPECIFIC_HEAT = frac_read_decimal(String(WATER_SPECIFIC_HEAT_KJ_PER_KG_K));
/** 1 kWh = 1 kW × 3,600 s = 3,600 kJ. 정의값이라 모델과 따로 적는다. */
const REFERENCE_KJ_PER_KWH = frac_create(3600n);
const REFERENCE_SECONDS_PER_MINUTE = 60n;
const FRAC_ZERO = frac_create(0n);

/** 패널 축의 명세(머리말 ⓒ). 그림이 캡션에 적는 끝값이 여기서 나온다. */
const REFERENCE_X_MIN_MINUTES = frac_create(2n);
const REFERENCE_X_HEADROOM = frac_read_decimal('1.15');
const REFERENCE_Y_HEADROOM = frac_read_decimal('1.08');
const REFERENCE_Y_MIN_LITRES = frac_create(1n);
const REFERENCE_Y_MIN_KWH = frac_read_decimal('0.05');
const REFERENCE_TICK_TARGET = 5n;
/** 1·2·2.5·5 계열을 0.1 단위 정수로. */
const REFERENCE_TICK_MANTISSA_TENTHS = [10n, 20n, 25n, 50n];
const REFERENCE_CAPTION_DIVISOR = 10n;
const REFERENCE_AXIS_DIGITS_MAX = 3;

// ── 오라클 표기 명세 ─────────────────────────────────────────
const MINUS = '−'; // U+2212
const REFERENCE_MINUTE_DIGITS = 1;
const REFERENCE_MINUTE_SMALL_DIGITS = 2;
const REFERENCE_LITRE_DIGITS = 1;
const REFERENCE_KWH_DIGITS = 2;
const REFERENCE_KWH_SMALL_DIGITS = 3;
const REFERENCE_COST_DIGITS = 2;
const REFERENCE_FLOW_DIGITS = 2;
/** 1분·1 kWh 미만이면 한 자리 더, 1분 미만 간격은 초로 — 셋 다 문턱이 1이다. */
const REFERENCE_SMALL_CEILING = FRAC_ONE;
const REFERENCE_HEADLINE = {
  hold: 'Both crossovers land on the same minute.',
  edge: 'The two crossovers sit apart, and the shower time is not between them.',
  break: 'At this shower time the two panels disagree.',
};
const REFERENCE_TABLE_NOTE_BASE =
  'The water crossover is V divided by Q and uses neither temperature, so this grid does not move when the two ' +
  'temperature sliders move.';
const REFERENCE_TABLE_NOTE_MARKED = ' The row matching the flow slider is marked.';
const REFERENCE_TABLE_NOTE_BETWEEN =
  ' The flow slider sits between two of these rows right now, so none is marked — read the neighbouring rows on ' +
  'either side instead.';
const reference_describe_table_below = (flowText) =>
  ` The flow slider is below the lowest row right now, so none is marked — the ${flowText} row is the nearest.`;
const reference_describe_table_above = (flowText) =>
  ` The flow slider is above the highest row right now, so none is marked — the ${flowText} row is the nearest.`;
const REFERENCE_LEGEND_LEAD = 'Both panels share the same horizontal axis, minutes of shower. ';
const REFERENCE_LEGEND_TAIL = ' The dotted vertical marks the shower-time slider.';
const REFERENCE_TOGETHER_MERGED =
  'The two crossovers land on the same minute here, so the two dashed verticals sit on top of each other ' +
  'and there is one line to see rather than two.';
const REFERENCE_PANEL_WATER = 'Water panel';
const REFERENCE_PANEL_ENERGY = 'Energy panel';
/** 비용 카드가 없을 때(단가 비움) 마운트 경로가 적는 자리표. 표시 함수는 '—'를 낸다. */
const ABSENT = '—';

// ── 오라클: 표기 ─────────────────────────────────────────────
const reference_check_small = (value) => frac_compare(frac_read_abs(value), REFERENCE_SMALL_CEILING) < 0;

function reference_format_minutes(minutes) {
  return frac_format_fixed(minutes, reference_check_small(minutes) ? REFERENCE_MINUTE_SMALL_DIGITS : REFERENCE_MINUTE_DIGITS);
}

/** 두 교차의 간격. 1분 미만이면 정수 초(0.5초는 올림). */
function reference_format_gap(minutes) {
  const size = frac_read_abs(minutes);
  if (reference_check_small(size)) {
    return `${(2n * size.n * REFERENCE_SECONDS_PER_MINUTE + size.d) / (2n * size.d)} s`;
  }
  return `${frac_format_fixed(size, REFERENCE_MINUTE_DIGITS)} min`;
}

const reference_format_litres = (litres) => frac_format_fixed(litres, REFERENCE_LITRE_DIGITS);

function reference_format_kwh(kwh) {
  return frac_format_fixed(kwh, reference_check_small(kwh) ? REFERENCE_KWH_SMALL_DIGITS : REFERENCE_KWH_DIGITS);
}

/** 부호는 **반올림 전** 정확한 값에서. 정확히 0일 때만 부호가 없다. */
function reference_format_signed(value, formatValue) {
  const sign = frac_read_sign(value);
  if (sign > 0) return `+${formatValue(value)}`;
  if (sign < 0) return `${MINUS}${formatValue(frac_read_abs(value))}`;
  return formatValue(value);
}

// ── 오라클: 패널 캡션의 축 끝값 ──────────────────────────────
const frac_pick_max = (...values) => values.reduce((best, value) => (frac_compare(value, best) > 0 ? value : best));
const frac_create_power10 = (exponent) =>
  exponent >= 0 ? frac_create(10n ** BigInt(exponent)) : frac_create(1n, 10n ** BigInt(-exponent));

/** 눈금 간격 = 끝값/5 이상인 가장 작은 {1, 2, 2.5, 5, 10}×10ⁿ. 반환: 0.1 단위 가수와 n. */
function reference_calculate_tick_step(span) {
  const rough = frac_divide(span, frac_create(REFERENCE_TICK_TARGET));
  let decade = 0;
  while (frac_compare(rough, frac_create_power10(decade + 1)) >= 0) decade += 1;
  while (frac_compare(rough, frac_create_power10(decade)) < 0) decade -= 1;
  for (const tenths of [...REFERENCE_TICK_MANTISSA_TENTHS, 100n]) {
    const step = frac_multiply(frac_create(tenths, 10n), frac_create_power10(decade));
    if (frac_compare(rough, step) <= 0) return { tenths, decade };
  }
  throw new Error('눈금 간격을 못 골랐다');
}

/** 캡션 끝값 = (간격/10)의 소수 자릿수(최대 3)로 0.5 올림. 간격/10 = 가수(0.1 단위)×10^(n−2). */
function reference_format_axis_end(span) {
  const { tenths, decade } = reference_calculate_tick_step(span);
  let mantissa = tenths;
  let exponent = decade - 1 - Number(String(REFERENCE_CAPTION_DIVISOR).length - 1);
  while (mantissa % 10n === 0n) {
    mantissa /= 10n;
    exponent += 1;
  }
  return frac_format_fixed(span, Math.min(Math.max(0, -exponent), REFERENCE_AXIS_DIGITS_MAX));
}

/** 패널 캡션 전문. widget의 문장 틀이 이 파일의 명세다. */
function reference_describe_caption(name, xMax, yMax, flatText, crossover) {
  return (
    `${name}. Horizontal axis 0 to ${reference_format_axis_end(xMax)} minutes, ` +
    `vertical axis 0 to ${reference_format_axis_end(yMax)}, both rescaled to fit — ` +
    `read them before comparing two settings. The rising line is the shower, the flat line the tub at ` +
    `${flatText}, and the dashed vertical is the crossover at ${reference_format_minutes(crossover)} minutes. ` +
    `The dotted vertical with a dot on it is where the shower-time slider sits.`
  );
}

// ── 격자: 슬라이더 눈금을 정수로 ─────────────────────────────
/** step의 소수 자리수로 배율을 정한다(0.01 → 100, 0.5 → 10, 5 → 1). */
const fixture_read_scale = (step) => 10 ** (String(step).split('.')[1]?.length ?? 0);

/** 값 → 정수 눈금. 배율 위에 정확히 얹히지 않으면 던진다. */
function fixture_read_tick(value, scale) {
  const tick = Math.round(value * scale);
  if (Math.abs(tick - value * scale) > 1e-9) throw new Error(`${value}가 1/${scale} 눈금 위에 있지 않다`);
  return tick;
}

function fixture_build_ticks(min, max, step) {
  const scale = fixture_read_scale(step);
  const low = fixture_read_tick(min, scale);
  const high = fixture_read_tick(max, scale);
  const stride = fixture_read_tick(step, scale);
  const out = [];
  for (let tick = low; tick <= high; tick += stride) out.push(tick);
  return { scale, ticks: out, set: new Set(out) };
}

const FLOW = fixture_build_ticks(SHOWER_FLOW_MIN_LPM, SHOWER_FLOW_MAX_LPM, SHOWER_FLOW_STEP_LPM);
const MINUTES = fixture_build_ticks(SHOWER_MINUTES_MIN, SHOWER_MINUTES_MAX, SHOWER_MINUTES_STEP);
const BATH = fixture_build_ticks(BATH_LITRES_MIN, BATH_LITRES_MAX, BATH_LITRES_STEP);
const RISE = fixture_build_ticks(RISE_MIN_K, RISE_MAX_K, RISE_STEP_K);

/** 정수 눈금 → 슬라이더 value에 넣는 십진 문자열(꼬리 0 포함, Number로 읽으면 같은 값). */
const fixture_format_tick = (tick, scale) =>
  frac_format_scaled(BigInt(tick), String(scale).length - 1);

const fixture_pick_unique = (list) => [...new Set(list)].sort((left, right) => left - right);

const DEFAULT_STATE = {
  flow: fixture_read_tick(SHOWER_FLOW_DEFAULT_LPM, FLOW.scale),
  minutes: fixture_read_tick(SHOWER_MINUTES_DEFAULT, MINUTES.scale),
  bath: fixture_read_tick(BATH_LITRES_DEFAULT, BATH.scale),
  riseShower: fixture_read_tick(RISE_SHOWER_DEFAULT_K, RISE.scale),
  riseBath: fixture_read_tick(RISE_BATH_DEFAULT_K, RISE.scale),
  price: null,
};

/** 상황 프리셋 → 정수 상태(단가는 프리셋이 건드리지 않는다). */
const fixture_build_situation = (preset, price = null) => ({
  flow: fixture_read_tick(preset.state.flow, FLOW.scale),
  minutes: fixture_read_tick(preset.state.minutes, MINUTES.scale),
  bath: fixture_read_tick(preset.state.bathLitres, BATH.scale),
  riseShower: fixture_read_tick(preset.state.riseShower, RISE.scale),
  riseBath: fixture_read_tick(preset.state.riseBath, RISE.scale),
  price,
});
const SITUATION_STATES = SHOWER_SITUATION_PRESETS.map((preset) => fixture_build_situation(preset));

/** 표의 행·열. 표는 슬라이더와 무관하게 늘 같은 다섯 행이다. */
const TABLE_FLOW_TICKS = TABLE_FLOWS_LPM.map((flow) => fixture_read_tick(flow, FLOW.scale));
const TABLE_BATH_TICKS = TABLE_BATH_LITRES.map((litres) => fixture_read_tick(litres, BATH.scale));

/** 슬라이더마다 대표값: 양 끝·기본값·프리셋·표의 값. */
const FLOW_SAMPLE = fixture_pick_unique([
  FLOW.ticks[0],
  FLOW.ticks[FLOW.ticks.length - 1],
  DEFAULT_STATE.flow,
  ...SHOWER_FLOW_PRESETS.map((preset) => fixture_read_tick(preset.flow, FLOW.scale)),
  ...SITUATION_STATES.map((state) => state.flow),
  ...TABLE_FLOW_TICKS,
]);
const MINUTES_SAMPLE = fixture_pick_unique([
  MINUTES.ticks[0],
  MINUTES.ticks[MINUTES.ticks.length - 1],
  DEFAULT_STATE.minutes,
  ...SITUATION_STATES.map((state) => state.minutes),
]);
const BATH_SAMPLE = fixture_pick_unique([
  BATH.ticks[0],
  BATH.ticks[BATH.ticks.length - 1],
  DEFAULT_STATE.bath,
  ...SITUATION_STATES.map((state) => state.bath),
  ...TABLE_BATH_TICKS,
]);
const RISE_SAMPLE = fixture_pick_unique([
  RISE.ticks[0],
  RISE.ticks[RISE.ticks.length - 1],
  DEFAULT_STATE.riseShower,
  DEFAULT_STATE.riseBath,
  ...SITUATION_STATES.flatMap((state) => [state.riseShower, state.riseBath]),
]);
/** 경계 ②에 쓰는 상승폭 대표값: 위 대표값 + 눈금 5칸마다. */
const RISE_COARSE = fixture_pick_unique([...RISE_SAMPLE, ...RISE.ticks.filter((tick) => tick % 5 === 0)]);
/** 단가: 비움(null)·0·최댓값과 흔한 값 둘. 사람이 칸에 치는 문자열 그대로다. */
const PRICE_TEXTS = [null, '0.28', '0', String(PRICE_MAX), '0.35'];

// ── 오라클: 한 상태의 화면 ───────────────────────────────────

/** E = ρ·V·c·ΔT (kJ) → kWh. */
function reference_calculate_kwh(litres, rise) {
  return frac_divide(
    frac_multiply(frac_multiply(frac_multiply(REFERENCE_DENSITY, litres), REFERENCE_SPECIFIC_HEAT), rise),
    REFERENCE_KJ_PER_KWH,
  );
}

/** 두 패널의 축 끝값(머리말 ⓒ의 명세). x축은 두 패널이 같은 값 하나를 쓴다. */
function reference_calculate_axes(exact, riseShower) {
  const xMax = frac_multiply(
    frac_pick_max(exact.minutes, exact.waterCrossover, exact.energyCrossover, REFERENCE_X_MIN_MINUTES),
    REFERENCE_X_HEADROOM,
  );
  const reference_calculate_y_end = (rate, flat, minimum) =>
    frac_pick_max(frac_multiply(frac_pick_max(frac_multiply(rate, xMax), flat), REFERENCE_Y_HEADROOM), minimum);
  return {
    xMax,
    waterYMax: reference_calculate_y_end(exact.flow, exact.bathLitres, REFERENCE_Y_MIN_LITRES),
    energyYMax: reference_calculate_y_end(reference_calculate_kwh(exact.flow, riseShower), exact.bathKwh, REFERENCE_Y_MIN_KWH),
  };
}

/** 정수 상태 → 정확한 물리량. */
function reference_calculate_state(state) {
  const flow = frac_create(state.flow, FLOW.scale);
  const minutes = frac_create(state.minutes, MINUTES.scale);
  const bathLitres = frac_create(state.bath, BATH.scale);
  const riseShower = frac_create(state.riseShower, RISE.scale);
  const riseBath = frac_create(state.riseBath, RISE.scale);

  const showerLitres = frac_multiply(flow, minutes);
  const waterCrossover = frac_divide(bathLitres, flow);
  const energyCrossover = frac_divide(frac_multiply(bathLitres, riseBath), frac_multiply(flow, riseShower));
  const showerKwh = reference_calculate_kwh(showerLitres, riseShower);
  const bathKwh = reference_calculate_kwh(bathLitres, riseBath);
  const gap = frac_subtract(waterCrossover, energyCrossover);
  // hold는 두 교차가 **정확히** 같을 때뿐이다. V/Q > 0이므로 ΔT_b/ΔT_s = 1과 같은 말이다.
  const merged = frac_compare(gap, FRAC_ZERO) === 0;
  const [low, high] = frac_compare(waterCrossover, energyCrossover) <= 0
    ? [waterCrossover, energyCrossover]
    : [energyCrossover, waterCrossover];
  const split = !merged && frac_compare(minutes, low) > 0 && frac_compare(minutes, high) < 0;
  const price = state.price === null ? null : frac_read_decimal(state.price);
  return {
    flow, minutes, bathLitres, riseShower, showerLitres, waterCrossover, energyCrossover, showerKwh, bathKwh,
    gap, merged, split, price,
    verdict: merged ? 'hold' : split ? 'break' : 'edge',
    waterDifference: frac_subtract(showerLitres, bathLitres),
    energyDifference: frac_subtract(showerKwh, bathKwh),
  };
}

/** 표는 상태와 무관하다 — 한 번만 만든다. */
const REFERENCE_TABLE = TABLE_FLOW_TICKS.map((flowTick) => {
  const flow = frac_create(flowTick, FLOW.scale);
  return [
    frac_format_fixed(flow, REFERENCE_FLOW_DIGITS),
    ...TABLE_BATH_TICKS.map((bathTick) => reference_format_minutes(frac_divide(frac_create(bathTick, BATH.scale), flow))),
  ];
});

/**
 * 한 상태에서 화면에 있어야 하는 문자열 전부. 칸 이름의 첫 마디가 분류다.
 * state: { flow, minutes, bath, riseShower, riseBath } 정수 눈금 + price(문자열|null)
 */
function reference_describe_screen(state, withAxis = false) {
  const exact = reference_calculate_state(state);
  const waterText = reference_format_minutes(exact.waterCrossover);
  const energyText = reference_format_minutes(exact.energyCrossover);
  const minutesText = reference_format_minutes(exact.minutes);

  let headline;
  if (exact.verdict === 'hold') {
    headline = `${REFERENCE_HEADLINE.hold} The model puts both at ${waterText} minutes.`;
  } else if (exact.verdict === 'break') {
    const wetter = frac_read_sign(exact.waterDifference) > 0;
    headline =
      `${REFERENCE_HEADLINE.break} At ${minutesText} minutes the model has the shower ` +
      `using ${wetter ? 'more' : 'less'} water than the tub and ${wetter ? 'less' : 'more'} energy than it, at the same time.`;
  } else {
    headline = `${REFERENCE_HEADLINE.edge} The model puts them ${reference_format_gap(exact.gap)} apart.`;
  }
  const detail =
    `Water crosses at ${waterText} minutes, energy at ${energyText}. ` +
    `At ${minutesText} minutes the shower has run ` +
    `${reference_format_litres(exact.showerLitres)} litres against the tub's ${reference_format_litres(exact.bathLitres)}, ` +
    `and ${reference_format_kwh(exact.showerKwh)} kWh against its ${reference_format_kwh(exact.bathKwh)}. ` +
    `The model reports crossover minutes; it ranks nothing.`;

  const flowText = frac_format_fixed(exact.flow, REFERENCE_FLOW_DIGITS);
  const minutesSlider = frac_format_fixed(exact.minutes, REFERENCE_MINUTE_DIGITS);
  const bathText = String(state.bath / BATH.scale);
  const riseShowerText = String(state.riseShower / RISE.scale);
  const riseBathText = String(state.riseBath / RISE.scale);

  const shown = {};
  // 손잡이
  shown['slider.flow-output'] = `${flowText} L/min`;
  shown['slider.flow-valuetext'] = `${flowText} litres per minute`;
  shown['slider.minutes-output'] = `${minutesSlider} min`;
  shown['slider.minutes-valuetext'] = `${minutesSlider} minutes`;
  shown['slider.bath-output'] = `${bathText} L`;
  shown['slider.bath-valuetext'] = `${bathText} litres`;
  shown['slider.rise-shower-output'] = `${riseShowerText} K`;
  shown['slider.rise-shower-valuetext'] = `${riseShowerText} kelvin rise`;
  shown['slider.rise-bath-output'] = `${riseBathText} K`;
  shown['slider.rise-bath-valuetext'] = `${riseBathText} kelvin rise`;
  // 카드
  shown['cross.water'] = waterText;
  shown['cross.energy'] = energyText;
  shown['now.water'] = reference_format_signed(exact.waterDifference, reference_format_litres);
  shown['now.energy'] = reference_format_signed(exact.energyDifference, reference_format_kwh);
  // 판정
  shown['verdict.state'] = exact.verdict;
  shown['verdict.headline'] = headline;
  shown['verdict.detail'] = detail;
  shown['verdict.together'] = exact.merged
    ? REFERENCE_TOGETHER_MERGED
    : `The two dashed verticals are ${reference_format_gap(exact.gap)} apart, and the shaded band ` +
      `between them — drawn on both panels — is the stretch of minutes in which the model reports the shower ` +
      `ahead on one axis and behind on the other.`;
  // 비용
  shown['cost.cards'] = exact.price === null ? '0' : '2';
  shown['cost.shower'] =
    exact.price === null ? ABSENT : frac_format_fixed(frac_multiply(exact.showerKwh, exact.price), REFERENCE_COST_DIGITS);
  shown['cost.bath'] =
    exact.price === null ? ABSENT : frac_format_fixed(frac_multiply(exact.bathKwh, exact.price), REFERENCE_COST_DIGITS);
  // 표
  REFERENCE_TABLE.forEach((cells, row) => {
    cells.forEach((text, column) => {
      shown[`table.r${row}.c${column}`] = text;
    });
  });
  const markedRow = TABLE_FLOW_TICKS.indexOf(state.flow);
  shown['table.marked'] = markedRow < 0 ? 'none' : String(markedRow);
  shown['table.note'] = REFERENCE_TABLE_NOTE_BASE + reference_describe_table_tail(state.flow);
  // 패널 캡션·범례 문단 — 축 끝값 계산이 무거워 그것을 읽는 경로에서만 만든다.
  if (withAxis) {
    const axes = reference_calculate_axes(exact, exact.riseShower);
    const waterCaption = reference_describe_caption(
      REFERENCE_PANEL_WATER, axes.xMax, axes.waterYMax, reference_format_litres(exact.bathLitres), exact.waterCrossover,
    );
    const energyCaption = reference_describe_caption(
      REFERENCE_PANEL_ENERGY, axes.xMax, axes.energyYMax, reference_format_kwh(exact.bathKwh), exact.energyCrossover,
    );
    shown['axis.water'] = waterCaption;
    shown['axis.energy'] = energyCaption;
    shown['axis.legend'] =
      `${REFERENCE_LEGEND_LEAD}${shown['verdict.together']}${REFERENCE_LEGEND_TAIL} ${waterCaption} ${energyCaption}`;
  }
  return shown;
}

/** 표 설명의 꼬리: 강조 행 / 가장 낮은 행보다 아래 / 가장 높은 행보다 위 / 두 행 사이. */
function reference_describe_table_tail(flowTick) {
  if (TABLE_FLOW_TICKS.includes(flowTick)) return REFERENCE_TABLE_NOTE_MARKED;
  const lowest = Math.min(...TABLE_FLOW_TICKS);
  const highest = Math.max(...TABLE_FLOW_TICKS);
  const format = (tick) => frac_format_fixed(frac_create(tick, FLOW.scale), REFERENCE_FLOW_DIGITS);
  if (flowTick < lowest) return reference_describe_table_below(format(lowest));
  if (flowTick > highest) return reference_describe_table_above(format(highest));
  return REFERENCE_TABLE_NOTE_BETWEEN;
}

// ── 피검 1: 표시 함수 경로 ───────────────────────────────────

/** 슬라이더가 넘기는 것과 같은 값: 문자열 → Number → 모델 클램프. */
function fixture_build_params(state) {
  return {
    flow: model_clamp_flow(Number(fixture_format_tick(state.flow, FLOW.scale))),
    minutes: model_clamp_minutes(Number(fixture_format_tick(state.minutes, MINUTES.scale))),
    bathLitres: model_clamp_bath_litres(Number(fixture_format_tick(state.bath, BATH.scale))),
    riseShower: model_clamp_rise(Number(fixture_format_tick(state.riseShower, RISE.scale))),
    riseBath: model_clamp_rise(Number(fixture_format_tick(state.riseBath, RISE.scale))),
    price: state.price === null ? null : model_clamp_price(Number(state.price)),
  };
}

/** export된 display_* 함수들이 이 상태에서 내는 문자열. 칸 이름은 오라클과 같다. */
function fixture_read_display(state) {
  const params = fixture_build_params(state);
  const result = model_calculate_result(params.flow, params.minutes, params.bathLitres, params.riseShower, params.riseBath);
  const spoken = display_describe_verdict(result);
  const shown = {};
  shown['cross.water'] = display_format_minutes(result.waterCrossoverMinutes);
  shown['cross.energy'] = display_format_minutes(result.energyCrossoverMinutes);
  shown['now.water'] = display_format_signed(result.waterDifferenceLitres, display_format_litres);
  shown['now.energy'] = display_format_signed(result.energyDifferenceKwh, display_format_kwh);
  shown['verdict.state'] = spoken.verdict;
  shown['verdict.headline'] = spoken.headline;
  shown['verdict.detail'] = spoken.detail;
  shown['cost.shower'] = display_format_cost(model_calculate_cost(result.showerKwh, params.price));
  shown['cost.bath'] = display_format_cost(model_calculate_cost(result.bathKwh, params.price));
  return shown;
}
const DISPLAY_FIELD_COUNT = 9;

/** 그림의 최소 폭(머리말 ⓒ). widget_redraw가 chart_calculate_y_max에 넘기는 값과 같아야 한다. */
const FIXTURE_Y_MIN_LITRES = 1;
const FIXTURE_Y_MIN_KWH = 0.05;

/**
 * 패널 캡션: export된 chart_calculate_x_max·chart_calculate_y_max·ticks_calculate_step으로 축을 잡아
 * chart_describe_panel(→ display_format_axis)에 넣은 문자열. chart_render_panel이 반환하는
 * { xMax, yMax, xStep, yStep }와 같은 모양을 만든다 — 렌더가 실제로 쓴 축은 마운트 경로가 본다.
 */
function fixture_read_axis_display(state) {
  const params = fixture_build_params(state);
  const result = model_calculate_result(params.flow, params.minutes, params.bathLitres, params.riseShower, params.riseBath);
  const xMax = chart_calculate_x_max(result);
  const fixture_describe_panel = (name, rate, flat, minimum, crossover, formatValue) => {
    const yMax = chart_calculate_y_max(rate, flat, xMax, minimum);
    const drawn = { xMax, yMax, xStep: ticks_calculate_step(xMax), yStep: ticks_calculate_step(yMax) };
    return chart_describe_panel(name, drawn, { flatValue: flat, crossoverMinutes: crossover }, formatValue);
  };
  return {
    'axis.water': fixture_describe_panel(
      REFERENCE_PANEL_WATER, result.litresPerMinute, result.bathLitres, FIXTURE_Y_MIN_LITRES,
      result.waterCrossoverMinutes, display_format_litres,
    ),
    'axis.energy': fixture_describe_panel(
      REFERENCE_PANEL_ENERGY, result.kwhPerMinute, result.bathKwh, FIXTURE_Y_MIN_KWH,
      result.energyCrossoverMinutes, display_format_kwh,
    ),
  };
}
const AXIS_FIELD_COUNT = 2;

// ── 피검 2: 마운트한 화면 ────────────────────────────────────

/** 붙은 위젯의 원소를 한 번만 훑는다(스텁의 querySelectorAll은 매번 트리 전체를 돈다). */
function fixture_scan_elements(root) {
  const out = [];
  const stack = [...root.children].reverse();
  while (stack.length) {
    const element = stack.pop();
    out.push(element);
    for (let index = element.children.length - 1; index >= 0; index -= 1) stack.push(element.children[index]);
  }
  return out;
}
const fixture_check_class = (element, name) => String(element.className).split(/\s+/).includes(name);

const SLIDER_NAMES = ['flow', 'minutes', 'bath', 'rise-shower', 'rise-bath'];
/** 스텁 캔버스의 CSS 폭. 0이 아니어야 범례 문단이 정상 경로로 채워진다. */
const STUB_WIDTH_PX = 900;

/** URL 쿼리로 상태를 싣고 붙인다. 갱신마다 살아 남는 원소는 여기서 한 번만 찾아 둔다. */
function fixture_mount_widget(search = '') {
  const dom = fixture_create_dom({ search, width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  const all = fixture_scan_elements(dom.root);
  const by_class = (name) => all.filter((el) => fixture_check_class(el, name));
  const input_of = (id) => all.find((el) => el.tagName === 'input' && el.getAttribute('id') === id);
  const output_of = (id) => all.find((el) => el.tagName === 'output' && el.getAttribute('for') === id);
  const [cardBox, costBox] = by_class('readouts');
  const verdict = by_class('verdict')[0];
  const [legendNote, tableNote] = by_class('legend-note');
  // 캔버스는 [물, 에너지] 순서다(widget_mount의 append 순서).
  const [waterCanvas, energyCanvas] = all.filter((el) => el.tagName === 'canvas');
  return {
    waterCanvas,
    energyCanvas,
    dom,
    widget_reset,
    inputs: Object.fromEntries(SLIDER_NAMES.map((name) => [name, input_of(`shower-${name}`)])),
    outputs: Object.fromEntries(SLIDER_NAMES.map((name) => [name, output_of(`shower-${name}`)])),
    price: input_of('shower-price'),
    presets: Object.fromEntries(by_class('widget-preset').map((button) => [button.dataset.preset, button])),
    cards: cardBox.children.map((box) => box.children[1].children[0]),
    costBox,
    verdict,
    headline: verdict.children[0],
    detail: verdict.children[2],
    tbody: all.find((el) => el.tagName === 'tbody'),
    legendNote,
    tableNote,
  };
}

/** 슬라이더 다섯 개와 단가 칸을 옮기고 change를 한 번 발화시킨다 — 위젯은 조작부 전체를 다시 읽는다. */
function fixture_update_controls(mounted, state) {
  mounted.inputs.flow.value = fixture_format_tick(state.flow, FLOW.scale);
  mounted.inputs.minutes.value = fixture_format_tick(state.minutes, MINUTES.scale);
  mounted.inputs.bath.value = fixture_format_tick(state.bath, BATH.scale);
  mounted.inputs['rise-shower'].value = fixture_format_tick(state.riseShower, RISE.scale);
  mounted.inputs['rise-bath'].value = fixture_format_tick(state.riseBath, RISE.scale);
  mounted.price.value = state.price ?? '';
  return mounted.dom.listeners_run_event(mounted.inputs.flow, 'change');
}

/** 범례 문단에서 두 교차 사이를 말하는 문장만 떼어 낸다. 틀이 깨졌으면 문단 전체를 돌려 어긋남으로 보인다. */
function fixture_read_together(text) {
  if (!text.startsWith(REFERENCE_LEGEND_LEAD)) return text;
  const end = text.indexOf(REFERENCE_LEGEND_TAIL);
  return end < 0 ? text : text.slice(REFERENCE_LEGEND_LEAD.length, end);
}

/** 지금 화면의 글자를 오라클과 같은 칸 이름으로 읽는다. */
function fixture_read_screen(mounted) {
  const shown = {};
  for (const name of SLIDER_NAMES) {
    shown[`slider.${name}-output`] = mounted.outputs[name].textContent;
    shown[`slider.${name}-valuetext`] = mounted.inputs[name].getAttribute('aria-valuetext');
  }
  // 카드는 [물 교차, 에너지 교차, 물 차이, 에너지 차이] 순서다(widget_mount의 append 순서).
  const [waterCross, energyCross, waterNow, energyNow] = mounted.cards;
  shown['cross.water'] = waterCross.textContent;
  shown['cross.energy'] = energyCross.textContent;
  shown['now.water'] = waterNow.textContent;
  shown['now.energy'] = energyNow.textContent;

  shown['verdict.state'] = mounted.verdict.dataset.state;
  shown['verdict.headline'] = mounted.headline.textContent;
  shown['verdict.detail'] = mounted.detail.textContent;
  shown['verdict.together'] = fixture_read_together(mounted.legendNote.textContent);

  // 비용 카드는 단가가 비면 DOM에서 빠진다 — 숨김이 아니라 부재다.
  const costBoxes = mounted.costBox.children;
  const costValue = (box) => (box ? box.children[1].children[0].textContent : ABSENT);
  shown['cost.cards'] = String(costBoxes.length);
  shown['cost.shower'] = costValue(costBoxes[0]);
  shown['cost.bath'] = costValue(costBoxes[1]);

  const marked = [];
  mounted.tbody.children.forEach((row, rowIndex) => {
    if (row.getAttribute('aria-current') === 'true') marked.push(rowIndex);
    row.children.forEach((cell, column) => {
      shown[`table.r${rowIndex}.c${column}`] = cell.textContent;
    });
  });
  shown['table.marked'] = marked.length ? marked.join(',') : 'none';
  shown['table.note'] = mounted.tableNote.textContent;

  // 렌더가 실제로 쓴 축을 인용한 캡션(캔버스 aria-label)과 범례 문단 전문.
  shown['axis.water'] = mounted.waterCanvas.getAttribute('aria-label');
  shown['axis.energy'] = mounted.energyCanvas.getAttribute('aria-label');
  shown['axis.legend'] = mounted.legendNote.textContent;
  return shown;
}
const TABLE_CELL_COUNT = TABLE_FLOWS_LPM.length * (1 + TABLE_BATH_LITRES.length);
const SCREEN_FIELD_COUNT = SLIDER_NAMES.length * 2 + 4 + 4 + 3 + TABLE_CELL_COUNT + 2 + 3;

// ── 대조 ─────────────────────────────────────────────────────

const MISMATCH_SAMPLE_MAX = 6;
const LONG_TIMEOUT_MS = 120000;

const test_label_state = (state) =>
  `Q=${fixture_format_tick(state.flow, FLOW.scale)} t=${fixture_format_tick(state.minutes, MINUTES.scale)} ` +
  `V=${state.bath / BATH.scale} ΔTs=${state.riseShower / RISE.scale} ΔTb=${state.riseBath / RISE.scale}` +
  (state.price === null ? '' : ` p=${state.price}`);

/** 어긋남을 칸별로 센다. 표본은 칸마다 앞의 몇 개만 남긴다(경계 격자는 수만 건이 될 수 있다). */
function test_create_tally() {
  return { count: 0, compared: 0, fired: 0, byField: new Map() };
}

function test_compare_state(state, got, tally) {
  const want = reference_describe_screen(state, 'axis.water' in got);
  for (const field of Object.keys(got)) {
    tally.compared += 1;
    if (got[field] === want[field]) continue;
    if (!tally.byField.has(field)) tally.byField.set(field, { count: 0, samples: [] });
    const entry = tally.byField.get(field);
    entry.count += 1;
    if (entry.samples.length < MISMATCH_SAMPLE_MAX) {
      entry.samples.push({ 상태: test_label_state(state), 칸: field, 화면: got[field], 정확: want[field] });
    }
  }
  tally.count += 1;
}

/** prefixes로 시작하는 칸의 어긋남만 모아 요약한다. */
function test_summarize(tally, prefixes) {
  const byField = {};
  const samples = [];
  let total = 0;
  for (const [field, entry] of tally.byField) {
    if (!prefixes.some((prefix) => field.startsWith(prefix))) continue;
    byField[field] = entry.count;
    total += entry.count;
    samples.push(...entry.samples.slice(0, 2));
  }
  return { 불일치: total, 칸별: byField, 처음: samples.slice(0, MISMATCH_SAMPLE_MAX) };
}
const CLEAN = { 불일치: 0, 칸별: {}, 처음: [] };

/** 칸 분류. 한 it이 한 분류를 지킨다 — 어느 분류가 깨졌는지가 실패 목록에서 바로 보인다. */
const FIELD_FAMILIES = [
  ['교차 분 카드 두 장', ['cross.']],
  ['지금 시간의 차이 카드 두 장 (부호 포함)', ['now.']],
  ['판정 상태 (hold / edge / break)', ['verdict.state']],
  ['판정 머리문장과 범례의 간격 문장', ['verdict.headline', 'verdict.together']],
  ['판정 세부문장 (교차 분·L·kWh)', ['verdict.detail']],
  ['비용 카드 (단가 비움이면 카드 부재)', ['cost.']],
];

// ── 격자 상태 생성 ───────────────────────────────────────────

const fixture_build_state = (overrides) => ({ ...DEFAULT_STATE, ...overrides });
let priceCursor = 0;
/** 단가를 차례로 돌려 준다 — 상태마다 다섯 단가 중 하나가 붙는다(결정적). */
const fixture_pick_price = () => PRICE_TEXTS[priceCursor++ % PRICE_TEXTS.length];

/** Q 전수 × V 전수 (나머지 기본값) — 물 교차·에너지 교차(기본 상승폭). */
function* fixture_walk_flow_bath() {
  for (const flow of FLOW.ticks) for (const bath of BATH.ticks) yield fixture_build_state({ flow, bath, price: fixture_pick_price() });
}
/** Q 전수 × t 전수 — 샤워 물·물 차이·샤워 kWh(기본 상승폭). */
function* fixture_walk_flow_minutes() {
  for (const flow of FLOW.ticks) {
    for (const minutes of MINUTES.ticks) yield fixture_build_state({ flow, minutes, price: fixture_pick_price() });
  }
}
/** 상승폭 전수 × V 전수 × Q 대표값(양 끝·기본값·유량 프리셋) — 에너지 교차·간격·hold·욕조 kWh. */
const FLOW_RISE_SAMPLE = fixture_pick_unique([
  FLOW.ticks[0],
  FLOW.ticks[FLOW.ticks.length - 1],
  DEFAULT_STATE.flow,
  ...SHOWER_FLOW_PRESETS.map((preset) => fixture_read_tick(preset.flow, FLOW.scale)),
]);
function* fixture_walk_rise_bath() {
  for (const flow of FLOW_RISE_SAMPLE) {
    for (const bath of BATH.ticks) {
      for (const riseShower of RISE.ticks) {
        for (const riseBath of RISE.ticks) {
          yield fixture_build_state({ flow, bath, riseShower, riseBath, price: fixture_pick_price() });
        }
      }
    }
  }
}
/** 상승폭 전수 × t 전수 — 샤워 kWh·에너지 차이·판정(기본 Q·V). */
function* fixture_walk_rise_minutes() {
  for (const minutes of MINUTES.ticks) {
    for (const riseShower of RISE.ticks) {
      for (const riseBath of RISE.ticks) {
        yield fixture_build_state({ minutes, riseShower, riseBath, price: fixture_pick_price() });
      }
    }
  }
}

/**
 * 경계 ①: 에너지 교차 V·ΔT_b/(Q·ΔT_s)가 시간 눈금 t에 **정확히** 떨어지는 상태 전부.
 * 정수식 q = V·ΔT_b·(유량 배율)·(시간 배율)/(ΔT_s·m)이 유량 눈금 위에 있는지로 찾는다.
 * ΔT_s = ΔT_b는 물 교차와 같은 자리라 경계 ②가 맡는다.
 */
function enum_scan_energy_ticks() {
  const out = [];
  const scale = FLOW.scale * MINUTES.scale;
  for (const bath of BATH.ticks) {
    for (const minutes of MINUTES.ticks) {
      if (minutes === 0) continue;
      for (const riseShower of RISE.ticks) {
        for (const riseBath of RISE.ticks) {
          if (riseShower === riseBath) continue;
          const numerator = (bath / BATH.scale) * riseBath * scale;
          const denominator = riseShower * minutes;
          if (numerator % denominator !== 0) continue;
          const flow = numerator / denominator;
          if (FLOW.set.has(flow)) out.push(fixture_build_state({ flow, minutes, bath, riseShower, riseBath }));
        }
      }
    }
  }
  return out;
}

/** 경계 ②: 물 교차 V/Q가 시간 눈금 t에 정확히 떨어지는 (Q, t, V) 전부. 상승폭은 따로 곱한다. */
function enum_scan_water_ticks() {
  const out = [];
  const scale = FLOW.scale * MINUTES.scale;
  for (const bath of BATH.ticks) {
    for (const minutes of MINUTES.ticks) {
      if (minutes === 0) continue;
      const numerator = (bath / BATH.scale) * scale;
      if (numerator % minutes !== 0) continue;
      const flow = numerator / minutes;
      if (FLOW.set.has(flow)) out.push({ flow, minutes, bath });
    }
  }
  return out;
}

/**
 * 경계 ③: 상승폭이 다른 상태 중 두 교차가 가장 가까운 구석.
 * 간격 = (V/Q)·|ΔT_s − ΔT_b|/ΔT_s이므로 Q 최대·V 최소·상승폭 차 한 눈금·ΔT_s 최대에서 가장 좁다
 * — Q=20, V=40, 45/44 K. 순서를 바꾼 44/45도 넣는다. 둘 다 hold가 아니어야 한다.
 */
const RISE_TOP = RISE.ticks[RISE.ticks.length - 1];
const RISE_NEXT = RISE.ticks[RISE.ticks.length - 2];
const NARROW_EDGES = [
  { flow: FLOW.ticks[FLOW.ticks.length - 1], bath: BATH.ticks[0], riseShower: RISE_TOP, riseBath: RISE_NEXT },
  { flow: FLOW.ticks[FLOW.ticks.length - 1], bath: BATH.ticks[0], riseShower: RISE_NEXT, riseBath: RISE_TOP },
];

const ENERGY_TICK_STATES = enum_scan_energy_ticks();
const WATER_TICKS = enum_scan_water_ticks();

function* fixture_walk_water_ticks(riseValues) {
  for (const point of WATER_TICKS) {
    for (const riseShower of riseValues) {
      for (const riseBath of riseValues) {
        yield fixture_build_state({ ...point, riseShower, riseBath, price: fixture_pick_price() });
      }
    }
  }
}
/** 경계 ②를 기본 상승폭에서만 (마운트 경로용). */
function* fixture_walk_water_points() {
  for (const point of WATER_TICKS) yield fixture_build_state({ ...point, price: fixture_pick_price() });
}
function* fixture_walk_narrow(minuteValues) {
  for (const edge of NARROW_EDGES) {
    for (const minutes of minuteValues) yield fixture_build_state({ ...edge, minutes, price: fixture_pick_price() });
  }
}
function* fixture_walk_energy_ticks() {
  for (const state of ENERGY_TICK_STATES) yield { ...state, price: fixture_pick_price() };
}

/** 마운트 경로의 대표값 격자: 슬라이더마다 양 끝·기본값·프리셋·표의 값, 단가 다섯 가지를 돌려 붙인다. */
function* fixture_walk_samples() {
  for (const flow of FLOW_SAMPLE) {
    for (const minutes of MINUTES_SAMPLE) {
      for (const bath of BATH_SAMPLE) {
        for (const riseShower of RISE_SAMPLE) {
          for (const riseBath of RISE_SAMPLE) {
            yield fixture_build_state({ flow, minutes, bath, riseShower, riseBath, price: fixture_pick_price() });
          }
        }
      }
    }
  }
}

// ── 실행 (한 번만 돌리고 분류별 it이 나눠 읽는다) ─────────────

function test_run_display(walks, read = fixture_read_display) {
  const tally = test_create_tally();
  for (const walk of walks) for (const state of walk) test_compare_state(state, read(state), tally);
  return tally;
}

/** 마운트한 위젯 하나로 상태 목록을 돈다. */
function test_run_mounted(walks) {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget('');
  try {
    for (const walk of walks) {
      for (const state of walk) {
        tally.fired += fixture_update_controls(mounted, state);
        test_compare_state(state, fixture_read_screen(mounted), tally);
      }
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return tally;
}

/** 프리셋 버튼을 차례로 눌러 읽는다. 단가는 기본(비움)이다. */
function test_run_presets() {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget('');
  try {
    let expected = { ...DEFAULT_STATE };
    test_compare_state(expected, fixture_read_screen(mounted), tally);
    for (const preset of SHOWER_FLOW_PRESETS) {
      tally.fired += mounted.dom.listeners_run_event(mounted.presets[preset.key], 'click');
      expected = { ...expected, flow: fixture_read_tick(preset.flow, FLOW.scale) };
      test_compare_state(expected, fixture_read_screen(mounted), tally);
    }
    SHOWER_SITUATION_PRESETS.forEach((preset, index) => {
      tally.fired += mounted.dom.listeners_run_event(mounted.presets[preset.key], 'click');
      test_compare_state(SITUATION_STATES[index], fixture_read_screen(mounted), tally);
    });
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return tally;
}

/** 지연 실행: 첫 it이 값을 치르고 나머지는 결과를 나눠 읽는다. */
function test_create_lazy(run) {
  let cached = null;
  return () => {
    if (!cached) cached = run();
    return cached;
  };
}

const DISPLAY_COUNTS = {
  flowBath: FLOW.ticks.length * BATH.ticks.length,
  flowMinutes: FLOW.ticks.length * MINUTES.ticks.length,
  riseBath: FLOW_RISE_SAMPLE.length * BATH.ticks.length * RISE.ticks.length ** 2,
  riseMinutes: MINUTES.ticks.length * RISE.ticks.length ** 2,
  energyTicks: ENERGY_TICK_STATES.length,
  waterTicks: WATER_TICKS.length * RISE_COARSE.length ** 2,
  narrowEdges: NARROW_EDGES.length * MINUTES.ticks.length,
};
const DISPLAY_TOTAL = Object.values(DISPLAY_COUNTS).reduce((sum, value) => sum + value, 0);
const DISPLAY_AXIS_TOTAL = DISPLAY_COUNTS.flowBath + DISPLAY_COUNTS.flowMinutes + DISPLAY_COUNTS.narrowEdges;
const MOUNT_SAMPLE_COUNT =
  FLOW_SAMPLE.length * MINUTES_SAMPLE.length * BATH_SAMPLE.length * RISE_SAMPLE.length ** 2;
const MOUNT_EDGE_COUNT = WATER_TICKS.length + NARROW_EDGES.length * MINUTES_SAMPLE.length;
const MOUNT_TOTAL = MOUNT_SAMPLE_COUNT + MOUNT_EDGE_COUNT;

const DISPLAY_RUN = test_create_lazy(() => {
  priceCursor = 0;
  return test_run_display([
    fixture_walk_flow_bath(),
    fixture_walk_flow_minutes(),
    fixture_walk_rise_bath(),
    fixture_walk_rise_minutes(),
    fixture_walk_energy_ticks(),
    fixture_walk_water_ticks(RISE_COARSE),
    fixture_walk_narrow(MINUTES.ticks),
  ]);
});

/** 패널 캡션은 (Q, V)·(Q, t) 격자와 가장 좁은 구석에서 본다. */
const DISPLAY_AXIS_RUN = test_create_lazy(() => {
  priceCursor = 0;
  return test_run_display(
    [fixture_walk_flow_bath(), fixture_walk_flow_minutes(), fixture_walk_narrow(MINUTES.ticks)],
    fixture_read_axis_display,
  );
});

const MOUNT_RUN = test_create_lazy(() => {
  priceCursor = 0;
  return test_run_mounted([
    fixture_walk_samples(),
    // 경계도 마운트로: 물 교차가 눈금 위(기본 상승폭), 가장 좁은 구석(시간 대표값).
    fixture_walk_water_points(),
    fixture_walk_narrow(MINUTES_SAMPLE),
  ]);
});

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it('표기 규칙: 0.5는 올림, 자리수는 반올림 전 값으로, 부호는 정확한 값에서', () => {
    expect(reference_format_litres(frac_read_decimal('20.05'))).toBe('20.1');
    expect(reference_format_litres(frac_read_decimal('20.04999'))).toBe('20.0');
    expect(reference_format_minutes(frac_read_decimal('0.995'))).toBe('1.00'); // 1 미만 → 2자리
    expect(reference_format_minutes(frac_read_decimal('1'))).toBe('1.0');
    expect(reference_format_kwh(frac_read_decimal('0.9995'))).toBe('1.000');
    expect(reference_format_kwh(frac_read_decimal('10.465'))).toBe('10.47');
    expect(reference_format_gap(frac_read_decimal('0.125'))).toBe('8 s'); // 7.5 s → 8
    expect(reference_format_gap(frac_read_decimal('-0.99'))).toBe('59 s');
    expect(reference_format_gap(frac_read_decimal('1'))).toBe('1.0 min');
    expect(reference_format_signed(frac_create(0n), reference_format_litres)).toBe('0.0');
    expect(reference_format_signed(frac_read_decimal('-0.01'), reference_format_litres)).toBe(`${MINUS}0.0`);
    expect(reference_format_signed(frac_read_decimal('0.0004'), reference_format_kwh)).toBe('+0.000');
  });

  it('식: 80 L를 25 K 데우면 8,372 kJ, 3,600 kJ = 1 kWh, 상승폭이 같으면 두 교차가 정확히 같다', () => {
    const exact = reference_calculate_state(DEFAULT_STATE);
    // 80 · 4.186 · 25 = 8372 kJ → 8372/3600 kWh
    expect(frac_compare(frac_multiply(exact.bathKwh, REFERENCE_KJ_PER_KWH), frac_create(8372n))).toBe(0);
    expect(reference_format_kwh(exact.bathKwh)).toBe('2.33');
    const same = reference_calculate_state(fixture_build_state({ riseShower: 30, riseBath: 30 }));
    expect(frac_compare(same.waterCrossover, same.energyCrossover)).toBe(0);
    expect(same.verdict).toBe('hold');
  });

  it('경계 목록이 실제로 경계다 — 0건이면 경계를 찾는 식이 틀린 것이다', () => {
    expect(ENERGY_TICK_STATES.length).toBeGreaterThan(0);
    expect(WATER_TICKS.length).toBeGreaterThan(0);
    for (const state of ENERGY_TICK_STATES.slice(0, 200)) {
      const exact = reference_calculate_state(state);
      expect(frac_compare(exact.energyCrossover, exact.minutes)).toBe(0);
    }
    for (const point of WATER_TICKS) {
      const exact = reference_calculate_state(fixture_build_state(point));
      expect(frac_compare(exact.waterCrossover, exact.minutes)).toBe(0);
    }
    // 가장 좁은 구석은 명세가 적은 좌표(Q=20, V=40, 45/44)이고, 간격이 0이 아니다.
    expect(NARROW_EDGES.map((edge) => test_label_state(fixture_build_state(edge)))).toEqual([
      'Q=20.00 t=8.0 V=40 ΔTs=45 ΔTb=44',
      'Q=20.00 t=8.0 V=40 ΔTs=44 ΔTb=45',
    ]);
    for (const edge of NARROW_EDGES) {
      const exact = reference_calculate_state(fixture_build_state(edge));
      expect(frac_read_sign(exact.gap)).not.toBe(0);
      expect(exact.merged).toBe(false);
    }
  });

  it('축 끝값: 57.5는 눈금 20(캡션 자릿수 0)에서 "58", 눈금 1·2.5·0.25에서 자릿수가 하나씩 는다', () => {
    expect(reference_calculate_tick_step(frac_read_decimal('57.5'))).toEqual({ tenths: 20n, decade: 1 });
    expect(reference_format_axis_end(frac_read_decimal('57.5'))).toBe('58');
    expect(reference_format_axis_end(frac_read_decimal('4.6'))).toBe('4.6'); // 간격 1 → 0.1
    expect(reference_format_axis_end(frac_read_decimal('11.5'))).toBe('11.50'); // 간격 2.5 → 0.25
    expect(reference_format_axis_end(frac_read_decimal('1.15'))).toBe('1.150'); // 간격 0.25 → 0.025
    // Q=4 V=200 기본 상승폭: x 끝 = (200/4)·1.15 = 57.5분 정확
    const axes = reference_calculate_axes(
      reference_calculate_state(fixture_build_state({ flow: FLOW.ticks[0], bath: BATH.ticks[BATH.ticks.length - 1] })),
      frac_create(DEFAULT_STATE.riseShower),
    );
    expect(frac_compare(axes.xMax, frac_read_decimal('57.5'))).toBe(0);
  });

  it('표 설명 꼬리: 표의 끝 행 유량은 model.js 데이터에서 온다', () => {
    expect(reference_describe_table_tail(FLOW.ticks[0])).toBe(
      ' The flow slider is below the lowest row right now, so none is marked — the 6.00 row is the nearest.',
    );
    expect(reference_describe_table_tail(FLOW.ticks[FLOW.ticks.length - 1])).toBe(
      ' The flow slider is above the highest row right now, so none is marked — the 15.00 row is the nearest.',
    );
    expect(reference_describe_table_tail(DEFAULT_STATE.flow)).toBe(REFERENCE_TABLE_NOTE_BETWEEN);
    for (const tick of TABLE_FLOW_TICKS) expect(reference_describe_table_tail(tick)).toBe(REFERENCE_TABLE_NOTE_MARKED);
  });

  it('격자는 슬라이더가 스냅하는 값 그대로다', () => {
    expect([FLOW.ticks.length, MINUTES.ticks.length, BATH.ticks.length, RISE.ticks.length]).toEqual([1601, 51, 33, 36]);
    for (const tick of FLOW.ticks) {
      const value = Number(fixture_format_tick(tick, FLOW.scale));
      expect(model_clamp_flow(value)).toBe(value);
    }
    for (const tick of MINUTES.ticks) {
      const value = Number(fixture_format_tick(tick, MINUTES.scale));
      expect(model_clamp_minutes(value)).toBe(value);
    }
    for (const tick of BATH.ticks) expect(model_clamp_bath_litres(tick / BATH.scale)).toBe(tick / BATH.scale);
    for (const tick of RISE.ticks) expect(model_clamp_rise(tick / RISE.scale)).toBe(tick / RISE.scale);
    for (const state of [DEFAULT_STATE, ...SITUATION_STATES]) {
      expect(FLOW.set.has(state.flow) && MINUTES.set.has(state.minutes) && BATH.set.has(state.bath)).toBe(true);
      expect(RISE.set.has(state.riseShower) && RISE.set.has(state.riseBath)).toBe(true);
    }
    for (const tick of TABLE_FLOW_TICKS) expect(FLOW.set.has(tick)).toBe(true);
  });
});

// ── 표시 함수 경로 ───────────────────────────────────────────

describe(`표시 함수 — 의존 부분공간 전수 + 정확 경계 (${DISPLAY_TOTAL}상태)`, () => {
  it(
    '격자가 실제로 돌았다 (상태 수 × 칸 수)',
    () => {
      const run = DISPLAY_RUN();
      expect(run.count).toBe(DISPLAY_TOTAL);
      expect(run.compared).toBe(run.count * DISPLAY_FIELD_COUNT);
    },
    LONG_TIMEOUT_MS,
  );

  for (const [title, prefixes] of FIELD_FAMILIES) {
    it(`${title}: display_* 문자열이 오라클과 글자 하나까지 같다`, () => {
      expect(test_summarize(DISPLAY_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }

  it('민감도 표: model_calculate_crossover_table → display_format_minutes가 오라클과 같다', () => {
    const got = model_calculate_crossover_table().map((row) => [
      row.flow.toFixed(REFERENCE_FLOW_DIGITS),
      ...row.minutes.map((minutes) => display_format_minutes(minutes)),
    ]);
    expect(got).toEqual(REFERENCE_TABLE);
  });

  it('가장 좁은 다른 상승폭(Q=20 V=40, 45/44·44/45) × 시간 전수: hold가 아니고 머리문장은 "떨어져 있다"', () => {
    const states = [...fixture_walk_narrow(MINUTES.ticks)];
    const verdicts = new Set();
    const bad = [];
    for (const state of states) {
      const want = reference_describe_screen(state);
      const got = fixture_read_display(state);
      verdicts.add(got['verdict.state']);
      // 오라클과 글자까지 같고, 명세의 두 조건을 따로 한 번 더 본다(오라클이 틀려도 걸리게).
      const apart =
        got['verdict.state'] === 'break' || got['verdict.headline'].startsWith(REFERENCE_HEADLINE.edge);
      if (got['verdict.state'] === 'hold' || !apart || got['verdict.headline'] !== want['verdict.headline']) {
        bad.push({ 상태: test_label_state(state), 판정: got['verdict.state'], 화면: got['verdict.headline'] });
      }
    }
    expect(states.length).toBe(NARROW_EDGES.length * MINUTES.ticks.length);
    expect(bad).toEqual([]);
    expect(verdicts.has('hold')).toBe(false);
    // 기본 시간(8분)은 두 교차(약 2분) 바깥이라 edge — 머리문장이 간격을 초로 적는다.
    const atDefault = fixture_read_display(fixture_build_state(NARROW_EDGES[0]));
    expect(atDefault['verdict.state']).toBe('edge');
    expect(atDefault['verdict.headline']).toMatch(/sit apart.* \d+ s apart\.$/);
  });

  it('표 설명 꼬리: display_describe_table_row가 Q 전수에서 오라클과 같다 (강조 / 아래 / 위 / 사이)', () => {
    const bad = [];
    const seen = new Set();
    for (const tick of FLOW.ticks) {
      const flow = Number(fixture_format_tick(tick, FLOW.scale));
      const want = reference_describe_table_tail(tick);
      const got = display_describe_table_row(TABLE_FLOW_TICKS.includes(tick), flow);
      seen.add(want);
      if (got !== want) bad.push({ Q: fixture_format_tick(tick, FLOW.scale), 화면: got, 정확: want });
    }
    expect(seen.size).toBe(4);
    expect(bad.slice(0, MISMATCH_SAMPLE_MAX)).toEqual([]);
  });

  it(
    `패널 캡션: chart_describe_panel(→ display_format_axis)의 축 끝값·문장이 오라클과 같다 (${DISPLAY_AXIS_TOTAL}상태)`,
    () => {
      const run = DISPLAY_AXIS_RUN();
      expect(run.count).toBe(DISPLAY_AXIS_TOTAL);
      expect(run.compared).toBe(run.count * AXIS_FIELD_COUNT);
      expect(test_summarize(run, ['axis.'])).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );
});

// ── 마운트 경로 ──────────────────────────────────────────────

describe(`마운트한 화면 — 슬라이더를 실제로 옮겨 읽는다 (${MOUNT_TOTAL}상태)`, () => {
  it(
    '격자가 실제로 돌았다 — change 리스너가 불리지 않았으면 읽기는 첫 화면의 재탕이다',
    () => {
      const run = MOUNT_RUN();
      expect(run.count).toBe(MOUNT_TOTAL);
      expect(run.fired).toBe(run.count);
      expect(run.compared).toBe(run.count * SCREEN_FIELD_COUNT);
    },
    LONG_TIMEOUT_MS,
  );

  for (const [title, prefixes] of [
    ['손잡이 글자 (output·aria-valuetext)', ['slider.']],
    ...FIELD_FAMILIES,
    ['민감도 표·강조 행·표 설명(꼬리 넷)', ['table.']],
    ['패널 캡션의 축 끝값·범례 문단 전문', ['axis.']],
  ]) {
    it(`${title}: 화면 글자가 오라클과 같다`, () => {
      expect(test_summarize(MOUNT_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }

  it('프리셋 버튼(유량 3 + 상황 3)을 누른 화면이 오라클과 같다', () => {
    const run = test_run_presets();
    expect(run.count).toBe(1 + SHOWER_FLOW_PRESETS.length + SHOWER_SITUATION_PRESETS.length);
    expect(run.fired).toBe(SHOWER_FLOW_PRESETS.length + SHOWER_SITUATION_PRESETS.length);
    expect(run.compared).toBe(run.count * SCREEN_FIELD_COUNT);
    expect(test_summarize(run, [''])).toEqual(CLEAN);
  });

  it('57.5 경우: URL ?q=4&v=200으로 뜬 물 패널 캡션이 x축 끝을 "58"로 적는다(0.5 올림)', () => {
    const state = fixture_build_state({ flow: FLOW.ticks[0], bath: BATH.ticks[BATH.ticks.length - 1] });
    const search =
      `?q=${fixture_format_tick(state.flow, FLOW.scale)}&t=${fixture_format_tick(state.minutes, MINUTES.scale)}` +
      `&v=${state.bath / BATH.scale}&ds=${state.riseShower / RISE.scale}&db=${state.riseBath / RISE.scale}`;
    const mounted = fixture_mount_widget(search);
    try {
      const tally = test_create_tally();
      const got = fixture_read_screen(mounted);
      test_compare_state(state, got, tally);
      expect(got['axis.water']).toContain('Horizontal axis 0 to 58 minutes');
      expect(test_summarize(tally, [''])).toEqual(CLEAN);
      mounted.widget_reset();
    } finally {
      mounted.dom.restore();
    }
  });
});
