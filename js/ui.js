/**
 * RECOUPLE v2 — UI Controller
 * ============================
 * Griddy-style 9-card board rendered with CSS absolute positioning.
 * Connection lines drawn via SVG overlay.
 * Draft cards tap-to-select, then tap board cell to place.
 * Tap filled cell to select for swap. Double-tap to inspect.
 */

const UI = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let contestantsDB = [];
  let selectedDraftIndex = -1;
  let lastTapTime = {};
  let helpMode = false;

  // ─── Board Layout Coordinates (percentage-based for responsive SVG) ───
  // Positions map to slot indices 0-8 on the Griddy topology
  // New layout:
  //      [0:Winner]────[1:Bombshell]
  //       / \            / \
  //   [2:WILD] [3:USA]──[4:UK] [5:WILD]
  //       \ / \      / \ /
  //      [6:Day1] [8:Casa] [7:Coupled]
  const SLOT_POS = [
    { x: 35, y: 4  },   // 0: Winner (top-left)
    { x: 65, y: 4  },   // 1: Bombshell (top-right)
    { x: 5,  y: 35 },   // 2: WILD-L (left)
    { x: 35, y: 42 },   // 3: USA (center-left, power position, lowered)
    { x: 65, y: 42 },   // 4: UK (center-right, power position, lowered)
    { x: 95, y: 35 },   // 5: WILD-R (right)
    { x: 12, y: 72 },   // 6: Day 1 (bottom-left)
    { x: 88, y: 72 },   // 7: Coupled (bottom-right)
    { x: 50, y: 82 },   // 8: Casa Amor (bottom-center)
  ];

  const AVATAR_COLORS = [
    ['#764ba2','#f093fb'],['#c94b8e','#ff6b6b'],['#667eea','#a78bfa'],
    ['#f093fb','#ffa07a'],['#ff6b6b','#ffd700'],['#2ed573','#7bed9f'],
    ['#70a1ff','#a78bfa'],['#ff4757','#ff6b9d'],['#ffd700','#ff6b6b'],
  ];

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

  // ═══ SVG BOARD RENDERING ═══

  function renderBoard(state) {
    const boardEl = $('#board-container');
    if (!boardEl) return;

    const score = state.score || Scoring.calculateScore(state.board);
    const slotLabels = Scoring.getSlotLabels();

    // Build SVG for connection lines
    let svgLines = '';
    for (const [a, b] of Scoring.EDGES) {
      const pa = SLOT_POS[a], pb = SLOT_POS[b];
      const ca = state.board[a], cb = state.board[b];

      let cls = 'edge-empty';
      if (ca && cb) {
        const sameCountry = ca.show === cb.show;
        const sameSeason = ca.season === cb.season;
        const isCouple = (ca.couple && ca.couple === cb.name) || (cb.couple && cb.couple === ca.name);
        if (isCouple) cls = 'edge-couple';
        else if (sameCountry && sameSeason) cls = 'edge-combo';
        else if (sameCountry || sameSeason) cls = 'edge-match';
        else cls = 'edge-none';
      }
      svgLines += `<line x1="${pa.x}%" y1="${pa.y + 5}%" x2="${pb.x}%" y2="${pb.y + 5}%" class="${cls}" />`;
    }

    // Build cell HTML
    let cellsHTML = '';
    for (let i = 0; i < 9; i++) {
      const pos = SLOT_POS[i];
      const c = state.board[i];
      const sl = slotLabels[i];
      const cs = score.cellScores[i];
      const isSelected = state.selectedIndex === i;
      const conns = Scoring.ADJACENCY[i].length;

      let cellContent = '';
      let cellClass = 'board-cell';

      if (c) {
        const valid = cs.isValid;
        const stars = RARITY[c.stars];
        const [c1, c2] = getAvatarColor(c.name);
        const flag = c.show === 'usa' ? '🇺🇸' : '🇬🇧';
        const seasonShort = c.season.replace('USA S', 'S').replace('UK S', 'S');
        const totalPts = cs.totalPoints;

        cellClass += valid ? ' cell-valid' : ' cell-invalid';
        if (isSelected) cellClass += ' cell-selected';
        cellClass += ` ${stars.cls}`;

        cellContent = `
          <div class="cell-flag-season">${flag} ${seasonShort}</div>
          <div class="cell-avatar" style="background:linear-gradient(135deg,${c1},${c2})">
            <span>${getInitials(c.name)}</span>
          </div>
          <div class="cell-name">${c.name.split(' ')[0]}</div>
          <div class="cell-stars" style="color:${stars.accent}">${stars.label}</div>
          <div class="cell-pts ${totalPts > 5 ? 'pts-high' : totalPts > 0 ? 'pts-med' : 'pts-zero'}">${totalPts}pt</div>
        `;
      } else {
        cellClass += ' cell-empty';
        if (sl.tag === null) cellClass += ' cell-wild';
        if (helpMode && selectedDraftIndex >= 0) {
          const options = Game.getDraftOptions();
          if (options && options[selectedDraftIndex]) {
            const draftee = options[selectedDraftIndex];
            if (sl.tag === null) {
              cellClass += ' hint-valid'; // WILD always valid
            } else {
              const wouldBeValid = draftee.tags.includes(sl.tag);
              cellClass += wouldBeValid ? ' hint-valid' : ' hint-invalid';
            }
          }
        }
        cellContent = `
          <div class="cell-slot-emoji">${sl.emoji}</div>
          <div class="cell-slot-label">${sl.label}</div>
          <div class="cell-conn-count">${conns} links</div>
        `;
      }

      cellsHTML += `<div class="${cellClass}" data-slot="${i}" style="left:calc(${pos.x}% - 42px);top:calc(${pos.y}% - 0px)">${cellContent}</div>`;
    }

    boardEl.innerHTML = `
      <svg class="board-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${svgLines}</svg>
      ${cellsHTML}
    `;

    // Attach cell click handlers
    boardEl.querySelectorAll('.board-cell').forEach(cell => {
      cell.addEventListener('click', (e) => handleCellClick(parseInt(cell.dataset.slot), e));
    });
  }

  // ═══ CELL CLICK HANDLER ═══

  function handleCellClick(slotIndex) {
    const state = Game.getState();

    // During draft: if a draft card is selected, place it here
    if (state.phase === 'drafting' && selectedDraftIndex >= 0) {
      const options = Game.getDraftOptions();
      if (options && options[selectedDraftIndex]) {
        Game.draftToCell(selectedDraftIndex, slotIndex);
        Game.haptic('medium');
        selectedDraftIndex = -1;
        return;
      }
    }

    // Double-tap detection for inspect
    const now = Date.now();
    if (lastTapTime[slotIndex] && (now - lastTapTime[slotIndex]) < 400) {
      lastTapTime[slotIndex] = 0;
      if (state.board[slotIndex]) showInspector(slotIndex);
      return;
    }
    lastTapTime[slotIndex] = now;

    // Single tap: select for swap
    if (state.board[slotIndex] || state.selectedIndex !== null) {
      Game.selectCell(slotIndex);
      Game.haptic('light');
    }
  }

  // ═══ DRAFT CARD RENDERING ═══

  function renderDraft(state) {
    const draftEl = $('#draft-container');
    if (!draftEl) return;

    if (state.phase !== 'drafting') {
      if (state.phase === 'optimizing') {
        draftEl.innerHTML = `
          <div class="optimize-banner">
            <div class="optimize-title">🔀 Optimize Your Board</div>
            <div class="optimize-subtitle">Tap cards to swap positions · Maximize connections!</div>
            <button id="btn-done" class="btn-primary">Lock In Score</button>
          </div>`;
        $('#btn-done')?.addEventListener('click', () => {
          Game.completeGame();
          Game.haptic('success');
        });
      } else if (state.phase === 'completed') {
        renderCompletion(state);
      }
      return;
    }

    const options = Game.getDraftOptions();
    if (!options) return;

    draftEl.innerHTML = `
      <div class="draft-header">
        <span class="draft-round">Round ${state.round + 1}/${Draft.NUM_ROUNDS}</span>
        <span class="draft-prompt">Pick a contestant</span>
      </div>
      <div class="draft-cards">
        ${options.map((c, i) => renderDraftCard(c, i)).join('')}
      </div>
    `;

    // Attach card click handlers with double-tap detection
    const draftTapTime = {};
    draftEl.querySelectorAll('.draft-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        const now = Date.now();
        if (draftTapTime[idx] && (now - draftTapTime[idx]) < 400) {
          draftTapTime[idx] = 0;
          showDraftInspector(options[idx]);
          return;
        }
        draftTapTime[idx] = now;
        selectDraftCard(idx);
      });
    });
  }

  function renderDraftCard(c, index) {
    const stars = RARITY[c.stars];
    const [c1, c2] = getAvatarColor(c.name);
    const flag = c.show === 'usa' ? '🇺🇸' : '🇬🇧';
    const seasonShort = c.season.replace('USA S', 'S').replace('UK S', 'S');
    const selected = index === selectedDraftIndex;

    // Show only the 4 gameplay-relevant tags (skip usa/uk since flag covers it)
    const TAG_DISPLAY = {
      bombshell: '💣', casa: '🏠'
    };

    const relevantTags = c.tags.filter(t => TAG_DISPLAY[t]);
    const tagPills = relevantTags.map(t => `<span class="dtag">${TAG_DISPLAY[t]}</span>`).join('');

    return `
      <div class="draft-card ${stars.cls} ${selected ? 'card-selected' : ''}" data-index="${index}">
        <div class="dcard-top">${flag} ${seasonShort}</div>
        <div class="dcard-avatar" style="background:linear-gradient(135deg,${c1},${c2});border-color:${stars.accent}">
          <span>${getInitials(c.name)}</span>
        </div>
        <div class="dcard-name">${c.name}</div>
        <div class="dcard-stars" style="color:${stars.accent}">${stars.label}</div>
        <div class="dcard-tags">${tagPills}</div>
      </div>
    `;
  }

  function selectDraftCard(index) {
    if (selectedDraftIndex === index) {
      selectedDraftIndex = -1; // deselect
    } else {
      selectedDraftIndex = index;
    }
    Game.haptic('light');
    // Re-render draft cards to show selection
    const state = Game.getState();
    renderDraft(state);
    renderBoard(state); // update hints
  }

  // ═══ COMPLETION OVERLAY ═══

  function renderCompletion(state) {
    const draftEl = $('#draft-container');
    const score = state.score;
    if (!draftEl || !score) return;

    const coupleCount = score.coupleEdges.length;
    
    // Calculate percentage
    const opt = Scoring.calculateOptimal(state.drafted, score.total);
    const pct = opt.percentage;
    const pctClass = pct === 100 ? 'pct-perfect' : pct >= 80 ? 'pct-great' : pct >= 60 ? 'pct-good' : 'pct-low';

    draftEl.innerHTML = `
      <div class="completion-panel">
        <div class="completion-score">${score.total}</div>
        <div class="completion-label">points</div>
        <div class="completion-pct ${pctClass}">${pct}% optimal</div>
        ${pct < 100 ? `<div class="completion-optimal">Best possible: ${opt.optimalScore}pts</div>` : ''}
        <div class="completion-breakdown">
          <span>🎯 Slots: ${score.totalSlot}</span>
          <span>⭐ Rarity: ${score.totalRarity}</span>
          <span>🔗 Connections: ${score.totalConnections}</span>
          ${coupleCount > 0 ? `<span>💕 Couples: ${coupleCount}</span>` : ''}
        </div>
        <div class="completion-buttons">
          <button id="btn-share" class="btn-primary">📋 Share</button>
          <button id="btn-next-game" class="btn-secondary">Next Game →</button>
        </div>
      </div>
    `;

    $('#btn-share')?.addEventListener('click', async () => {
      const ok = await Game.shareResults();
      if (ok) {
        $('#btn-share').textContent = '✅ Copied!';
        setTimeout(() => { $('#btn-share').textContent = '📋 Share'; }, 2000);
      }
    });

    $('#btn-next-game')?.addEventListener('click', startNextGame);

    // Confetti for good scores
    if (score.total >= 60) launchConfetti();
  }

  // ═══ SCORE PANEL ═══

  function renderScorePanel(state) {
    const el = $('#score-panel');
    if (!el || !state.score) return;

    const s = state.score;

    // Calculate percentage (optimal arrangement)
    let pctDisplay = '';
    if (state.drafted.length === 9) {
      const opt = Scoring.calculateOptimal(state.drafted, s.total);
      const pct = opt.percentage;
      const pctClass = pct === 100 ? 'pct-perfect' : pct >= 80 ? 'pct-great' : pct >= 60 ? 'pct-good' : 'pct-low';
      pctDisplay = `<div class="score-pct ${pctClass}">${pct}%</div>`;
    }

    el.innerHTML = `
      <div class="score-main">
        <div class="score-total">${s.total}<span class="score-unit">pts</span></div>
        ${pctDisplay}
      </div>
      <div class="score-breakdown">
        <div class="sb-item"><span class="sb-label">🎯 Slots</span><span class="sb-val">${s.totalSlot}</span></div>
        <div class="sb-item"><span class="sb-label">⭐ Rarity</span><span class="sb-val">${s.totalRarity}</span></div>
        <div class="sb-item"><span class="sb-label">🔗 Links</span><span class="sb-val">${s.totalConnections}</span></div>
      </div>
    `;
  }

  // ═══ INSPECTOR POPUP ═══

  function showDraftInspector(c) {
    if (!c) return;

    const TAG_NAMES = {
      usa:'🇺🇸 USA', uk:'🇬🇧 UK', bombshell:'💣 Bombshell', casa:'🏠 Casa Amor',
      winner:'👑 Winner', coupled:'💑 Coupled', finale:'🏆 Finale',
      day1:'☀️ Day 1', season6:'6️⃣ S6+', og_era:'🕰️ OG Era'
    };
    const displayTags = Scoring.DISPLAY_TAGS || ['usa','uk','bombshell','casa'];
    const tagList = c.tags.filter(t => TAG_NAMES[t]).map(t => TAG_NAMES[t]).join(' · ');

    // Show which slots this contestant can validly fill
    const slotLabels = Scoring.getSlotLabels();
    let slotsHTML = '';
    for (let i = 0; i < 9; i++) {
      const sl = slotLabels[i];
      if (sl.tag === null) continue; // skip WILD
      const valid = c.tags.includes(sl.tag);
      if (valid) {
        slotsHTML += `<span class="insp-slot-badge insp-valid">${sl.emoji} ${sl.label} +2</span>`;
      }
    }
    if (!slotsHTML) {
      slotsHTML = '<span class="insp-slot-badge insp-none-badge">Wild slots only</span>';
    }

    const stars = '★'.repeat(c.stars);
    const [c1, c2] = getAvatarColor(c.name);

    const overlay = document.createElement('div');
    overlay.className = 'inspector-overlay';
    overlay.innerHTML = `
      <div class="inspector-card">
        <div class="insp-header">
          <div class="dcard-avatar" style="background:linear-gradient(135deg,${c1},${c2});width:56px;height:56px;margin:0 auto 8px;border:3px solid rgba(255,255,255,0.3)">
            <span style="font-size:18px">${getInitials(c.name)}</span>
          </div>
          <div class="insp-name">${c.name}</div>
          <div class="insp-season">${c.season} · ${stars}</div>
        </div>
        <div class="insp-tags">${tagList}</div>
        ${c.couple ? `<div class="insp-couple">💕 Couple: ${c.couple}</div>` : ''}
        <div class="insp-section-label">Valid Placements</div>
        <div class="insp-slots-row">${slotsHTML}</div>
        <button class="insp-close">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('insp-close')) {
        overlay.remove();
      }
    });
  }

  function showInspector(slotIndex) {
    const state = Game.getState();
    const c = state.board[slotIndex];
    if (!c) return;

    const score = state.score || Scoring.calculateScore(state.board);
    const cs = score.cellScores[slotIndex];
    const sl = Scoring.getSlotLabels()[slotIndex];
    const valid = cs.isValid;

    // Build connections list
    let connHTML = '';
    if (cs.connections.length > 0) {
      connHTML = cs.connections.map(conn => {
        const types = conn.types.map(t => {
          if (t === 'couple') return '💕';
          if (t === 'country') return '🌍';
          if (t === 'season') return '🗓';
          if (t === 'combo') return '🔥';
          return t;
        }).join('');
        return `<div class="insp-conn">${types} ${conn.neighborName} <span>+${conn.points}</span></div>`;
      }).join('');
    } else {
      connHTML = '<div class="insp-conn insp-none">No scoring connections</div>';
    }

    // All tags
    const TAG_NAMES = {
      usa:'🇺🇸 USA', uk:'🇬🇧 UK', bombshell:'💣 Bombshell', casa:'🏠 Casa Amor',
      winner:'👑 Winner', coupled:'💑 Coupled', finale:'🏆 Finale',
      day1:'☀️ Day 1'
    };
    const tagList = c.tags.filter(t => TAG_NAMES[t]).map(t => TAG_NAMES[t]).join(' · ');

    const overlay = document.createElement('div');
    overlay.className = 'inspector-overlay';
    overlay.innerHTML = `
      <div class="inspector-card">
        <div class="insp-header">
          <div class="insp-name">${c.name}</div>
          <div class="insp-season">${c.season} · ${'★'.repeat(c.stars)}</div>
        </div>
        <div class="insp-slot ${valid ? 'insp-valid' : 'insp-invalid'}">
          ${sl.emoji} ${sl.label} ${valid ? '✅ +2' : '❌ 0'}
        </div>
        <div class="insp-tags">${tagList}</div>
        ${c.couple ? `<div class="insp-couple">💕 Couple: ${c.couple}</div>` : ''}
        <div class="insp-section-label">Connections (${cs.connectionPoints}pt)</div>
        ${connHTML}
        <div class="insp-total">Total: ${cs.totalPoints}pt</div>
        <button class="insp-close">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('insp-close')) {
        overlay.remove();
      }
    });
  }

  // ═══ HEADER / TABS ═══

  function renderHeader(state) {
    const roundText = state.phase === 'drafting'
      ? `Round ${state.round + 1}/${Draft.NUM_ROUNDS}`
      : state.phase === 'optimizing' ? 'Optimizing'
      : 'Complete';

    const headerInfo = $('#header-info');
    if (headerInfo) {
      headerInfo.textContent = `${roundText} · Game ${state.gameNumber}`;
    }

    // Update game tabs
    const progress = Storage.getDailyProgress(state.date);
    for (let g = 1; g <= 3; g++) {
      const tab = $(`#tab-game-${g}`);
      if (!tab) continue;
      const gp = progress['game' + g];
      tab.classList.toggle('tab-active', g === state.gameNumber);
      tab.classList.toggle('tab-complete', gp?.completed);
      if (gp?.completed) {
        tab.textContent = `G${g}: ${gp.score}`;
      } else {
        tab.textContent = `Game ${g}`;
      }
    }
  }

  // ═══ STATS OVERLAY ═══

  function showStats() {
    const stats = Storage.getStats();
    const overlay = document.createElement('div');
    overlay.className = 'inspector-overlay';
    overlay.innerHTML = `
      <div class="inspector-card stats-card">
        <div class="insp-header"><div class="insp-name">📊 Statistics</div></div>
        <div class="stats-grid">
          <div class="stat-item"><div class="stat-val">${stats.gamesPlayed}</div><div class="stat-label">Played</div></div>
          <div class="stat-item"><div class="stat-val">${stats.bestScore}</div><div class="stat-label">Best</div></div>
          <div class="stat-item"><div class="stat-val">${stats.averageScore}</div><div class="stat-label">Average</div></div>
          <div class="stat-item"><div class="stat-val">${stats.currentStreak}</div><div class="stat-label">Streak</div></div>
          <div class="stat-item"><div class="stat-val">${stats.longestStreak}</div><div class="stat-label">Max Streak</div></div>
          <div class="stat-item"><div class="stat-val">${stats.perfectGrids}</div><div class="stat-label">Perfects</div></div>
        </div>
        <button class="insp-close">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('insp-close')) overlay.remove();
    });
  }

  // ═══ HELP OVERLAY ═══

  function showHelp() {
    const rotSlot = Scoring.getRotatingSlot();
    const overlay = document.createElement('div');
    overlay.className = 'inspector-overlay';
    overlay.innerHTML = `
      <div class="inspector-card help-card">
        <div class="insp-header"><div class="insp-name">How to Play</div></div>
        <div class="help-content">
          <p><strong>Draft</strong> 9 Love Island contestants over 9 rounds (pick 1 of 3).</p>
          <p><strong>Place</strong> them on the board — 🇺🇸 USA, 🇬🇧 UK, 💣 Bombshell, and 🏠 Casa slots give +2pts if matched. 🃏 Wild slots accept anyone but give 0 slot pts.</p>
          <p><strong>Connect</strong> for bonus points! Cards linked by lines score:</p>
          <ul>
            <li>🌍 Same country: +2 each</li>
            <li>🗓 Same season: +1 each</li>
            <li>🔥 Country + Season: +5 each</li>
            <li>💕 Real couple: +4 each</li>
          </ul>
          <p><strong>Stars</strong> add bonus: ★=0, ★★=+1, ★★★=+2, ★★★★=+3</p>
          <p>🇺🇸 and 🇬🇧 are power positions with 5 connections each!</p>
          <p class="help-rotate">Your % shows how close you are to the best possible arrangement!</p>
        </div>
        <button class="insp-close">Got It</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('insp-close')) overlay.remove();
    });
  }

  // ═══ CONFETTI ═══

  function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({length: 80}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      color: ['#ff6b9d','#ffd700','#2ed573','#764ba2','#ff4757','#70a1ff','#b9f2ff'][Math.floor(Math.random()*7)],
      size: Math.random() * 6 + 3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    }));

    let frame = 0;
    function animate() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05;
        p.rotation += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.6);
        ctx.restore();
      }
      frame++;
      if (frame < 180) requestAnimationFrame(animate);
      else canvas.remove();
    }
    animate();
  }

  // ═══ GAME FLOW ═══

  function startNextGame() {
    const today = Storage.todayStr();
    const nextGame = Storage.getNextGameNumber(today);
    Game.initGame(contestantsDB, nextGame, today);
    selectedDraftIndex = -1;
  }

  // ═══ MAIN RENDER LOOP ═══

  function onStateUpdate(state) {
    renderHeader(state);
    renderBoard(state);
    renderDraft(state);
    renderScorePanel(state);
  }

  // ═══ INIT ═══

  async function init() {
    // Load contestant data
    try {
      const resp = await fetch('data/contestants.json');
      contestantsDB = await resp.json();
    } catch(e) {
      console.error('Failed to load contestants:', e);
      return;
    }

    // Wire up Game state updates
    Game.setOnStateChange(onStateUpdate);

    // Wire up header buttons
    $('#btn-stats')?.addEventListener('click', showStats);
    $('#btn-help')?.addEventListener('click', showHelp);
    $('#btn-hints')?.addEventListener('click', () => {
      helpMode = !helpMode;
      $('#btn-hints')?.classList.toggle('active', helpMode);
      const state = Game.getState();
      renderBoard(state);
    });

    // Wire up game tabs
    for (let g = 1; g <= 3; g++) {
      $(`#tab-game-${g}`)?.addEventListener('click', () => {
        Game.initGame(contestantsDB, g, Storage.todayStr());
        selectedDraftIndex = -1;
      });
    }

    // Try to resume or start new
    const today = Storage.todayStr();
    Scoring.setDailySlots(today);

    if (!Game.tryResume()) {
      const nextGame = Storage.getNextGameNumber(today);
      Game.initGame(contestantsDB, nextGame, today);
    }
  }

  return { init };

})();

// Boot
document.addEventListener('DOMContentLoaded', UI.init);
