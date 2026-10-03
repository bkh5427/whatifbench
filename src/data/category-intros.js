// 카테고리 인덱스 도입글.
// 링크 목록만 있는 페이지는 Valuable inventory 조항에 걸린다. 250~400단어를 붙인다.
// 목록 서문이 아니라 '주제 자체에 대한 글'이어야 한다.
//
// 분류 이름은 소재의 넓은 축이다(`tools.js`의 CATEGORIES 주석 참고).
// 그러니 도입글도 "이 분류에 무엇이 있다"가 아니라 "이 소재에서 직관이 어디서
// 어긋나는가"를 쓴다 — 글이 늘어도 도입글을 다시 쓸 일이 없어야 한다.

export const INTROS = {
  chance: {
    description:
      "Puzzles you can finish on a napkin and still refuse to believe.",
    // 2026-09-27: 네 문단 중 셋이 몬티홀이던 것을 도구별로 한 문단씩 나눴다
    // (몬티홀 · 심슨 · 줄서기). 예로 든 수치·가정은 각 도구 페이지에 적힌 것 그대로다.
    // 2026-10-03 (운영자 결정 6): 1문단 첫 두 문장과 4문단 줄서기 문장을 운영자 문장으로 바꿨다.
    // "leaves out"은 허브에서 홈 1회·About 1회만 둔다 — 여기서는 "does not count".
    // 4문단은 운영자 문장에서 "only" 하나를 뺐다 — CV를 옮겨도 창구별 줄 평균은 정확하다
    // (one-line 페이지 339~341행). 바이라인 gradeNote(_meta.js:16)와 같은 범위다.
    paragraphs: [
      `What these puzzles have in common is that the sums fit on a napkin and
       the answer still refuses to sit right. None of them needs
       advanced probability; the difficulty lies in giving up an assumption you
       did not know you were making.`,
      `A slider earns its place because it lets you push past the case a puzzle
       is usually told with. In 1990 a magazine column said switching doors wins
       two games in three, and thousands of letters told the columnist she was
       wrong. Monty Hall with N doors plays that game and then keeps going, to see
       whether the answer you just accepted generalises. It holds and thins out at
       once. In the model, switching stays the better move at every setting the sliders allow. By a hundred doors with one opened, though, the edge is
       about one game in ten thousand.`,
      `Each tool keeps apart two things that are easy to blur: what its model
       computes and what it assumes. Simpson's Paradox Mixer computes very little,
       a division and a weighted sum. Press its Berkeley preset and the model
       puts women ahead in both departments and 19.4 percentage points behind
       once the departments are added together. Its assumptions sit on the page
       in plain view. Every rate is treated as exact, with no confidence interval,
       and the data is split only one way, into two groups. Nothing in that
       arithmetic says why the two mixtures differ, and the page says so.`,
      `The tools here are the arithmetic kind of model: given the stated rules,
       each answer is true or false rather than a matter of judgement. One Line or
       Many? is the exception: its queueing formulas are exact while
       transaction times keep their default spread, and the page says where that
       stops. Customers who switch lines, which the model does not count, would
       shrink the gap it reports.`,
    ],
  },

  scale: {
    description:
      "Orders of magnitude, and the log axis that keeps them on one page.",
    // 2026-09-26: 두 편(folding-paper-moon · solar-system-light-delay)으로 다시 연다.
    // 같은 날 wifi-through-walls가 셋째로 들어와 첫·셋째·넷째 문단에 그 도구를 넣었다.
    // 2026-09-27: 문체 개정. 끝 문단의 단순화 서술은 각 페이지의 가정 목록 글자에 맞췄다.
    // 2026-10-03: 끝 문단 앞뒤의 "names what it simplifies / no term for" 두 문장을 지웠다
    // (허브 "leaves out" 류 축소). 가운데 단순화 세 가지는 그대로다.
    paragraphs: [
      `Arithmetic that adds and arithmetic that multiplies run away from each
       other fast. Start at one: twenty steps of adding one leaves you at 21, and
       twenty steps of doubling at 1 048 576. Folding Paper to the Moon lives on
       the multiplying side of that gap, with a thickness that doubles at every
       fold. Talking Across the Solar System deals in distances so large that
       light needs real minutes to cross them. Wi-Fi Through Walls counts in
       decibels, where each tenfold step in power adds ten to the scale.`,
      `The device that keeps coming back is the axis. A doubling process on a
       linear axis looks like nothing happening, then a wall. On a logarithmic
       axis the same process is a straight line with no drama in it. Neither
       picture is wrong. When a headline says something grew tenfold, the axis
       you imagine can change whether that sounds alarming or ordinary.`,
      `Two of the models are deliberately thin: a doubling is one multiplication,
       a light delay one division. Arithmetic that small is easy to check, which
       leaves the more interesting question of why a correct answer can feel
       wrong. The Wi-Fi model is heavier: a published formula for one flat wall,
       repeated for each wall and added to what distance alone takes. Its page
       works one case through by hand, as the other two do.`,
      `What earns a question a place here is how much its answer depends on a
       setting. A figure quoted for the distance to another planet might be one
       moment's value, an average, or one end of a range. They can be far apart:
       the light-delay model puts Mars at its farthest nearly five times as
       far from Earth as at its closest. Folding is the opposite case. Across its
       whole range the thickness slider moves the Moon answer by only three
       folds, and that narrowness is the finding.`,
      `The light-delay model puts each body
       on a circle around the Sun, with all the circles in one plane. The folding
       model stacks perfect layers, with no trapped air, no squashing and no
       paper lost to the curve at a crease. The Wi-Fi model sends one straight
       path through empty space and treats each wall as one flat slab of a single
       material, met square on.`,
    ],
  },

  motion: {
    description:
      "Vehicles and the formulas behind them, each chart marking where the formula stops holding.",
    paragraphs: [
      `This section is about things that move, and about how badly the intuition
       for them scales. A bicycle drivetrain, a thrown ball, a car on an open
       road: in each case the quantity you care about is not the one on the dial,
       and the gap between the two is where the interesting answer lives.`,
      `Take the most familiar of them. Time saved by going faster is governed by
       the reciprocal of speed, not by speed, so a fixed increase returns a
       shrinking amount. The same twenty kilometres an hour is worth fifteen
       minutes over ten kilometres at 20 km/h and half a minute at 140 — a factor
       of twenty-eight across one slider. Reciprocals do that quietly, which is why
       a question about speed is worth a dial rather than a worked example.`,
      `Some of what belongs here runs a standard formula over coefficients taken
       from published tables, which makes it a different sort of thing from the
       probability pages. A probability model is true or false given its rules. A
       drag model is an approximation fitted to measurements that scatter, and it
       can be applied perfectly correctly and still miss the real number by a wide
       margin. So every coefficient is sourced to the document it came from, and
       each page names what its formula has no term for.`,
      `A drag model gets built accordingly: integrate a quadratic drag term, draw
       the vacuum solution behind it as a ghost line, and put the textbook 45° and
       the model's own optimum on one pair of axes — along with how much range
       is lost by throwing at 45° instead: about 1% for a baseball at 40 m/s,
       close to 10% for a beach ball at the same speed, and more for both as the
       launch speed rises. Not everything here is fitted, though. A drivetrain is one
       ratio of tooth counts multiplied by one length, so no measured coefficient
       enters at all — and even then a geometric assumption does, and calling two
       gears duplicates is a threshold somebody has to choose rather than a fact
       about the bicycle. What such a model carries no term for is effort:
       distance per pedal revolution says nothing about what that costs.`,
      `Where a coefficient shifts with conditions and the conclusion would need a
       judgement call, the tool stays unbuilt rather than dressing a guess up as a
       calculation.`,
    ],
  },

  energy: {
    description:
      "Power, heat, water and fuel: what a habit costs once water and heat are counted separately.",
    paragraphs: [
      `Energy questions get argued about in the wrong unit. Someone says a bath
       uses more than a shower, someone else says it depends how long you stand
       there, and neither says whether they mean the water or the heat. Those are
       two different quantities that happen to arrive on the same bill, and they
       cross at the same moment only when the water is heated through the same
       rise both ways.`,
      `That is the shape of almost everything in this section. A 9.5 litre per
       minute shower passes an 80 litre bath at about the eight-minute mark on
       water — but the energy curve has its own crossing, at its own minute,
       because the two are computed from different things: one from litres
       alone, the other from litres and the temperature the water has to be
       lifted through. Drawing them on one chart with two separate crossings
       marked is the honest version of the answer. Quoting one number is not.`,
      `The arithmetic itself is undramatic — a flow rate times minutes, a specific
       heat times a temperature rise. What makes these worth a dial is that the
       inputs are personal and the published averages are not. A household's real
       shower head, real bath, real inlet temperature and real habits move the
       crossing point around enough that the general claim cannot survive it. You
       have the numbers for your own house; the model does not.`,
      `So these pages are built to be argued with. Every coefficient is sourced,
       every assumption is named, and where a figure depends on a tariff or a
       climate or an appliance that varies by country, the page says so rather
       than quietly picking one. Where the answer would need a judgement call
       about how somebody actually lives, the tool draws the range and stops
       there.`,
    ],
  },
};
