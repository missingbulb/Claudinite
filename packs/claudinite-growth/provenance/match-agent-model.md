## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Reason:** downgrading the auto-extractor agent to Haiku shipped a bare-title case off a listing
  page where Sonnet bailed correctly - a weaker model fails silently on judgment.
- **Mechanism:** a guideline of the unattended-agents skill, triggered on "Match the agent model to
  the judgment it must make.".
- **Landed:** commit 5235b9d3.
