/**
 * FluxoPro — Main Entry Point
 * SPA Router + Layout
 */
import { getToken, getUser, clearAuth } from './services/api.js';
import { getInitials } from './services/utils.js';
import { renderLogin, renderRegister } from './pages/auth.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderContasPagar } from './pages/contasPagar.js';
import { renderContasReceber } from './pages/contasReceber.js';
import { renderCartoes } from './pages/cartoes.js';

const app = document.getElementById('app');

function isAuthenticated() {
  return !!getToken();
}

function renderLayout(activePage) {
  const user = getUser();
  const initials = getInitials(user?.nome);

  app.innerHTML = `
    <!-- Mobile Header -->
    <div class="mobile-header">
      <button class="menu-btn" id="menuToggle">☰</button>
      <h2 style="font-size:1.1rem;font-weight:800;background:var(--accent-gradient-2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">FluxoPro</h2>
      <div style="width:40px"></div>
    </div>

    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <h2>💰 FluxoPro</h2>
          <small>Gestão Financeira v0.1</small>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Principal</div>
          <a class="nav-item ${activePage === 'dashboard' ? 'active' : ''}" href="#/dashboard">
            <span class="nav-icon">📊</span> Dashboard
          </a>

          <div class="nav-section-title">Financeiro</div>
          <a class="nav-item ${activePage === 'pagar' ? 'active' : ''}" href="#/contas-pagar">
            <span class="nav-icon">📤</span> Contas a Pagar
          </a>
          <a class="nav-item ${activePage === 'receber' ? 'active' : ''}" href="#/contas-receber">
            <span class="nav-icon">📥</span> Contas a Receber
          </a>

          <div class="nav-section-title">Em breve</div>
          <a class="nav-item ${activePage === 'cartoes' ? 'active' : ''}" href="#/cartoes">
            <span class="nav-icon">💳</span> Cartões
          </a>
          <span class="nav-item" style="opacity:0.4;cursor:default">
            <span class="nav-icon">🔁</span> Recorrências
          </span>
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${initials}</div>
            <div>
              <div class="user-name">${user?.nome || 'Usuário'}</div>
              <div class="user-email">${user?.email || ''}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-secondary btn-block" id="btnLogout" style="margin-top:0.5rem">Sair</button>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content" id="pageContent">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </main>
    </div>
  `;

  // Mobile menu
  const sidebar = document.getElementById('sidebar');
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.id = 'sidebarOverlay';
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.remove();
      });
      app.appendChild(overlay);
    } else {
      document.getElementById('sidebarOverlay')?.remove();
    }
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    clearAuth();
    window.location.hash = '#/login';
  });

  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-item[href]').forEach(item => {
    item.addEventListener('click', () => {
      sidebar.classList.remove('open');
      document.getElementById('sidebarOverlay')?.remove();
    });
  });

  return document.getElementById('pageContent');
}

async function router() {
  const hash = window.location.hash || '#/';
  const path = hash.replace('#', '');

  // Public routes
  if (path === '/login' || path === '/') {
    if (isAuthenticated()) {
      window.location.hash = '#/dashboard';
      return;
    }
    renderLogin(app);
    return;
  }

  if (path === '/register') {
    renderRegister(app);
    return;
  }

  // Protected routes
  if (!isAuthenticated()) {
    window.location.hash = '#/login';
    return;
  }

  let activePage = 'dashboard';
  if (path === '/contas-pagar') activePage = 'pagar';
  if (path === '/contas-receber') activePage = 'receber';
  if (path === '/cartoes') activePage = 'cartoes';

  const content = renderLayout(activePage);

  switch (path) {
    case '/dashboard':
      await renderDashboard(content);
      break;
    case '/contas-pagar':
      await renderContasPagar(content);
      break;
    case '/contas-receber':
      await renderContasReceber(content);
      break;
    case '/cartoes':
      await renderCartoes(content);
      break;
    default:
      window.location.hash = '#/dashboard';
  }
}

// Listen for hash changes
window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// Initialize
router();
