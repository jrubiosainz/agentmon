/** AGENT MART - buy/sell counter. */

import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import {
  drawPanel, drawWindow, Menu, TEXTBOX_H, TEXTBOX_Y, Typewriter, type MenuItem,
} from '../../engine/ui.ts';
import { item as itemDef } from '../data/items.ts';
import { bagAdd, bagRemove, formatMoney } from '../state.ts';

export interface ShopPayload {
  stock: string[];
}

type Mode = 'greet' | 'root' | 'buy' | 'sell' | 'quantity' | 'message';

const SHELF_COLORS = ['#d84040', '#e8a020', '#48b8f8', '#2e9e50', '#a860d8', '#e86890'];

export class ShopScene extends Scene {
  private stock: string[] = [];
  private mode: Mode = 'greet';
  private returnMode: Mode = 'root';
  private root = new Menu([
    { label: 'BUY', value: 'buy' },
    { label: 'SELL', value: 'sell' },
    { label: 'SEE YA!', value: 'exit' },
  ]);
  private list = new Menu([], 1, 5);
  private tw = new Typewriter();
  private tick = 0;
  private qty = 1;
  private qtyMax = 1;
  private qtyPrice = 0;
  private qtyKey = '';
  private selling = false;

  override enter(payload?: unknown): void {
    this.stock = ((payload ?? {}) as ShopPayload).stock ?? ['nanocore', 'patch'];
    this.tw.speed = this.game.textDelay;
    this.tw.setText('Welcome to the AGENT MART! How can I help you?');
  }

  private buildBuy(): void {
    const items = this.stock.map<MenuItem>((key) => ({
      label: itemDef(key).name,
      value: key,
      detail: `\u00a5${formatMoney(itemDef(key).price)}`,
    }));
    items.push({ label: 'CANCEL', value: 'cancel' });
    this.list = new Menu(items, 1, 5);
  }

  private buildSell(): void {
    const items = this.game.save.bag
      .filter((b) => itemDef(b.key).price > 0 && itemDef(b.key).category !== 'key')
      .map<MenuItem>((b) => ({
        label: itemDef(b.key).name,
        value: b.key,
        detail: `x${b.count}`,
      }));
    items.push({ label: 'CANCEL', value: 'cancel' });
    this.list = new Menu(items, 1, 5);
  }

  private say(text: string, next: Mode): void {
    this.tw.speed = this.game.textDelay;
    this.tw.setText(text);
    this.returnMode = next;
    this.mode = 'message';
  }

  update(): void {
    this.tick++;
    this.tw.update();
    const inp = this.game.input;

    if (this.mode === 'greet' || this.mode === 'message') {
      if (inp.pressed('a') || inp.pressed('b')) {
        if (this.tw.advance()) {
          this.mode = this.mode === 'greet' ? 'root' : this.returnMode;
          if (this.mode === 'buy') this.buildBuy();
          if (this.mode === 'sell') this.buildSell();
        }
      }
      return;
    }

    if (this.mode === 'root') {
      if (inp.repeat('up') && this.root.move(0, -1)) audio.sfx('cursor');
      if (inp.repeat('down') && this.root.move(0, 1)) audio.sfx('cursor');
      if (inp.pressed('b')) { audio.sfx('cancel'); this.game.pop(); return; }
      if (!inp.pressed('a')) return;
      audio.sfx('select');
      const v = this.root.current?.value;
      if (v === 'exit') { this.game.pop(); return; }
      if (v === 'buy') { this.buildBuy(); this.mode = 'buy'; }
      if (v === 'sell') {
        this.buildSell();
        if (this.list.items.length <= 1) { this.say('You have nothing I could buy.', 'root'); return; }
        this.mode = 'sell';
      }
      return;
    }

    if (this.mode === 'buy' || this.mode === 'sell') {
      if (inp.repeat('up') && this.list.move(0, -1)) audio.sfx('cursor');
      if (inp.repeat('down') && this.list.move(0, 1)) audio.sfx('cursor');
      if (inp.pressed('b')) { audio.sfx('cancel'); this.mode = 'root'; return; }
      if (!inp.pressed('a')) return;
      const cur = this.list.current;
      if (!cur || cur.value === 'cancel') { audio.sfx('cancel'); this.mode = 'root'; return; }
      audio.sfx('select');
      this.selling = this.mode === 'sell';
      this.qtyKey = cur.value;
      const def = itemDef(cur.value);
      if (this.selling) {
        const owned = this.game.save.bag.find((b) => b.key === cur.value)?.count ?? 0;
        this.qtyMax = owned;
        this.qtyPrice = Math.floor(def.price / 2);
      } else {
        this.qtyPrice = def.price;
        this.qtyMax = Math.max(1, Math.min(99, Math.floor(this.game.save.money / Math.max(1, def.price))));
        if (this.game.save.money < def.price) { this.say('You do not have enough credits.', 'buy'); return; }
      }
      this.qty = 1;
      this.mode = 'quantity';
      return;
    }

    if (this.mode === 'quantity') {
      if (inp.repeat('up')) { this.qty = this.qty >= this.qtyMax ? 1 : this.qty + 1; audio.sfx('cursor'); }
      if (inp.repeat('down')) { this.qty = this.qty <= 1 ? this.qtyMax : this.qty - 1; audio.sfx('cursor'); }
      if (inp.repeat('right')) { this.qty = Math.min(this.qtyMax, this.qty + 10); audio.sfx('cursor'); }
      if (inp.repeat('left')) { this.qty = Math.max(1, this.qty - 10); audio.sfx('cursor'); }
      if (inp.pressed('b')) { audio.sfx('cancel'); this.mode = this.selling ? 'sell' : 'buy'; return; }
      if (!inp.pressed('a')) return;
      audio.sfx('select');
      const def = itemDef(this.qtyKey);
      const total = this.qty * this.qtyPrice;
      if (this.selling) {
        bagRemove(this.game.save, this.qtyKey, this.qty);
        this.game.save.money = Math.min(999999, this.game.save.money + total);
        audio.sfx('item');
        this.buildSell();
        this.say(`Turned over ${this.qty} ${def.name}. You got \u00a5${formatMoney(total)}!`, 'sell');
      } else {
        if (total > this.game.save.money) { this.say('You do not have enough credits.', 'buy'); return; }
        this.game.save.money -= total;
        bagAdd(this.game.save, this.qtyKey, this.qty);
        audio.sfx('item');
        this.say(`Here you go! ${this.qty} ${def.name}. Thank you!`, 'buy');
      }
    }
  }

  /** A wall shelf stocked with colourful boxes, used to dress the mart backdrop. */
  private drawShelf(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    g.fillStyle = '#5c3c20';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#8c5c30';
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    const rows = Math.floor((h - 2) / 10);
    for (let r = 0; r < rows; r++) {
      const sy = y + 2 + r * 10;
      g.fillStyle = '#5c3c20';
      g.fillRect(x + 1, sy + 8, w - 2, 2);
      for (let i = 0; x + 3 + i * 6 < x + w - 4; i++) {
        const seed = (r * 31 + i * 17 + Math.floor(x / 7)) % SHELF_COLORS.length;
        g.fillStyle = SHELF_COLORS[seed]!;
        g.fillRect(x + 3 + i * 6, sy + 2, 4, 6);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 3 + i * 6, sy + 2, 4, 1);
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    // Mart interior backdrop.
    g.fillStyle = '#4878b8';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = '#3c68a4';
    for (let y = 0; y < SCREEN_H; y += 16) g.fillRect(0, y, SCREEN_W, 8);
    this.drawShelf(g, 6, 44, 84, 52);
    this.drawShelf(g, 150, 44, 84, 52);

    // The clerk stands behind the counter: draw them first so the counter
    // occludes everything below the waist, which sells the depth.
    const clerk = this.game.charSheet('npc_clerk');
    if (clerk) clerk.drawFrame(g, 'walk_down', 0, SCREEN_W / 2, 114, { scale: 2 });
    drawPanel(g, 0, 100, SCREEN_W, 60, '#c8b088', '#8c7050');

    drawWindow(g, 4, 4, 108, 26);
    font.draw(g, 'MONEY', 14, 8, 'normal', false);
    font.drawRight(g, `\u00a5${formatMoney(this.game.save.money)}`, 106, 18, 'normal', false);

    if (this.mode === 'greet' || this.mode === 'message') {
      this.tw.draw(g, Math.floor(this.tick / 18) % 2 === 0);
      return;
    }

    if (this.mode === 'root') {
      const h = 12 + this.root.items.length * 13;
      drawWindow(g, SCREEN_W - 84, TEXTBOX_Y - h - 2, 80, h);
      this.root.draw(g, SCREEN_W - 68, TEXTBOX_Y - h + 4, 13);
      drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
      font.draw(g, 'How can I help you?', 12, TEXTBOX_Y + 14, 'normal', false);
      return;
    }

    // Buy / sell list. Starts below the MONEY panel so the two never overlap.
    drawWindow(g, 96, 30, 140, 82);
    this.list.draw(g, 112, 38, 14, 120);
    drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
    const cur = this.list.current;
    const desc = cur && cur.value !== 'cancel'
      ? itemDef(cur.value).desc
      : this.selling ? 'Nothing else to sell.' : 'Come again!';
    for (const [i, line] of font.wrap(desc, 216).slice(0, 3).entries()) {
      font.draw(g, line, 12, TEXTBOX_Y + 8 + i * 12, 'normal', false);
    }

    if (this.mode === 'quantity') {
      const total = this.qty * this.qtyPrice;
      drawWindow(g, 118, TEXTBOX_Y - 32, 118, 30);
      font.draw(g, `x${String(this.qty).padStart(2, '0')}`, 128, TEXTBOX_Y - 24, 'normal', false);
      font.drawRight(g, `\u00a5${formatMoney(total)}`, 228, TEXTBOX_Y - 24, 'normal', false);
      font.draw(g, '\u25b2\u25bc', 128, TEXTBOX_Y - 14, 'dim', false);
    }
  }
}
