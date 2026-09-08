// The world: seven legs of one continuous descent, rendered offline.
// Deterministic: every frame is a pure function of (leg, t). No clocks.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 1920, H = +q.get('h') || 1080;
const PORTRAIT = H > W;

// ---------------------------------------------------------------- utils --
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Grade: the preamble in numbers. Graphite black, cold silver, one green.
const GRADE = {
  canvas: 0x07090c,
  amber: 0x3a1a0c,      // plasma medium
  blood: 0x8f1a22,
  strandRed: 0x9c2b34,
  strandBlue: 0x2c4f8e,
  green: 0x62f0b0,      // the signal. only where a result is being read.
  keyCool: 0xcfe3ff,
  fillWarm: 0xffb27a,
};

// ------------------------------------------------------------- renderer --
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

let rtType = THREE.HalfFloatType;
const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: rtType });
const composer = new EffectComposer(renderer, rt);

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.42 }, lift: { value: 0.012 }, desat: { value: 0.12 }, cool: { value: 0.035 }, aspect: { value: W / H } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, lift, desat, cool, aspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // gentle desaturation of mids, keep highlights and the green signal
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float mid = smoothstep(0.02, 0.35, l) * (1.0 - smoothstep(0.45, 1.2, l));
      c.rgb = mix(c.rgb, vec3(l), desat * mid);
      // cool the shadows a touch (grade of graphite, cold silver)
      float sh = 1.0 - smoothstep(0.0, 0.25, l);
      c.rgb += vec3(-cool*0.4, cool*0.15, cool) * sh * l * 2.0;
      // lift: no pure black
      c.rgb = c.rgb * (1.0 - lift) + lift;
      // vignette
      vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = 1.0 - vignette * smoothstep(0.35, 1.05, length(p));
      c.rgb *= v;
      gl_FragColor = c;
    }`
};

// ------------------------------------------------------------ scene base --
class Leg {
  constructor(name, seconds) { this.name = name; this.seconds = seconds; this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(38, W / H, 0.01, 400); this.built = false; this.bloom = { strength: 0.35, radius: 0.6, threshold: 0.85 }; }
  build() {}
  update(t) {}
}

function lookAtTarget(cam, pos, target, roll = 0) { cam.position.copy(pos); cam.up.set(Math.sin(roll), Math.cos(roll), 0); cam.lookAt(target); }

// A biconcave red cell profile, lathed.
function rbcGeometry() {
  const pts = [];
  const N = 12;
  for (let i = 0; i <= N; i++) { const r = i / N; const y = 0.10 + 0.34 * Math.pow(Math.sin(Math.PI * r), 1.2) * (0.25 + 0.75 * r) - 0.06 * (1 - r); pts.push(new THREE.Vector2(r * 1.0, y)); }
  for (let i = N; i >= 0; i--) { const r = i / N; const y = 0.10 + 0.34 * Math.pow(Math.sin(Math.PI * r), 1.2) * (0.25 + 0.75 * r) - 0.06 * (1 - r); pts.push(new THREE.Vector2(r * 1.0, -y)); }
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

function lumpySphere(radius, detail, amp, seed) {
  const g = new THREE.IcosahedronGeometry(radius, detail); const pa = g.attributes.position; const r = mulberry32(seed);
  // low-frequency lumps: displace along 3 fixed sinusoids so neighbouring verts agree (no facets)
  const k = [V3(r()*3, r()*3, r()*3), V3(r()*3, r()*3, r()*3), V3(r()*3, r()*3, r()*3)];
  for (let i = 0; i < pa.count; i++) { const v = V3(pa.getX(i), pa.getY(i), pa.getZ(i)); const n = v.clone().normalize(); let d = 0; for (const kk of k) d += Math.sin(n.dot(kk) * 2.6); v.multiplyScalar(1 + amp * d / 3); pa.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

function membraneTexture(seed, w = 1024) {
  const rng = mulberry32(seed); const c = document.createElement('canvas'); c.width = c.height = w; const g = c.getContext('2d');
  g.fillStyle = '#c9bdb0'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 2600; i++) { const x = rng() * w, y = rng() * w, r = 2 + rng() * 9; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(88,68,58,0.85)'); gr.addColorStop(1, 'rgba(88,68,58,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

function dustPoints(rng, count, spread, size, color, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { pos[i * 3] = (rng() - 0.5) * spread.x; pos[i * 3 + 1] = (rng() - 0.5) * spread.y; pos[i * 3 + 2] = (rng() - 0.5) * spread.z; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  return new THREE.Points(g, m);
}

function addKeyFill(scene, keyPos, fillPos, keyI = 6, fillI = 1.2) {
  const key = new THREE.SpotLight(GRADE.keyCool, keyI, 0, Math.PI / 5, 0.6, 1.2); key.position.copy(keyPos); scene.add(key); scene.add(key.target);
  const fill = new THREE.PointLight(GRADE.fillWarm, fillI, 0, 1.6); fill.position.copy(fillPos); scene.add(fill);
  return { key, fill };
}

// ================================================================ LEG 1 ==
// The drop. An EDTA tube, macro. A drop runs down the inner wall.
class LegDrop extends Leg {
  constructor() { super('drop', 6); this.bloom = { strength: 0.28, radius: 0.5, threshold: 0.9 }; }
  build() {
    const s = this.scene; s.background = new THREE.Color(GRADE.canvas); s.environment = envTex; s.environmentIntensity = 0.22;
    s.fog = new THREE.FogExp2(GRADE.canvas, 0.045);
    const rng = mulberry32(11);
    // desk plane far below, out of focus
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.95, metalness: 0.0 }));
    desk.rotation.x = -Math.PI / 2; desk.position.y = -6.2; s.add(desk);
    // tube: glass
    const R = 1.0, HGT = 7.6;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, HGT, 96, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xdfe8f2, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, envMapIntensity: 1.8, clearcoat: 1.0, clearcoatRoughness: 0.05, depthWrite: false }));
    s.add(glass);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass.material.clone()); bottom.position.y = -HGT / 2; s.add(bottom);
    // sample: dark blood fluid inside, filled to 55%
    const fillH = HGT * 0.55;
    const blood = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.985, R * 0.985, fillH, 96), new THREE.MeshPhysicalMaterial({ color: 0x6a0f16, roughness: 0.22, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.9, emissive: 0x2a0306, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    blood.position.y = -HGT / 2 + fillH / 2; s.add(blood);
    const bloodBottom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), blood.material); bloodBottom.position.y = -HGT / 2; s.add(bloodBottom);
    this.surfaceY = -HGT / 2 + fillH;
    // meniscus ring
    const men = new THREE.Mesh(new THREE.TorusGeometry(R * 0.97, 0.025, 12, 96), new THREE.MeshPhysicalMaterial({ color: 0x8a2028, roughness: 0.2, clearcoat: 0.8 }));
    men.rotation.x = Math.PI / 2; men.position.y = this.surfaceY + 0.01; s.add(men);
    // cap: lavender EDTA
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.08, 1.1, 64), new THREE.MeshStandardMaterial({ color: 0x9a86c9, roughness: 0.55, metalness: 0.0 }));
    cap.position.y = HGT / 2 + 0.35; s.add(cap);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 1.12, 0.25, 64), cap.material); capTop.position.y = HGT / 2 + 1.0; s.add(capTop);
    // label: blank white band with a barcode-like stripe field (no words)
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 1024; labelCanvas.height = 512;
    const lc = labelCanvas.getContext('2d'); lc.fillStyle = '#f2efe9'; lc.fillRect(0, 0, 1024, 512);
    lc.fillStyle = '#1a1a1a'; let x = 60; const r2 = mulberry32(7); while (x < 520) { const w = 3 + Math.floor(r2() * 9); lc.fillRect(x, 300, w, 150); x += w + 3 + Math.floor(r2() * 10); }
    lc.fillStyle = '#c9c4bb'; for (let i = 0; i < 6; i++) lc.fillRect(600, 110 + i * 48, 360 - (i % 3) * 90, 14);
    const labelTex = new THREE.CanvasTexture(labelCanvas); labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.004, R * 1.004, 2.2, 96, 1, true, 2.65, 2.4), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.85, side: THREE.DoubleSide }));
    label.position.y = 1.6; s.add(label);
    // the drop
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x8a1520, roughness: 0.12, clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.4, emissive: 0x2a0306, emissiveIntensity: 0.4 }));
    s.add(this.drop);
    this.trail = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), this.drop.material); m.visible = false; s.add(m); this.trail.push(m); }
    // ripple ring on the surface
    this.ripple = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 64), new THREE.MeshPhysicalMaterial({ color: 0xb03040, roughness: 0.2, clearcoat: 0.8, transparent: true, opacity: 0.9 }));
    this.ripple.rotation.x = Math.PI / 2; this.ripple.visible = false; s.add(this.ripple);
    // a few red cells suspended just under the surface: what the camera meets as it enters
    this.inner = new THREE.InstancedMesh(rbcGeometry(), new THREE.MeshStandardMaterial({ color: GRADE.blood, roughness: 0.42, envMapIntensity: 1.1, emissive: 0x2a0508, emissiveIntensity: 0.35 }), 34);
    const r4 = mulberry32(13); this.innerData = [];
    for (let i = 0; i < 34; i++) this.innerData.push({ p: V3((r4() - 0.5) * 1.5, this.surfaceY - 0.25 - r4() * 1.6, (r4() - 0.5) * 1.5), r: V3(r4() * 6, r4() * 6, r4() * 6), s: 0.09 + r4() * 0.05 });
    s.add(this.inner); this.innerDummy = new THREE.Object3D();
    // lights
    this.lights = addKeyFill(s, V3(-6, 9, 6), V3(2.5, -5.5, 3), 7, 1.6);
    this.lights.key.target.position.set(0, 0.5, 0);
    const rim = new THREE.PointLight(0xa9c7ff, 1.4, 0, 1.8); rim.position.set(5, 2, -4); s.add(rim);
    // near dust (out of focus feel)
    s.add(dustPoints(rng, 90, V3(14, 10, 14), 0.03, 0xffd9b0, 0.18));
  }
  update(t) {
    // the drop falls through the air inside the tube (t 0.06 -> 0.40), lands, ripples
    const yTop = 3.6, yEnd = this.surfaceY + 0.12;
    const d = ramp(t, 0.06, 0.40);
    const y = lerp(yTop, yEnd, d * d);
    this.drop.position.set(0.12, y, 0.15);
    const stretch = 1 + 0.35 * d;
    this.drop.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    this.drop.visible = t > 0.02 && d < 0.995;
    this.trail.forEach((m, i) => { const k = (i + 1) / 10; m.visible = d > 0.25 && d < 0.995; m.position.set(0.12, lerp(y, y + 0.9, k), 0.15); m.scale.setScalar((1 - k) * 0.7); });
    const rp = ramp(t, 0.40, 0.70);
    this.ripple.visible = rp > 0 && rp < 1; this.ripple.position.set(0.12, this.surfaceY + 0.012, 0.15);
    const rs = 0.2 + rp * 3.2; this.ripple.scale.set(rs, rs, 1); this.ripple.material.opacity = 0.85 * (1 - rp);
    // the inner cells are only there for the entry; they grow in as the camera arrives
    const inK = smooth(ramp(t, 0.55, 0.95));
    for (let i = 0; i < this.innerData.length; i++) { const d = this.innerData[i]; const dm = this.innerDummy; dm.position.copy(d.p); dm.rotation.set(d.r.x + t * 2, d.r.y + t * 1.5, d.r.z); dm.scale.setScalar(d.s * inK); dm.updateMatrix(); this.inner.setMatrixAt(i, dm.matrix); }
    this.inner.instanceMatrix.needsUpdate = true;
    // camera: three-quarter on the fluid line, then push in and DOWN into the blood so the frame ends dark red
    const p = smooth(t);
    const start = PORTRAIT ? V3(4.4, 0.6, 6.6) : V3(5.0, 0.4, 6.0);
    const end = PORTRAIT ? V3(0.0, this.surfaceY - 0.25, 0.42) : V3(0.0, this.surfaceY - 0.2, 0.45);
    const pos = start.clone().lerp(end, p);
    // landscape frames look past the tube to the left, so the tube stands in the right third and the copy has dark ground
    const t0 = PORTRAIT ? V3(0, this.surfaceY + 0.3, 0) : V3(-2.35, this.surfaceY + 0.55, 1.6);
    const target = t0.lerp(V3(0.05, this.surfaceY - 1.6, -0.1), p);
    lookAtTarget(this.camera, pos, target, lerp(0.0, -0.05, p));
    this.camera.fov = lerp(36, 32, p); this.camera.updateProjectionMatrix();
    this.lights.key.intensity = lerp(7, 4, p);
    this.scene.fog.density = lerp(0.045, 0.02, p);
  }
}

// ================================================================ LEG 2/3 ==
// Plasma, then the crowd. One scene system with density and speed as knobs.
class LegPlasma extends Leg {
  constructor(name, seconds, density, speed, seed) { super(name, seconds); this.density = density; this.speed = speed; this.seed = seed; this.bloom = { strength: 0.32, radius: 0.7, threshold: 0.8 }; }
  build() {
    const s = this.scene; const rng = mulberry32(this.seed);
    s.background = new THREE.Color(0x120704); s.environment = envTex; s.environmentIntensity = 0.18;
    s.fog = new THREE.FogExp2(0x1c0a05, this.name === 'crowd' ? 0.07 : 0.055);
    const geo = rbcGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: GRADE.blood, roughness: 0.42, metalness: 0.0, envMapIntensity: 1.1, emissive: 0x2a0508, emissiveIntensity: 0.35 });
    const N = this.density;
    this.fog0 = s.fog.density;
    this.cells = new THREE.InstancedMesh(geo, mat, N);
    this.cellData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const d = { p: V3((rng() - 0.5) * 26, (rng() - 0.5) * 16, -rng() * 90 - 2), r: V3(rng() * 6.28, rng() * 6.28, rng() * 6.28), w: V3((rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.8), s: 0.85 + rng() * 0.35, drift: V3((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.4, 0) };
      this.cellData.push(d);
    }
    s.add(this.cells);
    // a few white cells and platelets
    this.whites = [];
    const wgeo = lumpySphere(1.35, 5, 0.06, this.seed + 5);
    this.memTex = membraneTexture(this.seed + 9); this.memTex.repeat.set(3, 2);
    const wmat = new THREE.MeshStandardMaterial({ map: this.memTex, color: 0xf3ece3, roughness: 0.72, envMapIntensity: 0.5, emissive: 0x1a1410, emissiveIntensity: 0.4 });
    const nw = this.name === 'crowd' ? 7 : 3;
    for (let i = 0; i < nw; i++) { const m = new THREE.Mesh(wgeo, wmat); m.position.set((rng() - 0.5) * 20, (rng() - 0.5) * 12, -rng() * 80 - 8); m.rotation.set(rng() * 6, rng() * 6, rng() * 6); s.add(m); this.whites.push(m); }
    // the target cell for the crowd leg: the one we will enter. Big, ahead, centred.
    if (this.name === 'crowd') {
      const tt = membraneTexture(44); tt.repeat.set(6, 3);
      this.target = new THREE.Mesh(lumpySphere(1, 6, 0.04, 99), new THREE.MeshStandardMaterial({ map: tt, color: 0xf3ebe0, roughness: 0.7, envMapIntensity: 0.5, emissive: 0x241a14, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
      s.add(this.target);
    }
    // platelets
    const pgeo = new THREE.CylinderGeometry(0.28, 0.22, 0.08, 10); const pmat = new THREE.MeshStandardMaterial({ color: 0xd7b7a6, roughness: 0.8 });
    this.plate = new THREE.InstancedMesh(pgeo, pmat, 60); this.plateData = [];
    for (let i = 0; i < 60; i++) this.plateData.push({ p: V3((rng() - 0.5) * 24, (rng() - 0.5) * 14, -rng() * 90), r: V3(rng() * 6, rng() * 6, rng() * 6) });
    s.add(this.plate);
    // light shafts: long additive planes
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + rng() * 2, 70), new THREE.MeshBasicMaterial({ color: 0xffc38a, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set((rng() - 0.5) * 20, 6, -40); m.rotation.set(0.25, (rng() - 0.5) * 0.6, 0.15 + (rng() - 0.5) * 0.3); s.add(m); }
    s.add(dustPoints(rng, 900, V3(30, 20, 100), 0.06, 0xffd2a8, 0.28));
    this.lights = addKeyFill(s, V3(-8, 10, 4), V3(4, -6, -6), 5.5, 2.2);
    const back = new THREE.PointLight(0xff8a5a, 3.0, 0, 1.4); back.position.set(0, 2, -60); s.add(back);
    this.dummy = dummy;
  }
  update(t) {
    const spd = this.speed;
    const z0 = t * 60 * spd; // camera travel
    const dummy = this.dummy;
    // the far edge of the wrap corridor. In the crowd leg it retreats ahead of the camera so nothing crosses the lens at the wall.
    const zmax = this.name === 'crowd' ? Math.min(2, lerp(2, -12 + lerp(2.2, 9.5, smooth(ramp(t, 0.35, 1.0))) + 0.9 - 2.6, smooth(ramp(t, 0.3, 1.0)))) : 2;
    const wrap = (z) => ((z - zmax) % 92 + 92) % 92 + zmax - 92;
    for (let i = 0; i < this.cellData.length; i++) {
      const d = this.cellData[i];
      // world drifts toward the camera; wrap in a 90-deep corridor
      let z = wrap(d.p.z + z0 * 0.85 + Math.sin(t * 6.28 * 0.5 + i) * 0.3);
      const x = d.p.x + d.drift.x * Math.sin(t * 6.28 + i * 0.3) * 2;
      const y = d.p.y + d.drift.y * Math.cos(t * 6.28 * 0.7 + i * 0.5) * 2;
      dummy.position.set(x, y, z);
      dummy.rotation.set(d.r.x + d.w.x * t * 6.28 * spd, d.r.y + d.w.y * t * 6.28 * spd, d.r.z + d.w.z * t * 6.28 * spd);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix(); this.cells.setMatrixAt(i, dummy.matrix);
    }
    this.cells.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.plateData.length; i++) { const d = this.plateData[i]; const z = wrap(d.p.z + z0 * 0.9); dummy.position.set(d.p.x, d.p.y, z); dummy.rotation.set(d.r.x + t * 3, d.r.y + t * 2, d.r.z); dummy.scale.setScalar(1); dummy.updateMatrix(); this.plate.setMatrixAt(i, dummy.matrix); }
    this.plate.instanceMatrix.needsUpdate = true;
    this.whites.forEach((m, i) => { let z = m.userData.z0 ?? (m.userData.z0 = m.position.z); m.position.z = wrap(z + z0 * 0.8); m.rotation.y += 0; });
    // camera. the plasma leg starts dark (we have just entered the blood) and clears
    const roll = Math.sin(t * 6.28 * 0.5) * 0.05 * spd;
    if (this.name === 'plasma') { const clear = smooth(ramp(t, 0, 0.22)); this.scene.fog.density = lerp(0.42, this.fog0, clear); this.lights.key.intensity = lerp(0.6, 5.5, clear); }
    if (this.name === 'crowd') {
      // fly toward the target cell; it grows until its wall fills the frame
      const k = smooth(ramp(t, 0.35, 1.0));
      const tz = -12; this.target.position.set(0.6 - k * 0.6, -0.4 + k * 0.4, tz);
      const sc = lerp(2.2, 9.5, k); this.target.scale.setScalar(sc);
      this.target.rotation.y = t * 1.2; this.target.rotation.x = 0.3;
      const camZ = lerp(6, tz + sc + 0.9, smooth(ramp(t, 0.3, 1.0)));
      lookAtTarget(this.camera, V3(0.3 * Math.sin(t * 3), 0.2 + 0.3 * Math.cos(t * 2.5), camZ), V3(0, 0, tz), roll);
      this.camera.fov = lerp(40, 46, k);
    } else {
      lookAtTarget(this.camera, V3(0.6 * Math.sin(t * 2.2), 0.4 * Math.cos(t * 1.7), 6), V3(0.2 * Math.sin(t * 1.3), 0, -30), roll);
      this.camera.fov = 40;
    }
    this.camera.updateProjectionMatrix();
  }
}

// ================================================================ LEG 4 ==
// The membrane. Through the wall, into the dark, toward the nucleus. Silence.
class LegMembrane extends Leg {
  constructor() { super('membrane', 5); this.bloom = { strength: 0.25, radius: 0.8, threshold: 0.75 }; }
  build() {
    const s = this.scene; const rng = mulberry32(44);
    s.background = new THREE.Color(0x0a0705); s.fog = new THREE.FogExp2(0x0a0705, 0.16); s.environment = envTex; s.environmentIntensity = 0.12;
    // the membrane: a huge inner sphere we are inside of, textured with pores
    const tex = membraneTexture(44); tex.repeat.set(6, 3);
    this.wall = new THREE.Mesh(new THREE.SphereGeometry(9, 96, 64), new THREE.MeshPhysicalMaterial({ map: tex, color: 0xf0e6da, roughness: 0.75, side: THREE.BackSide, transmission: 0.0, emissive: 0x241a14, emissiveIntensity: 0.35 }));
    s.add(this.wall);
    // outer face we pass through first: a front-side sphere slightly larger
    this.outer = new THREE.Mesh(new THREE.SphereGeometry(9.3, 96, 64), new THREE.MeshPhysicalMaterial({ map: tex, color: 0xf3ebe0, roughness: 0.7, side: THREE.FrontSide, transparent: true, opacity: 1, emissive: 0x2a1f18, emissiveIntensity: 0.3 }));
    s.add(this.outer);
    // cytoplasm dust
    s.add(dustPoints(rng, 1400, V3(18, 18, 18), 0.05, 0xd9b895, 0.22));
    // nucleus: a darker sphere with chromatin threads
    this.nuc = new THREE.Group(); s.add(this.nuc);
    const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 64, 48), new THREE.MeshPhysicalMaterial({ color: 0x1b1210, roughness: 0.6, transmission: 0.55, thickness: 2.0, ior: 1.3, attenuationColor: new THREE.Color(0x22140f), attenuationDistance: 2.5, envMapIntensity: 0.4, transparent: true, opacity: 0.85 }));
    this.nuc.add(env);
    const r2 = mulberry32(45);
    for (let k = 0; k < 26; k++) {
      const pts = []; let p = V3((r2() - 0.5) * 3, (r2() - 0.5) * 3, (r2() - 0.5) * 3);
      for (let i = 0; i < 46; i++) { p = p.clone().add(V3((r2() - 0.5) * 0.8, (r2() - 0.5) * 0.8, (r2() - 0.5) * 0.8)); if (p.length() > 2.25) p.multiplyScalar(2.25 / p.length()); pts.push(p); }
      const curve = new THREE.CatmullRomCurve3(pts); const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 260, 0.011, 5, false), new THREE.MeshStandardMaterial({ color: 0x3a2a33, roughness: 0.7, emissive: 0x2a1a24, emissiveIntensity: 0.7 }));
      this.nuc.add(tube);
    }
    this.nuc.position.set(0, 0, -6);
    this.lights = addKeyFill(s, V3(-6, 7, 2), V3(3, -4, -4), 4.5, 1.5);
    this.glow = new THREE.PointLight(0xffb98a, 2.2, 0, 1.6); this.glow.position.set(0, 0, -6); s.add(this.glow);
  }
  update(t) {
    // 0 -> 0.22: pass through the wall (camera starts outside the outer face, moves in)
    const pass = smooth(ramp(t, 0, 0.24));
    const camZ = lerp(10.6, 8.2, pass);
    this.outer.material.opacity = 1 - ramp(t, 0.12, 0.24);
    this.outer.visible = this.outer.material.opacity > 0.01;
    // 0.24 -> 1: push toward the nucleus; the nucleus fills the frame and goes dark
    const k = smooth(ramp(t, 0.22, 1.0));
    const z = lerp(camZ, -5.2, k);
    lookAtTarget(this.camera, V3(0.15 * Math.sin(t * 4), 0.1 * Math.cos(t * 3), z), V3(0, 0, -6), 0.02 * Math.sin(t * 5));
    this.camera.fov = lerp(50, 42, k); this.camera.updateProjectionMatrix();
    this.nuc.rotation.y = t * 0.8; this.nuc.rotation.x = 0.2;
    const dark = smooth(ramp(t, 0.6, 1.0));
    this.glow.intensity = lerp(2.2, 0.5, k) * (1 - dark * 0.9);
    this.lights.key.intensity = lerp(4.5, 0.9, k) * (1 - dark * 0.85);
    this.scene.fog.density = lerp(0.16, 0.34, k) + dark * 0.5;
  }
}

// ================================================================ LEG 5 ==
// The letter. The helix resolves from the dark, and one base pair lights.
class LegHelix extends Leg {
  constructor() { super('letter', 10); this.bloom = { strength: 0.55, radius: 0.8, threshold: 0.6 }; }
  build() {
    const s = this.scene; const rng = mulberry32(55);
    s.background = new THREE.Color(0x06080a); s.fog = new THREE.FogExp2(0x06080a, 0.075); s.environment = envTex; s.environmentIntensity = 0.28;
    const BP = 44, PITCH = 0.34, R = 1.0, OFF = Math.PI * 2 * 0.42;
    const p1 = [], p2 = [];
    for (let i = -6; i <= BP + 6; i++) { const a = i * (Math.PI * 2 / 10.4); const y = i * PITCH; p1.push(V3(R * Math.cos(a), y, R * Math.sin(a))); p2.push(V3(R * Math.cos(a + OFF), y, R * Math.sin(a + OFF))); }
    const strandMat = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.1 });
    const s1 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p1), 900, 0.13, 12, false), strandMat(GRADE.strandRed));
    const s2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2), 900, 0.13, 12, false), strandMat(GRADE.strandBlue));
    this.helix = new THREE.Group(); this.helix.add(s1, s2);
    // rungs: each pair is two half-cylinders meeting in the middle
    const baseCols = [0xb9b2a6, 0xa79f92, 0x9aa6b3, 0xb3a89c];
    this.pairs = [];
    for (let i = 0; i <= BP; i++) {
      const a = i * (Math.PI * 2 / 10.4); const y = i * PITCH;
      const A = V3(R * Math.cos(a), y, R * Math.sin(a)), B = V3(R * Math.cos(a + OFF), y, R * Math.sin(a + OFF));
      const mid = A.clone().lerp(B, 0.5); const len = A.distanceTo(B);
      const mk = (from, to, col) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, len / 2 - 0.03, 10), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.45, clearcoat: 0.3, emissive: 0x000000, emissiveIntensity: 0 })); const c = from.clone().lerp(to, 0.5); m.position.copy(c); m.quaternion.setFromUnitVectors(V3(0, 1, 0), to.clone().sub(from).normalize()); return m; };
      const t1 = Math.floor(rng() * 4), t2 = 3 - t1;
      const h1 = mk(A, mid, baseCols[t1]), h2 = mk(mid, B, baseCols[t2]);
      this.helix.add(h1, h2); this.pairs.push({ h1, h2, y, A, B, mid });
    }
    this.helix.rotation.z = 0.35; this.helix.rotation.x = 0.15;
    s.add(this.helix);
    this.peakIndex = 27; // the one letter
    const pk = this.pairs[this.peakIndex];
    this.peakLight = new THREE.PointLight(GRADE.green, 0, 0, 1.6); s.add(this.peakLight);
    this.peakWorld = pk.mid.clone().applyEuler(this.helix.rotation);
    this.lights = addKeyFill(s, V3(-8, 12, 6), V3(6, -3, 4), 5, 1.2);
    s.add(dustPoints(rng, 700, V3(24, 24, 24), 0.05, 0xbfd3ff, 0.2));
  }
  update(t) {
    // 0 -> 0.3: light rises, helix emerges from black. 0.3 -> 0.75: slow orbit + push. 0.7 -> 1: the pair lights and the camera settles.
    const rise = smooth(ramp(t, 0.0, 0.32));
    this.lights.key.intensity = lerp(0.15, 5.2, rise); this.lights.fill.intensity = lerp(0.05, 1.2, rise);
    this.scene.fog.density = lerp(0.14, 0.06, rise);
    const orbit = smooth(ramp(t, 0.1, 0.78));
    const settle = smooth(ramp(t, 0.7, 1.0));
    const ang = lerp(-1.1, 0.35, orbit) + settle * 0.05;
    const pk = this.peakWorld;
    const dist = lerp(11.5, 4.0, orbit) - settle * 0.4;
    const h = lerp(pk.y + 1.4, pk.y + 0.35, orbit);
    const pos = V3(pk.x + dist * Math.sin(ang), h, pk.z + dist * Math.cos(ang));
    lookAtTarget(this.camera, pos, V3(pk.x, lerp(pk.y + 2.5, pk.y, orbit), pk.z), lerp(0.08, -0.03, orbit));
    this.camera.fov = lerp(42, PORTRAIT ? 40 : 34, orbit); this.camera.updateProjectionMatrix();
    // the letter lights
    const lit = smooth(ramp(t, 0.72, 0.86));
    const pr = this.pairs[this.peakIndex];
    for (const m of [pr.h1, pr.h2]) { m.material.emissive.setHex(GRADE.green); m.material.emissiveIntensity = lit * 1.35; m.material.color.setHex(lit > 0.02 ? 0x9df5cf : 0xb9b2a6); }
    this.peakLight.position.copy(pk).add(V3(0, 0, 0.4)); this.peakLight.intensity = lit * 3.2;
    // neighbours warm faintly from the light; everything else stays graphite
    this.helix.rotation.y = t * 0.15;
  }
}

// ================================================================ LEG 6 ==
// The reading. Amplification curves rise; a flow cell lights cluster by cluster.
class LegReading extends Leg {
  constructor() { super('reading', 6); this.bloom = { strength: 0.45, radius: 0.7, threshold: 0.7 }; }
  build() {
    const s = this.scene; const rng = mulberry32(66);
    s.background = new THREE.Color(0x06090b); s.fog = new THREE.FogExp2(0x06090b, 0.05); s.environment = envTex; s.environmentIntensity = 0.2;
    // plot grid
    const grid = new THREE.GridHelper(40, 40, 0x18262a, 0x111a1d); grid.rotation.x = Math.PI / 2; grid.position.z = -0.4; s.add(grid);
    // curves: sigmoids with different Ct values, as glowing tubes
    this.curves = [];
    const cts = [0.32, 0.4, 0.47, 0.55, 0.63, 0.7];
    cts.forEach((ct, k) => {
      const pts = []; for (let i = 0; i <= 80; i++) { const x = i / 80; const y = 1 / (1 + Math.exp(-(x - ct) * 22)); pts.push(V3(-14 + x * 28, -6 + y * 12, 0)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const mat = new THREE.MeshBasicMaterial({ color: k === 0 ? GRADE.green : 0x2f8f6b, transparent: true, opacity: 1 });
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 320, k === 0 ? 0.09 : 0.055, 8, false), mat);
      m.userData.ct = ct; s.add(m); this.curves.push(m);
    });
    // threshold line
    const th = new THREE.Mesh(new THREE.BoxGeometry(28, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x3a4a50 })); th.position.set(0, -6 + 12 * 0.18, 0); s.add(th);
    // flow cell: a grid of clusters far behind, lighting in sequence
    const NX = 110, NY = 62; this.N = NX * NY;
    this.cell = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.N);
    const dummy = new THREE.Object3D(); this.order = new Float32Array(this.N);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const id = j * NX + i; dummy.position.set((i - NX / 2) * 0.34 + (rng() - 0.5) * 0.08, (j - NY / 2) * 0.34 + (rng() - 0.5) * 0.08, -30); dummy.updateMatrix(); this.cell.setMatrixAt(id, dummy.matrix); this.order[id] = (i / NX) * 0.6 + rng() * 0.4; this.cell.setColorAt(id, new THREE.Color(0x0a1512)); }
    this.cell.instanceMatrix.needsUpdate = true; this.cell.instanceColor.needsUpdate = true;
    s.add(this.cell);
    this.lights = addKeyFill(s, V3(-8, 10, 8), V3(6, -6, 6), 2, 0.5);
    s.add(dustPoints(rng, 500, V3(30, 20, 30), 0.05, 0xa8ffd9, 0.16));
    this.glowBall = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ color: GRADE.green, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.glowBall.position.set(-5.4, -1.9, 0); s.add(this.glowBall);
    this.dummy = dummy; this.col = new THREE.Color();
  }
  update(t) {
    // curves draw on from t=0..0.55 by scaling opacity along x via a moving clip: we emulate by scaling geometry draw range
    this.curves.forEach((m, k) => {
      const reveal = ramp(t, 0.02 + k * 0.05, 0.5 + k * 0.05);
      const total = m.geometry.index.count; m.geometry.setDrawRange(0, Math.floor(total * reveal));
      m.material.opacity = 0.35 + 0.65 * (k === 0 ? 1 : 0.6);
    });
    // flow cell lights from t=0.4 to 0.95, left to right with jitter
    const lit = ramp(t, 0.38, 0.95);
    for (let i = 0; i < this.N; i++) { const on = smooth(ramp(lit, this.order[i] - 0.08, this.order[i] + 0.04)); this.col.setRGB(lerp(0.03, 0.16, on), lerp(0.06, 0.52, on), lerp(0.05, 0.38, on)); this.cell.setColorAt(i, this.col); }
    this.cell.instanceColor.needsUpdate = true;
    // camera: start close on the first curve's rise (green bloom), pull back to reveal the plot, then swing to the flow cell
    const pull = smooth(ramp(t, 0.0, 0.45)); const swing = smooth(ramp(t, 0.5, 1.0));
    const posA = PORTRAIT ? V3(-4.2, 0.2, 11.5) : V3(-6.2, 0.6, 10.5), posB = V3(0, 1.5, 22), posC = V3(0, 0.5, -8);
    const pos = posA.clone().lerp(posB, pull).lerp(posC, swing);
    const tgtA = PORTRAIT ? V3(-6.0, 0.6, 0) : V3(-8.4, 0.9, 0), tgtB = V3(0, 0, 0), tgtC = V3(0, 0, -30);
    this.bloom.strength = lerp(0.62, 0.45, pull);
    const gf = 1 - smooth(ramp(t, 0.0, 0.26)); this.glowBall.scale.setScalar(lerp(0.12, 1.1, gf)); this.glowBall.material.opacity = gf * 0.55; this.glowBall.visible = gf > 0.01;
    const tgt = tgtA.clone().lerp(tgtB, pull).lerp(tgtC, swing);
    lookAtTarget(this.camera, pos, tgt, lerp(0.05, 0, pull));
    this.camera.fov = lerp(30, 44, pull); this.camera.updateProjectionMatrix();
    // near the end, the flow cell's light fills the frame
    this.scene.fog.density = lerp(0.05, 0.02, swing);
  }
}

// ================================================================ LEG 7 ==
// The report. Light lands on a sheet on a dark desk. The seal area waits.
class LegReport extends Leg {
  constructor() { super('report', 6); this.bloom = { strength: 0.22, radius: 0.5, threshold: 0.92 }; }
  build() {
    const s = this.scene; const rng = mulberry32(77);
    s.background = new THREE.Color(GRADE.canvas); s.fog = new THREE.FogExp2(GRADE.canvas, 0.03); s.environment = envTex; s.environmentIntensity = 0.25;
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.9 })); desk.rotation.x = -Math.PI / 2; s.add(desk);
    // paper: off-white, faint rules and blocks, no words
    const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
    g.fillStyle = '#d8d4cb'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#d9d5cc';
    g.fillRect(120, 150, 420, 16); g.fillRect(120, 190, 300, 10);
    for (let i = 0; i < 18; i++) { g.fillRect(120, 330 + i * 58, 620 + (i % 4) * 90, 6); g.fillRect(860, 330 + i * 58, 220, 6); }
    g.fillStyle = '#cfcbc2'; g.fillRect(120, 1440, 1000, 2); g.fillRect(120, 1560, 380, 6);
    // a faint seal ring, empty: the live seal will settle here
    g.strokeStyle = '#d2cec5'; g.lineWidth = 3; g.beginPath(); g.arc(940, 1560, 120, 0, 6.29); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const px = PORTRAIT ? 0 : 3.6, pz = PORTRAIT ? 3.2 : 0.4;
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(8.27, 11.69), new THREE.MeshStandardMaterial({ map: tex, color: 0xb9b5ad, roughness: 0.9, metalness: 0 }));
    this.paper.rotation.x = -Math.PI / 2; this.paper.rotation.z = 0.06; this.paper.position.set(px, 0.01, pz); s.add(this.paper);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(8.27, 11.69), new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.9 })); p2.rotation.x = -Math.PI / 2; p2.rotation.z = -0.03; p2.position.set(px + 0.35, 0.0, pz + 0.25); s.add(p2);
    this.px = px; this.pz = pz;
    // a pen, a glass of the tube cap? keep it clean: a pen only
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 6.2, 24), new THREE.MeshPhysicalMaterial({ color: 0x151719, roughness: 0.3, metalness: 0.6, clearcoat: 0.8 })); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; pen.position.set(px + 2.0, 0.1, pz + 4.6); s.add(pen);
    const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 24), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 })); clip.rotation.z = Math.PI / 2; clip.rotation.y = 0.5; clip.position.set(px + 4.6, 0.1, pz + 3.2); s.add(clip);
    this.lights = addKeyFill(s, V3(px - 7, 12, pz + 5), V3(px + 6, 3, pz + 6), 7, 1.4);
    this.lights.key.angle = Math.PI / 6; this.lights.key.penumbra = 0.7; this.lights.key.target.position.set(px, 0, pz);
    this.spill = new THREE.PointLight(GRADE.green, 0, 0, 1.8); this.spill.position.set(0, 4, 0); s.add(this.spill);
    s.add(dustPoints(rng, 300, V3(20, 12, 20), 0.045, 0xd9e6ff, 0.25));
  }
  update(t) {
    // starts inside the light (green spill from the reading), descends and settles above the sheet
    const k = smooth(ramp(t, 0, 0.85));
    this.spill.position.set(this.px, 3, this.pz);
    this.spill.intensity = lerp(26, 0, smooth(ramp(t, 0, 0.45)));
    this.lights.key.intensity = lerp(1.2, 3.8, k);
    const px = this.px, pz = this.pz;
    const pos = (PORTRAIT ? V3(px + 0.4, 15.5, pz + 4.5) : V3(px - 1.6, 14.5, pz + 6)).clone().lerp(PORTRAIT ? V3(px + 0.2, 10.5, pz + 1.0) : V3(px - 3.4, 8.6, pz + 3.2), k);
    const tgt = V3(px, 0, pz).lerp(V3(px - 1.4, 0, pz - 0.4), k);
    lookAtTarget(this.camera, pos, tgt, lerp(0.02, 0.0, k));
    this.camera.fov = lerp(48, 36, k); this.camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- legs --
const LEGS = [new LegDrop(), new LegPlasma('plasma', 6, 380, 1.0, 21), new LegPlasma('crowd', 6, 820, 1.9, 31), new LegMembrane(), new LegHelix(), new LegReading(), new LegReport()];
for (const l of LEGS) l.build();

const renderPass = new RenderPass(LEGS[0].scene, LEGS[0].camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.6, 0.85);
const gradePass = new ShaderPass(GradeShader);
const outPass = new OutputPass();
composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(gradePass); composer.addPass(outPass);

window.LEGS = LEGS.map((l) => ({ name: l.name, seconds: l.seconds }));
window.renderFrame = function (legIndex, t) {
  const leg = LEGS[legIndex];
  leg.update(clamp01(t));
  renderPass.scene = leg.scene; renderPass.camera = leg.camera;
  bloomPass.strength = leg.bloom.strength; bloomPass.radius = leg.bloom.radius; bloomPass.threshold = leg.bloom.threshold;
  composer.render();
  return canvas.toDataURL('image/png');
};
window.worldReady = true;
