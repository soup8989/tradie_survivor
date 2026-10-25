# Replacing the art and sounds

Every image and sound the game uses is listed in `assets.js`. To use your own, **save your file over the existing one with the same name** (or change the path in `assets.js`). If a file is missing or broken, the game uses its built-in version instead, so nothing breaks while you work.

Refresh the browser to see changes. If an old image sticks around, do a hard refresh (Ctrl/Cmd + Shift + R).

## Sprites (`sprites/`)

The PNGs here are exports of the game's built-in drawings, so they're ready-made templates. Open one in any editor (Aseprite, Procreate, Photoshop, Krita, Piskel…), draw over it, and save.

Rules of thumb:

- **Transparent PNG**, any resolution. The game scales the image to the `width` set in `assets.js` (in game pixels) and keeps its proportions. Drawing at 2–4x the listed width keeps it crisp on high-res screens.
- **Centred.** The image is drawn centred on the character's position. Leave a little room under characters for a shadow if you want one; the built-in ones have it baked in.
- **Face right.** Characters face right; the game flips them when they walk left.
- **Projectiles point right.** The game rotates them to match their direction.
- **`ground.png` tiles.** It repeats in every direction, so its edges need to line up seamlessly.
- **Size doesn't change difficulty.** Hitboxes are set by the `r` values in `js/game.js` (`ENEMIES`, and the player's `r: 15`). If you make a sprite much bigger or smaller, you may want to adjust its `r` too.

| File | What it is | Drawn width |
|---|---|---|
| `player-sparky/chippy/brickie/sheetie.png` | the four tradies | 40 |
| `enemy-magpie.png` | magpie | 36 |
| `enemy-ibis.png` | bin chicken | 42 |
| `enemy-client.png` | the client | 36 |
| `enemy-inspector.png` | WHS inspector | 42 |
| `enemy-dropbear.png` | drop bear | 38 |
| `enemy-certifier.png` | boss | 100 |
| `proj-nail.png` | nail gun shot | 18 |
| `proj-sawblade.png` | circular saw blade (spins) | 34 |
| `proj-brick.png` | lobbed brick (spins) | 22 |
| `proj-offcut.png` | sheet-metal boomerang (spins) | 30 |
| `gem-small/medium/large.png` | XP (1–2, 3–9, 10+ XP) | 12 / 15 / 19 |
| `pickup-pie.png` | meat pie (heal) | 26 |
| `pickup-siren.png` | knock-off siren (pulls all XP) | 26 |
| `pickup-toolbox.png` | boss drop (two level-ups) | 32 |
| `ground.png` | repeating ground tile | 256 |
| `decor-*.png` | cones, pallet, sand, bricks, rebar | 26–62 |

Effects stay built-in: lightning arcs, concrete slabs, particles and damage numbers.

## Icons (`icons/`)

Shown on the Smoko upgrade cards, trade cards, and the loadout bar. This folder starts empty, so emoji are used. Add square PNGs (64×64 or 128×128) named after the upgrade:

`nailgun` `saw` `brick` `zap` `concrete` `offcut` `steelcaps` `hivis` `coffee` `belt` `ute` `magnet` `spf` `battery` `pie` `rates`

e.g. `icons/nailgun.png`.

## Sounds (`sounds/`)

Also empty to start, so simple built-in beeps are used. Add any of these (`.mp3` by default; change the path in `assets.js` for `.ogg` or `.wav`):

| File | Plays when |
|---|---|
| `gem.mp3` | picking up XP |
| `hit.mp3` | hitting an enemy |
| `hurt.mp3` | the tradie gets hit |
| `levelup.mp3` | Smoko screen opens |
| `boss.mp3` | the Certifier arrives |
| `music.mp3` | background loop (only plays if the file exists) |

Volumes are set at the bottom of `assets.js`. Keep hit and gem sounds very short (under 0.2s), since they play a lot.

Browsers are fussy about audio from `file://` pages. If sounds don't play when you double-click `index.html`, serve the folder (`python3 -m http.server`) or test on GitHub Pages.

> Your browser console will show "404 not found" for icons and sounds you haven't added yet. That's expected and harmless.
