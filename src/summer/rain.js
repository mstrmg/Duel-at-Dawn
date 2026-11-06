// The rainy season. Showers come and go as you walk: rain drawn as slanting ink strokes in a
// box that follows the camera, rings opening on the puddles, the paddies and the river where
// drops land, mist closing in while it pours, a hiss that rises and falls with it, and now
// and then a flash of lightning that leaves the valley white for a beat, then thunder.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { noEdges, flat, seeded } from '../ink.js';
import { heightAt, roadCurves, roadAt, paddyAt, riverAt, waterLevelAt, waterAt, RIVER_HW, inMap } from './terrain.js';

const rand = seeded(4242);
const rr = (a, b) => a + rand() * (b - a);
const BOX = 34; // the rain falls in a box this wide around the camera
const TOP = 16;

// Puddles: shallow pools of rainwater in the ruts and hollows of the roads, darker than the
// dirt, with an ink rim on the side the light falls from.
export const PUDDLES = [];
export function buildPuddles(scene) {
  for (const rc of roadCurves) {
    const len = rc.curve.getLength();
    for (let s = 2; s < len - 2; s += rr(4, 11)) {
      if (rand() < 0.35) continue;
      const t = s / len, p = rc.curve.getPointAt(t), tan = rc.curve.getTangentAt(t);
      const off = rr(-0.3, 0.3) * rc.w;
      const x = p.x - tan.z * off, z = p.z + tan.x * off;
      if (waterAt(x, z) > 0.05 || !inMap(x, z, 4)) continue;
      PUDDLES.push({ x, z, rx: rr(0.5, 1.5) * (rc.w > 3 ? 1 : 0.7), rz: rr(0.35, 0.8), ry: Math.atan2(tan.x, tan.z) + rr(-0.4, 0.4) });
    }
  }
  const geo = new THREE.CircleGeometry(1, 18);
  geo.rotateX(-Math.PI / 2);
  // a wobbly rim, so no two puddles have the same edge
  const pos = geo.attributes.position;
  for (let i = 1; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = 1 + Math.sin(a * 3) * 0.12 + Math.sin(a * 5 + 1) * 0.07;
    pos.setXYZ(i, pos.getX(i) * k, 0, pos.getZ(i) * k);
  }
  const rim = new THREE.RingGeometry(0.93, 1.0, 18, 1, 0.4, 2.6);
  rim.rotateX(-Math.PI / 2);
  const water = new THREE.InstancedMesh(geo, flat(0xcfcdc2, { polygonOffset: true, polygonOffsetFactor: -2 }), PUDDLES.length);
  const edge = new THREE.InstancedMesh(rim, flat(COLORS.ink, { polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }), PUDDLES.length);
  const d = new THREE.Object3D();
  PUDDLES.forEach((p, i) => {
    // sit at the lowest ground under it, so the slope of the road never pokes through
    let y = Infinity;
    for (let a = 0; a < 6.28; a += 1.05) y = Math.min(y, heightAt(p.x + Math.cos(a) * p.rx * 0.7, p.z + Math.sin(a) * p.rz * 0.7));
    p.y = Math.min(y, heightAt(p.x, p.z)) + 0.035;
    d.position.set(p.x, p.y, p.z);
    d.rotation.set(0, p.ry, 0);
    d.scale.set(p.rx, 1, p.rz);
    d.updateMatrix();
    water.setMatrixAt(i, d.matrix);
    d.position.y += 0.004;
    d.updateMatrix();
    edge.setMatrixAt(i, d.matrix);
  });
  for (const m of [water, edge]) { m.computeBoundingSphere(); scene.add(m); noEdges.add(m); }
}

// how hard it is raining at time t (0 dry .. 1 a downpour): showers a couple of minutes
// apart, a drizzle between them, and now and then a dry spell
export function rainAt(t) {
  const w = 0.5 + 0.38 * Math.sin(t * 0.045 + 0.6) + 0.22 * Math.sin(t * 0.117 + 2.1) + 0.1 * Math.sin(t * 0.31);
  return THREE.MathUtils.clamp(w, 0, 1);
}

export class Rain {
  constructor(scene, sound, n = 2600) {
    this.scene = scene;
    this.sound = sound;
    this.n = n;
    // a drop: a thin tapered stroke, a little longer than it is fast
    const g = new THREE.PlaneGeometry(0.014, 0.75);
    g.translate(0, 0.375, 0);
    const g2 = g.clone();
    g2.rotateY(Math.PI / 2);
    const both = new THREE.BufferGeometry();
    both.setAttribute('position', new THREE.Float32BufferAttribute([...g.toNonIndexed().attributes.position.array, ...g2.toNonIndexed().attributes.position.array], 3));
    this.mat = flat(COLORS.ink, { transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(both, this.mat, n);
    this.mesh.frustumCulled = false;
    this.drops = [];
    for (let i = 0; i < n; i++) this.drops.push({ x: rr(-BOX / 2, BOX / 2), y: rr(0, TOP), z: rr(-BOX / 2, BOX / 2), v: rr(13, 17), s: rr(0.7, 1.3) });
    scene.add(this.mesh);
    noEdges.add(this.mesh);
    // rings where drops land: on the ground they are small and quick, on water wider
    const ring = new THREE.RingGeometry(0.86, 1, 20);
    ring.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(ring, flat(0xffffff, { side: THREE.DoubleSide, depthWrite: false }), 260);
    this.ringMesh.frustumCulled = false;
    this.rings = Array.from({ length: 260 }, () => ({ t: 1, life: 0.5, x: 0, y: -999, z: 0, r: 0.2 }));
    this.ringNext = 0;
    scene.add(this.ringMesh);
    noEdges.add(this.ringMesh);
    this.d = new THREE.Object3D();
    this.c = new THREE.Color();
    this.ink = new THREE.Color(COLORS.ink);
    this.paper = new THREE.Color(COLORS.paper);
    this.k = rainAt(0);
    this.gust = 0; // the cutscene's last shot whips the rain sideways
    this.flash = document.getElementById('flash');
    this.flashT = 99;
    this.nextBolt = 25;
    this.time = 0;
  }

  // the hiss of the rain: filtered noise whose loudness follows the shower
  startSound() {
    const S = this.sound;
    if (this.hiss || !S.ctx) return;
    const c = S.ctx;
    const src = c.createBufferSource();
    src.buffer = S.noise;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.hiss = c.createGain();
    this.hiss.gain.value = 0;
    src.connect(hp).connect(lp).connect(this.hiss).connect(S.master);
    src.start();
  }

  thunder(delay) {
    const S = this.sound;
    if (!S.ctx) return;
    S.noiseBurst({ type: 'lowpass', freq: 140, gain: 0.55, dur: 2.6, sweepTo: 60, delay });
    S.tone(38, 0.35, 2.2, 'sine', delay + 0.1);
  }

  // fog: the paper mist closes in while it pours
  update(dt, cam, fog, active = true) {
    this.time += dt;
    const want = active ? rainAt(this.time) : this.k;
    this.k += (want - this.k) * Math.min(1, dt * 0.5);
    const k = this.k;
    if (fog) {
      fog.near = THREE.MathUtils.lerp(32, 14, k);
      fog.far = THREE.MathUtils.lerp(150, 82, k);
    }
    this.startSound();
    if (this.hiss) this.hiss.gain.value = 0.02 + k * 0.11;

    // the drops: only as many as the shower calls for are drawn
    const shown = Math.round(this.n * Math.max(0, (k - 0.08) / 0.92));
    const wind = 1.6 + this.gust * 9 + Math.sin(this.time * 0.3) * 0.6;
    const slant = Math.atan2(wind, 15);
    const d = this.d;
    this.mat.opacity = 0.18 + k * 0.32;
    for (let i = 0; i < shown; i++) {
      const p = this.drops[i];
      p.y -= p.v * dt;
      p.x += wind * dt;
      const wx = cam.x + ((((p.x - cam.x) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
      const wz = cam.z + ((((p.z - cam.z) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
      const ground = heightAt(wx, wz);
      if (p.y < -1) {
        p.y = TOP + rr(0, 3);
        // where it landed, a ring opens (only near the camera, where they can be seen)
        if (Math.abs(wx - cam.x) < 14 && Math.abs(wz - cam.z) < 14 && rand() < 0.5) this.splash(wx, wz);
      }
      d.position.set(wx, ground + p.y, wz);
      d.rotation.set(0, 0, -slant);
      d.scale.set(1, p.s, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.count = shown;
    this.mesh.instanceMatrix.needsUpdate = true;

    // rings spread and fade into the paper
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.t += dt / r.life;
      const s = r.t < 1 ? r.r * (0.2 + r.t) : 0.0001;
      d.position.set(r.x, r.y, r.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(s, 1, s);
      d.updateMatrix();
      this.ringMesh.setMatrixAt(i, d.matrix);
      this.ringMesh.setColorAt(i, this.c.copy(this.ink).lerp(this.paper, Math.min(1, r.t * r.t)));
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;

    // lightning, only in a real downpour: a white flash, and thunder a few seconds after
    this.flashT += dt;
    if (active && k > 0.72) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rr(14, 40);
        this.flashT = 0;
        this.thunder(rr(0.8, 2.6));
      }
    }
    if (this.flash) {
      const f = this.flashT;
      // a double flicker, then gone
      const a = f < 0.07 ? 0.85 : f < 0.14 ? 0.15 : f < 0.22 ? 0.7 : Math.max(0, 0.7 - (f - 0.22) * 3);
      this.flash.style.opacity = a.toFixed(3);
    }
  }

  // a ring where a drop lands: on a puddle, a paddy, the river or the pond it is wider
  splash(x, z) {
    let y = heightAt(x, z) + 0.03, r = 0.09;
    const paddy = paddyAt(x, z);
    const river = riverAt(x, z);
    if (paddy) { y = paddy.y + 0.02; r = 0.22; }
    else if (river && river.d < RIVER_HW + 0.5) { y = river.level + 0.02; r = 0.24; }
    else if (waterAt(x, z) > 0.5) { y = waterLevelAt(x, z) + 0.02; r = 0.22; }
    else {
      const p = PUDDLES.find((o) => Math.abs(o.x - x) < o.rx && Math.abs(o.z - z) < o.rx);
      if (p) { y = p.y + 0.01; r = 0.16; }
      else if (roadAt(x, z) < 0.3 && rand() < 0.7) return; // in the grass a drop leaves nothing to see
    }
    const g = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    Object.assign(g, { t: 0, life: rr(0.35, 0.6), x, y, z, r: r * rr(0.8, 1.3) });
  }
}
