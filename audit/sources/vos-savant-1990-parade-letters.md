url: https://en.wikipedia.org/wiki/Monty_Hall_problem
fetched: 2026-09-24
by: A-monty-1 (WebFetch, two fetches with different prompts)
verified-by: A-monty-2 (독립 재요청 2026-09-25, WebFetch; 위 여섯 인용 줄을 하나씩 글자 그대로 대조해 모두 FOUND으로 돌아왔다. 남은 숙제는 그대로다 — Parade와 티어니 원문은 아직 못 읽었고, nytimes.com은 여전히 막힌다. Parade 칼럼의 날짜(9 September 1990)와 티어니 기사 날짜는 audit/sources/vos-savant-parade-1990-09-09.md에 따로 받아 두었다.)
tried: https://www.nytimes.com/1991/07/21/us/behind-monty-hall-s-doors-puzzle-debate-and-answer.html — WebFetch returns SITE_BLOCKED, so Tierney's report, which the page cites for the reader response, could not be read.

"A restated version of Selvin's problem appeared in Marilyn vos Savant's Ask Marilyn question-and-answer column of Parade in September 1990."
"Though Savant gave the correct answer that switching would win two-thirds of the time, she estimates the magazine received 10,000 letters including close to 1,000 signed by PhD holders."
"she estimates the magazine received 10,000 letters including close to 1,000 signed by PhD holders, many on letterheads of mathematics and science departments, declaring that her solution was wrong."
"Paul Erdős, one of the most prolific mathematicians in history, remained unconvinced until he was shown a computer simulation demonstrating Savant's predicted result."
"Steve Selvin posed the Monty Hall problem in a pair of letters to The American Statistician in 1975."
"D. L. Ferguson suggests an N-door generalization of the original problem in which the host opens p losing doors and then offers the player the opportunity to switch"

Bearing on /monty-hall-n-doors:
- unit 8ca10bef5c7f "In 1990 Marilyn vos Savant answered this in her Parade column." and unit ad084a851ab6 "Swap, she said, and you win two games out of three." — both supported by the first two lines, but from a tertiary source only.
- unit e4de30f25506 "Thousands of letters told her she was wrong." — the figure quoted is 10,000 letters; the clause "declaring that her solution was wrong" sits after the PhD sub-count, so a second auditor should check against Tierney or vos Savant's own account whether the thousands, or only the PhD letters, said she was wrong.
- unit 28bf50d69589 "Many came from readers with doctorates." — "close to 1,000 signed by PhD holders".
- Warning for B4, outside this auditor's unit range: the page's Sources entry (unit 5ac45a1bc7c2) calls Selvin's 1975 piece a problem posed in "A Problem in Probability"; this source calls the pair of 1975 pieces *letters* to The American Statistician. SKILL §7.1 flags exactly this (article title vs letters-column title).

A-monty-2의 귀결(단위 161-315 범위):
- 25e88467d224 / fd177eba7017 (셀빈 두 편지의 링크) — "Steve Selvin posed the Monty Hall problem in a pair of letters to The American Statistician in 1975." 가 학술지·연도·**편지**라는 성격을 받친다. 권·호·쪽은 Crossref 레코드로 따로 확인했다(audit/sources/selvin-1975-letters-american-statistician.md).
- 59945a67cf5c (D. L. Ferguson) — Ferguson 줄이 귀속 자체는 받치지만, "commonly"(널리)를 받치는 둘째 계열의 출처는 찾지 못했다. 이 위키 문서와 그 미러(handwiki)뿐이다.
