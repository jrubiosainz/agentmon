/** Full-screen transitions between scenes and into battles. */

import { SCREEN_H, SCREEN_W } from './screen.ts';

export type TransitionKind = 'fade' | 'battleSwirl' | 'battleSplit' | 'wipe' | 'doorway' | 'flash';

interface Active {
  kind: TransitionKind;
  duration: number;
  elapsed: number;
  out: boolean;
  color: string;
  resolve: () => void;
}

export class Transitions {
  private active: Active | null = null;
  /** Held cover: after an "out" completes we keep the screen covered. */
  private covered = false;
  private coverColor = '#000000';
  /** Frames the curtain has been down with nothing animating behind it. */
  private stuck = 0;

  get busy(): boolean {
    return this.active !== null;
  }

  get isCovered(): boolean {
    return this.covered;
  }

  /**
   * How long the screen has been black with no transition running. A scene
   * swap holds this for a handful of frames; anything longer means an await
   * never resolved and the player is looking at a dead screen.
   */
  get stuckFrames(): number {
    return this.stuck;
  }

  /** Play a transition that covers the screen; resolves when fully covered. */
  out(kind: TransitionKind = 'fade', duration = 30, color = '#000000'): Promise<void> {
    return new Promise((resolve) => {
      this.settle();
      this.active = { kind, duration, elapsed: 0, out: true, color, resolve };
      this.coverColor = color;
      this.stuck = 0;
    });
  }

  /** Reveal the screen again; resolves when fully visible. */
  in(kind: TransitionKind = 'fade', duration = 30, color = '#000000'): Promise<void> {
    return new Promise((resolve) => {
      this.settle();
      this.active = { kind, duration, elapsed: 0, out: false, color, resolve };
      this.coverColor = color;
      this.covered = true;
      this.stuck = 0;
    });
  }

  /**
   * Resolve a transition that is being replaced before it finished, so the
   * caller awaiting it is never stranded.
   */
  private settle(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.resolve();
  }

  cover(color = '#000000'): void {
    this.covered = true;
    this.coverColor = color;
    this.stuck = 0;
  }

  uncover(): void {
    this.covered = false;
    this.active = null;
    this.stuck = 0;
  }

  update(): void {
    const a = this.active;
    if (!a) {
      if (this.covered) this.stuck++;
      return;
    }
    this.stuck = 0;
    a.elapsed++;
    if (a.elapsed >= a.duration) {
      this.covered = a.out;
      this.active = null;
      a.resolve();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const a = this.active;
    if (!a) {
      if (this.covered) {
        g.fillStyle = this.coverColor;
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      }
      return;
    }
    const raw = a.elapsed / a.duration;
    const t = a.out ? raw : 1 - raw; // 0 = clear, 1 = covered
    switch (a.kind) {
      case 'fade': this.fade(g, t, a.color); break;
      case 'flash': this.flash(g, t); break;
      case 'wipe': this.wipe(g, t, a.color); break;
      case 'doorway': this.doorway(g, t, a.color); break;
      case 'battleSplit': this.split(g, t, a.color); break;
      case 'battleSwirl': this.swirl(g, t, a.color); break;
    }
  }

  private fade(g: CanvasRenderingContext2D, t: number, color: string): void {
    // Quantised alpha steps read as authentic hardware fades.
    const steps = 16;
    const alpha = Math.round(t * steps) / steps;
    if (alpha <= 0) return;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.globalAlpha = 1;
  }

  private flash(g: CanvasRenderingContext2D, t: number): void {
    const pulse = Math.abs(Math.sin(t * Math.PI * 3));
    g.globalAlpha = pulse;
    g.fillStyle = '#f8f8f8';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.globalAlpha = 1;
  }

  private wipe(g: CanvasRenderingContext2D, t: number, color: string): void {
    g.fillStyle = color;
    g.fillRect(0, 0, Math.round(SCREEN_W * t), SCREEN_H);
  }

  private doorway(g: CanvasRenderingContext2D, t: number, color: string): void {
    const h = Math.round((SCREEN_H / 2) * t);
    g.fillStyle = color;
    g.fillRect(0, 0, SCREEN_W, h);
    g.fillRect(0, SCREEN_H - h, SCREEN_W, h);
  }

  /** Horizontal blinds closing in from both sides - classic battle intro. */
  private split(g: CanvasRenderingContext2D, t: number, color: string): void {
    const bands = 8;
    const bandH = SCREEN_H / bands;
    const w = SCREEN_W * Math.min(1, t * 1.15);
    g.fillStyle = color;
    for (let i = 0; i < bands; i++) {
      const y = Math.round(i * bandH);
      const h = Math.ceil(bandH);
      if (i % 2 === 0) g.fillRect(0, y, Math.round(w), h);
      else g.fillRect(SCREEN_W - Math.round(w), y, Math.round(w), h);
    }
  }

  /** Expanding checker cells - stands in for the GBA's spiral wipe. */
  private swirl(g: CanvasRenderingContext2D, t: number, color: string): void {
    const cell = 10;
    const cols = Math.ceil(SCREEN_W / cell);
    const rows = Math.ceil(SCREEN_H / cell);
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const maxD = Math.hypot(cx, cy) + 1;
    g.fillStyle = color;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = Math.hypot(c - cx, r - cy) / maxD;
        const local = Math.max(0, Math.min(1, (t - d * 0.55) / 0.45));
        if (local <= 0) continue;
        const size = Math.ceil(cell * local);
        const ox = Math.round((cell - size) / 2);
        g.fillRect(c * cell + ox, r * cell + ox, size, size);
      }
    }
  }
}
