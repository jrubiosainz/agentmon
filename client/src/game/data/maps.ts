/** The whole overworld: towns, routes, gyms and interiors. */

import type { MapDef, ObjectDef, WarpDef } from '../world/tilemap.ts';
import { makeHouse, makeMart, makeRepairBay, interiorShell } from './interiors.ts';
import { Grid, LEGEND } from './mapbuild.ts';

/** Place a building object and return the warp that its doorway triggers. */
function building(
  sprite: string, x: number, y: number, w: number, h: number,
  doorCol: number, to: string, tx: number, ty: number,
): { obj: ObjectDef; warp: WarpDef } {
  return {
    obj: { sprite, x, y, w, h },
    warp: { x: x + doorCol, y: y + h - 1, to, tx, ty, facing: 'up', kind: 'door' },
  };
}

// =========================================================================== //
// 1. Player's house
// =========================================================================== //
const bedroomGrid = interiorShell(9, 9, 'w', 4);
bedroomGrid.set(2, 1, 'y').set(6, 1, 'y');   // windows
bedroomGrid.set(1, 2, 'B').set(2, 2, 'D');   // bed head
bedroomGrid.set(1, 3, 'E').set(2, 3, 'H');   // bed foot
bedroomGrid.set(6, 2, 'd');                  // desk
bedroomGrid.set(7, 2, 'P');                  // dev rig
bedroomGrid.set(1, 5, 'v');                  // wall screen
bedroomGrid.rect(3, 5, 3, 2, 'u');           // rug
bedroomGrid.set(7, 4, 'k');                  // shelf
bedroomGrid.set(7, 6, 'q');                  // plant

export const HOME_BEDROOM: MapDef = {
  id: 'home_bedroom',
  name: "YOUR ROOM",
  ground: bedroomGrid.out(),
  legend: LEGEND,
  music: 'town',
  outdoor: false,
  warps: [{ x: 4, y: 8, to: 'home_ground', tx: 8, ty: 2, facing: 'down', kind: 'stairs' }],
  signs: [
    { x: 7, y: 2, text: ['A dev rig with three monitors.', 'Your half-finished agent framework is still compiling.'] },
    { x: 6, y: 2, text: ['Your desk. Solder, spare servos and cold coffee.'] },
    { x: 1, y: 2, text: ['Your bed.', 'You slept well. Time to get moving!'] },
    { x: 2, y: 2, text: ['Your bed.', 'You slept well. Time to get moving!'] },
    { x: 7, y: 4, text: ['A shelf of robotics manuals and a dusty trophy.'] },
    { x: 1, y: 5, text: ['The wall screen is paused on an AGÉNTMON LEAGUE final.'] },
  ],
};

const homeGroundGrid = interiorShell(11, 9, 'w', 5);
homeGroundGrid.set(2, 1, 'y').set(6, 1, 'y');
homeGroundGrid.set(1, 2, 'j');            // cooler
homeGroundGrid.rect(2, 2, 2, 1, 'k');     // shelving
homeGroundGrid.set(7, 2, 'v');            // wall screen
homeGroundGrid.rect(3, 5, 3, 1, 'e');     // dining table
homeGroundGrid.rect(3, 6, 4, 1, 'u');     // rug
homeGroundGrid.set(1, 6, 'q');
homeGroundGrid.rect(8, 2, 1, 5, 't');     // stairs up

export const HOME_GROUND: MapDef = {
  id: 'home_ground',
  name: "YOUR HOUSE",
  ground: homeGroundGrid.out(),
  legend: LEGEND,
  music: 'town',
  outdoor: false,
  warps: [
    { x: 5, y: 8, to: 'nullbyte_town', tx: 4, ty: 11, facing: 'down', kind: 'door' },
    { x: 8, y: 2, to: 'home_bedroom', tx: 4, ty: 7, facing: 'down', kind: 'stairs' },
  ],
  npcs: [
    {
      id: 'mom', x: 3, y: 4, facing: 'down', sprite: 'mom', name: 'MOM',
      movement: 'look', script: 'mom',
      text: [
        'MOM: There you are! PROF. ADA called - she has something for you.',
        'MOM: Every engineer needs a partner AGÉNTMON. Go and pick yours!',
      ],
    },
  ],
  signs: [{ x: 7, y: 2, text: ['A wall screen loops a documentary about the CORE CITADEL.'] }],
};

// =========================================================================== //
// 2. Nullbyte Town
// =========================================================================== //
function nullbyteGrid(): Grid {
  const g = new Grid(26, 24, '.');
  g.scatter(',', 90, 11).scatter("'", 70, 23);
  // Tree border with a north exit.
  g.rect(0, 0, 26, 2, 'T');
  g.rect(0, 22, 26, 2, 'T');
  g.rect(0, 0, 2, 24, 'T');
  g.rect(24, 0, 2, 24, 'T');
  g.rect(12, 0, 2, 2, '-');
  // Main north-south path.
  g.rect(12, 2, 2, 19, '-');
  // Cross street.
  g.rect(2, 12, 22, 2, '-');
  // House / lab approach stubs.
  g.rect(4, 11, 1, 1, '-');
  g.rect(19, 11, 1, 1, '-');
  g.rect(8, 20, 1, 1, '-');
  g.vline(8, 14, 20, '-');
  // Pond.
  g.rect(18, 16, 5, 4, '~');
  g.hline(18, 22, 16, '_');
  g.rect(17, 15, 7, 1, 's');
  // Fences and detail.
  g.hline(3, 9, 4, 'F');
  g.scatter('f', 12, 7, { x: 2, y: 5, w: 8, h: 6 });
  g.scatter('g', 10, 19, { x: 15, y: 3, w: 8, h: 6 });
  g.scatter('h', 8, 31, { x: 3, y: 15, w: 4, h: 5 });
  g.scatter('O', 5, 43, { x: 15, y: 20, w: 8, h: 2 });
  g.set(11, 11, 'S');
  g.set(14, 3, 'S');
  return g;
}

const nbHouse = building('house_small', 3, 8, 4, 4, 1, 'home_ground', 5, 7);
const nbRival = building('house_small', 18, 8, 4, 4, 1, 'rival_house', 5, 7);
const nbLab = building('lab', 6, 16, 6, 5, 2, 'lab_ada', 6, 9);

export const NULLBYTE_TOWN: MapDef = {
  id: 'nullbyte_town',
  name: 'NULLBYTE TOWN',
  ground: nullbyteGrid().out(),
  legend: LEGEND,
  music: 'town',
  outdoor: true,
  battleBackdrop: 'bg_city',
  objects: [nbHouse.obj, nbRival.obj, nbLab.obj],
  warps: [
    nbHouse.warp, nbRival.warp, nbLab.warp,
    { x: 12, y: 0, to: 'route1', tx: 10, ty: 44, facing: 'up' },
    { x: 13, y: 0, to: 'route1', tx: 11, ty: 44, facing: 'up' },
  ],
  signs: [
    { x: 11, y: 11, text: ['NULLBYTE TOWN', 'Where every great agent takes its first step.'] },
    { x: 14, y: 3, text: ['ROUTE 1 ahead.', 'VOLTSPIRE CITY lies to the north.'] },
  ],
  npcs: [
    {
      id: 'nb_kid', x: 15, y: 10, facing: 'down', sprite: 'npc_kid', movement: 'wander',
      text: [
        'KID: Wild AGÉNTMON hide in the tall grass!',
        'KID: If you walk in there without a partner you will get scrapped!',
      ],
    },
    {
      id: 'nb_eng', x: 20, y: 14, facing: 'left', sprite: 'npc_engineer', movement: 'look',
      text: [
        'ENGINEER: PROF. ADA studies how AGÉNTMON learn.',
        'ENGINEER: They say she trained the very first one herself.',
      ],
    },
    {
      id: 'nb_guard', x: 12, y: 3, facing: 'down', sprite: 'npc_technician', movement: 'static',
      script: 'route1_block', hideIfFlag: 'gotStarter',
      text: ['TECHNICIAN: Hold up! You cannot head north without an AGÉNTMON.'],
    },
  ],
};

export const RIVAL_HOUSE = makeHouse({
  id: 'rival_house',
  name: "REX'S HOUSE",
  backTo: 'nullbyte_town', backX: 19, backY: 12,
  npcs: [
    {
      id: 'rival_sis', x: 3, y: 4, facing: 'down', sprite: 'npc_kid', movement: 'look',
      text: [
        'SISTER: My brother left before sunrise. Again.',
        'SISTER: He is desperate to beat you to the LAB.',
      ],
    },
  ],
  signs: [{ x: 8, y: 2, text: ['A wall of gym badge replicas. None of them are real.'] }],
});

// =========================================================================== //
// 3. Professor Ada's Lab
// =========================================================================== //
function labGrid(): Grid {
  const g = interiorShell(13, 11, 'l', 6);
  g.set(2, 1, 'y').set(10, 1, 'y');
  g.rect(1, 2, 3, 1, 'P');   // bank of terminals
  g.rect(1, 3, 3, 1, 'd');
  g.rect(9, 2, 3, 1, 'P');
  g.rect(9, 3, 3, 1, 'd');
  g.rect(1, 6, 2, 2, 'k');   // archive shelving
  g.set(1, 8, 'C');
  g.set(2, 8, 'C');
  g.rect(10, 6, 2, 2, 'k');
  g.set(10, 8, 'C');
  g.set(11, 8, 'C');
  g.set(1, 5, 'q');
  g.set(11, 5, 'q');
  g.rect(5, 4, 3, 2, 'u');
  g.rect(4, 8, 5, 1, 'C');   // starter table
  return g;
}

export const LAB_ADA: MapDef = {
  id: 'lab_ada',
  name: 'ADA RESEARCH LAB',
  ground: labGrid().out(),
  legend: LEGEND,
  music: 'lab',
  outdoor: false,
  warps: [{ x: 6, y: 10, to: 'nullbyte_town', tx: 8, ty: 21, facing: 'down', kind: 'door' }],
  npcs: [
    {
      id: 'ada', x: 6, y: 3, facing: 'down', sprite: 'professor', name: 'PROF. ADA',
      movement: 'static', script: 'ada',
      text: ['PROF. ADA: Ah, right on time.'],
    },
    {
      id: 'aide', x: 10, y: 5, facing: 'left', sprite: 'npc_engineer', movement: 'look',
      text: [
        'AIDE: Each starter core holds a partially trained agent.',
        'AIDE: What it becomes depends entirely on how you raise it.',
      ],
    },
    {
      id: 'rival_lab', x: 8, y: 6, facing: 'left', sprite: 'rival', name: 'REX',
      movement: 'static', script: 'rival_lab', showIfFlag: 'labRivalWaiting',
      hideIfFlag: 'rivalLabDone',
      text: ['REX: Took you long enough.'],
    },
  ],
  signs: [
    { x: 1, y: 6, text: ['Rows of humming incubation pods.'] },
    { x: 11, y: 6, text: ['A whiteboard covered in loss curves and coffee rings.'] },
  ],
  items: [{ id: 'lab_ball', x: 2, y: 4, item: 'nanocore', count: 5 }],
};

// =========================================================================== //
// 4. Route 1
// =========================================================================== //
function route1Grid(): Grid {
  const g = new Grid(22, 46, '.');
  g.scatter(',', 220, 5).scatter("'", 160, 71);
  g.rect(0, 0, 3, 46, 'T');
  g.rect(19, 0, 3, 46, 'T');
  g.rect(0, 45, 22, 1, 'T');
  g.rect(10, 45, 2, 1, '-');
  g.rect(0, 0, 22, 1, 'T');
  g.rect(10, 0, 2, 1, '-');
  // Winding path.
  g.rect(10, 36, 2, 10, '-');
  g.rect(5, 34, 7, 2, '-');
  g.rect(5, 24, 2, 12, '-');
  g.rect(5, 22, 11, 2, '-');
  g.rect(14, 12, 2, 12, '-');
  g.rect(10, 10, 6, 2, '-');
  g.rect(10, 1, 2, 11, '-');
  // Tall grass fields.
  g.rect(12, 38, 6, 6, '"');
  g.rect(4, 27, 5, 6, '"');
  g.rect(16, 14, 3, 7, '"');
  g.rect(4, 6, 5, 7, '"');
  g.rect(13, 2, 5, 6, '"');
  // Ledges create the classic one-way shortcuts.
  g.hline(6, 9, 33, 'L');
  g.hline(16, 18, 21, 'L');
  g.hline(6, 9, 9, 'L');
  // Water and scenery.
  g.rect(4, 16, 5, 4, '~');
  g.hline(4, 8, 16, '_');
  g.scatter('O', 14, 17);
  g.scatter('f', 22, 29);
  g.scatter('g', 18, 37);
  g.hline(12, 17, 37, 'F');
  g.set(12, 43, 'S');
  g.set(9, 23, 'S');
  return g;
}

export const ROUTE1: MapDef = {
  id: 'route1',
  name: 'ROUTE 1',
  ground: route1Grid().out(),
  legend: LEGEND,
  music: 'route',
  outdoor: true,
  battleBackdrop: 'bg_road',
  warps: [
    { x: 10, y: 45, to: 'nullbyte_town', tx: 12, ty: 1, facing: 'down' },
    { x: 11, y: 45, to: 'nullbyte_town', tx: 13, ty: 1, facing: 'down' },
    { x: 10, y: 0, to: 'voltspire_city', tx: 14, ty: 26, facing: 'up' },
    { x: 11, y: 0, to: 'voltspire_city', tx: 15, ty: 26, facing: 'up' },
  ],
  signs: [
    { x: 12, y: 43, text: ['ROUTE 1', 'NULLBYTE TOWN - VOLTSPIRE CITY'] },
    { x: 9, y: 23, text: ['CAUTION: Wild AGÉNTMON in the tall grass.', 'Keep your party charged.'] },
  ],
  items: [
    { id: 'r1_patch', x: 17, y: 40, item: 'patch', count: 1 },
    { id: 'r1_core', x: 5, y: 8, item: 'nanocore', count: 3 },
    { id: 'r1_scrap', x: 18, y: 3, item: 'scrap', count: 2 },
  ],
  npcs: [
    {
      id: 'r1_kid', x: 8, y: 35, facing: 'up', sprite: 'npc_kid', movement: 'static',
      trainer: 'r1_kid', sight: 4, name: 'ROOKIE JAMIE',
      text: ['ROOKIE JAMIE: My unit and I have been training all morning!'],
    },
    {
      id: 'r1_eng', x: 15, y: 13, facing: 'down', sprite: 'npc_engineer', movement: 'static',
      trainer: 'r1_eng', sight: 4, name: 'ENGINEER PIA',
      text: ['ENGINEER PIA: Let us benchmark your agent against mine.'],
    },
    {
      id: 'r1_hiker', x: 6, y: 21, facing: 'down', sprite: 'npc_technician', movement: 'look',
      text: [
        'TECHNICIAN: Ledges only go one way. You can hop down but not up.',
        'TECHNICIAN: Saves a lot of walking on the way home.',
      ],
    },
  ],
  encounters: [
    { species: 'voltling', min: 2, max: 4, weight: 24 },
    { species: 'chassik', min: 2, max: 4, weight: 24 },
    { species: 'pupboot', min: 2, max: 4, weight: 18 },
    { species: 'dronelet', min: 3, max: 5, weight: 14 },
    { species: 'roombit', min: 3, max: 5, weight: 12 },
    { species: 'stackbit', min: 3, max: 5, weight: 8 },
  ],
};

// =========================================================================== //
// 5. Voltspire City
// =========================================================================== //
function voltspireGrid(): Grid {
  const g = new Grid(32, 28, '.');
  g.scatter(',', 150, 13);
  g.rect(0, 0, 32, 2, 'T');
  g.rect(0, 26, 32, 2, 'T');
  g.rect(0, 0, 2, 28, 'T');
  g.rect(30, 0, 2, 28, 'T');
  g.rect(14, 26, 2, 2, '-');       // south exit to Route 1
  g.rect(30, 12, 2, 2, '-');       // east exit to Route 2
  // Plaza and streets.
  g.rect(2, 12, 30, 3, '#');
  g.rect(14, 2, 3, 26, '#');
  g.rect(4, 20, 24, 2, '#');
  g.rect(4, 6, 24, 2, '#');
  g.rect(6, 6, 2, 16, '#');
  g.rect(24, 6, 2, 16, '#');
  // Fountain / cooling pool.
  g.rect(19, 16, 4, 3, '~');
  g.hline(19, 22, 16, '_');
  g.frame(18, 15, 6, 5, '#');
  g.scatter('f', 14, 61, { x: 3, y: 16, w: 3, h: 8 });
  g.scatter('g', 14, 67, { x: 27, y: 16, w: 2, h: 8 });
  g.scatter('O', 6, 71, { x: 26, y: 23, w: 3, h: 2 });
  g.set(13, 25, 'S');
  g.set(13, 11, 'S');
  g.set(17, 11, 'S');
  return g;
}

const vsClinic = building('clinic', 3, 8, 5, 4, 2, 'repairbay_volt', 7, 10);
const vsShop = building('shop', 9, 8, 5, 4, 2, 'mart_volt', 6, 9);
const vsGym = building('gym_datacenter', 18, 6, 7, 6, 3, 'gym_volt', 8, 16);
const vsHouse1 = building('house_small', 3, 21, 4, 4, 1, 'volt_house1', 5, 8);
const vsHouse2 = building('house_large', 25, 21, 5, 4, 2, 'volt_house2', 5, 8);
const vsTower = { obj: { sprite: 'tower_server', x: 26, y: 2, w: 3, h: 5 } as ObjectDef };

export const VOLTSPIRE_CITY: MapDef = {
  id: 'voltspire_city',
  name: 'VOLTSPIRE CITY',
  ground: voltspireGrid().out(),
  legend: LEGEND,
  music: 'city',
  outdoor: true,
  battleBackdrop: 'bg_city',
  objects: [vsClinic.obj, vsShop.obj, vsGym.obj, vsHouse1.obj, vsHouse2.obj, vsTower.obj],
  warps: [
    vsClinic.warp, vsShop.warp, vsGym.warp, vsHouse1.warp, vsHouse2.warp,
    { x: 14, y: 27, to: 'route1', tx: 10, ty: 1, facing: 'down' },
    { x: 15, y: 27, to: 'route1', tx: 11, ty: 1, facing: 'down' },
    { x: 31, y: 12, to: 'route2', tx: 1, ty: 11, facing: 'right' },
    { x: 31, y: 13, to: 'route2', tx: 1, ty: 12, facing: 'right' },
  ],
  signs: [
    { x: 13, y: 25, text: ['VOLTSPIRE CITY', 'Where the grid never sleeps.'] },
    { x: 13, y: 11, text: ['REPAIR BAY', 'Full diagnostics and repair. No charge.'] },
    { x: 17, y: 11, text: ['VOLTSPIRE DATACENTER GYM', 'LEADER: NOVA', 'Specialty: VOLT'] },
  ],
  npcs: [
    {
      id: 'vs_tech', x: 17, y: 13, facing: 'down', sprite: 'npc_technician', movement: 'look',
      text: [
        'TECHNICIAN: The GYM is a live datacenter. LEADER NOVA runs it herself.',
        'TECHNICIAN: VOLT types short out ALLOY units. Bring something grounded.',
      ],
    },
    {
      id: 'vs_kid', x: 21, y: 21, facing: 'left', sprite: 'npc_kid', movement: 'wander',
      text: ['KID: The fountain is actually a coolant loop. Do not drink it!'],
    },
    {
      id: 'vs_eng', x: 8, y: 16, facing: 'right', sprite: 'npc_engineer', movement: 'look',
      text: [
        'ENGINEER: Selling SCRAP METAL at the MART is decent early money.',
        'ENGINEER: Wild units drop it all the time.',
      ],
    },
    {
      id: 'vs_guard', x: 31, y: 14, facing: 'left', sprite: 'npc_guard', movement: 'static',
      script: 'route2_block', hideIfFlag: 'badge_volt',
      text: [
        'GUARD: ROUTE 2 is closed for a cable fault.',
        'GUARD: Clear the VOLTSPIRE GYM and I will let you through.',
      ],
    },
  ],
};

export const REPAIRBAY_VOLT = makeRepairBay({
  id: 'repairbay_volt', name: 'VOLTSPIRE REPAIR BAY',
  backTo: 'voltspire_city', backX: 5, backY: 12,
  extraNpcs: [
    {
      id: 'rb_v_npc', x: 3, y: 7, facing: 'right', sprite: 'npc_engineer', movement: 'look',
      text: ['ENGINEER: You can SAVE anywhere from the MENU. Do it often.'],
    },
  ],
});

export const MART_VOLT = makeMart({
  id: 'mart_volt', name: 'VOLTSPIRE MART',
  backTo: 'voltspire_city', backX: 11, backY: 12,
  stock: ['nanocore', 'patch', 'antivirus', 'surgekill', 'reboot', 'jammer'],
  extraNpcs: [
    {
      id: 'mart_v_npc', x: 10, y: 5, facing: 'left', sprite: 'npc_kid', movement: 'wander',
      text: ['KID: SIGNAL JAMMERS keep weak wild units away. Great for exploring.'],
    },
  ],
});

export const VOLT_HOUSE1 = makeHouse({
  id: 'volt_house1', name: 'VOLTSPIRE HOUSE',
  backTo: 'voltspire_city', backX: 4, backY: 25,
  npcs: [{
    id: 'vh1', x: 5, y: 4, facing: 'down', sprite: 'npc_medic', movement: 'look',
    text: [
      'MEDIC: An AGÉNTMON that is SHORTED moves at half speed.',
      'MEDIC: A SURGE FILTER clears it right up.',
    ],
  }],
});

export const VOLT_HOUSE2 = makeHouse({
  id: 'volt_house2', name: 'VOLTSPIRE HOUSE',
  backTo: 'voltspire_city', backX: 27, backY: 25,
  npcs: [{
    id: 'vh2', x: 5, y: 4, facing: 'down', sprite: 'npc_engineer', movement: 'look',
    script: 'gift_rarechip',
    text: [
      'RETIRED ENGINEER: You remind me of myself at your age.',
      'RETIRED ENGINEER: Take this. It will push a partner one level further.',
    ],
  }],
});

// =========================================================================== //
// 6. Voltspire Gym (datacenter)
// =========================================================================== //
function gymVoltGrid(): Grid {
  const g = new Grid(17, 19, 'm');
  g.frame(0, 0, 17, 19, 'G');
  g.hline(0, 16, 1, 'G');
  g.set(8, 18, 'm');
  // Cable lanes leading to the leader.
  g.vline(8, 2, 17, 'b');
  g.hline(3, 13, 4, 'b');
  g.hline(3, 13, 9, 'b');
  g.hline(3, 13, 14, 'b');
  // Server rack maze.
  g.rect(2, 5, 4, 4, 'R');
  g.rect(11, 5, 4, 4, 'R');
  g.rect(2, 10, 4, 4, 'R');
  g.rect(11, 10, 4, 4, 'R');
  g.rect(6, 15, 2, 3, 'R');
  g.rect(9, 15, 2, 3, 'R');
  // Leader dais.
  g.rect(5, 2, 7, 2, 'N');
  g.rect(6, 2, 5, 1, 'b');
  g.set(8, 2, 'm');
  g.set(8, 3, 'm');
  return g;
}

export const GYM_VOLT: MapDef = {
  id: 'gym_volt',
  name: 'VOLTSPIRE DATACENTER',
  ground: gymVoltGrid().out(),
  legend: LEGEND,
  music: 'gym',
  outdoor: false,
  tint: '#102038',
  battleBackdrop: 'bg_datacenter',
  warps: [{ x: 8, y: 18, to: 'voltspire_city', tx: 21, ty: 12, facing: 'down', kind: 'door' }],
  npcs: [
    {
      id: 'gv_guard', x: 6, y: 14, facing: 'right', sprite: 'npc_guard', movement: 'static',
      trainer: 'gym1_a', sight: 3, name: 'SECURITY RIO',
      text: ['SECURITY RIO: Unauthorised engineer detected. Prepare for containment!'],
    },
    {
      id: 'gv_tech', x: 10, y: 9, facing: 'left', sprite: 'npc_technician', movement: 'static',
      trainer: 'gym1_b', sight: 3, name: 'TECH ORLA',
      text: ['TECH ORLA: Nobody reaches NOVA without passing a load test.'],
    },
    {
      id: 'gv_eng', x: 6, y: 5, facing: 'right', sprite: 'npc_engineer', movement: 'static',
      trainer: 'gym1_c', sight: 3, name: 'ENGINEER KAI',
      text: ['ENGINEER KAI: Amps up! Let us see your throughput.'],
    },
    {
      id: 'gv_intern', x: 10, y: 12, facing: 'left', sprite: 'npc_kid', movement: 'static',
      trainer: 'gym1_d', sight: 4, name: 'INTERN PIP',
      text: ['INTERN PIP: I only started last week, but I have been studying!'],
    },
    {
      id: 'gv_medic', x: 12, y: 16, facing: 'left', sprite: 'npc_medic', movement: 'look',
      name: 'GYM MEDIC', script: 'gym_medic',
    },
    {
      id: 'gv_aide', x: 4, y: 16, facing: 'right', sprite: 'npc_clerk', movement: 'look',
      name: 'GYM AIDE', script: 'gift_gym1_aid',
    },
    {
      id: 'gv_leader', x: 8, y: 3, facing: 'down', sprite: 'leader_volt', movement: 'static',
      trainer: 'gym1_leader', name: 'LEADER NOVA', script: 'gym1_leader',
      text: ['LEADER NOVA: Welcome to my datacenter. Mind the voltage.'],
    },
  ],
  signs: [
    { x: 3, y: 16, text: ['VOLTSPIRE DATACENTER', 'LEADER: NOVA', 'The Grid That Never Sleeps'] },
  ],
};

// =========================================================================== //
// 7. Route 2 + Cachewood Forest
// =========================================================================== //
function route2Grid(): Grid {
  const g = new Grid(40, 22, '.');
  g.scatter(',', 200, 91).scatter("'", 140, 97);
  g.rect(0, 0, 40, 2, 'T');
  g.rect(0, 20, 40, 2, 'T');
  g.rect(0, 0, 1, 22, 'T');
  g.rect(39, 0, 1, 22, 'T');
  g.rect(0, 11, 1, 2, '-');
  g.rect(39, 10, 1, 2, '-');
  // Main road east-west.
  g.rect(1, 11, 14, 2, '-');
  g.rect(13, 5, 2, 8, '-');
  g.rect(13, 5, 14, 2, '-');
  g.rect(25, 5, 2, 6, '-');
  g.rect(25, 10, 15, 2, '-');
  // Grass fields.
  g.rect(3, 14, 8, 5, '"');
  g.rect(17, 8, 6, 4, '"');
  g.rect(28, 13, 8, 6, '"');
  g.rect(30, 2, 7, 6, '"');
  g.rect(4, 4, 7, 5, '"');
  // Ledges + water.
  g.hline(16, 22, 12, 'L');
  g.hline(3, 10, 13, 'L');
  g.rect(19, 15, 7, 4, '~');
  g.hline(19, 25, 15, '_');
  g.rect(18, 14, 9, 1, 's');
  g.scatter('O', 16, 101);
  g.scatter('f', 20, 103);
  g.scatter('g', 16, 107);
  g.hline(28, 35, 12, 'F');
  g.set(3, 10, 'S');
  g.set(36, 12, 'S');
  return g;
}

export const ROUTE2: MapDef = {
  id: 'route2',
  name: 'ROUTE 2',
  ground: route2Grid().out(),
  legend: LEGEND,
  music: 'route',
  outdoor: true,
  weather: 'rain',
  battleBackdrop: 'bg_road',
  warps: [
    { x: 0, y: 11, to: 'voltspire_city', tx: 29, ty: 12, facing: 'left' },
    { x: 0, y: 12, to: 'voltspire_city', tx: 29, ty: 13, facing: 'left' },
    { x: 39, y: 10, to: 'cachewood', tx: 13, ty: 28, facing: 'right' },
    { x: 39, y: 11, to: 'cachewood', tx: 13, ty: 29, facing: 'right' },
  ],
  signs: [
    { x: 3, y: 10, text: ['ROUTE 2', 'VOLTSPIRE CITY - CACHEWOOD'] },
    { x: 36, y: 12, text: ['CACHEWOOD ahead.', 'Dense canopy. Signal is patchy - watch your step.'] },
  ],
  items: [
    { id: 'r2_super', x: 34, y: 4, item: 'superpatch', count: 1 },
    { id: 'r2_core', x: 6, y: 17, item: 'hypercore', count: 2 },
    { id: 'r2_esc', x: 22, y: 9, item: 'smokebomb', count: 1 },
  ],
  npcs: [
    {
      id: 'r2_t1', x: 16, y: 6, facing: 'down', sprite: 'npc_kid', movement: 'static',
      trainer: 'r2_kid', sight: 4, name: 'ROOKIE TAM',
      text: ['ROOKIE TAM: I have been waiting all day for a challenger!'],
    },
    {
      id: 'r2_t2', x: 29, y: 11, facing: 'up', sprite: 'npc_technician', movement: 'static',
      trainer: 'r2_tech', sight: 4, name: 'TECH BRAN',
      text: ['TECH BRAN: Field diagnostics time. Show me your build.'],
    },
    {
      id: 'r2_t3', x: 8, y: 13, facing: 'down', sprite: 'npc_engineer', movement: 'static',
      trainer: 'r2_eng', sight: 3, name: 'ENGINEER SOL',
      text: ['ENGINEER SOL: Two agents, no excuses. Go.'],
    },
  ],
  encounters: [
    { species: 'voltling', min: 8, max: 12, weight: 18 },
    { species: 'figlet', min: 8, max: 12, weight: 18 },
    { species: 'dronelet', min: 9, max: 13, weight: 16 },
    { species: 'pupboot', min: 9, max: 13, weight: 14 },
    { species: 'bugbyte', min: 9, max: 13, weight: 12 },
    { species: 'boltkin', min: 10, max: 13, weight: 10 },
    { species: 'fanlet', min: 10, max: 14, weight: 8 },
    { species: 'chassik', min: 11, max: 14, weight: 4 },
    { species: 'stackchan', min: 10, max: 13, weight: 6 },
    { species: 'spot', min: 10, max: 13, weight: 5 },
  ],
};

function cachewoodGrid(): Grid {
  const g = new Grid(28, 32, '.');
  g.scatter(',', 220, 111).scatter("'", 180, 117);
  g.fill('.');
  g.scatter(',', 240, 111);
  // Dense canopy border.
  g.rect(0, 0, 28, 2, 'T');
  g.rect(0, 30, 28, 2, 'T');
  g.rect(0, 0, 2, 32, 'T');
  g.rect(26, 0, 2, 32, 'T');
  // Winding forest track (kept walkable), everything else is grass/trees.
  g.rect(2, 2, 24, 28, '"');
  const track: [number, number, number, number][] = [
    [12, 26, 4, 4], [6, 26, 8, 2], [6, 20, 2, 8], [6, 20, 12, 2],
    [16, 14, 2, 8], [8, 14, 10, 2], [8, 8, 2, 8], [8, 8, 12, 2],
    [18, 3, 2, 7], [12, 3, 8, 2],
  ];
  for (const [x, y, w, h] of track) g.rect(x, y, w, h, '=');
  // Tree clumps to make it feel like a maze.
  const clumps: [number, number, number, number][] = [
    [3, 4, 3, 3], [21, 5, 3, 4], [3, 11, 3, 4], [21, 12, 3, 5],
    [11, 11, 4, 2], [3, 24, 2, 4], [22, 22, 3, 5], [11, 22, 4, 2],
    [18, 27, 3, 2], [14, 5, 3, 2],
  ];
  for (const [x, y, w, h] of clumps) g.rect(x, y, w, h, 'T');
  g.rect(13, 30, 2, 2, '=');
  g.rect(12, 0, 2, 2, '=');
  g.scatter('O', 12, 121);
  g.scatter('h', 18, 127);
  g.set(15, 27, 'S');
  return g;
}

export const CACHEWOOD: MapDef = {
  id: 'cachewood',
  name: 'CACHEWOOD',
  ground: cachewoodGrid().out(),
  legend: LEGEND,
  music: 'forest',
  outdoor: true,
  tint: '#0c2410',
  weather: 'fog',
  battleBackdrop: 'bg_grass',
  warps: [
    { x: 13, y: 31, to: 'route2', tx: 38, ty: 10, facing: 'down' },
    { x: 14, y: 31, to: 'route2', tx: 38, ty: 11, facing: 'down' },
    { x: 12, y: 0, to: 'silica_town', tx: 14, ty: 24, facing: 'up' },
    { x: 13, y: 0, to: 'silica_town', tx: 15, ty: 24, facing: 'up' },
  ],
  signs: [{ x: 15, y: 27, text: ['CACHEWOOD', 'Beware: stale data lurks in the undergrowth.'] }],
  items: [
    { id: 'cw_ppc', x: 4, y: 8, item: 'ppcell', count: 1 },
    { id: 'cw_anti', x: 24, y: 19, item: 'antivirus', count: 2 },
    { id: 'cw_chip', x: 24, y: 3, item: 'rarechip', count: 1 },
  ],
  npcs: [
    {
      id: 'cw_t1', x: 7, y: 21, facing: 'right', sprite: 'npc_kid', movement: 'static',
      trainer: 'cw_kid1', sight: 4, name: 'SCOUT NIM',
      text: ['SCOUT NIM: Lost? Everyone gets lost in CACHEWOOD.'],
    },
    {
      id: 'cw_t2', x: 17, y: 15, facing: 'left', sprite: 'npc_engineer', movement: 'static',
      trainer: 'cw_eng', sight: 4, name: 'ENGINEER VEX',
      text: ['ENGINEER VEX: My units feed on corrupted packets. Careful.'],
    },
    {
      id: 'cw_t3', x: 9, y: 9, facing: 'down', sprite: 'npc_technician', movement: 'static',
      trainer: 'cw_tech', sight: 3, name: 'TECH DELL',
      text: ['TECH DELL: I patrol these woods. State your business.'],
    },
    {
      id: 'cw_npc', x: 19, y: 5, facing: 'down', sprite: 'npc_medic', movement: 'look',
      script: 'gift_fullreset',
      text: [
        'FIELD MEDIC: You look beaten up. Here, take a FULL RESET.',
        'FIELD MEDIC: SILICA TOWN is just north of here.',
      ],
    },
  ],
  encounters: [
    { species: 'bugbyte', min: 12, max: 16, weight: 20 },
    { species: 'reachlet', min: 12, max: 16, weight: 16 },
    { species: 'stackbit', min: 13, max: 17, weight: 15 },
    { species: 'roombit', min: 13, max: 17, weight: 13 },
    { species: 'dronelet', min: 13, max: 17, weight: 12 },
    { species: 'cryobit', min: 14, max: 18, weight: 10 },
    { species: 'figlet', min: 14, max: 18, weight: 8 },
    { species: 'malwarm', min: 16, max: 18, weight: 6 },
    { species: 'reachymini', min: 13, max: 17, weight: 12 },
    { species: 'stackchan', min: 14, max: 18, weight: 8 },
    { species: 'beni', min: 13, max: 17, weight: 7 },
    { species: 'loona', min: 14, max: 18, weight: 6 },
  ],
};

// =========================================================================== //
// 8. Silica Town + Gym 2
// =========================================================================== //
function silicaGrid(): Grid {
  const g = new Grid(28, 26, '.');
  g.scatter(',', 130, 131);
  g.rect(0, 0, 28, 2, 'T');
  g.rect(0, 24, 28, 2, 'T');
  g.rect(0, 0, 2, 26, 'T');
  g.rect(26, 0, 2, 26, 'T');
  g.rect(14, 24, 2, 2, '-');
  g.rect(14, 0, 2, 2, '-');
  g.rect(2, 12, 24, 3, '#');
  g.rect(14, 2, 3, 24, '#');
  g.rect(4, 5, 20, 2, '#');
  g.rect(4, 19, 20, 2, '#');
  g.rect(5, 5, 2, 16, '#');
  g.rect(22, 5, 2, 16, '#');
  // Snowy northern flavour and a frozen pool.
  g.rect(2, 2, 24, 3, 'n');
  g.rect(18, 16, 5, 3, '~');
  g.hline(18, 22, 16, '_');
  g.scatter('n', 40, 137, { x: 2, y: 2, w: 24, h: 6 });
  g.scatter('h', 12, 141, { x: 3, y: 16, w: 3, h: 6 });
  g.scatter('O', 8, 147, { x: 24, y: 21, w: 2, h: 3 });
  g.set(13, 23, 'S');
  g.set(13, 11, 'S');
  g.set(17, 11, 'S');
  return g;
}

const siClinic = building('clinic', 3, 8, 5, 4, 2, 'repairbay_silica', 7, 10);
const siShop = building('shop', 9, 8, 5, 4, 2, 'mart_silica', 6, 9);
const siGym = building('gym_datacenter', 18, 6, 7, 6, 3, 'gym_data', 8, 16);
const siHouse = building('house_large', 3, 19, 5, 4, 2, 'silica_house', 5, 8);

export const SILICA_TOWN: MapDef = {
  id: 'silica_town',
  name: 'SILICA TOWN',
  ground: silicaGrid().out(),
  legend: LEGEND,
  music: 'city',
  outdoor: true,
  battleBackdrop: 'bg_city',
  objects: [siClinic.obj, siShop.obj, siGym.obj, siHouse.obj],
  warps: [
    siClinic.warp, siShop.warp, siGym.warp, siHouse.warp,
    { x: 14, y: 25, to: 'cachewood', tx: 12, ty: 1, facing: 'down' },
    { x: 15, y: 25, to: 'cachewood', tx: 13, ty: 1, facing: 'down' },
    { x: 14, y: 0, to: 'route3', tx: 11, ty: 32, facing: 'up' },
    { x: 15, y: 0, to: 'route3', tx: 12, ty: 32, facing: 'up' },
  ],
  signs: [
    { x: 13, y: 23, text: ['SILICA TOWN', 'Cold storage for a warming world.'] },
    { x: 13, y: 11, text: ['REPAIR BAY', 'Free diagnostics, hot coffee optional.'] },
    { x: 17, y: 11, text: ['SILICA DATACENTER GYM', 'LEADER: FROST', 'Specialty: CRYO'] },
  ],
  npcs: [
    {
      id: 'si_tech', x: 17, y: 13, facing: 'down', sprite: 'npc_technician', movement: 'look',
      text: [
        'TECHNICIAN: FROST keeps his floor at four degrees.',
        'TECHNICIAN: CRYO units slow everything down. Hit them hard and fast.',
      ],
    },
    {
      id: 'si_kid', x: 10, y: 17, facing: 'right', sprite: 'npc_kid', movement: 'wander',
      text: ['KID: A THERMAL type would melt right through this gym!'],
    },
    {
      id: 'si_guard', x: 14, y: 1, facing: 'down', sprite: 'npc_guard', movement: 'static',
      script: 'route3_block', hideIfFlag: 'badge_cryo',
      text: [
        'GUARD: ROUTE 3 climbs into the cooling highlands.',
        'GUARD: Only badge holders are cleared to pass.',
      ],
    },
  ],
};

export const REPAIRBAY_SILICA = makeRepairBay({
  id: 'repairbay_silica', name: 'SILICA REPAIR BAY',
  backTo: 'silica_town', backX: 5, backY: 12,
  extraNpcs: [{
    id: 'rb_s_npc', x: 11, y: 7, facing: 'left', sprite: 'npc_engineer', movement: 'look',
    text: ['ENGINEER: Evolution usually triggers on a level up. Keep them battling!'],
  }],
});

export const MART_SILICA = makeMart({
  id: 'mart_silica', name: 'SILICA MART',
  backTo: 'silica_town', backX: 11, backY: 12,
  stock: ['nanocore', 'hypercore', 'superpatch', 'antivirus', 'deicer', 'fullreset', 'superjammer', 'overclock'],
});

export const SILICA_HOUSE = makeHouse({
  id: 'silica_house', name: 'SILICA HOUSE',
  backTo: 'silica_town', backX: 5, backY: 23,
  npcs: [{
    id: 'sh1', x: 5, y: 4, facing: 'down', sprite: 'npc_medic', movement: 'look',
    text: [
      'RESEARCHER: A FROZEN unit cannot act at all until it thaws.',
      'RESEARCHER: Carry a DE-ICER before you challenge FROST.',
    ],
  }],
});

function gymDataGrid(): Grid {
  const g = new Grid(17, 19, 'm');
  g.frame(0, 0, 17, 19, 'G');
  g.hline(0, 16, 1, 'G');
  g.set(8, 18, 'm');
  // Frozen glass lanes.
  g.vline(8, 2, 17, 'b');
  g.rect(1, 6, 15, 1, 'b');
  g.rect(1, 12, 15, 1, 'b');
  // Rack pillars in a diamond pattern.
  const pillars: [number, number][] = [
    [3, 3], [13, 3], [5, 8], [11, 8], [3, 15], [13, 15], [8, 10],
  ];
  for (const [x, y] of pillars) g.rect(x - 1, y - 1, 3, 3, 'R');
  g.rect(5, 2, 7, 2, 'N');
  g.set(8, 2, 'm');
  g.set(8, 3, 'm');
  g.rect(2, 16, 3, 2, 'R');
  g.rect(12, 16, 3, 2, 'R');
  return g;
}

export const GYM_DATA: MapDef = {
  id: 'gym_data',
  name: 'SILICA DATACENTER',
  ground: gymDataGrid().out(),
  legend: LEGEND,
  music: 'gym',
  outdoor: false,
  tint: '#0e2a3c',
  battleBackdrop: 'bg_datacenter',
  warps: [{ x: 8, y: 18, to: 'silica_town', tx: 21, ty: 12, facing: 'down', kind: 'door' }],
  npcs: [
    {
      id: 'gd_1', x: 6, y: 15, facing: 'right', sprite: 'npc_technician', movement: 'static',
      trainer: 'gym2_a', sight: 4, name: 'TECH BRIS',
      text: ['TECH BRIS: Mind the frost. It gets in the joints.'],
    },
    {
      id: 'gd_2', x: 11, y: 10, facing: 'right', sprite: 'npc_guard', movement: 'static',
      trainer: 'gym2_b', sight: 4, name: 'SECURITY IKO',
      text: ['SECURITY IKO: Cold storage means nothing gets out.'],
    },
    {
      id: 'gd_3', x: 5, y: 6, facing: 'right', sprite: 'npc_engineer', movement: 'static',
      trainer: 'gym2_c', sight: 3, name: 'ENGINEER MAE',
      text: ['ENGINEER MAE: Freeze first, ask questions later.'],
    },
    {
      id: 'gd_4', x: 11, y: 4, facing: 'left', sprite: 'npc_kid', movement: 'static',
      trainer: 'gym2_d', sight: 3, name: 'ANALYST VELA',
      text: ['ANALYST VELA: I log every challenger. Give me a good row of data.'],
    },
    {
      id: 'gd_medic', x: 10, y: 17, facing: 'left', sprite: 'npc_medic', movement: 'look',
      name: 'GYM MEDIC', script: 'gym_medic',
    },
    {
      id: 'gd_aide', x: 6, y: 17, facing: 'right', sprite: 'npc_clerk', movement: 'look',
      name: 'GYM AIDE', script: 'gift_gym2_aid',
    },
    {
      id: 'gd_leader', x: 8, y: 3, facing: 'down', sprite: 'leader_cryo', movement: 'static',
      trainer: 'gym2_leader', name: 'LEADER FROST', script: 'gym2_leader',
      text: ['LEADER FROST: Four degrees. Perfect operating temperature.'],
    },
  ],
  signs: [{ x: 3, y: 16, text: ['SILICA DATACENTER', 'LEADER: FROST', 'Absolute Zero Downtime'] }],
};

// =========================================================================== //
// 9. Route 3 + Terraflux City + Gym 3
// =========================================================================== //
function route3Grid(): Grid {
  const g = new Grid(24, 34, '.');
  g.scatter(',', 190, 151).scatter("'", 130, 157);
  g.rect(0, 0, 24, 2, 'T');
  g.rect(0, 32, 24, 2, 'T');
  g.rect(0, 0, 2, 34, 'T');
  g.rect(22, 0, 2, 34, 'T');
  g.rect(11, 32, 2, 2, '-');
  g.rect(11, 0, 2, 2, '-');
  // Switchback climb.
  g.rect(11, 26, 2, 8, '-');
  g.rect(4, 24, 9, 2, '-');
  g.rect(4, 18, 2, 8, '-');
  g.rect(4, 18, 15, 2, '-');
  g.rect(17, 10, 2, 10, '-');
  g.rect(6, 10, 13, 2, '-');
  g.rect(6, 2, 2, 9, '-');
  g.rect(6, 2, 7, 2, '-');
  g.rect(11, 2, 2, 3, '-');
  // Terrain.
  g.rect(2, 2, 20, 6, 'n');
  g.rect(14, 27, 7, 5, '"');
  g.rect(6, 20, 5, 3, '"');
  g.rect(8, 12, 8, 5, '"');
  g.rect(14, 4, 7, 4, '"');
  g.hline(6, 10, 25, 'L');
  g.hline(14, 18, 17, 'L');
  g.rect(2, 28, 6, 3, '~');
  g.hline(2, 7, 28, '_');
  g.scatter('O', 22, 161);
  g.scatter('n', 30, 167, { x: 2, y: 2, w: 20, h: 8 });
  g.scatter('g', 14, 171, { x: 14, y: 20, w: 6, h: 6 });
  g.set(13, 30, 'S');
  g.set(10, 9, 'S');
  return g;
}

export const ROUTE3: MapDef = {
  id: 'route3',
  name: 'ROUTE 3',
  ground: route3Grid().out(),
  legend: LEGEND,
  music: 'route',
  outdoor: true,
  weather: 'storm',
  battleBackdrop: 'bg_road',
  warps: [
    { x: 11, y: 33, to: 'silica_town', tx: 14, ty: 1, facing: 'down' },
    { x: 12, y: 33, to: 'silica_town', tx: 15, ty: 1, facing: 'down' },
    { x: 11, y: 0, to: 'terraflux_city', tx: 15, ty: 26, facing: 'up' },
    { x: 12, y: 0, to: 'terraflux_city', tx: 16, ty: 26, facing: 'up' },
  ],
  signs: [
    { x: 13, y: 30, text: ['ROUTE 3', 'SILICA TOWN - TERRAFLUX CITY', 'Steep climb ahead.'] },
    { x: 10, y: 9, text: ['THERMAL VENT ZONE', 'Ambient temperature rising.'] },
  ],
  items: [
    { id: 'r3_hyper', x: 20, y: 30, item: 'hyperpatch', count: 1 },
    { id: 'r3_qc', x: 3, y: 15, item: 'quantumcore', count: 2 },
    { id: 'r3_pp', x: 19, y: 6, item: 'ppcellmax', count: 1 },
    { id: 'r3_rev', x: 9, y: 14, item: 'reflash', count: 1 },
  ],
  npcs: [
    {
      id: 'r3_t1', x: 13, y: 25, facing: 'left', sprite: 'npc_engineer', movement: 'static',
      trainer: 'r3_eng', sight: 4, name: 'ENGINEER RUE',
      text: ['ENGINEER RUE: The air up here is thin. My units run cooler.'],
    },
    {
      id: 'r3_t2', x: 5, y: 17, facing: 'down', sprite: 'npc_guard', movement: 'static',
      trainer: 'r3_guard', sight: 4, name: 'SECURITY OMAR',
      text: ['SECURITY OMAR: The CITADEL is closer than you think. Prove yourself.'],
    },
    {
      id: 'r3_t3', x: 16, y: 11, facing: 'up', sprite: 'npc_technician', movement: 'static',
      trainer: 'r3_tech', sight: 4, name: 'TECH ZEV',
      text: ['TECH ZEV: Heat is just energy nobody planned for.'],
    },
    {
      id: 'r3_rival', x: 11, y: 5, facing: 'down', sprite: 'rival', movement: 'static',
      trainer: 'rival_r3', name: 'REX', script: 'rival_r3', hideIfFlag: 'rivalR3Done',
      text: ['REX: Knew you would come this way. Round two!'],
    },
  ],
  encounters: [
    { species: 'fanlet', min: 18, max: 22, weight: 17 },
    { species: 'cryobit', min: 18, max: 22, weight: 16 },
    { species: 'canidrone', min: 19, max: 23, weight: 14 },
    { species: 'ampereon', min: 20, max: 24, weight: 13 },
    { species: 'optibrawn', min: 19, max: 23, weight: 12 },
    { species: 'figura', min: 20, max: 24, weight: 11 },
    { species: 'quadrotor', min: 21, max: 24, weight: 9 },
    { species: 'radiaton', min: 22, max: 25, weight: 5 },
    { species: 'qubitto', min: 22, max: 25, weight: 3 },
    { species: 'spot', min: 19, max: 23, weight: 9 },
    { species: 'optimus', min: 21, max: 24, weight: 7 },
    { species: 'figure03', min: 21, max: 24, weight: 6 },
    { species: 'unitree', min: 22, max: 25, weight: 4 },
    { species: 'beni', min: 19, max: 23, weight: 6 },
    { species: 'loona', min: 20, max: 24, weight: 5 },
    { species: 'emo', min: 21, max: 25, weight: 4 },
  ],
};

function terrafluxGrid(): Grid {
  const g = new Grid(32, 28, '.');
  g.scatter(',', 150, 181);
  g.rect(0, 0, 32, 2, 'T');
  g.rect(0, 26, 32, 2, 'T');
  g.rect(0, 0, 2, 28, 'T');
  g.rect(30, 0, 2, 28, 'T');
  g.rect(15, 26, 2, 2, '-');
  g.rect(15, 0, 2, 2, '#');
  g.rect(2, 13, 28, 3, '#');
  g.rect(15, 2, 3, 26, '#');
  g.rect(4, 6, 24, 2, '#');
  g.rect(4, 20, 24, 2, '#');
  g.rect(5, 6, 2, 16, '#');
  g.rect(24, 6, 2, 16, '#');
  g.rect(19, 17, 6, 3, '~');
  g.hline(19, 24, 17, '_');
  g.rect(2, 2, 28, 4, 's');
  g.scatter('p', 10, 187, { x: 3, y: 17, w: 10, h: 5 });
  g.scatter('O', 12, 191, { x: 24, y: 22, w: 5, h: 3 });
  g.set(14, 25, 'S');
  g.set(14, 12, 'S');
  g.set(18, 12, 'S');
  return g;
}

const tfClinic = building('clinic', 3, 9, 5, 4, 2, 'repairbay_terra', 7, 10);
const tfShop = building('shop', 9, 9, 5, 4, 2, 'mart_terra', 6, 9);
const tfGym = building('gym_datacenter', 19, 7, 7, 6, 3, 'gym_thermal', 8, 16);
const tfHouse = building('house_small', 3, 21, 4, 4, 1, 'terra_house', 5, 8);

export const TERRAFLUX_CITY: MapDef = {
  id: 'terraflux_city',
  name: 'TERRAFLUX CITY',
  ground: terrafluxGrid().out(),
  legend: LEGEND,
  music: 'city',
  outdoor: true,
  weather: 'ash',
  battleBackdrop: 'bg_city',
  objects: [tfClinic.obj, tfShop.obj, tfGym.obj, tfHouse.obj],
  warps: [
    tfClinic.warp, tfShop.warp, tfGym.warp, tfHouse.warp,
    { x: 15, y: 27, to: 'route3', tx: 11, ty: 1, facing: 'down' },
    { x: 16, y: 27, to: 'route3', tx: 12, ty: 1, facing: 'down' },
    { x: 15, y: 0, to: 'citadel', tx: 12, ty: 30, facing: 'up', requiresFlag: 'badge_thermal' },
    { x: 16, y: 0, to: 'citadel', tx: 13, ty: 30, facing: 'up', requiresFlag: 'badge_thermal' },
  ],
  signs: [
    { x: 14, y: 25, text: ['TERRAFLUX CITY', 'Built on the heat everyone else throws away.'] },
    { x: 14, y: 12, text: ['REPAIR BAY', 'Open 24 hours.'] },
    { x: 18, y: 12, text: ['TERRAFLUX DATACENTER GYM', 'LEADER: PYRA', 'Specialty: THERMAL'] },
  ],
  npcs: [
    {
      id: 'tf_guard', x: 15, y: 1, facing: 'down', sprite: 'npc_guard', movement: 'static',
      script: 'citadel_block', hideIfFlag: 'badge_thermal',
      text: [
        'GUARD: The CORE CITADEL is beyond this gate.',
        'GUARD: Three badges minimum. No exceptions.',
      ],
    },
    {
      id: 'tf_eng', x: 11, y: 18, facing: 'up', sprite: 'npc_engineer', movement: 'look',
      text: [
        'ENGINEER: PYRA runs her racks at the edge of thermal throttling.',
        'ENGINEER: Bring CRYO units or bring a lot of COOLANT.',
      ],
    },
    {
      id: 'tf_kid', x: 22, y: 21, facing: 'left', sprite: 'npc_kid', movement: 'wander',
      text: ['KID: The whole city is heated by the datacenter. Cool, right?'],
    },
  ],
};

export const REPAIRBAY_TERRA = makeRepairBay({
  id: 'repairbay_terra', name: 'TERRAFLUX REPAIR BAY',
  backTo: 'terraflux_city', backX: 5, backY: 13,
});

export const MART_TERRA = makeMart({
  id: 'mart_terra', name: 'TERRAFLUX MART',
  backTo: 'terraflux_city', backX: 11, backY: 13,
  stock: ['nanocore', 'hypercore', 'quantumcore', 'hyperpatch', 'fullreset', 'reflash', 'coolant', 'superjammer', 'overclock', 'hardening'],
});

export const TERRA_HOUSE = makeHouse({
  id: 'terra_house', name: 'TERRAFLUX HOUSE',
  backTo: 'terraflux_city', backX: 4, backY: 25,
  npcs: [{
    id: 'th1', x: 5, y: 4, facing: 'down', sprite: 'npc_engineer', movement: 'look',
    script: 'gift_toolkit',
    text: [
      'OLD ENGINEER: You made it this far? Then take my old FIELD TOOLKIT.',
      'OLD ENGINEER: It will get you through the cable bundles in the CITADEL.',
    ],
  }],
});

function gymThermalGrid(): Grid {
  const g = new Grid(19, 21, 'm');
  g.frame(0, 0, 19, 21, 'G');
  g.hline(0, 18, 1, 'G');
  g.set(9, 20, 'm');
  g.vline(9, 2, 19, 'b');
  // Hot aisle / cold aisle containment: long rack rows with narrow gaps.
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * 4;
    g.rect(1, y, 7, 2, 'R');
    g.rect(11, y, 7, 2, 'R');
    if (i % 2 === 0) { g.rect(1, y, 1, 2, 'b'); g.rect(17, y, 1, 2, 'b'); }
  }
  g.rect(6, 2, 7, 2, 'N');
  g.set(9, 2, 'm');
  g.set(9, 3, 'm');
  g.hline(1, 17, 7, 'b');
  g.hline(1, 17, 15, 'b');
  g.rect(2, 18, 3, 2, 'R');
  g.rect(14, 18, 3, 2, 'R');
  return g;
}

export const GYM_THERMAL: MapDef = {
  id: 'gym_thermal',
  name: 'TERRAFLUX DATACENTER',
  ground: gymThermalGrid().out(),
  legend: LEGEND,
  music: 'gym',
  outdoor: false,
  tint: '#301418',
  battleBackdrop: 'bg_datacenter',
  warps: [{ x: 9, y: 20, to: 'terraflux_city', tx: 22, ty: 13, facing: 'down', kind: 'door' }],
  npcs: [
    {
      id: 'gt_1', x: 7, y: 15, facing: 'right', sprite: 'npc_technician', movement: 'static',
      trainer: 'gym3_a', sight: 4, name: 'TECH HALE',
      text: ['TECH HALE: Hot aisle. Mind the exhaust.'],
    },
    {
      id: 'gt_2', x: 11, y: 11, facing: 'left', sprite: 'npc_guard', movement: 'static',
      trainer: 'gym3_b', sight: 4, name: 'SECURITY DRAY',
      text: ['SECURITY DRAY: Turn back or burn out.'],
    },
    {
      id: 'gt_3', x: 7, y: 7, facing: 'right', sprite: 'npc_engineer', movement: 'static',
      trainer: 'gym3_c', sight: 4, name: 'ENGINEER SIRA',
      text: ['ENGINEER SIRA: My units thrive at ninety degrees.'],
    },
    {
      id: 'gt_4', x: 10, y: 5, facing: 'left', sprite: 'npc_technician', movement: 'static',
      trainer: 'gym3_d', sight: 2, name: 'HANDLER TOR',
      text: ['HANDLER TOR: My units carry racks all day. Yours carry what, exactly?'],
    },
    {
      id: 'gt_medic', x: 11, y: 19, facing: 'left', sprite: 'npc_medic', movement: 'look',
      name: 'GYM MEDIC', script: 'gym_medic',
    },
    {
      id: 'gt_aide', x: 7, y: 19, facing: 'right', sprite: 'npc_clerk', movement: 'look',
      name: 'GYM AIDE', script: 'gift_gym3_aid',
    },
    {
      id: 'gt_leader', x: 9, y: 3, facing: 'down', sprite: 'leader_thermal', movement: 'static',
      trainer: 'gym3_leader', name: 'LEADER PYRA', script: 'gym3_leader',
      text: ['LEADER PYRA: You are hotter than you look. Let us see if you can take the heat.'],
    },
  ],
  signs: [{ x: 3, y: 18, text: ['TERRAFLUX DATACENTER', 'LEADER: PYRA', 'Waste Nothing, Not Even Heat'] }],
};

// =========================================================================== //
// 10. Core Citadel (endgame)
// =========================================================================== //
function citadelGrid(): Grid {
  const g = new Grid(25, 32, 'm');
  g.frame(0, 0, 25, 32, 'G');
  g.hline(0, 24, 1, 'G');
  g.rect(11, 30, 2, 2, 'm');
  g.set(12, 31, 'm');
  // Central spine.
  g.vline(12, 2, 30, 'b');
  g.hline(4, 20, 26, 'b');
  g.hline(4, 20, 20, 'b');
  g.hline(4, 20, 14, 'b');
  g.hline(4, 20, 8, 'b');
  // Sparking conduit plates - the citadel's 'tall grass'.
  g.scatter('X', 60, 911, { x: 1, y: 7, w: 23, h: 23 });
  // Rack blocks.
  const blocks: [number, number][] = [
    [3, 22], [17, 22], [3, 16], [17, 16], [3, 10], [17, 10], [8, 27], [14, 27],
    [8, 17], [14, 17], [8, 11], [14, 11],
  ];
  for (const [x, y] of blocks) g.rect(x, y, 4, 3, 'R');
  // Throne floor.
  g.rect(6, 2, 13, 5, 'N');
  g.rect(8, 3, 9, 3, 'm');
  g.vline(12, 2, 7, 'b');
  g.rect(2, 4, 3, 3, 'R');
  g.rect(20, 4, 3, 3, 'R');
  return g;
}

export const CITADEL: MapDef = {
  id: 'citadel',
  name: 'CORE CITADEL',
  ground: citadelGrid().out(),
  legend: LEGEND,
  music: 'citadel',
  outdoor: false,
  tint: '#160e2c',
  battleBackdrop: 'bg_cave',
  warps: [
    { x: 11, y: 31, to: 'terraflux_city', tx: 15, ty: 1, facing: 'down', kind: 'door' },
    { x: 12, y: 31, to: 'terraflux_city', tx: 16, ty: 1, facing: 'down', kind: 'door' },
  ],
  items: [
    { id: 'ct_max', x: 4, y: 25, item: 'reflashmax', count: 1 },
    { id: 'ct_full', x: 20, y: 13, item: 'fullpatch', count: 2 },
    { id: 'ct_master', x: 2, y: 3, item: 'masterkey', count: 1 },
  ],
  npcs: [
    {
      id: 'ct_1', x: 10, y: 26, facing: 'right', sprite: 'npc_guard', movement: 'static',
      trainer: 'elite_a', sight: 5, name: 'SENTINEL VASH',
      text: ['SENTINEL VASH: The CITADEL does not open for badges alone.'],
    },
    {
      id: 'ct_2', x: 14, y: 20, facing: 'left', sprite: 'npc_technician', movement: 'static',
      trainer: 'elite_b', sight: 5, name: 'ARCHITECT LUN',
      text: ['ARCHITECT LUN: I designed every rack on this floor.'],
    },
    {
      id: 'ct_3', x: 9, y: 14, facing: 'right', sprite: 'npc_engineer', movement: 'static',
      trainer: 'elite_c', sight: 5, name: 'OVERSEER KATE',
      text: ['OVERSEER KATE: Impressive. Now show me depth.'],
    },
    {
      id: 'ct_rival', x: 12, y: 9, facing: 'down', sprite: 'rival', movement: 'static',
      trainer: 'rival_final', name: 'REX', script: 'rival_final', hideIfFlag: 'rivalFinalDone',
      text: ['REX: I have been waiting my whole life for this battle.'],
    },
    {
      id: 'ct_champ', x: 12, y: 4, facing: 'down', sprite: 'champion', movement: 'static',
      trainer: 'champion', name: 'CHAMPION ADA', script: 'champion',
      text: ['PROF. ADA: I did wonder which of you would arrive first.'],
    },
  ],
  signs: [
    { x: 3, y: 28, text: ['CORE CITADEL', 'Only the strongest engineers reach the top floor.'] },
  ],
  encounters: [
    { species: 'malwarm', min: 26, max: 30, weight: 22 },
    { species: 'vaculo', min: 26, max: 30, weight: 20 },
    { species: 'glaciarc', min: 27, max: 31, weight: 16 },
    { species: 'qubitto', min: 27, max: 31, weight: 15 },
    { species: 'quadrotor', min: 28, max: 32, weight: 13 },
    { species: 'optibrawn', min: 28, max: 32, weight: 10 },
    { species: 'entangl', min: 32, max: 34, weight: 3 },
    { species: 'agentzero', min: 40, max: 40, weight: 1 },
    { species: 'neo', min: 28, max: 32, weight: 8 },
    { species: 'unitree', min: 28, max: 32, weight: 6 },
    { species: 'optimus', min: 29, max: 33, weight: 6 },
    { species: 'figure03', min: 29, max: 33, weight: 5 },
    { species: 'spotarm', min: 30, max: 34, weight: 5 },
    { species: 'emo', min: 28, max: 32, weight: 7 },
    { species: 'loona', min: 29, max: 33, weight: 5 },
  ],
};

// =========================================================================== //
export const ALL_MAPS: MapDef[] = [
  HOME_BEDROOM, HOME_GROUND, NULLBYTE_TOWN, RIVAL_HOUSE, LAB_ADA,
  ROUTE1, VOLTSPIRE_CITY, REPAIRBAY_VOLT, MART_VOLT, VOLT_HOUSE1, VOLT_HOUSE2, GYM_VOLT,
  ROUTE2, CACHEWOOD, SILICA_TOWN, REPAIRBAY_SILICA, MART_SILICA, SILICA_HOUSE, GYM_DATA,
  ROUTE3, TERRAFLUX_CITY, REPAIRBAY_TERRA, MART_TERRA, TERRA_HOUSE, GYM_THERMAL, CITADEL,
];

const BY_ID = new Map(ALL_MAPS.map((m) => [m.id, m]));

export function getMap(id: string): MapDef {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

/**
 * Every localisable line in the game's maps, for the catalogue extractor.
 *
 * Map data is built at import time, so translating it in place would freeze the
 * language at boot. The data stays English and the overworld localises it as it
 * displays it (`localizeLines`, and `t(def.name)` for the banner).
 */
export function mapStrings(): string[] {
  const out: string[] = [];
  for (const m of ALL_MAPS) {
    out.push(m.name);
    for (const s of m.signs ?? []) out.push(...s.text);
    for (const n of m.npcs ?? []) out.push(...(n.text ?? []));
  }
  return out;
}

export function mapExists(id: string): boolean {
  return BY_ID.has(id);
}
