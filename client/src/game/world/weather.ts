/**
 * Per-route weather.
 *
 * Everything here is SCREEN space, never world space. On real hardware weather
 * was a scrolling background layer sitting between the camera and the map, so
 * it does not slide when the camera pans - rain falling "on the world" and
 * drifting with the scroll is the single fastest way to make a top-down game
 * look like a modern engine wearing a GBA costume.
 *
 * Weather here is purely visual. It deliberately does NOT touch damage, accuracy
 * or encounter tables: those are balanced and tested, and a cosmetic pass has no
 * business moving them.
 */

import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';

export type WeatherKind = 'rain' | 'storm' | 'fog' | 'ash';

/** Alpha is stepped so washes look dithered rather than smoothly interpolated. */
function quant(a: number): number {
  return Math.max(0, Math.min(1, Math.round(a * 8) / 8));
}

/** Ambient wash laid down before the particles, so the particles stay bright. */
const AMBIENT: Record<WeatherKind, [string, number]> = {
  rain: ['#28405c', 0.2],
  storm: ['#101c34', 0.28],
  // Fog carries its mood entirely in the tile: a flat pale wash on top of it
  // greys the palette out instead of hiding it, which is the opposite of fog.
  fog: ['#c8d8e0', 0],
  ash: ['#5c2408', 0.26],
};

const DENSITY: Record<WeatherKind, number> = { rain: 46, storm: 78, fog: 0, ash: 52 };

interface Drop {
  x: number;
  y: number;
  vy: number;
  /** Screen row this drop breaks on. Varying it gives the sheet depth. */
  hitY: number;
  len: number;
  color: string;
}

interface Splash {
  x: number;
  y: number;
  life: number;
}

interface Flake {
  x: number;
  y: number;
  vy: number;
  /** Horizontal sway amplitude and phase - ash tumbles, it does not fall straight. */
  sway: number;
  phase: number;
  size: number;
  color: string;
  ember: boolean;
}

const RAIN_SHADES = ['#a8c8f0', '#7898d0', '#5c78b8'];
// Warm-tinted greys: neutral greys vanish over Terraflux's stone pavement.
const ASH_SHADES = ['#e0d0c0', '#b8a494', '#8c7868'];

/** Slant is fixed per weather: drops in a squall all lean the same way. */
const SLANT: Record<string, number> = { rain: -0.38, storm: -0.62 };

// ------------------------------------------------------------------ fog tile

let fogTile: HTMLCanvasElement | null = null;

/**
 * A seamless wisp texture built once and tile-scrolled. Drawing the blobs live
 * every frame costs the same but re-randomises them, which shimmers; baking
 * them means the mist actually *drifts* instead of boiling.
 */
function fogPattern(): HTMLCanvasElement | null {
  if (fogTile) return fogTile;
  if (typeof document === 'undefined') return null;
  const W = 128;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;
  let s = 0x9e3779b9;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0xffffff;
  };
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const rx = 12 + rnd() * 26;
    const ry = 4 + rnd() * 8;
    g.globalAlpha = 0.05 + rnd() * 0.07;
    // Four copies so a blob straddling an edge reappears on the far side and
    // the tile seam never shows as a vertical crease.
    for (const [ox, oy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      for (const sx of [ox - W, ox] as const) {
        for (const sy of [oy - H, oy] as const) {
          g.beginPath();
          g.ellipse(x + sx, y + sy, rx, ry, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  fogTile = c;
  return c;
}

// -------------------------------------------------------------------- system

export class Weather {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private flakes: Flake[] = [];
  private tick = 0;
  private fogX = 0;
  private fogY = 0;
  /** Countdown to the next lightning strike, in frames. */
  private boltIn = 90;
  /** Frames elapsed inside the current strike, or -1 when idle. */
  private boltT = -1;

  constructor(readonly kind: WeatherKind | null) {
    if (!kind) return;
    const n = DENSITY[kind];
    if (kind === 'rain' || kind === 'storm') {
      for (let i = 0; i < n; i++) this.drops.push(this.newDrop(true));
    } else if (kind === 'ash') {
      for (let i = 0; i < n; i++) this.flakes.push(this.newFlake(true));
    }
  }

  get active(): boolean {
    return this.kind !== null;
  }

  private newDrop(seed: boolean): Drop {
    const heavy = this.kind === 'storm';
    const speed = (heavy ? 11 : 7) + Math.random() * 4;
    // Spawn wide of the screen: a slanted sheet leaves a bare wedge on the
    // upwind edge unless it is fed from off-screen.
    const x = -30 + Math.random() * (SCREEN_W + 60);
    return {
      x,
      y: seed ? Math.random() * SCREEN_H : -8 - Math.random() * 24,
      vy: speed,
      hitY: 24 + Math.random() * (SCREEN_H - 24),
      len: heavy ? 10 + Math.random() * 6 : 7 + Math.random() * 5,
      color: RAIN_SHADES[Math.floor(Math.random() * RAIN_SHADES.length)]!,
    };
  }

  private newFlake(seed: boolean): Flake {
    const ember = Math.random() < 0.4;
    return {
      x: Math.random() * SCREEN_W,
      y: seed ? Math.random() * SCREEN_H : ember ? SCREEN_H + 4 : -6,
      // Embers rise on the thermal, ash settles.
      vy: ember ? -(0.35 + Math.random() * 0.4) : 0.3 + Math.random() * 0.45,
      sway: 0.5 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      size: ember ? (Math.random() < 0.4 ? 2 : 1) : Math.random() < 0.3 ? 2 : 1,
      color: ember
        ? (Math.random() < 0.5 ? '#f8a038' : '#f86818')
        : ASH_SHADES[Math.floor(Math.random() * ASH_SHADES.length)]!,
      ember,
    };
  }

  update(): void {
    if (!this.kind) return;
    this.tick++;
    const slant = SLANT[this.kind] ?? 0;

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]!;
      d.y += d.vy;
      d.x += d.vy * slant;
      if (d.y >= d.hitY) {
        if (this.splashes.length < 40) this.splashes.push({ x: d.x, y: d.hitY, life: 6 });
        this.drops[i] = this.newDrop(false);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      if (--this.splashes[i]!.life <= 0) this.splashes.splice(i, 1);
    }

    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i]!;
      f.y += f.vy;
      f.phase += 0.05;
      f.x += Math.sin(f.phase) * f.sway * 0.35;
      if (f.ember ? f.y < -6 : f.y > SCREEN_H + 6) this.flakes[i] = this.newFlake(false);
      if (f.x < -8) f.x = SCREEN_W + 8;
      else if (f.x > SCREEN_W + 8) f.x = -8;
    }

    if (this.kind === 'fog') {
      this.fogX -= 0.28;
      this.fogY += 0.06;
      if (this.fogX <= -128) this.fogX += 128;
      if (this.fogY >= 64) this.fogY -= 64;
    }

    if (this.kind === 'storm') {
      if (this.boltT >= 0) {
        // A strike is a double flash: one hard hit, a beat of dark, then a
        // weaker echo. A single fade reads as a rendering glitch.
        if (++this.boltT > 14) {
          this.boltT = -1;
          this.boltIn = 150 + Math.floor(Math.random() * 280);
        }
      } else if (--this.boltIn <= 0) {
        this.boltT = 0;
      }
    }
  }

  /** Strength of the current lightning flash, 0 when idle. */
  private boltAlpha(): number {
    const t = this.boltT;
    if (t < 0) return 0;
    if (t < 3) return 0.55;
    if (t < 6) return 0.05;
    if (t < 9) return 0.34;
    return 0.34 * (1 - (t - 9) / 6);
  }

  /**
   * Draws over the finished world but under the HUD. Ambient wash first so the
   * drops read as bright water against a dimmed scene rather than being dimmed
   * along with it.
   */
  draw(g: CanvasRenderingContext2D): void {
    if (!this.kind) return;
    const [color, alpha] = AMBIENT[this.kind];
    g.save();
    if (alpha > 0) {
      g.globalAlpha = quant(alpha);
      g.fillStyle = color;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    g.globalAlpha = 1;

    switch (this.kind) {
      case 'rain':
      case 'storm':
        this.drawRain(g);
        break;
      case 'fog':
        this.drawFog(g);
        break;
      case 'ash':
        this.drawAsh(g);
        break;
    }

    const bolt = this.boltAlpha();
    if (bolt > 0) {
      g.globalAlpha = quant(bolt);
      g.fillStyle = '#e8f0ff';
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    g.restore();
  }

  private drawRain(g: CanvasRenderingContext2D): void {
    const slant = SLANT[this.kind!] ?? 0;
    g.globalAlpha = 0.75;
    for (const d of this.drops) {
      g.fillStyle = d.color;
      // Stair-stepped 1px segments rather than a stroked line: a real streak
      // sprite was aliased, and a smooth antialiased diagonal looks foreign.
      for (let i = 0; i < d.len; i += 2) {
        g.fillRect(Math.round(d.x + slant * i), Math.round(d.y + i), 1, 2);
      }
    }
    g.globalAlpha = 0.85;
    g.fillStyle = '#c8e0f8';
    for (const s of this.splashes) {
      const k = 6 - s.life;
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      g.fillRect(x - 1 - k, y, 1, 1);
      g.fillRect(x + 1 + k, y, 1, 1);
      if (k < 2) g.fillRect(x, y - 1, 1, 1);
    }
    g.globalAlpha = 1;
  }

  private drawFog(g: CanvasRenderingContext2D): void {
    const tile = fogPattern();
    if (!tile) return;
    const ox = Math.round(this.fogX);
    const oy = Math.round(this.fogY);
    g.globalAlpha = 0.34;
    for (let y = oy - 64; y < SCREEN_H; y += 64) {
      for (let x = ox - 128; x < SCREEN_W; x += 128) g.drawImage(tile, x, y);
    }
    // A second pass at half speed and a vertical offset gives the bank depth
    // without needing a second texture.
    g.globalAlpha = 0.2;
    const ox2 = Math.round(this.fogX * 0.45) + 40;
    const oy2 = Math.round(-this.fogY * 0.5) + 18;
    for (let y = (oy2 % 64) - 64; y < SCREEN_H; y += 64) {
      for (let x = (ox2 % 128) - 128; x < SCREEN_W; x += 128) g.drawImage(tile, x, y);
    }
    g.globalAlpha = 1;
  }

  private drawAsh(g: CanvasRenderingContext2D): void {
    for (const f of this.flakes) {
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      if (f.ember) {
        // A hot ember reads as a GLOW, not as an outlined dot: a dim halo of
        // its own hue, then a full-bright core. The dark-rim trick the battle
        // particles use is wrong here - at this size the rim swallows the core
        // and the ember lands on screen as a speck of dirt.
        g.globalAlpha = 0.3;
        g.fillStyle = f.color;
        g.fillRect(x - 1, y - 1, f.size + 2, f.size + 2);
        g.globalAlpha = 1;
        g.fillStyle = '#ffe0a0';
        g.fillRect(x, y, f.size, f.size);
      } else {
        g.globalAlpha = 0.75;
        g.fillStyle = f.color;
        g.fillRect(x, y, f.size, f.size);
      }
    }
    g.globalAlpha = 1;
  }
}
