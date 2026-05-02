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

module.exports = router;
