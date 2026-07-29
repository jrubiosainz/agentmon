/** Sprite sheets and frame-based animation playback. */

import type { SheetMeta } from './assets.ts';

export interface AnimDef {
  row: number;
  frames: number;
}

export class SpriteSheet {
  constructor(
    readonly image: HTMLImageElement,
    readonly frameW: number,
    readonly frameH: number,
    readonly anims: Record<string, AnimDef> = {},
  ) {}

  static fromMeta(image: HTMLImageElement, meta: SheetMeta): SpriteSheet {
    return new SpriteSheet(image, meta.frameWidth, meta.frameHeight, meta.animations ?? {});
  }

  has(name: string): boolean {
    return name in this.anims;
  }

  /** Shared offscreen buffer used for silhouette / tint compositing. */
  private static scratchCtx: CanvasRenderingContext2D | null = null;

  static scratch(w: number, h: number): CanvasRenderingContext2D {
    if (!SpriteSheet.scratchCtx) {
      const c = document.createElement('canvas');
      SpriteSheet.scratchCtx = c.getContext('2d')!;
    }
    const ctx = SpriteSheet.scratchCtx;
    if (ctx.canvas.width < w || ctx.canvas.height < h) {
      ctx.canvas.width = Math.max(ctx.canvas.width, w);
      ctx.canvas.height = Math.max(ctx.canvas.height, h);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return ctx;
  }

  frameCount(name: string): number {
    return this.anims[name]?.frames ?? 1;
  }

  /** Blit one frame with its bottom-centre at (x, y). */
  drawFrame(
    g: CanvasRenderingContext2D,
    anim: string,
    frame: number,
    x: number,
    y: number,
    opts: {
      flip?: boolean; alpha?: number; scale?: number;
      /** Draw the frame as a flat coloured silhouette (evolution / cave reveals). */
      silhouette?: boolean; silhouetteColor?: string;
      /** Additive tint blended over the sprite, 0..1. */
      tint?: string; tintAmount?: number;
    } = {},
  ): void {
    const def = this.anims[anim];
    if (!def) return;
    const f = ((frame % def.frames) + def.frames) % def.frames;
    const sx = f * this.frameW;
    const sy = def.row * this.frameH;
    const scale = opts.scale ?? 1;
    const dw = Math.round(this.frameW * scale);
    const dh = Math.round(this.frameH * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh);

    const prevAlpha = g.globalAlpha;
    if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;

    if (opts.silhouette || (opts.tint && (opts.tintAmount ?? 0) > 0)) {
      const buf = SpriteSheet.scratch(dw, dh);
      buf.clearRect(0, 0, dw, dh);
      buf.imageSmoothingEnabled = false;
      if (opts.flip) {
        buf.save();
        buf.translate(dw, 0);
        buf.scale(-1, 1);
        buf.drawImage(this.image, sx, sy, this.frameW, this.frameH, 0, 0, dw, dh);
        buf.restore();
      } else {
        buf.drawImage(this.image, sx, sy, this.frameW, this.frameH, 0, 0, dw, dh);
      }
      buf.globalCompositeOperation = 'source-atop';
      if (opts.silhouette) {
        buf.globalAlpha = 1;
        buf.fillStyle = opts.silhouetteColor ?? '#101018';
      } else {
        buf.globalAlpha = opts.tintAmount ?? 0.5;
        buf.fillStyle = opts.tint!;
      }
      buf.fillRect(0, 0, dw, dh);
      buf.globalAlpha = 1;
      buf.globalCompositeOperation = 'source-over';
      g.drawImage(buf.canvas, 0, 0, dw, dh, dx, dy, dw, dh);
      g.globalAlpha = prevAlpha;
      return;
    }

    if (opts.flip) {
      g.save();
      g.translate(dx + dw, dy);
      g.scale(-1, 1);
      g.drawImage(this.image, sx, sy, this.frameW, this.frameH, 0, 0, dw, dh);
      g.restore();
    } else {
      g.drawImage(this.image, sx, sy, this.frameW, this.frameH, dx, dy, dw, dh);
    }
    g.globalAlpha = prevAlpha;
  }

  /** Blit one frame with its top-left at (x, y). */
  drawFrameTopLeft(g: CanvasRenderingContext2D, anim: string, frame: number, x: number, y: number): void {    const def = this.anims[anim];
    if (!def) return;
    const f = ((frame % def.frames) + def.frames) % def.frames;
    g.drawImage(
      this.image,
      f * this.frameW, def.row * this.frameH, this.frameW, this.frameH,
      Math.round(x), Math.round(y), this.frameW, this.frameH,
    );
  }
}

/** Uniform grid atlas addressed by key (party/dex icons, item icons...). */
export class GridAtlas {
  constructor(
    readonly image: HTMLImageElement,
    readonly frameW: number,
    readonly frameH: number,
    readonly columns: number,
    readonly index: Record<string, number>,
  ) {}

  draw(g: CanvasRenderingContext2D, key: string, x: number, y: number, scale = 1): void {
    const i = this.index[key];
    if (i === undefined) return;
    const sx = (i % this.columns) * this.frameW;
    const sy = Math.floor(i / this.columns) * this.frameH;
    g.drawImage(
      this.image, sx, sy, this.frameW, this.frameH,
      Math.round(x), Math.round(y), Math.round(this.frameW * scale), Math.round(this.frameH * scale),
    );
  }

  has(key: string): boolean {
    return key in this.index;
  }
}

/** Plays one animation at a fixed frame rate, with optional one-shot mode. */
export class Animator {
  private timer = 0;
  private index = 0;
  private current = '';
  private ticksPerFrame = 8;
  private loop = true;
  finished = false;
  onFinish: (() => void) | null = null;

  constructor(private sheet: SpriteSheet | null = null) {}

  setSheet(sheet: SpriteSheet | null): void {
    this.sheet = sheet;
    this.current = '';
  }

  get sheetRef(): SpriteSheet | null {
    return this.sheet;
  }

  get anim(): string {
    return this.current;
  }

  get frame(): number {
    return this.index;
  }

  play(name: string, ticksPerFrame = 8, loop = true, restart = false): void {
    if (this.current === name && !restart) {
      this.ticksPerFrame = ticksPerFrame;
      this.loop = loop;
      return;
    }
    this.current = name;
    this.ticksPerFrame = ticksPerFrame;
    this.loop = loop;
    this.index = 0;
    this.timer = 0;
    this.finished = false;
  }

  /** Freeze on a specific frame (used for walk-idle poses). */
  setFrame(i: number): void {
    this.index = i;
    this.timer = 0;
  }

  update(): void {
    if (!this.sheet || !this.current || this.finished) return;
    const count = this.sheet.frameCount(this.current);
    if (count <= 1) return;
    if (++this.timer < this.ticksPerFrame) return;
    this.timer = 0;
    this.index++;
    if (this.index >= count) {
      if (this.loop) {
        this.index = 0;
      } else {
        this.index = count - 1;
        this.finished = true;
        this.onFinish?.();
      }
    }
  }

  draw(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    opts: { flip?: boolean; alpha?: number; scale?: number } = {},
  ): void {
    this.sheet?.drawFrame(g, this.current, this.index, x, y, opts);
  }
}
