// E2E dos post-its no app REAL: janelas de verdade, cliques e digitação, conferindo postits.json e as chamadas ao "Claude falso".
// Pré-requisito: npm run build.   Rodar: npm run test:e2e
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirApp, esperar, metaSemente, type AppE2E } from './helpers';

let a: AppE2E | undefined;
afterEach(async () => { await a?.fechar(); a = undefined; });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function enviar(p: Page, texto: string) {
  await p.getByLabel('Mensagem para o Claude').fill(texto);
  await p.keyboard.press('Enter');
}
/** A resposta terminou de verdade (a conversa já foi gravada em disco), não só começou a aparecer. */
const concluida = (p: Page) => p.locator('.msg.escrevendo').waitFor({ state: 'detached', timeout: 15_000 });
const abrirMenu = (p: Page) => p.locator('button[title="Opções do post-it"]').click();
const janela = async (app: AppE2E, titulo: string) => (await app.janelasNativas()).find((j) => j.titulo === titulo);

describe('post-its (app real)', () => {
  it('primeira execução cria o post-it "Metas"; reiniciar o app retoma a MESMA conversa e a MESMA sessão', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');
    const inicial = a.lerPostits();
    expect(inicial).toHaveLength(1);
    expect(inicial[0]).toMatchObject({ nome: 'Metas', iniciada: false, acessoGoogle: false, sempreNoTopo: false, oculto: false });
    expect(inicial[0]!.sessionId).toMatch(UUID);
    const sessao = inicial[0]!.sessionId as string;
    expect((await janela(a, 'Metas'))?.visivel).toBe(true);

    await enviar(p, 'Olá, vamos revisar as metas');
    await p.locator('.msg.usuario').getByText('Olá, vamos revisar as metas').waitFor();
    await p.locator('.msg.claude').getByText(/Resposta simulada 1 de “Metas”/).waitFor();
    await concluida(p);
    await esperar(() => a!.lerPostits()[0]!.iniciada, (v) => v === true);
    await enviar(p, 'segunda mensagem');
    await p.locator('.msg.claude').getByText(/Resposta simulada 2/).waitFor();
    await concluida(p);

    const antes = (await janela(a, 'Metas'))!.bounds;
    const dados = a.dados;
    await a.fechar(false); // "reiniciar": fecha o app e abre de novo com os mesmos dados

    a = await abrirApp({ dados });
    const p2 = await a.postit('Metas'); // a janela reabre sozinha
    await p2.locator('.msg.usuario').getByText('Olá, vamos revisar as metas').waitFor(); // conversa de volta na tela
    await p2.locator('.msg.claude').getByText(/Resposta simulada 2/).waitFor();
    expect((await janela(a, 'Metas'))!.bounds).toEqual(antes); // mesmo lugar e tamanho

    await enviar(p2, 'terceira, depois de reiniciar');
    await p2.locator('.msg.claude').getByText(/Resposta simulada 3 de “Metas”/).waitFor();

    const chamadas = a.lerChamadasFalsas();
    expect(chamadas.map((c) => [c.sessionId, c.retomar])).toEqual([[sessao, false], [sessao, true], [sessao, true]]);
    expect(a.lerPostits()).toHaveLength(1); // não semeou "Metas" de novo
    expect(a.lerPostits()[0]!.sessionId).toBe(sessao);
  });

  it('a posição e o tamanho sobrevivem até a um encerramento forçado (processo morto de repente)', async () => {
    a = await abrirApp();
    await a.postit('Metas');
    await new Promise((r) => setTimeout(r, 700)); // o app ignora "mover" nos 400 ms seguintes à criação da janela (reposicionamento próprio)
    await a.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Metas')!;
      w.setBounds({ x: 210, y: 160, width: 410, height: 460 });
      w.emit('moved');
    });
    // O Windows com escala fracionária (ex.: 150%) soma 1 px de borda: vale o que a janela REALMENTE mede.
    const medido = (await janela(a, 'Metas'))!.bounds;
    expect([medido.x, medido.y]).toEqual([210, 160]);
    const gravado = await esperar(() => a!.lerPostits()[0]!.bounds, (b) => b.width === medido.width && b.height === medido.height, 4000);
    expect(gravado).toEqual(medido); // gravado em disco antes da "queda"
    const dados = a.dados;
    await a.matar();

    // dois ciclos de "reabrir, mexer na janela, reabrir": o tamanho não pode crescer nem encolher (sem deriva)
    for (let ciclo = 1; ciclo <= 2; ciclo++) {
      a = await abrirApp({ dados });
      await a.postit('Metas');
      expect((await janela(a, 'Metas'))!.bounds, `ciclo ${ciclo}`).toEqual(medido);
      await new Promise((r) => setTimeout(r, 700));
      await a.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Metas')!.emit('moved'); });
      await new Promise((r) => setTimeout(r, 700));
      expect(a.lerPostits()[0]!.bounds, `ciclo ${ciclo} (gravado)`).toEqual(medido);
      if (ciclo === 1) await a.fechar(false);
    }
    expect(a.lerPostits()[0]!.tela).toMatchObject({ id: expect.any(Number), scaleFactor: expect.any(Number) }); // lembra o monitor
  });

  it('o X só oculta: a sessão e a conversa ficam intactas, e o post-it volta pelo painel (e continua oculto ao reiniciar)', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');
    await enviar(p, 'guarde isto');
    await p.locator('.msg.claude').getByText(/Resposta simulada 1/).waitFor();
    await esperar(() => a!.lerPostits()[0]!.iniciada, (v) => v === true);
    const sessao = a.lerPostits()[0]!.sessionId;

    await p.locator('button[title^="Ocultar"]').click();
    await esperar(() => janela(a!, 'Metas'), (j) => j?.visivel === false);
    expect(a.lerPostits()[0]).toMatchObject({ oculto: true, sessionId: sessao, iniciada: true });
    expect((await a.janelasNativas()).length).toBeGreaterThan(0); // o app segue vivo

    // reiniciar com o post-it oculto: continua oculto
    const dados = a.dados;
    await a.fechar(false);
    a = await abrirApp({ dados });
    await a.page.locator('.nome-postit', { hasText: 'Metas' }).waitFor(); // aparece na lista do painel
    expect((await janela(a, 'Metas'))?.visivel ?? false).toBe(false);

    // mostrar pelo painel: volta com a conversa
    await a.page.getByTestId('alternar-postit').click();
    const p2 = await a.postit('Metas');
    await esperar(() => janela(a!, 'Metas'), (j) => j?.visivel === true);
    await p2.locator('.msg.usuario').getByText('guarde isto').waitFor();
    expect(a.lerPostits()[0]).toMatchObject({ oculto: false, sessionId: sessao });
  });

  it('renomear, cor, sempre no topo e instruções persistem e valem na mensagem seguinte', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');

    // renomear
    await p.locator('button.titulo').click();
    await p.getByLabel('Nome do post-it').fill('Projeto X');
    await p.keyboard.press('Enter');
    await esperar(() => a!.lerPostits()[0]!.nome, (n) => n === 'Projeto X');
    expect((await janela(a, 'Projeto X'))?.visivel).toBe(true); // o título da janela acompanha

    // cor
    await abrirMenu(p);
    await p.locator('button.cor[data-cor=rosa]').click();
    await esperar(() => a!.lerPostits()[0]!.cor, (c) => c === 'rosa');
    expect(await p.locator('.postit').getAttribute('data-cor')).toBe('rosa');

    // acesso ao e-mail e à agenda (somente leitura)
    await p.getByLabel(/Pode ler e-mail e agenda/).check();
    await esperar(() => a!.lerPostits()[0]!.acessoGoogle, (v) => v === true);

    // instruções próprias
    await p.getByRole('menuitem', { name: /Instruções deste post-it/ }).click();
    await p.getByRole('textbox', { name: 'Instruções' }).fill('Responda sempre em 3 tópicos.');
    await p.getByRole('button', { name: 'Salvar' }).click();
    await esperar(() => a!.lerPostits()[0]!.instrucoes, (t) => t === 'Responda sempre em 3 tópicos.');

    // sempre no topo
    await p.locator('button[title^="Sempre no topo"]').click();
    await esperar(() => janela(a!, 'Projeto X'), (j) => j?.topo === true);
    expect(a.lerPostits()[0]!.sempreNoTopo).toBe(true);

    await enviar(p, 'oi');
    await p.locator('.msg.claude').getByText(/Resposta simulada 1 de “Projeto X”/).waitFor();
    const chamada = a.lerChamadasFalsas().at(-1)!;
    expect(chamada.instrucoes).toBe('Responda sempre em 3 tópicos.');
    expect(chamada.systemPrompt).toContain('Responda sempre em 3 tópicos.');
    expect(chamada.systemPrompt).toContain('pode LER o Gmail');
    expect(chamada.acessoGoogle).toBe(true);

    // tudo isso sobrevive a um reinício
    const dados = a.dados;
    await a.fechar(false);
    a = await abrirApp({ dados });
    await a.postit('Projeto X');
    expect(a.lerPostits()[0]).toMatchObject({ nome: 'Projeto X', cor: 'rosa', sempreNoTopo: true, acessoGoogle: true });
    expect((await janela(a, 'Projeto X'))?.topo).toBe(true);
  });

  it('criar outro post-it dá nome, cor e sessão próprios; excluir apaga só esse (janela, estado e conversa)', async () => {
    a = await abrirApp();
    const p1 = await a.postit('Metas');
    await a.page.getByTestId('novo-postit').click();
    const p2 = await a.postit('Post-it 2');
    const [x, y] = a.lerPostits();
    expect(x!.sessionId).not.toBe(y!.sessionId);
    expect(x!.cor).not.toBe(y!.cor);

    await enviar(p1, 'mensagem do primeiro');
    await p1.locator('.msg.claude').getByText(/Resposta simulada 1 de “Metas”/).waitFor();
    await enviar(p2, 'mensagem do segundo');
    await p2.locator('.msg.claude').getByText(/Resposta simulada 1 de “Post-it 2”/).waitFor();
    const chamadas = a.lerChamadasFalsas();
    expect(new Set(chamadas.map((c) => c.sessionId)).size).toBe(2); // cada post-it, sua própria sessão

    const idSegundo = y!.id as string;
    const arqConversa = join(a.dados, 'conversas', `${idSegundo}.json`);
    expect(existsSync(arqConversa)).toBe(true);

    await abrirMenu(p2);
    await p2.getByRole('menuitem', { name: 'Excluir post-it' }).click();
    await p2.getByRole('menuitem', { name: /Confirmar: apagar/ }).click();
    await esperar(() => a!.lerPostits(), (l) => l.length === 1);
    expect(a.lerPostits()[0]!.nome).toBe('Metas');
    // (não esperei a resposta "concluir" antes de excluir, de propósito: nada pode regravar a conversa depois)
    await esperar(() => readdirSync(join(a!.dados, 'conversas')).filter((f) => f.startsWith(idSegundo)), (l) => l.length === 0);
    expect(readdirSync(join(a.dados, 'conversas')).filter((f) => f.startsWith(idSegundo))).toEqual([]); // nem .bak nem .tmp
    await new Promise((r) => setTimeout(r, 800));
    expect(existsSync(arqConversa)).toBe(false); // e continua apagada
    expect((await a.janelasNativas()).some((j) => j.titulo === 'Post-it 2')).toBe(false);
    expect((await janela(a, 'Metas'))?.visivel).toBe(true);
  });

  it('"Parar" interrompe a resposta, guarda o que chegou e a conversa continua', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');
    await enviar(p, 'responda bem lento por favor');
    await p.locator('.msg.escrevendo').waitFor();
    await p.getByRole('button', { name: 'Parar' }).click();
    await p.locator('.msg.aviso').getByText('Interrompido.').waitFor();
    await p.locator('.parcial').waitFor();
    await enviar(p, 'oi de novo');
    await p.locator('.msg.claude').getByText(/Resposta simulada 2/).waitFor({ timeout: 10_000 });
  });

  it('se o Claude perdeu a sessão, o post-it recomeça com um resumo da cópia local e avisa', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');
    await enviar(p, 'minha palavra secreta é abacate');
    await p.locator('.msg.claude').getByText(/Resposta simulada 1/).waitFor();
    await esperar(() => a!.lerPostits()[0]!.iniciada, (v) => v === true);
    const antes = a.lerPostits()[0]!.sessionId;

    rmSync(join(a.dados, 'fake-sessoes.json')); // o histórico do Claude "sumiu"
    await enviar(p, 'qual era a palavra?');
    await p.locator('.msg.aviso').getByText(/não estava mais no Claude/).waitFor();
    await p.locator('.msg.claude').getByText(/CONTEXTO-RECUPERADO/).waitFor();
    await esperar(() => a!.lerPostits()[0]!, (x) => x.iniciada === true && x.sessionId !== antes);

    const depois = a.lerPostits()[0]!;
    expect(depois.sessionId).not.toBe(antes);
    expect(depois.iniciada).toBe(true);
    const refeita = a.lerChamadasFalsas().at(-1)!;
    expect(refeita.retomar).toBe(false);
    expect(refeita.mensagem).toContain('abacate'); // o resumo levou a conversa anterior
  });

  it('uma proposta de alteração das metas vinda da conversa só vale depois do "Aplicar" no painel', async () => {
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] } });
    const p = await a.postit('Metas');
    await enviar(p, 'proponha-metas por favor');
    await p.locator('.msg.claude .nota-patch').getByText(/Propus alterar suas metas/).waitFor();
    expect(await p.locator('.msg.claude').innerText()).not.toContain('metas-patch'); // o bloco técnico não aparece no post-it
    expect(await p.locator('.msg.aviso').count()).toBe(0); // e a frase não é repetida num aviso
    expect(a.lerMetas()).toHaveLength(1); // nada mudou ainda

    const painel = a.page;
    await painel.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor();
    await painel.getByText(/post-it “Metas”/).waitFor();
    await painel.getByRole('button', { name: 'Aplicar' }).click();
    const metas = await esperar(() => a!.lerMetas(), (m) => m.length === 2);
    expect(metas.find((m) => m.id === 'm-semente')!.proximoPasso).toBe('Escolher o primeiro passo de 15 minutos');
    expect(metas.some((m) => m.nome === 'Meta sugerida no post-it')).toBe(true);
  });

  it('uma proposta inválida não vira proposta e o post-it avisa', async () => {
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] } });
    const p = await a.postit('Metas');
    await enviar(p, 'proponha-invalido');
    await p.locator('.msg.aviso').getByText(/Não consegui usar a proposta/).waitFor();
    expect(a.lerMetas()).toHaveLength(1);
    expect(await a.page.getByRole('heading', { name: 'Alterar suas metas?' }).count()).toBe(0);
  });

  it('os arquivos de estado usam gravação atômica (sem sobras .tmp) e a pasta de conversas só tem JSON', async () => {
    a = await abrirApp();
    const p = await a.postit('Metas');
    await enviar(p, 'oi');
    await p.locator('.msg.claude').getByText(/Resposta simulada 1/).waitFor();
    await esperar(() => a!.lerPostits()[0]!.iniciada, (v) => v === true);
    const sobras = [...readdirSync(a.dados), ...readdirSync(join(a.dados, 'conversas'))].filter((f) => f.endsWith('.tmp'));
    expect(sobras).toEqual([]);
  });
});
