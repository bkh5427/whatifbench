/**
 * Wi-Fi through walls — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 한 종류다: **표시 단계가 값을 바꾼다.**
 * 모델이 옳은 dB를 내도 카드·표·배너에 틀린 글자가 찍히면 독자가 읽는 것은 그 글자다.
 * 곡선도, 배지 색도 그대로라서 화면에는 아무 흔적이 없다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 오라클은 model.js의 **어떤 계산 함수도 import하지 않는다.** 식을 여기서 다시 쓴다:
 *      · FSPL(dB) = 20·log₁₀(4π·d·f/c)  — d는 m, f는 Hz, c = 299792458 m/s(정의값).
 *        모델은 km·MHz 상수(32.4478)를 쓰지만, 오라클은 상수 없이 원식에서 바로 간다.
 *      · 벽 한 장: ITU-R P.2040 식 (43b), 공기 중 슬래브, 수직 입사.
 *        η = a·f^b − j·σ/(2π·f·ε₀),  σ = c·f^d (f는 GHz),  ε₀ = 8.8541878128e-12 F/m.
 *        R = (1 − √η)/(1 + √η),  q = (2π·t·f/c)·√η,
 *        T = (1 − R²)·e^(−jq) / (1 − R²·e^(−2jq)),  L = −10·log₁₀|T|².
 *        √η는 주값(실수부 ≥ 0) — 극형식이 아니라 대수식 √((|z|±x)/2)로 구한다.
 *      · 재질 계수(a, b, c, d)와 대역 중심(2437·5500·6525 MHz)은 **여기에 리터럴로 적는다.**
 *        model.js를 import하면 계수 오타가 양쪽에 똑같이 들어가 검사가 아니게 된다.
 *   ⓑ 연산은 BigInt 고정소수(10⁻⁶⁰)다. ln은 atanh 급수(2의 거듭제곱으로 [1, 2)에 넣어서),
 *      exp는 ln2로 줄인 테일러 급수, cos·sin은 2π로 줄인 테일러 급수, √는 정수 뉴턴법.
 *      반올림은 정수 나눗셈 한 번(0.5는 올림 = `toFixed`/`toPrecision`의 명세)이라
 *      부동소수를 거치지 않는다 — **경계가 경계로 남는다.**
 *   ⓒ 격자 범위(재질별 두께 min/max/step, 거리 사다리, 벽 수·EIRP·문턱 범위와 기본값)는
 *      model.js에서 **데이터로만** 읽는다. 위젯이 범위를 바꾸면 이 파일도 따라간다.
 *      표기 자리수(dBm·여유 1자리, 격차·표 2자리, 거리 유효 4자리)와 문구 틀은
 *      **이 파일의 명세**다 — 위젯이 바꾸면 걸리는 것이 맞다.
 *   ⓓ 피검 대상은 두 경로다.
 *      · 표시 함수 경로: widget.js가 export한 display_* 함수에 model_calculate_result의
 *        결과를 넣어 나온 문자열. 전 격자(42,750상태)를 돈다 — 순수 함수라 빠르다.
 *      · 마운트 경로: 위젯을 DOM 스텁에 **실제로 붙이고** 슬라이더·선택상자를 바꿔
 *        change를 발화시킨 뒤 화면 글자를 읽는다. widget_update가 표시 함수를
 *        어느 자리에 몇 자리로 꽂는지까지 본다.
 *
 * 마운트 격자를 줄인 이유 (2026-09-26 측정): 마운트 갱신 한 번이 약 1.1 ms다
 * (곡선 3개 × 140점을 매번 다시 계산한다). 재질·두께 전 눈금 190 × 벽 9 × 거리 25 =
 * 42,750번이면 50초 가까이 걸린다. 거리는 FSPL이라는 **두께·벽과 무관한 덧셈항** 하나와
 * 거리 글자로만 화면에 들어오므로, 마운트 경로에서는 거리를 대표값 셋(사다리 양 끝과
 * 기본값)으로 줄이고, 대신 ① 재질마다 기본 두께에서는 거리 사다리 전부를 마운트로 돌리고
 * ② 표시 함수 경로에서는 전 격자를 그대로 돈다.
 *
 * 비교에서 빼는 것 하나: 범례 캡션의 "curves are within a line width" 문장.
 * 곡선 표본점(140개, 사다리와 다른 로그 간격)과 픽셀 좌표로 정하는 **그림의 판단**이지
 * 숫자가 아니다. 캡션의 나머지(세로축 범위 숫자, 축 밖 도달거리 문장)는 대조한다.
 */
import { describe, it, expect } from 'vitest';
import {
  WIFI_MATERIALS,
  WIFI_MATERIAL_KEYS,
  WIFI_BANDS,
  WIFI_DISTANCE_LADDER,
  WIFI_DISTANCE_MIN_M,
  WIFI_DISTANCE_MAX_M,
  WIFI_DISTANCE_DEFAULT_M,
  WIFI_WALL_COUNT_MIN,
  WIFI_WALL_COUNT_MAX,
  WIFI_WALL_COUNT_DEFAULT,
  WIFI_EIRP_MIN_DBM,
  WIFI_EIRP_MAX_DBM,
  WIFI_EIRP_STEP_DBM,
  WIFI_EIRP_DEFAULT_DBM,
  WIFI_SENSITIVITY_MIN_DBM,
  WIFI_SENSITIVITY_MAX_DBM,
  WIFI_SENSITIVITY_STEP_DBM,
  WIFI_SENSITIVITY_DEFAULT_DBM,
  WIFI_MATERIAL_DEFAULT,
  WIFI_BAND_GAP_EDGE_DB,
  model_clamp_thickness,
  model_calculate_result,
} from './model.js';
import {
  WIFI_PRESETS,
  widget_mount,
  display_format_db,
  display_format_signed_db,
  display_format_distance,
  display_format_reach,
  display_describe_walls,
  display_describe_verdict,
  display_describe_band_gap,
  display_describe_gap,
  display_describe_thin_slab,
  display_describe_legend,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 고정소수 ─────────────────────────────────────────────────
/** 고정소수 자리수. 벽 여덟 장(수백 dB)을 지나도 반올림 자리보다 40자리 넘게 아래다. */
const FIXED_DIGITS = 60;
const FIXED_ONE = 10n ** BigInt(FIXED_DIGITS);
/** π 100자리. 60자리에서 자른다. */
const REFERENCE_PI_TEXT =
  '3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679';

/** 십진 문자열(지수 표기 허용) → 고정소수 BigInt. 60자리 안이면 **정확하다.** */
function frac_read_decimal(text) {
  const found = String(text).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[3] ?? '';
  const exponent = Number(found[4] ?? 0) - fraction.length + FIXED_DIGITS;
  const digits = BigInt(found[2] + fraction);
  if (exponent < 0 && digits % 10n ** BigInt(-exponent) !== 0n) throw new Error(`자리수가 너무 많다: ${text}`);
  const value = exponent >= 0 ? digits * 10n ** BigInt(exponent) : digits / 10n ** BigInt(-exponent);
  return found[1] === '-' ? -value : value;
}

/** 십진 문자열 → 정확한 분자/분모 (거리 사다리 값처럼 식 안에서 π와 곱할 때 쓴다). */
function frac_read_ratio(text) {
  const found = String(text).match(/^(\d+)(?:\.(\d+))?$/);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[2] ?? '';
  return { num: BigInt(found[1] + fraction), den: 10n ** BigInt(fraction.length) };
}

const frac_multiply = (left, right) => (left * right) / FIXED_ONE;
const frac_divide = (left, right) => (left * FIXED_ONE) / right;

/** 정수 뉴턴법 √(내림). */
function frac_calculate_isqrt(value) {
  if (value < 0n) throw new Error('음수의 √');
  if (value < 2n) return value;
  let guess = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (guess + value / guess) / 2n;
    if (next >= guess) return guess;
    guess = next;
  }
}
const frac_calculate_sqrt = (value) => frac_calculate_isqrt(value * FIXED_ONE);

/** ln m, m ∈ [1, 2]. ln m = 2·atanh((m−1)/(m+1)), y ≤ 1/3이라 항마다 한 자리 가까이 준다. */
function frac_calculate_ln_near_one(value) {
  const y = ((value - FIXED_ONE) * FIXED_ONE) / (value + FIXED_ONE);
  const ySquared = frac_multiply(y, y);
  let power = y;
  let sum = 0n;
  for (let n = 1n; power !== 0n; n += 2n) {
    sum += power / n;
    power = frac_multiply(power, ySquared);
  }
  return 2n * sum;
}

/** ln 2 = 2·atanh(1/3). ln과 exp가 둘 다 이 값으로 인자를 줄인다. */
const REFERENCE_LN2 = frac_calculate_ln_near_one(2n * FIXED_ONE);

/** ln x (x > 0). x = m·2ᵏ, m ∈ [1, 2)로 옮긴 뒤 급수. */
function frac_calculate_ln(value) {
  if (value <= 0n) throw new Error('ln은 양수에서만 정의된다.');
  let mantissa = value;
  let power = 0n;
  while (mantissa >= 2n * FIXED_ONE) {
    mantissa /= 2n;
    power += 1n;
  }
  while (mantissa < FIXED_ONE) {
    mantissa *= 2n;
    power -= 1n;
  }
  return power * REFERENCE_LN2 + frac_calculate_ln_near_one(mantissa);
}

const REFERENCE_LN10 = frac_calculate_ln(10n * FIXED_ONE);

/** eˣ. x = k·ln2 + r, |r| < ln2로 줄여 테일러 급수 뒤 2ᵏ배. */
function frac_calculate_exp(value) {
  const power = value / REFERENCE_LN2;
  const rest = value - power * REFERENCE_LN2;
  let term = FIXED_ONE;
  let sum = FIXED_ONE;
  for (let n = 1n; term !== 0n; n += 1n) {
    term = frac_multiply(term, rest) / n;
    sum += term;
  }
  return power >= 0n ? sum << power : sum >> -power;
}

/** 10ˣ = e^(x·ln10). */
const frac_calculate_pow10 = (value) => frac_calculate_exp(frac_multiply(value, REFERENCE_LN10));
/** log₁₀ x = ln x / ln 10. */
const frac_calculate_log10 = (value) => frac_divide(frac_calculate_ln(value), REFERENCE_LN10);

const REFERENCE_PI = frac_read_decimal(REFERENCE_PI_TEXT.slice(0, REFERENCE_PI_TEXT.indexOf('.') + 1 + FIXED_DIGITS));
const REFERENCE_TWO_PI = 2n * REFERENCE_PI;

/** cos x, sin x. x를 (−π, π]로 옮긴 뒤 테일러 급수 한 줄에서 둘을 같이 모은다. */
function frac_calculate_cos_sin(value) {
  let rest = value % REFERENCE_TWO_PI;
  if (rest > REFERENCE_PI) rest -= REFERENCE_TWO_PI;
  if (rest <= -REFERENCE_PI) rest += REFERENCE_TWO_PI;
  let cos = 0n;
  let sin = 0n;
  let term = FIXED_ONE; // restⁿ/n!
  for (let n = 0n; term !== 0n; n += 1n) {
    const phase = n % 4n;
    if (phase === 0n) cos += term;
    else if (phase === 1n) sin += term;
    else if (phase === 2n) cos -= term;
    else sin -= term;
    term = frac_multiply(term, rest) / (n + 1n);
  }
  return { cos, sin };
}

// ── 복소수 (고정소수 두 칸) ──────────────────────────────────
const COMPLEX_ONE = { re: FIXED_ONE, im: 0n };
const complex_add = (left, right) => ({ re: left.re + right.re, im: left.im + right.im });
const complex_subtract = (left, right) => ({ re: left.re - right.re, im: left.im - right.im });
const complex_scale = (value, factor) => ({ re: frac_multiply(value.re, factor), im: frac_multiply(value.im, factor) });
const complex_multiply = (left, right) => ({
  re: (left.re * right.re - left.im * right.im) / FIXED_ONE,
  im: (left.re * right.im + left.im * right.re) / FIXED_ONE,
});
/** |z|², 고정소수. */
const complex_read_norm_squared = (value) => (value.re * value.re + value.im * value.im) / FIXED_ONE;
function complex_divide(left, right) {
  const denominator = right.re * right.re + right.im * right.im; // FIXED_ONE² 배율
  if (denominator === 0n) throw new Error('복소수 나눗셈의 분모가 0이다.');
  return {
    re: ((left.re * right.re + left.im * right.im) * FIXED_ONE) / denominator,
    im: ((left.im * right.re - left.re * right.im) * FIXED_ONE) / denominator,
  };
}
/**
 * 주값 √z (실수부 ≥ 0). 극형식(atan2) 대신 대수식:
 *   re = √((|z| + x)/2),  im = sign(y)·√((|z| − x)/2),  y = 0이면 +.
 */
function complex_calculate_sqrt(value) {
  const modulus = frac_calculate_sqrt(complex_read_norm_squared(value));
  const re = frac_calculate_sqrt((modulus + value.re) / 2n);
  const im = frac_calculate_sqrt((modulus - value.re) / 2n);
  return { re, im: value.im < 0n ? -im : im };
}
/** e^(−jq) = e^(Im q)·(cos Re q − j·sin Re q). */
function complex_calculate_exp_minus_j(phase) {
  const size = frac_calculate_exp(phase.im);
  const { cos, sin } = frac_calculate_cos_sin(phase.re);
  return { re: frac_multiply(size, cos), im: -frac_multiply(size, sin) };
}

// ── 오라클 상수 (모델과 따로 적는다) ─────────────────────────
/** 진공 중 빛의 속도, m/s. SI 정의값. */
const REFERENCE_SPEED_OF_LIGHT_MS = 299792458n;
/** 진공 유전율, F/m. CODATA 2018. */
const REFERENCE_VACUUM_PERMITTIVITY = frac_read_decimal('8.8541878128e-12');
const REFERENCE_HERTZ_PER_MEGAHERTZ = 1000000n;
const REFERENCE_MEGAHERTZ_PER_GIGAHERTZ = 1000n;
/** 두께를 0.1 mm 정수(tenths)로 다룬다. 모든 재질의 step이 0.5 mm의 배수라 정확하다. */
const TENTHS_PER_MILLIMETRE = 10;
const TENTHS_PER_METRE = 10000n;
const DECIBEL_POWER_FACTOR = 10n;
const DECIBEL_FIELD_FACTOR = 20n;

/**
 * ITU-R P.2040-3 Table 3. η′ = a·f^b, σ = c·f^d (f GHz). 표기 이름·단위 명사는 화면 문구의 명세.
 */
const REFERENCE_MATERIALS = {
  concrete: { a: '5.24', b: '0', c: '0.0462', d: '0.7822', label: 'Concrete', unitNoun: 'wall' },
  brick: { a: '3.91', b: '0', c: '0.0238', d: '0.16', label: 'Brick', unitNoun: 'wall' },
  plasterboard: { a: '2.73', b: '0', c: '0.0085', d: '0.9395', label: 'Plasterboard', unitNoun: 'sheet' },
  wood: { a: '1.99', b: '0', c: '0.0047', d: '1.0718', label: 'Wood', unitNoun: 'panel' },
  glass: { a: '6.31', b: '0', c: '0.0036', d: '1.3394', label: 'Glass', unitNoun: 'pane' },
};
/** 대역 중심, MHz. 화면 순서(2.4 → 5 → 6)와 같다. */
const REFERENCE_BANDS = [
  { key: 'b24', label: '2.4 GHz', frequencyMHz: 2437 },
  { key: 'b5', label: '5 GHz', frequencyMHz: 5500 },
  { key: 'b6', label: '6 GHz', frequencyMHz: 6525 },
];
const [BAND_LOW, BAND_HIGH] = REFERENCE_BANDS;

// ── 오라클 표기 명세 ─────────────────────────────────────────
const MINUS = '−'; // U+2212
const REFERENCE_DB_DIGITS = 1;
const REFERENCE_GAP_DIGITS = 2;
const REFERENCE_TABLE_DIGITS = 2;
const REFERENCE_LENGTH_SIGNIFICANT = 4;
/** 화면의 FSPL 식이 적는 상수(km·MHz)의 자리수. 오라클은 원식에서 이 값을 다시 만든다. */
const REFERENCE_FSPL_CONSTANT_DIGITS = 4;
/** 길이 단위 전환점(units.js의 규칙): 1 cm 밑은 mm, 1000 m 이상은 km. **반올림 전** 값으로 고른다. */
const REFERENCE_MILLIMETRE_CEILING = frac_read_decimal('0.01');
const REFERENCE_KILOMETRE_FLOOR = frac_read_decimal('1000');
const REFERENCE_MILLIMETRES_PER_METRE = 1000n;
const REFERENCE_METRES_PER_KILOMETRE = 1000n;
/** km 표기가 지수로 넘어가는 문턱. 격자 안에서는 닿지 않는다(닿으면 오라클이 던진다). */
const REFERENCE_SCIENTIFIC_FLOOR_KM = frac_read_decimal('1e7');
/**
 * 얇은 슬래브 경고의 문턱. 화면 문장이 "comes out under 1 dB"라고 **글자로** 적으므로
 * 모델 상수가 아니라 그 문장이 명세다 — 모델 문턱이 바뀌면 문장이 거짓이 되고 여기서 걸린다.
 */
const REFERENCE_THIN_SLAB_DB = 1n * FIXED_ONE;
/** 밴드 격차 판정 폭. 편집 판단이라 model.js에서 import한다(비교는 정확 연산으로). */
const REFERENCE_GAP_EDGE = frac_read_decimal(String(WIFI_BAND_GAP_EDGE_DB));
/** 곡선 차트 세로축: 위아래 여유, 최소 폭, 눈금 목표 개수, 1-2-2.5-5 계열(0.1 단위). */
const REFERENCE_AXIS_PAD_DB = 4n * FIXED_ONE;
const REFERENCE_AXIS_MIN_SPAN_DB = 10n * FIXED_ONE;
const REFERENCE_AXIS_TICK_COUNT = 5n;
const REFERENCE_AXIS_MANTISSA_TENTHS = [10n, 20n, 25n, 50n];
const REFERENCE_COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const REFERENCE_GAP_LABEL_BELOW = '5 GHz below 2.4 GHz';
const REFERENCE_GAP_LABEL_ABOVE = '5 GHz above 2.4 GHz';
const REFERENCE_LEGEND_KEY_TEXT =
  'Blue solid = 2.4 GHz. Orange solid = 5 GHz. Orange dashed = 6 GHz. ' +
  'Dark dashed = the threshold you set. The faint vertical line is where the distance slider sits.';
/** 범례 캡션에서 빼는 문장(머리말 참고). 곡선 표본점·픽셀로 정하는 그림의 판단. */
const TOUCHING_SENTENCE_PATTERN =
  / At this distance the .+? curves are within a line width of each other on this axis — the table separates them\./;

/** 스텁 캔버스의 CSS 폭. 0이면 차트가 안 그려져 범례 캡션이 축을 인용하지 않는다. */
const STUB_WIDTH_PX = 900;
const MISMATCH_SAMPLE_MAX = 8;

// ── 오라클: 반올림과 표기 ────────────────────────────────────

/** |값|을 소수 digits자리로 반올림한 정수(= |값|×10^digits). 0.5는 올린다. */
function frac_round_fixed(value, digits) {
  const size = value < 0n ? -value : value;
  return (2n * size * 10n ** BigInt(digits) + FIXED_ONE) / (2n * FIXED_ONE);
}

/** 정수 q(= 값×10^digits)를 소수 digits자리 고정 문자열로. */
function frac_format_scaled(scaled, digits) {
  let body = scaled.toString();
  if (digits === 0) return body;
  body = body.padStart(digits + 1, '0');
  return `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
}

/** dB 고정 자리. 부호는 **반올림 전 값**에서 — `toFixed`가 −0.04를 "−0.0"으로 찍는 규칙 그대로. */
function reference_format_db(value, digits = REFERENCE_DB_DIGITS) {
  return `${value < 0n ? MINUS : ''}${frac_format_scaled(frac_round_fixed(value, digits), digits)}`;
}

/** 증가분 표기: 0 이상이면 +, 아니면 −. 반올림해 0이면 부호 없이 0. */
function reference_format_signed_db(value, digits = REFERENCE_GAP_DIGITS) {
  const rounded = frac_round_fixed(value, digits);
  if (rounded === 0n) return frac_format_scaled(0n, digits);
  return `${value >= 0n ? '+' : MINUS}${frac_format_scaled(rounded, digits)}`;
}

/**
 * 양수 고정소수를 유효숫자 digits자리로 반올림. 값 ≈ mantissa × 10^scale.
 * 반올림이 10ᵖ을 만들면 지수를 하나 올린다(`toPrecision`과 같은 결과 꼴).
 */
function frac_round_significant(value, digits) {
  if (value <= 0n) throw new Error('유효숫자 반올림은 양수에서만');
  let exponent = value.toString().length - 1 - FIXED_DIGITS;
  const shift = digits - 1 - exponent;
  let mantissa =
    shift >= 0
      ? (2n * value * 10n ** BigInt(shift) + FIXED_ONE) / (2n * FIXED_ONE)
      : (2n * value + FIXED_ONE * 10n ** BigInt(-shift)) / (2n * FIXED_ONE * 10n ** BigInt(-shift));
  if (mantissa === 10n ** BigInt(digits)) {
    mantissa /= 10n;
    exponent += 1;
  }
  return { mantissa, exponent, scale: exponent - digits + 1 };
}

/** 정수 × 10^scale을 꼬리 0 없는 **평범한 십진 문자열**로. grouped면 정수부에 쉼표(en-US). */
function frac_format_plain(integer, scale, grouped = false) {
  let whole;
  let fraction = '';
  if (scale >= 0) {
    whole = (integer * 10n ** BigInt(scale)).toString();
  } else {
    const body = integer.toString().padStart(-scale + 1, '0');
    whole = body.slice(0, body.length + scale);
    fraction = body.slice(body.length + scale).replace(/0+$/, '');
  }
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${whole}.${fraction}` : whole;
}

function reference_format_significant(value, grouped = false) {
  const rounded = frac_round_significant(value, REFERENCE_LENGTH_SIGNIFICANT);
  return frac_format_plain(rounded.mantissa, rounded.scale, grouped);
}

/**
 * 사람이 읽는 길이(유효 4자리, 꼬리 0 없음). mm → m → km. 단위는 반올림 전 값으로 고르고,
 * km → 지수 표기만 반올림한 km 값으로 본다(units.js의 규칙). 숫자는 언제나 평범한 십진 표기다.
 */
function reference_format_length(metres) {
  if (metres <= 0n) throw new Error('길이는 양수여야 한다');
  if (metres < REFERENCE_MILLIMETRE_CEILING) {
    return `${reference_format_significant(metres * REFERENCE_MILLIMETRES_PER_METRE)} mm`;
  }
  if (metres < REFERENCE_KILOMETRE_FLOOR) return `${reference_format_significant(metres)} m`;
  const kilometres = metres / REFERENCE_METRES_PER_KILOMETRE;
  const rounded = frac_round_significant(kilometres, REFERENCE_LENGTH_SIGNIFICANT);
  if (rounded.mantissa * 10n ** BigInt(rounded.scale + FIXED_DIGITS) >= REFERENCE_SCIENTIFIC_FLOOR_KM) {
    throw new Error('격자 밖: km 지수 표기');
  }
  return `${frac_format_plain(rounded.mantissa, rounded.scale, true)} km`;
}

const REFERENCE_DISTANCE_MIN = frac_read_decimal(String(WIFI_DISTANCE_MIN_M));
const REFERENCE_DISTANCE_MAX = frac_read_decimal(String(WIFI_DISTANCE_MAX_M));

/** 도달거리 카드: 슬라이더 범위 밑이면 "under 0.5 m". */
const reference_format_reach = (metres) =>
  metres < REFERENCE_DISTANCE_MIN ? `under ${WIFI_DISTANCE_MIN_M} m` : reference_format_length(metres);

const reference_format_plural = (count, singular) => (count === 1 ? singular : `${singular}s`);

// ── 오라클 계산 ──────────────────────────────────────────────

/** FSPL(dB) = 20·log₁₀(4π·d·f/c). d는 십진 문자열(m), f는 MHz 정수. */
function reference_calculate_free_space_loss(distanceText, frequencyMHz) {
  const { num, den } = frac_read_ratio(distanceText);
  const argument =
    (4n * REFERENCE_PI * num * BigInt(frequencyMHz) * REFERENCE_HERTZ_PER_MEGAHERTZ) /
    (den * REFERENCE_SPEED_OF_LIGHT_MS);
  return DECIBEL_FIELD_FACTOR * frac_calculate_log10(argument);
}

/** 복소 상대 유전율 η = a·f^b − j·σ/(2π·f·ε₀),  σ = c·f^d,  f GHz. */
function reference_calculate_permittivity(materialKey, frequencyMHz) {
  const material = REFERENCE_MATERIALS[materialKey];
  const frequencyGHz = (BigInt(frequencyMHz) * FIXED_ONE) / REFERENCE_MEGAHERTZ_PER_GIGAHERTZ;
  const lnFrequency = frac_calculate_ln(frequencyGHz);
  const real = frac_multiply(
    frac_read_decimal(material.a),
    frac_calculate_exp(frac_multiply(frac_read_decimal(material.b), lnFrequency)),
  );
  const conductivity = frac_multiply(
    frac_read_decimal(material.c),
    frac_calculate_exp(frac_multiply(frac_read_decimal(material.d), lnFrequency)),
  );
  // 2π·f(Hz)·ε₀ — ε₀가 정확한 고정소수라 곱은 π에서 오는 오차뿐이다.
  const lossDenominator =
    (REFERENCE_TWO_PI * BigInt(frequencyMHz) * REFERENCE_HERTZ_PER_MEGAHERTZ * REFERENCE_VACUUM_PERMITTIVITY) /
    FIXED_ONE;
  return { re: real, im: -frac_divide(conductivity, lossDenominator) };
}

/**
 * 슬래브 한 겹 L(dB), P.2040 식 (43b). refractive = √η, phase = q.
 * L = −10·log₁₀(|분자|²/|분모|²).
 */
function reference_calculate_slab_loss(refractive, phase) {
  const reflection = complex_divide(complex_subtract(COMPLEX_ONE, refractive), complex_add(COMPLEX_ONE, refractive));
  const reflectionSquared = complex_multiply(reflection, reflection);
  const singlePass = complex_calculate_exp_minus_j(phase);
  const doublePass = complex_multiply(singlePass, singlePass);
  const numerator = complex_multiply(complex_subtract(COMPLEX_ONE, reflectionSquared), singlePass);
  const denominator = complex_subtract(COMPLEX_ONE, complex_multiply(reflectionSquared, doublePass));
  const powerRatio = frac_divide(complex_read_norm_squared(numerator), complex_read_norm_squared(denominator));
  return -DECIBEL_POWER_FACTOR * frac_calculate_log10(powerRatio);
}

/** 벽 한 장 L(dB). 두께는 0.1 mm 정수. q = (2π·t·f/c)·√η. */
function reference_calculate_wall_loss(materialKey, thicknessTenths, frequencyMHz) {
  const refractive = complex_calculate_sqrt(reference_calculate_permittivity(materialKey, frequencyMHz));
  // 2π·t·f/c,  t = tenths/10⁴ m,  f = MHz·10⁶ Hz
  const electrical =
    (REFERENCE_TWO_PI * BigInt(thicknessTenths) * BigInt(frequencyMHz) * REFERENCE_HERTZ_PER_MEGAHERTZ) /
    (TENTHS_PER_METRE * REFERENCE_SPEED_OF_LIGHT_MS);
  return reference_calculate_slab_loss(refractive, complex_scale(refractive, electrical));
}

/** 도달거리: EIRP − FSPL(d) − n·L = 문턱 을 d에 대해 푼다.  d = c/(4πf)·10^((예산 − n·L)/20). */
function reference_calculate_reach(budgetDb, wallTotal, frequencyMHz) {
  const base =
    (REFERENCE_SPEED_OF_LIGHT_MS * FIXED_ONE * FIXED_ONE) /
    (4n * REFERENCE_PI * BigInt(frequencyMHz) * REFERENCE_HERTZ_PER_MEGAHERTZ);
  return frac_multiply(base, frac_calculate_pow10((BigInt(budgetDb) * FIXED_ONE - wallTotal) / DECIBEL_FIELD_FACTOR));
}

/** 화면의 FSPL 식이 적는 km·MHz 상수 = 20·log₁₀(4π·1000·10⁶/c). */
const REFERENCE_FSPL_CONSTANT_TEXT = reference_format_db(
  reference_calculate_free_space_loss('1000', 1),
  REFERENCE_FSPL_CONSTANT_DIGITS,
);
/** 벽 없는 격차 = 20·log₁₀(f₅/f₂.₄). */
const REFERENCE_OPEN_GAP = frac_multiply(
  DECIBEL_FIELD_FACTOR * FIXED_ONE,
  frac_calculate_log10((BigInt(BAND_HIGH.frequencyMHz) * FIXED_ONE) / BigInt(BAND_LOW.frequencyMHz)),
);

// ── 격자 ─────────────────────────────────────────────────────

/** 재질의 두께 눈금(0.1 mm 정수). model.js의 min/max/step은 슬라이더 설정이라 데이터로 읽는다. */
function fixture_build_thickness_ticks(materialKey) {
  const material = WIFI_MATERIALS[materialKey];
  const toTenths = (mm) => {
    const tenths = Math.round(mm * TENTHS_PER_MILLIMETRE);
    if (Math.abs(tenths - mm * TENTHS_PER_MILLIMETRE) > 1e-9) throw new Error(`${mm} mm가 0.1 mm 위에 있지 않다`);
    return tenths;
  };
  const low = toTenths(material.thicknessMinMm);
  const high = toTenths(material.thicknessMaxMm);
  const step = toTenths(material.thicknessStepMm);
  const out = [];
  for (let tenths = low; tenths <= high; tenths += step) out.push(tenths);
  return out;
}
const reference_format_thickness = (tenths) =>
  `${Math.floor(tenths / TENTHS_PER_MILLIMETRE)}${tenths % TENTHS_PER_MILLIMETRE ? `.${tenths % TENTHS_PER_MILLIMETRE}` : ''}`;

function fixture_build_range(min, max, step) {
  const out = [];
  for (let value = min; value <= max; value += step) out.push(value);
  return out;
}

const THICKNESS_TICKS = Object.fromEntries(WIFI_MATERIAL_KEYS.map((key) => [key, fixture_build_thickness_ticks(key)]));
const THICKNESS_TICK_TOTAL = WIFI_MATERIAL_KEYS.reduce((sum, key) => sum + THICKNESS_TICKS[key].length, 0);
const WALL_COUNTS = fixture_build_range(WIFI_WALL_COUNT_MIN, WIFI_WALL_COUNT_MAX, 1);
const DISTANCE_INDICES = WIFI_DISTANCE_LADDER.map((_, index) => index);
const EIRP_VALUES = fixture_build_range(WIFI_EIRP_MIN_DBM, WIFI_EIRP_MAX_DBM, WIFI_EIRP_STEP_DBM);
const SENSITIVITY_VALUES = fixture_build_range(WIFI_SENSITIVITY_MIN_DBM, WIFI_SENSITIVITY_MAX_DBM, WIFI_SENSITIVITY_STEP_DBM);
const DISTANCE_DEFAULT_INDEX = WIFI_DISTANCE_LADDER.indexOf(WIFI_DISTANCE_DEFAULT_M);
/** 마운트 경로의 대표 거리: 사다리 양 끝과 기본값(머리말 참고). */
const DISTANCE_SAMPLE_INDICES = [0, DISTANCE_DEFAULT_INDEX, WIFI_DISTANCE_LADDER.length - 1];
const DEFAULT_TENTHS = Math.round(WIFI_MATERIALS[WIFI_MATERIAL_DEFAULT].thicknessDefaultMm * TENTHS_PER_MILLIMETRE);

// ── 오라클: 캐시 ─────────────────────────────────────────────
/** (재질, 두께)마다 세 대역의 L. 190 × 3번만 센다. */
const WALL_LOSS_CACHE = new Map();
function reference_read_wall_losses(materialKey, tenths) {
  const key = `${materialKey}:${tenths}`;
  if (!WALL_LOSS_CACHE.has(key)) {
    WALL_LOSS_CACHE.set(
      key,
      REFERENCE_BANDS.map((band) => reference_calculate_wall_loss(materialKey, tenths, band.frequencyMHz)),
    );
  }
  return WALL_LOSS_CACHE.get(key);
}
/** 거리 문자열마다 세 대역의 FSPL. */
const FREE_SPACE_CACHE = new Map();
function reference_read_free_space_losses(distanceText) {
  if (!FREE_SPACE_CACHE.has(distanceText)) {
    FREE_SPACE_CACHE.set(
      distanceText,
      REFERENCE_BANDS.map((band) => reference_calculate_free_space_loss(distanceText, band.frequencyMHz)),
    );
  }
  return FREE_SPACE_CACHE.get(distanceText);
}
const REACH_CACHE = new Map();
function reference_read_reach(budgetDb, materialKey, tenths, walls, bandIndex, wallTotal) {
  const key = `${budgetDb}:${materialKey}:${tenths}:${walls}:${bandIndex}`;
  if (!REACH_CACHE.has(key)) {
    REACH_CACHE.set(key, reference_calculate_reach(budgetDb, wallTotal, REFERENCE_BANDS[bandIndex].frequencyMHz));
  }
  return REACH_CACHE.get(key);
}

/** 곡선 차트 세로축 라벨 두 개. 곡선은 d에 대해 단조 감소라 양 끝 거리에서 최대·최소가 난다. */
function reference_describe_axis(atNear, atFar, sensitivity) {
  let low = atFar.reduce((best, value) => (value < best ? value : best), sensitivity) - REFERENCE_AXIS_PAD_DB;
  let high = atNear.reduce((best, value) => (value > best ? value : best), sensitivity) + REFERENCE_AXIS_PAD_DB;
  if (high - low < REFERENCE_AXIS_MIN_SPAN_DB) {
    const middle = (high + low) / 2n;
    low = middle - REFERENCE_AXIS_MIN_SPAN_DB / 2n;
    high = middle + REFERENCE_AXIS_MIN_SPAN_DB / 2n;
  }
  const rough = (high - low) / REFERENCE_AXIS_TICK_COUNT;
  const decade = rough.toString().length - 1 - FIXED_DIGITS; // floor(log₁₀ rough)
  if (decade < 0) throw new Error('격자 밖: 세로축 눈금 간격 < 1');
  const pick = REFERENCE_AXIS_MANTISSA_TENTHS.find(
    (tenths) => rough * 10n <= tenths * 10n ** BigInt(decade) * FIXED_ONE,
  );
  const stepTenths = (pick ?? 100n) * 10n ** BigInt(decade);
  const digits = stepTenths % 10n === 0n ? 0 : 1;
  return { low: reference_format_db(low, digits), high: reference_format_db(high, digits) };
}

/**
 * 한 상태에서 화면에 있어야 하는 문자열 전부. 칸 이름의 첫 마디가 분류다.
 * state: { materialKey, tenths, walls, distanceIndex, eirp, sensitivity } (6 GHz는 켜짐)
 */
function reference_describe_screen(state) {
  const { materialKey, tenths, walls, distanceIndex, eirp, sensitivity } = state;
  const material = REFERENCE_MATERIALS[materialKey];
  const materialName = material.label.toLowerCase();
  const thicknessText = reference_format_thickness(tenths);
  const distanceText = String(WIFI_DISTANCE_LADDER[distanceIndex]);
  const distanceShown = reference_format_length(frac_read_decimal(distanceText));
  const wallLosses = reference_read_wall_losses(materialKey, tenths);
  const freeSpace = reference_read_free_space_losses(distanceText);
  const eirpFixed = BigInt(eirp) * FIXED_ONE;
  const sensitivityFixed = BigInt(sensitivity) * FIXED_ONE;
  const wallCount = BigInt(walls);

  const bands = REFERENCE_BANDS.map((band, index) => {
    const wallTotal = wallCount * wallLosses[index];
    const pathLoss = freeSpace[index] + wallTotal;
    const received = eirpFixed - pathLoss;
    return {
      ...band,
      wallLoss: wallLosses[index],
      wallTotal,
      freeSpace: freeSpace[index],
      pathLoss,
      received,
      margin: received - sensitivityFixed,
      reach: reference_read_reach(eirp - sensitivity, materialKey, tenths, walls, index, wallTotal),
      atNear: eirpFixed - reference_read_free_space_losses(String(WIFI_DISTANCE_MIN_M))[index] - wallTotal,
      atFar: eirpFixed - reference_read_free_space_losses(String(WIFI_DISTANCE_MAX_M))[index] - wallTotal,
    };
  });
  const [low, high] = bands;
  const gap = low.received - high.received;
  const perWall = high.wallLoss - low.wallLoss;
  const gapText = reference_format_db(gap < 0n ? -gap : gap, REFERENCE_GAP_DIGITS);

  const wallsPhrase =
    walls === 0
      ? 'no walls at all'
      : `${REFERENCE_COUNT_WORDS[walls]} ${thicknessText} mm ${materialName} ${reference_format_plural(walls, material.unitNoun)}`;
  const verdictState = gap <= -REFERENCE_GAP_EDGE ? 'break' : gap < REFERENCE_GAP_EDGE ? 'edge' : 'hold';
  const headline =
    verdictState === 'hold'
      ? `In this model, 2.4 GHz is still ahead of 5 GHz here, by ${gapText} dB.`
      : verdictState === 'edge'
        ? `In this model, 2.4 GHz and 5 GHz are within ${gapText} dB of each other here.`
        : `In this model, 5 GHz has overtaken 2.4 GHz here, by ${gapText} dB.`;
  const detail =
    `At ${distanceShown} ${walls === 0 ? 'with' : 'through'} ${wallsPhrase}, the model puts ` +
    `2.4 GHz at ${reference_format_db(low.received)} dBm and 5 GHz at ${reference_format_db(high.received)} dBm.`;

  const flagged = bands.filter((band) => walls > 0 && band.wallLoss < REFERENCE_THIN_SLAB_DB);
  const thinNote =
    flagged.length === 0
      ? ''
      : ` One ${thicknessText} mm ${materialName} ${material.unitNoun} comes out under 1 dB here ` +
        `(${flagged.map((band) => `${band.label} at ${reference_format_db(band.wallLoss, REFERENCE_TABLE_DIGITS)} dB`).join(', ')}). ` +
        `In this model a slab's loss rises and falls with its thickness, because the reflections off its two faces ` +
        `add or cancel depending on how much of a wave fits inside. That is a property of the thickness, not a measurement.`;

  const axis = reference_describe_axis(
    bands.map((band) => band.atNear),
    bands.map((band) => band.atFar),
    sensitivityFixed,
  );
  const offChart = bands
    .filter((band) => band.reach < REFERENCE_DISTANCE_MIN || band.reach > REFERENCE_DISTANCE_MAX)
    .map(
      (band) =>
        ` ${band.label}'s reach (${reference_format_reach(band.reach)}) falls ` +
        `${band.reach < REFERENCE_DISTANCE_MIN ? 'short of the left edge' : 'past the right edge'} of this chart — the arrow marks it.`,
    )
    .join('');

  const shown = {};
  // 손잡이
  shown['slider.distance-output'] = distanceShown;
  shown['slider.distance-valuetext'] = distanceShown;
  shown['slider.walls-output'] = String(walls);
  shown['slider.walls-valuetext'] = `${walls} ${reference_format_plural(walls, 'wall')}`;
  shown['slider.material-output'] = material.label;
  shown['slider.thickness-output'] = `${thicknessText} mm`;
  shown['slider.thickness-valuetext'] = `${thicknessText} millimetres`;
  shown['slider.eirp-output'] = `${eirp} dBm`;
  shown['slider.eirp-valuetext'] = `${eirp} dBm`;
  shown['slider.sensitivity-output'] = `${reference_format_db(sensitivityFixed, 0)} dBm`;
  shown['slider.sensitivity-valuetext'] = `${reference_format_db(sensitivityFixed, 0)} dBm`;
  shown['slider.band6-output'] = 'shown';
  shown['slider.walls-phrase'] = wallsPhrase;
  // 배지
  shown['gap.label'] = gap >= 0n ? REFERENCE_GAP_LABEL_BELOW : REFERENCE_GAP_LABEL_ABOVE;
  shown['gap.value'] = gapText;
  shown['gap.sentence'] = `${gapText} dB ${gap >= 0n ? 'below' : 'above'} 2.4 GHz`;
  // 격차 카드가 above로 뒤집히면 벽당 값의 부호도 그 방향 기준.
  shown['perwall.value'] = reference_format_signed_db(gap >= 0n ? perWall : -perWall);
  shown['badge.note'] =
    walls === 0
      ? 'With no walls that gap is the two centre frequencies alone, at the same antenna gain in both bands, and it does not change with distance.'
      : frac_round_fixed(perWall < 0n ? -perWall : perWall, REFERENCE_GAP_DIGITS) === 0n
        ? `In this model every ${materialName} ${material.unitNoun} moves the gap by less than 0.01 dB. ` +
          `With no walls at all, 2.4 GHz starts ${reference_format_db(REFERENCE_OPEN_GAP, REFERENCE_GAP_DIGITS)} dB ahead.`
      : perWall < 0n
        ? `In this model every ${materialName} ${material.unitNoun} moves the gap ` +
          `${reference_format_db(-perWall, REFERENCE_GAP_DIGITS)} dB toward 5 GHz. With no walls at all, 2.4 GHz starts ` +
          `${reference_format_db(REFERENCE_OPEN_GAP, REFERENCE_GAP_DIGITS)} dB ahead.`
        : `In this model every ${materialName} ${material.unitNoun} widens 2.4 GHz’s lead by ` +
          `${reference_format_db(perWall, REFERENCE_GAP_DIGITS)} dB, and ` +
          `${reference_format_db(REFERENCE_OPEN_GAP, REFERENCE_GAP_DIGITS)} dB of the lead is there with no walls at all.`;
  // 배너
  shown['verdict.state'] = verdictState;
  shown['verdict.headline'] = headline;
  shown['verdict.detail'] = detail;
  shown['chart.label'] = `${headline} ${detail}`;
  // 대역별 카드
  for (const band of bands) {
    shown[`card.${band.key}.received`] = reference_format_db(band.received);
    shown[`card.${band.key}.margin`] = reference_format_db(band.margin);
    shown[`card.${band.key}.reach`] = reference_format_reach(band.reach);
  }
  // 분해표
  for (const band of bands) {
    shown[`table.${band.key}.band`] = band.label;
    shown[`table.${band.key}.free`] = `${reference_format_db(band.freeSpace, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.one`] = `${reference_format_db(band.wallLoss, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.all`] = `${reference_format_db(band.wallTotal, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.total`] = `${reference_format_db(band.pathLoss, REFERENCE_TABLE_DIGITS)} dB`;
  }
  shown['table.thin'] = thinNote;
  shown['table.note'] =
    `Free-space loss is 20·log₁₀(d) + 20·log₁₀(f) + ${REFERENCE_FSPL_CONSTANT_TEXT} with the distance in kilometres and the ` +
    `frequency in megahertz. One wall is the slab formula at ${thicknessText} mm of ${materialName}, ` +
    (walls === 0
      ? 'and with no walls standing the walls column is zero'
      : `and the walls column is that figure times ${REFERENCE_COUNT_WORDS[walls]}`) +
    `.${thinNote}`;
  // 범례
  shown['legend.key'] = REFERENCE_LEGEND_KEY_TEXT;
  shown['legend.note'] =
    `${REFERENCE_LEGEND_KEY_TEXT} Vertical axis ${axis.low} to ${axis.high} dBm, rescaled to fit — read it before ` +
    `comparing two settings. The horizontal axis is fixed at ${WIFI_DISTANCE_MIN_M} to ${WIFI_DISTANCE_MAX_M} m ` +
    `on a log scale, which is why every curve is a straight line.${offChart}`;
  return shown;
}

// ── 피검 1: 표시 함수 경로 ───────────────────────────────────

/** 모델 파라미터. 두께는 위젯과 같은 클램프를 지난 값(눈금 위라 그대로다). */
function fixture_build_params(state) {
  return {
    distanceM: WIFI_DISTANCE_LADDER[state.distanceIndex],
    wallCount: state.walls,
    materialKey: state.materialKey,
    thicknessMm: model_clamp_thickness(state.materialKey, Number(reference_format_thickness(state.tenths))),
    eirpDbm: state.eirp,
    sensitivityDbm: state.sensitivity,
  };
}

/** export된 display_* 함수들이 이 상태에서 내는 문자열. 칸 이름은 오라클과 같다. */
function fixture_read_display(state) {
  const params = fixture_build_params(state);
  const result = model_calculate_result(params);
  const spoken = display_describe_verdict(result);
  const shown = {};
  shown['slider.distance-output'] = display_format_distance(params.distanceM);
  shown['slider.walls-phrase'] = display_describe_walls(params.wallCount, params.materialKey, params.thicknessMm);
  shown['gap.value'] = display_format_db(Math.abs(result.bandGapDb), REFERENCE_GAP_DIGITS);
  shown['gap.sentence'] = display_describe_band_gap(result.bandGapDb);
  shown['perwall.value'] = display_format_signed_db(
    result.bandGapDb >= 0 ? result.bandGapPerWallDb : -result.bandGapPerWallDb,
  );
  shown['badge.note'] = display_describe_gap(result);
  shown['verdict.state'] = spoken.verdict;
  shown['verdict.headline'] = spoken.headline;
  shown['verdict.detail'] = spoken.detail;
  for (const band of result.bands) {
    shown[`card.${band.key}.received`] = display_format_db(band.receivedDbm);
    shown[`card.${band.key}.margin`] = display_format_db(band.marginDb);
    shown[`card.${band.key}.reach`] = display_format_reach(band.rangeM);
    shown[`table.${band.key}.free`] = `${display_format_db(band.freeSpaceLossDb, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.one`] = `${display_format_db(band.wallLossDb, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.all`] = `${display_format_db(band.wallTotalDb, REFERENCE_TABLE_DIGITS)} dB`;
    shown[`table.${band.key}.total`] = `${display_format_db(band.pathLossDb, REFERENCE_TABLE_DIGITS)} dB`;
  }
  shown['table.thin'] = display_describe_thin_slab(result, true);
  shown['legend.key'] = display_describe_legend(true);
  return shown;
}
const DISPLAY_FIELD_COUNT = 9 + REFERENCE_BANDS.length * 7 + 2;

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

/** URL 쿼리로 상태를 싣고 붙인다. 갱신마다 살아 남는 원소는 여기서 한 번만 찾아 둔다. */
function fixture_mount_widget(search = '') {
  const dom = fixture_create_dom({ search, width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  const all = fixture_scan_elements(dom.root);
  const by_class = (name) => all.filter((el) => fixture_check_class(el, name));
  const input_of = (id) => all.find((el) => el.tagName === 'input' && el.getAttribute('id') === id);
  const output_of = (id) => all.find((el) => el.tagName === 'output' && el.getAttribute('for') === id);
  const readouts = by_class('readout').map((box) => ({
    box,
    label: box.children[0],
    value: box.children[1].children[0],
  }));
  const verdict = by_class('verdict')[0];
  const [badgeNote, legendNote, tableNote] = by_class('legend-note');
  return {
    dom,
    widget_reset,
    inputs: {
      distance: input_of('wifi-distance'),
      walls: input_of('wifi-walls'),
      thickness: input_of('wifi-thickness'),
      eirp: input_of('wifi-eirp'),
      sensitivity: input_of('wifi-sensitivity'),
    },
    select: all.find((el) => el.tagName === 'select'),
    outputs: Object.fromEntries(
      ['distance', 'walls', 'material', 'thickness', 'eirp', 'sensitivity', 'band6'].map((name) => [
        name,
        output_of(`wifi-${name}`),
      ]),
    ),
    readouts,
    verdict,
    headline: verdict.children[0],
    detail: verdict.children[2],
    canvas: all.find((el) => el.tagName === 'canvas'),
    tbody: all.find((el) => el.tagName === 'tbody'),
    badgeNote,
    legendNote,
    tableNote,
  };
}

/** 재질을 사람이 고른 것처럼 바꾼다. 위젯은 두께를 그 재질의 기본값으로 되돌린다. */
function fixture_switch_material(mounted, materialKey) {
  mounted.select.value = materialKey;
  return mounted.dom.listeners_run_event(mounted.select, 'change');
}

/** 슬라이더 다섯 개를 옮기고 change를 한 번 발화시킨다 — 위젯은 조작부 전체를 다시 읽는다. */
function fixture_update_sliders(mounted, state) {
  mounted.inputs.distance.value = String(state.distanceIndex);
  mounted.inputs.walls.value = String(state.walls);
  mounted.inputs.thickness.value = reference_format_thickness(state.tenths);
  mounted.inputs.eirp.value = String(state.eirp);
  mounted.inputs.sensitivity.value = String(state.sensitivity);
  return mounted.dom.listeners_run_event(mounted.inputs.distance, 'change');
}

/** 지금 화면의 글자를 오라클과 같은 칸 이름으로 읽는다. */
function fixture_read_screen(mounted) {
  const shown = {};
  for (const name of ['distance', 'walls', 'thickness', 'eirp', 'sensitivity']) {
    shown[`slider.${name}-output`] = mounted.outputs[name].textContent;
    shown[`slider.${name}-valuetext`] = mounted.inputs[name].getAttribute('aria-valuetext');
  }
  shown['slider.material-output'] = mounted.outputs.material.textContent;
  shown['slider.band6-output'] = mounted.outputs.band6.textContent;

  const [gapCard, perWallCard, ...bandCards] = mounted.readouts;
  shown['gap.label'] = gapCard.label.textContent;
  shown['gap.value'] = gapCard.value.textContent;
  shown['perwall.value'] = perWallCard.value.textContent;
  shown['badge.note'] = mounted.badgeNote.textContent;

  shown['verdict.state'] = mounted.verdict.dataset.state;
  shown['verdict.headline'] = mounted.headline.textContent;
  shown['verdict.detail'] = mounted.detail.textContent;
  shown['chart.label'] = mounted.canvas.getAttribute('aria-label');

  // 카드는 대역마다 [수신, 여유, 도달] 순서다(widget_mount의 append 순서).
  REFERENCE_BANDS.forEach((band, index) => {
    const [received, margin, reach] = bandCards.slice(index * 3, index * 3 + 3);
    shown[`card.${band.key}.received`] = received?.value.textContent;
    shown[`card.${band.key}.margin`] = margin?.value.textContent;
    shown[`card.${band.key}.reach`] = reach?.value.textContent;
  });
  mounted.tbody.children.forEach((row, index) => {
    const key = REFERENCE_BANDS[index]?.key ?? `extra-${index}`;
    const [band, free, one, all, total] = row.children.map((cell) => cell.textContent);
    Object.assign(shown, {
      [`table.${key}.band`]: band,
      [`table.${key}.free`]: free,
      [`table.${key}.one`]: one,
      [`table.${key}.all`]: all,
      [`table.${key}.total`]: total,
    });
  });
  shown['table.note'] = mounted.tableNote.textContent;
  shown['legend.note'] = mounted.legendNote.textContent.replace(TOUCHING_SENTENCE_PATTERN, '');
  return shown;
}
const SCREEN_FIELD_COUNT = 12 + 8 + REFERENCE_BANDS.length * 3 + REFERENCE_BANDS.length * 5 + 2;

// ── 대조 ─────────────────────────────────────────────────────

const test_label_state = (state) =>
  `${state.materialKey} t=${reference_format_thickness(state.tenths)} n=${state.walls} ` +
  `d=${WIFI_DISTANCE_LADDER[state.distanceIndex]} eirp=${state.eirp} sens=${state.sensitivity}`;

/** 한 상태를 대조해 어긋난 칸을 모은다. 반환: 비교한 칸 수. */
function test_compare_state(state, got, mismatches) {
  const want = reference_describe_screen(state);
  let compared = 0;
  for (const field of Object.keys(got)) {
    compared += 1;
    if (got[field] !== want[field]) {
      mismatches.push({ 상태: test_label_state(state), 칸: field, 화면: got[field], 정확: want[field] });
    }
  }
  return compared;
}

function test_summarize(list) {
  return { 불일치: list.length, 처음: list.slice(0, MISMATCH_SAMPLE_MAX) };
}
const CLEAN = { 불일치: 0, 처음: [] };

const DEFAULT_RADIO = { eirp: WIFI_EIRP_DEFAULT_DBM, sensitivity: WIFI_SENSITIVITY_DEFAULT_DBM };

/** 기본 EIRP·문턱에서 재질 × 두께 전 눈금 × 벽 수 × (거리 목록). */
function* fixture_walk_house(distanceIndices, pickTicks = (key) => THICKNESS_TICKS[key]) {
  for (const materialKey of WIFI_MATERIAL_KEYS) {
    for (const tenths of pickTicks(materialKey)) {
      for (const walls of WALL_COUNTS) {
        for (const distanceIndex of distanceIndices) {
          yield { materialKey, tenths, walls, distanceIndex, ...DEFAULT_RADIO };
        }
      }
    }
  }
}

/** 기본 집·거리에서 EIRP 전 범위 × 문턱 전 범위. */
function* fixture_walk_radio() {
  for (const eirp of EIRP_VALUES) {
    for (const sensitivity of SENSITIVITY_VALUES) {
      yield {
        materialKey: WIFI_MATERIAL_DEFAULT,
        tenths: DEFAULT_TENTHS,
        walls: WIFI_WALL_COUNT_DEFAULT,
        distanceIndex: DISTANCE_DEFAULT_INDEX,
        eirp,
        sensitivity,
      };
    }
  }
}

/** 마운트한 위젯 하나로 상태 목록을 돈다. 재질이 바뀔 때만 선택상자를 바꾼다. */
function test_run_mounted(states) {
  const mismatches = [];
  let count = 0;
  let compared = 0;
  let fired = 0;
  const mounted = fixture_mount_widget('');
  try {
    let currentMaterial = null;
    for (const state of states) {
      if (state.materialKey !== currentMaterial) {
        fired += fixture_switch_material(mounted, state.materialKey);
        currentMaterial = state.materialKey;
      }
      fired += fixture_update_sliders(mounted, state);
      compared += test_compare_state(state, fixture_read_screen(mounted), mismatches);
      count += 1;
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return { mismatches, count, compared, fired };
}

function test_run_display(states) {
  const mismatches = [];
  let count = 0;
  let compared = 0;
  for (const state of states) {
    compared += test_compare_state(state, fixture_read_display(state), mismatches);
    count += 1;
  }
  return { mismatches, count, compared };
}

const LONG_TIMEOUT_MS = 120000;

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it('ln 2, ln 10, π가 알려진 값과 30자리까지 같다', () => {
    expect(frac_format_scaled(frac_round_fixed(REFERENCE_LN2, 30), 30)).toBe('0.693147180559945309417232121458');
    expect(frac_format_scaled(frac_round_fixed(REFERENCE_LN10, 30), 30)).toBe('2.302585092994045684017991454684');
    expect(frac_format_scaled(frac_round_fixed(REFERENCE_PI, 30), 30)).toBe('3.141592653589793238462643383280');
    const { cos, sin } = frac_calculate_cos_sin(REFERENCE_PI / 3n);
    expect(frac_format_scaled(frac_round_fixed(cos, 40), 40)).toBe(`0.5${'0'.repeat(39)}`);
    expect(frac_format_scaled(frac_round_fixed(frac_multiply(sin, sin), 40), 40)).toBe(`0.75${'0'.repeat(38)}`);
    expect(frac_format_scaled(frac_round_fixed(frac_calculate_exp(REFERENCE_LN10), 40), 40)).toBe(`10.${'0'.repeat(40)}`);
  });

  it('FSPL 원식에서 km·MHz 상수 32.4478이 나온다', () => {
    expect(REFERENCE_FSPL_CONSTANT_TEXT).toBe('32.4478');
    // 1 m, 2437 MHz: 20·log₁₀(4π·2437e6/c) = 40.18… dB
    expect(reference_format_db(reference_calculate_free_space_loss('1', 2437), 2)).toBe('40.18');
  });

  it('복소 √는 주값이다: √(3−4j) = 2−j, √(−4) = 2j', () => {
    const three = 3n * FIXED_ONE;
    const four = 4n * FIXED_ONE;
    expect(complex_calculate_sqrt({ re: three, im: -four })).toEqual({ re: 2n * FIXED_ONE, im: -FIXED_ONE });
    expect(complex_calculate_sqrt({ re: -four, im: 0n })).toEqual({ re: 0n, im: 2n * FIXED_ONE });
  });

  it('무손실 슬래브 n = 2: 반파장 두께는 0 dB, 사분파장 두께는 −20·log₁₀(0.8) = 1.9382 dB', () => {
    const refractive = { re: 2n * FIXED_ONE, im: 0n };
    const halfWave = reference_calculate_slab_loss(refractive, { re: REFERENCE_PI, im: 0n });
    expect(halfWave < 10n ** BigInt(FIXED_DIGITS - 50) && halfWave > -(10n ** BigInt(FIXED_DIGITS - 50))).toBe(true);
    const quarterWave = reference_calculate_slab_loss(refractive, { re: REFERENCE_PI / 2n, im: 0n });
    expect(reference_format_db(quarterWave, 4)).toBe('1.9382');
  });

  it('표기 규칙: 부호는 반올림 전 값에서, 0.5는 올림, 단위는 반올림 전 값으로 고른다', () => {
    expect(reference_format_db(frac_read_decimal('-0.04'))).toBe('−0.0');
    expect(reference_format_db(frac_read_decimal('0.05'))).toBe('0.1');
    expect(reference_format_db(0n, 2)).toBe('0.00');
    expect(reference_format_signed_db(frac_read_decimal('-0.004'))).toBe('0.00');
    expect(reference_format_length(frac_read_decimal('0.5'))).toBe('0.5 m');
    expect(reference_format_length(frac_read_decimal('999.96'))).toBe('1000 m');
    expect(reference_format_length(frac_read_decimal('1234.5'))).toBe('1.235 km');
    expect(reference_format_length(frac_read_decimal('0.000000000012345'))).toBe('0.00000001235 mm');
    expect(reference_format_reach(frac_read_decimal('0.4999'))).toBe('under 0.5 m');
  });

  it('리터럴로 적은 재질 계수·대역이 model.js 표와 같은 것을 가리킨다 (격자가 누구도 빠뜨리지 않는다)', () => {
    expect(Object.keys(REFERENCE_MATERIALS).sort()).toEqual([...WIFI_MATERIAL_KEYS].sort());
    for (const key of WIFI_MATERIAL_KEYS) {
      const model = WIFI_MATERIALS[key];
      const mine = REFERENCE_MATERIALS[key];
      expect([mine.a, mine.b, mine.c, mine.d, mine.label, mine.unitNoun].map(String)).toEqual(
        [model.epsilonFactor, model.epsilonExponent, model.sigmaFactor, model.sigmaExponent, model.label, model.unitNoun].map(
          String,
        ),
      );
    }
    expect(REFERENCE_BANDS.map((band) => [band.key, band.label, band.frequencyMHz])).toEqual(
      WIFI_BANDS.map((band) => [band.key, band.label, band.frequencyMHz]),
    );
  });

  it('격자는 슬라이더가 스냅하는 값 그대로다', () => {
    for (const key of WIFI_MATERIAL_KEYS) {
      for (const tenths of THICKNESS_TICKS[key]) {
        const mm = Number(reference_format_thickness(tenths));
        expect(model_clamp_thickness(key, mm)).toBe(mm);
      }
    }
    expect(THICKNESS_TICK_TOTAL).toBe(190);
    expect(WIFI_DISTANCE_LADDER.length).toBe(25);
    expect(DISTANCE_DEFAULT_INDEX).toBeGreaterThanOrEqual(0);
    expect(WALL_COUNTS.length).toBe(9);
    expect(EIRP_VALUES.length * SENSITIVITY_VALUES.length).toBe(37 * 36);
  });
});

// ── 표시 함수 경로: 전 격자 ──────────────────────────────────

describe('표시 함수 — 5 재질 × 두께 전 눈금 × 벽 0–8 × 거리 사다리 전부 (EIRP 20, 문턱 −82)', () => {
  it(
    'display_* 함수의 카드·표·격차·배너·도달거리 문자열이 오라클과 글자 하나까지 같다',
    () => {
      const run = test_run_display(fixture_walk_house(DISTANCE_INDICES));
      expect(run.count).toBe(THICKNESS_TICK_TOTAL * WALL_COUNTS.length * WIFI_DISTANCE_LADDER.length);
      expect(run.compared).toBe(run.count * DISPLAY_FIELD_COUNT);
      expect(test_summarize(run.mismatches)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );
});

describe('표시 함수 — EIRP 전 범위 × 문턱 전 범위 (기본 집·거리)', () => {
  it('display_* 함수의 문자열이 모든 (EIRP, 문턱)에서 오라클과 같다', () => {
    const run = test_run_display(fixture_walk_radio());
    expect(run.count).toBe(EIRP_VALUES.length * SENSITIVITY_VALUES.length);
    expect(run.compared).toBe(run.count * DISPLAY_FIELD_COUNT);
    expect(test_summarize(run.mismatches)).toEqual(CLEAN);
  });
});

// ── 마운트 경로 ──────────────────────────────────────────────

describe('마운트한 화면 — 슬라이더를 실제로 옮겨 읽는다', () => {
  it(
    '재질 × 두께 전 눈금 × 벽 0–8 × 대표 거리 3칸: 화면 글자가 오라클과 같다',
    () => {
      const run = test_run_mounted(fixture_walk_house(DISTANCE_SAMPLE_INDICES));
      expect(run.count).toBe(THICKNESS_TICK_TOTAL * WALL_COUNTS.length * DISTANCE_SAMPLE_INDICES.length);
      // 격자가 정말 돌았는가 — change 리스너가 불리지 않았으면 읽기는 첫 화면의 재탕이다.
      expect(run.fired).toBe(run.count + WIFI_MATERIAL_KEYS.length);
      expect(run.compared).toBe(run.count * SCREEN_FIELD_COUNT);
      expect(test_summarize(run.mismatches)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    '재질마다 기본 두께 × 벽 0–8 × 거리 사다리 전부: 화면 글자가 오라클과 같다',
    () => {
      const run = test_run_mounted(
        fixture_walk_house(DISTANCE_INDICES, (key) => [
          Math.round(WIFI_MATERIALS[key].thicknessDefaultMm * TENTHS_PER_MILLIMETRE),
        ]),
      );
      expect(run.count).toBe(WIFI_MATERIAL_KEYS.length * WALL_COUNTS.length * WIFI_DISTANCE_LADDER.length);
      expect(run.compared).toBe(run.count * SCREEN_FIELD_COUNT);
      expect(test_summarize(run.mismatches)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );

  it(
    'EIRP 전 범위 × 문턱 전 범위 (기본 집·거리): 화면 글자가 오라클과 같다',
    () => {
      const run = test_run_mounted(fixture_walk_radio());
      expect(run.count).toBe(EIRP_VALUES.length * SENSITIVITY_VALUES.length);
      expect(run.compared).toBe(run.count * SCREEN_FIELD_COUNT);
      expect(test_summarize(run.mismatches)).toEqual(CLEAN);
    },
    LONG_TIMEOUT_MS,
  );

  it('프리셋과 범위 양 끝은 URL에서 곧장 떠도 오라클과 같다', () => {
    const cases = WIFI_PRESETS.map((preset) => ({
      materialKey: preset.state.materialKey,
      tenths: Math.round(preset.state.thicknessMm * TENTHS_PER_MILLIMETRE),
      walls: preset.state.wallCount,
      distanceIndex: WIFI_DISTANCE_LADDER.indexOf(preset.state.distanceM),
      ...DEFAULT_RADIO,
    }));
    for (const materialKey of WIFI_MATERIAL_KEYS) {
      const ticks = THICKNESS_TICKS[materialKey];
      cases.push(
        {
          materialKey,
          tenths: ticks[0],
          walls: WIFI_WALL_COUNT_MIN,
          distanceIndex: 0,
          eirp: WIFI_EIRP_MAX_DBM,
          sensitivity: WIFI_SENSITIVITY_MIN_DBM,
        },
        {
          materialKey,
          tenths: ticks[ticks.length - 1],
          walls: WIFI_WALL_COUNT_MAX,
          distanceIndex: WIFI_DISTANCE_LADDER.length - 1,
          eirp: WIFI_EIRP_MIN_DBM,
          sensitivity: WIFI_SENSITIVITY_MAX_DBM,
        },
      );
    }
    const mismatches = [];
    for (const state of cases) {
      const search =
        `?d=${WIFI_DISTANCE_LADDER[state.distanceIndex]}&n=${state.walls}&m=${state.materialKey}` +
        `&t=${reference_format_thickness(state.tenths)}&eirp=${state.eirp}&sens=${state.sensitivity}&b6=1`;
      const mounted = fixture_mount_widget(search);
      try {
        test_compare_state(state, fixture_read_screen(mounted), mismatches);
        mounted.widget_reset();
      } finally {
        mounted.dom.restore();
      }
    }
    expect(cases.length).toBe(WIFI_PRESETS.length + WIFI_MATERIAL_KEYS.length * 2);
    expect(cases.every((state) => state.distanceIndex >= 0)).toBe(true);
    expect(mismatches).toEqual([]);
  });
});
