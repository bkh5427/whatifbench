/**
 * 태양계 통신 지연 — 위젯 테스트
 *
 * 순수 헬퍼(표시 문자열·축 계산·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머 수명, 접근성 속성, 조작 반응)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 실제로 마운트해서 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  BODIES,
  BODY_DEFAULT_KEY,
  THETA_DEFAULT_DEG,
  THETA_MAX_DEG,
  TURNS_DEFAULT,
  TURNS_MAX,
  model_calculate_body_table,
  model_calculate_result,
  model_calculate_sweep,
} from './model.js';
import {
  PRESETS,
  PRESET_CUSTOM,
  chart_calculate_body_scale,
  chart_calculate_scale,
  display_describe_elliptic_band,
  display_describe_theta,
  display_describe_verdict,
  display_format_au,
  display_format_axis_minutes,
  display_format_duration,
  display_format_million_km,
  display_format_seconds,
  display_format_swing,
  state_pick_matching_preset,
  url_read_state,
  widget_mount,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 2개 × (input, change) = 4, 토글 라디오 2개 × change = 2,
 * 천체 버튼 8개 + 프리셋 버튼 5개 = 13, window resize = 1.
 */
const WIDGET_LISTENER_COUNT = 20;
const BODY_BUTTON_COUNT = 8;
const PRESET_BUTTON_COUNT = 5;

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

/** 슬라이더·토글 입력은 DOM 순서로 들어온다: θ, 편도, 왕복, 턴 수. */
function fixture_read_inputs(dom) {
  const inputs = dom.root.querySelectorAll('input');
  return { theta: inputs[0], oneWay: inputs[1], roundTrip: inputs[2], turns: inputs[3], all: inputs };
}

function fixture_read_button(dom, presetKey) {
  return dom.root.querySelector(`[data-preset="${presetKey}"]`);
}

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      bodyKey: BODY_DEFAULT_KEY,
      thetaDegrees: THETA_DEFAULT_DEG,
      roundTrip: true,
      turns: TURNS_DEFAULT,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    const state = url_read_state('?body=pluto&theta=&rt=abc&turns=0x10');
    expect(state.bodyKey).toBe(BODY_DEFAULT_KEY);
    expect(state.thetaDegrees).toBe(THETA_DEFAULT_DEG);
    expect(state.roundTrip).toBe(true);
    expect(state.turns).toBe(TURNS_DEFAULT);
  });

  it('빈 천체 이름도 기본 천체로 — 목록의 첫 천체(태양)가 아니다', () => {
    expect(url_read_state('?body=').bodyKey).toBe(BODY_DEFAULT_KEY);
    expect(url_read_state('?body=sun').bodyKey).toBe('sun');
  });

  it('범위 밖 값은 잘리고 눈금 위로 맞는다', () => {
    const state = url_read_state('?theta=999&turns=999&rt=0');
    expect(state.thetaDegrees).toBe(THETA_MAX_DEG);
    expect(state.turns).toBe(TURNS_MAX);
    expect(state.roundTrip).toBe(false);
    expect(url_read_state('?theta=44.6').thetaDegrees).toBe(45);
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('초 → 분 → 시·분으로 단위가 바뀐다', () => {
    expect(display_format_duration(12.34)).toBe('12.3 s');
    expect(display_format_duration(59.94)).toBe('59.9 s');
    expect(display_format_duration(60)).toBe('1.0 min');
    expect(display_format_duration(261.346)).toBe('4.4 min');
    expect(display_format_duration(1259.35)).toBe('21.0 min');
    expect(display_format_duration(3599)).toBe('60.0 min');
    expect(display_format_duration(3600)).toBe('1 h 0 min');
    expect(display_format_duration(4259.85)).toBe('1 h 11 min');
    expect(display_format_duration(31008)).toBe('8 h 37 min');
  });

  it('시·분 표기가 "3 h 60 min"을 만들지 않는다', () => {
    // 3599.7초는 59.995분이다. 반올림이 60분을 만들면 시를 올려야 한다.
    expect(display_format_duration(7199.7)).toBe('2 h 0 min');
  });

  it('음수·NaN은 숫자로 새지 않는다', () => {
    expect(display_format_duration(Number.NaN)).toBe('—');
    expect(display_format_duration(-5)).toBe('—');
  });

  it('초·au·백만 km·흔들림 표기', () => {
    expect(display_format_seconds(1259.348)).toBe('1,259.3 s');
    expect(display_format_seconds(14551.4)).toBe('14,551.4 s');
    expect(display_format_au(2.52371295)).toBe('2.5237 au');
    expect(display_format_million_km(377.54)).toBe('377.5 million km');
    expect(display_format_swing(4.8189)).toBe('4.82×');
  });

  it('축 눈금 라벨이 작은 값을 0으로 뭉개지 않는다', () => {
    expect(display_format_axis_minutes(2.3)).toBe('2.3');
    expect(display_format_axis_minutes(0.42)).toBe('0.42');
    expect(display_format_axis_minutes(10)).toBe('10');
    expect(display_format_axis_minutes(258.4)).toBe('258');
    expect(display_format_axis_minutes(0)).toBe('—');
  });

  it('판정 문장이 흔들림과 지금 값을 함께 말한다', () => {
    const spoken = display_describe_verdict(model_calculate_result('mars', 0, true, 8));
    expect(spoken.verdict).toBe('break');
    expect(spoken.detail).toContain('4.82×');
    expect(spoken.detail).toContain('4.4 min');
    expect(spoken.detail).toContain('21.0 min');
  });

  it('태양은 띠 대신 "θ가 거리를 못 바꾼다"고 말한다', () => {
    const spoken = display_describe_verdict(model_calculate_result('sun', 90, false, 1));
    expect(spoken.verdict).toBe('hold');
    expect(spoken.detail).toContain('8.3 min');
    expect(display_describe_theta(model_calculate_result('sun', 90, false, 1))).toContain('switched off');
  });

  it('θ 설명이 양 끝에서 무엇이 일어나는지 말한다', () => {
    expect(display_describe_theta(model_calculate_result('mars', 0, true, 1))).toContain('subtracts');
    expect(display_describe_theta(model_calculate_result('mars', 180, true, 1))).toContain('adds');
    expect(display_describe_theta(model_calculate_result('mars', 90, true, 1))).toContain('chord');
  });

  it('타원 대조 문장이 3.03분과 22.31분을 인용한다 — 화면의 다른 숫자는 원궤도다', () => {
    const note = display_describe_elliptic_band(model_calculate_result('mars', 0, true, 8));
    expect(note).toContain('3.0 min');
    expect(note).toContain('22.3 min');
    expect(note).toContain('4.4 min');
  });

  it('판정 문장에 단정하는 표현이 없다 — 주어는 모델이다', () => {
    for (const body of BODIES) {
      const spoken = display_describe_verdict(model_calculate_result(body.key, 45, true, 4));
      const sentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
      for (const banned of ['in reality', 'you should', 'we recommend', 'is better', 'proves', 'actually is']) {
        expect(sentence).not.toContain(banned);
      }
      expect(sentence).toContain('the model');
    }
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('축 계산', () => {
  it('세로축이 두 곡선을 전부 담는다', () => {
    for (const key of ['venus', 'mars', 'neptune']) {
      const points = model_calculate_sweep(key);
      const scale = chart_calculate_scale(points);
      for (const point of points) {
        for (const seconds of [point.oneWaySeconds, point.roundTripSeconds]) {
          expect(seconds / 60).toBeGreaterThanOrEqual(scale.low);
          expect(seconds / 60).toBeLessThanOrEqual(scale.high);
        }
      }
    }
  });

  it('값이 전부 같아도 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게)', () => {
    // 태양은 θ에 대해 완전히 평평하다. 스팬 0이면 좌표가 NaN이 되어 아무것도 안 그려진다.
    const scale = chart_calculate_scale([
      { thetaDegrees: 0, oneWaySeconds: 499, roundTripSeconds: 499 },
      { thetaDegrees: 180, oneWaySeconds: 499, roundTripSeconds: 499 },
    ]);
    expect(scale.high - scale.low).toBeGreaterThan(0.4);
    expect(Number.isFinite(scale.low)).toBe(true);
  });

  it('점이 없으면 유효한 축을 준다', () => {
    const scale = chart_calculate_scale([]);
    expect(scale.high).toBeGreaterThan(scale.low);
  });

  it('막대 로그 축이 여덟 천체를 전부 담는다', () => {
    const rows = model_calculate_body_table();
    const scale = chart_calculate_body_scale(rows);
    expect(scale.low).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.closestSeconds / 60).toBeGreaterThanOrEqual(scale.low);
      expect(row.farthestSeconds / 60).toBeLessThanOrEqual(scale.high);
    }
  });

  it('막대 로그 축이 0과 음수에서 무너지지 않는다', () => {
    // log(0) = −Infinity, log(음수) = NaN. 여기서 막지 않으면 눈금 루프가 무한루프다.
    const broken = chart_calculate_body_scale([
      { closestSeconds: 0, farthestSeconds: 0 },
      { closestSeconds: -5, farthestSeconds: -1 },
    ]);
    expect(broken.low).toBeGreaterThan(0);
    expect(broken.high).toBeGreaterThan(broken.low);
    expect(chart_calculate_body_scale([]).low).toBeGreaterThan(0);
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  it('다섯 개가 전부 모델의 유효범위 안이다', () => {
    expect(PRESETS.length).toBe(PRESET_BUTTON_COUNT);
    for (const preset of PRESETS) {
      expect(() =>
        model_calculate_result(
          preset.state.bodyKey,
          preset.state.thetaDegrees,
          preset.state.roundTrip,
          preset.state.turns,
        ),
      ).not.toThrow();
      expect(state_pick_matching_preset(preset.state)).toBe(preset.key);
    }
  });

  it('어느 프리셋과도 다른 상태는 custom이다 — 버튼이 거짓말을 하지 않는다', () => {
    expect(state_pick_matching_preset({ bodyKey: 'mars', thetaDegrees: 91, roundTrip: true, turns: 8 })).toBe(
      PRESET_CUSTOM,
    );
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it('붙는 리스너는 정확히 20개다', () => {
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
    const { theta } = fixture_read_inputs(dom);
    expect(dom.listeners_run_event(theta, 'input')).toBe(1);
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('애니메이션 프레임을 잡지 않는다 — 정적인 위젯이다', () => {
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
    const { theta } = fixture_read_inputs(dom);
    widget_reset();
    expect(dom.listeners_run_event(theta, 'input')).toBe(0);
    expect(dom.root.textContent).toBe('');
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('조작부가 전부 있다 — 슬라이더 2, 토글 2, 버튼 13, 캔버스 2', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('input').length).toBe(4);
    expect(dom.root.querySelectorAll('button').length).toBe(BODY_BUTTON_COUNT + PRESET_BUTTON_COUNT);
    expect(dom.root.querySelectorAll('canvas').length).toBe(2);
    expect(dom.root.querySelectorAll('.widget-toggle').length).toBe(1);
  });

  it('카드 네 장이 기본 설정(화성 θ = 90°, 왕복, 8턴)의 값으로 채워진다', () => {
    const { dom } = widget_build_mounted();
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    const result = model_calculate_result(BODY_DEFAULT_KEY, THETA_DEFAULT_DEG, true, TURNS_DEFAULT);
    expect(values).toEqual([
      display_format_duration(result.shownSeconds),
      display_format_au(result.distanceAu),
      display_format_duration(result.conversationSeconds),
      display_format_swing(result.swingRatio),
    ]);
    // 리터럴로도 못박는다 — 모델과 화면이 같이 틀리는 것을 막는다.
    expect(values).toEqual(['30.3 min', '1.8226 au', '4 h 3 min', '4.82×']);
  });

  it('카드마다 단위와 모델 안의 대조값이 함께 붙는다', () => {
    const { dom } = widget_build_mounted();
    const units = dom.root.querySelectorAll('.readout-unit').map((el) => el.textContent);
    expect(units[0]).toBe('1,818.9 s · 15.2 min one way');
    expect(units[1]).toBe('272.7 million km');
    expect(units[2]).toBe('8 × 30.3 min there and back');
    expect(units[3]).toBe('4.4 min → 21.0 min one way');
  });

  it('표가 여덟 천체를 채우고 지금 천체를 표시한다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(BODIES.length);
    const current = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Mars');
    // 본문 블록 4가 인용하는 줄이 화면에도 그대로 있다.
    expect(current[0].textContent).toContain('4.4 min');
    expect(current[0].textContent).toContain('21.0 min');
    expect(current[0].textContent).toContain('42.0 min');
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('break');
    expect(verdict.textContent).toContain('4.82×');
  });

  it('로드하자마자 주소창에 상태가 실린다', () => {
    const { dom } = widget_build_mounted();
    const written = dom.urlsWritten.at(-1);
    expect(written).toContain('body=mars');
    expect(written).toContain('theta=90');
    expect(written).toContain('rt=1');
    expect(written).toContain('turns=8');
  });

  it('URL로 들어온 상태가 그대로 그려진다', () => {
    const { dom } = widget_build_mounted({ search: '?body=neptune&theta=180&rt=0&turns=10' });
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    const result = model_calculate_result('neptune', 180, false, 10);
    expect(values[0]).toBe(display_format_duration(result.oneWaySeconds));
    expect(values[0]).toBe('4 h 18 min');
    expect(values[2]).toBe('86 h 8 min');
  });

  it('범례 두 벌이 색 견본과 선 종류의 뜻을 함께 준다', () => {
    const { dom } = widget_build_mounted();
    const legends = dom.root.querySelectorAll('.widget-legend');
    expect(legends.length).toBe(2);
    const classes = dom.root.querySelectorAll('.legend-key').map((el) => String(el.className));
    expect(classes.length).toBe(4);
    // `.legend-key`는 다른 위젯도 쓰는 견본 클래스다. 그대로 붙어 있어야 한다.
    for (const name of classes) expect(name.startsWith('legend-key ')).toBe(true);
    expect(legends[0].textContent).toContain('solid');
    expect(legends[0].textContent).toContain('dashed');
  });

  it('캔버스 폭이 0이어도 캡션이 비지 않는다', () => {
    // 숨긴 탭·display:none이면 렌더가 null을 준다. 그때 캡션이 빈 문자열로 남으면
    // 그림의 뜻이 화면에서 사라진다.
    const { dom } = widget_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.filter((text) => text.length > 0).length).toBe(3);
  });

  it('캡션이 인용하는 축 범위가 렌더가 실제로 쓴 값이다', () => {
    const { dom } = widget_build_mounted();
    const scale = chart_calculate_scale(model_calculate_sweep(BODY_DEFAULT_KEY));
    const note = dom.root.querySelectorAll('.legend-note')[0].textContent;
    expect(note).toContain(
      `${display_format_axis_minutes(scale.low)}–${display_format_axis_minutes(scale.high)} minutes`,
    );
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('모든 슬라이더가 자기 설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    for (const input of dom.root.querySelectorAll('input')) {
      if (input.type !== 'range') continue;
      const described = input.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      expect(dom.root.querySelector(`[id="${described}"]`)).not.toBeNull();
    }
  });

  it('토글도 이름과 설명이 실제로 있는 자리를 가리킨다', () => {
    const { dom } = widget_build_mounted();
    const group = dom.root.querySelector('.widget-toggle');
    expect(group.getAttribute('role')).toBe('radiogroup');
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      const target = group.getAttribute(attribute);
      expect(dom.root.querySelector(`[id="${target}"]`)).not.toBeNull();
    }
  });

  it('두 슬라이더가 aria-valuetext로 실제 값을 준다 (90이라고만 읽히지 않게)', () => {
    const { dom } = widget_build_mounted();
    const { theta, turns } = fixture_read_inputs(dom);
    expect(theta.getAttribute('aria-valuetext')).toBe('90°, one way 15.2 min');
    expect(turns.getAttribute('aria-valuetext')).toBe('8 turns, 4 h 3 min in total');
  });

  it('두 캔버스에 role=img와 요약 aria-label이 붙는다', () => {
    const { dom } = widget_build_mounted();
    for (const canvas of dom.root.querySelectorAll('canvas')) {
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label').length).toBeGreaterThan(40);
    }
  });

  it('막대 그림의 aria-label이 여덟 천체를 전부 읽어 준다', () => {
    const { dom } = widget_build_mounted();
    const label = dom.root.querySelectorAll('canvas')[1].getAttribute('aria-label');
    for (const body of BODIES) expect(label).toContain(body.label);
  });

  it('output이 live region으로 발화되지 않는다', () => {
    const { dom } = widget_build_mounted();
    const outputs = dom.root.querySelectorAll('output');
    expect(outputs.length).toBe(2);
    for (const output of outputs) expect(output.getAttribute('aria-live')).toBe('off');
  });

  it('표가 자체 스크롤 컨테이너 안에 있다 (WCAG Reflow)', () => {
    const { dom } = widget_build_mounted();
    const scroll = dom.root.querySelector('.widget-table-scroll');
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('tabindex')).toBe('0');
    expect(scroll.getAttribute('aria-label')).toBeTruthy();
  });

  it('버튼 묶음이 지금 상태를 aria-pressed로 알린다', () => {
    const { dom } = widget_build_mounted();
    const pressed = dom.root
      .querySelectorAll('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    // 기본 상태는 어느 프리셋과도 다르다 — 천체 버튼 하나만 눌린 상태여야 한다.
    expect(pressed.length).toBe(1);
    expect(pressed[0].getAttribute('data-preset')).toBe(BODY_DEFAULT_KEY);
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('천체 버튼을 누르면 카드·표·주소창이 따라간다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.listeners_run_event(fixture_read_button(dom, 'venus'), 'click')).toBe(1);

    const expected = model_calculate_result('venus', THETA_DEFAULT_DEG, true, TURNS_DEFAULT);
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(display_format_duration(expected.shownSeconds));
    expect(values[3]).toBe('6.23×');
    expect(dom.urlsWritten.at(-1)).toContain('body=venus');
    const current = dom.root
      .querySelectorAll('tbody')
      .flatMap((body) => body.children)
      .filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current[0].textContent).toContain('Venus');
  });

  it('θ 슬라이더의 change는 즉시, input은 디바운스된다', () => {
    const { dom } = widget_build_mounted();
    const { theta } = fixture_read_inputs(dom);
    const before = dom.urlsWritten.length;

    theta.value = '180';
    dom.listeners_run_event(theta, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);
    expect(dom.urlsWritten.at(-1)).toContain('theta=180');

    theta.value = '0';
    dom.listeners_run_event(theta, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
    expect(dom.root.querySelectorAll('.readout-value')[0].textContent).toBe('8.7 min');
  });

  it('토글을 편도로 바꾸면 큰 숫자만 절반이 되고 대화 길이는 그대로다', () => {
    const { dom } = widget_build_mounted();
    const { oneWay, roundTrip } = fixture_read_inputs(dom);
    const conversationBefore = dom.root.querySelectorAll('.readout-value')[2].textContent;

    oneWay.checked = true;
    roundTrip.checked = false;
    dom.listeners_run_event(oneWay, 'change');

    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe('15.2 min');
    expect(values[2]).toBe(conversationBefore);
    expect(dom.urlsWritten.at(-1)).toContain('rt=0');
    expect(dom.root.querySelectorAll('.readout-label')[0].textContent).toContain('one way');
  });

  it('턴 슬라이더가 대화 카드를 바꾼다', () => {
    const { dom } = widget_build_mounted();
    const { turns } = fixture_read_inputs(dom);
    turns.value = '1';
    dom.listeners_run_event(turns, 'change');
    const expected = model_calculate_result(BODY_DEFAULT_KEY, THETA_DEFAULT_DEG, true, 1);
    expect(dom.root.querySelectorAll('.readout-value')[2].textContent).toBe(
      display_format_duration(expected.conversationSeconds),
    );
    expect(dom.root.querySelectorAll('.readout-label')[2].textContent).toBe('1 turn of conversation');
  });

  it('프리셋 버튼이 상태를 통째로 갈아끼우고 자기를 눌린 상태로 만든다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.listeners_run_event(fixture_read_button(dom, 'mars-far'), 'click')).toBe(1);

    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe('42.0 min');
    expect(values[1]).toBe('2.5237 au');
    expect(fixture_read_button(dom, 'mars-far').getAttribute('aria-pressed')).toBe('true');
    expect(fixture_read_button(dom, 'mars-close').getAttribute('aria-pressed')).toBe('false');
    expect(dom.urlsWritten.at(-1)).toContain('theta=180');
  });

  it('프리셋을 누른 뒤 슬라이더를 움직이면 어느 프리셋도 눌린 상태가 아니다', () => {
    const { dom } = widget_build_mounted();
    dom.listeners_run_event(fixture_read_button(dom, 'mars-far'), 'click');
    const { theta } = fixture_read_inputs(dom);
    theta.value = '179';
    dom.listeners_run_event(theta, 'change');
    expect(fixture_read_button(dom, 'mars-far').getAttribute('aria-pressed')).toBe('false');
  });

  it('태양을 고르면 θ 슬라이더가 꺼진다 — 움직여도 값이 안 변하는 손잡이를 남기지 않는다', () => {
    const { dom } = widget_build_mounted();
    const { theta } = fixture_read_inputs(dom);
    expect(theta.disabled).toBe(false);

    dom.listeners_run_event(fixture_read_button(dom, 'sunlight'), 'click');
    expect(theta.disabled).toBe(true);
    expect(theta.getAttribute('aria-disabled')).toBe('true');
    expect(dom.root.querySelectorAll('.readout-value')[0].textContent).toBe('8.3 min');

    // 다른 천체로 돌아오면 다시 켜진다.
    dom.listeners_run_event(fixture_read_button(dom, 'jupiter'), 'click');
    expect(theta.disabled).toBe(false);
    expect(theta.getAttribute('aria-disabled')).toBeNull();
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });
});

// ── 본문이 인용하는 표 문자열 ───────────────────────────────

describe('표에 찍히는 문자열', () => {
  /** 본문 블록 6의 표 그대로. [천체, 최근접, 최원, 최원 왕복, 흔들림] */
  const GOLDEN_ROWS = [
    ['Sun', '8.3 min', '8.3 min', '16.6 min', '1.00×'],
    ['Mercury', '5.1 min', '11.5 min', '23.1 min', '2.26×'],
    ['Venus', '2.3 min', '14.3 min', '28.7 min', '6.23×'],
    ['Mars', '4.4 min', '21.0 min', '42.0 min', '4.82×'],
    ['Jupiter', '35.0 min', '51.6 min', '1 h 43 min', '1.48×'],
    ['Saturn', '1 h 11 min', '1 h 28 min', '2 h 55 min', '1.23×'],
    ['Uranus', '2 h 31 min', '2 h 48 min', '5 h 36 min', '1.11×'],
    ['Neptune', '4 h 2 min', '4 h 18 min', '8 h 37 min', '1.07×'],
  ];

  it('여덟 행이 본문의 문자열과 글자 하나까지 같다', () => {
    const rows = model_calculate_body_table();
    rows.forEach((row, index) => {
      const [label, closest, farthest, roundTrip, swing] = GOLDEN_ROWS[index];
      expect(row.body.label).toBe(label);
      expect(display_format_duration(row.closestSeconds)).toBe(closest);
      expect(display_format_duration(row.farthestSeconds)).toBe(farthest);
      expect(display_format_duration(row.roundTripFarthestSeconds)).toBe(roundTrip);
      expect(display_format_swing(row.swingRatio)).toBe(swing);
    });
  });

  it('화면의 표가 같은 문자열을 담는다', () => {
    const { dom } = widget_build_mounted();
    const cells = dom.root
      .querySelectorAll('tbody')
      .flatMap((body) => body.children)
      .map((row) => row.children.map((cell) => cell.textContent));
    GOLDEN_ROWS.forEach(([label, closest, farthest, roundTrip, swing], index) => {
      expect(cells[index][0]).toBe(label);
      expect(cells[index][2]).toBe(closest);
      expect(cells[index][4]).toBe(farthest);
      expect(cells[index][5]).toBe(roundTrip);
      expect(cells[index][6]).toBe(swing);
    });
  });
});
