#!/usr/bin/env node
// Drives world.html in headless Chrome and writes frames, then assembles clips.
//   node render.mjs --preview                      # 5 frames per leg at 960x540 -> render/preview/
//   node render.mjs --w 1920 --h 1080 --fps 25     # full render -> render/frames/<leg>/, out/<leg>.mp4
//   node render.mjs --legs 4,5 ...                 # subset
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const has = (n) => args.includes(`--${n}`);
const PREVIEW = has('preview');
const W = +flag('w', PREVIEW ? 960 : 1920), H = +flag('h', PREVIEW ? 540 : 1080);
const FPS = +flag('fps', 25);
const ONLY = flag('legs', null) ? flag('legs').split(',').map(Number) : null;
const TAG = flag('tag', H > W ? 'p' : 'l');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../../../..');   // repo root, so /node_modules resolves
const PORT = 4710 + (H > W ? 1 : 0) + (PREVIEW ? 5 : 0);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:${PORT}/scrollcraft/builds/alnajaf/render/world.html?w=${W}&h=${H}`);
await page.waitForFunction(() => window.worldReady === true, null, { timeout: 120000 });
const legs = await page.evaluate(() => window.LEGS);
console.log(`world ready: ${legs.map((l) => l.name).join(' > ')}  ${W}x${H} @${FPS}fps`);

const outDir = PREVIEW ? path.join(HERE, 'preview') : path.join(HERE, 'frames');
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now(); let done = 0;

for (let li = 0; li < legs.length; li++) {
  if (ONLY && !ONLY.includes(li)) continue;
  const leg = legs[li];
  const n = PREVIEW ? 5 : Math.round(leg.seconds * FPS);
  const dir = path.join(outDir, `${li}-${leg.name}-${TAG}`); fs.mkdirSync(dir, { recursive: true });
  for (let f = 0; f < n; f++) {
    const t = n === 1 ? 0 : f / (n - 1);
    const dataUrl = await page.evaluate(([i, tt]) => window.renderFrame(i, tt), [li, t]);
    fs.writeFileSync(path.join(dir, `${String(f).padStart(4, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    done++;
    if (f % 25 === 0 || f === n - 1) { const el = (Date.now() - t0) / 1000; process.stdout.write(`  ${leg.name} ${f + 1}/${n}  ${el.toFixed(0)}s  ${(el / done).toFixed(2)}s/frame\n`); }
  }
  if (!PREVIEW) {
    const out = path.join(HERE, '..', 'out', `${li}-${leg.name}-${TAG}.mp4`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, '%04d.png'), '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', out]);
    console.log(`  wrote ${out}`);
  }
}
await browser.close(); server.close();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
