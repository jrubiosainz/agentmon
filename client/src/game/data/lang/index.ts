/**
 * Catalogue registry.
 *
 * Every catalogue maps an English source string to its translation. The master
 * key list is produced by `node tools/i18n-scan.mjs`, so a string that leaves
 * the source leaves the catalogues too.
 *
 * The catalogues are JSON on purpose: they are machine-generated and machine-
 * checked, and JSON keeps them free of TypeScript quoting hazards.
 *
 * They are also **loaded on demand**. Four full catalogues are ~220 kB of raw
 * JSON, and a player only ever reads one of them, so importing them statically
 * would double the download for everybody. `import()` makes Vite emit one chunk
 * per language; `t()` falls back to English until the chunk lands.
 *
 * English is intentionally empty: `t()` short-circuits before ever looking a
 * key up, which keeps the default language allocation-free.
 */

export type Catalogue = Record<string, string>;

const LOADERS: Record<string, () => Promise<{ default: Catalogue }>> = {
  es: () => import('./es.json'),
  fr: () => import('./fr.json'),
  it: () => import('./it.json'),
  ja: () => import('./ja.json'),
};

/** Catalogues that have finished loading, keyed by language code. */
export const CATALOGUES: Record<string, Catalogue> = { en: {} };

const inflight = new Map<string, Promise<Catalogue>>();

/**
 * Fetch a catalogue, memoised. Resolves immediately for a language that is
 * already resident (including `en`, which is empty by design).
 */
export function loadCatalogue(lang: string): Promise<Catalogue> {
  const resident = CATALOGUES[lang];
  if (resident) return Promise.resolve(resident);
  const load = LOADERS[lang];
  if (!load) return Promise.resolve({});
  let pending = inflight.get(lang);
  if (!pending) {
    pending = load()
      .then((mod) => {
        const cat = mod.default;
        CATALOGUES[lang] = cat;
        return cat;
      })
      .catch(() => ({}));
    inflight.set(lang, pending);
  }
  return pending;
}
