require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authMiddleware = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const contasPagarRoutes = require('./routes/contasPagar');
const contasReceberRoutes = require('./routes/contasReceber');
const dashboardRoutes = require('./routes/dashboard');
const categoriasRoutes = require('./routes/categorias');
const cartoesRoutes = require('./routes/cartoes');
const recorrenciasRoutes = require('./routes/recorrencias');
const relatoriosRoutes = require('./routes/relatorios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend estático (build de produção)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/contas-pagar', authMiddleware, contasPagarRoutes);
app.use('/api/contas-receber', authMiddleware, contasReceberRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/categorias', authMiddleware, categoriasRoutes);
app.use('/api/cartoes', authMiddleware, cartoesRoutes);
app.use('/api/recorrencias', authMiddleware, recorrenciasRoutes);
app.use('/api/relatorios', authMiddleware, relatoriosRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'FluxoPro', version: '0.1.0', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Migration automática: adiciona colunas novas sem quebrar banco existente
const pool = require('./database/connection');
async function runMigrations() {
  try {
    await pool.query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS melhor_dia_compra INTEGER CHECK (melhor_dia_compra BETWEEN 1 AND 31)`);
    console.log('✅ Migration: coluna melhor_dia_compra verificada.');

    await pool.query(`
      ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_forma_pagamento_check;
      ALTER TABLE contas_pagar ALTER COLUMN forma_pagamento TYPE VARCHAR(30);
      ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
      ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30);
      ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
      ALTER TABLE faturas ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(12,2) DEFAULT 0;
    `);
    console.log('✅ Migration: meios de pagamento e valor pago de fatura verificados.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contas_bancarias (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        nome VARCHAR(80) NOT NULL,
        saldo_inicial DECIMAL(12,2) DEFAULT 0,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, nome)
      )
    `);

    await pool.query(`
      INSERT INTO contas_bancarias (usuario_id, nome, saldo_inicial)
      SELECT u.id, banco.nome, 0
      FROM usuarios u
      CROSS JOIN (VALUES ('Bradesco'), ('Santander'), ('Crefisa')) AS banco(nome)
      ON CONFLICT (usuario_id, nome) DO NOTHING
    `);
    console.log('✅ Migration: contas correntes padrão verificadas.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recorrencias_status (
        id SERIAL PRIMARY KEY,
        recorrencia_id INTEGER REFERENCES recorrencias(id) ON DELETE CASCADE,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
        ano INTEGER NOT NULL,
        status VARCHAR(10) DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO')),
        forma_pagamento VARCHAR(30) DEFAULT NULL,
        data_pagamento DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(recorrencia_id, mes, ano)
      )
    `);
    console.log('✅ Migration: tabela recorrencias_status verificada.');

    await pool.query(`
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS observacao TEXT;

      CREATE TABLE IF NOT EXISTS app_migrations (
        id VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260701_propagar_observacoes_recorrencias'
        ) THEN
          WITH observacoes_mais_recentes AS (
            SELECT DISTINCT ON (recorrencia_id)
              recorrencia_id,
              observacao
            FROM (
              SELECT recorrencia_id, observacao, data_vencimento, id
              FROM contas_pagar
              WHERE recorrencia_id IS NOT NULL
                AND NULLIF(BTRIM(observacao), '') IS NOT NULL

              UNION ALL

              SELECT recorrencia_id, observacao, data_vencimento, id
              FROM contas_receber
              WHERE recorrencia_id IS NOT NULL
                AND NULLIF(BTRIM(observacao), '') IS NOT NULL
            ) contas_recorrentes
            ORDER BY recorrencia_id, data_vencimento DESC, id DESC
          )
          UPDATE recorrencias r
          SET observacao = o.observacao
          FROM observacoes_mais_recentes o
          WHERE r.id = o.recorrencia_id
            AND NULLIF(BTRIM(r.observacao), '') IS NULL;

          UPDATE contas_pagar cp
          SET observacao = r.observacao,
              updated_at = CURRENT_TIMESTAMP
          FROM recorrencias r
          WHERE cp.recorrencia_id = r.id
            AND cp.data_vencimento >= DATE '2026-07-01'
            AND NULLIF(BTRIM(cp.observacao), '') IS NULL
            AND NULLIF(BTRIM(r.observacao), '') IS NOT NULL;

          UPDATE contas_receber cr
          SET observacao = r.observacao,
              updated_at = CURRENT_TIMESTAMP
          FROM recorrencias r
          WHERE cr.recorrencia_id = r.id
            AND cr.data_vencimento >= DATE '2026-07-01'
            AND NULLIF(BTRIM(cr.observacao), '') IS NULL
            AND NULLIF(BTRIM(r.observacao), '') IS NOT NULL;

          INSERT INTO app_migrations (id)
          VALUES ('20260701_propagar_observacoes_recorrencias');
        END IF;
      END
      $$;
    `);
    console.log('✅ Migration: observações das recorrências verificadas e propagadas.');
  } catch (e) {
    console.error('⚠️ Erro na migration:', e.message);
  }
}

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`\n🚀 FluxoPro API rodando na porta ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 http://localhost:${PORT}\n`);
  await runMigrations();
});

module.exports = app;
