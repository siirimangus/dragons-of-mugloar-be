export type Tuning = {
  /** Estimated success probability per decoded probability label. */
  readonly labelProbability: Readonly<Record<string, number>>;
  readonly unknownLabelProbability: number;
  /** What losing a life is worth, in gold, when scoring an ad. */
  readonly lifeValue: number;
  readonly healItemId: string;
  /** Buy a healing potion when lives are at or below this. */
  readonly healThreshold: number;
  /** Gold to keep after an upgrade so a healing potion stays affordable. */
  readonly reserveGold: number;
  /** Shop items to buy, in order, once each. */
  readonly upgradePriority: readonly string[];
  /** Ads whose decoded message matches any pattern are never solved. */
  readonly trapPatterns: readonly RegExp[];
};

export const DEFAULT_TUNING: Tuning = {
  labelProbability: {
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
  },
  unknownLabelProbability: 0.3,
  lifeValue: 150,
  healItemId: 'hpot',
  healThreshold: 2,
  reserveGold: 50,
  upgradePriority: [
    'cs',
    'gas',
    'wax',
    'tricks',
    'wingpot',
    'ch',
    'rf',
    'iron',
    'mtrix',
    'wingpotmax',
  ],
  trapPatterns: [/super\s+awesome/i],
};
