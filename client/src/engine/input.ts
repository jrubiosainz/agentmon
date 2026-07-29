/** Logical GBA buttons, mapped from keyboard, touch and gamepad. */

export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select', 'l', 'r'] as const;
export type Button = (typeof BUTTONS)[number];
export type Dir = 'up' | 'down' | 'left' | 'right';

const KEYMAP: Record<string, Button> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', Enter: 'a',
  KeyX: 'b', Backspace: 'b', Escape: 'b',
  ShiftLeft: 'start', ShiftRight: 'start',
  Tab: 'select',
  KeyQ: 'l', KeyE: 'r',
};

// Held-direction repeat, tuned to feel like GBA menus.
const REPEAT_DELAY = 15; // frames before auto-repeat kicks in
const REPEAT_RATE = 5;   // frames between repeats

export class Input {
  /** Buttons held via physical keyboard. */
  private keys = new Set<Button>();
  /** Buttons held via on-screen touch controls. */
  private touch = new Set<Button>();
  /** Merged state for the current and previous frame. */
  private now = new Set<Button>();
  private prev = new Set<Button>();
  private heldFrames = new Map<Button, number>();
  private interacted = false;

  onFirstInteraction: (() => void) | null = null;
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });
    this.bindTouch();
  }

  private markInteraction(): void {
    if (this.interacted) return;
    this.interacted = true;
    this.onFirstInteraction?.();
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    // The DOM auth overlay owns the keyboard while a field is focused.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const btn = KEYMAP[e.code];
    if (!btn) return;
    e.preventDefault();
    if (isDown) {
      this.markInteraction();
      this.keys.add(btn);
    } else {
      this.keys.delete(btn);
    }
  }

  private bindTouch(): void {
    const root = document.getElementById('touch-controls');
    if (!root) return;
    if (matchMedia('(hover: none) and (pointer: coarse)').matches) root.removeAttribute('hidden');

    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-btn]'))) {
      const btn = el.dataset.btn as Button;
      const press = (e: Event) => {
        e.preventDefault();
        this.markInteraction();
        this.touch.add(btn);
        el.classList.add('is-down');
      };
      const release = (e: Event) => {
        e.preventDefault();
        this.touch.delete(btn);
        el.classList.remove('is-down');
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  private readGamepad(out: Set<Button>): void {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const b = pad.buttons;
      const set = (i: number, btn: Button) => { if (b[i]?.pressed) { out.add(btn); this.markInteraction(); } };
      set(0, 'a'); set(1, 'b'); set(9, 'start'); set(8, 'select');
      set(12, 'up'); set(13, 'down'); set(14, 'left'); set(15, 'right');
      set(4, 'l'); set(5, 'r');
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (ax < -0.5) out.add('left');
      if (ax > 0.5) out.add('right');
      if (ay < -0.5) out.add('up');
      if (ay > 0.5) out.add('down');
    }
  }

  /** Rebuild the merged button state. Call once per frame before scene updates. */
  update(): void {
    this.prev = this.now;
    const merged = new Set<Button>(this.keys);
    for (const b of this.touch) merged.add(b);
    this.readGamepad(merged);
    this.now = merged;

    for (const b of BUTTONS) {
      this.heldFrames.set(b, merged.has(b) ? (this.heldFrames.get(b) ?? 0) + 1 : 0);
    }
  }

  held(b: Button): boolean {
    return this.enabled && this.now.has(b);
  }

  /** True only on the frame the button went down. */
  pressed(b: Button): boolean {
    return this.enabled && this.now.has(b) && !this.prev.has(b);
  }

  released(b: Button): boolean {
    return this.enabled && !this.now.has(b) && this.prev.has(b);
  }

  /** Pressed, or auto-repeating while held - for menu navigation. */
  repeat(b: Button): boolean {
    if (!this.enabled) return false;
    const n = this.heldFrames.get(b) ?? 0;
    if (n === 1) return true;
    return n > REPEAT_DELAY && (n - REPEAT_DELAY) % REPEAT_RATE === 0;
  }

  anyPressed(): boolean {
    return this.enabled && BUTTONS.some((b) => this.pressed(b));
  }

  /** Current 4-way direction from the d-pad, or null. */
  direction(): Dir | null {
    if (this.held('up')) return 'up';
    if (this.held('down')) return 'down';
    if (this.held('left')) return 'left';
    if (this.held('right')) return 'right';
    return null;
  }

  /** Forget everything - used when a scene takes or relinquishes control. */
  clear(): void {
    this.keys.clear();
    this.touch.clear();
    this.now = new Set();
    this.prev = new Set();
    this.heldFrames.clear();
  }
}
