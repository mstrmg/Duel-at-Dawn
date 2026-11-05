// Pen-and-ink rendering: hatched shading in the materials, then a post pass that draws
// hand-wobbled ink lines along every silhouette and crease (depth + normal edges).
import * as THREE from 'three';
import { COLORS, ARENA_RADIUS } from './config.js';

// Work directly in the hex colors we author: no linear/sRGB conversions anywhere.
THREE.ColorManagement.enabled = false;

export const LIGHT_DIR = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
const paper = new THREE.Color(COLORS.paper);
const inkColor = new THREE.Color(COLORS.ink);

function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

// Cutaway: anything between the camera and the player (tree crowns, roofs) is stippled
// away around the player, so the view is never blocked. Off unless setCutaway() is used.
export const CUT = { uCutOn: { value: 0 }, uCutPos: { value: new THREE.Vector3() } };
const cutGlsl = /* glsl */ `
  uniform float uCutOn;
  uniform vec3 uCutPos;
  varying vec3 vW;
  void cutaway() {
    // only above knee height, so the ground (which never cuts) stays whole in both passes
    if (uCutOn < 0.5 || vW.y < uCutPos.y - 0.8) return;
    vec3 toP = uCutPos - cameraPosition;
    float lp = length(toP);
    vec3 dir = toP / lp;
    vec3 toF = vW - cameraPosition;
    float along = dot(toF, dir);
    if (along > lp - 0.8) return;
    float perp = length(toF - dir * along);
    float rad = 0.6 + 1.6 * clamp(along / lp, 0.0, 1.0);
    // a clean hole: the edge pass then rings it with one ink line, like a drawn vignette
    if (perp < rad) discard;
  }`;

const hatchVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    #ifdef USE_INSTANCING
      wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #endif
    vW = wp.xyz;
    vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    #ifdef USE_INSTANCING
      vN = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
    #endif
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const hatchFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTone;
  uniform vec3 uTint;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform vec3 uLight;
  uniform float uPx;
  uniform float uDensity;
  uniform float uFill;
  varying vec3 vN;
  ${cutGlsl}

  // one family of parallel pen lines; strength grows with darkness past 'start'
  float hatch(float c, float spacing, float d, float start) {
    float t = clamp((d - start) / 0.28, 0.0, 1.0);
    if (t <= 0.0) return 0.0;
    float f = abs(fract(c / spacing) - 0.5) * 2.0;
    float w = mix(0.06, 0.34, t);
    float aa = 1.6 / spacing;
    return 1.0 - smoothstep(w - aa, w + aa, f);
  }

  void main() {
    cutaway();
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float ndl = max(dot(n, uLight), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    // the material sets the mid value; light pushes it toward bare paper, shade toward ink
    float tone = clamp(uTone + ndl * 0.85 + hemi * 0.3 - 0.55, 0.0, 1.0);
    float dark = 1.0 - tone;

    vec2 p = gl_FragCoord.xy / uPx;
    // a little wobble so the lines read as drawn, not printed
    float wob = sin(p.y * 0.09 + p.x * 0.02) * 1.4 + sin(p.x * 0.05) * 0.8;
    float s = 9.0 * uDensity;
    float ink = 0.0;
    ink = max(ink, hatch(p.x + p.y + wob, s, dark, 0.22));
    ink = max(ink, hatch(p.x - p.y + wob, s, dark, 0.48));
    ink = max(ink, hatch(p.y + wob * 0.6, s * 0.8, dark, 0.72));
    ink = max(ink, smoothstep(0.88, 0.98, dark));

    vec3 base = mix(uPaper, uTint, uFill);
    gl_FragColor = vec4(mix(base, uInk, ink), 1.0);
    #include <fog_fragment>
  }`;

// Objects the edge pass skips (sprites, grass flicks that are already lines).
export const noEdges = new Set();

const hatchCache = new Map();
// A hatched pen material. tone: 0 = solid ink, 1 = bare paper.
// opts.fill: how strongly the tint colors the paper (0.16 = a faint wash; ~0.9 = a full
// colored fill, used for Spring's pink blossoms). opts.ink: the hatch line color.
export function hatch(tone, tint = COLORS.paper, density = 1, opts = {}) {
  const fill = opts.fill ?? 0.16;
  const ink = opts.ink ?? COLORS.ink;
  const key = `${tone.toFixed(3)}|${tint}|${density}|${fill}|${ink}`;
  // unique: a material of its own, whose colors can be changed without touching the rest
  if (!opts.unique && hatchCache.has(key)) return hatchCache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTone: { value: tone },
        uTint: { value: new THREE.Color(tint) },
        uPaper: { value: paper.clone() },
        uInk: { value: new THREE.Color(ink) },
        uLight: { value: LIGHT_DIR.clone() },
        uPx: { value: Math.min(devicePixelRatio, 2) },
        uDensity: { value: density },
        uFill: { value: fill },
      },
    ]),
    vertexShader: hatchVert,
    fragmentShader: hatchFrag,
    fog: true,
    side: THREE.DoubleSide,
  });
  Object.assign(m.uniforms, CUT); // shared, so one update moves every material's cutaway
  if (!opts.unique) hatchCache.set(key, m);
  return m;
}

// Kept so callers can pass authored colors: the color's lightness becomes the hatch tone.
export function toon(color) {
  return hatch(Math.min(1, luminance(color) * 1.1), color);
}

export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

// Outlines now come from the edge pass; this only exists for older call sites.
export function outline(mesh) {
  return mesh;
}

export function inked(geometry, color) {
  return new THREE.Mesh(geometry, toon(color));
}

// ---------- the pen post pass ----------

// view-space normals for the edge pass (as MeshNormalMaterial), honoring the cutaway
const normalVert = /* glsl */ `
  varying vec3 vVN;
  varying vec3 vW;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vW = wp.xyz;
    vVN = normalize((viewMatrix * vec4(normalize((m * vec4(normal, 0.0)).xyz), 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const normalFrag = /* glsl */ `
  varying vec3 vVN;
  ${cutGlsl}
  void main() {
    cutaway();
    vec3 n = normalize(vVN) * (gl_FrontFacing ? 1.0 : -1.0);
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }`;

const penVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const penFrag = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 uRes;
  uniform float uNear;
  uniform float uFar;
  uniform float uTime;
  uniform float uLine;
  uniform vec3 uInk;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float lin(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }
  vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

  void main() {
    vec2 px = 1.0 / uRes;
    // lines "boil" a few times a second, like redrawn animation frames
    float t = floor(uTime * 6.0);
    vec2 w = vec2(noise(vUv * 90.0 + t * 7.3), noise(vUv * 90.0 + 31.0 + t * 3.1)) - 0.5;
    vec2 uv = vUv + w * px * 2.2 * uLine;

    vec2 o = px * uLine;
    float d = lin(uv);
    float dl = lin(uv - vec2(o.x, 0.0)), dr = lin(uv + vec2(o.x, 0.0));
    float du = lin(uv + vec2(0.0, o.y)), dd = lin(uv - vec2(0.0, o.y));
    // second difference of inverse depth: zero across any flat plane, even the ground
    // at a grazing angle, so only real silhouettes and steps get a line
    float id = 1.0 / d;
    float lap = abs(1.0 / dl + 1.0 / dr - 2.0 * id) + abs(1.0 / du + 1.0 / dd - 2.0 * id);
    float dEdge = smoothstep(0.04, 0.12, lap * d);

    vec3 n = nrm(uv);
    float nEdge = (1.0 - dot(n, nrm(uv - vec2(o.x, 0.0)))) + (1.0 - dot(n, nrm(uv + vec2(o.x, 0.0))))
                + (1.0 - dot(n, nrm(uv + vec2(0.0, o.y)))) + (1.0 - dot(n, nrm(uv - vec2(0.0, o.y))));
    nEdge = smoothstep(0.35, 0.8, nEdge);

    float edge = max(dEdge, nEdge);
    // lines thin out and fade into the mist with distance
    float fade = 1.0 - smoothstep(18.0, 120.0, d) * 0.85;
    // break some lines up slightly, as a dry pen does
    float dry = smoothstep(0.15, 0.5, noise(vUv * vec2(240.0, 140.0)));
    edge *= fade * mix(0.65, 1.0, dry);

    vec3 col = texture2D(tColor, vUv).rgb;
    gl_FragColor = vec4(mix(col, uInk, clamp(edge, 0.0, 1.0)), 1.0);
  }`;

export class PenRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.colorRT = new THREE.WebGLRenderTarget(1, 1);
    this.colorRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.normalRT = new THREE.WebGLRenderTarget(1, 1);
    this.normalMat = new THREE.ShaderMaterial({
      uniforms: { ...CUT },
      vertexShader: normalVert,
      fragmentShader: normalFrag,
      side: THREE.DoubleSide,
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: this.colorRT.texture },
          tDepth: { value: this.colorRT.depthTexture },
          tNormal: { value: this.normalRT.texture },
          uRes: { value: new THREE.Vector2(1, 1) },
          uNear: { value: camera.near },
          uFar: { value: camera.far },
          uTime: { value: 0 },
          uLine: { value: 1 },
          uInk: { value: inkColor.clone() },
        },
        vertexShader: penVert,
        fragmentShader: penFrag,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.normalClear = new THREE.Color(0.5, 0.5, 1.0);
    this.setSize(innerWidth, innerHeight);
  }

  setSize(w, h) {
    const dpr = this.renderer.getPixelRatio();
    const W = Math.floor(w * dpr), H = Math.floor(h * dpr);
    this.colorRT.setSize(W, H);
    this.normalRT.setSize(W, H);
    this.quad.material.uniforms.uRes.value.set(W, H);
    this.quad.material.uniforms.uLine.value = Math.max(1.4, dpr * 1.3);
  }

  // world position to keep clear (the player's chest), or null to turn the cutaway off
  setCutaway(pos) {
    CUT.uCutOn.value = pos ? 1 : 0;
    if (pos) CUT.uCutPos.value.copy(pos);
  }

  render(time) {
    const r = this.renderer;
    r.setRenderTarget(this.colorRT);
    r.render(this.scene, this.camera);

    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = this.normalClear;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMat;
    const hidden = [];
    for (const o of noEdges) if (o.visible) { o.visible = false; hidden.push(o); }
    r.setRenderTarget(this.normalRT);
    r.render(this.scene, this.camera);
    for (const o of hidden) o.visible = true;
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;

    this.quad.material.uniforms.uTime.value = time;
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}

// ---------- the dawn clearing ----------

export function facet(g) {
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Builds the misty clearing: bare paper ground, a red dawn sun, pen-hatched mountains,
// pines, stones and quick grass strokes.
export function buildEnvironment(scene) {
  const rand = seeded(7);
  scene.background = new THREE.Color(COLORS.paper);
  scene.fog = new THREE.Fog(COLORS.paper, 18, 105);

  // the ground is empty paper: no shading, only the marks drawn on it
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), flat(COLORS.paper));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  // ink ring of stones marking the edge of the clearing
  const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    const r = ARENA_RADIUS + 1.2 + rand() * 0.8;
    const s = new THREE.Mesh(stoneGeo, hatch(0.62));
    s.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    s.scale.set(0.6 + rand(), 0.4 + rand() * 0.5, 0.6 + rand());
    s.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    scene.add(s);
  }

  // the red dawn sun: the only red in the world besides blood
  const sunDisk = new THREE.Mesh(new THREE.CircleGeometry(9, 48), flat(COLORS.red, { fog: false }));
  sunDisk.position.set(-40, 16, -140);
  sunDisk.lookAt(0, 6, 0);
  scene.add(sunDisk);

  // distant mountains: hatched, then swallowed by mist
  const mountainGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 50;
    const h = 18 + rand() * 30;
    const m = new THREE.Mesh(mountainGeo, hatch(0.55 + (i % 3) * 0.12, COLORS.paper, 1.6));
    m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    m.scale.set(14 + rand() * 18, h, 14 + rand() * 18);
    m.rotation.y = rand() * 3;
    scene.add(m);
  }

  // pines: a leaning trunk and stacked, flat-bottomed needle clouds
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.22, 1, 7);
  const canopyGeo = facet(new THREE.IcosahedronGeometry(1, 1));
  const branchGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 5);
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const r = ARENA_RADIUS + 6 + rand() * 30;
    const tree = new THREE.Group();
    const h = 4 + rand() * 4;
    const lean = (rand() - 0.5) * 0.35;
    const trunk = new THREE.Mesh(trunkGeo, hatch(0.28));
    trunk.scale.set(1, h, 1);
    trunk.position.set(Math.sin(lean) * h * 0.5, h / 2, 0);
    trunk.rotation.z = -lean;
    tree.add(trunk);
    // branches reach out sideways, each ending in a flat pad of needles
    const pads = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < pads; j++) {
      const y = h * (0.45 + (j / pads) * 0.55);
      const ang = rand() * Math.PI * 2;
      const reach = j === pads - 1 ? 0.2 : 0.9 + rand() * 1.1;
      const from = new THREE.Vector3(Math.sin(lean) * y, y, 0);
      const to = from.clone().add(new THREE.Vector3(Math.cos(ang) * reach, 0.25 + rand() * 0.3, Math.sin(ang) * reach));
      if (reach > 0.3) {
        const br = new THREE.Mesh(branchGeo, hatch(0.3));
        const dir = to.clone().sub(from);
        br.position.copy(from).addScaledVector(dir, 0.5);
        br.scale.set(1, dir.length(), 1);
        br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        tree.add(br);
      }
      const c = new THREE.Mesh(canopyGeo, hatch(0.5 + (j % 2) * 0.1));
      const w = 0.9 + rand() * 0.7 + (j === 0 ? 0.3 : 0);
      c.scale.set(w, 0.28 + rand() * 0.12, w * (0.7 + rand() * 0.3));
      c.position.copy(to);
      c.rotation.y = rand() * 3;
      tree.add(c);
    }
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rand() * 6;
    scene.add(tree);
  }

  // grass: quick pen flicks, denser outside the dueling circle
  const blade = new THREE.PlaneGeometry(0.025, 0.45);
  blade.translate(0, 0.22, 0);
  const grassMat = flat(COLORS.ink, { side: THREE.DoubleSide });
  const count = 1800;
  const grass = new THREE.InstancedMesh(blade, grassMat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let r = ARENA_RADIUS * 0.3 + Math.pow(rand(), 0.7) * 40;
    if (r < ARENA_RADIUS && rand() < 0.8) r += ARENA_RADIUS;
    const a = rand() * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dummy.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
    const s = 0.4 + rand() * 1.2;
    dummy.scale.set(1, s, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grass);
  noEdges.add(grass);

  return { sunDisk };
}
