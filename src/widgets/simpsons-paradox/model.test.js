/**
 * 심슨의 역설 — 모델 단위테스트
 *
 * 여기서 지키려는 것은 셋이다.
 *   ① 프리셋 두 벌이 **실제로 역전을 재현하는가** (브리프의 검수 포인트)
 *   ② 합계 비율이 독립된 두 경로에서 같은 값을 내는가
 *      — 가중평균 경로(모델)와 정수 성공 건수의 합 경로(여기서 따로 계산)
 *   ③ 판정이 '엇갈림'을 '역전'으로 새어 보내지 않는가 (뮤테이션 점검)
 *
 * **같은 식을 한 번 더 부르는 것은 검증이 아니다.** 대조 경로는 전부
 * `reference_`·`enum_` 접두사로 이 파일 안에 따로 구현한다.
 */
import { describe, it, expect } from 'vitest';
import {
  SIMPSON_PRESETS,
  SIMPSON_SIZE_MIN,
  SIMPSON_SIZE_MAX,
  SIMPSON_RATE_MIN,
  SIMPSON_RATE_MAX,
  SIMPSON_RATE_EPSILON,
  SIMPSON_PRESET_DEFAULT,
  SIMPSON_VERDICT_AGREES,
  SIMPSON_VERDICT_TIED,
  SIMPSON_VERDICT_MIXED,
  SIMPSON_VERDICT_REVERSED,
  SIMPSON_VERDICT_TONE,
  model_read_preset,
  model_clamp_size,
  model_clamp_rate,
  model_check_parameters,
  model_calculate_preset_state,
  model_calculate_group_weight,
  model_calculate_pooled_rate,
  model_calculate_success_count,
  model_calculate_lead,
  model_calculate_reversal_state,
  model_calculate_result,
  model_calculate_decomposition,
} from './model.js';

// ── 대조 경로 ────────────────────────────────────────────────

/**
 * 합계 비율을 **정수 성공 건수의 합**으로 낸다. 모델의 가중평균과 독립이다.
 * 프리셋은 정수 카운트로 들어가므로 두 경로가 부동소수 오차 안에서 정확히 맞아야 한다.
 */
function reference_calculate_pooled_from_counts(counts, option) {
  const first = counts[`${option}1`];
  const second = counts[`${option}2`];
  return (first.success + second.success) / (first.size + second.size);
}

/** 프리셋의 그룹별 비율을 카운트에서 직접. */
function reference_calculate_group_rate(counts, cell) {
  return counts[cell].success / counts[cell].size;
}

/** 상태를 손으로 짓는다. 슬라이더 없이 모델만 두드릴 때 쓴다. */
function fixture_build_state(sizeA1, rateA1, sizeA2, rateA2, sizeB1, rateB1, sizeB2, rateB2) {
  return { sizeA1, rateA1, sizeA2, rateA2, sizeB1, rateB1, sizeB2, rateB2 };
}

/** 파라미터 스윕용 결정적 격자. 난수를 쓰지 않는다 — 실패가 재현되어야 한다. */
function enum_build_sweep() {
  const sizes = [1, 7, 60, 325, 1000];
  // 0.22와 0.64는 아래에서 고정으로 쓰는 값이다. 격자에 같이 넣어야
  // **정확히 같은 비율**(→ tied 판정)이 스윕 안에서 실제로 발생한다.
  const rates = [0, 0.07, 0.22, 0.31, 0.5, 0.64, 0.86, 1];
  const states = [];
  for (const sizeA1 of sizes) {
    for (const sizeB1 of sizes) {
      for (const rateA1 of rates) {
        for (const rateB2 of rates) {
          states.push(
            fixture_build_state(sizeA1, rateA1, 1000 - sizeA1 + 1, 0.22, sizeB1, 0.64, 1000 - sizeB1 + 1, rateB2),
          );
        }
      }
    }
  }
  return states;
}

const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 1;
const display_format_percent = (rate) => `${(rate * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%`;

// ── ① 프리셋이 실제로 역전을 재현하는가 ─────────────────────

describe('프리셋 — 브리프의 검수 포인트', () => {
  it('Berkeley 프리셋: 학과별로는 여성이 높고 합계에서는 남성이 높다', () => {
    const result = model_calculate_result(model_calculate_preset_state('berkeley'));
    // 그룹별로는 B(여성)가 이긴다 → lead(A − B)가 음수
    expect(result.leads[1]).toBe(-1);
    expect(result.leads[2]).toBe(-1);
    // 합계에서는 A(남성)가 이긴다
    expect(result.leads.pooled).toBe(1);
    expect(result.verdict).toBe(SIMPSON_VERDICT_REVERSED);
  });

  it('Berkeley 프리셋: 본문이 인용하는 수치 여섯 개를 그대로 낸다', () => {
    const result = model_calculate_result(model_calculate_preset_state('berkeley'));
    const men = result.options.a;
    const women = result.options.b;

    expect(display_format_percent(men.groups[1].rate)).toBe('62.1%');
    expect(display_format_percent(men.groups[2].rate)).toBe('5.9%');
    expect(display_format_percent(women.groups[1].rate)).toBe('82.4%');
    expect(display_format_percent(women.groups[2].rate)).toBe('7.0%');
    expect(display_format_percent(men.pooledRate)).toBe('44.6%');
    expect(display_format_percent(women.pooledRate)).toBe('25.2%');

    // 본문 4번 블록이 인용하는 정수 카운트
    expect(men.pooledSuccess).toBe(534);
    expect(men.totalSize).toBe(1198);
    expect(women.pooledSuccess).toBe(113);
    expect(women.totalSize).toBe(449);

    // 본문 4번 블록이 인용하는 가중치
    expect(display_format_percent(men.weight)).toBe('68.9%');
    expect(display_format_percent(women.weight)).toBe('24.1%');
  });

  it('신장결석 프리셋: 결석 크기별로는 A가 높고 합계에서는 B가 높다', () => {
    const result = model_calculate_result(model_calculate_preset_state('kidney'));
    expect(result.leads[1]).toBe(1);
    expect(result.leads[2]).toBe(1);
    expect(result.leads.pooled).toBe(-1);
    expect(result.verdict).toBe(SIMPSON_VERDICT_REVERSED);
  });

  it('신장결석 프리셋: 본문이 인용하는 수치를 그대로 낸다', () => {
    const result = model_calculate_result(model_calculate_preset_state('kidney'));
    const open = result.options.a;
    const percutaneous = result.options.b;

    expect(display_format_percent(open.groups[1].rate)).toBe('93.1%');
    expect(display_format_percent(open.groups[2].rate)).toBe('73.0%');
    expect(display_format_percent(percutaneous.groups[1].rate)).toBe('86.7%');
    expect(display_format_percent(percutaneous.groups[2].rate)).toBe('68.8%');
    expect(display_format_percent(open.pooledRate)).toBe('78.0%');
    expect(display_format_percent(percutaneous.pooledRate)).toBe('82.6%');

    expect(open.pooledSuccess).toBe(273);
    expect(percutaneous.pooledSuccess).toBe(289);
    expect(open.totalSize).toBe(350);
    expect(percutaneous.totalSize).toBe(350);

    expect(display_format_percent(open.weight)).toBe('24.9%');
    expect(display_format_percent(percutaneous.weight)).toBe('77.1%');
  });

  it('세 번째 프리셋(균등 혼합)은 역전이 아니라 일치를 낸다', () => {
    const result = model_calculate_result(model_calculate_preset_state('even'));
    expect(result.verdict).toBe(SIMPSON_VERDICT_AGREES);
    expect(result.weightGap).toBeCloseTo(0, 12);
  });

  it('프리셋은 눈금에 스냅되지 않는다 — 표시 건수가 원래 정수 카운트로 되돌아온다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const result = model_calculate_result(model_calculate_preset_state(preset.key));
      for (const option of ['a', 'b']) {
        for (const group of ['1', '2']) {
          const cell = `${option}${group}`;
          expect(result.options[option].groups[group].size).toBe(preset.counts[cell].size);
          // round(n · p)가 원래 성공 건수로 되돌아오는 것은 p가 반올림되지 않았을 때뿐이다.
          expect(result.options[option].groups[group].success).toBe(preset.counts[cell].success);
        }
      }
    }
  });

  it('기본 프리셋이 실제로 존재하고, 로드 즉시 결과가 나온다 (빈 폼 금지)', () => {
    expect(model_read_preset(SIMPSON_PRESET_DEFAULT)).not.toBeNull();
    const state = model_calculate_preset_state(SIMPSON_PRESET_DEFAULT);
    expect(model_check_parameters(state).ok).toBe(true);
    expect(() => model_calculate_result(state)).not.toThrow();
  });

  it('모든 프리셋의 기본값이 자기 클램프·검사를 통과한다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const state = model_calculate_preset_state(preset.key);
      expect(model_check_parameters(state).ok).toBe(true);
      for (const key of ['sizeA1', 'sizeA2', 'sizeB1', 'sizeB2']) {
        expect(model_clamp_size(state[key])).toBe(state[key]);
      }
      for (const key of ['rateA1', 'rateA2', 'rateB1', 'rateB2']) {
        expect(model_clamp_rate(state[key])).toBe(state[key]);
      }
    }
  });

  it('프리셋 라벨이 빠짐없이 있다 — 화면이 "undefined"를 찍지 않는다', () => {
    for (const preset of SIMPSON_PRESETS) {
      expect(preset.optionLabels.a).toBeTruthy();
      expect(preset.optionLabels.b).toBeTruthy();
      expect(preset.groupLabels[1]).toBeTruthy();
      expect(preset.groupLabels[2]).toBeTruthy();
      expect(preset.unitLabel).toBeTruthy();
      expect(preset.successLabel).toBeTruthy();
    }
  });
});

// ── ② 독립 경로 대조 ────────────────────────────────────────

describe('독립 경로 대조 — 가중평균 vs 정수 건수의 합', () => {
  it('프리셋에서 두 경로가 같은 합계 비율을 낸다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const result = model_calculate_result(model_calculate_preset_state(preset.key));
      for (const option of ['a', 'b']) {
        const reference = reference_calculate_pooled_from_counts(preset.counts, option);
        expect(result.options[option].pooledRate).toBeCloseTo(reference, 12);
      }
    }
  });

  it('프리셋의 그룹 비율도 카운트에서 직접 계산한 값과 같다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const result = model_calculate_result(model_calculate_preset_state(preset.key));
      for (const option of ['a', 'b']) {
        for (const group of ['1', '2']) {
          const reference = reference_calculate_group_rate(preset.counts, `${option}${group}`);
          expect(result.options[option].groups[group].rate).toBeCloseTo(reference, 12);
        }
      }
    }
  });

  it('본문 2.5절의 분해 항등식이 스윕 전 구간에서 성립한다', () => {
    // P_A − P_B = [w_A·d₁ + (1−w_A)·d₂] + (w_A − w_B)(p_B1 − p_B2)
    // 이 항등식은 모델이 쓰는 식이 아니다 — 본문이 유도한 별개의 식이고,
    // 여기서 처음 계산된다. 두 값이 맞으면 본문의 유도가 코드와 같은 것을 말한다.
    for (const state of enum_build_sweep()) {
      const result = model_calculate_result(state);
      const parts = model_calculate_decomposition(state);
      const actual = result.options.a.pooledRate - result.options.b.pooledRate;
      expect(parts.total).toBeCloseTo(actual, 12);
    }
  });
});

// ── ③ 항등식이 말하는 두 정리 ───────────────────────────────

describe('가중치가 같으면 역전이 불가능하다 — 항등식 둘째 항이 0', () => {
  it('w_A = w_B인 스윕에서 역전이 한 번도 나오지 않는다', () => {
    // 두 선택지의 혼합이 같도록 표본수를 맞춘다. 비율은 자유롭게 흔든다.
    const rates = [0, 0.05, 0.2, 0.4, 0.61, 0.8, 0.99, 1];
    let checked = 0;
    for (const size1 of [1, 25, 400, 1000]) {
      for (const size2 of [1, 25, 400, 1000]) {
        for (const rateA1 of rates) {
          for (const rateB1 of rates) {
            for (const rateA2 of rates) {
              const state = fixture_build_state(size1, rateA1, size2, rateA2, size1, rateB1, size2, 0.33);
              const parts = model_calculate_decomposition(state);
              expect(parts.mixingTerm).toBeCloseTo(0, 12);
              expect(model_calculate_result(state).verdict).not.toBe(SIMPSON_VERDICT_REVERSED);
              checked += 1;
            }
          }
        }
      }
    }
    // 스윕이 실제로 돌았는지 못박는다. 0건이면 위의 단언은 아무것도 지키지 않는다.
    expect(checked).toBe(4 * 4 * 8 * 8 * 8);
  });

  it('두 그룹의 난이도가 같으면(p_B1 = p_B2) 역전이 불가능하다', () => {
    for (const rateB of [0.1, 0.5, 0.9]) {
      for (const sizeA1 of [1, 200, 1000]) {
        for (const sizeB1 of [1, 200, 1000]) {
          const state = fixture_build_state(sizeA1, 0.7, 1001 - sizeA1, 0.4, sizeB1, rateB, 1001 - sizeB1, rateB);
          expect(model_calculate_decomposition(state).mixingTerm).toBeCloseTo(0, 12);
          expect(model_calculate_result(state).verdict).not.toBe(SIMPSON_VERDICT_REVERSED);
        }
      }
    }
  });
});

// ── ④ 판정 — 뮤테이션 점검 ──────────────────────────────────

describe('판정 — 엇갈림을 역전으로 새어 보내지 않는다', () => {
  it('그룹끼리 승자가 다르면 mixed다 (역전이 아니다)', () => {
    // 그룹 1은 A가, 그룹 2는 B가 이긴다. 합계는 B가 이긴다.
    // "합계 승자 ≠ 그룹1 승자"만 보는 구현은 이것을 reversed라고 부른다.
    const state = fixture_build_state(100, 0.9, 100, 0.1, 100, 0.5, 100, 0.5);
    const result = model_calculate_result(state);
    expect(result.leads[1]).toBe(1);
    expect(result.leads[2]).toBe(-1);
    expect(result.verdict).toBe(SIMPSON_VERDICT_MIXED);
  });

  it('한 그룹이 정확히 같으면 tied다 — "두 그룹에서 이겼다"가 성립하지 않는다', () => {
    const state = fixture_build_state(100, 0.5, 100, 0.9, 100, 0.5, 100, 0.4);
    expect(model_calculate_result(state).verdict).toBe(SIMPSON_VERDICT_TIED);
  });

  it('두 그룹에서 A가 이기고 합계가 정확히 같으면 tied다 — 역전의 경계', () => {
    // A: 100@60% + 300@20% → 120/400 = 30%
    // B: 200@50% + 200@10% → 120/400 = 30%
    // 그룹별로는 A가 둘 다 이기는데 합계는 정확히 같다. 여기가 역전이 시작되는 자리다.
    const state = fixture_build_state(100, 0.6, 300, 0.2, 200, 0.5, 200, 0.1);
    const result = model_calculate_result(state);
    expect(result.leads[1]).toBe(1);
    expect(result.leads[2]).toBe(1);
    expect(result.leads.pooled).toBe(0);
    expect(result.verdict).toBe(SIMPSON_VERDICT_TIED);
  });

  it('그룹 승자와 합계 승자가 같으면 agrees다', () => {
    const state = fixture_build_state(100, 0.8, 100, 0.6, 100, 0.5, 100, 0.3);
    expect(model_calculate_result(state).verdict).toBe(SIMPSON_VERDICT_AGREES);
  });

  it('판정 네 가지가 전부 세 가지 색 중 하나로 간다', () => {
    for (const verdict of [
      SIMPSON_VERDICT_AGREES,
      SIMPSON_VERDICT_TIED,
      SIMPSON_VERDICT_MIXED,
      SIMPSON_VERDICT_REVERSED,
    ]) {
      expect(['hold', 'edge', 'break']).toContain(SIMPSON_VERDICT_TONE[verdict]);
    }
  });

  it('역전 판정이 대칭이다 — A와 B를 바꿔 넣어도 같은 판정이 나온다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const state = model_calculate_preset_state(preset.key);
      const swapped = fixture_build_state(
        state.sizeB1, state.rateB1, state.sizeB2, state.rateB2,
        state.sizeA1, state.rateA1, state.sizeA2, state.rateA2,
      );
      expect(model_calculate_result(swapped).verdict).toBe(model_calculate_result(state).verdict);
    }
  });

  it('오차 범위 안의 차이는 같음으로 본다', () => {
    expect(model_calculate_lead(0.5, 0.5 + SIMPSON_RATE_EPSILON / 2)).toBe(0);
    // 표시 정밀도(0.1%p)만큼 벌어진 것은 절대 같음으로 삼키지 않는다.
    expect(model_calculate_lead(0.5, 0.501)).toBe(-1);
    expect(model_calculate_lead(0.501, 0.5)).toBe(1);
  });
});

// ── ⑤ 유효범위·경계 ────────────────────────────────────────

describe('유효범위 밖에서 조용히 숫자를 뱉지 않는다', () => {
  it('한 선택지의 시도가 0이면 검사에서 걸리고 결과 계산이 throw한다', () => {
    const state = fixture_build_state(0, 0.5, 0, 0.5, 100, 0.5, 100, 0.5);
    expect(model_check_parameters(state).ok).toBe(false);
    expect(() => model_calculate_result(state)).toThrow();
  });

  it('표본수가 정수가 아니면 걸린다', () => {
    const state = fixture_build_state(10.5, 0.5, 10, 0.5, 10, 0.5, 10, 0.5);
    expect(model_check_parameters(state).ok).toBe(false);
  });

  it('비율이 범위 밖이면 걸린다', () => {
    expect(model_check_parameters(fixture_build_state(10, 1.5, 10, 0.5, 10, 0.5, 10, 0.5)).ok).toBe(false);
    expect(model_check_parameters(fixture_build_state(10, -0.1, 10, 0.5, 10, 0.5, 10, 0.5)).ok).toBe(false);
    expect(model_check_parameters(fixture_build_state(10, NaN, 10, 0.5, 10, 0.5, 10, 0.5)).ok).toBe(false);
  });

  it('한 그룹만 비어 있으면 그 그룹의 비율은 null이고 합계는 남은 그룹의 값이다', () => {
    const state = fixture_build_state(0, 0.9, 200, 0.4, 100, 0.5, 100, 0.5);
    const result = model_calculate_result(state);
    expect(result.options.a.groups[1].rate).toBeNull();
    expect(result.options.a.pooledRate).toBeCloseTo(0.4, 12);
    // 그룹 1의 비교가 불가능하므로 역전을 주장할 수 없다.
    expect(result.leads[1]).toBeNull();
    expect(result.verdict).toBe(SIMPSON_VERDICT_MIXED);
  });

  it('가중치와 합계는 총 시도가 0이면 null이다 (0으로 나눈 NaN을 흘리지 않는다)', () => {
    expect(model_calculate_group_weight(0, 0)).toBeNull();
    expect(model_calculate_pooled_rate(0, 0.5, 0, 0.5)).toBeNull();
  });

  it('클램프가 범위 밖과 숫자 아닌 것을 받아낸다', () => {
    expect(model_clamp_size(-5)).toBe(SIMPSON_SIZE_MIN);
    expect(model_clamp_size(99999)).toBe(SIMPSON_SIZE_MAX);
    expect(model_clamp_size(12.4)).toBe(12);
    expect(model_clamp_size(Number.NaN)).toBe(SIMPSON_SIZE_MIN);
    expect(model_clamp_rate(-1)).toBe(SIMPSON_RATE_MIN);
    expect(model_clamp_rate(2)).toBe(SIMPSON_RATE_MAX);
    expect(model_clamp_rate(Number.NaN)).toBe(SIMPSON_RATE_MIN);
  });

  it('표시용 성공 건수는 표본수를 넘지 않고 음수가 되지 않는다', () => {
    for (const size of [0, 1, 7, 1000]) {
      for (const rate of [0, 0.001, 0.5, 0.999, 1]) {
        const count = model_calculate_success_count(size, rate);
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(size);
      }
    }
  });

  it('가중치는 언제나 0과 1 사이다', () => {
    for (const state of enum_build_sweep()) {
      const result = model_calculate_result(state);
      for (const option of ['a', 'b']) {
        expect(result.options[option].weight).toBeGreaterThanOrEqual(0);
        expect(result.options[option].weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it('합계 비율은 언제나 두 그룹 비율 사이에 있다 (가중평균의 정의)', () => {
    for (const state of enum_build_sweep()) {
      const result = model_calculate_result(state);
      for (const option of ['a', 'b']) {
        const rates = [result.options[option].groups[1].rate, result.options[option].groups[2].rate];
        const pooled = result.options[option].pooledRate;
        expect(pooled).toBeGreaterThanOrEqual(Math.min(...rates) - SIMPSON_RATE_EPSILON);
        expect(pooled).toBeLessThanOrEqual(Math.max(...rates) + SIMPSON_RATE_EPSILON);
      }
    }
  });
});

// ── ⑥ 스윕 — 역전이 실제로 나오기도 하고 안 나오기도 한다 ──

describe('스윕 — 판정이 실제로 갈린다 (동어반복이 아니다)', () => {
  it('스윕 안에 네 판정이 모두 나타난다', () => {
    const seen = new Set();
    for (const state of enum_build_sweep()) seen.add(model_calculate_result(state).verdict);
    // 하나라도 안 나오면 위의 다른 테스트들이 그 분기를 한 번도 안 밟은 것이다.
    expect(seen.has(SIMPSON_VERDICT_REVERSED)).toBe(true);
    expect(seen.has(SIMPSON_VERDICT_AGREES)).toBe(true);
    expect(seen.has(SIMPSON_VERDICT_MIXED)).toBe(true);
    expect(seen.has(SIMPSON_VERDICT_TIED)).toBe(true);
  });

  it('역전이 난 곳에서는 항등식의 둘째 항이 첫째 항보다 크고 부호가 반대다', () => {
    let reversedCount = 0;
    for (const state of enum_build_sweep()) {
      if (model_calculate_result(state).verdict !== SIMPSON_VERDICT_REVERSED) continue;
      const parts = model_calculate_decomposition(state);
      // 합의 부호가 첫째 항의 부호와 반대여야 역전이다 — 그것을 만드는 것은 둘째 항뿐이다.
      expect(Math.sign(parts.total)).toBe(-Math.sign(parts.withinTerm));
      expect(Math.abs(parts.mixingTerm)).toBeGreaterThan(Math.abs(parts.withinTerm));
      reversedCount += 1;
    }
    expect(reversedCount).toBeGreaterThan(0);
  });
});
