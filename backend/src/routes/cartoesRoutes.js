const express=require('express');const c=require('../controllers/cartoesController');const { exigirPermissao } = require('../middleware/permissoes');
const r=express.Router();r.get('/',exigirPermissao('CARTOES_OPERAR'),c.listarCartoes);r.post('/',exigirPermissao('CARTOES_OPERAR'),c.emitirCartao);r.patch('/:id/estado',exigirPermissao('CARTOES_OPERAR'),c.alterarEstadoCartao);module.exports=r;
