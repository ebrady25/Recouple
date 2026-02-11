/**
 * RECOUPLE — Storage Module
 * =========================
 * Handles all localStorage operations with safe fallbacks.
 * Keys are prefixed with 'recouple_' to avoid collisions.
 */

const Storage = (() => {

  const PREFIX = 'recouple_';

  function _key(name) {
    return PREFIX + name;
  }

  function _get(key) {
    try {
      const raw = localStorage.getItem(_key(key));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Storage read error:', key, e);
      return null;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(_key(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write error:', key, e);
      return false;
    }
  }

  function _remove(key) {
    try {
      localStorage.removeItem(_key(key));
    } catch (e) {
      console.warn('Storage remove error:', key, e);
    }
  }

  // ─── Date Helpers ───

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  // ─── Game State ───

  /**
   * Save current game state.
   * @param {Object} state - { date, gameNumber, round, draftedContestants, board, allRounds, score, completed }
   */
  function saveGameState(state) {
    return _set('game_state', state);
  }

  function loadGameState() {
    return _get('game_state');
  }

  function clearGameState() {
    _remove('game_state');
  }

  // ─── Daily Progress ───

  function getDailyProgress(date) {
    const key = 'daily_' + (date || todayStr());
    return _get(key) || {
      date: date || todayStr(),
      game1: { completed: false, score: 0, finalBoard: null },
      game2: { completed: false, score: 0, finalBoard: null },
      game3: { completed: false, score: 0, finalBoard: null }
    };
  }

  function saveDailyProgress(date, progress) {
    return _set('daily_' + date, progress);
  }

  /**
   * Mark a game as completed for today.
   */
  function completeGame(date, gameNumber, score, finalBoard) {
    const progress = getDailyProgress(date);
    const key = 'game' + gameNumber;
    progress[key] = { completed: true, score, finalBoard };
    saveDailyProgress(date, progress);
    return progress;
  }

  /**
   * Check which game number should be played next.
   * Returns 1, 2, or 3 (or 0 if all done).
   */
  function getNextGameNumber(date) {
    const progress = getDailyProgress(date);
    if (!progress.game1.completed) return 1;
    if (!progress.game2.completed) return 2;
    if (!progress.game3.completed) return 3;
    return 0; // all done
  }

  // ─── Statistics ───

  function getStats() {
    return _get('stats') || {
      gamesPlayed: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: 0,
      currentStreak: 0,
      longestStreak: 0,
      perfectGrids: 0,
      lastPlayedDate: null
    };
  }

  function updateStats(score, isPerfectGrid, date) {
    const stats = getStats();
    stats.gamesPlayed++;
    stats.totalScore += score;
    stats.averageScore = Math.round((stats.totalScore / stats.gamesPlayed) * 10) / 10;
    stats.bestScore = Math.max(stats.bestScore, score);
    
    if (isPerfectGrid) {
      stats.perfectGrids++;
    }

    // Streak logic: check if played yesterday or today
    const today = date || todayStr();
    if (stats.lastPlayedDate) {
      const last = new Date(stats.lastPlayedDate);
      const current = new Date(today);
      const diffDays = Math.floor((current - last) / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 1) {
        // Same day or consecutive day
        if (diffDays === 1) stats.currentStreak++;
        // Same day doesn't change streak
      } else {
        // Streak broken
        stats.currentStreak = 1;
      }
    } else {
      stats.currentStreak = 1;
    }

    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
    stats.lastPlayedDate = today;

    _set('stats', stats);
    return stats;
  }

  // ─── Share Results ───

  /**
   * Generate a shareable text result.
   */
  function generateShareText(date, gameNumber, score, board, scoreBreakdown) {
    const d = new Date(date);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    
    // Build star grid
    let starGrid = '';
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 4; c++) {
        const cell = board[r * 4 + c];
        if (cell) {
          row.push('⭐'.repeat(cell.stars));
        } else {
          row.push('⬛');
        }
      }
      starGrid += row.join(' ') + '\n';
    }

    const coupleCount = scoreBreakdown.couples.pairs.length;
    const extras = [];
    if (coupleCount > 0) extras.push(`Couples: ${coupleCount} 💕`);
    if (scoreBreakdown.perfectGrid.isPerfect) extras.push('Perfect Grid! 🎉');

    let text = `Recouple ${dateStr} - Game ${gameNumber} 🏝️\n`;
    text += `Score: ${score}pts\n`;
    text += starGrid;
    if (extras.length) text += extras.join(' | ');

    return text.trim();
  }

  // Public API
  return {
    todayStr,
    saveGameState,
    loadGameState,
    clearGameState,
    getDailyProgress,
    saveDailyProgress,
    completeGame,
    getNextGameNumber,
    getStats,
    updateStats,
    generateShareText
  };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
