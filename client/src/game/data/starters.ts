/**
 * The three prototype cores PROF. ADA offers, and what the rival answers with.
 *
 * Kept in a dependency-free module so the core bay, the lab script and the
 * data tests all read the same list - a species rename must not be able to
 * silently empty the starter selection.
 */

export const STARTER_KEYS = ['stackbit', 'reachlet', 'boltkin'] as const;

/**
 * The rival always walks off with the type that beats yours, so the first
 * fight is a real lesson in the type chart.
 */
export const RIVAL_COUNTER: Record<string, string> = {
  stackbit: 'boltkin',
  reachlet: 'stackbit',
  boltkin: 'reachlet',
};

export function rivalStarterFor(playerStarter: string): string {
  return RIVAL_COUNTER[playerStarter] ?? STARTER_KEYS[2];
}
