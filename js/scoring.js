/**
 * RECOUPLE v2 — Griddy Scoring Engine
 * =====================================
 * 9-card board with updated topology:
 *
 *      [0:Winner]────[1:Bombshell]
 *       / \            / \
 *   [2:WILD] [3:USA]──[4:UK] [5:WILD]
 *       \ / \      / \ /
 *      [6:Day1] [8:Casa] [7:Coupled]
 *
 * WILD slots (2, 5) accept any contestant but give 0 slot points.
 * Slot 8 is always Casa Amor (no more rotation).
 */

const Scoring = (() => {

  // ═══ BOARD TOPOLOGY ═══
  const NUM_SLOTS = 9;

  const EDGES = [
    [0, 1],   // Winner ↔ Bombshell
    [0, 2],   // Winner ↔ WILD-L
    [0, 3],   // Winner ↔ USA
    [1, 4],   // Bombshell ↔ UK
    [1, 5],   // Bombshell ↔ WILD-R
    [3, 4],   // USA ↔ UK (center pair)
    [3, 2],   // USA ↔ WILD-L
    [4, 5],   // UK ↔ WILD-R
    [3, 6],   // USA ↔ Day1
    [3, 8],   // USA ↔ Casa
    [4, 7],   // UK ↔ Coupled
    [4, 8],   // UK ↔ Casa
    [2, 6],   // WILD-L ↔ Day1
    [5, 7],   // WILD-R ↔ Coupled
    [6, 8],   // Day1 ↔ Casa
    [7, 8],   // Coupled ↔ Casa
  ];

  const ADJACENCY = Array.from({ length: NUM_SLOTS }, () => []);
  for (const [a, b] of EDGES) {
    ADJACENCY[a].push(b);
    ADJACENCY[b].push(a);
  }

  // ═══ SLOT DEFINITIONS ═══
  // null = WILD (any contestant valid, 0 slot points)
  const SLOT_TAGS = ['winner', 'bombshell', null, 'usa', 'uk', null, 'day1', 'coupled', 'casa'];

  const SLOT_LABELS = [
    { index: 0, tag: 'winner',    label: 'Winner',    emoji: '👑' },
    { index: 1, tag: 'bombshell', label: 'Bombshell', emoji: '💣' },
    { index: 2, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 3, tag: 'usa',       label: 'USA',       emoji: '🇺🇸' },
    { index: 4, tag: 'uk',        label: 'UK',        emoji: '🇬🇧' },
    { index: 5, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 6, tag: 'day1',      label: 'Day 1',     emoji: '☀️' },
    { index: 7, tag: 'coupled',   label: 'Coupled',   emoji: '💑' },
    { index: 8, tag: 'casa',      label: 'Casa Amor', emoji: '🏠' },
  ];

  // ═══ SCORING CONSTANTS (Option C — Connection-Focused) ═══
  const SLOT_MATCH_PTS = 2;          // Contestant matches slot trait (0 for WILD)
  const COUNTRY_MATCH_PTS = 2;       // Connected cards share country (boosted from 1)
  const SEASON_MATCH_PTS = 1;        // Connected cards share season
  const COUNTRY_SEASON_COMBO = 2;    // Bonus when BOTH match (total = 2+1+2 = 5 per person)
  const COUPLE_BONUS_PTS = 4;        // Connected cards are a real couple
  const RARITY_BASE = { 1: 0, 2: 1, 3: 2, 4: 3 };
  const ALL_VALID_BONUS = 6;         // All 7 non-WILD slots filled correctly

  // ═══ SCORING FUNCTIONS ═══

  function isValidPlacement(contestant, slotIndex) {
    if (!contestant) return false;
    const tag = SLOT_TAGS[slotIndex];
    if (tag === null) return true; // WILD = always valid
    return contestant.tags.includes(tag);
  }

  function isWildSlot(slotIndex) {
    return SLOT_TAGS[slotIndex] === null;
  }

  function getNeighbors(slotIndex) {
    return ADJACENCY[slotIndex];
  }

  function getSlotLabels() {
    return SLOT_LABELS;
  }

  /**
   * No more rotating slots — stub for compatibility.
   */
  function setDailySlots() { return { tag: 'casa', label: 'Casa Amor', emoji: '🏠' }; }
  function getRotatingSlot() { return { tag: 'casa', label: 'Casa Amor', emoji: '🏠' }; }

  /**
   * Score a single edge (both directions summed).
   * Returns total points for BOTH cards from this connection.
   */
  function scoreEdge(c1, c2) {
    if (!c1 || !c2) return { total: 0, perPerson: 0, types: [] };
    const sameCountry = c1.show === c2.show;
    const sameSeason = c1.season === c2.season;
    const isCouple = (c1.couple && c1.couple === c2.name) || (c2.couple && c2.couple === c1.name);

    let perPerson = 0;
    const types = [];

    if (sameCountry && sameSeason) {
      perPerson += COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
      types.push('country', 'season', 'combo');
    } else {
      if (sameCountry) { perPerson += COUNTRY_MATCH_PTS; types.push('country'); }
      if (sameSeason) { perPerson += SEASON_MATCH_PTS; types.push('season'); }
    }
    if (isCouple) { perPerson += COUPLE_BONUS_PTS; types.push('couple'); }

    return { total: perPerson * 2, perPerson, types };
  }

  /**
   * Full score calculation with detailed breakdown.
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
        isWild: isWildSlot(i),
        slotPoints: 0,
        rarityPoints: 0,
        connectionPoints: 0,
        totalPoints: 0,
        connections: [],
      };

      if (!c) { cellScores.push(cell); continue; }

      // Slot match: WILD slots give 0, others give 2 if valid
      if (!cell.isWild && cell.isValid) {
        cell.slotPoints = SLOT_MATCH_PTS;
      }

      // Rarity
      cell.rarityPoints = RARITY_BASE[c.stars] || 0;

      // Connections
      for (const ni of ADJACENCY[i]) {
        const nc = board[ni];
        if (!nc) continue;

        const conn = { neighborIndex: ni, neighborName: nc.name, points: 0, types: [] };
        const sameCountry = c.show === nc.show;
        const sameSeason = c.season === nc.season;
        const isCouple = (c.couple && c.couple === nc.name) || (nc.couple && nc.couple === c.name);

        if (sameCountry && sameSeason) {
          conn.points += COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
          conn.types.push('country', 'season', 'combo');
        } else {
          if (sameCountry) { conn.points += COUNTRY_MATCH_PTS; conn.types.push('country'); }
          if (sameSeason) { conn.points += SEASON_MATCH_PTS; conn.types.push('season'); }
        }
        if (isCouple) { conn.points += COUPLE_BONUS_PTS; conn.types.push('couple'); }

        if (conn.points > 0) {
          cell.connectionPoints += conn.points;
          cell.connections.push(conn);
        }
      }

      cell.totalPoints = cell.slotPoints + cell.rarityPoints + cell.connectionPoints;
      cellScores.push(cell);
    }

    // Perfect board: all 9 slots filled, all non-WILD slots valid
    const allFilled = board.every(c => c !== null);
    const allValid = allFilled && board.every((c, i) => isValidPlacement(c, i));
    const gridBonus = allValid ? ALL_VALID_BONUS : 0;

    // Aggregates
    const totalSlot = cellScores.reduce((s, c) => s + c.slotPoints, 0);
    const totalRarity = cellScores.reduce((s, c) => s + c.rarityPoints, 0);
    const totalConnections = cellScores.reduce((s, c) => s + c.connectionPoints, 0);
    const total = cellScores.reduce((s, c) => s + c.totalPoints, 0) + gridBonus;

    // Couple edges (deduplicated)
    const coupleEdges = [];
    const counted = new Set();
    for (const cs of cellScores) {
      for (const conn of cs.connections) {
        if (conn.types.includes('couple')) {
          const key = Math.min(cs.index, conn.neighborIndex) + '-' + Math.max(cs.index, conn.neighborIndex);
          if (!counted.has(key)) {
            counted.add(key);
            coupleEdges.push({ index1: cs.index, index2: conn.neighborIndex });
          }
        }
      }
    }

    return {
      total, totalSlot, totalRarity, totalConnections, gridBonus,
      allFilled, allValid, cellScores, coupleEdges, edgeCount: EDGES.length,
    };
  }

  // ═══ OPTIMAL SCORE CALCULATOR ═══

  /**
   * Fast scoring function for brute-force permutation search.
   * Counts each edge once (not per-person) and doubles at the end.
   */
  function _fastScore(board) {
    let total = 0;

    // Slot + rarity (per card)
    for (let i = 0; i < 9; i++) {
      const c = board[i];
      if (!c) continue;
      const tag = SLOT_TAGS[i];
      if (tag !== null && c.tags.includes(tag)) total += SLOT_MATCH_PTS;
      total += RARITY_BASE[c.stars] || 0;
    }

    // Connections (each edge scored once, both persons get points)
    for (const [a, b] of EDGES) {
      const ca = board[a], cb = board[b];
      if (!ca || !cb) continue;
      const sc = ca.show === cb.show;
      const ss = ca.season === cb.season;
      let edgePts = 0;
      if (sc && ss) edgePts = COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
      else { if (sc) edgePts += COUNTRY_MATCH_PTS; if (ss) edgePts += SEASON_MATCH_PTS; }
      const ic = (ca.couple && ca.couple === cb.name) || (cb.couple && cb.couple === ca.name);
      if (ic) edgePts += COUPLE_BONUS_PTS;
      total += edgePts * 2; // both persons score
    }

    // Perfect board bonus
    let valid = true;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) { valid = false; break; }
      const tag = SLOT_TAGS[i];
      if (tag !== null && !board[i].tags.includes(tag)) { valid = false; break; }
    }
    if (valid) total += ALL_VALID_BONUS;

    return total;
  }

  /**
   * Find the optimal score for a set of 9 drafted cards.
   * Uses Heap's algorithm to enumerate all 9! = 362,880 permutations.
   * Returns { optimalScore, percentage } where percentage = yourScore / optimalScore * 100.
   *
   * @param {Array} cards - The 9 drafted contestants (with stars)
   * @param {number} currentScore - The player's current score
   * @returns {{ optimalScore: number, percentage: number }}
   */
  function calculateOptimal(cards, currentScore) {
    if (cards.length !== 9) return { optimalScore: currentScore, percentage: 100 };

    const board = [...cards];
    let bestScore = _fastScore(board);

    // Heap's algorithm for permutations
    const c = new Array(9).fill(0);
    let i = 1;
    while (i < 9) {
      if (c[i] < i) {
        if (i % 2 === 0) [board[0], board[i]] = [board[i], board[0]];
        else [board[c[i]], board[i]] = [board[i], board[c[i]]];
        const score = _fastScore(board);
        if (score > bestScore) bestScore = score;
        c[i]++;
        i = 1;
      } else {
        c[i] = 0;
        i++;
      }
    }

    const percentage = bestScore > 0 ? Math.round((currentScore / bestScore) * 100) : 100;
    return { optimalScore: bestScore, percentage };
  }

  // ═══ PUBLIC API ═══
  return {
    NUM_SLOTS, EDGES, ADJACENCY,
    SLOT_TAGS, SLOT_LABELS,
    SLOT_MATCH_PTS, COUNTRY_MATCH_PTS, SEASON_MATCH_PTS,
    COUNTRY_SEASON_COMBO, COUPLE_BONUS_PTS, RARITY_BASE, ALL_VALID_BONUS,
    setDailySlots, getSlotLabels, getRotatingSlot,
    isValidPlacement, isWildSlot, getNeighbors,
    calculateScore, calculateOptimal,
  };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
