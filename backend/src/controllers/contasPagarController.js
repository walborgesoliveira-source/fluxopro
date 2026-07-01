const pool = require('../database/connection');

const FORMAS_PAGAMENTO = {
  CREDITO_BRADESCO: { label: 'Crédito Bradesco', tipo: 'CREDITO', banco: 'Bradesco' },
  CREDITO_SANTANDER: { label: 'Crédito Santander', tipo: 'CREDITO', banco: 'Santander' },
  DEBITO_BRADESCO: { label: 'Débito Bradesco', tipo: 'CONTA', banco: 'Bradesco' },
  DEBITO_SANTANDER: { label: 'Débito Santander', tipo: 'CONTA', banco: 'Santander' },
  DEBITO_CREFISA: { label: 'Débito Crefisa', tipo: 'CONTA', banco: 'Crefisa' },
  PIX_BRADESCO: { label: 'PIX Bradesco', tipo: 'CONTA', banco: 'Bradesco' },
  PIX_SANTANDER: { label: 'PIX Santander', tipo: 'CONTA', banco: 'Santander' },
  PIX_CREFISA: { label: 'PIX Crefisa', tipo: 'CONTA', banco: 'Crefisa' },
};

function normalizarFormaPagamento(forma) {
  if (!forma) return 'OUTROS';
  if (FORMAS_PAGAMENTO[forma]) return forma;
  return forma;
}

async function garantirContaBancaria(client, usuarioId, banco) {
  const result = await client.query(
    `INSERT INTO contas_bancarias (usuario_id, nome, saldo_inicial)
     VALUES ($1, $2, 0)
     ON CONFLICT (usuario_id, nome) DO UPDATE SET ativo = contas_bancarias.ativo
     RETURNING id`,
    [usuarioId, banco]
  );
  return result.rows[0].id;
}

async function sincronizarRecorrenciaContaPagar(client, usuarioId, conta) {
  if (!conta.recorrente) {
    if (conta.recorrencia_id) {
      await client.query(
        'UPDATE recorrencias SET ativo = false WHERE id = $1 AND usuario_id = $2',
        [conta.recorrencia_id, usuarioId]
      );
    }
    return null;
  }

  const diaVencimento = new Date(conta.data_vencimento).getUTCDate();

  if (conta.recorrencia_id) {
    await client.query(
      `UPDATE recorrencias
       SET descricao = $1, valor = $2, dia_vencimento = $3, categoria_id = $4, origem = $5,
           observacao = $6, forma_pagamento = $7, ativo = true
       WHERE id = $8 AND usuario_id = $9`,
      [
        conta.descricao,
        conta.valor,
        diaVencimento,
        conta.categoria_id || null,
        conta.origem || 'PF',
        conta.observacao || null,
        normalizarFormaPagamento(conta.forma_pagamento),
        conta.recorrencia_id,
        usuarioId
      ]
    );
    return conta.recorrencia_id;
  }

  const result = await client.query(
    `INSERT INTO recorrencias
       (usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id, origem, observacao, forma_pagamento, ativo)
     VALUES ($1, 'PAGAR', $2, $3, $4, $5, $6, $7, $8, true)
     RETURNING id`,
    [
      usuarioId,
      conta.descricao,
      conta.valor,
      diaVencimento,
      conta.categoria_id || null,
      conta.origem || 'PF',
      conta.observacao || null,
      normalizarFormaPagamento(conta.forma_pagamento)
    ]
  );
  return result.rows[0].id;
}

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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { descricao, valor, data_vencimento, tipo, forma_pagamento, origem, categoria_id, observacao, recorrente } = req.body;
      const forma = normalizarFormaPagamento(forma_pagamento);

      const result = await client.query(
        `INSERT INTO contas_pagar (usuario_id, descricao, valor, data_vencimento, tipo, forma_pagamento, origem, categoria_id, observacao, recorrente)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [req.userId, descricao, valor, data_vencimento, tipo, forma, origem || 'PF', categoria_id, observacao, recorrente || false]
      );

      let conta = result.rows[0];
      const recorrenciaId = await sincronizarRecorrenciaContaPagar(client, req.userId, conta);
      if (recorrenciaId) {
        const upd = await client.query(
          'UPDATE contas_pagar SET recorrencia_id = $1, recorrente = true WHERE id = $2 RETURNING *',
          [recorrenciaId, conta.id]
        );
        conta = upd.rows[0];
      }

      await client.query('COMMIT');
      res.status(201).json({ conta, message: 'Conta a pagar criada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao criar conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
      client.release();
    }
  },

  /**
   * PUT /api/contas-pagar/:id
   */
  async atualizar(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { descricao, valor, data_vencimento, tipo, status, forma_pagamento, origem, categoria_id, observacao, data_pagamento, recorrente } = req.body;
      const forma = Object.prototype.hasOwnProperty.call(req.body, 'forma_pagamento')
        ? normalizarFormaPagamento(forma_pagamento)
        : undefined;

      const anteriorRes = await client.query(
        'SELECT * FROM contas_pagar WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
        [id, req.userId]
      );

      if (anteriorRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta não encontrada.' });
      }

      const anterior = anteriorRes.rows[0];

      const result = await client.query(
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
          recorrente = COALESCE($11, recorrente),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $12 AND usuario_id = $13
        RETURNING *`,
        [descricao, valor, data_vencimento, tipo, status, forma, origem, categoria_id, observacao, data_pagamento, recorrente, id, req.userId]
      );

      // Se pertencer a uma fatura de cartão, recalcular o total
      let contaAtualizada = result.rows[0];
      const recorrenciaId = await sincronizarRecorrenciaContaPagar(client, req.userId, contaAtualizada);
      if (recorrenciaId && recorrenciaId !== contaAtualizada.recorrencia_id) {
        const upd = await client.query(
          'UPDATE contas_pagar SET recorrencia_id = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
          [recorrenciaId, id, req.userId]
        );
        contaAtualizada = upd.rows[0];
      }
      const faturaId = contaAtualizada.fatura_id;
      if (faturaId) {
        const sum = await client.query('SELECT SUM(valor) as total FROM contas_pagar WHERE fatura_id = $1', [faturaId]);
        const novoTotal = sum.rows[0].total || 0;
        await client.query('UPDATE faturas SET valor_total = $1 WHERE id = $2', [novoTotal, faturaId]);
      }

      const mudouParaPago = anterior.status !== 'PAGO' && contaAtualizada.status === 'PAGO';
      if (mudouParaPago) {
        const infoForma = FORMAS_PAGAMENTO[contaAtualizada.forma_pagamento];

        if (infoForma?.tipo === 'CONTA') {
          const contaBancariaId = await garantirContaBancaria(client, req.userId, infoForma.banco);
          await client.query(
            `INSERT INTO movimentacoes (usuario_id, conta_bancaria_id, tipo, valor, descricao, origem, forma_pagamento, referencia_tipo, referencia_id, data_movimentacao)
             VALUES ($1, $2, 'SAIDA', $3, $4, $5, $6, 'CONTA_PAGAR', $7, COALESCE($8, CURRENT_DATE))`,
            [req.userId, contaBancariaId, contaAtualizada.valor, contaAtualizada.descricao, contaAtualizada.origem, contaAtualizada.forma_pagamento, id, data_pagamento]
          );
        } else if (infoForma?.tipo === 'CREDITO' && contaAtualizada.fatura_id) {
          await client.query(
            `UPDATE faturas
             SET valor_pago = LEAST(valor_total, COALESCE(valor_pago, 0) + $1),
                 data_pagamento = COALESCE($2, CURRENT_DATE),
                 status = CASE WHEN LEAST(valor_total, COALESCE(valor_pago, 0) + $1) >= valor_total THEN 'PAGA' ELSE status END
             WHERE id = $3 AND usuario_id = $4`,
            [contaAtualizada.valor, data_pagamento, contaAtualizada.fatura_id, req.userId]
          );
        } else {
          await client.query(
            `INSERT INTO movimentacoes (usuario_id, tipo, valor, descricao, origem, forma_pagamento, referencia_tipo, referencia_id, data_movimentacao)
             VALUES ($1, 'SAIDA', $2, $3, $4, $5, 'CONTA_PAGAR', $6, COALESCE($7, CURRENT_DATE))`,
            [req.userId, contaAtualizada.valor, contaAtualizada.descricao, contaAtualizada.origem, contaAtualizada.forma_pagamento, id, data_pagamento]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ conta: contaAtualizada, message: 'Conta atualizada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao atualizar conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
      client.release();
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
