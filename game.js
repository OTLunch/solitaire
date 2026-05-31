// ===================== CONSTANTS =====================
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const NUM_VAL = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
const RED_SUITS = new Set(['hearts','diamonds']);
const SAVE_KEY  = 'solitaire_saved_game';

const SUPABASE_URL = 'https://bdfflithcyzwbtuhtwsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AJJXYJV2yvSGIkq5WBqL6A_XkYGk4pB';
let db;

// ===================== STATE =====================
let state = {
    stock: [], waste: [], foundations: [[],[],[],[]],
    tableau: [[],[],[],[],[],[],[]],
    seconds: 0, timerInterval: null, gameActive: false, gameWon: false
};

let currentPlayer = null;
let playerCache   = null;   // { name, played, wins, best_time }
let dragInfo      = null;
let history       = [];

// ===================== TOUCH DRAG =====================
const touch = { active: false, clone: null, sourceEl: null, offsetX: 0, offsetY: 0, moved: false };
let lastTapTime = 0;
let lastTapKey  = null;

function addTouchDrag(cardEl, info) {
    cardEl.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        const rect = cardEl.getBoundingClientRect();
        dragInfo = info;
        touch.sourceEl = cardEl;
        touch.offsetX = t.clientX - rect.left;
        touch.offsetY = t.clientY - rect.top;
        const clone = cardEl.cloneNode(true);
        clone.style.cssText = `position:fixed;width:${rect.width}px;height:${rect.height}px;` +
            `left:${rect.left}px;top:${rect.top}px;opacity:0.85;z-index:9999;` +
            `pointer-events:none;box-shadow:4px 8px 20px rgba(0,0,0,0.55);` +
            `transform:scale(1.06);border-radius:10px;transition:none;`;
        document.body.appendChild(clone);
        touch.clone = clone;
        touch.active = true;
        touch.moved = false;
        cardEl.style.opacity = '0.3';
    }, { passive: false });
}

document.addEventListener('touchmove', e => {
    if (!touch.active || !touch.clone) return;
    e.preventDefault();
    const t = e.touches[0];
    touch.clone.style.left = (t.clientX - touch.offsetX) + 'px';
    touch.clone.style.top  = (t.clientY - touch.offsetY) + 'px';
    touch.moved = true;
}, { passive: false });

document.addEventListener('touchend', e => {
    if (!touch.active) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    if (touch.clone) { touch.clone.remove(); touch.clone = null; }
    touch.active = false;

    if (!dragInfo) { renderGame(); return; }

    // TAP (no movement) — handle double-tap detection here, avoid re-render
    if (!touch.moved) {
        // Build a key for this tap location
        let tapKey = null;
        if (dragInfo.type === 'waste') {
            tapKey = 'waste';
        } else if (dragInfo.type === 'tableau') {
            const cards = state.tableau[dragInfo.col];
            if (dragInfo.cardIdx === cards.length - 1) tapKey = `tab-${dragInfo.col}`;
        }

        const now = Date.now();
        if (tapKey && tapKey === lastTapKey && now - lastTapTime < 300) {
            // Double-tap confirmed — auto-move to foundation
            lastTapTime = 0; lastTapKey = null;
            const src = { ...dragInfo };
            dragInfo = null;
            if (touch.sourceEl) touch.sourceEl.style.opacity = '';
            if (src.type === 'waste') autoMoveToFoundation('waste', -1);
            else autoMoveToFoundation('tableau', src.col);
            return;
        }

        // Single tap — restore card, store tap info, no re-render needed
        lastTapTime = tapKey ? now : 0;
        lastTapKey  = tapKey;
        dragInfo = null;
        if (touch.sourceEl) touch.sourceEl.style.opacity = '';
        return;
    }

    // DRAG — find drop target
    lastTapTime = 0; lastTapKey = null;
    const el = document.elementFromPoint(t.clientX, t.clientY);
    let node = el; let moved = false;
    while (node && node !== document.body) {
        if (node.id && node.id.startsWith('foundation-')) {
            const idx = parseInt(node.dataset.index);
            if (!isNaN(idx)) { moved = executeMove(dragInfo, 'foundation', idx); break; }
        }
        if (node.dataset && node.dataset.col !== undefined) {
            const col = parseInt(node.dataset.col);
            if (!isNaN(col)) { moved = executeMove(dragInfo, 'tableau', col); break; }
        }
        node = node.parentElement;
    }
    dragInfo = null;
    if (!moved) renderGame();
}, { passive: false });

document.addEventListener('touchcancel', () => {
    if (touch.clone) { touch.clone.remove(); touch.clone = null; }
    touch.active = false; dragInfo = null; lastTapTime = 0; lastTapKey = null; renderGame();
});

// ===================== SUPABASE DB =====================
function initSupabase() {
    db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function dbLoadAllPlayers() {
    try {
        const { data, error } = await db.from('players').select('*');
        if (error) throw error;
        return data || [];
    } catch (e) { console.error('DB load error:', e); return []; }
}

async function dbGetPlayer(name) {
    try {
        const { data, error } = await db.from('players').select('*')
            .ilike('name', name).limit(1);
        if (error || !data || data.length === 0) return null;
        return data[0];
    } catch (e) { return null; }
}

async function dbSavePlayer(player) {
    try {
        const { error } = await db.from('players')
            .upsert(player, { onConflict: 'name' });
        if (error) throw error;
    } catch (e) { console.error('DB save error:', e); }
}

// ===================== STATS =====================
async function recordWin(seconds) {
    if (!currentPlayer) return;
    if (!playerCache) playerCache = { name: currentPlayer, played: 0, wins: 0, best_time: null };
    playerCache.played++;
    playerCache.wins++;
    if (playerCache.best_time === null || seconds < playerCache.best_time)
        playerCache.best_time = seconds;
    await dbSavePlayer(playerCache);
    updateStatsDisplay();
}

async function recordAbandoned() {
    if (!currentPlayer || !state.gameActive || state.gameWon) return;
    if (!playerCache) playerCache = { name: currentPlayer, played: 0, wins: 0, best_time: null };
    playerCache.played++;
    await dbSavePlayer(playerCache);
    updateStatsDisplay();
}

function updateStatsDisplay() {
    if (!currentPlayer || !playerCache) return;
    const s = playerCache;
    const losses = s.played - s.wins;
    const rate   = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
    const best   = s.best_time !== null ? formatTime(s.best_time) : '--:--';
    document.getElementById('player-name-display').textContent = currentPlayer;
    document.getElementById('stat-played').textContent  = s.played;
    document.getElementById('stat-wins').textContent    = s.wins;
    document.getElementById('stat-losses').textContent  = losses;
    document.getElementById('stat-rate').textContent    = rate + '%';
    document.getElementById('stat-best').textContent    = best;
}

// ===================== GAME STATE PERSISTENCE =====================
function saveGameState() {
    if (!currentPlayer || !state.gameActive || state.gameWon) return;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            player: currentPlayer, stock: state.stock, waste: state.waste,
            foundations: state.foundations, tableau: state.tableau, seconds: state.seconds
        }));
    } catch (e) {}
}

function clearSavedGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

function loadSavedGame(playerName) {
    try {
        const data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
        if (data && data.player === playerName) return data;
    } catch (e) {}
    return null;
}

function restoreGameState(saved) {
    stopTimer();
    history = [];
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('win-modal').classList.add('hidden');
    state.stock = saved.stock; state.waste = saved.waste;
    state.foundations = saved.foundations; state.tableau = saved.tableau;
    state.seconds = saved.seconds; state.gameActive = true; state.gameWon = false;
    document.getElementById('timer').textContent = formatTime(state.seconds);
    state.timerInterval = setInterval(() => {
        state.seconds++;
        document.getElementById('timer').textContent = formatTime(state.seconds);
    }, 1000);
    renderGame();
}

// ===================== TIMER =====================
function startTimer() {
    stopTimer();
    state.seconds = 0;
    document.getElementById('timer').textContent = '0:00';
    state.timerInterval = setInterval(() => {
        state.seconds++;
        document.getElementById('timer').textContent = formatTime(state.seconds);
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ===================== PLAYER MANAGEMENT =====================
async function showPlayerModal() {
    stopTimer();
    document.getElementById('player-modal').classList.remove('hidden');
    document.getElementById('player-name-input').value = '';
    document.getElementById('name-error').textContent = '';

    const container = document.getElementById('existing-players');
    container.innerHTML = '<p class="existing-label">Loading players…</p>';

    const players = await dbLoadAllPlayers();
    players.sort((a, b) => {
        const ra = a.played > 0 ? a.wins / a.played : 0;
        const rb = b.played > 0 ? b.wins / b.played : 0;
        return rb - ra;
    });

    container.innerHTML = '';
    if (players.length > 0) {
        const label = document.createElement('p');
        label.className = 'existing-label';
        label.textContent = 'Select player';
        container.appendChild(label);

        players.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'player-select-btn';
            const rate = p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0;
            btn.textContent = `${p.name}  —  ${p.wins}W / ${p.played - p.wins}L  (${rate}%)`;
            btn.onclick = () => selectPlayer(p.name);
            container.appendChild(btn);
        });

        const divider = document.createElement('p');
        divider.className = 'or-divider';
        divider.textContent = 'or new player';
        container.appendChild(divider);
    }
}

async function tryCreatePlayer() {
    const name = document.getElementById('player-name-input').value.trim();
    if (!name) return;
    const existing = await dbGetPlayer(name);
    if (existing) {
        document.getElementById('name-error').textContent =
            `"${name}" is already taken — select it above or choose a different name.`;
        return;
    }
    await dbSavePlayer({ name, played: 0, wins: 0, best_time: null });
    document.getElementById('name-error').textContent = '';
    selectPlayer(name);
}

async function selectPlayer(name) {
    currentPlayer = name;
    document.getElementById('player-modal').classList.add('hidden');
    playerCache = await dbGetPlayer(name) || { name, played: 0, wins: 0, best_time: null };
    updateStatsDisplay();
    const saved = loadSavedGame(name);
    if (saved) { restoreGameState(saved); } else { startNewGame(false); }
}

// ===================== DECK =====================
function createDeck() {
    const deck = [];
    SUITS.forEach(suit => VALUES.forEach(value => deck.push({ suit, value, faceUp: false })));
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function isRed(card) { return RED_SUITS.has(card.suit); }
function numVal(card) { return NUM_VAL[card.value]; }

function cardMetrics() {
    const touch = 'ontouchstart' in window;
    if (touch && window.innerWidth >= 1024) return { h: 163, faceUp: 52, faceDown: 32 };
    if (touch && window.innerWidth >= 600)  return { h: 136, faceUp: 42, faceDown: 26 };
    return { h: 116, faceUp: 36, faceDown: 22 };
}

// ===================== GAME SETUP =====================
async function startNewGame(countAbandoned = true) {
    if (countAbandoned && state.gameActive && !state.gameWon) await recordAbandoned();
    stopTimer();
    clearSavedGame();
    history = [];
    autoCompleting = false;
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('win-modal').classList.add('hidden');

    const deck = shuffle(createDeck());
    state.stock = []; state.waste = []; state.foundations = [[],[],[],[]];
    state.tableau = [[],[],[],[],[],[],[]];
    state.gameWon = false; state.gameActive = true;

    let idx = 0;
    for (let col = 0; col < 7; col++)
        for (let row = 0; row <= col; row++) {
            const card = { ...deck[idx++] };
            card.faceUp = (row === col);
            state.tableau[col].push(card);
        }
    while (idx < deck.length) state.stock.push({ ...deck[idx++], faceUp: false });
    startTimer();
    renderGame();
}

// ===================== UNDO =====================
function saveToHistory() {
    history.push({
        stock:       JSON.parse(JSON.stringify(state.stock)),
        waste:       JSON.parse(JSON.stringify(state.waste)),
        foundations: JSON.parse(JSON.stringify(state.foundations)),
        tableau:     JSON.parse(JSON.stringify(state.tableau)),
        seconds:     state.seconds
    });
    document.getElementById('undo-btn').disabled = false;
}

function undoMove() {
    if (history.length === 0) return;
    const prev = history.pop();
    state.stock = prev.stock; state.waste = prev.waste;
    state.foundations = prev.foundations; state.tableau = prev.tableau;
    state.seconds = prev.seconds;
    document.getElementById('timer').textContent = formatTime(state.seconds);
    document.getElementById('undo-btn').disabled = history.length === 0;
    renderGame();
}

// ===================== MOVE VALIDATION =====================
function canMoveToFoundation(card, fi) {
    const f = state.foundations[fi];
    if (f.length === 0) return card.value === 'A';
    const top = f[f.length - 1];
    return card.suit === top.suit && numVal(card) === numVal(top) + 1;
}

function canMoveToTableau(card, col) {
    const c = state.tableau[col];
    if (c.length === 0) return card.value === 'K';
    const top = c[c.length - 1];
    if (!top.faceUp) return false;
    return isRed(card) !== isRed(top) && numVal(card) === numVal(top) - 1;
}

function findFoundationFor(card) {
    for (let i = 0; i < 4; i++) { if (canMoveToFoundation(card, i)) return i; }
    return -1;
}

// ===================== AVAILABLE MOVE CHECK =====================
function hasAvailableMove() {
    if (state.waste.length > 0 && findFoundationFor(state.waste[state.waste.length - 1]) !== -1) return true;
    for (let col = 0; col < 7; col++) {
        const cards = state.tableau[col];
        if (cards.length > 0 && cards[cards.length - 1].faceUp &&
            findFoundationFor(cards[cards.length - 1]) !== -1) return true;
    }
    if (state.waste.length > 0) {
        const wc = state.waste[state.waste.length - 1];
        for (let col = 0; col < 7; col++) if (canMoveToTableau(wc, col)) return true;
    }
    for (let col = 0; col < 7; col++) {
        const cards = state.tableau[col];
        for (let i = 0; i < cards.length; i++) {
            if (!cards[i].faceUp) continue;
            if (i > 0 && !cards[i - 1].faceUp)
                for (let tc = 0; tc < 7; tc++)
                    if (tc !== col && canMoveToTableau(cards[i], tc)) return true;
        }
    }
    return false;
}

function updateMoveIndicator() {
    const el = document.getElementById('move-indicator');
    if (!state.gameActive || state.gameWon) { el.textContent = ''; el.className = ''; return; }
    if (hasAvailableMove()) {
        el.textContent = '✓ Moves available — click to highlight';
        el.className = 'moves-ok';
    } else {
        el.textContent = '✗ No moves available';
        el.className = 'moves-none';
    }
}

function flashAvailableMove() {
    if (!state.gameActive) return;
    if (state.waste.length > 0 && findFoundationFor(state.waste[state.waste.length - 1]) !== -1) {
        flashElement(document.querySelector('#waste .card')); return;
    }
    for (let col = 0; col < 7; col++) {
        const cards = state.tableau[col];
        if (cards.length > 0 && cards[cards.length - 1].faceUp &&
            findFoundationFor(cards[cards.length - 1]) !== -1) {
            flashElement(document.getElementById(`tableau-${col}`).querySelectorAll('.card')[cards.length - 1]); return;
        }
    }
    if (state.waste.length > 0) {
        const wc = state.waste[state.waste.length - 1];
        for (let col = 0; col < 7; col++) {
            if (canMoveToTableau(wc, col)) { flashElement(document.querySelector('#waste .card')); return; }
        }
    }
    for (let col = 0; col < 7; col++) {
        const cards = state.tableau[col];
        for (let i = 0; i < cards.length; i++) {
            if (!cards[i].faceUp) continue;
            if (i > 0 && !cards[i - 1].faceUp)
                for (let tc = 0; tc < 7; tc++)
                    if (tc !== col && canMoveToTableau(cards[i], tc)) {
                        flashElement(document.getElementById(`tableau-${col}`).querySelectorAll('.card')[i]); return;
                    }
        }
    }
}

function flashElement(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

// ===================== AUTO-COMPLETE =====================
let autoCompleting = false;

function allCardsRevealed() {
    if (!state.gameActive || state.gameWon) return false;
    if (state.stock.length > 0) return false;
    for (const col of state.tableau) {
        if (col.some(card => !card.faceUp)) return false;
    }
    return true;
}

async function autoComplete() {
    if (autoCompleting) return;
    autoCompleting = true;

    const delay = ms => new Promise(r => setTimeout(r, ms));

    while (true) {
        const total = state.foundations.reduce((sum, f) => sum + f.length, 0);
        if (total === 52) { await checkWin(); break; }

        let moved = false;

        // Waste → foundation
        if (!moved && state.waste.length > 0) {
            const fi = findFoundationFor(state.waste[state.waste.length - 1]);
            if (fi !== -1) {
                state.foundations[fi].push(state.waste.pop());
                moved = true;
            }
        }

        // Tableau top → foundation
        if (!moved) {
            for (let col = 0; col < 7; col++) {
                const cards = state.tableau[col];
                if (!cards.length) continue;
                const fi = findFoundationFor(cards[cards.length - 1]);
                if (fi !== -1) {
                    state.foundations[fi].push(cards.pop());
                    moved = true;
                    break;
                }
            }
        }

        // Tableau → tableau to unblock a foundation move
        if (!moved) {
            outer:
            for (let col = 0; col < 7; col++) {
                const cards = state.tableau[col];
                for (let i = 0; i < cards.length; i++) {
                    if (!cards[i].faceUp) continue;
                    for (let tc = 0; tc < 7; tc++) {
                        if (tc !== col && canMoveToTableau(cards[i], tc)) {
                            const seq = cards.splice(i);
                            seq.forEach(c => state.tableau[tc].push(c));
                            moved = true;
                            break outer;
                        }
                    }
                }
            }
        }

        if (!moved) break;

        renderGame();
        await delay(150);
    }

    autoCompleting = false;
}

function maybeAutoComplete() {
    if (!autoCompleting && allCardsRevealed()) autoComplete();
}

// ===================== GAME MOVES =====================
function drawFromStock() {
    if (!state.gameActive) return;
    saveToHistory();
    if (state.stock.length === 0) {
        if (state.waste.length === 0) return;
        state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
        state.waste = [];
    } else {
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
    }
    renderGame();
    saveGameState();
    maybeAutoComplete();
}

async function autoMoveToFoundation(sourceType, sourceCol) {
    let card;
    if (sourceType === 'waste') {
        if (state.waste.length === 0) return false;
        card = state.waste[state.waste.length - 1];
    } else {
        const col = state.tableau[sourceCol];
        if (col.length === 0) return false;
        card = col[col.length - 1];
        if (!card.faceUp) return false;
    }
    const fi = findFoundationFor(card);
    if (fi === -1) return false;
    saveToHistory();
    if (sourceType === 'waste') { state.waste.pop(); }
    else { state.tableau[sourceCol].pop(); flipTopCard(sourceCol); }
    state.foundations[fi].push(card);
    renderGame();
    saveGameState();
    await checkWin();
    maybeAutoComplete();
    return true;
}

function executeMove(src, targetType, targetIdx) {
    let cards;
    if (src.type === 'waste') {
        if (state.waste.length === 0) return false;
        cards = [state.waste[state.waste.length - 1]];
    } else if (src.type === 'foundation') {
        const f = state.foundations[src.col];
        if (f.length === 0) return false;
        cards = [f[f.length - 1]];
    } else {
        const col = state.tableau[src.col];
        if (src.cardIdx >= col.length) return false;
        cards = col.slice(src.cardIdx);
    }
    if (targetType === 'foundation') {
        if (cards.length !== 1) return false;
        if (!canMoveToFoundation(cards[0], targetIdx)) return false;
    } else {
        if (!canMoveToTableau(cards[0], targetIdx)) return false;
    }
    saveToHistory();
    if (src.type === 'waste') { state.waste.pop(); }
    else if (src.type === 'foundation') { state.foundations[src.col].pop(); }
    else { state.tableau[src.col].splice(src.cardIdx); flipTopCard(src.col); }
    if (targetType === 'foundation') { state.foundations[targetIdx].push(cards[0]); }
    else { cards.forEach(c => state.tableau[targetIdx].push(c)); }
    renderGame();
    saveGameState();
    checkWin();
    maybeAutoComplete();
    return true;
}

function flipTopCard(col) {
    const c = state.tableau[col];
    if (c.length > 0 && !c[c.length - 1].faceUp) c[c.length - 1].faceUp = true;
}

async function checkWin() {
    const total = state.foundations.reduce((sum, f) => sum + f.length, 0);
    if (total !== 52) return;
    state.gameWon = true; state.gameActive = false;
    stopTimer();
    clearSavedGame();
    const prevBest = playerCache ? playerCache.best_time : null;
    const isNewBest = prevBest === null || state.seconds < prevBest;
    await recordWin(state.seconds);
    setTimeout(() => {
        document.getElementById('win-time-display').textContent = `Time: ${formatTime(state.seconds)}`;
        document.getElementById('win-best-display').textContent = isNewBest
            ? 'New personal best! 🎉'
            : `Your best: ${formatTime(playerCache.best_time)}`;
        document.getElementById('win-modal').classList.remove('hidden');
    }, 400);
}

// ===================== RENDER =====================
function renderGame() {
    renderStock(); renderWaste(); renderFoundations(); renderTableau(); updateMoveIndicator();
}

function renderStock() {
    const el = document.getElementById('stock');
    el.innerHTML = ''; el.className = 'pile';
    if (state.stock.length > 0) {
        const back = document.createElement('div');
        back.className = 'card face-down'; back.style.position = 'relative';
        el.appendChild(back); el.classList.add('has-cards');
    } else if (state.waste.length > 0) { el.classList.add('empty-restockable'); }
}

function renderWaste() {
    const el = document.getElementById('waste');
    el.innerHTML = '';
    if (state.waste.length === 0) return;
    const card = state.waste[state.waste.length - 1];
    const cardEl = makeCard(card);
    cardEl.style.position = 'relative'; cardEl.draggable = true;
    const wasteInfo = { type: 'waste', col: -1, cardIdx: 0 };
    cardEl.addEventListener('dragstart', e => {
        dragInfo = wasteInfo; e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => cardEl.classList.add('dragging'), 0);
    });
    cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
    cardEl.addEventListener('dblclick', () => autoMoveToFoundation('waste', -1));
    addTouchDrag(cardEl, wasteInfo);
    el.appendChild(cardEl);
}

function renderFoundations() {
    for (let i = 0; i < 4; i++) {
        const el = document.getElementById(`foundation-${i}`);
        el.innerHTML = '';
        const f = state.foundations[i];
        if (f.length > 0) {
            const card = f[f.length - 1];
            const cardEl = makeCard(card);
            cardEl.style.position = 'relative'; cardEl.draggable = true;
            const foundInfo = { type: 'foundation', col: i, cardIdx: f.length - 1 };
            cardEl.addEventListener('dragstart', e => {
                dragInfo = foundInfo; e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => cardEl.classList.add('dragging'), 0);
            });
            cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
            addTouchDrag(cardEl, foundInfo);
            el.appendChild(cardEl);
        }
        el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
        el.ondragleave = () => el.classList.remove('drag-over');
        el.ondrop = e => {
            e.preventDefault(); el.classList.remove('drag-over');
            if (!dragInfo) return; executeMove(dragInfo, 'foundation', i); dragInfo = null;
        };
    }
}

function renderTableau() { for (let col = 0; col < 7; col++) renderTableauCol(col); }

function renderTableauCol(col) {
    const el = document.getElementById(`tableau-${col}`);
    el.innerHTML = '';
    const cards = state.tableau[col];
    const m = cardMetrics();
    let y = 0;
    cards.forEach((card, i) => {
        const cardEl = makeCard(card);
        cardEl.style.top = `${y}px`; cardEl.style.left = '0';
        if (card.faceUp) {
            const tabInfo = { type: 'tableau', col, cardIdx: i };
            cardEl.draggable = true;
            cardEl.addEventListener('dragstart', e => {
                dragInfo = tabInfo; e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => { for (let j = i; j < el.children.length; j++) el.children[j].classList.add('dragging'); }, 0);
            });
            cardEl.addEventListener('dragend', () => {
                Array.from(el.querySelectorAll('.dragging')).forEach(c => c.classList.remove('dragging'));
            });
            if (i === cards.length - 1)
                cardEl.addEventListener('dblclick', () => autoMoveToFoundation('tableau', col));
            addTouchDrag(cardEl, tabInfo);
            y += m.faceUp;
        } else { y += m.faceDown; }
        el.appendChild(cardEl);
    });
    el.style.minHeight = `${Math.max(y + m.h, m.h)}px`;
    el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
    el.ondragleave = e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); };
    el.ondrop = e => {
        e.preventDefault(); el.classList.remove('drag-over');
        if (!dragInfo) return; executeMove(dragInfo, 'tableau', col); dragInfo = null;
    };
}

function makeCard(card) {
    const el = document.createElement('div');
    if (!card.faceUp) { el.className = 'card face-down'; return el; }
    el.className = `card ${isRed(card) ? 'red' : 'black'}`;
    const sym = SYMBOLS[card.suit];
    el.innerHTML = `
        <span class="corner corner-tl">${card.value}<span class="corner-suit">${sym}</span></span>
        <span class="card-center-suit">${sym}</span>
        <span class="corner corner-br">${card.value}<span class="corner-suit">${sym}</span></span>`;
    return el;
}

// ===================== EVENT LISTENERS =====================
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();

    document.getElementById('stock').addEventListener('click', drawFromStock);
    document.getElementById('stock').addEventListener('touchend', e => { e.preventDefault(); drawFromStock(); });
    document.getElementById('undo-btn').addEventListener('click', undoMove);
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('move-indicator').addEventListener('click', flashAvailableMove);

    document.getElementById('new-game-btn').addEventListener('click', async () => {
        await startNewGame(true);
    });
    document.getElementById('change-player-btn').addEventListener('click', async () => {
        await recordAbandoned();
        state.gameActive = false;
        showPlayerModal();
    });
    document.getElementById('play-again-btn').addEventListener('click', () => startNewGame(false));
    document.getElementById('start-btn').addEventListener('click', tryCreatePlayer);
    document.getElementById('player-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') tryCreatePlayer();
        else document.getElementById('name-error').textContent = '';
    });

    window.addEventListener('beforeunload', saveGameState);
    window.addEventListener('pagehide', saveGameState);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGameState(); });
    showPlayerModal();
});
