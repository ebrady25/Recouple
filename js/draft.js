/**
 * RECOUPLE — Draft System
 * =======================
 * Handles:
 * - Date-based deterministic seeding (so everyone gets same draft)
 * - Seeded pseudo-random number generator (Mulberry32)
 * - Draft pool generation per round
 * - Star rarity assignment per round
 */

const Draft = (() => {

  // ─── Seeded PRNG (Mulberry32) ───
  function mulberry32(seed) {
    return function() {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Generate a daily seed from date + game number.
   */
  function getDailySeed(date, gameNumber) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const base = year * 10000 + month * 100 + day;
    const multipliers = [1, 7919, 104729];
    return base * multipliers[gameNumber - 1] + gameNumber * 31337;
  }

  // ─── Rarity Probabilities by Round (0-indexed) ───
  const RARITY_TABLE = [
    [0.30, 0.35, 0.25, 0.10],
    [0.35, 0.35, 0.22, 0.08],
    [0.40, 0.35, 0.18, 0.07],
    [0.45, 0.32, 0.16, 0.07],
    [0.50, 0.30, 0.14, 0.06],
    [0.55, 0.28, 0.12, 0.05],
    [0.60, 0.25, 0.11, 0.04],
    [0.65, 0.23, 0.09, 0.03],
    [0.70, 0.20, 0.08, 0.02],
    [0.75, 0.18, 0.06, 0.01],
    [0.80, 0.15, 0.04, 0.01],
    [0.85, 0.13, 0.02, 0.00],
  ];

  const STAR_POINTS = { 1: 1, 2: 2, 3: 3, 4: 5 };

  /**
   * Roll a star rating for a given round (0-indexed).
   */
  function rollStarRating(rng, roundIndex) {
    const probs = RARITY_TABLE[roundIndex];
    const roll = rng();
    let cumulative = 0;
    for (let star = 0; star < 4; star++) {
      cumulative += probs[star];
      if (roll < cumulative) return star + 1;
    }
    return 1;
  }

  /**
   * Shuffle array in-place using Fisher-Yates with seeded RNG.
   */
  function seededShuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Generate all 12 rounds of draft options for a game.
   * Each round picks 3 unique contestants (not used in prior rounds).
   * Each contestant gets a star rating based on round probabilities.
   * 
   * @param {Array} allContestants - Full contestant database
   * @param {number} seed - Daily seed for this game
   * @returns {Array<Array>} 12 rounds, each an array of 3 draft cards
   */
  function generateAllRounds(allContestants, seed) {
    const rng = mulberry32(seed);
    
    // Create a shuffled copy of the full pool
    const pool = [...allContestants];
    seededShuffle(pool, rng);
    
    const rounds = [];
    let poolIndex = 0;
    
    for (let round = 0; round < 12; round++) {
      const options = [];
      for (let pick = 0; pick < 3; pick++) {
        // Grab next contestant from shuffled pool
        const contestant = pool[poolIndex++];
        const stars = rollStarRating(rng, round);
        options.push({
          ...contestant,
          stars,
          starPoints: STAR_POINTS[stars]
        });
      }
      rounds.push(options);
    }
    
    return rounds;
  }

  /**
   * Pre-generate draft for a single round (used when resuming).
   * Generally you should use generateAllRounds() and cache the result.
   */
  function getRoundOptions(allRounds, roundIndex) {
    return allRounds[roundIndex] || null;
  }

  // Public API
  return {
    mulberry32,
    getDailySeed,
    rollStarRating,
    seededShuffle,
    generateAllRounds,
    getRoundOptions,
    RARITY_TABLE,
    STAR_POINTS
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Draft;
}
