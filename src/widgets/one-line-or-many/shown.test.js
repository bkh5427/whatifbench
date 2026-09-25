/**
 * 줄 하나 vs 줄 여럿 — **화면에 찍히는 숫자 문자열**을 정확 유리수 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 딱 한 종류다: **표시 단계의 반올림이 값을 바꾼다.**
 * 모델이 옳은 분(分)을 내도 카드에 "0.87"이 찍히면 독자가 읽는 숫자는 0.87이고,
 * 그 사고는 화면에 아무 흔적도 남기지 않는다 — 곡선도, 표도, 판정 배너의 문장도
 * 그대로다. 숫자 한 글자만 다르다.
 *
 * 전례:
 *   · 몬티홀에서 같은 사고가 다섯 번(verdict-shown.test.js). 마지막이
 *     `1351/2000 = 67.55%`가 `67.5%`로 찍힌 것이고, 원인은 `toFixed`가
 *     **부동소수로 이미 경계 아래로 떨어진 값**을 내림한 것이었다.
 *   · 심슨의 역설(2026-09-24, shown.test.js)에서 `display_round_half_up`으로 고친
 *     사고가 같은 것이다. `toFixed`를 부동소수에 그대로 걸면 수학적으로 정확히
 *     x.x5인 상태가 한 칸 **내림**된다. 0.2875는 이진으로 0.28749999999999997779…다.
 *
 * 이 파일이 처음 잡아낸 것(2026-09-24). 당시 one-line-or-many의 표시 함수
 * (`display_format_minutes`·`display_format_ratio`)는 `toFixed`를 부동소수에 그대로
 * 걸고 있었고, 그래서 아래 격자에 **화면에 틀린 글자가 나오는 상태들**이 있었다:
 *
 *   ① 평균 대기 분: 정확히 …5인 상태에서 한 칸 내림됐다.
 *      예) c=1·ρ=0.35·E[S]=1.0분·CV=1.50 → 정확히 0.875분인데 "0.87" (정확은 "0.88").
 *   ② 배수 n.n×: 정확히 …5인 상태에서 갈렸다. 게다가 배수는 수학적으로 E[S]·CV와
 *      무관한데(cρ/C), 경계 상태에서는 **두 슬라이더를 움직이면 표시가 바뀌었다**.
 *      예) c=2·ρ=0.80 → 정확히 2.25배인데 720개 (E[S], CV) 조합 중 414개가 "2.2×".
 *   ③ c=1에서 두 배치는 **같은 배치**인데(모델 주석이 그렇게 적었다), 두 카드가
 *      서로 다른 문자열을 찍는 상태가 있었다. 예) ρ=0.18·E[S]=7.5분·CV=0.80 →
 *      "1.4" 대 "1.3". 판정 배너는 그 화면에서 "the two layouts are the same
 *      layout"이라고 적는다.
 *   ④ 95퍼센타일 분은 전 격자에서 어긋나지 않았다 — 값이 ln을 타고 나오므로
 *      표시 경계에 정확히 얹히는 일이 없다. 사고는 **유리수인 값**에만 있었다.
 *
 * **지금 상태(2026-09-25).** `widget.js`가 `display_round_half_up`(정수 반올림)을
 * 거쳐 찍으므로 ①②③이 고쳐졌고 이 파일의 모든 it이 통과한다. 그러니 이 주석을
 * "빨간 보고서"로 읽지 마라 — 지금 이 파일의 일은 그 회귀를 막는 것이다.
 * `display_round_half_up`을 떼거나 `toFixed`를 부동소수에 되돌리면 ①②③이 다시
 * 빨개진다. 위 예시 상태는 그 회귀를 재현하는 좌표로 남겨 둔다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 오라클은 **모델과 다른 식**이다. model.js는 Erlang B 재귀
 *      (B(k) = aB(k−1)/(k+aB(k−1)))로 C를 내지만, 여기서는 닫힌 형태
 *        C(c,a) = [aᶜ/(c!(1−ρ))] / [Σ_{k<c} aᵏ/k! + aᶜ/(c!(1−ρ))]
 *      를 BigInt 분자/분모 유리수로 계산한다. 같은 식을 두 번 쓰면 검사가 아니다.
 *   ⓑ 반올림도 정수 연산으로 한다(0.5는 올림 = `toFixed`의 명세와 같은 규칙).
 *      부동소수를 한 번도 거치지 않으므로 **경계가 경계로 남는다** — 그것이 요점이다.
 *   ⓒ 표시 자리수·배율은 widget.js 소스에서 읽는다. 위젯이 자리수를 바꾸면
 *      이 파일도 따라간다. 하드코딩하지 않는다.
 *   ⓓ 격자는 슬라이더가 실제로 만들 수 있는 상태만 쓴다. 슬라이더 값은 눈금 위의
 *      십진수이므로 **정확한 유리수**다 (ρ = tick/100, E[S] = tick/2, CV = tick/20).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  QUEUE_COUNTER_MIN,
  QUEUE_COUNTER_MAX,
  QUEUE_COUNTER_STEP,
  QUEUE_LOAD_MIN,
  QUEUE_LOAD_MAX,
  QUEUE_LOAD_STEP,
  QUEUE_SERVICE_MIN_MINUTES,
  QUEUE_SERVICE_MAX_MINUTES,
  QUEUE_SERVICE_STEP_MINUTES,
  QUEUE_CV_MIN,
  QUEUE_CV_MAX,
  QUEUE_CV_STEP,
  QUEUE_CV_EXACT,
  QUEUE_PERCENTILE,
  QUEUE_TAIL_PROBABILITY,
  model_clamp_load,
  model_clamp_service_minutes,
  model_clamp_variation,
  model_calculate_result,
  model_calculate_counter_table,
} from './model.js';
import {
  display_format_minutes,
  display_format_ratio,
  display_format_ratio_cell,
  display_format_percent,
  display_format_count,
  display_check_ratio_meaningless,
  display_describe_verdict,
} from './widget.js';

// ── 표시 규약을 코드에서 읽는다 ─────────────────────────────
/**
 * 자리수 상수는 widget.js의 모듈 지역이라 import할 수 없다. 소스를 읽어 가져온다.
 * (심슨 쪽 shown.test.js와 같은 방식. 되읽기만으로는 "1분 밑에서 두 자리"처럼
 * 조건이 붙은 규약을 복원할 수 없어서, 여기서는 소스 파싱을 주 경로로 쓰고
 * 아래에서 **동작으로 교차검증**한다.)
 */
const SOURCE = readFileSync(new URL('./widget.js', import.meta.url), 'utf8');

function source_read_number(name) {
  const found = SOURCE.match(new RegExp(`const ${name} = (-?[0-9.]+);`));
  if (!found) throw new Error(`widget.js에서 상수 ${name}를 못 찾았다 — 표기 규약이 바뀌었다.`);
  return Number(found[1]);
}
function source_read_expression(name) {
  const found = SOURCE.match(new RegExp(`const ${name} = (.+);`));
  if (!found) throw new Error(`widget.js에서 상수 ${name}를 못 찾았다 — 표기 규약이 바뀌었다.`);
  return found[1];
}

const MINUTE_DIGITS = source_read_number('MINUTE_DIGITS');
const MINUTE_SMALL_THRESHOLD = source_read_number('MINUTE_SMALL_THRESHOLD');
const MINUTE_SMALL_DIGITS = source_read_number('MINUTE_SMALL_DIGITS');
const MINUTE_SMALL_SIGNIFICANT = source_read_number('MINUTE_SMALL_SIGNIFICANT');
const MINUTE_SMALL_DECIMALS_MAX = source_read_number('MINUTE_SMALL_DECIMALS_MAX');
const RATIO_DIGITS = source_read_number('RATIO_DIGITS');
const PERCENT_SCALE = source_read_number('PERCENT_SCALE');

/**
 * "이 밑은 두 자리로 찍으면 0.00이 된다"는 경계. 소스의 **식 모양까지** 확인한 뒤
 * 같은 식으로 다시 만든다 — 위젯이 이 경계를 옮기면 여기서 걸린다.
 */
const MINUTE_ROUND_TO_ZERO_SOURCE = source_read_expression('MINUTE_ROUND_TO_ZERO_MINUTES');
const MINUTE_ROUND_TO_ZERO_MINUTES = 0.5 * Math.pow(10, -MINUTE_SMALL_DIGITS);
/** 배수를 찍지 않는 문턱. 위젯은 위 경계와 같은 자리로 둔다. */
const RATIO_MIN_DENOMINATOR_SOURCE = source_read_expression('RATIO_MIN_DENOMINATOR_MINUTES');

/** 표기 장식. 숫자가 아니라 규약이므로 여기서 고정한다 — 바뀌면 이 파일이 걸리는 것이 맞다. */
const RATIO_SUFFIX = '×'; // U+00D7 MULTIPLICATION SIGN. 라틴 x가 아니다.
const PERCENT_SUFFIX = '%';
const MISSING_TEXT = '—'; // U+2014 EM DASH. 값이 없거나 비율이 의미를 잃은 칸.

// ── 정확 유리수 ─────────────────────────────────────────────
/** 최대공약수. 약분을 매번 한다 — 격자가 10만 상태라 BigInt가 커지면 바로 느려진다. */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}
/** 유리수. 분모는 언제나 양수, 언제나 약분된 꼴로 둔다. */
function rat(num, den) {
  let n = BigInt(num);
  let d = BigInt(den);
  if (d === 0n) throw new Error('분모 0');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}
const rat_add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rat_sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rat_mul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rat_div = (a, b) => rat(a.n * b.d, a.d * b.n);
const rat_cmp = (a, b) => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
};
/** 유리수 → Number. 분자·분모가 15자리 안이면 변환이 정확하고 나눗셈만 1ulp다. */
const rat_to_number = (a) => Number(a.n) / Number(a.d);
const ONE = rat(1, 1);

/**
 * double을 **정확한** 유리수로. double은 이진 유리수이므로 2를 곱해 정수가 될 때까지
 * 올리면 오차 없이 옮겨진다. 모델이 분기 조건으로 쓰는 double 상수
 * (꼬리 확률 0.05000000000000004…, 반올림 경계 0.005)를 그 값 그대로 비교하기 위해 쓴다.
 */
function rat_from_double(value) {
  if (!Number.isFinite(value)) throw new Error('유한한 값이 아니다');
  let scaled = value;
  let den = 1n;
  let guard = 0;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    den *= 2n;
    guard += 1;
    if (guard > 1100) throw new Error('double을 유리수로 옮길 수 없다');
  }
  return rat(BigInt(scaled), den);
}

/** 모델이 실제로 비교에 쓰는 double 두 개를 정확한 유리수로. */
const TAIL_EXACT = rat_from_double(QUEUE_TAIL_PROBABILITY);
const ROUND_TO_ZERO_EXACT = rat_from_double(MINUTE_ROUND_TO_ZERO_MINUTES);

/**
 * 정수 나눗셈 + 반올림(0.5는 0에서 먼 쪽으로). `toFixed`의 명세도 "둘이 같으면 큰 n"이라
 * 양수에서는 같은 규칙이다. 차이는 **나눗셈을 하지 않는다**는 것뿐이고, 그래서
 * 경계가 경계로 남는다.
 */
function div_round_half_up(numerator, denominator) {
  if (numerator < 0n) return -div_round_half_up(-numerator, denominator);
  return (2n * numerator + denominator) / (2n * denominator);
}
/** 정수 q(= 값×10^digits)를 소수 digits자리 문자열로. */
function scaled_to_text(q, digits) {
  const negative = q < 0n;
  let body = (negative ? -q : q).toString();
  if (digits > 0) {
    while (body.length <= digits) body = `0${body}`;
    body = `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
  }
  return `${negative ? '-' : ''}${body}`;
}
/** 유리수를 소수 digits자리로 정확히 반올림한 문자열. */
function rat_to_fixed(value, digits) {
  return scaled_to_text(div_round_half_up(value.n * 10n ** BigInt(digits), value.d), digits);
}
/** 양의 유리수의 floor(log10). BigInt 비교만 쓴다 — Math.log10은 10의 거듭제곱에서 흔들린다. */
function rat_floor_log10(value) {
  if (value.n <= 0n) throw new Error('양수가 아니다');
  let exponent = 0;
  if (rat_cmp(value, ONE) >= 0) {
    while (rat_cmp(value, rat(10n ** BigInt(exponent + 1), 1)) >= 0) exponent += 1;
    return exponent;
  }
  while (rat_cmp(value, rat(1, 10n ** BigInt(-exponent))) < 0) exponent -= 1;
  return exponent;
}

// ── 오라클: 분(分) 표기 ─────────────────────────────────────
/**
 * `display_format_minutes`와 **같은 규약**을 정확 연산으로 다시 쓴다.
 *   · 0.005분 밑은 유효숫자 방식으로 자리수를 늘린다(상한 있음).
 *   · 1분 밑은 두 자리, 그 위는 한 자리.
 * 규약은 같아야 하고 **반올림만 달라야** 한다 — 그 차이가 이 파일이 찾는 것이다.
 */
function minute_decimals(value) {
  if (value.n === 0n) return MINUTE_SMALL_DIGITS; // 0분은 0 < 1이므로 두 자리 = "0.00"
  if (value.n > 0n && rat_cmp(value, ROUND_TO_ZERO_EXACT) < 0) {
    const exponent = rat_floor_log10(value);
    return Math.min(
      MINUTE_SMALL_DECIMALS_MAX,
      Math.max(MINUTE_SMALL_DIGITS, MINUTE_SMALL_SIGNIFICANT - 1 - exponent),
    );
  }
  return rat_cmp(value, rat(MINUTE_SMALL_THRESHOLD, 1)) < 0 ? MINUTE_SMALL_DIGITS : MINUTE_DIGITS;
}
const oracle_minutes = (value) => rat_to_fixed(value, minute_decimals(value));
const oracle_ratio = (value) => `${rat_to_fixed(value, RATIO_DIGITS)}${RATIO_SUFFIX}`;
/** 백분율은 위젯이 **정수로** 찍는다(`Math.round`). 오라클도 정수까지만 반올림한다. */
const oracle_percent = (value) => `${rat_to_fixed(rat_mul(value, rat(PERCENT_SCALE, 1)), 0)}${PERCENT_SUFFIX}`;

/** 이 값이 표시 반올림의 경계(정확히 …5)에 놓이는가. */
function is_boundary(value, digits) {
  const scaled = rat_mul(value, rat(10n ** BigInt(digits), 1));
  const remainder = ((scaled.n % scaled.d) + scaled.d) % scaled.d;
  return 2n * remainder === scaled.d;
}
const is_minute_boundary = (value) => is_boundary(value, minute_decimals(value));
const is_ratio_boundary = (value) => is_boundary(value, RATIO_DIGITS);

// ── 오라클: Erlang C 닫힌 형태 ──────────────────────────────
/**
 * C(c,a) = [aᶜ/(c!(1−ρ))] / [Σ_{k=0}^{c−1} aᵏ/k! + aᶜ/(c!(1−ρ))],  a = cρ.
 *
 * **model.js와 다른 식이다.** 모델은 Erlang B 재귀와 항등식
 * C = B/(1−ρ(1−B))로 가고, 여기는 계승과 거듭제곱을 그대로 쓴다. c ≤ 8이고
 * ρ = tick/100이라 BigInt가 12자리 안에서 끝난다(오버플로 걱정이 없다).
 */
function oracle_erlang_c(counterCount, load) {
  const offered = rat_mul(rat(counterCount, 1), load);
  let sum = rat(0, 1);
  let power = ONE;
  let factorial = 1n;
  for (let k = 0; k < counterCount; k += 1) {
    if (k > 0) {
      power = rat_mul(power, offered);
      factorial *= BigInt(k);
    }
    sum = rat_add(sum, rat_mul(power, rat(1, factorial)));
  }
  let topPower = ONE;
  let topFactorial = 1n;
  for (let k = 1; k <= counterCount; k += 1) {
    topPower = rat_mul(topPower, offered);
    topFactorial *= BigInt(k);
  }
  const top = rat_div(rat_mul(topPower, rat(1, topFactorial)), rat_sub(ONE, load));
  return rat_div(top, rat_add(sum, top));
}

// ── 격자 ────────────────────────────────────────────────────
/**
 * 슬라이더 눈금을 **정수 tick**으로 다룬다. 눈금 위의 값은 십진수이므로
 * ρ = tick/100, E[S] = tick/2, CV = tick/20이 정확한 유리수다.
 * 위젯이 받는 double과 tick/분모의 나눗셈이 같은 double인지는 아래 it이 못박는다.
 */
const LOAD_TICKS_PER_UNIT = Math.round(1 / QUEUE_LOAD_STEP);
const SERVICE_TICKS_PER_UNIT = Math.round(1 / QUEUE_SERVICE_STEP_MINUTES);
const CV_TICKS_PER_UNIT = Math.round(1 / QUEUE_CV_STEP);

function ticks(min, max, perUnit) {
  const out = [];
  for (let t = Math.round(min * perUnit); t <= Math.round(max * perUnit); t += 1) out.push(t);
  return out;
}
const COUNTERS = (() => {
  const out = [];
  for (let c = QUEUE_COUNTER_MIN; c <= QUEUE_COUNTER_MAX; c += QUEUE_COUNTER_STEP) out.push(c);
  return out;
})();
const LOAD_TICKS = ticks(QUEUE_LOAD_MIN, QUEUE_LOAD_MAX, LOAD_TICKS_PER_UNIT); // 10…95
const SERVICE_TICKS = ticks(QUEUE_SERVICE_MIN_MINUTES, QUEUE_SERVICE_MAX_MINUTES, SERVICE_TICKS_PER_UNIT); // 1…20
const CV_TICKS = ticks(QUEUE_CV_MIN, QUEUE_CV_MAX, CV_TICKS_PER_UNIT); // 5…40

const load_of = (tick) => tick / LOAD_TICKS_PER_UNIT;
const service_of = (tick) => tick / SERVICE_TICKS_PER_UNIT;
const variation_of = (tick) => tick / CV_TICKS_PER_UNIT;
const load_rat = (tick) => rat(tick, LOAD_TICKS_PER_UNIT);

/**
 * E[S]·(1+CV²)/2 를 정확 유리수로. 두 슬라이더는 이 곱으로만 결과에 들어가므로
 * (모델의 두 식 모두 이 곱을 한 번 쓴다) 상태마다 BigInt 곱 한 번으로 끝난다.
 *   E[S]·V = (s/2)·(1 + (j/20)²)/2 = s·(400 + j²)/1600
 */
const service_variation_rat = (serviceTick, cvTick) =>
  rat(serviceTick * (400 + cvTick * cvTick), 2 * CV_TICKS_PER_UNIT * CV_TICKS_PER_UNIT * 2);

/**
 * (E[S], CV) 짝. 격자가 c × ρ × E[S] × CV의 곱이라 전부(8×86×20×36 = 495,360)는
 * 8초 안에 못 돈다. 대신 **양쪽 축의 모든 눈금이 적어도 한 번은 나오게** 고른다:
 *   · CV 표본 6개 × E[S] 눈금 전부 (20)   → E[S]의 모든 눈금
 *   · E[S] 표본 3개 × CV 눈금 전부 (36)   → CV의 모든 눈금
 * CV 표본에는 최소·최대·정확히 1(식이 정확한 자리)과 그 양옆을 넣는다.
 */
const CV_SAMPLE_TICKS = [
  CV_TICKS[0],
  Math.round(0.5 * CV_TICKS_PER_UNIT),
  Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT) - 1,
  Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT),
  Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT) + 1,
  CV_TICKS[CV_TICKS.length - 1],
].filter((t, i, all) => CV_TICKS.includes(t) && all.indexOf(t) === i);
const SERVICE_SAMPLE_TICKS = [
  SERVICE_TICKS[0],
  Math.round(3 * SERVICE_TICKS_PER_UNIT),
  SERVICE_TICKS[SERVICE_TICKS.length - 1],
].filter((t, i, all) => SERVICE_TICKS.includes(t) && all.indexOf(t) === i);

const PAIRS = (() => {
  const seen = new Set();
  const out = [];
  const add = (s, j) => {
    const key = `${s}:${j}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([s, j]);
  };
  for (const s of SERVICE_TICKS) for (const j of CV_SAMPLE_TICKS) add(s, j);
  for (const s of SERVICE_SAMPLE_TICKS) for (const j of CV_TICKS) add(s, j);
  return out;
})();

/** (c, ρ)마다 한 번만 만드는 값들. 격자의 안쪽 고리가 이것을 재사용한다. */
const BASES = (() => {
  const map = new Map();
  for (const c of COUNTERS) {
    for (const tick of LOAD_TICKS) {
      const load = load_rat(tick);
      const idle = rat_sub(ONE, load);
      const delay = oracle_erlang_c(c, load);
      map.set(`${c}:${tick}`, {
        counterCount: c,
        loadTick: tick,
        load,
        idle,
        delay,
        // 평균 대기 = (계수) × E[S]·V.  한 줄: C/(c(1−ρ)) / 창구별: ρ/(1−ρ)
        singleFactor: rat_div(delay, rat_mul(rat(c, 1), idle)),
        separateFactor: rat_div(load, idle),
        // 꼬리 축척 = 평균/대기확률. C와 ρ가 지워져 E[S]·V의 계수만 남는다.
        singleScale: rat_div(ONE, rat_mul(rat(c, 1), idle)),
        separateScale: rat_div(ONE, idle),
        // 배수 = 창구별평균/한줄평균 = cρ/C. E[S]와 CV가 **완전히 지워진다.**
        ratio: rat_div(rat_mul(rat(c, 1), load), delay),
        // 퍼센타일의 ln 인자. 유리수가 아닌 부분은 여기 한 곳에만 둔다.
        singleZero: rat_cmp(delay, TAIL_EXACT) <= 0,
        singleLog: Math.log(rat_to_number(delay) / QUEUE_TAIL_PROBABILITY),
        separateLog: Math.log(rat_to_number(load) / QUEUE_TAIL_PROBABILITY),
        // 모델이 double로 분기하는 자리에 위험할 만큼 가까운가 (아래 it이 0건을 확인한다)
        nearTail:
          Math.abs(rat_to_number(delay) - QUEUE_TAIL_PROBABILITY) / QUEUE_TAIL_PROBABILITY < 1e-12,
      });
    }
  }
  return map;
})();

/**
 * 95퍼센타일은 **유리수가 아니다.** P(W > t) = p·exp(−t/축척)을 뒤집으면
 *   t = 축척 · ln(p / 0.05)
 * 이고 ln은 초월수다. 그래서 오라클을 이렇게 나눈다:
 *   · 축척 = E[S]·V/(c(1−ρ)) (한 줄) 또는 E[S]·V/(1−ρ) (창구별) — **정확 유리수**로.
 *   · ln 인자만 Number로 (상대오차 ~1e-16). 곱한 값의 상대오차도 그 수준이다.
 * 그 다음 **표시 자리수보다 훨씬 작은 허용오차**로 대조한다: 정확한 반올림 문자열과
 * 맞추되, 값이 반올림 경계에서 허용오차 안에 들면 "판정 불가"로 세고 따로 단언한다
 * (0건이어야 한다 — 0건이면 초월수가 경계에 얹히지 않았다는 뜻이고, 그래서
 * 이 항목의 문자열 비교는 유리수 항목과 똑같이 엄격하다).
 */
const PERCENTILE_TOLERANCE_RELATIVE = 1e-11;
const PERCENTILE_TOLERANCE_ABSOLUTE = 1e-9;

function percentile_number(scale, logFactor) {
  return rat_to_number(scale) * logFactor;
}
/** Number 값에 대한 자리수 결정 + 경계 위험 표시. 규약은 위젯과 같다. */
function percentile_text(value) {
  if (value === 0) return { text: `${(0).toFixed(MINUTE_SMALL_DIGITS)}`, ambiguous: false };
  let decimals;
  let ambiguous = false;
  // 자리수를 가르는 문턱(0.005분, 1분)과 10의 거듭제곱 근처는 자리수 자체가 흔들린다.
  const nearThreshold = (x, edge) => Math.abs(x - edge) <= Math.abs(edge) * 1e-12;
  if (value > 0 && value < MINUTE_ROUND_TO_ZERO_MINUTES) {
    const exponent = Math.floor(Math.log10(value));
    if (nearThreshold(value, Math.pow(10, exponent))) ambiguous = true;
    decimals = Math.min(
      MINUTE_SMALL_DECIMALS_MAX,
      Math.max(MINUTE_SMALL_DIGITS, MINUTE_SMALL_SIGNIFICANT - 1 - exponent),
    );
  } else {
    decimals = value < MINUTE_SMALL_THRESHOLD ? MINUTE_SMALL_DIGITS : MINUTE_DIGITS;
  }
  if (nearThreshold(value, MINUTE_ROUND_TO_ZERO_MINUTES) || nearThreshold(value, MINUTE_SMALL_THRESHOLD)) {
    ambiguous = true;
  }
  const scaled = value * 10 ** decimals;
  const tolerance = Math.max(PERCENTILE_TOLERANCE_ABSOLUTE, Math.abs(scaled) * PERCENTILE_TOLERANCE_RELATIVE);
  const fraction = scaled - Math.floor(scaled);
  if (Math.abs(fraction - 0.5) < tolerance) ambiguous = true;
  return { text: scaled_to_text(BigInt(Math.round(scaled)), decimals), ambiguous };
}

// ── 한 번의 순회 ────────────────────────────────────────────
/**
 * 격자를 한 번만 돌고 항목별 불일치를 모은다. it마다 다시 돌면 같은 계산을
 * 여섯 번 하게 되고 8초 제약을 넘긴다.
 */
const SURVEY = (() => {
  const singleMean = [];
  const separateMean = [];
  const singleTail = [];
  const separateTail = [];
  const ratio = [];
  const ratioCell = [];
  const dashRule = [];
  let ambiguous = 0;
  let states = 0;
  let tailZeroStates = 0;
  let dashStates = 0;

  for (const base of BASES.values()) {
    const { counterCount: c, loadTick } = base;
    const load = load_of(loadTick);
    for (const [serviceTick, cvTick] of PAIRS) {
      states += 1;
      const product = service_variation_rat(serviceTick, cvTick);
      const wantSingleMean = rat_mul(base.singleFactor, product);
      const wantSeparateMean = rat_mul(base.separateFactor, product);
      const result = model_calculate_result(c, load, service_of(serviceTick), variation_of(cvTick));
      const state = { c, ρ: load, 'E[S]': service_of(serviceTick), CV: variation_of(cvTick) };

      // ① 평균 대기 분 — 정확 유리수
      let got = display_format_minutes(result.single.meanMinutes);
      let want = oracle_minutes(wantSingleMean);
      if (got !== want) {
        singleMean.push({ ...state, 화면: got, 정확: want, 정확값: rat_to_number(wantSingleMean) });
      }
      got = display_format_minutes(result.separate.meanMinutes);
      want = oracle_minutes(wantSeparateMean);
      if (got !== want) {
        separateMean.push({ ...state, 화면: got, 정확: want, 정확값: rat_to_number(wantSeparateMean) });
      }

      // ② 95퍼센타일 분 — 유리수 축척 × ln
      if (base.singleZero) {
        tailZeroStates += 1;
        got = display_format_minutes(result.single.percentileMinutes);
        want = (0).toFixed(MINUTE_SMALL_DIGITS);
        if (got !== want) singleTail.push({ ...state, 화면: got, 정확: want, 사유: '대기확률 ≤ 꼬리확률' });
      } else {
        const value = percentile_number(rat_mul(base.singleScale, product), base.singleLog);
        const oracle = percentile_text(value);
        got = display_format_minutes(result.single.percentileMinutes);
        if (oracle.ambiguous) ambiguous += 1;
        else if (got !== oracle.text) singleTail.push({ ...state, 화면: got, 정확: oracle.text, 정확값: value });
      }
      {
        const value = percentile_number(rat_mul(base.separateScale, product), base.separateLog);
        const oracle = percentile_text(value);
        got = display_format_minutes(result.separate.percentileMinutes);
        if (oracle.ambiguous) ambiguous += 1;
        else if (got !== oracle.text) separateTail.push({ ...state, 화면: got, 정확: oracle.text, 정확값: value });
      }

      // ③ 배수 n.n× — cρ/C. E[S]·CV가 수학적으로 지워진다.
      got = display_format_ratio(result.meanRatio);
      want = oracle_ratio(base.ratio);
      if (got !== want) ratio.push({ ...state, 화면: got, 정확: want, 정확값: rat_to_number(base.ratio) });

      // ④ 표의 "Mean cut by" 칸 — 분모가 작으면 대시
      const meaningless = rat_cmp(wantSingleMean, ROUND_TO_ZERO_EXACT) < 0;
      if (meaningless) dashStates += 1;
      if (display_check_ratio_meaningless(result.single.meanMinutes) !== meaningless) {
        dashRule.push({ ...state, 화면: display_check_ratio_meaningless(result.single.meanMinutes), 정확: meaningless });
      }
      got = display_format_ratio_cell(result);
      want = meaningless ? MISSING_TEXT : oracle_ratio(base.ratio);
      if (got !== want) ratioCell.push({ ...state, 화면: got, 정확: want });
    }
  }
  return {
    singleMean,
    separateMean,
    singleTail,
    separateTail,
    ratio,
    ratioCell,
    dashRule,
    ambiguous,
    states,
    tailZeroStates,
    dashStates,
  };
})();

/** 불일치 목록을 읽을 수 있게 — 개수와 처음 몇 건만 함께 단언한다. */
function summarize(bad) {
  return { 불일치: bad.length, 처음: bad.slice(0, 5) };
}
const CLEAN = { 불일치: 0, 처음: [] };
/** 각 it이 본 상태 수. 마지막 describe가 합계를 못박는다. */
const visited = { 카드와배수: SURVEY.states };

// ── 표시 규약 ───────────────────────────────────────────────
describe('표시 규약을 코드에서 읽었는가', () => {
  it('소스에서 읽은 자리수가 동작과 맞는다', () => {
    // 이진에서 정확한 값만 쓴다 — 여기서 반올림이 걸리면 자리수를 못 읽는다.
    expect(display_format_minutes(2)).toBe((2).toFixed(MINUTE_DIGITS));
    expect(display_format_minutes(0.5)).toBe((0.5).toFixed(MINUTE_SMALL_DIGITS));
    expect(display_format_minutes(MINUTE_SMALL_THRESHOLD)).toBe((1).toFixed(MINUTE_DIGITS));
    expect(display_format_ratio(1)).toBe(`${(1).toFixed(RATIO_DIGITS)}${RATIO_SUFFIX}`);
    expect(display_format_percent(1)).toBe(`${PERCENT_SCALE}${PERCENT_SUFFIX}`);
    expect(display_format_minutes(Number.NaN)).toBe(MISSING_TEXT);
    expect(display_format_ratio(Number.POSITIVE_INFINITY)).toBe(MISSING_TEXT);
  });

  it('두 문턱은 같은 식에서 나온다 — 소스의 식 모양까지 확인한다', () => {
    expect(MINUTE_ROUND_TO_ZERO_SOURCE).toBe('0.5 * Math.pow(10, -MINUTE_SMALL_DIGITS)');
    expect(RATIO_MIN_DENOMINATOR_SOURCE).toBe('MINUTE_ROUND_TO_ZERO_MINUTES');
    // 0.005 바로 밑에서는 자리수가 늘어나고, 그 위에서는 두 자리로 돌아온다.
    expect(display_format_minutes(MINUTE_ROUND_TO_ZERO_MINUTES)).toBe(
      MINUTE_ROUND_TO_ZERO_MINUTES.toFixed(MINUTE_SMALL_DIGITS),
    );
    expect(display_format_minutes(MINUTE_ROUND_TO_ZERO_MINUTES / 2).length).toBeGreaterThan(
      MINUTE_SMALL_DIGITS + 2,
    );
    expect(display_check_ratio_meaningless(MINUTE_ROUND_TO_ZERO_MINUTES)).toBe(false);
    expect(display_check_ratio_meaningless(MINUTE_ROUND_TO_ZERO_MINUTES / 2)).toBe(true);
  });

  it('격자의 tick/분모가 슬라이더가 스냅하는 double과 같은 값이다', () => {
    // 슬라이더 값을 유리수로 다루는 근거. 어긋나면 격자가 "만들 수 없는 상태"를 본다.
    for (const tick of LOAD_TICKS) expect(model_clamp_load(load_of(tick))).toBe(load_of(tick));
    for (const tick of SERVICE_TICKS) {
      expect(model_clamp_service_minutes(service_of(tick))).toBe(service_of(tick));
    }
    for (const tick of CV_TICKS) expect(model_clamp_variation(variation_of(tick))).toBe(variation_of(tick));
  });
});

// ── 오라클 자기점검 ─────────────────────────────────────────
describe('오라클 자기점검 — 기대값을 만드는 쪽이 먼저 맞아야 한다', () => {
  it('닫힌 형태가 손으로 풀 수 있는 두 경우와 정확히 같다', () => {
    // c = 1: S = 1, T = a/(1−a) ⇒ C = a = ρ. 창구가 하나면 대기확률이 곧 이용률이다.
    // c = 2: S = 1+a, T = a²/(2−a) ⇒ C = a²/(2+a). (손으로 약분해 둔 식이다.)
    for (const tick of LOAD_TICKS) {
      const load = load_rat(tick);
      expect(rat_cmp(oracle_erlang_c(1, load), load)).toBe(0);
      const offered = rat_mul(rat(2, 1), load);
      const want = rat_div(rat_mul(offered, offered), rat_add(rat(2, 1), offered));
      expect(rat_cmp(oracle_erlang_c(2, load), want)).toBe(0);
    }
    // 교과서 값 하나: c = 2, a = 1 ⇒ C = 1/3.
    expect(rat_cmp(oracle_erlang_c(2, rat(1, 2)), rat(1, 3))).toBe(0);
  });

  it('대기확률은 0과 1 사이이고, ρ가 오르면 오르고 창구가 늘면 내려간다', () => {
    for (const c of COUNTERS) {
      let previous = null;
      for (const tick of LOAD_TICKS) {
        const value = oracle_erlang_c(c, load_rat(tick));
        expect(rat_cmp(value, rat(0, 1))).toBe(1);
        expect(rat_cmp(value, ONE)).toBe(-1);
        if (previous) expect(rat_cmp(value, previous)).toBe(1);
        previous = value;
        if (c > QUEUE_COUNTER_MIN) {
          expect(rat_cmp(value, oracle_erlang_c(c - 1, load_rat(tick)))).toBe(-1);
        }
      }
    }
  });

  it('닫힌 형태와 모델의 Erlang B 재귀가 상대오차 1e-12 안에서 같다', () => {
    // 두 식이 같은 값을 낸다는 확인이지, 기대값을 모델에서 가져오는 것이 아니다.
    // (모델은 double이라 정확히 같을 수 없다 — 그 차이가 이 파일이 다루는 사고의 씨앗이다.)
    let worst = 0;
    for (const base of BASES.values()) {
      const exact = rat_to_number(base.delay);
      const got = model_calculate_result(base.counterCount, load_of(base.loadTick), 3, QUEUE_CV_EXACT)
        .single.delayProbability;
      worst = Math.max(worst, Math.abs(got - exact) / exact);
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('0.5는 올린다 — 정수 반올림이 toFixed의 규칙과 같은 방향이다', () => {
    expect(rat_to_fixed(rat(875, 1000), 2)).toBe('0.88');
    expect(rat_to_fixed(rat(225, 100), 1)).toBe('2.3');
    expect(rat_to_fixed(rat(5, 10), 0)).toBe('1');
    expect(oracle_ratio(rat(29, 4))).toBe(`7.3${RATIO_SUFFIX}`); // 7.25
    expect(oracle_minutes(rat(1, 8))).toBe('0.13'); // 0.125
    expect(oracle_minutes(rat(0, 1))).toBe('0.00');
    // 0.005 밑에서는 자리수가 늘어난다 — "0.00"으로 죽이지 않는다.
    expect(oracle_minutes(rat(1, 1000))).toBe('0.0010');
    expect(oracle_minutes(rat(1, 10 ** 9))).toBe('0.000000');
  });

  it('모델이 double로 가르는 두 분기에 위험할 만큼 가까운 상태가 없다', () => {
    // 꼬리확률(0.05000000000000004…)과 배수 문턱(0.005)은 double 비교로 갈린다.
    // 정확값이 그 문턱에서 1e-12 안에 있으면 오라클과 모델의 **분기 자체가** 달라질 수 있다.
    expect([...BASES.values()].filter((b) => b.nearTail)).toEqual([]);
    expect(SURVEY.ambiguous).toBe(0);
  });
});

// ── 카드: 평균 대기 분 ──────────────────────────────────────
describe('카드와 표의 평균 대기 분', () => {
  it('한 줄(M/M/c) 평균이 정확한 반올림과 한 글자도 다르지 않다', () => {
    expect(summarize(SURVEY.singleMean)).toEqual(CLEAN);
  });

  it('창구별(M/M/1×c) 평균이 정확한 반올림과 한 글자도 다르지 않다', () => {
    expect(summarize(SURVEY.separateMean)).toEqual(CLEAN);
  });

  it('손으로 구성한 경계 하나: c=1·ρ=0.35·E[S]=1.0분·CV=1.50 → 정확히 0.875분', () => {
    // 0.35·1·1.625/0.65 = 0.875. 0.875는 이진에서 **정확한** 값인데도
    // 계산 경로(0.35와 0.65가 이진에서 정확하지 않다)가 0.8749999…로 내려놓는다.
    const exact = rat_div(rat_mul(rat_mul(rat(35, 100), rat(1, 1)), rat(1625, 1000)), rat(65, 100));
    expect(rat_cmp(exact, rat(875, 1000))).toBe(0);
    expect(oracle_minutes(exact)).toBe('0.88');
    const result = model_calculate_result(1, 0.35, 1, 1.5);
    expect(display_format_minutes(result.single.meanMinutes)).toBe('0.88');
  });
});

// ── 카드: 95퍼센타일 분 ─────────────────────────────────────
describe('카드와 표의 95퍼센타일 분 (ln이 들어가 유리수가 아닌 값)', () => {
  it('한 줄의 95퍼센타일이 정확 축척 × ln과 맞는다', () => {
    expect(summarize(SURVEY.singleTail)).toEqual(CLEAN);
  });

  it('창구별의 95퍼센타일이 정확 축척 × ln과 맞는다', () => {
    expect(summarize(SURVEY.separateTail)).toEqual(CLEAN);
  });

  it('대기확률이 꼬리확률 밑인 구간을 격자가 실제로 지난다 — 그 칸은 0분이다', () => {
    // C ≤ 0.05면 스무 명 중 열아홉 명이 아예 기다리지 않아 퍼센타일이 0이다.
    // 이 구간이 격자에 없으면 가드가 검사되지 않는다.
    expect(SURVEY.tailZeroStates).toBeGreaterThan(0);
    expect([...BASES.values()].filter((b) => b.singleZero).length).toBeGreaterThan(0);
    // 창구별 배치는 대기확률이 ρ이고 ρ ≥ 0.1 > 0.05이므로 절대 0이 아니다.
    expect(rat_cmp(rat(QUEUE_LOAD_MIN * LOAD_TICKS_PER_UNIT, LOAD_TICKS_PER_UNIT), TAIL_EXACT)).toBe(1);
    const idle = model_calculate_result(QUEUE_COUNTER_MAX, QUEUE_LOAD_MIN, 3, QUEUE_CV_EXACT);
    expect(display_format_minutes(idle.single.percentileMinutes)).toBe((0).toFixed(MINUTE_SMALL_DIGITS));
    expect(idle.separate.percentileMinutes).toBeGreaterThan(0);
  });
});

// ── 배수 ────────────────────────────────────────────────────
describe('배수 n.n× 와 표의 "Mean cut by" 칸', () => {
  it('배수가 cρ/C의 정확한 반올림과 한 글자도 다르지 않다', () => {
    expect(summarize(SURVEY.ratio)).toEqual(CLEAN);
  });

  it('배수를 찍지 않는 문턱(분모 < 0.005분)이 정확값과 같은 자리에서 갈린다', () => {
    expect(summarize(SURVEY.dashRule)).toEqual(CLEAN);
    expect(SURVEY.dashStates).toBeGreaterThan(0);
  });

  it('표의 칸은 문턱 안에서는 대시, 밖에서는 배수 문자열이다', () => {
    expect(summarize(SURVEY.ratioCell)).toEqual(CLEAN);
  });

  it('배수는 E[S]와 CV로 움직이지 않는다 — 두 슬라이더가 식에서 지워진다', () => {
    // cρ/C에는 E[S]도 CV도 없다(model.js 주석, index.astro의 빌드 시 검산).
    // 화면 문자열도 그래야 한다. 경계 상태에서 이것이 깨지면 독자는 "처리시간을
    // 바꾸면 배수가 바뀐다"는 **없는 인과**를 본다.
    const bad = [];
    for (const c of COUNTERS) {
      for (const tick of LOAD_TICKS) {
        const seen = new Map();
        for (const [serviceTick, cvTick] of PAIRS) {
          const text = display_format_ratio(
            model_calculate_result(c, load_of(tick), service_of(serviceTick), variation_of(cvTick)).meanRatio,
          );
          if (!seen.has(text)) seen.set(text, { 'E[S]': service_of(serviceTick), CV: variation_of(cvTick) });
        }
        if (seen.size > 1) {
          bad.push({
            c,
            ρ: load_of(tick),
            정확: oracle_ratio(BASES.get(`${c}:${tick}`).ratio),
            화면들: [...seen.entries()].map(([text, at]) => ({ 화면: text, 예: at })),
          });
        }
      }
    }
    expect(summarize(bad)).toEqual(CLEAN);
  });
});

// ── 백분율 ──────────────────────────────────────────────────
describe('이용률·유휴 백분율과 95퍼센타일 라벨', () => {
  it('ρ와 1−ρ의 백분율이 정확한 정수 반올림과 같다', () => {
    // 위젯은 `Math.round(fraction·100)`으로 **정수**까지만 찍는다 — 몬티홀이 택한 방식이다.
    // ρ가 0.01 눈금이라 ρ·100은 수학적으로 정수이고, 표시 경계(x.5)에 놓이는 상태가
    // 아예 없다. 그래서 이 항목은 구조적으로 안전하다 — 그것을 여기서 못박는다.
    const bad = [];
    for (const tick of LOAD_TICKS) {
      const load = load_rat(tick);
      const idle = rat_sub(ONE, load);
      for (const [value, text] of [
        [load, display_format_percent(load_of(tick))],
        [idle, display_format_percent(1 - load_of(tick))],
      ]) {
        if (text !== oracle_percent(value)) bad.push({ ρ: load_of(tick), 화면: text, 정확: oracle_percent(value) });
        if (is_boundary(rat_mul(value, rat(PERCENT_SCALE, 1)), 0)) bad.push({ ρ: load_of(tick), 경계: true });
      }
    }
    visited.백분율 = LOAD_TICKS.length * 2;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('퍼센타일 라벨은 모델 상수에서 나온다', () => {
    expect(display_format_percent(QUEUE_PERCENTILE)).toBe(oracle_percent(rat_from_double(QUEUE_PERCENTILE)));
    expect(display_format_percent(QUEUE_PERCENTILE)).toBe(`95${PERCENT_SUFFIX}`);
  });

  it('창구 수는 쉼표 없는 정수로 찍힌다', () => {
    for (const c of COUNTERS) expect(display_format_count(c)).toBe(String(c));
  });
});

// ── 창구 표 ─────────────────────────────────────────────────
describe('창구 표의 여섯 칸 (c = 1…8 한 줄씩)', () => {
  it('각 행의 네 분(分) 칸과 배수 칸이 정확한 반올림과 같다', () => {
    const bad = [];
    let count = 0;
    // 표는 ρ·E[S]·CV를 슬라이더에 둔 채 c만 훑는다. 표본을 촘촘히 쓰면 위의 격자와
    // 겹치므로, 여기서는 **표를 만드는 경로 자체**(model_calculate_counter_table)를 본다.
    for (const tick of LOAD_TICKS) {
      for (const [serviceTick, cvTick] of [
        [SERVICE_TICKS[0], CV_TICKS[0]],
        [Math.round(3 * SERVICE_TICKS_PER_UNIT), Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT)],
        [SERVICE_TICKS[SERVICE_TICKS.length - 1], CV_TICKS[CV_TICKS.length - 1]],
      ]) {
        const rows = model_calculate_counter_table(load_of(tick), service_of(serviceTick), variation_of(cvTick));
        const product = service_variation_rat(serviceTick, cvTick);
        for (const row of rows) {
          count += 1;
          const base = BASES.get(`${row.counterCount}:${tick}`);
          const state = { c: row.counterCount, ρ: load_of(tick), 'E[S]': service_of(serviceTick), CV: variation_of(cvTick) };
          const wantSingle = rat_mul(base.singleFactor, product);
          const wantSeparate = rat_mul(base.separateFactor, product);
          const cells = [
            [display_format_count(row.counterCount), String(row.counterCount)],
            [display_format_minutes(row.single.meanMinutes), oracle_minutes(wantSingle)],
            [display_format_minutes(row.separate.meanMinutes), oracle_minutes(wantSeparate)],
            [
              display_format_minutes(row.single.percentileMinutes),
              base.singleZero
                ? (0).toFixed(MINUTE_SMALL_DIGITS)
                : percentile_text(percentile_number(rat_mul(base.singleScale, product), base.singleLog)).text,
            ],
            [
              display_format_minutes(row.separate.percentileMinutes),
              percentile_text(percentile_number(rat_mul(base.separateScale, product), base.separateLog)).text,
            ],
            [
              display_format_ratio_cell(row),
              rat_cmp(wantSingle, ROUND_TO_ZERO_EXACT) < 0 ? MISSING_TEXT : oracle_ratio(base.ratio),
            ],
          ];
          for (let column = 0; column < cells.length; column += 1) {
            if (cells[column][0] !== cells[column][1]) {
              bad.push({ ...state, 열: column, 화면: cells[column][0], 정확: cells[column][1] });
            }
          }
        }
      }
    }
    visited.창구표 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('첫 줄(c = 1)은 두 배치가 같은 배치다 — 네 칸이 두 쌍으로 같아야 한다', () => {
    // 모델의 자기점검을 **화면에서** 다시 본다. c = 1이면 C = ρ이므로
    // 한 줄과 창구별의 평균·퍼센타일이 수학적으로 **같은 수**다. 그러니 같은 문자열이어야 한다.
    // (판정 배너도 그 화면에서 "the two layouts are the same layout"이라고 적는다.)
    const bad = [];
    let count = 0;
    for (const tick of LOAD_TICKS) {
      for (const [serviceTick, cvTick] of PAIRS) {
        count += 1;
        const row = model_calculate_result(1, load_of(tick), service_of(serviceTick), variation_of(cvTick));
        const state = { ρ: load_of(tick), 'E[S]': service_of(serviceTick), CV: variation_of(cvTick) };
        const meanOne = display_format_minutes(row.single.meanMinutes);
        const meanMany = display_format_minutes(row.separate.meanMinutes);
        if (meanOne !== meanMany) bad.push({ ...state, 칸: '평균', 한줄: meanOne, 창구별: meanMany });
        const tailOne = display_format_minutes(row.single.percentileMinutes);
        const tailMany = display_format_minutes(row.separate.percentileMinutes);
        if (tailOne !== tailMany) bad.push({ ...state, 칸: '95퍼센타일', 한줄: tailOne, 창구별: tailMany });
        const ratioText = display_format_ratio(row.meanRatio);
        if (ratioText !== `${(1).toFixed(RATIO_DIGITS)}${RATIO_SUFFIX}`) {
          bad.push({ ...state, 칸: '배수', 화면: ratioText });
        }
      }
    }
    visited.창구하나 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });
});

// ── 판정 문구 ───────────────────────────────────────────────
/**
 * 판정 문구가 **인용하는 숫자**만 본다(문장은 문구 검사의 일이고 위젯 테스트가 맡는다).
 * 문자열에서 숫자 토큰을 순서대로 뽑아 오라클이 만든 토큰 열과 맞춘다 —
 * 부분문자열로 확인하면 "2.2"가 "12.2" 안에서 통과해 버린다.
 */
const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?[%×]?/g;

describe('판정 문구가 인용하는 값', () => {
  it('배너와 뒷문장의 숫자 토큰이 오라클이 만든 열과 정확히 같다', () => {
    const bad = [];
    let count = 0;
    const pairs = [
      [SERVICE_TICKS[0], CV_TICKS[0]],
      [Math.round(3 * SERVICE_TICKS_PER_UNIT), Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT)],
      [SERVICE_TICKS[SERVICE_TICKS.length - 1], CV_TICKS[CV_TICKS.length - 1]],
      [Math.round(1.5 * SERVICE_TICKS_PER_UNIT), Math.round(1.45 * CV_TICKS_PER_UNIT)],
    ];
    for (const base of BASES.values()) {
      const c = base.counterCount;
      const load = load_of(base.loadTick);
      for (const [serviceTick, cvTick] of pairs) {
        count += 1;
        const product = service_variation_rat(serviceTick, cvTick);
        const result = model_calculate_result(c, load, service_of(serviceTick), variation_of(cvTick));
        const spoken = display_describe_verdict(result);
        const wantSingle = rat_mul(base.singleFactor, product);
        const wantSeparate = rat_mul(base.separateFactor, product);
        const singleMean = oracle_minutes(wantSingle);
        const separateMean = oracle_minutes(wantSeparate);
        const singleTail = base.singleZero
          ? (0).toFixed(MINUTE_SMALL_DIGITS)
          : percentile_text(percentile_number(rat_mul(base.singleScale, product), base.singleLog)).text;
        const separateTail = percentile_text(
          percentile_number(rat_mul(base.separateScale, product), base.separateLog),
        ).text;
        const meaningless = rat_cmp(wantSingle, ROUND_TO_ZERO_EXACT) < 0;

        // 배너: 창구 하나면 숫자가 없고, 분모가 작으면 절댓값 둘, 그 밖에는 배수 하나.
        const head = c === 1 ? [] : meaningless ? [singleMean, separateMean] : [oracle_ratio(base.ratio)];
        // 뒷문장: 창구 수 → 이용률 → 창구별 평균 → 한 줄 평균 → 95퍼센타일 → 유휴율.
        const tailTokens = base.singleZero
          ? [oracle_percent(rat_from_double(QUEUE_PERCENTILE)), separateTail]
          : [oracle_percent(rat_from_double(QUEUE_PERCENTILE)), separateTail, singleTail];
        const want = [
          ...head,
          display_format_count(c),
          oracle_percent(base.load),
          separateMean,
          singleMean,
          ...tailTokens,
          oracle_percent(base.idle),
        ];
        const got = `${spoken.headline} ${spoken.detail}`.match(NUMBER_TOKEN) ?? [];
        if (got.join('|') !== want.join('|')) {
          bad.push({ c, ρ: load, 'E[S]': service_of(serviceTick), CV: variation_of(cvTick), 화면: got, 정확: want });
        }
      }
    }
    visited.판정문구 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });
});

// ── 격자 크기 ───────────────────────────────────────────────
describe('격자가 충분히 큰가', () => {
  it('격자가 슬라이더의 네 축을 다 덮고, 합쳐 20,000 상태 이상을 봤다', () => {
    // 축마다 모든 눈금이 적어도 한 번 나와야 한다 — 표본을 줄이는 손질이 조용히
    // 들어오는 것을 막는다.
    expect(COUNTERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(LOAD_TICKS.length).toBe(86); // ρ = 0.10…0.95, 0.01 눈금 전부
    expect(new Set(PAIRS.map(([s]) => s)).size).toBe(SERVICE_TICKS.length); // E[S] 눈금 전부
    expect(new Set(PAIRS.map(([, j]) => j)).size).toBe(CV_TICKS.length); // CV 눈금 전부
    // 경계가 격자에 실제로 들어 있다.
    expect(LOAD_TICKS[0]).toBe(Math.round(QUEUE_LOAD_MIN * LOAD_TICKS_PER_UNIT));
    expect(LOAD_TICKS[LOAD_TICKS.length - 1]).toBe(Math.round(QUEUE_LOAD_MAX * LOAD_TICKS_PER_UNIT));
    expect(PAIRS).toEqual(
      expect.arrayContaining([
        [SERVICE_TICKS[0], CV_TICKS[0]],
        [SERVICE_TICKS[SERVICE_TICKS.length - 1], CV_TICKS[CV_TICKS.length - 1]],
        [SERVICE_TICKS[0], Math.round(QUEUE_CV_EXACT * CV_TICKS_PER_UNIT)],
      ]),
    );
    const total = Object.values(visited).reduce((sum, n) => sum + n, 0);
    expect(Object.keys(visited).sort()).toEqual(
      ['백분율', '창구표', '창구하나', '카드와배수', '판정문구'].sort(),
    );
    expect(total).toBeGreaterThanOrEqual(20000);
  });
});

// ── 반올림 경계 ─────────────────────────────────────────────
/**
 * 경계 상태를 **조건으로** 찾는다. 격자를 일정 간격으로 훑으면 경계는 대부분 빠진다 —
 * 경계는 값의 분모가 2와 5로만 이루어지고 마지막 자리가 정확히 5가 되는 드문 자리에만 있다.
 *
 * 평균 대기 = (계수) × s·(400+j²)/1600 이고 계수는 (c, ρ)로만 정해진다. 그래서
 * (c, ρ)마다 계수를 한 번 약분해 두고, 분모의 **2·5를 뺀 나머지**가 s·(400+j²)의
 * 최댓값보다 크면 그 (c, ρ)는 경계를 만들 수 없다 — 통째로 건너뛴다. 이 걸름이 없으면
 * 495,360 상태를 다 돌아야 한다.
 */
const MINUTE_BOUNDARY_STATES = (() => {
  const odd_part = (value) => {
    let x = value;
    while (x % 2n === 0n) x /= 2n;
    while (x % 5n === 0n) x /= 5n;
    return x;
  };
  const productLimit = BigInt(
    SERVICE_TICKS[SERVICE_TICKS.length - 1] *
      (400 + CV_TICKS[CV_TICKS.length - 1] * CV_TICKS[CV_TICKS.length - 1]),
  );
  const out = [];
  for (const base of BASES.values()) {
    for (const [layout, factor] of [
      ['한 줄', base.singleFactor],
      ['창구별', base.separateFactor],
    ]) {
      const step = rat_div(factor, rat(2 * CV_TICKS_PER_UNIT * CV_TICKS_PER_UNIT * 2, 1));
      if (odd_part(step.d) > productLimit) continue; // 이 (c, ρ)에는 경계가 없다
      for (const serviceTick of SERVICE_TICKS) {
        for (const cvTick of CV_TICKS) {
          const value = rat(step.n * BigInt(serviceTick * (400 + cvTick * cvTick)), step.d);
          if (!is_minute_boundary(value)) continue;
          out.push({ layout, base, serviceTick, cvTick, value });
        }
      }
    }
  }
  return out;
})();

/** 배수의 경계. 배수는 (c, ρ)로만 정해지므로 688개만 본다. */
const RATIO_BOUNDARY_STATES = [...BASES.values()].filter((base) => is_ratio_boundary(base.ratio));

describe('반올림 경계 (표시값이 정확히 …5가 되는 상태)', () => {
  it('경계 상태가 실제로 존재한다 — 0건이면 경계를 찾는 조건이 틀린 것이다', () => {
    expect(MINUTE_BOUNDARY_STATES.length).toBeGreaterThan(0);
    expect(RATIO_BOUNDARY_STATES.length).toBeGreaterThan(0);
    // 조건이 맞는지 손으로 구성한 값으로 확인한다.
    expect(is_minute_boundary(rat(875, 1000))).toBe(true); // 0.875 → 두 자리 표시의 경계
    expect(is_minute_boundary(rat(88, 100))).toBe(false);
    expect(is_ratio_boundary(rat(225, 100))).toBe(true); // 2.25 → 한 자리 표시의 경계
    expect(is_ratio_boundary(rat(23, 10))).toBe(false);
    // 경계 목록이 두 배치 모두에서 나온다.
    expect(new Set(MINUTE_BOUNDARY_STATES.map((s) => s.layout))).toEqual(new Set(['한 줄', '창구별']));
  });

  it('경계에 놓인 평균 대기 분을 전부 올려 찍는다', () => {
    const bad = [];
    for (const state of MINUTE_BOUNDARY_STATES) {
      const result = model_calculate_result(
        state.base.counterCount,
        load_of(state.base.loadTick),
        service_of(state.serviceTick),
        variation_of(state.cvTick),
      );
      const got = display_format_minutes(
        state.layout === '한 줄' ? result.single.meanMinutes : result.separate.meanMinutes,
      );
      const want = oracle_minutes(state.value);
      if (got !== want) {
        bad.push({
          배치: state.layout,
          c: state.base.counterCount,
          ρ: load_of(state.base.loadTick),
          'E[S]': service_of(state.serviceTick),
          CV: variation_of(state.cvTick),
          화면: got,
          정확: want,
          정확값: rat_to_number(state.value),
        });
      }
    }
    expect({ 경계상태: MINUTE_BOUNDARY_STATES.length, ...summarize(bad) }).toEqual({
      경계상태: MINUTE_BOUNDARY_STATES.length,
      ...CLEAN,
    });
  });

  it('경계에 놓인 배수를 전부 올려 찍는다 — E[S]·CV를 어디에 두어도', () => {
    const bad = [];
    for (const base of RATIO_BOUNDARY_STATES) {
      const want = oracle_ratio(base.ratio);
      const tally = new Map();
      for (const [serviceTick, cvTick] of PAIRS) {
        const got = display_format_ratio(
          model_calculate_result(
            base.counterCount,
            load_of(base.loadTick),
            service_of(serviceTick),
            variation_of(cvTick),
          ).meanRatio,
        );
        tally.set(got, (tally.get(got) ?? 0) + 1);
      }
      const wrong = [...tally.entries()].filter(([text]) => text !== want);
      if (wrong.length > 0) {
        bad.push({
          c: base.counterCount,
          ρ: load_of(base.loadTick),
          정확: want,
          정확값: rat_to_number(base.ratio),
          어긋난표시: wrong.map(([text, n]) => `${text}: ${n}/${PAIRS.length} 상태`),
        });
      }
    }
    expect({ 경계상태: RATIO_BOUNDARY_STATES.length, ...summarize(bad) }).toEqual({
      경계상태: RATIO_BOUNDARY_STATES.length,
      ...CLEAN,
    });
  });
});
