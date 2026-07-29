/** Map definition format and the runtime tilemap that renders/queries it. */

import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { TILE, type TileSetResult } from '../../engine/tilegen.ts';

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface WarpDef {
  x: number;
  y: number;
  to: string;
  tx: number;
  ty: number;
  facing?: Facing;
  /** 'step' fires on entering the tile, 'door' also plays the door sfx. */
  kind?: 'step' | 'door' | 'stairs';
  /** Only usable when this flag is set. */
  requiresFlag?: string;
}

export interface SignDef {
  x: number;
  y: number;
  text: string[];
}

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  /** Sprite key in the character atlas. */
  sprite: string;
  name?: string;
  /** Wander = random steps, path = follow list, static = never moves. */
  movement?: 'static' | 'wander' | 'look';
  text?: string[];
  /** Script id resolved by the overworld scene. */
  script?: string;
  /** Trainer battle definition key. */
  trainer?: string;
  /** Hidden unless this flag is set (>0). */
  showIfFlag?: string;
  /** Hidden when this flag is set (>0). */
  hideIfFlag?: string;
  /** Line-of-sight range for trainers. */
  sight?: number;
}

export interface ObjectDef {
  /** Image key in the asset registry (buildings etc.). */
  sprite: string;
  /** Tile position of the object's top-left corner. */
  x: number;
  y: number;
  /** Footprint in tiles; those tiles become solid unless `passable`. */
  w: number;
  h: number;
  passable?: boolean;
  /** Draw above the player (roof overhangs). */
  overhead?: boolean;
  /** Pixel offset for fine placement. */
  ox?: number;
  oy?: number;
}

export interface EncounterEntry {
  species: string;
  min: number;
  max: number;
  weight: number;
}

export interface ItemBallDef {
  id: string;
  x: number;
  y: number;
  item: string;
  count?: number;
  hidden?: boolean;
}

export interface MapDef {
  id: string;
  name: string;
  /** Rows of single characters mapped through `legend`. */
  ground: string[];
  /** Optional decoration layer drawn over the ground; space = empty. */
  over?: string[];
  /** Optional layer drawn above the player; space = empty. */
  top?: string[];
  legend: Record<string, string>;
  music: string;
  outdoor: boolean;
  /** Tint applied to the whole map (indoor mood, night, cave). */
  tint?: string;
  warps?: WarpDef[];
  signs?: SignDef[];
  npcs?: NpcDef[];
  objects?: ObjectDef[];
  items?: ItemBallDef[];
  encounters?: EncounterEntry[];
  /** Connections for seamless scrolling are not used; edges are walls. */
  battleBackdrop?: string;
  /** Heals the party when entering (Repair Bay counters). */
  healOnEnter?: boolean;
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  private ground: Int16Array;
  private over: Int16Array;
  private top: Int16Array;
  private solidMask: Uint8Array;
  /** Tile blitted outside the map bounds so small rooms fill the screen. */
  private surroundId = -1;

  constructor(readonly def: MapDef, private readonly tiles: TileSetResult) {
    this.height = def.ground.length;
    this.width = Math.max(...def.ground.map((r) => r.length));
    const n = this.width * this.height;
    this.ground = new Int16Array(n).fill(-1);
    this.over = new Int16Array(n).fill(-1);
    this.top = new Int16Array(n).fill(-1);
    this.solidMask = new Uint8Array(n);

    this.loadLayer(def.ground, this.ground, true);
    if (def.over) this.loadLayer(def.over, this.over, true);
    if (def.top) this.loadLayer(def.top, this.top, false);

    // Object footprints block movement.
    for (const obj of def.objects ?? []) {
      if (obj.passable) continue;
      for (let y = obj.y; y < obj.y + obj.h; y++) {
        for (let x = obj.x; x < obj.x + obj.w; x++) {
          if (this.inBounds(x, y)) this.solidMask[y * this.width + x] = 1;
        }
      }
    }

    // Warps are always steppable, even when they sit inside a building footprint.
    for (const w of def.warps ?? []) {
      if (this.inBounds(w.x, w.y)) this.solidMask[w.y * this.width + w.x] = 0;
    }

    // Interiors are often smaller than the 15x10 tile viewport. Rather than
    // letting the room float in a flat void, extend the room's own border
    // material outwards so it reads as the rest of the building.
    if (!def.outdoor) this.surroundId = this.modalBorderTile();
  }

  /** Most common ground tile on the map's border ring - i.e. the wall. */
  private modalBorderTile(): number {
    const tally = new Map<number, number>();
    const add = (x: number, y: number): void => {
      const id = this.ground[y * this.width + x]!;
      if (id >= 0) tally.set(id, (tally.get(id) ?? 0) + 1);
    };
    for (let x = 0; x < this.width; x++) { add(x, 0); add(x, this.height - 1); }
    for (let y = 0; y < this.height; y++) { add(0, y); add(this.width - 1, y); }
    let best = -1;
    let bestN = 0;
    for (const [id, n] of tally) if (n > bestN) { best = id; bestN = n; }
    return best;
  }

  private loadLayer(rows: string[], out: Int16Array, affectsCollision: boolean): void {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y]!;
      for (let x = 0; x < this.width; x++) {
        const ch = row[x] ?? ' ';
        if (ch === ' ') continue;
        const name = this.def.legend[ch];
        if (!name) continue;
        const id = this.tiles.index[name];
        if (id === undefined) continue;
        out[y * this.width + x] = id;
        if (affectsCollision && this.tiles.solid.has(id)) this.solidMask[y * this.width + x] = 1;
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  groundAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.ground[y * this.width + x]! : -1;
  }

  overAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.over[y * this.width + x]! : -1;
  }

  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.solidMask[y * this.width + x] === 1;
  }

  setSolid(x: number, y: number, solid: boolean): void {
    if (this.inBounds(x, y)) this.solidMask[y * this.width + x] = solid ? 1 : 0;
  }

  isEncounter(x: number, y: number): boolean {
    const g = this.overAt(x, y);
    if (g >= 0 && this.tiles.encounter.has(g)) return true;
    const b = this.groundAt(x, y);
    return b >= 0 && this.tiles.encounter.has(b);
  }

  isTallGrass(x: number, y: number): boolean {
    const id = this.tiles.index['tallgrass'];
    return this.overAt(x, y) === id || this.groundAt(x, y) === id;
  }

  ledgeAt(x: number, y: number): 'down' | 'left' | 'right' | undefined {
    const g = this.groundAt(x, y);
    return g >= 0 ? this.tiles.ledge.get(g) : undefined;
  }

  warpAt(x: number, y: number): WarpDef | undefined {
    return this.def.warps?.find((w) => w.x === x && w.y === y);
  }

  signAt(x: number, y: number): SignDef | undefined {
    return this.def.signs?.find((s) => s.x === x && s.y === y);
  }

  /** Resolve the tile id shown this frame, honouring animation chains. */
  private frameOf(id: number, animTick: number): number {
    const chain = this.tiles.animated.get(id);
    if (!chain) return id;
    return chain[Math.floor(animTick) % chain.length]!;
  }

  private blit(g: CanvasRenderingContext2D, id: number, dx: number, dy: number): void {
    const sx = (id % this.tiles.cols) * TILE;
    const sy = Math.floor(id / this.tiles.cols) * TILE;
    g.drawImage(this.tiles.canvas, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
  }

  /** Draw ground+over layers for the visible window. */
  render(
    g: CanvasRenderingContext2D, camX: number, camY: number, animTick: number,
  ): void {
    if (this.surroundId >= 0) this.renderSurround(g, camX, camY, animTick);
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(this.width - 1, Math.floor((camX + SCREEN_W) / TILE));
    const y1 = Math.min(this.height - 1, Math.floor((camY + SCREEN_H) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x * TILE - camX;
        const dy = y * TILE - camY;
        const gid = this.ground[y * this.width + x]!;
        if (gid >= 0) this.blit(g, this.frameOf(gid, animTick), dx, dy);
        const oid = this.over[y * this.width + x]!;
        if (oid >= 0) this.blit(g, this.frameOf(oid, animTick), dx, dy);
      }
    }
  }

  /** Fill everything outside the map with the border tile. */
  private renderSurround(
    g: CanvasRenderingContext2D, camX: number, camY: number, animTick: number,
  ): void {
    const id = this.frameOf(this.surroundId, animTick);
    const x0 = Math.floor(camX / TILE);
    const y0 = Math.floor(camY / TILE);
    const x1 = Math.floor((camX + SCREEN_W) / TILE);
    const y1 = Math.floor((camY + SCREEN_H) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && y >= 0 && x < this.width && y < this.height) continue;
        this.blit(g, id, x * TILE - camX, y * TILE - camY);
      }
    }
  }

  /** Draw the above-player layer. */
  renderTop(
    g: CanvasRenderingContext2D, camX: number, camY: number, animTick: number,
  ): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(this.width - 1, Math.floor((camX + SCREEN_W) / TILE));
    const y1 = Math.min(this.height - 1, Math.floor((camY + SCREEN_H) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = this.top[y * this.width + x]!;
        if (id >= 0) this.blit(g, this.frameOf(id, animTick), x * TILE - camX, y * TILE - camY);
      }
    }
  }
}
