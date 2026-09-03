# HTML

- **Injected block markup inside a `<p>` silently empties it — read the sibling, not the tag.**
  A block element (a `<div>`, etc.) inside a `<p>` is disallowed by the HTML content model, so
  wherever the two are parsed **together** — document parsing, `DOMParser`, or `innerHTML` on an
  *ancestor* — the parser (browser or jsdom, same rule) auto-closes the `<p>` right before the
  block, which lands as the `<p>`'s **next sibling** and leaves the tag empty when nothing else
  was in it. Read `element.nextElementSibling`. Writing *into* an already-parsed `<p>`
  (`p.innerHTML`, `p.insertAdjacentHTML`) is the exception — it is the fragment's context
  element, never in button scope, so the block stays nested instead. (1)
- **When code must react to how a real page actually behaves, investigate it live before you ship — don't deploy a hypothesis you can only test after release.** If a change hinges on the real DOM, computed styles, or runtime state of a page you can't see, hand the user one JavaScript snippet to run in the browser DevTools console and read its output back. Reserve "test it after it's deployed" for behavior you've verified genuinely can't be observed now. (3)
- **Make that console request a snippet, not an essay.** Send exactly one code block to paste into the console and ask the user to paste its output back. Skip the prose explaining what you're hoping to learn. (4)
