/** The Game object: owns the screen, input, scenes, assets and the active save. */

import { assets } from '../engine/assets.ts';
import { audio } from '../engine/audio.ts';
import { Input } from '../engine/input.ts';
import { Rng } from '../engine/rng.ts';
import { Screen } from '../engine/screen.ts';
import { SceneStack, type Scene } from '../engine/scene.ts';
import { GridAtlas, SpriteSheet } from '../engine/sprite.ts';
import { buildTileset, type TileSetResult } from '../engine/tilegen.ts';
import { Transitions } from '../engine/transition.ts';
import { setDex } from './data/dex.ts';
import { saves } from './save.ts';
import { DEFAULT_OPTIONS, newSave, type SaveData } from './state.ts';

/**
 * Two and a half seconds. Every legitimate cover is followed immediately by a
 * transition, so a curtain that outlives this means an await was lost - short
 * enough that a wedged screen self-heals before the player gives up on it.
 */
const STUCK_CURTAIN_FRAMES = 150;

export class Game {
  readonly screen: Screen;
  readonly input = new Input();
  readonly scenes: SceneStack;
  readonly transitions = new Transitions();
  readonly rng = new Rng();

  save: SaveData = newSave('ADA', 'm', 'REX');
  /** The slot the current session reads/writes. */
  slot = 1;
  /** Frame counter used by every scene for blink/animation phases. */
  tick = 0;

  private tilesetCache: TileSetResult | null = null;
  private sheets = new Map<string, SpriteSheet | null>();
  private atlases = new Map<string, GridAtlas | null>();

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas);
    this.scenes = new SceneStack(this);
  }

  get tiles(): TileSetResult {
    if (!this.tilesetCache) this.tilesetCache = buildTileset();
    return this.tilesetCache;
  }

  // ------------------------------------------------------------------ assets
  /** Build (and memoise) a SpriteSheet from a queued `queueSheet` pair. */
  sheet(key: string): SpriteSheet | null {
    const cached = this.sheets.get(key);
    if (cached !== undefined) return cached;
    const img = assets.image(key);
    const meta = assets.sheetMeta(key);
    if (!img || !meta) {
      this.sheets.set(key, null);
      return null;
    }
    const anims: Record<string, { row: number; frames: number }> = {};
    for (const [name, def] of Object.entries(meta.animations ?? {})) {
      anims[name] = { row: def.row, frames: def.frames };
    }
    const sheet = new SpriteSheet(img, meta.frameWidth, meta.frameHeight, anims);
    this.sheets.set(key, sheet);
    return sheet;
  }

  atlas(key: string): GridAtlas | null {
    const cached = this.atlases.get(key);
    if (cached !== undefined) return cached;
    const img = assets.image(key);
    const meta = assets.data<{
      frameWidth: number;
      frameHeight: number;
      columns: number;
      index: Record<string, number>;
    }>(`${key}:meta`);
    if (!img || !meta) {
      this.atlases.set(key, null);
      return null;
    }
    const at = new GridAtlas(img, meta.frameWidth, meta.frameHeight, meta.columns, meta.index);
    this.atlases.set(key, at);
    return at;
  }

  creatureSheet(speciesKey: string, back = false): SpriteSheet | null {
    return this.sheet(back ? `cr:${speciesKey}:back` : `cr:${speciesKey}`);
  }

  charSheet(key: string): SpriteSheet | null {
    return this.sheet(`ch:${key}`) ?? this.sheet('ch:player_m');
  }

  // ------------------------------------------------------------------ scenes
  push(scene: Scene, payload?: unknown): void {
    void this.scenes.push(scene, payload);
  }

  replace(scene: Scene, payload?: unknown): void {
    void this.scenes.replace(scene, payload);
  }

  pop(result?: unknown): void {
    this.scenes.pop(result);
  }

  // ------------------------------------------------------------------ saving
  async persist(): Promise<boolean> {
    return saves.save(this.slot, this.save);
  }

  /** Fire-and-forget local mirror, used on tab close / hide. */
  snapshotLocal(): void {
    saves.saveLocal(this.slot, this.save);
  }

  applyOptions(): void {
    const o = this.save.options ?? DEFAULT_OPTIONS;
    audio.setMuted(o.muted);
    audio.setMusicVolume(o.musicVolume);
    audio.setSfxVolume(o.sfxVolume);
    this.onMuteChanged?.(o.muted);
  }

  /** Notified whenever the mute state changes, so the on-screen toggle agrees. */
  onMuteChanged: ((muted: boolean) => void) | null = null;

  /**
   * Single entry point for muting, used by both the on-screen button and the
   * OPTIONS menu so the two can never disagree.
   */
  setMuted(muted: boolean): void {
    if (this.save.options) this.save.options.muted = muted;
    audio.setMuted(muted);
    this.onMuteChanged?.(muted);
  }

  /** Frames-per-character for the typewriter, from the options menu. */
  get textDelay(): number {
    return [3, 2, 1][this.save.options?.textSpeed ?? 1] ?? 2;
  }

  // ------------------------------------------------------------------ frame
  update(): void {
    this.tick++;
    this.input.update();
    this.transitions.update();
    this.scenes.update();
    this.save.playtimeFrames++;
    this.guardAgainstStuckCurtain();
  }

  /**
   * Last line of defence against a dead-looking screen. A scene swap holds the
   * curtain for a few frames; if it stays down far longer than that, some
   * awaited step never completed, so lift it rather than strand the player.
   */
  private guardAgainstStuckCurtain(): void {
    if (this.transitions.stuckFrames < STUCK_CURTAIN_FRAMES) return;
    console.warn('agentmon: transition curtain was stuck; recovering');
    this.transitions.uncover();
  }

  /**
   * Recover from a crashed frame. The offending scene is discarded and the
   * curtain lifted, so a bug costs the player the current scene instead of
   * the whole session.
   */
  recoverFromCrash(err: unknown): void {
    console.error('agentmon: frame crashed, recovering', err);
    if (this.scenes.depth > 1) this.scenes.pop();
    this.transitions.uncover();
    this.input.clear();
  }

  render(): void {
    const g = this.screen.g;
    this.screen.clear('#000000');
    this.scenes.render(g);
    this.transitions.render(g);
    this.screen.present();
  }
}

/** Load the shared dex JSON into the typed accessors. */
export function installDex(raw: unknown): void {
  setDex(raw as never);
}
