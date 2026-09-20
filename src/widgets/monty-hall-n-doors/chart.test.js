/**
 * 그림이 **실제로 무엇을 그렸는가**. 캔버스에 찍힌 글자와 경로 좌표를 세어서 본다.
 *
 * 왜 별도 파일인가: `widget.test.js`는 DOM 없이 검증되는 순수 헬퍼를,
 * `caption.test.js`는 표기가 거짓말하지 않는가와 리스너 수명을 본다.
 * 여기는 **캔버스에 남은 자국**만 본다 — 축의 왼쪽 끝, 비어 있는 구간,
 * 그림 안에 적힌 계열 이름.
 *
 * 감사에서 확인된 것:
 *  ① x축이 "곡선이 창 안에 들어오는 지점"에서 시작해, N=49·K=27을 고정한 채
 *     시행만 늘리면 좌측 끝이 1 → 53 → 542 → 1,564로 밀려났다.
 *     데이터를 더 모을수록 보여주는 구간이 줄어드는 것처럼 읽히고,
 *     두 설정을 나란히 놓고 비교할 수도 없었다.
 *  ② 축을 1로 고정하면 왼쪽이 비는데, 그냥 비워 두면 "데이터가 없나?"로 읽힌다.
 *  ③ 두 곡선의 이름이 범례에만 있어, 그림에서 눈을 떼야 어느 선이 무엇인지 알 수 있었다.
 *
 * **소스 문자열을 훑지 않는다.** 이 저장소에서 그 방식이 두 번 뚫렸다.
 * 상수는 전부 리터럴이다 — 프로덕션에서 읽어 오면 상수를 바꿔도 기대값이 같이 움직여
 * 아무것도 지키지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { sim_run_convergence, model_calculate_remaining_count } from "./model.js";
import {
  chart_calculate_scale,
  chart_calculate_plot_start,
  chart_pick_blank_label,
  chart_render_convergence,
  widget_mount,
} from "./widget.js";
import { fixture_create_dom } from "../_shared/dom-stub.js";

const AUDIT_SEED = 20260904;

// ── 프로덕션 치수를 리터럴로 박는다 ─────────────────────────
const CHART_PAD_LEFT_PX = 74;
const CHART_PAD_RIGHT_PX = 14;
const CHART_PAD_TOP_PX = 16;
const CHART_PLOT_HEIGHT_PX = 250; // 320 − 16 − 54
const CHART_LABEL_GAP_PX = 8;
const CHART_LABEL_HEIGHT_PX = 12;
/** x축 눈금 라벨이 찍히는 줄. 16 + 250 + 8. 이 줄만 걸러내면 x축 라벨만 남는다. */
const X_TICK_ROW_Y = 274;
/** 띠 안의 문구가 찍히는 자리. 74 + 8, 16 + 6. */
const BLANK_LABEL_X = 82;
const BLANK_LABEL_Y = 22;
/** 스텁 캔버스 폭. 명시적으로 넘겨 기대 좌표를 계산 가능하게 한다. */
const STUB_CANVAS_WIDTH_PX = 900;
const PLOT_WIDTH_PX = STUB_CANVAS_WIDTH_PX - CHART_PAD_LEFT_PX - CHART_PAD_RIGHT_PX; // 812

/** 슬라이더로 실제 도달 가능한 조합들. 저자가 잰 N=49·K=27 시행 스윕을 포함한다. */
const AXIS_SETTINGS = [
  [49, 27, 1000],
  [49, 27, 10000],
  [49, 27, 100000],
  [49, 27, 1000000],
  [3, 1, 1000],
  [3, 1, 10000],
  [3, 1, 1000000],
  [100, 1, 10000],
  [100, 1, 1000000],
  [100, 98, 10000],
  [10, 8, 20000],
  [25, 1, 10000],
];

let openDom = null;
afterEach(() => {
  if (openDom) openDom.restore();
  openDom = null;
});

/** 스텁 DOM을 깔고 캔버스 하나를 만든다. 위젯 전체를 붙이지 않아 자국이 이 렌더의 것뿐이다. */
function chart_build_surface() {
  const dom = fixture_create_dom({ width: STUB_CANVAS_WIDTH_PX });
  openDom = dom;
  dom.install();
  return { dom, canvas: dom.document.createElement("canvas") };
}

/**
 * 한 설정을 그리고 남은 자국을 돌려준다.
 * `moveTo`/`lineTo`를 잠시 가로채 경로 좌표까지 받는다 — 스텁은 기록만 하고 칠하지 않으므로
 * 곡선이 **어디서부터 그어졌는지**는 이 방법으로만 잴 수 있다.
 */
function chart_read_marks(doorCount, openedCount, trialCount) {
  const { canvas } = chart_build_surface();
  const result = sim_run_convergence(doorCount, openedCount, trialCount, { seed: AUDIT_SEED });
  const context = canvas.getContext("2d");
  const moves = [];
  const originalMoveTo = context.moveTo;
  context.moveTo = (x, y) => {
    moves.push({ x, y });
  };
  const drawn = chart_render_convergence(canvas, result);
  context.moveTo = originalMoveTo;

  const texts = context.texts;
  return {
    result,
    drawn,
    texts,
    moves,
    /** x축 눈금 라벨을 왼쪽부터. */
    xTicks: texts.filter((mark) => mark.y === X_TICK_ROW_Y).sort((a, b) => a.x - b.x),
    /** 띠 안의 문구 (없으면 빈 배열). */
    blankLabels: texts.filter((mark) => mark.x === BLANK_LABEL_X && mark.y === BLANK_LABEL_Y),
    /** 그림 안의 계열 이름. */
    seriesTitles: texts.filter((mark) => mark.text === "Switch" || mark.text === "Stay"),
    /**
     * 곡선 두 줄이 시작한 지점. 경로는 눈금선 → 경계선 → 이론선 → 곡선 순으로 그어지므로
     * 마지막 두 `moveTo`가 두 곡선의 첫 점이다.
     */
    curveStarts: moves.slice(-2),
  };
}

/** 위젯 전체를 붙인다. 읽기값·판정 배너를 볼 때만 쓴다. */
function widget_build_mounted(search) {
  const dom = fixture_create_dom({ width: STUB_CANVAS_WIDTH_PX, search });
  openDom = dom;
  dom.install();
  const widget_reset = widget_mount(dom.root);
  return { dom, widget_reset };
}

describe("x축 왼쪽은 설정과 무관하게 언제나 첫 시행이다", () => {
  it.each(AXIS_SETTINGS)("N=%i K=%i T=%i — 맨 왼쪽 눈금이 '1'이고 축 왼쪽 끝에 있다", (n, k, t) => {
    const marks = chart_read_marks(n, k, t);
    expect(marks.xTicks.length).toBeGreaterThan(1);
    expect(marks.xTicks[0].text).toBe("1");
    expect(marks.xTicks[0].x).toBe(CHART_PAD_LEFT_PX);
    // 오른쪽 끝은 시행 수 그대로. 축이 데이터의 마지막까지 간다.
    expect(marks.xTicks[marks.xTicks.length - 1].text).toBe(t.toLocaleString("en-US"));
    expect(marks.drawn.axisStart).toBe(1);
    expect(marks.drawn.axisEnd).toBe(t);
  });

  it("시행을 늘려도 축의 왼쪽은 안 움직인다 — 움직이는 것은 곡선의 시작점뿐이다", () => {
    // 저자가 잰 그 스윕이다. 고치기 전에는 **왼쪽 눈금**이 이 숫자들이었다.
    // 실제 출력을 받아 적은 골든 값이다.
    const starts = [];
    const leftLabels = [];
    for (const trialCount of [1000, 10000, 100000, 1000000]) {
      const marks = chart_read_marks(49, 27, trialCount);
      starts.push(marks.drawn.startTrial);
      leftLabels.push(marks.xTicks[0].text);
    }
    expect(starts).toEqual([1, 53, 542, 1564]);
    expect(leftLabels).toEqual(["1", "1", "1", "1"]);
  });

  it("눈금이 10의 거듭제곱 전 구간이다 — 로그 축이라는 것이 눈금으로 읽힌다", () => {
    expect(chart_read_marks(3, 1, 10000).xTicks.map((mark) => mark.text)).toEqual([
      "1",
      "10",
      "100",
      "1,000",
      "10,000",
    ]);
    expect(chart_read_marks(49, 27, 1000000).xTicks.map((mark) => mark.text)).toEqual([
      "1",
      "10",
      "100",
      "1,000",
      "10,000",
      "100,000",
      "1,000,000",
    ]);
  });
});

describe("곡선은 여전히 '창 안에 들어온 뒤'에만 그어진다", () => {
  it.each(AXIS_SETTINGS)("N=%i K=%i T=%i — 시작점 직전의 표본은 창 밖이다", (n, k, t) => {
    const result = sim_run_convergence(n, k, t, { seed: AUDIT_SEED });
    const scale = chart_calculate_scale(result);
    const startTrial = chart_calculate_plot_start(result, scale);
    const outside = (rate) => rate < scale.rateMin || rate > scale.rateMax;

    const startIndex = result.points.findIndex((point) => point.trial === startTrial);
    expect(startIndex).toBeGreaterThanOrEqual(0);
    // 그린 구간은 전부 창 안 (widget.test.js가 보는 절반)
    for (const point of result.points.slice(startIndex)) {
      expect(outside(point.stayWinRate) || outside(point.switchWinRate)).toBe(false);
    }
    // **그 직전 점은 창 밖이어야 한다.** 이 절반이 없으면 "시작점 = 1로 고정"이 통과한다.
    if (startIndex > 0) {
      const previous = result.points[startIndex - 1];
      expect(outside(previous.stayWinRate) || outside(previous.switchWinRate)).toBe(true);
    }
  });

  it.each(AXIS_SETTINGS)("N=%i K=%i T=%i — 곡선의 첫 점이 빈 띠의 오른쪽 끝과 정확히 같다", (n, k, t) => {
    const marks = chart_read_marks(n, k, t);
    expect(marks.curveStarts.length).toBe(2);
    // 두 곡선은 같은 지점에서 시작한다
    expect(marks.curveStarts[0].x).toBeCloseTo(marks.curveStarts[1].x, 9);
    // 그 지점이 곧 띠의 오른쪽 끝이다 — 띠가 그려진 곳에는 곡선이 없다
    expect(marks.curveStarts[0].x).toBeCloseTo(CHART_PAD_LEFT_PX + marks.drawn.blankWidthPx, 9);
    // 곡선의 첫 점은 축의 왼쪽 끝보다 오른쪽에 있다 — 시작점이 1일 때만 같다
    if (marks.drawn.startTrial > 1) {
      expect(marks.curveStarts[0].x).toBeGreaterThan(CHART_PAD_LEFT_PX);
    } else {
      expect(marks.curveStarts[0].x).toBe(CHART_PAD_LEFT_PX);
      expect(marks.drawn.blankWidthPx).toBe(0);
    }
    // 곡선은 축 오른쪽 끝을 넘지 않는다
    expect(marks.curveStarts[0].x).toBeLessThan(CHART_PAD_LEFT_PX + PLOT_WIDTH_PX);
  });
});

describe("비어 있는 왼쪽을 그림 안에서 설명한다", () => {
  it("띠 안의 문구가 **실제 시작 시행**을 인용한다", () => {
    // 실제 출력을 받아 적은 값이다. 상수를 그 상수로 재지 않는다.
    const wide = chart_read_marks(100, 1, 10000);
    expect(wide.blankLabels.map((mark) => mark.text)).toEqual(["Too jumpy before game 542"]);
    expect(wide.drawn.startTrial).toBe(542);

    const later = chart_read_marks(49, 27, 1000000);
    expect(later.blankLabels.map((mark) => mark.text)).toEqual(["Too jumpy before game 1,564"]);
    expect(later.drawn.startTrial).toBe(1564);
  });

  it("띠가 좁으면 짧은 문구로 줄인다 — 글자를 축 위로 밀어 올리지 않는다", () => {
    const narrow = chart_read_marks(3, 1, 10000);
    expect(narrow.drawn.startTrial).toBe(3);
    expect(narrow.blankLabels.map((mark) => mark.text)).toEqual(["Too jumpy"]);
  });

  it("띠가 없으면 문구도 없다 — 없는 구간을 있다고 그리지 않는다", () => {
    const full = chart_read_marks(100, 98, 10000);
    expect(full.drawn.startTrial).toBe(1);
    expect(full.drawn.blankWidthPx).toBe(0);
    expect(full.blankLabels).toEqual([]);
  });

  it("문구 고르기는 폭에 따라 길게 · 짧게 · 아예 없이로 갈린다", () => {
    const measure = (text) => text.length * 10;
    // 'Too jumpy before game 542' 25자 → 250, 'Too jumpy' 9자 → 90. 여백은 양쪽 8px.
    expect(chart_pick_blank_label(542, 300, measure)).toBe("Too jumpy before game 542");
    expect(chart_pick_blank_label(542, 120, measure)).toBe("Too jumpy");
    expect(chart_pick_blank_label(542, 50, measure)).toBe("");
    // 띠가 없으면(시작점이 첫 시행) 어떤 폭에서도 문구가 없다
    expect(chart_pick_blank_label(1, 900, measure)).toBe("");
    expect(chart_pick_blank_label(542, 0, measure)).toBe("");
  });
});

describe("캡션은 렌더가 실제로 쓴 축만 인용한다", () => {
  /** 캡션이 말하는 가로 축 양 끝. */
  function caption_read_axis(note) {
    const found = /Horizontal axis ([\d,]+)–([\d,]+) trials/.exec(note);
    return found ? [found[1], found[2]] : null;
  }

  it.each(AXIS_SETTINGS)("N=%i K=%i T=%i — 캡션의 가로 축이 캔버스의 양 끝 눈금과 같다", (n, k, t) => {
    const { dom } = widget_build_mounted(`?doors=${n}&opened=${k}&trials=${t}`);
    const note = dom.root.querySelector(".legend-note").textContent;
    const canvasTexts = dom.root.querySelector("canvas").context.texts;
    const ticks = canvasTexts.filter((mark) => mark.y === X_TICK_ROW_Y).sort((a, b) => a.x - b.x);
    expect(caption_read_axis(note)).toEqual([ticks[0].text, ticks[ticks.length - 1].text]);
  });

  it("빈 구간이 있으면 캡션이 그 시작 시행을 그림과 같은 숫자로 말한다", () => {
    const { dom } = widget_build_mounted("?doors=100&opened=1&trials=10000");
    const note = dom.root.querySelector(".legend-note").textContent;
    const drawnStart = chart_calculate_plot_start(
      sim_run_convergence(100, 1, 10000, { seed: AUDIT_SEED }),
      chart_calculate_scale(sim_run_convergence(100, 1, 10000, { seed: AUDIT_SEED })),
    );
    expect(drawnStart).toBe(542);
    expect(note).toContain("The solid curves begin at trial 542");
    expect(note).toContain("shaded strip");
  });

  it("빈 구간이 없으면 캡션이 띠를 언급하지 않는다", () => {
    const { dom } = widget_build_mounted("?doors=100&opened=98&trials=10000");
    const note = dom.root.querySelector(".legend-note").textContent;
    expect(note).toContain("run the full width");
    expect(note).not.toContain("shaded strip");
    expect(note).not.toContain("begin at trial");
  });
});

describe("계열 이름이 그림 안에 있다", () => {
  it.each(AXIS_SETTINGS)("N=%i K=%i T=%i — 두 이름이 그림 오른쪽 안쪽에 겹치지 않고 놓인다", (n, k, t) => {
    const marks = chart_read_marks(n, k, t);
    const byName = Object.fromEntries(marks.seriesTitles.map((mark) => [mark.text, mark]));
    expect(Object.keys(byName).sort()).toEqual(["Stay", "Switch"]);

    for (const mark of marks.seriesTitles) {
      // 오른쪽 절반 안쪽 — 곡선이 이론선에 수렴한 자리에 붙는다
      expect(mark.x).toBeGreaterThan(CHART_PAD_LEFT_PX + PLOT_WIDTH_PX / 2);
      expect(mark.x).toBeLessThanOrEqual(CHART_PAD_LEFT_PX + PLOT_WIDTH_PX);
      // 그림 밖으로 잘려 나가지 않는다
      expect(mark.y).toBeGreaterThanOrEqual(CHART_PAD_TOP_PX);
      expect(mark.y + CHART_LABEL_HEIGHT_PX).toBeLessThanOrEqual(CHART_PAD_TOP_PX + CHART_PLOT_HEIGHT_PX);
    }
    // 두 이름이 서로 올라타지 않는다
    expect(Math.abs(byName.Switch.y - byName.Stay.y)).toBeGreaterThanOrEqual(CHART_LABEL_HEIGHT_PX);
  });

  it("두 이론선이 4px 안에 붙어도 이름은 갈라져 있다", () => {
    // 이 설정에서 두 이론선의 간격은 2.16px다 (caption.test.js가 그 값을 못박는다).
    const marks = chart_read_marks(100, 1, 10000);
    const byName = Object.fromEntries(marks.seriesTitles.map((mark) => [mark.text, mark]));
    // 실측값이다. 위/아래로 갈라 붙이지 않으면 둘이 2px 안에 겹친다.
    expect(byName.Switch.y).toBeCloseTo(119.947, 3);
    expect(byName.Stay.y).toBeCloseTo(142.109, 3);
  });

  it("선이 축 위·아래 끝에 붙어도 이름이 안쪽으로 뒤집힌다", () => {
    // N=100·K=98은 축이 정확히 0%–100%이고 이론선이 1%와 99%다.
    // 뒤집지 않으면 위 이름이 그림 위로 2.5px 튀어나가 잘린다.
    const marks = chart_read_marks(100, 98, 10000);
    const byName = Object.fromEntries(marks.seriesTitles.map((mark) => [mark.text, mark]));
    expect(byName.Switch.y).toBeCloseTo(22.5, 3);
    expect(byName.Stay.y).toBeCloseTo(247.5, 3);
  });
});

describe("읽기값 카드 — 큰 숫자는 모델의 값, 작은 글씨는 시뮬레이션", () => {
  function readouts_read(dom) {
    return {
      labels: dom.root.querySelectorAll(".readout-label").map((el) => el.textContent),
      values: dom.root.querySelectorAll(".readout-value").map((el) => el.textContent),
      units: dom.root.querySelectorAll(".readout-unit").map((el) => el.textContent),
    };
  }

  it("교과서 설정의 네 카드를 골든 값으로 못박는다", () => {
    const { dom } = widget_build_mounted("?doors=3&opened=1&trials=10000");
    const cards = readouts_read(dom);
    expect(cards.labels).toEqual([
      "Switch wins",
      "Stay wins",
      "How much swapping helps",
      "Doors you could swap to",
    ]);
    // 큰 숫자는 **정확한 값**이다 (그림의 점선). 2/3과 1/3.
    expect(cards.values.slice(0, 3)).toEqual(["66.7%", "33.3%", "2.00×"]);
    // 작은 글씨가 시뮬레이션 (그림의 실선). 실제 출력을 받아 적은 값이다.
    expect(cards.units[0]).toBe("by the math — 66.5% in the games played");
    // Stay 카드만 다른 말을 한다. 이 카드는 값이 아니라 **불변성**이 정보다 —
    // stay = 1/N이라 K를 아무리 움직여도 꿈쩍하지 않는다. 그것이 이 글의 논지다.
    expect(cards.units[1]).toBe("1 out of N — the doors he opens never change this");
  });

  it("큰 숫자와 작은 글씨가 서로 다른 값이다 — 둘 다 시뮬레이션이면 대조가 사라진다", () => {
    const { dom } = widget_build_mounted("?doors=100&opened=1&trials=10000");
    const cards = readouts_read(dom);
    expect(cards.values[0]).toBe("1.01%"); // 99 / (100 × 98)
    expect(cards.units[0]).toBe("by the math — 1.07% in the games played");
    expect(cards.values[0]).not.toBe(cards.units[0].replace("by the math — ", "").replace(" in the games played", ""));
  });

  it("'바꿔갈 수 있는 문' 카드가 N − 1 − K를 그대로 센다", () => {
    for (const [doors, opened, expected] of [
      [3, 1, "1"],
      [100, 1, "98"],
      [100, 98, "1"],
      [49, 27, "21"],
    ]) {
      const { dom } = widget_build_mounted(`?doors=${doors}&opened=${opened}&trials=10000`);
      expect(dom.root.querySelectorAll(".readout-value")[3].textContent).toBe(expected);
      // 독립 경로 — 모델 함수가 같은 수를 낸다
      expect(String(model_calculate_remaining_count(doors, opened))).toBe(expected);
      openDom.restore();
      openDom = null;
    }
  });
});

describe("판정 배너 — 첫 줄이 결론이다", () => {
  function verdict_read(dom) {
    const banner = dom.root.querySelector(".verdict");
    return {
      state: banner.getAttribute("data-state"),
      headline: banner.querySelector("strong").textContent,
      whole: banner.textContent,
    };
  }

  it("배너는 판정 한 줄뿐이다 — 숫자는 판독 카드가 진다", () => {
    const { dom } = widget_build_mounted("?doors=3&opened=1&trials=10000");
    const banner = verdict_read(dom);
    expect(banner.state).toBe("hold");
    // 실제 출력을 받아 적은 값이다.
    expect(banner.headline).toBe("The classic 2× gap holds: the model has swapping win 2.00× as often as staying.");
    // 예전에는 여기에 N·K·R·두 승률·시뮬값을 다시 적은 문장이 붙어 있었다. 판독 네 장이
    // 띄우는 숫자의 완전한 복제였고, 그만큼 조작과 숫자 사이가 멀어졌다.
    // **배너 = 판정 한 줄**이 계약이다.
    expect(banner.whole.trim()).toBe(banner.headline);
    // 걷어낸 숫자가 사라지지는 않았다 — 바로 아래 판독 카드에 그대로 있다.
    const values = [...dom.root.querySelectorAll(".readout-value")].map((e) => e.textContent);
    expect(values.slice(0, 3)).toEqual(["66.7%", "33.3%", "2.00×"]);
  });

  it("세 판정이 서로 다른 첫 줄을 준다", () => {
    const headlines = [];
    const states = [];
    for (const [doors, opened] of [
      [3, 1], // 이득비 2.00 → hold
      [10, 1], // 이득비 1.125 → edge
      [100, 1], // 이득비 1.01 → break
    ]) {
      const { dom } = widget_build_mounted(`?doors=${doors}&opened=${opened}&trials=10000`);
      const banner = verdict_read(dom);
      headlines.push(banner.headline);
      states.push(banner.state);
      openDom.restore();
      openDom = null;
    }
    expect(states).toEqual(["hold", "edge", "break"]);
    expect(headlines).toEqual([
      "The classic 2× gap holds: the model has swapping win 2.00× as often as staying.",
      "The gap is shrinking: the model has swapping win 1.13× as often as staying.",
      "The gap is nearly gone: the model has swapping win 1.01× as often as staying.",
    ]);
    expect(new Set(headlines).size).toBe(3);
  });

  it("캔버스 대체 문구는 배너의 결론으로 시작해 설정까지 말한다", () => {
    // 눈으로 그림을 못 읽는 독자에게는 결론만으로 모자란다 — 어느 설정에서 나온
    // 결론인지가 있어야 한다. 그래서 대체 문구는 배너보다 **길다**.
    const { dom } = widget_build_mounted("?doors=100&opened=1&trials=10000");
    const banner = verdict_read(dom);
    const alt = dom.root.querySelector("canvas").getAttribute("aria-label");
    expect(alt.startsWith(banner.headline)).toBe(true);
    expect(alt.length).toBeGreaterThan(banner.headline.length);
    expect(alt).toContain("With 100 doors and 1 opened, 98 doors are left to switch into");
    expect(alt).toContain("After 10,000 simulated games");
  });
});
