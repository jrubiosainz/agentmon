/** Tiny grid builder so maps are authored as code instead of giant string blobs. */

export class Grid {
  readonly rows: string[][];

  constructor(readonly w: number, readonly h: number, fillChar = ' ') {
    this.rows = Array.from({ length: h }, () => Array.from({ length: w }, () => fillChar));
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y]![x] = ch;
    return this;
  }

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? ' ';
  }

  fill(ch: string): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.rows[y]![x] = ch;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
    return this;
  }

  /** Outline only. */
  frame(x: number, y: number, w: number, h: number, ch: string): this {
    this.hline(x, x + w - 1, y, ch);
    this.hline(x, x + w - 1, y + h - 1, ch);
    this.vline(x, y, y + h - 1, ch);
    this.vline(x + w - 1, y, y + h - 1, ch);
    return this;
  }

  hline(x0: number, x1: number, y: number, ch: string): this {
    const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
    for (let x = a; x <= b; x++) this.set(x, y, ch);
    return this;
  }

  vline(x: number, y0: number, y1: number, ch: string): this {
    const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = a; y <= b; y++) this.set(x, y, ch);
    return this;
  }

  /** Scatter `n` characters using a deterministic hash so maps never shuffle. */
  scatter(ch: string, n: number, seed: number, area?: { x: number; y: number; w: number; h: number }, avoid = ' '): this {
    const a = area ?? { x: 0, y: 0, w: this.w, h: this.h };
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s ^ (s >>> 15), 2246822507) ^ i * 668265263) >>> 0;
      const x = a.x + (s % a.w);
      s = (Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0;
      const y = a.y + (s % a.h);
      if (this.get(x, y) === avoid) continue;
      this.set(x, y, ch);
    }
    return this;
  }

  /** Paste a block of rows at (x, y); spaces in `block` are transparent. */
  paste(x: number, y: number, block: string[]): this {
    block.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        if (ch !== ' ') this.set(x + i, y + j, ch);
      }
    });
    return this;
  }

  /** Blit including spaces (used for carving empty regions). */
  stamp(x: number, y: number, block: string[]): this {
    block.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) this.set(x + i, y + j, row[i]!);
    });
    return this;
  }

  out(): string[] {
    return this.rows.map((r) => r.join(''));
  }
}

/** Standard legend shared by every map (chars chosen to be readable in source). */
export const LEGEND: Record<string, string> = {
  '.': 'grass',
  ',': 'grass2',
  "'": 'grass3',
  '"': 'tallgrass',
  '-': 'path',
  '=': 'path2',
  '#': 'pavement',
  '~': 'water',
  '_': 'wateredge',
  'T': 'tree',
  'O': 'rock',
  'S': 'sign',
  'F': 'fence',
  'L': 'ledge',
  'f': 'flowerA',
  'g': 'flowerB',
  'h': 'flowerC',
  'w': 'floor',
  'W': 'wall',
  'l': 'labfloor',
  'c': 'carpet',
  'C': 'counter',
  't': 'stairs',
  'm': 'metal',
  'b': 'cable',
  'R': 'rack',
  'G': 'glass',
  'N': 'neon',
  's': 'sand',
  'n': 'snow',
  'p': 'puddle',
  'X': 'staticfield',
  'x': 'void',
  // Interior furniture
  'y': 'window',
  'B': 'bedtopl',
  'D': 'bedtopr',
  'E': 'bedbotl',
  'H': 'bedbotr',
  'd': 'desk',
  'P': 'terminal',
  'k': 'shelf',
  'v': 'tv',
  'e': 'table',
  'q': 'plant',
  'j': 'fridge',
  'u': 'rug',
};
