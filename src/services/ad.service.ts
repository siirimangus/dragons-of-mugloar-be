import type { Tuning } from '../config/tuning.js';
import type { Ad, RawAd } from '../models/types.js';
import { DecodeError, decodeField } from '../utils/decode.js';
import type { Logger } from '../utils/logger.js';

export type ScoredAd = { readonly ad: Ad; readonly score: number };

export function decodeAd(raw: RawAd): Ad {
  return {
    adId: raw.adId,
    message: decodeField(raw.message, raw.encrypted),
    reward: raw.reward,
    expiresIn: raw.expiresIn,
    probability: decodeField(raw.probability, raw.encrypted),
  };
}

export function decodeAds(raws: readonly RawAd[], logger: Logger): Ad[] {
  const ads: Ad[] = [];
  for (const raw of raws) {
    try {
      ads.push(decodeAd(raw));
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      logger.warn('Dropping undecodable ad', { adId: raw.adId, reason: error.message });
    }
  }
  return ads;
}

export function isTrap(ad: Ad, tuning: Tuning): boolean {
  return tuning.trapPatterns.some((pattern) => pattern.test(ad.message));
}

export function successProbability(ad: Ad, tuning: Tuning): number {
  const known = Object.hasOwn(tuning.labelProbability, ad.probability)
    ? tuning.labelProbability[ad.probability]
    : undefined;
  return known ?? tuning.unknownLabelProbability;
}

export function scoreAd(ad: Ad, tuning: Tuning): number {
  const p = successProbability(ad, tuning);
  return p * ad.reward - (1 - p) * tuning.lifeValue;
}

export function rankAds(ads: readonly Ad[], tuning: Tuning): ScoredAd[] {
  return ads
    .filter((ad) => !isTrap(ad, tuning))
    .map((ad) => ({ ad, score: scoreAd(ad, tuning) }))
    .sort((a, b) => b.score - a.score || b.ad.reward - a.ad.reward);
}
