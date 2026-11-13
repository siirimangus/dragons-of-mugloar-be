import type { Ad, GameState, ShopItem, StrategyContext } from '../../src/models/types.js';

export const SHOP: readonly ShopItem[] = [
  { id: 'hpot', name: 'Healing potion', cost: 50 },
  { id: 'cs', name: 'Claw Sharpening', cost: 100 },
  { id: 'ch', name: 'Claw Honing', cost: 300 },
];

export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'g',
    lives: 3,
    gold: 0,
    level: 0,
    score: 0,
    highScore: 0,
    turn: 0,
    ...overrides,
  };
}

export function makeAd(overrides: Partial<Ad> = {}): Ad {
  return {
    adId: 'a1',
    message: 'Help Someone to fix their wagon',
    reward: 50,
    expiresIn: 7,
    probability: 'Sure thing',
    ...overrides,
  };
}

export function makeContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return { state: makeState(), ads: [], shop: SHOP, purchased: [], ...overrides };
}
