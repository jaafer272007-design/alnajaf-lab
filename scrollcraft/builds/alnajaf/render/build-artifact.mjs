#!/usr/bin/env node
// Fold the site into ONE self-contained HTML fragment for publishing as an Artifact.
//
// The artifact host wraps the file in its own document skeleton and allows scripts only from a
// short CDN allowlist, so: GSAP and three.js come from cdnjs, the type from Google Fonts, and
// everything else (styles, markup, the page script) is inlined. There is no video and no image
// to embed, so the whole thing is a few hundred kilobytes.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const B = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(B, p), 'utf8');
const GSAP = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/';
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.0/three.module.min.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900&family=Cairo:wght@200..1000&family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap';

const html = read('index.html');
const title = html.match(/<title>([^<]*)<\/title>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];

let app = read('app.js').replace(/^const THREE_URL = '\.\/vendor\/three\.module\.min\.js';$/m, `const THREE_URL = '${THREE_CDN}';`);
if (!app.includes(THREE_CDN)) throw new Error('three.js URL was not rewritten for the artifact');
if (/import\(\s*'\.\//.test(app)) throw new Error('a local dynamic import survived into the artifact');

// Posters as data URIs; the clip as base64 handed to the page as a blob URL before the
// script runs, since the page fetches its clip and a blob is same-origin everywhere.
const b64 = (p) => fs.readFileSync(path.join(B, p)).toString('base64');
let out = body;
for (const f of fs.readdirSync(path.join(B, 'assets')).filter((f) => f.endsWith('.webp'))) out = out.split(`assets/${f}`).join(`data:image/webp;base64,${b64(`assets/${f}`)}`);
const clips = [];
out = out.replace(/data-src(-mobile)?="assets\/([^"]+\.mp4)"/g, (m, mob, file) => {
  if (!fs.existsSync(path.join(B, 'assets', file))) return m;
  let i = clips.findIndex((c) => c.file === file);
  if (i === -1) { i = clips.length; clips.push({ file, b64: b64(`assets/${file}`) }); }
  return `data-clip${mob ? '-mobile' : ''}="${i}"`;
});
const boot = clips.length ? `<script>
(function () {
  var RAW = ${JSON.stringify(clips.map((c) => c.b64))};
  var urls = RAW.map(function (s) { var bin = atob(s), n = bin.length, a = new Uint8Array(n); for (var i = 0; i < n; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type: 'video/mp4' })); });
  document.querySelectorAll('[data-clip]').forEach(function (v) { v.setAttribute('data-src', urls[+v.dataset.clip]); });
  document.querySelectorAll('[data-clip-mobile]').forEach(function (v) { v.setAttribute('data-src-mobile', urls[+v.dataset.clipMobile]); });
})();
</script>` : '';
out = out
  .replace(/<script src="vendor\/(gsap|ScrollTrigger|ScrollSmoother|SplitText)\.min\.js"><\/script>/g, (m, f) => `<script src="${GSAP}${f}.min.js"></script>`)
  .replace('<script type="module" src="app.js"></script>', () => `${boot}\n<script type="module">\n${app}\n</script>`); // a function, because "$$" and "$'" in the script are replacement patterns to a string

const head = `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${read('site.css')}
</style>
`;
out = head + out;

const left = out.replace(/<!--[\s\S]*?-->/g, '').match(/(src|href)="(?!https:|data:|#|tel:|mailto:)[^"]+"/g);
if (left) console.warn('WARNING unresolved local references:', [...new Set(left)].join(', '));

const dest = path.join(HERE, 'artifact.html');
fs.writeFileSync(dest, out);
const mb = fs.statSync(dest).size / 1048576;
console.log(`${dest}  ${mb.toFixed(1)} MB  (${clips.length} clip(s) embedded)`);
if (mb > 15.5) console.warn('OVER the 16MB artifact limit.');
