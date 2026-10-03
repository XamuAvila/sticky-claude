// Capturas da PÍLULA do topo da tela (app real, briefing de teste; não chama o Claude).
// Saída: <TEMP>\sticky-pilula\*.png     Uso: node scripts/capturar-pilula.mjs   (precisa de `npm run build`)
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = createRequire(import.meta.url)('electron');
const saida = join(tmpdir(), 'sticky-pilula');
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const emMin = (m) => new Date(Date.now() + m * 60_000).toISOString();
const agoraISO = new Date().toISOString();
const ev = (titulo, ini, dur = 30) => ({ titulo, inicio: emMin(ini), fim: emMin(ini + dur), diaInteiro: false });

async function caso(nome, eventos, metas) {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-cap-pil-'));
  writeFileSync(join(dados, 'briefing.json'), JSON.stringify({
    versao: 1, geradoEm: agoraISO,
    agenda: { status: 'ok', atualizadoEm: agoraISO, dados: { eventos } },
    emails: { status: 'ok', atualizadoEm: agoraISO, dados: { itens: [], suspeitos: [] } },
    foco: { status: 'ok', atualizadoEm: agoraISO, dados: { prioridades: [] } },
  }));
  if (metas) writeFileSync(join(dados, 'metas.json'), JSON.stringify({ versao: 1, metas }));
  const env = { ...process.env, STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_PILULA: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe, args: ['.'], env });
  try {
    let p;
    for (let i = 0; i < 200 && !p; i++) { p = app.windows().find((w) => w.url().includes('pilula.html')); await espera(100); }
    await p.locator('.pilula').waitFor();
    // fundo cinza só para a captura (a janela de verdade é transparente)
    await p.evaluate(() => { document.documentElement.style.background = '#8a93a3'; document.body.style.background = '#8a93a3'; });
    await espera(350);
    await p.screenshot({ path: join(saida, `${nome}-compacta.png`) });
    await p.locator('.pilula').hover();
    await p.locator('.pilula.aberta').waitFor();
    await espera(500);
    await p.screenshot({ path: join(saida, `${nome}-expandida.png`) });
  } finally {
    await app.close().catch(() => {});
    rmSync(dados, { recursive: true, force: true });
  }
  console.log(`${nome}: ok`);
}

const meta = (p) => ({ id: 'm1', nome: 'Aprender violão', status: 'ativa', prazo: '2027-06-30', porque: '', proximoPasso: 'Praticar 2 acordes por 15 minutos', criadaEm: agoraISO, atualizadaEm: agoraISO, ...p });
await caso('em-breve', [ev('Reunião de planejamento', 25), ev('Ligação com o cliente', 70), ev('Revisão do relatório', 100)], [meta({})]);
await caso('urgente', [ev('Ligação importante com a diretoria', 5), ev('Almoço', 90)], [meta({})]);
await caso('agora', [ev('Deep Work', -30, 90), ev('Reunião de equipe', 100)], null);
await caso('meta-atrasada', [], [meta({ nome: 'Entregar o relatório trimestral', prazo: '2020-01-01', proximoPasso: 'Escrever o resumo executivo' })]);
console.log(`Capturas em: ${saida}`);
