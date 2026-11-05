// The Spring map: walk the valley in the pen-and-ink renderer. Fighters wait on the
// road; walk up to one and the combat prototype's duel plays out right there, then you
// walk on.
import * as THREE from 'three';
import { PenRenderer, flat, noEdges } from '../ink.js';
import { COLORS, PLAYER_DEF, RONIN_DEF, SPEARMAN_DEF } from '../config.js';
import { POSES, lerpPose } from '../models.js';
import { Sound } from '../audio.js';
import { Fighter } from '../fighter.js';
import { RoninAI, SpearmanAI } from '../ai.js';
import { DuelStage } from '../duel.js';
import { Input } from '../input.js';
import { Effects } from '../fx.js';
import { Hud } from '../hud.js';
import { CONTROLS } from '../player.js';
import { buildGround, heightAt, waterAt, CLEARINGS, DUEL_SPOTS, ARENA_R, roadCurves } from './terrain.js';
import { buildWorld, colliders, PINK } from './world.js';
import { buildGrass } from './grass.js';

// who waits at each duel spot on the road
const FOES = {
  ronin: { def: RONIN_DEF, look: 'ronin', AI: RoninAI },
  wanderer: {
    def: { ...RONIN_DEF, id: 'wanderer', name: 'The Wandering Ronin', title: 'he wants the lookout to himself' },
    look: 'ronin', AI: RoninAI,
  },
  spearman: { def: SPEARMAN_DEF, look: 'spearman', AI: SpearmanAI },
};
const CHALLENGE_DIST = 6.5; // walk this close and the duel begins
const WALK = 2.6;
const RUN = 5.6;
const BOUNDS = 112;
const PLACES = [
  { name: 'The South Gate', sub: 'where the road begins', at: CLEARINGS.gate, r: 12 },
  { name: 'The Crossroads', sub: 'inn to the west, lookout to the east', at: [-4, 10], r: 10 },
  { name: 'Plum Hill Inn', sub: 'rest, and the gossip of the road', at: CLEARINGS.inn, r: 14 },
  { name: 'The Lookout', sub: 'a great cherry above the valley', at: CLEARINGS.lookout, r: 14 },
  { name: 'The Bridge', sub: 'snowmelt running fast', at: [7, -27], r: 8 },
  { name: 'Shrine of the Petal Blade', sub: 'he waits beyond the torii', at: CLEARINGS.shrine, r: 16 },
];

class Keys {
  constructor() {
    this.down = new Set();
    addEventListener('keydown', (e) => {
      this.down.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  has(...codes) { return codes.some((c) => this.down.has(c)); }
}

// petals drifting on the wind in a box that follows the camera
class Petals {
  constructor(scene, n = 900) {
    const geo = new THREE.PlaneGeometry(0.09, 0.06);
    this.mesh = new THREE.InstancedMesh(geo, flat(0xffffff, { side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    this.p = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.p.push({
        x: (Math.random() - 0.5) * 60, y: Math.random() * 14, z: (Math.random() - 0.5) * 60,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: 1 + Math.random() * 3, fall: 0.35 + Math.random() * 0.5,
        ph: Math.random() * 6.28,
      });
      this.mesh.setColorAt(i, c.set(Math.random() < 0.7 ? PINK.petal : PINK.blossom));
    }
    this.d = new THREE.Object3D();
    scene.add(this.mesh);
    noEdges.add(this.mesh);
  }
  update(dt, t, center) {
    const d = this.d;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i];
      p.y -= p.fall * dt;
      p.x += (0.9 + Math.sin(t * 0.4 + p.ph) * 0.6) * dt;
      p.z += Math.sin(t * 1.3 + p.ph) * 0.4 * dt;
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      // wrap around the camera so there are always petals in view
      const wx = center.x + ((((p.x - center.x) % 60) + 90) % 60) - 30;
      const wz = center.z + ((((p.z - center.z) % 60) + 90) % 60) - 30;
      const ground = heightAt(wx, wz);
      if (p.y < 0) { p.y = 10 + Math.random() * 5; }
      d.position.set(wx, ground + p.y, wz);
      d.rotation.set(p.rx, p.ry, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class SpringMap {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.paper);
    this.scene.fog = new THREE.Fog(COLORS.paper, 30, 150);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);

    this.ground = buildGround();
    this.scene.add(this.ground);
    buildWorld(this.scene);
    this.grassMat = buildGrass(this.scene);
    this.petals = new Petals(this.scene);

    this.pen = new PenRenderer(this.renderer, this.scene, this.camera);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.pen.setSize(innerWidth, innerHeight);
    });

    // duels: the combat prototype's stage, run on the map
    this.input = new Input(canvas);
    this.sound = new Sound();
    this.fx = new Effects(this.scene);
    this.hud = new Hud();
    this.stage = new DuelStage({
      scene: this.scene, camera: this.camera, sound: this.sound, hud: this.hud, fx: this.fx, input: this.input,
      host: { onResult: (won) => this.duelResult(won) },
    });
    this.mode = 'explore'; // explore | duel

    // the wanderer: walking, the sword sheathed and a hand on the hilt; in a duel, the
    // same figure is driven by the combat fighter
    this.fighter = new Fighter(PLAYER_DEF, 'player', this.stage);
    this.model = this.fighter.model;
    this.scene.add(this.model.root);

    // fighters waiting on the road, blades drawn, facing the way you will come
    this.foes = DUEL_SPOTS.map((spot) => {
      const F = FOES[spot.id];
      const f = new Fighter(F.def, F.look, this.stage);
      const tan = roadCurves[spot.road].curve.getTangentAt(spot.t);
      f.pos.set(spot.x, spot.y, spot.z);
      f.yaw = Math.atan2(-tan.x, -tan.z);
      this.scene.add(f.model.root);
      return { spot, f, AI: F.AI, beaten: false, restYaw: f.yaw };
    });
    this.pos = new THREE.Vector3(CLEARINGS.gate[0], 0, CLEARINGS.gate[1] - 3);
    this.lastPos = this.pos.clone();
    this.yaw = Math.PI; // face north, up the road
    this.vel = new THREE.Vector3();
    const S = POSES.katana.sheathed;
    this.walkPose = lerpPose(S, S, 0);
    this.walkPose.lean = 0.02;
    this.walkPose.crouch = 0;
    this.runPose = lerpPose(S, S, 0);
    this.runPose.lean = 0.16;
    this.runPose.crouch = 0.04;
    this.pose = lerpPose(S, S, 0);

    // camera orbit: yaw/pitch around the wanderer, behind the shoulder
    this.camYaw = this.yaw;
    this.camPitch = 0.28;
    this.camDist = 5.2;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.bindMouse(canvas);

    this.keys = new Keys();
    this.time = 0;
    this.stepPhase = 0;
    this.place = null;
    this.placeEl = document.getElementById('place');
    this.started = false;

    const begin = () => {
      if (this.started) return;
      this.started = true;
      this.hud.screenHtml('');
      document.getElementById('hint').classList.remove('hidden');
      this.sound.start();
      canvas.requestPointerLock?.()?.catch?.(() => {});
    };
    document.getElementById('begin').addEventListener('click', begin);
    addEventListener('keydown', (e) => { if (!this.started && (e.code === 'Enter' || e.code === 'Space')) begin(); });

    this.clock = new THREE.Clock();
    this.snapCamera();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindMouse(canvas) {
    let dragging = false;
    const look = (dx, dy) => {
      this.camYaw -= dx * 0.0042;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.003, -0.15, 1.1);
    };
    canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      if (this.started && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
      e.preventDefault();
    });
    addEventListener('mouseup', () => (dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || dragging) look(e.movementX, e.movementY);
    });
    canvas.addEventListener('wheel', (e) => {
      this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.6, 2.6, 12);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- movement ----------

  update(dt) {
    const K = this.keys;
    // arrow keys turn the camera too, for trackpads and iframes without pointer lock
    if (K.has('ArrowLeft')) this.camYaw += 1.8 * dt;
    if (K.has('ArrowRight')) this.camYaw -= 1.8 * dt;
    if (K.has('ArrowUp')) this.camPitch = Math.min(1.1, this.camPitch + 0.8 * dt);
    if (K.has('ArrowDown')) this.camPitch = Math.max(-0.15, this.camPitch - 0.8 * dt);

    let ix = 0, iz = 0;
    if (this.started) {
      if (K.has('KeyW')) iz += 1;
      if (K.has('KeyS')) iz -= 1;
      if (K.has('KeyA')) ix += 1;
      if (K.has('KeyD')) ix -= 1;
    }
    const running = K.has('ShiftLeft', 'ShiftRight');
    const want = new THREE.Vector3();
    if (ix || iz) {
      // camera-relative: forward is where the camera looks
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      want.set(fx * iz + fz * ix, 0, fz * iz - fx * ix).normalize().multiplyScalar(running ? RUN : WALK);
    }
    const accel = 1 - Math.exp(-(want.lengthSq() ? 9 : 12) * dt);
    this.vel.lerp(want, accel);
    this.pos.addScaledVector(this.vel, dt);
    this.collide();

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-10 * dt));
    }

    // height: on the ground, or on the bridge deck
    let y = heightAt(this.pos.x, this.pos.z);
    for (const f of colliders.fords) {
      const l = this.local(f);
      if (Math.abs(l.x) < f.halfW + 0.4 && Math.abs(l.z) < f.halfLen) {
        if (f.deckY) y = Math.max(y, f.deckY(THREE.MathUtils.clamp((l.z + f.halfLen - 0.5) / (f.halfLen * 2 - 1), 0, 1)) + 0.06);
        else if (f.stones) y = Math.max(y, heightAt(this.pos.x, this.pos.z) + 0.52 * Math.min(1, waterAt(this.pos.x, this.pos.z) * 3));
      }
    }
    this.pos.y += (y - this.pos.y) * (1 - Math.exp(-20 * dt));

    // the body: lean into a run, then feet that step with the real ground speed
    const runT = THREE.MathUtils.clamp((speed - WALK) / (RUN - WALK), 0, 1);
    const target = lerpPose(this.walkPose, this.runPose, runT, {});
    lerpPose(this.pose, target, 1 - Math.exp(-8 * dt), this.pose);
    const m = this.model;
    m.apply(this.pose, Infinity, dt);
    const v = new THREE.Vector3().subVectors(this.pos, this.lastPos).divideScalar(Math.max(dt, 1e-4));
    v.y = 0;
    this.lastPos.copy(this.pos);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    m.step(dt, v.x * cy - v.z * sy, v.x * sy + v.z * cy);
    m.body.position.y += Math.sin(this.time * 2.2) * 0.006;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;

    // footfalls: one sound each time a foot comes down
    const prev = this.stepPhase;
    this.stepPhase = m.gait / Math.PI;
    if (speed > 0.6 && Math.floor(prev) !== Math.floor(this.stepPhase)) this.sound.step();

    this.updatePlace();
  }

  local(f) {
    const dx = this.pos.x - f.x, dz = this.pos.z - f.z;
    const c = Math.cos(f.ry), s = Math.sin(f.ry);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  collide() {
    const p = this.pos;
    const R = 0.35;
    for (const c of colliders.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + R;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const s of colliders.segments) {
      const ex = s.bx - s.ax, ez = s.bz - s.az;
      const t = THREE.MathUtils.clamp(((p.x - s.ax) * ex + (p.z - s.az) * ez) / (ex * ex + ez * ez), 0, 1);
      const cx = s.ax + ex * t, cz = s.az + ez * t;
      const dx = p.x - cx, dz = p.z - cz;
      const min = s.r + R;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * min;
        p.z = cz + (dz / d) * min;
      }
    }
    // the stream: only crossable at the bridge and the stepping stones
    if (waterAt(p.x, p.z) > 0.5) {
      const onFord = colliders.fords.some((f) => {
        const l = this.local(f);
        return Math.abs(l.x) < f.halfW && Math.abs(l.z) < f.halfLen;
      });
      if (!onFord) {
        // slide back along the bank
        p.x = this.lastPos.x;
        p.z = this.lastPos.z;
        this.vel.multiplyScalar(0.3);
      }
    }
    const r = Math.hypot(p.x, p.z);
    if (r > BOUNDS) { p.x *= BOUNDS / r; p.z *= BOUNDS / r; }
  }

  updatePlace() {
    let found = null;
    for (const pl of PLACES) if (Math.hypot(this.pos.x - pl.at[0], this.pos.z - pl.at[1]) < pl.r) found = pl;
    if (found !== this.place) {
      this.place = found;
      if (found) {
        this.placeEl.innerHTML = `<b>${found.name}</b><span>${found.sub}</span>`;
        this.placeEl.classList.add('show');
        clearTimeout(this.placeTimer);
        this.placeTimer = setTimeout(() => this.placeEl.classList.remove('show'), 3600);
      }
    }
  }

  // ---------- camera ----------

  // how far back the camera can sit before a tree crown gets between it and the wanderer
  clearDistance(want) {
    const p = this.pos;
    const cp = Math.cos(this.camPitch);
    const dx = -Math.sin(this.camYaw) * cp, dz = -Math.cos(this.camYaw) * cp, dy = Math.sin(this.camPitch);
    const near = colliders.canopies.filter((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + want + 1);
    if (!near.length) return want;
    for (let d = 1.4; d <= want; d += 0.25) {
      const x = p.x + dx * d, y = p.y + 1.55 + dy * d, z = p.z + dz * d;
      for (const c of near) {
        if (y > c.y0 && y < c.y1 && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) {
          // the wanderer's own head inside this crown? then it can't be helped
          if (p.y + 1.55 > c.y0 && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < c.r * c.r) continue;
          return Math.max(1.4, d - 0.5);
        }
      }
    }
    return want;
  }

  cameraTarget(outPos, outLook, dt = 1) {
    const p = this.pos;
    outLook.set(p.x, p.y + 1.55, p.z);
    const cp = Math.cos(this.camPitch);
    // pull in fast when a tree is in the way, ease back out slowly
    const clear = this.clearDistance(this.camDist);
    this.camNow ??= clear;
    this.camNow += (clear - this.camNow) * (1 - Math.exp(-(clear < this.camNow ? 14 : 2.5) * dt));
    const dist = this.camNow;
    // over the right shoulder
    const side = 0.55;
    outPos.set(
      p.x - Math.sin(this.camYaw) * cp * dist - Math.cos(this.camYaw) * side,
      p.y + 1.55 + Math.sin(this.camPitch) * dist,
      p.z - Math.cos(this.camYaw) * cp * dist + Math.sin(this.camYaw) * side
    );
    outLook.x -= Math.cos(this.camYaw) * side;
    outLook.z += Math.sin(this.camYaw) * side;
    const floor = heightAt(outPos.x, outPos.z) + 0.5;
    if (outPos.y < floor) outPos.y = floor;
  }
  snapCamera() {
    this.cameraTarget(this.camPos, this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
  updateCamera(dt) {
    const tp = new THREE.Vector3(), tl = new THREE.Vector3();
    if (!this.started) {
      // a slow drift over the valley behind the title card
      const a = this.time * 0.04;
      tp.set(Math.sin(a) * 30, 14, 70 + Math.cos(a) * 10);
      tl.set(0, 3, 20);
      this.camera.position.lerp(tp, 1 - Math.exp(-1.5 * dt));
      this.camLook.lerp(tl, 1 - Math.exp(-1.5 * dt));
      this.camera.lookAt(this.camLook);
      return;
    }
    this.cameraTarget(tp, tl, dt);
    const k = 1 - Math.exp(-10 * dt);
    this.camera.position.lerp(tp, k);
    this.camLook.lerp(tl, k);
    this.camera.lookAt(this.camLook);
  }

  loop() {
    if (this.manual) return; // tests drive frames by hand with frame()
    this.frame(Math.min(this.clock.getDelta(), 1 / 20));
    requestAnimationFrame(this.loop);
  }

  frame(dt) {
    this.time += dt;
    if (this.input.pressed.size) this.sound.start();
    this.handleDuelKeys();
    // the stage always ticks: it keeps time for the waiting fighters and settles blood
    this.stage.step(dt);
    if (this.mode === 'explore') {
      this.update(dt);
      this.updateFoes(dt);
      this.updateCamera(dt);
    } else {
      this.stage.updateCamera(dt);
    }
    this.hud.update(dt);
    const who = this.mode === 'duel' ? this.fighter.pos : this.pos;
    this.petals.update(dt, this.time, this.camera.position);
    this.grassMat.uniforms.uTime.value = this.time;
    this.pen.setCutaway(this.started ? new THREE.Vector3(who.x, who.y + 1.1, who.z) : null);
    this.ground.material.uniforms.uTime.value = this.time;
    if (!this.skipRender) this.pen.render(this.time); // tests can step without drawing
    this.input.endFrame();
  }

  // ---------- duels on the road ----------

  // Waiting fighters turn to watch you come; close enough and the duel begins.
  updateFoes(dt) {
    for (const foe of this.foes) {
      const f = foe.f;
      if (foe.beaten) continue;
      const d = Math.hypot(this.pos.x - f.pos.x, this.pos.z - f.pos.z);
      const want = d < 28 ? Math.atan2(this.pos.x - f.pos.x, this.pos.z - f.pos.z) : foe.restYaw;
      let dy = want - f.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.yaw += dy * (1 - Math.exp(-3 * dt));
      f.updateModel(dt);
      if (this.started && d < 18 && !foe.announced) {
        foe.announced = true;
        this.placeEl.innerHTML = `<b>${f.def.name}</b><span>${f.def.title}. Walk up to him to duel.</span>`;
        this.placeEl.classList.add('show');
        clearTimeout(this.placeTimer);
        this.placeTimer = setTimeout(() => this.placeEl.classList.remove('show'), 3200);
      }
      if (d > 30) foe.announced = false;
      if (this.started && d < CHALLENGE_DIST) this.startDuel(foe);
    }
  }

  startDuel(foe) {
    this.mode = 'duel';
    this.foe = foe;
    const { spot, f } = foe;
    const p = this.fighter;
    p.reset();
    f.reset();
    // fight where you met: you stay where you stopped, he holds his ground
    p.pos.set(this.pos.x, spot.y, this.pos.z);
    const dx = p.pos.x - spot.x, dz = p.pos.z - spot.z, r = Math.hypot(dx, dz);
    if (r > ARENA_R - 1) p.pos.set(spot.x + (dx / r) * (ARENA_R - 1), spot.y, spot.z + (dz / r) * (ARENA_R - 1));
    f.pos.set(spot.x, spot.y, spot.z);
    p.yaw = Math.atan2(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
    f.yaw = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
    p.lastPos = p.pos.clone();
    f.lastPos = f.pos.clone();
    this.vel.set(0, 0, 0);
    this.fx.groundY = spot.y;
    this.placeEl.classList.remove('show');
    document.getElementById('hint').classList.add('hidden');
    this.stage.camLook.copy(this.camLook);
    this.stage.start(p, f, foe.AI, { arena: { x: spot.x, z: spot.z, r: ARENA_R, y: spot.y } });
  }

  duelResult(won) {
    const name = this.foe.f.def.name;
    // free the mouse so the buttons can be clicked
    if (document.pointerLockElement) document.exitPointerLock();
    const left = this.foes.filter((o) => !o.beaten && o !== this.foe).length;
    const html = won
      ? `<div class="card"><h2>${name} falls.</h2>
        <p class="sub">${left ? `${left} more ${left === 1 ? 'blade waits' : 'blades wait'} on the road` : 'the road to the shrine is open'}</p>
        <div class="choices row"><button data-act="walk"><b>Walk on</b><kbd>Enter</kbd></button></div></div>`
      : `<div class="card"><h2>The road ends here.</h2>
        <p class="sub">Slain by ${name}</p>
        <div class="choices row">
          <button data-act="retry"><b>Rise again</b><kbd>R</kbd></button>
          <button data-act="gate"><b>Back to the gate</b><kbd>G</kbd></button>
        </div></div>`;
    this.hud.screenHtml(html);
    this.hud.screen.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.duelAction(b.dataset.act)));
  }

  duelAction(a) {
    if (a === 'walk') {
      this.foe.beaten = true;
      this.walkOn(this.fighter.pos);
    } else if (a === 'retry') {
      this.startDuel(this.foe);
    } else if (a === 'gate') {
      this.walkOn(new THREE.Vector3(CLEARINGS.gate[0], 0, CLEARINGS.gate[1] - 3));
      this.yaw = this.camYaw = Math.PI;
    } else if (a === 'resume') {
      this.stage.setPaused(false);
    }
  }

  // back to walking, from where the duel left you
  walkOn(at) {
    const p = this.fighter;
    // the loser's foe goes back to waiting where he stood
    if (!this.foe.beaten) {
      this.foe.f.reset();
      this.foe.f.pos.set(this.foe.spot.x, this.foe.spot.y, this.foe.spot.z);
      this.foe.f.lastPos = this.foe.f.pos.clone();
    }
    this.stage.end();
    this.hud.screenHtml('');
    this.mode = 'explore';
    // step back out of his reach so the duel doesn't start again at once
    this.pos.copy(at);
    if (!this.foe.beaten) {
      const s = this.foe.spot;
      const dx = at.x - s.x, dz = at.z - s.z, r = Math.hypot(dx, dz) || 1;
      if (r < CHALLENGE_DIST + 1.5) this.pos.set(s.x + (dx / r) * (CHALLENGE_DIST + 1.5), 0, s.z + (dz / r) * (CHALLENGE_DIST + 1.5));
    }
    this.lastPos.copy(this.pos);
    this.yaw = p.yaw;
    this.camYaw = p.yaw;
    p.reset(); // wounds come later in the plan; for now you walk on whole
    p.yaw = this.yaw;
    this.model.root.rotation.set(0, this.yaw, 0);
    // ease from the duel guard back to walking with the sword sheathed
    lerpPose(this.model.cur, this.model.cur, 0, this.pose);
    this.camNow = null;
  }

  handleDuelKeys() {
    const i = this.input, m = this.stage.mode;
    if (this.mode !== 'duel') return;
    if (m === 'fight' && i.wasPressed('Escape')) {
      if (document.pointerLockElement) document.exitPointerLock();
      const controls = CONTROLS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
      this.stage.setPaused(true, `<div class="card"><h2>Paused</h2><table class="controls">${controls}</table>
        <div class="choices row"><button data-act="resume"><b>Resume</b><kbd>Esc</kbd></button>
        <button data-act="retry"><b>Restart duel</b><kbd>R</kbd></button></div></div>`);
      this.hud.screen.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.duelAction(b.dataset.act)));
    } else if (m === 'paused') {
      if (i.wasPressed('Escape')) this.stage.setPaused(false);
      else if (i.wasPressed('KeyR')) this.startDuel(this.foe);
    } else if (m === 'result') {
      if (this.stage.lastResult && i.wasPressed('Enter', 'Space')) this.duelAction('walk');
      else if (!this.stage.lastResult && i.wasPressed('KeyR')) this.duelAction('retry');
      else if (!this.stage.lastResult && i.wasPressed('KeyG')) this.duelAction('gate');
    }
  }
}

window.springMap = new SpringMap();
