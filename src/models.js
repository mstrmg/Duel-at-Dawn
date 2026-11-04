// Placeholder fighter models built from primitives, plus the weapon poses for each stance.
import * as THREE from 'three';
import { inked, toon, flat } from './ink.js';
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

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function limb(color, radius) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.85, 1, 7);
  return inked(g, color, 0.02);
}

function placeLimb(mesh, from, to) {
  tmpDir.subVectors(to, from);
  const len = tmpDir.length();
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.scale.set(1, Math.max(0.01, len), 1);
  mesh.quaternion.setFromUnitVectors(UP, tmpDir.normalize());
}

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.fillStyle = '#b3171d';
  // four-pointed ink star
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glintTex = null;

function buildKatana() {
  const g = new THREE.Group();
  const blade = inked(new THREE.BoxGeometry(0.035, 0.012, 1.0), 0xe8e4da, 0.012);
  blade.position.z = 0.62;
  // a slight curve: tip tilts up
  blade.rotation.x = -0.04;
  const guard = inked(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), COLORS.ink, 0.008);
  guard.rotation.x = Math.PI / 2;
  guard.position.z = 0.1;
  const hilt = inked(new THREE.BoxGeometry(0.035, 0.035, 0.26), 0x2a2622, 0.01);
  hilt.position.z = -0.02;
  g.add(blade, guard, hilt);
  return { group: g, tip: new THREE.Vector3(0, 0.04, 1.12), length: 1.12 };
}

function buildYari() {
  const g = new THREE.Group();
  const shaft = inked(new THREE.CylinderGeometry(0.022, 0.026, 2.6, 6), 0x3b2f26, 0.01);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.35;
  const head = inked(new THREE.ConeGeometry(0.045, 0.38, 4), 0xe8e4da, 0.012);
  head.rotation.x = Math.PI / 2;
  head.position.z = 1.84;
  const collar = inked(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), COLORS.ink, 0.008);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 1.63;
  g.add(shaft, head, collar);
  return { group: g, tip: new THREE.Vector3(0, 0, 2.03), length: 2.03 };
}

const LOOKS = {
  player: { robe: 0x2b2a28, hakama: 0x1e1d1c, sash: 0x4b4741, hat: null, topknot: true },
  ronin: { robe: 0x5e5b55, hakama: 0x3f3d3a, sash: 0x2a2826, hat: 'kasa', topknot: false },
  spearman: { robe: 0x7a766c, hakama: 0x4a4740, sash: 0x2a2826, hat: 'jingasa', armor: true },
};

export class FighterModel {
  constructor(look, weaponKind) {
    const L = LOOKS[look];
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); // leans and crouches
    this.root.add(this.body);

    // legs / hakama: a wide skirt
    const hakama = inked(new THREE.CylinderGeometry(0.24, 0.42, 0.85, 10), L.hakama, 0.03);
    hakama.position.y = 0.43;
    this.root.add(hakama);
    this.hakama = hakama;

    const torso = inked(new THREE.CylinderGeometry(0.26, 0.22, 0.65, 10), L.robe, 0.03);
    torso.position.y = 1.18;
    const sash = inked(new THREE.CylinderGeometry(0.235, 0.235, 0.1, 10), L.sash, 0.015);
    sash.position.y = 0.88;
    this.body.add(torso, sash);
    if (L.armor) {
      const plate = inked(new THREE.BoxGeometry(0.5, 0.42, 0.32), 0x3a3733, 0.02);
      plate.position.set(0, 1.22, 0.04);
      this.body.add(plate);
    }
    const head = inked(new THREE.SphereGeometry(0.15, 12, 10), COLORS.skin, 0.025);
    head.position.y = 1.66;
    this.body.add(head);
    if (L.topknot) {
      const hair = inked(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), COLORS.ink, 0.01);
      hair.position.y = 1.67;
      hair.rotation.x = -0.25;
      const knot = inked(new THREE.CylinderGeometry(0.035, 0.03, 0.14, 6), COLORS.ink, 0.01);
      knot.position.set(0, 1.82, -0.06);
      knot.rotation.x = -0.9;
      this.body.add(hair, knot);
    }
    if (L.hat === 'kasa') {
      const kasa = inked(new THREE.ConeGeometry(0.48, 0.24, 14, 1, true), 0xb9ab8a, 0.03);
      kasa.material = toon(0xb9ab8a).clone();
      kasa.material.side = THREE.DoubleSide;
      kasa.position.y = 1.8;
      this.body.add(kasa);
    } else if (L.hat === 'jingasa') {
      const j = inked(new THREE.ConeGeometry(0.36, 0.12, 12), 0x2e2c29, 0.025);
      j.position.y = 1.83;
      this.body.add(j);
    }

    // arms
    this.shoulderL = new THREE.Vector3(0.24, 1.45, 0.02);
    this.shoulderR = new THREE.Vector3(-0.24, 1.45, 0.02);
    this.armL = limb(L.robe, 0.06);
    this.armR = limb(L.robe, 0.06);
    this.body.add(this.armL, this.armR);

    // weapon
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.rotation.order = 'YXZ';
    this.body.add(this.weaponPivot);
    const w = weaponKind === 'yari' ? buildYari() : buildKatana();
    this.weapon = w;
    this.weaponPivot.add(w.group);
    this.gripOffset = weaponKind === 'yari' ? 0.45 : 0.0;
    w.group.position.z = -this.gripOffset;

    // red glint: the tell before a strike
    glintTex ||= glintTexture();
    this.glint = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthTest: false, depthWrite: false })
    );
    this.glint.scale.setScalar(0.001);
    this.glint.renderOrder = 10;
    this.glint.position.copy(w.tip);
    w.group.add(this.glint);

    // a faint ink shadow under the fighter
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      flat(COLORS.ink, { transparent: true, opacity: 0.18, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.root.add(shadow);
    this.shadow = shadow;

    this.cur = lerpPose(POSES[weaponKind].guard[1], POSES[weaponKind].guard[1], 0);
    this.fall = 0;
  }

  // Ease toward a target pose. rate is how quickly (per second); Infinity snaps.
  apply(target, rate, dt) {
    const k = rate === Infinity ? 1 : 1 - Math.exp(-rate * dt);
    lerpPose(this.cur, target, k, this.cur);
    const p = this.cur;

    this.body.position.y = -p.crouch;
    this.body.rotation.x = p.lean * 0.6;
    this.hakama.scale.y = 1 - p.crouch * 0.6;
    this.hakama.position.y = 0.43 - p.crouch * 0.25;

    this.weaponPivot.position.set(p.hx, p.hy, p.hz);
    this.weaponPivot.rotation.set(p.pitch, p.yaw, p.roll);

    // hands: two grips along the weapon axis
    tmpDir.set(0, 0, 1).applyEuler(this.weaponPivot.rotation);
    tmpA.set(p.hx, p.hy, p.hz).addScaledVector(tmpDir, 0.06);
    tmpB.set(p.hx, p.hy, p.hz).addScaledVector(tmpDir, this.gripOffset > 0 ? -0.5 : -0.1);
    placeLimb(this.armR, this.shoulderR, tmpA);
    placeLimb(this.armL, this.shoulderL, tmpB);
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
