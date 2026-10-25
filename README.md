# Tradie Survivors

A survivors-style browser game (think *Vampire Survivors* / *Survivor.io*) where you play an Aussie tradie trying to make it to knock-off.

Move around the site, your tools fire on their own, collect XP, and pick an upgrade at every **Smoko**. Survive ten minutes of magpies, bin chickens, clients who want "just one more thing", WHS inspectors, drop bears and the dreaded **Certifier**.

## Play

- **Online:** turn on GitHub Pages (see below) and open `https://soup8989.github.io/tradie_survivor/`
- **Locally:** open `index.html` in a browser. For custom sounds to load reliably, serve the folder instead, e.g. `python3 -m http.server` and visit `http://localhost:8000`.

**Controls:** WASD / arrow keys, or touch-and-drag on mobile. `Esc` or `P` pauses (smoko), `M` mutes, `1` `2` `3` pick upgrades.

## What's in it

| Trade | Starting tool | Perk |
|---|---|---|
| Sparky | Live Wire (chain lightning) | Tools fire 15% faster |
| Chippy | Nail Gun | +15% damage |
| Brickie | Brick Lob (area splash) | +30 max HP, +1 armour |
| Sheetie | Flying Offcut (boomerang) | +15% area, +5% speed |

Any trade can also pick up the **Circular Saw** (orbiting blades) and **Wet Concrete** (slowing slabs). Each tool goes to level 5.

**Passives:** Steel Caps, Hi-Vis Vest, Iced Coffee, Tool Belt, The Ute, Magnet on a Stick, SPF 50+, Spare Battery.

**Enemies:** Magpies (swoop at you), Bin Chickens, The Client, WHS Inspectors, Drop Bears, and The Certifier (boss at 5:00 and 9:00, drops a toolbox worth two level-ups). Swooping Season hits at 2:30 and 7:00. Survive to 10:00 to win, then keep going in overtime if you like.

**Pickups:** meat pies heal, the knock-off siren pulls in all XP.

## Using your own art and sounds

Everything visual and audible is listed in [`assets/assets.js`](assets/assets.js). Replace any file in `assets/` with your own (same name) and the game uses it. Delete a file and the game falls back to its built-in drawing or beep, so you can swap things one at a time. Full details are in [`assets/README.md`](assets/README.md).

## Tweaking the game

All balance numbers are near the top of [`js/game.js`](js/game.js) in section 2, "Game data":

- `TRADES`: trades, starting tools and perks
- `WEAPONS`: damage, cooldowns and per-level upgrades
- `PASSIVES`: what each passive does
- `ENEMIES`: HP, speed, damage, XP and hitbox size, plus their speech-bubble lines
- `SCHEDULE` / `EVENTS`: which enemies spawn when, swarms and bosses
- `SHIFT_LENGTH`, `spawnRate`, `enemyHpMul`, `xpToLevel`: overall pacing

## Hosting on GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save, wait a minute, and the game is live at the URL above.

## Project layout

```
index.html          page + menus
style.css           UI styling
js/game.js          the whole game (no build step, no libraries)
assets/assets.js    list of art and sound files
assets/sprites/     character, enemy, projectile, pickup and ground images
assets/icons/       (optional) upgrade icons, emoji used if empty
assets/sounds/      (optional) sound effects and music, beeps used if empty
```

## Ideas for later

- Weapon evolutions (e.g. max Circular Saw + Steel Caps → "Demo Saw")
- Animated sprite sheets (walk cycles)
- More trades: plumber, concreter, tiler, sparky's apprentice
- Persistent unlocks between runs (gold → new trades)
- A move to Phaser if it outgrows plain canvas
