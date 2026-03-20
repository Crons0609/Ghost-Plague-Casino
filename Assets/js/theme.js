/* ═══════════════════════════════════════════════════
   GHOST-PLAGUE-CASINO  ·  theme.js
   Global theming system — Firebase-backed, real-time
   v1.0
════════════════════════════════════════════════════ */

'use strict';

/* ─── Theme presets ──────────────────────────────── */
const THEME_PRESETS = {
    'casino-dark': {
        label:    'Casino Oscuro',
        icon:     '🎰',
        primary:  '#8b5cf6',
        secondary:'#7c3aed',
        bgMain:   '#0f172a',
        bgPanel:  '#1e293b',
        bgCard:   'rgba(30,41,59,0.75)',
        textMain: '#f8fafc',
        textMuted:'#94a3b8',
        accent:   '#8b5cf6',
        success:  '#10b981',
        danger:   '#ef4444',
        warning:  '#f59e0b',
        border:   'rgba(255,255,255,0.10)',
        mode:     'dark'
    },
    'neon': {
        label:    'Neon',
        icon:     '⚡',
        primary:  '#00f5ff',
        secondary:'#7c3aed',
        bgMain:   '#050014',
        bgPanel:  '#0d001f',
        bgCard:   'rgba(13,0,31,0.85)',
        textMain: '#ffffff',
        textMuted:'#8892b0',
        accent:   '#00f5ff',
        success:  '#00ff88',
        danger:   '#ff2d55',
        warning:  '#ffd700',
        border:   'rgba(0,245,255,0.12)',
        mode:     'dark'
    },
    'gold-casino': {
        label:    'Gold Casino',
        icon:     '👑',
        primary:  '#f59e0b',
        secondary:'#d97706',
        bgMain:   '#0c0a07',
        bgPanel:  '#1a1507',
        bgCard:   'rgba(26,21,7,0.85)',
        textMain: '#fef3c7',
        textMuted:'#92400e',
        accent:   '#f59e0b',
        success:  '#10b981',
        danger:   '#ef4444',
        warning:  '#f59e0b',
        border:   'rgba(245,158,11,0.15)',
        mode:     'dark'
    },
    'minimal-dark': {
        label:    'Minimal',
        icon:     '◼',
        primary:  '#3b82f6',
        secondary:'#2563eb',
        bgMain:   '#111111',
        bgPanel:  '#1c1c1c',
        bgCard:   'rgba(28,28,28,0.9)',
        textMain: '#eeeeee',
        textMuted:'#888888',
        accent:   '#3b82f6',
        success:  '#22c55e',
        danger:   '#ef4444',
        warning:  '#eab308',
        border:   'rgba(255,255,255,0.08)',
        mode:     'dark'
    },
    'light': {
        label:    'Claro',
        icon:     '☀️',
        primary:  '#7c3aed',
        secondary:'#4f46e5',
        bgMain:   '#f1f5f9',
        bgPanel:  '#ffffff',
        bgCard:   'rgba(255,255,255,0.9)',
        textMain: '#0f172a',
        textMuted:'#64748b',
        accent:   '#7c3aed',
        success:  '#059669',
        danger:   '#dc2626',
        warning:  '#d97706',
        border:   'rgba(0,0,0,0.08)',
        mode:     'light'
    }
};

/* ─── Default theme ──────────────────────────────── */
const DEFAULT_THEME = { ...THEME_PRESETS['casino-dark'] };

/* ─── Internal state ─────────────────────────────── */
let _currentTheme  = { ...DEFAULT_THEME };
let _previewActive = false;

/* ════════════════════════════════════════════════════
   APPLY THEME (writes CSS variables to :root)
═════════════════════════════════════════════════════*/
function applyTheme(theme, isPreview = false) {
    if (!theme) return;
    const r = document.documentElement;

    r.style.setProperty('--primary',      theme.primary   || DEFAULT_THEME.primary);
    r.style.setProperty('--primary-hover',theme.secondary || DEFAULT_THEME.secondary);
    r.style.setProperty('--secondary',    theme.secondary || DEFAULT_THEME.secondary);
    r.style.setProperty('--bg-main',      theme.bgMain    || DEFAULT_THEME.bgMain);
    r.style.setProperty('--bg-panel',     theme.bgPanel   || DEFAULT_THEME.bgPanel);
    r.style.setProperty('--bg-card',      theme.bgCard    || DEFAULT_THEME.bgCard);
    r.style.setProperty('--text-main',    theme.textMain  || DEFAULT_THEME.textMain);
    r.style.setProperty('--text-muted',   theme.textMuted || DEFAULT_THEME.textMuted);
    r.style.setProperty('--accent',       theme.accent    || DEFAULT_THEME.accent);
    r.style.setProperty('--success',      theme.success   || DEFAULT_THEME.success);
    r.style.setProperty('--danger',       theme.danger    || DEFAULT_THEME.danger);
    r.style.setProperty('--warning',      theme.warning   || DEFAULT_THEME.warning);
    r.style.setProperty('--border',       theme.border    || DEFAULT_THEME.border);
    r.style.setProperty('--shadow-glow',  `0 0 20px ${(theme.primary || DEFAULT_THEME.primary)}33`);

    // Dark/light mode body class
    document.body.classList.toggle('theme-light', theme.mode === 'light');
    document.body.classList.toggle('theme-dark',  theme.mode !== 'light');

    if (!isPreview) {
        _currentTheme  = { ...theme };
        _previewActive = false;
        console.log('[Theme] Applied:', JSON.stringify(theme));
    } else {
        _previewActive = true;
    }

    // Notify other components
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
}

/* ════════════════════════════════════════════════════
   GET THEME from Firebase
═════════════════════════════════════════════════════*/
function getTheme() {
    return new Promise((resolve, reject) => {
        if (typeof Database === 'undefined') { resolve(DEFAULT_THEME); return; }
        Database.ref('Configuracion/theme').get()
            .then(snap => {
                if (snap.exists() && snap.val()) {
                    resolve(snap.val());
                } else {
                    resolve(DEFAULT_THEME);
                }
            })
            .catch(err => { console.warn('[Theme] getTheme error:', err); resolve(DEFAULT_THEME); });
    });
}

/* ════════════════════════════════════════════════════
   SAVE THEME to Firebase
═════════════════════════════════════════════════════*/
async function saveTheme(theme) {
    if (typeof Database === 'undefined') {
        showToast && showToast('Firebase no disponible.', 'error');
        return;
    }
    try {
        await Database.ref('Configuracion/theme').set({ ...theme, updatedAt: new Date().toISOString() });
        applyTheme(theme);
        if (typeof showToast === 'function') showToast('✅ Tema guardado globalmente.', 'success');
        console.log('[Theme] Saved to Firebase.');
        // Log activity if available
        if (typeof window.registrarActividadDash === 'function') {
            window.registrarActividadDash('tema', 'Tema global actualizado', 'purple');
        }
    } catch (err) {
        console.error('[Theme] save error:', err);
        if (typeof showToast === 'function') showToast('Error al guardar tema: ' + err.message, 'error');
    }
}

/* ════════════════════════════════════════════════════
   SUBSCRIBE — Real-time Firebase listener
   All tabs/pages update when theme changes in DB
═════════════════════════════════════════════════════*/
function subscribeTheme() {
    if (typeof Database === 'undefined') return;
    Database.ref('Configuracion/theme').on('value', snap => {
        if (snap.exists() && snap.val()) {
            const theme = snap.val();
            // Only apply if not currently previewing a different theme
            if (!_previewActive) {
                applyTheme(theme);
                _syncThemeUI(theme);
            }
        }
    });
}

/* ════════════════════════════════════════════════════
   SET PRESET
═════════════════════════════════════════════════════*/
function setPresetTheme(presetKey) {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) { console.warn('[Theme] Unknown preset:', presetKey); return; }
    applyTheme(preset, true); // Preview first
    _syncThemeUI(preset);
}

/* ════════════════════════════════════════════════════
   TOGGLE DARK/LIGHT
═════════════════════════════════════════════════════*/
function toggleDarkMode() {
    const isDark = _currentTheme.mode !== 'light';
    const next = { ..._currentTheme, mode: isDark ? 'light' : 'dark' };

    if (isDark) {
        next.bgMain    = '#f1f5f9';
        next.bgPanel   = '#ffffff';
        next.bgCard    = 'rgba(255,255,255,0.9)';
        next.textMain  = '#0f172a';
        next.textMuted = '#64748b';
        next.border    = 'rgba(0,0,0,0.08)';
    } else {
        next.bgMain    = '#0f172a';
        next.bgPanel   = '#1e293b';
        next.bgCard    = 'rgba(30,41,59,0.75)';
        next.textMain  = '#f8fafc';
        next.textMuted = '#94a3b8';
        next.border    = 'rgba(255,255,255,0.10)';
    }

    applyTheme(next, true);
    _syncThemeUI(next);
}

/* ════════════════════════════════════════════════════
   SYNC UI  (update pickers & toggle when theme changes)
═════════════════════════════════════════════════════*/
function _syncThemeUI(theme) {
    const pick = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.value = _hexOnly(val);
    };
    pick('tp-primary',   theme.primary);
    pick('tp-secondary', theme.secondary);
    pick('tp-bgMain',    theme.bgMain);
    pick('tp-textMain',  theme.textMain);
    pick('tp-accent',    theme.accent);
    pick('tp-success',   theme.success);
    pick('tp-danger',    theme.danger);
    pick('tp-warning',   theme.warning);

    const toggle = document.getElementById('tp-darkToggle');
    if (toggle) toggle.checked = (theme.mode !== 'light');

    // Update preview mini card colors
    _updatePreviewCard(theme);

    // Highlight active preset button
    document.querySelectorAll('.theme-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === _detectPreset(theme));
    });
}

function _updatePreviewCard(theme) {
    const card = document.getElementById('themePreviewCard');
    if (!card) return;
    card.style.setProperty('--prev-bg',      theme.bgPanel   || theme.bgMain);
    card.style.setProperty('--prev-primary', theme.primary);
    card.style.setProperty('--prev-text',    theme.textMain);
    card.style.setProperty('--prev-muted',   theme.textMuted);
}

function _detectPreset(theme) {
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
        if (preset.primary === theme.primary && preset.bgMain === theme.bgMain) return key;
    }
    return 'custom';
}

/* ─── Extract hex only (handle rgba etc.) ────────── */
function _hexOnly(color) {
    if (!color) return '#000000';
    if (color.startsWith('#')) return color.slice(0, 7);
    return '#000000';
}

/* ════════════════════════════════════════════════════
   BUILD CURRENT THEME from picker values
═════════════════════════════════════════════════════*/
function _buildThemeFromPickers() {
    const val = id => (document.getElementById(id)?.value || '');
    const isDark = document.getElementById('tp-darkToggle')?.checked ?? true;
    return {
        primary:   val('tp-primary')   || _currentTheme.primary,
        secondary: val('tp-secondary') || _currentTheme.secondary,
        bgMain:    val('tp-bgMain')    || _currentTheme.bgMain,
        bgPanel:   isDark ? '#1e293b'  : '#ffffff',
        bgCard:    isDark ? 'rgba(30,41,59,0.75)' : 'rgba(255,255,255,0.9)',
        textMain:  val('tp-textMain')  || _currentTheme.textMain,
        textMuted: isDark ? '#94a3b8'  : '#64748b',
        accent:    val('tp-accent')    || _currentTheme.accent,
        success:   val('tp-success')   || _currentTheme.success,
        danger:    val('tp-danger')    || _currentTheme.danger,
        warning:   val('tp-warning')   || _currentTheme.warning,
        border:    isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        mode:      isDark ? 'dark' : 'light'
    };
}

/* ════════════════════════════════════════════════════
   INIT — called when the Temas view is shown
═════════════════════════════════════════════════════*/
function initThemePanel() {
    _syncThemeUI(_currentTheme);

    // Live preview on picker change
    document.querySelectorAll('.theme-picker').forEach(input => {
        input.addEventListener('input', () => {
            const t = _buildThemeFromPickers();
            applyTheme(t, true);
            _updatePreviewCard(t);
        });
    });

    // Dark mode toggle
    const toggle = document.getElementById('tp-darkToggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            const t = _buildThemeFromPickers();
            applyTheme(t, true);
            _syncThemeUI(t);
        });
    }

    // Preset buttons
    document.querySelectorAll('.theme-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setPresetTheme(btn.dataset.preset);
        });
    });

    // Save button
    const saveBtn = document.getElementById('saveThemeBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const t = _buildThemeFromPickers();
            saveBtn.disabled  = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            await saveTheme(t);
            saveBtn.disabled  = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Tema';
        });
    }

    // Reset button
    const resetBtn = document.getElementById('resetThemeBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            setPresetTheme('casino-dark');
        });
    }
}

/* ════════════════════════════════════════════════════
   BOOT — load theme on page load
═════════════════════════════════════════════════════*/
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Apply immediately from localStorage for instant paint (no flash)
    const cached = localStorage.getItem('gpc_theme_cache');
    if (cached) {
        try { applyTheme(JSON.parse(cached)); } catch(e) {}
    }

    // 2. Then load from Firebase (authoritative)
    const theme = await getTheme();
    applyTheme(theme);

    // Cache for next load
    localStorage.setItem('gpc_theme_cache', JSON.stringify(theme));

    // 3. Subscribe to real-time changes (other admins changing theme)
    subscribeTheme();
});

// When the Temas view section becomes active, init the panel
document.addEventListener('themeViewOpened', () => {
    initThemePanel();
});

// Also watch via MutationObserver — works regardless of how the SPA switches views
document.addEventListener('DOMContentLoaded', () => {
    const temasSection = document.getElementById('view-temas');
    if (temasSection) {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.attributeName === 'class' && temasSection.classList.contains('active')) {
                    setTimeout(() => initThemePanel(), 50);
                }
            });
        });
        observer.observe(temasSection, { attributes: true });
    }

    // Fallback: watch every nav-item click for the temas link
    document.querySelectorAll('.nav-item[data-view="view-temas"]').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(() => initThemePanel(), 100);
        });
    });
});

// Expose to global scope
window.applyTheme     = applyTheme;
window.saveTheme      = saveTheme;
window.getTheme       = getTheme;
window.setPresetTheme = setPresetTheme;
window.toggleDarkMode = toggleDarkMode;
window.initThemePanel = initThemePanel;
window.THEME_PRESETS  = THEME_PRESETS;
