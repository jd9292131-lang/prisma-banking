const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  ['electron-main.js', 'Electron'],
  ['frontend/index.html', 'frontend'],
  ['backend/src/server.js', 'backend'],
  ['backend/package.json', 'backend package'],
  ['backend/.env', 'configuração local do PostgreSQL']
];

const missing = required.filter(([file]) => !fs.existsSync(path.join(root, file)));

if (missing.length) {
  console.error('[PRISMA] BUILD BLOQUEADO: ficheiros obrigatórios em falta:');
  for (const [file, label] of missing) console.error(` - ${file} (${label})`);
  console.error('');
  console.error('[PRISMA] Não será gerado um instalador potencialmente incompleto.');
  console.error('[PRISMA] Crie/copiei backend/.env com a configuração PostgreSQL desta instalação.');
  process.exit(1);
}

const env = fs.readFileSync(path.join(root, 'backend/.env'), 'utf8');
const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
const invalid = requiredEnv.filter(name => {
  const match = env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`, 'mi'));
  return !match || !match[1].trim() || (name === 'JWT_SECRET' && match[1].trim().length < 32);
});

if (invalid.length) {
  console.error('[PRISMA] BUILD BLOQUEADO: variáveis PostgreSQL incompletas em backend/.env:');
  invalid.forEach(name => console.error(` - ${name}`));
  process.exit(1);
}

console.log('[PRISMA] Preflight de build aprovado.');
