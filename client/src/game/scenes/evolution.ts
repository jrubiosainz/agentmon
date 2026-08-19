/** The evolution cutscene: silhouette cross-fade, sparkle burst, fanfare. */

import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { TEXTBOX_H, TEXTBOX_Y, drawWindow } from '../../engine/ui.ts';
import { displayName, learnMove, movesAtLevel, type AgentInstance } from '../data/agent.ts';
import { moveName, species } from '../data/dex.ts';
import { t } from '../i18n.ts';
import { catchSpecies, seeSpecies } from '../state.ts';

export interface EvolutionPayload {
  agent: AgentInstance;
  target: string;
  /** Set false to let the player cancel with B, as in the classic games. */
  cancellable?: boolean;
}

type Phase = 'intro' | 'morph' | 'flash' | 'done' | 'learn' | 'cancel';

export class EvolutionScene extends Scene {
  private agent!: AgentInstance;
  private target = '';
  private fromKey = '';
  private cancellable = true;
  private phase: Phase = 'intro';
  private t = 0;
  private cycles = 0;
  private showing: 'from' | 'to' = 'from';
  private message = '';
  private learnQueue: string[] = [];
  private tick = 0;

  override enter(payload?: unknown): void {
    const p = payload as EvolutionPayload;
    this.agent = p.agent;
    this.target = p.target;
    this.fromKey = p.agent.speciesKey;
    this.cancellable = p.cancellable ?? true;
    this.message = t('What? {name} is evolving!', { name: displayName(this.agent) });
    audio.playMusic('evolution', true);
  }

  update(): void {
    this.tick++;
    this.t++;
    const inp = this.game.input;

    switch (this.phase) {
      case 'intro':
        if (this.t > 90 || inp.pressed('a')) { this.phase = 'morph'; this.t = 0; this.message = ''; }
        if (this.cancellable && inp.pressed('b')) { this.phase = 'cancel'; this.t = 0; this.message = t('Huh? {name} stopped evolving!', { name: displayName(this.agent) }); audio.stopMusic(); audio.sfx('cancel'); }
        break;

      case 'morph': {
        // Accelerating cross-fade flicker.
        const period = Math.max(4, 26 - this.cycles * 2);
        if (this.t >= period) {
          this.t = 0;
          this.cycles++;
          this.showing = this.showing === 'from' ? 'to' : 'from';
          audio.sfx('cursor');
        }
        if (this.cycles >= 16) { this.phase = 'flash'; this.t = 0; this.showing = 'to'; audio.sfx('levelUp'); }
        if (this.cancellable && inp.pressed('b')) { this.phase = 'cancel'; this.t = 0; this.message = t('Huh? {name} stopped evolving!', { name: displayName(this.agent) }); audio.stopMusic(); }
        break;
      }

      case 'flash':
        if (this.t > 60) {
          this.applyEvolution();
          this.phase = 'done';
          this.t = 0;
          audio.playMusic('victory', true);
        }
        break;

      case 'done':
        if (this.t > 30 && (inp.pressed('a') || inp.pressed('b'))) {
          if (this.learnQueue.length > 0) {
            const key = this.learnQueue.shift()!;
            const res = learnMove(this.agent, key);
            this.message = res
              ? t('{name} learned {move}!', { name: displayName(this.agent), move: moveName(key) })
              : t('{name} is trying to learn {move}, but its slots are full.', { name: displayName(this.agent), move: moveName(key) });
            audio.sfx('select');
            this.phase = 'learn';
            this.t = 0;
          } else {
            this.finish();
          }
        }
        break;

      case 'learn':
        if (this.t > 20 && (inp.pressed('a') || inp.pressed('b'))) { this.phase = 'done'; this.t = 31; }
        break;

      case 'cancel':
        if (this.t > 40 && (inp.pressed('a') || inp.pressed('b'))) this.finish();
        break;
    }
  }

  private applyEvolution(): void {
    const before = new Set(this.agent.moves.map((m) => m.key));
    this.agent.speciesKey = this.target;
    delete this.agent.pendingEvolution;
    seeSpecies(this.game.save, this.target);
    catchSpecies(this.game.save, this.target);
    this.message = t('Congratulations! Your {from} evolved into {to}!', { from: species(this.fromKey).name, to: species(this.target).name });
    // New species may unlock a move at the current level.
    this.learnQueue = movesAtLevel(this.target, this.agent.level)
      .map((m) => m.key)
      .filter((k) => !before.has(k));
  }

  private finish(): void {
    audio.stopMusic();
    this.game.pop({ evolved: this.phase !== 'cancel' });
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#101018';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Radial starfield backdrop.
    for (let i = 0; i < 48; i++) {
      const a = (i * 137.5 + this.tick * 0.6) * (Math.PI / 180);
      const r = 20 + ((i * 13 + this.tick) % 120);
      const x = SCREEN_W / 2 + Math.cos(a) * r;
      const y = 70 + Math.sin(a) * r * 0.6;
      g.fillStyle = i % 3 === 0 ? '#405088' : '#283058';
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }

    const key = this.showing === 'from' ? this.fromKey : this.target;
    const sheet = this.game.creatureSheet(key);
    const cx = SCREEN_W / 2;
    const cy = 66;

    if (this.phase === 'flash') {
      const k = Math.min(1, this.t / 60);
      g.fillStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    if (sheet) {
      const silhouette = this.phase === 'morph' || (this.phase === 'flash' && this.t < 20);
      sheet.drawFrame(g, 'idle', 0, cx, cy, {
        scale: 1,
        silhouette,
        silhouetteColor: this.showing === 'to' ? '#f8f8ff' : '#1a1a2a',
      });
    }

    if (this.phase === 'flash') {
      const k = this.t / 60;
      g.strokeStyle = `rgba(255,255,220,${Math.max(0, 1 - k)})`;
      g.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + k;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
        g.lineTo(cx + Math.cos(a) * (20 + k * 90), cy + Math.sin(a) * (20 + k * 90));
        g.stroke();
      }
      g.lineWidth = 1;
    }

    if (this.message) {
      drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
      for (const [i, line] of font.wrap(this.message, 216).slice(0, 3).entries()) {
        font.draw(g, line, 12, TEXTBOX_Y + 8 + i * 12, 'normal', false);
      }
      if ((this.phase === 'done' || this.phase === 'learn' || this.phase === 'cancel')
        && Math.floor(this.tick / 18) % 2 === 0) {
        font.draw(g, '\u25bc', SCREEN_W - 16, TEXTBOX_Y + TEXTBOX_H - 14, 'normal', false);
      }
    }
  }
}
