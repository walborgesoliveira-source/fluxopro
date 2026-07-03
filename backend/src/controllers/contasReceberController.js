const pool = require('../database/connection');

async function resolverContaBancaria(client, usuarioId, contaBancariaId) {
  if (!contaBancariaId) return null;

  const contaPorCodigo = {
    BRADESCO: 'Bradesco',
    SANTANDER: 'Santander',
    CREFISA: 'Crefisa',
  };
  const bancoNome = contaPorCodigo[String(contaBancariaId).toUpperCase()] || null;

  if (bancoNome) {
    const criada = await client.query(
      `INSERT INTO contas_bancarias (usuario_id, nome, saldo_inicial)
       VALUES ($1, $2, 0)
       ON CONFLICT (usuario_id, nome) DO UPDATE SET ativo = contas_bancarias.ativo
       RETURNING id`,
      [usuarioId, bancoNome]
    );
    return criada.rows[0].id;
  }

  const contaRes = await client.query(
    'SELECT id FROM contas_bancarias WHERE id = $1 AND usuario_id = $2 AND ativo = true',
    [contaBancariaId, usuarioId]
  );
  return contaRes.rows[0]?.id || null;
}

async function sincronizarRecorrenciaContaReceber(client, usuarioId, conta) {
  if (conta.tipo !== 'RECORRENTE') {
    if (conta.recorrencia_id) {
      await client.query(
        'UPDATE recorrencias SET ativo = false WHERE id = $1 AND usuario_id = $2',
        [conta.recorrencia_id, usuarioId]
      );
    }
    return null;
  }

  const vencimento = new Date(conta.data_vencimento);
  const diaVencimento = vencimento.getUTCDate();
  const dataInicio = `${vencimento.getUTCFullYear()}-${String(vencimento.getUTCMonth() + 1).padStart(2, '0')}-01`;

  if (conta.recorrencia_id) {
    await client.query(
      `UPDATE recorrencias
       SET descricao = $1,
           valor = $2,
           dia_vencimento = $3,
           categoria_id = $4,
           origem = $5,
           origem_tipo = $6,
           conta_bancaria_id = $7,
           observacao = $8,
           ativo = true
       WHERE id = $9 AND usuario_id = $10`,
      [
        conta.descricao,
        conta.valor,
        diaVencimento,
        conta.categoria_id || null,
        conta.origem || 'PF',
        conta.origem_tipo || 'CLIENTE',
        conta.conta_bancaria_id || null,
        conta.observacao || null,
        conta.recorrencia_id,
        usuarioId,
      ]
    );
    return conta.recorrencia_id;
  }

  const result = await client.query(
    `INSERT INTO recorrencias (
       usuario_id, tipo, descricao, valor, dia_vencimento, categoria_id,
       origem, origem_tipo, conta_bancaria_id, observacao, data_inicio, ativo
     )
     VALUES ($1, 'RECEBER', $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
     RETURNING id`,
    [
      usuarioId,
      conta.descricao,
      conta.valor,
      diaVencimento,
      conta.categoria_id || null,
      conta.origem || 'PF',
      conta.origem_tipo || 'CLIENTE',
      conta.conta_bancaria_id || null,
      conta.observacao || null,
      dataInicio,
    ]
  );
  return result.rows[0].id;
}

const contasReceberController = {
  async listar(req, res) {
    try {
      const { mes, ano, status, origem, tipo } = req.query;
      let query = `SELECT cr.*, c.nome as categoria_nome, c.cor as categoria_cor, cb.nome as conta_bancaria_nome
        FROM contas_receber cr
        LEFT JOIN categorias c ON cr.categoria_id = c.id
        LEFT JOIN contas_bancarias cb ON cr.conta_bancaria_id = cb.id
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { descricao, valor, data_vencimento, tipo, origem_tipo, origem, categoria_id, observacao, conta_bancaria_id } = req.body;
      const contaBancariaId = await resolverContaBancaria(client, req.userId, conta_bancaria_id);
      if (conta_bancaria_id && !contaBancariaId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Conta de depósito inválida.' });
      }

      const result = await client.query(
        `INSERT INTO contas_receber (usuario_id, descricao, valor, data_vencimento, tipo, origem_tipo, origem, categoria_id, observacao, conta_bancaria_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.userId, descricao, valor, data_vencimento, tipo, origem_tipo||'CLIENTE', origem||'PF', categoria_id, observacao, contaBancariaId]
      );
      let conta = result.rows[0];
      const recorrenciaId = await sincronizarRecorrenciaContaReceber(client, req.userId, conta);
      if (recorrenciaId) {
        const atualizada = await client.query(
          'UPDATE contas_receber SET recorrencia_id = $1 WHERE id = $2 RETURNING *',
          [recorrenciaId, conta.id]
        );
        conta = atualizada.rows[0];
      }

      await client.query('COMMIT');
      res.status(201).json({ conta, message: 'Conta a receber criada!' });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ error: 'Erro interno.' });
    }
    finally { client.release(); }
  },

  async atualizar(req, res) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const { descricao, valor, data_vencimento, tipo, status, origem_tipo, origem, categoria_id, observacao, data_recebimento, conta_bancaria_id } = req.body;
      const alterarDataRecebimento = Object.prototype.hasOwnProperty.call(req.body, 'data_recebimento');

      const anteriorRes = await client.query(
        'SELECT * FROM contas_receber WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
        [id, req.userId]
      );
      if (!anteriorRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Conta não encontrada.' });
      }
      const anterior = anteriorRes.rows[0];

      let contaBancariaId = Object.prototype.hasOwnProperty.call(req.body, 'conta_bancaria_id') ? conta_bancaria_id : undefined;
      if (contaBancariaId) {
        contaBancariaId = await resolverContaBancaria(client, req.userId, contaBancariaId);
        if (!contaBancariaId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Conta de depósito inválida.' });
        }
      }

      const result = await client.query(
        `UPDATE contas_receber SET descricao=COALESCE($1,descricao), valor=COALESCE($2,valor),
         data_vencimento=COALESCE($3,data_vencimento), tipo=COALESCE($4,tipo), status=COALESCE($5,status),
         origem_tipo=COALESCE($6,origem_tipo), origem=COALESCE($7,origem), categoria_id=COALESCE($8,categoria_id),
         observacao=COALESCE($9,observacao),
         data_recebimento=CASE WHEN $10::boolean THEN $11::date ELSE data_recebimento END,
         conta_bancaria_id=COALESCE($12,conta_bancaria_id),
         updated_at=CURRENT_TIMESTAMP
         WHERE id=$13 AND usuario_id=$14 RETURNING *`,
        [
          descricao,
          valor,
          data_vencimento,
          tipo,
          status,
          origem_tipo,
          origem,
          categoria_id,
          observacao,
          alterarDataRecebimento,
          data_recebimento || null,
          contaBancariaId,
          id,
          req.userId,
        ]
      );

      let contaAtualizada = result.rows[0];
      const recorrenciaId = await sincronizarRecorrenciaContaReceber(client, req.userId, contaAtualizada);
      if (recorrenciaId && recorrenciaId !== contaAtualizada.recorrencia_id) {
        const atualizada = await client.query(
          'UPDATE contas_receber SET recorrencia_id = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
          [recorrenciaId, id, req.userId]
        );
        contaAtualizada = atualizada.rows[0];
      }
      const deveSincronizarRecebimento = contaAtualizada.status === 'RECEBIDO'
        && (anterior.status !== 'RECEBIDO' || String(anterior.conta_bancaria_id || '') !== String(contaAtualizada.conta_bancaria_id || ''));
      if (deveSincronizarRecebimento) {
        if (!contaAtualizada.conta_bancaria_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Informe a conta onde o valor foi depositado.' });
        }

        await client.query(
          `DELETE FROM movimentacoes
           WHERE usuario_id = $1 AND referencia_tipo = 'CONTA_RECEBER' AND referencia_id = $2`,
          [req.userId, id]
        );

        await client.query(
          `INSERT INTO movimentacoes (usuario_id,conta_bancaria_id,tipo,valor,descricao,origem,referencia_tipo,referencia_id,data_movimentacao)
           VALUES ($1,$2,'ENTRADA',$3,$4,$5,'CONTA_RECEBER',$6,COALESCE($7,CURRENT_DATE))`,
          [
            req.userId,
            contaAtualizada.conta_bancaria_id,
            contaAtualizada.valor,
            contaAtualizada.descricao,
            contaAtualizada.origem,
            id,
            contaAtualizada.data_recebimento,
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ conta: contaAtualizada, message: 'Conta atualizada!' });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
      res.status(500).json({ error: 'Erro interno.' });
    } finally {
      client.release();
    }
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
