/**
 * Procedural GBA tileset painter.
 *
 * Terrain is authored in code rather than generated, which keeps it perfectly
 * tileable, palette-consistent and crisp at 1x - the three things AI art can't
 * guarantee. Every tile is 16x16 and drawn with a fixed 15-bit-safe palette.
 */

export const TILE = 16;

/** Deterministic value noise so every reload paints the identical tileset. */
function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Px = (x: number, y: number, color: string) => void;

export interface TileSetResult {
  canvas: HTMLCanvasElement;
  index: Record<string, number>;
  cols: number;
  count: number;
  /** Tile ids that block movement. */
  solid: Set<number>;
  /** Tile ids that trigger wild encounters. */
  encounter: Set<number>;
  /** Tile ids that are water (surf). */
  water: Set<number>;
  /** Ledge tiles: id -> hop direction. */
  ledge: Map<number, 'down' | 'left' | 'right'>;
  /** Animated tiles: id -> list of alternate tile ids (frame 0 is the id itself). */
  animated: Map<number, number[]>;
}

// GBA-safe palette (each channel a multiple of 8).
const C = {
  grassDark: '#288038', grassMid: '#38a048', grassLite: '#58c060', grassHi: '#78d878',
  grassShade: '#186828',
  tallDark: '#106018', tallMid: '#208028', tallLite: '#309838',
  dirtDark: '#906038', dirtMid: '#b88850', dirtLite: '#d0a870', dirtHi: '#e8c890',
  sandDark: '#c0a068', sandMid: '#d8c088', sandLite: '#f0e0b0',
  stoneDark: '#585868', stoneMid: '#787888', stoneLite: '#9898a8', stoneHi: '#b8b8c8',
  waterDeep: '#1848a0', waterMid: '#2868c8', waterLite: '#48a0e8', waterFoam: '#a8d8f8',
  treeDark: '#105818', treeMid: '#1c7828', treeLite: '#309838', treeHi: '#50b850',
  trunkDark: '#583018', trunkMid: '#784830',
  woodDark: '#785038', woodMid: '#a07048', woodLite: '#c09060',
  floorDark: '#a8794c', floorMid: '#c39a6b', floorLite: '#d9b489', floorHi: '#e8caa4',
  tileDark: '#7080a0', tileMid: '#98a8c0', tileLite: '#c0cde0',
  wallDark: '#404860', wallMid: '#606880', wallLite: '#8890a8',
  metalDark: '#303848', metalMid: '#485068', metalLite: '#687088', metalHi: '#98a0b8',
  rackDark: '#181c28', rackMid: '#282e40', rackLite: '#3a4258',
  ledOn: '#40f890', ledAmber: '#f8b040', ledBlue: '#48c8f8', ledRed: '#f85050',
  flowerA: '#f85878', flowerB: '#f8d040', flowerC: '#f8f8f8', flowerD: '#c080f8',
  fenceDark: '#605040', fenceMid: '#907858', fenceLite: '#b8a078',
  carpetDark: '#a03040', carpetMid: '#c85060', carpetLite: '#e07888',
  black: '#101018', white: '#f8f8f8',
  glassDark: '#204058', glassMid: '#3878a0', glassLite: '#68b8d8',
  snowDark: '#a8b8d0', snowMid: '#d0dcf0', snowLite: '#f0f8ff',
  neonA: '#00e8c8', neonB: '#f048c8',
};

interface TileDef {
  name: string;
  draw: (px: Px, seed: number) => void;
  solid?: boolean;
  encounter?: boolean;
  water?: boolean;
  ledge?: 'down' | 'left' | 'right';
  /** Extra frames drawn as separate tiles and linked as an animation. */
  frames?: ((px: Px, seed: number, frame: number) => void)[];
}

// --------------------------------------------------------------------------- //
// Painting helpers
// --------------------------------------------------------------------------- //
function fill(px: Px, color: string): void {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, color);
}

function rect(px: Px, x0: number, y0: number, w: number, h: number, color: string): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, color);
}

function hline(px: Px, x0: number, x1: number, y: number, color: string): void {
  for (let x = x0; x <= x1; x++) px(x, y, color);
}

function vline(px: Px, x: number, y0: number, y1: number, color: string): void {
  for (let y = y0; y <= y1; y++) px(x, y, color);
}


/** Ordered 4x4 Bayer dither between two colours. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
function dither(px: Px, a: string, b: string, ratio: number): void {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const t = (BAYER4[y & 3]![x & 3]! + 0.5) / 16;
      px(x, y, t < ratio ? b : a);
    }
  }
}

// --------------------------------------------------------------------------- //
// Tile definitions
// --------------------------------------------------------------------------- //
function grassBase(px: Px, seed: number): void {
  fill(px, C.grassMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(x, y, seed);
      if (n > 0.90) px(x, y, C.grassLite);
      else if (n < 0.10) px(x, y, C.grassDark);
    }
  }
  // Sparse blade tufts give the surface a woven texture at 1x.
  for (let i = 0; i < 7; i++) {
    const bx = Math.floor(hash2(i, 3, seed) * TILE);
    const by = Math.floor(hash2(i, 9, seed) * TILE);
    px(bx, by, C.grassHi);
    px(bx, (by + 1) % TILE, C.grassLite);
  }
}

function tallGrass(px: Px, seed: number, frame = 0): void {
  grassBase(px, seed);
  const sway = frame === 1 ? 1 : 0;
  for (let i = 0; i < 9; i++) {
    const bx = Math.floor(hash2(i, 21, seed) * (TILE - 2)) + 1;
    const h = 5 + Math.floor(hash2(i, 33, seed) * 5);
    const base = TILE - 1 - Math.floor(hash2(i, 41, seed) * 3);
    for (let k = 0; k < h; k++) {
      const y = base - k;
      if (y < 0) continue;
      const lean = Math.round((k / h) * (i % 2 === 0 ? 1 : -1) * 1.6) + (k > h - 3 ? sway : 0);
      const x = Math.max(0, Math.min(TILE - 1, bx + lean));
      px(x, y, k > h - 3 ? C.tallLite : k > h / 2 ? C.tallMid : C.tallDark);
    }
  }
}

function dirtPath(px: Px, seed: number): void {
  fill(px, C.dirtMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(x, y, seed + 7);
      if (n > 0.88) px(x, y, C.dirtLite);
      else if (n < 0.12) px(x, y, C.dirtDark);
    }
  }
  for (let i = 0; i < 4; i++) {
    const gx = Math.floor(hash2(i, 5, seed) * TILE);
    const gy = Math.floor(hash2(i, 15, seed) * TILE);
    px(gx, gy, C.dirtHi);
  }
}

function pavement(px: Px, seed: number): void {
  fill(px, C.tileMid);
  // 8x8 slabs with a bevel.
  for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
    hline(px, ox, ox + 7, oy, C.tileLite);
    vline(px, ox, oy, oy + 7, C.tileLite);
    hline(px, ox, ox + 7, oy + 7, C.tileDark);
    vline(px, ox + 7, oy, oy + 7, C.tileDark);
  }
  for (let i = 0; i < 5; i++) {
    px(Math.floor(hash2(i, 2, seed) * TILE), Math.floor(hash2(i, 8, seed) * TILE), C.tileLite);
  }
}

function water(px: Px, seed: number, frame = 0): void {
  dither(px, C.waterMid, C.waterDeep, 0.4);
  const shift = frame * 4;
  for (let i = 0; i < 5; i++) {
    const wy = (Math.floor(hash2(i, 11, seed) * TILE) + frame) % TILE;
    const wx = (Math.floor(hash2(i, 19, seed) * TILE) + shift) % TILE;
    px(wx, wy, C.waterLite);
    px((wx + 1) % TILE, wy, C.waterLite);
    px((wx + 2) % TILE, wy, C.waterMid);
    if (i < 2) px((wx + 1) % TILE, (wy + 1) % TILE, C.waterFoam);
  }
}

function tree(px: Px, seed: number): void {
  grassBase(px, seed);
  // Round canopy filling most of the tile with a stubby trunk.
  const cx = 7.5;
  const cy = 6.5;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot((x - cx) / 7.6, (y - cy) / 6.6);
      if (d > 1) continue;
      const n = hash2(x, y, seed + 3);
      let col = C.treeMid;
      if (d > 0.85) col = C.treeDark;
      else if (y - x * 0.35 < 3.5) col = n > 0.5 ? C.treeHi : C.treeLite;
      else if (n > 0.82) col = C.treeLite;
      else if (n < 0.15) col = C.treeDark;
      px(x, y, col);
    }
  }
  rect(px, 6, 12, 4, 4, C.trunkMid);
  vline(px, 6, 12, 15, C.trunkDark);
  vline(px, 9, 12, 15, C.trunkDark);
  hline(px, 5, 10, 15, C.trunkDark);
}

function flowerTile(px: Px, seed: number, color: string, frame = 0): void {
  grassBase(px, seed);
  for (let i = 0; i < 4; i++) {
    const fx = 2 + Math.floor(hash2(i, 31, seed) * 11);
    const fy = 2 + Math.floor(hash2(i, 37, seed) * 11);
    const open = frame === 0 || i % 2 === 0;
    px(fx, fy, color);
    if (open) {
      px(fx - 1, fy, color);
      px(fx + 1, fy, color);
      px(fx, fy - 1, color);
      px(fx, fy + 1, color);
      px(fx, fy, C.flowerC);
    }
  }
}

function fence(px: Px, seed: number): void {
  grassBase(px, seed);
  rect(px, 0, 5, TILE, 2, C.fenceMid);
  hline(px, 0, TILE - 1, 5, C.fenceLite);
  hline(px, 0, TILE - 1, 7, C.fenceDark);
  rect(px, 0, 10, TILE, 2, C.fenceMid);
  hline(px, 0, TILE - 1, 10, C.fenceLite);
  hline(px, 0, TILE - 1, 12, C.fenceDark);
  rect(px, 6, 2, 3, 13, C.fenceMid);
  vline(px, 6, 2, 14, C.fenceLite);
  vline(px, 8, 2, 14, C.fenceDark);
  hline(px, 6, 8, 2, C.fenceLite);
}

function ledgeDown(px: Px, seed: number): void {
  grassBase(px, seed);
  rect(px, 0, 6, TILE, 10, C.dirtMid);
  hline(px, 0, TILE - 1, 5, C.grassShade);
  hline(px, 0, TILE - 1, 6, C.dirtHi);
  hline(px, 0, TILE - 1, 7, C.dirtLite);
  for (let x = 0; x < TILE; x++) {
    const n = hash2(x, 0, seed + 13);
    const h = 9 + Math.floor(n * 3);
    for (let y = 8; y < TILE; y++) px(x, y, y > h + 2 ? C.dirtDark : C.dirtMid);
  }
  hline(px, 0, TILE - 1, TILE - 1, C.dirtDark);
}

function rock(px: Px, seed: number): void {
  grassBase(px, seed);
  for (let y = 3; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      const d = Math.hypot((x - 7.5) / 6, (y - 9) / 5.5);
      if (d > 1) continue;
      const n = hash2(x, y, seed + 21);
      px(x, y, d > 0.82 ? C.stoneDark : n > 0.75 ? C.stoneHi : n < 0.25 ? C.stoneDark : C.stoneMid);
    }
  }
  hline(px, 5, 9, 4, C.stoneLite);
  hline(px, 4, 11, 13, C.stoneDark);
}

function sign(px: Px, seed: number): void {
  grassBase(px, seed);
  rect(px, 2, 3, 12, 8, C.woodMid);
  hline(px, 2, 13, 3, C.woodLite);
  vline(px, 2, 3, 10, C.woodLite);
  hline(px, 2, 13, 10, C.woodDark);
  vline(px, 13, 3, 10, C.woodDark);
  hline(px, 4, 11, 5, C.woodDark);
  hline(px, 4, 9, 7, C.woodDark);
  rect(px, 7, 11, 2, 5, C.woodDark);
}

function indoorFloor(px: Px, seed: number): void {
  fill(px, C.floorMid);
  // Long continuous planks: a soft seam every 4 rows and no vertical break, so
  // the floor never reads as brickwork.
  for (let y = 0; y < TILE; y += 8) {
    hline(px, 0, TILE - 1, y, C.floorDark);
    hline(px, 0, TILE - 1, y + 1, C.floorLite);
  }
  // Fine grain: sparse dashes inside each plank.
  for (let y = 2; y < TILE; y++) {
    if (y % 8 <= 1) continue;
    for (let x = 0; x < TILE; x++) {
      const h = hash2(x, y, seed + 5);
      if (h > 0.965) px(x, y, C.floorLite);
      else if (h < 0.035) px(x, y, C.floorDark);
    }
  }
}

// --------------------------------------------------------------------------- //
// Interior furniture. Everything is painted over the floor so props drop into
// any room without needing a second layer.
// --------------------------------------------------------------------------- //
/**
 * A 2x2 bed. `hx` is 0 for the left half and 1 for the right so the frame,
 * pillow and blanket run continuously across both tiles.
 */
function bedTile(px: Px, hx: 0 | 1, row: 0 | 1): void {
  indoorFloor(px, 3);
  const L = hx === 0 ? 1 : 0;            // outer frame edge on the left tile
  const R = hx === 1 ? TILE - 2 : TILE - 1;
  const w = R - L + 1;
  rect(px, L, 0, w, TILE, C.metalLite);
  if (row === 0) {
    rect(px, L, 0, w, 2, C.metalMid);            // headboard
    hline(px, L, R, 0, C.metalHi);
    rect(px, L, 2, w, 6, C.white);               // pillow
    hline(px, L, R, 2, '#ffffff');
    hline(px, L, R, 7, '#c8d4ec');
    rect(px, L, 8, w, 8, C.glassMid);            // blanket
    hline(px, L, R, 8, C.glassLite);
    hline(px, L, R, 9, '#4a90bc');
  } else {
    rect(px, L, 0, w, 14, C.glassMid);
    hline(px, L, R, 13, C.glassDark);
    rect(px, L, 14, w, 2, C.metalMid);           // footboard
    hline(px, L, R, 15, C.metalDark);
  }
  // Soft diagonal fold across the blanket so it doesn't read as a flat slab.
  if (row === 1) {
    for (let i = 0; i < 6; i++) {
      const x = hx === 0 ? L + 3 + i : L + 1 + i;
      px(x, 3 + i, C.glassLite);
      px(x, 9 - i, '#2f6c92');
    }
  }
  if (hx === 0) vline(px, L, 0, TILE - 1, C.metalHi);
  else vline(px, R, 0, TILE - 1, C.metalDark);
}

const bedTopL = (px: Px, _s: number) => bedTile(px, 0, 0);
const bedTopR = (px: Px, _s: number) => bedTile(px, 1, 0);
const bedBotL = (px: Px, _s: number) => bedTile(px, 0, 1);
const bedBotR = (px: Px, _s: number) => bedTile(px, 1, 1);

function desk(px: Px, _seed: number): void {
  indoorFloor(px, 7);
  rect(px, 0, 2, 16, 12, C.woodLite);
  hline(px, 0, 15, 2, C.woodDark);
  hline(px, 0, 15, 3, '#e0c8a0');
  rect(px, 1, 6, 6, 7, C.woodMid);
  hline(px, 2, 5, 8, C.woodDark);
  hline(px, 2, 5, 11, C.woodDark);
  rect(px, 9, 6, 6, 7, C.woodMid);
  hline(px, 10, 13, 8, C.woodDark);
  hline(px, 10, 13, 11, C.woodDark);
  hline(px, 0, 15, 13, C.woodDark);
}

function pcTerminal(px: Px, _seed: number, frame = 0): void {
  desk(px, 7);
  rect(px, 3, 0, 10, 10, C.metalDark);
  rect(px, 4, 1, 8, 7, frame === 0 ? C.glassMid : '#3f83ad');
  for (let y = 1; y < 8; y += 2) hline(px, 4, 11, y, C.ledBlue);
  px(5, 2 + (frame % 2), C.white);
  px(9, 5 - (frame % 2), C.ledOn);
  rect(px, 6, 10, 4, 2, C.metalLite);
}

function bookShelf(px: Px, seed: number): void {
  fill(px, C.woodDark);
  rect(px, 1, 0, 14, 16, C.woodMid);
  for (const y of [4, 9, 14]) hline(px, 1, 14, y, C.woodDark);
  const cols = [C.ledRed, C.ledOn, C.ledAmber, C.ledBlue, C.flowerD];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 5; i++) {
      if (hash2(i, s, seed) > 0.78) continue;
      rect(px, 2 + i * 3, s * 5 + 1, 2, 3, cols[(i + s) % 5]!);
    }
  }
  vline(px, 1, 0, 15, C.woodLite);
}

function tvSet(px: Px, _seed: number, frame = 0): void {
  indoorFloor(px, 9);
  rect(px, 5, 13, 6, 2, C.metalDark);        // stand
  hline(px, 4, 11, 15, C.metalDark);
  rect(px, 0, 1, 16, 13, C.metalDark);       // bezel
  hline(px, 0, 15, 1, C.metalLite);
  rect(px, 2, 3, 12, 9, C.black);
  const cols = [C.ledBlue, C.white, C.glassMid];
  for (let y = 3; y < 12; y++) {
    for (let x = 2; x < 14; x++) {
      if ((x * 5 + y * 3 + frame * 7) % 11 < 3) px(x, y, cols[(x + y + frame) % 3]!);
    }
  }
  hline(px, 2, 13, 3, C.glassLite);
  px(14, 12, C.ledOn);
}

function lowTable(px: Px, _seed: number): void {
  indoorFloor(px, 11);
  rect(px, 1, 3, 14, 9, C.woodLite);
  hline(px, 1, 14, 3, C.woodDark);
  hline(px, 1, 14, 11, C.woodDark);
  rect(px, 3, 12, 2, 3, C.woodDark);
  rect(px, 11, 12, 2, 3, C.woodDark);
}

function pottedPlant(px: Px, seed: number): void {
  indoorFloor(px, 13);
  rect(px, 5, 10, 6, 5, C.dirtDark);
  hline(px, 5, 10, 10, C.dirtLite);
  hline(px, 5, 10, 15, '#603820');
  for (let i = 0; i < 30; i++) {
    const a = hash2(i, 1, seed) * Math.PI * 2;
    const r = 2 + hash2(i, 2, seed) * 5.5;
    const x = Math.round(8 + Math.cos(a) * r);
    const y = Math.round(6 + Math.sin(a) * r * 0.8);
    if (x < 1 || x > 14 || y < 0 || y > 9) continue;
    px(x, y, hash2(i, 3, seed) > 0.5 ? C.treeLite : C.treeMid);
    px(x, y + 1, C.treeDark);
  }
  vline(px, 8, 7, 10, C.treeDark);
}

function coolUnit(px: Px, _seed: number): void {
  fill(px, C.wallMid);
  rect(px, 1, 0, 14, 16, C.tileLite);
  vline(px, 1, 0, 15, C.white);
  vline(px, 14, 0, 15, C.tileDark);
  hline(px, 1, 14, 7, C.tileDark);
  rect(px, 11, 3, 2, 3, C.metalDark);
  rect(px, 11, 10, 2, 3, C.metalDark);
  rect(px, 3, 10, 5, 3, C.ledBlue);
  hline(px, 3, 7, 10, C.white);
}

function rugTile(px: Px, seed: number): void {
  indoorFloor(px, seed);
  // A woven mat: muted border, soft weave inside, no hard checkerboard.
  fill(px, C.carpetMid);
  rect(px, 1, 1, 14, 14, C.carpetLite);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      if ((x + y) % 4 === 0) px(x, y, C.carpetMid);
    }
  }
  hline(px, 0, TILE - 1, 0, C.carpetDark);
  vline(px, 0, 0, TILE - 1, C.carpetDark);
  hline(px, 0, TILE - 1, TILE - 1, C.carpetDark);
  vline(px, TILE - 1, 0, TILE - 1, C.carpetDark);
}

function indoorWindow(px: Px, seed: number): void {
  indoorWall(px, seed);
  rect(px, 2, 3, 12, 10, C.metalDark);
  rect(px, 3, 4, 10, 8, '#a8d8f8');
  for (let y = 8; y < 12; y++) hline(px, 3, 12, y, C.glassLite);
  hline(px, 3, 12, 7, C.metalDark);
  vline(px, 8, 4, 11, C.metalDark);
  px(4, 5, C.white);
  px(5, 5, C.white);
}

function indoorWall(px: Px, seed: number): void {
  fill(px, C.wallMid);
  // Soft vertical wallpaper pinstripes plus a shadow line where the wall meets
  // whatever is below it. Low contrast so the room reads calm.
  for (let x = 2; x < TILE; x += 6) {
    vline(px, x, 0, TILE - 1, C.wallLite);
    vline(px, x + 1, 0, TILE - 1, '#6a7290');
  }
  for (let y = 3; y < TILE; y += 6) hline(px, 0, TILE - 1, y, '#565e76');
  hline(px, 0, TILE - 1, TILE - 1, C.wallDark);
  for (let i = 0; i < 2; i++) {
    px(Math.floor(hash2(i, 4, seed) * TILE), Math.floor(hash2(i, 6, seed) * TILE), C.wallLite);
  }
}

function labFloor(px: Px, _seed: number): void {
  fill(px, C.tileLite);
  hline(px, 0, TILE - 1, 0, C.tileMid);
  vline(px, 0, 0, TILE - 1, C.tileMid);
  hline(px, 0, TILE - 1, 15, C.tileDark);
  vline(px, 15, 0, 15, C.tileDark);
  px(1, 1, C.white);
  px(14, 14, C.tileMid);
}

function metalFloor(px: Px, seed: number): void {
  fill(px, C.metalMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if ((x + y) % 8 === 0) px(x, y, C.metalLite);
      if (hash2(x, y, seed + 17) > 0.94) px(x, y, C.metalHi);
    }
  }
  hline(px, 0, TILE - 1, 0, C.metalDark);
  vline(px, 0, 0, TILE - 1, C.metalDark);
  rect(px, 4, 4, 2, 2, C.metalDark);
  rect(px, 10, 10, 2, 2, C.metalDark);
}

function cableFloor(px: Px, seed: number, frame = 0): void {
  metalFloor(px, seed);
  const glow = frame === 0 ? C.ledBlue : C.neonA;
  hline(px, 0, TILE - 1, 7, C.metalDark);
  hline(px, 0, TILE - 1, 8, glow);
  for (let x = (frame * 3) % 4; x < TILE; x += 4) px(x, 8, C.white);
}

function serverRack(px: Px, seed: number, frame = 0): void {
  fill(px, C.rackMid);
  hline(px, 0, TILE - 1, 0, C.rackLite);
  vline(px, 0, 0, TILE - 1, C.rackLite);
  hline(px, 0, TILE - 1, 15, C.black);
  vline(px, 15, 0, 15, C.black);
  for (let row = 0; row < 5; row++) {
    const y = 2 + row * 3;
    rect(px, 2, y, 12, 2, C.rackDark);
    hline(px, 2, 13, y, C.rackLite);
    const lit = hash2(row, frame, seed) > 0.35;
    const col = row % 3 === 0 ? C.ledOn : row % 3 === 1 ? C.ledAmber : C.ledBlue;
    if (lit) {
      px(3, y + 1, col);
      px(5, y + 1, hash2(row, frame + 9, seed) > 0.5 ? col : C.rackDark);
    }
    px(12, y + 1, hash2(row, frame + 3, seed) > 0.6 ? C.ledRed : C.rackDark);
  }
}

function glassWall(px: Px, seed: number): void {
  fill(px, C.glassMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (x - y > 2 && x - y < 5) px(x, y, C.glassLite);
      if (hash2(x, y, seed + 29) > 0.96) px(x, y, C.white);
    }
  }
  hline(px, 0, TILE - 1, 0, C.glassDark);
  vline(px, 0, 0, TILE - 1, C.glassDark);
  hline(px, 0, TILE - 1, 15, C.glassDark);
  vline(px, 15, 0, 15, C.glassDark);
}

function carpet(px: Px, seed: number): void {
  fill(px, C.carpetMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (hash2(x, y, seed + 11) > 0.88) px(x, y, C.carpetLite);
      else if (hash2(x, y, seed + 12) < 0.1) px(x, y, C.carpetDark);
    }
  }
}

function counter(px: Px, _seed: number): void {
  fill(px, C.woodMid);
  hline(px, 0, TILE - 1, 0, C.woodLite);
  hline(px, 0, TILE - 1, 1, C.woodLite);
  rect(px, 0, 2, TILE, 12, C.woodMid);
  hline(px, 0, TILE - 1, 14, C.woodDark);
  hline(px, 0, TILE - 1, 15, C.woodDark);
  for (let x = 2; x < TILE; x += 5) vline(px, x, 3, 13, C.woodDark);
}

function stairs(px: Px, _seed: number): void {
  fill(px, C.stoneMid);
  for (let i = 0; i < 4; i++) {
    const y = i * 4;
    hline(px, 0, TILE - 1, y, C.stoneHi);
    hline(px, 0, TILE - 1, y + 1, C.stoneLite);
    hline(px, 0, TILE - 1, y + 3, C.stoneDark);
  }
}

function sand(px: Px, seed: number): void {
  fill(px, C.sandMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(x, y, seed + 23);
      if (n > 0.9) px(x, y, C.sandLite);
      else if (n < 0.1) px(x, y, C.sandDark);
    }
  }
  for (let i = 0; i < 3; i++) {
    const y = Math.floor(hash2(i, 44, seed) * TILE);
    hline(px, 0, TILE - 1, y, C.sandDark);
    hline(px, 0, TILE - 1, (y + 1) % TILE, C.sandLite);
  }
}

function snow(px: Px, seed: number): void {
  fill(px, C.snowMid);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash2(x, y, seed + 51);
      if (n > 0.88) px(x, y, C.snowLite);
      else if (n < 0.08) px(x, y, C.snowDark);
    }
  }
}

/** Exposed conduit plating: sparking floor where rogue units spawn. */
function staticField(px: Px, seed: number, frame = 0): void {
  metalFloor(px, seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const h = hash2(x, y, seed + frame * 31);
      if (h > 0.90) px(x, y, frame % 2 === 0 ? C.ledBlue : C.neonA);
      else if (h > 0.86) px(x, y, C.metalDark);
    }
  }
  // Arcing filament across the plate.
  for (let x = 1; x < TILE - 1; x++) {
    const y = 8 + Math.round(Math.sin((x + frame * 2) * 0.9) * 2);
    px(x, y, C.white);
    px(x, y + 1, frame % 2 === 0 ? C.neonA : C.ledBlue);
  }
}

function neonPanel(px: Px, seed: number, frame = 0): void {
  fill(px, C.rackDark);
  hline(px, 0, TILE - 1, 0, C.metalDark);
  vline(px, 0, 0, TILE - 1, C.metalDark);
  const cols = [C.neonA, C.ledBlue, C.neonB, C.ledOn];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const on = hash2(row * 4 + col, frame, seed) > 0.45;
      if (!on) continue;
      rect(px, 2 + col * 3, 2 + row * 3, 2, 2, cols[(row + col + frame) % 4]!);
    }
  }
}

function waterEdgeTop(px: Px, seed: number, frame = 0): void {
  water(px, seed, frame);
  hline(px, 0, TILE - 1, 0, C.grassDark);
  hline(px, 0, TILE - 1, 1, C.grassShade);
  for (let x = 0; x < TILE; x++) {
    if (hash2(x, frame, seed) > 0.6) px(x, 2, C.waterFoam);
  }
}

function puddleGrass(px: Px, seed: number): void {
  grassBase(px, seed);
  for (let y = 5; y < 12; y++) {
    for (let x = 3; x < 13; x++) {
      const d = Math.hypot((x - 8) / 5, (y - 8.5) / 3.5);
      if (d < 1) px(x, y, d > 0.8 ? C.waterMid : C.waterLite);
    }
  }
}

const TILES: TileDef[] = [
  { name: 'void', draw: (px) => fill(px, C.black), solid: true },
  { name: 'grass', draw: grassBase },
  { name: 'grass2', draw: (px, s) => grassBase(px, s + 101) },
  { name: 'grass3', draw: (px, s) => grassBase(px, s + 202) },
  {
    name: 'tallgrass',
    draw: (px, s) => tallGrass(px, s, 0),
    encounter: true,
    frames: [(px, s) => tallGrass(px, s, 1)],
  },
  { name: 'path', draw: dirtPath },
  { name: 'path2', draw: (px, s) => dirtPath(px, s + 55) },
  { name: 'pavement', draw: pavement },
  { name: 'sand', draw: sand, encounter: true },
  { name: 'snow', draw: snow },
  {
    name: 'water',
    draw: (px, s) => water(px, s, 0),
    solid: true,
    water: true,
    frames: [(px, s) => water(px, s, 1), (px, s) => water(px, s, 2), (px, s) => water(px, s, 3)],
  },
  {
    name: 'wateredge',
    draw: (px, s) => waterEdgeTop(px, s, 0),
    solid: true,
    water: true,
    frames: [
      (px, s) => waterEdgeTop(px, s, 1),
      (px, s) => waterEdgeTop(px, s, 2),
      (px, s) => waterEdgeTop(px, s, 3),
    ],
  },
  { name: 'puddle', draw: puddleGrass },
  { name: 'tree', draw: tree, solid: true },
  { name: 'rock', draw: rock, solid: true },
  { name: 'sign', draw: sign, solid: true },
  { name: 'fence', draw: fence, solid: true },
  { name: 'ledge', draw: ledgeDown, ledge: 'down' },
  {
    name: 'flowerA',
    draw: (px, s) => flowerTile(px, s, C.flowerA, 0),
    frames: [(px, s) => flowerTile(px, s, C.flowerA, 1)],
  },
  {
    name: 'flowerB',
    draw: (px, s) => flowerTile(px, s, C.flowerB, 0),
    frames: [(px, s) => flowerTile(px, s, C.flowerB, 1)],
  },
  {
    name: 'flowerC',
    draw: (px, s) => flowerTile(px, s, C.flowerD, 0),
    frames: [(px, s) => flowerTile(px, s, C.flowerD, 1)],
  },
  { name: 'floor', draw: indoorFloor },
  { name: 'wall', draw: indoorWall, solid: true },
  { name: 'window', draw: indoorWindow, solid: true },
  { name: 'bedtopl', draw: bedTopL, solid: true },
  { name: 'bedtopr', draw: bedTopR, solid: true },
  { name: 'bedbotl', draw: bedBotL, solid: true },
  { name: 'bedbotr', draw: bedBotR, solid: true },
  { name: 'desk', draw: desk, solid: true },
  {
    name: 'terminal',
    draw: (px, s) => pcTerminal(px, s, 0),
    frames: [(px, s) => pcTerminal(px, s, 1)],
    solid: true,
  },
  { name: 'shelf', draw: bookShelf, solid: true },
  {
    name: 'tv',
    draw: (px, s) => tvSet(px, s, 0),
    frames: [(px, s) => tvSet(px, s, 1), (px, s) => tvSet(px, s, 2)],
    solid: true,
  },
  { name: 'table', draw: lowTable, solid: true },
  { name: 'plant', draw: pottedPlant, solid: true },
  { name: 'fridge', draw: coolUnit, solid: true },
  { name: 'rug', draw: rugTile },
  { name: 'labfloor', draw: labFloor },
  { name: 'carpet', draw: carpet },
  { name: 'counter', draw: counter, solid: true },
  { name: 'stairs', draw: stairs },
  { name: 'metal', draw: metalFloor },
  {
    name: 'cable',
    draw: (px, s) => cableFloor(px, s, 0),
    frames: [(px, s) => cableFloor(px, s, 1)],
  },
  {
    name: 'rack',
    draw: (px, s) => serverRack(px, s, 0),
    solid: true,
    frames: [
      (px, s) => serverRack(px, s, 1),
      (px, s) => serverRack(px, s, 2),
      (px, s) => serverRack(px, s, 3),
    ],
  },
  {
    name: 'staticfield',
    draw: (px, s) => staticField(px, s, 0),
    encounter: true,
    frames: [
      (px, s) => staticField(px, s, 1),
      (px, s) => staticField(px, s, 2),
    ],
  },
  { name: 'glass', draw: glassWall, solid: true },
  {
    name: 'neon',
    draw: (px, s) => neonPanel(px, s, 0),
    solid: true,
    frames: [
      (px, s) => neonPanel(px, s, 1),
      (px, s) => neonPanel(px, s, 2),
      (px, s) => neonPanel(px, s, 3),
    ],
  },
];

let cached: TileSetResult | null = null;

export function buildTileset(seed = 1337): TileSetResult {
  if (cached) return cached;

  // Expand definitions into a flat list of drawable cells (base + extra frames).
  const cells: { name: string; def: TileDef; frame: number }[] = [];
  for (const def of TILES) {
    cells.push({ name: def.name, def, frame: 0 });
    def.frames?.forEach((_, i) => cells.push({ name: `${def.name}#${i + 1}`, def, frame: i + 1 }));
  }

  const cols = 16;
  const rows = Math.ceil(cells.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;

  const index: Record<string, number> = {};
  const solid = new Set<number>();
  const encounter = new Set<number>();
  const waterSet = new Set<number>();
  const ledge = new Map<number, 'down' | 'left' | 'right'>();
  const animated = new Map<number, number[]>();

  cells.forEach((cell, id) => {
    const ox = (id % cols) * TILE;
    const oy = Math.floor(id / cols) * TILE;
    const px: Px = (x, y, color) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      g.fillStyle = color;
      g.fillRect(ox + x, oy + y, 1, 1);
    };
    if (cell.frame === 0) cell.def.draw(px, seed);
    else cell.def.frames![cell.frame - 1]!(px, seed, cell.frame);

    index[cell.name] = id;
    if (cell.def.solid) solid.add(id);
    if (cell.def.encounter) encounter.add(id);
    if (cell.def.water) waterSet.add(id);
    if (cell.def.ledge) ledge.set(id, cell.def.ledge);
  });

  // Link animation chains now every cell has an id.
  for (const def of TILES) {
    if (!def.frames?.length) continue;
    const base = index[def.name]!;
    const chain = [base, ...def.frames.map((_, i) => index[`${def.name}#${i + 1}`]!)];
    animated.set(base, chain);
  }

  cached = { canvas, index, cols, count: cells.length, solid, encounter, water: waterSet, ledge, animated };
  return cached;
}

/** Extra ledge variants that reuse the down-ledge art rotated in code. */
export function tileName(index: Record<string, number>, id: number): string {
  for (const [k, v] of Object.entries(index)) if (v === id) return k;
  return 'void';
}
