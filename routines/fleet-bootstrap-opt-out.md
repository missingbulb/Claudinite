# Fleet bootstrap opt-out list

The repos the [fleet bootstrap sweep](auto-fleet-bootstrap.md) must **never adopt**. The sweep
bootstraps Claudinite into every repo under the owner's account that doesn't already mount it —
except the repos listed here. Opting a repo out only stops adoption: it never removes an existing
mount, and a repo that already mounts the corpus keeps getting baselined regardless (its own
committed marker is the stronger opt-in). To genuinely withdraw a covered repo, unmount it there
**and** list it here so the sweep doesn't re-adopt it (see the sweep's never-list).

The sweep and the daily coverage census read **only the entries under the "Opted out" heading
below**, fresh from this file on the home repo's default branch at the start of every run. One bullet per repo — the full
`owner/name`, then an em-dash and the human-readable reason. Only the name is matched
(case-insensitively); the reason is for people deciding whether the exemption still applies.

<example>
- `missingbulb/some-experiment` — throwaway spike, not worth maintaining
</example>

## Opted out

- `missingbulb/empty` — empty placeholder repo, nothing to maintain (owner decision, #228)
