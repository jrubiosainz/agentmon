/**
 * Agéntmon - entry point.
 * Builds the "console" (canvas + input + audio), then hands control to the
 * scene stack starting with the boot loader.
 */

import './style.css';
import { audio, loadMutePreference } from './engine/audio.ts';
import { Loop } from './engine/loop.ts';
import { Game } from './game/game.ts';
import * as agent from './game/data/agent.ts';
import { saves } from './game/save.ts';
import { BootScene } from './game/scenes/boot.ts';
import { DEFAULT_OPTIONS } from './game/state.ts';
import { installAuthStyles } from './game/ui/authoverlay.ts';

/**
 * The on-screen sound switch. Phones are where audio most often fails to start,
 * and they are also where the in-game OPTIONS menu is furthest away, so the
 * toggle lives in the shell where it is always one tap from the title screen.
 */
function installSoundToggle(game: Game): void {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;
  const label = btn.querySelector('.lbl');
  const icon = btn.querySelector('.ico');

  const paint = (muted: boolean) => {
    btn.classList.toggle('is-off', muted);
    btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    if (label) label.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    if (icon) icon.textContent = muted ? '\u2715' : '\u266b';
  };

  game.onMuteChanged = paint;
  paint(audio.muted);

  btn.addEventListener('click', () => {
    // The tap is a user gesture, so it is also the most reliable moment to
    // start (or revive) the audio graph on a phone.
    audio.unlock();
    game.setMuted(!audio.muted);
  });
}

function fatal(err: unknown): void {
  console.error(err);
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML =
    '<h2>SYSTEM FAULT</h2><p>Agéntmon could not start.</p>' +
    `<pre>${String((err as Error)?.message ?? err)}</pre>` +
    '<button id="fatal-reload">RESTART</button>';
  overlay.appendChild(box);
  document.getElementById('fatal-reload')?.addEventListener('click', () => location.reload());
}

function boot(): void {
  const canvas = document.getElementById('screen') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#screen canvas is missing');

  installAuthStyles();

  // The device-level mute choice outranks whatever a save file remembers, so a
  // player who silenced the game finds it silent on the next visit too.
  DEFAULT_OPTIONS.muted = loadMutePreference();

  const game = new Game(canvas);
  const loop = new Loop(() => game.update(), () => game.render());
  // A bug in one scene should cost that scene, not the whole session.
  loop.onError = (err) => game.recoverFromCrash(err);

  // The browser will not let us make noise before a gesture.
  game.input.onFirstInteraction = () => {
    audio.unlock();
    game.applyOptions();
  };

  // Mobile browsers hand back a suspended AudioContext and re-suspend it on
  // every app switch, notification or screen lock. `unlock()` is cheap when the
  // graph is already awake, so try on any gesture rather than only the first.
  const wake = () => audio.unlock();
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) {
    document.addEventListener(ev, wake, { capture: true, passive: true });
  }

  installSoundToggle(game);

  // Touch controls only make sense on touch devices.
  const touch = document.getElementById('touch-controls');
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (touch && isTouch) {
    touch.hidden = false;
    document.body.classList.add('touch');
    // The shell just changed shape; re-fit before the first frame is presented.
    game.screen.resize();
  }
  document.getElementById('hint')?.toggleAttribute('hidden', isTouch);

  // Never lose progress to a stray tab close.
  window.addEventListener('beforeunload', () => game.snapshotLocal());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.snapshotLocal();
      audio.setDucked(true);
    } else {
      audio.setDucked(false);
      game.applyOptions();
      // Coming back from the app switcher leaves the context suspended; without
      // this the soundtrack would stay dead for the rest of the session.
      audio.unlock();
    }
  });

  game.push(new BootScene());
  loop.start();

  // Handy for debugging from the console; harmless in production.
  (window as unknown as { agentmon?: Game & { saves?: unknown; agent?: unknown; audio?: unknown } }).agentmon =
    Object.assign(game, { saves, agent, audio });
}

try {
  boot();
} catch (err) {
  fatal(err);
}
