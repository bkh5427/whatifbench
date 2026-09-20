/**
 * 자전거 기어비 — 위젯 테스트
 *
 * 순수 헬퍼(축 계산·표시 문자열·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머 수명, 접근성 속성, 깨진 입력의 화면 반응)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 실제로 마운트해서 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  PERCENT_SCALE,
  GEAR_CHAINRING_MAX,
  GEAR_CHAINRING_DEFAULT_LARGE,
  GEAR_CHAINRING_DEFAULT_SMALL,
  GEAR_CASSETTE_DEFAULT,
  GEAR_CASSETTE_PRESETS,
  GEAR_BIKE_PRESETS,
  GEAR_TYRE_WIDTH_DEFAULT,
  GEAR_TYRE_WIDTH_MAX,
  GEAR_BEAD_SEAT_DEFAULT,
  GEAR_CRANK_DEFAULT,
  GEAR_CADENCE_DEFAULT,
  GEAR_CADENCE_MAX,
  GEAR_TOLERANCE_DEFAULT,
  GEAR_TOLERANCE_MAX,
  model_calculate_result,
} from './model.js';
import {
  widget_mount,
  url_read_state,
  chart_calculate_ladder_scale,
  chart_build_log_ticks,
  chart_describe_ladder,
  chart_describe_speed,
  display_format_gear_inches,
  display_format_gain_ratio,
  display_format_development,
  display_format_speed,
  display_format_share,
  display_format_factor,
  display_format_tolerance,
  display_format_axis_number,
  display_format_gear_name,
  display_describe_verdict,
  display_describe_counting,
  chart_wrap_text,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 입력칸 7개(앞링 2 · 카세트 1 · 폭 · 크랭크 · 케이던스 · 허용오차) × (input, change) = 14
 * + 드롭다운 change 1 + 자전거 프리셋 4 + 카세트 프리셋 3 + window resize 1 = 23
 */
const WIDGET_LISTENER_COUNT = 23;
/** 화면에 뜨는 입력칸 수 (range·number·text 전부). */
const WIDGET_INPUT_COUNT = 7;
/** 프리셋 버튼 수. 자전거 4 + 카세트 3. */
const WIDGET_BUTTON_COUNT = GEAR_BIKE_PRESETS.length + GEAR_CASSETTE_PRESETS.length;

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

function fixture_build_mounted(options = {}) {
  const dom = fixture_create_dom(options);
  openDom = dom;
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

function fixture_read_input(dom, id) {
  return dom.root.querySelector(`[id="${id}"]`);
}

function fixture_read_card_values(dom) {
  return dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
}

function fixture_read_rows(dom) {
  return dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
}

function fixture_build_state(overrides = {}) {
  return {
    chainrings: [GEAR_CHAINRING_DEFAULT_LARGE, GEAR_CHAINRING_DEFAULT_SMALL],
    cassette: GEAR_CASSETTE_DEFAULT.slice(),
    tyreWidthMm: GEAR_TYRE_WIDTH_DEFAULT,
    beadSeatMm: GEAR_BEAD_SEAT_DEFAULT,
    crankMm: GEAR_CRANK_DEFAULT,
    cadenceRpm: GEAR_CADENCE_DEFAULT,
    tolerancePercent: GEAR_TOLERANCE_DEFAULT,
    ...overrides,
  };
}

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual(fixture_build_state());
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    const state = url_read_state('?cr1=&cr2=0x10&cs=abc&w=&l=1e2&n=zzz&tau=0x5&bsd=700');
    expect(state.chainrings).toEqual([GEAR_CHAINRING_DEFAULT_LARGE, GEAR_CHAINRING_DEFAULT_SMALL]);
    expect(state.cassette).toEqual(GEAR_CASSETTE_DEFAULT);
    expect(state.tyreWidthMm).toBe(GEAR_TYRE_WIDTH_DEFAULT);
    expect(state.crankMm).toBe(GEAR_CRANK_DEFAULT);
    expect(state.cadenceRpm).toBe(GEAR_CADENCE_DEFAULT);
    expect(state.tolerancePercent).toBe(GEAR_TOLERANCE_DEFAULT);
    // 드롭다운 값도 목록 밖이면 기본값이다.
    expect(state.beadSeatMm).toBe(GEAR_BEAD_SEAT_DEFAULT);
  });

  it('카세트가 부분적으로만 깨져도 통째로 기본 배열로 돌아간다', () => {
    expect(url_read_state('?cs=11,12,999').cassette).toEqual(GEAR_CASSETTE_DEFAULT);
    expect(url_read_state('?cs=11,13,15').cassette).toEqual([11, 13, 15]);
  });

  it('cr2=0은 1× 구동계다 — 최솟값으로 밀리지 않는다', () => {
    expect(url_read_state('?cr2=0').chainrings).toEqual([GEAR_CHAINRING_DEFAULT_LARGE]);
  });

  it('범위를 벗어난 값은 잘리고 눈금 위로 맞는다', () => {
    const state = url_read_state('?cr1=999&w=999&l=171&n=999&tau=99');
    expect(state.chainrings[0]).toBe(GEAR_CHAINRING_MAX);
    expect(state.tyreWidthMm).toBe(GEAR_TYRE_WIDTH_MAX);
    expect(state.crankMm).toBe(170);
    expect(state.cadenceRpm).toBe(GEAR_CADENCE_MAX);
    expect(state.tolerancePercent).toBe(GEAR_TOLERANCE_MAX);
  });

  it('읽어들인 상태는 그대로 모델에 넣을 수 있다', () => {
    expect(() => model_calculate_result(url_read_state('?cr1=44&cr2=0&cs=11,42&bsd=406'))).not.toThrow();
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('사다리의 로그 축', () => {
  it('데이터에 맞춰 자동 스케일링하고 양 끝을 품는다', () => {
    const result = model_calculate_result(fixture_build_state());
    const scale = chart_calculate_ladder_scale(result.combinations);
    expect(scale.low).toBeLessThan(result.lowest.gearInches);
    expect(scale.high).toBeGreaterThan(result.highest.gearInches);
    expect(scale.low).toBeGreaterThan(0);
  });

  it('0과 음수를 범위 계산에서 뺀다 — log(0)이 축을 무너뜨리지 않게', () => {
    const scale = chart_calculate_ladder_scale([
      { gearInches: 0 }, { gearInches: -5 }, { gearInches: 40 }, { gearInches: 100 },
    ]);
    expect(Number.isFinite(scale.low)).toBe(true);
    expect(scale.low).toBeGreaterThan(0);
    expect(scale.high).toBeGreaterThan(scale.low);
  });

  it('양수 값이 하나도 없어도 유효한 축을 낸다', () => {
    for (const points of [[], [{ gearInches: 0 }], [{ gearInches: Number.NaN }]]) {
      const scale = chart_calculate_ladder_scale(points);
      expect(scale.low).toBeGreaterThan(0);
      expect(scale.high).toBeGreaterThan(scale.low);
    }
  });

  it('조합이 하나뿐이라 스팬이 0일 때 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게)', () => {
    const scale = chart_calculate_ladder_scale([{ gearInches: 70 }]);
    expect(Math.log10(scale.high) - Math.log10(scale.low)).toBeGreaterThan(0.2);
    expect(scale.low).toBeLessThan(70);
    expect(scale.high).toBeGreaterThan(70);
  });
});

describe('로그 눈금 생성', () => {
  it('0이나 음수, 무한대가 들어오면 빈 배열이다 — 여기서 막지 않으면 무한루프다', () => {
    expect(chart_build_log_ticks(0, 100)).toEqual([]);
    expect(chart_build_log_ticks(-1, 100)).toEqual([]);
    expect(chart_build_log_ticks(10, 0)).toEqual([]);
    expect(chart_build_log_ticks(10, 10)).toEqual([]);
    expect(chart_build_log_ticks(1, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(chart_build_log_ticks(Number.NaN, 10)).toEqual([]);
  });

  it('범위 안의 눈금만, 오름차순으로 낸다', () => {
    const ticks = chart_build_log_ticks(30, 130);
    expect(ticks.length).toBeGreaterThan(3);
    for (const value of ticks) {
      expect(value).toBeGreaterThanOrEqual(30);
      expect(value).toBeLessThanOrEqual(130);
    }
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]).toBeGreaterThan(ticks[index - 1]);
    }
    // 1-2-5 계열이라 40·50·100이 들어온다. 연속 로그 매핑이 만드는 9,772는 없다.
    expect(ticks).toContain(40);
    expect(ticks).toContain(100);
  });

  it('한 데케이드 안에서도 눈금이 여럿 나온다 (32~120은 10의 거듭제곱이 하나뿐이다)', () => {
    expect(chart_build_log_ticks(32, 121).length).toBeGreaterThanOrEqual(5);
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('본문이 인용하는 자릿수로 찍는다', () => {
    expect(display_format_gear_inches(120.2577)).toBe('120.3');
    expect(display_format_gain_ratio(8.8538)).toBe('8.85');
    expect(display_format_development(9.5961)).toBe('9.60 m');
    expect(display_format_speed(51.8191)).toBe('51.8');
    expect(display_format_factor(3.743)).toBe('3.74×');
  });

  it('허용오차는 눈금의 정밀도로 찍는다 — 7.5%가 "8%"가 되지 않게', () => {
    expect(display_format_tolerance(7.5)).toBe('7.5%');
    expect(display_format_tolerance(5)).toBe('5.0%');
  });

  it('지분은 정수 퍼센트다', () => {
    expect(display_format_share(6 / 22)).toBe('27%');
    expect(display_format_share(12 / 22)).toBe('55%');
    expect(display_format_share(0)).toBe('0%');
  });

  it('축 눈금 라벨이 작은 값을 뭉개지 않는다', () => {
    expect(display_format_axis_number(120.3)).toBe('120');
    expect(display_format_axis_number(9.87)).toBe('9.87');
    expect(display_format_axis_number(0.4)).toBe('0.400');
  });

  it('0은 눈금으로 유효하다 — 속도축이 0에서 시작한다 (버그: 자리표시자로 삼켰었다)', () => {
    expect(display_format_axis_number(0)).toBe('0');
  });

  it('축 눈금 포맷터를 입력 범위 전체에서 훑는다', () => {
    // 아주 작은 값 — 뭉개지더라도 자리표시자로 떨어지지는 않는다
    expect(display_format_axis_number(0.0001)).toBe('0.000');
    // 아주 큰 값 — 반올림한 정수 문자열
    expect(display_format_axis_number(123456.7)).toBe('123457');
    // 음수·비유한값은 자리표시자
    expect(display_format_axis_number(-1)).toBe('—');
    expect(display_format_axis_number(Number.NaN)).toBe('—');
    expect(display_format_axis_number(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('유한하지 않은 값은 숫자처럼 보이지 않는다', () => {
    expect(display_format_gear_inches(Number.NaN)).toBe('—');
    expect(display_format_speed(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('조합 이름은 앞 × 뒤다', () => {
    expect(display_format_gear_name({ chainring: 50, sprocket: 11 })).toBe('50 × 11');
  });
});

describe('판정 문장', () => {
  it('기본 설정에서 근거 숫자를 함께 말한다', () => {
    const result = model_calculate_result(fixture_build_state());
    const spoken = display_describe_verdict(result);
    expect(spoken.headline).toContain('model');
    expect(spoken.detail).toContain('6 of 22');
    expect(spoken.detail).toContain('120.3');
    expect(spoken.detail).toContain('51.8');
  });

  it('중복이 하나도 없으면 개수를 세지 않고 그렇게 말한다', () => {
    const single = model_calculate_result(fixture_build_state({ chainrings: [42], cassette: [11, 42] }));
    expect(display_describe_verdict(single).detail).toContain('no two combinations');
  });

  it('조합이 하나뿐이면 비교할 것이 없다고 말한다', () => {
    const one = model_calculate_result(fixture_build_state({ chainrings: [40], cassette: [16] }));
    expect(display_describe_verdict(one).headline).toContain('single ratio');
  });

  it('세 정의를 나란히 적고 어느 하나를 대표로 삼지 않는다', () => {
    const text = display_describe_counting(model_calculate_result(fixture_build_state()));
    expect(text).toContain('27%');
    expect(text).toContain('55%');
    expect(text).toContain('42%');
    expect(text).toContain('does not move with the tolerance slider');
  });

  it('1×에서는 세 번째 정의가 0이라고 적는다', () => {
    const text = display_describe_counting(
      model_calculate_result(fixture_build_state({ chainrings: [42] })),
    );
    expect(text).toContain('single front ring');
  });

  it('단정하는 표현·장비 권유가 없다 — 주어는 언제나 모델이다', () => {
    for (const overrides of [{}, { chainrings: [42] }, { tolerancePercent: GEAR_TOLERANCE_MAX }]) {
      const result = model_calculate_result(fixture_build_state(overrides));
      const sentence = [
        ...Object.values(display_describe_verdict(result)),
        display_describe_counting(result),
        chart_describe_ladder(result, null),
        chart_describe_speed(result, null),
      ]
        .join(' ')
        .toLowerCase();
      for (const banned of [
        'in reality', 'you should', 'we recommend', 'is better', 'buy ', 'upgrade', 'proves', 'best gear',
      ]) {
        expect(sentence).not.toContain(banned);
      }
    }
  });

  it('겹쳐 보이는 선은 축을 조이지 않고 "구분 불가"라고 적는다', () => {
    const many = model_calculate_result(fixture_build_state());
    expect(chart_describe_speed(many, null)).toContain('cannot be told apart');
    // 중복이 없으면 없는 말을 만들지 않는다.
    const none = model_calculate_result(fixture_build_state({ chainrings: [42], cassette: [11, 42] }));
    expect(chart_describe_speed(none, null)).not.toContain('cannot be told apart');
  });

  it('캡션은 렌더가 실제로 쓴 축만 인용한다', () => {
    const result = model_calculate_result(fixture_build_state());
    const drawn = { scale: { low: 30.5, high: 126.4 } };
    const withAxis = chart_describe_ladder(result, drawn);
    // 축 눈금과 같은 표기를 쓴다 — 캡션이 그림과 다른 자릿수로 적히면 두 개가 갈린다.
    expect(withAxis).toContain('31 to 126');
    // 그림이 없으면 축 숫자를 지어내지 않는다.
    expect(chart_describe_ladder(result, null)).not.toContain('126');
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it(`붙는 리스너는 정확히 ${WIDGET_LISTENER_COUNT}개다`, () => {
    const { dom } = fixture_build_mounted();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it('reset이 붙인 것을 전부 뗀다 — 잔여 0', () => {
    const { dom, widget_reset } = fixture_build_mounted();
    widget_reset();
    expect(dom.listeners_read_removed()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(0);
    expect(dom.listeners_read_names()).toEqual([]);
  });

  it('reset이 예약된 타이머까지 끊는다', () => {
    const { dom, widget_reset } = fixture_build_mounted();
    const cadence = fixture_read_input(dom, 'gear-cadence');
    expect(dom.listeners_run_event(cadence, 'input')).toBe(1);
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('같은 자리에 두 번 붙지 않는다', () => {
    const { dom } = fixture_build_mounted();
    const before = dom.listeners_read_added();
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(before);
  });

  it('뗀 뒤에는 조작해도 아무 일도 일어나지 않는다', () => {
    const { dom, widget_reset } = fixture_build_mounted();
    const cadence = fixture_read_input(dom, 'gear-cadence');
    widget_reset();
    expect(dom.listeners_run_event(cadence, 'input')).toBe(0);
    expect(dom.root.textContent).toBe('');
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('조작부가 전부 있다 (초안 사양)', () => {
    const { dom } = fixture_build_mounted();
    expect(dom.root.querySelectorAll('input').length).toBe(WIDGET_INPUT_COUNT);
    expect(dom.root.querySelectorAll('select').length).toBe(1);
    expect(dom.root.querySelectorAll('button').length).toBe(WIDGET_BUTTON_COUNT);
    expect(dom.root.querySelectorAll('canvas').length).toBe(2);
    // 허용오차 슬라이더는 이 페이지의 축 토글이다. 숨기지 않는다.
    expect(fixture_read_input(dom, 'gear-tolerance')).not.toBeNull();
  });

  it('기본값이 채워진 채로 뜬다 (빈 폼 금지)', () => {
    const { dom } = fixture_build_mounted();
    expect(fixture_read_input(dom, 'gear-ring-1').value).toBe(String(GEAR_CHAINRING_DEFAULT_LARGE));
    expect(fixture_read_input(dom, 'gear-ring-2').value).toBe(String(GEAR_CHAINRING_DEFAULT_SMALL));
    expect(fixture_read_input(dom, 'gear-cassette').value).toContain('11');
    expect(fixture_read_input(dom, 'gear-cassette').value).toContain('28');
    expect(fixture_read_input(dom, 'gear-width').value).toBe(String(GEAR_TYRE_WIDTH_DEFAULT));
    expect(fixture_read_input(dom, 'gear-crank').value).toBe(String(GEAR_CRANK_DEFAULT));
    expect(fixture_read_input(dom, 'gear-cadence').value).toBe(String(GEAR_CADENCE_DEFAULT));
    expect(fixture_read_input(dom, 'gear-tolerance').value).toBe(String(GEAR_TOLERANCE_DEFAULT));
    expect(fixture_read_input(dom, 'gear-bead-seat').value).toBe(String(GEAR_BEAD_SEAT_DEFAULT));
  });

  it('카드 네 장이 본문의 숫자로 채워진다', () => {
    const { dom } = fixture_build_mounted();
    expect(fixture_read_card_values(dom)).toEqual(['22', '16', '6', '42%']);
  });

  it('표가 22줄을 채우고 본문의 값을 싣는다', () => {
    const { dom } = fixture_build_mounted();
    const rows = fixture_read_rows(dom);
    expect(rows.length).toBe(22);
    const top = rows[0].textContent;
    expect(top).toContain('50 × 11');
    expect(top).toContain('120.3');
    expect(top).toContain('8.85');
    expect(top).toContain('9.60 m');
    expect(top).toContain('51.8 km/h');
  });

  it('중복인 줄은 짝의 이름과 차이를 적는다', () => {
    const { dom } = fixture_build_mounted();
    const rows = fixture_read_rows(dom).map((row) => row.textContent);
    // 50/25와 34/17은 정확히 같은 비다.
    expect(rows.some((text) => text.includes('50 × 25') && text.includes('34 × 17') && text.includes('0.0%'))).toBe(true);
    // 짝이 없는 줄은 자리를 비운다.
    expect(rows.filter((text) => text.trimEnd().endsWith('—')).length).toBe(10);
  });

  it('표 머리글이 지금 케이던스를 말한다', () => {
    const { dom } = fixture_build_mounted();
    const heads = dom.root.querySelectorAll('thead').flatMap((head) => head.querySelectorAll('th'));
    expect(heads.map((cell) => cell.textContent)).toContain(`Speed at ${GEAR_CADENCE_DEFAULT} rpm`);
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = fixture_build_mounted();
    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBe('edge');
  });

  it('로드하자마자 주소창에 상태가 실린다', () => {
    const { dom } = fixture_build_mounted();
    const written = dom.urlsWritten.at(-1);
    expect(written).toContain('cr1=50');
    expect(written).toContain('cr2=34');
    expect(written).toContain('tau=5');
    // 카세트도 실린다 (쉼표는 인코딩된다).
    expect(decodeURIComponent(written)).toContain('cs=11,12,13');
  });

  it('범례가 색 견본과 함께 선 종류의 뜻을 글로 적는다', () => {
    const { dom } = fixture_build_mounted();
    const items = dom.root.querySelectorAll('.legend-item');
    // 사다리 3칸(앞링 2 + 점선 링크) + 속도 3칸(앞링 2 + 커서)
    expect(items.length).toBe(6);
    const text = dom.root.querySelectorAll('.widget-legend').map((el) => el.textContent).join(' ');
    expect(text).toContain('hollow');
    expect(text).toContain('dashed');
    expect(text).toContain('50-tooth');
    expect(text).toContain('34-tooth');
    // 견본은 기존 `.legend-key` 위에 수식 클래스를 얹는다 — 클래스를 덮어쓰지 않는다.
    for (const swatch of dom.root.querySelectorAll('.legend-key')) {
      expect(String(swatch.className).startsWith('legend-key ')).toBe(true);
    }
  });

  it('캔버스 폭이 0이어도 문구가 비지 않는다', () => {
    // 숨긴 탭이면 렌더가 null을 준다. 그때 캡션이 빈 문자열로 남으면 뜻이 사라진다.
    const { dom } = fixture_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.some((text) => text.includes('hollow') || text.includes('no pair'))).toBe(true);
    expect(notes.some((text) => text.includes('proportional to cadence'))).toBe(true);
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('모든 입력칸이 자기 설명과 묶여 있다', () => {
    const { dom } = fixture_build_mounted();
    const fields = [...dom.root.querySelectorAll('input'), ...dom.root.querySelectorAll('select')];
    expect(fields.length).toBe(WIDGET_INPUT_COUNT + 1);
    for (const field of fields) {
      const described = field.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(dom.root.querySelector(`[id="${described}"]`)).not.toBeNull();
      expect(dom.root.querySelector(`[id="${described}"]`).textContent.length).toBeGreaterThan(20);
    }
  });

  it('앞 체인링 두 칸은 각자 이름을 가진다 (라벨 하나를 나눠 쓰지 않는다)', () => {
    const { dom } = fixture_build_mounted();
    const first = fixture_read_input(dom, 'gear-ring-1').getAttribute('aria-label');
    const second = fixture_read_input(dom, 'gear-ring-2').getAttribute('aria-label');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    expect(second.toLowerCase()).toContain('empty');
  });

  it('슬라이더가 aria-valuetext로 단위를 준다 ("172.5"라고만 읽히지 않게)', () => {
    const { dom } = fixture_build_mounted();
    const texts = dom.root
      .querySelectorAll('input')
      .map((input) => input.getAttribute('aria-valuetext'))
      .filter(Boolean);
    expect(texts).toContain('172.5 mm');
    expect(texts).toContain('90 rpm');
    expect(texts).toContain('5.0%');
    expect(texts).toContain('25 mm');
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = fixture_build_mounted();
    const outputs = dom.root.querySelectorAll('output');
    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) expect(output.getAttribute('aria-live')).toBe('off');
  });

  it('두 캔버스에 role=img와 갱신되는 요약 aria-label이 붙는다', () => {
    const { dom } = fixture_build_mounted();
    for (const canvas of dom.root.querySelectorAll('canvas')) {
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label').length).toBeGreaterThan(40);
    }
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = fixture_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });

  it('프리셋 버튼이 지금 상태를 aria-pressed로 알린다', () => {
    const { dom } = fixture_build_mounted();
    const pressed = dom.root
      .querySelectorAll('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent);
    // 기본값은 로드용 프리셋과 카세트 프리셋 양쪽에 걸린다.
    expect(pressed).toContain(GEAR_BIKE_PRESETS[0].label);
    expect(pressed).toContain(GEAR_CASSETTE_PRESETS[0].label);
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('케이던스를 바꾸면 표와 머리글이 따라간다', () => {
    const { dom } = fixture_build_mounted();
    const cadence = fixture_read_input(dom, 'gear-cadence');
    cadence.value = '100';
    dom.listeners_run_event(cadence, 'change');

    expect(fixture_read_rows(dom)[0].textContent).toContain('57.6 km/h');
    const heads = dom.root.querySelectorAll('thead').flatMap((head) => head.querySelectorAll('th'));
    expect(heads.map((cell) => cell.textContent)).toContain('Speed at 100 rpm');
    expect(dom.urlsWritten.at(-1)).toContain('n=100');
  });

  it('허용오차를 움직이면 중복 개수가 실제로 달라진다 (슬라이더가 장식이 아니다)', () => {
    const { dom } = fixture_build_mounted();
    const before = fixture_read_card_values(dom);
    const tolerance = fixture_read_input(dom, 'gear-tolerance');
    tolerance.value = String(GEAR_TOLERANCE_MAX);
    dom.listeners_run_event(tolerance, 'change');

    const after = fixture_read_card_values(dom);
    const expected = model_calculate_result(fixture_build_state({ tolerancePercent: GEAR_TOLERANCE_MAX }));
    expect(after[2]).toBe(String(expected.removableCount));
    expect(after[2]).not.toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
    // 세 번째 정의는 허용오차를 타지 않는다.
    expect(after[3]).toBe(before[3]);
  });

  it('두 번째 앞 칸을 비우면 1× 구동계가 된다', () => {
    const { dom } = fixture_build_mounted();
    const second = fixture_read_input(dom, 'gear-ring-2');
    second.value = '';
    dom.listeners_run_event(second, 'change');

    const cards = fixture_read_card_values(dom);
    expect(cards[0]).toBe(String(GEAR_CASSETTE_DEFAULT.length));
    expect(cards[3]).toBe('0%');
    expect(fixture_read_rows(dom).length).toBe(GEAR_CASSETTE_DEFAULT.length);
    expect(dom.urlsWritten.at(-1)).toContain('cr2=0');
    // 범례도 한 줄로 줄어든다 (사다리 2칸 + 속도 2칸).
    expect(dom.root.querySelectorAll('.legend-item').length).toBe(4);
  });

  it('자전거 프리셋이 체인링·카세트·휠·크랭크를 한 번에 갈아끼운다', () => {
    const { dom } = fixture_build_mounted();
    const mountain = dom.root
      .querySelectorAll('button')
      .find((button) => button.textContent === GEAR_BIKE_PRESETS[2].label);
    dom.listeners_run_event(mountain, 'click');

    expect(fixture_read_input(dom, 'gear-ring-1').value).toBe('32');
    expect(fixture_read_input(dom, 'gear-ring-2').value).toBe('');
    expect(fixture_read_input(dom, 'gear-cassette').value).toContain('42');
    expect(fixture_read_input(dom, 'gear-width').value).toBe('57');
    expect(fixture_read_input(dom, 'gear-bead-seat').value).toBe('584');
    expect(fixture_read_input(dom, 'gear-crank').value).toBe('175');
    expect(mountain.getAttribute('aria-pressed')).toBe('true');
  });

  it('자전거 프리셋은 케이던스와 허용오차를 건드리지 않는다', () => {
    const { dom } = fixture_build_mounted();
    const cadence = fixture_read_input(dom, 'gear-cadence');
    cadence.value = '110';
    dom.listeners_run_event(cadence, 'change');

    const gravel = dom.root
      .querySelectorAll('button')
      .find((button) => button.textContent === GEAR_BIKE_PRESETS[1].label);
    dom.listeners_run_event(gravel, 'click');
    expect(fixture_read_input(dom, 'gear-cadence').value).toBe('110');
    expect(fixture_read_input(dom, 'gear-tolerance').value).toBe(String(GEAR_TOLERANCE_DEFAULT));
  });

  it('카세트 프리셋은 카세트만 갈아끼운다', () => {
    const { dom } = fixture_build_mounted();
    const wide = dom.root
      .querySelectorAll('button')
      .find((button) => button.textContent === GEAR_CASSETTE_PRESETS[2].label);
    dom.listeners_run_event(wide, 'click');
    expect(fixture_read_input(dom, 'gear-ring-1').value).toBe(String(GEAR_CHAINRING_DEFAULT_LARGE));
    expect(fixture_read_input(dom, 'gear-cassette').value).toContain('42');
    expect(wide.getAttribute('aria-pressed')).toBe('true');
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = fixture_build_mounted();
    const cadence = fixture_read_input(dom, 'gear-cadence');
    const before = dom.urlsWritten.length;

    cadence.value = '95';
    dom.listeners_run_event(cadence, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    cadence.value = '96';
    dom.listeners_run_event(cadence, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('타이핑 중에 글자 칸을 다시 쓰지 않는다 (캐럿이 끝으로 튀지 않게)', () => {
    const { dom } = fixture_build_mounted();
    const cassette = fixture_read_input(dom, 'gear-cassette');
    cassette.value = '11,12,13';
    dom.listeners_run_event(cassette, 'change');
    expect(cassette.value).toBe('11,12,13');
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = fixture_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('URL로 들어온 상태가 그대로 뜬다 (공유한 링크가 같은 그림을 낸다)', () => {
    const { dom } = fixture_build_mounted({ search: '?cr1=46&cr2=0&cs=11,42&bsd=406&w=35&l=170&n=70&tau=8' });
    expect(fixture_read_input(dom, 'gear-ring-1').value).toBe('46');
    expect(fixture_read_input(dom, 'gear-ring-2').value).toBe('');
    expect(fixture_read_input(dom, 'gear-cadence').value).toBe('70');
    expect(fixture_read_input(dom, 'gear-tolerance').value).toBe('8');
    expect(fixture_read_rows(dom).length).toBe(2);
  });
});

// ── 깨진 입력 ───────────────────────────────────────────────

describe('깨진 입력은 화면에 이유를 적는다', () => {
  const broken = [
    ['카세트가 비었다', 'gear-cassette', '', 'at least one sprocket'],
    ['카세트에 글자', 'gear-cassette', '11,abc', 'not a whole number'],
    ['카세트가 범위 밖', 'gear-cassette', '11,60', 'outside the'],
    ['카세트가 너무 길다', 'gear-cassette', '9,10,11,12,13,14,15,16,17,18,19,20,21,22', 'at most'],
    ['앞 링이 범위 밖', 'gear-ring-1', '5', 'outside the'],
  ];

  for (const [name, id, value, fragment] of broken) {
    it(`${name} → 사유가 판정 배너에 뜬다`, () => {
      const { dom } = fixture_build_mounted();
      const field = fixture_read_input(dom, id);
      field.value = value;
      dom.listeners_run_event(field, 'change');

      const verdict = dom.root.querySelector('.verdict');
      // 상태 없는 배너다 — hold/edge/break는 모델이 답을 냈을 때만 붙는다.
      expect(verdict.getAttribute('data-state')).toBeNull();
      expect(verdict.textContent).toContain(fragment);
      expect(verdict.textContent).not.toContain('NaN');
      // 낡은 숫자를 남겨두지 않는다.
      expect(fixture_read_card_values(dom)).toEqual(['—', '—', '—', '—']);
      expect(fixture_read_rows(dom).length).toBe(0);
    });
  }

  it('앞 칸을 둘 다 비우면 무엇을 넣어야 하는지 말한다', () => {
    const { dom } = fixture_build_mounted();
    for (const id of ['gear-ring-1', 'gear-ring-2']) {
      const field = fixture_read_input(dom, id);
      field.value = '';
      dom.listeners_run_event(field, 'change');
    }
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBeNull();
    expect(verdict.textContent).toContain('at least one front ring');
  });

  it('깨진 동안에는 주소창을 건드리지 않는다 — 깨진 링크를 공유하지 않게', () => {
    const { dom } = fixture_build_mounted();
    const before = dom.urlsWritten.length;
    const cassette = fixture_read_input(dom, 'gear-cassette');
    cassette.value = 'abc';
    dom.listeners_run_event(cassette, 'change');
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('고치면 그대로 돌아온다', () => {
    const { dom } = fixture_build_mounted();
    const cassette = fixture_read_input(dom, 'gear-cassette');
    cassette.value = 'abc';
    dom.listeners_run_event(cassette, 'change');
    cassette.value = '11,12,13';
    dom.listeners_run_event(cassette, 'change');

    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBeTruthy();
    expect(fixture_read_rows(dom).length).toBe(6);
    expect(fixture_read_card_values(dom)[0]).toBe('6');
  });

  it('깨진 뒤 resize가 낡은 그림을 되살리지 않는다', () => {
    const { dom } = fixture_build_mounted();
    const cassette = fixture_read_input(dom, 'gear-cassette');
    cassette.value = 'abc';
    dom.listeners_run_event(cassette, 'change');
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    for (const canvas of dom.root.querySelectorAll('canvas')) {
      // aria-label이 곧 모델의 사유 문구다 — "Nothing is drawn"으로 얼버무리지 않는다.
      expect(canvas.getAttribute('aria-label')).toContain('sprocket');
    }
  });

  it('깨진 입력에서는 캔버스가 빈 덩어리로 남지 않고, 이유를 그림 안에 짧게 적는다', () => {
    const { dom } = fixture_build_mounted();
    const cassette = fixture_read_input(dom, 'gear-cassette');
    cassette.value = 'abc';
    dom.listeners_run_event(cassette, 'change');

    const canvases = dom.root.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
    for (const canvas of canvases) {
      // 정상 높이(210px·300px)로 예약되지 않는다 — 훨씬 낮은 판만 쓴다.
      expect(canvas.style.height).toBe('96px');
      // 그림 자체에 사유 문구가 그려진다 (aria-label만이 아니라).
      const drawn = canvas.getContext('2d').texts.map((entry) => entry.text).join(' ');
      expect(drawn).toContain('sprocket');
      expect(canvas.getAttribute('aria-label')).toContain('sprocket');
    }
  });
});

// ── 그림이 실제로 무언가를 그린다 ───────────────────────────

describe('그림', () => {
  it('사다리가 축 라벨과 톱니 수를 찍는다', () => {
    const { dom } = fixture_build_mounted();
    const ladder = dom.root.querySelectorAll('canvas')[0];
    const drawn = ladder.getContext('2d').texts.map((entry) => entry.text);
    expect(drawn).toContain('50-tooth front ring');
    expect(drawn).toContain('34-tooth front ring');
    // 가로축 이름이 붙어 있고 스케일 종류까지 적혀 있다.
    expect(drawn.some((text) => text.includes('log scale'))).toBe(true);
    // 톱니 수 라벨이 하나 이상 살아남는다.
    expect(drawn.filter((text) => /^\d+$/.test(text)).length).toBeGreaterThan(4);
  });

  it('속도 그래프가 두 축의 이름을 모두 찍는다', () => {
    const { dom } = fixture_build_mounted();
    const speed = dom.root.querySelectorAll('canvas')[1];
    const drawn = speed.getContext('2d').texts.map((entry) => entry.text);
    expect(drawn).toContain('Speed, km/h (linear)');
    expect(drawn.some((text) => text.includes('Cadence'))).toBe(true);
  });

  it('설정을 바꾸면 그림이 다시 그려진다', () => {
    const { dom } = fixture_build_mounted();
    const context = dom.root.querySelectorAll('canvas')[0].getContext('2d');
    const before = context.texts.length;
    const second = fixture_read_input(dom, 'gear-ring-2');
    second.value = '';
    dom.listeners_run_event(second, 'change');

    // 스텁의 `clearRect`는 아무것도 지우지 않으므로 **새로 찍힌 것만** 본다.
    const added = context.texts.slice(before).map((entry) => entry.text);
    expect(added.length).toBeGreaterThan(0);
    expect(added).toContain('50-tooth front ring');
    expect(added).not.toContain('34-tooth front ring');
  });

  it('축 제목 줄바꿈 — 넓으면 한 줄, 좁으면 여러 줄로(글자를 줄이지 않는다)', () => {
    const stubContext = { measureText: (text) => ({ width: String(text).length * 6 }) };
    const title = 'Gear inches — how far one pedal turn takes you (log scale)'; // LADDER_TITLE_X
    expect(chart_wrap_text(stubContext, title, 10000)).toEqual([title]);
    const wrapped = chart_wrap_text(stubContext, title, 100);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join(' ')).toBe(title);
    for (const line of wrapped) expect(line.length * 6).toBeLessThanOrEqual(100);
  });

  it('좁은 화면에서 사다리·속도 그래프의 가로축 제목을 한 줄로 찍지 않는다', () => {
    const wide = fixture_build_mounted();
    const wideLadderTexts = wide.dom.root
      .querySelectorAll('canvas')[0]
      .getContext('2d')
      .texts.map((t) => t.text);
    const wideSpeedTexts = wide.dom.root
      .querySelectorAll('canvas')[1]
      .getContext('2d')
      .texts.map((t) => t.text);
    expect(wideLadderTexts).toContain('Gear inches — how far one pedal turn takes you (log scale)');
    expect(wideSpeedTexts).toContain('Cadence — pedal turns per minute (linear)');
    openDom.restore();
    openDom = null;

    const narrow = fixture_build_mounted({ width: 220 });
    const narrowLadderTexts = narrow.dom.root
      .querySelectorAll('canvas')[0]
      .getContext('2d')
      .texts.map((t) => t.text);
    const narrowSpeedTexts = narrow.dom.root
      .querySelectorAll('canvas')[1]
      .getContext('2d')
      .texts.map((t) => t.text);
    // 한 줄로는 더 이상 들어가지 않는다 — 글자를 줄이는 대신 줄을 나눈다.
    expect(narrowLadderTexts).not.toContain('Gear inches — how far one pedal turn takes you (log scale)');
    expect(narrowSpeedTexts).not.toContain('Cadence — pedal turns per minute (linear)');
  });
});
