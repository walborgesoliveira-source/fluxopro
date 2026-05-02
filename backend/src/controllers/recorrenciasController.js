const pool = require('../database/connection');

const recorrenciasController = {
  // ==========================
  // CRUD BÁSICO
  // ==========================
  async listar(req, res) {
    try {
      const { tipo } = req.query; // 'PAGAR' ou 'RECEBER'
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
      const { tipo, descricao, valor, dia_vencimento, categoria_id, origem } = req.body;
      const result = await pool.query(
        `INSERT INTO recorrencias (usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.userId, tipo, descricao, valor, dia_vencimento, categoria_id || null, origem || 'PF']
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
      const { tipo, descricao, valor, dia_vencimento, categoria_id, origem, ativo } = req.body;
      const result = await pool.query(
        `UPDATE recorrencias 
         SET tipo = $1, descricao = $2, valor = $3, dia_vencimento = $4, categoria_id = $5, origem = $6, ativo = $7
         WHERE id = $8 AND usuario_id = $9 RETURNING *`,
        [tipo, descricao, valor, dia_vencimento, categoria_id || null, origem, ativo, id, req.userId]
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
  // GERAÇÃO MENSAL
  // ==========================
  async gerarMensal(req, res) {
    const client = await pool.connect();
    try {
      const { mes, ano } = req.body;
      if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios.' });

      await client.query('BEGIN');

      // Buscar todas as recorrências ativas do usuário
      const resRecorrencias = await client.query('SELECT * FROM recorrencias WHERE usuario_id = $1 AND ativo = true', [req.userId]);
      const recorrencias = resRecorrencias.rows;
      let criadas = 0;

      for (const rec of recorrencias) {
        // Ajustar dia de vencimento (ex: dia 31 em fevereiro)
        const d = new Date(ano, mes, 0); // último dia do mês
        const ultimoDiaDoMes = d.getDate();
        const diaReal = rec.dia_vencimento > ultimoDiaDoMes ? ultimoDiaDoMes : rec.dia_vencimento;
        
        const dataVencimento = `${ano}-${String(mes).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;

        if (rec.tipo === 'PAGAR') {
          // Checar se já existe (idempotência)
          const jaExiste = await client.query(
            'SELECT id FROM contas_pagar WHERE recorrencia_id = $1 AND EXTRACT(MONTH FROM data_vencimento) = $2 AND EXTRACT(YEAR FROM data_vencimento) = $3',
            [rec.id, mes, ano]
          );

          if (jaExiste.rows.length === 0) {
            await client.query(
              `INSERT INTO contas_pagar (usuario_id, categoria_id, descricao, valor, data_vencimento, tipo, origem, recorrencia_id)
               VALUES ($1, $2, $3, $4, $5, 'FIXA', $6, $7)`,
              [req.userId, rec.categoria_id, rec.descricao, rec.valor, dataVencimento, rec.origem, rec.id]
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
              `INSERT INTO contas_receber (usuario_id, categoria_id, descricao, valor, data_vencimento, tipo, origem, recorrencia_id)
               VALUES ($1, $2, $3, $4, $5, 'RECORRENTE', $6, $7)`,
              [req.userId, rec.categoria_id, rec.descricao, rec.valor, dataVencimento, rec.origem, rec.id]
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
