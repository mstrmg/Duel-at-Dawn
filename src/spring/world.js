// The Spring valley's props: cherry trees, pink azaleas and wildflowers, tea fields, the
// bamboo forest, pines on the heights, rocks, fences, lanterns, the red bridge, the stops
// (inn, dojo, shrines, teahouse, hot spring, the dice player's tarp), the tunnel of red
// torii and the great shrine. Static props are merged per material and per stretch of the
// valley, so what is out of view is skipped.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS } from '../config.js';
import { hatch, flat, noEdges, seeded } from '../ink.js';
import {
  heightAt, roadAt, waterAt, roadCurves, streamCurve, CLEARINGS, STOPS, MAP, inMap, DUEL_SPOTS, ARENA_R,
  riverAt, RIVER_HW, POOL, SHRINE, GATE, mainRoad, AMBUSH_SPOTS, FALLS_POOL,
} from './terrain.js';
import { tAtZ, beside, TORII_RUN, BAMBOO, BURNED_FARM } from './layout.js';
import { PINK } from './palette.js';
import { buildWater } from './water.js';
import { roofGeometry, gableGeometry, roofHeight } from './roofs.js';

export { PINK };

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
  charred: hatch(0.1),
  ash: hatch(0.3, COLORS.paper, 0.8),
  thicket: hatch(0.3, COLORS.paper, 0.9),
};

// ---------- static batching ----------
// One merged mesh per material per stretch of the valley (CHUNK meters square), so the
// renderer can skip whatever is out of view.
const CHUNK = 48;
class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    const key = `${Math.floor(matrix.elements[12] / CHUNK)},${Math.floor(matrix.elements[14] / CHUNK)}`;
    if (!this.groups.has(mat)) this.groups.set(mat, new Map());
    const byChunk = this.groups.get(mat);
    if (!byChunk.has(key)) byChunk.set(key, []);
    byChunk.get(key).push(g);
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
    for (const [mat, byChunk] of this.groups) {
      for (const list of byChunk.values()) {
        const geo = mergeGeometries(list);
        geo.computeBoundingSphere();
        scene.add(new THREE.Mesh(geo, mat));
      }
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

// A roof (see roofs.js) at (x, y, z) in a building's frame p, with its gable walls (at
// ±gx, from yBase up) and a ridge cap. Returns the ridge height in the building's frame.
function roof(B, p, mat, o, { x = 0, y = 0, z = 0, gable = null, gx = 0, ridge = MAT.woodDark, ridgeW = 0.3 } = {}) {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).premultiply(p);
  B.add(roofGeometry(o), mat, m);
  const curve = o.curve ?? 0.6, thick = o.thick ?? 0.2, t0 = o.t0 ?? 0, xh = o.xh ?? o.A;
  if (gable) {
    const yBase = t0 > 0 ? roofHeight(o.h, curve, t0) : 0;
    for (const sx of [-1, 1]) {
      const at = gx || (t0 > 0 ? xh - 0.06 : o.A - 0.3);
      B.add(gableGeometry({ Bz: o.Bz, h: o.h, curve, thick, yBase, x: sx * at }), gable, m);
    }
  }
  const top = o.h + (o.ribs ? (o.rib ?? 0.06) : 0);
  if (ridge) B.put(GEO.box, ridge, 0, top + ridgeW * 0.3, 0, 0, 0, 0, 2 * xh + ridgeW, ridgeW, ridgeW * 1.2, m);
  return y + top;
}

// ---------- colliders ----------
// canopies: tree crowns the camera pulls in front of so they never block the view
export const colliders = { circles: [], segments: [], fords: [], canopies: [] };
const addCircle = (x, z, r) => colliders.circles.push({ x, z, r });
const addSegment = (ax, az, bx, bz, r = 0.25) => colliders.segments.push({ ax, az, bx, bz, r });
const rippleRocks = []; // [x, z, r, water level] of stones standing in the river

// keep features out of each other's way
const taken = [];
function isFree(x, z, r, { road = 0.12, water = 0.08 } = {}) {
  if (!inMap(x, z, 4)) return false;
  if (roadAt(x, z) > road || waterAt(x, z) > water) return false;
  for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
  return true;
}
const take = (x, z, r) => taken.push({ x, z, r });
for (const [x, z, r] of Object.values(CLEARINGS)) take(x, z, r * 0.8);
for (const d of DUEL_SPOTS) take(d.x, d.z, ARENA_R + 3); // duel ground stays open
for (const a of AMBUSH_SPOTS) take(a.x, a.z, ARENA_R - 2); // and so does the ground where an ambush may fall
take(FALLS_POOL.x, FALLS_POOL.z, FALLS_POOL.r + 4);

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

// Bamboo: a few stalk designs (a leaning culm with dark nodes and sprays of leaves near
// the top) instanced many times, in chunks so the stands out of view are skipped.
const bambooAt = [];
function bambooGrove(B, cx, cz, radius, n) {
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * radius;
    plantBamboo(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
  }
  take(cx, cz, radius);
}
function plantBamboo(x, z) {
  if (roadAt(x, z) > 0.08 || waterAt(x, z) > 0.05 || !inMap(x, z, 3)) return false;
  for (const t of taken) if (t.bambooFree !== true && (t.x - x) ** 2 + (t.z - z) ** 2 < t.r * t.r) return false;
  bambooAt.push([x, z]);
  addCircle(x, z, 0.12);
  return true;
}
function bambooKit(seed) {
  const R = seeded(seed), r = (a, b) => a + R() * (b - a);
  const parts = { stalk: [], node: [], leaf: [] };
  const h = r(7, 9.5), lx = r(-0.6, 0.6), lz = r(-0.6, 0.6);
  const m = new THREE.Matrix4();
  const stalk = new THREE.CylinderGeometry(0.07, 0.085, h, 7, 1, true);
  stalk.translate(0, h / 2, 0);
  const shear = new THREE.Matrix4().set(1, lx / h, 0, 0, 0, 1, 0, 0, 0, lz / h, 1, 0, 0, 0, 0, 1);
  stalk.applyMatrix4(shear);
  parts.stalk.push(stalk);
  for (let y = 0.8; y < h - 0.3; y += r(0.75, 1.05)) {
    const ring = new THREE.CylinderGeometry(0.095, 0.095, 0.06, 7, 1, true);
    ring.translate(lx * (y / h), y, lz * (y / h));
    parts.node.push(ring);
  }
  for (let k = 0; k < 9; k++) {
    const t = r(0.55, 1), ang = R() * 6.28, reach = r(0.3, 0.9);
    const leaf = new THREE.IcosahedronGeometry(1, 0);
    m.compose(new THREE.Vector3(lx * t + Math.cos(ang) * reach, h * t, lz * t + Math.sin(ang) * reach),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r(-0.5, 0.5), ang, r(-0.7, 0.2))), new THREE.Vector3(0.75, 0.035, 0.14));
    leaf.applyMatrix4(m);
    parts.leaf.push(leaf);
  }
  return Object.fromEntries(Object.entries(parts).map(([k, list]) => [k, facet(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))))]));
}
function buildBamboo(scene) {
  const kits = [11, 23, 37].map(bambooKit);
  const mats = { stalk: MAT.bamboo, node: MAT.woodDark, leaf: MAT.pineDark };
  const chunks = new Map();
  bambooAt.forEach(([x, z], i) => {
    const key = `${i % kits.length}|${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push([x, z]);
  });
  const d = new THREE.Object3D();
  for (const [key, list] of chunks) {
    const kit = kits[Number(key.split('|')[0])];
    for (const part of ['stalk', 'node', 'leaf']) {
      const mesh = new THREE.InstancedMesh(kit[part], mats[part], list.length);
      list.forEach(([x, z], j) => {
        d.position.set(x, heightAt(x, z) - 0.1, z);
        d.rotation.set(0, ((x * 7.3 + z * 3.1) % 6.28), 0);
        const sc = 0.8 + (((x * 13.7 + z * 5.3) % 1) + 1) % 1 * 0.45;
        d.scale.set(1, sc, 1);
        d.updateMatrix();
        mesh.setMatrixAt(j, d.matrix);
      });
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  }
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
  B.put(GEO.box, MAT.stone, 0, -0.4, 0, 0, 0, 0, 7, 2.2, 6, p); // stone platform, sunk into the ground
  B.put(GEO.box, MAT.stoneDark, 0, 0.18, 3.4, 0, 0, 0, 3, 0.36, 1, p); // step
  for (const sx of [-2.6, 0, 2.6]) for (const sz of [-2.1, 2.1]) B.put(GEO.box, MAT.woodDark, sx, 1.9, sz, 0, 0, 0, 0.25, 2.4, 0.25, p);
  B.put(GEO.box, MAT.plaster, 0, 1.9, -0.2, 0, 0, 0, 5, 2.3, 3.8, p);
  B.put(GEO.box, MAT.woodDark, 0, 1.4, 1.7, 0, 0, 0, 1.8, 1.6, 0.1, p); // the doors
  B.put(GEO.box, MAT.woodDark, 0, 3.1, 0, 0, 0, 0, 5.6, 0.2, 4.6, p);
  // a hip-and-gable roof of tiles, sagging to deep eaves that turn up at the corners
  const xh = 2.3;
  const top = roof(B, p, MAT.tile, { A: 4.0, Bz: 3.4, h: 2.3, xh, t0: 0.45, thick: 0.22, curve: 0.6, lift: 0.4, ribs: 0.3, rib: 0.07 },
    { y: 2.78, z: -0.1, gable: MAT.woodDark, ridgeW: 0.38 });
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, s * (xh + 0.12), top + 0.32, -0.1, 0, 0, 0, 0.24, 0.46, 0.5, p); // the ridge ends
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

function inn(B, x, z, ry, { sign = true } = {}) {
  const y = heightAt(x, z) - 0.2;
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const W = 8, D = 5.5, H = 2.6;
  B.put(GEO.box, MAT.stoneDark, 0, -0.5, 0, 0, 0, 0, W + 0.4, 2.0, D + 0.4, p); // footing, sunk into the ground
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
  // a thick thatched roof, hipped below with a little smoke gable at each end, as a farmhouse
  // has, and a capped ridge
  roof(B, p, MAT.thatch, { A: W / 2 + 0.9, Bz: D / 2 + 0.9, h: 3.0, xh: 2.4, t0: 0.62, thick: 0.38, curve: 0.15 },
    { y: 0.5 + H - 0.13, gable: MAT.woodDark, ridgeW: 0.45 });
  // a red paper lantern by the door: the inn's sign
  if (sign) {
    B.put(GEO.sphere, MAT.red, 1.6, 0.5 + 1.9, D / 2 + 0.5, 0, 0, 0, 0.26, 0.36, 0.26, p);
    B.put(GEO.pole, MAT.woodDark, 1.6, 0.5 + 2.35, D / 2 + 0.5, 0, 0, 0, 0.03, 0.2, 0.03, p);
  }
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

// a red arched bridge carrying the road over the river: a plank deck on dark beams,
// lacquered rails with capped posts, and piles standing in the water
function bridge(B, x, z, ry, length = 15) {
  const p = new THREE.Matrix4().compose(v1.set(x, 0, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const width = 2.8;
  const base0 = heightAt(...rotXZ(x, z, ry, 0, -length / 2));
  const base1 = heightAt(...rotXZ(x, z, ry, 0, length / 2));
  const deckY = (t) => base0 + (base1 - base0) * t + Math.sin(t * Math.PI) * 1.25 + 0.12;
  const planks = 30;
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const t2 = (i + 1.5) / planks;
    const slope = Math.atan2(deckY(Math.min(1, t2)) - deckY(t), length / planks);
    B.put(GEO.box, i % 2 ? MAT.wood : MAT.woodDark, 0, deckY(t), -length / 2 + t * length, -slope, 0, 0, width, 0.12, length / planks - 0.03, p);
    B.put(GEO.box, MAT.woodDark, 0, deckY(t) - 0.22, -length / 2 + t * length, -slope, 0, 0, width - 0.4, 0.3, length / planks, p); // beam under
  }
  const posts = 8;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const zz = -length / 2 + t * length;
      B.put(GEO.box, MAT.red, s * width / 2, deckY(t) + 0.5, zz, 0, 0, 0, 0.16, 1.0, 0.16, p);
      B.put(GEO.cone4, MAT.woodDark, s * width / 2, deckY(t) + 1.08, zz, 0, Math.PI / 4, 0, 0.14, 0.18, 0.14, p); // giboshi caps
      if (i) {
        for (const h of [0.95, 0.5]) {
          const a = new THREE.Vector3(s * width / 2, deckY((i - 1) / posts) + h, -length / 2 + ((i - 1) / posts) * length).applyMatrix4(p);
          const b = new THREE.Vector3(s * width / 2, deckY(t) + h, zz).applyMatrix4(p);
          B.limb(GEO.pole, MAT.red, a, b, h > 0.9 ? 0.065 : 0.045);
          if (h > 0.9) addSegment(a.x, a.z, b.x, b.z, 0.15);
        }
      }
    }
    // piles down into the water, two pairs
    for (const f of [-0.2, 0.2]) {
      const [px, pz] = rotXZ(x, z, ry, s * (width / 2 - 0.2), f * length);
      const bed = heightAt(px, pz), top = deckY(0.5 + f) - 0.3;
      B.put(GEO.pole, MAT.woodDark, s * (width / 2 - 0.2), (bed + top) / 2 - 0.3, f * length, 0, 0, 0, 0.16, top - bed + 0.6, 0.16, p);
    }
  }
  colliders.fords.push({ x, z, ry, halfLen: length / 2 + 0.5, halfW: width / 2, deckY });
  take(x, z, length / 2 + 1);
}
function rotXZ(x, z, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

// stepping stones across the river: tall stones standing up from the bed
function stepStones(B, x, z, ry) {
  const level = riverAt(x, z)?.level ?? heightAt(x, z);
  const n = 6;
  for (let i = -n; i <= n; i++) {
    const [sx, sz] = rotXZ(x, z, ry, rr(-0.2, 0.2), i * 0.95);
    const bed = heightAt(sx, sz);
    if (bed > level + 0.1) continue; // on the bank: the path is dry here
    const top = level + 0.28;
    B.put(GEO.cyl6, MAT.stone, sx, (bed + top) / 2, sz, 0, rand(), 0, rr(0.42, 0.52), top - bed, rr(0.42, 0.52));
    rippleRocks.push([sx, sz, 0.55, level]);
  }
  colliders.fords.push({ x, z, ry, halfLen: n * 0.95 + 0.6, halfW: 0.9, deckY: null, stones: true, level });
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
  B.put(GEO.box, MAT.stoneDark, 0, (F - 1.5) / 2, 0, 0, 0, 0, W + 0.6, F + 1.5, D + 0.4, p); // footing, sunk into the ground
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
  // a hip-and-gable roof of tiles over the hall and the veranda, its eaves turning up
  const xh = 3.2;
  const top = roof(B, p, MAT.tile, { A: W / 2 + 0.9, Bz: 4.6, h: 2.3, xh, t0: 0.5, thick: 0.22, curve: 0.6, lift: 0.3, ribs: 0.34, rib: 0.07 },
    { y: F + H + 0.15, z: 0.65, gable: MAT.woodDark, ridgeW: 0.36 });
  for (const s of [-1, 1]) B.put(GEO.box, MAT.woodDark, s * (xh + 0.12), top + 0.3, 0.65, 0, 0, 0, 0.22, 0.42, 0.46, p); // the ridge ends
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
function hokora(scene, B, x, z, ry, { torii: withTorii = true } = {}) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.box, MAT.stoneDark, 0, -0.25, 0, 0, 0, 0, 2.0, 1.5, 1.7, p);
  B.put(GEO.box, MAT.stone, 0, 0.62, 0, 0, 0, 0, 1.5, 0.24, 1.25, p);
  B.put(GEO.box, MAT.wood, 0, 1.22, -0.05, 0, 0, 0, 1.0, 0.96, 0.8, p);
  B.put(GEO.box, MAT.woodDark, 0, 1.15, 0.36, 0, 0, 0, 0.5, 0.7, 0.04, p); // its little doors
  roof(B, p, MAT.tile, { A: 0.75, Bz: 0.62, h: 0.42, thick: 0.08, curve: 0.5, lift: 0.06 },
    { y: 1.69, z: -0.05, gable: MAT.wood, gx: 0.5, ridgeW: 0.12 });
  // offerings: a red bib on a fox, a cup, a paper streamer
  B.put(GEO.box, MAT.red, 0, 0.82, 0.62, 0, 0, 0, 0.6, 0.16, 0.22, p);
  B.put(GEO.cyl6, MAT.plaster, -0.45, 0.82, 0.6, 0, 0, 0, 0.09, 0.14, 0.09, p);
  B.put(GEO.box, MAT.plaster, 0.3, 1.62, 0.4, 0, 0, 0.15, 0.1, 0.36, 0.01, p);
  v1.set(0, 0, 0).applyMatrix4(p);
  addCircle(v1.x, v1.z, 1.2);
  take(x, z, 2.5);
  if (withTorii) {
    const [tx, tz] = rotXZ(x, z, ry, 0, 3.6);
    torii(B, tx, tz, ry, 0.45);
  }
  for (const s of [-1, 1]) lantern(B, ...rotXZ(x, z, ry, s * 1.9, 1.2), ry);
  jizo(B, ...rotXZ(x, z, ry, -1.6, -0.6), ry);
  weepingCherry(B, ...rotXZ(x, z, ry, 1.0, -4.2), 1.15);
}


// a teahouse: an open-fronted hut on a raised floor under a shingled roof, benches spread
// with red cloth, a great red parasol, and its character on a board
function teahouse(scene, B, x, z, ry) {
  const y = heightAt(x, z) - 0.1;
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const W = 7, D = 4.6, H = 2.4, F = 0.45;
  B.put(GEO.box, MAT.stoneDark, 0, (F - 1.5) / 2, 0, 0, 0, 0, W + 0.4, F + 1.5, D + 0.4, p);
  B.put(GEO.box, MAT.wood, 0, F + 0.05, 0, 0, 0, 0, W, 0.1, D, p);
  B.put(GEO.box, MAT.plaster, 0, F + H / 2, -D / 2 + 0.1, 0, 0, 0, W, H, 0.2, p); // back wall
  for (const sx of [-1, 1]) B.put(GEO.box, MAT.plaster, sx * (W / 2 - 0.1), F + H / 2, -0.4, 0, 0, 0, 0.2, H, D - 1, p);
  for (let i = 0; i <= 3; i++) B.put(GEO.box, MAT.woodDark, -W / 2 + (W * i) / 3, F + H / 2, D / 2 - 0.1, 0, 0, 0, 0.18, H, 0.18, p);
  B.put(GEO.box, MAT.woodDark, 0, F + H, D / 2 - 0.1, 0, 0, 0, W + 0.2, 0.2, 0.22, p);
  // inside: a hearth and shelves of cups
  B.put(GEO.box, MAT.stoneDark, 1.4, F + 0.3, -1.2, 0, 0, 0, 1.0, 0.5, 0.8, p);
  B.put(GEO.sphere, MAT.woodDark, 1.4, F + 0.75, -1.2, 0, 0, 0, 0.3, 0.25, 0.3, p);
  B.put(GEO.box, MAT.wood, -1.6, F + 1.3, -D / 2 + 0.35, 0, 0, 0, 2.2, 0.08, 0.35, p);
  for (let k = 0; k < 6; k++) B.put(GEO.cyl6, MAT.plaster, -2.5 + k * 0.36, F + 1.42, -D / 2 + 0.35, 0, 0, 0, 0.07, 0.14, 0.07, p);
  // a shingled gable roof, its gable ends closed in plaster
  roof(B, p, MAT.tile, { A: W / 2 + 0.7, Bz: D / 2 + 0.8, h: 1.7, thick: 0.16, curve: 0.35, lift: 0.08, ribs: 0.3, rib: 0.04 },
    { y: F + H - 0.18, gable: MAT.plaster, gx: W / 2 - 0.1, ridgeW: 0.26 });
  // noren over the front and the board
  for (const sx of [-0.9, 0, 0.9]) B.put(GEO.box, MAT.plaster, sx, F + H - 0.35, D / 2 + 0.02, 0, 0, 0, 0.82, 0.6, 0.02, p);
  B.put(GEO.box, MAT.plaster, -W / 2 - 0.2, 1.2, D / 2 + 0.6, 0, 0, 0, 0.5, 1.2, 0.08, p);
  B.put(GEO.box, MAT.woodDark, -W / 2 - 0.2, 0.3, D / 2 + 0.6, 0, 0, 0, 0.1, 0.6, 0.1, p);
  {
    const [lx, lz] = rotXZ(x, z, ry, -W / 2 - 0.2, D / 2 + 0.66);
    inkLabel(scene, '茶屋', lx, y + 1.2, lz, ry, 0.46, 1.1, { vertical: true });
  }
  // benches out front under a red parasol
  for (const bx of [-2.0, 1.6]) {
    B.put(GEO.box, MAT.red, bx, 0.62, D / 2 + 1.6, 0, 0, 0, 1.8, 0.08, 0.7, p);
    B.put(GEO.box, MAT.wood, bx, 0.55, D / 2 + 1.6, 0, 0, 0, 1.85, 0.08, 0.75, p);
    for (const sx of [-0.75, 0.75]) B.put(GEO.box, MAT.woodDark, bx + sx, 0.28, D / 2 + 1.6, 0, 0, 0, 0.08, 0.55, 0.6, p);
    v1.set(bx, 0, D / 2 + 1.6).applyMatrix4(p);
    addCircle(v1.x, v1.z, 0.7);
  }
  B.put(GEO.pole, MAT.woodDark, -0.2, 1.4, D / 2 + 1.9, 0, 0, 0.06, 0.05, 2.8, 0.05, p);
  B.put(GEO.cone6, MAT.red, -0.12, 2.85, D / 2 + 1.9, 0, 0, 0.06, 1.7, 0.55, 1.7, p);
  B.put(GEO.cone6, MAT.woodDark, -0.12, 2.6, D / 2 + 1.9, 0, 0, 0.06, 1.72, 0.06, 1.72, p);
  for (let i = 0; i < 4; i++) {
    v1.set(-W / 2 + 0.9 + (i * (W - 1.8)) / 3, 0, -0.2).applyMatrix4(p);
    addCircle(v1.x, v1.z, D / 2);
  }
  take(x, z, 7);
}

// the hot spring: a pool ringed with rocks, a little bathhouse, a bamboo screen, and a board
function onsen(scene, B, x, z, ry) {
  const { r, level } = POOL;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * 6.28 + rr(-0.08, 0.08);
    const rx = x + Math.sin(a) * (r + 0.35), rz = z + Math.cos(a) * (r + 0.35);
    const s = rr(0.35, 0.7);
    B.put(GEO.rock, rand() < 0.5 ? MAT.stone : MAT.stoneDark, rx, level + s * 0.2, rz, rand() * 3, rand() * 3, rand() * 3, s * 1.2, s * 0.7, s);
  }
  // the bathhouse beside the pool, back from the road
  const [hx, hz] = rotXZ(x, z, ry, -r - 3.6, -1.5);
  const hp = new THREE.Matrix4().compose(v1.set(hx, heightAt(hx, hz) - 0.1, hz), q.setFromEuler(e.set(0, ry + Math.PI / 2, 0)), v2.set(1, 1, 1));
  B.put(GEO.box, MAT.stoneDark, 0, -0.5, 0, 0, 0, 0, 3.6, 1.4, 3.2, hp);
  B.put(GEO.box, MAT.wood, 0, 1.3, 0, 0, 0, 0, 3.4, 2.2, 3.0, hp);
  for (const sx of [-1.7, 0, 1.7]) B.put(GEO.box, MAT.woodDark, sx, 1.3, 1.52, 0, 0, 0, 0.14, 2.2, 0.06, hp);
  B.put(GEO.box, MAT.woodDark, 0, 1.15, 1.52, 0, 0, 0, 1.2, 1.9, 0.05, hp);
  for (const sx of [-0.3, 0.3]) B.put(GEO.box, MAT.plaster, sx, 2.0, 1.58, 0, 0, 0, 0.55, 0.6, 0.02, hp);
  roof(B, hp, MAT.thatch, { A: 2.3, Bz: 2.1, h: 1.5, thick: 0.3, curve: 0.1 }, { y: 2.3, gable: MAT.wood, gx: 1.68, ridgeW: 0.3 });
  v1.set(0, 0, 0).applyMatrix4(hp);
  addCircle(v1.x, v1.z, 2.1);
  // a bamboo screen on the far side of the pool
  const sp = [];
  for (let i = 0; i <= 8; i++) sp.push(rotXZ(x, z, ry, -r - 1 + i * 0.95, -r - 1.4));
  for (const [sx, sz] of sp) {
    const sy = heightAt(sx, sz);
    B.put(GEO.pole, MAT.bamboo, sx, sy + 1.0, sz, 0, 0, 0, 0.06, 2.0, 0.06);
  }
  for (let i = 1; i < sp.length; i++) {
    for (const h of [0.6, 1.4]) {
      const a = new THREE.Vector3(sp[i - 1][0], heightAt(...sp[i - 1]) + h, sp[i - 1][1]);
      const b = new THREE.Vector3(sp[i][0], heightAt(...sp[i]) + h, sp[i][1]);
      B.limb(GEO.pole, MAT.bamboo, a, b, 0.04);
    }
    addSegment(sp[i - 1][0], sp[i - 1][1], sp[i][0], sp[i][1], 0.15);
  }
  // the board at the path: 湯, hot water
  const [bx, bz] = rotXZ(x, z, ry, 3.4, r + 2.4);
  const by = heightAt(bx, bz);
  B.put(GEO.box, MAT.woodDark, bx, by + 0.7, bz, 0, ry, 0, 0.1, 1.4, 0.1);
  B.put(GEO.box, MAT.plaster, bx, by + 1.45, bz, 0, ry, 0, 0.7, 0.7, 0.06);
  const [lx, lz] = rotXZ(x, z, ry, 3.4, r + 2.44);
  inkLabel(scene, '湯', lx, by + 1.45, lz, ry, 0.66, 0.66);
  addCircle(bx, bz, 0.2);
  // a wooden bucket and a ladle by the water
  const [kx, kz] = rotXZ(x, z, ry, 1.4, r + 0.9);
  B.put(GEO.cyl6, MAT.wood, kx, heightAt(kx, kz) + 0.2, kz, 0, 0, 0, 0.25, 0.4, 0.25);
  take(x, z, r + 2);
}

// the dice player's tarp: a cloth stretched over four poles, a straw mat, a low box and cups
function tarp(B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  for (const [sx, sz, h] of [[-1.6, -1.2, 2.3], [1.6, -1.2, 2.3], [-1.6, 1.3, 1.7], [1.6, 1.3, 1.7]]) {
    B.put(GEO.pole, MAT.woodDark, sx, h / 2, sz, 0, 0, 0, 0.05, h, 0.05, p);
    v1.set(sx, 0, sz).applyMatrix4(p);
    addCircle(v1.x, v1.z, 0.12);
  }
  B.put(GEO.box, MAT.plaster, 0, 2.0, 0.05, 0.24, 0, 0, 3.5, 0.04, 2.9, p);
  B.put(GEO.box, MAT.red, 0, 1.68, 1.45, 0, 0, 0, 3.4, 0.24, 0.02, p); // a red valance with the dice player's mark
  B.put(GEO.box, MAT.thatch, 0, 0.03, 0, 0, 0, 0, 2.6, 0.05, 1.8, p);
  B.put(GEO.box, MAT.woodDark, 0, 0.2, -0.1, 0, 0, 0, 0.9, 0.3, 0.6, p);
  B.put(GEO.cyl6, MAT.red, -0.15, 0.42, -0.1, 0, 0, 0, 0.12, 0.16, 0.12, p);
  B.put(GEO.box, MAT.plaster, 0.22, 0.38, -0.05, 0.3, 0.5, 0, 0.07, 0.07, 0.07, p);
  B.put(GEO.box, MAT.plaster, 0.32, 0.38, -0.2, 0.1, 1.1, 0, 0.07, 0.07, 0.07, p);
  B.put(GEO.box, MAT.wood, -1.0, 0.25, -0.8, 0, 0.3, 0, 0.5, 0.5, 0.5, p); // a crate of sake
  take(x, z, 3);
}

// a fox shrine: the little hokora, a stone fox either side with a red bib, and a run of
// small red torii leading in from the road
function foxShrine(scene, B, x, z, ry) {
  hokora(scene, B, x, z, ry, { torii: false });
  for (const sd of [-1, 1]) {
    const [fx, fz] = rotXZ(x, z, ry, sd * 1.25, 1.5);
    const fp = new THREE.Matrix4().compose(v1.set(fx, heightAt(fx, fz), fz), q.setFromEuler(e.set(0, ry - sd * 0.3, 0)), v2.set(1, 1, 1));
    B.put(GEO.box, MAT.stoneDark, 0, 0.3, 0, 0, 0, 0, 0.6, 0.6, 0.6, fp);
    B.put(GEO.sphere, MAT.stone, 0, 0.85, -0.05, 0.2, 0, 0, 0.2, 0.3, 0.24, fp);
    B.put(GEO.sphere, MAT.stone, 0, 1.2, 0.08, 0, 0, 0, 0.13, 0.13, 0.16, fp);
    B.put(GEO.cone4, MAT.stone, 0, 1.22, 0.22, Math.PI / 2, 0, 0, 0.06, 0.16, 0.06, fp); // snout
    for (const ex of [-0.07, 0.07]) B.put(GEO.cone4, MAT.stone, ex, 1.37, 0.06, 0, 0, 0, 0.04, 0.14, 0.04, fp);
    B.put(GEO.limb, MAT.stone, -sd * 0.12, 0.8, -0.2, -0.9, 0, 0, 0.09, 0.55, 0.09, fp); // tail
    B.put(GEO.cone6, MAT.red, 0, 1.0, 0.1, 0.35, 0, 0, 0.17, 0.18, 0.12, fp);
    addCircle(fx, fz, 0.4);
  }
  for (let i = 0; i < 5; i++) {
    const [tx, tz] = rotXZ(x, z, ry, 0, 3.0 + i * 1.25);
    torii(B, tx, tz, ry, 0.42);
  }
}

// rows of clipped tea bushes across a field, following the lie of the land
function teaField(B, cx, cz, w, d, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let row = -d / 2; row <= d / 2; row += 1.9) {
    let prev = null;
    for (let u = -w / 2; u <= w / 2; u += 0.85) {
      const x = cx + u * c + row * s, z = cz - u * s + row * c;
      if (roadAt(x, z) > 0.15 || waterAt(x, z) > 0.05 || !inMap(x, z, 4)) { prev = null; continue; }
      let blocked = false;
      for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < t.r * t.r) { blocked = true; break; }
      if (blocked) { prev = null; continue; }
      const y = heightAt(x, z);
      B.put(GEO.blobLo, rand() < 0.5 ? MAT.leaf : MAT.pineDark, x, y + 0.38, z, 0, ang + rr(-0.2, 0.2), 0, rr(0.55, 0.7), rr(0.45, 0.55), 0.62);
      if (prev) addSegment(prev[0], prev[1], x, z, 0.55);
      prev = [x, z];
    }
  }
}

// a stone standing in the river, ripples ringing it
function riverRock(B, x, z, s) {
  const r = riverAt(x, z);
  if (!r) return;
  const bed = heightAt(x, z), top = r.level + rr(0.35, 0.8);
  B.put(GEO.rock, rand() < 0.5 ? MAT.stone : MAT.stoneDark, x, (bed + top) / 2, z, rand() * 3, rand() * 3, rand() * 3, s * rr(1, 1.4), (top - bed) / 2 + 0.2, s);
  addCircle(x, z, s * 0.9);
  rippleRocks.push([x, z, s * 1.05, r.level]);
}

// the great shrine at the end of the road: the hall on its platform, a big torii at the
// forecourt, lanterns round the open ground where the Petal Blade will wait, and old cherries
function greatShrine(scene, B) {
  const { x, z, r } = SHRINE;
  shrine(B, x, z - r - 5, 0);
  torii(B, x - 0.3, z + r + 1.5, 0, 1.15);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.28 + 0.26;
    const lx = x + Math.sin(a) * (r + 1.2), lz = z + Math.cos(a) * (r + 1.2);
    if (Math.abs(lx - x) < 3 && Math.abs(Math.cos(a)) > 0.9) continue; // leave the way in and the steps clear
    lantern(B, lx, lz, -a);
  }
  weepingCherry(B, x - r - 6, z - r + 2, 2.0);
  weepingCherry(B, x + r + 7, z - r + 4, 1.8);
  weepingCherry(B, x - r - 3, z + r - 2, 1.3);
  // a sacred cedar bound with a straw rope and paper streamers
  const [cx, cz] = [x + r + 3, z + 6];
  const y = heightAt(cx, cz);
  B.limb(GEO.limb, MAT.bark, new THREE.Vector3(cx, y, cz), new THREE.Vector3(cx + 0.3, y + 11, cz), 0.75);
  for (let k = 0; k < 6; k++) B.put(GEO.blob, MAT.pineDark, cx + rr(-1.2, 1.2), y + 6 + k * 1.1, cz + rr(-1.2, 1.2), 0, rand() * 3, 0, rr(1.8, 2.6) - k * 0.25, 0.9, rr(1.6, 2.4) - k * 0.25);
  B.put(GEO.pole, MAT.thatch, cx + 0.04, y + 1.9, cz, 0, 0, 0, 0.82, 0.16, 0.82);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 6.28;
    B.put(GEO.box, MAT.plaster, cx + Math.cos(a) * 0.84, y + 1.6, cz + Math.sin(a) * 0.84, 0, -a, 0, 0.12, 0.4, 0.02);
  }
  addCircle(cx, cz, 0.9);
  colliders.canopies.push({ x: cx, z: cz, r: 2.8, y0: y + 5, y1: y + 13 });
  take(cx, cz, 3);
}

// ---------- the whole valley ----------

// Where an ambusher lies in wait: a thicket and a boulder off the road, dense enough to hide
// a man crouching behind them.
function thicket(B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  B.put(GEO.rock, MAT.stoneDark, -1.4, 0.45, 0.3, rand() * 3, rand() * 3, 0, 1.3, 1.0, 1.1, p);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * 6.28 + rand() * 0.5, r = rr(0.3, 1.3);
    const s = rr(0.7, 1.1);
    B.put(GEO.blob, k % 3 ? MAT.thicket : MAT.leaf, Math.cos(a) * r + 0.5, 0.55 + rr(0, 0.5), Math.sin(a) * r * 0.7, rand() * 3, rand() * 3, 0, s, s * 0.85, s, p);
  }
  for (let k = 0; k < 5; k++) B.put(GEO.blob, MAT.azalea, rr(-0.6, 1.6), rr(0.9, 1.4), rr(0.4, 0.9), 0, 0, 0, 0.3, 0.25, 0.3, p);
  v1.set(0.3, 0, 0).applyMatrix4(p);
  addCircle(v1.x, v1.z, 1.4);
  take(x, z, 2.6);
}

// The burned farm on the hill path: a house the war went through, its thatch fallen in
// over charred posts, a well, and a cart left where it broke.
function burnedFarm(scene, B, x, z, ry) {
  const y = heightAt(x, z);
  const p = new THREE.Matrix4().compose(v1.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), v2.set(1, 1, 1));
  const W = 8, D = 5.5;
  // the stone footing, and the floor black with ash
  B.put(GEO.box, MAT.stoneDark, 0, 0.12, 0, 0, 0, 0, W + 0.4, 0.34, D + 0.4, p);
  B.put(GEO.box, MAT.ash, 0, 0.3, 0, 0, 0, 0, W, 0.04, D, p);
  // charred posts, some broken short, a couple leaning
  const posts = [[-W / 2, -D / 2], [0, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [-W / 6, D / 2], [W / 6, D / 2], [W / 2, D / 2], [-W / 2, 0], [W / 2, 0]];
  posts.forEach(([px, pz], i) => {
    const h = [3.1, 1.4, 2.6, 2.2, 0.9, 3.0, 1.7, 2.8, 1.1][i];
    const lean = i === 2 ? 0.25 : i === 7 ? -0.18 : 0;
    B.put(GEO.box, MAT.charred, px, 0.3 + h / 2, pz, 0, 0, lean, 0.22, h, 0.22, p);
  });
  // a beam still up between two posts, another fallen across the floor
  B.put(GEO.box, MAT.charred, -W / 4, 3.05, D / 2, 0, 0, 0.05, W / 2 + 0.3, 0.2, 0.2, p);
  B.put(GEO.box, MAT.charred, 0.6, 0.55, 0.4, 0.1, 0.7, 0.18, 0.2, 0.2, W * 0.7, p);
  // the roof: one thatched slope slid down the back and onto the ground
  const r = new THREE.Matrix4().compose(v1.set(0.4, 0.3, -1.2), q.setFromEuler(e.set(0.32, 0, 0.06)), v2.set(1, 1, 1)).premultiply(p);
  B.add(roofGeometry({ A: W / 2 + 0.4, Bz: D / 2 + 0.6, h: 1.1, thick: 0.3, curve: 0.1 }), MAT.thatch, r);
  for (let k = 0; k < 7; k++) B.put(GEO.blob, MAT.ash, rr(-W / 2, W / 2), 0.35, rr(-D / 2, D / 2), 0, rand() * 3, 0, rr(0.4, 0.9), 0.12, rr(0.4, 0.8), p);
  // the well, its bucket still on the rope
  const [wx, wz] = [W / 2 + 3, D / 2 + 1.5];
  B.put(GEO.cyl6, MAT.stone, wx, 0.4, wz, 0, 0, 0, 0.75, 0.8, 0.75, p);
  B.put(GEO.cyl6, MAT.charred, wx, 0.82, wz, 0, 0, 0, 0.55, 0.06, 0.55, p);
  for (const sx of [-1, 1]) B.put(GEO.box, MAT.wood, wx + sx * 0.6, 1.3, wz, 0, 0, 0, 0.1, 1.8, 0.1, p);
  B.put(GEO.box, MAT.wood, wx, 2.2, wz, 0, 0, 0, 1.4, 0.1, 0.1, p);
  B.put(GEO.cyl6, MAT.wood, wx + 0.1, 1.15, wz, 0, 0, 0, 0.18, 0.24, 0.18, p);
  // the broken cart: a box on one wheel, the other wheel flat in the grass
  const [cx, cz] = [-W / 2 - 3.2, D / 2 + 1.2];
  B.put(GEO.box, MAT.wood, cx, 0.55, cz, 0, 0.4, 0.22, 2.0, 0.12, 1.1, p);
  B.put(GEO.box, MAT.wood, cx - 1.5, 0.45, cz - 0.5, 0, 0.4, 0.1, 1.6, 0.08, 0.08, p);
  const wheel = new THREE.TorusGeometry(0.5, 0.06, 5, 14);
  B.put(wheel, MAT.woodDark, cx + 0.2, 0.5, cz + 0.65, 0, 0.4, 0, 1, 1, 1, p);
  B.put(wheel, MAT.woodDark, cx + 1.4, 0.08, cz - 1.0, Math.PI / 2, 0, 0, 1, 1, 1, p);
  // a broken fence round the yard
  fence(B, [rotXZ(x, z, ry, -W / 2 - 1, -D / 2 - 3), rotXZ(x, z, ry, W / 2 + 2, -D / 2 - 3), rotXZ(x, z, ry, W / 2 + 5, 0)], { gap: 0.45 });
  for (const [ax, az] of [[-W / 2 - 1, -D / 2], [W / 2 + 1, -D / 2]]) {
    v1.set(ax, 0, az).applyMatrix4(p);
    addCircle(v1.x, v1.z, 0.6);
  }
  v1.set(0, 0, 0).applyMatrix4(p);
  for (let k = -1; k <= 1; k++) { v2.set(k * W / 3, 0, 0).applyMatrix4(p); addCircle(v2.x, v2.z, 1.4); }
  v2.set(wx, 0, wz).applyMatrix4(p);
  addCircle(v2.x, v2.z, 0.85);
  take(x, z, 9);
  // a dead pine by the house, and grave markers for whoever lived here
  const [px2, pz2] = rotXZ(x, z, ry, -W / 2 - 2, -D / 2 - 1.5);
  B.limb(GEO.limb, MAT.charred, new THREE.Vector3(px2, heightAt(px2, pz2), pz2), new THREE.Vector3(px2 + 0.5, heightAt(px2, pz2) + 4.5, pz2 + 0.2), 0.2);
  for (let k = 0; k < 3; k++) {
    const [gx, gz] = rotXZ(x, z, ry, W / 2 + 1.2 + k * 0.8, -D / 2 - 1.5);
    B.put(GEO.box, MAT.wood, gx, heightAt(gx, gz) + 0.45, gz, 0, ry, rr(-0.08, 0.08), 0.14, 0.9, 0.05);
  }
}

// The falls: water dropping off a horseshoe of rock into a pool, a sacred rope strung
// across the lip, and stones round the rim.
function waterfall(B) {
  const F = FALLS_POOL;
  // the cliff face: rock stacked up the horseshoe so the slope reads as stone
  for (let a = Math.PI * 0.45; a <= Math.PI * 1.55; a += 0.16) {
    if (Math.abs(a - Math.PI) < 0.24) continue; // the notch the water falls through
    const d = F.r + 1.6 + rr(-0.3, 0.4);
    const x = F.x + Math.cos(a) * d, z = F.z + Math.sin(a) * d;
    const base = F.level - 0.2;
    const top = heightAt(F.x + Math.cos(a) * (F.r + 3.2), F.z + Math.sin(a) * (F.r + 3.2));
    for (let y = base; y < top; y += rr(1.2, 1.8)) {
      const s = rr(0.9, 1.5);
      B.put(GEO.rock, rand() < 0.5 ? MAT.stoneDark : MAT.stone, x + rr(-0.4, 0.4), y + s * 0.4, z + rr(-0.4, 0.4), rand() * 3, rand() * 3, rand() * 3, s * 1.3, s * 0.9, s * 1.2);
    }
  }
  // stones round the rim of the pool, on the open side
  for (let a = -Math.PI * 0.5; a <= Math.PI * 0.5; a += 0.22) {
    const d = F.r + rr(0.2, 0.9);
    rock(B, F.x + Math.cos(a) * d, F.z + Math.sin(a) * d, rr(0.3, 0.7), MAT.stoneDark);
  }
  // the lip of the falls, and a shimenawa rope with paper streamers across it
  const lipY = heightAt(F.x - F.r - 3.2, F.z);
  const lx = F.x - F.r - 1.9;
  B.put(GEO.box, MAT.stoneDark, lx - 0.4, lipY - 0.2, F.z, 0, 0, 0, 1.6, 0.6, 3.6);
  B.limb(GEO.pole, MAT.thatch, new THREE.Vector3(lx, lipY + 1.4, F.z - 2.4), new THREE.Vector3(lx, lipY + 1.4, F.z + 2.4), 0.07);
  for (const sz of [-2.4, 2.4]) B.limb(GEO.pole, MAT.woodDark, new THREE.Vector3(lx, lipY, F.z + sz), new THREE.Vector3(lx, lipY + 1.6, F.z + sz), 0.07);
  for (let k = 0; k < 4; k++) B.put(GEO.box, MAT.plaster, lx + 0.05, lipY + 1.12, F.z - 1.5 + k, 0, 0, 0.1, 0.02, 0.4, 0.12);
  // pines leaning out over the drop
  pine(B, F.x - F.r - 6, F.z - 5, 1.2);
  pine(B, F.x - F.r - 5, F.z + 6, 1.1);
  weepingCherry(B, F.x + 2, F.z + F.r + 4, 1.4);
}

export function buildWorld(scene) {
  const B = new Batcher();
  const main = mainRoad;
  const along = (t) => ({ pt: main.getPointAt(t), tan: main.getTangentAt(t) });
  const sideOf = (t, side, off) => { const { pt, tan } = along(t); return [pt.x - tan.z * side * off, pt.z + tan.x * side * off]; };

  // ---- the river crossings: the red bridge on the road, stepping stones on the footpath
  const crossing = (c) => {
    let best = { d: 1e9, t: 0 };
    for (let i = 0; i <= 1200; i++) {
      const t = i / 1200, pt = c.getPointAt(t), r = riverAt(pt.x, pt.z);
      if (r && r.d < best.d) best = { d: r.d, t };
    }
    return best.t;
  };
  let bridgeAt;
  {
    const t = crossing(main), { pt, tan } = along(t), ry = Math.atan2(tan.x, tan.z);
    bridge(B, pt.x, pt.z, ry, 15);
    bridgeAt = [pt.x, pt.z];
    for (const sd of [-1, 1]) for (const end of [-1, 1]) lantern(B, ...rotXZ(pt.x, pt.z, ry, sd * 2.9, end * 9.6), ry);
    weepingCherry(B, ...rotXZ(pt.x, pt.z, ry, -9, -9), 1.7);
    weepingCherry(B, ...rotXZ(pt.x, pt.z, ry, 10, 8), 1.5);
  }
  let stonesAt;
  {
    const fp = roadCurves[1].curve, t = crossing(fp), pt = fp.getPointAt(t), tan = fp.getTangentAt(t);
    stepStones(B, pt.x, pt.z, Math.atan2(tan.x, tan.z));
    stonesAt = [pt.x, pt.z];
  }
  // stones standing in the river, and weeping cherries trailing over the water
  {
    const pts = streamCurve.getSpacedPoints(220);
    for (const p of pts) {
      if (!inMap(p.x, p.z, 8)) continue;
      if (Math.hypot(p.x - bridgeAt[0], p.z - bridgeAt[1]) < 12 || Math.hypot(p.x - stonesAt[0], p.z - stonesAt[1]) < 9) continue;
      const r = rand();
      if (r < 0.1) riverRock(B, p.x + rr(-1.5, 1.5), p.z + rr(-1.5, 1.5), rr(0.5, 0.9));
      else if (r < 0.17) {
        const sd = rand() < 0.5 ? -1 : 1;
        const tan = streamCurve.getTangentAt(Math.max(0, Math.min(1, (p.x - streamCurve.points[0].x) / 300)));
        const x = p.x - tan.z * sd * (RIVER_HW + 4.2), z = p.z + tan.x * sd * (RIVER_HW + 4.2);
        if (isFree(x, z, 3, { water: 0.02 })) weepingCherry(B, x, z, rr(1.2, 1.6));
      }
    }
  }

  // ---- the south gate, the farmhouses and the tea fields
  {
    const { x: gx, z: gz } = GATE;
    for (const sd of [-1, 1]) {
      const x = gx + sd * 2.6, y = heightAt(x, gz);
      B.put(GEO.pole, MAT.woodDark, x, y + 1.6, gz, 0, 0, 0, 0.18, 3.2, 0.18);
      addCircle(x, gz, 0.3);
    }
    B.limb(GEO.pole, MAT.plaster, new THREE.Vector3(gx - 2.6, heightAt(gx, gz) + 2.9, gz), new THREE.Vector3(gx + 2.6, heightAt(gx, gz) + 2.9, gz), 0.07);
    for (let i = 0; i < 4; i++) B.put(GEO.box, MAT.plaster, gx - 1.6 + i * 1.07, heightAt(gx, gz) + 2.6, gz, 0, 0, 0, 0.12, 0.45, 0.02);
    // two farmhouses by the road, the way the journey starts
    for (const [z, sd] of [[104, 1], [96, -1]]) {
      const t = tAtZ(z), [x, zz] = sideOf(t, sd, 13);
      const { tan } = along(t);
      const ry = Math.atan2(tan.z * sd, -tan.x * sd);
      if (isFree(x, zz, 5)) inn(B, x, zz, ry, { sign: false });
    }
    fence(B, roadFence(main, 0.0, 0.035, 1, 2.6));
    fence(B, roadFence(main, 0.005, 0.035, -1, 2.6));
    teaField(B, -26, 88, 26, 16, 0.12);
    teaField(B, 30, 70, 24, 18, -0.2);
    teaField(B, -30, 60, 22, 14, 0.3);
    teaField(B, 28, 100, 20, 12, 0.05);
  }

  // ---- the stops beside the road
  {
    const I = STOPS.inn;
    inn(B, I.x, I.z, I.ry);
    const [bx, bz] = rotXZ(I.x, I.z, I.ry, -3.0, 2.84);
    const by = heightAt(I.x, I.z) + 2.05;
    B.put(GEO.box, MAT.plaster, bx, by, bz, 0, I.ry, 0, 0.55, 0.95, 0.06);
    const [lx, lz] = rotXZ(I.x, I.z, I.ry, -3.0, 2.88);
    inkLabel(scene, '宿', lx, by, lz, I.ry, 0.5, 0.9, { vertical: true });
    bambooGrove(B, ...rotXZ(I.x, I.z, I.ry, 0, -11), 6, 50);
    fence(B, [rotXZ(I.x, I.z, I.ry, 5, 4), rotXZ(I.x, I.z, I.ry, 6.5, 0), rotXZ(I.x, I.z, I.ry, 6, -4.5)], { gap: 0 });
    lantern(B, ...rotXZ(I.x, I.z, I.ry, -3.6, 6.2), I.ry);
    for (const id of ['dojo', 'dojo2']) {
      const D = STOPS[id];
      dojo(scene, B, D.x, D.z, D.ry);
      lantern(B, ...rotXZ(D.x, D.z, D.ry, -3.2, 6.6), D.ry);
      lantern(B, ...rotXZ(D.x, D.z, D.ry, 3.2, 6.6), D.ry);
    }
    const S = STOPS.shrine;
    hokora(scene, B, S.x, S.z, S.ry);
    const F = STOPS.fox;
    foxShrine(scene, B, F.x, F.z, F.ry);
    const T = STOPS.teahouse;
    teahouse(scene, B, T.x, T.z, T.ry);
    const O = STOPS.onsen;
    onsen(scene, B, O.x, O.z, O.ry);
    const G = STOPS.gambler;
    tarp(B, G.x, G.z, G.ry);
  }

  // ---- the crossroads: signpost and a row of jizo
  {
    const pt = main.getPointAt(tAtZ(8));
    signpost(scene, B, pt.x + 2.6, pt.z + 3, [['小道 ←', 0], ['社 ↑', Math.PI / 2], ['見晴 →', 0]]);
    for (let i = 0; i < 3; i++) jizo(B, pt.x - 3.4, pt.z + 4 + i * 0.7, Math.PI / 2);
  }
  // the lookout: a great cherry over an open clearing ringed with stones
  {
    const [lx, lz, lr] = CLEARINGS.lookout;
    weepingCherry(B, lx + 3, lz - 4, 1.8);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28;
      rock(B, lx + Math.cos(a) * (lr - 1), lz + Math.sin(a) * (lr - 1), rr(0.25, 0.4));
    }
  }

  // ---- the tunnel of red torii, and the great shrine
  {
    const t0 = tAtZ(TORII_RUN[0]), t1 = tAtZ(TORII_RUN[1]);
    const n = Math.round((main.getLength() * (t1 - t0)) / 2.3);
    for (let i = 0; i <= n; i++) {
      const { pt, tan } = along(t0 + ((t1 - t0) * i) / n);
      torii(B, pt.x, pt.z, Math.atan2(tan.x, tan.z), 0.78);
    }
    for (let i = 0; i < 6; i++) {
      const t = t0 - 0.004 - i * 0.006;
      for (const sd of [-1, 1]) {
        const [x, z] = sideOf(t, sd, 3.3);
        lantern(B, x, z, Math.atan2(along(t).tan.x, along(t).tan.z));
      }
    }
    greatShrine(scene, B);
  }

  // ---- the side paths: the burned farm on the hill path, the falls and their shrine on
  // the waterfall path, and signposts where they leave the road
  {
    const fc = roadCurves[BURNED_FARM.road].curve;
    const b = beside(BURNED_FARM.t, BURNED_FARM.side, BURNED_FARM.off, 0, fc);
    burnedFarm(scene, B, b.x, b.z, b.ry);
    waterfall(B);
    const W = STOPS.falls;
    hokora(scene, B, W.x, W.z, W.ry);
    const sign = (road, t, side, signs) => {
      const c = roadCurves[road].curve, pt = c.getPointAt(t), tan = c.getTangentAt(t);
      signpost(scene, B, pt.x - tan.z * side * 2.4, pt.z + tan.x * side * 2.4, signs);
    };
    sign(3, 0.03, -1, [['丘 →', 0]]);
    sign(4, 0.03, 1, [['滝 ←', 0]]);
    // where an ambusher may hide
    for (const a of AMBUSH_SPOTS) thicket(B, a.hide[0], a.hide[1], a.ry);
  }

  // ---- fences along stretches of road
  fence(B, roadFence(main, tAtZ(70), tAtZ(56), 1, 2.4));
  fence(B, roadFence(roadCurves[2].curve, 0.8, 0.95, 1, 2.0));
  fence(B, roadFence(roadCurves[1].curve, 0.06, 0.2, 1, 1.8));
  fence(B, roadFence(main, tAtZ(-222), tAtZ(-238), -1, 2.6));
  fence(B, roadFence(main, tAtZ(-262), tAtZ(-276), 1, 2.6));

  // ---- the bamboo forest: dense stands either side of the road
  for (let i = 0, made = 0; i < 9000 && made < 1700; i++) {
    const z = rr(BAMBOO[1], BAMBOO[0]);
    const t = tAtZ(z), { pt, tan } = along(t);
    const sd = rand() < 0.5 ? -1 : 1, off = 4.6 + Math.pow(rand(), 1.4) * 42;
    const x = pt.x - tan.z * sd * off + rr(-1, 1), zz = pt.z + tan.x * sd * off + rr(-1, 1);
    // stands and glades
    const clump = Math.sin(x * 0.21 + z * 0.13) + Math.cos(z * 0.17 - x * 0.09);
    if (clump < -0.4 && rand() < 0.85) continue;
    if (plantBamboo(x, zz)) made++;
  }

  // ---- cherry trees lining the road in pairs; groves across the meadows
  const inBamboo = (z) => z < BAMBOO[0] + 4 && z > BAMBOO[1] - 4;
  const inTorii = (z) => z < TORII_RUN[0] + 6;
  for (let t = 0.02; t < tAtZ(TORII_RUN[0]); t += 0.016) {
    const { pt, tan } = along(t);
    if (inBamboo(pt.z)) continue;
    for (const sd of [-1, 1]) {
      if (rand() < 0.3) continue;
      const off = rr(4.2, 6);
      const x = pt.x - tan.z * sd * off, z = pt.z + tan.x * sd * off;
      if (isFree(x, z, 1.8, { road: 0.05 })) cherryTree(B, x, z, rr(0.9, 1.2));
    }
  }
  for (let gz = MAP.z1 - 30; gz > MAP.z0 + 30; gz -= 26) {
    if (inBamboo(gz) || inTorii(gz)) continue;
    for (const sd of [-1, 1]) {
      const cx = sd * rr(24, 62), rad = rr(9, 15), n = Math.round(rr(4, 9));
      for (let i = 0, made = 0; i < n * 8 && made < n; i++) {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * rad;
        const x = cx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
        if (isFree(x, z, 2.2)) { cherryTree(B, x, z, rr(0.85, 1.35)); made++; }
      }
    }
  }

  // ---- pink azaleas hugging the roads; more scattered through the meadows
  for (const rc of roadCurves) {
    for (let t = 0.01; t < 0.99; t += 4.5 / rc.curve.getLength()) {
      if (rand() < 0.45) continue;
      const pt = rc.curve.getPointAt(t), tan = rc.curve.getTangentAt(t);
      if (inTorii(pt.z) && pt.z > TORII_RUN[1]) continue;
      const sd = rand() < 0.5 ? -1 : 1;
      const off = rc.w * 0.5 + rr(1.6, 3.2);
      const x = pt.x - tan.z * sd * off, z = pt.z + tan.x * sd * off;
      if (isFree(x, z, 1)) azalea(B, x, z, rr(0.8, 1.3));
    }
  }
  for (let i = 0; i < 110; i++) {
    const x = rr(-100, 100), z = rr(MAP.z0 + 20, MAP.z1 - 10);
    if (isFree(x, z, 1)) azalea(B, x, z, rr(0.7, 1.4));
  }

  // ---- pines on the valley walls and the heights, crowding in toward the shrine
  for (let i = 0, made = 0; i < 2400 && made < 230; i++) {
    const z = rr(MAP.z0 + 10, MAP.z1 - 6);
    const heights = z < -215;
    const x = heights && rand() < 0.55 ? rr(-60, 60) : (rand() < 0.5 ? -1 : 1) * rr(58, 122);
    if (Math.abs(x) < 9 && !heights) continue;
    if (inBamboo(z) && Math.abs(x) < 50) continue;
    if (isFree(x, z, 2.4)) { pine(B, x, z, rr(1, 1.6)); made++; }
  }

  // ---- rocks: boulders in the fields, outcrops on the climb, pebbles along the verges
  for (let i = 0; i < 260; i++) {
    const x = rr(-110, 110), z = rr(MAP.z0 + 10, MAP.z1 - 6);
    if (!isFree(x, z, 1.5)) continue;
    const big = rr(0.5, 1.6) * (z < -215 ? 1.6 : 1);
    rock(B, x, z, big);
    for (let k = 0; k < 3; k++) if (rand() < 0.7) rock(B, x + rr(-1.6, 1.6), z + rr(-1.6, 1.6), big * rr(0.25, 0.5));
    take(x, z, big * 1.5);
  }
  {
    // the river banks: stones down by the water line
    const pts = streamCurve.getSpacedPoints(300);
    for (let i = 1; i < pts.length; i++) {
      if (rand() < 0.45) continue;
      const p = pts[i], q2 = pts[i - 1];
      const tx = p.x - q2.x, tz = p.z - q2.z, l = Math.hypot(tx, tz) || 1;
      const sd = rand() < 0.5 ? -1 : 1, off = RIVER_HW + rr(0.4, 2.2);
      const x = p.x - (tz / l) * sd * off, z = p.z + (tx / l) * sd * off;
      if (inMap(x, z, 2) && roadAt(x, z) < 0.1) rock(B, x, z, rr(0.25, 0.7), rand() < 0.5 ? MAT.stone : MAT.stoneDark);
    }
  }
  for (const rc of roadCurves) {
    const n = Math.round(rc.curve.getLength() / 1.4);
    for (let i = 0; i < n; i++) {
      if (rand() < 0.4) continue;
      const t = i / n;
      const pt = rc.curve.getPointAt(t), tan = rc.curve.getTangentAt(t);
      const sd = rand() < 0.5 ? -1 : 1;
      const off = rc.w * rr(0.45, 0.7);
      const x = pt.x - tan.z * sd * off, z = pt.z + tan.x * sd * off;
      if (waterAt(x, z) < 0.2) rock(B, x, z, rr(0.08, 0.2), MAT.stoneDark);
    }
  }

  B.build(scene);
  buildBamboo(scene);
  buildFallenPetals(scene);
  buildFlowers(scene);
  buildBackdrop(scene);
  return buildWater(scene, rippleRocks);
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
  for (let i = 0; i < 90000 && spots.length < 15000; i++) {
    const x = rr(-110, 110), z = rr(MAP.z0 + 8, MAP.z1 - 4);
    if (roadAt(x, z) > 0.1 || waterAt(x, z) > 0.1) continue;
    if (z < BAMBOO[0] && z > BAMBOO[1] && rand() < 0.8) continue; // little light under the bamboo
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

// distant mountains swallowed by mist along both sides of the valley and at its ends,
// and the low red sun over the far end
function buildBackdrop(scene) {
  const B = new Batcher();
  const mountainGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  const mats = [0, 1, 2].map((i) => hatch(0.55 + i * 0.12, COLORS.paper, 1.6));
  const put = (x, z, i) => {
    const h = rr(30, 75);
    B.put(mountainGeo, mats[i % 3], x, h / 2 - 2, z, 0, rand() * 3, 0, rr(30, 52), h, rr(30, 52));
  };
  let i = 0;
  for (let z = MAP.z1 + 60; z > MAP.z0 - 60; z -= rr(32, 44)) for (const sd of [-1, 1]) put(sd * rr(175, 235), z, i++);
  for (let x = -200; x <= 200; x += rr(36, 48)) { put(x, MAP.z1 + rr(120, 170), i++); put(x, MAP.z0 - rr(110, 160), i++); }
  B.build(scene);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(18, 48), flat(COLORS.red, { fog: false }));
  sun.position.set(-90, 52, MAP.z0 - 260);
  sun.lookAt(0, 6, SHRINE.z);
  sun.frustumCulled = false;
  scene.add(sun);
  noEdges.add(sun);
  // the sun hangs over the far end wherever you stand
  sun.onBeforeRender = (r, sc, cam) => { sun.position.set(cam.position.x - 90, 52, cam.position.z - 380); sun.lookAt(cam.position.x, 6, cam.position.z); };
}
