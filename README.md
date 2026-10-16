# Handy Tools Static Site

The original `INDEX.html` is the 82-tool interactive hub. The build also generates a searchable catalog of exactly 1,000 working unit-conversion pages across 14 categories, ten focused tool landing pages, individual SEO metadata, category pages, `robots.txt`, and a sitemap containing every generated URL.

## Build and preview

Requirements: Node.js 20 or newer.

```powershell
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`. Local output uses `noindex` and a localhost canonical URL so a preview is not accidentally indexed.

## Publish to GitHub Pages

This repository deploys automatically to [https://ymrsd.github.io/-Handy-Tools-Pro/](https://ymrsd.github.io/-Handy-Tools-Pro/) when changes are pushed to `main`. In the GitHub repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**. The workflow builds the site, verifies its 1,028 sitemap entries and project-page paths, then deploys `dist/`.

The production sitemap is published at [https://ymrsd.github.io/-Handy-Tools-Pro/sitemap.xml](https://ymrsd.github.io/-Handy-Tools-Pro/sitemap.xml), and `robots.txt` allows indexing and points crawlers to it.

## Production SEO build

Set `SITE_URL` to the real public domain before building. Do not publish a build that uses the local preview URL.

```powershell
$env:SITE_URL = "https://ymrsd.github.io/-Handy-Tools-Pro"
npm run build:production
npm run verify
```

The generated static website is in `dist/`. Set `SITE_URL` to the final public URL (including the repository path on project hosting) when deploying to another host. The build fails if a production build has no HTTPS `SITE_URL`.

Each converter and focused-tool page has a unique title, description, keywords, canonical URL, Open Graph and Twitter metadata, structured data, a working tool link, and related content. Conversion pages are generated from curated unit definitions; they are not 1,000 copies of placeholder tools.

## Install on a device

The generated site is an installable Progressive Web App (PWA). Serve it over HTTPS on the domain root, then use the in-site Install App button or the browser's install menu on Android Chrome and desktop Chrome/Edge. On iPhone/iPad, use Safari's Share menu and choose Add to Home Screen. Previously opened converter pages are cached for offline use; network-backed tools and first-time external library downloads still need a connection.

The PWA is not a signed Android APK or Windows/macOS installer. Native store packages require separate platform projects, SDKs, signing credentials and release testing. Google search ranking cannot be guaranteed; production requires a real domain, useful original content, search-console verification and ongoing indexing/performance review.