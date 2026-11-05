// Visual effects: red ink blood, ground stains, sparks, and the killing-blow brush stroke.
import * as THREE from 'three';
import { COLORS } from './config.js';
import { flat } from './ink.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.groundY = 0; // height of the duel ground (the Spring map duels on raised spots)
    this.drops = [];
    this.stains = [];
    const dropGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const red = flat(COLORS.red);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(dropGeo, red);
      m.visible = false;
      scene.add(m);
      this.drops.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.sparkGeo = new THREE.PlaneGeometry(0.03, 0.4);
    this.sparks = [];
    const sparkMat = flat(COLORS.ink, { side: THREE.DoubleSide, transparent: true });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(this.sparkGeo, sparkMat.clone());
      m.visible = false;
      scene.add(m);
      this.sparks.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.stainGeo = new THREE.CircleGeometry(1, 12);

    // 2D overlay for brush strokes
    this.canvas = document.getElementById('ink');
    this.ctx = this.canvas.getContext('2d');
    this.strokes = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.dpr = dpr;
  }

  blood(pos, dir, amount = 20) {
    let n = 0;
    for (const d of this.drops) {
      if (d.life > 0) continue;
      d.m.visible = true;
      d.m.position.copy(pos);
      d.v.copy(dir).multiplyScalar(2 + Math.random() * 4);
      d.v.x += (Math.random() - 0.5) * 3;
      d.v.z += (Math.random() - 0.5) * 3;
      d.v.y = 1 + Math.random() * 3.5;
      d.life = 2;
      d.m.scale.setScalar(0.6 + Math.random() * 1.4);
      if (++n >= amount) break;
    }
  }

  stain(x, z, size) {
    const m = new THREE.Mesh(this.stainGeo, flat(COLORS.red, { transparent: true, opacity: 0.85, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, this.groundY + 0.012 + Math.random() * 0.004, z);
    m.scale.set(size, size * (0.5 + Math.random() * 0.6), 1);
    m.rotation.z = Math.random() * 3;
    this.scene.add(m);
    this.stains.push(m);
  }

  spark(pos, amount = 8) {
    let n = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.m.visible = true;
      s.m.position.copy(pos);
      s.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 4);
      s.m.lookAt(pos.clone().add(s.v));
      s.m.rotateX(Math.PI / 2);
      s.life = 0.25;
      if (++n >= amount) break;
    }
  }

  clear() {
    for (const s of this.stains) { this.scene.remove(s); s.material.dispose(); }
    this.stains.length = 0;
    for (const d of this.drops) { d.life = 0; d.m.visible = false; }
    this.strokes.length = 0;
  }

  // A sweeping red brush stroke across the screen for killing blows.
  slash(color = '#b3171d') {
    const w = innerWidth, h = innerHeight;
    const up = Math.random() < 0.5;
    const x0 = w * -0.05, x1 = w * 1.05;
    const y0 = up ? h * (0.68 + Math.random() * 0.1) : h * (0.25 + Math.random() * 0.1);
    const y1 = up ? h * (0.28 + Math.random() * 0.1) : h * (0.65 + Math.random() * 0.1);
    const cx = w * 0.5, cy = (y0 + y1) / 2 + (Math.random() - 0.5) * h * 0.15;
    const pts = [];
    for (let i = 0; i <= 140; i++) {
      const t = i / 140;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      pts.push([x, y, t]);
    }
    const bristles = [];
    for (let i = 0; i < 26; i++) bristles.push({ off: (Math.random() - 0.5) * 2, thick: 0.6 + Math.random() * 0.9, gap: Math.random() < 0.3 ? 0.55 + Math.random() * 0.45 : 2 });
    this.strokes.push({ pts, bristles, age: 0, color, width: Math.min(w, h) * 0.06 });
  }

  // A splash of ink thrown out from a point on screen: the mark of a perfect parry.
  burst(x, y, color = '#161514') {
    const blobs = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      blobs.push({ a, d: 30 + Math.random() * 120, r: 2 + Math.random() * 9, k: 0.6 + Math.random() * 0.4 });
    }
    this.strokes.push({ kind: 'burst', x, y, blobs, age: 0, color });
  }

  update(dt, realDt) {
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 14 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y <= this.groundY + 0.02) {
        if (Math.random() < 0.35) this.stain(d.m.position.x, d.m.position.z, 0.06 + Math.random() * 0.12);
        d.life = 0;
      }
      if (d.life <= 0) d.m.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.material.opacity = Math.max(0, s.life / 0.25);
      if (s.life <= 0) s.m.visible = false;
    }
    this.drawStrokes(realDt);
  }

  drawBurst(g, s) {
    const life = 0.9;
    if (s.age > life) return false;
    const t = Math.min(1, s.age / 0.12);
    const out = 1 - Math.pow(1 - t, 3);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, s.age - 0.35) / (life - 0.35)) * 0.9;
    g.fillStyle = s.color;
    g.strokeStyle = s.color;
    // a ring of ink and flung droplets with trails
    g.lineWidth = 3;
    g.beginPath();
    g.arc(s.x, s.y, 18 + out * 26, 0, Math.PI * 2);
    g.stroke();
    for (const b of s.blobs) {
      const d = b.d * out * b.k;
      const x = s.x + Math.cos(b.a) * d, y = s.y + Math.sin(b.a) * d;
      g.lineWidth = b.r * 0.5;
      g.beginPath();
      g.moveTo(s.x + Math.cos(b.a) * d * 0.55, s.y + Math.sin(b.a) * d * 0.55);
      g.lineTo(x, y);
      g.stroke();
      g.beginPath();
      g.arc(x, y, b.r * (1 - out * 0.3), 0, Math.PI * 2);
      g.fill();
    }
    return true;
  }

  drawStrokes(dt) {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      s.age += dt;
      if (s.kind === 'burst') { if (!this.drawBurst(g, s)) this.strokes.splice(i, 1); continue; }
      const drawT = Math.min(1, s.age / 0.22);
      const alpha = s.age < 1.4 ? 1 : Math.max(0, 1 - (s.age - 1.4) / 0.9);
      if (alpha <= 0) { this.strokes.splice(i, 1); continue; }
      g.globalAlpha = alpha * 0.9;
      g.strokeStyle = s.color;
      g.lineCap = 'round';
      const n = Math.floor(s.pts.length * drawT);
      // each bristle is its own streak; some run dry before the end of the stroke
      for (const b of s.bristles) {
        for (let j = 1; j < n; j++) {
          const [x0, y0, t0] = s.pts[j - 1];
          const [x1, y1, t] = s.pts[j];
          if (t > b.gap) break;
          const taper = Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6;
          const width = s.width * (0.12 + taper);
          g.lineWidth = Math.max(0.6, width * 0.16 * b.thick);
          g.beginPath();
          g.moveTo(x0 + b.off * width * 0.12, y0 + b.off * width * 0.5);
          g.lineTo(x1 + b.off * width * 0.12, y1 + b.off * width * 0.5);
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
  }
}
