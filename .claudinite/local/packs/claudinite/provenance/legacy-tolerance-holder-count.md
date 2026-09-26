## 2026-09-26 · born · a tolerance for a rename with one holder is scaffolding
- **Source:** the capture behind #2321, 2026-09-25, session df83348c-86f6-501e-a59e-2a8fe582df0d,
  where the owner asked "why ... took 849 new lines? This change is huge compared to the actual work
  we needed, no?" and then chose to drop the fallback.
- **Reason:** the change kept reading the store's old `<path>/<email>/` directory beside the new
  `<path>/<login>/` one, about 100 of the 850 added lines plus the issue that would delete them
  again, for a store holding one directory the same change could have renamed. The brief asked for
  the fallback and the run built it without asking whether anything held the old spelling.
- **Mechanism:** prose - whether a tolerance is needed at all is a judgment about a set no signature
  can count, and the marker rule below already covers one that is.
- **Retire when:** retire it if a tolerance is ever added for a set the session genuinely cannot
  read, which is what the convergence-window rule already governs.
- **Actor:** the `claudinite-growth/growth-extract` run on work item #2335.
