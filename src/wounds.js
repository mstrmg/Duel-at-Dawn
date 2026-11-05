// Wounds and arts: the things that change how a duel is fought, not just its numbers.
//
// Every cut that lands leaves a wound where it landed, and each wound takes something away
// until it is healed: blood in the eye hides his tells, a cut thigh takes away the evade,
// and so on. The player carries wounds from duel to duel on the road. Enemies suffer the
// same wounds within a duel, so where you cut him matters too.
//
// Arts are what the wanderer learns and is given on the road (techniques from the dojos,
// blessings from the shrines, charms from the teahouse). Each adds a rule. The fighter
// carries them as ids in def.arts; Fighter.has(id) checks for one.

export const WOUNDS = {
  brow: {
    name: 'Cut brow',
    text: 'blood in your eye: you cannot see his glint or his line, only hear the tell',
    foe: 'blood in his eye: he reads your line late',
  },
  thigh: {
    name: 'Cut thigh',
    text: 'you cannot evade, only limp a step, and your footwork is slow',
    foe: 'he cannot evade, and his footwork is slow',
  },
  side: {
    name: 'Pierced side',
    text: 'your guard will not hold: it slips after a moment',
    foe: 'his guard slips after a moment',
  },
  arm: {
    name: 'Cut forearm',
    text: 'you cannot sheathe cleanly: no draw-cut',
    foe: 'he cannot strike twice in a row',
  },
};
// the order further wounds fall in, when the first is already taken
export const WOUND_ORDER = ['brow', 'thigh', 'side', 'arm'];

// Where a blow lands, by how it was thrown: a thrust pierces the side, a sweep or a low cut
// takes the thigh, a side cut the forearm, a high cut the brow.
export function woundFor(a) {
  if (!a) return 'side';
  if (a.kind === 'thrust' || a.move === 'lunge' || a.iai) return 'side';
  if (a.kind === 'sweep') return 'thigh';
  if (a.move === 'side') return 'arm';
  return a.stance === 0 ? 'brow' : 'thigh';
}

// The next wound a fighter takes: the one the blow asked for, or the next one he lacks.
export function nextWound(have, want) {
  if (!have.includes(want)) return want;
  return WOUND_ORDER.find((w) => !have.includes(w)) ?? want;
}

// Every art, by id: its name and what it does, for the stops and the HUD.
export const ARTS = {
  // the Willow Dojo
  kiriotoshi: { name: 'Cutting Down', text: 'when your blade meets his in the same line, yours cuts his aside and lands' },
  kaeshi: { name: 'Answering Blade', text: 'strike just after you block a blow and your cut comes at once' },
  ryusui: { name: 'Flowing Guard', text: 'while you hold guard, it follows the line of his windup on its own' },
  // the Cliffside Dojo
  nidan: { name: 'Second Draw', text: 'after a draw-cut, strike again at once: a miss no longer leaves you open' },
  irimi: { name: 'Slip Inside', text: 'evade a blow as it lands and your next strike cannot be guarded' },
  teppeki: { name: 'Iron Gate', text: 'strike out of your guard and the guard stays up in that line through your windup' },
  // the shrines
  petal: { name: 'Blessing of the Petal', text: 'once a journey, the petals take a killing blow for you' },
  wind: { name: 'Blessing of the Wind', text: 'the first time you would be winded in a duel, your breath comes back full' },
  fox: { name: 'Blessing of the Fox', text: 'fox-fire: you see through his feints, his glint burns pale when he means to pull it' },
  rice: { name: 'Blessing of the Rice', text: '+15 銭 from every duel you win' },
  // the teahouse's charms
  bell: { name: 'Bell charm', text: 'a little bell rings at the moment to raise your parry' },
  sageo: { name: 'Red sageo cord', text: 'Q or E during your own windup turns the cut into the other line' },
};
