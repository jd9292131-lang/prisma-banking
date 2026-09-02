require('../config/env');

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET não configurado ou demasiado curto. Configure um segredo com pelo menos 32 caracteres em backend/.env.');
}

function criarToken(utilizador) {
    return jwt.sign(
        {
            sub: utilizador.id,
            codigoOperador: utilizador.codigo_operador,
            perfil: utilizador.perfil
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function exigirAutenticacao(req, res, next) {
    const header = String(req.headers.authorization || '');
    const [tipo, token] = header.split(' ');

    if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({
            success: false,
            message: 'Sessão não autenticada ou expirada.'
        });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = {
            id: payload.sub,
            codigoOperador: payload.codigoOperador,
            perfil: payload.perfil
        };
        return next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Sessão inválida ou expirada.'
        });
    }
}

module.exports = {
    criarToken,
    exigirAutenticacao,
    JWT_EXPIRES_IN
};
