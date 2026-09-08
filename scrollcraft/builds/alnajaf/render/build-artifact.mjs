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

let out = body
  .replace(/<script src="vendor\/(gsap|ScrollTrigger|ScrollSmoother|SplitText)\.min\.js"><\/script>/g, (m, f) => `<script src="${GSAP}${f}.min.js"></script>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${app}\n</script>`); // a function, because "$$" and "$'" in the script are replacement patterns to a string

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
console.log(`${dest}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
