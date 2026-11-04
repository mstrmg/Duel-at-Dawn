// Fighter models built from primitives in a pen-and-ink style, plus the weapon poses for each stance.
import * as THREE from 'three';
import { hatch, flat, noEdges } from "./ink.js";
import { COLORS } from './config.js';

const D = THREE.MathUtils.degToRad;

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

function buildYari() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.02, 0.024, 2.6, 7), 0.35, g, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
  const head = mesh(facet(new THREE.OctahedronGeometry(0.05, 0)), 0.95, g, [0, 0, 1.86]);
  head.scale.set(0.5, 0.25, 4.2);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), 0.1, g, [0, 0, 1.62], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 8), 0.1, g, [0, 0, -0.93], [Math.PI / 2, 0, 0]); // butt cap
  return { group: g, tip: new THREE.Vector3(0, 0, 2.06), length: 2.06 };
}

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.fillStyle = '#b3171d';
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
  spearman: { kimono: 0.74, hakama: 0.55, obi: 0.3, collar: 0.95, hair: 0.05, hat: 'jingasa', sleeve: 0.7, forearm: 0.22, armor: 0.26 },
};

export class FighterModel {
  constructor(look, weaponKind) {
    const L = LOOKS[look];
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
      return pivot;
    });
    this.hip = HIP;

    // kimono upper body
    const torso = mesh(
      lathe([[0.001, 0.88], [0.24, 0.88], [0.255, 1.08], [0.275, 1.3], [0.27, 1.4], [0.2, 1.49], [0.08, 1.54], [0.001, 1.55]], 16),
      L.kimono, B
    );
    torso.scale.z = 0.74;
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
    } else if (L.hat === 'jingasa') {
      mesh(facet(new THREE.ConeGeometry(0.4, 0.13, 16, 1)), 0.2, B, [0, 1.86, 0]);
      mesh(new THREE.SphereGeometry(0.03, 8, 6), 0.9, B, [0, 1.93, 0]);
    }

    // scabbard at the left hip for sword users
    if (weaponKind === 'katana') {
      const saya = mesh(new THREE.CylinderGeometry(0.022, 0.018, 1, 8), 0.12, B);
      placeLimb(saya, new THREE.Vector3(0.22, 0.98, 0.24), new THREE.Vector3(0.33, 0.7, -0.58));
      mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 8), 0.8, B, [0.225, 0.975, 0.22], [Math.PI / 2 - 0.35, 0, 0]);
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

    // weapon
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.rotation.order = 'YXZ';
    B.add(this.weaponPivot);
    const w = weaponKind === 'yari' ? buildYari() : buildKatana();
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

    this.body.position.y = -p.crouch;
    this.body.rotation.x = p.lean * 0.6;
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

  setGlint(amount) {
    const s = amount <= 0 ? 0.001 : 0.25 + amount * 0.75;
    this.glint.scale.setScalar(s);
    this.glint.material.opacity = Math.min(1, amount * 1.4);
    this.glint.material.rotation = amount * 2.5;
  }

  tipWorld(out) {
    return this.weapon.group.localToWorld(out.copy(this.weapon.tip));
  }
}
