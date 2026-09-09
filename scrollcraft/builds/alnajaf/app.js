// Al-Najaf Specialized Laboratory: page behaviour.
//
// Four things live here, in order: language; the scroll score (GSAP ScrollTrigger and
// ScrollSmoother, one timeline per chapter); pointer interactions (magnet, tilt, cursor);
// and the world, one live three.js object behind the whole page, driven by the same
// chapter progress the score reads. Nothing on the page is a video.

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
  try { smoother = ScrollSmoother.create({ smooth: 1.1, effects: false, smoothTouch: 0, normalizeScroll: false }); }
  catch (e) { smoother = null; }
}
const scrollTop = () => (smoother ? smoother.scrollTop() : (window.scrollY || 0));
function scrollToEl(sel) {
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
  if (a.dataset.to === '#visit' && a.dataset.dept) setTimeout(() => $('#f-name')?.focus({ preventScroll: true }), INSTANT ? 0 : 1100);
});

// =============================================================================
// The world's interface. The scene fills it in once three.js has loaded; until then
// the calls are cheap no-ops, so the score never waits on the 3D layer.
// =============================================================================
const world = { chapter: 'top', p: 0, night: 0, set(ch, p) { this.chapter = ch; this.p = p; this.dirty = true; }, dirty: true };

// =============================================================================
// The film. One clip under chapter 01, fetched only when the chapter is near, and scrubbed:
// the playhead follows the chapter's progress, eased a little so a fast wheel does not stutter.
// Encoded with a dense keyframe interval, so a seek lands within a frame or two.
// =============================================================================
const makeFilm = (hostSel) => {
  const host = $(hostSel), video = host && host.querySelector('video');
  let ready = false, target = 0, current = 0, raf = 0, armed = false;
  const src = () => (PHONE.matches && video.dataset.srcMobile) || video.dataset.src;
  // Fetched whole and handed to the element as a blob: a scrubbed clip is seeked all over, and
  // a same-origin blob seeks without range requests, which not every host answers well.
  let loadedFor = '';
  function load() {
    if (!video || REDUCED) return;
    const want = src(); if (want === loadedFor) return; loadedFor = want; ready = false;
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
    current = current < 0 ? t : (INSTANT ? t : lerp(current, t, 0.2));
    if (Math.abs(video.currentTime - current) > 0.02 && !video.seeking) { try { video.currentTime = current; } catch { /* not seekable yet */ } }
    if (Math.abs(current - t) > 0.005) raf = requestAnimationFrame(step);
  }
  return {
    arm(sel) {
      if (!video) return;
      // Fetch when the chapter is a viewport away; a reader who never scrolls never pays for it.
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
const film = makeFilm('#labFilm');
const dropFilm = makeFilm('#peopleFilm');
window.__films = { lab: film, drop: dropFilm };

// =============================================================================
// The score. One gsap.context, rebuilt whole on a language switch because line
// splits, directions and measures all change together.
// =============================================================================
let ctx = null, splits = [], mm = null;
const NIGHT = { '--g': '#0a0e17', '--g2': '#10162a', '--surface': '#141b2c', '--line': 'rgba(242, 243, 241, 0.16)', '--ink': '#f2f3f1', '--ink2': '#aab2bf', '--ink3': '#6d7684', '--accent': '#ff5f52', '--shadow': '0, 0, 0' };
const PAPER = { '--g': '#f3f4f2', '--g2': '#e8ebe8', '--surface': '#fbfbfa', '--line': 'rgba(18, 22, 27, 0.14)', '--ink': '#12161b', '--ink2': '#566069', '--ink3': '#8a939b', '--accent': '#c92b23', '--shadow': '18, 22, 27' };
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
  const scrub = INSTANT ? true : 0.5;
  ctx = gsap.context(() => {
    // ---- 00 hero: the lines slide apart at their own speeds as the page leaves them
    const heroLines = $$(`.hero__title .l[lang="${html.lang}"] .line`);
    if (!REDUCED) {
      gsap.timeline({ scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom top', scrub } })
        .to(heroLines[0], { xPercent: -16 * dir, ease: 'none' }, 0)
        .to(heroLines[1], { xPercent: 10 * dir, ease: 'none' }, 0)
        .to(heroLines[2], { xPercent: -6 * dir, ease: 'none' }, 0)
        .to('.hero__eyebrow', { opacity: 0, y: -16, ease: 'none' }, 0)
        .to('.scrollcue', { opacity: 0, ease: 'none' }, 0)
        .to('.hero__foot', { opacity: 0, y: 24, ease: 'none' }, 0.25);
    }
    ScrollTrigger.create({ trigger: '#top', start: 'top top', end: 'bottom top', onUpdate: (s) => world.set('top', s.progress), onToggle: (s) => s.isActive && world.set('top', s.progress) });

    // ---- 01 lab: pinned. The film scrubs under the wheel; title lines rise, the question lands, the figures count.
    {
      const lines = splitLines($('#lab'));
      film.arm('#lab');
      // The playhead maps across the chapter's whole visible life, sliding in and sliding out
      // included, so the film is never a still while the page moves.
      ScrollTrigger.create({ trigger: '#lab', start: 'top bottom', end: 'bottom top', onUpdate: (s) => film.seek(s.progress), onToggle: (s) => s.isActive && film.seek(s.progress) });
      const counters = $$('#lab .num[data-count]').map((el) => ({ el, to: parseFloat(el.dataset.count), dec: parseInt(el.dataset.dec || '0', 10), v: 0 }));
      const tl = gsap.timeline({ scrollTrigger: {
        trigger: '#lab', start: 'top top', end: 'bottom bottom', pin: '#lab .chapter__pin', pinSpacing: false, scrub, anticipatePin: 1,
        onUpdate: (s) => world.set('lab', s.progress), onToggle: (s) => s.isActive && world.set('lab', s.progress),
      } });
      tl.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.6 }, 0)
        .from('.lab__q', { opacity: 0, y: 24, duration: 0.45 }, 0.4)
        .from('.lab__body .prose', { opacity: 0, y: 18, duration: 0.45 }, 0.6)
        .from('.stats', { opacity: 0, y: 18, duration: 0.35 }, 0.85);
      counters.forEach((c, i) => {
        tl.to(c, { v: c.to, duration: 0.9, ease: 'power2.out', onUpdate: () => { c.el.textContent = c.v.toFixed(c.dec); } }, 0.95 + i * 0.05);
      });
      tl.to({}, { duration: 0.5 });
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
          onUpdate: (s) => world.set('tests', s.progress), onToggle: (s) => s.isActive && world.set('tests', s.progress),
        } });
        tl.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.5 }, 0)
          .from('.tests__intro', { opacity: 0, y: 16, duration: 0.4 }, 0.3)
          .to(track, { x: () => -dist() * dir, ease: 'none', duration: 4 }, 0.5)
          .to({}, { duration: 0.4 });
        return () => { ScrollTrigger.removeEventListener('refreshInit', size); section.style.height = ''; };
      }
      gsap.set(track, { x: 0 });
      ScrollTrigger.create({ trigger: section, start: 'top 70%', end: 'bottom 30%', onUpdate: (s) => world.set('tests', s.progress), onToggle: (s) => s.isActive && world.set('tests', s.progress) });
      if (!INSTANT) gsap.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: section, start: 'top 75%', once: true } });
      return () => {};
    });

    // ---- 03 method: pinned, the peak. The ground goes to night on the way in and back on the way out.
    {
      const lines = splitLines($('#method'));
      const steps = $$('#steps .step'), peak = $('#peak');
      let cur = 0;
      const setStep = (p) => {
        const i = Math.min(4, Math.floor(ramp(p, 0.1, 0.92) * 5));
        if (i !== cur) { cur = i; steps.forEach((s, k) => s.classList.toggle('is-on', k === i)); }
        peak.style.opacity = (smooth(ramp(p, 0.60, 0.66)) * (1 - smooth(ramp(p, 0.79, 0.85)))).toFixed(3);
      };
      const tl = gsap.timeline({ scrollTrigger: {
        trigger: '#method', start: 'top top', end: 'bottom bottom', pin: '#method .chapter__pin', pinSpacing: false, scrub, anticipatePin: 1,
        onUpdate: (s) => { world.set('method', s.progress); setStep(s.progress); },
        onToggle: (s) => { if (s.isActive) { world.set('method', s.progress); setStep(s.progress); } },
      } });
      tl.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.5 }, 0)
        .from('.steps', { opacity: 0, y: 20, duration: 0.4 }, 0.2)
        .to({}, { duration: 4 });
      // The ground eases through the transition; the ink flips at its midpoint. Tweening both
      // linearly meets in the middle at grey-on-grey, and the copy vanishes for a screen of scroll.
      const GROUND = ['--g', '--g2', '--surface', '--shadow'], INK = ['--ink', '--ink2', '--ink3', '--line', '--accent'];
      const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
      const crossfade = (trigger, start, end, from, to, nightOf) => {
        const st = { trigger, start, end, scrub };
        gsap.fromTo(html, pick(from, GROUND), { ...pick(to, GROUND), ease: 'power3.inOut', immediateRender: false, scrollTrigger: { ...st, onUpdate: (s) => { world.night = nightOf(s.progress); } } });
        gsap.fromTo(html, pick(from, INK), { ...pick(to, INK), ease: 'steps(1)', immediateRender: false, scrollTrigger: st });
      };
      crossfade('#method', 'top 85%', 'top 15%', PAPER, NIGHT, (p) => p);
      crossfade('#people', 'top 95%', 'top 40%', NIGHT, PAPER, (p) => 1 - p);
    }

    // ---- 04 people: flowing. Rows and cards arrive as they enter, once.
    {
      const lines = splitLines($('#people'));
      ScrollTrigger.create({ trigger: '#people', start: 'top 65%', end: 'bottom 35%', onUpdate: (s) => world.set('people', s.progress), onToggle: (s) => s.isActive && world.set('people', s.progress) });
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
      ScrollTrigger.create({ trigger: '#visit', start: 'top 70%', end: 'bottom bottom', onUpdate: (s) => world.set('visit', s.progress), onToggle: (s) => s.isActive && world.set('visit', s.progress) });
      if (!INSTANT) {
        gsap.from(lines, { yPercent: 110, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: '#visit', start: 'top 75%', once: true } });
        gsap.from('#visit .contact__row', { opacity: 0, y: 18, stagger: 0.08, duration: 0.7, scrollTrigger: { trigger: '#visit .contact', start: 'top 85%', once: true } });
        gsap.from('#visit .book', { opacity: 0, y: 26, duration: 0.8, scrollTrigger: { trigger: '#visit .book', start: 'top 85%', once: true } });
      }
    }

    // ---- the dock marks the chapter under the middle of the screen
    ['top', 'lab', 'tests', 'method', 'people', 'visit'].forEach((id) => {
      const link = $(`.dock__item[href="#${id}"]`); if (!link) return;
      ScrollTrigger.create({ trigger: '#' + id, start: 'top 50%', end: 'bottom 50%', toggleClass: { targets: link, className: 'is-active' } });
    });
  });
  ScrollTrigger.refresh();
}

// =============================================================================
// The dock. Each item's width follows the pointer's distance on a spring, and the panel makes
// room. A port of the framer-motion Dock (mass 0.1, stiffness 150, damping 12) to plain code.
// =============================================================================
(function dock() {
  const panel = $('#dockPanel'); if (!panel) return;
  const items = $$('.dock__item', panel);
  const BASE = 40, MAG = 68, DIST = 140, PANEL = 54;
  const spring = { mass: 0.1, stiffness: 150, damping: 12 };
  const springs = items.map(() => ({ x: BASE, v: 0, t: BASE }));
  const ph = { x: PANEL, v: 0, t: PANEL };
  let mouseX = Infinity, running = false, last = 0;
  // Integrated in small fixed substeps: at this stiffness a whole slow frame in one Euler step
  // overshoots and rings instead of settling.
  const H = 1 / 240;
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
      springs[i].t = BASE + (MAG - BASE) * k;
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
  // magnet
  $$('[data-magnet]').forEach((el) => {
    const label = el.querySelector('.btn__l');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: dx * 0.22, y: dy * 0.22, duration: 0.5, overwrite: 'auto' });
      if (label) gsap.to(label, { x: dx * 0.08, y: dy * 0.08, duration: 0.5, overwrite: 'auto' });
    });
    el.addEventListener('pointerleave', () => {
      // A soft return, not a spring: a control that swings back past its rest position can
      // swing out from under a pointer that is on its way back to it.
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.9)', overwrite: 'auto' });
      if (label) gsap.to(label, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.9)', overwrite: 'auto' });
    });
  });
  // tilt
  $$('.card, .person').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotateY: px * 9, rotateX: -py * 9, transformPerspective: 900, duration: 0.5 });
    });
    el.addEventListener('pointerleave', () => gsap.to(el, { rotateY: 0, rotateX: 0, duration: 0.9, ease: 'power3.out' }));
  });
  // cursor
  const cur = $('#cursor'), ring = $('.cursor__ring'), dot = $('.cursor__dot'), lab = $('.cursor__label');
  const pos = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
  // The cursor exists only once a pointer has actually moved; before that there is nothing to follow.
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
const VALID = { 'f-name': (v) => v.length >= 2, 'f-phone': (v) => v.replace(/[^\d+]/g, '').length >= 7 };
// An error clears the moment the field is put right, so the form never holds a stale message
// (and never keeps the submit pushed below the fold by one).
form.addEventListener('input', (e) => {
  const rule = VALID[e.target.id]; if (!rule || !rule(e.target.value.trim())) return;
  e.target.closest('.field').classList.remove('is-bad');
  const err = $('#' + e.target.id.replace('f-', 'e-')); if (err) err.hidden = true;
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
  check(name, 'e-name', VALID['f-name']);
  check(phone, 'e-phone', VALID['f-phone']);
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
// Boot the score, then the world. The page is complete without the world.
// =============================================================================
// Line splitting measures real line boxes, so the score waits for the faces, with a ceiling
// so a slow font never holds the page.
let booted = false;
function boot() {
  if (booted) return; booted = true;
  buildScroll(); placeThumb();
  html.classList.add('sc-ready');
  // If a face was still in flight when the lines were measured, measure them again once it lands.
  if (document.fonts.status !== 'loaded') document.fonts.ready.then(() => buildScroll());
}
// fonts.ready resolves at once if nothing has asked for a face yet, which is the case before
// first layout, so ask for the faces the score measures and then wait for them.
const FACES = ['800 1em Archivo', '800 1em Cairo', '500 1em "Instrument Sans"', '500 1em "IBM Plex Sans Arabic"', '400 1em "Geist Mono"'];
// The first paint can request faces of its own, so "loaded" has to hold across two frames.
const nextFrame = () => new Promise(requestAnimationFrame);
async function fontsIdle() {
  for (let i = 0; i < 90; i++) {
    await document.fonts.ready; await nextFrame();
    if (document.fonts.status === 'loaded') { await nextFrame(); if (document.fonts.status === 'loaded') return; }
  }
}
Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => null))).then(fontsIdle).then(boot);
setTimeout(boot, 2500);
addEventListener('load', () => { boot(); ScrollTrigger.refresh(); });

// -----------------------------------------------------------------------------
// The world: one helix of porcelain and steel, built once, posed per chapter.
// -----------------------------------------------------------------------------
const THREE_URL = './vendor/three.module.min.js';
const canvas = $('#world'), stage = $('#stage');
function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
if (!webglOk()) { html.classList.add('no-webgl'); stage.setAttribute('data-sc-verify-state', 'no-webgl'); }
else {
  import(THREE_URL).then((THREE) => { try { createWorld(THREE); } catch (e) { console.warn('world failed', e); html.classList.add('no-webgl'); stage.setAttribute('data-sc-verify-state', 'no-webgl'); } })
    .catch((e) => { console.warn('three.js did not load', e); html.classList.add('no-webgl'); stage.setAttribute('data-sc-verify-state', 'no-webgl'); });
}

function skyEnvironment(THREE, renderer) {
  // A small studio: bright soft top, grey floor, one hard key upper-left, a faint warm fill lower-right.
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#cfd6dd'); grd.addColorStop(0.62, '#7d8791'); grd.addColorStop(1, '#2a3038');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  const key = g.createRadialGradient(64, 30, 0, 64, 30, 54);
  key.addColorStop(0, 'rgba(255,255,255,1)'); key.addColorStop(0.3, 'rgba(255,255,255,0.7)'); key.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = key; g.fillRect(0, 0, 256, 128);
  const warm = g.createRadialGradient(200, 92, 0, 200, 92, 60);
  warm.addColorStop(0, 'rgba(255,196,150,0.55)'); warm.addColorStop(1, 'rgba(255,196,150,0)');
  g.fillStyle = warm; g.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  pm.dispose(); tex.dispose();
  return env;
}

function createWorld(THREE) {
  // A verification browser renders in software at a few frames a second. It gets a cheaper
  // scene and a synchronous frame on every scroll, so each screenshot is the frame for its position.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !AUTOMATED, powerPreference: 'high-performance' });
  renderer.setPixelRatio(AUTOMATED ? 1 : Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  camera.position.set(0, 0, 20);
  scene.environment = skyEnvironment(THREE, renderer);
  scene.environmentIntensity = 1.0;
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-6, 9, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9); rim.position.set(7, -3, -5); scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7f8a99, 0.45); scene.add(hemi);
  const glow = new THREE.PointLight(0xff5040, 0, 10, 1.6); scene.add(glow);

  // ---- the helix ----------------------------------------------------------------
  const RUNGS = 24, NB = 84, H = 12.4, R = 1.5, TURNS = 2.05, LIT = 13;
  const beadGeo = new THREE.SphereGeometry(0.2, AUTOMATED ? 14 : 28, AUTOMATED ? 10 : 20);
  const beadMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f6f4, roughness: 0.36, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.28, envMapIntensity: 1 });
  const rungGeo = new THREE.CylinderGeometry(0.058, 0.058, 1, AUTOMATED ? 8 : 14);
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xc4c9ce, metalness: 1, roughness: 0.3, envMapIntensity: 1.25 });
  const litMat = new THREE.MeshStandardMaterial({ color: 0xff3b2e, emissive: 0xff2a1c, emissiveIntensity: 0, metalness: 0.15, roughness: 0.45 });
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, NB * 2);
  const rungs = new THREE.InstancedMesh(rungGeo, rungMat, RUNGS * 2);
  const litA = new THREE.Mesh(rungGeo, litMat), litB = new THREE.Mesh(rungGeo, litMat);
  const helix = new THREE.Group(); helix.add(beads, rungs, litA, litB); scene.add(helix);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), E = new THREE.Vector3(), D = new THREE.Vector3(), Wp = new THREE.Vector3();
  const strand = (t, side, twist, open, out) => {
    // side 0 is strand A, side 1 is strand B. `open` slides B around the axis and pushes both outward.
    const th = t * TURNS * Math.PI * 2 + twist + (side ? Math.PI - open * 1.15 : 0);
    const r = R * (1 + open * 0.5);
    return out.set(Math.cos(th) * r, (t - 0.5) * H, Math.sin(th) * r);
  };
  const placeRung = (mesh, from, to, i) => {
    D.subVectors(to, from); const len = D.length() || 0.0001;
    Q.setFromUnitVectors(UP, D.normalize());
    C.addVectors(from, to).multiplyScalar(0.5);
    if (mesh.isInstancedMesh) { M.compose(C, Q, S.set(1, len, 1)); mesh.setMatrixAt(i, M); }
    else { mesh.position.copy(C); mesh.quaternion.copy(Q); mesh.scale.set(1, len, 1); }
  };
  function layout(twist, open, lit) {
    for (let i = 0; i < NB; i++) {
      const t = i / (NB - 1);
      for (let side = 0; side < 2; side++) {
        strand(t, side, twist, open, A);
        M.compose(A, Q.identity(), S.set(1, 1, 1)); beads.setMatrixAt(side * NB + i, M);
      }
    }
    for (let i = 0; i < RUNGS; i++) {
      const t = i / (RUNGS - 1);
      strand(t, 0, twist, open, A); strand(t, 1, twist, open, B);
      C.addVectors(A, B).multiplyScalar(0.5);
      const reach = 1 - open * 0.78;
      if (i === LIT) {
        E.copy(A).lerp(C, reach); placeRung(litA, A, E, 0);
        E.copy(B).lerp(C, reach); placeRung(litB, B, E, 0);
        M.compose(C, Q.identity(), S.set(0, 0, 0)); rungs.setMatrixAt(i * 2, M); rungs.setMatrixAt(i * 2 + 1, M);
        Wp.copy(C); helix.localToWorld(Wp); glow.position.copy(Wp);
      } else {
        E.copy(A).lerp(C, reach); placeRung(rungs, A, E, i * 2);
        E.copy(B).lerp(C, reach); placeRung(rungs, B, E, i * 2 + 1);
      }
    }
    beads.instanceMatrix.needsUpdate = true; rungs.instanceMatrix.needsUpdate = true;
    litMat.emissiveIntensity = lit * 3.2;
    litMat.color.setHex(lit > 0.02 ? 0xff3b2e : 0xc4c9ce);
    litMat.metalness = lerp(1, 0.15, lit); litMat.roughness = lerp(0.3, 0.45, lit);
    glow.intensity = lit * 40;
  }

  // ---- atmosphere: two planes of drifting particulate for depth against the object ----
  const spriteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const makePlane = (n, z0, z1, size, opacity) => {
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 34; pos[i * 3 + 1] = (rnd() - 0.5) * 20; pos[i * 3 + 2] = z0 + rnd() * (z1 - z0); ph[i] = rnd() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: spriteTex, size, transparent: true, opacity, depthWrite: false, color: 0x2a3036, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.userData = { base: pos.slice(), ph, n }; scene.add(pts); return pts;
  };
  const far = makePlane(160, -9, -3, 0.16, 0.28), near = makePlane(40, 3, 8, 0.34, 0.16);

  // ---- poses ----------------------------------------------------------------------
  // fx, fy are fractions of the visible half-width and half-height at the object's depth.
  const POSE = {
    top:    { d: { fx: 0.30, fy: -0.06, s: 0.80, rz: 0.36, rx: 0.10 }, p: { fx: 0.34, fy: 0.30, s: 0.45, rz: 0.30, rx: 0.06 } },
    lab:    { d: { fx: -0.90, fy: 0.90, s: 0.001, rz: -0.30, rx: 0.06 }, p: { fx: 0.90, fy: 0.90, s: 0.001, rz: -0.36, rx: 0.06 } },
    tests:  { d: { fx: 0.40, fy: 0.34, s: 0.40, rz: 0.95, rx: 0.30 }, p: { fx: 0.44, fy: 0.42, s: 0.28, rz: 0.95, rx: 0.30 } },
    method: { d: { fx: 0.24, fy: 0.00, s: 0.92, rz: 0.00, rx: 0.00 }, p: { fx: 0.26, fy: 0.12, s: 0.56, rz: 0.00, rx: 0.00 } },
    people: { d: { fx: 0.44, fy: -0.55, s: 0.60, rz: 0.62, rx: 0.12, dy: 0.5 }, p: { fx: 0.66, fy: -0.55, s: 0.40, rz: 0.62, rx: 0.12, dy: 0.5 } },
    visit:  { d: { fx: 0.36, fy: 0.20, s: 0.58, rz: 0.55, rx: 0.10, dy: 0.5 }, p: { fx: 0.66, fy: -0.40, s: 0.36, rz: 0.60, rx: 0.10, dy: 0.3 } },
  };
  const cur = { x: 0, y: 0, s: 0.8, rz: 0.3, rx: 0.1, open: 0, lit: 0, night: 0, ry: 0 };
  const tgt = { ...cur };
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (FINE.matches && !REDUCED) addEventListener('pointermove', (e) => { ptr.tx = (e.clientX / innerWidth - 0.5) * 2; ptr.ty = (e.clientY / innerHeight - 0.5) * -2; }, { passive: true });
  const cBead = new THREE.Color(), cRung = new THREE.Color(), cDust = new THREE.Color();
  const BEAD_DAY = new THREE.Color(0xf6f6f4), BEAD_NIGHT = new THREE.Color(0x1b2230);
  const RUNG_DAY = new THREE.Color(0xc4c9ce), RUNG_NIGHT = new THREE.Color(0x9aa5b4);
  const DUST_DAY = new THREE.Color(0x2a3036), DUST_NIGHT = new THREE.Color(0xdfe6f0);

  let visW = 10, visH = 10;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360); visW = visH * camera.aspect;
    world.dirty = true;
  }
  addEventListener('resize', resize); resize();

  let hidden = document.hidden, raf = 0, last = performance.now(), t0 = last, lastState = '';
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; if (!hidden) wake(); });
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function retarget() {
    const pose = (POSE[world.chapter] || POSE.top)[PHONE.matches ? 'p' : 'd'];
    const fit = Math.min(1, (visH * 0.92) / H);
    const p = world.p;
    tgt.x = pose.fx * dirSign() * visW * 0.5; tgt.y = (pose.fy + (pose.dy || 0) * (0.5 - p)) * visH * 0.5; tgt.s = pose.s * fit * (visH / 10.7);
    tgt.rz = pose.rz; tgt.rx = pose.rx;
    if (world.chapter === 'method') {
      tgt.open = smooth(ramp(p, 0.22, 0.48)) * (1 - smooth(ramp(p, 0.86, 0.97)));
      tgt.lit = smooth(ramp(p, 0.58, 0.65)) * (1 - smooth(ramp(p, 0.80, 0.87)));
      tgt.s *= 1 + tgt.open * 0.08;
    } else { tgt.open = 0; tgt.lit = 0; }
    tgt.night = world.night;
  }

  function frame(now) {
    raf = 0;
    if (hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    retarget();
    const k = INSTANT ? 1 : 1 - Math.pow(0.001, dt * 1.6);
    for (const key of ['x', 'y', 's', 'rz', 'rx', 'open', 'lit', 'night']) cur[key] = lerp(cur[key], tgt[key], k);
    ptr.x = lerp(ptr.x, ptr.tx, 0.05); ptr.y = lerp(ptr.y, ptr.ty, 0.05);
    // twist: the scroll turns the helix, and time keeps it breathing between scrolls
    const scrollTwist = (scrollTop() / Math.max(1, innerHeight)) * 0.9;
    const idle = REDUCED ? 0 : time * 0.1;
    const twist = scrollTwist + idle;
    helix.position.set(cur.x + ptr.x * 0.35, cur.y + ptr.y * 0.25, 0);
    helix.rotation.set(cur.rx + ptr.y * -0.12, ptr.x * 0.18, cur.rz);
    helix.scale.setScalar(cur.s);
    layout(twist, cur.open, cur.lit);
    // day / night
    const n = cur.night;
    beadMat.color.copy(cBead.copy(BEAD_DAY).lerp(BEAD_NIGHT, n));
    rungMat.color.copy(cRung.copy(RUNG_DAY).lerp(RUNG_NIGHT, n));
    scene.environmentIntensity = lerp(1.0, 0.42, n);
    key.intensity = lerp(1.7, 1.1, n); hemi.intensity = lerp(0.45, 0.12, n); rim.intensity = lerp(0.9, 1.4, n);
    cDust.copy(DUST_DAY).lerp(DUST_NIGHT, n);
    far.material.color.copy(cDust); near.material.color.copy(cDust);
    far.material.opacity = lerp(0.28, 0.45, n); near.material.opacity = lerp(0.16, 0.3, n);
    // particulate drift and pointer depth
    for (const pts of [far, near]) {
      const { base, ph, n: cnt } = pts.userData, arr = pts.geometry.attributes.position.array;
      const amp = pts === near ? 0.5 : 0.25, sp = REDUCED ? 0 : 1;
      for (let i = 0; i < cnt; i++) { arr[i * 3] = base[i * 3] + Math.sin(time * 0.12 * sp + ph[i]) * amp; arr[i * 3 + 1] = base[i * 3 + 1] + Math.cos(time * 0.09 * sp + ph[i] * 1.3) * amp * 0.7; }
      pts.geometry.attributes.position.needsUpdate = true;
    }
    far.position.set(ptr.x * 0.4, ptr.y * 0.25, 0); near.position.set(ptr.x * 1.3, ptr.y * 0.9, 0);
    renderer.render(scene, camera);
    // what the verifier reads: only the scroll-driven part of the state, never time
    const state = `${world.chapter}:${world.p.toFixed(2)}:${tgt.open.toFixed(2)}:${tgt.lit.toFixed(2)}:${tgt.night.toFixed(2)}:${scrollTwist.toFixed(2)}`;
    if (state !== lastState) { lastState = state; stage.setAttribute('data-sc-verify-state', state); }
    if (!REDUCED || world.dirty) { world.dirty = false; raf = requestAnimationFrame(frame); }
    else raf = 0;
  }
  if (REDUCED) {
    // Under reduced motion the loop only runs when something scroll-driven changed.
    const poke = () => { world.dirty = true; wake(); };
    addEventListener('scroll', poke, { passive: true });
    const origSet = world.set; world.set = function (ch, p) { origSet.call(this, ch, p); wake(); };
  }
  if (AUTOMATED) {
    let busy = false;
    addEventListener('scroll', () => { if (busy) return; busy = true; try { ScrollTrigger.update(); if (raf) cancelAnimationFrame(raf); frame(performance.now()); } finally { busy = false; } }, { passive: true });
  }
  wake();
  window.__world = { world, helix, scene, renderer };
}
