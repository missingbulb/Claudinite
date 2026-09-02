# Host-page interaction

Portable practices for driving a web page you do not own: reading its DOM, driving it with
synthetic input, watching it change, and putting your own UI into its chrome. This applies to any
code that shares a page with an app you did not write — a browser extension's content script, a
userscript, a browser-automation tool, a scraper that also has to click and type — not just one
technology. A default to adapt, not a contract.

The premise underneath every rule here: **the host will change its markup without telling you, and
your code will not throw when it does.** A selector that matches nothing returns `null`; a click on
a renamed button never happens. Every rule below is about making that failure loud, local, and cheap
to fix.

## Quarantine the host's DOM knowledge in one module

Put all of it — every selector, every host-specific quirk — behind an interface expressed in
your own vocabulary, never the host's. The rest of your code should never learn the host page
exists. Two things follow, and both are worth the discipline:

- A host-markup redesign becomes a **one-directory** change, and its blast radius is knowable
  before you start.
- Everything else becomes testable **without a browser at all** — the logic layers stay pure
  because the quarantine holds, not because they happen not to touch the DOM today.

Inside that module, put **every selector and class string in one file**, and change values only
there — a selector inlined at its use site is the one that gets missed when the host renames a
class. Enforce the quarantine mechanically where you can: a repo-wide token search for the host's
own naming convention (a CSS class prefix, a data attribute the host owns) that fails if it appears
anywhere outside the quarantine module.

## Identify host UI by a net, not by a single selector

A single selector is a bet that one class name survives. Cast a net instead, and make the last
strand semantic:

- class nets that accept a family (a wildcard/substring match), not one exact name;
- attribute and role hooks the host is less likely to churn (`role`, `data-testid`, `aria-label`);
- a **text/shape fallback** underneath: find a UI element by "a visible container whose text says
  X, with a button-shaped thing in it, whatever its classes are called".

Visibility is part of identity. Hosts routinely keep a dismissed modal in the DOM, so a match that
ignores `display`/`visibility`/zero-size reports a modal you already closed.

## Write down what you verified the selectors against, and when

The selectors file is the only place in your codebase whose truth lives on someone else's server,
so give it its own provenance: the date and page you last verified it against, and — most
valuable — the **negative** findings (a state you expected to find in one place but found in
another; a control that exposes no readable state at all). Each of those cost someone real time to
learn, and none of it is recoverable from the code.

## Ship a probe, and make a broken page a finding rather than an exception

One entry point that reports the health of every selector against the live page — run it first
when a user says "it stopped working." It turns "the thing is broken" into "the toolbar selector
matches 0, want 1." It must **never throw**: a probe that dies on the first missing element
reports one fault and hides the rest. Collect a result per selector and return them all, and
capture forensics for anything you could not read (dump the surrounding markup or attributes) so
the next report already carries the evidence.

## Mirror the host in a fixture, and let the fixture define the expected shape

A saved, simplified copy of the host page mirrors your selectors exactly, and your tests drive that
copy — it buys a testable read/write/watch cycle with no live page and no network dependency. Its
limit is the same as its virtue: **the fixture only ever shows you the markup you already knew
about**, so a passing suite against it is never evidence about the live page. Keep a live-only
manual-test list for what only the real host can answer, and treat every live finding as a fixture
update.

## Never trust a write — verify by re-reading

Address the target by position rather than relying on the host's own input conventions (click the
target, then act — immune to a host auto-advancing or skipping fields you didn't expect), then
**read the DOM back and confirm what you meant is there**. The host may ignore untrusted events, may
process input differently than you assumed, may reject it silently; the re-read is the only thing
that tells those apart from success.

Poll the re-read rather than checking synchronously right after dispatching: a host that renders
asynchronously (most frameworks) shows you the DOM *before* it processed your event if you look too
soon.

## A synthetic keystroke must carry the fields a real one would

A real keystroke fills in the deprecated numeric key fields (`keyCode`/`which`/`charCode`); a bare
synthetic `KeyboardEvent` leaves them at their default of `0`. "Deprecated" is not "unread": a host
with a long-lived key-handling layer can still branch on those legacy fields, and a `0` matches
nothing — the handler runs and does nothing, indistinguishable from "the app ignores untrusted
events" until you check. Mirror the real event instead: the legacy numeric fields alongside the
modern ones, and the full `keydown` → `keypress` → `keyup` sequence a real keystroke produces.
Build that init object in **one helper** and use it at every dispatch site, so full fidelity is one
function's job rather than a discipline every call site has to remember.

## Put back any host state you borrowed, and degrade when you cannot read it

Driving a host toggle (a mode switch, a setting) means driving it back to what it was before you
touched it, so the user's own state is never silently stolen.

You will often be unable to *read* the state you are about to toggle — many custom controls expose
no readable pressed/active state at all, so "on or off?" is genuinely unanswerable from the DOM.
Design for the unreadable case as the **normal** one, not an edge case: fall back to click-count
parity (click it back the same number of times you clicked it), and let the one feature that
depended on knowing the true state degrade gracefully rather than failing the whole operation.

## The host has a lifecycle of its own, and its blank states are not your user's doing

You share the page with an app that has its own timers, veils and modals, and each looks like
something else from inside your code:

- **Idle timers.** A host that auto-pauses or logs out on inactivity will fire on a session that is
  reading the page but never touching the keyboard. If your interaction doesn't naturally generate
  keyboard/mouse events, send an inert nudge (a key event that types nothing, moves nothing) driven
  by real user activity — never on a timer of your own, and never when the user really has gone
  quiet (then the host *should* act, and your code should end with it).
- **Veils that blank the content.** A host's own loading/pause overlay can empty what's visibly on
  screen. A change-watcher that diffs the DOM before checking for the host's own overlay reads that
  as the user having deleted everything. Check for the host's known overlay states **before**
  diffing content, report that state once, and stop there.
- **Pre-content splashes.** The real content may not exist for minutes while a "get started" modal
  is up. Absence of the content is not absence of the app — don't give up waiting before checking
  which state you're actually in.

## Be inert when you are off

Your code loads on the host's page whether or not the user is actively using it, so **doing nothing
should be the resting state**. Watchers and observers are created on demand and torn down with the
session; nothing polls and nothing observes between sessions.

Keep any load-time page change to an explicit, minimal, named carve-out (e.g. mounting your own
toolbar entry point). Mount it by waiting with a change-observer that **disconnects the moment the
element lands** — an observer left running after its one job is done is exactly the standing cost
this rule exists to avoid — and give up gracefully when the host shows no app markup at all, so a
slow-loading real page doesn't cost you the mount but a page that will never load one doesn't leave
you waiting forever.
