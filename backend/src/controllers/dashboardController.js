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

  async graficos(req, res) {
    try {
      const { mes, ano } = req.query;
      const m = mes || new Date().getMonth() + 1;
      const a = ano || new Date().getFullYear();

      // Despesas por Categoria (Pie/Donut)
      const resCategorias = await pool.query(`
        SELECT c.nome, c.cor, COALESCE(SUM(cp.valor), 0) as total
        FROM contas_pagar cp
        JOIN categorias c ON cp.categoria_id = c.id
        WHERE cp.usuario_id = $1 AND EXTRACT(MONTH FROM cp.data_vencimento) = $2 AND EXTRACT(YEAR FROM cp.data_vencimento) = $3
        GROUP BY c.nome, c.cor
        ORDER BY total DESC
      `, [req.userId, m, a]);

      // Evolução Diária do Caixa (Line/Bar)
      const resDiario = await pool.query(`
        SELECT EXTRACT(DAY FROM data_movimentacao) as dia, tipo, COALESCE(SUM(valor),0) as total
        FROM movimentacoes
        WHERE usuario_id = $1 AND EXTRACT(MONTH FROM data_movimentacao) = $2 AND EXTRACT(YEAR FROM data_movimentacao) = $3
        GROUP BY dia, tipo
        ORDER BY dia ASC
      `, [req.userId, m, a]);

      const evolucao = [];
      const diasNoMes = new Date(a, m, 0).getDate();
      for(let i=1; i<=diasNoMes; i++) {
        const entradas = resDiario.rows.find(r => parseInt(r.dia) === i && r.tipo === 'ENTRADA');
        const saidas = resDiario.rows.find(r => parseInt(r.dia) === i && r.tipo === 'SAIDA');
        evolucao.push({
          dia: i,
          entradas: entradas ? parseFloat(entradas.total) : 0,
          saidas: saidas ? parseFloat(saidas.total) : 0
        });
      }

      res.json({
        despesasPorCategoria: resCategorias.rows.map(r => ({ nome: r.nome, cor: r.cor, total: parseFloat(r.total) })),
        evolucaoDiaria: evolucao
      });

    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async contasCorrentes(req, res) {
    try {
      await pool.query(`
        INSERT INTO contas_bancarias (usuario_id, nome, saldo_inicial)
        SELECT $1, banco.nome, 0
        FROM (VALUES ('Bradesco'), ('Santander'), ('Crefisa')) AS banco(nome)
        ON CONFLICT (usuario_id, nome) DO NOTHING
      `, [req.userId]);

      const result = await pool.query(`
        SELECT
          cb.id,
          cb.nome,
          cb.saldo_inicial,
          COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.valor ELSE 0 END), 0) as entradas,
          COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.valor ELSE 0 END), 0) as saidas,
          cb.saldo_inicial
            + COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.valor ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.valor ELSE 0 END), 0) as saldo
        FROM contas_bancarias cb
        LEFT JOIN movimentacoes m ON m.conta_bancaria_id = cb.id
        WHERE cb.usuario_id = $1 AND cb.ativo = true
        GROUP BY cb.id, cb.nome, cb.saldo_inicial
        ORDER BY CASE cb.nome WHEN 'Bradesco' THEN 1 WHEN 'Santander' THEN 2 WHEN 'Crefisa' THEN 3 ELSE 4 END, cb.nome
      `, [req.userId]);

      res.json({
        contas: result.rows.map((r) => ({
          ...r,
          saldo_inicial: parseFloat(r.saldo_inicial),
          entradas: parseFloat(r.entradas),
          saidas: parseFloat(r.saidas),
          saldo: parseFloat(r.saldo),
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async atualizarContaCorrente(req, res) {
    try {
      const { id } = req.params;
      const { saldo_inicial } = req.body;
      const saldo = parseFloat(saldo_inicial);

      if (Number.isNaN(saldo)) {
        return res.status(400).json({ error: 'Saldo inicial inválido.' });
      }

      const result = await pool.query(
        `UPDATE contas_bancarias
         SET saldo_inicial = $1
         WHERE id = $2 AND usuario_id = $3
         RETURNING *`,
        [saldo, id, req.userId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: 'Conta corrente não encontrada.' });
      }

      res.json({ conta: result.rows[0], message: 'Saldo inicial atualizado com sucesso!' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }
};

module.exports = dashboardController;
