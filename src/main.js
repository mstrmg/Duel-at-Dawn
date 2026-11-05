// Duel at Dawn: combat prototype. Wires the scene, fighters, camera, effects and game flow.
import * as THREE from 'three';
import { PLAYER_DEF, RONIN_DEF, SPEARMAN_DEF } from './config.js';
import { buildEnvironment, PenRenderer } from './ink.js';
import { Fighter } from './fighter.js';
import { RoninAI, SpearmanAI } from './ai.js';
import { CONTROLS } from './player.js';
import { DuelStage } from './duel.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Effects } from './fx.js';
import { Hud } from './hud.js';

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
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.pen.setSize(innerWidth, innerHeight);
    });

    buildEnvironment(this.scene);
    this.pen = new PenRenderer(this.renderer, this.scene, this.camera);
    this.fx = new Effects(this.scene);
    this.sound = new Sound();
    this.hud = new Hud();
    this.input = new Input(canvas);
    this.stage = new DuelStage({
      scene: this.scene, camera: this.camera, sound: this.sound, hud: this.hud, fx: this.fx, input: this.input,
      host: { onResult: (won) => this.showResult(won) },
    });

    this.player = new Fighter(PLAYER_DEF, 'player', this.stage);
    this.scene.add(this.player.model.root);

    this.enemies = {};
    for (const [id, d] of Object.entries(DUELS)) {
      const f = new Fighter(d.def, d.look, this.stage);
      f.model.root.visible = false;
      this.scene.add(f.model.root);
      this.enemies[id] = f;
    }

    this.mode = 'title'; // title | duel
    this.duelId = null;
    this.showTitle();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- flow ----------

  showTitle() {
    this.mode = 'title';
    this.stage.end();
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
        <p class="rules">Two stances, High and Low. Your guard covers the line of your stance, so a strike into his open line comes out faster.
        Guard only holds in the line the blow comes from. Watch his blade drift into a new line, then the <em>red glint</em>: that is his tell.
        The dashed arc on the ground is your reach.</p>
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
    p.pos.set(0, 0, 4.5);
    e.pos.set(0, 0, -4.5);
    p.yaw = Math.PI;
    e.yaw = 0;
    e.model.root.visible = true;
    this.enemy = e;
    this.mode = 'duel';
    this.stage.start(p, e, d.AI);
    // start the camera wide and to the side
    this.camera.position.set(9, 2.2, 1);
    this.stage.camLook.set(0, 1.2, 0);
  }

  setPaused(on) {
    if (on && this.stage.mode === 'fight') {
      const controls = CONTROLS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
      const html = `<div class="card"><h2>Paused</h2><table class="controls">${controls}</table>
        <div class="choices row"><button data-action="resume"><b>Resume</b><kbd>Esc</kbd></button>
        <button data-action="retry"><b>Restart duel</b><kbd>R</kbd></button>
        <button data-action="title"><b>Choose opponent</b><kbd>T</kbd></button></div></div>`;
      this.stage.setPaused(true, html);
      this.bindScreenButtons();
    } else if (!on) this.stage.setPaused(false);
  }

  showResult(won) {
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
    this.stage.step(realDt);
    if (this.mode === 'title') this.player.update(realDt);
    this.hud.update(realDt);
    this.updateCamera(realDt);
    this.pen.render(performance.now() / 1000);
    i.endFrame();
  }

  handleMenuKeys() {
    const i = this.input;
    if (this.mode === 'title') {
      if (i.wasPressed('Digit1')) this.startDuel('ronin');
      else if (i.wasPressed('Digit2')) this.startDuel('spearman');
      return;
    }
    const m = this.stage.mode;
    if (m === 'fight' || m === 'paused') {
      if (i.wasPressed('Escape')) this.setPaused(m === 'fight');
      else if (m === 'paused' && i.wasPressed('KeyR')) this.startDuel(this.duelId);
      else if (m === 'paused' && i.wasPressed('KeyT')) this.showTitle();
    } else if (m === 'result') {
      if (i.wasPressed('KeyR')) this.startDuel(this.duelId);
      else if (i.wasPressed('KeyT', 'Escape')) this.showTitle();
      else if (i.wasPressed('Enter') && this.stage.lastResult && DUELS[this.duelId].next) this.startDuel(DUELS[this.duelId].next);
    }
  }

  updateCamera(dt) {
    if (this.mode !== 'title') return this.stage.updateCamera(dt);
    const cam = this.camera;
    const a = performance.now() * 0.00005;
    const k = 1 - Math.exp(-1.5 * dt);
    cam.position.lerp(tmp.set(Math.sin(a) * 7, 2.4, 3 + Math.cos(a) * 7), k);
    this.stage.camLook.lerp(tmp2.set(0, 1.5, -6), k);
    cam.lookAt(this.stage.camLook);
    this.stage.applyShake(dt);
  }
}

window.game = new Game();
