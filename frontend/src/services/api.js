/**
 * FluxoPro — API Service
 * Centraliza todas as chamadas HTTP à API
 */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('fluxopro_token');
}

function setToken(token) {
  localStorage.setItem('fluxopro_token', token);
}

function setUser(user) {
  localStorage.setItem('fluxopro_user', JSON.stringify(user));
}

function getUser() {
  const u = localStorage.getItem('fluxopro_user');
  return u ? JSON.parse(u) : null;
}

function clearAuth() {
  localStorage.removeItem('fluxopro_token');
  localStorage.removeItem('fluxopro_user');
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      clearAuth();
      window.location.hash = '#/login';
    }
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

const api = {
  // Auth
  login: (email, senha) => request('POST', '/auth/login', { email, senha }),
  register: (dados) => request('POST', '/auth/register', dados),
  me: () => request('GET', '/auth/me'),

  // Contas a Pagar
  listarPagar: (params = '') => request('GET', `/contas-pagar?${params}`),
  criarPagar: (dados) => request('POST', '/contas-pagar', dados),
  atualizarPagar: (id, dados) => request('PUT', `/contas-pagar/${id}`, dados),
  excluirPagar: (id) => request('DELETE', `/contas-pagar/${id}`),

  // Contas a Receber
  listarReceber: (params = '') => request('GET', `/contas-receber?${params}`),
  criarReceber: (dados) => request('POST', '/contas-receber', dados),
  atualizarReceber: (id, dados) => request('PUT', `/contas-receber/${id}`, dados),
  excluirReceber: (id) => request('DELETE', `/contas-receber/${id}`),

  // Dashboard
  resumo: (mes, ano) => request('GET', `/dashboard/resumo?mes=${mes}&ano=${ano}`),
  caixaOrigem: (mes, ano) => request('GET', `/dashboard/caixa-origem?mes=${mes}&ano=${ano}`),
  graficos: (mes, ano) => request('GET', `/dashboard/graficos?mes=${mes}&ano=${ano}`),

  // Categorias
  listarCategorias: (tipo = '') => request('GET', `/categorias${tipo ? '?tipo=' + tipo : ''}`),
  criarCategoria: (dados) => request('POST', '/categorias', dados),

  // Cartões e Faturas
  listarCartoes: () => request('GET', '/cartoes'),
  criarCartao: (dados) => request('POST', '/cartoes', dados),
  editarCartao: (id, dados) => request('PUT', `/cartoes/${id}`, dados),
  excluirCartao: (id) => request('DELETE', `/cartoes/${id}`),
  listarFaturas: (cartaoId = '') => request('GET', `/cartoes/faturas${cartaoId ? '?cartao_id=' + cartaoId : ''}`),
  excluirFatura: (id) => request('DELETE', `/cartoes/faturas/${id}`),
  listarComprasFatura: (id) => request('GET', `/cartoes/faturas/${id}/compras`),
  adicionarCompra: (dados) => request('POST', '/cartoes/compras', dados),
  editarCompraCartao: (id, dados) => request('PUT', `/cartoes/compras/${id}`, dados),
  excluirCompraCartao: (id) => request('DELETE', `/cartoes/compras/${id}`),

  // Recorrências
  listarRecorrencias: (tipo = '') => request('GET', `/recorrencias${tipo ? '?tipo=' + tipo : ''}`),
  listarRecorrenciasStatus: (mes, ano, tipo = '') => request('GET', `/recorrencias/status?mes=${mes}&ano=${ano}${tipo ? '&tipo=' + tipo : ''}`),
  totaisRecorrencias: (mes, ano) => request('GET', `/recorrencias/totais?mes=${mes}&ano=${ano}`),
  criarRecorrencia: (dados) => request('POST', '/recorrencias', dados),
  atualizarRecorrencia: (id, dados) => request('PUT', `/recorrencias/${id}`, dados),
  excluirRecorrencia: (id) => request('DELETE', `/recorrencias/${id}`),
  gerarRecorrenciasMensal: (mes, ano) => request('POST', '/recorrencias/gerar', { mes, ano }),
  marcarRecorrenciaPaga: (id, dados) => request('POST', `/recorrencias/${id}/pagar`, dados),
  marcarRecorrenciaPendente: (id, dados) => request('POST', `/recorrencias/${id}/despagar`, dados),

  // Relatórios
  relatorioComparativo: () => request('GET', '/relatorios/comparativo'),
  relatorioProjecao: () => request('GET', '/relatorios/projecao'),
};

export { api, getToken, setToken, setUser, getUser, clearAuth };
