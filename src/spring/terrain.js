// Spring terrain: rolling ground, the dirt roads and the stream, all baked into one
// mask texture. The ground shader draws the roads as stippled dirt with a pen-drawn
// edge, and the stream as ink ripples; gameplay reads the same mask on the CPU.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { LIGHT_DIR } from '../ink.js';

export const WORLD = 240; // the mapped square, centered on the origin
export const GROUND = 420; // the ground mesh extends past it under the mist
const MASK = 1024;

// Roads and the stream as control points (x, z). +z is south, the start of the road.
export const ROADS = [
  // the main road: from the south gate, past the crossroads, over the bridge, up to the shrine
  { w: 3.4, pts: [[4, 104], [-2, 82], [6, 62], [2, 42], [-8, 24], [-6, 6], [4, -10], [8, -28], [2, -46], [-6, -62], [-4, -80], [0, -96]] },
  // west to the inn
  { w: 2.4, pts: [[-7, 18], [-22, 14], [-38, 20], [-52, 16], [-64, 6]] },
  // east to the lookout clearing
  { w: 2.2, pts: [[-5, 4], [12, 0], [30, 8], [46, 2], [62, 10]] },
  // a footpath that loops from the inn north to the shrine steps
  { w: 1.6, pts: [[-62, 2], [-58, -18], [-44, -40], [-26, -60], [-8, -74]] },
];
export const STREAM = { w: 5, pts: [[-120, -18], [-90, -26], [-60, -14], [-30, -24], [-6, -30], [16, -22], [44, -34], [76, -24], [120, -32]] };

function curve(pts, y = 0) {
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
}
export const roadCurves = ROADS.map((r) => ({ w: r.w, curve: curve(r.pts) }));
export const streamCurve = curve(STREAM.pts);

// ---------- the mask: R = road, G = stream ----------

const canvas = document.createElement('canvas');
canvas.width = canvas.height = MASK;
const g = canvas.getContext('2d');
g.fillStyle = '#000';
g.fillRect(0, 0, MASK, MASK);
const toPx = (v) => ((v + WORLD / 2) / WORLD) * MASK;
const pxPerM = MASK / WORLD;

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
    g.lineWidth = width * pxPerM * (1.6 - (i / steps) * 0.9);
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(toPx(p.x), toPx(p.z)) : g.moveTo(toPx(p.x), toPx(p.z))));
    g.stroke();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
for (const r of roadCurves) strokeSoft(r.curve, r.w, '#ff0000');
strokeSoft(streamCurve, STREAM.w, '#00ff00', 12);
// the lookout clearing and the shrine forecourt: open trodden ground
function blob(x, z, rad, color) {
  const grd = g.createRadialGradient(toPx(x), toPx(z), 0, toPx(x), toPx(z), rad * pxPerM);
  grd.addColorStop(0, color);
  grd.addColorStop(0.55, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd;
  g.fillRect(toPx(x) - rad * pxPerM, toPx(z) - rad * pxPerM, rad * 2 * pxPerM, rad * 2 * pxPerM);
  g.globalCompositeOperation = 'source-over';
}
export const CLEARINGS = { lookout: [66, 12, 11], shrine: [0, -100, 10], inn: [-68, 4, 9], gate: [4, 106, 6] };
for (const [x, z, r] of Object.values(CLEARINGS)) blob(x, z, r, 'rgba(255,0,0,0.9)');

const pixels = g.getImageData(0, 0, MASK, MASK).data;
export const maskTexture = new THREE.CanvasTexture(canvas);
maskTexture.colorSpace = THREE.NoColorSpace;
maskTexture.flipY = false; // row 0 of the canvas is the north edge (z = -WORLD/2), as on the CPU
maskTexture.wrapS = maskTexture.wrapT = THREE.ClampToEdgeWrapping;

function sampleMask(x, z, ch) {
  const u = toPx(x) - 0.5, v = toPx(z) - 0.5;
  if (u < 0 || v < 0 || u >= MASK - 1 || v >= MASK - 1) return 0;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const at = (a, b) => Math.min(255, pixels[(b * MASK + a) * 4 + ch]) / 255;
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}
export const roadAt = (x, z) => Math.min(1, sampleMask(x, z, 0) * 1.25);
export const waterAt = (x, z) => Math.min(1, sampleMask(x, z, 1) * 1.25);

// ---------- height ----------

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// rolling meadows that rise into hills toward the edge of the map
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  return (
    Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027) * 1.8 +
    Math.sin(x * 0.072 + z * 0.051) * 0.7 +
    Math.cos(z * 0.11 - x * 0.04) * 0.25 +
    smooth(70, 130, r) * 9 + smooth(120, 200, r) * 14
  );
}
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  h -= roadAt(x, z) * 0.12; // a road is worn a little below the grass
  h -= smooth(0.15, 0.8, waterAt(x, z)) * 1.1; // the stream cuts a channel
  return h;
}

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
  uniform vec3 uPaper, uDirt, uInk, uWater, uLight;
  uniform float uWorld, uPx, uTime;
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
    vec2 uv = vW.xz / uWorld + 0.5;
    vec4 m = texture2D(uMask, uv);
    float road = clamp(m.r * 1.25, 0.0, 1.0);
    float water = clamp(m.g * 1.25, 0.0, 1.0);
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

    // water: a darker wash with ink ripple lines drifting downstream
    float inWater = smoothstep(0.55, 0.62, water + wob * 0.6);
    float bank = 1.0 - smoothstep(0.0, 0.05, abs(water + wob * 0.6 - 0.585));
    col = mix(col, uWater, inWater);
    float flow = vW.x * 0.35 + sin(vW.z * 0.8 + vW.x * 0.15) * 0.6 - uTime * 0.6;
    float rip = hatchLines(flow * 8.0 + n2(vW.xz * 0.6) * 6.0, 9.0, 0.12) * step(0.4, n2(vec2(flow * 2.0, vW.z * 1.3)));
    ink = max(ink, rip * inWater * 0.9);
    ink = max(ink, bank);

    gl_FragColor = vec4(mix(col, uInk, clamp(ink, 0.0, 1.0)), 1.0);
    #include <fog_fragment>
  }`;

export function buildGround() {
  const seg = 300;
  const geo = new THREE.PlaneGeometry(GROUND, GROUND, seg, seg);
  geo.rotateX(-Math.PI / 2);
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
        uWater: { value: new THREE.Color(0xd2cfc4) },
        uInk: { value: new THREE.Color(COLORS.ink) },
        uLight: { value: LIGHT_DIR.clone() },
        uWorld: { value: WORLD },
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
