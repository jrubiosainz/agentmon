/**
 * The soundtrack. Every track is a handful of note strings fed to the
 * in-engine chiptune synth, so the whole score costs a few kilobytes.
 *
 * Pattern syntax: space-separated `PITCH:BEATS` tokens, `-` for a rest.
 */

import { audio, type TrackDef } from '../../engine/audio.ts';

/** Repeat a pattern fragment n times. */
function x(n: number, pattern: string): string {
  return Array.from({ length: n }, () => pattern).join(' ');
}

/** A steady bass line from a chord-root list: one root per bar. */
function bass(roots: string[], beatsPerBar = 4, subdivision = 1): string {
  const perBar = beatsPerBar / subdivision;
  return roots
    .map((r) => x(perBar, `${r}:${subdivision}`))
    .join(' ');
}

/** A driving drum-ish noise line (noise channel ignores pitch content). */
function drums(bars: number): string {
  return x(bars, 'C2:0.5 -:0.5 C2:0.5 -:0.5 C2:0.5 -:0.5 C2:0.25 C2:0.25 -:0.5');
}

const TRACKS: Record<string, TrackDef> = {
  // ------------------------------------------------------------- title
  title: {
    bpm: 128,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.15,
        pattern:
          'C5:0.5 E5:0.5 G5:1 A5:0.5 G5:0.5 E5:1 ' +
          'F5:0.5 A5:0.5 C6:1 B5:0.5 A5:0.5 G5:1 ' +
          'E5:0.5 G5:0.5 B5:1 C6:0.5 B5:0.5 G5:1 ' +
          'A5:0.5 C6:0.5 E6:1.5 D6:0.5 C6:1',
      },
      {
        wave: 'pulse50',
        gain: 0.075,
        pattern:
          'E4:1 G4:1 C5:1 G4:1 A4:1 C5:1 F4:1 A4:1 ' +
          'G4:1 B4:1 E5:1 B4:1 C5:1 E5:1 G5:1 E5:1',
      },
      { wave: 'triangle', gain: 0.22, pattern: bass(['C3', 'F3', 'E3', 'A2'], 4, 0.5) },
      { wave: 'noise', gain: 0.035, pattern: drums(4) },
    ],
  },

  // ------------------------------------------------------------- overworld
  town: {
    bpm: 116,
    loop: true,
    channels: [
      {
        wave: 'pulse50',
        gain: 0.13,
        pattern:
          'G4:0.5 A4:0.5 B4:1 D5:0.5 B4:0.5 A4:1 ' +
          'G4:0.5 A4:0.5 B4:1 A4:1 G4:1 ' +
          'E4:0.5 G4:0.5 A4:1 C5:0.5 A4:0.5 G4:1 ' +
          'D5:0.5 B4:0.5 G4:1 A4:1 -:1',
      },
      {
        wave: 'pulse12',
        gain: 0.055,
        pattern: 'D4:1 -:1 D4:1 -:1 C4:1 -:1 B3:1 -:1 C4:1 -:1 C4:1 -:1 D4:1 -:1 D4:1 -:1',
      },
      { wave: 'triangle', gain: 0.2, pattern: bass(['G2', 'C3', 'A2', 'D3'], 4, 0.5) },
    ],
  },

  city: {
    bpm: 138,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.14,
        pattern:
          'A4:0.5 C5:0.5 E5:0.5 A5:0.5 G5:1 E5:1 ' +
          'F5:0.5 E5:0.5 D5:0.5 C5:0.5 D5:1 E5:1 ' +
          'G4:0.5 B4:0.5 D5:0.5 G5:0.5 F5:1 D5:1 ' +
          'C5:0.5 D5:0.5 E5:1 A4:1.5 -:0.5',
      },
      {
        wave: 'pulse50',
        gain: 0.06,
        pattern: x(2, 'A3:0.5 E4:0.5 A3:0.5 E4:0.5 F3:0.5 C4:0.5 F3:0.5 C4:0.5 ' +
          'G3:0.5 D4:0.5 G3:0.5 D4:0.5 A3:0.5 E4:0.5 A3:0.5 E4:0.5'),
      },
      { wave: 'triangle', gain: 0.22, pattern: bass(['A2', 'F2', 'G2', 'A2'], 4, 0.5) },
      { wave: 'noise', gain: 0.04, pattern: drums(4) },
    ],
  },

  route: {
    bpm: 146,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.14,
        pattern:
          'C5:0.5 D5:0.5 E5:0.5 G5:0.5 E5:1 C5:1 ' +
          'F5:0.5 E5:0.5 D5:0.5 C5:0.5 D5:1.5 -:0.5 ' +
          'E5:0.5 F5:0.5 G5:0.5 A5:0.5 G5:1 E5:1 ' +
          'D5:0.5 E5:0.5 F5:0.5 D5:0.5 C5:2',
      },
      {
        wave: 'pulse12',
        gain: 0.055,
        pattern: x(4, 'E4:0.5 G4:0.5 C5:0.5 G4:0.5 E4:0.5 G4:0.5 C5:0.5 G4:0.5'),
      },
      { wave: 'triangle', gain: 0.2, pattern: bass(['C3', 'F3', 'G3', 'C3'], 4, 0.5) },
      { wave: 'noise', gain: 0.04, pattern: drums(4) },
    ],
  },

  forest: {
    bpm: 96,
    loop: true,
    channels: [
      {
        wave: 'pulse50',
        gain: 0.11,
        pattern:
          'E4:1 G4:0.5 A4:0.5 B4:1 A4:1 ' +
          'G4:1 E4:0.5 D4:0.5 E4:2 ' +
          'A4:1 B4:0.5 C5:0.5 B4:1 A4:1 ' +
          'G4:1 A4:1 E4:2',
      },
      {
        wave: 'pulse12',
        gain: 0.05,
        pattern: x(8, 'B3:1 -:1'),
      },
      { wave: 'triangle', gain: 0.2, pattern: bass(['E3', 'C3', 'A2', 'E3'], 4, 1) },
    ],
  },

  lab: {
    bpm: 104,
    loop: true,
    channels: [
      {
        wave: 'pulse12',
        gain: 0.12,
        pattern:
          'D5:0.5 F5:0.5 A5:1 G5:0.5 F5:0.5 D5:1 ' +
          'C5:0.5 E5:0.5 G5:1 F5:0.5 E5:0.5 C5:1 ' +
          'Bb4:0.5 D5:0.5 F5:1 E5:0.5 D5:0.5 Bb4:1 ' +
          'A4:0.5 C5:0.5 E5:1 D5:2',
      },
      { wave: 'pulse50', gain: 0.05, pattern: x(8, 'A4:1 -:0.5 F4:0.5 -:1 A4:1') },
      { wave: 'triangle', gain: 0.2, pattern: bass(['D3', 'C3', 'Bb2', 'A2'], 4, 0.5) },
    ],
  },

  center: {
    bpm: 108,
    loop: true,
    channels: [
      {
        wave: 'pulse50',
        gain: 0.12,
        pattern:
          'F5:1 E5:0.5 D5:0.5 C5:1 D5:1 ' +
          'E5:1 F5:0.5 G5:0.5 A5:2 ' +
          'G5:1 F5:0.5 E5:0.5 D5:1 C5:1 ' +
          'D5:1 E5:1 F5:2',
      },
      { wave: 'triangle', gain: 0.19, pattern: bass(['F3', 'C3', 'D3', 'Bb2'], 4, 1) },
    ],
  },

  mart: {
    bpm: 124,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.12,
        pattern:
          'G4:0.5 B4:0.5 D5:0.5 B4:0.5 G4:0.5 B4:0.5 D5:1 ' +
          'A4:0.5 C5:0.5 E5:0.5 C5:0.5 A4:0.5 C5:0.5 E5:1 ' +
          'B4:0.5 D5:0.5 G5:0.5 D5:0.5 B4:0.5 D5:0.5 G5:1 ' +
          'C5:0.5 B4:0.5 A4:0.5 G4:0.5 D5:2',
      },
      { wave: 'triangle', gain: 0.19, pattern: bass(['G2', 'A2', 'B2', 'D3'], 4, 0.5) },
      { wave: 'noise', gain: 0.03, pattern: drums(4) },
    ],
  },

  gym: {
    bpm: 150,
    loop: true,
    channels: [
      {
        wave: 'pulse12',
        gain: 0.14,
        pattern:
          'E4:0.25 E4:0.25 E5:0.5 D5:0.5 E5:0.5 B4:1 -:1 ' +
          'C5:0.25 C5:0.25 C5:0.5 B4:0.5 C5:0.5 G4:1 -:1 ' +
          'A4:0.25 A4:0.25 A4:0.5 G4:0.5 A4:0.5 E5:1 -:1 ' +
          'B4:0.5 C5:0.5 D5:0.5 E5:0.5 D5:1 B4:1',
      },
      { wave: 'pulse50', gain: 0.05, pattern: x(8, 'E3:0.5 B3:0.5 E4:0.5 B3:0.5') },
      { wave: 'triangle', gain: 0.22, pattern: bass(['E2', 'C3', 'A2', 'B2'], 4, 0.25) },
      { wave: 'noise', gain: 0.045, pattern: drums(4) },
    ],
  },

  citadel: {
    bpm: 92,
    loop: true,
    channels: [
      {
        wave: 'pulse12',
        gain: 0.13,
        pattern:
          'A4:1 C5:0.5 E5:0.5 A5:1 G5:1 ' +
          'F5:1 E5:0.5 D5:0.5 C5:2 ' +
          'D5:1 F5:0.5 A5:0.5 C6:1 B5:1 ' +
          'A5:2 E5:2',
      },
      { wave: 'pulse50', gain: 0.055, pattern: x(4, 'A3:1 E4:1 A3:1 C4:1') },
      { wave: 'triangle', gain: 0.23, pattern: bass(['A2', 'F2', 'D2', 'E2'], 4, 0.5) },
      { wave: 'noise', gain: 0.035, pattern: drums(4) },
    ],
  },

  // ------------------------------------------------------------- battle
  battleWild: {
    bpm: 168,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.15,
        pattern:
          'D5:0.25 D5:0.25 D5:0.5 A4:0.5 D5:0.5 F5:1 E5:1 ' +
          'C5:0.25 C5:0.25 C5:0.5 G4:0.5 C5:0.5 E5:1 D5:1 ' +
          'Bb4:0.25 Bb4:0.25 Bb4:0.5 F4:0.5 Bb4:0.5 D5:1 C5:1 ' +
          'A4:0.5 C5:0.5 E5:0.5 G5:0.5 F5:1 D5:1',
      },
      {
        wave: 'pulse50',
        gain: 0.06,
        pattern: x(2, 'D4:0.5 A4:0.5 D4:0.5 A4:0.5 C4:0.5 G4:0.5 C4:0.5 G4:0.5 ' +
          'Bb3:0.5 F4:0.5 Bb3:0.5 F4:0.5 A3:0.5 E4:0.5 A3:0.5 E4:0.5'),
      },
      { wave: 'triangle', gain: 0.23, pattern: bass(['D3', 'C3', 'Bb2', 'A2'], 4, 0.25) },
      { wave: 'noise', gain: 0.05, pattern: drums(4) },
    ],
  },

  battleTrainer: {
    bpm: 176,
    loop: true,
    channels: [
      {
        wave: 'pulse12',
        gain: 0.15,
        pattern:
          'E5:0.5 B4:0.5 E5:0.5 G5:0.5 F#5:1 E5:1 ' +
          'D5:0.5 A4:0.5 D5:0.5 F5:0.5 E5:1 D5:1 ' +
          'C5:0.5 G4:0.5 C5:0.5 E5:0.5 D5:1 C5:1 ' +
          'B4:0.5 D5:0.5 F#5:0.5 A5:0.5 G5:1 E5:1',
      },
      {
        wave: 'pulse50',
        gain: 0.06,
        pattern: x(4, 'E4:0.25 -:0.25 E4:0.25 -:0.25 B3:0.25 -:0.25 B3:0.25 -:0.25 ' +
          'D4:0.25 -:0.25 D4:0.25 -:0.25 A3:0.25 -:0.25 A3:0.25 -:0.25'),
      },
      { wave: 'triangle', gain: 0.24, pattern: bass(['E2', 'D3', 'C3', 'B2'], 4, 0.25) },
      { wave: 'noise', gain: 0.055, pattern: drums(4) },
    ],
  },

  gymleader: {
    bpm: 186,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.16,
        pattern:
          'A4:0.25 A4:0.25 E5:0.5 A5:0.5 G5:0.5 E5:0.5 D5:0.5 C5:1 ' +
          'F4:0.25 F4:0.25 C5:0.5 F5:0.5 E5:0.5 C5:0.5 B4:0.5 A4:1 ' +
          'G4:0.25 G4:0.25 D5:0.5 G5:0.5 F5:0.5 D5:0.5 C5:0.5 B4:1 ' +
          'A4:0.5 C5:0.5 E5:0.5 A5:0.5 B5:1 A5:1',
      },
      {
        wave: 'pulse50',
        gain: 0.065,
        pattern: x(8, 'A3:0.25 E4:0.25 A3:0.25 E4:0.25 A3:0.25 E4:0.25 A3:0.25 E4:0.25'),
      },
      { wave: 'triangle', gain: 0.25, pattern: bass(['A2', 'F2', 'G2', 'A2'], 4, 0.25) },
      { wave: 'noise', gain: 0.06, pattern: drums(4) },
    ],
  },

  rival: {
    bpm: 172,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.15,
        pattern:
          'G5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:1 E5:1 ' +
          'A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:1 F5:1 ' +
          'B5:0.5 A5:0.5 G5:0.5 F5:0.5 E5:1 G5:1 ' +
          'C6:1 B5:0.5 A5:0.5 G5:2',
      },
      { wave: 'pulse50', gain: 0.06, pattern: x(4, 'C4:0.5 G4:0.5 C4:0.5 G4:0.5 D4:0.5 A4:0.5 D4:0.5 A4:0.5') },
      { wave: 'triangle', gain: 0.24, pattern: bass(['C3', 'D3', 'E3', 'G2'], 4, 0.25) },
      { wave: 'noise', gain: 0.055, pattern: drums(4) },
    ],
  },

  elite: {
    bpm: 158,
    loop: true,
    channels: [
      {
        wave: 'pulse12',
        gain: 0.15,
        pattern:
          'C5:0.5 Eb5:0.5 G5:0.5 C6:0.5 Bb5:1 G5:1 ' +
          'Ab4:0.5 C5:0.5 Eb5:0.5 Ab5:0.5 G5:1 Eb5:1 ' +
          'F4:0.5 Ab4:0.5 C5:0.5 F5:0.5 Eb5:1 C5:1 ' +
          'G4:0.5 Bb4:0.5 D5:0.5 G5:0.5 F5:1 D5:1',
      },
      { wave: 'pulse50', gain: 0.06, pattern: x(8, 'C4:0.25 G4:0.25 C4:0.25 G4:0.25 Ab3:0.25 Eb4:0.25 Ab3:0.25 Eb4:0.25') },
      { wave: 'triangle', gain: 0.24, pattern: bass(['C3', 'Ab2', 'F2', 'G2'], 4, 0.25) },
      { wave: 'noise', gain: 0.055, pattern: drums(4) },
    ],
  },

  champion: {
    bpm: 192,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.16,
        pattern:
          'D5:0.25 E5:0.25 F#5:0.5 A5:0.5 D6:0.5 C#6:1 A5:1 ' +
          'B5:0.25 C#6:0.25 D6:0.5 A5:0.5 F#5:0.5 E5:1 D5:1 ' +
          'G5:0.25 A5:0.25 B5:0.5 D6:0.5 G6:0.5 F#6:1 D6:1 ' +
          'E6:0.5 D6:0.5 C#6:0.5 B5:0.5 A5:1 D5:1',
      },
      { wave: 'pulse50', gain: 0.07, pattern: x(8, 'D4:0.25 A4:0.25 D4:0.25 A4:0.25 B3:0.25 F#4:0.25 B3:0.25 F#4:0.25') },
      { wave: 'triangle', gain: 0.26, pattern: bass(['D3', 'B2', 'G2', 'A2'], 4, 0.25) },
      { wave: 'noise', gain: 0.06, pattern: drums(4) },
    ],
  },

  // ------------------------------------------------------------- jingles
  victory: {
    bpm: 150,
    loop: true,
    channels: [
      {
        wave: 'pulse25',
        gain: 0.16,
        pattern: 'C5:0.25 C5:0.25 C5:0.25 C5:0.75 Ab4:0.5 Bb4:0.5 C5:1 -:0.5 ' +
          'Bb4:0.25 C5:1.75 -:1',
      },
      { wave: 'triangle', gain: 0.22, pattern: 'C3:1 -:0.5 Ab2:0.5 Bb2:0.5 C3:1.5 F2:1 C3:1.5 -:1' },
    ],
  },

  evolution: {
    bpm: 132,
    loop: true,
    channels: [
      {
        wave: 'pulse50',
        gain: 0.13,
        pattern: x(4, 'C5:0.25 E5:0.25 G5:0.25 C6:0.25 G5:0.25 E5:0.25 C5:0.25 E5:0.25'),
      },
      { wave: 'triangle', gain: 0.2, pattern: x(4, 'C3:1 G3:1') },
    ],
  },

  intro: {
    bpm: 100,
    loop: true,
    channels: [
      {
        wave: 'pulse50',
        gain: 0.12,
        pattern:
          'C5:1 E5:1 G5:1 E5:1 F5:1 A5:1 G5:2 ' +
          'D5:1 F5:1 A5:1 F5:1 E5:1 G5:1 C5:2',
      },
      { wave: 'triangle', gain: 0.2, pattern: bass(['C3', 'F3', 'D3', 'C3'], 4, 1) },
    ],
  },
};

/** Aliases so map definitions can reference friendlier ids. */
const ALIASES: Record<string, string> = {
  overworld: 'route',
  home: 'town',
  house: 'town',
  cave: 'citadel',
  wild: 'battleWild',
  trainer: 'battleTrainer',
};

let installed = false;

export function registerAllTracks(): void {
  if (installed) return;
  installed = true;
  for (const [name, def] of Object.entries(TRACKS)) audio.registerTrack(name, def);
  for (const [alias, target] of Object.entries(ALIASES)) {
    const def = TRACKS[target];
    if (def) audio.registerTrack(alias, def);
  }
}

export function trackExists(name: string): boolean {
  return name in TRACKS || name in ALIASES;
}

/** Every composed track, for tooling and tests. */
export const ALL_TRACKS: Readonly<Record<string, TrackDef>> = TRACKS;
