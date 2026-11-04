// Enemy duelists. Each reads the player, keeps its preferred distance, and shows a clear
// tell (pose + red glint) before every strike.
import * as THREE from 'three';
import { counterOf, counters, STANCES, STANCE_SWITCH_TIME } from './config.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weighted(table) {
  let r = Math.random() * table.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of table) {
    if ((r -= w) <= 0) return v;
  }
  return table[0][0];
}

class EnemyAI {
  constructor(fighter, player, game, profile) {
    this.f = fighter;
    this.p = player;
    this.game = game;
    this.P = profile;
    this.time = 0;
    this.jobs = [];
    this.attackCooldown = rand(1.2, 2.0);
    this.stanceTimer = rand(0.8, 1.6);
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(1, 3);
    this.reacting = 0;
    this.backoff = 0;
    this.lastPlayerState = player.state;
    this.baited = 0;
    this.seenFeint = player.feintedAt ?? 0;
    this.handled = null; // the player attack we already answered
    this.pressure = []; // times of the player's recent strikes
    game.events.on('block', (def, att) => this.game.ai === this && def === this.f && att === this.p && this.riposte());
    game.events.on('evade', (def, att) => this.game.ai === this && def === this.f && att === this.p && this.riposte(true));
  }

  // After stopping a strike, answer at once while he is still recovering.
  riposte(evaded = false) {
    const f = this.f, p = this.p, P = this.P;
    if (!P.riposte || Math.random() > P.riposte || !p.alive) return;
    // timed so a normal blocked cut can still guard it; a blocked lunge cannot
    this.later(0.2, () => {
      if (!f.alive || f.state === 'stagger' || f.state === 'hitstun' || f.state === 'winded') return;
      if (f.state === 'block') { f.setBlock(false); f.setState('idle'); }
      if (f.busy || f.distTo(p) > f.weapon.reach + 1.2) return;
      this.jobs.length = 0;
      this.reacting = 0;
      const stance = Math.random() < 0.6 ? counterOf(p.displayStance) : f.displayStance;
      f.startAttack({ stance, windup: P.riposteWindup, lunge: 1.2 });
    });
  }

  later(delay, fn) {
    this.jobs.push({ at: this.time + delay, fn });
  }

  // Start a strike. If it comes from a new stance, the blade drifts there first, so the
  // line of the coming blow can be read before the glint.
  commit(opts, after) {
    const f = this.f;
    const go = () => {
      if (f.state !== 'idle' || !this.p.alive) return;
      if (f.startAttack(opts)) after?.();
    };
    if (opts.stance !== undefined && opts.stance !== f.displayStance && !opts.quick) {
      f.setStance(opts.stance);
      const delay = rand(this.P.drift[0], this.P.drift[1]);
      this.reacting = delay + 0.02;
      this.later(delay, go);
    } else go();
  }

  // The player pulled a strike back. If we had already moved to answer it, we bit.
  onPlayerFeint() {
    const f = this.f;
    if (this.reacting <= 0 && f.state !== 'block') return;
    this.jobs.length = 0;
    const bait = rand(0.45, 0.7);
    this.baited = bait;
    this.reacting = bait;
    this.later(bait * 0.8, () => f.setBlock(false));
    this.game.events.emit('baited', f, this.p);
  }

  // called when the player starts a strike
  onPlayerWindup() {
    const f = this.f, p = this.p, P = this.P;
    if (!p.attack || this.baited > 0) return;
    const impactIn = p.attack.windup - p.t;
    // beaten to the punch: drop his own windup into guard if he can see it coming
    if (f.state === 'windup' && f.attack && f.attack.windup - f.t > impactIn - 0.03) {
      if (Math.random() < P.guardCancel) {
        const parry = Math.random() < P.parry * 1.5;
        this.later(rand(P.reaction[0], P.reaction[1]) * 0.6, () => {
          if (p.state !== 'windup') return;
          f.setStance(p.attack?.stance ?? f.stance);
          f.pendingStance = null; f.stance = p.attack?.stance ?? f.stance; // guard snaps to the line
          if (f.guardCancel(parry)) {
            this.reacting = (p.attack ? p.attack.windup - p.t : 0) + 0.35;
            this.later(this.reacting - 0.05, () => f.setBlock(false));
          }
        });
      }
      this.handled = p.attack;
      return;
    }
    if (f.busy) return; // answered once he is free (see update)
    // a strike that began while he was busy (punishing his recovery) can still be
    // blocked if he is free in time, but never parried
    const lateStart = this.handled !== p.attack && this.lastPlayerState === 'windup';
    this.handled = p.attack;
    // the more he presses, the readier the guard: spam meets parries
    const now = this.time;
    this.pressure = this.pressure.filter((t) => now - t < 1.8);
    this.pressure.push(now);
    const press = Math.max(0, this.pressure.length - 2); // 3+ strikes in under 2 s
    const reaction = rand(P.reaction[0], P.reaction[1]) * Math.max(0.6, 1 - press * 0.12);
    // read the footwork behind the strike: sidestep a lunge, back out of a side cut,
    // and let a retreating cut go by rather than spend breath on it
    const move = p.attack.move;
    const read = move && Math.random() < P.readMove;
    let dodgeW = P.dodge, noneW = P.none;
    if (read && move === 'lunge') dodgeW *= 2.6;
    if (read && move === 'retreat') noneW *= 1.8;
    noneW *= Math.pow(0.45, press);
    const stance = p.attack.stance;
    let choice = weighted([
      ['parry', lateStart ? 0 : P.parry + press * P.adapt], ['block', P.block], ['dodge', dodgeW], ['none', noneW],
    ]);
    // caught in the wrong line with no time to change guard: get out of the way instead
    const late = f.displayStance !== stance && impactIn < reaction + STANCE_SWITCH_TIME + 0.03;
    if (late && (choice === 'parry' || choice === 'block') && Math.random() < P.dodgeWhenLate) choice = 'dodge';
    const lateral = late || (read && move === 'lunge');
    if (choice === 'parry') {
      // meet the blade in its line, right at the last moment
      const at = Math.max(reaction, impactIn - 0.1);
      this.later(Math.max(0, at - 0.16), () => f.setStance(stance));
      this.later(at, () => { if (!f.busy) f.setBlock(true); });
      this.later(at + 0.22, () => f.setBlock(false));
      this.reacting = at + 0.26;
    } else if (choice === 'block') {
      this.later(reaction, () => { f.setStance(stance); f.setBlock(true); });
      this.later(impactIn + 0.14, () => f.setBlock(false));
      this.reacting = impactIn + 0.18;
    } else if (choice === 'dodge') {
      const at = Math.max(reaction, impactIn - 0.2);
      // a side cut sweeps wide: if he read it, he gives ground straight back instead
      const dir = read && move === 'side' ? new THREE.Vector2(0, -1)
        : lateral ? new THREE.Vector2(Math.random() < 0.5 ? -1 : 1, 0)
        : new THREE.Vector2(Math.random() < 0.5 ? -1 : 1, P.dodgeBack ? -1 : -0.3);
      this.later(at, () => f.dodge(dir));
      this.reacting = at + 0.4;
    }
  }

  update(dt) {
    const f = this.f, p = this.p;
    this.time += dt;
    if (this.reacting > 0) this.reacting -= dt;
    if (this.baited > 0) this.baited -= dt;
    if (p.feintedAt && p.feintedAt !== this.seenFeint) {
      this.seenFeint = p.feintedAt;
      this.onPlayerFeint();
    }
    // run due jobs; a job may clear or add jobs, so take them out first
    const due = this.jobs.filter((j) => j.at <= this.time);
    if (due.length) {
      this.jobs = this.jobs.filter((j) => j.at > this.time);
      for (const j of due) if (f.alive) j.fn();
    }
    if (!f.alive) return;
    if (!p.alive) { f.moveInput.set(0, 0); f.setBlock(false); return; }

    // the player just started a strike
    if (p.state === 'windup' && (this.lastPlayerState !== 'windup' || (this.handled !== p.attack && !f.busy && this.reacting <= 0))) this.onPlayerWindup();
    if (p.state === 'iaiStrike' && this.lastPlayerState !== 'iaiStrike') this.onPlayerIai();
    this.lastPlayerState = p.state;

    if (f.state === 'stagger' || f.state === 'hitstun') {
      this.jobs.length = 0;
      this.reacting = 0;
      // reeling from a cut, he gets his guard up as he comes out of it if you press
      if (f.state === 'hitstun' && this.hitGuard === undefined) this.hitGuard = Math.random() < (this.P.hitGuard ?? 0);
      const guard = f.state === 'hitstun' && this.hitGuard && p.state === 'windup' && p.attack;
      if (guard && f.displayStance !== p.attack.stance) f.setStance(p.attack.stance);
      f.setBlock(!!guard);
      if (guard) { this.handled = p.attack; this.reacting = 0.25; }
    } else this.hitGuard = undefined;
    if (f.busy || this.reacting > 0) {
      f.moveInput.set(0, 0);
      return;
    }
    this.think(dt);
  }

  onPlayerIai() {}

  strafe(dt, want) {
    const f = this.f, p = this.p;
    const d = f.distTo(p);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = rand(1.2, 3.2);
    }
    const fwd = THREE.MathUtils.clamp((d - want) * 1.3, -1, 1);
    f.moveInput.set(this.strafeDir * this.P.strafe, fwd);
  }

  manageStance(dt) {
    this.stanceTimer -= dt;
    // guard the line he would strike from; when it is open, shift sooner
    if (counters(this.p.displayStance, this.f.displayStance) && this.stanceTimer > this.P.outlinedShift) {
      this.stanceTimer = rand(this.P.outlinedShift * 0.4, this.P.outlinedShift);
    }
    if (this.stanceTimer > 0) return;
    this.stanceTimer = rand(this.P.stanceEvery[0], this.P.stanceEvery[1]);
    const s = Math.random() < this.P.readStance ? this.p.displayStance : pick(STANCES);
    this.f.setStance(s);
  }
}

export class RoninAI extends EnemyAI {
  constructor(fighter, player, game) {
    super(fighter, player, game, {
      reaction: [0.07, 0.13],
      parry: 0.1, block: 0.56, dodge: 0.2, none: 0.14,
      dodgeBack: false,
      readMove: 0.8,
      adapt: 0.3, // extra parry weight per strike when pressed
      guardCancel: 0.75,
      riposte: 0.75, riposteWindup: 0.44, // slow enough to read and guard
      hitGuard: 0.8,
      dodgeWhenLate: 0.7,
      strafe: 0.55,
      stanceEvery: [0.9, 2.2],
      readStance: 0.8,
      drift: [0.24, 0.34],
      outlinedShift: 0.7,
    });
  }

  think(dt) {
    const f = this.f, p = this.p;
    const d = f.distTo(p);
    f.setBlock(false);
    this.manageStance(dt);
    this.attackCooldown -= dt;

    // punish an opening
    if (p.vulnerable && d < f.weapon.reach + 1.0 && f.breath > 15) {
      this.strike(true);
      return;
    }
    // a sheathed blade is an invitation: rush it before it is drawn
    if ((p.state === 'iaiCharge' || p.state === 'iaiSheathe') && this.attackCooldown > 0.5) {
      this.attackCooldown = rand(0.2, 0.6);
    }
    if (f.breath < 30) {
      this.backoff = 0.8;
    }
    if (this.backoff > 0) {
      this.backoff -= dt;
      f.moveInput.set(this.strafeDir * 0.6, -0.8);
      return;
    }
    if (d > 4.2 && f.breath > 55 && Math.random() < dt * 0.8) {
      f.dodge(new THREE.Vector2(0, 1)); // a quick step in to close the gap
      return;
    }
    // don't swing at someone giving ground: a whiff there gets lunged into
    const retreating = p.moveInput.y < -0.3 && !p.busy;
    if (this.attackCooldown <= 0 && d < f.weapon.reach + (retreating ? 0.3 : 0.9)) {
      this.strike(false);
      this.attackCooldown = rand(0.9, 2.0);
      return;
    }
    this.strafe(dt, 3.1);
  }

  strike(quick) {
    const f = this.f, p = this.p;
    const s = weighted([
      [counterOf(p.displayStance), 0.5],
      [f.displayStance, 0.25],
      [pick(STANCES), 0.25],
    ]);
    let followUp = null;
    if (!quick && Math.random() < 0.3) {
      followUp = { stance: counterOf(s), windup: 0.42, lunge: 0.6 };
    }
    const feint = !quick && !followUp && Math.random() < 0.12;
    this.commit({ stance: s, windup: quick ? 0.45 : undefined, followUp, quick }, () => {
      // feint: pull the strike before it lands
      if (feint) this.later(f.attack.windup * rand(0.45, 0.6), () => f.cancelAttack());
    });
  }
}

// The Spearman fights at the end of his reach. Walking straight in meets a stop-thrust,
// circling him meets a wide low sweep, lunging at him meets the spearhead, and up
// close he shoves you back out. The way in is to bait a thrust, slip it, then close.
export class SpearmanAI extends EnemyAI {
  constructor(fighter, player, game) {
    super(fighter, player, game, {
      reaction: [0.1, 0.17],
      parry: 0.1, block: 0.52, dodge: 0.3, none: 0.08,
      dodgeBack: true,
      readMove: 0.6,
      adapt: 0.22,
      guardCancel: 0.5,
      riposte: 0.5, riposteWindup: 0.6,
      hitGuard: 0.6,
      dodgeWhenLate: 0.7,
      strafe: 0.4,
      stanceEvery: [1.6, 3.0],
      readStance: 0.6,
      drift: [0.3, 0.42],
      outlinedShift: 1.4,
      meetLunge: 0.6, // chance to answer a lunge with the spearhead
      stopThrust: 2.2, // per second, while you walk into his reach
      keep: 2.7, // inside this he gives ground
    });
    this.shoveCooldown = 0;
  }

  // A lunge from range runs onto the spear.
  onPlayerWindup() {
    const f = this.f, p = this.p, P = this.P;
    const a = p.attack;
    if (a && a.move === 'lunge' && !f.busy && f.state !== 'block' && this.baited <= 0 &&
        f.distTo(p) > 2.3 && f.breath > 15 && Math.random() < P.meetLunge) {
      const impactIn = a.windup - p.t;
      const windup = THREE.MathUtils.clamp(impactIn - 0.1, 0.15, 0.45);
      this.handled = a;
      this.jobs.length = 0;
      // thrust from the line he already holds (no time to change it): in your line the
      // blades meet and clash, in the other line his longer reach lands first
      if (f.pendingStance !== null) { f.stance = f.pendingStance; f.pendingStance = null; }
      if (f.startAttack({ stance: f.stance, kind: 'thrust', windup, lunge: 0 })) {
        this.game.events.emit('meet', f, p);
        return;
      }
    }
    super.onPlayerWindup();
  }

  think(dt) {
    const f = this.f, p = this.p, P = this.P;
    const d = f.distTo(p);
    f.setBlock(false);
    this.manageStance(dt);
    this.attackCooldown -= dt;
    this.shoveCooldown -= dt;

    // too close for a spear: shove them off or step back
    if (d < 2.0) {
      if (this.shoveCooldown <= 0 && f.breath > 10 && Math.random() < 0.6) {
        f.startAttack({ stance: p.displayStance, kind: 'shove', windup: 0.36, lunge: 0 });
        this.shoveCooldown = rand(1.2, 2.2);
        return;
      }
      if (f.breath > 35 && Math.random() < 0.02) {
        f.dodge(new THREE.Vector2(0, -1));
        return;
      }
      f.moveInput.set(this.strafeDir * 0.3, -1);
      return;
    }

    if (p.vulnerable && d < f.weapon.reach + 0.6 && f.breath > 18) {
      f.startAttack({ stance: 0, windup: 0.5 });
      return;
    }
    // a charging draw-cut: poke it from out of its reach
    if ((p.state === 'iaiCharge' || p.state === 'iaiSheathe') && d > 2.4 && d < f.weapon.reach + 0.4 && f.breath > 20) {
      if (this.attackCooldown > 0.3) this.attackCooldown = 0.3;
    }
    if (f.breath < 35) {
      f.moveInput.set(this.strafeDir * 0.4, -0.6);
      return;
    }
    const walkingIn = !p.busy && p.moveInput.y > 0.5 && Math.abs(p.moveInput.x) < 0.5;
    const circling = !p.busy && Math.abs(p.moveInput.x) > 0.5;
    const inBand = d > 2.3 && d < f.weapon.reach + 0.6;
    // walking straight into his reach meets a quick stop-thrust
    if (walkingIn && inBand && this.attackCooldown < 0.8 && Math.random() < dt * P.stopThrust) {
      f.startAttack({ stance: 0, kind: 'thrust', windup: 0.52, lunge: 0.2 });
      this.attackCooldown = rand(1.1, 2.0);
      return;
    }
    if (this.attackCooldown <= 0 && inBand) {
      // circling him draws the wide low sweep; otherwise a high thrust or a sweep
      const s = circling ? 2 : weighted([[0, 0.6], [2, 0.4]]);
      this.commit({ stance: s });
      this.attackCooldown = rand(1.2, 2.4);
      return;
    }
    // give ground to keep you at the spearhead
    if (d < P.keep) {
      f.moveInput.set(this.strafeDir * 0.35, -0.9);
      return;
    }
    this.strafe(dt, 3.2);
  }
}
