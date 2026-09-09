// Al-Najaf Specialized Laboratory: page behaviour.
//
// In order: language; the two films (one scrubbed shot under the opening, one under the
// method chapter); the scroll score (GSAP ScrollTrigger and ScrollSmoother, one timeline per
// chapter); the dock; pointer interactions; the booking form; boot.

const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// A verification browser wants the frame a position resolves to, not the eased path there.
const AUTOMATED = !!navigator.webdriver;
const INSTANT = REDUCED || AUTOMATED;
const FINE = matchMedia('(pointer: fine)');
const PHONE = matchMedia('(max-width: 860px)');
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ramp = (v, a, b) => clamp01((v - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const dirSign = () => (html.dir === 'rtl' ? -1 : 1);

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);
gsap.defaults({ ease: 'power3.out' });
ScrollTrigger.config({ ignoreMobileResize: true });

// =============================================================================
// Language. One document carries both texts; only the active one is in the tree.
// =============================================================================
const LANG_KEY = 'najaf-lang';
const langBox = $('#lang');
const thumb = $('.lang__thumb');
function placeThumb() {
  const on = $('.lang__opt[aria-pressed="true"]');
  if (!on) return;
  const r = on.getBoundingClientRect(), b = langBox.getBoundingClientRect();
  thumb.style.setProperty('--w', r.width + 'px');
  thumb.style.setProperty('--x', (r.left - b.left - 3) + 'px');
}
function setLang(l, first = false) {
  html.lang = l;
  html.dir = l === 'ar' ? 'rtl' : 'ltr';
  $$('.lang__opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
  document.title = l === 'ar' ? 'مختبر النجف التخصصي' : 'Al-Najaf Specialized Laboratory';
  $$('#f-dept option').forEach((o) => { o.textContent = o.dataset[l] || o.textContent; });
  try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ }
  requestAnimationFrame(placeThumb);
  if (!first) buildScroll();
}
$$('.lang__opt').forEach((b) => b.addEventListener('click', () => { if (html.lang !== b.dataset.lang) setLang(b.dataset.lang); }));
addEventListener('resize', placeThumb);
(function initLang() {
  let l = null;
  try { l = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
  if (l !== 'en' && l !== 'ar') l = /^ar\b/i.test(navigator.language || '') ? 'ar' : 'en';
  setLang(l, true);
})();

// =============================================================================
// Smooth scroll and navigation.
// =============================================================================
let smoother = null;
if (!INSTANT) {
  try { smoother = ScrollSmoother.create({ smooth: 1.4, effects: false, smoothTouch: 0, normalizeScroll: false }); }
  catch (e) { smoother = null; }
}
const scrollTop = () => (smoother ? smoother.scrollTop() : (window.scrollY || 0));
function scrollToY(y) {
  if (smoother) { smoother.scrollTo(y, !INSTANT); return; }
  window.scrollTo({ top: y, behavior: INSTANT ? 'instant' : 'smooth' });
}
function scrollToEl(sel) {
  if (sel === '#top') return scrollToY(0);
  if (sel === '#lab') {
    // The lab copy lives inside the opening track; land where it has fully arrived.
    const track = $('#top');
    return scrollToY(Math.round((track.offsetHeight - innerHeight) * LAB_ARRIVED));
  }
  const el = $(sel); if (!el) return;
  if (smoother) { smoother.scrollTo(el, !INSTANT, 'top top'); return; }
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: INSTANT ? 'instant' : 'smooth' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-to]'); if (!a) return;
  e.preventDefault();
  if (a.dataset.dept) { const s = $('#f-dept'); if (s) s.value = a.dataset.dept; }
  scrollToEl(a.dataset.to);
  if (a.dataset.to === '#visit' && a.dataset.dept) setTimeout(() => $('#f-name')?.focus({ preventScroll: true }), INSTANT ? 0 : 1300);
});

// =============================================================================
// The films. Each is one clip under a chapter, fetched as a blob a viewport ahead, and
// scrubbed: the playhead follows the chapter's progress, eased a little so a fast wheel does
// not stutter. Dense keyframes in the encode make every seek land within a frame or two.
// =============================================================================
const makeFilm = (hostSel) => {
  const host = $(hostSel), video = host && host.querySelector('video');
  let ready = false, target = 0, current = 0, raf = 0, armed = false, loadedFor = '';
  const src = () => (PHONE.matches && video.dataset.srcMobile) || video.dataset.src;
  function load() {
    if (!video || REDUCED) return;
    const want = src(); if (!want || want === loadedFor) return; loadedFor = want; ready = false;
    fetch(want).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then((b) => {
      const prev = video.src; video.src = URL.createObjectURL(b); video.load();
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      video.addEventListener('loadedmetadata', () => {
        ready = true; host.classList.add('is-live'); host.closest('[data-sc-act]')?.classList.add('sc-has-clip');
        current = -1; step();
      }, { once: true });
    }).catch((e) => { loadedFor = ''; console.warn('film did not load', e); });
  }
  function step() {
    raf = 0;
    if (!ready || !video.duration) return;
    const t = target * Math.max(0, video.duration - 0.05);
    current = current < 0 ? t : (INSTANT ? t : lerp(current, t, 0.22));
    if (Math.abs(video.currentTime - current) > 0.02 && !video.seeking) { try { video.currentTime = current; } catch { /* not seekable yet */ } }
    if (Math.abs(current - t) > 0.005) raf = requestAnimationFrame(step);
  }
  return {
    load,
    arm(sel) {
      if (!video) return;
      // Created inside the score's context, so it is reverted with the score and re-armed on
      // every rebuild (a language switch, fonts settling). It retires itself once it has fired.
      if (!loadedFor) {
        const fire = (self) => { load(); self.kill(); };
        ScrollTrigger.create({ trigger: sel, start: 'top 200%', end: 'bottom top', onEnter: fire, onEnterBack: fire });
      }
      if (!armed) { armed = true; addEventListener('resize', () => { if (loadedFor && loadedFor !== src()) load(); }); }
    },
    seek(p) { target = clamp01(p); if (!loadedFor) load(); if (ready && !raf) raf = requestAnimationFrame(step); },
    get ready() { return ready; },
  };
};
if (REDUCED) $$('.film').forEach((f) => f.setAttribute('data-sc-verify-hold', 'reduced motion: the film is its poster'));
const labFilm = makeFilm('#labFilm');
const methodFilm = makeFilm('#methodFilm');
const dropFilm = makeFilm('#peopleFilm');
window.__films = { lab: labFilm, method: methodFilm, drop: dropFilm };

// =============================================================================
// The score. One gsap.context, rebuilt whole on a language switch because line
// splits, directions and measures all change together.
// =============================================================================
const LAB_ARRIVED = 0.62;     // fraction of the opening track where the lab copy has fully arrived
// What the verifier reads off a pinned frame: only the scroll-driven part of its state.
const verify = (el, state) => {
  if (!el) return;
  if (state === null) el.removeAttribute('data-sc-verify-state');
  else if (el.getAttribute('data-sc-verify-state') !== state) el.setAttribute('data-sc-verify-state', state);
};
let ctx = null, splits = [], mm = null;
const gutterPx = () => parseFloat(getComputedStyle(html).getPropertyValue('--gutter')) || 24;

function splitLines(section) {
  const h = $('[data-split]', section); if (!h) return [];
  const el = h.querySelector(`[lang="${html.lang}"]`); if (!el) return [];
  const s = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'line-in', aria: 'auto' });
  splits.push(s);
  return s.lines;
}

function buildScroll() {
  if (mm) mm.revert();
  if (ctx) ctx.revert();
  splits.forEach((s) => s.revert()); splits = [];
  $$('.chapter--tests').forEach((s) => { s.style.height = ''; });
  const dir = dirSign();
  const scrub = INSTANT ? true : 0.6;
  ctx = gsap.context(() => {
    // ---- 00 + 01 the opening track: the film walks in under the wheel; the title stands on
    // its first frames, steps aside, and the chapter copy arrives further down the same shot.
    {
      const track = $('#top'), hero = $('#hero'), labcopy = $('#lab');
      const heroLines = $$(`.hero__title .l[lang="${html.lang}"] .line`);
      const lines = splitLines(labcopy);
      const counters = $$('.num[data-count]', labcopy).map((el) => ({ el, to: parseFloat(el.dataset.count), dec: parseInt(el.dataset.dec || '0', 10), v: 0 }));
      labFilm.arm('#top'); labFilm.load();
      ScrollTrigger.create({ trigger: track, start: 'top top', end: 'bottom top', onUpdate: (s) => labFilm.seek(s.progress), onToggle: (s) => s.isActive && labFilm.seek(s.progress) });
      const tl = gsap.timeline({ scrollTrigger: {
        trigger: track, start: 'top top', end: 'bottom bottom', pin: '.lab__pin', pinSpacing: false, scrub, anticipatePin: 1,
        onUpdate: (s) => labcopy.classList.toggle('is-on', s.progress > 0.3),
        onToggle: (s) => labcopy.classList.toggle('is-on', s.isActive && s.progress > 0.3),
      } });
      // 0 to 1 is the whole travel. The hero holds for the first fifth, then steps aside.
      if (!REDUCED) {
        tl.to(heroLines[0], { xPercent: -10 * dir, ease: 'none', duration: 0.3 }, 0)
          .to(heroLines[1], { xPercent: 7 * dir, ease: 'none', duration: 0.3 }, 0)
          .to(heroLines[2], { xPercent: -4 * dir, ease: 'none', duration: 0.3 }, 0)
          .to('.scrollcue', { opacity: 0, ease: 'none', duration: 0.08 }, 0);
      }
      // A plate is in place before its copy shows and leaves only after the copy has gone,
      // so no frame ever has type on the bare film.
      tl.to(hero, { opacity: 0, y: REDUCED ? 0 : -50, ease: 'power2.in', duration: 0.1 }, 0.2)
        .to('.hero__eyebrow, .hero__title, .hero__foot, .lede, .cta', { opacity: 0, ease: 'power2.in', duration: 0.1 }, 0.2)
        .set(hero, { visibility: 'hidden', pointerEvents: 'none' }, 0.3)
        .to('.film__plate--hero', { opacity: 0, ease: 'none', duration: 0.06 }, 0.3)
        .set('.film__plate--head', { opacity: 1 }, 0.29)
        .from('#lab .chapter__head', { opacity: 0, duration: 0.04 }, 0.3)
        .from(lines, { yPercent: 110, stagger: 0.03, duration: 0.14 }, 0.32)
        .set('.film__plate--body', { opacity: 1 }, 0.4)
        .from('.lab__q', { opacity: 0, y: 24, duration: 0.1 }, 0.44)
        .from('.lab__body .prose', { opacity: 0, y: 18, duration: 0.1 }, 0.5)
        .from('.stats', { opacity: 0, y: 18, duration: 0.06 }, 0.62);
      counters.forEach((c, i) => {
        tl.to(c, { v: c.to, duration: 0.22, ease: 'power2.out', onUpdate: () => { c.el.textContent = c.v.toFixed(c.dec); } }, 0.62 + i * 0.015);
      });
      tl.to({}, { duration: 0.12 });
      // the dock: Home for the opening, Lab once the copy has arrived
      const travel = () => track.offsetHeight - innerHeight;
      const homeLink = $('.dock__item[href="#top"]'), labLink = $('.dock__item[href="#lab"]');
      if (homeLink) ScrollTrigger.create({ trigger: track, start: 'top top', end: () => '+=' + travel() * 0.3, toggleClass: { targets: homeLink, className: 'is-active' } });
      if (labLink) ScrollTrigger.create({ trigger: track, start: () => 'top+=' + travel() * 0.3 + ' top', end: 'bottom 50%', toggleClass: { targets: labLink, className: 'is-active' } });
    }

    // ---- 02 tests: the rail. Sideways under the wheel on desktop, under the thumb on a phone.
    mm = gsap.matchMedia();
    mm.add({ desk: '(min-width: 861px)', phone: '(max-width: 860px)' }, (c) => {
      const lines = splitLines($('#tests'));
      const section = $('#tests'), track = $('#railTrack');
      if (c.conditions.desk) {
        const dist = () => Math.max(0, track.scrollWidth - (innerWidth - gutterPx()));
        const size = () => { section.style.height = Math.round(innerHeight + dist() + innerHeight * 0.35) + 'px'; };
        size();
        ScrollTrigger.addEventListener('refreshInit', size);
        const tl = gsap.timeline({ scrollTrigger: {
          trigger: section, start: 'top top', end: 'bottom bottom', pin: '#tests .chapter__pin', pinSpacing: false, scrub, anticipatePin: 1, invalidateOnRefresh: true,
        } });
        tl.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.5 }, 0)
          .from('.tests__intro', { opacity: 0, y: 16, duration: 0.4 }, 0.3)
          .to(track, { x: () => -dist() * dir, ease: 'none', duration: 4 }, 0.5)
          .to({}, { duration: 0.4 });
        return () => { ScrollTrigger.removeEventListener('refreshInit', size); section.style.height = ''; };
      }
      gsap.set(track, { x: 0 });
      if (!INSTANT) gsap.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: section, start: 'top 75%', once: true } });
      return () => {};
    });

    // ---- 03 method: pinned, the peak. The drop falls in slow motion under the five steps.
    {
      const lines = splitLines($('#method'));
      const steps = $$('#steps .step'), peak = $('#peak');
      let cur = 0;
      const setStep = (p) => {
        const i = Math.min(4, Math.floor(ramp(p, 0.1, 0.92) * 5));
        if (i !== cur) { cur = i; steps.forEach((s, k) => s.classList.toggle('is-on', k === i)); }
        peak.style.opacity = (smooth(ramp(p, 0.60, 0.66)) * (1 - smooth(ramp(p, 0.79, 0.85)))).toFixed(3);
      };
      methodFilm.arm('#method');
      ScrollTrigger.create({ trigger: '#method', start: 'top bottom', end: 'bottom top', onUpdate: (s) => methodFilm.seek(s.progress), onToggle: (s) => s.isActive && methodFilm.seek(s.progress) });
      const tl = gsap.timeline({ scrollTrigger: {
        trigger: '#method', start: 'top top', end: 'bottom bottom', pin: '#method .chapter__pin', pinSpacing: false, scrub, anticipatePin: 1,
        onUpdate: (s) => setStep(s.progress), onToggle: (s) => s.isActive && setStep(s.progress),
      } });
      tl.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.5 }, 0)
        .from('.steps', { opacity: 0, y: 20, duration: 0.4 }, 0.2)
        .to({}, { duration: 4 });
    }

    // ---- 04 people: flowing. Rows and cards arrive as they enter, once.
    {
      const lines = splitLines($('#people'));
      dropFilm.arm('#people');
      ScrollTrigger.create({ trigger: '#peopleFilm', start: 'top bottom', end: 'bottom top', onUpdate: (s) => dropFilm.seek(s.progress), onToggle: (s) => s.isActive && dropFilm.seek(s.progress) });
      if (!INSTANT) {
        gsap.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: '#people', start: 'top 75%', once: true } });
        ScrollTrigger.batch('#people .inst__row, #people .person', { start: 'top 88%', once: true, onEnter: (els) => gsap.from(els, { opacity: 0, y: 22, stagger: 0.06, duration: 0.7, overwrite: true }) });
      }
    }

    // ---- 05 visit: flowing, and it holds.
    {
      const lines = splitLines($('#visit'));
      if (!INSTANT) {
        gsap.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: '#visit', start: 'top 75%', once: true } });
        gsap.from('#visit .contact__row', { opacity: 0, y: 18, stagger: 0.08, duration: 0.7, scrollTrigger: { trigger: '#visit .contact', start: 'top 85%', once: true } });
        gsap.from('#visit .book', { opacity: 0, y: 26, duration: 0.8, scrollTrigger: { trigger: '#visit .book', start: 'top 85%', once: true } });
      }
    }

    // ---- what the verifier reads: each pinned frame publishes its progress across its whole
    // visible life, so the walk in, the pinned travel and the release all read as motion.
    [['#top', '.lab__pin', 'open'], ['#tests', '#tests .chapter__pin', 'rail'], ['#method', '#method .chapter__pin', 'method']].forEach(([sec, frame, key]) => {
      ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'bottom top',
        onUpdate: (s) => verify($(frame), key + ':' + s.progress.toFixed(3)),
        onToggle: (s) => verify($(frame), s.isActive ? key + ':' + s.progress.toFixed(3) : null) });
    });

    // ---- the dock marks the chapter under the middle of the screen
    ['tests', 'method', 'people', 'visit'].forEach((id) => {
      const link = $(`.dock__item[href="#${id}"]`); if (!link) return;
      ScrollTrigger.create({ trigger: '#' + id, start: 'top 50%', end: 'bottom 50%', toggleClass: { targets: link, className: 'is-active' } });
    });
  });
  ScrollTrigger.refresh();
}

// =============================================================================
// The dock. Every item rests small; the one under the pointer grows and its neighbours
// follow it on a spring, and the panel makes room. A plain-code port of the framer-motion Dock.
// =============================================================================
(function dock() {
  const panel = $('#dockPanel'); if (!panel) return;
  const items = $$('.dock__item', panel);
  const BASE = 40, MAG = 76, DIST = 130, PANEL = 54;
  const spring = { mass: 0.1, stiffness: 170, damping: 10 };
  const springs = items.map(() => ({ x: BASE, v: 0, t: BASE }));
  const ph = { x: PANEL, v: 0, t: PANEL };
  let mouseX = Infinity, running = false, last = 0;
  // Semi-implicit Euler in 4ms substeps: the spring is stiff, and one step per frame goes
  // unstable on a slow frame, while clamping the frame time makes it run in slow motion.
  const H = 1 / 250;
  const step = (sp, dt) => {
    for (let n = Math.ceil(dt / H); n > 0; n--) {
      const a = (-spring.stiffness * (sp.x - sp.t) - spring.damping * sp.v) / spring.mass;
      sp.v += a * H; sp.x += sp.v * H;
    }
    if (Math.abs(sp.v) < 0.5 && Math.abs(sp.x - sp.t) < 0.3) { sp.x = sp.t; sp.v = 0; return false; }
    return true;
  };
  const tick = (now) => {
    const dt = Math.min(0.25, (now - last) / 1000 || 0.016); last = now;
    let live = false;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = mouseX === Infinity ? Infinity : mouseX - (r.left + r.width / 2);
      const k = Math.max(0, 1 - Math.abs(d) / DIST);
      springs[i].t = BASE + (MAG - BASE) * k * k;
      if (step(springs[i], dt)) live = true;
      el.style.setProperty('--w', springs[i].x.toFixed(2) + 'px');
    });
    ph.t = mouseX === Infinity ? PANEL : Math.max(PANEL, MAG + 14);
    if (step(ph, dt)) live = true;
    panel.style.setProperty('--dock-h', ph.x.toFixed(2) + 'px');
    running = live; if (live) requestAnimationFrame(tick);
  };
  const wake = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } };
  if (FINE.matches && !REDUCED) {
    panel.addEventListener('pointermove', (e) => { mouseX = e.clientX; wake(); });
    panel.addEventListener('pointerleave', () => { mouseX = Infinity; wake(); });
  }
  items.forEach((el) => { el.style.setProperty('--w', BASE + 'px'); });
  panel.style.setProperty('--dock-h', PANEL + 'px');
})();

// =============================================================================
// Pointer: magnetic controls, tilting cards, and the cursor. Fine pointers only.
// =============================================================================
if (FINE.matches && !REDUCED) {
  $$('[data-magnet]').forEach((el) => {
    const label = el.querySelector('.btn__l');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: dx * 0.22, y: dy * 0.22, duration: 0.5, overwrite: 'auto' });
      if (label) gsap.to(label, { x: dx * 0.08, y: dy * 0.08, duration: 0.5, overwrite: 'auto' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'power3.out', overwrite: 'auto' });
      if (label) gsap.to(label, { x: 0, y: 0, duration: 0.7, ease: 'power3.out', overwrite: 'auto' });
    });
  });
  $$('.card, .person').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotateY: px * 9, rotateX: -py * 9, transformPerspective: 900, duration: 0.5 });
    });
    el.addEventListener('pointerleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.9, ease: 'power3.out' }));
  });
  const cur = $('#cursor'), ring = $('.cursor__ring'), dot = $('.cursor__dot'), lab = $('.cursor__label');
  const pos = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  addEventListener('pointermove', (e) => {
    if (!html.classList.contains('has-cursor')) { html.classList.add('has-cursor'); pos.rx = e.clientX; pos.ry = e.clientY; }
    pos.x = e.clientX; pos.y = e.clientY;
    const h = e.target.closest?.('[data-hover]');
    cur.classList.toggle('is-hover', !!h && h.dataset.hover !== 'drag' && h.dataset.hover !== 'dock');
    cur.classList.toggle('is-drag', !!h && h.dataset.hover === 'drag');
    if (h && h.dataset.hover === 'drag') lab.textContent = html.lang === 'ar' ? 'مرّر' : 'Scroll';
  }, { passive: true });
  addEventListener('pointerleave', () => { cur.style.opacity = '0'; });
  addEventListener('pointerenter', () => { cur.style.opacity = '1'; });
  gsap.ticker.add(() => {
    pos.rx = lerp(pos.rx, pos.x, 0.18); pos.ry = lerp(pos.ry, pos.y, 0.18);
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px) ${cur.classList.contains('is-hover') ? 'scale(0.6)' : cur.classList.contains('is-drag') ? 'scale(0)' : ''}`;
    ring.style.left = pos.rx + 'px'; ring.style.top = pos.ry + 'px';
    lab.style.left = pos.rx + 'px'; lab.style.top = pos.ry + 'px';
  });
}

// =============================================================================
// Booking: compose the WhatsApp message. Nothing is stored anywhere.
// =============================================================================
const form = $('#booking');
const validators = {
  'f-name': { err: 'e-name', ok: (v) => v.length >= 2 },
  'f-phone': { err: 'e-phone', ok: (v) => v.replace(/[^\d+]/g, '').length >= 7 },
};
Object.entries(validators).forEach(([id, v]) => {
  $('#' + id).addEventListener('input', (e) => {
    if (v.ok(e.target.value.trim())) { e.target.closest('.field').classList.remove('is-bad'); $('#' + v.err).hidden = true; }
  });
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#f-name'), phone = $('#f-phone'), dept = $('#f-dept'), msg = $('#f-msg');
  let ok = true;
  const check = (input, errId, valid) => {
    const bad = !valid(input.value.trim());
    input.closest('.field').classList.toggle('is-bad', bad);
    $('#' + errId).hidden = !bad;
    if (bad && ok) { input.focus(); ok = false; }
  };
  check(name, 'e-name', validators['f-name'].ok);
  check(phone, 'e-phone', validators['f-phone'].ok);
  if (!ok) return;
  const ar = html.lang === 'ar';
  const test = dept.selectedOptions[0]?.textContent || '';
  const lines = ar
    ? [`مرحباً، أود حجز عينة.`, `الاسم: ${name.value.trim()}`, `الهاتف: ${phone.value.trim()}`, `الفحص: ${test}`, msg.value.trim() ? `ملاحظة: ${msg.value.trim()}` : null]
    : [`Hello, I would like to book a sample.`, `Name: ${name.value.trim()}`, `Phone: ${phone.value.trim()}`, `Test: ${test}`, msg.value.trim() ? `Note: ${msg.value.trim()}` : null];
  const url = 'https://wa.me/9647809422636?text=' + encodeURIComponent(lines.filter(Boolean).join('\n'));
  window.open(url, '_blank', 'noopener');
});

// =============================================================================
// Boot: the score waits for the faces it measures, with a ceiling so a slow font never
// holds the page.
// =============================================================================
let booted = false;
function boot() {
  if (booted) return; booted = true;
  buildScroll(); placeThumb();
  html.classList.add('sc-ready');
  if (document.fonts.status !== 'loaded') document.fonts.ready.then(() => buildScroll());
}
const FACES = ['800 1em Archivo', '800 1em Cairo', '500 1em "Instrument Sans"', '500 1em "IBM Plex Sans Arabic"', '400 1em "Geist Mono"'];
const fontsSettled = () => new Promise((res) => { if (document.fonts.status === 'loaded') res(); else document.fonts.addEventListener('loadingdone', () => res(), { once: true }); });
Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready).then(fontsSettled).then(() => requestAnimationFrame(boot));
setTimeout(boot, 2500);
addEventListener('load', () => { boot(); ScrollTrigger.refresh(); });
