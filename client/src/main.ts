/**
 * Agéntmon - entry point.
 * Builds the "console" (canvas + input + audio), then hands control to the
 * scene stack starting with the boot loader.
 */

import './style.css';
import { audio } from './engine/audio.ts';
import { Loop } from './engine/loop.ts';
import { Game } from './game/game.ts';
import * as agent from './game/data/agent.ts';
import { saves } from './game/save.ts';
import { BootScene } from './game/scenes/boot.ts';
import { installAuthStyles } from './game/ui/authoverlay.ts';

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

  const game = new Game(canvas);
  const loop = new Loop(() => game.update(), () => game.render());

  // The browser will not let us make noise before a gesture.
  game.input.onFirstInteraction = () => {
    audio.unlock();
    game.applyOptions();
  };

  // Touch controls only make sense on touch devices.
  const touch = document.getElementById('touch-controls');
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (touch && isTouch) {
    touch.hidden = false;
    document.body.classList.add('touch');
  }
  document.getElementById('hint')?.toggleAttribute('hidden', isTouch);

  // Never lose progress to a stray tab close.
  window.addEventListener('beforeunload', () => game.snapshotLocal());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.snapshotLocal();
      audio.setMuted(true);
    } else {
      game.applyOptions();
    }
  });

  game.push(new BootScene());
  loop.start();

  // Handy for debugging from the console; harmless in production.
  (window as unknown as { agentmon?: Game & { saves?: unknown; agent?: unknown } }).agentmon =
    Object.assign(game, { saves, agent });
}

try {
  boot();
} catch (err) {
  fatal(err);
}
