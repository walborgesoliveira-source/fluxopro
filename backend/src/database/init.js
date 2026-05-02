/**
 * FluxoPro — Inicialização do Banco de Dados
 * 
 * Cria todas as tabelas necessárias para o sistema.
 * Execute com: npm run db:init
 */

const pool = require('./connection');

const initSQL = `
-- ================================================
-- TABELA: usuarios
-- ================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  tipo VARCHAR(10) DEFAULT 'PF' CHECK (tipo IN ('PF', 'PJ')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: categorias
-- ================================================
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
  cor VARCHAR(7) DEFAULT '#6366f1',
  icone VARCHAR(50) DEFAULT 'folder',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: contas_pagar
-- ================================================
CREATE TABLE IF NOT EXISTS contas_pagar (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('FIXA', 'VARIAVEL')),
  status VARCHAR(10) DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO')),
  forma_pagamento VARCHAR(20) DEFAULT 'OUTROS' CHECK (forma_pagamento IN ('CARTAO', 'DINHEIRO', 'OUTROS')),
  origem VARCHAR(5) DEFAULT 'PF' CHECK (origem IN ('PF', 'PJ')),
  observacao TEXT,
  recorrente BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: contas_receber
-- ================================================
CREATE TABLE IF NOT EXISTS contas_receber (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_recebimento DATE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('RECORRENTE', 'AVULSO')),
  status VARCHAR(15) DEFAULT 'A_RECEBER' CHECK (status IN ('A_RECEBER', 'RECEBIDO')),
  origem_tipo VARCHAR(10) DEFAULT 'CLIENTE' CHECK (origem_tipo IN ('CLIENTE', 'SERVICO', 'OUTROS')),
  origem VARCHAR(5) DEFAULT 'PF' CHECK (origem IN ('PF', 'PJ')),
  observacao TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: movimentacoes (caixa)
-- ================================================
CREATE TABLE IF NOT EXISTS movimentacoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
  valor DECIMAL(12,2) NOT NULL,
  descricao VARCHAR(255),
  origem VARCHAR(5) DEFAULT 'PF' CHECK (origem IN ('PF', 'PJ')),
  referencia_tipo VARCHAR(20),
  referencia_id INTEGER,
  data_movimentacao DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: recorrencias
-- ================================================
CREATE TABLE IF NOT EXISTS recorrencias (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('PAGAR', 'RECEBER')),
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  origem VARCHAR(5) DEFAULT 'PF' CHECK (origem IN ('PF', 'PJ')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: cartoes
-- ================================================
CREATE TABLE IF NOT EXISTS cartoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  bandeira VARCHAR(50),
  limite DECIMAL(12,2) DEFAULT 0,
  dia_fechamento INTEGER CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- TABELA: faturas
-- ================================================
CREATE TABLE IF NOT EXISTS faturas (
  id SERIAL PRIMARY KEY,
  cartao_id INTEGER REFERENCES cartoes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  valor_total DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(10) DEFAULT 'ABERTA' CHECK (status IN ('ABERTA', 'FECHADA', 'PAGA')),
  data_pagamento DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- ÍNDICES
-- ================================================
CREATE INDEX IF NOT EXISTS idx_contas_pagar_usuario ON contas_pagar(usuario_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_receber_usuario ON contas_receber(usuario_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_usuario ON movimentacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes(data_movimentacao);

-- ================================================
-- CATEGORIAS PADRÃO (inseridas apenas se a tabela está vazia)
-- ================================================
INSERT INTO categorias (nome, tipo, cor, icone)
SELECT * FROM (VALUES
  ('Aluguel', 'DESPESA', '#ef4444', 'home'),
  ('Alimentação', 'DESPESA', '#f97316', 'utensils'),
  ('Transporte', 'DESPESA', '#eab308', 'car'),
  ('Internet/Telefone', 'DESPESA', '#3b82f6', 'wifi'),
  ('Energia', 'DESPESA', '#a855f7', 'zap'),
  ('Saúde', 'DESPESA', '#ec4899', 'heart'),
  ('Educação', 'DESPESA', '#14b8a6', 'book'),
  ('Outros (Despesa)', 'DESPESA', '#6b7280', 'more-horizontal'),
  ('Salário', 'RECEITA', '#22c55e', 'briefcase'),
  ('Freelance', 'RECEITA', '#10b981', 'code'),
  ('Investimentos', 'RECEITA', '#0ea5e9', 'trending-up'),
  ('Clientes', 'RECEITA', '#8b5cf6', 'users'),
  ('Outros (Receita)', 'RECEITA', '#6b7280', 'more-horizontal')
) AS v(nome, tipo, cor, icone)
WHERE NOT EXISTS (SELECT 1 FROM categorias LIMIT 1);
`;

async function initDatabase() {
  try {
    console.log('🔄 Iniciando criação das tabelas...');
    await pool.query(initSQL);
    console.log('✅ Banco de dados inicializado com sucesso!');
    console.log('📊 Tabelas criadas: usuarios, categorias, contas_pagar, contas_receber, movimentacoes, recorrencias, cartoes, faturas');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase();
