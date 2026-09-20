/**
 * 샤워 vs 욕조 — 위젯 테스트
 *
 * 순수 헬퍼(URL 상태·표시 문자열·축)와, DOM 스텁 위에서만 드러나는 것
 * (리스너 수명·프리셋·비용 패널·접근성 속성)을 함께 본다.
 *
 * **소스 문자열을 훑지 않는다.** 실제로 마운트해서 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  SHOWER_FLOW_DEFAULT_LPM,
  SHOWER_FLOW_MIN_LPM,
  SHOWER_FLOW_MAX_LPM,
  SHOWER_MINUTES_DEFAULT,
  SHOWER_MINUTES_MAX,
  BATH_LITRES_DEFAULT,
  BATH_LITRES_MAX,
  RISE_SHOWER_DEFAULT_K,
  RISE_BATH_DEFAULT_K,
  RISE_MAX_K,
  SHOWER_FLOW_PRESETS,
  SHOWER_SITUATION_PRESETS,
  TABLE_FLOWS_LPM,
  model_calculate_result,
} from './model.js';
import {
  widget_mount,
  url_read_state,
  state_pick_matching_flow,
  state_pick_matching_situation,
  display_format_minutes,
  display_format_gap,
  display_format_litres,
  display_format_kwh,
  display_format_signed,
  display_format_cost,
  display_format_axis,
  display_describe_verdict,
  chart_calculate_x_max,
  chart_calculate_y_max,
  chart_render_panel,
  chart_describe_panel,
  CAPTION_AXIS_PRECISION_DIVISOR,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 5개 × (input, change) = 10 + 단가 입력 2 + 유량 프리셋 3 + 상황 프리셋 3
 * + window resize 1 = 19
 */
const WIDGET_LISTENER_COUNT = 19;
/** 조작부 개수. range 5개 + 단가 text 1개. */
const WIDGET_INPUT_COUNT = 6;
/** 단가를 비웠을 때의 카드 수. 비용 카드 두 장은 여기 없다. */
const READOUT_COUNT_WITHOUT_PRICE = 4;
const READOUT_COUNT_WITH_PRICE = 6;

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

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 로드된다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      flow: SHOWER_FLOW_DEFAULT_LPM,
      minutes: SHOWER_MINUTES_DEFAULT,
      bathLitres: BATH_LITRES_DEFAULT,
      riseShower: RISE_SHOWER_DEFAULT_K,
      riseBath: RISE_BATH_DEFAULT_K,
      price: null,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16, `Number('abc')`는 NaN이다.
    const state = url_read_state('?q=&t=0x10&v=abc&ds=1e2&db= ');
    expect(state.flow).toBe(SHOWER_FLOW_DEFAULT_LPM);
    expect(state.minutes).toBe(SHOWER_MINUTES_DEFAULT);
    expect(state.bathLitres).toBe(BATH_LITRES_DEFAULT);
    expect(state.riseShower).toBe(RISE_SHOWER_DEFAULT_K);
    expect(state.riseBath).toBe(RISE_BATH_DEFAULT_K);
    // 최솟값으로 떨어졌다면 이 단언들이 깨진다.
    expect(state.flow).not.toBe(SHOWER_FLOW_MIN_LPM);
    expect(state.minutes).not.toBe(0);
  });

  it('단가는 깨졌거나 비었으면 null이다 — 0이 아니다', () => {
    expect(url_read_state('?p=').price).toBeNull();
    expect(url_read_state('?p=0x10').price).toBeNull();
    expect(url_read_state('?p=abc').price).toBeNull();
    expect(url_read_state('?p=0.28').price).toBe(0.28);
    expect(url_read_state('?p=0').price).toBe(0);
  });

  it('범위를 벗어난 값은 잘린다', () => {
    const state = url_read_state('?q=999&t=999&v=999&ds=999&db=-5');
    expect(state.flow).toBe(SHOWER_FLOW_MAX_LPM);
    expect(state.minutes).toBe(SHOWER_MINUTES_MAX);
    expect(state.bathLitres).toBe(BATH_LITRES_MAX);
    expect(state.riseShower).toBe(RISE_MAX_K);
  });

  it('링크가 그림을 되살린다 (왕복)', () => {
    const state = url_read_state('?q=7.57&t=12&v=150&ds=30&db=20&p=0.35');
    expect(state).toEqual({
      flow: 7.57, minutes: 12, bathLitres: 150, riseShower: 30, riseBath: 20, price: 0.35,
    });
  });

  it('프리셋 대조가 값에서만 나온다', () => {
    for (const preset of SHOWER_FLOW_PRESETS) {
      expect(state_pick_matching_flow(preset.flow)).toBe(preset.key);
    }
    expect(state_pick_matching_flow(9.5)).toBeNull();
    for (const preset of SHOWER_SITUATION_PRESETS) {
      expect(state_pick_matching_situation(preset.state)).toBe(preset.key);
    }
    expect(state_pick_matching_situation({ ...SHOWER_SITUATION_PRESETS[0].state, minutes: 9 })).toBeNull();
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('정의되지 않은 값은 대시로 찍는다 — NaN을 화면에 내지 않는다', () => {
    expect(display_format_minutes(Number.NaN)).toBe('—');
    expect(display_format_minutes(Number.POSITIVE_INFINITY)).toBe('—');
    expect(display_format_litres(Number.NaN)).toBe('—');
    expect(display_format_kwh(Number.NaN)).toBe('—');
    expect(display_format_cost(null)).toBe('—');
  });

  it('1분 아래에서는 자릿수를 늘린다 — 0.34와 0.44가 뭉개지지 않게', () => {
    expect(display_format_minutes(8.4567)).toBe('8.5');
    expect(display_format_minutes(0.34)).toBe('0.34');
    expect(display_format_minutes(0.44)).toBe('0.44');
  });

  it('1분 미만의 간격은 초로 읽어 준다', () => {
    expect(display_format_gap(0.6264)).toBe('38 s');
    expect(display_format_gap(-0.6264)).toBe('38 s');
    expect(display_format_gap(2.5)).toBe('2.5 min');
  });

  it('차이에 부호를 달고, 0에는 달지 않는다', () => {
    expect(display_format_signed(-4.32, display_format_litres)).toBe('−4.3');
    expect(display_format_signed(0.0603, display_format_kwh)).toBe('+0.060');
    expect(display_format_signed(0, display_format_litres)).toBe('0.0');
  });

  it('kWh는 1 아래에서 세 자리로 찍는다', () => {
    expect(display_format_kwh(2.3256)).toBe('2.33');
    expect(display_format_kwh(0.1256)).toBe('0.126');
  });

  it('축 라벨 자릿수는 눈금 간격의 정밀도로 정한다 (크기가 아니라)', () => {
    // 간격 2.5에서 7.5가 "8"로 찍히면 화면의 숫자가 실제 값과 달라진다.
    expect(display_format_axis(7.5, 2.5)).toBe('7.5');
    expect(display_format_axis(20, 5)).toBe('20');
    expect(display_format_axis(0.25, 0.05)).toBe('0.25');
  });
});

// ── 판정 문장 ───────────────────────────────────────────────

describe('판정 문장 — 주어는 모델이고, 권고를 하지 않는다', () => {
  const cases = [
    [9.46, 8, 80, 27, 25],   // 두 시점 사이 — break
    [9.46, 2, 80, 27, 25],   // 사이 밖 — edge
    [9.5, 8, 80, 25, 25],    // 겹침 — hold
    [4, 25, 200, 10, 45],
    [20, 0, 40, 45, 10],
  ];

  it('설정마다 세 상태 중 하나를 낸다', () => {
    const seen = new Set();
    for (const args of cases) seen.add(display_describe_verdict(model_calculate_result(...args)).verdict);
    expect([...seen].sort()).toEqual(['break', 'edge', 'hold']);
  });

  it('권고·단정 표현이 없다', () => {
    for (const args of cases) {
      const spoken = display_describe_verdict(model_calculate_result(...args));
      const sentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
      for (const banned of [
        'you should', 'we recommend', 'in reality', 'is better', 'best', 'save water',
        'shorter shower', 'take a', 'proves', 'always',
      ]) {
        expect(sentence).not.toContain(banned);
      }
      expect(sentence).toContain('the model');
    }
  });

  it('겹칠 때는 한 숫자를, 갈릴 때는 간격을 인용한다', () => {
    const merged = display_describe_verdict(model_calculate_result(9.5, 8, 80, 25, 25));
    expect(merged.verdict).toBe('hold');
    expect(merged.headline).toContain('same minute');
    expect(merged.headline).toContain('8.4');

    const split = display_describe_verdict(model_calculate_result(9.46, 8, 80, 27, 25));
    expect(split.verdict).toBe('break');
    expect(split.headline).toContain('less water');
    expect(split.headline).toContain('more energy');
    expect(split.detail).toContain('8.5');
    expect(split.detail).toContain('7.8');
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('축 — 두 패널이 같은 x축을 쓴다', () => {
  it('x축이 두 교차 시점과 현재 시간을 전부 담는다', () => {
    const result = model_calculate_result(9.46, 8, 80, 27, 25);
    const xMax = chart_calculate_x_max(result);
    expect(xMax).toBeGreaterThan(result.waterCrossoverMinutes);
    expect(xMax).toBeGreaterThan(result.energyCrossoverMinutes);
    expect(xMax).toBeGreaterThan(result.minutes);
  });

  it('0분에서도 축 폭이 0이 되지 않는다 — 좌표가 NaN이 되면 아무것도 안 그려진다', () => {
    const result = model_calculate_result(20, 0, 40, 45, 45);
    expect(chart_calculate_x_max(result)).toBeGreaterThan(0);
    expect(chart_calculate_y_max(result.kwhPerMinute, result.bathKwh, chart_calculate_x_max(result), 0.05))
      .toBeGreaterThan(0);
  });

  it('y축이 데이터에 맞춰 커진다 (고정 범위가 아니다)', () => {
    const small = model_calculate_result(4, 8, 40, 10, 10);
    const large = model_calculate_result(20, 8, 200, 45, 45);
    const smallY = chart_calculate_y_max(small.kwhPerMinute, small.bathKwh, chart_calculate_x_max(small), 0.05);
    const largeY = chart_calculate_y_max(large.kwhPerMinute, large.bathKwh, chart_calculate_x_max(large), 0.05);
    expect(largeY).toBeGreaterThan(smallY * 2);
  });

  it('캡션은 렌더가 실제로 쓴 축만 인용한다', () => {
    const dom = fixture_create_dom({ width: 720 });
    openDom = dom;
    dom.install();
    const canvasEl = dom.document.createElement('canvas');
    const panel = {
      ratePerMinute: 9.46, flatValue: 80, crossoverMinutes: 8.4567,
      bandFromMinutes: 8.4567, bandToMinutes: 7.8302, nowMinutes: 8,
      xMax: 9.725, yMax: 99.4, titleY: 'Water, litres',
    };
    const drawn = chart_render_panel(canvasEl, panel);
    expect(drawn.xMax).toBe(panel.xMax);
    expect(drawn.yMax).toBe(panel.yMax);
    const caption = chart_describe_panel('Water panel', drawn, panel, display_format_litres);
    expect(caption).toContain(display_format_axis(drawn.xMax, drawn.xStep / CAPTION_AXIS_PRECISION_DIVISOR));
    // 눈금 정밀도로만 적으면 3.12짜리 축이 캡션에서 '3'이 된다.
    expect(caption).toContain(display_format_axis(drawn.yMax, drawn.yStep / CAPTION_AXIS_PRECISION_DIVISOR));
    expect(caption).toContain('8.5');
    // 축 제목이 실제로 캔버스에 찍힌다.
    const texts = canvasEl.context.texts.map((entry) => entry.text);
    expect(texts).toContain('Water, litres');
    expect(texts).toContain('Minutes of shower (linear)');
  });

  it('폭이 0이면 그리지 않고, 캡션이 그렇게 적는다', () => {
    const dom = fixture_create_dom({ width: 0 });
    openDom = dom;
    dom.install();
    const canvasEl = dom.document.createElement('canvas');
    expect(chart_render_panel(canvasEl, { xMax: 10, yMax: 10, ratePerMinute: 1, flatValue: 5, crossoverMinutes: 5, nowMinutes: 1, titleY: 'y' })).toBeNull();
    expect(chart_describe_panel('Water panel', null, {}, display_format_litres)).toContain('no width');
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명 — 실제로 붙였다 뗀다', () => {
  it('붙는 리스너는 정확히 19개다', () => {
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

  it('reset 뒤 타이머 잔여가 0이다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const slider = dom.root.querySelector('input');
    expect(dom.listeners_run_event(slider, 'input')).toBe(1);
    expect(dom.timers_read_pending()).toBe(1);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
    expect(dom.frames_read_pending()).toBe(0);
  });

  it('resize 타이머도 reset이 끊는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(1);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('같은 자리에 두 번 붙지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.listeners_read_added();
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(before);
  });

  it('뗀 뒤에는 슬라이더를 움직여도 아무 일도 일어나지 않는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const slider = dom.root.querySelector('input');
    widget_reset();
    expect(dom.listeners_run_event(slider, 'input')).toBe(0);
    expect(dom.timers_read_pending()).toBe(0);
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더 — 값이 채워진 채로 뜬다', () => {
  it('슬라이더 5개 + 단가 입력 1개, 프리셋 버튼 6개', () => {
    const { dom } = widget_build_mounted();
    const inputs = dom.root.querySelectorAll('input');
    expect(inputs.length).toBe(WIDGET_INPUT_COUNT);
    expect(inputs.filter((input) => input.type === 'range').length).toBe(5);
    expect(dom.root.querySelectorAll('button').length).toBe(
      SHOWER_FLOW_PRESETS.length + SHOWER_SITUATION_PRESETS.length,
    );
  });

  it('패널이 두 개이고 둘 다 요약 aria-label을 든다', () => {
    const { dom } = widget_build_mounted();
    const canvases = dom.root.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);
    for (const canvasEl of canvases) {
      expect(canvasEl.getAttribute('role')).toBe('img');
      expect(canvasEl.getAttribute('aria-label').length).toBeGreaterThan(40);
    }
    expect(canvases[0].getAttribute('aria-label')).toContain('Water panel');
    expect(canvases[1].getAttribute('aria-label')).toContain('Energy panel');
  });

  it('두 패널이 같은 x축 범위를 인용한다', () => {
    const { dom } = widget_build_mounted();
    const result = model_calculate_result(
      SHOWER_FLOW_DEFAULT_LPM, SHOWER_MINUTES_DEFAULT, BATH_LITRES_DEFAULT,
      RISE_SHOWER_DEFAULT_K, RISE_BATH_DEFAULT_K,
    );
    const xText = display_format_axis(chart_calculate_x_max(result), 2 / CAPTION_AXIS_PRECISION_DIVISOR);
    for (const canvasEl of dom.root.querySelectorAll('canvas')) {
      expect(canvasEl.getAttribute('aria-label')).toContain(`0 to ${xText} minutes`);
    }
  });

  it('기본 설정이 break 판정으로 로드된다 (8분이 7.8과 8.4 사이)', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('break');
    expect(verdict.textContent).toContain('disagree');
  });

  it('요약 카드 네 장이 값을 든 채로 뜬다', () => {
    const { dom } = widget_build_mounted();
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values.length).toBe(READOUT_COUNT_WITHOUT_PRICE);
    expect(values[0]).toBe('8.4');
    expect(values[1]).toBe('7.8');
    expect(values[2]).toBe('−4.0');
    expect(values[3]).toBe('+0.060');
  });

  it('민감도 표가 5행으로 채워지고 현재 유량 행이 표시된다', () => {
    const { dom } = widget_build_mounted({ search: '?q=9.46' });
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(TABLE_FLOWS_LPM.length);
    expect(rows[0].textContent).toContain('6.00');
    expect(rows[2].textContent).toContain('8.5');
    expect(rows.filter((row) => row.getAttribute('aria-current') === 'true').length).toBe(1);
    expect(rows[2].getAttribute('aria-current')).toBe('true');
    // 실제로 행이 강조됐을 때만 그렇게 말한다.
    const note = dom.root.querySelectorAll('.legend-note').at(-1).textContent;
    expect(note).toContain('is marked');
  });

  it('유량이 두 표 행 사이에 있으면 어느 행도 강조되지 않고, 문장이 그렇게 적는다', () => {
    // 10 L/min은 표의 9.46과 12 사이다 — 어느 값과도 반 눈금 이내로 맞지 않는다.
    const { dom } = widget_build_mounted({ search: '?q=10' });
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.filter((row) => row.getAttribute('aria-current') === 'true').length).toBe(0);
    const note = dom.root.querySelectorAll('.legend-note').at(-1).textContent;
    expect(note).not.toContain('The row matching the flow slider is marked');
    expect(note).toContain('none is marked');
  });

  it('로드하자마자 주소창에 상태가 실린다 — 링크 공유가 살아 있다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.urlsWritten.length).toBeGreaterThan(0);
    const written = dom.urlsWritten.at(-1);
    for (const key of ['q=', 't=', 'v=', 'ds=', 'db=', 'p=']) expect(written).toContain(key);
  });
});

// ── 비용 패널 ───────────────────────────────────────────────

describe('비용 패널 — 단가를 비우면 뜨지 않는다', () => {
  it('단가가 없으면 카드가 네 장이다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('.readout').length).toBe(READOUT_COUNT_WITHOUT_PRICE);
    expect(dom.root.textContent).not.toContain('Bath — energy cost');
    expect(dom.root.querySelector('.widget-price').value).toBe('');
  });

  it('단가를 넣으면 카드가 두 장 늘고 값이 곱해진다', () => {
    const { dom } = widget_build_mounted({ search: '?p=0.28' });
    expect(dom.root.querySelectorAll('.readout').length).toBe(READOUT_COUNT_WITH_PRICE);
    expect(dom.root.textContent).toContain('Bath — energy cost');
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    const result = model_calculate_result(
      SHOWER_FLOW_DEFAULT_LPM, SHOWER_MINUTES_DEFAULT, BATH_LITRES_DEFAULT,
      RISE_SHOWER_DEFAULT_K, RISE_BATH_DEFAULT_K,
    );
    expect(values[4]).toBe((result.showerKwh * 0.28).toFixed(2));
    expect(values[5]).toBe((result.bathKwh * 0.28).toFixed(2));
  });

  it('단가를 지우면 카드 두 장이 다시 사라진다', () => {
    const { dom } = widget_build_mounted({ search: '?p=0.28' });
    const priceInput = dom.root.querySelector('.widget-price');
    priceInput.value = '';
    dom.listeners_run_event(priceInput, 'change');
    expect(dom.root.querySelectorAll('.readout').length).toBe(READOUT_COUNT_WITHOUT_PRICE);
    expect(dom.root.textContent).not.toContain('Bath — energy cost');
  });

  it('깨진 단가는 0이 아니라 비어 있는 것으로 본다', () => {
    const { dom } = widget_build_mounted();
    const priceInput = dom.root.querySelector('.widget-price');
    priceInput.value = '0x10';
    dom.listeners_run_event(priceInput, 'change');
    expect(dom.root.querySelectorAll('.readout').length).toBe(READOUT_COUNT_WITHOUT_PRICE);
    // 0은 유효한 단가다 — 비어 있는 것과 다르다.
    priceInput.value = '0';
    dom.listeners_run_event(priceInput, 'change');
    expect(dom.root.querySelectorAll('.readout').length).toBe(READOUT_COUNT_WITH_PRICE);
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('모든 조작부가 자기 설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    const inputs = dom.root.querySelectorAll('input');
    expect(inputs.length).toBe(WIDGET_INPUT_COUNT);
    for (const input of inputs) {
      const described = input.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      const hint = dom.root.querySelector(`[id="${described}"]`);
      expect(hint).not.toBeNull();
      expect(hint.textContent.length).toBeGreaterThan(20);
    }
  });

  it('슬라이더가 aria-valuetext로 단위를 붙여 읽힌다', () => {
    const { dom } = widget_build_mounted();
    const texts = dom.root
      .querySelectorAll('input')
      .map((input) => input.getAttribute('aria-valuetext'))
      .filter(Boolean);
    expect(texts.length).toBe(5);
    expect(texts).toContain('9.50 litres per minute');
    expect(texts).toContain('27 kelvin rise');
    expect(texts).toContain('25 kelvin rise');
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = widget_build_mounted();
    const outputs = dom.root.querySelectorAll('output');
    expect(outputs.length).toBe(5);
    for (const output of outputs) expect(output.getAttribute('aria-live')).toBe('off');
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = widget_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });

  it('두 프리셋 묶음이 각자 이름을 든다', () => {
    const { dom } = widget_build_mounted();
    const groups = dom.root.querySelectorAll('.widget-presets');
    expect(groups.length).toBe(2);
    for (const group of groups) {
      expect(group.getAttribute('role')).toBe('group');
      expect(group.getAttribute('aria-label')).toBeTruthy();
    }
    expect(groups[0].getAttribute('aria-label')).toContain('standards');
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작 — 프리셋과 슬라이더', () => {
  it('유량 프리셋이 규격값을 그대로 싣는다 (눈금에 스냅되지 않는다)', () => {
    const { dom } = widget_build_mounted();
    for (const preset of SHOWER_FLOW_PRESETS) {
      dom.listeners_run_event(dom.root.querySelector(`[data-preset="${preset.key}"]`), 'click');
      expect(Number(dom.root.querySelectorAll('input')[0].value)).toBe(preset.flow);
      expect(dom.urlsWritten.at(-1)).toContain(`q=${preset.flow}`);
    }
  });

  it('유량 프리셋을 누르면 그 버튼만 눌린 상태가 된다', () => {
    const { dom } = widget_build_mounted();
    dom.listeners_run_event(dom.root.querySelector('[data-preset="epca"]'), 'click');
    expect(dom.root.querySelector('[data-preset="epca"]').getAttribute('aria-pressed')).toBe('true');
    expect(dom.root.querySelector('[data-preset="watersense"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('유량 프리셋은 다른 슬라이더를 건드리지 않는다', () => {
    const { dom } = widget_build_mounted({ search: '?t=12&v=150&ds=30&db=20' });
    dom.listeners_run_event(dom.root.querySelector('[data-preset="ecolabel"]'), 'click');
    const inputs = dom.root.querySelectorAll('input');
    expect(Number(inputs[1].value)).toBe(12);
    expect(Number(inputs[2].value)).toBe(150);
    expect(Number(inputs[3].value)).toBe(30);
    expect(Number(inputs[4].value)).toBe(20);
  });

  it('상황 프리셋은 슬라이더 다섯 개를 통째로 갈아끼운다', () => {
    const { dom } = widget_build_mounted();
    dom.listeners_run_event(dom.root.querySelector('[data-preset="long-soak"]'), 'click');
    const expected = SHOWER_SITUATION_PRESETS.find((preset) => preset.key === 'long-soak').state;
    const inputs = dom.root.querySelectorAll('input');
    expect(Number(inputs[0].value)).toBe(expected.flow);
    expect(Number(inputs[1].value)).toBe(expected.minutes);
    expect(Number(inputs[2].value)).toBe(expected.bathLitres);
    expect(Number(inputs[3].value)).toBe(expected.riseShower);
    expect(Number(inputs[4].value)).toBe(expected.riseBath);
  });

  it('두 상승폭이 같아지면 판정이 hold로 바뀌고 캡션이 겹침을 적는다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBe('break');
    dom.listeners_run_event(dom.root.querySelector('[data-preset="equal-rise"]'), 'click');
    expect(dom.root.querySelector('.verdict').getAttribute('data-state')).toBe('hold');
    const note = dom.root.querySelectorAll('.legend-note')[0].textContent;
    expect(note).toContain('same minute');
    expect(note).toContain('on top of each other');
    // 두 카드가 같은 숫자를 든다.
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(values[1]);
  });

  it('상승폭이 갈리면 캡션이 간격을 적는다', () => {
    const { dom } = widget_build_mounted();
    const note = dom.root.querySelectorAll('.legend-note')[0].textContent;
    expect(note).toContain('apart');
    expect(note).toContain('shaded band');
  });

  it('프리셋 한 번에 판정문이 한 번만 갈린다 (슬라이더마다 발화하지 않는다)', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.root.querySelector('[data-preset="quick-rinse"]'), 'click');
    expect(dom.urlsWritten.length).toBe(before + 1);
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const slider = dom.root.querySelectorAll('input')[1];
    const before = dom.urlsWritten.length;

    slider.value = '12';
    dom.listeners_run_event(slider, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    slider.value = '14';
    dom.listeners_run_event(slider, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('resize는 다시 그리기만 하고 상태를 다시 쓰지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });
});
