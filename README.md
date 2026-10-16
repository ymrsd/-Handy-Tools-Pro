# Handy Tools Static Site

The original `INDEX.html` is the 82-tool interactive hub. The build also generates a searchable catalog of exactly 1,000 working unit-conversion pages across 14 categories, ten focused tool landing pages, individual SEO metadata, category pages, `robots.txt`, and a sitemap containing every generated URL.

## Build and preview

Requirements: Node.js 20 or newer.

```powershell
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`. Local output uses `noindex` and a localhost canonical URL so a preview is not accidentally indexed.

## Deploy from GitHub with Netlify

In Netlify, choose **Add new project → Import an existing project → GitHub**, authorize access to `ymrsd/-Handy-Tools-Pro`, and deploy. Netlify reads `netlify.toml`, builds the production site, and publishes `dist/`. Its `URL` environment variable supplies the public production URL used in canonical tags, `robots.txt`, and the sitemap. Pushes to `main` then trigger automatic deploys.

After the first deploy, find the public site URL in Netlify's **Domain management**. The sitemap is available at `<your-Netlify-site-URL>/sitemap.xml`, and `robots.txt` allows indexing and points crawlers to it. If you add a custom domain, set `SITE_URL` to that domain in the Netlify environment variables and trigger a new deploy.

## Production SEO build

For a manual production build, set `SITE_URL` to the real public domain. Netlify builds use Netlify's `URL` automatically when `SITE_URL` is not set.

```powershell
$env:SITE_URL = "https://your-site.netlify.app"
npm run build:production
npm run verify
```

The generated static website is in `dist/`. Set `SITE_URL` to the final HTTPS public URL when deploying to another host. The build fails if a production build has no public HTTPS URL.

Each converter and focused-tool page has a unique title, description, keywords, canonical URL, Open Graph and Twitter metadata, structured data, a working tool link, and related content. Conversion pages are generated from curated unit definitions; they are not 1,000 copies of placeholder tools.

## Install on a device

The generated site is an installable Progressive Web App (PWA). Serve it over HTTPS on the domain root, then use the in-site Install App button or the browser's install menu on Android Chrome and desktop Chrome/Edge. On iPhone/iPad, use Safari's Share menu and choose Add to Home Screen. Previously opened converter pages are cached for offline use; network-backed tools and first-time external library downloads still need a connection.

The PWA is not a signed Android APK or Windows/macOS installer. Native store packages require separate platform projects, SDKs, signing credentials and release testing. Google search ranking cannot be guaranteed; production requires a real domain, useful original content, search-console verification and ongoing indexing/performance review.