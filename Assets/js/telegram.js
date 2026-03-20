/* ═══════════════════════════════════════════════════
   TELEGRAM CRM MODULE  ·  telegram.js
   Ghost-Plague-Casino Admin Panel
   v3.0 — Full rewrite with stable delete & search
════════════════════════════════════════════════════ */

'use strict';

/* ─── Module state ───────────────────────────────── */
let tgClientsData = {};
let _tgSearchQuery = '';

/* ─── Bootstrap ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('view-telegram')) {
        _tgBindUI();
        _tgSubscribeFirebase();
    }
});

/* ─── Firebase listener ──────────────────────────── */
function _tgSubscribeFirebase() {
    if (typeof Database === 'undefined') {
        console.warn('[TG] Firebase Database not ready.');
        return;
    }

    // Load token saved in Firebase
    Database.ref('Configuracion/telegram_token').get()
        .then(snap => {
            const el = document.getElementById('tgTokenInput');
            if (el && snap.exists() && snap.val()) {
                el.value = snap.val();
                console.log('[TG] Token cargado desde Firebase.');
            } else if (el) {
                const cached = localStorage.getItem('tgBotToken_v2') || '';
                if (cached) el.value = cached;
            }
        })
        .catch(err => console.warn('[TG] Error al cargar token:', err));

    // Real-time clients using unified 'users' node
    Database.ref('users').on('value', snap => {
        if (!snap.exists()) {
            tgClientsData = {};
            renderTelegramClients();
            return;
        }
        
        const allUsers = snap.val();
        tgClientsData = {};
        
        // Filter only users that have a telegram_id
        for (const uid in allUsers) {
            if (allUsers[uid].telegram_id || allUsers[uid].id) {
                tgClientsData[uid] = allUsers[uid];
            }
        }
        
        renderTelegramClients();
    }, err => console.error('[TG] Firebase error:', err));
}

/* ─── Bind all UI events ─────────────────────────── */
function _tgBindUI() {
    // Send message form
    const form = document.getElementById('tgMessageForm');
    if (form) form.addEventListener('submit', _tgHandleSend);

    // Save token → Firebase + localStorage cache
    const saveBtn  = document.getElementById('tgSaveTokenLayoutBtn');
    const tokenIn  = document.getElementById('tgTokenInput');
    if (saveBtn && tokenIn) {
        saveBtn.addEventListener('click', async e => {
            e.preventDefault();
            const t = tokenIn.value.trim().replace(/^bot/i, '');
            if (!t) { showToast('Ingresa un token válido.', 'error'); return; }
            try {
                if (typeof Database !== 'undefined') {
                    await Database.ref('Configuracion/telegram_token').set(t);
                }
                localStorage.setItem('tgBotToken_v2', t);
                tokenIn.value = t;
                showToast('Token guardado en Firebase ✅', 'success');
            } catch (err) {
                showToast('Error al guardar token: ' + err.message, 'error');
            }
        });
    }

    // Dropdown change → highlight card
    const sel = document.getElementById('tgMsgTarget');
    if (sel) sel.addEventListener('change', e => _tgHighlightCard(e.target.value));

    // Real-time search filter
    const searchInput = document.getElementById('tgSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            _tgSearchQuery = e.target.value.toLowerCase().trim();
            _tgApplySearch();
        });
    }

    // ── Delete modal buttons ──────────────────────
    const yesBtn = document.getElementById('tgConfirmDeleteYes');
    const noBtn  = document.getElementById('tgConfirmDeleteNo');
    if (yesBtn) yesBtn.addEventListener('click', _tgDoDelete);
    if (noBtn)  noBtn.addEventListener('click',  () => _tgHideDeleteModal());
}

/* ═══════════════════════════════════════════════════
   RENDER CLIENTS
════════════════════════════════════════════════════ */
function renderTelegramClients() {
    const wrapper = document.getElementById('tgClientsWrapper');
    const select  = document.getElementById('tgMsgTarget');
    if (!wrapper || !select) return;

    const prevVal = select.value;

    select.innerHTML =
        '<option value="" disabled selected>-- Elige un destinatario --</option>' +
        '<option value="all">📢 Broadcast (todos)</option>';

    wrapper.innerHTML = '';

    const entries = Object.entries(tgClientsData)
        .filter(([, c]) => !c.eliminado && c.estado !== 'eliminado')
        .sort(([, a], [, b]) => {
            return new Date(b.registrado_en || b.timestamp || b.fecha_registro || 0) -
                   new Date(a.registrado_en || a.timestamp || a.fecha_registro || 0);
        });

    if (entries.length === 0) {
        wrapper.innerHTML = `
            <div class="tg-empty-state">
                <i class="fas fa-users-slash"></i>
                <h4>Sin clientes suscritos</h4>
                <p>Nadie con cuenta de Telegram en el sistema.</p>
            </div>`;
        return;
    }

    const countEl = document.getElementById('tgClientCount');
    if (countEl) countEl.textContent = entries.length;

    entries.forEach(([uid, client]) => {
        const tgId   = String(client.telegram_id || client.id || uid.replace('tg_', ''));
        const nombre = client.nombre || client.username || 'ID ' + tgId;
        const email  = client.email || '—';
        const inicial = nombre.charAt(0).toUpperCase();

        const opt = document.createElement('option');
        opt.value = tgId;
        opt.textContent = `${nombre} (${tgId})`;
        select.appendChild(opt);

        const card = document.createElement('div');
        card.className       = 'tg-client-card';
        card.dataset.tgid    = tgId;
        card.dataset.fireuid = uid;
        card.dataset.searchNombre = nombre.toLowerCase();
        card.dataset.searchId     = tgId.toLowerCase();

        card.innerHTML = `
            <div class="tg-client-avatar">${_esc(inicial)}</div>
            <div class="tg-client-info">
                <div class="tg-client-name">${_esc(nombre)}</div>
                <div class="tg-client-id"><i class="fab fa-telegram-plane"></i> ${_esc(tgId)}</div>
                <div class="tg-client-date">${_esc(email)}</div>
            </div>
            <div class="tg-client-actions">
                <button class="btn-tg-select" title="Seleccionar y enviar mensaje">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button class="btn-delete-icon" title="Eliminar cliente">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;

        card.querySelector('.btn-tg-select').addEventListener('click', e => {
            e.stopPropagation();
            selectTelegramContact(tgId);
        });
        card.querySelector('.tg-client-info').addEventListener('click', () => {
            selectTelegramContact(tgId);
        });

        const delBtn = card.querySelector('.btn-delete-icon');
        delBtn.dataset.uid    = uid;
        delBtn.dataset.nombre = nombre;
        delBtn.addEventListener('click', e => {
            e.stopPropagation();
            _tgShowDeleteModal(
                e.currentTarget.dataset.uid,
                e.currentTarget.dataset.nombre
            );
        });

        wrapper.appendChild(card);
    });

    if (prevVal && select.querySelector(`option[value="${prevVal}"]`)) {
        select.value = prevVal;
        _tgHighlightCard(prevVal);
    }
    if (_tgSearchQuery) _tgApplySearch();
}

/* ─── Real-time search ───────────────────────────── */
function _tgApplySearch() {
    const q = _tgSearchQuery;
    document.querySelectorAll('.tg-client-card').forEach(card => {
        const matchNombre = card.dataset.searchNombre.includes(q);
        const matchId     = card.dataset.searchId.includes(q);
        card.style.display = (!q || matchNombre || matchId) ? '' : 'none';
    });
}

function windowSelectTelegramContact(tgId) {
    const sel = document.getElementById('tgMsgTarget');
    if (sel) sel.value = tgId;
    _tgHighlightCard(tgId);
    showToast('Contacto seleccionado.', 'info');
}
window.selectTelegramContact = windowSelectTelegramContact;

function _tgHighlightCard(tgId) {
    document.querySelectorAll('.tg-client-card').forEach(c => c.classList.remove('selected'));
    if (tgId && tgId !== 'all') {
        const card = document.querySelector(`.tg-client-card[data-tgid="${tgId}"]`);
        if (card) {
            card.classList.add('selected');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function _tgShowDeleteModal(uid, nombre) {
    if (!uid) {
        showToast('Error: UID del cliente no encontrado.', 'error');
        return;
    }
    const modal = document.getElementById('tgDeleteModal');
    if (!modal) {
        if (window.confirm(`¿Eliminar a "${nombre}" de todo el ecosistema?`)) {
            _tgExecuteDelete(uid, nombre);
        }
        return;
    }
    modal.dataset.pendingUid    = uid;
    modal.dataset.pendingNombre = nombre;
    const nameEl = document.getElementById('tgDeleteClientName');
    if (nameEl) nameEl.textContent = nombre;
    modal.classList.add('active');
}

function _tgHideDeleteModal() {
    const modal = document.getElementById('tgDeleteModal');
    if (modal) {
        modal.dataset.pendingUid    = '';
        modal.dataset.pendingNombre = '';
        modal.classList.remove('active');
    }
}

function _tgDoDelete() {
    const modal  = document.getElementById('tgDeleteModal');
    const uid    = modal ? modal.dataset.pendingUid    : null;
    const nombre = modal ? modal.dataset.pendingNombre : '?';
    
    const confirmBtn = document.getElementById('tgConfirmDeleteYes');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...';
    }

    _tgExecuteDelete(uid, nombre).finally(() => {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Eliminar';
        }
        _tgHideDeleteModal();
    });
}

function _tgExecuteDelete(uid, nombre) {
    console.log('[TG] Iniciando eliminación del ecosistema — uid:', uid);
    if (!uid) return Promise.resolve();

    const clientData = tgClientsData[uid] || {};
    const telegramId = clientData.telegram_id || clientData.id || null;
    const clientPath = 'users/' + uid; // Strict unified node

    const blacklistPath = telegramId ? ('TelegramBlacklist/' + telegramId) : null;

    const blacklistPromise = (blacklistPath && telegramId)
        ? Database.ref(blacklistPath).set({
            telegram_id: telegramId,
            nombre:      nombre || '—',
            blocked_at:  new Date().toISOString(),
            blocked_by:  (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.email : 'admin'
          })
        : Promise.resolve();

    return blacklistPromise
        .then(() => {
            // Delete universally from the `users` root
            var updates = {};
            updates[clientPath] = null;
            
            // Cleanup related cascading data like historial
            return Database.ref('historial').orderByChild('user_id').equalTo(uid).once('value').then(snap => {
                if (snap.exists()) {
                    snap.forEach(child => { updates['historial/' + child.key] = null; });
                }
                updates['player_missions/' + uid] = null;
                updates['misiones_usuarios/' + uid] = null;
                
                return Database.ref().update(updates);
            });
        })
        .then(() => {
            console.log('[TG] ✅ Eliminación central exitosa:', uid);
            showToast(`"${nombre}" eliminado de Firebase central.`, 'success');
        })
        .catch(err => {
            console.error('[TG] ❌ Error:', err);
            showToast('Error al eliminar: ' + err.message, 'error');
        });
}

// Legacy compat
window.deleteTelegramClient = function(uid, nombre) {
    _tgShowDeleteModal(uid, nombre);
};

/* ═══════════════════════════════════════════════════
   SEND MESSAGE
════════════════════════════════════════════════════ */
async function _tgHandleSend(e) {
    e.preventDefault();

    const tokenRaw = (document.getElementById('tgTokenInput')?.value || '').trim();
    const target   = (document.getElementById('tgMsgTarget')?.value  || '').trim();
    const text     = (document.getElementById('tgMsgText')?.value    || '').trim();
    const btn      = document.getElementById('tgSendBtn');
    const resultEl = document.getElementById('tgSendResult');

    if (!tokenRaw) { _tgResult(resultEl, 'error', 'Ingresa el Token del Bot primero.'); return; }
    if (!target)   { _tgResult(resultEl, 'error', 'Selecciona un destinatario.'); return; }
    if (!text)     { _tgResult(resultEl, 'error', 'El mensaje no puede estar vacío.'); return; }

    const token = tokenRaw.replace(/^bot/i, '').trim();

    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    _tgResult(resultEl, 'info', 'Procesando...');

    try {
        if (target === 'all') {
            const clients = Object.values(tgClientsData).filter(c => !c.eliminado && c.telegram_id);
            if (!clients.length) throw new Error('No hay clientes activos.');

            _tgResult(resultEl, 'info', `Enviando a ${clients.length} clientes...`);
            let ok = 0, fail = 0;
            for (const c of clients) {
                try { await _tgSendMessage(token, c.telegram_id, text); ok++; }
                catch (err) { console.warn('[TG] Broadcast fail', c.telegram_id, err.message); fail++; }
            }
            _tgResult(resultEl, ok > 0 ? 'success' : 'error', `Broadcast: ${ok} enviados, ${fail} fallidos.`);
            if (ok > 0) showToast(`Broadcast completado (${ok}/${ok + fail})`, 'success');
        } else {
            await _tgSendMessage(token, target, text);
            _tgResult(resultEl, 'success', '✓ Mensaje enviado correctamente.');
            showToast('Mensaje enviado.', 'success');
        }
        document.getElementById('tgMsgText').value = '';
    } catch (err) {
        console.error('[TG] Send error:', err);
        _tgResult(resultEl, 'error', _tgFriendlyError(err.message));
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Despachar Mensaje';
    }
}

/* ─── Core API call using URLSearchParams (no CORS preflight) ── */
async function _tgSendMessage(token, chatId, text) {
    const params = new URLSearchParams({
        chat_id:    String(chatId),
        text:       text,
        parse_mode: 'HTML'
    });
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    console.log('[TG] POST', url.replace(token, '***'), '→ chat_id:', chatId);

    const res = await fetch(url, { method: 'POST', body: params });

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(_tgHttpError(res.status, errText));
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'API de Telegram rechazó el mensaje.');
    return data;
}

/* ─── Helpers ────────────────────────────────────── */
function _tgResult(el, type, msg) {
    if (!el) return;
    const icons  = { success: 'check-circle', error: 'times-circle', info: 'info-circle' };
    const colors = { success: 'var(--success)', error: 'var(--danger)', info: 'var(--text-muted)' };
    el.innerHTML = `<span style="color:${colors[type]||colors.info}"><i class="fas fa-${icons[type]||'info-circle'}"></i> ${_esc(msg)}</span>`;
}

function _tgFriendlyError(raw) {
    if (!raw) return 'Error desconocido.';
    const r = raw.toLowerCase();
    if (r.includes('unauthorized') || r.includes('401')) return 'Token inválido. Verifica tu BotFather token.';
    if (r.includes('chat not found'))    return 'Chat no encontrado — el usuario debe enviar un mensaje al bot primero.';
    if (r.includes('failed to fetch'))   return 'Error de red. Verifica tu conexión a internet.';
    return raw;
}

function _tgHttpError(status, body) {
    if (status === 401) return 'Token inválido (401 Unauthorized).';
    if (status === 404) return 'Token incorrecto o endpoint no válido (404).';
    if (status === 400) return 'Parámetros incorrectos (400): ' + body;
    return `Error HTTP ${status}`;
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
