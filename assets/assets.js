/*
 * Tradie Survivors: asset list
 * ---------------------------------------------------------------
 * Every picture and sound in the game is listed here. To use your own
 * art, replace the file at the path shown (same name), or point the
 * path at a new file. If a file is missing or fails to load, the game
 * quietly falls back to its built-in drawing or sound, so you can
 * replace things one at a time.
 *
 * Paths are relative to this assets/ folder.
 *
 * Sprites
 *   width   how wide the image is drawn in the game, in game pixels.
 *           Height follows the image's own proportions, so any
 *           resolution works (2x or 4x art stays crisp).
 *   Images are drawn centred on the character's position. Characters
 *   should face RIGHT; the game flips them when they walk left.
 *   Projectiles should point RIGHT; the game rotates them.
 *   Hitbox sizes don't come from the images. They're the `r` values
 *   in js/game.js (ENEMIES and the player), so changing art size
 *   won't change difficulty.
 *
 * Icons (upgrade cards and the loadout bar)
 *   Square PNGs, any size (64x64 or 128x128 works well). If an icon
 *   is missing, an emoji is shown instead.
 *
 * Sounds
 *   Any format the browser plays (.mp3, .ogg, .wav). If a sound is
 *   missing, a simple built-in beep is used. Music only plays if you
 *   add a file.
 */
window.ASSET_CONFIG = {
  sprites: {
    // ---- Tradies (the player) ----
    'player-sparky':   { file: 'sprites/player-sparky.png',   width: 40 },
    'player-chippy':   { file: 'sprites/player-chippy.png',   width: 40 },
    'player-brickie':  { file: 'sprites/player-brickie.png',  width: 40 },
    'player-sheetie':  { file: 'sprites/player-sheetie.png',  width: 40 },

    // ---- Enemies ----
    'enemy-magpie':    { file: 'sprites/enemy-magpie.png',    width: 36 },
    'enemy-ibis':      { file: 'sprites/enemy-ibis.png',      width: 42 },
    'enemy-client':    { file: 'sprites/enemy-client.png',    width: 36 },
    'enemy-inspector': { file: 'sprites/enemy-inspector.png', width: 42 },
    'enemy-dropbear':  { file: 'sprites/enemy-dropbear.png',  width: 38 },
    'enemy-certifier': { file: 'sprites/enemy-certifier.png', width: 100 },

    // ---- Weapon projectiles (point them to the right) ----
    'proj-nail':       { file: 'sprites/proj-nail.png',       width: 18 },
    'proj-sawblade':   { file: 'sprites/proj-sawblade.png',   width: 34 },
    'proj-brick':      { file: 'sprites/proj-brick.png',      width: 22 },
    'proj-offcut':     { file: 'sprites/proj-offcut.png',     width: 30 },

    // ---- Pickups ----
    'gem-small':       { file: 'sprites/gem-small.png',       width: 12 },
    'gem-medium':      { file: 'sprites/gem-medium.png',      width: 15 },
    'gem-large':       { file: 'sprites/gem-large.png',       width: 19 },
    'pickup-pie':      { file: 'sprites/pickup-pie.png',      width: 26 },
    'pickup-siren':    { file: 'sprites/pickup-siren.png',    width: 26 },
    'pickup-toolbox':  { file: 'sprites/pickup-toolbox.png',  width: 32 },

    // ---- Ground and site clutter ----
    // The ground tile repeats in every direction, so make it seamless.
    'ground':          { file: 'sprites/ground.png',          width: 256 },
    'decor-cone':      { file: 'sprites/decor-cone.png',      width: 26 },
    'decor-pallet':    { file: 'sprites/decor-pallet.png',    width: 50 },
    'decor-sand':      { file: 'sprites/decor-sand.png',      width: 58 },
    'decor-bricks':    { file: 'sprites/decor-bricks.png',    width: 38 },
    'decor-rebar':     { file: 'sprites/decor-rebar.png',     width: 62 },
  },

  icons: {
    // weapons
    nailgun:   'icons/nailgun.png',
    saw:       'icons/saw.png',
    brick:     'icons/brick.png',
    zap:       'icons/zap.png',
    concrete:  'icons/concrete.png',
    offcut:    'icons/offcut.png',
    // passives
    steelcaps: 'icons/steelcaps.png',
    hivis:     'icons/hivis.png',
    coffee:    'icons/coffee.png',
    belt:      'icons/belt.png',
    ute:       'icons/ute.png',
    magnet:    'icons/magnet.png',
    spf:       'icons/spf.png',
    battery:   'icons/battery.png',
    // level-up fallbacks
    pie:       'icons/pie.png',
    rates:     'icons/rates.png',
  },

  sounds: {
    gem:     'sounds/gem.mp3',      // picking up XP
    hit:     'sounds/hit.mp3',      // hitting an enemy
    hurt:    'sounds/hurt.mp3',     // the tradie taking damage
    levelup: 'sounds/levelup.mp3',  // Smoko screen
    boss:    'sounds/boss.mp3',     // the Certifier arrives
    music:   'sounds/music.mp3',    // background loop (optional)
  },

  volume: { sfx: 0.5, music: 0.35 },
};
