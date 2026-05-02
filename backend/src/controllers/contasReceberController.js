const pool = require('../database/connection');

const contasReceberController = {
  async listar(req, res) {
    try {
      const { mes, ano, status, origem, tipo } = req.query;
      let query = `SELECT cr.*, c.nome as categoria_nome, c.cor as categoria_cor
        FROM contas_receber cr LEFT JOIN categorias c ON cr.categoria_id = c.id
        WHERE cr.usuario_id = $1`;
      const params = [req.userId];
      let p = 2;
      if (mes && ano) { query += ` AND EXTRACT(MONTH FROM cr.data_vencimento)=$${p} AND EXTRACT(YEAR FROM cr.data_vencimento)=$${p+1}`; params.push(+mes,+ano); p+=2; }
      if (status) { query += ` AND cr.status=$${p}`; params.push(status); p++; }
      if (origem) { query += ` AND cr.origem=$${p}`; params.push(origem); p++; }
      if (tipo) { query += ` AND cr.tipo=$${p}`; params.push(tipo); p++; }
      query += ' ORDER BY cr.data_vencimento ASC';
      const result = await pool.query(query, params);
      res.json({ contas: result.rows, total: result.rows.length });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },

  async criar(req, res) {
    try {
      const { descricao, valor, data_vencimento, tipo, origem_tipo, origem, categoria_id, observacao } = req.body;
      const result = await pool.query(
        `INSERT INTO contas_receber (usuario_id, descricao, valor, data_vencimento, tipo, origem_tipo, origem, categoria_id, observacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.userId, descricao, valor, data_vencimento, tipo, origem_tipo||'CLIENTE', origem||'PF', categoria_id, observacao]
      );
      res.status(201).json({ conta: result.rows[0], message: 'Conta a receber criada!' });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },

  async atualizar(req, res) {
    try {
      const { id } = req.params;
      const { descricao, valor, data_vencimento, tipo, status, origem_tipo, origem, categoria_id, observacao, data_recebimento } = req.body;
      const result = await pool.query(
        `UPDATE contas_receber SET descricao=COALESCE($1,descricao), valor=COALESCE($2,valor),
         data_vencimento=COALESCE($3,data_vencimento), tipo=COALESCE($4,tipo), status=COALESCE($5,status),
         origem_tipo=COALESCE($6,origem_tipo), origem=COALESCE($7,origem), categoria_id=COALESCE($8,categoria_id),
         observacao=COALESCE($9,observacao), data_recebimento=$10, updated_at=CURRENT_TIMESTAMP
         WHERE id=$11 AND usuario_id=$12 RETURNING *`,
        [descricao, valor, data_vencimento, tipo, status, origem_tipo, origem, categoria_id, observacao, data_recebimento, id, req.userId]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Conta não encontrada.' });
      if (status === 'RECEBIDO') {
        await pool.query(
          `INSERT INTO movimentacoes (usuario_id,tipo,valor,descricao,origem,referencia_tipo,referencia_id,data_movimentacao)
           VALUES ($1,'ENTRADA',$2,$3,$4,'CONTA_RECEBER',$5,COALESCE($6,CURRENT_DATE))`,
          [req.userId, result.rows[0].valor, result.rows[0].descricao, result.rows[0].origem, id, data_recebimento]
        );
      }
      res.json({ conta: result.rows[0], message: 'Conta atualizada!' });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM contas_receber WHERE id=$1 AND usuario_id=$2 RETURNING id', [id, req.userId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Conta não encontrada.' });
      res.json({ message: 'Conta excluída!' });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },
};

module.exports = contasReceberController;
