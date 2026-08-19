import { setLang } from '../src/game/i18n';

// i18n.ts auto-detects the language at import time, and under Node 22
// `navigator.language` reflects the developer's OS locale. Without this the
// suite would pass on an English machine and fail on a Spanish one purely
// because the battle log came back translated. Assertions are written against
// the English source strings, so pin the language here for every spec.
setLang('en', false);
