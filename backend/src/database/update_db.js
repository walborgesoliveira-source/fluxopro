const pool = require('./connection');

async function updateDB() {
  try {
    console.log('🔄 Atualizando banco de dados (Fase 3)...');
    await pool.query(`
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS cartao_id INTEGER REFERENCES cartoes(id) ON DELETE SET NULL;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS fatura_id INTEGER REFERENCES faturas(id) ON DELETE SET NULL;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS parcela_atual INTEGER;
      ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS total_parcelas INTEGER;
    `);
    console.log('✅ Banco de dados atualizado com sucesso! Novas colunas adicionadas à tabela contas_pagar.');
  } catch (error) {
    console.error('❌ Erro ao atualizar banco:', error.message);
  } finally {
    await pool.end();
  }
}

updateDB();
