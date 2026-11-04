// Duel at Dawn: combat prototype. Wires the scene, fighters, camera, effects and game flow.
import * as THREE from 'three';
import { PLAYER_DEF, RONIN_DEF, SPEARMAN_DEF, STANCE_NAMES } from './config.js';
import { buildEnvironment } from './ink.js';
import { Fighter } from './fighter.js';
import { Combat } from './combat.js';
import { RoninAI, SpearmanAI } from './ai.js';
import { PlayerController, CONTROLS } from './player.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Effects } from './fx.js';
import { Hud } from './hud.js';

class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { (this.map.get(name) || this.map.set(name, []).get(name)).push(fn); }
  emit(name, ...args) { for (const fn of this.map.get(name) || []) fn(...args); }
}

const DUELS = {
  ronin: { def: RONIN_DEF, look: 'ronin', AI: RoninAI, next: 'spearman' },
  spearman: { def: SPEARMAN_DEF, look: 'spearman', AI: SpearmanAI, next: null },
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
    this.camera.position.set(6, 3, 10);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    buildEnvironment(this.scene);
    this.events = new Events();
    this.combat = new Combat(this);
    this.fx = new Effects(this.scene);
    this.sound = new Sound();
    this.hud = new Hud();
    this.input = new Input(canvas);

    this.player = new Fighter(PLAYER_DEF, 'player', this);
    this.scene.add(this.player.model.root);
    this.controller = new PlayerController(this.player, this.input);

    this.enemies = {};
    for (const [id, d] of Object.entries(DUELS)) {
      const f = new Fighter(d.def, d.look, this);
      f.model.root.visible = false;
      this.scene.add(f.model.root);
      this.enemies[id] = f;
    }

    this.time = 0;
    this.slow = { scale: 1, t: 0, dur: 0 };
    this.stop = 0;
    this.shake = 0;
    this.mode = 'title';
    this.modeT = 0;
    this.duelId = null;
    this.hintsShown = new Set();

    this.wireEvents();
    this.showTitle();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- flow ----------

  showTitle() {
    this.mode = 'title';
    this.hud.show(false);
    for (const e of Object.values(this.enemies)) e.model.root.visible = false;
    this.player.model.root.visible = true;
    this.player.reset();
    this.player.pos.set(0, 0, 3);
    this.player.yaw = Math.PI;
    const controls = CONTROLS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    this.hud.screenHtml(`
      <div class="card title">
        <h1>Duel at Dawn</h1>
        <p class="sub">combat prototype</p>
        <div class="choices">
          <button data-duel="ronin"><b>The Ronin</b><span>fast, reads your stance, strikes in pairs</span><kbd>1</kbd></button>
          <button data-duel="spearman"><b>The Spearman</b><span>long reach, keeps you at bay</span><kbd>2</kbd></button>
        </div>
        <table class="controls">${controls}</table>
        <p class="rules">High beats Low, Low beats Mid, Mid beats High: striking from the stance that beats his comes out faster.
        Guard only holds in the line the blow comes from. Watch for the <em>red glint</em>: that is his tell.</p>
      </div>`);
    this.bindScreenButtons();
  }

  bindScreenButtons() {
    this.hud.screen.querySelectorAll('[data-duel]').forEach((b) =>
      b.addEventListener('click', () => { this.sound.start(); this.startDuel(b.dataset.duel); }));
    this.hud.screen.querySelectorAll('[data-action]').forEach((b) =>
      b.addEventListener('click', () => { this.sound.start(); this.screenAction(b.dataset.action); }));
  }

  screenAction(a) {
    if (a === 'title') this.showTitle();
    else if (a === 'retry') this.startDuel(this.duelId);
    else if (a === 'next') this.startDuel(DUELS[this.duelId].next);
    else if (a === 'resume') this.setPaused(false);
  }

  startDuel(id) {
    this.duelId = id;
    const d = DUELS[id];
    for (const e of Object.values(this.enemies)) e.model.root.visible = false;
    this.fx.clear();
    const p = this.player;
    const e = this.enemies[id];
    p.reset();
    e.reset();
    p.opponent = e;
    e.opponent = p;
    p.pos.set(0, 0, 4.5);
    e.pos.set(0, 0, -4.5);
    p.yaw = Math.PI;
    e.yaw = 0;
    e.model.root.visible = true;
    this.enemy = e;
    this.ai = new d.AI(e, p, this);
    this.hud.setFighters(p, e);
    this.hud.screenHtml('');
    this.hud.show(true);
    this.mode = 'intro';
    this.modeT = 0;
    this.hud.say(d.def.name, 'intro', 2.0);
    this.hud.hint(d.def.title, 2.0);
    // start the camera wide and to the side
    this.camera.position.set(9, 2.2, 1);
    this.camLook.set(0, 1.2, 0);
  }

  beginFight() {
    this.mode = 'fight';
    this.modeT = 0;
    this.hud.say('Draw', 'intro', 0.7);
    if (!this.hintsShown.has('first')) {
      this.hintsShown.add('first');
      setTimeout(() => this.mode === 'fight' && this.hud.hint('Match his stance and hold guard to block. Raise it as the glint flares to parry.', 4), 900);
    }
  }

  setPaused(on) {
    if (on && this.mode === 'fight') {
      this.mode = 'paused';
      const controls = CONTROLS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
      this.hud.screenHtml(`<div class="card"><h2>Paused</h2><table class="controls">${controls}</table>
        <div class="choices row"><button data-action="resume"><b>Resume</b><kbd>Esc</kbd></button>
        <button data-action="retry"><b>Restart duel</b><kbd>R</kbd></button>
        <button data-action="title"><b>Choose opponent</b><kbd>T</kbd></button></div></div>`);
      this.bindScreenButtons();
    } else if (!on && this.mode === 'paused') {
      this.mode = 'fight';
      this.hud.screenHtml('');
    }
  }

  onKill(victim, killer) {
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

  showResult() {
    this.mode = 'result';
    const won = this.lastResult;
    const d = DUELS[this.duelId];
    let html;
    if (won) {
      const next = d.next ? DUELS[d.next].def.name : null;
      html = `<div class="card"><h2>${d.def.name} falls.</h2>
        <p class="sub">${this.player.vitality} of ${this.player.def.vitality} vitality left</p>
        <div class="choices row">
          ${next ? `<button data-action="next"><b>Walk on: ${next}</b><kbd>Enter</kbd></button>` : '<p class="sub">The road goes on. (End of the prototype.)</p>'}
          <button data-action="retry"><b>Duel again</b><kbd>R</kbd></button>
          <button data-action="title"><b>Choose opponent</b><kbd>T</kbd></button>
        </div></div>`;
    } else {
      html = `<div class="card"><h2>The road ends here.</h2>
        <p class="sub">Slain by ${d.def.name}</p>
        <div class="choices row">
          <button data-action="retry"><b>Rise again</b><kbd>R</kbd></button>
          <button data-action="title"><b>Choose opponent</b><kbd>T</kbd></button>
        </div></div>`;
    }
    this.hud.screenHtml(html);
    this.bindScreenButtons();
  }

  // ---------- feel ----------

  slowmo(scale, dur) {
    if (this.slow.t > 0 && this.slow.scale < scale) return;
    this.slow = { scale, t: dur, dur };
  }

  hitstop(d) { this.stop = Math.max(this.stop, d); }

  wireEvents() {
    const ev = this.events, fx = this.fx, snd = this.sound, hud = this.hud;
    const isP = (f) => f === this.player;
    const contact = (a, b) => tmp.addVectors(a.pos, b.pos).multiplyScalar(0.5).setY(1.3).clone();

    ev.on('windup', (f) => {
      if (!isP(f) && f.attack.kind !== 'shove') snd.tell();
    });
    ev.on('parry', (def, att) => {
      snd.ring(1.4, 1.3);
      fx.spark(contact(def, att), 14);
      this.hitstop(0.07);
      this.slowmo(0.3, 0.45);
      this.shake = Math.max(this.shake, 0.12);
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
      fx.blood(tmp.copy(def.pos).setY(1.25), tmp2, info.killed ? 70 : 24);
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
        if (info.wrongGuard) hud.hint(`Wrong guard: that was a ${STANCE_NAMES[att.attack?.stance ?? 1] ?? ''} strike.`.replace(' a  ', ' a '), 1.8);
      } else {
        hud.say(info.exposed ? 'Counter' : 'Cut', 'good');
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
    ev.on('sheathe', (f) => isP(f) && snd.sheathe());
    ev.on('iai', (f) => {
      snd.whoosh();
      if (f.attack?.full) snd.ring(0.5, 1.6);
    });
  }

  // ---------- loop ----------

  loop() {
    requestAnimationFrame(this.loop);
    const realDt = Math.min(0.05, this.clock.getDelta());
    this.frame(realDt);
  }

  frame(realDt) {
    const i = this.input;
    if (i.pressed.size) this.sound.start();
    this.handleMenuKeys();

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
    if (this.mode === 'paused' || this.mode === 'title' || this.mode === 'result') scale = this.mode === 'paused' ? 0 : 1;
    const dt = realDt * scale;
    this.time += dt;
    this.modeT += realDt;

    if (this.mode === 'intro' && this.modeT > 2.2) this.beginFight();
    if (this.mode === 'kill' && this.modeT > 2.6) this.showResult();

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
    } else if (this.mode === 'title') {
      this.player.update(realDt);
    }

    this.fx.update(dt, realDt);
    this.hud.update(realDt);
    this.updateCamera(realDt);
    this.renderer.render(this.scene, this.camera);
    i.endFrame();
  }

  handleMenuKeys() {
    const i = this.input;
    if (this.mode === 'title') {
      if (i.wasPressed('Digit1')) this.startDuel('ronin');
      else if (i.wasPressed('Digit2')) this.startDuel('spearman');
    } else if (this.mode === 'fight' || this.mode === 'paused') {
      if (i.wasPressed('Escape')) this.setPaused(this.mode === 'fight');
      else if (this.mode === 'paused' && i.wasPressed('KeyR')) this.startDuel(this.duelId);
      else if (this.mode === 'paused' && i.wasPressed('KeyT')) this.showTitle();
    } else if (this.mode === 'result') {
      if (i.wasPressed('KeyR')) this.startDuel(this.duelId);
      else if (i.wasPressed('KeyT', 'Escape')) this.showTitle();
      else if (i.wasPressed('Enter') && this.lastResult && DUELS[this.duelId].next) this.startDuel(DUELS[this.duelId].next);
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const p = this.player;
    let desired, look, rate = 6;
    if (this.mode === 'title') {
      const a = performance.now() * 0.00005;
      desired = tmp.set(Math.sin(a) * 7, 2.4, 3 + Math.cos(a) * 7);
      look = tmp2.set(0, 1.5, -6);
      rate = 1.5;
    } else {
      const e = this.enemy;
      const f = new THREE.Vector3().subVectors(e.pos, p.pos).setY(0);
      const dist = f.length() || 1;
      f.divideScalar(dist);
      const right = new THREE.Vector3(-f.z, 0, f.x);
      const back = 3.7 + Math.max(0, dist - 3) * 0.22;
      const side = this.mode === 'kill' || this.mode === 'result' ? 2.2 : 1.25;
      desired = tmp.copy(p.pos).addScaledVector(f, -back).addScaledVector(right, side).setY(2.05 + (this.mode === 'kill' ? 0.4 : 0));
      look = tmp2.copy(p.pos).addScaledVector(f, Math.min(dist * 0.6, 4)).setY(1.2);
      if (this.mode === 'intro') rate = 1.6;
    }
    const k = 1 - Math.exp(-rate * dt);
    cam.position.lerp(desired, k);
    this.camLook.lerp(look, k);
    cam.lookAt(this.camLook);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 0.9);
      const s = this.shake * 0.5;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
  }
}

window.game = new Game();
