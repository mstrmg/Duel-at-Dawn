// What each stop beside the road offers. The inn sells rest, food and gear for coin; the
// dojo teaches one technique; the wayside shrine grants one blessing. Everything works by
// changing the run: its coin, its vitality, or the wanderer's def, which the fighter reads
// its stats from (speed, reach, and the optional multipliers breathRegen, blockCost,
// dodgeCost and iaiCharge).

export const COIN = '銭';
export const START_COIN = 20;
export const DUEL_PURSE = 25; // coin taken from each fighter you beat

export function newRun(baseDef) {
  const def = { ...baseDef, weapon: { ...baseDef.weapon } };
  return { coin: START_COIN, vit: def.vitality, def, speed: 1, blessing: null, technique: null, owned: new Set() };
}

const heal = (r, n) => { r.vit = Math.min(r.def.vitality, r.vit + n); };
const hurt = (r) => (r.vit < r.def.vitality ? true : 'you are not wounded');

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
const DOJO = [
  { id: 'swiftdraw', name: 'Swift Draw', text: 'the draw-cut charges a third faster',
    buy: (r) => { r.def.iaiCharge = 0.65; } },
  { id: 'ironwrist', name: 'Iron Wrist', text: 'blocking costs 40% less breath',
    buy: (r) => { r.def.blockCost = 0.6; } },
  { id: 'windstep', name: 'Wind Step', text: 'evades and steps cost a third less breath',
    buy: (r) => { r.def.dodgeCost = 0.65; } },
];
const SHRINE = [
  { id: 'wind', name: 'Blessing of the Wind', text: 'breath returns 25% faster',
    buy: (r) => { r.def.breathRegen = 1.25; } },
  { id: 'petal', name: 'Blessing of the Petal', text: '+1 vitality, and a wound mended',
    buy: (r) => { r.def.vitality += 1; heal(r, 1); } },
];

// The offers at a stop, each with whether it can be taken now and why not.
export function offers(stop, run) {
  if (stop.kind === 'inn') {
    return INN.map((o) => {
      let why = null;
      if (o.once && run.owned.has(o.id)) why = 'bought';
      else if (o.can && o.can(run) !== true) why = o.can(run);
      else if (run.coin < o.cost) why = `not enough ${COIN}`;
      return { ...o, why };
    });
  }
  const list = stop.kind === 'dojo' ? DOJO : SHRINE;
  const taken = stop.kind === 'dojo' ? run.technique : run.blessing;
  return list.map((o) => ({ ...o, why: taken ? (taken === o.name ? 'yours' : 'one only') : null }));
}

// Take offer i. Returns a line to show, or null if it can't be taken.
export function take(stop, run, i) {
  const o = offers(stop, run)[i];
  if (!o || o.why) return null;
  if (o.cost) run.coin -= o.cost;
  o.buy(run);
  run.owned.add(o.id);
  if (stop.kind === 'dojo') { run.technique = o.name; return `The master shows you ${o.name}. ${cap(o.text)}.`; }
  if (stop.kind === 'shrine') { run.blessing = o.name; return `A bell, a clap, a bow. ${cap(o.text)}.`; }
  return o.say;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const GREETING = {
  inn: ['rest, eat, and buy for the road', 'The innkeeper bows. "A long road, by the look of you."'],
  dojo: ['an old master teaches one technique', 'The master looks you over. "One thing. Choose it well."'],
  shrine: ['a blessing for the road', 'Petals on the offering box. The bell rope sways.'],
};

export function stopCard(stop, run, note = null) {
  const list = offers(stop, run);
  const [sub, line] = GREETING[stop.kind];
  const done = stop.kind === 'dojo' ? run.technique : stop.kind === 'shrine' ? run.blessing : null;
  const say = note ?? (done ? (stop.kind === 'dojo' ? `"That is all I will teach you this season."` : 'The shrine has blessed you already.') : line);
  const pips = Array.from({ length: run.def.vitality }, (_, i) => `<i class="${i < run.vit ? '' : 'lost'}"></i>`).join('');
  const buttons = list.map((o, i) => `
    <button data-pick="${i}" ${o.why ? 'disabled' : ''}>
      <b>${o.name}</b><span>${o.text}</span>
      <kbd>${i + 1}${o.cost ? ` · ${o.cost} ${COIN}` : ''}${o.why ? ` · ${o.why}` : ''}</kbd>
    </button>`).join('');
  return `<div class="card stop">
    <h2>${stop.name}</h2>
    <p class="sub">${sub}</p>
    <p class="purse"><span class="pips">${pips}</span><span>${run.coin} ${COIN}</span></p>
    <p class="say">${say}</p>
    <div class="choices">${buttons}</div>
    <div class="choices row"><button data-act="leave"><b>Back to the road</b><kbd>Esc</kbd></button></div>
  </div>`;
}
