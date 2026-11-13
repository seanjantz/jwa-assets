# Jantz Wealth Advisors website

This repository is the website. Cloudflare watches it, and each time a change is pushed it assembles the pages and puts them live.

## Where things are

| What you want to change | Where it lives |
|---|---|
| A page's content | The page file, for example `fees.html` |
| A page's title or search description | `site.json`, under `pages` |
| The picture shown when a link is shared | `site.json`, `shareImage` for that page (files are in `images/share/`) |
| The links in the header | `site.json`: a page with a `menu` label appears in the header, in the order listed |
| The header button | `site.json`, under `header` |
| The header's look | `partials/header.html` and `partials/header.css` |
| The Meta Pixel | `site.json`, under `tracking`. Clear the ID to turn it off. A page's `metaEvent` is the event sent when its completion screen appears |
| An old address that should send people somewhere else | `site.json`, under `redirects` |
| The "page not found" page | `partials/404.html` |
| The Schedule form's email handler | `worker/index.js`. The address requests are sent to is stored in Cloudflare, not here |
| Images | `images/`, named `{page}-{section}-{subject}.jpg`. Shared ones go in `images/shared/` |

## Adding a page

1. Add the page file, for example `faq.html`.
2. Add an entry for it in `site.json` under `pages` with its `path`, `file`, `title` and `description`. Add a `menu` label if it belongs in the header.
3. If the address is listed under `redirects`, remove that line.

## Redirects

Each redirect has a `from` and a `to`. Add `"permanent": true` only when the old address is gone for good. Leave it off for pages that are coming back once they are rebuilt.

## How the site is assembled

`build.mjs` reads `site.json`, adds the header, title, description, share tags and favicon to each page, and writes the finished site to `dist/`, along with the sitemap, `robots.txt` and redirects. The page files themselves are not changed. If something in `site.json` is wrong, such as a missing file or a link to a page that does not exist, the build stops and says what to fix, and the live site stays as it was.

`wrangler.jsonc` holds the Cloudflare settings. The Worker is named `jwa-site`.

To assemble the site on a computer: `node build.mjs`. To preview it: `npx wrangler dev`.
