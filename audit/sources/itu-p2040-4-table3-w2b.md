url: https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.2040-4-202509-I!!PDF-E.pdf
fetched: 2026-09-26
by: W2b (WebFetch 두 번, 프롬프트를 바꿔 요청 — 표 줄은 두 번째 요청에서 추출문 그대로 받았다)
verified-by: SRC2 (2026-09-26 독립 WebFetch — 인용 17줄 모두 FOUND; 비고: 식 (43b)(44)(59)는 PDF 추출문을 두 번 다시 받아 뜻 같음 확인(ε″는 원문 ε′′, 공백 차이); 표 행 값 같음, 표 제목 각주 ¹ 생략)

"RECOMMENDATION ITU-R P.2040-4"
"(09/2025)"
"Data from eight sets of material electrical properties (a total of more than 90 separate characteristics) given in the open literature have been collated, converted to a standard format and grouped into material categories."
"For each group, simple expressions for the frequency-dependent values of the real part of the relative permittivity, ε𝑟′, and the conductivity, σ, were derived."
"where f is frequency in GHz and σ is in S/m."
"If required, the imaginary part of the relative permittivity ε𝑟″ can be obtained from the conductivity and frequency:"
"ε″ = 17.98σ/𝑓 (59)"
"TABLE 3 Examples of material properties"
"Concrete 5.24 0 0.0462 0.7822 1-100"
첫 요청이 표 머리와 다섯 줄을 표 형식으로 돌려준 것(형식은 요약 모델이 바꿈, 값은 그대로):
"Material class | Real part of relative permittivity (a, b) | Conductivity S/m (c, d) | Frequency range (GHz)"
"Brick | 3.91, 0 | 0.0238, 0.16 | 1-40"
"Plasterboard | 2.73, 0 | 0.0085, 0.9395 | 1-100"
"Wood | 1.99, 0 | 0.0047, 1.0718 | 0.001-100"
"Glass | 6.31, 0 | 0.0036, 1.3394 | 0.1-100"
"For a slab consisting of a single layer, that is, for which N = 1, and the foregoing method can be simplified to:"
"𝑇 = (1−𝑅′²)exp(−𝑗𝑞) / 1−𝑅′²exp(−𝑗2𝑞) (transmission coefficient) (43b)"
"𝑞 = 2π𝑑/λ √ε𝑟𝑐 − sin²θ (44)" (추출문 — 근호는 ε𝑟𝑐 − sin²θ 전체에 걸린다. 수직 입사 θ = 0이면 q = (2πd/λ)√ε𝑟𝑐)

Bearing on /wifi-through-walls:
- 8338fb381acd "Those four coefficients are what the published table supplies." — 표 머리 (a, b)·(c, d)와 ε′ = a·f^b, σ = c·f^d 문장.
- 4ad4051dbdc3 "At 2437 MHz the table gives η′ = 5.24." — Concrete 줄 a = 5.24, b = 0.
- 5b39080e14a7 17.98 — 식 (59).
- 666cf859e0f9 / 25848677292e — 식 (43b)·(44).
