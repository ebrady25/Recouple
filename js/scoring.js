/**
 * RECOUPLE v3 — Simplified Scoring Engine
 * ========================================
 * 9-card board, 4 trait slots + 5 WILD:
 *
 *      [0:WILD]──────[1:Bombshell]
 *       / \            / \
 *   [2:WILD] [3:USA]──[4:UK] [5:WILD]
 *       \ / \      / \ /
 *      [6:WILD] [8:Casa] [7:WILD]
 *
 * Only 4 traits matter: usa, uk, bombshell, casa
 * WILD slots accept any contestant but give 0 slot points.
 * No perfect board bonus — score = slots + rarity + connections.
 */

const Scoring = (() => {

  const NUM_SLOTS = 9;

  const EDGES = [
    [0, 1],   // WILD-TL ↔ Bombshell
    [0, 2],   // WILD-TL ↔ WILD-L
    [0, 3],   // WILD-TL ↔ USA
    [1, 4],   // Bombshell ↔ UK
    [1, 5],   // Bombshell ↔ WILD-R
    [3, 4],   // USA ↔ UK (center pair)
    [3, 2],   // USA ↔ WILD-L
    [4, 5],   // UK ↔ WILD-R
    [3, 6],   // USA ↔ WILD-BL
    [3, 8],   // USA ↔ Casa
    [4, 7],   // UK ↔ WILD-BR
    [4, 8],   // UK ↔ Casa
    [2, 6],   // WILD-L ↔ WILD-BL
    [5, 7],   // WILD-R ↔ WILD-BR
    [6, 8],   // WILD-BL ↔ Casa
    [7, 8],   // WILD-BR ↔ Casa
  ];

  const ADJACENCY = Array.from({ length: NUM_SLOTS }, () => []);
  for (const [a, b] of EDGES) {
    ADJACENCY[a].push(b);
    ADJACENCY[b].push(a);
  }

  // null = WILD
  const SLOT_TAGS = [null, 'bombshell', null, 'usa', 'uk', null, null, null, 'casa'];

  const SLOT_LABELS = [
    { index: 0, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 1, tag: 'bombshell', label: 'Bombshell', emoji: '💣' },
    { index: 2, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 3, tag: 'usa',       label: 'USA',       emoji: '🇺🇸' },
    { index: 4, tag: 'uk',        label: 'UK',        emoji: '🇬🇧' },
    { index: 5, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 6, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 7, tag: null,        label: 'Wild',      emoji: '🃏' },
    { index: 8, tag: 'casa',      label: 'Casa Amor', emoji: '🏠' },
  ];

  // Tags that matter for display on cards
  const DISPLAY_TAGS = ['usa', 'uk', 'bombshell', 'casa'];

  // ═══ SCORING CONSTANTS ═══
  const SLOT_MATCH_PTS = 2;
  const COUNTRY_MATCH_PTS = 2;
  const SEASON_MATCH_PTS = 1;
  const COUNTRY_SEASON_COMBO = 2;  // bonus on top of country+season
  const COUPLE_BONUS_PTS = 4;
  const RARITY_BASE = { 1: 0, 2: 1, 3: 2, 4: 3 };
  // No perfect board bonus

  // ═══ FUNCTIONS ═══

  function isValidPlacement(contestant, slotIndex) {
    if (!contestant) return false;
    const tag = SLOT_TAGS[slotIndex];
    if (tag === null) return true;
    return contestant.tags.includes(tag);
  }

  function isWildSlot(slotIndex) {
    return SLOT_TAGS[slotIndex] === null;
  }

  function getNeighbors(slotIndex) {
    return ADJACENCY[slotIndex];
  }

  function getSlotLabels() { return SLOT_LABELS; }
  function getDisplayTags() { return DISPLAY_TAGS; }

  // Stubs for compatibility
  function setDailySlots() { return { tag: 'casa', label: 'Casa Amor', emoji: '🏠' }; }
  function getRotatingSlot() { return { tag: 'casa', label: 'Casa Amor', emoji: '🏠' }; }

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

      // Slot match (WILD = 0)
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
        const sameSeason = c.seasonNum === nc.seasonNum;
        const isCouple = (c.couple && c.couple === nc.name) || (nc.couple && nc.couple === c.name);

        if (sameCountry && sameSeason) {
          conn.points += COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
          conn.types.push('combo');
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

    const totalSlot = cellScores.reduce((s, c) => s + c.slotPoints, 0);
    const totalRarity = cellScores.reduce((s, c) => s + c.rarityPoints, 0);
    const totalConnections = cellScores.reduce((s, c) => s + c.connectionPoints, 0);
    const total = totalSlot + totalRarity + totalConnections;

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
      total, totalSlot, totalRarity, totalConnections,
      gridBonus: 0, allFilled: board.every(c => c !== null),
      allValid: board.every((c, i) => c && isValidPlacement(c, i)),
      cellScores, coupleEdges, edgeCount: EDGES.length,
    };
  }

  // ═══ OPTIMAL SCORE (brute-force 9! permutations) ═══

  function _fastScore(board) {
    let total = 0;
    for (let i = 0; i < 9; i++) {
      const c = board[i]; if (!c) continue;
      const tag = SLOT_TAGS[i];
      if (tag !== null && c.tags.includes(tag)) total += SLOT_MATCH_PTS;
      total += RARITY_BASE[c.stars] || 0;
    }
    for (const [a, b] of EDGES) {
      const ca = board[a], cb = board[b];
      if (!ca || !cb) continue;
      const sc = ca.show === cb.show, ss = ca.seasonNum === cb.seasonNum;
      let e = 0;
      if (sc && ss) e = COUNTRY_MATCH_PTS + SEASON_MATCH_PTS + COUNTRY_SEASON_COMBO;
      else { if (sc) e += COUNTRY_MATCH_PTS; if (ss) e += SEASON_MATCH_PTS; }
      if ((ca.couple && ca.couple === cb.name) || (cb.couple && cb.couple === ca.name)) e += COUPLE_BONUS_PTS;
      total += e * 2;
    }
    return total;
  }

  function calculateOptimal(cards, currentScore) {
    if (!cards || cards.length !== 9) return { optimalScore: currentScore || 0, percentage: 100 };

    const board = [...cards];
    let bestScore = _fastScore(board);

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

  return {
    NUM_SLOTS, EDGES, ADJACENCY,
    SLOT_TAGS, SLOT_LABELS, DISPLAY_TAGS,
    SLOT_MATCH_PTS, COUNTRY_MATCH_PTS, SEASON_MATCH_PTS,
    COUNTRY_SEASON_COMBO, COUPLE_BONUS_PTS, RARITY_BASE,
    setDailySlots, getSlotLabels, getRotatingSlot, getDisplayTags,
    isValidPlacement, isWildSlot, getNeighbors,
    calculateScore, calculateOptimal,
  };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = Scoring;
