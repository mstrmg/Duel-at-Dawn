// DOM overlay: vitality, breath, stances, callouts, and the title/result screens.
import { STANCE_KANJI, STANCE_NAMES, STANCES, BREATH, IAI } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.callout = $('callout');
    this.sub = $('subcallout');
    this.screen = $('screen');
    this.calloutTimer = 0;
    this.subTimer = 0;
    this.build('player-panel');
    this.build('enemy-panel');
  }

  build(id) {
    const p = $(id);
    p.innerHTML = `
      <div class="name"></div>
      <div class="pips"></div>
      <div class="breath"><div class="fill"></div></div>
      <div class="stances">${STANCES.map((i) => `<span data-s="${i}" title="${STANCE_NAMES[i]}">${STANCE_KANJI[i]}</span>`).join('')}</div>
      ${id === 'player-panel' ? '<div class="iai"><div class="fill"></div></div>' : ''}
    `;
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  setFighters(player, enemy) {
    this.player = player;
    this.enemy = enemy;
    $('player-panel').querySelector('.name').textContent = player.def.name;
    $('enemy-panel').querySelector('.name').textContent = enemy.def.name;
  }

  updatePanel(id, f, isEnemy) {
    const p = $(id);
    const pips = p.querySelector('.pips');
    if (pips.childElementCount !== f.def.vitality) {
      pips.innerHTML = Array.from({ length: f.def.vitality }, () => '<i></i>').join('');
    }
    [...pips.children].forEach((c, i) => c.classList.toggle('lost', i >= f.vitality));
    const fill = p.querySelector('.breath .fill');
    fill.style.width = `${(f.breath / BREATH.max) * 100}%`;
    p.querySelector('.breath').classList.toggle('winded', f.state === 'winded');
    p.querySelector('.breath').classList.toggle('low', f.breath < 25);
    const telling = isEnemy && f.state === 'windup' && f.attack && f.attack.kind !== 'shove';
    p.querySelectorAll('.stances span').forEach((s) => {
      const i = Number(s.dataset.s);
      const cur = f.state.startsWith('iai') ? -1 : telling ? f.attack.stance : f.displayStance;
      s.classList.toggle('on', i === cur);
      s.classList.toggle('pending', f.pendingStance === i);
      s.classList.toggle('tell', telling && i === f.attack.stance);
      s.classList.toggle('guard', f.state === 'block' && i === f.stance && f.pendingStance === null);
    });
    const iai = p.querySelector('.iai');
    if (iai) {
      const charging = f.state === 'iaiCharge' || f.state === 'iaiSheathe';
      iai.classList.toggle('visible', charging);
      iai.classList.toggle('full', f.iaiCharge >= IAI.fullCharge);
      iai.querySelector('.fill').style.width = `${f.iaiCharge * 100}%`;
    }
  }

  setInReach(mine, his) {
    document.getElementById('player-panel').classList.toggle('in-reach', mine);
    document.getElementById('enemy-panel').classList.toggle('in-reach', his);
  }

  say(text, kind = '', time = 0.9) {
    this.callout.textContent = text;
    this.callout.className = 'show ' + kind;
    this.calloutTimer = time;
  }

  hint(text, time = 1.2) {
    this.sub.textContent = text;
    this.sub.className = 'show';
    this.subTimer = time;
  }

  update(dt) {
    if (this.player) this.updatePanel('player-panel', this.player, false);
    if (this.enemy) this.updatePanel('enemy-panel', this.enemy, true);
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.callout.className = '';
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.className = '';
    }
  }

  screenHtml(html) {
    this.screen.innerHTML = html;
    this.screen.classList.toggle('hidden', !html);
  }
}
