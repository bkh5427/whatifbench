// 도구 목록의 유일한 진실 원본.
// 홈·카테고리 인덱스·브레드크럼·관련 도구가 전부 여기를 읽는다.
// URL이 평면(/monty-hall-n-doors)이라 카테고리는 이 데이터에만 존재한다.
//
// published: false 인 도구는 어디에도 렌더되지 않는다.
// "준비 중" 표시를 남기면 Valuable inventory 조항(under construction)에 걸린다.

export const CATEGORIES = [
  { key: "odds", href: "/odds", short: "Odds", name: "Odds & Intuition" },
  { key: "scale", href: "/scale", short: "Scale", name: "Scale & Time" },
  { key: "physics", href: "/physics", short: "Physics", name: "Everyday Physics" },
];

export const TOOLS = [
  {
    slug: "monty-hall-n-doors",
    category: "odds",
    name: "Monty Hall with N doors",
    blurb:
      "Move the door count and the number of doors the host opens. The advantage of switching tracks the reveals, not the doors.",
    published: true,
  },
  { slug: "simpsons-paradox", category: "odds", name: "Simpson's Paradox Mixer", blurb: "Two groups where one treatment wins each time, and loses once the groups are pooled.", published: false },
  { slug: "one-line-or-many", category: "odds", name: "One Line or Many?", blurb: "A single queue against one queue per counter, on average wait and on worst-case wait.", published: false },

  { slug: "folding-paper-moon", category: "scale", name: "Folding Paper to the Moon", blurb: "Doubling thickness, on a linear axis and a log axis. The same numbers, two different stories.", published: false },
  { slug: "solar-system-light-delay", category: "scale", name: "Talking Across the Solar System", blurb: "One-way and round-trip light delay as the planets move.", published: false },
  { slug: "speed-vs-time-saved", category: "scale", name: "How Little Time Speeding Saves", blurb: "Time saved against speed, with the fixed delays held constant on both sides.", published: false },
  { slug: "shower-vs-bath", category: "scale", name: "Shower vs Bath", blurb: "Water and heating energy plotted together, with the crossing point marked.", published: false },

  { slug: "wifi-through-walls", category: "physics", name: "Wi-Fi Through Walls", blurb: "Path loss by band and wall material. The 2.4 and 5 GHz curves cross, and the crossing moves with every wall.", published: false },
  { slug: "bicycle-gear-ratio", category: "physics", name: "Bicycle Gear Ratios", blurb: "Gear inches, gain ratio and speed against cadence, with duplicate gears marked.", published: false },
  { slug: "projectile-with-drag", category: "physics", name: "Projectiles with Air Drag", blurb: "Trajectory with drag, drawn over the vacuum solution as a ghost line.", published: false },
];

/** 발행된 도구만. 미발행은 사이트 어디에도 나오지 않는다. */
export function tools_read_published(categoryKey = null) {
  return TOOLS.filter((t) => t.published && (!categoryKey || t.category === categoryKey));
}

/** slug로 도구 하나. */
export function tools_read_one(slug) {
  return TOOLS.find((t) => t.slug === slug) ?? null;
}

/** key로 카테고리 하나. */
export function tools_read_category(key) {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}
