// Capturas das JANELAS dos post-its no app real (executor falso, dados sintéticos: não gasta assinatura).
// Saída: <TEMP>\sticky-postits\<caso>\*.png     Uso: node scripts/capturar-postits.mjs   (precisa de `npm run build`)
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = createRequire(import.meta.url)('electron');
const saida = join(tmpdir(), 'sticky-postits');
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrir(tema) {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-cap-'));
  // uma meta sintética para o contexto
  writeFileSync(join(dados, 'metas.json'), JSON.stringify({ versao: 1, metas: [{ id: 'm1', nome: 'Aprender violão', status: 'ativa', prazo: '2027-06-30', porque: '', proximoPasso: 'Praticar 2 acordes', criadaEm: new Date().toISOString(), atualizadaEm: '' }] }));
  const env = { ...process.env, STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_THEME: tema };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe, args: ['.'], env });
  const postit = async (sub) => {
    for (;;) {
      const w = app.windows().find((x) => x.url().includes('postit.html') && (!sub || x.url().includes(sub)));
      if (w) return w;
      await espera(100);
    }
  };
  const p = await postit();
  // O Playwright força prefers-color-scheme: light por padrão; sem isto o tema escuro nunca apareceria na captura.
  await p.emulateMedia({ colorScheme: tema === 'dark' ? 'dark' : 'light' });
  await p.waitForSelector('.postit');
  await espera(600);
  return { app, p, dados, postit };
}

async function caso(nome, tema, f) {
  const pasta = join(saida, nome);
  mkdirSync(pasta, { recursive: true });
  const ctx = await abrir(tema);
  const foto = async (arq) => { await espera(300); await ctx.p.screenshot({ path: join(pasta, `${arq}.png`) }); };
  try { await f(ctx, foto); } finally { await ctx.app.close().catch(() => {}); rmSync(ctx.dados, { recursive: true, force: true }); }
  console.log(`${nome}: ok`);
}
const enviar = async (p, t) => { await p.getByLabel('Mensagem para o Claude').fill(t); await p.keyboard.press('Enter'); };
const concluida = (p) => p.locator('.msg.escrevendo').waitFor({ state: 'detached', timeout: 15000 });

for (const tema of ['light', 'dark']) {
  await caso(`conversa-${tema}`, tema, async ({ p }, foto) => {
    await foto('1-vazio');
    await enviar(p, 'Revise minhas metas e me diga o que está parado');
    await p.locator('.msg.escrevendo').waitFor();
    await foto('2-escrevendo');
    await concluida(p);
    await enviar(p, 'proponha-metas');
    await concluida(p);
    await foto('3-com-proposta');
  });
}

await caso('menu-e-instrucoes-light', 'light', async ({ p }, foto) => {
  await p.locator('button[title="Opções do post-it"]').click();
  await foto('1-menu');
  await p.getByRole('menuitem', { name: /Instruções deste post-it/ }).click();
  await p.getByRole('textbox', { name: 'Instruções' }).fill('Responda sempre em 3 tópicos curtos.\nFoque no Projeto X.');
  await foto('2-instrucoes');
});

await caso('cores-dark', 'dark', async ({ p }, foto) => {
  await enviar(p, 'oi');
  await concluida(p);
  for (const cor of ['rosa', 'verde', 'azul', 'laranja', 'lilas']) {
    await p.locator('button[title="Opções do post-it"]').click();
    await p.locator(`button.cor[data-cor=${cor}]`).click();
    await p.keyboard.press('Escape');
    await foto(cor);
  }
});

await caso('titulo-editavel-light', 'light', async ({ p }, foto) => {
  await p.locator('button.titulo').click();
  await p.getByLabel('Nome do post-it').fill('Projeto X');
  await foto('1-editando');
  await p.keyboard.press('Enter');
  await p.locator('button[title^="Sempre no topo"]').click();
  await foto('2-renomeado-e-fixo');
});

console.log(`Capturas em: ${saida}`);
