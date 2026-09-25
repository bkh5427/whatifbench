url: https://en.wikipedia.org/wiki/Monty_Hall_problem
fetched: 2026-09-25
by: 판정관보조 (WebFetch)
verified-by: 판정관보조 (같은 URL을 **프롬프트를 바꿔 두 번** 받아 아래 세 줄이 글자 그대로 돌아왔다. 두 번째 요청은 "문장을 글자 하나하나 그대로 옮겨라"로만 물었다. 같은 URL의 다른 줄은 A-monty-1·A-monty-2가 audit/sources/vos-savant-1990-parade-letters.md에 두 사람이 받아 두었다 — 이 파일은 그 파일을 고치지 않고 새로 둔다.)
tried: 앞 차수가 남긴 미결 — vos-savant-1990-parade-letters.md는 "declaring that her solution was wrong"이 1만 통 전체에 걸리는지 박사 1천 통에만 걸리는지 갈린다고 적고, 티어니(NYT 1991-07-21) 원문은 SITE_BLOCKED라 읽지 못했다고 남겼다. 아래 두 줄이 그 갈림을 닫는다 — 둘 다 **편지 전체의 대다수**가 틀렸다고 말했다고 적는다.
tried: https://www.nytimes.com/1991/07/21/us/behind-monty-hall-s-doors-puzzle-debate-and-answer.html — 이 차수에서도 열지 않았다(앞 두 차수가 SITE_BLOCKED를 받았다). 아래는 같은 3차 출처의 다른 줄이다.

"After the problem appeared in Parade, approximately 10,000 readers, including nearly 1,000 with PhDs, wrote to the magazine, most of them calling Savant wrong."
"She received thousands of letters from her readers – the vast majority of which, including many from readers with doctorate degrees, disagreed with her answer."
"Most statements of the problem, notably the one in Parade, do not match the rules of the actual game show and do not fully specify the host's behavior or that the car's location is randomly selected."

/monty-hall-n-doors·/chance에 대한 귀결:
- unit e4de30f25506 "Thousands of letters told her she was wrong." — 둘째 줄이 "thousands of letters"와
  "the vast majority … disagreed with her answer"를 같은 문장에서 말하고, 첫째 줄이 "approximately 10,000
  readers … most of them calling Savant wrong"으로 같은 것을 수로 말한다. 범위가 박사 편지에만 걸린다는
  읽기는 이 두 줄로 닫힌다.
- unit 28bf50d69589 "Many came from readers with doctorates." — "including many from readers with doctorate
  degrees"가 낱말까지 같고, 첫째 줄의 "nearly 1,000 with PhDs"가 그 규모를 준다.
- unit 4d56eb4718f5 "…the three-door case the puzzle is usually told with…" — 셋째 줄이 "Most statements of
  the problem, notably the one in Parade"로 Parade 문안을 **가장 흔한 서술의 대표**로 놓는다. 그 Parade
  문안이 문 셋이라는 것은 audit/sources/monty-hall-standard-three-doors.md의 인용이 받친다.
