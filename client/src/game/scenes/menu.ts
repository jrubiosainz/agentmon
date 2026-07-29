/** The pause menu and every screen reachable from it. */

import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import {
  drawExpBar, drawHpBar, drawPanel, drawWindow, hpColors, Menu, TEXTBOX_H, TEXTBOX_Y,
  Typewriter, drawCaptureCore, type MenuItem,
} from '../../engine/ui.ts';
import {
  displayName, expToNextLevel, healFully, isFainted, maxHp, stats,
  STATUS_COLOR, STATUS_SHORT, type AgentInstance,
} from '../data/agent.ts';
import { allSpecies, dexSize, move as moveDef, species, typeDef } from '../data/dex.ts';
import { CATEGORY_NAME, CATEGORY_ORDER, item as itemDef, type ItemCategory } from '../data/items.ts';
import { BADGE_INFO, BADGE_ORDER } from '../data/trainers.ts';
import { saves, summarise } from '../save.ts';
import {
  bagAdd, bagRemove, formatMoney, formatPlaytime, type SaveData,
} from '../state.ts';

// =========================================================================== //
// Start menu
// =========================================================================== //
export class StartMenuScene extends Scene {
  override transparent = true;
  private menu = new Menu([]);
  private tick = 0;
  private busy = false;
  private toast = { text: '', timer: 0 };

  override enter(): void {
    this.rebuild();
  }

  override resume(): void {
    this.game.input.clear();
    this.busy = false;
    this.rebuild();
  }

  private rebuild(): void {
    const items: MenuItem[] = [
      { label: 'AGÉNTDEX', value: 'dex' },
      { label: 'AGÉNTMON', value: 'party' },
      { label: 'BAG', value: 'bag' },
      { label: this.game.save.playerName.slice(0, 8), value: 'card' },
      { label: 'SAVE', value: 'save' },
      { label: 'OPTION', value: 'options' },
      { label: 'EXIT', value: 'exit' },
    ];
    const keep = this.menu.index;
    this.menu.setItems(items);
    this.menu.index = Math.min(keep, items.length - 1);
  }

  update(): void {
    this.tick++;
    if (this.toast.timer > 0) this.toast.timer--;
    if (this.busy) return;
    const inp = this.game.input;
    if (inp.repeat('up') && this.menu.move(0, -1)) audio.sfx('cursor');
    if (inp.repeat('down') && this.menu.move(0, 1)) audio.sfx('cursor');
    if (inp.pressed('b') || inp.pressed('start')) { audio.sfx('cancel'); this.game.pop(); return; }
    if (!inp.pressed('a')) return;

    audio.sfx('select');
    switch (this.menu.current?.value) {
      case 'dex': this.busy = true; void this.game.scenes.push(new DexScene()); break;
      case 'party': this.busy = true; void this.game.scenes.push(new PartyScene(), { mode: 'overworld' }); break;
      case 'bag': this.busy = true; void this.game.scenes.push(new BagScene(), { mode: 'overworld' }); break;
      case 'card': this.busy = true; void this.game.scenes.push(new TrainerCardScene()); break;
      case 'save': this.busy = true; void this.game.scenes.push(new SaveScene()); break;
      case 'options': this.busy = true; void this.game.scenes.push(new OptionsScene()); break;
      case 'exit': this.game.pop(); break;
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const w = 84;
    const x = SCREEN_W - w - 4;
    const h = 14 + this.menu.items.length * 13;
    drawWindow(g, x, 4, w, h);
    this.menu.draw(g, x + 16, 12, 13);
    if (this.toast.timer > 0) {
      drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
      font.draw(g, this.toast.text, 12, TEXTBOX_Y + 12, 'normal', false);
    }
  }
}

// =========================================================================== //
// Party
// =========================================================================== //
export interface PartyPayload {
  /** overworld = full menu, battle = pick a switch-in, switchIn = forced, useItem = target. */
  mode: 'overworld' | 'battle' | 'switchIn' | 'useItem';
  itemKey?: string;
}

export class PartyScene extends Scene {
  private mode: PartyPayload['mode'] = 'overworld';
  private itemKey: string | undefined;
  private index = 0;
  private tick = 0;
  private subMenu: Menu | null = null;
  private message = '';
  private messageTimer = 0;
  private swapFrom = -1;

  override enter(payload?: unknown): void {
    const p = (payload ?? {}) as PartyPayload;
    this.mode = p.mode ?? 'overworld';
    this.itemKey = p.itemKey;
    this.index = 0;
    if (this.mode === 'battle' || this.mode === 'switchIn') {
      const alive = this.game.save.party.findIndex((a) => !isFainted(a));
      if (alive > 0) this.index = alive;
    }
  }

  private get party(): AgentInstance[] {
    return this.game.save.party;
  }

  update(): void {
    this.tick++;
    if (this.messageTimer > 0) this.messageTimer--;
    const inp = this.game.input;

    if (this.subMenu) {
      if (inp.repeat('up') && this.subMenu.move(0, -1)) audio.sfx('cursor');
      if (inp.repeat('down') && this.subMenu.move(0, 1)) audio.sfx('cursor');
      if (inp.pressed('b')) { audio.sfx('cancel'); this.subMenu = null; return; }
      if (inp.pressed('a')) { audio.sfx('select'); this.chooseSubMenu(); }
      return;
    }

    const n = this.party.length;
    if (n === 0) { if (inp.pressed('b')) this.game.pop(); return; }
    if (inp.repeat('up')) { this.index = (this.index - 1 + n) % n; audio.sfx('cursor'); }
    if (inp.repeat('down')) { this.index = (this.index + 1) % n; audio.sfx('cursor'); }

    if (inp.pressed('b')) {
      if (this.swapFrom >= 0) { this.swapFrom = -1; audio.sfx('cancel'); return; }
      if (this.mode === 'switchIn') { audio.sfx('error'); return; }
      audio.sfx('cancel');
      this.game.pop(undefined);
      return;
    }

    if (!inp.pressed('a')) return;
    audio.sfx('select');

    if (this.swapFrom >= 0) {
      const a = this.party[this.swapFrom]!;
      this.party[this.swapFrom] = this.party[this.index]!;
      this.party[this.index] = a;
      this.swapFrom = -1;
      return;
    }

    if (this.mode === 'battle' || this.mode === 'switchIn') {
      const agent = this.party[this.index]!;
      if (isFainted(agent)) { this.flash('That AGÉNTMON has no charge left!'); return; }
      this.game.pop({ index: this.index });
      return;
    }

    if (this.mode === 'useItem') {
      this.game.pop({ index: this.index });
      return;
    }

    this.subMenu = new Menu([
      { label: 'SUMMARY', value: 'summary' },
      { label: 'SWITCH', value: 'switch' },
      { label: 'CANCEL', value: 'cancel' },
    ]);
  }

  private chooseSubMenu(): void {
    const value = this.subMenu?.current?.value;
    this.subMenu = null;
    if (value === 'summary') void this.game.scenes.push(new SummaryScene(), { index: this.index });
    else if (value === 'switch') this.swapFrom = this.index;
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 90;
    audio.sfx('error');
  }

  override resume(): void {
    this.game.input.clear();
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#2c4c8c';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Diagonal hatch background, GBA party-screen style.
    g.fillStyle = '#34589c';
    for (let i = -SCREEN_H; i < SCREEN_W; i += 12) {
      g.beginPath();
      g.moveTo(i, SCREEN_H);
      g.lineTo(i + SCREEN_H, 0);
      g.lineTo(i + SCREEN_H + 5, 0);
      g.lineTo(i + 5, SCREEN_H);
      g.closePath();
      g.fill();
    }

    for (let i = 0; i < this.party.length; i++) {
      const a = this.party[i]!;
      const first = i === 0;
      const x = first ? 4 : 78;
      const y = first ? 6 : 4 + (i - 1) * 25;
      const w = first ? 70 : 158;
      const h = first ? 46 : 23;
      const selected = i === this.index;
      drawPanel(g, x, y, w, h,
        selected ? '#f0e0a8' : (this.swapFrom === i ? '#a8d8f0' : '#e8e8f0'),
        selected ? '#c09828' : '#606880');

      const icon = this.game.atlas('icons');
      const iconKey = a.speciesKey;
      if (icon?.has(iconKey)) icon.draw(g, iconKey, x + 2, y + (first ? 8 : -4), first ? 1 : 0.75);
      else {
        g.fillStyle = typeDef(species(a.speciesKey).types[0]!).color;
        g.fillRect(x + 6, y + 4, 14, 14);
      }

      const tx = x + (first ? 4 : 30);
      const ty = y + (first ? 2 : 3);
      font.draw(g, displayName(a).slice(0, 10), tx, ty, 'normal', false);
      font.draw(g, `:L${a.level}`, tx, ty + 10, 'normal', false);
      const ratio = a.hp / maxHp(a);
      drawHpBar(g, tx + 34, ty + 11, 44, ratio);
      font.drawRight(g, `${a.hp}/${maxHp(a)}`, x + w - 4, ty + (first ? 22 : 10), 'normal', false);
      if (a.status !== 'none') {
        // Compact rows have no spare line, so the chip rides the right end of
        // the name row; the big panel has room underneath.
        const sx = first ? tx : x + w - 26;
        const sy = ty + (first ? 32 : 0);
        g.fillStyle = STATUS_COLOR[a.status];
        g.fillRect(sx, sy, 22, 9);
        font.drawCentered(g, STATUS_SHORT[a.status], sx + 11, sy + 1, 'white', false);
      }
    }

    drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
    const prompt = this.messageTimer > 0
      ? this.message
      : this.swapFrom >= 0
        ? 'Move to where?'
        : this.mode === 'useItem'
          ? `Use the ${itemDef(this.itemKey ?? 'patch').name} on which one?`
          : this.mode === 'overworld'
            ? 'Choose an AGÉNTMON.'
            : 'Send out which AGÉNTMON?';
    font.draw(g, prompt, 12, TEXTBOX_Y + 14, 'normal', false);

    if (this.subMenu) {
      const h = 12 + this.subMenu.items.length * 13;
      drawWindow(g, SCREEN_W - 82, TEXTBOX_Y - h - 2, 78, h);
      this.subMenu.draw(g, SCREEN_W - 66, TEXTBOX_Y - h + 4, 13);
    }
  }
}

// =========================================================================== //
// Summary
// =========================================================================== //
export class SummaryScene extends Scene {
  private index = 0;
  private page = 0;

  override enter(payload?: unknown): void {
    this.index = ((payload ?? {}) as { index?: number }).index ?? 0;
  }

  update(): void {
    const inp = this.game.input;
    const party = this.game.save.party;
    if (inp.pressed('b')) { audio.sfx('cancel'); this.game.pop(); return; }
    if (inp.repeat('left')) { this.page = (this.page + 2) % 3; audio.sfx('cursor'); }
    if (inp.repeat('right')) { this.page = (this.page + 1) % 3; audio.sfx('cursor'); }
    if (inp.repeat('up')) { this.index = (this.index - 1 + party.length) % party.length; audio.sfx('cursor'); }
    if (inp.repeat('down')) { this.index = (this.index + 1) % party.length; audio.sfx('cursor'); }
  }

  render(g: CanvasRenderingContext2D): void {
    const a = this.game.save.party[this.index];
    g.fillStyle = '#204878';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (!a) return;
    const sp = species(a.speciesKey);

    drawPanel(g, 2, 2, 92, 156, '#e8ecf4', '#404868');
    const sheet = this.game.creatureSheet(a.speciesKey);
    if (sheet) sheet.drawFrame(g, 'idle', 0, 48, 84, { scale: 0.9 });
    font.draw(g, displayName(a).slice(0, 11), 8, 8, 'normal', false);
    font.draw(g, `:L${a.level}`, 8, 20, 'normal', false);
    font.draw(g, `No.${String(sp.id).padStart(3, '0')}`, 8, 92, 'normal', false);
    font.draw(g, sp.name, 8, 104, 'normal', false);
    let tx = 8;
    for (const t of sp.types) {
      const td = typeDef(t);
      g.fillStyle = td.color;
      g.fillRect(tx, 118, 38, 11);
      g.fillStyle = td.dark;
      g.fillRect(tx, 127, 38, 2);
      font.drawCentered(g, td.name.toUpperCase().slice(0, 6), tx + 19, 120, 'white');
      tx += 42;
    }

    drawPanel(g, 98, 2, 140, 156, '#f4f4f8', '#404868');
    const titles = ['INFO', 'STATS', 'MOVES'];
    font.draw(g, titles[this.page]!, 106, 8, 'normal', false);
    font.drawRight(g, '\u25c0 \u25b6', 232, 8, 'dim', false);

    if (this.page === 0) {
      const lines = font.wrap(sp.dexEntry, 124);
      for (const [i, l] of lines.slice(0, 5).entries()) font.draw(g, l, 104, 24 + i * 11, 'normal', false);
      font.draw(g, `OT  ${a.otName}`, 104, 88, 'normal', false);
      font.draw(g, `ID  ${String(a.otId).padStart(5, '0')}`, 104, 100, 'normal', false);
      font.draw(g, `MET ${a.metMap}`, 104, 112, 'normal', false);
      font.draw(g, `at Lv. ${a.metLevel}`, 104, 124, 'normal', false);
      const { have, need } = expToNextLevel(a);
      font.draw(g, `NEXT ${Math.max(0, need - have)}`, 104, 136, 'normal', false);
      drawExpBar(g, 104, 148, 126, need > 0 ? have / need : 1);
    } else if (this.page === 1) {
      const s = stats(a);
      const rows: [string, number][] = [
        ['HP', maxHp(a)], ['ATTACK', s.atk], ['DEFENSE', s.def],
        ['SP.ATK', s.spa], ['SP.DEF', s.spd], ['SPEED', s.spe],
      ];
      rows.forEach(([label, value], i) => {
        const y = 26 + i * 20;
        font.draw(g, label, 104, y, 'normal', false);
        font.drawRight(g, String(value), 232, y, 'normal', false);
        const ratio = Math.min(1, value / 200);
        const [light, dark] = hpColors(0.6);
        drawPanel(g, 104, y + 10, 128, 5, '#c8ccd8', '#606880');
        g.fillStyle = light;
        g.fillRect(105, y + 11, Math.round(126 * ratio), 3);
        g.fillStyle = dark;
        g.fillRect(105, y + 13, Math.round(126 * ratio), 1);
      });
    } else {
      a.moves.forEach((slot, i) => {
        const md = moveDef(slot.key);
        const y = 24 + i * 32;
        const td = typeDef(md.type);
        g.fillStyle = td.color;
        g.fillRect(104, y, 40, 11);
        font.drawCentered(g, td.name.toUpperCase().slice(0, 6), 124, y + 2, 'white');
        font.draw(g, md.name, 148, y, 'normal', false);
        font.draw(g, `PP ${slot.pp}/${slot.maxPp}`, 104, y + 14, 'normal', false);
        font.drawRight(g, md.power > 0 ? `PWR ${md.power}` : 'STATUS', 232, y + 14, 'normal', false);
      });
    }
  }
}

// =========================================================================== //
// Bag
// =========================================================================== //
export class BagScene extends Scene {
  private mode: 'overworld' | 'battle' = 'overworld';
  private catIndex = 0;
  private tick = 0;
  private menu = new Menu([], 1, 6);
  private message = '';
  private messageTimer = 0;
  private pendingTarget: string | null = null;

  override enter(payload?: unknown): void {
    this.mode = ((payload ?? {}) as { mode?: 'overworld' | 'battle' }).mode ?? 'overworld';
    this.rebuild();
  }

  override resume(result?: unknown): void {
    this.game.input.clear();
    const r = result as { index?: number } | undefined;
    if (this.pendingTarget && r?.index !== undefined) {
      this.applyFieldItem(this.pendingTarget, r.index);
    }
    this.pendingTarget = null;
    this.rebuild();
  }

  private get category(): ItemCategory {
    return CATEGORY_ORDER[this.catIndex]!;
  }

  private rebuild(): void {
    const items = this.game.save.bag
      .filter((b) => itemDef(b.key).category === this.category)
      .map<MenuItem>((b) => ({
        label: itemDef(b.key).name,
        value: b.key,
        detail: `x${b.count}`,
      }));
    items.push({ label: 'CLOSE', value: 'close' });
    this.menu.setItems(items);
    this.menu.index = Math.min(this.menu.index, items.length - 1);
  }

  update(): void {
    this.tick++;
    if (this.messageTimer > 0) this.messageTimer--;
    const inp = this.game.input;
    if (inp.repeat('up') && this.menu.move(0, -1)) audio.sfx('cursor');
    if (inp.repeat('down') && this.menu.move(0, 1)) audio.sfx('cursor');
    if (inp.repeat('left')) { this.catIndex = (this.catIndex + CATEGORY_ORDER.length - 1) % CATEGORY_ORDER.length; this.menu.index = 0; this.rebuild(); audio.sfx('cursor'); }
    if (inp.repeat('right')) { this.catIndex = (this.catIndex + 1) % CATEGORY_ORDER.length; this.menu.index = 0; this.rebuild(); audio.sfx('cursor'); }
    if (inp.pressed('b')) { audio.sfx('cancel'); this.game.pop(undefined); return; }
    if (!inp.pressed('a')) return;

    const cur = this.menu.current;
    if (!cur || cur.value === 'close') { audio.sfx('cancel'); this.game.pop(undefined); return; }
    const def = itemDef(cur.value);
    audio.sfx('select');

    if (this.mode === 'battle') {
      if (!def.battle) { this.flash('That cannot be used in battle!'); return; }
      this.game.pop({ key: cur.value });
      return;
    }

    if (!def.field) { this.flash(`The ${def.name} cannot be used here.`); return; }
    if (def.heal !== undefined || def.revive !== undefined || def.cures || def.pp !== undefined) {
      this.pendingTarget = cur.value;
      void this.game.scenes.push(new PartyScene(), { mode: 'useItem', itemKey: cur.value });
      return;
    }
    if (def.repel) {
      bagRemove(this.game.save, cur.value, 1);
      this.game.save.repelSteps = def.repel;
      audio.sfx('item');
      this.flash(`${def.name} activated. Weak wild agents will stay away.`);
      this.rebuild();
      return;
    }
    this.flash(`The ${def.name} has no use right now.`);
  }

  private applyFieldItem(key: string, targetIndex: number): void {
    const def = itemDef(key);
    const agent = this.game.save.party[targetIndex];
    if (!agent) return;
    let used = false;

    if (def.revive !== undefined && isFainted(agent)) {
      agent.hp = Math.max(1, Math.floor(maxHp(agent) * def.revive));
      agent.status = 'none';
      used = true;
    } else if (def.heal !== undefined && !isFainted(agent) && agent.hp < maxHp(agent)) {
      agent.hp = def.heal < 0 ? maxHp(agent) : Math.min(maxHp(agent), agent.hp + def.heal);
      used = true;
    }
    if (def.cures && agent.status !== 'none') {
      if (def.cures.includes('any') || def.cures.includes(agent.status)) {
        agent.status = 'none';
        agent.sleepTurns = 0;
        used = true;
      }
    }
    if (def.pp !== undefined) {
      for (const slot of agent.moves) {
        if (slot.pp >= slot.maxPp) continue;
        slot.pp = def.pp < 0 ? slot.maxPp : Math.min(slot.maxPp, slot.pp + def.pp);
        used = true;
      }
    }
    if (key === 'rare_chip') {
      agent.level = Math.min(100, agent.level + 1);
      healFully(agent);
      used = true;
    }

    if (used) {
      bagRemove(this.game.save, key, 1);
      audio.sfx('heal');
      this.flash(`Used the ${def.name} on ${displayName(agent)}.`);
    } else {
      this.flash('It would have no effect.');
    }
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 110;
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#385088';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = '#2c4070';
    for (let y = 0; y < SCREEN_H; y += 8) g.fillRect(0, y, SCREEN_W, 3);

    // Pocket tabs.
    for (let i = 0; i < CATEGORY_ORDER.length; i++) {
      const cat = CATEGORY_ORDER[i]!;
      const x = 6 + i * 46;
      const active = i === this.catIndex;
      drawPanel(g, x, 4, 44, 14, active ? '#f8f0d0' : '#b0b8c8', '#404868');
      font.drawCentered(g, CATEGORY_NAME[cat].toUpperCase().slice(0, 7), x + 22, 7, 'normal', false);
    }

    drawWindow(g, 4, 22, 152, 84);
    this.menu.draw(g, 20, 30, 13, 132);

    // Item art / description.
    drawWindow(g, 160, 22, 76, 84);
    const cur = this.menu.current;
    if (cur && cur.value !== 'close') {
      const def = itemDef(cur.value);
      this.drawItemIcon(g, def.category, 198, 46);
      font.drawCentered(g, `\u00a5${formatMoney(def.price)}`, 198, 84, 'normal', false);
    }

    drawWindow(g, 2, TEXTBOX_Y, SCREEN_W - 4, TEXTBOX_H);
    const text = this.messageTimer > 0
      ? this.message
      : cur && cur.value !== 'close' ? itemDef(cur.value).desc : 'Close the BAG.';
    for (const [i, line] of font.wrap(text, 216).slice(0, 3).entries()) {
      font.draw(g, line, 12, TEXTBOX_Y + 8 + i * 12, 'normal', false);
    }
  }

  private drawItemIcon(g: CanvasRenderingContext2D, cat: ItemCategory, cx: number, cy: number): void {
    // CORES show the actual capture core the player throws, at 2x.
    if (cat === 'ball') {
      g.save();
      g.translate(cx, cy);
      g.scale(2, 2);
      drawCaptureCore(g, 0, 0, -1, this.tick);
      g.restore();
      return;
    }
    const colors: Record<ItemCategory, [string, string, string]> = {
      ball: ['#7c94c4', '#28344c', '#40e0f0'],
      medicine: ['#58c060', '#f8f8f8', '#f8f8f8'],
      battle: ['#f0a828', '#f8e0a0', '#f8f8f8'],
      key: ['#a878d8', '#e0d0f8', '#f8f8f8'],
      misc: ['#58a0d8', '#d0e8f8', '#f8f8f8'],
    };
    const [a, b, lens] = colors[cat];
    g.fillStyle = '#101828';
    g.fillRect(cx - 13, cy - 13, 26, 26);
    g.fillStyle = a;
    g.fillRect(cx - 12, cy - 12, 24, 12);
    g.fillStyle = b;
    g.fillRect(cx - 12, cy, 24, 12);
    g.fillStyle = '#101828';
    g.fillRect(cx - 12, cy - 1, 24, 2);
    g.fillStyle = lens;
    g.fillRect(cx - 4, cy - 4, 8, 8);
    g.fillStyle = '#101828';
    g.fillRect(cx - 2, cy - 2, 4, 4);
  }
}

// =========================================================================== //
// AGÉNTDEX
// =========================================================================== //
export class DexScene extends Scene {
  private menu = new Menu([], 1, 8);
  private detail = false;

  override enter(): void {
    const list = allSpecies().map<MenuItem>((s) => {
      const seen = this.game.save.dex.seen.includes(s.key);
      const caught = this.game.save.dex.caught.includes(s.key);
      return {
        label: `${String(s.id).padStart(3, '0')} ${seen ? s.name : '----------'}`,
        value: s.key,
        detail: caught ? '\u25cf' : seen ? '\u25cb' : '',
        variant: seen ? 'normal' : 'dim',
      };
    });
    this.menu.setItems(list);
  }

  update(): void {
    const inp = this.game.input;
    if (inp.pressed('b')) {
      if (this.detail) { this.detail = false; audio.sfx('cancel'); return; }
      audio.sfx('cancel');
      this.game.pop();
      return;
    }
    if (inp.repeat('up') && this.menu.move(0, -1)) audio.sfx('cursor');
    if (inp.repeat('down') && this.menu.move(0, 1)) audio.sfx('cursor');
    if (inp.pressed('a')) {
      const key = this.menu.current?.value;
      if (key && this.game.save.dex.seen.includes(key)) { this.detail = true; audio.sfx('select'); }
      else audio.sfx('error');
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#902020';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = '#701818';
    for (let y = 0; y < SCREEN_H; y += 6) g.fillRect(0, y, SCREEN_W, 2);

    if (this.detail) { this.renderDetail(g); return; }

    drawWindow(g, 4, 4, 148, 152);
    this.menu.draw(g, 20, 12, 18, 128);

    drawWindow(g, 156, 4, 80, 152);
    const key = this.menu.current?.value;
    const seen = key ? this.game.save.dex.seen.includes(key) : false;
    if (key && seen) {
      const sheet = this.game.creatureSheet(key);
      if (sheet) sheet.drawFrame(g, 'idle', 0, 196, 96, { scale: 0.85 });
      font.drawCentered(g, species(key).name, 196, 104, 'normal', false);
      font.drawCentered(g, species(key).genus, 196, 116, 'dim', false);
    } else {
      font.drawCentered(g, '???', 196, 80, 'dim', false);
    }
    font.drawCentered(g, `SEEN ${this.game.save.dex.seen.length}`, 196, 130, 'normal', false);
    font.drawCentered(g, `OWN  ${this.game.save.dex.caught.length}/${dexSize()}`, 196, 142, 'normal', false);
  }

  private renderDetail(g: CanvasRenderingContext2D): void {
    const key = this.menu.current!.value;
    const sp = species(key);
    drawWindow(g, 4, 4, SCREEN_W - 8, SCREEN_H - 8);
    const sheet = this.game.creatureSheet(key);
    if (sheet) sheet.drawFrame(g, 'idle', 0, 56, 96, { scale: 0.95 });
    font.draw(g, `No.${String(sp.id).padStart(3, '0')}  ${sp.name}`, 100, 14, 'normal', false);
    font.draw(g, sp.genus, 100, 26, 'dim', false);
    let tx = 100;
    for (const t of sp.types) {
      const td = typeDef(t);
      g.fillStyle = td.color;
      g.fillRect(tx, 38, 40, 11);
      font.drawCentered(g, td.name.toUpperCase().slice(0, 6), tx + 20, 40, 'white');
      tx += 44;
    }
    font.draw(g, `HT ${sp.height.toFixed(1)} m`, 100, 56, 'normal', false);
    font.draw(g, `WT ${sp.weight.toFixed(1)} kg`, 100, 68, 'normal', false);
    const lines = font.wrap(sp.dexEntry, 216);
    for (const [i, l] of lines.slice(0, 4).entries()) font.draw(g, l, 14, 110 + i * 11, 'normal', false);
  }
}

// =========================================================================== //
// Trainer card
// =========================================================================== //
export class TrainerCardScene extends Scene {
  private tick = 0;

  update(): void {
    this.tick++;
    if (this.game.input.pressed('b') || this.game.input.pressed('a')) {
      audio.sfx('cancel');
      this.game.pop();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const save = this.game.save;
    g.fillStyle = '#182848';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawPanel(g, 8, 8, SCREEN_W - 16, SCREEN_H - 16, '#f8b830', '#a06818');
    drawPanel(g, 14, 14, SCREEN_W - 28, SCREEN_H - 28, '#f8e8b8', '#c09828');

    font.draw(g, 'TRAINER CARD', 24, 22, 'normal', false);
    font.draw(g, `NAME   ${save.playerName}`, 24, 40, 'normal', false);
    font.draw(g, `IDNo.  ${String(save.trainerId).padStart(5, '0')}`, 24, 53, 'normal', false);
    font.draw(g, `MONEY  \u00a5${formatMoney(save.money)}`, 24, 66, 'normal', false);
    font.draw(g, `AGÉNTDEX  ${save.dex.caught.length}`, 24, 79, 'normal', false);
    font.draw(g, `TIME   ${formatPlaytime(save.playtimeFrames)}`, 24, 92, 'normal', false);

    const sheet = this.game.sheet(save.gender === 'm' ? 'ch:player_m' : 'ch:player_f');
    if (sheet) sheet.drawFrame(g, 'walk_down', 0, 198, 92, { scale: 2 });

    font.draw(g, 'BADGES', 24, 108, 'normal', false);
    const step = Math.floor((SCREEN_W - 60) / Math.max(1, BADGE_ORDER.length));
    for (let i = 0; i < BADGE_ORDER.length; i++) {
      const flagKey = BADGE_ORDER[i]!;
      const owned = save.badges.includes(flagKey);
      const x = 30 + step * i + Math.floor(step / 2);
      const y = 125;
      const info = BADGE_INFO[flagKey];
      g.fillStyle = owned ? '#f0d040' : '#b8b0a0';
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI / 3) * k - Math.PI / 2;
        const px = x + Math.cos(ang) * 9;
        const py = y + Math.sin(ang) * 9;
        if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = owned ? '#a07818' : '#807868';
      g.stroke();
      if (owned) {
        g.fillStyle = '#fff8d0';
        g.fillRect(x - 2, y - 4, 4, 8);
      }
      // First word only - full badge names do not fit under the hexagons.
      const label = (info?.name ?? '').split(' ')[0] ?? '';
      font.drawCentered(g, label, x, 138, owned ? 'normal' : 'dim', false);
    }
  }
}

// =========================================================================== //
// Save
// =========================================================================== //
export class SaveScene extends Scene {
  override transparent = true;
  private state: 'confirm' | 'saving' | 'done' | 'failed' = 'confirm';
  private pick = 0;
  private tw = new Typewriter();
  private tick = 0;

  override enter(): void {
    this.tw.speed = this.game.textDelay;
    this.tw.setText('Would you like to save the game?');
  }

  update(): void {
    this.tick++;
    this.tw.update();
    const inp = this.game.input;
    if (this.state === 'confirm') {
      if (inp.repeat('up') || inp.repeat('down')) { this.pick = 1 - this.pick; audio.sfx('cursor'); }
      if (inp.pressed('b')) { audio.sfx('cancel'); this.game.pop(); return; }
      if (inp.pressed('a')) {
        audio.sfx('select');
        if (this.pick === 1) { this.game.pop(); return; }
        this.state = 'saving';
        this.tw.setText('Saving...');
        void this.doSave();
      }
      return;
    }
    if (this.state === 'done' || this.state === 'failed') {
      if (inp.pressed('a') || inp.pressed('b')) { audio.sfx('cancel'); this.game.pop(); }
    }
  }

  private async doSave(): Promise<void> {
    const ok = await this.game.persist();
    audio.sfx(ok ? 'save' : 'error');
    if (ok) {
      this.state = 'done';
      this.tw.setText(saves.user
        ? `${this.game.save.playerName} saved the game to the cloud!`
        : `${this.game.save.playerName} saved the game to this device!`);
    } else {
      this.state = 'failed';
      this.tw.setText(`Cloud sync failed, but your progress was saved locally.`);
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const save = this.game.save;
    const summary = summarise(save);
    drawWindow(g, 4, 4, 120, 76);
    font.draw(g, 'PLAYER', 14, 12, 'normal', false);
    font.drawRight(g, save.playerName, 116, 12, 'normal', false);
    font.draw(g, 'BADGES', 14, 26, 'normal', false);
    font.drawRight(g, String(summary.badges), 116, 26, 'normal', false);
    font.draw(g, 'AGÉNTDEX', 14, 40, 'normal', false);
    font.drawRight(g, String(summary.dexCaught), 116, 40, 'normal', false);
    font.draw(g, 'TIME', 14, 54, 'normal', false);
    font.drawRight(g, formatPlaytime(save.playtimeFrames), 116, 54, 'normal', false);
    font.draw(g, saves.user ? 'CLOUD' : 'LOCAL', 14, 68, 'dim', false);
    font.drawRight(g, `FILE ${this.game.slot}`, 116, 68, 'dim', false);

    this.tw.draw(g, Math.floor(this.tick / 18) % 2 === 0);

    if (this.state === 'confirm') {
      const x = SCREEN_W - 60;
      const y = TEXTBOX_Y - 36;
      drawWindow(g, x, y, 56, 34);
      font.draw(g, 'YES', x + 18, y + 7, 'normal', false);
      font.draw(g, 'NO', x + 18, y + 19, 'normal', false);
      font.draw(g, '\u25b6', x + 8, y + 7 + this.pick * 12, 'normal', false);
    }
  }
}

// =========================================================================== //
// Options
// =========================================================================== //
export class OptionsScene extends Scene {
  private index = 0;
  private rows = ['TEXT SPEED', 'BATTLE STYLE', 'MUSIC', 'SOUND', 'SOUND OFF', 'FRAME', 'CANCEL'];

  update(): void {
    const inp = this.game.input;
    const o = this.game.save.options;
    if (inp.repeat('up')) { this.index = (this.index - 1 + this.rows.length) % this.rows.length; audio.sfx('cursor'); }
    if (inp.repeat('down')) { this.index = (this.index + 1) % this.rows.length; audio.sfx('cursor'); }
    const dir = inp.repeat('right') ? 1 : inp.repeat('left') ? -1 : 0;
    if (dir !== 0) {
      audio.sfx('cursor');
      switch (this.index) {
        case 0: o.textSpeed = Math.max(0, Math.min(2, o.textSpeed + dir)) as 0 | 1 | 2; break;
        case 1: o.battleStyle = o.battleStyle === 'shift' ? 'set' : 'shift'; break;
        case 2: o.musicVolume = Math.max(0, Math.min(1, +(o.musicVolume + dir * 0.1).toFixed(2))); break;
        case 3: o.sfxVolume = Math.max(0, Math.min(1, +(o.sfxVolume + dir * 0.1).toFixed(2))); break;
        case 4: o.muted = !o.muted; break;
        case 5: o.frame = (o.frame + dir + 3) % 3; break;
      }
      this.game.applyOptions();
    }
    if (inp.pressed('b') || (inp.pressed('a') && this.index === this.rows.length - 1)) {
      audio.sfx('cancel');
      this.game.pop();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#203858';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawWindow(g, 4, 4, SCREEN_W - 8, SCREEN_H - 8);
    const o = this.game.save.options;
    const values = [
      ['SLOW', 'MID', 'FAST'][o.textSpeed] ?? 'MID',
      o.battleStyle.toUpperCase(),
      `${Math.round(o.musicVolume * 100)}%`,
      `${Math.round(o.sfxVolume * 100)}%`,
      o.muted ? 'ON' : 'OFF',
      `TYPE ${o.frame + 1}`,
      '',
    ];
    for (let i = 0; i < this.rows.length; i++) {
      const y = 16 + i * 19;
      if (i === this.index) font.draw(g, '\u25b6', 14, y, 'normal', false);
      font.draw(g, this.rows[i]!, 26, y, 'normal', false);
      font.drawRight(g, values[i] ?? '', SCREEN_W - 18, y, i === this.index ? 'gold' : 'normal', false);
    }
    font.drawCentered(g, 'Adjust with \u25c0 \u25b6   B to close', SCREEN_W / 2, SCREEN_H - 20, 'dim');
  }
}

/** Re-exported so the shop can grant items without importing state directly. */
export { bagAdd };
export type { SaveData };
