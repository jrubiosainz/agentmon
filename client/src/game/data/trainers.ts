/** Trainer rosters, prize money and battle dialogue. */

import { t } from '../i18n.ts';

export interface TrainerMon {
  species: string;
  level: number;
  moves?: string[];
}

export interface TrainerDef {
  key: string;
  name: string;
  /** Battle portrait key in the trainer atlas. */
  sprite: string;
  /** Money = payout * level of last mon. */
  payout: number;
  team: TrainerMon[];
  intro: string[];
  defeat: string[];
  after: string[];
  /** Leaders hand out a badge flag. */
  badge?: { flag: string; name: string; item?: string };
  music?: string;
  /** Leaders refuse the challenge until every key here has a `beat:` flag. */
  requires?: string[];
  /** AI quality: 0 random, 1 prefers damage, 2 full type-aware planning. */
  ai?: 0 | 1 | 2;
}

const T = (
  key: string, name: string, sprite: string, payout: number,
  team: TrainerMon[], intro: string, defeat: string, after: string,
  extra: Partial<TrainerDef> = {},
): TrainerDef => ({
  key, name, sprite, payout, team,
  intro: [intro], defeat: [defeat], after: [after],
  ai: 1, ...extra,
});

export const TRAINERS: Record<string, TrainerDef> = {
  // --- Route 1 -------------------------------------------------------------
  r1_kid: T('r1_kid', 'ROOKIE JAMIE', 'trainer_kid', 24,
    [{ species: 'pupboot', level: 5 }, { species: 'voltling', level: 5 }],
    'ROOKIE JAMIE: My unit and I have been training all morning!',
    'ROOKIE JAMIE: Aww, we ran out of charge...',
    'ROOKIE JAMIE: I am going to train even harder next time!'),

  r1_eng: T('r1_eng', 'ENGINEER PIA', 'trainer_engineer', 40,
    [{ species: 'chassik', level: 6 }, { species: 'roombit', level: 7 }],
    'ENGINEER PIA: Let us benchmark your agent against mine.',
    'ENGINEER PIA: Your throughput is better than mine. Nice work.',
    'ENGINEER PIA: Tune your movesets. Coverage beats raw power.'),

  // --- Voltspire Gym -------------------------------------------------------
  gym1_a: T('gym1_a', 'SECURITY RIO', 'trainer_guard', 48,
    [{ species: 'voltling', level: 10 }, { species: 'roombit', level: 10 }],
    'SECURITY RIO: Unauthorised engineer detected. Prepare for containment!',
    'SECURITY RIO: Clearance... granted.',
    'SECURITY RIO: Proceed. But do not touch anything.'),

  gym1_b: T('gym1_b', 'TECH ORLA', 'trainer_technician', 52,
    [{ species: 'voltling', level: 11 }, { species: 'chassik', level: 11 }],
    'TECH ORLA: Nobody reaches NOVA without passing a load test.',
    'TECH ORLA: You held under load. Impressive.',
    'TECH ORLA: NOVA is at the far end. Good luck.'),

  gym1_c: T('gym1_c', 'ENGINEER KAI', 'trainer_engineer', 56,
    [{ species: 'dronelet', level: 11 }, { species: 'voltling', level: 12 }],
    'ENGINEER KAI: Amps up! Let us see your throughput.',
    'ENGINEER KAI: Right, you earned that.',
    'ENGINEER KAI: VOLT moves can SHORT your units. Watch out.'),

  gym1_d: T('gym1_d', 'INTERN PIP', 'trainer_kid', 44,
    [{ species: 'stackchan', level: 11 }, { species: 'voltling', level: 12 }],
    'INTERN PIP: I only started last week, but I have been studying!',
    'INTERN PIP: Logged it. Loss number fourteen.',
    'INTERN PIP: One day I will run a floor like this one.'),

  gym1_leader: {
    key: 'gym1_leader', name: 'LEADER NOVA', sprite: 'trainer_gym1', payout: 120, ai: 2,
    music: 'gymleader',
    requires: ['gym1_a', 'gym1_b', 'gym1_c', 'gym1_d'],
    team: [
      { species: 'roombit', level: 12 },
      { species: 'voltling', level: 13 },
      { species: 'ampereon', level: 15 },
    ],
    intro: [
      'LEADER NOVA: Welcome to my datacenter. Mind the voltage.',
      'LEADER NOVA: I run forty megawatts through this floor. Impress me.',
    ],
    defeat: [
      'LEADER NOVA: Ha! You blew the breakers.',
    ],
    after: [
      'LEADER NOVA: The SURGE BADGE is yours. Wear it proudly.',
      'LEADER NOVA: Head east when you are ready. ROUTE 2 is clear now.',
    ],
    badge: { flag: 'badge_volt', name: 'SURGE BADGE' },
  },

  // --- Route 2 -------------------------------------------------------------
  r2_kid: T('r2_kid', 'ROOKIE TAM', 'trainer_kid', 60,
    [{ species: 'figlet', level: 13 }, { species: 'pupboot', level: 13 }],
    'ROOKIE TAM: I have been waiting all day for a challenger!',
    'ROOKIE TAM: That was so cool though!',
    'ROOKIE TAM: When I grow up I want a whole datacenter of my own.'),

  r2_tech: T('r2_tech', 'TECH BRAN', 'trainer_technician', 68,
    [{ species: 'boltkin', level: 14 }, { species: 'roombit', level: 14 }, { species: 'chassik', level: 15 }],
    'TECH BRAN: Field diagnostics time. Show me your build.',
    'TECH BRAN: All green. You pass.',
    'TECH BRAN: CACHEWOOD gets dense. Do not wander off the track.'),

  r2_eng: T('r2_eng', 'ENGINEER SOL', 'trainer_engineer', 72,
    [{ species: 'dronelet', level: 15 }, { species: 'bugbyte', level: 15 }],
    'ENGINEER SOL: Two agents, no excuses. Go.',
    'ENGINEER SOL: Clean execution. Respect.',
    'ENGINEER SOL: Type coverage is everything past this point.'),

  // --- Cachewood ------------------------------------------------------------
  cw_kid1: T('cw_kid1', 'SCOUT NIM', 'trainer_kid', 76,
    [{ species: 'bugbyte', level: 16 }, { species: 'beni', level: 16 }],
    'SCOUT NIM: Lost? Everyone gets lost in CACHEWOOD.',
    'SCOUT NIM: You found your way through me at least.',
    'SCOUT NIM: Follow the paved track. It always leads north.'),

  cw_eng: T('cw_eng', 'ENGINEER VEX', 'trainer_engineer', 84,
    [{ species: 'bugbyte', level: 17 }, { species: 'malwarm', level: 18 }],
    'ENGINEER VEX: My units feed on corrupted packets. Careful.',
    'ENGINEER VEX: Sanitised. Fair enough.',
    'ENGINEER VEX: CORRUPTION chips away every turn. Carry ANTIVIRUS.'),

  cw_tech: T('cw_tech', 'TECH DELL', 'trainer_technician', 80,
    [{ species: 'roombit', level: 17 }, { species: 'figlet', level: 17 }, { species: 'dronelet', level: 18 }],
    'TECH DELL: I patrol these woods. State your business.',
    'TECH DELL: Business verified. Move along.',
    'TECH DELL: SILICA TOWN is straight north. Bring a coat.'),

  // --- Silica Gym -----------------------------------------------------------
  gym2_a: T('gym2_a', 'TECH BRIS', 'trainer_technician', 96,
    [{ species: 'cryobit', level: 20 }, { species: 'roombit', level: 20 }],
    'TECH BRIS: Mind the frost. It gets in the joints.',
    'TECH BRIS: Brrr. Well played.',
    'TECH BRIS: FROZEN units cannot act at all. Nasty, is it not?'),

  gym2_b: T('gym2_b', 'SECURITY IKO', 'trainer_guard', 100,
    [{ species: 'cryobit', level: 21 }, { species: 'chassik', level: 21 }],
    'SECURITY IKO: Cold storage means nothing gets out.',
    'SECURITY IKO: Except you, apparently.',
    'SECURITY IKO: FROST has never lost on this floor. Until maybe today.'),

  gym2_c: T('gym2_c', 'ENGINEER MAE', 'trainer_engineer', 104,
    [{ species: 'cryobit', level: 21 }, { species: 'glaciarc', level: 22 }],
    'ENGINEER MAE: Freeze first, ask questions later.',
    'ENGINEER MAE: You thawed right through that.',
    'ENGINEER MAE: THERMAL moves melt CRYO units. Obvious, but effective.'),

  gym2_d: T('gym2_d', 'ANALYST VELA', 'trainer_kid', 108,
    [{ species: 'reachymini', level: 21 }, { species: 'loona', level: 21 }, { species: 'spot', level: 22 }],
    'ANALYST VELA: I log every challenger. Give me a good row of data.',
    'ANALYST VELA: Recorded. You are faster than the average.',
    'ANALYST VELA: FROST reads your team before you finish sending it out.'),

  gym2_leader: {
    key: 'gym2_leader', name: 'LEADER FROST', sprite: 'trainer_gym2', payout: 220, ai: 2,
    music: 'gymleader',
    requires: ['gym2_a', 'gym2_b', 'gym2_c', 'gym2_d'],
    team: [
      { species: 'cryobit', level: 22 },
      { species: 'roombit', level: 22 },
      { species: 'glaciarc', level: 25 },
    ],
    intro: [
      'LEADER FROST: Four degrees. Perfect operating temperature.',
      'LEADER FROST: Most challengers seize up before the second turn.',
    ],
    defeat: ['LEADER FROST: ...You never slowed down. Not once.'],
    after: [
      'LEADER FROST: Take the FROST BADGE. You have earned the thaw.',
      'LEADER FROST: ROUTE 3 climbs to TERRAFLUX. Pack COOLANT.',
    ],
    badge: { flag: 'badge_cryo', name: 'FROST BADGE' },
  },

  // --- Route 3 --------------------------------------------------------------
  r3_eng: T('r3_eng', 'ENGINEER RUE', 'trainer_engineer', 120,
    [{ species: 'quadrotor', level: 24 }, { species: 'emo', level: 25 }, { species: 'ampereon', level: 24 }],
    'ENGINEER RUE: The air up here is thin. My units run cooler.',
    'ENGINEER RUE: Not cool enough, clearly.',
    'ENGINEER RUE: Evolution comes fast around level thirty-eight. Stay ready.'),

  r3_guard: T('r3_guard', 'SECURITY OMAR', 'trainer_guard', 128,
    [{ species: 'optibrawn', level: 25 }, { species: 'canidrone', level: 25 }, { species: 'chassik', level: 24 }],
    'SECURITY OMAR: The CITADEL is closer than you think. Prove yourself.',
    'SECURITY OMAR: Proven. Go on then.',
    'SECURITY OMAR: PYRA is the last leader. After her, only the CITADEL.'),

  r3_tech: T('r3_tech', 'TECH ZEV', 'trainer_technician', 124,
    [{ species: 'fanlet', level: 25 }, { species: 'radiaton', level: 26 }],
    'TECH ZEV: Heat is just energy nobody planned for.',
    'TECH ZEV: You planned for it. Annoying.',
    'TECH ZEV: OVERHEATED units lose HP and hit softer. Brutal combo.'),

  rival_r3: {
    key: 'rival_r3', name: 'REX', sprite: 'trainer_rival', payout: 180, ai: 2,
    music: 'rival',
    team: [
      { species: 'quadrotor', level: 26 },
      { species: 'malwarm', level: 26 },
      { species: 'figura', level: 27 },
    ],
    intro: [
      'REX: Knew you would come this way. Round two!',
      'REX: I have been grinding since VOLTSPIRE. You are not ready.',
    ],
    defeat: ['REX: ...How. How do you keep doing that?'],
    after: [
      'REX: Fine. FINE. Enjoy it while it lasts.',
      'REX: I will be waiting at the CITADEL. Do not disappoint me.',
    ],
  },

  // --- Terraflux Gym --------------------------------------------------------
  gym3_a: T('gym3_a', 'TECH HALE', 'trainer_technician', 144,
    [{ species: 'fanlet', level: 28 }, { species: 'boltkin', level: 28 }],
    'TECH HALE: Hot aisle. Mind the exhaust.',
    'TECH HALE: You handled the heat.',
    'TECH HALE: Every rack here runs at ninety percent. On purpose.'),

  gym3_b: T('gym3_b', 'SECURITY DRAY', 'trainer_guard', 148,
    [{ species: 'radiaton', level: 29 }, { species: 'optibrawn', level: 29 }],
    'SECURITY DRAY: Turn back or burn out.',
    'SECURITY DRAY: Neither, apparently.',
    'SECURITY DRAY: PYRA does not hold back. Nor should you.'),

  gym3_c: T('gym3_c', 'ENGINEER SIRA', 'trainer_engineer', 152,
    [{ species: 'fanlet', level: 29 }, { species: 'radiaton', level: 30 }, { species: 'forgeron', level: 29 }],
    'ENGINEER SIRA: My units thrive at ninety degrees.',
    'ENGINEER SIRA: And yours thrive under pressure. Noted.',
    'ENGINEER SIRA: Go on. She is expecting you.'),

  gym3_d: T('gym3_d', 'HANDLER TOR', 'trainer_technician', 156,
    [{ species: 'figure03', level: 30 }, { species: 'optimus', level: 31 }],
    'HANDLER TOR: My units carry racks all day. Yours carry what, exactly?',
    'HANDLER TOR: Fair. Fair. You put the work in.',
    'HANDLER TOR: PYRA is straight ahead. Bring COOLANT.'),

  gym3_leader: {
    key: 'gym3_leader', name: 'LEADER PYRA', sprite: 'trainer_gym3', payout: 340, ai: 2,
    music: 'gymleader',
    requires: ['gym3_a', 'gym3_b', 'gym3_c', 'gym3_d'],
    team: [
      { species: 'fanlet', level: 30 },
      { species: 'forgeron', level: 31 },
      { species: 'radiaton', level: 34 },
    ],
    intro: [
      'LEADER PYRA: You are hotter than you look. Let us see if you can take the heat.',
      'LEADER PYRA: No throttling. No mercy.',
    ],
    defeat: ['LEADER PYRA: HA! Now THAT was a workload.'],
    after: [
      'LEADER PYRA: The THERMAL BADGE. Third and hardest.',
      'LEADER PYRA: The CORE CITADEL gate is open to you now. Go and finish this.',
    ],
    badge: { flag: 'badge_thermal', name: 'THERMAL BADGE' },
  },

  // --- Core Citadel ---------------------------------------------------------
  elite_a: {
    key: 'elite_a', name: 'SENTINEL VASH', sprite: 'trainer_guard', payout: 260, ai: 2,
    music: 'elite',
    team: [
      { species: 'emilio', level: 36 },
      { species: 'titanoid', level: 36 },
      { species: 'forgeron', level: 36 },
      { species: 'teslarch', level: 38 },
    ],
    intro: ['SENTINEL VASH: The CITADEL does not open for badges alone.'],
    defeat: ['SENTINEL VASH: Access... granted.'],
    after: ['SENTINEL VASH: Three more stand between you and the top floor.'],
  },
  elite_b: {
    key: 'elite_b', name: 'ARCHITECT LUN', sprite: 'trainer_technician', payout: 280, ai: 2,
    music: 'elite',
    team: [
      { species: 'vaculo', level: 37 },
      { species: 'glaciarc', level: 37 },
      { species: 'skyswarm', level: 39 },
    ],
    intro: ['ARCHITECT LUN: I designed every rack on this floor.'],
    defeat: ['ARCHITECT LUN: And you rerouted around all of them.'],
    after: ['ARCHITECT LUN: Efficiency like that deserves the top floor.'],
  },
  elite_c: {
    key: 'elite_c', name: 'OVERSEER KATE', sprite: 'trainer_engineer', payout: 300, ai: 2,
    music: 'elite',
    team: [
      { species: 'rootkraken', level: 38 },
      { species: 'alphound', level: 38 },
      { species: 'entangl', level: 40 },
    ],
    intro: ['OVERSEER KATE: Impressive. Now show me depth.'],
    defeat: ['OVERSEER KATE: Deep enough. Well fought.'],
    after: ['OVERSEER KATE: Only two remain. One of them is your oldest rival.'],
  },
  rival_final: {
    key: 'rival_final', name: 'REX', sprite: 'trainer_rival', payout: 380, ai: 2,
    music: 'rival',
    team: [
      { species: 'skyswarm', level: 40 },
      { species: 'rootkraken', level: 40 },
      { species: 'figurex', level: 41 },
      { species: 'teslarch', level: 42 },
    ],
    intro: [
      'REX: I have been waiting my whole life for this battle.',
      'REX: No excuses this time. Best build wins.',
    ],
    defeat: ['REX: ...Yeah. Yeah, you deserve this one.'],
    after: [
      'REX: Go on. ADA is up there.',
      'REX: Beat her, and I will be the first to shake your hand.',
    ],
  },
  champion: {
    key: 'champion', name: 'CHAMPION ADA', sprite: 'trainer_gym3', payout: 600, ai: 2,
    music: 'champion',
    team: [
      { species: 'stackzen', level: 44 },
      { species: 'reachoro', level: 44 },
      { species: 'titanoid', level: 45 },
      { species: 'entangl', level: 46 },
      { species: 'nexusprime', level: 48 },
    ],
    intro: [
      'PROF. ADA: I did wonder which of you would arrive first.',
      'PROF. ADA: I have trained agents for thirty years. Show me what you have built.',
    ],
    defeat: ['PROF. ADA: ...Extraordinary. Truly.'],
    after: [
      'PROF. ADA: You did not just collect AGÉNTMON. You understood them.',
      'PROF. ADA: The CORE CITADEL recognises a new CHAMPION.',
      'PROF. ADA: Congratulations. The whole network is watching.',
    ],
    badge: { flag: 'champion', name: 'CHAMPION' },
  },
};

export function trainer(key: string): TrainerDef {
  const t = TRAINERS[key];
  if (!t) throw new Error(`Unknown trainer: ${key}`);
  return t;
}

export const BADGE_ORDER = ['badge_volt', 'badge_cryo', 'badge_thermal'];

export const BADGE_INFO: Record<string, { name: string; city: string; type: string }> = {
  badge_volt: { name: 'SURGE BADGE', city: 'VOLTSPIRE CITY', type: 'volt' },
  badge_cryo: { name: 'FROST BADGE', city: 'SILICA TOWN', type: 'cryo' },
  badge_thermal: { name: 'THERMAL BADGE', city: 'TERRAFLUX CITY', type: 'thermal' },
};

export function trainerLine(text: string): string {
  return t(text);
}

export function trainerLines(lines: readonly string[]): string[] {
  return lines.map((line) => t(line));
}

export function trainerBadgeName(t0: TrainerDef): string | undefined {
  return t0.badge ? t(t0.badge.name) : undefined;
}

export function badgeInfoName(flag: string): string {
  const info = BADGE_INFO[flag];
  return info ? t(info.name) : '';
}

/** Every localisable trainer string, for the catalogue extractor. */
export function trainerStrings(): string[] {
  const out: string[] = [];
  for (const tr of Object.values(TRAINERS)) {
    out.push(...tr.intro, ...tr.defeat, ...tr.after);
    if (tr.badge) out.push(tr.badge.name);
  }
  for (const b of Object.values(BADGE_INFO)) out.push(b.name);
  return out;
}
