/**
 * RECOUPLE — UI Controller
 * ========================
 * Renders game state to DOM, handles events, manages overlays and animations.
 */

const UI = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let contestantsDB = [];
  let selectedDraftIndex = -1;
  let lastScoreTotal = 0;

  const AVATAR_COLORS = [
    ['#764ba2','#f093fb'],['#c94b8e','#ff6b6b'],['#667eea','#a78bfa'],
    ['#f093fb','#ffa07a'],['#ff6b6b','#ffd700'],['#2ed573','#7bed9f'],
    ['#70a1ff','#a78bfa'],['#ff4757','#ff6b9d'],['#ffd700','#ff6b6b'],
    ['#a78bfa','#c94b8e'],['#27ae60','#2ed573'],['#3498db','#70a1ff']
  ];

  function getAvatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  }

  const TAG_CFG = {
    usa:{l:'USA',c:'tag-usa'},uk:{l:'UK',c:'tag-uk'},winner:{l:'👑 WIN',c:'tag-winner'},
    coupled:{l:'💑',c:'tag-coupled'},casa:{l:'🏠 CASA',c:'tag-casa'},
    finale:{l:'🏆',c:'tag-finale'},season6:{l:'S6+',c:'tag-season6'},
    og_era:{l:'🕰️ OG',c:'tag-og'},bombshell:{l:'💣 BOMB',c:'tag-bombshell'},
    day1:{l:'☀️ DAY1',c:'tag-day1'}
  };

  // Which tags to show on draft cards (context-sensitive based on daily column)
  function getVisibleTags(tags) {
    const col4 = Scoring.getActiveColumn4();
    // Always show: show (usa/uk), the 3 fixed columns, the active rotating column, and finale
    const relevant = ['usa', 'uk', 'winner', 'coupled', 'casa', 'finale', col4.tag];
    return tags.filter(t => relevant.includes(t));
  }

  function renderTags(tags) {
    return tags.map(t => TAG_CFG[t] ? `<span class="tag ${TAG_CFG[t].c}">${TAG_CFG[t].l}</span>` : '').join('');
  }

  function renderStars(n) {
    let s = '';
    for (let i = 0; i < 4; i++) s += i < n ? '⭐' : '<span class="star-empty">☆</span>';
    return s;
  }

  // ═══ RENDER DRAFT CARDS ═══
  function renderDraft(state) {
    const container = $('#draft-container');
    const cardsEl = $('#draft-cards');
    const titleEl = $('#draft-title');
    const confirmBtn = $('#btn-confirm');

    if (state.phase === 'drafting' && state.round < 12) {
      container.classList.remove('hidden');
      titleEl.textContent = `🃏 Round ${state.round + 1} — Pick a Contestant`;
      const options = Game.getDraftOptions();
      if (!options) return;

      cardsEl.innerHTML = options.map((c, i) => {
        const colors = getAvatarColor(c.name);
        const photoPath = `images/contestants/${c.id}.jpg`;
        return `<div class="draft-card ${i === selectedDraftIndex ? 'selected' : ''}" data-draft="${i}">
          <div class="card-avatar" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})">
            <img src="${photoPath}" alt="${c.name}" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="initials">${getInitials(c.name)}</span>
          </div>
          <div class="card-name">${c.name}</div>
          <div class="card-stars">${renderStars(c.stars)}</div>
          <div class="card-points">${c.starPoints} pt${c.starPoints>1?'s':''}</div>
          <div class="card-tags">${renderTags(getVisibleTags(c.tags))}</div>
        </div>`;
      }).join('');

      confirmBtn.disabled = selectedDraftIndex === -1;
      $$('.draft-card').forEach(card => {
        card.addEventListener('click', () => {
          selectedDraftIndex = parseInt(card.dataset.draft);
          $$('.draft-card').forEach((c,j) => c.classList.toggle('selected', j === selectedDraftIndex));
          confirmBtn.disabled = false;
          Game.haptic('light');
        });
      });
    } else {
      container.classList.add('hidden');
      selectedDraftIndex = -1;
    }
  }

  // ═══ RENDER BOARD ═══
  function renderBoard(state) {
    const bonuses = Scoring.getCellBonuses(state.board);
    $$('.cell').forEach(cellEl => {
      const index = parseInt(cellEl.dataset.index);
      const c = state.board[index];
      const b = bonuses.get(index);

      if (!c) {
        cellEl.className = 'cell empty';
        cellEl.innerHTML = '';
        return;
      }

      const valid = Scoring.isValidPlacement(c, index);
      const base = Scoring.cellBasePoints(c, index);
      const total = base + (b ? b.coupleBonus + b.seasonBonus : 0);

      let cls = 'cell filled ' + (valid ? 'valid' : 'invalid');
      if (state.selectedIndex === index) cls += ' selected';
      cellEl.className = cls;

      let bonusHTML = '';
      if (b && b.coupleBonus > 0) bonusHTML += `<span class="cell-bonus bonus-couple">💕+${b.coupleBonus}</span>`;
      if (b && b.seasonBonus > 0) bonusHTML += `<span class="cell-bonus bonus-season">🏝️+${b.seasonBonus}</span>`;

      cellEl.innerHTML = `
        <div class="cell-name">${c.name}</div>
        <div class="cell-stars">${'⭐'.repeat(c.stars)}</div>
        <div class="cell-points ${valid?'valid-pts':'invalid-pts'}">${total}pt</div>
        ${bonusHTML ? `<div class="cell-bonuses">${bonusHTML}</div>` : ''}`;
    });
  }

  function animateScore(sel, val) {
    const el = $(sel);
    const old = parseInt(el.textContent) || 0;
    if (old !== val) {
      el.textContent = val;
      el.classList.remove('changed');
      void el.offsetWidth;
      el.classList.add('changed');
    }
  }

  function renderScorePanel(state) {
    if (!state.score) return;
    const s = state.score;
    animateScore('#score-base', s.baseTotal);
    animateScore('#score-couples', s.couples.total);
    animateScore('#score-seasons', s.seasons.total);
    animateScore('#score-completion', s.rows.total + s.cols.total);
    animateScore('#score-perfect', s.perfectGrid.total);
    animateScore('#score-total', s.total);
    lastScoreTotal = s.total;
  }

  function renderStatsBar(state) {
    const round = state.round < 12 ? state.round + 1 : 12;
    const drafted = state.drafted ? state.drafted.length : 0;
    const score = state.score ? state.score.total : 0;
    $('#stat-round').textContent = `Round ${round}/12`;
    $('#stat-score').textContent = `Score: ${score}`;
    $('#stat-drafted').textContent = `Drafted: ${drafted}/12`;
  }

  function renderGameTabs(state) {
    const progress = Storage.getDailyProgress(state.date || Storage.todayStr());
    $$('.game-tab').forEach(tab => {
      const gn = parseInt(tab.dataset.game);
      tab.classList.remove('active','locked','completed');
      if (gn === state.gameNumber) {
        tab.classList.add('active');
        tab.textContent = `Game ${gn}`;
      } else {
        const gk = 'game' + gn;
        if (progress[gk] && progress[gk].completed) {
          tab.classList.add('completed');
          tab.textContent = `Game ${gn} ✓`;
        } else if (gn === 1 || (progress['game'+(gn-1)] && progress['game'+(gn-1)].completed)) {
          tab.textContent = `Game ${gn}`;
        } else {
          tab.classList.add('locked');
          tab.textContent = `Game ${gn} 🔒`;
        }
      }
    });
  }

  function renderOptimizeBanner(state) {
    $('#optimize-banner').classList.toggle('hidden', state.phase !== 'optimizing');
  }

  // ═══ MASTER RENDER ═══
  function render(state) {
    // Update column 4 header to match today's rotating column
    const col4 = Scoring.getActiveColumn4();
    const col4El = document.getElementById('col4-label');
    if (col4El) {
      col4El.innerHTML = `${col4.emoji}<br><span>${col4.label}</span>`;
    }

    renderDraft(state);
    renderBoard(state);
    renderScorePanel(state);
    renderStatsBar(state);
    renderGameTabs(state);
    renderOptimizeBanner(state);
  }

  // ═══ CONFETTI ═══
  function launchConfetti() {
    const canvas = $('#confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#f093fb','#ff6b6b','#ffd700','#2ed573','#764ba2','#70a1ff','#ff6b9d','#ffa07a'];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        opacity: 1
      });
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rot += p.rotV;
        if (frame > 60) p.opacity -= 0.01;
        if (p.opacity <= 0 || p.y > canvas.height + 50) continue;
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
      frame++;
      if (alive) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(animate);
  }

  // ═══ SHOW COMPLETION OVERLAY ═══
  function showCompletion(state) {
    const s = state.score;
    $('#final-score').textContent = s.total;

    const parts = [];
    parts.push(`⭐ Base: ${s.baseTotal}`);
    if (s.couples.total > 0) parts.push(`💕 Couples: +${s.couples.total}`);
    if (s.seasons.total > 0) parts.push(`🏝️ Seasons: +${s.seasons.total}`);
    if (s.rows.total + s.cols.total > 0) parts.push(`📊 Rows/Cols: +${s.rows.total + s.cols.total}`);
    if (s.perfectGrid.total > 0) parts.push(`✨ Perfect Grid: +${s.perfectGrid.total}`);
    $('#final-breakdown').innerHTML = parts.join('<br>');

    // Check if more games available
    const nextGame = Storage.getNextGameNumber(state.date);
    const nextBtn = $('#btn-next-game');
    if (nextGame > 0) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = `Play Game ${nextGame} →`;
    } else {
      nextBtn.classList.add('hidden');
    }

    $('#complete-overlay').classList.remove('hidden');
    launchConfetti();
    Game.haptic('success');
  }

  // ═══ STATS OVERLAY ═══
  function showStats() {
    const stats = Storage.getStats();
    $('#stats-grid').innerHTML = `
      <div class="stats-item"><div class="stat-number">${stats.gamesPlayed}</div><div class="stat-label">Games Played</div></div>
      <div class="stats-item"><div class="stat-number">${stats.bestScore}</div><div class="stat-label">Best Score</div></div>
      <div class="stats-item"><div class="stat-number">${stats.averageScore}</div><div class="stat-label">Average</div></div>
      <div class="stats-item"><div class="stat-number">${stats.currentStreak}</div><div class="stat-label">Current Streak</div></div>
      <div class="stats-item"><div class="stat-number">${stats.longestStreak}</div><div class="stat-label">Best Streak</div></div>
      <div class="stats-item"><div class="stat-number">${stats.perfectGrids}</div><div class="stat-label">Perfect Grids</div></div>
    `;
    $('#stats-overlay').classList.remove('hidden');
  }

  // ═══ ALL DONE TODAY ═══
  function showAllDone() {
    const progress = Storage.getDailyProgress();
    let html = '';
    for (let g = 1; g <= 3; g++) {
      const gk = 'game' + g;
      const data = progress[gk];
      if (data && data.completed) {
        html += `<div class="today-score-item"><span class="today-score-label">Game ${g}</span><span class="today-score-value">${data.score} pts</span></div>`;
      }
    }
    const totalToday = (progress.game1?.score || 0) + (progress.game2?.score || 0) + (progress.game3?.score || 0);
    html += `<div class="today-score-item"><span class="today-score-label"><strong>Total</strong></span><span class="today-score-value"><strong>${totalToday} pts</strong></span></div>`;
    $('#today-scores').innerHTML = html;
    $('#alldone-overlay').classList.remove('hidden');
  }

  // ═══ SETUP EVENT LISTENERS ═══
  function setupEvents() {
    // Confirm draft pick
    $('#btn-confirm').addEventListener('click', () => {
      if (selectedDraftIndex >= 0) {
        Game.draftContestant(selectedDraftIndex);
        selectedDraftIndex = -1;
        Game.haptic('medium');
      }
    });

    // Board cell clicks (swap)
    $$('.cell').forEach(cellEl => {
      cellEl.addEventListener('click', () => {
        const index = parseInt(cellEl.dataset.index);
        Game.selectCell(index);
        Game.haptic('light');
      });
    });

    // Finish button (optimization phase)
    $('#btn-finish').addEventListener('click', () => {
      const result = Game.completeGame();
      showCompletion(Game.getState());
    });

    // Share button
    $('#btn-share').addEventListener('click', async () => {
      await Game.shareResults();
      const toast = $('#share-toast');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2000);
    });

    // Next game button
    $('#btn-next-game').addEventListener('click', () => {
      const nextGame = Storage.getNextGameNumber(Storage.todayStr());
      if (nextGame > 0) {
        $('#complete-overlay').classList.add('hidden');
        startGame(nextGame);
      }
    });

    // Game tabs
    $$('.game-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.classList.contains('locked')) return;
        const gn = parseInt(tab.dataset.game);
        const progress = Storage.getDailyProgress();
        const gk = 'game' + gn;
        if (progress[gk] && progress[gk].completed) return; // Already done
        startGame(gn);
      });
    });

    // Stats button
    $('#btn-stats').addEventListener('click', () => showStats());

    // Help button
    $('#btn-help').addEventListener('click', () => {
      $('#help-overlay').classList.remove('hidden');
    });

    // Close overlay buttons
    $$('.close-overlay').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.overlay').classList.add('hidden');
      });
    });

    // Close overlays by clicking backdrop
    $$('.overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    });
  }

  // ═══ START GAME ═══
  function startGame(gameNumber) {
    const date = Storage.todayStr();
    Game.initGame(contestantsDB, gameNumber, date);
  }

  // ═══ INITIALIZE ═══
  async function init() {
    // Load contestant database — use embedded data if available, else fetch
    try {
      if (window.CONTESTANTS_DATA) {
        contestantsDB = window.CONTESTANTS_DATA;
      } else {
        const resp = await fetch('data/contestants.json');
        contestantsDB = await resp.json();
      }
    } catch (e) {
      console.error('[Recouple] Failed to load contestants:', e);
      return;
    }
    console.log('[Recouple] Loaded', contestantsDB.length, 'contestants');

    // Connect game state changes to render
    Game.setOnStateChange(render);

    // Setup all event listeners
    setupEvents();

    // Try to resume a saved game
    if (Game.tryResume()) {
      return; // Resumed successfully
    }

    // Check what game to play today
    const today = Storage.todayStr();
    const nextGame = Storage.getNextGameNumber(today);
    
    if (nextGame === 0) {
      // All games done today
      // Show a default state then the all-done overlay
      Game.initGame(contestantsDB, 1, today);
      showAllDone();
    } else {
      startGame(nextGame);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, render, showStats, showCompletion, launchConfetti };
})();
