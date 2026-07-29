/** New-game intro: Prof. Ada's speech, gender pick and name entry. */

import { assets } from '../../engine/assets.ts';
import { audio } from '../../engine/audio.ts';
import { font } from '../../engine/font.ts';
import { Scene } from '../../engine/scene.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';
import { drawWindow, fillScreen, PALETTE, Typewriter } from '../../engine/ui.ts';
import { OverworldScene } from './overworld.ts';

const SPEECH = [
  'Hello there! Welcome to the world of AGENTMON!',
  'My name is ADA. People call me the AGENTMON PROFESSOR.',
  'This world is shared by machines we call AGENTMON.',
  'Some help us build. Some help us think. And some... simply want to battle.',
  'Studying them is my life\'s work. But research needs field data.',
  'That is where you come in.',
  'First, tell me a little about yourself.',
];

const OUTRO = [
  'Your very own AGENTMON story is about to unfold.',
  'A world of dreams and datacenters awaits!',
  'Let\'s go!',
];

const ROWS = [
  'ABCDEFGHIJ',
  'KLMNOPQRST',
  'UVWXYZ0123',
  '456789 -.',
];

type Phase = 'speech' | 'gender' | 'name' | 'outro';

export class IntroScene extends Scene {
  private phase: Phase = 'speech';
  private line = 0;
  private tw = new Typewriter();
  private tick = 0;
  private genderIndex = 0;
  private cursorX = 0;
  private cursorY = 0;
  private nameBuf = '';
  private namingRival = false;
  private busy = false;

  override async enter(): Promise<void> {
    audio.playMusic('intro');
    this.tw.speed = this.game.textDelay;
    this.tw.setText(SPEECH[0]!);
    await this.game.transitions.in('fade', 40);
  }

  update(): void {
    this.tick++;
    if (this.busy) return;
    const inp = this.game.input;

    switch (this.phase) {
      case 'speech':
      case 'outro': {
        this.tw.update();
        if (inp.pressed('a') || inp.pressed('start')) {
          if (this.tw.advance()) this.nextLine();
          else audio.sfx('cursor');
        }
        break;
      }
      case 'gender': {
        if ((inp.repeat('left') || inp.repeat('right'))) {
          this.genderIndex = 1 - this.genderIndex;
          audio.sfx('cursor');
        }
        if (inp.pressed('a')) {
          audio.sfx('select');
          this.game.save.gender = this.genderIndex === 0 ? 'm' : 'f';
          this.phase = 'name';
          this.namingRival = false;
          this.nameBuf = '';
        }
        break;
      }
      case 'name': {
        this.updateNameEntry();
        break;
      }
    }
  }

  private nextLine(): void {
    if (this.phase === 'speech') {
      this.line++;
      if (this.line >= SPEECH.length) {
        this.phase = 'gender';
        return;
      }
      this.tw.setText(SPEECH[this.line]!);
      return;
    }
    // outro
    this.line++;
    if (this.line >= OUTRO.length) {
      void this.finish();
      return;
    }
    this.tw.setText(OUTRO[this.line]!);
  }

  private async finish(): Promise<void> {
    this.busy = true;
    await this.game.transitions.out('fade', 40);
    audio.stopMusic();
    void this.game.scenes.replace(new OverworldScene());
    void this.game.transitions.in('fade', 40);
  }

  // ------------------------------------------------------------ name entry
  private updateNameEntry(): void {
    const inp = this.game.input;
    const maxLen = 8;

    if (inp.repeat('left')) { this.moveCursor(-1, 0); }
    if (inp.repeat('right')) { this.moveCursor(1, 0); }
    if (inp.repeat('up')) { this.moveCursor(0, -1); }
    if (inp.repeat('down')) { this.moveCursor(0, 1); }

    if (inp.pressed('a')) {
      const ch = ROWS[this.cursorY]?.[this.cursorX] ?? '';
      if (ch && this.nameBuf.length < maxLen) {
        this.nameBuf += ch;
        audio.sfx('cursor');
      } else {
        audio.sfx('error');
      }
    }
    if (inp.pressed('b')) {
      if (this.nameBuf.length > 0) {
        this.nameBuf = this.nameBuf.slice(0, -1);
        audio.sfx('cancel');
      }
    }
    if (inp.pressed('start') || inp.pressed('select')) this.commitName();
  }

  private moveCursor(dx: number, dy: number): void {
    if (dx) {
      const row = ROWS[this.cursorY]!;
      this.cursorX = (this.cursorX + dx + row.length) % row.length;
    }
    if (dy) {
      this.cursorY = (this.cursorY + dy + ROWS.length) % ROWS.length;
      this.cursorX = Math.min(this.cursorX, ROWS[this.cursorY]!.length - 1);
    }
    audio.sfx('cursor');
  }

  private commitName(): void {
    const trimmed = this.nameBuf.trim();
    if (!this.namingRival) {
      this.game.save.playerName = trimmed || (this.game.save.gender === 'm' ? 'KAI' : 'NOVA');
      audio.sfx('select');
      this.namingRival = true;
      this.nameBuf = '';
      this.cursorX = 0;
      this.cursorY = 0;
      return;
    }
    this.game.save.rivalName = trimmed || 'REX';
    audio.sfx('select');
    this.phase = 'outro';
    this.line = 0;
    this.tw.setText(
      `${this.game.save.playerName}! Your very own AGENTMON story is about to unfold.`,
    );
  }

  // ---------------------------------------------------------------- render
  render(g: CanvasRenderingContext2D): void {
    g.fillStyle = '#101828';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // Soft radial spotlight behind the professor.
    const grad = g.createRadialGradient(120, 62, 8, 120, 62, 110);
    grad.addColorStop(0, '#28407c');
    grad.addColorStop(1, '#101828');
    g.fillStyle = grad;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (this.phase === 'name') { this.renderNameEntry(g); return; }
    if (this.phase === 'gender') { this.renderGender(g); return; }

    this.drawProfessor(g, 120, 104);
    this.tw.draw(g, Math.floor(this.tick / 20) % 2 === 0);
  }

  private drawProfessor(g: CanvasRenderingContext2D, cx: number, baseY: number): void {
    const sheet = this.game.sheet('ch:professor');
    const bob = Math.sin(this.tick / 34) * 1.5;
    if (sheet) {
      sheet.drawFrame(g, 'walk_down', 0, cx, baseY + bob, { scale: 3 });
      return;
    }
    const img = assets.image('tr:trainer_gym1');
    if (img) {
      g.drawImage(img, cx - img.width / 2, baseY - img.height + bob);
      return;
    }
    font.drawCentered(g, 'PROF. ADA', cx, baseY - 20, 'white');
  }

  private renderGender(g: CanvasRenderingContext2D): void {
    font.drawCentered(g, 'Are you a boy? Or a girl?', SCREEN_W / 2, 22, 'white');
    const labels = ['BOY', 'GIRL'];
    for (let i = 0; i < 2; i++) {
      const x = 60 + i * 120;
      const selected = i === this.genderIndex;
      const sheet = this.game.sheet(i === 0 ? 'ch:player_m' : 'ch:player_f');
      if (selected) {
        g.fillStyle = 'rgba(240,200,64,0.18)';
        g.fillRect(x - 34, 34, 68, 84);
      }
      if (sheet) {
        sheet.drawFrame(g, 'walk_down', 0, x, 108, { scale: 3 });
      } else {
        g.fillStyle = i === 0 ? '#4878d8' : '#d85888';
        g.fillRect(x - 12, 66, 24, 40);
      }
      font.drawCentered(g, labels[i]!, x, 122, selected ? 'gold' : 'dim');
    }
    drawWindow(g, 2, 132, SCREEN_W - 4, 26);
    font.draw(g, 'Choose with \u25c0 \u25b6, confirm with A.', 12, 141, 'normal', false);
  }

  private renderNameEntry(g: CanvasRenderingContext2D): void {
    const who = this.namingRival ? 'YOUR RIVAL' : 'YOURSELF';
    font.drawCentered(g, `Give a name to ${who}.`, SCREEN_W / 2, 8, 'white');

    // Sprite preview.
    const sheet = this.namingRival
      ? this.game.sheet('ch:rival')
      : this.game.sheet(this.game.save.gender === 'm' ? 'ch:player_m' : 'ch:player_f');
    if (sheet) sheet.drawFrame(g, 'walk_down', 0, 32, 52, { scale: 2 });

    // Name field.
    drawWindow(g, 56, 20, 172, 28);
    const shown = this.nameBuf.padEnd(8, '_');
    for (let i = 0; i < 8; i++) {
      const ch = shown[i]!;
      const x = 68 + i * 19;
      font.draw(g, ch, x, 30, ch === '_' ? 'dim' : 'normal', false);
      g.fillStyle = i < this.nameBuf.length ? PALETTE.gold : PALETTE.shadow;
      g.fillRect(x - 1, 40, 12, 1);
    }

    // Keyboard.
    drawWindow(g, 20, 56, 200, 74);
    for (let r = 0; r < ROWS.length; r++) {
      const row = ROWS[r]!;
      for (let c = 0; c < row.length; c++) {
        const x = 34 + c * 18;
        const y = 66 + r * 15;
        const selected = r === this.cursorY && c === this.cursorX;
        if (selected) {
          g.fillStyle = 'rgba(240,200,64,0.85)';
          g.fillRect(x - 4, y - 3, 15, 13);
        }
        font.draw(g, row[c]!, x, y, selected ? 'shadow' : 'normal', false);
      }
    }

    fillScreen(g, '#000000', 0);
    font.drawCentered(g, 'A: ADD    B: DELETE    START: OK', SCREEN_W / 2, 138, 'dim');
    font.drawCentered(g, 'Leave blank for the default name.', SCREEN_W / 2, 150, 'dim');
  }
}
