/**
 * ╔══════════════════════════════════════════════════════════╗
 *   GHOST PLAGUE CASINO — server.js
 *   Secure Node.js + Express backend for Render Web Service
 *   Firebase Admin SDK | Telegram Bot API
 * ╚══════════════════════════════════════════════════════════╝
 * 
 *  Credentials: ghost-plague-casino-firebase-adminsdk-fbsvc-8fbf75edfe.json
 *  (kept out of git via .gitignore — uploaded to Render via Secret Files)
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const admin      = require('firebase-admin');

/* ─── Firebase Admin Initialization ─────────────────────── */
// Loads the service account JSON directly.
// On Render: upload the file as a Secret File at path /etc/secrets/firebase-admin.json
// and set FIREBASE_CREDENTIALS_PATH=/etc/secrets/firebase-admin.json
// Locally: the file lives in the project root (excluded from git via .gitignore)
const CREDENTIALS_PATH = process.env.FIREBASE_CREDENTIALS_PATH
    || path.join(__dirname, 'ghost-plague-casino-firebase-adminsdk-fbsvc-8fbf75edfe.json');

let firebaseApp;
try {
    const serviceAccount = require(CREDENTIALS_PATH);

    if (!admin.apps.length) {
        firebaseApp = admin.initializeApp({
            credential:  admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
                         || 'https://ghost-plague-casino-default-rtdb.firebaseio.com',
        });
    } else {
        firebaseApp = admin.app();
    }
    console.log('[Firebase] Admin SDK initialized ✅');
} catch (err) {
    console.error('[Firebase] Admin SDK init error:', err.message);
    process.exit(1);  // Crash fast — bad credentials = do not run
}

const db = admin.database();

/* ─── Express Setup ──────────────────────────────────────── */
const app  = express();
const PORT = process.env.PORT || 10000;

// CORS — restrict to your Render domain in production
const allowedOrigins = [
    `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`,
    'http://localhost:3000',
    'http://127.0.0.1:5500',   // Local Live Server dev
];
app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (Telegram WebApp / curl)
        if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
            return cb(null, true);
        }
        cb(new Error('Not allowed by CORS: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
}));

app.use(express.json({ limit: '64kb' }));          // Limit payload size
app.use(express.urlencoded({ extended: false }));

// ── Serve static frontend ─────────────────────────────────
// Structure: index.html at root, Assets/ and Views/ as-is
app.use(express.static(path.join(__dirname)));
app.use('/Views',  express.static(path.join(__dirname, 'Views')));
app.use('/Assets', express.static(path.join(__dirname, 'Assets')));

/* ─── Middleware: verify Telegram user token ─────────────── */
// Simple guard: client must send X-User-Id header (uid like "tg_12345678")
function requireUserId(req, res, next) {
    const uid = req.body.userId || req.query.userId;
    if (!uid || typeof uid !== 'string' || uid.length < 3) {
        return res.status(400).json({ ok: false, error: 'userId requerido.' });
    }
    // Only allow expected key format
    if (!/^tg_\d+$/.test(uid)) {
        return res.status(400).json({ ok: false, error: 'Formato de userId inválido.' });
    }
    req.uid = uid;
    next();
}

/* ─── Helpers ────────────────────────────────────────────── */
async function getUser(uid) {
    const snap = await db.ref('users/' + uid).get();
    if (!snap.exists()) return null;
    return snap.val();
}

function sanitizeNumber(val, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

/* ════════════════════════════════════════════════════════════
   API ENDPOINTS
════════════════════════════════════════════════════════════ */

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString(), service: 'Ghost Plague Casino Backend' });
});

/* ─────────────────────────────────────────────────────────
   💰 POST /api/add-bits
   Body: { userId, amount }
   Adds bits to a user's balance (admin-triggered or verified)
───────────────────────────────────────────────────────── */
app.post('/api/add-bits', requireUserId, async (req, res) => {
    try {
        const amount = sanitizeNumber(req.body.amount);

        if (amount <= 0 || amount > 1_000_000) {
            return res.status(400).json({ ok: false, error: 'Cantidad inválida (1 – 1,000,000).' });
        }

        const userRef = db.ref('users/' + req.uid);
        let newBits;

        await userRef.transaction(current => {
            if (!current) return current;  // User does not exist, abort
            newBits = (current.bits || 0) + amount;
            return { ...current, bits: newBits };
        });

        if (newBits === undefined) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        }

        // Log transaction
        await db.ref('Transacciones').push({
            userId:    req.uid,
            tipo:      'credito',
            monto:     amount,
            saldo_nuevo: newBits,
            timestamp: new Date().toISOString(),
        });

        return res.json({ ok: true, newBits });
    } catch (err) {
        console.error('[add-bits]', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
});

/* ─────────────────────────────────────────────────────────
   💸 POST /api/remove-bits
   Body: { userId, amount }
   Removes bits — never goes negative
───────────────────────────────────────────────────────── */
app.post('/api/remove-bits', requireUserId, async (req, res) => {
    try {
        const amount = sanitizeNumber(req.body.amount);

        if (amount <= 0 || amount > 1_000_000) {
            return res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
        }

        const userRef  = db.ref('users/' + req.uid);
        let newBits;
        let insufficient = false;

        await userRef.transaction(current => {
            if (!current) return current;
            const current_bits = current.bits || 0;
            if (current_bits < amount) {
                insufficient = true;
                return current;   // Abort — no change
            }
            newBits = current_bits - amount;
            return { ...current, bits: newBits };
        });

        if (insufficient) {
            return res.status(409).json({ ok: false, error: 'Saldo insuficiente.' });
        }
        if (newBits === undefined) {
            return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        }

        await db.ref('Transacciones').push({
            userId:    req.uid,
            tipo:      'debito',
            monto:     amount,
            saldo_nuevo: newBits,
            timestamp: new Date().toISOString(),
        });

        return res.json({ ok: true, newBits });
    } catch (err) {
        console.error('[remove-bits]', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
});

/* ─────────────────────────────────────────────────────────
   🎮 POST /api/register-game
   Body: { userId, game, resultado, bitsApostados, bitsGanados }
───────────────────────────────────────────────────────── */
app.post('/api/register-game', requireUserId, async (req, res) => {
    try {
        const { game, resultado, bitsApostados, bitsGanados } = req.body;

        if (!game || typeof game !== 'string') {
            return res.status(400).json({ ok: false, error: 'game requerido.' });
        }
        if (!['victoria', 'derrota', 'empate'].includes(resultado)) {
            return res.status(400).json({ ok: false, error: 'resultado inválido.' });
        }

        const apostados = sanitizeNumber(bitsApostados);
        const ganados   = sanitizeNumber(bitsGanados);

        // Register game in history
        await db.ref('historial').push({
            user_id:        req.uid,
            juego:          game.slice(0, 64),    // Limit length
            resultado,
            bits_apostados: apostados,
            bits_ganados:   ganados,
            timestamp:      new Date().toISOString(),
        });

        // Atomic counter update on user profile
        await db.ref('users/' + req.uid).transaction(current => {
            if (!current) return current;
            return {
                ...current,
                partidas: (current.partidas || 0) + 1,
                xp:       (current.xp || 0) + Math.max(1, Math.floor(apostados / 10)),
            };
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[register-game]', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
});

/* ─────────────────────────────────────────────────────────
   🤖 POST /api/send-telegram
   Body: { chatId, message }
   Sends a Telegram message server-side (token never exposed)
───────────────────────────────────────────────────────── */
app.post('/api/send-telegram', async (req, res) => {
    try {
        const chatId  = String(req.body.chatId  || '').trim();
        const message = String(req.body.message || '').trim();
        const token   = process.env.TELEGRAM_BOT_TOKEN;

        if (!chatId || !message) {
            return res.status(400).json({ ok: false, error: 'chatId y message requeridos.' });
        }
        if (!token) {
            return res.status(500).json({ ok: false, error: 'Token de bot no configurado.' });
        }
        if (message.length > 4096) {
            return res.status(400).json({ ok: false, error: 'Mensaje demasiado largo.' });
        }

        const fetch = require('node-fetch');
        const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
        const tgRes  = await fetch(apiUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
        });
        const tgData = await tgRes.json();

        if (!tgData.ok) {
            return res.status(502).json({ ok: false, error: tgData.description });
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[send-telegram]', err);
        return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
});

/* ─────────────────────────────────────────────────────────
   💳 POST /api/paypal-verify  (placeholder — integrate later)
   Body: { orderId, userId }
───────────────────────────────────────────────────────── */
app.post('/api/paypal-verify', requireUserId, async (req, res) => {
    // TODO: Implement PayPal Order validation using @paypal/checkout-server-sdk
    // 1. Capture the order via PayPal Orders API
    // 2. On success, call /api/add-bits
    return res.status(501).json({ ok: false, error: 'Integración PayPal pendiente de configuración.' });
});

/* ─── SPA fallback: any GET → index.html ─────────────────── */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─── Global error handler ───────────────────────────────── */
app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno.' });
});

/* ─── Start ──────────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`[GPC] 🎰 Server running → http://localhost:${PORT}`);
});

module.exports = app;
