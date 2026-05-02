const express = require('express');
const router = express.Router();
const relatoriosController = require('../controllers/relatoriosController');

router.get('/comparativo', relatoriosController.comparativo);
router.get('/projecao', relatoriosController.projecao);

module.exports = router;
