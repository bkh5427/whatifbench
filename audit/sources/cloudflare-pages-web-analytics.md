url: https://developers.cloudflare.com/pages/how-to/web-analytics/
fetched: 2026-09-27
by: privacy-page writer (WebFetch)
verified-by: WA2 (2026-09-27 독립 WebFetch — 인용 1줄 모두 FOUND)

"Cloudflare will automatically add the JavaScript snippet to your Pages site on the next deployment."

Consequence relied on by the privacy page: once Web Analytics is enabled on the Pages project, Cloudflare adds the script to the pages at the next deployment. The operator enabled it on 2026-09-27 (operator's dashboard screenshot: "Web analytics is enabled"); the privacy text ships in the first deployment after that, so the text and the script go live together. Whether the live pages carry the script is checked on the live site after that deployment (it cannot be seen in the build output, because Cloudflare adds it at deployment).
