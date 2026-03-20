// Eliminados los import {...} because we use Firebase via CDN (Compat Mode)

var auth = firebase.auth();
var Database = firebase.database();

// Global interval for Telegram auto-scan
var _tgScanInterval = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const adminScreen = document.getElementById('adminScreen');
const globalLoader = document.getElementById('globalLoader');
const toastContainer = document.getElementById('toastContainer');

/* ──────────────────────────────────────────────────────────
   INIT / STATE OBSERVER
────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
});

// Firebase Auth Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // User is logged in
        await loadCurrentAdminData(user.uid);
        hideLoader();
        showAdminPanel();
    } else {
        // User is logged out
        hideLoader();
        showLoginScreen();
    }
});

function hideLoader() {
    if (globalLoader) {
        globalLoader.style.opacity = '0';
        setTimeout(() => globalLoader.style.display = 'none', 500);
    }
}

/* ──────────────────────────────────────────────────────────
   UI CONTROLLERS (SPA)
────────────────────────────────────────────────────────── */
function showLoginScreen() {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (adminScreen) adminScreen.style.display = 'none';
}

function showAdminPanel() {
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminScreen) adminScreen.style.display = 'flex';
    
    loadAdminsTable();
    loadDashboardKPIs();
    loadPlayersTable();
    loadHistorialTable();
    loadMissions();
    updateTopbarDate();
    subscribeGameStats();
    subscribeActivityFeed();
}

function updateTopbarDate() {
    var el = document.getElementById('topbarDate');
    if (!el) return;
    var now = new Date();
    el.textContent = now.toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setupUI() {
    // SPA Navigation
    document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            const targetView = document.getElementById(item.getAttribute('data-view'));
            if (targetView) targetView.classList.add('active');

            // Update topbar title
            var titleEl = document.getElementById('topbarTitle');
            var titles = {
                'view-dashboard': 'Casino Overview',
                'view-players':   'Players',
                'view-missions':  'Missions',
                'view-historial': 'Historial',
                'view-telegram':  'Telegram Bot',
                'view-admins':    'Admins',
                'view-temas':     'Temas Globales'
            };
            if (titleEl) titleEl.textContent = titles[item.getAttribute('data-view')] || 'Panel';

            // Auto-refresh Telegram scanner logic
            clearInterval(_tgScanInterval);
            if (item.getAttribute('data-view') === 'view-telegram') {
                tgLoadSavedToken();
                // Start auto-scan every 5 seconds
                _tgScanInterval = setInterval(function() {
                    tgScanUpdates(true); // true = silent background scan
                }, 5000);
            }
            
            // Close mobile sidebar if open
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });

    // Mobile Sidebar Toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Modals
    document.getElementById('openAddAdminModalBtn').addEventListener('click', () => {
        document.getElementById('addAdminModal').classList.add('active');
    });

    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('addAdminModal').classList.remove('active');
            var missionModal = document.getElementById('missionModal');
            if (missionModal) missionModal.classList.remove('active');
            var transferModal = document.getElementById('transferBitsModal');
            if (transferModal) transferModal.classList.remove('active');
        });
    });

    // Missions module setup
    var openAddMissionBtn = document.getElementById('openAddMissionBtn');
    if (openAddMissionBtn) {
        openAddMissionBtn.addEventListener('click', openCreateMissionModal);
    }
    var missionForm = document.getElementById('missionForm');
    if (missionForm) {
        missionForm.addEventListener('submit', handleSaveMission);
    }

    // Form Submissions
    document.getElementById('adminLoginForm').addEventListener('submit', handleLogin);
    document.getElementById('adminRegisterForm').addEventListener('submit', handleRegisterNewAdminScreen);
    document.getElementById('addAdminForm').addEventListener('submit', handleCreateAdmin);
    
    var tf = document.getElementById('transferBitsForm');
    if (tf) tf.addEventListener('submit', handleTransfer);

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Login screen toggle logic
    document.getElementById('showRegisterLink').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('adminLoginForm').style.display = 'none';
        document.getElementById('adminRegisterForm').style.display = 'block';
        document.querySelector('.login-header h2').innerText = 'Crear Administrador';
        document.querySelector('.login-header p').innerText = 'Únete al equipo administrativo';
    });

    document.getElementById('showLoginLink').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('adminRegisterForm').style.display = 'none';
        document.getElementById('adminLoginForm').style.display = 'block';
        document.querySelector('.login-header h2').innerText = 'Ghost Casino';
        document.querySelector('.login-header p').innerText = 'Acceso Clasificado - Panel SaaS';
    });
}

/* ──────────────────────────────────────────────────────────
   AUTHENTICATION LOGIC
────────────────────────────────────────────────────────── */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('loginErrorMsg');

    errorMsg.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Observer will handle redirect
    } catch (error) {
        let msg = 'Error de autenticación.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            msg = 'Credenciales incorrectas.';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'Demasiados intentos fallidos. Intenta más tarde.';
        }
        errorMsg.textContent = msg;
        btn.disabled = false;
        btn.innerHTML = 'Acceder <i class="fas fa-arrow-right"></i>';
    }
}

async function handleRegisterNewAdminScreen(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const masterKey = document.getElementById('regMasterKey').value;
    const btn = document.getElementById('regBtn');
    const errorMsg = document.getElementById('regErrorMsg');

    // Simple security check. Instead of 'GhostPlague2026', replace with the master key they want. Let's make it 'admin123'
    if (masterKey !== "admin123") {
        errorMsg.textContent = "Clave Maestra incorrecta.";
        return;
    }

    errorMsg.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const newUid = userCredential.user.uid;

        // Por defecto todos los creados desde afuera son admin, o si es el primero superadmin. Dejaremos que Firebase decida en el load.
        // Pero guardaremos los datos en BD para formalidad.
        await Database.ref(`Administradores_Panel/${newUid}`).set({
            email: email,
            nombre: name,
            rol: 'admin', // Se ajustará automáticamente a superadmin en el primer login de loadCurrentAdminData si la db está vacía
            estado: 'activo',
            creado_en: new Date().toISOString()
        });

        showToast('Cuenta creada. Iniciando sesión...', 'success');
        // onAuthStateChanged handled redirection.
    } catch (error) {
        let msg = 'Error al crear cuenta: ' + error.message;
        if (error.code === 'auth/email-already-in-use') {
            msg = 'Este correo ya pertenece a un administrador.';
        } else if (error.code === 'auth/weak-password') {
            msg = 'La contraseña es muy débil. Mínimo 6 caracteres.';
        }
        errorMsg.textContent = msg;
        btn.disabled = false;
        btn.innerHTML = 'Crear Cuenta <i class="fas fa-user-plus"></i>';
    }
}

async function handleLogout(e) {
    e.preventDefault();
    try {
        await auth.signOut();
        showToast('Sesión cerrada correctamente', 'success');
    } catch (err) {
        showToast('Error al cerrar sesión', 'error');
    }
}

/* ──────────────────────────────────────────────────────────
   ADMINS MANAGEMENT (Realtime Database & Auth)
────────────────────────────────────────────────────────── */
// Store current admin data globally
let currentAdminRol = 'admin'; 

async function loadCurrentAdminData(uid) {
    try {
        const snap = await Database.ref(`Administradores_Panel/${uid}`).get();
        let adminData = { nombre: 'Admin', rol: 'admin' };
        
        if (snap.exists()) {
            adminData = snap.val();
            currentAdminRol = adminData.rol || 'admin';
        } else {
            // First time setup: If no admin exists in DB, assume superadmin for the first login
            const adminEmail = auth.currentUser.email;
            adminData = { email: adminEmail, nombre: 'Admin Principal', rol: 'superadmin', estado: 'activo' };
            currentAdminRol = 'superadmin';
            await Database.ref(`Administradores_Panel/${uid}`).set(adminData);
        }

        // Reject accounts marked as inactive
        if (adminData.estado === 'inactivo') {
            await auth.signOut();
            showToast('Tu cuenta ha sido desactivada. Contacta a un administrador.', 'error');
            return;
        }

        document.getElementById('navAdminName').textContent = adminData.nombre;
        document.getElementById('navAdminRole').textContent = currentAdminRol.toUpperCase();
        document.getElementById('navAvatarInitials').textContent = adminData.nombre.charAt(0).toUpperCase();
        var sbName = document.getElementById('sbAdminName');
        var sbRole = document.getElementById('sbAdminRole');
        var sbAvatar = document.getElementById('sbAvatarInitials');
        if (sbName) sbName.textContent = adminData.nombre;
        if (sbRole) sbRole.textContent = currentAdminRol === 'superadmin' ? '🛡️ ADMIN COMPLETO' : '🔒 ADMIN BÁSICO';
        if (sbAvatar) sbAvatar.textContent = adminData.nombre.charAt(0).toUpperCase();

        // Apply role-based UI access
        applyRoleAccess();

    } catch (err) {
        console.error('Error fetching admin data:', err);
    }
}

// ─── Apply access restrictions based on role ───────────────
function applyRoleAccess() {
    var isFullAdmin = (currentAdminRol === 'superadmin');

    // Show/hide Nuevo Admin button
    var addBtn = document.getElementById('openAddAdminModalBtn');
    if (addBtn) addBtn.style.display = isFullAdmin ? 'inline-flex' : 'none';

    // Restrict nav items for basic admin
    var restrictedViews = ['view-telegram', 'view-temas', 'view-admins'];
    if (!isFullAdmin) {
        restrictedViews.forEach(viewId => {
            var navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
            if (navItem) {
                navItem.style.opacity = '0.4';
                navItem.style.pointerEvents = 'none';
                navItem.title = '🔒 Acceso restringido';
            }
        });
    }
}

function loadAdminsTable() {
    const tbody = document.querySelector('#adminsTable tbody');
    if (!tbody) return;

    Database.ref('Administradores_Panel').on('value', (snap) => {
        if (!snap.exists()) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay administradores registrados</td></tr>';
            return;
        }

        const admins = snap.val();
        let html = '';
        let total = 0, activos = 0, supers = 0;

        for (const [uid, data] of Object.entries(admins)) {
            total++;
            if (data.estado === 'activo') activos++;
            if (data.rol === 'superadmin') supers++;

            const isFullAdmin = data.rol === 'superadmin';
            const roleBadge = isFullAdmin
                ? `<span class="admin-role-badge admin-role-full">&#128737; Admin Completo</span>`
                : `<span class="admin-role-badge admin-role-basic">&#128274; Admin B&aacute;sico</span>`;

            const stateBadge = data.estado === 'activo'
                ? `<span class="badge-status" style="background:rgba(16,185,129,0.1);color:var(--success);">Activo</span>`
                : `<span class="badge-status" style="background:rgba(239,68,68,0.1);color:var(--danger);">Inactivo</span>`;

            const isCurrentUser = (auth.currentUser && uid === auth.currentUser.uid);
            const canDelete = (currentAdminRol === 'superadmin') && !isCurrentUser;
            const canEdit   = (currentAdminRol === 'superadmin');
            const fechaCreacion = data.creado_en ? new Date(data.creado_en).toLocaleDateString('es-MX') : '—';

            html += `
                <tr>
                    <td><strong>${data.email || '—'}</strong>${isCurrentUser ? ' <span style="font-size:0.7rem;color:var(--primary);">(tú)</span>' : ''}</td>
                    <td>${data.nombre || '—'}</td>
                    <td>${roleBadge}</td>
                    <td>${stateBadge}</td>
                    <td style="font-size:0.85rem;color:var(--text-muted);">${fechaCreacion}</td>
                    <td style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <button class="btn-action-edit" onclick="openEditAdmin('${uid}')" ${canEdit ? '' : 'style="display:none"'}>
                            <i class="fas fa-pencil-alt"></i> Editar
                        </button>
                        <button class="btn-danger" onclick="deleteAdmin('${uid}', '${(data.email||'').split("'").join('')}')" ${canDelete ? '' : 'style="opacity:0.4;pointer-events:none;"'}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }

        tbody.innerHTML = html;
        var el = document.getElementById('kpiTotalAdmins'); if(el) el.textContent = total;
        var el2 = document.getElementById('kpiActiveAdmins'); if(el2) el2.textContent = activos;
        var el3 = document.getElementById('kpiSuperAdmins'); if(el3) el3.textContent = supers;
    });
}

// ─── Open Edit Modal ───────────────────────────────────────
window.openEditAdmin = function(uid) {
    Database.ref(`Administradores_Panel/${uid}`).get().then(snap => {
        if (!snap.exists()) return;
        const data = snap.val();
        document.getElementById('editAdminUid').value = uid;
        document.getElementById('editAdminName').value = data.nombre || '';
        document.getElementById('editAdminRole').value = data.rol || 'admin';
        document.getElementById('editAdminEstado').value = data.estado || 'activo';
        document.getElementById('editAdminError').textContent = '';
        document.getElementById('editAdminModal').classList.add('active');
    });
};

// ─── Save Edit Admin ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    var editForm = document.getElementById('editAdminForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (currentAdminRol !== 'superadmin') {
                showToast('No tienes permisos para editar administradores.', 'error');
                return;
            }
            var uid = document.getElementById('editAdminUid').value;
            var nombre = document.getElementById('editAdminName').value.trim();
            var rol = document.getElementById('editAdminRole').value;
            var estado = document.getElementById('editAdminEstado').value;
            var btn = document.getElementById('saveEditAdminBtn');
            var errEl = document.getElementById('editAdminError');
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            errEl.textContent = '';

            try {
                await Database.ref(`Administradores_Panel/${uid}`).update({ nombre, rol, estado });
                closeModal('editAdminModal');
                showToast('Administrador actualizado correctamente.', 'success');
            } catch(err) {
                errEl.textContent = 'Error: ' + err.message;
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            }
        });
    }
});

// ─── Generic Modal Close ───────────────────────────────────
window.closeModal = function(modalId) {
    var m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
};

async function handleCreateAdmin(e) {
    e.preventDefault();
    if (currentAdminRol !== 'superadmin') {
        showToast('No tienes permisos para crear administradores.', 'error');
        return;
    }

    const name = document.getElementById('newAdminName').value.trim();
    const email = document.getElementById('newAdminEmail').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;

    const btn = document.getElementById('saveAdminBtn');
    const errorMsg = document.getElementById('addAdminErrorMsg');
    
    btn.disabled = true;
    btn.textContent = 'Creando...';
    errorMsg.textContent = '';

    try {
        const prevUser = auth.currentUser;
        
        // 1. Create Auth user
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const newUid = userCredential.user.uid;

        // 2. Save role in DB
        await Database.ref(`Administradores_Panel/${newUid}`).set({
            email: email,
            nombre: name,
            rol: role,
            estado: 'activo',
            creado_en: new Date().toISOString()
        });

        showToast('Administrador creado exitosamente', 'success');
        document.getElementById('addAdminModal').classList.remove('active');
        document.getElementById('addAdminForm').reset();

        showToast('Sesión cambiada al nuevo usuario de forma automática.', 'success');

    } catch (error) {
        console.error("Error creating admin:", error);
        errorMsg.textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Crear Administrador';
    }
}

// Global exposure for onClick handlers in HTML strings
window.deleteAdmin = async function(uid, email) {
    if (currentAdminRol !== 'superadmin') return;
    if (!confirm(`¿Estás seguro de que deseas eliminar al administrador ${email}?`)) return;

    try {
        await Database.ref(`Administradores_Panel/${uid}`).remove();
        showToast('Registro de Administrador eliminado de la base datos', 'success');
    } catch (err) {
        showToast('Error al eliminar', 'error');
    }
};

function updateKPIs() {}

/* ──────────────────────────────────────────────────────────
   DASHBOARD KPIs — LIVE FROM FIREBASE
────────────────────────────────────────────────────────── */
function loadDashboardKPIs() {
    // 1. Users KPI dynamically from the unified 'users' node
    Database.ref('users').on('value', snap => {
        var uData = snap.exists() ? snap.val() : {};
        var total = 0, activos = 0, bitsEconomia = 0;

        var allUsers = Object.values(uData).filter(p => p.estado !== 'eliminado' && p.eliminado !== true);
        total = allUsers.length;
        
        allUsers.forEach(function(p) {
            if (p.estado === 'activo' || p.estado === true || p.activo === true) activos++;
        });

        // Sum across ALL recognized entries
        Object.values(uData).forEach(function(p) {
            var raw = String(p.bits || p.Bits || '0').replace(/,/g, '');
            var b = parseInt(raw, 10);
            if (!isNaN(b)) {
                bitsEconomia += b;
            }
        });

        setText('kpiTotalRegistrados', total.toLocaleString('es-MX'));
        setText('kpiJugadoresActivos', activos.toLocaleString('es-MX'));
        setText('kpiBitsEconomia', bitsEconomia.toLocaleString('es-MX'));
    });

    // 2. Transaction Volume Dynamics
    Database.ref('Transacciones').on('value', function(snap) {
        var all = snap.exists() ? Object.values(snap.val()) : [];
        var now = new Date();
        var hoy = 0, semana = 0, mes = 0;
        
        all.forEach(function(t) {
            var d = new Date(t.timestamp || t.fecha || 0);
            if (d.toDateString() === now.toDateString()) hoy++;
            if ((now - d) <= 7 * 24 * 3600 * 1000) semana++;
            if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) mes++;
        });

        setText('kpiTxHistorico', all.length.toLocaleString('es-MX'));
        setText('kpiTxHoy', hoy.toLocaleString('es-MX'));
        setText('kpiTxSemana', semana.toLocaleString('es-MX'));
        setText('kpiTxMes', mes.toLocaleString('es-MX'));
    });

    // 3. System Statistics real-time
    Database.ref('Estadisticas').on('value', function(snap) {
        if (!snap.exists()) return;
        var stats = snap.val();
        
        setText('kpiGananciaCasinoBits', parseInt(stats.casino_bits || 0).toLocaleString('es-MX'));
        
        setText('kpiIngresosHistorico', '$' + parseFloat(stats.ingresos_usd || 0).toFixed(2));
        setText('kpiRetirosHistorico', '$' + parseFloat(stats.retiros_usd || 0).toFixed(2));
        
        setText('kpiGananciaHoy', '$' + parseFloat(stats.ganancia_hoy || 0).toFixed(2));
        setText('kpiGananciaSemana', '$' + parseFloat(stats.ganancia_semana || 0).toFixed(2));
        setText('kpiGananciaMes', '$' + parseFloat(stats.ganancia_mes || 0).toFixed(2));
        
        setText('kpiBitsHoy', parseInt(stats.bits_hoy || 0).toLocaleString('es-MX') + ' Bits');
        setText('kpiBitsSemana', parseInt(stats.bits_semana || 0).toLocaleString('es-MX') + ' Bits');
        setText('kpiBitsMes', parseInt(stats.bits_mes || 0).toLocaleString('es-MX') + ' Bits');
    });
}

function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* ──────────────────────────────────────────────────────────
   PLAYERS TABLE (Unified Multi-Node Backward Compatibility)
────────────────────────────────────────────────────────── */
function _gscEsc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadPlayersTable() {
    var tbody = document.getElementById('playersTableBody');
    if (!tbody) return;

    Database.ref('users').on('value', snap => {
        var usersData = snap.exists() ? snap.val() : {};
        var allPlayers = Object.keys(usersData).map(uid => {
            return { id: uid, data: usersData[uid] };
        });

        // Filter out soft-deleted
        allPlayers = allPlayers.filter(function(p) { return p.data.estado !== 'eliminado' && p.data.eliminado !== true; });

        // Sort descending by bits
        allPlayers.sort(function(a, b) {
            return parseInt(b.data.bits || b.data.Bits || 0) - parseInt(a.data.bits || a.data.Bits || 0);
        });

        if (allPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay jugadores registrados.</td></tr>';
            return;
        }

        var rows = '';
        allPlayers.forEach(function(item) {
            var p = item.data;
            var uid = item.id;
            var tgId = p.telegram_id || '—';
            var name = p.nombre || p.username || 'Desconocido';
            var nivel = parseInt(p.nivel || 1);
            var xp = parseInt(p.xp || 0);
            var bits = parseInt(p.bits || p.Bits || 0);
            var partidas = parseInt(p.partidas || 0);
            
            var escName = String(name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            
            rows += '<tr>' +
                '<td>' + _gscEsc(tgId) + '</td>' +
                '<td><strong>' + _gscEsc(name) + '</strong></td>' +
                '<td><span class="badge" style="background:rgba(139,92,246,0.1);color:var(--primary);">Lvl ' + nivel + '</span></td>' +
                '<td>' + xp.toLocaleString('es-MX') + '</td>' +
                '<td>' + bits.toLocaleString('es-MX') + '</td>' +
                '<td>' + partidas.toLocaleString('es-MX') + '</td>' +
                '<td style="text-align:right; white-space:nowrap;">' +
                    '<button class="btn-primary btn-sm" onclick="openManageBitsModal(\'' + uid + '\', \'' + escName + '\', ' + bits + ')" style="margin-right:0.4rem;" title="Gestionar Bits"><i class="fas fa-coins"></i></button>' +
                    '<button class="btn-action-edit btn-sm" onclick="openEditPlayerModal(\'' + uid + '\')" style="margin-right:0.4rem;" title="Editar Jugador"><i class="fas fa-pencil-alt"></i></button>' +
                    '<button class="btn-danger btn-sm" onclick="deletePlayer(\'' + uid + '\', \'' + escName + '\')" title="Eliminar Jugador"><i class="fas fa-trash"></i></button>' +
                '</td>' +
                '</tr>';
        });

        tbody.innerHTML = rows;
        if (window.filterPlayersTable) window.filterPlayersTable();
    });
}

window.filterPlayersTable = function() {
    var input = document.getElementById('playerSearchInput');
    if (!input) return;
    var search = input.value.toLowerCase();
    
    var tbody = document.getElementById('playersTableBody');
    if (!tbody) return;
    
    var rows = tbody.getElementsByTagName('tr');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].cells.length < 5) continue;
        var textContent = rows[i].textContent.toLowerCase();
        rows[i].style.display = textContent.includes(search) ? '' : 'none';
    }
};

/* ─── CRUD Modals Logic ──────────────────────────────────── */

window.openEditPlayerModal = function(uid) {
    if (currentAdminRol !== 'superadmin' && currentAdminRol !== 'admin') {
        showToast('No tienes permisos suficientes.', 'error');
        return;
    }
    Database.ref('users/' + uid).get().then(snap => {
        if (!snap.exists()) return;
        var p = snap.val();
        document.getElementById('editPlayerUid').value = uid;
        document.getElementById('editPlayerForm').dataset.userid = uid;
        
        document.getElementById('editPlayerName').value = p.nombre || p.username || '';
        document.getElementById('editPlayerLevel').value = p.nivel || 1;
        document.getElementById('editPlayerXP').value = p.xp || 0;
        document.getElementById('editPlayerBits').value = p.bits || p.Bits || 0;
        document.getElementById('editPlayerGames').value = p.partidas || 0;
        document.getElementById('editPlayerErrorMsg').textContent = '';
        document.getElementById('editPlayerModal').classList.add('active');
    });
};

document.addEventListener('DOMContentLoaded', function() {
    var editForm = document.getElementById('editPlayerForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var uid = document.getElementById('editPlayerUid').value;
            var btn = document.getElementById('saveEditPlayerBtn');
            var err = document.getElementById('editPlayerErrorMsg');
            
            var updates = {
                nivel: parseInt(document.getElementById('editPlayerLevel').value) || 1,
                xp: parseInt(document.getElementById('editPlayerXP').value) || 0,
                partidas: parseInt(document.getElementById('editPlayerGames').value) || 0,
                nombre: document.getElementById('editPlayerName').value.trim(),
                bits: parseInt(document.getElementById('editPlayerBits').value) || 0
            };

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            err.textContent = '';

            try {
                await Database.ref('users/' + uid).update(updates);
                closeModal('editPlayerModal');
                showToast('Jugador actualizado correctamente', 'success');
            } catch (error) {
                err.textContent = 'Error: ' + error.message;
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            }
        });
    }

    var transferForm = document.getElementById('transferBitsForm');
    if (transferForm) {
        transferForm.addEventListener('submit', handleManageBits);
    }
});

/* ─── Atomic Update Function Mandated by Architecture ─── */
window.updateUserBits = async function(userId, amount) {
    const userRef = Database.ref('users/' + userId);
    const snapshot = await userRef.get();
    
    if (!snapshot.exists()) {
        throw new Error('Usuario no encontrado en la base central.');
    }
    
    const user = snapshot.val();
    const currentBits = parseInt(user.bits || user.Bits || 0, 10);
    const newBits = currentBits + amount;

    await userRef.update({
        bits: Math.max(0, newBits) // Evita saldos negativos brutos
    });

    console.log("Bits actualizados a:", newBits, "para", userId);
    return newBits;
};

window.openManageBitsModal = function(uid, name, bits) {
    if (currentAdminRol !== 'superadmin' && currentAdminRol !== 'admin') {
        showToast('No tienes permisos suficientes.', 'error');
        return;
    }
    
    document.getElementById('transferUserName').textContent = name;
    document.getElementById('transferUserBits').textContent = bits.toLocaleString('es-MX');
    
    var form = document.getElementById('transferBitsForm');
    form.dataset.userid = uid;
    form.reset();
    document.getElementById('transferErrorMsg').textContent = '';
    document.getElementById('transferBitsModal').classList.add('active');
};

async function handleManageBits(e) {
    e.preventDefault();
    var form = e.target;
    var uid = form.dataset.userid;
    var typeEl = form.querySelector('input[name="transferType"]:checked');
    var type = typeEl ? typeEl.value : 'add';
    var originalAmount = parseInt(document.getElementById('transferAmount').value, 10);
    var desc = document.getElementById('transferReason').value.trim() || (type === 'add' ? 'Bits otorgados por el administrador' : 'Bits removidos por el administrador');
    var btn = document.getElementById('confirmTransferBtn');
    var err = document.getElementById('transferErrorMsg');

    if (!uid || isNaN(originalAmount) || originalAmount <= 0) {
        err.textContent = 'Monto numérico inválido.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    err.textContent = '';

    try {
        var userName = document.getElementById('transferUserName').textContent;
        var amountToAdd = type === 'add' ? originalAmount : -originalAmount;
        
        // Apply the mandated single-source wrapper
        var newBalance = await updateUserBits(uid, amountToAdd);

        // Register in unified historial
        await Database.ref('historial').push({
            user_id: uid,
            user_name: userName,
            juego: 'Gestión Administrativa',
            tipo: 'admin_transfer',
            resultado: type === 'add' ? 'ganado' : 'perdido',
            bits: originalAmount,
            balance: newBalance,
            descripcion: desc,
            fecha: new Date().toISOString()
        });

        // Also add to actividad feed
        await Database.ref('actividad').push({
            tipo: type === 'add' ? 'Bits Ganados' : 'Bits Perdidos',
            desc: (type === 'add' ? '+' : '-') + originalAmount + ' bits a ' + userName,
            color: type === 'add' ? 'green' : 'red',
            timestamp: Date.now()
        });

        showToast('Balance actualizado a ' + newBalance.toLocaleString('es-MX') + ' Bits.', 'success');
        closeModal('transferBitsModal');
    } catch (error) {
        console.error("Error al transferir bits:", error);
        err.textContent = 'Error: ' + error.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Bits';
    }
}

window.deletePlayer = async function(uid, name) {
    if (currentAdminRol !== 'superadmin') {
        showToast('Solo un Admin Completo puede eliminar jugadores.', 'error');
        return;
    }
    if (!confirm('🛑 ATENCIÓN: ¿Deseas ELIMINAR al jugador ' + name + ' de todo el ecosistema? Esta acción NO se puede deshacer.')) return;

    try {
        showToast('Eliminando registros permanentemente...', 'warning');
        
        var updates = {};
        updates['users/' + uid] = null;
        
        // Remove history cleanly
        var histSnap = await Database.ref('historial').orderByChild('user_id').equalTo(uid).once('value');
        if (histSnap.exists()) {
            histSnap.forEach(function(child) {
                updates['historial/' + child.key] = null;
            });
        }
        
        // Remove missions cleanly
        updates['player_missions/' + uid] = null;
        updates['misiones_usuarios/' + uid] = null;

        await Database.ref().update(updates);

        showToast('Jugador ' + name + ' fue borrado del sistema central.', 'success');
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error crítico: ' + err.message, 'error');
    }
};

/* ──────────────────────────────────────────────────────────
   HISTORIAL ANALITICO MODULE
────────────────────────────────────────────────────────── */
var _globalGameHistory = [];

function loadHistorialTable() {
    var tbody = document.getElementById('historialTableBody');
    if (!tbody) return;

    // Listen to real-time events on Historial_Juegos
    Database.ref('Historial_Juegos').on('value', function(snap) {
        if (!snap.exists()) {
            _globalGameHistory = [];
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay historial de juegos registrado.</td></tr>';
            calculateHistoryStats(_globalGameHistory);
            return;
        }

        var data = snap.val();
        // Parse into array and sort by date descending
        _globalGameHistory = Object.keys(data).map(function(k) {
            return { id: k, ...data[k] };
        }).sort(function(a, b) {
            return new Date(b.fecha || 0) - new Date(a.fecha || 0);
        });

        // Add event listeners to filters if not added yet
        setupHistoryFilters();
        
        // Initial render
        filterHistory();
    });
}

function setupHistoryFilters() {
    var inputs = ['histSearchInput', 'histTypeFilter', 'histResultFilter', 'histDateFilter'];
    inputs.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && !el.hasAttribute('data-has-listener')) {
            el.addEventListener('input', filterHistory);
            el.setAttribute('data-has-listener', 'true');
        }
    });
}

function filterHistory() {
    var search = (document.getElementById('histSearchInput').value || '').toLowerCase();
    var tipo = document.getElementById('histTypeFilter').value;
    var result = document.getElementById('histResultFilter').value;
    var dateFilter = document.getElementById('histDateFilter').value; // YYYY-MM-DD format

    var filtered = _globalGameHistory.filter(function(item) {
        var matchSearch = true;
        if (search) {
            matchSearch = (item.user_name || '').toLowerCase().includes(search) || 
                          (item.user_email || '').toLowerCase().includes(search);
        }
        var matchType = tipo === 'all' ? true : (item.tipo || '') === tipo;
        var matchResult = result === 'all' ? true : (item.resultado || '') === result;
        var matchDate = true;
        if (dateFilter && item.fecha) {
            var itemDate = new Date(item.fecha).toISOString().split('T')[0];
            matchDate = itemDate === dateFilter;
        }

        return matchSearch && matchType && matchResult && matchDate;
    });

    calculateHistoryStats(filtered);
    renderHistory(filtered);
}

function calculateHistoryStats(dataArray) {
    var played = dataArray.length;
    var won = 0;
    var lost = 0;
    var bitsGanados = 0;
    var bitsPerdidos = 0;

    dataArray.forEach(function(item) {
        var res = (item.resultado || '').toLowerCase();
        var val = parseInt(item.bits || 0);
        if (res === 'ganado') {
            won++;
            bitsGanados += val;
        } else if (res === 'perdido') {
            lost++;
            bitsPerdidos += val;
        }
    });

    function setTextSafe(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    setTextSafe('histTotalPartidas', played.toLocaleString('es-MX'));
    setTextSafe('histTotalGanadas', won.toLocaleString('es-MX'));
    setTextSafe('histTotalPerdidas', lost.toLocaleString('es-MX'));
    setTextSafe('histBitsGanados', '+' + bitsGanados.toLocaleString('es-MX'));
    setTextSafe('histBitsPerdidos', '-' + bitsPerdidos.toLocaleString('es-MX'));
}

function renderHistory(dataArray) {
    var tbody = document.getElementById('historialTableBody');
    if (!tbody) return;

    if (dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No match con los filtros seleccionados.</td></tr>';
        return;
    }

    // Limit to recent 100 for render perf if needed, but let's render up to 200
    var displayData = dataArray.slice(0, 200);
    var html = '';

    displayData.forEach(function(ev) {
        var isWin = (ev.resultado || '').toLowerCase() === 'ganado';
        var statusBadge = isWin ? 
            '<span class="status-won"><i class="fas fa-arrow-up"></i> Ganado</span>' : 
            '<span class="status-lost"><i class="fas fa-arrow-down"></i> Perdido</span>';
        
        var bitsStr = (isWin ? '+' : '-') + parseInt(ev.bits || 0).toLocaleString('es-MX');
        var colorBits = isWin ? 'color: var(--success);' : 'color: var(--danger);';
        
        var dateStr = ev.fecha ? new Date(ev.fecha).toLocaleString('es-MX') : '—';
        var userName = ev.user_name || 'Desconocido';
        var tId = ev.user_id || '';

        html += '<tr>' +
            '<td data-label="Usuario">' +
               '<a href="#" onclick="openUserHistoryModal(\'' + tId + '\'); return false;" style="color:var(--primary);font-weight:700;text-decoration:none;"><i class="fas fa-search"></i> ' + userName + '</a>' +
               '<br><span style="font-size:0.75rem;color:var(--text-muted);">' + (ev.user_email || 'Sin Email') + '</span>' +
            '</td>' +
            '<td data-label="Juego">' + (ev.juego || '—') + '</td>' +
            '<td data-label="Tipo" style="text-transform:uppercase;font-size:0.75rem;font-weight:700;">' + (ev.tipo || '—') + '</td>' +
            '<td data-label="Resultado">' + statusBadge + '</td>' +
            '<td data-label="Bits (+/-)" style="font-weight:800; ' + colorBits + '">' + bitsStr + '</td>' +
            '<td data-label="Balance">💎 ' + parseInt(ev.balance || 0).toLocaleString('es-MX') + '</td>' +
            '<td data-label="Fecha" style="color:var(--text-muted);font-size:0.8rem;">' + dateStr + '</td>' +
            '</tr>';
    });

    tbody.innerHTML = html;
}

// Global modal function
window.openUserHistoryModal = function(userId) {
    if (!userId) return;

    var elModal = document.getElementById('userHistoryModal');
    var elTbody = document.getElementById('userIndividualTableBody');

    // Filter master list
    var personalHistory = _globalGameHistory.filter(function(item) {
        return item.user_id === userId;
    });

    if (personalHistory.length === 0) {
        showToast('El usuario no tiene historial reciente.', 'error');
        return;
    }

    var userData = personalHistory[0];
    document.getElementById('userHistoryName').textContent = userData.user_name || 'Usuario';
    document.getElementById('userHistoryEmail').textContent = userData.user_email || 'ID: ' + userId;

    // Calc personal stats
    var played = personalHistory.length;
    var won = 0;
    var lost = 0;
    var bitsGanados = 0;
    var bitsPerdidos = 0;

    var html = '';
    personalHistory.forEach(function(ev) {
        var isWin = (ev.resultado || '').toLowerCase() === 'ganado';
        var val = parseInt(ev.bits || 0);

        if (isWin) { won++; bitsGanados += val; }
        else { lost++; bitsPerdidos += val; }

        var statusBadge = isWin ? 
            '<span class="status-won">Ganado</span>' : 
            '<span class="status-lost">Perdido</span>';
        var bitsStr = (isWin ? '+' : '-') + val.toLocaleString('es-MX');
        var colorBits = isWin ? 'color: var(--success);' : 'color: var(--danger);';
        var dateStr = ev.fecha ? new Date(ev.fecha).toLocaleString('es-MX') : '—';

        html += '<tr>' +
            '<td data-label="Juego"><strong>' + (ev.juego || '—') + '</strong></td>' +
            '<td data-label="Tipo" style="text-transform:uppercase;font-size:0.75rem;">' + (ev.tipo || '—') + '</td>' +
            '<td data-label="Resultado">' + statusBadge + '</td>' +
            '<td data-label="Bits" style="font-weight:800; ' + colorBits + '">' + bitsStr + '</td>' +
            '<td data-label="Fecha" style="color:var(--text-muted);font-size:0.8rem;">' + dateStr + '</td>' +
            '</tr>';
    });

    document.getElementById('uhTotalPartidas').textContent = played.toLocaleString('es-MX');
    document.getElementById('uhTotalGanadas').textContent = won.toLocaleString('es-MX');
    document.getElementById('uhTotalPerdidas').textContent = lost.toLocaleString('es-MX');
    document.getElementById('uhBitsGanados').textContent = '+' + bitsGanados.toLocaleString('es-MX');
    document.getElementById('uhBitsPerdidos').textContent = '-' + bitsPerdidos.toLocaleString('es-MX');

    elTbody.innerHTML = html;
    elModal.classList.add('active');
};

/* ──────────────────────────────────────────────────────────
   MISSIONS MODULE
────────────────────────────────────────────────────────── */
var _globalMissions = {};

function loadMissions() {
    var container = document.getElementById('missionsList');
    if (!container) return;

    Database.ref('Misiones').on('value', function(snap) {
        if (!snap.exists()) {
            _globalMissions = {};
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted); width: 100%;"><p>No hay misiones configuradas.</p></div>';
            return;
        }

        _globalMissions = snap.val();
        var mList = Object.keys(_globalMissions).map(function(key) {
            return { id: key, data: _globalMissions[key] };
        });

        // Optionally sort by creation date descending
        mList.sort(function(a, b) {
            var dateA = new Date(a.data.fecha_creacion || 0).getTime();
            var dateB = new Date(b.data.fecha_creacion || 0).getTime();
            return dateB - dateA;
        });

        var html = '';
        mList.forEach(function(item) {
            var m = item.data;
            var isInactive = m.estado === false;
            var cardClass = isInactive ? 'mission-card inactive' : 'mission-card';
            var checkedAttr = !isInactive ? 'checked' : '';
            var typeLabel = (m.tipo || '').toUpperCase();
            var rewardLabel = (m.recompensa && m.recompensa.tipo ? m.recompensa.tipo : '').toUpperCase();
            var rewardVal = m.recompensa && m.recompensa.valor ? parseInt(m.recompensa.valor).toLocaleString('es-MX') : 0;
            
            html += '<div class="' + cardClass + '">';
            html += '<div class="mission-card-header">';
            html += '<div>';
            html += '<h3 class="mission-title">' + (m.titulo || 'Sin Título') + '</h3>';
            html += '</div>';
            html += '<div class="toggle-switch-wrapper">';
            html += '<input type="checkbox" class="toggle-checkbox" ' + checkedAttr + ' onchange="toggleMissionStatus(\'' + item.id + '\', this.checked)">';
            html += '<div class="toggle-slider"></div>';
            html += '</div>';
            html += '</div>';
            
            html += '<p class="mission-desc">' + (m.descripcion || '') + '<br><br>';
            html += '<strong style="color:var(--text-main);font-size:0.8rem;">Condición:</strong> ' + (m.condicion || '') + '</p>';
            
            html += '<div class="mission-badges">';
            html += '<div class="m-badge type"><i class="fas fa-tag"></i> ' + typeLabel + '</div>';
            html += '<div class="m-badge reward"><i class="fas fa-gift"></i> ' + rewardVal + ' ' + rewardLabel + '</div>';
            html += '</div>';
            
            html += '<div class="mission-actions">';
            html += '<button class="btn-secondary" onclick="editMission(\'' + item.id + '\')"><i class="fas fa-edit"></i> Editar</button>';
            html += '<button class="btn-secondary" style="color:var(--danger);border-color:rgba(239,68,68,0.3);" onclick="deleteMission(\'' + item.id + '\')"><i class="fas fa-trash"></i> Eliminar</button>';
            html += '</div>';
            html += '</div>';
        });

        container.innerHTML = html;
    });
}

window.openCreateMissionModal = function() {
    document.getElementById('missionForm').reset();
    document.getElementById('missionId').value = '';
    document.getElementById('missionModalTitle').textContent = 'Nueva Misión';
    document.getElementById('missionErrorMsg').textContent = '';
    document.getElementById('missionModal').classList.add('active');
};

window.editMission = function(id) {
    if (!_globalMissions[id]) return;
    var m = _globalMissions[id];
    
    document.getElementById('missionId').value = id;
    document.getElementById('missionTitle').value = m.titulo || '';
    document.getElementById('missionDescription').value = m.descripcion || '';
    document.getElementById('missionType').value = m.tipo || 'apuestas';
    document.getElementById('missionCondition').value = m.condicion || '';
    if (m.recompensa) {
        document.getElementById('missionRewardType').value = m.recompensa.tipo || 'dinero';
        document.getElementById('missionRewardValue').value = m.recompensa.valor || 0;
    }
    document.getElementById('missionEstado').checked = m.estado !== false;
    
    document.getElementById('missionModalTitle').textContent = 'Editar Misión';
    document.getElementById('missionErrorMsg').textContent = '';
    document.getElementById('missionModal').classList.add('active');
};

window.handleSaveMission = async function(e) {
    e.preventDefault();
    var btn = document.getElementById('saveMissionBtn');
    var errorMsg = document.getElementById('missionErrorMsg');
    
    var id     = document.getElementById('missionId').value;
    var titulo = document.getElementById('missionTitle').value.trim();
    var desc   = document.getElementById('missionDescription').value.trim();
    var tipo   = document.getElementById('missionType').value;
    var cond   = document.getElementById('missionCondition').value.trim();
    var rType  = document.getElementById('missionRewardType').value;
    var rVal   = parseInt(document.getElementById('missionRewardValue').value) || 0;
    var estado = document.getElementById('missionEstado').checked;
    
    if (!titulo || !desc || !cond) {
        errorMsg.textContent = 'Por favor completa todos los campos obligatorios.';
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        
        var missionData = {
            titulo: titulo,
            descripcion: desc,
            tipo: tipo,
            condicion: cond,
            recompensa: {
                tipo: rType,
                valor: rVal
            },
            estado: estado,
            auto_generada: false
        };

        if (id) {
            // Update
            await Database.ref('Misiones/' + id).update(missionData);
            showToast('Misión actualizada correctamente', 'success');
        } else {
            // Create
            missionData.fecha_creacion = new Date().toISOString();
            missionData.id = "auto"; // placeholder as per req, though Firebase key is primary
            var newRef = Database.ref('Misiones').push();
            missionData.id = newRef.key; // Store actual key inside just in case
            await newRef.set(missionData);
            showToast('Misión creada correctamente', 'success');
        }
        
        document.getElementById('missionModal').classList.remove('active');
        
    } catch(err) {
        errorMsg.textContent = 'Error al guardar: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Misión';
    }
};

window.deleteMission = async function(id) {
    if (confirm('¿Estás seguro de que deseas eliminar esta misión de forma permanente?')) {
        try {
            await Database.ref('Misiones/' + id).remove();
            showToast('Misión eliminada', 'success');
        } catch(e) {
            showToast('Error al eliminar: ' + e.message, 'error');
        }
    }
};

window.toggleMissionStatus = async function(id, newState) {
    try {
        await Database.ref('Misiones/' + id + '/estado').set(newState);
        showToast(newState ? 'Misión Activada' : 'Misión Desactivada', 'success');
    } catch(e) {
        showToast('Error al cambiar estado', 'error');
    }
};

/* ──────────────────────────────────────────────────────────
   THEME SWITCHER
────────────────────────────────────────────────────────── */
window.setTheme = function(theme) {
    var body = document.body;
    body.className = 'theme-' + theme;
    document.querySelectorAll('.theme-option').forEach(function(btn) { btn.classList.remove('active'); });
    var activeBtn = document.getElementById('btnTheme' + theme.charAt(0).toUpperCase() + theme.slice(1));
    if (activeBtn) activeBtn.classList.add('active');
    localStorage.setItem('ghost_theme', theme);
};

// Restore theme on load
(function() {
    var saved = localStorage.getItem('ghost_theme');
    if (saved) {
        document.body.className = 'theme-' + saved;
        var btn = document.getElementById('btnTheme' + saved.charAt(0).toUpperCase() + saved.slice(1));
        if (btn) { document.querySelectorAll('.theme-option').forEach(function(b) { b.classList.remove('active'); }); btn.classList.add('active'); }
    }
})();

/* ──────────────────────────────────────────────────────────
   UTILITIES
────────────────────────────────────────────────────────── */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
/* ──────────────────────────────────────────────────────────
   TELEGRAM BOT MODULE
────────────────────────────────────────────────────────── */

var _tgToken = '';

// ── Load saved token on panel boot ──────────────────────
function tgLoadSavedToken() {
    Database.ref('Configuracion/telegram_token').get().then(function(snap) {
        if (snap.exists()) {
            _tgToken = snap.val();
            var input = document.getElementById('tgTokenInput');
            if (input) input.value = _tgToken;
            tgSetStatus(true);
            tgShowBotInfo();
            tgLoadClientsTable();
        }
    });
}

// ── Save token to Firebase ───────────────────────────────
window.tgSaveToken = async function() {
    var input = document.getElementById('tgTokenInput');
    var token = input ? input.value.trim() : '';
    if (!token) { showToast('Ingresa un token válido', 'error'); return; }

    await Database.ref('Configuracion/telegram_token').set(token);
    _tgToken = token;
    showToast('Token guardado correctamente ✅', 'success');
    tgShowBotInfo();
    tgLoadClientsTable();
};

// ── Test bot / show info ─────────────────────────────────
window.tgTestBot = function() { tgShowBotInfo(); };

async function tgShowBotInfo() {
    if (!_tgToken) return;
    try {
        var cleanToken = _tgToken.replace(/^bot/i, '');
        var res = await fetch('https://api.telegram.org/bot' + cleanToken + '/getMe');
        var data = await res.json();
        if (!data.ok) { tgSetStatus(false); showToast('Token inválido: ' + (data.description || ''), 'error'); return; }

        var bot = data.result;
        tgSetStatus(true);
        document.getElementById('tgBotName').textContent    = bot.first_name || 'Bot';
        document.getElementById('tgBotUsername').textContent = '@' + (bot.username || '');

        // Try to load bot photo
        tgGetUserPhoto(bot.id, function(photoUrl) {
            var avatarEl = document.getElementById('tgBotAvatar');
            if (avatarEl) {
                if (photoUrl) {
                    avatarEl.innerHTML = '<img src="' + photoUrl + '" alt="Bot">';
                } else {
                    avatarEl.textContent = '🤖';
                }
            }
        });

        document.getElementById('tgBotInfo').style.display = 'flex';
        showToast('Bot conectado: @' + bot.username, 'success');
    } catch(e) {
        tgSetStatus(false);
        showToast('Error al conectar con la API de Telegram', 'error');
    }
}

function tgSetStatus(ok) {
    var badge = document.getElementById('tgBotStatus');
    if (!badge) return;
    badge.className = 'tg-status-badge ' + (ok ? 'tg-status-on' : 'tg-status-off');
    badge.textContent = ok ? '✔ Conectado' : 'Sin conectar';
}

// ── Get profile photo URL via proxy ──────────────────────
async function tgGetUserPhoto(userId, callback) {
    if (!_tgToken) { callback(null); return; }
    try {
        var cleanToken = _tgToken.replace(/^bot/i, '');
        var res  = await fetch('https://api.telegram.org/bot' + cleanToken + '/getUserProfilePhotos?user_id=' + userId + '&limit=1');
        var data = await res.json();
        if (!data.ok || !data.result || data.result.total_count === 0) { callback(null); return; }

        var fileId = data.result.photos[0][0].file_id;
        var fRes   = await fetch('https://api.telegram.org/bot' + cleanToken + '/getFile?file_id=' + fileId);
        var fData  = await fRes.json();
        if (!fData.ok) { callback(null); return; }

        var url = 'https://api.telegram.org/file/bot' + cleanToken + '/' + fData.result.file_path;
        callback(url);
    } catch(e) {
        callback(null);
    }
}

// ── Scan updates to auto-register users ───────────────────
window.tgScanUpdates = async function(isSilent = false) {
    if (!_tgToken) return;

    try {
        var cleanToken = _tgToken.replace(/^bot/i, '');
        
        // Form Data object to bypass application/json CORS constraint
        var form1 = new FormData();
        form1.append('drop_pending_updates', 'false');

        // Step 1: Remove webhook via POST so getUpdates works
        await fetch('https://api.telegram.org/bot' + cleanToken + '/deleteWebhook', {
            method: 'POST',
            body: form1
        });

        var form2 = new FormData();
        form2.append('limit', '100');
        form2.append('timeout', '0');

        // Step 2: getUpdates via POST
        var res = await fetch('https://api.telegram.org/bot' + cleanToken + '/getUpdates', {
            method:  'POST',
            body: form2
        });
        var data = await res.json();

        if (!data.ok) {
            tgSetStatus(false);
            return;
        }

        // Step 3: Collect unique non-bot users from all update types
        var usersMap = {};
        (data.result || []).forEach(function(update) {
            var froms = [
                update.message         && update.message.from,
                update.edited_message  && update.edited_message.from,
                update.callback_query  && update.callback_query.from,
                update.my_chat_member  && update.my_chat_member.from,
                update.chat_member     && update.chat_member.from,
            ].filter(Boolean);
            froms.forEach(function(from) {
                if (from && !from.is_bot && from.id) usersMap[from.id] = from;
            });
        });

        var users = Object.values(usersMap);
        if (users.length === 0) return;

        // Step 4: Auto-register unregistered users
        // Step 4: Auto-register unregistered users
        var hasNewUsers = false;
        await Promise.all(users.map(async function(u) {
            var key = 'tg_' + u.id;
            var snap = await Database.ref('users/' + key).get();

            // Skip if already in blacklist (admin explicitly deleted this user)
            var blackSnap = await Database.ref('TelegramBlacklist/' + u.id).get();
            if (blackSnap.exists()) {
                console.log('[tgScan] Skipping blacklisted user:', u.id);
                return;
            }

            // Also skip if record exists but is soft-deleted
            if (snap.exists() && snap.val().eliminado) {
                // Migrate to hard blacklist for future resilience
                await Database.ref('TelegramBlacklist/' + u.id).set({ blocked_at: new Date().toISOString(), nombre: (u.first_name || '') });
                await Database.ref('users/' + key).remove();
                return;
            }
            
            if (!snap.exists()) {
                hasNewUsers = true;
                var fullName = (u.first_name || '') + (u.last_name ? ' ' + u.last_name : '');
                
                await Database.ref('users/' + key).set({
                    telegram_id:    u.id,
                    nombre:         fullName,
                    nivel:          1,
                    xp:             0,
                    bits:           0,
                    partidas:       0,
                    estado:         true,
                    fecha_registro: new Date().toISOString()
                });
            } else {
                // Si el usuario existe pero no tiene el telegram_id enlazado
                if (!snap.val().telegram_id) {
                    await Database.ref('users/' + key).update({ telegram_id: u.id });
                }
            }
        }));

        if (hasNewUsers) {
            if (typeof tgLoadClientsTable === 'function') tgLoadClientsTable();
            if (typeof tgUpdateMsgTargetSelect === 'function') tgUpdateMsgTargetSelect();
            if (!isSilent) showToast('Nuevos usuarios detectados y sincronizados', 'success');
        }

    } catch(e) {
        console.error("Auto-scan Telegram error:", e);
    }
};

// ── Register user manually by Chat ID ───────────────────
window.tgRegisterManual = async function() {
    var id       = (document.getElementById('tgManualId')       || {}).value  || '';
    var nombre   = (document.getElementById('tgManualName')     || {}).value  || '';
    var username = (document.getElementById('tgManualUsername') || {}).value  || '';

    id = id.trim(); nombre = nombre.trim(); username = username.replace('@','').trim();

    if (!id || !nombre) { showToast('El Chat ID y nombre son obligatorios', 'error'); return; }
    if (isNaN(parseInt(id))) { showToast('El Chat ID debe ser un número', 'error'); return; }

    var key = 'tg_' + id;
    var existing = await Database.ref('users/' + key).get();
    
    if (existing.exists() && existing.val().telegram_id) { 
        showToast('Este usuario de telegram ya está registrado', 'error'); 
        return; 
    }

    // Merge or Create
    if (existing.exists()) {
        await Database.ref('users/' + key).update({ telegram_id: parseInt(id) });
    } else {
        await Database.ref('users/' + key).set({
            telegram_id:    parseInt(id),
            nombre:         nombre,
            nivel:          1,
            xp:             0,
            bits:           0,
            partidas:       0,
            estado:         true,
            fecha_registro: new Date().toISOString()
        });
    }

    showToast('✅ ' + nombre + ' registrado correctamente en la central', 'success');
    if (typeof tgLoadClientsTable === 'function') tgLoadClientsTable();    tgUpdateMsgTargetSelect();
    // Re-scan to update state
    window.tgScanUpdates();
};


function tgLoadClientsTable() {
    // Deprecated. Handled by telegram.js
}

function tgUpdateMsgTargetSelect(clients) {
    // Deprecated. Handled by telegram.js
}

// ── Delete client ────────────────────────────────────────
window.tgDeleteClient = async function(tgId) {
    if (!confirm('¿Eliminar este cliente de Telegram?')) return;
    await Database.ref('users/tg_' + tgId).remove();
    showToast('Cliente eliminado', 'success');
};

// ── Send message ─────────────────────────────────────────
window.tgSendMessage = async function() {
    var target  = document.getElementById('tgMsgTarget').value;
    var text    = document.getElementById('tgMsgText').value.trim();
    var resultEl = document.getElementById('tgSendResult');

    if (!_tgToken) { showToast('Configura y guarda el token primero', 'error'); return; }
    if (!text)     { showToast('Escribe un mensaje', 'error'); return; }

    resultEl.className = 'tg-send-result';
    resultEl.textContent = '';

    var btn = document.getElementById('tgSendBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        var chatIds = [];

        if (target === 'all') {
            var snap = await Database.ref('users').get();
            if (snap.exists()) {
                var usersObj = snap.val();
                chatIds = Object.values(usersObj)
                            .filter(function(c) { return c.telegram_id; })
                            .map(function(c) { return c.telegram_id; });
            }
        } else {
            chatIds = [target];
        }

        if (chatIds.length === 0) {
            resultEl.className = 'tg-send-result error';
            resultEl.textContent = 'No hay destinatarios registrados.';
            return;
        }

        var ok = 0; var fail = 0;
        await Promise.all(chatIds.map(async function(chatId) {
            try {
                var r = await fetch('https://api.telegram.org/bot' + _tgToken + '/sendMessage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
                });
                var d = await r.json();
                if (d.ok) ok++; else fail++;
            } catch(e) { fail++; }
        }));

        resultEl.className = 'tg-send-result ' + (fail === 0 ? 'ok' : 'error');
        resultEl.textContent = '✅ ' + ok + ' enviado(s)' + (fail > 0 ? ' · ❌ ' + fail + ' fallido(s)' : '');
        if (ok > 0) document.getElementById('tgMsgText').value = '';
    } catch(e) {
        resultEl.className = 'tg-send-result error';
        resultEl.textContent = 'Error al enviar: ' + e.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Mensaje';
    }
};


// End of admin.js

/* ═══════════════════════════════════════════════════
   GAME STATISTICS MODULE  — Dashboard analítico
   Reads Firebase historial, groups by .juego field
════════════════════════════════════════════════════ */

function processGameStats(data) {
    var stats = {};
    Object.values(data).forEach(function(item) {
        if (!item) return;
        var game = item.juego || item.game || item.tipo_juego || 'Desconocido';
        if (!game) return;
        stats[game] = (stats[game] || 0) + 1;
    });
    return stats;
}

function renderGameStats(stats) {
    var container = document.getElementById('gameStatsContainer');
    var loader    = document.getElementById('gameStatsLoader');
    if (!container) return;
    if (loader) loader.style.display = 'none';

    var entries = Object.entries(stats).sort(function(a, b) { return b[1] - a[1]; });

    if (entries.length === 0) {
        container.innerHTML = '<div class="game-stats-empty"><i class="fas fa-dice-d20"></i><p>No hay historial de juegos aún</p></div>';
        var pillGames = document.getElementById('gstkTotalGames');
        var pillPlays = document.getElementById('gstkTotalPlays');
        var pillTop   = document.getElementById('gstkTopGame');
        if (pillGames) pillGames.textContent = '0';
        if (pillPlays) pillPlays.textContent = '0';
        if (pillTop)   pillTop.textContent   = '—';
        return;
    }

    var total    = entries.reduce(function(sum, e) { return sum + e[1]; }, 0);
    var maxPlays = entries[0][1];

    var pillGames = document.getElementById('gstkTotalGames');
    var pillPlays = document.getElementById('gstkTotalPlays');
    var pillTop   = document.getElementById('gstkTopGame');
    if (pillGames) pillGames.textContent = entries.length;
    if (pillPlays) pillPlays.textContent = total.toLocaleString('es-MX');
    if (pillTop)   pillTop.textContent   = entries[0][0];

    var colors  = ['var(--primary)','var(--secondary)','var(--success)','var(--warning)','var(--danger)','#2CA5E0','#f472b6','#a78bfa'];
    var medals  = ['🥇','🥈','🥉'];

    container.innerHTML = '';
    entries.forEach(function(entry, i) {
        var name   = entry[0];
        var count  = entry[1];
        var pct    = Math.round((count / total) * 100);
        var barPct = Math.round((count / maxPlays) * 100);
        var color  = colors[i % colors.length];
        var medal  = medals[i] || ('#' + (i + 1));

        var row = document.createElement('div');
        row.className = 'game-stat-row';
        row.innerHTML =
            '<div class="gsr-left">' +
                '<span class="gsr-rank">' + medal + '</span>' +
                '<span class="gsr-name">' + _gscEsc(name) + '</span>' +
            '</div>' +
            '<div class="gsr-bar-wrap">' +
                '<div class="gsr-bar" style="width:0%;background:' + color + ';transition:width 0.6s ease ' + (i * 0.07) + 's;"></div>' +
            '</div>' +
            '<div class="gsr-right">' +
                '<span class="gsr-count">' + count.toLocaleString('es-MX') + '</span>' +
                '<span class="gsr-pct">' + pct + '%</span>' +
            '</div>';
        container.appendChild(row);

        // Trigger animation after paint
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                var bar = row.querySelector('.gsr-bar');
                if (bar) bar.style.width = barPct + '%';
            });
        });
    });
}

var _gameStatsListener = null;
function subscribeGameStats() {
    if (typeof Database === 'undefined') return;
    if (_gameStatsListener) Database.ref('historial').off('value', _gameStatsListener);

    var loader = document.getElementById('gameStatsLoader');
    if (loader) loader.style.display = 'inline-flex';

    _gameStatsListener = Database.ref('historial').on('value', function(snap) {
        if (!snap.exists()) { renderGameStats({}); return; }
        renderGameStats(processGameStats(snap.val()));
    }, function(err) {
        console.warn('[GameStats]', err);
        renderGameStats({});
    });
}

var _activityListener = null;
function subscribeActivityFeed() {
    if (typeof Database === 'undefined') return;
    if (_activityListener) Database.ref('actividad').off('value', _activityListener);

    _activityListener = Database.ref('actividad').orderByChild('timestamp').limitToLast(8).on('value', function(snap) {
        var feed = document.getElementById('activityFeed');
        if (!feed) return;
        if (!snap.exists()) {
            feed.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">Sin actividad registrada</div>';
            return;
        }
        var items = [];
        snap.forEach(function(child) { items.push(child.val()); });
        items.reverse();

        var colorMap = { green:'var(--success)',red:'var(--danger)',blue:'var(--secondary)',purple:'var(--primary)',yellow:'var(--warning)' };
        feed.innerHTML = items.map(function(act) {
            var color = colorMap[act.color] || 'var(--text-muted)';
            var ts = act.timestamp ? new Date(act.timestamp).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : '';
            return '<div class="activity-item">' +
                '<div class="activity-dot" style="background:' + color + ';box-shadow:0 0 6px ' + color + ';"></div>' +
                '<div class="activity-text"><span>' + _gscEsc(act.desc || act.tipo || '—') + '</span><small>' + ts + '</small></div>' +
                '</div>';
        }).join('');
    });
}

function _gscEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
