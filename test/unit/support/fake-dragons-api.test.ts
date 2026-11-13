import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/api/errors.js';
import { decodeAd } from '../../../src/services/ad.service.js';
import type { RawAd } from '../../../src/models/types.js';
import { FakeDragonsApi, type FakeOptions } from '../../support/fake-dragons-api.js';

describe('FakeDragonsApi', () => {
  it('starts with 3 lives and a mix of plain, encrypted and trap ads', async () => {
    const api = new FakeDragonsApi({ seed: 3 });
    const state = await api.startGame();
    expect(state.lives).toBe(3);
    const ads = await api.getMessages(state.gameId);
    expect(ads.length).toBe(7);
    expect(ads.map(decodeAd).some((ad) => /super awesome/.test(ad.message))).toBe(true);
  });

  it('is deterministic for a given seed', async () => {
    const a = new FakeDragonsApi({ seed: 9 });
    const b = new FakeDragonsApi({ seed: 9 });
    await a.startGame();
    await b.startGame();
    expect(await a.getMessages('fake-game')).toEqual(await b.getMessages('fake-game'));
  });

  it('awards gold and score for a successful solve and advances the turn', async () => {
    const api = new FakeDragonsApi({ seed: 1, successRateOverride: 1 });
    await api.startGame();
    const ad = (await api.getMessages('fake-game'))[0];
    if (!ad) throw new Error('expected at least one ad');
    const result = await api.solve('fake-game', trueId(ad));
    expect(result.success).toBe(true);
    expect(result.gold).toBe(ad.reward);
    expect(result.score).toBe(ad.reward);
    expect(result.turn).toBe(1);
  });

  it('costs a life for a failed solve', async () => {
    const api = new FakeDragonsApi({ seed: 1, successRateOverride: 0 });
    await api.startGame();
    const ad = (await api.getMessages('fake-game'))[0];
    if (!ad) throw new Error('expected at least one ad');
    const result = await api.solve('fake-game', trueId(ad));
    expect(result.success).toBe(false);
    expect(result.lives).toBe(2);
  });

  it('rejects the encoded id of an encrypted ad with a 400, like the live API', async () => {
    const api = await startedFake({ seed: 3, successRateOverride: 1 });
    const encrypted = (await api.getMessages('fake-game')).find((ad) => ad.encrypted !== null);
    if (!encrypted) throw new Error('expected an encrypted ad');
    expect(encrypted.adId).not.toBe(trueId(encrypted));
    const error = await api.solve('fake-game', encrypted.adId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'Bad Request', status: 400, retryable: false });
    expect(api.snapshot().turn).toBe(0);
    const result = await api.solve('fake-game', trueId(encrypted));
    expect(result.turn).toBe(1);
  });

  it('encodes the public id with the same scheme as the other fields', async () => {
    const api = await startedFake({ seed: 11 });
    for (const ad of await api.getMessages('fake-game')) {
      if (ad.encrypted === 1) expect(ad.adId).toMatch(/^[A-Za-z0-9+/]{11}=$/);
      if (ad.encrypted === null) expect(ad.adId).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });

  it('rejects unknown ads with a non-retryable 404', async () => {
    const api = new FakeDragonsApi();
    await api.startGame();
    const error = await api.solve('fake-game', 'nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, retryable: false });
  });

  it('refuses a purchase it cannot afford but still advances the turn', async () => {
    const api = new FakeDragonsApi();
    await api.startGame();
    const result = await api.buy('fake-game', 'hpot');
    expect(result).toMatchObject({ shoppingSuccess: false, gold: 0, turn: 1 });
  });

  const trueId = (ad: RawAd): string => decodeAd(ad).adId;
  const isTrapRaw = (ad: RawAd): boolean => /super awesome/.test(decodeAd(ad).message);

  async function startedFake(options: FakeOptions = {}): Promise<FakeDragonsApi> {
    const api = new FakeDragonsApi(options);
    await api.startGame();
    return api;
  }

  async function firstNonTrap(api: FakeDragonsApi): Promise<RawAd> {
    const ad = (await api.getMessages('fake-game')).find((candidate) => !isTrapRaw(candidate));
    if (!ad) throw new Error('expected a non-trap ad');
    return ad;
  }

  describe('game over', () => {
    it('stops accepting solve and buy once lives hit 0 and never goes negative', async () => {
      const api = await startedFake({ seed: 1, successRateOverride: 0, lives: 1 });
      const ad = await firstNonTrap(api);
      const result = await api.solve('fake-game', trueId(ad));
      expect(result.lives).toBe(0);

      const next = (await api.getMessages('fake-game'))[0];
      if (!next) throw new Error('expected an ad');
      const solveError = await api.solve('fake-game', trueId(next)).catch((e: unknown) => e);
      expect(solveError).toBeInstanceOf(ApiError);
      expect(solveError).toMatchObject({ status: 400, retryable: false });
      const buyError = await api.buy('fake-game', 'hpot').catch((e: unknown) => e);
      expect(buyError).toBeInstanceOf(ApiError);
      expect(buyError).toMatchObject({ status: 400, retryable: false });
      expect(api.snapshot().lives).toBe(0);
    });

    it('keeps getMessages and getShop working after game over', async () => {
      const api = await startedFake({ successRateOverride: 0, lives: 1 });
      await api.solve('fake-game', trueId(await firstNonTrap(api)));
      expect((await api.getMessages('fake-game')).length).toBe(7);
      expect((await api.getShop('fake-game')).length).toBe(3);
    });
  });

  describe('ad generation', () => {
    it('always yields decodable, well-formed ads and both encryption kinds', async () => {
      const kinds = new Set<number | null>();
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const api = await startedFake({ seed });
        for (const raw of await api.getMessages('fake-game')) {
          kinds.add(raw.encrypted);
          const ad = decodeAd(raw);
          expect(ad.message).toMatch(/^(Help Person|Steal super awesome)/);
        }
      }
      expect(kinds.has(1)).toBe(true);
      expect(kinds.has(2)).toBe(true);
    });

    it('produces unique 8-character decoded ad ids across refreshes', async () => {
      const api = await startedFake({ successRateOverride: 1 });
      const seen = new Set<string>();
      for (let i = 0; i < 4; i++) {
        const ads = await api.getMessages('fake-game');
        for (const ad of ads) {
          const id = trueId(ad);
          expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
        await api.solve('fake-game', trueId(await firstNonTrap(api)));
      }
    });

    it('is deterministic for a solve-then-getMessages sequence', async () => {
      const run = async (): Promise<RawAd[]> => {
        const api = await startedFake({ seed: 5 });
        const first = (await api.getMessages('fake-game'))[0];
        await api.solve('fake-game', first ? trueId(first) : '');
        return api.getMessages('fake-game');
      };
      expect(await run()).toEqual(await run());
    });

    it('does not let solve outcomes influence generated ads', async () => {
      const a = await startedFake({ seed: 4, successRateOverride: 0 });
      const b = await startedFake({ seed: 4, successRateOverride: 1 });
      const adId = trueId(await firstNonTrap(a));
      await a.solve('fake-game', adId);
      await b.solve('fake-game', adId);
      expect(await a.getMessages('fake-game')).toEqual(await b.getMessages('fake-game'));
    });
  });

  describe('shop', () => {
    async function richFake(): Promise<FakeDragonsApi> {
      const api = await startedFake({ successRateOverride: 1 });
      while (api.snapshot().gold < 700) {
        await api.solve('fake-game', trueId(await firstNonTrap(api)));
      }
      return api;
    }

    it('hpot adds a life and keeps level; cs and ch raise level and keep lives', async () => {
      const api = await richFake();
      const before = api.snapshot();
      const hpot = await api.buy('fake-game', 'hpot');
      expect(hpot).toMatchObject({
        shoppingSuccess: true,
        lives: before.lives + 1,
        level: before.level,
      });
      expect(hpot.gold).toBe(before.gold - 50);
      const cs = await api.buy('fake-game', 'cs');
      expect(cs).toMatchObject({ lives: before.lives + 1, level: before.level + 1 });
      expect(cs.gold).toBe(before.gold - 150);
      const ch = await api.buy('fake-game', 'ch');
      expect(ch).toMatchObject({ lives: before.lives + 1, level: before.level + 2 });
      expect(ch.gold).toBe(before.gold - 450);
      expect(api.purchases).toEqual(['hpot', 'cs', 'ch']);
    });

    it('leaves state unchanged and unrecorded for an unaffordable purchase', async () => {
      const api = await startedFake();
      const before = api.snapshot();
      const result = await api.buy('fake-game', 'ch');
      expect(result).toMatchObject({
        shoppingSuccess: false,
        gold: before.gold,
        lives: before.lives,
        level: before.level,
      });
      expect(api.purchases).toEqual([]);
    });
  });

  it('fails the trap ad and counts it, even with a success override of 1', async () => {
    const api = await startedFake({ seed: 2, successRateOverride: 1 });
    const trap = (await api.getMessages('fake-game')).find(isTrapRaw);
    if (!trap) throw new Error('expected a trap ad');
    const result = await api.solve('fake-game', trueId(trap));
    expect(result.success).toBe(false);
    expect(api.trapsSolved).toBe(1);
  });

  it('rejects an unknown game id with a 404 on every endpoint', async () => {
    const api = await startedFake();
    const errors = await Promise.all([
      api.getMessages('other').catch((e: unknown) => e),
      api.getShop('other').catch((e: unknown) => e),
      api.solve('other', 'ABCDEFGH').catch((e: unknown) => e),
      api.buy('other', 'hpot').catch((e: unknown) => e),
    ]);
    for (const error of errors) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 404 });
    }
  });

  it('serves a trap-only board on every k-th refresh, never the first', async () => {
    const api = new FakeDragonsApi({ seed: 2, trapBoardEvery: 2, successRateOverride: 1 });
    await api.startGame();
    const allTraps: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const ads = (await api.getMessages('fake-game')).map(decodeAd);
      allTraps.push(ads.length === 7 && ads.every((ad) => /super awesome/.test(ad.message)));
      const first = ads[0];
      if (!first) throw new Error('expected an ad');
      await api.solve('fake-game', first.adId);
    }
    // refresh 0 normal, 1 normal, 2 traps, 3 normal, 4 traps, 5 normal
    expect(allTraps).toEqual([false, false, true, false, true, false]);
  });

  it('reflects startGold in the start state', async () => {
    const api = new FakeDragonsApi({ seed: 1, startGold: 500 });
    expect((await api.startGame()).gold).toBe(500);
  });
});
