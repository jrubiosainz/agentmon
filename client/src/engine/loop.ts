/** Fixed-timestep game loop locked to 60 logical frames per second. */

export const FPS = 60;
const STEP_MS = 1000 / FPS;
const MAX_CATCHUP = 5;

export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  /** Total logical frames elapsed - handy for animation phases. */
  frame = 0;
  /** Reports a crashed frame, so the game can show it instead of freezing. */
  onError: ((err: unknown) => void) | null = null;

  constructor(
    private readonly update: () => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      let delta = now - this.last;
      this.last = now;
      // A backgrounded tab can produce huge deltas; don't try to catch all up.
      if (delta > 250) delta = STEP_MS;
      this.acc += delta;

      let steps = 0;
      while (this.acc >= STEP_MS && steps < MAX_CATCHUP) {
        this.acc -= STEP_MS;
        this.frame++;
        // A throwing update must never take the renderer down with it.
        // Otherwise the canvas freezes on the last frame drawn - typically a
        // black transition curtain - and the player has no way to recover.
        try {
          this.update();
        } catch (err) {
          this.acc = 0;
          this.onError?.(err);
          break;
        }
        steps++;
      }
      if (steps === MAX_CATCHUP) this.acc = 0;
      try {
        this.render();
      } catch (err) {
        this.onError?.(err);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
