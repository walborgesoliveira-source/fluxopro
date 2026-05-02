import { api, setToken, setUser } from '../services/api.js';
import { toast } from '../components/toast.js';

export function renderLogin(app) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>💰 FluxoPro</h1>
          <p>Gestão financeira inteligente</p>
        </div>
        <form id="loginForm">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" class="form-input" placeholder="seu@email.com" required />
          </div>
          <div class="form-group">
            <label for="senha">Senha</label>
            <input type="password" id="senha" class="form-input" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btnLogin">Entrar</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;color:var(--text-muted);font-size:0.85rem">
          Não tem conta? <a href="#/register" style="color:var(--accent-primary);font-weight:600">Criar conta</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    btn.textContent = 'Entrando...';
    btn.disabled = true;
    try {
      const data = await api.login(
        document.getElementById('email').value,
        document.getElementById('senha').value
      );
      setToken(data.token);
      setUser(data.usuario);
      toast('Login realizado com sucesso!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message, 'error');
      btn.textContent = 'Entrar';
      btn.disabled = false;
    }
  });
}

export function renderRegister(app) {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <h1>💰 FluxoPro</h1>
          <p>Crie sua conta gratuita</p>
        </div>
        <form id="registerForm">
          <div class="form-group">
            <label for="nome">Nome completo</label>
            <input type="text" id="nome" class="form-input" placeholder="Seu nome" required />
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" class="form-input" placeholder="seu@email.com" required />
          </div>
          <div class="form-group">
            <label for="senha">Senha</label>
            <input type="password" id="senha" class="form-input" placeholder="Mínimo 6 caracteres" required minlength="6" />
          </div>
          <div class="form-group">
            <label for="tipo">Tipo de conta</label>
            <select id="tipo" class="form-select">
              <option value="PF">Pessoa Física</option>
              <option value="PJ">Pessoa Jurídica</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="btnRegister">Criar conta</button>
        </form>
        <p style="text-align:center;margin-top:1.5rem;color:var(--text-muted);font-size:0.85rem">
          Já tem conta? <a href="#/login" style="color:var(--accent-primary);font-weight:600">Entrar</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnRegister');
    btn.textContent = 'Criando...';
    btn.disabled = true;
    try {
      const data = await api.register({
        nome: document.getElementById('nome').value,
        email: document.getElementById('email').value,
        senha: document.getElementById('senha').value,
        tipo: document.getElementById('tipo').value,
      });
      setToken(data.token);
      setUser(data.usuario);
      toast('Conta criada com sucesso!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message, 'error');
      btn.textContent = 'Criar conta';
      btn.disabled = false;
    }
  });
}
