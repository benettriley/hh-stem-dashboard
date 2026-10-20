// Builds ./brightsign/ : just the files the STEM pages need, ready to add to a
// BrightAuthor:connected presentation as local HTML sites. dashboard/ stays the source;
// re-run this after any change: node tools/build-brightsign.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'dashboard');
const out = path.join(root, 'brightsign');

const PAGES = ['stem-rooms.html', 'stem-outside.html', 'stem-energy.html', 'stem-air.html'];
const FILES = [...PAGES, 'config.js', 'charts.js', 'app.js', 'stem.js', 'styles.css',
  'fonts/fonts.css', 'fonts/inter-latin.woff2', 'fonts/source-serif-4-latin.woff2', 'fonts/OFL.txt'];

fs.rmSync(out, { recursive: true, force: true });
FILES.forEach((f) => {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) throw new Error(`Missing ${f} in dashboard/`);
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(from, path.join(out, f));
});

// Sanity checks: no external fonts, and the live feed is configured.
PAGES.forEach((p) => {
  const html = fs.readFileSync(path.join(out, p), 'utf8');
  if (/fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error(`${p} still loads Google Fonts`);
});
const config = fs.readFileSync(path.join(out, 'config.js'), 'utf8');
if (!/FEED_URL:\s*'https:\/\/script\.google\.com\/macros\/s\//.test(config)) throw new Error('config.js FEED_URL is not the live Apps Script URL');

fs.writeFileSync(path.join(out, 'README.txt'), `Harpeth Hall STEM dashboard for BrightSign
Built ${new Date().toISOString()} from dashboard/ by tools/build-brightsign.js. Don't edit here.

PAGES (each is one slide, 1920x1080)
  stem-rooms.html     Which room is warmest right now
  stem-outside.html   Outside vs inside today
  stem-energy.html    Heating & cooling (chiller, boilers)
  stem-air.html       Fresh air & free cooling

HOSTING (Cloudflare Workers, static assets)
  From the project root: npx wrangler deploy   (config: wrangler.jsonc)
  Each page is then https://hh-stem-dashboard.<subdomain>.workers.dev/<page>.html

BRIGHTSIGN AUTHOR (CLOUD)
  1. Presentation resolution: 1920x1080.
  2. Add each page URL as an HTML / web page item (one per page).
  3. Give each item a Timeout event (e.g. 20-30 s) to advance to the next.
  4. In each HTML item's settings: JavaScript ON, local storage ON (allow a few MB;
     the rooms/outside pages cache ~0.8 MB so they never show a blank slide).
  5. Publish.

PLAYER NEEDS
  - Internet access to the workers.dev site, script.google.com and script.googleusercontent.com (the data feed).
  - Correct time (NTP on). Pages use Central time.

BEHAVIOR
  - Each page fetches its data on load and every 5 minutes; draws its last saved copy first.
  - Full page reload once a day at 4 AM.
  - Between midnight and the first export (~6:05 AM) pages show yesterday's data, labeled "yesterday".
  - A small corner tag appears only if the data is offline or more than 2 hours old.
`);

// Cloudflare Workers: don't publish the setup notes.
fs.writeFileSync(path.join(out, '.assetsignore'), 'README.txt\n.assetsignore\n');

const size = FILES.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log(`Built ${out}\n  ${FILES.length} files + README.txt, ${(size / 1024).toFixed(0)} KB`);
