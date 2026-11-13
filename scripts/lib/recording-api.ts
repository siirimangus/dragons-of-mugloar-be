import type { DragonsApi } from '../../src/api/dragons-api.js';
import type {
  Ad,
  GameState,
  PurchaseResult,
  RawAd,
  ShopItem,
  SolveResult,
} from '../../src/models/types.js';
import { decodeAd } from '../../src/services/ad.service.js';

export type SolveRecord = {
  readonly label: string;
  readonly adMessage: string;
  readonly reward: number;
  readonly success: boolean;
  readonly resultMessage: string;
};

export type PurchaseRecord = {
  readonly itemId: string;
  readonly success: boolean;
  readonly level: number;
};

/** Decorates a DragonsApi and records what happens, for calibration. */
export class RecordingApi implements DragonsApi {
  readonly solves: SolveRecord[] = [];
  readonly purchases: PurchaseRecord[] = [];
  firstShop: ShopItem[] | null = null;

  private readonly inner: DragonsApi;
  private readonly lastAds = new Map<string, Ad>();

  constructor(inner: DragonsApi) {
    this.inner = inner;
  }

  startGame(): Promise<GameState> {
    return this.inner.startGame();
  }

  async getMessages(gameId: string): Promise<RawAd[]> {
    const raws = await this.inner.getMessages(gameId);
    this.lastAds.clear();
    for (const raw of raws) {
      try {
        // Keyed by the DECODED id: that is the id the game loop solves with.
        const ad = decodeAd(raw);
        this.lastAds.set(ad.adId, ad);
      } catch {
        // Undecodable ads are dropped by the game loop as well.
      }
    }
    return raws;
  }

  async solve(gameId: string, adId: string): Promise<SolveResult> {
    const result = await this.inner.solve(gameId, adId);
    const ad = this.lastAds.get(adId);
    this.solves.push({
      label: ad?.probability ?? '(unknown)',
      adMessage: ad?.message ?? '(unknown)',
      reward: ad?.reward ?? 0,
      success: result.success,
      resultMessage: result.message,
    });
    return result;
  }

  async getShop(gameId: string): Promise<ShopItem[]> {
    const shop = await this.inner.getShop(gameId);
    this.firstShop ??= shop;
    return shop;
  }

  async buy(gameId: string, itemId: string): Promise<PurchaseResult> {
    const result = await this.inner.buy(gameId, itemId);
    this.purchases.push({ itemId, success: result.shoppingSuccess, level: result.level });
    return result;
  }
}
