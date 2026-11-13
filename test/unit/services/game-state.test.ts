import { describe, expect, it } from 'vitest';
import { applyPurchase, applySolve } from '../../../src/services/game-state.js';
import { makeState } from '../../support/builders.js';

describe('applySolve', () => {
  it('copies lives, gold, score, highScore and turn from the result', () => {
    const state = makeState({ lives: 3, gold: 10, score: 10, turn: 1, level: 2 });
    const next = applySolve(state, {
      success: false,
      lives: 2,
      gold: 10,
      score: 10,
      highScore: 99,
      turn: 2,
      message: 'You failed on the mission!',
    });
    expect(next).toEqual({ ...state, lives: 2, gold: 10, score: 10, highScore: 99, turn: 2 });
  });

  it('does not mutate the previous state', () => {
    const state = makeState();
    applySolve(state, {
      success: true,
      lives: 3,
      gold: 5,
      score: 5,
      highScore: 5,
      turn: 1,
      message: 'ok',
    });
    expect(state).toEqual(makeState());
  });
});

describe('applyPurchase', () => {
  it('copies lives, gold, level and turn and keeps the score', () => {
    const state = makeState({ lives: 1, gold: 100, score: 250, turn: 9 });
    const next = applyPurchase(state, {
      shoppingSuccess: true,
      gold: 50,
      lives: 2,
      level: 0,
      turn: 10,
    });
    expect(next).toEqual({ ...state, lives: 2, gold: 50, level: 0, turn: 10 });
    expect(next.score).toBe(250);
  });
});
