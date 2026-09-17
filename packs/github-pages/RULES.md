# GitHub Pages

- **Writing a link, asset path or `fetch` in a page** — make it relative to the page, never
  root-relative: Pages serves the site at `https://<owner>.github.io/<repo>/`, so `/style.css`
  resolves above the site and 404s in production while working in every local preview. (1)
