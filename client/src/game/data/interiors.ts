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
  g.set(2, 1, 'y').set(12, 1, 'y');     // windows either side
  g.rect(1, 5, 3, 1, 'k');              // supply shelving
  g.set(1, 4, 'q');
  g.set(13, 4, 'q');
  g.rect(10, 6, 4, 3, 'u');             // waiting rug
  g.rect(1, 7, 3, 2, 'u');
  g.set(11, 5, 'e');                    // waiting table
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
  g.set(9, 1, 'y');
  g.rect(8, 3, 4, 2, 'k');    // stock shelving
  g.rect(8, 6, 4, 2, 'u');    // browsing rug
  g.set(1, 6, 'q');
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
  g.set(2, 1, 'y').set(8, 1, 'y');   // back-wall windows
  g.set(1, 2, 'j');                  // cooler unit
  g.rect(2, 2, 2, 1, 'e');           // kitchen table
  g.rect(7, 2, 2, 1, 'k');           // shelving
  g.set(9, 2, 'q');                  // potted plant
  g.set(1, 5, 'v');                  // wall screen
  g.rect(4, 5, 3, 3, 'u');           // rug
  g.set(9, 6, 'q');
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
