url: https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
fetched: 2026-09-24
by: independent auditor (WebFetch)
verified-by: privacy-page fixer (WebFetch, 2026-09-24) — independent re-fetch; every line below returned verbatim, and the re-fetch added the `__cflb` condition line and `__cfseq`
verified-by: privacy-page fixer (WebFetch, 2026-09-24, second re-fetch after the K2 correction) — confirmed again that the page carries NO general statement that each cookie is placed only on sites using the corresponding product; the "only set when / only used to" conditions appear per cookie (`__cf_bm`, `__cflb`, `_cfuvid`, `__cfwaitingroom`) and are absent for the others. The page as rewritten claims only this: Cloudflare's documentation lists the cookies and gives the condition for several of them.
verified-by: K2 (independent auditor, WebFetch, 2026-09-24) — every quoted line below returned verbatim. Two corrections to this cache, added below: the page also documents `cf_chl_rc_i; cf_chl_rc_ni; cf_chl_rc_m`, and the page contains NO general statement that each cookie is placed only on sites using the corresponding product — that condition appears per-cookie and is absent for `cf_ob_info`/`cf_use_ob`, `__cfruid` and the `cf_chl_rc_*` cookies.

"Cloudflare places the `__cf_bm` cookie on end-user devices that access customer sites protected by Bot Management or Bot Fight Mode."
"When enabling session affinity with Cloudflare Load Balancer, Cloudflare sets a `__cflb` cookie with a unique value on the first response to the requesting client."
"The `cf_clearance` cookie is required for JavaScript detections."
"The `cf_ob_info` cookie provides information on: The HTTP Status Code returned by the origin web server."
"The `cf_use_ob` cookie informs Cloudflare to fetch the requested resource from the Always Online cache."
"The `__cfruid` cookie is strictly necessary to support Cloudflare Rate Limiting products."
"The `_cfuvid` cookie is only set when a site uses this option in a Rate Limiting Rule."
"The `__cfwaitingroom` cookie is only used to track visitors that access a waiting room enabled host and path combination for a zone."
"Sequence rules uses cookies to track the order of requests a user has made and the time between requests and makes them available via Cloudflare Rules."
"These cookies are for internal use which allows Cloudflare to identify production issues on clients." (`cf_chl_rc_i; cf_chl_rc_ni; cf_chl_rc_m`)
"The `cf_ob_info` and `cf_use_ob` cookies are persistent cookies that expire after 30 seconds."
"As part of our Rate Limiting solution, this cookie is required to manage incoming traffic and to have better visibility on the origin of a particular request." (`__cfruid`)
"The `_cfuvid` cookie is only set when a site uses this option in a Rate Limiting Rule, and is only used to allow the Cloudflare WAF to distinguish individual users who share the same IP address."

Consequence relied on by the privacy page: the documented cookies serve several purposes, not security alone — bot detection, load-balancing session affinity, JavaScript detections (`cf_clearance`), Always Online, rate limiting, waiting room, sequence rules, and Cloudflare's own internal diagnosis of production issues on clients (`cf_chl_rc_*`). So the page cannot say the only cookies that can be set are security cookies, nor that any named cookie will be set.

K2 correction to the line above: this cache previously said the documentation states "each is placed only on sites using the corresponding product". It does not. Some cookies carry such a condition individually (`__cf_bm`, `__cflb`, `_cfuvid`, `__cfwaitingroom`), but there is no general statement to that effect, and `cf_ob_info`/`cf_use_ob`, `__cfruid` and `cf_chl_rc_*` carry no such condition. The privacy page must not attribute that general claim to the documentation.
