/**
 * Crash-resilience suite.
 *
 * Regression cover for the "black screen on entering combat" class of bug: a
 * scene whose `enter()` rejected stayed on the stack, so every later `update()`
 * threw before `render()` was reached and the canvas froze on the transition
 * curtain with no way out.
 */

import { describe, expect, it, vi } from 'vitest';

import { Loop } from '../src/engine/loop.ts';
import { Scene, SceneStack } from '../src/engine/scene.ts';
import { Transitions } from '../src/engine/transition.ts';
import type { Game } from '../src/game/game.ts';

class Recorder extends Scene {
  updates = 0;
  renders = 0;
  resumed = 0;
  lastResult: unknown = 'untouched';
  update(): void { this.updates++; }
  render(): void { this.renders++; }
  override resume(result?: unknown): void { this.resumed++; this.lastResult = result; }
}

/** Fails exactly the way BattleScene did: throws before assigning its state. */
class Exploding extends Scene {
  state!: { value: number };
  override enter(): Promise<void> { return Promise.reject(new Error('bad payload')); }
  update(): void { this.state.value++; }
  render(): void { this.state.value++; }
}

const stubGame = (): Game => ({}) as Game;

describe('SceneStack rollback', () => {
  it('removes a scene whose enter() rejected', async () => {
    const stack = new SceneStack(stubGame());
    const base = new Recorder();
    await stack.push(base);

    await expect(stack.push(new Exploding())).rejects.toThrow('bad payload');

    expect(stack.depth).toBe(1);
    expect(stack.top).toBe(base);
  });

  it('keeps updating and rendering the scene below', async () => {
    const stack = new SceneStack(stubGame());
    const base = new Recorder();
    await stack.push(base);
    await stack.push(new Exploding()).catch(() => {});

    for (let i = 0; i < 5; i++) {
      expect(() => stack.update()).not.toThrow();
      expect(() => stack.render(null as never)).not.toThrow();
    }
    expect(base.updates).toBe(5);
    expect(base.renders).toBe(5);
  });

  it('resumes the scene below so awaiting callers are never stranded', async () => {
    const stack = new SceneStack(stubGame());
    const base = new Recorder();
    await stack.push(base);
    await stack.push(new Exploding()).catch(() => {});

    // This is what unblocks pushAndWait() and lets the overworld lift the curtain.
    expect(base.resumed).toBe(1);
    expect(base.lastResult).toBeUndefined();
  });

  it('leaves an empty stack when replace() rejects', async () => {
    const stack = new SceneStack(stubGame());
    await stack.push(new Recorder());
    await expect(stack.replace(new Exploding())).rejects.toThrow('bad payload');
    expect(stack.depth).toBe(0);
  });
});

describe('Loop error isolation', () => {
  const runFrames = (loop: Loop, count: number): void => {
    let now = 0;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      if (now / (1000 / 60) < count) { now += 1000 / 60; queueMicrotask(() => cb(now)); }
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('performance', { now: () => 0 });
    loop.start();
  };

  it('still renders when update() throws, and reports the error', async () => {
    let renders = 0;
    const errors: unknown[] = [];
    const loop = new Loop(() => { throw new Error('boom'); }, () => { renders++; });
    loop.onError = (e) => errors.push(e);

    runFrames(loop, 4);
    await new Promise((r) => setTimeout(r, 30));
    loop.stop();
    vi.unstubAllGlobals();

    // The whole point: a broken update can never suppress the frame.
    expect(renders).toBeGreaterThan(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Transitions never strand the curtain', () => {
  it('resolves a superseded transition instead of orphaning its promise', async () => {
    const t = new Transitions();
    let firstSettled = false;
    void t.out('fade', 30).then(() => { firstSettled = true; });
    // A second transition starting mid-flight used to overwrite the first
    // without resolving it, so the awaiting caller hung forever.
    void t.in('fade', 4);
    await new Promise((r) => setTimeout(r, 0));
    expect(firstSettled).toBe(true);
  });

  it('reports a curtain that has been down with nothing running', () => {
    const t = new Transitions();
    t.cover();
    for (let i = 0; i < 120; i++) t.update();
    expect(t.isCovered).toBe(true);
    expect(t.stuckFrames).toBeGreaterThanOrEqual(120);
    t.uncover();
    expect(t.isCovered).toBe(false);
    expect(t.stuckFrames).toBe(0);
  });
});
