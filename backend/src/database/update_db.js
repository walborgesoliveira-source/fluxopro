const pool = require('./connection');

async function updateDB() {
  try {
    console.log('🔄 Atualizando banco de dados (Fase 3)...');
    await pool.query(`
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS cartao_id INTEGER REFERENCES cartoes(id) ON DELETE SET NULL;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS fatura_id INTEGER REFERENCES faturas(id) ON DELETE SET NULL;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS parcela_atual INTEGER;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS total_parcelas INTEGER;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS recorrencia_id INTEGER REFERENCES recorrencias(id) ON DELETE SET NULL;
      ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS recorrencia_id INTEGER REFERENCES recorrencias(id) ON DELETE SET NULL;
      ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
      ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_forma_pagamento_check;
      ALTER TABLE contas_pagar ALTER COLUMN forma_pagamento TYPE VARCHAR(30);
      ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER;
      ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30);
      ALTER TABLE faturas ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(12,2) DEFAULT 0;
      CREATE TABLE IF NOT EXISTS contas_bancarias (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        nome VARCHAR(80) NOT NULL,
        saldo_inicial DECIMAL(12,2) DEFAULT 0,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, nome)
      );
      INSERT INTO contas_bancarias (usuario_id, nome, saldo_inicial)
      SELECT u.id, banco.nome, 0
      FROM usuarios u
      CROSS JOIN (VALUES ('Bradesco'), ('Santander'), ('Crefisa')) AS banco(nome)
      ON CONFLICT (usuario_id, nome) DO NOTHING;
    `);
    console.log('✅ Banco de dados atualizado com sucesso! Novas colunas adicionadas à tabela contas_pagar.');
  } catch (error) {
    console.error('❌ Erro ao atualizar banco:', error.message);
  } finally {
    await pool.end();
  }
}

updateDB();
