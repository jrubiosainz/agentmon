/** Async asset loading with progress reporting. */

export interface SheetMeta {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { row: number; frames: number }>;
  [k: string]: unknown;
}

export interface GridMeta {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  index: Record<string, number>;
}

type Task = { key: string; run: () => Promise<void> };

export class Assets {
  private images = new Map<string, HTMLImageElement>();
  private json = new Map<string, unknown>();
  private tasks: Task[] = [];
  private failed = new Set<string>();

  base = import.meta.env.BASE_URL ?? '/';

  private url(path: string): string {
    const b = this.base.endsWith('/') ? this.base : `${this.base}/`;
    return `${b}${path.replace(/^\//, '')}`;
  }

  queueImage(key: string, path: string, optional = false): this {
    this.tasks.push({
      key,
      run: async () => {
        try {
          this.images.set(key, await loadImage(this.url(path)));
        } catch (err) {
          if (!optional) throw err;
          this.failed.add(key);
        }
      },
    });
    return this;
  }

  queueJson(key: string, path: string, optional = false): this {
    this.tasks.push({
      key,
      run: async () => {
        try {
          const res = await fetch(this.url(path));
          if (!res.ok) throw new Error(`${res.status} ${path}`);
          this.json.set(key, await res.json());
        } catch (err) {
          if (!optional) throw err;
          this.failed.add(key);
        }
      },
    });
    return this;
  }

  /** Queue a sprite sheet: `<name>.png` + `<name>.json`. */
  queueSheet(key: string, path: string, optional = false): this {
    return this.queueImage(key, `${path}.png`, optional).queueJson(`${key}:meta`, `${path}.json`, optional);
  }

  get pending(): number {
    return this.tasks.length;
  }

  async loadAll(onProgress?: (done: number, total: number) => void): Promise<void> {
    const total = this.tasks.length;
    let done = 0;
    const queue = this.tasks;
    this.tasks = [];

    const CONCURRENCY = 8;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= queue.length) return;
        await queue[i]!.run();
        done++;
        onProgress?.(done, total);
      }
    });
    await Promise.all(workers);
  }

  image(key: string): HTMLImageElement | null {
    return this.images.get(key) ?? null;
  }

  requireImage(key: string): HTMLImageElement {
    const img = this.images.get(key);
    if (!img) throw new Error(`Missing image asset: ${key}`);
    return img;
  }

  data<T>(key: string): T | null {
    return (this.json.get(key) as T) ?? null;
  }

  has(key: string): boolean {
    return this.images.has(key) || this.json.has(key);
  }

  sheetMeta(key: string): SheetMeta | null {
    return this.data<SheetMeta>(`${key}:meta`);
  }

  put(key: string, img: HTMLImageElement | HTMLCanvasElement): void {
    this.images.set(key, img as HTMLImageElement);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
}

export const assets = new Assets();
