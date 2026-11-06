// What each stop beside the road offers. The inn and the teahouse sell rest, bandages and
// gear for coin; each dojo teaches one technique; each shrine grants one blessing; the hot
// spring mends wounds; the dice player takes bets. What the dojos teach, which blessings the
// shrines hold and which charms are for sale is rolled fresh for every journey (rollStock).
//
// Wounds are the run's vitality: every cut you take in a duel is a named wound (wounds.js)
// that takes something away until it is mended. Techniques, blessings and charms are arts:
// each adds a rule to how you fight, kept as an id in the wanderer's def.arts. The inn's
// sandals and whetstone are the only plain numbers left.
import { ARTS, WOUNDS, artsOf } from '../wounds.js';
import { KINDS } from '../gain.js';

export const COIN = '銭';
export const START_COIN = 20;

// a small seeded generator, so one journey's rolls hang together
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ids: which stops share out the stock (see rollStock); Summer has its own
export function newRun(baseDef, seed = Math.floor(Math.random() * 2 ** 31), ids = STOCK_IDS) {
  const def = { ...baseDef, weapon: { ...baseDef.weapon }, arts: [] };
  const run = {
    coin: START_COIN, wounds: [], def, speed: 1, purseBonus: 0, seed,
    techniques: [], blessings: [], charms: [], owned: new Set(), learned: {}, rolls: 0, won: 0,
  };
  run.stock = rollStock(rng(seed), ids);
  // vitality left: what the wounds have not taken
  Object.defineProperty(run, 'vit', { get() { return Math.max(0, this.def.vitality - this.wounds.length); } });
  return run;
}

// mend n wounds, the oldest first
const heal = (r, n) => { r.wounds.splice(0, n); };
const hurt = (r) => (r.wounds.length ? true : 'you are not wounded');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const art = (id, extra = {}) => ({ id, name: ARTS[id].name, text: ARTS[id].text, buy: (r) => r.def.arts.push(id), ...extra });

const INN = [
  { id: 'rest', name: 'Rest the night', text: 'wake whole: every wound mended', cost: 15, can: hurt,
    buy: (r) => heal(r, 99), say: 'You sleep through the night and wake whole.' },
  { id: 'bandage', name: 'Bandage a wound', text: 'the innkeeper\'s wife binds your oldest wound', cost: 8, can: hurt,
    buy: (r) => heal(r, 1), say: 'Clean cloth, rice wine on the cut. It will hold.' },
  { id: 'sandals', name: 'Straw sandals', text: 'walk and step 8% quicker', cost: 20, once: true,
    buy: (r) => { r.def.speed *= 1.08; r.speed *= 1.08; }, say: 'New sandals, light on the road.' },
  { id: 'whetstone', name: 'Whetstone', text: 'a keener edge: +15 cm reach', cost: 25, once: true,
    buy: (r) => { r.def.weapon.reach += 0.15; }, say: 'The edge takes a long, bright line.' },
];
const TEAHOUSE = [
  { id: 'tea', name: 'Green tea and dango', text: 'mend your oldest wound', cost: 6, can: hurt,
    buy: (r) => heal(r, 1), say: 'Bitter tea, sweet dango. A wound closes.' },
  { id: 'nap', name: 'Sleep in the back room', text: 'every wound mended', cost: 18, can: hurt,
    buy: (r) => heal(r, 99), say: 'You sleep to the sound of the bamboo.' },
];
// the charms, each with its price and what is said as you buy it
const CHARMS = {
  bell: { cost: 30, say: 'The little bell will ring when steel is coming.' },
  sageo: { cost: 22, say: 'You rewind the scabbard cord in red silk. The blade turns easier in your hands.' },
  tsuba: { cost: 26, say: 'A heavy iron guard, black and pitted. It sits well against your hand.' },
  metsubushi: { cost: 16, say: 'A paper twist of pepper and ash, tucked in your sleeve.' },
  hachimaki: { cost: 12, say: 'A strip of white cotton, tied tight above the eyes.' },
};
const charm = (id, rand) => art(id, { cost: CHARMS[id].cost + Math.round((rand() - 0.5) * 8), once: true, charm: true, say: CHARMS[id].say });
const blessing = (id) => (id === 'rice' ? art('rice', { buy: (r) => { r.def.arts.push('rice'); r.purseBonus += 15; } }) : art(id));
// the Spring valley's stops that hold stock
export const STOCK_IDS = { dojos: ['dojo', 'dojo2'], shrines: ['shrine', 'fox', 'falls'], inns: ['inn'], teahouses: ['teahouse'] };

// A journey's stock: each dojo teaches three of the techniques (never the same three), each
// shrine holds two of the blessings, each teahouse sells two charms and each inn one, beside
// one piece of gear.
export function rollStock(rand, ids = STOCK_IDS) {
  const stock = {};
  const tech = shuffle(artsOf('technique'), rand);
  ids.dojos.forEach((id, i) => { stock[id] = tech.slice(i * 3, i * 3 + 3).map((t) => art(t)); });
  const bless = shuffle(artsOf('blessing'), rand);
  ids.shrines.forEach((id, i) => { stock[id] = bless.slice(i * 2, i * 2 + 2).map(blessing); });
  const charms = shuffle(artsOf('charm'), rand);
  let c = 0;
  const nextCharm = () => charm(charms[c++ % charms.length], rand);
  for (const id of ids.teahouses) stock[id] = [...TEAHOUSE, nextCharm(), nextCharm()];
  const gear = INN.filter((o) => o.id === 'sandals' || o.id === 'whetstone');
  const first = Math.floor(rand() * gear.length);
  ids.inns.forEach((id, i) => { stock[id] = [...INN.filter((o) => !gear.includes(o)), gear[(first + i) % gear.length], nextCharm()]; });
  return stock;
}
const ONSEN = [
  { id: 'soak', name: 'Soak in the spring', text: 'mends two wounds; once a journey', once: true, can: hurt,
    buy: (r) => heal(r, 2), say: 'The heat goes into your bones. Two wounds close.' },
];
const GAMBLER = [
  { id: 'bet10', name: 'Roll for 10 銭', text: 'odd or even: win and he pays double', cost: 10, game: 10 },
  { id: 'bet25', name: 'Roll for 25 銭', text: 'the same game, a heavier purse', cost: 25, game: 25 },
];
const MAX_ROLLS = 3;

function list(stop, run) {
  switch (stop.kind) {
    case 'inn': case 'teahouse': case 'dojo': case 'shrine': return run.stock[stop.id] ?? [];
    case 'onsen': return ONSEN;
    case 'gambler': return GAMBLER;
    default: return [];
  }
}

// The offers at a stop, each with whether it can be taken now and why not.
export function offers(stop, run) {
  const chosen = run.learned[stop.id];
  return list(stop, run).map((o) => {
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
  if (stop.kind === 'dojo') { run.learned[stop.id] = o.name; run.techniques.push(o.name); return `The master shows you ${o.name}: ${o.text}.`; }
  if (stop.kind === 'shrine') { run.learned[stop.id] = o.name; run.blessings.push(o.name); return `A bell, a clap, a bow. ${cap(o.text)}.`; }
  return o.say;
}

const GREETING = {
  inn: ['rest, eat, and buy for the road', 'The innkeeper bows. "A long road, by the look of you."'],
  falls: ['a shrine behind the falling water', 'Spray drifts over the offering box. The water roars.'],
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
  if (stop.kind === 'great') return stop.card ? stop.card(run) : greatCard(stop, run);
  const items = offers(stop, run);
  const [sub, line] = stop.greeting ?? GREETING[stop.id] ?? GREETING[stop.kind];
  const done = run.learned[stop.id] ? DONE[stop.kind] : null;
  const say = note ?? done ?? line;
  const buttons = items.map((o, i) => `
    <button data-pick="${i}" ${o.why ? 'disabled' : ''}>
      <b${ARTS[o.id] ? ` style="color:${KINDS[ARTS[o.id].kind].color}"` : ''}>${o.name}</b><span>${o.text}</span>
      <kbd>${i + 1}${o.cost ? ` · ${o.cost} ${COIN}` : ''}${o.why ? ` · ${o.why}` : ''}</kbd>
    </button>`).join('');
  return `<div class="card stop">
    <h2>${stop.name}</h2>
    <p class="sub">${sub}</p>
    <p class="purse">${pips(run)}<span>${run.coin} ${COIN}</span></p>
    ${woundList(run)}
    <p class="say">${say}</p>
    <div class="choices">${buttons}</div>
    <div class="choices row"><button data-act="leave"><b>Back to the road</b><kbd>Esc</kbd></button></div>
  </div>`;
}

export function pips(run) {
  return `<span class="pips">${Array.from({ length: run.def.vitality }, (_, i) => `<i class="${i < run.vit ? '' : 'lost'}"></i>`).join('')}</span>`;
}

// the wounds you carry, each with what it takes away
export function woundList(run) {
  if (!run.wounds.length) return '';
  return `<ul class="wounds">${run.wounds.map((w) => `<li><b>${WOUNDS[w].name}</b> ${WOUNDS[w].text}</li>`).join('')}</ul>`;
}

// the end of the road, for now: the forecourt where the Petal Blade waits
function greatCard(stop, run) {
  const kept = [...run.techniques, ...run.blessings, ...run.charms];
  return `<div class="card stop">
    <h2>${stop.name}</h2>
    <p class="sub">the end of the spring road</p>
    <p class="say">${run.colors?.includes('hakama')
      ? 'The cherries over the forecourt are in full color again. The Petal Blade lies where he fell. The road to Summer is not open yet.'
      : 'Petals settle on the forecourt where the Petal Blade waits.'}</p>
    <p class="purse">${pips(run)}<span>${run.coin} ${COIN}</span><span>${run.won} duels won</span></p>
    ${kept.length ? `<p class="say">You carry ${kept.join(', ')}.</p>` : ''}
    <div class="choices row">
      <button data-act="leave"><b>Back to the road</b><kbd>Esc</kbd></button>
      <button data-act="newrun"><b>Begin a new journey</b><kbd>N</kbd></button>
    </div>
  </div>`;
}
