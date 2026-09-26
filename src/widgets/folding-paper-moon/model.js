/**
 * 종이접기 — 두께가 두 배씩 늘어날 때
 *
 * 순수 계산 함수만. DOM 접근 금지.
 * 모델 등급 A (산술). t = t₀ · 2ⁿ 하나가 전부다.
 *
 * 이 도구의 논점은 값이 아니라 **축**이다. 같은 수열이 선형 축에서는
 * 30번까지 아무 일도 없다가 갑자기 벽을 넘고, 로그 축에서는 처음부터 직선이다.
 * 그래서 축 토글이 이 위젯의 본체이고, 모델은 한 줄이어도 된다.
 */

import { num_clamp_value } from '../_shared/numbers.js';

// ── 파라미터 범위 (슬라이더가 그대로 읽는다) ─────────────────
export const FOLD_THICKNESS_MIN_MM = 0.05;
export const FOLD_THICKNESS_MAX_MM = 0.5;
export const FOLD_THICKNESS_DEFAULT_MM = 0.1;
export const FOLD_THICKNESS_STEP_MM = 0.01;

export const FOLD_COUNT_MIN = 0;
/**
 * 슬라이더 상한.
 *
 * **표의 마지막 한두 행은 이 상한 밖으로 나간다.** 0.05 mm에서 태양까지 거리는
 * 52접기, 수성 궤도는 51접기가 필요하다. 상한을 52로 올리면 그 행들도 손잡이로
 * 확인할 수 있게 되지만, 그러려면 자의 오른쪽 끝(`RAIL_HIGH_M`)도 10¹³으로
 * 같이 올려야 한다 — 0.5 mm × 2⁵²는 2.25×10¹² m라 지금 자 밖이고, 마커가
 * 조용히 사라진다. 그 짝을 지키는 단언이 `_shared/logscale.test.js`에 있다.
 * 상한을 올릴 때는 두 파일을 같이 고쳐야 한다.
 *
 * 지금은 상한 밖이라는 사실을 **표의 답 칸에서** 읽게 한다 —
 * `display_format_crossing`이 그 문구를 만들고 캡션이 상한을 미리 말한다.
 */
export const FOLD_COUNT_MAX = 50;
export const FOLD_COUNT_DEFAULT = 42;

// ── 단위 환산 ───────────────────────────────────────────────
export const MM_PER_M = 1000;

// ── 접기 ────────────────────────────────────────────────────
export const FOLD_THICKNESS_FACTOR = 2; // 한 번 접으면 겹이 두 배
/**
 * n의 상한을 두는 이유는 화면이 아니라 산술이다.
 * t₀·2ⁿ이 Infinity가 되는 지점은 t₀에 따라 움직인다 — 반복 배가로 재면
 * 0.5 mm에서 1,035번, 0.05 mm에서 1,039번이다. 1,000은 그 아래의 보수적인 선.
 * (`Math.pow(2, n)`을 중간항으로 쓰면 t₀와 무관하게 n = 1,024에서 먼저 터진다.)
 * 슬라이더 상한 50은 여기서 한참 아래이지만, 검사는 이 상한에 걸어 둔다.
 */
export const FOLD_COUNT_SAFE_MAX = 1000;

/**
 * 기준이 되는 길이들. 두께 곡선이 이 선들을 언제 넘는지가 이 도구의 출력이다.
 *
 * `metres`는 전부 SI 미터. `note`는 그 값이 무엇의 값인지 —
 * 평균인지 최근접인지, 변하는 값인지 — 를 한 줄로 밝힌다.
 * 출처는 본문 블록 5에 링크로 적는다. 여기 적힌 문구가 화면에 그대로 나간다.
 */
// 기준 높이 아이콘. 24×24 좌표계의 SVG path.
// **직접 그린 도형만 쓴다** — 외부 아이콘 세트를 베끼면 저작권 위험 0 원칙이 깨진다.
// `fill`은 면, `stroke`는 선(없을 수 있다). 자(캔버스)와 표(인라인 SVG)가
// **같은 문자열**을 쓴다 — 그래야 표가 자의 범례가 된다.
//
// 주의: 면과 선이 같은 색이고 선이 면 위에 그려진다. **면 안쪽을 지나는 선은
// 보이지 않는다.** 분할선을 쓰지 말고 면 바깥의 선만 쓴다.
const ICON = {
  // 각진 파편 + 떨어진 알갱이 둘. 밑변이 없고 비대칭이라 산과 안 겹친다.
  sand: {
    fill: 'M7.4 6.6L14.6 4.2L19.4 9.0L16.2 15.2L9.0 14.8L5.6 10.4Z M5.8 17.8L9.4 17.0L10.2 20.6L6.6 21.4Z M14.0 18.2L17.6 19.0L16.8 22.2L13.6 21.2Z',
  },
  // 모서리를 접은 카드. 유일하게 기울어져 있다.
  card: {
    fill: 'M8.2 3.5L14.5 4.9L18.0 10.2L15.8 20.5L5.1 18.2Z',
    stroke: 'M14.5 4.9L15.4 9.8L18.0 10.2',
  },
  // 양끝이 뾰족한 렌즈. 곡선 둘짜리 단일 대칭체 — 모래와 갈린다.
  rice: {
    fill: 'M5.2 18.8Q7.0 7.0 18.8 5.2Q17.0 17.0 5.2 18.8Z',
  },
  // 옴폭 팬 공 + 받침. 실루엣이 원 밖으로 아래로 자란다 — 달·지구와 갈린다.
  golf: {
    fill: 'M18.2 9.4Q15.8 7.8 16.4 5.0Q13.6 5.6 12.0 3.2Q10.4 5.6 7.6 5.0Q8.2 7.8 5.8 9.4Q8.2 11.0 7.6 13.8Q10.4 13.2 12.0 15.6Q13.6 13.2 16.4 13.8Q15.8 11.0 18.2 9.4Z M8.6 15.4L15.4 15.4L15.4 17.4L13.0 17.4L13.0 22.4L11.0 22.4L11.0 17.4L8.6 17.4Z',
  },
  // 똑바른 낱장, 아래 가장자리만 물결. 비율은 A4의 √2.
  a4: {
    fill: 'M5.7 2.4L18.3 2.4L18.3 18.6Q15.2 21.8 12.0 19.6Q8.8 17.4 5.7 20.6Z',
  },
  // 떨어진 머리 + 어깨·다리.
  human: {
    fill: 'M9.1 4.5A2.9 2.9 0 1 1 14.9 4.5A2.9 2.9 0 1 1 9.1 4.5Z M8.6 8.4L15.4 8.4L16.9 9.8L16.0 15.8L14.8 15.6L14.8 22.4L12.6 22.4L12.0 17.2L11.4 22.4L9.2 22.4L9.2 15.6L8.0 15.8L7.1 9.8Z',
  },
  // 계단형 탑 + 바닥 출입구. 바닥선에 앉는 세로 덩어리.
  storey: {
    fill: 'M8.5 4.0L15.5 4.0L15.5 12.0L18.5 12.0L18.5 22.5L13.2 22.5L13.2 18.6L10.8 18.6L10.8 22.5L5.5 22.5L5.5 12.0L8.5 12.0Z',
  },
  // 스타디움형 잔디(면) + 그 바깥 트랙(선). 수평 직선 구간이 수성 타원과 갈린다.
  track: {
    fill: 'M8.8 8.4L15.2 8.4A3.6 3.6 0 0 1 15.2 15.6L8.8 15.6A3.6 3.6 0 0 1 8.8 8.4Z',
    stroke: 'M8.8 5.2L15.2 5.2A6.8 6.8 0 0 1 15.2 18.8L8.8 18.8A6.8 6.8 0 0 1 8.8 5.2Z',
  },
  // 주봉 + 부봉. 사선만 쓴다.
  everest: {
    fill: 'M1.6 21.5L11.0 3.2L15.2 11.4L17.6 8.2L22.4 21.5Z',
  },
  // 위에서 본 후퇴익 기체. 세로 1축 대칭에 코가 뾰족하다.
  airliner: {
    fill: 'M12 1.8L13.4 8.6L21.6 15.2L20.8 17.0L13.4 12.6L13.4 18.0L17.4 20.6L16.8 22.2L13.4 20.8L12.9 22.4L11.1 22.4L10.6 20.8L7.2 22.2L6.6 20.6L10.6 18.0L10.6 12.6L3.2 17.0L2.4 15.2L10.6 8.6Z',
  },
  // 누운 지평선 + 그 위에 뜬 경계선.
  karman: {
    fill: 'M1.5 21.0Q12 8 22.5 21.0L22.5 22.6L1.5 22.6Z',
    stroke: 'M2.4 16.5Q12 4.0 21.6 16.5',
  },
  // 트러스 + 좌우 태양전지판. 가로·세로 2축 대칭에 직각만.
  iss: {
    fill: 'M2.2 6.6L7.6 5.4L7.6 17.4L2.2 18.6Z M16.4 5.4L21.8 6.6L21.8 18.6L16.4 17.4Z M7.6 11.0L16.4 11.0L16.4 13.0L7.6 13.0Z M10.2 8.4L13.8 8.4L13.8 15.6L10.2 15.6Z',
  },
  // 원반에서 중심까지 쐐기를 도려냈다. 도형 자체가 "지표에서 중심으로"를 말한다.
  earth: {
    fill: 'M12.0 12.0L15.5 3.3A9.4 9.4 0 1 1 8.5 3.3Z',
  },
  // 큰 지구 + 위아래가 끊긴 원 궤도 + 네모 위성(인공물). 위성이 한 점에 고정돼 있다.
  geo: {
    fill: 'M6.8 12.0A5.2 5.2 0 1 1 17.2 12.0A5.2 5.2 0 1 1 6.8 12.0Z M10.2 1.0L13.8 1.0L13.8 4.0L10.2 4.0Z',
    stroke: 'M16.8 20.2A9.5 9.5 0 0 0 16.8 3.8 M7.2 3.8A9.5 9.5 0 0 0 7.2 20.2',
  },
  // 초승달. 오목한 윤곽이라 원 계열과 안 겹친다.
  moon: {
    fill: 'M11.5 2.5A9.5 9.5 0 1 0 19.6 17.7A8.6 8.6 0 1 1 11.5 2.5Z',
  },
  // 원반을 좌우 캘리퍼 턱이 물고 있다 — 재는 그림이지 빛나는 그림이 아니다.
  sundisc: {
    fill: 'M4.8 12.0A7.2 7.2 0 1 1 19.2 12.0A7.2 7.2 0 1 1 4.8 12.0Z M0.8 4.4L2.8 4.4L2.8 19.6L0.8 19.6Z M21.2 4.4L23.2 4.4L23.2 19.6L21.2 19.6Z',
  },
  // 작은 태양(점) + 기운 닫힌 타원 + 둥근 행성. 정지궤도와 정반대 원리로 그렸다.
  mercury: {
    fill: 'M9.5 12.0A2.5 2.5 0 1 1 14.5 12.0A2.5 2.5 0 1 1 9.5 12.0Z M1.4 17.0A1.9 1.9 0 1 1 5.2 17.0A1.9 1.9 0 1 1 1.4 17.0Z',
    stroke: 'M3.3 17.0A10.0 5.4 -30 1 1 20.7 7.0A10.0 5.4 -30 1 1 3.3 17.0',
  },
  // 원반 + 8방향 광선. 거리를 뜻한다 (sundisc는 크기).
  sun: {
    fill: 'M6.6 12A5.4 5.4 0 1 1 17.4 12A5.4 5.4 0 1 1 6.6 12Z',
    stroke: 'M19.4 12L22.8 12 M17.2 17.2L19.6 19.6 M12 19.4L12 22.8 M6.8 17.2L4.4 19.6 M4.6 12L1.2 12 M6.8 6.8L4.4 4.4 M12 4.6L12 1.2 M17.2 6.8L19.6 4.4',
  },
};

/**
 * 기준이 되는 길이들. **오름차순이어야 한다** — `model_read_last_passed`가
 * 첫 미달에서 멈추므로, 순서가 깨지면 조용히 틀린 답을 낸다 (테스트로 고정).
 *
 * 데케이드마다 하나씩 두는 것이 목적이다. 비어 있으면 배지가 뚝뚝 끊긴다.
 * `note`는 그 값이 정의값인지 평균인지 대표값인지를 밝힌다 — 단일 정확값인 척하지 않는다.
 * 출처는 본문 블록 5에 적는다.
 */
export const FOLD_REFERENCE_LIST = [
  { key: 'sand', label: 'A grain of fine sand', short: 'Sand', icon: ICON.sand, metres: 6.3e-5, note: '0.063 mm, the silt/sand line in ISO 14688-1' },
  // ID-1의 0.76 mm는 **공칭값 + 공차**다. 같은 목록의 au(정의값)와 같은 말투로
  // "exactly"라고 적으면 둘이 구분되지 않는다 — 이 문자열이 화면에 그대로 나간다.
  { key: 'card', label: 'A bank card', short: 'Card', icon: ICON.card, metres: 7.6e-4, note: '0.76 mm nominal, ±0.08 mm in ISO/IEC 7810 ID-1' },
  { key: 'rice', label: 'A grain of rice', short: 'Rice', icon: ICON.rice, metres: 6e-3, note: 'a round 6 mm; varies by variety' },
  { key: 'golf', label: 'A golf ball', short: 'Golf ball', icon: ICON.golf, metres: 4.267e-2, note: '42.67 mm, the minimum legal diameter' },
  { key: 'a4', label: 'A sheet of A4 paper', short: 'A4', icon: ICON.a4, metres: 0.297, note: '297 mm, the long edge in ISO 216' },
  { key: 'human', label: 'An adult standing', short: 'Person', icon: ICON.human, metres: 1.7, note: 'a round 1.7 m' },
  { key: 'storey', label: 'A 10-storey building', short: 'Building', icon: ICON.storey, metres: 30, note: '3 m per storey' },
  { key: 'track', label: 'One lap of a running track', short: 'Track', icon: ICON.track, metres: 400, note: '400 m by rule' },
  { key: 'everest', label: 'Mount Everest', short: 'Everest', icon: ICON.everest, metres: 8848.86, note: 'snow height, 2020 Nepal-China survey' },
  { key: 'airliner', label: 'Airliner cruise altitude', short: 'Airliner', icon: ICON.airliner, metres: 11000, note: 'a typical 11 km, barely above Everest' },
  { key: 'karman', label: 'The Karman line', short: 'Karman', icon: ICON.karman, metres: 100000, note: '100 km by convention' },
  { key: 'iss', label: 'The space station', short: 'Station', icon: ICON.iss, metres: 400000, note: 'about 400 km; the orbit decays and is re-boosted' },
  { key: 'earth', label: 'Down to the centre of the Earth', short: 'Earth', icon: ICON.earth, metres: 6.371e6, note: '6,371 km mean radius; the Earth is not a sphere' },
  { key: 'geo', label: 'Geostationary orbit', short: 'Geo orbit', icon: ICON.geo, metres: 3.5786e7, note: '35,786 km up, where broadcast satellites sit' },
  { key: 'moon', label: 'The Moon', short: 'Moon', icon: ICON.moon, metres: 384400000, note: 'orbital semi-major axis, not a mean distance' },
  { key: 'sundisc', label: 'The Sun, edge to edge', short: 'Sun width', icon: ICON.sundisc, metres: 1.3914e9, note: '1.39 million km across, twice the IAU nominal radius' },
  { key: 'mercury', label: "Mercury's orbit", short: 'Mercury', icon: ICON.mercury, metres: 5.7909e10, note: 'semi-major axis, not a fixed distance' },
  { key: 'sun', label: 'The distance to the Sun', short: 'Sun', icon: ICON.sun, metres: 149597870700, note: 'one astronomical unit, a defined exact value' },
];

/**
 * 두께 metres가 **방금 지나친** 기준점. 아직 아무것도 못 넘었으면 null.
 *
 * 자의 채워진 점, 히어로 배지, 교차표의 통과 표시가 **전부 이 함수를 부른다.**
 * 판정을 두 벌로 두면 언젠가 갈라져서, 자에는 달이 채워져 있는데
 * 배지는 우주정거장을 들고 있는 화면이 나온다.
 *
 * 경계는 "넘어섰다"로 읽는다 — 정확히 같은 값은 아직 넘은 것이 아니다.
 * `model_calculate_folds_to_reach`의 경계 규칙과 같다.
 */
export function model_check_passed(metres, item) {
  return Number.isFinite(metres) && metres > item.metres;
}

export function model_read_last_passed(metres) {
  let passed = null;
  for (const item of FOLD_REFERENCE_LIST) {
    if (model_check_passed(metres, item)) passed = item;
    else break;
  }
  return passed;
}

/** 아직 못 넘은 것 중 가장 가까운 기준점. 전부 넘었으면 null. */
export function model_read_next_target(metres) {
  if (!Number.isFinite(metres)) return FOLD_REFERENCE_LIST[0];
  return FOLD_REFERENCE_LIST.find((item) => !model_check_passed(metres, item)) ?? null;
}

/** 위 목록에서 key로 하나. */
export function model_read_reference(key) {
  return FOLD_REFERENCE_LIST.find((item) => item.key === key) ?? null;
}

// ── 클램프 ──────────────────────────────────────────────────

export function model_clamp_thickness_mm(value) {
  const clamped = num_clamp_value(value, FOLD_THICKNESS_MIN_MM, FOLD_THICKNESS_MAX_MM);
  // 슬라이더 눈금에 맞춰 스냅한다. 안 하면 URL로 들어온 0.10001이 눈금과 어긋나
  // 손잡이가 가리키는 값과 계산에 쓰인 값이 달라진다.
  const steps = Math.round(clamped / FOLD_THICKNESS_STEP_MM);
  return Number((steps * FOLD_THICKNESS_STEP_MM).toFixed(2));
}

export function model_clamp_fold_count(value) {
  return Math.round(num_clamp_value(value, FOLD_COUNT_MIN, FOLD_COUNT_MAX));
}

/**
 * 파라미터가 유효범위 안인지 확인한다.
 * 범위 밖에서 조용히 그럴듯한 숫자를 뱉지 않는 것이 목적이다.
 */
export function model_check_parameters(thicknessMm, foldCount) {
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    return { ok: false, message: '초기 두께는 0보다 큰 유한한 값이어야 한다.' };
  }
  if (thicknessMm < FOLD_THICKNESS_MIN_MM || thicknessMm > FOLD_THICKNESS_MAX_MM) {
    return {
      ok: false,
      message: `초기 두께는 ${FOLD_THICKNESS_MIN_MM}~${FOLD_THICKNESS_MAX_MM} mm여야 한다.`,
    };
  }
  if (!Number.isInteger(foldCount) || foldCount < FOLD_COUNT_MIN || foldCount > FOLD_COUNT_SAFE_MAX) {
    return {
      ok: false,
      message: `접는 횟수는 ${FOLD_COUNT_MIN}~${FOLD_COUNT_SAFE_MAX}의 정수여야 한다.`,
    };
  }
  return { ok: true, message: '' };
}

// ── 모델 ────────────────────────────────────────────────────

/**
 * n번 접은 뒤의 두께 (m). t = t₀ · 2ⁿ
 *
 * `Math.pow(2, n)`은 2의 거듭제곱이라 지수부만 바뀐다. 가수부가 손상되지 않으므로
 * n이 1023을 넘지 않는 한 이 곱셈은 반올림 오차가 없다.
 */
export function model_calculate_thickness_m(thicknessMm, foldCount) {
  const check = model_check_parameters(thicknessMm, foldCount);
  if (!check.ok) throw new Error(check.message);
  return (thicknessMm / MM_PER_M) * Math.pow(FOLD_THICKNESS_FACTOR, foldCount);
}

/** n번 접은 뒤의 겹 수. 2ⁿ. */
export function model_calculate_layer_count(foldCount) {
  return Math.pow(FOLD_THICKNESS_FACTOR, foldCount);
}

/**
 * 두께가 targetMetres를 **처음 넘어서는** 접기 횟수.
 * n = ceil(log₂(target / t₀)). 정확히 같아지는 n이 있으면 그 다음 번이다 —
 * "넘어선다"고 물었으므로 같음은 넘어선 것이 아니다.
 * 유효범위 밖이면 null. 무한대나 NaN을 돌려주지 않는다.
 */
export function model_calculate_folds_to_reach(thicknessMm, targetMetres) {
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return null;
  if (!Number.isFinite(targetMetres) || targetMetres <= 0) return null;

  const startMetres = thicknessMm / MM_PER_M;
  const ratio = targetMetres / startMetres;
  if (!(ratio > 0) || !Number.isFinite(ratio)) return null;

  // log₂로 후보를 잡되 **그 값을 믿지 않는다.** 로그 공간에서 엡실론으로 흡수하면
  // 목표가 t₀·2ᵏ보다 아주 조금 작을 때 k 대신 k+1을 돌려준다 (한쪽으로만 옳다).
  // 후보 주변에서 실제 두께를 만들어 비교하면 그 경계가 사라진다.
  const guess = Math.round(Math.log2(ratio));
  let folds = Math.max(FOLD_COUNT_MIN, guess - 2);
  while (startMetres * Math.pow(FOLD_THICKNESS_FACTOR, folds) <= targetMetres) folds += 1;
  while (folds > FOLD_COUNT_MIN
    && startMetres * Math.pow(FOLD_THICKNESS_FACTOR, folds - 1) > targetMetres) folds -= 1;
  return folds;
}

/**
 * 접기 횟수 0..foldCount의 두께 계열. 곡선과 표가 같이 쓴다.
 * **계산 경로를 하나만 둔다** — 요약값용 루프를 따로 만들면 시간이 지나며 갈라진다.
 */
export function model_build_series(thicknessMm, foldCount) {
  const check = model_check_parameters(thicknessMm, foldCount);
  if (!check.ok) throw new Error(check.message);

  const points = [];
  for (let fold = FOLD_COUNT_MIN; fold <= foldCount; fold += 1) {
    points.push({
      fold,
      layerCount: model_calculate_layer_count(fold),
      thicknessM: model_calculate_thickness_m(thicknessMm, fold),
    });
  }
  return points;
}

/**
 * 각 기준 길이를 처음 넘어서는 접기 횟수를 붙인 표.
 * `foldCount`가 null이면 슬라이더 상한 안에서는 닿지 않는다는 뜻이다.
 */
export function model_build_crossings(thicknessMm, foldMax = FOLD_COUNT_MAX) {
  return FOLD_REFERENCE_LIST.map((item) => {
    const folds = model_calculate_folds_to_reach(thicknessMm, item.metres);
    return {
      ...item,
      folds,
      reachable: folds !== null && folds <= foldMax,
    };
  });
}

// ── 접기에 필요한 길이 (Gallivan 2002) ────────────
// **두께와 같은 변수 t₀, n을 그대로 받아 쓴다** — 서로 무관한 값이 아니다.
// 아래 L식의 t는 위 두께식의 t₀와 같은 시작 두께이고, 2ⁿ(층 수)도 두께식이
// 접는 횟수로 겹을 세는 것과 같은 2ⁿ이다(model_calculate_layer_count가 그 항이다).
// **다른 것은 무엇을 구하느냐다**: 위 식은 n번 접은 뒤의 두께, 이 식은 n번
// 접는 데 필요한 최소 길이. 어느 쪽도 다른 쪽의 출력을 입력으로 쓰지 않는다 —
// 섞이는 것은 변수뿐이고, 계산 경로는 갈라져 있다.
const FOLD_LENGTH_DIVISOR = 6;
const FOLD_LENGTH_OFFSET = 4;

/**
 * 한 방향으로 n번 접으려면 필요한 최소 길이 (m).
 *
 *   L = (π t / 6) (2ⁿ + 4)(2ⁿ − 1)
 *
 * Gallivan(2002)의 단일 방향 식. t와 L은 같은 단위여야 한다.
 * 교대 방향(가로·세로 번갈아 접기) 식은 이것과 다르며, 원문을 구하지
 * 못해 여기 넣지 않았다 — 전언으로 떠돌아다니는 식을 코드로 고정하지 않는다.
 */
export function model_calculate_length_required_m(thicknessMm, foldCount) {
  const check = model_check_parameters(thicknessMm, foldCount);
  if (!check.ok) throw new Error(check.message);
  const layers = model_calculate_layer_count(foldCount);
  const thicknessM = thicknessMm / MM_PER_M;
  return ((Math.PI * thicknessM) / FOLD_LENGTH_DIVISOR) * (layers + FOLD_LENGTH_OFFSET) * (layers - 1);
}

/**
 * 길이 lengthMetres의 띄로 한 방향으로 접을 수 있는 최대 횟수.
 * 닫힌 형태를 뒤집지 않고 하나씩 세어 찾는다 — 수십 번 규모라 비용이 없고,
 * 경계에서 off-by-one을 낼 여지도 없다.
 */
export function model_calculate_max_folds_for_length(thicknessMm, lengthMetres) {
  if (!Number.isFinite(lengthMetres) || lengthMetres <= 0) return null;
  // 슬라이더 상한(50)까지만 세면 긴 재료에서 **조용히 50을 돌려준다** —
  // 화면의 값과 모델의 답이 갈라지는 자리다. 검사 상한까지 센다.
  let best = 0;
  for (let fold = 1; fold <= FOLD_COUNT_SAFE_MAX; fold += 1) {
    const needed = model_calculate_length_required_m(thicknessMm, fold);
    if (!Number.isFinite(needed) || needed > lengthMetres) break;
    best = fold;
  }
  return best;
}
