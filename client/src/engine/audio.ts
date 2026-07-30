/**
 * Chiptune audio: a tiny 4-channel synthesiser (2 pulse, 1 triangle, 1 noise)
 * driving both music and sound effects through the WebAudio graph.
 *
 * Music is written as terse note strings so a whole soundtrack costs a few
 * kilobytes and needs no audio files.
 */

type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'noise';

const NOTE_OFFSETS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function noteFreq(note: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(note);
  if (!m) return 0;
  const semis = NOTE_OFFSETS[m[1]!]! + (Number(m[2]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
}

/** One note event: `pitch:beats` or `-:beats` for a rest. */
interface Step {
  freq: number;
  beats: number;
}

function parsePattern(src: string): Step[] {
  return src
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const [p, b] = token.split(':');
      return { freq: p === '-' ? 0 : noteFreq(p!), beats: Number(b ?? 1) };
    });
}

export interface TrackDef {
  bpm: number;
  loop: boolean;
  channels: { wave: Wave; gain: number; pattern: string; octaveShift?: number }[];
}

/**
 * The mute choice is a property of the device, not of a save file: a player who
 * silences the game on the bus expects it to stay silent after a reload, before
 * any save has been read.
 */
const MUTE_KEY = 'agentmon.muted';

export function loadMutePreference(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function storeMutePreference(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
}

// --------------------------------------------------------------------------- //
// Periodic waves for the pulse channels
// --------------------------------------------------------------------------- //
function makePulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    // Fourier series of a pulse train with the given duty cycle.
    imag[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // 15-bit LFSR, the same idea as the GB noise channel.
  let reg = 0x7fff;
  for (let i = 0; i < len; i++) {
    const bit = (reg ^ (reg >> 1)) & 1;
    reg = (reg >> 1) | (bit << 14);
    data[i] = (reg & 1) * 2 - 1;
  }
  return buf;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private waves = new Map<Wave, PeriodicWave>();
  private noiseBuffer: AudioBuffer | null = null;
  private scheduled: AudioScheduledSourceNode[] = [];
  private currentTrack: string | null = null;
  private loopTimer: number | null = null;
  /** Set whenever a track was asked for while the graph could not play it. */
  private pendingStart = false;
  /** Backgrounded, as opposed to muted on purpose. */
  private ducked = false;

  musicVolume = 0.34;
  sfxVolume = 0.42;
  muted = loadMutePreference();

  private tracks = new Map<string, TrackDef>();

  /**
   * Start or revive audio. Safe (and expected) to call on every user gesture:
   * mobile browsers hand back a context in the `suspended` state and suspend it
   * again on every app switch, notification or screen lock, so a one-shot
   * unlock leaves the player in silence for the rest of the session.
   */
  unlock(): void {
    if (!this.ctx) this.createContext();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') {
      if (this.pendingStart) this.restartCurrent();
      return;
    }
    // `resume()` only settles after the gesture returns, and until then
    // `currentTime` is frozen - so re-arm the track on the far side of it
    // rather than scheduling notes that would all land in the past.
    void ctx.resume().then(() => this.restartCurrent()).catch(() => { /* blocked */ });
  }

  private createContext(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.ducked ? 0 : 1;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.waves.set('pulse12', makePulseWave(ctx, 0.125));
    this.waves.set('pulse25', makePulseWave(ctx, 0.25));
    this.waves.set('pulse50', makePulseWave(ctx, 0.5));
    this.noiseBuffer = makeNoiseBuffer(ctx);

    // The browser can flip the state on its own; pick the music back up.
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.restartCurrent();
    });

    if (ctx.state === 'running') this.restartCurrent();
    else this.pendingStart = this.currentTrack !== null;
  }

  /** Re-schedule the current track from the top. No-op unless we can play. */
  private restartCurrent(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const def = this.currentTrack ? this.tracks.get(this.currentTrack) : null;
    this.pendingStart = false;
    if (!def) return;
    this.stopMusic(false);
    this.scheduleTrack(def);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  registerTrack(name: string, def: TrackDef): void {
    this.tracks.set(name, def);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storeMutePreference(muted);
    this.applyGain();
  }

  /**
   * Temporary silence while the tab is in the background. Kept apart from
   * `muted` so backgrounding the app never rewrites the player's own choice.
   */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted || this.ducked ? 0 : 1;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  // ------------------------------------------------------------------ music
  playMusic(name: string, force = false): void {
    if (!force && this.currentTrack === name) return;
    this.currentTrack = name;
    this.stopMusic(false);
    const def = this.tracks.get(name);
    if (!def) return;
    // Remember the request even when the graph is asleep, so the next gesture
    // (or the browser waking the context back up) starts the right track.
    if (!this.ctx || this.ctx.state !== 'running') { this.pendingStart = true; return; }
    this.scheduleTrack(def);
  }

  private scheduleTrack(def: TrackDef): void {
    const ctx = this.ctx;
    // A suspended context freezes `currentTime`, so every note we queued would
    // be stamped in the past and silently dropped once it resumes.
    if (!ctx || ctx.state !== 'running') { this.pendingStart = true; return; }
    const beat = 60 / def.bpm;
    const start = ctx.currentTime + 0.06;
    let longest = 0;

    for (const ch of def.channels) {
      const steps = parsePattern(ch.pattern);
      let t = start;
      for (const step of steps) {
        const dur = step.beats * beat;
        if (step.freq > 0) {
          const f = step.freq * 2 ** (ch.octaveShift ?? 0);
          this.voice(ch.wave, f, t, dur * 0.92, ch.gain, this.musicGain!);
        }
        t += dur;
      }
      longest = Math.max(longest, t - start);
    }

    if (def.loop) {
      this.loopTimer = window.setTimeout(() => {
        if (this.currentTrack) this.scheduleTrack(def);
      }, Math.max(200, longest * 1000 - 60));
    }
  }

  stopMusic(clearName = true): void {
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    for (const node of this.scheduled) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    this.scheduled = [];
    if (clearName) this.currentTrack = null;
  }

  // ------------------------------------------------------------------ voices
  private voice(
    wave: Wave, freq: number, when: number, dur: number, gain: number, dest: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.connect(dest);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.65), when + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    let src: AudioScheduledSourceNode;
    if (wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      n.loop = true;
      n.playbackRate.value = Math.max(0.15, Math.min(4, freq / 440));
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = Math.max(200, Math.min(9000, freq * 3));
      filter.Q.value = 0.8;
      n.connect(filter).connect(env);
      src = n;
    } else {
      const o = ctx.createOscillator();
      if (wave === 'triangle') o.type = 'triangle';
      else o.setPeriodicWave(this.waves.get(wave)!);
      o.frequency.setValueAtTime(freq, when);
      o.connect(env);
      src = o;
    }
    src.start(when);
    src.stop(when + dur + 0.02);
    this.scheduled.push(src);
    src.addEventListener('ended', () => {
      const i = this.scheduled.indexOf(src);
      if (i >= 0) this.scheduled.splice(i, 1);
      env.disconnect();
    });
  }

  // -------------------------------------------------------------------- sfx
  /** Play a short procedural sound effect. */
  sfx(name: SfxName): void {
    if (!this.ctx || !this.sfxGain) return;
    // A sound effect always follows a button press, so it doubles as a chance
    // to wake a context the OS put to sleep behind our back.
    if (this.ctx.state !== 'running') { this.unlock(); return; }
    const t = this.ctx.currentTime;
    const P = SFX[name];
    if (!P) return;
    for (const s of P) {
      const when = t + s.at;
      if (s.sweep) this.sweep(s.wave, s.from, s.to ?? s.from, when, s.dur, s.gain);
      else this.voice(s.wave, s.from, when, s.dur, s.gain, this.sfxGain);
    }
  }

  private sweep(wave: Wave, f0: number, f1: number, when: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.connect(this.sfxGain!);
    env.gain.setValueAtTime(Math.max(0.0002, gain), when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    let src: AudioScheduledSourceNode;
    if (wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      n.loop = true;
      n.playbackRate.setValueAtTime(Math.max(0.15, f0 / 440), when);
      n.playbackRate.exponentialRampToValueAtTime(Math.max(0.15, f1 / 440), when + dur);
      n.connect(env);
      src = n;
    } else {
      const o = ctx.createOscillator();
      if (wave === 'triangle') o.type = 'triangle';
      else o.setPeriodicWave(this.waves.get(wave)!);
      o.frequency.setValueAtTime(f0, when);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
      o.connect(env);
      src = o;
    }
    src.start(when);
    src.stop(when + dur + 0.02);
    this.scheduled.push(src);
  }
}

interface SfxStep {
  wave: Wave;
  from: number;
  to?: number;
  at: number;
  dur: number;
  gain: number;
  sweep?: boolean;
}

export type SfxName =
  | 'cursor' | 'select' | 'cancel' | 'bump' | 'step' | 'save'
  | 'hitWeak' | 'hitNormal' | 'hitSuper' | 'faint' | 'heal' | 'levelUp'
  | 'ballThrow' | 'ballShake' | 'ballCatch' | 'flee' | 'encounter' | 'error'
  | 'door' | 'item' | 'badge' | 'charge' | 'menuOpen';

const SFX: Record<SfxName, SfxStep[]> = {
  cursor: [{ wave: 'pulse25', from: 900, at: 0, dur: 0.05, gain: 0.16 }],
  select: [
    { wave: 'pulse25', from: 700, at: 0, dur: 0.045, gain: 0.18 },
    { wave: 'pulse25', from: 1050, at: 0.05, dur: 0.07, gain: 0.18 },
  ],
  cancel: [
    { wave: 'pulse12', from: 620, at: 0, dur: 0.05, gain: 0.16 },
    { wave: 'pulse12', from: 380, at: 0.05, dur: 0.08, gain: 0.16 },
  ],
  menuOpen: [
    { wave: 'pulse50', from: 500, at: 0, dur: 0.04, gain: 0.14 },
    { wave: 'pulse50', from: 800, at: 0.04, dur: 0.06, gain: 0.14 },
  ],
  bump: [{ wave: 'noise', from: 240, to: 120, at: 0, dur: 0.09, gain: 0.14, sweep: true }],
  step: [{ wave: 'noise', from: 700, to: 400, at: 0, dur: 0.035, gain: 0.05, sweep: true }],
  door: [{ wave: 'noise', from: 500, to: 180, at: 0, dur: 0.18, gain: 0.12, sweep: true }],
  save: [
    { wave: 'pulse25', from: 660, at: 0, dur: 0.08, gain: 0.18 },
    { wave: 'pulse25', from: 880, at: 0.09, dur: 0.08, gain: 0.18 },
    { wave: 'pulse25', from: 1320, at: 0.18, dur: 0.16, gain: 0.18 },
  ],
  hitWeak: [{ wave: 'noise', from: 500, to: 260, at: 0, dur: 0.1, gain: 0.16, sweep: true }],
  hitNormal: [
    { wave: 'noise', from: 900, to: 200, at: 0, dur: 0.14, gain: 0.24, sweep: true },
    { wave: 'pulse12', from: 220, to: 90, at: 0, dur: 0.14, gain: 0.16, sweep: true },
  ],
  hitSuper: [
    { wave: 'noise', from: 1500, to: 160, at: 0, dur: 0.24, gain: 0.3, sweep: true },
    { wave: 'pulse12', from: 320, to: 60, at: 0.02, dur: 0.24, gain: 0.2, sweep: true },
  ],
  faint: [{ wave: 'pulse50', from: 620, to: 70, at: 0, dur: 0.55, gain: 0.22, sweep: true }],
  heal: [
    { wave: 'triangle', from: 660, at: 0, dur: 0.1, gain: 0.2 },
    { wave: 'triangle', from: 880, at: 0.1, dur: 0.1, gain: 0.2 },
    { wave: 'triangle', from: 1100, at: 0.2, dur: 0.16, gain: 0.2 },
  ],
  levelUp: [
    { wave: 'pulse25', from: 523, at: 0, dur: 0.09, gain: 0.2 },
    { wave: 'pulse25', from: 659, at: 0.09, dur: 0.09, gain: 0.2 },
    { wave: 'pulse25', from: 784, at: 0.18, dur: 0.09, gain: 0.2 },
    { wave: 'pulse25', from: 1047, at: 0.27, dur: 0.22, gain: 0.22 },
  ],
  badge: [
    { wave: 'pulse50', from: 784, at: 0, dur: 0.12, gain: 0.22 },
    { wave: 'pulse50', from: 988, at: 0.12, dur: 0.12, gain: 0.22 },
    { wave: 'pulse50', from: 1319, at: 0.24, dur: 0.32, gain: 0.24 },
  ],
  ballThrow: [{ wave: 'pulse25', from: 300, to: 1200, at: 0, dur: 0.22, gain: 0.18, sweep: true }],
  ballShake: [
    { wave: 'pulse12', from: 420, at: 0, dur: 0.06, gain: 0.16 },
    { wave: 'pulse12', from: 300, at: 0.07, dur: 0.06, gain: 0.16 },
  ],
  ballCatch: [
    { wave: 'pulse25', from: 523, at: 0, dur: 0.1, gain: 0.2 },
    { wave: 'pulse25', from: 784, at: 0.1, dur: 0.1, gain: 0.2 },
    { wave: 'pulse25', from: 1047, at: 0.2, dur: 0.1, gain: 0.2 },
    { wave: 'pulse25', from: 1568, at: 0.3, dur: 0.3, gain: 0.22 },
  ],
  flee: [{ wave: 'noise', from: 900, to: 1800, at: 0, dur: 0.2, gain: 0.12, sweep: true }],
  encounter: [
    { wave: 'pulse12', from: 180, to: 900, at: 0, dur: 0.3, gain: 0.2, sweep: true },
    { wave: 'noise', from: 400, to: 1400, at: 0.1, dur: 0.3, gain: 0.14, sweep: true },
  ],
  error: [{ wave: 'pulse12', from: 200, at: 0, dur: 0.16, gain: 0.18 }],
  item: [
    { wave: 'pulse25', from: 880, at: 0, dur: 0.07, gain: 0.18 },
    { wave: 'pulse25', from: 1320, at: 0.07, dur: 0.14, gain: 0.18 },
  ],
  charge: [{ wave: 'pulse50', from: 120, to: 900, at: 0, dur: 0.4, gain: 0.14, sweep: true }],
};

export const audio = new AudioEngine();
