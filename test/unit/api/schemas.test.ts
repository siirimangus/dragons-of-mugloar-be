import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/api/errors.js';
import {
  parseMessages,
  parsePurchaseResult,
  parseShop,
  parseSolveResult,
  parseStartGame,
} from '../../../src/api/schemas.js';
import { loadFixture } from '../../support/fixtures.js';

describe('parseStartGame', () => {
  it('parses a real response', () => {
    const state = parseStartGame(loadFixture('start-game.json'));
    expect(state.lives).toBe(3);
    expect(typeof state.gameId).toBe('string');
    expect(state.turn).toBe(0);
  });

  it('rejects a missing gameId', () => {
    expect(() =>
      parseStartGame({ lives: 3, gold: 0, level: 0, score: 0, highScore: 0, turn: 0 }),
    ).toThrow(ValidationError);
  });

  it('rejects a non-numeric field', () => {
    expect(() =>
      parseStartGame({
        gameId: 'a',
        lives: 'three',
        gold: 0,
        level: 0,
        score: 0,
        highScore: 0,
        turn: 0,
      }),
    ).toThrow(ValidationError);
  });
});

describe('parseMessages', () => {
  it('parses plain, Base64 and ROT13 ads from real responses', () => {
    for (const name of [
      'messages-plain.json',
      'messages-encrypted-1.json',
      'messages-encrypted-2.synthetic.json',
    ]) {
      const ads = parseMessages(loadFixture(name));
      expect(ads.length).toBeGreaterThan(0);
      for (const ad of ads) {
        expect(typeof ad.reward).toBe('number');
      }
    }
  });

  it('keeps the encryption kind of each fixture', () => {
    const expected = [
      ['messages-plain.json', null],
      ['messages-encrypted-1.json', 1],
      ['messages-encrypted-2.synthetic.json', 2],
    ] as const;
    for (const [name, kind] of expected) {
      const ads = parseMessages(loadFixture(name));
      expect(ads.length).toBeGreaterThan(0);
      for (const ad of ads) {
        expect(ad.encrypted).toBe(kind);
      }
    }
  });

  it('accepts a reward given as a numeric string', () => {
    const ads = parseMessages([
      {
        adId: 'a',
        message: 'm',
        reward: '12',
        expiresIn: 3,
        encrypted: null,
        probability: 'Sure thing',
      },
    ]);
    expect(ads[0]?.reward).toBe(12);
  });

  it('treats a missing encrypted field as null', () => {
    const ads = parseMessages([
      { adId: 'a', message: 'm', reward: 1, expiresIn: 3, probability: 'Risky' },
    ]);
    expect(ads[0]?.encrypted).toBeNull();
  });

  it('rejects an unknown encrypted value', () => {
    expect(() =>
      parseMessages([
        { adId: 'a', message: 'm', reward: 1, expiresIn: 3, encrypted: 3, probability: 'x' },
      ]),
    ).toThrow(ValidationError);
  });

  it('rejects a non-array body', () => {
    expect(() => parseMessages({ ads: [] })).toThrow(ValidationError);
  });
});

describe('parseShop', () => {
  it('parses a real response', () => {
    const items = parseShop(loadFixture('shop.json'));
    expect(items.some((item) => item.id === 'hpot' && item.cost === 50)).toBe(true);
  });

  it('rejects an item without a cost', () => {
    expect(() => parseShop([{ id: 'x', name: 'X' }])).toThrow(ValidationError);
  });
});

describe('parseSolveResult', () => {
  it('parses a real response', () => {
    const result = parseSolveResult(loadFixture('solve-result.json'));
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('rejects a missing success flag', () => {
    expect(() =>
      parseSolveResult({ lives: 3, gold: 0, score: 0, highScore: 0, turn: 1, message: 'x' }),
    ).toThrow(ValidationError);
  });
});

describe('parsePurchaseResult', () => {
  it('parses a real response', () => {
    const result = parsePurchaseResult(loadFixture('purchase-result.json'));
    expect(result).toEqual({ shoppingSuccess: true, gold: 229, lives: 3, level: 0, turn: 11 });
  });

  it('accepts shoppingSuccess given as a string', () => {
    const result = parsePurchaseResult({
      shoppingSuccess: 'false',
      gold: 1,
      lives: 1,
      level: 0,
      turn: 2,
    });
    expect(result.shoppingSuccess).toBe(false);
  });
});
