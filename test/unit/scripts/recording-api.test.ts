import { describe, expect, it } from 'vitest';
import { RecordingApi } from '../../../scripts/lib/recording-api.js';
import type { DragonsApi } from '../../../src/api/dragons-api.js';
import type { RawAd, ShopItem } from '../../../src/models/types.js';

const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

const encryptedAd: RawAd = {
  adId: b64('ad-1'),
  message: b64('Help someone'),
  reward: 120,
  expiresIn: 5,
  encrypted: 1,
  probability: b64('Piece of cake'),
};

function fakeApi(shops: ShopItem[][]): DragonsApi {
  let shopCall = 0;
  return {
    startGame: async () => ({
      gameId: 'g',
      lives: 3,
      gold: 0,
      level: 0,
      score: 0,
      highScore: 0,
      turn: 0,
    }),
    getMessages: async () => [encryptedAd],
    solve: async () => ({
      success: false,
      lives: 2,
      gold: 0,
      score: 0,
      highScore: 0,
      turn: 1,
      message: 'nope',
    }),
    getShop: async () => shops[Math.min(shopCall++, shops.length - 1)] as ShopItem[],
    buy: async () => ({ shoppingSuccess: true, gold: 0, lives: 3, level: 4, turn: 2 }),
  };
}

describe('RecordingApi', () => {
  it('looks the ad up by its decoded id', async () => {
    const api = new RecordingApi(fakeApi([[]]));
    await api.getMessages('g');
    await api.solve('g', 'ad-1');
    expect(api.solves).toEqual([
      {
        label: 'Piece of cake',
        adMessage: 'Help someone',
        reward: 120,
        success: false,
        resultMessage: 'nope',
      },
    ]);
  });

  it('falls back to (unknown) for an unseen id', async () => {
    const api = new RecordingApi(fakeApi([[]]));
    await api.getMessages('g');
    await api.solve('g', b64('ad-1'));
    expect(api.solves[0]).toMatchObject({ label: '(unknown)', adMessage: '(unknown)', reward: 0 });
  });

  it('records the first shop only once', async () => {
    const first = [{ id: 'cs', name: 'CS', cost: 100 }];
    const second = [{ id: 'cs', name: 'CS', cost: 200 }];
    const api = new RecordingApi(fakeApi([first, second]));
    await api.getShop('g');
    await api.getShop('g');
    expect(api.firstShop).toEqual(first);
  });

  it('records purchases with their level', async () => {
    const api = new RecordingApi(fakeApi([[]]));
    await api.buy('g', 'cs');
    expect(api.purchases).toEqual([{ itemId: 'cs', success: true, level: 4 }]);
  });
});
