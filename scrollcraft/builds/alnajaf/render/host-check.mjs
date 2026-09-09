#!/usr/bin/env node
// The artifact as claude.ai serves it: the body wrapped in the host skeleton, GSAP from the CDN.
// This container's browser cannot reach cdnjs, so those four scripts are answered from vendor/;
// everything else (inlined CSS and JS, posters, clips decoded from base64 into blobs) is the real build.
//   node render/host-check.mjs [--w 1440 --h 900] [--lang ar]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const W = +arg('--w', 1440), H = +arg('--h', 900), LANG = arg('--lang', 'en');
const here = path.dirname(new URL(import.meta.url).pathname), root = path.join(here, '..');
const body = fs.readFileSync(path.join(here, 'artifact.html'), 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
fs.mkdirSync(path.join(root, 'lab/host'), { recursive: true });
fs.writeFileSync(path.join(root, 'lab/host/index.html'), html);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const log = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => log.push('pageerror: ' + e));
await page.route('https://cdnjs.cloudflare.com/**', (route) => {
  const file = path.join(root, 'vendor', path.basename(new URL(route.request().url()).pathname));
  if (fs.existsSync(file)) route.fulfill({ path: file, contentType: 'application/javascript' }); else route.abort();
});
await page.addInitScript((l) => { try { localStorage.setItem('najaf-lang', l); } catch {} }, LANG);
const t0 = Date.now();
await page.goto('http://localhost:4700/lab/host/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('html.sc-ready', { timeout: 90000 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s, lang=${LANG}, ${W}x${H}`);
await page.waitForTimeout(1500);
const max = await page.evaluate(() => document.body.scrollHeight - innerHeight);
for (const s of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.round(max * s));
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => [...document.querySelectorAll('.film')].map((f) => { const v = f.querySelector('video'); return f.id + (f.classList.contains('is-live') ? '@' + v.currentTime.toFixed(2) : ':poster'); }).join(' '));
  await page.screenshot({ path: path.join(root, `lab/host/${String(Math.round(s * 100)).padStart(3, '0')}.png`) });
  console.log(`  ${(s * 100).toFixed(0).padStart(3)}%  ${st}`);
}
const bad = [...new Set(log)].filter((l) => !/SplitText called before fonts|blob:/.test(l));
console.log(bad.length ? 'CONSOLE:\n  ' + bad.join('\n  ') : 'no console errors');
await browser.close();
