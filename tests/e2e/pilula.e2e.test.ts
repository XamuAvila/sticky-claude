// E2E da pílula do topo da tela no app REAL (briefing em cache de teste; não chama o Claude).
// Pré-requisito: npm run build.   Rodar: npm run test:e2e
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirApp, esperar, metaSemente, type AppE2E } from './helpers';

let a: AppE2E | undefined;
afterEach(async () => { await a?.fechar(); a = undefined; });

const TITULO_PILULA = 'Sticky Claude (pílula)';
const agoraISO = () => new Date().toISOString();
const emMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const evento = (titulo: string, min: number, dur = 30) => ({ titulo, inicio: emMin(min), fim: emMin(min + dur), diaInteiro: false });

/** Briefing em cache recente e completo: o app só mostra o cache (sem executar o briefing no início). */
const briefing = (eventos: unknown[]) => ({
  versao: 1, geradoEm: agoraISO(),
  agenda: { status: 'ok', atualizadoEm: agoraISO(), dados: { eventos } },
  emails: { status: 'ok', atualizadoEm: agoraISO(), dados: { itens: [], suspeitos: [] } },
  foco: { status: 'ok', atualizadoEm: agoraISO(), dados: { prioridades: [] } },
});

const ligada = { STICKY_PILULA: '1' };
const janelaPilula = async (x: AppE2E) => (await x.janelasNativas()).find((j) => j.titulo === TITULO_PILULA);

async function paginaDaPilula(x: AppE2E, ms = 20_000): Promise<Page> {
  const fim = Date.now() + ms;
  for (;;) {
    const p = x.app.windows().find((w) => w.url().includes('pilula.html'));
    if (p) return p;
    if (Date.now() > fim) throw new Error('janela da pílula não apareceu');
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('pílula no topo da tela (app real)', () => {
  it('mostra o próximo evento no centro do topo da tela principal, sempre no topo e sem tirar o foco', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Reunião de planejamento', 25), evento('Jantar', 300)]) });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula .linha .titulo', { hasText: 'Reunião de planejamento' }).waitFor();
    expect(await p.locator('.pilula .rotulo').innerText()).toMatch(/^Em (24|25) min$/);
    expect(await p.locator('.pilula').getAttribute('class')).toContain('modo-em-breve');

    const j = (await esperar(() => janelaPilula(a!), (v) => v?.visivel === true))!;
    const wa = await a.areaUtil();
    expect(j.topo).toBe(true);
    expect(j.focavel).toBe(false); // não rouba o foco de quem está digitando
    expect(Math.abs(j.bounds.x + j.bounds.width / 2 - (wa.x + wa.width / 2))).toBeLessThanOrEqual(2); // centralizada
    expect(j.bounds.y).toBeLessThanOrEqual(wa.y + 10); // colada no topo
  });

  it('ao passar o mouse expande (agenda e meta do dia); ao sair, recolhe', async () => {
    a = await abrirApp({
      env: ligada,
      briefing: briefing([evento('Reunião de planejamento', 25), evento('Ligação com o cliente', 60), evento('Revisão', 90)]),
      metas: { versao: 1, metas: [metaSemente({ nome: 'Aprender violão', proximoPasso: 'Praticar 2 acordes' })] },
    });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula').waitFor();
    expect(await p.locator('.pilula').getAttribute('class')).not.toContain('aberta');

    await p.locator('.pilula').hover();
    await p.locator('.pilula.aberta').waitFor();
    const extra = (await p.locator('.pilula .extra').textContent()) ?? ''; // textContent: innerText aplicaria o "maiúsculas" do rótulo
    expect(extra).toContain('Reunião de planejamento');
    expect(extra).toContain('Ligação com o cliente');
    expect(extra).toContain('Meta do dia');
    expect(extra).toContain('Aprender violão');
    expect(extra).toContain('Praticar 2 acordes');

    await p.mouse.move(5, 270); // fora da pílula, ainda dentro da janela
    await esperar(() => p.locator('.pilula').getAttribute('class'), (c) => !c?.includes('aberta'), 3000);
    expect(await p.locator('.pilula').getAttribute('class')).not.toContain('aberta');
  });

  it('clicar na pílula abre o painel', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Reunião', 25)]) });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula').waitFor();
    await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Sticky Claude')!.hide());
    await esperar(() => a!.janelasNativas(), (l) => l.find((j) => j.titulo === 'Sticky Claude')?.visivel === false);
    await p.locator('.pilula').click();
    const painel = await esperar(() => a!.janelasNativas(), (l) => l.find((j) => j.titulo === 'Sticky Claude')?.visivel === true);
    expect(painel.find((j) => j.titulo === 'Sticky Claude')!.visivel).toBe(true);
  });

  it('evento começando em minutos fica urgente (ponto vermelho piscando)', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Ligação importante', 5)]) });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula.modo-urgente').waitFor();
    expect(await p.locator('.pilula .rotulo').innerText()).toMatch(/^Em [45] min$/);
    expect(await p.locator('.pilula').getAttribute('class')).toContain('urgente');
  });

  it('evento em andamento aparece como "Agora" com a hora de término', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Deep Work', -30, 90)]) });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula.modo-agora').waitFor();
    expect(await p.locator('.pilula .rotulo').innerText()).toBe('Agora');
    expect(await p.locator('.pilula .detalhe').innerText()).toMatch(/^até \d{2}:\d{2}$/);
  });

  it('sem evento próximo mostra a meta do dia, com o próximo passo', async () => {
    a = await abrirApp({
      env: ligada, briefing: briefing([]),
      metas: { versao: 1, metas: [metaSemente({ nome: 'Entregar o relatório', prazo: '2020-01-01', proximoPasso: 'Escrever o resumo' })] },
    });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula.modo-meta').waitFor();
    expect(await p.locator('.pilula .rotulo').innerText()).toBe('Meta do dia');
    expect(await p.locator('.pilula .titulo').innerText()).toBe('Entregar o relatório');
    expect(await p.locator('.pilula .detalhe').innerText()).toBe('Escrever o resumo');
    expect(await p.locator('.pilula').getAttribute('class')).toContain('urgente'); // meta atrasada pede atenção
  });

  it('sem nada para mostrar (sem eventos e sem metas) a pílula nem aparece', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([]) });
    await new Promise((r) => setTimeout(r, 2500));
    expect((await janelaPilula(a))?.visivel ?? false).toBe(false);
  });

  it('o interruptor das Configurações liga e desliga a pílula, grava a escolha e o app a respeita ao reabrir', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Reunião', 25)]) });
    await paginaDaPilula(a);
    await esperar(() => janelaPilula(a!), (j) => j?.visivel === true);
    const sw = a.page.getByRole('switch', { name: 'Pílula no topo da tela' });
    await sw.waitFor();
    expect(await sw.isChecked()).toBe(true);

    await sw.click(); // desliga
    await esperar(() => janelaPilula(a!), (j) => j?.visivel === false);
    expect((await janelaPilula(a))!.visivel).toBe(false);
    const arq = join(a.dados, 'preferencias.json');
    await esperar(() => (existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')).pilulaAtiva : undefined), (v) => v === false);

    const dados = a.dados;
    await a.fechar(false);
    a = await abrirApp({ dados, env: ligada }); // STICKY_PILULA=1, mas a escolha do usuário (desligada) manda
    await new Promise((r) => setTimeout(r, 2000));
    expect((await janelaPilula(a))?.visivel ?? false).toBe(false);
    const sw2 = a.page.getByRole('switch', { name: 'Pílula no topo da tela' });
    await sw2.waitFor();
    expect(await sw2.isChecked()).toBe(false);

    await sw2.click(); // liga de novo
    await esperar(() => janelaPilula(a!), (j) => j?.visivel === true);
    expect((await janelaPilula(a))!.visivel).toBe(true);
  });

  it('o mouse atravessa a janela transparente fora da pílula (só captura sobre ela)', async () => {
    a = await abrirApp({ env: ligada, briefing: briefing([evento('Reunião', 25)]) });
    const p = await paginaDaPilula(a);
    await p.locator('.pilula').waitFor();
    // fora da pílula, o ponteiro não "entra" nela: ela continua recolhida
    await p.mouse.move(8, 260);
    await new Promise((r) => setTimeout(r, 500));
    expect(await p.locator('.pilula').getAttribute('class')).not.toContain('aberta');
    // sobre a pílula, ela abre (e a janela passa a capturar o mouse)
    await p.locator('.pilula').hover();
    await p.locator('.pilula.aberta').waitFor();
  });
});
