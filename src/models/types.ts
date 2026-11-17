export type GameState = {
  readonly gameId: string;
  readonly lives: number;
  readonly gold: number;
  readonly level: number;
  readonly score: number;
  readonly highScore: number;
  readonly turn: number;
};

export type EncryptionKind = 1 | 2;

/** An ad exactly as the API returns it; `message` and `probability` may be encoded. */
export type RawAd = {
  readonly adId: string;
  readonly message: string;
  readonly reward: number;
  readonly expiresIn: number;
  readonly encrypted: EncryptionKind | null;
  readonly probability: string;
};

/** A decoded ad. */
export type Ad = Omit<RawAd, 'encrypted'>;

export type ShopItem = {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
};

export type SolveResult = {
  readonly success: boolean;
  readonly lives: number;
  readonly gold: number;
  readonly score: number;
  readonly highScore: number;
  readonly turn: number;
  readonly message: string;
};

export type PurchaseResult = {
  readonly shoppingSuccess: boolean;
  readonly gold: number;
  readonly lives: number;
  readonly level: number;
  readonly turn: number;
};

export type Action =
  | { readonly kind: 'solve'; readonly adId: string }
  | { readonly kind: 'buy'; readonly itemId: string };

export type StrategyContext = {
  readonly state: GameState;
  readonly ads: readonly Ad[];
  readonly shop: readonly ShopItem[];
  /** Ids of shop items attempted in this game: attempted, never retried, whatever the outcome. */
  readonly attemptedItemIds: readonly string[];
  /**
   * Ids of shop items the API confirmed as bought. Unlike `attemptedItemIds` this counts only
   * purchases that took effect, so a rejected buy does not consume a budget such as `maxPotions`.
   */
  readonly purchasedItemIds: readonly string[];
};

/**
 * How a run finished. A game has no turn budget: it plays until the dragon dies, the operator
 * interrupts it, or no safe action is left. The finite potion budget (`Tuning.maxPotions`) is what
 * guarantees `lives` is eventually reached.
 */
export type EndReason = 'lives' | 'aborted' | 'stalled';

export type RunSummary = {
  readonly gameId: string;
  readonly score: number;
  readonly highScore: number;
  readonly turns: number;
  readonly solved: number;
  readonly failed: number;
  readonly purchases: number;
  readonly goldSpent: number;
  readonly finalGold: number;
  readonly finalLives: number;
  readonly endedBy: EndReason;
};
