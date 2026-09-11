const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(
    process.env.APPDATA || process.cwd(),
    'PRISMA Banking',
    'server-config.json'
);

const DEFAULT_SERVER_URL = 'http://127.0.0.1:3000';

function normalizarURL(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    let valor = url.trim();

    if (!valor) {
        return null;
    }

    if (!/^https?:\/\//i.test(valor)) {
        valor = `http://${valor}`;
    }

    valor = valor.replace(/\/+$/, '');

    try {
        const parsed = new URL(valor);

        if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:'
        ) {
            return null;
        }

        if (parsed.username || parsed.password) {
            return null;
        }

        return parsed.origin;
    } catch (_) {
        return null;
    }
}

function obterServidorConfigurado() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }

        const conteudo = fs.readFileSync(
            CONFIG_FILE,
            'utf8'
        );

        const configuracao = JSON.parse(conteudo);

        return normalizarURL(
            configuracao.serverUrl
        );
    } catch (error) {
        console.error(
            '[PRISMA] Erro ao ler configuração do servidor:',
            error
        );

        return null;
    }
}

function guardarServidorConfigurado(serverUrl) {
    const urlNormalizada =
        normalizarURL(serverUrl);

    if (!urlNormalizada) {
        throw new Error(
            'Endereço do servidor inválido.'
        );
    }

    const diretorio =
        path.dirname(CONFIG_FILE);

    fs.mkdirSync(
        diretorio,
        { recursive: true }
    );

    fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(
            {
                serverUrl: urlNormalizada
            },
            null,
            4
        ),
        'utf8'
    );

    return urlNormalizada;
}

function limparServidorConfigurado() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            fs.unlinkSync(CONFIG_FILE);
        }
    } catch (error) {
        console.error(
            '[PRISMA] Erro ao limpar configuração do servidor:',
            error
        );
    }
}

module.exports = {
    CONFIG_FILE,
    DEFAULT_SERVER_URL,
    normalizarURL,
    obterServidorConfigurado,
    guardarServidorConfigurado,
    limparServidorConfigurado
};