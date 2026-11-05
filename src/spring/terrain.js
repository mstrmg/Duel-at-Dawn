// Spring terrain: the valley floor, its roads, the river and the level pads that duels
// and buildings stand on. Roads are baked into a mask texture the ground shader draws as
// stippled dirt with a pen-drawn verge; the river is a distance field (exact banks, and the
// water level along its course) that carves the channel and that water.js draws on.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { LIGHT_DIR } from '../ink.js';
import { MAP, ROADS, roadCurves, riverCurve, mainRoad, tAtZ, beside, DUEL_PLAN, STOP_PLAN, AMBUSH_PLAN, SHRINE, GATE, FALLS } from './layout.js';

export { MAP, roadCurves, riverCurve, mainRoad, SHRINE, GATE };
export const streamCurve = riverCurve;
export const MAP_W = MAP.x1 - MAP.x0, MAP_H = MAP.z1 - MAP.z0;
const PAD = 110; // the ground mesh runs past the map under the mist
const PX = 4; // mask pixels per meter

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- the shape of the land ----------

// rolling meadows on the valley floor, hills for walls, and the long climb north to the shrine
function baseHeight(x, z) {
  return (
    Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027) * 1.8 +
    Math.sin(x * 0.072 + z * 0.051) * 0.7 +
    Math.cos(z * 0.11 - x * 0.04) * 0.25 +
    smooth(46, 125, Math.abs(x)) * 15 + smooth(110, 170, Math.abs(x)) * 16 +
    smooth(120, 170, z) * 16 + // behind the south gate
    smooth(-212, -336, z) * 15 + // the climb
    Math.sin(x * 0.05 + 1.3) * smooth(-230, -300, z) * 2.2 + // broken ground on the heights
    smooth(-462, -520, z) * 22 // the mountain behind the shrine
  );
}

// ---------- the river: a distance field along its course ----------

export const RIVER_HW = 4.2; // half the width of the bed; the water line sits ~0.7 m further out
const RIVER_REACH = 14; // how far from the middle the field is kept
const GRID = 1; // meters per cell
const GW = Math.ceil(MAP_W / GRID) + 1, GH = Math.ceil(MAP_H / GRID) + 1;
const rDist = new Float32Array(GW * GH).fill(1e9);
const rLevel = new Float32Array(GW * GH);
const rAlong = new Float32Array(GW * GH);

// samples every meter along the river with the water level there: just below the lower
// bank, smoothed so the surface runs evenly
export const riverSamples = (() => {
  const len = riverCurve.getLength();
  const n = Math.ceil(len / 1);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = riverCurve.getPointAt(t), tan = riverCurve.getTangentAt(t);
    const nx = -tan.z, nz = tan.x, o = RIVER_HW + 3;
    const bank = Math.min(baseHeight(p.x, p.z), baseHeight(p.x + nx * o, p.z + nz * o), baseHeight(p.x - nx * o, p.z - nz * o));
    out.push({ x: p.x, z: p.z, tx: tan.x, tz: tan.z, s: t * len, bank, level: 0 });
  }
  // the lowest bank within 20 m, then smoothed: water never stands above its banks
  const W = 20;
  const low = out.map((_, i) => Math.min(...out.slice(Math.max(0, i - W), i + W + 1).map((o) => o.bank)));
  out.forEach((o, i) => {
    const win = low.slice(Math.max(0, i - 12), i + 13);
    o.level = Math.min(win.reduce((a, b) => a + b, 0) / win.length, low[i]) - 0.75;
  });
  return out;
})();
for (let i = 1; i < riverSamples.length; i++) {
  const a = riverSamples[i - 1], b = riverSamples[i];
  const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
  const gx0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - RIVER_REACH - MAP.x0) / GRID));
  const gx1 = Math.min(GW - 1, Math.ceil((Math.max(a.x, b.x) + RIVER_REACH - MAP.x0) / GRID));
  const gz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - RIVER_REACH - MAP.z0) / GRID));
  const gz1 = Math.min(GH - 1, Math.ceil((Math.max(a.z, b.z) + RIVER_REACH - MAP.z0) / GRID));
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
    const x = MAP.x0 + gx * GRID, z = MAP.z0 + gz * GRID;
    const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t);
    const k = gz * GW + gx;
    if (d < rDist[k]) {
      rDist[k] = d;
      rLevel[k] = a.level + (b.level - a.level) * t;
      rAlong[k] = a.s + (b.s - a.s) * t;
    }
  }
}
// distance from the river's middle, the water level there, and how far along it (null: far away)
export function riverAt(x, z) {
  const u = (x - MAP.x0) / GRID, v = (z - MAP.z0) / GRID;
  if (u < 0 || v < 0 || u >= GW - 1 || v >= GH - 1) return null;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const k = j * GW + i;
  const ks = [k, k + 1, k + GW, k + GW + 1], ws = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
  let d = 0, L = 0, s = 0;
  for (let n = 0; n < 4; n++) {
    if (rDist[ks[n]] > 1e8) return null;
    d += rDist[ks[n]] * ws[n]; L += rLevel[ks[n]] * ws[n]; s += rAlong[ks[n]] * ws[n];
  }
  return d < RIVER_REACH ? { d, level: L, s } : null;
}

// ---------- the mask: R = road and trodden ground, G = the river's banks ----------

const canvas = document.createElement('canvas');
canvas.width = Math.round(MAP_W * PX);
canvas.height = Math.round(MAP_H * PX);
const g = canvas.getContext('2d');
g.fillStyle = '#000';
g.fillRect(0, 0, canvas.width, canvas.height);
const toPx = (x) => (x - MAP.x0) * PX;
const toPy = (z) => (z - MAP.z0) * PX; // row 0 is the north edge

// Stack strokes of shrinking width so the value ramps from 0 at the verge to 1 in the
// middle: a soft-edged mask without relying on canvas blur filters.
function strokeSoft(c, width, color, steps = 10) {
  const pts = c.getSpacedPoints(Math.ceil(c.getLength() / 0.8));
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.globalAlpha = 1 / steps;
  for (let i = 0; i < steps; i++) {
    g.lineWidth = width * PX * (1.6 - (i / steps) * 0.9);
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(toPx(p.x), toPy(p.z)) : g.moveTo(toPx(p.x), toPy(p.z))));
    g.stroke();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
function blob(x, z, rad, color) {
  const grd = g.createRadialGradient(toPx(x), toPy(z), 0, toPx(x), toPy(z), rad * PX);
  grd.addColorStop(0, color);
  grd.addColorStop(0.55, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd;
  g.fillRect(toPx(x) - rad * PX, toPy(z) - rad * PX, rad * 2 * PX, rad * 2 * PX);
  g.globalCompositeOperation = 'source-over';
}
for (const r of roadCurves) strokeSoft(r.curve, r.w, '#ff0000');
strokeSoft(riverCurve, (RIVER_HW + 3.2) * 1.25, '#00ff00', 12);

// ---------- duels, stops and the clearings ----------

// Where duels happen: level ground on the road, kept clear of props.
export const ARENA_R = 13; // the combat prototype's clearing is 12
export const DUEL_SPOTS = DUEL_PLAN.map((d) => {
  const road = d.road ?? 0;
  const t = d.t ?? tAtZ(d.z);
  const p = roadCurves[road].curve.getPointAt(t);
  return { id: d.id, road, t, x: p.x, z: p.z, y: baseHeight(p.x, p.z) - 0.12 };
});
// Where an ambusher may lie in wait: level ground on the road like a duel spot, and a hiding
// place 9 m off one side of it (behind a thicket the world puts there).
export const AMBUSH_SPOTS = AMBUSH_PLAN.map((a, i) => {
  const road = a.road ?? 0;
  const c = roadCurves[road].curve;
  const t = a.t ?? tAtZ(a.z);
  const p = c.getPointAt(t);
  const h = beside(t, a.side, 9, 0, c);
  return { id: `ambush${i}`, road, t, side: a.side, x: p.x, z: p.z, y: baseHeight(p.x, p.z) - 0.12, hide: [h.x, h.z], ry: h.ry };
});
// the stops beside the road, each facing it across a trodden yard
export const STOPS = Object.fromEntries(STOP_PLAN.map((s) => {
  const b = beside(s.t ?? tAtZ(s.z), s.side, s.off, s.depth, roadCurves[s.road ?? 0].curve);
  return [s.id, { ...s, ...b, y: baseHeight(b.x, b.z) }];
}));
export const CLEARINGS = { lookout: [66, 12, 11], shrine: [SHRINE.x, SHRINE.z, SHRINE.r], gate: [GATE.x, GATE.z, 6] };
for (const [x, z, r] of Object.values(CLEARINGS)) blob(x, z, r, 'rgba(255,0,0,0.9)');
for (const s of Object.values(STOPS)) {
  const r = s.size * 0.65;
  blob((s.door[0] + s.road[0]) / 2, (s.door[1] + s.road[1]) / 2, Math.max(3.5, r), 'rgba(255,0,0,0.8)');
  if (s.kind !== 'onsen') blob(s.x, s.z, r + 1, 'rgba(255,0,0,0.55)');
}

// level pads: ground that is flattened to one height, blending out to the hills around
const PADS = [
  ...DUEL_SPOTS.map((s) => ({ x: s.x, z: s.z, y: s.y, r0: ARENA_R + 2, r1: ARENA_R + 8 })),
  ...AMBUSH_SPOTS.map((s) => ({ x: s.x, z: s.z, y: s.y, r0: ARENA_R, r1: ARENA_R + 7 })),
  ...Object.values(STOPS).map((s) => ({ x: s.x, z: s.z, y: s.y - 0.05, r0: s.size, r1: s.size + 7 })),
  { x: SHRINE.x, z: SHRINE.z - 6, y: baseHeight(SHRINE.x, SHRINE.z) - 0.1, r0: SHRINE.r + 6, r1: SHRINE.r + 16 },
];
// the hot spring's pool: a bowl of steaming water by its bathhouse
export const POOL = (() => {
  const s = STOPS.onsen;
  return { x: s.x, z: s.z, r: 3.6, level: s.y - 0.3, steam: true };
})();
// the pool under the waterfall on the waterfall path, with a cliff standing round its far side
export const FALLS_POOL = { x: FALLS.x, z: FALLS.z, r: FALLS.pool, level: baseHeight(FALLS.x, FALLS.z) - 0.5, cliff: 9 };
export const POOLS = [POOL, FALLS_POOL];
// the cliff: a horseshoe of rock round the west side of the falls pool
function cliffAt(x, z) {
  const F = FALLS_POOL, dx = x - F.x, d = Math.hypot(dx, z - F.z);
  return F.cliff * smooth(F.r + 0.6, F.r + 2.6, d) * smooth(2, -4, dx) * (1 - smooth(F.r + 10, F.r + 20, d));
}
export const cliffHeight = cliffAt;

const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
export const maskTexture = new THREE.CanvasTexture(canvas);
maskTexture.colorSpace = THREE.NoColorSpace;
maskTexture.flipY = false; // row 0 of the canvas is the north edge, as on the CPU
maskTexture.wrapS = maskTexture.wrapT = THREE.ClampToEdgeWrapping;

function sampleMask(x, z, ch) {
  const u = toPx(x) - 0.5, v = toPy(z) - 0.5;
  if (u < 0 || v < 0 || u >= canvas.width - 1 || v >= canvas.height - 1) return 0;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const W = canvas.width;
  const at = (a, b) => Math.min(255, pixels[(b * W + a) * 4 + ch]) / 255;
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}
export const roadAt = (x, z) => Math.min(1, sampleMask(x, z, 0) * 1.25);
// 1 in the water, 0.5 at the water line, 0 up the bank
export function waterAt(x, z) {
  let pool = 0;
  for (const P of POOLS) pool = Math.max(pool, 1 - smooth(P.r - 0.6, P.r + 0.2, Math.hypot(x - P.x, z - P.z)));
  const r = riverAt(x, z);
  return Math.max(pool, r ? 1 - smooth(RIVER_HW, RIVER_HW + 1.4, r.d) : 0);
}
// the water surface height at a point in the water (the river or the pool)
export function waterLevelAt(x, z) {
  for (const P of POOLS) if (Math.hypot(x - P.x, z - P.z) < P.r + 1) return P.level;
  const r = riverAt(x, z);
  return r ? r.level : -Infinity;
}

// ---------- height ----------

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  h -= roadAt(x, z) * 0.12; // a road is worn a little below the grass
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r1) h += (p.y - h) * (1 - smooth(p.r0, p.r1, d));
  }
  // the river's channel: a rounded bed, and banks that slope up to the meadow
  const r = riverAt(x, z);
  if (r) {
    const d = r.d, L = r.level;
    const target = d < RIVER_HW ? L - 0.45 - 0.85 * (1 - (d / RIVER_HW) ** 2) : L - 0.45 + (d - RIVER_HW) * 0.62;
    h = Math.min(h, target);
  }
  // the falls' cliff, then the pools: the hot spring's, and the one under the falls
  h += cliffAt(x, z);
  for (const P of POOLS) {
    const pd = Math.hypot(x - P.x, z - P.z);
    if (pd < P.r + 1.5) h = Math.min(h, P.level - 0.15 - 0.6 * (1 - Math.min(1, pd / P.r) ** 2) + Math.max(0, pd - P.r) * 0.6);
  }
  return h;
}
export function duelSpotNear(x, z, pad = 0) {
  return DUEL_SPOTS.find((s) => Math.hypot(x - s.x, z - s.z) < ARENA_R + pad) ??
    AMBUSH_SPOTS.find((s) => Math.hypot(x - s.x, z - s.z) < ARENA_R - 3 + pad);
}
// inside the mapped valley (minus a margin)?
export const inMap = (x, z, m = 0) => x > MAP.x0 + m && x < MAP.x1 - m && z > MAP.z0 + m && z < MAP.z1 - m;

// ---------- ground mesh and shader ----------

const groundVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const groundFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uMask;
  uniform vec3 uPaper, uDirt, uInk, uMud, uLight;
  uniform vec4 uMap; // x0, z0, width, height
  uniform float uPx, uTime;
  varying vec3 vN;
  varying vec3 vW;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float hatchLines(float c, float spacing, float w) {
    float f = abs(fract(c / spacing) - 0.5) * 2.0;
    float aa = 1.6 / spacing;
    return 1.0 - smoothstep(w - aa, w + aa, f);
  }

  void main() {
    vec2 uv = (vW.xz - uMap.xy) / uMap.zw;
    vec4 m = texture2D(uMask, uv);
    float road = clamp(m.r * 1.25, 0.0, 1.0);
    float bankMask = clamp(m.g * 1.25, 0.0, 1.0);
    float dist = length(vW - cameraPosition);
    float near = 1.0 - smoothstep(25.0, 70.0, dist);
    vec2 p = gl_FragCoord.xy / uPx;

    // a hand-drawn verge: wobble the threshold so the edge of the road meanders
    float wob = (n2(vW.xz * 0.9) - 0.5) * 0.22 + (n2(vW.xz * 4.0) - 0.5) * 0.08;
    float inRoad = smoothstep(0.42, 0.5, road + wob);
    float edgeR = 1.0 - smoothstep(0.0, 0.05, abs(road + wob - 0.46));

    vec3 col = uPaper;
    float ink = 0.0;

    // slopes turned from the light get a light diagonal hatch
    vec3 n = normalize(vN);
    float shade = 1.0 - clamp(dot(n, uLight) * 1.25, 0.0, 1.0);
    ink = max(ink, hatchLines(p.x + p.y, 10.0, 0.12) * smoothstep(0.32, 0.5, shade) * 0.55);

    // dirt: warm tone, stipple and a few pebble specks, denser in the wheel ruts
    col = mix(col, uDirt, inRoad);
    // stipple: round pen dots, each jittered in its cell and of its own size
    vec2 sg = vW.xz * 6.0;
    vec2 id = floor(sg);
    vec2 off = vec2(h21(id + 3.7), h21(id + 9.1)) - 0.5;
    float r = length(fract(sg) - 0.5 - off * 0.5);
    float rad = mix(0.07, 0.17, h21(id + 1.3));
    float aa = fwidth(r) * 1.2;
    float rut = 1.0 - smoothstep(0.05, 0.16, abs(road - 0.82));
    float keep = step(0.8 - rut * 0.12, h21(id));
    float stip = keep * (1.0 - smoothstep(rad - aa, rad + aa, r)) * inRoad * near;
    ink = max(ink, stip * 0.8);
    ink = max(ink, edgeR * mix(0.55, 1.0, step(0.35, n2(vW.xz * 2.3))) * (0.4 + 0.6 * near));

    // the river banks: damp grey earth down to the water, with pebbles drawn as dots
    float wet = smoothstep(0.34, 0.6, bankMask + wob * 0.5) * (1.0 - inRoad * 0.7);
    col = mix(col, uMud, wet * 0.85);
    float peb = step(0.72, h21(id + 5.3)) * (1.0 - smoothstep(rad * 1.2 - aa, rad * 1.2 + aa, r));
    ink = max(ink, peb * wet * near * 0.75);
    // a pen line where the damp starts
    ink = max(ink, (1.0 - smoothstep(0.0, 0.045, abs(bankMask + wob * 0.5 - 0.36))) * 0.5 * (1.0 - inRoad));

    gl_FragColor = vec4(mix(col, uInk, clamp(ink, 0.0, 1.0)), 1.0);
    #include <fog_fragment>
  }`;

export function buildGround() {
  const W = MAP_W + PAD * 2, H = MAP_H + PAD * 2;
  const geo = new THREE.PlaneGeometry(W, H, Math.round(W / 1.45), Math.round(H / 1.45));
  geo.rotateX(-Math.PI / 2);
  geo.translate((MAP.x0 + MAP.x1) / 2, 0, (MAP.z0 + MAP.z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  geo.deleteAttribute('uv');
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMask: { value: maskTexture },
        uPaper: { value: new THREE.Color(COLORS.paper) },
        uDirt: { value: new THREE.Color(0xd8c9aa) },
        uMud: { value: new THREE.Color(0xc9c2b0) },
        uInk: { value: new THREE.Color(COLORS.ink) },
        uLight: { value: LIGHT_DIR.clone() },
        uMap: { value: new THREE.Vector4(MAP.x0, MAP.z0, MAP_W, MAP_H) },
        uPx: { value: Math.min(devicePixelRatio, 2) },
        uTime: { value: 0 },
      },
    ]),
    vertexShader: groundVert,
    fragmentShader: groundFrag,
    fog: true,
  });
  mat.uniforms.uMask.value = maskTexture;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground';
  return mesh;
}
