// ===================== CONSTANTS =====================
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const NUM_VAL = {A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
const RED_SUITS = new Set(['hearts','diamonds']);
const STORAGE_KEY = 'solitaire_stats_v1';

// ===================== STATE =====================
let state = {
    stock: [],
    waste: [],
    foundations: [[],[],[],[]],
    tableau: [[],[],[],[],[],[],[]],
    seconds: 0,
    timerInterval: null,
    gameActive: false,
    gameWon: false
};

let currentPlayer = null;
let dragInfo = null;
let history = [];  // undo stack

// ===================== HISTORY / UNDO =====================
function saveToHistory() {
    history.push({
        stock:       JSON.parse(JSON.stringify(state.stock)),
        waste:       JSON.parse(JSON.stringify(state.waste)),
        foundations: JSON.parse(JSON.stringify(state.foundations)),
        tableau:     JSON.parse(JSON.stringify(state.tableau)),
        seconds:     state.seconds
    });
    if (history.length > 100) history.shift();
    document.getElementById('undo-btn').disabled = false;
}

function undoMove() {
    if (history.length === 0) return;
    const prev = history.pop();
    state.stock       = prev.stock;
    state.waste       = prev.waste;
    state.foundations = prev.foundations;
    state.tableau     = prev.tableau;
    state.seconds     = prev.seconds;
    document.getElementById('timer').textContent = formatTime(state.seconds);
    document.getElementById('undo-btn').disabled = history.length === 0;
    renderGame();
}

// ===================== STATS =====================
function loadAllStats() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function getPlayerStats(name) {
    return loadAllStats()[name] || { played: 0, wins: 0, bestTime: null };
}

function savePlayerStats(name, stats) {
    const all = loadAllStats();
    all[name] = stats;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) {}
}

function recordWin(seconds) {
    const stats = getPlayerStats(currentPlayer);
    stats.played++;
    stats.wins++;
    if (stats.bestTime === null || seconds < stats.bestTime) stats.bestTime = seconds;
    savePlayerStats(currentPlayer, stats);
    updateStatsDisplay();
}

function recordAbandoned() {
    if (!currentPlayer || !state.gameActive || state.gameWon) return;
    const stats = getPlayerStats(currentPlayer);
    stats.played++;
    savePlayerStats(currentPlayer, stats);
    updateStatsDisplay();
}

function updateStatsDisplay() {
    if (!currentPlayer) return;
    const s = getPlayerStats(currentPlayer);
    const losses = s.played - s.wins;
    const rate = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
    const best = s.bestTime !== null ? formatTime(s.bestTime) : '--:--';
    document.getElementById('player-name-display').textContent = currentPlayer;
    document.getElementById('stat-played').textContent  = s.played;
    document.getElementById('stat-wins').textContent    = s.wins;
    document.getElementById('stat-losses').textContent  = losses;
    document.getElementById('stat-rate').textContent    = rate + '%';
    document.getElementById('stat-best').textContent    = best;
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
function showPlayerModal() {
    stopTimer();
    const modal = document.getElementById('player-modal');
    modal.classList.remove('hidden');
    document.getElementById('player-name-input').value = '';

    const all = loadAllStats();
    const names = Object.keys(all);
    const container = document.getElementById('existing-players');
    container.innerHTML = '';

    if (names.length > 0) {
        const label = document.createElement('p');
        label.className = 'existing-label';
        label.textContent = 'Select player';
        container.appendChild(label);

        names.forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'player-select-btn';
            const s = all[name];
            const rate = s.played > 0 ? Math.round((s.wins / s.played) * 100) : 0;
            btn.textContent = `${name}  —  ${s.wins}W / ${s.played - s.wins}L  (${rate}%)`;
            btn.onclick = () => selectPlayer(name);
            container.appendChild(btn);
        });

        const divider = document.createElement('p');
        divider.className = 'or-divider';
        divider.textContent = 'or new player';
        container.appendChild(divider);
    }
}

function selectPlayer(name) {
    currentPlayer = name;
    document.getElementById('player-modal').classList.add('hidden');
    updateStatsDisplay();
    startNewGame(false);
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

// ===================== GAME SETUP =====================
function startNewGame(countAbandoned = true) {
    if (countAbandoned && state.gameActive && !state.gameWon) recordAbandoned();

    stopTimer();
    history = [];
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('win-modal').classList.add('hidden');

    const deck = shuffle(createDeck());
    state.stock = [];
    state.waste = [];
    state.foundations = [[],[],[],[]];
    state.tableau     = [[],[],[],[],[],[],[]];
    state.gameWon = false;
    state.gameActive = true;

    let idx = 0;
    for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
            const card = { ...deck[idx++] };
            card.faceUp = (row === col);
            state.tableau[col].push(card);
        }
    }
    while (idx < deck.length) state.stock.push({ ...deck[idx++], faceUp: false });

    startTimer();
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
    // Check waste top card → foundation or tableau
    if (state.waste.length > 0) {
        const wc = state.waste[state.waste.length - 1];
        if (findFoundationFor(wc) !== -1) return true;
        for (let c = 0; c < 7; c++) { if (canMoveToTableau(wc, c)) return true; }
    }

    // Check all tableau columns
    for (let col = 0; col < 7; col++) {
        const cards = state.tableau[col];
        if (cards.length === 0) continue;
        const firstUp = cards.findIndex(c => c.faceUp);
        if (firstUp === -1) continue;
        // Top card → foundation?
        if (findFoundationFor(cards[cards.length - 1]) !== -1) return true;
        // Any face-up sequence → another column?
        for (let i = firstUp; i < cards.length; i++) {
            for (let c = 0; c < 7; c++) {
                if (c !== col && canMoveToTableau(cards[i], c)) return true;
            }
        }
    }
    return false;
}

function updateMoveIndicator() {
    const el = document.getElementById('move-indicator');
    if (!state.gameActive || state.gameWon) { el.textContent = ''; el.className = ''; return; }
    if (hasAvailableMove()) {
        el.textContent = '✓ Moves available';
        el.className = 'moves-ok';
    } else {
        el.textContent = '✗ No moves available — try a new game';
        el.className = 'moves-none';
    }
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
}

function autoMoveToFoundation(sourceType, sourceCol) {
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

    if (sourceType === 'waste') {
        state.waste.pop();
    } else {
        state.tableau[sourceCol].pop();
        flipTopCard(sourceCol);
    }

    state.foundations[fi].push(card);
    renderGame();
    checkWin();
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

    if (src.type === 'waste') {
        state.waste.pop();
    } else if (src.type === 'foundation') {
        state.foundations[src.col].pop();
    } else {
        state.tableau[src.col].splice(src.cardIdx);
        flipTopCard(src.col);
    }

    if (targetType === 'foundation') {
        state.foundations[targetIdx].push(cards[0]);
    } else {
        cards.forEach(c => state.tableau[targetIdx].push(c));
    }

    renderGame();
    checkWin();
    return true;
}

function flipTopCard(col) {
    const c = state.tableau[col];
    if (c.length > 0 && !c[c.length - 1].faceUp) c[c.length - 1].faceUp = true;
}

function checkWin() {
    const total = state.foundations.reduce((sum, f) => sum + f.length, 0);
    if (total !== 52) return;

    state.gameWon = true;
    state.gameActive = false;
    stopTimer();

    const prevBest = getPlayerStats(currentPlayer).bestTime;
    const isNewBest = prevBest === null || state.seconds < prevBest;
    recordWin(state.seconds);

    setTimeout(() => {
        const stats = getPlayerStats(currentPlayer);
        document.getElementById('win-time-display').textContent = `Time: ${formatTime(state.seconds)}`;
        document.getElementById('win-best-display').textContent = isNewBest
            ? 'New personal best! 🎉'
            : `Your best: ${formatTime(stats.bestTime)}`;
        document.getElementById('win-modal').classList.remove('hidden');
    }, 400);
}

// ===================== RENDER =====================
function renderGame() {
    renderStock();
    renderWaste();
    renderFoundations();
    renderTableau();
    updateMoveIndicator();
}

function renderStock() {
    const el = document.getElementById('stock');
    el.innerHTML = '';
    el.className = 'pile';
    if (state.stock.length > 0) {
        const back = document.createElement('div');
        back.className = 'card face-down';
        back.style.position = 'relative';
        el.appendChild(back);
        el.classList.add('has-cards');
    } else if (state.waste.length > 0) {
        el.classList.add('empty-restockable');
    }
}

function renderWaste() {
    const el = document.getElementById('waste');
    el.innerHTML = '';
    if (state.waste.length === 0) return;

    const card = state.waste[state.waste.length - 1];
    const cardEl = makeCard(card);
    cardEl.style.position = 'relative';
    cardEl.draggable = true;

    cardEl.addEventListener('dragstart', e => {
        dragInfo = { type: 'waste', col: -1, cardIdx: 0 };
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => cardEl.classList.add('dragging'), 0);
    });
    cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
    cardEl.addEventListener('dblclick', () => autoMoveToFoundation('waste', -1));
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
            cardEl.style.position = 'relative';
            cardEl.draggable = true;
            cardEl.addEventListener('dragstart', e => {
                dragInfo = { type: 'foundation', col: i, cardIdx: f.length - 1 };
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => cardEl.classList.add('dragging'), 0);
            });
            cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
            el.appendChild(cardEl);
        }

        el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
        el.ondragleave = () => el.classList.remove('drag-over');
        el.ondrop = e => {
            e.preventDefault();
            el.classList.remove('drag-over');
            if (!dragInfo) return;
            executeMove(dragInfo, 'foundation', i);
            dragInfo = null;
        };
    }
}

function renderTableau() {
    for (let col = 0; col < 7; col++) renderTableauCol(col);
}

function renderTableauCol(col) {
    const el = document.getElementById(`tableau-${col}`);
    el.innerHTML = '';

    const cards = state.tableau[col];
    let y = 0;

    cards.forEach((card, i) => {
        const cardEl = makeCard(card);
        cardEl.style.top  = `${y}px`;
        cardEl.style.left = '0';

        if (card.faceUp) {
            cardEl.draggable = true;

            cardEl.addEventListener('dragstart', e => {
                dragInfo = { type: 'tableau', col, cardIdx: i };
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => {
                    for (let j = i; j < el.children.length; j++) el.children[j].classList.add('dragging');
                }, 0);
            });

            cardEl.addEventListener('dragend', () => {
                Array.from(el.querySelectorAll('.dragging')).forEach(c => c.classList.remove('dragging'));
            });

            if (i === cards.length - 1) {
                cardEl.addEventListener('dblclick', () => autoMoveToFoundation('tableau', col));
            }

            y += 36;
        } else {
            y += 22;
        }

        el.appendChild(cardEl);
    });

    el.style.minHeight = `${Math.max(y + 116, 116)}px`;

    el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
    el.ondragleave = e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); };
    el.ondrop = e => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (!dragInfo) return;
        executeMove(dragInfo, 'tableau', col);
        dragInfo = null;
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
        <span class="corner corner-br">${card.value}<span class="corner-suit">${sym}</span></span>
    `;
    return el;
}

// ===================== EVENT LISTENERS =====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stock').addEventListener('click', drawFromStock);
    document.getElementById('undo-btn').addEventListener('click', undoMove);
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('new-game-btn').addEventListener('click', () => startNewGame(true));
    document.getElementById('change-player-btn').addEventListener('click', () => {
        recordAbandoned();
        state.gameActive = false;
        showPlayerModal();
    });
    document.getElementById('play-again-btn').addEventListener('click', () => startNewGame(false));
    document.getElementById('start-btn').addEventListener('click', () => {
        const name = document.getElementById('player-name-input').value.trim();
        if (name) selectPlayer(name);
    });
    document.getElementById('player-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const name = document.getElementById('player-name-input').value.trim();
            if (name) selectPlayer(name);
        }
    });
    showPlayerModal();
});
