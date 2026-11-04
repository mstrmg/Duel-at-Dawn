# Duel at Dawn

An ink wash samurai dueling roguelike in Three.js. See `CLAUDE.md` for the full design.

This is step 1 of the plan: the **combat prototype**. One wanderer, one sword, two opponents (the Ronin and the Spearman), with placeholder shapes for art.

## Run it

```bash
npm install
npm run dev      # then open the URL it prints (http://localhost:5173)
```

`npm run build` writes a static build to `dist/` that runs from any static host. `npm run build:single` bundles everything into one self-contained `dist/duel-at-dawn.html` you can open or publish directly.

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

- **The Ronin** circles close, mirrors your line to guard it, strikes into your open line, sometimes strikes twice in a row, sometimes feints, and sometimes steps in from range.
- **The Spearman** keeps you at the end of his spear. Thrusts are narrow, so stepping aside works. Low attacks are wide sweeps. Get too close and he shoves you off with the shaft.

## Code map

- `src/config.js`: every tuning number (timings, breath costs, reach, enemy stats)
- `src/fighter.js`: the shared fighter state machine and pose selection
- `src/combat.js`: what happens when a blow lands (miss, evade, parry, block, clash, hit)
- `src/ai.js`: Ronin and Spearman behaviour
- `src/player.js`: input mapping
- `src/models.js`: the fighters (kimono, hakama, hats, armor, two-bone arms) and stance poses
- `src/ink.js`: pen-and-ink rendering (hatched shading, edge-detected ink lines that wobble like hand-drawn frames) and the dawn clearing
- `src/fx.js`, `src/audio.js`, `src/hud.js`: blood and brush strokes, synthesized sound, the HUD
