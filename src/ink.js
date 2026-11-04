// Ink-wash rendering helpers: stepped toon shading, inverted-hull brush outlines,
// and the misty dawn clearing the duels take place in.
import * as THREE from 'three';
import { COLORS, ARENA_RADIUS } from './config.js';

let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  // three hard tones, like layered ink washes
  const data = new Uint8Array([70, 150, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map();
export function toon(color) {
  if (toonCache.has(color)) return toonCache.get(color);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
  toonCache.set(color, m);
  return m;
}

export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

const outlineCache = new Map();
function outlineMaterial(width) {
  const key = width.toFixed(4);
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uWidth: { value: width }, uColor: { value: new THREE.Color(COLORS.ink) } },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uWidth;
      void main() {
        vec3 p = position + normalize(normal) * uWidth;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineCache.set(key, m);
  return m;
}

// Adds a black inverted hull around a mesh so it reads as a brush outline.
export function outline(mesh, width = 0.025) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(width));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

export function inked(geometry, color, width = 0.025) {
  const m = new THREE.Mesh(geometry, toon(color));
  return outline(m, width);
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Builds the misty clearing: paper sky, a red dawn sun, ink mountains, pines and grass.
export function buildEnvironment(scene) {
  const rand = seeded(7);
  scene.background = new THREE.Color(COLORS.paper);
  scene.fog = new THREE.Fog(COLORS.paper, 16, 95);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-20, 30, -40);
  scene.add(sun);

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), toon(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  // a pale worn circle where duelists have stood before
  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS + 1.5, 48),
    flat(0xe4dcc8, { transparent: true, opacity: 0.7, depthWrite: false })
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = 0.005;
  scene.add(clearing);

  // ink ring of stones marking the edge
  const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    const r = ARENA_RADIUS + 1.2 + rand() * 0.8;
    const s = inked(stoneGeo, 0x8e887c, 0.04);
    s.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    s.scale.set(0.6 + rand(), 0.4 + rand() * 0.5, 0.6 + rand());
    s.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    scene.add(s);
  }

  // the red dawn sun: the only red in the world besides blood
  const sunDisk = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    flat(COLORS.red, { fog: false })
  );
  sunDisk.position.set(-40, 16, -140);
  sunDisk.lookAt(0, 6, 0);
  scene.add(sunDisk);

  // distant mountains, washed out by fog
  const mountainGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  const mtnColors = [0x6d6a63, 0x8b877e, 0xa29d92];
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 50;
    const h = 18 + rand() * 30;
    const m = new THREE.Mesh(mountainGeo, toon(mtnColors[i % 3]));
    m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    m.scale.set(14 + rand() * 18, h, 14 + rand() * 18);
    m.rotation.y = rand() * 3;
    scene.add(m);
  }

  // pines
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
  const canopyGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const r = ARENA_RADIUS + 6 + rand() * 30;
    const tree = new THREE.Group();
    const h = 4 + rand() * 4;
    const trunk = inked(trunkGeo, 0x3a3734, 0.04);
    trunk.scale.set(1, h, 1);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    tree.add(trunk);
    const layers = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < layers; j++) {
      const c = inked(canopyGeo, j % 2 ? 0x2f2e2b : 0x4a4843, 0.05);
      const w = 1.6 + rand() * 1.4 - j * 0.2;
      c.scale.set(w, 0.5 + rand() * 0.3, w * (0.7 + rand() * 0.3));
      c.position.set((rand() - 0.5) * 1.2, h * (0.55 + j * 0.16), (rand() - 0.5) * 1.2);
      tree.add(c);
    }
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rand() * 6;
    scene.add(tree);
  }

  // grass: quick vertical ink flicks
  const blade = new THREE.PlaneGeometry(0.04, 0.5);
  blade.translate(0, 0.25, 0);
  const grassMat = flat(0x2a2826, { side: THREE.DoubleSide });
  const count = 1400;
  const grass = new THREE.InstancedMesh(blade, grassMat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    // keep the dueling circle mostly clear
    let r = ARENA_RADIUS * 0.4 + Math.pow(rand(), 0.7) * 40;
    if (r < ARENA_RADIUS && rand() < 0.75) r += ARENA_RADIUS;
    const a = rand() * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dummy.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6);
    const s = 0.5 + rand() * 1.2;
    dummy.scale.set(1, s, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);

  return { sunDisk };
}
