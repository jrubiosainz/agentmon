/**
 * Trainer VS intro.
 *
 * The Emerald/HGSS beat that plays between "a trainer spotted you" and the
 * battle transition: panels slam across the screen, the opponent's portrait
 * slides in, a VS badge punches in with a flash, and a name plate rises.
 *
 * Three decisions worth keeping:
 *
 * 1. **It is an overlay owned by `OverworldScene`, not a pushed scene.** A scene
 *    would have to interleave with `transitions.out/cover/in`, and this project
 *    has already paid for that mistake once: the black-screen-on-battle bug came
 *    from a curtain nobody lifted. The overlay never touches the curtain.
 *
 * 2. **It drives itself off `requestAnimationFrame`, not `update()`.** If
 *    `update()` throws, `Loop` keeps rendering (by design) - but a counter
 *    ticked from `update()` would freeze and the awaiting caller would hang
 *    forever behind a permanent VS screen. A self-driven counter plus a
 *    wall-clock deadline cannot hang.
 *
 * 3. **Opponent only, exactly like the real games.** The player has no battle
 *    portrait, only an overworld walk sheet, and pairing a 2x-upscaled 16px
 *    sprite against a native-resolution portrait is the classic amateur tell.
 *
 * No new i18n keys: trainer names are never translated and VS is a hand-authored
 * glyph, not text.
 */

import { assets } from '../../engine/assets.ts';
import { font } from '../../engine/font.ts';
import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';

/** Total length of the sequence. ~1.5s at 60fps - long enough to read, short
 *  enough that it never outstays its welcome on the tenth trainer. */
const TOTAL = 92;

const SLAM_END = 14;
const PORTRAIT_IN = 34;
const BADGE_AT = 36;
const PLATE_AT = 46;

/**
 * The VS glyph, hand-authored rather than taken from the font: it needs the
 * chunky diagonal cut of an arcade versus badge, and the 6px UI font is built
 * for dialogue. 15x13.
 */
const VS_GLYPH = [
  '##...##..#####.',
  '##...##.##...##',
  '##...##.##.....',
  '##...##.##.....',
  '.##.##...#####.',
  '.##.##.......##',
  '.##.##.......##',
  '..###...##...##',
  '..###....#####.',
];

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class VsIntro {
  frame = 0;

  private readonly img: HTMLImageElement | null;

  constructor(readonly name: string, sprite: string | undefined) {
    this.img = sprite ? assets.image(`tr:${sprite}`) : null;
  }

  get done(): boolean {
    return this.frame >= TOTAL;
  }

  advance(): void {
    this.frame++;
  }

  draw(g: CanvasRenderingContext2D): void {
    const f = this.frame;

    // -- 1. panels ------------------------------------------------------- //
    // Two diagonal wedges meeting at the centre. Drawn as paths rather than
    // rects so the seam is a real diagonal instead of a stair-stepped rect
    // edge, which at 240x160 would read as a rendering artefact.
    const slam = easeOut(clamp01(f / SLAM_END));
    const skew = 26;
    // Overshoot the screen by the skew on both sides, or the diagonal leaves a
    // triangle of live map uncovered in the top-right corner.
    const w = Math.round((SCREEN_W + skew * 2) * slam);

    g.save();
    g.fillStyle = '#101828';
    g.beginPath();
    g.moveTo(-skew, 0);
    g.lineTo(-skew + w, 0);
    g.lineTo(-skew + w + skew, SCREEN_H);
    g.lineTo(-skew + skew, SCREEN_H);
    g.closePath();
    g.fill();

    // A second, lighter wedge running the other way gives the plate depth and
    // stops the screen reading as a flat black rectangle. It keeps the plain
    // screen width so its diagonals stay on screen - overshooting it too would
    // push both cuts off-frame and leave a flat horizontal bar.
    const wb = Math.round(SCREEN_W * slam);
    g.fillStyle = '#283c64';
    g.beginPath();
    g.moveTo(SCREEN_W + skew, 40);
    g.lineTo(SCREEN_W + skew - wb, 40);
    g.lineTo(SCREEN_W - wb, 92);
    g.lineTo(SCREEN_W, 92);
    g.closePath();
    g.fill();

    if (slam < 1) {
      g.restore();
      return;
    }

    // -- 2. speed lines -------------------------------------------------- //
    // Scrolling 2px bars. Motion behind a static portrait is what sells the
    // shot; without them the panel is a poster.
    g.globalAlpha = 0.22;
    g.fillStyle = '#78a8f0';
    for (let i = 0; i < 9; i++) {
      const y = 12 + i * 17;
      const x = ((f * 5 + i * 53) % (SCREEN_W + 90)) - 90;
      g.fillRect(Math.round(x), y, 54, 2);
    }
    g.globalAlpha = 1;

    // -- 3. portrait ----------------------------------------------------- //
    const pt = clamp01((f - SLAM_END) / (PORTRAIT_IN - SLAM_END));
    if (pt > 0) {
      // Overshoot then settle: a portrait that decelerates onto its mark has
      // weight, one that lerps linearly slides like a menu.
      const over = easeOut(pt);
      const x = SCREEN_W + 46 - over * 112 + (1 - pt) * -10;
      const baseY = 108;
      if (this.img) {
        g.drawImage(this.img, Math.round(x - this.img.width / 2), baseY - this.img.height);
      } else {
        g.fillStyle = '#404868';
        g.fillRect(Math.round(x) - 20, baseY - 58, 40, 58);
      }
    }

    // -- 4. VS badge ----------------------------------------------------- //
    if (f >= BADGE_AT) {
      const bt = clamp01((f - BADGE_AT) / 10);
      // Scales 4x -> 1x. Quantised to whole pixels so every intermediate frame
      // is still a legal pixel-art frame rather than a resampled blur.
      const scale = Math.max(2, Math.round(4 - easeOut(bt) * 2));
      const gw = VS_GLYPH[0]!.length * scale;
      const gh = VS_GLYPH.length * scale;
      const cx = 66 - gw / 2;
      const cy = 62 - gh / 2;

      // Impact flash on the frame it lands.
      if (f >= BADGE_AT + 9 && f <= BADGE_AT + 11) {
        g.globalAlpha = 0.55;
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, SCREEN_W, SCREEN_H);
        g.globalAlpha = 1;
      }

      for (let row = 0; row < VS_GLYPH.length; row++) {
        const line = VS_GLYPH[row]!;
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== '#') continue;
          const x = Math.round(cx + col * scale);
          const y = Math.round(cy + row * scale);
          g.fillStyle = '#101828';
          g.fillRect(x + scale, y + scale, scale, scale);
          g.fillStyle = '#ffd038';
          g.fillRect(x, y, scale, scale);
        }
      }
    }

    // -- 5. name plate --------------------------------------------------- //
    if (f >= PLATE_AT) {
      const nt = easeOut(clamp01((f - PLATE_AT) / 9));
      const label = this.name.toUpperCase();
      const tw = font.measure(label);
      const pw = tw + 20;
      const px = Math.min(SCREEN_W - pw - 6, Math.max(6, SCREEN_W - 60 - pw / 2));
      const py = Math.round(116 + (1 - nt) * 14);

      g.globalAlpha = nt;
      g.fillStyle = '#182440';
      g.fillRect(px, py, pw, 16);
      g.fillStyle = '#ffd038';
      g.fillRect(px, py, pw, 2);
      g.fillRect(px, py + 14, pw, 2);
      font.drawCentered(g, label, px + pw / 2, py + 5, 'white', false);
      g.globalAlpha = 1;
    }

    g.restore();
  }
}

/**
 * Runs the overlay to completion. `tick` is called once per animation frame so
 * the caller can draw it; the wall-clock deadline is the guarantee that a
 * throttled or backgrounded tab can never strand the awaiting battle.
 */
export function runVsIntro(vs: VsIntro): Promise<void> {
  return new Promise<void>((resolve) => {
    const deadline = Date.now() + 4000;
    const step = (): void => {
      vs.advance();
      if (vs.done || Date.now() > deadline) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
