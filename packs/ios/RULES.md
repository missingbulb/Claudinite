# iOS

- **Verifying a Swift/iOS change from an agent sandbox** — the sandbox has no macOS and no Swift
  toolchain, and the toolchain download is typically blocked by its network policy, so nothing
  Swift-side compiles or runs there: a change counts as verified only once the macOS CI runner
  reports on it.

- **An Apple Developer Documentation page is JS-rendered — a plain fetch returns only the page
  title.** Fetch the JSON mirror instead: `developer.apple.com/tutorials/data/documentation/…`
  (same path as the HTML page, under `tutorials/data/`) carries the actual content.
