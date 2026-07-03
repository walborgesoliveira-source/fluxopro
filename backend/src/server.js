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
      ALTER TABLE faturas ADD COLUMN IF NOT EXISTS valor_informado DECIMAL(12,2);
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
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30) DEFAULT 'OUTROS';
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS origem_tipo VARCHAR(10) DEFAULT 'CLIENTE';
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS cartao_id INTEGER;
      ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS data_inicio DATE DEFAULT CURRENT_DATE;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_competencia
        ON faturas(usuario_id, cartao_id, mes_referencia, ano_referencia);

      CREATE TABLE IF NOT EXISTS app_migrations (
        id VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_data_inicio_recorrencias_existentes'
        ) THEN
          UPDATE recorrencias r
          SET data_inicio = LEAST(
            COALESCE(r.data_inicio, r.created_at::date),
            r.created_at::date,
            COALESCE(
              (
                SELECT MIN(conta.data_vencimento)
                FROM (
                  SELECT cp.data_vencimento
                  FROM contas_pagar cp
                  WHERE cp.recorrencia_id = r.id

                  UNION ALL

                  SELECT cr.data_vencimento
                  FROM contas_receber cr
                  WHERE cr.recorrencia_id = r.id
                ) conta
              ),
              r.created_at::date
            )
          );

          INSERT INTO app_migrations (id)
          VALUES ('20260703_data_inicio_recorrencias_existentes');
        END IF;
      END
      $$;

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

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260701_propagar_formas_pagamento'
        ) THEN
          WITH formas_junho AS (
            SELECT DISTINCT ON (recorrencia_id)
              recorrencia_id,
              forma_pagamento
            FROM contas_pagar
            WHERE recorrencia_id IS NOT NULL
              AND data_vencimento >= DATE '2026-06-01'
              AND data_vencimento < DATE '2026-07-01'
            ORDER BY recorrencia_id, data_vencimento DESC, id DESC
          )
          UPDATE recorrencias r
          SET forma_pagamento = f.forma_pagamento
          FROM formas_junho f
          WHERE r.id = f.recorrencia_id;

          UPDATE contas_pagar cp
          SET forma_pagamento = r.forma_pagamento,
              updated_at = CURRENT_TIMESTAMP
          FROM recorrencias r
          WHERE cp.recorrencia_id = r.id
            AND cp.data_vencimento >= DATE '2026-07-01'
            AND cp.forma_pagamento IS DISTINCT FROM r.forma_pagamento;

          INSERT INTO app_migrations (id)
          VALUES ('20260701_propagar_formas_pagamento');
        END IF;
      END
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260701_rebase_metadados_recorrencias_maio'
        ) THEN
          WITH dados_maio AS (
            SELECT DISTINCT ON (recorrencia_id)
              recorrencia_id,
              observacao,
              forma_pagamento
            FROM contas_pagar
            WHERE recorrencia_id IS NOT NULL
              AND data_vencimento >= DATE '2026-05-01'
              AND data_vencimento < DATE '2026-06-01'
            ORDER BY recorrencia_id, data_vencimento DESC, id DESC
          )
          UPDATE recorrencias r
          SET observacao = CASE
                WHEN NULLIF(BTRIM(m.observacao), '') IS NOT NULL THEN m.observacao
                ELSE r.observacao
              END,
              forma_pagamento = m.forma_pagamento
          FROM dados_maio m
          WHERE r.id = m.recorrencia_id;

          UPDATE contas_pagar cp
          SET observacao = CASE
                WHEN NULLIF(BTRIM(r.observacao), '') IS NOT NULL THEN r.observacao
                ELSE cp.observacao
              END,
              forma_pagamento = r.forma_pagamento,
              updated_at = CURRENT_TIMESTAMP
          FROM recorrencias r
          WHERE cp.recorrencia_id = r.id
            AND cp.data_vencimento >= DATE '2026-06-01'
            AND (
              (
                NULLIF(BTRIM(r.observacao), '') IS NOT NULL
                AND cp.observacao IS DISTINCT FROM r.observacao
              )
              OR cp.forma_pagamento IS DISTINCT FROM r.forma_pagamento
            );

          INSERT INTO app_migrations (id)
          VALUES ('20260701_rebase_metadados_recorrencias_maio');
        END IF;
      END
      $$;

      DO $$
      DECLARE
        conta_maio RECORD;
        nova_recorrencia_id INTEGER;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_contas_receber_recorrentes_desde_maio'
        ) THEN
          FOR conta_maio IN
            SELECT *
            FROM contas_receber
            WHERE data_vencimento >= DATE '2026-05-01'
              AND data_vencimento < DATE '2026-06-01'
            ORDER BY usuario_id, data_vencimento, id
          LOOP
            IF conta_maio.recorrencia_id IS NULL THEN
              INSERT INTO recorrencias (
                usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id,
                origem, origem_tipo, conta_bancaria_id, observacao, data_inicio, ativo
              )
              VALUES (
                conta_maio.usuario_id, 'RECEBER', conta_maio.descricao, conta_maio.valor,
                EXTRACT(DAY FROM conta_maio.data_vencimento)::INTEGER,
                conta_maio.categoria_id, conta_maio.origem, conta_maio.origem_tipo,
                conta_maio.conta_bancaria_id, conta_maio.observacao, DATE '2026-05-01', true
              )
              RETURNING id INTO nova_recorrencia_id;

              UPDATE contas_receber
              SET recorrencia_id = nova_recorrencia_id,
                  tipo = 'RECORRENTE',
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = conta_maio.id;

              UPDATE contas_receber
              SET recorrencia_id = nova_recorrencia_id,
                  tipo = 'RECORRENTE',
                  updated_at = CURRENT_TIMESTAMP
              WHERE usuario_id = conta_maio.usuario_id
                AND recorrencia_id IS NULL
                AND (
                  LOWER(BTRIM(descricao)) = LOWER(BTRIM(conta_maio.descricao))
                  OR LOWER(BTRIM(conta_maio.descricao)) LIKE LOWER(BTRIM(descricao)) || '%'
                  OR LOWER(BTRIM(descricao)) LIKE LOWER(BTRIM(conta_maio.descricao)) || '%'
                )
                AND data_vencimento >= DATE '2026-06-01';
            END IF;
          END LOOP;

          INSERT INTO contas_receber (
            usuario_id, categoria_id, descricao, valor, data_vencimento, tipo,
            status, origem_tipo, origem, conta_bancaria_id, observacao, recorrencia_id
          )
          SELECT
            r.usuario_id,
            r.categoria_id,
            r.descricao,
            r.valor,
            make_date(
              EXTRACT(YEAR FROM mes_ref)::INTEGER,
              EXTRACT(MONTH FROM mes_ref)::INTEGER,
              LEAST(
                r.dia_vencimento,
                EXTRACT(DAY FROM (mes_ref + INTERVAL '1 month - 1 day'))::INTEGER
              )
            ),
            'RECORRENTE',
            'A_RECEBER',
            COALESCE(r.origem_tipo, 'CLIENTE'),
            r.origem,
            r.conta_bancaria_id,
            r.observacao,
            r.id
          FROM recorrencias r
          CROSS JOIN generate_series(
            DATE '2026-06-01',
            DATE '2026-12-01',
            INTERVAL '1 month'
          ) AS mes_ref
          WHERE r.tipo = 'RECEBER'
            AND r.ativo = true
            AND r.data_inicio <= (mes_ref + INTERVAL '1 month - 1 day')::DATE
            AND NOT EXISTS (
              SELECT 1
              FROM contas_receber cr
              WHERE cr.recorrencia_id = r.id
                AND DATE_TRUNC('month', cr.data_vencimento) = mes_ref
            );

          INSERT INTO app_migrations (id)
          VALUES ('20260703_contas_receber_recorrentes_desde_maio');
        END IF;
      END
      $$;

      DO $$
      DECLARE
        correspondencia RECORD;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_conciliar_recebimentos_existentes'
        ) THEN
          FOR correspondencia IN
            SELECT DISTINCT ON (cr.id)
              cr.id AS conta_id,
              cr.data_vencimento,
              r.id AS recorrencia_id
            FROM contas_receber cr
            JOIN recorrencias r
              ON r.usuario_id = cr.usuario_id
             AND r.tipo = 'RECEBER'
             AND r.data_inicio = DATE '2026-05-01'
             AND (
               LOWER(BTRIM(r.descricao)) = LOWER(BTRIM(cr.descricao))
               OR LOWER(BTRIM(r.descricao)) LIKE LOWER(BTRIM(cr.descricao)) || '%'
               OR LOWER(BTRIM(cr.descricao)) LIKE LOWER(BTRIM(r.descricao)) || '%'
             )
            WHERE cr.recorrencia_id IS NULL
              AND cr.data_vencimento >= DATE '2026-06-01'
            ORDER BY cr.id, r.id
          LOOP
            DELETE FROM contas_receber
            WHERE recorrencia_id = correspondencia.recorrencia_id
              AND DATE_TRUNC('month', data_vencimento) =
                  DATE_TRUNC('month', correspondencia.data_vencimento)
              AND id <> correspondencia.conta_id;

            UPDATE contas_receber
            SET recorrencia_id = correspondencia.recorrencia_id,
                tipo = 'RECORRENTE',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = correspondencia.conta_id;
          END LOOP;

          INSERT INTO app_migrations (id)
          VALUES ('20260703_conciliar_recebimentos_existentes');
        END IF;
      END
      $$;

      DO $$
      DECLARE
        pagamento RECORD;
        cartao_pagamento RECORD;
        mes_fechamento DATE;
        competencia DATE;
        fatura_destino_id INTEGER;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_separar_credito_e_caixa'
        ) THEN
          UPDATE faturas
          SET valor_informado = valor_total
          WHERE valor_informado IS NULL;

          UPDATE contas_pagar cp
          SET cartao_id = c.id
          FROM cartoes c
          WHERE cp.usuario_id = c.usuario_id
            AND cp.cartao_id IS NULL
            AND (
              (cp.forma_pagamento = 'CREDITO_BRADESCO' AND c.nome ILIKE '%Bradesco%')
              OR
              (cp.forma_pagamento = 'CREDITO_SANTANDER' AND c.nome ILIKE '%Santander%')
            );

          UPDATE recorrencias r
          SET cartao_id = c.id,
              forma_pagamento = 'CARTAO_CREDITO'
          FROM cartoes c
          WHERE r.usuario_id = c.usuario_id
            AND (
              (r.forma_pagamento = 'CREDITO_BRADESCO' AND c.nome ILIKE '%Bradesco%')
              OR
              (r.forma_pagamento = 'CREDITO_SANTANDER' AND c.nome ILIKE '%Santander%')
            );

          FOR pagamento IN
            SELECT cp.*
            FROM contas_pagar cp
            WHERE cp.status = 'PAGO'
              AND cp.cartao_id IS NOT NULL
              AND cp.fatura_id IS NULL
              AND cp.forma_pagamento IN (
                'CREDITO_BRADESCO',
                'CREDITO_SANTANDER',
                'CARTAO_CREDITO'
              )
            ORDER BY cp.usuario_id, cp.data_pagamento, cp.id
          LOOP
            SELECT id, dia_fechamento, dia_vencimento
            INTO cartao_pagamento
            FROM cartoes
            WHERE id = pagamento.cartao_id
              AND usuario_id = pagamento.usuario_id;

            IF FOUND THEN
              mes_fechamento := DATE_TRUNC(
                'month',
                COALESCE(pagamento.data_pagamento, pagamento.data_vencimento)
              )::DATE;

              IF EXTRACT(DAY FROM COALESCE(pagamento.data_pagamento, pagamento.data_vencimento))
                   >= cartao_pagamento.dia_fechamento THEN
                mes_fechamento := (mes_fechamento + INTERVAL '1 month')::DATE;
              END IF;

              competencia := mes_fechamento;
              IF cartao_pagamento.dia_vencimento <= cartao_pagamento.dia_fechamento THEN
                competencia := (competencia + INTERVAL '1 month')::DATE;
              END IF;

              INSERT INTO faturas (
                cartao_id, usuario_id, mes_referencia, ano_referencia,
                valor_total, valor_pago
              )
              VALUES (
                cartao_pagamento.id,
                pagamento.usuario_id,
                EXTRACT(MONTH FROM competencia)::INTEGER,
                EXTRACT(YEAR FROM competencia)::INTEGER,
                0,
                0
              )
              ON CONFLICT (usuario_id, cartao_id, mes_referencia, ano_referencia)
              DO UPDATE SET cartao_id = EXCLUDED.cartao_id
              RETURNING id INTO fatura_destino_id;

              UPDATE contas_pagar
              SET cartao_id = cartao_pagamento.id,
                  fatura_id = fatura_destino_id,
                  forma_pagamento = 'CARTAO_CREDITO',
                  data_pagamento = COALESCE(data_pagamento, data_vencimento),
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = pagamento.id;

              DELETE FROM movimentacoes
              WHERE usuario_id = pagamento.usuario_id
                AND referencia_tipo = 'CONTA_PAGAR'
                AND referencia_id = pagamento.id;
            END IF;
          END LOOP;

          UPDATE contas_pagar
          SET forma_pagamento = 'CARTAO_CREDITO',
              updated_at = CURRENT_TIMESTAMP
          WHERE cartao_id IS NOT NULL
            AND forma_pagamento IN ('CREDITO_BRADESCO', 'CREDITO_SANTANDER');

          UPDATE faturas f
          SET valor_total = GREATEST(
            COALESCE(f.valor_informado, 0),
            COALESCE((
              SELECT SUM(cp.valor)
              FROM contas_pagar cp
              WHERE cp.fatura_id = f.id
            ), 0)
          ),
          valor_pago = LEAST(
            COALESCE(f.valor_pago, 0),
            GREATEST(
              COALESCE(f.valor_informado, 0),
              COALESCE((
                SELECT SUM(cp.valor)
                FROM contas_pagar cp
                WHERE cp.fatura_id = f.id
              ), 0)
            )
          );

          INSERT INTO app_migrations (id)
          VALUES ('20260703_separar_credito_e_caixa');
        END IF;
      END
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_datas_pagamentos_credito'
        ) THEN
          UPDATE contas_pagar
          SET data_pagamento = data_vencimento,
              updated_at = CURRENT_TIMESTAMP
          WHERE status = 'PAGO'
            AND cartao_id IS NOT NULL
            AND data_pagamento IS NULL;

          INSERT INTO app_migrations (id)
          VALUES ('20260703_datas_pagamentos_credito');
        END IF;
      END
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM app_migrations
          WHERE id = '20260703_datas_pagamentos_restantes'
        ) THEN
          UPDATE contas_pagar cp
          SET data_pagamento = COALESCE(
                (
                  SELECT MAX(m.data_movimentacao)
                  FROM movimentacoes m
                  WHERE m.usuario_id = cp.usuario_id
                    AND m.referencia_tipo = 'CONTA_PAGAR'
                    AND m.referencia_id = cp.id
                ),
                cp.data_vencimento
              ),
              updated_at = CURRENT_TIMESTAMP
          WHERE cp.status = 'PAGO'
            AND cp.data_pagamento IS NULL;

          INSERT INTO app_migrations (id)
          VALUES ('20260703_datas_pagamentos_restantes');
        END IF;
      END
      $$;
    `);
    console.log('✅ Migration: observações e formas de pagamento das recorrências verificadas e propagadas.');
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
