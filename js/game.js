/*
 * Tradie Survivors
 * A survivors-style game: move around, your tools fire on their own,
 * level up at Smoko, and make it to knock-off at 10:00.
 *
 * Plain canvas + JavaScript, no build step. Art and sounds are listed
 * in assets/assets.js; anything missing falls back to the built-in
 * drawings in the "BUILT-IN ART" section below.
 *
 * Sections:
 *   1. Setup & helpers
 *   2. Game data (trades, weapons, passives, enemies, schedule)  <- tweak balance here
 *   3. Built-in art
 *   4. Asset loading (custom sprites, icons, sounds)
 *   5. Game state & core loop
 *   6. Weapons, enemies, pickups
 *   7. Rendering
 *   8. UI (menus, level-up, HUD)
 */
(() => {
'use strict';

/* =====================================================================
 * 1. SETUP & HELPERS
 * ===================================================================*/
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, SCALE = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  // Zoom so small screens still see a fair bit of the site.
  SCALE = Math.max(0.6, Math.min(1.15, Math.min(W, H) / 720));
}
window.addEventListener('resize', resize);
resize();

const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function pickWeighted(w) {
  let s = 0; for (const k in w) s += w[k];
  let r = Math.random() * s;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}
function hash2(x, y, s = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

/* =====================================================================
 * 2. GAME DATA (balance lives here)
 * ===================================================================*/
const SHIFT_LENGTH = 600;          // seconds until knock-off (win)
const MAX_WEAPONS = 6;
const MAX_PASSIVES = 6;
const ENEMY_CAP = 420;

const TRADES = {
  sparky:  { name: 'Sparky',  title: 'Electrician',        start: 'zap',     perkText: 'Tools fire 15% faster',     perk: p => { p.cdMul *= 0.87; },
             look: { shirt: '#ff7a1a', pants: '#2b3a52', hat: '#f7f7f2', tape: true,  tool: 'driver' } },
  chippy:  { name: 'Chippy',  title: 'Carpenter',          start: 'nailgun', perkText: '+15% damage',                perk: p => { p.dmgMul += 0.15; },
             look: { shirt: '#2f5d8a', pants: '#c9a46b', hat: '#ffd21f', tape: true,  tool: 'hammer' } },
  brickie: { name: 'Brickie', title: 'Bricklayer',         start: 'brick',   perkText: '+30 max HP, +1 armour',      perk: p => { p.maxHp += 30; p.armor += 1; },
             look: { shirt: '#e4ff3a', pants: '#4a4f57', hat: '#ff7a1a', tape: true,  tool: 'trowel' } },
  sheetie: { name: 'Sheetie', title: 'Sheet-metal worker', start: 'offcut',  perkText: '+15% area, +5% speed',      perk: p => { p.areaMul += 0.15; p.speed *= 1.05; },
             look: { shirt: '#6f8090', pants: '#2b3a52', hat: '#2fa84f', tape: true,  tool: 'snips' } },
};

// Each weapon: stats(level) returns the numbers for that level; desc[i] is the card text for level i+1.
const WEAPONS = {
  nailgun: { name: 'Nail Gun', emoji: '🔩', max: 5,
    desc: ['Fires nails at the nearest enemy.', '+1 nail per shot.', '+6 damage.', '+1 nail. Nails go through one more enemy.', 'Fires 30% faster. +1 nail.'],
    stats: l => ({ dmg: 10 + (l >= 3 ? 6 : 0), n: 1 + (l >= 2) + (l >= 4) + (l >= 5), cd: l >= 5 ? 0.46 : 0.66, pierce: 1 + (l >= 4) }) },
  saw: { name: 'Circular Saw', emoji: '🪚', max: 5,
    desc: ['A saw blade orbits around you.', '+1 blade.', '+6 damage and a wider orbit.', '+1 blade.', '+1 blade, spins faster, +4 damage.'],
    stats: l => ({ n: 1 + (l >= 2) + (l >= 4) + (l >= 5), dmg: 8 + (l >= 3 ? 6 : 0) + (l >= 5 ? 4 : 0), rad: l >= 3 ? 88 : 74, br: 15, spin: l >= 5 ? 4.4 : 3.2 }) },
  brick: { name: 'Brick Lob', emoji: '🧱', max: 5,
    desc: ['Lobs a brick that smashes everything where it lands.', '+1 brick.', '+35% splash radius.', '+14 damage.', '+2 bricks, thrown faster.'],
    stats: l => ({ n: 1 + (l >= 2) + (l >= 5 ? 2 : 0), dmg: 24 + (l >= 4 ? 14 : 0), rad: l >= 3 ? 74 : 55, cd: l >= 5 ? 1.2 : 1.55 }) },
  zap: { name: 'Live Wire', emoji: '⚡', max: 5,
    desc: ['Zaps the nearest enemy and arcs to others nearby.', 'Arcs to 2 more enemies.', '+8 damage.', 'Zaps 25% faster.', 'A second bolt, +2 arcs.'],
    stats: l => ({ dmg: 14 + (l >= 3 ? 8 : 0), chains: 3 + (l >= 2 ? 2 : 0) + (l >= 5 ? 2 : 0), cd: l >= 4 ? 0.95 : 1.25, bolts: l >= 5 ? 2 : 1, range: 330, chainR: 150 }) },
  concrete: { name: 'Wet Concrete', emoji: '🪣', max: 5,
    desc: ['Pours a slab that slows and grinds down enemies.', '+25% slab size.', 'Slabs stay wet 50% longer.', '+5 damage per tick.', 'Pours two slabs at once.'],
    stats: l => ({ n: l >= 5 ? 2 : 1, r: l >= 2 ? 74 : 60, dur: l >= 3 ? 4.5 : 3, dmg: 5 + (l >= 4 ? 5 : 0), cd: 3.2 }) },
  offcut: { name: 'Flying Offcut', emoji: '✂️', max: 5,
    desc: ['Flings a sharp sheet-metal offcut that comes back like a boomerang.', '+7 damage.', '+1 offcut.', 'Bigger offcuts that fly further.', '+1 offcut, thrown faster.'],
    stats: l => ({ dmg: 13 + (l >= 2 ? 7 : 0), n: 1 + (l >= 3) + (l >= 5), size: l >= 4 ? 17 : 12, dist: l >= 4 ? 280 : 230, cd: l >= 5 ? 1.0 : 1.4 }) },
};

const PASSIVES = {
  steelcaps: { name: 'Steel Caps',        emoji: '🥾', max: 5, desc: '+1 armour. Every hit hurts a bit less.', apply: p => { p.armor += 1; } },
  hivis:     { name: 'Hi-Vis Vest',       emoji: '🦺', max: 5, desc: '+20 max HP.',                             apply: p => { p.maxHp += 20; } },
  coffee:    { name: 'Iced Coffee',       emoji: '🥤', max: 5, desc: 'Tools fire 8% faster.',                   apply: p => { p.cdMul *= 0.92; } },
  belt:      { name: 'Tool Belt',         emoji: '🔧', max: 5, desc: '+10% weapon area.',                       apply: p => { p.areaMul += 0.1; } },
  ute:       { name: 'The Ute',           emoji: '🛻', max: 5, desc: '+8% move speed.',                         apply: p => { p.speed *= 1.08; } },
  magnet:    { name: 'Magnet on a Stick', emoji: '🧲', max: 5, desc: '+30% pickup range.',                      apply: p => { p.magnet *= 1.3; } },
  spf:       { name: 'SPF 50+',           emoji: '🧴', max: 5, desc: 'Slip, slop, slap. Regenerate 0.4 HP/s.',  apply: p => { p.regen += 0.4; } },
  battery:   { name: 'Spare Battery',     emoji: '🔋', max: 5, desc: '+10% damage.',                            apply: p => { p.dmgMul += 0.1; } },
};

const EXTRAS = {
  pie:   { name: 'Meat Pie',      emoji: '🥧', desc: 'Restore 50 HP.' },
  rates: { name: 'Penalty Rates', emoji: '💵', desc: '+5% damage for the rest of the shift.' },
};

// r = hitbox radius (independent of the sprite's size)
const ENEMIES = {
  magpie:    { name: 'Magpie',        hp: 7,    speed: 88,  dmg: 6,  xp: 1,  r: 11 },
  ibis:      { name: 'Bin Chicken',   hp: 16,   speed: 62,  dmg: 7,  xp: 1,  r: 13 },
  client:    { name: 'The Client',    hp: 34,   speed: 56,  dmg: 9,  xp: 3,  r: 14,
               lines: ["While you're here…", 'Can you just…', 'Quick one, mate', 'Cash price?', "Won't take a sec"] },
  inspector: { name: 'WHS Inspector', hp: 70,   speed: 44,  dmg: 12, xp: 6,  r: 16,
               lines: ["Where's your SWMS?", "Tag's expired", 'No hi-vis?', 'Stop work!', 'Done your induction?'] },
  dropbear:  { name: 'Drop Bear',     hp: 45,   speed: 105, dmg: 14, xp: 6,  r: 13 },
  certifier: { name: 'The Certifier', hp: 1400, speed: 50,  dmg: 25, xp: 60, r: 36, boss: true,
               lines: ['DEFECT NOTICE', 'NOT COMPLIANT', 'REJECTED', 'RE-INSPECTION FEE'] },
};

// [start time in seconds, spawn weights]
const SCHEDULE = [
  [0,   { magpie: 1 }],
  [60,  { magpie: 0.6, ibis: 0.4 }],
  [120, { magpie: 0.35, ibis: 0.45, client: 0.2 }],
  [240, { magpie: 0.2, ibis: 0.35, client: 0.35, inspector: 0.1 }],
  [360, { ibis: 0.2, client: 0.3, inspector: 0.25, dropbear: 0.25 }],
  [480, { client: 0.3, inspector: 0.3, dropbear: 0.4 }],
];
const EVENTS = [
  { t: 150, type: 'swoop' },
  { t: 300, type: 'boss' },
  { t: 420, type: 'swoop' },
  { t: 540, type: 'boss' },
  { t: SHIFT_LENGTH, type: 'win' },
];
const spawnRate = (t) => 0.9 + (t / 60) * 1.25;          // enemies per second
const enemyHpMul = (t) => 1 + t / 150;
const enemyDmgMul = (t) => 1 + t / 600;
const xpToLevel = (l) => Math.floor(5 + (l - 1) * 9 + Math.pow(l - 1, 1.5));

/* =====================================================================
 * 3. BUILT-IN ART
 * Each drawing is centred on (0,0) and faces right. These are used for
 * any sprite whose file in assets/assets.js is missing.
 * ===================================================================*/
const OUT = '#1b1c20';
function ell(g, x, y, rx, ry, fill, lw = 2) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); }
}
function rr(g, x, y, w, h, r, fill, lw = 2) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); }
}
function poly(g, pts, fill, lw = 2) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fillStyle = fill; g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = OUT; g.stroke(); }
}
function line(g, pts, stroke, lw) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = stroke; g.lineWidth = lw; g.stroke();
}
const shadow = (g, y, rx, ry) => ell(g, 0, y, rx, ry, 'rgba(0,0,0,.22)', 0);

function hardHat(g, x, y, rx, color) {
  g.beginPath(); g.ellipse(x, y, rx, rx * 0.78, 0, Math.PI, 0); g.closePath();
  g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
  line(g, [x, y - rx * 0.78, x, y - 1], 'rgba(0,0,0,.18)', 2);
  rr(g, x - rx - 2, y - 2, rx * 2 + 4, 3.5, 1.5, color);
}

function drawTradie(g, look) {
  shadow(g, 19, 12, 4);
  rr(g, -9, 13, 7, 6, 2, '#3b2a1d');
  rr(g, 2, 13, 7, 6, 2, '#3b2a1d');
  rr(g, -9, 3, 18, 12, 3, look.pants);
  ell(g, -12, 0, 3.6, 5.5, look.shirt);
  ell(g, 12, 0, 3.6, 5.5, look.shirt);
  rr(g, -11, -8, 22, 15, 6, look.shirt);
  if (look.tape) { rr(g, -10, -2, 20, 2.6, 1, '#dfe6ea', 0); rr(g, -4, -7, 2.4, 13, 1, '#dfe6ea', 0); rr(g, 1.6, -7, 2.4, 13, 1, '#dfe6ea', 0); }
  // tool in right hand
  g.save(); g.translate(13, 4);
  if (look.tool === 'driver') { rr(g, -2, -1, 4, 8, 1.5, '#ffd21f', 1.5); line(g, [0, 7, 0, 13], '#9aa3ab', 2); }
  if (look.tool === 'hammer') { line(g, [0, 0, 0, 11], '#8a5a2b', 3); rr(g, -5, 9, 10, 4, 1, '#59626b', 1.5); }
  if (look.tool === 'trowel') { line(g, [0, 0, 0, 5], '#8a5a2b', 3); poly(g, [-4, 5, 4, 5, 0, 13], '#c7ced4', 1.5); }
  if (look.tool === 'snips') { line(g, [-2, 0, 1, 12], '#d8342b', 2.5); line(g, [2, 0, -1, 12], '#d8342b', 2.5); }
  g.restore();
  ell(g, 0, -15, 8, 8, '#f0c49b');
  ell(g, 2.6, -14.5, 1.1, 1.3, OUT, 0);
  ell(g, 6, -14.5, 1.1, 1.3, OUT, 0);
  line(g, [2.5, -10.5, 5.5, -10.5], OUT, 1.3);
  hardHat(g, 0, -17, 10, look.hat);
}

const ART = {
  'player-sparky':  [40, 46, g => drawTradie(g, TRADES.sparky.look)],
  'player-chippy':  [40, 46, g => drawTradie(g, TRADES.chippy.look)],
  'player-brickie': [40, 46, g => drawTradie(g, TRADES.brickie.look)],
  'player-sheetie': [40, 46, g => drawTradie(g, TRADES.sheetie.look)],

  'enemy-magpie': [36, 30, g => {
    shadow(g, 11, 11, 3.5);
    line(g, [-1, 5, -2, 10, 3, 5, 3, 10], '#222', 1.5);
    poly(g, [-8, -1, -17, 3, -16, -3], '#111', 1.5);
    ell(g, -1, 0, 11, 7, '#151515');
    ell(g, -3, -1, 6, 3.6, '#f4f4f4', 1.5);
    ell(g, 8, -5, 6, 6, '#151515');
    ell(g, 4.5, -0.5, 2.6, 2, '#f4f4f4', 0);
    poly(g, [13, -6.5, 19.5, -4.2, 13, -2.8], '#d8d4c8', 1.2);
    ell(g, 10, -6.5, 1.7, 1.7, '#e0402a', 0);
  }],

  'enemy-ibis': [42, 38, g => {
    shadow(g, 15, 12, 4);
    line(g, [-2, 6, -3, 15], '#2a2a2a', 2); line(g, [3, 6, 4, 15], '#2a2a2a', 2);
    ell(g, -11, -1, 4.5, 3.2, '#202020');
    ell(g, -1, 0, 12, 9, '#efeadf');
    ell(g, -3, 3, 4.5, 2.2, 'rgba(120,105,70,.35)', 0);
    ell(g, 8.5, -6, 3.6, 6.5, '#efeadf');
    ell(g, 10, -12, 4.6, 4.2, '#1d1d1d');
    g.beginPath(); g.moveTo(13.5, -12); g.quadraticCurveTo(22, -10, 20.5, 0.5);
    g.strokeStyle = '#1d1d1d'; g.lineWidth = 2.6; g.stroke();
    ell(g, 11.2, -13, 1, 1, '#cfd6db', 0);
  }],

  'enemy-client': [36, 42, g => {
    shadow(g, 17, 11, 3.5);
    rr(g, -7, 6, 5.5, 10, 2, '#c9b48a'); rr(g, 1.5, 6, 5.5, 10, 2, '#c9b48a');
    rr(g, -10, -6, 20, 15, 6, '#ff8fb3');
    poly(g, [-3, -6, 3, -6, 0, -1], '#fff', 1.2);
    rr(g, 8, -3, 6, 10, 2, '#2a2c33', 1.5);
    rr(g, 9.2, -1.8, 3.6, 6.5, 1, '#7fd3ff', 0);
    ell(g, 0, -12, 8, 8, '#f1c9a0');
    g.beginPath(); g.arc(0, -13, 8, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 4; g.strokeStyle = '#6b4a2c'; g.stroke();
    rr(g, -7, -20, 14, 3.4, 1.6, '#222', 0);
    ell(g, 2.5, -11.5, 1, 1.2, OUT, 0); ell(g, 5.5, -11.5, 1, 1.2, OUT, 0);
    g.beginPath(); g.arc(4, -8.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 1.3; g.strokeStyle = OUT; g.stroke();
  }],

  'enemy-inspector': [42, 48, g => {
    shadow(g, 20, 13, 4);
    rr(g, -9, 7, 7, 11, 2, '#1f2a3a'); rr(g, 2, 7, 7, 11, 2, '#1f2a3a');
    rr(g, -12, -6, 24, 17, 6, '#e4ff3a');
    rr(g, -11, 0, 22, 2.6, 1, '#dfe6ea', 0);
    rr(g, -3, -6, 6, 17, 2, '#5c7fa8', 1.5);
    rr(g, -19, -3, 12, 15, 2, '#9a6b3a');
    rr(g, -17.5, -0.5, 9, 10.5, 1, '#fff', 0);
    line(g, [-16, 2.5, -10, 2.5, -16, 5, -10, 5, -16, 7.5, -12, 7.5], '#888', 0.8);
    ell(g, 0, -13, 8.5, 8.5, '#e9bf95');
    g.lineWidth = 1.4; g.strokeStyle = OUT;
    g.beginPath(); g.arc(2, -13, 2.6, 0, TAU); g.moveTo(9.6, -13); g.arc(7, -13, 2.6, 0, TAU); g.moveTo(4.6, -13); g.lineTo(4.4, -13); g.stroke();
    line(g, [2.5, -8, 6.5, -8.5], OUT, 1.3);
    hardHat(g, 0, -16, 10.5, '#f7f7f2');
  }],

  'enemy-dropbear': [38, 38, g => {
    shadow(g, 15, 11, 4);
    ell(g, -10, -9, 6.5, 6.5, '#8f949a'); ell(g, -10, -9, 3.3, 3.3, '#e9d6d6', 0);
    ell(g, 10, -9, 6.5, 6.5, '#8f949a'); ell(g, 10, -9, 3.3, 3.3, '#e9d6d6', 0);
    ell(g, 0, 1, 12.5, 12, '#9aa0a6');
    ell(g, 0, 7, 6.5, 5, '#d9dcde', 0);
    ell(g, 0, 1, 3.6, 4.6, '#222', 0);
    ell(g, -5.5, -3, 2.3, 2.3, '#ff2a2a', 0); ell(g, 5.5, -3, 2.3, 2.3, '#ff2a2a', 0);
    line(g, [-8.5, -7, -3, -5], OUT, 1.6); line(g, [8.5, -7, 3, -5], OUT, 1.6);
    poly(g, [-2.2, 6, -1, 9, 0, 6], '#fff', 0); poly(g, [0, 6, 1, 9, 2.2, 6], '#fff', 0);
    line(g, [-9, 11, -10, 14, -7, 12, -7, 15], '#f5f5f5', 1.2);
    line(g, [9, 11, 10, 14, 7, 12, 7, 15], '#f5f5f5', 1.2);
  }],

  'enemy-certifier': [100, 108, g => {
    shadow(g, 46, 34, 9);
    rr(g, -20, 22, 15, 22, 4, '#1f242c'); rr(g, 5, 22, 15, 22, 4, '#1f242c');
    rr(g, -30, -14, 60, 44, 14, '#2d3440', 3);
    poly(g, [-8, -14, 8, -14, 0, -2], '#fff', 2);
    poly(g, [-3, -10, 3, -10, 4, 14, 0, 19, -4, 14], '#c8102e', 2);
    rr(g, -44, -8, 18, 24, 3, '#9a6b3a', 2.5);
    rr(g, -41, -4, 12, 17, 1.5, '#fff', 0);
    g.font = 'bold 7px sans-serif'; g.fillStyle = '#c8102e'; g.fillText('NCR', -40, 6);
    rr(g, 26, -6, 14, 22, 5, '#2d3440', 2.5);
    rr(g, 30, 12, 6, 8, 2, '#5a3a1a', 2);
    rr(g, 24, 19, 18, 9, 2, '#c8102e', 2.5);
    ell(g, 0, -30, 20, 19, '#e6b88f', 3);
    rr(g, 2, -36, 9, 7, 2, 'rgba(255,255,255,.25)', 2);
    rr(g, 13, -36, 9, 7, 2, 'rgba(255,255,255,.25)', 2);
    ell(g, 6.5, -32.5, 1.6, 1.6, OUT, 0); ell(g, 17.5, -32.5, 1.6, 1.6, OUT, 0);
    line(g, [1, -40, 11, -37.5], OUT, 3); line(g, [23, -40, 13, -37.5], OUT, 3);
    g.beginPath(); g.arc(12, -18, 5, 1.15 * Math.PI, 1.85 * Math.PI); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    hardHat(g, 0, -38, 22, '#f7f7f2');
  }],

  'proj-nail': [18, 8, g => {
    line(g, [-7, 0, 6, 0], '#b8c0c7', 2.4);
    poly(g, [6, -1.2, 9, 0, 6, 1.2], '#b8c0c7', 0);
    rr(g, -8.5, -3.2, 2.4, 6.4, 1, '#8b939a', 1);
  }],
  'proj-sawblade': [34, 34, g => {
    const teeth = 14, R = 15, r0 = 12;
    g.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU, b = ((i + 0.5) / teeth) * TAU;
      g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(b) * R, Math.sin(b) * R);
    }
    g.closePath(); g.fillStyle = '#cfd6dc'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    ell(g, 0, 0, 8, 8, '#e7ecef', 1.5);
    ell(g, 0, 0, 3, 3, '#ff6a13', 1.5);
    line(g, [-5, -3, -1, -6], 'rgba(255,255,255,.9)', 1.5);
  }],
  'proj-brick': [22, 12, g => {
    rr(g, -10, -5, 20, 10, 1.5, '#b4462b');
    line(g, [-10, 0, 10, 0, 0, 0, 0, -5, -5, 0, -5, 5, 5, 0, 5, 5], 'rgba(255,230,200,.45)', 1);
  }],
  'proj-offcut': [30, 24, g => {
    poly(g, [-13, -6, 4, -10, 14, -2, 9, 9, -10, 6], '#c4ccd3', 2);
    poly(g, [-9, -4, 2, -7, 8, -2, -2, -1], 'rgba(255,255,255,.55)', 0);
    line(g, [-13, -6, -10, 6], '#ff6a13', 2);
  }],

  'gem-small':  [12, 12, g => gemNut(g, 5,   '#7fd3ff')],
  'gem-medium': [15, 15, g => gemNut(g, 6.5, '#9bff6a')],
  'gem-large':  [19, 19, g => gemNut(g, 8.5, '#ffcf3a')],

  'pickup-pie': [26, 22, g => {
    shadow(g, 8, 11, 3);
    ell(g, 0, 2, 12, 6.5, '#b56a2a');
    ell(g, 0, -1, 11, 6, '#e3a04f');
    line(g, [-5, -2, -2, 0, 1, -2, 4, 0], '#b56a2a', 1.4);
    ell(g, 3, -3, 2.5, 1.2, '#d8342b', 0);
  }],
  'pickup-siren': [26, 26, g => {
    shadow(g, 10, 10, 3);
    rr(g, -9, 3, 18, 6, 2, '#2a2c33');
    g.beginPath(); g.arc(0, 3, 8, Math.PI, 0); g.closePath(); g.fillStyle = '#ffb21f'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    ell(g, -2.5, -1, 2, 2.5, 'rgba(255,255,255,.7)', 0);
    line(g, [-12, -6, -15, -9, 12, -6, 15, -9, 0, -8, 0, -12], '#ffb21f', 2);
  }],
  'pickup-toolbox': [32, 26, g => {
    shadow(g, 11, 13, 3.5);
    rr(g, -6, -11, 12, 6, 2, 'transparent');
    rr(g, -13, -6, 26, 15, 2, '#d8342b');
    rr(g, -13, -6, 26, 4, 1, '#b02520', 2);
    rr(g, -3, -1, 6, 4, 1, '#cfd6dc', 1.5);
  }],

  'ground': [256, 256, null], // generated below (seamless)
  'decor-cone': [26, 30, g => {
    ell(g, 0, 11, 11, 3.5, 'rgba(0,0,0,.2)', 0);
    rr(g, -10, 8, 20, 4, 1, '#e85a10');
    poly(g, [0, -13, 7.5, 9, -7.5, 9], '#ff6a13');
    poly(g, [-3.6, -2.5, 3.6, -2.5, 5, 2, -5, 2], '#f4f4f4', 0);
  }],
  'decor-pallet': [50, 36, g => {
    ell(g, 0, 4, 24, 15, 'rgba(0,0,0,.15)', 0);
    for (let i = 0; i < 5; i++) rr(g, -22, -14 + i * 6.2, 44, 4.6, 1, i % 2 ? '#c99a5c' : '#d6a868', 1.5);
    line(g, [-17, -15, -17, 15, 0, -15, 0, 15, 17, -15, 17, 15], 'rgba(90,60,30,.4)', 2);
  }],
  'decor-sand': [58, 36, g => {
    ell(g, 0, 6, 27, 12, 'rgba(0,0,0,.14)', 0);
    ell(g, 0, 2, 25, 13, '#dcbb80', 2);
    ell(g, -5, -3, 12, 6, '#e8cc95', 0);
    for (let i = 0; i < 14; i++) ell(g, rand(-18, 18), rand(-6, 9), 0.8, 0.8, '#b9955f', 0);
  }],
  'decor-bricks': [38, 30, g => {
    ell(g, 0, 10, 17, 4, 'rgba(0,0,0,.2)', 0);
    for (let row = 0; row < 3; row++) for (let c = 0; c < 3 - (row === 2 ? 1 : 0); c++) {
      rr(g, -16 + c * 11 + (row % 2) * 5, 3 - row * 6.5, 10.5, 6, 1, row % 2 ? '#a9442a' : '#b9502f', 1.3);
    }
  }],
  'decor-rebar': [62, 22, g => {
    ell(g, 0, 6, 28, 5, 'rgba(0,0,0,.15)', 0);
    for (let i = 0; i < 5; i++) line(g, [-26, -6 + i * 3, 26, -4 + i * 3], '#6a5040', 2.2);
    ell(g, 27, -2, 3.5, 3.5, '#ff6a13', 1.5);
    ell(g, -27, -4, 3.5, 3.5, '#ff6a13', 1.5);
  }],
};
function gemNut(g, r, color) {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 1.8; g.strokeStyle = OUT; g.stroke();
  ell(g, 0, 0, r * 0.38, r * 0.38, 'rgba(0,0,0,.35)', 0);
  line(g, [-r * 0.55, -r * 0.45, -r * 0.1, -r * 0.7], 'rgba(255,255,255,.8)', 1.4);
}
function drawGroundTile(g) {
  g.fillStyle = '#c8a472'; g.fillRect(0, 0, 256, 256);
  const seedR = (i) => hash2(i, 7, 3);
  for (let i = 0; i < 900; i++) {
    const x = seedR(i) * 256, y = seedR(i + 5000) * 256, s = 0.6 + seedR(i + 9000) * 1.8;
    g.fillStyle = seedR(i + 13000) < 0.6 ? 'rgba(140,105,60,.35)' : 'rgba(235,210,160,.45)';
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(150,115,70,.12)';
    g.beginPath(); g.ellipse(seedR(i + 300) * 256, seedR(i + 400) * 256, 20 + seedR(i + 500) * 30, 10 + seedR(i + 600) * 14, seedR(i + 700) * 3, 0, TAU); g.fill();
  }
}

/* =====================================================================
 * 4. ASSET LOADING
 * ===================================================================*/
const SPR = {};      // key -> { img, w, h, white? }
const ICONS = {};    // id  -> url (only for icons that loaded)
const SOUNDS = {};   // key -> HTMLAudioElement (only for sounds that loaded)
const ASSET_ROOT = 'assets/';

function makeCanvasSprite(w, h, draw, res = 3) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
  const g = c.getContext('2d');
  g.scale(res, res);
  if (draw) { g.translate(w / 2, h / 2); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); }
  else drawGroundTile(g);
  return { img: c, w, h };
}
function builtInSprite(key) { const [w, h, draw] = ART[key]; return makeCanvasSprite(w, h, draw); }
function whiteVersion(s) {
  const c = document.createElement('canvas');
  c.width = s.img.width || s.img.naturalWidth; c.height = s.img.height || s.img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(s.img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function loadImage(url, timeout = 6000) {
  return new Promise((resolve) => {
    const img = new Image(); let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok ? img : null); } };
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    setTimeout(() => finish(false), timeout);
    img.src = url;
  });
}
function loadSound(url, timeout = 4000) {
  return new Promise((resolve) => {
    const a = new Audio(); let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok ? a : null); } };
    a.addEventListener('canplaythrough', () => finish(true), { once: true });
    a.addEventListener('error', () => finish(false), { once: true });
    setTimeout(() => finish(a.readyState >= 3), timeout);
    a.preload = 'auto'; a.src = url; a.load();
  });
}

async function loadAssets() {
  const cfg = window.ASSET_CONFIG || {};
  const sprites = cfg.sprites || {};
  for (const key in ART) SPR[key] = builtInSprite(key);
  const jobs = [];
  for (const key in ART) {
    const entry = sprites[key];
    if (!entry || !entry.file) continue;
    jobs.push(loadImage(ASSET_ROOT + entry.file).then((img) => {
      if (!img) return;
      const w = entry.width || SPR[key].w;
      SPR[key] = { img, w, h: w * img.naturalHeight / img.naturalWidth, custom: true };
    }));
  }
  for (const id in (cfg.icons || {})) {
    const url = ASSET_ROOT + cfg.icons[id];
    jobs.push(loadImage(url).then((img) => { if (img) ICONS[id] = url; }));
  }
  if (location.protocol !== 'file:') {
    for (const k in (cfg.sounds || {})) {
      jobs.push(loadSound(ASSET_ROOT + cfg.sounds[k]).then((a) => { if (a) SOUNDS[k] = a; }));
    }
  } else {
    // Browsers handle local audio inconsistently; try anyway but don't wait on it.
    for (const k in (cfg.sounds || {})) loadSound(ASSET_ROOT + cfg.sounds[k]).then((a) => { if (a) SOUNDS[k] = a; });
  }
  await Promise.all(jobs);
  for (const key in SPR) if (key.startsWith('enemy-')) SPR[key].white = whiteVersion(SPR[key]);
  buildGroundPattern();
}

let groundPattern = null;
function buildGroundPattern() {
  const s = SPR.ground;
  groundPattern = ctx.createPattern(s.img, 'repeat');
  const iw = s.img.naturalWidth || s.img.width;
  const k = s.w / iw;
  if (groundPattern.setTransform) groundPattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
}

// Icon HTML for menus: custom image if one loaded, otherwise the emoji.
function iconHTML(id, emoji) {
  return ICONS[id] ? `<img class="icon-img" src="${ICONS[id]}" alt="">` : emoji;
}

/* ---------- sound ---------- */
let AC = null, muted = false, music = null;
const lastPlayed = {};
function initAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
}
function beep(freq, dur, type = 'square', vol = 0.08, slide = 0) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SYNTH = {
  gem:     () => beep(rand(900, 1100), 0.06, 'triangle', 0.05, 1.4),
  hit:     () => beep(rand(160, 220), 0.05, 'square', 0.03, 0.6),
  hurt:    () => beep(180, 0.25, 'sawtooth', 0.09, 0.4),
  levelup: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.08), i * 70)); },
  boss:    () => { beep(110, 0.6, 'sawtooth', 0.1, 0.7); setTimeout(() => beep(98, 0.7, 'sawtooth', 0.1, 0.6), 250); },
};
const THROTTLE = { gem: 0.045, hit: 0.06, hurt: 0.2 };
function sfx(name) {
  if (muted) return;
  const now = performance.now() / 1000;
  if (THROTTLE[name] && now - (lastPlayed[name] || 0) < THROTTLE[name]) return;
  lastPlayed[name] = now;
  const vol = (window.ASSET_CONFIG && window.ASSET_CONFIG.volume && window.ASSET_CONFIG.volume.sfx) ?? 0.5;
  if (SOUNDS[name]) { const a = SOUNDS[name].cloneNode(); a.volume = vol; a.play().catch(() => {}); }
  else if (SYNTH[name]) SYNTH[name]();
}
function startMusic() {
  if (!SOUNDS.music || muted) return;
  if (!music) { music = SOUNDS.music; music.loop = true; music.volume = (window.ASSET_CONFIG.volume && window.ASSET_CONFIG.volume.music) ?? 0.35; }
  music.play().catch(() => {});
}
function stopMusic() { if (music) music.pause(); }

/* =====================================================================
 * 5. GAME STATE & CORE LOOP
 * ===================================================================*/
let state = 'loading';   // loading | menu | play | levelup | pause | end
let selectedTrade = 'sparky';
let G = null;
const menuCam = { x: 0, y: 0 };

function newGame(trade) {
  const p = {
    x: 0, y: 0, r: 15, fx: 1, fy: 0, flip: false, moving: false, anim: 0,
    hp: 100, inv: 0, level: 1, xp: 0, weapons: [], passives: {},
  };
  G = {
    t: 0, trade, player: p, kills: 0, bonusDmg: 0,
    enemies: [], projectiles: [], lobs: [], bolts: [], puddles: [], rings: [],
    gems: [], pickups: [], particles: [], numbers: [],
    cam: { x: 0, y: 0 }, shake: 0, spawnAcc: 0, nextId: 1, pendingLevels: 0,
    events: EVENTS.map(e => ({ ...e, done: false })), overtime: false, nextOvertimeBoss: 0, bubbleCount: 0,
  };
  p.weapons.push({ id: TRADES[trade].start, level: 1, t: 0.4, angle: 0 });
  recalc(); p.hp = p.maxHp;
}

function recalc() {
  const p = G.player;
  p.speed = 165; p.maxHp = 100; p.armor = 0; p.regen = 0; p.magnet = 80;
  p.dmgMul = 1 + G.bonusDmg; p.cdMul = 1; p.areaMul = 1;
  TRADES[G.trade].perk(p);
  for (const id in G.player.passives) for (let i = 0; i < p.passives[id]; i++) PASSIVES[id].apply(p);
  p.hp = Math.min(p.hp, p.maxHp);
}

/* ---------- input ---------- */
const keys = new Set();
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if ((k === 'escape' || k === 'p') && (state === 'play' || state === 'pause')) togglePause();
  if (k === 'm') toggleMute();
  if (state === 'levelup' && ['1', '2', '3'].includes(k)) chooseUpgrade(+k - 1);
  if (state === 'menu' && k === 'enter') startGame();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play' || joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => { if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = (e) => { if (e.pointerId === joy.id) { joy.active = false; joy.id = null; } };
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

function readMove() {
  let mx = 0, my = 0;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  const kl = Math.hypot(mx, my);
  if (kl > 0) return [mx / kl, my / kl];
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d > 6) { const m = Math.min(1, d / 55); return [dx / d * m, dy / d * m]; }
  }
  return [0, 0];
}

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (state === 'play') update(dt);
  else if (state === 'menu') { menuCam.x += dt * 18; menuCam.y += dt * 7; }
  draw();
  if (G && state !== 'menu') updateHud();
  requestAnimationFrame(frame);
}

function update(dt) {
  const p = G.player;
  G.t += dt;

  const [mx, my] = readMove();
  const ml = Math.hypot(mx, my);
  p.x += mx * p.speed * dt; p.y += my * p.speed * dt;
  p.moving = ml > 0.05;
  if (p.moving) { p.fx = mx / ml; p.fy = my / ml; if (Math.abs(mx) > 0.15) p.flip = mx < 0; }
  p.anim += dt * (p.moving ? 11 : 2.5);
  p.inv = Math.max(0, p.inv - dt);
  if (p.regen) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  G.cam.x = p.x; G.cam.y = p.y;
  G.shake = Math.max(0, G.shake - dt * 30);

  director(dt);
  if (state !== 'play') return;   // e.g. knock-off just happened
  buildGrid();

  for (const w of p.weapons) {
    const def = WEAPONS[w.id], s = def.stats(w.level);
    if (WEAPON_UPDATE[w.id]) WEAPON_UPDATE[w.id](w, dt, s);
    if (WEAPON_FIRE[w.id]) {
      w.t -= dt;
      if (w.t <= 0) { WEAPON_FIRE[w.id](w, s); w.t = s.cd * p.cdMul; }
    }
  }

  updateProjectiles(dt);
  updateLobs(dt);
  updatePuddles(dt);
  updateEnemies(dt);
  updateGems(dt);
  updatePickups(dt);
  updateFx(dt);

  if (G.enemies.some(e => e.dead)) G.enemies = G.enemies.filter(e => !e.dead);

  if (p.hp <= 0) { endGame(false); return; }
  if (G.pendingLevels > 0) openLevelUp();
}

function director(dt) {
  const t = G.t;
  for (const ev of G.events) if (!ev.done && t >= ev.t) { ev.done = true; runEvent(ev.type); if (state !== 'play') return; }
  if (G.overtime && t >= G.nextOvertimeBoss) { G.nextOvertimeBoss = t + 90; runEvent('boss'); }

  let weights = SCHEDULE[0][1];
  for (const [st, w] of SCHEDULE) if (t >= st) weights = w;
  G.spawnAcc += spawnRate(t) * dt;
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1;
    if (G.enemies.length < ENEMY_CAP) spawnEnemy(pickWeighted(weights));
  }
}

function runEvent(type) {
  const p = G.player;
  if (type === 'swoop') {
    showBanner('SWOOPING SEASON!', 'Magpies incoming. Keep moving.');
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const e = spawnEnemy('magpie', p.x + Math.cos(a) * 480, p.y + Math.sin(a) * 480);
      e.speed *= 1.25;
    }
  } else if (type === 'boss') {
    showBanner('THE CERTIFIER IS ON SITE', 'Defect notices incoming');
    sfx('boss');
    const e = spawnEnemy('certifier');
    e.say = 'SHOW ME YOUR PAPERWORK'; e.sayT = 3;
  } else if (type === 'win') {
    endGame(true);
  }
}

/* ---------- spatial grid (fast "who's near here?") ---------- */
const CELL = 64, MAX_ENEMY_R = 40;
const grid = new Map();
const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e);
  }
}
const _q = [];
function queryEnemies(x, y, r, out = _q) {
  out.length = 0;
  const R = r + MAX_ENEMY_R;
  const x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL);
  const y0 = Math.floor((y - R) / CELL), y1 = Math.floor((y + R) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(gkey(cx, cy)); if (!a) continue;
    for (const e of a) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr2 = r + e.r;
      if (dx * dx + dy * dy <= rr2 * rr2) out.push(e);
    }
  }
  return out;
}
function nearestEnemy(x, y, range, exclude) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead || (exclude && exclude.has(e.id))) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* =====================================================================
 * 6. WEAPONS, ENEMIES, PICKUPS
 * ===================================================================*/
const WEAPON_FIRE = {
  nailgun(w, s) {
    const p = G.player, tgt = nearestEnemy(p.x, p.y, 460);
    const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.atan2(p.fy, p.fx);
    for (let i = 0; i < s.n; i++) {
      const a = ang + (i - (s.n - 1) / 2) * 0.13;
      G.projectiles.push({ kind: 'nail', x: p.x, y: p.y - 4, vx: Math.cos(a) * 580, vy: Math.sin(a) * 580, a, life: 1.1, r: 6, dmg: s.dmg, pierce: s.pierce, hitIds: [] });
    }
  },
  brick(w, s) {
    const p = G.player, near = [];
    for (const e of G.enemies) if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 380 * 380) near.push(e);
    for (let i = 0; i < s.n; i++) {
      let tx, ty;
      if (near.length) { const e = pick(near); tx = e.x + rand(-10, 10); ty = e.y + rand(-10, 10); }
      else { const a = rand(0, TAU), d = rand(60, 180); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
      G.lobs.push({ sx: p.x, sy: p.y - 10, tx, ty, t: 0, T: rand(0.55, 0.7), dmg: s.dmg, rad: s.rad * p.areaMul, spin: rand(-12, 12) });
    }
  },
  zap(w, s) {
    const p = G.player, firstTargets = new Set();
    for (let b = 0; b < s.bolts; b++) {
      let cur = nearestEnemy(p.x, p.y, s.range, firstTargets);
      if (!cur) return;
      firstTargets.add(cur.id);
      const hit = new Set(), pts = [[p.x + 12, p.y - 2]];
      for (let i = 0; i <= s.chains && cur; i++) {
        hit.add(cur.id); pts.push([cur.x, cur.y]);
        hitEnemy(cur, s.dmg, 0, 0, 0);
        sparks(cur.x, cur.y, '#bfe9ff', 3);
        cur = nearestEnemy(cur.x, cur.y, s.chainR, hit);
      }
      G.bolts.push({ pts, life: 0.22, max: 0.22 });
    }
  },
  concrete(w, s) {
    const p = G.player, near = [];
    for (const e of G.enemies) if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 260 * 260) near.push(e);
    for (let i = 0; i < s.n; i++) {
      let x = p.x + rand(-40, 40), y = p.y + rand(-40, 40);
      if (near.length) { const e = pick(near); x = e.x; y = e.y; }
      G.puddles.push({ x, y, r: s.r * p.areaMul, life: s.dur, max: s.dur, dmg: s.dmg, tick: 0, seed: (Math.random() * 1e6) | 0 });
    }
  },
  offcut(w, s) {
    const p = G.player, tgt = nearestEnemy(p.x, p.y, 420);
    const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.atan2(p.fy, p.fx);
    for (let i = 0; i < s.n; i++) {
      const a = ang + (i - (s.n - 1) / 2) * 0.6;
      G.projectiles.push({ kind: 'offcut', id: G.nextId++, x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a), t: 0, T: 1.1, D: s.dist, dmg: s.dmg, r: s.size * p.areaMul, rot: 0 });
    }
  },
};

const WEAPON_UPDATE = {
  saw(w, dt, s) {
    const p = G.player;
    w.angle = (w.angle || 0) + dt * s.spin;
    const R = s.rad * p.areaMul, br = s.br * p.areaMul;
    w.pos = [];
    for (let i = 0; i < s.n; i++) {
      const a = w.angle + (i * TAU) / s.n;
      const bx = p.x + Math.cos(a) * R, by = p.y + Math.sin(a) * R;
      w.pos.push([bx, by, br]);
      for (const e of queryEnemies(bx, by, br)) {
        if ((e.hit.saw || 0) > G.t) continue;
        e.hit.saw = G.t + 0.3;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        hitEnemy(e, s.dmg, dx / d, dy / d, 140);
        sparks(bx, by, '#ffd34d', 3);
      }
    }
  },
};

function updateProjectiles(dt) {
  const p = G.player;
  for (const b of G.projectiles) {
    if (b.kind === 'nail') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      for (const e of queryEnemies(b.x, b.y, b.r)) {
        if (b.hitIds.includes(e.id)) continue;
        b.hitIds.push(e.id);
        hitEnemy(e, b.dmg, Math.cos(b.a), Math.sin(b.a), 160);
        sparks(b.x, b.y, '#e6edf2', 2);
        if (--b.pierce <= 0) { b.dead = true; break; }
      }
    } else if (b.kind === 'offcut') {
      b.t += dt;
      const k = b.t / b.T;
      if (k >= 1) { b.dead = true; continue; }
      const s = Math.sin(Math.PI * k) * b.D;
      b.x = p.x + b.dx * s; b.y = p.y + b.dy * s; b.rot += dt * 15;
      const key = 'o' + b.id;
      for (const e of queryEnemies(b.x, b.y, b.r)) {
        if ((e.hit[key] || 0) > G.t) continue;
        e.hit[key] = G.t + 0.35;
        hitEnemy(e, b.dmg, b.dx, b.dy, 90);
        sparks(b.x, b.y, '#dfe6ea', 3);
      }
    }
  }
  if (G.projectiles.some(b => b.dead)) G.projectiles = G.projectiles.filter(b => !b.dead);
}

function updateLobs(dt) {
  for (const l of G.lobs) {
    l.t += dt;
    if (l.t >= l.T) {
      l.dead = true;
      for (const e of queryEnemies(l.tx, l.ty, l.rad)) {
        const dx = e.x - l.tx, dy = e.y - l.ty, d = Math.hypot(dx, dy) || 1;
        hitEnemy(e, l.dmg, dx / d, dy / d, 220);
      }
      G.rings.push({ x: l.tx, y: l.ty, r: l.rad, life: 0.3, max: 0.3, color: '255,240,210' });
      for (let i = 0; i < 10; i++) particle(l.tx, l.ty, rand(-140, 140), rand(-140, 60), i < 4 ? '#b4462b' : '#e2cfa8', rand(0.3, 0.6), rand(2, 4));
      G.shake = Math.min(10, G.shake + 1.5);
    }
  }
  if (G.lobs.some(l => l.dead)) G.lobs = G.lobs.filter(l => !l.dead);
}

function updatePuddles(dt) {
  for (const pd of G.puddles) {
    pd.life -= dt; pd.tick -= dt;
    if (pd.life <= 0) { pd.dead = true; continue; }
    const doTick = pd.tick <= 0;
    for (const e of queryEnemies(pd.x, pd.y, pd.r * 0.85)) {
      e.slow = 0.15;
      if (doTick) hitEnemy(e, pd.dmg, 0, 0, 0);
    }
    if (doTick) pd.tick = 0.5;
  }
  if (G.puddles.some(p => p.dead)) G.puddles = G.puddles.filter(p => !p.dead);
}

function spawnPos() {
  const vw = W / SCALE, vh = H / SCALE, d = Math.hypot(vw, vh) / 2 + 40, a = rand(0, TAU);
  return [G.player.x + Math.cos(a) * d, G.player.y + Math.sin(a) * d];
}
function spawnEnemy(type, x, y) {
  const T = ENEMIES[type];
  if (x === undefined) [x, y] = spawnPos();
  const hm = enemyHpMul(G.t);
  const e = {
    id: G.nextId++, type, x, y, hp: T.hp * hm, maxHp: T.hp * hm, speed: T.speed * rand(0.9, 1.1),
    dmg: T.dmg, r: T.r, xp: T.xp, boss: !!T.boss, flash: 0, slow: 0, kbx: 0, kby: 0, hit: {},
    flip: false, phase: rand(0, 10), dash: 0, dashCd: rand(2, 5), say: null, sayT: 0,
  };
  if (T.lines && !T.boss && Math.random() < 0.15 && G.bubbleCount < 3) { e.say = pick(T.lines); e.sayT = 2.6; G.bubbleCount++; }
  G.enemies.push(e);
  return e;
}

function updateEnemies(dt) {
  const p = G.player, farD = Math.hypot(W / SCALE, H / SCALE) / 2 + 260, dm = enemyDmgMul(G.t);
  let bubbles = 0;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > farD && !e.boss) { [e.x, e.y] = spawnPos(); continue; }

    let sp = e.speed * (e.slow > 0 ? 0.45 : 1);
    if (e.type === 'magpie' || e.boss) {        // magpies swoop, the Certifier charges
      e.dashCd -= dt;
      if (e.dashCd <= 0 && d < (e.boss ? 420 : 320)) { e.dash = e.boss ? 0.7 : 0.45; e.dashCd = e.boss ? rand(5, 7) : rand(3, 5); }
      if (e.dash > 0) { e.dash -= dt; sp *= e.boss ? 3 : 2.6; }
    }
    e.x += (dx / d) * sp * dt + e.kbx * dt;
    e.y += (dy / d) * sp * dt + e.kby * dt;
    const decay = Math.min(1, 9 * dt); e.kbx -= e.kbx * decay; e.kby -= e.kby * decay;
    if (Math.abs(dx) > 2) e.flip = dx < 0;
    e.flash = Math.max(0, e.flash - dt);
    e.slow = Math.max(0, e.slow - dt);
    if (e.sayT > 0) { e.sayT -= dt; bubbles++; }
    else if (e.boss && Math.random() < dt * 0.25) { e.say = pick(ENEMIES.certifier.lines); e.sayT = 2; }

    // keep crowds from stacking into one blob
    if (!e.boss) {
      const a = grid.get(gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)));
      if (a) for (const o of a) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x, oy = e.y - o.y, rr2 = e.r + o.r, dd = ox * ox + oy * oy;
        if (dd < rr2 * rr2 && dd > 0.01) {
          const dist = Math.sqrt(dd), push = (rr2 - dist) * 0.35;
          e.x += (ox / dist) * push; e.y += (oy / dist) * push;
        }
      }
    }

    if (d < e.r + p.r - 4 && p.inv <= 0) hurtPlayer(e.dmg * dm);
  }
  G.bubbleCount = bubbles;
}

function hurtPlayer(raw) {
  const p = G.player;
  const dmg = Math.max(1, raw - p.armor);
  p.hp -= dmg; p.inv = 0.45;
  G.shake = Math.min(12, G.shake + 6);
  addNumber(p.x, p.y - 26, dmg, '#ff5a4f');
  sfx('hurt');
}

function hitEnemy(e, dmg, kx, ky, kb) {
  if (e.dead) return;
  dmg *= G.player.dmgMul;
  e.hp -= dmg; e.flash = 0.09;
  const kmul = e.boss ? 0.08 : 1;
  e.kbx += kx * kb * kmul; e.kby += ky * kb * kmul;
  addNumber(e.x + rand(-6, 6), e.y - e.r - 4, dmg, '#fff');
  sfx('hit');
  if (e.hp <= 0) killEnemy(e);
}

const DEATH_COLORS = { magpie: '#151515', ibis: '#efeadf', client: '#ff8fb3', inspector: '#e4ff3a', dropbear: '#9aa0a6', certifier: '#c8102e' };
function killEnemy(e) {
  e.dead = true; G.kills++;
  dropGem(e.x, e.y, e.xp);
  for (let i = 0; i < (e.boss ? 40 : 6); i++) particle(e.x, e.y, rand(-120, 120), rand(-120, 120), DEATH_COLORS[e.type] || '#fff', rand(0.25, 0.5), rand(2, 4));
  if (e.boss) {
    G.pickups.push({ type: 'toolbox', x: e.x, y: e.y, bob: 0 });
    G.rings.push({ x: e.x, y: e.y, r: 160, life: 0.5, max: 0.5, color: '255,255,255' });
    G.shake = 14;
    showBanner('CERTIFIER SIGNED OFF', 'Grab the toolbox');
  } else {
    const p = G.player, r = Math.random();
    if (r < (p.hp < p.maxHp * 0.6 ? 1 / 180 : 1 / 600)) G.pickups.push({ type: 'pie', x: e.x, y: e.y, bob: rand(0, 6) });
    else if (r > 1 - 1 / 900) G.pickups.push({ type: 'siren', x: e.x, y: e.y, bob: rand(0, 6) });
  }
}

function dropGem(x, y, v) {
  if (G.gems.length >= 400) { const g = G.gems[(Math.random() * G.gems.length) | 0]; g.v += v; return; }
  G.gems.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), v, mag: false, spd: 0 });
}
function updateGems(dt) {
  const p = G.player, m2 = p.magnet * p.magnet;
  for (const g of G.gems) {
    const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
    if (!g.mag && d2 < m2) g.mag = true;
    if (g.mag) {
      const d = Math.sqrt(d2) || 1;
      g.spd = Math.min(900, g.spd + 1100 * dt);
      const step = Math.min(d, (220 + g.spd) * dt);
      g.x += (dx / d) * step; g.y += (dy / d) * step;
      if (d < p.r + 6) { g.dead = true; gainXp(g.v); sfx('gem'); }
    }
  }
  if (G.gems.some(g => g.dead)) G.gems = G.gems.filter(g => !g.dead);
}
function gainXp(v) {
  const p = G.player;
  p.xp += v;
  while (p.xp >= xpToLevel(p.level)) { p.xp -= xpToLevel(p.level); p.level++; G.pendingLevels++; }
}
function updatePickups(dt) {
  const p = G.player;
  for (const k of G.pickups) {
    k.bob += dt * 4;
    const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy);
    if (k.type === 'toolbox' && d < 200) { k.x += dx / d * 260 * dt; k.y += dy / d * 260 * dt; }
    if (d < p.r + 14) {
      k.dead = true;
      if (k.type === 'pie') { p.hp = Math.min(p.maxHp, p.hp + 30); addNumber(p.x, p.y - 30, '+30', '#7dff6a'); sfx('gem'); }
      if (k.type === 'siren') { for (const g of G.gems) g.mag = true; showBanner('KNOCK-OFF SIREN', 'All XP incoming'); }
      if (k.type === 'toolbox') { G.pendingLevels += 2; }
    }
  }
  if (G.pickups.some(k => k.dead)) G.pickups = G.pickups.filter(k => !k.dead);
}

/* ---------- effects ---------- */
function particle(x, y, vx, vy, c, life, s) {
  if (G.particles.length > 350) return;
  G.particles.push({ x, y, vx, vy, c, life, max: life, s });
}
function sparks(x, y, c, n) { for (let i = 0; i < n; i++) particle(x, y, rand(-160, 160), rand(-160, 160), c, rand(0.12, 0.25), rand(1.5, 2.5)); }
function addNumber(x, y, v, color) {
  if (G.numbers.length > 70) return;
  const text = typeof v === 'number' ? String(Math.round(v)) : v;
  if (text === '0') return;
  G.numbers.push({ x, y, text, color, life: 0.6, max: 0.6 });
}
function updateFx(dt) {
  for (const q of G.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; q.life -= dt; }
  G.particles = G.particles.filter(q => q.life > 0);
  for (const n of G.numbers) { n.y -= 34 * dt; n.life -= dt; }
  G.numbers = G.numbers.filter(n => n.life > 0);
  for (const b of G.bolts) b.life -= dt;
  G.bolts = G.bolts.filter(b => b.life > 0);
  for (const r of G.rings) r.life -= dt;
  G.rings = G.rings.filter(r => r.life > 0);
}

/* =====================================================================
 * 7. RENDERING
 * ===================================================================*/
function spr(key, x, y, opts = {}) {
  const s = SPR[key]; if (!s) return;
  const img = opts.white && s.white ? s.white : s.img;
  const w = s.w * (opts.scale || 1), h = s.h * (opts.scale || 1);
  if (opts.flip || opts.rot) {
    ctx.save(); ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

const DECOR = ['decor-cone', 'decor-pallet', 'decor-sand', 'decor-bricks', 'decor-rebar'];
function drawDecor(left, top, vw, vh) {
  const C = 360;
  const cx0 = Math.floor(left / C), cx1 = Math.floor((left + vw) / C);
  const cy0 = Math.floor(top / C), cy1 = Math.floor((top + vh) / C);
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const n = Math.floor(hash2(cx, cy, 1) * 2.4);
    for (let i = 0; i < n; i++) {
      const kind = DECOR[Math.floor(hash2(cx, cy, 10 + i) * DECOR.length)];
      const x = cx * C + 30 + hash2(cx, cy, 20 + i) * (C - 60), y = cy * C + 30 + hash2(cx, cy, 30 + i) * (C - 60);
      if (kind === 'decor-cone' && hash2(cx, cy, 40 + i) < 0.5) { spr(kind, x - 16, y); spr(kind, x + 16, y + 4); }
      else spr(kind, x, y, { flip: hash2(cx, cy, 50 + i) < 0.5 });
    }
  }
}

function drawPuddle(pd) {
  const fade = Math.min(1, pd.life / 0.5), grow = Math.min(1, (pd.max - pd.life) / 0.2);
  const r = pd.r * (0.6 + 0.4 * grow);
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = '#8f8d87';
  // smooth wobbly blob: curve through the midpoints of jittered rim points
  const N = 12, pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, wob = 0.86 + hash2(pd.seed, i, 2) * 0.24;
    pts.push([pd.x + Math.cos(a) * r * wob, pd.y + Math.sin(a) * r * wob * 0.8]);
  }
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const [x0, y0] = pts[i % N], [x1, y1] = pts[(i + 1) % N], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    i ? ctx.quadraticCurveTo(x0, y0, mx, my) : ctx.moveTo(mx, my);
  }
  ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#6a6863'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.ellipse(pd.x - r * 0.25, pd.y - r * 0.2, r * 0.35, r * 0.14, -0.3, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBolt(b) {
  const a = b.life / b.max;
  for (const [w, c] of [[7, `rgba(120,200,255,${0.35 * a})`], [2.5, `rgba(255,255,255,${a})`]]) {
    ctx.beginPath(); ctx.lineWidth = w; ctx.strokeStyle = c;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x0, y0] = b.pts[i], [x1, y1] = b.pts[i + 1];
      if (i === 0) ctx.moveTo(x0, y0);
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      for (let s = 1; s <= 4; s++) {
        const k = s / 4, j = s < 4 ? rand(-9, 9) : 0;
        ctx.lineTo(x0 + (x1 - x0) * k + (nx / l) * j, y0 + (y1 - y0) * k + (ny / l) * j);
      }
    }
    ctx.stroke();
  }
}

function drawBubble(x, y, text) {
  ctx.font = '700 12px "Barlow Condensed", sans-serif';
  const w = ctx.measureText(text).width + 12, h = 18;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, 5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x + 4, y); ctx.fill();
  ctx.fillStyle = OUT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - h / 2 + 1);
}

function drawEnemy(e) {
  const bob = Math.sin(G.t * 10 + e.phase) * 1.4;
  const key = 'enemy-' + e.type;
  if (e.dash > 0 && e.type === 'magpie') {
    ctx.globalAlpha = 0.25; spr(key, e.x - e.kbx * 0.02, e.y + 6, { flip: e.flip, scale: 1.1 }); ctx.globalAlpha = 1;
  }
  spr(key, e.x, e.y + bob, { flip: e.flip, white: e.flash > 0 });
  if (e.slow > 0) { ctx.fillStyle = 'rgba(120,120,115,.5)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.8, e.r, e.r * 0.35, 0, 0, TAU); ctx.fill(); }
  if (e.boss) {
    const w = 80, y = e.y - SPR[key].h / 2 - 10;
    ctx.fillStyle = OUT; ctx.fillRect(e.x - w / 2 - 2, y - 2, w + 4, 9);
    ctx.fillStyle = '#c8102e'; ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 5);
  }
}

function drawPlayer() {
  const p = G.player;
  if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  const bob = p.moving ? Math.abs(Math.sin(p.anim)) * -3 : Math.sin(p.anim) * 0.8;
  const tilt = p.moving ? Math.sin(p.anim) * 0.06 : 0;
  spr('player-' + G.trade, p.x, p.y + bob, { flip: p.flip, rot: tilt });
  ctx.globalAlpha = 1;
  // HP bar
  const w = 38, y = p.y + 24;
  ctx.fillStyle = OUT; ctx.fillRect(p.x - w / 2 - 2, y - 2, w + 4, 8);
  ctx.fillStyle = '#4a1b1b'; ctx.fillRect(p.x - w / 2, y, w, 4);
  ctx.fillStyle = p.hp / p.maxHp > 0.35 ? '#5bea5b' : '#ff5a4f';
  ctx.fillRect(p.x - w / 2, y, w * clamp(p.hp / p.maxHp, 0, 1), 4);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!groundPattern) { ctx.fillStyle = '#c8a472'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
  const cam = G && state !== 'menu' ? G.cam : menuCam;
  const shake = G && state !== 'menu' ? G.shake : 0;
  const sx = rand(-1, 1) * shake, sy = rand(-1, 1) * shake, s = SCALE * DPR;
  ctx.setTransform(s, 0, 0, s, DPR * (W / 2 + sx) - cam.x * s, DPR * (H / 2 + sy) - cam.y * s);
  const vw = W / SCALE, vh = H / SCALE, left = cam.x - vw / 2 - 30, top = cam.y - vh / 2 - 30;
  ctx.fillStyle = groundPattern; ctx.fillRect(left, top, vw + 60, vh + 60);
  drawDecor(left - 40, top - 40, vw + 140, vh + 140);
  if (!G || state === 'menu') return;

  const p = G.player;
  for (const pd of G.puddles) drawPuddle(pd);
  for (const r of G.rings) {
    const k = 1 - r.life / r.max;
    ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.8})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.5 + 0.5 * k), r.r * (0.5 + 0.5 * k) * 0.8, 0, 0, TAU); ctx.stroke();
  }
  for (const g of G.gems) spr(g.v >= 10 ? 'gem-large' : g.v >= 3 ? 'gem-medium' : 'gem-small', g.x, g.y);
  for (const k of G.pickups) spr('pickup-' + k.type, k.x, k.y + Math.sin(k.bob) * 3);

  // depth: enemies above the player are drawn first
  G.enemies.sort((a, b) => a.y - b.y);
  let i = 0;
  for (; i < G.enemies.length && G.enemies[i].y < p.y; i++) drawEnemy(G.enemies[i]);
  drawPlayer();
  for (; i < G.enemies.length; i++) drawEnemy(G.enemies[i]);

  for (const w of p.weapons) if (w.id === 'saw' && w.pos) for (const [bx, by, br] of w.pos) spr('proj-sawblade', bx, by, { rot: w.angle * 4, scale: br / 15 });
  for (const b of G.projectiles) {
    if (b.kind === 'nail') spr('proj-nail', b.x, b.y, { rot: b.a });
    else spr('proj-offcut', b.x, b.y, { rot: b.rot, scale: b.r / 12 });
  }
  for (const l of G.lobs) {
    const k = l.t / l.T, gx = l.sx + (l.tx - l.sx) * k, gy = l.sy + (l.ty - l.sy) * k;
    const h = Math.sin(Math.PI * k) * (90 + Math.hypot(l.tx - l.sx, l.ty - l.sy) * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(gx, gy + 4, 8, 3, 0, 0, TAU); ctx.fill();
    if (k > 0.6) { ctx.strokeStyle = `rgba(216,52,43,${(k - 0.6) * 1.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(l.tx, l.ty, l.rad, l.rad * 0.8, 0, 0, TAU); ctx.stroke(); }
    spr('proj-brick', gx, gy - h, { rot: l.t * l.spin });
  }
  for (const b of G.bolts) drawBolt(b);
  for (const q of G.particles) { ctx.globalAlpha = q.life / q.max; ctx.fillStyle = q.c; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 15px "Barlow Condensed", sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = OUT;
  for (const n of G.numbers) {
    ctx.globalAlpha = Math.min(1, n.life / n.max * 2);
    ctx.strokeText(n.text, n.x, n.y); ctx.fillStyle = n.color; ctx.fillText(n.text, n.x, n.y);
  }
  ctx.globalAlpha = 1;
  for (const e of G.enemies) if (e.sayT > 0 && e.say) drawBubble(e.x, e.y - SPR['enemy-' + e.type].h / 2 - (e.boss ? 18 : 4), e.say);

  // touch joystick (screen space)
  if (joy.active) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgba(23,24,27,.25)'; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 55, 0, TAU); ctx.fill(); ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), m = Math.min(d, 55) / (d || 1);
    ctx.fillStyle = 'rgba(228,255,58,.85)';
    ctx.beginPath(); ctx.arc(joy.ox + dx * m, joy.oy + dy * m, 22, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

/* =====================================================================
 * 8. UI
 * ===================================================================*/
function showOverlay(id) {
  for (const o of ['menu', 'levelup', 'pause', 'end']) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', id === 'menu');
}

function showBanner(title, sub) {
  const b = $('banner');
  b.querySelector('.b-title').textContent = title;
  b.querySelector('.b-sub').textContent = sub || '';
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function buildMenu() {
  const wrap = $('trades'); wrap.innerHTML = '';
  for (const id in TRADES) {
    const t = TRADES[id], wdef = WEAPONS[t.start];
    const btn = document.createElement('button');
    btn.className = 'trade' + (id === selectedTrade ? ' sel' : '');
    btn.innerHTML = `<canvas width="144" height="164"></canvas>
      <div class="tname">${t.name}</div><div class="ttitle">${t.title}</div>
      <div class="tstart">${iconHTML(t.start, wdef.emoji)} ${wdef.name}</div>
      <div class="tperk">${t.perkText}</div>`;
    const c = btn.querySelector('canvas'), g = c.getContext('2d'), s = SPR['player-' + id];
    const k = Math.min(144 / s.w, 164 / s.h) * 0.92;
    g.drawImage(s.img, 72 - (s.w * k) / 2, 82 - (s.h * k) / 2, s.w * k, s.h * k);
    btn.addEventListener('click', () => { selectedTrade = id; buildMenu(); });
    btn.addEventListener('dblclick', startGame);
    wrap.appendChild(btn);
  }
}

function startGame() {
  initAudio();
  newGame(selectedTrade);
  state = 'play';
  showOverlay(null);
  lastHud = {};
  updateLoadout();
  startMusic();
  showBanner('ON THE TOOLS', TRADES[selectedTrade].name + ' reporting for work');
}

function togglePause() {
  if (state === 'play') {
    state = 'pause'; keys.clear(); joy.active = false;
    $('pauseLoadout').innerHTML = loadoutListHTML();
    showOverlay('pause'); stopMusic();
  } else if (state === 'pause') {
    state = 'play'; showOverlay(null); startMusic();
  }
}
function toggleMute() {
  muted = !muted;
  if (muted) stopMusic(); else if (state === 'play') startMusic();
  showBanner(muted ? 'SOUND OFF' : 'SOUND ON', '');
}

/* ---------- level up ---------- */
let currentChoices = [];
function rollChoices() {
  const p = G.player, opts = [];
  for (const id in WEAPONS) {
    const w = p.weapons.find(x => x.id === id);
    if (w) { if (w.level < WEAPONS[id].max) opts.push({ kind: 'weapon', id, lvl: w.level + 1, wt: 1.3 }); }
    else if (p.weapons.length < MAX_WEAPONS) opts.push({ kind: 'weapon', id, lvl: 1, wt: 1 });
  }
  const owned = Object.keys(p.passives).length;
  for (const id in PASSIVES) {
    const l = p.passives[id] || 0;
    if (l > 0) { if (l < PASSIVES[id].max) opts.push({ kind: 'passive', id, lvl: l + 1, wt: 1 }); }
    else if (owned < MAX_PASSIVES) opts.push({ kind: 'passive', id, lvl: 1, wt: 0.8 });
  }
  const out = [];
  while (out.length < 3 && opts.length) {
    let s = 0; for (const o of opts) s += o.wt;
    let r = Math.random() * s, i = 0;
    for (; i < opts.length - 1; i++) { r -= opts[i].wt; if (r <= 0) break; }
    out.push(opts.splice(i, 1)[0]);
  }
  if (out.length < 3) out.push({ kind: 'extra', id: 'pie' });
  if (out.length < 3) out.push({ kind: 'extra', id: 'rates' });
  return out;
}
function choiceInfo(c) {
  if (c.kind === 'weapon') { const d = WEAPONS[c.id]; return { name: d.name, emoji: d.emoji, desc: d.desc[c.lvl - 1], badge: c.lvl === 1 ? 'NEW' : 'LV ' + c.lvl }; }
  if (c.kind === 'passive') { const d = PASSIVES[c.id]; return { name: d.name, emoji: d.emoji, desc: d.desc, badge: c.lvl === 1 ? 'NEW' : 'LV ' + c.lvl }; }
  const d = EXTRAS[c.id]; return { name: d.name, emoji: d.emoji, desc: d.desc, badge: '' };
}
function openLevelUp() {
  state = 'levelup'; keys.clear(); joy.active = false;
  currentChoices = rollChoices();
  $('luLevel').textContent = G.player.level - G.pendingLevels + 1;
  const wrap = $('choices'); wrap.innerHTML = '';
  currentChoices.forEach((c, i) => {
    const info = choiceInfo(c);
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = `<span class="key">${i + 1}</span>${info.badge ? `<span class="badge ${info.badge === 'NEW' ? 'new' : ''}">${info.badge}</span>` : ''}
      <div class="cicon">${iconHTML(c.id, info.emoji)}</div><div class="cname">${info.name}</div><div class="cdesc">${info.desc}</div>`;
    b.addEventListener('click', () => chooseUpgrade(i));
    wrap.appendChild(b);
  });
  showOverlay('levelup');
  sfx('levelup');
}
function chooseUpgrade(i) {
  if (state !== 'levelup' || !currentChoices[i]) return;
  const c = currentChoices[i], p = G.player;
  if (c.kind === 'weapon') {
    const w = p.weapons.find(x => x.id === c.id);
    if (w) w.level++; else p.weapons.push({ id: c.id, level: 1, t: 0.2, angle: 0 });
  } else if (c.kind === 'passive') {
    const before = p.maxHp;
    p.passives[c.id] = (p.passives[c.id] || 0) + 1;
    recalc();
    if (p.maxHp > before) p.hp += p.maxHp - before;
  } else if (c.id === 'pie') {
    p.hp = Math.min(p.maxHp, p.hp + 50);
  } else if (c.id === 'rates') {
    G.bonusDmg += 0.05; recalc();
  }
  G.pendingLevels--;
  updateLoadout();
  if (G.pendingLevels > 0) openLevelUp();
  else { state = 'play'; showOverlay(null); }
}

/* ---------- end of shift ---------- */
function endGame(won) {
  state = 'end'; keys.clear(); joy.active = false; stopMusic();
  $('endTitle').textContent = won ? 'KNOCK-OFF!' : 'SENT HOME';
  $('endSub').textContent = won ? 'You survived the shift. Beers are on the client.' : pick([
    'Worksafe would like a word.', 'Should have worn the steel caps.', 'That one\'s going in the incident register.', 'Off to the site first-aid hut.',
  ]);
  $('endStats').innerHTML = `
    <div class="stat"><b>${fmtTime(G.t)}</b><span>on site</span></div>
    <div class="stat"><b>${G.player.level}</b><span>level</span></div>
    <div class="stat"><b>${G.kills}</b><span>sent packing</span></div>`;
  $('overtimeBtn').classList.toggle('hidden', !won);
  $('retryBtn').classList.toggle('primary', !won);
  showOverlay('end');
}

/* ---------- HUD ---------- */
let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; $(id).textContent = v; } }
function updateHud() {
  const p = G.player;
  setText('timer', fmtTime(G.t));
  setText('killCount', String(G.kills));
  setText('lvlText', 'LV ' + p.level);
  const pct = Math.min(100, (p.xp / xpToLevel(p.level)) * 100).toFixed(1) + '%';
  if (lastHud.xp !== pct) { lastHud.xp = pct; $('xpFill').style.width = pct; }
  const goal = G.overtime ? 'Overtime! Bosses every 90s' : 'Knock-off at ' + fmtTime(SHIFT_LENGTH);
  setText('goal', goal);
}
function updateLoadout() {
  const p = G.player;
  const wRow = p.weapons.map(w => `<div class="slot" title="${WEAPONS[w.id].name}">${iconHTML(w.id, WEAPONS[w.id].emoji)}<span class="lv">${w.level}</span></div>`).join('');
  const pRow = Object.keys(p.passives).map(id => `<div class="slot passive" title="${PASSIVES[id].name}">${iconHTML(id, PASSIVES[id].emoji)}<span class="lv">${p.passives[id]}</span></div>`).join('');
  $('loadout').innerHTML = `<div class="row">${wRow}</div><div class="row">${pRow}</div>`;
}
function loadoutListHTML() {
  const p = G.player;
  return p.weapons.map(w => `<div class="slot">${iconHTML(w.id, WEAPONS[w.id].emoji)} ${WEAPONS[w.id].name} · ${w.level}</div>`).join('') +
    Object.keys(p.passives).map(id => `<div class="slot passive">${iconHTML(id, PASSIVES[id].emoji)} ${PASSIVES[id].name} · ${p.passives[id]}</div>`).join('');
}

/* ---------- buttons ---------- */
$('startBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', togglePause);
$('quitBtn').addEventListener('click', () => { state = 'menu'; stopMusic(); showOverlay('menu'); });
$('retryBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', () => { state = 'menu'; showOverlay('menu'); buildMenu(); });
$('overtimeBtn').addEventListener('click', () => {
  G.overtime = true; G.nextOvertimeBoss = G.t + 60;
  state = 'play'; showOverlay(null); startMusic();
  showBanner('OVERTIME', 'Time and a half. Bosses every 90 seconds.');
});

/* ---------- boot ---------- */
// Small hook for testing/tools in the browser console: TradieSurvivors.game, .exportBuiltInArt()
window.TradieSurvivors = {
  get game() { return G; },
  get state() { return state; },
  exportBuiltInArt() {
    const out = {};
    for (const key in ART) out[key] = builtInSprite(key).img.toDataURL('image/png');
    return out;
  },
};

loadAssets().then(() => {
  $('loading').classList.add('hidden');
  state = 'menu';
  buildMenu();
  showOverlay('menu');
});
requestAnimationFrame(frame);

})();
