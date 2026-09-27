url: https://blog.cloudflare.com/free-privacy-first-analytics-for-a-better-web/
fetched: 2026-09-27
by: privacy-page writer (WebFetch)
verified-by: WA2 (2026-09-27 독립 WebFetch 재대조 — 인용 3줄 모두 FOUND, 2번째 줄 fingerprint 따옴표는 곧은/둥근 모양 차이)

"We don't use any client-side state, like cookies or localStorage, for the purposes of tracking users."
"And we don't “fingerprint” individuals via their IP address, User Agent string, or any other data for the purpose of displaying analytics." (writer correction after WA2: leading "And" and lowercase "we" restored; the privacy page does not rely on this line)
"A visit is defined simply as a successful page view that has an HTTP referer that doesn't match the hostname of the request."

Consequence relied on by the privacy page: the script keeps no cookie or local storage for tracking users, and a visit is a page view whose referring address is not this site's own host (including no referrer at all — see cloudflare-web-analytics-metrics).
tried: WA2 재확인 — "We don't 'fingerprint' individuals..." 원문에서 글자 그대로 찾지 못함(원문은 "And we don't "fingerprint" individuals via their IP address, User Agent string, or any other data for the purpose of displaying analytics." — 앞의 "And"가 빠지고 we→We 대문자로 바뀜, 나머지 문구는 일치. 인용 1·3번째 줄은 FOUND)
