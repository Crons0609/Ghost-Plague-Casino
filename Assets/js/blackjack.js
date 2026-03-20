/* ════════════════════════════════════════════════════════
   GHOST PLAGUE CASINO — VIP BLACKJACK LOGIC
   Assets/js/blackjack.js
   v1.0 | Pure JS | Real Casino Rules
════════════════════════════════════════════════════════ */

'use strict';

/* ─── State ──────────────────────────────────────────── */
let _userId = null;
let _userData = { bits: 5000 }; 
let _gamePhase = 'betting'; // betting, playerTurn, dealerTurn, resolved
let _deck = [];
let _dealerHands = [];
let _playerHands = [];
let _currentBet = 0;

/* ─── Telegram WebApp detection ──────────────────────── */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const DEV_MODE = true;
const DEV_USER = { id: 99999999, first_name: 'Tester', last_name: 'Dev' };

/* ─── DOM refs ───────────────────────────────────────── */
const $bitsDisplay = document.getElementById('bj-user-bits');
const $btnBack = document.getElementById('btn-back-bj');
const $inputBet = document.getElementById('bj-input-bet');

const $panelBet = document.getElementById('panel-bet');
const $panelPlay = document.getElementById('panel-play');
const $panelResult = document.getElementById('panel-result');

const $dealerCards = document.getElementById('dealer-cards');
const $playerCards = document.getElementById('player-cards');
const $dealerScore = document.getElementById('dealer-score-bubble');
const $playerScore = document.getElementById('player-score-bubble');

const $msgOverlay = document.getElementById('bj-message');
const $msgTitle = document.getElementById('bj-message-text');
const $msgSub = document.getElementById('bj-message-sub');

const $betDisplay = document.getElementById('bj-current-bet-display');
const $betAmount = document.getElementById('bj-bet-amount');

// Action buttons
const $btnDeal = document.getElementById('btn-deal');
const $btnHit = document.getElementById('btn-hit');
const $btnStand = document.getElementById('btn-stand');
const $btnDouble = document.getElementById('btn-double');
const $btnRestart = document.getElementById('btn-restart');
const $btnBetAll = document.getElementById('btn-bet-all');
const $betChips = document.querySelectorAll('.bj-chip:not(.bj-chip--all)');

/* ─── Card Assets (Using dynamic unicode/CSS for purity or specific SVGs)  */
const SUITS = ['♠', '♥', '♣', '♦'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    if (TG) {
        TG.ready();
        TG.expand();
        // Prevent scroll on mobile
        document.body.style.overflow = 'hidden';
    }

    _bindEvents();

    const tgUser = (TG && TG.initDataUnsafe && TG.initDataUnsafe.user)
                 || (DEV_MODE ? DEV_USER : null);

    if (tgUser && tgUser.id) {
        _userId = 'tg_' + tgUser.id;
        _listenUser();
    } else {
        // Fallback testing balance
        _updateUIBalance(5000);
    }

    _initGame();
});

/* ═══════════════════════════════════════════════════════
   FIREBASE INTEGRATION
═══════════════════════════════════════════════════════ */
function _listenUser() {
    if (!window.Database) return;
    Database.ref('users/' + _userId).on('value', snap => {
        if (!snap.exists()) return;
        _userData = snap.val();
        _updateUIBalance(Number(_userData.bits) || 0);
    });
}

async function _updateFirebaseBits(amount) {
    if (!window.Database || !_userId) {
        _userData.bits = (_userData.bits || 0) + amount;
        _updateUIBalance(_userData.bits);
        return;
    }

    const ref = Database.ref('users/' + _userId + '/bits');
    try {
        await ref.transaction(currentBits => {
            return (currentBits || 0) + amount;
        });
    } catch (e) {
        console.error("Firebase update failed", e);
    }
}

function _updateUIBalance(val) {
    if ($bitsDisplay) {
        $bitsDisplay.textContent = val.toLocaleString();
    }
}

/* ═══════════════════════════════════════════════════════
   GAME LOGIC & ENGINE
═══════════════════════════════════════════════════════ */
function _initGame() {
    _gamePhase = 'betting';
    _dealerHands = [];
    _playerHands = [];
    _currentBet = 0;
    
    // UI Reset
    $dealerCards.innerHTML = '';
    $playerCards.innerHTML = '';
    $dealerScore.style.opacity = '0';
    $playerScore.style.opacity = '0';
    $msgOverlay.classList.remove('is-active');
    $betDisplay.style.opacity = '0';
    
    _setPanel('bet');
    $inputBet.value = 10;
    _createDeck(6); // 6 Decks Casino Standard
}

function _createDeck(numDecks = 1) {
    _deck = [];
    for (let d = 0; d < numDecks; d++) {
        for (let suit of SUITS) {
            for (let val of VALUES) {
                let weight = parseInt(val);
                if (val === 'J' || val === 'Q' || val === 'K') weight = 10;
                if (val === 'A') weight = 11;
                _deck.push({ suit, val, weight });
            }
        }
    }
    _shuffleArray(_deck);
}

function _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function _drawCard() {
    if (_deck.length < 15) _createDeck(6); // Reshuffle if shoe is low
    return _deck.pop();
}

function _calculateScore(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        score += card.weight;
        if (card.val === 'A') aces += 1;
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

/* ═══════════════════════════════════════════════════════
   GAME PHASES
═══════════════════════════════════════════════════════ */
async function _dealInitialCards() {
    const betVal = parseInt($inputBet.value, 10);
    const userBits = _userData.bits || 0;
    
    if (isNaN(betVal) || betVal <= 0) {
        _toast('Apuesta inválida.');
        return;
    }
    if (betVal > userBits) {
        _toast('Bits insuficientes.');
        return;
    }

    _haptic('medium');
    $btnDeal.disabled = true;

    // Deduct bet immediately
    _currentBet = betVal;
    await _updateFirebaseBits(-_currentBet);

    // Update UI for play
    $betAmount.textContent = _currentBet.toLocaleString();
    $betDisplay.style.opacity = '1';
    _setPanel('none'); // Hide controls during animation

    // Draw
    _playerHands = [_drawCard(), _drawCard()];
    _dealerHands = [_drawCard(), _drawCard()];

    // Animate deal
    await _uiAddCard($playerCards, _playerHands[0], 0);
    await _uiAddCard($dealerCards, _dealerHands[0], 300);
    await _uiAddCard($playerCards, _playerHands[1], 300);
    await _uiAddCard($dealerCards, _dealerHands[1], 300, true); // Hidden card

    _updateScores(false);
    _gamePhase = 'playerTurn';
    
    // Check instant blackjack
    const pScore = _calculateScore(_playerHands);
    if (pScore === 21) {
        _resolveGame(true); // Player has Blackjack
    } else {
        _setPanel('play');
        // Check if double is available (only if balance left >= bet)
        const currentBalance = _userData.bits || 0;
        $btnDouble.disabled = currentBalance < _currentBet;
    }
}

async function _playerHit() {
    if (_gamePhase !== 'playerTurn') return;
    _haptic('light');

    // After first action, Double is not allowed
    $btnDouble.disabled = true;

    const card = _drawCard();
    _playerHands.push(card);
    await _uiAddCard($playerCards, card, 0);
    
    const pScore = _calculateScore(_playerHands);
    _updateScores(false);

    if (pScore > 21) {
        _resolveGame(); // Bust
    } else if (pScore === 21) {
        _playerStand(); // Auto stand on 21
    }
}

async function _playerDouble() {
    if (_gamePhase !== 'playerTurn') return;
    
    const userBits = _userData.bits || 0;
    if (userBits < _currentBet) {
        _toast('Sin bits para doblar.');
        return;
    }

    _haptic('heavy');
    // Deduct another bet
    await _updateFirebaseBits(-_currentBet);
    _currentBet *= 2;
    $betAmount.textContent = _currentBet.toLocaleString();

    _setPanel('none');

    const card = _drawCard();
    _playerHands.push(card);
    await _uiAddCard($playerCards, card, 0);
    
    _updateScores(false);
    _playerStand(); // Double means 1 hit then stand
}

async function _playerStand() {
    if (_gamePhase !== 'playerTurn') return;
    _gamePhase = 'dealerTurn';
    _setPanel('none');
    _haptic('light');

    // Reveal dealer card
    const hiddenCardEl = $dealerCards.querySelector('.is-hidden');
    if (hiddenCardEl) {
        hiddenCardEl.classList.remove('is-hidden');
    }
    _updateScores(true);
    await _delay(600);

    let dScore = _calculateScore(_dealerHands);
    
    // Dealer draws to 16, stands on 17
    while (dScore < 17) {
        const card = _drawCard();
        _dealerHands.push(card);
        await _uiAddCard($dealerCards, card, 400);
        dScore = _calculateScore(_dealerHands);
        _updateScores(true);
    }

    _resolveGame();
}

async function _resolveGame(isPlayerInstantBj = false) {
    _gamePhase = 'resolved';
    _setPanel('none');
    
    // Ensure dealer card is revealed if instant BJ
    const hiddenCardEl = $dealerCards.querySelector('.is-hidden');
    if (hiddenCardEl) hiddenCardEl.classList.remove('is-hidden');
    _updateScores(true);

    const pScore = _calculateScore(_playerHands);
    const dScore = _calculateScore(_dealerHands);

    let result = '';
    let payout = 0;
    
    // Win logic
    if (pScore > 21) {
        result = 'LOSE';
    } else if (dScore > 21) {
        result = 'WIN';
        payout = _currentBet * 2;
    } else if (pScore > dScore) {
        if (isPlayerInstantBj) {
            result = 'BLACKJACK';
            payout = _currentBet + (_currentBet * 1.5); // 3 to 2
        } else {
            result = 'WIN';
            payout = _currentBet * 2;
        }
    } else if (pScore < dScore) {
        result = 'LOSE';
    } else {
        // Tie
        // If player has BJ and dealer doesn't, though practically checked above
        if (isPlayerInstantBj && _dealerHands.length !== 2) {
             result = 'BLACKJACK';
             payout = _currentBet + (_currentBet * 1.5);
        } else {
             result = 'PUSH';
             payout = _currentBet; // Return original bet
        }
    }

    if (payout > 0) {
        await _updateFirebaseBits(payout);
    }

    // Show result UI
    await _delay(500);
    _showResultOverlay(result, payout);
}

/* ═══════════════════════════════════════════════════════
   DOM & UI HELPERS
═══════════════════════════════════════════════════════ */
function _setPanel(panelName) {
    $panelBet.classList.remove('is-active');
    $panelPlay.classList.remove('is-active');
    $panelResult.classList.remove('is-active');

    if (panelName === 'bet') {
        $btnDeal.disabled = false;
        $panelBet.classList.add('is-active');
    } else if (panelName === 'play') {
        $panelPlay.classList.add('is-active');
    } else if (panelName === 'result') {
        $panelResult.classList.add('is-active');
    }
}

function _updateScores(showDealer = false) {
    const pScore = _calculateScore(_playerHands);
    $playerScore.textContent = pScore;
    $playerScore.style.opacity = '1';

    if (showDealer) {
        $dealerScore.textContent = _calculateScore(_dealerHands);
    } else {
        // Show only the visible card's value
        if (_dealerHands.length > 0) {
            $dealerScore.textContent = _dealerHands[0].weight === 11 ? '11(A)' : _dealerHands[0].weight;
        }
    }
    $dealerScore.style.opacity = '1';
}

function _uiAddCard(container, cardObj, delayMs = 0, isHidden = false) {
    return new Promise(resolve => {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = `bj-card ${isHidden ? 'is-hidden' : ''}`;
            
            // Front color config based on suit
            const color = (cardObj.suit === '♥' || cardObj.suit === '♦') ? '#dc2626' : '#222';
            
            el.innerHTML = `
                <div class="bj-card__inner">
                    <div class="bj-card__front" style="color: ${color}; display: flex; flex-direction: column; justify-content: space-between; padding: 6px;">
                        <span style="font-size: 16px; font-weight: 800; line-height: 1;">${cardObj.val}<br><span style="font-size:14px">${cardObj.suit}</span></span>
                        <span style="font-size: 32px; align-self: center;">${cardObj.suit}</span>
                        <span style="font-size: 16px; font-weight: 800; line-height: 1; align-self: flex-end; transform: rotate(180deg);">${cardObj.val}<br><span style="font-size:14px">${cardObj.suit}</span></span>
                    </div>
                    <div class="bj-card__back"></div>
                </div>
            `;
            container.appendChild(el);
            
            // Audio effect logic (optional)
            _haptic('light');

            setTimeout(() => resolve(), 200); // give time for CSS animation to start
        }, delayMs);
    });
}

function _showResultOverlay(result, payout) {
    $msgTitle.className = 'bj-message-text'; // reset
    if (result === 'WIN') {
        $msgTitle.textContent = '¡GANADOR!';
        $msgTitle.classList.add('win');
        $msgSub.textContent = `+${payout.toLocaleString()} BITS`;
        _haptic('success');
    } else if (result === 'BLACKJACK') {
        $msgTitle.textContent = 'BLACKJACK';
        $msgTitle.classList.add('win');
        $msgSub.textContent = `PAYS 3:2 (+${payout.toLocaleString()} BITS)`;
        _haptic('success');
    } else if (result === 'LOSE') {
        $msgTitle.textContent = 'CASA GANA';
        $msgTitle.classList.add('lose');
        $msgSub.textContent = `-${_currentBet.toLocaleString()} BITS`;
        _haptic('error');
    } else if (result === 'PUSH') {
        $msgTitle.textContent = 'EMPATE';
        $msgSub.textContent = 'APUESTA DEVUELTA';
        _haptic('warning');
    }

    $msgOverlay.classList.add('is-active');
    _setPanel('result');
}

/* ═══════════════════════════════════════════════════════
   EVENT BINDING
═══════════════════════════════════════════════════════ */
function _bindEvents() {
    if ($btnBack) {
        $btnBack.addEventListener('click', () => {
            if (_gamePhase === 'playerTurn') {
                _toast('Termina la partida actual.');
                return;
            }
            _haptic('light');
            window.location.href = '../index.html';
        });
    }

    // Bet Input chips
    $betChips.forEach(btn => {
        btn.addEventListener('click', (e) => {
            _haptic('light');
            const inc = parseInt(e.target.dataset.val, 10);
            const current = parseInt($inputBet.value, 10) || 0;
            $inputBet.value = current + inc;
        });
    });

    if ($btnBetAll) {
        $btnBetAll.addEventListener('click', () => {
            _haptic('medium');
            $inputBet.value = _userData.bits || 0;
        });
    }

    if ($btnDeal) {
        $btnDeal.addEventListener('click', _dealInitialCards);
    }
    
    if ($btnHit) $btnHit.addEventListener('click', _playerHit);
    if ($btnStand) $btnStand.addEventListener('click', _playerStand);
    if ($btnDouble) $btnDouble.addEventListener('click', _playerDouble);
    
    if ($btnRestart) {
        $btnRestart.addEventListener('click', () => {
            _haptic('medium');
            _initGame();
        });
    }
}

function _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
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
