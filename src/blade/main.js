// Blade sandbox: the sword follows the mouse with weight. Cuts land by blade speed,
// blades physically collide, and the Ronin fights with the same physical blade.
// A prototype to compare against the stance-based controls in the main game.
import * as THREE from 'three';
import { ARENA_RADIUS } from '../config.js';
import { buildEnvironment, PenRenderer, noEdges } from '../ink.js';
import { FighterModel } from '../models.js';
import { Effects } from '../fx.js';
import { Sound } from '../audio.js';

const D2R = Math.PI / 180;
const BLADE_LEN = 1.1;
const CUT_SPEED = 4.2; // m/s at the blade for a touch to become a cut
const SUBSTEPS = 6;
const SAMPLES = [0.3, 0.5, 0.7, 0.85, 1.0]; // points along the blade that can cut

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- the blade ----------

// The blade is driven by an "aim" point a in a unit disc: x is right/left, y is up/down.
// The aim chases its target through a spring, so the sword has weight and momentum.
class Blade {
  constructor() {
    this.a = new THREE.Vector2(0, 0);
    this.v = new THREE.Vector2();
    this.target = new THREE.Vector2();
    this.ext = 0;
    this.extV = 0;
    this.extTarget = 0;
    this.k = 200; // stiffness: how hard the arms pull the blade toward the aim
    this.maxSpeed = 10;
    this.hand = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.points = SAMPLES.map(() => new THREE.Vector3()); // world
    this.prev = SAMPLES.map(() => new THREE.Vector3());
    this.speeds = SAMPLES.map(() => 0);
    this.bounce = 0; // after a clash the blade rebounds instead of following the aim
  }

  step(h) {
    const k = this.k;
    const c = 2 * Math.sqrt(k) * 0.85;
    if (this.bounce > 0) this.bounce -= h;
    const pull = this.bounce > 0 ? 0.15 : 1;
    this.v.x += (k * pull * (this.target.x - this.a.x) - c * this.v.x) * h;
    this.v.y += (k * pull * (this.target.y - this.a.y) - c * this.v.y) * h;
    const sp = this.v.length();
    if (sp > this.maxSpeed) this.v.multiplyScalar(this.maxSpeed / sp);
    this.a.addScaledVector(this.v, h);
    const r = this.a.length();
    if (r > 1.15) this.a.multiplyScalar(1.15 / r);
    const ke = 140, ce = 2 * Math.sqrt(ke) * 0.9;
    this.extV += (ke * (this.extTarget - this.ext) - ce * this.extV) * h;
    this.ext = THREE.MathUtils.clamp(this.ext + this.extV * h, -0.4, 1.1);
  }

  // local pose for the model, and the blade line in fighter space
  pose(out) {
    const a = this.a, e = Math.max(0, this.ext);
    const straighten = 1 - e * 0.6; // a thrust points the blade at him
    out.hx = -a.x * 0.34;
    out.hy = 1.22 + a.y * 0.4;
    out.hz = 0.45 + this.ext * 0.42;
    out.pitch = -a.y * 78 * D2R * straighten;
    out.yaw = -a.x * 82 * D2R * straighten;
    out.roll = 0;
    out.lean = e * 0.25;
    out.crouch = 0;
    this.hand.set(out.hx, out.hy, out.hz);
    this.dir.set(Math.sin(out.yaw) * Math.cos(out.pitch), -Math.sin(out.pitch), Math.cos(out.yaw) * Math.cos(out.pitch));
    return out;
  }
}

// ---------- a duelist ----------

class Duelist {
  constructor(look, name, vitality, game) {
    this.model = new FighterModel(look, 'katana');
    this.name = name;
    this.maxVit = vitality;
    this.game = game;
    this.blade = new Blade();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.move = new THREE.Vector2();
    this.poseObj = {};
    this.reset();
  }

  reset() {
    this.vit = this.maxVit;
    this.stun = 0;
    this.hitCooldown = 0;
    this.dead = false;
    this.deathT = 0;
    this.dodge = 0;
    this.blade.a.set(0, 0);
    this.blade.v.set(0, 0);
    this.blade.ext = 0;
    this.model.root.rotation.set(0, 0, 0);
    this.model.setGlint(0);
  }

  toWorld(v, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(this.pos.x + v.x * c + v.z * s, v.y, this.pos.z - v.x * s + v.z * c);
  }

  // refresh the blade's world sample points; keep the previous ones for speed
  sampleBlade(h) {
    const b = this.blade;
    b.pose(this.poseObj);
    for (let i = 0; i < SAMPLES.length; i++) {
      b.prev[i].copy(b.points[i]);
      tmp.copy(b.hand).addScaledVector(b.dir, SAMPLES[i] * BLADE_LEN);
      this.toWorld(tmp, b.points[i]);
      b.speeds[i] = h > 0 ? b.points[i].distanceTo(b.prev[i]) / h : 0;
    }
  }

  bladeSegment(from, to) {
    const b = this.blade;
    this.toWorld(tmp.copy(b.hand).addScaledVector(b.dir, 0.2), from);
    this.toWorld(tmp.copy(b.hand).addScaledVector(b.dir, BLADE_LEN), to);
  }

  // distance from a world point to this body (legs, torso, head)
  bodyDistance(p) {
    const y = p.y;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const flat = Math.hypot(dx, dz);
    const head = Math.hypot(flat, y - 1.7) - 0.14;
    const torsoY = THREE.MathUtils.clamp(y, 0.95, 1.55);
    const torso = Math.hypot(flat, y - torsoY) - 0.3;
    const legsY = THREE.MathUtils.clamp(y, 0.2, 0.9);
    const legs = Math.hypot(flat, y - legsY) - 0.36;
    return Math.min(head, torso, legs);
  }

  distTo(o) {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  updateBody(dt, opp, speed) {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.9);
      const e = 1 - Math.pow(1 - k, 3);
      this.model.root.rotation.x = -e * 1.45;
      this.blade.target.set(0.4, -1);
      return;
    }
    // footwork relative to the opponent: sideways circles, forward/back changes distance
    tmp.subVectors(this.pos, opp.pos).setY(0);
    const dist = Math.max(0.5, tmp.length());
    const mv = this.move.length() > 1 ? this.move.clone().normalize() : this.move;
    const sp = speed * (this.stun > 0 ? 0.3 : 1);
    const theta = (mv.x * sp * dt * 0.9) / dist;
    const c = Math.cos(theta), s = Math.sin(theta);
    tmp.set(tmp.x * c + tmp.z * s, 0, -tmp.x * s + tmp.z * c);
    tmp.setLength(Math.max(0.95, dist - mv.y * sp * dt));
    this.pos.set(opp.pos.x + tmp.x, 0, opp.pos.z + tmp.z);
    if (this.dodge > 0) {
      this.dodge -= dt;
      tmp.subVectors(this.pos, opp.pos).setY(0).normalize();
      this.pos.addScaledVector(tmp, 7 * dt);
    }
    this.pos.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-7 * dt));
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) this.pos.multiplyScalar(ARENA_RADIUS / r);
    const target = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-9 * dt));
    if (this.stun > 0) this.stun -= dt;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    this.moving = mv.lengthSq() > 0.01;
  }

  updateModel(dt) {
    const m = this.model;
    m.apply(this.blade.pose(this.poseObj), Infinity, dt);
    m.step(dt, this.moving && !this.dead ? 1 : 0);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
  }
}

// ---------- the Ronin's mind ----------

// Swings are scripted aim paths: a readable windup (with the red glint), then a fast
// sweep through the target. His guard tracks your blade a beat late.
const PATTERNS = [
  { name: 'overhead', wind: [0, 1.05], windExt: -0.2, end: [0, -0.85], endExt: 0.8 },
  { name: 'from his right', wind: [1.05, 0.4], windExt: -0.1, end: [-1.0, -0.25], endExt: 0.6 },
  { name: 'from his left', wind: [-1.05, 0.4], windExt: -0.1, end: [1.0, -0.25], endExt: 0.6 },
  { name: 'rising', wind: [0.7, -0.95], windExt: -0.1, end: [-0.5, 0.95], endExt: 0.5 },
  { name: 'thrust', wind: [0, 0.15], windExt: -0.4, end: [0, 0.1], endExt: 1.1, thrust: true },
];

class RoninMind {
  constructor(me, foe) {
    this.me = me;
    this.foe = foe;
    this.state = 'guard';
    this.t = 0;
    this.cool = rand(1.2, 2.0);
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rand(1, 3);
    this.seen = []; // delayed memory of where your blade tip was
  }

  update(dt) {
    const me = this.me, foe = this.foe, b = me.blade;
    this.t += dt;
    if (me.dead) return;
    if (me.stun > 0) {
      this.state = 'guard';
      me.model.setGlint(0);
      b.target.set(0.3, -0.9);
      b.extTarget = -0.2;
      me.move.set(0, -0.5);
      return;
    }
    const d = me.distTo(foe);

    // remember your tip so the guard reacts ~0.17 s late
    const tipLocal = this.toLocal(foe.blade.points[SAMPLES.length - 1]);
    this.seen.push({ t: this.t, x: tipLocal.x, y: tipLocal.y });
    while (this.seen.length > 2 && this.seen[1].t < this.t - 0.17) this.seen.shift();

    switch (this.state) {
      case 'guard': {
        const s = this.seen[0];
        // put the blade between your tip and his body
        const gx = THREE.MathUtils.clamp(-s.x / 0.8, -1, 1);
        const gy = THREE.MathUtils.clamp((s.y - 1.25) / 0.55, -0.9, 1);
        b.target.set(gx * 0.85, gy * 0.85);
        b.extTarget = 0.1;
        b.k = 120;
        b.maxSpeed = 8;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(1.2, 3); }
        me.move.set(this.strafe * 0.5, THREE.MathUtils.clamp((d - 1.95) * 1.5, -1, 1));
        this.cool -= dt;
        if (this.cool <= 0 && d < 2.6) this.begin();
        break;
      }
      case 'windup': {
        const p = this.pattern;
        b.target.set(p.wind[0], p.wind[1]);
        b.extTarget = p.windExt;
        b.k = 70;
        me.move.set(0, THREE.MathUtils.clamp((d - 1.9) * 1.2, -0.6, 0.6));
        const left = this.windTime - this.t;
        me.model.setGlint(Math.min(1, this.t / this.windTime) * 0.7 + (left < 0.18 ? 0.5 : 0));
        if (this.t >= this.windTime) { this.state = 'swing'; this.t = 0; me.model.setGlint(0); me.game.sound.whoosh(); }
        break;
      }
      case 'swing': {
        const p = this.pattern;
        b.target.set(p.end[0], p.end[1]);
        b.extTarget = p.endExt;
        b.k = 420;
        b.maxSpeed = 10;
        me.move.set(0, this.t < 0.15 ? 1.2 : 0); // step into it
        if (this.t > 0.32) { this.state = 'recover'; this.t = 0; }
        break;
      }
      case 'recover':
        b.k = 90;
        b.maxSpeed = 8;
        b.target.set(0, -0.1);
        b.extTarget = 0;
        me.move.set(0, -0.4);
        if (this.t > 0.55) { this.state = 'guard'; this.cool = rand(0.9, 2.2); }
        break;
    }
  }

  begin() {
    this.pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    this.windTime = rand(0.55, 0.75);
    this.state = 'windup';
    this.t = 0;
    this.me.game.sound.tell();
  }

  toLocal(world) {
    const me = this.me;
    const dx = world.x - me.pos.x, dz = world.z - me.pos.z;
    const c = Math.cos(me.yaw), s = Math.sin(me.yaw);
    return { x: dx * c - dz * s, y: world.y, z: dx * s + dz * c };
  }
}

// ---------- segment math ----------

const segA = new THREE.Vector3(), segB = new THREE.Vector3(), segC = new THREE.Vector3(), segD = new THREE.Vector3();
const closeP = new THREE.Vector3(), closeQ = new THREE.Vector3();
function segmentDistance(p1, q1, p2, q2) {
  const d1 = tmp.subVectors(q1, p1), d2 = tmp2.subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  const c = d1.dot(r), b = d1.dot(d2);
  const den = a * e - b * b;
  let s = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
  else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  closeP.copy(p1).addScaledVector(d1, s);
  closeQ.copy(p2).addScaledVector(d2, t);
  return { dist: closeP.distanceTo(closeQ), s, t };
}

// ---------- ink trail behind a moving blade ----------

class Trail {
  constructor(scene) {
    this.n = 14;
    this.hist = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.alpha = new Float32Array(this.n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.086,0.082,0.078, vA * 0.55); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    noEdges.add(this.mesh);
  }

  push(inner, outer, speed) {
    this.hist.unshift({ a: inner.clone(), b: outer.clone(), s: speed });
    if (this.hist.length > this.n) this.hist.pop();
    for (let i = 0; i < this.n; i++) {
      const h = this.hist[Math.min(i, this.hist.length - 1)];
      this.pos.set([h.a.x, h.a.y, h.a.z], i * 6);
      this.pos.set([h.b.x, h.b.y, h.b.z], i * 6 + 3);
      const fade = (1 - i / this.n) * THREE.MathUtils.clamp((h.s - 3) / 6, 0, 1);
      this.alpha[i * 2] = fade * 0.4;
      this.alpha[i * 2 + 1] = fade;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

// ---------- the sandbox ----------

class Sandbox {
  constructor() {
    const canvas = document.getElementById('game');
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    buildEnvironment(this.scene);
    this.pen = new PenRenderer(this.renderer, this.scene, this.camera);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.pen.setSize(innerWidth, innerHeight);
    });
    this.fx = new Effects(this.scene);
    this.sound = new Sound();

    this.player = new Duelist('player', 'Wanderer', 3, this);
    this.enemy = new Duelist('ronin', 'The Ronin', 2, this);
    this.scene.add(this.player.model.root, this.enemy.model.root);
    this.mind = new RoninMind(this.enemy, this.player);
    this.trails = [new Trail(this.scene), new Trail(this.scene)];

    this.keys = new Set();
    this.mouse = new THREE.Vector2(0.5, 0.5);
    this.lmb = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.onKey(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => this.mouse.set(e.clientX / innerWidth, e.clientY / innerHeight));
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.lmb = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.aimEl = document.getElementById('aim');
    this.callout = document.getElementById('callout');
    this.calloutT = 0;

    document.getElementById('begin').addEventListener('click', () => this.start());
    document.getElementById('again').addEventListener('click', () => this.start());
    this.mode = 'title';
    this.time = 0;
    this.stop = 0;
    this.slow = { t: 0, dur: 1, scale: 1 };
    this.shake = 0;
    this.lastClash = -1;
    this.resetPositions();
    this.clock = new THREE.Clock();
    const loop = () => { requestAnimationFrame(loop); this.frame(Math.min(0.05, this.clock.getDelta())); };
    requestAnimationFrame(loop);
  }

  resetPositions() {
    this.player.reset();
    this.enemy.reset();
    this.player.pos.set(0, 0, 2.6);
    this.enemy.pos.set(0, 0, -0.4);
    this.player.yaw = Math.PI;
    this.enemy.yaw = 0;
    this.mind = new RoninMind(this.enemy, this.player);
    this.fx.clear();
    this.camera.position.set(1.2, 2.1, 6.6);
  }

  start() {
    this.sound.start();
    this.resetPositions();
    this.mode = 'fight';
    document.getElementById('title').hidden = true;
    document.getElementById('result').hidden = true;
    this.say('Draw', 0.8);
  }

  onKey(code) {
    if (code === 'KeyR' && this.mode !== 'title') this.start();
    if (code === 'Space' && this.mode === 'fight' && this.player.dodge <= 0 && this.player.stun <= 0) {
      this.player.dodge = 0.28;
      this.sound.step();
    }
  }

  say(text, t = 0.7, bad = false) {
    this.callout.textContent = text;
    this.callout.className = 'show' + (bad ? ' bad' : '');
    this.calloutT = t;
  }

  hitstop(d) { this.stop = Math.max(this.stop, d); }
  slowmo(scale, dur) { this.slow = { scale, t: dur, dur }; }

  frame(realDt) {
    let scale = 1;
    if (this.stop > 0) { this.stop -= realDt; scale = 0.02; }
    else if (this.slow.t > 0) {
      this.slow.t -= realDt;
      const k = Math.max(0, this.slow.t / this.slow.dur);
      scale = this.slow.scale + (1 - this.slow.scale) * (1 - Math.min(1, k * 1.6));
    }
    const dt = realDt * scale;
    this.time += dt;

    const P = this.player, E = this.enemy;
    if (this.mode === 'fight' || this.mode === 'over') {
      this.controlPlayer();
      this.mind.update(dt);
      P.updateBody(dt, E, 2.8);
      E.updateBody(dt, P, 2.6);
      this.simulate(dt);
    } else {
      P.blade.target.set(0, 0);
      E.blade.target.set(0, 0);
      P.blade.step(realDt);
      E.blade.step(realDt);
    }
    P.updateModel(dt);
    E.updateModel(dt);
    if (this.mode === 'title') { P.sampleBlade(realDt); E.sampleBlade(realDt); }

    // ink smears behind fast blades
    for (const [f, tr] of [[P, this.trails[0]], [E, this.trails[1]]]) {
      const b = f.blade;
      tr.push(b.points[1], b.points[SAMPLES.length - 1], b.speeds[SAMPLES.length - 1]);
    }

    if (this.calloutT > 0) { this.calloutT -= realDt; if (this.calloutT <= 0) this.callout.className = ''; }
    this.aimEl.style.transform = `translate(${this.mouse.x * innerWidth}px, ${this.mouse.y * innerHeight}px)`;
    document.body.classList.toggle('aiming', this.mode === 'fight');
    document.getElementById('pv').textContent = '●'.repeat(P.vit) + '○'.repeat(P.maxVit - P.vit);
    document.getElementById('ev').textContent = '●'.repeat(E.vit) + '○'.repeat(E.maxVit - E.vit);

    this.fx.update(dt, realDt);
    this.updateCamera(realDt);
    this.pen.render(performance.now() / 1000);
  }

  controlPlayer() {
    const P = this.player, b = P.blade;
    const k = this.keys;
    P.move.set((k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0), (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0));
    if (P.dead) P.move.set(0, 0);
    if (P.stun > 0 || P.dead) {
      b.target.set(0.3, -0.9);
      b.extTarget = -0.2;
      return;
    }
    // the mouse is where your hands want the blade; the spring gives it weight
    const tx = (this.mouse.x * 2 - 1) * 1.35;
    const ty = -(this.mouse.y * 2 - 1) * 1.35;
    b.target.set(tx, ty);
    if (b.target.length() > 1.1) b.target.setLength(1.1);
    b.extTarget = this.lmb ? 1 : 0;
    b.k = 210;
    b.maxSpeed = 11;
  }

  simulate(dt) {
    const P = this.player, E = this.enemy;
    const h = dt / SUBSTEPS;
    if (h <= 0) return;
    for (let s = 0; s < SUBSTEPS; s++) {
      P.blade.step(h);
      E.blade.step(h);
      P.sampleBlade(h);
      E.sampleBlade(h);
      if (this.bladeContact()) continue;
      this.checkCut(P, E);
      this.checkCut(E, P);
    }
  }

  bladeContact() {
    const P = this.player, E = this.enemy;
    P.bladeSegment(segA, segB);
    E.bladeSegment(segC, segD);
    const { dist, s, t } = segmentDistance(segA, segB, segC, segD);
    if (dist > 0.07) return false;
    // relative speed at the touching points
    const iP = Math.min(SAMPLES.length - 1, Math.round(s * (SAMPLES.length - 1)));
    const iE = Math.min(SAMPLES.length - 1, Math.round(t * (SAMPLES.length - 1)));
    const strength = P.blade.speeds[iP] + E.blade.speeds[iE];
    if (this.time - this.lastClash < 0.12) return true;
    // blades resting against each other just press; only an impact stops a cut
    if (strength < 2.5) return false;
    if (strength < 6) {
      // a light touch: the blades glance off each other quietly
      for (const f of [P, E]) f.blade.v.multiplyScalar(0.6);
      return true;
    }
    this.lastClash = this.time;
    const at = closeP.clone().lerp(closeQ, 0.5);
    for (const f of [P, E]) {
      f.blade.v.multiplyScalar(-0.45);
      f.blade.bounce = 0.12 + Math.min(0.18, strength * 0.01);
    }
    {
      this.sound.ring(Math.min(1.4, strength / 9), 1);
      this.fx.spark(at, Math.min(18, 4 + strength));
      this.hitstop(Math.min(0.1, 0.02 + strength * 0.006));
      this.shake = Math.max(this.shake, Math.min(0.15, strength * 0.012));
      // a hard, fast swing met by a steadier blade reads as a block
      const pFast = P.blade.speeds[iP], eFast = E.blade.speeds[iE];
      if (strength > 8) {
        const sp = at.clone().project(this.camera);
        this.fx.burst((sp.x + 1) / 2 * innerWidth, (1 - sp.y) / 2 * innerHeight);
        this.say(eFast > pFast ? 'Blocked' : 'Clash', 0.5);
        if (this.mind.state === 'swing' && eFast > pFast) { this.mind.state = 'recover'; this.mind.t = -0.35; }
      }
    }
    return true;
  }

  checkCut(att, def) {
    if (att.dead || def.dead || att.hitCooldown > 0 || def.dodge > 0) return;
    const b = att.blade;
    for (let i = 0; i < SAMPLES.length; i++) {
      if (b.speeds[i] < CUT_SPEED) continue;
      if (def.bodyDistance(b.points[i]) > 0) continue;
      this.cut(att, def, b.points[i], b.speeds[i]);
      return;
    }
  }

  cut(att, def, at, speed) {
    att.hitCooldown = 0.4;
    def.vit -= 1;
    def.stun = 0.45;
    tmp.subVectors(def.pos, att.pos).setY(0).normalize();
    def.vel.addScaledVector(tmp, 3.5);
    this.sound.cut();
    this.fx.blood(at.clone(), tmp.clone(), def.vit <= 0 ? 70 : 24);
    this.fx.stain(def.pos.x, def.pos.z, def.vit <= 0 ? 0.9 : 0.35);
    this.shake = Math.max(this.shake, 0.2);
    if (def.vit <= 0) {
      def.dead = true;
      this.mode = 'over';
      this.slowmo(0.12, 1.7);
      this.fx.slash();
      this.sound.drum();
      const won = def === this.enemy;
      this.say(won ? 'Victory' : 'Fallen', 2.4, !won);
      setTimeout(() => {
        const r = document.getElementById('result');
        r.querySelector('h2').textContent = won ? 'The Ronin falls.' : 'The road ends here.';
        r.hidden = false;
      }, 2300);
      return;
    }
    this.hitstop(0.09);
    this.slowmo(0.4, 0.3);
    this.say(att === this.player ? (speed > 9 ? 'Clean cut' : 'Cut') : 'Wounded', 0.7, att !== this.player);
  }

  updateCamera(dt) {
    const p = this.player.pos, e = this.enemy.pos;
    const f = tmp.subVectors(e, p).setY(0);
    const dist = f.length() || 1;
    f.divideScalar(dist);
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const desired = new THREE.Vector3().copy(p).addScaledVector(f, -3.6).addScaledVector(right, 1.6).setY(2.35);
    const look = new THREE.Vector3().copy(p).addScaledVector(f, Math.min(dist * 0.6, 3)).setY(1.25);
    const k = 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(desired, k);
    this.camLook.lerp(look, k);
    this.camera.lookAt(this.camLook);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.9);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
  }
}

window.sandbox = new Sandbox();
