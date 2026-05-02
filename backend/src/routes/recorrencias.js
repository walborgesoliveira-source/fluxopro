const express = require('express');
const router = express.Router();
const recorrenciasController = require('../controllers/recorrenciasController');

router.get('/', recorrenciasController.listar);
router.post('/', recorrenciasController.criar);
router.put('/:id', recorrenciasController.atualizar);
router.delete('/:id', recorrenciasController.excluir);

router.post('/gerar', recorrenciasController.gerarMensal);

module.exports = router;
