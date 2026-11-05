# Duel at Dawn — Project Context

## The game
A 3D third-person samurai dueling roguelike in an ink wash style, drawn like pen and ink, built in Three.js. The camera sits behind the player's shoulder and stays framed on the opponent ahead. A lone swordsman travels a branching road across 4 seasonal regions (Spring → Summer → Autumn → Winter) to face the Sword Saint in a final duel at dawn. Each run is one journey; death ends the run.

## Core combat (decided, built in the combat prototype)
- Short, deadly duels: most fighters die in 1–3 hits. The player has 3 vitality, enemies 2; a fighter caught staggered, winded or after a whiff takes +1 damage.
- **Two stances, High and Low**, set with Q (High) and E (Low). Not three stances, and not chosen with the mouse. Your guard covers your stance's line; a strike into the line he is not guarding winds up faster. Guard (hold right click or K) only stops a blow in the line you are guarding.
- **Perfect parry**: raise a matching guard just as the blow lands; it staggers the attacker and opens a killing counter.
- **One strike button; footwork picks the cut.** No extra attack buttons and no randomness:
  - Strike with W held: lunging thrust. Long reach, narrow (a sidestep beats it), slow to recover.
  - Strike with S held: retreating cut. Short, gives ground, safe if it misses.
  - Strike with A or D held: side cut. Wide, keeps circling, catches a sideways evade.
  - No direction held: the ordinary cut.
- **Footwork**: A/D circle the opponent at the same distance, W/S close or open it. Space evades (with i-frames); Space with W is a quicker step in without i-frames. Dashed reach arcs on the ground. Fighters visibly step: feet lift and hakama legs swing with the actual motion, never sliding.
- **Feints**: raise guard during your own windup to pull the strike back and bait his guard.
- **Breath = stamina.** Attacking, blocking, dodging, feinting and switching stance cost breath; standing still refills it. Out of breath = winded and vulnerable.
- **Draw-cut (iai)**: hold to sheathe and charge, release to strike. A full charge is unblockable and lethal; missing leaves you exposed.
- **Enemies have readable tells**: the blade drifts to the new line, then a windup with a red glint.
- **Enemies punish mashing and lunge spam**: they answer every strike, parry more under sustained pressure, strike back after a block or evade (a blocked lunge always gets punished), and guard out of their own windup when beaten to the punch. Careful play that reads tells and punishes openings wins; mashing does not.
- Enemies so far: the **Ronin** (close range, mirrors your line, feints, double strikes) and the **Spearman** (keeps you at range: stop-thrusts walk-ins, sweeps circlers, meets lunges with the spearhead, shoves you off up close).

## Roguelike systems (planned)
- Map of stops: duel, elite duel, inn (heal/shop), shrine (blessing), dojo (learn techniques), event, boss.
- Wounds instead of HP: injuries carry between fights (cut arm = slower attacks, etc.), healed only at inns or with items.
- Build from: techniques (3 equipped), swords with traits, charms (passives), vows (power with restrictions).
- Honor system: bow before duels or strike first/cheat; high and low honor unlock different paths.
- Meta-progression: on death the sword passes to a new wanderer (lineage), gaining a permanent trait; a home dojo unlocks techniques, swords, and characters between runs.

## Art & feel
A pen and ink look: black ink on paper tones, hatched shading, hand-drawn ink outlines that wobble slightly, lots of empty space and mist, red as the main accent color. Each season may add one accent of its own: Spring's is pink (cherry blossoms, azaleas, wildflowers, falling petals), so the vegetation pops against the ink. Rendering is custom (hatch shader plus an edge-detected ink line pass), not realistic lighting. Fighters are detailed figures (kimono, hakama, hats, armor) built from primitives. Minimal sound: wind, footsteps, blade rings. Killing blows slow time with a red brush stroke.

## Current plan (build in this order)
1. ~~Combat prototype: one player, one sword, two enemies (Ronin, Spearman).~~ Done: see README.md for controls and the code map. All tuning numbers live in `src/config.js` and `src/ai.js`.
2. One region (Spring) with 5–6 map stops, a few techniques, and the Petal Blade boss. In progress: the walkable Spring map is built (`spring.html`, `src/spring/`), with duels on it: the Ronin, a second ronin and the Spearman wait at level spots on the road, and walking up to one plays a short cutscene, then the duel starts in place on 13 m of level ground (`src/duel.js` runs a duel for both pages; `src/spring/cutscene.js` is the cutscene). Stops sit right beside the main road (Miles: never so far out of the way that nobody would go): the inn (rest, onigiri, sandals, whetstone for coin), the dojo at the crossroads (learn one of three techniques) and a wayside shrine past the bridge (one of two blessings); `src/spring/stops.js` holds the run state and the offers. Duels pay coin and vitality carries between duels. Next: the Petal Blade at the great shrine.
3. Wounds and upgrades.
4. Later: other regions, lineage, honor, unlockable characters.

## Working notes
- `npm run dev` to play locally (`/` is combat, `/spring.html` is the Spring map); `npm run build:single` writes self-contained `dist/duel-at-dawn.html` and `dist/spring-map.html` (each published as its own artifact).
- Ideas tried and dropped: choosing stance with the mouse, and a sword that follows the mouse with physics.
