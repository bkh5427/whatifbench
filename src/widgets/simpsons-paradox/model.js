/**
 * 심슨의 역설 — 두 그룹 · 두 선택지 혼합 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (산술). 참·거짓이 갈리므로 단위테스트로 고정한다.
 *
 * 모델이 다루는 것:
 *   선택지 A·B를 각각 그룹 1·2에서 시도한다. 여덟 개의 숫자가 전부다 —
 *   (표본수 n, 성공률 p)를 2선택지 × 2그룹.
 *   합계 비율은 그룹 비율의 **가중평균**이고, 가중치는 "어디서 시도했는가"다.
 *
 *     P_A = w_A·p_A1 + (1 − w_A)·p_A2 ,  w_A = n_A1 / (n_A1 + n_A2)
 *
 *   역전은 그 가중치가 두 선택지에서 다를 때만 생긴다. 항등식은 model.test.js가
 *   독립 경로로 대조한다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ─────────────────
export const SIMPSON_SIZE_MIN = 0;
export const SIMPSON_SIZE_MAX = 1000;
export const SIMPSON_SIZE_STEP = 1;

export const SIMPSON_RATE_MIN = 0;
export const SIMPSON_RATE_MAX = 1;

/**
 * 성공률 슬라이더에는 **눈금을 두지 않는다** (`step="any"`).
 *
 * 프리셋은 정수 카운트에서 나온 비율이라 어떤 눈금에도 얹히지 않는다
 * (512/825 = 0.6206060…). 눈금을 두면 브라우저가 `value`를 눈금으로 스냅하므로
 * 손잡이가 가리키는 값과 모델이 쓰는 값이 갈라진다 — 그 차이는 화면에 아무
 * 표시도 남기지 않는다. 실측으로 확인했다: `step="0.001"`에 0.620606을 넣으면
 * 값이 0.621이 되고, `step="any"`면 0.620606 그대로 남는다.
 *
 * 눈금을 없애도 키보드 조작은 살아 있다 — `step="any"`인 range에서 방향키는
 * 범위의 1/100(여기서는 1%p), PageUp/PageDown은 1/10만큼 움직인다.
 * 그래서 이 상수는 슬라이더에 넣는 값이 아니라 **힌트 문구가 인용하는 값**이다.
 */
export const SIMPSON_RATE_SLIDER_STEP = 'any';
export const SIMPSON_RATE_KEYBOARD_STEP = 0.01;

// ── 기본 상태 (Berkeley 프리셋으로 로드한다. 빈 폼으로 두지 않는다) ──
export const SIMPSON_PRESET_DEFAULT = 'berkeley';

// ── 그룹·선택지 식별자 ──────────────────────────────────────
export const SIMPSON_OPTION_KEYS = ['a', 'b'];
export const SIMPSON_GROUP_KEYS = ['1', '2'];

// ── 판정 상태 ───────────────────────────────────────────────
/** 그룹 승자와 합계 승자가 같다. */
export const SIMPSON_VERDICT_AGREES = 'agrees';
/** 합계가 정확히 같거나, 어느 한 그룹이 정확히 같다. 경계다. */
export const SIMPSON_VERDICT_TIED = 'tied';
/** 두 그룹에서 이긴 쪽이 합계에서 진다. 이 페이지가 찾는 것. */
export const SIMPSON_VERDICT_REVERSED = 'reversed';
/** 그룹끼리 승자가 엇갈린다 — 역전이라고 말할 수 있는 상태가 아니다. */
export const SIMPSON_VERDICT_MIXED = 'mixed';

/** 판정 → 배지 색. global.css의 --hold / --edge / --break 세 색만 쓴다. */
export const SIMPSON_VERDICT_TONE = {
  [SIMPSON_VERDICT_AGREES]: 'hold',
  [SIMPSON_VERDICT_TIED]: 'edge',
  [SIMPSON_VERDICT_MIXED]: 'edge',
  [SIMPSON_VERDICT_REVERSED]: 'break',
};

/**
 * 비율이 같다고 볼 오차. 부동소수 연산 뒤 두 값이 정확히 같기를 기대할 수 없다.
 * 화면 표시 정밀도(0.1%p)의 1/200이라, 눈에 보이는 차이를 '같다'로 삼키지 않는다.
 */
export const SIMPSON_RATE_EPSILON = 5e-6;

/**
 * 프리셋 — **정수 카운트로 적는다.** 비율로 적으면 원자료가 아니라
 * 원자료를 반올림한 것이 저장된다.
 *
 * `size`는 시도 수, `success`는 성공 수. 비율은 여기서 유도한다.
 * 이 표가 이 위젯에서 유일하게 외부 자료를 인용하는 자리다 (출처는 페이지 본문).
 */
export const SIMPSON_PRESETS = [
  {
    key: 'berkeley',
    name: 'Berkeley 1973 (departments A and F)',
    // 화면 라벨. 프리셋마다 그룹·선택지의 이름이 다르다.
    optionLabels: { a: 'Men', b: 'Women' },
    groupLabels: { 1: 'Department A', 2: 'Department F' },
    unitLabel: 'applications',
    successLabel: 'admitted',
    counts: {
      a1: { size: 825, success: 512 },
      a2: { size: 373, success: 22 },
      b1: { size: 108, success: 89 },
      b2: { size: 341, success: 24 },
    },
  },
  {
    key: 'kidney',
    name: 'Kidney stones, 1986 series',
    optionLabels: { a: 'Open surgery', b: 'Percutaneous' },
    groupLabels: { 1: 'Small stones', 2: 'Large stones' },
    unitLabel: 'cases',
    successLabel: 'successful',
    counts: {
      a1: { size: 87, success: 81 },
      a2: { size: 263, success: 192 },
      b1: { size: 270, success: 234 },
      b2: { size: 80, success: 55 },
    },
  },
  {
    key: 'even',
    name: 'Equal mixing (no reversal possible)',
    optionLabels: { a: 'Option A', b: 'Option B' },
    groupLabels: { 1: 'Group 1', 2: 'Group 2' },
    unitLabel: 'trials',
    successLabel: 'successes',
    // w_A = w_B = 0.5. 항등식의 두 번째 항이 0이라 역전이 원리적으로 불가능하다.
    counts: {
      a1: { size: 400, success: 320 },
      a2: { size: 400, success: 120 },
      b1: { size: 400, success: 280 },
      b2: { size: 400, success: 80 },
    },
  },
];

/** 프리셋이 없을 때 쓰는 라벨. 슬라이더를 직접 움직이면 이 이름으로 돌아온다. */
export const SIMPSON_CUSTOM_LABELS = {
  optionLabels: { a: 'Option A', b: 'Option B' },
  groupLabels: { 1: 'Group 1', 2: 'Group 2' },
  unitLabel: 'trials',
  successLabel: 'successes',
};

// ── 클램프 ──────────────────────────────────────────────────

/** 표본수를 유효범위 안의 정수로. */
export function model_clamp_size(value) {
  return Math.round(num_clamp_value(value, SIMPSON_SIZE_MIN, SIMPSON_SIZE_MAX));
}

/**
 * 성공률을 유효범위 안으로. **반올림하지 않는다** —
 * 슬라이더에 눈금이 없으므로(위 주석) 모델도 스냅할 자리가 없다.
 * 프리셋의 512/825는 512/825인 채로 계산에 들어간다.
 */
export function model_clamp_rate(value) {
  return num_clamp_value(value, SIMPSON_RATE_MIN, SIMPSON_RATE_MAX);
}

/** 프리셋 하나를 key로. 없으면 null. */
export function model_read_preset(key) {
  return SIMPSON_PRESETS.find((preset) => preset.key === key) ?? null;
}

/**
 * 프리셋의 정수 카운트를 슬라이더 상태(표본수 + 성공률)로 바꾼다.
 *
 * 비율은 나눗셈 한 번뿐이고 반올림이 없다. 그래서 표시용 성공 건수
 * `round(n·p)`가 원래의 정수 카운트로 되돌아온다 — model.test.js가 못박는다.
 */
export function model_calculate_preset_state(key) {
  const preset = model_read_preset(key);
  if (!preset) return null;
  const state = { preset: key };
  for (const cell of ['a1', 'a2', 'b1', 'b2']) {
    const { size, success } = preset.counts[cell];
    state[`size${cell.toUpperCase()}`] = model_clamp_size(size);
    // size가 0이면 비율이 0/0이다. 프리셋에는 그런 칸이 없지만 가드는 둔다.
    state[`rate${cell.toUpperCase()}`] = size > 0 ? model_clamp_rate(success / size) : 0;
  }
  return state;
}

// ── 계산 ────────────────────────────────────────────────────

/**
 * 한 선택지의 시도 중 그룹 1에 놓인 비율. w = n1 / (n1 + n2).
 * 이 값이 두 선택지에서 다를 때만 역전이 생긴다 — 페이지의 논지다.
 * 총 시도가 0이면 정의되지 않는다 → null.
 */
export function model_calculate_group_weight(sizeGroup1, sizeGroup2) {
  const total = sizeGroup1 + sizeGroup2;
  if (!(total > 0)) return null;
  return sizeGroup1 / total;
}

/**
 * 한 선택지의 합계 비율. 그룹 비율의 가중평균이다.
 * 총 시도가 0이면 null (0으로 나누는 자리를 조용히 NaN으로 흘리지 않는다).
 */
export function model_calculate_pooled_rate(sizeGroup1, rateGroup1, sizeGroup2, rateGroup2) {
  const weight = model_calculate_group_weight(sizeGroup1, sizeGroup2);
  if (weight === null) return null;
  return weight * rateGroup1 + (1 - weight) * rateGroup2;
}

/**
 * 화면에 찍을 성공 건수. n·p를 정수로 반올림한다.
 *
 * **표시 전용이다.** 막대와 판정은 반올림하지 않은 비율로 계산한다.
 * 비율만 찍으면 가중치가 화면에서 사라지므로 건수를 같이 찍는 것이고,
 * 그 대가로 표시된 건수는 옆의 비율과 최대 반 건 어긋날 수 있다.
 */
export function model_calculate_success_count(size, rate) {
  return Math.round(size * rate);
}

/** 두 비율의 대소. 같으면 0, 앞이 크면 1, 뒤가 크면 -1. 오차는 같음으로 본다. */
export function model_calculate_lead(rateFirst, rateSecond) {
  if (rateFirst === null || rateSecond === null) return null;
  const gap = rateFirst - rateSecond;
  if (Math.abs(gap) <= SIMPSON_RATE_EPSILON) return 0;
  return gap > 0 ? 1 : -1;
}

/**
 * 파라미터가 모델의 유효범위 안에 있는지 확인한다.
 * 유효범위 밖에서 조용히 숫자를 뱉지 않게 하는 것이 목적 —
 * 어느 선택지든 시도가 하나도 없으면 합계 비율이 정의되지 않는다.
 */
export function model_check_parameters(state) {
  for (const key of ['sizeA1', 'sizeA2', 'sizeB1', 'sizeB2']) {
    const value = state[key];
    if (!Number.isInteger(value) || value < SIMPSON_SIZE_MIN || value > SIMPSON_SIZE_MAX) {
      return { ok: false, message: `${key}는 ${SIMPSON_SIZE_MIN}~${SIMPSON_SIZE_MAX}의 정수여야 한다.` };
    }
  }
  for (const key of ['rateA1', 'rateA2', 'rateB1', 'rateB2']) {
    const value = state[key];
    if (!Number.isFinite(value) || value < SIMPSON_RATE_MIN || value > SIMPSON_RATE_MAX) {
      return { ok: false, message: `${key}는 ${SIMPSON_RATE_MIN}~${SIMPSON_RATE_MAX} 사이여야 한다.` };
    }
  }
  if (state.sizeA1 + state.sizeA2 <= 0) {
    return { ok: false, message: '선택지 A의 시도가 하나도 없어 합계 비율이 정의되지 않는다.' };
  }
  if (state.sizeB1 + state.sizeB2 <= 0) {
    return { ok: false, message: '선택지 B의 시도가 하나도 없어 합계 비율이 정의되지 않는다.' };
  }
  return { ok: true, message: '' };
}

/**
 * 판정. 네 상태를 가른다.
 *
 * **'두 그룹에서 같은 쪽이 이겼는가'를 먼저 본다.** 이 조건을 빼면
 * 그냥 엇갈린 경우(한 그룹은 A, 다른 그룹은 B)까지 '역전'으로 새어 들어온다 —
 * model.test.js가 그 경우를 따로 잡는다.
 */
export function model_calculate_reversal_state(leadGroup1, leadGroup2, leadPooled) {
  if (leadGroup1 === null || leadGroup2 === null || leadPooled === null) return SIMPSON_VERDICT_MIXED;
  // 어느 한쪽이라도 정확히 같으면 '두 그룹에서 이겼다'가 성립하지 않는다.
  if (leadGroup1 === 0 || leadGroup2 === 0) return SIMPSON_VERDICT_TIED;
  if (leadGroup1 !== leadGroup2) return SIMPSON_VERDICT_MIXED;
  if (leadPooled === 0) return SIMPSON_VERDICT_TIED;
  return leadPooled === leadGroup1 ? SIMPSON_VERDICT_AGREES : SIMPSON_VERDICT_REVERSED;
}

/**
 * 상태 하나에서 화면이 필요한 것을 전부 만든다.
 *
 * **계산 경로는 여기 하나뿐이다.** 막대·배지·표·캡션이 전부 이 반환값을 읽는다.
 * 요약용 루프를 따로 두면 시간이 지나며 갈라져 표와 그림이 달라진다.
 */
export function model_calculate_result(state) {
  const check = model_check_parameters(state);
  if (!check.ok) throw new Error(check.message);

  const options = {};
  for (const option of SIMPSON_OPTION_KEYS) {
    const upper = option.toUpperCase();
    const size1 = state[`size${upper}1`];
    const size2 = state[`size${upper}2`];
    const rate1 = state[`rate${upper}1`];
    const rate2 = state[`rate${upper}2`];
    options[option] = {
      groups: {
        1: { size: size1, rate: size1 > 0 ? rate1 : null, success: model_calculate_success_count(size1, rate1) },
        2: { size: size2, rate: size2 > 0 ? rate2 : null, success: model_calculate_success_count(size2, rate2) },
      },
      weight: model_calculate_group_weight(size1, size2),
      totalSize: size1 + size2,
      pooledRate: model_calculate_pooled_rate(size1, rate1, size2, rate2),
      pooledSuccess:
        model_calculate_success_count(size1, rate1) + model_calculate_success_count(size2, rate2),
    };
  }

  const leadGroup1 = model_calculate_lead(options.a.groups[1].rate, options.b.groups[1].rate);
  const leadGroup2 = model_calculate_lead(options.a.groups[2].rate, options.b.groups[2].rate);
  const leadPooled = model_calculate_lead(options.a.pooledRate, options.b.pooledRate);
  const verdict = model_calculate_reversal_state(leadGroup1, leadGroup2, leadPooled);

  return {
    options,
    leads: { 1: leadGroup1, 2: leadGroup2, pooled: leadPooled },
    weightGap: options.a.weight === null || options.b.weight === null
      ? null
      : options.a.weight - options.b.weight,
    verdict,
    tone: SIMPSON_VERDICT_TONE[verdict],
  };
}

/**
 * 항등식의 두 항을 따로 낸다 — 본문 2.5절이 유도한 분해다.
 *
 *   P_A − P_B = [ w_A·d₁ + (1 − w_A)·d₂ ] + (w_A − w_B)·(p_B1 − p_B2)
 *               └── withinTerm ──────────┘  └── mixingTerm ──────────┘
 *
 * 첫 항은 그룹 안의 격차를 가중평균한 것이고, 둘째 항에는 격차가 아예 없다.
 * **역전은 둘째 항이 만든다.** 화면의 가중치 띠가 가리키는 것이 이 항이다.
 * 두 항의 합이 실제 합계 차이와 같은지는 model.test.js가 독립 경로로 확인한다.
 */
export function model_calculate_decomposition(state) {
  const check = model_check_parameters(state);
  if (!check.ok) throw new Error(check.message);

  const weightA = model_calculate_group_weight(state.sizeA1, state.sizeA2);
  const weightB = model_calculate_group_weight(state.sizeB1, state.sizeB2);
  const gapGroup1 = state.rateA1 - state.rateB1;
  const gapGroup2 = state.rateA2 - state.rateB2;

  const withinTerm = weightA * gapGroup1 + (1 - weightA) * gapGroup2;
  const mixingTerm = (weightA - weightB) * (state.rateB1 - state.rateB2);
  return { weightA, weightB, gapGroup1, gapGroup2, withinTerm, mixingTerm, total: withinTerm + mixingTerm };
}
