/**
 * PROF. ADA's core bay - the starter choice.
 *
 * The three prototypes stand lit on their docks so the player can see exactly
 * what they are picking (sprite, name, type, size and dex entry) instead of
 * choosing blind from a line of dialogue.
 */

import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { drawPanel, drawWindow, PALETTE, TEXTBOX_H, TEXTBOX_Y } from '../../engine/ui.ts';
import { dexEntryOf, genusOf, species, typeDef, typeName, type SpeciesDef } from '../data/dex.ts';
import { t, tUpper, upper } from '../i18n.ts';

export interface StarterPayload {
  keys: string[];
}

export interface StarterResult {
  /** null when the bay closed without a confirmed choice. */
  key: string | null;
}

type Mode = 'browse' | 'confirm' | 'reveal';

const HEADER_H = 15;
/** Shared floor line the three prototypes stand on. */
const FLOOR_Y = 86;
const SLOT_SPAN = 76;
const HORIZON = 70;
const NAMEPLATE_Y = 96;
/** Frames the release animation runs before the scene hands the pick back. */
const REVEAL_FRAMES = 72;

export class StarterScene extends Scene {
  private keys: string[] = [];
  private index = 0;
  private mode: Mode = 'browse';
  private yesNo = 0;
  private tick = 0;
  private revealT = 0;
  private hint = 0;
  private chosen: string | null = null;
  private popped = false;

  override enter(payload?: unknown): void {
    const p = (payload ?? {}) as StarterPayload;
    const valid = (p.keys ?? []).filter((k) => {
      try {
        species(k);
        return true;
      } catch {
        return false;
      }
    });
    if (valid.length === 0) throw new Error('StarterScene: no known starters to show');
    this.keys = valid.slice(0, 3);
    // Open on the middle dock so the bay reads as balanced on the first frame.
    this.index = Math.floor((this.keys.length - 1) / 2);
    audio.sfx('menuOpen');
  }

  private get current(): SpeciesDef {
    return species(this.keys[this.index]!);
  }

  /** Dock centres, spread evenly however many prototypes are on offer. */
  private slotX(i: number): number {
    const start = SCREEN_W / 2 - ((this.keys.length - 1) * SLOT_SPAN) / 2;
    return Math.round(start + i * SLOT_SPAN);
  }

  // ------------------------------------------------------------------ update
  update(): void {
    this.tick++;
    if (this.hint > 0) this.hint--;

    switch (this.mode) {
      case 'browse': return this.updateBrowse();
      case 'confirm': return this.updateConfirm();
      case 'reveal': return this.updateReveal();
    }
  }

  private updateBrowse(): void {
    const inp = this.game.input;
    const last = this.keys.length - 1;
    if (inp.repeat('left') && this.index > 0) {
      this.index--;
      audio.sfx('cursor');
    } else if (inp.repeat('right') && this.index < last) {
      this.index++;
      audio.sfx('cursor');
    }
    if (inp.pressed('a')) {
      this.mode = 'confirm';
      this.yesNo = 0;
      audio.sfx('select');
    } else if (inp.pressed('b')) {
      // The bay is modal: ADA will not let you leave empty-handed, so say so
      // rather than swallowing the press.
      this.hint = 90;
      audio.sfx('cancel');
    }
  }

  private updateConfirm(): void {
    const inp = this.game.input;
    if (inp.repeat('up') || inp.repeat('down')) {
      this.yesNo = this.yesNo === 0 ? 1 : 0;
      audio.sfx('cursor');
      return;
    }
    if (inp.pressed('b')) {
      this.mode = 'browse';
      audio.sfx('cancel');
      return;
    }
    if (!inp.pressed('a')) return;
    if (this.yesNo === 0) {
      this.chosen = this.keys[this.index]!;
      this.mode = 'reveal';
      this.revealT = 0;
      audio.sfx('heal');
    } else {
      this.mode = 'browse';
      audio.sfx('cancel');
    }
  }

  private updateReveal(): void {
    this.revealT++;
    if (this.revealT >= REVEAL_FRAMES && !this.popped) {
      this.popped = true;
      this.game.pop({ key: this.chosen } satisfies StarterResult);
    }
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D): void {
    this.drawBay(g);
    for (let i = 0; i < this.keys.length; i++) this.drawDock(g, i);
    for (let i = 0; i < this.keys.length; i++) this.drawPrototype(g, i);
    this.drawScanlines(g);
    for (let i = 0; i < this.keys.length; i++) this.drawNameplate(g, i);
    this.drawEdgeArrows(g);
    this.drawHeader(g);
    this.drawCard(g);
    if (this.mode === 'confirm') this.drawConfirm(g);
    if (this.mode === 'reveal') this.drawFlash(g);
  }

  /** Lab interior: server wall, horizon glow and a grid floor. */
  private drawBay(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#0e1830';
    g.fillRect(0, HEADER_H, SCREEN_W, HORIZON - HEADER_H);

    // Racks. Dim enough to sit behind the prototypes without competing.
    for (let i = 0; i < 8; i++) {
      const x = 2 + i * 30;
      g.fillStyle = '#141f3a';
      g.fillRect(x, 19, 24, HORIZON - 19);
      g.fillStyle = '#1b2a4a';
      g.fillRect(x, 19, 24, 2);
      for (let j = 0; j < 5; j++) {
        const on = ((this.tick >> 3) + i * 3 + j * 7) % 5 !== 0;
        g.fillStyle = on ? (j % 2 ? '#2e9e50' : '#3868c8') : '#1a2a44';
        g.fillRect(x + 4, 25 + j * 8, 3, 2);
      }
      g.fillStyle = '#0e1830';
      g.fillRect(x + 24, 19, 6, HORIZON - 19);
    }

    g.fillStyle = '#22406e';
    g.fillRect(0, HORIZON - 2, SCREEN_W, 1);
    g.fillStyle = '#2e5a94';
    g.fillRect(0, HORIZON - 1, SCREEN_W, 1);

    g.fillStyle = '#16223a';
    g.fillRect(0, HORIZON, SCREEN_W, SCREEN_H - HORIZON);
    g.fillStyle = '#1d2c48';
    for (let y = HORIZON + 4; y < TEXTBOX_Y; y += 8) g.fillRect(0, y, SCREEN_W, 1);
    for (let x = 0; x < SCREEN_W; x += 16) g.fillRect(x, HORIZON, 1, TEXTBOX_Y - HORIZON);
  }

  /** Dock plate plus, for the highlighted slot, its containment spotlight. */
  private drawDock(g: CanvasRenderingContext2D, i: number): void {
    const sp = species(this.keys[i]!);
    const td = typeDef(sp.types[0]!);
    const selected = i === this.index;
    const cx = this.dockX(i);
    const alpha = this.slotAlpha(i);
    if (alpha <= 0) return;

    g.globalAlpha = alpha;
    if (selected) {
      // Light column from the dock up into the ceiling rig.
      g.fillStyle = 'rgba(96,180,248,0.09)';
      g.beginPath();
      g.moveTo(cx - 9, HEADER_H);
      g.lineTo(cx + 9, HEADER_H);
      g.lineTo(cx + 27, FLOOR_Y + 2);
      g.lineTo(cx - 27, FLOOR_Y + 2);
      g.closePath();
      g.fill();

      const r = 25 + Math.sin(this.tick / 12) * 2;
      g.strokeStyle = td.color;
      g.globalAlpha = alpha * 0.55;
      g.beginPath();
      g.ellipse(cx, FLOOR_Y + 3, r, r * 0.27, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = alpha;
    }

    // Contact shadow.
    g.fillStyle = 'rgba(8,12,24,0.45)';
    g.fillRect(cx - 17, FLOOR_Y - 1, 34, 2);
    g.fillRect(cx - 20, FLOOR_Y, 40, 1);

    const rows: [number, string][] = selected
      ? [[21, td.dark], [20, '#546c98'], [18, '#3c4c70'], [15, '#1a2436']]
      : [[19, '#2c3a58'], [18, '#3c4c70'], [16, '#28344c'], [13, '#151e30']];
    for (const [i2, [w, c]] of rows.entries()) {
      g.fillStyle = c;
      g.fillRect(cx - w, FLOOR_Y + 1 + i2 * 2, w * 2, 2);
    }
    if (selected) {
      g.fillStyle = td.color;
      g.fillRect(cx - 21, FLOOR_Y + 1, 42, 1);
    }
    g.globalAlpha = 1;
  }

  private drawPrototype(g: CanvasRenderingContext2D, i: number): void {
    const key = this.keys[i]!;
    const sp = species(key);
    const selected = i === this.index;
    const cx = this.dockX(i);
    const alpha = this.slotAlpha(i);
    if (alpha <= 0) return;

    const reveal = this.mode === 'reveal' && selected ? Math.min(1, this.revealT / 26) : 0;
    const bob = selected ? Math.round(Math.sin(this.tick / 18) * 2) : 0;
    const scale = (selected ? 1 : 0.72) + reveal * 0.28;
    const y = FLOOR_Y + bob - Math.round(reveal * 8);

    const sheet = this.game.creatureSheet(key);
    if (sheet) {
      const frame = Math.floor(this.tick / (selected ? 9 : 14));
      sheet.drawFrame(g, 'idle', frame, cx, y, {
        scale,
        alpha,
        tint: selected ? undefined : '#101c36',
        tintAmount: selected ? 0 : 0.42,
      });
    } else {
      // Art missing: still show something sized and coloured like the species.
      const td = typeDef(sp.types[0]!);
      const w = Math.round(30 * scale);
      g.globalAlpha = alpha;
      drawPanel(g, cx - w / 2, y - w, w, w, td.color, td.dark);
      g.globalAlpha = 1;
    }

    if (selected) this.drawSparks(g, cx);
  }

  private drawSparks(g: CanvasRenderingContext2D, cx: number): void {
    for (let i = 0; i < 6; i++) {
      const t = (this.tick * 0.7 + i * 23) % 72;
      const y = FLOOR_Y - t;
      if (y < HEADER_H + 2) continue;
      const x = cx + Math.sin((t + i * 40) / 14) * 15;
      g.globalAlpha = 0.55 * (1 - t / 72);
      g.fillStyle = i % 2 ? '#78f0ff' : '#40e0f0';
      g.fillRect(Math.round(x), Math.round(y), 1, 2);
    }
    g.globalAlpha = 1;
  }

  private drawScanlines(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(80,140,200,0.07)';
    for (let y = HEADER_H + ((this.tick >> 1) % 4); y < TEXTBOX_Y; y += 4) {
      g.fillRect(0, y, SCREEN_W, 1);
    }
  }

  private drawNameplate(g: CanvasRenderingContext2D, i: number): void {
    const sp = species(this.keys[i]!);
    const selected = i === this.index;
    const alpha = this.slotAlpha(i);
    if (alpha <= 0) return;
    const cx = this.dockX(i);
    const w = 66;
    g.globalAlpha = alpha;
    drawPanel(
      g, cx - w / 2, NAMEPLATE_Y, w, 12,
      selected ? PALETTE.windowFill : '#2c3650',
      selected ? typeDef(sp.types[0]!).color : '#151e30',
    );
    font.drawCentered(
      g, sp.name.slice(0, 10), cx, NAMEPLATE_Y + 3,
      selected ? 'normal' : 'dim', false,
    );
    g.globalAlpha = 1;
  }

  /** Persistent edge arrows, clear of the docks. */
  private drawEdgeArrows(g: CanvasRenderingContext2D): void {
    if (this.mode !== 'browse') return;
    const lit = this.tick % 32 < 24;
    if (this.index > 0) font.draw(g, '\u25c0', 3, 52, lit ? 'white' : 'dim', true);
    if (this.index < this.keys.length - 1) {
      font.draw(g, '\u25b6', SCREEN_W - 9, 52, lit ? 'white' : 'dim', true);
    }
  }

  private drawHeader(g: CanvasRenderingContext2D): void {
    const nagging = this.hint > 0;
    g.fillStyle = nagging ? '#2a1018' : '#0c1424';
    g.fillRect(0, 0, SCREEN_W, HEADER_H - 1);
    g.fillStyle = nagging ? '#8c2434' : '#2a3a5c';
    g.fillRect(0, HEADER_H - 1, SCREEN_W, 1);

    if (nagging) {
      // Solid, not blinking: the player just asked to leave and deserves a
      // legible answer rather than a strobe.
      const pulse = Math.floor(this.tick / 10) % 2 === 0;
      font.drawCentered(
        g, tUpper('CHOOSE A CORE TO CONTINUE'), SCREEN_W / 2, 4,
        pulse ? 'red' : 'gold', false,
      );
      return;
    }
    const title = this.mode === 'reveal' ? tUpper('CORE RELEASED') : tUpper('PROTOTYPE CORE BAY');
    font.drawCentered(g, title, SCREEN_W / 2, 4, 'gold', false);

    // Slot pips, so the player can see how many cores are on offer.
    for (let i = 0; i < this.keys.length; i++) {
      g.fillStyle = i === this.index ? '#f8d030' : '#3c4c70';
      g.fillRect(SCREEN_W - 8 - (this.keys.length - i) * 6, 6, 4, 4);
    }
    g.fillStyle = ((this.tick >> 4) & 1) ? '#d83030' : '#4a1c24';
    g.fillRect(6, 6, 4, 4);
  }

  /** Dossier for the highlighted prototype. */
  private drawCard(g: CanvasRenderingContext2D): void {
    const sp = this.mode === 'reveal' && this.chosen ? species(this.chosen) : this.current;
    drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);

    const y = TEXTBOX_Y + 3;
    font.draw(g, t('No.{id}', { id: String(sp.id).padStart(3, '0') }), 8, y, 'dim', false);
    font.draw(g, sp.name, 44, y, 'normal', false);
    font.draw(g, upper(genusOf(sp)), 104, y, 'dim', false);

    let tx = SCREEN_W - 10;
    for (const type of [...sp.types].reverse()) {
      const td = typeDef(type);
      tx -= 40;
      g.fillStyle = td.color;
      g.fillRect(tx, y - 2, 40, 11);
      g.fillStyle = td.dark;
      g.fillRect(tx, y + 7, 40, 2);
      font.drawCentered(g, upper(typeName(type)).slice(0, 6), tx + 20, y, 'white', false);
      tx -= 3;
    }

    if (this.mode === 'confirm') {
      font.draw(g, t('Take {name}?', { name: sp.name }), 8, TEXTBOX_Y + 20, 'normal', false);
      return;
    }
    const body = this.mode === 'reveal'
      ? t('{name} was released from its core. It is yours now!', { name: sp.name })
      : dexEntryOf(sp);
    for (const [i, line] of font.wrap(body, 220).slice(0, 3).entries()) {
      font.draw(g, line, 8, TEXTBOX_Y + 14 + i * 10, 'normal', false);
    }
  }

  private drawConfirm(g: CanvasRenderingContext2D): void {
    const w = 56;
    const h = 32;
    // Sit on the far side of the bay so the prototype being confirmed and its
    // nameplate stay in full view.
    const rightHalf = this.slotX(this.index) > SCREEN_W / 2;
    const x = rightHalf ? 6 : SCREEN_W - w - 6;
    const y = TEXTBOX_Y - h - 2;
    drawWindow(g, x, y, w, h);
    font.draw(g, tUpper('YES'), x + 18, y + 6, 'normal', false);
    font.draw(g, tUpper('NO'), x + 18, y + 18, 'normal', false);
    font.draw(g, '\u25b6', x + 8, y + 6 + this.yesNo * 12, 'normal', false);
  }

  private drawFlash(g: CanvasRenderingContext2D): void {
    const k = this.revealT / 20;
    if (k >= 1) return;
    g.fillStyle = `rgba(248,252,255,${(1 - k) * 0.75})`;
    g.fillRect(0, HEADER_H, SCREEN_W, TEXTBOX_Y - HEADER_H);
  }

  // ------------------------------------------------------------------ helpers
  /** Horizontal centre, easing the winner to the middle during the reveal. */
  private dockX(i: number): number {
    const base = this.slotX(i);
    if (this.mode !== 'reveal' || i !== this.index) return base;
    const k = Math.min(1, this.revealT / 26);
    return Math.round(base + (SCREEN_W / 2 - base) * k * k);
  }

  /** The losing docks power down once a choice is locked in. */
  private slotAlpha(i: number): number {
    if (this.mode !== 'reveal' || i === this.index) return 1;
    return Math.max(0, 1 - this.revealT / 14);
  }
}
