const packageMetadata = require('../package.json');

const MODE = String(
    process.env.PRISMA_MODE ||
    packageMetadata.prismaMode ||
    'server'
).toLowerCase();

if (!['server', 'client'].includes(MODE)) {
    throw new Error(
        `[PRISMA] Modo inválido: "${MODE}". Use "server" ou "client".`
    );
}

const isServer = MODE === 'server';
const isClient = MODE === 'client';

const DEFAULT_PORT = 3000;

module.exports = {
    MODE,
    isServer,
    isClient,
    DEFAULT_PORT
};