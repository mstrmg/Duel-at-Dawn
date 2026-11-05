// The Spring map: walk the valley in the pen-and-ink renderer, from the south gate to the
// great shrine. Fighters wait on the road; walk up to one and the combat prototype's duel
// plays out right there, then you walk on. Beside the road are the stops: the inns, the
// dojos, the shrines, the hot spring and the dice player. One journey: coin from each duel,
// wounds that stay with you until you rest, and death sends a new wanderer from the gate.
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
import { buildGround, heightAt, waterAt, CLEARINGS, STOPS, DUEL_SPOTS, ARENA_R, roadCurves, MAP, GATE, SHRINE } from './terrain.js';
import { buildWorld, colliders, PINK } from './world.js';
import { buildGrass } from './grass.js';
import { DuelCutscene, squareUp } from './cutscene.js';
import { newRun, stopCard, take, COIN, START_COIN } from './stops.js';
import { RoadMap } from './map.js';
import { WOUNDS, ARTS } from '../wounds.js';
import { showGain, KINDS } from '../gain.js';

// who waits at each duel spot on the road. purse: coin he carries; elite: a harder duel
const FOES = {
  ronin: { def: { ...RONIN_DEF, purse: 25 }, look: 'ronin', AI: RoninAI },
  wanderer: {
    def: { ...RONIN_DEF, id: 'wanderer', name: 'The Wandering Ronin', title: 'he wants the lookout to himself', purse: 25 },
    look: 'wanderer', AI: RoninAI,
  },
  spearman: { def: { ...SPEARMAN_DEF, purse: 30 }, look: 'spearman', AI: SpearmanAI },
  bandit: {
    def: { ...RONIN_DEF, id: 'bandit', name: 'The Bamboo Bandit', title: 'quick of blade and short of patience', purse: 20, speed: 2.9,
      weapon: { ...RONIN_DEF.weapon, reach: 2.05, windup: 0.54, counterWindup: 0.46, recover: 0.5 } },
    look: 'bandit', AI: RoninAI,
  },
  masked: {
    def: { ...RONIN_DEF, id: 'masked', name: 'The Masked Duelist', title: 'nobody has seen his face, or his second cut', elite: true,
      purse: 40, vitality: 3, speed: 2.8, turnRate: 12,
      weapon: { ...RONIN_DEF.weapon, reach: 2.3, windup: 0.5, counterWindup: 0.42, recover: 0.48 } },
    look: 'masked', AI: RoninAI,
  },
  sohei: {
    def: { ...SPEARMAN_DEF, id: 'sohei', name: 'The Temple Guard', title: 'a warrior monk who keeps the torii road', elite: true,
      purse: 40, vitality: 3, speed: 2.4,
      weapon: { ...SPEARMAN_DEF.weapon, reach: 3.7, windup: 0.72, counterWindup: 0.64, recover: 0.72 } },
    look: 'sohei', AI: SpearmanAI,
  },
};
const CHALLENGE_DIST = 10; // walk this close and the duel begins
const WALK = 2.6;
const RUN = 5.6;
const START = [GATE.x, GATE.z - 3];
const STOP_REACH = 3.2; // stand this close to a door to go in
// the great shrine is a stop too: the end of the road, for now
const GREAT = { id: 'great', kind: 'great', name: 'Shrine of the Petal Blade', x: SHRINE.x, z: SHRINE.z, door: [SHRINE.x, SHRINE.z - SHRINE.r + 1.5] };
const STOP_LIST = [...Object.values(STOPS), GREAT];
const at = (id, r, sub) => ({ name: STOPS[id].name, sub, at: [STOPS[id].x, STOPS[id].z], r });
const PLACES = [
  { name: 'The South Gate', sub: 'where the road begins, between the tea fields', at: CLEARINGS.gate, r: 12 },
  at('inn', 11, 'rest, food, and gear for the road'),
  { name: 'The Crossroads', sub: 'the lookout to the east, a footpath west', at: [-5, 6], r: 8 },
  at('dojo', 11, 'an old master teaches one technique'),
  { name: 'The Lookout', sub: 'a great cherry above the valley', at: CLEARINGS.lookout, r: 14 },
  at('shrine', 8, 'a blessing for the road'),
  { name: 'The Red Bridge', sub: 'snowmelt running fast under the cherries', at: [5, -44], r: 10 },
  at('onsen', 10, 'steam over the water, nobody about'),
  { name: 'The Bamboo Forest', sub: 'the road narrows; keep your hand on the hilt', at: [-4, -140], r: 14 },
  at('gambler', 7, 'odd or even, two dice in a cup'),
  at('teahouse', 11, 'tea, a bed, and charms for travelers'),
  { name: 'The Climb', sub: 'pines, stone, and the road turning on itself', at: [-14, -262], r: 14 },
  at('dojo2', 11, 'a stricter master, higher up'),
  at('fox', 8, 'two stone foxes keep watch'),
  { name: 'The Thousand Torii', sub: 'red gates all the way to the shrine', at: [2, -372], r: 9 },
  { name: 'Shrine of the Petal Blade', sub: 'the end of the spring road', at: CLEARINGS.shrine, r: 18 },
];
const VERB = { inn: 'go into', teahouse: 'sit down at', dojo: 'step into', shrine: 'pray at', onsen: 'soak at', gambler: 'sit with', great: 'stand before' };

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
      // a gust (the cutscene's last shot) whips them sideways and up
      const g = this.gust || 0;
      p.x += (0.9 + Math.sin(t * 0.4 + p.ph) * 0.6 + g * 7) * dt;
      p.y += g * (0.6 + Math.sin(p.ph * 3) * 0.6) * dt;
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
    this.water = buildWorld(this.scene);
    this.grass = buildGrass(this.scene);
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
    this.mode = 'explore'; // explore | cutscene | duel | stop

    // the run: coin, vitality between duels, and the wanderer's own copy of his stats,
    // which the inn, the dojo and the shrine change
    this.run = newRun(PLAYER_DEF);
    this.runEl = document.getElementById('run');
    this.promptEl = document.getElementById('prompt');
    this.stops = STOPS;
    this.near = null;
    this.roadMap = new RoadMap(STOP_LIST);

    // the wanderer: walking, the sword sheathed and a hand on the hilt; in a duel, the
    // same figure is driven by the combat fighter
    this.fighter = new Fighter(this.run.def, 'player', this.stage);
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
    this.pos = new THREE.Vector3(START[0], 0, START[1]);
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
      this.runEl.classList.remove('hidden');
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
    if (this.started && this.mode === 'explore') {
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
      want.set(fx * iz + fz * ix, 0, fz * iz - fx * ix).normalize().multiplyScalar((running ? RUN : WALK) * this.run.speed);
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
        else if (f.stones && waterAt(this.pos.x, this.pos.z) > 0.15) y = Math.max(y, f.level + 0.3);
      }
    }
    this.pos.y += (y - this.pos.y) * (1 - Math.exp(-20 * dt));

    // the body: lean into a run, then feet that step with the real ground speed
    const runT = THREE.MathUtils.clamp((speed / this.run.speed - WALK) / (RUN - WALK), 0, 1);
    const target = lerpPose(this.walkPose, this.runPose, runT, {});
    lerpPose(this.pose, target, 1 - Math.exp(-8 * dt), this.pose);
    const m = this.model;
    m.apply(this.pose, Infinity, dt);
    m.setWounds(this.run.wounds); // your wounds show on you as you walk
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
    // the valley walls: you can climb partway, not out of the map
    p.x = THREE.MathUtils.clamp(p.x, MAP.x0 + 20, MAP.x1 - 20);
    p.z = THREE.MathUtils.clamp(p.z, MAP.z0 + 16, MAP.z1 - 8);
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
      if (this.started && this.input.wasPressed('KeyM')) this.roadMap.toggle();
      else if (this.roadMap.open && this.input.wasPressed('Escape')) this.roadMap.toggle(false);
      this.update(dt);
      this.updateFoes(dt);
      this.updateStops();
      this.updateCamera(dt);
    } else if (this.mode === 'stop') {
      this.update(dt);
      this.updateCamera(dt);
      this.handleStopKeys();
    } else if (this.mode === 'cutscene') {
      if (this.input.wasPressed('Space', 'Enter', 'Escape', 'Mouse0')) this.cut.skip();
      if (this.cut.update(dt)) this.startDuel(this.foe, true);
    } else {
      this.stage.updateCamera(dt);
    }
    this.hud.update(dt);
    this.updateRunPanel();
    // the cutaway keeps the subject in view: the shot's focus in a cutscene, else the wanderer
    let cut = null;
    if (this.mode === 'cutscene') cut = this.cutFocus;
    else if (this.started && this.mode !== 'stop') {
      const w = this.mode === 'duel' ? this.fighter.pos : this.pos;
      cut = new THREE.Vector3(w.x, w.y + 1.1, w.z);
    }
    this.petals.update(dt, this.time, this.camera.position);
    this.grass.mat.uniforms.uTime.value = this.time;
    this.grass.update(this.camera.position);
    this.water.update(dt, this.time);
    if (this.roadMap.open) this.roadMap.draw({ x: this.pos.x, z: this.pos.z, yaw: this.yaw },
      this.foes.map((o) => ({ x: o.spot.x, z: o.spot.z, beaten: o.beaten, elite: o.f.def.elite })));
    this.pen.setCutaway(cut);
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
        this.placeEl.innerHTML = `<b>${f.def.name}</b><span>${f.def.elite ? 'a hard duel: ' : ''}${f.def.title}. Walk up to him to duel.</span>`;
        this.placeEl.classList.add('show');
        clearTimeout(this.placeTimer);
        this.placeTimer = setTimeout(() => this.placeEl.classList.remove('show'), 3200);
      }
      if (d > 30) foe.announced = false;
      if (this.started && d < CHALLENGE_DIST) this.challenge(foe);
    }
  }

  // He has seen you: the cutscene plays, then the duel.
  challenge(foe) {
    this.mode = 'cutscene';
    this.foe = foe;
    this.vel.set(0, 0, 0);
    this.fighter.reset();
    this.fighter.wounds = this.run.wounds.slice(); // wounds come with you into the duel
    this.fighter.vitality = this.run.vit;
    foe.f.reset();
    this.near = null;
    this.roadMap.toggle(false);
    this.promptEl.classList.remove('show');
    this.placeEl.classList.remove('show');
    document.getElementById('hint').classList.add('hidden');
    this.fx.groundY = foe.spot.y;
    this.cut = new DuelCutscene(this, foe);
  }

  // placed: the cutscene has already squared the two up
  startDuel(foe, placed = false) {
    this.mode = 'duel';
    this.foe = foe;
    const { spot, f } = foe;
    const p = this.fighter;
    if (!placed) {
      // rising again: square up fresh, as you were when the duel began
      p.reset();
      p.wounds = this.run.wounds.slice();
      p.vitality = this.run.vit;
      f.reset();
      squareUp(this, foe);
    }
    this.fx.groundY = spot.y;
    this.stage.start(p, f, foe.AI, { arena: { x: spot.x, z: spot.z, r: ARENA_R, y: spot.y }, intro: placed ? 0.6 : 1.6, announce: !placed });
    this.stage.updateCamera(10); // cut straight to the shoulder shot
  }

  duelResult(won) {
    const name = this.foe.f.def.name;
    // free the mouse so the buttons can be clicked
    if (document.pointerLockElement) document.exitPointerLock();
    const left = this.foes.filter((o) => !o.beaten && o !== this.foe).length;
    const purse = (this.foe.f.def.purse ?? 25) + this.run.purseBonus;
    let paid = false;
    if (won && !this.foe.paid) {
      // his purse, and whatever wounds you took stay with you
      this.foe.paid = paid = true;
      this.run.coin += purse;
      this.run.won++;
    } else if (!won) {
      // rising again is practice: beat him after that and his purse is not yours
      this.foe.paid = true;
    }
    // whatever wounds you took stay with you
    const fresh = won ? this.fighter.wounds.filter((w) => !this.run.wounds.includes(w)) : [];
    if (won) this.run.wounds = this.fighter.wounds.slice(0, this.run.def.vitality - 1);
    const html = won
      ? `<div class="card"><h2>${name} falls.</h2>
        <p class="sub">${left ? `${left} more ${left === 1 ? 'blade waits' : 'blades wait'} on the road` : 'the road to the shrine is open'}</p>
        <p class="purse">${paid ? `+${purse} ${COIN} from his purse` : 'no purse: you fell to him once already'}</p>
        ${fresh.length ? `<p class="say">He cut you: ${fresh.map((w) => `${WOUNDS[w].name.toLowerCase()}, ${WOUNDS[w].text}`).join('; ')}. Wounds stay until they are mended.</p>` : ''}
        <div class="choices row"><button data-act="walk"><b>Walk on</b><kbd>Enter</kbd></button></div></div>`
      : `<div class="card"><h2>The road ends here.</h2>
        <p class="sub">Slain by ${name}</p>
        <p class="say">The journey is over. Another wanderer sets out from the south gate, with nothing but a sword and ${START_COIN} ${COIN}.</p>
        <div class="choices row">
          <button data-act="newrun"><b>Begin a new journey</b><kbd>Enter</kbd></button>
          <button data-act="retry"><b>Rise again</b><span>practice: fight him again as you were</span><kbd>R</kbd></button>
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
    } else if (a === 'newrun') {
      this.newJourney();
    } else if (a === 'resume') {
      this.stage.setPaused(false);
    }
  }

  // Death ends the journey: a new wanderer, a new purse, and every fighter back on the road.
  newJourney() {
    this.run = newRun(PLAYER_DEF);
    this.fighter.def = this.run.def;
    for (const o of this.foes) {
      o.beaten = false;
      o.paid = false;
      o.announced = false;
      o.f.reset();
      o.f.pos.set(o.spot.x, o.spot.y, o.spot.z);
      o.f.lastPos = o.f.pos.clone();
      o.f.yaw = o.restYaw;
    }
    this.foe = null;
    this.walkOn(new THREE.Vector3(START[0], 0, START[1]));
    this.yaw = this.camYaw = Math.PI;
    this.fighter.yaw = this.yaw;
    this.model.root.rotation.set(0, this.yaw, 0);
    this.runKey = null;
    this.placeEl.innerHTML = '<b>A new journey</b><span>the south gate, at dawn</span>';
    this.placeEl.classList.add('show');
    clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.placeEl.classList.remove('show'), 3200);
  }

  // back to walking, from where the duel left you
  walkOn(at) {
    const p = this.fighter;
    // the loser's foe goes back to waiting where he stood
    if (this.foe && !this.foe.beaten) {
      this.foe.f.reset();
      this.foe.f.pos.set(this.foe.spot.x, this.foe.spot.y, this.foe.spot.z);
      this.foe.f.lastPos = this.foe.f.pos.clone();
    }
    this.stage.end();
    this.hud.screenHtml('');
    this.mode = 'explore';
    // step back out of his reach so the duel doesn't start again at once
    this.pos.copy(at);
    if (this.foe && !this.foe.beaten) {
      const s = this.foe.spot;
      const dx = at.x - s.x, dz = at.z - s.z, r = Math.hypot(dx, dz) || 1;
      if (r < CHALLENGE_DIST + 1.5) this.pos.set(s.x + (dx / r) * (CHALLENGE_DIST + 1.5), 0, s.z + (dz / r) * (CHALLENGE_DIST + 1.5));
    }
    this.lastPos.copy(this.pos);
    this.yaw = p.yaw;
    this.camYaw = p.yaw;
    p.reset();
    p.wounds = this.run.wounds.slice();
    p.vitality = this.run.vit;
    p.yaw = this.yaw;
    this.model.root.rotation.set(0, this.yaw, 0);
    // ease from the duel guard back to walking with the sword sheathed
    lerpPose(this.model.cur, this.model.cur, 0, this.pose);
    this.camNow = null;
  }

  // ---------- stops beside the road ----------

  // Near a stop's door: a prompt, and E goes in.
  updateStops() {
    let near = null;
    if (this.started) {
      for (const s of STOP_LIST) if (Math.hypot(this.pos.x - s.door[0], this.pos.z - s.door[1]) < STOP_REACH) near = s;
    }
    if (near !== this.near) {
      this.near = near;
      if (near) this.promptEl.innerHTML = `<kbd>E</kbd> ${VERB[near.kind]} ${near.kind === 'great' ? 'the great shrine' : near.name}`;
      this.promptEl.classList.toggle('show', !!near);
    }
    if (near && this.input.wasPressed('KeyE', 'Enter')) this.enterStop(near);
  }

  enterStop(stop) {
    this.mode = 'stop';
    this.roadMap.toggle(false);
    this.stop = stop;
    this.vel.set(0, 0, 0);
    this.promptEl.classList.remove('show');
    this.placeEl.classList.remove('show');
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound.whoosh();
    this.showStop();
  }

  showStop(note = null) {
    this.hud.screenHtml(stopCard(this.stop, this.run, note));
    this.hud.screen.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => this.pick(Number(b.dataset.pick))));
    this.hud.screen.querySelector('[data-act="leave"]').addEventListener('click', () => this.leaveStop());
    this.hud.screen.querySelector('[data-act="newrun"]')?.addEventListener('click', () => { this.hud.screenHtml(''); this.newJourney(); });
  }

  pick(i) {
    const arts = this.run.def.arts.slice(), wounds = this.run.wounds.slice();
    const note = take(this.stop, this.run, i);
    if (!note) return;
    // stamp a seal for whatever was gained or mended
    for (const id of this.run.def.arts) if (!arts.includes(id)) showGain(ARTS[id].kind, ARTS[id].name, ARTS[id].text);
    for (const w of wounds) if (!this.run.wounds.includes(w)) showGain('mended', WOUNDS[w].name);
    this.sound.ring(0.35, this.stop.kind === 'shrine' ? 1.6 : 1.2);
    this.showStop(note);
  }

  leaveStop() {
    this.mode = 'explore';
    this.hud.screenHtml('');
    this.near = null; // show the prompt again while you stand at the door
  }

  handleStopKeys() {
    const i = this.input;
    for (let k = 0; k < 4; k++) if (i.wasPressed(`Digit${k + 1}`)) this.pick(k);
    if (this.stop.kind === 'great' && i.wasPressed('KeyN')) { this.hud.screenHtml(''); this.newJourney(); return; }
    // E goes in, so a second E (or Esc) comes back out
    if (i.wasPressed('Escape', 'KeyE', 'Backspace')) this.leaveStop();
  }

  updateRunPanel() {
    const show = this.started && (this.mode === 'explore' || this.mode === 'stop');
    this.runEl.classList.toggle('hidden', !show);
    if (!show) return;
    const r = this.run;
    const spent = r.def.petalSpent ? 'Blessing of the Petal' : null;
    const marks = [...r.techniques, ...r.blessings, ...r.charms];
    const key = `${r.coin}|${r.wounds.join()}|${r.def.vitality}|${r.def.arts.join()}|${spent}`;
    if (key === this.runKey) return;
    this.runKey = key;
    const pips = Array.from({ length: r.def.vitality }, (_, i) => `<i class="${i < r.vit ? '' : 'lost'}"></i>`).join('');
    const wounds = r.wounds.map((w) => `<em class="wound" title="${WOUNDS[w].text}">${WOUNDS[w].name}</em>`);
    const arts = r.def.arts.map((id) => `<em class="${ARTS[id].name === spent ? 'spent' : ''}" style="--c:${KINDS[ARTS[id].kind].color}" title="${ARTS[id].text}">${ARTS[id].name}</em>`);
    this.runEl.innerHTML = `<span class="pips">${pips}</span><b>${r.coin} ${COIN}</b>${wounds.join('')}${arts.join('')}`;
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
      else if (!this.stage.lastResult && i.wasPressed('Enter', 'KeyN')) this.duelAction('newrun');
    }
  }
}

window.springMap = new SpringMap();
