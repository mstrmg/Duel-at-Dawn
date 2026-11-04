# Duel at Dawn

An ink wash samurai dueling roguelike in Three.js. See `CLAUDE.md` for the full design.

This is step 1 of the plan: the **combat prototype**. One wanderer, one sword, two opponents (the Ronin and the Spearman), with placeholder shapes for art.

## Run it

```bash
npm install
npm run dev      # then open the URL it prints (http://localhost:5173)
```

`npm run build` writes a static build to `dist/` that runs from any static host.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Step and circle. You always face your opponent. |
| 1 / 2 / 3, Q / E, or mouse wheel | High / Mid / Low stance |
| Left click or J | Strike from your stance |
| Right click or K (hold) | Guard your stance. Raise it just as the blow lands to parry. |
| Space | Dodge toward where you are moving (backstep by default) |
| F or Shift (hold, then release) | Draw-cut: sheathe, charge, release to lunge and strike |
| Esc | Pause |

## How a duel works

- **Stances.** High beats Low, Low beats Mid, Mid beats High. A strike from the stance that beats your opponent's current stance winds up faster, and wins when both blades land together. Switching stance takes a moment, so striking from a new stance is slower than striking from one you already hold.
- **Guard.** A guard only stops a blow aimed at the line you are guarding, so match the stance of the incoming strike.
- **Parry.** Raise a matching guard within 0.2 s of the blow landing. The attacker is staggered and your next strike is a killing counter.
- **Breath.** Striking, guarding a hit, dodging and switching stance cost breath. Standing still refills it fastest. Run out and you are winded: open and slow for a moment.
- **Draw-cut (iai).** Hold to sheathe and charge, release to lunge. A full charge (red bar) is unblockable and lethal. A miss leaves you exposed for a long second.
- **Wounds.** You can take two cuts; the third kills. The Ronin and the Spearman fall in two (one if caught staggered, winded or after a whiff).
- **Tells.** Every enemy strike starts with a windup pose and a red glint on the blade, and their stance glyph at the top turns red to show which line it is coming from.

### The opponents

- **The Ronin** circles close, reads your stance and moves to the one that beats it, sometimes strikes twice in a row, and sometimes feints.
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
