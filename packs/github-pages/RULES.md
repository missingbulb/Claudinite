# GitHub Pages

- **The site is served from a subpath, not a domain root.** GitHub Pages serves it at
  `https://<owner>.github.io/<repo>/` (unless a custom domain is configured), so a root-relative URL
  — `/style.css`, `/img/logo.png`, a `fetch('/data.json')` — resolves above the site and 404s in
  production while working fine in a local `file://` or `python -m http.server` preview. Write
  links, asset paths and fetches **relative** to the page.
