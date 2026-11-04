// Enemy duelists. Each reads the player, keeps its preferred distance, and shows a clear
// tell (pose + red glint) before every strike.
import * as THREE from 'three';
import { counterOf, counters } from './config.js';

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
  }

  later(delay, fn) {
    this.jobs.push({ at: this.time + delay, fn });
  }

  // called when the player starts a strike
  onPlayerWindup() {
    const f = this.f, p = this.p, P = this.P;
    if (f.busy || !p.attack) return;
    const impactIn = p.attack.windup - p.t;
    const reaction = rand(P.reaction[0], P.reaction[1]);
    const choice = weighted([
      ['parry', P.parry], ['block', P.block], ['dodge', P.dodge], ['none', P.none],
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
      this.later(at, () => f.dodge(new THREE.Vector2(Math.random() < 0.5 ? -1 : 1, P.dodgeBack ? -1 : -0.3)));
      this.reacting = at + 0.4;
    }
  }

  update(dt) {
    const f = this.f, p = this.p;
    this.time += dt;
    if (this.reacting > 0) this.reacting -= dt;
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
    // being out-lined is dangerous: shift sooner
    if (counters(this.p.displayStance, this.f.displayStance) && this.stanceTimer > this.P.outlinedShift) {
      this.stanceTimer = rand(this.P.outlinedShift * 0.4, this.P.outlinedShift);
    }
    if (this.stanceTimer > 0) return;
    this.stanceTimer = rand(this.P.stanceEvery[0], this.P.stanceEvery[1]);
    const s = Math.random() < this.P.readStance ? counterOf(this.p.displayStance) : Math.floor(Math.random() * 3);
    this.f.setStance(s);
  }
}

export class RoninAI extends EnemyAI {
  constructor(fighter, player, game) {
    super(fighter, player, game, {
      reaction: [0.08, 0.15],
      parry: 0.14, block: 0.46, dodge: 0.16, none: 0.24,
      dodgeBack: false,
      strafe: 0.55,
      stanceEvery: [0.9, 2.2],
      readStance: 0.55,
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
      [Math.floor(Math.random() * 3), 0.25],
    ]);
    let followUp = null;
    if (!quick && Math.random() < 0.3) {
      const others = [0, 1, 2].filter((x) => x !== s);
      followUp = { stance: pick(others), windup: 0.42, lunge: 0.6 };
    }
    const ok = f.startAttack({ stance: s, windup: quick ? 0.45 : undefined, followUp });
    if (ok && !quick && !followUp && Math.random() < 0.1) {
      // feint: pull the strike before it lands
      const at = f.attack.windup * rand(0.45, 0.6);
      this.later(at, () => f.cancelAttack());
    }
  }
}

export class SpearmanAI extends EnemyAI {
  constructor(fighter, player, game) {
    super(fighter, player, game, {
      reaction: [0.12, 0.2],
      parry: 0.06, block: 0.42, dodge: 0.26, none: 0.26,
      dodgeBack: true,
      strafe: 0.4,
      stanceEvery: [1.6, 3.0],
      readStance: 0.35,
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
        f.startAttack({ stance: 1, kind: 'shove', windup: 0.36, lunge: 0 });
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
      f.startAttack({ stance: 1, windup: 0.5 });
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
      const s = weighted([[1, 0.5], [0, 0.2], [2, 0.3]]);
      f.startAttack({ stance: s });
      this.attackCooldown = rand(1.3, 2.6);
      return;
    }
    this.strafe(dt, 3.3);
  }
}
