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
      "Probability, queues and pooled averages — short arithmetic, and an answer you want to argue with.",
    paragraphs: [
      `The problems in this section have something uncomfortable in common: the
       arithmetic is short enough to do on paper, and the answer still feels wrong
       once you get it. None of them need advanced probability. What they need is
       giving up an assumption you did not know you were making.`,
      `That is why they are worth a slider rather than a paragraph. Reading that
       switching doors wins two games in three convinces almost nobody — the
       objection that two closed doors must mean even odds is too strong to be
       argued away. Watching a simulation run ten thousand games and settle onto
       0.667 does something a proof does not. And once the parameter is on a
       slider you can push it somewhere the textbook never goes, and find out
       whether the result you just accepted actually generalises. Often it does
       not, or not for the reason you assumed.`,
      `Each tool here keeps two things apart that are easy to conflate: what the
       model computes, and what the model assumes. The exact probability is drawn
       as a dashed line and the simulated running average as a solid one, so you
       can see them meet. The writing underneath says which rule was fixed to get
       that number — who knows what, what is chosen at random, what is held
       constant — because in every one of these problems the surprising answer
       depends on a rule that gets stated once and then forgotten.`,
      `These are all the arithmetic kind of model: given the stated rules, the
       answers are true or false, not matters of judgement. Where a variant changes
       the answer — a host who opens doors at random, groups pooled at different
       sizes, counters that idle while one queue waits — I name it rather than
       leave it as an exercise.`,
    ],
  },

  scale: {
    description:
      "Orders of magnitude, and the axis you draw them on. What a number does when the exponent moves.",
    paragraphs: [
      `Intuition is built for quantities that add. It handles quantities that
       multiply badly, and quantities that multiply over and over not at all.
       Everything in this section turns on that gap — a thickness that doubles, a
       distance light needs real minutes to cross, a signal that falls away by a
       factor rather than a subtraction.`,
      `The recurring device here is the axis. A doubling process on a linear axis
       looks like nothing happening, then a wall. The same process on a
       logarithmic axis is a straight line with no drama in it at all. Neither
       picture is wrong, and the disagreement between them is the whole point —
       when a headline says something grew tenfold, which axis you imagine decides
       whether that sounds alarming or ordinary.`,
      `Decibels are the same idea with a unit attached, which is why radio
       coverage belongs here rather than with the mechanics. At equal radiated
       power the model starts 5 GHz 7.07 dB below 2.4 GHz with no walls in the way
       at all, because that gap is fixed by the ratio of the two frequencies and
       nothing else. Walls do not change that offset; they change the rate at
       which it grows. Concrete widens it by about six decibels per wall, brick by
       under half a decibel. One of those effects survives the spread between
       published coefficients and the other does not, and the page says which.`,
      `The models are deliberately thin — a doubling is one multiplication, a
       light delay one division. Keeping the arithmetic trivial is what makes the
       result trustworthy, because there is nowhere for an error to hide, and it
       moves the interesting question from "is this calculated correctly" to "why
       does the correct answer feel wrong".`,
      `A question belongs here when the answer is a band rather than a number and
       the width of the band is the interesting part. A single figure quoted for an
       orbital distance or a signal margin is a figure taken at one setting; the
       model behind it will produce a very different one two clicks away, and
       saying which setting was used is most of the honesty in the answer. Each
       page names what it approximates — treating orbits as circular, holding a
       coefficient fixed — and what its formula has no term for at all.`,
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
       the model's own optimum on one pair of axes — along with how little
       separates them. Not everything here is fitted, though. A drivetrain is one
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
       do not cross at the same moment.`,
      `That is the shape of almost everything in this section. A 9.5 litre per
       minute shower passes an 80 litre bath at about the eight-minute mark on
       water — but the energy curve has its own crossing, at its own minute,
       because the two are computed from different things: one from flow rate
       alone, the other from flow rate and the temperature the water has to be
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
