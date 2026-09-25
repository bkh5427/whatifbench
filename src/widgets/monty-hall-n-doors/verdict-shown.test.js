// 이득비의 **화면 문자열**이 정확한 분수 (N−1)/R의 반올림과 같은지, 그리고
// 판정 배너가 그 문자열로 판정하는지.
//
// 2026-09-21 독립 사실 검사에서 차례로 나온 세 사고:
//   ① 확률 둘을 나눠 이득비를 내자 99/90이 1.0999…가 되어 "1.10×"를 찍으면서
//      1.10 아래 문구("nearly gone")를 띄웠다
//   ② 같은 이유로 19/8 = 2.375가 2.37×로 찍혔다 (200 화면)
//   ③ 나눗셈을 (N−1)/R로 바꿔도 41/40 = 1.025는 이진으로 1.0249…라 toFixed가
//      1.02로 찍었다 (14 상태) — 이 파일의 격자 테스트가 잡았다
// 그래서 반올림 자체를 정수 연산으로 한다(model_format_switch_advantage).
import { describe, it, expect } from "vitest";
import {
  model_calculate_switch_win_rate,
  model_calculate_stay_win_rate,
  model_format_switch_advantage,
} from "./model.js";
import { state_calculate_verdict } from "./widget.js";

const DIGITS = 2;

/** 정확한 반올림(0.5는 올림)을 정수로. 모델과 **다른 식**으로 쓴다 — 같은 식이면 검사가 아니다. */
function exact_round_ratio(numerator, denominator, digits) {
  const scale = 10 ** digits;
  const q = Math.floor((numerator * scale) / denominator);
  const rem = numerator * scale - q * denominator;
  return 2 * rem >= denominator ? q + 1 : q;
}

describe("이득비 화면 문자열", () => {
  it("① 고치기 전 방식(확률 둘의 나눗셈)은 99/90을 1.10 아래로 떨어뜨렸다 — 사고 재현", () => {
    const old = model_calculate_switch_win_rate(100, 9) / model_calculate_stay_win_rate(100);
    expect(old).toBeLessThan(1.1);
    expect(state_calculate_verdict(old)).toBe("break");
  });

  it("① 지금은 '1.10'이고 판정은 edge다", () => {
    const text = model_format_switch_advantage(100, 9, DIGITS);
    expect(text).toBe("1.10");
    expect(state_calculate_verdict(Number(text))).toBe("edge");
  });

  it("② 19/8 → '2.38'", () => {
    expect(model_format_switch_advantage(20, 11, DIGITS)).toBe("2.38");
  });

  it("③ 41/40 → '1.03'", () => {
    expect(model_format_switch_advantage(42, 1, DIGITS)).toBe("1.03");
  });

  it("슬라이더 전 격자(4,851 상태)에서 정확한 반올림과 한 글자도 다르지 않다", () => {
    const bad = [];
    for (let n = 3; n <= 100; n += 1) {
      for (let k = 1; k <= n - 2; k += 1) {
        const want = exact_round_ratio(n - 1, n - 1 - k, DIGITS);
        const got = Math.round(Number(model_format_switch_advantage(n, k, DIGITS)) * 10 ** DIGITS);
        if (got !== want) bad.push([n, k, got, want]);
      }
    }
    expect(bad).toEqual([]);
  });
});

import { display_format_percent } from "./widget.js";

describe("백분율 표기는 0.5를 올린다 (5차 검사: 1351/2000 = 67.55% → 67.5%로 찍히던 것)", () => {
  /** 정확한 반올림을 정수로: w/T를 소수 d자리 백분율로. 모델·위젯과 다른 식이다. */
  function exact_percent(w, t, d) {
    const num = w * 10 ** (2 + d);
    const q = Math.floor((2 * num + t) / (2 * t));
    return `${(q / 10 ** d).toFixed(d)}%`;
  }

  it("1351/2000 → '67.6%'", () => {
    expect(display_format_percent(1351 / 2000)).toBe("67.6%");
  });

  it("시행 수 전 단계에서 반올림 경계에 놓인 승수를 전부 맞게 찍는다", () => {
    const TRIALS = [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
    const bad = [];
    for (const t of TRIALS) {
      // 1자리(0.1%p)의 경계 w = (k + 0.5)·t/1000 이 정수가 되는 곳과 그 이웃을 본다
      for (let k = 100; k < 1000; k += 1) {
        const mid = ((k + 0.5) * t) / 1000;
        for (const w of [Math.floor(mid) - 1, Math.floor(mid), Math.ceil(mid), Math.ceil(mid) + 1]) {
          if (w <= 0 || w > t) continue;
          if (w / t < 0.1) continue; // 작은 값은 자릿수가 달라 아래에서 따로 본다
          const got = display_format_percent(w / t);
          const want = exact_percent(w, t, 1);
          if (got !== want) bad.push([t, w, got, want]);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
