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

`spring.html` is a walkable Spring valley, separate from combat for now (open `/spring.html` under `npm run dev`). A dirt road runs north from the south gate past the crossroads, with the inn to the west and the lookout to the east, over a plank bridge, and up an avenue of stone lanterns to the shrine and its red torii. Cherry trees, azaleas, wildflowers and drifting petals are pink, Spring's accent color.

WASD walks (relative to the camera), Shift runs, the mouse looks (click to lock it, or drag), the arrow keys turn the camera, and the wheel sets its distance. Trees and buildings between the camera and the wanderer are cut away around him.

Three fighters wait on the road: the Ronin on the main road before the crossroads, the Wandering Ronin on the lookout road, and the Spearman past the bridge. Each turns to watch you come. Walk within 10 m and a short cutscene plays (letterbox, a wide standoff, his face and title, you drawing, a gust of petals; Space, Enter or a click skips it), then the duel starts on a level patch of road 13 m across in radius, with the two of you 9 m apart as in the combat clearing. Win and you walk on (for now you walk on whole; wounds come later). Lose and you can rise again or go back to the gate.

- `src/spring/terrain.js`: the height field, roads and stream (baked into one mask texture) and the ground shader
- `src/spring/world.js`: trees, azaleas, wildflowers, rocks, fences, lanterns, bridge, inn, shrine and torii, merged per material; colliders
- `src/spring/grass.js`: instanced ink grass that sways and thins with distance
- `src/spring/main.js`: walking, collisions, the shoulder camera, place names, and starting and ending duels on the road
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
- **Wounds.** You can take two cuts; the third kills. The Ronin and the Spearman fall in two (one if caught staggered, winded or after a whiff).
- **Tells.** Before he strikes from a new line, his blade visibly drifts there. Then comes the windup and a red glint on the blade, and his stance glyph at the top turns red.

### The opponents

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
- `src/fx.js`, `src/audio.js`, `src/hud.js`: blood and brush strokes, synthesized sound, the HUD
