/** Items, bag categories and their in-battle / field behaviour. */

export type ItemCategory = 'ball' | 'medicine' | 'battle' | 'key' | 'misc';

export interface ItemDef {
  key: string;
  name: string;
  category: ItemCategory;
  price: number;
  desc: string;
  /** Ball catch multiplier. */
  ballRate?: number;
  /** HP restored (or -1 for full). */
  heal?: number;
  /** PP restored to one move (-1 for full). */
  pp?: number;
  /** Status cured; 'any' cures everything. */
  cures?: string[];
  /** Revive a fainted unit to this fraction of max HP. */
  revive?: number;
  /** Temporary battle stat boost. */
  boost?: { stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc'; stages: number };
  /** Usable in the field. */
  field?: boolean;
  /** Usable in battle. */
  battle?: boolean;
  /** Repels wild encounters for N steps. */
  repel?: number;
  /** Boosts run-away chance. */
  escape?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  // --- Capture devices -----------------------------------------------------
  nanocore: {
    key: 'nanocore', name: 'NANO CORE', category: 'ball', price: 200, ballRate: 1,
    battle: true, desc: 'A standard containment core for capturing wild AGENTMON.',
  },
  hypercore: {
    key: 'hypercore', name: 'HYPER CORE', category: 'ball', price: 600, ballRate: 1.5,
    battle: true, desc: 'A refined core with a higher capture success rate.',
  },
  quantumcore: {
    key: 'quantumcore', name: 'QUANTUM CORE', category: 'ball', price: 1200, ballRate: 2,
    battle: true, desc: 'A high-performance core with an excellent capture rate.',
  },
  masterkey: {
    key: 'masterkey', name: 'ROOT CORE', category: 'ball', price: 0, ballRate: 255,
    battle: true, desc: 'The ultimate core. Captures any AGENTMON without fail.',
  },
  netcore: {
    key: 'netcore', name: 'NET CORE', category: 'ball', price: 1000, ballRate: 1,
    battle: true, desc: 'Works best on AGENTMON that have been battling a long time.',
  },

  // --- Repair / medicine ---------------------------------------------------
  patch: {
    key: 'patch', name: 'PATCH', category: 'medicine', price: 300, heal: 20,
    field: true, battle: true, desc: 'Restores 20 HP to one AGENTMON.',
  },
  superpatch: {
    key: 'superpatch', name: 'SUPER PATCH', category: 'medicine', price: 700, heal: 50,
    field: true, battle: true, desc: 'Restores 50 HP to one AGENTMON.',
  },
  hyperpatch: {
    key: 'hyperpatch', name: 'HYPER PATCH', category: 'medicine', price: 1200, heal: 200,
    field: true, battle: true, desc: 'Restores 200 HP to one AGENTMON.',
  },
  fullpatch: {
    key: 'fullpatch', name: 'FULL PATCH', category: 'medicine', price: 2500, heal: -1,
    field: true, battle: true, desc: 'Fully restores the HP of one AGENTMON.',
  },
  antivirus: {
    key: 'antivirus', name: 'ANTIVIRUS', category: 'medicine', price: 250, cures: ['poison'],
    field: true, battle: true, desc: 'Cures an AGENTMON of CORRUPTION.',
  },
  coolant: {
    key: 'coolant', name: 'COOLANT', category: 'medicine', price: 250, cures: ['burn'],
    field: true, battle: true, desc: 'Cools an OVERHEATED AGENTMON.',
  },
  deicer: {
    key: 'deicer', name: 'DE-ICER', category: 'medicine', price: 250, cures: ['freeze'],
    field: true, battle: true, desc: 'Thaws a FROZEN AGENTMON.',
  },
  reboot: {
    key: 'reboot', name: 'REBOOT CHIP', category: 'medicine', price: 200, cures: ['sleep'],
    field: true, battle: true, desc: 'Wakes a SLEEPING AGENTMON.',
  },
  surgekill: {
    key: 'surgekill', name: 'SURGE FILTER', category: 'medicine', price: 200, cures: ['paralysis'],
    field: true, battle: true, desc: 'Clears a SHORTED AGENTMON.',
  },
  fullreset: {
    key: 'fullreset', name: 'FULL RESET', category: 'medicine', price: 600, cures: ['any'],
    field: true, battle: true, desc: 'Cures all status problems of one AGENTMON.',
  },
  reflash: {
    key: 'reflash', name: 'REFLASH', category: 'medicine', price: 1500, revive: 0.5,
    field: true, battle: true, desc: 'Revives a fainted AGENTMON with half HP.',
  },
  reflashmax: {
    key: 'reflashmax', name: 'MAX REFLASH', category: 'medicine', price: 4000, revive: 1,
    field: true, battle: true, desc: 'Revives a fainted AGENTMON with full HP.',
  },
  ppcell: {
    key: 'ppcell', name: 'PP CELL', category: 'medicine', price: 900, pp: 10,
    field: true, battle: true, desc: 'Restores 10 PP to one move.',
  },
  ppcellmax: {
    key: 'ppcellmax', name: 'MAX PP CELL', category: 'medicine', price: 2500, pp: -1,
    field: true, battle: true, desc: 'Fully restores the PP of one move.',
  },

  // --- Battle boosters -----------------------------------------------------
  overclock: {
    key: 'overclock', name: 'OVERCLOCK', category: 'battle', price: 500,
    boost: { stat: 'atk', stages: 1 }, battle: true,
    desc: 'Raises ATTACK of an AGENTMON in battle.',
  },
  hardening: {
    key: 'hardening', name: 'HARD SHELL', category: 'battle', price: 550,
    boost: { stat: 'def', stages: 1 }, battle: true,
    desc: 'Raises DEFENSE of an AGENTMON in battle.',
  },
  turbofan: {
    key: 'turbofan', name: 'TURBO FAN', category: 'battle', price: 350,
    boost: { stat: 'spe', stages: 1 }, battle: true,
    desc: 'Raises SPEED of an AGENTMON in battle.',
  },
  lens: {
    key: 'lens', name: 'FOCUS LENS', category: 'battle', price: 950,
    boost: { stat: 'acc', stages: 1 }, battle: true,
    desc: 'Raises ACCURACY of an AGENTMON in battle.',
  },

  // --- Field utilities -----------------------------------------------------
  jammer: {
    key: 'jammer', name: 'SIGNAL JAMMER', category: 'misc', price: 350, repel: 100,
    field: true, desc: 'Keeps weak wild AGENTMON away for 100 steps.',
  },
  superjammer: {
    key: 'superjammer', name: 'SUPER JAMMER', category: 'misc', price: 500, repel: 200,
    field: true, desc: 'Keeps weak wild AGENTMON away for 200 steps.',
  },
  smokebomb: {
    key: 'smokebomb', name: 'EMP SMOKE', category: 'misc', price: 350, escape: true,
    battle: true, desc: 'Guarantees escape from a wild battle.',
  },
  scrap: {
    key: 'scrap', name: 'SCRAP METAL', category: 'misc', price: 0,
    desc: 'A chunk of salvage. Sells for a decent price at a MART.',
  },
  rarechip: {
    key: 'rarechip', name: 'RARE CHIP', category: 'misc', price: 0,
    field: true, desc: 'Raises the level of an AGENTMON by one.',
  },

  // --- Key items -----------------------------------------------------------
  agentdex: {
    key: 'agentdex', name: 'AGENTDEX', category: 'key', price: 0,
    desc: 'A digital encyclopedia that auto-records every AGENTMON you meet.',
  },
  towncomms: {
    key: 'towncomms', name: 'TOWN COMMS', category: 'key', price: 0,
    desc: 'A comms unit for calling home and receiving field updates.',
  },
  keycard: {
    key: 'keycard', name: 'ACCESS CARD', category: 'key', price: 0,
    desc: 'Grants clearance to the CORE CITADEL server floor.',
  },
  toolkit: {
    key: 'toolkit', name: 'FIELD TOOLKIT', category: 'key', price: 0,
    desc: 'An engineer kit. Lets you cut through cable bundles blocking the way.',
  },
  parcel: {
    key: 'parcel', name: 'DEV PARCEL', category: 'key', price: 0,
    desc: 'A sealed package addressed to PROF. ADA.',
  },
};

export function item(key: string): ItemDef {
  const it = ITEMS[key];
  if (!it) throw new Error(`Unknown item: ${key}`);
  return it;
}

export const CATEGORY_ORDER: ItemCategory[] = ['ball', 'medicine', 'battle', 'misc', 'key'];

export const CATEGORY_NAME: Record<ItemCategory, string> = {
  ball: 'CORES',
  medicine: 'REPAIR',
  battle: 'BOOST',
  misc: 'ITEMS',
  key: 'KEY ITEMS',
};
