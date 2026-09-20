/**
 * 자전거 기어비 — 기구학 모델
 *
 * 이 파일에는 순수 계산 함수만 둔다. DOM 접근 금지.
 * 모델 등급 A (기구학). 시뮬레이션은 없다 — 닫힌 형태를 한 번 계산할 뿐이다.
 *
 * 이 페이지의 유일한 산술 위험은 **단위 섞기**다. 그래서 내부 계산은 전부
 * 밀리미터로 하고 인치·미터·km/h로의 환산은 마지막 한 곳에서만 한다.
 * 환산 계수는 파일 상단 상수로 둔다 — 식 안에 25.4가 보이면 그것이 사고 지점이다.
 *
 * **저작권**: 부품 브랜드명·제품명은 이 파일 어디에도 없다. 톱니 수와
 * ETRTO 코드(폭-비드시트지름)만 쓴다. 프리셋의 중간 톱니 수는 특정 제품을
 * 옮긴 것이 아니라 양 끝 사이를 매끄럽게 잇는 배열이다.
 *
 * **사용자에게 보이는 문구는 영문이다.** `model_check_parameters`가 돌려주는
 * 사유 문구는 그대로 화면의 판정 배너에 실린다 — 위젯이 다시 쓰지 않는다.
 */

import { num_clamp_value, num_read_decimal } from '../_shared/numbers.js';

// ── 단위 환산 (식 안에 리터럴로 쓰지 않는다) ─────────────────
export const MM_PER_INCH = 25.4;
export const MM_PER_METRE = 1000;
export const METRES_PER_KM = 1000;
export const MINUTES_PER_HOUR = 60;
export const PERCENT_SCALE = 100;
/** 지름 → 반지름. 게인비가 쓰는 유일한 자리다. */
export const DIAMETER_TO_RADIUS = 2;
/** ETRTO 표기의 폭은 타이어 한쪽이 아니라 단면 폭이므로 지름에 두 번 들어간다. */
export const TYRE_WIDTH_TO_DIAMETER = 2;

// ── 앞 체인링 ──────────────────────────────────────────────
export const GEAR_CHAINRING_MIN = 20;
export const GEAR_CHAINRING_MAX = 60;
export const GEAR_CHAINRING_STEP = 1;
/** 빈 칸을 뜻하는 값. 1× 구동계는 두 번째 칸이 비어 있는 상태다. */
export const GEAR_CHAINRING_NONE = 0;
export const GEAR_CHAINRING_DEFAULT_LARGE = 50;
export const GEAR_CHAINRING_DEFAULT_SMALL = 34;
/** 앞 칸은 두 개다. 세 개째를 넣으려면 사다리의 줄도 세 줄이 되어야 한다. */
export const GEAR_CHAINRING_SLOTS = 2;

// ── 뒤 카세트 ──────────────────────────────────────────────
export const GEAR_SPROCKET_MIN = 9;
export const GEAR_SPROCKET_MAX = 52;
export const GEAR_SPROCKET_COUNT_MIN = 1;
export const GEAR_SPROCKET_COUNT_MAX = 13;
export const GEAR_CASSETTE_DEFAULT = [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28];
/** 카세트 문자열의 구분자. 화면의 안내 문구와 파서가 같은 것을 쓴다. */
export const GEAR_CASSETTE_SEPARATOR = ',';

// ── 휠 (ETRTO) ─────────────────────────────────────────────
export const GEAR_TYRE_WIDTH_MIN = 18;
export const GEAR_TYRE_WIDTH_MAX = 65;
export const GEAR_TYRE_WIDTH_STEP = 1;
export const GEAR_TYRE_WIDTH_DEFAULT = 25;
/** 비드시트 지름. ISO 5775의 표기에서 뒤에 오는 숫자다. */
export const GEAR_BEAD_SEAT_CHOICES = [622, 584, 559, 406];
export const GEAR_BEAD_SEAT_DEFAULT = 622;

// ── 크랭크·케이던스 ────────────────────────────────────────
export const GEAR_CRANK_MIN = 155;
export const GEAR_CRANK_MAX = 180;
export const GEAR_CRANK_STEP = 2.5;
export const GEAR_CRANK_DEFAULT = 172.5;

export const GEAR_CADENCE_MIN = 50;
export const GEAR_CADENCE_MAX = 120;
export const GEAR_CADENCE_STEP = 1;
export const GEAR_CADENCE_DEFAULT = 90;

// ── 중복 판정 허용오차 (백분율로 들고 다닌다) ────────────────
export const GEAR_TOLERANCE_MIN = 2;
export const GEAR_TOLERANCE_MAX = 10;
export const GEAR_TOLERANCE_STEP = 0.5;
export const GEAR_TOLERANCE_DEFAULT = 5;

// ── 판정 임계값 ─────────────────────────────────────────────
/**
 * 지울 수 있는 조합의 비율. 편집 판단이지 규격이 아니다.
 * 2× 구동계에서 한 계열이 통째로 겹치면 절반에 가까워지므로 그 절반쯤을 파탄으로 둔다.
 */
export const GEAR_VERDICT_EDGE_MIN_SHARE = 0.15;
export const GEAR_VERDICT_BREAK_MIN_SHARE = 0.35;

// ── 겹침 계산의 방어값 ──────────────────────────────────────
/** 로그 폭이 이보다 좁으면 "구간"이라고 부를 수 없다. 0으로 나누는 것도 막는다. */
export const GEAR_SPAN_EPSILON = 1e-12;

/** 소수 자릿수 반올림 자리. 스텝 스냅에서 부동소수 꼬리를 잘라낸다. */
const SNAP_DIGITS = 6;

// ── 프리셋 ─────────────────────────────────────────────────
/**
 * 카세트 프리셋. **양 끝 톱니 수만이 사실이고 가운데는 매끄러운 배열이다** —
 * 특정 제품의 배열을 옮긴 것이 아니다. 이름도 톱니 수와 단수뿐이다.
 */
export const GEAR_CASSETTE_PRESETS = [
  { key: 'c1128', label: '11-28 (11 sprockets)', teeth: [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28] },
  { key: 'c1134', label: '11-34 (11 sprockets)', teeth: [11, 12, 13, 14, 16, 18, 20, 22, 25, 29, 34] },
  { key: 'c1142', label: '11-42 (single ring)', teeth: [11, 13, 15, 17, 19, 22, 25, 28, 32, 37, 42] },
];

/**
 * 자전거 유형 프리셋. 체인링·카세트·휠·크랭크를 한 번에 갈아끼운다.
 * 이름은 자전거의 쓰임새이지 제품이 아니다.
 */
export const GEAR_BIKE_PRESETS = [
  {
    key: 'road',
    label: 'Road double',
    chainrings: [GEAR_CHAINRING_DEFAULT_LARGE, GEAR_CHAINRING_DEFAULT_SMALL],
    cassetteKey: 'c1128',
    tyreWidthMm: 25,
    beadSeatMm: 622,
    crankMm: 172.5,
  },
  {
    key: 'gravel',
    label: 'Gravel single ring',
    chainrings: [42, GEAR_CHAINRING_NONE],
    cassetteKey: 'c1142',
    tyreWidthMm: 40,
    beadSeatMm: 622,
    crankMm: 172.5,
  },
  {
    key: 'mountain',
    label: 'Mountain single ring',
    chainrings: [32, GEAR_CHAINRING_NONE],
    cassetteKey: 'c1142',
    tyreWidthMm: 57,
    beadSeatMm: 584,
    crankMm: 175,
  },
  {
    key: 'small',
    label: 'Small wheel',
    chainrings: [53, GEAR_CHAINRING_NONE],
    cassetteKey: 'c1128',
    tyreWidthMm: 35,
    beadSeatMm: 406,
    crankMm: 170,
  },
];

// ── 클램프 ─────────────────────────────────────────────────

/** 값을 눈금 위로 스냅한 뒤 범위로 자른다. 손잡이가 가리키는 값과 계산값이 갈리지 않게. */
function model_clamp_stepped(value, minValue, maxValue, step) {
  const inside = num_clamp_value(value, minValue, maxValue);
  const snapped = minValue + Math.round((inside - minValue) / step) * step;
  return num_clamp_value(Number(snapped.toFixed(SNAP_DIGITS)), minValue, maxValue);
}

export function model_clamp_chainring(value) {
  return model_clamp_stepped(value, GEAR_CHAINRING_MIN, GEAR_CHAINRING_MAX, GEAR_CHAINRING_STEP);
}

/** 두 번째 앞 칸은 비어 있을 수 있다. 0 이하는 "없음"이고 최솟값으로 밀지 않는다. */
export function model_clamp_chainring_optional(value) {
  if (!Number.isFinite(value) || value <= GEAR_CHAINRING_NONE) return GEAR_CHAINRING_NONE;
  return model_clamp_chainring(value);
}

export function model_clamp_tyre_width(value) {
  return model_clamp_stepped(value, GEAR_TYRE_WIDTH_MIN, GEAR_TYRE_WIDTH_MAX, GEAR_TYRE_WIDTH_STEP);
}

/** 드롭다운의 값은 목록에 있는 것뿐이다. 목록 밖이면 **최솟값이 아니라 기본값**으로. */
export function model_clamp_bead_seat(value) {
  return GEAR_BEAD_SEAT_CHOICES.includes(value) ? value : GEAR_BEAD_SEAT_DEFAULT;
}

export function model_clamp_crank(value) {
  return model_clamp_stepped(value, GEAR_CRANK_MIN, GEAR_CRANK_MAX, GEAR_CRANK_STEP);
}

export function model_clamp_cadence(value) {
  return model_clamp_stepped(value, GEAR_CADENCE_MIN, GEAR_CADENCE_MAX, GEAR_CADENCE_STEP);
}

export function model_clamp_tolerance(value) {
  return model_clamp_stepped(value, GEAR_TOLERANCE_MIN, GEAR_TOLERANCE_MAX, GEAR_TOLERANCE_STEP);
}

// ── 카세트 문자열 ───────────────────────────────────────────

/** 톱니 수 배열을 입력칸에 되돌릴 문자열로. 파서와 짝이다. */
export function model_format_cassette(teeth) {
  return teeth.join(`${GEAR_CASSETTE_SEPARATOR} `);
}

/**
 * 쉼표로 나뉜 톱니 수 문자열을 읽는다.
 *
 * 깨진 입력에 조용히 NaN을 흘리지 않는다 — **무엇이 잘못됐는지 평이한 영어로**
 * 돌려주고, 부르는 쪽이 그것을 화면에 적는다.
 * `Number('')`는 0이고 `Number('0x10')`은 16이라 십진 정수만 정규식으로 통과시킨다.
 */
export function model_read_cassette(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    return {
      ok: false,
      teeth: [],
      message: `Type at least one sprocket size, separated by commas — for example ${model_format_cassette(GEAR_CASSETTE_DEFAULT.slice(0, 3))}.`,
    };
  }
  const tokens = text.split(GEAR_CASSETTE_SEPARATOR).map((token) => token.trim());
  const teeth = [];
  for (const token of tokens) {
    if (token === '') {
      return {
        ok: false,
        teeth: [],
        message: 'There is an empty slot between two commas. Remove the extra comma.',
      };
    }
    if (!/^\d+$/.test(token)) {
      return {
        ok: false,
        teeth: [],
        message: `"${token}" is not a whole number of teeth. Write the sprocket sizes as plain numbers separated by commas.`,
      };
    }
    const value = Number(token);
    if (value < GEAR_SPROCKET_MIN || value > GEAR_SPROCKET_MAX) {
      return {
        ok: false,
        teeth: [],
        message: `A sprocket of ${value} teeth is outside the ${GEAR_SPROCKET_MIN} to ${GEAR_SPROCKET_MAX} the model accepts.`,
      };
    }
    teeth.push(value);
  }
  if (teeth.length > GEAR_SPROCKET_COUNT_MAX) {
    return {
      ok: false,
      teeth: [],
      message: `The model takes at most ${GEAR_SPROCKET_COUNT_MAX} sprockets; that list has ${teeth.length}.`,
    };
  }
  return { ok: true, teeth, message: '' };
}

/** URL·입력이 깨졌을 때 돌아갈 자리. **최솟값이 아니라 기본 배열이다.** */
export function model_read_cassette_or_default(raw) {
  const parsed = model_read_cassette(raw);
  return parsed.ok ? parsed.teeth : GEAR_CASSETTE_DEFAULT.slice();
}

// ── 기하 ────────────────────────────────────────────────────

/**
 * ETRTO 표기에서 바깥 지름. D = d + 2w.
 * 부푼 타이어의 단면 높이가 단면 폭과 같다고 본다 — 그것이 이 모델의 가정이다.
 */
export function model_calculate_wheel_diameter(beadSeatMm, tyreWidthMm) {
  return beadSeatMm + TYRE_WIDTH_TO_DIAMETER * tyreWidthMm;
}

/** 기하학적 둘레 πD, 미터. 하중에서의 변형은 모델에 없다. */
export function model_calculate_wheel_circumference(diameterMm) {
  return (Math.PI * diameterMm) / MM_PER_METRE;
}

/** 발전량(m/rev)과 케이던스(rpm)에서 속도(km/h). */
export function model_calculate_speed(developmentM, cadenceRpm) {
  return (cadenceRpm * developmentM * MINUTES_PER_HOUR) / METRES_PER_KM;
}

// ── 파라미터 검사 ───────────────────────────────────────────

/**
 * 유효범위 밖 조합은 조용히 숫자를 뱉지 않는다.
 * 문구는 그대로 화면에 실리므로 영문이고, 무엇을 어떻게 고치면 되는지까지 적는다.
 */
export function model_check_parameters(state) {
  const chainrings = Array.isArray(state.chainrings) ? state.chainrings : [];
  if (chainrings.length === 0) {
    return {
      ok: false,
      message: `Enter at least one front ring, between ${GEAR_CHAINRING_MIN} and ${GEAR_CHAINRING_MAX} teeth.`,
    };
  }
  if (chainrings.length > GEAR_CHAINRING_SLOTS) {
    return { ok: false, message: `The model takes at most ${GEAR_CHAINRING_SLOTS} front rings.` };
  }
  for (const teeth of chainrings) {
    if (!Number.isInteger(teeth) || teeth < GEAR_CHAINRING_MIN || teeth > GEAR_CHAINRING_MAX) {
      return {
        ok: false,
        message: `A front ring of ${teeth} teeth is outside the ${GEAR_CHAINRING_MIN} to ${GEAR_CHAINRING_MAX} the model accepts.`,
      };
    }
  }

  const cassette = Array.isArray(state.cassette) ? state.cassette : [];
  if (cassette.length < GEAR_SPROCKET_COUNT_MIN || cassette.length > GEAR_SPROCKET_COUNT_MAX) {
    return {
      ok: false,
      message: `The model takes ${GEAR_SPROCKET_COUNT_MIN} to ${GEAR_SPROCKET_COUNT_MAX} sprockets; that list has ${cassette.length}.`,
    };
  }
  for (const teeth of cassette) {
    if (!Number.isInteger(teeth) || teeth < GEAR_SPROCKET_MIN || teeth > GEAR_SPROCKET_MAX) {
      return {
        ok: false,
        message: `A sprocket of ${teeth} teeth is outside the ${GEAR_SPROCKET_MIN} to ${GEAR_SPROCKET_MAX} the model accepts.`,
      };
    }
  }

  if (
    !Number.isFinite(state.tyreWidthMm) ||
    state.tyreWidthMm < GEAR_TYRE_WIDTH_MIN ||
    state.tyreWidthMm > GEAR_TYRE_WIDTH_MAX
  ) {
    return {
      ok: false,
      message: `Tyre width has to be between ${GEAR_TYRE_WIDTH_MIN} and ${GEAR_TYRE_WIDTH_MAX} mm.`,
    };
  }
  if (!GEAR_BEAD_SEAT_CHOICES.includes(state.beadSeatMm)) {
    return { ok: false, message: 'Pick a rim diameter from the list.' };
  }
  if (!Number.isFinite(state.crankMm) || state.crankMm < GEAR_CRANK_MIN || state.crankMm > GEAR_CRANK_MAX) {
    return { ok: false, message: `Crank length has to be between ${GEAR_CRANK_MIN} and ${GEAR_CRANK_MAX} mm.` };
  }
  if (
    !Number.isFinite(state.cadenceRpm) ||
    state.cadenceRpm < GEAR_CADENCE_MIN ||
    state.cadenceRpm > GEAR_CADENCE_MAX
  ) {
    return { ok: false, message: `Cadence has to be between ${GEAR_CADENCE_MIN} and ${GEAR_CADENCE_MAX} rpm.` };
  }
  if (
    !Number.isFinite(state.tolerancePercent) ||
    state.tolerancePercent < GEAR_TOLERANCE_MIN ||
    state.tolerancePercent > GEAR_TOLERANCE_MAX
  ) {
    return {
      ok: false,
      message: `The duplicate tolerance has to be between ${GEAR_TOLERANCE_MIN} and ${GEAR_TOLERANCE_MAX} percent.`,
    };
  }
  return { ok: true, message: '' };
}

// ── 조합 ────────────────────────────────────────────────────

/**
 * 조합 하나. **네 지표가 전부 같은 R을 쓴다** — 다른 것은 R에 곱해지는 길이뿐이다.
 * 내부는 밀리미터, 환산은 여기 한 곳에서만.
 */
export function model_build_combination(chainring, sprocket, ringIndex, geometry) {
  const ratio = chainring / sprocket;
  const developmentM = ratio * geometry.circumferenceM;
  return {
    chainring,
    sprocket,
    ringIndex,
    ratio,
    gearInches: (ratio * geometry.diameterMm) / MM_PER_INCH,
    gainRatio: (ratio * (geometry.diameterMm / DIAMETER_TO_RADIUS)) / geometry.crankMm,
    developmentM,
    speedKmh: model_calculate_speed(developmentM, geometry.cadenceRpm),
  };
}

/**
 * 앞 × 뒤 전수 조합. 사다리·중복 판정·표가 **이 배열 하나**를 읽는다.
 * 요약값용 루프를 따로 두지 않는다 — 두 벌이면 시간이 지나며 갈라진다.
 */
export function model_calculate_combinations(state) {
  const check = model_check_parameters(state);
  if (!check.ok) throw new Error(check.message);

  const diameterMm = model_calculate_wheel_diameter(state.beadSeatMm, state.tyreWidthMm);
  const geometry = {
    diameterMm,
    circumferenceM: model_calculate_wheel_circumference(diameterMm),
    crankMm: state.crankMm,
    cadenceRpm: state.cadenceRpm,
  };

  const combinations = [];
  state.chainrings.forEach((chainring, ringIndex) => {
    for (const sprocket of state.cassette) {
      combinations.push(model_build_combination(chainring, sprocket, ringIndex, geometry));
    }
  });
  return combinations;
}

// ── 중복 ────────────────────────────────────────────────────

/**
 * 두 비의 상대차. **작은 쪽을 분모로 삼는다** — 어느 쪽을 먼저 넣어도 같은 값이
 * 나와야 "A가 B의 중복이면 B도 A의 중복"이 성립한다.
 */
export function model_calculate_relative_gap(ratioA, ratioB) {
  const low = Math.min(ratioA, ratioB);
  if (!(low > 0) || !Number.isFinite(ratioA) || !Number.isFinite(ratioB)) return null;
  return Math.abs(ratioA - ratioB) / low;
}

/** 허용오차(비율)보다 가까우면 중복. 경계는 열려 있다 — "차이가 τ보다 작다". */
export function model_check_duplicate_pair(ratioA, ratioB, toleranceFraction) {
  const gap = model_calculate_relative_gap(ratioA, ratioB);
  return gap !== null && gap < toleranceFraction;
}

/**
 * 정의 ① — **지울 수 있는 조합.** 비 순으로 훑으며 이미 남긴 것과 τ 안에 드는
 * 조합을 지운다. 남은 것이 "서로 다른 비"의 개수다.
 */
export function model_pick_removable_duplicates(combinations, toleranceFraction) {
  const order = combinations
    .map((combination, index) => ({ index, ratio: combination.ratio }))
    .sort((a, b) => a.ratio - b.ratio);

  const kept = [];
  const removable = [];
  for (const item of order) {
    const twin = kept.find((other) => model_check_duplicate_pair(other.ratio, item.ratio, toleranceFraction));
    if (twin) removable.push({ index: item.index, keptIndex: twin.index });
    else kept.push(item);
  }
  return {
    removable,
    removableIndexes: removable.map((item) => item.index).sort((a, b) => a - b),
    keptIndexes: kept.map((item) => item.index).sort((a, b) => a - b),
  };
}

/**
 * 정의 ② — **짝이 있는 조합.** τ 안에 드는 상대가 하나라도 있으면 센다.
 * 지울 수 있는 쪽과 남는 쪽을 둘 다 세므로 정의 ①의 대략 두 배가 된다.
 * 사다리의 점선 연결선이 여기서 나온 `pairs`를 그린다.
 */
export function model_pick_paired_duplicates(combinations, toleranceFraction) {
  const pairs = [];
  const paired = new Set();
  for (let first = 0; first < combinations.length; first += 1) {
    for (let second = first + 1; second < combinations.length; second += 1) {
      const gap = model_calculate_relative_gap(combinations[first].ratio, combinations[second].ratio);
      if (gap === null || !(gap < toleranceFraction)) continue;
      pairs.push({ first, second, gap });
      paired.add(first);
      paired.add(second);
    }
  }
  return { pairs, pairedIndexes: [...paired].sort((a, b) => a - b) };
}

/**
 * 정의 ③ — **겹치는 구간의 비율.** 개수가 아니라 폭으로 잰다.
 * 체인링마다 자기가 덮는 비의 구간이 있고, 두 개 이상이 덮는 로그 폭이 얼마인가.
 *
 * **이 정의는 τ와 무관하다.** 허용오차를 아무리 움직여도 값이 변하지 않는다 —
 * 그것이 세 정의가 서로 다른 것을 세고 있다는 가장 분명한 증거다.
 */
export function model_calculate_overlap_share(combinations) {
  const spans = new Map();
  for (const combination of combinations) {
    if (!(combination.ratio > 0)) return 0;
    const logRatio = Math.log(combination.ratio);
    const span = spans.get(combination.ringIndex);
    if (!span) spans.set(combination.ringIndex, { low: logRatio, high: logRatio });
    else {
      span.low = Math.min(span.low, logRatio);
      span.high = Math.max(span.high, logRatio);
    }
  }
  const list = [...spans.values()];
  if (list.length < 2) return 0;

  const totalLow = Math.min(...list.map((span) => span.low));
  const totalHigh = Math.max(...list.map((span) => span.high));
  const total = totalHigh - totalLow;
  if (!(total > GEAR_SPAN_EPSILON)) return 0;

  const edges = [...new Set(list.flatMap((span) => [span.low, span.high]))].sort((a, b) => a - b);
  let covered = 0;
  for (let index = 0; index < edges.length - 1; index += 1) {
    const low = edges[index];
    const high = edges[index + 1];
    if (!(high - low > GEAR_SPAN_EPSILON)) continue;
    const middle = (low + high) / 2;
    const depth = list.filter((span) => span.low <= middle && middle <= span.high).length;
    if (depth >= 2) covered += high - low;
  }
  return covered / total;
}

// ── 결과 ────────────────────────────────────────────────────

/** 지울 수 있는 비율로 배너의 색을 고른다. 편집 판단이지 규격이 아니다. */
export function model_calculate_verdict(removableShare) {
  if (removableShare >= GEAR_VERDICT_BREAK_MIN_SHARE) return 'break';
  if (removableShare >= GEAR_VERDICT_EDGE_MIN_SHARE) return 'edge';
  return 'hold';
}

/**
 * 화면 전체가 읽는 결과 하나. 카드·사다리·속도선·표가 전부 여기서 나온다.
 * 유효범위 밖이면 숫자를 만들지 않고 throw한다.
 */
export function model_calculate_result(state) {
  const check = model_check_parameters(state);
  if (!check.ok) throw new Error(check.message);

  const combinations = model_calculate_combinations(state);
  const toleranceFraction = state.tolerancePercent / PERCENT_SCALE;
  const removableSet = model_pick_removable_duplicates(combinations, toleranceFraction);
  const pairedSet = model_pick_paired_duplicates(combinations, toleranceFraction);
  const overlapShare = model_calculate_overlap_share(combinations);

  const ratios = combinations.map((combination) => combination.ratio);
  const lowestRatio = Math.min(...ratios);
  const highestRatio = Math.max(...ratios);
  const lowest = combinations.find((combination) => combination.ratio === lowestRatio);
  const highest = combinations.find((combination) => combination.ratio === highestRatio);

  const diameterMm = model_calculate_wheel_diameter(state.beadSeatMm, state.tyreWidthMm);
  const count = combinations.length;

  return {
    ...state,
    toleranceFraction,
    diameterMm,
    circumferenceM: model_calculate_wheel_circumference(diameterMm),
    combinations,
    combinationCount: count,
    removableIndexes: removableSet.removableIndexes,
    removableCount: removableSet.removableIndexes.length,
    removableShare: removableSet.removableIndexes.length / count,
    distinctCount: removableSet.keptIndexes.length,
    pairs: pairedSet.pairs,
    pairedIndexes: pairedSet.pairedIndexes,
    pairedCount: pairedSet.pairedIndexes.length,
    pairedShare: pairedSet.pairedIndexes.length / count,
    overlapShare,
    lowest,
    highest,
    rangeFactor: highestRatio / lowestRatio,
    verdict: model_calculate_verdict(removableSet.removableIndexes.length / count),
  };
}

/** 프리셋 하나를 지금 상태 위에 얹는다. 케이던스와 허용오차는 사용자의 것을 남긴다. */
export function model_calculate_bike_preset_state(key, state) {
  const preset = GEAR_BIKE_PRESETS.find((item) => item.key === key);
  if (!preset) return null;
  const cassette = GEAR_CASSETTE_PRESETS.find((item) => item.key === preset.cassetteKey);
  return {
    ...state,
    chainrings: preset.chainrings.filter((teeth) => teeth !== GEAR_CHAINRING_NONE),
    cassette: cassette ? cassette.teeth.slice() : GEAR_CASSETTE_DEFAULT.slice(),
    tyreWidthMm: preset.tyreWidthMm,
    beadSeatMm: preset.beadSeatMm,
    crankMm: preset.crankMm,
  };
}

/** 지금 상태가 어느 자전거 프리셋과 같은가. 아니면 null. */
export function model_pick_matching_bike_preset(state) {
  for (const preset of GEAR_BIKE_PRESETS) {
    const wanted = model_calculate_bike_preset_state(preset.key, state);
    if (!wanted) continue;
    const sameRings =
      wanted.chainrings.length === state.chainrings.length &&
      wanted.chainrings.every((teeth, index) => teeth === state.chainrings[index]);
    const sameCassette =
      wanted.cassette.length === state.cassette.length &&
      wanted.cassette.every((teeth, index) => teeth === state.cassette[index]);
    if (
      sameRings &&
      sameCassette &&
      wanted.tyreWidthMm === state.tyreWidthMm &&
      wanted.beadSeatMm === state.beadSeatMm &&
      wanted.crankMm === state.crankMm
    ) {
      return preset.key;
    }
  }
  return null;
}

/** 지금 카세트가 어느 프리셋과 같은가. 아니면 null. */
export function model_pick_matching_cassette_preset(cassette) {
  const preset = GEAR_CASSETTE_PRESETS.find(
    (item) => item.teeth.length === cassette.length && item.teeth.every((teeth, index) => teeth === cassette[index]),
  );
  return preset ? preset.key : null;
}

/** 문자열에서 앞 체인링 한 칸을 읽는다. 빈 칸은 "없음"이고 깨진 값은 fallback. */
export function model_read_chainring_slot(raw, fallback) {
  if (typeof raw === 'string' && raw.trim() === '') return GEAR_CHAINRING_NONE;
  const value = num_read_decimal(raw, fallback);
  return Number.isInteger(value) ? value : fallback;
}
