/**
 * RECOUPLE v2 — Storage Module
 * =============================
 * localStorage with safe fallbacks. Adapted for 9-card Griddy board.
 */

const Storage = (() => {

  const PREFIX = 'recouple_';

  function _key(name) { return PREFIX + name; }
  function _get(key) {
    try { const r = localStorage.getItem(_key(key)); return r ? JSON.parse(r) : null; }
    catch(e) { return null; }
  }
  function _set(key, value) {
    try { localStorage.setItem(_key(key), JSON.stringify(value)); return true; }
    catch(e) { return false; }
  }
  function _remove(key) {
    try { localStorage.removeItem(_key(key)); } catch(e) {}
  }

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  // ─── Game State ───
  function saveGameState(state) { return _set('game_state', state); }
  function loadGameState() { return _get('game_state'); }
  function clearGameState() { _remove('game_state'); }

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

  function completeGame(date, gameNumber, score, finalBoard) {
    const progress = getDailyProgress(date);
    progress['game' + gameNumber] = { completed: true, score, finalBoard };
    saveDailyProgress(date, progress);
    return progress;
  }

  // Testing mode: unlimited replays
  function getNextGameNumber(date) {
    const progress = getDailyProgress(date);
    if (!progress.game1.completed) return 1;
    if (!progress.game2.completed) return 2;
    if (!progress.game3.completed) return 3;
    return 1; // cycle back for testing
  }

  // ─── Statistics ───
  function getStats() {
    return _get('stats') || {
      gamesPlayed: 0, totalScore: 0, averageScore: 0,
      bestScore: 0, currentStreak: 0, longestStreak: 0,
      perfectGrids: 0, lastPlayedDate: null
    };
  }

  function updateStats(score, isPerfectGrid, date) {
    const stats = getStats();
    stats.gamesPlayed++;
    stats.totalScore += score;
    stats.averageScore = Math.round((stats.totalScore / stats.gamesPlayed) * 10) / 10;
    stats.bestScore = Math.max(stats.bestScore, score);
    if (isPerfectGrid) stats.perfectGrids++;

    const today = date || todayStr();
    if (stats.lastPlayedDate) {
      const diff = Math.floor((new Date(today) - new Date(stats.lastPlayedDate)) / 86400000);
      if (diff === 1) stats.currentStreak++;
      else if (diff > 1) stats.currentStreak = 1;
    } else {
      stats.currentStreak = 1;
    }
    stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
    stats.lastPlayedDate = today;

    _set('stats', stats);
    return stats;
  }

  // ─── Share Results ───
  function generateShareText(date, gameNumber, score, board, scoreBreakdown) {
    const d = new Date(date);
    const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;

    // Build star layout matching board topology
    const s = (i) => board[i] ? '⭐'.repeat(board[i].stars) : '⬛';
    let starGrid = '';
    starGrid += `    ${s(0)}  ${s(1)}\n`;
    starGrid += `  ${s(2)} ${s(3)}  ${s(4)} ${s(5)}\n`;
    starGrid += `   ${s(6)}  ${s(8)}  ${s(7)}\n`;

    const extras = [];
    if (scoreBreakdown.coupleEdges.length > 0) extras.push(`Couples: ${scoreBreakdown.coupleEdges.length} 💕`);
    if (scoreBreakdown.allValid) extras.push('Perfect Board! 🎉');

    let text = `Recouple ${dateStr} - Game ${gameNumber} 🏝️\nScore: ${score}pts\n${starGrid}`;
    if (extras.length) text += extras.join(' | ');
    return text.trim();
  }

  return {
    todayStr, saveGameState, loadGameState, clearGameState,
    getDailyProgress, saveDailyProgress, completeGame, getNextGameNumber,
    getStats, updateStats, generateShareText
  };

})();

if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
