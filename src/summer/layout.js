// The shape of the Summer valley as plain data: the rainy season, a long road north from a
// boat bridge over the swollen river, up between flooded rice terraces, through a lantern
// village and a bamboo forest, across the river again at a ford, and up the hydrangea steps
// to the temple. terrain.js turns it into ground; world.js into props.
import * as THREE from 'three';

// the mapped rectangle, in meters: +z is south (the boat bridge), -z north (the temple)
export const MAP = { x0: -140, x1: 140, z0: -620, z1: 150 };

// Roads as control points (x, z)
export const ROADS = [
  // the main road, south to north: the farms below the river, the boat bridge, the landing,
  // the rice terraces, the lotus pond, the lantern village, the bamboo, the ford, the climb,
  // the hydrangea steps and the temple
  { w: 3.4, pts: [[4, 140], [2, 118], [0, 96], [-4, 76], [4, 54], [8, 32], [0, 10], [-8, -12], [-4, -36], [8, -60], [6, -86],
    [-4, -110], [-12, -134], [-6, -158], [6, -182], [8, -206], [2, -230], [-2, -252], [4, -276], [14, -300], [12, -326],
    [-2, -350], [-14, -376], [-10, -402], [4, -428], [12, -454], [6, -480], [0, -506], [0, -530], [0, -550]] },
  // the terrace path: west from the landing, along the rice terraces above the river, past
  // the water wheel, and back to the road below the village
  { w: 1.8, pts: [[-1, 50], [-18, 46], [-34, 32], [-44, 10], [-50, -14], [-48, -40], [-38, -62], [-22, -80], [-6, -92]] },
  // the bamboo path: east off the road at the end of the village, deep into the bamboo to
  // the moss garden, and back to the road above the ford
  { w: 1.8, pts: [[-4, -162], [14, -168], [32, -180], [48, -194], [56, -210], [50, -224], [34, -230], [16, -232], [3, -230]] },
];
// The river comes down off the eastern mountains, crosses the road at the ford, runs south
// along the west side of the valley below the terraces, and crosses back under the boat
// bridge on its way out east.
export const RIVER = { pts: [[156, -280], [112, -268], [68, -260], [30, -256], [-2, -252], [-36, -244], [-66, -224], [-84, -190],
  [-92, -150], [-88, -110], [-92, -70], [-88, -30], [-84, 10], [-72, 48], [-46, 80], [-12, 94], [24, 100], [64, 106], [108, 100], [156, 106]] };

export function curve(pts, y = 0) {
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
}
export const roadCurves = ROADS.map((r) => ({ w: r.w, curve: curve(r.pts) }));
export const riverCurve = curve(RIVER.pts);
export const mainRoad = roadCurves[0].curve;

// the fraction along the main road where it reaches a given z
export function tAtZ(z, c = mainRoad) {
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000, d = Math.abs(c.getPointAt(t).z - z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// A spot beside the main road: off meters to one side (-1 west, 1 east), facing the road.
// ry turns a building so its door (local +z) faces the road; door: where you stand to go in.
export function beside(t, side, off, depth = 0, c = mainRoad) {
  const p = c.getPointAt(t), tan = c.getTangentAt(t);
  const nx = -tan.z * side, nz = tan.x * side;
  const x = p.x + nx * off, z = p.z + nz * off;
  return { t, x, z, ry: Math.atan2(-nx, -nz), door: [x - nx * depth, z - nz * depth], road: [p.x, p.z] };
}

// Where fighters wait (z on the main road, or a fraction t along another road). Who stands
// on each spot is drawn fresh every journey (see ROSTER in main.js): a road spot takes one
// of the road fighters, an elite spot one of the elites. The side paths keep their own.
export const DUEL_PLAN = [
  { id: 'landing', pool: 'road', z: 70 },
  { id: 'paddies', pool: 'road', z: -52 },
  { id: 'village', pool: 'road', z: -184 },
  { id: 'bamboo', pool: 'road', z: -302 },
  { id: 'climb', pool: 'elite', z: -388 },
  { id: 'steps', pool: 'elite', z: -470 },
  // the side paths' own fighters
  { id: 'farmer', road: 1, t: 0.5 },
  { id: 'umbrella', road: 2, t: 0.62 },
];
// Predetermined spots where an ambusher may lie in wait, off one side of the road (side);
// every journey some of them are taken at random (see AMBUSH_COUNT).
export const AMBUSH_PLAN = [
  { z: 112, side: 1 },
  { z: 20, side: 1 },
  { z: -96, side: 1 },
  { z: -238, side: -1 },
  { z: -282, side: -1 },
  { z: -340, side: 1 },
  { z: -430, side: -1 },
  { road: 1, t: 0.22, side: 1 },
  { road: 1, t: 0.8, side: -1 },
  { road: 2, t: 0.3, side: -1 },
  { road: 2, t: 0.86, side: 1 },
];
export const AMBUSH_COUNT = 6;
// the stops, in the order you meet them; all a few steps off the main road
export const STOP_PLAN = [
  { id: 'teahouse', kind: 'teahouse', name: 'Stilt Teahouse', z: 30, side: -1, off: 10, depth: 4.4, size: 7 },
  { id: 'frog', kind: 'shrine', name: 'Frog Shrine', z: -24, side: 1, off: 7, depth: 2.2, size: 3 },
  { id: 'inn', kind: 'inn', name: 'Lantern Inn', z: -124, side: -1, off: 10, depth: 4.4, size: 7 },
  { id: 'stranger', kind: 'gambler', name: "The Masked Stranger's Mat", z: -146, side: 1, off: 7.5, depth: 2.6, size: 4 },
  { id: 'dojo', kind: 'dojo', name: 'Bamboo Dojo', z: -208, side: -1, off: 11, depth: 5.4, size: 8.5 },
  { id: 'dragon', kind: 'shrine', name: 'Dragon Shrine', z: -272, side: -1, off: 7, depth: 2.2, size: 3 },
  { id: 'lodge', kind: 'inn', name: "Pilgrims' Lodge", z: -352, side: -1, off: 10, depth: 4.4, size: 7 },
  { id: 'dojo2', kind: 'dojo', name: 'Cedar Dojo', z: -418, side: 1, off: 11, depth: 5.4, size: 8.5 },
  // in the moss garden on the bamboo path
  { id: 'moss', kind: 'shrine', name: 'Moss Shrine', road: 2, t: 0.36, side: 1, off: 8, depth: 2.2, size: 3 },
];
// which stops share a stock list when a journey's offers are rolled (see rollStock)
export const STOCK_IDS = { dojos: ['dojo', 'dojo2'], shrines: ['frog', 'dragon', 'moss'], inns: ['inn', 'lodge'], teahouses: ['teahouse'] };
// set pieces
export const WATER_WHEEL = { road: 1, t: 0.66, side: -1, off: 9 }; // a mill by a channel off the terraces
export const LOTUS = { x: 34, z: 6, r: 9 }; // the lotus pond east of the road
export const MOSS_GARDEN = { road: 2, t: 0.5, side: 1, off: 12 }; // an old temple garden, left to the moss
export const VILLAGE = [-112, -170]; // the lantern village (z)
export const TEMPLE = { x: 0, z: -570, r: 16 }; // the hydrangea temple's courtyard, where the Rain Painter will wait
export const GATE = { x: 3, z: 136 };
export const STEPS = [-488, -548]; // the hydrangea steps up to the temple gate (z)
export const BAMBOO = [-176, -334]; // the bamboo forest (z)
// Summer's accent: the blue and violet of hydrangeas in the rain, alongside the red that
// marks danger, the lanterns and the temple
export const HYDRANGEA = { pale: 0xb9c3ee, blue: 0x7b95dc, violet: 0x9a7ccf, deep: 0x5868b8, ink: 0x262c66 };
