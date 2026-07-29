/**
 * Deterministic RNG (mulberry32).
 *
 * Battles use a seeded stream so a save file replays identically, and so
 * encounter tables can't be manipulated by reloading the page mid-step.
 */
export class Rng {
  private state: number;

  constructor(seed?: number) {
    this.state = (seed ?? (Date.now() ^ (Math.random() * 0xffffffff))) >>> 0;
  }

  get seed(): number {
    return this.state;
  }

  set seed(v: number) {
    this.state = v >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** True with probability `n/256` - the classic GBA style roll. */
  chance256(n: number): boolean {
    return this.int(0, 255) < n;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }

  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}

export const rng = new Rng();
