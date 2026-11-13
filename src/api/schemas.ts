import { z } from 'zod';
import type { GameState, PurchaseResult, RawAd, ShopItem, SolveResult } from '../models/types.js';
import { ValidationError } from './errors.js';

const count = z.number().int();
const numericString = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => Number(value));
const flexibleNumber = z.union([z.number().nonnegative(), numericString]);
const booleanLike = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

const gameStateSchema = z.object({
  gameId: z.string().min(1),
  lives: count,
  gold: count,
  level: count,
  score: count,
  highScore: count,
  turn: count,
});

const adSchema = z.object({
  adId: z.string().min(1),
  message: z.string(),
  reward: flexibleNumber,
  expiresIn: count,
  encrypted: z
    .union([z.literal(1), z.literal(2)])
    .nullish()
    .transform((value) => value ?? null),
  probability: z.string(),
});

const shopItemSchema = z.object({ id: z.string().min(1), name: z.string(), cost: count });

const solveSchema = z.object({
  success: z.boolean(),
  lives: count,
  gold: count,
  score: count,
  highScore: count,
  turn: count,
  message: z.string(),
});

const purchaseSchema = z.object({
  shoppingSuccess: booleanLike,
  gold: count,
  lives: count,
  level: count,
  turn: count,
});

function parse<S extends z.ZodType>(schema: S, body: unknown, what: string): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(`Invalid ${what} response: ${issues}`);
  }
  return result.data;
}

export const parseStartGame = (body: unknown): GameState =>
  parse(gameStateSchema, body, 'start game');
export const parseMessages = (body: unknown): RawAd[] => parse(z.array(adSchema), body, 'messages');
export const parseShop = (body: unknown): ShopItem[] =>
  parse(z.array(shopItemSchema), body, 'shop');
export const parseSolveResult = (body: unknown): SolveResult => parse(solveSchema, body, 'solve');
export const parsePurchaseResult = (body: unknown): PurchaseResult =>
  parse(purchaseSchema, body, 'purchase');
