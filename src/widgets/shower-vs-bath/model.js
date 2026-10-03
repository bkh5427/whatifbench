/**
 * 샤워 vs 욕조 — 교차 시점 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (산술). 참·거짓이 갈리므로 단위테스트로 고정한다.
 *
 * 모델이 다루는 것은 두 개의 부피이고, 그중 하나만 시간과 함께 자란다.
 *
 *   V_shower(t) = Q · t          샤워는 유량 × 시간
 *   V_bath      = V              욕조는 시간의 함수가 아니다
 *   t*          = V / Q          물의 교차 시점
 *
 *   E = m · c · ΔT ,  m = ρ · V  같은 부피를 온도 상승폭에 실은 것이 에너지
 *   t*_E        = (V · ΔT_b) / (Q · ΔT_s)
 *
 * **ρ와 c는 교차 시점에서 통째로 약분된다.** 두 상수는 에너지 곡선의 높이만
 * 정하고 두 곡선이 만나는 분(分)은 움직이지 못한다. 검수 대상 상수 두 개가
 * 한쪽 패널에는 결정적이고 다른 쪽에는 무관하다는 것이 이 모델의 논점이다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 물리 상수 — 검수 대상 두 개 ────────────────────────────
/**
 * ⚠ **측정값이고 온도에 의존한다.** 정의값이 아니다.
 * 물의 비열 4.186 kJ/(kg·K)는 15 °C 칼로리에 묶인 값이다
 * (열화학 칼로리 계열은 4.184로, 두 값의 차이는 0.05 % 미만).
 * 권위 있는 정식화는 IAPWS-95이며, 이 모델은 상수 하나로 고정한다.
 * 교차 시점에서는 약분되어 사라지고 에너지 곡선의 높이에만 남는다.
 */
export const WATER_SPECIFIC_HEAT_KJ_PER_KG_K = 4.186;

/**
 * ⚠ **측정값이고 온도에 의존한다.** 4 °C 부근에서만 정확히 1 kg/L이다.
 * 가정용 수도가 내는 온도 범위에서 오차는 1 % 미만이고, c와 마찬가지로
 * 교차 시점에서 약분된다.
 */
export const WATER_DENSITY_KG_PER_LITRE = 1;

// ── 단위 환산 — 전부 정의값(측정이 아니다) ─────────────────
/** 정의값. 1 US gallon = 231 in³, 1 in = 25.4 mm 정의에서 따라 나온다. */
export const LITRES_PER_US_GALLON = 3.785411784;
/** 정의값. 1 h = 3,600 s이므로 1 kWh = 3.6 MJ = 3,600 kJ. */
export const KILOJOULES_PER_KILOWATT_HOUR = 3600;
/** 정의값. SI 접두사에서 바로 나온다. 이 모델은 L로만 계산하므로 참고용이다. */
export const CUBIC_METRES_PER_LITRE = 0.001;

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ────────────────

/**
 * 샤워헤드 유량 Q, L/min.
 *
 * **눈금이 0.01인 이유.** 프리셋은 갤런 규격에서 환산한 값이라
 * (2.0 gpm = 7.57 L/min, 2.5 gpm = 9.46 L/min) 0.1 눈금 위에 얹히지 않는다.
 * 0.1로 두면 브라우저가 7.57을 7.6으로 스냅해 **손잡이가 가리키는 값과 모델이
 * 쓰는 값이 갈라진다.** 화면에는 아무 표시도 나지 않는다.
 */
export const SHOWER_FLOW_MIN_LPM = 4;
export const SHOWER_FLOW_MAX_LPM = 20;
export const SHOWER_FLOW_STEP_LPM = 0.01;
export const SHOWER_FLOW_DEFAULT_LPM = 9.5;

/** 샤워 시간 t, min. 0분은 "아직 물을 안 틀었다"이고 정의된 상태다. */
export const SHOWER_MINUTES_MIN = 0;
export const SHOWER_MINUTES_MAX = 25;
export const SHOWER_MINUTES_STEP = 0.5;
export const SHOWER_MINUTES_DEFAULT = 8;

/** 욕조에 받는 물의 양 V, L. 0이면 t*가 논의 대상이 아니라 하한을 둔다. */
export const BATH_LITRES_MIN = 40;
export const BATH_LITRES_MAX = 200;
export const BATH_LITRES_STEP = 5;
export const BATH_LITRES_DEFAULT = 80;

/**
 * 온도 상승폭 ΔT, K. 찬물 수도 온도에서 실제로 나오는 물 온도까지의 차이다.
 * **샤워와 욕조를 하나로 묶지 않는다** — 두 값이 갈라질 때만 에너지 패널이
 * 물 패널과 다른 말을 하고, 그것이 이 위젯의 논점이다.
 */
export const RISE_MIN_K = 10;
export const RISE_MAX_K = 45;
export const RISE_STEP_K = 1;
export const RISE_SHOWER_DEFAULT_K = 27;
export const RISE_BATH_DEFAULT_K = 25;

/** 에너지 단가. 기본값이 없다 — 비우면 비용 패널이 뜨지 않는다. 통화는 표기하지 않는다. */
export const PRICE_MIN = 0;
export const PRICE_MAX = 100;

/**
 * (2026-10-03 폐기) 예전에는 두 교차 시점이 0.05분보다 가까우면 "같은 분"으로 묶었다.
 * 그러면 상승폭이 1 K 다를 때 "both at 2.2 … energy at 2.1"처럼 판정문이 스스로 어긋나고,
 * 두 파선이 12 px 떨어져 보이는데도 "같은 분"이라고 썼다(B6 대조). 이제 **두 상승폭이
 * 정확히 같을 때만** 묶는다 — 그때 비가 정확히 1이라 두 시점이 수학적으로 같다.
 */
/**
 * 판정 경계의 허용오차(분). 간격이 정확히 0.05분이거나 지금 시간이 교차 시점과
 * 정확히 같을 때, 부동소수 오차(…4999·…0001)가 판정을 뒤집지 않게 한다.
 * 2026-10-03 오라클(shown.test.js)이 잡았다 — Q 20, V 40, 상승 40/41 K에서 hold로 찍혔다.
 */
export const VERDICT_BOUNDARY_EPSILON_MINUTES = 1e-9;

/** 판정 상태 — 사이트 공통 3색. "물과 에너지가 같은 말을 하는가"가 여기서 갈린다. */
export const VERDICT_HOLD = 'hold';
export const VERDICT_EDGE = 'edge';
export const VERDICT_BREAK = 'break';

// ── 프리셋 ─────────────────────────────────────────────────

/** 갤런 규격을 L/min으로 환산하고 슬라이더 눈금 위로 맞춘다. */
function model_calculate_preset_flow(gallonsPerMinute) {
  return Number((gallonsPerMinute * LITRES_PER_US_GALLON).toFixed(2));
}

/**
 * 유량 프리셋. **전부 제품 규격의 상한이지 어느 설비의 실측값이 아니다.**
 * 라벨에 규격 약칭을 넣어 화면에서 그 사실이 보이게 한다.
 */
export const SHOWER_FLOW_PRESETS = [
  {
    key: 'watersense',
    gallonsPerMinute: 2,
    label: '2.0 gpm (7.57) — WaterSense',
    flow: model_calculate_preset_flow(2),
  },
  {
    key: 'epca',
    gallonsPerMinute: 2.5,
    label: '2.5 gpm (9.46) — EPCA max',
    flow: model_calculate_preset_flow(2.5),
  },
  {
    key: 'ecolabel',
    gallonsPerMinute: null,
    label: '8.0 — EU Ecolabel max',
    flow: 8,
  },
];

/**
 * 상황 프리셋. 슬라이더 다섯 개를 통째로 갈아끼운다.
 * `equal-rise`는 모델 자신의 점검이다 — 두 상승폭이 같으면 세로선 두 개가 겹쳐야 한다.
 */
export const SHOWER_SITUATION_PRESETS = [
  {
    key: 'quick-rinse',
    label: 'Quick rinse',
    state: {
      flow: model_calculate_preset_flow(2.5),
      minutes: 4,
      bathLitres: 80,
      riseShower: 27,
      riseBath: 25,
    },
  },
  {
    key: 'long-soak',
    label: 'Long soak',
    state: {
      flow: model_calculate_preset_flow(2.5),
      minutes: 15,
      bathLitres: 150,
      riseShower: 27,
      riseBath: 27,
    },
  },
  {
    key: 'equal-rise',
    label: 'Same temperature both',
    state: {
      flow: SHOWER_FLOW_DEFAULT_LPM,
      minutes: SHOWER_MINUTES_DEFAULT,
      bathLitres: BATH_LITRES_DEFAULT,
      riseShower: RISE_BATH_DEFAULT_K,
      riseBath: RISE_BATH_DEFAULT_K,
    },
  },
];

// ── 민감도 표의 격자 ────────────────────────────────────────
/** 표에 세우는 유량. 가운데 둘은 위 프리셋과 같은 규격값이다. */
export const TABLE_FLOWS_LPM = [6, model_calculate_preset_flow(2), model_calculate_preset_flow(2.5), 12, 15];
/** 표에 세우는 욕조 물량. */
export const TABLE_BATH_LITRES = [60, 80, 120, 150];

// ── 클램프 ─────────────────────────────────────────────────

/** 눈금 위로 맞춘다 — 슬라이더가 스냅하는 자리와 모델이 쓰는 값을 같게 둔다. */
function model_clamp_to_step(value, minValue, maxValue, step) {
  const bounded = num_clamp_value(value, minValue, maxValue);
  const snapped = minValue + Math.round((bounded - minValue) / step) * step;
  return Number(num_clamp_value(snapped, minValue, maxValue).toFixed(4));
}

export function model_clamp_flow(value) {
  return model_clamp_to_step(value, SHOWER_FLOW_MIN_LPM, SHOWER_FLOW_MAX_LPM, SHOWER_FLOW_STEP_LPM);
}

export function model_clamp_minutes(value) {
  return model_clamp_to_step(value, SHOWER_MINUTES_MIN, SHOWER_MINUTES_MAX, SHOWER_MINUTES_STEP);
}

export function model_clamp_bath_litres(value) {
  return model_clamp_to_step(value, BATH_LITRES_MIN, BATH_LITRES_MAX, BATH_LITRES_STEP);
}

export function model_clamp_rise(value) {
  return model_clamp_to_step(value, RISE_MIN_K, RISE_MAX_K, RISE_STEP_K);
}

/** 단가는 비어 있을 수 있다. null은 "입력하지 않았다"이고 0과 다르다. */
export function model_clamp_price(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return num_clamp_value(value, PRICE_MIN, PRICE_MAX);
}

// ── 유효범위 검사 ───────────────────────────────────────────

/**
 * 파라미터가 모델의 유효범위 안에 있는지. 밖에서 조용히 숫자를 뱉지 않는다.
 *
 * 특히 **Q = 0에서 t*는 Infinity, ΔT_s = 0에서 t*_E는 Infinity 또는 NaN이다.**
 * 그 값들은 화면에서 그럴듯한 축과 그럴듯한 카드가 되어 아무 표시도 남기지 않는다.
 * 여기서 막는다.
 */
export function model_check_parameters(flow, minutes, bathLitres, riseShower, riseBath) {
  if (!Number.isFinite(flow) || flow <= 0) {
    return { ok: false, message: '유량이 0 이하이면 t* = V/Q가 정의되지 않는다.' };
  }
  if (flow < SHOWER_FLOW_MIN_LPM || flow > SHOWER_FLOW_MAX_LPM) {
    return { ok: false, message: `유량은 ${SHOWER_FLOW_MIN_LPM}~${SHOWER_FLOW_MAX_LPM} L/min이어야 한다.` };
  }
  if (!Number.isFinite(minutes) || minutes < SHOWER_MINUTES_MIN || minutes > SHOWER_MINUTES_MAX) {
    return { ok: false, message: `샤워 시간은 ${SHOWER_MINUTES_MIN}~${SHOWER_MINUTES_MAX}분이어야 한다.` };
  }
  if (!Number.isFinite(bathLitres) || bathLitres <= 0) {
    return { ok: false, message: '욕조 물량이 0 이하이면 비교할 두 번째 부피가 없다.' };
  }
  if (bathLitres < BATH_LITRES_MIN || bathLitres > BATH_LITRES_MAX) {
    return { ok: false, message: `욕조 물량은 ${BATH_LITRES_MIN}~${BATH_LITRES_MAX} L여야 한다.` };
  }
  if (!Number.isFinite(riseShower) || riseShower <= 0) {
    return { ok: false, message: '샤워 온도 상승폭이 0 이하이면 t*_E가 정의되지 않는다.' };
  }
  if (!Number.isFinite(riseBath) || riseBath <= 0) {
    return { ok: false, message: '욕조 온도 상승폭이 0 이하이면 에너지가 0이 되어 비교가 성립하지 않는다.' };
  }
  if (riseShower < RISE_MIN_K || riseShower > RISE_MAX_K || riseBath < RISE_MIN_K || riseBath > RISE_MAX_K) {
    return { ok: false, message: `온도 상승폭은 ${RISE_MIN_K}~${RISE_MAX_K} K여야 한다.` };
  }
  return { ok: true, message: '' };
}

// ── 기본 계산 ───────────────────────────────────────────────

/** 샤워가 t분 동안 흘려보낸 물, L. */
export function model_calculate_water_volume(flow, minutes) {
  return flow * minutes;
}

/**
 * 물 L를 ΔT만큼 데우는 데 드는 에너지, kWh.
 * L → kg(ρ) → kJ(c) → kWh(3,600). 세 단계지만 ρ = 1 kg/L에서 첫 단계는 이름만 바뀐다.
 */
export function model_calculate_energy_kwh(litres, riseK) {
  const kilojoules = WATER_DENSITY_KG_PER_LITRE * litres * WATER_SPECIFIC_HEAT_KJ_PER_KG_K * riseK;
  return kilojoules / KILOJOULES_PER_KILOWATT_HOUR;
}

/** 물의 교차 시점 t* = V / Q, 분. */
export function model_calculate_water_crossover(bathLitres, flow) {
  return bathLitres / flow;
}

/**
 * 에너지의 교차 시점 t*_E = t* · (ΔT_b / ΔT_s), 분.
 *
 * **`(V·ΔT_b)/(Q·ΔT_s)`가 아니라 `t*`에 비를 곱하는 형태로 둔다.**
 * 두 상승폭이 같으면 비가 정확히 1.0이 되어 t*_E === t*가 **부동소수점 오차 없이**
 * 성립한다. 곱셈 순서를 바꾸면 마지막 자리가 갈려 두 세로선이 1 ulp만큼 어긋나고,
 * "같으면 하나로 겹친다"는 화면의 약속이 조용히 깨진다.
 * 두 식이 같은 값을 낸다는 것은 model.test.js가 독립 경로로 대조한다.
 */
export function model_calculate_energy_crossover(bathLitres, flow, riseShower, riseBath) {
  return model_calculate_water_crossover(bathLitres, flow) * (riseBath / riseShower);
}

/** 단가를 곱한다. 단가가 없으면 null — 0과 다르다. */
export function model_calculate_cost(kilowattHours, unitPrice) {
  if (unitPrice === null || unitPrice === undefined || !Number.isFinite(unitPrice)) return null;
  return kilowattHours * unitPrice;
}

// ── 전체 결과 ───────────────────────────────────────────────

/**
 * 한 설정의 모든 값. **계산 경로는 여기 하나뿐이다** —
 * 카드·두 패널·표가 전부 이 함수(또는 이 함수가 부르는 것)를 읽는다.
 */
export function model_calculate_result(flow, minutes, bathLitres, riseShower, riseBath) {
  const check = model_check_parameters(flow, minutes, bathLitres, riseShower, riseBath);
  if (!check.ok) throw new Error(check.message);

  const showerLitres = model_calculate_water_volume(flow, minutes);
  const showerKwh = model_calculate_energy_kwh(showerLitres, riseShower);
  const bathKwh = model_calculate_energy_kwh(bathLitres, riseBath);

  const waterCrossoverMinutes = model_calculate_water_crossover(bathLitres, flow);
  const energyCrossoverMinutes = model_calculate_energy_crossover(bathLitres, flow, riseShower, riseBath);
  const crossoverGapMinutes = waterCrossoverMinutes - energyCrossoverMinutes;
  // 두 상승폭이 정확히 같을 때만 같은 분이다(비 = 1). 슬라이더 눈금이 1 K라 정수 비교로 충분하다.
  const merged = riseShower === riseBath;

  // 두 교차 시점 사이에 지금 시간이 들어와 있으면, 모델은 한 축에서 앞서고
  // 다른 축에서 뒤진다고 동시에 말한다. 이 페이지가 찾는 상태다.
  const lowMinutes = Math.min(waterCrossoverMinutes, energyCrossoverMinutes);
  const highMinutes = Math.max(waterCrossoverMinutes, energyCrossoverMinutes);
  const split =
    !merged &&
    minutes > lowMinutes + VERDICT_BOUNDARY_EPSILON_MINUTES &&
    minutes < highMinutes - VERDICT_BOUNDARY_EPSILON_MINUTES;

  return {
    flow,
    minutes,
    bathLitres,
    riseShower,
    riseBath,
    showerLitres,
    showerKwh,
    bathKwh,
    // 곡선의 기울기. 렌더가 자기 축을 잡을 때 쓴다.
    litresPerMinute: flow,
    kwhPerMinute: model_calculate_energy_kwh(flow, riseShower),
    waterCrossoverMinutes,
    energyCrossoverMinutes,
    crossoverGapMinutes,
    merged,
    split,
    // 지금 시간에서의 두 차이. 양수면 샤워 쪽이 더 썼다.
    waterDifferenceLitres: showerLitres - bathLitres,
    energyDifferenceKwh: showerKwh - bathKwh,
  };
}

/**
 * 판정. "물과 에너지가 같은 말을 하는가"라는 가정이 어디서 깨지는가로 가른다.
 *   hold  두 교차 시점이 같은 분에 떨어진다 — 에너지 패널이 물 패널을 되풀이한다
 *   edge  두 시점이 갈라졌지만 지금 시간은 그 사이에 있지 않다
 *   break 지금 시간이 두 시점 사이에 있다 — 두 축이 반대를 말한다
 */
export function model_calculate_verdict(result) {
  if (result.merged) return VERDICT_HOLD;
  return result.split ? VERDICT_BREAK : VERDICT_EDGE;
}

/**
 * 민감도 표. 유량 5 × 욕조 물량 4의 t* 격자.
 * **t*는 온도 상승폭에 의존하지 않는다** — 표가 물 교차만 싣는 이유다.
 */
export function model_calculate_crossover_table(flows = TABLE_FLOWS_LPM, bathVolumes = TABLE_BATH_LITRES) {
  return flows.map((flow) => ({
    flow,
    minutes: bathVolumes.map((bathLitres) => model_calculate_water_crossover(bathLitres, flow)),
  }));
}
