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

  describe('waiting with a heal purchase', () => {
    const trap = (adId: string) =>
      makeAd({ adId, message: 'Steal super awesome diamond pot from X', reward: 400 });
    // Without upgrades to buy, high gold cannot trigger the shop rules first.
    const waiter = new ExpectedValueStrategy({ ...TEST_TUNING, upgradePriority: [] });
    const badAd = makeAd({ adId: 'bad', probability: 'Suicide mission', reward: 10 });

    it('buys a potion to wait when the board is all traps and gold covers it', () => {
      const ctx = makeContext({
        state: makeState({ lives: 3, gold: 50 }),
        ads: [trap('t1'), trap('t2')],
      });
      expect(strategy.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'hpot' });
    });

    it('returns null on an all-trap board when it cannot afford to wait', () => {
      const ctx = makeContext({
        state: makeState({ lives: 3, gold: 49 }),
        ads: [trap('t1'), trap('t2')],
      });
      expect(strategy.chooseAction(ctx)).toBeNull();
    });

    it('waits instead of solving a negative expected value ad when it can afford a potion', () => {
      const ctx = makeContext({ state: makeState({ lives: 3, gold: 350 }), ads: [badAd] });
      expect(waiter.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'hpot' });
    });

    it('solves the least bad ad when waiting would dip into the reserve', () => {
      const ctx = makeContext({ state: makeState({ lives: 3, gold: 349 }), ads: [badAd] });
      expect(waiter.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'bad' });
    });

    it('solves an ad whose score exactly equals minSolveScore', () => {
      const ad = makeAd({ adId: 'edge', probability: 'Hmmm....', reward: 100 }); // 0.5*100 - 0.5*150 = -25
      const edge = new ExpectedValueStrategy({ ...TEST_TUNING, minSolveScore: -25 });
      const ctx = makeContext({ state: makeState({ lives: 3, gold: 60 }), ads: [ad] });
      expect(edge.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'edge' });
    });

    it('skips a decent ad for a wait when minSolveScore is set higher', () => {
      const picky = new ExpectedValueStrategy({
        ...TEST_TUNING,
        upgradePriority: [],
        minSolveScore: 100,
      });
      const ad = makeAd({ adId: 'ok', probability: 'Sure thing', reward: 50 }); // expected value 42.5 - 22.5 = 20
      const rich = makeContext({ state: makeState({ lives: 3, gold: 350 }), ads: [ad] });
      expect(picky.chooseAction(rich)).toEqual({ kind: 'buy', itemId: 'hpot' });
      const poor = makeContext({ state: makeState({ lives: 3, gold: 349 }), ads: [ad] });
      expect(picky.chooseAction(poor)).toEqual({ kind: 'solve', adId: 'ok' });
    });

    it('cannot wait when the heal item is missing from the shop', () => {
      const shop = [{ id: 'cs', name: 'Claw Sharpening', cost: 100 }];
      const withBad = makeContext({ state: makeState({ gold: 500 }), shop, ads: [badAd] });
      expect(waiter.chooseAction(withBad)).toEqual({ kind: 'solve', adId: 'bad' });
      const onlyTraps = makeContext({ state: makeState({ gold: 60 }), shop, ads: [trap('t1')] });
      expect(strategy.chooseAction(onlyTraps)).toBeNull();
    });

    it('keeps shop precedence over solving and over waiting', () => {
      const upgrade = makeContext({
        state: makeState({ lives: 3, gold: 150 }),
        ads: [makeAd({ adId: 'sure' })],
      });
      expect(strategy.chooseAction(upgrade)).toEqual({ kind: 'buy', itemId: 'cs' });
      const heal = makeContext({ state: makeState({ lives: 1, gold: 60 }), ads: [badAd] });
      expect(strategy.chooseAction(heal)).toEqual({ kind: 'buy', itemId: 'hpot' });
    });
  });
});
