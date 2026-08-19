/**
 * Translation runtime.
 *
 * Keys *are* the English source strings. That was a deliberate trade: a game
 * this size has well over a thousand literals scattered across scenes, and
 * inventing a key for each one is both a huge diff and a permanent source of
 * drift. Using the English text means a missing translation degrades to
 * perfectly good English instead of showing `menu.battle.fight_label`.
 *
 * Interpolation uses named `{placeholders}` so translators can reorder them,
 * which Romance languages and Japanese both need constantly.
 */

import { CATALOGUES, loadCatalogue } from './data/lang/index.ts';

export const LANGS = [
  { code: 'en', native: 'ENGLISH', locale: 'en-US' },
  { code: 'es', native: 'ESPA\u00d1OL', locale: 'es-ES' },
  { code: 'fr', native: 'FRAN\u00c7AIS', locale: 'fr-FR' },
  { code: 'it', native: 'ITALIANO', locale: 'it-IT' },
  { code: 'ja', native: '\u306b\u307b\u3093\u3054', locale: 'ja-JP' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];

export const LANG_CODES = LANGS.map((l) => l.code);

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANG_CODES as readonly string[]).includes(value);
}

const STORAGE_KEY = 'agentmon.lang';

/**
 * Keys the catalogue had no entry for. The verification harness reads this to
 * prove a language is actually complete rather than quietly falling back.
 */
export const missingKeys = new Set<string>();

let current: Lang = 'en';
let table: Record<string, string> = {};
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // Private mode or a locked-down browser: fall through to the navigator.
  }
  const tags = typeof navigator === 'undefined'
    ? []
    : [navigator.language ?? '', ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const base = tag.slice(0, 2).toLowerCase();
    if (isLang(base)) return base;
  }
  return 'en';
}

export function getLang(): Lang {
  return current;
}

export function langMeta(code: Lang): (typeof LANGS)[number] {
  return LANGS.find((l) => l.code === code) ?? LANGS[0];
}

/**
 * Switch language. Catalogues are code-split, so a language whose chunk has not
 * arrived yet renders in English for a tick and repaints (listeners fire again)
 * the moment it lands. `t()` never blocks and never throws.
 */
export function setLang(next: Lang, persist = true): void {
  if (!isLang(next)) return;
  current = next;
  table = CATALOGUES[next] ?? {};
  missingKeys.clear();
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the language still applies for this session.
    }
  }
  for (const fn of listeners) fn();
  if (CATALOGUES[next]) return;
  void loadCatalogue(next).then((cat) => {
    if (current !== next) return;
    table = cat;
    // Everything looked up during the wait fell back to English; those are not
    // real gaps, so do not leave them behind for the harness to trip over.
    missingKeys.clear();
    for (const fn of listeners) fn();
  });
}

/** Resolves once the active language's catalogue is resident. */
export function whenReady(): Promise<void> {
  return loadCatalogue(current).then(() => undefined);
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const PLACEHOLDER = /\{(\w+)\}/g;

export type TParams = Record<string, string | number>;

function fill(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Translate. `key` is the English source string; `params` fills `{named}`
 * placeholders. Unknown keys pass through untouched so English always works.
 */
export function t(key: string, params?: TParams): string {
  if (current === 'en' || key === '') return fill(key, params);
  const hit = table[key];
  if (hit === undefined) {
    missingKeys.add(key);
    return fill(key, params);
  }
  return fill(hit, params);
}

/** Translate and uppercase, except in Japanese where case is meaningless. */
export function tUpper(key: string, params?: TParams): string {
  const text = t(key, params);
  return current === 'ja' ? text : text.toUpperCase();
}

/**
 * Uppercase an already-translated string. Use this instead of `tUpper()` on the
 * output of a localising accessor (`typeName`, `moveName`, `genusOf`, ...) —
 * passing translated text back through `t()` would register a bogus miss.
 */
export function upper(text: string): string {
  return current === 'ja' ? text : text.toUpperCase();
}

/** Thousands separators follow the active language. */
export function formatNumber(n: number): string {
  try {
    return n.toLocaleString(langMeta(current).locale);
  } catch {
    return String(n);
  }
}

/**
 * True when the active script has no spaces and no case, which a few layout
 * decisions (menu column widths, name truncation) need to know about.
 */
export function isCjk(): boolean {
  return current === 'ja';
}

setLang(detect(), false);
