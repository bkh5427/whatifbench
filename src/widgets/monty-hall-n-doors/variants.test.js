/**
 * 블록 7이 단언하는 변형 규칙들을 전수열거로 고정한다.
 *
 * 왜 별도 파일인가:
 *   model.test.js의 검증은 전부 몬테카를로다. 본문 블록 7은 위젯이 계산하지 않는
 *   두 가지 변형("무작위로 여는 호스트는 50:50", "최소번호 습관 호스트는 N=4·K=1에서 50%")을
 *   숫자로 단언하는데, 그 숫자의 근거가 저장소 밖 손계산 한 번뿐이었다.
 *   여기서는 유한 확률공간을 통째로 열거하고 BigInt 분수로 정확히 더한다.
 *   난수를 쓰지 않으므로 허용오차가 없다 — 틀리면 반드시 실패한다.
 *
 * 이것이 세 번째 경로다. ① 닫힌 형태(model.js) ② 몬테카를로(model.test.js)
 * ③ 전수열거(이 파일). 셋이 같은 값을 내야 신뢰한다.
 */

import { describe, it, expect } from 'vitest';
import {
  model_calculate_stay_win_rate,
  model_calculate_switch_win_rate,
  model_calculate_opened_max,
} from './model.js';

// ── 열거 범위 ────────────────────────────────────────────────
// 상태 수는 N^2 × C(N-1, K)로 자란다. N=8이면 최악 8·8·35 = 2,240가지.
const ENUM_DOOR_MIN = 3;
const ENUM_DOOR_MAX = 8;

// ── 정확한 유리수 산술 (BigInt) ───────────────────────────────
// 부동소수점을 쓰면 "50%"를 0.5000000000000001과 비교하게 되고,
// 그때 허용오차를 넣는 순간 이 파일의 존재 이유가 사라진다.

function frac_read_gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

function frac_create(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error('분모가 0이다.');
  const sign = denominator < 0n ? -1n : 1n;
  const n = numerator * sign;
  const d = denominator * sign;
  const g = frac_read_gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

function frac_calculate_add(a, b) {
  return frac_create(a.n * b.d + b.n * a.d, a.d * b.d);
}

function frac_calculate_multiply(a, b) {
  return frac_create(a.n * b.n, a.d * b.d);
}

function frac_check_equal(a, b) {
  return a.n === b.n && a.d === b.d;
}

function frac_check_greater(a, b) {
  return a.n * b.d > b.n * a.d;
}

function frac_format_number(a) {
  return Number(a.n) / Number(a.d);
}

const FRAC_ZERO = frac_create(0n);
const FRAC_ONE = frac_create(1n);

// ── 조합 열거 ────────────────────────────────────────────────

/** items에서 size개를 고르는 모든 조합. 순서는 무시한다. */
function enum_build_combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...rest] = items;
  const withHead = enum_build_combinations(rest, size - 1).map((c) => [head, ...c]);
  const withoutHead = enum_build_combinations(rest, size);
  return [...withHead, ...withoutHead];
}

// ── 호스트 규칙 ──────────────────────────────────────────────
// 각 규칙은 (문 개수, 상품 문, 참가자 문, 개방 수) → [{ opened, weight }] 를 낸다.
// weight는 그 개방 조합이 나올 조건부 확률이다. 합이 1이 아니어도 된다
// (무작위 호스트는 상품을 열어버린 경우를 아예 내놓지 않는다 — 그게 조건부 관측이다).

const HOST_RULES = {
  /** 본문·model.js의 규칙: 상품과 참가자 문을 뺀 꽝 문 중 K개를 균등하게 연다. */
  'uniform-losing'(doorCount, prizeDoor, playerDoor, openedCount) {
    const losing = [];
    for (let d = 0; d < doorCount; d += 1) {
      if (d !== playerDoor && d !== prizeDoor) losing.push(d);
    }
    const combos = enum_build_combinations(losing, openedCount);
    const weight = frac_create(1n, BigInt(combos.length));
    return combos.map((opened) => ({ opened, weight }));
  },

  /** 습관이 있는 호스트: 열 수 있는 꽝 문 중 번호가 낮은 것부터 K개. 결정적이다. */
  'lowest-losing'(doorCount, prizeDoor, playerDoor, openedCount) {
    const losing = [];
    for (let d = 0; d < doorCount; d += 1) {
      if (d !== playerDoor && d !== prizeDoor) losing.push(d);
    }
    return [{ opened: losing.slice(0, openedCount), weight: FRAC_ONE }];
  },

  /**
   * 상품 위치를 모르는 호스트: 참가자 문을 뺀 전부에서 K개를 균등하게 연다.
   * 상품을 열어버린 조합은 내놓지 않는다 — 본문이 말하는
   * "상품이 우연히 숨어 있던 게임으로 한정한" 관측이 이것이다.
   */
  'uniform-any'(doorCount, prizeDoor, playerDoor, openedCount) {
    const unpicked = [];
    for (let d = 0; d < doorCount; d += 1) {
      if (d !== playerDoor) unpicked.push(d);
    }
    const combos = enum_build_combinations(unpicked, openedCount);
    const weight = frac_create(1n, BigInt(combos.length));
    return combos
      .filter((opened) => !opened.includes(prizeDoor))
      .map((opened) => ({ opened, weight }));
  },
};

// ── 전수열거 ─────────────────────────────────────────────────

/**
 * 유한 확률공간을 통째로 돌면서 유지·스위치 승률을 정확히 더한다.
 *
 * playerRule:
 *   'uniform' — 남은 문 중 하나를 균등하게 고른다 (본문 모델의 가정)
 *   'bayes'   — 열린 문이 무엇인지까지 보고 사후확률이 가장 높은 문을 고른다
 *               (호스트의 습관에서 정보가 새는지 보려면 이쪽이어야 한다)
 *
 * 반환값의 승률은 **관측된 게임으로 조건부**다. 무작위 호스트에서 상품이
 * 드러난 게임은 분모에서도 빠진다.
 */
function enum_calculate_win_rates(doorCount, openedCount, hostRule, playerRule) {
  const host = HOST_RULES[hostRule];
  if (!host) throw new Error(`알 수 없는 호스트 규칙: ${hostRule}`);
  if (playerRule !== 'uniform' && playerRule !== 'bayes') {
    throw new Error(`알 수 없는 참가자 규칙: ${playerRule}`);
  }

  const uniform = frac_create(1n, BigInt(doorCount * doorCount)); // 상품 × 참가자
  // 관측(참가자 문 + 열린 문 집합)별로 상품 위치의 결합확률을 모은다.
  const observations = new Map();
  let observedTotal = FRAC_ZERO;
  let stayWin = FRAC_ZERO;

  for (let prizeDoor = 0; prizeDoor < doorCount; prizeDoor += 1) {
    for (let playerDoor = 0; playerDoor < doorCount; playerDoor += 1) {
      for (const branch of host(doorCount, prizeDoor, playerDoor, openedCount)) {
        const weight = frac_calculate_multiply(uniform, branch.weight);
        observedTotal = frac_calculate_add(observedTotal, weight);
        if (prizeDoor === playerDoor) stayWin = frac_calculate_add(stayWin, weight);

        const key = `${playerDoor}|${[...branch.opened].sort((a, b) => a - b).join(',')}`;
        let entry = observations.get(key);
        if (!entry) {
          const survivors = [];
          for (let d = 0; d < doorCount; d += 1) {
            if (d !== playerDoor && !branch.opened.includes(d)) survivors.push(d);
          }
          entry = { survivors, byPrize: new Map(), total: FRAC_ZERO };
          observations.set(key, entry);
        }
        entry.total = frac_calculate_add(entry.total, weight);
        entry.byPrize.set(
          prizeDoor,
          frac_calculate_add(entry.byPrize.get(prizeDoor) ?? FRAC_ZERO, weight)
        );
      }
    }
  }

  let switchWin = FRAC_ZERO;
  for (const entry of observations.values()) {
    if (entry.survivors.length === 0) continue;
    if (playerRule === 'uniform') {
      // 남은 문 하나하나를 같은 확률로 집는다.
      const share = frac_create(1n, BigInt(entry.survivors.length));
      for (const door of entry.survivors) {
        const w = entry.byPrize.get(door);
        if (w) switchWin = frac_calculate_add(switchWin, frac_calculate_multiply(w, share));
      }
    } else {
      // 사후확률이 가장 큰 문 하나로 간다. 동률이면 어느 쪽이든 값이 같다.
      let best = FRAC_ZERO;
      for (const door of entry.survivors) {
        const w = entry.byPrize.get(door) ?? FRAC_ZERO;
        if (frac_check_greater(w, best)) best = w;
      }
      switchWin = frac_calculate_add(switchWin, best);
    }
  }

  // 관측된 게임으로 나눈다. 무작위 호스트에서는 observedTotal < 1 이다.
  // 여기서 역수를 취하므로 관측된 게임이 하나도 없으면 나누기가 안 된다.
  // 그대로 두면 `frac_create`가 '분모가 0이다'라는 엉뚝한 이유로 터져
  // 진짜 원인(살아남은 관측이 없다)을 가린다.
  if (observedTotal.n === 0n) throw new Error(`관측된 게임이 없다: N=${doorCount}, K=${openedCount}, 호스트=${hostRule}`);
  const scale = frac_create(observedTotal.d, observedTotal.n);
  return {
    stay: frac_calculate_multiply(stayWin, scale),
    switch: frac_calculate_multiply(switchWin, scale),
    observedShare: observedTotal,
  };
}

/** (N, K) 유효 조합 전부. */
function enum_build_parameter_grid(doorMax = ENUM_DOOR_MAX) {
  const grid = [];
  for (let doorCount = ENUM_DOOR_MIN; doorCount <= doorMax; doorCount += 1) {
    for (let openedCount = 1; openedCount <= model_calculate_opened_max(doorCount); openedCount += 1) {
      grid.push({ doorCount, openedCount });
    }
  }
  return grid;
}

// ══════════════════════════════════════════════════════════════
// 1. 열거기 자체를 먼저 못박는다 — 틀린 자로 재면 아무것도 검증하지 못한다
// ══════════════════════════════════════════════════════════════

describe('전수열거기 자체 검사', () => {
  it('조합 개수가 이항계수와 같다', () => {
    expect(enum_build_combinations([0, 1, 2, 3], 0)).toEqual([[]]);
    expect(enum_build_combinations([0, 1, 2, 3], 2)).toHaveLength(6);
    expect(enum_build_combinations([0, 1, 2, 3, 4], 3)).toHaveLength(10);
    expect(enum_build_combinations([0, 1], 3)).toHaveLength(0);
  });

  it('열거 범위가 줄어들면 실패한다 — 격자를 좁히는 것은 검증을 좁히는 것이다', () => {
    // 표본을 줄여도 전부 통과하면 그 테스트는 범위를 지키지 않는다.
    // 몬티홀에서 표본 점을 140→3으로 줄여도 통과한 적이 있다. 같은 실수를 막는다.
    const grid = enum_build_parameter_grid();
    expect(ENUM_DOOR_MAX).toBe(8);
    expect(grid).toHaveLength(21);
    expect(grid[0]).toEqual({ doorCount: 3, openedCount: 1 });
    expect(grid[grid.length - 1]).toEqual({ doorCount: 8, openedCount: 6 });
  });

  it('습관 호스트가 실제로 낮은 번호부터 연다 — 규칙 자체를 못박는다', () => {
    // 값(K+1)/N은 '가장 높은 번호부터'로 바꿔도 같다(문 번호를 다시 붙이면 같은 문제다).
    // 그래서 승률 테스트만으로는 이 규칙이 살아 있는지 알 수 없다. 규칙을 직접 본다.
    const branches = HOST_RULES['lowest-losing'](4, 1, 0, 1);
    expect(branches).toHaveLength(1);
    expect(branches[0].opened).toEqual([2]); // 상품이 1번, 참가자가 0번 → 꽝은 {2,3}, 최소는 2
    expect(HOST_RULES['lowest-losing'](5, 0, 2, 2)[0].opened).toEqual([1, 3]);
  });

  it('분수 산술이 부동소수점으로 새지 않는다', () => {
    const third = frac_create(1n, 3n);
    let sum = FRAC_ZERO;
    for (let i = 0; i < 3; i += 1) sum = frac_calculate_add(sum, third);
    expect(frac_check_equal(sum, FRAC_ONE)).toBe(true); // 0.1+0.2 문제가 없다
  });

  it('상품을 아는 호스트는 게임을 하나도 버리지 않는다', () => {
    for (const { doorCount, openedCount } of enum_build_parameter_grid()) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      expect(frac_check_equal(r.observedShare, FRAC_ONE)).toBe(true);
    }
  });

  it('확률의 합이 R=1에서만 정확히 1이고 나머지에서는 그보다 작다', () => {
    // '1을 넘지 않는다'만 걸면 거의 아무것도 지키지 못한다.
    // 바꿔갈 문이 하나만 남으면 지거나 이기거나 둘 뿐이므로 합이 정확히 1이다.
    for (const { doorCount, openedCount } of enum_build_parameter_grid()) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      const total = frac_calculate_add(r.stay, r.switch);
      if (doorCount - 1 - openedCount === 1) {
        expect(frac_check_equal(total, FRAC_ONE)).toBe(true);
      } else {
        expect(frac_check_greater(FRAC_ONE, total)).toBe(true);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 본체 모델 — 닫힌 형태를 유도가 아닌 열거로 대조한다
// ══════════════════════════════════════════════════════════════

describe('닫힌 형태 대조 — 전수열거는 유도식을 쓰지 않는다', () => {
  const grid = enum_build_parameter_grid();

  it(`유효 조합 ${grid.length}가지에서 유지 승률이 1/N과 정확히 같다`, () => {
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      expect(frac_check_equal(r.stay, frac_create(1n, BigInt(doorCount)))).toBe(true);
      expect(frac_format_number(r.stay)).toBeCloseTo(model_calculate_stay_win_rate(doorCount), 12);
    }
  });

  it(`유효 조합 ${grid.length}가지에서 스위치 승률이 (N-1)/(N(N-1-K))와 정확히 같다`, () => {
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      const expected = frac_create(
        BigInt(doorCount - 1),
        BigInt(doorCount) * BigInt(doorCount - 1 - openedCount)
      );
      expect(frac_check_equal(r.switch, expected)).toBe(true);
      expect(frac_format_number(r.switch)).toBeCloseTo(
        model_calculate_switch_win_rate(doorCount, openedCount),
        12
      );
    }
  });

  it('N=3, K=1은 정확히 1/3과 2/3이다 — 브리프의 검수 포인트', () => {
    const r = enum_calculate_win_rates(3, 1, 'uniform-losing', 'uniform');
    expect(frac_check_equal(r.stay, frac_create(1n, 3n))).toBe(true);
    expect(frac_check_equal(r.switch, frac_create(2n, 3n))).toBe(true);
  });

  it('N=4, K=1은 정확히 25.0%와 37.5%다 — 블록 6이 손으로 따라가는 값', () => {
    const r = enum_calculate_win_rates(4, 1, 'uniform-losing', 'uniform');
    expect(frac_check_equal(r.stay, frac_create(1n, 4n))).toBe(true);
    expect(frac_check_equal(r.switch, frac_create(3n, 8n))).toBe(true);
    // 본문이 인쇄하는 문자열 그대로
    expect((frac_format_number(r.stay) * 100).toFixed(1)).toBe('25.0');
    expect((frac_format_number(r.switch) * 100).toFixed(1)).toBe('37.5');
    // 블록 6의 마지막 줄: 25.0 + 37.5 + 37.5 = 100
    const lose = frac_calculate_add(r.stay, r.switch);
    expect((100 - frac_format_number(lose) * 100).toFixed(1)).toBe('37.5');
  });
});

// ══════════════════════════════════════════════════════════════
// 3. 블록 7이 단언하는 변형들 — 위젯이 계산하지 않는 숫자들
// ══════════════════════════════════════════════════════════════

describe('블록 7 — 무작위로 여는 호스트는 유지와 스위치를 같게 만든다', () => {
  const grid = enum_build_parameter_grid();

  it(`유효 조합 ${grid.length}가지 전부에서 두 승률이 정확히 같다`, () => {
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-any', 'uniform');
      expect(frac_check_equal(r.stay, r.switch)).toBe(true);
    }
  });

  it('공통값은 1/2가 아니라 1/(N−K)다 — 본문의 "level"은 같다는 뜻이지 절반이 아니다', () => {
    // N=3, K=1에서만 우연히 1/2이다. 이걸 ‘무작위 호스트 = 반반’으로 읽으면 틀린다.
    for (const { doorCount, openedCount } of enum_build_parameter_grid()) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-any', 'uniform');
      const expected = frac_create(1n, BigInt(doorCount - openedCount));
      expect(frac_check_equal(r.switch, expected)).toBe(true);
    }
    const three = enum_calculate_win_rates(3, 1, 'uniform-any', 'uniform');
    expect(frac_format_number(three.switch)).toBe(0.5);
    const hundredish = enum_calculate_win_rates(8, 1, 'uniform-any', 'uniform');
    expect(frac_check_equal(hundredish.switch, frac_create(1n, 7n))).toBe(true);
  });

  it('조건부 관측이라는 사실이 분모에 실제로 반영된다', () => {
    // 상품이 드러나 버려진 게임이 있어야 이 변형이 성립한다.
    // 버려지는 몫이 0이면 위 등식은 공짜로 참이 되고 아무것도 검증하지 못한다.
    const r = enum_calculate_win_rates(3, 1, 'uniform-any', 'uniform');
    expect(frac_check_greater(FRAC_ONE, r.observedShare)).toBe(true);
    expect(frac_check_equal(r.observedShare, frac_create(2n, 3n))).toBe(true); // (N-K)/N
    // 한 점만 보면 조건화가 사실상 미검증이다 — stay·switch가 같은 인자로 나뉘어
    // 등식 테스트는 분모가 틀려도 통과한다. 격자 전체에서 분모를 따로 본다.
    for (const { doorCount, openedCount } of enum_build_parameter_grid()) {
      const each = enum_calculate_win_rates(doorCount, openedCount, 'uniform-any', 'uniform');
      const expected = frac_create(BigInt(doorCount - openedCount), BigInt(doorCount));
      expect(frac_check_equal(each.observedShare, expected)).toBe(true);
      expect(frac_check_greater(FRAC_ONE, each.observedShare)).toBe(true);
    }
  });

  it('사후확률을 최대로 써도 무작위 호스트에서는 정확히 비김이다', () => {
    // `≤`로 걸면 등호만으로 통과해 아무것도 지키지 못한다.
    // 이 호스트는 열린 문에서 정보가 새지 않으므로 두 값이 같다 — 등식으로 못박는다.
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'uniform-any', 'bayes');
      expect(frac_check_equal(r.switch, r.stay)).toBe(true);
    }
  });
});

describe('블록 7 — 최소번호 습관 호스트는 열린 문으로 정보를 흘린다', () => {
  const grid = enum_build_parameter_grid();

  it('N=4, K=1에서 정확히 50%다 — 본문이 37.5%와 나란히 적은 값', () => {
    const biased = enum_calculate_win_rates(4, 1, 'lowest-losing', 'bayes');
    const plain = enum_calculate_win_rates(4, 1, 'uniform-losing', 'uniform');
    expect(frac_check_equal(biased.switch, frac_create(1n, 2n))).toBe(true);
    expect(frac_check_equal(plain.switch, frac_create(3n, 8n))).toBe(true);
    expect((frac_format_number(biased.switch) * 100).toFixed(1)).toBe('50.0');
    expect((frac_format_number(plain.switch) * 100).toFixed(1)).toBe('37.5');
  });

  it('습관 호스트 + 습관을 읽는 참가자의 승률은 정확히 (K+1)/N이다', () => {
    // 닫힌 형태를 잔기지 21개 전부에서 못박는다.
    // 한 점(N=4, K=1)과 부등식만 걸면 열거 로직이 틀려도 빠져나갈 수 있다.
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      expect(frac_check_equal(r.switch, frac_create(BigInt(openedCount + 1), BigInt(doorCount)))).toBe(true);
    }
  });

  it('습관이 있어도 유지 승률은 1/N 그대로다 — 새는 정보는 스위치 쪽에만 붙는다', () => {
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      expect(frac_check_equal(r.stay, frac_create(1n, BigInt(doorCount)))).toBe(true);
    }
  });

  it('바꿔갈 문이 2개 이상이면 습관 모델이 본문 모델보다 높다', () => {
    let checked = 0;
    for (const { doorCount, openedCount } of grid) {
      if (doorCount - 1 - openedCount < 2) continue;
      const biased = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      const plain = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      expect(frac_check_greater(biased.switch, plain.switch)).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0); // 조건이 아무것도 안 걸러 통과하는 일이 없게
  });

  it('바꿔갈 문이 1개면 두 모델이 일치한다 — 고를 것이 없으면 샐 곳도 없다', () => {
    let checked = 0;
    for (const { doorCount, openedCount } of grid) {
      if (doorCount - 1 - openedCount !== 1) continue;
      const biased = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      const plain = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      expect(frac_check_equal(biased.switch, plain.switch)).toBe(true);
      expect(frac_check_equal(biased.switch, frac_create(BigInt(doorCount - 1), BigInt(doorCount)))).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('습관 호스트에서도 유지가 스위치보다 나아지는 조합은 없다', () => {
    for (const { doorCount, openedCount } of grid) {
      const r = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      expect(frac_check_greater(r.stay, r.switch)).toBe(false);
    }
  });

  it('습관을 읽는 참가자만 이득을 본다 — 같은 호스트, 다른 참가자', () => {
    // 앞의 테스트들은 호스트를 바꿔 비교했다. 그러면 `bayes` 분기가 죽어 있어도
    // 전부 통과한다. 여기서는 **호스트를 고정하고 참가자만** 바꿔 둘을 대조한다.
    let leaked = 0;
    for (const { doorCount, openedCount } of grid) {
      const naive = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'uniform');
      const reader = enum_calculate_win_rates(doorCount, openedCount, 'lowest-losing', 'bayes');
      const plain = enum_calculate_win_rates(doorCount, openedCount, 'uniform-losing', 'uniform');
      // 습관을 안 읽으면 호스트의 습관은 아무 의미가 없다
      expect(frac_check_equal(naive.switch, plain.switch)).toBe(true);
      if (doorCount - 1 - openedCount >= 2) {
        expect(frac_check_greater(reader.switch, naive.switch)).toBe(true);
        leaked += 1;
      } else {
        expect(frac_check_equal(reader.switch, naive.switch)).toBe(true);
      }
    }
    expect(leaked).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. 블록 7의 노이즈 단언 — 0.01%p 격차와 100만 시행의 표준오차
// ══════════════════════════════════════════════════════════════

describe('블록 7 — 100문·1개방에서 차이가 표본 노이즈에 묻힌다', () => {
  const DOOR_COUNT = 100;
  const OPENED_COUNT = 1;
  const TRIAL_MAX = 1000000;

  it('정확한 격차가 0.01%p 규모다', () => {
    const gap =
      model_calculate_switch_win_rate(DOOR_COUNT, OPENED_COUNT) -
      model_calculate_stay_win_rate(DOOR_COUNT);
    // 1/(N(N-2)) = 1/9800
    expect(gap).toBeCloseTo(1 / 9800, 12);
    expect((gap * 100).toFixed(2)).toBe('0.01');
  });

  it('슬라이더 최대 시행에서의 표준오차가 그 격차와 같은 자릿수다', () => {
    const p = model_calculate_stay_win_rate(DOOR_COUNT);
    const standardError = Math.sqrt((p * (1 - p)) / TRIAL_MAX);
    const gap =
      model_calculate_switch_win_rate(DOOR_COUNT, OPENED_COUNT) -
      model_calculate_stay_win_rate(DOOR_COUNT);
    // 본문: "the standard error at a million trials is about the same size"
    expect(gap / standardError).toBeGreaterThan(0.5);
    expect(gap / standardError).toBeLessThan(2);
  });
});
