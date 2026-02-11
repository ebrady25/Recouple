/**
 * RECOUPLE v2 — Griddy Scoring Engine
 * =====================================
 * 9-card board with Griddy-style topology.
 * Each slot has ONE trait requirement.
 * Scoring is connection-focused with rarity as bonus.
 *
 * Board: flat array of 9 cells, each null or a drafted contestant.
 *
 * Layout (visual positions):
 *        [0]────[1]          ← Top pair
 *       / \    / \
 *     [2] [3]──[4] [5]      ← Sides + Center pair
 *       \ / \  / \ /
 *       [6]  [8]  [7]       ← Bottom + Bottom-center
 *         \   |   /
 *          \  |  /
 *           [8]              ← (connected to 6 and 7)
 */

const Scoring = (() => {

  // ═══ BOARD TOPOLOGY ═══
  const NUM_SLOTS = 9;

  // Edges: each pair of connected slot indices
  const EDGES = [
    [0, 1],   // top pair
    [0, 2],   // top-left to left-side
    [0, 3],   // top-left to center-left
    [1, 4],   // top-right to center-right
    [1, 5],   // top-right to right-side
    [3, 4],   // center pair (QB-QB connection)
    [3, 2],   // center-left to left-side
    [4, 5],   // center-right to right-side
    [3, 6],   // center-left to bottom-left
    [3, 8],   // center-left to bottom-center
    [4, 7],   // center-right to bottom-right
    [4, 8],   // center-right to bottom-center
    [2, 6],   // left-side to bottom-left
    [5, 7],   // right-side to bottom-right
    [6, 8],   // bottom-left to bottom-center
    [7, 8],   // bottom-right to bottom-center
  ];

  // Precomputed adjacency list
  const ADJACENCY = Array.from({ length: NUM_SLOTS }, () => []);
  for (const [a, b] of EDGES) {
    ADJACENCY[a].push(b);
    ADJACENCY[b].push(a);
  }

  // ═══ SLOT DEFINITIONS ═══
  // Each slot has one required trait. 8 fixed + 1 rotating daily.
  const FIXED_SLOTS = [
    { index: 0, tag: 'usa',      label: 'USA',       emoji: '🇺🇸' },
    { index: 1, tag: 'uk',       label: 'UK',        emoji: '🇬🇧' },
    { index: 2, tag: 'winner',   label: 'Winner',    emoji: '👑' },
    { index: 3, tag: 'coupled',  label: 'Coupled',   emoji: '💑' },
    { index: 4, tag: 'day1',     label: 'Day 1',     emoji: '☀️' },
    { index: 5, tag: 'bombshell',label: 'Bombshell',  emoji: '💣' },
    { index: 6, tag: 'og_era',   label: 'OG Era',    emoji: '🕰️' },
    { index: 7, tag: 'season6',  label: 'S6+',       emoji: '6️⃣' },
  ];

  // Slot 8 (bottom-center, 4 connections) alternates daily between 2 tags
  // (These are the only remaining tags not used by fixed slots)
  const ROTATING_SLOTS = [
    { tag: 'finale',    label: 'Finale',    emoji: '🏆' },
    { tag: 'casa',      label: 'Casa Amor', emoji: '🏠' },
  ];

  // Active slot config
  let activeSlot8 = ROTATING_SLOTS[0];
  let SLOT_TAGS = FIXED_SLOTS.map(s => s.tag).concat(activeSlot8.tag);
  let SLOT_LABELS = FIXED_SLOTS.map(s => ({ ...s })).concat({ index: 8, ...activeSlot8 });

  /**
   * Set the rotating slot based on date.
   */
  function setDailySlots(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const dayOfYear = Math.floor((d - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
    const idx = dayOfYear % ROTATING_SLOTS.length;
    activeSlot8 = ROTATING_SLOTS[idx];
    SLOT_TAGS = FIXED_SLOTS.map(s => s.tag).concat(activeSlot8.tag);
    SLOT_LABELS = FIXED_SLOTS.map(s => ({ ...s })).concat({ index: 8, ...activeSlot8 });
    return activeSlot8;
  }

  function getSlotLabels() {
    return SLOT_LABELS;
  }

  function getRotatingSlot() {
    return activeSlot8;
  }

  // ═══ SCORING CONSTANTS (Final Balanced — Connection-Focused) ═══
  const SLOT_MATCH_PTS = 2;          // Contestant matches slot trait
  const COUNTRY_MATCH_PTS = 1;       // Connected cards share country
  const SEASON_MATCH_PTS = 1;        // Connected cards share season
  const COUNTRY_SEASON_COMBO = 2;    // Bonus when BOTH country + season match (total = 1+1+2 = 4)
  const COUPLE_BONUS_PTS = 4;        // Connected cards are a real couple
  const RARITY_BASE = { 1: 0, 2: 1, 3: 2, 4: 3 };  // Star → bonus points (not the core)
  const ALL_FILLED_BONUS = 8;        // All 9 slots filled with valid placements

  // ═══ SCORING FUNCTIONS ═══

  /**
   * Check if contestant matches the slot's required trait.
   */
  function isValidPlacement(contestant, slotIndex) {
    if (!contestant) return false;
    return contestant.tags.includes(SLOT_TAGS[slotIndex]);
  }

  /**
   * Get neighbors for a given slot index.
   */
  function getNeighbors(slotIndex) {
    return ADJACENCY[slotIndex];
  }

  /**
   * Calculate the full score breakdown for a board state.
   * Returns detailed per-cell and aggregate scoring.
   */
  function calculateScore(board) {
    const cellScores = [];

    for (let i = 0; i < NUM_SLOTS; i++) {
      const c = board[i];
      const cell = {
        index: i,
        contestant: c,
        slotTag: SLOT_TAGS[i],
        isValid: c ? isValidPlacement(c, i) : null,
        slotPoints: 0,
        rarityPoints: 0,
        connectionPoints: 0,
        couplePoints: 0,
        totalPoints: 0,
        connections: [],   // detailed connection info for UI
      };

      if (!c) {
        cellScores.push(cell);
        continue;
      }

      // Slot match
      if (cell.isValid) {
        cell.slotPoints = SLOT_MATCH_PTS;
      }

      // Rarity base
      cell.rarityPoints = RARITY_BASE[c.stars] || 0;

      // Connection scoring — check each neighbor
      const neighbors = ADJACENCY[i];
      for (const ni of neighbors) {
        const nc = board[ni];
        if (!nc) continue;

        const conn = { neighborIndex: ni, neighborName: nc.name, points: 0, types: [] };

        const sameCountry = c.show === nc.show;
        const sameSeason = c.season === nc.season;
        const isCouple = (c.couple && c.couple === nc.name) || (nc.couple && nc.couple === c.name);

        if (sameCountry && sameSeason) {
          // Country + Season combo
          conn.points += COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
          conn.types.push('country', 'season', 'combo');
        } else {
          if (sameCountry) {
            conn.points += COUNTRY_MATCH_PTS;
            conn.types.push('country');
          }
          if (sameSeason) {
            conn.points += SEASON_MATCH_PTS;
            conn.types.push('season');
          }
        }

        if (isCouple) {
          conn.points += COUPLE_BONUS_PTS;
          conn.types.push('couple');
        }

        if (conn.points > 0) {
          cell.connectionPoints += conn.points;
          cell.connections.push(conn);
        }
      }

      cell.totalPoints = cell.slotPoints + cell.rarityPoints + cell.connectionPoints + cell.couplePoints;
      cellScores.push(cell);
    }

    // All-filled bonus
    const allFilled = board.every(c => c !== null);
    const allValid = allFilled && board.every((c, i) => isValidPlacement(c, i));
    const gridBonus = allValid ? ALL_FILLED_BONUS : 0;

    // Aggregate
    const totalSlot = cellScores.reduce((s, c) => s + c.slotPoints, 0);
    const totalRarity = cellScores.reduce((s, c) => s + c.rarityPoints, 0);
    const totalConnections = cellScores.reduce((s, c) => s + c.connectionPoints, 0);
    const total = cellScores.reduce((s, c) => s + c.totalPoints, 0) + gridBonus;

    // Count couples found
    const coupleEdges = [];
    const countedCouples = new Set();
    for (const cs of cellScores) {
      for (const conn of cs.connections) {
        if (conn.types.includes('couple')) {
          const key = Math.min(cs.index, conn.neighborIndex) + '-' + Math.max(cs.index, conn.neighborIndex);
          if (!countedCouples.has(key)) {
            countedCouples.add(key);
            coupleEdges.push({ index1: cs.index, index2: conn.neighborIndex });
          }
        }
      }
    }

    return {
      total,
      totalSlot,
      totalRarity,
      totalConnections,
      gridBonus,
      allFilled,
      allValid,
      cellScores,
      coupleEdges,
      edgeCount: EDGES.length,
    };
  }

  /**
   * Get per-cell bonus summary for UI display.
   */
  function getCellBonuses(board) {
    const score = calculateScore(board);
    const bonuses = new Map();
    for (const cs of score.cellScores) {
      const coupleConns = cs.connections.filter(c => c.types.includes('couple'));
      const seasonConns = cs.connections.filter(c => c.types.includes('season') || c.types.includes('combo'));
      bonuses.set(cs.index, {
        coupleBonus: coupleConns.reduce((s, c) => s + COUPLE_BONUS_PTS, 0),
        seasonBonus: seasonConns.length,
        connectionTotal: cs.connectionPoints,
        couplePair: coupleConns.length > 0 ? coupleConns[0].neighborName : null,
      });
    }
    return bonuses;
  }

  // ═══ PUBLIC API ═══
  return {
    NUM_SLOTS,
    EDGES,
    ADJACENCY,
    FIXED_SLOTS,
    ROTATING_SLOTS,
    SLOT_MATCH_PTS,
    COUNTRY_MATCH_PTS,
    SEASON_MATCH_PTS,
    COUNTRY_SEASON_COMBO,
    COUPLE_BONUS_PTS,
    RARITY_BASE,
    ALL_FILLED_BONUS,
    get SLOT_TAGS() { return SLOT_TAGS; },
    get SLOT_LABELS() { return SLOT_LABELS; },
    setDailySlots,
    getSlotLabels,
    getRotatingSlot,
    isValidPlacement,
    getNeighbors,
    calculateScore,
    getCellBonuses,
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scoring;
}
