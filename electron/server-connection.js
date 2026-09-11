const { dialog } = require('electron');

const {
    obterServidorConfigurado,
    guardarServidorConfigurado
} = require('./server-config');

const http = require('http');

function verificarServidor(serverUrl) {
    return new Promise(resolve => {
        const healthUrl = `${serverUrl}/api/health`;

        let concluido = false;

        const finalizar = resultado => {
            if (concluido) return;

            concluido = true;
            resolve(resultado);
        };

        const request = http.get(
            healthUrl,
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

        request.on('error', () => finalizar(false));

        request.setTimeout(2000, () => {
            request.destroy();
            finalizar(false);
        });
    });
}

async function solicitarServidor() {
    const configurado = obterServidorConfigurado();

    const resultado = await dialog.showMessageBox({
        type: 'info',
        title: 'PRISMA Banking',
        message: 'Servidor PRISMA',
        detail:
            configurado
                ? `Servidor configurado anteriormente:\n\n${configurado}\n\nDeseja utilizar este servidor?`
                : 'Nenhum servidor PRISMA está configurado neste computador.',
        buttons: configurado
            ? ['Usar servidor configurado', 'Introduzir outro endereço']
            : ['Introduzir endereço'],
        defaultId: 0,
        cancelId: configurado ? 1 : 0
    });

    if (configurado && resultado.response === 0) {
        return configurado;
    }

    const entrada = await dialog.showMessageBox({
        type: 'question',
        title: 'PRISMA Banking',
        message: 'Endereço do servidor',
        detail:
            'Introduza o endereço do computador onde o PRISMA Server está instalado.\n\n' +
            'Exemplo:\n' +
            '192.168.137.1:3000',
        buttons: ['Cancelar', 'Continuar'],
        defaultId: 1,
        cancelId: 0
    });

    if (entrada.response !== 1) {
        return null;
    }

    return null;
}

module.exports = {
    verificarServidor,
    solicitarServidor
};