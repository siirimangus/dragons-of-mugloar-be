import type { Tuning } from '../config/tuning.js';
import type { Action, StrategyContext } from '../models/types.js';
import { rankAds } from './ad.service.js';
import { chooseShopAction } from './shop.service.js';

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
    const wait = this.waitAction(ctx, best !== undefined);
    if (wait) return wait;

    // Cannot afford to wait: fall back to the least bad ad, if any.
    return best ? { kind: 'solve', adId: best.ad.adId } : null;
  }

  /**
   * Buying a potion advances the turn (refreshing the board) and gains a life. With no candidate
   * (non-trap) ad at all the alternative is aborting, so any affordable potion will do; with a merely bad ad the
   * pot must stay above `waitReserveGold` so waiting cannot drain it.
   */
  private waitAction(ctx: StrategyContext, hasCandidate: boolean): Action | null {
    const healItem = ctx.shop.find((item) => item.id === this.tuning.healItemId);
    if (!healItem) return null;
    const reserve = hasCandidate ? this.tuning.waitReserveGold : 0;
    return ctx.state.gold - healItem.cost >= reserve ? { kind: 'buy', itemId: healItem.id } : null;
  }
}
