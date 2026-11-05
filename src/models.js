// Fighter models built from primitives in a pen-and-ink style, plus the weapon poses for each stance.
import * as THREE from 'three';
import { hatch, flat, noEdges } from "./ink.js";
import { COLORS } from './config.js';
import { PINK } from './spring/palette.js';

const D = THREE.MathUtils.degToRad;
const HIP_Y = 0.95; // where the body leans from: the obi

// A pose places the hands (fighter-local, +z faces the opponent, -x is the right side)
// and points the weapon with yaw/pitch. lean tips the torso forward, crouch lowers it.
export function pose(hx, hy, hz, pitch, yaw, lean = 0, crouch = 0, roll = 0) {
  return { hx, hy, hz, pitch: D(pitch), yaw: D(yaw), lean, crouch, roll: D(roll) };
}

export function lerpPose(a, b, t, out = {}) {
  for (const k of ['hx', 'hy', 'hz', 'pitch', 'yaw', 'lean', 'crouch', 'roll']) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

// Index by stance: 0 high, 1 mid, 2 low.
export const POSES = {
  katana: {
    guard: [pose(0.1, 1.85, 0.22, -118, -10), pose(0, 1.2, 0.45, -14, 0), pose(0, 0.95, 0.42, 28, 6, 0.05, 0.05)],
    windup: [
      pose(0.08, 2.08, -0.02, -158, -6, -0.12),
      pose(-0.38, 1.32, 0.08, -6, -100, -0.06),
      pose(-0.36, 0.9, 0.05, 32, -115, 0.05, 0.16),
    ],
    strike: [
      pose(0, 1.0, 0.68, 42, 0, 0.3, 0.1),
      pose(0.38, 1.2, 0.55, 0, 88, 0.16),
      pose(0.3, 1.3, 0.5, -42, 70, 0.1),
    ],
    block: [pose(0, 1.95, 0.42, -4, 90), pose(0.05, 1.25, 0.5, -82, 0), pose(0.06, 0.95, 0.5, 74, 14, 0.05, 0.08)],
    sheathed: pose(0.26, 1.0, 0.14, 165, 22, 0.12, 0.14),
    iaiEnd: pose(0.48, 1.25, 0.66, -4, 96, 0.32, 0.12),
    stagger: pose(-0.42, 1.65, -0.12, -125, -65, -0.32),
  },
  yari: {
    guard: [pose(-0.08, 1.55, 0.25, -12, 0), pose(-0.08, 1.2, 0.25, 0, 0), pose(-0.08, 1.0, 0.25, 12, 0, 0.05, 0.06)],
    windup: [
      pose(-0.1, 1.62, -0.32, -14, 2, -0.12),
      pose(-0.1, 1.22, -0.36, 0, 2, -0.12),
      pose(-0.25, 0.9, 0.0, 14, -75, 0.04, 0.2),
    ],
    strike: [
      pose(-0.05, 1.55, 0.85, -10, 0, 0.3),
      pose(-0.05, 1.2, 0.9, 0, 0, 0.3),
      pose(0.25, 0.9, 0.35, 14, 80, 0.12, 0.2),
    ],
    block: [pose(0, 1.85, 0.35, 0, 90), pose(0, 1.25, 0.42, -72, 0), pose(0, 1.0, 0.42, 62, 10, 0.05, 0.08)],
    shoveWindup: pose(0, 1.2, 0.0, 0, 80, -0.05),
    shoveStrike: pose(0, 1.25, 0.6, 0, 90, 0.25),
    stagger: pose(-0.3, 1.6, -0.2, -40, -50, -0.3),
  },
};

// Poses for the move-strikes (katana). sideDir +1 means circling to his right (-x).
const moveCache = new Map();
export function movePoses(move, stance, sideDir = 0) {
  const key = `${move}${stance}${sideDir}`;
  let p = moveCache.get(key);
  if (p) return p;
  const K = POSES.katana;
  const high = stance === 0;
  if (move === 'lunge') {
    // a level thrust: draw the hands back to the hip, then drive them out with the body
    p = {
      wind: pose(-0.16, high ? 1.5 : 1.08, -0.08, high ? -2 : -10, -8, -0.1, 0.12),
      end: pose(-0.02, high ? 1.48 : 1.08, 0.88, high ? 6 : -4, 0, 0.45, 0.16),
    };
  } else if (move === 'side') {
    // a flat cut across the body, sweeping the way you circle
    const m = sideDir > 0 ? -1 : 1;
    const h = high ? 1.55 : 1.0;
    p = {
      wind: pose(-0.42 * m, h + 0.06, 0.02, high ? -10 : 8, -112 * m, -0.04, high ? 0 : 0.14),
      end: pose(0.42 * m, h, 0.5, high ? -4 : 12, 96 * m, 0.14, high ? 0.04 : 0.16),
    };
  } else {
    // retreat: the ordinary cut, but thrown while leaning away
    const wind = { ...K.windup[stance] }, end = { ...K.strike[stance] };
    wind.lean -= 0.18;
    end.lean -= 0.12;
    end.hz -= 0.08;
    p = { wind, end };
  }
  moveCache.set(key, p);
  return p;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPole = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------- geometry helpers ----------

// One pop of color on an ink figure: a solid fill of that color, inked darker in the shade.
const accentCache = new Map();
export function accent(color) {
  if (!accentCache.has(color)) {
    const c = new THREE.Color(color), dark = c.clone().multiplyScalar(0.25);
    accentCache.set(color, hatch(0.72, color, 1, { fill: 0.95, ink: dark.getHex() }));
  }
  return accentCache.get(color);
}
// each fighter's own color: small, one part of him, so you know him at a glance
export const ACCENTS = {
  ronin: 0x2f5596, // an indigo cord binding his kasa
  wanderer: 0xd89a2b, // a gourd of sake at his hip
  spearman: 0x2f8a64, // a green tassel under the spearhead
  bandit: 0xe0642a, // a persimmon headband
  masked: 0x7444a8, // the violet bag of the flute in his sash
  sohei: 0xd4a52a, // a string of gold prayer beads
  deserter: 0x1f8f99, // the torn teal banner still on his back
  yamabushi: 0x4f9fd8, // the sky-blue pompoms of a mountain ascetic's sash
  petal: PINK.deep, // the Petal Blade: all of his clothes, while he holds the color (bloomMaterial)
};
export const WOUND_RED = 0xb3171d;

// ---------- color ----------
// The wanderer wins color back season by season: a quarter of him for each region. He
// leaves Winter with his coat in color and wins his hakama from the Petal Blade in Spring.
export const HERO_COLORS = {
  coat: 0x2b4a86, // winter: indigo, the color of a clear night over snow
  hakama: 0xc65d82, // spring: the petals' rose, taken back from the Petal Blade
};
// A material that can be drained of its color: bloom 1 is full color, 0 is plain ink.
// Used by the Petal Blade, whose clothes hold the color he took, and the shrine's cherries.
export function bloomMaterial(tone, color = PINK.blossom, ink = PINK.ink) {
  const m = hatch(tone, color, 1.1, { fill: 0.92, ink, unique: true });
  m.userData.bloom = { tone, color: new THREE.Color(color), ink: new THREE.Color(ink) };
  return m;
}
const INK = new THREE.Color(COLORS.ink), PAPER = new THREE.Color(COLORS.paper);
export function setBloom(m, k) {
  const b = m.userData.bloom, u = m.uniforms;
  u.uTint.value.copy(PAPER).lerp(b.color, k);
  u.uInk.value.copy(INK).lerp(b.ink, k);
  u.uFill.value = 0.16 + (0.92 - 0.16) * k;
  // drained, the cloth goes to an ordinary mid-grey ink tone
  u.uTone.value = 0.55 + (b.tone - 0.55) * k;
}
const WOUND_DARK = 0x4a0609; // the open cut
const BLOOD = 0x8e1418; // blood soaked into cloth

// ---------- wounds ----------
// A wound is drawn as a decal on the body: a dark gash with red lips, the blood soaking
// out round it, and drips running down. Flat shapes are extruded thin and bent to the curve
// of what they sit on (a sphere for the head, an upright cylinder for body and legs).
function lensShape(len, w) {
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, 0);
  sh.quadraticCurveTo(-len * 0.1, w, len / 2, w * 0.15);
  sh.quadraticCurveTo(len * 0.05, -w * 0.9, -len / 2, 0);
  return sh;
}
function blotShape(r, seed) {
  const sh = new THREE.Shape(), n = 9;
  const rad = (k) => r * (0.72 + 0.4 * Math.abs(Math.sin(seed * 12.9898 + k * 78.233)));
  const pt = (k) => { const a = (k / n) * Math.PI * 2, rr = rad(k % n); return [Math.cos(a) * rr, Math.sin(a) * rr * 1.25 - r * 0.25]; };
  sh.moveTo(...pt(0).map((v, i, a) => (v + pt(1)[i]) / 2));
  for (let k = 1; k <= n; k++) {
    const [cx, cy] = pt(k), [nx, ny] = pt(k + 1);
    sh.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  return sh;
}
function dripShape(len, w) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.quadraticCurveTo(-w * 0.2, -len * 0.5, -w * 0.25, -len + w * 0.6);
  sh.absarc(0, -len + w * 0.55, w * 0.42, Math.PI, Math.PI * 2, false); // the drop at the end
  sh.quadraticCurveTo(w * 0.2, -len * 0.5, w / 2, 0);
  sh.lineTo(-w / 2, 0);
  return sh;
}
// extrude a shape thin and bend it onto a sphere (bend 'sphere') or an upright cylinder
function decalGeo(shape, R, bend = 'sphere', depth = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) - (bend === 'sphere' ? (x * x + y * y) : x * x) / (2 * R));
  }
  g.computeVertexNormals();
  return g;
}
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
// a decal at pos on a surface with outward normal n, turned by ang about the normal; its
// local -y runs down the surface, so drips fall
function stick(geo, mat, parent, pos, n, ang = 0, lift = 0) {
  const m = new THREE.Mesh(geo, mat);
  _z.copy(n).normalize();
  _x.set(0, 1, 0).cross(_z).normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  m.quaternion.setFromRotationMatrix(_m);
  if (ang) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang));
  m.position.copy(pos).addScaledVector(_z, lift);
  parent.add(m);
  return m;
}
// one wound: blood soaked round it, the gash and its lips, and drips running down from it
function woundMark(parent, pos, n, { R, bend, ang = 0, len, w, stain, drips = [], seed = 1 }) {
  const g = new THREE.Group();
  parent.add(g);
  const red = accent(WOUND_RED), dark = accent(WOUND_DARK), blood = accent(BLOOD);
  stick(decalGeo(blotShape(stain, seed), R, bend), blood, g, pos, n, ang * 0.3, 0.002);
  stick(decalGeo(lensShape(len * 1.12, w * 1.7), R, bend), red, g, pos, n, ang, 0.005);
  stick(decalGeo(lensShape(len, w), R, bend), dark, g, pos, n, ang, 0.008);
  for (const [dx, dl, dw] of drips) {
    // start a little below the gash, offset along it
    const c = Math.cos(ang), sn = Math.sin(ang);
    _z.copy(n).normalize(); _x.set(0, 1, 0).cross(_z).normalize(); _y.crossVectors(_z, _x);
    const at = pos.clone().addScaledVector(_x, dx * len * c).addScaledVector(_y, dx * len * sn - w * 0.3);
    stick(decalGeo(dripShape(dl, dw), R, bend), red, g, at, n, 0, 0.006);
  }
  g.visible = false;
  return g;
}

function mesh(geo, tone, parent, pos, rot, scale) {
  const m = new THREE.Mesh(geo, typeof tone === 'number' ? hatch(tone) : tone);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  parent?.add(m);
  return m;
}

// Lathe from [radius, height] pairs. faceted=true gives flat facets, which the pen
// pass draws as pleats and seams.
function lathe(points, segments, faceted = false) {
  let g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  if (faceted) {
    g = g.toNonIndexed();
    g.computeVertexNormals();
  }
  return g;
}

function facet(g) {
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function placeLimb(m, from, to) {
  tmpDir.subVectors(to, from);
  const len = tmpDir.length();
  m.position.addVectors(from, to).multiplyScalar(0.5);
  m.scale.set(1, Math.max(0.01, len), 1);
  m.quaternion.setFromUnitVectors(UP, tmpDir.normalize());
}

// Two-bone arm: shoulder to hand, elbow bent toward the pole direction.
function solveElbow(shoulder, hand, l1, l2, pole, out) {
  tmpDir.subVectors(hand, shoulder);
  let d = tmpDir.length();
  const reach = l1 + l2;
  let s1 = l1;
  if (d >= reach * 0.999) {
    // stretch slightly rather than leave a gap at the grip
    s1 = l1 * (d / reach);
    return out.copy(shoulder).addScaledVector(tmpDir.normalize(), s1);
  }
  d = Math.max(d, 0.001);
  tmpDir.divideScalar(d);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  tmpPole.copy(pole).addScaledVector(tmpDir, -pole.dot(tmpDir)).normalize();
  return out.copy(shoulder).addScaledVector(tmpDir, a).addScaledVector(tmpPole, h);
}

function katanaBlade() {
  // a curved blade drawn in 2D: x runs along the blade, y is the edge-to-spine width
  const shape = new THREE.Shape();
  const N = 12;
  const L = 0.98;
  const curve = (x) => 0.045 * (x / L) ** 2;
  const width = (x) => 0.017 * (1 - 0.35 * (x / L));
  shape.moveTo(0, -width(0));
  for (let i = 1; i <= N; i++) {
    const x = (i / N) * (L - 0.06);
    shape.lineTo(x, curve(x) - width(x));
  }
  shape.lineTo(L, curve(L) + 0.004); // kissaki
  for (let i = N; i >= 0; i--) {
    const x = (i / N) * (L - 0.06);
    shape.lineTo(x, curve(x) + width(x));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.007, bevelEnabled: false });
  g.translate(0, 0, -0.0035);
  g.rotateY(-Math.PI / 2);
  g.translate(0, 0, 0.12);
  return g;
}

function buildKatana() {
  const g = new THREE.Group();
  mesh(katanaBlade(), 0.97, g);
  mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.014, 12), 0.12, g, [0, 0, 0.11], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), 0.6, g, [0, 0, 0.127], [Math.PI / 2, 0, 0]); // habaki
  mesh(facet(new THREE.CylinderGeometry(0.019, 0.017, 0.26, 6, 4)), 0.25, g, [0, 0, -0.03], [Math.PI / 2, 0, 0]);
  mesh(new THREE.SphereGeometry(0.02, 8, 6), 0.1, g, [0, 0, -0.165]); // kashira
  return { group: g, tip: new THREE.Vector3(0, 0.05, 1.1), length: 1.1 };
}

function buildYari(tassel = null) {
  const g = new THREE.Group();
  if (tassel) {
    // a tassel of dyed horsehair under the spearhead
    const t = accent(tassel);
    mesh(new THREE.ConeGeometry(0.11, 0.34, 10, 1, true), t, g, [0, 0, 1.43], [-Math.PI / 2, 0, 0]);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), t, g, [0, 0, 1.59]);
  }
  mesh(new THREE.CylinderGeometry(0.02, 0.024, 2.6, 7), 0.35, g, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
  const head = mesh(facet(new THREE.OctahedronGeometry(0.05, 0)), 0.95, g, [0, 0, 1.86]);
  head.scale.set(0.5, 0.25, 4.2);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), 0.1, g, [0, 0, 1.62], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8), 0.1, g, [0, 0, -0.93], [Math.PI / 2, 0, 0]); // butt cap
  return { group: g, tip: new THREE.Vector3(0, 0, 2.06), length: 2.06 };
}

function glintTexture(fill = '#b3171d') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.fillStyle = fill;
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -60);
    g.quadraticCurveTo(6, -8, 0, 0);
    g.quadraticCurveTo(-6, -8, 0, -60);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, 9, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}
let glintTex = null;
let paleTex = null; // fox-fire: a feint seen for what it is
let pinkTex = null; // the Petal Blade's turning blade

function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ece5d3';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#161514';
  g.lineWidth = 5;
  g.strokeRect(3, 3, 122, 250);
  // a brushed ensō crest
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    g.lineWidth = 14 - i;
    g.beginPath();
    g.arc(64 + i * 0.4, 100, 34 + i * 0.3, -0.3 + i * 0.02, Math.PI * 1.75 - i * 0.05);
    g.stroke();
  }
  g.font = 'bold 54px serif';
  g.fillStyle = '#161514';
  g.textAlign = 'center';
  g.fillText('槍', 64, 210);
  return new THREE.CanvasTexture(c);
}

// ---------- the fighters ----------

// tones: 0 is solid ink, 1 is bare paper
const LOOKS = {
  player: { kimono: 0.3, hakama: 0.2, obi: 0.1, collar: 0.97, hair: 0.04, hat: null, sleeve: 0.28, forearm: 0.9 },
  ronin: { kimono: 0.66, hakama: 0.46, obi: 0.25, collar: 0.95, hair: 0.1, hat: 'kasa', sleeve: 0.6, forearm: 0.9, mantle: 0.42 },
  wanderer: { kimono: 0.56, hakama: 0.38, obi: 0.2, collar: 0.95, hair: 0.1, hat: 'kasa', sleeve: 0.5, forearm: 0.9, mantle: 0.3 },
  spearman: { kimono: 0.74, hakama: 0.55, obi: 0.3, collar: 0.95, hair: 0.05, hat: 'jingasa', sleeve: 0.7, forearm: 0.22, armor: 0.26 },
  // the Spring road's other fighters
  bandit: { kimono: 0.44, hakama: 0.3, obi: 0.62, collar: 0.8, hair: 0.06, hat: 'band', sleeve: 0.42, forearm: 0.86, mantle: 0.24 },
  masked: { kimono: 0.16, hakama: 0.12, obi: 0.72, collar: 0.9, hair: 0.05, hat: 'tengai', sleeve: 0.18, forearm: 0.9 },
  sohei: { kimono: 0.9, hakama: 0.62, obi: 0.3, collar: 0.95, hair: 0.05, hat: 'hood', sleeve: 0.88, forearm: 0.9, armor: 0.42 },
  // the side paths' fighters
  deserter: { kimono: 0.5, hakama: 0.34, obi: 0.2, collar: 0.85, hair: 0.04, hat: 'hachigane', sleeve: 0.46, forearm: 0.3, armor: 0.2, long: 1.3 },
  yamabushi: { kimono: 0.94, hakama: 0.72, obi: 0.5, collar: 0.98, hair: 0.05, hat: 'tokin', sleeve: 0.9, forearm: 0.88 },
  // the Spring boss: his clothes hold the color he took from the valley (see bloomMaterial)
  petal: { kimono: 0.84, hakama: 0.7, obi: 0.18, collar: 0.98, hair: 0.04, hat: 'sprig', sleeve: 0.86, forearm: 0.92, mantle: 0.9, bloom: true },
  // ambushers: plain men off the road, no color of their own
  thug: { kimono: 0.58, hakama: 0.5, obi: 0.4, collar: 0.8, hair: 0.08, hat: 'band', sleeve: 0.55, forearm: 0.88 },
  hungry: { kimono: 0.7, hakama: 0.56, obi: 0.32, collar: 0.9, hair: 0.12, hat: 'kasa', sleeve: 0.66, forearm: 0.9, mantle: 0.55 },
  ashigaru: { kimono: 0.62, hakama: 0.5, obi: 0.4, collar: 0.9, hair: 0.05, hat: 'jingasa', sleeve: 0.6, forearm: 0.25, armor: 0.36 },
};

export class FighterModel {
  constructor(look, weaponKind) {
    let L = LOOKS[look];
    this.look = look;
    this.L = L;
    if (L.bloom) {
      // the cloth that holds his color: kimono and sleeves pink, the mantle and hakama paler
      this.bloomMats = [bloomMaterial(L.kimono), bloomMaterial(L.mantle, PINK.petal), bloomMaterial(0.76, PINK.deep), bloomMaterial(L.hakama, PINK.petal)];
      L = { ...L, kimono: this.bloomMats[0], sleeve: this.bloomMats[0], mantle: this.bloomMats[1], hakama: this.bloomMats[3] };
    }
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); // leans and crouches
    this.root.add(this.body);
    const B = this.body;

    // feet in white tabi, peeking from under the hakama
    const footGeo = new THREE.BoxGeometry(0.1, 0.07, 0.26);
    footGeo.translate(0, 0.035, 0.09); // toes poke out from under the hem
    // a fighting stance: the lead foot a little ahead
    this.footBase = [new THREE.Vector3(0.14, 0, 0.12), new THREE.Vector3(-0.14, 0, -0.08)];
    this.feet = this.footBase.map((b) => mesh(footGeo, 0.92, this.root, [b.x, 0, b.z]));
    this.walk = { x: 0, z: 0, amt: 0 };

    // hakama: wide pleated trousers; the facets read as pleats. The seat is one piece,
    // and each leg is its own bell hung from the hip, so it swings with its foot.
    this.hakama = mesh(
      lathe([[0.001, 0.44], [0.31, 0.44], [0.34, 0.58], [0.31, 0.78], [0.25, 0.97], [0.001, 0.98]], 14, true),
      L.hakama, this.root
    );
    this.hakama.scale.z = 0.82;
    const HIP = 0.78;
    const legGeo = lathe([[0.001, -HIP + 0.03], [0.21, -HIP + 0.03], [0.205, -HIP + 0.14], [0.17, -0.38], [0.14, -0.1], [0.001, 0]], 10, true);
    this.legs = this.footBase.map((b) => {
      const pivot = new THREE.Group();
      pivot.position.set(b.x * 0.75, HIP, b.z * 0.5);
      this.root.add(pivot);
      const leg = mesh(legGeo, L.hakama, pivot);
      leg.scale.z = 0.9;
      pivot.userData.leg = leg;
      return pivot;
    });
    this.cloth = { coat: [], hakama: [this.hakama, ...this.legs.map((p) => p.userData.leg)] };
    this.hip = HIP;

    // kimono upper body
    const torso = mesh(
      lathe([[0.001, 0.88], [0.24, 0.88], [0.255, 1.08], [0.275, 1.3], [0.27, 1.4], [0.2, 1.49], [0.08, 1.54], [0.001, 1.55]], 16),
      L.kimono, B
    );
    torso.scale.z = 0.74;
    this.cloth.coat.push(torso);
    // crossed collar: two pale bands meeting at the chest
    const collarGeo = new THREE.BoxGeometry(0.045, 0.34, 0.02);
    mesh(collarGeo, L.collar, B, [0.055, 1.37, 0.185], [0.18, 0, -0.42]);
    mesh(collarGeo, L.collar, B, [-0.055, 1.37, 0.185], [0.18, 0, 0.42]);
    // obi with a knot at the back
    mesh(new THREE.CylinderGeometry(0.258, 0.258, 0.13, 16), L.obi, B, [0, 0.95, 0], null, [1, 1, 0.76]);
    mesh(new THREE.BoxGeometry(0.2, 0.1, 0.07), L.obi, B, [0, 0.96, -0.2]);

    if (L.armor !== undefined) this.buildArmor(L);
    if (L.mantle !== undefined) {
      // ragged traveling mantle over the shoulders
      const mantle = mesh(
        lathe([[0.36, 1.12], [0.34, 1.26], [0.3, 1.4], [0.2, 1.5], [0.1, 1.55]], 9, true),
        L.mantle, B
      );
      mantle.scale.z = 0.82;
      mantle.rotation.y = 0.3;
    }

    // head and neck
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), 0.92, B, [0, 1.57, 0]);
    const head = mesh(new THREE.SphereGeometry(0.122, 16, 12), 0.92, B, [0, 1.7, 0.005], null, [0.92, 1.08, 1.0]);
    mesh(new THREE.BoxGeometry(0.022, 0.045, 0.04), 0.92, B, [0, 1.69, 0.12]); // nose: shows which way he faces
    // hair cap
    mesh(new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), L.hair, B, [0, 1.71, -0.01], [-0.35, 0, 0], [0.95, 1.05, 1.02]);
    if (look === 'player') {
      // chonmage topknot laid forward over the crown
      mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.15, 7), L.hair, B, [0, 1.84, 0.0], [Math.PI / 2 - 0.2, 0, 0]);
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 7), 0.95, B, [0, 1.83, -0.06], [Math.PI / 2 - 0.2, 0, 0]);
      // headband tails fluttering behind
      mesh(new THREE.BoxGeometry(0.03, 0.16, 0.008), 0.95, B, [0.03, 1.66, -0.13], [0.5, 0, 0.25]);
      mesh(new THREE.BoxGeometry(0.03, 0.13, 0.008), 0.95, B, [-0.02, 1.67, -0.13], [0.6, 0, -0.2]);
      mesh(new THREE.TorusGeometry(0.124, 0.012, 6, 24), 0.95, B, [0, 1.75, 0.0], [Math.PI / 2 + 0.25, 0, 0], [0.95, 1.05, 1]);
    }
    if (L.hat === 'kasa') {
      // wide straw kasa that hides his eyes
      mesh(facet(new THREE.ConeGeometry(0.54, 0.22, 20, 1, true)), 0.86, B, [0, 1.86, 0.02], [0.06, 0, 0]);
      mesh(new THREE.TorusGeometry(0.535, 0.01, 4, 40), 0.3, B, [0, 1.75, 0.03], [Math.PI / 2 + 0.06, 0, 0]);
      if (look === 'ronin') {
        // a band of indigo cloth round the kasa, its ties hanging under the chin
        const ind = accent(ACCENTS.ronin);
        mesh(lathe([[0.42, 1.785], [0.37, 1.81], [0.3, 1.845]], 20), ind, B, [0, 0.012, 0.02], [0.06, 0, 0], [1.04, 1, 1.04]);
        for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.035, 0.24, 0.01), ind, B, [sx * 0.08, 1.58, 0.1], [0.15, 0, sx * 0.3]);
      }
    } else if (L.hat === 'band') {
      // a twisted headband knotted at the back, the tails loose (persimmon on the Bandit)
      const band = look === 'bandit' ? accent(ACCENTS.bandit) : hatch(0.88);
      mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 18, 1, true), band, B, [0, 1.75, 0.0], [0.2, 0, 0], [0.96, 1, 1.06]);
      mesh(new THREE.BoxGeometry(0.055, 0.32, 0.012), band, B, [0.05, 1.6, -0.16], [0.6, 0, 0.3]);
      mesh(new THREE.BoxGeometry(0.055, 0.26, 0.012), band, B, [-0.04, 1.62, -0.16], [0.7, 0, -0.25]);
    } else if (L.hat === 'tengai') {
      // a deep woven basket hat that hides the whole head: a komuso's
      mesh(facet(new THREE.LatheGeometry([[0.0, 2.0], [0.13, 1.995], [0.185, 1.94], [0.2, 1.82], [0.195, 1.68], [0.18, 1.56]].map(([r, y]) => new THREE.Vector2(r, y)), 14)), 0.8, B, [0, -0.02, 0.01]);
      for (let k = 0; k < 4; k++) mesh(new THREE.TorusGeometry(0.193 - Math.abs(k - 1.5) * 0.008, 0.006, 4, 24), 0.35, B, [0, 1.62 + k * 0.09, 0.01], [Math.PI / 2, 0, 0]);
    } else if (L.hat === 'hood') {
      // a warrior monk's white hood, wrapped close round the face
      mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), L.kimono, B, [0, 1.7, -0.02], [-0.25, 0, 0], [1, 1.05, 1.05]);
      mesh(new THREE.BoxGeometry(0.26, 0.12, 0.05), L.kimono, B, [0, 1.6, 0.12], [0.1, 0, 0]);
      mesh(lathe([[0.17, 1.62], [0.24, 1.45], [0.28, 1.36]], 12), L.kimono, B);
    } else if (L.hat === 'hachigane') {
      // a cloth headband with an iron plate over the brow, the tails long behind
      mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.05, 18, 1, true), 0.6, B, [0, 1.75, 0], [0.15, 0, 0], [0.96, 1, 1.06]);
      mesh(new THREE.BoxGeometry(0.14, 0.06, 0.02), 0.25, B, [0, 1.76, 0.128], [0.15, 0, 0]);
      mesh(new THREE.BoxGeometry(0.04, 0.34, 0.01), 0.6, B, [0.03, 1.6, -0.15], [0.45, 0, 0.15]);
    } else if (L.hat === 'tokin') {
      // a yamabushi's little black cap, tied on over the brow
      mesh(facet(new THREE.CylinderGeometry(0.03, 0.075, 0.09, 12)), 0.06, B, [0, 1.84, 0.07], [0.35, 0, 0]);
      mesh(new THREE.TorusGeometry(0.124, 0.006, 4, 20), 0.1, B, [0, 1.76, 0.0], [Math.PI / 2 + 0.3, 0, 0]);
    } else if (L.hat === 'jingasa') {
      mesh(facet(new THREE.ConeGeometry(0.4, 0.13, 16, 1)), 0.2, B, [0, 1.86, 0]);
      mesh(new THREE.SphereGeometry(0.03, 8, 6), 0.9, B, [0, 1.93, 0]);
    } else if (L.hat === 'sprig') {
      // long hair tied high and falling down his back, a sprig of cherry blossom through the tie
      mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 7), L.hair, B, [0, 1.83, -0.08], [0.5, 0, 0]);
      const tail = mesh(new THREE.CylinderGeometry(0.045, 0.012, 0.62, 7), L.hair, B);
      placeLimb(tail, new THREE.Vector3(0, 1.84, -0.1), new THREE.Vector3(0.02, 1.3, -0.24));
      const sprig = this.bloomMats?.[2] ?? 0.9;
      mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 4), 0.2, B, [0.02, 1.86, -0.08], [0.2, 0, 1.2]);
      for (const [x, y, z, r] of [[0.13, 1.9, -0.06, 0.04], [0.09, 1.93, -0.1, 0.032], [0.16, 1.86, -0.1, 0.03], [-0.1, 1.83, -0.07, 0.03]]) {
        mesh(new THREE.SphereGeometry(r, 8, 6), sprig, B, [x, y, z]);
      }
    }

    // scabbard at the left hip for sword users
    if (weaponKind === 'katana') {
      const saya = mesh(new THREE.CylinderGeometry(0.022, 0.018, 1, 8), 0.12, B);
      placeLimb(saya, new THREE.Vector3(0.22, 0.98, 0.24), new THREE.Vector3(0.33, 0.7, -0.58));
      mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 8), 0.8, B, [0.225, 0.975, 0.22], [Math.PI / 2 - 0.35, 0, 0]);
    }

    if (look === 'wanderer') {
      // a sake gourd hung from his sash
      const gd = accent(ACCENTS.wanderer);
      mesh(new THREE.SphereGeometry(0.1, 12, 9), gd, B, [-0.3, 0.7, 0.12]);
      mesh(new THREE.SphereGeometry(0.072, 12, 9), gd, B, [-0.3, 0.85, 0.12]);
      mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4), 0.2, B, [-0.29, 0.94, 0.11]);
    } else if (look === 'masked') {
      // a shakuhachi in a violet bag, thrust through his sash
      const vb = accent(ACCENTS.masked);
      const bag = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), vb, B);
      placeLimb(bag, new THREE.Vector3(-0.18, 1.22, 0.2), new THREE.Vector3(-0.32, 0.62, 0.1));
      mesh(new THREE.SphereGeometry(0.055, 8, 6), vb, B, [-0.18, 1.23, 0.2]);
    } else if (look === 'deserter') {
      // a sashimono: his lord's banner, torn, still on its pole across his back
      const tl = accent(ACCENTS.deserter);
      mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), 0.15, B, [0, 1.75, -0.3]);
      const flag = mesh(new THREE.BoxGeometry(0.01, 0.42, 0.22), tl, B, [0, 2.12, -0.42], [0, 0, 0]);
      flag.scale.set(1, 1, 1);
      mesh(new THREE.BoxGeometry(0.01, 0.16, 0.14), tl, B, [0, 1.84, -0.39], [0.25, 0, 0]); // the torn lower half
      mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4), 0.15, B, [0, 2.34, -0.42], [Math.PI / 2, 0, 0]);
    } else if (look === 'yamabushi') {
      // the yuigesa: a sash with six sky-blue pompoms down his chest
      const sky = accent(ACCENTS.yamabushi);
      const pom = new THREE.SphereGeometry(0.045, 10, 8);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) mesh(pom, sky, B, [sx * 0.1, 1.36 - k * 0.12, 0.21 - k * 0.006]);
      mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), 0.95, B, [0.1, 1.28, 0.19], [0.05, 0, -0.08]);
      mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), 0.95, B, [-0.1, 1.28, 0.19], [0.05, 0, 0.08]);
    } else if (look === 'sohei') {
      // a long string of gold prayer beads, slung from one shoulder across the chest
      const gold = accent(ACCENTS.sohei);
      const bead = new THREE.SphereGeometry(0.03, 8, 6);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        const x = Math.cos(a) * 0.27, y = Math.sin(a) * 0.33;
        // a tilted ring: over the left shoulder, under the right arm
        mesh(bead, gold, B, [x * 0.8 + y * 0.35, 1.2 + y * 0.75 - x * 0.35, 0.21 + Math.max(0, Math.cos(a)) * 0.02 - Math.min(0, Math.sin(a)) * 0.02]);
      }
    }

    // arms: wide kimono sleeve to the elbow, bare forearm, hand
    this.shoulderL = new THREE.Vector3(0.22, 1.43, 0.0);
    this.shoulderR = new THREE.Vector3(-0.22, 1.43, 0.0);
    const sleeveGeo = new THREE.CylinderGeometry(0.12, 0.075, 1, 10, 1, true);
    const foreGeo = new THREE.CylinderGeometry(0.035, 0.045, 1, 8);
    const handGeo = new THREE.SphereGeometry(0.045, 8, 6);
    this.arms = [this.shoulderL, this.shoulderR].map((sh, i) => ({
      sh,
      sleeve: mesh(sleeveGeo, L.sleeve, B),
      fore: mesh(foreGeo, L.forearm, B),
      hand: mesh(handGeo, 0.92, B),
      pole: new THREE.Vector3(i === 0 ? 1 : -1, -0.7, -0.35).normalize(),
      elbow: new THREE.Vector3(),
    }));
    for (const a of this.arms) this.cloth.coat.push(a.sleeve);

    // wounds: the cut itself where it landed, bleeding, shown by setWounds()
    this.woundMarks = this.buildWounds(L, look);
    this.woundKey = '';

    // weapon
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.rotation.order = 'YXZ';
    B.add(this.weaponPivot);
    const w = weaponKind === 'yari' ? buildYari(look === 'spearman' ? ACCENTS.spearman : null) : buildKatana();
    if (L.long) w.group.scale.setScalar(L.long); // a nodachi: the great field sword
    this.weapon = w;
    this.weaponPivot.add(w.group);
    this.gripOffset = weaponKind === 'yari' ? 0.45 : 0.0;
    w.group.position.z = -this.gripOffset;

    // red glint: the tell before a strike
    glintTex ||= glintTexture();
    this.glint = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthTest: false, depthWrite: false, fog: false })
    );
    this.glint.scale.setScalar(0.001);
    this.glint.renderOrder = 10;
    this.glint.position.copy(w.tip);
    w.group.add(this.glint);
    noEdges.add(this.glint);

    // a pale ink shadow under the fighter
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 24),
      flat(COLORS.ink, { transparent: true, opacity: 0.08, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.root.add(shadow);
    noEdges.add(shadow);
    this.shadow = shadow;

    this.gait = 0;
    this.cur = lerpPose(POSES[weaponKind].guard[1], POSES[weaponKind].guard[1], 0);
    // the wanderer comes out of Winter with his coat in color
    if (look === 'player') this.setColors(['coat']);
  }

  // Which parts of the wanderer are in color: 'coat' (kimono and sleeves), 'hakama'.
  setColors(parts = []) {
    for (const [part, meshes] of Object.entries(this.cloth)) {
      const on = parts.includes(part) && HERO_COLORS[part];
      const tone = part === 'coat' ? this.L.kimono : this.L.hakama;
      for (const m of meshes) {
        // a sleeve has its own tone, a little lighter than the body of the coat
        const t = part === 'coat' && this.arms?.some((a) => a.sleeve === m) ? this.L.sleeve : tone;
        m.material = on ? accent(HERO_COLORS[part]) : (typeof t === 'number' ? hatch(t) : t);
      }
    }
  }

  // The Petal Blade: how much of the stolen color his clothes still hold (0..1).
  setBloom(k) {
    for (const m of this.bloomMats ?? []) setBloom(m, k);
  }

  buildArmor(L) {
    const B = this.body;
    // dō: lacquered chest plate, laced in pale cord
    const dou = mesh(lathe([[0.27, 0.95], [0.285, 1.12], [0.3, 1.3], [0.27, 1.42], [0.18, 1.48]], 10, true), L.armor, B);
    dou.scale.z = 0.78;
    for (const y of [1.05, 1.17, 1.29]) {
      const r = y < 1.2 ? 0.29 : 0.3;
      mesh(new THREE.TorusGeometry(r, 0.007, 4, 30), 0.95, B, [0, y, 0], [Math.PI / 2, 0, 0], [1, 0.78, 1]);
    }
    // kusazuri: hanging tassets
    const plate = new THREE.BoxGeometry(0.17, 0.24, 0.025);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const p = mesh(plate, L.armor + 0.06, B, [Math.sin(a) * 0.3, 0.78, Math.cos(a) * 0.25]);
      p.rotation.set(0, a, 0);
      p.rotateX(-0.2);
    }
    // sode: shoulder guards
    const sode = new THREE.BoxGeometry(0.2, 0.2, 0.03);
    for (const side of [1, -1]) {
      const s = mesh(sode, L.armor, B, [side * 0.31, 1.36, 0]);
      s.rotation.set(0, side * Math.PI / 2, side * 0.25);
    }
    // sashimono: the banner on his back
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), 0.3, B, [0, 1.75, -0.24]);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.6),
      new THREE.MeshBasicMaterial({ map: bannerTexture(), side: THREE.DoubleSide })
    );
    flag.position.set(0.16, 2.08, -0.24);
    flag.rotation.y = Math.PI;
    B.add(flag);
    this.flag = flag;
  }

  // Ease toward a target pose. rate is how quickly (per second); Infinity snaps.
  apply(target, rate, dt) {
    const k = rate === Infinity ? 1 : 1 - Math.exp(-rate * dt);
    lerpPose(this.cur, target, k, this.cur);
    const p = this.cur;

    // lean pivots at the hips, where the kimono goes into the hakama, so the torso tips
    // over the hakama instead of sliding off it (a run leans the whole body forward)
    const th = p.lean * 0.6;
    this.body.rotation.x = th;
    this.body.position.set(0, -p.crouch + HIP_Y * (1 - Math.cos(th)), -HIP_Y * Math.sin(th));
    this.hakama.scale.y = 1 - p.crouch * 0.6;
    this.crouchNow = p.crouch;

    this.weaponPivot.position.set(p.hx, p.hy, p.hz);
    this.weaponPivot.rotation.set(p.pitch, p.yaw, p.roll);

    // hands: two grips along the weapon axis
    tmpDir.set(0, 0, 1).applyEuler(this.weaponPivot.rotation);
    tmpA.set(p.hx, p.hy, p.hz).addScaledVector(tmpDir, 0.05);
    tmpB.set(p.hx, p.hy, p.hz).addScaledVector(tmpDir, this.gripOffset > 0 ? -0.5 : -0.1);
    this.placeArm(this.arms[1], tmpA);
    this.placeArm(this.arms[0], tmpB);
  }

  placeArm(arm, hand) {
    const handPos = tmpC.copy(hand);
    solveElbow(arm.sh, handPos, 0.3, 0.29, arm.pole, arm.elbow);
    placeLimb(arm.sleeve, arm.sh, arm.elbow);
    placeLimb(arm.fore, arm.elbow, handPos);
    arm.hand.position.copy(handPos);
    if (arm === this.arms[1] && this.woundMarks?.arm.visible) {
      // the cut forearm follows the arm from elbow to hand
      const g = this.woundMarks.arm;
      g.position.lerpVectors(arm.elbow, handPos, 0.45);
      tmpDir.subVectors(handPos, arm.elbow).normalize();
      g.quaternion.setFromUnitVectors(UP, tmpDir);
    }
  }

  // Footwork: vx, vz is the body's ground speed in model space (+z toward the
  // opponent). Each foot swings along the direction of travel and lifts as it passes,
  // so walking, circling and dodging all show real steps instead of a slide.
  step(dt, vx, vz) {
    const W = this.walk;
    const speed = Math.hypot(vx, vz);
    const k = 1 - Math.exp(-12 * dt);
    const amt = Math.min(1, speed / 2.2);
    W.amt += (amt - W.amt) * k;
    if (speed > 0.15) {
      W.x += (vx / speed - W.x) * k;
      W.z += (vz / speed - W.z) * k;
    }
    // a stride covers about 0.55 m, so the feet keep pace with the ground
    this.gait += Math.min(speed, 9) * dt * (Math.PI / 0.55);
    const a = W.amt;
    const reach = 0.28 * a;
    let bob = 0;
    for (let i = 0; i < 2; i++) {
      const ph = this.gait + i * Math.PI;
      const swing = Math.sin(ph); // -1 behind, +1 ahead
      const lift = Math.max(0, Math.cos(ph)) * 0.1 * a; // up while it travels forward
      const b = this.footBase[i];
      const foot = this.feet[i];
      foot.position.set(b.x + W.x * swing * reach, lift, b.z + W.z * swing * reach);
      foot.rotation.x = -lift * 1.6 * Math.sign(W.z || 1);
      // the hakama leg hangs from the hip and follows its foot
      const leg = this.legs[i];
      const c = this.crouchNow ?? 0;
      const h = (this.hip - c * 0.6) - lift;
      leg.position.y = this.hip - c * 0.6;
      leg.scale.y = Math.max(0.5, h / this.hip);
      leg.rotation.x = -Math.atan2(foot.position.z - leg.position.z, h) * 0.9;
      leg.rotation.z = Math.atan2(foot.position.x - leg.position.x, h) * 0.9;
      bob = Math.max(bob, lift);
    }
    this.body.position.y += -0.025 * a + bob * 0.25;
    this.hakama.rotation.z = -W.x * Math.sin(this.gait) * 0.03 * a;
    if (this.flag) this.flag.rotation.z = Math.sin(this.gait * 0.5) * 0.06;
  }

  // show each wound he carries (see wounds.js)
  setWounds(list) {
    const key = list.join();
    if (key === this.woundKey) return;
    this.woundKey = key;
    for (const [id, m] of Object.entries(this.woundMarks)) m.visible = list.includes(id);
  }

  // The four wounds, built once and shown as they are taken. Each sits on whatever he
  // wears there: the head or the hat that hides it, the kimono or the armor, the hakama.
  buildWounds(L, look) {
    const B = this.body, V = (x, y, z) => new THREE.Vector3(x, y, z);
    // brow: a slash across the forehead, blood running down over the eye
    let brow;
    if (L.hat === 'tengai') {
      brow = woundMark(B, V(0.08, 1.74, 0.2), V(0.38, 0.05, 0.92), { R: 0.2, bend: 'cyl', ang: -0.55, len: 0.15, w: 0.026, stain: 0.065, drips: [[0.3, 0.12, 0.02], [-0.2, 0.08, 0.016]] });
    } else {
      const R = L.hat === 'hood' ? 0.172 : 0.127, c = L.hat === 'hood' ? V(0, 1.7, -0.02) : V(0, 1.7, 0.005);
      const n = V(0.34, 0.3, 0.89).normalize();
      const at = c.clone().add(V(n.x * R * 0.94, n.y * R * 1.08, n.z * R));
      brow = woundMark(B, at, n, { R, bend: 'sphere', ang: -0.7, len: 0.11, w: 0.022, stain: 0.046, drips: [[-0.25, 0.1, 0.018], [0.15, 0.065, 0.014]], seed: 2 });
    }
    // side: a thrust into the flank (through the armor, if he wears it), soaked dark
    const sr = L.armor !== undefined ? 0.3 : 0.262, a = 1.1;
    const side = woundMark(B, V(sr * Math.sin(a), 1.1, sr * 0.76 * Math.cos(a)), V(Math.sin(a), 0, Math.cos(a) / 0.76),
      { R: sr, bend: 'cyl', ang: 0.35, len: 0.11, w: 0.042, stain: 0.1, drips: [[-0.2, 0.1, 0.022], [0.3, 0.07, 0.016]], seed: 3 });
    // thigh: a long cut across the front of the hakama, blood running down it
    const hr = 0.34, b = -0.55;
    const thigh = woundMark(this.hakama, V(hr * Math.sin(b), 0.62, hr * Math.cos(b)), V(Math.sin(b), 0, Math.cos(b)),
      { R: hr, bend: 'cyl', ang: 0.45, len: 0.2, w: 0.036, stain: 0.1, drips: [[-0.15, 0.17, 0.024], [0.25, 0.11, 0.018]], seed: 4 });
    // forearm: a cut round the sword arm, blood running toward the hand (placed in placeArm)
    const arm = new THREE.Group();
    B.add(arm);
    const cut = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.013, 5, 12, Math.PI * 1.25), accent(WOUND_DARK));
    cut.rotation.set(Math.PI / 2 + 0.35, 0, 0.6);
    arm.add(cut);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 5, 12, Math.PI * 1.35), accent(WOUND_RED));
    lip.rotation.copy(cut.rotation);
    arm.add(lip);
    for (const [ang, l] of [[0.8, 0.11], [2.0, 0.07]]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, l, 5), accent(WOUND_RED));
      d.position.set(Math.cos(ang) * 0.046, l / 2 + 0.01, Math.sin(ang) * 0.046);
      arm.add(d);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), accent(WOUND_RED));
      drop.position.set(Math.cos(ang) * 0.047, l + 0.012, Math.sin(ang) * 0.047);
      arm.add(drop);
    }
    arm.visible = false;
    return { brow, side, thigh, arm };
  }

  // pale: fox-fire shows a feint in a cold blue instead of red
  setGlint(amount, pale = false) {
    // pale: fox-fire shows a feint; 'pink': the Petal Blade's blade will turn its line
    const map = pale === 'pink' ? (pinkTex ??= glintTexture('#e8609a')) : pale ? (paleTex ??= glintTexture('#6ea8c0')) : glintTex;
    if (map && this.glint.material.map !== map) { this.glint.material.map = map; this.glint.material.needsUpdate = true; }
    const s = amount <= 0 ? 0.001 : 0.25 + amount * 0.75;
    this.glint.scale.setScalar(s);
    this.glint.material.opacity = Math.min(1, amount * 1.4);
    this.glint.material.rotation = amount * 2.5;
  }

  tipWorld(out) {
    return this.weapon.group.localToWorld(out.copy(this.weapon.tip));
  }
}
