import type { Tuning } from '../config/tuning.js';
import type { Action, StrategyContext } from '../models/types.js';
import { rankAds } from './ad.service.js';
import { availableHealItem, chooseShopAction } from './shop.service.js';

export interface Strategy {
  chooseAction(ctx: StrategyContext): Action | null;
}

export class ExpectedValueStrategy implements Strategy {
  private readonly tuning: Tuning;

  constructor(tuning: Tuning) {
    this.tuning = tuning;
  }

  chooseAction(ctx: StrategyContext): Action | null {
    const shopAction = chooseShopAction(ctx, this.tuning);
    if (shopAction) return shopAction;

    const best = rankAds(ctx.ads, this.tuning)[0];
    if (best && best.score >= this.tuning.minSolveScore) {
      return { kind: 'solve', adId: best.ad.adId };
    }

    // Nothing worth solving: waiting costs gold, a failed attempt costs a life.
    const wait = this.waitAction(ctx);
    if (wait) return wait;

    // Cannot afford to wait: fall back to the least bad non-trap ad, if any.
    if (best) return { kind: 'solve', adId: best.ad.adId };

    // Nothing safe left, and no purchase available to pass the turn. Solving a trap costs a life,
    // but it is the only move that refreshes the board, and spending lives is how a run is meant
    // to end. Returning null here instead would deadlock the game with lives still in hand: with
    // no action the turn never advances, so the all-trap board would never change.
    const lastResort = rankAds(ctx.ads, this.tuning, true)[0];
    return lastResort ? { kind: 'solve', adId: lastResort.ad.adId } : null;
  }

  /**
   * Passes the turn with a healing potion: it refreshes the board and adds a life, at the cost of
   * gold and one potion from the budget. Buying is worth it whenever it is affordable, because a
   * run has no turn budget and gold outside the shop has no other use, while `maxPotions` rather
   * than gold is what bounds the number of lives.
   */
  private waitAction(ctx: StrategyContext): Action | null {
    const healItem = availableHealItem(ctx, this.tuning);
    if (!healItem || ctx.state.gold < healItem.cost) return null;
    return { kind: 'buy', itemId: healItem.id };
  }
}
