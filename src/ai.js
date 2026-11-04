// Enemy duelists. Each reads the player, keeps its preferred distance, and shows a clear
// tell (pose + red glint) before every strike.
import * as THREE from 'three';
import { counterOf, counters, STANCES } from './config.js';

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
    if (f.busy || !p.attack || this.baited > 0) return;
    const impactIn = p.attack.windup - p.t;
    const reaction = rand(P.reaction[0], P.reaction[1]);
    // read the footwork behind the strike: sidestep a lunge, back out of a side cut,
    // and let a retreating cut go by rather than spend breath on it
    const move = p.attack.move;
    const read = move && Math.random() < P.readMove;
    let dodgeW = P.dodge, noneW = P.none;
    if (read && move === 'lunge') dodgeW *= 2.6;
    if (read && move === 'retreat') noneW *= 1.8;
    const choice = weighted([
      ['parry', P.parry], ['block', P.block], ['dodge', dodgeW], ['none', noneW],
    ]);
    const stance = p.attack.stance;
    if (choice === 'parry') {
      // meet the blade in its line, right at the last moment
      const at = Math.max(reaction, impactIn - 0.1);
      this.later(Math.max(0, at - 0.16), () => f.setStance(stance));
      this.later(at, () => { if (!f.busy) f.setBlock(true); });
      this.later(at + 0.35, () => f.setBlock(false));
      this.reacting = at + 0.4;
    } else if (choice === 'block') {
      this.later(reaction, () => { f.setStance(stance); f.setBlock(true); });
      this.later(impactIn + 0.3, () => f.setBlock(false));
      this.reacting = impactIn + 0.35;
    } else if (choice === 'dodge') {
      const at = Math.max(reaction, impactIn - 0.2);
      // a side cut sweeps wide: if he read it, he gives ground straight back instead
      const dir = read && move === 'side' ? new THREE.Vector2(0, -1)
        : read && move === 'lunge' ? new THREE.Vector2(Math.random() < 0.5 ? -1 : 1, 0)
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
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (this.jobs[i].at <= this.time) {
        const j = this.jobs.splice(i, 1)[0];
        if (f.alive) j.fn();
      }
    }
    if (!f.alive) return;
    if (!p.alive) { f.moveInput.set(0, 0); f.setBlock(false); return; }

    // the player just started a strike
    if (p.state === 'windup' && this.lastPlayerState !== 'windup') this.onPlayerWindup();
    if (p.state === 'iaiStrike' && this.lastPlayerState !== 'iaiStrike') this.onPlayerIai();
    this.lastPlayerState = p.state;

    if (f.state === 'stagger' || f.state === 'hitstun') {
      this.jobs.length = 0;
      this.reacting = 0;
      f.setBlock(false);
    }
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
      reaction: [0.08, 0.15],
      parry: 0.14, block: 0.46, dodge: 0.16, none: 0.24,
      dodgeBack: false,
      readMove: 0.55,
      strafe: 0.55,
      stanceEvery: [0.9, 2.2],
      readStance: 0.55,
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
    if (p.vulnerable && d < f.weapon.reach + 1.6 && f.breath > 15) {
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
    if (this.attackCooldown <= 0 && d < f.weapon.reach + 1.5) {
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

export class SpearmanAI extends EnemyAI {
  constructor(fighter, player, game) {
    super(fighter, player, game, {
      reaction: [0.12, 0.2],
      parry: 0.06, block: 0.42, dodge: 0.26, none: 0.26,
      dodgeBack: true,
      readMove: 0.35,
      strafe: 0.4,
      stanceEvery: [1.6, 3.0],
      readStance: 0.35,
      drift: [0.3, 0.42],
      outlinedShift: 1.4,
    });
    this.shoveCooldown = 0;
  }

  think(dt) {
    const f = this.f, p = this.p;
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
    if (this.attackCooldown <= 0 && d > 2.4 && d < f.weapon.reach + 0.5) {
      const s = weighted([[0, 0.5], [2, 0.5]]); // high thrust or low sweep
      this.commit({ stance: s });
      this.attackCooldown = rand(1.3, 2.6);
      return;
    }
    this.strafe(dt, 3.3);
  }
}
