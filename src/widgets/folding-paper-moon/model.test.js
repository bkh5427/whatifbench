/**
 * 종이접기 모델 테스트.
 *
 * 이 모델은 한 줄이라 "테스트할 게 없다"고 넘어가기 쉬운 자리다.
 * 실제로 틀릴 수 있는 것은 식이 아니라 **경계**다 — 넘어서는 n을 세는 방향,
 * 2의 거듭제곱에 정확히 걸릴 때, 단위 환산, 유효범위 밖 입력.
 *
 * 독립 경로: 닫힌 형태 `t₀·2ⁿ` 대신 **한 번씩 두 배로 늘리는 루프**로 같은 값을
 * 만들어 대조한다. 유도를 쓰지 않으므로 지수 계산이 틀리면 갈라진다.
 */

import { describe, it, expect } from 'vitest';
import {
  FOLD_THICKNESS_MIN_MM,
  FOLD_THICKNESS_MAX_MM,
  FOLD_THICKNESS_DEFAULT_MM,
  FOLD_COUNT_MIN,
  FOLD_COUNT_MAX,
  FOLD_COUNT_DEFAULT,
  FOLD_REFERENCE_LIST,
  MM_PER_M,
  model_read_reference,
  model_read_last_passed,
  model_read_next_target,
  model_clamp_thickness_mm,
  model_clamp_fold_count,
  model_check_parameters,
  model_calculate_thickness_m,
  model_calculate_layer_count,
  model_calculate_folds_to_reach,
  model_build_series,
  model_build_crossings,
  model_calculate_length_required_m,
  model_calculate_max_folds_for_length,
} from './model.js';

/** 독립 경로 ①: 닫힌 형태를 쓰지 않고 한 번에 두 배씩 늘린다. */
function reference_double_repeatedly(thicknessMm, foldCount) {
  let metres = thicknessMm / MM_PER_M;
  for (let i = 0; i < foldCount; i += 1) metres *= 2;
  return metres;
}

/** 독립 경로 ②: log₂를 쓰지 않고 하나씩 세어 목표를 넘는 n을 찾는다. */
function reference_count_until_past(thicknessMm, targetMetres, limit = 200) {
  let metres = thicknessMm / MM_PER_M;
  for (let fold = 0; fold <= limit; fold += 1) {
    if (metres > targetMetres) return fold;
    metres *= 2;
  }
  return null;
}

const MOON = model_read_reference('moon');

describe('검수 포인트 — t₀ = 0.1 mm, n = 42', () => {
  it('두께가 약 4.4 × 10⁸ m이다', () => {
    const metres = model_calculate_thickness_m(0.1, 42);
    expect(metres).toBeCloseTo(4.398046511104e8, 0);
    // 유효숫자 4자리까지 못박는다. "10⁸ 규모"만 보면 2배 틀려도 통과한다.
    expect(metres.toPrecision(4)).toBe('4.398e+8');
  });

  it('그 두께가 달까지 거리를 넘어선다', () => {
    const metres = model_calculate_thickness_m(0.1, 42);
    expect(metres).toBeGreaterThan(MOON.metres);
    // 한 번 덜 접으면 못 넘는다 — 42가 '처음 넘는' 지점이라는 뜻
    expect(model_calculate_thickness_m(0.1, 41)).toBeLessThan(MOON.metres);
    expect(metres / MOON.metres).toBeCloseTo(1.144, 3);
  });

  it('기본값이 그 조합이다 — 로드하자마자 이 그림이 나온다', () => {
    expect(FOLD_THICKNESS_DEFAULT_MM).toBe(0.1);
    expect(FOLD_COUNT_DEFAULT).toBe(42);
  });
});

describe('닫힌 형태 대조 — 두 배씩 늘리는 루프와 일치한다', () => {
  it('전 구간에서 두 경로가 같은 값을 낸다', () => {
    for (const thicknessMm of [0.05, 0.08, 0.1, 0.25, 0.5]) {
      for (let fold = FOLD_COUNT_MIN; fold <= FOLD_COUNT_MAX; fold += 1) {
        const closed = model_calculate_thickness_m(thicknessMm, fold);
        const looped = reference_double_repeatedly(thicknessMm, fold);
        // 2의 거듭제곱 곱셈은 지수부만 바꾸므로 두 경로가 비트까지 같아야 한다.
        expect(closed).toBe(looped);
      }
    }
  });

  it('한 번 더 접으면 정확히 두 배다 — 반올림 오차가 쌓이지 않는다', () => {
    for (let fold = FOLD_COUNT_MIN; fold < FOLD_COUNT_MAX; fold += 1) {
      const before = model_calculate_thickness_m(0.07, fold);
      const after = model_calculate_thickness_m(0.07, fold + 1);
      expect(after).toBe(before * 2);
    }
  });

  it('겹 수가 2ⁿ이고 정수로 정확하다', () => {
    for (let fold = 0; fold <= FOLD_COUNT_MAX; fold += 1) {
      const layers = model_calculate_layer_count(fold);
      expect(Number.isInteger(layers)).toBe(true);
      // BigInt로 따로 계산한 값과 대조한다 (2^50은 double 정수 한계 안이다).
      expect(BigInt(layers)).toBe(2n ** BigInt(fold));
    }
  });

  it('n = 0이면 접지 않은 두께 그대로다', () => {
    expect(model_calculate_thickness_m(0.1, 0)).toBeCloseTo(0.0001, 15);
  });
});

describe('기준 길이를 넘어서는 접기 횟수', () => {
  it('log₂ 경로와 하나씩 세는 경로가 일치한다', () => {
    for (const thicknessMm of [0.05, 0.1, 0.13, 0.25, 0.5]) {
      for (const item of FOLD_REFERENCE_LIST) {
        expect(model_calculate_folds_to_reach(thicknessMm, item.metres)).toBe(
          reference_count_until_past(thicknessMm, item.metres),
        );
      }
    }
  });

  it('t₀ = 0.1 mm에서 달은 42번째다', () => {
    expect(model_calculate_folds_to_reach(0.1, MOON.metres)).toBe(42);
  });

  it('t₀를 10배로 벌려도 달까지의 횟수는 40~43에 머문다', () => {
    // 두께를 10배로 바꾸는 것은 접기 약 3.3번어치다. 이 도구의 논점 중 하나.
    expect(model_calculate_folds_to_reach(FOLD_THICKNESS_MIN_MM, MOON.metres)).toBe(43);
    expect(model_calculate_folds_to_reach(FOLD_THICKNESS_MAX_MM, MOON.metres)).toBe(40);
  });

  it('본문이 인용하는 기준선들의 횟수 (t₀ = 0.1 mm)', () => {
    const at = (key) => model_calculate_folds_to_reach(0.1, model_read_reference(key).metres);
    expect(at('human')).toBe(15);
    expect(at('everest')).toBe(27);
    expect(at('karman')).toBe(30);
    expect(at('iss')).toBe(32);
    expect(at('moon')).toBe(42);
  });

  it('목표가 정확히 t₀·2ᵏ이면 k가 아니라 k+1이다 — "넘어선다"고 물었다', () => {
    const target = 0.1e-3 * Math.pow(2, 20);
    expect(model_calculate_folds_to_reach(0.1, target)).toBe(21);
    expect(model_calculate_thickness_m(0.1, 20)).toBe(target); // 같음은 넘어선 것이 아니다
    expect(model_calculate_thickness_m(0.1, 21)).toBeGreaterThan(target);
  });

  it('이미 목표보다 두꺼우면 0이다', () => {
    expect(model_calculate_folds_to_reach(0.5, 0.0001)).toBe(0);
  });

  it('유효하지 않은 입력에서 Infinity나 NaN을 돌려주지 않는다', () => {
    expect(model_calculate_folds_to_reach(0, 100)).toBe(null);
    expect(model_calculate_folds_to_reach(-1, 100)).toBe(null);
    expect(model_calculate_folds_to_reach(0.1, 0)).toBe(null);
    expect(model_calculate_folds_to_reach(0.1, -5)).toBe(null);
    expect(model_calculate_folds_to_reach(NaN, 100)).toBe(null);
    expect(model_calculate_folds_to_reach(0.1, Infinity)).toBe(null);
  });
});

describe('기준 길이 목록', () => {
  it('전부 양수이고 오름차순이다 — 표가 뒤죽박죽으로 나가지 않는다', () => {
    for (let i = 0; i < FOLD_REFERENCE_LIST.length; i += 1) {
      expect(FOLD_REFERENCE_LIST[i].metres).toBeGreaterThan(0);
      if (i > 0) {
        expect(FOLD_REFERENCE_LIST[i].metres).toBeGreaterThan(FOLD_REFERENCE_LIST[i - 1].metres);
      }
    }
  });

  it('key가 중복되지 않고 라벨·주석이 비어 있지 않다', () => {
    const keys = FOLD_REFERENCE_LIST.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of FOLD_REFERENCE_LIST) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.note.length).toBeGreaterThan(0);
      // 자에 쓰는 짧은 이름. 길면 라벨이 서로 밀어내 서너 개밖에 안 남는다.
      expect(item.short.length).toBeGreaterThan(0);
      expect(item.short.length).toBeLessThanOrEqual(10);
    }
    // 짧은 이름도 서로 달라야 한다 — 자에 같은 글자가 두 번 뜨면 못 읽는다
    const shorts = FOLD_REFERENCE_LIST.map((item) => item.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it('없는 key는 null이다', () => {
    expect(model_read_reference('atlantis')).toBe(null);
  });

  it('공차가 붙은 공칭값을 정의값처럼 적지 않는다', () => {
    // ISO/IEC 7810 ID-1의 두께 0.76 mm는 **공칭값 + 공차(±0.08 mm)**다.
    // 같은 목록의 au는 진짜 정의값이라, 둘을 같은 말투("exactly")로 적으면
    // 화면에서 구분이 사라진다. 이 문자열은 표의 Note 칸에 그대로 나간다.
    const card = model_read_reference('card');
    expect(card.note).toContain('±0.08');
    expect(card.note).toContain('nominal');
    expect(card.note).not.toMatch(/exact/i);

    // 대조군 — 정의값 쪽은 정의값이라고 적혀 있어야 한다. 둘 다 "nominal"로
    // 바꾸면 구분이 반대쪽에서 사라지므로 양쪽을 같이 눌러 둔다.
    expect(model_read_reference('sun').note).toMatch(/defined exact/i);
  });

  it('교차표가 슬라이더 상한 밖을 정직하게 표시한다', () => {
    const rows = model_build_crossings(0.1, FOLD_COUNT_MAX);
    const sun = rows.find((row) => row.key === 'sun');
    // 0.1 mm에서 태양까지는 51번이 필요하고 슬라이더는 50까지다.
    expect(sun.folds).toBe(51);
    expect(sun.reachable).toBe(false);
    const moon = rows.find((row) => row.key === 'moon');
    expect(moon.reachable).toBe(true);
    // 두꺼운 종이로 바꾸면 태양이 슬라이더 안으로 들어온다
    expect(model_build_crossings(0.5, FOLD_COUNT_MAX).find((r) => r.key === 'sun').reachable).toBe(true);
  });
});

describe('계열 만들기', () => {
  it('0부터 n까지 빠짐없이, 곡선과 표가 같은 배열을 쓴다', () => {
    const points = model_build_series(0.1, 42);
    expect(points).toHaveLength(43);
    expect(points[0].fold).toBe(0);
    expect(points[42].fold).toBe(42);
    expect(points[42].thicknessM).toBe(model_calculate_thickness_m(0.1, 42));
  });

  it('계열의 모든 점이 단독 계산과 일치한다 — 계산 경로가 갈라지지 않았다', () => {
    for (const point of model_build_series(0.13, FOLD_COUNT_MAX)) {
      expect(point.thicknessM).toBe(model_calculate_thickness_m(0.13, point.fold));
      expect(point.layerCount).toBe(model_calculate_layer_count(point.fold));
    }
  });

  it('두께가 정확히 2배씩 늘어난다 — "단조 증가"만 걸면 3ⁿ으로 바꿔도 통과한다', () => {
    const points = model_build_series(FOLD_THICKNESS_MIN_MM, FOLD_COUNT_MAX);
    const first = points[0].thicknessM;
    for (let i = 0; i < points.length; i += 1) {
      expect(Number.isFinite(points[i].thicknessM)).toBe(true);
      expect(points[i].thicknessM).toBeGreaterThan(0);
      // 배수를 BigInt 정수로 못박는다. 밑이 2가 아니면 여기서 갈라진다.
      expect(BigInt(Math.round(points[i].thicknessM / first))).toBe(2n ** BigInt(i));
    }
  });
});

describe('유효범위와 기본값', () => {
  it('유효범위 밖이면 조용히 숫자를 뱉지 않고 던진다', () => {
    expect(() => model_calculate_thickness_m(0, 10)).toThrow();
    expect(() => model_calculate_thickness_m(-0.1, 10)).toThrow();
    expect(() => model_calculate_thickness_m(5, 10)).toThrow();
    expect(() => model_calculate_thickness_m(0.1, -1)).toThrow();
    expect(() => model_calculate_thickness_m(0.1, 1.5)).toThrow();
    expect(() => model_build_series(0.1, -1)).toThrow();
  });

  it('거부 사유 문구가 비어 있지 않다', () => {
    expect(model_check_parameters(0, 10).message.length).toBeGreaterThan(0);
    expect(model_check_parameters(0.1, 2.5).message.length).toBeGreaterThan(0);
    expect(model_check_parameters(0.1, 10).message).toBe('');
  });

  it('기본값이 자기 클램프와 검사를 통과한다 — 로드 즉시 잘리면 안 된다', () => {
    expect(model_clamp_thickness_mm(FOLD_THICKNESS_DEFAULT_MM)).toBe(FOLD_THICKNESS_DEFAULT_MM);
    expect(model_clamp_fold_count(FOLD_COUNT_DEFAULT)).toBe(FOLD_COUNT_DEFAULT);
    expect(model_check_parameters(FOLD_THICKNESS_DEFAULT_MM, FOLD_COUNT_DEFAULT).ok).toBe(true);
  });

  it('클램프를 거친 값은 언제나 검사를 통과한다', () => {
    for (const raw of [-99, 0, 0.001, 0.033, 0.1, 0.499, 3, 1e9, NaN]) {
      const thicknessMm = model_clamp_thickness_mm(raw);
      for (const rawFold of [-5, 0, 7.4, 50, 999, NaN]) {
        const foldCount = model_clamp_fold_count(rawFold);
        expect(model_check_parameters(thicknessMm, foldCount).ok).toBe(true);
      }
    }
  });

  it('두께 클램프가 슬라이더 눈금으로 스냅한다 — 손잡이와 계산값이 갈라지지 않게', () => {
    expect(model_clamp_thickness_mm(0.10001)).toBe(0.1);
    expect(model_clamp_thickness_mm(0.1249)).toBe(0.12);
    expect(model_clamp_thickness_mm(0.125)).toBe(0.13);
    expect(model_clamp_thickness_mm(999)).toBe(FOLD_THICKNESS_MAX_MM);
    expect(model_clamp_thickness_mm(NaN)).toBe(FOLD_THICKNESS_MIN_MM);
  });
});

describe('접기에 필요한 길이 — 두께식과 같은 t₀·n을 받되 다른 것을 구한다', () => {
  it('12번 접으려면 1,200 m 두루마리가 필요하다 — Gallivan 2002 기록의 조건', () => {
    // t = 0.1 mm, 길이 약 1,200 m(4,000 ft)에서 최대 12번.
    expect(model_calculate_max_folds_for_length(0.1, 1200)).toBe(12);
    expect(model_calculate_length_required_m(0.1, 12)).toBeCloseTo(879, 0);
    expect(model_calculate_length_required_m(0.1, 13)).toBeGreaterThan(1200);
  });

  it('필요 길이가 접을수록 급격히 늘어난다', () => {
    expect(model_calculate_length_required_m(0.1, 7)).toBeCloseTo(0.878, 3);
    expect(model_calculate_length_required_m(0.1, 8)).toBeCloseTo(3.47, 2);
    expect(model_calculate_length_required_m(0.1, 10)).toBeCloseTo(55.1, 1);
  });

  it('n = 0이면 아무 길이도 필요 없다', () => {
    expect(model_calculate_length_required_m(0.1, 0)).toBe(0);
  });

  it('길이는 두께 모델과 독립이다 — 42번 접기의 필요 길이는 천문학적이다', () => {
    // 두께가 달에 닿는 42번에서, 필요한 길이는 은하 규모다.
    // 두 모델을 한 화면에 두면 이 대비가 본문의 논점이 된다.
    const needed = model_calculate_length_required_m(0.1, 42);
    expect(needed).toBeGreaterThan(1e20);
    expect(needed.toPrecision(3)).toBe('1.01e+21');
  });

  it('길이가 유효하지 않으면 null이다', () => {
    expect(model_calculate_max_folds_for_length(0.1, 0)).toBe(null);
    expect(model_calculate_max_folds_for_length(0.1, -3)).toBe(null);
    expect(model_calculate_max_folds_for_length(0.1, NaN)).toBe(null);
  });
});

describe('길이식이 두께식과 공유하는 항 — "공통 항이 없다"는 이전 문구는 틀렸다', () => {
  // 감사에서 확인된 결함: 본문과 모델 주석이 "두 식이 어떤 항도 공유하지 않는다"고
  // 적었지만, 길이식 L = (πt/6)(2ⁿ+4)(2ⁿ−1)의 t는 두께식 t = t₀·2ⁿ의 시작 두께
  // t₀와 같은 값이고, 2ⁿ도 두께식의 층 수와 같은 항이다. 두 식이 다른 것은
  // t·n을 어떻게 쓰느냐이지, 변수 자체가 아니다.
  it('L은 t에 대해 1차식이다 — t를 두 배로 올리면 L도 정확히 두 배다 (공식 구조에서 나오는 닫힌 형태 예측)', () => {
    // L = (π t / 6)(2ⁿ+4)(2ⁿ−1)에서 n을 고정하면 t의 계수만 남는다.
    // 이 비례는 제품 함수를 두 번 부른 결과가 아니라 공식 자체의 구조에서 나온다 —
    // t가 진짜 공유되는 항이 아니라면 이 비례가 깨져야 한다.
    for (const fold of [1, 7, 20, 42]) {
      const base = model_calculate_length_required_m(0.1, fold);
      const doubled = model_calculate_length_required_m(0.2, fold);
      expect(doubled).toBeCloseTo(base * 2, 6);
    }
  });

  it('L식 안의 층 수 2ⁿ은 두께식이 쓰는 층 수와 같은 값이다', () => {
    // 손으로 적은 2ⁿ(대조 경로)이 두께식의 층 수 함수와 일치하는지 먼저 본다.
    const HAND_LAYER_COUNTS = { 0: 1, 5: 32, 12: 4096, 30: 1073741824 };
    for (const [fold, layers] of Object.entries(HAND_LAYER_COUNTS)) {
      expect(model_calculate_layer_count(Number(fold))).toBe(layers);
    }
  });
});


describe('전수검사에서 나온 결함들 — 각각 실제 뮤테이션 하나를 잡는다', () => {
  it('목표가 2의 거듭제곱보다 아주 조금 작아도 세는 방향이 맞다', () => {
    // 로그 공간에서 엡실론으로 흡수하면 여기서 k 대신 k+1이 나온다.
    const exact = 0.1e-3 * Math.pow(2, 20);
    expect(model_calculate_folds_to_reach(0.1, exact * (1 - 1e-10))).toBe(20);
    expect(model_calculate_folds_to_reach(0.1, exact)).toBe(21);
    expect(model_calculate_folds_to_reach(0.1, exact * (1 + 1e-10))).toBe(21);
    // 하나씩 세는 독립 경로와도 일치해야 한다
    for (const factor of [1 - 1e-10, 1, 1 + 1e-10, 0.5, 1.5]) {
      const target = exact * factor;
      let metres = 0.1 / 1000;
      let fold = 0;
      while (!(metres > target)) { metres *= 2; fold += 1; }
      expect(model_calculate_folds_to_reach(0.1, target)).toBe(fold);
    }
  });

  it('슬라이더가 정확히 닿는 경계를 "닿지 않음"으로 표시하지 않는다', () => {
    // t₀ = 0.14~0.26 mm에서 태양은 정확히 50번이고 슬라이더 상한도 50이다.
    // `folds <= foldMax`를 `<`로 바꾸면 이 13칸이 전부 거짓으로 표시된다.
    for (const thicknessMm of [0.14, 0.2, 0.26]) {
      const sun = model_build_crossings(thicknessMm, FOLD_COUNT_MAX).find((r) => r.key === 'sun');
      expect(sun.folds).toBe(FOLD_COUNT_MAX);
      expect(sun.reachable).toBe(true);
    }
    // 한 칸 얇아지면 51번이 되어 닿지 않는다 — 경계가 양쪽에서 눌린다
    const justOver = model_build_crossings(0.13, FOLD_COUNT_MAX).find((r) => r.key === 'sun');
    expect(justOver.folds).toBe(FOLD_COUNT_MAX + 1);
    expect(justOver.reachable).toBe(false);
  });

  it('긴 재료에서 접기 횟수가 슬라이더 상한에 조용히 잘리지 않는다', () => {
    // 루프 상한이 FOLD_COUNT_MAX면 아무리 긴 재료를 넣어도 50이 나온다.
    const many = model_calculate_max_folds_for_length(0.1, 1e30);
    expect(many).toBe(56); // 값을 못박는다 — 51도 60도 아니다
    expect(many).toBeGreaterThan(FOLD_COUNT_MAX);
    // `length(0.1, many) <= 1e30`은 many를 만든 루프의 조건 그 자체라 정의상 참이다.
    // 값을 직접 확인한다: 56번은 들어가고 57번은 넘친다.
    expect(model_calculate_length_required_m(0.1, 56).toPrecision(4)).toBe('2.719e+29');
    expect(model_calculate_length_required_m(0.1, 57)).toBeGreaterThan(1e30);
  });
});

describe('기준 높이 아이콘', () => {
  it('9개 전부에 면 path가 있고 서로 다르다', () => {
    const faces = FOLD_REFERENCE_LIST.map((item) => item.icon.fill);
    expect(faces.every((d) => typeof d === 'string' && d.length > 0)).toBe(true);
    expect(new Set(faces).size).toBe(faces.length);
  });

  /**
   * path에서 **좌표만** 뽑는다. 호(`A rx ry 회전각 큰호 방향 x y`)의 회전각과
   * 플래그는 좌표가 아니라 음수일 수 있다 — 그걸 좌표로 세면 멀쩡한 도형이 걸린다.
   */
  function icon_read_points(pathData) {
    const points = [];
    const tokens = pathData.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
    let command = 'M';
    let queue = [];
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };
    for (const token of tokens) {
      if (/[A-Za-z]/.test(token)) {
        command = token.toUpperCase();
        queue = [];
        continue;
      }
      queue.push(Number(token));
      const need = arity[command] ?? 2;
      if (queue.length < need) continue;
      if (command === 'A') points.push(queue[0], queue[1], queue[5], queue[6]);
      else points.push(...queue);
      queue = [];
    }
    return points;
  }

  it('좌표가 24×24 안에 있다 — 밖으로 나가면 잘린다', () => {
    for (const item of FOLD_REFERENCE_LIST) {
      for (const source of [item.icon.fill, item.icon.stroke]) {
        if (!source) continue;
        for (const value of icon_read_points(source)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('좌표 추출기가 호의 회전각을 좌표로 세지 않는다', () => {
    // 이 검사가 없으면 위 테스트가 무엇을 보고 있는지 알 수 없다.
    expect(icon_read_points('M1 2A10 5 -30 1 1 20 7')).toEqual([1, 2, 10, 5, 20, 7]);
  });

  it('Path2D와 SVG가 둘 다 아는 명령만 쓴다', () => {
    for (const item of FOLD_REFERENCE_LIST) {
      const all = [item.icon.fill, item.icon.stroke ?? ''].join(' ');
      for (const command of all.match(/[A-Za-z]/g) ?? []) {
        expect('MLHVCQAZmlhvcqaz').toContain(command);
      }
    }
  });

  it('선만 있고 면이 없는 아이콘은 없다 — 면이 실루엣을 지탱한다', () => {
    for (const item of FOLD_REFERENCE_LIST) {
      expect(item.icon.fill.length).toBeGreaterThan(0);
      if (item.icon.stroke) expect(item.icon.stroke.length).toBeGreaterThan(0);
    }
  });
});

describe('방금 지나친 기준점 — 자·배지·표가 같이 쓰는 판정', () => {
  it('아무것도 못 넘었으면 null이고 다음 목표는 첫 번째다', () => {
    const first = FOLD_REFERENCE_LIST[0];
    expect(model_read_last_passed(first.metres / 2)).toBe(null);
    expect(model_read_next_target(first.metres / 2)).toBe(first);
  });

  it('경계에서 "같음"은 아직 넘은 것이 아니다', () => {
    const first = FOLD_REFERENCE_LIST[0];
    expect(model_read_last_passed(first.metres)).toBe(null);
    expect(model_read_last_passed(first.metres * 1.0000001).key).toBe(first.key);
  });

  it('기본값(0.1 mm, 42번)에서는 달을 막 지난 상태다', () => {
    const metres = model_calculate_thickness_m(0.1, 42);
    expect(model_read_last_passed(metres).key).toBe('moon');
    // 한 번 덜 접으면 아직 달을 못 넘는다 — 배지가 모델보다 앞서가면 안 된다
    expect(model_read_last_passed(model_calculate_thickness_m(0.1, 41)).key).not.toBe('moon');
  });

  it('전부 넘으면 다음 목표가 없다', () => {
    const last = FOLD_REFERENCE_LIST[FOLD_REFERENCE_LIST.length - 1];
    expect(model_read_last_passed(last.metres * 10).key).toBe(last.key);
    expect(model_read_next_target(last.metres * 10)).toBe(null);
  });

  it('교차표와 답이 일치한다 — 두 경로가 갈라지지 않는다', () => {
    for (const thicknessMm of [0.05, 0.1, 0.5]) {
      for (let fold = 0; fold <= FOLD_COUNT_MAX; fold += 1) {
        const metres = model_calculate_thickness_m(thicknessMm, fold);
        const passed = model_read_last_passed(metres);
        const fromTable = model_build_crossings(thicknessMm, FOLD_COUNT_MAX)
          .filter((row) => row.folds !== null && row.folds <= fold)
          .pop();
        expect(passed?.key ?? null).toBe(fromTable?.key ?? null);
      }
    }
  });

  it('목록이 오름차순이어야 이 판정이 성립한다', () => {
    // 이 함수는 정렬을 전제로 첫 미달에서 멈춘다. 목록 순서가 깨지면 조용히 틀린다.
    for (let i = 1; i < FOLD_REFERENCE_LIST.length; i += 1) {
      expect(FOLD_REFERENCE_LIST[i].metres).toBeGreaterThan(FOLD_REFERENCE_LIST[i - 1].metres);
    }
  });

  it('유효하지 않은 값에서 죽지 않는다', () => {
    expect(model_read_last_passed(NaN)).toBe(null);
    expect(model_read_last_passed(-1)).toBe(null);
  });
});
