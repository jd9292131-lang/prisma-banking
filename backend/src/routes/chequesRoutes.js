const express=require('express');const c=require('../controllers/chequesController');const { exigirPermissao } = require('../middleware/permissoes');
const r=express.Router();r.get('/',exigirPermissao('CHEQUES_OPERAR'),c.listarCheques);r.post('/',exigirPermissao('CHEQUES_OPERAR'),c.emitirCheque);r.patch('/:id/estado',exigirPermissao('CHEQUES_OPERAR'),c.alterarEstadoCheque);module.exports=r;
