url: https://api.crossref.org/works/10.1080/00031305.1975.10479121
url: https://api.crossref.org/works/10.1080/00031305.1975.10477398
url: https://en.wikipedia.org/wiki/Steve_Selvin
url: https://arxiv.org/html/2405.00884v1
fetched: 2026-09-25
by: A-monty-2
verified-by: A-monty-2 (같은 사실을 **서로 다른 네 기록**에서 따로 받아 대조했다: Crossref 등록 레코드 둘(두 DOI), en.wikipedia.org/wiki/Steve_Selvin, 그리고 arXiv 2405.00884 "What's So Hard about the Monty Hall Problem?" — 프롬프트를 바꿔 두 번씩 물었고 아래 줄이 그대로 돌아왔다. 저장소의 princeton-cos402-three-prisoners.md와 같은 방식이다. 다른 검사자의 재확인은 아직 필요하다.)

Crossref 레코드 (DOI 10.1080/00031305.1975.10479121 — 페이지가 첫 출처에 다는 링크):
Letters to the Editor
The American Statistician
volume 29, issue 1, pages 67-71, February 1975

Crossref 레코드 (DOI 10.1080/00031305.1975.10477398 — 페이지가 둘째 출처에 다는 링크):
Letters to the Editor
The American Statistician
volume 29, issue 3, pages 131-134, August 1975

en.wikipedia.org/wiki/Steve_Selvin:
In February 1975, Selvin published a letter entitled A Problem in Probability in the American Statistician.
After receiving criticism for his suggested solution, Selvin wrote a follow-up letter entitled On the Monty Hall Problem, published in August of the same year.

arXiv 2405.00884v1 (Rafael C. Alvarado, "What's So Hard about the Monty Hall Problem?"):
When it was first posed in a letter to the editor in *The American Statistician* (Selvin 1975: 67)
Selvin's involves three boxes and a set of keys, for example
[7] Steve Selvin et al. "Letters to the Editor". In: *The American Statistician* 29.1 (1975), pp. 67–71.

/monty-hall-n-doors에 대한 귀결:
- 두 1975년 글은 **편지란(Letters to the Editor)의 편지**다. 두 DOI가 가리키는 등록 레코드의 제목은 둘 다 "Letters to the Editor"이고, 쪽수는 각각 67-71, 131-134다. "A Problem in Probability"와 "On the Monty Hall Problem"은 그 편지란 안에서 편지에 붙은 머리글이다.
- 따라서 단위 5ac45a1bc7c2("posed the problem in \"A Problem in Probability\"")와 c63276ea5665("He returned to it in \"On the Monty Hall Problem\"")는 논문 제목처럼 읽힌다. SKILL §7.1이 이름 붙인 덫이다 — 편지면 편지라고 적어야 한다.
- 링크 자체(단위 25e88467d224, fd177eba7017)의 권·호·날짜·시작쪽은 레코드와 맞는다. p. 67은 67-71의 첫 쪽, p. 134는 131-134의 마지막 쪽이며 셀빈의 둘째 편지가 있는 쪽이다.
- "with three boxes, not doors"는 arXiv 줄("Selvin's involves three boxes and a set of keys")이 받친다.
- tandfonline.com은 WebFetch에 403을 준다(두 DOI 모두). 그래서 원 지면 이미지는 보지 못했고, 위는 등록 레코드와 2·3차 기록이다.

verified-by: R2 (재검사 차수 R2, 2026-09-25, WebFetch) — https://api.crossref.org/works/10.1080/00031305.1975.10479121 을
  독립으로 다시 받아 title "Letters to the Editor", container-title "The American Statistician", volume 29,
  issue 1, page 67-71, published date-parts [[1975,2]]가 그대로 돌아왔다. /monty-hall-n-doors의 링크 글
  "The American Statistician 29(1), February 1975, pp. 67–71"과 모든 칸이 맞는다.
tried(R2): https://doi.org/10.1080/00031305.1975.10479121 자체는 출판사(Taylor & Francis)가 403으로 막아
  본문을 열지 못했다. 링크가 가리키는 기록은 Crossref 레코드로만 확인했다.
