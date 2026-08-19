/** The overworld: grid movement, NPCs, dialogue, encounters, warps and scripts. */

import { assets } from '../../engine/assets.ts';
import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { TILE } from '../../engine/tilegen.ts';
import { drawWindow, fillScreen, TEXTBOX_Y, Typewriter } from '../../engine/ui.ts';
import { createAgent, healFully, type AgentInstance } from '../data/agent.ts';
import { dexEntryOf, species, typeName } from '../data/dex.ts';
import { itemName } from '../data/items.ts';
import { getMap } from '../data/maps.ts';
import { trackExists } from '../data/music.ts';
import { rivalStarterFor, STARTER_KEYS } from '../data/starters.ts';
import { badgeInfoName, trainer as trainerDef, trainerBadgeName, type TrainerDef } from '../data/trainers.ts';
import {
  bagAdd, catchSpecies, flag, seeSpecies, setFlag, type Facing,
} from '../state.ts';
import { formatNumber, t, tUpper } from '../i18n.ts';
import { TileMap, type EncounterEntry, type MapDef, type NpcDef, type WarpDef } from '../world/tilemap.ts';
import type { BattlePayload, BattleResult } from './battle.ts';
import { BattleScene } from './battle.ts';
import { EvolutionScene } from './evolution.ts';
import { StartMenuScene, StorageScene } from './menu.ts';
import { ShopScene } from './shop.ts';
import { StarterScene, type StarterResult } from './starter.ts';

const WALK_FRAMES = 15;
const RUN_FRAMES = 8;
const TURN_FRAMES = 6;

const DIR_VEC: Record<Facing, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

function localizeLines(lines: string[]): string[] {
  return lines.map((line) => t(line));
}

interface Actor {
  id: string;
  x: number;
  y: number;
  /** Pixel offset from the tile origin while a step is in progress. */
  ox: number;
  oy: number;
  facing: Facing;
  sprite: string;
  moving: boolean;
  moveTimer: number;
  moveDur: number;
  stepPhase: number;
  jumping: boolean;
  wanderCd: number;
  def?: NpcDef;
}

function makeActor(id: string, x: number, y: number, facing: Facing, sprite: string): Actor {
  return {
    id, x, y, ox: 0, oy: 0, facing, sprite,
    moving: false, moveTimer: 0, moveDur: WALK_FRAMES, stepPhase: 0,
    jumping: false, wanderCd: 60 + Math.floor(Math.random() * 120),
  };
}

type Dialogue = {
  lines: string[];
  index: number;
  tw: Typewriter;
  resolve: () => void;
  choice?: { yes: string; no: string; pick: number; resolve: (v: boolean) => void };
};

export class OverworldScene extends Scene {
  private map!: TileMap;
  private def!: MapDef;
  private player!: Actor;
  private npcs: Actor[] = [];
  private camX = 0;
  private camY = 0;
  private tick = 0;
  private animTick = 0;
  /** Blocks player input while a script/dialogue/battle is running. */
  private busy = false;
  private dialogue: Dialogue | null = null;
  /**
   * Resolvers for scenes this one is waiting on. Pushes and pops are strictly
   * LIFO, so a stack is correct - a single slot silently orphaned the earlier
   * promise whenever two scenes overlapped, stranding the awaiting code and
   * leaving the transition curtain down forever.
   */
  private resumeStack: ((r: unknown) => void)[] = [];
  private encounterCooldown = 0;
  private stepsSinceEncounter = 0;
  private exclaim: { actor: Actor; timer: number } | null = null;
  private banner = { text: '', timer: 0 };
  private pendingTrainer: { npc: Actor; def: NpcDef } | null = null;

  override async enter(): Promise<void> {
    this.loadMap(this.game.save.pos.map, this.game.save.pos.x, this.game.save.pos.y, this.game.save.pos.facing);
    if (this.game.transitions.isCovered) await this.game.transitions.in('fade', 30);
  }

  override resume(result?: unknown): void {
    const cb = this.resumeStack.pop();
    this.game.input.clear();
    if (cb) cb(result);
    else this.playMapMusic();
  }

  // ---------------------------------------------------------------- loading
  private loadMap(id: string, x: number, y: number, facing: Facing): void {
    this.def = getMap(id);
    this.map = new TileMap(this.def, this.game.tiles);
    this.player = makeActor('player', x, y, facing,
      this.game.save.gender === 'm' ? 'player_m' : 'player_f');
    this.rebuildNpcs();
    this.game.save.pos = { map: id, x, y, facing };
    this.updateCamera(true);
    this.playMapMusic();
    this.banner = { text: t(this.def.name), timer: this.def.outdoor ? 150 : 0 };
    if (this.def.healOnEnter) {
      this.game.save.respawn = { map: id, x, y, facing: 'down' };
    }
  }

  private rebuildNpcs(): void {
    this.npcs = [];
    for (const npc of this.def.npcs ?? []) {
      if (!this.npcVisible(npc)) continue;
      const actor = makeActor(npc.id, npc.x, npc.y, npc.facing, npc.sprite);
      actor.def = npc;
      this.npcs.push(actor);
      this.map.setSolid(npc.x, npc.y, true);
    }
  }

  private npcVisible(npc: NpcDef): boolean {
    if (npc.showIfFlag && !flag(this.game.save, npc.showIfFlag)) return false;
    if (npc.hideIfFlag && flag(this.game.save, npc.hideIfFlag)) return false;
    if (npc.trainer && flag(this.game.save, `beat:${npc.trainer}`)) {
      // Defeated trainers stay put but stop challenging.
      return true;
    }
    return true;
  }

  private playMapMusic(): void {
    const name = trackExists(this.def.music) ? this.def.music : 'town';
    audio.playMusic(name);
  }

  // ----------------------------------------------------------------- update
  update(): void {
    this.tick++;
    if (this.tick % 12 === 0) this.animTick++;
    if (this.banner.timer > 0) this.banner.timer--;
    if (this.encounterCooldown > 0) this.encounterCooldown--;

    if (this.dialogue) { this.updateDialogue(); this.updateActors(); this.updateCamera(false); return; }
    if (this.exclaim) {
      this.exclaim.timer--;
      if (this.exclaim.timer <= 0) {
        const t = this.pendingTrainer;
        this.exclaim = null;
        if (t) { this.pendingTrainer = null; void this.runTrainerApproach(t.npc, t.def); }
      }
      this.updateActors();
      return;
    }

    this.updateActors();
    if (!this.busy) {
      this.updatePlayerInput();
      this.checkTrainerSight();
    }
    this.updateCamera(false);
  }

  private updateActors(): void {
    for (const a of [this.player, ...this.npcs]) {
      if (!a.moving) continue;
      a.moveTimer++;
      const t = Math.min(1, a.moveTimer / a.moveDur);
      const [dx, dy] = DIR_VEC[a.facing];
      const dist = a.jumping ? 2 : 1;
      a.ox = dx * t * TILE * dist;
      a.oy = dy * t * TILE * dist;
      if (a.jumping) a.oy -= Math.sin(t * Math.PI) * 12;
      a.stepPhase += 1;
      if (a.moveTimer >= a.moveDur) {
        a.moving = false;
        a.jumping = false;
        a.moveTimer = 0;
        a.ox = 0;
        a.oy = 0;
        a.x += dx * dist;
        a.y += dy * dist;
        if (a === this.player) this.onPlayerArrive();
      }
    }
    // NPC wandering.
    if (this.busy || this.dialogue) return;
    for (const a of this.npcs) {
      if (a.moving) continue;
      const mode = a.def?.movement ?? 'static';
      if (mode === 'wander') {
        if (--a.wanderCd > 0) continue;
        a.wanderCd = 90 + Math.floor(Math.random() * 150);
        const dirs: Facing[] = ['up', 'down', 'left', 'right'];
        const dir = dirs[Math.floor(Math.random() * 4)]!;
        a.facing = dir;
        const [dx, dy] = DIR_VEC[dir];
        const nx = a.x + dx;
        const ny = a.y + dy;
        const home = a.def!;
        if (Math.abs(nx - home.x) > 2 || Math.abs(ny - home.y) > 2) continue;
        if (this.blocked(nx, ny)) continue;
        this.map.setSolid(a.x, a.y, false);
        this.map.setSolid(nx, ny, true);
        a.moving = true;
        a.moveDur = WALK_FRAMES + 6;
        a.moveTimer = 0;
      } else if (mode === 'look') {
        if (--a.wanderCd > 0) continue;
        a.wanderCd = 120 + Math.floor(Math.random() * 180);
        const dirs: Facing[] = ['up', 'down', 'left', 'right'];
        a.facing = dirs[Math.floor(Math.random() * 4)]!;
      }
    }
  }

  private blocked(x: number, y: number): boolean {
    if (this.map.isSolid(x, y)) return true;
    if (this.player.x === x && this.player.y === y) return true;
    return false;
  }

  private updatePlayerInput(): void {
    const inp = this.game.input;
    const p = this.player;
    if (p.moving) return;

    if (inp.pressed('start')) {
      audio.sfx('menuOpen');
      this.openMenu();
      return;
    }
    if (inp.pressed('a')) { this.interact(); return; }

    const dir = inp.direction();
    if (!dir) { p.stepPhase = 0; return; }

    if (p.facing !== dir) {
      p.facing = dir;
      p.moveTimer = 0;
      // Brief turn-in-place window, exactly like the originals.
      p.wanderCd = TURN_FRAMES;
      if (!inp.held(dir)) return;
    }

    const [dx, dy] = DIR_VEC[dir];
    const nx = p.x + dx;
    const ny = p.y + dy;

    // Ledge hop: only downward/sideways over a ledge tile.
    const ledge = this.map.ledgeAt(nx, ny);
    if (ledge && ledge === dir) {
      p.moving = true;
      p.jumping = true;
      p.moveDur = 22;
      p.moveTimer = 0;
      audio.sfx('bump');
      return;
    }

    if (this.blocked(nx, ny) || this.npcAt(nx, ny)) {
      if (this.tick % 18 === 0) audio.sfx('bump');
      return;
    }

    p.moving = true;
    p.moveDur = inp.held('b') ? RUN_FRAMES : WALK_FRAMES;
    p.moveTimer = 0;
  }

  private npcAt(x: number, y: number): Actor | undefined {
    return this.npcs.find((n) => n.x === x && n.y === y && !n.moving)
      ?? this.npcs.find((n) => {
        if (!n.moving) return false;
        const [dx, dy] = DIR_VEC[n.facing];
        return n.x + dx === x && n.y + dy === y;
      });
  }

  private onPlayerArrive(): void {
    const p = this.player;
    this.game.save.pos = { map: this.def.id, x: p.x, y: p.y, facing: p.facing };

    const warp = this.map.warpAt(p.x, p.y);
    if (warp && (!warp.requiresFlag || flag(this.game.save, warp.requiresFlag))) {
      void this.doWarp(warp);
      return;
    }

    if (this.game.save.repelSteps > 0) this.game.save.repelSteps--;

    if (this.map.isEncounter(p.x, p.y) && this.encounterCooldown === 0) {
      this.stepsSinceEncounter++;
      this.maybeEncounter();
    }
  }

  private async doWarp(warp: WarpDef): Promise<void> {
    this.busy = true;
    if (warp.kind === 'door' || warp.kind === 'stairs') audio.sfx('door');
    const kind = warp.kind === 'door' ? 'doorway' : 'fade';
    await this.game.transitions.out(kind, 26);
    this.loadMap(warp.to, warp.tx, warp.ty, warp.facing ?? this.player.facing);
    if (this.def.healOnEnter) {
      // Repair Bays top the party up automatically when you walk in.
      for (const a of this.game.save.party) healFully(a);
    }
    this.updateCamera(true);
    await this.game.transitions.in(kind, 26);
    this.busy = false;
  }

  // ------------------------------------------------------------- encounters
  private maybeEncounter(): void {
    const table = this.def.encounters;
    if (!table || table.length === 0) return;
    if (this.game.save.repelSteps > 0) return;
    if (this.game.save.party.length === 0) return;
    // Ramps with consecutive steps so long grass crossings always resolve.
    const chance = 0.086 + Math.min(0.1, this.stepsSinceEncounter * 0.004);
    if (this.game.rng.next() > chance) return;
    this.stepsSinceEncounter = 0;
    this.encounterCooldown = 40;
    const entry = this.pickEncounter(table);
    if (!entry) return;
    const level = this.game.rng.int(entry.min, entry.max);
    const foe = createAgent(entry.species, { level });
    seeSpecies(this.game.save, entry.species);
    void this.startWildBattle(foe);
  }

  private pickEncounter(table: EncounterEntry[]): EncounterEntry | undefined {
    const total = table.reduce((n, e) => n + e.weight, 0);
    let roll = this.game.rng.next() * total;
    for (const e of table) {
      roll -= e.weight;
      if (roll <= 0) return e;
    }
    return table[table.length - 1];
  }

  private async startWildBattle(foe: AgentInstance): Promise<void> {
    if (!this.canFight()) return;
    this.busy = true;
    audio.sfx('encounter');
    await this.game.transitions.out('battleSwirl', 52);
    const payload: BattlePayload = {
      foes: [foe],
      backdrop: this.def.battleBackdrop ?? 'bg_grass',
      music: 'battleWild',
      config: {
        kind: 'wild',
        playerName: this.game.save.playerName,
        canRun: true,
        badges: this.game.save.badges.length,
      },
    };
    const result = await this.pushAndWait<BattleResult>(new BattleScene(), payload);
    await this.afterBattle(result);
  }

  /** No party means no battle - guards every entry point, not just encounters. */
  private canFight(): boolean {
    return this.game.save.party.length > 0;
  }

  private async afterBattle(result: BattleResult | undefined): Promise<void> {
    this.game.transitions.cover();
    this.playMapMusic();
    await this.game.transitions.in('fade', 30);
    this.busy = false;
    if (!result) return;
    if (result.outcome === 'lose') { await this.blackout(); return; }
    if (result.caught) catchSpecies(this.game.save, result.caught.speciesKey);
    await this.handleEvolutions();
  }

  private async handleEvolutions(): Promise<void> {
    for (let i = 0; i < this.game.save.party.length; i++) {
      const agent = this.game.save.party[i]!;
      const target = agent.pendingEvolution;
      if (!target) continue;
      agent.pendingEvolution = undefined;
      this.busy = true;
      await this.pushAndWait(new EvolutionScene(), { agent, target });
      this.playMapMusic();
      this.busy = false;
    }
  }

  private async blackout(): Promise<void> {
    this.busy = true;
    await this.say(
      t('{player} is out of usable AGÉNTMON!', { player: this.game.save.playerName }),
      t('{player} scrambled back to the nearest REPAIR BAY...', { player: this.game.save.playerName }),
    );
    for (const a of this.game.save.party) healFully(a);
    this.game.save.money = Math.max(0, Math.floor(this.game.save.money * 0.75));
    await this.game.transitions.out('fade', 40);
    const r = this.game.save.respawn;
    this.loadMap(r.map, r.x, r.y, r.facing);
    await this.game.transitions.in('fade', 40);
    this.busy = false;
  }

  // ------------------------------------------------------------ interaction
  private interact(): void {
    const p = this.player;
    const [dx, dy] = DIR_VEC[p.facing];
    const tx = p.x + dx;
    const ty = p.y + dy;

    const npc = this.npcAt(tx, ty);
    if (npc?.def) { void this.talkTo(npc); return; }

    const ball = (this.def.items ?? []).find(
      (b) => b.x === tx && b.y === ty && !flag(this.game.save, `item:${this.def.id}:${b.id}`),
    );
    if (ball) {
      setFlag(this.game.save, `item:${this.def.id}:${ball.id}`);
      bagAdd(this.game.save, ball.item, ball.count ?? 1);
      audio.sfx('item');
      void this.say(
        t('{player} found {item}!', { player: this.game.save.playerName, item: itemName(ball.item) }),
        t('{player} put the {item} in the BAG.', { player: this.game.save.playerName, item: itemName(ball.item) }),
      );
      return;
    }

    const sign = this.map.signAt(tx, ty);
    if (sign) {
      if (sign.script) { void this.runSignScript(sign); return; }
      void this.say(...localizeLines(sign.text));
      return;
    }

    // Reading a facing-away NPC standing on the same tile row (counters).
    const counterNpc = this.npcAt(tx + dx, ty + dy);
    if (counterNpc?.def && this.map.isSolid(tx, ty)) { void this.talkTo(counterNpc); return; }
  }

  private async talkTo(npc: Actor): Promise<void> {
    const def = npc.def!;
    this.busy = true;
    // Face the player.
    const dx = this.player.x - npc.x;
    const dy = this.player.y - npc.y;
    if (def.movement !== 'static' || true) {
      npc.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
    }

    if (def.script) {
      await this.runScript(def.script, npc);
      this.busy = false;
      return;
    }
    if (def.trainer && !flag(this.game.save, `beat:${def.trainer}`)) {
      await this.runTrainerBattle(def.trainer);
      this.busy = false;
      return;
    }
    if (def.trainer) {
      const t = trainerDef(def.trainer);
      await this.say(...localizeLines(t.after));
      this.busy = false;
      return;
    }
    await this.say(...(def.text ? localizeLines(def.text) : [t('...')]));
    this.busy = false;
  }

  private async runSignScript(sign: { text: string[]; script?: string }): Promise<void> {
    this.busy = true;
    if (sign.text.length > 0) await this.say(...localizeLines(sign.text));
    await this.runScript(sign.script!);
    this.busy = false;
  }

  // -------------------------------------------------------------- trainers
  private checkTrainerSight(): void {
    if (this.player.moving || this.busy) return;
    for (const npc of this.npcs) {
      const def = npc.def;
      if (!def?.trainer || !def.sight) continue;
      if (flag(this.game.save, `beat:${def.trainer}`)) continue;
      const [dx, dy] = DIR_VEC[npc.facing];
      for (let step = 1; step <= def.sight; step++) {
        const x = npc.x + dx * step;
        const y = npc.y + dy * step;
        if (this.map.isSolid(x, y) && !(x === this.player.x && y === this.player.y)) break;
        if (x === this.player.x && y === this.player.y) {
          this.busy = true;
          audio.sfx('encounter');
          this.exclaim = { actor: npc, timer: 44 };
          this.pendingTrainer = { npc, def };
          return;
        }
      }
    }
  }

  private async runTrainerApproach(npc: Actor, def: NpcDef): Promise<void> {
    // Walk the trainer up to the player, one tile at a time.
    for (let guard = 0; guard < 12; guard++) {
      const [dx, dy] = DIR_VEC[npc.facing];
      const nx = npc.x + dx;
      const ny = npc.y + dy;
      if (nx === this.player.x && ny === this.player.y) break;
      if (this.map.isSolid(nx, ny)) break;
      this.map.setSolid(npc.x, npc.y, false);
      npc.moving = true;
      npc.moveDur = WALK_FRAMES;
      npc.moveTimer = 0;
      await this.waitFor(() => !npc.moving);
      this.map.setSolid(npc.x, npc.y, true);
    }
    this.player.facing = this.opposite(npc.facing);
    await this.runTrainerBattle(def.trainer!);
    this.busy = false;
  }

  private opposite(f: Facing): Facing {
    return f === 'up' ? 'down' : f === 'down' ? 'up' : f === 'left' ? 'right' : 'left';
  }

  private async runTrainerBattle(key: string): Promise<BattleResult | undefined> {
    const trainer: TrainerDef = trainerDef(key);
    await this.say(...localizeLines(trainer.intro));
    if (!this.canFight()) return undefined;
    const foes = trainer.team.map((m) => createAgent(m.species, { level: m.level, moves: m.moves }));
    for (const f of foes) seeSpecies(this.game.save, f.speciesKey);
    audio.sfx('encounter');
    await this.game.transitions.out('battleSplit', 46);
    const payload: BattlePayload = {
      foes,
      trainerKey: key,
      backdrop: this.def.battleBackdrop ?? 'bg_city',
      music: trainer.music ?? 'battleTrainer',
      config: {
        kind: 'trainer',
        playerName: this.game.save.playerName,
        trainerName: trainer.name,
        trainerKey: key,
        trainerAi: trainer.ai ?? 1,
        payout: trainer.payout,
        canRun: false,
        badges: this.game.save.badges.length,
      },
    };
    const result = await this.pushAndWait<BattleResult>(new BattleScene(), payload);
    this.game.transitions.cover();
    this.playMapMusic();
    await this.game.transitions.in('fade', 30);

    if (!result || result.outcome === 'lose') {
      await this.blackout();
      return result;
    }
    setFlag(this.game.save, `beat:${key}`);
    await this.say(...localizeLines(trainer.defeat));
    if (trainer.badge) {
      audio.sfx('badge');
      if (!this.game.save.badges.includes(trainer.badge.flag)) this.game.save.badges.push(trainer.badge.flag);
      setFlag(this.game.save, trainer.badge.flag);
      await this.say(
        t('{player} received the {badge}!', { player: this.game.save.playerName, badge: trainerBadgeName(trainer) ?? '' }),
        ...(trainer.badge.item ? [t('You also got a {item}!', { item: itemName(trainer.badge.item) })] : []),
      );
      if (trainer.badge.item) bagAdd(this.game.save, trainer.badge.item, 1);
    }
    await this.say(...localizeLines(trainer.after));
    await this.handleEvolutions();
    return result;
  }

  // ---------------------------------------------------------------- scripts
  private async runScript(id: string, npc?: Actor): Promise<void> {
    const save = this.game.save;
    // Parameterised scripts: `shop:key1,key2,...`
    if (id.startsWith('shop:')) {
      const stock = id.slice(5).split(',').filter(Boolean);
      await this.say(t('Hi there! Take your pick of our field supplies.'));
      await this.openShop(stock);
      return;
    }
    switch (id) {
      case 'heal': {
        await this.say(t('Welcome to the REPAIR BAY!'), t('Shall I restore your AGÉNTMON to full charge?'));
        const yes = await this.ask(t('Restore your team?'));
        if (!yes) { await this.say(t('We hope to see you again!')); return; }
        audio.sfx('heal');
        for (const a of save.party) healFully(a);
        await this.say(t('Recalibrating...'), t('Your AGÉNTMON are fully charged!'), t('We hope to see you again!'));
        save.respawn = { map: this.def.id, x: this.player.x, y: this.player.y + 1, facing: 'down' };
        return;
      }
      case 'mom': {
        if (!flag(save, 'gotStarter')) {
          await this.say(
            t('MOM: Morning, {player}! PROF. ADA came by looking for you.', { player: save.playerName }),
            t('MOM: Something about a field assignment. Go on, do not keep her waiting!'),
          );
          setFlag(save, 'labRivalWaiting');
        } else {
          await this.say(
            t('MOM: Look at you, out there with a real AGÉNTMON.'),
            t('MOM: Let me top your team up before you go.'),
          );
          audio.sfx('heal');
          for (const a of save.party) healFully(a);
          await this.say(t('MOM: There. Good as new. Be careful out there!'));
        }
        return;
      }
      case 'route1_block': {
        if (flag(save, 'gotStarter')) {
          await this.say(t('TECHNICIAN: Good luck out there!'));
          return;
        }
        await this.say(
          t('TECHNICIAN: Hold up! Wild AGÉNTMON roam past this point.'),
          t('TECHNICIAN: Go see PROF. ADA and get a partner first.'),
        );
        return;
      }
      case 'route2_block':
      case 'route3_block':
      case 'citadel_block': {
        const need = id === 'route2_block' ? 'badge_volt'
          : id === 'route3_block' ? 'badge_cryo' : 'badge_thermal';
        if (flag(save, need)) {
          await this.say(t('GUARD: Clearance confirmed. On you go.'));
          return;
        }
        await this.say(
          t('GUARD: This checkpoint needs gym clearance.'),
          t('GUARD: Come back with the {badge}.', { badge: badgeInfoName(need) || t('next badge') }),
        );
        return;
      }
      case 'ada': return this.scriptAda();
      case 'rival_lab': return npc ? this.scriptRivalLab() : undefined;
      case 'storage': return this.scriptStorage();
      case 'rival_r3': return this.scriptRivalFight('rival_r3', 'rivalR3Done');
      case 'rival_final': return this.scriptRivalFight('rival_final', 'rivalFinalDone');
      case 'gym1_leader': return this.scriptLeader('gym1_leader');
      case 'gym2_leader': return this.scriptLeader('gym2_leader');
      case 'gym3_leader': return this.scriptLeader('gym3_leader');
      case 'champion': return this.scriptChampion();
      case 'gift_toolkit': return this.scriptGift('toolkit', 'ENGINEER', 'repair_kit', 1);
      case 'gift_rarechip': return this.scriptGift('rarechip', 'RESEARCHER', 'rare_chip', 1);
      case 'gift_fullreset': return this.scriptGift('fullreset', 'MEDIC', 'full_reset', 1);
      default: {
        await this.say(...(npc?.def?.text ? localizeLines(npc.def.text) : [t('...')]));
      }
    }
  }

  private async scriptGift(
    id: string, who: string, itemKey: string, count: number,
  ): Promise<void> {
    const save = this.game.save;
    if (flag(save, `gift:${id}`)) {
      await this.say(t('{who}: Use it well!', { who }));
      return;
    }
    await this.say(t('{who}: Here, take this. You look like you will need it.', { who }));
    bagAdd(save, itemKey, count);
    setFlag(save, `gift:${id}`);
    audio.sfx('item');
    await this.say(t('{player} received {item}!', { player: save.playerName, item: itemName(itemKey) }));
  }

  private async scriptAda(): Promise<void> {
    const save = this.game.save;
    if (flag(save, 'gotStarter')) {
      const seen = save.dex.seen.length;
      await this.say(
        t('PROF. ADA: How is the field data coming along?'),
        t('PROF. ADA: You have logged {count} species so far. Keep going!', { count: formatNumber(seen) }),
      );
      return;
    }
    await this.say(
      t('PROF. ADA: {player}! Perfect timing.', { player: save.playerName }),
      t('PROF. ADA: I have three prototype cores here. Each holds a partially trained AGÉNTMON.'),
      t('PROF. ADA: Choose the one you feel drawn to. It will be your partner.'),
    );
    const starters = [...STARTER_KEYS];
    const picked = await this.chooseStarter(starters);

    const starter = createAgent(picked, {
      level: 5, otName: save.playerName, otId: save.trainerId, metMap: 'ADA RESEARCH LAB',
    });
    save.party.push(starter);
    catchSpecies(save, picked);
    setFlag(save, 'gotStarter');
    audio.sfx('levelUp');
    await this.say(
      t('{player} received {species}!', { player: save.playerName, species: species(picked).name }),
      t('PROF. ADA: Take good care of it. Growth is the whole point.'),
    );

    // The rival always takes the type that beats yours.
    save.rivalStarter = rivalStarterFor(picked);
    bagAdd(save, 'nanocore', 5);
    await this.say(
      t('PROF. ADA: Oh, and take these NANOCORES. You will need them to catch new agents.'),
      t('PROF. ADA: Head north on ROUTE 1 when you are ready. VOLTSPIRE CITY has the first GYM.'),
    );
    // REX is waiting to challenge you the moment you have a partner, so he has
    // to be re-evaluated here rather than on the next map load.
    this.rebuildNpcs();
  }

  /**
   * Opens the core bay so the player can see all three prototypes before
   * committing. The bay is modal and only pops on a confirmed pick, so the
   * retry loop exists purely for the crash-recovery path (a scene torn down
   * mid-flight resumes us with `undefined`); the text picker below is the last
   * resort, so a broken bay can never leave the player without a partner.
   */
  private async chooseStarter(starters: string[]): Promise<string> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await this.pushAndWait<StarterResult>(new StarterScene(), { keys: starters });
      if (result?.key) return result.key;
      await this.say(t('PROF. ADA: Take your time. Look them over properly.'));
    }
    return this.chooseStarterByText(starters);
  }

  private async chooseStarterByText(starters: string[]): Promise<string> {
    let index = 0;
    for (;;) {
      const s = species(starters[index]!);
      await this.say(
        t('PROF. ADA: This is {species}, a {types} type.', {
          species: s.name,
          types: s.types.map((key) => typeName(key).toUpperCase()).join('/'),
        }),
        dexEntryOf(s) ?? t('A remarkable little machine.'),
      );
      if (await this.ask(t('Take {species}?', { species: s.name }))) return starters[index]!;
      index = (index + 1) % starters.length;
    }
  }

  private async scriptRivalLab(): Promise<void> {
    const save = this.game.save;
    if (!flag(save, 'gotStarter')) {
      await this.say(
        t('{rival}: There you are. ADA said we each get one.', { rival: save.rivalName }),
        t('{rival}: Pick fast. I am not waiting all day.', { rival: save.rivalName }),
      );
      return;
    }
    if (flag(save, 'rivalLabDone')) {
      await this.say(t('{rival}: See you on the road, {player}.', {
        rival: save.rivalName,
        player: save.playerName,
      }));
      return;
    }
    setFlag(save, 'rivalLabDone');
    await this.say(
      t('{rival}: So you went with that one. Fine by me.', { rival: save.rivalName }),
      t('{rival}: Let us settle this right now!', { rival: save.rivalName }),
    );
    // The rival's team scales from whichever starter you passed on.
    const key = save.rivalStarter ?? 'boltkin';
    if (!this.canFight()) return;
    const foes = [createAgent(key, { level: 5 })];
    for (const f of foes) seeSpecies(save, f.speciesKey);
    audio.sfx('encounter');
    await this.game.transitions.out('battleSplit', 46);
    const result = await this.pushAndWait<BattleResult>(new BattleScene(), {
      foes,
      backdrop: 'bg_city',
      music: 'rival',
      config: {
        kind: 'trainer',
        playerName: save.playerName,
        trainerName: save.rivalName,
        trainerSprite: 'trainer_rival',
        trainerAi: 1,
        payout: 30,
        canRun: false,
        badges: 0,
      },
    } satisfies BattlePayload);
    this.game.transitions.cover();
    this.playMapMusic();
    await this.game.transitions.in('fade', 30);
    if (!result || result.outcome === 'lose') {
      await this.say(t('{rival}: Told you. Go train, then find me.', { rival: save.rivalName }));
      for (const a of save.party) healFully(a);
      this.rebuildNpcs();
      return;
    }
    await this.say(
      t('{rival}: ...Lucky start. That is all that was.', { rival: save.rivalName }),
      t('{rival}: Next time I will be ready. Smell you later!', { rival: save.rivalName }),
    );
    // `hideIfFlag` already points at `rivalLabDone` in the map data, so the
    // rebuild is all that is needed to walk him off screen.
    this.rebuildNpcs();
    await this.handleEvolutions();
  }

  private async scriptRivalFight(key: string, doneFlag: string): Promise<void> {
    const save = this.game.save;
    if (flag(save, doneFlag)) {
      await this.say(t('{rival}: Keep moving. I will catch up.', { rival: save.rivalName }));
      return;
    }
    const result = await this.runTrainerBattle(key);
    if (result && result.outcome !== 'lose') setFlag(save, doneFlag);
  }

  private async scriptLeader(key: string): Promise<void> {
    const trainer = trainerDef(key);
    if (flag(this.game.save, `beat:${key}`)) {
      await this.say(...localizeLines(trainer.after));
      return;
    }
    await this.runTrainerBattle(key);
  }

  private async scriptChampion(): Promise<void> {
    const save = this.game.save;
    if (flag(save, 'beat:champion')) {
      await this.say(
        t('NEXUS: The CITADEL still hums. You changed something here.'),
        t('NEXUS: Come back any time, CHAMPION.'),
      );
      return;
    }
    if (save.badges.length < 3) {
      await this.say(
        t('NEXUS: Three GYM clearances are required to enter the core.'),
        t('NEXUS: You are carrying {count}. Come back when you are ready.', {
          count: formatNumber(save.badges.length),
        }),
      );
      return;
    }
    const result = await this.runTrainerBattle('champion');
    if (result && result.outcome !== 'lose') {
      setFlag(save, 'champion');
      audio.playMusic('victory', true);
      await this.say(
        t('NEXUS: ...Remarkable. You did not just out-compute me. You out-grew me.'),
        t('{player} is the new AGÉNTMON CHAMPION!', { player: save.playerName }),
        t('Your name has been written into the HALL OF FAME.'),
        t('THE END... for now.'),
      );
      await this.game.persist();
    }
  }

  // -------------------------------------------------------------- utilities
  private openMenu(): void {
    this.busy = true;
    void this.pushAndWait(new StartMenuScene()).then(() => { this.busy = false; });
  }

  /** Push a scene and resolve with whatever it passes to `pop()`. */
  private pushAndWait<T>(scene: Scene, payload?: unknown): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.resumeStack.push((r) => resolve(r as T | undefined));
      // A scene whose enter() throws is rolled back by the stack, which resumes
      // us with undefined - so the awaiting caller still completes and restores
      // the screen instead of leaving the player on a black canvas.
      void this.game.scenes.push(scene, payload).catch((err: unknown) => {
        console.error('agentmon: scene failed to start', err);
      });
    });
  }

  /** Opens a shop; used by mart clerk NPCs through the `shop` script. */
  async openShop(stock: string[]): Promise<void> {
    this.busy = true;
    await this.pushAndWait(new ShopScene(), { stock });
    this.busy = false;
  }

  private async scriptStorage(): Promise<void> {
    audio.sfx('select');
    await this.pushAndWait(new StorageScene());
  }

  private waitFor(cond: () => boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const poll = (): void => {
        if (cond()) resolve();
        else requestAnimationFrame(poll);
      };
      poll();
    });
  }

  say(...lines: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const tw = new Typewriter();
      tw.speed = this.game.textDelay;
      tw.setText(lines[0] ?? '');
      this.dialogue = { lines, index: 0, tw, resolve };
    });
  }

  ask(question: string, yes = tUpper('YES'), no = tUpper('NO')): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const tw = new Typewriter();
      tw.speed = this.game.textDelay;
      tw.setText(question);
      this.dialogue = {
        lines: [question], index: 0, tw,
        resolve: () => undefined,
        choice: { yes, no, pick: 0, resolve },
      };
    });
  }

  private updateDialogue(): void {
    const d = this.dialogue;
    if (!d) return;
    d.tw.update();
    const inp = this.game.input;

    if (d.choice && d.tw.pageComplete && d.tw.isLastPage) {
      if (inp.repeat('up') || inp.repeat('down')) {
        d.choice.pick = 1 - d.choice.pick;
        audio.sfx('cursor');
      }
      if (inp.pressed('a')) {
        audio.sfx('select');
        const pick = d.choice.pick === 0;
        const resolve = d.choice.resolve;
        this.dialogue = null;
        resolve(pick);
      } else if (inp.pressed('b')) {
        audio.sfx('cancel');
        const resolve = d.choice.resolve;
        this.dialogue = null;
        resolve(false);
      }
      return;
    }

    if (inp.pressed('a') || inp.pressed('start')) {
      if (!d.tw.advance()) return;
      d.index++;
      if (d.index >= d.lines.length) {
        const resolve = d.resolve;
        this.dialogue = null;
        resolve();
        return;
      }
      d.tw.setText(d.lines[d.index]!);
    }
  }

  // ----------------------------------------------------------------- camera
  private updateCamera(snap: boolean): void {
    const worldW = this.map.width * TILE;
    const worldH = this.map.height * TILE;
    const px = this.player.x * TILE + this.player.ox + TILE / 2;
    const py = this.player.y * TILE + this.player.oy + TILE / 2;
    let cx = px - SCREEN_W / 2;
    let cy = py - SCREEN_H / 2;
    cx = worldW <= SCREEN_W ? (worldW - SCREEN_W) / 2 : Math.max(0, Math.min(cx, worldW - SCREEN_W));
    cy = worldH <= SCREEN_H ? (worldH - SCREEN_H) / 2 : Math.max(0, Math.min(cy, worldH - SCREEN_H));
    if (snap) { this.camX = Math.round(cx); this.camY = Math.round(cy); return; }
    this.camX = Math.round(cx);
    this.camY = Math.round(cy);
  }

  // ----------------------------------------------------------------- render
  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = this.def.outdoor ? '#284c28' : '#101018';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    this.map.render(g, this.camX, this.camY, this.animTick);

    // Buildings and actors are depth-sorted by their feet.
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];

    for (const obj of this.def.objects ?? []) {
      if (obj.overhead) continue;
      list.push({
        y: (obj.y + obj.h) * TILE,
        draw: () => this.drawObject(g, obj.sprite, obj.x, obj.y, obj.w, obj.h, obj.ox ?? 0, obj.oy ?? 0),
      });
    }
    for (const crate of this.def.items ?? []) {
      if (flag(this.game.save, `item:${this.def.id}:${crate.id}`) || crate.hidden) continue;
      list.push({
        y: (crate.y + 1) * TILE,
        draw: () => this.drawItemCrate(g, crate.x, crate.y),
      });
    }
    for (const npc of this.npcs) list.push({ y: npc.y * TILE + npc.oy + TILE, draw: () => this.drawActor(g, npc) });
    list.push({
      y: this.player.y * TILE + this.player.oy + TILE + 1,
      draw: () => this.drawActor(g, this.player),
    });

    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    for (const obj of this.def.objects ?? []) {
      if (!obj.overhead) continue;
      this.drawObject(g, obj.sprite, obj.x, obj.y, obj.w, obj.h, obj.ox ?? 0, obj.oy ?? 0);
    }

    this.map.renderTop(g, this.camX, this.camY, this.animTick);

    if (this.def.tint) fillScreen(g, this.def.tint, 0.22);

    if (this.exclaim) this.drawExclaim(g);
    if (this.banner.timer > 0) this.drawBanner(g);
    if (this.dialogue) this.drawDialogue(g);
  }

  private drawObject(
    g: CanvasRenderingContext2D, sprite: string,
    tx: number, ty: number, tw: number, th: number, ox: number, oy: number,
  ): void {
    const img = assets.image(`bld:${sprite}`);
    const dx = tx * TILE - this.camX + ox;
    const dy = ty * TILE - this.camY + oy;
    if (img) {
      // Anchor to the footprint's bottom so tall art overhangs upward.
      const w = tw * TILE;
      const h = Math.round((img.height / img.width) * w);
      g.drawImage(img, dx, dy + th * TILE - h, w, h);
      return;
    }
    // Fallback block so a missing asset never hides a building.
    g.fillStyle = '#586074';
    g.fillRect(dx, dy, tw * TILE, th * TILE);
    g.fillStyle = '#38405c';
    g.fillRect(dx, dy, tw * TILE, 4);
    g.fillStyle = '#f0c840';
    g.fillRect(dx + 4, dy + 8, 4, 4);
  }

  /** Field pickups are powered supply crates, not spheres. */
  private drawItemCrate(g: CanvasRenderingContext2D, tx: number, ty: number): void {
    const x = tx * TILE - this.camX + 3;
    const y = ty * TILE - this.camY + 4;
    g.fillStyle = '#101828';
    g.fillRect(x, y, 10, 11);
    g.fillStyle = '#8c98ac';
    g.fillRect(x + 1, y + 3, 8, 7);
    g.fillStyle = '#5c687c';
    g.fillRect(x + 1, y + 8, 8, 2);
    g.fillStyle = '#3c4658';
    g.fillRect(x + 4, y + 3, 2, 5);
    g.fillStyle = '#40c8e0';
    g.fillRect(x + 1, y + 1, 8, 2);
    g.fillStyle = '#a8f0ff';
    g.fillRect(x + 2, y + 1, 6, 1);
    g.fillStyle = '#f0c840';
    g.fillRect(x + 4, y + 5, 2, 1);
  }

  private drawActor(g: CanvasRenderingContext2D, a: Actor): void {
    const sheet = this.game.sheet(`ch:${a.sprite}`);
    const x = Math.round(a.x * TILE + a.ox - this.camX + TILE / 2);
    const y = Math.round(a.y * TILE + a.oy - this.camY + TILE);

    // Shadow keeps characters planted on the grid.
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(x, y - 1, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();

    if (!sheet) {
      g.fillStyle = a === this.player ? '#4878d8' : '#c05840';
      g.fillRect(x - 6, y - 20, 12, 20);
      g.fillStyle = '#f0d8b0';
      g.fillRect(x - 4, y - 22, 8, 6);
      return;
    }
    const anim = `walk_${a.facing}`;
    const name = sheet.has(anim) ? anim : 'walk_down';
    const frames = Math.max(1, sheet.frameCount(name));
    const frame = a.moving ? Math.floor((a.moveTimer / a.moveDur) * frames) % frames : 0;
    sheet.drawFrame(g, name, frame, x, y, {});
  }

  private drawExclaim(g: CanvasRenderingContext2D): void {
    const a = this.exclaim!.actor;
    const x = Math.round(a.x * TILE + a.ox - this.camX + TILE / 2);
    const y = Math.round(a.y * TILE + a.oy - this.camY) - 12;
    const pop = Math.min(1, (44 - this.exclaim!.timer) / 8);
    const h = Math.round(14 * pop);
    g.fillStyle = '#f8f8f8';
    g.fillRect(x - 7, y - h + 2, 14, h);
    g.fillStyle = '#101828';
    g.fillRect(x - 7, y - h + 2, 14, 1);
    g.fillRect(x - 7, y + 1, 14, 1);
    g.fillRect(x - 7, y - h + 2, 1, h);
    g.fillRect(x + 6, y - h + 2, 1, h);
    if (pop >= 1) {
      g.fillStyle = '#d83030';
      g.fillRect(x - 1, y - 10, 2, 6);
      g.fillRect(x - 1, y - 3, 2, 2);
    }
  }

  private drawBanner(g: CanvasRenderingContext2D): void {
    const t = this.banner.timer;
    const slide = t > 130 ? (150 - t) / 20 : t < 20 ? t / 20 : 1;
    const w = Math.max(72, font.measure(this.banner.text) + 20);
    const x = Math.round(-w + (w + 10) * slide);
    drawWindow(g, x, 6, w, 22);
    font.draw(g, this.banner.text, x + 10, 14, 'normal', false);
  }

  private drawDialogue(g: CanvasRenderingContext2D): void {
    const d = this.dialogue!;
    d.tw.draw(g, Math.floor(this.tick / 20) % 2 === 0);
    if (!d.choice || !d.tw.pageComplete) return;
    const w = 54;
    const x = SCREEN_W - w - 6;
    const y = TEXTBOX_Y - 34;
    drawWindow(g, x, y, w, 32);
    font.draw(g, d.choice.yes, x + 16, y + 6, 'normal', false);
    font.draw(g, d.choice.no, x + 16, y + 18, 'normal', false);
    font.draw(g, '\u25b6', x + 6, y + 6 + d.choice.pick * 12, 'normal', false);
  }

  /** Used by the save menu to describe where the player is. */
  get locationName(): string {
    return t(this.def.name);
  }
}

/** Draws a small HP-style label; exported for the debug overlay. */
export function overworldDebugLabel(g: CanvasRenderingContext2D, text: string): void {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, SCREEN_H - 10, SCREEN_W, 10);
  font.draw(g, text, 2, SCREEN_H - 9, 'white', false);
}
