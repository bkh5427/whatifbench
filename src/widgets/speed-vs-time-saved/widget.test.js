/**
 * 속도 vs 절약 시간 — 위젯 테스트
 *
 * 순수 헬퍼(표시 문자열·축·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머 수명, 종속 슬라이더, 접근성 속성)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  SECONDS_PER_MINUTE,
  METRES_PER_KILOMETRE,
  METRES_PER_MILE,
  UNIT_KMH,
  UNIT_MPH,
  DISTANCE_LADDER,
  DISTANCE_INDEX_MIN,
  DISTANCE_INDEX_MAX,
  DISTANCE_DEFAULT_UNITS,
  SPEED_FROM_DEFAULT_MS,
  SPEED_TO_DEFAULT_MS,
  SPEED_FROM_MAX_MS,
  SPEED_TO_MAX_MS,
  DELAY_DEFAULT_MINUTES,
  DELAY_MAX_MINUTES,
  SPEED_UNITS,
  model_calculate_speed_range,
  model_calculate_result,
  model_calculate_curve,
  model_calculate_increase_table,
  model_calculate_speed_to_ms,
  model_calculate_distance_to_metres,
} from './model.js';
import {
  PRESETS,
  PRESET_KEYS,
  widget_mount,
  url_read_state,
  url_read_unit,
  state_build_preset,
  state_pick_matching_preset,
  chart_calculate_scale,
  chart_render_curve,
  chart_describe_axes,
  display_format_minutes,
  display_format_percent,
  display_format_percent_number,
  display_format_speed,
  display_format_distance,
  display_format_axis_minutes,
  display_describe_preset,
  display_describe_verdict,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 4개 × (input, change) = 8 + 프리셋 버튼 4 + 단위 라디오 2 + window resize 1 = 15
 */
const WIDGET_LISTENER_COUNT = 15;

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

function widget_build_mounted(options = {}) {
  const dom = fixture_create_dom(options);
  openDom = dom;
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

/** id로 슬라이더를 집는다. 라디오까지 섞여 있어 인덱스로 세면 조용히 어긋난다. */
function fixture_read_input(dom, id) {
  return dom.root.querySelector(`[id="${id}"]`);
}

function fixture_read_card_values(dom) {
  return dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
}

function fixture_read_card_units(dom) {
  return dom.root.querySelectorAll('.readout-unit').map((el) => el.textContent);
}

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      unit: UNIT_KMH,
      distanceMetres: DISTANCE_DEFAULT_UNITS * METRES_PER_KILOMETRE,
      speedFromMs: SPEED_FROM_DEFAULT_MS,
      speedToMs: SPEED_TO_DEFAULT_MS,
      delayMinutes: DELAY_DEFAULT_MINUTES,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    const state = url_read_state('?d=&v1=0x10&v2=abc&t=&u=parsecs');
    expect(state.distanceMetres).toBe(DISTANCE_DEFAULT_UNITS * METRES_PER_KILOMETRE);
    expect(state.speedFromMs).toBe(SPEED_FROM_DEFAULT_MS);
    expect(state.speedToMs).toBe(SPEED_TO_DEFAULT_MS);
    expect(state.delayMinutes).toBe(DELAY_DEFAULT_MINUTES);
    expect(state.unit).toBe(UNIT_KMH);
  });

  it('단위 파라미터는 화이트리스트로만 통과한다', () => {
    expect(url_read_unit('?u=mph')).toBe(UNIT_MPH);
    expect(url_read_unit('?u=kmh')).toBe(UNIT_KMH);
    expect(url_read_unit('?u=MPH')).toBe(UNIT_KMH);
    expect(url_read_unit('?u=')).toBe(UNIT_KMH);
    expect(url_read_unit('')).toBe(UNIT_KMH);
  });

  it('범위를 벗어난 값은 잘리고, 거리는 사다리 칸으로 스냅한다', () => {
    const state = url_read_state('?d=9999&v1=999&v2=1&t=999');
    expect(state.distanceMetres).toBe(DISTANCE_LADDER[DISTANCE_INDEX_MAX] * METRES_PER_KILOMETRE);
    expect(state.speedFromMs).toBe(SPEED_FROM_MAX_MS);
    // v₂는 v₁에 종속이다 — 1 km/h가 들어와도 v₁ 아래로 내려가지 않는다.
    expect(state.speedToMs).toBeGreaterThan(state.speedFromMs);
    expect(state.speedToMs).toBeLessThanOrEqual(SPEED_TO_MAX_MS);
    expect(state.delayMinutes).toBe(DELAY_MAX_MINUTES);
  });

  it('mph 링크는 거리를 마일 사다리 위로 스냅한다', () => {
    const state = url_read_state('?d=10&u=mph');
    expect(state.unit).toBe(UNIT_MPH);
    expect(state.distanceMetres).toBeCloseTo(7 * METRES_PER_MILE, 9);
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  it('네 프리셋이 두 단위 모두에서 유효한 상태를 만든다', () => {
    for (const unitKey of [UNIT_KMH, UNIT_MPH]) {
      const range = model_calculate_speed_range(unitKey);
      for (const preset of PRESETS[unitKey]) {
        expect(DISTANCE_LADDER).toContain(preset.distance);
        expect(preset.from).toBeGreaterThanOrEqual(range.fromMin);
        expect(preset.from).toBeLessThanOrEqual(range.fromMax);
        expect(preset.to).toBeLessThanOrEqual(range.toMax);
        const state = state_build_preset(preset.key, unitKey);
        // 만들어진 상태가 실제로 계산을 통과한다 (throw하지 않는다).
        expect(() => model_calculate_result(
          state.distanceMetres, state.speedFromMs, state.speedToMs, state.delayMinutes * SECONDS_PER_MINUTE,
        )).not.toThrow();
        expect(state_pick_matching_preset(state)).toBe(preset.key);
      }
    }
  });

  it('버튼 라벨만 읽고도 무엇이 로드되는지 알 수 있다', () => {
    const label = display_describe_preset(PRESETS[UNIT_KMH][0], UNIT_KMH);
    expect(label).toContain('10 km');
    expect(label).toContain('40→60');
    const lights = display_describe_preset(PRESETS[UNIT_KMH][1], UNIT_KMH);
    expect(lights).toContain('+6 min');
    const imperial = display_describe_preset(PRESETS[UNIT_MPH][0], UNIT_MPH);
    expect(imperial).toContain('mi');
  });

  it('없는 프리셋 키는 null이다', () => {
    expect(state_build_preset('teleport', UNIT_KMH)).toBeNull();
  });

  it('슬라이더를 움직여 프리셋을 벗어나면 아무 버튼도 눌리지 않는다', () => {
    const state = state_build_preset('city', UNIT_KMH);
    expect(state_pick_matching_preset({ ...state, delayMinutes: 3 })).toBeNull();
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('초안이 인용하는 자릿수를 그대로 낸다', () => {
    expect(display_format_minutes(5)).toBe('5.00');
    expect(display_format_minutes(8)).toBe('8.00');
    expect(display_format_minutes(15)).toBe('15.0');
    expect(display_format_minutes(21)).toBe('21.0');
    expect(display_format_minutes(Number.NaN)).toBe('—');
  });

  it('1분 아래에서는 자릿수를 늘린다 — 0.014와 0.019가 뭉개지지 않게', () => {
    expect(display_format_minutes(0.014)).toBe('0.014');
    expect(display_format_minutes(0.019)).toBe('0.019');
    expect(display_format_minutes(0.014)).not.toBe(display_format_minutes(0.019));
  });

  it('축 라벨이 좁은 축에서 0으로 뭉개지지 않는다', () => {
    expect(display_format_axis_minutes(0)).toBe('0');
    expect(display_format_axis_minutes(0.04)).toBe('0.040');
    expect(display_format_axis_minutes(0.25)).toBe('0.250');
    expect(display_format_axis_minutes(12.5)).toBe('12.5');
    expect(display_format_axis_minutes(1250)).toBe('1250');
  });

  it('속도·거리·백분율에 언제나 단위가 붙는다', () => {
    expect(display_format_speed(SPEED_FROM_DEFAULT_MS, UNIT_KMH)).toBe('40 km/h');
    expect(display_format_speed(SPEED_FROM_DEFAULT_MS, UNIT_MPH)).toBe('25 mph');
    expect(display_format_distance(10 * METRES_PER_KILOMETRE, UNIT_KMH)).toBe('10 km');
    expect(display_format_percent(1 / 3)).toBe('33.3%');
    expect(display_format_percent_number(1 / 3)).toBe('33.3');
  });

  it('마일 왕복 환산의 부동소수 꼬리를 카드에 찍지 않는다', () => {
    // 7 mi를 미터로 갔다 되돌리면 6.999999999999999다.
    expect(model_calculate_result(7 * METRES_PER_MILE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0)
      .distanceMetres / METRES_PER_MILE).not.toBe(7);
    expect(display_format_distance(7 * METRES_PER_MILE, UNIT_MPH)).toBe('7 mi');
  });

  it('세로축은 0에서 천장까지고, 천장이 0이어도 폭이 0이 되지 않는다', () => {
    const scale = chart_calculate_scale(15);
    expect(scale.low).toBe(0);
    expect(scale.high).toBeGreaterThan(15);
    expect(chart_calculate_scale(0).high).toBeGreaterThan(0);
  });

  it('판정문에 단정·권고 표현이 없다 — 주어는 모델이다', () => {
    const cases = [
      [10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0],
      [500 * METRES_PER_KILOMETRE, 100 * SPEED_UNITS[UNIT_KMH].msPerSpeed, 120 * SPEED_UNITS[UNIT_KMH].msPerSpeed, 0],
      [1 * METRES_PER_KILOMETRE, SPEED_FROM_MAX_MS, SPEED_TO_MAX_MS, 30 * SECONDS_PER_MINUTE],
    ];
    for (const [distance, from, to, delay] of cases) {
      const spoken = display_describe_verdict(model_calculate_result(distance, from, to, delay), UNIT_KMH);
      const sentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
      // 속도·안전·연비 권고는 이 페이지에서 절대 나오면 안 된다.
      for (const banned of [
        'in reality', 'you should', 'we recommend', 'worth it', 'slow down', 'speed up',
        'safer', 'dangerous', 'fuel', 'is better', 'always',
      ]) {
        expect(sentence).not.toContain(banned);
      }
      expect(spoken.headline.startsWith('The model')).toBe(true);
      expect(['hold', 'edge', 'break']).toContain(spoken.verdict);
    }
  });

  it('판정문이 근거 숫자를 들고 있다', () => {
    const spoken = display_describe_verdict(
      model_calculate_result(10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 0), UNIT_KMH,
    );
    expect(spoken.headline).toContain('5.00');
    expect(spoken.headline).toContain('33.3%');
    expect(spoken.detail).toContain('15.0');
    expect(spoken.verdict).toBe('break');
  });

  it('지연이 있으면 판정문이 "분은 그대로, 비율만 움직인다"를 말한다', () => {
    const spoken = display_describe_verdict(
      model_calculate_result(
        10 * METRES_PER_KILOMETRE, SPEED_FROM_DEFAULT_MS, SPEED_TO_DEFAULT_MS, 6 * SECONDS_PER_MINUTE,
      ),
      UNIT_KMH,
    );
    expect(spoken.detail).toContain('cancels out');
    expect(spoken.headline).toContain('23.8%');
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it('붙는 리스너는 정확히 15개다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it('reset이 붙인 것을 전부 뗀다 — 잔여 0', () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    expect(dom.listeners_read_removed()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(0);
    expect(dom.listeners_read_names()).toEqual([]);
  });

  it('reset이 예약된 타이머까지 끊는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    expect(dom.listeners_run_event(fixture_read_input(dom, 'speed-distance'), 'input')).toBe(1);
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('애니메이션 프레임을 쓰지 않는다 — 이 위젯에 움직이는 것은 없다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    expect(dom.frames_read_pending()).toBe(0);
    widget_reset();
    expect(dom.frames_read_pending()).toBe(0);
  });

  it('같은 자리에 두 번 붙지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.listeners_read_added();
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(before);
  });

  it('뗀 뒤에는 슬라이더를 움직여도 아무 일도 일어나지 않는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const slider = fixture_read_input(dom, 'speed-from');
    widget_reset();
    expect(dom.listeners_run_event(slider, 'input')).toBe(0);
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('슬라이더 4개·단위 라디오 2개·캔버스 1개가 있다', () => {
    const { dom } = widget_build_mounted();
    for (const id of ['speed-distance', 'speed-from', 'speed-to', 'speed-delay']) {
      expect(fixture_read_input(dom, id)).not.toBeNull();
    }
    expect(fixture_read_input(dom, 'speed-unit-kmh')).not.toBeNull();
    expect(fixture_read_input(dom, 'speed-unit-mph')).not.toBeNull();
    expect(dom.root.querySelectorAll('canvas').length).toBe(1);
  });

  it('카드 다섯 장이 초안의 대표 숫자로 채워진다 (10 km, 40 → 60)', () => {
    const { dom } = widget_build_mounted();
    // 절약 / 비율 / 이전 / 이후 / 천장
    expect(fixture_read_card_values(dom)).toEqual(['5.00', '33.3', '15.0', '10.0', '15.0']);
  });

  it('모든 카드에 단위가 붙고, 절약 카드가 초까지 같이 준다', () => {
    const { dom } = widget_build_mounted();
    const units = fixture_read_card_units(dom);
    expect(units.length).toBe(5);
    for (const text of units) expect(text.length).toBeGreaterThan(0);
    expect(units[0]).toBe('min (300 s)');
    expect(units[1]).toContain('% of the 15.0 min trip');
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('break');
    expect(verdict.textContent).toContain('5.00');
  });

  it('누적 막대 두 줄이 같은 축 위에 그려진다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('.bar-row');
    expect(rows.length).toBe(2);
    const fills = dom.root.querySelectorAll('.bar-fill');
    // 막대마다 이동 시간(계열 1)과 고정 지연(계열 2) 두 칸.
    expect(fills.length).toBe(4);
    expect(fills.map((el) => el.getAttribute('data-series'))).toEqual(['1', '2', '1', '2']);
    // 기준은 원래 트립이므로 위 막대가 100%, 아래가 그보다 짧다.
    expect(fills[0].style.width).toBe('100%');
    expect(Number.parseFloat(fills[2].style.width)).toBeCloseTo((10 / 15) * 100, 6);
    // 지연이 0이면 두 번째 칸은 폭이 없다.
    expect(fills[1].style.width).toBe('0%');
  });

  it('표가 여덟 줄을 채우고 지금 설정을 표시한다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(model_calculate_increase_table(10 * METRES_PER_KILOMETRE, 0, UNIT_KMH).length);
    expect(rows.length).toBe(8);
    const current = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('40 km/h');
    // 초안 4번 블록의 첫 줄과 마지막 줄이 화면에 그대로 뜬다.
    expect(rows[0].textContent).toContain('8.00 min');
    expect(rows[7].textContent).toContain('1.00 min');
  });

  it('프리셋 버튼 넷이 뜨고, 기본 상태가 첫 프리셋과 같다고 알린다', () => {
    const { dom } = widget_build_mounted();
    const buttons = dom.root.querySelectorAll('.widget-preset');
    expect(buttons.length).toBe(PRESET_KEYS.length);
    const pressed = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].textContent).toContain('10 km');
  });

  it('범례에 견본 두 칸과 선 종류의 뜻이 글로 적힌다', () => {
    const { dom } = widget_build_mounted();
    const keys = dom.root.querySelectorAll('.legend-key').map((el) => String(el.className));
    expect(keys.length).toBe(2);
    // `.legend-key`는 다른 위젯도 쓰는 클래스다. 견본에 그대로 붙어 있어야 한다.
    for (const name of keys) expect(name.startsWith('legend-key ')).toBe(true);
    expect(keys.filter((name) => name.includes('legend-tail-')).length).toBe(1);
    expect(dom.root.querySelector('.widget-legend').textContent).toContain('Ceiling');
  });

  it('로드하자마자 주소창에 상태가 실린다', () => {
    const { dom } = widget_build_mounted();
    const written = dom.urlsWritten.at(-1);
    expect(written).toContain('d=10');
    expect(written).toContain('v1=40');
    expect(written).toContain('v2=60');
    expect(written).toContain('u=kmh');
  });

  it('캔버스 폭이 0이어도 범례 문구가 비지 않는다', () => {
    const { dom } = widget_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.some((text) => text.includes('Solid ='))).toBe(true);
  });

  it('범례 문구가 그림이 실제로 쓴 축을 인용한다', () => {
    const { dom } = widget_build_mounted();
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    // 천장 15분에 여유 8%를 더한 16.2분이 축의 위 끝이다.
    expect(notes.some((text) => text.includes('0–16.2 minutes'))).toBe(true);
    expect(notes.some((text) => text.includes('40–160 km/h'))).toBe(true);
  });
});

// ── 축과 캡션 ───────────────────────────────────────────────

/**
 * 캡션이 인용하는 축 값은 **렌더가 실제로 쓴 값**이어야 한다.
 * 그래서 여기서는 캡션을 문자열로만 보지 않는다 —
 * 실제 캔버스에 한 번 그리고, 렌더가 반환한 축과 그 캔버스에 찍힌 눈금 라벨과
 * 캡션 문자열 셋을 한자리에서 맞춘다. 축이 설정마다 실제로 달라지는지도 같이 본다
 * (축이 한 번도 안 바뀌면 그 테스트는 아무것도 지키지 않는다).
 */

/** 한 조합을 실제 캔버스에 그린다. 렌더가 반환한 축과 그 축으로 만든 캡션을 함께 준다. */
function fixture_render_axes(dom, item) {
  const canvasEl = dom.document.createElement('canvas');
  const points = model_calculate_curve(item.distanceMetres, item.speedFromMs, item.unit);
  const result = model_calculate_result(
    item.distanceMetres, item.speedFromMs, item.speedToMs, item.delayMinutes * SECONDS_PER_MINUTE,
  );
  const drawn = chart_render_curve(canvasEl, points, result, item.unit);
  return { canvasEl, drawn, caption: chart_describe_axes(drawn, item.unit) };
}

/** 캡션이 세로축을 인용하는 조각. 캡션이 이 문자열을 그대로 들고 있어야 한다. */
function fixture_read_vertical_quote(drawn) {
  return `0–${display_format_axis_minutes(drawn.scale.high)} minutes`;
}

/** 가로축을 인용하는 조각. 라벨 단위까지 붙어야 mph 화면이 km/h를 인용하지 못한다. */
function fixture_read_horizontal_quote(drawn, unitKey) {
  return `${Math.round(drawn.speedLow)}–${Math.round(drawn.speedHigh)} ${SPEED_UNITS[unitKey].speedLabel}`;
}

/**
 * 캔버스에 실제로 찍힌 눈금 라벨. 세로축 라벨은 원점 왼쪽(x < 0)에,
 * 가로축 라벨은 플롯 안쪽(x ≥ 0)에 찍힌다 — 축 제목은 숫자가 아니라 걸러진다.
 */
function fixture_read_tick_numbers(canvasEl, side) {
  return canvasEl.context.texts
    .filter((entry) => (side === 'vertical' ? entry.x < 0 : entry.x >= 0))
    .map((entry) => Number(entry.text))
    .filter((value) => Number.isFinite(value));
}

/** 축이 서로 다른 자리에 서는 네 조합. 거리·v₁·지연·단위를 전부 흔든다. */
const AXIS_CASES = [
  { name: '10 km · 40→60 km/h', unit: UNIT_KMH, distanceKm: 10, fromUnits: 40, toUnits: 60, delayMinutes: 0 },
  { name: '200 km · 90→130 km/h · +10분', unit: UNIT_KMH, distanceKm: 200, fromUnits: 90, toUnits: 130, delayMinutes: 10 },
  { name: '2 km · 45→65 km/h', unit: UNIT_KMH, distanceKm: 2, fromUnits: 45, toUnits: 65, delayMinutes: 0 },
  { name: '5 mi · 35→55 mph · +5분', unit: UNIT_MPH, distanceKm: 5, fromUnits: 35, toUnits: 55, delayMinutes: 5 },
].map((item) => ({
  ...item,
  distanceMetres: model_calculate_distance_to_metres(item.distanceKm, item.unit),
  speedFromMs: model_calculate_speed_to_ms(item.fromUnits, item.unit),
  speedToMs: model_calculate_speed_to_ms(item.toUnits, item.unit),
}));

describe('축과 캡션 — 캡션은 렌더가 쓴 축만 인용한다', () => {
  it('네 조합 모두에서 캡션이 렌더가 반환한 축을 그대로 인용한다', () => {
    const dom = fixture_create_dom({ width: 720 });
    openDom = dom;
    dom.install();
    for (const item of AXIS_CASES) {
      const { drawn, caption } = fixture_render_axes(dom, item);
      expect(drawn).not.toBeNull();
      expect(caption).toContain(fixture_read_vertical_quote(drawn));
      expect(caption).toContain(fixture_read_horizontal_quote(drawn, item.unit));
    }
  });

  it('렌더가 반환한 축이 캔버스에 실제로 찍힌 눈금과 같은 축이다', () => {
    // 반환값이 그림과 무관한 숫자 뭉치라면 캡션이 그것을 인용해도 소용이 없다.
    const dom = fixture_create_dom({ width: 720 });
    openDom = dom;
    dom.install();
    for (const item of AXIS_CASES) {
      const { canvasEl, drawn } = fixture_render_axes(dom, item);
      const verticalTicks = fixture_read_tick_numbers(canvasEl, 'vertical');
      const horizontalTicks = fixture_read_tick_numbers(canvasEl, 'horizontal');
      expect(verticalTicks.length).toBeGreaterThan(1);
      expect(horizontalTicks.length).toBeGreaterThan(1);
      for (const value of verticalTicks) {
        expect(value).toBeGreaterThanOrEqual(drawn.scale.low);
        expect(value).toBeLessThanOrEqual(drawn.scale.high);
      }
      for (const value of horizontalTicks) {
        expect(value).toBeGreaterThanOrEqual(Math.floor(drawn.speedLow));
        expect(value).toBeLessThanOrEqual(Math.ceil(drawn.speedHigh));
      }
      // 축 제목도 실제로 캔버스에 찍힌다 — 스케일 종류까지 화면에 적혀 있어야 한다.
      const texts = canvasEl.context.texts.map((entry) => entry.text);
      expect(texts).toContain('Time saved (minutes)');
      expect(texts).toContain(`Raised speed (${SPEED_UNITS[item.unit].speedLabel}, linear)`);
    }
  });

  it('조합마다 축이 실제로 달라지고, 캡션이 남의 축을 인용하지 않는다', () => {
    const dom = fixture_create_dom({ width: 720 });
    openDom = dom;
    dom.install();
    const rendered = AXIS_CASES.map((item) => ({ item, ...fixture_render_axes(dom, item) }));

    // 축이 한 번도 안 바뀌면 위 두 테스트는 아무것도 지키지 않는다.
    expect(new Set(rendered.map((entry) => entry.drawn.scale.high)).size).toBe(AXIS_CASES.length);
    expect(new Set(rendered.map((entry) => entry.drawn.speedLow)).size).toBeGreaterThan(2);

    for (const mine of rendered) {
      for (const other of rendered) {
        if (other === mine) continue;
        const otherVertical = fixture_read_vertical_quote(other.drawn);
        if (otherVertical !== fixture_read_vertical_quote(mine.drawn)) {
          expect(mine.caption).not.toContain(otherVertical);
        }
        const otherHorizontal = fixture_read_horizontal_quote(other.drawn, other.item.unit);
        if (otherHorizontal !== fixture_read_horizontal_quote(mine.drawn, mine.item.unit)) {
          expect(mine.caption).not.toContain(otherHorizontal);
        }
      }
    }
  });

  it('화면에 붙은 범례 문구가 그 그림을 그린 렌더의 축과 같다', () => {
    // 마운트된 위젯이 실제로 쓴 상태를 주소창에서 되읽어 같은 축을 다시 만든다.
    const searches = [
      '?d=10&v1=40&v2=60&t=0&u=kmh',
      '?d=200&v1=90&v2=130&t=10&u=kmh',
      '?d=50&v1=45&v2=75&t=3&u=kmh',
      '?d=3&v1=56.327&v2=88.514&t=0&u=mph',
    ];
    const seen = new Set();
    for (const search of searches) {
      const dom = fixture_create_dom({ search, width: 720 });
      openDom = dom;
      dom.install();
      const widget_reset = widget_mount(dom.root);

      const state = url_read_state(dom.window.location.search);
      const { drawn } = fixture_render_axes(dom, {
        unit: state.unit,
        distanceMetres: state.distanceMetres,
        speedFromMs: state.speedFromMs,
        speedToMs: state.speedToMs,
        delayMinutes: state.delayMinutes,
      });
      const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
      expect(notes.some((text) => text.includes(fixture_read_vertical_quote(drawn)))).toBe(true);
      expect(notes.some((text) => text.includes(fixture_read_horizontal_quote(drawn, state.unit)))).toBe(true);
      seen.add(`${fixture_read_vertical_quote(drawn)} ${fixture_read_horizontal_quote(drawn, state.unit)}`);

      widget_reset();
      dom.restore();
      openDom = null;
    }
    // 네 링크가 서로 다른 축을 그렸다. 같은 축만 나오면 이 테스트는 아무것도 못 지킨다.
    expect(seen.size).toBe(searches.length);
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('네 슬라이더가 모두 자기 설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    for (const id of ['speed-distance', 'speed-from', 'speed-to', 'speed-delay']) {
      const described = fixture_read_input(dom, id).getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(dom.root.querySelector(`[id="${described}"]`)).not.toBeNull();
    }
  });

  it('네 슬라이더가 모두 aria-valuetext로 실제 값을 준다', () => {
    const { dom } = widget_build_mounted();
    const texts = ['speed-distance', 'speed-from', 'speed-to', 'speed-delay'].map(
      (id) => fixture_read_input(dom, id).getAttribute('aria-valuetext'),
    );
    // 거리는 인덱스 슬라이더다. 이것이 없으면 스크린리더가 "5"라고 읽는다.
    expect(texts[0]).toBe('10 km');
    expect(texts[1]).toBe('40 km/h');
    expect(texts[2]).toBe('60 km/h');
    expect(texts[3]).toBe('0 mins');
  });

  it('단위 토글이 라디오그룹이고 이름·설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    const group = dom.root.querySelector('.widget-toggle');
    expect(group.getAttribute('role')).toBe('radiogroup');
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      expect(dom.root.querySelector(`[id="${group.getAttribute(attribute)}"]`)).not.toBeNull();
    }
  });

  it('캔버스에 role=img와 요약 aria-label이 붙는다', () => {
    const { dom } = widget_build_mounted();
    const canvas = dom.root.querySelector('canvas');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('5.00');
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = widget_build_mounted();
    const outputs = dom.root.querySelectorAll('output');
    expect(outputs.length).toBe(4);
    for (const output of outputs) expect(output.getAttribute('aria-live')).toBe('off');
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = widget_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });
});

// ── 종속 슬라이더 ───────────────────────────────────────────

describe('종속 슬라이더 v₂', () => {
  it('v₁이 v₂를 추월하면 v₂의 min과 value가 함께 밀린다', () => {
    const { dom } = widget_build_mounted();
    const from = fixture_read_input(dom, 'speed-from');
    const to = fixture_read_input(dom, 'speed-to');
    expect(to.value).toBe('60');

    from.value = '100';
    dom.listeners_run_event(from, 'change');

    const range = model_calculate_speed_range(UNIT_KMH);
    expect(to.min).toBe(String(100 + range.gap));
    expect(Number(to.value)).toBeGreaterThanOrEqual(100 + range.gap);
    // 손잡이가 가리키는 값과 계산에 쓰인 값이 같아야 한다.
    const expected = model_calculate_result(
      10 * METRES_PER_KILOMETRE,
      100 * SPEED_UNITS[UNIT_KMH].msPerSpeed,
      Number(to.value) * SPEED_UNITS[UNIT_KMH].msPerSpeed,
      0,
    );
    expect(fixture_read_card_values(dom)[0]).toBe(
      display_format_minutes(expected.savedSeconds / SECONDS_PER_MINUTE),
    );
  });

  it('드래그 중(input)에도 바닥이 즉시 따라간다 — 디바운스 뒤로 미루지 않는다', () => {
    const { dom } = widget_build_mounted();
    const from = fixture_read_input(dom, 'speed-from');
    const to = fixture_read_input(dom, 'speed-to');
    from.value = '140';
    dom.listeners_run_event(from, 'input');
    // 타이머를 흘려보내기 **전에** 이미 맞아 있어야 한다.
    expect(to.min).toBe('145');
    expect(Number(to.value)).toBeGreaterThanOrEqual(145);
    dom.timers_run_pending();
    expect(Number(to.value)).toBeGreaterThanOrEqual(145);
  });

  it('v₁을 내리면 v₂는 그대로 두고 바닥만 내려간다', () => {
    const { dom } = widget_build_mounted();
    const from = fixture_read_input(dom, 'speed-from');
    const to = fixture_read_input(dom, 'speed-to');
    from.value = '20';
    dom.listeners_run_event(from, 'change');
    expect(to.min).toBe('25');
    expect(to.value).toBe('60');
  });

  it('v₁을 상한까지 밀어도 v₂가 갈 자리가 남는다', () => {
    const { dom } = widget_build_mounted();
    const from = fixture_read_input(dom, 'speed-from');
    const to = fixture_read_input(dom, 'speed-to');
    from.value = from.max;
    dom.listeners_run_event(from, 'change');
    expect(Number(to.min)).toBeLessThanOrEqual(Number(to.max));
    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBeTruthy();
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('거리를 바꾸면 카드가 비례해서 따라간다', () => {
    const { dom } = widget_build_mounted();
    const distance = fixture_read_input(dom, 'speed-distance');
    distance.value = String(DISTANCE_LADDER.indexOf(100));
    dom.listeners_run_event(distance, 'change');
    // 10 km에서 5.00분이면 100 km에서는 50.0분이다.
    expect(fixture_read_card_values(dom)[0]).toBe('50.0');
    expect(fixture_read_input(dom, 'speed-distance').getAttribute('aria-valuetext')).toBe('100 km');
    expect(dom.urlsWritten.at(-1)).toContain('d=100');
  });

  it('고정 지연은 절약 분을 건드리지 않고 비율만 내린다', () => {
    const { dom } = widget_build_mounted();
    const delay = fixture_read_input(dom, 'speed-delay');
    delay.value = '6';
    dom.listeners_run_event(delay, 'change');
    const values = fixture_read_card_values(dom);
    expect(values[0]).toBe('5.00');
    expect(values[1]).toBe('23.8');
    expect(values[2]).toBe('21.0');
    expect(values[3]).toBe('16.0');
    // 천장은 이동 시간이므로 지연과 무관하다.
    expect(values[4]).toBe('15.0');
  });

  it('지연을 넣으면 두 막대에 같은 크기의 고정 칸이 생긴다', () => {
    const { dom } = widget_build_mounted();
    const delay = fixture_read_input(dom, 'speed-delay');
    delay.value = '6';
    dom.listeners_run_event(delay, 'change');
    const fills = dom.root.querySelectorAll('.bar-fill');
    // 축은 21분이고 고정 지연은 6분 — 두 막대에서 같은 폭이어야 한다.
    expect(fills[1].style.width).toBe(fills[3].style.width);
    expect(Number.parseFloat(fills[1].style.width)).toBeCloseTo((6 / 21) * 100, 6);
  });

  it('프리셋 버튼이 상태를 통째로 갈아 끼운다', () => {
    const { dom } = widget_build_mounted();
    const button = dom.root.querySelectorAll('.widget-preset')[1];
    dom.listeners_run_event(button, 'click');
    expect(fixture_read_input(dom, 'speed-distance').getAttribute('aria-valuetext')).toBe('5 km');
    expect(fixture_read_input(dom, 'speed-from').value).toBe('30');
    expect(fixture_read_input(dom, 'speed-to').value).toBe('50');
    expect(fixture_read_input(dom, 'speed-delay').value).toBe('6');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(dom.root.querySelectorAll('.widget-preset')[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('단위 토글은 눈금과 라벨만 바꾼다 — 트립은 SI로 정확히 그대로다', () => {
    const { dom } = widget_build_mounted();
    // URL은 항상 km/h로 쓰이므로(단위와 무관), 토글 전후로 그 값 자체가
    // **정확히** 같아야 한다 — "거의 비슷하다"가 아니라 "바뀌지 않았다".
    const before = new URLSearchParams(dom.urlsWritten.at(-1));

    dom.listeners_run_event(fixture_read_input(dom, 'speed-unit-mph'), 'change');

    const range = model_calculate_speed_range(UNIT_MPH);
    expect(fixture_read_input(dom, 'speed-from').max).toBe(String(range.fromMax));
    expect(fixture_read_input(dom, 'speed-from').getAttribute('aria-valuetext')).toContain('mph');
    expect(fixture_read_input(dom, 'speed-distance').getAttribute('aria-valuetext')).toContain('mi');
    const after = new URLSearchParams(dom.urlsWritten.at(-1));
    expect(after.get('d')).toBe(before.get('d'));
    expect(after.get('v1')).toBe(before.get('v1'));
    expect(after.get('v2')).toBe(before.get('v2'));
    expect(after.get('u')).toBe('mph');
    // 프리셋 라벨도 새 단위로 다시 쓰인다.
    expect(dom.root.querySelectorAll('.widget-preset')[0].textContent).toContain('mi');
  });

  /**
   * 치명 결함 재현: km→mi→km처럼 단위를 오가면 트립(SI 값)이 조용히 달라졌다.
   * 원인은 `widget_update`가 `next`로 캐노니컬 값을 받은 뒤에도 방금 눈금에 맞춰
   * 반올림해 그린 슬라이더 손잡이를 다시 읽어 state에 되먹였기 때문이다.
   * URL은 언제나 km/h로 적히므로(표시 단위와 무관) 왕복 전후로 완전히 같은
   * 문자열이어야 한다 — 사다리 최솟값을 포함해 여러 값에서, 여러 번 왕복해서 본다.
   */
  it('단위를 여러 번 왕복해도 거리·속도의 SI 값은 왕복 손실 없이 그대로다', () => {
    const distanceIndexesToCheck = [DISTANCE_INDEX_MIN, 5, DISTANCE_INDEX_MAX];
    for (const distanceIndex of distanceIndexesToCheck) {
      const { dom } = widget_build_mounted();
      const distance = fixture_read_input(dom, 'speed-distance');
      const from = fixture_read_input(dom, 'speed-from');
      const to = fixture_read_input(dom, 'speed-to');

      distance.value = String(distanceIndex);
      dom.listeners_run_event(distance, 'change');
      // 속도 슬라이더도 각자의 최솟값에 놓고 본다 — 바닥에서 반올림이 가장 잘 드러난다.
      from.value = from.min;
      dom.listeners_run_event(from, 'change');
      to.value = to.min;
      dom.listeners_run_event(to, 'change');

      const canonical = new URLSearchParams(dom.urlsWritten.at(-1));

      // km → mi → km → mi → km, 네 번 왕복.
      const toggleSequence = ['speed-unit-mph', 'speed-unit-kmh', 'speed-unit-mph', 'speed-unit-kmh'];
      for (const id of toggleSequence) {
        dom.listeners_run_event(fixture_read_input(dom, id), 'change');
        const roundTripped = new URLSearchParams(dom.urlsWritten.at(-1));
        expect(roundTripped.get('d')).toBe(canonical.get('d'));
        expect(roundTripped.get('v1')).toBe(canonical.get('v1'));
        expect(roundTripped.get('v2')).toBe(canonical.get('v2'));
      }
      openDom.restore();
      openDom = null;
    }
  });

  it('mph로 바꿔도 슬라이더가 자기 범위 밖을 가리키지 않는다', () => {
    // 새 눈금 위로 **반올림만** 하면 손잡이가 범위를 넘는다:
    //   160 km/h = 99.42 mph → 반올림 100 > 상한 95
    //    20 km/h = 12.43 mph → 반올림  10 < 하한 15
    // 두 끝을 다 밟아 본다.
    for (const end of ['max', 'min']) {
      const { dom } = widget_build_mounted();
      const from = fixture_read_input(dom, 'speed-from');
      const to = fixture_read_input(dom, 'speed-to');
      from.value = from[end];
      dom.listeners_run_event(from, 'change');
      to.value = end === 'max' ? to.max : to.min;
      dom.listeners_run_event(to, 'change');

      dom.listeners_run_event(fixture_read_input(dom, 'speed-unit-mph'), 'change');
      for (const input of [from, to]) {
        expect(Number(input.value)).toBeLessThanOrEqual(Number(input.max));
        expect(Number(input.value)).toBeGreaterThanOrEqual(Number(input.min));
      }
      openDom.restore();
      openDom = null;
    }
  });

  it('mph 표는 mph 증분으로 다시 그려진다', () => {
    const { dom } = widget_build_mounted();
    dom.listeners_run_event(fixture_read_input(dom, 'speed-unit-mph'), 'change');
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(SPEED_UNITS[UNIT_MPH].tableStarts.length);
    expect(rows[0].textContent).toContain('mph');
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const delay = fixture_read_input(dom, 'speed-delay');
    const before = dom.urlsWritten.length;

    delay.value = '4';
    dom.listeners_run_event(delay, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    delay.value = '5';
    dom.listeners_run_event(delay, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('공유된 링크가 같은 화면을 연다', () => {
    const { dom } = widget_build_mounted({ search: '?d=300&v1=110&v2=130&t=0&u=kmh' });
    expect(fixture_read_input(dom, 'speed-distance').getAttribute('aria-valuetext')).toBe('300 km');
    expect(fixture_read_input(dom, 'speed-from').value).toBe('110');
    expect(fixture_read_input(dom, 'speed-to').value).toBe('130');
    const expected = model_calculate_result(
      300 * METRES_PER_KILOMETRE,
      110 * SPEED_UNITS[UNIT_KMH].msPerSpeed,
      130 * SPEED_UNITS[UNIT_KMH].msPerSpeed,
      0,
    );
    expect(fixture_read_card_values(dom)[0]).toBe(
      display_format_minutes(expected.savedSeconds / SECONDS_PER_MINUTE),
    );
  });
});
