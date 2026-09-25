url: https://en.wikipedia.org/wiki/Simpson%27s_paradox
fetched: 2026-09-25
by: A-simpsons-1 (WebFetch, 같은 URL을 프롬프트를 셋으로 바꿔 세 번 받았다. 아래 줄들은 그 응답이 "verbatim"으로 돌려준 것이다. 표 줄 두 개는 위키백과의 표를 마크다운으로 옮긴 형태라 재요청 때 구분자가 달라질 수 있다 — 두 번째 검사자는 숫자 조합(12,763 / 8,442 / 44% / 4,321 / 35%, 그리고 4526 / 2691 / 1835)이 같은 표에서 그대로 나오는지로 대조할 것.)
verified-by: A-simpsons-2 — 2026-09-25에 같은 URL(en.wikipedia.org/wiki/Simpson%27s_paradox)을 다시 받아 "Total | 12,763 | 41% | 8,442 | 44% | 4,321 | 35%" 줄과 "women tended to apply to more competitive departments…" 줄, 그리고 85개 학과 문장이 글자까지 같게 돌아오는 것을 대조했다. 두 번째 Total 줄(4526 / 2691 / 1835)은 이번 응답에는 나오지 않았고, 대신 여섯 학과 표의 A·F 줄을 따로 받아 audit/sources/berkeley-1973-departments.md에 적었다 — 그 표의 Total이 4526이다. 1975년 논문 원문은 이번에도 열지 못했다(pubmed reCAPTCHA, Europe PMC 429).
tried: https://ui.adsabs.harvard.edu/abs/1975Sci...187..398B/abstract — WebFetch가 ROBOTS_DISALLOWED. https://pubmed.ncbi.nlm.nih.gov/17835295/ — 본문 없이 메타만 돌아와 서지 확인 불가. 논문 본문(Science 187:398)은 열지 못했다.

The admission figures for the fall of 1973 showed that men applying were more likely than women to be admitted, and the difference was so large that it was unlikely to be due to chance.
Total | 12,763 | 41% | 8,442 | 44% | 4,321 | 35%
Total | 4526 | 39% | 2691 | 45% | 1835 | 30%
The entire data showed a total of 4 out of 85 departments to be significantly biased against women, while 6 to be significantly biased against men.
The pooled and corrected data showed a 'small but statistically significant bias in favor of women'.
women tended to apply to more competitive departments with lower rates of admission, even among qualified applicants (such as in the English department), whereas men tended to apply to less competitive departments with higher rates of admission (such as in the engineering department)

/simpsons-paradox에 대한 귀결(단위 순번 36·37·38·41·42·249·250):
- "Of 8,442 men who applied, about 44% were admitted." / "Of 4,321 women, about 35% were." — 첫 Total 줄(전 학과 집계)이 그대로 뒷받침한다. 8,442 + 4,321 = 12,763이므로 리드의 "12,763 applications"도 같은 줄에서 나온다.
- "The aggregate in the lead covers every department." — 전 학과 Total(12,763)과 여섯 학과 Total(4526)이 다른 표라는 것이 두 번째 Total 줄로 확인된다. 두 집계는 서로 바꿔 쓸 수 없다.
- "Inside most departments the gap shrank, vanished, or leaned the other way." — **아직 확인 안 됨.** 위 줄들은 85개 학과 중 유의하게 여성에게 불리한 곳이 4곳이라고만 말한다. '대부분의 학과에서 격차가 줄거나 사라지거나 반대로 기울었다'는 문장은 학과별 격차의 분포를 요구하는데, 이 출처에는 그 표가 없다. 두 번째 검사자가 1975년 논문 표 또는 다른 2차 출처로 채울 것.
