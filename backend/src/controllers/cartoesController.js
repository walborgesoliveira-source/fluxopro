const pool = require('../database/connection');
const {
  calcularFatura,
  buscarOuCriarFatura,
  recalcularFatura,
} = require('../services/faturasService');

const cartoesController = {
  // ==========================
  // CARTÕES
  // ==========================
  async listarCartoes(req, res) {
    try {
      const result = await pool.query('SELECT * FROM cartoes WHERE usuario_id = $1 ORDER BY nome ASC', [req.userId]);
      res.json({ cartoes: result.rows });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async criarCartao(req, res) {
    try {
      const { nome, bandeira, limite, dia_fechamento, dia_vencimento } = req.body;
      const result = await pool.query(
        `INSERT INTO cartoes (usuario_id, nome, bandeira, limite, dia_fechamento, dia_vencimento)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, nome, bandeira, limite || 0, dia_fechamento, dia_vencimento]
      );
      res.status(201).json({ cartao: result.rows[0], message: 'Cartão criado com sucesso!' });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async excluirCartao(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM cartoes WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.userId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
      res.json({ message: 'Cartão excluído com sucesso!' });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async editarCartao(req, res) {
    try {
      const { id } = req.params;
      const { nome, bandeira, limite, dia_fechamento, dia_vencimento, melhor_dia_compra } = req.body;
      const result = await pool.query(
        `UPDATE cartoes SET
          nome = COALESCE($1, nome),
          bandeira = COALESCE($2, bandeira),
          limite = COALESCE($3, limite),
          dia_fechamento = COALESCE($4, dia_fechamento),
          dia_vencimento = COALESCE($5, dia_vencimento),
          melhor_dia_compra = COALESCE($6, melhor_dia_compra)
         WHERE id = $7 AND usuario_id = $8 RETURNING *`,
        [nome, bandeira, limite, dia_fechamento, dia_vencimento, melhor_dia_compra, id, req.userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
      res.json({ cartao: result.rows[0], message: 'Cartão atualizado com sucesso!' });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  // ==========================
  // FATURAS E COMPRAS
  // ==========================
  async listarFaturas(req, res) {
    try {
      const { cartao_id } = req.query;
      let query = `
        SELECT
          f.*,
          c.nome as cartao_nome,
          c.dia_vencimento,
          COUNT(cp.id)::integer as quantidade_lancamentos,
          COALESCE(SUM(cp.valor), 0) as total_lancamentos
        FROM faturas f
        JOIN cartoes c ON f.cartao_id = c.id
        LEFT JOIN contas_pagar cp ON cp.fatura_id = f.id
        WHERE f.usuario_id = $1`;
      const params = [req.userId];
      
      if (cartao_id) {
        query += ' AND f.cartao_id = $2';
        params.push(cartao_id);
      }
      query += `
        GROUP BY f.id, c.id, c.nome, c.dia_vencimento
        ORDER BY f.ano_referencia DESC, f.mes_referencia DESC, c.nome ASC`;

      const result = await pool.query(query, params);
      res.json({ faturas: result.rows });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async atualizarPagamentoFatura(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { valor_pago, data_pagamento, conta_bancaria_id } = req.body;
      const valorPago = parseFloat(valor_pago);

      if (Number.isNaN(valorPago) || valorPago < 0) {
        throw new Error('Valor pago inválido.');
      }

      let contaBancariaId = conta_bancaria_id || null;
      if (valorPago > 0) {
        if (!contaBancariaId) {
          throw new Error('Informe de qual conta corrente saiu o pagamento.');
        }

        const contaRes = await client.query(
          'SELECT id FROM contas_bancarias WHERE id = $1 AND usuario_id = $2 AND ativo = true',
          [contaBancariaId, req.userId]
        );

        if (!contaRes.rows.length) {
          throw new Error('Conta corrente inválida.');
        }
      }

      const result = await client.query(
        `UPDATE faturas
         SET valor_pago = $1,
             data_pagamento = $2,
             status = CASE
               WHEN $1 >= valor_total THEN 'PAGA'
               WHEN status = 'PAGA' THEN 'ABERTA'
               ELSE status
             END
         WHERE id = $3 AND usuario_id = $4
         RETURNING *`,
        [valorPago, data_pagamento || null, id, req.userId]
      );

      if (!result.rows.length) {
        throw new Error('Fatura não encontrada.');
      }

      await client.query(
        `DELETE FROM movimentacoes
         WHERE usuario_id = $1 AND referencia_tipo = 'FATURA_CARTAO' AND referencia_id = $2`,
        [req.userId, id]
      );

      if (valorPago > 0) {
        const fatura = result.rows[0];
        const cartaoRes = await client.query('SELECT nome FROM cartoes WHERE id = $1', [fatura.cartao_id]);
        const cartaoNome = cartaoRes.rows[0]?.nome || 'Cartão';
        await client.query(
          `INSERT INTO movimentacoes (usuario_id, conta_bancaria_id, tipo, valor, descricao, origem, forma_pagamento, referencia_tipo, referencia_id, data_movimentacao)
           VALUES ($1, $2, 'SAIDA', $3, $4, 'PF', 'PAGAMENTO_FATURA_CARTAO', 'FATURA_CARTAO', $5, COALESCE($6, CURRENT_DATE))`,
          [req.userId, contaBancariaId, valorPago, `Pagamento fatura ${cartaoNome} ${String(fatura.mes_referencia).padStart(2, '0')}/${fatura.ano_referencia}`, id, data_pagamento]
        );
      }

      await client.query('COMMIT');
      res.json({ fatura: result.rows[0], message: 'Pagamento da fatura atualizado!' });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message || 'Erro ao atualizar pagamento da fatura.' });
    } finally {
      client.release();
    }
  },

  async salvarFaturaMes(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { mes, ano, valor_total } = req.body;
      const mesRef = parseInt(mes, 10);
      const anoRef = parseInt(ano, 10);
      const valorTotal = parseFloat(valor_total);

      if (!mesRef || mesRef < 1 || mesRef > 12 || !anoRef) {
        throw new Error('Mês e ano da fatura são obrigatórios.');
      }

      if (Number.isNaN(valorTotal) || valorTotal < 0) {
        throw new Error('Valor da fatura inválido.');
      }

      const cartaoRes = await client.query(
        'SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2',
        [id, req.userId]
      );
      if (!cartaoRes.rows.length) {
        throw new Error('Cartão não encontrado.');
      }

      const faturaRes = await client.query(
        'SELECT id FROM faturas WHERE cartao_id = $1 AND usuario_id = $2 AND mes_referencia = $3 AND ano_referencia = $4 ORDER BY id ASC LIMIT 1',
        [id, req.userId, mesRef, anoRef]
      );

      let result;
      if (faturaRes.rows.length) {
        result = await client.query(
          `UPDATE faturas
           SET valor_informado = $1
           WHERE id = $2 AND usuario_id = $3
           RETURNING *`,
          [valorTotal, faturaRes.rows[0].id, req.userId]
        );
      } else {
        result = await client.query(
          `INSERT INTO faturas (cartao_id, usuario_id, mes_referencia, ano_referencia, valor_total, valor_informado, valor_pago)
           VALUES ($1, $2, $3, $4, $5, $5, 0)
           RETURNING *`,
          [id, req.userId, mesRef, anoRef, valorTotal]
        );
      }

      const faturaRecalculada = await recalcularFatura(client, result.rows[0].id);
      result = await client.query(
        `UPDATE faturas
         SET status = CASE
           WHEN valor_total > 0 AND valor_pago >= valor_total THEN 'PAGA'
           WHEN status = 'PAGA' THEN 'ABERTA'
           ELSE status
         END
         WHERE id = $1
         RETURNING *`,
        [faturaRecalculada.id]
      );

      await client.query('COMMIT');
      res.json({ fatura: result.rows[0], message: 'Fatura do mês salva com sucesso!' });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message || 'Erro ao salvar fatura do mês.' });
    } finally {
      client.release();
    }
  },

  async adicionarCompra(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { cartao_id, descricao, valor_total, data_compra, parcelas, categoria_id, origem } = req.body;
      const qtdeParcelas = Math.max(1, parseInt(parcelas, 10) || 1);
      const valorParcela = parseFloat(valor_total) / qtdeParcelas;

      // Buscar o cartão
      const cartaoRes = await client.query('SELECT dia_fechamento, dia_vencimento FROM cartoes WHERE id = $1 AND usuario_id = $2', [cartao_id, req.userId]);
      if (cartaoRes.rows.length === 0) {
        throw new Error('Cartão não encontrado.');
      }
      const cartao = cartaoRes.rows[0];

      const contasCriadas = [];

      for (let i = 0; i < qtdeParcelas; i++) {
        // Calcular quando essa parcela vai cair
        const { mes, ano, dataVencimento } = calcularFatura(data_compra, cartao.dia_fechamento, cartao.dia_vencimento, i);

        const fatura = await buscarOuCriarFatura(client, req.userId, cartao_id, mes, ano);
        const faturaId = fatura.id;

        // Criar registro em contas a pagar vinculado à fatura
        const descParcela = qtdeParcelas > 1 ? `${descricao} (${i+1}/${qtdeParcelas})` : descricao;
        
        const cp = await client.query(
          `INSERT INTO contas_pagar (usuario_id, categoria_id, cartao_id, fatura_id, descricao, valor, data_vencimento, tipo, forma_pagamento, origem, parcela_atual, total_parcelas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'VARIAVEL', 'CARTAO', $8, $9, $10) RETURNING *`,
          [req.userId, categoria_id || null, cartao_id, faturaId, descParcela, valorParcela, dataVencimento, origem || 'PF', i+1, qtdeParcelas]
        );
        contasCriadas.push(cp.rows[0]);
        await recalcularFatura(client, faturaId);
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Compra registrada com sucesso!', parcelas: contasCriadas.length });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(400).json({ error: e.message || 'Erro ao registrar compra no cartão.' });
    } finally {
      client.release();
    }
  },

  async listarComprasFatura(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT cp.*, c.nome as categoria_nome
        FROM contas_pagar cp
        LEFT JOIN categorias c ON cp.categoria_id = c.id
        WHERE cp.fatura_id = $1 AND cp.usuario_id = $2
        ORDER BY cp.data_vencimento ASC, cp.id ASC
      `, [id, req.userId]);
      res.json({ compras: result.rows });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async editarCompra(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { descricao, valor, categoria_id } = req.body;
      const novoValor = parseFloat(valor);

      const contaRes = await client.query('SELECT valor, fatura_id FROM contas_pagar WHERE id = $1 AND usuario_id = $2', [id, req.userId]);
      if (!contaRes.rows.length) throw new Error('Compra não encontrada.');
      const conta = contaRes.rows[0];

      const updConta = await client.query(`
        UPDATE contas_pagar 
        SET descricao = $1, valor = $2, categoria_id = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND usuario_id = $5 RETURNING *
      `, [descricao, novoValor, categoria_id || null, id, req.userId]);

      if (conta.fatura_id) {
        await recalcularFatura(client, conta.fatura_id);
      }

      await client.query('COMMIT');
      res.json({ message: 'Compra atualizada!', compra: updConta.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e); res.status(400).json({ error: e.message || 'Erro ao atualizar compra.' });
    } finally {
      client.release();
    }
  },

  async excluirCompra(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;

      const contaRes = await client.query('SELECT valor, fatura_id FROM contas_pagar WHERE id = $1 AND usuario_id = $2', [id, req.userId]);
      if (!contaRes.rows.length) throw new Error('Compra não encontrada.');
      const conta = contaRes.rows[0];

      await client.query('DELETE FROM contas_pagar WHERE id = $1', [id]);

      if (conta.fatura_id) {
        await recalcularFatura(client, conta.fatura_id);
      }

      await client.query('COMMIT');
      res.json({ message: 'Compra excluída com sucesso!' });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e); res.status(400).json({ error: e.message || 'Erro ao excluir compra.' });
    } finally {
      client.release();
    }
  },

  /**
   * DELETE /api/cartoes/faturas/:id
   */
  async excluirFatura(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query(
        'DELETE FROM faturas WHERE id = $1 AND usuario_id = $2 RETURNING id',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Fatura não encontrada.' });
      }

      res.json({ message: 'Fatura excluída com sucesso!' });
    } catch (error) {
      console.error('Erro ao excluir fatura:', error);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }
};

module.exports = cartoesController;
