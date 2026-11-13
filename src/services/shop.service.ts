import type { Tuning } from '../config/tuning.js';
import type { Action, StrategyContext } from '../models/types.js';

export function chooseShopAction(ctx: StrategyContext, tuning: Tuning): Action | null {
  const { state, shop, attemptedItemIds } = ctx;

  const healItem = shop.find((item) => item.id === tuning.healItemId);
  if (healItem && state.lives <= tuning.healThreshold && state.gold >= healItem.cost) {
    return { kind: 'buy', itemId: healItem.id };
  }

  const nextUpgrade = tuning.upgradePriority
    // Attempted-but-failed purchases are intentionally never retried (avoids a loop that burns turns).
    .filter((id) => !attemptedItemIds.includes(id))
    .map((id) => shop.find((item) => item.id === id))
    .find((item) => item !== undefined);
  if (nextUpgrade && state.gold - nextUpgrade.cost >= tuning.reserveGold) {
    return { kind: 'buy', itemId: nextUpgrade.id };
  }

  return null;
}
