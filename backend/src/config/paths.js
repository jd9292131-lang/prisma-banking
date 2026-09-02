const path = require('path');
const fs = require('fs');

function primeiroDiretorioExistente(candidatos) {
    for (const candidato of candidatos) {
        if (candidato && fs.existsSync(candidato) && fs.statSync(candidato).isDirectory()) {
            return path.resolve(candidato);
        }
    }
    return null;
}

function obterFrontendDir() {
    // 1. Permite override explícito (útil para testes/instalações especiais).
    const configurado = process.env.PRISMA_FRONTEND_DIR;

    // 2. Desenvolvimento: backend/src/config -> raiz do projeto -> frontend.
    const frontendDesenvolvimento = path.resolve(__dirname, '../../../frontend');

    const frontendApp = process.env.PRISMA_APP_PATH
        ? path.join(path.resolve(process.env.PRISMA_APP_PATH), 'frontend')
        : null;

    // 3. Produção Electron: frontend extraído pelo electron-builder.
    const frontendAsar = process.resourcesPath
        ? path.join(process.resourcesPath, 'app.asar', 'frontend')
        : null;

    const frontendUnpacked = process.resourcesPath
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'frontend')
        : null;

    // 4. Fallback para uma instalação que mantenha frontend diretamente em resources.
    const frontendResources = process.resourcesPath
        ? path.join(process.resourcesPath, 'frontend')
        : null;

    const frontend = primeiroDiretorioExistente([
        configurado,
        frontendApp,
        frontendDesenvolvimento,
        frontendAsar,
        frontendUnpacked,
        frontendResources
    ]);

    if (!frontend) {
        const candidatos = [
            configurado || '(PRISMA_FRONTEND_DIR não definido)',
            frontendApp || '(PRISMA_APP_PATH não definido)',
            frontendDesenvolvimento,
            frontendAsar || '(app.asar indisponível)',
            frontendUnpacked || '(app.asar.unpacked indisponível)',
            frontendResources || '(resources indisponível)'
        ];
        throw new Error(
            '[PRISMA] Frontend não encontrado. Caminhos verificados:\n' +
            candidatos.map(c => ` - ${c}`).join('\n')
        );
    }

    return frontend;
}

module.exports = { obterFrontendDir };
