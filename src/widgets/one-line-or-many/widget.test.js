/**
 * 줄 하나 vs 줄 여럿 — 위젯 테스트
 *
 * 순수 헬퍼(축 계산·표시 문자열·URL 상태)와, DOM 스텁 위에서만 드러나는 것
 * (리스너·타이머·rAF 수명, 접근성 속성)을 함께 본다.
 * **소스 문자열을 훑지 않는다.** 동작을 계측한다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  QUEUE_COUNTER_MAX,
  QUEUE_COUNTER_DEFAULT,
  QUEUE_LOAD_MIN,
  QUEUE_LOAD_MAX,
  QUEUE_LOAD_DEFAULT,
  QUEUE_SERVICE_DEFAULT_MINUTES,
  QUEUE_CV_DEFAULT,
  model_calculate_result,
  model_calculate_sweep,
} from './model.js';
import {
  QUEUE_SEED_DEFAULT,
  widget_mount,
  url_read_state,
  chart_calculate_scale,
  chart_calculate_series_start,
  display_format_minutes,
  display_format_axis_minutes,
  display_format_ratio,
  display_format_ratio_cell,
  display_check_ratio_meaningless,
  display_format_percent,
  display_describe_verdict,
  display_describe_exactness,
} from './widget.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너 개수. **리터럴이다.**
 * 슬라이더 4개 × (input, change) = 8 + window resize = 9 + 프리셋 버튼 3개의 click = 12
 */
const WIDGET_LISTENER_COUNT = 12;

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
  it('파라미터가 없으면 기본값으로 뜬다 (빈 폼 금지)', () => {
    expect(url_read_state('')).toEqual({
      counterCount: QUEUE_COUNTER_DEFAULT,
      load: QUEUE_LOAD_DEFAULT,
      serviceMinutes: QUEUE_SERVICE_DEFAULT_MINUTES,
      variation: QUEUE_CV_DEFAULT,
      seed: QUEUE_SEED_DEFAULT,
    });
  });

  it('깨진 값은 최솟값이 아니라 기본값으로 돌아간다', () => {
    // `Number('')`는 0, `Number('0x10')`은 16이라 `??`로는 안 걸러진다.
    const state = url_read_state('?c=&rho=0x10&es=abc&cv=&seed=1e5');
    expect(state.counterCount).toBe(QUEUE_COUNTER_DEFAULT);
    expect(state.load).toBe(QUEUE_LOAD_DEFAULT);
    expect(state.serviceMinutes).toBe(QUEUE_SERVICE_DEFAULT_MINUTES);
    expect(state.variation).toBe(QUEUE_CV_DEFAULT);
    expect(state.seed).toBe(QUEUE_SEED_DEFAULT);
  });

  it('범위를 벗어난 값은 잘리고 눈금 위로 맞는다', () => {
    const state = url_read_state('?c=99&rho=3&es=99&cv=9');
    expect(state.counterCount).toBe(QUEUE_COUNTER_MAX);
    expect(state.load).toBe(QUEUE_LOAD_MAX);
    const snapped = url_read_state('?rho=0.8349&es=3.3&cv=1.13');
    expect(snapped.load).toBe(0.83);
    expect(snapped.serviceMinutes).toBe(3.5);
    expect(snapped.variation).toBe(1.15);
  });
});

// ── 축 ──────────────────────────────────────────────────────

describe('로그 세로축', () => {
  it('0분(잘린 퍼센타일)을 범위 계산에서 뺀다 — log(0)이 축을 무너뜨리지 않게', () => {
    const points = [
      { load: 0.1, singleMean: 0.01, separateMean: 0.3, singlePercentile: 0, separatePercentile: 0 },
      { load: 0.9, singleMean: 5, separateMean: 27, singlePercentile: 12, separatePercentile: 60 },
    ];
    const scale = chart_calculate_scale(points);
    expect(Number.isFinite(scale.low)).toBe(true);
    expect(scale.low).toBeGreaterThan(0);
    expect(scale.high).toBeGreaterThan(scale.low);
    expect(scale.low).toBeLessThan(0.01);
    expect(scale.high).toBeGreaterThan(60);
  });

  it('양수 값이 하나도 없어도 유효한 축을 낸다', () => {
    const scale = chart_calculate_scale([
      { load: 0.1, singleMean: 0, separateMean: 0, singlePercentile: 0, separatePercentile: 0 },
    ]);
    expect(scale.low).toBeGreaterThan(0);
    expect(scale.high).toBeGreaterThan(scale.low);
  });

  it('값이 전부 같아도 최소 표시 폭을 준다 (좌표가 NaN이 되지 않게)', () => {
    const scale = chart_calculate_scale([
      { load: 0.1, singleMean: 4, separateMean: 4, singlePercentile: 4, separatePercentile: 4 },
    ]);
    expect(Math.log10(scale.high) - Math.log10(scale.low)).toBeGreaterThan(0.4);
  });

  it('실제 스윕에서 네 계열이 전부 축 안에 들어온다', () => {
    for (const counterCount of [1, 4, 8]) {
      const points = model_calculate_sweep(counterCount, 3, 1);
      const scale = chart_calculate_scale(points);
      for (const point of points) {
        for (const value of [point.singleMean, point.separateMean, point.singlePercentile, point.separatePercentile]) {
          if (!(value > 0)) continue;
          expect(value).toBeGreaterThanOrEqual(scale.low);
          expect(value).toBeLessThanOrEqual(scale.high);
        }
      }
    }
  });

  it('퍼센타일 곡선의 시작점을 찾는다 — 없는 구간을 0에 눌러 붙이지 않는다', () => {
    const points = model_calculate_sweep(8, 3, 1);
    const start = chart_calculate_series_start(points, 'singlePercentile');
    expect(start).toBeGreaterThan(0); // c=8이면 왼쪽에서 잘린다
    expect(points[start].singlePercentile).toBeGreaterThan(0);
    expect(points[start - 1].singlePercentile).toBe(0);
  });

  it('한 번도 안 잘리는 계열은 시작점이 0이다', () => {
    const points = model_calculate_sweep(1, 3, 1);
    expect(chart_calculate_series_start(points, 'separateMean')).toBe(0);
  });
});

// ── 표시 문자열 ─────────────────────────────────────────────

describe('표시 문자열', () => {
  it('1분 아래에서는 자릿수를 늘린다 — 0.34와 0.44가 뭉개지지 않게', () => {
    expect(display_format_minutes(0.34)).toBe('0.34');
    expect(display_format_minutes(0.44)).toBe('0.44');
    expect(display_format_minutes(12.04)).toBe('12.0');
    expect(display_format_minutes(Number.NaN)).toBe('—');
  });

  it('축 눈금 라벨이 작은 값을 0으로 뭉개지 않는다', () => {
    // 로그 축의 바닥은 0이 될 수 없다. "0.00"이라 적히면 그림이 거짓말을 한다.
    expect(display_format_axis_minutes(0.00397)).toBe('0.0040');
    expect(display_format_axis_minutes(0.043)).toBe('0.043');
    expect(display_format_axis_minutes(0.4)).toBe('0.40');
    expect(display_format_axis_minutes(1)).toBe('1.0');
    expect(display_format_axis_minutes(212.4)).toBe('212');
    expect(display_format_axis_minutes(0)).toBe('—');
  });

  it('배수와 백분율 표기', () => {
    expect(display_format_ratio(5.365)).toBe('5.4×');
    expect(display_format_percent(0.8)).toBe('80%');
  });

  it('창구가 하나면 두 배치가 같은 배치라고 말한다', () => {
    const spoken = display_describe_verdict(model_calculate_result(1, 0.8, 3, 1));
    expect(spoken.headline).toContain('same layout');
    expect(spoken.verdict).toBe('hold');
  });

  it('퍼센타일이 0분인 설정에서 "0분"이 아니라 이유를 말한다', () => {
    const spoken = display_describe_verdict(model_calculate_result(8, 0.1, 3, 1));
    expect(spoken.detail).toContain('none at all');
  });

  it('CV가 1이 아니면 근사임을 말한다', () => {
    expect(display_describe_exactness(model_calculate_result(4, 0.8, 3, 1))).toContain('nothing approximated');
    expect(display_describe_exactness(model_calculate_result(4, 0.8, 3, 1.5))).toContain('approximation');
  });

  // 감사에서 확인된 결함: c=8·ρ=0.1에서 단일 대기열의 평균 대기가 0에 아주 가까운데도
  // 옛 표기는 "0.00분"으로 찍었고, 그 값을 분모로 삼은 비율은 "385095.7×"였다 —
  // 화면의 분모는 0인데 배수는 38만 배라는 앞뒤가 안 맞는 문구였다.
  describe('분모가 거의 0일 때 — 비율이 아니라 절댓값과 이유를 찍는다', () => {
    it('0이 아닌 값을 "0.00"으로 찍지 않는다', () => {
      // 손으로 계산한 대조값(node로 독립 검산): c=8, ρ=0.1, Es=3, CV=1에서
      // 단일 대기열 평균 대기 ≈ 8.655856e-7분. 옛 고정 두 자리로는 "0.00"이었다.
      const result = model_calculate_result(8, 0.1, 3, 1);
      expect(result.single.meanMinutes).toBeGreaterThan(0);
      expect(result.single.meanMinutes).toBeLessThan(0.001);
      const printed = display_format_minutes(result.single.meanMinutes);
      expect(printed).not.toBe('0.00');
      expect(Number.parseFloat(printed)).toBeGreaterThan(0);
    });

    it('그 경계에서 비율 대신 절댓값 둘과 "의미 없다"는 문장을 쓴다', () => {
      const result = model_calculate_result(8, 0.1, 3, 1);
      expect(display_check_ratio_meaningless(result.single.meanMinutes)).toBe(true);

      const spoken = display_describe_verdict(result);
      // 385095.7× 같은 배수가 찍히지 않는다.
      expect(spoken.headline).not.toContain('×');
      expect(spoken.headline).not.toMatch(/\d{3,}\s*×/);
      // 절댓값 둘이 헤드라인에 남는다.
      expect(spoken.headline).toContain(display_format_minutes(result.single.meanMinutes));
      expect(spoken.headline).toContain(display_format_minutes(result.separate.meanMinutes));
      expect(spoken.headline.toLowerCase()).toContain('too close to zero');
    });

    it('경계보다 위(분모가 충분히 큰)에서는 평소대로 비율을 찍는다', () => {
      // c=2, ρ=0.5는 분모가 충분히 크다(3분 근처) — 비교용 대조.
      const result = model_calculate_result(2, 0.5, 3, 1);
      expect(display_check_ratio_meaningless(result.single.meanMinutes)).toBe(false);
      const spoken = display_describe_verdict(result);
      expect(spoken.headline).toContain('×');
    });

    it('표의 "Mean cut by" 칸도 그 행에서는 대시를 찍는다', () => {
      const row = model_calculate_result(8, 0.1, 3, 1);
      expect(display_format_ratio_cell(row)).toBe('—');
      const normalRow = model_calculate_result(2, 0.5, 3, 1);
      expect(display_format_ratio_cell(normalRow)).toContain('×');
    });
  });

  it('판정 문장에 단정하는 표현이 없다 — 주어는 모델이다', () => {
    for (const counterCount of [1, 2, 4, 8]) {
      const sentence = Object.values(display_describe_verdict(model_calculate_result(counterCount, 0.8, 3, 1)))
        .join(' ')
        .toLowerCase();
      for (const banned of ['in reality', 'you should', 'we recommend', 'is better', 'proves', 'always faster']) {
        expect(sentence).not.toContain(banned);
      }
    }
  });
});

// ── 마운트·수명 ─────────────────────────────────────────────

describe('마운트와 수명', () => {
  it('붙는 리스너는 정확히 9개다', () => {
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
    expect(dom.listeners_run_event(dom.window, 'resize')).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);
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
  });

  it('애니메이션 프레임을 하나 예약하고, reset이 그것을 끊는다', () => {
    // 타이머와 따로 센다 — 타이머만 끊고 rAF를 남기면 리셋 뒤에도
    // 시뮬레이션이 계속 돌지만 타이머 잔여는 0이라 아무 표시도 나지 않는다.
    const { dom, widget_reset } = widget_build_mounted();
    expect(dom.frames_read_pending()).toBe(1);
    widget_reset();
    expect(dom.frames_read_pending()).toBe(0);
  });

  it('프레임이 돌면 시계가 나아가고 다음 프레임이 다시 예약된다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.root.querySelectorAll('.legend-note')[0].textContent;
    // 첫 프레임은 기준 시각을 잡기만 한다. 두 번째부터 시간이 흐른다.
    expect(dom.frames_run_pending(0)).toBe(1);
    expect(dom.frames_run_pending(5000)).toBe(1);
    expect(dom.frames_read_pending()).toBe(1);
    expect(dom.root.querySelectorAll('.legend-note')[0].textContent).not.toBe(before);
  });

  it('애니메이션이 돌아도 주소창을 건드리지 않는다 — 그림은 숫자를 만들지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.frames_run_pending(0);
    dom.frames_run_pending(3000);
    expect(dom.urlsWritten.length).toBe(before);
  });
});

// ── 첫 렌더 ─────────────────────────────────────────────────

describe('첫 렌더', () => {
  it('슬라이더 4개와 캔버스 2개가 있다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.root.querySelectorAll('input').length).toBe(4);
    expect(dom.root.querySelectorAll('canvas').length).toBe(2);
  });

  it('카드 네 장이 기본 설정의 값으로 채워진다', () => {
    const { dom } = widget_build_mounted();
    const result = model_calculate_result(
      QUEUE_COUNTER_DEFAULT, QUEUE_LOAD_DEFAULT, QUEUE_SERVICE_DEFAULT_MINUTES, QUEUE_CV_DEFAULT,
    );
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values).toEqual([
      display_format_minutes(result.single.meanMinutes),
      display_format_minutes(result.separate.meanMinutes),
      display_format_minutes(result.single.percentileMinutes),
      display_format_minutes(result.separate.percentileMinutes),
    ]);
    // 본문 블록 4가 인용하는 숫자가 실제로 화면에 뜬다.
    expect(values[1]).toBe('12.0');
    expect(values[0]).toBe('2.2');
  });

  it('표가 창구 1~8을 채우고 현재 줄을 표시한다', () => {
    const { dom } = widget_build_mounted();
    const rows = dom.root.querySelectorAll('tbody').flatMap((body) => body.children);
    expect(rows.length).toBe(QUEUE_COUNTER_MAX);
    const current = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain(String(QUEUE_COUNTER_DEFAULT));
  });

  it('판정 배너가 상태를 달고 뜬다', () => {
    const { dom } = widget_build_mounted();
    const verdict = dom.root.querySelector('.verdict');
    expect(['hold', 'edge', 'break']).toContain(verdict.getAttribute('data-state'));
  });

  it('로드하자마자 주소창에 상태가 실린다', () => {
    const { dom } = widget_build_mounted();
    expect(dom.urlsWritten.at(-1)).toContain('c=4');
    expect(dom.urlsWritten.at(-1)).toContain('seed=');
  });

  it('범례에 색 견본 네 칸이 있고 선 종류의 뜻이 글로 적힌다', () => {
    const { dom } = widget_build_mounted();
    const items = dom.root.querySelectorAll('.legend-item');
    expect(items.length).toBe(4);
    const classes = dom.root.querySelectorAll('.legend-key').map((el) => String(el.className));
    // 색만으로 갈리지 않는다 — 실선 둘, 점선 둘.
    expect(classes.filter((name) => name.includes('legend-tail-')).length).toBe(2);
    expect(classes.filter((name) => name.includes('legend-mean-')).length).toBe(2);
    // `.legend-key`는 몬티홀·종이접기도 쓰는 클래스다. 견본에 그대로 붙어 있어야 한다.
    for (const name of classes) expect(name.startsWith('legend-key ')).toBe(true);
    const legendText = dom.root.querySelector('.widget-legend').textContent;
    expect(legendText).toContain('95th');
    expect(legendText).toContain('mean');
  });

  it('캔버스 폭이 0이어도 범례 문구가 비지 않는다', () => {
    // 숨긴 탭·display:none이면 렌더가 null을 준다. 그때 범례가 빈 문자열로 남으면
    // 선 종류의 뜻이 화면에서 사라진다.
    const { dom } = widget_build_mounted({ width: 0 });
    const notes = dom.root.querySelectorAll('.legend-note').map((el) => el.textContent);
    expect(notes.some((text) => text.includes('Solid = mean wait'))).toBe(true);
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

  it('이용률 슬라이더가 aria-valuetext로 백분율을 준다 (0.8이라고 읽히지 않게)', () => {
    const { dom } = widget_build_mounted();
    const texts = dom.root
      .querySelectorAll('input')
      .map((input) => input.getAttribute('aria-valuetext'))
      .filter(Boolean);
    expect(texts).toContain('80%');
  });

  it('두 캔버스에 role=img와 요약 aria-label이 붙는다', () => {
    const { dom } = widget_build_mounted();
    const canvases = dom.root.querySelectorAll('canvas');
    for (const canvas of canvases) {
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toBeTruthy();
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
});

// ── 조작 ────────────────────────────────────────────────────

describe('조작', () => {
  it('창구 수를 바꾸면 카드와 표가 따라간다', () => {
    const { dom } = widget_build_mounted();
    const counters = dom.root.querySelectorAll('input')[0];
    counters.value = '2';
    dom.listeners_run_event(counters, 'change');

    const expected = model_calculate_result(2, QUEUE_LOAD_DEFAULT, QUEUE_SERVICE_DEFAULT_MINUTES, QUEUE_CV_DEFAULT);
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(display_format_minutes(expected.single.meanMinutes));
    expect(dom.urlsWritten.at(-1)).toContain('c=2');
  });

  it('창구가 하나면 두 배치의 카드가 같은 값이 된다', () => {
    const { dom } = widget_build_mounted();
    const counters = dom.root.querySelectorAll('input')[0];
    counters.value = '1';
    dom.listeners_run_event(counters, 'change');
    const values = dom.root.querySelectorAll('.readout-value').map((el) => el.textContent);
    expect(values[0]).toBe(values[1]);
    expect(values[2]).toBe(values[3]);
  });

  it('input은 디바운스되고 change는 즉시 반영된다', () => {
    const { dom } = widget_build_mounted();
    const load = dom.root.querySelectorAll('input')[1];
    const before = dom.urlsWritten.length;

    load.value = '0.5';
    dom.listeners_run_event(load, 'input');
    expect(dom.urlsWritten.length).toBe(before);
    dom.timers_run_pending();
    expect(dom.urlsWritten.length).toBe(before + 1);

    load.value = '0.6';
    dom.listeners_run_event(load, 'change');
    expect(dom.urlsWritten.length).toBe(before + 2);
  });

  it('창구 수를 바꾸면 애니메이션의 줄 개수도 바뀐다', () => {
    const { dom } = widget_build_mounted();
    const counters = dom.root.querySelectorAll('input')[0];
    counters.value = '2';
    dom.listeners_run_event(counters, 'change');
    const label = dom.root.querySelectorAll('.legend-note')[0].textContent;
    expect(label).toContain('2 counters');
  });

  it('resize는 다시 그리기만 한다 — 모델을 다시 부르지 않는다', () => {
    const { dom } = widget_build_mounted();
    const before = dom.urlsWritten.length;
    dom.listeners_run_event(dom.window, 'resize');
    dom.timers_run_pending();
    // 다시 그리기는 주소창을 건드리지 않는다.
    expect(dom.urlsWritten.length).toBe(before);
  });

  it('프리셋 버튼 세 개가 있고, 누르면 창구 수·이용률이 함께 바뀐다', () => {
    const { dom } = widget_build_mounted();
    const buttons = dom.root.querySelectorAll('[data-preset]');
    expect(buttons.length).toBe(3);

    const eightIdleButton = buttons.find((button) => button.dataset.preset === 'eight-idle');
    expect(eightIdleButton).toBeTruthy();
    dom.listeners_run_event(eightIdleButton, 'click');

    const inputs = dom.root.querySelectorAll('input');
    expect(inputs[0].value).toBe('8');
    expect(inputs[1].value).toBe('0.1');
    // 이 프리셋이 바로 결함 6의 경계 — 비율이 아니라 "의미 없다"는 문장이 뜬다.
    const verdictText = dom.root.querySelector('.verdict').textContent;
    expect(verdictText.toLowerCase()).toContain('too close to zero');
  });
});
