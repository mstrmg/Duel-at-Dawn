// The river and the hot spring's pool, drawn in ink: a pale wash that deepens toward the
// middle, brush-stroke currents that travel downstream, ripples along the banks and round
// the rocks, petals drifting on the surface, and steam over the pool.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { noEdges, flat, seeded } from '../ink.js';
import { riverSamples, RIVER_HW, POOL, POOLS, FALLS_POOL, heightAt } from './terrain.js';
import { PINK } from './palette.js';

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
    if (uPool > 0.5) {
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
        uPool: { value: pool ? 1 : 0 },
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

// pink petals riding the current
class RiverPetals {
  constructor(scene, n = 1800) {
    const geo = new THREE.CircleGeometry(0.095, 5);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, flat(0xffffff, { side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    this.p = [];
    const L = riverSamples.length - 1;
    for (let i = 0; i < n; i++) {
      // drifts: petals gather in rafts, and along the slower water by the banks
      const raft = rand() < 0.6;
      this.p.push({
        s: rand() * L, v: (raft ? (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.35) : rand() * 1.6 - 0.8) * EDGE * 0.92,
        sp: 0.6 + rand() * 0.5, ry: rand() * 6.28, spin: (rand() - 0.5) * 0.8, sc: 0.7 + rand() * 0.8,
      });
      this.mesh.setColorAt(i, c.set(rand() < 0.6 ? PINK.petal : PINK.blossom));
    }
    this.d = new THREE.Object3D();
    scene.add(this.mesh);
    noEdges.add(this.mesh);
  }
  update(dt, t) {
    const S = riverSamples, L = S.length - 1, d = this.d;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i];
      const across = Math.abs(p.v) / EDGE;
      p.s += p.sp * (1.5 * (1 - across * across * 0.7)) * dt;
      if (p.s >= L) p.s -= L;
      const k = Math.floor(p.s), f = p.s - k;
      const a = S[k], b = S[Math.min(L, k + 1)];
      const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, y = a.level + (b.level - a.level) * f;
      const nx = -a.tz, nz = a.tx;
      const v = p.v + Math.sin(t * 0.7 + i) * 0.15;
      p.ry += p.spin * dt;
      d.position.set(x + nx * v, y + 0.025, z + nz * v);
      d.rotation.set(Math.sin(t * 1.7 + i) * 0.08, p.ry, 0);
      d.scale.set(p.sc, 1, p.sc * 0.7);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
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

// steam rising off the hot spring: pale puffs that swell and fade as they climb
class Steam {
  constructor(scene, n = 22) {
    this.puffs = [];
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const m = new THREE.Mesh(geo, mat);
      scene.add(m);
      noEdges.add(m);
      this.puffs.push({ m, t: rand() * 6, life: 5 + rand() * 3, x: (rand() - 0.5) * POOL.r * 1.3, z: (rand() - 0.5) * POOL.r * 1.3 });
    }
  }
  update(dt) {
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t > p.life) { p.t = 0; p.x = (rand() - 0.5) * POOL.r * 1.3; p.z = (rand() - 0.5) * POOL.r * 1.3; }
      const k = p.t / p.life;
      const s = 0.35 + k * 1.1;
      p.m.position.set(POOL.x + p.x + k * 1.2, POOL.level + 0.3 + k * 3.2, POOL.z + p.z + Math.sin(p.t) * 0.3);
      p.m.scale.set(s, s * 0.7, s);
      p.m.material.opacity = Math.sin(Math.PI * k) * 0.42;
    }
  }
}

// The waterfall: a sheet of falling water drawn as inked streaks running down, over the
// lip of the cliff into the pool, with spray rising where it lands.
class Waterfall {
  constructor(scene) {
    const F = FALLS_POOL;
    const top = heightAt(F.x - F.r - 3.2, F.z) - 0.1;
    const bottom = F.level;
    const H = top - bottom, W = 3.2;
    const g = new THREE.PlaneGeometry(W, H, 1, 12);
    // a slight bow outward at the top, as water leaves the lip
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + H / 2) / H;
      p.setZ(i, v * v * 0.9);
    }
    g.computeVertexNormals();
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uPaper: { value: new THREE.Color(COLORS.paper) }, uInk: { value: new THREE.Color(COLORS.ink) }, uH: { value: H },
      }]),
      vertexShader: `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uPaper; uniform vec3 uInk; uniform float uH;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float col = floor(vUv.x * 46.0);
          float lane = fract(vUv.x * 46.0);
          float speed = 1.6 + hash(col) * 1.2;
          float d = fract((1.0 - vUv.y) * uH * 0.35 + uTime * speed + hash(col * 3.1));
          float streak = smoothstep(0.35, 0.5, lane) * (1.0 - smoothstep(0.5, 0.65, lane));
          float dash = step(0.45, d) * (0.5 + hash(col * 7.3) * 0.5);
          float ink = streak * dash;
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          gl_FragColor = vec4(mix(uPaper * 1.03, uInk, ink * 0.55), (0.82 + ink * 0.18) * edge);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(g, this.mat);
    m.position.set(F.x - F.r - 0.7, bottom + H / 2, F.z);
    m.rotation.y = Math.PI / 2; // facing east, out over the pool
    scene.add(m);
    noEdges.add(m);
    // spray where it lands
    this.puffs = [];
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const pm = new THREE.Mesh(geo, mat);
      scene.add(pm);
      noEdges.add(pm);
      this.puffs.push({ m: pm, t: rand() * 2, life: 1.6 + rand() * 1.2, z: (rand() - 0.5) * W });
    }
    this.base = new THREE.Vector3(F.x - F.r - 0.4, bottom, F.z);
  }
  update(dt, t) {
    this.mat.uniforms.uTime.value = t;
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t > p.life) { p.t = 0; p.z = (rand() - 0.5) * 3.2; }
      const k = p.t / p.life, s = 0.4 + k * 1.2;
      p.m.position.set(this.base.x + k * 2.2, this.base.y + 0.2 + k * 1.4, this.base.z + p.z);
      p.m.scale.set(s, s * 0.6, s);
      p.m.material.opacity = Math.sin(Math.PI * k) * 0.5;
    }
  }
}

// Build the water. rocks: [x, z, r] of rocks standing in the river (they get ripples).
export function buildWater(scene, rocks = []) {
  const river = waterMaterial(false);
  const pools = POOLS.map((P) => waterMaterial(true, P.r));
  riverRibbon(scene, river);
  POOLS.forEach((P, i) => poolSurface(scene, pools[i], P));
  const petals = new RiverPetals(scene);
  const ripples = new Ripples(scene);
  for (const [x, z, r, y] of rocks) ripples.add(x, y, z, r);
  const steam = new Steam(scene);
  const falls = new Waterfall(scene);
  return {
    update(dt, t) {
      river.uniforms.uTime.value = t;
      for (const pool of pools) pool.uniforms.uTime.value = t;
      petals.update(dt, t);
      ripples.update(t);
      steam.update(dt);
      falls.update(dt, t);
    },
  };
}
