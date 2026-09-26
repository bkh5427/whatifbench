/**
 * 태양계 통신 지연 — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 한 종류다: **표시 단계가 값을 바꾼다.**
 * 모델이 옳은 초(秒)를 내도 카드에 틀린 글자가 찍히면 독자가 읽는 것은 그 글자다.
 *
 * 전례(2026-09-26). 감사에서 화면 문자열을 독립으로 다시 계산하는 테스트가 없다는
 * 것이 드러났고, 그 사이로 경계 사고 하나가 빠져나가 있었다:
 *   · 3597 s ≤ t < 3600 s 가 "60.0 min"으로 찍혔다. `display_format_duration`이
 *     단위를 **반올림 전** 값(t < 3600)으로 골랐기 때문이다. 59.995분은 분 단위로
 *     반올림하면 60.0이 되어 "시·분"의 몫인데, 분 칸에 그대로 남았다.
 *   · 재현 좌표: 화성 θ = 52°, 3턴 → 대화 전체 ≈ 3599.71 s. 지금은 "1 h 0 min"이다.
 * 같은 모양의 사고가 초 → 분 경계(59.95 s ≤ t < 60 s → "60.0 s")에도 있을 수 있다.
 *
 * 검사 방식:
 *   ⓐ 오라클은 위젯·모델의 **어떤 계산·표시 함수도 부르지 않는다.** 감사관의 Python
 *      오라클(Decimal 60자리)을 옮겼다: 코사인법칙, c = 299792458 m/s(정의값),
 *      au = 149597870700 m(IAU 2012 B2), JPL "Approximate Positions of the Major
 *      Planets" 표 1의 a·e. 이 값들은 **여기에 따로 적는다** — model.js를 import하면
 *      상수 오타가 양쪽에 똑같이 들어가 검사가 아니게 된다.
 *   ⓑ 연산은 BigInt 고정소수(10⁻⁶⁰)다. cos은 테일러 급수, √는 정수 뉴턴법.
 *      반올림은 정수 나눗셈 한 번(0.5는 올림)이라 부동소수를 거치지 않는다.
 *   ⓒ 단위는 **반올림한 뒤** 고른다: 초 한 자리로 반올림해 60.0 미만이면 초,
 *      분 한 자리로 반올림해 60.0 미만이면 분, 아니면 정수 분으로 반올림해 시·분.
 *      (시·분은 "전체 분을 반올림 → 60으로 나눈 몫과 나머지"로 낸다. 위젯의
 *      "시를 내림 → 나머지 분을 반올림 → 60이면 올림"과 **다른 경로**다.)
 *   ⓓ 격자 범위(θ·턴 수·눈금)와 판정 문턱은 model.js에서 import한다 — 위젯이 범위를
 *      바꾸면 이 파일도 따라간다. 표기 자리수(초·분 1자리, au 4자리, 표 au 3자리,
 *      백만 km 1자리, 배수 2자리)는 **이 파일의 명세**다. 위젯이 바꾸면 걸리는 것이 맞다.
 *   ⓔ 화면은 실제로 마운트해서 읽는다(`_shared/dom-stub.js`). 슬라이더 값을 바꾸고
 *      change 이벤트를 발화시켜, 사용자가 만드는 것과 같은 경로로 갱신한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  BODIES,
  THETA_MIN_DEG,
  THETA_MAX_DEG,
  THETA_STEP_DEG,
  TURNS_MIN,
  TURNS_MAX,
  TURNS_STEP,
  SWING_EDGE_MIN,
  SWING_BREAK_MIN,
  model_calculate_result,
} from './model.js';
import { PRESETS, display_format_duration, widget_mount } from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 고정소수 ─────────────────────────────────────────────────
/** 고정소수 자리수. 감사 오라클(Decimal 60자리)과 같은 정밀도. */
const FIXED_DIGITS = 60;
const FIXED_ONE = 10n ** BigInt(FIXED_DIGITS);
/** π 76자리. 급수 오차보다 한참 아래에 둔다. */
const REFERENCE_PI_TEXT =
  '3.1415926535897932384626433832795028841971693993751058209749445923078164062862';
const DEGREES_PER_HALF_TURN = 180n;

/** 십진 문자열 → 고정소수 BigInt. **정확하다** (문자열 그대로 자리만 옮긴다). */
function frac_read_decimal(text) {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [whole, part = ''] = body.split('.');
  if (part.length > FIXED_DIGITS) throw new Error(`자리수가 너무 많다: ${text}`);
  const value = BigInt(whole) * FIXED_ONE + BigInt((part + '0'.repeat(FIXED_DIGITS)).slice(0, FIXED_DIGITS));
  return negative ? -value : value;
}

/**
 * double → 고정소수. double은 이진 유리수라 m·2^k로 **정확히** 옮긴다(10⁻⁶⁰ 아래는 버린다).
 * 60자리면 [1, 10⁶) 범위의 double 전개(소수 이진 52자리 이하)가 전부 들어간다.
 */
function frac_read_double(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('0 이상의 유한한 값이 아니다');
  let scaled = value;
  let denominator = 1n;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    denominator *= 2n;
  }
  return (BigInt(scaled) * FIXED_ONE) / denominator;
}

/** 정수 뉴턴법 √. 입력이 FIXED_ONE² 배율이면 출력은 FIXED_ONE 배율이다. */
function frac_calculate_sqrt(square) {
  if (square <= 0n) return 0n;
  let guess = BigInt(`1${'0'.repeat(Math.ceil(square.toString().length / 2))}`);
  for (;;) {
    const next = (guess + square / guess) / 2n;
    if (next >= guess) return guess;
    guess = next;
  }
}

/** 정수 나눗셈 + 반올림(0.5는 올림). `toFixed`의 명세("둘이 같으면 큰 n")와 같은 규칙. */
function frac_round_ratio(numerator, denominator, digits) {
  return (2n * numerator * 10n ** BigInt(digits) + denominator) / (2n * denominator);
}

/** 고정소수 값 ÷ divisor를 소수 digits자리로 반올림한 정수(= 값×10^digits). */
function frac_round_fixed(value, digits, divisor = 1n) {
  return frac_round_ratio(value, FIXED_ONE * divisor, digits);
}

/** 정수 q(= 값×10^digits)를 문자열로. grouped면 정수부에 천 단위 쉼표(en-US). */
function frac_format_scaled(scaled, digits, grouped = false) {
  let body = scaled.toString();
  if (digits > 0) body = body.padStart(digits + 1, '0');
  let whole = digits > 0 ? body.slice(0, body.length - digits) : body;
  const part = digits > 0 ? body.slice(body.length - digits) : '';
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return digits > 0 ? `${whole}.${part}` : whole;
}

// ── 오라클 상수 (모델과 따로 적는다) ─────────────────────────
/** 진공 중 빛의 속도, m/s. SI 정의값. */
const REFERENCE_SPEED_OF_LIGHT_MS = 299792458n;
/** 천문단위, m. IAU 2012 결의 B2. */
const REFERENCE_AU_METRES = 149597870700n;
const REFERENCE_METRES_PER_MILLION_KM = 1000n * 1000000n;
/** JPL 표 1, 지구–달 질량중심. */
const REFERENCE_EARTH_A_AU = frac_read_decimal('1.00000261');
const REFERENCE_EARTH_E = frac_read_decimal('0.01671123');
/** JPL 표 1의 a(au)·e. 태양은 a = 0(원 위의 반지름 0인 점). */
const REFERENCE_ORBITS = {
  sun: { a: '0', e: '0' },
  mercury: { a: '0.38709927', e: '0.20563593' },
  venus: { a: '0.72333566', e: '0.00677672' },
  mars: { a: '1.52371034', e: '0.09339410' },
  jupiter: { a: '5.20288700', e: '0.04838624' },
  saturn: { a: '9.53667594', e: '0.05386179' },
  uranus: { a: '19.18916464', e: '0.04725744' },
  neptune: { a: '30.06992276', e: '0.00859048' },
};

// ── 오라클 표기 명세 ─────────────────────────────────────────
const REFERENCE_SECONDS_PER_MINUTE = 60n;
const REFERENCE_MINUTES_PER_HOUR = 60n;
const REFERENCE_SECOND_DIGITS = 1;
const REFERENCE_MINUTE_DIGITS = 1;
const REFERENCE_AU_DIGITS = 4;
const REFERENCE_TABLE_AU_DIGITS = 3;
const REFERENCE_MILLION_KM_DIGITS = 1;
const REFERENCE_SWING_DIGITS = 2;
/** 초 칸을 떠나는 문턱(반올림 뒤 값, 0.1초 단위) = 60.0 s. */
const REFERENCE_SECOND_CEILING_TENTHS = REFERENCE_SECONDS_PER_MINUTE * 10n ** BigInt(REFERENCE_SECOND_DIGITS);
/** 분 칸을 떠나는 문턱(반올림 뒤 값, 0.1분 단위) = 60.0 min. */
const REFERENCE_MINUTE_CEILING_TENTHS = REFERENCE_MINUTES_PER_HOUR * 10n ** BigInt(REFERENCE_MINUTE_DIGITS);
const REFERENCE_NAME_ONE_WAY = 'one way';
const REFERENCE_NAME_ROUND_TRIP = 'there and back';
/** 경계 문자열. 어느 칸에도 나오면 안 된다 — 전부 윗단위의 몫이다. */
const FORBIDDEN_PATTERNS = [/(^|[^0-9.])60\.0 s/, /(^|[^0-9.])60\.0 min/, /(^|[^0-9])60 min/, /(^|[^0-9])0 h /];

/** 턴 표본에 **언제나** 넣는 경계 여유(초). 대화 전체가 단위 문턱 이만큼 안에 들면 그 턴을 넣는다. */
const TURN_BOUNDARY_MARGIN_S = 30n;

// ── 오라클 계산 ──────────────────────────────────────────────

/** 고정소수 자리수에서 자른다(버림). 오차 10⁻⁶⁰ — θ ≤ 180이라 x의 오차도 그 수준이다. */
const REFERENCE_PI = frac_read_decimal(REFERENCE_PI_TEXT.slice(0, REFERENCE_PI_TEXT.indexOf('.') + 1 + FIXED_DIGITS));

/** cos(θ°), 테일러 급수. θ ≤ 180°이므로 x ≤ π에서 항이 10⁻⁶⁰ 밑으로 떨어질 때까지 더한다. */
function reference_calculate_cos(thetaDegrees) {
  const x = (BigInt(thetaDegrees) * REFERENCE_PI) / DEGREES_PER_HALF_TURN;
  const xSquared = (x * x) / FIXED_ONE;
  let term = FIXED_ONE;
  let sum = FIXED_ONE;
  for (let n = 2n; term !== 0n; n += 2n) {
    term = -(term * xSquared) / FIXED_ONE / (n * (n - 1n));
    sum += term;
  }
  return sum;
}

/** 코사인법칙의 현. d² = a² + a_E² − 2·a·a_E·cosθ (FIXED_ONE² 배율에서 √). */
function reference_calculate_distance_au(semiMajorAxis, thetaDegrees) {
  const cosine = reference_calculate_cos(thetaDegrees);
  const square =
    semiMajorAxis * semiMajorAxis +
    REFERENCE_EARTH_A_AU * REFERENCE_EARTH_A_AU -
    (2n * semiMajorAxis * REFERENCE_EARTH_A_AU * cosine) / FIXED_ONE;
  return frac_calculate_sqrt(square);
}

/** au → 편도 초. t = d·au/c. */
function reference_calculate_seconds(distanceAu) {
  return (distanceAu * REFERENCE_AU_METRES) / REFERENCE_SPEED_OF_LIGHT_MS;
}

/** 지연 표기 사다리. 단위는 **반올림한 뒤** 고른다 (머리말 ⓒ). */
function reference_format_duration(seconds) {
  const secondTenths = frac_round_fixed(seconds, REFERENCE_SECOND_DIGITS);
  if (secondTenths < REFERENCE_SECOND_CEILING_TENTHS) {
    return `${frac_format_scaled(secondTenths, REFERENCE_SECOND_DIGITS)} s`;
  }
  const minuteTenths = frac_round_fixed(seconds, REFERENCE_MINUTE_DIGITS, REFERENCE_SECONDS_PER_MINUTE);
  if (minuteTenths < REFERENCE_MINUTE_CEILING_TENTHS) {
    return `${frac_format_scaled(minuteTenths, REFERENCE_MINUTE_DIGITS)} min`;
  }
  const wholeMinutes = frac_round_fixed(seconds, 0, REFERENCE_SECONDS_PER_MINUTE);
  return `${wholeMinutes / REFERENCE_MINUTES_PER_HOUR} h ${wholeMinutes % REFERENCE_MINUTES_PER_HOUR} min`;
}

const reference_format_seconds = (seconds) =>
  `${frac_format_scaled(frac_round_fixed(seconds, REFERENCE_SECOND_DIGITS), REFERENCE_SECOND_DIGITS, true)} s`;
const reference_format_au = (au) =>
  `${frac_format_scaled(frac_round_fixed(au, REFERENCE_AU_DIGITS), REFERENCE_AU_DIGITS)} au`;
const reference_format_table_au = (au) =>
  frac_format_scaled(frac_round_fixed(au, REFERENCE_TABLE_AU_DIGITS), REFERENCE_TABLE_AU_DIGITS);
const reference_format_million_km = (au) =>
  `${frac_format_scaled(
    frac_round_fixed(au * REFERENCE_AU_METRES, REFERENCE_MILLION_KM_DIGITS, REFERENCE_METRES_PER_MILLION_KM),
    REFERENCE_MILLION_KM_DIGITS,
    true,
  )} million km`;
/** 흔들림 배수 = 최원/최근접. 둘 다 정확한 8자리 십진수라 비도 정확한 유리수다. */
const reference_format_swing = (farthest, closest) =>
  `${frac_format_scaled(frac_round_ratio(farthest, closest, REFERENCE_SWING_DIGITS), REFERENCE_SWING_DIGITS)}×`;
const reference_format_turns = (turns) => `${turns} ${turns === 1 ? 'turn' : 'turns'}`;

/** 판정. 문턱은 model.js의 편집 판단을 import하되, 비교는 정확한 유리수로 한다. */
function reference_calculate_verdict(farthest, closest) {
  const edge = frac_read_double(SWING_EDGE_MIN);
  const breaking = frac_read_double(SWING_BREAK_MIN);
  // farthest/closest ≥ 문턱  ⇔  farthest·ONE ≥ 문턱·closest
  if (farthest * FIXED_ONE < edge * closest) return 'hold';
  if (farthest * FIXED_ONE >= breaking * closest) return 'break';
  return 'edge';
}

/** 천체 하나에서 θ·턴과 무관한 값들. */
function reference_build_body(body) {
  const orbit = REFERENCE_ORBITS[body.key];
  const a = frac_read_decimal(orbit.a);
  const e = frac_read_decimal(orbit.e);
  const closestAu = a > REFERENCE_EARTH_A_AU ? a - REFERENCE_EARTH_A_AU : REFERENCE_EARTH_A_AU - a;
  const farthestAu = a + REFERENCE_EARTH_A_AU;
  const closestSeconds = reference_calculate_seconds(closestAu);
  const farthestSeconds = reference_calculate_seconds(farthestAu);
  const swingText = reference_format_swing(farthestAu, closestAu);
  const moving = farthestAu !== closestAu;

  // 타원 대조(표 아래 한 줄). 바깥 궤도의 근일점 − 안쪽 궤도의 원일점, 둘 다 원일점의 합.
  const shrink = (value, ecc) => (value * (FIXED_ONE - ecc)) / FIXED_ONE;
  const stretch = (value, ecc) => (value * (FIXED_ONE + ecc)) / FIXED_ONE;
  const outside = a > REFERENCE_EARTH_A_AU;
  const outerPerihelion = outside ? shrink(a, e) : shrink(REFERENCE_EARTH_A_AU, REFERENCE_EARTH_E);
  const innerAphelion = outside ? stretch(REFERENCE_EARTH_A_AU, REFERENCE_EARTH_E) : stretch(a, e);
  const ellipticClosest = outerPerihelion > innerAphelion ? outerPerihelion - innerAphelion : 0n;
  const ellipticFarthest = stretch(a, e) + stretch(REFERENCE_EARTH_A_AU, REFERENCE_EARTH_E);

  const closestText = reference_format_duration(closestSeconds);
  const farthestText = reference_format_duration(farthestSeconds);
  return {
    key: body.key,
    name: body.name,
    label: body.label,
    a,
    moving,
    verdict: reference_calculate_verdict(farthestAu, closestAu),
    closestText,
    farthestText,
    swingText,
    tableRow: [
      body.label,
      reference_format_table_au(closestAu),
      closestText,
      reference_format_table_au(farthestAu),
      farthestText,
      reference_format_duration(2n * farthestSeconds),
      swingText,
    ].join(''),
    band: moving
      ? `The model puts the one-way delay to ${body.name} anywhere between ${closestText} and ${farthestText} — ` +
        `${swingText} apart, decided by nothing but where the two are standing.`
      : `The model gives ${body.name} the same ${closestText} at every angle, because the distance it uses is ` +
        `Earth's own orbital radius and θ cannot change it.`,
    ellipticNote:
      `Everything above treats the orbits as circles. Feeding the same source's eccentricities into the two ` +
      `extreme line-ups instead puts ${body.name} between ` +
      `${reference_format_duration(reference_calculate_seconds(ellipticClosest))} and ` +
      `${reference_format_duration(reference_calculate_seconds(ellipticFarthest))} one way, against ` +
      `${closestText} and ${farthestText} here. The circular figures are the ones this page uses.`,
  };
}

// ── 격자 ─────────────────────────────────────────────────────

function fixture_build_range(min, max, step) {
  const out = [];
  for (let value = min; value <= max; value += step) out.push(value);
  return out;
}

const THETA_VALUES = fixture_build_range(THETA_MIN_DEG, THETA_MAX_DEG, THETA_STEP_DEG);
const TURN_VALUES = fixture_build_range(TURNS_MIN, TURNS_MAX, TURNS_STEP);
const REFERENCE_BODIES = BODIES.map(reference_build_body);
/** 천체 여덟(태양 포함) 모두의 표 줄. θ·턴과 무관하므로 한 번만 만든다. */
const REFERENCE_TABLE_ROWS = REFERENCE_BODIES.map((body) => body.tableRow);
const REFERENCE_BARS_LABEL_TAIL = `${REFERENCE_BODIES.map(
  (body) => `${body.label} ${body.closestText} to ${body.farthestText}`,
).join('; ')}.`;

/** (천체, θ)마다 편도 초. 턴·토글과 무관하다. */
const REFERENCE_ONE_WAY = new Map();
for (const body of REFERENCE_BODIES) {
  for (const theta of THETA_VALUES) {
    const distanceAu = reference_calculate_distance_au(body.a, theta);
    REFERENCE_ONE_WAY.set(`${body.key}:${theta}`, { distanceAu, seconds: reference_calculate_seconds(distanceAu) });
  }
}

/** 단위 문턱(60 s, 3600 s)에서 margin 안에 드는가. */
function reference_check_near_unit_edge(seconds) {
  const edges = [REFERENCE_SECONDS_PER_MINUTE, REFERENCE_SECONDS_PER_MINUTE * REFERENCE_MINUTES_PER_HOUR];
  return edges.some((edge) => {
    const gap = seconds - edge * FIXED_ONE;
    return (gap < 0n ? -gap : gap) <= TURN_BOUNDARY_MARGIN_S * FIXED_ONE;
  });
}

/**
 * 턴 표본. 8 × 181 × 2 × 20 = 57,920 상태를 전부 마운트 갱신하면 10초를 넘는다.
 * 그래서 턴은 고른다 — 그러나 **경계는 언제나 넣는다**:
 *   · 범위 양 끝(TURNS_MIN, +1, 기본값 근처 가운데, −1, TURNS_MAX)
 *   · 이 (천체, θ)에서 대화 전체가 60 s·3600 s 문턱 ±30 s 안에 드는 모든 턴
 *     (화성 52° 3턴 = 3599.71 s가 여기 걸린다)
 */
const TURN_FIXED_SAMPLE = [
  TURN_VALUES[0],
  TURN_VALUES[1],
  TURN_VALUES[Math.floor(TURN_VALUES.length / 2)],
  TURN_VALUES[TURN_VALUES.length - 2],
  TURN_VALUES[TURN_VALUES.length - 1],
].filter((value, index, all) => value !== undefined && all.indexOf(value) === index);

function fixture_pick_turns(oneWaySeconds) {
  const picked = new Set(TURN_FIXED_SAMPLE);
  for (const turns of TURN_VALUES) {
    if (reference_check_near_unit_edge(2n * oneWaySeconds * BigInt(turns))) picked.add(turns);
  }
  return [...picked].sort((left, right) => left - right);
}

/** 한 상태에서 화면에 있어야 하는 문자열 전부. */
function reference_describe_state(body, theta, roundTrip, turns) {
  const { distanceAu, seconds } = REFERENCE_ONE_WAY.get(`${body.key}:${theta}`);
  const roundTripSeconds = 2n * seconds;
  const conversationSeconds = roundTripSeconds * BigInt(turns);
  const shownSeconds = roundTrip ? roundTripSeconds : seconds;
  const otherSeconds = roundTrip ? seconds : roundTripSeconds;
  const legName = roundTrip ? REFERENCE_NAME_ROUND_TRIP : REFERENCE_NAME_ONE_WAY;
  const otherName = roundTrip ? REFERENCE_NAME_ONE_WAY : REFERENCE_NAME_ROUND_TRIP;
  const oneWayText = reference_format_duration(seconds);
  const roundTripText = reference_format_duration(roundTripSeconds);
  const conversationText = reference_format_duration(conversationSeconds);
  const turnsText = reference_format_turns(turns);
  return {
    conversationSeconds,
    shown: {
      delayLabel: `Signal delay, ${legName}`,
      delayValue: reference_format_duration(shownSeconds),
      delayUnit: `${reference_format_seconds(shownSeconds)} · ${reference_format_duration(otherSeconds)} ${otherName}`,
      distanceValue: reference_format_au(distanceAu),
      distanceUnit: reference_format_million_km(distanceAu),
      conversationLabel: `${turnsText} of conversation`,
      conversationValue: conversationText,
      conversationUnit: `${turns} × ${roundTripText} ${REFERENCE_NAME_ROUND_TRIP}`,
      swingValue: body.swingText,
      swingUnit: `${body.closestText} → ${body.farthestText} ${REFERENCE_NAME_ONE_WAY}`,
      verdictState: body.verdict,
      verdictDetail:
        `${body.band} At θ = ${theta}° it reads ${oneWayText} ${REFERENCE_NAME_ONE_WAY}, ` +
        `${roundTripText} ${REFERENCE_NAME_ROUND_TRIP}, and ${conversationText} for ${turnsText} of a conversation.`,
      thetaOutput: `${theta}°`,
      turnsOutput: turnsText,
      thetaValueText: `${theta}°, one way ${oneWayText}`,
      turnsValueText: `${turnsText}, ${conversationText} in total`,
      tableRows: REFERENCE_TABLE_ROWS.join('\n'),
      ellipticNote: body.ellipticNote,
      barsLabelTail: REFERENCE_BARS_LABEL_TAIL,
    },
  };
}

// ── 화면 읽기 ────────────────────────────────────────────────

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

/** URL 쿼리로 상태를 싣고 마운트한다. 위젯의 초기 상태 경로 그대로다. */
function fixture_mount_widget(bodyKey, theta, roundTrip, turns) {
  if (openDom) openDom.restore();
  const search = `?body=${bodyKey}&theta=${theta}&rt=${roundTrip ? 1 : 0}&turns=${turns}`;
  const dom = fixture_create_dom({ search });
  openDom = dom;
  dom.install();
  widget_mount(dom.root);
  const root = dom.root;
  const verdict = root.querySelector('.verdict');
  const canvases = root.querySelectorAll('canvas');
  return {
    dom,
    root,
    inputs: root.querySelectorAll('input'),
    outputs: root.querySelectorAll('output'),
    labels: root.querySelectorAll('.readout-label'),
    values: root.querySelectorAll('.readout-value'),
    units: root.querySelectorAll('.readout-unit'),
    verdict,
    verdictDetail: verdict.children[verdict.children.length - 1],
    tbody: root.querySelector('tbody'),
    notes: root.querySelectorAll('.legend-note'),
    barsCanvas: canvases[canvases.length - 1],
  };
}

/** 슬라이더를 옮기고 change를 발화시킨다 — 사용자가 손을 뗄 때와 같은 경로. */
function fixture_update_sliders(mounted, theta, turns) {
  const [thetaInput, , , turnsInput] = mounted.inputs;
  thetaInput.value = String(theta);
  turnsInput.value = String(turns);
  mounted.dom.listeners_run_event(thetaInput, 'change');
}

/** 지금 화면의 문자열을 오라클과 같은 모양으로 읽는다. */
function fixture_read_shown(mounted) {
  const [thetaInput, , , turnsInput] = mounted.inputs;
  const barsLabel = mounted.barsCanvas.getAttribute('aria-label') ?? '';
  const barsTailStart = barsLabel.indexOf('. ') + 2;
  return {
    delayLabel: mounted.labels[0].textContent,
    delayValue: mounted.values[0].textContent,
    delayUnit: mounted.units[0].textContent,
    distanceValue: mounted.values[1].textContent,
    distanceUnit: mounted.units[1].textContent,
    conversationLabel: mounted.labels[2].textContent,
    conversationValue: mounted.values[2].textContent,
    conversationUnit: mounted.units[2].textContent,
    swingValue: mounted.values[3].textContent,
    swingUnit: mounted.units[3].textContent,
    verdictState: mounted.verdict.dataset.state,
    verdictDetail: mounted.verdictDetail.textContent,
    thetaOutput: mounted.outputs[0].textContent,
    turnsOutput: mounted.outputs[1].textContent,
    thetaValueText: thetaInput.getAttribute('aria-valuetext'),
    turnsValueText: turnsInput.getAttribute('aria-valuetext'),
    tableRows: mounted.tbody.children.map((row) => row.textContent).join('\n'),
    ellipticNote: mounted.notes[mounted.notes.length - 1].textContent,
    barsLabelTail: barsLabel.slice(barsTailStart),
  };
}

/** 트리의 모든 글자와 속성 값. "60.0 min"이 **어디에도** 없는지 볼 때 쓴다. */
function fixture_read_all_text(root) {
  const out = [root.textContent];
  const stack = [root];
  while (stack.length > 0) {
    const element = stack.pop();
    if (element.attributes) for (const value of element.attributes.values()) out.push(value);
    for (const child of element.children ?? []) stack.push(child);
  }
  return out;
}

const fixture_scan_forbidden = (texts) =>
  texts.filter((text) => FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text)));

/** 한 상태를 대조해 어긋난 칸을 모은다. 반환: 비교한 칸 수. */
function test_compare_state(mounted, body, theta, roundTrip, turns, mismatches, forbidden) {
  const expected = reference_describe_state(body, theta, roundTrip, turns).shown;
  const shown = fixture_read_shown(mounted);
  const state = `${body.key} θ=${theta} rt=${roundTrip ? 1 : 0} n=${turns}`;
  let compared = 0;
  for (const field of Object.keys(expected)) {
    compared += 1;
    if (shown[field] !== expected[field]) {
      mismatches.push({ state, field, expected: expected[field], shown: shown[field] });
    }
  }
  for (const text of fixture_scan_forbidden(Object.values(shown))) forbidden.push({ state, text });
  return compared;
}

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it('BigInt cos·√가 알려진 값을 낸다', () => {
    expect(reference_calculate_cos(0)).toBe(FIXED_ONE);
    // cos 60° = 1/2, cos 90° = 0, cos 180° = −1 — 10⁻⁵⁵ 안에서
    const tolerance = 10n ** BigInt(FIXED_DIGITS - 55);
    const near = (value, target) => (value > target ? value - target : target - value) < tolerance;
    expect(near(reference_calculate_cos(60), FIXED_ONE / 2n)).toBe(true);
    expect(near(reference_calculate_cos(90), 0n)).toBe(true);
    expect(near(reference_calculate_cos(180), -FIXED_ONE)).toBe(true);
    expect(frac_calculate_sqrt(4n * FIXED_ONE * FIXED_ONE)).toBe(2n * FIXED_ONE);
  });

  it('au 1개의 빛 시간은 499.00478… s (정의값 두 개의 비)', () => {
    expect(reference_format_seconds(reference_calculate_seconds(FIXED_ONE))).toBe('499.0 s');
    expect(frac_format_scaled(frac_round_fixed(reference_calculate_seconds(FIXED_ONE), 5), 5)).toBe('499.00478');
  });

  it('표기 사다리: 단위는 반올림한 뒤 고른다', () => {
    const cases = [
      ['59.94', '59.9 s'],
      ['59.95', '1.0 min'],
      ['59.96', '1.0 min'],
      ['3596.99', '59.9 min'],
      ['3597', '1 h 0 min'],
      ['3599.71', '1 h 0 min'],
      ['3600', '1 h 0 min'],
      ['7169.99', '1 h 59 min'],
      ['7170', '2 h 0 min'],
    ];
    for (const [text, want] of cases) expect(reference_format_duration(frac_read_decimal(text))).toBe(want);
  });

  it('JPL 표의 천체가 model.js의 천체 목록과 같은 여덟이다 (격자가 누구도 빠뜨리지 않는다)', () => {
    expect(BODIES.map((body) => body.key).sort()).toEqual(Object.keys(REFERENCE_ORBITS).sort());
    expect(BODIES.length).toBe(8);
  });
});

// ── 명시적 회귀 ──────────────────────────────────────────────

describe('회귀: 3597–3600 s가 "60.0 min"으로 찍히던 사고', () => {
  it('display_format_duration(3599.71) === "1 h 0 min" (오라클과 같은 답)', () => {
    expect(reference_format_duration(frac_read_double(3599.71))).toBe('1 h 0 min');
    expect(display_format_duration(3599.71)).toBe('1 h 0 min');
  });

  it('화성 θ = 52°, 3턴: 대화 전체가 정말 경계(3597–3600 s)에 있고, 화면 어디에도 "60.0 min"이 없다', () => {
    const mars = REFERENCE_BODIES.find((body) => body.key === 'mars');
    const reference = reference_describe_state(mars, 52, true, 3);
    // 이 좌표가 여전히 경계 상태인지부터 못박는다 — 아니면 아래 단언이 아무것도 안 지킨다.
    expect(reference.conversationSeconds >= 3597n * FIXED_ONE).toBe(true);
    expect(reference.conversationSeconds < 3600n * FIXED_ONE).toBe(true);
    expect(frac_format_scaled(frac_round_fixed(reference.conversationSeconds, 2), 2)).toBe('3599.71');
    expect(reference.shown.conversationValue).toBe('1 h 0 min');

    for (const roundTrip of [true, false]) {
      const mounted = fixture_mount_widget('mars', 52, roundTrip, 3);
      const everything = fixture_read_all_text(mounted.root);
      expect(everything.filter((text) => text.includes('60.0 min'))).toEqual([]);
      expect(fixture_scan_forbidden(everything)).toEqual([]);
      expect(mounted.values[2].textContent).toBe('1 h 0 min');
      expect(mounted.inputs[3].getAttribute('aria-valuetext')).toBe('3 turns, 1 h 0 min in total');
      expect(mounted.verdictDetail.textContent).toContain('and 1 h 0 min for 3 turns of a conversation.');
    }
  });
});

// ── 표기 사다리: 위젯 함수 대 오라클 ─────────────────────────

describe('표기 사다리 — 단위 문턱 근처를 촘촘히', () => {
  /**
   * 입력은 double이고 오라클은 그 double의 **정확한 값**을 받는다.
   * 0.01 s 간격에 0.0003 s를 얹어 반올림 동점(…5)을 피한다: 화면의 값은 코사인·√를
   * 거친 무리수라 동점에 얹히지 않고, 아래 격자 it이 화면 전체에서 어긋남 0을 확인한다.
   *
   * 알려진 잠복 결함(2026-09-26, 화면에서는 도달 불가라 여기서 단언하지 않는다):
   * 위젯은 분을 `(seconds / 60).toFixed(1)`로 찍는데, 나눗셈이 부동소수라 **정확히 …5인
   * 분**이 한 칸 내림될 수 있다. 예) 69 s = 정확히 1.15 min → 위젯 "1.1 min", 정확은
   * "1.2 min". 몬티홀·심슨에서 고친 것과 같은 모양이다. 슬라이더가 만드는 값이 정수 초에
   * 얹히는 일은 없어서 지금 화면에는 나오지 않는다.
   */
  const LADDER_STEP_S = 0.01;
  const LADDER_OFFSET_S = 0.0003;
  const LADDER_WINDOWS = [
    [0, 1],
    [59, 61],
    [3590, 3610],
    [7170, 7230],
    [35990, 36010],
  ];

  it('모든 문턱 창에서 display_format_duration이 오라클과 같다', () => {
    const mismatches = [];
    let compared = 0;
    for (const [low, high] of LADDER_WINDOWS) {
      const count = Math.round((high - low) / LADDER_STEP_S);
      for (let index = 0; index <= count; index += 1) {
        const seconds = low + index * LADDER_STEP_S + LADDER_OFFSET_S;
        const want = reference_format_duration(frac_read_double(seconds));
        const got = display_format_duration(seconds);
        compared += 1;
        if (got !== want) mismatches.push({ seconds, want, got });
      }
    }
    expect(compared).toBeGreaterThan(10000);
    expect(mismatches.slice(0, 20)).toEqual([]);
  });
});

// ── 전 격자: 마운트한 화면 대 오라클 ─────────────────────────

describe('전 격자 — 8 천체 × θ 전 눈금 × 편도/왕복 × 턴 표본', () => {
  it('카드·판정 문장·슬라이더 읽기·표·타원 대조 줄이 오라클과 글자 하나까지 같다', () => {
    const mismatches = [];
    const forbidden = [];
    let states = 0;
    let compared = 0;
    let expectedStates = 0;

    for (const body of REFERENCE_BODIES) {
      for (const roundTrip of [true, false]) {
        const mounted = fixture_mount_widget(body.key, THETA_VALUES[0], roundTrip, TURN_VALUES[0]);
        for (const theta of THETA_VALUES) {
          const { seconds } = REFERENCE_ONE_WAY.get(`${body.key}:${theta}`);
          const turnsPicked = fixture_pick_turns(seconds);
          expectedStates += turnsPicked.length;
          for (const turns of turnsPicked) {
            fixture_update_sliders(mounted, theta, turns);
            compared += test_compare_state(mounted, body, theta, roundTrip, turns, mismatches, forbidden);
            states += 1;
          }
        }
      }
    }

    // 격자가 정말 돌았는가 (빈 루프가 조용히 통과하지 않게).
    expect(states).toBe(expectedStates);
    expect(states).toBeGreaterThanOrEqual(BODIES.length * THETA_VALUES.length * 2 * TURN_FIXED_SAMPLE.length);
    expect(compared).toBe(states * Object.keys(reference_describe_state(REFERENCE_BODIES[0], 0, true, 1).shown).length);
    expect(mismatches.slice(0, 20)).toEqual([]);
    expect(forbidden.slice(0, 20)).toEqual([]);
  });

  it('턴 전 범위: 대화 전체(n·2t)는 모든 (천체, θ, 턴)에서 오라클과 같은 글자로 찍힌다', () => {
    // 위 격자는 턴을 고른다(마운트 갱신 5.8만 번은 10초를 넘는다). 턴 수에 따라 단위 문턱을
    // 넘나드는 칸은 대화 전체 하나뿐이라, 여기서는 **턴 전부**를 카드와 같은 경로로 돌린다:
    // 카드는 model_calculate_result(...).conversationSeconds를 display_format_duration으로
    // 찍는다(위 격자 it이 마운트한 화면에서 그 경로를 이미 확인한다). 둘 다 **피검 대상**이고,
    // 기대값은 오라클이다. 대화 전체는 토글과 무관하므로 왕복 한 벌이면 된다.
    const mismatches = [];
    const forbidden = [];
    let compared = 0;
    for (const body of REFERENCE_BODIES) {
      for (const theta of THETA_VALUES) {
        for (const turns of TURN_VALUES) {
          const want = reference_describe_state(body, theta, true, turns).shown.conversationValue;
          const got = display_format_duration(model_calculate_result(body.key, theta, true, turns).conversationSeconds);
          compared += 1;
          if (got !== want) mismatches.push({ state: `${body.key} θ=${theta} n=${turns}`, want, got });
          if (fixture_scan_forbidden([got]).length > 0) forbidden.push({ state: `${body.key} θ=${theta} n=${turns}`, got });
        }
      }
    }
    expect(compared).toBe(BODIES.length * THETA_VALUES.length * TURN_VALUES.length);
    expect(mismatches.slice(0, 20)).toEqual([]);
    expect(forbidden.slice(0, 20)).toEqual([]);
  });

  it('프리셋과 범위 양 끝은 URL에서 곧장 떠도 오라클과 같다', () => {
    const mismatches = [];
    const forbidden = [];
    const cases = PRESETS.map((preset) => preset.state);
    for (const body of REFERENCE_BODIES) {
      for (const theta of [THETA_VALUES[0], THETA_VALUES[THETA_VALUES.length - 1]]) {
        for (const turns of [TURN_VALUES[0], TURN_VALUES[TURN_VALUES.length - 1]]) {
          cases.push({ bodyKey: body.key, thetaDegrees: theta, roundTrip: turns % 2 === 0, turns });
        }
      }
    }
    for (const state of cases) {
      const body = REFERENCE_BODIES.find((entry) => entry.key === state.bodyKey);
      const mounted = fixture_mount_widget(state.bodyKey, state.thetaDegrees, state.roundTrip, state.turns);
      test_compare_state(mounted, body, state.thetaDegrees, state.roundTrip, state.turns, mismatches, forbidden);
    }
    expect(cases.length).toBe(PRESETS.length + BODIES.length * 4);
    expect(mismatches).toEqual([]);
    expect(forbidden).toEqual([]);
  });
});
