const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const required = [
  'electron-main.js',
  'package.json',
  'frontend/index.html',
  'frontend/js/app.js',
  'frontend/js/dashboard.js',
  'frontend/js/modules/core.js',
  'backend/package.json',
  'backend/src/server.js',
  'backend/src/config/env.js',
  'backend/src/config/paths.js',
  'backend/src/config/database.js',
  'backend/src/database/initialize.js',
  'backend/src/middleware/auth.js',
  'backend/src/middleware/permissoes.js'
];

const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('[PRISMA] Ficheiros obrigatórios em falta:');
  missing.forEach(file => console.error(` - ${file}`));
  process.exit(1);
}

function listarJavaScript(dir) {
  const resultado = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      resultado.push(...listarJavaScript(full));
    }
    else if (entry.isFile() && entry.name.endsWith('.js')) resultado.push(full);
  }
  return resultado;
}

for (const file of listarJavaScript(root)) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    console.error(`[PRISMA] Erro de sintaxe em ${path.relative(root, file)}.`);
    console.error(check.stderr || check.stdout);
    process.exit(1);
  }
}

const packageRoot = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageBackend = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));

for (const script of ['start', 'dist', 'dist:portable', 'prepare:backend', 'pre-dist', 'pre-dist:portable', 'verify', 'preflight:build']) {
  if (!packageRoot.scripts?.[script]) {
    console.error(`[PRISMA] Script obrigatório em falta no package.json raiz: ${script}`);
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(root, 'backend/package-lock.json'))) {
  console.error('[PRISMA] backend/package-lock.json está em falta; o build reprodutível exige lockfile.');
  process.exit(1);
}

if (packageRoot.dependencies && Object.keys(packageRoot.dependencies).length) {
  console.error('[PRISMA] O package.json raiz não deve conter dependências do backend.');
  process.exit(1);
}

for (const dependency of ['express', 'pg', 'bcryptjs', 'jsonwebtoken', 'dotenv']) {
  if (!packageBackend.dependencies?.[dependency]) {
    console.error(`[PRISMA] Dependência do backend em falta: ${dependency}`);
    process.exit(1);
  }
}

const build = packageRoot.build || {};
for (const item of ['backend/**/*', 'frontend/**/*']) {
  if (!build.files?.includes(item)) {
    console.error(`[PRISMA] Build não inclui ${item}.`);
    process.exit(1);
  }
}

// Arquitetura estável: apenas o backend fica fora do ASAR porque é executado
// como processo local. O frontend é conteúdo estático e permanece no app.asar.
if (!build.asarUnpack?.includes('backend/**/*')) {
  console.error('[PRISMA] asarUnpack deve incluir apenas o backend executável.');
  process.exit(1);
}
if (build.asarUnpack?.includes('frontend/**/*')) {
  console.error('[PRISMA] Frontend não deve ser desempacotado; isso duplica a distribuição.');
  process.exit(1);
}

const envPath = path.join(root, 'backend/.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  if (!/^JWT_SECRET=.{32,}$/m.test(env)) {
    console.error('[PRISMA] JWT_SECRET ausente ou demasiado curto em backend/.env.');
    process.exit(1);
  }
} else {
  console.warn('[PRISMA] AVISO: backend/.env não está presente. A auditoria estática continua; o preflight de build bloqueará o instalador até a configuração PostgreSQL existir.');
}

const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const modules = [
  'modules/core.js',
  'modules/cartoes.js',
  'modules/cheques.js',
  'modules/formacao.js',
  'modules/gestao.js',
  'modules/relatorios.js',
  'modules/reconciliacao.js'
];
for (const moduleFile of modules) {
  if (!index.includes(`/js/${moduleFile}`)) {
    console.error(`[PRISMA] Frontend não carrega ${moduleFile}.`);
    process.exit(1);
  }
}

const operationsSource = fs.readFileSync(path.join(root, 'backend/src/controllers/operacoesController.js'), 'utf8');
for (const requiredPattern of [
  'valor_reservado_transferencias',
  'executarTransferenciasAgendadas',
  /estado\s*=\s*['"]AGENDADA['"]/,
  /estado\s*=\s*['"]CONCLUIDA['"]/
]) {
  const presente = requiredPattern instanceof RegExp
    ? requiredPattern.test(operationsSource)
    : operationsSource.includes(requiredPattern);

  if (!presente) {
    console.error(`[PRISMA] Mecanismo crítico de transferências agendadas ausente: ${requiredPattern}`);
    process.exit(1);
  }
}
const initializeSource = fs.readFileSync(path.join(root, 'backend/src/database/initialize.js'), 'utf8');
if (!initializeSource.includes('valor_reservado_transferencias') || !initializeSource.includes('idx_transferencias_agendadas')) {
  console.error('[PRISMA] Estrutura de reserva de transferências não está garantida no bootstrap da BD.');
  process.exit(1);
}
console.log('[PRISMA] Estrutura, configuração de build, segurança base e dependências validadas.');

const pathsSource = fs.readFileSync(path.join(root, 'backend/src/config/paths.js'), 'utf8');
if (!pathsSource.includes("../../../frontend")) {
  console.error('[PRISMA] Caminho de desenvolvimento do frontend não está configurado corretamente.');
  process.exit(1);
}
if (!pathsSource.includes("PRISMA_APP_PATH") || !pathsSource.includes("app.asar.unpacked") || !pathsSource.includes("frontend")) {
  console.error('[PRISMA] Caminho do frontend empacotado não está configurado.');
  process.exit(1);
}

for (const controller of [
  'backend/src/controllers/clientesController.js',
  'backend/src/controllers/operacoesController.js'
]) {
  const source = fs.readFileSync(path.join(root, controller), 'utf8');
  if (/req\.body\s*\.criadoPor|criadoPor\s*}\s*=\s*req\.body/.test(source)) {
    console.error(`[PRISMA] ${controller} aceita criadoPor diretamente do body.`);
    process.exit(1);
  }
  if (!source.includes('req.user?.id')) {
    console.error(`[PRISMA] ${controller} não utiliza a identidade autenticada do operador.`);
    process.exit(1);
  }
}

const authSource = fs.readFileSync(path.join(root, 'backend/src/controllers/authController.js'), 'utf8');
if (!authSource.includes('permitirRegisto(req)')) {
  console.error('[PRISMA] Registo público sem proteção básica contra tentativas excessivas.');
  process.exit(1);
}
if (!authSource.includes("Cache-Control', 'no-store'")) {
  console.error('[PRISMA] Respostas de autenticação devem usar Cache-Control: no-store.');
  process.exit(1);
}

const envSource = fs.readFileSync(path.join(root, 'backend/src/config/env.js'), 'utf8');
if (!envSource.includes('PRISMA_ENV_FILE') || !envSource.includes('quiet: true')) {
  console.error('[PRISMA] Carregamento do .env não respeita o caminho do Electron ou gera saída ruidosa.');
  process.exit(1);
}

const serverSource = fs.readFileSync(path.join(root, 'backend/src/server.js'), 'utf8');
if (!serverSource.includes("path.join(FRONTEND_DIR, 'index.html')") || !serverSource.includes('fs.existsSync(FRONTEND_INDEX)')) {
  console.error('[PRISMA] O servidor não constrói/valida corretamente o caminho de index.html.');
  process.exit(1);
}
if (/const\s+FRONTEND_INDEX\s*=\s*FRONTEND_INDEX\s*;/.test(serverSource)) {
  console.error('[PRISMA] Regressão crítica: FRONTEND_INDEX referencia-se a si próprio.');
  process.exit(1);
}
if (!serverSource.includes("app.use('/api', exigirAutenticacao)")) {
  console.error('[PRISMA] Rotas protegidas não estão cobertas pelo middleware global de autenticação.');
  process.exit(1);
}

if (!serverSource.includes('executarTransferenciasAgendadas') || !serverSource.includes('setInterval')) {
  console.error('[PRISMA] Scheduler de transferências agendadas não está ligado ao servidor.');
  process.exit(1);
}



const frontendDir = path.join(root, 'frontend', 'js');
const frontendActorPatterns = [
  /(?:criadoPor|utilizadorId|operadorId)\s*:/,
  /(?:criadoPor|utilizadorId|operadorId)\s*=/
];

for (const file of listarJavaScript(frontendDir)) {
  const source = fs.readFileSync(file, 'utf8');
  if (frontendActorPatterns.some(pattern => pattern.test(source))) {
    console.error(`[PRISMA] O frontend envia/atribui identificadores de operador em ${path.relative(root, file)}.`);
    console.error('[PRISMA] A identidade do operador deve vir exclusivamente do JWT no backend.');
    process.exit(1);
  }
}

const formacaoSource = fs.readFileSync(path.join(root, 'frontend/js/modules/formacao.js'), 'utf8');
if (formacaoSource.includes('utilizadorId:utilizador.id') || formacaoSource.includes('notas?utilizadorId=')) {
  console.error('[PRISMA] O frontend ainda envia identificadores de utilizador desnecessários para endpoints de formação.');
  process.exit(1);
}


const electronSource = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
if (!electronSource.includes("const net = require('net')")) {
  console.error('[PRISMA] Electron deve verificar portas disponíveis antes de iniciar o backend.');
  process.exit(1);
}
if (!electronSource.includes('async function escolherPorta()')) {
  console.error('[PRISMA] Seleção de porta local não está implementada.');
  process.exit(1);
}

const authSourceLogin = fs.readFileSync(path.join(root, 'backend/src/controllers/authController.js'), 'utf8');
if (!authSourceLogin.includes('permitirLogin(req, identificador)') || !authSourceLogin.includes('limparTentativasLogin(req, identificador)')) {
  console.error('[PRISMA] Rate limit de login não está implementado corretamente.');
  process.exit(1);
}

if (!operationsSource.includes('Math.max(0, reservadoTransferencias - total)')) {
  console.error('[PRISMA] Cálculo de disponibilidade das transferências agendadas não considera corretamente a própria reserva.');
  process.exit(1);
}
if (operationsSource.includes('Number(origem.saldo)-cheques-reservado+total')) {
  console.error('[PRISMA] Fórmula antiga e incorreta de disponibilidade ainda está presente.');
  process.exit(1);
}

console.log('[PRISMA] Auditoria de regressões REV5 validada.');

const operationsRefSource = fs.readFileSync(path.join(root, 'backend/src/controllers/operacoesController.js'), 'utf8');
if (!operationsRefSource.includes("require('crypto')") || !operationsRefSource.includes('crypto.randomUUID()')) {
  console.error('[PRISMA] Referências operacionais devem usar UUID criptograficamente forte.');
  process.exit(1);
}
if (!operationsRefSource.includes('Math.max(0,(rend-enc)/rend*100)')) {
  console.error('[PRISMA] Capacidade de endividamento do crédito não está limitada a zero.');
  process.exit(1);
}
if (!operationsRefSource.includes('Movimento não encontrado.') || !operationsRefSource.includes('Transferência não encontrada.') || !operationsRefSource.includes('Operação de caixa não encontrada.')) {
  console.error('[PRISMA] Comprovativos não validam referências operacionais.');
  process.exit(1);
}
const gestaoSource = fs.readFileSync(path.join(root, 'backend/src/controllers/gestaoController.js'), 'utf8');
if (!gestaoSource.includes('último FORMADOR ativo') || !gestaoSource.includes('Não é permitido desativar o próprio operador')) {
  console.error('[PRISMA] Gestão de utilizadores não protege o próprio operador/último FORMADOR.');
  process.exit(1);
}
const electronLockSource = fs.readFileSync(path.join(root, 'electron-main.js'), 'utf8');
if (!electronLockSource.includes('requestSingleInstanceLock') || !electronLockSource.includes("second-instance")) {
  console.error('[PRISMA] Electron não está protegido contra múltiplas instâncias.');
  process.exit(1);
}
console.log('[PRISMA] Auditoria REV11+ validada.');


const chequeSource = fs.readFileSync(path.join(root, 'backend/src/controllers/chequesController.js'), 'utf8');
if (chequeSource.includes('Math.random()') || chequeSource.includes('Date.now()')) {
  console.error('[PRISMA] Referência não determinística encontrada no controlador de cheques.');
  process.exit(1);
}
if (!chequeSource.includes("require('crypto').randomUUID()")) {
  console.error('[PRISMA] Referência UUID do movimento de cheque não está garantida.');
  process.exit(1);
}
const initSource = fs.readFileSync(path.join(root, 'backend/src/database/initialize.js'), 'utf8');
if (!initSource.includes('ux_usuarios_nome_utilizador_lower')) {
  console.error('[PRISMA] Unicidade case-insensitive do nome de utilizador não está garantida.');
  process.exit(1);
}
console.log('[PRISMA] Auditoria REV13 validada.');

/* =========================================================
   AUDITORIA REV15 — DOCUMENTOS E BOOTSTRAP DA BD
   ========================================================= */
const documentosSource = fs.readFileSync(path.join(root, 'backend/src/controllers/documentosController.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'frontend/js/dashboard.js'), 'utf8');
const documentosRoutesSource = fs.readFileSync(path.join(root, 'backend/src/routes/documentosRoutes.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'frontend/js/modules/core.js'), 'utf8');

for (const requiredPattern of [
  "r.get('/extrato/:contaId.pdf'",
  "r.get('/comprovativo/:id.pdf'"
]) {
  if (!documentosRoutesSource.includes(requiredPattern)) {
    console.error(`[PRISMA] Rota documental em falta: ${requiredPattern}`);
    process.exit(1);
  }
}
for (const requiredPattern of ['application/pdf', 'Content-Disposition']) {
  if (!documentosSource.includes(requiredPattern)) {
    console.error(`[PRISMA] Geração PDF incompleta: ${requiredPattern}`);
    process.exit(1);
  }
}

if (!coreSource.includes('function') || !coreSource.includes('abrirPDF')) {
  console.error('[PRISMA] O frontend não possui o mecanismo interno para abrir PDFs autenticados.');
  process.exit(1);
}

if (electronSource.includes("return {\n                action: 'allow'\n            }") || !electronSource.includes("url === 'about:blank'")) {
  console.error('[PRISMA] Janelas secundárias do Electron não estão restritas a about:blank.');
  process.exit(1);
}

for (const forbidden of [
  "window.open('http",
  "window.open(\"http",
  '<script>window.onload'
]) {
  if (dashboardSource.includes(forbidden) || coreSource.includes(forbidden)) {
    console.error(`[PRISMA] Abertura insegura/externa de documento encontrada: ${forbidden}`);
    process.exit(1);
  }
}

const initializeForBootstrap = fs.readFileSync(path.join(root, 'backend/src/database/initialize.js'), 'utf8');
for (const table of ['perfis', 'permissoes', 'perfil_permissoes', 'usuarios', 'clientes']) {
  if (!initializeForBootstrap.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
    console.error(`[PRISMA] Bootstrap da BD não cria a tabela nuclear ${table}.`);
    process.exit(1);
  }
}

for (const requiredField of [
  'CREATE TABLE IF NOT EXISTS comprovativos',
  'numero_documento VARCHAR(80) UNIQUE NOT NULL',
  'dados JSONB NOT NULL DEFAULT',
  'movimento_id UUID REFERENCES movimentos(id)',
  'transferencia_id UUID REFERENCES transferencias(id)',
  'caixa_operacao_id UUID REFERENCES caixa_operacoes(id)'
]) {
  if (!initializeForBootstrap.includes(requiredField)) {
    console.error(`[PRISMA] Estrutura documental incompleta: ${requiredField}`);
    process.exit(1);
  }
}

console.log('[PRISMA] Auditoria REV15 documental + bootstrap da BD validada.');


/* =========================================================
   CHECKMATE — DOCUMENTOS E IDENTIDADE DO SERVIÇO LOCAL
   ========================================================= */
if (dashboardSource.includes('janela.document.write') || dashboardSource.includes('imprimirDocumentoProfissional(')) {
  console.error('[PRISMA] Fluxo legado de comprovativo HTML ainda existe no dashboard.');
  process.exit(1);
}
if (!dashboardSource.includes("tipoDocumento: 'OPERACAO'") || !dashboardSource.includes('/api/operacoes/comprovativos')) {
  console.error('[PRISMA] Comprovativos genéricos não estão ligados ao fluxo persistente da API.');
  process.exit(1);
}
if (!documentosSource.includes('linhasPersonalizadas') || !documentosSource.includes('dados.linhas')) {
  console.error('[PRISMA] O PDF não renderiza os dados estruturados dos comprovativos genéricos.');
  process.exit(1);
}
if (!electronLockSource.includes("dados.environment === 'simulation'") || !electronLockSource.includes("dados.internetRequired === false")) {
  console.error('[PRISMA] A deteção de uma API local existente não valida a identidade do PRISMA.');
  process.exit(1);
}
console.log('[PRISMA] Checkmate documental e de identidade local validado.');
