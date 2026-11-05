// Meadow grass as quick pen strokes: tufts of tapered blades that sway in the wind,
// thinning out at the road verges and leaving the dirt and the water bare.
import * as THREE from 'three';
import { COLORS } from '../config.js';
import { noEdges, seeded } from '../ink.js';
import { heightAt, roadAt, waterAt, duelSpotNear } from './terrain.js';

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

export function buildGrass(scene, count = 60000) {
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
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, count);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 4; tries++) {
    // more grass near the middle of the valley, where you walk
    const r = Math.pow(rand(), 0.75) * 118;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const road = roadAt(x, z), water = waterAt(x, z);
    if (water > 0.45) continue;
    // duel ground is trodden short, so footwork stays readable
    if (duelSpotNear(x, z) && rand() < 0.8) continue;
    // the verge: grass thins toward the worn dirt
    if (road > 0.5 || rand() < road * 2.2) continue;
    // meadow patches: some ground is lush, some sparse
    const patch = 0.55 + 0.45 * Math.sin(x * 0.13 + Math.cos(z * 0.11) * 2) * Math.cos(z * 0.09 - x * 0.05);
    if (rand() > patch) continue;
    const s = (0.35 + rand() * 0.55) * (0.8 + patch * 0.5) * (water > 0.15 ? 1.4 : 1);
    d.position.set(x, heightAt(x, z) - 0.02, z);
    d.rotation.set(0, rand() * Math.PI * 2, 0);
    d.scale.set(s, s * (0.8 + rand() * 0.6), s);
    d.updateMatrix();
    mesh.setMatrixAt(n, d.matrix);
    // ink weight varies stroke to stroke: mostly dark, some pale and faint
    c.setScalar(Math.pow(rand(), 1.6) * 0.55);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.frustumCulled = false;
  scene.add(mesh);
  noEdges.add(mesh);
  return mat;
}
