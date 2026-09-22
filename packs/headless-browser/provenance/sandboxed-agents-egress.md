## 2026-09-22 · born · `curl` reached a host the browser could not (#1886)
- **Source:** a capture run where the page's own fetch was denied while `curl` to the same host
  succeeded, sending the diagnosis after the page rather than the proxy.
- **Reason:** the browser and the session's own HTTP tools do not share a tunnel path through a
  sandbox's egress proxy, so one reaching a host is no evidence the other can. A `curl` probe used
  to clear a host therefore certifies nothing about the capture, and the failure that follows reads
  as a page bug.
- **Mechanism:** prose in this pack's RULES.md, keyed to the symptom a reader arrives with - a fetch
  failing in-browser that works outside it - since by then the wrong probe has already been run.
- **Retire when:** the sandbox routes the browser and the session's HTTP tools through one proxy
  path, so a single probe answers for both.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
