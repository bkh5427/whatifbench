/**
 * 종이접기 위젯의 **수명과 접근성** — DOM 스텁으로 실제로 붙였다 뗀다.
 *
 * `widget.test.js`는 순수 함수(자 좌표·축·캡션 문자열)를 본다. 여기는 그 함수들이
 * DOM에 얹혔을 때만 드러나는 것들을 본다:
 *   - 붙인 리스너를 전부 떼는가 (안 떼면 두 번 붙일 때 조용히 샌다)
 *   - 예약한 타이머를 전부 끊는가
 *   - 이중 마운트 가드가 실제로 두 번째를 막는가
 *   - 슬라이더의 `aria-valuetext`가 단수를 아는가
 *
 * **소스 문자열을 훑지 않는다.** 그 방식은 변수 이름 하나로 우회된다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { widget_mount } from './widget.js';
import { FOLD_COUNT_MAX } from './model.js';
import { fixture_create_dom } from '../_shared/dom-stub.js';

/**
 * 위젯이 붙이는 리스너의 개수. **리터럴이다.**
 * 슬라이더 2개 × (pointerdown, input, change) = 6
 * + window pointerup·pointercancel = 2
 * + 축 토글 라디오 2개의 change = 2
 * + window resize = 1
 * + 프리셋 버튼 3개의 click = 3  → 14
 */
const WIDGET_LISTENER_COUNT = 14;

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

describe('리스너 수명 — 실제로 붙고 떼는 것을 센다', () => {
  it('붙는 리스너는 정확히 14개다', () => {
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
    // 디바운스 + 리드로우. 배지 게이트가 체류 중이면 그것까지 하나 더 뜬다.
    expect(dom.timers_read_pending()).toBeGreaterThanOrEqual(2);

    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it('뗀 뒤에는 슬라이더를 움직여도 아무 일도 일어나지 않는다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    const slider = dom.root.querySelector('input');
    expect(dom.listeners_run_event(slider, 'input')).toBe(0);
    expect(dom.listeners_run_event(dom.window, 'pointerup')).toBe(0);
    expect(dom.timers_read_pending()).toBe(0);
  });
});

describe('프리셋 버튼 — 두께·접기 횟수를 함께 싣는다', () => {
  it('세 프리셋 버튼이 있고, 누르면 두 슬라이더가 함께 바뀐다', () => {
    const { dom } = widget_build_mounted();
    const buttons = dom.root.querySelectorAll('[data-preset]');
    expect(buttons.length).toBe(3);

    const cardButton = buttons.find((button) => button.dataset.preset === 'card-few-folds');
    expect(cardButton).toBeTruthy();
    dom.listeners_run_event(cardButton, 'click');

    // 스텁 셀렉터는 `.class`/`tag`/`[attr="value"]`만 읽으므로(dom-stub.js 주석 참고)
    // `id` 프로퍼티를 직접 대조한다.
    const inputs = dom.root.querySelectorAll('input');
    const thicknessInput = inputs.find((el) => el.id === 'fold-thickness');
    const foldInput = inputs.find((el) => el.id === 'fold-count');
    expect(thicknessInput.value).toBe('0.5');
    expect(foldInput.value).toBe('13');
  });
});

describe('이중 마운트 가드', () => {
  it('같은 자리에 두 번 붙이면 두 번째는 아무것도 안 한다', () => {
    // 모듈이 두 번 평가되면(HMR·스크립트 중복) 리스너가 두 벌이 되어 조용히 샌다.
    const { dom } = widget_build_mounted();
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it('뗀 자리에는 다시 붙을 수 있다 — 그리고 또 전부 떨어진다', () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    const second = widget_mount(dom.root);
    expect(second).not.toBeNull();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT * 2);
    second();
    expect(dom.listeners_read_live()).toBe(0);
    expect(dom.timers_read_pending()).toBe(0);
  });
});

describe('판정 배너는 판정 3색을 쓰지 않는다', () => {
  // 3색(`--hold`/`--edge`/`--break`)은 "가정이 성립/경계/파탄" 전용이다.
  // 접기 슬라이더가 달에 못 미친 것은 모델의 파탄이 아니라 손잡이 위치일 뿐이다.
  //
  // **소스 검사가 아니라 렌더 뒤의 속성을 본다.** 앞선 판본은 소스에서
  // `verdict.dataset.state`를 찾았는데, `setAttribute('data-state', …)`로 쓰면
  // 그대로 통과했다. 여기서는 어느 경로로 붙이든 속성이 남으면 걸린다.
  it.each([
    ['달에 못 미친 설정', '?mm=0.10&folds=0'],
    ['달을 넘긴 설정', `?mm=0.10&folds=${FOLD_COUNT_MAX}`],
  ])('%s에서 data-state가 없다', (_name, search) => {
    const { dom } = widget_build_mounted({ search });
    const verdict = dom.root.querySelector('.verdict');
    expect(verdict.getAttribute('data-state')).toBeNull();
    expect(verdict.hasAttribute('data-state')).toBe(false);
    // 배너가 비어 있으면 위 단언이 공허해진다. 말은 하고 있어야 한다.
    expect(verdict.textContent).toContain('the Moon');
  });
});

describe('aria-valuetext가 단수를 안다', () => {
  /** 접기 슬라이더의 `aria-valuetext`. id로 찾는다. */
  function widget_read_fold_valuetext(dom) {
    return dom.root
      .querySelectorAll('input')
      .find((el) => el.id === 'fold-count')
      .getAttribute('aria-valuetext');
  }

  it.each([
    [0, '0 folds'],
    [1, '1 fold —'],
    [2, '2 folds'],
    [42, '42 folds'],
  ])('folds=%i → "%s"로 시작한다', (folds, expected) => {
    const { dom } = widget_build_mounted({ search: `?mm=0.10&folds=${folds}` });
    expect(widget_read_fold_valuetext(dom)).toContain(expected);
  });

  it('1접기에서 "1 folds"라고 읽지 않는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=1' });
    expect(widget_read_fold_valuetext(dom)).not.toContain('1 folds');
    // 자 설명(캔버스의 aria-label)도 같은 문장을 만든다.
    expect(dom.root.querySelector('canvas').getAttribute('aria-label')).not.toContain('After 1 folds');
  });
});

// ═══════════════════════════════════════════════════════════
// 이해 비용 — 화면에 실제로 붙는 글자를 본다
// 아래는 전부 "숫자는 있는데 그게 무슨 뜻인지 화면에 없다"였던 자리다.
// 순수 함수 테스트로는 안 잡힌다 — 함수를 만들어 두고 **부르지 않아도** 통과한다.
// ═══════════════════════════════════════════════════════════

/** 히어로의 작은 글자 줄들. [0]은 사람이 읽는 길이, [1]은 다음 기준점. */
function widget_read_hero_lines(dom) {
  return dom.root.querySelectorAll('.scale-human').map((el) => el.textContent);
}

function widget_read_readout_notes(dom) {
  return dom.root.querySelectorAll('.readout').map((box) => {
    const lines = box.querySelectorAll('.readout-label');
    return lines[lines.length - 1].textContent;
  });
}

describe('히어로 — 배지는 "여기까지 왔다"만 말한다. 다음이 없으면 첫 화면이 결론뿐이다', () => {
  it('다음 기준점과 남은 접기 수가 글자로 나온다', () => {
    // 0.10 mm · 42접기에서 달을 막 넘었고, 다음은 태양의 지름(44접기)이다.
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    expect(widget_read_hero_lines(dom)[1]).toBe('Next mark: The Sun, edge to edge — 2 more folds away.');
  });

  it('기준점을 넘지 않는 한 칸을 움직여도 남은 수가 따라 줄어든다', () => {
    // **이 테스트가 이 줄의 존재 이유다.** 배지 게이트(체류 시간)에 태우면
    // 기준점이 그대로인 동안 문장이 갱신되지 않아 "2 more folds"가 굳는다 —
    // 화면에는 아무 이상이 없어 보이고 숫자만 거짓이 된다.
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    const fold = dom.root.querySelectorAll('input').find((el) => el.id === 'fold-count');
    fold.value = '43';
    dom.listeners_run_event(fold, 'input');
    dom.timers_run_pending(); // 디바운스를 흘려보낸다
    expect(widget_read_hero_lines(dom)[1]).toBe('Next mark: The Sun, edge to edge — 1 more fold away.');
    // 배지가 든 기준점은 그대로다 — 그래서 게이트를 타면 안 되는 자리다.
    expect(dom.root.querySelector('.scale-caption').textContent).toContain('The Moon');
  });

  it('1일 때 "1 more folds"라고 적지 않는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=43' });
    expect(widget_read_hero_lines(dom)[1]).toContain('1 more fold away');
    expect(widget_read_hero_lines(dom)[1]).not.toContain('1 more folds');
  });

  it('전부 넘긴 설정에서는 다음이 없다고 적는다 — 빈 줄로 두지 않는다', () => {
    // 0.5 mm · 50접기는 목록의 마지막(태양까지 거리)도 넘는다.
    const { dom } = widget_build_mounted({ search: `?mm=0.50&folds=${FOLD_COUNT_MAX}` });
    expect(widget_read_hero_lines(dom)[1]).toBe('Every height in the table is behind it now.');
  });
});

describe('읽기값 카드 — 큰 숫자 하나로 끝내지 않는다', () => {
  it('겹 수 카드가 그 숫자가 어디서 나왔는지 적는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    expect(widget_read_readout_notes(dom)[0]).toBe('one sheet doubled 42 times');
  });

  it('1접기에서 "1 times"라고 적지 않는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=1' });
    expect(widget_read_readout_notes(dom)[0]).toBe('one sheet doubled 1 time');
  });

  it('필요 길이 카드가 10²¹ m를 무엇의 몇 배인지로 다시 적는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    expect(widget_read_readout_notes(dom)[1]).toBe('about 6.8 billion × the distance to the Sun');
  });

  it('0접기에서는 잴 것이 없으므로 아무 말도 하지 않는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=0' });
    expect(widget_read_readout_notes(dom)[1]).toBe('');
  });
});

describe('교차표 — 답과 그 답의 상태는 같은 칸에 있어야 한다', () => {
  /** 표의 한 행을 [높이, 미터, 접기, 출처]로 읽는다. */
  function widget_read_row(dom, label) {
    const row = dom.root
      .querySelectorAll('tr')
      .find((tr) => tr.children.length === 4 && tr.children[0].textContent.includes(label));
    return row.children.map((cell) => cell.textContent);
  }

  it('상한 밖인 행은 접기 칸에서 그 사실을 말한다 — 표 반대쪽 끝이 아니라', () => {
    // 0.10 mm에서 태양까지는 51접기, 슬라이더는 50까지다.
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    const [, , folds, note] = widget_read_row(dom, 'The distance to the Sun');
    expect(folds).toBe('51 — try thicker paper');
    // Note 칸은 출처만 든다. 상태 문구가 섞여 있으면 둘 다 안 읽힌다.
    expect(note).toBe('one astronomical unit, a defined exact value');
    expect(note).not.toContain('try thicker paper');
  });

  it('접기 전부터 두꺼운 행도 접기 칸에서 말한다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.50&folds=10' });
    const [, , folds, note] = widget_read_row(dom, 'A grain of fine sand');
    expect(folds).toBe('already thicker');
    expect(note).toBe('0.063 mm, the silt/sand line in ISO 14688-1');
  });

  it('닿는 행은 숫자만 적는다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    expect(widget_read_row(dom, 'The Moon')[2]).toBe('42');
  });

});

describe('축 토글 — 이 페이지의 논점이 화면에서 드러나야 한다', () => {
  it('설명이 무엇이 달라지는지 말한다 — "두 가지로 그린다"로 끝내지 않는다', () => {
    const { dom } = widget_build_mounted();
    const hint = dom.root.querySelectorAll('.widget-hint').find((el) => el.id === 'fold-axis-hint');
    expect(hint.textContent).toContain('Linear');
    expect(hint.textContent).toContain('zero');
    expect(hint.textContent).toContain('straight line');
    // 설명이 실제로 토글에 연결돼 있어야 읽힌다.
    expect(dom.root.querySelector('[role="radiogroup"]').getAttribute('aria-describedby')).toBe(hint.id);
  });
});

describe('접기 슬라이더의 aria-valuetext가 히어로의 정보를 대신 든다', () => {
  it('다음 기준점과 그 접기 수까지 읽힌다 — 히어로는 aria-hidden이다', () => {
    const { dom } = widget_build_mounted({ search: '?mm=0.10&folds=42' });
    const text = dom.root
      .querySelectorAll('input')
      .find((el) => el.id === 'fold-count')
      .getAttribute('aria-valuetext');
    expect(text).toBe('42 folds — 439,800 km, past The Moon, next Sun width at 44');
    // 히어로 전체가 접근성 트리에서 빠져 있다는 전제를 같이 못박는다.
    expect(dom.root.querySelector('.scale-hero').getAttribute('aria-hidden')).toBe('true');
  });

  it('전부 넘긴 설정에서도 문장이 끊기지 않는다', () => {
    const { dom } = widget_build_mounted({ search: `?mm=0.50&folds=${FOLD_COUNT_MAX}` });
    const text = dom.root
      .querySelectorAll('input')
      .find((el) => el.id === 'fold-count')
      .getAttribute('aria-valuetext');
    expect(text).toContain('past every mark');
  });
});
