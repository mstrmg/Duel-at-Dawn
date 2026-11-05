// Resolves a strike at the moment of impact: miss, evade, parry, block, clash or hit.
import * as THREE from 'three';
import { PARRY_WINDOW, CLASH_WINDOW, BLOCK_COST, BREATH } from './config.js';
import { woundFor } from './wounds.js';

const tmp = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
  }

  resolveStrike(att, def) {
    const a = att.attack;
    if (!a || a.resolved || !def || !def.alive) return;
    a.resolved = true;
    const ev = this.game.events;

    // range and arc: the attacker stops turning during the swing, so stepping aside works
    const d = att.distTo(def);
    tmp.subVectors(def.pos, att.pos).setY(0).normalize();
    const f = att.forward(new THREE.Vector3());
    const angle = Math.acos(Math.max(-1, Math.min(1, f.dot(tmp))));
    const lateral = Math.sin(angle) * d;
    // a side cut sweeps after a sideways evade and catches it
    const sweeping = a.move === 'side' && def.dodgeLateral && this.game.time - (def.dodgeAt ?? -9) < 0.5;
    const inArc = sweeping || angle < a.arc || lateral < def.def.radius * 0.8;
    if (d > a.reach + def.def.radius * 0.5 + (sweeping ? 1.3 : 0) || !inArc) {
      a.whiffed = true;
      // evaded out of his reach as the blow fell: Slip Inside, if he knows it
      if (def.state === 'dodge' && def.dodgeKind === 'evade') def.slipUntil = this.game.time + 0.9;
      ev.emit('whiff', att, def);
      return 'miss';
    }

    // a side cut sweeps wide enough to catch a sideways evade
    if (def.invulnerable && !sweeping) {
      a.whiffed = true;
      def.slipUntil = this.game.time + 0.9; // Slip Inside, if he knows it
      ev.emit('evade', def, att);
      return 'evade';
    }

    const guarded = def.guarding(a.stance) && !a.unblockable;

    // perfect parry: guard raised in the right line just as the blow arrives
    if (guarded && !a.unparryable && def.blockTime <= PARRY_WINDOW * (def.def.parryWindow ?? 1)) {
      att.stagger();
      att.spend(20);
      if (def.def.parryBreath) def.breath = Math.min(BREATH.max, def.breath + def.def.parryBreath); // a blessing
      def.blockTime = PARRY_WINDOW + 1; // one parry per raise
      def.setState('idle');
      def.blockCooldown = 0;
      ev.emit('parry', def, att);
      return 'parry';
    }

    if (guarded) {
      def.spend((BLOCK_COST[a.weaponKind] ?? 14) * (def.def.blockCost ?? 1));
      def.shove(att, a.kind === 'shove' ? 4.5 : 2.2);
      def.answerUntil = this.game.time + 0.45; // the Answering Blade, if he knows it
      // a blocked lunge has thrown its weight forward and takes longer to recover
      att.recoverExtra = a.move === 'lunge' ? 0.32 : 0.12;
      if (def.gassed) {
        def.becomeWinded();
        ev.emit('guardbreak', def, att);
      } else {
        ev.emit('block', def, att);
      }
      return 'block';
    }

    // both blades in the air at once
    if (def.state === 'windup' && def.attack && !a.iai) {
      const left = def.attack.windup - def.t;
      const cutter = att.has('kiriotoshi') ? att : def.has('kiriotoshi') ? def : null;
      if (left <= CLASH_WINDOW * (cutter ? 1.8 : 1) && a.stance === def.attack.stance && cutter === att) {
        // Cutting Down: his blade is cut aside and yours goes on to land
        def.attack = null;
        def.stagger(0.6);
        ev.emit('cutdown', att, def);
      } else if (left <= CLASH_WINDOW * (cutter ? 1.8 : 1) && a.stance === def.attack.stance && cutter === def) {
        // Cutting Down from the other side: his blade is cut aside and he reels
        a.whiffed = true;
        att.attack = null;
        att.stagger(0.6);
        ev.emit('cutdown', def, att);
        return 'cutdown';
      } else if (left <= CLASH_WINDOW) {
        // blades in the same line meet; in different lines, the first to land wins
        if (a.stance === def.attack.stance) {
          att.attack.whiffed = false;
          att.setState('recover', 0);
          att.stateDuration = 0.35;
          def.attack = null;
          def.setState('recover');
          def.stateDuration = 0.35;
          att.spend(12);
          def.spend(12);
          att.shove(def, 3);
          def.shove(att, 3);
          ev.emit('clash', att, def);
          return 'clash';
        }
      }
    }

    if (a.kind === 'shove') {
      def.shove(att, 5);
      def.spend(16);
      if (def.state === 'windup' || def.state === 'iaiCharge' || def.state === 'iaiSheathe') {
        def.attack = null;
        def.setState('hitstun', 0.35);
      }
      if (def.gassed) def.becomeWinded();
      ev.emit('shoved', def, att);
      return 'shove';
    }

    const wrongGuard = def.state === 'block';
    let dmg = a.damage + (def.vulnerable ? 1 : 0);
    const exposed = def.vulnerable;
    const caught = sweeping;
    const wound = woundFor(a);
    const took = def.takeHit(dmg, att, a.iai ? 6 : 4, wound);
    a.landed = true;
    if (!took) return 'spared'; // the Blessing of the Petal
    if (a.iai) att.iaiHit = true;
    ev.emit('hit', def, att, { dmg, wrongGuard, exposed, killed: !def.alive, move: a.move, caught, wounds: def.wounds.slice(-dmg) });
    return 'hit';
  }
}
