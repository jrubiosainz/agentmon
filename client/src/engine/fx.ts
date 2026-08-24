// Lightweight particle + primitive layer for battle move effects.
//
// Everything here draws at the 240x160 internal resolution and snaps to whole
// pixels: a subpixel particle betrays the GBA look instantly. Alpha is
// quantised to eighths for the same reason - real hardware had no free blending,
// so smooth fades read as "modern engine" rather than "Game Boy Advance".

export type ParticleShape = 'square' | 'circle' | 'ring' | 'line' | 'spark' | 'star';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number;
  maxLife: number;
  size: number;
  endSize: number;
  color: string;
  shape: ParticleShape;
  rot: number;
  spin: number;
  /** Additive particles read as light (beams, sparks); normal ones as matter. */
  additive: boolean;
  /**
   * A darker rim drawn one pixel larger behind the body. This is the single
   * most GBA-authentic trick in the file: hardware sprites were opaque and
   * always outlined, so a rimmed particle stays readable on a bright sky where
   * an additive highlight would blow out to invisible white.
   */
  outline?: string;
  fade: boolean;
  /** Optional homing target - used by drain/absorb effects. */
  homeX?: number;
  homeY?: number;
  homing?: number;
}

export type ParticleSeed = Partial<Particle> & { x: number; y: number };

/** Alpha is stepped so fades look dithered rather than smoothly interpolated. */
function quantAlpha(a: number): number {
  return Math.max(0, Math.min(1, Math.round(a * 8) / 8));
}

export class ParticleField {
  private ps: Particle[] = [];
  /** Hard cap: a runaway effect must never be able to stall the frame budget. */
  readonly limit: number;

  constructor(limit = 220) {
    this.limit = limit;
  }

  get count(): number {
    return this.ps.length;
  }

  get active(): boolean {
    return this.ps.length > 0;
  }

  clear(): void {
    this.ps.length = 0;
  }

  spawn(seed: ParticleSeed): void {
    if (this.ps.length >= this.limit) return;
    const maxLife = seed.maxLife ?? seed.life ?? 20;
    const size = seed.size ?? 2;
    this.ps.push({
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      rot: 0,
      spin: 0,
      color: '#ffffff',
      shape: 'square',
      additive: false,
      fade: true,
      ...seed,
      life: maxLife,
      maxLife,
      size,
      endSize: seed.endSize ?? size,
    });
  }

  /** Spawns `n` particles evenly around a circle, with optional jitter. */
  burst(
    x: number,
    y: number,
    n: number,
    speed: number,
    seed: Omit<ParticleSeed, 'x' | 'y'> & { spread?: number; angle?: number },
  ): void {
    const base = seed.angle ?? 0;
    const spread = seed.spread ?? Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / n) * spread - spread / 2) + (Math.random() - 0.5) * 0.3;
      const s = speed * (0.65 + Math.random() * 0.7);
      this.spawn({ ...seed, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
    }
  }

  update(): void {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i]!;
      if (p.homing && p.homeX !== undefined && p.homeY !== undefined) {
        p.vx += (p.homeX - p.x) * p.homing;
        p.vy += (p.homeY - p.y) * p.homing;
      }
      p.vx += p.ax;
      p.vy += p.ay;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      if (--p.life <= 0) this.ps.splice(i, 1);
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    if (!this.ps.length) return;
    g.save();
    for (const p of this.ps) {
      const k = p.maxLife > 0 ? p.life / p.maxLife : 0;
      const alpha = p.fade ? quantAlpha(k) : 1;
      if (alpha <= 0) continue;
      const size = Math.max(1, Math.round(p.endSize + (p.size - p.endSize) * k));
      g.globalAlpha = alpha;
      g.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      // Rim first, one pixel fatter, then the body punched over it.
      if (p.outline && !p.additive) {
        g.fillStyle = p.outline;
        g.strokeStyle = p.outline;
        shape(g, p, x, y, size + 1);
      }
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      shape(g, p, x, y, size);
    }
    g.restore();
  }
}

/** Draws one particle body at `size`, in whatever colours are already set. */
function shape(g: CanvasRenderingContext2D, p: Particle, x: number, y: number, size: number): void {
  switch (p.shape) {
    case 'circle':
      g.beginPath();
      g.arc(x, y, size, 0, Math.PI * 2);
      g.fill();
      break;
    case 'ring':
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, size, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'line': {
      const len = size * 2;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(Math.round(x + Math.cos(p.rot) * len), Math.round(y + Math.sin(p.rot) * len));
      g.stroke();
      break;
    }
    case 'spark': {
      // A speed streak pointing along the direction of travel.
      const m = Math.hypot(p.vx, p.vy) || 1;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(Math.round(x - (p.vx / m) * size * 2.5), Math.round(y - (p.vy / m) * size * 2.5));
      g.stroke();
      break;
    }
    case 'star':
      g.fillRect(x - size, y, size * 2 + 1, 1);
      g.fillRect(x, y - size, 1, size * 2 + 1);
      break;
    default:
      g.fillRect(x - size, y - size, size * 2, size * 2);
      break;
  }
}

// --------------------------------------------------------------- primitives

/** A jagged bolt between two points, deterministic for a given `seed`. */
export function boltPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  segments: number,
  jitter: number,
  seed: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [[Math.round(x0), Math.round(y0)]];
  let s = seed | 0;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 16) & 0xffff) / 0xffff - 0.5;
  };
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = rnd() * jitter * Math.sin(t * Math.PI);
    pts.push([
      Math.round(x0 + (x1 - x0) * t + (nx / len) * off),
      Math.round(y0 + (y1 - y0) * t + (ny / len) * off),
    ]);
  }
  pts.push([Math.round(x1), Math.round(y1)]);
  return pts;
}

export function strokePath(
  g: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  color: string,
  width: number,
  alpha = 1,
  additive = false,
): void {
  if (pts.length < 2) return;
  g.save();
  g.globalAlpha = quantAlpha(alpha);
  if (additive) g.globalCompositeOperation = 'lighter';
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.stroke();
  g.restore();
}

/** A tapered beam: bright core, translucent sheath. */
export function drawBeam(
  g: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  core: string,
  alpha = 1,
): void {
  if (width <= 0) return;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = Math.cos(a + Math.PI / 2);
  const ny = Math.sin(a + Math.PI / 2);
  const band = (w: number, c: string, al: number): void => {
    g.globalAlpha = quantAlpha(al);
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(Math.round(x0 + nx * w), Math.round(y0 + ny * w));
    g.lineTo(Math.round(x1 + nx * w), Math.round(y1 + ny * w));
    g.lineTo(Math.round(x1 - nx * w), Math.round(y1 - ny * w));
    g.lineTo(Math.round(x0 - nx * w), Math.round(y0 - ny * w));
    g.closePath();
    g.fill();
  };
  g.save();
  g.globalCompositeOperation = 'lighter';
  band(width, color, alpha * 0.55);
  band(Math.max(1, width * 0.45), core, alpha);
  g.restore();
}

/** Expanding shock ring. `k` is 0..1 progress. */
export function drawShockRing(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  radius: number,
  color: string,
  squash = 1,
): void {
  if (k <= 0 || k >= 1) return;
  g.save();
  g.globalAlpha = quantAlpha(1 - k);
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, Math.round(3 * (1 - k)));
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), Math.max(1, radius * k), Math.max(1, radius * k * squash), 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** Slanted impact slash. `k` is 0..1 progress; the stroke wipes then fades. */
export function drawSlash(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  k: number,
  color: string,
): void {
  if (k <= 0 || k >= 1) return;
  const wipe = Math.min(1, k * 2.2);
  const fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
  const dx = Math.cos(angle) * length;
  const dy = Math.sin(angle) * length;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = quantAlpha(fade);
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (const [w, a] of [
    [4, 0.4],
    [2, 1],
  ] as const) {
    g.globalAlpha = quantAlpha(fade * a);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(Math.round(x - dx / 2), Math.round(y - dy / 2));
    g.lineTo(Math.round(x - dx / 2 + dx * wipe), Math.round(y - dy / 2 + dy * wipe));
    g.stroke();
  }
  g.restore();
}

/** Full-screen colour wash, used to punctuate the heaviest moves. */
export function drawTint(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  alpha: number,
  additive = false,
): void {
  if (alpha <= 0) return;
  g.save();
  if (additive) g.globalCompositeOperation = 'lighter';
  g.globalAlpha = quantAlpha(alpha);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Lightens a hex colour toward white - used to derive beam cores from types. */
export function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Darkens a hex colour toward black. */
export function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const mix = (c: number): number => Math.round(c * (1 - amount));
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
