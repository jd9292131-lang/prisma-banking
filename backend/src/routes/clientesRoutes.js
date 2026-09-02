const express = require('express');

const {
    listarClientes,
    obterCliente,
    criarCliente,
    atualizarCliente,
    alterarEstado,
    eliminarCliente
} = require('../controllers/clientesController');

const { exigirPermissao } = require('../middleware/permissoes');

const router = express.Router();

/* GET /api/clientes */
router.get('/', exigirPermissao('CLIENTES_VISUALIZAR'), listarClientes);

/* GET /api/clientes/:id */
router.get('/:id', exigirPermissao('CLIENTES_VISUALIZAR'), obterCliente);

/* POST /api/clientes */
router.post('/', exigirPermissao('CLIENTES_CRIAR'), criarCliente);

/* PUT /api/clientes/:id */
router.put('/:id', exigirPermissao('CLIENTES_EDITAR'), atualizarCliente);

/* PATCH /api/clientes/:id/estado */
router.patch('/:id/estado', exigirPermissao('CLIENTES_EDITAR'), alterarEstado);

/* DELETE /api/clientes/:id — requer CLIENTES_ELIMINAR */
router.delete('/:id', exigirPermissao('CLIENTES_ELIMINAR'), eliminarCliente);

module.exports = router;
