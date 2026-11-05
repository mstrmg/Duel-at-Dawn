// The shape of the Spring valley as plain data: the roads, the river, and where the duels,
// the stops and the great shrine sit. terrain.js turns it into ground; world.js into props.
// Kept free of the DOM so the layout can be checked on its own.
import * as THREE from 'three';

// the mapped rectangle, in meters: +z is south (the gate), -z north (the great shrine)
export const MAP = { x0: -130, x1: 130, z0: -480, z1: 130 };

// Roads as control points (x, z)
export const ROADS = [
  // the main road, south to north: farmland, the inn, the crossroads, the river, the
  // bamboo forest, the climb past the teahouse and the mountain dojo, the red torii, the shrine
  { w: 3.4, pts: [[4, 116], [-2, 92], [6, 68], [2, 46], [-8, 26], [-6, 6], [4, -14], [6, -36], [0, -58], [-10, -82], [-14, -108],
    [-6, -134], [8, -158], [16, -184], [8, -210], [-8, -234], [-18, -258], [-12, -284], [2, -308], [10, -332], [6, -356],
    [1, -380], [0, -404], [0, -428]] },
  // a footpath west from the crossroads, over the stepping stones, back to the road in the bamboo
  { w: 1.7, pts: [[-8, 18], [-24, 12], [-38, 0], [-46, -22], [-44, -44], [-38, -66], [-28, -88], [-15, -110]] },
  // east to the lookout
  { w: 2.2, pts: [[-5, 4], [12, 0], [30, 8], [46, 2], [62, 10]] },
];
// the river runs west to east across the valley floor
export const RIVER = { pts: [[-150, -28], [-110, -40], [-80, -30], [-52, -46], [-26, -38], [-4, -46], [18, -40], [44, -54], [70, -42], [100, -52], [150, -44]] };

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
export function beside(t, side, off, depth = 0) {
  const p = mainRoad.getPointAt(t), tan = mainRoad.getTangentAt(t);
  const nx = -tan.z * side, nz = tan.x * side;
  const x = p.x + nx * off, z = p.z + nz * off;
  return { t, x, z, ry: Math.atan2(-nx, -nz), door: [x - nx * depth, z - nz * depth], road: [p.x, p.z] };
}

// who waits where (z on the main road, or a fraction t along another road)
export const DUEL_PLAN = [
  { id: 'ronin', z: 80 },
  { id: 'wanderer', road: 2, t: 0.5 },
  { id: 'spearman', z: -74 },
  { id: 'bandit', z: -150 },
  { id: 'masked', z: -282 },
  { id: 'sohei', z: -346 },
];
// the stops, in the order you meet them; all a few steps off the main road
export const STOP_PLAN = [
  { id: 'inn', kind: 'inn', name: 'Plum Hill Inn', z: 46, side: -1, off: 10, depth: 4.4, size: 7 },
  { id: 'dojo', kind: 'dojo', name: 'Willow Dojo', z: 18, side: 1, off: 11, depth: 5.4, size: 8.5 },
  { id: 'shrine', kind: 'shrine', name: 'Wayside Shrine', z: -20, side: 1, off: 7, depth: 2.2, size: 3 },
  { id: 'onsen', kind: 'onsen', name: 'Hot Spring', z: -100, side: 1, off: 10, depth: 4.4, size: 7 },
  { id: 'gambler', kind: 'gambler', name: "The Dice Player's Tarp", z: -128, side: -1, off: 7.5, depth: 2.6, size: 4 },
  { id: 'teahouse', kind: 'teahouse', name: 'Bamboo Teahouse', z: -206, side: -1, off: 10, depth: 4.4, size: 7 },
  { id: 'dojo2', kind: 'dojo', name: 'Cliffside Dojo', z: -246, side: 1, off: 11, depth: 5.4, size: 8.5 },
  { id: 'fox', kind: 'shrine', name: 'Fox Shrine', z: -310, side: -1, off: 7, depth: 2.2, size: 3 },
];
export const SHRINE = { x: 0, z: -444, r: 15 }; // the great shrine's forecourt, where the Petal Blade will wait
export const GATE = { x: 4, z: 118 };
export const TORII_RUN = [-364, -424]; // the tunnel of red torii on the last approach (z)
export const BAMBOO = [-112, -200]; // the bamboo forest (z)
