#!/usr/bin/env node
// Fold the site into ONE self-contained HTML file for publishing as an Artifact.
//
// The artifact sandbox allows scripts only from a small CDN allowlist and blocks
// every other external request, so: three.js comes from cdnjs, fonts from Google
// Fonts, and everything else is inlined. Clips are embedded as base64 and turned
// into blob: URLs before the engine mounts, because the engine fetches its clips
// and a blob URL is same-origin while a data: URI may not be fetchable.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const B = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(B, p), 'utf8');
const b64 = (p) => fs.readFileSync(path.join(B, p)).toString('base64');
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.0/three.module.min.js';
const ASSET_DIR = process.argv.includes('--preview') ? 'preview-assets' : 'assets';

let html = read('index.html');

// ---- fonts: Google Fonts is on the artifact allowlist, so drop the local copies
html = html.replace('<link rel="stylesheet" href="fonts/fonts.css">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Geist:wght@300;400;500&family=Geist+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">');

// ---- stylesheets inline
for (const css of ['scrollcraft.css', 'site.css']) {
  html = html.replace(`<link rel="stylesheet" href="${css}">`, `<style>\n/* ${css} */\n${read(css)}\n</style>`);
}

// ---- posters as data URIs
const posters = fs.readdirSync(path.join(B, ASSET_DIR)).filter((f) => f.endsWith('.webp'));
for (const p of posters) {
  html = html.split(`assets/${p}`).join(`data:image/webp;base64,${b64(`${ASSET_DIR}/${p}`)}`);
}

// ---- clips: collect, then hand them to the page as blob URLs before mount
const clips = [];
html = html.replace(/data-sc-src(-mobile)?="assets\/([^"]+\.mp4)"/g, (m, mob, file) => {
  const full = path.join(B, ASSET_DIR, file);
  if (!fs.existsSync(full)) return `data-sc-drop="${file}"`;
  let i = clips.findIndex((c) => c.file === file);
  if (i === -1) { i = clips.length; clips.push({ file, b64: fs.readFileSync(full).toString('base64') }); }
  return `data-clip${mob ? '-mobile' : ''}="${i}"`;
});

const boot = `<script>
// base64 -> Blob -> blob: URL, before the engine mounts. The engine fetches its
// clip source, and fetch() on a blob: URL is same-origin; on a data: URI it is
// at the mercy of connect-src.
(function () {
  var RAW = ${JSON.stringify(clips.map((c) => c.b64))};
  var urls = RAW.map(function (s) {
    var bin = atob(s), n = bin.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([a], { type: 'video/mp4' }));
  });
  document.querySelectorAll('[data-clip]').forEach(function (v) { v.setAttribute('data-sc-src', urls[+v.dataset.clip]); });
  document.querySelectorAll('[data-clip-mobile]').forEach(function (v) { v.setAttribute('data-sc-src-mobile', urls[+v.dataset.clipMobile]); });
})();
</script>`;

// ---- engine, boot, mount
html = html.replace('<script src="scrollcraft.js"></script>', `<script>\n${read('scrollcraft.js')}\n</script>\n${boot}`);

// ---- app.js as one module, three.js pulled from cdnjs at runtime.
// The import stays DYNAMIC and inside the live layer's own try. A static
// top-level import would take the whole module down with it if the CDN ever
// failed, and with it the language toggle, the requisition and the scrim
// plates. The page must survive losing its 3D layer.
let app = read('app.js').replace(
  /^const THREE_URL = '\.\/vendor\/three\.module\.min\.js';$/m,
  `const THREE_URL = '${THREE_CDN}';`);
if (!app.includes(THREE_CDN)) throw new Error('three.js URL was not rewritten for the artifact');
if (/import\(\s*'\.\//.test(app)) throw new Error('a local dynamic import survived into the artifact');

html = html.replace('<script type="module" src="app.js"></script>', `<script type="module">\n${app}\n</script>`);

if (/(src|href)="(?!https:|data:|#)[^"]+"/.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  const left = html.replace(/<!--[\s\S]*?-->/g, '').match(/(src|href)="(?!https:|data:|#)[^"]+"/g);
  console.warn('WARNING unresolved local references:', [...new Set(left)].join(', '));
}

const out = path.join(HERE, 'artifact.html');
fs.writeFileSync(out, html);
const mb = fs.statSync(out).size / 1048576;
console.log(`${out}  ${mb.toFixed(1)} MB  (${clips.length} clips embedded from ${ASSET_DIR}/)`);
if (mb > 15.5) console.warn('OVER the 16MB artifact limit. Re-encode the preview assets smaller.');
