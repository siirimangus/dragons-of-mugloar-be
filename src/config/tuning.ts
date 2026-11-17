export type Tuning = {
  /** Estimated success probability per decoded probability label. */
  readonly labelProbability: Readonly<Record<string, number>>;
  readonly unknownLabelProbability: number;
  /** What losing a life is worth, in gold, when scoring an ad. */
  readonly lifeValue: number;
  readonly healItemId: string;
  /**
   * Buy a healing potion when lives are at or below this. Lives are not capped at the starting 3
   * (5 observed), but a threshold above the typical life count makes the bot buy potions every turn.
   */
  readonly healThreshold: number;
  /**
   * An ad is only solved when its expected value reaches this; below it the bot prefers to wait
   * with a heal purchase when it can afford one.
   */
  readonly minSolveScore: number;
  /** Gold to keep after an upgrade so a healing potion stays affordable. */
  readonly reserveGold: number;
  /**
   * Healing potions allowed per game. Lives are the only thing that ends a run, and gold income
   * far exceeds a potion's cost, so an uncapped bot would buy lives forever and never finish.
   * This cap makes the life budget finite: `3` starting lives plus at most this many.
   */
  readonly maxPotions: number;
  /** Shop items to buy, in order, once each. */
  readonly upgradePriority: readonly string[];
  /** Ads whose decoded message matches any pattern are never solved. */
  readonly trapPatterns: readonly RegExp[];
};

export const DEFAULT_TUNING: Tuning = {
  // Measured with `npm run calibrate` (live API, 40 games across two runs, Nov 2026). Dragon level
  // does not affect these rates (see README quirk 12), so the run with upgrades and the one with
  // `--priority none` are pooled. Re-run the calibration if the game changes.
  // `Impossible` is never attempted, so its 0 is an assumption rather than a measurement.
  labelProbability: {
    'Piece of cake': 0.94, // 645/683
    'Walk in the park': 0.86, // 352/411
    'Sure thing': 0.98, // 240/245
    'Quite likely': 0.79, // 177/225
    'Hmmm....': 0.67, // 109/163
    Gamble: 0.51, // 63/124
    Risky: 0.44, // 40/90
    'Rather detrimental': 0.39, // 37/96
    'Playing with fire': 0.23, // 17/75
    'Suicide mission': 0.11, // 11/100
    Impossible: 0,
  },
  unknownLabelProbability: 0.3,
  lifeValue: 150,
  healItemId: 'hpot',
  healThreshold: 2,
  minSolveScore: 0,
  reserveGold: 50,
  maxPotions: 10,
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
