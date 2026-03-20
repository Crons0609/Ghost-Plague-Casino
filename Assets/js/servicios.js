/* ════════════════════════════════════════════════════════
   GHOST PLAGUE CASINO — SPORTS BETTING JS
   Assets/js/servicios.js
════════════════════════════════════════════════════════ */

'use strict';

/* ─── State ──────────────────────────────────────────── */
let _userId = null;
let _userData = {};
let _matchesData = {};
let _selectedBets = {}; // Format: { matchId: 'home' | 'draw' | 'away' }

/* ─── Telegram WebApp detection ──────────────────────── */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const DEV_MODE = true;
const DEV_USER = { id: 99999999, first_name: 'Tester', last_name: 'Dev', photo_url: '' };

/* ─── DOM refs ───────────────────────────────────────── */
const $sportsBits = document.getElementById('sports-user-bits');
const $matchesContainer = document.getElementById('matchesContainer');
const $btnBack = document.getElementById('btn-back-sports');

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    if (TG) {
        TG.ready();
        TG.expand();
        TG.setHeaderColor('#0b0b0f');
        TG.setBackgroundColor('#0b0b0f');
    }

    _bindEvents();

    const tgUser = (TG && TG.initDataUnsafe && TG.initDataUnsafe.user)
                 || (DEV_MODE ? DEV_USER : null);

    if (tgUser && tgUser.id) {
        _userId = 'tg_' + tgUser.id;
        _listenUser();
    }

    // Load matches
    _loadMatches();
});

/* ═══════════════════════════════════════════════════════
   USER & BALANCE LISTENER
═══════════════════════════════════════════════════════ */
function _listenUser() {
    if (!window.Database) return;
    
    Database.ref('users/' + _userId).on('value', snap => {
        if (!snap.exists()) return;
        _userData = snap.val();
        
        // Update balance
        if ($sportsBits) {
            const bits = Number(_userData.bits) || 0;
            $sportsBits.textContent = bits.toLocaleString();
        }
    });
}

/* ═══════════════════════════════════════════════════════
   MATCHES FETCH & RENDER
═══════════════════════════════════════════════════════ */
function _loadMatches() {
    if (!window.Database) {
        _renderMatchesMock();
        return;
    }

    Database.ref('matches').once('value').then(snap => {
        if (!snap.exists()) {
            _renderMatchesMock();
        } else {
            _matchesData = snap.val();
            renderMatches(_matchesData);
        }
    }).catch(err => {
        console.error('[Sports] Error al cargar partidos:', err);
        _renderMatchesMock();
    });
}

function renderMatches(matches) {
    if (!$matchesContainer) return;
    $matchesContainer.innerHTML = '';

    if (!matches || Object.keys(matches).length === 0) {
        $matchesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">No hay eventos deportivos disponibles en este momento.</div>';
        return;
    }

    Object.entries(matches).forEach(([matchId, match]) => {
        
        // Default logos if missing
        const logo1 = match.logo1 || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg';
        const logo2 = match.logo2 || 'https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg';
        
        // Check if there is an active selection
        const sel = _selectedBets[matchId];
        const aHome = sel === 'home' ? 'is-selected' : '';
        const aDraw = sel === 'draw' ? 'is-selected' : '';
        const aAway = sel === 'away' ? 'is-selected' : '';

        const html = `
            <div class="match-card">
                <div class="match-meta">
                    <span class="match-league">${_esc(match.league)}</span>
                    <span class="match-time"><i class="fas fa-clock"></i> ${_esc(match.time)}</span>
                </div>
                
                <div class="match-teams">
                    <div class="match-team">
                        <div class="match-team__logo-wrap">
                            <img src="${_esc(logo1)}" alt="${_esc(match.team1)}" loading="lazy">
                        </div>
                        <span class="match-team__name">${_esc(match.team1)}</span>
                    </div>
                    
                    <div class="match-vs">VS</div>
                    
                    <div class="match-team">
                        <div class="match-team__logo-wrap">
                            <img src="${_esc(logo2)}" alt="${_esc(match.team2)}" loading="lazy">
                        </div>
                        <span class="match-team__name">${_esc(match.team2)}</span>
                    </div>
                </div>

                <div class="match-odds">
                    <button class="odd-btn ${aHome}" onclick="handleBetSelection('${_esc(matchId)}', 'home')">
                        <span class="odd-label">1</span>
                        <span class="odd-val">${Number(match.odds.home).toFixed(2)}</span>
                    </button>
                    <button class="odd-btn ${aDraw}" onclick="handleBetSelection('${_esc(matchId)}', 'draw')">
                        <span class="odd-label">X</span>
                        <span class="odd-val">${Number(match.odds.draw).toFixed(2)}</span>
                    </button>
                    <button class="odd-btn ${aAway}" onclick="handleBetSelection('${_esc(matchId)}', 'away')">
                        <span class="odd-label">2</span>
                        <span class="odd-val">${Number(match.odds.away).toFixed(2)}</span>
                    </button>
                </div>
            </div>
        `;
        $matchesContainer.insertAdjacentHTML('beforeend', html);
    });
}

function _renderMatchesMock() {
    const mockData = {
        'm_ucl_01': {
            team1: 'Real Madrid',
            team2: 'Barcelona',
            logo1: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/56/Real_Madrid_CF.svg/1200px-Real_Madrid_CF.svg.png',
            logo2: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/47/FC_Barcelona_%28crest%29.svg/1200px-FC_Barcelona_%28crest%29.svg.png',
            league: 'La Liga',
            time: 'Hoy, 20:00',
            odds: { home: 1.85, draw: 3.40, away: 2.15 }
        },
        'm_ucl_02': {
            team1: 'Man City',
            team2: 'Bayern Munich',
            logo1: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/eb/Manchester_City_FC_badge.svg/1200px-Manchester_City_FC_badge.svg.png',
            logo2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg/1200px-FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg.png',
            league: 'Champions League',
            time: 'Mañana, 15:00',
            odds: { home: 1.90, draw: 3.10, away: 2.30 }
        },
        'm_nba_01': {
            team1: 'Lakers',
            team2: 'Warriors',
            logo1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Los_Angeles_Lakers_logo.svg/1200px-Los_Angeles_Lakers_logo.svg.png',
            logo2: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/01/Golden_State_Warriors_logo.svg/1200px-Golden_State_Warriors_logo.svg.png',
            league: 'NBA',
            time: 'Viernes, 21:30',
            odds: { home: 1.75, draw: 12.00, away: 2.50 }
        }
    };
    _matchesData = mockData;
    renderMatches(mockData);
}

/* ═══════════════════════════════════════════════════════
   INTERACTIONS
═══════════════════════════════════════════════════════ */
window.handleBetSelection = function(matchId, selection) {
    _haptic('medium');
    
    // Toggle selection
    if (_selectedBets[matchId] === selection) {
        delete _selectedBets[matchId];
    } else {
        _selectedBets[matchId] = selection;
    }
    
    // Re-render to update UI classes based on state
    renderMatches(_matchesData);

    if (_selectedBets[matchId]) {
        _toast('Cuota seleccionada. Preparado.');
    }
};

function _bindEvents() {
    if ($btnBack) {
        $btnBack.addEventListener('click', () => {
            _haptic('light');
            // Navigate back to the main file index.html
            window.location.href = '../index.html';
        });
    }
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function _haptic(style) {
    if (TG && TG.HapticFeedback) {
        TG.HapticFeedback.impactOccurred(style);
    }
}

let _toastTimer = null;
function _toast(msg) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.style.cssText = [
            'position:fixed;bottom:calc(32px + env(safe-area-inset-bottom,0px));left:50%;',
            'transform:translateX(-50%) translateY(20px);',
            'background:rgba(28,22,45,0.96);',
            'border:1px solid rgba(155,93,229,0.4);',
            'color:#f0edf8;font-size:13px;font-weight:500;',
            'padding:10px 20px;border-radius:9999px;',
            'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
            'box-shadow:0 4px 24px rgba(155,93,229,0.3);',
            'transition:opacity 0.3s,transform 0.3s;opacity:0;',
            'z-index:9000;white-space:nowrap;max-width:calc(100vw - 48px);',
        ].join('');
        document.body.appendChild(toast);
    }

    toast.textContent = msg;
    if (_toastTimer) clearTimeout(_toastTimer);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    _toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2800);
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
