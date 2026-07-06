# HTML

Portable, project-agnostic practices for hand-authored HTML — semantic markup, accessibility, forms, and the document structure pitfalls that recur regardless of framework — true for any HTML read cold.

- **Injected block markup inside a `<p>` silently empties it — read the sibling, not the tag.** When a `<p>` is filled with raw HTML (e.g. `innerHTML`, or a framework's `dangerouslySetInnerHTML` / `v-html` / `ng-bind-html`), a block element inside it (a `<div>`, etc.) is disallowed by the HTML content model — the parser (browser or jsdom, same rule) auto-closes the `<p>` right before it, and the injected content lands as the `<p>`'s **next sibling**, leaving the original tag permanently empty. A selector reading `.foo p` silently returns `""` with no error. Read `element.nextElementSibling` instead of assuming the content stayed inside the tag you selected.
