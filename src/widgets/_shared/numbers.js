/**
 * 위젯 공통 — 숫자 다루기.
 *
 * 여기 있는 것들은 전부 몬티홀에서 한 번씩 사고가 났던 자리다.
 * 도구마다 다시 쓰면 같은 사고가 도구 수만큼 난다.
 * DOM에 접근하지 않는다. 순수 함수만.
 */

/** 소수 자릿수를 판정할 때 쓰는 여유. 0.1+0.2 문제로 자릿수가 튀는 것을 막는다. */
const DECIMAL_EPSILON = 1e-9;
/** 자릿수 상한. 이보다 잘게 나오면 표기를 포기하고 상한을 쓴다. */
const DECIMAL_DIGITS_MAX = 4;

/** 값을 [min, max] 안으로 자른다. 숫자가 아니면 최솟값. */
export function num_clamp_value(value, minValue, maxValue) {
  if (!Number.isFinite(value)) return minValue;
  return Math.min(Math.max(value, minValue), maxValue);
}

/**
 * 문자열에서 십진수만 통과시킨다. 아니면 fallbackValue.
 *
 * `Number('')`는 0, `Number('0x10')`은 16, `Number(' 12 ')`는 12다.
 * 그래서 `??`나 `Number.isFinite`만으로는 깨진 입력이 걸러지지 않는다.
 * **걸러진 값은 최솟값이 아니라 기본값으로 돌아가야 한다** — 클램프에 맡기면
 * 공유된 URL의 시드가 조용히 1이 되어 다른 그림이 뜬다.
 */
export function num_read_decimal(raw, fallbackValue) {
  if (typeof raw !== 'string') return fallbackValue;
  const trimmed = raw.trim();
  if (trimmed === '') return fallbackValue;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return fallbackValue;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : fallbackValue;
}

/**
 * 이 간격을 오차 없이 적으려면 소수 몇 자리가 필요한가.
 *
 * 자릿수를 값의 '크기'로 정하면 간격 2.5에서 7.5가 "8"로 찍힌다 —
 * 화면의 숫자가 실제 값과 달라진다. 크기가 아니라 정밀도로 정한다.
 */
export function num_calculate_decimal_digits(step) {
  const size = Math.abs(step);
  if (!Number.isFinite(size) || size === 0) return 0;
  for (let digits = 0; digits < DECIMAL_DIGITS_MAX; digits += 1) {
    if (Math.abs(size - Number(size.toFixed(digits))) < DECIMAL_EPSILON) return digits;
  }
  return DECIMAL_DIGITS_MAX;
}

/** 큰 수를 천 단위로 끊어서. 사이트가 영문이므로 로케일을 고정한다. */
export function num_format_count(value) {
  return Number(value).toLocaleString('en-US');
}

/**
 * 개수에 맞는 단수/복수 표기를 고른다.
 *
 * 영어는 **정확히 1일 때만** 단수다. 0도 복수다("0 folds"). 그래서 조건을
 * 부르는 쪽마다 손으로 적으면 어느 한 곳이 빠지고, 스크린리더가 "1 doors opened"를
 * 읽는다 — 화면에는 아무 표시도 나지 않는다.
 *
 * 명사만 고르는 것이 아니라 **주어에 딸린 동사까지 함께 넘길 수 있다**:
 * `num_format_plural(n, 'tick is', 'ticks are')`. 동사 일치를 부르는 쪽에서
 * 삼항으로 적으면 그것이 곧 하드코딩이다.
 */
export function num_format_plural(count, singular, plural = `${singular}s`) {
  return Math.abs(count) === 1 ? singular : plural;
}

/**
 * 값이 몇 자릿수인지 (10의 지수). 0 이하는 null —
 * `log10(0)`은 -Infinity, `log10(음수)`는 NaN이라 그대로 두면
 * 축 눈금 루프가 무한루프가 된다. **예외가 아니라 탭이 얼어붙는다.**
 */
export function num_read_decade(value) {
  if (!(value > 0) || !Number.isFinite(value)) return null;
  return Math.floor(Math.log10(value));
}
