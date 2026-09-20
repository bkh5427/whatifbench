// 사이트 구조의 불변식. **화면을 봐서는 못 잡는 것들만** 여기 둔다.
//
// 여기서 지키려는 것은 하나다: 방문자가 어느 도구 페이지에 떨어져도
// 다음 갈 곳이 있어야 하고, 그 다음 갈 곳이 같은 카테고리 안에서만
// 돌지 않아야 한다. 도구가 셋일 때는 눈으로 보이지만 서른이면 안 보인다.
//
// ── 이 파일의 설계 원칙 (뮤테이션 감사 이후) ────────────────────
// 1. **상수를 그 상수로 재지 않는다.** `length <= TAG_MAX` 같은 단언은 상수를
//    늘리는 방향으로 조용히 통과한다. 값 자체를 리터럴로 못박고, 그 값에
//    의존하는 *출력*을 골든 벡터로 따로 받아 적는다.
// 2. **골든 벡터는 예측이 아니라 받아 적은 것이다.** 아래 EXPECTED_RELATED는
//    실제로 함수를 돌려 나온 값이다. 데이터를 고치면 여기도 같이 고쳐야 하고,
//    그 강제가 이 표의 존재 이유다.
// 3. **분기는 픽스처로 돈다.** 실제 TOOLS는 데이터가 얇아 같은 카테고리 상한이
//    한 번도 걸리지 않는다(계측값 0회). 상한·동점·requires는 아래 고정
//    픽스처로 검사한다. 실데이터만으로는 그 코드가 있는지 없는지 알 수 없다.
import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CATEGORY_MAX_BEFORE_HEADER_CHANGE,
  RELATED_COUNT,
  RELATED_SAME_CATEGORY_MAX,
  RELATED_WEIGHT,
  TAG_MAX,
  TOOLS,
  tools_calculate_next,
  tools_calculate_related,
  tools_check_publishable,
  tools_read_category,
  tools_read_one,
  tools_read_published,
} from "./tools.js";

/** 발행 게이트를 통과한 가상의 목록. 실제 TOOLS는 검수 전이라 게이트에 걸린다. */
function tools_build_pool(overrides = {}) {
  return TOOLS.map((t) => ({
    ...t,
    published: overrides.publishAll ?? t.published,
    updated: t.updated ?? "2026-09-06",
  }));
}

// ── 고정 픽스처 ─────────────────────────────────────────────
// 실제 데이터가 못 도는 분기를 돌리기 위한 최소 구성.
// `odds`에 형제가 넷이라 같은 카테고리 상한이 반드시 걸리고,
// 형제 셋이 완전 동점이라 tiebreak가 결과를 좌우한다.
const CAP_FIXTURE = [
  { slug: "anchor", category: "odds", tags: ["p", "q"], published: true },
  { slug: "sib-a", category: "odds", tags: ["p", "q"], published: true }, // 3*2 + 2 = 8
  { slug: "sib-b", category: "odds", tags: ["p", "q"], published: true }, // 8 (동점)
  { slug: "sib-c", category: "odds", tags: ["p", "q"], published: true }, // 8 (동점, 상한에 걸린다)
  { slug: "far-a", category: "scale", tags: ["p"], published: true }, //     3
  { slug: "far-b", category: "physics", tags: ["q"], published: true }, //   3 (동점)
  { slug: "hidden", category: "odds", tags: ["p", "q"], published: false }, // 8이지만 미발행
  { slug: "unrelated", category: "scale", tags: ["z"], published: true }, //  0 → 버려진다
];

// 선행 관계(requires)만으로 순위가 갈리는 픽스처. 태그·카테고리 신호를 전부 죽여
// `RELATED_WEIGHT.requires`(5)와 `requiredBy`(4)만 남긴다.
const REQUIRES_FIXTURE = [
  { slug: "mid", category: "odds", tags: [], requires: ["ahead"], published: true },
  { slug: "ahead", category: "physics", tags: [], published: true }, //            mid가 요구 → 5
  { slug: "behind", category: "scale", tags: [], requires: ["mid"], published: true }, // 역방향 → 4
  // 카테고리 신호까지 0으로 만들려면 아무와도 겹치지 않는 키가 필요하다.
  // 실제 CATEGORIES는 셋뿐이라 픽스처 전용 키를 쓴다 — 이 함수는 키를 검증하지 않고
  // 문자열 동일성만 본다.
  { slug: "noise", category: "fixture-only", tags: [], published: true }, //       신호 없음 → 0
];

const tools_read_slugs = (list) => list.map((t) => t.slug);

// ── 골든 벡터 ───────────────────────────────────────────────
// `tools_build_pool({ publishAll: true })`에 대해 실제로 돌려 받아 적은 값이다.
// 예측한 값이 아니다. 데이터가 바뀌면 여기가 먼저 깨진다.
// 분류를 chance/scale/motion/energy로 넓힌 뒤의 값이다. 카테고리가 바뀌면
// 형제가 바뀌고 형제가 바뀌면 이 표가 바뀐다 — 그래서 골든으로 못박는다.
const EXPECTED_RELATED = {
  "monty-hall-n-doors": ["simpsons-paradox", "one-line-or-many", "folding-paper-moon"],
  "simpsons-paradox": ["monty-hall-n-doors", "one-line-or-many", "folding-paper-moon"],
  "one-line-or-many": ["monty-hall-n-doors", "simpsons-paradox", "folding-paper-moon"],
  "folding-paper-moon": ["wifi-through-walls", "solar-system-light-delay", "monty-hall-n-doors"],
  "solar-system-light-delay": ["folding-paper-moon", "wifi-through-walls", "monty-hall-n-doors"],
  "speed-vs-time-saved": ["bicycle-gear-ratio", "projectile-with-drag", "monty-hall-n-doors"],
  "shower-vs-bath": ["speed-vs-time-saved", "bicycle-gear-ratio", "monty-hall-n-doors"],
  "wifi-through-walls": ["folding-paper-moon", "solar-system-light-delay", "monty-hall-n-doors"],
  "bicycle-gear-ratio": ["speed-vs-time-saved", "projectile-with-drag", "shower-vs-bath"],
  "projectile-with-drag": ["speed-vs-time-saved", "bicycle-gear-ratio", "monty-hall-n-doors"],
};

describe("상수 — 값 자체를 못박는다", () => {
  // 상수를 상수로 재는 단언은 늘리는 방향으로 조용히 통과한다.
  // 여기서 리터럴로 고정하고, 이 값들이 만드는 출력은 골든 벡터가 지킨다.
  it("관련 도구 수는 3이다", () => {
    expect(RELATED_COUNT).toBe(3);
  });

  it("같은 카테고리 상한은 2다", () => {
    expect(RELATED_SAME_CATEGORY_MAX).toBe(2);
  });

  it("태그 상한은 5다", () => {
    expect(TAG_MAX).toBe(5);
  });

  it("헤더 한 줄 한계는 카테고리 4개다", () => {
    expect(CATEGORY_MAX_BEFORE_HEADER_CHANGE).toBe(4);
  });

  it("점수 가중치는 선행 > 역선행 > 태그 > 카테고리 순이다", () => {
    expect(RELATED_WEIGHT).toEqual({ tag: 3, category: 2, requires: 5, requiredBy: 4 });
    // 순서가 뒤집히면 '방향이 있는 신호가 가장 강하다'는 설계가 무너진다.
    expect(RELATED_WEIGHT.requires).toBeGreaterThan(RELATED_WEIGHT.requiredBy);
    expect(RELATED_WEIGHT.requiredBy).toBeGreaterThan(RELATED_WEIGHT.tag);
    expect(RELATED_WEIGHT.tag).toBeGreaterThan(RELATED_WEIGHT.category);
  });
});

describe("데이터 무결성", () => {
  it("slug가 중복되지 않는다", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("모든 도구의 category가 CATEGORIES에 있다", () => {
    const keys = CATEGORIES.map((c) => c.key);
    for (const t of TOOLS) {
      expect(keys).toContain(t.category);
      // tools_read_category가 항상 CATEGORIES[0]을 반환해도 위 단언은 통과한다.
      // 계약은 '찾아준 것이 그 키'라는 것이다.
      expect(tools_read_category(t.category).key).toBe(t.category);
    }
  });

  it("등급은 A 또는 B뿐이다 — C등급은 승인 전까지 만들지 않는다", () => {
    for (const t of TOOLS) expect(["A", "B"]).toContain(t.grade);
  });

  it("태그가 6개 이상인 도구가 없다", () => {
    // 리터럴 6. `TAG_MAX + 1`로 쓰면 상한을 50으로 올려도 통과한다.
    for (const t of TOOLS) expect((t.tags ?? []).length).toBeLessThanOrEqual(5);
  });

  it("모든 도구에 blurb가 있다 — 카드가 빈칸으로 렌더되지 않는다", () => {
    for (const t of TOOLS) expect((t.blurb ?? "").length).toBeGreaterThan(20);
  });

  it("figure가 있으면 값과 라벨이 둘 다 있다", () => {
    for (const t of TOOLS.filter((x) => x.figure)) {
      expect(t.figure.value).toBeTruthy();
      expect(t.figure.label).toBeTruthy();
    }
  });

  it("requires가 가리키는 slug가 실재하고, 자기 자신이 아니다", () => {
    const withRequires = TOOLS.filter((t) => (t.requires ?? []).length > 0);
    // 이 단언이 없으면 requires를 가진 도구가 0개가 되는 순간 아래 루프가
    // 공허해진다. 감사 전 이 테스트가 정확히 그 상태였다.
    expect(withRequires.length).toBeGreaterThan(0);
    for (const t of withRequires) {
      for (const s of t.requires) {
        expect(s).not.toBe(t.slug);
        expect(tools_read_one(s)).not.toBeNull();
        expect(tools_read_one(s).slug).toBe(s);
      }
    }
  });

  it("카테고리 수가 헤더 한 줄 한계 안에 있다", () => {
    expect(CATEGORIES.length).toBe(4); // 골든. 늘리려면 헤더 패턴을 먼저 본다.
    expect(CATEGORIES.length).toBeLessThanOrEqual(4);
  });
});

describe("읽기 함수의 계약", () => {
  it("tools_read_one은 요청한 slug를 돌려준다", () => {
    // `TOOLS[0]`을 늘 돌려줘도 not.toBeNull()은 통과한다. slug를 대조한다.
    for (const t of TOOLS) expect(tools_read_one(t.slug).slug).toBe(t.slug);
  });

  it("tools_read_one은 없는 slug에 null을 준다", () => {
    expect(tools_read_one("no-such-tool")).toBeNull();
  });

  it("tools_read_category는 요청한 key를 돌려준다", () => {
    for (const c of CATEGORIES) {
      const got = tools_read_category(c.key);
      expect(got.key).toBe(c.key);
      expect(got.href).toBe(`/${c.key}`);
    }
  });

  it("tools_read_category는 없는 key에 null을 준다", () => {
    expect(tools_read_category("no-such-category")).toBeNull();
  });
});

describe("발행 게이트", () => {
  it("updated가 비어 있으면 throw한다", () => {
    const pool = [{ ...TOOLS[0], published: true, updated: null }];
    expect(() => tools_check_publishable(pool)).toThrow(/updated/);
  });

  it("throw 메시지에 걸린 도구의 slug가 들어간다", () => {
    const pool = [
      { ...TOOLS[0], slug: "bad-one", published: true, updated: null },
      { ...TOOLS[1], slug: "ok-one", published: true, updated: "2026-01-01" },
    ];
    expect(() => tools_check_publishable(pool)).toThrow(/bad-one/);
    expect(() => tools_check_publishable(pool)).not.toThrow(/ok-one/);
  });

  it("updated가 있으면 통과한다", () => {
    expect(tools_check_publishable(tools_build_pool())).toBe(true);
  });

  it("미발행 도구의 updated는 검사하지 않는다", () => {
    const pool = [{ ...TOOLS[0], published: false, updated: null }];
    expect(tools_check_publishable(pool)).toBe(true);
  });

  it("태그가 6개면 throw하고 5개면 통과한다", () => {
    // 경계를 리터럴로 양쪽에서 짚는다. `TAG_MAX + 1`은 상한이 50이어도 통과한다.
    const six = tools_build_pool();
    six[0].tags = ["probability", "rates", "energy", "waves", "mechanics", "distance"];
    expect(() => tools_check_publishable(six)).toThrow(/태그/);

    const five = tools_build_pool();
    five[0].tags = ["probability", "rates", "energy", "waves", "mechanics"];
    expect(tools_check_publishable(five)).toBe(true);
  });
});

describe("관련 도구 선택 — 고정 픽스처", () => {
  it("같은 카테고리 상한이 실제로 걸린다", () => {
    // 형제 넷이 전부 8점 동점이다. 상한이 없으면 sib-c까지 들어가고,
    // 상한이 3이면 역시 sib-c까지 들어간다. 둘 다 이 골든을 깬다.
    expect(tools_read_slugs(tools_calculate_related("anchor", CAP_FIXTURE))).toEqual([
      "sib-a",
      "sib-b",
      "far-a",
    ]);
  });

  it("상한에 걸린 형제 대신 다른 카테고리가 올라온다", () => {
    const picked = tools_calculate_related("anchor", CAP_FIXTURE);
    const same = picked.filter((t) => t.category === "odds");
    expect(same.length).toBe(2); // 리터럴. 상수로 재면 상수를 올렸을 때 통과한다.
    expect(picked.some((t) => t.category !== "odds")).toBe(true);
  });

  it("동점은 배열 순서로 깬다 — 결정적이다", () => {
    // sib-a/sib-b/sib-c는 완전 동점이다. 순서가 배열 순서가 아니면 깨진다.
    expect(tools_read_slugs(tools_calculate_related("anchor", CAP_FIXTURE, 2))).toEqual(["sib-a", "sib-b"]);
    // 배열을 뒤집으면 동점의 순서도 뒤집혀야 한다. 그것이 '배열 순서로 깬다'의 뜻이다.
    const reversed = [...CAP_FIXTURE].reverse();
    expect(tools_read_slugs(tools_calculate_related("anchor", reversed, 2))).toEqual(["sib-c", "sib-b"]);
  });

  it("개수 상한이 골든 길이를 정한다", () => {
    // 후보가 5개(sib-a,b,c / far-a,b) 있는데 3개만 나온다.
    // RELATED_COUNT를 5로 올리면 4개가 되어 이 단언이 죽는다.
    expect(tools_calculate_related("anchor", CAP_FIXTURE)).toHaveLength(3);
    expect(tools_calculate_related("anchor", CAP_FIXTURE, 1)).toHaveLength(1);
  });

  it("점수 0은 버린다 — 카테고리만 같다고 올리지 않는다", () => {
    expect(tools_read_slugs(tools_calculate_related("anchor", CAP_FIXTURE))).not.toContain("unrelated");
  });

  it("미발행은 점수가 아무리 높아도 나오지 않는다", () => {
    // hidden은 8점으로 sib-a와 동점이고 배열에서 앞선 자리도 아니지만,
    // 발행이 아니므로 아예 후보가 아니다.
    expect(tools_read_slugs(tools_calculate_related("anchor", CAP_FIXTURE))).not.toContain("hidden");
  });

  it("미발행 도구 자신은 빈 목록을 받는다", () => {
    expect(tools_calculate_related("hidden", CAP_FIXTURE)).toEqual([]);
  });

  it("모르는 slug는 빈 목록을 받는다", () => {
    expect(tools_calculate_related("no-such-tool", CAP_FIXTURE)).toEqual([]);
  });

  it("선행 관계가 태그·카테고리 없이도 순위를 만든다", () => {
    // ahead는 mid.requires에 있어 5점, behind는 역방향이라 4점, noise는 0점이다.
    // 점수가 있는 둘이 **앞자리를 순서대로** 차지한다. 가중치를 지우면 순서가 바뀐다.
    // (셋째 자리는 채움이 메운다 — 아래 '채움' 테스트가 그 계약을 지킨다.)
    expect(tools_read_slugs(tools_calculate_related("mid", REQUIRES_FIXTURE)).slice(0, 2))
      .toEqual(["ahead", "behind"]);
  });

  it("역방향 선행 관계도 점수가 된다", () => {
    // behind가 mid를 요구하므로, mid는 behind의 목록에 requires(5)로 첫 자리에 온다.
    expect(tools_read_slugs(tools_calculate_related("behind", REQUIRES_FIXTURE))[0]).toBe("mid");
    // ahead 쪽에서 보면 mid가 자기를 요구하므로 requiredBy(4)다.
    expect(tools_read_slugs(tools_calculate_related("ahead", REQUIRES_FIXTURE))[0]).toBe("mid");
  });

  it("채움 — 신호가 없어도 목록이 셋에 못 미치지 않는다", () => {
    // 계약이 바뀐 자리다. 예전에는 점수 0이면 아예 안 나왔고, 그래서 태그가 얇은
    // 글은 관련 목록이 둘뿐이거나 비어 **막다른 골목**이 됐다.
    // 이제 남은 자리는 배열 순서대로 채운다. 내부 링크가 끊기지 않는 것이 먼저다.
    const picked = tools_read_slugs(tools_calculate_related("mid", REQUIRES_FIXTURE));
    expect(picked).toHaveLength(3);
    expect(picked[2]).toBe("noise"); // 신호 있는 둘 **뒤**에만 붙는다
  });

  it("채움은 신호 있는 것을 절대 밀어내지 않는다", () => {
    // noise 자신이 물어도 점수가 0인 셋이 배열 순서대로 채워진다.
    expect(tools_read_slugs(tools_calculate_related("noise", REQUIRES_FIXTURE)))
      .toEqual(["mid", "ahead", "behind"]);
  });

  it("채움도 미발행은 건너뛴다", () => {
    const halfHidden = REQUIRES_FIXTURE.map((t) =>
      t.slug === "noise" ? { ...t, published: false } : t,
    );
    expect(tools_read_slugs(tools_calculate_related("mid", halfHidden))).toEqual(["ahead", "behind"]);
  });
});

describe("관련 도구 선택 — 실제 데이터 골든", () => {
  const pool = tools_build_pool({ publishAll: true });

  it("전부 발행됐을 때의 관련 목록이 골든과 일치한다", () => {
    const actual = Object.fromEntries(
      pool.map((t) => [t.slug, tools_read_slugs(tools_calculate_related(t.slug, pool))]),
    );
    expect(actual).toEqual(EXPECTED_RELATED);
  });

  it("tools_calculate_next는 관련 목록의 첫 번째다", () => {
    for (const t of pool) {
      // 골든으로 못박는다. 같은 함수를 두 번 부르는 대조는 마지막을 돌려줘도 통과한다.
      expect(tools_calculate_next(t.slug, pool).slug).toBe(EXPECTED_RELATED[t.slug][0]);
      expect(tools_calculate_next(t.slug, pool)).toBe(tools_calculate_related(t.slug, pool)[0]);
    }
  });

  it("자기 자신을 고르지 않는다", () => {
    for (const t of pool) {
      expect(tools_read_slugs(tools_calculate_related(t.slug, pool))).not.toContain(t.slug);
    }
  });

  it("미발행 도구는 절대 나오지 않는다", () => {
    const half = tools_build_pool().map((t, i) => ({ ...t, published: i % 2 === 0 }));
    for (const t of half.filter((x) => x.published)) {
      for (const r of tools_calculate_related(t.slug, half)) expect(r.published).toBe(true);
    }
  });

  it("전부 발행되면 어느 도구도 막다른 골목이 아니다", () => {
    for (const t of pool) {
      expect(tools_calculate_related(t.slug, pool).length).toBe(3);
      expect(tools_calculate_next(t.slug, pool)).not.toBeNull();
    }
  });

  it("전부 발행되면 아무도 고아가 아니다 — 모든 도구가 누군가의 목록에 들어간다", () => {
    const seen = new Set();
    for (const t of pool) for (const r of tools_calculate_related(t.slug, pool)) seen.add(r.slug);
    const orphans = pool.filter((t) => !seen.has(t.slug)).map((t) => t.slug);
    expect(orphans).toEqual([]);
  });

  it("실제 데이터는 같은 카테고리 상한 분기를 돌리지 못한다 — 픽스처가 필요한 이유", () => {
    // 이것은 코드가 아니라 **데이터**에 대한 관측이다. 카테고리마다 발행 후보가
    // 셋뿐이라 상한(2)에 닿기 전에 다른 카테고리가 끼어든다. 이 사실이 바뀌면
    // (한 카테고리가 다섯을 넘으면) 이 테스트가 깨지고, 그때 실데이터로도
    // 상한을 검사할 수 있게 된다.
    const byCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c.key, pool.filter((t) => t.category === c.key).length]),
    );
    expect(byCategory).toEqual({ chance: 3, scale: 3, motion: 3, energy: 1 });
  });
});

describe("수동 지정 related", () => {
  const pool = tools_build_pool({ publishAll: true });

  it("related를 손으로 지정하면 자동 선택을 건너뛴다", () => {
    const manual = pool.map((t) =>
      t.slug === "monty-hall-n-doors" ? { ...t, related: ["shower-vs-bath"] } : t,
    );
    expect(tools_read_slugs(tools_calculate_related("monty-hall-n-doors", manual))).toEqual([
      "shower-vs-bath",
    ]);
  });

  it("수동 지정한 순서를 그대로 지킨다", () => {
    const manual = pool.map((t) =>
      t.slug === "monty-hall-n-doors"
        ? { ...t, related: ["shower-vs-bath", "bicycle-gear-ratio"] }
        : t,
    );
    expect(tools_read_slugs(tools_calculate_related("monty-hall-n-doors", manual))).toEqual([
      "shower-vs-bath",
      "bicycle-gear-ratio",
    ]);
  });

  it("수동 지정이라도 미발행은 걸러낸다", () => {
    const manual = pool.map((t) => {
      if (t.slug === "monty-hall-n-doors") {
        return { ...t, related: ["shower-vs-bath", "bicycle-gear-ratio"] };
      }
      return t.slug === "shower-vs-bath" ? { ...t, published: false } : t;
    });
    expect(tools_read_slugs(tools_calculate_related("monty-hall-n-doors", manual))).toEqual([
      "bicycle-gear-ratio",
    ]);
  });

  it("수동 지정이 없는 slug를 가리키면 조용히 빠진다", () => {
    const manual = pool.map((t) =>
      t.slug === "monty-hall-n-doors" ? { ...t, related: ["ghost", "shower-vs-bath"] } : t,
    );
    expect(tools_read_slugs(tools_calculate_related("monty-hall-n-doors", manual))).toEqual([
      "shower-vs-bath",
    ]);
  });

  it("수동 지정도 개수 상한을 넘지 않는다", () => {
    const manual = pool.map((t) =>
      t.slug === "monty-hall-n-doors"
        ? {
            ...t,
            related: [
              "shower-vs-bath",
              "bicycle-gear-ratio",
              "projectile-with-drag",
              "folding-paper-moon",
            ],
          }
        : t,
    );
    expect(tools_calculate_related("monty-hall-n-doors", manual)).toHaveLength(3);
  });
});

describe("목록 읽기", () => {
  it("카테고리 필터가 그 카테고리만 낸다", () => {
    for (const c of CATEGORIES) {
      for (const t of tools_read_published(c.key)) expect(t.category).toBe(c.key);
    }
  });

  it("카테고리 필터는 발행된 것을 빠뜨리지 않는다", () => {
    // 그 카테고리만 내는지 보는 위 테스트는 늘 빈 배열을 돌려줘도 통과한다.
    for (const c of CATEGORIES) {
      const expected = TOOLS.filter((t) => t.published && t.category === c.key).map((t) => t.slug);
      expect(tools_read_slugs(tools_read_published(c.key))).toEqual(expected);
    }
  });

  it("발행된 도구는 홈에서 전부 보인다 — 카테고리 합이 전체와 같다", () => {
    const sum = CATEGORIES.reduce((n, c) => n + tools_read_published(c.key).length, 0);
    expect(sum).toBe(tools_read_published().length);
  });

  it("미발행 도구는 어느 목록에도 없다", () => {
    const published = new Set(tools_read_slugs(tools_read_published()));
    for (const t of TOOLS.filter((x) => !x.published)) expect(published.has(t.slug)).toBe(false);
  });
});
