/* PRISMA Banking — núcleo partilhado dos módulos */
window.PRISMA_MODULES = window.PRISMA_MODULES || {};

window.PRISMA_MODULES.obterSessao = function () {
  try {
    const raw = sessionStorage.getItem('prismaUtilizador');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    sessionStorage.removeItem('prismaUtilizador');
    return null;
  }
};

window.PRISMA_MODULES.obterToken = function () {
  return sessionStorage.getItem('prismaToken') || '';
};

window.PRISMA_MODULES.terminarSessao = function () {
  sessionStorage.removeItem('prismaUtilizador');
  sessionStorage.removeItem('prismaToken');
  window.location.reload();
};

window.PRISMA_MODULES.permitido = function (utilizador, permissao) {
  return (utilizador?.permissoes || []).includes(permissao);
};

window.PRISMA_MODULES.api = async function (url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = window.PRISMA_MODULES.obterToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const resposta = await fetch(url, { ...options, headers });
  const dados = await resposta.json().catch(() => ({}));

  if (resposta.status === 401) {
    window.PRISMA_MODULES.terminarSessao();
    throw new Error(dados.message || 'A sessão expirou.');
  }

  if (!resposta.ok || !dados.success) {
    throw new Error(dados.message || `Operação não concluída (${resposta.status}).`);
  }

  return dados;
};

window.PRISMA_MODULES.abrirPDF = async function (url, nomeDocumento = 'documento.pdf') {
  const janela = window.open('', '_blank', 'width=1000,height=850');
  if (!janela) throw new Error('Não foi possível abrir a janela interna do documento.');

  janela.document.title = nomeDocumento;
  janela.document.body.innerHTML = '<p style=\"font-family:Segoe UI,Arial,sans-serif;padding:32px\">A carregar documento…</p>';

  try {
    const token = window.PRISMA_MODULES.obterToken();
    const resposta = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (resposta.status === 401) {
      janela.close();
      window.PRISMA_MODULES.terminarSessao();
      throw new Error('A sessão expirou.');
    }

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.message || `Não foi possível gerar o documento (${resposta.status}).`);
    }

    const blob = await resposta.blob();
    const objectUrl = URL.createObjectURL(blob);
    janela.location.replace(objectUrl);
    janela.addEventListener('unload', () => URL.revokeObjectURL(objectUrl), { once: true });
  } catch (error) {
    janela.close();
    throw error;
  }
};

window.PRISMA_MODULES.esc = function (v) {
  return typeof escaparHTML === 'function' ? escaparHTML(v) : String(v ?? '');
};

window.PRISMA_MODULES.shell = function (titulo, breadcrumb, conteudo, utilizador) {
  const main = document.querySelector('.dashboard-main');
  if (!main) return null;
  main.innerHTML = `
    <header class="dashboard-header">
      <div>
        <span class="dashboard-breadcrumb">${window.PRISMA_MODULES.esc(breadcrumb)}</span>
        <h1>${window.PRISMA_MODULES.esc(titulo)}</h1>
      </div>
      ${typeof renderHeaderUser === 'function' ? renderHeaderUser(utilizador) : ''}
    </header>
    <section class="dashboard-content module-page">${conteudo}</section>`;
  return main;
};

window.PRISMA_MODULES.table = function (headers, rows) {
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(h => `<th>${window.PRISMA_MODULES.esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
};

window.PRISMA_MODULES.money = function (v) {
  return Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
};

window.PRISMA_MODULES.date = function (v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
};
