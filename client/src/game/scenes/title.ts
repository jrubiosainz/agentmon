/** Title screen: logo, save-slot picker, account link and the new-game intro. */

import { assets } from '../../engine/assets.ts';
import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { drawWindow, fillScreen, Menu, PALETTE, type MenuItem } from '../../engine/ui.ts';
import type { SaveMeta } from '../../net/api.ts';
import { saves } from '../save.ts';
import { formatPlaytime, newSave } from '../state.ts';
import { openAuthOverlay } from '../ui/authoverlay.ts';
import { IntroScene } from './intro.ts';
import { OverworldScene } from './overworld.ts';

type Mode = 'splash' | 'main' | 'slots' | 'confirmNew';

export class TitleScene extends Scene {
  private mode: Mode = 'splash';
  private phase = 0;
  private menu = new Menu([]);
  private slotMenu = new Menu([]);
  private slots: SaveMeta[] = [];
  private busy = false;
  private notice = '';
  private noticeTimer = 0;
  private slotAction: 'load' | 'new' = 'load';

  override async enter(): Promise<void> {
    audio.playMusic('title');
    await this.refreshSlots();
    this.rebuildMenu();
  }

  private async refreshSlots(): Promise<void> {
    this.slots = await saves.list();
  }

  private rebuildMenu(): void {
    const items: MenuItem[] = [];
    if (this.slots.length) items.push({ label: 'CONTINUE', value: 'continue' });
    items.push({ label: 'NEW GAME', value: 'new' });
    items.push({
      label: saves.user ? `ACCOUNT: ${saves.user.displayName.toUpperCase()}` : 'LINK ACCOUNT',
      value: 'account',
    });
    this.menu.setItems(items);
  }

  private buildSlotMenu(): void {
    const items: MenuItem[] = [];
    for (const slot of [1, 2, 3]) {
      const meta = this.slots.find((s) => s.slot === slot);
      items.push({
        label: `FILE ${slot}`,
        value: String(slot),
        detail: meta ? `${meta.summary.playerName}` : 'NEW',
        disabled: this.slotAction === 'load' && !meta,
      });
    }
    items.push({ label: 'BACK', value: 'back' });
    this.slotMenu.setItems(items);
    this.slotMenu.index = 0;
  }

  private toast(text: string): void {
    this.notice = text;
    this.noticeTimer = 150;
  }

  update(): void {
    this.phase++;
    if (this.noticeTimer > 0) this.noticeTimer--;
    if (this.busy) return;
    const inp = this.game.input;

    if (this.mode === 'splash') {
      if (inp.anyPressed()) {
        audio.unlock();
        this.game.applyOptions();
        audio.playMusic('title', true);
        audio.sfx('select');
        this.mode = 'main';
      }
      return;
    }

    if (this.mode === 'main') {
      if (inp.repeat('up') && this.menu.move(0, -1)) audio.sfx('cursor');
      if (inp.repeat('down') && this.menu.move(0, 1)) audio.sfx('cursor');
      if (inp.pressed('a')) {
        audio.sfx('select');
        const value = this.menu.current?.value;
        if (value === 'continue') { this.slotAction = 'load'; this.buildSlotMenu(); this.mode = 'slots'; }
        else if (value === 'new') { this.slotAction = 'new'; this.buildSlotMenu(); this.mode = 'slots'; }
        else if (value === 'account') void this.doAccount();
      }
      return;
    }

    if (this.mode === 'slots') {
      if (inp.repeat('up') && this.slotMenu.move(0, -1)) audio.sfx('cursor');
      if (inp.repeat('down') && this.slotMenu.move(0, 1)) audio.sfx('cursor');
      if (inp.pressed('b')) { audio.sfx('cancel'); this.mode = 'main'; return; }
      if (inp.pressed('a')) {
        const item = this.slotMenu.current;
        if (!item) return;
        if (item.disabled) { audio.sfx('error'); return; }
        audio.sfx('select');
        if (item.value === 'back') { this.mode = 'main'; return; }
        const slot = Number(item.value);
        if (this.slotAction === 'load') void this.doLoad(slot);
        else void this.doNew(slot);
      }
    }
  }

  private async doAccount(): Promise<void> {
    this.busy = true;
    this.game.input.clear();
    if (saves.user) {
      await saves.logout();
      this.toast('Signed out. Saves stay on this device.');
    } else {
      const ok = await openAuthOverlay(saves.online ? 'login' : 'register');
      const who = saves.user as { displayName?: string } | null;
      if (ok) this.toast(`Linked as ${who?.displayName ?? ''}.`);
    }
    await this.refreshSlots();
    this.rebuildMenu();
    this.game.input.clear();
    this.busy = false;
  }

  private async doLoad(slot: number): Promise<void> {
    this.busy = true;
    const data = await saves.load(slot);
    if (!data) {
      this.toast('That file is empty.');
      this.busy = false;
      return;
    }
    this.game.slot = slot;
    this.game.save = data;
    this.game.applyOptions();
    await this.game.transitions.out('fade', 34);
    void this.game.scenes.replace(new OverworldScene());
    void this.game.transitions.in('fade', 34);
    this.busy = false;
  }

  private async doNew(slot: number): Promise<void> {
    this.busy = true;
    const existing = this.slots.find((s) => s.slot === slot);
    if (existing) await saves.remove(slot);
    this.game.slot = slot;
    this.game.save = newSave('AGENT', 'm', 'REX');
    this.game.applyOptions();
    await this.game.transitions.out('fade', 40);
    void this.game.scenes.replace(new IntroScene());
    this.busy = false;
  }

  // ------------------------------------------------------------------ render
  render(g: CanvasRenderingContext2D): void {
    const bg = assets.image('title_bg');
    if (bg) {
      g.drawImage(bg, 0, 0, SCREEN_W, SCREEN_H);
      fillScreen(g, '#08101f', 0.28);
    } else {
      this.proceduralSky(g);
    }

    this.logo(g, 26 + Math.sin(this.phase / 46) * 2);

    if (this.mode === 'splash') {
      if (Math.floor(this.phase / 30) % 2 === 0) {
        font.drawCentered(g, 'PRESS  START', SCREEN_W / 2, 116, 'white');
      }
      const net = saves.online ? 'NETWORK ONLINE' : 'OFFLINE MODE';
      const copy = '\u00a9 AG\u00c9NTMON PROJECT';
      const fw = Math.max(font.measure(net), font.measure(copy));
      g.fillStyle = 'rgba(16,18,32,0.72)';
      g.fillRect((SCREEN_W - fw) / 2 - 5, 141, fw + 10, 20);
      font.drawCentered(g, net, SCREEN_W / 2, 143, 'white');
      font.drawCentered(g, copy, SCREEN_W / 2, 152, 'white');
      return;
    }

    if (this.mode === 'main') {
      const h = 18 + this.menu.items.length * 14;
      drawWindow(g, 62, 92, 116, h);
      this.menu.draw(g, 78, 101, 14);
    } else {
      drawWindow(g, 34, 76, 172, 74);
      font.draw(g, this.slotAction === 'load' ? 'CONTINUE' : 'NEW GAME', 46, 84, 'gold', false);
      for (let i = 0; i < 3; i++) {
        const slot = i + 1;
        const meta = this.slots.find((s) => s.slot === slot);
        const y = 96 + i * 14;
        const selected = this.slotMenu.index === i;
        if (selected) font.draw(g, '\u25b6', 40, y, 'normal', false);
        const variant = !meta && this.slotAction === 'load' ? 'dim' : 'normal';
        font.draw(g, `FILE ${slot}`, 50, y, variant, false);
        if (meta) {
          font.draw(g, meta.summary.playerName.slice(0, 8), 96, y, variant, false);
          font.draw(g, `${meta.summary.badges}B`, 146, y, variant, false);
          font.drawRight(g, formatPlaytime(meta.playTimeSeconds * 60), 198, y, variant, false);
        } else {
          font.draw(g, '- EMPTY -', 96, y, 'dim', false);
        }
      }
      const backY = 96 + 3 * 14;
      if (this.slotMenu.index === 3) font.draw(g, '\u25b6', 40, backY, 'normal', false);
      font.draw(g, 'BACK', 50, backY, 'normal', false);
    }

    // The key art runs edge to edge, so the status line needs its own dark
    // strip or it dissolves into the sunset.
    const status = this.noticeTimer > 0
      ? this.notice
      : saves.user ? `CLOUD: ${saves.user.email}` : 'SAVES STORED ON THIS DEVICE';
    const sw = font.measure(status);
    g.fillStyle = 'rgba(16,18,32,0.72)';
    g.fillRect((SCREEN_W - sw) / 2 - 4, 147, sw + 8, 12);
    font.drawCentered(g, status, SCREEN_W / 2, 150, this.noticeTimer > 0 ? 'gold' : 'white');
  }

  private proceduralSky(g: CanvasRenderingContext2D): void {
    const grad = g.createLinearGradient(0, 0, 0, SCREEN_H);
    grad.addColorStop(0, '#101c3c');
    grad.addColorStop(0.55, '#2c4c8c');
    grad.addColorStop(1, '#6890c8');
    g.fillStyle = grad;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Star field + a skyline of server towers.
    for (let i = 0; i < 60; i++) {
      const x = (i * 61) % SCREEN_W;
      const y = (i * 37) % 80;
      const tw = (Math.sin(this.phase / 24 + i) + 1) / 2;
      g.fillStyle = `rgba(255,255,255,${0.15 + tw * 0.5})`;
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#101828';
    for (let i = 0; i < 12; i++) {
      const w = 12 + ((i * 29) % 16);
      const h = 24 + ((i * 53) % 44);
      const x = i * 21 - 6;
      g.fillRect(x, SCREEN_H - h, w, h);
      g.fillStyle = '#f0c840';
      for (let wy = SCREEN_H - h + 4; wy < SCREEN_H - 4; wy += 6) {
        for (let wx = x + 3; wx < x + w - 3; wx += 5) {
          if ((wx * 7 + wy * 13 + i) % 5 !== 0) continue;
          g.fillRect(wx, wy, 2, 2);
        }
      }
      g.fillStyle = '#101828';
    }
  }

  /** The wordmark, drawn as chunky pixel letters with a bevel. */
  private logo(g: CanvasRenderingContext2D, y: number): void {
    const text = 'AG\u00c9NTMON';
    const scale = 3;
    const w = font.measure(text) * scale;
    const x = Math.round((SCREEN_W - w) / 2);
    const yy = Math.round(y);

    g.save();
    g.imageSmoothingEnabled = false;
    // Shadow, then a two-tone body using scaled font blits.
    this.blitScaled(g, text, x + 2, yy + 3, scale, '#101828');
    this.blitScaled(g, text, x, yy, scale, PALETTE.gold);
    this.blitScaled(g, text, x, yy, scale, '#ffffff', 0.35);
    g.restore();

    font.drawCentered(g, 'A  ROBOT  MONSTER  ADVENTURE', SCREEN_W / 2, yy + 7 * scale + 8, 'white');
  }

  private blitScaled(
    g: CanvasRenderingContext2D, text: string, x: number, y: number,
    scale: number, color: string, alpha = 1,
  ): void {
    const w = font.measure(text) + 2;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = 9;
    const t = tmp.getContext('2d');
    if (!t) return;
    t.imageSmoothingEnabled = false;
    font.draw(t, text, 0, 0, 'white', false);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, w, 9);
    g.globalAlpha = alpha;
    g.drawImage(tmp, x, y, w * scale, 9 * scale);
    g.globalAlpha = 1;
  }
}
