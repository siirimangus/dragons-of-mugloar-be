import { mkdir, writeFile } from 'node:fs/promises';
import { decodeField } from '../src/utils/decode.js';

type AdJson = {
  adId: string;
  message: string;
  reward: number;
  expiresIn: number;
  encrypted: 1 | 2 | null;
  probability: string;
};
type GameJson = { gameId: string; lives: number };
type SolveJson = { lives: number };

const BASE = 'https://dragonsofmugloar.com/api/v2';
const OUT = new URL('../test/fixtures/', import.meta.url);
const KNOWN_LABELS = new Set([
  'Piece of cake',
  'Walk in the park',
  'Sure thing',
  'Quite likely',
  'Hmmm....',
  'Gamble',
  'Risky',
  'Rather detrimental',
  'Playing with fire',
  'Suicide mission',
  'Impossible',
]);

async function call<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { method });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
  return (await response.json()) as T;
}

async function save(name: string, data: unknown): Promise<void> {
  await writeFile(new URL(name, OUT), `${JSON.stringify(data, null, 2)}\n`);
}

await mkdir(OUT, { recursive: true });

let game = await call<GameJson>('POST', '/game/start');
await save('start-game.json', game);
await save('shop.json', await call<unknown>('GET', `/${game.gameId}/shop`));

const encrypted: Record<1 | 2, AdJson[]> = { 1: [], 2: [] };
let savedPlain = false;
let savedSolve = false;

for (let turn = 0; turn < 400 && (encrypted[1].length < 3 || encrypted[2].length < 3); turn++) {
  const ads = await call<AdJson[]>('GET', `/${game.gameId}/messages`);
  const plain = ads.filter((ad) => ad.encrypted === null);
  if (!savedPlain && plain.length > 0) {
    await save('messages-plain.json', plain);
    savedPlain = true;
  }
  for (const ad of ads) {
    if (ad.encrypted !== null && encrypted[ad.encrypted].length < 3)
      encrypted[ad.encrypted].push(ad);
  }
  const target = ads[0];
  if (!target) throw new Error('The API returned no ads');
  const result = await call<SolveJson>('POST', `/${game.gameId}/solve/${target.adId}`);
  if (!savedSolve) {
    await save('solve-result.json', result);
    savedSolve = true;
  }
  if (result.lives <= 0) game = await call<GameJson>('POST', '/game/start');
}

if (!savedPlain) throw new Error('Never saw a plain ad');

for (const kind of [1, 2] as const) {
  if (encrypted[kind].length === 0) {
    // Encrypted ads are rare; only kind 1 is required (kind 2 has not been seen in ~400 turns).
    if (kind === 1) throw new Error('Never saw an ad with encrypted=1');
    console.warn(
      `Never saw an ad with encrypted=${kind}; skipping messages-encrypted-${kind}.json`,
    );
    continue;
  }
  for (const ad of encrypted[kind]) {
    const label = decodeField(ad.probability, kind);
    if (!KNOWN_LABELS.has(label)) {
      throw new Error(
        `encrypted=${kind} did not decode to a known label: "${ad.probability}" -> "${label}". ` +
          'The Base64/ROT13 mapping in src/utils/decode.ts decodeField is probably swapped.',
      );
    }
    decodeField(ad.message, kind);
  }
  await save(`messages-encrypted-${kind}.json`, encrypted[kind]);
}

console.log('Fixtures recorded in test/fixtures');
