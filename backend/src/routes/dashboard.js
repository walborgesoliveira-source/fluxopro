const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const router = express.Router();

router.get('/resumo', dashboardController.resumo);
router.get('/caixa-origem', dashboardController.caixaPorOrigem);
router.get('/graficos', dashboardController.graficos);

module.exports = router;
