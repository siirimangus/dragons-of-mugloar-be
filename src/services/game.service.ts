import type { DragonsApi } from '../api/dragons-api.js';
import { ApiError } from '../api/errors.js';
import type { EndReason, GameState, RunSummary, ShopItem } from '../models/types.js';
import type { Logger } from '../utils/logger.js';
import { decodeAds } from './ad.service.js';
import { applyPurchase, applySolve } from './game-state.js';
import type { Strategy } from './strategy.js';

export class NoActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoActionError';
  }
}

export type GameServiceOptions = {
  readonly maxConsecutiveFailures: number;
  readonly maxTurns: number;
};

export type GameServiceDeps = {
  readonly api: DragonsApi;
  readonly strategy: Strategy;
  readonly logger: Logger;
  readonly options: GameServiceOptions;
};

type Stats = { solved: number; failed: number; purchases: number; goldSpent: number };

function isSkippable(error: unknown): error is NoActionError | ApiError {
  return error instanceof NoActionError || (error instanceof ApiError && !error.retryable);
}

export class GameService {
  private readonly api: DragonsApi;
  private readonly strategy: Strategy;
  private readonly logger: Logger;
  private readonly options: GameServiceOptions;

  constructor(deps: GameServiceDeps) {
    this.api = deps.api;
    this.strategy = deps.strategy;
    this.logger = deps.logger;
    this.options = deps.options;
  }

  async run(signal?: AbortSignal): Promise<RunSummary> {
    let state = await this.api.startGame();
    // Prices are static for a game; the shop is fetched once.
    const shop = await this.api.getShop(state.gameId);
    const stats: Stats = { solved: 0, failed: 0, purchases: 0, goldSpent: 0 };
    const purchased: string[] = [];
    let consecutiveFailures = 0;
    let endedBy: EndReason = 'lives';

    this.logger.info('Game started', { gameId: state.gameId });

    while (state.lives > 0) {
      if (signal?.aborted) {
        endedBy = 'aborted';
        break;
      }
      if (state.turn >= this.options.maxTurns) {
        endedBy = 'turn-limit';
        break;
      }
      try {
        state = await this.playTurn(state, shop, purchased, stats);
        consecutiveFailures = 0;
      } catch (error) {
        if (!isSkippable(error)) throw error;
        consecutiveFailures += 1;
        this.logger.warn('Turn skipped', { reason: error.message, consecutiveFailures });
        if (consecutiveFailures >= this.options.maxConsecutiveFailures) throw error;
      }
    }

    return {
      gameId: state.gameId,
      score: state.score,
      highScore: state.highScore,
      turns: state.turn,
      solved: stats.solved,
      failed: stats.failed,
      purchases: stats.purchases,
      goldSpent: stats.goldSpent,
      finalGold: state.gold,
      finalLives: state.lives,
      endedBy,
    };
  }

  private async playTurn(
    state: GameState,
    shop: readonly ShopItem[],
    purchased: string[],
    stats: Stats,
  ): Promise<GameState> {
    const ads = decodeAds(await this.api.getMessages(state.gameId), this.logger);
    const action = this.strategy.chooseAction({ state, ads, shop, purchased });
    if (action === null) throw new NoActionError('Strategy produced no action');

    if (action.kind === 'solve') {
      const result = await this.api.solve(state.gameId, action.adId);
      if (result.success) stats.solved += 1;
      else stats.failed += 1;
      this.logger.debug('Solved ad', {
        adId: action.adId,
        success: result.success,
        score: result.score,
      });
      return applySolve(state, result);
    }

    const result = await this.api.buy(state.gameId, action.itemId);
    purchased.push(action.itemId);
    if (result.shoppingSuccess) {
      stats.purchases += 1;
      stats.goldSpent += shop.find((item) => item.id === action.itemId)?.cost ?? 0;
    }
    this.logger.debug('Bought item', { itemId: action.itemId, success: result.shoppingSuccess });
    return applyPurchase(state, result);
  }
}
