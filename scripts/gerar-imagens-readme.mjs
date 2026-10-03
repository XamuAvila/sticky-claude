// Gera as imagens do README e da pasta docs/ com DADOS FICTÍCIOS (scripts/dados-ficticios.mjs). Roda o app de verdade
// (executor falso, sem gastar assinatura), nos temas claro e escuro, e grava PNGs em docs/imagens/.
//   npm run build && node scripts/gerar-imagens-readme.mjs
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { semear } from './dados-ficticios.mjs';

const exe = createRequire(import.meta.url)('electron');
const raiz = resolve(import.meta.dirname, '..');
const saida = join(raiz, 'docs', 'imagens');
const temp = mkdtempSync(join(tmpdir(), 'sticky-readme-'));
mkdirSync(saida, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const arquivos = {};   // nome lógico -> caminho do PNG bruto (temporário)

async function abrir(tema, extraEnv = {}) {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-dados-'));
  semear(dados);
  const env = {
    ...process.env, STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_FAKE_AUTOINICIO: '1',
    STICKY_THEME: tema, STICKY_PILULA: '1', ...extraEnv,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe, args: [raiz], env, timeout: 60_000 });
  const pagina = async (parte, tentativas = 300) => {
    for (let i = 0; i < tentativas; i++) { const p = app.windows().find((w) => w.url().includes(parte)); if (p) return p; await espera(150); }
    throw new Error(`janela ${parte} não apareceu`);
  };
  return { app, dados, pagina, fechar: async () => { await app.close().catch(() => {}); rmSync(dados, { recursive: true, force: true }); } };
}

/** O Playwright força prefers-color-scheme: light; sem isto o tema escuro nunca apareceria. */
const esquema = (p, tema) => p.emulateMedia({ colorScheme: tema === 'dark' ? 'dark' : 'light' });

async function capturarTema(tema) {
  const rotulo = tema === 'dark' ? 'escuro' : 'claro';
  const s = await abrir(tema);
  try {
    const painel = await s.pagina('panel.html');
    await esquema(painel, tema);
    await painel.waitForSelector('[data-testid=nova-meta]', { timeout: 30_000 });
    await painel.locator('.lista-postits li').first().waitFor({ timeout: 15_000 });
    // painel inteiro numa imagem só (o contêiner rolável deixa de limitar a altura)
    await painel.addStyleTag({ content: 'html,body,#raiz,.app{height:auto!important;overflow:visible!important}' });
    await espera(600);
    const caixa = async (nome) => (await painel.locator(`section[aria-label="${nome}"]`).boundingBox());
    const emails = await caixa('E-mails que pedem ação'); const metas = await caixa('Metas'); const foco = await caixa('Foco sugerido');
    const postitsCard = await caixa('Post-its'); const config = await caixa('Configurações');
    const larg = 500;
    // três recortes do painel (a ordem dos cartões é: Hoje, E-mails, Metas, Foco, Post-its, Configurações)
    const recortes = {
      briefing: { y0: 0, y1: emails.y + emails.height + 16 },
      metas: { y0: metas.y - 12, y1: foco.y + foco.height + 16 },
      config: { y0: postitsCard.y - 12, y1: config.y + config.height + 16 },
    };
    for (const [nome, r] of Object.entries(recortes)) {
      const arq = join(temp, `painel-${nome}-${rotulo}.png`);
      await painel.screenshot({ path: arq, fullPage: true, clip: { x: 0, y: r.y0, width: larg, height: r.y1 - r.y0 } });
      arquivos[`painel-${nome}-${rotulo}`] = arq;
    }

    for (const [nome, chave] of [['Metas', 'metas'], ['Projeto Atlas', 'atlas'], ['Ideias', 'ideias']]) {
      const id = JSON.parse((await import('node:fs')).readFileSync(join(s.dados, 'postits.json'), 'utf8')).postits.find((p) => p.nome === nome).id;
      let p; for (let i = 0; i < 200 && !p; i++) { p = s.app.windows().find((w) => w.url().includes(`id=${id}`)); await espera(100); }
      await esquema(p, tema);
      await p.waitForSelector('.postit'); await p.locator('.msg').first().waitFor();
      await espera(500);
      const arq = join(temp, `postit-${chave}-${rotulo}.png`);
      await p.screenshot({ path: arq });
      arquivos[`postit-${chave}-${rotulo}`] = arq;
    }

    const pil = await s.pagina('pilula.html');
    await esquema(pil, tema);
    await pil.locator('.pilula').waitFor();
    await espera(400);
    const c = join(temp, `pilula-compacta-${rotulo}.png`);
    await pil.screenshot({ path: c, omitBackground: true });
    await pil.locator('.pilula').hover();
    await pil.locator('.pilula.aberta').waitFor();
    await espera(600);
    const e = join(temp, `pilula-expandida-${rotulo}.png`);
    await pil.screenshot({ path: e, omitBackground: true });
    arquivos[`pilula-compacta-${rotulo}`] = c; arquivos[`pilula-expandida-${rotulo}`] = e;
  } finally { await s.fechar(); }
  console.log(`tema ${rotulo}: ok`);
}

async function capturarProposta(tema) {
  const rotulo = tema === 'dark' ? 'escuro' : 'claro';
  const arquivoPatch = join(temp, 'proposta.json');
  const dia = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE');
  writeFileSync(arquivoPatch, JSON.stringify({
    operacoes: [
      { op: 'atualizar', id: 'meta-relatorio', campos: { prazo: dia(1), proximoPasso: 'Escrever o resumo executivo (15 min)' } },
      { op: 'avanco', id: 'meta-corrida', nota: 'Caminhei 15 minutos' },
      { op: 'criar', meta: { nome: 'Ler 10 páginas por dia', status: 'ativa', prazo: dia(45), porque: 'Voltar ao hábito de leitura', proximoPasso: 'Ler 10 páginas antes de dormir' } },
    ],
  }));
  const s = await abrir(tema, { STICKY_SHOT_DIR: join(temp, 'hook'), STICKY_SHOT_PROPOSTA: '1', STICKY_SHOT_PROPOSTA_JSON: arquivoPatch, STICKY_PILULA: '0' });
  try {
    const painel = await s.pagina('panel.html');
    await esquema(painel, tema);
    await painel.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor({ timeout: 30_000 });
    await espera(700);
    const arq = join(temp, `proposta-${rotulo}.png`);
    await painel.screenshot({ path: arq, clip: { x: 0, y: 0, width: 500, height: 600 } }); // só o diálogo e um pouco do painel
    arquivos[`proposta-${rotulo}`] = arq;
  } finally { await s.fechar(); }
  console.log(`proposta ${rotulo}: ok`);
}

/** Renderiza um HTML numa janela oculta do Electron e devolve o PNG (largura final em px). */
async function montar(nome, html, largura, altura, larguraFinal = largura) {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-mont-'));
  const env = { ...process.env, STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_PILULA: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe, args: [raiz], env, timeout: 60_000 });
  try {
    const arqHtml = join(temp, `${nome}.html`);
    writeFileSync(arqHtml, html);
    const url = pathToFileURL(arqHtml).href;
    const dataUrl = await app.evaluate(async ({ BrowserWindow }, a) => {
      const w = new BrowserWindow({ show: false, width: a.largura, height: a.altura, useContentSize: true, frame: false, webPreferences: { backgroundThrottling: false, sandbox: true } });
      await w.loadURL(a.url);
      await w.webContents.executeJavaScript('Promise.all([...document.images].map((i) => i.decode().catch(() => {})))');
      await new Promise((r) => setTimeout(r, 400));
      const img = await w.webContents.capturePage();
      const final = img.getSize().width > a.larguraFinal ? img.resize({ width: a.larguraFinal, quality: 'best' }) : img;
      const png = final.toDataURL();
      w.destroy();
      return png;
    }, { url, largura, altura, larguraFinal });
    writeFileSync(join(saida, `${nome}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`montagem ${nome}: ok`);
  } finally { await app.close().catch(() => {}); rmSync(dados, { recursive: true, force: true }); }
}

const u = (k) => pathToFileURL(arquivos[k]).href;
const base = 'font-family:Segoe UI,system-ui,sans-serif;margin:0;';
const janela = 'border-radius:12px;box-shadow:0 22px 50px rgba(15,23,42,.38),0 0 0 1px rgba(255,255,255,.35);display:block;';

await capturarTema('light');
await capturarTema('dark');
await capturarProposta('light');
await capturarProposta('dark');

// ---- montagens ----
const fundoClaro = 'linear-gradient(135deg,#dbe7ff 0%,#e9defa 48%,#ffe3ec 100%)';
const fundoEscuro = 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 52%,#311844 100%)';

// imagem principal: um "desktop" com a pílula, os post-its e o painel
await montar('hero', `<html><body style="${base}width:1600px;height:900px;background:${fundoClaro};position:relative;overflow:hidden">
  <img src="${u('pilula-compacta-claro')}" style="position:absolute;left:560px;top:8px;width:480px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.25))">
  <img src="${u('painel-briefing-claro')}" style="${janela}position:absolute;right:80px;top:70px;width:500px">
  <img src="${u('postit-metas-claro')}" style="${janela}position:absolute;left:80px;top:110px;width:360px">
  <img src="${u('postit-atlas-claro')}" style="${janela}position:absolute;left:480px;top:210px;width:340px">
  <img src="${u('postit-ideias-claro')}" style="${janela}position:absolute;left:150px;top:660px;width:300px">
</body></html>`, 1600, 900, 1600);

for (const [t, r, fundo] of [['claro', 'claro', fundoClaro], ['escuro', 'escuro', fundoEscuro]]) {
  await montar(`postits-${t}`, `<html><body style="${base}width:1180px;height:580px;background:${fundo};position:relative;overflow:hidden">
  <img src="${u(`postit-metas-${r}`)}" style="${janela}position:absolute;left:40px;top:40px;width:360px">
  <img src="${u(`postit-atlas-${r}`)}" style="${janela}position:absolute;left:420px;top:60px;width:340px">
  <img src="${u(`postit-ideias-${r}`)}" style="${janela}position:absolute;left:790px;top:80px;width:320px">
</body></html>`, 1180, 580, 1180);
  // a pílula compacta (recortada no topo da janela transparente) e a expandida, lado a lado, com legendas
  const cor = t === 'escuro' ? 'rgba(255,255,255,.78)' : 'rgba(15,23,42,.7)';
  const legenda = `font-size:15px;font-weight:600;color:${cor};text-align:center;margin-top:14px;`;
  await montar(`pilula-${t}`, `<html><body style="${base}width:1100px;height:322px;background:${fundo};position:relative;overflow:hidden">
  <div style="position:absolute;left:40px;top:50px;width:480px">
    <div style="height:60px;overflow:hidden"><img src="${u(`pilula-compacta-${r}`)}" style="width:480px;display:block"></div>
    <div style="${legenda}">Compacta</div>
  </div>
  <div style="position:absolute;left:580px;top:30px;width:480px">
    <div style="height:236px;overflow:hidden"><img src="${u(`pilula-expandida-${r}`)}" style="width:480px;display:block"></div>
    <div style="${legenda}">Ao passar o mouse</div>
  </div>
</body></html>`, 1100, 322, 1100);
}

// cópias diretas (já no tamanho certo)
const { copyFileSync } = await import('node:fs');
for (const k of ['painel-briefing-claro', 'painel-briefing-escuro', 'painel-metas-claro', 'painel-metas-escuro', 'painel-config-claro', 'painel-config-escuro', 'proposta-claro', 'proposta-escuro']) {
  copyFileSync(arquivos[k], join(saida, `${k}.png`));
}
rmSync(temp, { recursive: true, force: true });
console.log(`Imagens em: ${saida}`);
