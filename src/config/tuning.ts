export type Tuning = {
  /** Estimated success probability per decoded probability label. */
  readonly labelProbability: Readonly<Record<string, number>>;
  readonly unknownLabelProbability: number;
  /** What losing a life is worth, in gold, when scoring an ad. */
  readonly lifeValue: number;
  readonly healItemId: string;
  /** Buy a healing potion when lives are at or below this. Must stay below the maximum number of lives, otherwise the bot buys a potion every turn at full health. */
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
    'Piece of cake': 0.94,
    'Walk in the park': 0.88,
    'Sure thing': 0.99,
    'Quite likely': 0.75,
    'Hmmm....': 0.65,
    Gamble: 0.55,
    Risky: 0.46,
    'Rather detrimental': 0.4,
    'Playing with fire': 0.26,
    'Suicide mission': 0.08,
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
