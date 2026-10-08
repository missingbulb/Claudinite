## 2026-08-07 · born · Note the *.edfringenow.com egress allowance in the pack rules (#262)
- **Source:** #260.
- **Reason:** the sandbox could reach the live site's own domain, and its reads are CDN-cached, so a
  fresh deploy may lag behind what a probe shows.
- **Actor:** the owner.
- **Model:** Claude
- **Mechanism:** a caveat under a new RULES.md section on the reachable live site.
- **Landed:** #262, Closes #260

## 2026-09-04 · reworded · one act-keyed rule, the closed-egress claim gone (#609)
- **Reason:** the section around it generalised one dated probe into a standing claim that egress
  was closed; the observation was dated and the CDN caveat kept as its own rule.
- **Actor:** the owner.
- **Model:** Claude Opus 5
- **Landed:** #609, Closes #608

## 2026-09-05 · moved · into edfringe-now (#613)
- **Reason:** the three local packs merged into one; see `_pack`.
- **Actor:** the owner.
- **Model:** Claude
- **Mechanism:** the same carrier, now in `edfringe-now`.
- **Landed:** #613, Closes #612

## 2026-09-24 · reworded · trimmed
- **Reason:** the owner asked to trim rule prose to zero story ("Trim to zero, unless crucial to
  understand severity"); the incident history lives on this file.
- **Actor:** the owner.

## 2026-09-28 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
