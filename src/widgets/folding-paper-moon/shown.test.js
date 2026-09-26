/**
 * 종이접기 — **화면에 찍히는 숫자 문자열**을 정확 유리수 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 딱 한 종류다: **표시 단계의 반올림이 값을 바꾼다.**
 * 모델이 옳은 두께를 내도 카드에 틀린 글자가 찍히면 독자가 읽는 것은 그 글자다.
 * 곡선도, 자도, 배지도 그대로라서 화면에는 아무 흔적이 없다.
 *
 * 전례(2026-09-26 감사): 0.23 mm · 45접기에서 필요 길이 카드가
 * "about 1000 billion × the distance to the Sun"이라고 찍었다. 정확한 값은
 * 9.966 × 10¹¹배이고, 이름(billion)을 **반올림 전에** 고른 뒤 996.6이 1000으로
 * 올라간 것이다 — 맞는 표기는 "1 trillion". `units_format_count_words`에서 고쳤다.
 * 그 사고가 새어 나간 이유는 이 위젯에 **화면 문자열을 독립적으로 다시 만드는
 * 테스트가 없었기** 때문이다. 이 파일이 그 자리다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 값은 BigInt 분자/분모 **유리수**로 잡는다. 슬라이더 두께는 눈금 위의
 *      십진수(tick/100 mm)라 정확한 유리수이고, t₀·2ⁿ도 정확하다. π·√10·log₁₀2가
 *      끼는 값은 60자리 유리수 근사로 잡는다 — 무리수라 반올림 경계에 정확히
 *      얹히지 않으므로 60자리면 판정이 흔들리지 않는다.
 *   ⓑ 반올림도 정수 연산으로 한다(0.5는 올림 = `toPrecision`/`toFixed`의 명세).
 *      부동소수를 한 번도 거치지 않으므로 **경계가 경계로 남는다.**
 *   ⓒ 위젯·모델·units의 **표시 함수를 부르지 않는다.** 규칙(단위 전환점, 유효숫자,
 *      이름을 반올림 뒤에 고르기, 문구 틀)만 읽어 여기서 다시 쓴다. 같은 함수를
 *      두 번 부르면 검사가 아니다. 모델에서는 **데이터**(범위 상수, 기준 높이
 *      목록)만 가져온다 — 높이 값은 `String()`으로 십진 표기를 받아 정확한 유리수로 옮긴다.
 *   ⓓ 자리수·전환점·여백 비율은 소스에서 읽는다(모듈 지역 상수라 import할 수 없다).
 *      위젯이 자리수를 바꾸면 이 파일도 따라간다. 하드코딩하지 않는다.
 *   ⓔ 화면은 DOM 스텁에 **실제로 붙여서** 읽는다(`lifecycle.test.js`와 같은 방식).
 *      순수 함수만 보면 함수를 만들어 두고 부르지 않아도 통과한다.
 *
 * 격자: 두께 슬라이더의 모든 눈금(model.js의 MIN·MAX·STEP에서 만든다) ×
 * 접기 FOLD_COUNT_MIN..FOLD_COUNT_MAX × 세로축 두 종류. 축은 차트 캡션과
 * 차트 aria-label만 바꾸지만, 축을 바꿔도 나머지가 그대로인지까지 같이 본다.
 *
 * 경계 규칙: 모델은 "넘어섰다"를 **엄격한 >**로 읽는다(`model_check_passed`,
 * `model_calculate_folds_to_reach`의 `<=` 루프). 오라클도 >로 쓴다. 격자 안에
 * t₀·2ᵏ이 기준 높이와 **정확히 같은** 상태가 실제로 있다(0.19 mm·2², 0.38 mm·2¹ =
 * 은행 카드 0.76 mm). 아래 it 하나가 그 상태들을 따로 못박는다.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FOLD_THICKNESS_MIN_MM,
  FOLD_THICKNESS_MAX_MM,
  FOLD_THICKNESS_STEP_MM,
  FOLD_THICKNESS_DEFAULT_MM,
  FOLD_COUNT_MIN,
  FOLD_COUNT_MAX,
  FOLD_COUNT_DEFAULT,
  FOLD_THICKNESS_FACTOR,
  FOLD_REFERENCE_LIST,
  model_clamp_thickness_mm,
} from './model.js';
import { widget_mount, RAIL_LOW_M, RAIL_HIGH_M, RAIL_LEGEND_ICON_TEXT } from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 표시 규약을 코드에서 읽는다 ─────────────────────────────
const WIDGET_SOURCE = readFileSync(new URL('./widget.js', import.meta.url), 'utf8');
const UNITS_SOURCE = readFileSync(new URL('../_shared/units.js', import.meta.url), 'utf8');

/** `const NAME = <숫자>;`의 숫자를 **글자 그대로** 읽는다. 유리수로 옮길 때 쓴다. */
function test_read_constant_text(source, name) {
  const found = source.match(new RegExp(`const ${name} = (-?[0-9.]+(?:e-?[0-9]+)?);`));
  if (!found) throw new Error(`소스에서 상수 ${name}를 못 찾았다 — 표기 규약이 바뀌었다.`);
  return found[1];
}
function test_read_constant_string(source, name) {
  const found = source.match(new RegExp(`const ${name} = '([^']*)';`));
  if (!found) throw new Error(`소스에서 상수 ${name}를 못 찾았다 — 표기 규약이 바뀌었다.`);
  return found[1];
}

const SIGNIFICANT_DIGITS = Number(test_read_constant_text(WIDGET_SOURCE, 'SIGNIFICANT_DIGITS'));
const TABLE_SIGNIFICANT_DIGITS = Number(test_read_constant_text(WIDGET_SOURCE, 'TABLE_SIGNIFICANT_DIGITS'));
const CHART_HEIGHT_PX = Number(test_read_constant_text(WIDGET_SOURCE, 'CHART_HEIGHT_PX'));
const CHART_PAD_TOP = Number(test_read_constant_text(WIDGET_SOURCE, 'CHART_PAD_TOP'));
const CHART_PAD_BOTTOM = Number(test_read_constant_text(WIDGET_SOURCE, 'CHART_PAD_BOTTOM'));
const CHART_SCALE_PAD_RATIO_TEXT = test_read_constant_text(WIDGET_SOURCE, 'CHART_SCALE_PAD_RATIO');
const CHART_CRUSHED_PX = Number(test_read_constant_text(WIDGET_SOURCE, 'CHART_CRUSHED_PX'));
const RAIL_PAD_X = Number(test_read_constant_text(WIDGET_SOURCE, 'RAIL_PAD_X'));
const RAIL_FOLD_TICK_MAX = Number(test_read_constant_text(WIDGET_SOURCE, 'RAIL_FOLD_TICK_MAX'));
const VERDICT_REACHED_KEY = test_read_constant_string(WIDGET_SOURCE, 'VERDICT_REACHED_KEY');

/** units.js의 전환점. 규칙은 여기서 다시 쓰고, **어디서 바뀌는지만** 읽어 온다. */
const UNITS_MM_PER_M_TEXT = test_read_constant_text(UNITS_SOURCE, 'MM_PER_M');
const UNITS_M_PER_KM_TEXT = test_read_constant_text(UNITS_SOURCE, 'M_PER_KM');
const UNITS_MILLIMETRE_CEILING_M_TEXT = test_read_constant_text(UNITS_SOURCE, 'MILLIMETRE_CEILING_M');
const UNITS_KILOMETRE_FLOOR_M_TEXT = test_read_constant_text(UNITS_SOURCE, 'KILOMETRE_FLOOR_M');
const UNITS_SCIENTIFIC_FLOOR_KM_TEXT = test_read_constant_text(UNITS_SOURCE, 'SCIENTIFIC_FLOOR_KM');
const UNITS_COUNT_STEP_TEXT = test_read_constant_text(UNITS_SOURCE, 'COUNT_STEP');

/** 축 코드(URL `axis=`). `{ [AXIS_LINEAR]: 0, [AXIS_LOG]: 1 }`를 읽는다. */
const [AXIS_CODE_LINEAR, AXIS_CODE_LOG] = (() => {
  const found = WIDGET_SOURCE.match(/const AXIS_URL_CODE = \{ \[AXIS_LINEAR\]: (\d+), \[AXIS_LOG\]: (\d+) \};/);
  if (!found) throw new Error('widget.js에서 AXIS_URL_CODE를 못 찾았다.');
  return [Number(found[1]), Number(found[2])];
})();

/** 프리셋 칩. widget.js의 모듈 지역 배열을 소스에서 읽는다. */
const PRESET_LIST = (() => {
  const block = WIDGET_SOURCE.match(/const FOLD_PRESETS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('widget.js에서 FOLD_PRESETS를 못 찾았다.');
  const out = [];
  for (const found of block[1].matchAll(
    /\{ key: '([^']+)', label: '([^']+)', thicknessMm: ([0-9.]+), foldCount: (\d+) \}/g,
  )) {
    out.push({ key: found[1], label: found[2], thicknessText: found[3], foldCount: Number(found[4]) });
  }
  return out;
})();

/** 스텁 캔버스의 CSS 폭. 자의 "One fold moves the marker … px"가 이 폭에서 나온다. */
const STUB_WIDTH_PX = 900;

/**
 * 문구 장식. 숫자가 아니라 규약이므로 여기서 고정한다 — 바뀌면 이 파일이 걸리는 것이 맞다.
 * 이름표(thousand …)도 영어 단위어라 고정이다.
 */
const TIMES_SIGN = '×'; // U+00D7
const EM_DASH = '—'; // U+2014
const SUPERSCRIPT_MAP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const COUNT_NAME_LIST = ['thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion'];
const REFERENCE_ARTICLE_LIST = ['A ', 'An ', 'The ', 'One '];
const AXIS_WORD = { linear: 'linear', log: 'logarithmic' };

// ── 정확 유리수 ─────────────────────────────────────────────
function frac_calculate_gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}
/** 유리수. 분모는 언제나 양수, 언제나 약분된 꼴. */
function frac_create(num, den = 1n) {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new Error('분모 0');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = frac_calculate_gcd(n, d) || 1n;
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}
const frac_add = (a, b) => frac_create(a.n * b.d + b.n * a.d, a.d * b.d);
const frac_sub = (a, b) => frac_create(a.n * b.d - b.n * a.d, a.d * b.d);
const frac_mul = (a, b) => frac_create(a.n * b.n, a.d * b.d);
const frac_div = (a, b) => frac_create(a.n * b.d, a.d * b.n);
function frac_compare(a, b) {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}
const frac_pow10 = (power) => (power >= 0 ? frac_create(10n ** BigInt(power)) : frac_create(1n, 10n ** BigInt(-power)));

/** "0.000063", "1e7", "149597870700" 같은 십진 표기를 정확한 유리수로. */
function frac_create_from_decimal(text) {
  const found = String(text).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[2] ?? '';
  const exponent = Number(found[3] ?? 0) - fraction.length;
  return frac_mul(frac_create(BigInt(found[1] + fraction)), frac_pow10(exponent));
}
/**
 * double 상수를 **그 상수가 적힌 십진 값**으로. `String(6.3e-5)`는 "0.000063"이다 —
 * 모델 주석이 말하는 값(0.063 mm)이지, 그 double의 이진 전개가 아니다.
 */
const frac_create_from_number = (value) => frac_create_from_decimal(String(value));

/** 정수 제곱근(내림). Newton. */
function frac_calculate_isqrt(value) {
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

// ── 무리수 상수 (60자리 유리수 근사) ─────────────────────────
const IRRATIONAL_DIGITS = 60;
const PI_TEXT = '3.141592653589793238462643383279502884197169399375105820974944592307816406286';
const LOG10_TWO_TEXT = '0.301029995663981195213738894724493026768189881462108541310430';
const PI_FRAC = frac_create_from_decimal(PI_TEXT.slice(0, IRRATIONAL_DIGITS + 2));
const LOG10_TWO_FRAC = frac_create_from_decimal(LOG10_TWO_TEXT.slice(0, IRRATIONAL_DIGITS + 2));
const SQRT_TEN_FRAC = frac_create(
  frac_calculate_isqrt(10n * 10n ** BigInt(2 * IRRATIONAL_DIGITS)),
  10n ** BigInt(IRRATIONAL_DIGITS),
);

// ── 오라클: 반올림과 표기 ───────────────────────────────────
/** 양의 유리수의 floor(log10). BigInt 비교만 쓴다 — Math.log10은 10의 거듭제곱에서 흔들린다. */
function frac_calculate_floor_log10(value) {
  if (value.n <= 0n) throw new Error('양수가 아니다');
  let exponent = value.n.toString().length - value.d.toString().length;
  while (frac_compare(value, frac_pow10(exponent)) < 0) exponent -= 1;
  while (frac_compare(value, frac_pow10(exponent + 1)) >= 0) exponent += 1;
  return exponent;
}

/**
 * 유효숫자 digits자리로 반올림(0.5는 올림). 결과는 digitsInt × 10^scale.
 * 반올림이 10ᵖ을 만들면 지수를 하나 올린다 — `toPrecision`과 같은 결과 꼴이다.
 */
function reference_round_significant(value, digits) {
  let exponent = frac_calculate_floor_log10(value);
  const shift = digits - 1 - exponent;
  const scaled = frac_mul(value, frac_pow10(shift));
  let mantissa = (2n * scaled.n + scaled.d) / (2n * scaled.d);
  if (mantissa === 10n ** BigInt(digits)) {
    mantissa = 10n ** BigInt(digits - 1);
    exponent += 1;
  }
  return { mantissa, exponent, scale: exponent - digits + 1 };
}
const reference_read_rounded_value = (rounded) => frac_mul(frac_create(rounded.mantissa), frac_pow10(rounded.scale));

/** 정수 × 10^scale을 꼬리 0 없는 십진 문자열로. grouped면 정수부에 쉼표. */
function reference_format_scaled(integer, scale, grouped = false) {
  let whole;
  let fraction = '';
  if (scale >= 0) {
    whole = (integer * 10n ** BigInt(scale)).toString();
  } else {
    let body = integer.toString();
    while (body.length <= -scale) body = `0${body}`;
    whole = body.slice(0, body.length + scale);
    fraction = body.slice(body.length + scale).replace(/0+$/, '');
  }
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${whole}.${fraction}` : whole;
}

function reference_format_significant(value, digits) {
  if (value.n === 0n) return '0';
  const rounded = reference_round_significant(value, digits);
  return reference_format_scaled(rounded.mantissa, rounded.scale);
}

function reference_format_exponent(power) {
  return `10${String(power).split('').map((c) => SUPERSCRIPT_MAP[c]).join('')}`;
}

/** 지수 표기. 가수는 유효숫자 digits자리, 꼬리 0 없음. */
function reference_format_scientific(value, digits) {
  const rounded = reference_round_significant(value, digits);
  const mantissa = reference_format_scaled(rounded.mantissa, 1 - digits);
  return `${mantissa} ${TIMES_SIGN} ${reference_format_exponent(rounded.exponent)}`;
}

const MM_PER_M_FRAC = frac_create_from_decimal(UNITS_MM_PER_M_TEXT);
const M_PER_KM_FRAC = frac_create_from_decimal(UNITS_M_PER_KM_TEXT);
const MILLIMETRE_CEILING_FRAC = frac_create_from_decimal(UNITS_MILLIMETRE_CEILING_M_TEXT);
const KILOMETRE_FLOOR_FRAC = frac_create_from_decimal(UNITS_KILOMETRE_FLOOR_M_TEXT);
const SCIENTIFIC_FLOOR_KM_FRAC = frac_create_from_decimal(UNITS_SCIENTIFIC_FLOOR_KM_TEXT);
const COUNT_STEP_FRAC = frac_create_from_decimal(UNITS_COUNT_STEP_TEXT);

/**
 * 사람이 읽는 길이. mm → m → km, km로도 너무 크면 미터 지수 표기.
 * km 전환 뒤의 임계는 **반올림한 뒤의 km 값**으로 본다(units.js의 규칙).
 */
function reference_format_length(metres, digits) {
  if (metres.n === 0n) return '0 m';
  if (frac_compare(metres, MILLIMETRE_CEILING_FRAC) < 0) {
    return `${reference_format_significant(frac_mul(metres, MM_PER_M_FRAC), digits)} mm`;
  }
  if (frac_compare(metres, KILOMETRE_FLOOR_FRAC) < 0) {
    return `${reference_format_significant(metres, digits)} m`;
  }
  const kilometres = reference_round_significant(frac_div(metres, M_PER_KM_FRAC), digits);
  if (frac_compare(reference_read_rounded_value(kilometres), SCIENTIFIC_FLOOR_KM_FRAC) < 0) {
    return `${reference_format_scaled(kilometres.mantissa, kilometres.scale, true)} km`;
  }
  return `${reference_format_scientific(metres, digits)} m`;
}

/**
 * 큰 개수를 이름으로. 이름은 **반올림한 뒤** 고른다 — 996.6 billion이 1000으로
 * 올라가면 한 단계 위(trillion)로 넘긴다. 1000 밑은 정수로 반올림.
 */
const COUNT_WORD_DIGITS = 2;
function reference_format_count_words(value, digits = COUNT_WORD_DIGITS) {
  const floors = COUNT_NAME_LIST.map((name, index) => ({
    name,
    floor: frac_create(BigInt(UNITS_COUNT_STEP_TEXT) ** BigInt(index + 1)),
  }));
  for (let index = floors.length - 1; index >= 0; index -= 1) {
    const { name, floor } = floors[index];
    if (frac_compare(value, floor) < 0) continue;
    const rounded = reference_read_rounded_value(reference_round_significant(frac_div(value, floor), digits));
    const larger = floors[index + 1];
    if (frac_compare(rounded, COUNT_STEP_FRAC) >= 0 && larger) {
      return `${reference_format_significant(frac_div(value, larger.floor), digits)} ${larger.name}`;
    }
    return `${reference_format_significant(frac_div(value, floor), digits)} ${name}`;
  }
  return ((2n * value.n + value.d) / (2n * value.d)).toString();
}

/** 소수 digits자리 고정(0.5는 올림). */
function reference_format_fixed(value, digits) {
  const scaled = frac_mul(value, frac_pow10(digits));
  const integer = (2n * scaled.n + scaled.d) / (2n * scaled.d);
  let body = integer.toString();
  if (digits === 0) return body;
  while (body.length <= digits) body = `0${body}`;
  return `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
}

const reference_format_plural = (count, singular, plural = `${singular}s`) => (count === 1 ? singular : plural);

function reference_format_phrase(label) {
  for (const article of REFERENCE_ARTICLE_LIST) {
    if (label.startsWith(article)) return label[0].toLowerCase() + label.slice(1);
  }
  return label;
}

// ── 오라클: 모델 ────────────────────────────────────────────
const REFERENCE_LIST = FOLD_REFERENCE_LIST.map((item) => ({ ...item, exact: frac_create_from_number(item.metres) }));
const FACTOR_BIG = BigInt(FOLD_THICKNESS_FACTOR);
const LENGTH_DIVISOR_FRAC = frac_create(6n); // Gallivan: L = (π t / 6)(2ⁿ + 4)(2ⁿ − 1)
const LENGTH_OFFSET_BIG = 4n;

const reference_calculate_thickness = (startMetres, folds) => frac_mul(startMetres, frac_create(FACTOR_BIG ** BigInt(folds)));

/** **엄격한 >** — 같은 값은 아직 넘은 것이 아니다. */
const reference_check_passed = (metres, item) => frac_compare(metres, item.exact) > 0;

function reference_read_last_passed(metres) {
  let passed = null;
  for (const item of REFERENCE_LIST) {
    if (reference_check_passed(metres, item)) passed = item;
    else break;
  }
  return passed;
}
const reference_read_next_target = (metres) => REFERENCE_LIST.find((item) => !reference_check_passed(metres, item)) ?? null;

/** t₀·2ⁿ이 height를 처음 **넘는** n. 배가를 한 번씩 세어 찾는다(로그 없음). */
function reference_count_folds_past(startMetres, height) {
  let folds = 0;
  let metres = startMetres;
  while (frac_compare(metres, height) <= 0) {
    metres = frac_mul(metres, frac_create(FACTOR_BIG));
    folds += 1;
  }
  return folds;
}

function reference_calculate_length(startMetres, folds) {
  const layers = FACTOR_BIG ** BigInt(folds);
  return frac_mul(
    frac_div(frac_mul(PI_FRAC, startMetres), LENGTH_DIVISOR_FRAC),
    frac_create((layers + LENGTH_OFFSET_BIG) * (layers - 1n)),
  );
}

// ── 격자 ────────────────────────────────────────────────────
/**
 * 두께 눈금을 정수 tick으로 다룬다. mm = tick × STEP이 정확한 유리수다.
 * 자리수는 STEP의 십진 표기에서 나온다(0.01 → 두 자리).
 */
const STEP_TEXT = String(FOLD_THICKNESS_STEP_MM);
const THICKNESS_DIGITS = STEP_TEXT.includes('.') ? STEP_TEXT.split('.')[1].length : 0;
const STEP_FRAC = frac_create_from_decimal(STEP_TEXT);
function test_calculate_tick(mm) {
  const ticks = frac_div(frac_create_from_number(mm), STEP_FRAC);
  if (ticks.d !== 1n) throw new Error(`${mm}가 눈금 위에 있지 않다`);
  return Number(ticks.n);
}
const TICK_MIN = test_calculate_tick(FOLD_THICKNESS_MIN_MM);
const TICK_MAX = test_calculate_tick(FOLD_THICKNESS_MAX_MM);
const TICK_LIST = Array.from({ length: TICK_MAX - TICK_MIN + 1 }, (_, i) => TICK_MIN + i);
const FOLD_LIST = Array.from({ length: FOLD_COUNT_MAX - FOLD_COUNT_MIN + 1 }, (_, i) => FOLD_COUNT_MIN + i);
const AXIS_LIST = ['linear', 'log'];

const reference_read_thickness_mm = (tick) => frac_mul(frac_create(BigInt(tick)), STEP_FRAC);
const reference_format_thickness_text = (tick) => reference_format_fixed(reference_read_thickness_mm(tick), THICKNESS_DIGITS);
const reference_read_start_metres = (tick) => frac_div(reference_read_thickness_mm(tick), MM_PER_M_FRAC);

const MOON_ITEM = REFERENCE_LIST.find((item) => item.key === VERDICT_REACHED_KEY);
/** 두께 슬라이더 양 끝에서 달을 넘는 접기 수의 차. 판정문이 인용한다. */
const MOON_SPREAD =
  reference_count_folds_past(reference_read_start_metres(TICK_MIN), MOON_ITEM.exact) -
  reference_count_folds_past(reference_read_start_metres(TICK_MAX), MOON_ITEM.exact);

// 차트·자 기하. 캔버스의 실제 폭이 아니라 스텁 폭(STUB_WIDTH_PX)에서 나온다.
const CHART_PLOT_HEIGHT = frac_create(BigInt(CHART_HEIGHT_PX - CHART_PAD_TOP - CHART_PAD_BOTTOM));
const CHART_CRUSHED_FRAC = frac_create(BigInt(CHART_CRUSHED_PX));
const CHART_PAD_FRAC = frac_add(frac_create(1n), frac_create_from_decimal(CHART_SCALE_PAD_RATIO_TEXT));
const RAIL_LOW_FRAC = frac_create_from_number(RAIL_LOW_M);
const RAIL_HIGH_FRAC = frac_create_from_number(RAIL_HIGH_M);
const RAIL_LOW_POWER = frac_calculate_floor_log10(RAIL_LOW_FRAC);
const RAIL_HIGH_POWER = frac_calculate_floor_log10(RAIL_HIGH_FRAC);
const RAIL_STEP_TEXT = reference_format_fixed(
  frac_div(
    frac_mul(frac_create(BigInt(STUB_WIDTH_PX - 2 * RAIL_PAD_X)), LOG10_TWO_FRAC),
    frac_create(BigInt(RAIL_HIGH_POWER - RAIL_LOW_POWER)),
  ),
  1,
);

// ── 오라클: 한 상태의 화면 전체 ──────────────────────────────
/**
 * 두께 하나에 대한 교차 접기 수는 접기·축과 무관하다. 격자가 4,692상태라
 * 매번 다시 세면 BigInt 약분이 수백만 번 돈다 — 두께마다 한 번만 센다.
 * 표의 높이 칸은 상태와 무관하므로 한 번만 만든다.
 */
const CROSSING_CACHE = new Map();
function reference_read_crossings(tick) {
  if (!CROSSING_CACHE.has(tick)) {
    const start = reference_read_start_metres(tick);
    CROSSING_CACHE.set(tick, REFERENCE_LIST.map((item) => reference_count_folds_past(start, item.exact)));
  }
  return CROSSING_CACHE.get(tick);
}
const TABLE_METRES_TEXT_LIST = REFERENCE_LIST.map((item) => reference_format_length(item.exact, TABLE_SIGNIFICANT_DIGITS));

/**
 * 화면의 칸 이름 → 그 칸에 찍혀야 할 문자열. 칸 이름의 첫 마디가 분류다
 * (아래 it들이 분류별로 나눠 본다).
 */
function reference_describe_screen(tick, folds, axisKind) {
  const shown = {};
  const mmText = reference_format_thickness_text(tick);
  const start = reference_read_start_metres(tick);
  const metres = reference_calculate_thickness(start, folds);
  const lengthText = (value) => reference_format_length(value, SIGNIFICANT_DIGITS);
  const crossings = reference_read_crossings(tick);
  const passed = reference_read_last_passed(metres);
  const next = reference_read_next_target(metres);
  const nextFolds = next ? crossings[REFERENCE_LIST.indexOf(next)] : null;

  // 손잡이
  shown['slider.thickness-output'] = `${mmText} mm`;
  shown['slider.thickness-valuetext'] = `${mmText} millimetres`;
  shown['slider.fold-output'] = String(folds);
  shown['slider.fold-valuetext'] =
    `${folds} ${reference_format_plural(folds, 'fold')} ${EM_DASH} ${lengthText(metres)}` +
    (passed ? `, past ${passed.label}` : ', not past the first mark yet') +
    (next ? `, next ${next.short} at ${nextFolds}` : ', past every mark');

  // 프리셋 칩
  for (const preset of PRESET_LIST) {
    const same =
      frac_compare(frac_create_from_decimal(preset.thicknessText), reference_read_thickness_mm(tick)) === 0 &&
      preset.foldCount === folds;
    shown[`preset.${preset.key}`] = String(same);
  }

  // 히어로
  shown['hero.value'] = `${reference_format_scientific(metres, SIGNIFICANT_DIGITS)} m`;
  shown['hero.human'] = lengthText(metres);
  shown['hero.caption'] = passed ? `Taller than ${passed.label}` : `Not yet past ${(next ?? REFERENCE_LIST[0]).label}`;
  shown['hero.next'] = next
    ? `Next mark: ${next.label} ${EM_DASH} ${nextFolds - folds} more ${reference_format_plural(nextFolds - folds, 'fold')} away.`
    : 'Every height in the table is behind it now.';

  // 판정문
  const moonFolds = crossings[REFERENCE_LIST.indexOf(MOON_ITEM)];
  shown['verdict.text'] =
    folds >= moonFolds
      ? `At ${mmText} mm the model puts the stack past the Moon from fold ${moonFolds}. ` +
        `The whole thickness slider moves that answer by ${MOON_SPREAD} ${reference_format_plural(MOON_SPREAD, 'fold')}.`
      : `At ${mmText} mm the model needs ${moonFolds} ${reference_format_plural(moonFolds, 'fold')} to pass the Moon ${EM_DASH} ` +
        `${moonFolds - folds} more than the ${folds} set here.`;

  // 읽기값 카드
  shown['layers.value'] = reference_format_count_words(frac_create(FACTOR_BIG ** BigInt(folds)));
  shown['layers.note'] = `one sheet doubled ${folds} ${reference_format_plural(folds, 'time')}`;
  const length = reference_calculate_length(start, folds);
  shown['length.value'] = lengthText(length);
  const yardstick = length.n === 0n ? null : reference_read_last_passed(length);
  shown['length.note'] = yardstick
    ? `about ${reference_format_count_words(frac_div(length, yardstick.exact))} ${TIMES_SIGN} ${reference_format_phrase(yardstick.label)}`
    : '';

  // 자
  const passedNames = REFERENCE_LIST.filter((_, index) => crossings[index] <= folds).map((item) => item.label);
  shown['rail.label'] =
    `A logarithmic rail from ${reference_format_exponent(RAIL_LOW_POWER)} to ${reference_format_exponent(RAIL_HIGH_POWER)} metres. ` +
    `After ${folds} ${reference_format_plural(folds, 'fold')} the stack is ${lengthText(metres)}, ` +
    'and every fold moves the marker the same distance along the rail. ' +
    (passedNames.length ? `Passed so far: ${passedNames.join(', ')}.` : 'It has not passed any of the marked heights yet.');
  let tickCount = 0;
  if (folds + 1 <= RAIL_FOLD_TICK_MAX + 1) {
    for (let fold = 0; fold <= folds; fold += 1) {
      const value = reference_calculate_thickness(start, fold);
      if (frac_compare(value, RAIL_LOW_FRAC) >= 0 && frac_compare(value, RAIL_HIGH_FRAC) <= 0) tickCount += 1;
    }
  }
  const stepCount = Math.max(0, tickCount - 1);
  shown['rail.note'] =
    `Rail fixed at ${reference_format_exponent(RAIL_LOW_POWER)} to ${reference_format_exponent(RAIL_HIGH_POWER)} metres ${EM_DASH} ` +
    `it never rescales. One fold moves the marker ${RAIL_STEP_TEXT} px, ` +
    `the same at every setting, and ${tickCount} ${reference_format_plural(tickCount, 'tick is', 'ticks are')} drawn above it, ` +
    `with ${stepCount} equal ${reference_format_plural(stepCount, 'step')} between them. ` +
    RAIL_LEGEND_ICON_TEXT;

  // 곡선 차트
  let low;
  let high;
  if (axisKind === 'log') {
    low = folds === 0 ? frac_div(start, SQRT_TEN_FRAC) : start;
    high = folds === 0 ? frac_mul(start, SQRT_TEN_FRAC) : metres;
  } else {
    low = frac_create(0n);
    high = frac_mul(metres, CHART_PAD_FRAC);
  }
  const foldMax = Math.max(folds, 1);
  let flat = '';
  if (axisKind === 'linear') {
    // 바닥에서 1픽셀 안: 픽셀 높이 × 값 / 축 상단 ≤ 1
    const crushed = (value) => frac_compare(frac_div(frac_mul(CHART_PLOT_HEIGHT, value), high), CHART_CRUSHED_FRAC) <= 0;
    let flatUntil = null;
    for (let fold = 0; fold <= folds; fold += 1) {
      if (crushed(reference_calculate_thickness(start, fold))) flatUntil = fold;
      else break;
    }
    const crushedCount = REFERENCE_LIST.filter((item) => frac_compare(item.exact, high) <= 0 && crushed(item.exact)).length;
    if (flatUntil !== null && flatUntil >= 1) {
      const tail = crushedCount > 0 ? ` and ${crushedCount} of the ${REFERENCE_LIST.length} marked heights` : '';
      flat = ` On this axis folds 0 to ${flatUntil}${tail} sit within one pixel of zero.`;
    }
  }
  shown['chart.note'] =
    `Both axes rescale with the sliders ${EM_DASH} read them before comparing two settings. ` +
    `Vertical: ${AXIS_WORD[axisKind]}, ${lengthText(low)} to ${lengthText(high)}. ` +
    `Horizontal: 0 to ${foldMax} ${reference_format_plural(foldMax, 'fold')}. ` +
    'The rail above never rescales, so two settings can be compared there.' +
    flat;
  shown['chart.label'] =
    `Thickness against fold count on a ${AXIS_WORD[axisKind]} vertical axis, ` +
    `from ${lengthText(start)} to ${lengthText(metres)}.`;

  // 교차표
  REFERENCE_LIST.forEach((item, index) => {
    const crossing = crossings[index];
    shown[`table.${item.key}.height`] = item.label;
    shown[`table.${item.key}.metres`] = TABLE_METRES_TEXT_LIST[index];
    shown[`table.${item.key}.folds`] =
      crossing === 0 ? 'already thicker' : crossing > FOLD_COUNT_MAX ? `${crossing} ${EM_DASH} try thicker paper` : String(crossing);
    shown[`table.${item.key}.note`] = item.note;
    shown[`table.${item.key}.current`] = crossing === folds ? 'true' : null;
  });
  return shown;
}

// ── 화면 읽기 ───────────────────────────────────────────────
function fixture_build_mounted(search) {
  const dom = fixture_create_dom({ search, width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

/**
 * 붙은 위젯의 원소를 한 번만 훑는다. 스텁의 `querySelectorAll`은 부를 때마다
 * 트리 전체를 새로 훑으므로, 4,692상태 × 수십 번이면 그것만으로 몇 초가 간다.
 */
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

/** 붙은 위젯에서 `reference_describe_screen`과 같은 칸 이름으로 글자를 읽는다. */
function fixture_read_screen(dom) {
  const all = fixture_scan_elements(dom.root);
  const by_class = (name) => all.filter((el) => fixture_check_class(el, name));
  const by_tag = (tag) => all.filter((el) => el.tagName === tag);
  const shown = {};
  const inputs = by_tag('input');
  const outputs = by_tag('output');
  const output_of = (id) => outputs.find((el) => el.getAttribute('for') === id).textContent;
  const input_of = (id) => inputs.find((el) => el.id === id);

  shown['slider.thickness-output'] = output_of('fold-thickness');
  shown['slider.thickness-valuetext'] = input_of('fold-thickness').getAttribute('aria-valuetext');
  shown['slider.fold-output'] = output_of('fold-count');
  shown['slider.fold-valuetext'] = input_of('fold-count').getAttribute('aria-valuetext');

  for (const button of all.filter((el) => el.getAttribute('data-preset') !== null)) {
    shown[`preset.${button.dataset.preset}`] = button.getAttribute('aria-pressed');
  }

  shown['hero.value'] = by_class('scale-value')[0].textContent;
  const humanLines = by_class('scale-human').map((el) => el.textContent);
  shown['hero.human'] = humanLines[0];
  shown['hero.caption'] = by_class('scale-caption')[0].textContent;
  shown['hero.next'] = humanLines[1];

  shown['verdict.text'] = by_class('verdict')[0].textContent;

  const [layerBox, lengthBox] = by_class('readout');
  const note_of = (box) => {
    const labels = box.querySelectorAll('.readout-label');
    return labels[labels.length - 1].textContent;
  };
  shown['layers.value'] = layerBox.querySelector('.readout-value').textContent;
  shown['layers.note'] = note_of(layerBox);
  shown['length.value'] = lengthBox.querySelector('.readout-value').textContent;
  shown['length.note'] = note_of(lengthBox);

  // 캔버스는 둘이고 DOM 순서가 자 → 곡선이다(widget_mount의 rootEl.append 순서).
  const [railCanvas, chartCanvas] = by_tag('canvas');
  shown['rail.label'] = railCanvas.getAttribute('aria-label');
  shown['chart.label'] = chartCanvas.getAttribute('aria-label');
  // 캡션 둘은 같은 클래스다. 마커 범례(.legend-cursor)가 옆에 있는 쪽이 자의 캡션.
  for (const note of by_class('legend-note')) {
    const isRail = note.parentElement.children.some((el) => fixture_check_class(el, 'legend-cursor'));
    shown[isRail ? 'rail.note' : 'chart.note'] = note.textContent;
  }

  const rows = by_tag('tr').filter((tr) => tr.parentElement?.tagName === 'tbody');
  rows.forEach((tr, index) => {
    const key = REFERENCE_LIST[index]?.key ?? `extra-${index}`;
    const [height, metres, folds, note] = tr.children.map((cell) => cell.textContent);
    shown[`table.${key}.height`] = height;
    shown[`table.${key}.metres`] = metres;
    shown[`table.${key}.folds`] = folds;
    shown[`table.${key}.note`] = note;
    shown[`table.${key}.current`] = tr.getAttribute('aria-current');
  });
  return shown;
}

// ── 전수 대조 ───────────────────────────────────────────────
const CATEGORY_LIST = ['slider', 'preset', 'hero', 'verdict', 'layers', 'length', 'rail', 'chart', 'table'];
const MISMATCH_SAMPLE_MAX = 5;

function test_build_search(tick, folds, axisKind) {
  const axisCode = axisKind === 'log' ? AXIS_CODE_LOG : AXIS_CODE_LINEAR;
  return `?mm=${reference_format_thickness_text(tick)}&folds=${folds}&axis=${axisCode}`;
}

/** 축 라디오를 사람이 누른 것처럼 바꾼다. 위젯은 `change`에서 다시 그린다. */
function fixture_switch_axis(dom, axisKind) {
  const radios = fixture_scan_elements(dom.root).filter((el) => el.tagName === 'input' && el.type === 'radio');
  for (const radio of radios) radio.checked = radio.value === axisKind;
  const target = radios.find((radio) => radio.value === axisKind);
  return dom.listeners_run_event(target, 'change');
}

/**
 * 격자 전체를 한 번 돈다. 분류별 불일치와 대조한 칸 수를 모은다.
 *
 * 두께·접기마다 **한 번만 붙이고** 축은 라디오로 바꾼다 — 붙이기가 비용의 대부분이다.
 * 대신 두 경로를 다 지나가게 눈금마다 번갈아 시작한다: 짝수 tick은 URL에서
 * 선형으로 붙여 로그로 바꾸고, 홀수 tick은 URL에서 로그로 붙여 선형으로 바꾼다.
 */
function test_run_survey() {
  const bad = Object.fromEntries(CATEGORY_LIST.map((name) => [name, []]));
  const compared = Object.fromEntries(CATEGORY_LIST.map((name) => [name, 0]));
  let states = 0;
  let toggles = 0;
  const record = (label, want, got) => {
    states += 1;
    const slots = new Set([...Object.keys(want), ...Object.keys(got)]);
    for (const slot of slots) {
      const category = slot.split('.')[0];
      compared[category] += 1;
      if (got[slot] !== want[slot]) bad[category].push({ 상태: label, 칸: slot, 화면: got[slot], 정확: want[slot] });
    }
  };
  for (const tick of TICK_LIST) {
    const order = tick % 2 === 0 ? AXIS_LIST : [...AXIS_LIST].reverse();
    for (const folds of FOLD_LIST) {
      const search = test_build_search(tick, folds, order[0]);
      const { dom, widget_reset } = fixture_build_mounted(search);
      try {
        record(search, reference_describe_screen(tick, folds, order[0]), fixture_read_screen(dom));
        toggles += fixture_switch_axis(dom, order[1]);
        record(`${search} → 축 ${order[1]}`, reference_describe_screen(tick, folds, order[1]), fixture_read_screen(dom));
        widget_reset();
      } finally {
        dom.restore();
      }
    }
  }
  return { bad, compared, states, toggles };
}

function summarize(list) {
  return { 불일치: list.length, 처음: list.slice(0, MISMATCH_SAMPLE_MAX) };
}
const CLEAN = { 불일치: 0, 처음: [] };

let SURVEY = null;
beforeAll(() => {
  SURVEY = test_run_survey();
});

// ── 격자와 규약 ─────────────────────────────────────────────
describe('격자와 규약을 코드에서 읽었는가', () => {
  it('두께 눈금은 슬라이더가 스냅하는 값 그대로다', () => {
    expect(TICK_LIST.length).toBe(
      Number(
        frac_div(
          frac_sub(frac_create_from_number(FOLD_THICKNESS_MAX_MM), frac_create_from_number(FOLD_THICKNESS_MIN_MM)),
          STEP_FRAC,
        ).n,
      ) + 1,
    );
    for (const tick of TICK_LIST) {
      const text = reference_format_thickness_text(tick);
      expect(model_clamp_thickness_mm(Number(text))).toBe(Number(text));
    }
    expect(FOLD_LIST[0]).toBe(FOLD_COUNT_MIN);
    expect(FOLD_LIST[FOLD_LIST.length - 1]).toBe(FOLD_COUNT_MAX);
  });

  it('소스에서 읽은 규약이 비어 있지 않다', () => {
    expect(SIGNIFICANT_DIGITS).toBeGreaterThan(0);
    expect(TABLE_SIGNIFICANT_DIGITS).toBeGreaterThan(SIGNIFICANT_DIGITS);
    expect(PRESET_LIST.length).toBe(3);
    expect(MOON_ITEM).toBeTruthy();
    expect(AXIS_CODE_LINEAR).not.toBe(AXIS_CODE_LOG);
    // 자의 양 끝은 10의 거듭제곱이어야 캡션의 "10ⁿ"이 거짓이 아니다.
    expect(frac_compare(RAIL_LOW_FRAC, frac_pow10(RAIL_LOW_POWER))).toBe(0);
    expect(frac_compare(RAIL_HIGH_FRAC, frac_pow10(RAIL_HIGH_POWER))).toBe(0);
  });
});

describe('오라클 자기점검 — 기대값을 만드는 쪽이 먼저 맞아야 한다', () => {
  it('0.5는 올린다 — 이진 double이 아니라 정확한 값에서', () => {
    // 1.0005 m를 넷째 자리에서: 정확히 반이므로 올림 → 1.001. (double 1.0005는 1.000499…)
    expect(reference_format_significant(frac_create_from_decimal('1.0005'), 4)).toBe('1.001');
    expect(reference_format_significant(frac_create_from_decimal('12345'), 4)).toBe('12350');
    expect(reference_format_significant(frac_create_from_decimal('0.05'), 4)).toBe('0.05');
  });

  it('손으로 풀 수 있는 표기 몇 개', () => {
    const officeMoon = reference_calculate_thickness(frac_create_from_decimal('0.0001'), 42); // 0.1 mm · 2⁴²
    expect(reference_format_scientific(officeMoon, 4)).toBe('4.398 × 10⁸');
    expect(reference_format_length(officeMoon, 4)).toBe('439,800 km');
    expect(reference_format_scientific(frac_create_from_decimal('0.00005'), 4)).toBe('5 × 10⁻⁵');
    expect(reference_format_scientific(frac_create_from_decimal('9.99951'), 4)).toBe('1 × 10¹');
    expect(reference_format_length(frac_create_from_decimal('35786000'), 5)).toBe('35,786 km');
    expect(reference_format_length(frac_create_from_decimal('35786000'), 4)).toBe('35,790 km');
    expect(reference_format_length(frac_create_from_decimal('0.00005'), 4)).toBe('0.05 mm');
    expect(reference_format_length(frac_create_from_decimal('9999600000'), 4)).toBe('1 × 10¹⁰ m');
    expect(reference_format_count_words(frac_create(2n ** 42n))).toBe('4.4 trillion');
    expect(reference_format_count_words(frac_create(996550000000n))).toBe('1 trillion');
    expect(reference_format_count_words(frac_create(512n))).toBe('512');
    expect(reference_format_count_words(frac_create(5n, 2n))).toBe('3');
  });

  it('무리수 근사가 60자리에서 맞다', () => {
    const squared = frac_mul(SQRT_TEN_FRAC, SQRT_TEN_FRAC);
    expect(frac_compare(squared, frac_create(10n))).toBeLessThanOrEqual(0);
    expect(frac_compare(squared, frac_create_from_decimal(`9.${'9'.repeat(IRRATIONAL_DIGITS - 2)}`))).toBe(1);
    expect(reference_format_fixed(PI_FRAC, 10)).toBe('3.1415926536');
    expect(reference_format_fixed(LOG10_TWO_FRAC, 10)).toBe('0.3010299957');
  });
});

// ── 격자 전체 ───────────────────────────────────────────────
describe(`화면 글자 전수 대조 — 두께 ${TICK_LIST.length} × 접기 ${FOLD_LIST.length} × 축 ${AXIS_LIST.length}`, () => {
  it('격자를 전부 돌았다', () => {
    expect(SURVEY.states).toBe(TICK_LIST.length * FOLD_LIST.length * AXIS_LIST.length);
    // 축 전환이 실제로 리스너를 불렀는가 — 안 불렀으면 둘째 읽기는 첫째의 재탕이다.
    expect(SURVEY.toggles).toBe(TICK_LIST.length * FOLD_LIST.length);
    for (const category of CATEGORY_LIST) expect(SURVEY.compared[category]).toBeGreaterThan(0);
  });

  it.each([
    ['slider', '손잡이 옆 숫자와 aria-valuetext'],
    ['preset', '프리셋 칩의 aria-pressed'],
    ['hero', '히어로: 지수 표기·사람 단위·배지 캡션·다음 기준점'],
    ['verdict', '판정문: 달을 넘는 접기 수'],
    ['layers', '겹 수 카드: 2ⁿ의 이름 표기'],
    ['length', '필요 길이 카드: Gallivan L과 그 배수'],
    ['rail', '자의 aria-label과 캡션'],
    ['chart', '곡선 차트의 캡션과 aria-label (두 축)'],
    ['table', '교차표: 높이 칸(유효 5자리)·접기 칸·현재 행'],
  ])('%s — %s', (category) => {
    expect(summarize(SURVEY.bad[category])).toEqual(CLEAN);
  });
});

// ── 회귀 좌표 ───────────────────────────────────────────────
describe('회귀 좌표 — 감사에서 실제로 나왔던 자리', () => {
  function fixture_read_once(search) {
    const { dom, widget_reset } = fixture_build_mounted(search);
    try {
      const shown = fixture_read_screen(dom);
      const pressed = dom.root
        .querySelectorAll('button')
        .filter((el) => el.getAttribute('aria-pressed') !== null)
        .map((el) => el.getAttribute('aria-pressed'));
      widget_reset();
      return { shown, pressed };
    } finally {
      dom.restore();
    }
  }

  it('0.23 mm · 45접기: 필요 길이의 배수가 "1000 billion"이 아니라 "1 trillion"이다', () => {
    const { shown } = fixture_read_once('?mm=0.23&folds=45');
    expect(shown['length.note']).not.toContain('1000 billion');
    expect(shown['length.note']).toBe('about 1 trillion × the distance to the Sun');
    expect(shown['length.note']).toBe(reference_describe_screen(test_calculate_tick(0.23), 45, 'linear')['length.note']);
  });

  it('정지궤도 행의 높이 칸이 "35,786 km"다 — 같은 줄 Note와 같은 수', () => {
    const { shown } = fixture_read_once('?mm=0.10&folds=42');
    expect(shown['table.geo.metres']).toBe('35,786 km');
    expect(shown['table.geo.note']).toContain('35,786 km');
  });

  it('기본 상태(쿼리 없음)는 첫 프리셋과 같다 — 칩이 ["true","false","false"]', () => {
    const { shown, pressed } = fixture_read_once('');
    expect(pressed).toEqual(['true', 'false', 'false']);
    const want = reference_describe_screen(test_calculate_tick(FOLD_THICKNESS_DEFAULT_MM), FOLD_COUNT_DEFAULT, 'linear');
    expect(shown).toEqual(want);
  });

  it('두께가 기준 높이와 정확히 같은 접기는 "넘었다"가 아니다 — 모델은 엄격한 >를 쓴다', () => {
    // 격자에서 t₀·2ᵏ = 기준 높이인 상태를 **정확 연산으로** 찾는다.
    const ties = [];
    for (const tick of TICK_LIST) {
      const start = reference_read_start_metres(tick);
      for (const item of REFERENCE_LIST) {
        for (const folds of FOLD_LIST) {
          if (frac_compare(reference_calculate_thickness(start, folds), item.exact) === 0) ties.push({ tick, item, folds });
        }
      }
    }
    // 0.19 mm·2² 와 0.38 mm·2¹ = 0.76 mm(은행 카드). 비어 있으면 이 it이 공허해진다.
    expect(ties.map(({ tick, item, folds }) => `${reference_format_thickness_text(tick)}·${folds}·${item.key}`)).toEqual([
      '0.19·2·card',
      '0.38·1·card',
    ]);
    for (const { tick, item, folds } of ties) {
      const { shown } = fixture_read_once(`?mm=${reference_format_thickness_text(tick)}&folds=${folds}`);
      expect(shown[`table.${item.key}.folds`]).toBe(String(folds + 1));
      expect(shown['hero.caption']).not.toBe(`Taller than ${item.label}`);
    }
  });
});
