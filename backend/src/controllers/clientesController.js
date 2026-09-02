const pool = require('../config/database');


/*
 * =========================================================
 * LISTAR CLIENTES
 * GET /api/clientes
 * =========================================================
 */

async function listarClientes(req, res) {

    const client = await pool.connect();

    try {

        

        const resultado = await client.query(`
            SELECT
                c.id,
                c.numero_cliente,
                c.nome_completo,
                c.nif,
                c.numero_bi,
                c.data_nascimento,
                c.sexo,
                c.telefone,
                c.email,
                c.endereco,
                c.cidade,
                c.tipo_cliente,
                c.estado,
                c.criado_em,
                c.atualizado_em,
                u.nome_exibicao AS criado_por_nome

            FROM clientes c

            LEFT JOIN usuarios u
                ON u.id = c.criado_por

            ORDER BY c.criado_em DESC
        `);

        return res.json({
            success: true,
            clientes: resultado.rows
        });

    } catch (error) {

        console.error(
            'Erro ao listar clientes:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Erro ao consultar os clientes.'
        });

    } finally {

        client.release();

    }
}


/*
 * =========================================================
 * OBTER CLIENTE
 * GET /api/clientes/:id
 * =========================================================
 */

async function obterCliente(req, res) {

    const { id } = req.params;

    const client = await pool.connect();

    try {

        

        const resultado = await client.query(`
            SELECT
                c.id,
                c.numero_cliente,
                c.nome_completo,
                c.nif,
                c.numero_bi,
                c.data_nascimento,
                c.sexo,
                c.telefone,
                c.email,
                c.endereco,
                c.cidade,
                c.tipo_cliente,
                c.estado,
                c.criado_em,
                c.atualizado_em,
                u.nome_exibicao AS criado_por_nome

            FROM clientes c

            LEFT JOIN usuarios u
                ON u.id = c.criado_por

            WHERE c.id = $1
        `, [id]);

        if (resultado.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado.'
            });

        }

        return res.json({
            success: true,
            cliente: resultado.rows[0]
        });

    } catch (error) {

        console.error(
            'Erro ao obter cliente:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Erro ao consultar o cliente.'
        });

    } finally {

        client.release();

    }
}


/*
 * =========================================================
 * CRIAR CLIENTE
 * POST /api/clientes
 * =========================================================
 */

async function criarCliente(req, res) {

    const {
        nomeCompleto,
        nif,
        numeroBI,
        dataNascimento,
        sexo,
        telefone,
        email,
        endereco,
        cidade,
        tipoCliente
    } = req.body;


    if (!nomeCompleto) {

        return res.status(400).json({
            success: false,
            message: 'O nome completo é obrigatório.'
        });

    }


    const client = await pool.connect();

    try {

        


        /*
         * Gerar número do cliente.
         *
         * Exemplo:
         * CLI-000001
         */

        const numeroResult = await client.query(`
            SELECT 'CLI-' || LPAD(nextval('cliente_numero_seq')::TEXT, 6, '0') AS numero_cliente
        `);

        const numeroCliente =
            numeroResult.rows[0].numero_cliente;


        // O operador vem exclusivamente do JWT validado pelo middleware.
        // Nunca aceitar criadoPor enviado pelo cliente.
        const criadoPor = req.user?.id || null;

        if (!criadoPor) {
            return res.status(401).json({
                success: false,
                message: 'Operador autenticado não identificado.'
            });
        }


        const resultado = await client.query(`
            INSERT INTO clientes (
                numero_cliente,
                nome_completo,
                nif,
                numero_bi,
                data_nascimento,
                sexo,
                telefone,
                email,
                endereco,
                cidade,
                tipo_cliente,
                criado_por
            )

            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )

            RETURNING
                id,
                numero_cliente,
                nome_completo,
                nif,
                numero_bi,
                data_nascimento,
                sexo,
                telefone,
                email,
                endereco,
                cidade,
                tipo_cliente,
                estado,
                criado_em
        `, [
            numeroCliente,
            nomeCompleto,
            nif || null,
            numeroBI || null,
            dataNascimento || null,
            sexo || null,
            telefone || null,
            email || null,
            endereco || null,
            cidade || null,
            tipoCliente || 'PARTICULAR',
            criadoPor
        ]);


        return res.status(201).json({
            success: true,
            message: 'Cliente criado com sucesso.',
            cliente: resultado.rows[0]
        });

    } catch (error) {

        console.error(
            'Erro ao criar cliente:',
            error
        );


        if (error.code === '23505') {

            return res.status(409).json({
                success: false,
                message: 'Já existe um cliente com este NIF.'
            });

        }


        return res.status(500).json({
            success: false,
            message: 'Erro ao criar o cliente.'
        });

    } finally {

        client.release();

    }
}


/*
 * =========================================================
 * ATUALIZAR CLIENTE
 * PUT /api/clientes/:id
 * =========================================================
 */

async function atualizarCliente(req, res) {

    const { id } = req.params;

    const {
        nomeCompleto,
        nif,
        numeroBI,
        dataNascimento,
        sexo,
        telefone,
        email,
        endereco,
        cidade,
        tipoCliente,
        estado
    } = req.body;


    if (!nomeCompleto) {

        return res.status(400).json({
            success: false,
            message: 'O nome completo é obrigatório.'
        });

    }


    const client = await pool.connect();

    try {

        


        const resultado = await client.query(`
            UPDATE clientes

            SET
                nome_completo = $1,
                nif = $2,
                numero_bi = $3,
                data_nascimento = $4,
                sexo = $5,
                telefone = $6,
                email = $7,
                endereco = $8,
                cidade = $9,
                tipo_cliente = $10,
                estado = $11,
                atualizado_em = CURRENT_TIMESTAMP

            WHERE id = $12

            RETURNING
                id,
                numero_cliente,
                nome_completo,
                nif,
                numero_bi,
                data_nascimento,
                sexo,
                telefone,
                email,
                endereco,
                cidade,
                tipo_cliente,
                estado,
                criado_em,
                atualizado_em
        `, [
            nomeCompleto,
            nif || null,
            numeroBI || null,
            dataNascimento || null,
            sexo || null,
            telefone || null,
            email || null,
            endereco || null,
            cidade || null,
            tipoCliente || 'PARTICULAR',
            estado || 'ATIVO',
            id
        ]);


        if (resultado.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado.'
            });

        }


        return res.json({
            success: true,
            message: 'Cliente atualizado com sucesso.',
            cliente: resultado.rows[0]
        });

    } catch (error) {

        console.error(
            'Erro ao atualizar cliente:',
            error
        );


        if (error.code === '23505') {

            return res.status(409).json({
                success: false,
                message: 'Já existe um cliente com este NIF.'
            });

        }


        return res.status(500).json({
            success: false,
            message: 'Erro ao atualizar o cliente.'
        });

    } finally {

        client.release();

    }
}


/*
 * =========================================================
 * ALTERAR ESTADO
 * PATCH /api/clientes/:id/estado
 * =========================================================
 */

async function alterarEstado(req, res) {

    const { id } = req.params;

    const { estado } = req.body;


    if (!['ATIVO', 'INATIVO'].includes(estado)) {

        return res.status(400).json({
            success: false,
            message: 'Estado inválido.'
        });

    }


    const client = await pool.connect();

    try {

        


        const resultado = await client.query(`
            UPDATE clientes

            SET
                estado = $1,
                atualizado_em = CURRENT_TIMESTAMP

            WHERE id = $2

            RETURNING
                id,
                numero_cliente,
                nome_completo,
                estado,
                atualizado_em
        `, [
            estado,
            id
        ]);


        if (resultado.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado.'
            });

        }


        return res.json({
            success: true,
            message: 'Estado do cliente atualizado.',
            cliente: resultado.rows[0]
        });

    } catch (error) {

        console.error(
            'Erro ao alterar estado:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Erro ao alterar o estado do cliente.'
        });

    } finally {

        client.release();

    }
}


/*
 * =========================================================
 * ELIMINAR CLIENTE — APENAS FORMADOR COM PERMISSÃO
 * DELETE /api/clientes/:id
 * =========================================================
 *
 * A eliminação é física apenas quando o cliente ainda não
 * possui contas ou crédito associados. Isto evita quebrar
 * o histórico financeiro e mantém a integridade da BD.
 */

async function eliminarCliente(req, res) {

    const { id } = req.params;
    const utilizadorId = req.user.id;

    if (!utilizadorId) {
        return res.status(400).json({
            success: false,
            message: 'Utilizador da operação não identificado.'
        });
    }

    const client = await pool.connect();

    try {

        
        await client.query('BEGIN');

        /* -------------------------------------------------
           1. VALIDAR PERMISSÃO NO SERVIDOR
           ------------------------------------------------- */

        const permissao = await client.query(`
            SELECT 1
            FROM usuarios u
            INNER JOIN perfis pf
                ON pf.id = u.perfil_id
            INNER JOIN perfil_permissoes pp
                ON pp.perfil_id = pf.id
            INNER JOIN permissoes pm
                ON pm.id = pp.permissao_id
            WHERE u.id = $1
              AND u.ativo = TRUE
              AND pm.codigo = 'CLIENTES_ELIMINAR'
            LIMIT 1
        `, [utilizadorId]);

        if (permissao.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                message: 'Não possui permissão para eliminar clientes.'
            });
        }

        /* -------------------------------------------------
           2. OBTER CLIENTE
           ------------------------------------------------- */

        const clienteResult = await client.query(`
            SELECT id, numero_cliente, nome_completo
            FROM clientes
            WHERE id = $1
            FOR UPDATE
        `, [id]);

        if (clienteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado.'
            });
        }

        const cliente = clienteResult.rows[0];

        /* -------------------------------------------------
           3. PROTEGER HISTÓRICO FINANCEIRO
           ------------------------------------------------- */

        const dependencias = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM contas WHERE cliente_id = $1) AS contas,
                (SELECT COUNT(*) FROM creditos WHERE cliente_id = $1) AS creditos,
                (SELECT COUNT(*) FROM analises_risco WHERE cliente_id = $1) AS analises
        `, [id]);

        const dependenciasCliente = dependencias.rows[0];
        const contas = Number(dependenciasCliente.contas || 0);
        const creditos = Number(dependenciasCliente.creditos || 0);
        const analises = Number(dependenciasCliente.analises || 0);

        if (contas > 0 || creditos > 0 || analises > 0) {
            await client.query('ROLLBACK');

            return res.status(409).json({
                success: false,
                code: 'CLIENTE_COM_HISTORICO',
                message: 'Este cliente não pode ser eliminado porque possui histórico financeiro associado.',
                detalhes: {
                    contas,
                    creditos,
                    analises
                }
            });
        }

        /* -------------------------------------------------
           4. REGISTAR AUDITORIA ANTES DA ELIMINAÇÃO
           ------------------------------------------------- */

        await client.query(`
            INSERT INTO auditoria_operacoes (
                utilizador_id,
                modulo,
                acao,
                referencia,
                detalhes
            )
            VALUES (
                $1,
                'CLIENTES',
                'ELIMINACAO',
                $2,
                $3
            )
        `, [
            utilizadorId,
            cliente.numero_cliente,
            JSON.stringify({
                clienteId: cliente.id,
                nomeCompleto: cliente.nome_completo
            })
        ]);

        /* -------------------------------------------------
           5. ELIMINAR DOCUMENTOS E CLIENTE
           ------------------------------------------------- */

        await client.query(
            'DELETE FROM documentos_cliente WHERE cliente_id = $1',
            [id]
        );

        const resultado = await client.query(`
            DELETE FROM clientes
            WHERE id = $1
            RETURNING id, numero_cliente, nome_completo
        `, [id]);

        await client.query('COMMIT');

        return res.json({
            success: true,
            message: `Cliente ${resultado.rows[0].numero_cliente} eliminado com sucesso.`,
            cliente: resultado.rows[0]
        });

    } catch (error) {

        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // A transação pode já ter sido revertida.
        }

        console.error(
            'Erro ao eliminar cliente:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Erro ao eliminar o cliente.'
        });

    } finally {

        client.release();

    }
}


module.exports = {
    listarClientes,
    obterCliente,
    criarCliente,
    atualizarCliente,
    alterarEstado,
    eliminarCliente
};