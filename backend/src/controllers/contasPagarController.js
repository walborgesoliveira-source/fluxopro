const pool = require('../database/connection');

/**
 * Controller de Contas a Pagar
 */
const contasPagarController = {
  /**
   * GET /api/contas-pagar
   * Lista todas as contas a pagar do usuário
   * Query params: mes, ano, status, origem, tipo
   */
  async listar(req, res) {
    try {
      const { mes, ano, status, origem, tipo } = req.query;
      let query = `
        SELECT cp.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone
        FROM contas_pagar cp
        LEFT JOIN categorias c ON cp.categoria_id = c.id
        WHERE cp.usuario_id = $1
      `;
      const params = [req.userId];
      let paramIdx = 2;

      if (mes && ano) {
        query += ` AND EXTRACT(MONTH FROM cp.data_vencimento) = $${paramIdx} AND EXTRACT(YEAR FROM cp.data_vencimento) = $${paramIdx + 1}`;
        params.push(parseInt(mes), parseInt(ano));
        paramIdx += 2;
      }

      if (status) {
        query += ` AND cp.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
      }

      if (origem) {
        query += ` AND cp.origem = $${paramIdx}`;
        params.push(origem);
        paramIdx++;
      }

      if (tipo) {
        query += ` AND cp.tipo = $${paramIdx}`;
        params.push(tipo);
        paramIdx++;
      }

      query += ' ORDER BY cp.data_vencimento ASC';

      const result = await pool.query(query, params);
      res.json({ contas: result.rows, total: result.rows.length });
    } catch (error) {
      console.error('Erro ao listar contas a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * POST /api/contas-pagar
   */
  async criar(req, res) {
    try {
      const { descricao, valor, data_vencimento, tipo, forma_pagamento, origem, categoria_id, observacao, recorrente } = req.body;

      const result = await pool.query(
        `INSERT INTO contas_pagar (usuario_id, descricao, valor, data_vencimento, tipo, forma_pagamento, origem, categoria_id, observacao, recorrente)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [req.userId, descricao, valor, data_vencimento, tipo, forma_pagamento || 'OUTROS', origem || 'PF', categoria_id, observacao, recorrente || false]
      );

      res.status(201).json({ conta: result.rows[0], message: 'Conta a pagar criada com sucesso!' });
    } catch (error) {
      console.error('Erro ao criar conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * PUT /api/contas-pagar/:id
   */
  async atualizar(req, res) {
    try {
      const { id } = req.params;
      const { descricao, valor, data_vencimento, tipo, status, forma_pagamento, origem, categoria_id, observacao, data_pagamento } = req.body;

      const result = await pool.query(
        `UPDATE contas_pagar SET
          descricao = COALESCE($1, descricao),
          valor = COALESCE($2, valor),
          data_vencimento = COALESCE($3, data_vencimento),
          tipo = COALESCE($4, tipo),
          status = COALESCE($5, status),
          forma_pagamento = COALESCE($6, forma_pagamento),
          origem = COALESCE($7, origem),
          categoria_id = COALESCE($8, categoria_id),
          observacao = COALESCE($9, observacao),
          data_pagamento = $10,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11 AND usuario_id = $12
        RETURNING *`,
        [descricao, valor, data_vencimento, tipo, status, forma_pagamento, origem, categoria_id, observacao, data_pagamento, id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta não encontrada.' });
      }

      // Se pertencer a uma fatura de cartão, recalcular o total
      const faturaId = result.rows[0].fatura_id;
      if (faturaId) {
        const sum = await pool.query('SELECT SUM(valor) as total FROM contas_pagar WHERE fatura_id = $1', [faturaId]);
        const novoTotal = sum.rows[0].total || 0;
        await pool.query('UPDATE faturas SET valor_total = $1 WHERE id = $2', [novoTotal, faturaId]);
      }

      // Se status mudou para PAGO, registrar movimentação
      if (status === 'PAGO') {
        await pool.query(
          `INSERT INTO movimentacoes (usuario_id, tipo, valor, descricao, origem, referencia_tipo, referencia_id, data_movimentacao)
           VALUES ($1, 'SAIDA', $2, $3, $4, 'CONTA_PAGAR', $5, COALESCE($6, CURRENT_DATE))`,
          [req.userId, result.rows[0].valor, result.rows[0].descricao, result.rows[0].origem, id, data_pagamento]
        );
      }

      res.json({ conta: result.rows[0], message: 'Conta atualizada com sucesso!' });
    } catch (error) {
      console.error('Erro ao atualizar conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * DELETE /api/contas-pagar/:id
   */
  async excluir(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query(
        'DELETE FROM contas_pagar WHERE id = $1 AND usuario_id = $2 RETURNING fatura_id',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Conta não encontrada.' });
      }

      // Se pertencer a uma fatura de cartão, recalcular o total
      const faturaId = result.rows[0].fatura_id;
      if (faturaId) {
        const sum = await pool.query('SELECT SUM(valor) as total FROM contas_pagar WHERE fatura_id = $1', [faturaId]);
        const novoTotal = sum.rows[0].total || 0;
        
        if (novoTotal === 0) {
          // Se a fatura ficar zerada, deleta a fatura para limpar sujeira
          await pool.query('DELETE FROM faturas WHERE id = $1', [faturaId]);
        } else {
          await pool.query('UPDATE faturas SET valor_total = $1 WHERE id = $2', [novoTotal, faturaId]);
        }
      }

      res.json({ message: 'Conta excluída com sucesso!' });
    } catch (error) {
      console.error('Erro ao excluir conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = contasPagarController;
