import type { GameState, PurchaseResult, RawAd, ShopItem, SolveResult } from '../models/types.js';

export interface DragonsApi {
  startGame(): Promise<GameState>;
  getMessages(gameId: string): Promise<RawAd[]>;
  solve(gameId: string, adId: string): Promise<SolveResult>;
  getShop(gameId: string): Promise<ShopItem[]>;
  buy(gameId: string, itemId: string): Promise<PurchaseResult>;
}
