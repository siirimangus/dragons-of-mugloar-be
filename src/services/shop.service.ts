import type { Tuning } from '../config/tuning.js';
import type { Action, ShopItem, StrategyContext } from '../models/types.js';

/**
 * The healing potion, when the shop sells it and the per-game potion budget has room left.
 * Only confirmed purchases count, so a rejected buy does not burn part of the budget.
 */
export function availableHealItem(ctx: StrategyContext, tuning: Tuning): ShopItem | undefined {
  const bought = ctx.purchasedItemIds.filter((id) => id === tuning.healItemId).length;
  if (bought >= tuning.maxPotions) return undefined;
  return ctx.shop.find((item) => item.id === tuning.healItemId);
}

export function chooseShopAction(ctx: StrategyContext, tuning: Tuning): Action | null {
  const { state, attemptedItemIds } = ctx;

  const healItem = availableHealItem(ctx, tuning);
  if (healItem && state.lives <= tuning.healThreshold && state.gold >= healItem.cost) {
    return { kind: 'buy', itemId: healItem.id };
  }

  const nextUpgrade = tuning.upgradePriority
    // Attempted-but-failed purchases are intentionally never retried (avoids a loop that burns turns).
    .filter((id) => !attemptedItemIds.includes(id))
    .map((id) => ctx.shop.find((item) => item.id === id))
    .find((item) => item !== undefined);
  if (nextUpgrade && state.gold - nextUpgrade.cost >= tuning.reserveGold) {
    return { kind: 'buy', itemId: nextUpgrade.id };
  }

  return null;
}
