/**
 * RECOUPLE — Scoring Engine
 * =========================
 * Calculates all point values for a given board state.
 * 
 * Board is a 3×4 grid (3 rows, 4 columns):
 *   Rows:    0=LI USA, 1=LI UK, 2=Made Finale
 *   Columns: 0=Winner, 1=Coupled, 2=Casa Amor, 3=Season 6+
 * 
 * Board represented as flat array of 12 cells (row-major):
 *   [0,1,2,3, 4,5,6,7, 8,9,10,11]
 *   Each cell is null (empty) or a drafted contestant object:
 *   { ...contestantData, stars: 1-4, starPoints: 1/2/3/5 }
 */

const Scoring = (() => {

  // Grid dimensions
  const ROWS = 3;
  const COLS = 4;

  // Row criteria tags
  const ROW_TAGS = ['usa', 'uk', 'finale'];

  // Column criteria tags — first 3 are fixed, 4th rotates daily
  const FIXED_COL_TAGS = ['winner', 'coupled', 'casa'];
  
  // Rotating 4th column options
  const ROTATING_COLUMNS = [
    { tag: 'season6', label: 'S6+', emoji: '6️⃣', description: 'Season 6 or later' },
    { tag: 'og_era',  label: 'OG Era', emoji: '🕰️', description: 'Seasons 1-5' },
    { tag: 'bombshell', label: 'Bombshell', emoji: '💣', description: 'Entered mid-season' },
    { tag: 'day1', label: 'Day 1', emoji: '☀️', description: 'Original islander' }
  ];

  // Active column config — set by setDailyColumn()
  let activeCol4 = ROTATING_COLUMNS[0];
  let COL_TAGS = ['winner', 'coupled', 'casa', 'season6'];

  /**
   * Set the rotating 4th column based on date.
   * Cycles through 4 column types based on day-of-year.
   */
  function setDailyColumn(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const dayOfYear = Math.floor((d - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
    const colIndex = dayOfYear % ROTATING_COLUMNS.length;
    activeCol4 = ROTATING_COLUMNS[colIndex];
    COL_TAGS = [...FIXED_COL_TAGS, activeCol4.tag];
    return activeCol4;
  }

  /**
   * Get the current active 4th column config.
   */
  function getActiveColumn4() {
    return activeCol4;
  }

  // Star value mapping
  const STAR_VALUES = { 1: 1, 2: 2, 3: 3, 4: 5 };

  // Bonus values
  const COUPLE_BONUS = 3;      // per person (+6 total for a pair)
  const SEASON_BONUS = 1;      // per person per adjacency
  const ROW_COMPLETE_BONUS = 5;
  const COL_COMPLETE_BONUS = 5;
  const PERFECT_GRID_BONUS = 20;

  /**
   * Convert flat index to {row, col}
   */
  function indexToPos(i) {
    return { row: Math.floor(i / COLS), col: i % COLS };
  }

  /**
   * Convert {row, col} to flat index
   */
  function posToIndex(row, col) {
    return row * COLS + col;
  }

  /**
   * Get orthogonal neighbors (up, down, left, right) for a flat index.
   * Returns array of flat indices.
   */
  function getNeighbors(index) {
    const { row, col } = indexToPos(index);
    const neighbors = [];
    if (row > 0) neighbors.push(posToIndex(row - 1, col));
    if (row < ROWS - 1) neighbors.push(posToIndex(row + 1, col));
    if (col > 0) neighbors.push(posToIndex(row, col - 1));
    if (col < COLS - 1) neighbors.push(posToIndex(row, col + 1));
    return neighbors;
  }

  /**
   * Check if a contestant is validly placed at a given position.
   * Valid = contestant has BOTH the row tag AND the column tag.
   */
  function isValidPlacement(contestant, index) {
    if (!contestant) return false;
    const { row, col } = indexToPos(index);
    const rowTag = ROW_TAGS[row];
    const colTag = COL_TAGS[col];
    return contestant.tags.includes(rowTag) && contestant.tags.includes(colTag);
  }

  /**
   * Calculate base points for a single cell.
   * Valid placement = star value, invalid = 0.
   */
  function cellBasePoints(contestant, index) {
    if (!contestant) return 0;
    return isValidPlacement(contestant, index) ? contestant.starPoints : 0;
  }

  /**
   * Find all couple bonuses on the board.
   * A couple bonus triggers when:
   *   1. Two contestants on the board are a real-life couple (c1.couple === c2.name)
   *   2. They are orthogonally adjacent
   * Returns: { total, pairs: [{ index1, index2, name1, name2 }] }
   */
  function calculateCoupleBonus(board) {
    const pairs = [];
    const counted = new Set(); // avoid double-counting

    for (let i = 0; i < board.length; i++) {
      const c1 = board[i];
      if (!c1 || !c1.couple) continue;

      const neighbors = getNeighbors(i);
      for (const j of neighbors) {
        const c2 = board[j];
        if (!c2) continue;
        if (c1.couple === c2.name) {
          const key = Math.min(i, j) + '-' + Math.max(i, j);
          if (!counted.has(key)) {
            counted.add(key);
            pairs.push({
              index1: i,
              index2: j,
              name1: c1.name,
              name2: c2.name
            });
          }
        }
      }
    }

    return {
      total: pairs.length * COUPLE_BONUS * 2, // +3 per person = +6 per pair
      pairs
    };
  }

  /**
   * Find all same-season adjacency bonuses.
   * +1 per person per adjacency (so if A and B are same season and adjacent, 
   * that's +1 for A and +1 for B = +2 total for that edge).
   * 
   * We count each edge once and multiply by 2.
   * Returns: { total, edges: [{ index1, index2, season }] }
   */
  function calculateSeasonBonus(board) {
    const edges = [];
    const counted = new Set();

    for (let i = 0; i < board.length; i++) {
      const c1 = board[i];
      if (!c1) continue;

      const neighbors = getNeighbors(i);
      for (const j of neighbors) {
        const c2 = board[j];
        if (!c2) continue;

        const key = Math.min(i, j) + '-' + Math.max(i, j);
        if (counted.has(key)) continue;
        counted.add(key);

        if (c1.season === c2.season) {
          edges.push({
            index1: i,
            index2: j,
            season: c1.season
          });
        }
      }
    }

    return {
      total: edges.length * SEASON_BONUS * 2, // +1 per person per edge
      edges
    };
  }

  /**
   * Calculate row completion bonuses.
   * A row is complete when all 4 columns are filled (regardless of validity).
   * Returns: { total, completedRows: [rowIndex, ...] }
   */
  function calculateRowBonus(board) {
    const completedRows = [];
    for (let r = 0; r < ROWS; r++) {
      let complete = true;
      for (let c = 0; c < COLS; c++) {
        if (!board[posToIndex(r, c)]) {
          complete = false;
          break;
        }
      }
      if (complete) completedRows.push(r);
    }
    return {
      total: completedRows.length * ROW_COMPLETE_BONUS,
      completedRows
    };
  }

  /**
   * Calculate column completion bonuses.
   * A column is complete when all 3 rows are filled.
   * Returns: { total, completedCols: [colIndex, ...] }
   */
  function calculateColBonus(board) {
    const completedCols = [];
    for (let c = 0; c < COLS; c++) {
      let complete = true;
      for (let r = 0; r < ROWS; r++) {
        if (!board[posToIndex(r, c)]) {
          complete = false;
          break;
        }
      }
      if (complete) completedCols.push(c);
    }
    return {
      total: completedCols.length * COL_COMPLETE_BONUS,
      completedCols
    };
  }

  /**
   * Check for perfect grid bonus (all 12 cells filled).
   */
  function calculatePerfectGridBonus(board) {
    const isPerfect = board.every(cell => cell !== null);
    return {
      total: isPerfect ? PERFECT_GRID_BONUS : 0,
      isPerfect
    };
  }

  /**
   * Calculate full score breakdown for the current board state.
   * Returns detailed object with every component.
   */
  function calculateScore(board) {
    // Base points per cell
    const cellScores = board.map((contestant, index) => ({
      index,
      contestant,
      basePoints: cellBasePoints(contestant, index),
      isValid: contestant ? isValidPlacement(contestant, index) : null
    }));

    const baseTotal = cellScores.reduce((sum, c) => sum + c.basePoints, 0);

    // Synergy bonuses
    const couples = calculateCoupleBonus(board);
    const seasons = calculateSeasonBonus(board);
    const rows = calculateRowBonus(board);
    const cols = calculateColBonus(board);
    const perfectGrid = calculatePerfectGridBonus(board);

    // Total
    const total = baseTotal + couples.total + seasons.total + rows.total + cols.total + perfectGrid.total;

    return {
      total,
      baseTotal,
      cellScores,
      couples,
      seasons,
      rows,
      cols,
      perfectGrid
    };
  }

  /**
   * Get per-cell bonus breakdown for UI display.
   * Returns a Map: index -> { coupleBonus, seasonBonus, totalBonus }
   */
  function getCellBonuses(board) {
    const bonuses = new Map();
    for (let i = 0; i < board.length; i++) {
      bonuses.set(i, { coupleBonus: 0, seasonBonus: 0, couplePair: null, seasonEdges: 0 });
    }

    const couples = calculateCoupleBonus(board);
    for (const pair of couples.pairs) {
      bonuses.get(pair.index1).coupleBonus += COUPLE_BONUS;
      bonuses.get(pair.index2).coupleBonus += COUPLE_BONUS;
      bonuses.get(pair.index1).couplePair = pair.name2;
      bonuses.get(pair.index2).couplePair = pair.name1;
    }

    const seasons = calculateSeasonBonus(board);
    for (const edge of seasons.edges) {
      bonuses.get(edge.index1).seasonBonus += SEASON_BONUS;
      bonuses.get(edge.index2).seasonBonus += SEASON_BONUS;
      bonuses.get(edge.index1).seasonEdges++;
      bonuses.get(edge.index2).seasonEdges++;
    }

    return bonuses;
  }

  // Public API
  return {
    ROWS, COLS, ROW_TAGS, FIXED_COL_TAGS, ROTATING_COLUMNS, STAR_VALUES,
    COUPLE_BONUS, SEASON_BONUS, ROW_COMPLETE_BONUS, COL_COMPLETE_BONUS, PERFECT_GRID_BONUS,
    get COL_TAGS() { return COL_TAGS; },
    setDailyColumn, getActiveColumn4,
    indexToPos, posToIndex, getNeighbors,
    isValidPlacement, cellBasePoints,
    calculateCoupleBonus, calculateSeasonBonus,
    calculateRowBonus, calculateColBonus, calculatePerfectGridBonus,
    calculateScore, getCellBonuses
  };

})();

// Export for Node.js testing, no-op in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scoring;
}
