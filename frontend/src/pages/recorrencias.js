import { api } from '../services/api.js';
import { formatCurrency, getMesNome } from '../services/utils.js';
import { toast } from '../components/toast.js';

// Mapa de formas de pagamento
const FORMAS_PAG = {
  CREDITO_BRADESCO:  { label: 'Crédito Bradesco',  icon: '💳', cor: '#ef4444' },
  CREDITO_SANTANDER: { label: 'Crédito Santander', icon: '💳', cor: '#f97316' },
  DEBITO_BRADESCO:   { label: 'Débito Bradesco',   icon: '🏦', cor: '#3b82f6' },
  DEBITO_SANTANDER:  { label: 'Débito Santander',  icon: '🏦', cor: '#8b5cf6' },
  PIX_DINHEIRO:      { label: 'Pix / Dinheiro',    icon: '💵', cor: '#22c55e' },
};

export async function renderRecorrencias(container) {
  let categorias = [];
  let recorrencias = [];
  let totais = {};

  const now = new Date();
  let currentMes = now.getMonth() + 1;
  let currentAno = now.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Recorrência Inteligente</h1>
        <p class="page-subtitle">Gerencie suas assinaturas, salários e contas fixas</p>
      </div>
      <div style="display:flex;gap:1rem;align-items:center">
        <button class="btn btn-secondary" id="btnNovaRecorrencia">+ Nova Recorrência</button>
        <button class="btn btn-primary" id="btnGerarMensal">⚡ Gerar Mês</button>
      </div>
    </div>

    <!-- Filtros e Navegação de Mês -->
    <div class="filters-bar" style="flex-wrap:wrap;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <button class="btn btn-sm btn-secondary" id="btnMesAnterior">‹</button>
        <strong id="labelMesAtual" style="min-width:160px;text-align:center;font-size:1rem"></strong>
        <button class="btn btn-sm btn-secondary" id="btnMesProximo">›</button>
      </div>
      <div class="filter-group">
        <label>Filtrar:</label>
        <select class="filter-select" id="filterTipo">
          <option value="">Todas</option>
          <option value="PAGAR">Despesas</option>
          <option value="RECEBER">Receitas</option>
        </select>
      </div>
    </div>

    <!-- Painel de Totais -->
    <div id="painelTotais" style="margin-bottom:1.5rem"></div>

    <!-- Tabela -->
    <div class="card">
      <div class="table-container" id="tableContainer">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>

    <div id="modalContainer"></div>
    <div id="modalPagamento" style="display:none"></div>
  `;

  // ─── Funções auxiliares ─────────────────────────────────────────────────────

  function atualizarLabelMes() {
    document.getElementById('labelMesAtual').textContent = `${getMesNome(currentMes)} / ${currentAno}`;
  }

  async function loadCategorias() {
    try {
      const res = await api.listarCategorias('');
      categorias = res.categorias || [];
    } catch (e) { categorias = []; }
  }

  async function loadTotais() {
    try {
      totais = await api.totaisRecorrencias(currentMes, currentAno);
      renderPainelTotais();
    } catch (e) { totais = {}; }
  }

  async function loadData() {
    const tipo = document.getElementById('filterTipo').value;
    try {
      const data = await api.listarRecorrenciasStatus(currentMes, currentAno, tipo);
      recorrencias = data.recorrencias || [];
      renderTable();
    } catch (err) {
      document.getElementById('tableContainer').innerHTML = `<div class="empty-state"><p>Erro: ${err.message}</p></div>`;
    }
  }

  async function recarregar() {
    await Promise.all([loadData(), loadTotais()]);
  }

  // ─── Painel de Totais ───────────────────────────────────────────────────────

  function renderPainelTotais() {
    const painel = document.getElementById('painelTotais');
    if (!painel) return;

    const pagosPorForma = totais.pagos_por_forma || [];
    const totalPago = totais.total_pago || 0;
    const totalPendente = totais.total_pendente || 0;
    const qtdPaga = totais.qtd_paga || 0;
    const qtdPendente = totais.qtd_pendente || 0;

    // Montar mapa forma → total
    const mapaFormas = {};
    pagosPorForma.forEach(p => {
      mapaFormas[p.forma_pagamento] = parseFloat(p.total || 0);
    });

    const cardsFormas = Object.entries(FORMAS_PAG).map(([key, info]) => {
      const val = mapaFormas[key] || 0;
      if (val === 0) return '';
      return `
        <div style="
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-left: 4px solid ${info.cor};
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          min-width: 180px;
          flex: 1;
        ">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${info.icon} ${info.label}</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--success)">${formatCurrency(val)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">pago neste mês</div>
        </div>
      `;
    }).join('');

    painel.innerHTML = `
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:stretch">
        <!-- Card: Total Pago -->
        <div style="
          background: linear-gradient(135deg, #16a34a22, #16a34a11);
          border: 1px solid #16a34a55;
          border-left: 4px solid #16a34a;
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          min-width: 180px;
          flex: 1;
        ">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">✅ Total Pago</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--success)">${formatCurrency(totalPago)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${qtdPaga} recorrência(s)</div>
        </div>

        <!-- Card: Total Pendente -->
        <div style="
          background: linear-gradient(135deg, #dc262622, #dc262611);
          border: 1px solid #dc262655;
          border-left: 4px solid #dc2626;
          border-radius: 10px;
          padding: 0.85rem 1.1rem;
          min-width: 180px;
          flex: 1;
        ">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">⏳ Pendente</div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--danger)">${formatCurrency(totalPendente)}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${qtdPendente} recorrência(s)</div>
        </div>

        <!-- Cards por forma de pagamento -->
        ${cardsFormas || '<div style="color:var(--text-muted);font-size:0.85rem;display:flex;align-items:center;padding:0 1rem">Nenhum pagamento registrado neste mês.</div>'}
      </div>
    `;
  }

  // ─── Tabela Principal ────────────────────────────────────────────────────────

  function renderTable() {
    if (!recorrencias.length) {
      document.getElementById('tableContainer').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔁</div>
          <p>Nenhuma regra de recorrência cadastrada.</p>
        </div>`;
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
            <th>Regra</th>
            <th>Pagamento do Mês</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${recorrencias.map(c => {
            const isPago = c.status_mes === 'PAGO';
            const formaInfo = c.forma_pagamento_mes ? FORMAS_PAG[c.forma_pagamento_mes] : null;

            const badgePagamento = c.tipo === 'RECEBER'
              ? `<span class="badge badge-info" style="font-size:0.7rem">Receita</span>`
              : isPago
                ? `<div>
                    <span class="badge badge-success" style="cursor:pointer;font-size:0.72rem" data-despagar="${c.id}">✅ PAGO</span>
                    ${formaInfo ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px">${formaInfo.icon} ${formaInfo.label}</div>` : ''}
                    ${c.data_pagamento_mes ? `<div style="font-size:0.65rem;color:var(--text-muted)">${new Date(c.data_pagamento_mes).toLocaleDateString('pt-BR')}</div>` : ''}
                  </div>`
                : `<span class="badge badge-warning" style="cursor:pointer;font-size:0.72rem" data-pagar="${c.id}">⏳ PENDENTE</span>`;

            return `
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
                <td>${badgePagamento}</td>
                <td>
                  <div style="display:flex;gap:0.25rem">
                    <button class="btn btn-sm btn-secondary" data-editar="${c.id}">✎</button>
                    <button class="btn btn-sm btn-danger" data-excluir="${c.id}">✕</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // ── Bind: Marcar como PENDENTE (desfazer pagamento) ──
    document.querySelectorAll('[data-despagar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deseja reverter este pagamento para PENDENTE?')) return;
        try {
          await api.marcarRecorrenciaPendente(btn.dataset.despagar, { mes: currentMes, ano: currentAno });
          toast('Revertido para Pendente.', 'success');
          recarregar();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    // ── Bind: Marcar como PAGO ──
    document.querySelectorAll('[data-pagar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = recorrencias.find(x => x.id == btn.dataset.pagar);
        if (rec) showModalPagamento(rec);
      });
    });

    // ── Bind: Editar regra ──
    document.querySelectorAll('[data-editar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = recorrencias.find(x => x.id == btn.dataset.editar);
        if (rec) showModalRegra(rec);
      });
    });

    // ── Bind: Excluir regra ──
    document.querySelectorAll('[data-excluir]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deseja excluir esta recorrência? (Os lançamentos já gerados não serão apagados)')) return;
        try {
          await api.excluirRecorrencia(btn.dataset.excluir);
          toast('Recorrência excluída com sucesso!', 'success');
          recarregar();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  // ─── Modal: Registrar Pagamento ──────────────────────────────────────────────

  function showModalPagamento(rec) {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('modalPagamento').style.display = 'block';
    document.getElementById('modalPagamento').innerHTML = `
      <div class="modal-overlay" id="overlayPagamento" style="display:flex">
        <div class="modal" style="max-width:440px;width:100%">
          <div class="modal-header">
            <h3>💳 Registrar Pagamento</h3>
            <button id="closePagamento" style="font-size:1.5rem;color:var(--text-muted);background:none;border:none;cursor:pointer">✕</button>
          </div>
          <div class="modal-body">
            <div style="margin-bottom:1rem;padding:0.75rem;background:var(--bg-secondary);border-radius:8px">
              <div style="font-weight:600">${rec.descricao}</div>
              <div style="color:var(--danger);font-size:1.1rem;font-weight:700">${formatCurrency(rec.valor)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted)">${getMesNome(currentMes)} / ${currentAno}</div>
            </div>
            <div class="form-group">
              <label>Forma de Pagamento</label>
              <select class="form-select" id="formaPagSelect">
                ${Object.entries(FORMAS_PAG).map(([key, info]) =>
                  `<option value="${key}">${info.icon} ${info.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Data do Pagamento</label>
              <input type="date" class="form-input" id="dataPagInput" value="${hoje}" />
            </div>
          </div>
          <div class="modal-footer" style="display:flex;gap:0.5rem;justify-content:flex-end">
            <button class="btn btn-secondary" id="cancelPagamento">Cancelar</button>
            <button class="btn btn-primary" id="confirmPagamento">✅ Confirmar Pagamento</button>
          </div>
        </div>
      </div>
    `;

    const close = () => {
      document.getElementById('modalPagamento').style.display = 'none';
      document.getElementById('modalPagamento').innerHTML = '';
    };

    document.getElementById('closePagamento').addEventListener('click', close);
    document.getElementById('cancelPagamento').addEventListener('click', close);
    document.getElementById('overlayPagamento').addEventListener('click', e => {
      if (e.target === e.currentTarget) close();
    });

    document.getElementById('confirmPagamento').addEventListener('click', async () => {
      const forma = document.getElementById('formaPagSelect').value;
      const data = document.getElementById('dataPagInput').value;
      try {
        await api.marcarRecorrenciaPaga(rec.id, {
          mes: currentMes,
          ano: currentAno,
          forma_pagamento: forma,
          data_pagamento: data,
        });
        toast(`${rec.descricao} marcado como pago!`, 'success');
        close();
        recarregar();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ─── Modal: Criar / Editar Regra de Recorrência ─────────────────────────────

  function showModalRegra(rec = null) {
    const isEdit = !!rec;

    document.getElementById('modalContainer').innerHTML = `
      <div class="modal-overlay" id="modalOverlay" style="display:flex">
        <div class="modal">
          <div class="modal-header">
            <h3>${isEdit ? 'Editar Recorrência' : 'Nova Recorrência'}</h3>
            <button id="closeModal" style="font-size:1.5rem;color:var(--text-muted);background:none;border:none;cursor:pointer">✕</button>
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
              <div class="form-group">
                <label>Observação</label>
                <textarea class="form-input" id="observacao" rows="3">${rec?.observacao || ''}</textarea>
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
          observacao: document.getElementById('observacao').value,
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
        recarregar();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ─── Event Listeners principais ─────────────────────────────────────────────

  document.getElementById('btnNovaRecorrencia').addEventListener('click', () => showModalRegra());
  document.getElementById('filterTipo').addEventListener('change', recarregar);

  document.getElementById('btnMesAnterior').addEventListener('click', () => {
    currentMes--;
    if (currentMes < 1) { currentMes = 12; currentAno--; }
    atualizarLabelMes();
    recarregar();
  });

  document.getElementById('btnMesProximo').addEventListener('click', () => {
    currentMes++;
    if (currentMes > 12) { currentMes = 1; currentAno++; }
    atualizarLabelMes();
    recarregar();
  });

  document.getElementById('btnGerarMensal').addEventListener('click', async () => {
    if (!confirm(`Deseja gerar os lançamentos fixos de ${getMesNome(currentMes)}/${currentAno}? O sistema ignorará os que já foram gerados.`)) return;
    try {
      const res = await api.gerarRecorrenciasMensal(currentMes, currentAno);
      toast(res.message, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  // ─── Init ────────────────────────────────────────────────────────────────────

  atualizarLabelMes();
  await loadCategorias();
  await recarregar();
}
