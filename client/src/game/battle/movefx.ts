// Per-move battle visuals.
//
// Every move in the dex resolves to a `MoveFxSpec`: an explicit entry when the
// move deserves a signature look, otherwise a default derived from its type and
// category. `resolveMoveFx` is therefore total - a move can never end up with no
// effect, which is what `movefx` tests assert.
//
// Colours come from the move's TYPE, not the user's, so a VOLT move always reads
// as VOLT no matter who fires it.

import { drawBeam, drawShockRing, drawSlash, boltPath, strokePath, darken, lighten, ParticleField } from '../../engine/fx.ts';
import { typeDef, type MoveDef, type TypeKey } from '../data/dex.ts';

export const FX_KINDS = [
  'strike',
  'slash',
  'crush',
  'barrage',
  'beam',
  'bolt',
  'orb',
  'burst',
  'shards',
  'spiral',
  'motes',
  'drain',
  'wave',
  'buff',
  'debuff',
  'heal',
  'guard',
] as const;

export type FxKind = (typeof FX_KINDS)[number];

export interface MoveFxSpec {
  kind: FxKind;
  color: string;
  core: string;
  dark: string;
  /** 0..1. Drives particle counts, radii, shake and duration. */
  intensity: number;
  /** Where the effect resolves. Status self-buffs play on the user. */
  target: 'foe' | 'self';
  hits: number;
  shake: number;
  /** Full-screen wash strength, 0..1. Reserved for the heaviest moves. */
  tint: number;
  /** How far the attacker lunges, in pixels. 0 for ranged moves. */
  lunge: number;
}

/** Signature looks. Anything not listed falls back to the type/category default. */
export const MOVE_FX_OVERRIDE: Record<string, FxKind> = {
  // --- servo / physical contact
  tackle: 'strike',
  scratch: 'slash',
  slam: 'crush',
  quick_jab: 'strike',
  pounce: 'strike',
  spin_kick: 'slash',
  pile_drive: 'crush',
  hyper_drive: 'crush',
  soft_grip: 'strike',
  gear_grind: 'slash',
  // --- alloy
  bolt_toss: 'strike',
  plate_press: 'crush',
  grapple_arm: 'strike',
  girder_smash: 'crush',
  rivet_barrage: 'barrage',
  // --- data
  many_hands: 'barrage',
  data_spike: 'orb',
  stack_trace: 'orb',
  recursion: 'wave',
  pixel_grin: 'orb',
  null_ptr: 'orb',
  kernel_panic: 'burst',
  // --- optic
  laser_ping: 'beam',
  photon_beam: 'beam',
  prism_lance: 'beam',
  visor_beam: 'beam',
  dazzle_stripe: 'beam',
  solar_charge: 'beam',
  // --- volt
  spark: 'bolt',
  arc_bolt: 'bolt',
  thunder_core: 'bolt',
  volt_bite: 'strike',
  // --- thermal
  heat_vent: 'burst',
  jack_flare: 'burst',
  solder_burst: 'burst',
  meltdown: 'burst',
  plasma_cutter: 'slash',
  // --- cryo
  coolant_spray: 'shards',
  frost_lock: 'shards',
  absolute_zero: 'shards',
  // --- viral
  bug_bite: 'strike',
  payload: 'motes',
  rootkit: 'motes',
  leech_cycle: 'drain',
  // --- neural
  logic_bomb: 'orb',
  mind_link: 'wave',
  neural_storm: 'spiral',
  hypnotize: 'wave',
  // --- quantum
  qubit_flip: 'orb',
  decoherence: 'spiral',
  entangle: 'spiral',
  singularity: 'burst',
  tunnel_strike: 'slash',
  // --- status: self shields and heals
  cover: 'guard',
  firewall: 'guard',
  cryo_shield: 'guard',
  hull_plating: 'guard',
  brace: 'guard',
  self_repair: 'heal',
  recalibrate: 'heal',
  chill_out: 'heal',
  empathy: 'heal',
  debug: 'heal',
};

/** Effects that mean "something good happens to the user". */
const SELF_EFFECTS = new Set([
  'def_up',
  'def_up2',
  'atk_up',
  'spa_up',
  'spd_up',
  'spd_up2',
  'spe_up2',
  'acc_up',
  'eva_up',
  'heal_half',
  'cure_status',
  'shell_cover',
]);

function defaultKind(m: MoveDef): FxKind {
  if (m.category === 'status') {
    if (m.effect && SELF_EFFECTS.has(m.effect)) {
      return m.effect === 'heal_half' || m.effect === 'cure_status' ? 'heal' : 'buff';
    }
    return 'debuff';
  }
  if (m.category === 'physical') return 'strike';
  switch (m.type) {
    case 'volt':
      return 'bolt';
    case 'optic':
      return 'beam';
    case 'thermal':
      return 'burst';
    case 'cryo':
      return 'shards';
    case 'viral':
      return 'motes';
    case 'quantum':
      return 'spiral';
    case 'neural':
      return 'wave';
    default:
      return 'orb';
  }
}

const SELF_KINDS = new Set<FxKind>(['buff', 'heal', 'guard']);
const CONTACT_KINDS = new Set<FxKind>(['strike', 'slash', 'crush', 'barrage']);

export function resolveMoveFx(m: MoveDef): MoveFxSpec {
  let kind = MOVE_FX_OVERRIDE[m.key] ?? defaultKind(m);
  // A damaging move must always resolve on the thing it damages. Moves that
  // both hurt and buff (SOLAR CHARGE) are easy to mis-tag as self effects, which
  // would leave the target with no visual at all - so the mapping self-corrects
  // rather than trusting the table.
  if (m.power > 0 && SELF_KINDS.has(kind)) kind = defaultKind({ ...m, effect: null });
  const td = typeDef(m.type as TypeKey);
  const color = td?.color ?? '#98a0b0';
  const intensity = Math.max(0.25, Math.min(1, (m.power || 55) / 120));
  const heavy = m.power >= 110;
  return {
    kind,
    color,
    core: lighten(color, 0.62),
    dark: td?.dark ?? darken(color, 0.35),
    intensity,
    target: SELF_KINDS.has(kind) || m.target === 'self' ? 'self' : 'foe',
    hits: m.effect === 'multi_hit' ? 4 : 1,
    shake: m.category === 'status' ? 0 : Math.round(2 + intensity * 6),
    tint: heavy ? 0.28 : 0,
    lunge: CONTACT_KINDS.has(kind) ? (kind === 'crush' ? 26 : 18) : 0,
  };
}

// ------------------------------------------------------------------ playback

export interface FxAnchor {
  x: number;
  y: number;
  /** Half-width of the creature, used to size impacts to the sprite. */
  r: number;
}

const DURATION: Record<FxKind, number> = {
  strike: 30,
  slash: 32,
  crush: 40,
  barrage: 48,
  beam: 42,
  bolt: 40,
  orb: 42,
  burst: 44,
  shards: 44,
  spiral: 48,
  motes: 42,
  drain: 48,
  wave: 40,
  buff: 36,
  debuff: 36,
  heal: 40,
  guard: 36,
};

/**
 * Plays one move effect. The scene owns the instance, calls `update()` each
 * frame and `draw()` above the creatures, and waits on `done`.
 *
 * Outputs the scene applies itself: `shake` (screen), `lunge` (attacker offset,
 * 0..1 of the spec's pixel distance) and `flash` (full-screen wash alpha).
 */
export class MoveFxPlayer {
  private readonly field = new ParticleField();
  private spec: MoveFxSpec | null = null;
  private from: FxAnchor = { x: 0, y: 0, r: 20 };
  private to: FxAnchor = { x: 0, y: 0, r: 20 };
  private f = 0;
  private dur = 0;
  private seed = 1;
  /** Frames at which a `barrage` lands, so the scene can pulse the target. */
  private hitFrames: number[] = [];
  private firedHits = 0;

  shake = 0;
  lunge = 0;
  flash = 0;
  /** Rises to 1 when the effect visually connects - drives the hit reaction. */
  impact = false;
  /**
   * Latches once the effect has landed its first hit. The battle scene waits on
   * this rather than on `done`, so the target's damage reaction coincides with
   * the impact instead of arriving after the particles have finished.
   */
  contacted = false;

  get done(): boolean {
    return this.spec === null;
  }

  get busy(): boolean {
    return this.spec !== null || this.field.active;
  }

  /** True on the exact frame a hit lands, so callers can play SFX per hit. */
  get landedHit(): boolean {
    return this.impact;
  }

  cancel(): void {
    this.spec = null;
    this.field.clear();
    this.shake = 0;
    this.lunge = 0;
    this.flash = 0;
    this.impact = false;
    this.contacted = false;
  }

  play(spec: MoveFxSpec, from: FxAnchor, to: FxAnchor): void {
    this.field.clear();
    this.spec = spec;
    this.from = from;
    this.to = spec.target === 'self' ? from : to;
    this.f = 0;
    this.dur = DURATION[spec.kind];
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.firedHits = 0;
    this.impact = false;
    this.contacted = false;
    if (spec.kind === 'barrage') {
      this.dur = 18 + spec.hits * 10;
      this.hitFrames = Array.from({ length: spec.hits }, (_, i) => 14 + i * 10);
    } else {
      this.hitFrames = [Math.round(this.dur * this.contactPoint(spec.kind))];
    }
  }

  /** Fraction of the effect's runtime at which it visually connects. */
  private contactPoint(kind: FxKind): number {
    switch (kind) {
      case 'strike':
      case 'slash':
        return 0.42;
      case 'crush':
        return 0.5;
      case 'beam':
      case 'bolt':
        return 0.4;
      case 'orb':
      case 'shards':
        return 0.55;
      case 'burst':
      case 'spiral':
      case 'motes':
      case 'wave':
      case 'drain':
        return 0.35;
      default:
        return 0.3;
    }
  }

  update(): void {
    this.field.update();
    this.impact = false;
    const s = this.spec;
    if (!s) {
      this.shake = Math.max(0, this.shake - 1);
      this.lunge = 0;
      this.flash = Math.max(0, this.flash - 0.06);
      return;
    }
    const f = this.f;
    const k = f / this.dur;

    if (this.firedHits < this.hitFrames.length && f >= this.hitFrames[this.firedHits]!) {
      this.firedHits++;
      this.impact = true;
      this.contacted = true;
      this.shake = s.shake;
      if (s.tint > 0) this.flash = s.tint;
      this.onImpact(s);
    }

    this.emit(s, f, k);
    this.shake = Math.max(0, this.shake - 1);
    this.flash = Math.max(0, this.flash - 0.05);
    this.lunge = this.lungeAt(s, k);

    if (++this.f > this.dur) this.spec = null;
  }

  private lungeAt(s: MoveFxSpec, k: number): number {
    if (!s.lunge) return 0;
    // Wind up, snap forward, settle back.
    if (k < 0.25) return -0.28 * (k / 0.25);
    if (k < 0.45) return -0.28 + 1.28 * ((k - 0.25) / 0.2);
    if (k < 0.75) return 1 - (k - 0.45) / 0.3;
    return 0;
  }

  private onImpact(s: MoveFxSpec): void {
    const { x, y, r } = this.to;
    const n = Math.round(8 + s.intensity * 14);
    const rim = darken(s.dark, 0.35);
    switch (s.kind) {
      case 'strike':
      case 'slash':
      case 'barrage':
      case 'crush':
        this.field.burst(x, y - r * 0.4, n, 1.6 + s.intensity * 1.6, {
          color: s.core,
          outline: rim,
          size: 2,
          endSize: 1,
          maxLife: 16,
          shape: 'square',
          ay: 0.12,
        });
        this.field.burst(x, y - r * 0.4, Math.round(n / 2), 1.1, {
          color: s.color,
          outline: rim,
          size: 3,
          endSize: 1,
          maxLife: 20,
          shape: 'square',
          ay: 0.16,
        });
        break;
      case 'beam':
      case 'bolt':
      case 'orb':
        // The rim draws a LONGER streak behind a shorter bright one, so each
        // spark reads as a two-tone tracer rather than a lone white pixel.
        this.field.burst(x, y - r * 0.4, n, 2.1, {
          color: s.core,
          outline: s.dark,
          size: 2,
          endSize: 1,
          maxLife: 18,
          shape: 'spark',
        });
        this.field.burst(x, y - r * 0.4, Math.round(n * 0.6), 1.3, {
          color: s.color,
          outline: rim,
          size: 2,
          endSize: 1,
          maxLife: 22,
          shape: 'square',
          ay: 0.1,
        });
        break;
      case 'burst':
        this.field.burst(x, y - r * 0.4, n + 8, 2.4, {
          color: s.core,
          outline: rim,
          size: 3,
          endSize: 1,
          maxLife: 24,
          shape: 'circle',
          ay: -0.06,
        });
        this.field.burst(x, y - r * 0.4, Math.round(n * 0.7), 1.4, {
          color: s.color,
          outline: rim,
          size: 2,
          endSize: 1,
          maxLife: 30,
          shape: 'square',
          ay: -0.03,
        });
        break;
      case 'shards':
        this.field.burst(x, y - r * 0.4, n, 1.9, {
          color: s.core,
          outline: s.dark,
          size: 3,
          endSize: 1,
          maxLife: 22,
          shape: 'star',
        });
        this.field.burst(x, y - r * 0.4, Math.round(n * 0.7), 1.3, {
          color: s.color,
          outline: rim,
          size: 2,
          endSize: 1,
          maxLife: 26,
          shape: 'square',
          ay: 0.1,
        });
        break;
      default:
        this.field.burst(x, y - r * 0.4, Math.round(n * 0.8), 1.4, {
          color: s.core,
          outline: rim,
          size: 2,
          endSize: 1,
          maxLife: 20,
          shape: 'square',
        });
        break;
    }
  }

  /** Per-frame particle emission, by kind. */
  private emit(s: MoveFxSpec, f: number, k: number): void {
    const t = this.to;
    const o = this.from;
    const rim = darken(s.dark, 0.35);
    switch (s.kind) {
      case 'motes':
        if (f % 2 === 0) {
          this.field.spawn({
            x: t.x + (Math.random() - 0.5) * t.r * 2,
            y: t.y - Math.random() * 6,
            vy: -0.5 - Math.random() * 0.7,
            vx: (Math.random() - 0.5) * 0.4,
            color: Math.random() < 0.5 ? s.color : s.core,
            outline: rim,
            size: 2,
            endSize: 1,
            maxLife: 30,
            shape: 'square',
          });
        }
        break;
      case 'spiral': {
        // Three strands winding inward: one bright, two in the base colour, so
        // the vortex still reads as a shape and not a scatter of dots.
        const a = k * Math.PI * 6;
        for (const [i, dir] of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].entries()) {
          const rad = t.r * (1.5 - k * 0.9);
          this.field.spawn({
            x: t.x + Math.cos(a + dir) * rad,
            y: t.y - t.r * 0.5 + Math.sin(a + dir) * rad * 0.45,
            vx: 0,
            vy: 0,
            color: i === 0 ? s.core : s.color,
            outline: rim,
            size: i === 0 ? 3 : 2,
            endSize: 1,
            maxLife: 18,
            shape: 'circle',
          });
        }
        break;
      }
      case 'drain':
        if (f % 2 === 0 && k < 0.8) {
          this.field.spawn({
            x: t.x + (Math.random() - 0.5) * t.r * 1.8,
            y: t.y - t.r * 0.5 + (Math.random() - 0.5) * t.r,
            color: s.core,
            outline: rim,
            size: 2,
            endSize: 1,
            maxLife: 30,
            shape: 'circle',
            homeX: o.x,
            homeY: o.y - o.r * 0.5,
            homing: 0.012,
          });
        }
        break;
      case 'buff':
      case 'heal':
        if (f % 3 === 0) {
          this.field.spawn({
            x: t.x + (Math.random() - 0.5) * t.r * 2,
            y: t.y + 2,
            vy: -1 - Math.random() * 0.6,
            color: s.kind === 'heal' ? '#78e878' : s.core,
            outline: s.kind === 'heal' ? '#186818' : rim,
            size: 3,
            endSize: 1,
            maxLife: 26,
            shape: s.kind === 'heal' ? 'star' : 'square',
          });
        }
        break;
      case 'debuff':
        if (f % 3 === 0) {
          this.field.spawn({
            x: t.x + (Math.random() - 0.5) * t.r * 2,
            y: t.y - t.r * 1.6,
            vy: 0.9 + Math.random() * 0.5,
            color: s.dark,
            outline: darken(s.dark, 0.6),
            size: 2,
            endSize: 1,
            maxLife: 24,
            shape: 'square',
          });
        }
        break;
      case 'shards':
        if (f % 2 === 0 && k < this.contactPoint('shards')) {
          const a = Math.random() * Math.PI * 2;
          const d = t.r * 2.6;
          this.field.spawn({
            x: t.x + Math.cos(a) * d,
            y: t.y - t.r * 0.5 + Math.sin(a) * d * 0.6,
            color: s.core,
            outline: s.dark,
            size: 3,
            endSize: 2,
            maxLife: 22,
            shape: 'star',
            homeX: t.x,
            homeY: t.y - t.r * 0.5,
            homing: 0.02,
          });
        }
        break;
      case 'guard':
        if (f % 4 === 0) {
          const a = Math.random() * Math.PI * 2;
          this.field.spawn({
            x: t.x + Math.cos(a) * t.r * 1.5,
            y: t.y - t.r * 0.5 + Math.sin(a) * t.r,
            color: s.core,
            outline: rim,
            size: 2,
            endSize: 1,
            maxLife: 20,
            shape: 'square',
          });
        }
        break;
      default:
        break;
    }
  }

  draw(g: CanvasRenderingContext2D): void {
    const s = this.spec;
    if (s) {
      const k = this.f / this.dur;
      const contact = this.contactPoint(s.kind);
      const o = this.from;
      const t = this.to;
      const cy = t.y - t.r * 0.45;
      switch (s.kind) {
        case 'beam': {
          // Charge dot, then the beam fires and fades.
          if (k < contact) {
            const c = k / contact;
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = c;
            g.fillStyle = s.core;
            g.beginPath();
            g.arc(Math.round(o.x), Math.round(o.y - o.r * 0.5), Math.max(1, Math.round(1 + c * 4)), 0, Math.PI * 2);
            g.fill();
            g.restore();
          } else {
            const b = (k - contact) / (1 - contact);
            const w = Math.max(1, (1 - b) * (3 + s.intensity * 5));
            drawBeam(g, o.x, o.y - o.r * 0.5, t.x, cy, w, s.color, s.core, 1 - b * 0.5);
            drawShockRing(g, t.x, cy, b, t.r * 1.8, s.core, 0.7);
          }
          break;
        }
        case 'bolt': {
          if (k >= contact - 0.12 && k < contact + 0.34) {
            const b = (k - (contact - 0.12)) / 0.46;
            const strands = 1 + Math.round(s.intensity * 2);
            for (let i = 0; i < strands; i++) {
              const pts = boltPath(
                o.x,
                o.y - o.r * 0.5,
                t.x,
                cy,
                8,
                12 + i * 6,
                this.seed + i * 977 + Math.floor(this.f / 3) * 31,
              );
              strokePath(g, pts, i === 0 ? s.core : s.color, i === 0 ? 2 : 1, 1 - b, true);
            }
            drawShockRing(g, t.x, cy, b, t.r * 1.6, s.core, 0.7);
          }
          break;
        }
        case 'orb': {
          if (k < contact) {
            const c = k / contact;
            const x = o.x + (t.x - o.x) * c;
            const y = o.y - o.r * 0.5 + (cy - (o.y - o.r * 0.5)) * c - Math.sin(c * Math.PI) * 26;
            const r = 3 + s.intensity * 3;
            g.save();
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = 0.5;
            g.fillStyle = s.color;
            g.beginPath();
            g.arc(Math.round(x), Math.round(y), Math.round(r + 2), 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
            g.fillStyle = s.core;
            g.beginPath();
            g.arc(Math.round(x), Math.round(y), Math.round(r), 0, Math.PI * 2);
            g.fill();
            g.restore();
          } else {
            drawShockRing(g, t.x, cy, (k - contact) / (1 - contact), t.r * 2.1, s.core, 0.75);
          }
          break;
        }
        case 'burst': {
          if (k >= contact) {
            const b = (k - contact) / (1 - contact);
            drawShockRing(g, t.x, cy, b, t.r * 2.6 * (0.7 + s.intensity * 0.6), s.core, 0.8);
            drawShockRing(g, t.x, cy, Math.max(0, b - 0.18), t.r * 2.2, s.color, 0.8);
          }
          break;
        }
        case 'slash': {
          const b = (k - contact + 0.18) / 0.5;
          for (let i = 0; i < 2; i++) {
            drawSlash(
              g,
              t.x + (i ? 6 : -6),
              cy + (i ? 5 : -5),
              i ? -0.7 : -0.9,
              t.r * 2.4,
              Math.max(0, b - i * 0.16),
              s.core,
            );
          }
          break;
        }
        case 'strike':
        case 'crush': {
          const b = (k - contact + 0.14) / 0.42;
          if (b > 0 && b < 1) drawShockRing(g, t.x, cy, b, t.r * (s.kind === 'crush' ? 2.6 : 1.9), s.core, 0.65);
          break;
        }
        case 'barrage': {
          // One visible projectile per hit, in flight for the 10 frames before
          // it lands. Without these the volley was four rings out of nowhere.
          const oy = o.y - o.r * 0.5;
          for (const [i, hf] of this.hitFrames.entries()) {
            const c = (this.f - (hf - 10)) / 10;
            if (c <= 0 || c >= 1) {
              // Ring for a shot that has already landed, for its first frames.
              const b = (this.f - hf) / 12;
              if (b > 0 && b < 1) drawShockRing(g, t.x, cy, b, t.r * 1.9, s.core, 0.6);
              continue;
            }
            const lift = (i % 2 ? -1 : 1) * 8;
            const x = Math.round(o.x + (t.x - o.x) * c);
            const y = Math.round(oy + (cy - oy) * c - Math.sin(c * Math.PI) * (14 + lift));
            g.save();
            g.fillStyle = darken(s.dark, 0.35);
            g.fillRect(x - 3, y - 2, 6, 4);
            g.fillStyle = s.core;
            g.fillRect(x - 2, y - 1, 4, 2);
            g.globalAlpha = Math.round((1 - c) * 4) / 4;
            g.fillStyle = s.color;
            g.fillRect(x - 6, y, 4, 1);
            g.restore();
          }
          break;
        }
        case 'wave': {
          for (let i = 0; i < 3; i++) {
            const b = k * 1.6 - i * 0.22;
            if (b > 0 && b < 1) drawShockRing(g, t.x, cy, b, t.r * 2.4, s.core, 0.5);
          }
          break;
        }
        case 'guard': {
          const a = k < 0.25 ? k / 0.25 : k > 0.75 ? (1 - k) / 0.25 : 1;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.35 * a;
          g.strokeStyle = s.core;
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(Math.round(t.x), Math.round(cy), t.r * 1.7, t.r * 1.9, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
          break;
        }
        default:
          break;
      }
    }
    this.field.draw(g);
  }
}
