/** The battle scene: turns the engine's event stream into a GBA-style fight. */

import { assets } from '../../engine/assets.ts';
import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import type { SpriteSheet } from '../../engine/sprite.ts';
import {
  drawCaptureCore, drawExpBar, drawHpBar, drawHpTag, drawWindow, Menu, PALETTE,
  TEXTBOX_H, TEXTBOX_Y, Typewriter, type MenuItem,
} from '../../engine/ui.ts';
import {
  agentSpriteKey, displayName, expToNextLevel, isFainted, learnMove, maxHp, statAt,
  types as agentTypes, STATUS_COLOR, STATUS_SHORT,
  type AgentInstance,
} from '../data/agent.ts';
import { drawTint } from '../../engine/fx.ts';
import { MoveFxPlayer, resolveMoveFx, type FxAnchor } from '../battle/movefx.ts';
import { move as moveDef, moveName, species, typeDef, typeName, type Stats } from '../data/dex.ts';
import { item as itemDef, ITEMS } from '../data/items.ts';
import { trainer as trainerDef } from '../data/trainers.ts';
import { t, tUpper, upper } from '../i18n.ts';
import {
  Battle, type BattleConfig, type BattleEvent, type BattleOutcome, type PlayerAction, type Side,
} from '../battle/engine.ts';
import { addAgent, bagRemove, catchSpecies, formatMoney, seeSpecies } from '../state.ts';
import { BagScene, PartyScene } from './menu.ts';

export interface BattlePayload {
  foes: AgentInstance[];
  config: BattleConfig;
  trainerKey?: string;
  backdrop?: string;
  music?: string;
}

export interface BattleResult {
  outcome: BattleOutcome;
  caught?: AgentInstance;
}

type Step = number | (() => boolean);

const FOE_X = 174;
const FOE_Y = 68;
const PLAYER_X = 62;
const PLAYER_Y = 114;

/** Battle pads are tinted to sit naturally inside each backdrop. [light, dark] */
const PLATFORM_COLORS: Record<string, [string, string]> = {
  bg_grass: ['#88c078', '#4c7c4c'],
  bg_road: ['#c8b88c', '#8c7c58'],
  bg_city: ['#a8b4c8', '#68748c'],
  bg_night: ['#5c7088', '#2c3c50'],
  bg_cave: ['#9c8c78', '#5c5040'],
  bg_datacenter: ['#7c94b8', '#3c4c68'],
};

type Mode = 'script' | 'command' | 'moves' | 'wait';

interface SpriteState {
  anim: string;
  frame: number;
  timer: number;
  loop: boolean;
  visible: boolean;
  offX: number;
  offY: number;
  alpha: number;
  scale: number;
  flash: number;
}

function newSpriteState(): SpriteState {
  return { anim: 'idle', frame: 0, timer: 0, loop: true, visible: false, offX: 0, offY: 0, alpha: 1, scale: 1, flash: 0 };
}

/** The agent the scene is currently drawing for one side. See `pView`/`fView`. */
interface CombatView {
  agent: AgentInstance;
  covered: boolean;
}

export class BattleScene extends Scene {
  private battle!: Battle;
  private payload!: BattlePayload;
  private tick = 0;
  private mode: Mode = 'script';
  private tw = new Typewriter();
  private message = '';
  private awaitingA = false;

  private seq: Generator<Step, void, void> | null = null;
  private waitFrames = 0;
  private waitPred: (() => boolean) | null = null;

  private cmdMenu = new Menu([], 2, 2);
  private moveMenu = new Menu([], 2, 2);

  private pSprite = newSpriteState();
  private fSprite = newSpriteState();
  /**
   * Displayed HP, tweened toward `*HpTarget`. The engine resolves a whole turn
   * up front, so the model already holds the end-of-turn HP for *both* sides
   * before a single frame is drawn. Chasing the model would drain the player's
   * bar while their own attack is still playing; the bars must only ever follow
   * the event currently being narrated.
   */
  private pHpShown = 0;
  private fHpShown = 0;
  private pHpTarget = 0;
  private fHpTarget = 0;
  private expShown = 0;
  private expTarget = 0;
  private ballAnim: { t: number; shakes: number; caught: boolean; total: number } | null = null;
  private trainerSlide = 0;
  /**
   * Per-move visuals. Driven entirely from the event log like the HP bars: the
   * effect that plays belongs to the `useMove` being narrated, never to whatever
   * the engine has already resolved.
   */
  private fx = new MoveFxPlayer();
  /** Which side is currently swinging, so the lunge is applied to the right sprite. */
  private fxAttacker: Side | null = null;
  private result: BattleResult | null = null;
  /** LIFO resolvers for child scenes (bag, party); see OverworldScene. */
  private childStack: ((r: unknown) => void)[] = [];
  private caughtAgent: AgentInstance | null = null;
  private levelPanel: { agent: AgentInstance; timer: number } | null = null;
  /**
   * What the player is currently LOOKING AT, as opposed to what the engine has
   * already resolved.
   *
   * `Battle.takeTurn()` settles an entire turn before a frame is drawn, and
   * `checkFaints()` calls `doSwitch()` *while it is still building the event
   * array* - so `battle.foeC` holds the trainer's NEXT agent long before
   * `playEvents` narrates the blow that scrapped the previous one. Rendering
   * from the model therefore drew the incoming agent standing there taking a
   * hit it never received, with the wrong name, level and HP denominator.
   *
   * The rule is the same one the HP bars already follow: **the battlefield
   * follows the event log, never the model.** Only a replayed `sendOut` moves
   * the view, and only a replayed `cover` toggles the shell pose.
   */
  private pView!: CombatView;
  private fView!: CombatView;

  override async enter(payload?: unknown): Promise<void> {
    const p = payload as BattlePayload | undefined;
    if (!p?.foes?.length) throw new Error('BattleScene: payload has no foes');
    const save = this.game.save;
    // Without this the engine picks party[0] of an empty array and dies deep
    // inside makeCombatant, leaving the scene half-built.
    if (!save.party.length) throw new Error('BattleScene: the player has no agents');
    this.payload = p;
    this.battle = new Battle(save.party, p.foes, p.config);
    this.pView = { agent: this.battle.playerC.agent, covered: false };
    this.fView = { agent: this.battle.foeC.agent, covered: false };
    this.syncBars(true);
    audio.playMusic(p.music ?? 'battleWild', true);
    this.game.transitions.cover();
    void this.game.transitions.in('fade', 26);
    this.seq = this.introSequence();
    this.mode = 'script';
  }

  override resume(result?: unknown): void {
    this.game.input.clear();
    if (!this.battle) return;
    audio.playMusic(this.payload.music ?? 'battleWild');
    this.childStack.pop()?.(result);
  }

  // ------------------------------------------------------------- sequencing
  private pushChild<T>(scene: Scene, payload?: unknown): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.childStack.push((r) => resolve(r as T | undefined));
      void this.game.scenes.push(scene, payload).catch((err: unknown) => {
        console.error('agentmon: battle child scene failed to start', err);
      });
    });
  }

  private *say(text: string, hold = true): Generator<Step, void, void> {
    this.tw.speed = this.game.textDelay;
    this.tw.setText(text);
    this.message = text;
    this.awaitingA = false;
    yield () => {
      this.tw.update();
      return this.tw.pageComplete && this.tw.isLastPage;
    };
    if (hold) {
      this.awaitingA = true;
      let elapsed = 0;
      yield () => {
        elapsed++;
        if (this.game.input.pressed('a') || this.game.input.pressed('b')) return true;
        return elapsed > 78;
      };
      this.awaitingA = false;
    } else {
      yield 18;
    }
  }

  private sprite(side: Side): SpriteState {
    return side === 'player' ? this.pSprite : this.fSprite;
  }

  private play(side: Side, anim: string, loop = false): void {
    const s = this.sprite(side);
    s.anim = anim;
    s.frame = 0;
    s.timer = 0;
    s.loop = loop;
  }

  /**
   * Where a move effect starts or lands for one side. `r` is the creature's
   * on-screen half-width, so an impact is sized to the sprite it hits rather
   * than to a constant that would swamp a small unit and vanish on a big one.
   */
  private anchor(side: Side): FxAnchor {
    const s = this.sprite(side);
    const sheet = this.sheetFor(side);
    const base = side === 'player' ? { x: PLAYER_X, y: PLAYER_Y } : { x: FOE_X, y: FOE_Y };
    const w = sheet ? sheet.frameW * s.scale : side === 'player' ? 56 : 46;
    return { x: base.x + s.offX, y: base.y + s.offY, r: Math.max(12, w / 2) };
  }

  private sheetFor(side: Side): SpriteSheet | null {    const v = this.view(side);
    const key = agentSpriteKey(v.agent);
    // While COVER is up the unit is drawn shut, front-facing on both sides -
    // there is no separate back pose for a closed shell.
    if (v.covered) {
      const shut = this.game.creatureSheet(`${key}:cover`);
      if (shut) return shut;
    }
    return this.game.creatureSheet(key, side === 'player');
  }

  /** The agent currently ON SCREEN for a side - never the engine's live one. */
  private view(side: Side): CombatView {
    return side === 'player' ? this.pView : this.fView;
  }

  /** Snap a view back onto the model. Only sendOut/syncBars may call this. */
  private syncView(side: Side, agent?: AgentInstance): void {
    const c = side === 'player' ? this.battle.playerC : this.battle.foeC;
    const v = this.view(side);
    v.agent = agent ?? c.agent;
    v.covered = v.agent === c.agent ? c.covered : false;
  }

  // ------------------------------------------------------------------ intro
  private *introSequence(): Generator<Step, void, void> {
    const cfg = this.payload.config;
    if (cfg.kind === 'trainer') {
      this.trainerSlide = 0;
      yield () => {
        this.trainerSlide = Math.min(1, this.trainerSlide + 0.045);
        return this.trainerSlide >= 1;
      };
      yield* this.say(t('{name} wants to battle!', { name: cfg.trainerName ?? tUpper('A CHALLENGER') }));
      yield () => {
        this.trainerSlide = Math.max(0, this.trainerSlide - 0.06);
        return this.trainerSlide <= 0;
      };
      this.fSprite.visible = true;
      this.play('foe', 'appear');
      yield* this.say(t('{trainer} sent out {name}!', {
        trainer: cfg.trainerName ?? tUpper('FOE'),
        name: this.battle.foeC.agent ? displayName(this.battle.foeC.agent) : '',
      }), false);
    } else {
      this.fSprite.visible = true;
      this.play('foe', 'appear');
      seeSpecies(this.game.save, this.battle.foeC.agent.speciesKey);
      yield* this.say(t('A wild {name} appeared!', { name: displayName(this.battle.foeC.agent) }));
    }
    this.play('foe', 'idle', true);

    this.pSprite.visible = true;
    this.play('player', 'appear');
    yield* this.say(t('Go! {name}!', { name: displayName(this.battle.playerC.agent) }), false);
    this.play('player', 'idle', true);
    this.syncBars(true);
    yield* this.beginTurn();
  }

  // ---------------------------------------------------------------- menus
  private openCommandMenu(): void {
    this.seq = null;
    this.mode = 'command';
    this.message = t('What will {name} do?', { name: displayName(this.battle.playerC.agent) });
    this.tw.setText(this.message);
    this.tw.skipAll();
    this.cmdMenu.setItems([
      { label: tUpper('FIGHT'), value: 'fight' },
      { label: tUpper('BAG'), value: 'bag' },
      { label: tUpper('AGENT'), value: 'agent' },
      { label: this.payload.config.kind === 'wild' ? tUpper('RUN') : tUpper('RUN'), value: 'run' },
    ]);
  }

  private openMoveMenu(): void {
    const agent = this.battle.playerC.agent;
    const items: MenuItem[] = agent.moves.map((slot, i) => ({
      label: moveName(moveDef(slot.key)),
      value: String(i),
      disabled: slot.pp <= 0,
    }));
    if (items.length === 0) items.push({ label: tUpper('STRUGGLE'), value: '-1' });
    this.moveMenu.setItems(items);
    this.mode = 'moves';
  }

  // ----------------------------------------------------------------- update
  update(): void {
    // enter() can legitimately reject on bad data; until the stack unwinds we
    // must not touch the half-built state or every frame would throw.
    if (!this.battle) return;
    this.tick++;
    this.updateSprites();
    this.updateFx();
    this.tweenBars();
    if (this.levelPanel && --this.levelPanel.timer <= 0) this.levelPanel = null;

    if (this.seq) { this.advanceSequence(); return; }

    const inp = this.game.input;
    if (this.mode === 'command') {
      if ((inp.repeat('up') || inp.repeat('down')) && this.cmdMenu.move(0, inp.repeat('down') ? 1 : -1)) audio.sfx('cursor');
      if ((inp.repeat('left') || inp.repeat('right')) && this.cmdMenu.move(inp.repeat('right') ? 1 : -1, 0)) audio.sfx('cursor');
      if (inp.pressed('a')) {
        audio.sfx('select');
        const v = this.cmdMenu.current?.value;
        if (v === 'fight') this.openMoveMenu();
        else if (v === 'bag') void this.chooseItem();
        else if (v === 'agent') void this.chooseSwitch();
        else if (v === 'run') this.runSequence({ kind: 'run' });
      }
      return;
    }

    if (this.mode === 'moves') {
      if ((inp.repeat('up') || inp.repeat('down')) && this.moveMenu.move(0, inp.repeat('down') ? 1 : -1)) audio.sfx('cursor');
      if ((inp.repeat('left') || inp.repeat('right')) && this.moveMenu.move(inp.repeat('right') ? 1 : -1, 0)) audio.sfx('cursor');
      if (inp.pressed('b')) { audio.sfx('cancel'); this.openCommandMenu(); return; }
      if (inp.pressed('a')) {
        const cur = this.moveMenu.current;
        if (!cur) return;
        if (cur.disabled) { audio.sfx('error'); return; }
        audio.sfx('select');
        this.runSequence({ kind: 'move', index: Number(cur.value) });
      }
    }
  }

  private advanceSequence(): void {
    if (this.waitPred) {
      if (!this.waitPred()) return;
      this.waitPred = null;
    }
    if (this.waitFrames > 0) { this.waitFrames--; return; }
    const next = this.seq!.next();
    if (next.done) { this.seq = null; return; }
    const step = next.value;
    if (typeof step === 'number') this.waitFrames = step;
    else this.waitPred = step;
  }

  private runSequence(action: PlayerAction): void {
    this.mode = 'script';
    this.seq = this.turnSequence(action);
  }

  // ------------------------------------------------------------------ turns
  /**
   * Start a turn. The order is settled before the player is asked, so when the
   * foe is faster its move plays out first and only then does the menu open —
   * you always choose knowing what you are answering.
   */
  private *beginTurn(): Generator<Step, void, void> {
    const opening = this.battle.openTurn();
    yield* this.playEvents(opening.events);
    if (opening.playerActs) this.openCommandMenu();
    else yield* this.postTurn();
  }

  private *turnSequence(action: PlayerAction): Generator<Step, void, void> {
    const events = this.battle.closeTurn(action);
    yield* this.playEvents(events);
    yield* this.postTurn();
  }

  private *postTurn(): Generator<Step, void, void> {
    if (this.battle.outcome) { yield* this.finish(); return; }
    // Someone fainted and needs replacing.
    if (isFainted(this.battle.playerC.agent)) {
      const alive = this.game.save.party.some((a) => !isFainted(a));
      if (!alive) { yield* this.finish(); return; }
      yield* this.say(t('Choose your next AGÉNTMON!'), false);
      let index = -1;
      yield () => {
        if (this.childStack.length) return false;
        if (index >= 0) return true;
        void this.pushChild<{ index: number }>(new PartyScene(), { mode: 'switchIn' })
          .then((r) => { index = r?.index ?? this.game.save.party.findIndex((a) => !isFainted(a)); });
        return false;
      };
      yield () => index >= 0;
      const events = this.battle.replaceFainted(index);
      yield* this.playEvents(events);
    }
    if (this.battle.outcome) { yield* this.finish(); return; }
    yield* this.beginTurn();
  }

  private *finish(): Generator<Step, void, void> {
    const outcome = this.battle.outcome ?? 'lose';
    if (outcome === 'win' && this.payload.config.kind === 'trainer') {
      const key = this.payload.config.trainerKey;
      const tr = key ? trainerDef(key) : null;
      const prize = this.battle.prize();
      this.game.save.money = Math.min(999999, this.game.save.money + prize);
      audio.playMusic('victory', true);
      yield* this.say(t('{name} was defeated!', { name: this.payload.config.trainerName ?? tr?.name ?? tUpper('FOE') }));
      yield* this.say(t('{name} got \u00a5{amount} for winning!', {
        name: this.game.save.playerName, amount: formatMoney(prize),
      }));
    } else if (outcome === 'win') {
      audio.playMusic('victory', true);
    } else if (outcome === 'caught') {
      const caught = this.battle.caught;
      if (caught) {
        this.caughtAgent = caught;
        catchSpecies(this.game.save, caught.speciesKey);
        const where = addAgent(this.game.save, caught);
        audio.playMusic('victory', true);
        yield* this.say(t('Gotcha! {name} was captured!', { name: displayName(caught) }));
        const sp = species(caught.speciesKey);
        yield* this.say(t("{name}'s data was added to the AGÉNTDEX.", { name: sp.name }));
        if (where === 'box') yield* this.say(t('{name} was transferred to STORAGE.', { name: displayName(caught) }));
        else if (where === 'full') yield* this.say(t('Your storage is full! It had to be released...'));
      }
    } else if (outcome === 'fled') {
      yield* this.say(t('Got away safely!'), false);
    }
    this.result = { outcome, caught: this.caughtAgent ?? undefined };
    yield 12;
    this.game.transitions.cover();
    this.game.pop(this.result);
  }

  // ----------------------------------------------------------------- events
  private *playEvents(events: BattleEvent[]): Generator<Step, void, void> {
    for (const ev of events) {
      switch (ev.t) {
        case 'text':
          yield* this.say(ev.text, ev.wait !== false);
          break;
        case 'sfx':
          audio.sfx(ev.name as never);
          break;
        case 'useMove': {
          this.play(ev.side, 'attack');
          // The visual belongs to the move being narrated. Wait only until the
          // effect connects - its debris keeps playing over the damage event, so
          // the target's flinch lands on the impact rather than after it.
          const spec = resolveMoveFx(ev.move);
          this.fxAttacker = ev.side;
          this.fx.play(spec, this.anchor(ev.side), this.anchor(ev.side === 'player' ? 'foe' : 'player'));
          yield () => this.fx.contacted || this.fx.done;
          break;
        }
        case 'damage': {
          const s = this.sprite(ev.side);
          this.play(ev.side, 'hit');
          s.flash = 20;
          audio.sfx(ev.effectiveness > 1 ? 'hitSuper' : ev.effectiveness < 1 ? 'hitWeak' : 'hitNormal');
          this.setHpTarget(ev.side, ev.to);
          yield () => this.hpArrived(ev.side);
          this.play(ev.side, 'idle', true);
          break;
        }
        case 'heal': {
          audio.sfx('heal');
          this.setHpTarget(ev.side, ev.to);
          yield () => this.hpArrived(ev.side);
          break;
        }
        case 'faint': {
          this.releaseFx(ev.side);
          audio.sfx('faint');
          this.play(ev.side, 'faint');
          const s = this.sprite(ev.side);
          yield () => {
            s.offY += 2.2;
            s.alpha = Math.max(0, s.alpha - 0.05);
            return s.alpha <= 0;
          };
          s.visible = false;
          break;
        }
        case 'withdraw': {
          this.releaseFx(ev.side);
          const s = this.sprite(ev.side);
          yield () => {
            s.scale = Math.max(0.05, s.scale - 0.08);
            s.alpha = Math.max(0, s.alpha - 0.09);
            return s.scale <= 0.06;
          };
          s.visible = false;
          break;
        }
        case 'sendOut': {
          this.releaseFx(ev.side);
          const s = this.sprite(ev.side);
          // The event log is the only place the battlefield is allowed to
          // change hands: everything drawn now belongs to the new agent.
          const roster = ev.side === 'player' ? this.battle.player : this.battle.foe;
          this.syncView(ev.side, roster.members[ev.index]);
          s.visible = true;
          s.alpha = 1;
          s.scale = 1;
          s.offX = 0;
          s.offY = 0;
          this.play(ev.side, 'appear');
          if (ev.side === 'player') {
            this.pHpTarget = this.pView.agent.hp;
            this.pHpShown = this.pHpTarget;
            this.expTarget = this.expRatio();
            this.expShown = this.expTarget;
          } else {
            this.fHpTarget = this.fView.agent.hp;
            this.fHpShown = this.fHpTarget;
            seeSpecies(this.game.save, this.fView.agent.speciesKey);
          }
          yield 24;
          this.play(ev.side, 'idle', true);
          break;
        }
        case 'status':
        case 'statChange':
        case 'miss':
        case 'noEffect':
          break;
        case 'cover': {
          // The pose belongs to the narration, not the model: the engine may
          // already have opened the shell (or swapped the agent out entirely)
          // several events ahead of what is on screen.
          this.view(ev.side).covered = ev.up;
          audio.sfx(ev.up ? 'charge' : 'cancel');
          this.play(ev.side, 'idle', true);
          yield 12;
          break;
        }
        case 'throwBall': {
          audio.sfx('ballThrow');
          this.ballAnim = { t: 0, shakes: ev.shakes, caught: ev.caught, total: 0 };
          const fs = this.fSprite;
          yield () => {
            this.ballAnim!.t += 1;
            return this.ballAnim!.t > 34;
          };
          yield () => {
            fs.scale = Math.max(0.05, fs.scale - 0.09);
            fs.alpha = Math.max(0, fs.alpha - 0.1);
            return fs.scale <= 0.06;
          };
          fs.visible = false;
          for (let i = 0; i < ev.shakes; i++) {
            yield 26;
            audio.sfx('ballShake');
            this.ballAnim!.total = i + 1;
          }
          yield 24;
          if (ev.caught) {
            audio.sfx('ballCatch');
            yield 24;
          } else {
            fs.visible = true;
            fs.scale = 1;
            fs.alpha = 1;
            this.ballAnim = null;
            this.play('foe', 'appear');
            yield 16;
            this.play('foe', 'idle', true);
          }
          break;
        }
        case 'useItem':
          audio.sfx('item');
          // The bag scene only reports the choice; the battle is what actually
          // spends it, so a refused throw (trainer battle) costs nothing.
          bagRemove(this.game.save, ev.itemKey, 1);
          break;
        case 'exp': {
          const target = this.game.save.party[ev.index];
          if (!target) break;
          if (target.uid === this.pView.agent.uid) {
            audio.sfx('charge');
            // A level-up tops the bar out first; the leftover is animated by
            // the levelUp events that follow this one.
            this.expTarget = ev.result.levels.length > 0 ? 1 : this.expRatio();
            yield () => Math.abs(this.expShown - this.expTarget) < 0.01;
          }
          break;
        }
        case 'levelUp': {
          audio.sfx('levelUp');
          const agent = this.game.save.party[ev.index];
          if (agent) this.levelPanel = { agent, timer: 110 };
          if (agent && agent.uid === this.pView.agent.uid) {
            this.expShown = 0;
            // Only the last level of the batch keeps the remainder; any level
            // before it fills the bar all over again.
            this.expTarget = agent && ev.level >= agent.level ? this.expRatio() : 1;
          }
          yield 40;
          break;
        }
        case 'learnMove': {
          const agent = this.game.save.party[ev.index];
          if (!agent) break;
          const md = moveDef(ev.moveKey);
          if (agent.moves.length < 4) {
            learnMove(agent, ev.moveKey);
            yield* this.say(t('{name} learned {move}!', { name: displayName(agent), move: moveName(md) }));
          } else {
            yield* this.say(t('{name} wants to learn {move},', { name: displayName(agent), move: moveName(md) }));
            yield* this.say(t('but it already knows four moves. It gave up on {move}.', { move: moveName(md) }));
          }
          break;
        }
        case 'evolve': {
          const agent = this.game.save.party[ev.index];
          if (agent) agent.pendingEvolution = ev.to;
          break;
        }
        case 'flee':
          if (ev.success) audio.sfx('flee');
          break;
        case 'requestSwitch':
          break;
        case 'end':
          break;
      }
    }
  }

  // ------------------------------------------------------------- sub-scenes
  private async chooseItem(): Promise<void> {
    this.mode = 'wait';
    const res = await this.pushChild<{ key: string }>(new BagScene(), { mode: 'battle' });
    if (!res?.key) { this.openCommandMenu(); return; }
    const def = itemDef(res.key);
    if (def.category === 'medicine' || def.revive !== undefined) {
      const target = await this.pushChild<{ index: number }>(new PartyScene(), {
        mode: 'useItem', itemKey: res.key,
      });
      if (target?.index === undefined) { this.openCommandMenu(); return; }
      this.runSequence({ kind: 'item', key: res.key, targetIndex: target.index });
      return;
    }
    this.runSequence({ kind: 'item', key: res.key });
  }

  private async chooseSwitch(): Promise<void> {
    this.mode = 'wait';
    const res = await this.pushChild<{ index: number }>(new PartyScene(), { mode: 'battle' });
    if (res?.index === undefined) { this.openCommandMenu(); return; }
    if (res.index === this.battle.player.activeIndex) { this.openCommandMenu(); return; }
    if (isFainted(this.game.save.party[res.index]!)) { this.openCommandMenu(); return; }
    this.runSequence({ kind: 'switch', index: res.index });
  }

  // ---------------------------------------------------------------- helpers
  private expRatio(): number {
    const a = this.pView.agent;
    const { have, need } = expToNextLevel(a);
    return need <= 0 ? 1 : Math.max(0, Math.min(1, have / need));
  }

  private syncBars(snap: boolean): void {
    if (!snap) return;
    this.syncView('player');
    this.syncView('foe');
    this.pHpTarget = this.pView.agent.hp;
    this.fHpTarget = this.fView.agent.hp;
    this.expTarget = this.expRatio();
    this.pHpShown = this.pHpTarget;
    this.fHpShown = this.fHpTarget;
    this.expShown = this.expTarget;
  }

  /** Point a bar at a new value; `playEvents` is the only caller. */
  private setHpTarget(side: Side, to: number): void {
    if (side === 'player') this.pHpTarget = to; else this.fHpTarget = to;
  }

  private hpArrived(side: Side): boolean {
    return side === 'player'
      ? Math.abs(this.pHpShown - this.pHpTarget) < 0.6
      : Math.abs(this.fHpShown - this.fHpTarget) < 0.6;
  }

  private tweenBars(): void {
    const pMax = maxHp(this.pView.agent);
    const fMax = maxHp(this.fView.agent);
    const pStep = Math.max(0.35, pMax / 90);
    const fStep = Math.max(0.35, fMax / 90);
    if (this.pHpShown > this.pHpTarget) this.pHpShown = Math.max(this.pHpTarget, this.pHpShown - pStep);
    else if (this.pHpShown < this.pHpTarget) this.pHpShown = Math.min(this.pHpTarget, this.pHpShown + pStep);
    if (this.fHpShown > this.fHpTarget) this.fHpShown = Math.max(this.fHpTarget, this.fHpShown - fStep);
    else if (this.fHpShown < this.fHpTarget) this.fHpShown = Math.min(this.fHpTarget, this.fHpShown + fStep);

    if (this.expShown < this.expTarget) this.expShown = Math.min(this.expTarget, this.expShown + 0.012);
    else if (this.expShown > this.expTarget) this.expShown = Math.max(this.expTarget, this.expShown - 0.03);
  }

  private updateSprites(): void {
    for (const side of ['player', 'foe'] as Side[]) {
      const s = this.sprite(side);
      if (s.flash > 0) s.flash--;
      const sheet = this.sheetFor(side);
      if (!sheet || !sheet.has(s.anim)) continue;
      const frames = sheet.frameCount(s.anim);
      const rate = s.anim === 'idle' ? 10 : 5;
      if (++s.timer >= rate) {
        s.timer = 0;
        if (s.frame + 1 >= frames) {
          if (s.loop) s.frame = 0;
        } else s.frame++;
      }
    }
  }

  /**
   * Advances the move effect and converts its lunge output into a sprite offset.
   * Ownership of the attacker's offset is released the moment the effect ends,
   * so a lunge can never leave a creature stranded off its platform - and the
   * faint/withdraw/sendOut handlers release it early, since those own the offset
   * themselves.
   */
  private updateFx(): void {
    const attacker = this.fxAttacker;
    this.fx.update();
    if (!attacker) return;
    const s = this.sprite(attacker);
    if (this.fx.done) {
      s.offX = 0;
      s.offY = 0;
      this.fxAttacker = null;
      return;
    }
    const dir = attacker === 'player' ? 1 : -1;
    s.offX = Math.round(this.fx.lunge * 20 * dir);
    s.offY = Math.round(this.fx.lunge * -8 * dir);
    if (this.fx.impact) this.sprite(attacker === 'player' ? 'foe' : 'player').flash = 8;
  }

  /** Hands the attacker's offset back before another handler takes it over. */
  private releaseFx(side: Side): void {
    if (this.fxAttacker !== side) return;
    const s = this.sprite(side);
    s.offX = 0;
    s.offY = 0;
    this.fxAttacker = null;
  }

  // ----------------------------------------------------------------- render
  render(g: CanvasRenderingContext2D): void {
    if (!this.battle) return;
    this.drawBackdrop(g);

    // Impact shake moves the battlefield, never the backdrop or the HUD: shaking
    // the backdrop would expose the screen edges, and shaking the textbox makes
    // the narration unreadable at exactly the moment it matters.
    const sh = this.fx.shake;
    const sx = sh > 0 ? Math.round(Math.sin(this.tick * 1.9) * sh * 0.7) : 0;
    const sy = sh > 0 ? Math.round(Math.cos(this.tick * 2.7) * sh * 0.45) : 0;
    g.save();
    if (sx || sy) g.translate(sx, sy);
    this.drawPlatforms(g);

    if (this.trainerSlide > 0) this.drawTrainerIntro(g);

    this.drawCreature(g, 'foe');
    this.drawCreature(g, 'player');
    this.fx.draw(g);
    g.restore();

    if (this.ballAnim) this.drawBall(g);
    if (this.fx.flash > 0) {
      drawTint(g, SCREEN_W, SCREEN_H - TEXTBOX_H - 2, '#ffffff', this.fx.flash, true);
    }

    // While the challenger portrait is on screen their agent has not been sent
    // out yet, so its status panel must not be showing.
    const foeBoxHidden = this.trainerSlide > 0;
    if (!foeBoxHidden && (this.fSprite.visible || this.fView.agent.hp > 0)) this.drawFoeBox(g);
    if (this.pSprite.visible && !this.levelPanel) this.drawPlayerBox(g);

    if (this.levelPanel) this.drawLevelPanel(g);

    this.drawTextbox(g);
    if (this.mode === 'command') this.drawCommandMenu(g);
    if (this.mode === 'moves') this.drawMoveMenu(g);
  }

  private drawBackdrop(g: CanvasRenderingContext2D): void {
    const img = assets.image(`bg:${this.payload.backdrop ?? 'bg_grass'}`);
    if (img) {
      g.drawImage(img, 0, 0, SCREEN_W, SCREEN_H - TEXTBOX_H);
    } else {
      const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
      grad.addColorStop(0, '#78b0e8');
      grad.addColorStop(1, '#c8e0f8');
      g.fillStyle = grad;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    g.fillStyle = '#f8f8f8';
    g.fillRect(0, SCREEN_H - TEXTBOX_H - 2, SCREEN_W, TEXTBOX_H + 2);
  }

  private drawPlatforms(g: CanvasRenderingContext2D): void {
    const drawPad = (cx: number, cy: number, rx: number, light: string, dark: string): void => {
      g.fillStyle = dark;
      g.beginPath();
      g.ellipse(cx, cy, rx, rx * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = light;
      g.beginPath();
      g.ellipse(cx, cy - 2, rx - 2, rx * 0.26, 0, 0, Math.PI * 2);
      g.fill();
    };
    const [light, dark] = PLATFORM_COLORS[this.payload.backdrop ?? 'bg_grass'] ?? PLATFORM_COLORS.bg_grass;
    drawPad(FOE_X, FOE_Y + 4, 40, light, dark);
    drawPad(PLAYER_X, PLAYER_Y + 4, 52, light, dark);
  }

  private drawCreature(g: CanvasRenderingContext2D, side: Side): void {
    const s = this.sprite(side);
    if (!s.visible) return;
    const agent = this.view(side).agent;
    const sheet = this.sheetFor(side);
    const baseX = side === 'player' ? PLAYER_X : FOE_X;
    const baseY = side === 'player' ? PLAYER_Y : FOE_Y;
    const x = baseX + s.offX;
    const y = baseY + s.offY;

    if (!sheet) {
      // Placeholder silhouette so the fight still reads without art.
      const sp = species(agent.speciesKey);
      const w = side === 'player' ? 56 : 46;
      g.globalAlpha = s.alpha;
      g.fillStyle = typeDef(agentTypes(agent)[0]!).color ?? '#586074';
      g.fillRect(x - w / 2, y - w, w, w);
      g.globalAlpha = 1;
      font.drawCentered(g, sp.name, x, y - w - 10, 'white');
      return;
    }

    const anim = sheet.has(s.anim) ? s.anim : 'idle';
    sheet.drawFrame(g, anim, s.frame, x, y, { alpha: s.alpha, scale: s.scale });
    if (s.flash > 0 && Math.floor(s.flash / 3) % 2 === 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35;
      sheet.drawFrame(g, anim, s.frame, x, y, { alpha: 1, scale: s.scale });
      g.restore();
    }
  }

  private drawBall(g: CanvasRenderingContext2D): void {
    const b = this.ballAnim!;
    const t = Math.min(1, b.t / 34);
    const x = PLAYER_X + (FOE_X - PLAYER_X) * t;
    const y = PLAYER_Y - 20 + (FOE_Y - PLAYER_Y + 20) * t - Math.sin(t * Math.PI) * 46;
    const wobble = b.total > 0 ? Math.sin(this.tick / 3) * 3 : 0;
    const cx = Math.round(t >= 1 ? FOE_X + wobble : x);
    const cy = Math.round(t >= 1 ? FOE_Y - 6 : y);
    drawCaptureCore(g, cx, cy, t < 1 ? Math.floor(b.t / 3) : -1, this.tick);
  }

  private drawTrainerIntro(g: CanvasRenderingContext2D): void {
    const key = this.payload.config.trainerKey;
    const t = key ? trainerDef(key) : null;
    const sprite = t?.sprite ?? this.payload.config.trainerSprite;
    const img = sprite ? assets.image(`tr:${sprite}`) : null;
    const x = SCREEN_W - 60 + (1 - this.trainerSlide) * 120;
    if (img) {
      g.drawImage(img, x - img.width / 2, 96 - img.height);
    } else {
      g.fillStyle = '#404868';
      g.fillRect(x - 22, 34, 44, 62);
    }
  }

  private drawFoeBox(g: CanvasRenderingContext2D): void {
    const a = this.fView.agent;
    const x = 6;
    const y = 10;
    drawWindow(g, x, y, 108, 30, 'flat');
    font.draw(g, displayName(a).slice(0, 10), x + 6, y + 4, 'normal', false);
    font.drawRight(g, t(':L{level}', { level: a.level }), x + 102, y + 4, 'normal', false);
    drawHpTag(g, x + 6, y + 17);
    drawHpBar(g, x + 24, y + 17, 74, this.fHpShown / maxHp(a));
    if (a.status !== 'none') {
      g.fillStyle = STATUS_COLOR[a.status];
      g.fillRect(x + 6, y + 24, 22, 8);
      font.draw(g, tUpper(STATUS_SHORT[a.status]), x + 8, y + 25, 'white', false);
    }
    if (this.game.save.dex.caught.includes(a.speciesKey)) {
      g.fillStyle = PALETTE.gold;
      g.fillRect(x + 100, y + 24, 6, 6);
      g.fillStyle = PALETTE.dark;
      g.fillRect(x + 102, y + 26, 2, 2);
    }
  }

  private drawPlayerBox(g: CanvasRenderingContext2D): void {
    const a = this.pView.agent;
    const x = SCREEN_W - 118;
    const y = SCREEN_H - TEXTBOX_H - 46;
    drawWindow(g, x, y, 112, 40, 'flat');
    font.draw(g, displayName(a).slice(0, 10), x + 6, y + 3, 'normal', false);
    font.drawRight(g, t(':L{level}', { level: a.level }), x + 106, y + 3, 'normal', false);
    drawHpTag(g, x + 6, y + 15);
    drawHpBar(g, x + 24, y + 15, 74, this.pHpShown / maxHp(a));
    font.drawRight(g, t('{current}/{max}', { current: Math.ceil(this.pHpShown), max: maxHp(a) }), x + 106, y + 24, 'normal', false);
    drawExpBar(g, x + 6, y + 34, 100, this.expShown);
    if (a.status !== 'none') {
      g.fillStyle = STATUS_COLOR[a.status];
      g.fillRect(x + 6, y + 24, 22, 8);
      font.draw(g, tUpper(STATUS_SHORT[a.status]), x + 8, y + 25, 'white', false);
    }
  }

  private drawLevelPanel(g: CanvasRenderingContext2D): void {
    const a = this.levelPanel!.agent;
    const sp = species(a.speciesKey);
    const prev = Math.max(1, a.level - 1);
    const rows: [string, keyof Stats][] = [
      [tUpper('HP'), 'hp'], [tUpper('ATTACK'), 'atk'], [tUpper('DEFENSE'), 'def'],
      [tUpper('SP.ATK'), 'spa'], [tUpper('SP.DEF'), 'spd'], [tUpper('SPEED'), 'spe'],
    ];
    const x = SCREEN_W - 106;
    const y = 18;
    const h = 26 + rows.length * 11;
    drawWindow(g, x, y, 102, h);
    font.draw(g, tUpper('LEVEL UP!'), x + 8, y + 5, 'gold', false);
    font.drawRight(g, t('Lv{level}', { level: a.level }), x + 94, y + 5, 'normal', false);
    for (const [i, [label, key]] of rows.entries()) {
      const ry = y + 20 + i * 11;
      const now = statAt(sp, key, a.level, a.ivs[key], a.evs[key]);
      const gain = now - statAt(sp, key, prev, a.ivs[key], a.evs[key]);
      font.draw(g, label, x + 8, ry, 'normal', false);
      font.drawRight(g, t('{value}', { value: now }), x + 70, ry, 'normal', false);
      if (gain > 0) font.draw(g, t('+{gain}', { gain }), x + 78, ry, 'green', false);
    }
  }

  private drawTextbox(g: CanvasRenderingContext2D): void {
    if (this.mode === 'command' || this.mode === 'moves') {
      drawWindow(g, 2, TEXTBOX_Y, 140, TEXTBOX_H);
      const lines = font.wrap(this.message, 128);
      for (const [i, line] of lines.slice(0, 3).entries()) {
        font.draw(g, line, 10, TEXTBOX_Y + 8 + i * 12, 'normal', false);
      }
      return;
    }
    this.tw.draw(g, this.awaitingA && Math.floor(this.tick / 16) % 2 === 0);
  }

  private drawCommandMenu(g: CanvasRenderingContext2D): void {
    const x = 146;
    const y = TEXTBOX_Y;
    drawWindow(g, x, y, SCREEN_W - x - 2, TEXTBOX_H);
    this.cmdMenu.draw(g, x + 16, y + 10, 18, 44);
  }

  private drawMoveMenu(g: CanvasRenderingContext2D): void {
    const agent = this.battle.playerC.agent;
    const x = 2;
    const y = TEXTBOX_Y;
    drawWindow(g, x, y, 156, TEXTBOX_H);
    this.moveMenu.draw(g, x + 14, y + 8, 13, 70);

    // PP / type panel on the right, exactly like the originals.
    drawWindow(g, 160, y, SCREEN_W - 162, TEXTBOX_H);
    const slot = agent.moves[this.moveMenu.index];
    if (!slot) return;
    const md = moveDef(slot.key);
    font.draw(g, tUpper('PP'), 168, y + 8, 'dim', false);
    font.drawRight(g, t('{pp}/{max}', { pp: slot.pp, max: slot.maxPp }), SCREEN_W - 8, y + 8, 'normal', false);
    const td = typeDef(md.type);
    g.fillStyle = td.color ?? '#586074';
    g.fillRect(166, y + 22, 66, 12);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(166, y + 32, 66, 2);
    font.drawCentered(g, upper(typeName(md.type)), 199, y + 24, 'white');
  }
}

/** Utility used by the party screen to preview a battle item's usefulness. */
export function itemUsableInBattle(key: string): boolean {
  const def = ITEMS[key];
  if (!def) return false;
  return def.category === 'ball' || def.category === 'medicine' || def.category === 'battle';
}

/** Convenience for scenes that need to know if the bag has any capture cores left. */
export function hasAnyBall(bag: { key: string; count: number }[]): boolean {
  return bag.some((b) => ITEMS[b.key]?.category === 'ball' && b.count   > 0);
}