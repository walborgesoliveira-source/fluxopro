const express = require('express');
const router = express.Router();
const cartoesController = require('../controllers/cartoesController');

// Rotas de cartões
router.get('/', cartoesController.listarCartoes);
router.post('/', cartoesController.criarCartao);
router.delete('/:id', cartoesController.excluirCartao);

// Rotas de faturas e compras
router.get('/faturas', cartoesController.listarFaturas);
router.post('/compras', cartoesController.adicionarCompra);
router.get('/faturas/:id/compras', cartoesController.listarComprasFatura);
router.put('/compras/:id', cartoesController.editarCompra);
router.delete('/compras/:id', cartoesController.excluirCompra);

module.exports = router;
