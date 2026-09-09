#!/usr/bin/env node
// A quick look: screenshots at a set of scroll positions and viewports, plus console errors.
//   node render/look.mjs --url http://localhost:4700 --out lab/look [--w 1440 --h 900] [--lang ar] [--reduced]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:4700'), OUT = arg('--out', 'lab/look');
const W = +arg('--w', 1440), H = +arg('--h', 900), LANG = arg('--lang', 'en');
const REDUCED = argv.includes('--reduced');
const STOPS = (arg('--stops', '0,0.06,0.12,0.18,0.24,0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84,0.9,0.96,1')).split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
await page.addInitScript((l) => { try { localStorage.setItem('najaf-lang', l); } catch {} }, LANG);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('html.sc-ready', { timeout: 90000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);
const info = await page.evaluate(() => ({ h: document.body.scrollHeight, vh: innerHeight }));
console.log(`page ${W}x${H} lang=${LANG} height=${info.h} (${(info.h / info.vh).toFixed(1)}vh)`);
const max = info.h - info.vh;
for (let i = 0; i < STOPS.length; i++) {
  const y = Math.round(max * STOPS[i]);
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
  await page.waitForTimeout(350);
  const st = await page.evaluate(() => [...document.querySelectorAll('.film')].map((f) => { const v = f.querySelector('video'); return f.id + (f.classList.contains('is-live') ? '@' + v.currentTime.toFixed(2) : ':poster'); }).join(' '));
  await page.screenshot({ path: path.join(OUT, `${String(i).padStart(2, '0')}.png`) });
  console.log(`  ${String(i).padStart(2, '0')}  y=${y}  ${st}`);
}
if (errors.length) { console.log('\nCONSOLE:'); [...new Set(errors)].slice(0, 20).forEach((e) => console.log('  ' + e)); } else console.log('\nno console errors');
await browser.close();
