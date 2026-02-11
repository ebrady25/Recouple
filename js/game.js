/**
 * RECOUPLE — Game Controller
 * ==========================
 * Central game state machine that coordinates draft, board, scoring, and storage.
 * This is the API the UI layer calls.
 */

const Game = (() => {

  // ─── State ───
  let state = {
    date: null,
    gameNumber: 0,
    round: 0,              // 0-indexed, 0-11 = draft phase, 12 = optimization phase
    allRounds: [],          // Pre-generated draft options for all 12 rounds
    board: new Array(12).fill(null),  // 3×4 grid, flat array
    drafted: [],            // All drafted contestants (for reference)
    selectedIndex: null,    // Currently selected cell for swapping
    phase: 'idle',          // 'idle' | 'drafting' | 'placing' | 'optimizing' | 'completed'
    score: null,            // Current score breakdown
    contestants: []         // Full contestant database
  };

  // Callbacks for UI updates
  let onStateChange = null;

  function setOnStateChange(callback) {
    onStateChange = callback;
  }

  function notifyUI() {
    if (onStateChange) onStateChange({ ...state });
  }

  /**
   * Recalculate score and update state.
   */
  function recalcScore() {
    state.score = Scoring.calculateScore(state.board);
  }

  /**
   * Initialize a new game.
   * @param {Array} contestants - Full contestant database
   * @param {number} gameNumber - 1, 2, or 3
   * @param {string} date - ISO date string (defaults to today)
   */
  function initGame(contestants, gameNumber, date) {
    date = date || Storage.todayStr();
    state.contestants = contestants;
    state.date = date;
    state.gameNumber = gameNumber;
    state.round = 0;
    state.board = new Array(12).fill(null);
    state.drafted = [];
    state.selectedIndex = null;
    state.phase = 'drafting';

    // Set today's rotating column
    const col4 = Scoring.setDailyColumn(date);

    // Generate deterministic draft for all 12 rounds
    const seed = Draft.getDailySeed(date, gameNumber);
    state.allRounds = Draft.generateAllRounds(contestants, seed);

    recalcScore();
    
    // Save initial state
    saveCurrentState();
    notifyUI();
  }

  /**
   * Resume a game from saved state.
   */
  function resumeGame(savedState) {
    Object.assign(state, savedState);
    state.selectedIndex = null;
    // Restore the daily column for the saved date
    Scoring.setDailyColumn(state.date);
    recalcScore();
    notifyUI();
  }

  /**
   * Get current round's draft options (3 cards).
   */
  function getDraftOptions() {
    if (state.round >= 12) return null;
    return state.allRounds[state.round];
  }

  /**
   * Player selects a contestant from the draft.
   * Auto-places in first empty cell.
   * @param {number} optionIndex - 0, 1, or 2 (which of the 3 cards)
   */
  function draftContestant(optionIndex) {
    if (state.phase !== 'drafting' || state.round >= 12) return false;

    const options = getDraftOptions();
    if (!options || optionIndex < 0 || optionIndex >= 3) return false;

    const contestant = { ...options[optionIndex] };
    state.drafted.push(contestant);

    // Find first empty cell
    const emptyIndex = state.board.indexOf(null);
    if (emptyIndex !== -1) {
      state.board[emptyIndex] = contestant;
    }

    // Advance round
    state.round++;

    if (state.round >= 12) {
      state.phase = 'optimizing';
    }

    recalcScore();
    saveCurrentState();
    notifyUI();
    return true;
  }

  /**
   * Swap two cells on the board.
   * Works during both drafting and optimizing phases.
   */
  function swapCells(index1, index2) {
    if (index1 === index2) return false;
    if (index1 < 0 || index1 >= 12 || index2 < 0 || index2 >= 12) return false;

    // Swap
    const temp = state.board[index1];
    state.board[index1] = state.board[index2];
    state.board[index2] = temp;

    recalcScore();
    saveCurrentState();
    notifyUI();
    return true;
  }

  /**
   * Select a cell for swapping (UI toggle).
   * First click selects, second click on different cell swaps.
   */
  function selectCell(index) {
    if (state.phase !== 'drafting' && state.phase !== 'optimizing') return;

    if (state.selectedIndex === null) {
      // First selection — only select if cell has a contestant
      if (state.board[index]) {
        state.selectedIndex = index;
        notifyUI();
      }
    } else if (state.selectedIndex === index) {
      // Deselect
      state.selectedIndex = null;
      notifyUI();
    } else {
      // Swap with selected
      const swapFrom = state.selectedIndex;
      state.selectedIndex = null;
      swapCells(swapFrom, index);
    }
  }

  /**
   * Finalize the game. Saves to daily progress and updates stats.
   */
  function completeGame() {
    if (state.phase === 'completed') return state.score;

    state.phase = 'completed';
    recalcScore();

    // Save to daily progress
    Storage.completeGame(
      state.date,
      state.gameNumber,
      state.score.total,
      state.board
    );

    // Update stats
    Storage.updateStats(
      state.score.total,
      state.score.perfectGrid.isPerfect,
      state.date
    );

    Storage.clearGameState();
    notifyUI();
    return state.score;
  }

  /**
   * Get shareable text for completed game.
   */
  function getShareText() {
    if (!state.score) recalcScore();
    return Storage.generateShareText(
      state.date,
      state.gameNumber,
      state.score.total,
      state.board,
      state.score
    );
  }

  /**
   * Copy share text to clipboard.
   */
  async function shareResults() {
    const text = getShareText();
    
    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return true;
      } catch (e) {
        // User cancelled or not supported, fall through to clipboard
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Final fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  }

  /**
   * Save current game state to localStorage.
   */
  function saveCurrentState() {
    Storage.saveGameState({
      date: state.date,
      gameNumber: state.gameNumber,
      round: state.round,
      allRounds: state.allRounds,
      board: state.board,
      drafted: state.drafted,
      phase: state.phase
    });
  }

  /**
   * Try to load and resume a saved game.
   * Returns true if a game was resumed.
   */
  function tryResume() {
    const saved = Storage.loadGameState();
    if (!saved) return false;

    // Check if it's from today
    const today = Storage.todayStr();
    if (saved.date !== today) {
      Storage.clearGameState();
      return false;
    }

    // Check if the game is still in progress
    if (saved.phase === 'completed') {
      Storage.clearGameState();
      return false;
    }

    resumeGame(saved);
    return true;
  }

  /**
   * Get the current game state (read-only copy).
   */
  function getState() {
    return { ...state };
  }

  /**
   * Haptic feedback helper.
   */
  function haptic(type) {
    if (!navigator.vibrate) return;
    switch (type) {
      case 'light':   navigator.vibrate(10); break;
      case 'medium':  navigator.vibrate(25); break;
      case 'heavy':   navigator.vibrate(50); break;
      case 'success': navigator.vibrate([15, 50, 15, 50, 15]); break;
      case 'error':   navigator.vibrate([50, 30, 50]); break;
    }
  }

  // Public API
  return {
    initGame,
    resumeGame,
    getDraftOptions,
    draftContestant,
    swapCells,
    selectCell,
    completeGame,
    getShareText,
    shareResults,
    tryResume,
    getState,
    setOnStateChange,
    haptic,
    recalcScore
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Game;
}
