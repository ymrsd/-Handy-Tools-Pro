import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
const configuredUrl = process.env.SITE_URL?.trim();
const parsedConfiguredUrl = configuredUrl ? new URL(configuredUrl) : null;

if (production && !configuredUrl) {
  throw new Error('Set SITE_URL to your real public domain before a production build.');
}
if (production && parsedConfiguredUrl.protocol !== 'https:') {
  throw new Error('SITE_URL must use HTTPS for a production build.');
}
if (parsedConfiguredUrl && (parsedConfiguredUrl.search || parsedConfiguredUrl.hash || parsedConfiguredUrl.username || parsedConfiguredUrl.password)) {
  throw new Error('SITE_URL must not contain a query, fragment, or credentials.');
}

const siteUrl = parsedConfiguredUrl
  ? `${parsedConfiguredUrl.origin}${parsedConfiguredUrl.pathname.replace(/\/+$/, '')}`
  : 'http://localhost:4173';
const basePath = parsedConfiguredUrl?.pathname.replace(/\/+$/, '') || '';
const publicPath = route => `${basePath}${route}`;
const robotsMeta = production ? 'index,follow,max-image-preview:large' : 'noindex,follow';
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
const slugify = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const shortDescription = value => value.length <= 158 ? value : `${value.slice(0, 155).trimEnd()}...`;
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  let checksum = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, name, data, crc]);
}
function createAppIcon(size) {
  const rowSize = size * 4 + 1;
  const pixels = Buffer.alloc(rowSize * size);
  const moduleSize = Math.floor(size / 12);
  const glyph = ['10001', '10001', '10001', '11111', '10001', '10001', '10001'];
  const glyphLeft = Math.floor((size - 5 * moduleSize) / 2);
  const glyphTop = Math.floor((size - 7 * moduleSize) / 2);
  for (let y = 0; y < size; y++) {
    const row = y * rowSize;
    pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      const glyphX = Math.floor((x - glyphLeft) / moduleSize);
      const glyphY = Math.floor((y - glyphTop) / moduleSize);
      const isLetter = glyphX >= 0 && glyphX < 5 && glyphY >= 0 && glyphY < 7 && glyph[glyphY][glyphX] === '1';
      const isAccent = y >= glyphTop + 7 * moduleSize + moduleSize && y < glyphTop + 7 * moduleSize + 2 * moduleSize && x >= glyphLeft + moduleSize && x < glyphLeft + 4 * moduleSize;
      const color = isLetter ? [255, 255, 255] : isAccent ? [185, 70, 47] : [23, 107, 85];
      const pixel = row + 1 + x * 4;
      pixels[pixel] = color[0];
      pixels[pixel + 1] = color[1];
      pixels[pixel + 2] = color[2];
      pixels[pixel + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]);
}

const categories = [
  { name: 'Length', units: [['Meter', 'm', 1], ['Kilometer', 'km', 1000], ['Centimeter', 'cm', 0.01], ['Millimeter', 'mm', 0.001], ['Micrometer', 'µm', 1e-6], ['Nanometer', 'nm', 1e-9], ['Mile', 'mi', 1609.344], ['Yard', 'yd', 0.9144], ['Foot', 'ft', 0.3048], ['Inch', 'in', 0.0254], ['Nautical mile', 'nmi', 1852], ['Light-year', 'ly', 9460730472580800], ['Fathom', 'ftm', 1.8288]] },
  { name: 'Mass', units: [['Kilogram', 'kg', 1], ['Gram', 'g', 0.001], ['Milligram', 'mg', 1e-6], ['Microgram', 'µg', 1e-9], ['Metric tonne', 't', 1000], ['Pound', 'lb', 0.45359237], ['Ounce', 'oz', 0.028349523125], ['Stone', 'st', 6.35029318], ['US short ton', 'short ton', 907.18474], ['Imperial long ton', 'long ton', 1016.0469088], ['Carat', 'ct', 0.0002]] },
  { name: 'Volume', units: [['Cubic meter', 'm³', 1], ['Liter', 'L', 0.001], ['Milliliter', 'mL', 1e-6], ['Cubic centimeter', 'cm³', 1e-6], ['Cubic inch', 'in³', 1.6387064e-5], ['Cubic foot', 'ft³', 0.028316846592], ['US gallon', 'US gal', 0.003785411784], ['US quart', 'US qt', 0.000946352946], ['US pint', 'US pt', 0.000473176473], ['US fluid ounce', 'US fl oz', 2.95735295625e-5], ['Imperial gallon', 'Imp gal', 0.00454609], ['Imperial pint', 'Imp pt', 0.00056826125]] },
  { name: 'Area', units: [['Square meter', 'm²', 1], ['Square kilometer', 'km²', 1e6], ['Square centimeter', 'cm²', 1e-4], ['Square millimeter', 'mm²', 1e-6], ['Hectare', 'ha', 1e4], ['Acre', 'ac', 4046.8564224], ['Square foot', 'ft²', 0.09290304], ['Square inch', 'in²', 0.00064516], ['Square yard', 'yd²', 0.83612736], ['Square mile', 'mi²', 2589988.110336]] },
  { name: 'Speed', units: [['Meter per second', 'm/s', 1], ['Kilometer per hour', 'km/h', 1 / 3.6], ['Mile per hour', 'mph', 0.44704], ['Foot per second', 'ft/s', 0.3048], ['Knot', 'kn', 1852 / 3600], ['Centimeter per second', 'cm/s', 0.01], ['Mach at sea level', 'Mach', 340.29], ['Inch per second', 'in/s', 0.0254], ['Kilometer per second', 'km/s', 1000]] },
  { name: 'Time', units: [['Second', 's', 1], ['Millisecond', 'ms', 0.001], ['Microsecond', 'µs', 1e-6], ['Nanosecond', 'ns', 1e-9], ['Minute', 'min', 60], ['Hour', 'h', 3600], ['Day', 'd', 86400], ['Week', 'wk', 604800], ['Average month', 'mo', 2629800], ['Average year', 'yr', 31556952]] },
  { name: 'Pressure', units: [['Pascal', 'Pa', 1], ['Kilopascal', 'kPa', 1000], ['Megapascal', 'MPa', 1e6], ['Bar', 'bar', 100000], ['Millibar', 'mbar', 100], ['Standard atmosphere', 'atm', 101325], ['Technical atmosphere', 'at', 98066.5], ['Pound per square inch', 'psi', 6894.757293168], ['Torr', 'Torr', 101325 / 760], ['Millimeter of mercury', 'mmHg', 133.322387415]] },
  { name: 'Energy', units: [['Joule', 'J', 1], ['Kilojoule', 'kJ', 1000], ['Megajoule', 'MJ', 1e6], ['Calorie', 'cal', 4.184], ['Kilocalorie', 'kcal', 4184], ['Watt-hour', 'Wh', 3600], ['Kilowatt-hour', 'kWh', 3600000], ['Electronvolt', 'eV', 1.602176634e-19], ['British thermal unit', 'BTU', 1055.05585262], ['Foot-pound', 'ft·lbf', 1.3558179483314], ['Erg', 'erg', 1e-7]] },
  { name: 'Power', units: [['Watt', 'W', 1], ['Kilowatt', 'kW', 1000], ['Megawatt', 'MW', 1e6], ['Mechanical horsepower', 'hp', 745.699871582], ['Metric horsepower', 'PS', 735.49875], ['BTU per hour', 'BTU/h', 0.293071070172], ['Foot-pound per second', 'ft·lbf/s', 1.3558179483314], ['Kilocalorie per hour', 'kcal/h', 1.163]] },
  { name: 'Digital Storage', units: [['Byte', 'B', 1], ['Bit', 'bit', 0.125], ['Kilobyte (decimal)', 'kB', 1000], ['Megabyte (decimal)', 'MB', 1e6], ['Gigabyte (decimal)', 'GB', 1e9], ['Terabyte (decimal)', 'TB', 1e12], ['Kibibyte', 'KiB', 1024], ['Mebibyte', 'MiB', 1048576]] },
  { name: 'Frequency', units: [['Hertz', 'Hz', 1], ['Kilohertz', 'kHz', 1000], ['Megahertz', 'MHz', 1e6], ['Gigahertz', 'GHz', 1e9], ['Terahertz', 'THz', 1e12], ['Revolution per minute', 'rpm', 1 / 60], ['Beat per minute', 'bpm', 1 / 60], ['Cycle per day', 'cycle/day', 1 / 86400]] },
  { name: 'Cooking Volume', units: [['Milliliter', 'mL', 1e-6], ['Liter', 'L', 0.001], ['US teaspoon', 'tsp', 4.92892159375e-6], ['US tablespoon', 'tbsp', 1.478676478125e-5], ['US cup', 'US cup', 0.0002365882365], ['Metric cup', 'metric cup', 0.00025], ['US fluid ounce', 'US fl oz', 2.95735295625e-5], ['US pint', 'US pt', 0.000473176473], ['US quart', 'US qt', 0.000946352946], ['Imperial pint', 'Imp pt', 0.00056826125]] },
  { name: 'Angle', units: [['Degree', '°', Math.PI / 180], ['Radian', 'rad', 1], ['Gradian', 'gon', Math.PI / 200], ['Arcminute', '′', Math.PI / 10800], ['Arcsecond', '″', Math.PI / 648000], ['Turn', 'turn', 2 * Math.PI], ['Milliradian', 'mrad', 0.001], ['Millidegree', 'mdeg', Math.PI / 180000]] },
  { name: 'Temperature', units: [['Celsius', '°C', 1, 273.15], ['Fahrenheit', '°F', 5 / 9, 255.3722222222222], ['Kelvin', 'K', 1, 0], ['Rankine', '°R', 5 / 9, 0], ['Réaumur', '°Ré', 1.25, 273.15], ['Rømer', '°Rø', 40 / 21, 258.8642857142857]] }
];

const groups = categories.map(category => {
  const units = category.units.map(([name, symbol, factor, offset = 0]) => ({ name, symbol, factor, offset }));
  const pairs = [];
  for (const from of units) {
    for (const to of units) {
      if (from !== to) pairs.push({ from, to });
    }
  }
  return { category, pairs, tools: [] };
});

const tools = [];
const totalCandidates = groups.reduce((total, group) => total + group.pairs.length, 0);
if (totalCandidates < 1000) throw new Error(`Only ${totalCandidates} unique conversions were defined.`);

for (let pairIndex = 0; tools.length < 1000; pairIndex++) {
  for (const group of groups) {
    const pair = group.pairs[pairIndex];
    if (!pair || tools.length >= 1000) continue;
    const categorySlug = slugify(group.category.name);
    const slug = `${categorySlug}-${slugify(pair.from.name)}-to-${slugify(pair.to.name)}-converter`;
    const tool = {
      slug,
      category: group.category.name,
      categorySlug,
      from: pair.from,
      to: pair.to,
      title: `${pair.from.name} to ${pair.to.name} Converter`,
      description: shortDescription(`Convert ${pair.from.name} to ${pair.to.name} online. Enter a value for a precise ${group.category.name.toLowerCase()} conversion with the formula and an example.`)
    };
    if (tools.some(existing => existing.slug === slug)) throw new Error(`Duplicate tool slug: ${slug}`);
    tools.push(tool);
    group.tools.push(tool);
  }
}

await mkdir(path.join(output, 'tools', 'categories'), { recursive: true });
await mkdir(path.join(output, 'tools', 'apps'), { recursive: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
await mkdir(path.join(output, 'icons'), { recursive: true });

const sourceHome = await readFile(path.join(root, 'INDEX.html'), 'utf8');
const utilityCount = (sourceHome.match(/\{id:'[^']+',name:/g) || []).length;
if (utilityCount < 1) throw new Error('Could not count the app tool registry.');
const appTools = [
  { id: 'pdf-compress', title: 'PDF Compressor', category: 'PDF tools', description: 'Reduce the file size of a PDF by rendering its pages as optimized images. Choose a balance between image quality and output size.', keywords: 'compress PDF, reduce PDF size, PDF compressor online', details: 'Image-based output can reduce scanned or image-heavy files. Text, links, forms and accessibility structure are not retained.' },
  { id: 'pdf-split', title: 'Split PDF and Extract Pages', category: 'PDF tools', description: 'Extract selected pages or page ranges from a PDF into a separate document, directly in your browser.', keywords: 'split PDF, extract PDF pages, PDF page extractor', details: 'Enter individual pages and inclusive ranges such as 1, 3-5, 8. The selected pages stay in the order you enter them.' },
  { id: 'image-pdf', title: 'Image to PDF and PDF to Images', category: 'File converters', description: 'Create a PDF from selected images or export each page of a PDF as PNG or JPEG images.', keywords: 'image to PDF, PDF to JPG, PDF to PNG, convert PDF pages to images', details: 'Images are ordered as selected. PDF pages can be exported at standard or high resolution.' },
  { id: 'favicon', title: 'Favicon Generator', category: 'Design tools', description: 'Create a multi-size favicon.ico and PNG app icons from an image, ready to add to a website.', keywords: 'favicon generator, create favicon ICO, website icon generator', details: 'The generator center-crops the source image and exports common browser and mobile icon sizes.' },
  { id: 'scientific', title: 'Scientific Calculator', category: 'Calculator tools', description: 'Calculate scientific expressions with trigonometry, logarithms, powers, factorials, constants and common math functions.', keywords: 'scientific calculator, online math calculator, calculator with sin cos log', details: 'Expressions are parsed with a restricted math grammar. JavaScript evaluation and assignment are not supported.' },
  { id: 'vat', title: 'VAT and Sales Tax Calculator', category: 'Finance tools', description: 'Add a user-entered tax rate to a net price or calculate the tax portion already included in a gross price.', keywords: 'VAT calculator, sales tax calculator, add tax to price, remove VAT', details: 'Enter the rate that applies to your transaction. Tax rules differ by location and product.' },
  { id: 'paycheck', title: 'Paycheck and Take-Home Pay Estimator', category: 'Finance tools', description: 'Estimate take-home pay by applying your own deduction rate and other deductions to weekly, biweekly, monthly or annual gross pay.', keywords: 'paycheck calculator, take home pay estimator, net salary calculator', details: 'This is a user-configured estimate, not a jurisdiction-specific payroll calculation or tax filing result.' },
  { id: 'xml', title: 'XML Formatter and Validator', category: 'Developer tools', description: 'Check whether XML is well-formed and format readable XML in your browser without uploading the source.', keywords: 'XML formatter, XML validator, pretty print XML online', details: 'Validation checks XML syntax and well-formedness. It does not validate against an XSD or DTD schema.' },
  { id: 'typing-test', title: 'Typing Speed Test', category: 'Text tools', description: 'Measure typing speed in words per minute and character accuracy with a timed typing test.', keywords: 'typing speed test, WPM test, typing accuracy test', details: 'The test runs locally. WPM is estimated from correctly typed characters divided by five.' },
  { id: 'seo-kit', title: 'SEO Meta Analyzer and Sitemap Generator', category: 'SEO tools', description: 'Inspect page titles, descriptions and canonical tags, or generate a basic sitemap.xml and robots.txt from your URLs.', keywords: 'SEO meta tag analyzer, sitemap generator, robots.txt generator', details: 'Generated files are starting points. Confirm URLs, indexing directives and canonical domains before publishing.' }
];
if (appTools.length !== 10 || appTools.some((tool, index) => appTools.findIndex(other => other.id === tool.id) !== index)) throw new Error('Focused app tool metadata must contain ten unique IDs.');
const home = sourceHome
  .replaceAll('https://handytools.example.com', siteUrl)
  .replaceAll('href="/', `href="${basePath}/`)
  .replaceAll('src="/', `src="${basePath}/`)
  .replaceAll('82 free browser tools', `${utilityCount} free browser tools`)
  .replaceAll('82 free browser-based tools', `${utilityCount} free browser-based tools`)
  .replaceAll('82 free browser-based utilities', `${utilityCount} free browser-based utilities`)
  .replaceAll('82 Utilities', `${utilityCount} Utilities`)
  .replaceAll('82-tool hub', `${utilityCount}-tool hub`)
  .replaceAll('72 original tools', `${utilityCount} original tools`)
  .replace('<meta name="robots" content="index, follow, max-image-preview:large">', `<meta name="robots" content="${robotsMeta}">`);
await writeFile(path.join(output, 'index.html'), home);
await writeFile(path.join(output, 'icons', 'icon-192.png'), createAppIcon(192));
await writeFile(path.join(output, 'icons', 'icon-512.png'), createAppIcon(512));
await writeFile(path.join(output, 'manifest.webmanifest'), JSON.stringify({
  id: publicPath('/'), name: `Handy Tools Pro - 1,000 Converters and ${utilityCount} Utilities`, short_name: 'Handy Tools',
  description: 'Installable tools and unit converters that work in your browser.',
  start_url: publicPath('/'), scope: publicPath('/'), display: 'standalone', orientation: 'any',
  background_color: '#f4f5f0', theme_color: '#172321',
  icons: [
    { src: publicPath('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: publicPath('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: publicPath('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2));

const css = `
:root{color-scheme:light;--paper:#f4f5f0;--surface:#fff;--ink:#172321;--muted:#53645f;--line:#d7dfd9;--green:#176b55;--orange:#b9462f;--soft:#e8efe9;font-family:"DM Sans",Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:inherit;line-height:1.55}a{color:inherit}.site-header{background:#172321;color:#f5f7f3;border-bottom:4px solid #b9462f}.header-inner,.page{width:min(1120px,calc(100% - 40px));margin:auto}.header-inner{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:68px}.brand{font-weight:800;text-decoration:none;font-size:19px}.header-link{color:#d9e8df;text-decoration:none;font-size:14px}.header-link:hover,.text-link:hover{text-decoration:underline}.install-button{height:40px;border:1px solid #8ba79a;border-radius:5px;padding:0 13px;background:#176b55;color:white;font:700 13px inherit;cursor:pointer}.install-dialog{width:min(520px,calc(100% - 32px));padding:26px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);box-shadow:0 24px 80px #0004}.install-dialog::backdrop{background:#101816aa;backdrop-filter:blur(3px)}.install-dialog h2{margin-bottom:12px}.install-dialog p{color:var(--muted)}.install-dialog .actions{display:flex;justify-content:flex-end}.page{padding:36px 0 72px}.breadcrumbs{font-size:13px;color:var(--muted);margin-bottom:24px}.breadcrumbs a{color:var(--green)}.eyebrow{color:var(--green);font-size:12px;text-transform:uppercase;font-weight:800;letter-spacing:.08em;margin:0 0 8px}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(30px,5vw,48px);line-height:1.08;max-width:850px;margin-bottom:14px}h2{font-size:22px;margin:0 0 14px}h3{font-size:16px}.lede{font-size:17px;color:var(--muted);max-width:760px;margin-bottom:28px}.tool-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(270px,.8fr);gap:32px;align-items:start}.tool-form{background:var(--surface);border:1px solid var(--line);border-top:4px solid var(--green);padding:24px;box-shadow:0 12px 35px #1723210c}.field-label{display:block;font-size:13px;font-weight:700;color:var(--muted);margin:0 0 8px}.input-row{display:grid;grid-template-columns:1fr auto;gap:10px}.value-input{width:100%;height:54px;padding:0 14px;border:1px solid #aab9b1;border-radius:5px;background:white;color:var(--ink);font:600 20px inherit}.value-input:focus,.search:focus,select:focus{outline:3px solid #176b5533;border-color:var(--green)}button,.button{height:48px;border:0;border-radius:5px;padding:0 18px;background:var(--green);color:white;font:700 14px inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}button:hover,.button:hover{background:#10533f}.result{min-height:62px;margin-top:16px;padding:16px;background:var(--soft);border-left:4px solid var(--green);font-size:20px;font-weight:700;overflow-wrap:anywhere}.result[hidden]{display:none}.result small{display:block;color:var(--muted);font-size:13px;font-weight:500;margin-top:4px}.copy-button{margin-top:12px;background:#e7eeea;color:var(--ink)}.copy-button:hover{background:#d9e5dd}.explain{padding:8px 0}.formula{padding:14px;background:#e9ede8;border-radius:4px;font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.note{font-size:13px;color:var(--muted)}.section{margin-top:42px;padding-top:24px;border-top:1px solid var(--line)}.related-list,.tool-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;list-style:none;padding:0;margin:0}.related-list li,.tool-list li{border-bottom:1px solid var(--line)}.related-list a,.tool-list a{display:block;padding:12px 0;text-decoration:none;color:var(--green);font-weight:600}.related-list a:hover,.tool-list a:hover{color:var(--orange)}.filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:24px 0}.search,select{height:46px;border:1px solid #aab9b1;border-radius:5px;padding:0 12px;background:white;color:var(--ink);font:inherit}.search{flex:1;min-width:220px}.count{font-size:13px;color:var(--muted)}.category-nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 20px}.category-nav a{padding:7px 10px;border:1px solid var(--line);border-radius:4px;color:var(--green);text-decoration:none;font-size:13px;font-weight:600}.category-nav a:hover{background:var(--soft)}.site-footer{background:#172321;color:#d9e8df;padding:24px 0;font-size:13px}.site-footer .header-inner{min-height:0}.faq{padding:16px 0;border-bottom:1px solid var(--line)}.faq h3{margin-bottom:6px}.hidden{display:none!important}@media(max-width:760px){.header-inner,.page{width:min(100% - 28px,1120px)}.header-inner{flex-wrap:wrap;padding:10px 0}.tool-layout{grid-template-columns:1fr;gap:14px}.related-list,.tool-list{grid-template-columns:1fr}.input-row{grid-template-columns:1fr}.input-row button{width:100%}.page{padding-top:26px}.header-inner{min-height:60px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
await writeFile(path.join(output, 'assets', 'site.css'), css);

const sharedHead = (title, description, url, keywords, schema, assetPrefix = '../') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robotsMeta}"><title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}"><meta name="keywords" content="${escapeHtml(keywords)}">
<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#172321"><link rel="manifest" href="${assetPrefix}manifest.webmanifest"><link rel="apple-touch-icon" href="${assetPrefix}icons/icon-192.png"><link rel="stylesheet" href="${assetPrefix}assets/site.css"><script src="${assetPrefix}assets/pwa.js" defer></script><script type="application/ld+json">${safeJson(schema)}</script></head>`;

const footer = `<footer class="site-footer"><div class="header-inner"><span>Handy Tools · Free browser-based converters</span><a class="header-link" href="../index.html">All ${utilityCount} utilities</a></div></footer>`;
const installButton = '<button class="install-button" id="install-app" type="button">Install App</button>';
const installDialog = `<dialog class="install-dialog" id="install-guide" aria-labelledby="install-title"><h2 id="install-title">Install Handy Tools</h2><p><strong>Android:</strong> Open this site in Chrome, tap the menu, then choose Install app or Add to Home screen.</p><p><strong>Windows / Mac:</strong> In Chrome or Edge, open the browser menu and choose Install Handy Tools or Install this site as an app.</p><p><strong>iPhone / iPad:</strong> In Safari, tap Share, then Add to Home Screen.</p><p class="note">Previously opened converter pages are available offline. Some of the ${utilityCount} app tools need an internet connection or an external library.</p><div class="actions"><button class="dialog-close" id="install-guide-close" type="button">Close</button></div></dialog>`;
const pageShell = (body, title, description, url, keywords, schema) => `${sharedHead(title, description, url, keywords, schema)}<body><header class="site-header"><div class="header-inner"><a class="brand" href="../index.html">Handy Tools</a><a class="header-link" href="./index.html">All converters</a>${installButton}</div></header>${installDialog}${body}${footer}</body></html>`;

for (const tool of tools) {
  const toolUrl = `${siteUrl}/tools/${tool.slug}.html`;
  const category = categories.find(item => slugify(item.name) === tool.categorySlug);
  const formula = `(value × ${tool.from.factor} + ${tool.from.offset}) − ${tool.to.offset}, then ÷ ${tool.to.factor}`;
  const exampleValue = 1;
  const exampleResult = ((exampleValue * tool.from.factor + tool.from.offset) - tool.to.offset) / tool.to.factor;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', name: tool.title, url: toolUrl, description: tool.description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: [
        { '@type': 'Question', name: `How do I convert ${tool.from.name} to ${tool.to.name}?`, acceptedAnswer: { '@type': 'Answer', text: `Enter a value in ${tool.from.name}; the converter applies the standard ${tool.category.toLowerCase()} conversion factors and shows the result in ${tool.to.name}.` } },
        { '@type': 'Question', name: 'Is this converter free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The conversion runs in your browser and is free to use.' } }
      ] }
    ]
  };
  const related = groupTools => groupTools.filter(item => item.slug !== tool.slug).slice(0, 8);
  const relatedLinks = related(groups.find(group => group.category.name === tool.category).tools)
    .map(item => `<li><a href="./${item.slug}.html">${escapeHtml(item.title)}</a></li>`).join('');
  const body = `<main class="page"><nav class="breadcrumbs"><a href="../index.html">Home</a> / <a href="./index.html">Converters</a> / <a href="./categories/${tool.categorySlug}.html">${escapeHtml(tool.category)}</a></nav>
<p class="eyebrow">${escapeHtml(tool.category)} converter</p><h1>${escapeHtml(tool.title)}</h1><p class="lede">${escapeHtml(tool.description)}</p>
<div class="tool-layout"><form class="tool-form" id="converter-form"><label class="field-label" for="value-input">Value in ${escapeHtml(tool.from.name)} (${escapeHtml(tool.from.symbol)})</label><div class="input-row"><input class="value-input" id="value-input" type="number" inputmode="decimal" step="any" value="1" required><button type="submit">Convert</button></div><output id="conversion-result" class="result" aria-live="polite" hidden></output><button class="copy-button" id="copy-result" type="button" hidden>Copy result</button></form>
<aside class="explain"><h2>Conversion details</h2><p>Convert ${escapeHtml(tool.from.name)} into ${escapeHtml(tool.to.name)} using the standard ${escapeHtml(tool.category.toLowerCase())} relationship.</p><p class="formula">${escapeHtml(formula)}</p><p class="note">Example: 1 ${escapeHtml(tool.from.symbol)} = ${escapeHtml(new Intl.NumberFormat('en-US', { maximumSignificantDigits: 10 }).format(exampleResult))} ${escapeHtml(tool.to.symbol)}.</p><p class="note">${tool.category === 'Temperature' ? 'Temperature conversions include both scale and offset.' : 'This converter uses fixed unit ratios; results are calculated locally in your browser.'}</p></aside></div>
<section class="section"><h2>How ${escapeHtml(tool.from.name)} to ${escapeHtml(tool.to.name)} conversion works</h2><p>Enter any finite number above. The value is converted through a shared ${escapeHtml(tool.category.toLowerCase())} reference unit, which supports accurate conversion in either direction and preserves decimal values.</p><p>The example uses the same formula as the calculator. Very large or very small results are formatted for readability; the underlying calculation retains full JavaScript numeric precision.</p></section>
<section class="section"><h2>Frequently asked questions</h2><div class="faq"><h3>How do I convert ${escapeHtml(tool.from.name)} to ${escapeHtml(tool.to.name)}?</h3><p>Enter the amount and select Convert. The answer appears instantly without sending the value to a server.</p></div><div class="faq"><h3>Can I use negative or decimal values?</h3><p>Yes. Decimal values are supported. Negative values are also supported where they make sense, such as temperature.</p></div><div class="faq"><h3>Is this ${escapeHtml(tool.category.toLowerCase())} converter free?</h3><p>Yes. It runs in your browser and does not require an account.</p></div></section>
<section class="section"><h2>Related ${escapeHtml(tool.category.toLowerCase())} converters</h2><ul class="related-list">${relatedLinks}</ul><p><a class="text-link" href="./categories/${tool.categorySlug}.html">Browse all ${escapeHtml(tool.category.toLowerCase())} conversions</a></p></section></main>`;
  const html = pageShell(body, tool.title, tool.description, toolUrl, `${tool.from.name} to ${tool.to.name}, ${tool.category} converter, convert ${tool.from.name} to ${tool.to.name}`, schema)
    .replace('<body>', `<body><script>window.UNIT_CONVERTER=${safeJson(tool)};</script><script src="../assets/tool.js" defer></script>`);
  await writeFile(path.join(output, 'tools', `${tool.slug}.html`), html);
}

const categoryUrls = [];
for (const group of groups) {
  if (!group.tools.length) continue;
  const categorySlug = slugify(group.category.name);
  const categoryUrl = `${siteUrl}/tools/categories/${categorySlug}.html`;
  categoryUrls.push(categoryUrl);
  const title = `${group.category.name} Converters | Handy Tools`;
  const description = shortDescription(`Browse ${group.tools.length} ${group.category.name.toLowerCase()} converters. Convert between common units with instant results, clear formulas and browser-based calculations.`);
  const links = group.tools.map(tool => `<li><a href="../${tool.slug}.html">${escapeHtml(tool.title)}</a></li>`).join('');
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: categoryUrl, description, numberOfItems: group.tools.length };
  const body = `<main class="page"><nav class="breadcrumbs"><a href="../../index.html">Home</a> / <a href="../index.html">Converters</a></nav><p class="eyebrow">Tool set · ${escapeHtml(group.category.name)}</p><h1>${escapeHtml(group.category.name)} converters</h1><p class="lede">${escapeHtml(description)}</p><ul class="tool-list">${links}</ul></main>`;
  const categoryHtml = `${sharedHead(title, description, categoryUrl, `${group.category.name} conversion tools, unit converter`, schema, '../../')}<body><header class="site-header"><div class="header-inner"><a class="brand" href="../../index.html">Handy Tools</a><a class="header-link" href="../index.html">All converters</a>${installButton}</div></header>${installDialog}${body}<footer class="site-footer"><div class="header-inner"><span>Handy Tools · ${group.tools.length} ${escapeHtml(group.category.name.toLowerCase())} converters</span></div></footer></body></html>`;
  await writeFile(path.join(output, 'tools', 'categories', `${categorySlug}.html`), categoryHtml);
}

const categoryOptions = groups.filter(group => group.tools.length)
  .map(group => `<option value="${slugify(group.category.name)}">${escapeHtml(group.category.name)} (${group.tools.length})</option>`).join('');
const catalogCards = tools.map(tool => `<li class="tool-entry" data-category="${tool.categorySlug}" data-search="${escapeHtml(`${tool.title} ${tool.category} ${tool.from.symbol} ${tool.to.symbol}`.toLowerCase())}"><a href="./${tool.slug}.html">${escapeHtml(tool.title)}</a><span class="note">${escapeHtml(tool.category)} · ${escapeHtml(tool.from.symbol)} → ${escapeHtml(tool.to.symbol)}</span></li>`).join('');
const catalogTitle = '1,000 Unit Converters | Handy Tools';
const catalogDescription = 'Browse 1,000 free unit converters for length, mass, volume, area, speed, time, pressure, energy, power, digital storage, frequency, cooking, angles and temperature.';
const catalogUrl = `${siteUrl}/tools/index.html`;
const catalogSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: catalogTitle, url: catalogUrl, description: catalogDescription, numberOfItems: tools.length };
const categoryNav = groups.filter(group => group.tools.length).map(group => `<a href="./categories/${slugify(group.category.name)}.html">${escapeHtml(group.category.name)} <span>(${group.tools.length})</span></a>`).join('');
const catalogBody = `<main class="page"><nav class="breadcrumbs"><a href="../index.html">Home</a> / Converters</nav><p class="eyebrow">1,000 useful conversions</p><h1>Unit converters for everyday work</h1><p class="lede">Search and filter 1,000 direct unit conversions across 14 tool sets. Each calculator works locally and includes its formula and an example.</p><nav class="category-nav" aria-label="Converter categories">${categoryNav}</nav><div class="filters"><input class="search" id="tool-search" type="search" placeholder="Search conversions..." aria-label="Search converters"><select id="category-filter" aria-label="Filter by category"><option value="all">All categories</option>${categoryOptions}</select><span class="count" id="result-count">1,000 converters</span></div><ul class="tool-list" id="tool-list">${catalogCards}</ul><p class="note hidden" id="no-results">No converters match that search.</p></main>`;
const catalogHtml = `${sharedHead(catalogTitle, catalogDescription, catalogUrl, 'unit converter, measurement conversion, length, mass, volume, temperature, speed, time, pressure, energy', catalogSchema)}<body><header class="site-header"><div class="header-inner"><a class="brand" href="../index.html">Handy Tools</a><a class="header-link" href="../index.html">All 72 utilities</a>${installButton}</div></header>${installDialog}${catalogBody}<footer class="site-footer"><div class="header-inner"><span>1,000 browser-based converters · No account required</span></div></footer><script src="../assets/catalog.js" defer></script></body></html>`;
await writeFile(path.join(output, 'tools', 'index.html'), catalogHtml.replace('All 72 utilities', `All ${utilityCount} utilities`));

const focusedDirectory = path.join(output, 'tools', 'apps');
const focusedIndexUrl = `${siteUrl}/tools/apps/index.html`;
const focusedPageUrls = [];
const focusedCards = appTools.map(tool => `<li class="tool-entry" data-search="${escapeHtml(`${tool.title} ${tool.category} ${tool.keywords}`.toLowerCase())}"><a href="./${tool.id}.html">${escapeHtml(tool.title)}</a><span class="note">${escapeHtml(tool.category)}</span></li>`).join('');
const focusedIndexTitle = `${appTools.length} Focused Online Tools | Handy Tools`;
const focusedIndexDescription = 'Use browser-based PDF, image, calculator, XML, typing and SEO tools with direct links, clear limitations and local file processing.';
const focusedIndexSchema = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: focusedIndexTitle, url: focusedIndexUrl, description: focusedIndexDescription, numberOfItems: appTools.length };
const focusedIndexBody = `<main class="page"><nav class="breadcrumbs"><a href="../../index.html">Home</a> / Focused tools</nav><p class="eyebrow">Files · finance · developer · everyday</p><h1>Focused online tools</h1><p class="lede">Open a dedicated tool page for common PDF, image, calculator, XML, typing and SEO tasks. Each tool runs in your browser unless its notice says it loads an online library.</p><div class="filters"><input class="search" id="tool-search" type="search" placeholder="Search focused tools..." aria-label="Search focused tools"><span class="count" id="result-count">${appTools.length} tools</span></div><ul class="tool-list" id="tool-list">${focusedCards}</ul><p class="note hidden" id="no-results">No tools match that search.</p></main>`;
const focusedCatalog = `${sharedHead(focusedIndexTitle, focusedIndexDescription, focusedIndexUrl, 'PDF compressor, PDF splitter, image PDF converter, scientific calculator, XML formatter, typing test, SEO tools', focusedIndexSchema, '../../')}<body><header class="site-header"><div class="header-inner"><a class="brand" href="../../index.html">Handy Tools</a><a class="header-link" href="../index.html">1,000 converters</a><button class="install-button" id="install-app" type="button">Install App</button></div></header>${installDialog}${focusedIndexBody}<footer class="site-footer"><div class="header-inner"><span>Handy Tools · ${utilityCount} interactive utilities</span></div></footer><script src="../../assets/catalog.js" defer></script></body></html>`;
await writeFile(path.join(focusedDirectory, 'index.html'), focusedCatalog);

for (const tool of appTools) {
  const url = `${siteUrl}/tools/apps/${tool.id}.html`;
  focusedPageUrls.push(url);
  const title = `${tool.title} | Handy Tools`;
  const description = shortDescription(tool.description);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebApplication', name: tool.title, url, description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: [
        { '@type': 'Question', name: `How do I use the ${tool.title.toLowerCase()}?`, acceptedAnswer: { '@type': 'Answer', text: `${tool.description} Open the tool in the Handy Tools workspace to process your input.` } },
        { '@type': 'Question', name: 'Is my input uploaded?', acceptedAnswer: { '@type': 'Answer', text: 'The tool runs in your browser. Some document tools load a processing library from a public CDN on first use.' } }
      ] }
    ]
  };
  const related = appTools.filter(item => item.id !== tool.id && item.category === tool.category)
    .map(item => `<li><a href="./${item.id}.html">${escapeHtml(item.title)}</a></li>`).join('');
  const body = `<main class="page"><nav class="breadcrumbs"><a href="../../index.html">Home</a> / <a href="./index.html">Focused tools</a> / ${escapeHtml(tool.category)}</nav><p class="eyebrow">${escapeHtml(tool.category)}</p><h1>${escapeHtml(tool.title)}</h1><p class="lede">${escapeHtml(description)}</p><section class="tool-form"><h2>Open the interactive tool</h2><p>${escapeHtml(tool.details)}</p><a class="button" href="../../index.html#tool=${encodeURIComponent(tool.id)}">Open ${escapeHtml(tool.title)}</a></section><section class="section"><h2>How this tool works</h2><p>${escapeHtml(tool.description)}</p><p>${escapeHtml(tool.details)}</p><p>Processing is designed to stay in your browser. Check the tool notice for file-size limits, browser support and any external library or network requirements before use.</p></section><section class="section"><h2>Frequently asked questions</h2><div class="faq"><h3>Is this tool free?</h3><p>Yes. It is available without an account.</p></div><div class="faq"><h3>Does it guarantee search ranking or legal/tax results?</h3><p>No. SEO tools provide checks, and finance estimates depend on your inputs. Confirm important tax, payroll, document and search decisions with the appropriate authoritative source.</p></div></section>${related?`<section class="section"><h2>Related ${escapeHtml(tool.category.toLowerCase())}</h2><ul class="related-list">${related}</ul></section>`:''}</main>`;
  const page = `${sharedHead(title, description, url, `${tool.keywords}, free online ${tool.title.toLowerCase()}`, schema, '../../')}<body><header class="site-header"><div class="header-inner"><a class="brand" href="../../index.html">Handy Tools</a><a class="header-link" href="./index.html">Focused tools</a><button class="install-button" id="install-app" type="button">Install App</button></div></header>${installDialog}${body}<footer class="site-footer"><div class="header-inner"><span>Handy Tools · ${utilityCount} interactive utilities</span></div></footer></body></html>`;
  await writeFile(path.join(focusedDirectory, `${tool.id}.html`), page);
}

const installSchema = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Handy Tools Pro', operatingSystem: 'Android, Windows, macOS, Linux, iOS', applicationCategory: 'UtilitiesApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };
const installPageUrl = `${siteUrl}/install.html`;
const installPageTitle = 'Install Handy Tools on Android, iPhone and PC';
const installPageDescription = 'Install Handy Tools as a browser app on Android, iPhone, Windows, Mac or Linux. Learn install and offline options.';
const installPageBody = `<main class="page"><nav class="breadcrumbs"><a href="./index.html">Home</a> / Install</nav><p class="eyebrow">Use it like an app</p><h1>Install Handy Tools</h1><p class="lede">Add this site to your device for an app-style window and quick access. No app-store account is required.</p><div class="tool-layout"><section><h2>Android</h2><p>Open Handy Tools in Chrome, tap the browser menu, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. Menu wording varies by browser.</p><h2>Windows, Mac and Linux</h2><p>Open the site in Chrome or Edge and choose <strong>Install Handy Tools</strong> from the browser menu or address-bar install icon.</p><h2>iPhone and iPad</h2><p>Open the site in Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</p><h2>Offline use</h2><p>Converter pages you have opened are cached for later visits. Some tools in the original 72-tool hub load online libraries or use network services and therefore need internet access.</p><p class="note">This is an installable web app (PWA), not a separately signed APK or Windows installer. Native store packages require platform build tools, signing and a published domain.</p><a class="button" href="./index.html">Open the tool hub</a></section><aside><h2>Install from this page</h2><p>On supported browsers, use the install button below or in the site header. If your browser does not support the prompt, follow the device steps.</p><button class="install-button" id="install-app" type="button">Install App</button></aside></div></main>`;
const installPage = `${sharedHead(installPageTitle, installPageDescription, installPageUrl, 'install Handy Tools, Android web app, install on PC, install PWA', installSchema, './')}<body><header class="site-header"><div class="header-inner"><a class="brand" href="./index.html">Handy Tools</a><a class="header-link" href="./tools/index.html">Converters</a>${installButton}</div></header>${installDialog}${installPageBody}<footer class="site-footer"><div class="header-inner"><span>Handy Tools · Installable browser app</span></div></footer></body></html>`;
await writeFile(path.join(output, 'install.html'), installPage.replace('original 72-tool hub', `original ${utilityCount}-tool hub`));

const sitemapUrls = [`${siteUrl}/`, catalogUrl, focusedIndexUrl, ...focusedPageUrls, installPageUrl, ...categoryUrls, ...tools.map(tool => `${siteUrl}/tools/${tool.slug}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(url => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(output, 'sitemap.xml'), sitemap);
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\n${production ? 'Allow: /' : 'Disallow: /'}\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(path.join(output, 'offline.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Offline | Handy Tools</title><body style="margin:0;background:#f4f5f0;color:#172321;font:16px/1.6 Arial,sans-serif"><main style="max-width:640px;margin:12vh auto;padding:24px"><p style="color:#176b55;font-weight:bold">HANDY TOOLS</p><h1>You are offline</h1><p>Previously visited converter pages may still be available. Reconnect to browse tools you have not opened yet.</p><a href="${publicPath('/tools/index.html')}">Open the converter catalog</a></main></body></html>`);
await writeFile(path.join(output, '.nojekyll'), '');
const precachePaths = [publicPath('/'), publicPath('/index.html'), publicPath('/tools/index.html'), publicPath('/tools/apps/index.html'), publicPath('/install.html'), publicPath('/offline.html'), publicPath('/manifest.webmanifest'), publicPath('/assets/site.css'), publicPath('/assets/tool.js'), publicPath('/assets/catalog.js'), publicPath('/assets/pwa.js'), publicPath('/icons/icon-192.png'), publicPath('/icons/icon-512.png'), ...categoryUrls.map(url => new URL(url).pathname), ...focusedPageUrls.map(url => new URL(url).pathname)];
await writeFile(path.join(output, 'service-worker.js'), `
const CACHE_NAME='handy-tools-pwa-v1';
const PRECACHE=${safeJson(precachePaths)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('handy-tools-pwa-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}).catch(async()=>await caches.match(request)||await caches.match('${publicPath('/offline.html')}')));return;}event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;})));});
`);
await writeFile(path.join(output, 'assets', 'pwa.js'), `
const basePath=${safeJson(basePath)};const installButton=document.querySelector('#install-app');const installDialog=document.querySelector('#install-guide');const closeButton=document.querySelector('#install-guide-close');let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
installButton?.addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;return;}if(installDialog?.showModal)installDialog.showModal();else window.location.href=basePath+'/install.html';});
closeButton?.addEventListener('click',()=>installDialog.close());
window.addEventListener('appinstalled',()=>{if(installButton){installButton.textContent='App Installed';installButton.disabled=true;}});
if('serviceWorker'in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register(basePath+'/service-worker.js').catch(()=>{});}
`);
await writeFile(path.join(output, 'assets', 'tool.js'), `
const form=document.querySelector('#converter-form'),input=document.querySelector('#value-input'),result=document.querySelector('#conversion-result'),copy=document.querySelector('#copy-result'),tool=window.UNIT_CONVERTER;
form.addEventListener('submit',event=>{event.preventDefault();const value=input.valueAsNumber;if(!Number.isFinite(value)){result.textContent='Enter a valid number.';result.hidden=false;copy.hidden=true;return;}const base=value*tool.from.factor+tool.from.offset,converted=(base-tool.to.offset)/tool.to.factor;if(!Number.isFinite(converted)){result.textContent='This value is outside the supported numeric range.';result.hidden=false;copy.hidden=true;return;}const formatted=new Intl.NumberFormat(undefined,{maximumSignificantDigits:12}).format(converted);result.replaceChildren();const valueNode=document.createElement('span');valueNode.textContent=formatted+' '+tool.to.symbol;const detail=document.createElement('small');detail.textContent=value+' '+tool.from.symbol+' = '+formatted+' '+tool.to.symbol;result.append(valueNode,detail);result.hidden=false;copy.hidden=false;});
copy.addEventListener('click',async()=>{const text=result.querySelector('small')?.textContent||'';try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy result',1400);}catch{copy.textContent='Copy unavailable';}});
form.requestSubmit();
`);
await writeFile(path.join(output, 'assets', 'catalog.js'), `
const search=document.querySelector('#tool-search'),filter=document.querySelector('#category-filter'),entries=[...document.querySelectorAll('.tool-entry')],count=document.querySelector('#result-count'),empty=document.querySelector('#no-results');
function update(){const query=search.value.trim().toLowerCase(),category=filter?.value||'all';let visible=0;for(const entry of entries){const matches=entry.dataset.search.includes(query)&&(category==='all'||entry.dataset.category===category);entry.classList.toggle('hidden',!matches);if(matches)visible++;}count.textContent=visible.toLocaleString()+(filter?' converter':' tool')+(visible===1?'':'s');empty.classList.toggle('hidden',visible!==0);}
search.addEventListener('input',update);filter?.addEventListener('change',update);
`);

console.log(`Built ${tools.length} converter pages across ${groups.filter(group => group.tools.length).length} categories.`);
console.log('Added an installable PWA manifest, device install guide, offline fallback and service worker.');
console.log(`Production indexing: ${production ? 'enabled' : 'disabled for local preview'}. Site URL: ${siteUrl}`);