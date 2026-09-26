## 2026-09-26 · born · a generated file carries no do-not-edit banner
- **Source:** the owner's corrections on #2316 ("Remove the comments. Just keep the function.", on
  the converged `.claudinite/.gitignore`) and on #2322 ("Drop the initial comment.", on
  `.claudinite/flat/claudinite-rules.GENERATED.md`), four hours apart.
- **Reason:** the banner restates the GENERATED that is already in the file's name, and the two
  corrections left one flat index without one while its sibling kept it.
- **Mechanism:** a declared world check over the tree, `since: 2026-09-26` so the sibling index it
  still fires on belongs to whoever next touches that generator, not to this run.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2335.
