/**
 * Hand-authored 5x7 bitmap font in the spirit of the GBA-era RPG UI fonts.
 *
 * Glyphs are written as pixel rows so they stay editable, then baked once into
 * a tinted offscreen atlas at boot. Rendering is a plain `drawImage` per glyph,
 * which keeps text crisp at 1:1 and free of any browser font-rasterising.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Extra baseline padding so descenders (g, y, p) have room. */
export const LINE_H = 12;

const G: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.....', '.....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '.##..', '#..#.', '#...#', '#..#.', '.##.#'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  ';': ['.....', '..#..', '.....', '.....', '..#..', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '`': ['.#...', '..#..', '.....', '.....', '.....', '.....', '.....'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '####.', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.####', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.##.', '##...', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  '{': ['...#.', '..#..', '..#..', '.#...', '..#..', '..#..', '...#.'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '}': ['.#...', '..#..', '..#..', '...#.', '..#..', '..#..', '.#...'],
  '~': ['.....', '.....', '.##.#', '#..#.', '.....', '.....', '.....'],
  // Game-specific glyphs
  '\u00a5': ['#...#', '.#.#.', '..#..', '#####', '..#..', '#####', '..#..'], // currency
  '\u00a9': ['.###.', '#...#', '#.##.', '#.#..', '#.##.', '#...#', '.###.'], // copyright
  '\u25b6': ['.....', '#....', '##...', '###..', '##...', '#....', '.....'], // menu cursor
  '\u25c0': ['.....', '....#', '...##', '..###', '...##', '....#', '.....'], // left arrow
  '\u25b2': ['.....', '.....', '..#..', '.###.', '#####', '.....', '.....'], // scroll up
  '\u25cb': ['.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....'], // dex: seen
  '\u25cf': ['.....', '.###.', '#####', '#####', '#####', '.###.', '.....'], // dex: caught
  '\u25bc': ['.....', '.....', '#####', '.###.', '..#..', '.....', '.....'], // "more text"
  '\u2191': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....'],
  '\u2193': ['.....', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '\u2642': ['..###', '....#', '.##.#', '#..##', '#..#.', '.##..', '.....'], // male
  '\u2640': ['.###.', '#...#', '#...#', '.###.', '..#..', '.###.', '..#..'], // female
  '\u2605': ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#', '.....'], // star
  '\u2764': ['.#.#.', '#####', '#####', '.###.', '.###.', '..#..', '.....'], // heart
  // Punctuation the Latin translations need
  '\u00bf': ['..#..', '.....', '..#..', '.#...', '#....', '#...#', '.###.'], // inverted ?
  '\u00a1': ['..#..', '.....', '..#..', '..#..', '..#..', '..#..', '..#..'], // inverted !
  '\u00ab': ['.....', '..#.#', '.#.#.', '#.#..', '.#.#.', '..#.#', '.....'], // <<
  '\u00bb': ['.....', '#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..', '.....'], // >>
  '\u00b0': ['.##..', '#..#.', '#..#.', '.##..', '.....', '.....', '.....'], // degree
  '\u00b7': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'], // middle dot
  '\u00e7': ['.....', '.###.', '#....', '#....', '#...#', '.###.', '..#..'], // c-cedilla
  '\u00c7': ['.###.', '#...#', '#....', '#....', '#...#', '.###.', '..#..'], // C-cedilla
};

/**
 * Accents are composed rather than hand-drawn: every x-height lowercase letter
 * and every capital leaves rows 0-1 free, so a two-row diacritic can simply be
 * stamped on top of a five-row base. That keeps 40-odd accented glyphs
 * perfectly consistent with each other and with the rest of the font.
 */
const MARKS = {
  acute: ['...#.', '..#..'],
  grave: ['.#...', '..#..'],
  circ: ['..#..', '.#.#.'],
  trema: ['.#.#.', '.....'],
  tilde: ['.##.#', '#..#.'],
} as const;

/** Capitals squashed from seven rows to five to make room for a diacritic. */
const CAPS5: Record<string, string[]> = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#...#', '.###.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  I: ['.###.', '..#..', '..#..', '..#..', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
};

type MarkName = keyof typeof MARKS;

const ACCENTS: Array<[string, string, MarkName]> = [
  // Lowercase - the base is the letter's own x-height, rows 2..6.
  ['\u00e0', 'a', 'grave'], ['\u00e1', 'a', 'acute'], ['\u00e2', 'a', 'circ'],
  ['\u00e4', 'a', 'trema'], ['\u00e3', 'a', 'tilde'],
  ['\u00e8', 'e', 'grave'], ['\u00e9', 'e', 'acute'], ['\u00ea', 'e', 'circ'], ['\u00eb', 'e', 'trema'],
  ['\u00ec', 'i', 'grave'], ['\u00ed', 'i', 'acute'], ['\u00ee', 'i', 'circ'], ['\u00ef', 'i', 'trema'],
  ['\u00f2', 'o', 'grave'], ['\u00f3', 'o', 'acute'], ['\u00f4', 'o', 'circ'],
  ['\u00f6', 'o', 'trema'], ['\u00f5', 'o', 'tilde'],
  ['\u00f9', 'u', 'grave'], ['\u00fa', 'u', 'acute'], ['\u00fb', 'u', 'circ'], ['\u00fc', 'u', 'trema'],
  ['\u00f1', 'n', 'tilde'],
  // Uppercase - the base comes from CAPS5.
  ['\u00c0', 'A', 'grave'], ['\u00c1', 'A', 'acute'], ['\u00c2', 'A', 'circ'], ['\u00c4', 'A', 'trema'],
  ['\u00c8', 'E', 'grave'], ['\u00c9', 'E', 'acute'], ['\u00ca', 'E', 'circ'], ['\u00cb', 'E', 'trema'],
  ['\u00cc', 'I', 'grave'], ['\u00cd', 'I', 'acute'], ['\u00ce', 'I', 'circ'], ['\u00cf', 'I', 'trema'],
  ['\u00d2', 'O', 'grave'], ['\u00d3', 'O', 'acute'], ['\u00d4', 'O', 'circ'], ['\u00d6', 'O', 'trema'],
  ['\u00d9', 'U', 'grave'], ['\u00da', 'U', 'acute'], ['\u00db', 'U', 'circ'], ['\u00dc', 'U', 'trema'],
  ['\u00d1', 'N', 'tilde'],
];

for (const [ch, base, mark] of ACCENTS) {
  const body = CAPS5[base] ?? G[base]?.slice(2);
  if (!body || body.length !== 5) continue;
  G[ch] = [...MARKS[mark], ...body];
}

/**
 * Characters we would rather fold than draw: either they are impossible to read
 * at 5x7 (the oe ligature) or they are typography a translator might paste in.
 * Folding here means a stray curly quote can never punch a hole in a text box.
 */
const SUBSTITUTIONS: Record<string, string> = {
  '\u0153': 'oe', '\u0152': 'OE', '\u00e6': 'ae', '\u00c6': 'AE', '\u00df': 'ss',
  '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
  '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00a0': ' ', '\u202f': ' ',
  '\u00ff': 'y', '\u0178': 'Y', '\u00e5': 'a', '\u00c5': 'A', '\u00f8': 'o', '\u00d8': 'O',
};

const SUBST_RE = new RegExp(`[${Object.keys(SUBSTITUTIONS).join('')}]`, 'g');

/** Fold anything unrenderable down to glyphs the atlas actually has. */
export function normalizeText(text: string): string {
  return text.replace(SUBST_RE, (c) => SUBSTITUTIONS[c] ?? c);
}

// --------------------------------------------------------------------------- //
// Japanese
// --------------------------------------------------------------------------- //
/**
 * Kana are far beyond what a hand-drawn 5x7 grid can carry, so they are baked
 * on demand from a system gothic face into an 8x8 cell and then thresholded to
 * one bit. The threshold is what matters: it strips the anti-aliasing so a
 * kana sits on the same pixel grid as the hand-drawn Latin next to it.
 */
export const CJK_W = 8;
const CJK_H = 8;
const CJK_FONT =
  '8px "MS Gothic","Osaka-Mono","Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP","Meiryo",monospace';

export function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) ||   // hangul jamo
    (c >= 0x2e80 && c <= 0x303e) ||   // CJK radicals + punctuation
    (c >= 0x3041 && c <= 0x33ff) ||   // kana, bopomofo, compatibility
    (c >= 0x3400 && c <= 0x4dbf) ||   // ext A
    (c >= 0x4e00 && c <= 0x9fff) ||   // unified ideographs
    (c >= 0xf900 && c <= 0xfaff) ||   // compatibility ideographs
    (c >= 0xff01 && c <= 0xff60) ||   // fullwidth forms
    (c >= 0xffe0 && c <= 0xffe6)
  );
}

function inkOf(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Characters that may never open a line (Japanese kinsoku shori). */
const NO_LINE_START = new Set(
  '\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff1f\uff01\u30fb\u30fc\u309d\u309e\u3005'
  + '\u2019\u201d\uff09\u3015\uff3d\uff5d\u3009\u300b\u300d\u300f\u3011\u3041\u3043'
  + '\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u30a1\u30a3\u30a5\u30a7\u30a9'
  + '\u30c3\u30e3\u30e5\u30e7\u30ee\uff5e\u2015\u2026',
);

/** Characters that may never end a line. */
const NO_LINE_END = new Set('\u2018\u201c\uff08\u3014\uff3b\uff5b\u3008\u300a\u300c\u300e\u3010');


/** Glyphs that hang below the baseline. */
const DESCENDERS = new Set(['g', 'j', 'p', 'q', 'y', ',', ';']);

/** Blank-glyph width; every other advance is derived from the glyph's own ink. */
const SPACE_W = 3;

/** Ink bounds of a glyph, so the font is genuinely proportional. */
interface Metric { left: number; width: number }

function metricOf(rows: string[]): Metric {
  let lo = GLYPH_W;
  let hi = -1;
  for (const row of rows) {
    for (let x = 0; x < GLYPH_W; x++) {
      if (row[x] !== '#') continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return hi < 0 ? { left: 0, width: SPACE_W } : { left: lo, width: hi - lo + 1 };
}

export type FontVariant = 'normal' | 'white' | 'dim' | 'red' | 'green' | 'blue' | 'gold' | 'shadow';

const VARIANT_COLORS: Record<FontVariant, string> = {
  normal: '#303038',
  white: '#f8f8f8',
  dim: '#8890a0',
  red: '#d83030',
  green: '#2e9e50',
  blue: '#3868c8',
  gold: '#e8a020',
  shadow: '#b8b8c8',
};

export class BitmapFont {
  private atlases = new Map<FontVariant, HTMLCanvasElement>();
  private order: string[];
  private index = new Map<string, number>();
  private metrics = new Map<string, Metric>();
  /** Lazily baked wide glyphs, keyed by variant + character. */
  private wide = new Map<string, HTMLCanvasElement | null>();

  constructor() {
    this.order = Object.keys(G);
    this.order.forEach((ch, i) => {
      this.index.set(ch, i);
      this.metrics.set(ch, metricOf(G[ch]!));
    });
    for (const v of Object.keys(VARIANT_COLORS) as FontVariant[]) this.bake(v);
  }

  private bake(variant: FontVariant): void {
    const cv = document.createElement('canvas');
    cv.width = GLYPH_W * this.order.length;
    cv.height = GLYPH_H;
    const g = cv.getContext('2d')!;
    g.fillStyle = VARIANT_COLORS[variant];
    this.order.forEach((ch, i) => {
      const rows = G[ch]!;
      for (let y = 0; y < GLYPH_H; y++) {
        const row = rows[y]!;
        for (let x = 0; x < GLYPH_W; x++) {
          if (row[x] === '#') g.fillRect(i * GLYPH_W + x, y, 1, 1);
        }
      }
    });
    this.atlases.set(variant, cv);
  }

  /**
   * Bake one wide glyph for one colour variant. Returns null when the platform
   * has no font for it, so callers can fall back to a placeholder instead of
   * silently dropping the character.
   */
  private wideGlyph(ch: string, variant: FontVariant): HTMLCanvasElement | null {
    const key = `${variant}\u0000${ch}`;
    const cached = this.wide.get(key);
    if (cached !== undefined) return cached;

    let cv: HTMLCanvasElement | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CJK_W;
      canvas.height = CJK_H;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.imageSmoothingEnabled = false;
        g.font = CJK_FONT;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillStyle = '#000000';
        g.fillText(ch, CJK_W / 2, CJK_H - 1);

        const img = g.getImageData(0, 0, CJK_W, CJK_H);
        const [r, gg, b] = inkOf(VARIANT_COLORS[variant]);
        let ink = 0;
        for (let i = 0; i < img.data.length; i += 4) {
          const on = (img.data[i + 3] ?? 0) >= 90;
          img.data[i] = r;
          img.data[i + 1] = gg;
          img.data[i + 2] = b;
          img.data[i + 3] = on ? 255 : 0;
          if (on) ink++;
        }
        if (ink > 0) {
          g.putImageData(img, 0, 0);
          cv = canvas;
        }
      }
    } catch {
      cv = null;
    }
    this.wide.set(key, cv);
    return cv;
  }

  advance(ch: string): number {
    if (isWide(ch)) return CJK_W;
    return (this.metrics.get(ch)?.width ?? GLYPH_W) + 1;
  }

  /**
   * Whether a character actually has ink. Unknown latin characters silently
   * fall back to a blank cell in `advance()`, so translations have to be
   * checked against this instead of against a width.
   */
  has(ch: string): boolean {
    for (const c of normalizeText(ch)) {
      if (c === ' ' || c === '\n') continue;
      if (isWide(c)) {
        if (this.wideGlyph(c, 'normal') === null) return false;
      } else if (!this.index.has(c)) {
        return false;
      }
    }
    return true;
  }

  measure(text: string): number {
    let w = 0;
    let any = false;
    for (const ch of normalizeText(text)) {
      w += this.advance(ch);
      any = true;
    }
    return any ? Math.max(0, w - 1) : 0;
  }

  /** Draw a single line. Returns the advance width. */
  draw(
    g: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    variant: FontVariant = 'normal',
    shadow = true,
  ): number {
    if (shadow && variant !== 'shadow') {
      this.drawRaw(g, text, x + 1, y + 1, 'shadow');
    }
    return this.drawRaw(g, text, x, y, variant);
  }

  private drawRaw(
    g: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    variant: FontVariant,
  ): number {
    const atlas = this.atlases.get(variant)!;
    let cx = Math.round(x);
    const cy = Math.round(y);
    for (const ch of normalizeText(text)) {
      if (isWide(ch)) {
        // Bottom-aligned with the Latin baseline so mixed lines sit level.
        const glyph = this.wideGlyph(ch, variant);
        if (glyph) g.drawImage(glyph, cx, cy + GLYPH_H - CJK_H);
        cx += CJK_W;
        continue;
      }
      const i = this.index.get(ch);
      const m = this.metrics.get(ch);
      if (i !== undefined && m && ch !== ' ') {
        const dy = DESCENDERS.has(ch) ? 1 : 0;
        // Blit only the inked columns so punctuation never eats the next space.
        g.drawImage(
          atlas, i * GLYPH_W + m.left, 0, m.width, GLYPH_H,
          cx, cy + dy, m.width, GLYPH_H,
        );
      }
      cx += this.advance(ch);
    }
    return cx - Math.round(x);
  }

  drawCentered(
    g: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    variant: FontVariant = 'normal',
    shadow = true,
  ): void {
    this.draw(g, text, Math.round(cx - this.measure(text) / 2), y, variant, shadow);
  }

  drawRight(
    g: CanvasRenderingContext2D,
    text: string,
    right: number,
    y: number,
    variant: FontVariant = 'normal',
    shadow = true,
  ): void {
    this.draw(g, text, Math.round(right - this.measure(text)), y, variant, shadow);
  }

  /**
   * Greedy word wrap to a pixel width.
   *
   * Latin wraps on spaces; Japanese has none, so every wide character is its
   * own break opportunity, tempered by kinsoku shori: a line may not open with
   * closing punctuation or a small kana, and may not end with an opening
   * bracket.
   */
  wrap(text: string, maxWidth: number): string[] {
    const out: string[] = [];
    for (const paragraph of normalizeText(text).split('\n')) {
      let line = '';
      for (const [token, gap] of this.tokenize(paragraph)) {
        const glue = line ? gap : '';
        const candidate = line + glue + token;
        if (!line || this.measure(candidate) <= maxWidth) {
          line = candidate;
          continue;
        }
        // Never strand closing punctuation at the head of the next line.
        if (NO_LINE_START.has(token)) {
          line = candidate;
          continue;
        }
        let carry = '';
        const tail = line.at(-1) ?? '';
        if (NO_LINE_END.has(tail)) {
          carry = tail;
          line = line.slice(0, -1);
        }
        out.push(line);
        line = carry + token;
      }
      out.push(line);
    }
    return out;
  }

  /** Break a paragraph into units that must not be split, with the gap that precedes each. */
  private tokenize(paragraph: string): Array<[string, string]> {
    const tokens: Array<[string, string]> = [];
    let word = '';
    let gap = '';
    const flush = (): void => {
      if (!word) return;
      tokens.push([word, gap]);
      word = '';
      gap = '';
    };
    for (const ch of paragraph) {
      if (ch === ' ') {
        flush();
        gap += ' ';
      } else if (isWide(ch)) {
        flush();
        tokens.push([ch, gap]);
        gap = '';
      } else {
        word += ch;
      }
    }
    flush();
    if (tokens.length === 0) tokens.push(['', '']);
    return tokens;
  }
}

export const font = new BitmapFont();
