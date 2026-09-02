const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { criarToken } = require('../middleware/auth');


const tentativasRegisto = new Map();
const tentativasLogin = new Map();

function permitirLogin(req, identificador) {
    const chave = `${req.ip || req.socket?.remoteAddress || 'desconhecido'}:${String(identificador || '').trim().toLowerCase()}`;
    const agora = Date.now();
    const janelaMs = 10 * 60 * 1000;
    const limite = 10;
    const atual = tentativasLogin.get(chave) || { inicio: agora, total: 0 };

    if (agora - atual.inicio >= janelaMs) {
        atual.inicio = agora;
        atual.total = 0;
    }

    if (atual.total >= limite) {
        tentativasLogin.set(chave, atual);
        return false;
    }

    atual.total += 1;
    tentativasLogin.set(chave, atual);

    if (tentativasLogin.size > 2000) {
        for (const [key, value] of tentativasLogin) {
            if (agora - value.inicio >= janelaMs) {
                tentativasLogin.delete(key);
            }
        }
    }

    return true;
}

function limparTentativasLogin(req, identificador) {
    const chave = `${req.ip || req.socket?.remoteAddress || 'desconhecido'}:${String(identificador || '').trim().toLowerCase()}`;
    tentativasLogin.delete(chave);
}

function permitirRegisto(req) {
    const chave = req.ip || req.socket?.remoteAddress || 'desconhecido';
    const agora = Date.now();
    const janelaMs = 10 * 60 * 1000;
    const limite = 10;
    const atual = tentativasRegisto.get(chave) || { inicio: agora, total: 0 };

    if (agora - atual.inicio >= janelaMs) {
        atual.inicio = agora;
        atual.total = 0;
    }

    atual.total += 1;
    tentativasRegisto.set(chave, atual);

    if (tentativasRegisto.size > 1000) {
        for (const [key, value] of tentativasRegisto) {
            if (agora - value.inicio >= janelaMs) tentativasRegisto.delete(key);
        }
    }

    return atual.total <= limite;
}

function utilizadorPublico(row, permissoes) {
    return {
        id: row.id,
        codigoOperador: row.codigo_operador,
        nomeUtilizador: row.nome_utilizador,
        nomeExibicao: row.nome_exibicao,
        perfil: row.perfil,
        permissoes
    };
}

async function carregarPermissoes(perfilId) {
    const r = await pool.query(`
        SELECT p.codigo
        FROM permissoes p
        INNER JOIN perfil_permissoes pp ON pp.permissao_id = p.id
        WHERE pp.perfil_id = $1
        ORDER BY p.codigo
    `, [perfilId]);
    return r.rows.map(r => r.codigo);
}

async function login(req, res) {
    res.set('Cache-Control', 'no-store');
    const { codigoOperador, senha, nomeUtilizador } = req.body;
    const codigo = String(codigoOperador || '').trim().toUpperCase();
    const nome = String(nomeUtilizador || '').trim().toLowerCase();
    const identificador = codigo || nome;

    if ((!codigo && !nome) || !senha) {
        return res.status(400).json({ success:false, message:'Código do operador e palavra-passe são obrigatórios.' });
    }

    if (!permitirLogin(req, identificador)) {
        return res.status(429).json({
            success: false,
            message: 'Demasiadas tentativas de autenticação. Aguarde alguns minutos.'
        });
    }

    try {
        const filtro = codigo
            ? `u.codigo_operador = $1`
            : `LOWER(u.nome_utilizador) = LOWER($1)`;

        const valor = codigo || nome;

        const resultado = await pool.query(`
            SELECT u.id, u.codigo_operador, u.nome_utilizador, u.nome_exibicao,
                   u.senha_hash, u.ativo, p.id AS perfil_id, p.nome AS perfil
            FROM usuarios u
            INNER JOIN perfis p ON p.id = u.perfil_id
            WHERE ${filtro}
            LIMIT 1
        `, [valor]);

        if (!resultado.rows.length) {
            return res.status(401).json({success:false,message:'Código do operador ou palavra-passe inválidos.'});
        }

        const row = resultado.rows[0];

        if (!row.ativo) {
            return res.status(403).json({success:false,message:'Este operador está desativado.'});
        }

        const valido = await bcrypt.compare(senha, row.senha_hash);
        if (!valido) {
            return res.status(401).json({success:false,message:'Código do operador ou palavra-passe inválidos.'});
        }

        limparTentativasLogin(req, identificador);

        const permissoes = await carregarPermissoes(row.perfil_id);

        await pool.query(
            'UPDATE usuarios SET ultimo_login=CURRENT_TIMESTAMP WHERE id=$1',
            [row.id]
        );

        await pool.query(`
            INSERT INTO auditoria_operacoes(utilizador_id,modulo,acao,referencia,detalhes)
            VALUES($1,'AUTENTICACAO','LOGIN',$2,$3)
        `, [row.id, row.codigo_operador, JSON.stringify({perfil:row.perfil})]);

        const utilizador = utilizadorPublico(row, permissoes);
        const token = criarToken(row);

        return res.json({
            success:true,
            message:'Autenticação efetuada com sucesso.',
            token,
            utilizador
        });
    } catch(error) {
        console.error('Erro no login:', error);
        return res.status(500).json({success:false,message:'Erro interno do servidor.'});
    }
}

async function registarFormando(req, res) {
    res.set('Cache-Control', 'no-store');

    if (!permitirRegisto(req)) {
        return res.status(429).json({ success:false, message:'Demasiadas tentativas de registo. Aguarde alguns minutos.' });
    }

    const { nomeCompleto, nomeUtilizador, senha, confirmarSenha } = req.body;

    const nome = String(nomeCompleto || '').trim();
    const utilizador = String(nomeUtilizador || '').trim().toLowerCase();
    const password = String(senha || '');
    const confirmacao = String(confirmarSenha || '');

    if (!nome || !utilizador || !password || !confirmacao) {
        return res.status(400).json({success:false,message:'Preencha todos os campos obrigatórios.'});
    }

    if (password !== confirmacao) {
        return res.status(400).json({success:false,message:'As palavras-passe não coincidem.'});
    }

    if (password.length < 6) {
        return res.status(400).json({success:false,message:'A palavra-passe deve ter pelo menos 6 caracteres.'});
    }

    if (!/^[a-z0-9._-]{3,40}$/.test(utilizador)) {
        return res.status(400).json({success:false,message:'Nome de utilizador inválido.'});
    }

    try {
        const existente = await pool.query(
            'SELECT 1 FROM usuarios WHERE LOWER(nome_utilizador)=LOWER($1)',
            [utilizador]
        );

        if (existente.rows.length) {
            return res.status(409).json({success:false,message:'Esse nome de utilizador já está registado.'});
        }

        const perfil = await pool.query(
            `SELECT id FROM perfis WHERE nome='FORMANDO' LIMIT 1`
        );

        if (!perfil.rows.length) {
            return res.status(500).json({success:false,message:'Perfil FORMADOR/FORMANDO não configurado.'});
        }

        const hash = await bcrypt.hash(password, 12);

        const criado = await pool.query(`
            INSERT INTO usuarios(
                codigo_operador,nome_utilizador,nome_exibicao,senha_hash,perfil_id,ativo
            )
            VALUES(
                'OP-' || LPAD(nextval('operador_codigo_seq')::text,6,'0'),
                $1,$2,$3,$4,TRUE
            )
            RETURNING id,codigo_operador,nome_utilizador,nome_exibicao
        `, [utilizador, nome, hash, perfil.rows[0].id]);

        const row = criado.rows[0];

        await pool.query(`
            INSERT INTO auditoria_operacoes(modulo,acao,referencia,detalhes)
            VALUES('AUTENTICACAO','REGISTO_FORMANDO',$1,$2)
        `, [row.codigo_operador, JSON.stringify({nomeUtilizador:row.nome_utilizador})]);

        return res.status(201).json({
            success:true,
            message:'Registo de formando criado com sucesso.',
            operador:{
                codigoOperador:row.codigo_operador,
                nomeUtilizador:row.nome_utilizador,
                nomeExibicao:row.nome_exibicao
            }
        });
    } catch(error) {
        console.error('Erro no registo:', error);
        if (error.code === '23505') {
            return res.status(409).json({success:false,message:'Não foi possível gerar um código de operador único. Tente novamente.'});
        }
        return res.status(500).json({success:false,message:'Erro interno ao criar o formando.'});
    }
}

module.exports = { login, registarFormando };
