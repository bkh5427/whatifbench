url: https://www.bmj.com/content/309/6967/1480
url: https://www.bmj.com/content/309/6967/1480.long
fetched: 2026-09-25
by: 판정관보조 (WebFetch. 이 DOI(10.1136/bmj.309.6967.1480)가 가리키는 출판사 쪽이다.)
verified-by: 판정관보조 (**두 주소를 프롬프트를 바꿔 따로** 받아 같은 본문 문장이 글자 그대로 돌아오는 것을 대조했다. 곧 이 1994년 논문의 본문은 bmj.com에서 기계가 읽을 수 있는 글자로 실려 있다 — 스캔 이미지만 있는 것이 아니다. 다른 검사자의 재확인이 남아 있다.)
verified-by: 마지막처분 (2026-09-25 마지막 처분 차수. bmj.com/content/309/6967/1480과 그 .long을 프롬프트를 다시 바꿔 따로 받아 아래 본문 인용을 글자 그대로 다시 얻었다. 새로 확인한 것 셋: (가) 본문에는 "View this table:"이 넷 걸려 있으나 표의 내용은 두 주소 어디에서도 글자로 돌아오지 않는다 — 네 칸과 집계가 기계가 읽는 글자로 있는 곳은 본문 문장이다. (나) 문자열 "357"은 이 논문 어디에도 나오지 않는다. (다) "343"은 나오지만 신장결석과 무관한 다른 예의 분자다.)
tried: pmc.ncbi.nlm.nih.gov/articles/PMC2541623/ — reCAPTCHA(이 차수에도 같다). eutils.ncbi.nlm.nih.gov efetch(db=pmc&id=2541623) — ROBOTS_DISALLOWED. www.ebi.ac.uk(Europe PMC REST) — 프록시 429(재시도 금지). WebSearch("PMC2541623 … scanned copy of the original print version") — PMC 사본이 스캔 이미지라고 적은 문서를 얻지 못했다. 곧 **"PMC 사본은 스캔 이미지"라는 주장은 세 차수에 걸쳐 아직 아무도 확인하지 못했다.**
tried: https://pmc.ncbi.nlm.nih.gov/articles/PMC2541623/ — reCAPTCHA(앞 차수와 같다). https://europepmc.org/article/MED/7804052 — ROBOTS_DISALLOWED. 곧 PMC 사본 쪽은 여전히 못 읽는다. 앞 차수들이 doi.org(429)와 PubMed(reCAPTCHA)에서 멈춰 bmj.com 자체를 시도하지 않았다.

본문 첫 문장:
"A common problem when analysing clinical data is that of confounding. This occurs when the association between an exposure and an outcome is investigated but the exposure and outcome are strongly associated with a third variable."

집계:
"Charig et al undertook a historical comparison of success rates in removing kidney stones. Open surgery (1972-80) had a success rate of 78% (273/350) while percutaneous nephrolithotomy (1980-5) had a success rate of 83% (289/350), an improvement over the use of open surgery."

돌 크기로 나눈 네 칸:
"This showed that, for stones of <2 cm, 93% (81/87) of cases of open surgery were successful compared with just 83% (234/270) of cases of percutaneous nephrolithotomy. Likewise, for stones of >/=2 cm, success rates of 73% (192/263) and 69% (55/80) were observed for open surgery and percutaneous nephrolithotomy respectively."

마지막 문단:
"Thus, a problem arises when the variable of interest is expected to be confounded with another factor (such as type of diabetes and age) or when there is an important imbalance of a factor at the different levels of the variable of interest (such as an imbalance in the proportion of the sexes on two treatments). To accommodate this, the factor should also be included in a multiple regression or multiple logistic regression model together with the variable of interest or as a covariate in an analysis of variance."

표 자리(내용은 안 돌아온다):
"View this table:"

신장결석이 아닌 다른 예(343이 나오는 유일한 자리):
"In another example Hand reported that the proportion of male patients in a psychiatric hospital seemed to fall slightly over time, from 46.4% (343/739) in 1970 to 46.2% (238/515) in 1975."

/simpsons-paradox에 대한 귀결:
- unit 4bd829e0a65f "The 1994 paper is a scanned image that could not be read here." — **앞절이 틀렸다.**
  이 DOI가 가리키는 bmj.com 쪽은 본문을 글자로 싣는다. 스캔 이미지인 것은 PMC 사본이다.
- 위젯 프리셋의 네 칸(81/87 · 234/270 · 192/263 · 55/80)이 1994년 논문 **본문 글자에** 그대로 있다.
  audit/sources/kidney-stones-2cm-split.md가 2차 출처 둘에서 받아 둔 네 칸과 같다.
- 페이지 본문의 백분율은 계수에서 나온다(234/270 = 86.7%). 1994년 논문 본문은 그 칸을 "just 83%"로
  인쇄하는데, 234/270은 86.7%다 — 원 논문 쪽 백분율 표기가 계수와 어긋난다. 사이트는 계수에서
  계산하므로 사이트 쪽 숫자는 맞다.
- 집계 273/350 · 289/350은 네 칸의 치료별 여백과 맞는다(81+192 = 273, 87+263 = 350, 234+55 = 289,
  270+80 = 350). 크기별 여백(357·343)은 이 본문에 인쇄돼 있지 않다.
- 크기별 여백 357·343은 이 본문에 없다: "357"은 한 번도 나오지 않고, "343"은 위의 정신과
  병원 예("343/739")에만 나온다 — 신장결석의 큰 돌 수로 인쇄된 것이 아니다. 두 수는
  프리셋 네 칸에서 페이지가 빌드 때 더한 값이다(87+270 = 357, 263+80 = 343).
