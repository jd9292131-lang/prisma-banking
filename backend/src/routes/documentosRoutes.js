const express=require('express');
const c=require('../controllers/documentosController');
const { exigirPermissao } = require('../middleware/permissoes');
const r=express.Router();
r.get('/extrato/:contaId.pdf',exigirPermissao('DOCUMENTOS_VISUALIZAR'),c.extratoConta);
r.get('/comprovativo/:id.pdf',exigirPermissao('DOCUMENTOS_VISUALIZAR'),c.comprovativoPDF);
module.exports=r;
