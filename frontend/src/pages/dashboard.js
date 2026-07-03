import { api } from '../services/api.js';
import { formatCurrency, getMesNome } from '../services/utils.js';

export async function renderDashboard(container) {
  const now = new Date();
  let mes = now.getMonth() + 1;
  let ano = now.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Visão geral do seu fluxo de caixa</p>
      </div>
      <div class="month-nav">
        <button id="prevMonth">◀</button>
        <span class="current-month" id="currentMonth"></span>
        <button id="nextMonth">▶</button>
      </div>
    </div>
    <div class="stats-grid" id="statsGrid">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
    <div class="card" id="pagamentosFinanceiros" style="margin-top:1.5rem">
      <div class="loading-overlay"><div class="spinner"></div></div>
    </div>
    <div class="two-col" style="margin-top:1.5rem">
      <div class="card" id="caixaPFPJ">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Caixa por Origem</h3>
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
      <div class="card" id="resumoContas">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Resumo de Contas</h3>
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>
    </div>
    
    <div class="two-col" style="margin-top:1.5rem">
      <div class="card">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Evolução do Caixa (Mês Atual)</h3>
        <div style="height:300px;position:relative"><canvas id="chartEvolucao"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Despesas por Categoria</h3>
        <div style="height:300px;position:relative;display:flex;justify-content:center"><canvas id="chartCategorias"></canvas></div>
      </div>
    </div>
  `;

  let chartLineInstance = null;
  let chartPieInstance = null;

  async function loadData() {
    document.getElementById('currentMonth').textContent = `${getMesNome(mes)} ${ano}`;

    try {
      const [resumo, caixa, graficos, contasCorrentes] = await Promise.all([
        api.resumo(mes, ano),
        api.caixaOrigem(mes, ano),
        api.graficos(mes, ano),
        api.contasCorrentes()
      ]);

      const saldo = resumo.caixa.saldo;
      const saldoClass = saldo >= 0 ? 'positive' : 'negative';

      document.getElementById('statsGrid').innerHTML = `
        <div class="card stat-card income">
          <div class="stat-label">Total a Receber</div>
          <div class="stat-value positive">${formatCurrency(resumo.contas_receber.total)}</div>
          <div class="stat-detail">${resumo.contas_receber.qtd} contas • ${formatCurrency(resumo.contas_receber.total_recebido)} recebido</div>
        </div>
        <div class="card stat-card expense">
          <div class="stat-label">Total a Pagar</div>
          <div class="stat-value negative">${formatCurrency(resumo.contas_pagar.total)}</div>
          <div class="stat-detail">${resumo.contas_pagar.qtd} contas • ${formatCurrency(resumo.contas_pagar.total_pago)} pago</div>
        </div>
        <div class="card stat-card balance">
          <div class="stat-label">Saldo do Caixa</div>
          <div class="stat-value ${saldoClass}">${formatCurrency(saldo)}</div>
          <div class="stat-detail">Entradas: ${formatCurrency(resumo.caixa.entradas)}</div>
        </div>
        <div class="card stat-card pending">
          <div class="stat-label">Pendente (Pagar)</div>
          <div class="stat-value" style="color:var(--warning)">${formatCurrency(resumo.contas_pagar.total_pendente)}</div>
          <div class="stat-detail">A receber: ${formatCurrency(resumo.contas_receber.total_a_receber)}</div>
        </div>
      `;

      const pagamentos = resumo.pagamentos || {
        conta_corrente: { total: 0, qtd: 0 },
        cartoes: [],
        total_cartoes: 0,
        faturas_pagas: 0,
      };
      document.getElementById('pagamentosFinanceiros').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
          <div>
            <h3 style="font-size:1rem;font-weight:600;margin:0 0 0.25rem">Pagamentos e compromissos do mês</h3>
            <p style="font-size:0.8rem;color:var(--text-muted);margin:0">Baixas imediatas afetam o caixa; cartão é lançado na fatura correspondente.</p>
          </div>
          <span class="badge badge-info">${getMesNome(mes)} ${ano}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem;margin-bottom:1rem">
          <div style="padding:0.9rem;border-radius:0.65rem;background:var(--bg-glass)">
            <div style="font-size:0.75rem;color:var(--text-muted)">Pagamentos imediatos</div>
            <strong style="display:block;font-size:1.15rem;color:var(--danger);margin-top:0.25rem">${formatCurrency(pagamentos.conta_corrente.total)}</strong>
            <small style="color:var(--text-muted)">${pagamentos.conta_corrente.qtd} contas por PIX, débito, dinheiro ou transferência</small>
          </div>
          <div style="padding:0.9rem;border-radius:0.65rem;background:var(--bg-glass)">
            <div style="font-size:0.75rem;color:var(--text-muted)">Comprometido nos cartões</div>
            <strong style="display:block;font-size:1.15rem;color:var(--warning);margin-top:0.25rem">${formatCurrency(pagamentos.total_cartoes)}</strong>
            <small style="color:var(--text-muted)">Será pago nas faturas indicadas abaixo</small>
          </div>
          <div style="padding:0.9rem;border-radius:0.65rem;background:var(--bg-glass)">
            <div style="font-size:0.75rem;color:var(--text-muted)">Faturas pagas pelo caixa</div>
            <strong style="display:block;font-size:1.15rem;color:var(--danger);margin-top:0.25rem">${formatCurrency(pagamentos.faturas_pagas)}</strong>
            <small style="color:var(--text-muted)">Saída efetiva para pagamento de cartões</small>
          </div>
          <div style="padding:0.9rem;border-radius:0.65rem;background:var(--bg-glass)">
            <div style="font-size:0.75rem;color:var(--text-muted)">Total de saídas reais</div>
            <strong style="display:block;font-size:1.15rem;color:var(--danger);margin-top:0.25rem">${formatCurrency(resumo.caixa.saidas)}</strong>
            <small style="color:var(--text-muted)">Movimentações que efetivamente reduziram o caixa</small>
          </div>
        </div>
        <div>
          <h4 style="font-size:0.88rem;font-weight:600;margin:0 0 0.65rem">Compras no crédito por cartão e fatura</h4>
          ${pagamentos.cartoes.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.65rem">
              ${pagamentos.cartoes.map((item) => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0.75rem;border:1px solid var(--border-color);border-radius:0.6rem">
                  <div>
                    <strong style="font-size:0.88rem">${item.cartao_nome}</strong>
                    <div style="font-size:0.75rem;color:var(--text-muted)">Fatura ${getMesNome(item.mes_referencia)}/${item.ano_referencia} • ${item.quantidade} lançamentos</div>
                  </div>
                  <strong style="color:var(--warning);white-space:nowrap">${formatCurrency(item.total)}</strong>
                </div>
              `).join('')}
            </div>
          ` : '<div style="font-size:0.82rem;color:var(--text-muted);padding:0.75rem;background:var(--bg-glass);border-radius:0.5rem">Nenhum pagamento com cartão registrado neste mês.</div>'}
        </div>
      `;

      // Caixa PF/PJ
      const r = caixa.resumo;
      const saldoTotalContas = contasCorrentes.contas.reduce((total, conta) => total + conta.saldo, 0);
      document.getElementById('caixaPFPJ').innerHTML = `
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">💼 Caixa por Origem</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
          <div style="padding:1rem;border-radius:0.75rem;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15)">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem"><span class="badge badge-pf">PF</span> Pessoa Física</div>
            <div style="font-size:0.85rem;color:var(--success)">+ ${formatCurrency(r.PF.entradas)}</div>
            <div style="font-size:0.85rem;color:var(--danger)">- ${formatCurrency(r.PF.saidas)}</div>
            <div style="font-size:1.1rem;font-weight:700;margin-top:0.5rem;color:${r.PF.saldo >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(r.PF.saldo)}</div>
          </div>
          <div style="padding:1rem;border-radius:0.75rem;background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15)">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem"><span class="badge badge-pj">PJ</span> Pessoa Jurídica</div>
            <div style="font-size:0.85rem;color:var(--success)">+ ${formatCurrency(r.PJ.entradas)}</div>
            <div style="font-size:0.85rem;color:var(--danger)">- ${formatCurrency(r.PJ.saidas)}</div>
            <div style="font-size:1.1rem;font-weight:700;margin-top:0.5rem;color:${r.PJ.saldo >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(r.PJ.saldo)}</div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border-color);padding-top:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
            <h4 style="font-size:0.9rem;font-weight:600;margin:0">Contas Correntes</h4>
            <strong style="color:${saldoTotalContas >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(saldoTotalContas)}</strong>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            ${contasCorrentes.contas.map(conta => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.65rem 0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
                <span style="font-size:0.85rem;color:var(--text-secondary)">${conta.nome}</span>
                <span style="display:flex;align-items:center;gap:0.5rem">
                  <span style="font-weight:700;color:${conta.saldo >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(conta.saldo)}</span>
                  <button class="btn btn-sm btn-secondary" data-editar-conta="${conta.id}" data-saldo="${conta.saldo_inicial}" data-nome="${conta.nome}" title="Editar saldo inicial">✎</button>
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.querySelectorAll('[data-editar-conta]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const valor = prompt(`Saldo inicial de ${btn.dataset.nome}:`, btn.dataset.saldo || '0');
          if (valor === null) return;
          const saldo = parseFloat(valor.replace(',', '.'));
          if (Number.isNaN(saldo)) return;

          try {
            await api.atualizarContaCorrente(btn.dataset.editarConta, { saldo_inicial: saldo });
            loadData();
          } catch (err) {
            alert(err.message);
          }
        });
      });

      // Resumo contas
      document.getElementById('resumoContas').innerHTML = `
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">📋 Resumo de Contas</h3>
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
            <span style="font-size:0.85rem;color:var(--text-secondary)">A Pagar (pendente)</span>
            <span style="font-weight:600;color:var(--warning)">${formatCurrency(resumo.contas_pagar.total_pendente)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
            <span style="font-size:0.85rem;color:var(--text-secondary)">Já Pago</span>
            <span style="font-weight:600;color:var(--danger)">${formatCurrency(resumo.contas_pagar.total_pago)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
            <span style="font-size:0.85rem;color:var(--text-secondary)">A Receber</span>
            <span style="font-weight:600;color:var(--info)">${formatCurrency(resumo.contas_receber.total_a_receber)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-radius:0.5rem;background:var(--bg-glass)">
            <span style="font-size:0.85rem;color:var(--text-secondary)">Já Recebido</span>
            <span style="font-weight:600;color:var(--success)">${formatCurrency(resumo.contas_receber.total_recebido)}</span>
          </div>
        </div>
      `;

      const ctxLine = document.getElementById('chartEvolucao').getContext('2d');
      const existingLine = Chart.getChart(ctxLine.canvas);
      if (existingLine) existingLine.destroy();
      if (chartLineInstance) chartLineInstance.destroy();
      chartLineInstance = new Chart(ctxLine, {
        type: 'bar',
        data: {
          labels: graficos.evolucaoDiaria.map(d => `Dia ${d.dia}`),
          datasets: [
            { label: 'Entradas', data: graficos.evolucaoDiaria.map(d => d.entradas), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Saídas', data: graficos.evolucaoDiaria.map(d => d.saidas), backgroundColor: '#ef4444', borderRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
      });

      const ctxPie = document.getElementById('chartCategorias').getContext('2d');
      const existingPie = Chart.getChart(ctxPie.canvas);
      if (existingPie) existingPie.destroy();
      if (chartPieInstance) chartPieInstance.destroy();
      const hasCatData = graficos.despesasPorCategoria.length > 0;
      chartPieInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: hasCatData ? graficos.despesasPorCategoria.map(c => c.nome) : ['Nenhuma Despesa'],
          datasets: [{
            data: hasCatData ? graficos.despesasPorCategoria.map(c => c.total) : [1],
            backgroundColor: hasCatData ? graficos.despesasPorCategoria.map(c => c.cor || '#cbd5e1') : ['#e2e8f0'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
      });

    } catch (err) {
      document.getElementById('statsGrid').innerHTML = `<div class="empty-state"><p>Erro ao carregar dados: ${err.message}</p></div>`;
    }
  }

  document.getElementById('prevMonth').addEventListener('click', () => {
    mes--; if (mes < 1) { mes = 12; ano--; }
    loadData();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    mes++; if (mes > 12) { mes = 1; ano++; }
    loadData();
  });

  loadData();
}
