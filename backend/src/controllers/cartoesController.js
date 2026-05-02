const pool = require('../database/connection');

/**
 * Helper: Calcula mês, ano e data de vencimento da fatura com base na data de compra, dia de fechamento e dia de vencimento.
 */
function calcularFatura(dataCompraStr, diaFechamento, diaVencimento, parcelasAdicionais = 0) {
  const d = new Date(dataCompraStr + 'T00:00:00');
  let mes = d.getMonth() + 1; // 1-12
  let ano = d.getFullYear();

  // Se o dia da compra >= dia de fechamento, entra na fatura do mês seguinte
  if (d.getDate() >= diaFechamento) {
    mes++;
  }

  // Adiciona as parcelas
  mes += parcelasAdicionais;

  // Ajusta caso passe de dezembro
  while (mes > 12) {
    mes -= 12;
    ano++;
  }

  // Formata o vencimento: YYYY-MM-DD
  const mesStr = mes.toString().padStart(2, '0');
  const diaStr = diaVencimento.toString().padStart(2, '0');
  const dataVencimento = `${ano}-${mesStr}-${diaStr}`;

  return { mes, ano, dataVencimento };
}

const cartoesController = {
  // ==========================
  // CARTÕES
  // ==========================
  async listarCartoes(req, res) {
    try {
      const result = await pool.query('SELECT * FROM cartoes WHERE usuario_id = $1 ORDER BY nome ASC', [req.userId]);
      res.json({ cartoes: result.rows });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async criarCartao(req, res) {
    try {
      const { nome, bandeira, limite, dia_fechamento, dia_vencimento } = req.body;
      const result = await pool.query(
        `INSERT INTO cartoes (usuario_id, nome, bandeira, limite, dia_fechamento, dia_vencimento)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, nome, bandeira, limite || 0, dia_fechamento, dia_vencimento]
      );
      res.status(201).json({ cartao: result.rows[0], message: 'Cartão criado com sucesso!' });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async excluirCartao(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM cartoes WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.userId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
      res.json({ message: 'Cartão excluído com sucesso!' });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  // ==========================
  // FATURAS E COMPRAS
  // ==========================
  async listarFaturas(req, res) {
    try {
      const { cartao_id } = req.query;
      let query = 'SELECT f.*, c.nome as cartao_nome FROM faturas f JOIN cartoes c ON f.cartao_id = c.id WHERE f.usuario_id = $1';
      const params = [req.userId];
      
      if (cartao_id) {
        query += ' AND f.cartao_id = $2';
        params.push(cartao_id);
      }
      query += ' ORDER BY f.ano_referencia DESC, f.mes_referencia DESC';

      const result = await pool.query(query, params);
      res.json({ faturas: result.rows });
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async adicionarCompra(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { cartao_id, descricao, valor_total, data_compra, parcelas, categoria_id, origem } = req.body;
      const qtdeParcelas = parseInt(parcelas) || 1;
      const valorParcela = parseFloat(valor_total) / qtdeParcelas;

      // Buscar o cartão
      const cartaoRes = await client.query('SELECT dia_fechamento, dia_vencimento FROM cartoes WHERE id = $1 AND usuario_id = $2', [cartao_id, req.userId]);
      if (cartaoRes.rows.length === 0) {
        throw new Error('Cartão não encontrado.');
      }
      const cartao = cartaoRes.rows[0];

      const contasCriadas = [];

      for (let i = 0; i < qtdeParcelas; i++) {
        // Calcular quando essa parcela vai cair
        const { mes, ano, dataVencimento } = calcularFatura(data_compra, cartao.dia_fechamento, cartao.dia_vencimento, i);

        // Encontrar ou criar a fatura
        let faturaRes = await client.query('SELECT id FROM faturas WHERE cartao_id = $1 AND mes_referencia = $2 AND ano_referencia = $3', [cartao_id, mes, ano]);
        let faturaId;

        if (faturaRes.rows.length > 0) {
          faturaId = faturaRes.rows[0].id;
          // Atualiza valor da fatura
          await client.query('UPDATE faturas SET valor_total = valor_total + $1 WHERE id = $2', [valorParcela, faturaId]);
        } else {
          // Cria a fatura
          const newFatura = await client.query(
            `INSERT INTO faturas (cartao_id, usuario_id, mes_referencia, ano_referencia, valor_total)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [cartao_id, req.userId, mes, ano, valorParcela]
          );
          faturaId = newFatura.rows[0].id;
        }

        // Criar registro em contas a pagar vinculado à fatura
        const descParcela = qtdeParcelas > 1 ? \`\${descricao} (\${i+1}/\${qtdeParcelas})\` : descricao;
        
        const cp = await client.query(
          `INSERT INTO contas_pagar (usuario_id, categoria_id, cartao_id, fatura_id, descricao, valor, data_vencimento, tipo, forma_pagamento, origem, parcela_atual, total_parcelas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'VARIAVEL', 'CARTAO', $8, $9, $10) RETURNING *`,
          [req.userId, categoria_id || null, cartao_id, faturaId, descParcela, valorParcela, dataVencimento, origem || 'PF', i+1, qtdeParcelas]
        );
        contasCriadas.push(cp.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Compra registrada com sucesso!', parcelas: contasCriadas.length });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(400).json({ error: e.message || 'Erro ao registrar compra no cartão.' });
    } finally {
      client.release();
    }
  }
};

module.exports = cartoesController;
