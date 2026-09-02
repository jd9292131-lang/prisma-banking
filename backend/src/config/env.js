const path = require('path');
const dotenv = require('dotenv');

const envPadrao = path.join(__dirname, '../../.env');
const envConfigurado = String(process.env.PRISMA_ENV_FILE || '').trim();
const envFile = envConfigurado ? path.resolve(envConfigurado) : envPadrao;

const result = dotenv.config({
    path: envFile,
    quiet: true
});

if (result.error && result.error.code !== 'ENOENT') {
    throw result.error;
}

function exigirEnv(nome, minimo = 1) {
    const valor = String(process.env[nome] || '').trim();
    if (valor.length < minimo) {
        throw new Error(`Variável obrigatória não configurada: ${nome}`);
    }
    return valor;
}

module.exports = {
    envFile,
    exigirEnv
};
