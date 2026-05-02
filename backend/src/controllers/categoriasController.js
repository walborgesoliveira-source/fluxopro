const pool = require('../database/connection');

const categoriasController = {
  async listar(req, res) {
    try {
      const { tipo } = req.query;
      let query = 'SELECT * FROM categorias WHERE (usuario_id=$1 OR usuario_id IS NULL) AND ativo=true';
      const params = [req.userId];
      if (tipo) { query += ' AND tipo=$2'; params.push(tipo); }
      query += ' ORDER BY nome ASC';
      const result = await pool.query(query, params);
      res.json({ categorias: result.rows });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },

  async criar(req, res) {
    try {
      const { nome, tipo, cor, icone } = req.body;
      const result = await pool.query(
        'INSERT INTO categorias (usuario_id, nome, tipo, cor, icone) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.userId, nome, tipo, cor || '#6366f1', icone || 'folder']
      );
      res.status(201).json({ categoria: result.rows[0] });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
  },
};

module.exports = categoriasController;
