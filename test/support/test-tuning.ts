import type { Tuning } from '../../src/config/tuning.js';

// Intentionally frozen copy of the initial estimates; do not sync with DEFAULT_TUNING
// (unit tests must not move when DEFAULT_TUNING is calibrated).
export const TEST_TUNING: Tuning = {
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
  upgradePriority: ['cs'],
  trapPatterns: [/super\s+awesome/i],
};
