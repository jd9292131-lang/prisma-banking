const {
    app,
    BrowserWindow,
    dialog,
    shell,
    utilityProcess
} = require('electron');

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

let mainWindow = null;
let backendProcess = null;
let backendStartedByPrisma = false;
let backendLastError = '';
let shuttingDown = false;

// Apenas uma instância do PRISMA Banking pode executar por computador.
// Evita múltiplos backends locais e sessões concorrentes em portas diferentes.
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });
}

const PORT_INICIAL = Number(process.env.PRISMA_PORT) || 3000;
let PORT = PORT_INICIAL;
let API_URL = `http://127.0.0.1:${PORT}`;
let HEALTH_URL = `${API_URL}/api/health`;

function portaDisponivel(porta) {
    return new Promise(resolve => {
        const servidor = net.createServer();
        servidor.once('error', () => resolve(false));
        servidor.once('listening', () => {
            servidor.close(() => resolve(true));
        });
        servidor.listen(porta, '127.0.0.1');
    });
}

async function escolherPorta() {
    const maxTentativas = 50;

    for (let i = 0; i < maxTentativas; i++) {
        const candidata = PORT_INICIAL + i;

        if (await portaDisponivel(candidata)) {
            PORT = candidata;
            API_URL = `http://127.0.0.1:${PORT}`;
            HEALTH_URL = `${API_URL}/api/health`;

            console.log(`[PRISMA] Porta local selecionada: ${PORT}`);
            return;
        }
    }

    throw new Error(`Não foi possível encontrar uma porta local disponível entre ${PORT_INICIAL} e ${PORT_INICIAL + maxTentativas - 1}.`);
}


/* =========================================================
   LOCALIZAR BACKEND
   ========================================================= */

function obterCaminhosBackend() {

    const candidatos = [];

    if (process.resourcesPath) {

        candidatos.push({
            backendDir: path.join(
                process.resourcesPath,
                'app.asar.unpacked',
                'backend'
            ),
            origem: 'app.asar.unpacked/backend'
        });

        candidatos.push({
            backendDir: path.join(
                process.resourcesPath,
                'backend'
            ),
            origem: 'resources/backend'
        });
    }

    candidatos.push({
        backendDir: path.join(
            app.getAppPath(),
            'backend'
        ),
        origem: 'app/backend'
    });

    for (const candidato of candidatos) {

        const serverFile = path.join(
            candidato.backendDir,
            'src',
            'server.js'
        );

        const envFile = path.join(
            candidato.backendDir,
            '.env'
        );

        if (fs.existsSync(serverFile)) {

            return {
                backendDir: candidato.backendDir,
                serverFile,
                envFile,
                origem: candidato.origem
            };
        }
    }

    const backendDir = path.join(
        process.resourcesPath || app.getAppPath(),
        'app.asar.unpacked',
        'backend'
    );

    return {
        backendDir,
        serverFile: path.join(
            backendDir,
            'src',
            'server.js'
        ),
        envFile: path.join(
            backendDir,
            '.env'
        ),
        origem: 'fallback'
    };
}


/* =========================================================
   VERIFICAR API
   ========================================================= */

function verificarAPI() {

    return new Promise(resolve => {
        let concluido = false;

        const finalizar = valor => {
            if (concluido) return;
            concluido = true;
            resolve(valor);
        };

        const request = http.get(
            HEALTH_URL,
            response => {
                let corpo = '';

                response.setEncoding('utf8');

                response.on('data', parte => {
                    corpo += parte;
                    if (corpo.length > 16 * 1024) {
                        request.destroy();
                        finalizar(false);
                    }
                });

                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        return finalizar(false);
                    }

                    try {
                        const dados = JSON.parse(corpo);
                        finalizar(
                            dados &&
                            dados.success === true &&
                            dados.environment === 'simulation' &&
                            dados.internetRequired === false
                        );
                    } catch (_) {
                        finalizar(false);
                    }
                });
            }
        );

        request.on(
            'error',
            () => finalizar(false)
        );

        request.setTimeout(
            1500,
            () => {
                request.destroy();
                finalizar(false);
            }
        );
    });
}


/* =========================================================
   INICIAR BACKEND
   ========================================================= */

async function iniciarBackend() {

    // Reutilizar uma API já ativa na porta padrão evita iniciar um segundo
    // backend quando o modo de desenvolvimento já deixou o serviço ligado.
    PORT = PORT_INICIAL;
    API_URL = `http://127.0.0.1:${PORT}`;
    HEALTH_URL = `${API_URL}/api/health`;

    if (await verificarAPI()) {
        console.log(`[PRISMA] Serviço local já está ativo em ${API_URL}.`);
        backendStartedByPrisma = false;
        return true;
    }

    await escolherPorta();

    const caminhos = obterCaminhosBackend();

    console.log(
        '[PRISMA] A iniciar serviço local...'
    );

    console.log(
        '[PRISMA] Origem:',
        caminhos.origem
    );

    console.log(
        '[PRISMA] Backend:',
        caminhos.serverFile
    );

    console.log(
        '[PRISMA] Configuração:',
        caminhos.envFile
    );


    if (!fs.existsSync(caminhos.serverFile)) {

        backendLastError =
            `Ficheiro do servidor não encontrado:\n\n${caminhos.serverFile}`;

        console.error(
            '[PRISMA]',
            backendLastError
        );

        return false;
    }


    if (!fs.existsSync(caminhos.envFile)) {

        backendLastError =
            `Ficheiro de configuração não encontrado:\n\n${caminhos.envFile}`;

        console.error(
            '[PRISMA]',
            backendLastError
        );

        return false;
    }


    try {

        backendProcess = utilityProcess.fork(
            caminhos.serverFile,
            [],
            {
                cwd: caminhos.backendDir,

                env: {
                    ...process.env,
                    PORT: String(PORT),
                    PRISMA_DESKTOP: '1',
                    PRISMA_APP_PATH: app.getAppPath(),
                    PRISMA_ENV_FILE: caminhos.envFile,
                    PRISMA_FRONTEND_DIR: path.join(app.getAppPath(), 'frontend'),
                    NODE_ENV: 'production'
                },

                stdio: 'pipe'
            }
        );

        backendStartedByPrisma = true;


        backendProcess.stdout?.on(
            'data',
            data => {

                const texto =
                    data.toString().trimEnd();

                if (!texto) return;

                console.log(
                    `[PRISMA API] ${texto}`
                );

                if (
                    /FALHA|ERRO|ERROR|ECONN|password authentication|database|PostgreSQL|não encontrado/i.test(
                        texto
                    )
                ) {

                    backendLastError = texto;
                }
            }
        );


        backendProcess.stderr?.on(
            'data',
            data => {

                const texto =
                    data.toString().trimEnd();

                if (!texto) return;

                console.error(
                    `[PRISMA API] ${texto}`
                );

                backendLastError = texto;
            }
        );


        backendProcess.on(
            'error',
            error => {

                console.error(
                    '[PRISMA] Erro ao iniciar backend:',
                    error
                );

                backendLastError =
                    error.message;
            }
        );


        backendProcess.on(
            'exit',
            ({ exitCode, reason }) => {

                console.error(
                    '[PRISMA] Backend terminou.',
                    `Código: ${exitCode}`,
                    `Motivo: ${reason}`
                );

                if (
                    !shuttingDown &&
                    !app.isQuitting
                ) {

                    backendLastError =
                        `O serviço local terminou inesperadamente.\n\n` +
                        `Código: ${exitCode}\n` +
                        `Motivo: ${reason}`;
                }
            }
        );


        return true;

    } catch (error) {

        console.error(
            '[PRISMA] Falha ao criar processo:',
            error
        );

        backendLastError =
            error.message;

        return false;
    }
}


/* =========================================================
   AGUARDAR SERVIDOR
   ========================================================= */

async function aguardarServidor(
    timeoutMs = 30000
) {

    const inicio = Date.now();

    while (
        Date.now() - inicio < timeoutMs
    ) {

        if (await verificarAPI()) {

            console.log(
                '[PRISMA] Serviço local está pronto.'
            );

            return true;
        }

        await new Promise(
            resolve =>
                setTimeout(resolve, 500)
        );
    }

    return false;
}


/* =========================================================
   CRIAR JANELA
   ========================================================= */

function criarJanela() {

    const iconPath = path.join(
        app.getAppPath(),
        'frontend',
        'assets',
        'prisma-banking.ico'
    );


    mainWindow = new BrowserWindow({

        width: 1440,
        height: 900,

        minWidth: 1100,
        minHeight: 700,

        title: 'PRISMA Banking',

        icon: iconPath,

        backgroundColor: '#eef1f4',

        autoHideMenuBar: true,

        show: false,

        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });


    mainWindow.once(
        'ready-to-show',
        () => {

            if (mainWindow) {
                mainWindow.show();
            }
        }
    );


    mainWindow.loadURL(
        `${API_URL}/`
    );


    mainWindow.webContents.setWindowOpenHandler(
        ({ url }) => {
            // A aplicação pode criar apenas janelas internas em about:blank.
            // URLs externas continuam bloqueadas e são abertas no sistema.
            if (url === 'about:blank') {
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        width: 1000,
                        height: 850,
                        autoHideMenuBar: true,
                        webPreferences: {
                            contextIsolation: true,
                            nodeIntegration: false,
                            sandbox: true
                        }
                    }
                };
            }

            if (!url.startsWith(API_URL)) {
                shell.openExternal(url);
            }

            return { action: 'deny' };
        }
    );


    mainWindow.on(
        'closed',
        () => {

            mainWindow = null;
        }
    );
}


/* =========================================================
   INICIAR APLICAÇÃO
   ========================================================= */

async function iniciarAplicacao() {

    const backendIniciado =
        await iniciarBackend();


    if (!backendIniciado) {

        await dialog.showMessageBox({

            type: 'error',

            title: 'PRISMA Banking',

            message:
                'Não foi possível iniciar o serviço local.',

            detail:
                backendLastError ||
                'Não foi possível localizar ou iniciar o backend local do PRISMA.'
        });

        app.quit();

        return;
    }


    const servidorPronto =
        await aguardarServidor();


    if (!servidorPronto) {

        await dialog.showMessageBox({

            type: 'error',

            title: 'PRISMA Banking',

            message:
                'O serviço local não respondeu.',

            detail:
                backendLastError ||
                `A API não respondeu em ${HEALTH_URL} após 30 segundos.\n\n` +
                'Verifique se o PostgreSQL está em execução e se o backend/.env está correto.'
        });


        if (
            backendProcess &&
            backendStartedByPrisma
        ) {

            try {

                backendProcess.kill();

            } catch (error) {

                console.error(
                    '[PRISMA] Erro ao terminar backend:',
                    error
                );
            }
        }


        app.quit();

        return;
    }


    criarJanela();
}


/* =========================================================
   ELECTRON READY
   ========================================================= */

app.whenReady().then(
    async () => {
        if (!singleInstanceLock) return;

        app.setAppUserModelId(
            'ao.prisma.educacional.banking'
        );

        await iniciarAplicacao();


        app.on(
            'activate',
            () => {

                if (
                    BrowserWindow
                        .getAllWindows()
                        .length === 0
                ) {

                    iniciarAplicacao();
                }
            }
        );
    }
);


/* =========================================================
   ENCERRAMENTO
   ========================================================= */

app.on(
    'before-quit',
    () => {

        app.isQuitting = true;
        shuttingDown = true;


        if (
            backendProcess &&
            backendStartedByPrisma
        ) {

            try {

                backendProcess.kill();

            } catch (error) {

                console.error(
                    '[PRISMA] Erro ao terminar backend:',
                    error
                );
            }
        }
    }
);


/* =========================================================
   TODAS AS JANELAS FECHADAS
   ========================================================= */

app.on(
    'window-all-closed',
    () => {

        if (process.platform !== 'darwin') {

            app.quit();
        }
    }
);