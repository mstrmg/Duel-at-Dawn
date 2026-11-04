// Resolves a strike at the moment of impact: miss, evade, parry, block, clash or hit.
import * as THREE from 'three';
import { PARRY_WINDOW, CLASH_WINDOW, BLOCK_COST } from './config.js';

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
    const inArc = angle < a.arc || lateral < def.def.radius * 0.8;
    if (d > a.reach + def.def.radius * 0.5 || !inArc) {
      a.whiffed = true;
      ev.emit('whiff', att, def);
      return 'miss';
    }

    if (def.invulnerable) {
      a.whiffed = true;
      ev.emit('evade', def, att);
      return 'evade';
    }

    const guarded = def.guarding(a.stance) && !a.unblockable;

    // perfect parry: guard raised in the right line just as the blow arrives
    if (guarded && !a.unparryable && def.blockTime <= PARRY_WINDOW) {
      att.stagger();
      att.spend(20);
      def.blockTime = PARRY_WINDOW + 1; // one parry per raise
      def.setState('idle');
      def.blockCooldown = 0;
      ev.emit('parry', def, att);
      return 'parry';
    }

    if (guarded) {
      def.spend(BLOCK_COST[a.weaponKind] ?? 14);
      def.shove(att, a.kind === 'shove' ? 4.5 : 2.2);
      att.recoverExtra = 0.12;
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
      if (left <= CLASH_WINDOW) {
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
    def.takeHit(dmg, att, a.iai ? 6 : 4);
    if (a.iai) att.iaiHit = true;
    ev.emit('hit', def, att, { dmg, wrongGuard, exposed, killed: !def.alive });
    return 'hit';
  }
}
