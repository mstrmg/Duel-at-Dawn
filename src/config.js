// Tuning constants for the combat prototype. Everything that affects feel lives here.

export const STANCE = { HIGH: 0, MID: 1, LOW: 2 };
export const STANCE_NAMES = ['High', 'Mid', 'Low'];
export const STANCE_KANJI = ['上', '中', '下'];

// Two stances, High (0) and Low (2). Index 1 (mid) is kept only for the draw-cut's
// level sweep. A guard covers the line of your stance, so a strike into the line
// he is not guarding (his open line) winds up faster.
export const STANCES = [0, 2];
export function counters(a, b) {
  return a !== b;
}
export function counterOf(s) {
  // the line left open by stance s
  return s === 0 ? 2 : 0;
}

export const PARRY_WINDOW = 0.2; // seconds after raising guard in which a matching block is a perfect parry
export const BLOCK_COOLDOWN = 0.28; // after lowering guard, before it can be raised again (stops parry spam)
export const STANCE_SWITCH_TIME = 0.14;
export const CLASH_WINDOW = 0.09; // two strikes landing this close together clash
export const ARENA_RADIUS = 12;

export const BREATH = {
  max: 100,
  regenIdle: 34, // standing still
  regenMove: 15, // moving
  regenBlock: 4, // holding guard
  regenDelay: 0.45, // pause after spending before regen kicks in
  windedTime: 1.7,
  windedRecoverTo: 45,
  stanceCost: 3,
};

export const DODGE = { time: 0.38, iStart: 0.02, iEnd: 0.28, dist: 3.0, cost: 20 };
// a committed step in: closes distance fast, cheaper than an evade, but no invulnerability
export const STEP = { time: 0.26, dist: 2.1, cost: 11 };
export const FEINT = { cost: 8, recover: 0.15, latest: 0.8 }; // latest: fraction of the windup

export const STAGGER_TIME = 1.1; // after being parried
export const HITSTUN_TIME = 0.45;

export const IAI = {
  sheatheTime: 0.22,
  chargeTime: 1.1,
  minCharge: 0.2,
  fullCharge: 0.85, // at or above this a draw-cut is unblockable and lethal
  drain: 9, // breath per second while charging
  cost: 22,
  lungeBase: 0.7,
  lungeExtra: 1.7,
  reach: 2.0,
  impactAt: 0.07,
  strikeTime: 0.16,
  missRecover: 1.05,
  hitRecover: 0.45,
};

export const PLAYER_DEF = {
  id: 'player',
  name: 'Wanderer',
  vitality: 3,
  speed: 2.8,
  radius: 0.45,
  turnRate: 14,
  weapon: {
    kind: 'katana',
    reach: 2.3,
    windup: 0.3,
    counterWindup: 0.21,
    active: 0.12,
    recover: 0.34,
    cost: 15,
    damage: 1,
    lunge: 0.55,
    arc: 1.0,
  },
};

export const RONIN_DEF = {
  id: 'ronin',
  name: 'The Ronin',
  title: 'a masterless blade on the spring road',
  vitality: 2,
  speed: 2.6,
  radius: 0.45,
  turnRate: 10,
  weapon: {
    kind: 'katana',
    reach: 2.2,
    windup: 0.62,
    counterWindup: 0.54,
    active: 0.12,
    recover: 0.55,
    cost: 15,
    damage: 1,
    lunge: 1.4,
    arc: 1.0,
  },
};

export const SPEARMAN_DEF = {
  id: 'spearman',
  name: 'The Spearman',
  title: 'keeper of the bridge, long of reach',
  vitality: 2,
  speed: 2.3,
  radius: 0.5,
  turnRate: 8,
  weapon: {
    kind: 'yari',
    reach: 3.5,
    windup: 0.8,
    counterWindup: 0.72,
    active: 0.16,
    recover: 0.8,
    cost: 18,
    damage: 1,
    lunge: 0.6,
    arc: 0.5, // thrusts are narrow: sidestep them
  },
};

// Blocking an attack costs the defender this much breath, by attacker weapon.
export const BLOCK_COST = { katana: 13, yari: 20, shove: 16 };

export const COLORS = {
  paper: 0xe9e2d0,
  ground: 0xd9d0bb,
  ink: 0x161514,
  red: 0xb3171d,
  skin: 0xd6cab2,
};
