import { api } from '../services/api.js';
import { formatCurrency, formatDate, getMesNome, todayISO } from '../services/utils.js';
import { toast } from '../components/toast.js';

export async function renderContasReceber(container) {
  const now = new Date();
  let mes = now.getMonth() + 1;
  let ano = now.getFullYear();
  let categorias = [];
  let contasCorrentes = [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Contas a Receber</h1>
        <p class="page-subtitle">Gerencie suas receitas</p>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center">
        <div class="month-nav">
          <button id="prevMonth">◀</button>
          <span class="current-month" id="currentMonth"></span>
          <button id="nextMonth">▶</button>
        </div>
        <button class="btn btn-primary" id="btnNovaReceber">+ Nova Conta</button>
      </div>
    </div>
    <div class="filters-bar">
      <div class="filter-group">
        <label>Status:</label>
        <select class="filter-select" id="filterStatus"><option value="">Todos</option><option value="A_RECEBER">A receber</option><option value="RECEBIDO">Recebido</option></select>
      </div>
      <div class="filter-group">
        <label>Origem:</label>
        <select class="filter-select" id="filterOrigem"><option value="">Todas</option><option value="PF">PF</option><option value="PJ">PJ</option></select>
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
    try { const d = await api.listarCategorias('RECEITA'); categorias = d.categorias || []; } catch(e) { categorias = []; }
  }

  async function loadContasCorrentes() {
    try { const d = await api.contasCorrentes(); contasCorrentes = d.contas || []; } catch(e) { contasCorrentes = []; }
  }

  async function loadData() {
    document.getElementById('currentMonth').textContent = `${getMesNome(mes)} ${ano}`;
    const s = document.getElementById('filterStatus').value;
    const o = document.getElementById('filterOrigem').value;
    const params = `mes=${mes}&ano=${ano}${s?'&status='+s:''}${o?'&origem='+o:''}`;

    try {
      await api.gerarRecorrenciasMensal(mes, ano, 'RECEBER');
      const data = await api.listarReceber(params);
      const contas = data.contas || [];

      if (!contas.length) {
        document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Nenhuma conta a receber neste mês</p></div>`;
        return;
      }

      const total = contas.reduce((s,c) => s + parseFloat(c.valor), 0);
      document.getElementById('tableContainer').innerHTML = `
        <table class="data-table">
          <thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Tipo</th><th>Origem</th><th>Depósito</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>${contas.map(c => `<tr>
            <td><strong>${c.descricao}</strong>${c.categoria_nome?`<br><small style="color:${c.categoria_cor||'var(--text-muted)'}">${c.categoria_nome}</small>`:''}</td>
            <td style="font-weight:600;color:var(--success)">${formatCurrency(c.valor)}</td>
            <td>${formatDate(c.data_vencimento)}</td>
            <td><span class="badge badge-info">${c.tipo}</span></td>
            <td><span class="badge badge-${c.origem.toLowerCase()}">${c.origem}</span></td>
            <td>${c.status === 'A_RECEBER' ? `
              <select class="form-select" data-deposito="${c.id}" style="min-width:150px;padding:0.45rem 2rem 0.45rem 0.65rem;font-size:0.82rem">
                <option value="">Selecionar</option>
                ${contaCorrenteOptions(c.conta_bancaria_id || '')}
              </select>
            ` : (c.conta_bancaria_nome ? `<span class="badge badge-info">${c.conta_bancaria_nome}</span>` : '-')}</td>
            <td><span class="badge ${c.status==='RECEBIDO'?'badge-success':'badge-warning'}">${c.status==='A_RECEBER'?'A RECEBER':'RECEBIDO'}</span></td>
            <td><div style="display:flex;gap:0.25rem">
              ${c.status==='A_RECEBER'?`<button class="btn btn-sm btn-success" data-receber="${c.id}">Receber</button>`:''}
              <button class="btn btn-sm btn-secondary" data-editar="${c.id}">✎</button>
              <button class="btn btn-sm btn-danger" data-excluir="${c.id}">✕</button>
            </div></td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td style="font-weight:700;padding:0.75rem 1rem">Total</td><td style="font-weight:700;color:var(--success);padding:0.75rem 1rem">${formatCurrency(total)}</td><td colspan="6"></td></tr></tfoot>
        </table>
      `;

      document.querySelectorAll('[data-receber]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const contaId = btn.dataset.receber;
          const deposito = document.querySelector(`[data-deposito="${contaId}"]`);
          const contaBancariaId = deposito?.value;

          if (!contaBancariaId) {
            toast('Selecione a conta onde o valor foi depositado.', 'error');
            deposito?.focus();
            return;
          }

          try {
            await api.atualizarReceber(contaId, {
              status: 'RECEBIDO',
              conta_bancaria_id: contaBancariaId,
              data_recebimento: todayISO(),
            });
            toast('Conta marcada como recebida!', 'success');
            loadData();
          } catch(e) { toast(e.message, 'error'); }
        });
      });

      document.querySelectorAll('[data-editar]').forEach(btn => {
        btn.addEventListener('click', () => {
          const conta = contas.find(x => x.id == btn.dataset.editar);
          if (conta) showModal(conta);
        });
      });

      document.querySelectorAll('[data-excluir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Excluir esta conta?')) return;
          try { await api.excluirReceber(btn.dataset.excluir); toast('Excluída!','success'); loadData(); }
          catch(e) { toast(e.message,'error'); }
        });
      });
    } catch (err) {
      document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
    }
  }

  function contaCorrenteOptions(selected = '') {
    const contasDeposito = contasCorrentes.length
      ? contasCorrentes.filter((conta) => ['Bradesco', 'Santander', 'Crefisa'].includes(conta.nome))
      : [
          { id: 'BRADESCO', nome: 'Bradesco' },
          { id: 'SANTANDER', nome: 'Santander' },
          { id: 'CREFISA', nome: 'Crefisa' },
        ];

    return contasDeposito.map((conta) => (
      `<option value="${conta.id}" ${String(selected) === String(conta.id) ? 'selected' : ''}>${conta.nome}</option>`
    )).join('');
  }

  function showModal(conta = null) {
    const isEdit = !!conta;
    const dataFormatada = conta ? formatDate(conta.data_vencimento).split('/').reverse().join('-') : '';

    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header"><h3>${isEdit ? 'Editar Conta' : 'Nova Conta a Receber'}</h3><button id="closeModal" style="font-size:1.5rem;color:var(--text-muted)">✕</button></div>
          <form id="formReceber">
            <div class="modal-body">
              <div class="form-group"><label>Descrição</label><input type="text" class="form-input" id="descricao" required value="${conta?.descricao || ''}" /></div>
              <div class="two-col">
                <div class="form-group"><label>Valor (R$)</label><input type="number" step="0.01" class="form-input" id="valor" required value="${conta?.valor || ''}" /></div>
                <div class="form-group"><label>Vencimento</label><input type="date" class="form-input" id="data_vencimento" required value="${dataFormatada}" /></div>
              </div>
              <div class="two-col">
                <div class="form-group"><label>Tipo</label><select class="form-select" id="tipo"><option value="AVULSO" ${conta?.tipo==='AVULSO'?'selected':''}>Avulso</option><option value="RECORRENTE" ${conta?.tipo==='RECORRENTE'?'selected':''}>Recorrente</option></select></div>
                <div class="form-group"><label>Origem Tipo</label><select class="form-select" id="origem_tipo"><option value="CLIENTE" ${conta?.origem_tipo==='CLIENTE'?'selected':''}>Cliente</option><option value="SERVICO" ${conta?.origem_tipo==='SERVICO'?'selected':''}>Serviço</option><option value="OUTROS" ${conta?.origem_tipo==='OUTROS'?'selected':''}>Outros</option></select></div>
              </div>
              <div class="two-col">
                <div class="form-group"><label>Origem</label><select class="form-select" id="origem"><option value="PF" ${conta?.origem==='PF'?'selected':''}>Pessoa Física</option><option value="PJ" ${conta?.origem==='PJ'?'selected':''}>Pessoa Jurídica</option></select></div>
                <div class="form-group"><label>Categoria</label><select class="form-select" id="categoria_id"><option value="">Nenhuma</option>${categorias.map(c=>`<option value="${c.id}" ${conta?.categoria_id===c.id?'selected':''}>${c.nome}</option>`).join('')}</select></div>
              </div>
              <div class="form-group">
                <label>Conta de depósito</label>
                <select class="form-select" id="conta_bancaria_id">
                  <option value="">Definir ao receber</option>
                  ${contaCorrenteOptions(conta?.conta_bancaria_id || '')}
                </select>
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
    document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) close(); });

    document.getElementById('formReceber').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          descricao: document.getElementById('descricao').value,
          valor: parseFloat(document.getElementById('valor').value),
          data_vencimento: document.getElementById('data_vencimento').value,
          tipo: document.getElementById('tipo').value,
          origem_tipo: document.getElementById('origem_tipo').value,
          origem: document.getElementById('origem').value,
          categoria_id: document.getElementById('categoria_id').value || null,
          conta_bancaria_id: document.getElementById('conta_bancaria_id').value || null,
          observacao: document.getElementById('observacao').value,
        };

        if (isEdit) {
          await api.atualizarReceber(conta.id, payload);
          toast('Conta a receber atualizada!', 'success');
        } else {
          await api.criarReceber(payload);
          toast('Conta a receber criada!', 'success');
        }
        close();
        loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  function showRecebimentoModal(conta) {
    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="max-width:440px">
          <div class="modal-header"><h3>Registrar Recebimento</h3><button id="closeModal" style="font-size:1.5rem;color:var(--text-muted)">✕</button></div>
          <form id="formRecebimento">
            <div class="modal-body">
              <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem">
                <div>
                  <div style="font-size:0.8rem;color:var(--text-muted)">Conta</div>
                  <strong>${conta.descricao}</strong>
                </div>
                <div style="text-align:right">
                  <div style="font-size:0.8rem;color:var(--text-muted)">Valor</div>
                  <strong style="color:var(--success)">${formatCurrency(conta.valor)}</strong>
                </div>
              </div>
              <div class="form-group">
                <label>Depositado em</label>
                <select class="form-select" id="recebimento_conta" required>
                  <option value="">Selecione a conta</option>
                  ${contaCorrenteOptions(conta.conta_bancaria_id || '')}
                </select>
              </div>
              <div class="form-group">
                <label>Data do recebimento</label>
                <input type="date" class="form-input" id="recebimento_data" value="${todayISO()}" required />
              </div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" id="cancelModal">Cancelar</button><button type="submit" class="btn btn-success">Confirmar Recebimento</button></div>
          </form>
        </div>
      </div>
    `;

    const close = () => document.getElementById('modalContainer').innerHTML = '';
    document.getElementById('closeModal').addEventListener('click', close);
    document.getElementById('cancelModal').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) close(); });

    document.getElementById('formRecebimento').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.atualizarReceber(conta.id, {
          status: 'RECEBIDO',
          conta_bancaria_id: document.getElementById('recebimento_conta').value,
          data_recebimento: document.getElementById('recebimento_data').value,
        });
        toast('Conta marcada como recebida!', 'success');
        close();
        loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  document.getElementById('prevMonth').addEventListener('click', () => { mes--; if(mes<1){mes=12;ano--;} loadData(); });
  document.getElementById('nextMonth').addEventListener('click', () => { mes++; if(mes>12){mes=1;ano++;} loadData(); });
  document.getElementById('filterStatus').addEventListener('change', loadData);
  document.getElementById('filterOrigem').addEventListener('change', loadData);
  document.getElementById('btnNovaReceber').addEventListener('click', () => showModal());

  await loadCategorias();
  await loadContasCorrentes();
  loadData();
}
