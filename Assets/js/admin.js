// Eliminados los import {...} because we use Firebase via CDN (Compat Mode)

const auth = firebase.auth();
const Database = firebase.database();

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
    
    // Auto-load data for initial view
    loadAdminsTable();
    updateKPIs();
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
        });
    });

    // Form Submissions
    document.getElementById('adminLoginForm').addEventListener('submit', handleLogin);
    document.getElementById('addAdminForm').addEventListener('submit', handleCreateAdmin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
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

        document.getElementById('navAdminName').textContent = adminData.nombre;
        document.getElementById('navAdminRole').textContent = currentAdminRol.toUpperCase();
        document.getElementById('navAvatarInitials').textContent = adminData.nombre.charAt(0).toUpperCase();

        // UI Adjustments based on role
        if (currentAdminRol !== 'superadmin') {
            document.getElementById('openAddAdminModalBtn').style.display = 'none';
        } else {
            document.getElementById('openAddAdminModalBtn').style.display = 'inline-flex';
        }

    } catch (err) {
        console.error('Error fetching admin data:', err);
    }
}

function loadAdminsTable() {
    const tbody = document.querySelector('#adminsTable tbody');
    if (!tbody) return;

    Database.ref('Administradores_Panel').on('value', (snap) => {
        if (!snap.exists()) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay administradores registrados</td></tr>';
            return;
        }

        const admins = snap.val();
        let html = '';
        let total = 0;
        let activos = 0;

        for (const [uid, data] of Object.entries(admins)) {
            total++;
            if (data.estado === 'activo') activos++;

            const roleBadgeColor = data.rol === 'superadmin' ? 'var(--primary)' : 'var(--text-muted)';
            const stateBadgeClass = data.estado === 'activo' ? 'background: rgba(16, 185, 129, 0.1); color: var(--success);' : 'background: rgba(239, 68, 68, 0.1); color: var(--danger);';
            const disableDelete = (currentAdminRol !== 'superadmin' || uid === auth.currentUser.uid);

            html += `
                <tr>
                    <td><strong>${data.email}</strong></td>
                    <td>${data.nombre}</td>
                    <td><span style="color: ${roleBadgeColor}; text-transform: uppercase; font-size: 0.8rem; font-weight: bold;">${data.rol}</span></td>
                    <td><span class="badge-status" style="${stateBadgeClass}">${data.estado}</span></td>
                    <td>
                        <button class="btn-danger" onclick="deleteAdmin('${uid}', '${data.email}')" ${disableDelete ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </td>
                </tr>
            `;
        }

        tbody.innerHTML = html;
        document.getElementById('kpiTotalAdmins').textContent = total;
        document.getElementById('kpiActiveAdmins').textContent = activos;
    });
}

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
