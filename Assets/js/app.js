/* ════════════════════════════════════════════════════════
   GHOST PLAGUE CASINO — app.js
   Player-facing logic
   Firebase compat SDK (window.Database already configured)
   Pure Vanilla JS, no frameworks, 60FPS
════════════════════════════════════════════════════════ */

'use strict';

/* ─── DEV MODE (set false en producción) ─────────────── */
const DEV_MODE = true;
const DEV_USER = { id: 99999999, first_name: 'Tester', last_name: 'Dev', photo_url: '' };

/* ─── Telegram WebApp detection ──────────────────────── */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

/* ─── State ──────────────────────────────────────────── */
let _userId = null;   // Firebase key, e.g. "tg_12345678"
let _userData = {};
let _bitTarget = 0;      // current target for animated counter
let _bitCurrent = 0;
let _rafBit = null;   // requestAnimationFrame handle

/* ─── DOM refs ───────────────────────────────────────── */
const $loader = document.getElementById('app-loader');
const $screenGate = document.getElementById('screen-no-telegram');
const $screenApp = document.getElementById('screen-app');
const $screenGames = document.getElementById('screen-games');

const $userName = document.getElementById('user-name');
const $userLevel = document.getElementById('user-level');
const $levelNum = document.getElementById('level-num');
const $userAvatar = document.getElementById('user-avatar');
const $userBits = document.getElementById('user-bits');
const $userXP = document.getElementById('user-xp');
const $userGames = document.getElementById('user-games');
const $statLevel = document.getElementById('stat-level');
const $statXP = document.getElementById('stat-xp');
const $statGames = document.getElementById('stat-games');
const $slogan = document.getElementById('casino-slogan');

const $gamesContainer = document.getElementById('gamesContainer');
const $gamesUserBits = document.getElementById('games-user-bits');

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    // ── Telegram WebApp initialization ──────────────
    if (TG) {
        TG.ready();
        TG.expand();
        TG.setHeaderColor('#0b0b0f');
        TG.setBackgroundColor('#0b0b0f');

        // Keep screen on while app is running
        if (TG.requestFullscreen) TG.requestFullscreen();
    }

    // ── Bind UI events ────────────────────────────────
    _bindEvents();
    _spawnParticles();
    _loadSlogan();

    // ── Detect user ──────────────────────────────────
    const tgUser = (TG && TG.initDataUnsafe && TG.initDataUnsafe.user)
                 || (DEV_MODE ? DEV_USER : null);

    if (tgUser && tgUser.id) {
        _userId = 'tg_' + tgUser.id;
        await _ensureUserExists(tgUser);
        _listenUser();
        _showScreen('app');
    } else {
        // Not from Telegram — show gate screen
        _showScreen('gate');
    }
});

/* ═══════════════════════════════════════════════════════
   SHOW / HIDE SCREENS
═══════════════════════════════════════════════════════ */
function _showScreen(name) {
    if ($screenGate) $screenGate.classList.remove('is-active');
    if ($screenApp) $screenApp.classList.remove('is-active');
    if ($screenGames) $screenGames.classList.remove('is-active');

    if (name === 'gate') {
        if ($screenGate) $screenGate.setAttribute('aria-hidden', 'false');
        if ($screenApp) $screenApp.setAttribute('aria-hidden', 'true');
        if ($screenGames) $screenGames.setAttribute('aria-hidden', 'true');
        requestAnimationFrame(() => { if ($screenGate) $screenGate.classList.add('is-active'); });
    } else if (name === 'app') {
        if ($screenGate) $screenGate.setAttribute('aria-hidden', 'true');
        if ($screenApp) $screenApp.setAttribute('aria-hidden', 'false');
        if ($screenGames) $screenGames.setAttribute('aria-hidden', 'true');
        requestAnimationFrame(() => { if ($screenApp) $screenApp.classList.add('is-active'); });
    } else if (name === 'games') {
        if ($screenGate) $screenGate.setAttribute('aria-hidden', 'true');
        if ($screenApp) $screenApp.setAttribute('aria-hidden', 'true');
        if ($screenGames) $screenGames.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => { if ($screenGames) $screenGames.classList.add('is-active'); });
        _loadGames(); // Fetch and render games when opening the screen
    }

    // Hide loader
    setTimeout(() => {
        if ($loader) $loader.classList.add('is-hidden');
    }, 350);
}

/* ═══════════════════════════════════════════════════════
   FIREBASE: ENSURE USER EXISTS
   If the user comes via Telegram but is NOT in Firebase yet,
   create a minimal profile following the unified schema.
═══════════════════════════════════════════════════════ */
async function _ensureUserExists(tgUser) {
    try {
        const snap = await Database.ref('users/' + _userId).get();
        if (!snap.exists()) {
            const fullName = (tgUser.first_name || '') + (tgUser.last_name ? ' ' + tgUser.last_name : '');
            await Database.ref('users/' + _userId).set({
                telegram_id: tgUser.id,
                nombre: fullName || ('Jugador ' + tgUser.id),
                nivel: 1,
                xp: 0,
                bits: 0,
                partidas: 0,
                estado: true,
                fecha_registro: new Date().toISOString()
            });
        } else {
            // Ensure telegram_id is linked
            const val = snap.val();
            if (!val.telegram_id) {
                await Database.ref('users/' + _userId).update({ telegram_id: tgUser.id });
            }
        }
    } catch (err) {
        console.error('[App] Error verificando usuario:', err);
    }
}

/* ═══════════════════════════════════════════════════════
   FIREBASE: REAL-TIME USER LISTENER
═══════════════════════════════════════════════════════ */
function _listenUser() {
    Database.ref('users/' + _userId).on('value', snap => {
        if (!snap.exists()) return;
        _userData = snap.val();
        renderUser(_userData);
        renderBalance(_userData);
    }, err => console.error('[App] Firebase user listener error:', err));
}

/* ═══════════════════════════════════════════════════════
   RENDER: USER DATA
═══════════════════════════════════════════════════════ */
function renderUser(user) {
    if (!user) return;

    const nombre = _esc(user.nombre || 'Jugador');
    if ($userName) $userName.textContent = nombre;

    const nivel = user.nivel || 1;
    if ($levelNum) $levelNum.textContent = nivel;
    if ($statLevel) $statLevel.textContent = nivel;

    // Avatar
    const tgUser = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
    const photoUrl = (tgUser && tgUser.photo_url)
        || (user.photo_url)
        || _generateAvatarDataUrl(nombre.charAt(0).toUpperCase());

    if ($userAvatar) {
        $userAvatar.src = photoUrl;
        $userAvatar.onerror = () => {
            $userAvatar.src = _generateAvatarDataUrl(nombre.charAt(0).toUpperCase());
        };
    }

    // XP & games stats
    const xp = user.xp || 0;
    const partidas = user.partidas || 0;
    if ($userXP) $userXP.textContent = 'XP: ' + xp.toLocaleString();
    if ($statXP) $statXP.textContent = xp.toLocaleString();
    if ($userGames) $userGames.textContent = 'Partidas: ' + partidas.toLocaleString();
    if ($statGames) $statGames.textContent = partidas.toLocaleString();
}

/* ═══════════════════════════════════════════════════════
   RENDER: BALANCE (animated counter)
═══════════════════════════════════════════════════════ */
function renderBalance(user) {
    if (!user) return;
    const newBits = Number(user.bits) || 0;
    if (newBits !== _bitTarget) {
        _animateBits(_bitTarget, newBits);
        _bitTarget = newBits;
    }
}

function _animateBits(from, to) {
    if (_rafBit) cancelAnimationFrame(_rafBit);
    const duration = 900; // ms
    const startTime = performance.now();
    const diff = to - from;

    function tick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + diff * eased);
        if ($userBits) $userBits.textContent = current.toLocaleString();
        if ($gamesUserBits) $gamesUserBits.textContent = current.toLocaleString();
        if (progress < 1) {
            _rafBit = requestAnimationFrame(tick);
        } else {
            if ($userBits) $userBits.textContent = to.toLocaleString();
            if ($gamesUserBits) $gamesUserBits.textContent = to.toLocaleString();
        }
    }
    _rafBit = requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════════
   RENDER: SLOGAN (from Firebase config)
═══════════════════════════════════════════════════════ */
function renderSlogan(text) {
    if ($slogan && text) {
        $slogan.textContent = text;
    }
}

function _loadSlogan() {
    Database.ref('config/eslogan').on('value', snap => {
        if (snap.exists() && snap.val()) {
            renderSlogan(snap.val());
        }
    });
}

/* ═══════════════════════════════════════════════════════
   BUTTON HANDLERS
═══════════════════════════════════════════════════════ */
function handleButtons() {
    // do nothing — bound in _bindEvents
}

function _bindEvents() {
    // ── Gate screen ────────────────────────────────
    const $btnTg = document.getElementById('btn-open-telegram');
    if ($btnTg) {
        $btnTg.addEventListener('click', () => {
            window.open('https://t.me/Ghost_Plague_CasinoBot', '_blank');
        });
    }

    // ── Close / exit ───────────────────────────────
    const $btnClose = document.getElementById('btn-close');
    if ($btnClose) {
        $btnClose.addEventListener('click', () => {
            if (TG && TG.close) {
                TG.close();
            } else {
                window.history.back();
            }
        });
    }

    // ── Play Now ───────────────────────────────────
    const $btnPlay = document.getElementById('btn-play');
    if ($btnPlay) {
        $btnPlay.addEventListener('click', () => {
            _haptic('light');
            _showScreen('games');
        });
    }

    // ── Back from Games ────────────────────────────
    const $btnBackGames = document.getElementById('btn-back-games');
    if ($btnBackGames) {
        $btnBackGames.addEventListener('click', () => {
            _haptic('light');
            _showScreen('app');
        });
    }

    // ── Sports Betting ─────────────────────────────
    const $btnSports = document.getElementById('btn-sports');
    if ($btnSports) {
        $btnSports.addEventListener('click', () => {
            _haptic('light');
            window.location.href = 'Views/servicios.html';
        });
    }

    // ── Recharge ──────────────────────────────────
    const $btnRec = document.getElementById('btn-recharge');
    if ($btnRec) {
        $btnRec.addEventListener('click', () => {
            _haptic('medium');
            _toast('Contacta a soporte para recargar bits 💳');
        });
    }

    // ── PayPal Bits ────────────────────────────────
    const $btnPP = document.getElementById('btn-paypal');
    if ($btnPP) {
        $btnPP.addEventListener('click', () => {
            _haptic('medium');
            _toast('Retiro vía PayPal — próximamente 🅿️');
        });
    }
}

/* ═══════════════════════════════════════════════════════
   PARTICLES (lightweight, CSS-driven)
═══════════════════════════════════════════════════════ */
function _spawnParticles() {
    const field = document.getElementById('particle-field');
    if (!field) return;

    const count = window.innerWidth < 480 ? 18 : 30;
    const colors = ['var(--neon-purple)', 'var(--neon-gold)', 'var(--neon-green)', 'var(--neon-blue)'];

    for (let i = 0; i < count; i++) {
        const el = document.createElement('span');
        el.className = 'particle';
        el.style.cssText = [
            'left:' + (Math.random() * 100) + '%;',
            'top:' + (60 + Math.random() * 40) + '%;',
            'background:' + colors[Math.floor(Math.random() * colors.length)] + ';',
            '--dur:' + (5 + Math.random() * 9) + 's;',
            '--delay:' + (Math.random() * 8) + 's;',
            'width:' + (1 + Math.random() * 2) + 'px;',
            'height:' + (1 + Math.random() * 2) + 'px;',
        ].join('');
        field.appendChild(el);
    }
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */

// Telegram haptic feedback
function _haptic(style) {
    if (TG && TG.HapticFeedback) {
        TG.HapticFeedback.impactOccurred(style);
    }
}

// Minimal in-app toast
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

// Fallback avatar canvas
function _generateAvatarDataUrl(letter) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');
        // Background
        const grad = ctx.createLinearGradient(0, 0, 80, 80);
        grad.addColorStop(0, '#7b22e8');
        grad.addColorStop(1, '#9b5de5');
        ctx.fillStyle = grad;
        ctx.arc(40, 40, 40, 0, Math.PI * 2);
        ctx.fill();
        // Letter
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 34px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter || '?', 40, 41);
        return canvas.toDataURL();
    } catch { return ''; }
}

// HTML escape
function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════
   GAMES FETCH & RENDER
═══════════════════════════════════════════════════════ */
let _gamesLoaded = false;

function _loadGames() {
    if (_gamesLoaded) return; // Load only once
    _gamesLoaded = true;

    if ($gamesContainer) {
        $gamesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Cargando juegos... <span class="loader__skull" style="display:inline-block; font-size:24px; animation: skullFloat 2s ease-in-out infinite;">💀</span></div>';
    }

    Database.ref('games').once('value').then(snap => {
        if (!snap.exists()) {
            _renderGamesMock();
        } else {
            renderGames(snap.val());
        }
    }).catch(err => {
        console.error('[App] Error al cargar juegos:', err);
        _renderGamesMock(); // Fallback to mock on error
    });
}

function renderGames(games) {
    if (!$gamesContainer) return;
    $gamesContainer.innerHTML = '';

    if (!games || Object.keys(games).length === 0) {
        $gamesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">No hay juegos disponibles en este momento.</div>';
        return;
    }

    Object.entries(games).forEach(([gameId, game]) => {
        // Build card HTML
        const badgeHtml = game.badge ? `<span class="game-card__badge">${_esc(game.badge)}</span>` : '';
        let playStr = `_toast('Entrando a ${_esc(game.name || 'Juego')}... 🎲');`;
        if (gameId === 'blackjack') {
             playStr = `window.location.href = 'Views/blackjack.html';`;
        }
        const html = `
            <div class="game-card">
              ${badgeHtml}
              <div class="game-card__image">
                <img src="${game.image || 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?auto=format&fit=crop&w=600&q=80'}" alt="${_esc(game.name || 'Juego')}" loading="lazy" />
                <div class="game-card__overlay"></div>
              </div>
              <div class="game-card__content">
                <h3 class="game-card__title">${_esc(game.name || 'Juego')}</h3>
                <p class="game-card__desc">${_esc(game.description || 'Juego premium de Ghost Plague Casino.')}</p>
                <button class="game-card__btn" onclick="${playStr}">
                  <span class="btn__text">Jugar</span>
                  <span class="game-card__btn-glow"></span>
                </button>
              </div>
            </div>
        `;
        $gamesContainer.insertAdjacentHTML('beforeend', html);
    });
}

function _renderGamesMock() {
    // Premium fallback data for testing the UI if Firebase has no games
    const mockData = {
        'blackjack': { name: 'Blackjack VIP', description: 'La mesa más exclusiva. Desafía al crupier y gana a lo grande.', image: 'https://images.unsplash.com/photo-1606167668149-b0f8d168241c?auto=format&fit=crop&w=600&q=80', badge: 'HOT' },
        'roulette': { name: 'Ruleta Europea', description: 'Gira la ruleta mágica. Cada número podría cambiar tu destino.', image: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?auto=format&fit=crop&w=600&q=80' },
        'slots': { name: 'Plague Slots', description: 'Slots temáticos de Ghost Plague. ¡Busca las tres calaveras doradas!', image: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?auto=format&fit=crop&w=600&q=80', badge: 'NEW' },
        'poker': { name: "Texas Hold'em", description: 'Torneos diarios con botes acumulados gigantescos. Juega contra los mejores.', image: 'https://images.unsplash.com/photo-1541278107931-e006523892df?auto=format&fit=crop&w=600&q=80' }
    };
    renderGames(mockData);
}

/* ─── Public API (for admin/linkage if needed) ───────── */
window.renderUser = renderUser;
window.renderBalance = renderBalance;
window.renderSlogan = renderSlogan;
window.renderGames = renderGames; // Exposed for dynamic injected data
