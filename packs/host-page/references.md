# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(RULES-1)** The quarantine is what makes the rest of a host-adapting codebase testable
  without a browser at all: with the host's vocabulary confined to one module, the layers above
  it are pure functions over a snapshot type. Seeded from CrosswordChat's `page-adapter/`, where
  the arch test's token ban on the host's class prefix outside that directory is what kept the
  boundary honest over a year of host redesigns. Reaffirm while host markup remains
  unversioned and unannounced; retire if hosts start publishing stable automation contracts.

- **(RULES-2)** The negative findings are the expensive half and the half nothing else in a repo
  records: that a state class sits on one element and not its parent, that a control exposes no
  readable pressed state, that a set of nodes carries no distinguishing class. Each was
  established by reading captured live markup, and none is recoverable from the code that
  resulted — the code shows only what worked. Reaffirm while selectors are verified by hand
  against a live page; retire if the verification becomes automated and self-recording.

- **(RULES-3)** Deprecated is not unread. `keyCode`/`which`/`charCode` are deprecated in the DOM
  spec but still populated by the browser on every real keystroke, and hosts with a long-lived
  key-handling layer still branch on them — CrosswordChat's does. A synthetic event defaults
  them to 0, which matches no branch, so the host's handler runs and does nothing, presenting
  exactly as "the app rejects untrusted events". Reaffirm while the legacy fields remain
  populated on real events; retire once browsers stop setting them.

- **(check:page-observers-disconnected)** A DOM observer started on a page you do not own runs
  until you disconnect it or the document dies, and a single-page app's document does not die.
  Everything else that ends your feature ends nothing for the observer, so it keeps waking on
  every host mutation and holds its callback's whole closure alive. On a host page this is not
  merely a leak but the difference between "off" and "off but still watching" — work the user
  did not ask for on a page that is not yours. Reaffirm while `MutationObserver` and friends
  require explicit teardown; retire if observers gain a lifetime tied to the code that made them.

- **(check:synthetic-input-events-bubble)** `bubbles` defaults to **false** on every DOM event
  constructor, and a host app handles input by delegation from one listener near its own root,
  so a non-bubbling synthetic event never arrives. `dispatchEvent` still returns true, nothing
  throws and nothing logs — the page simply does not respond, which reads as "the app ignores
  untrusted events" and is an expensive conclusion to back out of. Reaffirm while the DOM
  constructor default stands; retire if it changes or if delegation stops being the norm.

- **(check:synthetic-input-events-target-app-node)** The same silent failure from the other
  direction: a bubbling event only reaches the delegated listener when its target sits inside
  that listener's subtree, so aiming one at `document` or `document.body` dispatches it from
  outside the app root and it bubbles straight past. Scoped to the interfaces that model real
  user input, since a `CustomEvent` at `document` is your own signal to your own listener and
  has no delegation contract to hold it to. Reaffirm on the same terms as the bubble check.
