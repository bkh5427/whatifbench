url: https://gdpr-info.eu/art-15-gdpr/
url: https://gdpr-info.eu/art-16-gdpr/
url: https://gdpr-info.eu/art-17-gdpr/
url: https://gdpr-info.eu/art-18-gdpr/
url: https://gdpr-info.eu/art-21-gdpr/
fetched: 2026-09-25
by: 판정관보조 (WebFetch, 다섯 조문을 따로 받았다)
verified-by: 판정관보조 (같은 다섯 URL을 **프롬프트를 바꿔 두 번씩** 받아 아래 다섯 줄이 글자 그대로 돌아오는 것을 대조했다. 제15조는 앞 차수의 판정관이 audit/sources/gdpr-art20-portability.md에 같은 줄을 따로 받아 두었으므로 두 검사자가 받은 줄이다. 제16·17·18·21조는 이 저장소에서 처음 받는 줄이라 다른 검사자의 재확인이 아직 남아 있다 — 다음 검사자가 같은 URL이나 eur-lex.europa.eu의 Regulation (EU) 2016/679 본문으로 다시 받아 verified-by를 더할 것.)
tried: 이 파일은 앞선 gdpr-art20-portability.md·gdpr-art7-art77.md를 **고치지 않고** 새로 둔다 — 그 두 파일에 기댄 통과 판정의 근거 해시를 깨지 않기 위해서다(R1이 berkeley-1973-six-departments.md에서 쓴 방식과 같다).

GDPR Article 15(1) — 접근권:
"The data subject shall have the right to obtain from the controller confirmation as to whether or not personal data concerning him or her are being processed"

GDPR Article 16 — 정정권:
"The data subject shall have the right to obtain from the controller without undue delay the rectification of inaccurate personal data concerning him or her."

GDPR Article 17(1) — 삭제권:
"The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay and the controller shall have the obligation to erase personal data without undue delay where one of the following grounds applies:"

GDPR Article 18(1) — 처리 제한권:
"The data subject shall have the right to obtain from the controller restriction of processing where one of the following applies:"

GDPR Article 21(1) — 반대권:
"The data subject shall have the right to object, on grounds relating to his or her particular situation, at any time to processing of personal data concerning him or her which is based on point (e) or (f) of Article 6(1), including profiling based on those provisions."

/privacy에 대한 귀결:
- unit 2c1b8b4531a2 "You have the right to request access to your personal data, correction or deletion of it,
  restriction of processing, and to object to processing." — 다섯 권리가 제15·16·17·18·21조로 하나씩 대응한다.
- 반대권(제21조 1항)은 처리 근거가 제6조 1항 (e)·(f)일 때 주어진다. 이 문장이 놓인 절의 바로 앞
  문단이 이 사이트의 처리 근거를 "legitimate interest in operating and securing the site"(= 제6조 1항 (f))로
  적으므로 조건이 성립한다(src/pages/privacy.astro:113-115).
- 삭제·제한은 조문이 "where one of the following grounds applies"로 조건을 달지만, 페이지 문장은
  권리의 **행사 요청**("right to request")을 말하므로 조문과 어긋나지 않는다.
