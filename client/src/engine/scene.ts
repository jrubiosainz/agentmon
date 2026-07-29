/** Scene stack: the active scene updates and renders; scenes below can still draw. */

import type { Game } from '../game/game.ts';

export abstract class Scene {
  protected game!: Game;
  /** When true, the scene below is still rendered underneath (menus, dialogs). */
  transparent = false;

  attach(game: Game): void {
    this.game = game;
  }

  /** Called when the scene becomes active (also after a scene above it pops). */
  enter(_payload?: unknown): void | Promise<void> {}
  /** Called when the scene is removed from the stack. */
  exit(): void {}
  /** Called when another scene is pushed on top. */
  pause(): void {}
  /** Called when the scene above is popped. */
  resume(_result?: unknown): void {}

  abstract update(): void;
  abstract render(g: CanvasRenderingContext2D): void;
}

export class SceneStack {
  private stack: Scene[] = [];

  constructor(private readonly game: Game) {}

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  find<T extends Scene>(ctor: new (...args: never[]) => T): T | undefined {
    return this.stack.find((s) => s instanceof ctor) as T | undefined;
  }

  async push(scene: Scene, payload?: unknown): Promise<void> {
    this.top?.pause();
    scene.attach(this.game);
    this.stack.push(scene);
    await scene.enter(payload);
  }

  pop(result?: unknown): void {
    const scene = this.stack.pop();
    scene?.exit();
    this.top?.resume(result);
  }

  /** Replace the whole stack with a single scene. */
  async replace(scene: Scene, payload?: unknown): Promise<void> {
    while (this.stack.length) this.stack.pop()?.exit();
    scene.attach(this.game);
    this.stack.push(scene);
    await scene.enter(payload);
  }

  /** Pop scenes until `scene` is on top (exclusive of it). */
  popTo(scene: Scene, result?: unknown): void {
    while (this.stack.length > 1 && this.top !== scene) this.stack.pop()?.exit();
    this.top?.resume(result);
  }

  update(): void {
    this.top?.update();
  }

  render(g: CanvasRenderingContext2D): void {
    // Find the deepest scene that must be drawn (walk back over transparent ones).
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start]!.transparent) start--;
    for (let i = start; i < this.stack.length; i++) this.stack[i]!.render(g);
  }
}
