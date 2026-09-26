// 도구 목록의 유일한 진실 원본.
// 홈·카테고리 인덱스·브레드크럼·관련 도구·바이라인이 전부 여기를 읽는다.
// URL이 평면(/monty-hall-n-doors)이라 카테고리는 이 데이터에만 존재한다.
//
// published: false 인 도구는 어디에도 렌더되지 않는다.
// "준비 중" 표시를 남기면 Valuable inventory 조항(under construction)에 걸린다.
//
// ── 필드 ──────────────────────────────────────────────────
// slug/category/name/blurb/published : 라우팅과 목록
// grade      "A"|"B"  모델 등급. 바이라인이 읽는다. 페이지에 하드코딩하지 않는다
// since      최초 발행일. 쓰고 나면 안 바뀌는 사실
// updated    마지막으로 사람이 끝까지 읽은 날. **null이면 발행할 수 없다** (아래 게이트)
// changed    그때 무엇을 바꿨는지 한 줄. 날짜만 있는 것보다 신호가 강하다
// tags       관련 도구 선택에만 쓴다. **태그 페이지는 만들지 않는다**
//            (링크 목록 = Valuable inventory, 자동 생성 = scaled content abuse)
// figure     카드에 얹는 숫자. 없으면 카드에서 숫자 블록만 빠진다
//            **주어는 모델이다** — "실제로 이렇다"가 아니라 "이 모델이 이렇게 말한다"
// requires   먼저 보면 이해가 쉬운 도구. 방향이 있어 역방향도 점수로 쓴다
// related    수동 지정. 있으면 자동 선택을 건너뛴다. 형제가 4개를 넘을 때 필요해진다

// 이름은 **소재의 넓은 축**이다. 사이트의 주장("숫자 하나를 움직이면 결론이
// 뒤집히는 지점이 있다")은 태그라인이 지고, 분류는 다시 이름 붙일 일이 없을 만큼
// 넓어야 한다. 예전 이름이 좁았던 이유를 남겨둔다:
//   Odds & Intuition → '직관'은 사이트 전체의 주제다. 한 분류가 독점하면
//                      나머지는 "직관과 무관한 글"이 된다.
//   Scale & Time     → 이미 내용물에 실패했다. Shower vs Bath는 규모도 시간도 아니다.
//   Everyday Physics → 'everyday'가 천장이다. 차량 동역학은 everyday가 아니다.
/**
 * **열린** 카테고리. 헤더·홈 절·꼬리말·`/<key>` 인덱스가 이것만 읽는다.
 *
 * 규칙: 그 카테고리에 `published: true`가 **2개 이상** 확보된 뒤에 여기 옮긴다.
 * 미리 열면 빈 인덱스가 "under construction" 신호가 되고, 도입글이 없는 글을
 * 전제하는 전칭("Everything in this section…")과 미발행 도구의 수치를 싣게 된다.
 * 2026-09-24 전수검사에서 실제로 그렇게 됐다 — scale·motion·energy가 공개 도구
 * 0개로 열려 있으면서 결함 27건을 냈고, 그중 하나(/scale의 7.07 dB)는 같은 문장에
 * 적힌 두 주파수로 독자가 다시 계산하면 6.38이 나오는 수였다. 그래서 셋을 닫았다.
 * `tools.test.js`가 이 규칙을 기계로 지킨다.
 *
 * 헤더 가로폭 한계: 카테고리 4개(=nav 5항목)까지는 360px 모바일에서 한 줄이다.
 * **5개가 되는 순간** 2줄로 깨지므로 헤더 패턴을 바꿔야 한다 (로고 + Tools + About).
 */
export const CATEGORIES = [
  { key: "chance", href: "/chance", short: "Chance", name: "Chance" },
];

/**
 * 선언만 해 둔 **닫힌** 카테고리. 사이트 어디에도 렌더되지 않는다 —
 * `/scale` 같은 주소도 없다. 초안 도구가 이 key를 달고 기다릴 수 있게만 둔다.
 * 도입글(`category-intros.js`)도 그대로 남겨 둔다: 도구 둘이 발행되면 거의 그대로
 * 다시 참이 되므로, 문장을 버리는 대신 발행 전까지 잠가 두는 쪽이 낫다.
 */
export const CATEGORIES_PLANNED = [
  { key: "scale", href: "/scale", short: "Scale", name: "Scale" },
  { key: "motion", href: "/motion", short: "Motion", name: "Motion" },
  { key: "energy", href: "/energy", short: "Energy", name: "Energy" },
];

/** 열렸든 닫혔든 이름이 붙어 있는 모든 카테고리. 도구의 `category` 검증용. */
export const CATEGORIES_ALL = [...CATEGORIES, ...CATEGORIES_PLANNED];
import { tags_check_unknown, tags_read_domain } from "./tags.js";
import { meta as MONTY_HALL_N_DOORS } from "../pages/monty-hall-n-doors/_meta.js";
import { meta as SIMPSONS_PARADOX } from "../pages/simpsons-paradox/_meta.js";
import { meta as ONE_LINE_OR_MANY } from "../pages/one-line-or-many/_meta.js";

export const CATEGORY_MAX_BEFORE_HEADER_CHANGE = 4;
/** 카테고리를 열 수 있는 최소 발행 수. 위 주석의 규칙을 기계가 읽는 값으로. */
export const CATEGORY_OPEN_MIN_PUBLISHED = 2;

// 발행된 글은 자기 폴더에서 자기 메타를 선언한다 (`_meta.js`).
// 여기 배열은 **순서 목록**이다 — 관련 도구 동점을 이 순서로 깨므로
// glob이 아니라 명시적 import를 쓴다. 파일 시스템 순서에 기대지 않는다.
// 아직 발행 전인 글은 초안 폴더(`../../../01_drafts/<slug>/`)에 있고,
// 검수를 통과할 때 아래 인라인 항목이 그 폴더의 `_meta.js`로 옮겨 간다.
export const TOOLS = [
  MONTY_HALL_N_DOORS,
  SIMPSONS_PARADOX,
  ONE_LINE_OR_MANY,

  {
    slug: "folding-paper-moon",
    category: "scale",
    name: "Folding Paper to the Moon",
    blurb: "Doubling thickness, on a linear axis and a log axis. The same numbers, two different stories.",
    grade: "A",
    since: null,
    updated: null,
    changed: "",
    tags: ["exponential", "log-axis", "counterintuitive", "abstract"],
    // 42는 기본 두께 0.1 mm에서만 참이다 — 0.05 mm면 43, 0.5 mm면 40.
    // 조건을 라벨에 넣지 않으면 카드가 두께와 무관한 상수처럼 읽힌다.
    figure: { value: "42", label: "folds until the model's stack passes the Moon, at 0.1 mm paper" },
    published: false,
  },
  // requires: 같은 이유 — 거리 축이 로그다. 축을 먼저 읽고 오면 표가 다르게 보인다.
  { slug: "solar-system-light-delay", category: "scale", name: "Talking Across the Solar System", blurb: "One-way and round-trip light delay as the planets move.", grade: "A", since: null, updated: null, changed: "", tags: ["distance", "log-axis", "space"], requires: ["folding-paper-moon"], figure: { value: "4.82×", label: "the model’s swing in one-way delay to Mars, closest against farthest" }, published: false },
  // 5.00분은 40→60 km/h · 10 km에서만 참이다 — 같은 +20이라도 70→90이면 1.90분이다.
  { slug: "speed-vs-time-saved", category: "motion", name: "How Little Time Speeding Saves", blurb: "Time saved against speed, with the fixed delays held constant on both sides.", grade: "A", since: null, updated: null, changed: "", tags: ["counterintuitive", "rates", "commute"], figure: { value: "5.00 min", label: "the model’s saving from 40 to 60 km/h over 10 km" }, published: false },
  { slug: "shower-vs-bath", category: "energy", name: "Shower vs Bath", blurb: "Water and heating energy plotted together, each with its own crossing minute marked — the model does not put the two in the same place.", grade: "A", since: null, updated: null, changed: "", tags: ["rates", "energy", "home"], figure: { value: "8.4 min", label: "the minute the model has a 9.5 L/min shower pass an 80 L bath" }, published: false },

  // requires: 로그 축을 읽는 법 자체를 다루는 페이지가 folding-paper-moon이다.
  // 이 페이지의 x축은 로그이고, "거리 두 배마다 6.02 dB"라는 읽기법이 거기에 기댄다.
  { slug: "wifi-through-walls", category: "scale", name: "Wi-Fi Through Walls", blurb: "Path loss by band and wall material. At equal power the model puts 5 GHz below 2.4 GHz with no walls at all, and the wall material decides how fast the gap widens from there.", grade: "B", since: null, updated: null, changed: "", tags: ["log-axis", "counterintuitive", "waves", "home"], requires: ["folding-paper-moon"], figure: { value: "7.07 dB", label: "the model’s gap between 5 GHz and 2.4 GHz with no walls at all" }, published: false },
  // “6 of 22”는 허용오차 5%에서의 값이다. 중복은 정의마다 갈리므로 라벨에 조건을 넣는다.
  { slug: "bicycle-gear-ratio", category: "motion", name: "Bicycle Gear Ratios", blurb: "Gear inches, gain ratio and speed against cadence, with duplicate gears marked.", grade: "A", since: null, updated: null, changed: "", tags: ["rates", "mechanics", "outdoors"], figure: { value: "6 of 22", label: "the combinations the model can drop at a 5% tolerance, on a 50/34 with 11–28" }, published: false },
  { slug: "projectile-with-drag", category: "motion", name: "Projectiles with Air Drag", blurb: "Trajectory with drag, drawn over the vacuum solution as a ghost line.", grade: "B", since: null, updated: null, changed: "", tags: ["mechanics", "counterintuitive", "outdoors"], figure: { value: "40.1°", label: "the model’s longest-range angle for a 145 g ball at 40 m/s, against 45° in a vacuum" }, published: false },
];

// ── 관련 도구 선택 ──────────────────────────────────────────
/** 한 페이지에 싣는 관련 도구 수. 넷을 넘으면 고르는 일이 편집 판단이 된다. */
export const RELATED_COUNT = 3;
/**
 * 점수 가중치. 선행 관계가 가장 강하다 — 방향이 있는 유일한 신호이기 때문이다.
 * 카테고리는 셋뿐이라 단독으로는 해상도가 없다(도구 30개면 10개가 동점).
 */
export const RELATED_WEIGHT = { tag: 3, category: 2, requires: 5, requiredBy: 4 };
/** 셋 중 같은 카테고리는 둘까지. 목록이 자기 카테고리 안에서 닫히지 않게 한다. */
export const RELATED_SAME_CATEGORY_MAX = 2;
/** 도구당 태그 상한. 남발하면 모두가 서로 관련돼 신호가 죽는다. */
export const TAG_MAX = 5;

/** 발행된 도구만. 미발행은 사이트 어디에도 나오지 않는다. */
export function tools_read_published(categoryKey = null) {
  return TOOLS.filter((t) => t.published && (!categoryKey || t.category === categoryKey));
}

/**
 * 발행된 도구를 **최신순**으로. 홈의 대표 카드와 "The latest" 격자가 읽는다.
 * 기준은 `since`(최초 발행일)다 — `updated`로 정렬하면 오타 하나 고친 옛 글이
 * 새 글처럼 맨 앞에 선다. 같은 날 발행된 글은 `TOOLS`에서 **뒤에 있는 쪽이 먼저**다
 * (배열에 나중에 들어온 글이 나중에 발행된 글이다). 결정적이어야 한다.
 */
export function tools_read_latest(categoryKey = null) {
  return tools_read_published(categoryKey)
    .map((tool) => ({ tool, index: TOOLS.indexOf(tool) }))
    .sort((a, b) => (b.tool.since ?? "").localeCompare(a.tool.since ?? "") || b.index - a.index)
    .map((entry) => entry.tool);
}

/**
 * 가장 최근 발행일과 **그날 발행된 도구 전부**. 홈·카테고리 인덱스의 대표 칸이 읽는다.
 * 같은 날 두 편이 나오면 둘 다 대표 칸에 선다 — 한 편만 세우면 "가장 새 글"이라는
 * 기록에 없는 순서를 주장하게 된다(2026-09-25 검사). 나머지(`earlier`)는 모두 그보다 앞선 날이다.
 */
export function tools_read_latest_day(categoryKey = null) {
  const latest = tools_read_latest(categoryKey);
  const date = latest[0]?.since ?? null;
  return {
    date,
    newest: latest.filter((t) => t.since === date),
    earlier: latest.filter((t) => t.since !== date),
  };
}

/** slug로 도구 하나. */
export function tools_read_one(slug) {
  return TOOLS.find((t) => t.slug === slug) ?? null;
}

/** key로 **열린** 카테고리 하나. 닫힌 카테고리는 null이다 — 페이지가 안 만들어진다. */
export function tools_read_category(key) {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}

/**
 * 관련 도구를 고른다. 빌드 타임에 도는 순수 함수다.
 *
 * 동점은 `TOOLS`의 배열 순서로 깬다 — **결정적이어야 한다.** 무작위로 고르면
 * 빌드할 때마다 산출물이 달라져 diff를 읽을 수 없다.
 * 아래 `|| a.index - b.index`는 그 의도를 코드에 적어 둔 것이고, 실행 결과로는
 * 중복이다: ES2019부터 `Array.prototype.sort`가 안정 정렬로 명세되어 있고
 * 정렬 전 배열이 이미 index 오름차순이라, 이 항을 지워도 출력이 같다
 * (10개 도구 전부에서 대조해 확인). **뮤테이션으로 죽지 않는 항이다.**
 * 지우지 말 것 — 안정성에 기대는 대신 명시하는 쪽이 읽는 사람에게 정확하다.
 *
 * 점수 0은 버린다. 태그를 안 붙인 도구가 "카테고리가 같다"는 이유만으로
 * 상위에 올라오면, 태그 누락이 조용히 나쁜 추천이 된다.
 */
export function tools_calculate_related(slug, pool = TOOLS, count = RELATED_COUNT) {
  const me = pool.find((t) => t.slug === slug);
  if (!me || !me.published) return [];

  if (me.related && me.related.length > 0) {
    return me.related
      .map((s) => pool.find((t) => t.slug === s))
      .filter((t) => t && t.published)
      .slice(0, count);
  }

  const scored = pool
    .filter((t) => t.published && t.slug !== slug)
    .map((t, index) => {
      // 도메인 태그만 센다. **상황 태그는 유사도가 아니라 배치용이다** —
      // "둘 다 집에서 쓴다"가 "둘 다 확률 문제다"와 같은 무게를 가지면 안 된다.
      const mine = tags_read_domain(me.tags ?? []);
      const theirs = tags_read_domain(t.tags ?? []);
      const shared = mine.filter((tag) => theirs.includes(tag)).length;
      let score = RELATED_WEIGHT.tag * shared;
      if (t.category === me.category) score += RELATED_WEIGHT.category;
      if ((me.requires ?? []).includes(t.slug)) score += RELATED_WEIGHT.requires;
      if ((t.requires ?? []).includes(slug)) score += RELATED_WEIGHT.requiredBy;
      return { tool: t, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked = [];
  let sameCategory = 0;
  for (const entry of scored) {
    if (picked.length >= count) break;
    const isSibling = entry.tool.category === me.category;
    if (isSibling && sameCategory >= RELATED_SAME_CATEGORY_MAX) continue;
    if (isSibling) sameCategory += 1;
    picked.push(entry.tool);
  }

  // 채움. 점수가 0인 짝뿐이면 목록이 `count`에 못 미친다 — 막다른 골목은
  // 내부 링크가 끊긴다는 뜻이라 그 자체가 결함이다(태그가 얇은
  // solar-system-light-delay와 shower-vs-bath가 실제로 둘뿐이었다).
  // 남은 자리는 **배열 순서대로** 채운다. 무작위가 아니라 순서라서 결과가
  // 결정적이고 골든으로 못박을 수 있다.
  if (picked.length < count) {
    for (const tool of pool) {
      if (picked.length >= count) break;
      if (!tool.published || tool.slug === slug) continue;
      if (picked.includes(tool)) continue;
      picked.push(tool);
    }
  }
  return picked;
}

/** 관련 목록에서 첫 번째. 페이지 끝의 "다음" 카드가 읽는다. */
export function tools_calculate_next(slug, pool = TOOLS) {
  return tools_calculate_related(slug, pool, 1)[0] ?? null;
}

/**
 * 발행 게이트. `published`인데 `updated`가 없으면 사람이 끝까지 읽지 않은 것이다.
 *
 * **프로덕션 호출부는 없다.** 부르는 곳은 `scripts/check-publish.mjs`와
 * `tools.test.js` 둘뿐이고, `astro build`는 이 함수를 거치지 않는다 —
 * 빌드에 물리면 검수 전 도구가 하나라도 있는 동안 `npm run dev`조차 못 돈다.
 * 집행은 푸시 훅(`check:full` = 빌드 후 게이트)이 한다.
 */
export function tools_check_publishable(pool = TOOLS) {
  const bad = pool.filter((t) => t.published && !t.updated);
  if (bad.length > 0) {
    throw new Error(
      `발행하려면 updated 날짜가 있어야 한다 (사람이 끝까지 읽은 날): ${bad.map((t) => t.slug).join(", ")}`,
    );
  }
  const unknown = pool
    .map((t) => ({ slug: t.slug, bad: tags_check_unknown(t.tags ?? []) }))
    .filter((e) => e.bad.length > 0);
  if (unknown.length > 0) {
    throw new Error(
      `허용 목록에 없는 태그다 (src/data/tags.js): ${unknown.map((e) => `${e.slug}[${e.bad.join(",")}]`).join(", ")}`,
    );
  }
  const overTagged = pool.filter((t) => (t.tags ?? []).length > TAG_MAX);
  if (overTagged.length > 0) {
    throw new Error(`태그가 ${TAG_MAX}개를 넘는다: ${overTagged.map((t) => t.slug).join(", ")}`);
  }
  // 열려 있는데 발행이 모자란 카테고리. 빈 인덱스는 "under construction" 신호다.
  const thin = CATEGORIES.filter(
    (c) => pool.filter((t) => t.published && t.category === c.key).length < CATEGORY_OPEN_MIN_PUBLISHED,
  );
  if (thin.length > 0) {
    throw new Error(
      `공개 도구가 ${CATEGORY_OPEN_MIN_PUBLISHED}개 미만인 카테고리가 열려 있다 (CATEGORIES_PLANNED로 옮길 것): ${thin.map((c) => c.key).join(", ")}`,
    );
  }
  // 발행된 도구가 닫힌 카테고리에 있으면 그 글은 브레드크럼도 인덱스도 없다.
  const homeless = pool.filter((t) => t.published && !CATEGORIES.some((c) => c.key === t.category));
  if (homeless.length > 0) {
    throw new Error(
      `발행된 도구의 카테고리가 닫혀 있다: ${homeless.map((t) => `${t.slug}[${t.category}]`).join(", ")}`,
    );
  }
  return true;
}
