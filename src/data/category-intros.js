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
      "Probability puzzles where the arithmetic is short and the answer is one you want to argue with.",
    paragraphs: [
      `The probability puzzles this site builds tools for have something
       uncomfortable in common: the arithmetic is short enough to do on paper, and
       the answer still feels wrong once you get it. That pair is the test for
       getting built here — no advanced probability, and the difficulty all in
       giving up an assumption you did not know you were making.`,
      `That is why they are worth a slider rather than a paragraph. When a magazine
       column said in 1990 that switching doors wins two games in three, thousands
       of letters told the columnist she was wrong. Watching a simulation run ten thousand games and close in on
       0.667 does something a proof does not. And once the parameter is on a
       slider you can push it well past the three-door case the puzzle is usually
       told with, and find out whether the result you just accepted actually
       generalises. Here it holds and thins out at
       once: switching stays the better move at every setting the slider allows,
       and by a hundred doors with one opened the edge is about one game in ten
       thousand.`,
      `The tools here keep two things apart that are easy to conflate: what the
       model computes, and what the model assumes. In Monty Hall with N doors the
       exact value is drawn as a dashed line and the score so far as a solid one. Given
       enough games the solid line settles onto its dashed one; at settings where
       the two exact values nearly touch, the longest run the slider allows is not
       enough, and the page says so instead of letting the picture promise it. The
       writing there also says which rule was
       fixed to get that number — who knows what, what is chosen at random, what is
       held constant — because in problems like these the surprising answer
       depends on a rule that gets stated once and then forgotten.`,
      `The tools here are the arithmetic kind of model: given the stated rules,
       the answers are true or false rather than matters of judgement. One of them
       steps outside that in one setting, and says so on its own page — the
       queueing tool leaves its exact formula behind when the service time stops
       being exponential. Where a variant changes the answer — a host who might
       open the prize door, for one — I name it rather than leave it as an
       exercise.`,
    ],
  },

  scale: {
    description:
      "Orders of magnitude, and the axis you draw them on. What a number does when the exponent moves.",
    // 2026-09-26: 두 편(folding-paper-moon · solar-system-light-delay)으로 다시 연다.
    // 같은 날 wifi-through-walls가 셋째로 들어와 첫·셋째·넷째 문단에 그 도구를 넣었다.
    paragraphs: [
      `Arithmetic that adds and arithmetic that multiplies run away from each
       other fast. Start at one: twenty steps of adding one leaves you at 21, and
       twenty steps of doubling at 1,048,576.
       Folding Paper to the Moon lives on the multiplying side of that gap — a
       thickness that doubles with every fold. Talking Across the Solar System
       deals in a distance so large that light needs real minutes to cross it.
       Wi-Fi Through Walls counts in decibels, where every factor of ten in
       power is another ten on the scale.`,
      `The recurring device here is the axis. A doubling process on a linear axis
       looks like nothing happening, then a wall. The same process on a
       logarithmic axis is a straight line with no drama in it at all. Neither
       picture is wrong, and the disagreement between them is the whole point —
       when a headline says something grew tenfold, which axis you imagine can change
       whether that sounds alarming or ordinary.`,
      `Two of the models are deliberately thin — a doubling is one
       multiplication, a light delay one division. Keeping the arithmetic trivial
       makes the result easy to check, and it moves the interesting question from
       "is this calculated correctly" to "why does the correct answer feel
       wrong". The Wi-Fi model is heavier: a published formula for one flat
       wall, repeated for each wall and added to the free-space loss. Its page
       works one case through by hand, as the other two do.`,
      `A question belongs here when the answer depends on a setting and how much
       it depends is the interesting part. A single figure quoted for the distance
       to another planet is one moment's value, an average, or one end of a range; the
       light-delay model puts Mars nearly five times farther from Earth at one end
       of its band than at the other, and saying which kind a figure is makes up
       most of the honesty in the answer. A
       number of folds is the opposite case: across its whole range the
       thickness slider moves the Moon answer by only three folds, and that
       narrowness is the finding. Each
       page names what it simplifies — circular orbits on one, perfect layers with
       no air and no loss at the crease on another, one straight path through flat,
       single-material walls on the third — and what its formula has no term for
       at all.`,
    ],
  },

  motion: {
    description:
      "Vehicles, mechanics and the arithmetic of getting somewhere — each formula drawn with the range where it holds.",
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
      "Power, heat, water and fuel — what a habit actually costs once the two halves of the bill are drawn apart.",
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
