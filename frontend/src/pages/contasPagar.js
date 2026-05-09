import { api } from '../services/api.js';
import { formatCurrency, formatDate, getMesNome, todayISO } from '../services/utils.js';
import { toast } from '../components/toast.js';

const FORMAS_PAGAMENTO = [
  { value: 'CREDITO_BRADESCO', label: 'Crédito Bradesco', icon: '💳' },
  { value: 'CREDITO_SANTANDER', label: 'Crédito Santander', icon: '💳' },
  { value: 'DEBITO_BRADESCO', label: 'Débito Bradesco', icon: '🏦' },
  { value: 'DEBITO_SANTANDER', label: 'Débito Santander', icon: '🏦' },
  { value: 'DEBITO_CREFISA', label: 'Débito Crefisa', icon: '🏦' },
  { value: 'PIX_BRADESCO', label: 'PIX Bradesco', icon: '📲' },
  { value: 'PIX_SANTANDER', label: 'PIX Santander', icon: '📲' },
  { value: 'PIX_CREFISA', label: 'PIX Crefisa', icon: '📲' },
  { value: 'OUTROS', label: 'Outros', icon: '•' },
];

function getFormaPagamento(forma) {
  return FORMAS_PAGAMENTO.find((f) => f.value === forma) || { value: forma, label: forma || 'Outros', icon: '•' };
}

export async function renderContasPagar(container) {
  const now = new Date();
  let mes = now.getMonth() + 1;
  let ano = now.getFullYear();
  let categorias = [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Contas a Pagar</h1>
        <p class="page-subtitle">Gerencie suas despesas</p>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center">
        <div class="month-nav">
          <button id="prevMonth">◀</button>
          <span class="current-month" id="currentMonth"></span>
          <button id="nextMonth">▶</button>
        </div>
        <button class="btn btn-primary" id="btnNovaPagar">+ Nova Conta</button>
        <button class="btn btn-secondary" id="btnGerarRecorrentes">Gerar Recorrentes do Mês</button>
      </div>
    </div>
    <div class="filters-bar">
      <div class="filter-group">
        <label>Status:</label>
        <select class="filter-select" id="filterStatus"><option value="">Todos</option><option value="PENDENTE">Pendente</option><option value="PAGO">Pago</option></select>
      </div>
      <div class="filter-group">
        <label>Origem:</label>
        <select class="filter-select" id="filterOrigem"><option value="">Todas</option><option value="PF">PF</option><option value="PJ">PJ</option></select>
      </div>
      <div class="filter-group">
        <label>Tipo:</label>
        <select class="filter-select" id="filterTipo"><option value="">Todos</option><option value="FIXA">Fixa</option><option value="VARIAVEL">Variável</option></select>
      </div>
    </div>
    <div class="card">
      <div class="table-container" id="tableContainer">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
    <div id="modalContainer"></div>
  `;

  async function loadCategorias() {
    try { const d = await api.listarCategorias('DESPESA'); categorias = d.categorias || []; } catch(e) { categorias = []; }
  }

  async function loadData() {
    document.getElementById('currentMonth').textContent = `${getMesNome(mes)} ${ano}`;
    const s = document.getElementById('filterStatus').value;
    const o = document.getElementById('filterOrigem').value;
    const t = document.getElementById('filterTipo').value;
    const params = `mes=${mes}&ano=${ano}${s ? '&status='+s : ''}${o ? '&origem='+o : ''}${t ? '&tipo='+t : ''}`;

    try {
      const data = await api.listarPagar(params);
      const contas = data.contas || [];

      if (!contas.length) {
        document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Nenhuma conta a pagar neste mês</p></div>`;
        return;
      }

      const total = contas.reduce((s, c) => s + parseFloat(c.valor), 0);
      document.getElementById('tableContainer').innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Tipo</th><th>Recorrente</th><th>Pagamento</th><th>Origem</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody>${contas.map(c => `
            <tr>
              <td><strong>${c.descricao}</strong>${c.categoria_nome ? `<br><small style="color:${c.categoria_cor||'var(--text-muted)'}">${c.categoria_nome}</small>` : ''}</td>
              <td style="font-weight:600;color:var(--danger)">${formatCurrency(c.valor)}</td>
              <td>${formatDate(c.data_vencimento)}</td>
              <td><span class="badge badge-info">${c.tipo}</span></td>
              <td><span class="badge ${c.recorrente ? 'badge-success' : 'badge-info'}">${c.recorrente ? 'SIM' : 'NÃO'}</span></td>
              <td>${getFormaPagamento(c.forma_pagamento).icon} ${getFormaPagamento(c.forma_pagamento).label}</td>
              <td><span class="badge badge-${c.origem.toLowerCase()}">${c.origem}</span></td>
              <td><span class="badge ${c.status === 'PAGO' ? 'badge-success' : 'badge-warning'}">${c.status}</span></td>
              <td>
                <div style="display:flex;gap:0.25rem">
                  ${c.status === 'PENDENTE' ? `<button class="btn btn-sm btn-success" data-pagar="${c.id}">Pagar</button>` : ''}
                  <button class="btn btn-sm btn-secondary" data-editar="${c.id}">✎</button>
                  <button class="btn btn-sm btn-danger" data-excluir="${c.id}">✕</button>
                </div>
              </td>
            </tr>
          `).join('')}</tbody>
          <tfoot><tr><td colspan="1" style="font-weight:700;padding:0.75rem 1rem">Total</td><td style="font-weight:700;color:var(--danger);padding:0.75rem 1rem">${formatCurrency(total)}</td><td colspan="7"></td></tr></tfoot>
        </table>
      `;

      // Pagar
      document.querySelectorAll('[data-pagar]').forEach(btn => {
        btn.addEventListener('click', () => {
          const conta = contas.find(x => x.id == btn.dataset.pagar);
          if (conta) showPagamentoModal(conta);
        });
      });

      // Editar
      document.querySelectorAll('[data-editar]').forEach(btn => {
        btn.addEventListener('click', () => {
          const conta = contas.find(x => x.id == btn.dataset.editar);
          if (conta) showModal(conta);
        });
      });

      // Excluir
      document.querySelectorAll('[data-excluir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Excluir esta conta?')) return;
          try {
            await api.excluirPagar(btn.dataset.excluir);
            toast('Conta excluída!', 'success');
            loadData();
          } catch(e) { toast(e.message, 'error'); }
        });
      });
    } catch (err) {
      document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
    }
  }

  function formaPagamentoOptions(selected = 'OUTROS') {
    return FORMAS_PAGAMENTO.map((forma) => (
      `<option value="${forma.value}" ${selected === forma.value ? 'selected' : ''}>${forma.label}</option>`
    )).join('');
  }

  function showModal(conta = null) {
    const isEdit = !!conta;
    const dataFormatada = conta ? formatDate(conta.data_vencimento).split('/').reverse().join('-') : '';
    
    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header"><h3>${isEdit ? 'Editar Conta' : 'Nova Conta a Pagar'}</h3><button id="closeModal" style="font-size:1.5rem;color:var(--text-muted)">✕</button></div>
          <form id="formPagar">
            <div class="modal-body">
              <div class="form-group"><label>Descrição</label><input type="text" class="form-input" id="descricao" required value="${conta?.descricao || ''}" /></div>
              <div class="two-col">
                <div class="form-group"><label>Valor (R$)</label><input type="number" step="0.01" class="form-input" id="valor" required value="${conta?.valor || ''}" /></div>
                <div class="form-group"><label>Vencimento</label><input type="date" class="form-input" id="data_vencimento" required value="${dataFormatada}" /></div>
              </div>
              <div class="two-col">
                <div class="form-group"><label>Tipo</label><select class="form-select" id="tipo"><option value="VARIAVEL" ${conta?.tipo==='VARIAVEL'?'selected':''}>Variável</option><option value="FIXA" ${conta?.tipo==='FIXA'?'selected':''}>Fixa</option></select></div>
                <div class="form-group"><label>Forma Pgto</label><select class="form-select" id="forma_pagamento">${formaPagamentoOptions(conta?.forma_pagamento || 'OUTROS')}</select></div>
              </div>
              <div class="two-col">
                <div class="form-group"><label>Origem</label><select class="form-select" id="origem"><option value="PF" ${conta?.origem==='PF'?'selected':''}>Pessoa Física</option><option value="PJ" ${conta?.origem==='PJ'?'selected':''}>Pessoa Jurídica</option></select></div>
                <div class="form-group"><label>Categoria</label><select class="form-select" id="categoria_id"><option value="">Nenhuma</option>${categorias.map(c=>`<option value="${c.id}" ${conta?.categoria_id===c.id?'selected':''}>${c.nome}</option>`).join('')}</select></div>
              </div>
              <div class="form-group" style="padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
                <label style="display:flex;align-items:center;gap:0.5rem;margin:0;cursor:pointer">
                  <input type="checkbox" id="recorrente" ${conta?.recorrente ? 'checked' : ''} />
                  Conta recorrente mensal
                </label>
              </div>
              <div class="form-group"><label>Observação</label><textarea class="form-input" id="observacao" rows="2">${conta?.observacao || ''}</textarea></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" id="cancelModal">Cancelar</button><button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Salvar'}</button></div>
          </form>
        </div>
      </div>
    `;

    const close = () => document.getElementById('modalContainer').innerHTML = '';
    document.getElementById('closeModal').addEventListener('click', close);
    document.getElementById('cancelModal').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });

    document.getElementById('formPagar').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          descricao: document.getElementById('descricao').value,
          valor: parseFloat(document.getElementById('valor').value),
          data_vencimento: document.getElementById('data_vencimento').value,
          tipo: document.getElementById('tipo').value,
          forma_pagamento: document.getElementById('forma_pagamento').value,
          origem: document.getElementById('origem').value,
          categoria_id: document.getElementById('categoria_id').value || null,
          recorrente: document.getElementById('recorrente').checked,
          observacao: document.getElementById('observacao').value,
        };

        if (isEdit) {
          await api.atualizarPagar(conta.id, payload);
          toast('Conta atualizada com sucesso!', 'success');
        } else {
          await api.criarPagar(payload);
          toast('Conta criada com sucesso!', 'success');
        }
        close();
        loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  function showPagamentoModal(conta) {
    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="max-width:440px">
          <div class="modal-header"><h3>Registrar Pagamento</h3><button id="closeModal" style="font-size:1.5rem;color:var(--text-muted)">✕</button></div>
          <form id="formPagamento">
            <div class="modal-body">
              <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem">
                <div>
                  <div style="font-size:0.8rem;color:var(--text-muted)">Conta</div>
                  <strong>${conta.descricao}</strong>
                </div>
                <div style="text-align:right">
                  <div style="font-size:0.8rem;color:var(--text-muted)">Valor</div>
                  <strong style="color:var(--danger)">${formatCurrency(conta.valor)}</strong>
                </div>
              </div>
              <div class="form-group">
                <label>Forma de pagamento</label>
                <select class="form-select" id="pagamento_forma" required>${formaPagamentoOptions(conta.forma_pagamento || 'OUTROS')}</select>
              </div>
              <div class="form-group">
                <label>Data do pagamento</label>
                <input type="date" class="form-input" id="pagamento_data" value="${todayISO()}" required />
              </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" id="cancelModal">Cancelar</button><button type="submit" class="btn btn-success">Confirmar Pagamento</button></div>
          </form>
        </div>
      </div>
    `;

    const close = () => document.getElementById('modalContainer').innerHTML = '';
    document.getElementById('closeModal').addEventListener('click', close);
    document.getElementById('cancelModal').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });

    document.getElementById('formPagamento').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.atualizarPagar(conta.id, {
          status: 'PAGO',
          forma_pagamento: document.getElementById('pagamento_forma').value,
          data_pagamento: document.getElementById('pagamento_data').value,
        });
        toast('Conta marcada como paga!', 'success');
        close();
        loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  document.getElementById('prevMonth').addEventListener('click', () => { mes--; if(mes<1){mes=12;ano--;} loadData(); });
  document.getElementById('nextMonth').addEventListener('click', () => { mes++; if(mes>12){mes=1;ano++;} loadData(); });
  document.getElementById('filterStatus').addEventListener('change', loadData);
  document.getElementById('filterOrigem').addEventListener('change', loadData);
  document.getElementById('filterTipo').addEventListener('change', loadData);
  document.getElementById('btnNovaPagar').addEventListener('click', () => showModal());
  document.getElementById('btnGerarRecorrentes').addEventListener('click', async () => {
    try {
      const res = await api.gerarRecorrenciasMensal(mes, ano);
      toast(res.message || 'Recorrentes geradas!', 'success');
      loadData();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  await loadCategorias();
  loadData();
}
