/**
 * 캔버스 준비 모듈 테스트.
 *
 * 이 파일에는 테스트가 아예 없었다. 그래서 픽셀비 상한을 2에서 8로 바꿔도,
 * 아이콘 좌표계를 24에서 48로 바꿔도 251건이 전부 통과했다.
 * **픽셀비 상한 2는 규약 위젯 표준의 명문 항목이다** — 상한이 없으면 3배 화면에서
 * 백킹 스토어가 9배가 되어 메모리가 튄다. 눈으로는 절대 안 보인다.
 *
 * DOM이 없으므로 캔버스와 컨텍스트를 스텁으로 만들어 넣는다.
 * 스텁은 호출을 기록만 한다 — 실제로 그리지 않아도 좌표와 배율은 전부 검사된다.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  CANVAS_MAX_PIXEL_RATIO,
  CANVAS_ICON_VIEWBOX,
  CANVAS_ICON_STROKE_WIDTH,
  canvas_read_css_color,
  canvas_setup_context,
  canvas_draw_icon,
} from './canvas.js';

/** 호출을 전부 기록하는 2d 컨텍스트 스텁. */
function canvas_build_context() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    read: (name) => calls.filter((call) => call[0] === name),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
}

/** clientWidth와 getContext만 흉내내는 캔버스 스텁. */
function canvas_build_stub(cssWidth, context = canvas_build_context()) {
  return {
    clientWidth: cssWidth,
    width: 0,
    height: 0,
    style: {},
    context,
    getContext: () => context,
  };
}

/** 이 파일에서만 devicePixelRatio를 흉내낸다. 끝나면 반드시 되돌린다. */
function canvas_run_with_ratio(ratio, run) {
  const had = 'window' in globalThis;
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: ratio };
  try {
    return run();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

afterEach(() => {
  delete globalThis.Path2D;
});

describe('백킹 스토어 — 픽셀비 상한 2 (규약 항목)', () => {
  it('고DPI 화면에서 백킹 스토어를 키운다', () => {
    const canvasEl = canvas_build_stub(400);
    const surface = canvas_run_with_ratio(2, () => canvas_setup_context(canvasEl, 300));
    expect(surface.pixelRatio).toBe(2);
    expect(canvasEl.width).toBe(800);
    expect(canvasEl.height).toBe(600);
  });

  it('3배 화면에서도 2배까지만 키운다 — 상한이 없으면 메모리가 9배가 된다', () => {
    // 상한을 8로 바꾸면 여기서 폭이 1200이 된다. 화면은 여전히 멀쩡해 보인다.
    const canvasEl = canvas_build_stub(400);
    const surface = canvas_run_with_ratio(3, () => canvas_setup_context(canvasEl, 300));
    expect(surface.pixelRatio).toBe(2);
    expect(canvasEl.width).toBe(800);
    expect(canvasEl.height).toBe(600);
    // 상한 자체를 리터럴로 못박는다 (상수를 상수로 재면 동어반복이다)
    expect(CANVAS_MAX_PIXEL_RATIO).toBe(2);
  });

  it('상한 아래의 픽셀비는 그대로 쓴다 — 상한이 아니라 최소값이 되면 안 된다', () => {
    const canvasEl = canvas_build_stub(400);
    const surface = canvas_run_with_ratio(1.5, () => canvas_setup_context(canvasEl, 200));
    expect(surface.pixelRatio).toBe(1.5);
    expect(canvasEl.width).toBe(600);
    expect(canvasEl.height).toBe(300);
  });

  it('devicePixelRatio가 없으면 1로 본다', () => {
    const canvasEl = canvas_build_stub(400);
    const surface = canvas_run_with_ratio(undefined, () => canvas_setup_context(canvasEl, 200));
    expect(surface.pixelRatio).toBe(1);
    expect(canvasEl.width).toBe(400);
  });

  it('컨텍스트를 CSS 픽셀 좌표로 되돌린다 — 그리는 쪽은 픽셀비를 몰라도 된다', () => {
    const context = canvas_build_context();
    const canvasEl = canvas_build_stub(400, context);
    const surface = canvas_run_with_ratio(2, () => canvas_setup_context(canvasEl, 300));
    expect(surface.width).toBe(400); // CSS 픽셀이지 백킹 스토어 픽셀이 아니다
    expect(surface.height).toBe(300);
    expect(context.read('setTransform')[0]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
    expect(context.read('clearRect')[0]).toEqual(['clearRect', 0, 0, 400, 300]);
    expect(canvasEl.style.height).toBe('300px');
  });

  it('폭이 0이면 null — 호출자는 그리지 말고 돌아가야 한다', () => {
    expect(canvas_setup_context(canvas_build_stub(0), 300)).toBe(null);
    expect(canvas_setup_context(canvas_build_stub(400), 0)).toBe(null);
    expect(canvas_setup_context(null, 300)).toBe(null);
    expect(canvas_setup_context({}, 300)).toBe(null);
    expect(canvas_setup_context({ getContext: () => null, clientWidth: 400 }, 300)).toBe(null);
  });

  it('캔버스 폭이 0이면 부모 폭을 쓴다', () => {
    const canvasEl = canvas_build_stub(0);
    canvasEl.parentElement = { clientWidth: 250 };
    const surface = canvas_run_with_ratio(1, () => canvas_setup_context(canvasEl, 100));
    expect(surface.width).toBe(250);
  });
});

describe('색 — CSS 변수를 못 읽으면 폴백', () => {
  it('변수를 못 읽는 환경에서 하드코딩 폴백을 준다', () => {
    // 폴백이 없으면 테마가 바뀌었을 때 그래프가 통째로 무색이 된다.
    expect(canvas_read_css_color(null, '--series-1', '#1f4e79')).toBe('#1f4e79');
    expect(canvas_read_css_color({}, '--series-1', '#1f4e79')).toBe('#1f4e79');
  });

  it('변수가 있으면 그 값을 쓴다', () => {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '  #abcdef ' });
    try {
      expect(canvas_read_css_color({}, '--series-1', '#1f4e79')).toBe('#abcdef');
      globalThis.getComputedStyle = () => ({ getPropertyValue: () => '   ' });
      expect(canvas_read_css_color({}, '--series-1', '#1f4e79')).toBe('#1f4e79'); // 빈 값도 폴백
    } finally {
      if (previous === undefined) delete globalThis.getComputedStyle;
      else globalThis.getComputedStyle = previous;
    }
  });
});

describe('아이콘 — 24 좌표계로 그린다', () => {
  /** Path2D가 없는 환경이므로 문자열만 들고 있는 스텁을 넣는다. */
  function install_path2d() {
    const made = [];
    globalThis.Path2D = class {
      constructor(data) {
        this.data = data;
        made.push(data);
      }
    };
    return made;
  }

  it('size/24 배율로 축소한다 — 좌표계를 48로 바꾸면 배율이 절반이 된다', () => {
    install_path2d();
    const context = canvas_build_context();
    expect(canvas_draw_icon(context, { fill: 'M0 0 L24 24' }, 100, 50, 48)).toBe(true);
    // 48px로 그리려면 24 좌표계를 2배로 키워야 한다. 좌표계가 48이면 1배가 된다.
    expect(context.read('scale')[0]).toEqual(['scale', 2, 2]);
    // 중심이 (100, 50)이 되도록 좌상단으로 옮긴다
    expect(context.read('translate')[0]).toEqual(['translate', 76, 26]);
    expect(CANVAS_ICON_VIEWBOX).toBe(24);
  });

  it('선 굵기는 좌표계 안에서 정한다 — 축소돼도 면과 선의 비율이 유지된다', () => {
    const made = install_path2d();
    const context = canvas_build_context();
    canvas_draw_icon(context, { fill: 'M0 0', stroke: 'M1 1' }, 10, 10, 24);
    expect(context.lineWidth).toBe(CANVAS_ICON_STROKE_WIDTH);
    expect(CANVAS_ICON_STROKE_WIDTH).toBe(1.7);
    expect(made).toEqual(['M0 0', 'M1 1']);
    // save/restore가 짝을 이룬다 — 아니면 다음 그리기가 아이콘 배율을 물려받는다
    expect(context.read('save')).toHaveLength(1);
    expect(context.read('restore')).toHaveLength(1);
  });

  it('선 path가 없으면 stroke를 부르지 않는다', () => {
    install_path2d();
    const context = canvas_build_context();
    canvas_draw_icon(context, { fill: 'M0 0' }, 10, 10, 24);
    expect(context.read('stroke')).toHaveLength(0);
    expect(context.read('fill')).toHaveLength(1);
  });

  it('Path2D가 없으면 조용히 아무것도 안 그린다 — 아이콘 때문에 위젯이 죽으면 안 된다', () => {
    const context = canvas_build_context();
    expect(canvas_draw_icon(context, { fill: 'M0 0' }, 10, 10, 24)).toBe(false);
    expect(context.calls).toHaveLength(0);
  });

  it('컨텍스트나 path가 없으면 false', () => {
    install_path2d();
    expect(canvas_draw_icon(null, { fill: 'M0 0' }, 10, 10, 24)).toBe(false);
    expect(canvas_draw_icon(canvas_build_context(), null, 10, 10, 24)).toBe(false);
    expect(canvas_draw_icon(canvas_build_context(), { stroke: 'M0 0' }, 10, 10, 24)).toBe(false);
  });
});
