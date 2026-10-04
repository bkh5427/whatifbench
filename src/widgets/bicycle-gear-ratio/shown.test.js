/**
 * 자전거 기어비 — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 한 종류다: **표시 단계가 값을 바꾼다.**
 * 모델이 옳은 비를 내도 표·카드·판정 배너·캡션에 틀린 글자가 찍히면 독자가 읽는 것은
 * 그 글자다. 사다리도 속도선도 그대로라서 화면에는 아무 흔적이 없다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ⓐ 오라클은 model.js의 **어떤 계산 함수도 import하지 않는다.** 식을 여기서 다시 쓴다
 *      (본문 수식 블록이 명세다):
 *      · 비            R = C/S
 *      · 바깥 지름     D = d + 2w           (mm)
 *      · gear inches   R·D/25.4
 *      · development   R·π·D/1000           (m)
 *      · gain ratio    R·D/(2L)
 *      · 속도          development·n·60/1000 (km/h)
 *      · 범위 배수     R_max/R_min
 *      25.4 mm/in·1000·60은 정의값이라 모델과 따로 적는다.
 *   ⓑ 연산은 BigInt 분자/분모 **정확 유리수**다. 반올림은 정수 나눗셈 한 번(0.5는 올림 =
 *      `toFixed`·`Math.round`의 명세)이라 부동소수를 거치지 않는다 — **경계가 경계로 남는다.**
 *      π는 소수 40자리 위·아래 유리수 한계 [π_lo, π_hi]로 감싸고, 두 한계가 같은 글자를
 *      내야만 답으로 삼는다(갈리면 던진다). π·유리수는 무리수라 반올림 동점이 없다.
 *      사다리 축 끝 10^(log₁₀G ± 0.035)도 무리수다 — v^200 = G^200·10^±7 꼴의 **정수 거듭제곱
 *      비교**로 자리를 정한다.
 *   ⓒ 중복 규칙은 본문 명세에서 다시 쓴다:
 *      · 상대차 = |a − b| / min(a, b),  τ보다 **작으면**(같으면 아니다) 같은 기어
 *      · "Deletable repeats" = 비가 낮은 쪽부터 걸으며, 이미 남긴 기어와 τ 안에 드는 것을 지운다
 *      · "have a near twin" = τ 안의 상대가 하나라도 있는 조합 (쌍의 양쪽을 다 센다)
 *      · 표의 Near twin = 상대차가 가장 작은 상대, 같으면 앞 번호(조합 순서 = 앞링 순 × 카세트 순)
 *      · "Span covered twice" = 두 앞링이 덮는 비 구간의 로그 폭 겹침 / 합집합 폭.
 *        두 구간 폭이 같으니 = max(0, ln A)/ln B,  A = S_max·C_small/(S_min·C_big),
 *        B = S_max·C_big/(S_min·C_small). 정수 백분율 N은 B^(2N−1) ≤ A^200 < B^(2N+1)로 정확히 고른다
 *      · 판정 색: 지울 수 있는 비율 ≥ 0.35 break, ≥ 0.15 edge, 아니면 hold (임계값은 데이터로 읽는다)
 *   ⓓ 격자(범위·눈금·기본값·프리셋·임계값)는 model.js에서 **데이터로만** 읽는다.
 *      표기 자리수와 문구 틀은 **이 파일의 명세**다 — 위젯이 바꾸면 걸리는 것이 맞다:
 *        gear inches 1자리 · gain 2자리 · development 2자리 + " m" · 속도 1자리 · 배수 2자리 + "×"
 *        허용오차 1자리 + "%" · 비율은 정수 % · 크랭크 1자리 · Near twin 상대차 1자리 %
 *        축 라벨: 10 이상은 정수, 아래는 유효숫자 3(소수 최대 3자리), 자릿수는 반올림 전 값으로
 *        사다리 축 = [G_min·10^−0.035, G_max·10^0.035], 폭이 0.25데케이드 미만이면 기하평균 ±0.125
 *        속도 축 상한 = max(1, R_max·π·D·60/10⁶ × 케이던스 최댓값 × 1.06)
 *   ⓔ 피검 대상은 두 경로다.
 *      · 표시 함수 경로: model_calculate_result(피검 대상이므로 불러도 된다)의 결과를 export된
 *        display_*·chart_describe_* 함수에 넣어 나온 문자열. 캡션이 인용하는 축은
 *        chart_render_*가 실제로 반환한 것을 쓴다(스텁 캔버스, 전역 설치 없이).
 *      · 마운트 경로: 위젯을 DOM 스텁에 **실제로 붙이고** 입력칸·드롭다운·슬라이더를 바꿔
 *        change를 발화시킨 뒤 화면 글자를 읽는다. 표·범례·손잡이 글자·프리셋 눌림까지 본다.
 *
 * 격자. 표시 함수 경로는 칸마다 무엇에 의존하는지로 쪼개어 각 부분공간을 전수 또는 촘촘히 돈다:
 *   · 중복·판정·세 정의·사다리/속도 캡션  (앞링 둘, 카세트, τ)  — 앞링 41 × (없음+41) × 카세트 프리셋 3
 *     × τ 전수 17, 그리고 경계 카세트 4종(톱니 최소 1장·최대 1장·13장·같은 톱니 두 장) × τ 대표값 3
 *   · 조합별 네 숫자  (C, S, D, L, n)  — C 전수 × S 전수 × D 전수(림 4 × 폭 48),
 *     크랭크·케이던스는 호출마다 눈금을 차례로 돌린다
 *   · gain 전수 스윕  — 대표 지름 6 × 크랭크 전수 × C·S 전수
 *   · 속도 전수 스윕  — 대표 지름 6 × 케이던스 전수 × C·S 전수
 * 마운트 경로는 갱신 한 번이 표와 두 그림을 다시 만들므로 대표값 격자만 돈다:
 * 조작부마다 양 끝·기본값·모든 프리셋의 값으로 (구동계 교차) + (휠·페달 교차) + (양 끝 2⁸ 교차),
 * 프리셋 버튼 7개 클릭, URL로 뜬 화면 하나.
 */
import { describe, it, expect } from 'vitest';
import {
  GEAR_CHAINRING_MIN,
  GEAR_CHAINRING_MAX,
  GEAR_CHAINRING_STEP,
  GEAR_CHAINRING_NONE,
  GEAR_CHAINRING_DEFAULT_LARGE,
  GEAR_CHAINRING_DEFAULT_SMALL,
  GEAR_CHAINRING_SLOTS,
  GEAR_SPROCKET_MIN,
  GEAR_SPROCKET_MAX,
  GEAR_SPROCKET_COUNT_MAX,
  GEAR_CASSETTE_DEFAULT,
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
  GEAR_VERDICT_EDGE_MIN_SHARE,
  GEAR_VERDICT_BREAK_MIN_SHARE,
  model_clamp_chainring,
  model_clamp_tyre_width,
  model_clamp_crank,
  model_clamp_cadence,
  model_clamp_tolerance,
  model_calculate_result,
} from './model.js';
import {
  widget_mount,
  display_format_gear_inches,
  display_format_gain_ratio,
  display_format_development,
  display_format_speed,
  display_format_share,
  display_describe_verdict,
  display_describe_counting,
  chart_render_ladder,
  chart_render_speed,
  chart_describe_ladder,
  chart_describe_speed,
} from './widget.js';
import { num_format_count } from '../_shared/numbers.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 정확 유리수 ──────────────────────────────────────────────
/** { n, d } — d > 0. 약분하지 않는다(비교·반올림은 교차곱과 정수 나눗셈이라 필요 없다). */
const frac_create = (n, d = 1n) => (BigInt(d) < 0n ? { n: -BigInt(n), d: -BigInt(d) } : { n: BigInt(n), d: BigInt(d) });

/** 십진 문자열 → 정확한 분자/분모. */
function frac_read_decimal(text) {
  const found = String(text).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[3] ?? '';
  const n = BigInt(found[2] + fraction);
  return frac_create(found[1] === '-' ? -n : n, 10n ** BigInt(fraction.length));
}

const frac_multiply = (left, right) => frac_create(left.n * right.n, left.d * right.d);
const frac_divide = (left, right) => frac_create(left.n * right.d, left.d * right.n);
/** left − right의 부호. */
const frac_compare = (left, right) => {
  const cross = left.n * right.d - right.n * left.d;
  return cross > 0n ? 1 : cross < 0n ? -1 : 0;
};
/** 정수 지수 거듭제곱. 음수 지수는 뒤집어서. */
function frac_power(value, exponent) {
  if (exponent < 0) return frac_power(frac_create(value.d, value.n), -exponent);
  const k = BigInt(exponent);
  return frac_create(value.n ** k, value.d ** k);
}
const frac_create_power10 = (exponent) =>
  exponent >= 0 ? frac_create(10n ** BigInt(exponent)) : frac_create(1n, 10n ** BigInt(-exponent));

/** |값|을 소수 digits자리로 반올림한 정수(= |값|×10^digits). 0.5는 올린다. */
function frac_round_fixed(value, digits) {
  const size = value.n < 0n ? -value.n : value.n;
  return (2n * size * 10n ** BigInt(digits) + value.d) / (2n * value.d);
}

/** 정수 scaled(= 값×10^digits)를 소수 digits자리 고정 문자열로. */
function frac_format_scaled(scaled, digits) {
  let body = BigInt(scaled).toString();
  if (digits === 0) return body;
  body = body.padStart(digits + 1, '0');
  return `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
}

const frac_format_fixed = (value, digits) => frac_format_scaled(frac_round_fixed(value, digits), digits);

// ── 정확 실수: π·유리수, 유리수의 유리수 거듭제곱근 ─────────────
/** π의 소수 40자리 아래·위 한계. π = 3.14159265358979323846264338327950288419716939937510… */
const PI_SCALE = 10n ** 40n;
const PI_LOW = 31415926535897932384626433832795028841971n;
const PI_HIGH = PI_LOW + 1n;

/**
 * π·q를 소수 digits자리로 0.5 올림한 정수. 두 한계가 갈리면 던진다 —
 * π·q는 무리수라 동점은 없고, 갈린다면 40자리로도 모자란 것이다.
 */
function reference_round_pi(q, digits) {
  const scale = 10n ** BigInt(digits);
  const low = (2n * PI_LOW * q.n * scale + PI_SCALE * q.d) / (2n * PI_SCALE * q.d);
  const high = (2n * PI_HIGH * q.n * scale + PI_SCALE * q.d) / (2n * PI_SCALE * q.d);
  if (low !== high) throw new Error(`π 한계가 반올림 경계를 걸친다: q=${q.n}/${q.d}`);
  return low;
}
const reference_format_pi = (q, digits) => frac_format_scaled(reference_round_pi(q, digits), digits);

/** 실수 v = π·q. compare(X)는 v − X의 부호이고, 두 한계가 같은 답을 낼 때만 돌려준다. */
const real_create_pi = (q) => ({
  approx: (Math.PI * Number(q.n)) / Number(q.d),
  compare: (x) => {
    const low = frac_compare(frac_create(PI_LOW * q.n, PI_SCALE * q.d), x);
    const high = frac_compare(frac_create(PI_HIGH * q.n, PI_SCALE * q.d), x);
    if (low !== high) throw new Error('π 한계가 비교 경계를 걸친다');
    return low;
  },
});

/** 실수 v, v^m = base^p · 10^j (base > 0 유리수). 무리수 축 끝이 이 꼴이다. */
const real_create_power = (base, p, j, m) => ({
  approx: 10 ** ((p * (Math.log10(Number(base.n)) - Math.log10(Number(base.d))) + j) / m),
  compare: (x) => {
    const mm = BigInt(m);
    const left = base.n ** BigInt(p) * 10n ** BigInt(Math.max(j, 0)) * x.d ** mm;
    const right = x.n ** mm * base.d ** BigInt(p) * 10n ** BigInt(Math.max(-j, 0));
    return left > right ? 1 : left < right ? -1 : 0;
  },
});

/** 실수를 소수 digits자리로 0.5 올림한 정수. 근삿값에서 출발해 정확 비교로 맞춘다. */
function reference_round_real(real, digits) {
  const scale = 10 ** digits;
  let n = BigInt(Math.round(real.approx * scale));
  const half = 2n * 10n ** BigInt(digits);
  for (let guard = 0; guard < 8; guard += 1) {
    if (real.compare(frac_create(2n * n - 1n, half)) < 0) n -= 1n;
    else if (real.compare(frac_create(2n * n + 1n, half)) >= 0) n += 1n;
    else return n;
  }
  throw new Error('반올림 자리를 못 찾았다');
}

/** floor(log₁₀ v). */
function reference_floor_log10(real) {
  let k = Math.floor(Math.log10(real.approx));
  for (let guard = 0; guard < 8; guard += 1) {
    if (real.compare(frac_create_power10(k)) < 0) k -= 1;
    else if (real.compare(frac_create_power10(k + 1)) >= 0) k += 1;
    else return k;
  }
  throw new Error('자릿수를 못 찾았다');
}

// ── 오라클 상수 (정의값·그림 명세 — 머리말 ⓐⓓ) ────────────────
const REFERENCE_MM_PER_INCH = frac_read_decimal('25.4');
const REFERENCE_MM_PER_METRE = 1000n;
const REFERENCE_METRES_PER_KM = 1000n;
const REFERENCE_MINUTES_PER_HOUR = 60n;
const REFERENCE_PERCENT = 100n;
/** D = d + 2w. ETRTO 폭이 지름에 두 번 들어간다. */
const REFERENCE_WIDTH_PER_DIAMETER = 2;
/** 반지름 = D/2. gain ratio = R·(D/2)/L. */
const REFERENCE_RADIUS_DIVISOR = 2n;

/** 사다리 축: 양쪽 여유 0.035데케이드, 최소 폭 0.25데케이드. 유리수 데케이드로 적는다. */
const REFERENCE_LADDER_PAD = { n: 7, d: 200 };
const REFERENCE_LADDER_MIN_SPAN = { n: 1, d: 4 };
/** 속도 축: 위 여유 1.06, 최소 상한 1 km/h. */
const REFERENCE_SPEED_HEADROOM = frac_read_decimal('1.06');
const REFERENCE_SPEED_MIN_HIGH = frac_create(1n);
/** 축 라벨: 10 이상은 정수, 아래는 유효숫자 3, 소수 최대 3자리. */
const REFERENCE_AXIS_WHOLE_MIN = frac_create(10n);
const REFERENCE_AXIS_SIGNIFICANT = 3;
const REFERENCE_AXIS_DECIMALS_MAX = 3;

// ── 오라클 표기 명세 ─────────────────────────────────────────
const REFERENCE_GEAR_INCH_DIGITS = 1;
const REFERENCE_GAIN_DIGITS = 2;
const REFERENCE_DEVELOPMENT_DIGITS = 2;
const REFERENCE_SPEED_DIGITS = 1;
const REFERENCE_FACTOR_DIGITS = 2;
const REFERENCE_TOLERANCE_DIGITS = 1;
const REFERENCE_CRANK_DIGITS = 1;
const REFERENCE_TWIN_GAP_DIGITS = 1;
const TIMES = '×'; // U+00D7
const ABSENT = '—';
const REFERENCE_HEADLINE = {
  hold: 'The model finds a few repeats in this drivetrain.',
  edge: 'The model finds part of this drivetrain repeated.',
  break: 'The model finds much of this drivetrain repeated.',
};
/** 지울 수 있는 조합이 0개면(그러면 짝도 0개) 등급과 무관하게 이 문장이다. */
const REFERENCE_HEADLINE_NONE = 'The model finds nothing repeated in this drivetrain.';
/** hold 등급에서 지울 수 있는 조합이 꼭 1개면 "a few"가 아니라 이 문장이다. */
const REFERENCE_HEADLINE_HOLD_ONE = 'The model finds one repeat in this drivetrain.';
const REFERENCE_HEADLINE_SINGLE =
  'With one ring and one sprocket the model has a single ratio and nothing to compare it with.';
const REFERENCE_VERDICT_EDGE = frac_read_decimal(String(GEAR_VERDICT_EDGE_MIN_SHARE));
const REFERENCE_VERDICT_BREAK = frac_read_decimal(String(GEAR_VERDICT_BREAK_MIN_SHARE));

const reference_format_count = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const reference_format_plural = (count, singular, plural) => (count === 1 ? singular : plural);
const reference_format_share = (part, whole) =>
  `${frac_round_fixed(frac_create(REFERENCE_PERCENT * BigInt(part), BigInt(whole)), 0)}%`;
const reference_format_gear_name = (combo) => `${combo.c} ${TIMES} ${combo.s}`;

// ── 격자: 조작부 눈금을 정수로 ───────────────────────────────
/** step의 소수 자리수로 배율을 정한다(1 → 1, 0.5 → 10, 2.5 → 10). */
const fixture_read_scale = (step) => 10 ** (String(step).split('.')[1]?.length ?? 0);

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

const RING = fixture_build_ticks(GEAR_CHAINRING_MIN, GEAR_CHAINRING_MAX, GEAR_CHAINRING_STEP);
const WIDTH = fixture_build_ticks(GEAR_TYRE_WIDTH_MIN, GEAR_TYRE_WIDTH_MAX, GEAR_TYRE_WIDTH_STEP);
const CRANK = fixture_build_ticks(GEAR_CRANK_MIN, GEAR_CRANK_MAX, GEAR_CRANK_STEP);
const CADENCE = fixture_build_ticks(GEAR_CADENCE_MIN, GEAR_CADENCE_MAX, GEAR_CADENCE_STEP);
const TOLERANCE = fixture_build_ticks(GEAR_TOLERANCE_MIN, GEAR_TOLERANCE_MAX, GEAR_TOLERANCE_STEP);
/** 톱니 수는 정수다(파서가 십진 정수만 받는다). */
const SPROCKETS = fixture_build_ticks(GEAR_SPROCKET_MIN, GEAR_SPROCKET_MAX, 1);
if (RING.scale !== 1 || WIDTH.scale !== 1 || CADENCE.scale !== 1) throw new Error('정수 눈금을 전제한다');

/** 정수 눈금 → 조작부 value에 넣는 십진 문자열(Number로 읽으면 같은 값). */
const fixture_format_tick = (tick, scale) => frac_format_scaled(BigInt(tick), String(scale).length - 1);
const fixture_pick_unique = (list) => [...new Set(list)].sort((left, right) => left - right);

/**
 * 상태 하나: { rings: 정수[], cassette: 정수[], width, bead, crank(눈금), cadence, tol(눈금) }.
 * rings는 비어 있는 둘째 칸을 뺀 배열이다.
 */
const DEFAULT_STATE = {
  rings: [GEAR_CHAINRING_DEFAULT_LARGE, GEAR_CHAINRING_DEFAULT_SMALL].filter((teeth) => teeth !== GEAR_CHAINRING_NONE),
  cassette: GEAR_CASSETTE_DEFAULT.slice(),
  width: GEAR_TYRE_WIDTH_DEFAULT,
  bead: GEAR_BEAD_SEAT_DEFAULT,
  crank: fixture_read_tick(GEAR_CRANK_DEFAULT, CRANK.scale),
  cadence: GEAR_CADENCE_DEFAULT,
  tol: fixture_read_tick(GEAR_TOLERANCE_DEFAULT, TOLERANCE.scale),
};
const fixture_build_state = (overrides) => ({ ...DEFAULT_STATE, ...overrides });
const fixture_read_cassette_preset = (key) => GEAR_CASSETTE_PRESETS.find((preset) => preset.key === key).teeth;

/** 자전거 프리셋 → 상태(케이던스·허용오차는 지금 것을 남긴다). */
const fixture_build_bike_state = (preset, base) => ({
  ...base,
  rings: preset.chainrings.filter((teeth) => teeth !== GEAR_CHAINRING_NONE),
  cassette: fixture_read_cassette_preset(preset.cassetteKey).slice(),
  width: preset.tyreWidthMm,
  bead: preset.beadSeatMm,
  crank: fixture_read_tick(preset.crankMm, CRANK.scale),
});
const BIKE_STATES = GEAR_BIKE_PRESETS.map((preset) => fixture_build_bike_state(preset, DEFAULT_STATE));

const fixture_build_tolerance_text = (tick) => fixture_format_tick(tick, TOLERANCE.scale);
const fixture_build_crank_text = (tick) => fixture_format_tick(tick, CRANK.scale);

const test_label_state = (state) =>
  `앞=${state.rings.join('/')}${state.rings.length < GEAR_CHAINRING_SLOTS ? '/없음' : ''} 뒤=${state.cassette.join(',')} ` +
  `w=${state.width} d=${state.bead} L=${fixture_build_crank_text(state.crank)} n=${state.cadence} ` +
  `τ=${fixture_build_tolerance_text(state.tol)}%`;

// ── 오라클: 비의 구조 (앞링·카세트만으로 정해지는 것) ────────────

/** 허용오차 눈금 → 비율의 분모. τ = 눈금 / (배율 × 100). */
const REFERENCE_TOLERANCE_DENOMINATOR = BigInt(TOLERANCE.scale) * REFERENCE_PERCENT;

/** 두 앞링이 덮는 비 구간의 겹침 비율(정수 %). 머리말 ⓒ의 정확 비교. */
const OVERLAP_CACHE = new Map();
function reference_calculate_overlap_percent(rings, cassette) {
  if (rings.length < 2) return 0n;
  const smallest = Math.min(...cassette);
  const largest = Math.max(...cassette);
  const big = Math.max(rings[0], rings[1]);
  const small = Math.min(rings[0], rings[1]);
  const key = `${small},${big},${smallest},${largest}`;
  if (OVERLAP_CACHE.has(key)) return OVERLAP_CACHE.get(key);
  let percent = 0n;
  // 카세트 폭이 0이면 겹칠 폭이 없다. A ≤ 1이면 앞링 간격이 카세트 폭 이상이다.
  if (largest > smallest && largest * small > smallest * big) {
    const a = frac_create(largest * small, smallest * big);
    const b = frac_create(largest * big, smallest * small);
    const twice = 2 * Number(REFERENCE_PERCENT);
    const left = frac_power(a, twice);
    let n = Math.round((Number(REFERENCE_PERCENT) * Math.log(Number(a.n) / Number(a.d))) / Math.log(Number(b.n) / Number(b.d)));
    for (let guard = 0; ; guard += 1) {
      if (guard > 8) throw new Error('겹침 백분율을 못 찾았다');
      if (frac_compare(left, frac_power(b, 2 * n - 1)) < 0) n -= 1;
      else if (frac_compare(left, frac_power(b, 2 * n + 1)) >= 0) n += 1;
      else break;
    }
    percent = BigInt(n);
  }
  OVERLAP_CACHE.set(key, percent);
  return percent;
}

/**
 * 앞링 × 카세트의 조합과 쌍. 쌍 (i, j)의 상대차 = num/den 정확값,
 * 그리고 "τ 눈금이 몇 이상이면 중복인가"(τ > num/den ⇔ 눈금 ≥ ⌊눈금분모·num/den⌋ + 1).
 */
const STRUCTURE_CACHE = new Map();
function reference_read_structure(rings, cassette) {
  const key = `${rings.join(',')}|${cassette.join(',')}`;
  const held = STRUCTURE_CACHE.get(key);
  if (held) return held;
  const combos = [];
  rings.forEach((c, ring) => {
    for (const s of cassette) combos.push({ c, s, ring, index: combos.length });
  });
  const count = combos.length;
  const gapNum = new Array(count * count);
  const gapDen = new Array(count * count);
  const minTick = new Int32Array(count * count);
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const a = combos[i].c * combos[j].s; // a/b = R_i/R_j (분모 S_i·S_j는 지워진다)
      const b = combos[j].c * combos[i].s;
      const num = BigInt(Math.abs(a - b));
      const den = BigInt(Math.min(a, b));
      const tick = Number((REFERENCE_TOLERANCE_DENOMINATOR * num) / den) + 1;
      for (const at of [i * count + j, j * count + i]) {
        gapNum[at] = num;
        gapDen[at] = den;
        minTick[at] = tick;
      }
    }
  }
  // 비 오름차순(같으면 앞 번호). 비교는 교차곱이다.
  const order = combos
    .slice()
    .sort((x, y) => x.c * y.s - y.c * x.s || x.index - y.index)
    .map((combo) => combo.index);
  let lowest = combos[0];
  let highest = combos[0];
  for (const combo of combos) {
    if (combo.c * lowest.s < lowest.c * combo.s) lowest = combo;
    if (combo.c * highest.s > highest.c * combo.s) highest = combo;
  }
  const structure = {
    rings,
    cassette,
    combos,
    count,
    gapNum,
    gapDen,
    minTick,
    order,
    lowest,
    highest,
    overlapPercent: reference_calculate_overlap_percent(rings, cassette),
  };
  STRUCTURE_CACHE.set(key, structure);
  return structure;
}

/** τ 하나에서의 세 개수. 지울 수 있는 것은 본문이 적은 걸음 그대로다. */
function reference_count_duplicates(structure, tol) {
  const { count, minTick, order } = structure;
  const kept = [];
  let removable = 0;
  for (const index of order) {
    if (kept.some((other) => tol >= minTick[other * count + index])) removable += 1;
    else kept.push(index);
  }
  let paired = 0;
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      if (j !== i && tol >= minTick[i * count + j]) {
        paired += 1;
        break;
      }
    }
  }
  return { removable, distinct: kept.length, paired };
}

/** 조합마다 가장 가까운 상대(τ 안). 상대차가 같으면 앞 번호. */
function reference_pick_twins(structure, tol) {
  const { count, minTick, gapNum, gapDen } = structure;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let best = null;
    for (let j = 0; j < count; j += 1) {
      const at = i * count + j;
      if (j === i || tol < minTick[at]) continue;
      const gap = frac_create(gapNum[at], gapDen[at]);
      if (!best || frac_compare(gap, best.gap) < 0) best = { index: j, gap };
    }
    out.push(best);
  }
  return out;
}

// ── 오라클: 길이가 곱해진 숫자 ───────────────────────────────

const reference_calculate_diameter = (bead, width) => bead + REFERENCE_WIDTH_PER_DIAMETER * width;
/** gear inches = C·D/(S·25.4). */
const reference_calculate_gear_inches = (c, s, diameter) =>
  frac_divide(frac_create(BigInt(c * diameter), BigInt(s)), REFERENCE_MM_PER_INCH);
/** gain = C·D/(S·2L). L = 눈금/배율. */
const reference_calculate_gain = (c, s, diameter, crankTick) =>
  frac_create(BigInt(c * diameter) * BigInt(CRANK.scale), BigInt(s) * REFERENCE_RADIUS_DIVISOR * BigInt(crankTick));
/** development = π·q,  q = C·D/(S·1000). */
const reference_calculate_development_q = (c, s, diameter) =>
  frac_create(BigInt(c * diameter), BigInt(s) * REFERENCE_MM_PER_METRE);
/** 속도 = π·q,  q = C·D·n·60/(S·1000·1000). */
const reference_calculate_speed_q = (c, s, diameter, cadence) =>
  frac_create(
    BigInt(c * diameter) * BigInt(cadence) * REFERENCE_MINUTES_PER_HOUR,
    BigInt(s) * REFERENCE_MM_PER_METRE * REFERENCE_METRES_PER_KM,
  );

const reference_format_gear_inches = (c, s, diameter) =>
  frac_format_fixed(reference_calculate_gear_inches(c, s, diameter), REFERENCE_GEAR_INCH_DIGITS);
const reference_format_gain = (c, s, diameter, crankTick) =>
  frac_format_fixed(reference_calculate_gain(c, s, diameter, crankTick), REFERENCE_GAIN_DIGITS);
const reference_format_development = (c, s, diameter) =>
  `${reference_format_pi(reference_calculate_development_q(c, s, diameter), REFERENCE_DEVELOPMENT_DIGITS)} m`;
const reference_format_speed = (c, s, diameter, cadence) =>
  reference_format_pi(reference_calculate_speed_q(c, s, diameter, cadence), REFERENCE_SPEED_DIGITS);

/** 축 라벨: 10 이상은 정수, 아래는 유효숫자 3(소수 최대 3). 자릿수는 반올림 전 값으로. */
function reference_format_axis(real) {
  if (real.compare(REFERENCE_AXIS_WHOLE_MIN) >= 0) return frac_format_scaled(reference_round_real(real, 0), 0);
  const decade = reference_floor_log10(real);
  const digits = Math.min(Math.max(0, REFERENCE_AXIS_SIGNIFICANT - 1 - decade), REFERENCE_AXIS_DECIMALS_MAX);
  return frac_format_scaled(reference_round_real(real, digits), digits);
}

/**
 * 사다리 축 양 끝(머리말 ⓓ). 보통은 v^b = G^b·10^∓a (여유 a/b 데케이드).
 * log₁₀(G_max/G_min) + 2·여유 < 최소 폭이면 기하평균 ± 최소 폭/2:
 * v^(2h_d) = (G_min·G_max)^(h_d)·10^(∓2h_n),  h = 최소 폭/2.
 */
const LADDER_AXIS_CACHE = new Map();
function reference_describe_ladder_axis(structure, diameter) {
  const key = `${structure.lowest.c}/${structure.lowest.s}|${structure.highest.c}/${structure.highest.s}|${diameter}`;
  const held = LADDER_AXIS_CACHE.get(key);
  if (held) return held;
  const low = reference_calculate_gear_inches(structure.lowest.c, structure.lowest.s, diameter);
  const high = reference_calculate_gear_inches(structure.highest.c, structure.highest.s, diameter);
  const pad = REFERENCE_LADDER_PAD;
  const span = REFERENCE_LADDER_MIN_SPAN;
  // 문턱 T = 최소 폭 − 2·여유 (데케이드, 유리수). 좁음 ⇔ (G_max/G_min)^(T_d) < 10^(T_n).
  const thresholdN = span.n * pad.d - 2 * pad.n * span.d;
  const thresholdD = span.d * pad.d;
  const narrow = frac_compare(frac_power(frac_divide(high, low), thresholdD), frac_create_power10(thresholdN)) < 0;
  let ends;
  if (!narrow) {
    ends = [real_create_power(low, pad.d, -pad.n, pad.d), real_create_power(high, pad.d, pad.n, pad.d)];
  } else {
    const product = frac_multiply(low, high);
    const half = { n: span.n, d: 2 * span.d };
    ends = [
      real_create_power(product, half.d, -2 * half.n, 2 * half.d),
      real_create_power(product, half.d, 2 * half.n, 2 * half.d),
    ];
  }
  const text = ends.map(reference_format_axis);
  LADDER_AXIS_CACHE.set(key, text);
  return text;
}

/** 속도 축 상한 = max(1, π·q·케이던스 최댓값·1.06),  q는 가장 높은 비의 1 rpm당 km/h. */
function reference_describe_speed_axis(structure, diameter) {
  const perRpm = reference_calculate_speed_q(structure.highest.c, structure.highest.s, diameter, 1);
  const q = frac_multiply(frac_multiply(perRpm, frac_create(BigInt(GEAR_CADENCE_MAX))), REFERENCE_SPEED_HEADROOM);
  const real = real_create_pi(q);
  if (real.compare(REFERENCE_SPEED_MIN_HIGH) < 0) return reference_format_axis(real_create_power(REFERENCE_SPEED_MIN_HIGH, 1, 0, 1));
  return reference_format_axis(real);
}

// ── 오라클: 한 상태의 화면 ───────────────────────────────────

/**
 * 한 상태에서 화면에 있어야 하는 문자열 전부. 칸 이름의 첫 마디가 분류다.
 * withScreen이면 마운트 화면에만 있는 칸(손잡이·표·범례·프리셋)까지 만든다.
 */
function reference_describe_screen(state, withScreen) {
  const structure = reference_read_structure(state.rings, state.cassette);
  const { count, lowest, highest } = structure;
  const counts = reference_count_duplicates(structure, state.tol);
  const diameter = reference_calculate_diameter(state.bead, state.width);
  const tolerance = `${frac_format_scaled(BigInt(state.tol), REFERENCE_TOLERANCE_DIGITS)}%`;
  const share = frac_create(BigInt(counts.removable), BigInt(count));
  const verdict =
    frac_compare(share, REFERENCE_VERDICT_BREAK) >= 0 ? 'break' : frac_compare(share, REFERENCE_VERDICT_EDGE) >= 0 ? 'edge' : 'hold';
  const nCount = reference_format_count(count);
  const cadence = reference_format_count(state.cadence);

  const repeats =
    counts.removable === 0
      ? `At a ${tolerance} tolerance the model finds no two combinations close enough to call the same gear`
      : `At a ${tolerance} tolerance the model can drop ${reference_format_count(counts.removable)} of ${nCount} ` +
        `combinations and still keep a gear within that tolerance of every ratio the drivetrain has`;
  const factor = frac_create(BigInt(highest.c * lowest.s), BigInt(highest.s * lowest.c));
  const detail =
    `${repeats}. It puts the whole range at ${reference_format_gear_inches(lowest.c, lowest.s, diameter)} to ` +
    `${reference_format_gear_inches(highest.c, highest.s, diameter)} gear inches, a factor of ` +
    `${frac_format_fixed(factor, REFERENCE_FACTOR_DIGITS)}${TIMES}, and at ${cadence} rpm the top combination ` +
    `(${reference_format_gear_name(highest)}) comes to ${reference_format_speed(highest.c, highest.s, diameter, state.cadence)} ` +
    `km/h against ${reference_format_speed(lowest.c, lowest.s, diameter, state.cadence)} for the bottom one.`;

  const removableShare = reference_format_share(counts.removable, count);
  const pairedShare = reference_format_share(counts.paired, count);
  const overlapShare = `${structure.overlapPercent}%`;
  const overlap =
    state.rings.length < 2
      ? 'With a single front ring there is no second row to overlap, so the third count is 0%.'
      : `Measured as range rather than as count, more than one front ring covers ${overlapShare} of the span — ` +
        `that one does not move with the tolerance slider at all, because it measures width and not closeness.`;
  const counting =
    `Three ways to count the same repetition. ${reference_format_count(counts.removable)} of ${nCount} combinations ` +
    `(${removableShare}) can be deleted while every ratio keeps a gear within ${tolerance}. ` +
    `${reference_format_count(counts.paired)} of ${nCount} (${pairedShare}) have a near twin somewhere in the ` +
    `drivetrain, which counts both halves of every pair. ${overlap}`;

  const [axisLow, axisHigh] = reference_describe_ladder_axis(structure, diameter);
  const rows =
    state.rings.length > 1
      ? 'Two rows, one per front ring, in the two series colours.'
      : 'One row, because this setup has a single front ring.';
  const twins =
    counts.paired > 0
      ? `${reference_format_count(counts.paired)} ${reference_format_plural(counts.paired, 'marker is', 'markers are')} ` +
        `drawn hollow and joined by a dashed line: those are within ${tolerance} of another combination.`
      : `No marker is hollow, so at ${tolerance} the model finds no pair close enough to call the same gear.`;
  const ladder =
    `${rows} Each marker is one combination, and the number under it is the sprocket. ${twins} ` +
    `The axis runs ${axisLow} to ${axisHigh} gear inches on a log scale and rescales to the setup — ` +
    `read it before comparing two settings.`;
  const merged =
    counts.paired > 0
      ? ` ${reference_format_count(counts.paired)} of the lines sit within ${tolerance} of another and run close ` +
        `together at this scale; the table below lists them separately rather than the axis being tightened around them.`
      : '';
  const speed =
    `One straight line per combination, because at a fixed ratio the model makes speed exactly proportional to ` +
    `cadence. ${state.rings.length > 1 ? 'Solid lines are the first front ring, dashed lines the second.' : 'Every line belongs to the single front ring and is drawn solid.'} The dashed vertical line is the ` +
    `cadence slider at ${cadence} rpm, and the dots on it are the 'Speed at ${state.cadence} rpm' column of the ` +
    `table. The vertical axis runs 0 to ${reference_describe_speed_axis(structure, diameter)} km/h and rescales ` +
    `to the setup.${merged}`;

  const shown = {};
  shown['verdict.state'] = verdict;
  shown['verdict.headline'] =
    count === 1
      ? REFERENCE_HEADLINE_SINGLE
      : counts.removable === 0
        ? REFERENCE_HEADLINE_NONE
        : verdict === 'hold' && counts.removable === 1
          ? REFERENCE_HEADLINE_HOLD_ONE
          : REFERENCE_HEADLINE[verdict];
  shown['verdict.detail'] = detail;
  shown.counting = counting;
  shown['card.total'] = nCount;
  shown['card.distinct'] = reference_format_count(counts.distinct);
  shown['card.distinct-unit'] = `at ${tolerance}`;
  shown['card.removable'] = reference_format_count(counts.removable);
  shown['card.removable-unit'] = `${removableShare} of ${count}`;
  shown['card.overlap'] = overlapShare;
  shown['ladder.caption'] = ladder;
  shown['speed.caption'] = speed;
  if (!withScreen) return shown;

  // 손잡이·입력칸 옆 글자
  const crankText = `${frac_format_scaled(BigInt(state.crank), REFERENCE_CRANK_DIGITS)} mm`;
  shown['slider.rings-output'] = state.rings.length > 1 ? 'two rings' : 'one ring';
  shown['slider.cassette-output'] =
    `${reference_format_count(state.cassette.length)} ${reference_format_plural(state.cassette.length, 'sprocket', 'sprockets')}`;
  shown['slider.bead-output'] = `${state.bead} mm`;
  shown['slider.width-output'] = `${state.width} mm`;
  shown['slider.width-valuetext'] = `${state.width} mm`;
  shown['slider.crank-output'] = crankText;
  shown['slider.crank-valuetext'] = crankText;
  shown['slider.cadence-output'] = `${state.cadence} rpm`;
  shown['slider.cadence-valuetext'] = `${state.cadence} rpm`;
  shown['slider.tolerance-output'] = tolerance;
  shown['slider.tolerance-valuetext'] = tolerance;
  // 그림 아래 글과 캔버스 이름은 같은 문장이다.
  shown['ladder.aria'] = ladder;
  shown['speed.aria'] = speed;
  // 표
  const twinsOf = reference_pick_twins(structure, state.tol);
  shown['table.head-speed'] = `Speed at ${state.cadence} rpm`;
  shown['table.rows'] = String(count);
  structure.combos.forEach((combo, index) => {
    const twin = twinsOf[index];
    const cells = [
      reference_format_gear_name(combo),
      reference_format_gear_inches(combo.c, combo.s, diameter),
      reference_format_gain(combo.c, combo.s, diameter, state.crank),
      reference_format_development(combo.c, combo.s, diameter),
      `${reference_format_speed(combo.c, combo.s, diameter, state.cadence)} km/h`,
      twin
        ? `${reference_format_gear_name(structure.combos[twin.index])} ` +
          `(${frac_format_fixed(frac_multiply(twin.gap, frac_create(REFERENCE_PERCENT)), REFERENCE_TWIN_GAP_DIGITS)}%)`
        : ABSENT,
    ];
    cells.forEach((text, column) => {
      shown[`table.r${index}.c${column}`] = text;
    });
  });
  // 범례: 앞링마다 한 줄 + 연결선 한 줄(사다리) / 손잡이 세로선 한 줄(속도)
  shown['legend.ladder'] = [
    ...state.rings.map((teeth, ring) => ` ${teeth}-tooth ring — ${ring === 0 ? 'upper' : 'lower'} row`),
    ` Dashed link between hollow markers — a pair within ${tolerance}`,
  ].join('|');
  shown['legend.speed'] = [
    ...state.rings.map((teeth, ring) => ` ${teeth}-tooth ring — ${ring === 0 ? 'solid' : 'dashed'} lines`),
    ' Dashed upright — the cadence slider',
  ].join('|');
  // 프리셋 눌림: 지금 상태와 값이 전부 같은 것
  const sameList = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
  const bike = GEAR_BIKE_PRESETS.find((preset) => {
    const wanted = fixture_build_bike_state(preset, state);
    return (
      sameList(wanted.rings, state.rings) &&
      sameList(wanted.cassette, state.cassette) &&
      wanted.width === state.width &&
      wanted.bead === state.bead &&
      wanted.crank === state.crank
    );
  });
  const cassette = GEAR_CASSETTE_PRESETS.find((preset) => sameList(preset.teeth, state.cassette));
  shown['preset.bike'] = bike ? bike.key : 'none';
  shown['preset.cassette'] = cassette ? cassette.key : 'none';
  return shown;
}

// ── 피검 1: 표시 함수 경로 ───────────────────────────────────

/** 조작부가 넘기는 것과 같은 값: 문자열 → Number. */
function fixture_build_params(state) {
  return {
    chainrings: state.rings.slice(),
    cassette: state.cassette.slice(),
    tyreWidthMm: Number(String(state.width)),
    beadSeatMm: Number(String(state.bead)),
    crankMm: Number(fixture_build_crank_text(state.crank)),
    cadenceRpm: Number(String(state.cadence)),
    tolerancePercent: Number(fixture_build_tolerance_text(state.tol)),
  };
}

/** 스텁 캔버스 두 장. 전역을 설치하지 않는다 — 색은 폴백, 픽셀비는 1로 읽힌다. */
const STUB_WIDTH_PX = 900;
const STUB_DOM = fixture_create_dom({ width: STUB_WIDTH_PX });
const STUB_LADDER = STUB_DOM.document.createElement('canvas');
const STUB_SPEED = STUB_DOM.document.createElement('canvas');

/** export된 display_*·chart_describe_* 함수들이 이 상태에서 내는 문자열. 칸 이름은 오라클과 같다. */
function fixture_read_display(state) {
  const result = model_calculate_result(fixture_build_params(state));
  const spoken = display_describe_verdict(result);
  const ladderDrawn = chart_render_ladder(STUB_LADDER, result);
  const speedDrawn = chart_render_speed(STUB_SPEED, result);
  STUB_LADDER.context.texts.length = 0;
  STUB_SPEED.context.texts.length = 0;
  return {
    'verdict.state': result.verdict,
    'verdict.headline': spoken.headline,
    'verdict.detail': spoken.detail,
    counting: display_describe_counting(result),
    'card.total': num_format_count(result.combinationCount),
    'card.distinct': num_format_count(result.distinctCount),
    'card.removable': num_format_count(result.removableCount),
    'card.removable-unit': `${display_format_share(result.removableShare)} of ${result.combinationCount}`,
    'card.overlap': display_format_share(result.overlapShare),
    'ladder.caption': chart_describe_ladder(result, ladderDrawn),
    'speed.caption': chart_describe_speed(result, speedDrawn),
  };
}
const DISPLAY_FIELD_COUNT = 11;

// ── 피검 2: 마운트한 화면 ────────────────────────────────────

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

const SLIDER_IDS = { width: 'gear-width', crank: 'gear-crank', cadence: 'gear-cadence', tolerance: 'gear-tolerance' };

/** URL 쿼리로 상태를 싣고 붙인다. 갱신마다 살아 남는 원소는 여기서 한 번만 찾아 둔다. */
function fixture_mount_widget(search = '') {
  const dom = fixture_create_dom({ search, width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  const all = fixture_scan_elements(dom.root);
  const by_class = (name) => all.filter((el) => fixture_check_class(el, name));
  const by_id = (id) => all.find((el) => el.getAttribute('id') === id);
  const output_of = (id) => all.find((el) => el.tagName === 'output' && el.getAttribute('for') === id);
  const verdict = by_class('verdict')[0];
  const [countingNote, ladderNote, speedNote] = by_class('legend-note');
  const [ladderLegend, speedLegend] = by_class('widget-legend');
  // 캔버스는 [사다리, 속도] 순서다(widget_mount의 append 순서).
  const [ladderCanvas, speedCanvas] = all.filter((el) => el.tagName === 'canvas');
  const thead = all.find((el) => el.tagName === 'thead');
  return {
    dom,
    widget_reset,
    ring1: by_id('gear-ring-1'),
    ring2: by_id('gear-ring-2'),
    cassette: by_id('gear-cassette'),
    bead: by_id('gear-bead-seat'),
    sliders: Object.fromEntries(Object.entries(SLIDER_IDS).map(([name, id]) => [name, by_id(id)])),
    outputs: {
      rings: output_of('gear-ring-1'),
      cassette: output_of('gear-cassette'),
      bead: output_of('gear-bead-seat'),
      ...Object.fromEntries(Object.entries(SLIDER_IDS).map(([name, id]) => [name, output_of(id)])),
    },
    presets: Object.fromEntries(by_class('widget-preset').map((button) => [button.dataset.preset, button])),
    cards: by_class('readouts')[0].children.map((box) => box.children[1]),
    verdict,
    headline: verdict.children[0],
    detail: verdict.children[2],
    countingNote,
    ladderNote,
    speedNote,
    ladderLegend,
    speedLegend,
    ladderCanvas,
    speedCanvas,
    headCells: thead.children[0].children,
    tbody: all.find((el) => el.tagName === 'tbody'),
  };
}

/** 입력칸·드롭다운·슬라이더를 전부 옮기고 change를 한 번 발화시킨다 — 위젯은 조작부 전체를 다시 읽는다. */
function fixture_update_controls(mounted, state) {
  mounted.ring1.value = String(state.rings[0]);
  mounted.ring2.value = state.rings.length > 1 ? String(state.rings[1]) : '';
  mounted.cassette.value = state.cassette.join(', ');
  mounted.bead.value = String(state.bead);
  mounted.sliders.width.value = String(state.width);
  mounted.sliders.crank.value = fixture_build_crank_text(state.crank);
  mounted.sliders.cadence.value = String(state.cadence);
  mounted.sliders.tolerance.value = fixture_build_tolerance_text(state.tol);
  return mounted.dom.listeners_run_event(mounted.sliders.width, 'change');
}

/** 지금 화면의 글자를 오라클과 같은 칸 이름으로 읽는다. */
function fixture_read_screen(mounted) {
  const shown = {};
  for (const name of ['rings', 'cassette', 'bead', 'width', 'crank', 'cadence', 'tolerance']) {
    shown[`slider.${name}-output`] = mounted.outputs[name].textContent;
  }
  for (const name of Object.keys(SLIDER_IDS)) {
    shown[`slider.${name}-valuetext`] = mounted.sliders[name].getAttribute('aria-valuetext');
  }
  shown['verdict.state'] = mounted.verdict.dataset.state;
  shown['verdict.headline'] = mounted.headline.textContent;
  shown['verdict.detail'] = mounted.detail.textContent;
  shown.counting = mounted.countingNote.textContent;
  // 카드는 [조합 수, 서로 다른 비, 지울 수 있는 것, 두 번 덮인 폭] 순서다.
  const [total, distinct, removable, overlap] = mounted.cards;
  shown['card.total'] = total.children[0].textContent;
  shown['card.distinct'] = distinct.children[0].textContent;
  shown['card.distinct-unit'] = distinct.children[1].textContent;
  shown['card.removable'] = removable.children[0].textContent;
  shown['card.removable-unit'] = removable.children[1].textContent;
  shown['card.overlap'] = overlap.children[0].textContent;
  shown['ladder.caption'] = mounted.ladderNote.textContent;
  shown['ladder.aria'] = mounted.ladderCanvas.getAttribute('aria-label');
  shown['speed.caption'] = mounted.speedNote.textContent;
  shown['speed.aria'] = mounted.speedCanvas.getAttribute('aria-label');
  shown['table.head-speed'] = mounted.headCells[4].textContent;
  shown['table.rows'] = String(mounted.tbody.children.length);
  mounted.tbody.children.forEach((row, index) => {
    row.children.forEach((cell, column) => {
      shown[`table.r${index}.c${column}`] = cell.textContent;
    });
  });
  shown['legend.ladder'] = mounted.ladderLegend.children.map((item) => item.textContent).join('|');
  shown['legend.speed'] = mounted.speedLegend.children.map((item) => item.textContent).join('|');
  const pressed = (keys) => keys.find((key) => mounted.presets[key].getAttribute('aria-pressed') === 'true') ?? 'none';
  shown['preset.bike'] = pressed(GEAR_BIKE_PRESETS.map((preset) => preset.key));
  shown['preset.cassette'] = pressed(GEAR_CASSETTE_PRESETS.map((preset) => preset.key));
  return shown;
}
/** 표 칸을 뺀 화면 칸 수. 표는 조합마다 6칸. */
const SCREEN_FIXED_FIELD_COUNT = 7 + 4 + 4 + 6 + 4 + 2 + 2 + 2;
const TABLE_COLUMN_COUNT = 6;

// ── 대조 ─────────────────────────────────────────────────────

const MISMATCH_SAMPLE_MAX = 6;
const LONG_TIMEOUT_MS = 120000;

function test_create_tally() {
  return { count: 0, compared: 0, fired: 0, byField: new Map() };
}

/** got의 칸마다 want와 비교한다. 오라클 쪽에 칸이 없으면 그것도 어긋남이다. */
function test_compare_fields(label, got, want, tally) {
  for (const field of Object.keys(got)) {
    tally.compared += 1;
    if (got[field] === want[field]) continue;
    if (!tally.byField.has(field)) tally.byField.set(field, { count: 0, samples: [] });
    const entry = tally.byField.get(field);
    entry.count += 1;
    if (entry.samples.length < MISMATCH_SAMPLE_MAX) {
      entry.samples.push({ 상태: label, 칸: field, 화면: got[field], 정확: want[field] });
    }
  }
  tally.count += 1;
}

/** prefixes로 시작하는 칸의 어긋남만 모아 요약한다. 표의 r0.c1과 r5.c1은 같은 칸 종류로 묶는다. */
function test_summarize(tally, prefixes) {
  const byField = {};
  const samples = [];
  let total = 0;
  for (const [field, entry] of tally.byField) {
    if (!prefixes.some((prefix) => field.startsWith(prefix))) continue;
    const kind = field.replace(/^table\.r\d+\./, 'table.r*.');
    byField[kind] = (byField[kind] ?? 0) + entry.count;
    total += entry.count;
    samples.push(...entry.samples.slice(0, 2));
  }
  return { 불일치: total, 칸별: byField, 처음: samples.slice(0, MISMATCH_SAMPLE_MAX) };
}
const CLEAN = { 불일치: 0, 칸별: {}, 처음: [] };

const DISPLAY_FAMILIES = [
  ['판정 상태 (hold / edge / break)', ['verdict.state']],
  ['판정 머리문장', ['verdict.headline']],
  ['판정 세부문장 (gear inches 양 끝·배수·속도 양 끝)', ['verdict.detail']],
  ['세 정의 문단 (지울 수 있는 것·짝·겹침 폭)', ['counting']],
  ['카드 네 장 (개수·비율·겹침 폭)', ['card.']],
  ['사다리 캡션 (줄·속 빈 마커 수·축 양 끝)', ['ladder.']],
  ['속도 캡션 (케이던스·축 상한·구분 불가 선 수)', ['speed.']],
];

// ── 격자 상태 생성 ───────────────────────────────────────────

/** 둘째 칸은 비움(없음) + 전 눈금. */
const RING_SECOND_TICKS = [GEAR_CHAINRING_NONE, ...RING.ticks];
const fixture_build_rings = (first, second) => (second === GEAR_CHAINRING_NONE ? [first] : [first, second]);

/** 경계 카세트: 최소 톱니 한 장, 최대 톱니 한 장, 최대 장수(최소부터 + 마지막은 최대 톱니), 같은 톱니 두 장. */
const EDGE_CASSETTES = [
  [GEAR_SPROCKET_MIN],
  [GEAR_SPROCKET_MAX],
  [...SPROCKETS.ticks.slice(0, GEAR_SPROCKET_COUNT_MAX - 1), GEAR_SPROCKET_MAX],
  [GEAR_CASSETTE_DEFAULT[0], GEAR_CASSETTE_DEFAULT[0], GEAR_CASSETTE_DEFAULT[1]],
];
const TOLERANCE_SAMPLE = fixture_pick_unique([TOLERANCE.ticks[0], TOLERANCE.ticks[TOLERANCE.ticks.length - 1], DEFAULT_STATE.tol]);

/** 앞링 전수 × 카세트 프리셋 × τ 전수 + 앞링 전수 × 경계 카세트 × τ 대표값 (기본 휠·페달). */
function* fixture_walk_structure() {
  for (const first of RING.ticks) {
    for (const second of RING_SECOND_TICKS) {
      const rings = fixture_build_rings(first, second);
      for (const preset of GEAR_CASSETTE_PRESETS) {
        for (const tol of TOLERANCE.ticks) yield fixture_build_state({ rings, cassette: preset.teeth.slice(), tol });
      }
      for (const cassette of EDGE_CASSETTES) {
        for (const tol of TOLERANCE_SAMPLE) yield fixture_build_state({ rings, cassette, tol });
      }
    }
  }
}

/**
 * 조합별 네 숫자: 앞링을 두 개씩, 톱니를 최대 장수씩 묶어 C 전수 × S 전수를 몇 번의 호출로 덮는다.
 * 앞 (20,21)…(58,59),(60) × 뒤 9–21, 22–34, 35–47, 48–52.
 */
const fixture_chunk = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, index * size + size));
const RING_CHUNKS = fixture_chunk(RING.ticks, GEAR_CHAINRING_SLOTS);
const SPROCKET_CHUNKS = fixture_chunk(SPROCKETS.ticks, GEAR_SPROCKET_COUNT_MAX);
const COVER_DRIVETRAINS = RING_CHUNKS.flatMap((rings) => SPROCKET_CHUNKS.map((cassette) => ({ rings, cassette })));

/** 대표 지름: 기본·자전거 프리셋·(가장 작은 림, 가장 좁은 폭)·(가장 큰 림, 가장 넓은 폭). */
const GEOMETRY_SAMPLE = (() => {
  const seen = new Map();
  const add = (bead, width) => seen.set(reference_calculate_diameter(bead, width), { bead, width });
  add(DEFAULT_STATE.bead, DEFAULT_STATE.width);
  for (const state of BIKE_STATES) add(state.bead, state.width);
  add(Math.min(...GEAR_BEAD_SEAT_CHOICES), WIDTH.ticks[0]);
  add(Math.max(...GEAR_BEAD_SEAT_CHOICES), WIDTH.ticks[WIDTH.ticks.length - 1]);
  return [...seen.values()];
})();

/** 한 번의 모델 호출이 내는 조합별 숫자를 칸별로 대조한다. fields: 볼 칸 이름들. */
function test_compare_combinations(state, fields, tally) {
  const result = model_calculate_result(fixture_build_params(state));
  const diameter = reference_calculate_diameter(state.bead, state.width);
  const label = test_label_state(state);
  for (const combination of result.combinations) {
    const { chainring: c, sprocket: s } = combination;
    const got = {};
    const want = {};
    if (fields.includes('gear-inches')) {
      got['combo.gear-inches'] = display_format_gear_inches(combination.gearInches);
      want['combo.gear-inches'] = reference_format_gear_inches(c, s, diameter);
    }
    if (fields.includes('gain')) {
      got['combo.gain'] = display_format_gain_ratio(combination.gainRatio);
      want['combo.gain'] = reference_format_gain(c, s, diameter, state.crank);
    }
    if (fields.includes('development')) {
      got['combo.development'] = display_format_development(combination.developmentM);
      want['combo.development'] = reference_format_development(c, s, diameter);
    }
    if (fields.includes('speed')) {
      got['combo.speed'] = display_format_speed(combination.speedKmh);
      want['combo.speed'] = reference_format_speed(c, s, diameter, state.cadence);
    }
    test_compare_fields(`${label} 조합 ${c}×${s}`, got, want, tally);
  }
}

const ALL_COMBO_FIELDS = ['gear-inches', 'gain', 'development', 'speed'];

function test_run_combinations() {
  const tally = test_create_tally();
  let cursor = 0;
  // ① 림 전수 × 폭 전수, 크랭크·케이던스는 호출마다 차례로 돈다 — 네 칸 전부.
  for (const bead of GEAR_BEAD_SEAT_CHOICES) {
    for (const width of WIDTH.ticks) {
      for (const drivetrain of COVER_DRIVETRAINS) {
        const crank = CRANK.ticks[cursor % CRANK.ticks.length];
        const cadence = CADENCE.ticks[cursor % CADENCE.ticks.length];
        cursor += 1;
        test_compare_combinations(fixture_build_state({ ...drivetrain, bead, width, crank, cadence }), ALL_COMBO_FIELDS, tally);
      }
    }
  }
  // ② 대표 지름 × 크랭크 전수 — gain만.
  for (const geometry of GEOMETRY_SAMPLE) {
    for (const crank of CRANK.ticks) {
      for (const drivetrain of COVER_DRIVETRAINS) {
        test_compare_combinations(fixture_build_state({ ...drivetrain, ...geometry, crank }), ['gain'], tally);
      }
    }
  }
  // ③ 대표 지름 × 케이던스 전수 — 속도만.
  for (const geometry of GEOMETRY_SAMPLE) {
    for (const cadence of CADENCE.ticks) {
      for (const drivetrain of COVER_DRIVETRAINS) {
        test_compare_combinations(fixture_build_state({ ...drivetrain, ...geometry, cadence }), ['speed'], tally);
      }
    }
  }
  return tally;
}

/** 조작부마다 대표값: 양 끝·기본값·모든 프리셋의 값. */
const RING_FIRST_SAMPLE = fixture_pick_unique([
  RING.ticks[0],
  RING.ticks[RING.ticks.length - 1],
  GEAR_CHAINRING_DEFAULT_LARGE,
  ...GEAR_BIKE_PRESETS.map((preset) => preset.chainrings[0]),
]);
const RING_SECOND_SAMPLE = fixture_pick_unique([
  GEAR_CHAINRING_NONE,
  RING.ticks[0],
  RING.ticks[RING.ticks.length - 1],
  GEAR_CHAINRING_DEFAULT_SMALL,
  ...GEAR_BIKE_PRESETS.map((preset) => preset.chainrings[1]),
]);
const CASSETTE_SAMPLE = [...GEAR_CASSETTE_PRESETS.map((preset) => preset.teeth.slice()), ...EDGE_CASSETTES];
const WIDTH_SAMPLE = fixture_pick_unique([
  WIDTH.ticks[0],
  WIDTH.ticks[WIDTH.ticks.length - 1],
  DEFAULT_STATE.width,
  ...BIKE_STATES.map((state) => state.width),
]);
const BEAD_SAMPLE = GEAR_BEAD_SEAT_CHOICES.slice();
const CRANK_SAMPLE = fixture_pick_unique([
  CRANK.ticks[0],
  CRANK.ticks[CRANK.ticks.length - 1],
  DEFAULT_STATE.crank,
  ...BIKE_STATES.map((state) => state.crank),
]);
const CADENCE_SAMPLE = fixture_pick_unique([CADENCE.ticks[0], CADENCE.ticks[CADENCE.ticks.length - 1], DEFAULT_STATE.cadence]);

/** 구동계 교차: 첫 링 × 둘째 링 × 카세트 × τ 대표값 (기본 휠·페달). */
function* fixture_walk_mount_drivetrain() {
  for (const first of RING_FIRST_SAMPLE) {
    for (const second of RING_SECOND_SAMPLE) {
      for (const cassette of CASSETTE_SAMPLE) {
        for (const tol of TOLERANCE_SAMPLE) yield fixture_build_state({ rings: fixture_build_rings(first, second), cassette, tol });
      }
    }
  }
}
/** 휠·페달 교차: 폭 × 림 × 크랭크 × 케이던스 (기본 구동계·τ). */
function* fixture_walk_mount_geometry() {
  for (const width of WIDTH_SAMPLE) {
    for (const bead of BEAD_SAMPLE) {
      for (const crank of CRANK_SAMPLE) {
        for (const cadence of CADENCE_SAMPLE) yield fixture_build_state({ width, bead, crank, cadence });
      }
    }
  }
}
/** 양 끝 교차: 조작부 여덟 개를 각각 두 끝값으로 (2⁸). */
const fixture_pick_ends = (list) => [list[0], list[list.length - 1]];
function* fixture_walk_mount_ends() {
  for (const first of fixture_pick_ends(RING.ticks)) {
    for (const second of [GEAR_CHAINRING_NONE, RING.ticks[RING.ticks.length - 1]]) {
      for (const cassette of [EDGE_CASSETTES[0], EDGE_CASSETTES[2]]) {
        for (const width of fixture_pick_ends(WIDTH.ticks)) {
          for (const bead of [Math.min(...BEAD_SAMPLE), Math.max(...BEAD_SAMPLE)]) {
            for (const crank of fixture_pick_ends(CRANK.ticks)) {
              for (const cadence of fixture_pick_ends(CADENCE.ticks)) {
                for (const tol of fixture_pick_ends(TOLERANCE.ticks)) {
                  yield { rings: fixture_build_rings(first, second), cassette, width, bead, crank, cadence, tol };
                }
              }
            }
          }
        }
      }
    }
  }
}

// ── 실행 (한 번만 돌리고 분류별 it이 나눠 읽는다) ─────────────

function test_run_display(walks) {
  const tally = test_create_tally();
  for (const walk of walks) {
    for (const state of walk) test_compare_fields(test_label_state(state), fixture_read_display(state), reference_describe_screen(state, false), tally);
  }
  return tally;
}

function test_compare_screen(state, mounted, tally) {
  test_compare_fields(test_label_state(state), fixture_read_screen(mounted), reference_describe_screen(state, true), tally);
}

function test_run_mounted(walks) {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget('');
  try {
    // 처음 뜬 화면(빈 URL)은 기본 상태다.
    test_compare_screen(DEFAULT_STATE, mounted, tally);
    for (const walk of walks) {
      for (const state of walk) {
        tally.fired += fixture_update_controls(mounted, state);
        test_compare_screen(state, mounted, tally);
      }
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return tally;
}

/** 프리셋 버튼을 차례로 눌러 읽는다: 자전거 넷(케이던스·τ는 남는다), 그다음 카세트 셋(앞링은 남는다). */
function test_run_presets() {
  const tally = test_create_tally();
  const start = fixture_build_state({ cadence: CADENCE.ticks[0], tol: TOLERANCE.ticks[TOLERANCE.ticks.length - 1] });
  const mounted = fixture_mount_widget('');
  try {
    tally.fired += fixture_update_controls(mounted, start);
    let expected = start;
    for (const preset of GEAR_BIKE_PRESETS) {
      tally.fired += mounted.dom.listeners_run_event(mounted.presets[preset.key], 'click');
      expected = fixture_build_bike_state(preset, expected);
      test_compare_screen(expected, mounted, tally);
    }
    for (const preset of GEAR_CASSETTE_PRESETS) {
      tally.fired += mounted.dom.listeners_run_event(mounted.presets[preset.key], 'click');
      expected = { ...expected, cassette: preset.teeth.slice() };
      test_compare_screen(expected, mounted, tally);
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  return tally;
}

function test_create_lazy(run) {
  let cached = null;
  return () => {
    if (!cached) cached = run();
    return cached;
  };
}

const STRUCTURE_STATE_COUNT =
  RING.ticks.length * RING_SECOND_TICKS.length *
  (GEAR_CASSETTE_PRESETS.length * TOLERANCE.ticks.length + EDGE_CASSETTES.length * TOLERANCE_SAMPLE.length);
const COMBINATION_CALL_COUNT =
  COVER_DRIVETRAINS.length *
  (GEAR_BEAD_SEAT_CHOICES.length * WIDTH.ticks.length + GEOMETRY_SAMPLE.length * (CRANK.ticks.length + CADENCE.ticks.length));
const MOUNT_DRIVETRAIN_COUNT = RING_FIRST_SAMPLE.length * RING_SECOND_SAMPLE.length * CASSETTE_SAMPLE.length * TOLERANCE_SAMPLE.length;
const MOUNT_GEOMETRY_COUNT = WIDTH_SAMPLE.length * BEAD_SAMPLE.length * CRANK_SAMPLE.length * CADENCE_SAMPLE.length;
const MOUNT_ENDS_COUNT = 2 ** 8;
const MOUNT_TOTAL = 1 + MOUNT_DRIVETRAIN_COUNT + MOUNT_GEOMETRY_COUNT + MOUNT_ENDS_COUNT;

const DISPLAY_RUN = test_create_lazy(() => test_run_display([fixture_walk_structure()]));
const COMBINATION_RUN = test_create_lazy(test_run_combinations);
const MOUNT_RUN = test_create_lazy(() =>
  test_run_mounted([fixture_walk_mount_drivetrain(), fixture_walk_mount_geometry(), fixture_walk_mount_ends()]),
);

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it('표기 규칙: 0.5는 올림, π 한계 두 개가 같은 글자를 낸다', () => {
    expect(frac_format_fixed(frac_read_decimal('31.25'), 1)).toBe('31.3');
    expect(frac_format_fixed(frac_read_decimal('31.2499'), 1)).toBe('31.2');
    expect(frac_format_fixed(frac_read_decimal('3.895'), 2)).toBe('3.90');
    expect(reference_format_share(1, 8)).toBe('13%'); // 12.5 → 13
    expect(reference_format_pi(frac_create(1n), 6)).toBe('3.141593');
    expect(reference_format_pi(frac_create(1n, 1000n), 5)).toBe('0.00314');
    expect(() => reference_round_pi(frac_create(10n ** 50n), 0)).toThrow();
  }, LONG_TIMEOUT_MS);

  it('식: 50×25와 34×17은 같은 비 2이고, 기본 휠(672 mm)·크랭크 172.5에서 손계산과 같다', () => {
    const diameter = reference_calculate_diameter(DEFAULT_STATE.bead, DEFAULT_STATE.width);
    expect(diameter).toBe(672);
    // 2·672/25.4 = 52.913… · 2·336/172.5 = 3.8956… · 2·π·0.672 = 4.2223… · ×90×60/1000 = 22.80…
    for (const [c, s] of [[50, 25], [34, 17]]) {
      expect(reference_format_gear_inches(c, s, diameter)).toBe('52.9');
      expect(reference_format_gain(c, s, diameter, DEFAULT_STATE.crank)).toBe('3.90');
      expect(reference_format_development(c, s, diameter)).toBe('4.22 m');
      expect(reference_format_speed(c, s, diameter, 90)).toBe('22.8');
    }
  }, LONG_TIMEOUT_MS);

  it('중복 경계: 상대차가 정확히 τ면 중복이 아니다 (42×S 대 40×S = 정확히 5%)', () => {
    const structure = reference_read_structure([42, 40], [20]);
    expect(reference_count_duplicates(structure, 50)).toEqual({ removable: 0, distinct: 2, paired: 0 });
    expect(reference_count_duplicates(structure, 55)).toEqual({ removable: 1, distinct: 1, paired: 2 });
    // 같은 비는 상대차 0 — 가장 엄한 τ에서도 중복
    const same = reference_read_structure([50, 34], [25, 17]);
    expect(reference_count_duplicates(same, TOLERANCE.ticks[0]).paired).toBe(2);
  }, LONG_TIMEOUT_MS);

  it('탐욕 걸음: 이미 남긴 기어와만 비교한다 — 지운 기어 옆의 기어는 남는다', () => {
    // 앞 52 × 뒤 [54, 52, 50]: 비 52/54, 1, 52/50. 상대차는 54/52−1 = 3.85%, 52/50−1 = 4%,
    // 54/50−1 = 8%. τ 5%: 가장 낮은 것을 남기고 1은 지우고, 52/50은 남긴 것과 8%라 남는다.
    const structure = reference_read_structure([52], [54, 52, 50]);
    expect(reference_count_duplicates(structure, 50)).toEqual({ removable: 1, distinct: 2, paired: 3 });
  }, LONG_TIMEOUT_MS);

  it('겹침 폭: 같은 앞링 둘이면 100%, 간격이 카세트 폭 이상이면 0%, 앞링 하나면 0%', () => {
    expect(reference_calculate_overlap_percent([50, 50], [11, 28])).toBe(100n);
    expect(reference_calculate_overlap_percent([56, 22], [11, 28])).toBe(0n); // 56/22 > 28/11
    expect(reference_calculate_overlap_percent([50], [11, 28])).toBe(0n);
    expect(reference_calculate_overlap_percent([50, 34], [11])).toBe(0n);
    // 50/34, 11–28: 100·ln(28·34/(11·50)) / ln(28·50/(11·34)) = 41.565…% → 42 (부동소수 교차검산)
    expect(reference_calculate_overlap_percent([50, 34], [11, 28])).toBe(42n);
  }, LONG_TIMEOUT_MS);

  it('축 라벨: 10 이상은 정수, 아래는 유효숫자 3, 사다리 축은 G·10^±0.035', () => {
    expect(reference_format_axis(real_create_power(frac_read_decimal('9.9996'), 1, 0, 1))).toBe('10.00');
    expect(reference_format_axis(real_create_power(frac_read_decimal('10.5'), 1, 0, 1))).toBe('11');
    expect(reference_format_axis(real_create_power(frac_read_decimal('0.12345'), 1, 0, 1))).toBe('0.123');
    // 기본 구동계: 34×28 = 32.13…, 50×11 = 120.26… gear inches → ×10^∓0.035 = 29.64…, 130.35… (부동소수 교차검산)
    expect(reference_describe_ladder_axis(reference_read_structure([50, 34], GEAR_CASSETTE_DEFAULT), 672)).toEqual([
      '30',
      '130',
    ]);
    // 조합 하나: 폭 0 → 최소 폭 0.25데케이드, 52.913…·10^∓0.125 = 39.68…, 70.56…
    expect(reference_describe_ladder_axis(reference_read_structure([50], [25]), 672)).toEqual(['40', '71']);
  }, LONG_TIMEOUT_MS);

  it('격자는 조작부가 스냅하는 값 그대로이고, 기본값·프리셋이 격자 위에 있다', () => {
    expect([RING.ticks.length, WIDTH.ticks.length, CRANK.ticks.length, CADENCE.ticks.length, TOLERANCE.ticks.length]).toEqual([
      41, 48, 11, 71, 17,
    ]);
    for (const tick of RING.ticks) expect(model_clamp_chainring(tick)).toBe(tick);
    for (const tick of WIDTH.ticks) expect(model_clamp_tyre_width(tick)).toBe(tick);
    for (const tick of CRANK.ticks) expect(model_clamp_crank(Number(fixture_build_crank_text(tick)))).toBe(tick / CRANK.scale);
    for (const tick of CADENCE.ticks) expect(model_clamp_cadence(tick)).toBe(tick);
    for (const tick of TOLERANCE.ticks) {
      expect(model_clamp_tolerance(Number(fixture_build_tolerance_text(tick)))).toBe(tick / TOLERANCE.scale);
    }
    for (const state of [DEFAULT_STATE, ...BIKE_STATES]) {
      expect(state.rings.every((teeth) => RING.set.has(teeth))).toBe(true);
      expect(WIDTH.set.has(state.width) && CRANK.set.has(state.crank) && CADENCE.set.has(state.cadence)).toBe(true);
      expect(GEAR_BEAD_SEAT_CHOICES.includes(state.bead) && TOLERANCE.set.has(state.tol)).toBe(true);
    }
    // 조합별 격자가 C 전수 × S 전수를 정확히 한 번씩 덮는다.
    const covered = new Set();
    for (const { rings, cassette } of COVER_DRIVETRAINS) for (const c of rings) for (const s of cassette) covered.add(`${c}/${s}`);
    expect(covered.size).toBe(RING.ticks.length * SPROCKETS.ticks.length);
    expect(EDGE_CASSETTES[2].length).toBe(GEAR_SPROCKET_COUNT_MAX);
  }, LONG_TIMEOUT_MS);
});

// ── 표시 함수 경로 ───────────────────────────────────────────

describe(`표시 함수 — 앞링 전수 × 카세트 × τ (${STRUCTURE_STATE_COUNT}상태)`, () => {
  it('격자가 실제로 돌았다 (상태 수 × 칸 수)', () => {
    const run = DISPLAY_RUN();
    expect(run.count).toBe(STRUCTURE_STATE_COUNT);
    expect(run.compared).toBe(run.count * DISPLAY_FIELD_COUNT);
  }, LONG_TIMEOUT_MS);

  for (const [title, prefixes] of DISPLAY_FAMILIES) {
    it(`${title}: display_*·chart_describe_* 문자열이 오라클과 글자 하나까지 같다`, () => {
      expect(test_summarize(DISPLAY_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }
});

describe(`표시 함수 — 조합별 네 숫자, C 전수 × S 전수 × 지름·크랭크·케이던스 (${COMBINATION_CALL_COUNT}회 호출)`, () => {
  it('격자가 실제로 돌았다 (호출 수 × 조합 수)', () => {
    const run = COMBINATION_RUN();
    const perCall = RING.ticks.length * SPROCKETS.ticks.length;
    expect(run.count).toBe((COMBINATION_CALL_COUNT / COVER_DRIVETRAINS.length) * perCall);
  }, LONG_TIMEOUT_MS);

  for (const [title, field] of [
    ['gear inches (1자리)', 'combo.gear-inches'],
    ['gain ratio (2자리)', 'combo.gain'],
    ['development (2자리 + " m")', 'combo.development'],
    ['속도 (1자리)', 'combo.speed'],
  ]) {
    it(`${title}: display_format_*가 오라클과 같다`, () => {
      expect(test_summarize(COMBINATION_RUN(), [field])).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }
});

// ── 마운트 경로 ──────────────────────────────────────────────

describe(`마운트한 화면 — 조작부를 실제로 옮겨 읽는다 (${MOUNT_TOTAL}상태)`, () => {
  it('격자가 실제로 돌았다 — change 리스너가 불리지 않았으면 읽기는 첫 화면의 재탕이다', () => {
    const run = MOUNT_RUN();
    expect(run.count).toBe(MOUNT_TOTAL);
    expect(run.fired).toBe(run.count - 1);
    expect(run.compared).toBeGreaterThanOrEqual(run.count * (SCREEN_FIXED_FIELD_COUNT + TABLE_COLUMN_COUNT));
  }, LONG_TIMEOUT_MS);

  for (const [title, prefixes] of [
    ['손잡이·입력칸 옆 글자 (output·aria-valuetext)', ['slider.']],
    ...DISPLAY_FAMILIES,
    ['표 (이름·네 숫자·속도 머리칸·Near twin)', ['table.']],
    ['범례 두 줄 묶음', ['legend.']],
    ['프리셋 눌림 표시 (aria-pressed)', ['preset.']],
  ]) {
    it(`${title}: 화면 글자가 오라클과 같다`, () => {
      expect(test_summarize(MOUNT_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }

  it('프리셋 버튼(자전거 4 + 카세트 3)을 누른 화면이 오라클과 같다', () => {
    const run = test_run_presets();
    expect(run.count).toBe(GEAR_BIKE_PRESETS.length + GEAR_CASSETTE_PRESETS.length);
    expect(run.fired).toBe(1 + run.count);
    expect(test_summarize(run, [''])).toEqual(CLEAN);
  }, LONG_TIMEOUT_MS);

  it('URL로 뜬 화면: 작은 림·가장 넓은 폭·가장 짧은 크랭크·최대 케이던스·최대 τ, 앞링 하나', () => {
    const state = {
      rings: [RING.ticks[RING.ticks.length - 1]],
      cassette: EDGE_CASSETTES[2],
      width: WIDTH.ticks[WIDTH.ticks.length - 1],
      bead: Math.min(...GEAR_BEAD_SEAT_CHOICES),
      crank: CRANK.ticks[0],
      cadence: CADENCE.ticks[CADENCE.ticks.length - 1],
      tol: TOLERANCE.ticks[TOLERANCE.ticks.length - 1],
    };
    const search =
      `?cr1=${state.rings[0]}&cr2=${GEAR_CHAINRING_NONE}&cs=${state.cassette.join(',')}&w=${state.width}` +
      `&bsd=${state.bead}&l=${fixture_build_crank_text(state.crank)}&n=${state.cadence}` +
      `&tau=${fixture_build_tolerance_text(state.tol)}`;
    const mounted = fixture_mount_widget(search);
    try {
      const tally = test_create_tally();
      test_compare_screen(state, mounted, tally);
      expect(test_summarize(tally, [''])).toEqual(CLEAN);
      mounted.widget_reset();
    } finally {
      mounted.dom.restore();
    }
  }, LONG_TIMEOUT_MS);
});
