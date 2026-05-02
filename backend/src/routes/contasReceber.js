const express = require('express');
const contasReceberController = require('../controllers/contasReceberController');
const router = express.Router();

router.get('/', contasReceberController.listar);
router.post('/', contasReceberController.criar);
router.put('/:id', contasReceberController.atualizar);
router.delete('/:id', contasReceberController.excluir);

module.exports = router;
