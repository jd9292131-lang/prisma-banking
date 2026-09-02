const path = require('path');
const fs = require('fs');
require('./config/env');
const { obterFrontendDir } = require('./config/paths');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const operacoesRoutes = require('./routes/operacoesRoutes');
const documentosRoutes = require('./routes/documentosRoutes');
const cartoesRoutes = require('./routes/cartoesRoutes');
const chequesRoutes = require('./routes/chequesRoutes');
const formacaoRoutes = require('./routes/formacaoRoutes');
const gestaoRoutes = require('./routes/gestaoRoutes');
const initializeDatabase = require('./database/initialize');
const { executarTransferenciasAgendadas } = require('./controllers/operacoesController');
const { exigirAutenticacao } = require('./middleware/auth');
const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = obterFrontendDir();
const FRONTEND_INDEX = path.join(FRONTEND_DIR, 'index.html');

if (!fs.existsSync(FRONTEND_INDEX)) {
    throw new Error(`[PRISMA] index.html não encontrado em: ${FRONTEND_INDEX}`);
}

// Middlewares
app.use(helmet());
app.use(cors({
    origin: [/^https?:\/\/127\.0\.0\.1(?::\d+)?$/, /^https?:\/\/localhost(?::\d+)?$/],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(FRONTEND_DIR));
// Rota de teste
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'PRISMA Banking API está funcionando.',
        environment: 'simulation',
        internetRequired: false
    });
});

app.use('/api/auth', authRoutes);
app.use('/api', exigirAutenticacao);
app.use('/api/clientes', clientesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/operacoes', operacoesRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/cheques', chequesRoutes);
app.use('/api/formacao', formacaoRoutes);
app.use('/api/gestao', gestaoRoutes);
app.get('/', (req, res) => {
   
    res.sendFile(
        FRONTEND_INDEX
    );
});
// Iniciar servidor
async function iniciarServidor() {
    try {
        console.log('[PRISMA] A carregar configuração do backend...');
        console.log(`[PRISMA] PostgreSQL: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        console.log(`[PRISMA] Base de dados: ${process.env.DB_NAME}`);
        console.log(`[PRISMA] Utilizador BD: ${process.env.DB_USER}`);
        console.log(`[PRISMA] Frontend: ${FRONTEND_DIR}`);

        await initializeDatabase();

        // Processa transferências vencidas na inicialização e periodicamente.
        // O processamento é idempotente porque apenas seleciona estado AGENDADA.
        try {
            await executarTransferenciasAgendadas();
        } catch (schedulerError) {
            console.error('[PRISMA] Falha no processamento inicial de transferências agendadas:', schedulerError);
        }
        const scheduler = setInterval(() => {
            executarTransferenciasAgendadas().catch(error => {
                console.error('[PRISMA] Falha no ciclo de transferências agendadas:', error);
            });
        }, 30 * 1000);
        scheduler.unref?.();

        app.listen(PORT, '127.0.0.1', () => {
            console.log('');
            console.log('======================================');
            console.log('   PRISMA EDUCACIONAL');
            console.log('   BANKING');
            console.log('======================================');
            console.log(`Servidor: http://127.0.0.1:${PORT}`);
            console.log('Modo: LOCAL / OFFLINE');
            console.log('Base de dados: PostgreSQL OK');
            console.log('======================================');
            console.log('');
        });
    } catch (error) {
        console.error('');
        console.error('======================================');
        console.error(' FALHA AO INICIAR O PRISMA BANKING');
        console.error('======================================');
        console.error(error?.stack || error);
        console.error('======================================');
        process.exit(1);
    }
}

iniciarServidor();