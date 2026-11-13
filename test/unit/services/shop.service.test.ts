import { describe, expect, it } from 'vitest';
import { chooseShopAction } from '../../../src/services/shop.service.js';
import { SHOP, makeContext, makeState } from '../../support/builders.js';
import { TEST_TUNING } from '../../support/test-tuning.js';

const tuning = { ...TEST_TUNING, upgradePriority: ['cs', 'ch'] };

describe('chooseShopAction', () => {
  it('buys a healing potion when lives are at the threshold and gold covers it', () => {
    const ctx = makeContext({ state: makeState({ lives: 2, gold: 60 }) });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'hpot' });
  });

  it('does not heal when gold is too low', () => {
    const ctx = makeContext({ state: makeState({ lives: 1, gold: 40 }) });
    expect(chooseShopAction(ctx, tuning)).toBeNull();
  });

  it('does not heal when lives are above the threshold', () => {
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 60 }) });
    expect(chooseShopAction(ctx, tuning)).toBeNull();
  });

  it('prefers healing over upgrading', () => {
    const ctx = makeContext({ state: makeState({ lives: 1, gold: 500 }) });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'hpot' });
  });

  it('buys the next upgrade when gold covers cost plus reserve', () => {
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 150 }) });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'cs' });
  });

  it('keeps saving when gold does not cover cost plus reserve', () => {
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 149 }) });
    expect(chooseShopAction(ctx, tuning)).toBeNull();
  });

  it('skips upgrades already purchased', () => {
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 400 }), purchased: ['cs'] });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'ch' });
  });

  it('waits for the next upgrade instead of buying a later cheaper one', () => {
    const cheapSecond = { ...TEST_TUNING, upgradePriority: ['ch', 'cs'] };
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 200 }) });
    expect(chooseShopAction(ctx, cheapSecond)).toBeNull();
  });

  it('ignores upgrade ids the shop does not sell', () => {
    const unknownFirst = { ...TEST_TUNING, upgradePriority: ['nope', 'cs'] };
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 150 }) });
    expect(chooseShopAction(ctx, unknownFirst)).toEqual({ kind: 'buy', itemId: 'cs' });
  });

  it('heals when gold exactly equals the potion cost', () => {
    const ctx = makeContext({ state: makeState({ lives: 1, gold: 50 }) });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'hpot' });
  });

  it('falls through to upgrades when the heal item is not in the shop', () => {
    const shop = SHOP.filter((item) => item.id !== 'hpot');
    const affordable = makeContext({ state: makeState({ lives: 1, gold: 150 }), shop });
    expect(chooseShopAction(affordable, tuning)).toEqual({ kind: 'buy', itemId: 'cs' });
    const poor = makeContext({ state: makeState({ lives: 1, gold: 100 }), shop });
    expect(chooseShopAction(poor, tuning)).toBeNull();
  });

  it('still heals when the potion was purchased before (potions are repeatable)', () => {
    const ctx = makeContext({ state: makeState({ lives: 1, gold: 60 }), purchased: ['hpot'] });
    expect(chooseShopAction(ctx, tuning)).toEqual({ kind: 'buy', itemId: 'hpot' });
  });

  it('buys an upgrade at gold equal to cost when the reserve is zero', () => {
    const noReserve = { ...tuning, reserveGold: 0 };
    const ctx = makeContext({ state: makeState({ lives: 3, gold: 100 }) });
    expect(chooseShopAction(ctx, noReserve)).toEqual({ kind: 'buy', itemId: 'cs' });
  });

  it('returns null when every upgrade is already purchased', () => {
    const ctx = makeContext({
      state: makeState({ lives: 3, gold: 1000 }),
      purchased: ['cs', 'ch'],
    });
    expect(chooseShopAction(ctx, tuning)).toBeNull();
  });
});
