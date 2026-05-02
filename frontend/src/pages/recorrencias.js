import { api } from '../services/api.js';
import { formatCurrency, getMesNome } from '../services/utils.js';
import { toast } from '../components/toast.js';

export async function renderRecorrencias(container) {
  let categorias = [];
  let recorrencias = [];

  const now = new Date();
  const currentMes = now.getMonth() + 1;
  const currentAno = now.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Recorrência Inteligente</h1>
        <p class="page-subtitle">Gerencie suas assinaturas, salários e contas fixas</p>
      </div>
      <div style="display:flex;gap:1rem;align-items:center">
        <button class="btn btn-secondary" id="btnNovaRecorrencia">+ Nova Recorrência</button>
        <button class="btn btn-primary" id="btnGerarMensal">Gerar Mês Atual</button>
      </div>
    </div>

    <div class="filters-bar">
      <div class="filter-group">
        <label>Filtro:</label>
        <select class="filter-select" id="filterTipo">
          <option value="">Todas</option>
          <option value="PAGAR">Despesas</option>
          <option value="RECEBER">Receitas</option>
        </select>
      </div>
      <div style="margin-left: auto; color: var(--text-muted); font-size: 0.9rem;">
        Gerando lançamentos para: <strong>${getMesNome(currentMes)} ${currentAno}</strong>
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
    try {
      const res = await api.listarCategorias('');
      categorias = res.categorias || [];
    } catch (e) {
      categorias = [];
    }
  }

  async function loadData() {
    const tipo = document.getElementById('filterTipo').value;
    try {
      const data = await api.listarRecorrencias(tipo);
      recorrencias = data.recorrencias || [];
      renderTable();
    } catch (err) {
      document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
    }
  }

  function renderTable() {
    if (!recorrencias.length) {
      document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><div class="empty-icon">🔁</div><p>Nenhuma regra de recorrência cadastrada.</p></div>`;
      return;
    }

    document.getElementById('tableContainer').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Tipo</th>
            <th>Origem</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${recorrencias.map(c => `
            <tr>
              <td>
                <strong>${c.descricao}</strong>
                ${c.categoria_nome ? `<br><small style="color:${c.categoria_cor||'var(--text-muted)'}">${c.categoria_nome}</small>` : ''}
              </td>
              <td style="font-weight:600;color:var(--${c.tipo === 'RECEBER' ? 'success' : 'danger'})">
                ${formatCurrency(c.valor)}
              </td>
              <td>Todo dia ${String(c.dia_vencimento).padStart(2, '0')}</td>
              <td><span class="badge ${c.tipo === 'RECEBER' ? 'badge-success' : 'badge-danger'}">${c.tipo}</span></td>
              <td><span class="badge badge-${c.origem.toLowerCase()}">${c.origem}</span></td>
              <td>
                <span class="badge ${c.ativo ? 'badge-info' : 'badge-warning'}">${c.ativo ? 'ATIVA' : 'PAUSADA'}</span>
              </td>
              <td>
                <div style="display:flex;gap:0.25rem">
                  <button class="btn btn-sm btn-secondary" data-editar="${c.id}">✎</button>
                  <button class="btn btn-sm btn-danger" data-excluir="${c.id}">✕</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Editar
    document.querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = recorrencias.find(x => x.id == btn.dataset.editar);
        if (rec) showModal(rec);
      });
    });

    // Excluir
    document.querySelectorAll('[data-excluir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deseja excluir esta recorrência? (Os lançamentos já gerados não serão apagados)')) return;
        try {
          await api.excluirRecorrencia(btn.dataset.excluir);
          toast('Recorrência excluída com sucesso!', 'success');
          loadData();
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  }

  function showModal(rec = null) {
    const isEdit = !!rec;
    
    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h3>${isEdit ? 'Editar Recorrência' : 'Nova Recorrência'}</h3>
            <button id="closeModal" style="font-size:1.5rem;color:var(--text-muted)">✕</button>
          </div>
          <form id="formRecorrencia">
            <div class="modal-body">
              <div class="form-group">
                <label>Descrição</label>
                <input type="text" class="form-input" id="descricao" required value="${rec?.descricao || ''}" />
              </div>
              <div class="two-col">
                <div class="form-group">
                  <label>Valor (R$)</label>
                  <input type="number" step="0.01" class="form-input" id="valor" required value="${rec?.valor || ''}" />
                </div>
                <div class="form-group">
                  <label>Dia do Vencimento/Recebimento</label>
                  <input type="number" class="form-input" id="dia_vencimento" required min="1" max="31" value="${rec?.dia_vencimento || 5}" />
                </div>
              </div>
              <div class="two-col">
                <div class="form-group">
                  <label>Tipo da Operação</label>
                  <select class="form-select" id="tipo">
                    <option value="PAGAR" ${rec?.tipo==='PAGAR'?'selected':''}>Despesa (A Pagar)</option>
                    <option value="RECEBER" ${rec?.tipo==='RECEBER'?'selected':''}>Receita (A Receber)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Categoria</label>
                  <select class="form-select" id="categoria_id">
                    <option value="">Nenhuma</option>
                    ${categorias.map(c=>`<option value="${c.id}" ${rec?.categoria_id===c.id?'selected':''}>${c.nome} (${c.tipo})</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="two-col">
                <div class="form-group">
                  <label>Origem</label>
                  <select class="form-select" id="origem">
                    <option value="PF" ${rec?.origem==='PF'?'selected':''}>Pessoa Física (PF)</option>
                    <option value="PJ" ${rec?.origem==='PJ'?'selected':''}>Pessoa Jurídica (PJ)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Status da Regra</label>
                  <select class="form-select" id="ativo">
                    <option value="true" ${rec?.ativo===true?'selected':''}>ATIVA</option>
                    <option value="false" ${rec?.ativo===false?'selected':''}>PAUSADA</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelModal">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar Regra'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const close = () => document.getElementById('modalContainer').innerHTML = '';
    document.getElementById('closeModal').addEventListener('click', close);
    document.getElementById('cancelModal').addEventListener('click', close);
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });

    document.getElementById('formRecorrencia').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          descricao: document.getElementById('descricao').value,
          valor: parseFloat(document.getElementById('valor').value),
          dia_vencimento: parseInt(document.getElementById('dia_vencimento').value),
          tipo: document.getElementById('tipo').value,
          origem: document.getElementById('origem').value,
          categoria_id: document.getElementById('categoria_id').value || null,
          ativo: document.getElementById('ativo').value === 'true'
        };

        if (isEdit) {
          await api.atualizarRecorrencia(rec.id, payload);
          toast('Recorrência atualizada com sucesso!', 'success');
        } else {
          await api.criarRecorrencia(payload);
          toast('Recorrência criada com sucesso!', 'success');
        }
        close();
        loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  }

  // Event Listeners
  document.getElementById('btnNovaRecorrencia').addEventListener('click', () => showModal());
  document.getElementById('filterTipo').addEventListener('change', loadData);

  document.getElementById('btnGerarMensal').addEventListener('click', async () => {
    if (!confirm(`Deseja gerar os lançamentos fixos deste mês (${getMesNome(currentMes)}/${currentAno})? O sistema ignorará os que já foram gerados.`)) return;
    try {
      const res = await api.gerarRecorrenciasMensal(currentMes, currentAno);
      toast(res.message, 'success');
    } catch(e) {
      toast(e.message, 'error');
    }
  });

  // Init
  await loadCategorias();
  loadData();
}
