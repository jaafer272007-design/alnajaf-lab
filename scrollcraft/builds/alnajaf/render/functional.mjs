#!/usr/bin/env node
// Exercise the controls the way a visitor does, in a browser that does NOT announce automation,
// so the smooth scroller, the magnets and the tilt all run as they would for a person.
//   node render/functional.mjs [--url http://localhost:4700]
import { chromium } from 'playwright-core';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const URL = arg('--url', 'http://localhost:4700');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-blink-features=AutomationControlled'] });
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const errors = [];

// ScrollSmoother glides the content toward the native scroll position for about a second after
// any jump (a click on the index, the browser scrolling a focused field into view). Measuring a
// control mid-glide gives a stale box, so wait for the content to stop moving first.
const settle = async (page) => { let last = null; for (let i = 0; i < 40; i++) { const t = await page.evaluate(() => document.querySelector('#smooth-content').style.transform || scrollY); if (t === last) return; last = t; await page.waitForTimeout(120); } };

// ---------------- desktop ----------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push('desktop pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('desktop console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html.sc-ready'); await page.waitForTimeout(1200);
  check('automation not announced', await page.evaluate(() => navigator.webdriver === false));
  check('smooth scroller active', await page.evaluate(() => !!document.querySelector('#smooth-content').style.transform || getComputedStyle(document.querySelector('#smooth-wrapper')).position === 'fixed'));
  check('webgl world running', await page.evaluate(() => !document.documentElement.classList.contains('no-webgl') && !!window.__world));
  check('cursor hidden before pointer moves', await page.evaluate(() => !document.documentElement.classList.contains('has-cursor')));
  await page.mouse.move(700, 450); await page.waitForTimeout(100);
  check('cursor appears after pointer moves', await page.evaluate(() => document.documentElement.classList.contains('has-cursor')));

  // language switch
  await page.click('.lang__opt[data-lang="ar"]'); await page.waitForTimeout(600);
  check('arabic switch sets lang/dir', await page.evaluate(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl'));
  check('arabic title visible, english hidden', await page.evaluate(() => { const ar = document.querySelector('.hero__title .l[lang="ar"]'), en = document.querySelector('.hero__title .l[lang="en"]'); return getComputedStyle(ar).display !== 'none' && getComputedStyle(en).display === 'none'; }));
  check('thumb moved to arabic', await page.evaluate(() => { const t = document.querySelector('.lang__thumb').getBoundingClientRect(), b = document.querySelector('.lang__opt[data-lang="ar"]').getBoundingClientRect(); return Math.abs(t.left - b.left) < 3; }));
  check('select options in arabic', await page.evaluate(() => /[؀-ۿ]/.test(document.querySelector('#f-dept option[value="pcr"]').textContent)));
  await page.click('.lang__opt[data-lang="en"]'); await page.waitForTimeout(600);
  check('back to english', await page.evaluate(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr'));
  check('language persisted', await page.evaluate(() => localStorage.getItem('najaf-lang') === 'en'));

  // index navigation through the smoother
  await page.click('.index a[href="#method"]'); await page.waitForTimeout(2200); await settle(page);
  const m = await page.evaluate(() => { const r = document.querySelector('#method .chapter__pin').getBoundingClientRect(); return { top: Math.round(r.top), night: getComputedStyle(document.documentElement).getPropertyValue('--g').trim() }; });
  check('index link lands on the method chapter', Math.abs(m.top) < 4, `pin top ${m.top}px, ground ${m.night}`);
  check('method chapter is night', /^(#0a0e17|rgba?\(10, ?14, ?23(, ?1)?\))$/.test(m.night), m.night);
  check('index marks the active chapter', await page.evaluate(() => document.querySelector('.index a[href="#method"]').classList.contains('is-active')));

  // hover: tilt and magnet
  await page.click('.index a[href="#tests"]'); await page.waitForTimeout(2200);
  const card = await page.$('.card[data-dept="chem"]'); const cb = await card.boundingBox();
  await page.mouse.move(cb.x + cb.width * 0.85, cb.y + cb.height * 0.2); await page.waitForTimeout(500);
  check('card tilts under the pointer', await page.evaluate(() => /matrix3d/.test(getComputedStyle(document.querySelector('.card[data-dept="chem"]')).transform)));
  check('cursor reads Scroll over the rail', await page.evaluate(() => document.querySelector('#cursor').classList.contains('is-drag') && document.querySelector('.cursor__label').textContent === 'Scroll'));
  await page.click('.index a[href="#top"]').catch(() => {});
  await page.click('.brand'); await page.waitForTimeout(1500); await settle(page);
  const btn = await page.$('.hero .btn--ink'); const bb = await btn.boundingBox();
  await page.mouse.move(bb.x + bb.width - 6, bb.y + 4); await page.waitForTimeout(500);
  const mag = await page.evaluate(() => getComputedStyle(document.querySelector('.hero .btn--ink')).transform);
  check('button is magnetic', mag !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(mag), mag);

  // the rail travels far enough that the last card arrives fully in view at the pin's end
  await page.evaluate(() => { const s = document.querySelector('#tests'); scrollTo({ top: s.getBoundingClientRect().top + scrollY + s.offsetHeight - innerHeight, behavior: 'instant' }); });
  await page.waitForTimeout(2500);
  const lastCard = await page.evaluate(() => { const r = document.querySelector('.card--home').getBoundingClientRect(); return { right: Math.round(r.right), vw: innerWidth }; });
  check('rail ends with the last card in view', lastCard.right <= lastCard.vw && lastCard.right > lastCard.vw * 0.5, `right edge ${lastCard.right} of ${lastCard.vw}`);
  // card "Book" carries the department into the form
  await settle(page); await page.click('.card[data-dept="home"] .card__go'); await page.waitForTimeout(2200); await settle(page);
  check('card Book presets the test', await page.evaluate(() => document.querySelector('#f-dept').value === 'home'));
  const v = await page.evaluate(() => Math.round(document.querySelector('#visit').getBoundingClientRect().top));
  check('and scrolls to the booking chapter', Math.abs(v) < 4, `visit top ${v}px`);

  // the form composes a WhatsApp message and opens it
  await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; });
  // Click where the button is, the way a person does: hover, let the magnet settle, press.
  const press = async (sel) => { await settle(page); const b = await (await page.$(sel)).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); const c = await (await page.$(sel)).boundingBox(); await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2); };
  await press('#booking button[type="submit"]'); await page.waitForTimeout(200);
  check('empty form is refused with a message', await page.evaluate(() => !document.querySelector('#e-name').hidden && window.__opened === null));
  await page.fill('#f-name', 'Test Person'); await page.fill('#f-phone', '+964 770 000 0000'); await page.fill('#f-msg', 'Fasting');
  await page.waitForTimeout(800); await press('#booking button[type="submit"]'); await page.waitForTimeout(300);
  const opened = await page.evaluate(() => window.__opened);
  check('WhatsApp URL composed', !!opened && opened.startsWith('https://wa.me/9647809422636?text='), opened ? decodeURIComponent(opened.split('text=')[1]).replace(/\n/g, ' | ') : 'none');
  check('message carries name, phone, test, note', !!opened && /Test%20Person/.test(opened) && /770/.test(opened) && /Home%20sample/.test(opened) && /Fasting/.test(opened));

  // keyboard: tab reaches the controls in order, on a fresh load
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('html.sc-ready'); await page.waitForTimeout(800);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Tab');
  const second = await page.evaluate(() => document.activeElement.className);
  check('tab order: skip link, then the brand', first === 'skip' && second === 'brand', `${first} > ${second}`);
  await page.evaluate(() => document.querySelector('.skip').focus()); await page.waitForTimeout(400);
  check('skip link becomes visible on focus', await page.evaluate(() => document.querySelector('.skip').getBoundingClientRect().top >= 0));
  await page.close();
}

// ---------------- phone ----------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => errors.push('phone pageerror: ' + e));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html.sc-ready'); await page.waitForTimeout(1200);
  check('phone hides the index and shows the burger', await page.evaluate(() => getComputedStyle(document.querySelector('.index')).display === 'none' && getComputedStyle(document.querySelector('#burger')).display !== 'none'));
  await page.click('#burger'); await page.waitForTimeout(300);
  check('burger opens the menu', await page.evaluate(() => !document.querySelector('#menu').hidden && document.querySelector('#burger').getAttribute('aria-expanded') === 'true'));
  await page.click('#menu a[href="#method"]'); await page.waitForTimeout(2200);
  check('menu link closes the menu and lands', await page.evaluate(() => document.querySelector('#menu').hidden && Math.abs(document.querySelector('#method .chapter__pin').getBoundingClientRect().top) < 4));
  await page.click('#burger'); await page.waitForTimeout(200); await page.click('#menu a[href="#tests"]'); await page.waitForTimeout(2200);
  check('phone rail scrolls sideways natively', await page.evaluate(() => { const r = document.querySelector('#rail'); return getComputedStyle(r).overflowX === 'auto' && r.scrollWidth > r.clientWidth; }));
  check('no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const small = await page.evaluate(() => [...document.querySelectorAll('.btn, .lang__opt, #burger, .card__go, a.contact__row, .foot__top, .scrollcue')].filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 32).map((el) => el.className + ' ' + Math.round(el.getBoundingClientRect().height)));
  check('touch targets at least 32px tall', small.length === 0, small.join(', '));
  await page.close();
}

// ---------------- no WebGL, no JS fallbacks ----------------
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('html.sc-ready'); await page.waitForTimeout(800);
  check('without WebGL the stage hides and the page stands', await page.evaluate(() => document.documentElement.classList.contains('no-webgl') && getComputedStyle(document.querySelector('#stage')).display === 'none' && document.querySelector('.hero__title').getBoundingClientRect().height > 100));
  await page.close();
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 800 } });
  const p2 = await ctx.newPage(); await p2.goto(URL, { waitUntil: 'load' });
  check('without JavaScript every chapter is readable in order', await p2.evaluate(() => { const ids = ['top', 'lab', 'tests', 'method', 'people', 'visit']; let last = -1; return ids.every((id) => { const r = document.getElementById(id).getBoundingClientRect(); const ok = r.top + scrollY > last && r.height > 50; last = r.top + scrollY; return ok; }); }));
  check('without JavaScript both languages are not shown at once', await p2.evaluate(() => getComputedStyle(document.querySelector('.hero__title .l[lang="ar"]')).display === 'none'));
  await ctx.close();
}

if (errors.length) { console.log('\nERRORS:'); errors.forEach((e) => console.log('  ' + e)); fails += errors.length; }
console.log(`\n${fails ? fails + ' problem(s)' : 'all checks passed'}`);
await browser.close();
process.exit(fails ? 1 : 0);
