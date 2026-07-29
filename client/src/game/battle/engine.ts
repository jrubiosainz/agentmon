/**
 * Turn-based battle engine.
 *
 * The engine is pure logic: it consumes actions and emits an ordered list of
 * `BattleEvent`s. The battle scene animates those events, which keeps
 * presentation and rules completely separate (and makes the rules testable).
 */

import { Rng } from '../../engine/rng.ts';
import {
  displayName, gainEvs, gainExp, isFainted, learnMove, maxHp, stats,
  type AgentInstance, type LevelUpResult, type StatusKey,
} from '../data/agent.ts';
import { move, species, typeEffect, type MoveDef, type TypeKey } from '../data/dex.ts';
import { item, type ItemDef } from '../data/items.ts';

export type StatKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva';

export interface Combatant {
  agent: AgentInstance;
  stages: Record<StatKey, number>;
  /** Turns the current volatile effects last. */
  confusedTurns: number;
  flinched: boolean;
  mustRecharge: boolean;
  /** Turns this unit has been on the field (used by NET CORE and AI). */
  turnsOut: number;
  /** Set once the unit has acted at least once - blocks first-turn switch abuse. */
  hasActed: boolean;
}

export type Side = 'player' | 'foe';

export interface BattleParty {
  members: AgentInstance[];
  activeIndex: number;
}

export type BattleEvent =
  | { t: 'text'; text: string; wait?: boolean }
  | { t: 'sendOut'; side: Side; index: number }
  | { t: 'withdraw'; side: Side }
  | { t: 'useMove'; side: Side; move: MoveDef }
  | { t: 'damage'; side: Side; from: number; to: number; max: number; effectiveness: number; crit: boolean }
  | { t: 'heal'; side: Side; from: number; to: number; max: number }
  | { t: 'faint'; side: Side }
  | { t: 'status'; side: Side; status: StatusKey }
  | { t: 'statChange'; side: Side; stat: StatKey; delta: number }
  | { t: 'miss'; side: Side }
  | { t: 'noEffect'; side: Side }
  | { t: 'throwBall'; itemKey: string; shakes: number; caught: boolean }
  | { t: 'useItem'; itemKey: string }
  | { t: 'exp'; index: number; gained: number; result: LevelUpResult }
  | { t: 'levelUp'; index: number; level: number }
  | { t: 'learnMove'; index: number; moveKey: string }
  | { t: 'evolve'; index: number; to: string }
  | { t: 'flee'; success: boolean }
  | { t: 'end'; outcome: BattleOutcome }
  | { t: 'sfx'; name: string }
  | { t: 'requestSwitch'; side: Side };

export type BattleOutcome = 'win' | 'lose' | 'caught' | 'fled' | 'foeFled';

export type PlayerAction =
  | { kind: 'move'; index: number }
  | { kind: 'switch'; index: number }
  | { kind: 'item'; key: string; targetIndex?: number; moveIndex?: number }
  | { kind: 'run' };

export interface BattleConfig {
  kind: 'wild' | 'trainer';
  playerName: string;
  trainerName?: string;
  trainerKey?: string;
  trainerAi?: 0 | 1 | 2;
  payout?: number;
  canRun: boolean;
  seed?: number;
  /** Badge count softly boosts obedience-free stat scaling like the originals' badge boosts. */
  badges?: number;
}

const STAGE_MULT = [0.25, 0.28, 0.33, 0.4, 0.5, 0.66, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const ACC_MULT = [0.33, 0.36, 0.43, 0.5, 0.6, 0.75, 1, 1.33, 1.66, 2, 2.33, 2.66, 3];

function zeroStages(): Record<StatKey, number> {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
}

export function makeCombatant(agent: AgentInstance): Combatant {
  return {
    agent,
    stages: zeroStages(),
    confusedTurns: 0,
    flinched: false,
    mustRecharge: false,
    turnsOut: 0,
    hasActed: false,
  };
}

const STAT_NAME: Record<StatKey, string> = {
  atk: 'ATTACK', def: 'DEFENSE', spa: 'SP.ATK', spd: 'SP.DEF',
  spe: 'SPEED', acc: 'ACCURACY', eva: 'EVASION',
};

const STATUS_MSG: Record<StatusKey, string> = {
  none: '',
  poison: 'was CORRUPTED!',
  burn: 'was OVERHEATED!',
  freeze: 'was FROZEN solid!',
  paralysis: 'was SHORTED! It may be unable to move!',
  sleep: 'went to SLEEP!',
  confusion: 'became CONFUSED!',
};

export class Battle {
  readonly rng: Rng;
  readonly player: BattleParty;
  readonly foe: BattleParty;
  playerC: Combatant;
  foeC: Combatant;
  outcome: BattleOutcome | null = null;
  /** Species the player has already "seen" this battle (for the dex). */
  readonly seen: string[] = [];
  caught: AgentInstance | null = null;
  turn = 0;
  /** Successful escape attempts scale with tries, like the originals. */
  private runAttempts = 0;
  private participants = new Set<string>();

  constructor(
    playerTeam: AgentInstance[],
    foeTeam: AgentInstance[],
    readonly config: BattleConfig,
  ) {
    this.rng = new Rng(config.seed);
    const pIdx = playerTeam.findIndex((a) => !isFainted(a));
    this.player = { members: playerTeam, activeIndex: Math.max(0, pIdx) };
    this.foe = { members: foeTeam, activeIndex: 0 };
    this.playerC = makeCombatant(playerTeam[this.player.activeIndex]!);
    this.foeC = makeCombatant(foeTeam[0]!);
    this.seen.push(foeTeam[0]!.speciesKey);
    this.participants.add(this.playerC.agent.uid);
  }

  side(s: Side): Combatant {
    return s === 'player' ? this.playerC : this.foeC;
  }

  party(s: Side): BattleParty {
    return s === 'player' ? this.player : this.foe;
  }

  foeOf(s: Side): Side {
    return s === 'player' ? 'foe' : 'player';
  }

  // ------------------------------------------------------------------ stats
  effStat(c: Combatant, key: 'atk' | 'def' | 'spa' | 'spd' | 'spe'): number {
    const base = stats(c.agent)[key];
    let v = Math.floor(base * STAGE_MULT[c.stages[key] + 6]!);
    if (key === 'spe' && c.agent.status === 'paralysis') v = Math.floor(v / 2);
    if (key === 'atk' && c.agent.status === 'burn') v = Math.floor(v / 2);
    return Math.max(1, v);
  }

  // ------------------------------------------------------------------- turn
  /** Run one full turn. Returns the events to animate. */
  takeTurn(action: PlayerAction, forcedFoeAction?: PlayerAction): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.turn++;
    this.playerC.flinched = false;
    this.foeC.flinched = false;

    // Item / switch / run happen before any move.
    if (action.kind === 'run') {
      if (this.tryRun(ev)) return ev;
    } else if (action.kind === 'item') {
      this.applyItem(ev, action);
      if (this.outcome) return ev;
    } else if (action.kind === 'switch') {
      this.doSwitch(ev, 'player', action.index);
    }

    const foeAction = forcedFoeAction ?? this.chooseFoeAction();
    if (foeAction.kind === 'switch') this.doSwitch(ev, 'foe', foeAction.index);

    // Determine move order.
    const playerMoves = action.kind === 'move';
    const foeMoves = foeAction.kind === 'move';
    const order: { side: Side; moveIndex: number }[] = [];
    if (playerMoves && foeMoves) {
      const pm = this.moveOf(this.playerC, action.index);
      const fm = this.moveOf(this.foeC, foeAction.index);
      const pPrio = pm?.priority ?? 0;
      const fPrio = fm?.priority ?? 0;
      let playerFirst: boolean;
      if (pPrio !== fPrio) playerFirst = pPrio > fPrio;
      else {
        const ps = this.effStat(this.playerC, 'spe');
        const fs = this.effStat(this.foeC, 'spe');
        playerFirst = ps === fs ? this.rng.chance(0.5) : ps > fs;
      }
      order.push(
        playerFirst
          ? { side: 'player', moveIndex: action.index }
          : { side: 'foe', moveIndex: foeAction.index },
      );
      order.push(
        playerFirst
          ? { side: 'foe', moveIndex: foeAction.index }
          : { side: 'player', moveIndex: action.index },
      );
    } else if (playerMoves) {
      order.push({ side: 'player', moveIndex: action.index });
    } else if (foeMoves) {
      order.push({ side: 'foe', moveIndex: foeAction.index });
    }

    for (const step of order) {
      const attacker = this.side(step.side);
      if (isFainted(attacker.agent)) continue;
      if (isFainted(this.side(this.foeOf(step.side)).agent)) continue;
      this.performMove(ev, step.side, step.moveIndex);
      if (this.checkFaints(ev)) break;
    }

    if (!this.outcome) this.endOfTurn(ev);
    if (!this.outcome) this.checkFaints(ev);

    this.playerC.turnsOut++;
    this.foeC.turnsOut++;
    return ev;
  }

  private moveOf(c: Combatant, index: number): MoveDef | null {
    const slot = c.agent.moves[index];
    return slot ? move(slot.key) : null;
  }

  // ------------------------------------------------------------------ moves
  private performMove(ev: BattleEvent[], side: Side, index: number): void {
    const attacker = this.side(side);
    const defender = this.side(this.foeOf(side));
    const name = this.label(side);

    if (attacker.mustRecharge) {
      attacker.mustRecharge = false;
      ev.push({ t: 'text', text: `${name} must recharge!`, wait: true });
      return;
    }

    // Pre-move status gates.
    if (attacker.agent.status === 'freeze') {
      if (this.rng.chance(0.2)) {
        attacker.agent.status = 'none';
        ev.push({ t: 'text', text: `${name} thawed out!`, wait: true });
      } else {
        ev.push({ t: 'text', text: `${name} is frozen solid!`, wait: true });
        return;
      }
    }
    if (attacker.agent.status === 'sleep') {
      attacker.agent.sleepTurns--;
      if (attacker.agent.sleepTurns <= 0) {
        attacker.agent.status = 'none';
        ev.push({ t: 'text', text: `${name} woke up!`, wait: true });
      } else {
        ev.push({ t: 'text', text: `${name} is fast asleep.`, wait: true });
        return;
      }
    }
    if (attacker.flinched) {
      ev.push({ t: 'text', text: `${name} flinched!`, wait: true });
      return;
    }
    if (attacker.agent.status === 'paralysis' && this.rng.chance(0.25)) {
      ev.push({ t: 'text', text: `${name} is short-circuited!`, wait: true });
      return;
    }
    if (attacker.confusedTurns > 0) {
      attacker.confusedTurns--;
      if (attacker.confusedTurns === 0) {
        ev.push({ t: 'text', text: `${name} snapped out of confusion!`, wait: true });
      } else if (this.rng.chance(0.33)) {
        ev.push({ t: 'text', text: `${name} is confused!`, wait: true });
        const dmg = Math.max(1, Math.floor(
          ((2 * attacker.agent.level / 5 + 2) * 40 * this.effStat(attacker, 'atk'))
          / this.effStat(attacker, 'def') / 50 + 2,
        ));
        this.dealDamage(ev, side, dmg, 1, false);
        ev.push({ t: 'text', text: 'It hurt itself in its confusion!', wait: true });
        return;
      }
    }

    const slot = attacker.agent.moves[index];
    if (!slot) {
      ev.push({ t: 'text', text: `${name} has no moves left!`, wait: true });
      return;
    }
    if (slot.pp <= 0) {
      ev.push({ t: 'text', text: `${name} has no PP left for that move!`, wait: true });
      return;
    }
    slot.pp--;
    attacker.hasActed = true;
    const m = move(slot.key);
    ev.push({ t: 'useMove', side, move: m });
    ev.push({ t: 'text', text: `${name} used ${m.name}!`, wait: false });

    // Accuracy.
    if (m.accuracy < 100 || m.category !== 'status') {
      const accStage = Math.max(-6, Math.min(6, attacker.stages.acc - defender.stages.eva));
      const chance = (m.accuracy / 100) * ACC_MULT[accStage + 6]!;
      if (m.accuracy < 999 && !this.rng.chance(Math.min(1, chance))) {
        ev.push({ t: 'miss', side });
        ev.push({ t: 'text', text: `${name}'s attack missed!`, wait: true });
        return;
      }
    }

    if (m.category === 'status') {
      this.applyStatusMove(ev, side, m);
      return;
    }

    // Damage.
    const eff = typeEffect(m.type, species(defender.agent.speciesKey).types);
    if (eff === 0) {
      ev.push({ t: 'noEffect', side });
      ev.push({ t: 'text', text: `It doesn't affect ${this.label(this.foeOf(side))}...`, wait: true });
      return;
    }

    const hits = m.effect === 'multi_hit' ? this.rng.weighted([2, 3, 4, 5], [3, 3, 1, 1]) : 1;
    let total = 0;
    let crit = false;
    for (let h = 0; h < hits; h++) {
      const r = this.computeDamage(attacker, defender, m, eff);
      crit = crit || r.crit;
      total += r.damage;
      this.dealDamage(ev, this.foeOf(side), r.damage, eff, r.crit);
      if (isFainted(defender.agent)) break;
    }
    if (hits > 1) {
      ev.push({ t: 'text', text: `Hit ${Math.min(hits, hits)} time(s)!`, wait: true });
    }
    if (eff > 1) ev.push({ t: 'text', text: "It's super effective!", wait: true });
    else if (eff < 1) ev.push({ t: 'text', text: "It's not very effective...", wait: true });
    if (crit) ev.push({ t: 'text', text: 'A critical hit!', wait: true });

    // Secondary effects.
    this.applySecondary(ev, side, m, total);
  }

  private computeDamage(
    attacker: Combatant, defender: Combatant, m: MoveDef, eff: number,
  ): { damage: number; crit: boolean } {
    const physical = m.category === 'physical';
    const atk = this.effStat(attacker, physical ? 'atk' : 'spa');
    const def = this.effStat(defender, physical ? 'def' : 'spd');
    const critRate = m.effect === 'high_crit' ? 0.125 : 0.0625;
    const crit = this.rng.chance(critRate);
    const level = attacker.agent.level;

    let dmg = Math.floor(Math.floor(Math.floor((2 * level) / 5 + 2) * m.power * atk / def) / 50) + 2;
    if (crit) dmg = Math.floor(dmg * 1.5);
    const stab = species(attacker.agent.speciesKey).types.includes(m.type) ? 1.5 : 1;
    dmg = Math.floor(dmg * stab);
    dmg = Math.floor(dmg * eff);
    dmg = Math.floor((dmg * this.rng.int(85, 100)) / 100);
    return { damage: Math.max(1, dmg), crit };
  }

  private dealDamage(ev: BattleEvent[], side: Side, amount: number, eff: number, crit: boolean): void {
    const c = this.side(side);
    const max = maxHp(c.agent);
    const from = c.agent.hp;
    c.agent.hp = Math.max(0, c.agent.hp - amount);
    ev.push({ t: 'damage', side, from, to: c.agent.hp, max, effectiveness: eff, crit });
  }

  private healBy(ev: BattleEvent[], side: Side, amount: number): void {
    const c = this.side(side);
    const max = maxHp(c.agent);
    const from = c.agent.hp;
    c.agent.hp = Math.min(max, c.agent.hp + amount);
    ev.push({ t: 'heal', side, from, to: c.agent.hp, max });
  }

  private applyStatusMove(ev: BattleEvent[], side: Side, m: MoveDef): void {
    const selfSide = m.target === 'self' ? side : this.foeOf(side);
    const applied = this.applyEffect(ev, side, selfSide, m.effect, m);
    if (!applied) ev.push({ t: 'text', text: 'But nothing happened!', wait: true });
  }

  private applySecondary(ev: BattleEvent[], side: Side, m: MoveDef, damageDealt: number): void {
    const foe = this.foeOf(side);
    switch (m.effect) {
      case 'recoil_third': {
        const recoil = Math.max(1, Math.floor(damageDealt / 3));
        ev.push({ t: 'text', text: `${this.label(side)} is damaged by recoil!`, wait: true });
        this.dealDamage(ev, side, recoil, 1, false);
        break;
      }
      case 'drain_half': {
        const drain = Math.max(1, Math.floor(damageDealt / 2));
        this.healBy(ev, side, drain);
        ev.push({ t: 'text', text: `${this.label(foe)}'s energy was drained!`, wait: true });
        break;
      }
      case 'recharge':
        this.side(side).mustRecharge = true;
        break;
      case 'spa_down_self':
        this.changeStage(ev, side, 'spa', -2);
        break;
      case null:
      case undefined:
        break;
      default:
        if (m.effectChance > 0 && !this.rng.chance256(Math.round(m.effectChance * 2.55))) break;
        this.applyEffect(ev, side, foe, m.effect, m);
        break;
    }
  }

  private applyEffect(
    ev: BattleEvent[], source: Side, target: Side, effect: string | null, _m: MoveDef,
  ): boolean {
    if (!effect) return false;
    const c = this.side(target);
    const name = this.label(target);

    const setStatus = (s: StatusKey, immuneType?: TypeKey): boolean => {
      if (c.agent.status !== 'none') return false;
      if (immuneType && species(c.agent.speciesKey).types.includes(immuneType)) return false;
      c.agent.status = s;
      if (s === 'sleep') c.agent.sleepTurns = this.rng.int(2, 4);
      ev.push({ t: 'status', side: target, status: s });
      ev.push({ t: 'text', text: `${name} ${STATUS_MSG[s]}`, wait: true });
      return true;
    };

    switch (effect) {
      case 'paralyze': return setStatus('paralysis', 'volt');
      case 'burn': return setStatus('burn', 'thermal');
      case 'freeze': return setStatus('freeze', 'cryo');
      case 'poison': return setStatus('poison', 'viral');
      case 'sleep': return setStatus('sleep');
      case 'conf': {
        if (c.confusedTurns > 0) return false;
        c.confusedTurns = this.rng.int(2, 5);
        ev.push({ t: 'text', text: `${name} became CONFUSED!`, wait: true });
        return true;
      }
      case 'flinch': {
        c.flinched = true;
        return true;
      }
      case 'heal_half': {
        const self = this.side(source);
        if (self.agent.hp >= maxHp(self.agent)) return false;
        this.healBy(ev, source, Math.floor(maxHp(self.agent) / 2));
        ev.push({ t: 'text', text: `${this.label(source)} regained health!`, wait: true });
        return true;
      }
      case 'cure_status': {
        const self = this.side(source);
        if (self.agent.status === 'none' && self.confusedTurns === 0) return false;
        self.agent.status = 'none';
        self.confusedTurns = 0;
        ev.push({ t: 'status', side: source, status: 'none' });
        ev.push({ t: 'text', text: `${this.label(source)} was fully debugged!`, wait: true });
        return true;
      }
      case 'atk_up': return this.changeStage(ev, source, 'atk', 1);
      case 'def_up': return this.changeStage(ev, source, 'def', 1);
      case 'def_up2': return this.changeStage(ev, source, 'def', 2);
      case 'spa_up': return this.changeStage(ev, source, 'spa', 1);
      case 'spd_up': return this.changeStage(ev, source, 'spd', 1);
      case 'spd_up2': return this.changeStage(ev, source, 'spd', 2);
      case 'spe_up2': return this.changeStage(ev, source, 'spe', 2);
      case 'acc_up': return this.changeStage(ev, source, 'acc', 1);
      case 'eva_up': return this.changeStage(ev, source, 'eva', 1);
      case 'atk_down': return this.changeStage(ev, target, 'atk', -1);
      case 'atk_down2': return this.changeStage(ev, target, 'atk', -2);
      case 'def_down': return this.changeStage(ev, target, 'def', -1);
      case 'spa_down': return this.changeStage(ev, target, 'spa', -1);
      case 'spd_down': return this.changeStage(ev, target, 'spd', -1);
      case 'spe_down': return this.changeStage(ev, target, 'spe', -1);
      case 'spe_down2': return this.changeStage(ev, target, 'spe', -2);
      case 'acc_down': return this.changeStage(ev, target, 'acc', -1);
      default: return false;
    }
  }

  private changeStage(ev: BattleEvent[], side: Side, stat: StatKey, delta: number): boolean {
    const c = this.side(side);
    const before = c.stages[stat];
    const after = Math.max(-6, Math.min(6, before + delta));
    if (after === before) {
      ev.push({
        t: 'text',
        text: `${this.label(side)}'s ${STAT_NAME[stat]} won't go ${delta > 0 ? 'higher' : 'lower'}!`,
        wait: true,
      });
      return false;
    }
    c.stages[stat] = after;
    ev.push({ t: 'statChange', side, stat, delta });
    const word = Math.abs(delta) >= 2
      ? (delta > 0 ? 'sharply rose' : 'harshly fell')
      : (delta > 0 ? 'rose' : 'fell');
    ev.push({ t: 'text', text: `${this.label(side)}'s ${STAT_NAME[stat]} ${word}!`, wait: true });
    return true;
  }

  // ------------------------------------------------------------- end of turn
  private endOfTurn(ev: BattleEvent[]): void {
    for (const side of ['player', 'foe'] as Side[]) {
      const c = this.side(side);
      if (isFainted(c.agent)) continue;
      if (c.agent.status === 'poison') {
        const dmg = Math.max(1, Math.floor(maxHp(c.agent) / 8));
        ev.push({ t: 'text', text: `${this.label(side)} is hurt by CORRUPTION!`, wait: true });
        this.dealDamage(ev, side, dmg, 1, false);
      } else if (c.agent.status === 'burn') {
        const dmg = Math.max(1, Math.floor(maxHp(c.agent) / 8));
        ev.push({ t: 'text', text: `${this.label(side)} is hurt by OVERHEATING!`, wait: true });
        this.dealDamage(ev, side, dmg, 1, false);
      }
    }
  }

  // ---------------------------------------------------------------- fainting
  /** Returns true when the battle should stop resolving this turn. */
  private checkFaints(ev: BattleEvent[]): boolean {
    let stop = false;
    if (isFainted(this.foeC.agent)) {
      ev.push({ t: 'faint', side: 'foe' });
      ev.push({ t: 'text', text: `${this.label('foe')} was scrapped!`, wait: true });
      this.awardExp(ev);
      const next = this.foe.members.findIndex((a) => !isFainted(a));
      if (next < 0) {
        this.finish(ev, 'win');
      } else {
        this.doSwitch(ev, 'foe', next);
      }
      stop = true;
    }
    if (isFainted(this.playerC.agent)) {
      ev.push({ t: 'faint', side: 'player' });
      ev.push({ t: 'text', text: `${this.label('player')} was scrapped!`, wait: true });
      const next = this.player.members.findIndex((a) => !isFainted(a));
      if (next < 0) this.finish(ev, 'lose');
      else ev.push({ t: 'requestSwitch', side: 'player' });
      stop = true;
    }
    return stop;
  }

  private awardExp(ev: BattleEvent[]): void {
    const foeSp = species(this.foeC.agent.speciesKey);
    const base = foeSp.baseExp;
    const lvl = this.foeC.agent.level;
    const trainerBonus = this.config.kind === 'trainer' ? 1.5 : 1;
    const eligible = this.player.members
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !isFainted(a) && this.participants.has(a.uid));
    const pool = eligible.length > 0 ? eligible : [{ a: this.playerC.agent, i: this.player.activeIndex }];
    for (const { a, i } of pool) {
      const gained = Math.max(1, Math.floor((base * lvl * trainerBonus) / (7 * pool.length)));
      const result = gainExp(a, gained);
      gainEvs(a, foeSp);
      ev.push({ t: 'exp', index: i, gained, result });
      for (const lv of result.levels) ev.push({ t: 'levelUp', index: i, level: lv });
      for (const l of result.learned) {
        if (learnMove(a, l.move.key)) ev.push({ t: 'learnMove', index: i, moveKey: l.move.key });
      }
    }
  }

  private finish(ev: BattleEvent[], outcome: BattleOutcome): void {
    this.outcome = outcome;
    ev.push({ t: 'end', outcome });
  }

  // ---------------------------------------------------------------- switching
  doSwitch(ev: BattleEvent[], side: Side, index: number): void {
    const party = this.party(side);
    if (index === party.activeIndex) return;
    const target = party.members[index];
    if (!target || isFainted(target)) return;
    if (!isFainted(this.side(side).agent)) ev.push({ t: 'withdraw', side });
    party.activeIndex = index;
    const c = makeCombatant(target);
    if (side === 'player') {
      this.playerC = c;
      this.participants.add(target.uid);
    } else {
      this.foeC = c;
      if (!this.seen.includes(target.speciesKey)) this.seen.push(target.speciesKey);
    }
    ev.push({ t: 'sendOut', side, index });
    const who = side === 'player'
      ? `Go! ${displayName(target)}!`
      : `${this.config.trainerName ?? 'FOE'} sent out ${displayName(target)}!`;
    ev.push({ t: 'text', text: who, wait: true });
  }

  /** Called by the scene after the player picks a replacement for a fainted unit. */
  replaceFainted(index: number): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.player.activeIndex = index;
    this.playerC = makeCombatant(this.player.members[index]!);
    this.participants.add(this.playerC.agent.uid);
    ev.push({ t: 'sendOut', side: 'player', index });
    ev.push({ t: 'text', text: `Go! ${displayName(this.playerC.agent)}!`, wait: true });
    return ev;
  }

  // -------------------------------------------------------------------- items
  private applyItem(ev: BattleEvent[], action: Extract<PlayerAction, { kind: 'item' }>): void {
    const def = item(action.key);

    if (def.ballRate !== undefined) {
      if (this.config.kind === 'trainer') {
        // Refused, so the ball is never announced and never consumed.
        ev.push({ t: 'text', text: "You can't capture another engineer's AGÉNTMON!", wait: true });
        return;
      }
      ev.push({ t: 'useItem', itemKey: action.key });
      this.throwBall(ev, def);
      return;
    }
    const targetIndex = action.targetIndex ?? this.player.activeIndex;
    const target = this.player.members[targetIndex];
    if (!target) return;
    const isActive = targetIndex === this.player.activeIndex;

    ev.push({ t: 'useItem', itemKey: action.key });
    ev.push({ t: 'text', text: `${this.config.playerName} used ${def.name}!`, wait: true });

    if (def.revive && isFainted(target)) {
      target.hp = Math.max(1, Math.floor(maxHp(target) * def.revive));
      target.status = 'none';
      ev.push({ t: 'text', text: `${displayName(target)} was rebooted!`, wait: true });
    } else if (def.heal !== undefined) {
      const amount = def.heal < 0 ? maxHp(target) : def.heal;
      if (isActive) this.healBy(ev, 'player', amount);
      else target.hp = Math.min(maxHp(target), target.hp + amount);
      ev.push({ t: 'text', text: `${displayName(target)}'s HP was restored.`, wait: true });
    } else if (def.cures) {
      target.status = 'none';
      if (isActive) this.playerC.confusedTurns = 0;
      ev.push({ t: 'status', side: 'player', status: 'none' });
      ev.push({ t: 'text', text: `${displayName(target)} was repaired.`, wait: true });
    } else if (def.pp !== undefined && action.moveIndex !== undefined) {
      const slot = target.moves[action.moveIndex];
      if (slot) {
        slot.pp = def.pp < 0 ? slot.maxPp : Math.min(slot.maxPp, slot.pp + def.pp);
        ev.push({ t: 'text', text: `PP was restored.`, wait: true });
      }
    } else if (def.boost) {
      this.changeStage(ev, 'player', def.boost.stat as StatKey, def.boost.stages);
    } else if (def.escape) {
      ev.push({ t: 'flee', success: true });
      ev.push({ t: 'text', text: 'Got away safely!', wait: true });
      this.finish(ev, 'fled');
    }
  }

  private throwBall(ev: BattleEvent[], def: ItemDef): void {
    const target = this.foeC.agent;
    const sp = species(target.speciesKey);
    const max = maxHp(target);
    // Announce the throw before the animation so the text box isn't still
    // showing "What will X do?" while the ball is in the air.
    ev.push({ t: 'text', text: `${this.config.playerName} used the ${def.name}!`, wait: false });
    const ballRate = def.key === 'netcore'
      ? (this.foeC.turnsOut >= 6 ? 3 : 1.5)
      : def.ballRate!;

    if (ballRate >= 255) {
      ev.push({ t: 'throwBall', itemKey: def.key, shakes: 3, caught: true });
      this.captureSucceeded(ev);
      return;
    }

    const statusBonus = target.status === 'sleep' || target.status === 'freeze'
      ? 2
      : target.status !== 'none' ? 1.5 : 1;
    const a = Math.floor(
      (((3 * max - 2 * target.hp) * sp.catchRate * ballRate) / (3 * max)) * statusBonus,
    );
    let shakes = 0;
    if (a >= 255) shakes = 4;
    else {
      const b = Math.floor(1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(16711680 / a)))));
      shakes = 0;
      for (let i = 0; i < 4; i++) {
        if (this.rng.int(0, 65535) < b) shakes++;
        else break;
      }
    }
    const caught = shakes >= 4;
    ev.push({ t: 'throwBall', itemKey: def.key, shakes: Math.min(3, shakes), caught });
    if (caught) {
      this.captureSucceeded(ev);
    } else {
      const msg = shakes === 0
        ? 'Oh no! It broke free!'
        : shakes === 1 ? 'Aww! It appeared to be caught!'
          : shakes === 2 ? 'Aargh! Almost had it!' : 'Shoot! It was so close, too!';
      ev.push({ t: 'text', text: msg, wait: true });
    }
  }

  private captureSucceeded(ev: BattleEvent[]): void {
    const target = this.foeC.agent;
    ev.push({ t: 'text', text: `Gotcha! ${displayName(target)} was captured!`, wait: true });
    target.otName = this.config.playerName;
    this.caught = target;
    this.finish(ev, 'caught');
  }

  // -------------------------------------------------------------------- flee
  private tryRun(ev: BattleEvent[]): boolean {
    if (!this.config.canRun) {
      ev.push({ t: 'text', text: "There's no running from an engineer battle!", wait: true });
      return false;
    }
    this.runAttempts++;
    const ps = this.effStat(this.playerC, 'spe');
    const fs = this.effStat(this.foeC, 'spe');
    const odds = fs === 0 ? 256 : Math.floor((ps * 32) / Math.floor(fs / 4 || 1)) + 30 * this.runAttempts;
    const success = odds >= 256 || this.rng.int(0, 255) < odds;
    ev.push({ t: 'flee', success });
    if (success) {
      ev.push({ t: 'text', text: 'Got away safely!', wait: true });
      this.finish(ev, 'fled');
      return true;
    }
    ev.push({ t: 'text', text: "Can't escape!", wait: true });
    return false;
  }

  // ---------------------------------------------------------------------- AI
  private chooseFoeAction(): PlayerAction {
    const ai = this.config.trainerAi ?? 0;
    const c = this.foeC;
    const usable = c.agent.moves
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.pp > 0);
    if (usable.length === 0) return { kind: 'move', index: 0 };

    // Trainers swap out a badly matched lead once they have a healthy bench.
    if (ai === 2 && c.turnsOut > 0 && this.rng.chance(0.12)) {
      const bench = this.foe.members
        .map((a, i) => ({ a, i }))
        .filter(({ a, i }) => !isFainted(a) && i !== this.foe.activeIndex);
      if (bench.length) {
        const playerTypes = species(this.playerC.agent.speciesKey).types;
        const current = this.threatScore(c.agent.speciesKey, playerTypes);
        const best = bench.reduce((acc, b) =>
          this.threatScore(b.a.speciesKey, playerTypes) > this.threatScore(acc.a.speciesKey, playerTypes) ? b : acc);
        if (this.threatScore(best.a.speciesKey, playerTypes) > current + 0.6) {
          return { kind: 'switch', index: best.i };
        }
      }
    }

    if (ai === 0) return { kind: 'move', index: this.rng.pick(usable).i };

    const defTypes = species(this.playerC.agent.speciesKey).types;
    const scored = usable.map(({ m, i }) => {
      const def = move(m.key);
      let score = 1;
      if (def.category === 'status') {
        score = this.playerC.agent.status === 'none' && c.turnsOut === 0 ? 24 : 6;
        if (def.target === 'self') score = c.turnsOut < 2 ? 22 : 8;
      } else {
        const eff = typeEffect(def.type, defTypes);
        const stab = species(c.agent.speciesKey).types.includes(def.type) ? 1.5 : 1;
        score = def.power * eff * stab * (def.accuracy / 100);
        if (eff === 0) score = 0;
      }
      if (ai === 1) score *= 0.6 + this.rng.next() * 0.8;
      else score *= 0.9 + this.rng.next() * 0.2;
      return { i, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return { kind: 'move', index: scored[0]!.i };
  }

  private threatScore(speciesKey: string, foeTypes: TypeKey[]): number {
    const own = species(speciesKey).types;
    let off = 0;
    for (const t of own) off = Math.max(off, typeEffect(t, foeTypes));
    let vuln = 0;
    for (const t of foeTypes) vuln = Math.max(vuln, typeEffect(t, own));
    return off - vuln;
  }

  // ------------------------------------------------------------------- labels
  label(side: Side): string {
    const c = this.side(side);
    if (side === 'player') return displayName(c.agent);
    return this.config.kind === 'wild'
      ? `Wild ${displayName(c.agent)}`
      : `Foe ${displayName(c.agent)}`;
  }

  /** Prize money for a defeated trainer. */
  prize(): number {
    if (this.config.kind !== 'trainer') return 0;
    const last = this.foe.members[this.foe.members.length - 1]!;
    return (this.config.payout ?? 40) * last.level;
  }
}
