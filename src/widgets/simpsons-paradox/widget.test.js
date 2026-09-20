/**
 * 심슨의 역설 — 위젯 테스트
 *
 * 순수 헬퍼(URL 상태·표시 문자열·프리셋 대조)와, DOM 스텁 위에서만 드러나는 것
 * (리스너 수명·프리셋 버튼·접근성 속성)을 함께 본다.
 *
 * **소스 문자열을 훑지 않는다.** 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  SIMPSON_PRESET_DEFAULT,
  SIMPSON_PRESETS,
  SIMPSON_SIZE_MAX,
  SIMPSON_RATE_SLIDER_STEP,
  SIMPSON_CUSTOM_LABELS,
  model_calculate_preset_state,
  model_calculate_result,
} from './model.js';
import {
  PRESET_CUSTOM,
  widget_mount,
  url_read_state,
  state_pick_matching_preset,
  state_read_labels,
  display_format_percent,
  display_format_gap,
  display_format_share,
  display_check_bars_merged,
  display_describe_verdict,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 8개 × (input, change) = 16 + 프리셋 버튼 3개의 click = 19
 */
const WIDGET_LISTENER_COUNT = 19;

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
  it('파라미터가 없으면 기본 프리셋을 통째로 싣는다 (빈 폼 금지)', () => {
    const state = url_read_state('');
    expect(state.preset).toBe(SIMPSON_PRESET_DEFAULT);
    expect(state).toMatchObject(model_calculate_preset_state(SIMPSON_PRESET_DEFAULT));
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    const fallback = model_calculate_preset_state(SIMPSON_PRESET_DEFAULT);
    // `Number('')`는 0, `Number('0x10')`은 16이다 — 정규식이 없으면 둘 다 통과한다.
    const state = url_read_state('?a1n=&a2n=0x10&b1n=abc&a1p=&b2p=1e2');
    expect(state.sizeA1).toBe(fallback.sizeA1);
    expect(state.sizeA2).toBe(fallback.sizeA2);
    expect(state.sizeB1).toBe(fallback.sizeB1);
    expect(state.rateA1).toBe(fallback.rateA1);
    expect(state.rateB2).toBe(fallback.rateB2);
  });

  it('범위를 벗어난 값은 잘린다', () => {
    const state = url_read_state('?a1n=99999&a1p=3&b1n=1&b1p=0');
    expect(state.sizeA1).toBe(SIMPSON_SIZE_MAX);
    expect(state.rateA1).toBe(1);
    expect(state.rateB1).toBe(0);
  });

  it('URL이 프리셋 이름을 주장해도 숫자와 대조해 다시 정한다', () => {
    // 숫자는 Berkeley인데 이름만 kidney라고 적힌 링크.
    const berkeley = model_calculate_preset_state('berkeley');
    const query = new URLSearchParams({
      preset: 'kidney',
      a1n: berkeley.sizeA1, a1p: berkeley.rateA1.toFixed(6),
      a2n: berkeley.sizeA2, a2p: berkeley.rateA2.toFixed(6),
      b1n: berkeley.sizeB1, b1p: berkeley.rateB1.toFixed(6),
      b2n: berkeley.sizeB2, b2p: berkeley.rateB2.toFixed(6),
    });
    expect(url_read_state(`?${query}`).preset).toBe('berkeley');
  });

  it('어느 프리셋과도 다르면 custom이다', () => {
    const state = url_read_state('?a1n=10&a1p=0.5&a2n=10&a2p=0.5&b1n=10&b1p=0.4&b2n=10&b2p=0.4');
    expect(state.preset).toBe(PRESET_CUSTOM);
  });

  it('프리셋 상태는 자기 자신으로 되돌아온다 (왕복)', () => {
    for (const preset of SIMPSON_PRESETS) {
      expect(state_pick_matching_preset(model_calculate_preset_state(preset.key))).toBe(preset.key);
    }
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('정의되지 않은 비율은 대시로 찍는다 — NaN%를 화면에 내지 않는다', () => {
    expect(display_format_percent(null)).toBe('—');
    expect(display_format_percent(Number.NaN)).toBe('—');
    expect(display_format_gap(null)).toBe('—');
  });

  it('격차는 부호를 달고, 0에는 부호를 달지 않는다', () => {
    expect(display_format_gap(0.1234)).toBe('+12.3 pp');
    expect(display_format_gap(-0.1234)).toBe('−12.3 pp');
    expect(display_format_gap(0)).toBe('0.0 pp');
  });

  it('건수는 천 단위로 끊는다', () => {
    expect(display_format_share(534, 1198)).toBe('534 of 1,198');
  });

  it('막대가 붙어 구분 불가일 때만 그렇게 판정한다', () => {
    const near = model_calculate_result({
      sizeA1: 100, rateA1: 0.5, sizeA2: 100, rateA2: 0.5,
      sizeB1: 100, rateB1: 0.501, sizeB2: 100, rateB2: 0.501,
    });
    expect(display_check_bars_merged(near)).toBe(true);

    const far = model_calculate_result(model_calculate_preset_state('berkeley'));
    expect(display_check_bars_merged(far)).toBe(false);
  });

  it('판정 문장이 프리셋의 실제 이름을 쓴다', () => {
    const state = model_calculate_preset_state('berkeley');
    const spoken = display_describe_verdict(model_calculate_result(state), state_read_labels('berkeley'));
    expect(spoken.badge).toBe('reversed');
    expect(spoken.detail).toContain('Department A');
    expect(spoken.detail).toContain('Women');
    expect(spoken.detail).toContain('Men');
  });

  it('그룹 안 한 칸이 0이면 "두 그룹이 엇갈린다"고 말하지 않는다 — 비교가 없다고 말한다', () => {
    // 그룹1의 A만 시도가 0이다. 그룹2는 A·B 둘 다 시도가 있고 승자가 갈린다.
    const state = {
      sizeA1: 0, rateA1: 0.5, sizeA2: 100, rateA2: 0.7,
      sizeB1: 50, rateB1: 0.4, sizeB2: 100, rateB2: 0.3,
    };
    const result = model_calculate_result(state);
    expect(result.leads[1]).toBeNull();
    expect(result.verdict).toBe('mixed');
    const spoken = display_describe_verdict(result, SIMPSON_CUSTOM_LABELS);
    expect(spoken.detail).not.toContain('do not agree on a winner');
    expect(spoken.detail).toContain('Group 1');
    expect(spoken.detail).toContain('no trials');
  });

  it('그룹 하나가 통째로 비어도(두 선택지 모두 0) 같은 원리로 적는다', () => {
    // 그룹1은 A·B 둘 다 시도가 0이다 — "한 옵션만 0"이 아니라 그룹 전체가 비었다.
    const state = {
      sizeA1: 0, rateA1: 0.5, sizeA2: 100, rateA2: 0.7,
      sizeB1: 0, rateB1: 0.4, sizeB2: 100, rateB2: 0.3,
    };
    const result = model_calculate_result(state);
    expect(result.leads[1]).toBeNull();
    expect(result.leads[2]).not.toBeNull();
    const spoken = display_describe_verdict(result, SIMPSON_CUSTOM_LABELS);
    expect(spoken.detail).not.toContain('do not agree on a winner');
    expect(spoken.detail).toContain('Group 1');
  });

  it('두 그룹 모두 비교가 없으면(각기 다른 칸이 0) 양쪽을 다 적는다', () => {
    // 그룹1은 A가, 그룹2는 B가 0이다 — 서로 다른 칸이 비어 둘 다 비교 불가.
    const state = {
      sizeA1: 0, rateA1: 0.5, sizeA2: 100, rateA2: 0.7,
      sizeB1: 50, rateB1: 0.4, sizeB2: 0, rateB2: 0.3,
    };
    const result = model_calculate_result(state);
    expect(result.leads[1]).toBeNull();
    expect(result.leads[2]).toBeNull();
    const spoken = display_describe_verdict(result, SIMPSON_CUSTOM_LABELS);
    expect(spoken.detail).not.toContain('do not agree on a winner');
    expect(spoken.detail).toContain('Group 1');
    expect(spoken.detail).toContain('Group 2');
    expect(spoken.detail).toContain('Neither');
  });

  it('판정 문장에 단정하는 표현이 없다 — 주어는 모델이다', () => {
    for (const preset of SIMPSON_PRESETS) {
      const state = model_calculate_preset_state(preset.key);
      const spoken = display_describe_verdict(model_calculate_result(state), state_read_labels(preset.key));
      const sentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
      for (const banned of ['in reality', 'you should', 'we recommend', 'is better', 'proves']) {
        expect(sentence).not.toContain(banned);
      }
    }
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

  it('reset이 예약된 타이머까지 끊는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const slider = dom.root.querySelector('input');
    expect(dom.listeners_run_event(slider, 'input')).toBe(1);
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
  it('슬라이더 8개와 프리셋 버튼 3개가 있다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('input').length).toBe(8);
    expect(dom.root.querySelectorAll('button').length).toBe(SIMPSON_PRESETS.length);
  });

  it('성공률 슬라이더에는 눈금이 없다 — 프리셋 값이 스냅되지 않게', () => {
    const { dom } = widget_build_mounted();
    const steps = dom.root.querySelectorAll('input').map((input) => input.step);
    expect(steps.filter((step) => step === SIMPSON_RATE_SLIDER_STEP).length).toBe(4);
  });

  it('막대 6개와 가중치 띠 2개가 그려진다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('.bar-fill').length).toBe(6);
    expect(dom.root.querySelectorAll('.strip-track').length).toBe(2);
  });

  it('기본 프리셋이 역전 배지를 띄운 채로 로드된다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('break');
    expect(verdict.textContent).toContain('Reversed');
  });

  it('막대 채움 폭이 실제 비율과 같다 (Berkeley 여성 학과 A = 82.4%)', () => {
    const { dom } = widget_build_mounted();
    const result = model_calculate_result(model_calculate_preset_state('berkeley'));
    const fills = dom.root.querySelectorAll('.bar-fill');
    // 순서: 그룹1 A, 그룹1 B, 그룹2 A, 그룹2 B, 합계 A, 합계 B
    expect(fills[1].style.width).toBe(`${result.options.b.groups[1].rate * 100}%`);
    expect(fills[4].style.width).toBe(`${result.options.a.pooledRate * 100}%`);
  });

  it('표가 세 줄(그룹1·그룹2·합계)로 채워진다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(3);
    expect(rows[2].textContent).toContain('Pooled');
  });

  it('로드하자마자 주소창에 상태가 실린다 — 링크 공유가 살아 있다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.urlsWritten.length).toBeGreaterThan(0);
    expect(dom.urlsWritten.at(-1)).toContain('preset=berkeley');
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('모든 슬라이더가 자기 설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    for (const input of dom.root.querySelectorAll('input')) {
      const described = input.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(dom.root.querySelector(`[id="${described}"]`)).not.toBeNull();
    }
  });

  it('비율 슬라이더가 aria-valuetext로 백분율을 준다 (0.824라고 읽히지 않게)', () => {
    const { dom } = widget_build_mounted();
    const texts = dom.root
      .querySelectorAll('input')
      .map((input) => input.getAttribute('aria-valuetext'))
      .filter(Boolean);
    expect(texts.length).toBe(4);
    expect(texts).toContain('82.4%');
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = widget_build_mounted();
    for (const output of dom.root.querySelectorAll('output')) {
      expect(output.getAttribute('aria-live')).toBe('off');
    }
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = widget_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작 — 프리셋과 슬라이더', () => {
  it('프리셋 버튼을 누르면 슬라이더 여덟 개가 통째로 갈린다', () => {
    const { dom } = widget_build_mounted();
    const kidney = dom.root.querySelector('[data-preset="kidney"]');
    dom.listeners_run_event(kidney, 'click');

    const expected = model_calculate_preset_state('kidney');
    const inputs = dom.root.querySelectorAll('input');
    expect(Number(inputs[0].value)).toBe(expected.sizeA1);
    expect(Number(inputs[1].value)).toBeCloseTo(expected.rateA1, 12);
    expect(dom.urlsWritten.at(-1)).toContain('preset=kidney');
  });

  it('프리셋을 누르면 그 프리셋 버튼만 눌린 상태가 된다', () => {
    const { dom } = widget_build_mounted();
    dom.listeners_run_event(dom.root.querySelector('[data-preset="kidney"]'), 'click');
    for (const button of dom.root.querySelectorAll('button')) {
      expect(button.getAttribute('aria-pressed')).toBe(String(button.dataset.preset === 'kidney'));
    }
  });

  it('프리셋을 누르면 라벨이 그 자료의 이름으로 바뀐다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.textContent).toContain('Department A');
    dom.listeners_run_event(dom.root.querySelector('[data-preset="kidney"]'), 'click');
    expect(dom.root.textContent).toContain('Small stones');
    expect(dom.root.textContent).not.toContain('Department A');
  });

  it('슬라이더를 움직이면 프리셋 선택이 풀린다', () => {
    const { dom } = widget_build_mounted();
    const input = dom.root.querySelectorAll('input')[0];
    input.value = '500';
    dom.listeners_run_event(input, 'change');
    expect(dom.urlsWritten.at(-1)).toContain('preset=custom');
    for (const button of dom.root.querySelectorAll('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('표본수를 0으로 내리면 숫자를 뱉지 않고 이유를 적는다', () => {
    const { dom } = widget_build_mounted();
    const inputs = dom.root.querySelectorAll('input');
    inputs[0].value = '0'; // sizeA1
    inputs[4].value = '0'; // sizeA2 (슬라이더 순서: a1n a1p b1n b1p a2n a2p b2n b2p)
    dom.listeners_run_event(inputs[0], 'change');
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.textContent).toContain('Nothing to compare');
    expect(verdict.hasAttribute('data-state')).toBe(false);
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const input = dom.root.querySelectorAll('input')[0];
    const before = dom.urlsWritten.length;

    input.value = '900';
    dom.listeners_run_event(input, 'input');
    expect(dom.urlsWritten.length).toBe(before); // 아직 안 썼다
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    input.value = '800';
    dom.listeners_run_event(input, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2); // 즉시
  });
});
