url: https://en.wikipedia.org/wiki/M/M/c_queue
fetched: 2026-09-25
by: A-olm-2 (independent unit auditor, WebFetch)
verified-by: A-olm-2 (WebFetch, 2026-09-25) — fetched directly in this session; the three lines below were returned verbatim.

"In Kendall's notation it describes a system where arrivals form a single queue and are governed by a Poisson process, there are c servers, and job service times are exponentially distributed."
"The buffer is of infinite size, so there is no limit on the number of customers it can contain."
"If there are more than c jobs, the jobs queue in a buffer."

Bearing on /one-line-or-many: the page's rule "Waiting room is infinite, so nobody is turned away." states the
standard convention of the model it uses. In Kendall's notation the capacity field is omitted for M/M/c and
M/M/1, which means an unbounded buffer; excess jobs queue rather than being blocked. Erlang B (loss) systems
are the ones that turn arrivals away, and this page uses Erlang B only as a stepping stone inside the Erlang C
identity C = B / (1 - rho(1 - B)), never as the layout's own behaviour.
