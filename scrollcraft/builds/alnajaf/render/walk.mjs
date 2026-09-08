#!/usr/bin/env node
// A walkthrough film: the page scrolled top to bottom at a steady pace, one frame per position.
// Recorded in the automation profile (no smoothing, instant scrubs), so every frame is exact.
//   node render/walk.mjs --out lab/walk-desktop.mp4 [--w 1440 --h 900 --dpr 1 --frames 300 --lang ar]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:4700'), OUT = arg('--out', 'lab/walk.mp4');
const W = +arg('--w', 1440), H = +arg('--h', 900), DPR = +arg('--dpr', 1), N = +arg('--frames', 300), LANG = arg('--lang', 'en');
const dir = OUT.replace(/\.mp4$/, '-frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
await page.addInitScript((l) => { try { localStorage.setItem('najaf-lang', l); } catch {} }, LANG);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('html.sc-ready'); await page.waitForTimeout(1200);
const max = await page.evaluate(() => document.body.scrollHeight - innerHeight);
const ease = (t) => t; // steady: the film is the scroll, not a performance of it
let f = 0;
const shot = async () => { await page.screenshot({ path: path.join(dir, `${String(f++).padStart(4, '0')}.png`) }); };
for (let i = 0; i < 30; i++) await shot();                       // hold the opening for a second
for (let i = 0; i <= N; i++) {
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.round(max * ease(i / N)));
  await page.waitForTimeout(40);
  await shot();
}
for (let i = 0; i < 45; i++) await shot();                       // and hold the close
await browser.close();
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', OUT]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${OUT}  ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB  ${f} frames`);
