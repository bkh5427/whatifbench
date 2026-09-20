/**
 * 샤워 vs 욕조 — 모델 테스트
 *
 * **같은 모델을 한 번 더 돌려 "맞습니다"를 받는 것은 검증이 아니다.**
 * 초안 머리말이 못박은 네 경로를 여기서 직접 구현해 대조한다 —
 *   ① 1분씩 더해 올라가는 루프로 교차 시점을 찾는다
 *   ② 닫힌 해 t* = V/Q를 그대로 평가한다
 *   ③ kJ로 계산한 뒤 3,600으로 나눈다
 *   ④ 처음부터 kWh 단위 상수로 계산한다
 * ①②가 맞고 ③④가 맞아야 모델을 믿는다.
 */
import { describe, it, expect } from 'vitest';
import {
  WATER_SPECIFIC_HEAT_KJ_PER_KG_K,
  WATER_DENSITY_KG_PER_LITRE,
  LITRES_PER_US_GALLON,
  KILOJOULES_PER_KILOWATT_HOUR,
  CUBIC_METRES_PER_LITRE,
  SHOWER_FLOW_MIN_LPM,
  SHOWER_FLOW_MAX_LPM,
  SHOWER_FLOW_STEP_LPM,
  SHOWER_FLOW_DEFAULT_LPM,
  SHOWER_MINUTES_MIN,
  SHOWER_MINUTES_MAX,
  SHOWER_MINUTES_DEFAULT,
  BATH_LITRES_MIN,
  BATH_LITRES_MAX,
  BATH_LITRES_DEFAULT,
  RISE_MIN_K,
  RISE_MAX_K,
  RISE_SHOWER_DEFAULT_K,
  RISE_BATH_DEFAULT_K,
  PRICE_MIN,
  CROSSOVER_MERGE_MINUTES,
  VERDICT_HOLD,
  VERDICT_EDGE,
  VERDICT_BREAK,
  SHOWER_FLOW_PRESETS,
  SHOWER_SITUATION_PRESETS,
  TABLE_FLOWS_LPM,
  TABLE_BATH_LITRES,
  model_clamp_flow,
  model_clamp_minutes,
  model_clamp_bath_litres,
  model_clamp_rise,
  model_clamp_price,
  model_check_parameters,
  model_calculate_water_volume,
  model_calculate_energy_kwh,
  model_calculate_water_crossover,
  model_calculate_energy_crossover,
  model_calculate_cost,
  model_calculate_result,
  model_calculate_verdict,
  model_calculate_crossover_table,
} from './model.js';

// ── 독립 경로 ───────────────────────────────────────────────

/**
 * ① 1분씩 더해 올라가는 루프. 나눗셈으로 t*를 구하지 않고,
 * 분마다 물을 부어 욕조 물량을 넘는 순간을 찾아 그 한 분 안에서만 비례배분한다.
 * 모델이 쓰는 것은 나눗셈 한 번이고, 이쪽은 덧셈 n번이다.
 */
function reference_count_water_crossover(bathLitres, flow) {
  let poured = 0;
  let minute = 0;
  while (poured < bathLitres) {
    if (minute > 1e6) return Number.POSITIVE_INFINITY;
    poured += flow;
    minute += 1;
  }
  const overshoot = poured - bathLitres;
  return minute - overshoot / flow;
}

/** ① 에너지도 같은 방식으로. 분마다 kWh를 더해 욕조 에너지를 넘는 순간을 찾는다. */
function reference_count_energy_crossover(bathLitres, flow, riseShower, riseBath) {
  const bathKwh = reference_calculate_kwh_from_kilojoules(bathLitres, riseBath);
  const perMinuteKwh = reference_calculate_kwh_from_kilojoules(flow, riseShower);
  let heaped = 0;
  let minute = 0;
  while (heaped < bathKwh) {
    if (minute > 1e6) return Number.POSITIVE_INFINITY;
    heaped += perMinuteKwh;
    minute += 1;
  }
  return minute - (heaped - bathKwh) / perMinuteKwh;
}

/** ② 닫힌 해를 그대로. 모델이 아니라 이 파일이 적은 식이다. */
function reference_calculate_closed_water_crossover(bathLitres, flow) {
  return bathLitres / flow;
}

/** ② 에너지 교차의 닫힌 해. **모델과 곱셈 순서가 다르다** — 그것이 대조의 요점이다. */
function reference_calculate_closed_energy_crossover(bathLitres, flow, riseShower, riseBath) {
  return (bathLitres * riseBath) / (flow * riseShower);
}

/** ③ kJ로 계산한 뒤 3,600으로 나눈다. */
function reference_calculate_kwh_from_kilojoules(litres, riseK) {
  const kilograms = litres * 1;
  const kilojoules = kilograms * 4.186 * riseK;
  return kilojoules / 3600;
}

/** ④ 처음부터 kWh 단위 상수로. kg·K당 4.186/3600 kWh를 미리 만들어 곱한다. */
const REFERENCE_KWH_PER_KG_K = 4.186 / 3600;
function reference_calculate_kwh_direct(litres, riseK) {
  return litres * REFERENCE_KWH_PER_KG_K * riseK;
}

// ── 상수 ────────────────────────────────────────────────────

describe('상수 — 정의값과 측정값을 구분해 못박는다', () => {
  it('단위 환산 세 건은 정의값이다', () => {
    // 1 US gal = 231 in³, 1 in = 25.4 mm 정의에서 나온다.
    expect(LITRES_PER_US_GALLON).toBe(3.785411784);
    expect(231 * Math.pow(25.4, 3) * 1e-6).toBeCloseTo(LITRES_PER_US_GALLON, 9);
    // 1 h = 3,600 s이므로 1 kWh = 3.6 MJ.
    expect(KILOJOULES_PER_KILOWATT_HOUR).toBe(3600);
    expect(CUBIC_METRES_PER_LITRE).toBe(0.001);
  });

  it('검수 대상 상수 두 개는 이 값이다 (측정값·온도의존)', () => {
    expect(WATER_SPECIFIC_HEAT_KJ_PER_KG_K).toBe(4.186);
    expect(WATER_DENSITY_KG_PER_LITRE).toBe(1);
  });

  it('갤런 프리셋이 규격값에서 환산된다', () => {
    expect(2 * LITRES_PER_US_GALLON).toBeCloseTo(7.570823568, 9);
    expect(2.5 * LITRES_PER_US_GALLON).toBeCloseTo(9.46352946, 8);
    expect(SHOWER_FLOW_PRESETS.map((preset) => preset.flow)).toEqual([7.57, 9.46, 8]);
  });

  it('프리셋 라벨에 규격 약칭이 보인다', () => {
    const labels = SHOWER_FLOW_PRESETS.map((preset) => preset.label).join(' | ');
    expect(labels).toContain('WaterSense');
    expect(labels).toContain('EPCA');
    expect(labels).toContain('EU Ecolabel');
  });

  it('모든 기본값이 자기 클램프를 통과한다 (로드 즉시 잘리지 않는다)', () => {
    expect(model_clamp_flow(SHOWER_FLOW_DEFAULT_LPM)).toBe(SHOWER_FLOW_DEFAULT_LPM);
    expect(model_clamp_minutes(SHOWER_MINUTES_DEFAULT)).toBe(SHOWER_MINUTES_DEFAULT);
    expect(model_clamp_bath_litres(BATH_LITRES_DEFAULT)).toBe(BATH_LITRES_DEFAULT);
    expect(model_clamp_rise(RISE_SHOWER_DEFAULT_K)).toBe(RISE_SHOWER_DEFAULT_K);
    expect(model_clamp_rise(RISE_BATH_DEFAULT_K)).toBe(RISE_BATH_DEFAULT_K);
  });

  it('프리셋 값도 클램프를 통과한다 — 눈금 0.1이면 7.57이 7.6으로 스냅된다', () => {
    for (const preset of SHOWER_FLOW_PRESETS) {
      expect(model_clamp_flow(preset.flow)).toBe(preset.flow);
    }
    expect(SHOWER_FLOW_STEP_LPM).toBe(0.01);
    for (const preset of SHOWER_SITUATION_PRESETS) {
      expect(model_clamp_flow(preset.state.flow)).toBe(preset.state.flow);
      expect(model_clamp_minutes(preset.state.minutes)).toBe(preset.state.minutes);
      expect(model_clamp_bath_litres(preset.state.bathLitres)).toBe(preset.state.bathLitres);
      expect(model_clamp_rise(preset.state.riseShower)).toBe(preset.state.riseShower);
      expect(model_clamp_rise(preset.state.riseBath)).toBe(preset.state.riseBath);
    }
  });
});

// ── 유효범위 ────────────────────────────────────────────────

describe('유효범위 — 밖에서는 조용히 숫자를 뱉지 않는다', () => {
  const valid = [SHOWER_FLOW_DEFAULT_LPM, SHOWER_MINUTES_DEFAULT, BATH_LITRES_DEFAULT, RISE_SHOWER_DEFAULT_K, RISE_BATH_DEFAULT_K];

  it('기본 조합은 통과한다', () => {
    expect(model_check_parameters(...valid).ok).toBe(true);
  });

  it('Q = 0은 t*를 Infinity로 흘리지 않고 throw한다', () => {
    expect(model_check_parameters(0, 8, 80, 27, 25).ok).toBe(false);
    expect(() => model_calculate_result(0, 8, 80, 27, 25)).toThrow();
    // 가드가 없으면 이 값이 그대로 화면에 간다.
    expect(model_calculate_water_crossover(80, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('욕조 물량 0은 throw한다 — 비교할 두 번째 부피가 없다', () => {
    expect(model_check_parameters(9.5, 8, 0, 27, 25).ok).toBe(false);
    expect(() => model_calculate_result(9.5, 8, 0, 27, 25)).toThrow();
  });

  it('샤워 온도 상승폭 0은 t*_E를 정의하지 못하므로 throw한다', () => {
    expect(model_check_parameters(9.5, 8, 80, 0, 25).ok).toBe(false);
    expect(() => model_calculate_result(9.5, 8, 80, 0, 25)).toThrow();
    expect(Number.isFinite(model_calculate_energy_crossover(80, 9.5, 0, 25))).toBe(false);
  });

  it('NaN·범위 밖 값을 전부 막는다', () => {
    expect(model_check_parameters(Number.NaN, 8, 80, 27, 25).ok).toBe(false);
    expect(model_check_parameters(SHOWER_FLOW_MAX_LPM + 1, 8, 80, 27, 25).ok).toBe(false);
    expect(model_check_parameters(9.5, SHOWER_MINUTES_MAX + 1, 80, 27, 25).ok).toBe(false);
    expect(model_check_parameters(9.5, 8, BATH_LITRES_MAX + 1, 27, 25).ok).toBe(false);
    expect(model_check_parameters(9.5, 8, 80, RISE_MAX_K + 1, 25).ok).toBe(false);
    expect(model_check_parameters(9.5, 8, 80, 27, RISE_MIN_K - 1).ok).toBe(false);
  });

  it('0분은 유효하다 — 아직 물을 안 튼 상태다', () => {
    expect(model_check_parameters(9.5, SHOWER_MINUTES_MIN, 80, 27, 25).ok).toBe(true);
    const result = model_calculate_result(9.5, 0, 80, 27, 25);
    expect(result.showerLitres).toBe(0);
    expect(result.showerKwh).toBe(0);
  });

  it('사유 문구가 붙는다 — 그리고 "정의되지 않는다" 쪽 가드가 먼저 잡는다', () => {
    // 이 세 값은 범위 검사에도 걸린다. 그래서 메시지까지 못박아야
    // "정의되지 않는다" 가드를 지웠을 때 테스트가 실제로 깨진다 —
    // 범위 메시지로 바뀌면 아래 정규식이 어긋난다.
    expect(model_check_parameters(0, 8, 80, 27, 25).message).toMatch(/정의되지 않는다/);
    expect(model_check_parameters(9.5, 8, 0, 27, 25).message).toMatch(/두 번째 부피가 없다/);
    expect(model_check_parameters(9.5, 8, 80, 0, 25).message).toMatch(/t\*_E가 정의되지 않는다/);
    expect(model_check_parameters(9.5, 8, 80, 27, 0).message).toMatch(/에너지가 0이 되어/);
    expect(() => model_calculate_result(0, 8, 80, 27, 25)).toThrow(/유량/);
  });
});

// ── 독립 경로 대조 ──────────────────────────────────────────

describe('독립 경로 대조 ①② — 1분 루프 대 닫힌 해', () => {
  it('80 L / 9.4635 L·min⁻¹ 에서 두 경로가 같은 값을 낸다', () => {
    const flow = 9.4635;
    expect(reference_count_water_crossover(80, flow)).toBeCloseTo(8.4535, 4);
    expect(reference_calculate_closed_water_crossover(80, flow)).toBeCloseTo(8.4535, 4);
    expect(model_calculate_water_crossover(80, flow)).toBeCloseTo(8.4535, 4);
  });

  it('정확한 갤런 환산값에서도 8.4535분이다', () => {
    const flow = 2.5 * LITRES_PER_US_GALLON;
    expect(model_calculate_water_crossover(80, flow)).toBeCloseTo(8.453506, 6);
    expect(reference_count_water_crossover(80, flow)).toBeCloseTo(8.453506, 6);
  });

  it('슬라이더 격자 전체에서 루프와 닫힌 해가 일치한다', () => {
    for (let bathLitres = BATH_LITRES_MIN; bathLitres <= BATH_LITRES_MAX; bathLitres += 5) {
      for (let flow = SHOWER_FLOW_MIN_LPM; flow <= SHOWER_FLOW_MAX_LPM; flow += 0.25) {
        const loop = reference_count_water_crossover(bathLitres, flow);
        const closed = reference_calculate_closed_water_crossover(bathLitres, flow);
        expect(model_calculate_water_crossover(bathLitres, flow)).toBeCloseTo(closed, 12);
        expect(loop).toBeCloseTo(closed, 9);
      }
    }
  });

  it('에너지 교차도 두 경로가 일치한다', () => {
    for (const [bathLitres, flow, riseShower, riseBath] of [
      [80, 9.46, 27, 25],
      [150, 7.57, 45, 10],
      [60, 12, 10, 45],
      [200, 20, 33, 33],
    ]) {
      const loop = reference_count_energy_crossover(bathLitres, flow, riseShower, riseBath);
      const closed = reference_calculate_closed_energy_crossover(bathLitres, flow, riseShower, riseBath);
      expect(model_calculate_energy_crossover(bathLitres, flow, riseShower, riseBath)).toBeCloseTo(closed, 10);
      expect(loop).toBeCloseTo(closed, 9);
    }
  });
});

describe('독립 경로 대조 ③④ — kJ 경유 대 kWh 직행', () => {
  it('80 L를 25 K 올리면 2.3256 kWh다', () => {
    expect(model_calculate_energy_kwh(80, 25)).toBeCloseTo(2.3256, 4);
    expect(reference_calculate_kwh_from_kilojoules(80, 25)).toBeCloseTo(2.3256, 4);
    expect(reference_calculate_kwh_direct(80, 25)).toBeCloseTo(2.3256, 4);
    // 8,372 kJ를 3,600으로 나눈 값이다.
    expect(80 * 4.186 * 25).toBeCloseTo(8372, 6);
  });

  it('두 환산 경로가 격자 전체에서 일치한다', () => {
    for (let litres = 0; litres <= 400; litres += 10) {
      for (let riseK = RISE_MIN_K; riseK <= RISE_MAX_K; riseK += 5) {
        const viaKilojoules = reference_calculate_kwh_from_kilojoules(litres, riseK);
        const direct = reference_calculate_kwh_direct(litres, riseK);
        expect(model_calculate_energy_kwh(litres, riseK)).toBeCloseTo(viaKilojoules, 12);
        expect(direct).toBeCloseTo(viaKilojoules, 12);
      }
    }
  });

  it('환산 계수를 빠뜨리면 답이 4.186배 또는 3,600배 어긋난다', () => {
    // 이 두 단언은 상수를 지웠을 때 무엇이 깨지는지를 못박는다.
    const withoutHeat = model_calculate_energy_kwh(80, 25) / WATER_SPECIFIC_HEAT_KJ_PER_KG_K;
    expect(withoutHeat).toBeCloseTo(0.5556, 4);
    const withoutHour = model_calculate_energy_kwh(80, 25) * KILOJOULES_PER_KILOWATT_HOUR;
    expect(withoutHour).toBeCloseTo(8372, 6);
  });
});

// ── 두 교차 시점이 같은 경우와 다른 경우 ────────────────────

describe('두 상승폭이 같으면 세로선이 하나로 겹친다', () => {
  it('ΔT_b = ΔT_s에서 t*_E === t* 가 부동소수점 오차 없이 성립한다', () => {
    // 곱셈 순서를 (V·ΔT_b)/(Q·ΔT_s)로 두면 이 조합에서 마지막 자리가 갈린다.
    expect((40 * 10) / (4.01 * 10)).not.toBe(40 / 4.01);
    expect(model_calculate_energy_crossover(40, 4.01, 10, 10)).toBe(model_calculate_water_crossover(40, 4.01));
  });

  it('슬라이더 격자 전체에서 정확히 같다', () => {
    for (let bathLitres = BATH_LITRES_MIN; bathLitres <= BATH_LITRES_MAX; bathLitres += 5) {
      for (let flow = SHOWER_FLOW_MIN_LPM; flow <= SHOWER_FLOW_MAX_LPM; flow += 0.13) {
        for (let riseK = RISE_MIN_K; riseK <= RISE_MAX_K; riseK += 7) {
          expect(model_calculate_energy_crossover(bathLitres, flow, riseK, riseK)).toBe(
            model_calculate_water_crossover(bathLitres, flow),
          );
        }
      }
    }
  });

  it('같은 상승폭에서는 merged가 참이고 판정이 hold다', () => {
    const result = model_calculate_result(9.5, 8, 80, 25, 25);
    expect(result.crossoverGapMinutes).toBe(0);
    expect(result.merged).toBe(true);
    expect(result.split).toBe(false);
    expect(model_calculate_verdict(result)).toBe(VERDICT_HOLD);
  });

  it('상승폭이 갈리면 merged가 거짓이고 두 시점이 다르다', () => {
    const result = model_calculate_result(9.46, 8, 80, 27, 25);
    expect(result.merged).toBe(false);
    expect(result.waterCrossoverMinutes).toBeCloseTo(8.4567, 4);
    expect(result.energyCrossoverMinutes).toBeCloseTo(7.8302, 4);
    expect(result.crossoverGapMinutes).toBeCloseTo(0.6264, 4);
    // 초안이 인용하는 "약 38초".
    expect(result.crossoverGapMinutes * 60).toBeCloseTo(37.6, 1);
  });

  it('ρ와 c는 교차 시점을 움직이지 못한다 — 약분된다', () => {
    // 상승폭 비만 바뀌면 교차가 움직이고, 부피만 커지면 비례해서 움직인다.
    const base = model_calculate_energy_crossover(80, 9.46, 27, 25);
    // 두 상승폭을 같은 배수로 키우면 비가 그대로라 교차도 그대로다.
    expect(model_calculate_energy_crossover(80, 9.46, 54, 50)).toBeCloseTo(base, 12);
  });
});

// ── 판정 ────────────────────────────────────────────────────

describe('판정 — 물과 에너지가 같은 말을 하는가', () => {
  it('지금 시간이 두 교차 시점 사이에 있으면 break다', () => {
    // t* = 8.46, t*_E = 7.83. 8분은 그 사이에 있다.
    const result = model_calculate_result(9.46, 8, 80, 27, 25);
    expect(result.split).toBe(true);
    expect(model_calculate_verdict(result)).toBe(VERDICT_BREAK);
    // 두 축이 반대를 말한다: 물은 덜 썼고 에너지는 더 썼다.
    expect(result.waterDifferenceLitres).toBeLessThan(0);
    expect(result.energyDifferenceKwh).toBeGreaterThan(0);
  });

  it('갈라졌지만 지금 시간이 사이에 없으면 edge다', () => {
    const early = model_calculate_result(9.46, 2, 80, 27, 25);
    expect(early.split).toBe(false);
    expect(model_calculate_verdict(early)).toBe(VERDICT_EDGE);
    const late = model_calculate_result(9.46, 20, 80, 27, 25);
    expect(model_calculate_verdict(late)).toBe(VERDICT_EDGE);
  });

  it('기본 설정은 break로 로드된다 (t* 8.4 / t*_E 7.8 사이의 8분)', () => {
    const result = model_calculate_result(
      SHOWER_FLOW_DEFAULT_LPM, SHOWER_MINUTES_DEFAULT, BATH_LITRES_DEFAULT,
      RISE_SHOWER_DEFAULT_K, RISE_BATH_DEFAULT_K,
    );
    expect(result.waterCrossoverMinutes).toBeCloseTo(8.4211, 4);
    expect(result.energyCrossoverMinutes).toBeCloseTo(7.7973, 4);
    expect(model_calculate_verdict(result)).toBe(VERDICT_BREAK);
  });

  it('간격이 표시 정밀도보다 좁으면 같은 분으로 본다', () => {
    // 0.1분 단위로 찍히므로 그 절반보다 좁으면 화면에 같은 숫자가 나온다.
    // 슬라이더가 닿을 수 있는 가장 좁은 자리는 t*가 가장 작고 상승폭 비가 1에 가장
    // 가까운 구석이다: t* = 40/20 = 2분, 44/45 → 간격 0.044분.
    expect(CROSSOVER_MERGE_MINUTES).toBe(0.05);
    const narrow = model_calculate_result(20, 8, 40, 45, 44);
    expect(narrow.crossoverGapMinutes).toBeCloseTo(0.0444, 4);
    expect(Math.abs(narrow.crossoverGapMinutes)).toBeLessThan(CROSSOVER_MERGE_MINUTES);
    expect(narrow.merged).toBe(true);
    expect(model_calculate_verdict(narrow)).toBe(VERDICT_HOLD);
    // 한 칸만 더 벌리면 화면에서 갈리는 두 숫자가 된다.
    const wide = model_calculate_result(20, 8, 40, 45, 43);
    expect(wide.merged).toBe(false);
  });
});

// ── 본문이 인용하는 수치 ────────────────────────────────────

describe('본문이 인용하는 수치를 표시 자릿수까지 못박는다', () => {
  it('80 L 욕조를 세 유량이 넘어서는 분', () => {
    expect(model_calculate_water_crossover(80, 9.46).toFixed(1)).toBe('8.5');
    expect(model_calculate_water_crossover(80, 7.57).toFixed(1)).toBe('10.6');
    expect(model_calculate_water_crossover(80, 15).toFixed(1)).toBe('5.3');
    expect(model_calculate_water_crossover(80, 9.46).toFixed(2)).toBe('8.46');
    expect(model_calculate_water_crossover(80, 7.57).toFixed(2)).toBe('10.57');
    expect(model_calculate_water_crossover(80, 15).toFixed(2)).toBe('5.33');
  });

  it('150 L 욕조에서는 같은 세 유량이 15.9 · 19.8 · 10.0분이다', () => {
    expect(model_calculate_water_crossover(150, 9.46).toFixed(1)).toBe('15.9');
    expect(model_calculate_water_crossover(150, 7.57).toFixed(1)).toBe('19.8');
    expect(model_calculate_water_crossover(150, 15).toFixed(1)).toBe('10.0');
  });

  it('에너지 교차는 7.8분이고 물 교차와 약 38초 벌어진다', () => {
    expect(model_calculate_energy_crossover(80, 9.46, 27, 25).toFixed(1)).toBe('7.8');
    expect(model_calculate_energy_crossover(80, 9.46, 27, 25).toFixed(2)).toBe('7.83');
  });

  it('손으로 따라가는 예제 — 9.46 L/min · 8분 · 80 L · 25 K', () => {
    const showerLitres = model_calculate_water_volume(9.46, 8);
    expect(showerLitres.toFixed(1)).toBe('75.7');
    expect((80 - showerLitres).toFixed(1)).toBe('4.3');

    const showerKwh = model_calculate_energy_kwh(showerLitres, 25);
    const bathKwh = model_calculate_energy_kwh(80, 25);
    expect(showerKwh.toFixed(2)).toBe('2.20');
    expect(showerKwh.toFixed(4)).toBe('2.2000');
    expect(bathKwh.toFixed(2)).toBe('2.33');
    expect(bathKwh.toFixed(4)).toBe('2.3256');
    expect((bathKwh - showerKwh).toFixed(3)).toBe('0.126');

    // 분당 에너지와 남은 격차에서 나오는 시간.
    const perMinuteKj = 9.46 * WATER_SPECIFIC_HEAT_KJ_PER_KG_K * 25;
    expect(perMinuteKj.toFixed(0)).toBe('990');
    const gapKj = (bathKwh - showerKwh) * KILOJOULES_PER_KILOWATT_HOUR;
    expect(gapKj.toFixed(0)).toBe('452');
    expect(((gapKj / perMinuteKj) * 60).toFixed(0)).toBe('27');

    // 닫힌 해로 되짚으면 같은 자리다.
    expect(model_calculate_water_crossover(80, 9.46).toFixed(2)).toBe('8.46');
    expect((8 + gapKj / perMinuteKj).toFixed(2)).toBe('8.46');
  });

  it('유량 4→20의 슬라이더 폭에서 t*가 정확히 5배 움직인다', () => {
    const slow = model_calculate_water_crossover(80, SHOWER_FLOW_MIN_LPM);
    const fast = model_calculate_water_crossover(80, SHOWER_FLOW_MAX_LPM);
    expect(slow / fast).toBeCloseTo(5, 12);
  });
});

// ── 민감도 표 ───────────────────────────────────────────────

describe('민감도 표', () => {
  it('유량 5행 × 욕조 4열이다', () => {
    const rows = model_calculate_crossover_table();
    expect(rows.length).toBe(5);
    expect(TABLE_FLOWS_LPM).toEqual([6, 7.57, 9.46, 12, 15]);
    expect(TABLE_BATH_LITRES).toEqual([60, 80, 120, 150]);
    for (const row of rows) expect(row.minutes.length).toBe(4);
  });

  it('격자의 모든 칸이 닫힌 해와 같다', () => {
    for (const row of model_calculate_crossover_table()) {
      row.minutes.forEach((minutes, index) => {
        expect(minutes).toBe(TABLE_BATH_LITRES[index] / row.flow);
      });
    }
  });

  it('표의 값이 한 자리 표기로 이 격자다', () => {
    const printed = model_calculate_crossover_table().map((row) => row.minutes.map((m) => m.toFixed(1)));
    expect(printed).toEqual([
      ['10.0', '13.3', '20.0', '25.0'],
      ['7.9', '10.6', '15.9', '19.8'],
      ['6.3', '8.5', '12.7', '15.9'],
      ['5.0', '6.7', '10.0', '12.5'],
      ['4.0', '5.3', '8.0', '10.0'],
    ]);
  });
});

// ── 클램프와 단가 ───────────────────────────────────────────

describe('클램프와 단가', () => {
  it('범위 밖 값을 자른다', () => {
    expect(model_clamp_flow(0)).toBe(SHOWER_FLOW_MIN_LPM);
    expect(model_clamp_flow(999)).toBe(SHOWER_FLOW_MAX_LPM);
    expect(model_clamp_minutes(-5)).toBe(SHOWER_MINUTES_MIN);
    expect(model_clamp_bath_litres(1)).toBe(BATH_LITRES_MIN);
    expect(model_clamp_rise(1000)).toBe(RISE_MAX_K);
  });

  it('눈금 위로 스냅한다 — 손잡이와 모델이 같은 값을 쓴다', () => {
    expect(model_clamp_minutes(8.3)).toBe(8.5);
    expect(model_clamp_bath_litres(83)).toBe(85);
    expect(model_clamp_rise(26.4)).toBe(26);
    expect(model_clamp_flow(9.464)).toBe(9.46);
  });

  it('단가는 비어 있을 수 있고, 0과 다르다', () => {
    expect(model_clamp_price(null)).toBeNull();
    expect(model_clamp_price(Number.NaN)).toBeNull();
    expect(model_clamp_price(0)).toBe(0);
    expect(model_clamp_price(-3)).toBe(PRICE_MIN);
    expect(model_calculate_cost(2.3256, null)).toBeNull();
    expect(model_calculate_cost(2.3256, 0.28)).toBeCloseTo(0.651168, 9);
    expect(model_calculate_cost(2.3256, 0)).toBe(0);
  });
});

// ── 결과 객체 ───────────────────────────────────────────────

describe('결과 객체 — 계산 경로가 하나다', () => {
  it('요약 값이 개별 함수와 정확히 같다', () => {
    const result = model_calculate_result(9.46, 8, 80, 27, 25);
    expect(result.showerLitres).toBe(model_calculate_water_volume(9.46, 8));
    expect(result.showerKwh).toBe(model_calculate_energy_kwh(result.showerLitres, 27));
    expect(result.bathKwh).toBe(model_calculate_energy_kwh(80, 25));
    expect(result.waterCrossoverMinutes).toBe(model_calculate_water_crossover(80, 9.46));
    expect(result.energyCrossoverMinutes).toBe(model_calculate_energy_crossover(80, 9.46, 27, 25));
    expect(result.waterDifferenceLitres).toBe(result.showerLitres - 80);
    expect(result.energyDifferenceKwh).toBe(result.showerKwh - result.bathKwh);
  });

  it('분당 기울기가 곡선의 끝점과 맞는다', () => {
    const result = model_calculate_result(9.46, 8, 80, 27, 25);
    expect(result.litresPerMinute * result.minutes).toBeCloseTo(result.showerLitres, 12);
    expect(result.kwhPerMinute * result.minutes).toBeCloseTo(result.showerKwh, 12);
  });
});
