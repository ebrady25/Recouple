/**
 * RECOUPLE v2 — Draft System
 * ==========================
 * 9-round draft for the Griddy board layout.
 * Each round: pick 1 of 3 contestants.
 */

const Draft = (() => {

  function mulberry32(seed) {
    return function() {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function getDailySeed(date, gameNumber) {
    const d = new Date(date);
    const base = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const multipliers = [1, 7919, 104729];
    return base * multipliers[gameNumber - 1] + gameNumber * 31337;
  }

  // Rarity per round (9 rounds)
  const RARITY_TABLE = [
    [0.30, 0.35, 0.25, 0.10],
    [0.35, 0.35, 0.22, 0.08],
    [0.40, 0.35, 0.18, 0.07],
    [0.45, 0.32, 0.16, 0.07],
    [0.50, 0.30, 0.14, 0.06],
    [0.55, 0.28, 0.12, 0.05],
    [0.65, 0.23, 0.09, 0.03],
    [0.75, 0.18, 0.06, 0.01],
    [0.85, 0.13, 0.02, 0.00],
  ];

  const NUM_ROUNDS = 9;

  function rollStarRating(rng, roundIndex) {
    const probs = RARITY_TABLE[Math.min(roundIndex, RARITY_TABLE.length - 1)];
    const roll = rng();
    let cumulative = 0;
    for (let star = 0; star < 4; star++) {
      cumulative += probs[star];
      if (roll < cumulative) return star + 1;
    }
    return 1;
  }

  function seededShuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function generateAllRounds(allContestants, seed) {
    const rng = mulberry32(seed);
    const pool = [...allContestants];
    seededShuffle(pool, rng);

    const rounds = [];
    let poolIndex = 0;

    for (let round = 0; round < NUM_ROUNDS; round++) {
      const options = [];
      for (let pick = 0; pick < 3; pick++) {
        if (poolIndex >= pool.length) break;
        const contestant = pool[poolIndex++];
        const stars = rollStarRating(rng, round);
        options.push({ ...contestant, stars, starPoints: Scoring.RARITY_BASE[stars] });
      }
      rounds.push(options);
    }
    return rounds;
  }

  return {
    mulberry32, getDailySeed, rollStarRating, seededShuffle,
    generateAllRounds, RARITY_TABLE, NUM_ROUNDS
  };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = Draft;
