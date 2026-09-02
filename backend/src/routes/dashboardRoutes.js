const express = require('express');
const { estatisticas } = require('../controllers/dashboardController');
const { exigirPermissao } = require('../middleware/permissoes');
const router = express.Router();
router.get('/stats', exigirPermissao('DASHBOARD_VISUALIZAR'), estatisticas);
module.exports = router;
