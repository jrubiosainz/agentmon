/**
 * GBA-style UI primitives: bordered windows, dialogue boxes with a typewriter,
 * cursor menus and the battle status panels.
 *
 * Everything is drawn procedurally at 1px precision so the UI stays crisp and
 * needs no art assets.
 */

import { font, LINE_H, type FontVariant } from './font.ts';
import { SCREEN_W } from './screen.ts';

export const PALETTE = {
  windowFill: '#f8f8f8',
  windowFillAlt: '#e8eef8',
  windowEdge: '#5878a8',
  windowEdgeLight: '#a8c0e0',
  windowShadow: '#303850',
  text: '#303038',
  textDim: '#8890a0',
  hpGreen: '#48d048',
  hpGreenDark: '#20a020',
  hpYellow: '#f8d030',
  hpYellowDark: '#c09818',
  hpRed: '#f85838',
  hpRedDark: '#c03018',
  expBlue: '#48b8f8',
  expBlueDark: '#2078b8',
  barBack: '#404858',
  black: '#101018',
  /** Generic accent + shading colours used by panels, badges and headings. */
  gold: '#f8d030',
  goldDark: '#a07818',
  dark: '#404858',
  shadow: '#181c28',
} as const;

export type WindowStyle = 'default' | 'dark' | 'flat';

/** Rounded, double-bordered window in the GBA RPG idiom. */
export function drawWindow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle = 'default',
): void {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const dark = style === 'dark';
  const fill = dark ? '#283048' : PALETTE.windowFill;
  const edge = dark ? '#8090b8' : PALETTE.windowEdge;
  const inner = dark ? '#404c70' : PALETTE.windowEdgeLight;

  // Drop shadow
  g.fillStyle = 'rgba(16,16,24,0.28)';
  g.fillRect(x + 2, y + h, w - 2, 2);
  g.fillRect(x + w, y + 2, 2, h - 2);

  // Outer border with clipped corners
  g.fillStyle = edge;
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);

  // Body
  g.fillStyle = fill;
  g.fillRect(x + 2, y + 1, w - 4, h - 2);
  g.fillRect(x + 1, y + 2, w - 2, h - 4);

  if (style !== 'flat') {
    // Inner highlight line
    g.fillStyle = inner;
    g.fillRect(x + 3, y + 2, w - 6, 1);
    g.fillRect(x + 2, y + 3, 1, h - 6);
    g.fillRect(x + w - 3, y + 3, 1, h - 6);
    g.fillRect(x + 3, y + h - 3, w - 6, 1);
  }
}

export function drawPanel(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, edge: string,
): void {
  g.fillStyle = edge;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  g.fillStyle = fill;
  g.fillRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2);
}

// --------------------------------------------------------------------------- //
// Dialogue
// --------------------------------------------------------------------------- //
export const TEXTBOX_H = 46;
export const TEXTBOX_Y = 160 - TEXTBOX_H - 2;
const TEXT_PAD_X = 10;
const TEXT_PAD_Y = 8;
const TEXT_WIDTH = SCREEN_W - TEXT_PAD_X * 2 - 4;
const LINES_PER_PAGE = 2;

/** Reveals text a character at a time, paging every two lines. */
export class Typewriter {
  private pages: string[][] = [];
  private page = 0;
  private revealed = 0;
  private tick = 0;
  /** Ticks between characters - 1 is the classic "fast" text speed. */
  speed = 1;
  done = false;

  setText(text: string): void {
    const lines = font.wrap(text, TEXT_WIDTH);
    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      this.pages.push(lines.slice(i, i + LINES_PER_PAGE));
    }
    if (this.pages.length === 0) this.pages = [['']];
    this.page = 0;
    this.revealed = 0;
    this.tick = 0;
    this.done = false;
  }

  private get pageLength(): number {
    return (this.pages[this.page] ?? []).reduce((n, l) => n + l.length, 0);
  }

  get pageComplete(): boolean {
    return this.revealed >= this.pageLength;
  }

  get isLastPage(): boolean {
    return this.page >= this.pages.length - 1;
  }

  update(): void {
    if (this.done || this.pageComplete) return;
    if (++this.tick >= this.speed) {
      this.tick = 0;
      this.revealed++;
    }
  }

  /** Skip the reveal, or advance to the next page. Returns true when finished. */
  advance(): boolean {
    if (!this.pageComplete) {
      this.revealed = this.pageLength;
      return false;
    }
    if (this.isLastPage) {
      this.done = true;
      return true;
    }
    this.page++;
    this.revealed = 0;
    return false;
  }

  skipAll(): void {
    this.page = this.pages.length - 1;
    this.revealed = this.pageLength;
    this.done = true;
  }

  draw(g: CanvasRenderingContext2D, blink: boolean, y = TEXTBOX_Y): void {
    drawWindow(g, 2, y, SCREEN_W - 4, TEXTBOX_H);
    const lines = this.pages[this.page] ?? [];
    let budget = this.revealed;
    for (let i = 0; i < lines.length; i++) {
      const full = lines[i]!;
      const shown = full.slice(0, Math.max(0, Math.min(full.length, budget)));
      budget -= full.length;
      font.draw(g, shown, TEXT_PAD_X, y + TEXT_PAD_Y + i * LINE_H, 'normal', false);
      if (budget <= 0) break;
    }
    if (this.pageComplete && blink) {
      font.draw(g, '\u25bc', SCREEN_W - 16, y + TEXTBOX_H - 14, 'normal', false);
    }
  }
}

// --------------------------------------------------------------------------- //
// Menus
// --------------------------------------------------------------------------- //
export interface MenuItem {
  label: string;
  value: string;
  detail?: string;
  disabled?: boolean;
  variant?: FontVariant;
}

/** Cursor-driven list. Supports 1..N columns and a scrolling viewport. */
export class Menu {
  index = 0;
  scroll = 0;

  constructor(
    public items: MenuItem[],
    public columns = 1,
    public visibleRows = 99,
  ) {}

  get rows(): number {
    return Math.ceil(this.items.length / this.columns);
  }

  get current(): MenuItem | undefined {
    return this.items[this.index];
  }

  setItems(items: MenuItem[]): void {
    this.items = items;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    this.clampScroll();
  }

  private clampScroll(): void {
    const row = Math.floor(this.index / this.columns);
    if (row < this.scroll) this.scroll = row;
    if (row >= this.scroll + this.visibleRows) this.scroll = row - this.visibleRows + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.rows - this.visibleRows)));
  }

  move(dx: number, dy: number): boolean {
    if (this.items.length === 0) return false;
    const before = this.index;
    if (dy !== 0) {
      const next = this.index + dy * this.columns;
      this.index = next < 0
        ? this.wrapVertical(next)
        : next >= this.items.length ? this.wrapVertical(next) : next;
    }
    if (dx !== 0 && this.columns > 1) {
      const col = this.index % this.columns;
      const rowStart = this.index - col;
      let nc = col + dx;
      if (nc < 0) nc = this.columns - 1;
      if (nc >= this.columns) nc = 0;
      const candidate = rowStart + nc;
      if (candidate < this.items.length) this.index = candidate;
    }
    this.clampScroll();
    return this.index !== before;
  }

  private wrapVertical(next: number): number {
    const col = this.index % this.columns;
    if (next < 0) {
      // jump to the last row that has this column
      let i = this.items.length - 1;
      while (i >= 0 && i % this.columns !== col) i--;
      return i < 0 ? 0 : i;
    }
    return col < this.items.length ? col : 0;
  }

  /** Render a plain list of labels with the cursor. */
  draw(
    g: CanvasRenderingContext2D,
    x: number, y: number,
    lineH = LINE_H,
    colW = 0,
  ): void {
    const startRow = this.scroll;
    const endRow = Math.min(this.rows, startRow + this.visibleRows);
    for (let r = startRow; r < endRow; r++) {
      for (let c = 0; c < this.columns; c++) {
        const i = r * this.columns + c;
        const item = this.items[i];
        if (!item) continue;
        const px = x + c * (colW || 0);
        const py = y + (r - startRow) * lineH;
        if (i === this.index) font.draw(g, '\u25b6', px - 8, py, 'normal', false);
        const variant: FontVariant = item.disabled ? 'dim' : (item.variant ?? 'normal');
        font.draw(g, item.label, px, py, variant, false);
        if (item.detail) font.drawRight(g, item.detail, px + (colW || 80) - 6, py, variant, false);
      }
    }
    // Scroll arrows
    if (this.scroll > 0) font.draw(g, '\u2191', x - 8, y - 8, 'dim', false);
    if (endRow < this.rows) font.draw(g, '\u2193', x - 8, y + this.visibleRows * lineH - 4, 'dim', false);
  }
}

// --------------------------------------------------------------------------- //
// Bars
// --------------------------------------------------------------------------- //
export function hpColors(ratio: number): [string, string] {
  if (ratio > 0.5) return [PALETTE.hpGreen, PALETTE.hpGreenDark];
  if (ratio > 0.2) return [PALETTE.hpYellow, PALETTE.hpYellowDark];
  return [PALETTE.hpRed, PALETTE.hpRedDark];
}

export function drawBar(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, ratio: number,
  light: string, dark: string,
): void {
  x = Math.round(x); y = Math.round(y); w = Math.round(w);
  g.fillStyle = PALETTE.black;
  g.fillRect(x - 1, y - 1, w + 2, 5);
  g.fillStyle = PALETTE.barBack;
  g.fillRect(x, y, w, 3);
  const fillW = Math.max(0, Math.min(w, Math.round(w * ratio)));
  if (fillW > 0) {
    g.fillStyle = light;
    g.fillRect(x, y, fillW, 2);
    g.fillStyle = dark;
    g.fillRect(x, y + 2, fillW, 1);
  }
}

export function drawHpBar(g: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number): void {
  const [light, dark] = hpColors(ratio);
  drawBar(g, x, y, w, ratio, light, dark);
}

export function drawExpBar(g: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number): void {
  drawBar(g, x, y, w, ratio, PALETTE.expBlue, PALETTE.expBlueDark);
}

/** Small "HP" tag drawn to the left of a health bar. */
export function drawHpTag(g: CanvasRenderingContext2D, x: number, y: number): void {
  font.draw(g, 'HP', x, y - 3, 'gold', false);
}

// --------------------------------------------------------------------------- //
// Misc
// --------------------------------------------------------------------------- //
export function fillScreen(g: CanvasRenderingContext2D, color: string, alpha = 1): void {
  const prev = g.globalAlpha;
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, SCREEN_W, 160);
  g.globalAlpha = prev;
}

/** Diagonal-hatch backdrop used behind menus, like the GBA start menu. */
export function drawHatchBackdrop(g: CanvasRenderingContext2D, phase: number, a = '#4868a8', b = '#3a5490'): void {
  g.fillStyle = a;
  g.fillRect(0, 0, SCREEN_W, 160);
  g.fillStyle = b;
  const off = Math.floor(phase) % 16;
  for (let i = -160; i < SCREEN_W + 160; i += 16) {
    g.beginPath();
    g.moveTo(i + off, 0);
    g.lineTo(i + off + 8, 0);
    g.lineTo(i + off + 8 - 160, 160);
    g.lineTo(i + off - 160, 160);
    g.closePath();
    g.fill();
  }
}
