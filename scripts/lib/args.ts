import { parseArgs } from 'node:util';

export const SHOP_UPGRADE_IDS: readonly string[] = [
  'cs',
  'gas',
  'wax',
  'tricks',
  'wingpot',
  'ch',
  'rf',
  'iron',
  'mtrix',
  'wingpotmax',
];

export type CalibrateArgs = {
  readonly games: number;
  readonly concurrency: number;
  readonly target: number;
  readonly priority: string[] | undefined;
  readonly lifeValue: number | undefined;
  readonly healThreshold: number | undefined;
  readonly maxPotions: number | undefined;
};

/** Parses an optional numeric flag; returns undefined when unset, throws a readable Error when invalid. */
export function numberArg(
  name: string,
  raw: string | undefined,
  min: number,
  integer = false,
): number | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(
      `--${name} must be ${integer ? 'an integer' : 'a number'} >= ${min}, got "${raw}"`,
    );
  }
  return value;
}

function parsePriority(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  if (raw === '') throw new Error('--priority must not be empty (use "none" for no upgrades)');
  if (raw === 'none') return [];
  const ids = raw.split(',');
  for (const id of ids) {
    if (!SHOP_UPGRADE_IDS.includes(id)) {
      throw new Error(
        `--priority has unknown shop item "${id}" (known: ${SHOP_UPGRADE_IDS.join(',')})`,
      );
    }
  }
  return ids;
}

export function parseCalibrateArgs(argv: readonly string[]): CalibrateArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      games: { type: 'string' },
      concurrency: { type: 'string' },
      priority: { type: 'string' },
      'life-value': { type: 'string' },
      'heal-threshold': { type: 'string' },
      'max-potions': { type: 'string' },
      target: { type: 'string' },
    },
  });
  return {
    games: numberArg('games', values.games, 1, true) ?? 20,
    concurrency: numberArg('concurrency', values.concurrency, 1, true) ?? 4,
    target: numberArg('target', values.target, 0) ?? 1000,
    priority: parsePriority(values.priority),
    lifeValue: numberArg('life-value', values['life-value'], 0),
    healThreshold: numberArg('heal-threshold', values['heal-threshold'], 0, true),
    maxPotions: numberArg('max-potions', values['max-potions'], 0, true),
  };
}
