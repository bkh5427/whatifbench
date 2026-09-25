url: https://www.cloudflare.com/privacypolicy/
fetched: 2026-09-25
by: 판정관보조 (WebFetch, Section 11 "Data Retention"을 물었다)
verified-by: 판정관보조 (같은 URL을 **프롬프트를 바꿔 두 번** 받아 아래 세 줄이 글자 그대로 돌아오는 것을 대조했다. 두 번째 요청은 "고정 일수를 적는가"를 따로 물었고, 정책이 최종 이용자 트래픽 자료에 고정 일수를 적지 않는다는 답을 같이 받았다. 같은 URL의 다른 줄(처리 항목)은 앞 차수의 A-pages-1과 판정관이 audit/sources/cloudflare-privacy-enduser-data.md에 두 사람이 받아 두었다. 이 파일은 그 파일을 고치지 않고 새로 둔다 — 근거 해시를 깨지 않기 위해서다.)
tried: 보관 기간에 대한 줄은 앞 차수의 cloudflare-privacy-enduser-data.md에 없었다(그 파일의 tried: 줄이 그렇게 남겨 두었다). 이 파일이 그 빈자리를 채운다.

Section 11 (Data Retention):
"We store your personal information for a period of time that is consistent with the business purposes set forth in Section 3 of this policy or as long as needed to fulfill and comply with legal obligations."
"When the data retention period expires for a given type of data, we will delete or destroy it. If, for technical reasons, we are unable to do so, we will implement appropriate security measures to prevent any further use of such data."
보관 기간을 정하는 기준으로 정책이 드는 항목: "The purpose for collecting the personal information in the first place", "The volume, nature, and sensitivity of the personal information we are processing", "Legal requirements that may apply to the data, such as applicable statutes of limitation or contractual obligations".

/privacy에 대한 귀결:
- unit 35655e2073e3 "That data is held by Cloudflare, and how long it is kept is set by Cloudflare's own policy."
  — 보관 기간을 정하는 주체가 Cloudflare이고 그 기준이 Cloudflare 자신의 방침(Section 11)에 적혀 있다는
  것을 위 두 줄이 그대로 받친다. 정책은 최종 이용자 트래픽 자료에 대한 고정 일수를 적지 않는다(1.1.1.1
  리졸버의 25시간만 따로 적는다) — 곧 기간은 이 사이트가 아니라 Cloudflare 쪽에서 정해진다.
