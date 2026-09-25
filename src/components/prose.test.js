import { describe, expect, it } from "vitest";
import { prose_format_fallback_lead, prose_format_list, prose_format_separator, prose_format_period } from "./prose.js";

// 대조 경로: 구분자를 하나씩 묻는 대신 완성된 문자열을 통째로 못박는다.
// 두 경로가 같은 상수를 읽지만 조립 순서가 달라, 인덱스 경계를 어긋나게 하면
// 한쪽만 통과하는 일이 없다.
describe("prose_format_list — 영문 목록 접속", () => {
  it("1개는 접속사가 없다", () => {
    expect(prose_format_list(["A"])).toBe(" A");
  });

  it("2개는 and 하나로 잇는다", () => {
    expect(prose_format_list(["A", "B"])).toBe(" A and B");
  });

  // `index > 0 ? " and " : " "`이면 여기서 "A and B and C"가 나온다.
  // 카테고리가 4개가 되는 날 실제로 화면에 나올 문장이다.
  it("3개는 쉼표로 잇고 마지막만 and다", () => {
    expect(prose_format_list(["A", "B", "C"])).toBe(" A, B and C");
  });

  it("4개도 and는 한 번뿐이다", () => {
    const rendered = prose_format_list(["A", "B", "C", "D"]);
    expect(rendered).toBe(" A, B, C and D");
    expect(rendered.match(/ and /g)).toHaveLength(1);
  });
});

describe("prose_format_separator — 자리별 구분자", () => {
  it("첫 항목 앞은 공백 하나다", () => {
    expect(prose_format_separator(0, 3)).toBe(" ");
  });

  it("마지막 항목 앞만 and다", () => {
    expect(prose_format_separator(2, 3)).toBe(" and ");
    expect(prose_format_separator(1, 3)).toBe(", ");
  });

  it("항목이 하나면 첫 항목이자 마지막이지만 접속사를 붙이지 않는다", () => {
    expect(prose_format_separator(0, 1)).toBe(" ");
  });
});

// `RelatedTools.astro`에서 옮겨 왔다. 산출물로는 ①을 만들 수 없다 —
// 미발행 페이지가 빌드되면 그것 자체가 결함이고, 게이트가 막는다.
describe("Read next 대체 문구", () => {
  it("① 미발행이면 자기가 카테고리에 있다고 말하지 않는다", () => {
    const lead = prose_format_fallback_lead(false, 0);
    expect(lead).toBe("Nothing here links into ");
    expect(lead).not.toContain("Nothing else sits in");
  });

  it("① 미발행이면 형제 수와 무관하게 같은 문장이다", () => {
    expect(prose_format_fallback_lead(false, 3)).toBe("Nothing here links into ");
  });

  it("② 발행됐고 형제가 있으면 점수가 0이었다고 말한다", () => {
    expect(prose_format_fallback_lead(true, 1)).toBe("Nothing here pairs closely with the rest of ");
  });

  it("③ 발행됐고 형제가 없으면 형제가 없다고 말한다", () => {
    expect(prose_format_fallback_lead(true, 0)).toBe("Nothing else sits in ");
  });
});

// 2026-09-25: /about의 "Finished so far: … One Line or Many??." — 도구 이름이 물음표로
// 끝나는데 목록 끝 마침표를 그대로 붙였다. 셋째 도구를 발행한 날 처음 난 결함이다.
describe("prose_format_period", () => {
  it("보통 이름 뒤에는 마침표를 붙인다", () => {
    expect(prose_format_period("Monty Hall with N doors")).toBe(".");
  });

  it("물음표·느낌표·마침표·줄임표로 끝나면 붙이지 않는다", () => {
    for (const name of ["One Line or Many?", "Wow!", "Etc.", "And so on…"]) {
      expect(prose_format_period(name)).toBe("");
    }
  });

  it("뒤에 공백이 붙어 있어도 본다", () => {
    expect(prose_format_period("One Line or Many?  ")).toBe("");
  });

  it("빈 값·undefined에는 마침표를 붙인다 — 목록이 비면 호출되지 않지만 터지지 않아야 한다", () => {
    expect(prose_format_period("")).toBe(".");
    expect(prose_format_period(undefined)).toBe(".");
  });
});
