'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const REQUIRED_FILES = [
    'electron-main.js',
    'electron/mode.js',
    'electron/server-config.js',
    'electron/connection/index.html',
    'electron/connection/preload.js',
    'frontend/index.html',
    'frontend/assets/prisma-banking.ico',
    'build/electron-builder.client.json',
    'package.json'
];

const JS_FILES = [
    'electron-main.js',
    'electron/mode.js',
    'electron/server-config.js',
    'electron/connection/preload.js'
];

function fail(message) {
    console.error(`[PRISMA CLIENTE] ERRO: ${message}`);
    process.exit(1);
}

function ok(message) {
    console.log(`[PRISMA CLIENTE] ${message}`);
}

function absolute(relativePath) {
    return path.join(ROOT, relativePath);
}

function requireFile(relativePath) {
    const filePath = absolute(relativePath);

    if (!fs.existsSync(filePath)) {
        fail(`Ficheiro obrigatório não encontrado: ${relativePath}`);
    }

    if (!fs.statSync(filePath).isFile()) {
        fail(`O caminho obrigatório não é um ficheiro: ${relativePath}`);
    }

    ok(`Ficheiro encontrado: ${relativePath}`);
}

function checkDirectory(relativePath) {
    const dirPath = absolute(relativePath);

    if (!fs.existsSync(dirPath)) {
        fail(`Diretório obrigatório não encontrado: ${relativePath}`);
    }

    if (!fs.statSync(dirPath).isDirectory()) {
        fail(`O caminho obrigatório não é um diretório: ${relativePath}`);
    }

    ok(`Diretório encontrado: ${relativePath}`);
}

function checkJavaScriptSyntax(relativePath) {
    const filePath = absolute(relativePath);

    const source = fs.readFileSync(filePath, 'utf8');

    if (!source.trim()) {
        fail(`Ficheiro JavaScript vazio: ${relativePath}`);
    }

    const { spawnSync } = require('child_process');

    const result = spawnSync(
        process.execPath,
        ['--check', filePath],
        {
            cwd: ROOT,
            encoding: 'utf8'
        }
    );

    if (result.status !== 0) {
        const output =
            `${result.stdout || ''}${result.stderr || ''}`.trim();

        fail(
            `Sintaxe JavaScript inválida em ${relativePath}` +
            (output ? `\n${output}` : '')
        );
    }

    ok(`Sintaxe válida: ${relativePath}`);
}

function readJson(relativePath) {
    const filePath = absolute(relativePath);

    try {
        return JSON.parse(
            fs.readFileSync(filePath, 'utf8')
        );
    } catch (error) {
        fail(
            `JSON inválido em ${relativePath}: ${error.message}`
        );
    }
}

function checkPackageJson() {
    const pkg = readJson('package.json');

    if (!pkg.name) {
        fail('package.json não possui "name".');
    }

    if (!pkg.scripts || !pkg.scripts['dist:client']) {
        fail(
            'package.json não possui o script "dist:client".'
        );
    }

    if (
        !pkg.build ||
        !Array.isArray(pkg.build.files)
    ) {
        fail(
            'package.json não possui configuração de build válida.'
        );
    }

    /*
     * O package.json principal pertence ao projeto completo.
     * Portanto, é normal que o build principal inclua o backend.
     *
     * A separação SERVIDOR/CLIENTE é validada especificamente
     * em build/electron-builder.client.json.
     */

    if (
        !pkg.devDependencies ||
        !pkg.devDependencies.electron ||
        !pkg.devDependencies['electron-builder']
    ) {
        fail(
            'Dependências de build Electron não encontradas.'
        );
    }

    ok(
        'package.json principal validado.'
    );
}
function checkClientBuilderConfig() {
    const config = readJson(
        'build/electron-builder.client.json'
    );

    if (
        config.extraMetadata?.prismaMode !== 'client'
    ) {
        fail(
            'electron-builder.client.json deve definir ' +
            '"extraMetadata.prismaMode": "client".'
        );
    }

    if (
        !Array.isArray(config.files)
    ) {
        fail(
            'electron-builder.client.json não possui "files".'
        );
    }

    const files = config.files.map(String);

    if (
        files.some(
            entry =>
                entry === 'backend/**/*' ||
                entry === 'backend/**' ||
                entry.startsWith('backend/')
        )
    ) {
        fail(
            'O instalador CLIENTE não pode incluir o backend.'
        );
    }

    if (
        !files.includes('electron-main.js')
    ) {
        fail(
            'O build CLIENTE deve incluir electron-main.js.'
        );
    }

    if (
        !files.includes('electron/**/*')
    ) {
        fail(
            'O build CLIENTE deve incluir electron/**/*.'
        );
    }

    if (
        !files.includes('frontend/**/*')
    ) {
        fail(
            'O build CLIENTE deve incluir frontend/**/*.'
        );
    }

    ok(
        'electron-builder.client.json validado.'
    );
}

function checkMode() {
    const modeFile = absolute('electron/mode.js');
    const source = fs.readFileSync(
        modeFile,
        'utf8'
    );

    if (
        !source.includes("'server'") ||
        !source.includes("'client'")
    ) {
        fail(
            'electron/mode.js não apresenta corretamente ' +
            'os modos server/client.'
        );
    }

    if (
        !source.includes('PRISMA_MODE')
    ) {
        fail(
            'electron/mode.js não utiliza PRISMA_MODE.'
        );
    }

    ok(
        'Sistema de modos server/client validado.'
    );
}

function checkClientMustNotUseLocalBackend() {
    const electronMain = fs.readFileSync(
        absolute('electron-main.js'),
        'utf8'
    );

    if (
        !electronMain.includes(
            'if (isClient)'
        )
    ) {
        fail(
            'electron-main.js não contém a proteção do modo CLIENTE.'
        );
    }

    if (
        !electronMain.includes(
            'backend local não será iniciado'
        )
    ) {
        fail(
            'electron-main.js não confirma a não inicialização ' +
            'do backend no modo CLIENTE.'
        );
    }

    ok(
        'Cliente configurado para não iniciar backend local.'
    );
}

function checkConnectionFiles() {
    const html = fs.readFileSync(
        absolute('electron/connection/index.html'),
        'utf8'
    );

    const preload = fs.readFileSync(
        absolute('electron/connection/preload.js'),
        'utf8'
    );

    if (!html.trim()) {
        fail(
            'electron/connection/index.html está vazio.'
        );
    }

    if (!preload.trim()) {
        fail(
            'electron/connection/preload.js está vazio.'
        );
    }

    ok(
        'Janela de ligação ao servidor validada.'
    );
}

function main() {
    console.log('');
    console.log(
        '[PRISMA CLIENTE] Início da validação do pacote CLIENTE.'
    );
    console.log('');

    for (const file of REQUIRED_FILES) {
        requireFile(file);
    }

    checkDirectory('frontend');

    console.log('');

    for (const file of JS_FILES) {
        checkJavaScriptSyntax(file);
    }

    console.log('');

    checkPackageJson();
    checkClientBuilderConfig();
    checkMode();
    checkClientMustNotUseLocalBackend();
    checkConnectionFiles();

    console.log('');
    console.log(
        '[PRISMA CLIENTE] Validação do CLIENTE concluída com sucesso.'
    );
    console.log(
        '[PRISMA CLIENTE] O pacote pode avançar para o electron-builder.'
    );
    console.log('');
}

main();