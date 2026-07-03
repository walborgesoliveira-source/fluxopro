import { api } from '../services/api.js';
import { formatCurrency, formatDate, getMesNome } from '../services/utils.js';
import { toast } from '../components/toast.js';

export async function renderCartoes(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Cartões de Crédito</h1>
        <p class="page-subtitle" style="color:var(--text-secondary)">Gerencie seus cartões e faturas mensais</p>
      </div>
      <div style="display:flex;gap:1rem;">
        <button class="btn btn-secondary" id="btnNovoCartao">+ Novo Cartão</button>
      </div>
    </div>

    <!-- Lista de Cartões -->
    <div class="cards-grid" id="cartoesContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <!-- Preenchido via JS -->
    </div>

    <!-- Saldo dos Cartões -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3 class="card-title">Saldo do Cartão</h3>
        <select id="filtroCartaoFatura" class="form-control" style="width: auto;"></select>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Cartão</th>
              <th>Limite Total</th>
              <th>Total Lançado</th>
              <th>Valor Pago</th>
              <th>Saldo Atual</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="saldoCartoesTableBody">
            <!-- Preenchido via JS -->
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:1.5rem">
      <div style="margin-bottom:1rem">
        <h3 class="card-title" style="margin-bottom:0.25rem">Relatório de Faturas</h3>
        <p style="font-size:0.8rem;color:var(--text-muted);margin:0">Faturas agrupadas por cartão e competência, com os pagamentos que compõem cada total.</p>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Cartão</th>
              <th>Competência</th>
              <th>Lançamentos</th>
              <th>Total da fatura</th>
              <th>Valor pago</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="relatorioFaturasBody"></tbody>
        </table>
      </div>
    </div>

    <!-- MODAL: Editar Cartão -->
    <div class="modal-overlay" id="overlayEditarCartao" style="display: none;">
      <div class="modal">
        <div class="modal-content" style="max-width: 500px">
          <div class="modal-header">
            <h2 class="modal-title">Editar Cartão</h2>
            <button class="modal-close" id="fecharEditarCartao">&times;</button>
          </div>
          <div class="modal-body">
            <form id="formEditarCartao">
              <input type="hidden" id="editCartaoId">
              <div class="form-group">
                <label class="form-label">Nome do Cartão</label>
                <input type="text" id="editCartaoNome" class="form-control" required>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Bandeira</label>
                  <select id="editCartaoBandeira" class="form-control">
                    <option value="Mastercard">Mastercard</option>
                    <option value="Visa">Visa</option>
                    <option value="Elo">Elo</option>
                    <option value="American Express">American Express</option>
                    <option value="Outra">Outra</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Limite Total (R$)</label>
                  <input type="number" id="editCartaoLimite" class="form-control" step="0.01" min="0">
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Dia Fechamento</label>
                  <input type="number" id="editCartaoFechamento" class="form-control" min="1" max="31" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Dia Vencimento</label>
                  <input type="number" id="editCartaoVencimento" class="form-control" min="1" max="31" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Melhor Dia Compra</label>
                  <input type="number" id="editCartaoMelhorDia" class="form-control" min="1" max="31" placeholder="Ex: 27">
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem;">Salvar Alterações</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: Novo Cartão -->
    <div class="modal-overlay" id="overlayNovoCartao" style="display: none;">
      <div class="modal">
        <div class="modal-content" style="max-width: 500px">
          <div class="modal-header">
            <h2 class="modal-title">Novo Cartão</h2>
            <button class="modal-close" id="fecharNovoCartao">&times;</button>
          </div>
          <div class="modal-body">
            <form id="formNovoCartao">
              <div class="form-group">
                <label class="form-label">Nome do Cartão (Apelido)</label>
                <input type="text" id="cartaoNome" class="form-control" required placeholder="Ex: Nubank, Itaú">
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Bandeira</label>
                  <select id="cartaoBandeira" class="form-control">
                    <option value="Mastercard">Mastercard</option>
                    <option value="Visa">Visa</option>
                    <option value="Elo">Elo</option>
                    <option value="American Express">American Express</option>
                    <option value="Outra">Outra</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Limite Total (R$)</label>
                  <input type="number" id="cartaoLimite" class="form-control" step="0.01" min="0">
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Dia de Fechamento</label>
                  <input type="number" id="cartaoFechamento" class="form-control" min="1" max="31" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Dia de Vencimento</label>
                  <input type="number" id="cartaoVencimento" class="form-control" min="1" max="31" required>
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem;">Salvar Cartão</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: Lançar Compra -->
    <div class="modal-overlay" id="overlayLancarCompra" style="display: none;">
      <div class="modal">
        <div class="modal-content" style="max-width: 500px">
          <div class="modal-header">
            <h2 class="modal-title">Lançar Compra no Cartão</h2>
            <button class="modal-close" id="fecharLancarCompra">&times;</button>
          </div>
          <div class="modal-body">
            <form id="formLancarCompra">
              <div class="form-group">
                <label class="form-label">Cartão</label>
                <select id="compraCartao" class="form-control" required></select>
              </div>
              <div class="form-group">
                <label class="form-label">Descrição da Compra</label>
                <input type="text" id="compraDescricao" class="form-control" required>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Valor Total (R$)</label>
                  <input type="number" id="compraValor" class="form-control" step="0.01" min="0.01" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Nº Parcelas</label>
                  <input type="number" id="compraParcelas" class="form-control" value="1" min="1" required>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                  <label class="form-label">Data da Compra</label>
                  <input type="date" id="compraData" class="form-control" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Categoria</label>
                  <select id="compraCategoria" class="form-control" required></select>
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem;">Registrar Compra</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: Detalhes da Fatura -->
    <div class="modal-overlay" id="overlayFatura" style="display: none;">
      <div class="modal">
        <div class="modal-content" style="max-width: 800px">
          <div class="modal-header">
            <h2 class="modal-title">Detalhes da Fatura</h2>
            <button class="modal-close" id="fecharFatura">&times;</button>
          </div>
          <div class="modal-body">
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody id="comprasFaturaBody">
                  <!-- Preenchido via JS -->
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btnFecharFaturaRodape">Fechar Lançamentos</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Referências
  const cartoesContainer = document.getElementById('cartoesContainer');
  const saldoCartoesTableBody = document.getElementById('saldoCartoesTableBody');
  const relatorioFaturasBody = document.getElementById('relatorioFaturasBody');
  const filtroCartaoFatura = document.getElementById('filtroCartaoFatura');
  
  // Modais
  const overlayNovoCartao = document.getElementById('overlayNovoCartao');
  const formNovoCartao = document.getElementById('formNovoCartao');
  document.getElementById('btnNovoCartao').addEventListener('click', () => overlayNovoCartao.style.display = 'flex');
  document.getElementById('fecharNovoCartao').addEventListener('click', () => overlayNovoCartao.style.display = 'none');

  const overlayLancarCompra = document.getElementById('overlayLancarCompra');
  const formLancarCompra = document.getElementById('formLancarCompra');
  document.getElementById('fecharLancarCompra').addEventListener('click', () => overlayLancarCompra.style.display = 'none');

  const overlayFatura = document.getElementById('overlayFatura');
  document.getElementById('fecharFatura').addEventListener('click', () => overlayFatura.style.display = 'none');
  document.getElementById('btnFecharFaturaRodape').addEventListener('click', () => overlayFatura.style.display = 'none');

  // Modal Editar Cartão
  const overlayEditarCartao = document.getElementById('overlayEditarCartao');
  document.getElementById('fecharEditarCartao').addEventListener('click', () => overlayEditarCartao.style.display = 'none');

  window.abrirEditarCartao = function(id) {
    const cartao = cartoes.find(c => c.id == id);
    if (!cartao) return;
    document.getElementById('editCartaoId').value = cartao.id;
    document.getElementById('editCartaoNome').value = cartao.nome;
    document.getElementById('editCartaoBandeira').value = cartao.bandeira || 'Mastercard';
    document.getElementById('editCartaoLimite').value = cartao.limite || 0;
    document.getElementById('editCartaoFechamento').value = cartao.dia_fechamento || '';
    document.getElementById('editCartaoVencimento').value = cartao.dia_vencimento || '';
    document.getElementById('editCartaoMelhorDia').value = cartao.melhor_dia_compra || '';
    overlayEditarCartao.style.display = 'flex';
  };

  function abrirLancarCompra(cartaoId = '') {
    document.getElementById('compraData').valueAsDate = new Date();
    document.getElementById('compraCartao').value = cartaoId || document.getElementById('compraCartao').value;
    overlayLancarCompra.style.display = 'flex';
  }

  document.getElementById('formEditarCartao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editCartaoId').value;
    const dados = {
      nome: document.getElementById('editCartaoNome').value,
      bandeira: document.getElementById('editCartaoBandeira').value,
      limite: parseFloat(document.getElementById('editCartaoLimite').value) || 0,
      dia_fechamento: parseInt(document.getElementById('editCartaoFechamento').value),
      dia_vencimento: parseInt(document.getElementById('editCartaoVencimento').value),
      melhor_dia_compra: parseInt(document.getElementById('editCartaoMelhorDia').value) || null,
    };
    try {
      await api.editarCartao(id, dados);
      toast('Cartão atualizado com sucesso!');
      overlayEditarCartao.style.display = 'none';
      loadData();
    } catch(err) { toast(err.message, 'error'); }
  });

  // Fechar ao clicar fora do modal (no fundo escuro)
  [overlayNovoCartao, overlayLancarCompra, overlayFatura, overlayEditarCartao].forEach(overlay => {
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) overlay.style.display = 'none';
      });
    }
  });

  // Estado
  let cartoes = [];
  let categorias = [];
  let faturas = [];
  let contasCorrentes = [];

  // Carregar dados
  async function loadData() {
    try {
      const [resCartoes, resFaturas, resCat, resContasCorrentes] = await Promise.all([
        api.listarCartoes(),
        api.listarFaturas(),
        api.listarCategorias('DESPESA'),
        api.contasCorrentes()
      ]);

      cartoes = resCartoes.cartoes;
      faturas = resFaturas.faturas || [];
      categorias = resCat.categorias;
      contasCorrentes = resContasCorrentes.contas || [];
      renderCartoesList(cartoes);
      populateSelects();
      renderSaldoCartoes();
      renderRelatorioFaturas();
    } catch (e) {
      toast('Erro ao carregar dados dos cartões.', 'error');
    }
  }

  filtroCartaoFatura.addEventListener('change', () => {
    renderSaldoCartoes();
    renderRelatorioFaturas();
  });

  function populateSelects() {
    const compraCartao = document.getElementById('compraCartao');
    const comboFiltro = document.getElementById('filtroCartaoFatura');
    const comboCat = document.getElementById('compraCategoria');

    // Cartoes no Lancar Compra
    if (compraCartao) {
      compraCartao.innerHTML = cartoes.map(c => `<option value="${c.id}">${c.nome} (Venc: dia ${c.dia_vencimento})</option>`).join('');
    }
    
    // Cartoes no Filtro de faturas
    const currentFiltro = comboFiltro.value;
    comboFiltro.innerHTML = '<option value="">Todos os Cartões</option>' + cartoes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    comboFiltro.value = currentFiltro; // mantem selecao

    // Categorias
    if (comboCat) {
      comboCat.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    }
  }

  function dataVencimentoFatura(ano, mes, diaVencimento) {
    if (!diaVencimento) return '-';
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = Math.min(parseInt(diaVencimento, 10), ultimoDia);
    return formatDate(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }

  function contaCorrenteOptions() {
    return contasCorrentes
      .filter((conta) => ['Bradesco', 'Santander', 'Crefisa'].includes(conta.nome))
      .map((conta) => `<option value="${conta.id}">${conta.nome}</option>`)
      .join('');
  }

  function renderCartoesList(lista) {
    if (lista.length === 0) {
      cartoesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 2rem;">Nenhum cartão cadastrado.</div>';
      return;
    }

    cartoesContainer.innerHTML = lista.map(c => {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const faturaMes = faturas.find(f => Number(f.cartao_id) === Number(c.id) && Number(f.mes_referencia) === mesAtual && Number(f.ano_referencia) === anoAtual);
      const valorFaturaMes = parseFloat(faturaMes?.valor_total || 0);
      const valorPagoMes = parseFloat(faturaMes?.valor_pago || 0);
      const saldoAtualMes = Math.max(0, valorFaturaMes - valorPagoMes);
      const totalAbertoCartao = faturas
        .filter(f => Number(f.cartao_id) === Number(c.id))
        .reduce((total, f) => total + Math.max(0, parseFloat(f.valor_total || 0) - parseFloat(f.valor_pago || 0)), 0);
      const saldoDisponivelCartao = Math.max(0, parseFloat(c.limite || 0) - totalAbertoCartao);
      const vencimentoMes = dataVencimentoFatura(anoAtual, mesAtual, c.dia_vencimento);

      // Cores simuladas pela bandeira
      let bg = 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)';
      if (c.bandeira === 'Mastercard') bg = 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)';
      if (c.bandeira === 'Visa') bg = 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)';
      if (c.nome.toLowerCase().includes('nubank')) bg = 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)';

      return `
      <div class="card" style="background: ${bg}; color: white; border: none; position: relative; overflow: hidden; border-radius: 16px;">
        <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin: 0;">${c.nome}</h3>
          <span style="font-weight: 600; opacity: 0.9">${c.bandeira || ''}</span>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.78rem; opacity: 0.78; margin-bottom: 0.2rem;">Limite Total</div>
          <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.9rem;">${formatCurrency(c.limite)}</div>
          <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 0.25rem;">Saldo do Cartão</div>
          <div style="font-size: 1.5rem; font-weight: 700;">${formatCurrency(saldoDisponivelCartao)}</div>
          <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 0.25rem;">Valor da Fatura do Mês - ${getMesNome(mesAtual)} ${anoAtual}</div>
          <div style="font-size: 1.05rem; font-weight: 700;">${formatCurrency(valorFaturaMes)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.85rem;font-size:0.82rem;">
            <div>
              <div style="opacity:0.72;">Valor pago</div>
              <strong>${formatCurrency(valorPagoMes)}</strong>
            </div>
            <div>
              <div style="opacity:0.72;">Vencimento</div>
              <strong>${vencimentoMes}</strong>
            </div>
            <div style="grid-column:1/-1;">
              <div style="opacity:0.72;">Saldo atual</div>
              <strong>${formatCurrency(saldoAtualMes)}</strong>
            </div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; opacity: 0.9; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>Fechamento: Dia ${c.dia_fechamento}</div>
          <div>Vencimento: Dia ${c.dia_vencimento}</div>
          ${c.melhor_dia_compra ? `<div style="width:100%; margin-top:0.25rem;">🛒 Melhor dia de compra: <strong>Dia ${c.melhor_dia_compra}</strong></div>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:1rem;position:relative;z-index:2">
          <button class="btn btn-sm btn-secondary btn-informar-fatura-card" data-id="${c.id}" style="background:rgba(255,255,255,0.16);border-color:rgba(255,255,255,0.2);color:white;">Informar Fatura</button>
          <button class="btn btn-sm btn-success btn-pagar-fatura-card" data-id="${c.id}" ${faturaMes ? '' : 'disabled'} style="opacity:${faturaMes ? '1' : '0.55'};">Informar Pagamento</button>
        </div>
        
        <button class="btn-edit-cartao" data-id="${c.id}" style="position: absolute; top: 1rem; right: 2.5rem; background: rgba(0,0,0,0.2); border: none; color: white; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Editar Cartão">✎</button>
        <button class="btn-delete-cartao" data-id="${c.id}" style="position: absolute; top: 1rem; right: 1rem; background: rgba(0,0,0,0.2); border: none; color: white; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Excluir Cartão">✕</button>
      </div>
    `}).join('');

    // Bind editar cartão
    document.querySelectorAll('.btn-edit-cartao').forEach(btn => {
      btn.addEventListener('click', (e) => {
        window.abrirEditarCartao(e.currentTarget.dataset.id);
      });
    });

    // Binds de exclusao
    document.querySelectorAll('.btn-delete-cartao').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('Tem certeza? Isso excluirá o cartão (as faturas e despesas já geradas serão mantidas em Contas a Pagar).')) {
          try {
            await api.excluirCartao(e.currentTarget.dataset.id);
            toast('Cartão excluído com sucesso!');
            loadData();
          } catch (err) {
            toast(err.message, 'error');
          }
        }
      });
    });

    document.querySelectorAll('.btn-informar-fatura-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cartao = cartoes.find(c => String(c.id) === String(e.currentTarget.dataset.id));
        if (cartao) showFaturaMesModal(cartao);
      });
    });

    document.querySelectorAll('.btn-pagar-fatura-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cartaoId = e.currentTarget.dataset.id;
        const hoje = new Date();
        const fatura = faturas.find(f => Number(f.cartao_id) === Number(cartaoId) && Number(f.mes_referencia) === hoje.getMonth() + 1 && Number(f.ano_referencia) === hoje.getFullYear());
        if (fatura) showPagamentoFaturaModal(fatura);
      });
    });
  }

  function renderSaldoCartoes() {
    const filtro = filtroCartaoFatura.value;
    const lista = filtro ? cartoes.filter(c => String(c.id) === String(filtro)) : cartoes;

    if (lista.length === 0) {
      saldoCartoesTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum cartão encontrado.</td></tr>';
      return;
    }

    saldoCartoesTableBody.innerHTML = lista.map(cartao => {
      const faturasCartao = faturas.filter(f => Number(f.cartao_id) === Number(cartao.id));
      const limite = parseFloat(cartao.limite || 0);
      const totalLancado = faturasCartao.reduce((total, f) => total + parseFloat(f.valor_total || 0), 0);
      const valorPago = faturasCartao.reduce((total, f) => total + parseFloat(f.valor_pago || 0), 0);
      const saldoAtual = Math.max(0, limite - Math.max(0, totalLancado - valorPago));

      return `
        <tr>
          <td style="font-weight:600">${cartao.nome}</td>
          <td style="font-weight:700">${formatCurrency(limite)}</td>
          <td style="font-weight:700;color:var(--warning)">${formatCurrency(totalLancado)}</td>
          <td style="font-weight:700;color:var(--success)">${formatCurrency(valorPago)}</td>
          <td style="font-weight:700;color:${saldoAtual > 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(saldoAtual)}</td>
          <td>
            <button class="btn btn-sm btn-primary btn-informar-fatura" data-id="${cartao.id}">Informar Fatura do Mês</button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-informar-fatura').forEach(btn => {
      btn.addEventListener('click', () => {
        const cartao = cartoes.find(c => String(c.id) === String(btn.dataset.id));
        if (cartao) showFaturaMesModal(cartao);
      });
    });
  }

  function renderRelatorioFaturas() {
    const filtro = filtroCartaoFatura.value;
    const lista = filtro
      ? faturas.filter((fatura) => String(fatura.cartao_id) === String(filtro))
      : faturas;

    if (!lista.length) {
      relatorioFaturasBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma fatura encontrada.</td></tr>';
      return;
    }

    relatorioFaturasBody.innerHTML = lista.map((fatura) => {
      const total = parseFloat(fatura.valor_total || 0);
      const pago = parseFloat(fatura.valor_pago || 0);
      const quantidade = Number(fatura.quantidade_lancamentos || 0);
      return `
        <tr>
          <td><strong>${fatura.cartao_nome}</strong></td>
          <td>${getMesNome(Number(fatura.mes_referencia))}/${fatura.ano_referencia}</td>
          <td>${quantidade}</td>
          <td style="font-weight:700;color:var(--warning)">${formatCurrency(total)}</td>
          <td style="font-weight:700;color:var(--success)">${formatCurrency(pago)}</td>
          <td><span class="badge ${fatura.status === 'PAGA' ? 'badge-success' : 'badge-warning'}">${fatura.status}</span></td>
          <td style="display:flex;gap:0.35rem;flex-wrap:wrap">
            <button class="btn btn-sm btn-secondary btn-detalhar-fatura" data-id="${fatura.id}">Ver lançamentos</button>
            <button class="btn btn-sm btn-success btn-pagar-fatura-relatorio" data-id="${fatura.id}">Pagamento</button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-detalhar-fatura').forEach((btn) => {
      btn.addEventListener('click', () => window.abrirFaturaDetalhes(btn.dataset.id));
    });
    document.querySelectorAll('.btn-pagar-fatura-relatorio').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fatura = faturas.find((item) => String(item.id) === String(btn.dataset.id));
        if (fatura) showPagamentoFaturaModal(fatura);
      });
    });
  }

  function showFaturaMesModal(cartao) {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    const faturaAtual = faturas.find(f => Number(f.cartao_id) === Number(cartao.id) && Number(f.mes_referencia) === mesAtual && Number(f.ano_referencia) === anoAtual);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-content" style="max-width: 460px">
          <div class="modal-header">
            <h2 class="modal-title">Informar Fatura do Mês</h2>
            <button class="modal-close" id="fecharFaturaMes">&times;</button>
          </div>
          <form id="formFaturaMes">
            <div class="modal-body">
              <div style="margin-bottom:1rem">
                <div style="font-size:0.8rem;color:var(--text-muted)">Cartão</div>
                <strong>${cartao.nome}</strong>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div class="form-group">
                  <label class="form-label">Mês</label>
                  <select id="faturaMes" class="form-control" required>
                    ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === mesAtual ? 'selected' : ''}>${getMesNome(i + 1)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Ano</label>
                  <input type="number" id="faturaAno" class="form-control" value="${anoAtual}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Valor da fatura do mês (R$)</label>
                <input type="number" id="faturaValorTotal" class="form-control" step="0.01" min="0" value="${faturaAtual?.valor_total || ''}" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelarFaturaMes">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar Fatura</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('fecharFaturaMes').addEventListener('click', close);
    document.getElementById('cancelarFaturaMes').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.getElementById('formFaturaMes').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.salvarFaturaMes(cartao.id, {
          mes: parseInt(document.getElementById('faturaMes').value, 10),
          ano: parseInt(document.getElementById('faturaAno').value, 10),
          valor_total: parseFloat(document.getElementById('faturaValorTotal').value),
        });
        toast('Fatura do mês salva!', 'success');
        close();
        loadData();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function dateInputValue(dateValue) {
    if (!dateValue) return new Date().toISOString().split('T')[0];
    return String(dateValue).slice(0, 10);
  }

  function showPagamentoFaturaModal(fatura) {
    const valorTotal = parseFloat(fatura.valor_total || 0);
    const valorPago = parseFloat(fatura.valor_pago || 0);
    const saldoAtual = Math.max(0, valorTotal - valorPago);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-content" style="max-width: 460px">
          <div class="modal-header">
            <h2 class="modal-title">Pagamento da Fatura</h2>
            <button class="modal-close" id="fecharPagamentoFatura">&times;</button>
          </div>
          <form id="formPagamentoFatura">
            <div class="modal-body">
              <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem">
                <div>
                  <div style="font-size:0.8rem;color:var(--text-muted)">Cartão</div>
                  <strong>${fatura.cartao_nome}</strong>
                </div>
                <div style="text-align:right">
                  <div style="font-size:0.8rem;color:var(--text-muted)">Fatura</div>
                  <strong>${String(fatura.mes_referencia).padStart(2, '0')}/${fatura.ano_referencia}</strong>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
                <div style="padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
                  <div style="font-size:0.75rem;color:var(--text-muted)">Valor total</div>
                  <strong>${formatCurrency(valorTotal)}</strong>
                </div>
                <div style="padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
                  <div style="font-size:0.75rem;color:var(--text-muted)">Saldo atual</div>
                  <strong>${formatCurrency(saldoAtual)}</strong>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Valor pago (R$)</label>
                <input type="number" id="faturaValorPago" class="form-control" step="0.01" min="0" value="${valorPago || valorTotal}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Pago com a conta corrente</label>
                <select id="faturaContaPagamento" class="form-control" required>
                  <option value="">Selecione</option>
                  ${contaCorrenteOptions()}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Data do pagamento</label>
                <input type="date" id="faturaDataPagamento" class="form-control" value="${dateInputValue(fatura.data_pagamento)}" required>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelarPagamentoFatura">Cancelar</button>
              <button type="submit" class="btn btn-success">Salvar Pagamento</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    document.getElementById('fecharPagamentoFatura').addEventListener('click', close);
    document.getElementById('cancelarPagamentoFatura').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    document.getElementById('formPagamentoFatura').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.atualizarPagamentoFatura(fatura.id, {
          valor_pago: parseFloat(document.getElementById('faturaValorPago').value),
          conta_bancaria_id: document.getElementById('faturaContaPagamento').value,
          data_pagamento: document.getElementById('faturaDataPagamento').value,
        });
        toast('Pagamento da fatura atualizado!', 'success');
        close();
        loadData();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  let faturaAtualId = null;

  window.abrirFaturaDetalhes = async function(id) {
    console.log('Botão clicado! ID da fatura:', id);
    faturaAtualId = id;
    try {
      const res = await api.listarComprasFatura(id);
      console.log('Lançamentos encontrados:', res);
      if(!res.compras) throw new Error('compras não definido no retorno da API');
      renderComprasFatura(res.compras);
      const overlayF = document.getElementById('overlayFatura');
      if(overlayF) {
        overlayF.style.display = 'flex';
        console.log('Modal ativado');
      } else {
        alert('Erro: Modal não encontrado no HTML!');
      }
    } catch (e) {
      console.error('Erro no abrirFaturaDetalhes:', e);
      toast('Erro ao carregar compras: ' + e.message, 'error');
    }
  }

  function renderComprasFatura(compras) {
    const tbody = document.getElementById('comprasFaturaBody');
    if (compras.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum lançamento encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = compras.map(c => `
      <tr>
        <td>${formatDate(c.data_pagamento || c.data_vencimento)}</td>
        <td>${c.descricao}</td>
        <td>${c.categoria_nome || '-'}</td>
        <td style="font-weight:600; color:var(--danger)">${formatCurrency(c.valor)}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-editar-compra" data-id="${c.id}">✎</button>
          <button class="btn btn-sm btn-danger btn-excluir-compra" data-id="${c.id}">✕</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-editar-compra').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const compra = compras.find(x => x.id == id);
        const novoValorStr = prompt('Novo valor (ex: 150.00):', compra.valor);
        if (novoValorStr === null) return;
        const novoValor = parseFloat(novoValorStr.replace(',', '.'));
        if (isNaN(novoValor)) return toast('Valor inválido.', 'error');
        
        const novaDescricao = prompt('Nova descrição:', compra.descricao);
        if (!novaDescricao) return;

        try {
          await api.editarCompraCartao(id, { valor: novoValor, descricao: novaDescricao });
          toast('Lançamento atualizado!');
          abrirFaturaDetalhes(faturaAtualId);
          loadData();
        } catch(e) { toast(e.message, 'error'); }
      });
    });

    document.querySelectorAll('.btn-excluir-compra').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este lançamento da fatura?')) return;
        try {
          await api.excluirCompraCartao(btn.dataset.id);
          toast('Lançamento excluído!');
          abrirFaturaDetalhes(faturaAtualId);
          loadData();
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  }

  // Submit Novo Cartão
  formNovoCartao.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      nome: document.getElementById('cartaoNome').value,
      bandeira: document.getElementById('cartaoBandeira').value,
      limite: parseFloat(document.getElementById('cartaoLimite').value) || 0,
      dia_fechamento: parseInt(document.getElementById('cartaoFechamento').value),
      dia_vencimento: parseInt(document.getElementById('cartaoVencimento').value)
    };

    try {
      await api.criarCartao(dados);
      toast('Cartão salvo!');
      document.getElementById('overlayNovoCartao').style.display = 'none';
      formNovoCartao.reset();
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Submit Lançar Compra
  formLancarCompra.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      cartao_id: document.getElementById('compraCartao').value,
      descricao: document.getElementById('compraDescricao').value,
      valor_total: parseFloat(document.getElementById('compraValor').value),
      parcelas: parseInt(document.getElementById('compraParcelas').value),
      data_compra: document.getElementById('compraData').value,
      categoria_id: document.getElementById('compraCategoria').value,
      origem: 'PF' // Pode adicionar um select depois se necessário
    };

    try {
      await api.adicionarCompra(dados);
      toast('Compra lançada com sucesso!');
      document.getElementById('overlayLancarCompra').style.display = 'none';
      formLancarCompra.reset();
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadData();
}
