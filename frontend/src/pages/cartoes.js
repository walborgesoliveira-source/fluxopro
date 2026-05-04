import { api } from '../services/api.js';
import { formatCurrency, formatDate } from '../services/utils.js';
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
        <button class="btn btn-primary" id="btnLancarCompra">+ Lançar Compra</button>
      </div>
    </div>

    <!-- Lista de Cartões -->
    <div class="cards-grid" id="cartoesContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <!-- Preenchido via JS -->
    </div>

    <!-- Lista de Faturas -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
        <h3 class="card-title">Faturas</h3>
        <select id="filtroCartaoFatura" class="form-control" style="width: auto;"></select>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Mês/Ano</th>
              <th>Cartão</th>
              <th>Valor Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="faturasTableBody">
            <!-- Preenchido via JS -->
          </tbody>
        </table>
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
                    <th>Data Venc.</th>
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
  const faturasTableBody = document.getElementById('faturasTableBody');
  const filtroCartaoFatura = document.getElementById('filtroCartaoFatura');
  
  // Modais
  const overlayNovoCartao = document.getElementById('overlayNovoCartao');
  const formNovoCartao = document.getElementById('formNovoCartao');
  document.getElementById('btnNovoCartao').addEventListener('click', () => overlayNovoCartao.style.display = 'flex');
  document.getElementById('fecharNovoCartao').addEventListener('click', () => overlayNovoCartao.style.display = 'none');

  const overlayLancarCompra = document.getElementById('overlayLancarCompra');
  const formLancarCompra = document.getElementById('formLancarCompra');
  document.getElementById('btnLancarCompra').addEventListener('click', () => {
    document.getElementById('compraData').valueAsDate = new Date();
    overlayLancarCompra.style.display = 'flex';
  });
  document.getElementById('fecharLancarCompra').addEventListener('click', () => overlayLancarCompra.style.display = 'none');

  const overlayFatura = document.getElementById('overlayFatura');
  document.getElementById('fecharFatura').addEventListener('click', () => overlayFatura.style.display = 'none');
  document.getElementById('btnFecharFaturaRodape').addEventListener('click', () => overlayFatura.style.display = 'none');

  // Fechar ao clicar fora do modal (no fundo escuro)
  [overlayNovoCartao, overlayLancarCompra, overlayFatura].forEach(overlay => {
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) overlay.style.display = 'none';
      });
    }
  });

  // Estado
  let cartoes = [];
  let categorias = [];

  // Carregar dados
  async function loadData() {
    try {
      const [resCartoes, resFaturas, resCat] = await Promise.all([
        api.listarCartoes(),
        api.listarFaturas(filtroCartaoFatura.value),
        api.listarCategorias('DESPESA')
      ]);

      cartoes = resCartoes.cartoes;
      categorias = resCat.categorias;
      renderCartoesList(cartoes);
      renderFaturas(resFaturas.faturas);
      populateSelects();
    } catch (e) {
      toast('Erro ao carregar dados dos cartões.', 'error');
    }
  }

  filtroCartaoFatura.addEventListener('change', async () => {
    try {
      const res = await api.listarFaturas(filtroCartaoFatura.value);
      renderFaturas(res.faturas);
    } catch (e) {}
  });

  function populateSelects() {
    const compraCartao = document.getElementById('compraCartao');
    const comboFiltro = document.getElementById('filtroCartaoFatura');
    const comboCat = document.getElementById('compraCategoria');

    // Cartoes no Lancar Compra
    compraCartao.innerHTML = cartoes.map(c => `<option value="${c.id}">${c.nome} (Venc: dia ${c.dia_vencimento})</option>`).join('');
    
    // Cartoes no Filtro de faturas
    const currentFiltro = comboFiltro.value;
    comboFiltro.innerHTML = '<option value="">Todos os Cartões</option>' + cartoes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    comboFiltro.value = currentFiltro; // mantem selecao

    // Categorias
    comboCat.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  }

  function renderCartoesList(lista) {
    if (lista.length === 0) {
      cartoesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 2rem;">Nenhum cartão cadastrado.</div>';
      return;
    }

    cartoesContainer.innerHTML = lista.map(c => {
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
          <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 0.25rem;">Limite Total</div>
          <div style="font-size: 1.5rem; font-weight: 700;">${formatCurrency(c.limite)}</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; opacity: 0.9; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 1rem;">
          <div>Fechamento: Dia ${c.dia_fechamento}</div>
          <div>Vencimento: Dia ${c.dia_vencimento}</div>
        </div>
        
        <button class="btn-delete-cartao" data-id="${c.id}" style="position: absolute; top: 1rem; right: 1rem; background: rgba(0,0,0,0.2); border: none; color: white; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Excluir Cartão">✕</button>
      </div>
    `}).join('');

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
  }

  function renderFaturas(faturas) {
    if (faturas.length === 0) {
      faturasTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma fatura encontrada.</td></tr>';
      return;
    }

    faturasTableBody.innerHTML = faturas.map(f => {
      let badgeColor = 'var(--text-secondary)';
      if (f.status === 'ABERTA') badgeColor = 'var(--primary-color)';
      if (f.status === 'FECHADA') badgeColor = 'var(--warning-color)';
      if (f.status === 'PAGA') badgeColor = 'var(--success-color)';

      return `
        <tr>
          <td style="font-weight:600">${String(f.mes_referencia).padStart(2, '0')}/${f.ano_referencia}</td>
          <td>${f.cartao_nome}</td>
          <td style="font-weight:700">${formatCurrency(f.valor_total)}</td>
          <td>
            <span class="status-badge" style="background: ${badgeColor}20; color: ${badgeColor}; padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">
              ${f.status}
            </span>
            <button class="btn btn-sm btn-secondary btn-ver-fatura" onclick="window.abrirFaturaDetalhes('${f.id}')" style="margin-left: 0.5rem; position: relative; z-index: 9999; cursor: pointer;">Ver Lançamentos</button>
          </td>
        </tr>
      `;
    }).join('');
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
        <td>${formatDate(c.data_vencimento)}</td>
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
