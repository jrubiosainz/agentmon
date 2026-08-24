/**
 * The region map ("TOWN MAP" in every mainline game): a hand-authored, stylised
 * chart of the whole region, reachable from the pause menu.
 *
 * The layout is deliberately NOT derived from `maps.ts`. Real town maps are
 * drawn, not generated - the tile grids are the wrong shape and the wrong scale
 * to project, and an auto-layout always looks like a debug view. What IS derived
 * is the *state*: which nodes you have visited, and where you are standing right
 * now, both read from the save.
 */

import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { drawWindow, TEXTBOX_H, TEXTBOX_Y } from '../../engine/ui.ts';
import { t, tUpper } from '../i18n.ts';
import { flag, setFlag, type SaveData } from '../state.ts';

type NodeKind = 'town' | 'city' | 'route' | 'landmark' | 'summit';

interface RegionNode {
  id: string;
  /** Place names are never translated, per the i18n rules. */
  name: string;
  /** One line of flavour, shown in the footer. This one IS translated. */
  desc: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** Overworld map ids that count as "you are here". */
  maps: string[];
  /** Save flag that reveals the node before you first set foot in it. */
  reveal?: string;
}

/**
 * The chain runs south-west to north-east. Coordinates are screen pixels inside
 * the chart band (y 24..110), chosen by eye so the route legs read as a
 * continuous coast road rather than a flowchart.
 */
const NODES: RegionNode[] = [
  {
    id: 'nullbyte', name: 'NULLBYTE TOWN', kind: 'town', x: 28, y: 96,
    desc: 'A quiet village where every story starts.',
    maps: ['nullbyte_town', 'home_bedroom', 'home_ground', 'rival_house', 'lab_ada'],
  },
  {
    id: 'route1', name: 'ROUTE 1', kind: 'route', x: 28, y: 76,
    desc: 'Scrap meadows. The first wild chassis roam here.',
    maps: ['route1'],
  },
  {
    id: 'voltspire', name: 'VOLTSPIRE CITY', kind: 'city', x: 28, y: 54,
    desc: 'Turbine towers and the region\'s first datacenter gym.',
    maps: ['voltspire_city', 'repairbay_volt', 'mart_volt', 'volt_house1', 'volt_house2', 'gym_volt'],
  },
  {
    id: 'route2', name: 'ROUTE 2', kind: 'route', x: 58, y: 54,
    desc: 'A cable causeway strung between two coasts.',
    maps: ['route2'],
  },
  {
    id: 'cachewood', name: 'CACHEWOOD', kind: 'landmark', x: 86, y: 66,
    desc: 'Server groves under a canopy of cooling fins.',
    maps: ['cachewood'],
  },
  {
    id: 'silica', name: 'SILICA TOWN', kind: 'town', x: 116, y: 80,
    desc: 'Wafer kilns and a gym cooled to freezing.',
    maps: ['silica_town', 'repairbay_silica', 'mart_silica', 'silica_house', 'gym_data'],
  },
  {
    id: 'route3', name: 'ROUTE 3', kind: 'route', x: 148, y: 66,
    desc: 'A switchback climb up the exhaust ridge.',
    maps: ['route3'],
  },
  {
    id: 'terraflux', name: 'TERRAFLUX CITY', kind: 'city', x: 148, y: 42,
    desc: 'Built on the vents. The thermal gym runs hot.',
    maps: ['terraflux_city', 'repairbay_terra', 'mart_terra', 'terra_house', 'gym_thermal'],
  },
  {
    id: 'citadel', name: 'THE CITADEL', kind: 'summit', x: 202, y: 42,
    desc: 'Where the region\'s finest engineers are ranked.',
    maps: ['citadel'],
    reveal: 'badge:thermal',
  },
];

/** Route legs, drawn as the road between two nodes. */
const LEGS: Array<[string, string]> = [
  ['nullbyte', 'route1'], ['route1', 'voltspire'], ['voltspire', 'route2'],
  ['route2', 'cachewood'], ['cachewood', 'silica'], ['silica', 'route3'],
  ['route3', 'terraflux'], ['terraflux', 'citadel'],
];

// --------------------------------------------------------------------------- //
// Coastline
// --------------------------------------------------------------------------- //
// The landmass is a boolean mask on a 4 px grid rather than a pile of
// rectangles. Overlapping rectangles leak their own highlight strips into the
// middle of the continent; a mask has exactly one edge, so the shore can be
// derived from it and the interior stays flat.

const CELL = 4;
const CHART_Y = 24;
const COLS = SCREEN_W / CELL;
const ROWS = 22;

/**
 * The lobes of the landmass. Deliberately sparse: the thin isthmuses between
 * them come from the road corridors, which is what gives the region a waist
 * instead of a single slab.
 */
const SHAPE: Array<[number, number, number, number]> = [
  [3, 9, 11, 20], [4, 5, 11, 11],
  [18, 8, 26, 15], [24, 11, 33, 18],
  [34, 2, 45, 9], [43, 2, 55, 8],
  [46, 12, 51, 15], [48, 14, 52, 17],
];

let MASK: Uint8Array | null = null;

function stamp(m: Uint8Array, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue;
      m[y * COLS + x] = 1;
    }
  }
}

/**
 * A road runs horizontally out of `a` and then turns once to reach `b`. Both
 * the drawn road and the land corridor beneath it follow this exact polyline,
 * or a bend could end up running through the sea.
 */
function legPath(a: RegionNode, b: RegionNode): Array<[number, number]> {
  if (a.x === b.x || a.y === b.y) return [[a.x, a.y], [b.x, b.y]];
  return [[a.x, a.y], [b.x, a.y], [b.x, b.y]];
}

/** Every node and every road must stand on land, so the mask is grown from them. */
function landMask(): Uint8Array {
  if (MASK) return MASK;
  const m = new Uint8Array(COLS * ROWS);
  for (const [x0, y0, x1, y1] of SHAPE) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) m[y * COLS + x] = 1;
    }
  }
  const cell = (x: number, y: number) => [Math.round(x / CELL), Math.round((y - CHART_Y) / CELL)] as const;
  for (const n of NODES) {
    const [cx, cy] = cell(n.x, n.y);
    stamp(m, cx, cy, n.kind === 'route' ? 1 : 2);
  }
  for (const [a, b] of LEGS) {
    const na = NODES.find((n) => n.id === a)!;
    const nb = NODES.find((n) => n.id === b)!;
    const pts = legPath(na, nb);
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = cell(pts[s]![0], pts[s]![1]);
      const [x1, y1] = cell(pts[s + 1]![0], pts[s + 1]![1]);
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        stamp(m, Math.round(x0 + (x1 - x0) * k), Math.round(y0 + (y1 - y0) * k), 1);
      }
    }
  }
  MASK = m;
  return m;
}

function land(m: Uint8Array, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS && m[y * COLS + x] === 1;
}

/** Strings that live in this table rather than at a `t()` call site. */
export function regionStrings(): string[] {
  return NODES.map((n) => n.desc);
}

function nodeAt(mapId: string): RegionNode | null {
  return NODES.find((n) => n.maps.includes(mapId)) ?? null;
}

/**
 * Visits ride the existing flag bag rather than a new save field: flags are
 * already persisted, migrated and synced to Cosmos, so charting a town costs
 * nothing and old saves stay loadable.
 */
export function visitFlag(nodeId: string): string {
  return `visit:${nodeId}`;
}

/** Called by the overworld on every map load. */
export function markVisited(save: SaveData, mapId: string): void {
  const n = nodeAt(mapId);
  if (n) setFlag(save, visitFlag(n.id), 1);
}

export class RegionMapScene extends Scene {
  private index = 0;
  private tick = 0;
  private here: RegionNode | null = null;

  override enter(): void {
    this.here = nodeAt(this.game.save.pos.map);
    const i = this.here ? NODES.indexOf(this.here) : -1;
    this.index = i >= 0 ? i : 0;
    this.tick = 0;
  }

  /** A node is charted once you have stood in it, or once its flag is set. */
  private known(n: RegionNode): boolean {
    if (n === this.here) return true;
    if (n.reveal && flag(this.game.save, n.reveal)) return true;
    return flag(this.game.save, visitFlag(n.id)) > 0;
  }

  update(): void {
    this.tick++;
    const inp = this.game.input;
    if (inp.pressed('b') || inp.pressed('start')) { audio.sfx('cancel'); this.game.pop(); return; }
    const step = (inp.repeat('right') || inp.repeat('down') ? 1 : 0)
      - (inp.repeat('left') || inp.repeat('up') ? 1 : 0);
    if (step === 0) return;
    const next = Math.max(0, Math.min(NODES.length - 1, this.index + step));
    if (next === this.index) return;
    this.index = next;
    audio.sfx('cursor');
  }

  render(g: CanvasRenderingContext2D): void {
    // Sea. Two bands plus a scanline give it depth without a gradient, which
    // the 15-bit palette clamp would band anyway.
    g.fillStyle = '#3060b0';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = '#3868c0';
    for (let y = 0; y < SCREEN_H; y += 4) g.fillRect(0, y, SCREEN_W, 2);

    this.drawLand(g);

    for (const [a, b] of LEGS) {
      const na = NODES.find((n) => n.id === a)!;
      const nb = NODES.find((n) => n.id === b)!;
      this.drawLeg(g, na, nb);
    }

    for (const n of NODES) this.drawNode(g, n);

    const cur = NODES[this.index]!;
    const shown = this.known(cur);
    this.drawCursor(g, cur);

    drawWindow(g, 2, 2, SCREEN_W - 4, 20);
    font.draw(g, tUpper('REGION MAP'), 12, 9, 'normal', false);

    drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
    font.draw(g, shown ? cur.name : '- - - - - - -', 12, TEXTBOX_Y + 12, 'normal', false);
    const line = shown ? t(cur.desc) : t('This area has not been charted yet.');
    for (const [i, l] of font.wrap(line, 214).slice(0, 2).entries()) {
      font.draw(g, l, 12, TEXTBOX_Y + 24 + i * 11, 'normal', false);
    }
  }

  /**
   * Shore, land, then a lit top edge. Derived from the mask so the interior has
   * no seams and the coastline steps in whole cells, like a tilemap would.
   */
  private drawLand(g: CanvasRenderingContext2D): void {
    const m = landMask();
    const px = (c: number) => c * CELL;
    const py = (c: number) => CHART_Y + c * CELL;

    g.fillStyle = '#68a8e0';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (land(m, x, y)) continue;
        if (!land(m, x - 1, y) && !land(m, x + 1, y) && !land(m, x, y - 1) && !land(m, x, y + 1)) continue;
        g.fillRect(px(x), py(y), CELL, CELL);
      }
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!land(m, x, y)) continue;
        g.fillStyle = '#489038';
        g.fillRect(px(x), py(y), CELL, CELL);
        if (!land(m, x, y - 1)) {
          g.fillStyle = '#78c860';
          g.fillRect(px(x), py(y), CELL, 2);
        }
        if (!land(m, x, y + 1)) {
          g.fillStyle = '#1c5c30';
          g.fillRect(px(x), py(y) + CELL - 2, CELL, 2);
        }
        if (!land(m, x - 1, y)) {
          g.fillStyle = '#2c7038';
          g.fillRect(px(x), py(y), 1, CELL);
        }
        if (!land(m, x + 1, y)) {
          g.fillStyle = '#2c7038';
          g.fillRect(px(x) + CELL - 1, py(y), 1, CELL);
        }
      }
    }
  }

  /** Roads follow `legPath`, so the drawn line always sits on the land corridor. */
  private drawLeg(g: CanvasRenderingContext2D, a: RegionNode, b: RegionNode): void {
    const pts = legPath(a, b);
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0] = pts[s]!;
      const [x1, y1] = pts[s + 1]!;
      const x = Math.min(x0, x1);
      const y = Math.min(y0, y1);
      const w = Math.abs(x1 - x0) + 2;
      const h = Math.abs(y1 - y0) + 2;
      g.fillStyle = '#9c8450';
      g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = '#f0e0a8';
      g.fillRect(x, y, w, h);
    }
  }

  private drawNode(g: CanvasRenderingContext2D, n: RegionNode): void {
    const known = this.known(n);
    const x = n.x;
    const y = n.y;
    if (n.kind === 'route') {
      g.fillStyle = known ? '#f8f0c8' : '#98a8b8';
      g.fillRect(x - 1, y - 1, 4, 4);
      g.fillStyle = '#403020';
      g.fillRect(x, y, 2, 2);
      return;
    }
    const body = known ? NODE_COLOR[n.kind] : '#8090a0';
    const roof = known ? NODE_ROOF[n.kind] : '#606c7c';
    const w = n.kind === 'city' || n.kind === 'summit' ? 10 : 8;
    const h = n.kind === 'city' || n.kind === 'summit' ? 10 : 8;
    g.fillStyle = '#101820';
    g.fillRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2);
    g.fillStyle = body;
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = roof;
    g.fillRect(x - w / 2, y - h / 2, w, 3);
    if (n.kind === 'summit' && known) {
      g.fillStyle = '#f8e058';
      g.fillRect(x - 1, y - h / 2 - 4, 2, 3);
    }
    // The blinking pin marks where the player is standing.
    if (n === this.here && Math.floor(this.tick / 16) % 2 === 0) {
      g.fillStyle = '#f85850';
      g.fillRect(x - 1, y - h / 2 - 9, 2, 6);
      g.fillRect(x - 3, y - h / 2 - 11, 6, 3);
    }
  }

  private drawCursor(g: CanvasRenderingContext2D, n: RegionNode): void {
    const p = Math.floor(this.tick / 10) % 2;
    const r = 8 + p;
    g.strokeStyle = '#f8f8f8';
    g.lineWidth = 1;
    const x = Math.round(n.x) - r;
    const y = Math.round(n.y) - r;
    const s = r * 2;
    // Four corner brackets, not a full box - a solid frame hides the icon.
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1],
    ] as Array<[number, number, number, number]>) {
      g.fillStyle = '#f8f8f8';
      g.fillRect(dx > 0 ? cx : cx - 4, cy + (dy > 0 ? 0 : -1), 4, 1);
      g.fillRect(cx + (dx > 0 ? 0 : -1), dy > 0 ? cy : cy - 4, 1, 4);
    }
  }
}

const NODE_COLOR: Record<NodeKind, string> = {
  town: '#e8e0d0', city: '#e8e0d0', route: '#f8f0c8', landmark: '#308848', summit: '#c8b0e0',
};
const NODE_ROOF: Record<NodeKind, string> = {
  town: '#d05848', city: '#4878d8', route: '#f8f0c8', landmark: '#1c5c30', summit: '#7048a8',
};

export { nodeAt as regionNodeFor, NODES as REGION_NODES };
