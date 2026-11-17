import type { DragonsApi } from '../../src/api/dragons-api.js';
import { ApiError } from '../../src/api/errors.js';
import type {
  EncryptionKind,
  GameState,
  PurchaseResult,
  RawAd,
  ShopItem,
  SolveResult,
} from '../../src/models/types.js';
import { rot13 } from '../../src/utils/decode.js';

const LABEL_SUCCESS: Readonly<Record<string, number>> = {
  'Piece of cake': 0.95,
  'Walk in the park': 0.9,
  'Sure thing': 0.85,
  'Quite likely': 0.7,
  'Hmmm....': 0.5,
  Gamble: 0.4,
  Risky: 0.3,
  'Rather detrimental': 0.2,
  'Playing with fire': 0.1,
  'Suicide mission': 0.03,
  Impossible: 0,
};
const LABELS = Object.keys(LABEL_SUCCESS);

/**
 * Seeded in-memory stand-in for the Dragons of Mugloar API (test use only).
 * Simplifications: one instance is one game; ads never expire and the whole board
 * regenerates after every solve and after every successful purchase. The real API's exact game-over response is an assumption
 * (modelled here as a non-retryable 400 on solve/buy once lives reach 0).
 */
export type FakeOptions = {
  readonly seed?: number;
  readonly lives?: number;
  /** When set, every non-trap ad succeeds with exactly this probability. */
  readonly successRateOverride?: number;
  /**
   * When set to k, every k-th board refresh (counting from 1; the initial board is refresh 0 and
   * stays normal) contains only trap ads (7) instead of 6 normal ads plus 1 trap.
   */
  readonly trapBoardEvery?: number;
  /** Initial gold (default 0). */
  readonly startGold?: number;
  /**
   * Multiplies every ad's reward (default 1). The live game pays about 2.8x what this simulator
   * does for the ads a bot actually attempts, while shop prices are identical in both, so the
   * default economy is poorer than the real one. Scaling makes `lifeValue` experiments comparable
   * to live, because `scoreAd` is invariant under scaling reward and `lifeValue` together.
   */
  readonly rewardScale?: number;
};

/**
 * Creates a seeded pseudo-random number generator (mulberry32).
 *
 * Returns a function that, on each call, yields the next float in [0, 1), like `Math.random()`
 * but fully deterministic: the same seed always produces the same sequence. This keeps the fake
 * API's "random" behaviour (ad success rates, rewards, traps) reproducible, so tests are not
 * flaky and any failing run can be replayed exactly.
 *
 * How it works: the 32-bit state advances by a fixed odd constant on every call, then the value is
 * scrambled with multiply/XOR-shift steps (`Math.imul` keeps the arithmetic in 32-bit integers)
 * and divided by 2^32 to map it into [0, 1).
 *
 * Fast and tiny with good statistical quality for tests and simulations, but NOT cryptographically
 * secure and with only a 32-bit state (period about 2^32).
 *
 * @param seed Any number; it is coerced to an unsigned 32-bit integer.
 * @returns A function producing the next pseudo-random float in [0, 1) on each call.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Hidden = { readonly successRate: number; readonly isTrap: boolean; readonly reward: number };

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class FakeDragonsApi implements DragonsApi {
  /** Successful purchases only. */
  readonly purchases: string[] = [];
  trapsSolved = 0;

  /** Ad generation stream: content depends only on the refresh count. */
  private readonly adRandom: () => number;
  /** Solve outcome stream: depends only on the number of solves. */
  private readonly outcomeRandom: () => number;
  private readonly overrideRate: number | undefined;
  private readonly trapBoardEvery: number | undefined;
  private readonly rewardScale: number;
  private refreshCount = 0;
  private readonly shop: readonly ShopItem[] = [
    { id: 'hpot', name: 'Healing potion', cost: 50 },
    { id: 'cs', name: 'Claw Sharpening', cost: 100 },
    { id: 'ch', name: 'Claw Honing', cost: 300 },
  ];
  private state: GameState;
  private ads: RawAd[] = [];
  private readonly hidden = new Map<string, Hidden>();
  private readonly idRandom: () => number;
  private readonly usedIds = new Set<string>();

  constructor(options: FakeOptions = {}) {
    const seed = options.seed ?? 1;
    this.adRandom = mulberry32(seed);
    this.outcomeRandom = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.idRandom = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.overrideRate = options.successRateOverride;
    this.trapBoardEvery = options.trapBoardEvery;
    this.rewardScale = options.rewardScale ?? 1;
    this.state = {
      gameId: 'fake-game',
      lives: options.lives ?? 3,
      gold: options.startGold ?? 0,
      level: 0,
      score: 0,
      highScore: 0,
      turn: 0,
    };
  }

  /** For test assertions only; not part of the DragonsApi contract. */
  snapshot(): GameState {
    return this.state;
  }

  async startGame(): Promise<GameState> {
    // One instance is one game: later calls return the current state without resetting.
    if (this.ads.length === 0) this.refreshAds();
    return this.state;
  }

  async getMessages(gameId: string): Promise<RawAd[]> {
    this.assertGame(gameId);
    return this.ads.map((ad) => ({ ...ad }));
  }

  async getShop(gameId: string): Promise<ShopItem[]> {
    this.assertGame(gameId);
    return this.shop.map((item) => ({ ...item }));
  }

  async solve(gameId: string, adId: string): Promise<SolveResult> {
    this.assertGame(gameId);
    this.assertAlive();
    const hidden = this.hidden.get(adId);
    if (!hidden) {
      // Like the live API: an encoded id of an encrypted ad is a malformed request, not a missing ad.
      const encodedMatch = this.ads.some((candidate) => candidate.adId === adId);
      throw encodedMatch
        ? new ApiError('Bad Request', { status: 400, retryable: false })
        : new ApiError('Ad not found', { status: 404, retryable: false });
    }
    const ad = { reward: hidden.reward };

    // Trap success rate is 0: assumes real traps always fail.
    const success = this.outcomeRandom() < hidden.successRate;
    if (hidden.isTrap) this.trapsSolved += 1;

    const score = success ? this.state.score + ad.reward : this.state.score;
    this.state = {
      ...this.state,
      turn: this.state.turn + 1,
      lives: success ? this.state.lives : this.state.lives - 1,
      gold: success ? this.state.gold + ad.reward : this.state.gold,
      score,
      highScore: Math.max(this.state.highScore, score),
    };
    this.refreshAds();
    return {
      success,
      lives: this.state.lives,
      gold: this.state.gold,
      score: this.state.score,
      highScore: this.state.highScore,
      turn: this.state.turn,
      message: success ? 'You successfully solved the mission!' : 'You failed on the mission!',
    };
  }

  async buy(gameId: string, itemId: string): Promise<PurchaseResult> {
    this.assertGame(gameId);
    this.assertAlive();
    const item = this.shop.find((candidate) => candidate.id === itemId);
    if (!item) throw new ApiError('Item not found', { status: 404, retryable: false });

    const turn = this.state.turn + 1;
    if (this.state.gold < item.cost) {
      this.state = { ...this.state, turn };
      return {
        shoppingSuccess: false,
        gold: this.state.gold,
        lives: this.state.lives,
        level: this.state.level,
        turn,
      };
    }
    this.purchases.push(itemId);
    this.state = {
      ...this.state,
      turn,
      gold: this.state.gold - item.cost,
      lives: itemId === 'hpot' ? this.state.lives + 1 : this.state.lives,
      level: itemId === 'hpot' ? this.state.level : this.state.level + 1,
    };
    // Like the live API, the board changes whenever the turn advances, purchases included.
    this.refreshAds();
    return {
      shoppingSuccess: true,
      gold: this.state.gold,
      lives: this.state.lives,
      level: this.state.level,
      turn,
    };
  }

  private assertGame(gameId: string): void {
    if (gameId !== this.state.gameId)
      throw new ApiError('Game not found', { status: 404, retryable: false });
  }

  private assertAlive(): void {
    if (this.state.lives <= 0)
      throw new ApiError('No lives left', { status: 400, retryable: false });
  }

  private refreshAds(): void {
    this.ads = [];
    this.hidden.clear();
    const refresh = this.refreshCount++;
    const trapOnly =
      this.trapBoardEvery !== undefined && refresh > 0 && refresh % this.trapBoardEvery === 0;
    if (trapOnly) {
      for (let i = 0; i < 7; i++) this.addAd(true);
    } else {
      for (let i = 0; i < 6; i++) this.addAd(false);
      this.addAd(true);
    }
  }

  private addAd(isTrap: boolean): void {
    const adId = this.newTrueId();
    const label = isTrap
      ? 'Piece of cake'
      : (LABELS[Math.floor(this.adRandom() * LABELS.length)] ?? 'Hmmm....');
    const message = isTrap
      ? `Steal super awesome diamond pot from Person ${adId}`
      : `Help Person ${adId} to fix their wagon`;
    // Scaling is applied after drawing, so the random stream is identical at every scale and
    // runs on the same seed stay comparable.
    const baseReward = isTrap
      ? 150 + Math.floor(this.adRandom() * 30)
      : 5 + Math.floor(this.adRandom() * 75);
    const reward = Math.round(baseReward * this.rewardScale);
    const roll = this.adRandom();
    const encrypted: EncryptionKind | null = roll < 0.2 ? 1 : roll < 0.4 ? 2 : null;
    const encode = (value: string): string =>
      encrypted === 1
        ? Buffer.from(value).toString('base64')
        : encrypted === 2
          ? rot13(value)
          : value;

    this.ads.push({
      adId: encode(adId),
      message: encode(message),
      reward,
      expiresIn: 7,
      encrypted,
      probability: encode(label),
    });
    this.hidden.set(adId, {
      successRate: isTrap ? 0 : (this.overrideRate ?? LABEL_SUCCESS[label] ?? 0.5),
      isTrap,
      reward,
    });
  }

  /** 8 unique alphanumeric characters, like the ids the live API accepts. */
  private newTrueId(): string {
    for (;;) {
      let id = '';
      for (let i = 0; i < 8; i++)
        id += ID_CHARS[Math.floor(this.idRandom() * ID_CHARS.length)] ?? 'A';
      if (!this.usedIds.has(id)) {
        this.usedIds.add(id);
        return id;
      }
    }
  }
}
