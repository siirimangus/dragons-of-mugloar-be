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

  it('solves the only trap on the board when nothing else can pass the turn', () => {
    const ctx = makeContext({
      ads: [makeAd({ message: 'Steal super awesome diamond pot from X' })],
    });
    expect(strategy.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'a1' });
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

    it('solves a trap on an all-trap board when it cannot afford to wait', () => {
      const ctx = makeContext({
        state: makeState({ lives: 3, gold: 49 }),
        ads: [trap('t1'), trap('t2')],
      });
      expect(strategy.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 't1' });
    });

    it('waits instead of solving a negative expected value ad whenever a potion is affordable', () => {
      const ctx = makeContext({ state: makeState({ lives: 3, gold: 50 }), ads: [badAd] });
      expect(waiter.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'hpot' });
    });

    it('solves the least bad ad only when it cannot afford a potion', () => {
      const ctx = makeContext({ state: makeState({ lives: 3, gold: 49 }), ads: [badAd] });
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
      const rich = makeContext({ state: makeState({ lives: 3, gold: 50 }), ads: [ad] });
      expect(picky.chooseAction(rich)).toEqual({ kind: 'buy', itemId: 'hpot' });
      const poor = makeContext({ state: makeState({ lives: 3, gold: 49 }), ads: [ad] });
      expect(picky.chooseAction(poor)).toEqual({ kind: 'solve', adId: 'ok' });
    });

    it('cannot wait once the potion budget is spent, so it solves a trap instead', () => {
      const capped = new ExpectedValueStrategy({
        ...TEST_TUNING,
        upgradePriority: [],
        maxPotions: 1,
      });
      const ctx = makeContext({
        state: makeState({ lives: 3, gold: 500 }),
        ads: [trap('t1'), trap('t2')],
        purchasedItemIds: ['hpot'],
      });
      expect(capped.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 't1' });
    });

    it('still waits while the potion budget has room left', () => {
      const capped = new ExpectedValueStrategy({
        ...TEST_TUNING,
        upgradePriority: [],
        maxPotions: 2,
      });
      const ctx = makeContext({
        state: makeState({ lives: 3, gold: 500 }),
        ads: [trap('t1'), trap('t2')],
        purchasedItemIds: ['hpot'],
      });
      expect(capped.chooseAction(ctx)).toEqual({ kind: 'buy', itemId: 'hpot' });
    });

    it('solves a trap as a last resort when there is no other way to pass the turn', () => {
      // No upgrades left, no potion budget: stalling here would deadlock the run forever,
      // because without an action the turn never advances and the board never refreshes.
      const stuck = new ExpectedValueStrategy({
        ...TEST_TUNING,
        upgradePriority: [],
        maxPotions: 0,
      });
      const ctx = makeContext({
        state: makeState({ lives: 2, gold: 5000 }),
        ads: [trap('t1'), trap('t2')],
      });
      expect(stuck.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 't1' });
    });

    it('still prefers any non-trap ad over a trap as the last resort', () => {
      const stuck = new ExpectedValueStrategy({
        ...TEST_TUNING,
        upgradePriority: [],
        maxPotions: 0,
      });
      const ctx = makeContext({
        state: makeState({ lives: 2, gold: 0 }),
        ads: [trap('t1'), badAd],
      });
      expect(stuck.chooseAction(ctx)).toEqual({ kind: 'solve', adId: 'bad' });
    });

    it('cannot wait when the heal item is missing from the shop', () => {
      const shop = [{ id: 'cs', name: 'Claw Sharpening', cost: 100 }];
      const withBad = makeContext({ state: makeState({ gold: 500 }), shop, ads: [badAd] });
      expect(waiter.chooseAction(withBad)).toEqual({ kind: 'solve', adId: 'bad' });
      const onlyTraps = makeContext({ state: makeState({ gold: 60 }), shop, ads: [trap('t1')] });
      expect(strategy.chooseAction(onlyTraps)).toEqual({ kind: 'solve', adId: 't1' });
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
