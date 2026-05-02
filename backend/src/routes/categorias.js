const express = require('express');
const categoriasController = require('../controllers/categoriasController');
const router = express.Router();

router.get('/', categoriasController.listar);
router.post('/', categoriasController.criar);

module.exports = router;
