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
  /** Ids of shop items already attempted in this game. */
  readonly purchased: readonly string[];
};

export type EndReason = 'lives' | 'turn-limit' | 'aborted';

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
