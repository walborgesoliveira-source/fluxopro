const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const router = express.Router();

router.get('/resumo', dashboardController.resumo);
router.get('/caixa-origem', dashboardController.caixaPorOrigem);

module.exports = router;
