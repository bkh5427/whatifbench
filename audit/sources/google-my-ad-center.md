url: https://support.google.com/My-Ad-Center-Help/answer/12155154?hl=en
fetched: 2026-09-25
by: 판정관 (WebFetch)
verified-by: 판정관 (WebSearch로 제품명을 먼저 확인한 뒤 같은 도움말 문서를 받았다. support.google.com 검색 결과 열 건이 모두 "My Ad Center Help"를 제품 이름으로 쓴다.)
tried: https://myadcenter.google.com/ 자체는 프록시가 429로 막아 열지 못했다. https://www.google.com/settings/ads 도 같은 이유로 못 열었다 — 그 주소가 지금 어디로 넘어가는지는 확인하지 못했다.

"My Ad Center"
"https://myadcenter.google.com/?ref=help-center"
"In My Ad Center, you can easily control whether or not Google will show you personalized ads. You can turn personalized ads on or off on Google services at any time."

/privacy에 대한 귀결:
- 링크 글이 "Google Ads Settings"였다. 그 이름의 제품은 지금 **My Ad Center**로 불린다.
  링크 주소도 `myadcenter.google.com`으로 바꿨다 — 예전 주소가 어디로 넘어가는지 확인하지
  못했으므로, 확인된 주소를 직접 쓰는 쪽이 낫다.
- "opt out of personalised advertising"이라는 본문 표현은 위 인용("turn personalized ads
  on or off")과 같은 것을 말한다.

verified-by: R2 (재검사 차수 R2, 2026-09-25, WebFetch) — 같은 도움말 문서를 독립으로 다시 받아 제품 이름
  "My Ad Center"와 주소 myadcenter.google.com이 그대로 돌아왔다. 개인맞춤 광고를 켜고 끄는 문장도 같은
  응답에 있었다: "When you turn off personalized ads, Google will not use the information and activity saved to"
  your account to display ads.
tried(R2): https://myadcenter.google.com/ 을 직접 열어 보니 이번에는 429가 아니라 **302 Found**로
  https://www.google.com/ads/preferences/html/blocked-cookies.html 로 넘어갔다. 그 주소를 이어서 받으니
  "Cookies are disabled" / "Your browser's cookies seem to be disabled. Ads Settings will not work until you enable cookies in your browser."
  라는 옛 "Ads Settings" 안내가 나왔다 — 쿠키 없는 가져오기에만 나오는 대체 화면이다. 링크 주소 자체는
  살아 있고, 쿠키를 쓰는 브라우저에서는 My Ad Center로 간다(위 도움말 문서가 그 주소를 제품 주소로 적는다).
