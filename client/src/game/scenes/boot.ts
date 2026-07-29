/** Boot: loads the dex + every asset, then hands over to the title screen. */

import { assets } from '../../engine/assets.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { drawPanel, PALETTE } from '../../engine/ui.ts';
import { allSpecies, setDex } from '../data/dex.ts';
import {
  BACKDROP_KEYS, BUILDING_KEYS, CHARACTER_KEYS, TRAINER_KEYS,
} from '../data/artkeys.ts';
import { registerAllTracks } from '../data/music.ts';
import { saves } from '../save.ts';
import { TitleScene } from './title.ts';

export { BACKDROP_KEYS, BUILDING_KEYS, CHARACTER_KEYS, TRAINER_KEYS };

export class BootScene extends Scene {
  private done = 0;
  private total = 1;
  private status = 'BOOTING';
  private error: string | null = null;
  private started = false;
  private phase = 0;

  override async enter(): Promise<void> {
    registerAllTracks();
    try {
      await this.run();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async run(): Promise<void> {
    this.status = 'LOADING AGÉNTDEX';
    const res = await fetch(`${assets.base}agentdex.json`);
    if (!res.ok) throw new Error(`agentdex.json ${res.status}`);
    setDex(await res.json());

    this.status = 'CHECKING LINK';
    await saves.init();

    this.status = 'LOADING ASSETS';
    // Creature battle sheets + icons.
    for (const s of allSpecies()) {
      assets.queueSheet(`cr:${s.key}`, `assets/creatures/${s.key}`, true);
      assets.queueSheet(`cr:${s.key}:back`, `assets/creatures/${s.key}_back`, true);
    }
    assets.queueSheet('icons', 'assets/atlas/creature_icons', true);
    for (const k of CHARACTER_KEYS) assets.queueSheet(`ch:${k}`, `assets/chars/${k}`, true);
    for (const k of TRAINER_KEYS) assets.queueImage(`tr:${k}`, `assets/trainers/${k}.png`, true);
    for (const k of BUILDING_KEYS) assets.queueImage(`bld:${k}`, `assets/world/${k}.png`, true);
    for (const k of BACKDROP_KEYS) assets.queueImage(`bg:${k}`, `assets/battle/${k}.png`, true);
    assets.queueImage('title_bg', 'assets/ui/title_bg.png', true);

    this.total = Math.max(1, assets.pending);
    await assets.loadAll((done, total) => {
      this.done = done;
      this.total = total;
    });

    // Warm the procedural tileset while the loading bar is still up.
    this.status = 'BUILDING WORLD';
    void this.game.tiles;
    this.status = 'READY';
    this.started = true;
  }

  update(): void {
    this.phase++;
    if (this.started) {
      this.started = false;
      void this.game.scenes.replace(new TitleScene());
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#080c18';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // Scanline shimmer so the boot screen feels like hardware powering on.
    g.fillStyle = 'rgba(72,120,168,0.10)';
    for (let y = (this.phase / 2) % 4; y < SCREEN_H; y += 4) g.fillRect(0, y, SCREEN_W, 1);

    font.drawCentered(g, 'AG\u00c9NTMON', SCREEN_W / 2, 52, 'gold');
    font.drawCentered(g, 'SYSTEM BOOT', SCREEN_W / 2, 66, 'dim');

    if (this.error) {
      font.drawCentered(g, 'BOOT FAILURE', SCREEN_W / 2, 96, 'red');
      for (const [i, line] of font.wrap(this.error, 200).slice(0, 3).entries()) {
        font.drawCentered(g, line, SCREEN_W / 2, 110 + i * 10, 'dim');
      }
      return;
    }

    const bw = 160;
    const bx = (SCREEN_W - bw) / 2;
    drawPanel(g, bx - 2, 96, bw + 4, 10, PALETTE.dark, PALETTE.shadow);
    const ratio = this.total ? this.done / this.total : 0;
    g.fillStyle = PALETTE.expBlue;
    g.fillRect(bx, 98, Math.round(bw * ratio), 6);
    g.fillStyle = PALETTE.expBlueDark;
    g.fillRect(bx, 102, Math.round(bw * ratio), 2);

    font.drawCentered(g, this.status, SCREEN_W / 2, 114, 'white');
    font.drawCentered(g, `${Math.round(ratio * 100)}%`, SCREEN_W / 2, 128, 'dim');
  }
}
