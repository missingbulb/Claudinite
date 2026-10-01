## 2026-08-07 · born · Note the *.edfringenow.com egress allowance in the pack rules (#262)
- **Source:** #260.
- **Reason:** on 2026-08-07 a probe of `www.edfringenow.com` and the apex got a 403 at CONNECT: a
  policy denial, not a site outage, which the proxy's status endpoint confirms.
- **Actor:** the owner.
- **Model:** Claude
- **Mechanism:** a caveat under the same RULES.md section.
- **Landed:** #262, Closes #260

## 2026-09-04 · reworded · a policy 403 told apart from an origin 403 (#609)
- **Reason:** the Fringe API host had begun answering 403 after a negotiated tunnel, a different
  fact from the CONNECT denial the rule described.
- **Actor:** the owner.
- **Model:** Claude Opus 5
- **Landed:** #609, Closes #608

## 2026-09-05 · moved · into edfringe-now (#613)
- **Reason:** the three local packs merged into one; see `_pack`.
- **Actor:** the owner.
- **Model:** Claude
- **Mechanism:** the same carrier, now in `edfringe-now`.
- **Landed:** #613, Closes #612

## 2026-09-28 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
