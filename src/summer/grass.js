// Meadow grass as quick pen strokes: tufts of tapered blades that sway in the wind,
// thinning out at the road verges and leaving the dirt and the water bare. In the flooded
// paddies the same strokes stand in rows: young rice, planted by hand.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { noEdges, seeded } from '../ink.js';
import { heightAt, roadAt, waterAt, duelSpotNear, riverAt, paddyAt, PADDIES, RIVER_HW, MAP } from './terrain.js';

const grassVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  varying float vShade;
  varying float vFar;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float h = position.y; // 0 at the root, 1 at the tip
    float gust = sin(uTime * 0.7 + wp.x * 0.05 + wp.z * 0.03) * 0.5 + 0.5;
    float sway = sin(uTime * 2.1 + wp.x * 0.45 + wp.z * 0.3) * (0.05 + gust * 0.09);
    wp.x += sway * h * h;
    wp.z += sway * 0.4 * h * h;
    vShade = 1.0;
    #ifdef USE_INSTANCING_COLOR
      vShade = instanceColor.r;
    #endif
    vec4 mvPosition = viewMatrix * wp;
    // a pen only draws the grass up close; further off it thins to bare paper
    vFar = smoothstep(14.0, 42.0, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const grassFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uInk;
  uniform vec3 uPaper;
  varying float vShade;
  varying float vFar;
  void main() {
    float shade = mix(vShade, 1.0, vFar * vFar * 0.85 + vFar * 0.15);
    if (shade > 0.97) discard;
    gl_FragColor = vec4(mix(uInk, uPaper, shade), 1.0);
    #include <fog_fragment>
  }`;

// one tuft: a fan of thin tapered blades, each a single triangle pair
function tuftGeometry(blades = 4) {
  const pos = [];
  const rand = seeded(11);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand();
    const lean = 0.15 + rand() * 0.35;
    const h = 0.6 + rand() * 0.4;
    const w = 0.022;
    const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
    const tx = bx + Math.cos(a) * lean * h, tz = bz + Math.sin(a) * lean * h;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const mx = (bx + tx) / 2 + Math.cos(a) * 0.03, mz = (bz + tz) / 2 + Math.sin(a) * 0.03;
    // base quad to mid, then a taper to the tip (y holds 0..1 for the sway)
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, mx + px * 0.6, h * 0.5, mz + pz * 0.6);
    pos.push(bx - px, 0, bz - pz, mx + px * 0.6, h * 0.5, mz + pz * 0.6, mx - px * 0.6, h * 0.5, mz - pz * 0.6);
    pos.push(mx - px * 0.6, h * 0.5, mz - pz * 0.6, mx + px * 0.6, h * 0.5, mz + pz * 0.6, tx, h, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Grass over the whole valley in square tiles, each its own instanced mesh: tiles out of
// view are culled, and tiles beyond where the pen stops drawing grass are hidden outright.
const TILE = 40;
const SHOW = 70; // the grass shader has faded to bare paper well before this
export function buildGrass(scene, density = 1.35) {
  const rand = seeded(99);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uInk: { value: new THREE.Color(COLORS.ink) }, uPaper: { value: new THREE.Color(COLORS.paper) } },
    ]),
    vertexShader: grassVert,
    fragmentShader: grassFrag,
    fog: true,
    side: THREE.DoubleSide,
  });
  const tuft = tuftGeometry();
  const reed = tuftGeometry(6);
  reed.scale(0.55, 2.6, 0.55);
  const riceTuft = tuftGeometry(7);
  riceTuft.scale(0.3, 0.9, 0.3);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  const tiles = [];
  const bounds = { x0: -112, x1: 112, z0: MAP.z0 + 6, z1: MAP.z1 - 2 };
  for (let tz = bounds.z0; tz < bounds.z1; tz += TILE) for (let tx = bounds.x0; tx < bounds.x1; tx += TILE) {
    const mats = [], reeds = [], rice = [];
    const n = Math.round(TILE * TILE * density * 1.6);
    for (let i = 0; i < n; i++) {
      let x = tx + rand() * TILE, z = tz + rand() * TILE;
      if (paddyAt(x, z, -0.4)) continue; // the paddies get their rice in rows below
      if (paddyAt(x, z, 0.6)) continue; // the bund's wet edge
      // thinner toward the valley walls, where nobody walks
      if (rand() < Math.min(0.75, Math.max(0, (Math.abs(x) - 45) / 80))) continue;
      const road = roadAt(x, z), water = waterAt(x, z);
      const r = riverAt(x, z);
      // reeds crowd the river's edge
      if (r && r.d > RIVER_HW + 0.2 && r.d < RIVER_HW + 2.2 && rand() < 0.55) {
        if (Math.sin(r.s * 0.35) + Math.sin(r.s * 0.9 + 2) > -0.3) { reeds.push(x, z); continue; }
      }
      if (water > 0.45) continue;
      if (duelSpotNear(x, z) && rand() < 0.8) continue; // duel ground is trodden short, so footwork stays readable
      if (road > 0.5 || rand() < road * 2.2) continue; // the verge: grass thins toward the worn dirt
      const patch = 0.55 + 0.45 * Math.sin(x * 0.13 + Math.cos(z * 0.11) * 2) * Math.cos(z * 0.09 - x * 0.05);
      if (rand() > patch) continue;
      mats.push(x, z, (0.35 + rand() * 0.55) * (0.8 + patch * 0.5) * (water > 0.15 ? 1.4 : 1));
    }
    // young rice in rows across each paddy whose middle lies in this tile, planted by hand
    for (const pad of PADDIES) {
      if (pad.x < tx || pad.x >= tx + TILE || pad.z < tz || pad.z >= tz + TILE) continue;
      for (let x = pad.x - pad.hw + 0.6; x < pad.x + pad.hw - 0.5; x += 1.1)
        for (let z = pad.z - pad.hd + 0.6; z < pad.z + pad.hd - 0.5; z += 0.9)
          if (rand() < 0.85) rice.push(x + (rand() - 0.5) * 0.1, z + (rand() - 0.5) * 0.1);
    }
    const make = (geo, list, stride, scaleOf, pale = 0) => {
      const count = list.length / stride;
      if (!count) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      for (let k = 0; k < count; k++) {
        const x = list[k * stride], z = list[k * stride + 1], s = scaleOf(list, k * stride);
        d.position.set(x, heightAt(x, z) - 0.02, z);
        d.rotation.set(0, rand() * Math.PI * 2, 0);
        d.scale.set(s, s * (0.8 + rand() * 0.6), s);
        d.updateMatrix();
        mesh.setMatrixAt(k, d.matrix);
        // ink weight varies stroke to stroke: mostly dark, some pale and faint
        c.setScalar(pale + Math.pow(rand(), 1.6) * (0.55 - pale * 0.4));
        mesh.setColorAt(k, c);
      }
      mesh.computeBoundingSphere();
      scene.add(mesh);
      noEdges.add(mesh);
      return mesh;
    };
    const meshes = [
      make(tuft, mats, 3, (l, i) => l[i + 2]), make(reed, reeds, 2, () => 0.7 + rand() * 0.5),
      make(riceTuft, rice, 2, () => 0.85 + rand() * 0.3, 0.3),
    ].filter(Boolean);
    if (meshes.length) tiles.push({ x: tx + TILE / 2, z: tz + TILE / 2, meshes });
  }
  return {
    mat,
    update(cam) {
      for (const t of tiles) {
        const on = Math.hypot(t.x - cam.x, t.z - cam.z) < SHOW + TILE * 0.71;
        for (const m of t.meshes) m.visible = on;
      }
    },
  };
}
