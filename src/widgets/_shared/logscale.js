/**
 * 위젯 공통 — 로그 축 매핑.
 *
 * 로그 자(ruler)와 로그 축 차트가 같이 쓴다. DOM에 접근하지 않는다.
 *
 * 이 모듈의 존재 이유는 하나다: **로그 축에서 같은 배수는 언제나 같은 거리다.**
 * 종이접기 위젯의 논지가 그것이고, 그 성질이 코드에서 깨지면 그림이 거짓말을 한다.
 * 그래서 매핑을 한 군데 두고 테스트로 못박는다.
 */

import { num_read_decade } from './numbers.js';
import { ticks_drop_crowded } from './ticks.js';

/** 자의 양 끝에서 값이 벗어났을 때 어디에 붙일지. */
export const LOGSCALE_BELOW = 'below';
export const LOGSCALE_ABOVE = 'above';
export const LOGSCALE_INSIDE = 'inside';

/**
 * value를 [low, high] 로그 구간의 0~1 위치로. 구간 밖이면 0 또는 1로 자르되,
 * **잘렸다는 사실을 같이 돌려준다** — 조용히 끝에 붙이면 독자는 값이 끝에 있다고 읽는다.
 *
 * 유효하지 않은 입력(0 이하, NaN, low ≥ high)은 null. 좌표가 NaN이 되어
 * 아무것도 안 그려지는 것보다 호출부가 판단하게 하는 편이 낫다.
 */
export function logscale_calculate_position(value, low, high) {
  if (num_read_decade(value) === null) return null;
  if (num_read_decade(low) === null || num_read_decade(high) === null) return null;
  if (!(high > low)) return null;

  const span = Math.log10(high) - Math.log10(low);
  const raw = (Math.log10(value) - Math.log10(low)) / span;
  if (raw < 0) return { ratio: 0, clipped: LOGSCALE_BELOW, raw };
  if (raw > 1) return { ratio: 1, clipped: LOGSCALE_ABOVE, raw };
  return { ratio: raw, clipped: LOGSCALE_INSIDE, raw };
}

/**
 * 한 번 곱할 때(예: 두께가 2배) 자 위에서 움직이는 거리의 비율.
 * 이 값이 접기 횟수와 무관하게 **상수**라는 것이 로그 자의 논지 전체다.
 */
export function logscale_calculate_step_ratio(factor, low, high) {
  if (!(factor > 1) || num_read_decade(low) === null || num_read_decade(high) === null) return null;
  if (!(high > low)) return null;
  return Math.log10(factor) / (Math.log10(high) - Math.log10(low));
}

/**
 * [low, high] 안의 10의 거듭제곱 지수 목록. 예: (1e-5, 1e2) → [-5 … 2]
 * 지수를 돌려주는 이유는 라벨을 10ⁿ 꼴로 찍기 위해서다.
 */
export function logscale_build_decades(low, high) {
  const lowDecade = num_read_decade(low);
  const highDecade = num_read_decade(high);
  if (lowDecade === null || highDecade === null || !(high > low)) return [];
  const decades = [];
  for (let power = Math.ceil(Math.log10(low)); power <= Math.floor(Math.log10(high)); power += 1) {
    decades.push(power);
  }
  return decades;
}

/**
 * 자 위에 찍을 눈금을 솎아낸다. 데케이드가 많으면 전부 라벨을 달 수 없다.
 * `everyNth`는 몇 칸마다 라벨을 달 것인가 (좁은 화면에서 2, 3으로 늘린다).
 * 양 끝은 언제나 남긴다 — 자의 범위를 모르면 위치를 읽을 수 없다.
 *
 * `spacing = { gapPx, minGapPx }`를 주면 **간격 검사까지 한다.**
 * 주지 않으면 stride만으로 솎는다(픽셀을 모르는 호출부용).
 *
 * 왜 검사가 따로 필요한가: 마지막 데케이드는 stride와 무관하게 무조건 들어온다.
 * 그래서 `stride × gapPx ≥ minGapPx`를 만족시켜도 **마지막 두 라벨 사이만은
 * gapPx 한 칸**이 될 수 있다. 375px 화면에서 10¹¹과 10¹²가 17.6px 간격으로
 * 붙던 것이 그것이다 — stride 계산은 통과하는데 화면에서는 글자가 겹친다.
 * 겹치면 밀지 않고 버린다. 양 끝은 남기고 가운데부터 희생한다.
 */
export function logscale_pick_label_decades(decades, everyNth, spacing = null) {
  if (decades.length === 0) return [];
  const step = Math.max(1, Math.round(everyNth) || 1);
  const picked = [];
  for (let index = 0; index < decades.length; index += 1) {
    if (index % step === 0) picked.push({ power: decades[index], index });
  }
  const lastIndex = decades.length - 1;
  if (picked[picked.length - 1].index !== lastIndex) {
    picked.push({ power: decades[lastIndex], index: lastIndex });
  }
  if (!spacing || !(spacing.gapPx > 0) || !(spacing.minGapPx > 0)) {
    return picked.map((item) => item.power);
  }
  // 라벨 폭이 아니라 중심 간 거리로 잰다 — stride를 정할 때 쓴 잣대와 같아야
  // 두 계산이 같은 것을 말한다.
  const items = picked.map((item) => ({
    value: item.power,
    position: item.index * spacing.gapPx,
    width: 0,
  }));
  return ticks_drop_crowded(items, spacing.minGapPx).map((item) => item.value);
}
