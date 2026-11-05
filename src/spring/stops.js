// What each stop beside the road offers. The inn and the teahouse sell rest, food and gear
// for coin; each dojo teaches one technique; each shrine grants one blessing; the hot
// spring mends wounds; the dice player takes bets. Everything works by changing the run:
// its coin, its vitality, or the wanderer's def, which the fighter reads its stats from
// (speed, reach, the weapon's timings, and the optional multipliers breathRegen,
// blockCost, dodgeCost, iaiCharge, stanceCost, parryWindow and parryBreath).

export const COIN = '銭';
export const START_COIN = 20;

export function newRun(baseDef) {
  const def = { ...baseDef, weapon: { ...baseDef.weapon } };
  return {
    coin: START_COIN, vit: def.vitality, def, speed: 1, purseBonus: 0,
    techniques: [], blessings: [], charms: [], owned: new Set(), learned: {}, rolls: 0, won: 0,
  };
}

const heal = (r, n) => { r.vit = Math.min(r.def.vitality, r.vit + n); };
const hurt = (r) => (r.vit < r.def.vitality ? true : 'you are not wounded');
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const INN = [
  { id: 'rest', name: 'Rest the night', text: 'wake whole: full vitality', cost: 15, can: hurt,
    buy: (r) => heal(r, 99), say: 'You sleep through the night and wake whole.' },
  { id: 'onigiri', name: 'Onigiri', text: 'rice for the road: +1 vitality', cost: 8, can: hurt,
    buy: (r) => heal(r, 1), say: 'Salted rice and pickled plum. A wound closes.' },
  { id: 'sandals', name: 'Straw sandals', text: 'walk and step 8% quicker', cost: 20, once: true,
    buy: (r) => { r.def.speed *= 1.08; r.speed *= 1.08; }, say: 'New sandals, light on the road.' },
  { id: 'whetstone', name: 'Whetstone', text: 'a keener edge: +15 cm reach', cost: 25, once: true,
    buy: (r) => { r.def.weapon.reach += 0.15; }, say: 'The edge takes a long, bright line.' },
];
const TEAHOUSE = [
  { id: 'tea', name: 'Green tea and dango', text: '+1 vitality', cost: 6, can: hurt,
    buy: (r) => heal(r, 1), say: 'Bitter tea, sweet dango. You breathe easier.' },
  { id: 'nap', name: 'Sleep in the back room', text: 'full vitality', cost: 18, can: hurt,
    buy: (r) => heal(r, 99), say: 'You sleep to the sound of the bamboo.' },
  { id: 'bell', name: 'Bell charm', text: 'a perfect parry has a wider window (+40%)', cost: 30, once: true, charm: true,
    buy: (r) => { r.def.parryWindow = 1.4; }, say: 'The little bell rings true when steel meets steel.' },
  { id: 'cord', name: 'Red sageo cord', text: 'switching stance costs no breath', cost: 22, once: true, charm: true,
    buy: (r) => { r.def.stanceCost = 0; }, say: 'You rewind the scabbard cord in red silk.' },
];
const DOJOS = {
  dojo: [
    { id: 'swiftdraw', name: 'Swift Draw', text: 'the draw-cut charges a third faster', buy: (r) => { r.def.iaiCharge = 0.65; } },
    { id: 'ironwrist', name: 'Iron Wrist', text: 'blocking costs 40% less breath', buy: (r) => { r.def.blockCost = 0.6; } },
    { id: 'windstep', name: 'Wind Step', text: 'evades and steps cost a third less breath', buy: (r) => { r.def.dodgeCost = 0.65; } },
  ],
  dojo2: [
    { id: 'swiftcut', name: 'Swift Cut', text: 'your strikes wind up 12% faster',
      buy: (r) => { r.def.weapon.windup *= 0.88; r.def.weapon.counterWindup *= 0.88; } },
    { id: 'recovery', name: 'Falling Leaf', text: 'you recover from a strike 20% sooner', buy: (r) => { r.def.weapon.recover *= 0.8; } },
    { id: 'lighthand', name: 'Light Hand', text: 'strikes cost 30% less breath', buy: (r) => { r.def.weapon.cost *= 0.7; } },
  ],
};
const SHRINES = {
  shrine: [
    { id: 'wind', name: 'Blessing of the Wind', text: 'breath returns 25% faster', buy: (r) => { r.def.breathRegen = 1.25; } },
    { id: 'petal', name: 'Blessing of the Petal', text: '+1 vitality, and a wound mended', buy: (r) => { r.def.vitality += 1; heal(r, 1); } },
  ],
  fox: [
    { id: 'fox', name: 'Blessing of the Fox', text: 'each perfect parry gives back 25 breath', buy: (r) => { r.def.parryBreath = 25; } },
    { id: 'rice', name: 'Blessing of the Rice', text: '+15 銭 from every duel you win', buy: (r) => { r.purseBonus += 15; } },
  ],
};
const ONSEN = [
  { id: 'soak', name: 'Soak in the spring', text: 'mends two wounds; once a journey', once: true, can: hurt,
    buy: (r) => heal(r, 2), say: 'The heat goes into your bones. Two wounds close.' },
];
const GAMBLER = [
  { id: 'bet10', name: 'Roll for 10 銭', text: 'odd or even: win and he pays double', cost: 10, game: 10 },
  { id: 'bet25', name: 'Roll for 25 銭', text: 'the same game, a heavier purse', cost: 25, game: 25 },
];
const MAX_ROLLS = 3;

function list(stop) {
  switch (stop.kind) {
    case 'inn': return INN;
    case 'teahouse': return TEAHOUSE;
    case 'dojo': return DOJOS[stop.id];
    case 'shrine': return SHRINES[stop.id];
    case 'onsen': return ONSEN;
    case 'gambler': return GAMBLER;
    default: return [];
  }
}

// The offers at a stop, each with whether it can be taken now and why not.
export function offers(stop, run) {
  const chosen = run.learned[stop.id];
  return list(stop).map((o) => {
    let why = null;
    if (stop.kind === 'dojo' || stop.kind === 'shrine') why = chosen ? (chosen === o.name ? 'yours' : 'one only') : null;
    else if (o.once && run.owned.has(o.id)) why = o.charm ? 'bought' : 'done';
    else if (o.can && o.can(run) !== true) why = o.can(run);
    else if (o.game && run.rolls >= MAX_ROLLS) why = 'he has had enough of you';
    else if (o.cost && run.coin < o.cost) why = `not enough ${COIN}`;
    return { ...o, why };
  });
}

// Take offer i. Returns a line to show, or null if it can't be taken.
export function take(stop, run, i, roll = Math.random) {
  const o = offers(stop, run)[i];
  if (!o || o.why) return null;
  if (o.game) {
    run.rolls++;
    const dice = [1 + Math.floor(roll() * 6), 1 + Math.floor(roll() * 6)];
    const even = (dice[0] + dice[1]) % 2 === 0;
    // you always call even; he never lets you forget it
    if (even) { run.coin += o.game; return `${dice[0]} and ${dice[1]}: even. He pays, scowling. +${o.game} ${COIN}`; }
    run.coin -= o.game;
    return `${dice[0]} and ${dice[1]}: odd. He sweeps up your coin. -${o.game} ${COIN}`;
  }
  if (o.cost) run.coin -= o.cost;
  o.buy(run);
  run.owned.add(o.id);
  if (o.charm) run.charms.push(o.name);
  if (stop.kind === 'dojo') { run.learned[stop.id] = o.name; run.techniques.push(o.name); return `The master shows you ${o.name}. ${cap(o.text)}.`; }
  if (stop.kind === 'shrine') { run.learned[stop.id] = o.name; run.blessings.push(o.name); return `A bell, a clap, a bow. ${cap(o.text)}.`; }
  return o.say;
}

const GREETING = {
  inn: ['rest, eat, and buy for the road', 'The innkeeper bows. "A long road, by the look of you."'],
  teahouse: ['tea, a bed, and charms for travelers', 'The old woman pours before you ask. "Up the mountain? Drink first."'],
  dojo: ['a master teaches one technique', 'The master looks you over. "One thing. Choose it well."'],
  shrine: ['a blessing for the road', 'Petals on the offering box. The bell rope sways.'],
  onsen: ['a hot spring in the bamboo', 'Steam curls off the water. Nobody else is here.'],
  gambler: ['odd or even, two dice in a cup', '"You look lucky," says the dice player, who does not.'],
};
const DONE = {
  dojo: '"That is all I will teach you this season."',
  shrine: 'The shrine has blessed you already.',
};

export function stopCard(stop, run, note = null) {
  if (stop.kind === 'great') return greatCard(stop, run);
  const items = offers(stop, run);
  const [sub, line] = GREETING[stop.kind];
  const done = run.learned[stop.id] ? DONE[stop.kind] : null;
  const say = note ?? done ?? line;
  const buttons = items.map((o, i) => `
    <button data-pick="${i}" ${o.why ? 'disabled' : ''}>
      <b>${o.name}</b><span>${o.text}</span>
      <kbd>${i + 1}${o.cost ? ` · ${o.cost} ${COIN}` : ''}${o.why ? ` · ${o.why}` : ''}</kbd>
    </button>`).join('');
  return `<div class="card stop">
    <h2>${stop.name}</h2>
    <p class="sub">${sub}</p>
    <p class="purse">${pips(run)}<span>${run.coin} ${COIN}</span></p>
    <p class="say">${say}</p>
    <div class="choices">${buttons}</div>
    <div class="choices row"><button data-act="leave"><b>Back to the road</b><kbd>Esc</kbd></button></div>
  </div>`;
}

export function pips(run) {
  return `<span class="pips">${Array.from({ length: run.def.vitality }, (_, i) => `<i class="${i < run.vit ? '' : 'lost'}"></i>`).join('')}</span>`;
}

// the end of the road, for now: the forecourt where the Petal Blade will wait
function greatCard(stop, run) {
  const kept = [...run.techniques, ...run.blessings, ...run.charms];
  return `<div class="card stop">
    <h2>${stop.name}</h2>
    <p class="sub">the end of the spring road</p>
    <p class="say">Petals settle on the empty forecourt. The Petal Blade is not here yet; when he comes, he will wait for you on this ground.</p>
    <p class="purse">${pips(run)}<span>${run.coin} ${COIN}</span><span>${run.won} duels won</span></p>
    ${kept.length ? `<p class="say">You carry ${kept.join(', ')}.</p>` : ''}
    <div class="choices row">
      <button data-act="leave"><b>Back to the road</b><kbd>Esc</kbd></button>
      <button data-act="newrun"><b>Begin a new journey</b><kbd>N</kbd></button>
    </div>
  </div>`;
}
