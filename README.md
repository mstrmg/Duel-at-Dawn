# Duel at Dawn

An ink wash samurai dueling roguelike in Three.js. See `CLAUDE.md` for the full design.

This is step 1 of the plan: the **combat prototype**. One wanderer, one sword, two opponents (the Ronin and the Spearman), with placeholder shapes for art.

## Run it

```bash
npm install
npm run dev      # then open the URL it prints (http://localhost:5173)
```

`npm run build` writes a static build to `dist/` that runs from any static host. `npm run build:single` bundles everything into one self-contained `dist/duel-at-dawn.html` you can open or publish directly.

## The Spring map

`spring.html` is the Spring region, separate from combat for now (open `/spring.html` under `npm run dev`). It is finished except for the boss: a long valley, about 560 m from the south gate to the great shrine, with six fighters and eight stops on the way. Cherry trees, azaleas, wildflowers and drifting petals are pink, Spring's accent color.

The road, south to north:

1. **The south gate**, between terraced tea fields. **The Ronin** waits on the first stretch.
2. **Plum Hill Inn**, then **the crossroads**: **Willow Dojo** on the corner, the lookout road east (where **the Wandering Ronin** keeps a great cherry to himself), a footpath west that fords the river on stepping stones.
3. **The Red Bridge** over the river: snowmelt in a carved channel, inked currents, rocks with ripples, petals riding the water. **The Wayside Shrine** is just past it, then **the Spearman**.
4. **The Hot Spring** beside the road, steaming in its ring of stones by a little bathhouse.
5. **The bamboo forest**: **the Dice Player's Tarp**, **the Bamboo Bandit**, and **the Bamboo Teahouse** at the far edge.
6. **The climb**: pines, rock and switchbacks. **Cliffside Dojo**, then **the Masked Duelist** (elite), then **the Fox Shrine**.
7. **The thousand torii**: a red tunnel of gates with **the Temple Guard** (elite, a warrior monk with a long spear) before it, and at its end **the Shrine of the Petal Blade**, whose forecourt is where the boss will wait.

WASD walks (relative to the camera), Shift runs, the mouse looks (click to lock it, or drag), the arrow keys turn the camera, and the wheel sets its distance. Trees and buildings between the camera and the wanderer are cut away around him. **M** opens the road map: the valley unrolled as a sideways scroll, read right to left, with every stop, every fighter (a red slash waiting, a red cross for an elite, a grey cross once beaten) and an arrow for you.

**Duels.** Each fighter turns to watch you come. Walk within 10 m and a short cutscene plays (Space, Enter or a click skips it), then the duel starts on a level patch of road 13 m in radius. The elites take three cuts, not two. Win and you take his purse (20 to 40 銭) and walk on; the wounds he gave you stay until they are mended (see Wounds below). **Death ends the journey**: a new wanderer sets out from the south gate with 20 銭, and every fighter is back on the road. "Rise again" lets you refight the duel as practice, but that fighter's purse is then forfeit.

**Stops.** Every stop sits a few steps off the main road, facing it across a trodden yard. Walk up to the door and press E; 1 to 4 choose, Esc (or E) goes back out. The corner of the screen shows your vitality, coin, wounds, techniques, blessings and charms while you walk. Techniques, blessings and charms each add a rule to how you fight, not a number (`src/wounds.js` lists them). You start with 20 銭.

- **Plum Hill Inn**: rest the night to mend every wound (15 銭), bandage your oldest wound (8 銭), straw sandals to walk and step 8% quicker (20 銭), a whetstone for +15 cm reach (25 銭).
- **Willow Dojo**: learn one technique. **Cutting Down**: when your blade meets his in the same line, yours cuts his aside and lands. **Answering Blade**: strike just after you block and your cut comes at once. **Flowing Guard**: while you hold guard it follows the line of his windup on its own.
- **Wayside Shrine**: one blessing. **The Petal** takes a killing blow for you, once a journey. **The Wind** gives you a second wind the first time you would be winded in a duel.
- **Hot Spring**: a soak mends two wounds, once a journey, free.
- **The Dice Player**: odd or even for 10 or 25 銭; win and he pays double (you always call even). Three rolls and he has had enough of you.
- **Bamboo Teahouse**: tea and dango mend your oldest wound (6 銭), a nap mends them all (18 銭), and charms: the **Bell charm** rings at the moment to raise your parry (30 銭); the **Red sageo cord** lets Q or E during your own windup turn the cut into the other line (22 銭).
- **Cliffside Dojo**: one more technique. **Second Draw**: after a draw-cut, strike again at once. **Slip Inside**: evade a blow as it lands and your next strike cannot be guarded. **Iron Gate**: strike out of your guard and the guard stays up in that line through your windup.
- **Fox Shrine**: one more blessing. **The Fox** shows you his feints: the glint burns pale blue when he means to pull the strike. **The Rice** adds 15 銭 to every purse you win.
- **Shrine of the Petal Blade**: the end of the road for now. It shows what you carry and offers a new journey.

- `src/spring/layout.js`: the plan of the valley: roads, the river, where each fighter and each stop sits
- `src/spring/terrain.js`: the height field (valley walls, the climb, the carved river channel and the hot spring's pool), the road mask and the ground shader
- `src/spring/water.js`: the river and pool surfaces (inked currents and ripples), petals on the water, steam
- `src/spring/world.js`: trees, bamboo, flowers, rocks, fences, the bridge and every building, merged per material in 48 m chunks; colliders
- `src/spring/grass.js`: instanced ink grass and reeds in tiles that sway and are hidden with distance
- `src/spring/stops.js`: the run (coin, vitality, the wanderer's own stats) and what each stop offers
- `src/spring/map.js`: the road map
- `src/spring/main.js`: walking, collisions, the shoulder camera, place names, going into the stops, and starting and ending duels on the road
- `src/spring/cutscene.js`: the shots before a duel on the road
- `src/duel.js`: one duel wherever it happens (event wiring, AI, hit-stop and slow-mo, reach arcs, the duel camera). Both pages use it

## Controls

| Input | Action |
| --- | --- |
| Q / E | High stance / Low stance |
| W / S | Close or open the distance |
| A / D | Circle around your opponent (you keep the same distance) |
| Left click or J | Strike from your stance |
| Strike while holding W / S / A or D | Lunging thrust / retreating cut / side cut |
| Right click or K (hold) | Guard your stance. Raise it just as the blow lands to parry. |
| Guard during your own windup | Feint: pull the strike back to bait his guard or parry |
| Space | Evade back or sideways (with i-frames). With W held: a quick, cheaper step in, no i-frames |
| F or Shift (hold, then release) | Draw-cut: sheathe, charge, release to lunge and strike |
| Esc | Pause |

## How a duel works

- **Stances.** Two lines, High and Low. Your guard covers the line of your stance. A strike into the line he is *not* guarding (his open line) winds up faster. Switching stance takes a moment, and striking from a stance you just switched to pays for it.
- **Guard.** A guard only stops a blow aimed at the line you are guarding, so match the line of the incoming strike.
- **Parry.** Raise a matching guard within 0.2 s of the blow landing. The moment freezes, ink splashes, the attacker is staggered and your next strike is a killing counter.
- **Feints.** Raise your guard during your own windup to pull the strike back. If he had already moved to block or parry, he bites and is stuck guarding for a moment: strike him from the other line.
- **Footwork.** Sideways movement circles your opponent. The dashed arcs on the ground show each weapon's reach, and your name is underlined in the HUD while he is inside your reach (his while you are inside his).
- **Move + strike.** How you are moving picks the cut. With W it is a lunging thrust: it closes a lot of ground, but it is narrow (a sidestep beats it) and slow to recover. With S it is a short cut as you back off, and a miss leaves you safe. With A or D it is a wide side cut that keeps circling and catches a sideways evade. No keys held gives the ordinary cut.
- **Breath.** Striking, guarding a hit, dodging, stepping, feinting and switching stance cost breath. Standing still refills it fastest. Run out and you are winded: open and slow for a moment.
- **Draw-cut (iai).** Hold to sheathe and charge, release to lunge. A full charge (red bar) is unblockable and lethal. A miss leaves you exposed for a long second.
- **Wounds.** You can take two cuts; the third kills. The Ronin and the Spearman fall in two (one if caught staggered, winded or after a whiff). Every cut leaves a wound where it landed, and each wound takes something away, from you or from him:
  - **Cut brow** (a High cut): blood in the eye. Yours hides his glint and his line on the HUD (you can still hear the tell); his makes him read your line late.
  - **Cut thigh** (a Low cut or a sweep): no evade, only a limping step without i-frames, and slow footwork.
  - **Pierced side** (a thrust, a lunge or a draw-cut): the guard slips after a moment and has to be raised again.
  - **Cut forearm** (a side cut): you can't sheathe for a draw-cut; he can't strike twice in a row.
  On the Spring road your wounds stay with you between duels until an inn, the teahouse or the hot spring mends them. A wounded fighter wears it: a red binding on the brow, the thigh, the side or the forearm.
- **Seals.** Whenever you gain or lose something, a colored seal stamps in at the top right with its name and what it does: blue 技 for a technique, pink 祝 for a blessing, gold 守 for a charm, red 傷 for a wound, green 癒 for a wound mended. The same colors mark them in the corner panel and on the stop cards.
- **Tells.** Before he strikes from a new line, his blade visibly drifts there. Then comes the windup and a red glint on the blade, and his stance glyph at the top turns red.

### The opponents

Each fighter carries one small thing in color, so you know him at a glance: the Ronin's indigo kasa band, the Wandering Ronin's ochre gourd, the Spearman's green tassel, the Bamboo Bandit's persimmon headband, the Masked Duelist's violet flute bag, the Temple Guard's gold prayer beads.

- **The Ronin** circles close, mirrors your line to guard it, strikes into your open line, sometimes strikes twice in a row, sometimes feints, and sometimes steps in from range. He answers every strike, drops his own windup into guard if you beat him to the punch, strikes back right after he blocks or evades you (a blocked lunge always gets punished), and parries more the more you press. He won't swing at you while you back away.
- **The Spearman** keeps you at the end of his spear and gives ground when you get inside it. Walk straight in and he meets you with a quick stop-thrust. Circle him and he answers with a wide low sweep. Lunge at him and he puts the spearhead in the way (in your line the blades clash, in the other line his reach lands first). Get too close and he shoves you off with the shaft. His thrusts are narrow and his recovery is long, so the way in is to bait a thrust, slip it, then close. He shares the Ronin's answers to mashing.

## Code map

- `src/config.js`: every tuning number (timings, breath costs, reach, enemy stats)
- `src/fighter.js`: the shared fighter state machine and pose selection
- `src/combat.js`: what happens when a blow lands (miss, evade, parry, block, clash, hit)
- `src/ai.js`: Ronin and Spearman behaviour
- `src/player.js`: input mapping
- `src/models.js`: the fighters (kimono, hakama, hats, armor, two-bone arms) and stance poses
- `src/ink.js`: pen-and-ink rendering (hatched shading with optional colored fills, edge-detected ink lines that wobble like hand-drawn frames, the camera cutaway) and the dawn clearing
- `src/wounds.js`: the wounds (where a cut lands and what it takes away) and the arts (techniques, blessings, charms); the rules themselves live in `fighter.js`, `combat.js`, `ai.js` and `duel.js`
- `src/gain.js`: the colored seals for a technique, blessing, charm, wound or mending, and their colors
- `src/fx.js`, `src/audio.js`, `src/hud.js`: blood and brush strokes, synthesized sound, the HUD
