// The cutscene before a duel on the road: letterbox bars, a few held shots like a
// samurai film (the wide standoff, his face, your hand on the hilt, the wind at their
// feet), then the camera settles behind your shoulder and the duel begins.
import * as THREE from 'three';
import { POSES, lerpPose } from '../models.js';

export const DUEL_GAP = 9; // how far apart the two stand when the duel begins (as in the clearing)

const v = () => new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);

// Square the two up on the duel spot: he holds the far side, you the near side, along
// the way you came. Returns the axis (u: from him toward you), its side vector and the middle.
export function squareUp(host, foe) {
  const { spot, f } = foe;
  const p = host.fighter;
  const u = v().set(host.pos.x - spot.x, 0, host.pos.z - spot.z);
  if (u.lengthSq() < 1e-4) u.set(0, 0, 1);
  u.normalize();
  const mid = v().set(spot.x, spot.y, spot.z);
  p.pos.copy(mid).addScaledVector(u, DUEL_GAP / 2);
  f.pos.copy(mid).addScaledVector(u, -DUEL_GAP / 2);
  p.yaw = Math.atan2(-u.x, -u.z);
  f.yaw = Math.atan2(u.x, u.z);
  p.lastPos = p.pos.clone();
  f.lastPos = f.pos.clone();
  return { u, side: v().set(-u.z, 0, u.x), mid };
}

export class DuelCutscene {
  // host: the Spring map (camera, fighter, sound, petals, pen); foe: { f, spot }
  constructor(host, foe) {
    this.host = host;
    this.foe = foe;
    this.t = 0;
    this.drawn = false;
    this.done = false;
    const p = host.fighter, f = foe.f;
    Object.assign(this, squareUp(host, foe));
    this.pose = lerpPose(POSES.katana.sheathed, POSES.katana.sheathed, 0);
    this.pose.lean = 0.02;
    this.pose.crouch = 0;

    const M = this.mid, S = this.side, U = this.u;
    const up = (y) => v().set(0, y, 0);
    const P = p.pos.clone(), F = f.pos.clone();
    // each shot: start and end camera positions and look targets, and the title it shows
    this.shots = [
      { dur: 1.9, from: M.clone().add(S.clone().multiplyScalar(12)).add(up(1.3)).addScaledVector(U, 1.5),
        to: M.clone().add(S.clone().multiplyScalar(11)).add(up(1.5)).addScaledVector(U, -1.0),
        look: M.clone().add(up(1.2)), focus: null, text: 'name' },
      { dur: 1.7, from: F.clone().addScaledVector(U, 2.4).addScaledVector(S, 0.7).add(up(1.55)),
        to: F.clone().addScaledVector(U, 1.75).addScaledVector(S, 0.55).add(up(1.62)),
        look: F.clone().add(up(1.55)), focus: F.clone().add(up(1.3)), text: 'title' },
      { dur: 1.7, from: P.clone().addScaledVector(U, -2.3).addScaledVector(S, -0.7).add(up(1.35)),
        to: P.clone().addScaledVector(U, -1.7).addScaledVector(S, -0.5).add(up(1.25)),
        look: P.clone().add(up(1.15)), focus: P.clone().add(up(1.1)), text: 'draw', drawAt: 0.55 },
      { dur: 1.4, from: F.clone().addScaledVector(U, -1.8).addScaledVector(S, 1.4).add(up(0.35)),
        to: F.clone().addScaledVector(U, -1.2).addScaledVector(S, 1.1).add(up(0.45)),
        look: P.clone().add(up(0.9)), focus: null, text: '', gust: true },
    ];
    this.total = this.shots.reduce((a, s) => a + s.dur, 0);
    this.shot = -1;

    this.bars = document.getElementById('bars');
    this.title = document.getElementById('cut-title');
    this.bars.classList.add('show');
    host.sound.whoosh();
  }

  skip() { this.t = this.total; }

  update(dt) {
    const h = this.host, p = h.fighter, f = this.foe.f;
    this.t += dt;
    // which shot, and how far through it
    let t = this.t, i = 0;
    while (i < this.shots.length - 1 && t > this.shots[i].dur) { t -= this.shots[i].dur; i++; }
    const s = this.shots[i];
    const k = ease(Math.min(1, t / s.dur));
    if (i !== this.shot) this.enterShot(i);
    h.camera.position.lerpVectors(s.from, s.to, k);
    h.camera.lookAt(s.look);
    h.cutFocus = s.focus;

    // the wanderer's hand goes to the hilt, then the blade comes out on your close-up
    if (s.drawAt != null && !this.drawn && t / s.dur > s.drawAt) {
      this.drawn = true;
      h.sound.sheathe();
      h.sound.ring(0.5, 1.4);
    }
    const target = this.drawn ? POSES.katana.guard[0] : this.pose;
    p.model.apply(target, this.drawn ? 9 : 12, dt);
    p.model.step(dt, 0, 0);
    p.model.root.position.copy(p.pos);
    p.model.root.rotation.set(0, p.yaw, 0);
    f.updateModel(dt);

    h.petals.gust = s.gust ? Math.min(1, t / 0.4) : Math.max(0, (h.petals.gust || 0) - dt * 2);
    if (this.t >= this.total) this.finish();
    return this.done;
  }

  enterShot(i) {
    this.shot = i;
    const s = this.shots[i], d = this.foe.f.def;
    const html = s.text === 'name' ? `<b>${d.name}</b>`
      : s.text === 'title' ? `<span>${d.title}</span>`
      : s.text === 'draw' ? '<span>the wanderer draws</span>' : '';
    this.title.innerHTML = html;
    this.title.classList.toggle('show', !!html);
    if (s.gust) this.host.sound.whoosh();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.bars.classList.remove('show');
    this.title.classList.remove('show');
    this.host.petals.gust = 0;
    this.host.cutFocus = null;
  }
}
