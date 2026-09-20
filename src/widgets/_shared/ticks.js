/**
 * 위젯 공통 — 축 눈금.
 *
 * 눈금은 그림의 장식이 아니라 독자가 값을 읽는 유일한 통로다.
 * 여기서 틀리면 그래프는 멀쩡해 보이는데 밑에 적힌 숫자가 거짓이 된다.
 * DOM에 접근하지 않는다. 순수 함수만.
 */

import { num_read_decade } from './numbers.js';

const TICK_TARGET_COUNT = 5;
/** 1-2-2.5-5 계열. 사람이 암산으로 사이값을 짚을 수 있는 간격들. */
const TICK_MANTISSA = [1, 2, 2.5, 5];
/** 양 끝 라벨과 이만큼(축 폭 대비 비율)은 떨어져야 찍는다. 겹치면 서로 올라탄다. */
const TICK_EDGE_MIN_GAP_RATIO = 0.12;
/** 눈금 개수 상한. 이보다 많이 나오는 간격은 그릴 수 없는 간격이다. */
const TICK_MAX_COUNT = 1000;

/** 눈금 간격을 1-2-2.5-5 계열의 보기 좋은 값으로 고른다. */
export function ticks_calculate_step(span) {
  const rough = span / TICK_TARGET_COUNT;
  const decade = num_read_decade(rough);
  if (decade === null) return 0;
  const power = Math.pow(10, decade);
  for (const mantissa of TICK_MANTISSA) {
    if (rough <= mantissa * power) return mantissa * power;
  }
  return 10 * power;
}

/**
 * [low, high] 안의 선형 눈금 값들.
 * 축 경계를 눈금 배수로 바깥 스냅하지 않는다 — 애써 확대한 축이 도로 풀린다.
 */
export function ticks_build_linear(low, high, step) {
  if (!(step > 0) || !Number.isFinite(low) || !Number.isFinite(high) || high < low) return [];
  const first = Math.ceil(low / step) * step;
  // 부동소수점 누적을 피하려고 곱셈으로 만든다.
  const count = Math.floor((high - first) / step) + 1;
  // step이 아주 작으면 count가 천문학적이 되어 **예외가 아니라 브라우저가 멈춘다.**
  // 그런 간격은 그릴 수도 없으므로 아예 만들지 않는다.
  if (!Number.isFinite(count) || count > TICK_MAX_COUNT) return [];
  const values = [];
  for (let i = 0; i < count; i += 1) values.push(first + i * step);
  return values;
}

/**
 * 로그 축의 10의 거듭제곱 눈금. 양 끝값은 언제나 포함한다.
 *
 * `log10(0) = -Infinity`이고 `-Infinity + 1 = -Infinity`라, 가드 없이 이 루프를
 * 돌리면 **예외가 아니라 무한루프다 — 탭이 얼어붙는다.**
 */
export function ticks_build_decade(low, high, edgeGapRatio = TICK_EDGE_MIN_GAP_RATIO) {
  // 무한대도 막는다. `Math.floor(Infinity)`는 Infinity이고 `power += 1`이 영원히
  // 끝나지 않는다 — 예외가 아니라 탭이 얼어붙는다.
  if (!(low > 0) || !(high > 0) || !Number.isFinite(low) || !Number.isFinite(high)) {
    return [low, high];
  }

  const logLow = Math.log10(low);
  const logHigh = Math.log10(high);
  const logSpan = logHigh - logLow;
  const ticks = [low];
  if (logSpan > 0) {
    for (let power = Math.ceil(logLow); power <= Math.floor(logHigh); power += 1) {
      const value = Math.pow(10, power);
      const gapFromLow = (Math.log10(value) - logLow) / logSpan;
      const gapToHigh = (logHigh - Math.log10(value)) / logSpan;
      if (gapFromLow > edgeGapRatio && gapToHigh > edgeGapRatio) ticks.push(value);
    }
  }
  if (high !== low) ticks.push(high);
  return ticks;
}

/**
 * 라벨이 겹칠 때 **밀지 말고 버린다.** 밀면 앞 라벨 위로 올라탄다.
 * 양 끝은 남기고 가운데부터 희생한다.
 *
 * items: [{ value, position, width }] — position과 width는 같은 단위(px)여야 한다.
 */
export function ticks_drop_crowded(items, minGapPx) {
  if (items.length <= 2) return items.slice();
  // **위치 오름차순을 전제한다.** 세로 축의 라벨은 값이 커질수록 y가 작아져
  // 내림차순으로 들어오는데, 그대로 두면 간격이 전부 음수가 되어 가운데가
  // 통째로 버려진다. 여기서 한 번 정렬해 호출부가 순서를 신경 쓰지 않게 한다.
  const sorted = items.slice().sort((a, b) => a.position - b.position);
  const kept = [sorted[0]];
  const last = sorted[sorted.length - 1];
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const previous = kept[kept.length - 1];
    const gapBefore = sorted[i].position - previous.position - (previous.width + sorted[i].width) / 2;
    const gapAfter = last.position - sorted[i].position - (sorted[i].width + last.width) / 2;
    if (gapBefore >= minGapPx && gapAfter >= minGapPx) kept.push(sorted[i]);
  }
  kept.push(last);
  return kept;
}
