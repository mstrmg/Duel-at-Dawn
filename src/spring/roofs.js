// Roofs, built as one surface instead of tilted boxes. One shape covers the three roofs of
// the valley:
//   kirizuma (gable): two slopes meeting at the ridge, the ends closed by gable walls
//   yosemune (hip): four slopes, a short ridge
//   irimoya (hip-and-gable): hipped below, with a small gable standing on top at each end
// The slopes sag (sori: steep at the ridge, flat at the eaves), the corners can turn up, and
// tiled roofs get raised rows of tiles from eave to ridge, which the ink pass draws as lines.
//
// Local frame: the ridge runs along x at height h, the long eaves are at z = ±Bz, y = 0,
// and the ends at x = ±A. The roof is a geometry to hand to the Batcher with a matrix.
import * as THREE from 'three';

const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();

class Mesher {
  constructor() { this.pos = []; }
  // a triangle, wound so that its normal agrees with `want` (flipped if not)
  tri(p, q, r, want) {
    a.subVectors(q, p);
    b.subVectors(r, p);
    n.crossVectors(a, b);
    if (want && n.dot(want) < 0) [q, r] = [r, q];
    this.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  }
  quad(p, q, r, s, want) { this.tri(p, q, r, want); this.tri(p, r, s, want); }
  // both faces, for thin walls
  both(p, q, r) { this.pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z, p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals(); // non-indexed: one flat normal per face
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UPV = V(0, 1, 0), DOWNV = V(0, -1, 0);

/**
 * A roof.
 *  A, Bz   half length and half depth at the eaves (overhang included)
 *  h       ridge height above the eaves
 *  xh      half length of the ridge (A for a gable roof, small for a hip)
 *  t0      how far up the slope the hipped ends reach: 0 gable, 1 hip, between: irimoya
 *  thick   thickness of the roof (thatch is thick, tiles thin)
 *  curve   sag of the slope (0 straight)
 *  lift    how far the eave corners turn up
 *  ribs    spacing of the raised tile rows (0 for none), rib: their height
 */
export function roofGeometry({ A, Bz, h, xh = A, t0 = 0, thick = 0.2, curve = 0.6, lift = 0, ribs = 0, rib = 0.06, rows = 9 }) {
  const M = new Mesher();
  const f = (t) => h * ((1 - curve) * t + curve * t * t);
  const X = (t) => (t0 > 0 && t < t0 ? A + (xh - A) * (t / t0) : xh);
  const up = (u, t) => lift * u ** 4 * (1 - t) ** 2;
  const cols = ribs ? Math.max(4, 2 * Math.round(A / ribs)) : 8;
  const ts = Array.from({ length: rows + 1 }, (_, i) => i / rows);
  if (t0 > 0 && t0 < 1) { ts.push(t0); ts.sort((p, q) => p - q); }
  const us = Array.from({ length: cols + 1 }, (_, i) => -1 + (2 * i) / cols);
  const ribAt = (i) => (ribs && i % 2 === 1 ? rib : 0);

  // the long slopes, top and underside, and the eave edge between them
  for (const s of [-1, 1]) {
    const P = (u, t, k, under) => V(u * X(t), f(t) + up(u, t) + (under ? -thick : ribAt(k)), s * Bz * (1 - t));
    for (let j = 0; j < ts.length - 1; j++) {
      for (let i = 0; i < cols; i++) {
        const [u0, u1, ta, tb] = [us[i], us[i + 1], ts[j], ts[j + 1]];
        M.quad(P(u0, ta, i), P(u1, ta, i + 1), P(u1, tb, i + 1), P(u0, tb, i), UPV);
        M.quad(P(u0, ta, 0, 1), P(u1, ta, 0, 1), P(u1, tb, 0, 1), P(u0, tb, 0, 1), DOWNV);
      }
    }
    const out = V(0, 0, s);
    for (let i = 0; i < cols; i++) M.quad(P(us[i], 0, i), P(us[i + 1], 0, i + 1), P(us[i + 1], 0, 0, 1), P(us[i], 0, 0, 1), out);
    // the barge boards up the gable edge, where the slope runs past the hipped part
    for (const u of [-1, 1]) {
      const side = V(u, 0, 0);
      for (let j = 0; j < ts.length - 1; j++) {
        if (ts[j] < t0 - 1e-6) continue;
        const k = u < 0 ? 0 : cols;
        M.quad(P(u, ts[j], k), P(u, ts[j + 1], k), P(u, ts[j + 1], 0, 1), P(u, ts[j], 0, 1), side);
      }
    }
  }
  // the hipped ends, up to t0
  if (t0 > 0) {
    const tsE = ts.filter((t) => t <= t0 + 1e-6);
    const colsE = 8;
    const uE = Array.from({ length: colsE + 1 }, (_, i) => -1 + (2 * i) / colsE);
    for (const s of [-1, 1]) {
      const R = (t) => A + (xh - A) * (t / t0);
      const P = (u, t, under) => V(s * R(t), f(t) + up(u, t) - (under ? thick : 0), u * Bz * (1 - t));
      for (let j = 0; j < tsE.length - 1; j++) {
        for (let i = 0; i < colsE; i++) {
          const [u0, u1, ta, tb] = [uE[i], uE[i + 1], tsE[j], tsE[j + 1]];
          M.quad(P(u0, ta), P(u1, ta), P(u1, tb), P(u0, tb), UPV);
          M.quad(P(u0, ta, 1), P(u1, ta, 1), P(u1, tb, 1), P(u0, tb, 1), DOWNV);
        }
      }
      const out = V(s, 0, 0);
      for (let i = 0; i < colsE; i++) M.quad(P(uE[i], 0), P(uE[i + 1], 0), P(uE[i + 1], 0, 1), P(uE[i], 0, 1), out);
      if (t0 < 1) {
        // the flat top edge of the hip, where the gable stands on it
        for (let i = 0; i < colsE; i++) M.quad(P(uE[i], t0), P(uE[i + 1], t0), P(uE[i + 1], t0, 1), P(uE[i], t0, 1), UPV);
      }
    }
  }
  return M.geometry();
}

/**
 * The gable wall closing the end of a roof: a flat triangle at x (local), from yBase up to
 * just under the slopes of a roof made with the same Bz, h and curve.
 */
export function gableGeometry({ Bz, h, curve = 0.6, thick = 0.2, yBase = 0, x = 0, steps = 10 }) {
  const M = new Mesher();
  const f = (t) => h * ((1 - curve) * t + curve * t * t);
  // where the slope's underside comes down to yBase
  let tb = 0;
  for (let k = 0; k <= 200; k++) { if (f(k / 200) - thick >= yBase) { tb = k / 200; break; } }
  const zs = [];
  for (let i = 0; i <= steps; i++) zs.push(Bz * (1 - tb) * (1 - i / steps)); // from the base corner to the ridge
  for (const s of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const y0 = Math.max(yBase, f(1 - z0 / Bz) - thick), y1 = Math.max(yBase, f(1 - z1 / Bz) - thick);
      M.both(V(x, yBase, s * z0), V(x, yBase, s * z1), V(x, y1, s * z1));
      M.both(V(x, yBase, s * z0), V(x, y1, s * z1), V(x, y0, s * z0));
    }
  }
  return M.geometry();
}

// the height of a roof's top surface at fraction t up the slope (for placing ridge caps)
export const roofHeight = (h, curve, t) => h * ((1 - curve) * t + curve * t * t);
