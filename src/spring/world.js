// The Spring map: cherry trees, pink azaleas and wildflowers, ink grass, rocks, fences,
// stone lanterns, a bridge, the inn, the dojo, the wayside shrine, the great shrine and its red torii. Static props are
// merged into one mesh per material so the whole valley is a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS } from '../config.js';
import { hatch, flat, noEdges, seeded } from '../ink.js';
import { heightAt, roadAt, waterAt, roadCurves, streamCurve, CLEARINGS, STOPS, WORLD, DUEL_SPOTS, ARENA_R } from './terrain.js';

// Spring's accent: pink, alongside the red that marks danger, the sun and the shrine
export const PINK = { petal: 0xf5bcd0, blossom: 0xee9ab9, deep: 0xdf6a95, ink: 0x8c2a52 };

const rand = seeded(2024);
const rr = (a, b) => a + rand() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

// ---------- materials ----------
const MAT = {
  bark: hatch(0.22, COLORS.paper, 0.9),
  wood: hatch(0.5),
  woodDark: hatch(0.3),
  stone: hatch(0.66),
  stoneDark: hatch(0.5),
  plaster: hatch(0.95),
  thatch: hatch(0.42, COLORS.paper, 0.75),
  tile: hatch(0.28, COLORS.paper, 0.8),
  pine: hatch(0.58),
  pineDark: hatch(0.5),
  bamboo: hatch(0.62, COLORS.paper, 0.7),
  blossomA: hatch(0.92, PINK.blossom, 1.2, { fill: 0.92, ink: PINK.ink }),
  blossomB: hatch(0.84, PINK.blossom, 1.2, { fill: 0.92, ink: PINK.ink }),
  blossomC: hatch(1.0, PINK.petal, 1.2, { fill: 0.95, ink: PINK.ink }),
  azalea: hatch(0.86, PINK.deep, 1.1, { fill: 0.92, ink: PINK.ink }),
  azaleaLight: hatch(0.96, PINK.blossom, 1.1, { fill: 0.9, ink: PINK.ink }),
  leaf: hatch(0.36, COLORS.paper, 0.8),
  torii: hatch(0.7, COLORS.red, 1, { fill: 0.95, ink: 0x2a0708 }),
  red: hatch(0.7, COLORS.red, 1, { fill: 0.95, ink: 0x2a0708 }),
};

// ---------- static batching ----------
class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  // a primitive at position/rotation/scale
  put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = null) {
    m4.compose(v1.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), v2.set(sx, sy, sz));
    if (parent) m4.premultiply(parent);
    this.add(geo, mat, m4);
  }
  // a cylinder (unit height, centered) stretched between two points
  limb(geo, mat, a, b, r = 1, parent = null) {
    const d = v2.subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(UP, d.clone().normalize());
    m4.compose(v1.addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    if (parent) m4.premultiply(parent);
    this.add(geo, mat, m4);
  }
  build(scene) {
    for (const [mat, list] of this.groups) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
}

function facet(g) {
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
const GEO = {
  blob: facet(new THREE.IcosahedronGeometry(1, 1)),
  blobLo: facet(new THREE.IcosahedronGeometry(1, 0)),
  rock: facet(new THREE.DodecahedronGeometry(1, 0)),
  limb: new THREE.CylinderGeometry(0.75, 1, 1, 7),
  pole: new THREE.CylinderGeometry(1, 1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone4: new THREE.ConeGeometry(1, 1, 4, 1),
  cone6: new THREE.ConeGeometry(1, 1, 6, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  sphere: new THREE.SphereGeometry(1, 10, 8),
};

// ---------- colliders ----------
// canopies: tree crowns the camera pulls in front of so they never block the view
export const colliders = { circles: [], segments: [], fords: [], canopies: [] };
const addCircle = (x, z, r) => colliders.circles.push({ x, z, r });
const addSegment = (ax, az, bx, bz, r = 0.25) => colliders.segments.push({ ax, az, bx, bz, r });

// keep features out of each other's way
const taken = [];
function isFree(x, z, r, { road = 0.12, water = 0.08 } = {}) {
  if (Math.abs(x) > WORLD / 2 - 4 || Math.abs(z) > WORLD / 2 - 4) return false;
  if (roadAt(x, z) > road || waterAt(x, z) > water) return false;
  for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
  return true;
}
const take = (x, z, r) => taken.push({ x, z, r });
for (const [x, z, r] of Object.values(CLEARINGS)) take(x, z, r * 0.6);
for (const d of DUEL_SPOTS) take(d.x, d.z, ARENA_R + 3); // duel ground stays open

// ---------- vegetation ----------

// the crown's bounds in world space, from where its blossom clouds actually sit
function canopyFrom(tips, base, pad) {
  const w = tips.map((t) => t.clone().applyMatrix4(base));
  const cx = w.reduce((a, p) => a + p.x, 0) / w.length, cz = w.reduce((a, p) => a + p.z, 0) / w.length;
  const r = Math.max(...w.map((p) => Math.hypot(p.x - cx, p.z - cz))) + pad;
  colliders.canopies.push({ x: cx, z: cz, r, y0: Math.min(...w.map((p) => p.y)) - pad, y1: Math.max(...w.map((p) => p.y)) + pad });
}

// petals on the ground under the trees: collected and drawn as one instanced mesh
const fallen = [];
function scatterPetals(x, z, radius, n) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (waterAt(px, pz) > 0.3) continue;
    fallen.push([px, pz]);
  }
}

function cherryTree(B, x, z, size = 1) {
  const y0 = heightAt(x, z);
  const base = new THREE.Matrix4().compose(v1.set(x, y0, z), q.setFromEuler(e.set(0, rand() * 6.28, 0)), v2.set(size, size, size));
  const blossom = [MAT.blossomA, MAT.blossomB, MAT.blossomC];
  // a crooked trunk in three bends
  const pts = [new THREE.Vector3(0, 0, 0)];
  let lean = new THREE.Vector3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)).normalize();
  for (let i = 0; i < 3; i++) {
    lean.add(new THREE.Vector3(rr(-0.35, 0.35), 0, rr(-0.35, 0.35))).normalize();
    pts.push(pts[i].clone().addScaledVector(lean, rr(0.9, 1.3)));
  }
  for (let i = 0; i < 3; i++) B.limb(GEO.limb, MAT.bark, pts[i], pts[i + 1], 0.24 - i * 0.05, base);
  // roots flare at the base
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + rand();
    B.limb(GEO.limb, MAT.bark, new THREE.Vector3(Math.cos(a) * 0.55, -0.05, Math.sin(a) * 0.55), new THREE.Vector3(0, 0.5, 0), 0.09, base);
  }
  // branches fork out from the upper trunk, each tip holding a cloud of blossom
  const tips = [];
  const nb = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < nb; i++) {
    const from = pts[1 + Math.floor(rand() * 3)].clone();
    const a = (i / nb) * 6.28 + rr(-0.4, 0.4);
    const out = rr(1.4, 2.4);
    const mid = from.clone().add(new THREE.Vector3(Math.cos(a) * out * 0.55, rr(0.5, 0.9), Math.sin(a) * out * 0.55));
    const tip = from.clone().add(new THREE.Vector3(Math.cos(a) * out, rr(0.6, 1.4), Math.sin(a) * out));
    B.limb(GEO.limb, MAT.bark, from, mid, 0.09, base);
    B.limb(GEO.limb, MAT.bark, mid, tip, 0.06, base);
    tips.push(tip, mid.clone().lerp(tip, 0.4).add(new THREE.Vector3(0, 0.3, 0)));
  }
  tips.push(pts[3].clone().add(new THREE.Vector3(0, 0.4, 0)));
  // each tip holds a cloud: a big soft mass with smaller puffs of blossom around it
  for (const t of tips) {
    const core = rr(0.55, 0.8);
    B.put(GEO.blob, blossom[Math.floor(rand() * 2)], t.x, t.y, t.z, rand() * 3, rand() * 3, 0, core * 1.25, core * 0.8, core * 1.25, base);
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.28, r = rr(0.5, 1.0);
      const s = rr(0.28, 0.5);
      B.put(GEO.blob, blossom[Math.floor(rand() * 3)],
        t.x + Math.cos(a) * r, t.y + rr(-0.35, 0.45), t.z + Math.sin(a) * r,
        rand() * 3, rand() * 3, 0, s * rr(1, 1.25), s * rr(0.75, 0.95), s * rr(1, 1.25), base);
    }
  }
  // a few blossom sprays droop below the canopy
  for (let k = 0; k < 4; k++) {
    const t = tips[Math.floor(rand() * tips.length)];
    B.put(GEO.blobLo, MAT.blossomC, t.x + rr(-0.8, 0.8), t.y - rr(0.5, 0.9), t.z + rr(-0.8, 0.8), rand() * 3, rand() * 3, 0, 0.3, 0.45, 0.3, base);
  }
  addCircle(x, z, 0.4 * size);
  canopyFrom(tips, base, 1.1 * size);
  take(x, z, 2.2 * size);
  scatterPetals(x, z, 3.4 * size, Math.floor(60 * size));
}

// weeping cherry: long hanging strands of blossom
function weepingCherry(B, x, z, size = 1.6) {
  const y0 = heightAt(x, z);
  const base = new THREE.Matrix4().compose(v1.set(x, y0, z), q.identity(), v2.set(size, size, size));
  const top = new THREE.Vector3(0.2, 3.4, 0);
  B.limb(GEO.limb, MAT.bark, new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.2, 1.8, 0.1), 0.34, base);
  B.limb(GEO.limb, MAT.bark, new THREE.Vector3(-0.2, 1.8, 0.1), top, 0.24, base);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.28;
    const out = rr(1.6, 2.8);
    const tip = new THREE.Vector3(Math.cos(a) * out, rr(3.6, 4.6), Math.sin(a) * out);
    B.limb(GEO.limb, MAT.bark, top, tip, 0.07, base);
    B.put(GEO.blob, MAT.blossomA, tip.x, tip.y + 0.1, tip.z, rand() * 3, rand() * 3, 0, 0.9, 0.5, 0.9, base);
    // strands fall from the branch tip in beads of blossom
    for (let s = 0; s < 3; s++) {
      const sx = tip.x * rr(1.0, 1.25), sz = tip.z * rr(1.0, 1.25);
      for (let k = 0; k < 6; k++) {
        const y = tip.y - 0.35 - k * 0.42;
        if (y < 0.6) break;
        B.put(GEO.blobLo, k % 2 ? MAT.blossomC : MAT.blossomB, sx + rr(-0.05, 0.05), y, sz + rr(-0.05, 0.05), rand() * 3, rand() * 3, 0, 0.2, 0.3, 0.2, base);
      }
    }
  }
  addCircle(x, z, 0.6 * size);
  colliders.canopies.push({ x, z, r: 3.4 * size, y0: y0 + 1.2 * size, y1: y0 + 5 * size });
  take(x, z, 3.2 * size);
  scatterPetals(x, z, 4.5 * size, 160);
}

// azaleas: a dark mound of leaves smothered in small pink flower heads
function azalea(B, x, z, size = 1) {
  const y = heightAt(x, z);
  B.put(GEO.blob, MAT.leaf, x, y + 0.25 * size, z, 0, rand() * 3, 0, 0.6 * size, 0.38 * size, 0.6 * size);
  const n = 14 + Math.floor(rand() * 8);
  for (let k = 0; k < n; k++) {
    const a = rand() * 6.28, el = rr(0.15, 1.4);
    const s = rr(0.22, 0.36) * size;
    const rx = Math.cos(a) * Math.cos(el) * 0.62 * size, rz = Math.sin(a) * Math.cos(el) * 0.62 * size;
    B.put(GEO.blob, rand() < 0.6 ? MAT.azalea : MAT.azaleaLight, x + rx, y + 0.25 * size + Math.sin(el) * 0.38 * size, z + rz,
      rand() * 3, rand() * 3, 0, s, s * 0.8, s);
  }
  addCircle(x, z, 0.7 * size);
  take(x, z, 1.1 * size);
}

function pine(B, x, z, size = 1) {
  const y0 = heightAt(x, z);
  const base = new THREE.Matrix4().compose(v1.set(x, y0, z), q.setFromEuler(e.set(0, rand() * 6.28, 0)), v2.set(size, size, size));
  const h = rr(4.5, 7.5);
  const lean = rr(-0.3, 0.3);
  const top = new THREE.Vector3(Math.sin(lean) * h, h, 0);
  B.limb(GEO.limb, MAT.bark, new THREE.Vector3(0, 0, 0), top, 0.22, base);
  const pads = 3 + Math.floor(rand() * 3);
  for (let j = 0; j < pads; j++) {
    const t = 0.45 + (j / pads) * 0.55;
    const from = new THREE.Vector3(Math.sin(lean) * h * t, h * t, 0);
    const ang = rand() * 6.28;
    const reach = j === pads - 1 ? 0.2 : rr(0.9, 2);
    const to = from.clone().add(new THREE.Vector3(Math.cos(ang) * reach, rr(0.25, 0.55), Math.sin(ang) * reach));
    if (reach > 0.3) B.limb(GEO.limb, MAT.bark, from, to, 0.06, base);
    const w = rr(0.9, 1.6) + (j === 0 ? 0.3 : 0);
    B.put(GEO.blob, j % 2 ? MAT.pine : MAT.pineDark, to.x, to.y, to.z, 0, rand() * 3, 0, w, rr(0.28, 0.4), w * rr(0.7, 1), base);
  }
  addCircle(x, z, 0.35 * size);
  colliders.canopies.push({ x, z, r: 2.2 * size, y0: y0 + 3 * size, y1: y0 + 8 * size });
  take(x, z, 2 * size);
}

function bambooGrove(B, cx, cz, radius, n) {
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * radius;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (roadAt(x, z) > 0.1) continue;
    const y = heightAt(x, z);
    const h = rr(6, 10);
    const lx = rr(-0.5, 0.5), lz = rr(-0.5, 0.5);
    const top = new THREE.Vector3(x + lx, y + h, z + lz);
    B.limb(GEO.pole, MAT.bamboo, new THREE.Vector3(x, y, z), top, 0.07);
    // nodes: darker rings up the stalk
    for (let k = 1; k < h / 0.9; k++) {
      const t = (k * 0.9) / h;
      B.put(GEO.pole, MAT.woodDark, x + lx * t, y + h * t, z + lz * t, 0, 0, 0, 0.085, 0.05, 0.085);
    }
    // leaf sprays near the top: thin flattened blades in ink
    for (let k = 0; k < 7; k++) {
      const t = rr(0.6, 1);
      const ang = rand() * 6.28;
      B.put(GEO.blobLo, MAT.pineDark, x + lx * t + Math.cos(ang) * 0.5, y + h * t, z + lz * t + Math.sin(ang) * 0.5,
        rr(-0.4, 0.4), ang, rr(-0.6, 0.6), 0.7, 0.035, 0.13);
    }
    addCircle(x, z, 0.12);
  }
  take(cx, cz, radius);
}

// ---------- props ----------

function rock(B, x, z, s, mat = MAT.stone) {
  const y = heightAt(x, z);
  B.put(GEO.rock, mat, x, y + s * 0.25, z, rand() * 3, rand() * 3, rand() * 3, s * rr(0.9, 1.4), s * rr(0.55, 0.85), s * rr(0.9, 1.3));
  if (s > 0.45) addCircle(x, z, s * 0.95);
}

function lantern(B, x, z, ry = 0) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.cyl6, MAT.stoneDark, 0, 0.12, 0, 0, 0, 0, 0.42, 0.24, 0.42, p);
  B.put(GEO.pole, MAT.stone, 0, 0.7, 0, 0, 0, 0, 0.13, 0.95, 0.13, p);
  B.put(GEO.cyl6, MAT.stoneDark, 0, 1.22, 0, 0, 0, 0, 0.34, 0.12, 0.34, p);
  B.put(GEO.box, MAT.plaster, 0, 1.46, 0, 0, 0, 0, 0.36, 0.36, 0.36, p); // the firebox
  B.put(GEO.box, MAT.woodDark, 0, 1.46, 0, 0, 0, 0, 0.38, 0.12, 0.2, p); // its window
  B.put(GEO.cone6, MAT.stoneDark, 0, 1.82, 0, 0, Math.PI / 6, 0, 0.6, 0.4, 0.6, p);
  B.put(GEO.sphere, MAT.stone, 0, 2.08, 0, 0, 0, 0, 0.1, 0.12, 0.1, p);
  addCircle(x, z, 0.4);
  take(x, z, 0.8);
}

// a split-rail fence following a list of points; gaps skip spans for broken sections
function fence(B, pts, { gap = 0.12, height = 1 } = {}) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const y = heightAt(x, z);
    const tilt = rr(-0.08, 0.08);
    B.put(GEO.box, MAT.woodDark, x, y + 0.55 * height, z, tilt, rand() * 3, tilt, 0.13, 1.1 * height, 0.13);
    if (i === 0) continue;
    const [px, pz] = pts[i - 1];
    if (rand() < gap) continue; // a fallen rail
    const py = heightAt(px, pz);
    for (const h of [0.45, 0.85]) {
      const a = new THREE.Vector3(px, py + h * height + rr(-0.04, 0.04), pz);
      const b = new THREE.Vector3(x, y + h * height + rr(-0.04, 0.04), z);
      const d = b.clone().sub(a);
      const len = d.length();
      m4.compose(a.clone().add(b).multiplyScalar(0.5), q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()), v2.set(len, 0.07, 0.06));
      B.add(GEO.box, MAT.wood, m4);
    }
    addSegment(px, pz, x, z, 0.2);
  }
}

// fence posts running alongside a road at a given side offset, between curve fractions
function roadFence(curve, t0, t1, side, offset) {
  const pts = [];
  const len = curve.getLength() * (t1 - t0);
  const n = Math.max(2, Math.round(len / 2.6));
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    pts.push([p.x - tan.z * side * offset, p.z + tan.x * side * offset]);
  }
  return pts;
}

function torii(B, x, z, ry, scale = 1) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(scale, scale, scale));
  const span = 2.6, h = 4.6;
  for (const sx of [-span, span]) {
    B.put(GEO.pole, MAT.torii, sx, h / 2, 0, 0, 0, sx * -0.012, 0.22, h, 0.22, p);
    B.put(GEO.pole, MAT.woodDark, sx, 0.25, 0, 0, 0, 0, 0.27, 0.5, 0.27, p); // black footings
  }
  B.put(GEO.box, MAT.torii, 0, h - 0.85, 0, 0, 0, 0, span * 2 + 1.2, 0.26, 0.2, p); // nuki
  B.put(GEO.box, MAT.torii, 0, h - 0.4, 0, 0, 0, 0, 0.22, 0.7, 0.18, p); // gakuzuka
  // kasagi: the upswept black-topped lintel, in three pieces so the ends rise
  B.put(GEO.box, MAT.torii, 0, h, 0, 0, 0, 0, span * 2 + 1.0, 0.3, 0.34, p);
  B.put(GEO.box, MAT.woodDark, 0, h + 0.24, 0, 0, 0, 0, span * 2 + 1.2, 0.18, 0.42, p);
  for (const s of [-1, 1]) {
    B.put(GEO.box, MAT.woodDark, s * (span + 1.35), h + 0.36, 0, 0, 0, s * 0.18, 1.6, 0.18, 0.42, p);
    v1.set(s * span, 0, 0).applyMatrix4(p);
    addCircle(v1.x, v1.z, 0.3 * scale);
  }
}

function shrine(B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.box, MAT.stone, 0, 0.35, 0, 0, 0, 0, 7, 0.7, 6, p); // stone platform
  B.put(GEO.box, MAT.stoneDark, 0, 0.18, 3.4, 0, 0, 0, 3, 0.36, 1, p); // step
  for (const sx of [-2.6, 0, 2.6]) for (const sz of [-2.1, 2.1]) B.put(GEO.box, MAT.woodDark, sx, 1.9, sz, 0, 0, 0, 0.25, 2.4, 0.25, p);
  B.put(GEO.box, MAT.plaster, 0, 1.9, -0.2, 0, 0, 0, 5, 2.3, 3.8, p);
  B.put(GEO.box, MAT.woodDark, 0, 1.4, 1.7, 0, 0, 0, 1.8, 1.6, 0.1, p); // the doors
  B.put(GEO.box, MAT.woodDark, 0, 3.1, 0, 0, 0, 0, 5.6, 0.2, 4.6, p);
  // a deep gabled roof with flared eaves
  for (const s of [-1, 1]) {
    B.put(GEO.box, MAT.tile, 0, 3.95, s * 1.6, s * 0.55, 0, 0, 7.4, 0.22, 4.0, p);
    B.put(GEO.box, MAT.tile, 0, 3.32, s * 3.25, s * 0.25, 0, 0, 7.6, 0.16, 0.9, p);
  }
  B.put(GEO.box, MAT.woodDark, 0, 4.75, 0, 0, 0, 0, 7.6, 0.3, 0.35, p); // ridge
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, s * 3.8, 4.95, 0, 0, 0, s * 0.5, 0.15, 0.7, 0.15, p);
  // a red offering box and a hanging rope with a bell
  B.put(GEO.box, MAT.red, 0, 1.0, 2.9, 0, 0, 0, 1.2, 0.5, 0.5, p);
  B.put(GEO.pole, MAT.plaster, 0, 2.4, 2.4, 0, 0, 0, 0.05, 1.2, 0.05, p);
  B.put(GEO.sphere, MAT.stoneDark, 0, 2.95, 2.4, 0, 0, 0, 0.16, 0.16, 0.16, p);
  // collider: the platform as a box of circles
  for (const sx of [-2.6, 0, 2.6]) for (const sz of [-2, 0, 2]) {
    v1.set(sx, 0, sz).applyMatrix4(p);
    addCircle(v1.x, v1.z, 1.6);
  }
  take(x, z, 6);
}

function inn(B, x, z, ry) {
  const y = heightAt(x, z) - 0.2;
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const W = 8, D = 5.5, H = 2.6;
  B.put(GEO.box, MAT.stoneDark, 0, 0.25, 0, 0, 0, 0, W + 0.4, 0.5, D + 0.4, p);
  B.put(GEO.box, MAT.plaster, 0, 0.5 + H / 2, 0, 0, 0, 0, W, H, D, p);
  // timber frame on the plaster
  for (let i = 0; i <= 4; i++) {
    const sx = -W / 2 + (W * i) / 4;
    B.put(GEO.box, MAT.woodDark, sx, 0.5 + H / 2, D / 2 + 0.02, 0, 0, 0, 0.2, H, 0.08, p);
    B.put(GEO.box, MAT.woodDark, sx, 0.5 + H / 2, -D / 2 - 0.02, 0, 0, 0, 0.2, H, 0.08, p);
  }
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, 0, 0.5 + H * (s > 0 ? 0.98 : 0.08), D / 2 + 0.03, 0, 0, 0, W, 0.16, 0.08, p);
  // sliding shoji doors and a noren curtain over the entrance
  B.put(GEO.box, MAT.woodDark, 0, 0.5 + 1.0, D / 2 + 0.05, 0, 0, 0, 2.2, 2.0, 0.05, p);
  for (const s of [-0.75, 0, 0.75]) B.put(GEO.box, MAT.plaster, s - 0.0, 0.5 + 1.95, D / 2 + 0.12, 0, 0, 0, 0.68, 0.7, 0.02, p);
  // a thick thatched hip roof
  B.put(GEO.cone4, MAT.thatch, 0, 0.5 + H + 1.35, 0, 0, Math.PI / 4, 0, W * 0.86, 2.9, D * 0.92, p);
  B.put(GEO.box, MAT.thatch, 0, 0.5 + H + 0.18, 0, 0, 0, 0, W + 1.6, 0.36, D + 1.6, p);
  B.put(GEO.box, MAT.woodDark, 0, 0.5 + H + 2.65, 0, 0, 0, 0, 2.4, 0.3, 0.4, p);
  // a red paper lantern by the door: the inn's sign
  B.put(GEO.sphere, MAT.red, 1.6, 0.5 + 1.9, D / 2 + 0.5, 0, 0, 0, 0.26, 0.36, 0.26, p);
  B.put(GEO.pole, MAT.woodDark, 1.6, 0.5 + 2.35, D / 2 + 0.5, 0, 0, 0, 0.03, 0.2, 0.03, p);
  // a bench and a rain barrel
  B.put(GEO.box, MAT.wood, -2.4, 0.95, D / 2 + 0.7, 0, 0, 0, 2.2, 0.1, 0.6, p);
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, -2.4 + s * 0.9, 0.72, D / 2 + 0.7, 0, 0, 0, 0.1, 0.45, 0.5, p);
  B.put(GEO.pole, MAT.wood, W / 2 + 0.6, 0.9, D / 2 - 0.4, 0, 0, 0, 0.45, 0.8, 0.45, p);
  for (let i = 0; i < 5; i++) {
    v1.set(-W / 2 + 0.8 + (i * (W - 1.6)) / 4, 0, 0).applyMatrix4(p);
    addCircle(v1.x, v1.z, D / 2 + 0.3);
  }
  take(x, z, 7);
}

// an arched plank bridge carrying the road over the stream
function bridge(B, x, z, ry, length = 9) {
  const y = Math.max(heightAt(x, z), 0);
  const p = new THREE.Matrix4().compose(v1.set(x, 0, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const width = 2.6;
  const base0 = heightAt(...rotXZ(x, z, ry, 0, -length / 2));
  const base1 = heightAt(...rotXZ(x, z, ry, 0, length / 2));
  const deckY = (t) => base0 + (base1 - base0) * t + Math.sin(t * Math.PI) * 0.75 + 0.15;
  const planks = 22;
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const t2 = (i + 1.5) / planks;
    const slope = Math.atan2(deckY(Math.min(1, t2)) - deckY(t), length / planks);
    B.put(GEO.box, i % 2 ? MAT.wood : MAT.woodDark, 0, deckY(t), -length / 2 + t * length, -slope, 0, 0, width, 0.12, length / planks - 0.03, p);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      B.put(GEO.box, MAT.woodDark, s * width / 2, deckY(t) + 0.45, -length / 2 + t * length, 0, 0, 0, 0.12, 0.9, 0.12, p);
      if (i) {
        const a = new THREE.Vector3(s * width / 2, deckY((i - 1) / 6) + 0.85, -length / 2 + ((i - 1) / 6) * length).applyMatrix4(p);
        const b = new THREE.Vector3(s * width / 2, deckY(t) + 0.85, -length / 2 + t * length).applyMatrix4(p);
        B.limb(GEO.pole, MAT.wood, a, b, 0.05);
        addSegment(a.x, a.z, b.x, b.z, 0.15);
      }
    }
    // piles down into the water
    B.put(GEO.pole, MAT.woodDark, s * width / 2, y - 0.4, -length * 0.22, 0, 0, 0, 0.12, 1.6, 0.12, p);
    B.put(GEO.pole, MAT.woodDark, s * width / 2, y - 0.4, length * 0.22, 0, 0, 0, 0.12, 1.6, 0.12, p);
  }
  colliders.fords.push({ x, z, ry, halfLen: length / 2 + 0.5, halfW: width / 2, deckY });
  take(x, z, length / 2);
}
function rotXZ(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

function stepStones(B, x, z, ry) {
  for (let i = -3; i <= 3; i++) {
    const [sx, sz] = rotXZ(x, z, ry, rr(-0.25, 0.25), i * 1.05);
    B.put(GEO.cyl6, MAT.stone, sx, heightAt(sx, sz) + 0.3, sz, 0, rand(), 0, rr(0.42, 0.55), 0.45, rr(0.42, 0.55));
  }
  colliders.fords.push({ x, z, ry, halfLen: 4, halfW: 0.9, deckY: null, stones: true });
}

// a little stone jizo with a red bib
function jizo(B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.cyl6, MAT.stoneDark, 0, 0.1, 0, 0, 0, 0, 0.3, 0.2, 0.3, p);
  B.put(GEO.sphere, MAT.stone, 0, 0.45, 0, 0, 0, 0, 0.2, 0.32, 0.18, p);
  B.put(GEO.sphere, MAT.stone, 0, 0.86, 0, 0, 0, 0, 0.13, 0.14, 0.13, p);
  B.put(GEO.cone6, MAT.red, 0, 0.6, 0.05, 0.25, 0, 0, 0.21, 0.24, 0.16, p);
  addCircle(x, z, 0.3);
}

// painted characters on a board: a canvas label floated just off the board's face
// (both faces when two-sided). ry: the direction the text faces, as a building's door.
function inkLabel(scene, text, x, y, z, ry, w, h, { twoSided = false, vertical = false, color = '#161514' } = {}) {
  const c = document.createElement('canvas');
  const px = 256;
  c.width = vertical ? Math.round((px * w) / h) : px;
  c.height = vertical ? px : Math.round((px * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (vertical) {
    const chars = [...text];
    const size = Math.min(c.width * 0.8, (c.height * 0.9) / chars.length);
    g.font = `800 ${size}px "Shippori Mincho", serif`;
    chars.forEach((ch, i) => g.fillText(ch, c.width / 2, c.height / 2 + (i - (chars.length - 1) / 2) * size));
  } else {
    g.font = `800 ${Math.min(c.height * 0.8, (c.width * 0.9) / [...text].length)}px "Shippori Mincho", serif`;
    g.fillText(text, c.width / 2, c.height * 0.53);
  }
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const geo = new THREE.PlaneGeometry(w * 0.95, h * 0.95);
  const faces = twoSided ? [1, -1] : [1];
  for (const f of faces) {
    const l = new THREE.Mesh(geo, mat);
    l.position.set(x + Math.sin(ry) * 0.035 * f, y, z + Math.cos(ry) * 0.035 * f);
    l.rotation.y = f > 0 ? ry : ry + Math.PI;
    scene.add(l);
    noEdges.add(l);
  }
}

// a signpost at the crossroads with painted boards
function signpost(scene, B, x, z, signs) {
  const y = heightAt(x, z);
  B.put(GEO.box, MAT.woodDark, x, y + 1.2, z, 0, 0, 0, 0.14, 2.4, 0.14);
  signs.forEach(([text, ang], i) => {
    const h = y + 1.9 - i * 0.42;
    const [cx, cz] = [x + Math.sin(ang) * 0.5, z + Math.cos(ang) * 0.5];
    B.put(GEO.box, MAT.plaster, cx, h, cz, 0, ang + Math.PI / 2, 0, 1.0, 0.3, 0.05);
    inkLabel(scene, text, cx, h, cz, ang + Math.PI / 2, 1.0, 0.28, { twoSided: true });
  });
  addCircle(x, z, 0.2);
  take(x, z, 1.2);
}

// the dojo: a long hall on a stone base, open at the front onto a veranda, with a
// tiled gable roof, its name board over the door, and a rack of wooden practice swords
function dojo(scene, B, x, z, ry) {
  const y = heightAt(x, z) - 0.15;
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const W = 9, D = 6.4, H = 2.8, F = 0.65; // F: floor height
  B.put(GEO.box, MAT.stoneDark, 0, F / 2, 0, 0, 0, 0, W + 0.6, F, D + 0.4, p);
  B.put(GEO.box, MAT.wood, 0, F + 0.06, D / 2 + 0.7, 0, 0, 0, W + 0.6, 0.12, 1.4, p); // veranda
  B.put(GEO.box, MAT.stoneDark, 0, 0.2, D / 2 + 1.75, 0, 0, 0, 2.4, 0.4, 0.7, p); // step
  // the hall: plaster sides and back, the front open between dark posts
  B.put(GEO.box, MAT.plaster, 0, F + H / 2, -0.3, 0, 0, 0, W, H, D - 0.6, p);
  B.put(GEO.box, MAT.woodDark, 0, F + 1.1, D / 2 - 0.58, 0, 0, 0, 3.4, 2.2, 0.04, p); // the dark interior through the doorway
  for (const s of [-1, 1]) {
    // shoji either side of the doorway
    B.put(GEO.box, MAT.plaster, s * 2.85, F + 1.1, D / 2 - 0.56, 0, 0, 0, 2.3, 2.2, 0.06, p);
    for (let k = 0; k < 3; k++) B.put(GEO.box, MAT.woodDark, s * (1.95 + k * 0.9), F + 1.1, D / 2 - 0.52, 0, 0, 0, 0.05, 2.2, 0.05, p);
    B.put(GEO.box, MAT.woodDark, s * 2.85, F + 1.5, D / 2 - 0.52, 0, 0, 0, 2.3, 0.05, 0.05, p);
  }
  for (let i = 0; i <= 4; i++) {
    const sx = -W / 2 + (W * i) / 4;
    B.put(GEO.box, MAT.woodDark, sx, F + H / 2, D / 2 + 1.3, 0, 0, 0, 0.2, H, 0.2, p); // veranda posts
    B.put(GEO.box, MAT.woodDark, sx, F + H / 2, -D / 2 + 0.02, 0, 0, 0, 0.2, H, 0.08, p);
  }
  B.put(GEO.box, MAT.woodDark, 0, F + H, D / 2 + 1.3, 0, 0, 0, W + 0.2, 0.22, 0.24, p); // beam over the veranda
  B.put(GEO.box, MAT.woodDark, 0, F + H, -0.3, 0, 0, 0, W + 0.1, 0.2, D - 0.5, p);
  // a deep gabled roof of tiles with flared eaves, wide enough to cover the veranda
  for (const s of [-1, 1]) {
    B.put(GEO.box, MAT.tile, 0, F + H + 1.05, s * 2.0 + 0.35, s * 0.5, 0, 0, W + 1.8, 0.24, 4.9, p);
    B.put(GEO.box, MAT.tile, 0, F + H + 0.3, s * 4.25 + 0.35, s * 0.22, 0, 0, W + 2.0, 0.16, 1.0, p);
  }
  B.put(GEO.box, MAT.woodDark, 0, F + H + 2.15, 0.35, 0, 0, 0, W + 2.0, 0.32, 0.38, p); // ridge
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, s * (W / 2 + 1.0), F + H + 2.35, 0.35, 0, 0, s * 0.5, 0.15, 0.7, 0.15, p);
  // the name board over the door
  B.put(GEO.box, MAT.woodDark, 0, F + 2.35, D / 2 + 1.42, 0, 0, 0, 2.1, 0.9, 0.06, p);
  B.put(GEO.box, MAT.plaster, 0, F + 2.35, D / 2 + 1.46, 0, 0, 0, 1.9, 0.74, 0.04, p);
  v1.set(0, F + 2.35, D / 2 + 1.5).applyMatrix4(p);
  inkLabel(scene, '道場', v1.x, v1.y, v1.z, ry, 1.9, 0.74);
  // a rack of bokken by the steps, and a straw-wrapped striking post
  const rx = W / 2 - 0.4, rz = D / 2 + 2.6;
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, rx + s * 0.7, 0.55, rz, 0, 0, 0, 0.1, 1.1, 0.1, p);
  B.put(GEO.box, MAT.woodDark, rx, 1.0, rz, 0, 0, 0, 1.6, 0.08, 0.1, p);
  for (let k = 0; k < 4; k++) B.put(GEO.box, MAT.wood, rx - 0.5 + k * 0.33, 0.55, rz + 0.12, -0.18, 0, 0, 0.05, 1.05, 0.05, p);
  B.put(GEO.pole, MAT.woodDark, -rx, 0.8, rz, 0, 0, 0.04, 0.09, 1.6, 0.09, p);
  B.put(GEO.pole, MAT.thatch, -rx, 1.15, rz, 0, 0, 0.04, 0.16, 0.5, 0.16, p);
  for (const [lx, lz] of [[rx, rz], [-rx, rz]]) {
    v1.set(lx, 0, lz).applyMatrix4(p);
    addCircle(v1.x, v1.z, 0.6);
  }
  for (let i = 0; i < 5; i++) {
    v1.set(-W / 2 + 0.8 + (i * (W - 1.6)) / 4, 0, 0.3).applyMatrix4(p);
    addCircle(v1.x, v1.z, D / 2 + 0.5);
  }
  take(x, z, 8.5);
}

// a wayside shrine: a little roofed hokora on a stone plinth behind a small torii
function hokora(scene, B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.box, MAT.stoneDark, 0, 0.25, 0, 0, 0, 0, 2.0, 0.5, 1.7, p);
  B.put(GEO.box, MAT.stone, 0, 0.62, 0, 0, 0, 0, 1.5, 0.24, 1.25, p);
  B.put(GEO.box, MAT.wood, 0, 1.22, -0.05, 0, 0, 0, 1.0, 0.96, 0.8, p);
  B.put(GEO.box, MAT.woodDark, 0, 1.15, 0.36, 0, 0, 0, 0.5, 0.7, 0.04, p); // its little doors
  for (const s of [-1, 1]) B.put(GEO.box, MAT.tile, 0, 1.9, s * 0.36 - 0.05, s * 0.6, 0, 0, 1.5, 0.1, 0.95, p);
  B.put(GEO.box, MAT.woodDark, 0, 2.17, -0.05, 0, 0, 0, 1.55, 0.12, 0.14, p);
  // offerings: a red bib on a fox, a cup, a paper streamer
  B.put(GEO.box, MAT.red, 0, 0.82, 0.62, 0, 0, 0, 0.6, 0.16, 0.22, p);
  B.put(GEO.cyl6, MAT.plaster, -0.45, 0.82, 0.6, 0, 0, 0, 0.09, 0.14, 0.09, p);
  B.put(GEO.box, MAT.plaster, 0.3, 1.62, 0.4, 0, 0, 0.15, 0.1, 0.36, 0.01, p);
  v1.set(0, 0, 0).applyMatrix4(p);
  addCircle(v1.x, v1.z, 1.2);
  take(x, z, 2.5);
  const [tx, tz] = rotXZ(x, z, ry, 0, 3.6);
  torii(B, tx, tz, ry, 0.45);
  for (const s of [-1, 1]) lantern(B, ...rotXZ(x, z, ry, s * 1.9, 1.2), ry);
  jizo(B, ...rotXZ(x, z, ry, -1.6, -0.6), ry);
  weepingCherry(B, ...rotXZ(x, z, ry, 1.0, -4.2), 1.15);
}

// ---------- the whole valley ----------

export function buildWorld(scene) {
  const B = new Batcher();
  const main = roadCurves[0].curve;

  // the stream crossing on the main road: find where the road passes over the water
  let best = { w: 0, t: 0 };
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, pt = main.getPointAt(t);
    const w = waterAt(pt.x, pt.z);
    if (w > best.w) best = { w, t };
  }
  {
    const pt = main.getPointAt(best.t), tan = main.getTangentAt(best.t);
    bridge(B, pt.x, pt.z, Math.atan2(tan.x, tan.z), 10);
    lantern(B, ...rotXZ(pt.x, pt.z, Math.atan2(tan.x, tan.z), 2.6, 6.4), 0);
    lantern(B, ...rotXZ(pt.x, pt.z, Math.atan2(tan.x, tan.z), -2.6, -6.4), 0);
  }
  // stepping stones where the footpath fords the stream
  {
    const fp = roadCurves[1].curve;
    let bw = { w: 0, t: 0 };
    for (let i = 0; i <= 300; i++) {
      const t = i / 300, pt = fp.getPointAt(t);
      const w = waterAt(pt.x, pt.z);
      if (w > bw.w) bw = { w, t };
    }
    const pt = fp.getPointAt(bw.t), tan = fp.getTangentAt(bw.t);
    stepStones(B, pt.x, pt.z, Math.atan2(tan.x, tan.z));
  }

  // the shrine at the end of the road, behind its torii and an avenue of lanterns
  const [shx, shz] = CLEARINGS.shrine;
  shrine(B, shx, shz - 3, 0);
  torii(B, -3.6, -86, 0.15);
  for (let i = 0; i < 4; i++) {
    const t = 0.86 + i * 0.03;
    const pt = main.getPointAt(Math.min(0.995, t)), tan = main.getTangentAt(Math.min(0.995, t));
    for (const s of [-1, 1]) lantern(B, pt.x - tan.z * s * 3.4, pt.z + tan.x * s * 3.4, Math.atan2(tan.x, tan.z));
  }
  weepingCherry(B, shx - 9, shz + 2, 1.5);
  weepingCherry(B, shx + 10, shz + 1, 1.4);

  // the stops beside the main road: the inn, the dojo by the crossroads, the wayside shrine past the bridge
  {
    const I = STOPS.inn;
    inn(B, I.x, I.z, I.ry);
    // a hanging board by the door with the inn's character
    const [bx, bz] = rotXZ(I.x, I.z, I.ry, -3.0, 2.84);
    const by = heightAt(I.x, I.z) + 2.05;
    B.put(GEO.box, MAT.plaster, bx, by, bz, 0, I.ry, 0, 0.55, 0.95, 0.06);
    const [lx, lz] = rotXZ(I.x, I.z, I.ry, -3.0, 2.88);
    inkLabel(scene, '宿', lx, by, lz, I.ry, 0.5, 0.9, { vertical: true });
    bambooGrove(B, ...rotXZ(I.x, I.z, I.ry, 0, -10), 6, 60);
    fence(B, [rotXZ(I.x, I.z, I.ry, 5, 4), rotXZ(I.x, I.z, I.ry, 6.5, 0), rotXZ(I.x, I.z, I.ry, 6, -4.5)], { gap: 0 });
    lantern(B, ...rotXZ(I.x, I.z, I.ry, -3.6, 6.2), I.ry);
    const D = STOPS.dojo;
    dojo(scene, B, D.x, D.z, D.ry);
    lantern(B, ...rotXZ(D.x, D.z, D.ry, -3.2, 6.6), D.ry);
    lantern(B, ...rotXZ(D.x, D.z, D.ry, 3.2, 6.6), D.ry);
    const S = STOPS.shrine;
    hokora(scene, B, S.x, S.z, S.ry);
  }

  // the lookout: a great cherry over an open clearing ringed with stones
  const [lx, lz, lr] = CLEARINGS.lookout;
  weepingCherry(B, lx + 3, lz - 4, 1.8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 6.28;
    rock(B, lx + Math.cos(a) * (lr - 1), lz + Math.sin(a) * (lr - 1), rr(0.25, 0.4));
  }

  // the south gate: two posts and a sacred rope where the journey begins
  const [gx, gz] = CLEARINGS.gate;
  for (const s of [-1, 1]) {
    const x = gx + s * 2.6, y = heightAt(x, gz);
    B.put(GEO.pole, MAT.woodDark, x, y + 1.6, gz, 0, 0, 0, 0.18, 3.2, 0.18);
    addCircle(x, gz, 0.3);
  }
  B.limb(GEO.pole, MAT.plaster, new THREE.Vector3(gx - 2.6, heightAt(gx, gz) + 2.9, gz), new THREE.Vector3(gx + 2.6, heightAt(gx, gz) + 2.9, gz), 0.07);
  for (let i = 0; i < 4; i++) B.put(GEO.box, MAT.plaster, gx - 1.6 + i * 1.07, heightAt(gx, gz) + 2.6, gz, 0, 0, 0, 0.12, 0.45, 0.02);

  // crossroads: signpost and a row of jizo
  {
    const pt = main.getPointAt(0.48);
    signpost(scene, B, pt.x + 2.6, pt.z + 3, [['小道 ←', 0], ['社 ↑', Math.PI / 2], ['見晴 →', 0]]);
    for (let i = 0; i < 3; i++) jizo(B, pt.x - 3.4, pt.z + 4 + i * 0.7, Math.PI / 2);
  }

  // fences along stretches of the main road and the east road
  fence(B, roadFence(main, 0.02, 0.08, 1, 2.6));
  fence(B, roadFence(main, 0.03, 0.08, -1, 2.6));
  fence(B, roadFence(main, 0.33, 0.39, 1, 2.4));
  fence(B, roadFence(roadCurves[2].curve, 0.8, 0.95, 1, 2.0));
  fence(B, roadFence(roadCurves[1].curve, 0.06, 0.22, 1, 1.8));

  // cherry trees lining the main road in pairs, then groves across the meadows
  for (let t = 0.05; t < 0.86; t += 0.045) {
    const pt = main.getPointAt(t), tan = main.getTangentAt(t);
    for (const s of [-1, 1]) {
      if (rand() < 0.3) continue;
      const off = rr(4.2, 6);
      const x = pt.x - tan.z * s * off, z = pt.z + tan.x * s * off;
      if (isFree(x, z, 1.8, { road: 0.05 })) cherryTree(B, x, z, rr(0.9, 1.2));
    }
  }
  const groves = [[-30, 40, 14, 9], [34, 46, 16, 10], [-40, -2, 10, 6], [30, -10, 12, 7], [-30, -50, 12, 8], [34, -60, 14, 8], [-80, 40, 12, 7], [80, 50, 14, 7], [70, -50, 12, 6], [-70, -60, 12, 6]];
  for (const [cx, cz, rad, n] of groves) {
    for (let i = 0, made = 0; i < n * 8 && made < n; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * rad;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (isFree(x, z, 2.2)) { cherryTree(B, x, z, rr(0.85, 1.35)); made++; }
    }
  }

  // pink azaleas hugging the roads and the buildings
  for (const rc of roadCurves) {
    for (let t = 0.02; t < 0.98; t += 0.018) {
      if (rand() < 0.45) continue;
      const pt = rc.curve.getPointAt(t), tan = rc.curve.getTangentAt(t);
      const s = rand() < 0.5 ? -1 : 1;
      const off = rc.w * 0.5 + rr(1.6, 3.2);
      const x = pt.x - tan.z * s * off, z = pt.z + tan.x * s * off;
      if (isFree(x, z, 1)) azalea(B, x, z, rr(0.8, 1.3));
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = rr(-100, 100), z = rr(-100, 100);
    if (isFree(x, z, 1)) azalea(B, x, z, rr(0.7, 1.4));
  }

  // pines on the outer hills and a few in the valley
  for (let i = 0, made = 0; i < 600 && made < 70; i++) {
    const a = rand() * 6.28, r = rr(78, 118);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isFree(x, z, 2.4)) { pine(B, x, z, rr(1, 1.6)); made++; }
  }
  for (let i = 0, made = 0; i < 200 && made < 14; i++) {
    const x = rr(-70, 70), z = rr(-90, 90);
    if (isFree(x, z, 3)) { pine(B, x, z, rr(0.9, 1.2)); made++; }
  }

  // rocks: boulders in the fields, clusters by the water, pebbles along the verges
  for (let i = 0; i < 90; i++) {
    const x = rr(-105, 105), z = rr(-105, 105);
    if (!isFree(x, z, 1.5)) continue;
    const big = rr(0.5, 1.6);
    rock(B, x, z, big);
    for (let k = 0; k < 3; k++) if (rand() < 0.7) rock(B, x + rr(-1.6, 1.6), z + rr(-1.6, 1.6), big * rr(0.25, 0.5));
    take(x, z, big * 1.5);
  }
  {
    const pts = streamCurve.getSpacedPoints(160);
    for (const p of pts) {
      if (rand() < 0.5) continue;
      const s = rand() < 0.5 ? -1 : 1;
      const x = p.x + rr(-1, 1), z = p.z + s * rr(2.4, 3.6);
      if (Math.abs(x) < WORLD / 2 && roadAt(x, z) < 0.1) rock(B, x, z, rr(0.3, 0.8), rand() < 0.5 ? MAT.stone : MAT.stoneDark);
    }
  }
  for (const rc of roadCurves) {
    const n = Math.round(rc.curve.getLength() / 1.4);
    for (let i = 0; i < n; i++) {
      if (rand() < 0.4) continue;
      const t = i / n;
      const pt = rc.curve.getPointAt(t), tan = rc.curve.getTangentAt(t);
      const s = rand() < 0.5 ? -1 : 1;
      const off = rc.w * rr(0.45, 0.7);
      const x = pt.x - tan.z * s * off, z = pt.z + tan.x * s * off;
      if (waterAt(x, z) < 0.2) rock(B, x, z, rr(0.08, 0.2), MAT.stoneDark);
    }
  }

  B.build(scene);
  buildFallenPetals(scene);
  buildFlowers(scene);
  buildBackdrop(scene);
}

function buildFallenPetals(scene) {
  const geo = new THREE.CircleGeometry(0.07, 5);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, flat(PINK.blossom, { side: THREE.DoubleSide }), fallen.length);
  const d = new THREE.Object3D();
  fallen.forEach(([x, z], i) => {
    d.position.set(x, heightAt(x, z) + 0.03, z);
    d.rotation.set(rr(-0.2, 0.2), rand() * 6.28, 0);
    d.scale.set(rr(0.7, 1.4), 1, rr(0.5, 1));
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.frustumCulled = false;
  scene.add(mesh);
  noEdges.add(mesh);
}

// pink wildflowers through the grass: a thin ink stem and a five-petal head
function buildFlowers(scene) {
  const spots = [];
  for (let i = 0; i < 26000 && spots.length < 5200; i++) {
    const x = rr(-110, 110), z = rr(-110, 110);
    if (roadAt(x, z) > 0.1 || waterAt(x, z) > 0.1) continue;
    // drifts: flowers gather in patches
    const patch = Math.sin(x * 0.09) * Math.cos(z * 0.07) + Math.sin(x * 0.21 + z * 0.17) * 0.5;
    if (patch < 0.45) continue;
    spots.push([x, z]);
  }
  const stem = new THREE.PlaneGeometry(0.012, 1);
  stem.translate(0, 0.5, 0);
  const head = new THREE.CircleGeometry(0.085, 5);
  head.rotateX(-Math.PI / 2);
  const stems = new THREE.InstancedMesh(stem, flat(COLORS.ink, { side: THREE.DoubleSide }), spots.length);
  const heads = new THREE.InstancedMesh(head, flat(0xffffff, { side: THREE.DoubleSide }), spots.length);
  const d = new THREE.Object3D();
  spots.forEach(([x, z], i) => {
    const y = heightAt(x, z), h = rr(0.18, 0.42);
    d.position.set(x, y, z);
    d.rotation.set(rr(-0.15, 0.15), rand() * 6.28, rr(-0.15, 0.15));
    d.scale.set(1, h, 1);
    d.updateMatrix();
    stems.setMatrixAt(i, d.matrix);
    d.position.y = y + h;
    d.rotation.set(rr(-0.4, 0.4), rand() * 6.28, rr(-0.4, 0.4));
    const s = rr(0.8, 1.5);
    d.scale.set(s, 1, s);
    d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    heads.setColorAt(i, new THREE.Color(rand() < 0.6 ? PINK.deep : PINK.petal));
  });
  for (const m of [stems, heads]) { m.frustumCulled = false; scene.add(m); noEdges.add(m); }
}

// distant mountains swallowed by mist, and the low red sun
function buildBackdrop(scene) {
  const B = new Batcher();
  const mountainGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * 6.28 + rand() * 0.2;
    const r = rr(170, 230);
    const h = rr(30, 70);
    B.put(mountainGeo, hatch(0.55 + (i % 3) * 0.12, COLORS.paper, 1.6), Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, 0, rand() * 3, 0, rr(30, 50), h, rr(30, 50));
  }
  B.build(scene);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 48), flat(COLORS.red, { fog: false }));
  sun.position.set(-70, 38, -260);
  sun.lookAt(0, 6, 0);
  scene.add(sun);
  noEdges.add(sun);
}
