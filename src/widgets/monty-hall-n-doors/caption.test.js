// 캡션과 리스너 수명. **화면이 멀쩡해 보이는 결함** 세 가지를 못박는다.
//
// 감사에서 확인된 것:
//  ① 캡션이 축 경계를 눈금 간격의 자릿수로 다시 반올림해, N=25·K=1·T=10,000에서
//     실제 축 3.4133%–6.0891%를 "3%–6%"로 찍었다. 오차가 축 폭의 15.4%였다.
//  ② `widget_reset()`이 resize만 떼고 슬라이더 리스너 6개를 남겼다.
//     주석은 "없으면 위젯을 두 번 붙일 때 누수된다"고 적혀 있었는데 그 누수가 있었다.
//  ③ 폭 0 캔버스(숨긴 탭·`display:none`)에서 범례 문구가 영영 빈 문자열이었다.
//
// **수명 검사는 소스를 훑지 않는다.** 앞선 판본이 소스 문자열 검사였고 두 번 뚫렸다:
//   - `line.includes("target.addEventListener")`로 걸렀더니 변수 이름 하나로 우회됐다
//   - `widget_reset()` 본문에서 문자열만 찾았더니 **무엇을 몇 개** 떼는지는 안 봤다
// 그래서 `addEventListener`/`removeEventListener`/`setTimeout`을 세는 DOM 스텁으로
// 실제로 붙였다 떼고 잔여를 단언한다. 코드 모양·변수 이름과 무관하게 걸린다.
//
// 별도 파일로 둔 이유: `widget.test.js`는 위젯 계산 함수를 다루고, 여기는
// **표기가 거짓말하지 않는가**와 **수명 관리**만 본다.
import { describe, it, expect, afterEach } from "vitest";
import { sim_run_convergence } from "./model.js";
import {
  chart_calculate_scale,
  chart_calculate_line_gap_px,
  display_calculate_bound_digits,
  display_format_percent_bound,
  display_format_percent_tick,
  widget_mount,
} from "./widget.js";
import { fixture_create_dom } from "../_shared/dom-stub.js";

/** 캡션이 축 폭 대비 이만큼 넘게 틀리면 그림과 갈라진 것으로 본다. */
const CAPTION_MAX_ERROR_RATIO = 0.01;
const AUDIT_SEED = 20260904;

/** 슬라이더로 실제 도달 가능한 조합들. 감사에서 결함이 드러난 셋을 포함한다. */
const SETTINGS = [
  [3, 1, 10000],
  [10, 1, 100000],
  [25, 1, 10000],
  [100, 1, 100000],
  [100, 98, 10000],
  [50, 48, 1000000],
];

/**
 * 위젯이 붙이는 리스너의 개수. **리터럴이다** — 프로덕션에서 세어 오면
 * 리스너를 하나 더 붙여도 기대값이 같이 늘어 아무것도 안 지킨다.
 * 슬라이더 3개 × (input, change) + window resize + 프리셋 버튼 3개의 click = 10.
 */
const WIDGET_LISTENER_COUNT = 10;

/** 그림 영역의 세로 픽셀. 프로덕션 상수(320 − 16 − 54)를 리터럴로 박는다. */
const CHART_PLOT_HEIGHT_PX = 250;

function chart_read_scale(doors, opened, trials) {
  const result = sim_run_convergence(doors, opened, trials, { seed: AUDIT_SEED });
  return chart_calculate_scale(result);
}

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

/** 스텁 DOM을 깔고 위젯을 실제로 붙인다. 전역 복구는 afterEach가 한다. */
function widget_build_mounted(options = {}) {
  const dom = fixture_create_dom(options);
  openDom = dom;
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

describe("축 경계 표기가 거짓말하지 않는다", () => {
  it.each(SETTINGS)("N=$#: 축 경계가 축 폭의 1퍼센트 안에서 참이다", (doors, opened, trials) => {
    const scale = chart_read_scale(doors, opened, trials);
    const span = scale.rateMax - scale.rateMin;
    for (const bound of [scale.rateMin, scale.rateMax]) {
      const printed = Number.parseFloat(display_format_percent_bound(bound, span, scale.step));
      const errorRatio = Math.abs(printed - bound * 100) / (span * 100);
      expect(errorRatio).toBeLessThanOrEqual(CAPTION_MAX_ERROR_RATIO);
    }
  });

  it("감사에서 실패한 그 설정을 골든 값으로 못박는다", () => {
    // 실제 출력을 받아 적은 값이다. 예측한 것이 아니다.
    const scale = chart_read_scale(25, 1, 10000);
    const span = scale.rateMax - scale.rateMin;
    expect(display_format_percent_bound(scale.rateMin, span, scale.step)).toBe("3.41%");
    expect(display_format_percent_bound(scale.rateMax, span, scale.step)).toBe("6.09%");
    // 눈금용 포맷터를 그대로 쓰면 무엇이 나갔었는지도 같이 남긴다.
    expect(display_format_percent_tick(scale.rateMin, scale.step)).toBe("3%");
  });

  it("축이 좁아지면 자릿수가 늘어난다", () => {
    const wide = display_calculate_bound_digits(0.64, 0.05);
    const narrow = display_calculate_bound_digits(0.0085, 0.0005);
    // 부등식만 두면 두 값이 같이 움직여도 통과한다. 실측값을 리터럴로 박는다.
    expect(wide).toBe(1);
    expect(narrow).toBe(3);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("경계가 정확히 눈금 위에 있으면 자릿수를 늘리지 않는다", () => {
    // 0%–100%처럼 딱 떨어지는 축에서 "0.000%"가 나오면 읽기만 나빠진다.
    expect(display_format_percent_bound(0, 1, 0.05)).toBe("0%");
    expect(display_format_percent_bound(1, 1, 0.05)).toBe("100%");
  });

  it("자릿수 상한이 정확히 4다 — 축 폭이 0에 수렴해도 무한히 늘지 않는다", () => {
    // `<= 4`로 두면 상한을 2로 내려도 통과한다. 상한은 **양쪽을** 눌러야 한다.
    expect(display_calculate_bound_digits(1e-12, 1e-12)).toBe(4);
    expect(display_calculate_bound_digits(0, 0.01)).toBe(4);
  });

  it("축 폭이 요구하는 것보다 눈금이 잘면 눈금 쪽 자릿수를 쓴다", () => {
    // 이 함수는 스팬과 간격을 **따로** 받는 공개 함수다. 지금 차트가 내는 조합에서는
    // 언제나 스팬 쪽이 크지만, 간격이 잔 조합이 들어오면 간격을 정확히 적어야 한다.
    // (이 단언이 없으면 `Math.max(눈금 자릿수, 필요 자릿수)`의 앞항을 지워도 통과한다)
    expect(display_calculate_bound_digits(1, 0.025)).toBe(1);
    expect(display_calculate_bound_digits(1, 0.05)).toBe(0);
  });
});

describe("두 선이 붙으면 캡션이 그렇다고 말한다", () => {
  // 축을 더 조이면 노이즈 곡선이 창 밖으로 나간다. 화면을 속이는 대신 적는다.
  // **양쪽을 다 누른다** — 임계를 내리면 아래 ①이, 올리면 ②가 죽는다.
  it("① 두 이론선이 4px 안에 있는 설정에서는 '구분 불가'가 붙는다", () => {
    const result = sim_run_convergence(100, 1, 10000, { seed: AUDIT_SEED });
    const gapPx = chart_calculate_line_gap_px(result, chart_calculate_scale(result), CHART_PLOT_HEIGHT_PX);
    // 실측값이다. 예측이 아니다.
    expect(gapPx).toBeCloseTo(2.162, 3);

    const { dom } = widget_build_mounted({ search: "?doors=100&opened=1&trials=10000" });
    expect(dom.root.querySelector(".legend-note").textContent).toContain("cannot separate them");
  });

  it("② 4px보다 벌어진 설정에서는 안 붙는다", () => {
    const result = sim_run_convergence(60, 1, 10000, { seed: AUDIT_SEED });
    const gapPx = chart_calculate_line_gap_px(result, chart_calculate_scale(result), CHART_PLOT_HEIGHT_PX);
    // 4.178px — 임계를 5로 올리기만 해도 이 설정에 캡션이 붙어 아래가 깨진다.
    expect(gapPx).toBeCloseTo(4.178, 3);

    const { dom } = widget_build_mounted({ search: "?doors=60&opened=1&trials=10000" });
    expect(dom.root.querySelector(".legend-note").textContent).not.toContain("cannot separate them");
  });
});

describe("폭 0 캔버스에서도 범례가 말을 한다", () => {
  it("숨은 채로 붙어도 선 종류의 뜻이 남는다", () => {
    // 숨긴 탭이나 `display:none` 안에서 마운트되면 `canvas_setup_context`가 null을
    // 내고 렌더가 조기 반환한다. 그때 범례를 통째로 비우면 색 견본만 남는다.
    const { dom } = widget_build_mounted({ width: 0 });
    const note = dom.root.querySelector(".legend-note").textContent;
    expect(note).toContain("Dashed = what the math says");
    // 그릴 축이 없으므로 축 문장은 **없어야** 한다 (있으면 그림과 갈라진 캡션이다).
    expect(note).not.toContain("Vertical axis");
    // 캔버스는 role="img"라 라벨이 없으면 그래프가 통째로 사라진다.
    expect(dom.root.querySelector("canvas").getAttribute("aria-label")).toContain("the model has swapping win");
  });

  it("폭이 있으면 축 문장이 이어 붙는다", () => {
    const { dom } = widget_build_mounted();
    const note = dom.root.querySelector(".legend-note").textContent;
    expect(note).toContain("Dashed = what the math says");
    expect(note).toContain("Vertical axis");
  });
});

describe("리스너 수명 — 소스가 아니라 실제 붙고 떼는 것을 센다", () => {
  it("붙는 리스너는 정확히 10개다", () => {
    const { dom } = widget_build_mounted();
    expect(dom.listeners_read_added()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it("reset이 붙인 것을 전부 뗀다 — 잔여가 모두 0으로 돌아간다", () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    expect(dom.listeners_read_removed()).toBe(WIDGET_LISTENER_COUNT);
    expect(dom.listeners_read_live()).toBe(0);
    expect(dom.listeners_read_names()).toEqual([]);
    expect(dom.timers_read_pending()).toBe(0);
  });

  it("reset이 예약된 타이머까지 끊는다", () => {
    const { dom, widget_reset } = widget_build_mounted();
    const slider = dom.root.querySelector("input");
    // 디바운스 타이머와 리드로우 타이머를 둘 다 띄운다.
    expect(dom.listeners_run_event(slider, "input")).toBe(1);
    expect(dom.listeners_run_event(dom.window, "resize")).toBe(1);
    expect(dom.timers_read_pending()).toBe(2);

    widget_reset();
    expect(dom.timers_read_pending()).toBe(0);
  });

  it("같은 자리에 두 번 붙지 않는다 — 리스너 순증가가 0이다", () => {
    const { dom } = widget_build_mounted();
    const before = dom.listeners_read_added();
    // 두 번째 마운트는 아무것도 붙이지 않고 null을 돌려준다.
    expect(widget_mount(dom.root)).toBeNull();
    expect(dom.listeners_read_added()).toBe(before);
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
  });

  it("뗀 뒤에는 슬라이더를 움직여도 아무 일도 일어나지 않는다", () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    const slider = dom.root.querySelector("input");
    expect(dom.listeners_run_event(slider, "input")).toBe(0);
    expect(dom.listeners_run_event(slider, "change")).toBe(0);
    expect(dom.listeners_run_event(dom.window, "resize")).toBe(0);
    expect(dom.timers_read_pending()).toBe(0);
  });

  it("뗀 자리에는 다시 붙을 수 있다 — mounted 표식도 함께 지운다", () => {
    const { dom, widget_reset } = widget_build_mounted();
    widget_reset();
    const again = widget_mount(dom.root);
    expect(again).not.toBeNull();
    expect(dom.listeners_read_live()).toBe(WIDGET_LISTENER_COUNT);
    again();
    expect(dom.listeners_read_live()).toBe(0);
  });
});

describe("프리셋 버튼 — 문 개수·개봉 수를 싣고 다시 그린다", () => {
  // 스텁 셀렉터는 `.class`/`tag`/`[attr="value"]`만 읽는다(dom-stub.js 주석 참고) —
  // `#id`는 못 읽으므로 `id` 프로퍼티를 직접 대조한다.
  function widget_find_input(dom, id) {
    return dom.root.querySelectorAll("input").find((el) => el.id === id);
  }

  it("세 프리셋 버튼이 있고, 누르면 슬라이더와 판정이 그 설정으로 바뀐다", () => {
    const { dom } = widget_build_mounted();
    const buttons = dom.root.querySelectorAll('[data-preset]');
    expect(buttons.length).toBe(3);

    const hundredDoorsButton = buttons.find((button) => button.dataset.preset === "hundred-doors");
    expect(hundredDoorsButton).toBeTruthy();
    dom.listeners_run_event(hundredDoorsButton, "click");

    expect(widget_find_input(dom, "monty-doors").value).toBe("100");
    expect(widget_find_input(dom, "monty-opened").value).toBe("1");
    // 문 하나만 열리고 99개가 남는 구간이라 이득비가 1배 가까이 가라앉는다 — break.
    expect(dom.root.querySelector(".verdict").getAttribute("data-state")).toBe("break");
  });

  it("classic 프리셋은 교과서 3문 설정을 싣는다", () => {
    const { dom } = widget_build_mounted({ search: "?doors=100&opened=1&trials=10000" });
    const classicButton = dom.root.querySelectorAll('[data-preset]').find((button) => button.dataset.preset === "classic");
    dom.listeners_run_event(classicButton, "click");
    expect(widget_find_input(dom, "monty-doors").value).toBe("3");
    expect(widget_find_input(dom, "monty-opened").value).toBe("1");
    expect(dom.root.querySelector(".verdict").getAttribute("data-state")).toBe("hold");
  });

  it("ten-doors 프리셋은 edge 구간을 싣는다", () => {
    const { dom } = widget_build_mounted();
    const tenDoorsButton = dom.root.querySelectorAll('[data-preset]').find((button) => button.dataset.preset === "ten-doors");
    dom.listeners_run_event(tenDoorsButton, "click");
    expect(widget_find_input(dom, "monty-doors").value).toBe("10");
    expect(widget_find_input(dom, "monty-opened").value).toBe("1");
    expect(dom.root.querySelector(".verdict").getAttribute("data-state")).toBe("edge");
  });
});

describe("aria-valuetext가 단수를 안다", () => {
  // K의 기본값이 1이라 **기본 상태에서** 스크린리더가 "1 doors opened"를 읽었다.
  // 화면에는 아무 표시도 나지 않는 결함이라 눈으로는 영영 안 걸린다.
  function widget_read_valuetext(dom, id) {
    return dom.root
      .querySelectorAll("input")
      .find((el) => el.id === id)
      .getAttribute("aria-valuetext");
  }

  it("K=1이면 'doors'가 아니라 'door'다", () => {
    const { dom } = widget_build_mounted({ search: "?doors=3&opened=1&trials=10000" });
    expect(widget_read_valuetext(dom, "monty-opened")).toBe("1 door opened");
  });

  it("K가 2 이상이면 복수다", () => {
    const { dom } = widget_build_mounted({ search: "?doors=100&opened=98&trials=10000" });
    expect(widget_read_valuetext(dom, "monty-opened")).toBe("98 doors opened");
  });

  it("문 개수와 시행 횟수도 같은 규칙을 탄다", () => {
    const { dom } = widget_build_mounted({ search: "?doors=3&opened=1&trials=1000" });
    expect(widget_read_valuetext(dom, "monty-doors")).toBe("3 doors");
    expect(widget_read_valuetext(dom, "monty-trials")).toBe("1,000 trials");
  });

  it("그림 대체 문구도 같은 규칙을 탄다", () => {
    // 배너에서 걷어낸 설정 문장은 캔버스 대체 문구로 옮겨 갔다 — 눈으로 그림을 못 읽는
    // 독자에게는 설정이 있어야 결론이 성립한다. 단·복수 규칙은 그 자리에서 이어진다.
    const { dom } = widget_build_mounted({ search: "?doors=3&opened=1&trials=10000" });
    const label = dom.root.querySelector("canvas").getAttribute("aria-label");
    expect(label).toContain("With 3 doors and 1 opened");
    expect(label).toContain("1 door is left to switch into");
  });
});

describe("URL 상태가 실제로 주소창에 쓰인다", () => {
  it("첫 렌더에서 네 파라미터가 전부 나간다", () => {
    // `urlstate_write`가 아무것도 안 써도 화면은 멀쩡하다. 링크 공유만 죽는다.
    const { dom } = widget_build_mounted({ search: "?doors=25&opened=1&trials=10000" });
    expect(dom.urlsWritten.length).toBeGreaterThan(0);
    const last = dom.urlsWritten[dom.urlsWritten.length - 1];
    expect(last).toContain("doors=25");
    expect(last).toContain("opened=1");
    expect(last).toContain("trials=10000");
    expect(last).toContain("seed=20260904");
  });
});
