const pool = require('../config/database');

function exigirPermissao(...codigos) {
    const permitidas = codigos.filter(Boolean);

    return async (req, res, next) => {
        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: 'Sessão não autenticada.'
            });
        }

        if (!permitidas.length) return next();

        try {
            const resultado = await pool.query(`
                SELECT p.codigo
                FROM usuarios u
                INNER JOIN perfil_permissoes pp ON pp.perfil_id = u.perfil_id
                INNER JOIN permissoes p ON p.id = pp.permissao_id
                WHERE u.id = $1
                  AND u.ativo = TRUE
                  AND p.codigo = ANY($2::text[])
                LIMIT 1
            `, [req.user.id, permitidas]);

            if (!resultado.rows.length) {
                return res.status(403).json({
                    success: false,
                    message: 'Não possui permissão para executar esta operação.'
                });
            }

            return next();
        } catch (error) {
            console.error('[PRISMA] Erro ao validar permissão:', error);
            return res.status(500).json({
                success: false,
                message: 'Não foi possível validar as permissões do operador.'
            });
        }
    };
}

module.exports = { exigirPermissao };
