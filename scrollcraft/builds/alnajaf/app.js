// Page-local behaviour for the Al-Najaf flight. The engine (scrollcraft.js) is untouched.
// Everything here reads the two numbers the engine publishes, --sc-seg and --sc-segp,
// and the inline opacity it writes on copy blocks.

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const small = matchMedia('(max-width: 860px)');
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ language --
const T = {
  title: { en: 'Al-Najaf Specialized Laboratory', ar: 'مختبر النجف التخصصي' },
  wa: {
    en: (d) => `Hello Al-Najaf Specialized Laboratory. I would like to book a sample.\nName: ${d.name}\nPhone: ${d.phone}\nTest: ${d.dept}${d.msg ? `\nNote: ${d.msg}` : ''}`,
    ar: (d) => `مرحباً مختبر النجف التخصصي. أود حجز عينة.\nالاسم: ${d.name}\nالهاتف: ${d.phone}\nالفحص: ${d.dept}${d.msg ? `\nملاحظة: ${d.msg}` : ''}`,
  },
};
const langBtn = document.getElementById('langToggle');
const dept = document.getElementById('f-dept');
function syncSelectLabels() {
  for (const o of dept.options) o.textContent = o.dataset[root.lang] || o.textContent;
}
function setLang(l, persist = true) {
  root.lang = l; root.dir = l === 'ar' ? 'rtl' : 'ltr';
  document.title = T.title[l];
  langBtn.setAttribute('aria-label', l === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  syncSelectLabels(); updateReqNow();
  if (persist) { try { localStorage.setItem('alnajaf-lang', l); } catch (e) { /* private mode */ } }
  relayout();
}

// ---------------------------------------------- relayout (worldflight.md §7b) --
function relayout() { dispatchEvent(new Event('resize')); }
addEventListener('load', relayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

// ------------------------------------------------------------- track position --
const flight = document.getElementById('flight');
const W = Array.from(flight.querySelectorAll('[data-sc-segment]')).map((s) => parseFloat(s.getAttribute('data-sc-w')) || 1.3);
const TOTAL = W.reduce((a, b) => a + b, 0);
const C0 = []; { let run = 0; for (const w of W) { C0.push(run); run += w; } }
function track() {
  const seg = Math.max(0, Math.min(W.length - 1, parseInt(root.style.getPropertyValue('--sc-seg')) || 0));
  const segp = clamp01(parseFloat(root.style.getPropertyValue('--sc-segp')) || 0);
  return { seg, segp, pr: (C0[seg] + segp * W[seg]) / TOTAL };
}

// ------------------------------------------------ the requisition writes itself --
const req = document.getElementById('req');
const reqLines = Array.from(document.querySelectorAll('#reqLines li'));
const reqNow = document.getElementById('reqNow');
const reqPick = document.getElementById('reqPick');
const reqToggle = document.getElementById('reqToggle');
// local progress within each leg at which its line is written
const WRITE_AT = [0.10, 0.34, 0.58, 0.50, 0.82, 0.42, 0.55];
let lastDone = -1;
function updateReq({ seg, segp }) {
  let done = -1;
  reqLines.forEach((li, i) => { const on = seg > i || (seg === i && segp >= WRITE_AT[i]); li.classList.toggle('is-done', on); if (on) done = i; });
  reqPick.hidden = !(seg >= 5 || (seg === 4 && segp > 0.86));
  if (done !== lastDone) { lastDone = done; updateReqNow(); }
}
function updateReqNow() {
  const li = reqLines[lastDone];
  if (!li) { reqNow.textContent = ''; return; }
  const k = li.querySelector(`.req__k [lang="${root.lang}"]`), v = li.querySelector(`.req__v [lang="${root.lang}"]`);
  reqNow.textContent = `${k ? k.textContent : ''} · ${v ? v.textContent : ''}`;
}
function setReqOpen(open) { req.classList.toggle('is-open', open); reqToggle.setAttribute('aria-expanded', String(open)); }
setReqOpen(!small.matches);
small.addEventListener('change', () => setReqOpen(!small.matches));
reqToggle.addEventListener('click', () => setReqOpen(!req.classList.contains('is-open')));
// the test picked on the way up carries into the booking, and back
const picks = Array.from(document.querySelectorAll('input[name="pick"]'));
picks.forEach((r) => r.addEventListener('change', () => { if (r.checked) dept.value = r.value; }));
dept.addEventListener('change', () => { picks.forEach((r) => { r.checked = r.value === dept.value; }); });

// language, now that everything it touches exists
let saved = null; try { saved = localStorage.getItem('alnajaf-lang'); } catch (e) { /* ignore */ }
setLang(saved === 'ar' || saved === 'en' ? saved : ((navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'), false);
langBtn.addEventListener('click', () => setLang(root.lang === 'ar' ? 'en' : 'ar'));

// ---------------------------------------- scrim plates mirror their copy block --
const platesHost = document.getElementById('plates');
const plates = Array.from(document.querySelectorAll('[data-sc-copy][data-plate]')).map((b) => {
  const p = document.createElement('div'); p.className = `plate plate--${b.dataset.plate}`; platesHost.appendChild(p); return { b, p, o: '' };
});
function updatePlates() {
  for (const x of plates) { const o = x.b.style.opacity || '0'; if (o !== x.o) { x.o = o; x.p.style.opacity = o; x.b.style.visibility = parseFloat(o) < 0.05 ? 'hidden' : ''; } }
}

// ------------------------------------------------------------- navigation --
function flyTo(top) { scrollTo({ top, behavior: reduce ? 'instant' : 'smooth' }); }
document.querySelectorAll('[data-book]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); flyTo(root.scrollHeight - innerHeight);
  setTimeout(() => { const f = document.getElementById('f-name'); if (f) f.focus({ preventScroll: true }); }, reduce ? 50 : 1100);
}));
document.querySelectorAll('[data-top]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); flyTo(0); }));
// keyboard focus into the finale while it is still dark: bring the flight to the end
const finale = document.getElementById('finale');
finale.addEventListener('focusin', () => { if (parseFloat(finale.style.opacity || '0') < 0.85) flyTo(root.scrollHeight - innerHeight); });

// --------------------------------------------------------- booking → WhatsApp --
const form = document.getElementById('booking');
const fName = document.getElementById('f-name'), fPhone = document.getElementById('f-phone'), fMsg = document.getElementById('f-msg');
function setErr(input, id, bad) { input.closest('.field').classList.toggle('is-invalid', bad); document.getElementById(id).hidden = !bad; input.setAttribute('aria-invalid', String(bad)); }
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = fName.value.trim(), phone = fPhone.value.trim(), msg = fMsg.value.trim();
  const badName = name.length < 2, badPhone = phone.replace(/\D/g, '').length < 7;
  setErr(fName, 'e-name', badName); setErr(fPhone, 'e-phone', badPhone);
  if (badName) { fName.focus(); return; } if (badPhone) { fPhone.focus(); return; }
  const o = dept.options[dept.selectedIndex];
  const text = T.wa[root.lang]({ name, phone, msg, dept: o.dataset[root.lang] || o.textContent });
  const url = `https://wa.me/9647809422636?text=${encodeURIComponent(text)}`;
  const w = window.open(url, '_blank', 'noopener'); if (!w) location.href = url;
});
[fName, fPhone].forEach((i) => i.addEventListener('input', () => { if (i.getAttribute('aria-invalid') === 'true') setErr(i, i === fName ? 'e-name' : 'e-phone', false); }));

// --------------------------------------------------------------- live layer --
// Near-focus particulate over the hero, the seal over the report. Runs only while its
// phase is on screen, only without reduced motion, only where WebGL exists.
const live = document.getElementById('live');
const canvas = document.getElementById('liveCanvas');
let liveApi = null;
function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
const saveData = navigator.connection && navigator.connection.saveData;
if (!reduce && !saveData && webglOk()) {
  Promise.all([import('./vendor/three.module.min.js'), import('./vendor/RoomEnvironment.js')]).then(([THREE, { RoomEnvironment }]) => { liveApi = buildLive(THREE, RoomEnvironment); onScroll(); }).catch((err) => { console.warn('[live] not started:', err && err.message); });
}

function buildLive(THREE, RoomEnvironment) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100); camera.position.set(0, 0, 10);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xcfe3ff, 2.6); key.position.set(-4, 6, 5); scene.add(key);
  const fill = new THREE.PointLight(0xffb27a, 1.1, 0, 1.6); fill.position.set(4, -3, 4); scene.add(fill);

  // ---- hero: soft particulate in a near slab + a warm bloom plane --------------
  const heroG = new THREE.Group(); scene.add(heroG);
  const spriteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,236,214,1)'); gr.addColorStop(0.35, 'rgba(255,226,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const N = 150, pos = new Float32Array(N * 3), seed = new Float32Array(N * 2);
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 18; pos[i * 3 + 1] = (rnd() - 0.5) * 12; pos[i * 3 + 2] = rnd() * 7 - 1; seed[i * 2] = rnd() * 6.28; seed[i * 2 + 1] = 0.2 + rnd() * 0.8; }
  const base = pos.slice();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(pg, new THREE.PointsMaterial({ map: spriteTex, size: 0.55, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  heroG.add(points);
  const bloom = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshBasicMaterial({ map: spriteTex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xdfe9ff }));
  bloom.position.set(-5, 3.2, -4); heroG.add(bloom);

  // ---- seal: the crescent and the helix from the lab's own mark ---------------
  const sealG = new THREE.Group(); scene.add(sealG);
  const Rr = 1.0, rr = 0.8, d = 0.42; const ix = (d * d + Rr * Rr - rr * rr) / (2 * d), iy = Math.sqrt(Rr * Rr - ix * ix);
  const a1 = Math.atan2(iy, ix), b1 = Math.atan2(iy, ix - d);
  const shape = new THREE.Shape(); shape.absarc(0, 0, Rr, a1, Math.PI * 2 - a1, false); shape.absarc(d, 0, rr, -b1, b1, true);
  const cres = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 64 }), new THREE.MeshPhysicalMaterial({ color: 0xc72f39, metalness: 0.4, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.2 }));
  cres.position.z = -0.1; sealG.add(cres);
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x2f9d5c, metalness: 0.45, roughness: 0.35, clearcoat: 0.7, envMapIntensity: 1.1 });
  for (let k = 0; k < 4; k++) { const seg = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 12, 48, Math.PI / 2 - 0.22), ringMat); seg.rotation.z = k * Math.PI / 2 + 0.11; seg.position.set(d, 0, 0.02); sealG.add(seg); }
  const strand = (col, off) => { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2 * 1.6 + off; pts.push(new THREE.Vector3(d + 0.17 * Math.cos(a), -0.62 + i / 40 * 1.24, 0.17 * Math.sin(a) + 0.05)); } return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.036, 8, false), new THREE.MeshPhysicalMaterial({ color: col, metalness: 0.5, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 1.2 })); };
  sealG.add(strand(0x9c2b34, 0), strand(0x2c4f8e, Math.PI * 0.84));
  const rungMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2 * 1.6, y = -0.62 + i / 14 * 1.24; const A = new THREE.Vector3(d + 0.17 * Math.cos(a), y, 0.17 * Math.sin(a) + 0.05), B = new THREE.Vector3(d + 0.17 * Math.cos(a + Math.PI * 0.84), y, 0.17 * Math.sin(a + Math.PI * 0.84) + 0.05); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, A.distanceTo(B), 6), rungMat); m.position.copy(A).lerp(B, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); sealG.add(m); }
  sealG.scale.setScalar(1.55); sealG.visible = false;

  // ---- state ------------------------------------------------------------------
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (fine.matches) addEventListener('pointermove', (e) => { ptr.tx = (e.clientX / innerWidth - 0.5) * 2; ptr.ty = (e.clientY / innerHeight - 0.5) * -2; }, { passive: true });
  let raf = 0, phase = 'off', t0 = performance.now(), hidden = document.hidden;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; if (!hidden) wake(); });
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  let cur = { pr: 0, seg: 0, segp: 0 };
  function frame(now) {
    raf = 0;
    if (hidden || phase === 'off') return;
    const time = (now - t0) / 1000;
    ptr.x = lerp(ptr.x, ptr.tx, 0.06); ptr.y = lerp(ptr.y, ptr.ty, 0.06);
    let sig = phase;
    if (phase === 'hero') {
      const fade = 1 - smooth(ramp(cur.pr, 0.062, 0.128));
      const p = pg.attributes.position.array;
      for (let i = 0; i < N; i++) { const sp = seed[i * 2 + 1]; p[i * 3] = base[i * 3] + Math.sin(time * 0.18 * sp + seed[i * 2]) * 0.6; p[i * 3 + 1] = base[i * 3 + 1] + Math.cos(time * 0.14 * sp + seed[i * 2] * 1.7) * 0.45 + cur.pr * 22; }
      pg.attributes.position.needsUpdate = true;
      heroG.position.set(ptr.x * 0.9, ptr.y * 0.6, 0); bloom.position.set(-5 - ptr.x * 0.35, 3.2 - ptr.y * 0.25, -4);
      points.material.opacity = 0.5 * fade; bloom.material.opacity = 0.16 * fade;
      heroG.visible = fade > 0.01; sealG.visible = false;
      sig += `:${fade.toFixed(2)}`;
    } else {
      const settle = smooth(ramp(cur.pr, 0.905, 0.985));
      const enter = smooth(ramp(cur.pr, 0.885, 0.94));
      sealG.visible = enter > 0.01; heroG.visible = false;
      const mobile = small.matches;
      // world units per pixel at z=0: the camera sees 2*tan(19deg)*10 units over the viewport height
      const upp = (2 * Math.tan(19 * Math.PI / 180) * 10) / innerHeight;
      const px = mobile ? innerWidth - 84 : innerWidth - 8.25 * 16 - Math.min(innerWidth * 0.05, 88) - 12;   // centre of the requisition column
      const py = mobile ? 132 : Math.min(innerHeight - 120, 4.6 * 16 + 470 + 165);                        // below the requisition; up in the corner on phones
      sealG.position.set((px - innerWidth / 2) * upp, (innerHeight / 2 - py) * upp - (1 - settle) * 0.6, 0);
      sealG.rotation.set(lerp(0.95, -0.38, settle) + ptr.y * 0.10 * settle, lerp(-0.8, 0.16, settle) + ptr.x * 0.14 * settle, lerp(0.35, 0.05, settle));
      const sc = (mobile ? 0.5 : 0.8) * (0.7 + 0.3 * enter);
      sealG.scale.setScalar(sc);
      sealG.traverse((o) => { if (o.material) { o.material.transparent = enter < 0.999; o.material.opacity = enter; } });
      sig += `:${enter.toFixed(2)}:${settle.toFixed(2)}`;
      live.toggleAttribute('data-sc-verify-hold', settle >= 0.999);
    }
    live.setAttribute('data-sc-verify-state', `${sig}:${ptr.x.toFixed(2)},${ptr.y.toFixed(2)}`);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && phase !== 'off' && !hidden) raf = requestAnimationFrame(frame); }
  return {
    update(tr) {
      cur = tr;
      const next = tr.pr < 0.135 ? 'hero' : tr.pr > 0.88 ? 'seal' : 'off';
      if (next !== phase) { phase = next; live.classList.toggle('is-on', phase !== 'off'); if (phase === 'off') { live.setAttribute('data-sc-verify-state', 'off'); live.removeAttribute('data-sc-verify-hold'); } }
      wake();
    },
  };
}

// ------------------------------------------------------------------ scroll --
let ticking = false;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const tr = track();
    updateReq(tr); updatePlates();
    if (liveApi) liveApi.update(tr);
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
addEventListener('sc:waypoint', onScroll);
onScroll();
// the engine writes the copy opacities on its own rAF; mirror them for a few frames after any scroll settles
let settleTimer = 0;
addEventListener('scroll', () => { clearTimeout(settleTimer); settleTimer = setTimeout(() => { let n = 0; const tick = () => { updatePlates(); if (++n < 40) requestAnimationFrame(tick); }; tick(); }, 60); }, { passive: true });
