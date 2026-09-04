// 카테고리 인덱스 도입글.
// 링크 목록만 있는 페이지는 Valuable inventory 조항에 걸린다. 250~400단어를 붙인다.
// 목록 서문이 아니라 '주제 자체에 대한 글'이어야 한다.

export const INTROS = {
  odds: {
    description:
      "Problems where the arithmetic is short and the answer still feels wrong.",
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
       sizes — I name it rather than leave it as an exercise.`,
    ],
  },

  scale: {
    description:
      "Doubling, distance and delay. What a number does when the exponent moves.",
    paragraphs: [
      `Intuition is built for quantities that add. It handles quantities that
       multiply badly, and quantities that multiply over and over not at all. The
       tools in this section all turn on that gap: a thickness that doubles, a
       distance that light needs real minutes to cross, a speed increase that buys
       far less time than it feels like it should.`,
      `The recurring device here is the axis. A doubling process on a linear axis
       looks like nothing happening, then a wall. The same process on a
       logarithmic axis is a straight line with no drama in it at all. Neither
       picture is wrong, and the disagreement between them is the whole point —
       when a headline says something grew tenfold, which axis you imagine decides
       whether that sounds alarming or ordinary.`,
      `The models are deliberately thin. Folding paper is one multiplication;
       light delay is a division. Keeping the arithmetic trivial is what makes the
       result trustworthy, because there is nowhere for an error to hide, and it
       moves the interesting question from "is this calculated correctly" to "why
       does the correct answer feel wrong".`,
      `Each page says what it approximates — treating orbits as circular, ignoring
       traffic, holding a coefficient fixed — and the section on what the model
       leaves out gets written before the tool goes up, not after someone
       complains about it.`,
    ],
  },

  physics: {
    description:
      "Standard formulas with published coefficients, drawn together with the range where they hold.",
    paragraphs: [
      `These tools use standard formulas with coefficients from published tables,
       which makes them a different sort of thing from the probability ones. A
       probability model is true or false given its rules. A path-loss model is an
       approximation with a stated range, fitted to measurements that scatter, and
       it can be applied perfectly correctly and still miss the real number by a
       wide margin.`,
      `That difference shapes how these pages are written. Every coefficient is
       sourced to the document it came from, so the number on screen can be traced
       rather than trusted. The section describing what the model ignores is the
       longest one on the page rather than a footnote — for signal through walls
       that means multipath, reflection, interference and antenna orientation,
       none of which the formula contains.`,
      `What the sliders are for is the shape of the answer rather than the answer
       itself. Whether 5 GHz beats 2.4 GHz through two brick walls has a definite
       answer inside the model, and the page is explicit that a measurement in
       your flat will differ. Watching the crossing point move as walls are added
       teaches the dependency, and the dependency survives the approximation even
       where the exact decibel figure does not.`,
      `Where a coefficient shifts with conditions and the conclusion would need a
       judgement call, I leave the tool unbuilt rather than dress a guess up as a
       calculation.`,
    ],
  },
};
