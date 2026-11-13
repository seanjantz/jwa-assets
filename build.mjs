// Assembles the Jantz Wealth Advisors site into ./dist for Cloudflare.
//
// What it does, for every page listed in site.json:
//   - sets the page title and search description
//   - adds the canonical address and the share tags (the preview shown when a link is pasted)
//   - adds the site header and favicon
//   - turns links to https://www.jantzwealth.com/... into links within the site
// It also writes the sitemap, robots.txt, redirects, response headers and the 404 page.
//
// The page files themselves are never changed. Run with:  node build.mjs
// No packages to install.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const problems = [];

const site = JSON.parse(read("site.json"));
const BASE = site.url.replace(/\/+$/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- checks on site.json ----------
const paths = new Set();
for (const p of site.pages) {
  for (const key of ["path", "file", "title", "description"]) {
    if (!p[key]) problems.push(`site.json: a page is missing "${key}" (${p.path || p.file || "unknown page"})`);
  }
  if (paths.has(p.path)) problems.push(`site.json: two pages use the address ${p.path}`);
  paths.add(p.path);
  if (p.file && !existsSync(join(ROOT, p.file))) problems.push(`site.json: ${p.file} does not exist`);
  for (const img of [p.shareImage]) {
    if (img && !existsSync(join(ROOT, img))) problems.push(`site.json: share image ${img} does not exist`);
  }
}
if (!paths.has("/")) problems.push('site.json: no page has the address "/" (the home page)');
if (site.defaultShareImage && !existsSync(join(ROOT, site.defaultShareImage))) problems.push(`site.json: default share image ${site.defaultShareImage} does not exist`);
for (const r of site.redirects || []) {
  if (paths.has(r.from)) problems.push(`site.json: ${r.from} is both a page and a redirect`);
  if (!paths.has(r.to) && !/^https?:\/\//.test(r.to)) problems.push(`site.json: redirect ${r.from} points to ${r.to}, which is not a page`);
}
if (problems.length) fail();

// ---------- shared pieces ----------
const headerCss = read("partials/header.css");
const headerTpl = read("partials/header.html").replace(/<!--[\s\S]*?-->\s*/, "");

function header(activePath) {
  const menu = site.pages.filter((p) => p.menu).map((p) => {
    const on = p.path === activePath;
    return `<a class="jwa-hd-link${on ? ' is-active" aria-current="page' : ""}" href="${p.path}">${esc(p.menu)}</a>`;
  }).join("\n      ");
  return headerTpl
    .replaceAll("{{siteName}}", esc(site.name))
    .replace("{{menu}}", menu)
    .replace("{{buttonPath}}", site.header.button.path)
    .replace("{{buttonLabel}}", esc(site.header.button.label));
}

const ICONS =
  '<link rel="icon" href="/favicon.ico" sizes="32x32">\n' +
  '<link rel="icon" type="image/png" sizes="192x192" href="/images/shared/favicon-192.png">\n' +
  '<link rel="apple-touch-icon" href="/images/shared/apple-touch-icon.png">\n';

function headTags(p) {
  const url = BASE + (p.path === "/" ? "/" : p.path);
  const img = BASE + (p.shareImage || site.defaultShareImage);
  return (
    `<meta name="description" content="${esc(p.description)}">\n` +
    `<link rel="canonical" href="${url}">\n` +
    `<meta property="og:type" content="website">\n` +
    `<meta property="og:site_name" content="${esc(site.name)}">\n` +
    `<meta property="og:title" content="${esc(p.title)}">\n` +
    `<meta property="og:description" content="${esc(p.description)}">\n` +
    `<meta property="og:url" content="${url}">\n` +
    `<meta property="og:image" content="${img}">\n` +
    `<meta property="og:image:width" content="1200">\n` +
    `<meta property="og:image:height" content="630">\n` +
    `<meta name="twitter:card" content="summary_large_image">\n` +
    `<meta name="twitter:image" content="${img}">\n` +
    ICONS +
    `<style>\n${headerCss}</style>\n`
  );
}

// Links written as https://www.jantzwealth.com/fees become /fees, so they work on
// preview addresses too. Only addresses that are pages or redirects on this site are changed.
const known = new Set([...paths, ...(site.redirects || []).map((r) => r.from)]);
function localLinks(html, file) {
  return html.replace(/(["'`])https?:\/\/(?:www\.)?jantzwealth\.com(\/[A-Za-z0-9\-_/]*)?([?#][^"'`]*)?\1/g, (all, q, path, tail) => {
    const p = (path || "/").replace(/\/+$/, "") || "/";
    if (!known.has(p)) { problems.push(`${file}: links to ${BASE}${p}, which is not a page on this site`); return all; }
    return q + p + (tail || "") + q;
  });
}

function once(html, pattern, replacement, what, file) {
  let n = 0;
  const out = html.replace(pattern, (...m) => { n++; return typeof replacement === "function" ? replacement(...m) : replacement; });
  if (n !== 1) problems.push(`${file}: expected exactly one ${what}, found ${n}`);
  return out;
}

// ---------- build ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, "images"), join(OUT, "images"), { recursive: true });
if (existsSync(join(ROOT, "images/shared/favicon.ico"))) cpSync(join(ROOT, "images/shared/favicon.ico"), join(OUT, "favicon.ico"));
else problems.push("images/shared/favicon.ico is missing");

for (const p of site.pages) {
  let html = localLinks(read(p.file), p.file);
  html = once(html, /<title>[\s\S]*?<\/title>/i, `<title>${esc(p.title)}</title>`, "<title>", p.file);
  html = html.replace(/[ \t]*<meta\s+name=["']description["'][^>]*>\s*\n?/gi, "");
  html = once(html, /<\/head>/i, headTags(p) + "</head>", "</head>", p.file);
  html = once(html, /<body[^>]*>/i, (m) => m + "\n" + header(p.path), "<body>", p.file);
  html = html.replace(/(\s(?:src|href)=["'])images\//g, "$1/images/");

  if (p.file === "schedule.html" && site.forms?.scheduleEndpoint) {
    html = once(html, /SUBMIT_URL:\s*''/, `SUBMIT_URL: '${site.forms.scheduleEndpoint}'`, "SUBMIT_URL setting", p.file);
  }

  const outFile = p.path === "/" ? "index.html" : p.path.replace(/^\//, "") + ".html";
  mkdirSync(dirname(join(OUT, outFile)), { recursive: true });
  writeFileSync(join(OUT, outFile), html);
}

// 404 page, with the same header
{
  let html = read("partials/404.html");
  html = once(html, /<\/head>/i, ICONS + `<style>\n${headerCss}</style>\n</head>`, "</head>", "partials/404.html");
  html = once(html, /<body[^>]*>/i, (m) => m + "\n" + header(""), "<body>", "partials/404.html");
  writeFileSync(join(OUT, "404.html"), html);
}

// Redirects. "permanent" ones tell search engines the page has moved for good (301).
// The rest are temporary (302), for pages that are coming back once they are rebuilt.
writeFileSync(join(OUT, "_redirects"),
  (site.redirects || []).map((r) => `${r.from} ${r.to} ${r.permanent ? 301 : 302}`).join("\n") + "\n");

// Response headers. Preview addresses (anything on workers.dev) are kept out of search results.
writeFileSync(join(OUT, "_headers"), [
  "https://:preview.:account.workers.dev/*",
  "  X-Robots-Tag: noindex",
  "",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  X-Frame-Options: SAMEORIGIN",
  "",
  "/images/*",
  "  Cache-Control: public, max-age=604800",
  ""
].join("\n"));

writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);

writeFileSync(join(OUT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  site.pages.map((p) => `  <url><loc>${BASE}${p.path === "/" ? "/" : p.path}</loc></url>`).join("\n") +
  "\n</urlset>\n");

if (problems.length) fail();
console.log(`Built ${site.pages.length} pages and ${(site.redirects || []).length} redirects into dist/`);
if (!site.forms?.scheduleEndpoint) console.log("Note: the Schedule form is not connected yet (forms.scheduleEndpoint is empty in site.json).");

function fail() {
  console.error("The site was not built. Please fix:\n" + [...new Set(problems)].map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
