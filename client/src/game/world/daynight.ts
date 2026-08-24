/**
 * Day/night cycle.
 *
 * Driven by the player's real clock, the way Gold/Silver and Diamond/Pearl did
 * it. The tint is a flat quantised wash rather than a smooth gradient: the
 * hardware swapped palettes at fixed times, so a continuously interpolated sky
 * is the wrong texture even though it is technically nicer.
 *
 * Only outdoor maps are tinted. Interiors already carry their own `tint` mood
 * and a datacenter does not care what time it is.
 *
 * Because a real clock means most players only ever see one phase, `?time=night`
 * (or morning/day/dusk) on the URL pins it. That is also how the harness
 * screenshots every phase deterministically.
 */

import { SCREEN_H, SCREEN_W } from '../../engine/screen.ts';

export type DayPhase = 'morning' | 'day' | 'dusk' | 'night';

export const DAY_PHASES: DayPhase[] = ['morning', 'day', 'dusk', 'night'];

/**
 * [colour, alpha, blend].
 *
 * Dusk and night MULTIPLY. An alpha wash toward a dark blue lifts the blacks
 * and desaturates everything, so night came out as a murky teal afternoon
 * rather than as night; multiplying scales each channel instead, which is
 * exactly what a hardware palette swap did - hue and contrast survive.
 *
 * Morning is the exception and stays a normal wash: it has to *brighten* the
 * scene warm, and multiply can only ever darken.
 *
 * Day is null - noon must be the untouched palette the art was drawn for.
 */
type Tint = [string, number, GlobalCompositeOperation];

const TINT: Record<DayPhase, Tint | null> = {
  morning: ['#ffc070', 0.125, 'source-over'],
  day: null,
  dusk: ['#ffb070', 1, 'multiply'],
  night: ['#6878c8', 1, 'multiply'],
};

let override: DayPhase | null = null;
let queryChecked = false;

function isPhase(v: string): v is DayPhase {
  return (DAY_PHASES as string[]).includes(v);
}

/** Pins the phase; pass null to hand control back to the clock. */
export function setDayPhase(p: DayPhase | null): void {
  override = p;
  queryChecked = true;
}

function fromQuery(): DayPhase | null {
  if (queryChecked) return override;
  queryChecked = true;
  if (typeof location === 'undefined') return null;
  try {
    const v = new URLSearchParams(location.search).get('time');
    if (v && isPhase(v)) override = v;
  } catch {
    /* malformed query strings must never stop the game booting */
  }
  return override;
}

export function dayPhase(now: Date = new Date()): DayPhase {
  const forced = fromQuery();
  if (forced) return forced;
  const h = now.getHours();
  if (h >= 20 || h < 6) return 'night';
  if (h < 10) return 'morning';
  if (h < 18) return 'day';
  return 'dusk';
}

export function dayTint(phase: DayPhase = dayPhase()): Tint | null {
  return TINT[phase];
}

/** Applies the phase wash. No-op at midday, so the common case costs nothing. */
export function drawDayTint(g: CanvasRenderingContext2D, phase: DayPhase = dayPhase()): void {
  const tint = TINT[phase];
  if (!tint) return;
  const [color, alpha, blend] = tint;
  g.save();
  g.globalCompositeOperation = blend;
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.restore();
}
