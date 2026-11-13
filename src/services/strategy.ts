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
    return best ? { kind: 'solve', adId: best.ad.adId } : null;
  }
}
