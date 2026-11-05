// One duel, wherever it happens: the combat prototype's clearing or a spot on the Spring
// road. The stage owns the event bus, strike resolution, enemy AI, hit-stop and slow-mo,
// reach arcs, effects and callouts, and the over-the-shoulder duel camera. Its host
// decides what happens around a duel (title screens, results, walking on).
//
// Fighters, the AI and Combat take the stage as their `game`: they read events, time,
// combat, ai and (optionally) arena from it.
import * as THREE from 'three';
import { STANCE_NAMES } from './config.js';
import { noEdges } from './ink.js';
import { Combat } from './combat.js';
import { PlayerController } from './player.js';

export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { (this.map.get(name) || this.map.set(name, []).get(name)).push(fn); }
  emit(name, ...args) { for (const fn of this.map.get(name) || []) fn(...args); }
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class DuelStage {
  // host: { onResult(won) } called once the killing blow has played out
  constructor({ scene, camera, sound, hud, fx, input, host }) {
    Object.assign(this, { scene, camera, sound, hud, fx, input, host });
    this.events = new Events();
    this.combat = new Combat(this);
    this.time = 0;
    this.slow = { scale: 1, t: 0, dur: 0 };
    this.stop = 0;
    this.shake = 0;
    this.mode = 'idle'; // idle | intro | fight | kill | result | paused
    this.modeT = 0;
    this.hintsShown = new Set();
    this.arena = null; // { x, z, r }: where fighters are kept; null = the clearing at the origin
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.player = null;
    this.enemy = null;
    this.ai = null;
    this.controller = null;
    this.wireEvents();
  }

  get active() { return this.mode !== 'idle'; }

  // Set up a duel between two fighters already placed in the world.
  // intro: seconds before "Draw"; announce: call out his name (off when a cutscene did)
  start(player, enemy, AI, { arena = null, intro = 2.2, announce = true } = {}) {
    this.introTime = intro;
    this.arena = arena;
    this.player = player;
    this.enemy = enemy;
    player.opponent = enemy;
    enemy.opponent = player;
    this.ai = new AI(enemy, player, this);
    if (!this.controller || this.controller.f !== player) this.controller = new PlayerController(player, this.input);
    this.controller.wanted = null;
    this.setReachArcs(player, enemy);
    this.hud.setFighters(player, enemy);
    this.hud.screenHtml('');
    this.hud.show(true);
    this.mode = 'intro';
    this.modeT = 0;
    this.slow = { scale: 1, t: 0, dur: 0 };
    this.stop = 0;
    if (announce) {
      this.hud.say(enemy.def.name, 'intro', 2.0);
      this.hud.hint(enemy.def.title, 2.0);
    }
  }

  // Leave duel mode entirely (back to a title screen or to walking).
  end() {
    this.mode = 'idle';
    this.hud.show(false);
    for (const a of [this.playerArc, this.enemyArc]) if (a) a.visible = false;
    if (this.player) this.player.opponent = null;
    if (this.enemy) this.enemy.opponent = null;
    this.ai = null;
  }

  beginFight() {
    this.mode = 'fight';
    this.modeT = 0;
    this.hud.say('Draw', 'intro', 0.7);
    if (!this.hintsShown.has('first')) {
      this.hintsShown.add('first');
      setTimeout(() => this.mode === 'fight' && this.hud.hint('Q raises your guard high, E drops it low. Match his line and hold guard to block; raise it as the glint flares to parry.', 4.5), 900);
    } else if (!this.hintsShown.has('moves')) {
      this.hintsShown.add('moves');
      setTimeout(() => this.mode === 'fight' && this.hud.hint('Strike while moving: W lunges in with a thrust, S cuts as you back off, A or D sweeps wide and catches a sidestep.', 4.5), 900);
    }
  }

  // The host draws the pause menu; the stage only freezes and unfreezes time.
  setPaused(on, menuHtml = '') {
    if (on && this.mode === 'fight') {
      this.mode = 'paused';
      this.hud.screenHtml(menuHtml);
      return true;
    }
    if (!on && this.mode === 'paused') {
      this.mode = 'fight';
      this.hud.screenHtml('');
    }
    return false;
  }

  showResultScreen() {
    this.mode = 'result';
    this.host.onResult(this.lastResult);
  }

  // ---------- reach arcs ----------

  // Dashed arcs on the ground at each weapon's reach: footwork is a fight over range.
  makeArc(radius, width, opacity) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x161514, transparent: true, opacity, depthWrite: false });
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = -1.0 + (2.0 * i) / (n - 1);
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.085, width), mat);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = a;
      dash.position.set(Math.sin(a) * radius, 0.02, Math.cos(a) * radius);
      g.add(dash);
    }
    g.userData.mat = mat;
    noEdges.add(g);
    this.scene.add(g);
    return g;
  }

  setReachArcs(p, e) {
    for (const a of [this.playerArc, this.enemyArc]) if (a) { this.scene.remove(a); noEdges.delete(a); }
    this.playerArc = this.makeArc(p.weapon.reach, 0.045, 0.5);
    this.enemyArc = this.makeArc(e.weapon.reach, 0.03, 0.25);
  }

  updateArcs() {
    const p = this.player, e = this.enemy;
    if (!this.playerArc || !e || !this.active) return;
    const fighting = this.mode === 'fight';
    for (const [arc, f, o] of [[this.playerArc, p, e], [this.enemyArc, e, p]]) {
      arc.visible = fighting && f.alive;
      arc.position.copy(f.pos);
      arc.rotation.y = f.yaw;
      const inReach = f.distTo(o) <= f.weapon.reach + o.def.radius * 0.5;
      arc.userData.mat.opacity = f === p ? (inReach ? 0.85 : 0.35) : (inReach ? 0.55 : 0.18);
    }
    this.hud.setInReach(p.distTo(e) <= p.weapon.reach + e.def.radius * 0.5, e.distTo(p) <= e.weapon.reach + p.def.radius * 0.5);
  }

  // ---------- feel ----------

  slowmo(scale, dur) {
    if (this.slow.t > 0 && this.slow.scale < scale) return;
    this.slow = { scale, t: dur, dur };
  }

  hitstop(d) { this.stop = Math.max(this.stop, d); }

  onKill(victim) {
    this.mode = 'kill';
    this.modeT = 0;
    this.slowmo(0.12, 1.7);
    this.fx.slash();
    this.sound.drum();
    this.shake = 0.35;
    const won = victim !== this.player;
    this.hud.say(won ? 'Victory' : 'Fallen', won ? 'kill' : 'kill bad', 2.5);
    this.lastResult = won;
  }

  wireEvents() {
    const ev = this.events, fx = this.fx, snd = this.sound, hud = this.hud;
    const isP = (f) => f === this.player;
    const contact = (a, b) => tmp.addVectors(a.pos, b.pos).multiplyScalar(0.5).setY(a.pos.y + 1.3).clone();

    ev.on('windup', (f) => {
      if (!isP(f) && f.attack.kind !== 'shove') snd.tell();
    });
    ev.on('parry', (def, att) => {
      snd.ring(1.4, 1.3);
      snd.parry();
      const c = contact(def, att);
      fx.spark(c, 18);
      // a perfect parry freezes the moment, then lets it run on slowly
      this.hitstop(isP(def) ? 0.18 : 0.12);
      this.slowmo(0.25, 0.55);
      this.shake = Math.max(this.shake, 0.16);
      const sp = c.clone().project(this.camera);
      fx.burst((sp.x + 1) / 2 * innerWidth, (1 - sp.y) / 2 * innerHeight);
      if (isP(def)) hud.say('Parry', 'good');
      else hud.say('Parried', 'bad');
      if (isP(def) && !this.hintsShown.has('parry')) {
        this.hintsShown.add('parry');
        hud.hint('His guard is broken. Strike now for a killing counter.', 2.2);
      }
    });
    ev.on('block', (def, att) => {
      snd.ring(0.7, att.def.weapon.kind === 'yari' ? 0.8 : 1);
      fx.spark(contact(def, att), 6);
      this.hitstop(0.05);
      this.shake = Math.max(this.shake, 0.06);
      if (isP(def)) hud.say('Blocked', '', 0.5);
    });
    ev.on('guardbreak', (def, att) => {
      snd.ring(1, 0.7);
      snd.thud();
      fx.spark(contact(def, att), 10);
      this.hitstop(0.08);
      hud.say('Guard broken', isP(def) ? 'bad' : 'good');
    });
    ev.on('clash', (a, b) => {
      snd.ring(1.2, 0.9);
      fx.spark(contact(a, b), 16);
      this.hitstop(0.1);
      this.slowmo(0.35, 0.3);
      this.shake = Math.max(this.shake, 0.15);
      hud.say('Clash');
    });
    ev.on('deflect', (def, att) => {
      snd.ring(1, 1.1);
      fx.spark(contact(def, att), 8);
      this.hitstop(0.06);
      hud.say(isP(def) ? 'Your line wins' : 'Out-lined', isP(def) ? 'good' : 'bad', 0.7);
    });
    ev.on('whiff', (att) => {
      snd.whoosh();
      if (isP(att) && att.attack?.iai) hud.hint('The draw-cut missed. You are open.', 1.2);
    });
    ev.on('evade', (def) => {
      snd.whoosh();
      if (isP(def)) hud.say('Evaded', '', 0.5);
    });
    ev.on('shoved', (def) => {
      snd.thud();
      this.shake = Math.max(this.shake, 0.1);
      if (isP(def) && !this.hintsShown.has('shove')) {
        this.hintsShown.add('shove');
        hud.hint('He shoves you off with the shaft. Slip past the spearhead, then stay close.', 2.5);
      }
    });
    ev.on('hit', (def, att, info) => {
      snd.cut();
      tmp2.subVectors(def.pos, att.pos).setY(0).normalize();
      fx.blood(tmp.copy(def.pos).setY(def.pos.y + 1.25), tmp2, info.killed ? 70 : 24);
      fx.stain(def.pos.x, def.pos.z, info.killed ? 0.9 : 0.35);
      if (info.killed) {
        this.onKill(def, att);
        return;
      }
      this.hitstop(0.09);
      this.slowmo(0.4, 0.3);
      this.shake = Math.max(this.shake, 0.2);
      if (isP(def)) {
        hud.say('Wounded', 'bad');
        if (info.wrongGuard) hud.hint(`Wrong guard: that was a ${STANCE_NAMES[att.attack?.stance ?? 0]} strike.`, 1.8);
      } else {
        hud.say(info.caught ? 'Caught' : info.exposed ? 'Counter' : info.move === 'lunge' ? 'Lunge' : 'Cut', 'good');
      }
    });
    ev.on('winded', (f) => {
      snd.thud();
      if (isP(f)) {
        hud.say('Winded', 'bad');
        if (!this.hintsShown.has('winded')) {
          this.hintsShown.add('winded');
          hud.hint('Out of breath. Stand still to recover it.', 2);
        }
      } else hud.say('He is winded', 'good');
    });
    ev.on('dodge', () => snd.step());
    ev.on('meet', () => {
      if (!this.hintsShown.has('meet')) {
        this.hintsShown.add('meet');
        hud.hint('Lunging at a spear runs you onto it. Bait his thrust, slip it, then close.', 2.5);
      }
    });
    ev.on('feint', (f) => {
      snd.whoosh();
      if (!isP(f)) hud.hint('A feint.', 0.8);
    });
    ev.on('baited', () => {
      hud.say('He bit', 'good', 0.7);
      if (!this.hintsShown.has('bait')) {
        this.hintsShown.add('bait');
        hud.hint('He guarded a strike that never came. Hit him now from another line.', 2.2);
      }
    });
    ev.on('sheathe', (f) => isP(f) && snd.sheathe());
    ev.on('iai', (f) => {
      snd.whoosh();
      if (f.attack?.full) snd.ring(0.5, 1.6);
    });
  }

  // ---------- per frame ----------

  // Advances the duel. Returns the scaled dt the world should use this frame.
  step(realDt) {
    let scale = 1;
    if (this.stop > 0) {
      this.stop -= realDt;
      scale = 0.02;
    } else if (this.slow.t > 0) {
      this.slow.t -= realDt;
      const k = Math.max(0, this.slow.t / this.slow.dur);
      // ease back to full speed over the last part of the slowdown
      scale = this.slow.scale + (1 - this.slow.scale) * (1 - Math.min(1, k * 1.6));
    }
    if (this.mode === 'paused') scale = 0;
    else if (this.mode === 'result' || this.mode === 'idle') scale = 1;
    const dt = realDt * scale;
    this.time += dt;
    this.modeT += realDt;

    if (this.mode === 'intro' && this.modeT > (this.introTime ?? 2.2)) this.beginFight();
    if (this.mode === 'kill' && this.modeT > 2.6) this.showResultScreen();

    if (this.mode === 'fight' || this.mode === 'kill' || this.mode === 'result' || this.mode === 'intro') {
      if (this.mode === 'fight') {
        this.controller.update(dt);
        this.ai.update(dt);
      } else {
        this.player.moveInput.set(0, 0);
        this.enemy.moveInput.set(0, 0);
        if (this.mode !== 'intro') this.ai.update(dt);
      }
      if (dt > 0) {
        this.player.update(dt);
        this.enemy.update(dt);
      }
    }
    this.updateArcs();
    this.fx.update(dt, realDt);
    return dt;
  }

  // Behind the player's shoulder, framed on the opponent; wider for the killing blow.
  // introRate: how slowly the camera swings in as the duel begins.
  updateCamera(dt) {
    const cam = this.camera;
    const p = this.player, e = this.enemy;
    const f = new THREE.Vector3().subVectors(e.pos, p.pos).setY(0);
    const dist = f.length() || 1;
    f.divideScalar(dist);
    const right = new THREE.Vector3(-f.z, 0, f.x);
    const back = 3.7 + Math.max(0, dist - 3) * 0.22;
    const side = this.mode === 'kill' || this.mode === 'result' ? 2.2 : 1.25;
    const y = p.pos.y;
    const desired = tmp.copy(p.pos).addScaledVector(f, -back).addScaledVector(right, side).setY(y + 2.05 + (this.mode === 'kill' ? 0.4 : 0));
    const look = tmp2.copy(p.pos).addScaledVector(f, Math.min(dist * 0.6, 4)).setY(y + 1.2);
    const rate = this.mode === 'intro' ? 1.6 : 6;
    const k = 1 - Math.exp(-rate * dt);
    cam.position.lerp(desired, k);
    this.camLook.lerp(look, k);
    cam.lookAt(this.camLook);
    this.applyShake(dt);
  }

  applyShake(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.9);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }
}
