const express = require('express');
const contasPagarController = require('../controllers/contasPagarController');
const router = express.Router();

router.get('/', contasPagarController.listar);
router.post('/', contasPagarController.criar);
router.put('/:id', contasPagarController.atualizar);
router.delete('/:id', contasPagarController.excluir);

module.exports = router;
