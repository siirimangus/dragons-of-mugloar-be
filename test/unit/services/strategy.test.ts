import { describe, expect, it } from 'vitest';
import { ExpectedValueStrategy } from '../../../src/services/strategy.js';
import { makeAd, makeContext, makeState } from '../../support/builders.js';
import { TEST_TUNING } from '../../support/test-tuning.js';

const strategy = new ExpectedValueStrategy(TEST_TUNING);

describe('ExpectedValueStrategy', () => {
  it('solves the ad with the highest expected value', () => {
    const ctx = makeContext({
      ads: [
        makeAd({ adId: 'risky', probability: 'Risky', reward: 80 }),
        makeAd({ adId: 'sure', probability: 'Sure thing', reward: 50 }),
        makeAd({ adId: 'cake', probability: 'Piece of cake', reward: 10 }),
      ],
    });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'sure' });
  });

  it('never picks a trap even when it has the best label and reward', () => {
    const ctx = makeContext({
      ads: [
        makeAd({
          adId: 'trap',
          message: 'Steal super awesome diamond pot from X',
          probability: 'Piece of cake',
          reward: 170,
        }),
        makeAd({ adId: 'ok', probability: 'Quite likely', reward: 20 }),
      ],
    });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'ok' });
  });

  it('heals before solving when lives are low', () => {
    const ctx = makeContext({
      state: makeState({ lives: 1, gold: 80 }),
      ads: [makeAd({ adId: 'sure' })],
    });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'hpot' });
  });

  it('picks the least bad ad when every ad has negative expected value', () => {
    const ctx = makeContext({
      ads: [
        makeAd({ adId: 'worse', probability: 'Suicide mission', reward: 10 }),
        makeAd({ adId: 'better', probability: 'Rather detrimental', reward: 10 }),
      ],
    });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'better' });
  });

  it('returns null when there is nothing to solve and nothing to buy', () => {
    expect(strategy.chooseAction(makeContext())).toBeNull();
  });

  it('returns null when only trap ads remain', () => {
    const ctx = makeContext({
      ads: [makeAd({ message: 'Steal super awesome diamond pot from X' })],
    });
    expect(strategy.chooseAction(ctx)).toBeNull();
  });

  it('returns the shop action even when there are no ads', () => {
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 150 }), ads: [] });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'cs' });
  });
});
