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
  PROJECTILE_MASS_MAX_KG,
  PROJECTILE_SPEED_MIN_MS,
  PROJECTILE_SPEED_MAX_MS,
  PROJECTILE_AREA_MIN_M2,
  PROJECTILE_MASS_AXIS,
  PROJECTILE_AREA_AXIS,
  PROJECTILE_PRESETS,
  model_build_default_parameters,
  model_calculate_summary,
  model_calculate_sweep,
  model_calculate_log_index,
  model_build_vacuum_path,
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
  display_format_resolution,
  display_check_shape_distorted,
  CHART_ARC_MIN_HEIGHT_PX,
  CHART_SCALE_MISMATCH_MIN,
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

  /**
   * 2026-10-03 검수(B6) — 사거리 차만으로 "구분 불가"를 정하면 90°에서 정점이 30 m 갈려도
   * "sit within 0.05 m"라고 적었고, 0°에서는 사거리 0의 원인을 "항력이 작아서"로 댔다.
   */
  it('0°·90°는 따로 말한다 — 90°에서 정점 30 m 차이를 "구분 불가"라고 하지 않는다', () => {
    const base = model_build_default_parameters();
    const vertical = model_calculate_summary({ ...base, angleDeg: 90 });
    expect(vertical.apexLostMetres).toBeGreaterThan(29);
    const verticalPath = display_describe_path(vertical, null);
    expect(verticalPath).not.toContain('within 0.05 m');
    expect(verticalPath).toContain('30.0 m lower');
    const verticalVerdict = display_describe_verdict(vertical, model_calculate_sweep({ ...base, angleDeg: 90 })).detail;
    expect(verticalVerdict).not.toContain('too small');
    expect(verticalVerdict).toContain('At 90°');

    const flatParams = { ...base, angleDeg: 0, massKg: PROJECTILE_MASS_MIN_KG };
    const flat = model_calculate_summary(flatParams);
    const flatVerdict = display_describe_verdict(flat, model_calculate_sweep(flatParams)).detail;
    expect(flatVerdict).not.toContain('too small');
    expect(flatVerdict).toContain('never leaves the ground');
    expect(display_describe_path(flat, null)).not.toContain('too small');
  });

  it('구분 불가 판정문은 표의 차이 칸과 같은 숫자를 적는다 — "under 0.05"와 "−0.05"가 엇갈리지 않게', () => {
    const params = { ...model_build_default_parameters(), areaM2: 1e-4, densityKgM3: 0.015 };
    const summary = model_calculate_summary(params);
    expect(summary.rangeLostMetres).toBeLessThan(0.05);
    const detail = display_describe_verdict(summary, model_calculate_sweep(params)).detail;
    expect(detail).not.toContain('under');
    expect(detail).toContain(`a gap of ${display_format_metres(summary.rangeLostMetres)} m`);
  });

  it('궤적 축은 진공 경로에 맞춘다 — 질량·Cd·면적·밀도는 축을 움직이지 않는다', () => {
    const base = model_build_default_parameters();
    const spans = [
      base,
      { ...base, massKg: PROJECTILE_MASS_MIN_KG },
      { ...base, dragCoefficient: 1.2 },
      { ...base, areaM2: 0.2, densityKgM3: 1.5 },
    ].map((params) => {
      const summary = model_calculate_summary(params);
      return [
        chart_calculate_span([summary.vacuum.rangeMetres], 1.02),
        summary.drag.rangeMetres <= summary.vacuum.rangeMetres,
        summary.drag.apexHeightMetres <= summary.vacuum.apexHeightMetres,
      ];
    });
    for (const item of spans) expect(item).toEqual(spans[0]);
    expect(display_describe_path(model_calculate_summary(base), { spanX: 1, spanY: 1 })).toContain(
      'only the angle and speed sliders rescale them',
    );
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
    expect(text).toContain('Dashed');
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

// ── B6 2회차 문구 (2026-10-03) ───────────────────────────────
/**
 * 사실 검사 B6 2회차가 찾은 문구 결함 여섯. 각 시험은 **옛 문장이 거짓이던 상태**를 직접 띄우고,
 * 그 상태에서 새 문장이 이 분기가 실제로 잰 값만 말하는지 본다.
 */
const B6_MERGE_LIMIT_M = 0.05;
const B6_THIN_AIR = { dragCoefficient: 0.47, areaM2: PROJECTILE_AREA_MIN_M2, densityKgM3: 0.015 };
/** 진공 경로를 깔 점 개수와, 반대 방향 거리를 잴 때 몇 점마다 하나를 쓰는가. */
const B6_VACUUM_PATH_POINTS = 4000;
const B6_VACUUM_SAMPLE_EVERY = 10;
/** 속력 76눈금 × 질량 양 끝 스윕. */
const B6_SPEED_WALK_TIMEOUT_MS = 60000;

function fixture_build_described(params, drawn = null) {
  const summary = model_calculate_summary(params);
  const sweep = model_calculate_sweep(params);
  return { summary, sweep, verdict: display_describe_verdict(summary, sweep), path: display_describe_path(summary, drawn) };
}

/** 점에서 꺾은선까지의 최단 거리. */
function test_calculate_polyline_distance(point, line) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index];
    const end = line[index + 1];
    const runX = end.x - start.x;
    const runY = end.y - start.y;
    const lengthSquared = runX * runX + runY * runY;
    const along = lengthSquared > 0
      ? Math.min(1, Math.max(0, ((point.x - start.x) * runX + (point.y - start.y) * runY) / lengthSquared))
      : 0;
    best = Math.min(best, Math.hypot(point.x - start.x - along * runX, point.y - start.y - along * runY));
  }
  return best;
}

/** 두 경로 사이 최대 거리(하우스도르프). 진공 쪽은 닫힌형으로 촘촘히 깐다. */
function test_calculate_path_separation(params, summary) {
  const vacuum = model_build_vacuum_path(params, B6_VACUUM_PATH_POINTS);
  const fromDrag = Math.max(...summary.drag.points.map((point) => test_calculate_polyline_distance(point, vacuum)));
  const fromVacuum = Math.max(
    ...vacuum.filter((_, index) => index % B6_VACUUM_SAMPLE_EVERY === 0).map((point) => test_calculate_polyline_distance(point, summary.drag.points)),
  );
  return Math.max(fromDrag, fromVacuum);
}

function fixture_read_mass_hint(dom) {
  const mass = fixture_read_sliders(dom)[SLIDER_INDEX.mass];
  return dom.root.querySelector(`[id="${mass.getAttribute('aria-describedby')}"]`).textContent;
}

describe('B6 2회차 — 문구가 그 문형이 나오는 모든 상태에서 참이다', () => {
  const base = model_build_default_parameters();

  it('① barely·안 갈리는 90° 캡션은 잰 두 차이만 말한다 — 화면 구분도, 경로 전체가 0.05 m 안이라는 것도 주장하지 않는다', () => {
    const barely = { ...base, ...B6_THIN_AIR };
    const vertical = { ...barely, angleDeg: 90 };
    // 사거리 차 0.026 m·정점 차 0.0497 m로 둘 다 문턱 아래인데, 두 경로 사이 최대 거리는 0.05 m를 넘는다.
    // 옛 문장 "sit within 0.05 m of each other"가 거짓이던 자리다.
    const wide = { angleDeg: 85, speedMs: 80, massKg: 1, dragCoefficient: 0.47, areaM2: 4e-4, densityKgM3: 0.005 };
    const sentence =
      'The model still has an air term at this launch, but here it moves the range and the highest point by less than 0.05 m each.';
    for (const params of [barely, vertical, wide]) {
      const { summary, path } = fixture_build_described(params);
      expect(summary.drag.hasDrag).toBe(true);
      expect(Math.max(summary.rangeLostMetres, summary.apexLostMetres)).toBeLessThan(B6_MERGE_LIMIT_M);
      expect(path).toBe(sentence);
      expect(path).not.toContain('told apart');
      expect(path).not.toContain('of each other');
    }
    const wideSummary = model_calculate_summary(wide);
    expect(test_calculate_path_separation(wide, wideSummary)).toBeGreaterThan(B6_MERGE_LIMIT_M);
  });

  it('② 진공 문장이 두 경로가 함께 쓰는 것을 빠짐없이 댄다 (도→라디안 변환 포함)', () => {
    const { verdict } = fixture_build_described({ ...base, dragCoefficient: 0 });
    expect(verdict.merged).toBe(true);
    expect(verdict.detail).toContain(
      'a step-by-step integrator and a one-line formula that share only the input check, ' +
        'the degree-to-radian conversion and the value of g — and they agree.',
    );
  });

  it('③ 질량 힌트 — 시작 공기에서는 모든 속력에서 10 g → 5 kg에 표시 최적각이 45° 쪽으로 움직이고, 공기항이 작으면 45.0°에 머문다', () => {
    const { dom } = widget_build_mounted();
    expect(fixture_read_mass_hint(dom)).toBe(
      'Only the drag term is divided by mass, so a heavier object of the same size is slowed less by the same drag. ' +
        'With the drag coefficient at 0.47, the cross-section at d = 73 mm and the air density at 1.225 kg/m³, ' +
        'sliding from 10 g to 5 kg moves the optimal angle in the lower chart back toward 45° at every launch speed; ' +
        'with a smaller air term it can already read 45.0° at 10 g and stay there.',
    );
    // 힌트의 조건(시작 공기) 그대로, 속력 슬라이더의 모든 눈금에서.
    for (let speedMs = PROJECTILE_SPEED_MIN_MS; speedMs <= PROJECTILE_SPEED_MAX_MS; speedMs += 1) {
      const [light, heavy] = [PROJECTILE_MASS_MIN_KG, PROJECTILE_MASS_MAX_KG].map(
        (massKg) => model_calculate_sweep({ ...base, speedMs, massKg }).optimum.angleDeg,
      );
      expect(heavy, `${speedMs} m/s`).toBeGreaterThan(light);
      expect(heavy, `${speedMs} m/s`).toBeLessThanOrEqual(45);
      expect(display_format_angle(heavy), `${speedMs} m/s`).not.toBe(display_format_angle(light));
    }
    // 옛 문장("With air in the model … creep back toward 45°")이 거짓이던 상태 — 양 끝 다 45.0°.
    const thin = { ...base, speedMs: PROJECTILE_SPEED_MIN_MS, ...B6_THIN_AIR, dragCoefficient: 0.01 };
    for (const massKg of [PROJECTILE_MASS_MIN_KG, PROJECTILE_MASS_MAX_KG]) {
      expect(display_format_angle(model_calculate_sweep({ ...thin, massKg }).optimum.angleDeg)).toBe('45.0°');
    }
  }, B6_SPEED_WALK_TIMEOUT_MS);

  it('④ 착지 시간 차가 0.00 s로 찍히는 apart 상태는 "0.00 s sooner"라고 쓰지 않는다', () => {
    const { summary, path } = fixture_build_described({ ...base, angleDeg: 1 });
    expect(summary.rangeLostMetres).toBeGreaterThanOrEqual(B6_MERGE_LIMIT_M);
    expect(display_format_seconds(summary.vacuum.flightSeconds - summary.drag.flightSeconds)).toBe('0.00');
    expect(path).toContain('short of the dashed one; the two landing times differ by less than 0.01 s.');
    expect(path).not.toContain('0.00 s');
    // 차이가 찍히는 상태는 그대로 숫자를 적는다.
    expect(fixture_build_described(base).path).toMatch(/short of the dashed one and \d+\.\d\d s sooner\./);
  });

  it('⑤ 잃은 비율·최적각 이동이 반올림해 0이면 "0%"·"0.0 degrees"를 단정하지 않는다', () => {
    expect([0, 1, 2].map(display_format_resolution)).toEqual(['1', '0.1', '0.01']);
    const params = { ...base, ...B6_THIN_AIR, areaM2: 0.000108192 };
    const { summary, sweep, verdict } = fixture_build_described(params);
    expect(Math.max(summary.rangeLostMetres, summary.apexLostMetres)).toBeGreaterThanOrEqual(B6_MERGE_LIMIT_M);
    expect((1 - summary.rangeRatio) * 100).toBeLessThan(0.5);
    expect(Math.abs(45 - sweep.optimum.angleDeg)).toBeLessThan(0.05);
    expect(verdict.detail).toContain('— less than 1% of the distance gone.');
    expect(verdict.detail).toContain('The peak has moved less than 0.1 degrees off the vacuum answer of 45°');
    expect(verdict.detail).not.toContain(' 0% ');
    expect(verdict.detail).not.toContain('0.0 degrees');
    // 기본 설정은 숫자를 그대로 적는다.
    const usual = fixture_build_described(base).verdict.detail;
    expect(usual).toMatch(/— \d+% of the distance gone\. The peak has moved \d+\.\d degrees off/);
  });

  it('⑥ 0°·90°에서는 "호의 모양" 문장을 빼고, 그 사이 각도에서는 남긴다', () => {
    // 그림 크기는 데스크톱 스텁(폭 900 px → 그림 822×230 px). 축척 차가 커서 ③이 걸리지 않는다.
    const drawn = { spanX: 1, spanY: 1, plotWidth: 822, plotHeight: 230 };
    const shape = 'so the arc on screen is not its true shape';
    for (const params of [{ ...base, angleDeg: 0 }, { ...base, angleDeg: 90 }, { ...base, angleDeg: 0, dragCoefficient: 0 }]) {
      const caption = display_describe_path(model_calculate_summary(params), drawn);
      expect(caption).toContain('The axes run to');
      expect(caption).not.toContain(shape);
      expect(caption).not.toContain('same scale');
    }
    for (const angleDeg of [0.5, 40, 89.5]) {
      expect(display_describe_path(model_calculate_summary({ ...base, angleDeg }), drawn)).toContain(shape);
    }
  });
});

// ── B6 3회차 (2026-10-03) ──────────────────────────────────────

describe('B6 3회차 — "호의 모양" 문장을 그려진 것으로 판정한다', () => {
  const base = model_build_default_parameters();
  const shape = 'They are not to the same scale as each other, so the arc on screen is not its true shape.';
  /** 스텁 폭: 데스크톱 900 px(그림 822×230), 폰 300 px(그림 222×230). */
  const WIDTH_DESKTOP_PX = 900;
  const WIDTH_PHONE_PX = 300;

  function fixture_read_path_note(search, width) {
    const { dom, widget_reset } = widget_build_mounted({ search, width });
    const note = dom.root.querySelectorAll('.legend-note')[0].textContent;
    const label = dom.root.querySelectorAll('canvas')[0].getAttribute('aria-label');
    widget_reset();
    dom.restore();
    openDom = null;
    expect(label).toBe(note);
    expect(note).toContain('The axes run to');
    return note;
  }

  it('정점이 1 px 미만으로 그려지면(1°·5~6 m/s, 수평 선분) 문장을 뺀다 — 항력 있음·공기항 0 둘 다', () => {
    for (const width of [WIDTH_DESKTOP_PX, WIDTH_PHONE_PX]) {
      for (const search of ['?th=1&v0=5', '?th=1&v0=6', '?th=1&v0=5&cd=0', '?th=1&v0=6&cd=0', '?th=1&v0=5&rho=0.015&cd=0.01']) {
        expect(fixture_read_path_note(search, width), `${search} @${width}`).not.toContain('same scale');
      }
    }
    // 같은 각도라도 정점이 1 px 이상이면 문장이 남는다(1°·40 m/s: 정점 0.0249 m → 5.7 px).
    expect(fixture_read_path_note('?th=1&v0=40', WIDTH_DESKTOP_PX)).toContain(shape);
  });

  it('두 축의 px/m 비가 10% 미만으로 다르면 문장을 뺀다 — 폰의 3.5%, 데스크톱의 46°', () => {
    // 10°·5 m/s: 두 축 끝이 다 1 m(최소 폭). 폰 그림 222×230 px → 축척 차 3.6%, 데스크톱 822×230 → 257%.
    expect(fixture_read_path_note('?th=10&v0=5', WIDTH_PHONE_PX)).not.toContain('same scale');
    expect(fixture_read_path_note('?th=10&v0=5', WIDTH_DESKTOP_PX)).toContain(shape);
    // 46°·40 m/s(데스크톱): 822/166.3 px/m 대 230/46.4 px/m — 0.3% 차이. 40°는 24% 차이.
    expect(fixture_read_path_note('?th=46&v0=40', WIDTH_DESKTOP_PX)).not.toContain('same scale');
    expect(fixture_read_path_note('?th=40&v0=40', WIDTH_DESKTOP_PX)).toContain(shape);
  });

  it('0°·90° 분기와 겹치지 않는다 — 90°는 축척이 크게 달라도, 0°는 정점이 0 px라도 각도 분기가 먼저다', () => {
    for (const width of [WIDTH_DESKTOP_PX, WIDTH_PHONE_PX]) {
      for (const search of ['?th=0', '?th=90', '?th=90&cd=0', '?th=0&v0=5']) {
        const note = fixture_read_path_note(search, width);
        expect(note).not.toContain('same scale');
      }
    }
    expect(fixture_read_path_note('?th=90', WIDTH_DESKTOP_PX)).toMatch(/^At 90° both paths run up and down/);
    expect(fixture_read_path_note('?th=0', WIDTH_DESKTOP_PX)).toMatch(/^At 0° neither path leaves the ground/);
  });

  it('문턱 양쪽: 정점 높이 1 px·축척 차 10%가 정확히 경계다 (상수를 바꾸면 걸린다)', () => {
    expect(CHART_ARC_MIN_HEIGHT_PX).toBe(1);
    expect(CHART_SCALE_MISMATCH_MIN).toBe(0.1);
    const summary = model_calculate_summary({ ...base, angleDeg: 30 });
    const apex = summary.vacuum.apexHeightMetres;
    // 세로: spanY를 정점이 0.99 px / 1.01 px로 그려지게 잡는다. 가로는 축척 차가 크게.
    const tall = (px) => ({ spanY: (apex * 230) / px, plotHeight: 230 });
    const wide = (drawn) => ({ ...drawn, spanX: drawn.spanY, plotWidth: 230 * 4 });
    expect(display_check_shape_distorted(summary, wide(tall(0.99)))).toBe(false);
    expect(display_check_shape_distorted(summary, wide(tall(1.01)))).toBe(true);
    // 가로: 같은 세로 축에서 px/m 비가 1.099 / 1.101.
    const plain = { spanX: 200, spanY: 200, plotHeight: 230 };
    expect(display_check_shape_distorted(summary, { ...plain, plotWidth: 230 * 1.099 })).toBe(false);
    expect(display_check_shape_distorted(summary, { ...plain, plotWidth: 230 * 1.101 })).toBe(true);
    expect(display_check_shape_distorted(summary, { ...plain, plotWidth: 230 / 1.101 })).toBe(true);
    expect(display_check_shape_distorted(summary, { ...plain, plotWidth: 230 / 1.099 })).toBe(false);
    // 그림이 없으면 판정하지 않는다.
    expect(display_check_shape_distorted(summary, null)).toBe(false);
  });

  it('Shot put 프리셋의 면적 손잡이가 "d = 96 mm"를 찍는다 (95 mm 하한 아래 94.58 mm를 95로 반올림해 보이던 결함)', () => {
    const shot = PROJECTILE_PRESETS.find((item) => item.key === 'shot');
    expect(display_format_area(shot.areaM2)).toBe('7.231 × 10⁻³ m² (d = 96 mm sphere)');
    expect(display_format_mass(shot.massKg)).toBe('4.087 kg');
    const { dom } = widget_build_mounted();
    fixture_pick_preset(dom, 'shot');
    const area = fixture_read_sliders(dom)[SLIDER_INDEX.area];
    expect(area.getAttribute('aria-valuetext')).toBe('7.231 × 10⁻³ m² (d = 96 mm sphere)');
  });
});
