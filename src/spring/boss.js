// The Petal Blade, the Spring boss: the Blossom Thief. He took the valley's color, and the
// duel is a tug of war over it. How much he holds is his bloom (0..1); what he does not
// hold is in the great shrine's cherries, so the trees show the fight at a glance.
//
// - While he is in bloom (BLOOM.veil or more), petals take your cuts: no wound, but each
//   cut tears color out of him. Below it, your cuts wound him as any fighter.
// - Parrying him, baiting him with a feint and cutting him pull color back into the trees.
// - His cuts on you, his parries of yours, and time all feed his bloom.
// - The more color he holds, the quicker his blade; in full bloom he looses a petal storm,
//   quick cuts alternating lines.
// - In bloom, he can melt into petals as you swing and step out at your side (petal step).
// - Cut him down to BLOOM.secondAt vitality and he blooms a second time: he tears all the
//   color out of the trees at once, his storm grows to three cuts, and some of his blades
//   glint pink: those turn to the other line just before they land.
// - Win, and the color he took comes back to the trees, and some of it to you.
import { PINK } from './palette.js';
import { setShrineBloom } from './world.js';

export const BLOOM = {
  start: 0.5, // the trees begin bright: he has not taken it all yet
  veil: 0.3, // at or above this the petals turn your cuts aside
  siphon: 0.03, // per second, while the duel goes on
  hitHim: -0.3, // a cut turned aside by the petals tears this much out of him
  wound: -0.05, // a cut that wounds him
  parry: -0.25, // you parry him
  bait: -0.12, // he bites on your feint
  hitYou: 0.35, // he cuts you
  parried: 0.25, // he parries you
  step: -0.06, // a petal step spends a little of it
  secondAt: 2, // his vitality when the second bloom comes
  turnChance: 0.4, // after the second bloom, the share of his cuts that turn their line
  turnAt: 0.16, // a turning blade changes line this long before it lands
  bloomStagger: 0.55, // how long a parry staggers him while he is in bloom (normally 1.1 s)
  stormAfter: 0.8, // full bloom spends itself on the storm, down to this
  speed: 0.3, // at full bloom his windups are this much shorter (0 bloom: a little slower)
};

export class BossFight {
  constructor(host) {
    this.host = host;
    this.active = false;
    this.bloom = BLOOM.start;
    this.shown = BLOOM.start; // what the trees and his clothes show, easing after bloom
    const style = document.createElement('style');
    style.textContent = BLOOM_CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'bloom';
    this.el.innerHTML = `<small>Spring's color</small><div class="bar"><i class="trees"></i><i class="his"></i></div><span>the trees · the Petal Blade</span>`;
    document.body.appendChild(this.el);
    const ev = host.stage.events;
    const on = (name, fn) => ev.on(name, (...a) => this.active && this.host.stage.mode === 'fight' && fn(...a));
    on('parry', (def, att) => {
      if (def === this.p && att === this.f) {
        // in bloom the petals catch him: he reels for less time, so the counter must be quick
        if (this.bloom >= BLOOM.veil && this.f.state === 'stagger') this.f.stateDuration = BLOOM.bloomStagger;
        this.add(BLOOM.parry, 'The petals fall from him');
      }
      else if (def === this.f && att === this.p) this.add(BLOOM.parried);
    });
    on('hit', (def, att, info) => {
      if (def === this.p && att === this.f) this.add(BLOOM.hitYou, 'He drinks the color');
      else if (def === this.f && !info.killed) this.add(BLOOM.wound);
    });
    // the killing blow: everything he held floods back into the trees as he falls
    ev.on('hit', (def, att, info) => { if (this.active && def === this.f && info.killed) this.bloom = 0; });
    on('baited', (f) => { if (f === this.f) this.add(BLOOM.bait); });
    // his second bloom: the first time your cuts bring him this low
    ev.on('hit', (def, att, info) => {
      if (!this.active || def !== this.f || info.killed || this.f.phase === 2 || this.f.vitality > BLOOM.secondAt) return;
      this.f.phase = 2;
      // and he fights closer: more parries, and his guard comes up out of every cut you land
      if (host.stage.ai) Object.assign(host.stage.ai.P, { parry: 0.2, hitGuard: 0.9 });
      setTimeout(() => {
        if (!this.active) return;
        host.hud.say('Second bloom', 'bad', 1.4);
        host.hud.hint('He tears the last color from the trees. Watch for a pink glint: that blade turns to the other line before it lands.', 4);
        host.sound.ring(0.3, 0.8);
        host.petals.gust = 1;
        this.stormGust = 1.5;
        this.add(1);
      }, 500);
    });
    // after the second bloom some of his cuts are marked to turn (see update)
    ev.on('windup', (f) => {
      if (!this.active || f !== this.f || f.phase !== 2 || !f.attack || f.attack.feint || f.attack.kind !== 'cut') return;
      if (Math.random() < BLOOM.turnChance) f.attack.turn = true;
    });
    on('petalstep', (f, from) => {
      if (f !== this.f) return;
      host.fx.spark(from.clone().setY(from.y + 1.2), 36);
      host.fx.spark(f.pos.clone().setY(f.pos.y + 1.2), 24);
      host.petals.gust = 0.8;
      this.stormGust = Math.max(this.stormGust ?? 0, 0.5);
      host.sound.whoosh();
      host.hud.say('Petal step', 'bad', 0.6);
      this.add(BLOOM.step);
      if (!this.stepHinted) {
        this.stepHinted = true;
        host.hud.hint('He melts away from cuts while he is in bloom. Parry him to drain the color instead.', 3);
      }
    });
    on('storm', (f) => {
      if (f !== this.f) return;
      host.hud.say('Petal storm', 'bad', 0.9);
      host.petals.gust = 1;
      host.sound.whoosh();
      this.stormGust = 1.2;
    });
    this.apply(1 - this.bloom);
  }

  // A duel with him is starting: f is the Petal Blade, p the wanderer.
  begin(f, p) {
    const host = this.host;
    this.f = f;
    this.p = p;
    this.active = true;
    this.base ??= f.def.weapon;
    this.bloom = this.shown = BLOOM.start;
    f.bloom = this.bloom;
    f.storm = false;
    f.phase = 1;
    // the petals take a cut while he is in bloom
    f.shield = (dmg, from) => {
      if (from !== this.p || this.bloom < BLOOM.veil) return false;
      this.add(BLOOM.hitHim, 'The petals take the cut');
      host.fx.spark(f.pos.clone().setY(f.pos.y + 1.3), 30);
      host.sound.ring(1.1, 1.7);
      host.stage.hitstop(0.08);
      host.hud.say('Petals', '', 0.6);
      return true;
    };
    this.el.classList.add('show');
    this.update(0);
    if (!this.hinted) {
      this.hinted = true;
      setTimeout(() => this.active && host.hud.hint('While he is in bloom the petals take your cuts. Parry him and cut him anyway: each tears his color back into the trees. When his color runs out, the cuts land.', 5.5), 2600);
    }
  }

  // The duel is over, either way.
  end(won) {
    this.active = false;
    this.el.classList.remove('show');
    if (this.f) {
      this.f.shield = null;
      this.f.def.weapon = this.base;
    }
    if (won) this.bloom = 0;
    else this.bloom = BLOOM.start;
  }

  // A new journey: his color back on him, the trees as they were.
  reset() {
    this.active = false;
    this.bloom = this.shown = BLOOM.start;
    this.el.classList.remove('show');
    if (this.f) this.f.model.setBloom(this.bloom);
    this.apply(1 - this.bloom);
  }

  add(d, say = null) {
    const before = this.bloom;
    this.bloom = Math.min(1, Math.max(0, this.bloom + d));
    if (say) this.host.hud.hint(say, 1.2);
    if (before >= BLOOM.veil && this.bloom < BLOOM.veil) {
      this.host.hud.say('His color is spent', 'good', 1.2);
      this.host.sound.ring(0.5, 2.2);
    } else if (before < BLOOM.veil && this.bloom >= BLOOM.veil) {
      this.host.hud.say('He blooms again', 'bad', 1.0);
    }
    if (this.bloom >= 1 && this.f && !this.f.storm) {
      this.f.storm = true;
      this.bloom = BLOOM.stormAfter;
      this.host.hud.say('Full bloom', 'bad', 1.0);
    }
    if (this.f) this.f.bloom = this.bloom;
  }

  // the trees hold what he does not
  apply(trees) {
    // eased so a little color still reads as color, on him and on the trees
    setShrineBloom(Math.pow(trees, 0.6));
    if (this.f) this.f.model.setBloom(Math.pow(1 - trees, 0.6));
  }

  update(dt) {
    const host = this.host;
    if (this.active && host.stage.mode === 'fight') this.add(BLOOM.siphon * dt);
    // his blade quickens with the color he holds
    if (this.active && this.f) {
      const k = 1 + BLOOM.speed * 0.3 - BLOOM.speed * this.bloom;
      const w = this.base;
      this.f.def.weapon = { ...w, windup: w.windup * k, counterWindup: w.counterWindup * k };
    }
    // a turning blade: just before it lands, it changes line
    const f = this.f, a = f?.attack;
    if (this.active && a?.turn && !a.turned && f.state === 'windup' && a.windup - f.t < BLOOM.turnAt) {
      a.turned = true;
      a.stance = a.stance === 0 ? 2 : 0;
      f.stance = a.stance;
      host.sound.ring(0.9, 1.9);
    }
    this.shown += (this.bloom - this.shown) * (1 - Math.exp(-4 * dt));
    if (!dt) this.shown = this.bloom;
    this.apply(1 - this.shown);
    if (this.stormGust > 0) {
      this.stormGust -= dt;
      if (this.stormGust <= 0) host.petals.gust = 0;
    }
    // the bar: pink for the trees, his share in the deep rose of his clothes
    const t = (1 - this.shown) * 100;
    this.el.querySelector('.trees').style.width = `${t}%`;
    this.el.querySelector('.his').style.width = `${100 - t}%`;
    this.el.classList.toggle('veiled', this.bloom >= BLOOM.veil);
  }
}

export const BLOOM_CSS = `
#bloom { position: fixed; top: 92px; left: 50%; transform: translateX(-50%); width: min(420px, 60vw);
  font: 12px/1.3 Georgia, 'Times New Roman', serif; color: #161514; text-align: center; opacity: 0;
  transition: opacity 0.4s; pointer-events: none; z-index: 6; }
#bloom.show { opacity: 1; }
#bloom small { letter-spacing: 0.18em; text-transform: uppercase; font-size: 10px; }
#bloom .bar { display: flex; height: 9px; margin: 3px 0; border: 1.5px solid #161514; background: #e9e2d0; }
#bloom .trees { background: ${hex(PINK.blossom)}; display: block; }
#bloom .his { background: repeating-linear-gradient(135deg, ${hex(PINK.deep)} 0 3px, ${hex(PINK.ink)} 3px 5px); display: block; }
#bloom:not(.veiled) .his { background: repeating-linear-gradient(135deg, #b9b2a3 0 3px, #8c867a 3px 5px); }
#bloom span { font-size: 10px; opacity: 0.7; font-style: italic; }
`;
function hex(c) { return `#${c.toString(16).padStart(6, '0')}`; }
