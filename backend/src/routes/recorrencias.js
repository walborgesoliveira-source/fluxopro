const express = require('express');
const router = express.Router();
const recorrenciasController = require('../controllers/recorrenciasController');

// CRUD básico
router.get('/', recorrenciasController.listar);
router.post('/', recorrenciasController.criar);
router.put('/:id', recorrenciasController.atualizar);
router.delete('/:id', recorrenciasController.excluir);

// Geração mensal
router.post('/gerar', recorrenciasController.gerarMensal);

// Status mensal de pagamento
router.get('/status', recorrenciasController.listarComStatus);
router.get('/totais', recorrenciasController.totaisMes);
router.post('/:id/pagar', recorrenciasController.marcarPago);
router.post('/:id/despagar', recorrenciasController.marcarPendente);

module.exports = router;
