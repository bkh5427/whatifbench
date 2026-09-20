/**
 * 공통 모듈 테스트.
 *
 * 여기 있는 함수들은 도구마다 다시 쓰인다. 그래서 여기서 놓친 결함은
 * 도구 수만큼 복제된다. 몬티홀에서 실제로 사고가 났던 입력을 그대로 넣는다.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  num_clamp_value,
  num_read_decimal,
  num_calculate_decimal_digits,
  num_format_count,
  num_format_plural,
  num_read_decade,
} from './numbers.js';
import { RNG_SEED_MIN, RNG_SEED_MAX, rng_clamp_seed, rng_create_seeded } from './random.js';
import {
  ticks_calculate_step,
  ticks_build_linear,
  ticks_build_decade,
  ticks_drop_crowded,
} from './ticks.js';
import { urlstate_read_numbers, urlstate_write } from './urlstate.js';
import { fixture_create_dom } from './dom-stub.js';

describe('numbers — 깨진 입력', () => {
  it('빈 문자열·16진수·문자를 전부 기본값으로 되돌린다', () => {
    // Number('')는 0, Number('0x10')은 16이다. 여기서 걸러지지 않으면
    // 클램프가 삼켜서 공유 URL의 곡선이 조용히 달라진다.
    expect(num_read_decimal('', 42)).toBe(42);
    expect(num_read_decimal('   ', 42)).toBe(42);
    expect(num_read_decimal('0x10', 42)).toBe(42);
    expect(num_read_decimal('1e3', 42)).toBe(42);
    expect(num_read_decimal('Infinity', 42)).toBe(42);
    expect(num_read_decimal('12abc', 42)).toBe(42);
    expect(num_read_decimal(null, 42)).toBe(42);
    expect(num_read_decimal(undefined, 42)).toBe(42);
  });

  it('정상적인 십진수는 통과시킨다', () => {
    expect(num_read_decimal('7', 42)).toBe(7);
    expect(num_read_decimal(' 7.5 ', 42)).toBe(7.5);
    expect(num_read_decimal('-3', 42)).toBe(-3);
    expect(num_read_decimal('0', 42)).toBe(0); // 0은 유효한 값이지 '없음'이 아니다
  });

  it('클램프는 숫자가 아닌 값을 최솟값으로 되돌린다', () => {
    expect(num_clamp_value(5, 1, 10)).toBe(5);
    expect(num_clamp_value(99, 1, 10)).toBe(10);
    expect(num_clamp_value(NaN, 1, 10)).toBe(1);
    expect(num_clamp_value(Infinity, 1, 10)).toBe(1);
  });

  it('자릿수를 크기가 아니라 정밀도로 정한다', () => {
    // 크기 구간으로 정하면 간격 2.5에서 7.5가 "8"로 찍힌다.
    expect(num_calculate_decimal_digits(1)).toBe(0);
    expect(num_calculate_decimal_digits(2.5)).toBe(1);
    expect(num_calculate_decimal_digits(0.25)).toBe(2);
    expect(num_calculate_decimal_digits(0)).toBe(0);
    expect(num_calculate_decimal_digits(NaN)).toBe(0);
    expect((7.5).toFixed(num_calculate_decimal_digits(2.5))).toBe('7.5');
  });

  it('자릿수 판정의 여유가 1e-9다 — 여유를 키우면 간격이 통째로 0자리가 된다', () => {
    // 여유를 1e-2로 벌리면 0.005도 0.001도 "0자리면 충분하다"로 판정된다.
    // 그러면 축 눈금 0.005, 0.010, 0.015가 전부 "0"으로 찍힌다.
    expect(num_calculate_decimal_digits(0.005)).toBe(3);
    expect(num_calculate_decimal_digits(0.001)).toBe(3);
  });

  it('자릿수 상한이 4다 — 이보다 잘면 표기를 포기한다', () => {
    // 0.00001은 5자리가 있어야 오차 없이 적히지만 상한에서 끊는다.
    // 상한을 8로 늘리면 여기서 5가 나온다.
    expect(num_calculate_decimal_digits(0.00001)).toBe(4);
    expect(num_calculate_decimal_digits(0.000123)).toBe(4);
  });

  it('로그 진입점을 방어한다 — 0과 음수는 null', () => {
    expect(num_read_decade(1000)).toBe(3);
    expect(num_read_decade(0.05)).toBe(-2);
    expect(num_read_decade(0)).toBe(null);
    expect(num_read_decade(-1)).toBe(null);
    expect(num_read_decade(NaN)).toBe(null);
  });

  it('큰 수를 로케일 고정으로 끊는다', () => {
    expect(num_format_count(1000000)).toBe('1,000,000');
  });
});

describe('random — 시드 재현성', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = rng_create_seeded(12345);
    const b = rng_create_seeded(12345);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
  });

  it('수열이 고정돼 있다 (골든 벡터) — 공유된 URL의 그림이 변하지 않는 근거', () => {
    const next = rng_create_seeded(1);
    const first = [next(), next(), next(), next()];
    // 값 자체를 못박는다. 범위·평균 스모크만으로는 상수를 바꿔도 전부 통과한다.
    expect(first.map((v) => v.toFixed(10))).toEqual([
      '0.6270739406',
      '0.0027357212',
      '0.5274470400',
      '0.9810509675',
    ]);
  });

  it('전부 [0, 1) 안에 있다', () => {
    const next = rng_create_seeded(20260906);
    for (let i = 0; i < 5000; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('시드를 유효범위로 자른다', () => {
    // 상수를 상수로 재면(`rng_clamp_seed(RNG_SEED_MAX + 1) === RNG_SEED_MAX`)
    // 상수를 어떤 값으로 바꿔도 통과하는 동어반복이 된다. 리터럴로 못박는다.
    expect(RNG_SEED_MIN).toBe(1);
    expect(RNG_SEED_MAX).toBe(99999999);
    expect(rng_clamp_seed(0)).toBe(1);
    expect(rng_clamp_seed(100000000)).toBe(99999999);
    expect(rng_clamp_seed(99999999)).toBe(99999999);
    expect(rng_clamp_seed(NaN)).toBe(1);
    expect(rng_clamp_seed(1.6)).toBe(2);
  });

  it('날짜 형식(YYYYMMDD) 시드가 범위 안에 있다 — 상한을 정한 이유', () => {
    // 상한이 8자리보다 작아지면 기본 시드가 로드 즉시 잘려 다른 곡선이 뜬다.
    expect(rng_clamp_seed(20260906)).toBe(20260906);
    expect(rng_clamp_seed(99991231)).toBe(99991231);
  });
});

describe('ticks — 눈금', () => {
  it('간격이 1-2-2.5-5 계열로 떨어진다', () => {
    expect(ticks_calculate_step(1)).toBe(0.2);
    expect(ticks_calculate_step(100)).toBe(20);
    expect(ticks_calculate_step(0)).toBe(0); // span 0에서 죽지 않는다
  });

  it('네 계열이 전부 실제로 나온다 — 하나를 빼면 그 자리가 다음 값으로 메워진다', () => {
    // 1-2-2.5-5는 규약 항목이다. 2.5를 지워도 "1-2-5 계열 안에 있다"는 검사는
    // 전부 통과한다. 각 계열이 나오는 span을 하나씩 짚어 못박는다.
    expect(ticks_calculate_step(4)).toBe(1);    // rough 0.8 → 1
    expect(ticks_calculate_step(9)).toBe(2);    // rough 1.8 → 2
    expect(ticks_calculate_step(11)).toBe(2.5); // rough 2.2 → 2.5 (지우면 5가 나온다)
    expect(ticks_calculate_step(20)).toBe(5);   // rough 4 → 5
    expect(ticks_calculate_step(40)).toBe(10);  // 계열을 다 넘기면 10배
  });

  it('선형 눈금이 범위를 벗어나지 않는다', () => {
    const values = ticks_build_linear(0.13, 0.42, 0.05);
    expect(values[0]).toBeGreaterThanOrEqual(0.13);
    expect(values[values.length - 1]).toBeLessThanOrEqual(0.42);
    expect(values.length).toBeGreaterThan(2);
    // 축 경계를 눈금 배수로 바깥 스냅하지 않는다 — 확대한 축이 도로 풀린다
    expect(values[0]).not.toBe(0);
  });

  it('선형 눈금이 잘못된 입력에서 빈 배열을 낸다', () => {
    expect(ticks_build_linear(0, 1, 0)).toEqual([]);
    expect(ticks_build_linear(1, 0, 0.1)).toEqual([]);
    expect(ticks_build_linear(NaN, 1, 0.1)).toEqual([]);
  });

  it('간격이 아주 작아도 브라우저가 멈추지 않는다', () => {
    // count가 천문학적이 되면 예외가 아니라 탭이 얼어붙는다.
    // 이 단언의 값어치는 반환값이 아니라 '끝난다'는 사실에 있다.
    expect(ticks_build_linear(0, 1, Number.MIN_VALUE)).toEqual([]);
    expect(ticks_build_linear(0, 1e12, 1e-9)).toEqual([]);
    expect(ticks_build_linear(0, 1, 0.01).length).toBeGreaterThan(90); // 상한 아래는 정상
    // 위 두 입력은 count가 Infinity·1e21이라 상한이 얼마든 걸린다.
    // 1천만 개를 요구하는 입력 — 상한을 1e9로 늘리면 여기서 배열이 나온다.
    expect(ticks_build_linear(0, 1, 1e-7)).toEqual([]);
  });

  it('눈금 개수 상한이 1000이다 — 경계 양쪽을 짚는다', () => {
    // 상한 자체를 못박지 않으면 1000을 1e9로 바꿔도 아무도 모른다.
    expect(ticks_build_linear(0, 999, 1)).toHaveLength(1000); // 딱 1000개는 통과
    expect(ticks_build_linear(0, 1000, 1)).toEqual([]);       // 1001개는 거부
  });

  it('로그 눈금이 10의 거듭제곱을 찍고 양 끝을 남긴다', () => {
    const values = ticks_build_decade(1, 1000000);
    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(1000000);
    expect(values).toContain(1000);
  });

  it('시작값이 0이거나 끝값이 무한대여도 무한루프에 빠지지 않는다 — 탭이 얼어붙던 자리', () => {
    // 이 단언의 값어치는 반환값이 아니라 '끝난다'는 사실에 있다.
    // log10(0) = -Infinity, Math.floor(Infinity) = Infinity. 둘 다 루프가 안 끝난다.
    expect(ticks_build_decade(0, 1000)).toEqual([0, 1000]);
    expect(ticks_build_decade(-5, 1000)).toEqual([-5, 1000]);
    expect(ticks_build_decade(1, Infinity)).toEqual([1, Infinity]);
    expect(ticks_build_decade(Infinity, 1000)).toEqual([Infinity, 1000]);
    expect(ticks_build_decade(1, NaN)).toEqual([1, NaN]);
  });

  it('양 끝에 붙은 데케이드 라벨을 기본 여백(0.12)으로 버린다', () => {
    // **이 기본값은 종이접기 위젯이 인자 없이 쓴다**(widget.js의 y축 로그 눈금).
    // 기본값을 0으로 바꿔도 기존 입력은 전부 통과했다. 기본 인자로만 부르고,
    // 실제로 라벨이 버려지는 입력을 넣는다.
    //
    // 0.9~10⁵는 로그 폭 5.046데케이드다.
    //   10⁰은 왼쪽 끝에서 0.0091 — 여백(0.12) 안이라 버린다
    //   10⁴은 오른쪽 끝에서 0.198 — 여백 밖이라 남긴다
    expect(ticks_build_decade(0.9, 1e5)).toEqual([0.9, 10, 100, 1000, 10000, 100000]);
    // 여백을 0으로 두면 왼쪽 끝에 겹쳐 붙는 10⁰이 살아난다
    expect(ticks_build_decade(0.9, 1e5, 0)).toContain(1);
    // 0.2로 키우면 오른쪽 끝의 10⁴이 사라진다 — 기본값은 그 둘 사이다
    expect(ticks_build_decade(0.9, 1e5, 0.2)).not.toContain(10000);
  });

  it('간격이 로그다 — 이 함수의 존재 이유', () => {
    const values = ticks_build_decade(1, 10000);
    const gaps = values.slice(1).map((v, i) => v - values[i]);
    // 선형이면 간격이 일정하다. 로그면 뒤로 갈수록 벌어진다.
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] * 10);
  });

  it('겹치는 라벨을 밀지 않고 버린다. 양 끝은 남긴다', () => {
    const items = [0, 10, 20, 30, 200].map((position) => ({ position, width: 20, value: position }));
    const kept = ticks_drop_crowded(items, 8);
    expect(kept.map((item) => item.position)).toEqual([0, 30, 200]);
    // 남은 것들끼리는 간격이 확보돼 있다
    for (let i = 1; i < kept.length; i += 1) {
      const gap = kept[i].position - kept[i - 1].position - 20;
      expect(gap).toBeGreaterThanOrEqual(8);
    }
  });

  it('내림차순으로 들어와도 같은 라벨이 남는다 — 세로 축이 그렇게 넣는다', () => {
    // 세로 축은 값이 커질수록 y가 작아져 **내림차순으로** 들어온다
    // (종이접기 위젯 widget.js의 y 눈금이 실제로 그렇다).
    // 함수 안의 정렬을 지우면 간격이 전부 음수가 되어 가운데가 통째로 버려지고,
    // 결과는 양 끝 두 개만 남는다. 오름차순 입력만으로는 절대 안 걸린다.
    const descending = [200, 30, 20, 10, 0].map((position) => ({ position, width: 20, value: position }));
    const kept = ticks_drop_crowded(descending, 8);
    expect(kept.map((item) => item.position)).toEqual([0, 30, 200]);
    expect(kept.length).toBeGreaterThan(2);
  });

  it('항목이 둘 이하면 그대로 둔다', () => {
    const items = [{ position: 0, width: 40 }, { position: 10, width: 40 }];
    expect(ticks_drop_crowded(items, 8)).toHaveLength(2);
  });
});

describe('urlstate — 상태 읽기', () => {
  const spec = {
    seed: { fallback: 20260906, clamp: rng_clamp_seed },
    n: { fallback: 42, clamp: (v) => num_clamp_value(v, 0, 50) },
  };

  it('없는 파라미터는 기본값이다', () => {
    expect(urlstate_read_numbers('', spec)).toEqual({ seed: 20260906, n: 42 });
  });

  it('깨진 파라미터는 최솟값이 아니라 기본값으로 돌아간다', () => {
    // 여기서 최솟값으로 떨어지면 시드가 1이 되어 다른 난수열을 탄다.
    expect(urlstate_read_numbers('?seed=&n=0x10', spec)).toEqual({ seed: 20260906, n: 42 });
  });

  it('읽은 값에 클램프를 적용한다', () => {
    expect(urlstate_read_numbers('?n=999', spec).n).toBe(50);
  });

  it('다른 쿼리 파라미터에 영향을 받지 않는다', () => {
    expect(urlstate_read_numbers('?utm_source=x&n=7', spec).n).toBe(7);
  });
});

describe('numbers — 단수/복수', () => {
  it('정확히 1일 때만 단수다. 0은 복수다', () => {
    // 영어에서 0은 복수다("0 folds"). 이 한 줄이 빠져 스크린리더가
    // 기본 상태에서 "1 doors opened"를 읽었다.
    expect(num_format_plural(0, 'fold')).toBe('folds');
    expect(num_format_plural(1, 'fold')).toBe('fold');
    expect(num_format_plural(2, 'fold')).toBe('folds');
    expect(num_format_plural(42, 'fold')).toBe('folds');
  });

  it('−1도 단수다 ("−1 degree")', () => {
    expect(num_format_plural(-1, 'degree')).toBe('degree');
    expect(num_format_plural(-2, 'degree')).toBe('degrees');
  });

  it('불규칙 복수와 동사 일치를 직접 넘길 수 있다', () => {
    expect(num_format_plural(1, 'tick is', 'ticks are')).toBe('tick is');
    expect(num_format_plural(0, 'tick is', 'ticks are')).toBe('ticks are');
    expect(num_format_plural(1, 'entry', 'entries')).toBe('entry');
    expect(num_format_plural(3, 'entry', 'entries')).toBe('entries');
  });

  it('소수 1.0은 단수, 1.5는 복수다', () => {
    expect(num_format_plural(1.0, 'metre')).toBe('metre');
    expect(num_format_plural(1.5, 'metre')).toBe('metres');
  });
});

describe('urlstate — fallback에도 클램프가 걸린다', () => {
  it('주석이 약속한 대로 기본값이 유효범위 밖이면 잘린다', () => {
    // `:17-18`의 약속이다. 안 지키면 "기본값이 자기 클램프를 통과하는가"라는
    // 점검이 무의미해진다 — 로드 즉시 잘리는 사고가 여기서 드러나야 한다.
    const spec = { n: { fallback: 999, clamp: (v) => num_clamp_value(v, 0, 50) } };
    expect(urlstate_read_numbers('', spec).n).toBe(50);
    expect(urlstate_read_numbers('?n=', spec).n).toBe(50);
    expect(urlstate_read_numbers('?n=0x10', spec).n).toBe(50);
  });

  it('clamp가 없으면 fallback을 그대로 둔다', () => {
    expect(urlstate_read_numbers('', { n: { fallback: 999 } }).n).toBe(999);
  });
});

describe('urlstate — 주소창에 실제로 쓴다', () => {
  // 아무것도 안 써도 화면은 멀쩡하다. 링크 공유만 조용히 죽는다.
  let openDom = null;
  afterEach(() => {
    if (openDom) openDom.restore();
    openDom = null;
  });

  function urlstate_build_window(search) {
    openDom = fixture_create_dom({ search });
    openDom.install();
    return openDom;
  }

  it('전달한 키가 전부 쿼리스트링에 들어간다', () => {
    const dom = urlstate_build_window('');
    urlstate_write({ doors: 25, opened: 1, seed: 20260904 });
    expect(dom.urlsWritten).toHaveLength(1);
    expect(dom.urlsWritten[0]).toBe('/test?doors=25&opened=1&seed=20260904');
  });

  it('다른 파라미터(utm 등)를 지우지 않는다', () => {
    const dom = urlstate_build_window('?utm_source=x');
    urlstate_write({ n: 7 });
    expect(dom.urlsWritten[0]).toContain('utm_source=x');
    expect(dom.urlsWritten[0]).toContain('n=7');
  });

  it('같은 키를 다시 쓰면 덮어쓴다 — 값이 쌓이지 않는다', () => {
    const dom = urlstate_build_window('?n=1');
    urlstate_write({ n: 2 });
    urlstate_write({ n: 3 });
    expect(dom.urlsWritten[1]).toBe('/test?n=3');
  });

  it('window가 없으면 아무 일도 하지 않는다', () => {
    // 서버 렌더·테스트 환경. 던지면 위젯 전체가 죽는다.
    expect(() => urlstate_write({ n: 1 })).not.toThrow();
  });
});
