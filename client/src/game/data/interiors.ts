/** Interior map factories shared by every town (repair bays, marts, houses). */

import type { MapDef, NpcDef, WarpDef } from '../world/tilemap.ts';
import { Grid, LEGEND } from './mapbuild.ts';

/** Wall-and-floor interior shell: solid wall border, floor inside, door gap at bottom. */
export function interiorShell(
  w: number, h: number, floor: string, doorX: number, wallChar = 'W',
): Grid {
  const g = new Grid(w, h, floor);
  g.frame(0, 0, w, h, wallChar);
  // Two rows of wall at the top read as a proper back wall.
  g.hline(0, w - 1, 1, wallChar);
  g.set(doorX, h - 1, floor);
  return g;
}

export interface RepairBayOpts {
  id: string;
  name: string;
  backTo: string;
  backX: number;
  backY: number;
  medicLine?: string[];
  extraNpcs?: NpcDef[];
}

/** The Repair Bay: this world's Pokémon Center. Heals the party on the counter. */
export function makeRepairBay(o: RepairBayOpts): MapDef {
  const w = 15;
  const h = 11;
  const g = interiorShell(w, h, 'l', 7);
  g.rect(1, 2, w - 2, 2, 'C');          // reception counter
  g.rect(1, 4, 3, 1, 'c');
  g.rect(10, 6, 4, 3, 'c');             // waiting rug
  g.rect(1, 6, 3, 3, 'c');
  const warps: WarpDef[] = [
    { x: 7, y: h - 1, to: o.backTo, tx: o.backX, ty: o.backY, facing: 'down', kind: 'door' },
    { x: 6, y: h - 1, to: o.backTo, tx: o.backX, ty: o.backY, facing: 'down', kind: 'door' },
  ];
  return {
    id: o.id,
    name: o.name,
    ground: g.out(),
    legend: LEGEND,
    music: 'center',
    outdoor: false,
    warps,
    healOnEnter: false,
    npcs: [
      {
        id: 'medic', x: 7, y: 2, facing: 'down', sprite: 'npc_medic', name: 'TECH',
        movement: 'static', script: 'heal',
        text: o.medicLine ?? ['Welcome to the REPAIR BAY!', 'Shall I restore your AGENTMON to full working order?'],
      },
      ...(o.extraNpcs ?? []),
    ],
    signs: [
      { x: 12, y: 4, text: ['A notice board.', 'REPAIR BAYS are free. Please recycle your empty cores.'] },
    ],
  };
}

export interface MartOpts {
  id: string;
  name: string;
  backTo: string;
  backX: number;
  backY: number;
  stock: string[];
  extraNpcs?: NpcDef[];
}

export function makeMart(o: MartOpts): MapDef {
  const w = 13;
  const h = 10;
  const g = interiorShell(w, h, 'l', 6);
  g.rect(1, 2, 5, 2, 'C');
  g.rect(8, 3, 4, 4, 'c');
  return {
    id: o.id,
    name: o.name,
    ground: g.out(),
    legend: LEGEND,
    music: 'mart',
    outdoor: false,
    warps: [
      { x: 6, y: h - 1, to: o.backTo, tx: o.backX, ty: o.backY, facing: 'down', kind: 'door' },
      { x: 5, y: h - 1, to: o.backTo, tx: o.backX, ty: o.backY, facing: 'down', kind: 'door' },
    ],
    npcs: [
      {
        id: 'clerk', x: 3, y: 2, facing: 'down', sprite: 'npc_clerk', name: 'CLERK',
        movement: 'static', script: `shop:${o.stock.join(',')}`,
        text: ['Hi there! Take your pick of our field supplies.'],
      },
      ...(o.extraNpcs ?? []),
    ],
  };
}

export interface HouseOpts {
  id: string;
  name: string;
  backTo: string;
  backX: number;
  backY: number;
  npcs?: NpcDef[];
  signs?: { x: number; y: number; text: string[] }[];
}

export function makeHouse(o: HouseOpts): MapDef {
  const w = 11;
  const h = 9;
  const g = interiorShell(w, h, 'w', 5);
  g.rect(1, 2, 2, 1, 'C');      // kitchen counter
  g.rect(7, 2, 3, 1, 'C');      // bookshelf run
  g.rect(4, 5, 3, 3, 'c');      // rug
  return {
    id: o.id,
    name: o.name,
    ground: g.out(),
    legend: LEGEND,
    music: 'town',
    outdoor: false,
    warps: [
      { x: 5, y: h - 1, to: o.backTo, tx: o.backX, ty: o.backY, facing: 'down', kind: 'door' },
    ],
    npcs: o.npcs ?? [],
    signs: o.signs,
  };
}
