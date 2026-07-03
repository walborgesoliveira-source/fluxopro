const pool = require('../database/connection');
const {
  calcularFatura,
  buscarOuCriarFatura,
  recalcularFatura,
} = require('../services/faturasService');

const FORMAS_PAGAMENTO = {
  CARTAO_CREDITO: { label: 'Cartão de crédito', tipo: 'CREDITO' },
  CREDITO_BRADESCO: { label: 'Crédito Bradesco', tipo: 'CREDITO', cartao: 'Bradesco' },
  CREDITO_SANTANDER: { label: 'Crédito Santander', tipo: 'CREDITO', cartao: 'Santander' },
  DEBITO_BRADESCO: { label: 'Débito Bradesco', tipo: 'CONTA', banco: 'Bradesco' },
  DEBITO_SANTANDER: { label: 'Débito Santander', tipo: 'CONTA', banco: 'Santander' },
  DEBITO_CREFISA: { label: 'Débito Crefisa', tipo: 'CONTA', banco: 'Crefisa' },
  PIX_BRADESCO: { label: 'PIX Bradesco', tipo: 'CONTA', banco: 'Bradesco' },
  PIX_SANTANDER: { label: 'PIX Santander', tipo: 'CONTA', banco: 'Santander' },
  PIX_CREFISA: { label: 'PIX Crefisa', tipo: 'CONTA', banco: 'Crefisa' },
  DINHEIRO: { label: 'Dinheiro', tipo: 'IMEDIATO' },
  TRANSFERENCIA: { label: 'Transferência', tipo: 'IMEDIATO' },
  OUTROS: { label: 'Outros', tipo: 'IMEDIATO' },
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

async function resolverCartaoPagamento(client, usuarioId, formaPagamento, cartaoId) {
  const infoForma = FORMAS_PAGAMENTO[formaPagamento];
  if (infoForma?.tipo !== 'CREDITO') return null;

  let result;
  if (cartaoId) {
    result = await client.query(
      `SELECT id, nome, dia_fechamento, dia_vencimento
       FROM cartoes
       WHERE id = $1 AND usuario_id = $2 AND ativo = true`,
      [cartaoId, usuarioId]
    );
  } else if (infoForma.cartao) {
    result = await client.query(
      `SELECT id, nome, dia_fechamento, dia_vencimento
       FROM cartoes
       WHERE usuario_id = $1 AND ativo = true AND nome ILIKE $2
       ORDER BY id ASC
       LIMIT 1`,
      [usuarioId, `%${infoForma.cartao}%`]
    );
  }

  if (!result?.rows.length) {
    throw new Error('Selecione um cartão de crédito cadastrado.');
  }
  return result.rows[0];
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
           observacao = $6, forma_pagamento = $7, cartao_id = $8, ativo = true
       WHERE id = $9 AND usuario_id = $10`,
      [
        conta.descricao,
        conta.valor,
        diaVencimento,
        conta.categoria_id || null,
        conta.origem || 'PF',
        conta.observacao || null,
        normalizarFormaPagamento(conta.forma_pagamento),
        conta.cartao_id || null,
        conta.recorrencia_id,
        usuarioId
      ]
    );
    return conta.recorrencia_id;
  }

  const result = await client.query(
    `INSERT INTO recorrencias
       (usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id, origem,
        observacao, forma_pagamento, cartao_id, ativo)
     VALUES ($1, 'PAGAR', $2, $3, $4, $5, $6, $7, $8, $9, true)
     RETURNING id`,
    [
      usuarioId,
      conta.descricao,
      conta.valor,
      diaVencimento,
      conta.categoria_id || null,
      conta.origem || 'PF',
      conta.observacao || null,
      normalizarFormaPagamento(conta.forma_pagamento),
      conta.cartao_id || null
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
        SELECT cp.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone,
          ct.nome as cartao_nome, f.mes_referencia as fatura_mes, f.ano_referencia as fatura_ano
        FROM contas_pagar cp
        LEFT JOIN categorias c ON cp.categoria_id = c.id
        LEFT JOIN cartoes ct ON cp.cartao_id = ct.id
        LEFT JOIN faturas f ON cp.fatura_id = f.id
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
      const { descricao, valor, data_vencimento, tipo, forma_pagamento, origem, categoria_id, observacao, recorrente, cartao_id } = req.body;
      const forma = normalizarFormaPagamento(forma_pagamento);
      const cartao = await resolverCartaoPagamento(client, req.userId, forma, cartao_id);

      const result = await client.query(
        `INSERT INTO contas_pagar (
           usuario_id, descricao, valor, data_vencimento, tipo, forma_pagamento,
           origem, categoria_id, observacao, recorrente, cartao_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.userId,
          descricao,
          valor,
          data_vencimento,
          tipo,
          cartao ? 'CARTAO_CREDITO' : forma,
          origem || 'PF',
          categoria_id,
          observacao,
          recorrente || false,
          cartao?.id || null,
        ]
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
      const {
        descricao,
        valor,
        data_vencimento,
        tipo,
        status,
        forma_pagamento,
        origem,
        categoria_id,
        observacao,
        data_pagamento,
        recorrente,
        cartao_id,
      } = req.body;
      const alterarDataPagamento = Object.prototype.hasOwnProperty.call(req.body, 'data_pagamento');
      const alterarCartao = Object.prototype.hasOwnProperty.call(req.body, 'cartao_id');
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
      const formaEfetiva = forma || anterior.forma_pagamento || 'OUTROS';
      const cartao = await resolverCartaoPagamento(
        client,
        req.userId,
        formaEfetiva,
        alterarCartao ? cartao_id : anterior.cartao_id
      );
      const formaPersistida = cartao ? 'CARTAO_CREDITO' : formaEfetiva;

      const result = await client.query(
        `UPDATE contas_pagar SET
          descricao = COALESCE($1, descricao),
          valor = COALESCE($2, valor),
          data_vencimento = COALESCE($3, data_vencimento),
          tipo = COALESCE($4, tipo),
          status = COALESCE($5, status),
          forma_pagamento = $6,
          origem = COALESCE($7, origem),
          categoria_id = COALESCE($8, categoria_id),
          observacao = COALESCE($9, observacao),
          data_pagamento = CASE WHEN $10::boolean THEN $11::date ELSE data_pagamento END,
          recorrente = COALESCE($12, recorrente),
          cartao_id = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $14 AND usuario_id = $15
        RETURNING *`,
        [
          descricao,
          valor,
          data_vencimento,
          tipo,
          status,
          formaPersistida,
          origem,
          categoria_id,
          observacao,
          alterarDataPagamento,
          data_pagamento || null,
          recorrente,
          cartao?.id || null,
          id,
          req.userId,
        ]
      );

      let contaAtualizada = result.rows[0];
      let novaFaturaId = contaAtualizada.fatura_id;

      if (contaAtualizada.status === 'PAGO') {
        const infoForma = FORMAS_PAGAMENTO[contaAtualizada.forma_pagamento];

        await client.query(
          `DELETE FROM movimentacoes
           WHERE usuario_id = $1 AND referencia_tipo = 'CONTA_PAGAR' AND referencia_id = $2`,
          [req.userId, id]
        );

        if (infoForma?.tipo === 'CREDITO') {
          const cartaoPagamento = cartao || await resolverCartaoPagamento(
            client,
            req.userId,
            contaAtualizada.forma_pagamento,
            contaAtualizada.cartao_id
          );
          const dataPagamentoEfetiva = contaAtualizada.data_pagamento
            || new Date().toISOString().slice(0, 10);
          const competencia = calcularFatura(
            dataPagamentoEfetiva,
            cartaoPagamento.dia_fechamento,
            cartaoPagamento.dia_vencimento
          );
          const fatura = await buscarOuCriarFatura(
            client,
            req.userId,
            cartaoPagamento.id,
            competencia.mes,
            competencia.ano
          );
          novaFaturaId = fatura.id;

          const atualizada = await client.query(
            `UPDATE contas_pagar
             SET forma_pagamento = 'CARTAO_CREDITO',
                 cartao_id = $1,
                 fatura_id = $2,
                 data_pagamento = COALESCE(data_pagamento, CURRENT_DATE),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND usuario_id = $4
             RETURNING *`,
            [cartaoPagamento.id, fatura.id, id, req.userId]
          );
          contaAtualizada = atualizada.rows[0];
        } else {
          novaFaturaId = null;
          const atualizada = await client.query(
            `UPDATE contas_pagar
             SET cartao_id = NULL, fatura_id = NULL
             WHERE id = $1 AND usuario_id = $2
             RETURNING *`,
            [id, req.userId]
          );
          contaAtualizada = atualizada.rows[0];
        }

        if (infoForma?.tipo === 'CONTA') {
          const contaBancariaId = await garantirContaBancaria(client, req.userId, infoForma.banco);
          await client.query(
            `INSERT INTO movimentacoes (usuario_id, conta_bancaria_id, tipo, valor, descricao, origem, forma_pagamento, referencia_tipo, referencia_id, data_movimentacao)
             VALUES ($1, $2, 'SAIDA', $3, $4, $5, $6, 'CONTA_PAGAR', $7, COALESCE($8, CURRENT_DATE))`,
            [
              req.userId,
              contaBancariaId,
              contaAtualizada.valor,
              contaAtualizada.descricao,
              contaAtualizada.origem,
              contaAtualizada.forma_pagamento,
              id,
              contaAtualizada.data_pagamento,
            ]
          );
        } else if (infoForma?.tipo !== 'CREDITO') {
          await client.query(
            `INSERT INTO movimentacoes (usuario_id, tipo, valor, descricao, origem, forma_pagamento, referencia_tipo, referencia_id, data_movimentacao)
             VALUES ($1, 'SAIDA', $2, $3, $4, $5, 'CONTA_PAGAR', $6, COALESCE($7, CURRENT_DATE))`,
            [
              req.userId,
              contaAtualizada.valor,
              contaAtualizada.descricao,
              contaAtualizada.origem,
              contaAtualizada.forma_pagamento,
              id,
              contaAtualizada.data_pagamento,
            ]
          );
        }
      }

      const faturasAfetadas = [...new Set(
        [anterior.fatura_id, novaFaturaId].filter(Boolean).map(Number)
      )];
      for (const faturaId of faturasAfetadas) {
        await recalcularFatura(client, faturaId);
      }

      const recorrenciaId = await sincronizarRecorrenciaContaPagar(client, req.userId, contaAtualizada);
      if (recorrenciaId && recorrenciaId !== contaAtualizada.recorrencia_id) {
        const upd = await client.query(
          'UPDATE contas_pagar SET recorrencia_id = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
          [recorrenciaId, id, req.userId]
        );
        contaAtualizada = upd.rows[0];
      }

      await client.query('COMMIT');
      res.json({ conta: contaAtualizada, message: 'Conta atualizada com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao atualizar conta a pagar:', error);
      res.status(400).json({ error: error.message || 'Erro ao atualizar a conta.' });
    } finally {
      client.release();
    }
  },

  /**
   * DELETE /api/contas-pagar/:id
   */
  async excluir(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const result = await client.query(
        'DELETE FROM contas_pagar WHERE id = $1 AND usuario_id = $2 RETURNING fatura_id',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta não encontrada.' });
      }

      await client.query(
        `DELETE FROM movimentacoes
         WHERE usuario_id = $1 AND referencia_tipo = 'CONTA_PAGAR' AND referencia_id = $2`,
        [req.userId, id]
      );

      const faturaId = result.rows[0].fatura_id;
      if (faturaId) {
        await recalcularFatura(client, faturaId);
      }

      await client.query('COMMIT');
      res.json({ message: 'Conta excluída com sucesso!' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao excluir conta a pagar:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    } finally {
      client.release();
    }
  },
};

module.exports = contasPagarController;
