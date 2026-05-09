const express = require('express');
const router = express.Router();
const cartoesController = require('../controllers/cartoesController');

// Rotas de cartões
router.get('/', cartoesController.listarCartoes);
router.post('/', cartoesController.criarCartao);
router.put('/:id', cartoesController.editarCartao);
router.delete('/:id', cartoesController.excluirCartao);
router.post('/:id/fatura-mes', cartoesController.salvarFaturaMes);

// Rotas de faturas e compras
router.get('/faturas', cartoesController.listarFaturas);
router.put('/faturas/:id/pagamento', cartoesController.atualizarPagamentoFatura);
router.delete('/faturas/:id', cartoesController.excluirFatura);
router.post('/compras', cartoesController.adicionarCompra);
router.get('/faturas/:id/compras', cartoesController.listarComprasFatura);
router.put('/compras/:id', cartoesController.editarCompra);
router.delete('/compras/:id', cartoesController.excluirCompra);

module.exports = router;
