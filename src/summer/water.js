// Summer's water, drawn in ink: the swollen river (a pale wash that deepens toward the
// middle, brush-stroke currents running downstream, ripples along the banks and round the
// rocks), the lotus pond, and the still water of the flooded paddies, which holds the sky.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { noEdges, flat, seeded } from '../ink.js';
import { riverSamples, RIVER_HW, POOL, POOLS, PADDIES } from './terrain.js';

const rand = seeded(77);
const EDGE = RIVER_HW + 0.7; // where the water meets the bank
const SPAN = RIVER_HW + 2.6; // the ribbon runs on under the banks, which hide its edges

const waterVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec2 flow; // x: meters along the river, y: meters across from its middle
  varying vec2 vFlow;
  varying vec3 vW;
  void main() {
    vFlow = flow;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const waterFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uPaper, uInk, uWash, uDeep;
  uniform float uTime, uPx, uEdge, uPool;
  varying vec2 vFlow;
  varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float line(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
  void main() {
    vec2 p = gl_FragCoord.xy / uPx;
    float ink = 0.0;
    vec3 col;
    float across;
    if (uPool > 1.5) {
      // still water in a paddy: the sky's pale wash, a few long level strokes of reflected
      // cloud that shiver, and the bund's shadow along the edge
      across = 0.75;
      col = mix(uWash, uDeep, 0.3);
      float row = vW.z * 1.6 + n2(vW.xz * 0.15) * 3.0;
      float ri = floor(row), rf = fract(row);
      float on = step(0.82, h21(vec2(ri, floor(vW.x * 0.12 + h21(vec2(ri, 3.0)) * 9.0))));
      float shiver = sin(uTime * 1.3 + ri) * 0.06;
      ink = max(ink, line(rf - 0.5 + shiver, 0.05) * on * 0.35);
      ink = max(ink, line(vFlow.x, 0.16) * 0.45);
    } else if (uPool > 0.5) {
      // the pool: rings spreading slowly from the spring at its middle
      float r = vFlow.x;
      across = r / uEdge;
      col = mix(uDeep, uWash, smoothstep(0.0, 0.9, across));
      float ring = fract(r * 0.9 - uTime * 0.25);
      ink = max(ink, line(ring - 0.5, 0.05) * 0.45 * (1.0 - across * 0.6));
    } else {
      across = abs(vFlow.y) / uEdge;
      // a wash, deeper in the middle where the water runs dark
      col = mix(uDeep, uWash, smoothstep(0.1, 0.85, across));
      // currents: lanes across the river, each carrying broken brush strokes downstream,
      // quicker in the middle than along the banks
      float lanes = vFlow.y / 0.42;
      float li = floor(lanes), lf = fract(lanes);
      float speed = 1.5 * (1.0 - across * across * 0.7);
      float along = vFlow.x - uTime * speed;
      float len = 2.2 + h21(vec2(li, 1.0)) * 4.5;
      float seg = along / len + h21(vec2(li, 7.0)) * 13.0;
      float si = floor(seg), sf = fract(seg);
      float on = step(0.5, h21(vec2(li, si)));
      float taper = smoothstep(0.0, 0.2, sf) * (1.0 - smoothstep(0.45, 0.95, sf));
      float wob = (n2(vec2(vFlow.x * 0.35, li * 3.1)) - 0.5) * 0.5;
      float stroke = line(lf - 0.5 - wob * 0.6, 0.09 * taper + 0.004);
      ink = max(ink, stroke * on * (0.5 + 0.4 * h21(vec2(li, si + 3.0))) * (1.0 - smoothstep(0.86, 1.0, across)));
      // ripples standing along each bank
      float fromBank = uEdge - abs(vFlow.y);
      float rw = sin(vFlow.x * 1.1 + uTime * 1.3 + vFlow.y) * 0.05;
      ink = max(ink, line(fromBank - 0.32 - rw, 0.035) * 0.75 * step(0.3, n2(vec2(vFlow.x * 0.6, sign(vFlow.y)))));
      ink = max(ink, line(fromBank - 0.75 - rw * 1.4, 0.03) * 0.45 * step(0.55, n2(vec2(vFlow.x * 0.4 + 9.0, sign(vFlow.y)))));
    }
    // a light diagonal hatch in the deep water, like the shading on the land
    float deep = 1.0 - smoothstep(0.0, 0.7, across);
    float hatch = 1.0 - smoothstep(0.08, 0.2, abs(fract((p.x - p.y) / 9.0) - 0.5) * 2.0);
    ink = max(ink, hatch * deep * 0.22);
    gl_FragColor = vec4(mix(col, uInk, clamp(ink, 0.0, 1.0)), 1.0);
    #include <fog_fragment>
  }`;

function waterMaterial(pool, edge = POOL.r) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uPaper: { value: new THREE.Color(COLORS.paper) },
        uInk: { value: new THREE.Color(COLORS.ink) },
        uWash: { value: new THREE.Color(0xdcdcd2) },
        uDeep: { value: new THREE.Color(0xb9c0bb) },
        uTime: { value: 0 },
        uPx: { value: Math.min(devicePixelRatio, 2) },
        uEdge: { value: pool ? edge : EDGE },
        uPool: { value: pool === 'still' ? 2 : pool ? 1 : 0 },
      },
    ]),
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    fog: true,
  });
}

// the river surface: a ribbon along its course at the water level, in chunks so the
// stretches out of view are skipped
function riverRibbon(scene, mat) {
  const S = riverSamples, ACROSS = 10, CHUNK = 50;
  for (let c0 = 0; c0 < S.length - 1; c0 += CHUNK) {
    const c1 = Math.min(S.length - 1, c0 + CHUNK);
    const pos = [], flow = [], idx = [];
    for (let i = c0; i <= c1; i++) {
      const o = S[i], nx = -o.tz, nz = o.tx;
      for (let k = 0; k <= ACROSS; k++) {
        const v = (k / ACROSS) * 2 - 1, off = v * SPAN;
        pos.push(o.x + nx * off, o.level, o.z + nz * off);
        flow.push(o.s, off);
      }
    }
    const rows = c1 - c0;
    for (let i = 0; i < rows; i++) for (let k = 0; k < ACROSS; k++) {
      const a = i * (ACROSS + 1) + k, b = a + ACROSS + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b); // wound to face up
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = 'river';
    scene.add(m);
  }
}

function poolSurface(scene, mat, P) {
  const g = new THREE.CircleGeometry(P.r + 1.2, 40);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const flow = [];
  for (let i = 0; i < p.count; i++) flow.push(Math.hypot(p.getX(i), p.getZ(i)), 0);
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  const m = new THREE.Mesh(g, mat);
  m.position.set(P.x, P.level, P.z);
  scene.add(m);
}


// The paddies' water: one quad per plot at its water level, merged; flow.x holds the
// distance in from the plot's edge, so the bund's shadow can be inked along it.
function paddyWater(scene, mat) {
  const pos = [], flow = [], idx = [];
  for (const p of PADDIES) {
    const hw = p.hw + 0.25, hd = p.hd + 0.25, y = p.y;
    const n = pos.length / 3;
    // a center vertex and the four corners: the edge distance runs 0 at the rim to deep in
    pos.push(p.x, y, p.z, p.x - hw, y, p.z - hd, p.x + hw, y, p.z - hd, p.x + hw, y, p.z + hd, p.x - hw, y, p.z + hd);
    flow.push(Math.min(hw, hd), 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) idx.push(n, n + 1 + ((k + 1) % 4), n + 1 + k);
  }
  if (!PADDIES.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = 'paddies';
  scene.add(m);
  noEdges.add(m);
}

// lotus pads crowding the pond, and white flowers standing up out of them
function lotus(scene, P) {
  const pad = new THREE.CircleGeometry(0.5, 14, 0.25, Math.PI * 2 - 0.5);
  pad.rotateX(-Math.PI / 2);
  const pads = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * (P.r - 0.8);
    pads.push([P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, 0.6 + rand() * 0.9]);
  }
  const mesh = new THREE.InstancedMesh(pad, flat(0xb3baa9, { side: THREE.DoubleSide }), pads.length);
  const d = new THREE.Object3D();
  pads.forEach(([x, z, s], i) => {
    d.position.set(x, P.level + 0.02, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.set(s, 1, s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  scene.add(mesh);
  noEdges.add(mesh);
  // flowers: a white cup of petals on a stem
  const cup = new THREE.ConeGeometry(0.22, 0.3, 7, 1, true);
  cup.rotateX(Math.PI);
  const flowers = pads.filter(() => rand() < 0.22);
  const fm = new THREE.InstancedMesh(cup, flat(0xf6f1e4, { side: THREE.DoubleSide }), flowers.length);
  flowers.forEach(([x, z], i) => {
    d.position.set(x + 0.2, P.level + 0.42, z);
    d.rotation.set(0, rand() * 6.28, 0);
    d.scale.setScalar(0.9 + rand() * 0.4);
    d.updateMatrix();
    fm.setMatrixAt(i, d.matrix);
  });
  scene.add(fm);
}
// rings of ripple round a rock standing in the water, swelling and settling
class Ripples {
  constructor(scene) {
    this.rings = [];
    this.mat = flat(COLORS.ink, { side: THREE.DoubleSide });
    this.geo = new THREE.RingGeometry(1, 1.035, 32);
    this.geo.rotateX(-Math.PI / 2);
    this.scene = scene;
  }
  add(x, y, z, r) {
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.position.set(x, y + 0.02, z);
      this.scene.add(m);
      noEdges.add(m);
      this.rings.push({ m, r: r * (1.25 + k * 0.45), ph: rand() * 6.28 + k });
    }
  }
  update(t) {
    for (const g of this.rings) {
      const s = g.r * (1 + Math.sin(t * 1.6 + g.ph) * 0.06);
      g.m.scale.set(s, 1, s * 1.12);
    }
  }
}


// Build the water. rocks: [x, z, r, level] of rocks standing in the river (they get ripples).
export function buildWater(scene, rocks = []) {
  const river = waterMaterial(false);
  const pools = POOLS.map((P) => waterMaterial(true, P.r));
  const still = waterMaterial('still');
  riverRibbon(scene, river);
  POOLS.forEach((P, i) => poolSurface(scene, pools[i], P));
  paddyWater(scene, still);
  for (const P of POOLS) if (P.lotus) lotus(scene, P);
  const ripples = new Ripples(scene);
  for (const [x, z, r, y] of rocks) ripples.add(x, y, z, r);
  return {
    update(dt, t) {
      river.uniforms.uTime.value = t;
      still.uniforms.uTime.value = t;
      for (const pool of pools) pool.uniforms.uTime.value = t;
      ripples.update(t);
    },
  };
}
