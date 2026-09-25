## 2026-09-03 · born · Path-scoped skills: a skill names the files the guard holds edits for until it is loaded (#1650)
- **Reason:** a rule leaves RULES.md for a skill only where a forced path covers every moment the
  rule is needed. Editing the wiki tree is exactly such a moment, so the page rules are read once,
  by the session that edits, rather than carried as prose by every session in every declaring repo.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a skill, body guidelines, naming the wiki tree in its own
  force-load-on-file-edits-paths: the PreToolUse guard holds a file tool aimed there until the
  session has loaded it, and a Stop-time work rule catches an edit made another way.
- **Rejected:** the harness's own frontmatter `paths` field, which limits when a skill is offered at
  all, so a skill forced for some files would stop being offered for the rest of its remit.
- **Landed:** #1650 (Closes #1648) · pack version 60903.2.

## 2026-09-13 · reworded · product-wiki: qualitative-evidence methodology in writing-wiki-pages (#1947)
- **Source:** a published write-up of repurposing Karpathy's LLM-wiki for product discovery.
- **Reason:** the pack claims market, user and competitor research as its territory, but only the
  market and competitor halves have a natural public source. A user-research page sourced from
  review sites, forum threads and competitors' testimonials satisfies every check the pack has while
  describing other people's customers - the only failure mode here that looks healthy to every
  check. Three rules on reading qualitative evidence land in the skill both sourcing lanes load, so
  they reach the session that is actually choosing a source.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #1947 (Closes #1946) · pack version 60913.1.

## 2026-09-13 · trigger-changed · product-wiki: name the new sourcing facet in the skill's description (#1947)
- **Source:** a published write-up of repurposing Karpathy's LLM-wiki for product discovery.
- **Reason:** the body gained rules on what a source actually supports while the description still
  listed only the page-writing facets.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** the skill's description names the sourcing facet, which is what a session reaching
  this skill by picking it, rather than through the wiki-tree guard, triggers on.
- **Landed:** #1947 (Closes #1946) · pack version 60913.1.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
