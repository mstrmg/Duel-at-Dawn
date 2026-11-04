# Duel at Dawn — Project Context

## The game
A 2D side-view samurai dueling roguelike in an ink wash (sumi-e) art style. A lone swordsman travels a branching road across 4 seasonal regions (Spring → Summer → Autumn → Winter) to face the Sword Saint in a final duel at dawn. Each run is one journey; death ends the run.

## Core combat
- Short, deadly duels: most fighters die in 1–3 hits.
- Three stances (high/mid/low) that counter each other; both sides can switch mid-fight.
- Breath = stamina. Attacking, blocking, dodging use it; standing still refills it. Out of breath = vulnerable.
- Perfect-timed parry breaks guard and opens a counter.
- Draw-cut (iai): charge a strike while sheathed; missing leaves you exposed.
- Enemies have readable tells before attacks.

## Roguelike systems
- Map of stops: duel, elite duel, inn (heal/shop), shrine (blessing), dojo (learn techniques), event, boss.
- Wounds instead of HP: injuries carry between fights (cut arm = slower attacks, etc.), healed only at inns or with items.
- Build from: techniques (3 equipped), swords with traits, charms (passives), vows (power with restrictions).
- Honor system: bow before duels or strike first/cheat; high and low honor unlock different paths.
- Meta-progression: on death the sword passes to a new wanderer (lineage), gaining a permanent trait; a home dojo unlocks techniques, swords, and characters between runs.

## Art & feel
Black ink on paper tones, lots of empty space, red as the only accent color. Minimal sound: wind, footsteps, blade rings. Killing blows slow time with a red ink stroke.

## Current plan (build in this order)
1. Combat prototype: one player, one sword, two enemies (Ronin, Spearman). Make stances, parry, and breath feel great. Placeholder art is fine.
2. One region (Spring) with 5–6 map stops, a few techniques, and the Petal Blade boss.
3. Wounds and upgrades.
4. Later: other regions, lineage, honor, unlockable characters.
