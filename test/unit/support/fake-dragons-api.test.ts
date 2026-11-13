import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/api/errors.js';
import { decodeAd } from '../../../src/services/ad.service.js';
import { FakeDragonsApi } from '../../support/fake-dragons-api.js';

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
    const result = await api.solve('fake-game', ad.adId);
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
    const result = await api.solve('fake-game', ad.adId);
    expect(result.success).toBe(false);
    expect(result.lives).toBe(2);
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
});
