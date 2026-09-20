/**
 * 위젯 공통 — 길이 표기.
 *
 * 화면에 찍히는 문자열을 만든다. 계산은 하지 않는다.
 * 자릿수는 값의 '크기'가 아니라 요구한 **유효숫자**로 정한다 —
 * 크기 구간으로 정하면 같은 슬라이더 칸에서 다른 정밀도가 나온다.
 */

const MM_PER_M = 1000;
const M_PER_KM = 1000;
/** 이 값보다 작으면 mm로 읽는다 (1 cm). */
const MILLIMETRE_CEILING_M = 0.01;
/** 이 값 이상이면 km로 읽는다. */
const KILOMETRE_FLOOR_M = 1000;
/** km로도 자릿수가 감당이 안 되는 지점. 여기부터는 지수 표기로 간다. */
const SCIENTIFIC_FLOOR_KM = 1e7;

/** 음수 부호. ASCII 하이픈과 섞이면 같은 화면에 두 글자가 나온다. */
const MINUS = '−';

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** 지수를 위첨자 문자열로. 10^8 → "10⁸" */
export function units_format_exponent(exponent) {
  const digits = String(Math.trunc(exponent)).split('');
  return `10${digits.map((d) => SUPERSCRIPT[d] ?? d).join('')}`;
}

/** 유효숫자 n자리로 자르고 꼬리 0을 없앤다. 12.80 → "12.8", 1.000 → "1" */
export function units_format_significant(value, significantDigits = 4) {
  if (!Number.isFinite(value)) return String(value);
  const fixed = Number(value.toPrecision(significantDigits));
  return String(fixed);
}

/**
 * 지수 표기. 4.398046e8 → "4.398 × 10⁸"
 * 0과 음수, 유한하지 않은 값은 그대로 문자열로 돌려준다.
 */
export function units_format_scientific(metres, significantDigits = 4) {
  if (!Number.isFinite(metres) || metres === 0) return String(metres);
  const sign = metres < 0 ? MINUS : '';
  const size = Math.abs(metres);
  const exponent = Math.floor(Math.log10(size));
  const mantissa = size / Math.pow(10, exponent);
  // 반올림이 10.00을 만들면 지수를 하나 올린다 (9.9999e7 → "1 × 10⁸")
  const rounded = Number(mantissa.toPrecision(significantDigits));
  if (rounded >= 10) {
    return `${sign}1 × ${units_format_exponent(exponent + 1)}`;
  }
  return `${sign}${rounded} × ${units_format_exponent(exponent)}`;
}

/**
 * 사람이 읽는 길이. mm → m → km로 단위를 바꾸고, km로도 너무 커지면 지수 표기.
 * 단위가 바뀌는 지점은 상수로 두었다 — 슬라이더를 끌 때 표기가 널뛰지 않게.
 */
export function units_format_length(metres, significantDigits = 4) {
  if (!Number.isFinite(metres)) return String(metres);
  const size = Math.abs(metres);
  if (size === 0) return '0 m';
  if (size < MILLIMETRE_CEILING_M) {
    return `${units_format_significant(metres * MM_PER_M, significantDigits).replace('-', MINUS)} mm`;
  }
  if (size < KILOMETRE_FLOOR_M) {
    return `${units_format_significant(metres, significantDigits).replace('-', MINUS)} m`;
  }
  // 임계는 **반올림한 뒤의 값**으로 본다. 반올림 전 값으로 재면
  // 9,999,600,000 m가 "10,000,000 km"로 찍혀 임계를 넘긴 표기가 km로 남는다.
  const kilometres = Number((metres / M_PER_KM).toPrecision(significantDigits));
  if (Math.abs(kilometres) < SCIENTIFIC_FLOOR_KM) {
    // toLocaleString의 기본 소수 상한은 3자리다. 유효숫자를 더 요구하면 조용히 잘린다.
    const text = kilometres.toLocaleString('en-US', { maximumFractionDigits: significantDigits });
    return `${text.replace('-', MINUS)} km`;
  }
  // km로도 지수를 붙여야 할 만큼 크면 미터로 되돌린다.
  // "1.013 × 10¹⁸ km"보다 "1.013 × 10²¹ m"가 본문의 표기와 같고 읽기도 낫다.
  return `${units_format_scientific(metres, significantDigits)} m`;
}

/**
 * 큰 개수를 짧게. 4398046511104 → "4.4 trillion"
 * 겹 수를 카드에 그대로 찍으면 열세 자리라 아무도 읽지 못한다.
 */
const COUNT_NAMES = [
  { floor: 1e18, name: 'quintillion' },
  { floor: 1e15, name: 'quadrillion' },
  { floor: 1e12, name: 'trillion' },
  { floor: 1e9, name: 'billion' },
  { floor: 1e6, name: 'million' },
  { floor: 1e3, name: 'thousand' },
];

export function units_format_count_words(value, significantDigits = 2) {
  if (!Number.isFinite(value)) return String(value);
  const size = Math.abs(value);
  for (const { floor, name } of COUNT_NAMES) {
    if (size >= floor) {
      return `${units_format_significant(value / floor, significantDigits)} ${name}`;
    }
  }
  return String(Math.round(value));
}
