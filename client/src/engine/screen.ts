/**
 * The "hardware": a fixed 240x160 framebuffer (GBA resolution) blitted to a
 * canvas at an integer scale so every game pixel stays a perfect square.
 */

export const SCREEN_W = 240;
export const SCREEN_H = 160;

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Offscreen buffer everything is drawn into at native resolution. */
  readonly buffer: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.buffer = document.createElement('canvas');
    this.buffer.width = SCREEN_W;
    this.buffer.height = SCREEN_H;
    const g = this.buffer.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!g) throw new Error('2D buffer context unavailable');
    this.g = g;

    this.ctx.imageSmoothingEnabled = false;
    this.g.imageSmoothingEnabled = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    // The shell keeps changing shape after construction - the touch class lands
    // later, phone browsers slide their URL bar away without firing `resize`,
    // and rotating swaps the whole layout. Watch the frame instead of guessing.
    const frame = canvas.parentElement;
    if (frame && typeof ResizeObserver === 'function') {
      let last = '';
      new ResizeObserver(() => {
        const key = `${frame.clientWidth}x${frame.clientHeight}`;
        if (key === last) return;
        last = key;
        this.resize();
      }).observe(frame);
    }
  }

  resize(): void {
    const frame = this.canvas.parentElement;
    const availW = frame ? frame.clientWidth : window.innerWidth;
    const availH = frame ? frame.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    const fit = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    // Desktops get crisp integer scaling; phones get every pixel of a screen
    // they cannot afford to waste - at 2-3x device pixel ratio the fractional
    // CSS scale still lands on near-whole device pixels, so it stays sharp.
    let scale = this.fillsViewport() ? fit : Math.floor(fit);
    if (scale < 1) scale = fit;
    this.scale = Math.max(scale, 0.5);

    const cssW = Math.round(SCREEN_W * this.scale);
    const cssH = Math.round(SCREEN_H * this.scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Checked per-resize rather than cached: the Screen is built before the shell
   * has tagged the body as touch, and a 2-in-1 can gain a touch pointer later.
   */
  private fillsViewport(): boolean {
    return typeof matchMedia === 'function'
      && matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  /** Blit the native-resolution buffer to the visible canvas. */
  present(): void {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  clear(color = '#000000'): void {
    this.g.fillStyle = color;
    this.g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }
}
