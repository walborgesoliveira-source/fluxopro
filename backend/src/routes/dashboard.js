const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const router = express.Router();

router.get('/resumo', dashboardController.resumo);
router.get('/caixa-origem', dashboardController.caixaPorOrigem);
router.get('/graficos', dashboardController.graficos);
router.get('/contas-correntes', dashboardController.contasCorrentes);
router.put('/contas-correntes/:id', dashboardController.atualizarContaCorrente);

module.exports = router;
