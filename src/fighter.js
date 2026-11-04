// A duelist: position, stance, breath, and the state machine shared by the player and enemies.
import * as THREE from 'three';
import {
  BREATH, DODGE, STEP, FEINT, IAI, STANCE_SWITCH_TIME, BLOCK_COOLDOWN, STAGGER_TIME, HITSTUN_TIME,
  ARENA_RADIUS, MOVE_STRIKES, counters,
} from './config.js';
import { FighterModel, POSES, lerpPose, movePoses } from './models.js';

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => Math.pow(Math.min(1, Math.max(0, t)), 2);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpMove = new THREE.Vector2();
const tmpVel = new THREE.Vector3();
const scratchPose = {};

// States in which a fighter cannot start a new action.
const BUSY = new Set([
  'windup', 'strike', 'recover', 'dodge', 'stagger', 'hitstun', 'winded',
  'iaiSheathe', 'iaiCharge', 'iaiStrike', 'iaiRecover', 'dead',
]);

export class Fighter {
  constructor(def, look, game) {
    this.def = def;
    this.game = game;
    this.model = new FighterModel(look, def.weapon.kind);
    this.poses = POSES[def.weapon.kind];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3(); // knockback
    this.yaw = 0;
    this.opponent = null;
    this.moveInput = new THREE.Vector2(); // x: strafe right, y: toward opponent
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.t = 0;
    this.stance = 0;
    this.pendingStance = null;
    this.stanceTimer = 0;
    this.breath = BREATH.max;
    this.regenDelay = 0;
    this.gassed = false;
    this.vitality = this.def.vitality;
    this.attack = null;
    this.blockHeld = false;
    this.blockTime = 0;
    this.blockCooldown = 0;
    this.iaiCharge = 0;
    this.iaiHit = false;
    this.dodgeDir = new THREE.Vector3();
    this.dodgeKind = 'evade';
    this.dodgeDist = DODGE.dist;
    this.stateDuration = 0;
    this.recoverExtra = 0;
    this.deathT = 0;
    this.lastHitAt = -10;
    this.moveInput.set(0, 0);
    this.vel.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.body.rotation.z = 0;
    this.model.setGlint(0);
  }

  get busy() { return BUSY.has(this.state); }
  get alive() { return this.state !== 'dead'; }
  get weapon() { return this.def.weapon; }

  // Fighters who are caught out take an extra point of damage.
  get vulnerable() {
    return this.state === 'stagger' || this.state === 'winded' || this.state === 'iaiRecover' ||
      (this.state === 'recover' && this.attack?.whiffed && !this.attack.safe);
  }

  get invulnerable() {
    return this.state === 'dodge' && this.dodgeKind === 'evade' && this.t >= DODGE.iStart && this.t <= DODGE.iEnd;
  }

  // Is the guard actually up in a given stance right now?
  guarding(stance) {
    return this.state === 'block' && this.pendingStance === null && this.stance === stance;
  }

  distTo(o) {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  forward(out = tmp) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  setState(s, duration = 0) {
    this.state = s;
    this.t = 0;
    this.stateDuration = duration;
  }

  spend(amount) {
    this.breath -= amount;
    this.regenDelay = BREATH.regenDelay;
    if (this.breath <= 0) {
      this.breath = 0;
      this.gassed = true;
    }
  }

  becomeWinded() {
    this.gassed = false;
    this.breath = 0;
    this.attack = null;
    this.blockHeld = false;
    this.setState('winded', BREATH.windedTime);
    this.game.events.emit('winded', this);
  }

  // ----- actions -----

  setStance(s) {
    if (s === this.stance && this.pendingStance === null) return;
    if (s === this.pendingStance) return;
    if (!this.alive || this.state === 'winded' || this.state === 'stagger') return;
    if (['windup', 'strike', 'iaiSheathe', 'iaiCharge', 'iaiStrike'].includes(this.state)) return;
    this.pendingStance = s;
    this.stanceTimer = STANCE_SWITCH_TIME;
    this.spend(BREATH.stanceCost);
    this.game.events.emit('stance', this);
  }

  get displayStance() {
    return this.pendingStance ?? this.stance;
  }

  // Which move-strike the current footwork asks for (katana only).
  moveStrike() {
    if (this.weapon.kind !== 'katana') return null;
    const { x, y } = this.moveInput;
    if (Math.abs(x) < 0.3 && Math.abs(y) < 0.3) return null;
    if (y > 0.3 && y >= Math.abs(x) * 0.8) return 'lunge';
    if (y < -0.3 && -y >= Math.abs(x) * 0.8) return 'retreat';
    return 'side';
  }

  // opts: { stance, windup, kind: 'cut'|'thrust'|'sweep'|'shove', move, followUp, lunge, damage }
  startAttack(opts = {}) {
    if (this.busy || this.breath <= 0) return false;
    const w = this.weapon;
    const stance = opts.stance ?? this.displayStance;
    // striking from a new stance flows straight into it, but the switch still takes time
    let switchDelay = 0;
    if (stance !== this.stance) switchDelay = this.pendingStance === stance ? Math.max(0, this.stanceTimer) : STANCE_SWITCH_TIME;
    this.stance = stance;
    this.pendingStance = null;
    const opp = this.opponent;
    const countered = opp && counters(stance, opp.displayStance);
    const move = opts.kind ? null : (opts.move === undefined ? null : opts.move);
    const M = move ? MOVE_STRIKES[move] : null;
    const kind = opts.kind ?? (w.kind === 'yari' ? (stance === 2 ? 'sweep' : 'thrust') : 'cut');
    let windup = (opts.windup ?? (countered ? w.counterWindup : w.windup)) + switchDelay + (M?.windup ?? 0);
    let reach = w.reach + (M?.reach ?? 0);
    let arc = M?.arc ?? w.arc;
    let damage = opts.damage ?? w.damage;
    if (kind === 'sweep') { windup += 0.1; arc = 1.4; reach -= 0.3; }
    if (kind === 'shove') { reach = 1.9; damage = 0; arc = 1.2; }
    // close the gap during the windup so a tell can start out of reach
    const dist = opp ? this.distTo(opp) : 0;
    const want = Math.max(0, dist - (reach - 0.45));
    let lunge = Math.min(opts.lunge ?? w.lunge, want);
    if (move === 'lunge') lunge = Math.min(M.step, Math.max(0, dist - 1.2));
    if (move === 'retreat') lunge = 0;
    this.attack = {
      stance, kind, move, windup, reach, arc, damage, lunge, countered,
      active: w.active, recover: w.recover + (M?.recover ?? 0), followUp: opts.followUp ?? null,
      resolved: false, whiffed: false, unblockable: false, safe: move === 'retreat',
      back: move === 'retreat' ? M.back : 0,
      sideDir: move === 'side' ? Math.sign(this.moveInput.x) : 0,
      weaponKind: kind === 'shove' ? 'shove' : w.kind,
    };
    this.spend((kind === 'shove' ? 8 : w.cost) + (M?.cost ?? 0));
    this.setState('windup');
    this.game.events.emit('windup', this);
    return true;
  }

  // A feint: pull the strike back before it lands, to bait a guard or parry.
  cancelAttack() {
    if (this.state !== 'windup' || !this.attack || this.attack.kind === 'shove') return false;
    if (this.t > this.attack.windup * FEINT.latest) return false;
    this.attack = null;
    this.setState('recover');
    this.stateDuration = FEINT.recover;
    this.spend(FEINT.cost);
    this.feintedAt = this.game.time;
    this.game.events.emit('feint', this);
    return true;
  }

  // Drop a windup straight into guard (a skilled duelist's answer to being beaten
  // to the punch). Costs breath like a feint, but there is no recover.
  guardCancel(parry = false) {
    if (this.state !== 'windup' || !this.attack || this.t > this.attack.windup * FEINT.latest) return false;
    this.attack = null;
    this.spend(FEINT.cost);
    this.blockHeld = true;
    this.setState('block');
    this.blockTime = parry ? 0 : 1;
    return true;
  }

  setBlock(held) {
    this.blockHeld = held;
  }

  dodge(localDir) {
    // localDir: Vector2 (x strafe right, y toward opponent); defaults to a backstep
    if (this.busy || this.breath <= 0) return false;
    const dir = localDir && localDir.lengthSq() > 0.01 ? localDir.clone().normalize() : new THREE.Vector2(0, -1);
    const f = this.forward(tmp);
    const r = tmp2.set(-f.z, 0, f.x);
    this.dodgeDir.set(0, 0, 0).addScaledVector(f, dir.y).addScaledVector(r, dir.x).normalize();
    // forward is a committed step in; back or sideways is an evade with i-frames
    this.dodgeKind = dir.y > 0.5 ? 'step' : 'evade';
    this.dodgeLateral = Math.abs(dir.x) > Math.abs(dir.y);
    this.dodgeAt = this.game.time;
    const D = this.dodgeKind === 'step' ? STEP : DODGE;
    this.dodgeDist = D.dist;
    this.spend(D.cost);
    this.setState('dodge', D.time);
    this.game.events.emit('dodge', this);
    return true;
  }

  startIai() {
    if (this.busy || this.breath <= 0) return false;
    this.iaiCharge = 0;
    this.pendingStance = null;
    this.setState('iaiSheathe', IAI.sheatheTime);
    this.game.events.emit('sheathe', this);
    return true;
  }

  releaseIai() {
    if (this.state === 'iaiSheathe') {
      this.setState('idle');
      return;
    }
    if (this.state !== 'iaiCharge') return;
    if (this.iaiCharge < IAI.minCharge) {
      this.setState('recover');
      this.attack = null;
      this.stateDuration = 0.2;
      return;
    }
    const full = this.iaiCharge >= IAI.fullCharge;
    const opp = this.opponent;
    const lungeMax = IAI.lungeBase + IAI.lungeExtra * this.iaiCharge;
    const dist = opp ? this.distTo(opp) : 0;
    const lunge = Math.max(0, Math.min(lungeMax, dist - 1.15));
    this.attack = {
      // a level draw-cut: whatever line he guards, a raised guard can take a partial one
      stance: opp ? opp.displayStance : 0, kind: 'iai', windup: IAI.impactAt, reach: IAI.reach, arc: 1.1,
      damage: full ? 3 : 1, lunge, active: IAI.strikeTime, recover: IAI.hitRecover,
      resolved: false, whiffed: false, unblockable: full, unparryable: full, iai: true,
      weaponKind: 'katana', full,
    };
    this.spend(IAI.cost);
    this.iaiHit = false;
    this.setState('iaiStrike');
    this.game.events.emit('iai', this);
  }

  // ----- reactions (called by combat resolution) -----

  takeHit(dmg, from, knock = 4) {
    this.vitality -= dmg;
    this.lastHitAt = this.game.time;
    this.attack = null;
    this.blockHeld = false;
    this.iaiCharge = 0;
    tmp.subVectors(this.pos, from.pos).setY(0).normalize();
    this.vel.addScaledVector(tmp, knock);
    if (this.vitality <= 0) {
      this.vitality = 0;
      this.die();
    } else {
      this.setState('hitstun', HITSTUN_TIME);
    }
  }

  stagger(time = STAGGER_TIME) {
    this.attack = null;
    this.blockHeld = false;
    this.pendingStance = null;
    this.setState('stagger', time);
  }

  shove(from, power) {
    tmp.subVectors(this.pos, from.pos).setY(0).normalize();
    this.vel.addScaledVector(tmp, power);
  }

  die() {
    this.setState('dead');
    this.attack = null;
    this.model.setGlint(0);
  }

  // ----- simulation -----

  update(dt) {
    this.t += dt;
    const opp = this.opponent;

    if (this.blockCooldown > 0) this.blockCooldown -= dt;
    if (this.pendingStance !== null) {
      this.stanceTimer -= dt;
      if (this.stanceTimer <= 0) {
        this.stance = this.pendingStance;
        this.pendingStance = null;
      }
    }

    this.updateState(dt);
    this.updateMovement(dt);
    this.updateBreath(dt);
    this.updateFacing(dt);
    this.updateModel(dt);
  }

  updateState(dt) {
    const a = this.attack;
    switch (this.state) {
      case 'idle':
        if (this.blockHeld && this.blockCooldown <= 0 && this.breath > 0) {
          this.setState('block');
          this.blockTime = 0;
        }
        break;
      case 'block':
        this.blockTime += dt;
        if (!this.blockHeld) {
          this.setState('idle');
          this.blockCooldown = BLOCK_COOLDOWN;
        }
        break;
      case 'windup':
        this.applyLunge(dt, a.windup * 0.55, a.windup);
        if (a.back) this.applyBack(dt, 0, a.windup + a.active);
        if (this.t >= a.windup) {
          this.setState('strike');
          this.game.combat.resolveStrike(this, this.opponent);
        }
        break;
      case 'strike':
        if (a.back) this.applyBack(dt, -a.windup, a.active);
        if (this.t >= a.active) {
          if (this.gassed) { this.becomeWinded(); break; }
          this.setState('recover');
          // a blow that landed recovers quickly: he is reeling, not you
          const base = a.landed ? Math.min(a.recover, 0.36) : a.recover;
          this.stateDuration = base + this.recoverExtra + (a.whiffed ? 0.25 : 0);
          this.recoverExtra = 0;
        }
        break;
      case 'recover':
        if (this.t >= this.stateDuration) {
          const next = a?.followUp;
          this.attack = null;
          this.setState('idle');
          if (next && this.opponent?.alive && !this.gassed) this.startAttack(next);
          else if (this.gassed) this.becomeWinded();
        }
        break;
      case 'dodge': {
        const T = this.stateDuration;
        const k = easeOut(this.t / T) - easeOut((this.t - dt) / T);
        let step = this.dodgeDist * k;
        if (this.dodgeKind === 'step' && this.opponent) {
          // never step through the opponent
          const gap = this.distTo(this.opponent) - (this.def.radius + this.opponent.def.radius + 0.3);
          step = Math.min(step, Math.max(0, gap));
        }
        this.pos.addScaledVector(this.dodgeDir, step);
        if (this.t >= T) {
          if (this.gassed) this.becomeWinded();
          else this.setState('idle');
        }
        break;
      }
      case 'stagger':
      case 'hitstun':
        if (this.t >= this.stateDuration) {
          if (this.gassed) this.becomeWinded();
          else this.setState('idle');
        }
        break;
      case 'winded':
        if (this.t >= this.stateDuration) {
          this.breath = Math.max(this.breath, BREATH.windedRecoverTo);
          this.setState('idle');
        }
        break;
      case 'iaiSheathe':
        if (this.t >= this.stateDuration) this.setState('iaiCharge');
        break;
      case 'iaiCharge':
        this.iaiCharge = Math.min(1, this.iaiCharge + dt / IAI.chargeTime);
        this.breath -= IAI.drain * dt;
        this.regenDelay = BREATH.regenDelay;
        if (this.breath <= 0) { this.breath = 0; this.becomeWinded(); }
        break;
      case 'iaiStrike':
        this.applyLunge(dt, 0, IAI.impactAt);
        if (!a.resolved && this.t >= IAI.impactAt) this.game.combat.resolveStrike(this, this.opponent);
        if (this.t >= IAI.strikeTime) {
          if (this.gassed && !a.whiffed) { this.becomeWinded(); break; }
          this.setState('iaiRecover', a.whiffed ? IAI.missRecover : IAI.hitRecover);
        }
        break;
      case 'iaiRecover':
        if (this.t >= this.stateDuration) {
          this.attack = null;
          if (this.gassed) this.becomeWinded();
          else this.setState('idle');
        }
        break;
      case 'dead':
        this.deathT += dt;
        break;
    }
  }

  applyLunge(dt, from, to) {
    const a = this.attack;
    if (!a || a.lunge <= 0 || !this.opponent) return;
    const span = Math.max(0.0001, to - from);
    const p0 = Math.min(1, Math.max(0, (this.t - dt - from) / span));
    const p1 = Math.min(1, Math.max(0, (this.t - from) / span));
    const step = a.lunge * (easeOut(p1) - easeOut(p0));
    if (step <= 0) return;
    const d = this.distTo(this.opponent);
    const minGap = this.def.radius + this.opponent.def.radius + 0.25;
    const allowed = Math.max(0, d - minGap);
    this.pos.addScaledVector(this.forward(tmp), Math.min(step, allowed));
  }

  // a retreating cut: give ground over the whole swing (t runs from `from` to `to`)
  applyBack(dt, from, to) {
    const a = this.attack;
    const span = Math.max(0.0001, to - from);
    const p0 = Math.min(1, Math.max(0, (this.t - dt - from) / span));
    const p1 = Math.min(1, Math.max(0, (this.t - from) / span));
    this.pos.addScaledVector(this.forward(tmp), -a.back * (easeOut(p1) - easeOut(p0)));
  }

  updateMovement(dt) {
    const opp = this.opponent;
    let speedMul = 0;
    switch (this.state) {
      case 'idle': speedMul = 1; break;
      case 'block': speedMul = 0.45; break;
      case 'iaiCharge': case 'iaiSheathe': speedMul = 0.35; break;
      case 'winded': speedMul = 0.4; break;
      case 'recover': speedMul = 0.25; break;
    }
    this.moving = false;
    let input = this.moveInput;
    // a side cut keeps circling through its windup
    if (this.state === 'windup' && this.attack?.sideDir) {
      speedMul = MOVE_STRIKES.side.circle;
      input = tmpMove.set(this.attack.sideDir, 0);
    }
    if (speedMul > 0 && input.lengthSq() > 0.01) {
      const mv = input.length() > 1 ? input.clone().normalize() : input;
      const speed = this.def.speed * speedMul * (mv.y < 0 ? 0.85 : 1);
      if (opp) {
        // footwork is relative to the opponent: sideways circles him at the same distance,
        // forward and back close or open the gap
        tmp.subVectors(this.pos, opp.pos).setY(0);
        const dist = Math.max(0.5, tmp.length());
        const theta = (mv.x * speed * dt * 0.9) / dist;
        const c = Math.cos(theta), s = Math.sin(theta);
        const x = tmp.x * c + tmp.z * s, z = -tmp.x * s + tmp.z * c;
        tmp.set(x, 0, z);
        tmp.setLength(Math.max(0.1, dist - mv.y * speed * dt));
        this.pos.set(opp.pos.x + tmp.x, 0, opp.pos.z + tmp.z);
      } else {
        const f = this.forward(tmp);
        const r = tmp2.set(-f.z, 0, f.x);
        this.pos.addScaledVector(f, mv.y * speed * dt).addScaledVector(r, mv.x * speed * dt);
      }
      this.moving = true;
    }
    // knockback
    this.pos.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-7 * dt));

    // keep fighters apart and inside the clearing
    if (opp && opp.alive && this.alive) {
      const d = this.distTo(opp);
      const min = this.def.radius + opp.def.radius;
      if (d < min && d > 0.0001) {
        tmp.subVectors(this.pos, opp.pos).setY(0).multiplyScalar((min - d) / d * 0.5);
        this.pos.add(tmp);
      }
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS) this.pos.multiplyScalar(ARENA_RADIUS / r);
    this.pos.y = 0;
  }

  updateBreath(dt) {
    if (this.regenDelay > 0) { this.regenDelay -= dt; return; }
    let rate = 0;
    if (this.state === 'idle') rate = this.moving ? BREATH.regenMove : BREATH.regenIdle;
    else if (this.state === 'block') rate = BREATH.regenBlock;
    else if (this.state === 'winded') rate = 22;
    this.breath = Math.min(BREATH.max, this.breath + rate * dt);
  }

  updateFacing(dt) {
    const opp = this.opponent;
    if (!opp || this.state === 'dead') return;
    const target = Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z);
    let rate = this.def.turnRate;
    if (this.state === 'windup') rate = 3.5;
    else if (this.state === 'strike' || this.state === 'iaiStrike') rate = 0;
    else if (this.state === 'recover' || this.state === 'stagger') rate = 2;
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  windPose(a) {
    return a.move ? movePoses(a.move, a.stance, a.sideDir).wind : this.poses.windup[a.stance];
  }

  endPose(a) {
    return a.move ? movePoses(a.move, a.stance, a.sideDir).end : this.poses.strike[a.stance];
  }

  // Work out the pose for the current state and push it to the model.
  updateModel(dt) {
    const P = this.poses;
    const m = this.model;
    const a = this.attack;
    const s = this.displayStance;
    let target = P.guard[s];
    let rate = 16;
    let glint = 0;

    switch (this.state) {
      case 'block':
        target = P.block[s];
        rate = 30;
        break;
      case 'windup': {
        const wind = a.kind === 'shove' ? P.shoveWindup : this.windPose(a);
        const p = easeOut(this.t / (a.windup * 0.75));
        target = lerpPose(P.guard[a.stance], wind, p, scratchPose);
        rate = 22;
        // the glint swells through the windup and flares just before the strike
        const left = a.windup - this.t;
        glint = Math.min(1, this.t / (a.windup * 0.6)) * 0.7 + (left < 0.18 ? 0.5 : 0);
        break;
      }
      case 'strike': {
        if (a.kind === 'iai') break;
        const wind = a.kind === 'shove' ? P.shoveWindup : this.windPose(a);
        const end = a.kind === 'shove' ? P.shoveStrike : this.endPose(a);
        target = lerpPose(wind, end, easeOut(this.t / a.active), scratchPose);
        rate = Infinity;
        break;
      }
      case 'recover': {
        const end = a ? (a.kind === 'shove' ? P.shoveStrike : a.iai ? P.iaiEnd : this.endPose(a)) : P.guard[s];
        target = lerpPose(end, P.guard[s], easeIn(this.t / Math.max(0.01, this.stateDuration)), scratchPose);
        rate = 20;
        break;
      }
      case 'stagger':
        target = P.stagger;
        rate = 18;
        break;
      case 'hitstun':
        target = lerpPose(P.guard[s], P.stagger, 0.5 * (1 - this.t / this.stateDuration), scratchPose);
        rate = 20;
        break;
      case 'winded':
        target = lerpPose(P.guard[2], P.guard[2], 0, scratchPose);
        target.lean = 0.35;
        target.crouch = 0.12;
        target.hy -= 0.1;
        rate = 6;
        break;
      case 'dodge':
        target = lerpPose(P.guard[s], P.guard[s], 0, scratchPose);
        target.crouch = 0.15;
        target.lean = 0.1;
        rate = 20;
        break;
      case 'iaiSheathe':
        target = P.sheathed;
        rate = 14;
        break;
      case 'iaiCharge':
        target = lerpPose(P.sheathed, P.sheathed, 0, scratchPose);
        target.crouch = 0.14 + this.iaiCharge * 0.12;
        target.lean = 0.12 + this.iaiCharge * 0.1;
        rate = 10;
        break;
      case 'iaiStrike':
        target = lerpPose(P.sheathed, P.iaiEnd, easeOut(this.t / IAI.strikeTime), scratchPose);
        rate = Infinity;
        break;
      case 'iaiRecover':
        target = lerpPose(P.iaiEnd, P.guard[1], easeIn(this.t / this.stateDuration), scratchPose);
        rate = 12;
        break;
      case 'dead':
        break;
    }
    if (a?.kind === 'iai' && this.state === 'strike') target = P.iaiEnd;

    m.apply(target, rate, dt);
    m.setGlint(glint);
    // feet follow how the body actually moved this frame: walking, circling, dodges, lunges
    if (!this.lastPos) this.lastPos = this.pos.clone();
    tmpVel.subVectors(this.pos, this.lastPos).divideScalar(Math.max(dt, 1e-4));
    this.lastPos.copy(this.pos);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const lx = tmpVel.x * cy - tmpVel.z * sy, lz = tmpVel.x * sy + tmpVel.z * cy;
    m.step(dt, this.alive ? lx : 0, this.alive ? lz : 0);

    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    if (this.state === 'dead') {
      // topple
      const k = easeOut(this.deathT / 0.9);
      m.root.rotation.x = -k * 1.45 * this.fallDir;
      m.root.position.y = 0.05 * k;
      m.body.rotation.z = k * 0.3;
    } else {
      // breathing bob, heavier when low on breath
      const heave = (1 - this.breath / BREATH.max) * 0.03 + 0.008;
      m.body.position.y += Math.sin(this.game.time * (3 + (1 - this.breath / BREATH.max) * 5)) * heave;
    }
  }

  get fallDir() { return 1; }
}
