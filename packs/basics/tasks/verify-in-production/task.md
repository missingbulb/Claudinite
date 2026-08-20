# verify-in-production worker

Each issue in your Context is a change that landed and could not be proven at the time,
because its proof lives somewhere the repo cannot see: a member repo, a deployed site, the
next session. The issue names the condition that puts it in production and the assertion
that proves it works there. Your job is to ask whether that condition holds **now**, and act
only when it does.

The Context list is **binding scope**. Work those issues; enumerate nothing yourself.

## Per issue

Read the body's three fields — `In-production-when:`, `Verify:`, `Give-up-after:`.

1. **Evaluate `In-production-when:` against the real world.** Read the artifact it names —
   a member's `.claudinite-checks.json` stamp, a deployed version endpoint, a build number.
   Never infer it from a merge, a green run, or elapsed time.

2. **Not yet live** → **do nothing at all**: no comment, no label, no edit. The issue staying
   open *is* the state, and tomorrow's run asks again. A note per run would turn a change
   waiting on a nightly converge into a week of notifications.

3. **Not yet live, and today is past `Give-up-after:`** → comment once saying the change never
   reached production by that date and what the last read showed, and close as **not planned**.
   A change that never shipped is a different problem than one that shipped broken; the comment
   is what surfaces it.

4. **Live** → run `Verify:` and observe the result directly.
   - **Passes** → comment with the evidence you actually read (the version, the value, the
     issue state, the URL), and close as **completed**.
   - **Fails** → file a **new issue** describing what was asserted, what happened instead, and
     where you read it; then comment on the verification issue linking that issue and close it
     as **completed**. The verification did its job — it found the fault. Do not fix the change
     here, and never leave the verification issue open behind a filed fault, or every later run
     re-verifies a thing already known broken.

## Then

Nothing else. This task keeps no tracker: each verification issue is its own record, and a run
that found nothing live has, correctly, written nothing anywhere.

`model: sonnet` — reading a live artifact and judging an assertion against it.
