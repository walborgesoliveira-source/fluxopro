/**
 * FluxoPro — Utility helpers
 */

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  // Remove possible timestamp parts if it comes from PostgreSQL ISO string
  const cleanDate = String(dateStr).split('T')[0];
  const d = new Date(cleanDate + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Data Inválida';
  return d.toLocaleDateString('pt-BR');
}

export function getMesNome(mes) {
  return MESES[mes - 1] || '';
}

export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
