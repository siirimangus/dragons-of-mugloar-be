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

export type FakeOptions = {
  readonly seed?: number;
  readonly lives?: number;
  /** When set, every non-trap ad succeeds with exactly this probability. */
  readonly successRateOverride?: number;
};

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

type Hidden = { readonly successRate: number; readonly isTrap: boolean };

export class FakeDragonsApi implements DragonsApi {
  readonly purchases: string[] = [];
  trapsSolved = 0;

  private readonly random: () => number;
  private readonly overrideRate: number | undefined;
  private readonly shop: readonly ShopItem[] = [
    { id: 'hpot', name: 'Healing potion', cost: 50 },
    { id: 'cs', name: 'Claw Sharpening', cost: 100 },
    { id: 'ch', name: 'Claw Honing', cost: 300 },
  ];
  private state: GameState;
  private ads: RawAd[] = [];
  private readonly hidden = new Map<string, Hidden>();
  private adCounter = 0;

  constructor(options: FakeOptions = {}) {
    this.random = mulberry32(options.seed ?? 1);
    this.overrideRate = options.successRateOverride;
    this.state = {
      gameId: 'fake-game',
      lives: options.lives ?? 3,
      gold: 0,
      level: 0,
      score: 0,
      highScore: 0,
      turn: 0,
    };
  }

  snapshot(): GameState {
    return this.state;
  }

  async startGame(): Promise<GameState> {
    this.refreshAds();
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
    const ad = this.ads.find((candidate) => candidate.adId === adId);
    const hidden = this.hidden.get(adId);
    if (!ad || !hidden) throw new ApiError('Ad not found', { status: 404, retryable: false });

    const success = this.random() < hidden.successRate;
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

  private refreshAds(): void {
    this.ads = [];
    this.hidden.clear();
    for (let i = 0; i < 6; i++) this.addAd(false);
    this.addAd(true);
  }

  private addAd(isTrap: boolean): void {
    const adId = `ad-${this.adCounter++}`;
    const label = isTrap
      ? 'Piece of cake'
      : (LABELS[Math.floor(this.random() * LABELS.length)] ?? 'Hmmm....');
    const message = isTrap
      ? `Steal super awesome diamond pot from Person ${adId}`
      : `Help Person ${adId} to fix their wagon`;
    const reward = isTrap
      ? 150 + Math.floor(this.random() * 30)
      : 5 + Math.floor(this.random() * 75);
    const roll = this.random();
    const encrypted: EncryptionKind | null = roll < 0.2 ? 1 : roll < 0.4 ? 2 : null;
    const encode = (value: string): string =>
      encrypted === 1
        ? Buffer.from(value).toString('base64')
        : encrypted === 2
          ? rot13(value)
          : value;

    this.ads.push({
      adId,
      message: encode(message),
      reward,
      expiresIn: 7,
      encrypted,
      probability: encode(label),
    });
    this.hidden.set(adId, {
      successRate: isTrap ? 0 : (this.overrideRate ?? LABEL_SUCCESS[label] ?? 0.5),
      isTrap,
    });
  }
}
