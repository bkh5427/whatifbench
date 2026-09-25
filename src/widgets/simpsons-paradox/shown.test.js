/**
 * 심슨의 역설 — **화면에 찍히는 숫자 문자열**을 정확 연산의 오라클과 대조한다.
 *
 * 이 파일이 막으려는 사고는 딱 한 종류다: **표시 단계의 반올림이 값을 바꾼다.**
 * 모델이 옳은 비율을 내도 화면에 한 자리 낮은 문자열이 찍히면, 독자가 보는 숫자는
 * 틀린 숫자다. 그리고 그 사고는 화면에 아무 흔적도 남기지 않는다 —
 * 막대 길이도, 판정 배너도, 캡션의 문장도 그대로다. 숫자 한 글자만 다르다.
 *
 * 몬티홀에서 같은 사고가 다섯 번 났다 (verdict-shown.test.js의 머리주석):
 * 마지막이 `1351/2000 = 67.55%`가 `67.5%`로 찍힌 것이고, 원인은
 * `toFixed`가 **부동소수로 이미 경계 아래로 떨어진 값**을 내림한 것이었다.
 * 0.2875는 이진으로 0.28749999999999997779…이므로 `(0.2875*100).toFixed(1)`은
 * `"28.7"`이다 — 수학적으로는 28.75, 반올림하면 28.8인데도.
 * 몬티홀은 그래서 표기를 정수 반올림으로 바꿨다. 심슨 위젯의
 * `display_format_percent` / `display_format_gap`은 아직 `toFixed`를 그대로 쓴다.
 * 이 파일은 그 차이가 **실제로 화면에 나오는 상태가 있는지**를 격자로 확인한다.
 *
 * 검사 방식 (규칙 L-ORACLE):
 *   ① 오라클은 BigInt 분자/분모 **유리수**로 값을 정확히 잡고, 반올림도
 *      정수 연산으로 한다(0.5는 올림). 부동소수를 한 번도 거치지 않는다.
 *   ② 합산 비율은 오라클을 **두 경로**로 만든다 —
 *      (k1+k2)/(n1+n2) 와 w·p1 + (1−w)·p2. 두 경로가 정확 유리수에서 같은지
 *      먼저 확인하고(오라클 자기점검), 그 다음 화면 문자열과 견준다.
 *   ③ 모델 함수를 불러 기대값을 만들지 않는다. 같은 식을 두 번 쓰면 검사가 아니다.
 *   ④ 표시 자리수는 코드에서 읽어온다. 위젯이 자리수를 바꾸면 이 파일도 따라간다.
 *
 * 격자는 **정수 상태**로 만든다. 프리셋이 정수 카운트(825건 중 512건)를 넣고
 * 비율은 거기서 나눗셈 한 번으로 나오므로, 화면에 실제로 뜨는 비율은 k/n 꼴이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SIMPSON_SIZE_MIN,
  SIMPSON_SIZE_MAX,
  SIMPSON_SIZE_STEP,
  SIMPSON_RATE_EPSILON,
  SIMPSON_PRESETS,
  model_calculate_group_weight,
  model_calculate_pooled_rate,
  model_calculate_success_count,
} from './model.js';
import {
  display_format_percent,
  display_format_gap,
  display_format_share,
  display_format_count,
} from './widget.js';

// ── 표시 규약 ───────────────────────────────────────────────
/**
 * 자리수와 배율은 **코드에서 읽는다** — `PERCENT_DIGITS`·`PERCENT_SCALE`이
 * widget.js의 모듈 지역 상수라 import할 수 없으므로, 반올림이 걸릴 일이 없는
 * 값 하나(비율 1 = 정확히 100%)를 찍어 표기에서 되읽는다.
 * 1은 이진으로 정확하고 100.0도 정확하니, 이 한 값에서 나온 자리수·배율은
 * 위젯이 쓰는 상수 그 자체다.
 */
const [PERCENT_SCALE, PERCENT_DIGITS] = (() => {
  const text = display_format_percent(1).replace('%', '');
  const dot = text.indexOf('.');
  const digits = dot === -1 ? 0 : text.length - dot - 1;
  return [Math.round(Number(text)), digits];
})();

/** 표기 장식. 숫자가 아니라 규약이므로 여기서 고정한다 — 바뀌면 이 파일이 걸리는 것이 맞다. */
const PERCENT_SUFFIX = '%';
const GAP_SUFFIX = ' pp';
const GAP_PLUS = '+';
const GAP_MINUS = '−'; // U+2212 MINUS SIGN. 하이픈이 아니다.
const MISSING_TEXT = '—'; // U+2014 EM DASH. 비율이 정의되지 않은 칸.

/**
 * 오차 상수를 정확한 유리수로. 부호 판정("정확히 같다")이 이 값에 걸려 있어서,
 * 오라클도 같은 문턱을 쓰되 부동소수 비교를 피해야 한다.
 * 5e-6 → 5/1000000. 10을 곱해 정수가 되는 지점까지만 올린다.
 */
const EPSILON = (() => {
  let value = SIMPSON_RATE_EPSILON;
  let den = 1n;
  while (!Number.isInteger(value)) {
    value *= 10;
    den *= 10n;
    if (den > 10n ** 18n) throw new Error('SIMPSON_RATE_EPSILON을 유리수로 옮길 수 없다.');
  }
  return { num: BigInt(value), den };
})();

// ── 정확 유리수 오라클 ──────────────────────────────────────
/** 유리수. 분모는 언제나 양수로 둔다. 약분하지 않는다 — 크기가 작아 필요가 없다. */
function rat(num, den) {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d === 0n) throw new Error('분모 0');
  return d < 0n ? { n: -n, d: -d } : { n, d };
}
const rat_add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rat_sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rat_mul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rat_equal = (a, b) => a.n * b.d === b.n * a.d;

/**
 * 정수 나눗셈 + 반올림(0.5는 크기가 큰 쪽으로 = 0에서 먼 쪽으로).
 * `toFixed`의 명세도 "둘이 같으면 큰 n"이라 부호 없는 값에서는 같은 규칙이지만,
 * 여기서는 **나눗셈을 하지 않으므로** 경계가 경계로 남는다 — 그것이 요점이다.
 */
function div_round_half_up(numerator, denominator) {
  if (numerator < 0n) return -div_round_half_up(-numerator, denominator);
  return (2n * numerator + denominator) / (2n * denominator);
}

/** 정수 q를 소수 digits자리 문자열로. q는 값×10^digits다. */
function scaled_to_text(q, digits) {
  const negative = q < 0n;
  let body = (negative ? -q : q).toString();
  if (digits > 0) {
    while (body.length <= digits) body = `0${body}`;
    body = `${body.slice(0, body.length - digits)}.${body.slice(body.length - digits)}`;
  }
  return `${negative ? '-' : ''}${body}`;
}

/** 유리수를 소수 digits자리로 정확히 반올림한 정수(값×10^digits). */
function rat_round_scaled(value, digits) {
  return div_round_half_up(value.n * 10n ** BigInt(digits), value.d);
}

/** 비율(유리수) → 화면 백분율 문자열. */
function oracle_percent(rate) {
  const points = rat_mul(rate, rat(PERCENT_SCALE, 1));
  return `${scaled_to_text(rat_round_scaled(points, PERCENT_DIGITS), PERCENT_DIGITS)}${PERCENT_SUFFIX}`;
}

/**
 * 격차(유리수) → 화면 pp 문자열.
 * 부호는 **크기를 반올림하기 전에** 정한다 — 위젯도 그렇게 한다
 * (`Math.abs(gap) <= EPSILON`이면 부호 없음). 그래서 +0.0 pp가 나올 수 있다.
 */
function oracle_gap(gap) {
  const magnitude = gap.n < 0n ? { n: -gap.n, d: gap.d } : gap;
  const tied = magnitude.n * EPSILON.den <= EPSILON.num * magnitude.d;
  const sign = tied ? '' : gap.n > 0n ? GAP_PLUS : GAP_MINUS;
  const points = rat_mul(magnitude, rat(PERCENT_SCALE, 1));
  return `${sign}${scaled_to_text(rat_round_scaled(points, PERCENT_DIGITS), PERCENT_DIGITS)}${GAP_SUFFIX}`;
}

/** 천 단위 구분. `toLocaleString`과 다른 식으로 — 뒤에서 세 자리마다 쉼표. */
function oracle_count(value) {
  const digits = String(Math.abs(value));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return `${value < 0 ? '-' : ''}${out}`;
}

/**
 * 이 비율이 화면 표기의 반올림 경계에 정확히 놓이는가.
 * 비율 → 백분율(×PERCENT_SCALE) → 표시 자리수(×10^d)까지 옮긴 값의 소수부가
 * 정확히 ½이면 경계다. 두 배율을 다 곱해야 한다 — 하나만 곱하면 엉뚱한 자리를 본다.
 */
function is_percent_boundary(rate) {
  const scaled = rat_mul(rate, rat(PERCENT_SCALE * 10 ** PERCENT_DIGITS, 1));
  const remainder = ((scaled.n % scaled.d) + scaled.d) % scaled.d;
  return 2n * remainder === scaled.d;
}

// ── 격자 ────────────────────────────────────────────────────
/**
 * 표본수 목록. 슬라이더 범위·눈금(model.js) 안에서만 고른다.
 *   · 작은 표본은 전부 본다 — 1/n이 성길수록 표기 경계에 정확히 얹히기 쉽다.
 *   · 그 위는 간격을 벌려 훑되 상한과 상한−1은 반드시 넣는다.
 *   · 프리셋이 실제로 넣는 표본수(825·373·108·341·87·263·270·80·400)를 넣는다.
 *   · 1/n이 이진에서 순환하는 값(80·160·320·625 …)을 따로 넣는다 — 사고가 여기 산다.
 */
const SIZES = (() => {
  const seen = new Set();
  const add = (n) => {
    if (!Number.isInteger(n)) return;
    if (n < SIMPSON_SIZE_MIN || n > SIMPSON_SIZE_MAX) return;
    if ((n - SIMPSON_SIZE_MIN) % SIMPSON_SIZE_STEP !== 0) return;
    seen.add(n);
  };
  for (let n = 1; n <= 48; n += SIMPSON_SIZE_STEP) add(n);
  for (let n = 50; n <= SIMPSON_SIZE_MAX; n += 13) add(n);
  add(SIMPSON_SIZE_MAX - SIMPSON_SIZE_STEP);
  add(SIMPSON_SIZE_MAX);
  for (const preset of SIMPSON_PRESETS) for (const cell of Object.values(preset.counts)) add(cell.size);
  for (const n of [16, 32, 64, 80, 128, 160, 240, 320, 400, 512, 625, 800]) add(n);
  return [...seen].sort((a, b) => a - b);
})();

/**
 * 칸 = (표본수 n, 성공 수 k). 비율은 k/n이다.
 * k는 **경계 0·1·n−1·n을 반드시** 넣고, 그 사이를 일정 간격으로 채운다.
 * 간격을 넓히는 쪽으로 조절하되 경계는 절대 빼지 않는다 (실행 5초 제약).
 */
const CELLS = (() => {
  const out = [];
  for (const n of SIZES) {
    const ks = new Set([0, 1, n - 1, n]);
    const stride = Math.max(1, Math.floor(n / 60));
    for (let k = 0; k <= n; k += stride) ks.add(k);
    for (const k of ks) if (k >= 0 && k <= n) out.push([n, k]);
  }
  return out;
})();

/**
 * 짝지어 훑을 칸의 부분집합. 두 칸의 곱집합을 쓰므로 목록이 커지면 격자가 제곱으로
 * 커진다 — 여기서는 "나쁜 분모"와 프리셋 표본수를 남기고 줄인다.
 * n=0(시도 없는 칸)도 넣는다: 합산이 빈 칸을 어떻게 지우는지가 화면 숫자를 바꾼다.
 */
const PAIR_CELLS = (() => {
  const sizes = [0, 1, 2, 3, 5, 8, 16, 80, 87, 108, 160, 240, 263, 270, 320, 341, 373, 400, 625, 800, 825, 999, 1000];
  const out = [];
  for (const n of sizes.filter((n) => n >= SIMPSON_SIZE_MIN && n <= SIMPSON_SIZE_MAX)) {
    const ks = new Set([0, 1, n - 1, n, Math.floor(n / 2), Math.floor(n / 3), Math.ceil(n * 0.2875), Math.round(n * 0.7)]);
    for (const k of ks) if (k >= 0 && k <= n) out.push([n, k]);
  }
  return out;
})();

/** 칸 → 위젯 상태의 (표본수, 비율). 빈 칸의 비율은 프리셋 변환과 같은 규칙으로 0. */
const cell_rate = ([n, k]) => (n > 0 ? k / n : 0);

/** 격자 크기 — 각 it이 실제로 본 상태 수를 여기에 적어 두고 합계를 검사한다. */
const visited = {};

/** 불일치 목록을 보기 좋게 — 개수와 처음 몇 건을 함께 단언한다(전체를 쏟으면 읽을 수 없다). */
function summarize(bad) {
  return { 불일치: bad.length, 처음: bad.slice(0, 6) };
}
const CLEAN = { 불일치: 0, 처음: [] };

// ── 표시 자리수 ─────────────────────────────────────────────
describe('표시 자리수를 코드에서 읽었는가', () => {
  it('비율 1은 정확히 100%로 찍히고, 거기서 배율 100과 소수 자리수를 얻는다', () => {
    expect(display_format_percent(1)).toBe(`${(100).toFixed(PERCENT_DIGITS)}%`);
    expect(PERCENT_SCALE).toBe(100);
    expect(PERCENT_DIGITS).toBeGreaterThanOrEqual(0);
  });

  it('되읽은 자리수가 widget.js의 PERCENT_DIGITS·PERCENT_SCALE 상수와 같다', () => {
    // 상수를 export하지 않으므로 소스를 읽어 대조한다. 위젯이 이 상수를 없애면
    // 여기서 걸린다 — 그때는 위의 되읽기 방식을 다시 맞추라는 신호다.
    const source = readFileSync(new URL('./widget.js', import.meta.url), 'utf8');
    const digits = source.match(/PERCENT_DIGITS\s*=\s*(\d+)/);
    const scale = source.match(/PERCENT_SCALE\s*=\s*(\d+)/);
    expect(digits && Number(digits[1])).toBe(PERCENT_DIGITS);
    expect(scale && Number(scale[1])).toBe(PERCENT_SCALE);
  });
});

// ── 오라클 자기점검 ─────────────────────────────────────────
describe('오라클 자기점검 — 기대값을 만드는 쪽이 먼저 맞아야 한다', () => {
  it('두 경로가 같은 유리수를 낸다: (k1+k2)/(n1+n2) = w·p1 + (1−w)·p2', () => {
    const bad = [];
    for (const [n1, k1] of PAIR_CELLS) {
      for (const [n2, k2] of PAIR_CELLS) {
        if (n1 + n2 === 0) continue;
        const pooled = rat(k1 + k2, n1 + n2);
        const weight = rat(n1, n1 + n2);
        // 빈 칸의 비율은 0으로 둔다 — 가중치가 0이라 어떤 값이든 결과가 같다.
        const p1 = n1 > 0 ? rat(k1, n1) : rat(0, 1);
        const p2 = n2 > 0 ? rat(k2, n2) : rat(0, 1);
        const average = rat_add(rat_mul(weight, p1), rat_mul(rat_sub(rat(1, 1), weight), p2));
        if (!rat_equal(pooled, average)) bad.push([n1, k1, n2, k2]);
      }
    }
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it('0.5는 올린다: 28.75% → 28.8%, 6.25% → 6.3%, −28.75pp → −28.8pp', () => {
    expect(oracle_percent(rat(23, 80))).toBe('28.8%');
    expect(oracle_percent(rat(1, 16))).toBe('6.3%');
    expect(oracle_gap(rat(-23, 80))).toBe('−28.8 pp');
  });

  it('부호는 오차 문턱으로 정한다 — 문턱 안이면 부호를 붙이지 않는다', () => {
    expect(oracle_gap(rat(0, 1))).toBe('0.0 pp');
    // 정확히 문턱(5e-6)이면 '같다'. 위젯의 `<=`와 같은 규칙이다.
    expect(oracle_gap(rat(EPSILON.num, EPSILON.den))).toBe('0.0 pp');
    // 문턱을 넘으면 크기가 0.0으로 반올림돼도 부호는 붙는다.
    expect(oracle_gap(rat(1, 100000))).toBe('+0.0 pp');
  });
});

// ── 그룹별 비율 ─────────────────────────────────────────────
describe('막대·표에 찍히는 그룹 비율 백분율', () => {
  it('정수 상태 격자 전체에서 정확한 반올림과 한 글자도 다르지 않다', () => {
    const bad = [];
    for (const cell of CELLS) {
      const [n, k] = cell;
      const got = display_format_percent(cell_rate(cell));
      const want = oracle_percent(rat(k, n));
      if (got !== want) bad.push({ n, k, 화면: got, 정확: want });
    }
    visited.그룹비율 = CELLS.length;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('시도가 없는 칸은 숫자가 아니라 대시다', () => {
    // model_calculate_result가 size 0인 칸의 rate를 null로 내리고, 표시가 그것을 받는다.
    expect(display_format_percent(null)).toBe(MISSING_TEXT);
    expect(display_format_percent(Number.NaN)).toBe(MISSING_TEXT);
  });

  it('23/80 = 28.75%는 28.8%로 찍혀야 한다 (이진에서 28.749999…로 내려앉는 값)', () => {
    expect(display_format_percent(23 / 80)).toBe('28.8%');
  });
});

// ── 가중치 띠 ───────────────────────────────────────────────
describe('가중치 띠 — 옆에 찍히는 값과 띠의 폭', () => {
  it('띠 값은 n1/(n1+n2)의 정확한 반올림이다', () => {
    const bad = [];
    let count = 0;
    for (const n1 of SIZES) {
      for (const n2 of SIZES) {
        if (n1 + n2 === 0) continue;
        count += 1;
        const got = display_format_percent(model_calculate_group_weight(n1, n2));
        const want = oracle_percent(rat(n1, n1 + n2));
        if (got !== want) bad.push({ n1, n2, 화면: got, 정확: want });
      }
    }
    visited.가중치 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('띠 두 토막의 폭은 정확한 백분율과 겹치고, 합이 100%다', () => {
    // 폭은 CSS `width`로 나가는 수치라 문자열 한 글자를 따질 자리가 아니다
    // (브라우저가 소수를 그대로 받는다). 대신 **눈에 보이는 자리에서 어긋나지
    // 않는가**를 본다: 표시 자리수보다 훨씬 작은 여유로 정확값과 겹쳐야 하고,
    // 두 토막이 트랙을 정확히 채워야 한다.
    const tolerance = 10 ** -(PERCENT_DIGITS + 6);
    const bad = [];
    for (const n1 of SIZES) {
      for (const n2 of SIZES) {
        if (n1 + n2 === 0) continue;
        const weight = model_calculate_group_weight(n1, n2);
        const first = weight * PERCENT_SCALE;
        const second = (1 - weight) * PERCENT_SCALE;
        const exact = (Number(rat_round_scaled(rat_mul(rat(n1, n1 + n2), rat(PERCENT_SCALE, 1)), 9)) / 1e9);
        if (Math.abs(first - exact) > tolerance) bad.push({ n1, n2, 폭: first, 정확: exact });
        if (Math.abs(first + second - PERCENT_SCALE) > tolerance) bad.push({ n1, n2, 합: first + second });
      }
    }
    expect(summarize(bad)).toEqual(CLEAN);
  });
});

// ── 합산 비율 ───────────────────────────────────────────────
describe('합산(pooled) 비율 백분율 — 위젯이 가중평균으로 내는 값', () => {
  it('두 칸의 곱집합에서 (k1+k2)/(n1+n2)의 정확한 반올림과 같다', () => {
    const bad = [];
    let count = 0;
    for (const cellA of PAIR_CELLS) {
      for (const cellB of PAIR_CELLS) {
        const [n1, k1] = cellA;
        const [n2, k2] = cellB;
        if (n1 + n2 === 0) continue; // 두 칸 다 비면 합산 비율이 정의되지 않는다(모델이 null).
        count += 1;
        const got = display_format_percent(
          model_calculate_pooled_rate(n1, cell_rate(cellA), n2, cell_rate(cellB)),
        );
        // 경로 ①: 합쳐서 나눈다.
        const want = oracle_percent(rat(k1 + k2, n1 + n2));
        // 경로 ②: 가중평균. 정확 유리수에서는 ①과 같아야 하고, 위의 자기점검이 그것을 본다.
        const weight = rat(n1, n1 + n2);
        const average = rat_add(
          rat_mul(weight, n1 > 0 ? rat(k1, n1) : rat(0, 1)),
          rat_mul(rat_sub(rat(1, 1), weight), n2 > 0 ? rat(k2, n2) : rat(0, 1)),
        );
        const wantAverage = oracle_percent(average);
        if (got !== want || got !== wantAverage) {
          bad.push({ n1, k1, n2, k2, 화면: got, 합쳐나눔: want, 가중평균: wantAverage });
        }
      }
    }
    visited.합산비율 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('빈 칸의 비율 슬라이더 값은 합산에 흘러들지 않는다', () => {
    // 시도 0인 칸의 성공률 슬라이더는 화면에 남아 있다. 가중치가 0이므로
    // 합산 비율은 반대쪽 칸의 비율과 **정확히** 같아야 한다 — 0×무언가로 지워진다.
    for (const phantom of [0, 0.5, 0.987654, 1]) {
      expect(display_format_percent(model_calculate_pooled_rate(0, phantom, 80, 23 / 80))).toBe(
        display_format_percent(23 / 80),
      );
    }
  });
});

// ── 격차 ────────────────────────────────────────────────────
describe('표의 격차 열(pp)', () => {
  it('그룹 안 격차는 (kA·nB − kB·nA)/(nA·nB)의 정확한 반올림과 부호까지 같다', () => {
    const bad = [];
    let count = 0;
    for (const cellA of PAIR_CELLS) {
      for (const cellB of PAIR_CELLS) {
        const [nA, kA] = cellA;
        const [nB, kB] = cellB;
        if (nA === 0 || nB === 0) continue; // 한쪽이 비면 격차가 null → 대시. 아래에서 따로 본다.
        count += 1;
        const got = display_format_gap(cell_rate(cellA) - cell_rate(cellB));
        const want = oracle_gap(rat(kA * nB - kB * nA, nA * nB));
        if (got !== want) bad.push({ nA, kA, nB, kB, 화면: got, 정확: want });
      }
    }
    visited.그룹격차 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('합산 격차도 정확한 반올림과 같다 (네 칸짜리 상태)', () => {
    // 네 칸의 곱집합은 너무 크다. 고정 씨앗의 결정적 수열로 칸 넷을 뽑아
    // 같은 상태 집합을 매번 본다 — 무작위처럼 보이지만 실행마다 같은 격자다.
    let seed = 20260924;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = () => PAIR_CELLS[Math.floor(next() * PAIR_CELLS.length)];
    const bad = [];
    let count = 0;
    for (let i = 0; i < 12000; i += 1) {
      const a1 = pick();
      const a2 = pick();
      const b1 = pick();
      const b2 = pick();
      if (a1[0] + a2[0] === 0 || b1[0] + b2[0] === 0) continue;
      count += 1;
      const pooledA = model_calculate_pooled_rate(a1[0], cell_rate(a1), a2[0], cell_rate(a2));
      const pooledB = model_calculate_pooled_rate(b1[0], cell_rate(b1), b2[0], cell_rate(b2));
      const got = display_format_gap(pooledA - pooledB);
      const KA = BigInt(a1[1] + a2[1]);
      const NA = BigInt(a1[0] + a2[0]);
      const KB = BigInt(b1[1] + b2[1]);
      const NB = BigInt(b1[0] + b2[0]);
      const want = oracle_gap(rat(KA * NB - KB * NA, NA * NB));
      if (got !== want) bad.push({ A: [...a1, ...a2], B: [...b1, ...b2], 화면: got, 정확: want });
    }
    visited.합산격차 = count;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('비교할 수 없는 격차는 대시고, 0은 부호 없는 0.0 pp다', () => {
    expect(display_format_gap(null)).toBe(MISSING_TEXT);
    expect(display_format_gap(0)).toBe(`${(0).toFixed(PERCENT_DIGITS)}${GAP_SUFFIX}`);
    expect(display_format_gap(0.5)).toBe(`${GAP_PLUS}${(50).toFixed(PERCENT_DIGITS)}${GAP_SUFFIX}`);
    expect(display_format_gap(-0.5)).toBe(`${GAP_MINUS}${(50).toFixed(PERCENT_DIGITS)}${GAP_SUFFIX}`);
  });
});

// ── 건수 ────────────────────────────────────────────────────
describe('비율 옆의 건수 — "512 of 825"', () => {
  it('round(n·p)가 원래의 정수 성공 수로 되돌아오고, 쉼표 자리도 같다', () => {
    const bad = [];
    for (const cell of CELLS) {
      const [n, k] = cell;
      const count = model_calculate_success_count(n, cell_rate(cell));
      const text = display_format_share(count, n);
      const want = `${oracle_count(k)} of ${oracle_count(n)}`;
      if (count !== k || text !== want) bad.push({ n, k, 건수: count, 화면: text, 정확: want });
    }
    visited.건수 = CELLS.length;
    expect(summarize(bad)).toEqual(CLEAN);
  });

  it('천 단위 구분은 네 자리부터 붙는다', () => {
    expect(display_format_count(999)).toBe(oracle_count(999));
    expect(display_format_count(1000)).toBe(oracle_count(1000));
    expect(display_format_count(1000)).toBe('1,000');
  });
});

// ── 격자 크기 ───────────────────────────────────────────────
describe('격자가 충분히 큰가', () => {
  it('위의 it들이 합쳐 20,000 상태 이상을 봤다', () => {
    // 격자를 줄이는 손질이 조용히 들어오는 것을 막는다. 간격을 넓힐 수는 있지만
    // 전체 상태 수가 이 선 아래로 내려가면 여기서 걸린다.
    const total = Object.values(visited).reduce((sum, n) => sum + n, 0);
    expect(Object.keys(visited).sort()).toEqual(
      ['가중치', '건수', '그룹격차', '그룹비율', '합산격차', '합산비율'].sort(),
    );
    expect(total).toBeGreaterThanOrEqual(20000);
  });
});

// ── 반올림 경계 ─────────────────────────────────────────────
/**
 * 경계 상태를 따로 모은다. 격자를 일정 간격으로 훑으면 경계는 **대부분 빠진다** —
 * 경계는 k/n이 특정 약분 조건을 만족하는 드문 자리에만 있다. 그래서 간격이 아니라
 * 조건으로 찾는다: k/n의 백분율을 표시 자리수로 옮긴 값이 정확히 x.5가 되는 정수쌍.
 *
 *   k·PERCENT_SCALE·10^d / n ∈ ℤ + ½  ⟺  2·PERCENT_SCALE·10^d·k ≡ 0 (mod n) 이고 몫이 홀수
 */
const BOUNDARY_FACTOR = 2 * PERCENT_SCALE * 10 ** PERCENT_DIGITS;

/** 한 칸짜리 경계 상태. */
const BOUNDARY_CELLS = (() => {
  const out = [];
  for (let n = 1; n <= SIMPSON_SIZE_MAX; n += SIMPSON_SIZE_STEP) {
    for (let k = 0; k <= n; k += 1) {
      const doubled = BOUNDARY_FACTOR * k;
      if (doubled % n !== 0) continue;
      if ((doubled / n) % 2 !== 1) continue;
      out.push([n, k]);
    }
  }
  return out;
})();

/** 합산이 경계에 놓이는 두 칸짜리 상태. 합계 (k1+k2)/(n1+n2)에 같은 조건을 건다. */
const BOUNDARY_POOLED = (() => {
  const out = [];
  for (const cellA of PAIR_CELLS) {
    for (const cellB of PAIR_CELLS) {
      const n = cellA[0] + cellB[0];
      const k = cellA[1] + cellB[1];
      if (n === 0) continue;
      const doubled = BOUNDARY_FACTOR * k;
      if (doubled % n !== 0) continue;
      if ((doubled / n) % 2 !== 1) continue;
      out.push([cellA, cellB]);
    }
  }
  return out;
})();

describe('반올림 경계 (정확히 x.x5가 되는 정수 상태)', () => {
  it('경계 상태가 실제로 존재한다 — 0건이면 경계를 찾는 식이 틀린 것이다', () => {
    // 손으로 구성한 조합이 목록에 실제로 들어 있는지도 함께 본다.
    // 23/80 = 28.75%, 1/16 = 6.25%, 1/80 = 1.25% — 셋 다 화면 표시 경계다.
    expect(BOUNDARY_CELLS.length).toBeGreaterThan(0);
    expect(BOUNDARY_POOLED.length).toBeGreaterThan(0);
    for (const pair of [[80, 23], [16, 1], [80, 1]]) {
      expect(BOUNDARY_CELLS).toContainEqual(pair);
      expect(is_percent_boundary(rat(pair[1], pair[0]))).toBe(true);
    }
  });

  it('경계에 놓인 그룹 비율을 전부 올려 찍는다', () => {
    const bad = [];
    for (const [n, k] of BOUNDARY_CELLS) {
      const got = display_format_percent(k / n);
      const want = oracle_percent(rat(k, n));
      if (got !== want) bad.push({ n, k, 화면: got, 정확: want, 부동소수: (k / n) * PERCENT_SCALE });
    }
    expect(summarize(bad)).toEqual({ 불일치: 0, 처음: [] });
  });

  it('경계에 놓인 합산 비율도 전부 올려 찍는다', () => {
    const bad = [];
    for (const [cellA, cellB] of BOUNDARY_POOLED) {
      const got = display_format_percent(
        model_calculate_pooled_rate(cellA[0], cell_rate(cellA), cellB[0], cell_rate(cellB)),
      );
      const want = oracle_percent(rat(cellA[1] + cellB[1], cellA[0] + cellB[0]));
      if (got !== want) bad.push({ A: cellA, B: cellB, 화면: got, 정확: want });
    }
    expect(summarize(bad)).toEqual({ 불일치: 0, 처음: [] });
  });

  it('손으로 구성한 경계 조합 — 정확한 반올림은 위로 간다', () => {
    // 이진에서 경계 아래로 내려앉는 값만 골랐다. 셋 다 슬라이더로 만들 수 있는 상태다
    // (표본수 80·16·400은 범위 안의 정수, 성공 수도 정수).
    expect(display_format_percent(23 / 80)).toBe('28.8%'); // 28.75
    expect(display_format_percent(41 / 80)).toBe('51.3%'); // 51.25
    expect(display_format_percent(29 / 400)).toBe('7.3%'); // 7.25
  });
});
