const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

/**
 * Controller de Autenticação
 */
const authController = {
  /**
   * POST /api/auth/register
   */
  async register(req, res) {
    try {
      const { nome, email, senha, tipo } = req.body;

      // Verificar se email já existe
      const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Este email já está cadastrado.' });
      }

      // Hash da senha
      const senha_hash = await bcrypt.hash(senha, 12);

      // Inserir usuário
      const result = await pool.query(
        'INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, tipo, created_at',
        [nome, email, senha_hash, tipo || 'PF']
      );

      const usuario = result.rows[0];

      // Gerar token JWT
      const token = jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Criar categorias padrão para o novo usuário
      await pool.query(`
        INSERT INTO categorias (usuario_id, nome, tipo, cor, icone) VALUES
        ($1, 'Aluguel', 'DESPESA', '#ef4444', 'home'),
        ($1, 'Alimentação', 'DESPESA', '#f97316', 'utensils'),
        ($1, 'Transporte', 'DESPESA', '#eab308', 'car'),
        ($1, 'Internet/Telefone', 'DESPESA', '#3b82f6', 'wifi'),
        ($1, 'Energia', 'DESPESA', '#a855f7', 'zap'),
        ($1, 'Saúde', 'DESPESA', '#ec4899', 'heart'),
        ($1, 'Educação', 'DESPESA', '#14b8a6', 'book'),
        ($1, 'Outros (Despesa)', 'DESPESA', '#6b7280', 'more-horizontal'),
        ($1, 'Salário', 'RECEITA', '#22c55e', 'briefcase'),
        ($1, 'Freelance', 'RECEITA', '#10b981', 'code'),
        ($1, 'Investimentos', 'RECEITA', '#0ea5e9', 'trending-up'),
        ($1, 'Clientes', 'RECEITA', '#8b5cf6', 'users'),
        ($1, 'Outros (Receita)', 'RECEITA', '#6b7280', 'more-horizontal')
      `, [usuario.id]);

      res.status(201).json({
        message: 'Usuário criado com sucesso!',
        usuario,
        token,
      });
    } catch (error) {
      console.error('Erro no registro:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, senha } = req.body;

      // Buscar usuário
      const result = await pool.query('SELECT * FROM usuarios WHERE email = $1 AND ativo = true', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Email ou senha incorretos.' });
      }

      const usuario = result.rows[0];

      // Verificar senha
      const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
      if (!senhaValida) {
        return res.status(401).json({ error: 'Email ou senha incorretos.' });
      }

      // Gerar token
      const token = jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        message: 'Login realizado com sucesso!',
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
        },
        token,
      });
    } catch (error) {
      console.error('Erro no login:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  /**
   * GET /api/auth/me
   */
  async me(req, res) {
    try {
      const result = await pool.query(
        'SELECT id, nome, email, tipo, created_at FROM usuarios WHERE id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      res.json({ usuario: result.rows[0] });
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
};

module.exports = authController;
