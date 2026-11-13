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

/** Mutable bookkeeping for one run. */
type RunContext = {
  readonly shop: readonly ShopItem[];
  /** Ids of shop items attempted (never retried, whatever the outcome). */
  readonly attemptedItemIds: string[];
  readonly stats: Stats;
  /** Ads the API rejected on the current turn; cleared when the turn advances. */
  readonly rejectedAds: Set<string>;
  /** What the in-flight turn was trying to do, for diagnostics. */
  attempt: { adId?: string; itemId?: string };
};

const PROGRESS_EVERY = 25;

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
    const ctx: RunContext = {
      shop: await this.api.getShop(state.gameId),
      attemptedItemIds: [],
      stats: { solved: 0, failed: 0, purchases: 0, goldSpent: 0 },
      rejectedAds: new Set(),
      attempt: {},
    };
    let consecutiveFailures = 0;
    let endedBy: EndReason = 'lives';

    this.logger.info('Game started', { gameId: state.gameId });

    try {
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
          const next = await this.playTurn(state, ctx);
          consecutiveFailures = 0;
          if (next.turn !== state.turn) ctx.rejectedAds.clear();
          if (next.turn !== state.turn && next.turn % PROGRESS_EVERY === 0) {
            this.logger.info('Progress', {
              turn: next.turn,
              score: next.score,
              gold: next.gold,
              lives: next.lives,
            });
          }
          state = next;
        } catch (error) {
          if (!isSkippable(error)) throw error;
          consecutiveFailures += 1;
          this.logger.warn('Turn skipped', {
            reason: error.message,
            consecutiveFailures,
            ...ctx.attempt,
          });
          if (consecutiveFailures >= this.options.maxConsecutiveFailures) {
            if (!(error instanceof NoActionError)) throw error;
            // The state cannot change without an action: a legitimate dead end, not a crash.
            this.logger.warn('Stalled: no safe action available', { consecutiveFailures });
            endedBy = 'stalled';
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Run failed', { ...this.summarize(state, ctx.stats) });
      throw error;
    }

    const summary: RunSummary = { ...this.summarize(state, ctx.stats), endedBy };
    this.logger.info('Run finished', { ...summary });
    return summary;
  }

  private summarize(state: GameState, stats: Stats): Omit<RunSummary, 'endedBy'> {
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
    };
  }

  private async playTurn(state: GameState, ctx: RunContext): Promise<GameState> {
    ctx.attempt = {};
    const decoded = decodeAds(await this.api.getMessages(state.gameId), this.logger);
    const ads = decoded.filter((ad) => !ctx.rejectedAds.has(ad.adId));
    const action = this.strategy.chooseAction({
      state,
      ads,
      shop: ctx.shop,
      attemptedItemIds: ctx.attemptedItemIds,
    });
    if (action === null) throw new NoActionError('Strategy produced no action');

    if (action.kind === 'solve') {
      ctx.attempt = { adId: action.adId };
      let result;
      try {
        result = await this.api.solve(state.gameId, action.adId);
      } catch (error) {
        if (error instanceof ApiError && !error.retryable) ctx.rejectedAds.add(action.adId);
        throw error;
      }
      if (result.success) ctx.stats.solved += 1;
      else ctx.stats.failed += 1;
      this.logger.debug('Solved ad', {
        adId: action.adId,
        success: result.success,
        score: result.score,
      });
      return applySolve(state, result);
    }

    ctx.attempt = { itemId: action.itemId };
    // Record the attempt up front so a failed purchase is never retried.
    ctx.attemptedItemIds.push(action.itemId);
    const result = await this.api.buy(state.gameId, action.itemId);
    if (result.shoppingSuccess) {
      ctx.stats.purchases += 1;
      ctx.stats.goldSpent += ctx.shop.find((item) => item.id === action.itemId)?.cost ?? 0;
    }
    this.logger.debug('Bought item', { itemId: action.itemId, success: result.shoppingSuccess });
    return applyPurchase(state, result);
  }
}
