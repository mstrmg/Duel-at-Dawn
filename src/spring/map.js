// The road map (M): the valley drawn as a scroll in ink, with the roads, the river, every
// stop and every fighter on the way, and where you stand.
import { MAP, roadCurves, riverSamples, RIVER_HW, SHRINE, GATE, heightAt } from './terrain.js';

const ICON = { inn: '宿', teahouse: '茶', dojo: '道', shrine: '社', onsen: '湯', gambler: '賽', great: '桜' };

export class RoadMap {
  constructor(stops) {
    this.el = document.getElementById('map');
    this.canvas = this.el.querySelector('canvas');
    this.stops = stops;
    this.open = false;
    this.base = null;
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.classList.toggle('show', on);
  }

  // The valley is long and narrow, so the scroll is unrolled sideways and read from right
  // to left, as a hand scroll is: the gate at the right, the great shrine at the left.
  // North points left and east points up (the world turned a quarter, not mirrored).
  fit() {
    const span = MAP.z1 - MAP.z0, across = MAP.x1 - MAP.x0 - 30;
    const W = Math.round(Math.min(innerWidth * 0.92, (innerHeight * 0.8 * span) / across, 1500));
    const H = Math.round((W * across) / span);
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== W * dpr || this.canvas.height !== H * dpr) {
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.canvas.style.width = `${W}px`;
      this.canvas.style.height = `${H}px`;
      this.base = null;
    }
    this.k = (W * dpr) / span;
    this.dpr = dpr;
    return [W * dpr, H * dpr];
  }
  px(x, z) { return [(z - MAP.z0) * this.k, (MAP.x1 - 15 - x) * this.k]; }

  drawBase() {
    const [W, H] = this.fit();
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // the hills: hachures, short pen strokes along the contour, thicker where the ground is steep
    g.strokeStyle = '#161514';
    const step = 3.2;
    for (let x = MAP.x0 + 15; x < MAP.x1 - 15; x += step) {
      for (let z = MAP.z0; z < MAP.z1; z += step) {
        const jx = x + ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * 1.2;
        const jz = z + ((Math.sin(x * 39.346 + z * 11.135) * 24634.6345) % 1) * 1.2;
        const gx = (heightAt(jx + 1, jz) - heightAt(jx - 1, jz)) / 2;
        const gz = (heightAt(jx, jz + 1) - heightAt(jx, jz - 1)) / 2;
        const slope = Math.hypot(gx, gz);
        if (slope < 0.22) continue;
        const a = Math.min(1, (slope - 0.22) * 1.6);
        const len = (0.8 + a * 1.2) * step * 0.5;
        const cx = -gz / slope, cz = gx / slope; // along the contour
        const [x0, y0] = this.px(jx - cx * len, jz - cz * len);
        const [x1, y1] = this.px(jx + cx * len, jz + cz * len);
        g.globalAlpha = 0.24 + a * 0.5;
        g.lineWidth = (0.6 + a * 0.8) * this.dpr;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // the river: a pale wash between two ink banks
    const river = (w, style) => {
      g.strokeStyle = style;
      g.lineWidth = w * this.k;
      g.beginPath();
      riverSamples.forEach((o, i) => { const [x, y] = this.px(o.x, o.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    };
    river((RIVER_HW + 1) * 2 + 1.2, 'rgba(22,21,20,0.75)');
    river((RIVER_HW + 1) * 2, '#d6d8d0');
    // roads: a doubled pen line, the main road heavier
    roadCurves.forEach((r, i) => {
      const pts = r.curve.getSpacedPoints(Math.ceil(r.curve.getLength() / 2)).map((p) => this.px(p.x, p.z));
      for (const [w, style] of [[(i ? 2.4 : 3.6) * this.dpr, '#161514'], [(i ? 1.0 : 1.8) * this.dpr, '#e9e2d0']]) {
        g.strokeStyle = style;
        g.lineWidth = w;
        if (i === 1 && w > 2) g.setLineDash([4 * this.dpr, 3 * this.dpr]); else g.setLineDash([]);
        g.beginPath();
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    });
    g.setLineDash([]);
    // the gate and the great shrine
    const [gx, gy] = this.px(GATE.x, GATE.z);
    g.fillStyle = '#161514';
    g.fillRect(gx - 1.5 * this.dpr, gy - 6 * this.dpr, 3 * this.dpr, 12 * this.dpr);
    const [sx, sy] = this.px(SHRINE.x, SHRINE.z);
    g.strokeStyle = '#b3171d';
    g.lineWidth = 2 * this.dpr;
    g.beginPath();
    g.arc(sx, sy, SHRINE.r * this.k, 0, Math.PI * 2);
    g.stroke();
    this.base = c;
  }

  // foes: [{ x, z, beaten, elite }]; you: { x, z, yaw }
  draw(you, foes) {
    if (!this.open) return;
    if (!this.base) this.drawBase();
    this.fit();
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.base, 0, 0);
    const d = this.dpr;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // stops: their character in a paper seal
    for (const s of this.stops) {
      const [x, y] = this.px(s.x, s.z);
      g.fillStyle = '#e9e2d0';
      g.strokeStyle = s.kind === 'great' ? '#b3171d' : '#161514';
      g.lineWidth = 1.6 * d;
      g.beginPath();
      g.rect(x - 9 * d, y - 9 * d, 18 * d, 18 * d);
      g.fill();
      g.stroke();
      g.fillStyle = s.kind === 'great' ? '#b3171d' : '#161514';
      g.font = `800 ${12 * d}px "Shippori Mincho", serif`;
      g.fillText(ICON[s.kind] ?? '・', x, y + 0.5 * d);
    }
    // fighters: a red slash waiting, an ink cross once beaten
    for (const f of foes) {
      const [x, y] = this.px(f.x, f.z);
      g.lineWidth = (f.elite ? 3.2 : 2.4) * d;
      g.strokeStyle = f.beaten ? 'rgba(22,21,20,0.55)' : '#b3171d';
      const r = (f.elite ? 7 : 5.5) * d;
      g.beginPath();
      g.moveTo(x - r, y - r); g.lineTo(x + r, y + r);
      if (f.beaten || f.elite) { g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); }
      g.stroke();
    }
    // you: an ink arrowhead pointing the way you face
    const [x, y] = this.px(you.x, you.z);
    // facing (sin yaw, cos yaw) in x, z turns into (cos yaw, -sin yaw) on the scroll
    const fx = Math.cos(you.yaw), fy = -Math.sin(you.yaw), r = 8 * d;
    g.fillStyle = '#161514';
    g.beginPath();
    g.moveTo(x + fx * r, y + fy * r);
    g.lineTo(x - fx * r * 0.6 - fy * r * 0.55, y - fy * r * 0.6 + fx * r * 0.55);
    g.lineTo(x - fx * r * 0.6 + fy * r * 0.55, y - fy * r * 0.6 - fx * r * 0.55);
    g.closePath();
    g.fill();
    g.strokeStyle = '#e9e2d0';
    g.lineWidth = 1.2 * d;
    g.stroke();
  }
}
