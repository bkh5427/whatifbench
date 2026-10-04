/**
 * 속도 vs 절약 시간 — **화면에 찍히는 숫자 문자열**을 독립 오라클과 대조한다 (규칙 L-ORACLE).
 *
 * 이 파일이 막으려는 사고는 한 종류다: **표시 단계가 값을 바꾼다.**
 * 모델이 옳은 초를 내도 카드·판정문·막대·표·캡션에 틀린 글자가 찍히면 독자가 읽는 것은
 * 그 글자다. 곡선과 판정 색은 그대로라서 화면에는 아무 흔적이 없다.
 *
 * 검사 방식:
 *   ⓐ 오라클은 model.js의 **어떤 계산 함수도 쓰지 않는다.** 식을 여기서 다시 쓴다:
 *      · 이동 시간   t(v) = d·3600/v 초 (거리 단위 d, 속도 단위 = 같은 거리 단위/시)
 *      · 절약 시간   Δt = d·3600·(v₂ − v₁)/(v₁·v₂) — 모델은 t(v₁) − t(v₂) 꼴로 뺀다. 다른 식이다.
 *      · 총 시간     t(v) + T,  비율 Δt/(t(v₁) + T)
 *      · 천장 몫     (v₂ − v₁)/v₂ — 모델은 Δt/t(v₁)로 나눈다. 다른 식이다.
 *      · 단위 환산   1 km = 1000 m, 1 mi = 1609.344 m (정의값, 이 파일에 따로 적는다)
 *      model.js에서는 **데이터만** 읽는다: 거리 사다리, km/h 슬라이더 범위, 지연 범위·기본값,
 *      기본 속도, 판정 문턱, 표의 출발 속도·증분. mph 슬라이더 범위는 km/h 범위에서
 *      **정확 연산으로 따로 유도**하고 모델의 값과 맞는지 앵커에서 본다.
 *      프리셋은 widget.js의 PRESETS를 데이터로 읽는다.
 *      model_calculate_result는 **피검 대상**으로만 부른다(표시 함수 경로의 입력). 오라클은 안 쓴다.
 *   ⓑ 연산은 BigInt 분자/분모 **정확 유리수**다. 반올림은 정수 나눗셈 한 번(0.5는 올림 —
 *      `toFixed`·`Math.round`의 명세)이고, 부호는 정확한 값에서 정한다(이 위젯의 값은 전부 양수다).
 *      판정 문턱(비율 ≥ 0.25 / ≥ 0.1)도 유리수끼리 비교한다.
 *   ⓒ 표기 명세 (widget.js의 display_* 함수를 읽고 여기에 **따로** 적는다 — 위젯이 바꾸면 걸리는 것이 맞다):
 *      · 분: 반올림 **전** 값이 1 미만이면 3자리, 10 미만이면 2자리, 아니면 1자리
 *      · 초 0자리 · 백분율 1자리 + "%" · 속도 0자리 + " km/h"/" mph"
 *      · 거리: 유효숫자 6자리로 반올림한 뒤 끝의 0과 소수점을 지운다 + " km"/" mi"
 *      · 축 끝값: max(천장 분 × 1.08, 0.01)을 유효숫자 3자리(소수 최대 3자리), 0이면 "0"
 *      · 가로축 끝: v₁(표시 단위)과 min(160 km/h, 이 단위 슬라이더 상한)을 정수로 반올림
 *      · "minute"/"minutes"는 **찍힌 숫자**가 정확히 1일 때만 단수, 지연 "N min"/"N mins"도 같다
 *   ⓓ 피검 대상은 두 경로다.
 *      · 표시 함수 경로: export된 display_* 함수에 model_calculate_result 결과를 넣은 문자열.
 *        **전 격자**: 두 단위 × 거리 14칸 × 속도 쌍 전부 × 지연 31칸.
 *        단위 토글 뒤(설정한 단위 ≠ 표시 단위)의 속도·거리·판정문은 지연 양 끝에서 전 (d, v₁, v₂).
 *      · 마운트 경로: 위젯을 DOM 스텁에 실제로 붙이고 슬라이더를 옮겨 change를 발화시킨 뒤
 *        슬라이더 출력·카드·판정·막대·표·범례 캡션·캔버스 aria-label·프리셋 라벨/눌림을 읽는다.
 *        축소 격자: 슬라이더마다 양 끝·기본값·모든 프리셋 값·표의 출발 속도(강조 행),
 *        두 단위 모두, 그리고 단위 토글(설정 단위 → 다른 단위 → 원래 단위)과 프리셋 버튼 클릭.
 */
import { describe, it, expect } from 'vitest';
import {
  UNIT_KMH,
  UNIT_MPH,
  UNIT_KEYS,
  SPEED_UNITS,
  DISTANCE_LADDER,
  DISTANCE_DEFAULT_UNITS,
  SPEED_FROM_DEFAULT_MS,
  SPEED_TO_DEFAULT_MS,
  DELAY_MIN_MINUTES,
  DELAY_MAX_MINUTES,
  DELAY_STEP_MINUTES,
  DELAY_DEFAULT_MINUTES,
  VERDICT_BREAK_MIN_SHARE,
  VERDICT_EDGE_MIN_SHARE,
  SECONDS_PER_MINUTE,
  model_calculate_speed_range,
  model_calculate_result,
} from './model.js';
import {
  PRESETS,
  PRESET_KEYS,
  widget_mount,
  display_format_minutes,
  display_format_seconds,
  display_format_percent_number,
  display_format_percent,
  display_format_speed,
  display_format_distance,
  display_format_axis_minutes,
  display_describe_verdict,
  chart_calculate_scale,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

// ── 정확 유리수 ──────────────────────────────────────────────
/** { n, d } — d > 0. 약분하지 않는다(비교·반올림은 교차곱과 정수 나눗셈이라 필요 없다). */
const frac_create = (n, d = 1n) => {
  const num = BigInt(n);
  const den = BigInt(d);
  return den < 0n ? { n: -num, d: -den } : { n: num, d: den };
};

/** 십진 문자열 → 정확한 분자/분모. 지수 표기는 받지 않는다(받을 일이 없다). */
function frac_read_decimal(text) {
  const found = String(text).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!found) throw new Error(`십진 표기가 아니다: ${text}`);
  const fraction = found[3] ?? '';
  const n = BigInt(found[2] + fraction);
  return frac_create(found[1] === '-' ? -n : n, 10n ** BigInt(fraction.length));
}

const frac_add = (left, right) => frac_create(left.n * right.d + right.n * left.d, left.d * right.d);
const frac_subtract = (left, right) => frac_create(left.n * right.d - right.n * left.d, left.d * right.d);
const frac_multiply = (left, right) => frac_create(left.n * right.n, left.d * right.d);
const frac_divide = (left, right) => frac_create(left.n * right.d, left.d * right.n);
/** left − right의 부호. */
const frac_compare = (left, right) => {
  const cross = left.n * right.d - right.n * left.d;
  return cross > 0n ? 1 : cross < 0n ? -1 : 0;
};
const frac_read_power = (exponent) =>
  exponent >= 0 ? frac_create(10n ** BigInt(exponent)) : frac_create(1n, 10n ** BigInt(-exponent));

/** 양수 x의 ⌊log₁₀ x⌋. 부동소수 추정에서 출발해 정확 비교로 고친다. */
function frac_read_decade(value) {
  let exponent = Math.floor(Math.log10(Number(value.n) / Number(value.d)));
  if (!Number.isFinite(exponent)) exponent = 0;
  while (frac_compare(frac_read_power(exponent), value) > 0) exponent -= 1;
  while (frac_compare(frac_read_power(exponent + 1), value) <= 0) exponent += 1;
  return exponent;
}

/** |값|을 소수 digits자리로 반올림한 정수(= |값|×10^digits). 0.5는 올린다. */
function frac_round_fixed(value, digits) {
  const size = value.n < 0n ? -value.n : value.n;
  return (2n * size * 10n ** BigInt(digits) + value.d) / (2n * value.d);
}

/** 정수 scaled(= 값×10^digits)를 소수 digits자리 고정 문자열로. */
function frac_format_scaled(scaled, digits) {
  const body = scaled.toString();
  if (digits === 0) return body;
  const padded = body.padStart(digits + 1, '0');
  return `${padded.slice(0, padded.length - digits)}.${padded.slice(padded.length - digits)}`;
}

/** 고정 자리 문자열. 부호는 **정확한 값**에서 붙인다 — 반올림해 0이 된 음수도 "-"를 단다(toFixed 명세). */
const frac_format_fixed = (value, digits) =>
  `${value.n < 0n ? '-' : ''}${frac_format_scaled(frac_round_fixed(value, digits), digits)}`;

// ── 오라클 상수 (정의값 — model.js와 따로 적는다) ────────────
const REFERENCE_SECONDS_PER_HOUR = frac_create(3600n);
const REFERENCE_SECONDS_PER_MINUTE = frac_create(60n);
const REFERENCE_PERCENT = frac_create(100n);
/** 거리 단위 하나가 몇 m인가. 국제 마일은 0.3048 m 피트에서 나오는 정확한 값이다. */
const REFERENCE_METRES = {
  [UNIT_KMH]: frac_create(1000n),
  [UNIT_MPH]: frac_read_decimal('1609.344'),
};
const REFERENCE_SPEED_LABEL = { [UNIT_KMH]: 'km/h', [UNIT_MPH]: 'mph' };
const REFERENCE_DISTANCE_LABEL = { [UNIT_KMH]: 'km', [UNIT_MPH]: 'mi' };
const REFERENCE_OTHER_UNIT = { [UNIT_KMH]: UNIT_MPH, [UNIT_MPH]: UNIT_KMH };

/** 판정 문턱은 편집 판단이라 model.js에서 데이터로 읽는다 — 십진 문자열 → 정확 유리수. */
const REFERENCE_BREAK_SHARE = frac_read_decimal(String(VERDICT_BREAK_MIN_SHARE));
const REFERENCE_EDGE_SHARE = frac_read_decimal(String(VERDICT_EDGE_MIN_SHARE));

// ── 오라클 표기 명세 ─────────────────────────────────────────
const REFERENCE_MINUTE_SMALL = frac_create(1n);
const REFERENCE_MINUTE_MEDIUM = frac_create(10n);
const REFERENCE_MINUTE_DIGITS = { small: 3, medium: 2, large: 1 };
const REFERENCE_PERCENT_DIGITS = 1;
const REFERENCE_DISTANCE_SIGNIFICANT = 6;
const REFERENCE_AXIS_SIGNIFICANT = 3;
const REFERENCE_AXIS_DECIMALS_MAX = 3;
const REFERENCE_AXIS_HEADROOM = frac_read_decimal('1.08');
const REFERENCE_AXIS_MIN_MINUTES = frac_read_decimal('0.01');

const REFERENCE_VERDICT_HEADLINE = {
  hold: 'The model returns a small slice of the trip.',
  edge: 'The model returns a noticeable slice of the trip.',
  break: 'The model returns a large slice of the trip.',
};
const REFERENCE_LEGEND_KEY =
  'Solid = minutes saved by the raised speed. Dashed = the ceiling d/v₁, the whole moving time of the original trip.';
const REFERENCE_ARIA_LEAD =
  'Time saved against the raised speed, rising toward the ceiling without reaching it.';

// ── 오라클 표기 ──────────────────────────────────────────────

/** 분. 자리수는 **반올림 전** 정확한 값으로 고른다. 단수 여부는 찍힌 숫자가 정확히 1인가. */
function reference_format_minutes(value) {
  const digits =
    frac_compare(value, REFERENCE_MINUTE_SMALL) < 0
      ? REFERENCE_MINUTE_DIGITS.small
      : frac_compare(value, REFERENCE_MINUTE_MEDIUM) < 0
        ? REFERENCE_MINUTE_DIGITS.medium
        : REFERENCE_MINUTE_DIGITS.large;
  const scaled = frac_round_fixed(value, digits);
  return { text: frac_format_fixed(value, digits), isOne: value.n > 0n && scaled === 10n ** BigInt(digits) };
}
const reference_format_minutes_text = (value) => reference_format_minutes(value).text;

const reference_format_percent_number = (share) =>
  frac_format_fixed(frac_multiply(share, REFERENCE_PERCENT), REFERENCE_PERCENT_DIGITS);
const reference_format_percent = (share) => `${reference_format_percent_number(share)}%`;

const reference_format_speed = (speed, unitKey) => `${frac_format_fixed(speed, 0)} ${REFERENCE_SPEED_LABEL[unitKey]}`;

/** 유효숫자 6자리 → 끝의 0·소수점 제거. 자리수는 반올림 전 값의 자릿수로 고른다. */
function reference_format_distance(distance, unitKey) {
  const digits = Math.max(0, REFERENCE_DISTANCE_SIGNIFICANT - 1 - frac_read_decade(distance));
  let text = frac_format_fixed(distance, digits);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return `${text} ${REFERENCE_DISTANCE_LABEL[unitKey]}`;
}

function reference_format_axis(minutes) {
  if (minutes.n === 0n) return '0';
  const decimals = Math.max(0, REFERENCE_AXIS_SIGNIFICANT - 1 - frac_read_decade(minutes));
  return frac_format_fixed(minutes, Math.min(decimals, REFERENCE_AXIS_DECIMALS_MAX));
}

const reference_describe_delay = (minutes) => `${minutes} ${Math.abs(minutes) === 1 ? 'min' : 'mins'}`;

// ── 오라클 식 ────────────────────────────────────────────────

/** km/h 범위는 데이터다. 정수 눈금인지 확인한다(아니면 아래 유도가 무의미하다). */
const RANGE_KMH = model_calculate_speed_range(UNIT_KMH);

/**
 * mph 슬라이더 범위를 km/h 범위에서 **정확 연산으로** 유도한다 — SI 유효범위의 안쪽으로 맞춘다.
 * 아래 끝·간격은 올림(그 속도 이상), 위 끝은 내림(그 속도 이하).
 */
function reference_calculate_range(unitKey) {
  const step = SPEED_UNITS[unitKey].speedStep;
  const perHour = (value, key) => frac_multiply(frac_create(value), REFERENCE_METRES[key]);
  const pick = (kmhValue, upward) => {
    const limit = perHour(kmhValue, UNIT_KMH);
    let tick = 0;
    if (upward) {
      while (frac_compare(perHour(tick, unitKey), limit) < 0) tick += step;
    } else {
      while (frac_compare(perHour(tick + step, unitKey), limit) <= 0) tick += step;
    }
    return tick;
  };
  return {
    step,
    fromMin: pick(RANGE_KMH.fromMin, true),
    fromMax: pick(RANGE_KMH.fromMax, false),
    toMax: pick(RANGE_KMH.toMax, false),
    gap: pick(RANGE_KMH.gap, true),
  };
}
const REFERENCE_RANGE = { [UNIT_KMH]: RANGE_KMH, [UNIT_MPH]: reference_calculate_range(UNIT_MPH) };

/** 속도를 m/h로 (단위 비교용). */
const reference_calculate_metres_per_hour = (speed, unitKey) => frac_multiply(speed, REFERENCE_METRES[unitKey]);

/** set 단위로 적힌 값을 show 단위로. */
const reference_calculate_shown = (value, setKey, showKey) =>
  frac_divide(frac_multiply(value, REFERENCE_METRES[setKey]), REFERENCE_METRES[showKey]);

/**
 * 한 트립의 정확한 값. 거리와 속도는 **같은 단위계**(거리 단위, 거리 단위/시)의 유리수다.
 * 지연에 의존하지 않는 부분과 의존하는 부분을 나눠 둔다 — 격자에서 지연을 안쪽 루프로 돌린다.
 */
function reference_calculate_moving(distance, speedFrom, speedTo) {
  const toMinutes = (seconds) => frac_divide(seconds, REFERENCE_SECONDS_PER_MINUTE);
  const movingFromSeconds = frac_divide(frac_multiply(distance, REFERENCE_SECONDS_PER_HOUR), speedFrom);
  const movingToSeconds = frac_divide(frac_multiply(distance, REFERENCE_SECONDS_PER_HOUR), speedTo);
  // Δt = d·3600·(v₂ − v₁)/(v₁·v₂) — 뺄셈 꼴이 아니라 한 분수로.
  const savedSeconds = frac_divide(
    frac_multiply(frac_multiply(distance, REFERENCE_SECONDS_PER_HOUR), frac_subtract(speedTo, speedFrom)),
    frac_multiply(speedFrom, speedTo),
  );
  return {
    movingFrom: toMinutes(movingFromSeconds),
    movingTo: toMinutes(movingToSeconds),
    savedSeconds,
    saved: toMinutes(savedSeconds),
    ceilingShare: frac_divide(frac_subtract(speedTo, speedFrom), speedTo),
  };
}

function reference_calculate_delayed(moving, delayMinutes) {
  const delay = frac_create(delayMinutes);
  const totalFrom = frac_add(moving.movingFrom, delay);
  const totalTo = frac_add(moving.movingTo, delay);
  const share = frac_divide(moving.saved, totalFrom);
  const verdict =
    frac_compare(share, REFERENCE_BREAK_SHARE) >= 0
      ? 'break'
      : frac_compare(share, REFERENCE_EDGE_SHARE) >= 0
        ? 'edge'
        : 'hold';
  return { delay, totalFrom, totalTo, share, verdict };
}

/**
 * 상태: { set, show, distance, from, to, delay } — distance·from·to는 **set 단위**의 정수,
 * show는 화면 단위. 단위 토글은 SI 상태를 그대로 두고 표시만 바꾸므로 set ≠ show가 생긴다.
 * 지연과 무관한 글자를 여기서 만든다.
 */
function reference_describe_base(state) {
  const distance = frac_create(state.distance);
  const from = frac_create(state.from);
  const to = frac_create(state.to);
  const moving = reference_calculate_moving(distance, from, to);
  const saved = reference_format_minutes(moving.saved);
  const axisTop = frac_multiply(moving.movingFrom, REFERENCE_AXIS_HEADROOM);
  const axisHigh = frac_compare(axisTop, REFERENCE_AXIS_MIN_MINUTES) >= 0 ? axisTop : REFERENCE_AXIS_MIN_MINUTES;
  return {
    state,
    moving,
    savedText: saved.text,
    savedWord: saved.isOne ? 'minute' : 'minutes',
    secondsText: frac_format_fixed(moving.savedSeconds, 0),
    movingFromText: reference_format_minutes_text(moving.movingFrom),
    ceilingShareText: reference_format_percent(moving.ceilingShare),
    speedFromText: reference_format_speed(reference_calculate_shown(from, state.set, state.show), state.show),
    speedToText: reference_format_speed(reference_calculate_shown(to, state.set, state.show), state.show),
    distanceText: reference_format_distance(reference_calculate_shown(distance, state.set, state.show), state.show),
    axisHighText: reference_format_axis(axisHigh),
  };
}

/** 지연까지 넣은 글자 — 판정 상태·머리문장·세부문장과 카드 값. */
function reference_describe_trip(base, delayMinutes) {
  const delayed = reference_calculate_delayed(base.moving, delayMinutes);
  const tripText = reference_format_minutes_text(delayed.totalFrom);
  const tripToText = reference_format_minutes_text(delayed.totalTo);
  const shareText = reference_format_percent(delayed.share);
  const delayNote =
    delayMinutes > 0
      ? ` Of that trip, ${reference_format_minutes_text(delayed.delay)} minutes are the fixed delay, which sits in ` +
        `both scenarios and cancels out of the subtraction — the minutes saved do not move when you drag it, ` +
        `only their share does.`
      : ' With no fixed delay entered, the whole trip is moving time.';
  return {
    delayed,
    tripText,
    tripToText,
    shareNumberText: reference_format_percent_number(delayed.share),
    verdict: delayed.verdict,
    headline:
      `${REFERENCE_VERDICT_HEADLINE[delayed.verdict]} It puts the saving at ${base.savedText} ${base.savedWord}, ` +
      `${shareText} of the ${tripText}-minute trip.`,
    detail:
      `Over ${base.distanceText}, going from ${base.speedFromText} to ${base.speedToText} takes the trip from ` +
      `${tripText} to ${tripToText} minutes. No speed at all could save more than ${base.movingFromText} minutes ` +
      `here, the whole moving time of the original trip, and this setting takes ${base.ceilingShareText} of it.` +
      delayNote,
  };
}

/** 표시 함수 경로가 비교하는 칸. */
function reference_describe_display(base, trip) {
  return {
    'verdict.state': trip.verdict,
    'verdict.headline': trip.headline,
    'verdict.detail': trip.detail,
    'card.saved': base.savedText,
    'card.seconds': base.secondsText,
    'card.share': trip.shareNumberText,
    'card.before': trip.tripText,
    'card.after': trip.tripToText,
    'card.ceiling': base.movingFromText,
    'card.ceiling-share': base.ceilingShareText,
    'axis.high': base.axisHighText,
    'slider.from': base.speedFromText,
    'slider.to': base.speedToText,
    'slider.distance': base.distanceText,
  };
}

/** 이 단위의 SI 유효범위 안인가 (표의 행 거르기). 경계는 km/h 범위 데이터에서. */
function reference_check_row(startUnits, toUnits, unitKey) {
  const perHour = (value, key) => reference_calculate_metres_per_hour(frac_create(value), key);
  const from = perHour(startUnits, unitKey);
  const to = perHour(toUnits, unitKey);
  return (
    frac_compare(from, perHour(RANGE_KMH.fromMin, UNIT_KMH)) >= 0 &&
    frac_compare(from, perHour(RANGE_KMH.fromMax, UNIT_KMH)) <= 0 &&
    frac_compare(to, perHour(RANGE_KMH.toMax, UNIT_KMH)) <= 0 &&
    frac_compare(to, from) > 0
  );
}

/** 마운트 경로가 비교하는 화면 전체. */
function reference_describe_screen(state) {
  const base = reference_describe_base(state);
  const trip = reference_describe_trip(base, state.delay);
  const show = state.show;
  const want = {};

  want['slider.distance'] = base.distanceText;
  want['slider.distance-valuetext'] = base.distanceText;
  want['slider.from'] = base.speedFromText;
  want['slider.from-valuetext'] = base.speedFromText;
  want['slider.to'] = base.speedToText;
  want['slider.to-valuetext'] = base.speedToText;
  want['slider.delay'] = reference_describe_delay(state.delay);
  want['slider.delay-valuetext'] = reference_describe_delay(state.delay);

  want['card.saved'] = base.savedText;
  want['card.saved-unit'] = `min (${base.secondsText} s)`;
  want['card.share'] = trip.shareNumberText;
  want['card.share-unit'] = `% of the ${trip.tripText} min trip`;
  want['card.before'] = trip.tripText;
  want['card.before-unit'] = `min at ${base.speedFromText}`;
  want['card.after'] = trip.tripToText;
  want['card.after-unit'] = `min at ${base.speedToText}`;
  want['card.ceiling'] = base.movingFromText;
  want['card.ceiling-unit'] = `min — this setting takes ${base.ceilingShareText}`;

  want['verdict.state'] = trip.verdict;
  want['verdict.headline'] = trip.headline;
  want['verdict.detail'] = trip.detail;

  want['bar.from-label'] = `At ${base.speedFromText}`;
  want['bar.from-value'] = `${trip.tripText} min`;
  want['bar.from-share'] = `${base.movingFromText} moving`;
  want['bar.to-label'] = `At ${base.speedToText}`;
  want['bar.to-value'] = `${trip.tripToText} min`;
  want['bar.to-share'] = `${base.savedText} min shorter`;
  want['bar.note'] =
    `Both bars are drawn against the same total, the ${trip.tripText}-minute trip, so the empty space at the end ` +
    `of the lower bar is the time saved. The solid segment is moving time and the hatched segment is the fixed ` +
    `delay; the hatched segment is identical in both bars, which is the cancellation in the formula drawn out. ` +
    `Only the solid segment ever shrinks.`;

  // ── 표: 표시 단위의 출발 속도·증분, 거리는 show 단위로 옮긴 정확한 값 ──
  const unit = SPEED_UNITS[show];
  const distanceShown = reference_calculate_shown(frac_create(state.distance), state.set, show);
  const fromSet = reference_calculate_metres_per_hour(frac_create(state.from), state.set);
  const toSet = reference_calculate_metres_per_hour(frac_create(state.to), state.set);
  const marked = [];
  let rowIndex = 0;
  for (const startUnits of unit.tableStarts) {
    const toUnits = startUnits + unit.tableIncrease;
    if (!reference_check_row(startUnits, toUnits, show)) continue;
    const moving = reference_calculate_moving(distanceShown, frac_create(startUnits), frac_create(toUnits));
    const delayed = reference_calculate_delayed(moving, state.delay);
    want[`table.r${rowIndex}.c0`] = `${startUnits} ${REFERENCE_SPEED_LABEL[show]}`;
    want[`table.r${rowIndex}.c1`] = `${toUnits} ${REFERENCE_SPEED_LABEL[show]}`;
    want[`table.r${rowIndex}.c2`] = `${reference_format_minutes_text(moving.saved)} min`;
    want[`table.r${rowIndex}.c3`] = reference_format_percent(delayed.share);
    const current =
      frac_compare(reference_calculate_metres_per_hour(frac_create(startUnits), show), fromSet) === 0 &&
      frac_compare(reference_calculate_metres_per_hour(frac_create(toUnits), show), toSet) === 0;
    if (current) marked.push(rowIndex);
    rowIndex += 1;
  }
  want['table.rows'] = String(rowIndex);
  want['table.marked'] = marked.length ? marked.join(',') : 'none';
  want['table.note'] =
    `Every row is the same increase of ${unit.tableIncrease} ${REFERENCE_SPEED_LABEL[show]} over the same ` +
    `${base.distanceText}, and only the starting speed differs. The minutes column is what the model returns for ` +
    `that increase; the share column is that saving against the whole trip, so it is the only column the ` +
    `fixed-delay slider moves.` +
    (marked.length > 0 ? ' The marked row is the pair the sliders are set to.' : '');

  // ── 범례 캡션: 세로축 0–끝값, 가로축 v₁–min(160 km/h, 상한) ──
  const speedLow = reference_calculate_shown(frac_create(state.from), state.set, show);
  const ceilingTop = reference_calculate_shown(frac_create(RANGE_KMH.toMax), UNIT_KMH, show);
  const rangeTop = frac_create(REFERENCE_RANGE[show].toMax);
  const speedHigh = frac_compare(ceilingTop, rangeTop) <= 0 ? ceilingTop : rangeTop;
  want['axis.legend'] =
    `${REFERENCE_LEGEND_KEY} Vertical axis 0–${base.axisHighText} minutes, horizontal axis ` +
    `${frac_format_fixed(speedLow, 0)}–${frac_format_fixed(speedHigh, 0)} ${REFERENCE_SPEED_LABEL[show]}, ` +
    `both linear. The vertical axis rescales with the distance and starting-speed sliders and the horizontal axis ` +
    `with the starting-speed slider and the “Units on screen” setting, so read them before comparing two ` +
    `settings. The dotted vertical line marks ` +
    `the raised speed the cards use. The curve approaches the dashed ceiling and never reaches it.`;
  want['axis.aria'] = `${REFERENCE_ARIA_LEAD} ${trip.headline} ${trip.detail}`;

  // ── 프리셋: 라벨은 표시 단위의 숫자, 눌림은 SI 상태가 정확히 같을 때만 ──
  for (const preset of PRESETS[show]) {
    const delayText = preset.delay > 0 ? ` +${preset.delay} min` : '';
    want[`preset.${preset.key}`] =
      `${preset.name} · ${preset.distance} ${REFERENCE_DISTANCE_LABEL[show]}, ${preset.from}→${preset.to}${delayText}`;
    const same =
      frac_compare(
        reference_calculate_metres_per_hour(frac_create(preset.distance), show),
        reference_calculate_metres_per_hour(frac_create(state.distance), state.set),
      ) === 0 &&
      frac_compare(reference_calculate_metres_per_hour(frac_create(preset.from), show), fromSet) === 0 &&
      frac_compare(reference_calculate_metres_per_hour(frac_create(preset.to), show), toSet) === 0 &&
      preset.delay === state.delay;
    want[`preset.${preset.key}-pressed`] = String(same);
  }
  return want;
}

// ── 격자 ────────────────────────────────────────────────────

const enum_build_ticks = (low, high, step) => {
  const out = [];
  for (let value = low; value <= high; value += step) out.push(value);
  return out;
};
const enum_pick_unique = (list) => [...new Set(list)].sort((left, right) => left - right);

const DELAY_TICKS = enum_build_ticks(DELAY_MIN_MINUTES, DELAY_MAX_MINUTES, DELAY_STEP_MINUTES);
const DELAY_ENDS = [DELAY_MIN_MINUTES, DELAY_MAX_MINUTES];

/** 기본 속도(SI 데이터)를 km/h 눈금 정수로 읽는다. 눈금 위가 아니면 앵커가 잡는다. */
const DEFAULT_FROM_KMH = Math.round(SPEED_FROM_DEFAULT_MS / SPEED_UNITS[UNIT_KMH].msPerSpeed);
const DEFAULT_TO_KMH = Math.round(SPEED_TO_DEFAULT_MS / SPEED_UNITS[UNIT_KMH].msPerSpeed);

/** 기본 상태(로드 직후). 거리·속도는 km 단위, 표시도 km/h. */
const DEFAULT_STATE = {
  set: UNIT_KMH,
  show: UNIT_KMH,
  distance: DISTANCE_DEFAULT_UNITS,
  from: DEFAULT_FROM_KMH,
  to: DEFAULT_TO_KMH,
  delay: DELAY_DEFAULT_MINUTES,
};

/** 이 단위의 눈금 위에서 정확한 값에 가장 가까운 칸(기본 상태를 mph 슬라이더에 올렸을 때의 손잡이). */
function enum_read_nearest_tick(kmhValue, unitKey) {
  const step = REFERENCE_RANGE[unitKey].step;
  const exact = reference_calculate_shown(frac_create(kmhValue), UNIT_KMH, unitKey);
  return Number(frac_round_fixed(frac_divide(exact, frac_create(step)), 0)) * step;
}

function enum_build_speed_pairs(unitKey) {
  const range = REFERENCE_RANGE[unitKey];
  const pairs = [];
  for (const from of enum_build_ticks(range.fromMin, range.fromMax, range.step)) {
    for (const to of enum_build_ticks(from + range.gap, range.toMax, range.step)) pairs.push([from, to]);
  }
  return pairs;
}
const SPEED_PAIRS = Object.fromEntries(UNIT_KEYS.map((key) => [key, enum_build_speed_pairs(key)]));

/** 마운트 격자의 대표값 — 양 끝·기본값·프리셋·표의 출발 속도. */
function enum_build_samples(unitKey) {
  const range = REFERENCE_RANGE[unitKey];
  const unit = SPEED_UNITS[unitKey];
  const presets = PRESETS[unitKey];
  const distances = enum_pick_unique([
    DISTANCE_LADDER[0],
    DISTANCE_LADDER[DISTANCE_LADDER.length - 1],
    DISTANCE_DEFAULT_UNITS,
    ...presets.map((preset) => preset.distance),
  ]);
  const froms = enum_pick_unique([
    range.fromMin,
    range.fromMax,
    enum_read_nearest_tick(DEFAULT_FROM_KMH, unitKey),
    ...presets.map((preset) => preset.from),
    ...unit.tableStarts,
  ]).filter((from) => from >= range.fromMin && from <= range.fromMax);
  const toCandidates = [
    range.toMax,
    enum_read_nearest_tick(DEFAULT_TO_KMH, unitKey),
    ...presets.map((preset) => preset.to),
  ];
  const delays = enum_pick_unique([
    DELAY_MIN_MINUTES,
    DELAY_MAX_MINUTES,
    DELAY_DEFAULT_MINUTES,
    DELAY_STEP_MINUTES,
    ...presets.map((preset) => preset.delay),
  ]);
  const pairs = [];
  for (const from of froms) {
    const tos = enum_pick_unique([from + range.gap, from + unit.tableIncrease, ...toCandidates]);
    for (const to of tos) if (to >= from + range.gap && to <= range.toMax) pairs.push([from, to]);
  }
  return { distances, pairs, delays };
}
const SAMPLES = Object.fromEntries(UNIT_KEYS.map((key) => [key, enum_build_samples(key)]));

// ── 표시 함수 경로 ───────────────────────────────────────────

/** SI 상태 — 위젯의 state_read_sliders와 같은 곱셈(값 × 단위 계수)이다. */
function fixture_build_si(state) {
  const unit = SPEED_UNITS[state.set];
  return {
    distanceMetres: state.distance * unit.metresPerDistance,
    speedFromMs: state.from * unit.msPerSpeed,
    speedToMs: state.to * unit.msPerSpeed,
    delaySeconds: state.delay * SECONDS_PER_MINUTE,
  };
}

function fixture_read_display(state) {
  const si = fixture_build_si(state);
  const result = model_calculate_result(si.distanceMetres, si.speedFromMs, si.speedToMs, si.delaySeconds);
  const spoken = display_describe_verdict(result, state.show);
  const ceilingMinutes = result.ceilingSeconds / SECONDS_PER_MINUTE;
  return {
    'verdict.state': spoken.verdict,
    'verdict.headline': spoken.headline,
    'verdict.detail': spoken.detail,
    'card.saved': display_format_minutes(result.savedSeconds / SECONDS_PER_MINUTE),
    'card.seconds': display_format_seconds(result.savedSeconds),
    'card.share': display_format_percent_number(result.savedShare),
    'card.before': display_format_minutes(result.totalFromSeconds / SECONDS_PER_MINUTE),
    'card.after': display_format_minutes(result.totalToSeconds / SECONDS_PER_MINUTE),
    'card.ceiling': display_format_minutes(ceilingMinutes),
    'card.ceiling-share': display_format_percent(result.ceilingShare),
    'axis.high': display_format_axis_minutes(chart_calculate_scale(ceilingMinutes).high),
    'slider.from': display_format_speed(result.speedFromMs, state.show),
    'slider.to': display_format_speed(result.speedToMs, state.show),
    'slider.distance': display_format_distance(result.distanceMetres, state.show),
  };
}

// ── 마운트 경로 ──────────────────────────────────────────────

const SLIDER_NAMES = ['distance', 'from', 'to', 'delay'];
const STUB_WIDTH_PX = 900;

function fixture_mount_widget() {
  const dom = fixture_create_dom({ search: '', width: STUB_WIDTH_PX });
  dom.install();
  const widget_reset = widget_mount(dom.root);
  const input_of = (id) => dom.root.querySelector(`[id="${id}"]`);
  const output_of = (id) => dom.root.querySelectorAll('output').find((el) => el.getAttribute('for') === id);
  const verdict = dom.root.querySelector('.verdict');
  const [barNote, legendNote, tableNote] = dom.root.querySelectorAll('.legend-note');
  return {
    dom,
    widget_reset,
    unit: UNIT_KMH,
    inputs: Object.fromEntries(SLIDER_NAMES.map((name) => [name, input_of(`speed-${name}`)])),
    outputs: Object.fromEntries(SLIDER_NAMES.map((name) => [name, output_of(`speed-${name}`)])),
    radios: Object.fromEntries(UNIT_KEYS.map((key) => [key, input_of(`speed-unit-${key}`)])),
    presets: Object.fromEntries(dom.root.querySelectorAll('.widget-preset').map((b) => [b.dataset.preset, b])),
    cards: dom.root.querySelector('.readouts').children.map((box) => box.children[1].children),
    verdict,
    headline: verdict.children[0],
    detail: verdict.children[2],
    bars: dom.root.querySelectorAll('.bar-row').map((row) => row.children),
    barNote,
    legendNote,
    tableNote,
    tbody: dom.root.querySelector('tbody'),
    canvas: dom.root.querySelector('canvas'),
  };
}

/** 표시 단위를 바꾼다. 이미 그 단위면 아무것도 하지 않는다. 발화한 리스너 수를 돌려준다. */
function fixture_update_unit(mounted, unitKey) {
  if (mounted.unit === unitKey) return 0;
  for (const key of UNIT_KEYS) mounted.radios[key].checked = key === unitKey;
  mounted.unit = unitKey;
  return mounted.dom.listeners_run_event(mounted.radios[unitKey], 'change');
}

/** set 단위로 바꾼 뒤 슬라이더 넷을 옮기고 change를 한 번, 그 다음 show 단위로 토글한다. */
function fixture_update_controls(mounted, state) {
  let fired = fixture_update_unit(mounted, state.set);
  mounted.inputs.distance.value = String(DISTANCE_LADDER.indexOf(state.distance));
  mounted.inputs.from.value = String(state.from);
  mounted.inputs.to.value = String(state.to);
  mounted.inputs.delay.value = String(state.delay);
  fired += mounted.dom.listeners_run_event(mounted.inputs.distance, 'change');
  fired += fixture_update_unit(mounted, state.show);
  return fired;
}

function fixture_read_screen(mounted) {
  const shown = {};
  for (const name of SLIDER_NAMES) {
    shown[`slider.${name}`] = mounted.outputs[name].textContent;
    shown[`slider.${name}-valuetext`] = mounted.inputs[name].getAttribute('aria-valuetext');
  }
  // 카드는 [절약, 비율, 전, 후, 천장] 순서다(widget_mount의 append 순서).
  ['saved', 'share', 'before', 'after', 'ceiling'].forEach((name, index) => {
    shown[`card.${name}`] = mounted.cards[index][0].textContent;
    shown[`card.${name}-unit`] = mounted.cards[index][1].textContent;
  });
  shown['verdict.state'] = mounted.verdict.dataset.state;
  shown['verdict.headline'] = mounted.headline.textContent;
  shown['verdict.detail'] = mounted.detail.textContent;

  // 막대 한 줄 = [라벨, 트랙, 값, 몫].
  ['from', 'to'].forEach((name, index) => {
    const [label, , value, share] = mounted.bars[index];
    shown[`bar.${name}-label`] = label.textContent;
    shown[`bar.${name}-value`] = value.textContent;
    shown[`bar.${name}-share`] = share.textContent;
  });
  shown['bar.note'] = mounted.barNote.textContent;

  const marked = [];
  mounted.tbody.children.forEach((row, rowIndex) => {
    if (row.getAttribute('aria-current') === 'true') marked.push(rowIndex);
    row.children.forEach((cell, column) => {
      shown[`table.r${rowIndex}.c${column}`] = cell.textContent;
    });
  });
  shown['table.rows'] = String(mounted.tbody.children.length);
  shown['table.marked'] = marked.length ? marked.join(',') : 'none';
  shown['table.note'] = mounted.tableNote.textContent;

  shown['axis.legend'] = mounted.legendNote.textContent;
  shown['axis.aria'] = mounted.canvas.getAttribute('aria-label');

  for (const key of PRESET_KEYS) {
    shown[`preset.${key}`] = mounted.presets[key].textContent;
    shown[`preset.${key}-pressed`] = mounted.presets[key].getAttribute('aria-pressed');
  }
  return shown;
}

// ── 대조 ─────────────────────────────────────────────────────

const LONG_TIMEOUT_MS = 120000;
const MISMATCH_SAMPLE_MAX = 6;

const test_label_state = (state) =>
  `${state.set}${state.show === state.set ? '' : `→${state.show}`} d=${state.distance} ` +
  `v1=${state.from} v2=${state.to} T=${state.delay}`;

function test_create_tally() {
  return { count: 0, compared: 0, fired: 0, byField: new Map() };
}

function test_compare_fields(state, got, want, tally) {
  for (const field of Object.keys(want)) {
    tally.compared += 1;
    if (got[field] === want[field]) continue;
    if (!tally.byField.has(field)) tally.byField.set(field, { count: 0, samples: [] });
    const entry = tally.byField.get(field);
    entry.count += 1;
    if (entry.samples.length < MISMATCH_SAMPLE_MAX) {
      entry.samples.push({ 상태: test_label_state(state), 칸: field, 화면: got[field], 정확: want[field] });
    }
  }
  // 화면에 오라클이 모르는 칸이 있으면(행 수가 다르면) 그것도 어긋남이다.
  for (const field of Object.keys(got)) {
    if (field in want) continue;
    if (!tally.byField.has(field)) tally.byField.set(field, { count: 0, samples: [] });
    const entry = tally.byField.get(field);
    entry.count += 1;
    if (entry.samples.length < MISMATCH_SAMPLE_MAX) {
      entry.samples.push({ 상태: test_label_state(state), 칸: field, 화면: got[field], 정확: '(없음)' });
    }
  }
  tally.count += 1;
}

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

function test_create_lazy(run) {
  let cached = null;
  return () => {
    if (!cached) cached = run();
    return cached;
  };
}

/** 같은 단위 전 격자: 단위 × 거리 × 속도 쌍 × 지연. 지연을 안쪽에 두어 지연 무관 글자를 한 번만 만든다. */
function test_run_display_full() {
  const tally = test_create_tally();
  for (const unitKey of UNIT_KEYS) {
    for (const distance of DISTANCE_LADDER) {
      for (const [from, to] of SPEED_PAIRS[unitKey]) {
        const base = reference_describe_base({ set: unitKey, show: unitKey, distance, from, to, delay: 0 });
        for (const delay of DELAY_TICKS) {
          const state = { set: unitKey, show: unitKey, distance, from, to, delay };
          const want = reference_describe_display(base, reference_describe_trip(base, delay));
          test_compare_fields(state, fixture_read_display(state), want, tally);
        }
      }
    }
  }
  return tally;
}

/** 토글 뒤(설정 단위 ≠ 표시 단위): 전 (d, v₁, v₂) × 지연 양 끝. */
function test_run_display_toggled() {
  const tally = test_create_tally();
  for (const unitKey of UNIT_KEYS) {
    const show = REFERENCE_OTHER_UNIT[unitKey];
    for (const distance of DISTANCE_LADDER) {
      for (const [from, to] of SPEED_PAIRS[unitKey]) {
        const base = reference_describe_base({ set: unitKey, show, distance, from, to, delay: 0 });
        for (const delay of DELAY_ENDS) {
          const state = { set: unitKey, show, distance, from, to, delay };
          const want = reference_describe_display(base, reference_describe_trip(base, delay));
          test_compare_fields(state, fixture_read_display(state), want, tally);
        }
      }
    }
  }
  return tally;
}

function* enum_walk_mount_states() {
  for (const unitKey of UNIT_KEYS) {
    const sample = SAMPLES[unitKey];
    for (const distance of sample.distances) {
      for (const [from, to] of sample.pairs) {
        for (const delay of sample.delays) {
          const state = { set: unitKey, show: unitKey, distance, from, to, delay };
          yield state;
          // 지연 양 끝에서는 다른 단위로 토글해 읽고, 다시 돌아와 읽는다(왕복이 트립을 바꾸지 않는다).
          if (DELAY_ENDS.includes(delay)) {
            yield { ...state, show: REFERENCE_OTHER_UNIT[unitKey] };
            yield state;
          }
        }
      }
    }
  }
}

function test_run_mounted() {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget();
  let expectedFired = 0;
  try {
    test_compare_fields(DEFAULT_STATE, fixture_read_screen(mounted), reference_describe_screen(DEFAULT_STATE), tally);
    let previous = DEFAULT_STATE;
    for (const state of enum_walk_mount_states()) {
      // 같은 슬라이더 상태에서 표시 단위만 바꾸는 단계는 토글만 발화시킨다(슬라이더를 다시 읽으면
      // 토글 뒤의 손잡이 반올림이 상태가 되어 버린다 — 그것은 이 경로가 볼 대상이 아니다).
      const onlyToggle =
        previous.set === state.set && previous.distance === state.distance && previous.from === state.from &&
        previous.to === state.to && previous.delay === state.delay && previous.show !== state.show;
      if (onlyToggle) {
        expectedFired += 1;
        tally.fired += fixture_update_unit(mounted, state.show);
      } else {
        expectedFired += (mounted.unit === state.set ? 0 : 1) + 1 + (state.show === state.set ? 0 : 1);
        tally.fired += fixture_update_controls(mounted, state);
      }
      test_compare_fields(state, fixture_read_screen(mounted), reference_describe_screen(state), tally);
      previous = state;
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  tally.expectedFired = expectedFired;
  return tally;
}

/** 프리셋 버튼을 단위마다 차례로 누르고, 누를 때마다 다른 단위로 토글했다가 돌아온다. */
function test_run_presets() {
  const tally = test_create_tally();
  const mounted = fixture_mount_widget();
  let expectedFired = 0;
  try {
    for (const unitKey of UNIT_KEYS) {
      expectedFired += mounted.unit === unitKey ? 0 : 1;
      tally.fired += fixture_update_unit(mounted, unitKey);
      for (const preset of PRESETS[unitKey]) {
        const state = {
          set: unitKey, show: unitKey, distance: preset.distance, from: preset.from, to: preset.to, delay: preset.delay,
        };
        tally.fired += mounted.dom.listeners_run_event(mounted.presets[preset.key], 'click');
        test_compare_fields(state, fixture_read_screen(mounted), reference_describe_screen(state), tally);
        const other = REFERENCE_OTHER_UNIT[unitKey];
        tally.fired += fixture_update_unit(mounted, other);
        const toggled = { ...state, show: other };
        test_compare_fields(toggled, fixture_read_screen(mounted), reference_describe_screen(toggled), tally);
        tally.fired += fixture_update_unit(mounted, unitKey);
        test_compare_fields(state, fixture_read_screen(mounted), reference_describe_screen(state), tally);
        expectedFired += 3;
      }
    }
    mounted.widget_reset();
  } finally {
    mounted.dom.restore();
  }
  tally.expectedFired = expectedFired;
  return tally;
}

const DISPLAY_RUN = test_create_lazy(test_run_display_full);
const DISPLAY_TOGGLED_RUN = test_create_lazy(test_run_display_toggled);
const MOUNT_RUN = test_create_lazy(test_run_mounted);
const PRESET_RUN = test_create_lazy(test_run_presets);

const PAIR_COUNT = SPEED_PAIRS[UNIT_KMH].length + SPEED_PAIRS[UNIT_MPH].length;
const DISPLAY_TOTAL = DISTANCE_LADDER.length * PAIR_COUNT * DELAY_TICKS.length;
const DISPLAY_TOGGLED_TOTAL = DISTANCE_LADDER.length * PAIR_COUNT * DELAY_ENDS.length;
const MOUNT_TOTAL =
  1 +
  UNIT_KEYS.reduce((sum, key) => {
    const sample = SAMPLES[key];
    const perPair = sample.delays.length + 2 * sample.delays.filter((delay) => DELAY_ENDS.includes(delay)).length;
    return sum + sample.distances.length * sample.pairs.length * perPair;
  }, 0);

const FIELD_FAMILIES = [
  ['판정 상태 (hold / edge / break)', ['verdict.state']],
  ['판정 머리문장 (절약 분·단복수·비율·트립 분)', ['verdict.headline']],
  ['판정 세부문장 (거리·속도·트립 전후·천장·천장 몫·지연)', ['verdict.detail']],
  ['카드 숫자 (분·초·%)', ['card.']],
  ['슬라이더 출력 (거리·속도·지연)', ['slider.']],
  ['축 끝값', ['axis.high']],
];
const MOUNT_FAMILIES = [
  ...FIELD_FAMILIES.filter(([, prefixes]) => prefixes[0] !== 'axis.high'),
  ['막대 (라벨·값·몫·설명)', ['bar.']],
  ['표 (행·강조·설명)', ['table.']],
  ['범례 캡션과 캔버스 aria-label', ['axis.']],
  ['프리셋 라벨과 눌림', ['preset.']],
];

// ── 오라클 자체 ──────────────────────────────────────────────

describe('오라클 자체 (위젯과 무관한 앵커)', () => {
  it('표기 규칙: 0.5는 올림, 분 자리수는 반올림 전 값으로, 거리 유효숫자 6자리', () => {
    expect(reference_format_minutes_text(frac_read_decimal('3.125'))).toBe('3.13');
    expect(reference_format_minutes_text(frac_read_decimal('3.12499'))).toBe('3.12');
    expect(reference_format_minutes_text(frac_read_decimal('0.9995'))).toBe('1.000'); // 1 미만 → 3자리
    expect(reference_format_minutes_text(frac_read_decimal('9.995'))).toBe('10.00'); // 10 미만 → 2자리
    expect(reference_format_minutes_text(frac_read_decimal('10'))).toBe('10.0');
    expect(reference_format_minutes(frac_read_decimal('0.9995')).isOne).toBe(true);
    expect(reference_format_minutes(frac_read_decimal('1.004')).isOne).toBe(true);
    expect(reference_format_minutes(frac_read_decimal('1.005')).isOne).toBe(false);
    expect(reference_format_percent(frac_read_decimal('0.1235'))).toBe('12.4%'); // 12.35 → 동점 올림
    expect(reference_format_percent(frac_read_decimal('0.12349'))).toBe('12.3%');
    expect(reference_format_percent(frac_read_decimal('0.0625'))).toBe('6.3%');
    expect(reference_format_speed(frac_read_decimal('24.5'), UNIT_MPH)).toBe('25 mph');
    expect(reference_format_distance(frac_create(10n), UNIT_KMH)).toBe('10 km');
    expect(reference_format_distance(frac_divide(frac_create(10000n), REFERENCE_METRES[UNIT_MPH]), UNIT_MPH))
      .toBe('6.21371 mi');
    expect(reference_format_distance(frac_divide(frac_create(500n * 1609344n), frac_create(1000000n)), UNIT_KMH))
      .toBe('804.672 km');
    expect(reference_format_axis(frac_read_decimal('16.2'))).toBe('16.2');
    expect(reference_format_axis(frac_read_decimal('0.25'))).toBe('0.250');
    expect(reference_format_axis(frac_read_decimal('1250'))).toBe('1250');
    expect(reference_format_axis(frac_read_decimal('0.0004'))).toBe('0.000');
    expect(reference_describe_delay(1)).toBe('1 min');
    expect(reference_describe_delay(0)).toBe('0 mins');
  }, LONG_TIMEOUT_MS);

  it('식: 10 km를 40 → 60 km/h면 15.0 → 10.0분, 정확히 5분(300초) 절약, 비율 1/3, 천장 몫 1/3', () => {
    const base = reference_describe_base(DEFAULT_STATE);
    expect(frac_compare(base.moving.savedSeconds, frac_create(300n))).toBe(0);
    expect(frac_compare(base.moving.ceilingShare, frac_create(1n, 3n))).toBe(0);
    const trip = reference_describe_trip(base, 0);
    expect(frac_compare(trip.delayed.share, frac_create(1n, 3n))).toBe(0);
    expect([base.savedText, trip.tripText, trip.tripToText, trip.verdict]).toEqual(['5.00', '15.0', '10.0', 'break']);
    // 지연은 절약 분을 바꾸지 않고 비율만 바꾼다: 30분을 넣으면 5/45 = 1/9 → edge.
    const delayed = reference_describe_trip(base, 30);
    expect(frac_compare(delayed.delayed.share, frac_create(1n, 9n))).toBe(0);
    expect(delayed.verdict).toBe('edge');
  }, LONG_TIMEOUT_MS);

  it('데이터: 기본 속도가 km/h 눈금 위, km/h 범위가 정수 눈금, mph 범위는 정확 유도와 같다', () => {
    expect(Math.abs(SPEED_FROM_DEFAULT_MS / SPEED_UNITS[UNIT_KMH].msPerSpeed - DEFAULT_FROM_KMH)).toBeLessThan(1e-9);
    expect(Math.abs(SPEED_TO_DEFAULT_MS / SPEED_UNITS[UNIT_KMH].msPerSpeed - DEFAULT_TO_KMH)).toBeLessThan(1e-9);
    for (const value of [RANGE_KMH.fromMin, RANGE_KMH.fromMax, RANGE_KMH.toMax, RANGE_KMH.gap]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    const derived = REFERENCE_RANGE[UNIT_MPH];
    const fromModel = model_calculate_speed_range(UNIT_MPH);
    expect({ fromMin: fromModel.fromMin, fromMax: fromModel.fromMax, toMax: fromModel.toMax, gap: fromModel.gap })
      .toEqual({ fromMin: derived.fromMin, fromMax: derived.fromMax, toMax: derived.toMax, gap: derived.gap });
    // 정의값: 모델의 환산 계수가 오라클의 정의와 같은 십진수다.
    for (const key of UNIT_KEYS) {
      expect(frac_compare(frac_read_decimal(String(SPEED_UNITS[key].metresPerDistance)), REFERENCE_METRES[key])).toBe(0);
    }
  }, LONG_TIMEOUT_MS);

  it('격자가 요구한 값을 전부 담는다 — 양 끝·기본값·프리셋·두 단위', () => {
    for (const key of UNIT_KEYS) {
      const range = REFERENCE_RANGE[key];
      const sample = SAMPLES[key];
      const fromSet = new Set(sample.pairs.map(([from]) => from));
      const pairSet = new Set(sample.pairs.map((pair) => pair.join('-')));
      expect(sample.distances).toContain(DISTANCE_LADDER[0]);
      expect(sample.distances).toContain(DISTANCE_LADDER[DISTANCE_LADDER.length - 1]);
      expect(sample.distances).toContain(DISTANCE_DEFAULT_UNITS);
      expect(fromSet.has(range.fromMin) && fromSet.has(range.fromMax)).toBe(true);
      expect(pairSet.has(`${range.fromMin}-${range.fromMin + range.gap}`)).toBe(true);
      expect(pairSet.has(`${range.fromMax}-${range.toMax}`)).toBe(true);
      expect(pairSet.has(`${range.fromMax}-${range.fromMax + range.gap}`)).toBe(true);
      expect(sample.delays).toEqual(expect.arrayContaining([DELAY_MIN_MINUTES, DELAY_MAX_MINUTES, DELAY_DEFAULT_MINUTES]));
      for (const preset of PRESETS[key]) {
        expect(sample.distances).toContain(preset.distance);
        expect(pairSet.has(`${preset.from}-${preset.to}`)).toBe(true);
        expect(sample.delays).toContain(preset.delay);
      }
    }
    // 기본 상태(로드 직후의 km/h 쌍)도 마운트 격자에 들어 있다.
    expect(SAMPLES[UNIT_KMH].pairs.some(([from, to]) => from === DEFAULT_FROM_KMH && to === DEFAULT_TO_KMH)).toBe(true);
    // 전 격자의 크기 — 두 단위의 속도 쌍이 0이면 격자를 만드는 식이 틀린 것이다.
    expect(SPEED_PAIRS[UNIT_KMH].length).toBeGreaterThan(0);
    expect(SPEED_PAIRS[UNIT_MPH].length).toBeGreaterThan(0);
  }, LONG_TIMEOUT_MS);
});

// ── 표시 함수 경로 ───────────────────────────────────────────

describe(`표시 함수 경로 — 같은 단위 전 격자 ${DISPLAY_TOTAL}상태, 토글 뒤 ${DISPLAY_TOGGLED_TOTAL}상태`, () => {
  it('전 상태를 실제로 돌았다', () => {
    expect(DISPLAY_RUN().count).toBe(DISPLAY_TOTAL);
    expect(DISPLAY_TOGGLED_RUN().count).toBe(DISPLAY_TOGGLED_TOTAL);
  }, LONG_TIMEOUT_MS);

  for (const [name, prefixes] of FIELD_FAMILIES) {
    it(`같은 단위: ${name}`, () => {
      expect(test_summarize(DISPLAY_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }

  it('토글 뒤: 속도·거리·판정문 전부', () => {
    expect(test_summarize(DISPLAY_TOGGLED_RUN(), [''])).toEqual(CLEAN);
  }, LONG_TIMEOUT_MS);
});

// ── 마운트 경로 ──────────────────────────────────────────────

describe(`마운트 경로 — 축소 격자 ${MOUNT_TOTAL}상태 + 프리셋 클릭`, () => {
  it('전 상태를 실제로 돌았고, 조작마다 리스너가 발화했다', () => {
    const run = MOUNT_RUN();
    expect(run.count).toBe(MOUNT_TOTAL);
    expect(run.fired).toBe(run.expectedFired);
    const presets = PRESET_RUN();
    expect(presets.count).toBe(3 * (PRESETS[UNIT_KMH].length + PRESETS[UNIT_MPH].length));
    expect(presets.fired).toBe(presets.expectedFired);
  }, LONG_TIMEOUT_MS);

  for (const [name, prefixes] of MOUNT_FAMILIES) {
    it(`슬라이더 격자: ${name}`, () => {
      expect(test_summarize(MOUNT_RUN(), prefixes)).toEqual(CLEAN);
    }, LONG_TIMEOUT_MS);
  }

  it('프리셋 클릭과 단위 왕복: 화면 전체', () => {
    expect(test_summarize(PRESET_RUN(), [''])).toEqual(CLEAN);
  }, LONG_TIMEOUT_MS);
});
