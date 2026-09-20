/**
 * 항력 포함 포물선 — 위젯 테스트
 *
 * 순수 헬퍼(축·표시 문자열·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머 수명, 접근성 속성, 프리셋이 실제로 무엇을 바꾸는가)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  PROJECTILE_ANGLE_DEFAULT_DEG,
  PROJECTILE_SPEED_DEFAULT_MS,
  PROJECTILE_MASS_DEFAULT_KG,
  PROJECTILE_DRAG_DEFAULT,
  PROJECTILE_AREA_DEFAULT_M2,
  PROJECTILE_DENSITY_DEFAULT_KGM3,
  PROJECTILE_MASS_MIN_KG,
  PROJECTILE_MASS_AXIS,
  PROJECTILE_AREA_AXIS,
  PROJECTILE_PRESETS,
  model_build_default_parameters,
  model_calculate_summary,
  model_calculate_sweep,
  model_calculate_log_index,
} from './model.js';
import {
  widget_mount,
  url_read_state,
  chart_calculate_span,
  display_format_metres,
  display_format_seconds,
  display_format_speed,
  display_format_angle,
  display_format_mass,
  display_format_area,
  display_format_axis,
  display_describe_verdict,
  display_describe_path,
  display_describe_sweep,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 6개 × (input, change) = 12 + 프리셋 버튼 5개 = 17 + window resize = 18
 */
const WIDGET_LISTENER_COUNT = 18;
/** 슬라이더 순서 — 각도·속력·질량·Cd·면적·밀도. */
const SLIDER_INDEX = { angle: 0, speed: 1, mass: 2, drag: 3, area: 4, density: 5 };

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

function fixture_read_cards(dom) {
  return dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
}

function fixture_read_card_units(dom) {
  return dom.root.querySelectorAll('.readout-unit').map((el) => el.textContent);
}

function fixture_read_sliders(dom) {
  return dom.root.querySelectorAll('input');
}

function fixture_pick_preset(dom, key) {
  const button = dom.root.querySelectorAll('button').find((el) => el.getAttribute('data-preset') === key);
  expect(button).toBeTruthy();
  expect(dom.listeners_run_event(button, 'click')).toBe(1);
  return button;
}

// ── URL 상태 ────────────────────────────────────────────────

describe('URL 상태', () => {
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      angleDeg: PROJECTILE_ANGLE_DEFAULT_DEG,
      speedMs: PROJECTILE_SPEED_DEFAULT_MS,
      massKg: PROJECTILE_MASS_DEFAULT_KG,
      dragCoefficient: PROJECTILE_DRAG_DEFAULT,
      areaM2: PROJECTILE_AREA_DEFAULT_M2,
      densityKgM3: PROJECTILE_DENSITY_DEFAULT_KGM3,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    // 클램프에 맡기면 질량이 조용히 10 g가 되어 곡선이 통째로 달라진다.
    const state = url_read_state('?th=&v0=0x10&m=abc&cd=&a=1e-3&rho=NaN');
    expect(state).toEqual(url_read_state(''));
    expect(state.massKg).not.toBe(PROJECTILE_MASS_MIN_KG);
  });

  it('범위를 벗어난 값은 잘리고 눈금 위로 맞는다', () => {
    const state = url_read_state('?th=120&v0=999&cd=9&rho=-4');
    expect(state.angleDeg).toBe(90);
    expect(state.speedMs).toBe(80);
    expect(state.dragCoefficient).toBe(1.2);
    expect(state.densityKgM3).toBe(0);
    expect(url_read_state('?th=40.3&cd=0.474&rho=1.2263').angleDeg).toBe(40.5);
    expect(url_read_state('?cd=0.474').dragCoefficient).toBe(0.47);
  });

  it('로그 슬라이더 값도 눈금 위로 맞아 들어온다', () => {
    const state = url_read_state('?m=0.1&a=0.01');
    // 눈금 위의 값이므로 다시 넣어도 움직이지 않는다.
    expect(url_read_state(`?m=${state.massKg}&a=${state.areaM2}`).massKg).toBe(state.massKg);
    expect(Math.abs(Math.log10(state.massKg / 0.1))).toBeLessThan(1 / 80);
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('축', () => {
  it('데이터에 맞춰 스케일링하되 최소 표시 폭을 준다', () => {
    expect(chart_calculate_span([80, 160], 1.02)).toBeCloseTo(163.2, 6);
    // 두 값이 0이면 좌표가 NaN이 된다. 최소 폭이 그것을 막는다.
    expect(chart_calculate_span([0, 0], 1.1)).toBeGreaterThan(0);
    expect(chart_calculate_span([Number.NaN], 1.1)).toBeGreaterThan(0);
  });

  it('축 범위가 좁아지면 눈금 라벨 자릿수를 늘린다', () => {
    expect(display_format_axis(120, 160)).toBe('120');
    expect(display_format_axis(1.25, 8)).toBe('1.3');
    expect(display_format_axis(0.42, 1)).toBe('0.42');
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('1 m 아래에서는 자릿수를 늘린다 — 0.34와 0.44가 뭉개지지 않게', () => {
    expect(display_format_metres(0.34)).toBe('0.34');
    expect(display_format_metres(85.914)).toBe('85.9');
    expect(display_format_metres(Number.NaN)).toBe('—');
    expect(display_format_seconds(4.3288)).toBe('4.33');
    expect(display_format_speed(22.9527)).toBe('23.0');
    expect(display_format_angle(40.0763)).toBe('40.1°');
  });

  it('질량은 1 kg 아래에서 그램으로 읽힌다', () => {
    expect(display_format_mass(0.145)).toBe('145.0 g');
    expect(display_format_mass(3.97071)).toBe('3.971 kg');
  });

  it('면적에 지름을 병기한다 — 슬라이더는 A지만 사람은 지름으로 읽는다', () => {
    expect(display_format_area(4.185e-3)).toBe('4.185 × 10⁻³ m² (d = 73 mm sphere)');
    expect(display_format_area(0)).toBe('—');
  });

  it('판정문이 최적각과 근거 숫자를 함께 말한다 — 주어는 모델이다', () => {
    const params = model_build_default_parameters();
    const spoken = display_describe_verdict(model_calculate_summary(params), model_calculate_sweep(params));
    expect(spoken.verdict).toBe('edge');
    expect(spoken.headline).toContain('40.1°');
    expect(spoken.detail).toContain('85.9');
    expect(spoken.detail).toContain('160.7');
    const sentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
    for (const banned of ['in reality', 'you should', 'we recommend', 'is better', 'proves', 'always']) {
      expect(sentence).not.toContain(banned);
    }
  });

  it('Cd = 0이면 판정문이 두 경로가 같은 답을 냈다고 말한다', () => {
    const params = { ...model_build_default_parameters(), dragCoefficient: 0 };
    const spoken = display_describe_verdict(model_calculate_summary(params), model_calculate_sweep(params));
    expect(spoken.merged).toBe(true);
    expect(spoken.verdict).toBe('hold');
    expect(spoken.detail).toContain('163.2');
    expect(spoken.detail).toContain('v₀²sin2θ/g');
  });

  /**
   * 치명 결함 재현. θ=0°·θ=90°·v₀=5 m/s는 항력이 켜져 있는데도(hasDrag=true)
   * 사거리 차이가 우연히 작거나 0이다 — 절대 간격으로 "공기가 없다"를 판정하면
   * 이 셋 전부 잘못 말한다. hasDrag로 판정을 바꾼 뒤에는 셋 다 merged=false여야
   * 하고, 문장 어디에도 "공기가 없다"는 주장이 없어야 한다.
   */
  it('θ=0°·θ=90°·v₀=5 m/s — 항력은 켜져 있는데 사거리 차는 작다, "공기 없음"이라고 말하면 안 된다', () => {
    const base = model_build_default_parameters();
    const casesWithAirOn = [
      { ...base, angleDeg: 0 },
      { ...base, angleDeg: 90 },
      { ...base, speedMs: 5 },
    ];
    for (const params of casesWithAirOn) {
      const summary = model_calculate_summary(params);
      const sweep = model_calculate_sweep(params);
      const spoken = display_describe_verdict(summary, sweep);
      expect(spoken.merged).toBe(false);
      const verdictSentence = `${spoken.headline} ${spoken.detail}`.toLowerCase();
      expect(verdictSentence).not.toContain('no air in the model');
      expect(verdictSentence).not.toContain('they agree');
      const pathCaption = display_describe_path(summary, null).toLowerCase();
      expect(pathCaption).not.toContain('no air term');
    }
  });

  it('궤적 캡션이 그림이 실제로 쓴 축만 인용한다', () => {
    const summary = model_calculate_summary(model_build_default_parameters());
    const drawn = { spanX: 163.9, spanY: 25.6 };
    const caption = display_describe_path(summary, drawn);
    expect(caption).toContain('163.9');
    expect(caption).toContain('25.6');
    // 축을 못 그린 경우(폭 0)에는 축 문장을 아예 적지 않는다.
    expect(display_describe_path(summary, null)).not.toContain('axes run');
    expect(display_describe_path(summary, null)).toContain('74.8');
  });

  it('스윕 캡션이 최대점의 각도를 숫자로 적는다', () => {
    const params = model_build_default_parameters();
    const caption = display_describe_sweep(model_calculate_sweep(params), params.angleDeg, { spanY: 179 });
    expect(caption).toContain('40.1°');
    expect(caption).toContain('45.0°');
    expect(caption).toContain('163.2');
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it('붙는 리스너는 정확히 18개다', () => {
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

  it('reset이 예약된 타이머까지 끊는다 — 잔여 0', () => {
    const { dom, widget_reset } = widget_build_mounted();
    const sliders = fixture_read_sliders(dom);
    expect(dom.listeners_run_event(sliders[SLIDER_INDEX.angle], 'input')).toBe(1);
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('애니메이션 프레임을 쓰지 않는다 — 이 위젯에는 움직이는 것이 없다', () => {
    const { dom } = widget_build_mounted();
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
    const slider = fixture_read_sliders(dom)[0];
    widget_reset();
    expect(dom.listeners_run_event(slider, 'input')).toBe(0);
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('슬라이더 6개, 캔버스 2개, 프리셋 버튼 5개가 있다', () => {
    const { dom } = widget_build_mounted();
    expect(fixture_read_sliders(dom).length).toBe(6);
    expect(dom.root.querySelectorAll('canvas').length).toBe(2);
    expect(dom.root.querySelectorAll('.widget-preset').length).toBe(PROJECTILE_PRESETS.length);
  });

  it('카드 네 장이 기본 설정의 값으로 채워지고 본문의 숫자가 화면에 뜬다', () => {
    const { dom } = widget_build_mounted();
    const summary = model_calculate_summary(model_build_default_parameters());
    expect(fixture_read_cards(dom)).toEqual([
      display_format_metres(summary.drag.rangeMetres),
      display_format_metres(summary.drag.apexHeightMetres),
      display_format_seconds(summary.drag.flightSeconds),
      display_format_speed(summary.drag.landingSpeedMs),
    ]);
    // 본문 블록 4·6이 인용하는 숫자들.
    expect(fixture_read_cards(dom)).toEqual(['85.9', '23.2', '4.33', '23.0']);
  });

  it('카드마다 진공 대조값이 함께 붙는다 (두 열이 나란히 읽힌다)', () => {
    const { dom } = widget_build_mounted();
    const units = fixture_read_card_units(dom);
    expect(units[0]).toContain('160.7');
    for (const unit of units) expect(unit).toContain('In a vacuum');
  });

  it('표가 네 줄을 항력·진공·차이 세 열로 채운다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(4);
    expect(rows[0].children.length).toBe(4);
    expect(rows[0].textContent).toContain('85.9 m');
    expect(rows[0].textContent).toContain('160.7 m');
    expect(rows[0].textContent).toContain('−74.8 m');
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('edge');
    expect(verdict.textContent).toContain('40.1°');
  });

  it('로드하자마자 주소창에 상태 여섯 개가 실린다', () => {
    const { dom } = widget_build_mounted();
    const written = dom.urlsWritten.at(-1);
    for (const key of ['th=40', 'v0=40', 'm=0.145', 'cd=0.47', 'a=0.004185', 'rho=1.225']) {
      expect(written).toContain(key);
    }
  });

  it('Cd 슬라이더 아래에 0 위치 눈금 라벨이 찍힌다', () => {
    // 이 페이지의 검수 포인트가 Cd = 0이다. 그 자리가 화면에 보여야 한다.
    const { dom } = widget_build_mounted();
    const scaleText = dom.root
      .querySelectorAll('.widget-hint')
      .map((el) => el.textContent)
      .join(' | ');
    expect(scaleText).toContain('0.00 — no air');
    expect(scaleText).toContain('1.20');
  });

  it('범례에 색 견본 두 칸과 선 종류의 뜻이 글로 적힌다', () => {
    const { dom } = widget_build_mounted();
    const classes = dom.root.querySelectorAll('.legend-key').map((el) => String(el.className));
    // `.legend-key`는 다른 위젯들도 쓰는 클래스다. 견본에 그대로 붙어 있어야 한다.
    for (const name of classes) expect(name.startsWith('legend-key ')).toBe(true);
    expect(classes.filter((name) => name.includes('legend-mean-1')).length).toBe(2);
    expect(classes.filter((name) => name.includes('legend-tail-2')).length).toBe(2);
    const text = dom.root.querySelectorAll('.widget-legend').map((el) => el.textContent).join(' ');
    expect(text).toContain('Solid');
    expect(text).toContain('Dotted');
  });

  it('캔버스 폭이 0이어도 캡션이 비지 않는다', () => {
    const { dom } = widget_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.length).toBe(2);
    for (const note of notes) expect(note.length).toBeGreaterThan(40);
  });
});

// ── 접근성 ──────────────────────────────────────────────────

describe('접근성', () => {
  it('여섯 슬라이더가 전부 자기 설명과 묶여 있다', () => {
    const { dom } = widget_build_mounted();
    for (const input of fixture_read_sliders(dom)) {
      const described = input.getAttribute('aria-describedby');
      expect(described).toBeTruthy();
      const hint = dom.root.querySelector(`[id="${described}"]`);
      expect(hint).not.toBeNull();
      expect(hint.textContent.length).toBeGreaterThan(20);
    }
  });

  it('로그 슬라이더가 aria-valuetext로 실제 값을 준다 (칸 번호가 읽히지 않게)', () => {
    const { dom } = widget_build_mounted();
    const sliders = fixture_read_sliders(dom);
    // 손잡이의 value는 칸 번호(0)지만 읽히는 것은 질량이어야 한다.
    expect(sliders[SLIDER_INDEX.mass].value).toBe('0');
    expect(sliders[SLIDER_INDEX.mass].getAttribute('aria-valuetext')).toBe('145.0 g');
    expect(sliders[SLIDER_INDEX.area].getAttribute('aria-valuetext')).toContain('d = 73 mm');
  });

  it('두 캔버스에 role=img와 요약 aria-label이 붙는다', () => {
    const { dom } = widget_build_mounted();
    for (const canvas of dom.root.querySelectorAll('canvas')) {
      expect(canvas.getAttribute('role')).toBe('img');
      expect((canvas.getAttribute('aria-label') ?? '').length).toBeGreaterThan(40);
    }
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
  });

  it('프리셋 묶음이 group으로 이름 붙어 있고 버튼마다 aria-pressed가 있다', () => {
    const { dom } = widget_build_mounted();
    const group = dom.root.querySelector('.widget-presets');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBeTruthy();
    for (const button of dom.root.querySelectorAll('.widget-preset')) {
      expect(['true', 'false']).toContain(button.getAttribute('aria-pressed'));
    }
  });
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('각도를 바꾸면 카드와 주소창이 따라간다', () => {
    const { dom } = widget_build_mounted();
    const angle = fixture_read_sliders(dom)[SLIDER_INDEX.angle];
    angle.value = '20';
    dom.listeners_run_event(angle, 'change');

    const expected = model_calculate_summary({ ...model_build_default_parameters(), angleDeg: 20 });
    expect(fixture_read_cards(dom)[0]).toBe(display_format_metres(expected.drag.rangeMetres));
    expect(dom.urlsWritten.at(-1)).toContain('th=20');
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const speed = fixture_read_sliders(dom)[SLIDER_INDEX.speed];
    const before = dom.urlsWritten.length;

    speed.value = '60';
    dom.listeners_run_event(speed, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    speed.value = '70';
    dom.listeners_run_event(speed, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('로그 슬라이더를 한 칸 움직이면 질량이 한 배수만큼 움직인다', () => {
    const { dom } = widget_build_mounted();
    const mass = fixture_read_sliders(dom)[SLIDER_INDEX.mass];
    mass.value = String(model_calculate_log_index(PROJECTILE_MASS_AXIS, PROJECTILE_MASS_DEFAULT_KG) + 80);
    dom.listeners_run_event(mass, 'change');
    // 한 데케이드 = 80칸. 1.45 kg이 되어야 한다.
    expect(mass.getAttribute('aria-valuetext')).toBe('1.450 kg');
    expect(dom.urlsWritten.at(-1)).toContain('m=1.45');
  });
});

// ── 프리셋 ──────────────────────────────────────────────────

describe('프리셋', () => {
  it('물체 프리셋 하나가 질량·면적·Cd를 한 번에 갈아끼운다', () => {
    const { dom } = widget_build_mounted();
    const preset = PROJECTILE_PRESETS.find((item) => item.key === 'shot');
    fixture_pick_preset(dom, 'shot');

    const sliders = fixture_read_sliders(dom);
    expect(Number(sliders[SLIDER_INDEX.mass].value)).toBe(
      model_calculate_log_index(PROJECTILE_MASS_AXIS, preset.massKg),
    );
    expect(Number(sliders[SLIDER_INDEX.area].value)).toBe(
      model_calculate_log_index(PROJECTILE_AREA_AXIS, preset.areaM2),
    );
    const expected = model_calculate_summary({ ...model_build_default_parameters(), ...{
      massKg: preset.massKg, areaM2: preset.areaM2, dragCoefficient: preset.dragCoefficient,
    } });
    expect(fixture_read_cards(dom)[0]).toBe(display_format_metres(expected.drag.rangeMetres));
  });

  it('누른 프리셋만 aria-pressed가 켜진다', () => {
    const { dom } = widget_build_mounted();
    fixture_pick_preset(dom, 'tennis');
    const pressed = dom.root
      .querySelectorAll('.widget-preset')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('data-preset'));
    expect(pressed).toEqual(['tennis']);
  });

  it('기본 상태에서는 baseball 프리셋이 눌린 것으로 표시된다', () => {
    const { dom } = widget_build_mounted();
    const pressed = dom.root
      .querySelectorAll('.widget-preset')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('data-preset'));
    expect(pressed).toEqual(['baseball']);
  });

  it('**검수 포인트** — Vacuum 프리셋을 누르면 두 열의 요약값이 같아진다', () => {
    // Cd = 0에서 적분기의 답과 진공 닫힌형의 답이 화면에서 한 글자도 다르지 않아야 한다.
    // 모델 테스트가 상대오차로 잡는 것을 여기서는 **화면의 문자열로** 잡는다.
    const { dom } = widget_build_mounted();
    fixture_pick_preset(dom, 'vacuum');

    const cards = fixture_read_cards(dom);
    const units = fixture_read_card_units(dom);
    // 각도 슬라이더는 그대로 40°에 있으므로 사거리는 그 각도의 진공 사거리다.
    expect(cards[0]).toBe('160.7');
    // 카드의 대조값(진공)이 카드의 본값(적분기)과 같은 숫자를 말한다.
    for (let index = 0; index < cards.length; index += 1) {
      expect(units[index]).toContain(cards[index]);
    }

    // 표의 '차이' 열도 전부 0이어야 한다.
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    for (const row of rows) {
      const cells = row.children.map((cell) => cell.textContent);
      expect(cells[1]).toBe(cells[2]);
      // 차이가 표시 자릿수 아래면 부호 없이 0으로 적힌다 ("−0.00"이 아니다).
      expect(cells[3]).toMatch(/^0\.0+ (m|s|m\/s)$/);
    }

    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBe('hold');
    expect(verdict.textContent).toContain('45.0°');
  });

  it('Vacuum을 누른 뒤 물체 프리셋을 누르면 항력이 되돌아온다', () => {
    const { dom } = widget_build_mounted();
    fixture_pick_preset(dom, 'vacuum');
    expect(fixture_read_cards(dom)[0]).toBe('160.7');
    fixture_pick_preset(dom, 'baseball');
    expect(fixture_read_cards(dom)[0]).toBe('85.9');
    expect(fixture_read_sliders(dom)[SLIDER_INDEX.drag].value).toBe(String(PROJECTILE_DRAG_DEFAULT));
  });

  it('Vacuum 프리셋은 질량·면적 슬라이더를 건드리지 않는다', () => {
    const { dom } = widget_build_mounted();
    const sliders = fixture_read_sliders(dom);
    fixture_pick_preset(dom, 'beachball');
    const massBefore = sliders[SLIDER_INDEX.mass].value;
    const areaBefore = sliders[SLIDER_INDEX.area].value;
    fixture_pick_preset(dom, 'vacuum');
    expect(sliders[SLIDER_INDEX.mass].value).toBe(massBefore);
    expect(sliders[SLIDER_INDEX.area].value).toBe(areaBefore);
    // 그러면서도 답은 진공 답이다 — 질량과 넓이가 답을 바꾸지 못한다.
    expect(fixture_read_cards(dom)[0]).toBe('160.7');
  });

  it('프리셋 다섯 개가 판정 세 가지를 전부 보여준다 (커버리지)', () => {
    const { dom } = widget_build_mounted();
    const seen = new Set();
    for (const preset of PROJECTILE_PRESETS) {
      fixture_pick_preset(dom, preset.key);
      seen.add(dom.root.querySelector('.verdict').getAttribute('data-state'));
    }
    expect(seen).toEqual(new Set(['hold', 'edge', 'break']));
  });
});
