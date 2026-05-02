const pool = require('../database/connection');

const relatoriosController = {
  async comparativo(req, res) {
    try {
      const result = await pool.query(`
        WITH meses AS (
          SELECT
            generate_series(
              date_trunc('month', current_date - interval '5 months'),
              date_trunc('month', current_date),
              '1 month'
            )::date AS mes_data
        )
        SELECT 
          m.mes_data,
          COALESCE(SUM(CASE WHEN mov.tipo = 'ENTRADA' THEN mov.valor ELSE 0 END), 0) as entradas,
          COALESCE(SUM(CASE WHEN mov.tipo = 'SAIDA' THEN mov.valor ELSE 0 END), 0) as saidas
        FROM meses m
        LEFT JOIN movimentacoes mov 
          ON mov.usuario_id = $1 
          AND date_trunc('month', mov.data_movimentacao) = m.mes_data
        GROUP BY m.mes_data
        ORDER BY m.mes_data ASC
      `, [req.userId]);

      const formatado = result.rows.map(r => {
        const d = new Date(r.mes_data);
        const nomeMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][d.getUTCMonth()];
        return {
          mes: `${nomeMes}/${d.getUTCFullYear()}`,
          entradas: parseFloat(r.entradas),
          saidas: parseFloat(r.saidas)
        };
      });

      res.json({ comparativo: formatado });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao gerar comparativo' });
    }
  },

  async projecao(req, res) {
    try {
      // 1. Saldo atual
      const saldoQuery = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN valor ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN valor ELSE 0 END), 0) as saldo_atual
        FROM movimentacoes
        WHERE usuario_id = $1
      `, [req.userId]);
      let saldoAcumulado = parseFloat(saldoQuery.rows[0].saldo_atual);

      // 2. Recorrências ativas
      const recQuery = await pool.query('SELECT tipo, valor FROM recorrencias WHERE usuario_id = $1 AND ativo = true', [req.userId]);
      const recPagar = recQuery.rows.filter(r => r.tipo === 'PAGAR').reduce((acc, r) => acc + parseFloat(r.valor), 0);
      const recReceber = recQuery.rows.filter(r => r.tipo === 'RECEBER').reduce((acc, r) => acc + parseFloat(r.valor), 0);

      // 3. Projeção para os próximos 6 meses
      const projecao = [];
      const dataAtual = new Date();
      let m = dataAtual.getMonth() + 1; // Próximo mês
      let a = dataAtual.getFullYear();

      for (let i = 1; i <= 6; i++) {
        m++;
        if (m > 12) { m = 1; a++; }

        // Busca contas avulsas do mês futuro
        const pagarMes = await pool.query(`
          SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar 
          WHERE usuario_id = $1 AND status = 'PENDENTE' AND EXTRACT(MONTH FROM data_vencimento) = $2 AND EXTRACT(YEAR FROM data_vencimento) = $3 AND recorrencia_id IS NULL
        `, [req.userId, m, a]);

        const receberMes = await pool.query(`
          SELECT COALESCE(SUM(valor), 0) as total FROM contas_receber 
          WHERE usuario_id = $1 AND status = 'A_RECEBER' AND EXTRACT(MONTH FROM data_vencimento) = $2 AND EXTRACT(YEAR FROM data_vencimento) = $3 AND recorrencia_id IS NULL
        `, [req.userId, m, a]);

        const despesasPrevistas = parseFloat(pagarMes.rows[0].total) + recPagar;
        const receitasPrevistas = parseFloat(receberMes.rows[0].total) + recReceber;
        
        saldoAcumulado = saldoAcumulado + receitasPrevistas - despesasPrevistas;

        const nomeMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][m - 1];
        projecao.push({
          mes: `${nomeMes}/${a}`,
          receitasPrevistas,
          despesasPrevistas,
          saldoProjetado: saldoAcumulado
        });
      }

      res.json({ projecao });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao gerar projeção' });
    }
  }
};

module.exports = relatoriosController;
