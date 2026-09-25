url: https://sites.oxy.edu/lengyel/M372/Vazsonyi2003/vazs30_1.pdf (Andrew Vazsonyi, "Which Door Has the Cadillac?", Decision Line, December/January 1999, pp. 17–19)
fetched: 2026-09-24
by: A-monty-1 (WebFetch, two fetches with different prompts)
verified-by: A-monty-2 (독립 재요청 2026-09-25, WebFetch 두 번, 서로 다른 프롬프트. 아래 다섯 인용 줄이 모두 글자 그대로 돌아왔다. 제목·바이라인·머리글 쪽번호와 시뮬레이션 문단을 새로 받아 덧붙였다.)

"I got even more disturbed when I told the problem to the late Paul Erdös, one of the most famous mathematicians of the century, when he visited my home in 1995."
"I mentioned Bayes, and showed Erdös the decision tree solution I used in my undergraduate course."
"To my amazement this didn't convince him. He wanted a straightforward explanation with no decision trees."
"Erdös objected that he still did not understand the reason why, but was reluctantly convinced that I was right."
"A few days after he left, he telephoned to say that Ron Graham of AT&T explained to him the reasoning behind the answer and that now he understood."
Publication line reported by the fetch: Decision Line, December/January 1999, pages 17-19.

Consequence for /monty-hall-n-doors:
- unit 0e03f56ba47a "Five years later Andrew Vazsonyi put the problem to the mathematician Paul Erdős." — vos Savant's column is September 1990 and the visit is "in 1995", so "five years later" is supported.
- unit f6cca6c7b03c "A decision tree did not convince him." — supported by the "To my amazement this didn't convince him" line.
- unit 6f2432957ab1 "Watching a simulation did." — the source says Erdős was "reluctantly convinced" by the on-screen simulation while still not understanding why; a second auditor should judge whether "did [convince]" is faithful to "reluctantly convinced … still did not understand the reason why".
- unit 3e9fe9f55016 (out of this auditor's range) "The reason why came days later, and from someone else — Ron Graham." — supported by the telephone line.

A-monty-2가 덧붙인 줄(같은 PDF, 2026-09-25):
Which Door Has the Cadillac?
Andrew Vazsonyi, Feature Editor
Decision Line, December/January 1999 17
Decision Line, December/January 1999 19
On the screen I flashed pictures of a sequence of scenarios... I ran the program, without the pictures, 100,000 times and found that if I do not switch, the host will smile about 2/3 of the cases. But if I do switch, he will be crying 2/3 of the cases.

A-monty-2의 귀결(단위 161-315 범위):
- f224763e5c57 "Vazsonyi's account of the Erdős conversation has three steps, and they did not arrive together." — 셋(결정나무 → 시뮬레이션 → 며칠 뒤 Ron Graham의 설명)이 인용 줄에 다 있고, 마지막은 "A few days after he left"로 따로 왔다.
- 7dd350374231 "The decision tree did not persuade him." / 57c4fada3f7a "A simulation did." — "To my amazement this didn't convince him"과 "reluctantly convinced that I was right"가 받친다. 시뮬레이션이 납득시킨 것은 **답**이지 이유가 아니며, 페이지도 바로 다음 문장에서 그렇게 말한다.
- 3e9fe9f55016 "The reason why came days later, and from someone else — Ron Graham." — 전화 줄이 그대로 받친다.
- cf71c5bcb361 "…published in Decision Line, December/January 1999, pp. 17–19." — 머리글이 17쪽과 19쪽을 찍는다.
