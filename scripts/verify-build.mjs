import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const siteUrl = process.env.SITE_URL?.trim()
  || (process.env.NETLIFY === 'true' ? process.env.URL?.trim() : undefined);
const sourceHome = await readFile(path.join(root, 'INDEX.html'), 'utf8');
const sourceToolCount = (sourceHome.match(/\{id:'[^']+',name:/g) || []).length;
assert.equal(sourceToolCount, 82, 'Expected the 72 existing tools plus ten new tools.');
const toolsDirectory = path.join(output, 'tools');
const toolFiles = (await readdir(toolsDirectory)).filter(name => name.endsWith('.html') && name !== 'index.html');
assert.equal(toolFiles.length, 1000, 'Expected exactly 1,000 generated converter pages.');

const canonicalUrls = new Set();
for (const file of toolFiles) {
  const html = await readFile(path.join(toolsDirectory, file), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  assert.ok(title, `${file} is missing its title.`);
  assert.ok(description, `${file} is missing its meta description.`);
  assert.ok(canonical, `${file} is missing its canonical URL.`);
  assert.ok(html.includes('application/ld+json'), `${file} is missing structured data.`);
  assert.ok(html.includes('id="converter-form"'), `${file} is missing its working converter form.`);
  canonicalUrls.add(canonical);
}
assert.equal(canonicalUrls.size, 1000, 'Converter canonical URLs must be unique.');

const sitemap = await readFile(path.join(output, 'sitemap.xml'), 'utf8');
const sitemapEntries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
assert.equal(sitemapEntries.length, 1028, 'Expected the home page, two catalogs, install page, 14 categories, 1,000 converters and ten focused tools in sitemap.');
assert.equal(new Set(sitemapEntries).size, sitemapEntries.length, 'Sitemap URLs must be unique.');
if (siteUrl) {
  const expectedRoot = `${siteUrl.replace(/\/+$/, '')}/`;
  assert.equal(sitemapEntries[0], expectedRoot, 'The sitemap homepage must match SITE_URL.');
  assert.ok(sitemapEntries.every(url => url.startsWith(expectedRoot)), 'Every sitemap URL must stay under the configured site path.');
}
const appDirectory = path.join(toolsDirectory, 'apps');
const appFiles = (await readdir(appDirectory)).filter(name => name.endsWith('.html') && name !== 'index.html');
assert.equal(appFiles.length, 10, 'Expected a dedicated SEO landing page for each added utility.');
const appCanonicalUrls = new Set();
for (const file of appFiles) {
  const html = await readFile(path.join(appDirectory, file), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  assert.ok(title, `${file} is missing its title.`);
  assert.ok(canonical, `${file} is missing its canonical URL.`);
  assert.ok(html.includes('application/ld+json'), `${file} is missing structured data.`);
  assert.ok(html.includes('../../index.html#tool='), `${file} is missing a direct link to its interactive tool.`);
  appCanonicalUrls.add(canonical);
}
assert.equal(appCanonicalUrls.size, 10, 'Focused-tool canonical URLs must be unique.');
const robots = await readFile(path.join(output, 'robots.txt'), 'utf8');
if (siteUrl) {
  assert.match(robots, /Allow: \/\n/, 'Production builds should allow indexing.');
  assert.ok(robots.includes(`Sitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml`), 'robots.txt must reference the production sitemap.');
} else {
  assert.match(robots, /Disallow: \/\n/, 'Local builds should not be indexed.');
}
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.icons.length, 3, 'Expected install icons for standard and maskable displays.');
if (siteUrl) {
  const basePath = new URL(siteUrl).pathname.replace(/\/+$/, '');
  assert.equal(manifest.start_url, `${basePath}/`, 'The PWA start URL must include the GitHub Pages project path.');
  assert.equal(manifest.scope, `${basePath}/`, 'The PWA scope must include the GitHub Pages project path.');
  const homepage = await readFile(path.join(output, 'index.html'), 'utf8');
  assert.ok(homepage.includes(`href="${basePath}/manifest.webmanifest"`), 'Homepage manifest link must include the GitHub Pages project path.');
  assert.ok(homepage.includes(`src="${basePath}/assets/pwa.js"`), 'Homepage script links must include the GitHub Pages project path.');
  const pwaScript = await readFile(path.join(output, 'assets', 'pwa.js'), 'utf8');
  assert.ok(pwaScript.includes(`navigator.serviceWorker.register(basePath+'/service-worker.js')`), 'Service worker registration must include the GitHub Pages project path.');
  const serviceWorker = await readFile(path.join(output, 'service-worker.js'), 'utf8');
  assert.ok(serviceWorker.includes(`${basePath}/offline.html`), 'Offline fallback must include the GitHub Pages project path.');
  assert.ok(serviceWorker.includes(`${basePath}/tools/categories/`), 'Service worker precache must include the GitHub Pages project path.');
}
assert.ok((await readFile(path.join(output, 'service-worker.js'), 'utf8')).includes("request.mode==='navigate'"), 'Expected offline navigation fallback.');
await readFile(path.join(output, 'offline.html'));
await readFile(path.join(output, 'install.html'));
assert.match(await readFile(path.join(output, 'index.html'), 'utf8'), /82 Utilities/, 'Generated homepage must advertise the updated utility count.');
assert.ok((await readFile(path.join(output, 'assets', 'catalog.js'), 'utf8')).includes('filter?.addEventListener'), 'Focused tools catalog search must work without a category selector.');
for (const size of [192, 512]) {
  const icon = await readFile(path.join(output, 'icons', `icon-${size}.png`));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Expected a valid PNG icon at ${size}px.`);
}
console.log('Verified 82 interactive tools, 1,000 converter pages, ten focused SEO pages, 1,028 sitemap URLs, and PWA assets.');