## 2026-09-28 · born · a substring assertion on a price label stayed green on the wrong price
- **Source:** a repricing change whose test asserted that the page text contained each expected
  price; one expected price was a prefix of another, so the assertion passed even when the wrong
  price rendered. Caught only because the same change replaced it with an exact deep-equal over
  each price element's text.
- **Reason:** durable beyond one repricing — any later copy change to a price or numeric label can
  reintroduce the same silent pass.
- **Mechanism:** a guideline of the writing-tests skill; the collision is a semantic property of
  the asserted values, not a syntactic pattern a declared check could confidently flag.
- **Retire when:** never; it is a property of substring matching.

## 2026-09-30 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
