const express = require('express');
const router = express.Router();
const { login, registarFormando } = require('../controllers/authController');
router.post('/login', login);
router.post('/registo-formando', registarFormando);
module.exports = router;
