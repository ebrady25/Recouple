/**
 * RECOUPLE — UI Controller
 * ========================
 * Draft: Tap card → Tap cell to place
 * Board: Single-tap to select for swap. Double-tap to inspect.
 * Placement hints: off by default, toggle with help-mode button
 */

const UI = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let contestantsDB = [];
  let selectedDraftIndex = -1;
  let swapSourceIndex = null;
  let lastScoreTotal = 0;
  let helpMode = false;          // Placement hint toggle
  let lastTapTime = {};          // For double-tap detection: { cellIndex: timestamp }

  const AVATAR_COLORS = [
    ['#764ba2','#f093fb'],['#c94b8e','#ff6b6b'],['#667eea','#a78bfa'],
    ['#f093fb','#ffa07a'],['#ff6b6b','#ffd700'],['#2ed573','#7bed9f'],
    ['#70a1ff','#a78bfa'],['#ff4757','#ff6b9d'],['#ffd700','#ff6b6b'],
    ['#a78bfa','#c94b8e'],['#27ae60','#2ed573'],['#3498db','#70a1ff']
  ];

  // Rarity design config
  const RARITY = {
    1: { cls: 'rarity-bronze', label: '★', accent: '#cd7f32' },
    2: { cls: 'rarity-silver', label: '★★', accent: '#c0c0c0' },
    3: { cls: 'rarity-gold',   label: '★★★', accent: '#ffd700' },
    4: { cls: 'rarity-diamond',label: '★★★★', accent: '#b9f2ff' }
  };

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

  function getVisibleTags(tags) {
    const col4 = Scoring.getActiveColumn4();
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

    if (state.phase === 'drafting' && state.round < 12) {
      container.classList.remove('hidden');

      if (selectedDraftIndex >= 0) {
        titleEl.textContent = '👇 Now tap a cell to place them';
        titleEl.classList.add('placing-hint');
      } else {
        titleEl.textContent = `🃏 Round ${state.round + 1} — Pick a Contestant`;
        titleEl.classList.remove('placing-hint');
      }

      const options = Game.getDraftOptions();
      if (!options) return;

      cardsEl.innerHTML = options.map((c, i) => {
        const colors = getAvatarColor(c.name);
        const photoPath = `images/contestants/${c.id}.jpg`;
        const rarity = RARITY[c.stars];
        const flag = c.show === 'uk' ? '🇬🇧' : '🇺🇸';
        const seasonShort = c.season.replace('USA ', '').replace('UK ', '');
        return `<div class="draft-card ${rarity.cls} ${i === selectedDraftIndex ? 'selected' : ''}" data-draft="${i}">
          <div class="card-season-line"><span class="flag">${flag}</span> ${seasonShort}</div>
          <div class="card-avatar" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})">
            <img src="${photoPath}" alt="${c.name}" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="initials">${getInitials(c.name)}</span>
          </div>
          <div class="card-name">${c.name}</div>
          <div class="card-stars">${'★'.repeat(c.stars)}<span class="star-empty">${'☆'.repeat(4 - c.stars)}</span></div>
          <div class="card-points">${c.starPoints}pt</div>
          <div class="card-tags">${renderTags(getVisibleTags(c.tags))}</div>
        </div>`;
      }).join('');

      // Hide old confirm button
      const confirmBtn = $('#btn-confirm');
      if (confirmBtn) confirmBtn.classList.add('hidden');

      $$('.draft-card').forEach(card => {
        card.addEventListener('click', () => {
          const newIdx = parseInt(card.dataset.draft);
          selectedDraftIndex = (selectedDraftIndex === newIdx) ? -1 : newIdx;
          $$('.draft-card').forEach((c,j) => c.classList.toggle('selected', j === selectedDraftIndex));
          if (helpMode) updatePlacementHints();
          else clearPlacementHints();
          // Update title
          if (selectedDraftIndex >= 0) {
            titleEl.textContent = '👇 Now tap a cell to place them';
            titleEl.classList.add('placing-hint');
          } else {
            titleEl.textContent = `🃏 Round ${state.round + 1} — Pick a Contestant`;
            titleEl.classList.remove('placing-hint');
          }
          Game.haptic('light');
        });
      });

      if (selectedDraftIndex >= 0 && helpMode) updatePlacementHints();
    } else {
      container.classList.add('hidden');
      selectedDraftIndex = -1;
    }
  }

  function updatePlacementHints() {
    const options = Game.getDraftOptions();
    $$('.cell').forEach(cellEl => {
      cellEl.classList.remove('place-hint', 'place-hint-valid', 'place-hint-invalid');
      if (selectedDraftIndex < 0 || !options || !helpMode) return;
      const index = parseInt(cellEl.dataset.index);
      const contestant = options[selectedDraftIndex];
      const valid = Scoring.isValidPlacement(contestant, index);
      cellEl.classList.add('place-hint');
      cellEl.classList.add(valid ? 'place-hint-valid' : 'place-hint-invalid');
    });
  }

  function clearPlacementHints() {
    $$('.cell').forEach(cellEl => {
      cellEl.classList.remove('place-hint', 'place-hint-valid', 'place-hint-invalid');
    });
  }

  // ═══ RENDER BOARD ═══
  function renderBoard(state) {
    const bonuses = Scoring.getCellBonuses(state.board);
    $$('.cell').forEach(cellEl => {
      const index = parseInt(cellEl.dataset.index);
      const c = state.board[index];
      const b = bonuses.get(index);

      // Preserve hints
      const hasHint = cellEl.classList.contains('place-hint');
      const hintValid = cellEl.classList.contains('place-hint-valid');
      const hintInvalid = cellEl.classList.contains('place-hint-invalid');
      const isInspValid = cellEl.classList.contains('inspector-valid');
      const isInspCurrent = cellEl.classList.contains('inspector-current');

      if (!c) {
        let cls = 'cell empty';
        if (hasHint) cls += ' place-hint' + (hintValid ? ' place-hint-valid' : '') + (hintInvalid ? ' place-hint-invalid' : '');
        if (isInspValid) cls += ' inspector-valid';
        cellEl.className = cls;
        cellEl.innerHTML = '';
        return;
      }

      const valid = Scoring.isValidPlacement(c, index);
      const base = Scoring.cellBasePoints(c, index);
      const total = base + (b ? b.coupleBonus + b.seasonBonus : 0);

      let cls = 'cell filled ' + (valid ? 'valid' : 'invalid');
      if (swapSourceIndex === index) cls += ' selected swap-source';
      if (hasHint) cls += ' place-hint' + (hintValid ? ' place-hint-valid' : '') + (hintInvalid ? ' place-hint-invalid' : '');
      if (isInspValid) cls += ' inspector-valid';
      if (isInspCurrent) cls += ' inspector-current';
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

  // ═══ INSPECTOR POPUP (double-tap) ═══
  function showInspector(cellIndex) {
    const state = Game.getState();
    const c = state.board[cellIndex];
    if (!c) return;

    closeInspector();

    const colors = getAvatarColor(c.name);
    const photoPath = `images/contestants/${c.id}.jpg`;
    const valid = Scoring.isValidPlacement(c, cellIndex);
    const rarity = RARITY[c.stars];

    const validCells = [];
    for (let i = 0; i < 12; i++) {
      if (Scoring.isValidPlacement(c, i)) validCells.push(i);
    }

    const popup = document.createElement('div');
    popup.id = 'inspector-popup';
    popup.className = 'inspector-popup';
    popup.innerHTML = `
      <div class="inspector-card ${rarity.cls}">
        <div class="inspector-header">
          <div class="inspector-avatar" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})">
            <img src="${photoPath}" alt="${c.name}" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="initials">${getInitials(c.name)}</span>
          </div>
          <div class="inspector-info">
            <div class="inspector-name">${c.name}</div>
            <div class="inspector-season">${c.season} · ${rarity.label}</div>
            <div class="inspector-stars">${c.starPoints}pt${c.starPoints>1?'s':''} base</div>
          </div>
        </div>
        <div class="inspector-tags">${renderTags(c.tags)}</div>
        ${c.couple ? `<div class="inspector-couple">💕 Coupled with <strong>${c.couple}</strong></div>` : ''}
        <div class="inspector-placement ${valid ? 'valid' : 'invalid'}">
          ${valid ? '✅ Valid placement here' : '❌ Invalid here — scores 0 base pts'}
        </div>
        <div class="inspector-valid-hint">💡 Green-highlighted cells = valid spots</div>
        <div class="inspector-actions">
          <button class="inspector-btn inspector-swap-btn">🔄 Swap This Card</button>
          <button class="inspector-btn inspector-close-btn">✕ Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    $$('.cell').forEach(cellEl => {
      const idx = parseInt(cellEl.dataset.index);
      cellEl.classList.toggle('inspector-valid', validCells.includes(idx));
      cellEl.classList.toggle('inspector-current', idx === cellIndex);
    });

    popup.querySelector('.inspector-close-btn').addEventListener('click', () => closeInspector());
    popup.querySelector('.inspector-swap-btn').addEventListener('click', () => {
      closeInspector();
      enterSwapMode(cellIndex);
    });
    popup.addEventListener('click', (e) => {
      if (e.target === popup) closeInspector();
    });

    requestAnimationFrame(() => popup.classList.add('visible'));
  }

  function closeInspector() {
    const popup = document.getElementById('inspector-popup');
    if (popup) {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 200);
    }
    $$('.cell').forEach(cellEl => {
      cellEl.classList.remove('inspector-valid', 'inspector-current');
    });
  }

  function enterSwapMode(sourceIndex) {
    swapSourceIndex = sourceIndex;
    $$('.cell').forEach(cellEl => {
      const idx = parseInt(cellEl.dataset.index);
      cellEl.classList.toggle('swap-source', idx === sourceIndex);
      if (idx !== sourceIndex) cellEl.classList.add('swap-target');
    });
    Game.haptic('light');
  }

  function exitSwapMode() {
    swapSourceIndex = null;
    $$('.cell').forEach(cellEl => {
      cellEl.classList.remove('swap-source', 'swap-target');
    });
  }

  // ═══ CELL CLICK HANDLER ═══
  // Single tap: select for swap (or place draft pick)
  // Double tap: open inspector
  function handleCellClick(cellIndex) {
    const state = Game.getState();
    const now = Date.now();

    // MODE 1: Draft placement — a draft card is selected
    if (selectedDraftIndex >= 0 && state.phase === 'drafting') {
      Game.draftToCell(selectedDraftIndex, cellIndex);
      selectedDraftIndex = -1;
      clearPlacementHints();
      Game.haptic('medium');
      return;
    }

    // MODE 2: Swap completion — a swap source is selected
    if (swapSourceIndex !== null) {
      if (swapSourceIndex !== cellIndex) {
        Game.swapCells(swapSourceIndex, cellIndex);
        Game.haptic('medium');
      }
      exitSwapMode();
      return;
    }

    // MODE 3: Double-tap detection for inspector
    if (state.board[cellIndex] && (state.phase === 'drafting' || state.phase === 'optimizing')) {
      const lastTap = lastTapTime[cellIndex] || 0;
      const elapsed = now - lastTap;
      lastTapTime[cellIndex] = now;

      if (elapsed < 400) {
        // Double tap → inspector
        showInspector(cellIndex);
        Game.haptic('medium');
        lastTapTime[cellIndex] = 0; // Reset so triple-tap doesn't re-trigger
        return;
      }

      // Single tap → enter swap mode (select this cell)
      enterSwapMode(cellIndex);
      return;
    }
  }

  // ═══ SCORE & UI HELPERS ═══
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
    const col4 = Scoring.getActiveColumn4();
    const col4El = document.getElementById('col4-label');
    if (col4El) col4El.innerHTML = `${col4.emoji}<br><span>${col4.label}</span>`;

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
        x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4, h: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
        rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2, opacity: 1
      });
    }
    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.rotV;
        if (frame > 60) p.opacity -= 0.01;
        if (p.opacity <= 0 || p.y > canvas.height + 50) continue;
        alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.opacity); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
      }
      frame++;
      if (alive) requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(animate);
  }

  function showCompletion(state) {
    const s = state.score;
    $('#final-score').textContent = s.total;
    const parts = [`⭐ Base: ${s.baseTotal}`];
    if (s.couples.total > 0) parts.push(`💕 Couples: +${s.couples.total}`);
    if (s.seasons.total > 0) parts.push(`🏝️ Seasons: +${s.seasons.total}`);
    if (s.rows.total + s.cols.total > 0) parts.push(`📊 Rows/Cols: +${s.rows.total + s.cols.total}`);
    if (s.perfectGrid.total > 0) parts.push(`✨ Perfect Grid: +${s.perfectGrid.total}`);
    $('#final-breakdown').innerHTML = parts.join('<br>');
    const nextGame = Storage.getNextGameNumber(state.date);
    const nextBtn = $('#btn-next-game');
    if (nextGame > 0) { nextBtn.classList.remove('hidden'); nextBtn.textContent = `Play Game ${nextGame} →`; }
    else { nextBtn.classList.add('hidden'); }
    $('#complete-overlay').classList.remove('hidden');
    launchConfetti();
    Game.haptic('success');
  }

  function showStats() {
    const stats = Storage.getStats();
    $('#stats-grid').innerHTML = `
      <div class="stats-item"><div class="stat-number">${stats.gamesPlayed}</div><div class="stat-label">Games Played</div></div>
      <div class="stats-item"><div class="stat-number">${stats.bestScore}</div><div class="stat-label">Best Score</div></div>
      <div class="stats-item"><div class="stat-number">${stats.averageScore}</div><div class="stat-label">Average</div></div>
      <div class="stats-item"><div class="stat-number">${stats.currentStreak}</div><div class="stat-label">Current Streak</div></div>
      <div class="stats-item"><div class="stat-number">${stats.longestStreak}</div><div class="stat-label">Best Streak</div></div>
      <div class="stats-item"><div class="stat-number">${stats.perfectGrids}</div><div class="stat-label">Perfect Grids</div></div>`;
    $('#stats-overlay').classList.remove('hidden');
  }

  function showAllDone() {
    const progress = Storage.getDailyProgress();
    let html = '';
    for (let g = 1; g <= 3; g++) {
      const gk = 'game' + g;
      const data = progress[gk];
      if (data && data.completed) html += `<div class="today-score-item"><span class="today-score-label">Game ${g}</span><span class="today-score-value">${data.score} pts</span></div>`;
    }
    const totalToday = (progress.game1?.score || 0) + (progress.game2?.score || 0) + (progress.game3?.score || 0);
    html += `<div class="today-score-item"><span class="today-score-label"><strong>Total</strong></span><span class="today-score-value"><strong>${totalToday} pts</strong></span></div>`;
    $('#today-scores').innerHTML = html;
    $('#alldone-overlay').classList.remove('hidden');
  }

  // ═══ SETUP EVENT LISTENERS ═══
  function setupEvents() {
    $$('.cell').forEach(cellEl => {
      cellEl.addEventListener('click', () => handleCellClick(parseInt(cellEl.dataset.index)));
    });

    $('#btn-finish').addEventListener('click', () => {
      Game.completeGame();
      showCompletion(Game.getState());
    });

    $('#btn-share').addEventListener('click', async () => {
      await Game.shareResults();
      const toast = $('#share-toast');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2000);
    });

    $('#btn-next-game').addEventListener('click', () => {
      const nextGame = Storage.getNextGameNumber(Storage.todayStr());
      if (nextGame > 0) { $('#complete-overlay').classList.add('hidden'); startGame(nextGame); }
    });

    $$('.game-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.classList.contains('locked')) return;
        const gn = parseInt(tab.dataset.game);
        startGame(gn);
      });
    });

    $('#btn-stats').addEventListener('click', () => showStats());
    $('#btn-help').addEventListener('click', () => $('#help-overlay').classList.remove('hidden'));

    // Help mode toggle (easy mode — shows placement hints)
    const helpModeBtn = $('#btn-help-mode');
    if (helpModeBtn) {
      helpModeBtn.addEventListener('click', () => {
        helpMode = !helpMode;
        helpModeBtn.classList.toggle('active', helpMode);
        helpModeBtn.textContent = helpMode ? '💡 Hints ON' : '💡 Hints';
        if (!helpMode) clearPlacementHints();
        else if (selectedDraftIndex >= 0) updatePlacementHints();
        Game.haptic('light');
      });
    }

    $$('.close-overlay').forEach(btn => { btn.addEventListener('click', () => btn.closest('.overlay').classList.add('hidden')); });
    $$('.overlay').forEach(o => { o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); }); });
  }

  function startGame(gameNumber) {
    Game.initGame(contestantsDB, gameNumber, Storage.todayStr());
  }

  async function init() {
    try {
      if (window.CONTESTANTS_DATA) { contestantsDB = window.CONTESTANTS_DATA; }
      else { const resp = await fetch('data/contestants.json'); contestantsDB = await resp.json(); }
    } catch (e) { console.error('[Recouple] Failed to load contestants:', e); return; }
    console.log('[Recouple] Loaded', contestantsDB.length, 'contestants');

    Game.setOnStateChange(render);
    setupEvents();

    if (Game.tryResume()) return;

    const today = Storage.todayStr();
    const nextGame = Storage.getNextGameNumber(today);
    startGame(nextGame);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }

  return { init, render, showStats, showCompletion, launchConfetti };
})();
