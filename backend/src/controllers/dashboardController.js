const pool = require('../database/connection');

const dashboardController = {
  async resumo(req, res) {
    try {
      const { mes, ano } = req.query;
      const m = mes || new Date().getMonth() + 1;
      const a = ano || new Date().getFullYear();

      const [pagar, receber, movEntradas, movSaidas] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(valor),0) as total, COUNT(*) as qtd,
          COALESCE(SUM(CASE WHEN status='PAGO' THEN valor ELSE 0 END),0) as total_pago,
          COALESCE(SUM(CASE WHEN status='PENDENTE' THEN valor ELSE 0 END),0) as total_pendente
          FROM contas_pagar WHERE usuario_id=$1 AND EXTRACT(MONTH FROM data_vencimento)=$2 AND EXTRACT(YEAR FROM data_vencimento)=$3`,
          [req.userId, m, a]),
        pool.query(`SELECT COALESCE(SUM(valor),0) as total, COUNT(*) as qtd,
          COALESCE(SUM(CASE WHEN status='RECEBIDO' THEN valor ELSE 0 END),0) as total_recebido,
          COALESCE(SUM(CASE WHEN status='A_RECEBER' THEN valor ELSE 0 END),0) as total_a_receber
          FROM contas_receber WHERE usuario_id=$1 AND EXTRACT(MONTH FROM data_vencimento)=$2 AND EXTRACT(YEAR FROM data_vencimento)=$3`,
          [req.userId, m, a]),
        pool.query(`SELECT COALESCE(SUM(valor),0) as total FROM movimentacoes
          WHERE usuario_id=$1 AND tipo='ENTRADA' AND EXTRACT(MONTH FROM data_movimentacao)=$2 AND EXTRACT(YEAR FROM data_movimentacao)=$3`,
          [req.userId, m, a]),
        pool.query(`SELECT COALESCE(SUM(valor),0) as total FROM movimentacoes
          WHERE usuario_id=$1 AND tipo='SAIDA' AND EXTRACT(MONTH FROM data_movimentacao)=$2 AND EXTRACT(YEAR FROM data_movimentacao)=$3`,
          [req.userId, m, a]),
      ]);

      const entradas = parseFloat(movEntradas.rows[0].total);
      const saidas = parseFloat(movSaidas.rows[0].total);

      res.json({
        mes: parseInt(m), ano: parseInt(a),
        contas_pagar: { ...pagar.rows[0], total: parseFloat(pagar.rows[0].total), total_pago: parseFloat(pagar.rows[0].total_pago), total_pendente: parseFloat(pagar.rows[0].total_pendente) },
        contas_receber: { ...receber.rows[0], total: parseFloat(receber.rows[0].total), total_recebido: parseFloat(receber.rows[0].total_recebido), total_a_receber: parseFloat(receber.rows[0].total_a_receber) },
        caixa: { entradas, saidas, saldo: entradas - saidas },
      });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },

  async caixaPorOrigem(req, res) {
    try {
      const { mes, ano } = req.query;
      const m = mes || new Date().getMonth() + 1;
      const a = ano || new Date().getFullYear();

      const result = await pool.query(`
        SELECT origem, tipo, COALESCE(SUM(valor),0) as total
        FROM movimentacoes WHERE usuario_id=$1
        AND EXTRACT(MONTH FROM data_movimentacao)=$2 AND EXTRACT(YEAR FROM data_movimentacao)=$3
        GROUP BY origem, tipo ORDER BY origem, tipo`, [req.userId, m, a]);

      const resumo = { PF: { entradas: 0, saidas: 0, saldo: 0 }, PJ: { entradas: 0, saidas: 0, saldo: 0 } };
      result.rows.forEach(r => {
        const v = parseFloat(r.total);
        if (r.tipo === 'ENTRADA') resumo[r.origem].entradas = v;
        else resumo[r.origem].saidas = v;
        resumo[r.origem].saldo = resumo[r.origem].entradas - resumo[r.origem].saidas;
      });
      res.json({ mes: parseInt(m), ano: parseInt(a), resumo });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },
};

module.exports = dashboardController;
