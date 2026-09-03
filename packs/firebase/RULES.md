# Firebase

- **Admin-SDK code bypasses rules** — a rules review must enumerate what *functions* write too;
  "rules allow it" and "the system writes it" are different lists.

- **Identity comes from the verified token, never the request body** (`request.auth`,
  `token.name`/`picture` claims). (2)

- **Validate inputs at the boundary like an adversary wrote them**: type-check, range-check
  (`NaN`/`Infinity` slip through naive numeric checks), length-cap, and enum-check before any
  read or write; reject with typed `HttpsError`s (`invalid-argument`, `unauthenticated`,
  `resource-exhausted`) so clients can react specifically.

- **Extract decision logic into pure modules** (audience selection, filtering, formatting) so the
  default suite runs with zero emulators and zero mocks of the Firebase SDK.

- **Cross-language contracts get mirrored test vectors.** When client and server must compute the
  same derived value (a geohash, a normalization), commit identical input→output vectors in both
  suites and diff the literals in CI — "both use the standard algorithm" is not a proof.
