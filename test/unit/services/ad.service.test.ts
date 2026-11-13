import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../../src/config/tuning.js';
import { parseMessages } from '../../../src/api/schemas.js';
import { decodeAd, decodeAds, isTrap, rankAds, scoreAd } from '../../../src/services/ad.service.js';
import type { RawAd } from '../../../src/models/types.js';
import type { Logger } from '../../../src/utils/logger.js';
import { makeAd } from '../../support/builders.js';
import { loadFixture } from '../../support/fixtures.js';
import { TEST_TUNING } from '../../support/test-tuning.js';

const rawAd = (overrides: Partial<RawAd> = {}): RawAd => ({
  adId: 'a1',
  message: 'Help Someone to fix their wagon',
  reward: 50,
  expiresIn: 7,
  encrypted: null,
  probability: 'Sure thing',
  ...overrides,
});

function capturingLogger() {
  const warnings: { message: string; meta: unknown }[] = [];
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message, meta) => void warnings.push({ message, meta }),
    error: () => undefined,
  };
  return { logger, warnings };
}

describe('decodeAd', () => {
  it('keeps plain ads unchanged and drops the encrypted flag', () => {
    expect(decodeAd(rawAd())).toEqual(makeAd());
  });

  it('decodes Base64 message and probability', () => {
    const ad = decodeAd(
      rawAd({
        encrypted: 1,
        adId: 'VzF5cmNycGk=',
        message: Buffer.from('Help Someone to fix their wagon').toString('base64'),
        probability: 'Umlza3k=',
      }),
    );
    expect(ad.adId).toBe('W1yrcrpi');
    expect(ad.message).toBe('Help Someone to fix their wagon');
    expect(ad.probability).toBe('Risky');
  });

  it('decodes ROT13 message and probability', () => {
    const ad = decodeAd(
      rawAd({ encrypted: 2, adId: 'W1yrcrpi', message: 'Uryc Fbzrbar', probability: 'Vzcbffvoyr' }),
    );
    expect(ad.adId).toBe('J1lepecv');
    expect(ad.message).toBe('Help Someone');
    expect(ad.probability).toBe('Impossible');
  });

  it('decodes every real encrypted fixture to a label the tuning table knows', () => {
    for (const name of ['messages-encrypted-1.json', 'messages-encrypted-2.synthetic.json']) {
      const ads = parseMessages(loadFixture(name)).map(decodeAd);
      for (const ad of ads) {
        expect(ad.adId).toMatch(name === 'messages-encrypted-1.json' ? /^[A-Za-z0-9]{8}$/ : /^.+$/);
        expect(Object.keys(DEFAULT_TUNING.labelProbability)).toContain(ad.probability);
      }
    }
  });
});

describe('decodeAds', () => {
  it('keeps the id of plain ads', () => {
    expect(decodeAd(rawAd({ adId: 'Plain123' })).adId).toBe('Plain123');
  });

  it('drops an encrypted ad whose adId is not valid Base64', () => {
    const { logger, warnings } = capturingLogger();
    const message = Buffer.from('Help Someone').toString('base64');
    const ads = decodeAds(
      [rawAd({ adId: 'not base64!', encrypted: 1, message, probability: 'Umlza3k=' })],
      logger,
    );
    expect(ads).toEqual([]);
    expect(warnings[0]?.meta).toEqual({ adId: 'not base64!', reason: expect.any(String) });
  });

  it('drops undecodable ads with a warning instead of throwing', () => {
    const { logger, warnings } = capturingLogger();
    const ads = decodeAds(
      [rawAd({ adId: 'good' }), rawAd({ adId: 'bad', encrypted: 1, message: 'not base64!' })],
      logger,
    );
    expect(ads.map((ad) => ad.adId)).toEqual(['good']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.meta).toEqual({ adId: 'bad', reason: expect.any(String) });
  });

  it('rethrows errors that are not DecodeErrors', () => {
    const { logger } = capturingLogger();
    const broken = rawAd();
    Object.defineProperty(broken, 'message', {
      get: () => {
        throw new TypeError('boom');
      },
    });
    expect(() => decodeAds([broken], logger)).toThrow(TypeError);
  });
});

describe('isTrap', () => {
  it.each([
    'Steal super awesome diamond pot from Melita Langdon',
    'Steal super awesome diamond house from Valentine Sherman',
  ])('flags "%s"', (message) => {
    expect(isTrap(makeAd({ message }), TEST_TUNING)).toBe(true);
  });

  it('flags a trap with irregular whitespace', () => {
    expect(
      isTrap(makeAd({ message: 'Steal super   awesome diamond pot from X' }), TEST_TUNING),
    ).toBe(true);
  });

  it('is not fooled by stateful global regexes', () => {
    const tuning = { ...TEST_TUNING, trapPatterns: [/super awesome/gi] };
    const ad = makeAd({ message: 'Steal super awesome diamond pot from X' });
    expect([isTrap(ad, tuning), isTrap(ad, tuning), isTrap(ad, tuning)]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('flags a trap that arrived Base64-encrypted', () => {
    const message = Buffer.from('Steal super awesome diamond pot from X').toString('base64');
    const ad = decodeAd(
      rawAd({ encrypted: 1, adId: 'VzF5cmNycGk=', message, probability: 'U3VyZSB0aGluZw==' }),
    );
    expect(isTrap(ad, TEST_TUNING)).toBe(true);
  });

  it.each([
    'Steal bucket delivery to Mai Millhouse and share some of the profits with the people.',
    'Help defending meadow in Bloodmoore from the intruders',
  ])('does not flag "%s"', (message) => {
    expect(isTrap(makeAd({ message }), TEST_TUNING)).toBe(false);
  });
});

describe('scoreAd', () => {
  const tuning = {
    ...TEST_TUNING,
    labelProbability: { A: 0.5 },
    unknownLabelProbability: 0.1,
    lifeValue: 100,
  };

  it('is p*reward - (1-p)*lifeValue', () => {
    expect(scoreAd(makeAd({ probability: 'A', reward: 80 }), tuning)).toBeCloseTo(-10);
  });

  it('uses the unknown-label probability for labels it does not know', () => {
    expect(scoreAd(makeAd({ probability: 'Mystery', reward: 50 }), tuning)).toBeCloseTo(-85);
  });

  it('does not treat inherited object keys as labels', () => {
    expect(scoreAd(makeAd({ probability: 'constructor', reward: 50 }), tuning)).toBeCloseTo(-85);
  });
});

describe('rankAds', () => {
  it('sorts by expected value, best first', () => {
    const ranked = rankAds(
      [
        makeAd({ adId: 'risky', probability: 'Risky', reward: 80 }),
        makeAd({ adId: 'sure', probability: 'Sure thing', reward: 50 }),
        makeAd({ adId: 'cake', probability: 'Piece of cake', reward: 10 }),
      ],
      TEST_TUNING,
    );
    expect(ranked.map((entry) => entry.ad.adId)).toEqual(['sure', 'cake', 'risky']);
  });

  it('excludes traps even when they look best', () => {
    const ranked = rankAds(
      [
        makeAd({
          adId: 'trap',
          message: 'Steal super awesome diamond pot from X',
          probability: 'Piece of cake',
          reward: 170,
        }),
        makeAd({ adId: 'ok', probability: 'Quite likely', reward: 20 }),
      ],
      TEST_TUNING,
    );
    expect(ranked.map((entry) => entry.ad.adId)).toEqual(['ok']);
  });

  it('breaks score ties by higher reward', () => {
    const tuning = { ...TEST_TUNING, labelProbability: { A: 1, B: 0.5 }, lifeValue: 100 };
    const ranked = rankAds(
      [
        makeAd({ adId: 'low', probability: 'A', reward: 50 }),
        makeAd({ adId: 'high', probability: 'B', reward: 200 }),
      ],
      tuning,
    );
    expect(ranked.map((entry) => entry.score)).toEqual([50, 50]);
    expect(ranked.map((entry) => entry.ad.adId)).toEqual(['high', 'low']);
  });

  it('returns an empty list when there are no ads', () => {
    expect(rankAds([], TEST_TUNING)).toEqual([]);
  });
});
