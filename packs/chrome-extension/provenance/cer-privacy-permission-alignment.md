## 2026-07-07 · born · every manifest permission is disclosed in the deployed privacy policy (#155)
- **Source:** the release standard's privacy page: `PRIVACY.md` deploys as the public privacy policy the store listing points at, and it is the one release artifact that genuinely belongs in the repo.
- **Reason:** an undisclosed permission is a store-review and trust failure, and the policy is the only repo-side artifact that can be held against the manifest.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a world-scope check, **blocking** because the fix is in-repo (write the disclosure): every value of the manifest's four permission arrays must appear in `PRIVACY.md`; nothing is asserted when the manifest requests no permissions or the policy file is absent, since `cer/release-layout` owns the missing file. Replaced `cer/permission-justifications` together with `cer/permission-added-store-issue`.
- **Retire when:** the store takes its disclosure from a machine-readable manifest field instead of the policy page.
- **Landed:** #155 (Refs #153) · pack version 1.

## 2026-08-19 · reworded · gated on shipping like every `cer/` check (#1060)
- **Actor:** @missingbulb (owner).
- **Landed:** #1060 (Refs #1057) · pack version 3.
