const pool = require('../database/connection');

const FORMAS_PAGAMENTO = {
  CREDITO_BRADESCO: 'Crédito Bradesco',
  CREDITO_SANTANDER: 'Crédito Santander',
  DEBITO_BRADESCO: 'Débito Bradesco',
  DEBITO_SANTANDER: 'Débito Santander',
  PIX_DINHEIRO: 'Pix / Dinheiro',
};

const recorrenciasController = {
  // ==========================
  // CRUD BÁSICO
  // ==========================
  async listar(req, res) {
    try {
      const { tipo } = req.query;
      let query = `
        SELECT r.*, c.nome as categoria_nome, c.cor as categoria_cor
        FROM recorrencias r
        LEFT JOIN categorias c ON r.categoria_id = c.id
        WHERE r.usuario_id = $1
      `;
      const params = [req.userId];

      if (tipo) {
        query += ' AND r.tipo = $2';
        params.push(tipo);
      }

      query += ' ORDER BY r.dia_vencimento ASC';

      const result = await pool.query(query, params);
      res.json({ recorrencias: result.rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro interno ao listar recorrências.' });
    }
  },

  async criar(req, res) {
    try {
      const { tipo, descricao, valor, dia_vencimento, categoria_id, origem, observacao, forma_pagamento } = req.body;
      const result = await pool.query(
        `INSERT INTO recorrencias
           (usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id, origem, observacao, forma_pagamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          req.userId,
          tipo,
          descricao,
          valor,
          dia_vencimento,
          categoria_id || null,
          origem || 'PF',
          observacao || null,
          forma_pagamento || 'OUTROS'
        ]
      );
      res.status(201).json({ recorrencia: result.rows[0], message: 'Recorrência criada com sucesso!' });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: 'Erro ao criar recorrência.' });
    }
  },

  async atualizar(req, res) {
    try {
      const { id } = req.params;
      const { tipo, descricao, valor, dia_vencimento, categoria_id, origem, observacao, forma_pagamento, ativo } = req.body;
      const result = await pool.query(
        `UPDATE recorrencias 
         SET tipo = $1, descricao = $2, valor = $3, dia_vencimento = $4, categoria_id = $5,
             origem = $6, observacao = $7, forma_pagamento = $8, ativo = $9
         WHERE id = $10 AND usuario_id = $11 RETURNING *`,
        [
          tipo,
          descricao,
          valor,
          dia_vencimento,
          categoria_id || null,
          origem,
          observacao || null,
          forma_pagamento || 'OUTROS',
          ativo,
          id,
          req.userId
        ]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Recorrência não encontrada.' });
      res.json({ recorrencia: result.rows[0], message: 'Recorrência atualizada.' });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: 'Erro ao atualizar recorrência.' });
    }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM recorrencias WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.userId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Recorrência não encontrada.' });
      res.json({ message: 'Recorrência excluída.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao excluir recorrência.' });
    }
  },

  // ==========================
  // STATUS MENSAL — LISTAR
  // ==========================
  /**
   * GET /api/recorrencias/status?mes=&ano=
   * Retorna todas as recorrências do usuário com o status do mês/ano indicado
   */
  async listarComStatus(req, res) {
    try {
      const { mes, ano, tipo } = req.query;
      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });

      let query = `
        SELECT 
          r.*,
          c.nome as categoria_nome,
          c.cor as categoria_cor,
          COALESCE(rs.status, 'PENDENTE') as status_mes,
          rs.forma_pagamento as forma_pagamento_mes,
          rs.data_pagamento as data_pagamento_mes,
          rs.id as status_id
        FROM recorrencias r
        LEFT JOIN categorias c ON r.categoria_id = c.id
        LEFT JOIN recorrencias_status rs 
          ON rs.recorrencia_id = r.id 
          AND rs.mes = $2 
          AND rs.ano = $3
          AND rs.usuario_id = $1
        WHERE r.usuario_id = $1
      `;
      const params = [req.userId, parseInt(mes), parseInt(ano)];

      if (tipo) {
        query += ' AND r.tipo = $4';
        params.push(tipo);
      }

      query += ' ORDER BY r.dia_vencimento ASC';

      const result = await pool.query(query, params);
      res.json({ recorrencias: result.rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao listar recorrências com status.' });
    }
  },

  // ==========================
  // MARCAR COMO PAGO
  // ==========================
  /**
   * POST /api/recorrencias/:id/pagar
   * Body: { mes, ano, forma_pagamento, data_pagamento }
   */
  async marcarPago(req, res) {
    try {
      const { id } = req.params;
      const { mes, ano, forma_pagamento, data_pagamento } = req.body;

      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });
      if (!forma_pagamento) return res.status(400).json({ error: 'Forma de pagamento é obrigatória.' });

      // Verificar se a recorrência pertence ao usuário
      const recCheck = await pool.query('SELECT id FROM recorrencias WHERE id = $1 AND usuario_id = $2', [id, req.userId]);
      if (!recCheck.rows.length) return res.status(404).json({ error: 'Recorrência não encontrada.' });

      // INSERT OR UPDATE (UPSERT)
      const result = await pool.query(
        `INSERT INTO recorrencias_status (recorrencia_id, usuario_id, mes, ano, status, forma_pagamento, data_pagamento)
         VALUES ($1, $2, $3, $4, 'PAGO', $5, $6)
         ON CONFLICT (recorrencia_id, mes, ano)
         DO UPDATE SET 
           status = 'PAGO',
           forma_pagamento = $5,
           data_pagamento = $6
         RETURNING *`,
        [id, req.userId, parseInt(mes), parseInt(ano), forma_pagamento, data_pagamento || new Date().toISOString().split('T')[0]]
      );

      res.json({ status: result.rows[0], message: 'Recorrência marcada como paga!' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao marcar recorrência como paga.' });
    }
  },

  // ==========================
  // REVERTER PARA PENDENTE
  // ==========================
  /**
   * POST /api/recorrencias/:id/despagar
   * Body: { mes, ano }
   */
  async marcarPendente(req, res) {
    try {
      const { id } = req.params;
      const { mes, ano } = req.body;

      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });

      await pool.query(
        `INSERT INTO recorrencias_status (recorrencia_id, usuario_id, mes, ano, status, forma_pagamento, data_pagamento)
         VALUES ($1, $2, $3, $4, 'PENDENTE', NULL, NULL)
         ON CONFLICT (recorrencia_id, mes, ano)
         DO UPDATE SET status = 'PENDENTE', forma_pagamento = NULL, data_pagamento = NULL`,
        [id, req.userId, parseInt(mes), parseInt(ano)]
      );

      res.json({ message: 'Recorrência revertida para pendente.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao reverter status.' });
    }
  },

  // ==========================
  // TOTAIS POR FORMA DE PAGAMENTO
  // ==========================
  /**
   * GET /api/recorrencias/totais?mes=&ano=
   */
  async totaisMes(req, res) {
    try {
      const { mes, ano } = req.query;
      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });

      // Total pago por forma de pagamento
      const pagos = await pool.query(
        `SELECT 
          rs.forma_pagamento,
          SUM(r.valor) as total
         FROM recorrencias_status rs
         JOIN recorrencias r ON r.id = rs.recorrencia_id
         WHERE rs.usuario_id = $1 AND rs.mes = $2 AND rs.ano = $3 AND rs.status = 'PAGO' AND r.tipo = 'PAGAR'
         GROUP BY rs.forma_pagamento`,
        [req.userId, parseInt(mes), parseInt(ano)]
      );

      // Total pendente (recorrências ativas PAGAR sem status PAGO neste mês)
      const pendentes = await pool.query(
        `SELECT 
          SUM(r.valor) as total_pendente,
          COUNT(*) as qtd_pendente
         FROM recorrencias r
         WHERE r.usuario_id = $1 AND r.ativo = true AND r.tipo = 'PAGAR'
           AND NOT EXISTS (
             SELECT 1 FROM recorrencias_status rs
             WHERE rs.recorrencia_id = r.id AND rs.mes = $2 AND rs.ano = $3 AND rs.status = 'PAGO'
           )`,
        [req.userId, parseInt(mes), parseInt(ano)]
      );

      // Total geral pago
      const totalPago = await pool.query(
        `SELECT SUM(r.valor) as total_pago, COUNT(*) as qtd_paga
         FROM recorrencias_status rs
         JOIN recorrencias r ON r.id = rs.recorrencia_id
         WHERE rs.usuario_id = $1 AND rs.mes = $2 AND rs.ano = $3 AND rs.status = 'PAGO' AND r.tipo = 'PAGAR'`,
        [req.userId, parseInt(mes), parseInt(ano)]
      );

      res.json({
        pagos_por_forma: pagos.rows,
        total_pendente: parseFloat(pendentes.rows[0]?.total_pendente || 0),
        qtd_pendente: parseInt(pendentes.rows[0]?.qtd_pendente || 0),
        total_pago: parseFloat(totalPago.rows[0]?.total_pago || 0),
        qtd_paga: parseInt(totalPago.rows[0]?.qtd_paga || 0),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao calcular totais.' });
    }
  },

  // ==========================
  // GERAÇÃO MENSAL
  // ==========================
  async gerarMensal(req, res) {
    const client = await pool.connect();
    try {
      const { mes, ano } = req.body;
      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });

      await client.query('BEGIN');

      const resRecorrencias = await client.query('SELECT * FROM recorrencias WHERE usuario_id = $1 AND ativo = true', [req.userId]);
      const recorrencias = resRecorrencias.rows;
      let criadas = 0;

      for (const rec of recorrencias) {
        const d = new Date(ano, mes, 0);
        const ultimoDiaDoMes = d.getDate();
        const diaReal = rec.dia_vencimento > ultimoDiaDoMes ? ultimoDiaDoMes : rec.dia_vencimento;
        const dataVencimento = `${ano}-${String(mes).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;

        if (rec.tipo === 'PAGAR') {
          const jaExiste = await client.query(
            'SELECT id FROM contas_pagar WHERE recorrencia_id = $1 AND EXTRACT(MONTH FROM data_vencimento) = $2 AND EXTRACT(YEAR FROM data_vencimento) = $3',
            [rec.id, mes, ano]
          );

          if (jaExiste.rows.length === 0) {
            await client.query(
              `INSERT INTO contas_pagar
                 (usuario_id, categoria_id, descricao, valor, data_vencimento, tipo, forma_pagamento, origem, observacao, recorrencia_id, recorrente)
               VALUES ($1, $2, $3, $4, $5, 'FIXA', $6, $7, $8, $9, true)`,
              [
                req.userId,
                rec.categoria_id,
                rec.descricao,
                rec.valor,
                dataVencimento,
                rec.forma_pagamento || 'OUTROS',
                rec.origem,
                rec.observacao,
                rec.id
              ]
            );
            criadas++;
          }
        } else if (rec.tipo === 'RECEBER') {
          const jaExiste = await client.query(
            'SELECT id FROM contas_receber WHERE recorrencia_id = $1 AND EXTRACT(MONTH FROM data_vencimento) = $2 AND EXTRACT(YEAR FROM data_vencimento) = $3',
            [rec.id, mes, ano]
          );

          if (jaExiste.rows.length === 0) {
            await client.query(
              `INSERT INTO contas_receber
                 (usuario_id, categoria_id, descricao, valor, data_vencimento, tipo, origem, observacao, recorrencia_id)
               VALUES ($1, $2, $3, $4, $5, 'RECORRENTE', $6, $7, $8)`,
              [req.userId, rec.categoria_id, rec.descricao, rec.valor, dataVencimento, rec.origem, rec.observacao, rec.id]
            );
            criadas++;
          }
        }
      }

      await client.query('COMMIT');
      res.json({ message: `Geração concluída. ${criadas} novas contas foram lançadas.`, criadas });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ error: 'Erro ao gerar recorrências mensais.' });
    } finally {
      client.release();
    }
  }
};

module.exports = recorrenciasController;
