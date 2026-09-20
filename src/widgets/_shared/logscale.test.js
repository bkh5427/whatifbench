/**
 * 로그 축 매핑과 길이 표기 테스트.
 *
 * 여기서 지켜야 할 것은 값 하나가 아니라 **성질**이다:
 * 같은 배수는 자 위에서 언제나 같은 거리여야 한다.
 * 그 성질이 깨지면 종이접기 위젯의 그림이 논지와 반대되는 말을 한다.
 */

import { describe, it, expect } from 'vitest';
import {
  LOGSCALE_BELOW,
  LOGSCALE_ABOVE,
  LOGSCALE_INSIDE,
  logscale_calculate_position,
  logscale_calculate_step_ratio,
  logscale_build_decades,
  logscale_pick_label_decades,
} from './logscale.js';
import {
  units_format_exponent,
  units_format_significant,
  units_format_scientific,
  units_format_length,
  units_format_count_words,
} from './units.js';
import { RAIL_LOW_M, RAIL_HIGH_M } from '../folding-paper-moon/widget.js';

// 자의 양 끝은 **프로덕션에서 그대로 가져온다.** 여기에 1e-5/1e12를 다시 적어 두면
// 위젯이 범위를 바꿔도 이 파일은 옛 값으로 계속 통과한다 — 접기 한 칸의 픽셀 폭이
// 통째로 달라지는데 아무 테스트도 실패하지 않는다.
const LOW = RAIL_LOW_M;
const HIGH = RAIL_HIGH_M;
/** 자가 덮는 데케이드 수. 아래 단언들이 이 숫자에 걸려 있다. */
const RAIL_DECADE_SPAN = 17;

describe('로그 자 — 같은 배수는 같은 거리다', () => {
  it('두 배씩 늘어나는 값들의 간격이 전부 같다 — 이 위젯의 논지 그 자체', () => {
    const gaps = [];
    let value = 1e-4;
    let previous = logscale_calculate_position(value, LOW, HIGH).ratio;
    for (let fold = 1; fold <= 50; fold += 1) {
      value *= 2;
      const next = logscale_calculate_position(value, LOW, HIGH).ratio;
      gaps.push(next - previous);
      previous = next;
    }
    const first = gaps[0];
    for (const gap of gaps) expect(gap).toBeCloseTo(first, 12);
    // 그리고 그 간격은 step_ratio가 말하는 값과 같아야 한다
    expect(first).toBeCloseTo(logscale_calculate_step_ratio(2, LOW, HIGH), 12);
  });

  it('한 칸의 크기가 log10(2)/전체 데케이드다', () => {
    // 자의 범위가 10⁻⁵~10¹²(17데케이드)라는 것에 이 값이 걸려 있다.
    // 위젯이 범위를 바꾸면 LOW/HIGH가 따라 바뀌어 여기서 갈라진다.
    expect(Math.log10(HIGH) - Math.log10(LOW)).toBeCloseTo(RAIL_DECADE_SPAN, 12);
    // 한 번 접기 = log10(2) = 0.30103데케이드.
    expect(logscale_calculate_step_ratio(2, LOW, HIGH)).toBeCloseTo(Math.log10(2) / RAIL_DECADE_SPAN, 12);
    // 10배는 정확히 한 데케이드
    expect(logscale_calculate_step_ratio(10, LOW, HIGH)).toBeCloseTo(1 / RAIL_DECADE_SPAN, 12);
  });

  it('양 끝이 0과 1이다', () => {
    expect(logscale_calculate_position(LOW, LOW, HIGH).ratio).toBe(0);
    expect(logscale_calculate_position(HIGH, LOW, HIGH).ratio).toBe(1);
  });

  it('구간을 벗어나면 자르되 잘렸다고 알린다 — 조용히 끝에 붙이지 않는다', () => {
    const under = logscale_calculate_position(1e-9, LOW, HIGH);
    expect(under.ratio).toBe(0);
    expect(under.clipped).toBe(LOGSCALE_BELOW);
    expect(under.raw).toBeLessThan(0);

    const over = logscale_calculate_position(1e20, LOW, HIGH);
    expect(over.ratio).toBe(1);
    expect(over.clipped).toBe(LOGSCALE_ABOVE);
    expect(over.raw).toBeGreaterThan(1);

    expect(logscale_calculate_position(1, LOW, HIGH).clipped).toBe(LOGSCALE_INSIDE);
  });

  it('유효하지 않은 입력에서 NaN 좌표를 만들지 않고 null을 낸다', () => {
    expect(logscale_calculate_position(0, LOW, HIGH)).toBe(null);
    expect(logscale_calculate_position(-1, LOW, HIGH)).toBe(null);
    expect(logscale_calculate_position(NaN, LOW, HIGH)).toBe(null);
    expect(logscale_calculate_position(1, 0, HIGH)).toBe(null);
    expect(logscale_calculate_position(1, HIGH, LOW)).toBe(null); // 뒤집힌 구간
    expect(logscale_calculate_position(1, LOW, LOW)).toBe(null); // 폭 0
    expect(logscale_calculate_step_ratio(1, LOW, HIGH)).toBe(null); // 1배는 움직이지 않는다
    expect(logscale_calculate_step_ratio(2, 0, HIGH)).toBe(null);
  });

  it('자 전체를 덮는 데케이드 목록이 맞다', () => {
    expect(logscale_build_decades(1e-5, 1e12)).toHaveLength(18); // -5 … 12
    expect(logscale_build_decades(1e-5, 1e12)[0]).toBe(-5);
    expect(logscale_build_decades(1e-5, 1e12)[17]).toBe(12);
    expect(logscale_build_decades(2, 900)).toEqual([1, 2]); // 10, 100만 들어온다
    expect(logscale_build_decades(0, 10)).toEqual([]);
    expect(logscale_build_decades(10, 1)).toEqual([]);
  });

  it('라벨을 솎아도 양 끝은 남는다 — 자의 범위를 모르면 위치를 못 읽는다', () => {
    const decades = logscale_build_decades(1e-5, 1e12);
    expect(decades).toHaveLength(18);
    // 몇 개가 남는지를 못박는다. `kept.length <= decades.length`는 구조상 거의
    // 항상 참이라 솎기가 통째로 죽어도 통과한다.
    // 남는 개수 = ceil(18/n), 마지막 인덱스 17이 그 안에 없으면 +1.
    const expectedLengths = { 1: 18, 2: 10, 3: 7, 4: 6, 5: 5 };
    for (const everyNth of [1, 2, 3, 4, 5]) {
      const kept = logscale_pick_label_decades(decades, everyNth);
      expect(kept[0]).toBe(-5);
      expect(kept[kept.length - 1]).toBe(12);
      expect(new Set(kept).size).toBe(kept.length); // 중복 없음
      expect(kept).toHaveLength(expectedLengths[everyNth]);
    }
    expect(logscale_pick_label_decades([], 2)).toEqual([]);
    expect(logscale_pick_label_decades(decades, 0)).toHaveLength(decades.length); // 0은 1로 본다
  });

  it('간격이 0 이하로 들어와도 전부 남긴다 — 음수 나머지는 반대로 솎는다', () => {
    // `Math.max(1, …)`을 지우면 step이 음수가 되고, `index % -2 === 0`은
    // 짝수 인덱스만 통과시켜 라벨 절반이 조용히 사라진다.
    // 음수 경로에 테스트가 없어 그 삭제가 그대로 살아남았다.
    const decades = logscale_build_decades(1e-5, 1e12);
    expect(logscale_pick_label_decades(decades, -2)).toEqual(decades);
    expect(logscale_pick_label_decades(decades, -3)).toEqual(decades);
    expect(logscale_pick_label_decades(decades, NaN)).toEqual(decades);
    expect(logscale_pick_label_decades(decades, 0.4)).toEqual(decades); // 반올림하면 0 → 1
  });

  it('마지막 데케이드가 stride를 무시하고 들어와 앞 라벨과 붙는다 — spacing을 주면 그것을 버린다', () => {
    // 이것이 감사에서 잡힌 결함이다. stride 계산은 `stride × gapPx ≥ 최소간격`을
    // 만족시키지만, 마지막 하나는 stride와 무관하게 밀려 들어오므로
    // **마지막 두 라벨 사이만 gapPx 한 칸**이 된다.
    const decades = logscale_build_decades(1e-5, 1e12);
    const gapPx = 17.588235294117645; // 375px 화면의 plotWidth 299 ÷ 17데케이드
    const minGapPx = 34;

    // spacing 없이 = 고치기 전 동작. 10¹¹과 10¹²가 한 칸(17.6px) 간격으로 남는다.
    const unchecked = logscale_pick_label_decades(decades, 2);
    expect(unchecked.slice(-2)).toEqual([11, 12]);

    const checked = logscale_pick_label_decades(decades, 2, { gapPx, minGapPx });
    expect(checked).toEqual([-5, -3, -1, 1, 3, 5, 7, 9, 12]);
    // 양 끝은 남기고 가운데부터 버린다 — 사라진 것은 10¹²가 아니라 10¹¹이다
    expect(checked[0]).toBe(-5);
    expect(checked[checked.length - 1]).toBe(12);
    for (let i = 1; i < checked.length; i += 1) {
      const gap = (decades.indexOf(checked[i]) - decades.indexOf(checked[i - 1])) * gapPx;
      expect(gap).toBeGreaterThanOrEqual(minGapPx);
    }
  });

  it('spacing이 없거나 말이 안 되면 예전처럼 stride만으로 솎는다', () => {
    const decades = logscale_build_decades(1e-5, 1e12);
    const strideOnly = logscale_pick_label_decades(decades, 3);
    expect(logscale_pick_label_decades(decades, 3, null)).toEqual(strideOnly);
    expect(logscale_pick_label_decades(decades, 3, { gapPx: 0, minGapPx: 34 })).toEqual(strideOnly);
    expect(logscale_pick_label_decades(decades, 3, { gapPx: 20, minGapPx: 0 })).toEqual(strideOnly);
    // 간격이 넉넉하면 아무것도 버리지 않는다
    expect(logscale_pick_label_decades(decades, 1, { gapPx: 100, minGapPx: 34 })).toEqual(decades);
  });
});

describe('길이 표기', () => {
  it('단위가 mm → m → km로 바뀐다', () => {
    expect(units_format_length(0.0001)).toBe('0.1 mm');
    expect(units_format_length(0.0128)).toBe('0.0128 m');
    expect(units_format_length(3.2768)).toBe('3.277 m');
    expect(units_format_length(13421.77)).toBe('13.42 km');
    expect(units_format_length(384400000)).toBe('384,400 km');
  });

  it('km로도 감당이 안 되면 지수 표기로 넘어간다', () => {
    expect(units_format_length(1.495978707e11)).toBe('1.496 × 10¹¹ m');
    // 42번 접기의 필요 길이. "× 10¹⁸ km"로 적으면 본문의 표기와 갈라진다.
    expect(units_format_length(1.01279e21)).toBe('1.013 × 10²¹ m');
  });

  it('km → 지수 표기 임계가 10⁷ km다 — 경계 양쪽을 짚는다', () => {
    // 임계를 10⁸로 올리면 **기준 목록의 실제 행인 수성 궤도**(5.7909×10¹⁰ m)의
    // 표기가 "57,909,000 km"로 바뀐다. 그 한 줄이 자와 표에서 갈라진다.
    expect(units_format_length(5.7909e10)).toBe('5.791 × 10¹⁰ m'); // 수성 궤도
    expect(units_format_length(1e10)).toBe('1 × 10¹⁰ m');          // 정확히 10⁷ km — 넘어간다
    expect(units_format_length(9.999e9)).toBe('9,999,000 km');     // 바로 아래 — km로 남는다
  });

  it('위첨자 지수를 만든다', () => {
    expect(units_format_exponent(8)).toBe('10⁸');
    expect(units_format_exponent(12)).toBe('10¹²');
    expect(units_format_exponent(-5)).toBe('10⁻⁵');
    expect(units_format_exponent(0)).toBe('10⁰');
  });

  it('지수 표기가 본문이 인쇄하는 문자열과 같다', () => {
    // 초안 블록 4·6이 "4.398 × 10⁸ m"라고 적는다
    expect(units_format_scientific(4.398046511104e8)).toBe('4.398 × 10⁸');
    expect(units_format_scientific(-4.398046511104e8)).toBe('−4.398 × 10⁸');
  });

  it('반올림이 자릿수를 넘길 때 지수를 올린다 — "10 × 10⁷"이 나오면 안 된다', () => {
    expect(units_format_scientific(9.9999e7, 4)).toBe('1 × 10⁸');
    expect(units_format_scientific(9.9e7, 1)).toBe('1 × 10⁸');
  });

  it('꼬리 0을 남기지 않는다', () => {
    expect(units_format_significant(12.8, 4)).toBe('12.8');
    expect(units_format_significant(1, 4)).toBe('1');
    expect(units_format_significant(0.30000000000000004, 4)).toBe('0.3');
  });

  it('0과 유한하지 않은 값에서 죽지 않는다', () => {
    expect(units_format_length(0)).toBe('0 m');
    expect(units_format_length(NaN)).toBe('NaN');
    expect(units_format_length(Infinity)).toBe('Infinity');
    expect(units_format_scientific(0)).toBe('0');
  });

  it('겹 수를 말로 짧게 줄인다 — 열세 자리는 아무도 읽지 못한다', () => {
    expect(units_format_count_words(Math.pow(2, 42))).toBe('4.4 trillion');
    expect(units_format_count_words(Math.pow(2, 20))).toBe('1 million');
    expect(units_format_count_words(128)).toBe('128');
    expect(units_format_count_words(32768)).toBe('33 thousand');
    // 슬라이더 상한 2⁵⁰. "1100 trillion"으로 나오면 자릿수 이름이 모자란 것이다.
    expect(units_format_count_words(Math.pow(2, 50))).toBe('1.1 quadrillion');
  });
});
