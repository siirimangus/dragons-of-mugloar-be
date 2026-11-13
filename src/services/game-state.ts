import type { GameState, PurchaseResult, SolveResult } from '../models/types.js';

/** Mirrors the API's authoritative values; does not interpret them. */
export function applySolve(state: GameState, result: SolveResult): GameState {
  return {
    ...state,
    lives: result.lives,
    gold: result.gold,
    score: result.score,
    highScore: result.highScore,
    turn: result.turn,
  };
}

/** Mirrors the API's authoritative values; does not interpret them. */
export function applyPurchase(state: GameState, result: PurchaseResult): GameState {
  return {
    ...state,
    lives: result.lives,
    gold: result.gold,
    level: result.level,
    turn: result.turn,
  };
}
