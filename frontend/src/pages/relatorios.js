import { api } from '../services/api.js';
import { formatCurrency } from '../services/utils.js';

export async function renderRelatorios(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Relatórios & Projeções</h1>
        <p class="page-subtitle">Análise financeira de médio e longo prazo</p>
      </div>
    </div>

    <div class="two-col" style="margin-top:1.5rem">
      <div class="card">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Comparativo: Últimos 6 Meses</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem">Compara o total de Entradas e Saídas efetivadas no caixa ao longo dos últimos meses.</p>
        <div style="height:350px;position:relative"><canvas id="chartComparativo"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem">Projeção: Próximos 6 Meses</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem">Baseado no seu Saldo Atual, Recorrências Ativas e Contas Pendentes/A Receber futuras.</p>
        <div style="height:350px;position:relative"><canvas id="chartProjecao"></canvas></div>
      </div>
    </div>
  `;

  let chartComparativo = null;
  let chartProjecao = null;

  async function loadData() {
    try {
      const [comparativoRes, projecaoRes] = await Promise.all([
        api.relatorioComparativo(),
        api.relatorioProjecao()
      ]);

      const dataComp = comparativoRes.comparativo || [];
      const dataProj = projecaoRes.projecao || [];

      if (chartComparativo) chartComparativo.destroy();
      if (chartProjecao) chartProjecao.destroy();

      const ctxComp = document.getElementById('chartComparativo').getContext('2d');
      chartComparativo = new Chart(ctxComp, {
        type: 'bar',
        data: {
          labels: dataComp.map(d => d.mes),
          datasets: [
            { label: 'Entradas', data: dataComp.map(d => d.entradas), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Saídas', data: dataComp.map(d => d.saidas), backgroundColor: '#ef4444', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } }
        }
      });

      const ctxProj = document.getElementById('chartProjecao').getContext('2d');
      chartProjecao = new Chart(ctxProj, {
        type: 'line',
        data: {
          labels: dataProj.map(d => d.mes),
          datasets: [
            {
              label: 'Saldo Projetado',
              data: dataProj.map(d => d.saldoProjetado),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              tension: 0.3,
              pointBackgroundColor: '#3b82f6',
              borderWidth: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return 'Saldo Projetado: ' + formatCurrency(context.raw);
                }
              }
            }
          },
          scales: {
            y: {
              ticks: {
                callback: function(value) {
                  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
                }
              }
            }
          }
        }
      });

    } catch (e) {
      console.error(e);
    }
  }

  loadData();
}
