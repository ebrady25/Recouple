/**
 * RECOUPLE v2 — Game Controller
 * ==============================
 * State machine for 9-card Griddy board.
 * Phases: idle → drafting → optimizing → completed
 */

const Game = (() => {

  let state = {
    date: null,
    gameNumber: 0,
    round: 0,
    allRounds: [],
    board: new Array(9).fill(null),
    drafted: [],
    selectedIndex: null,
    phase: 'idle',    // idle | drafting | optimizing | completed
    score: null,
    contestants: []
  };

  let onStateChange = null;

  function setOnStateChange(cb) { onStateChange = cb; }
  function notifyUI() { if (onStateChange) onStateChange({ ...state }); }
  function recalcScore() { state.score = Scoring.calculateScore(state.board); }

  function initGame(contestants, gameNumber, date) {
    date = date || Storage.todayStr();
    state.contestants = contestants;
    state.date = date;
    state.gameNumber = gameNumber;
    state.round = 0;
    state.board = new Array(9).fill(null);
    state.drafted = [];
    state.selectedIndex = null;
    state.phase = 'drafting';

    Scoring.setDailySlots(date);
    const seed = Draft.getDailySeed(date, gameNumber);
    state.allRounds = Draft.generateAllRounds(contestants, seed);

    recalcScore();
    saveCurrentState();
    notifyUI();
  }

  function resumeGame(savedState) {
    Object.assign(state, savedState);
    state.selectedIndex = null;
    Scoring.setDailySlots(state.date);
    recalcScore();
    notifyUI();
  }

  function getDraftOptions() {
    if (state.round >= Draft.NUM_ROUNDS) return null;
    return state.allRounds[state.round];
  }

  /**
   * Draft a contestant and place in a specific cell.
   */
  function draftToCell(optionIndex, cellIndex) {
    if (state.phase !== 'drafting' || state.round >= Draft.NUM_ROUNDS) return false;
    const options = getDraftOptions();
    if (!options || optionIndex < 0 || optionIndex >= 3) return false;
    if (cellIndex < 0 || cellIndex >= 9) return false;

    const contestant = { ...options[optionIndex] };
    state.drafted.push(contestant);

    // If target cell occupied, displace to first empty
    if (state.board[cellIndex] !== null) {
      const displaced = state.board[cellIndex];
      const emptyIdx = state.board.indexOf(null);
      if (emptyIdx !== -1) state.board[emptyIdx] = displaced;
    }

    state.board[cellIndex] = contestant;
    state.selectedIndex = null;
    state.round++;

    if (state.round >= Draft.NUM_ROUNDS) {
      state.phase = 'optimizing';
    }

    recalcScore();
    saveCurrentState();
    notifyUI();
    return true;
  }

  /**
   * Draft to first empty cell (fallback).
   */
  function draftContestant(optionIndex) {
    const emptyIdx = state.board.indexOf(null);
    if (emptyIdx === -1) return false;
    return draftToCell(optionIndex, emptyIdx);
  }

  function swapCells(i1, i2) {
    if (i1 === i2 || i1 < 0 || i1 >= 9 || i2 < 0 || i2 >= 9) return false;
    [state.board[i1], state.board[i2]] = [state.board[i2], state.board[i1]];
    recalcScore();
    saveCurrentState();
    notifyUI();
    return true;
  }

  function selectCell(index) {
    if (state.phase !== 'drafting' && state.phase !== 'optimizing') return;
    if (state.selectedIndex === null) {
      if (state.board[index]) {
        state.selectedIndex = index;
        notifyUI();
      }
    } else if (state.selectedIndex === index) {
      state.selectedIndex = null;
      notifyUI();
    } else {
      const from = state.selectedIndex;
      state.selectedIndex = null;
      swapCells(from, index);
    }
  }

  function completeGame() {
    if (state.phase === 'completed') return state.score;
    state.phase = 'completed';
    recalcScore();

    Storage.completeGame(state.date, state.gameNumber, state.score.total, state.board);
    Storage.updateStats(state.score.total, state.score.allValid, state.date);
    Storage.clearGameState();
    notifyUI();
    return state.score;
  }

  function getShareText() {
    if (!state.score) recalcScore();
    return Storage.generateShareText(state.date, state.gameNumber, state.score.total, state.board, state.score);
  }

  async function shareResults() {
    const text = getShareText();
    if (navigator.share) {
      try { await navigator.share({ text }); return true; } catch(e) {}
    }
    try { await navigator.clipboard.writeText(text); return true; }
    catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      return true;
    }
  }

  function saveCurrentState() {
    Storage.saveGameState({
      date: state.date, gameNumber: state.gameNumber,
      round: state.round, allRounds: state.allRounds,
      board: state.board, drafted: state.drafted, phase: state.phase
    });
  }

  function tryResume() {
    const saved = Storage.loadGameState();
    if (!saved) return false;
    if (saved.date !== Storage.todayStr()) { Storage.clearGameState(); return false; }
    if (saved.phase === 'completed') { Storage.clearGameState(); return false; }
    resumeGame(saved);
    return true;
  }

  function getState() { return { ...state }; }

  function haptic(type) {
    if (!navigator.vibrate) return;
    const patterns = { light: 10, medium: 25, heavy: 50, success: [15,50,15,50,15], error: [50,30,50] };
    navigator.vibrate(patterns[type] || 10);
  }

  return {
    initGame, resumeGame, getDraftOptions, draftContestant, draftToCell,
    swapCells, selectCell, completeGame, getShareText, shareResults,
    tryResume, getState, setOnStateChange, haptic, recalcScore
  };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = Game;
