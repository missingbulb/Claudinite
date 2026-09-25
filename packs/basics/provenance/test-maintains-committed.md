## 2026-06-20 · born · Add portable Claude rules docs (5235b9d3)
- **Source:** the testing bullets of `engineeringPractices.md`.
- **Reason:** a test that shells out to git to commit its own artifact takes the review step out of
  the loop; regenerating into the working tree keeps the artifact on the normal review flow.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose, as a testing-discipline bullet.
- **Landed:** commit 5235b9d3.
