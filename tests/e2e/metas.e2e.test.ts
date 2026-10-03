// E2E das metas no app REAL: cliques e digitação de verdade, conferindo o metas.json no disco.
// Pré-requisito: npm run build.   Rodar: npm run test:e2e
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirApp, esperar, metaSemente, type AppE2E } from './helpers';

let a: AppE2E | undefined;
afterEach(async () => { await a?.fechar(); a = undefined; });

const hoje = () => new Date().toLocaleDateString('sv-SE');

describe('metas na tela (app real)', () => {
  it('começa vazio, cria, edita, registra avanço e persiste em disco', async () => {
    a = await abrirApp();
    const { page } = a;

    await page.getByText('Nenhuma meta ainda').waitFor();

    // criar
    await page.getByTestId('nova-meta').click();
    await page.getByLabel('Nome').fill('Ler 12 livros');
    await page.getByLabel('Prazo').fill('2027-12-31');
    await page.getByLabel('Por quê').fill('Crescer');
    await page.getByLabel('Próximo passo (até 15 minutos)').fill('Ler 10 páginas');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await page.getByText('Ler 12 livros').waitFor();
    const criada = (await esperar(() => a!.lerMetas(), (m) => m.length === 1))[0]!;
    expect(criada).toMatchObject({ nome: 'Ler 12 livros', status: 'ativa', prazo: '2027-12-31', porque: 'Crescer', proximoPasso: 'Ler 10 páginas' });
    expect(String(await page.locator('.meta').first().innerText())).toMatch(/faltam \d+ dias \(31\/12\/2027\)/);

    // editar o próximo passo
    await page.getByTestId('editar-meta').click();
    await page.getByLabel('Próximo passo (até 15 minutos)').fill('Ler 5 páginas');
    await page.getByRole('button', { name: 'Salvar' }).click();
    const editada = (await esperar(() => a!.lerMetas(), (m) => m[0]?.proximoPasso === 'Ler 5 páginas'))[0]!;
    expect(editada.id).toBe(criada.id);
    await page.getByText('Ler 5 páginas').waitFor();

    // registrar avanço com nota
    await page.getByRole('button', { name: 'Registrar avanço' }).click();
    await page.getByLabel('O que avançou').fill('Li o capítulo 1');
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    const avancada = (await esperar(() => a!.lerMetas(), (m) => !!m[0]?.ultimoAvancoEm))[0]!;
    expect(avancada).toMatchObject({ ultimoAvancoEm: hoje(), ultimoAvancoNota: 'Li o capítulo 1' });
    await page.getByText('Último avanço: hoje — Li o capítulo 1').waitFor();
  });

  it('nome em branco não salva (o botão fica desabilitado)', async () => {
    a = await abrirApp();
    await a.page.getByTestId('nova-meta').click();
    await a.page.getByLabel('Nome').fill('   ');
    expect(await a.page.getByRole('button', { name: 'Salvar' }).isDisabled()).toBe(true);
    await a.page.getByRole('button', { name: 'Cancelar' }).click();
    expect(a.lerMetas()).toHaveLength(0);
  });

  it('excluir pede confirmação e faz backup', async () => {
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] } });
    const { page } = a;
    await page.getByTestId('editar-meta').click();
    await page.getByRole('button', { name: 'Excluir' }).click();
    // 1º clique só pede confirmação: nada some ainda
    expect(await page.getByRole('button', { name: 'Confirmar exclusão' }).isVisible()).toBe(true);
    expect(a.lerMetas()).toHaveLength(1);
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await esperar(() => a!.lerMetas(), (m) => m.length === 0);
    await page.getByText('Nenhuma meta ainda').waitFor();
    const backups = readdirSync(join(a.dados, 'backups'));
    expect(backups.some((f) => f.includes('antes-de-excluir'))).toBe(true);
  });

  it('edição manual do metas.json aparece na tela sem reiniciar', async () => {
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] } });
    await a.page.getByText('Aprender violão').waitFor();
    writeFileSync(a.arquivoMetas, JSON.stringify({ versao: 1, metas: [metaSemente({ nome: 'Aprender piano' })] }));
    await a.page.getByText('Aprender piano').waitFor({ timeout: 8000 });
  });

  it('arquivo corrompido: avisa, guarda cópia e deixa criar metas de novo', async () => {
    a = await abrirApp({ metasTextoCru: '{"versao":1,"metas":[{"id":' });
    const { page } = a;
    await page.getByText(/estava ilegível/).waitFor();
    expect(readdirSync(a.dados).some((f) => f.startsWith('metas.json.corrompido-'))).toBe(true);
    await page.getByTestId('nova-meta').click();
    await page.getByLabel('Nome').fill('Recomeçar');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await esperar(() => a!.lerMetas(), (m) => m.length === 1);
    expect(existsSync(a.arquivoMetas)).toBe(true);
  });

  it('meta parada e atrasada aparecem com aviso', async () => {
    const velha = new Date(Date.now() - 12 * 86_400_000).toISOString();
    a = await abrirApp({
      metas: {
        versao: 1,
        metas: [
          metaSemente({ id: 'a', nome: 'Parada', prazo: '2099-01-01', criadaEm: velha }),
          metaSemente({ id: 'b', nome: 'Atrasada', prazo: '2020-01-01', criadaEm: new Date().toISOString() }),
        ],
      },
    });
    await a.page.getByText(/parada há 12 dias/).waitFor();
    await a.page.getByText(/atrasada há \d+ dias/).waitFor();
    await a.page.getByText('2 metas pedem atenção').waitFor();
  });
});

describe('proposta do Claude (metas-patch) no app real', () => {
  // STICKY_SHOT_DIR liga o módulo de desenvolvimento que cria a proposta (como o Claude faria no M3).
  it('mostra o que vai mudar, não altera nada antes de confirmar e aplica no "Aplicar"', async () => {
    const dir = join((await import('node:os')).tmpdir(), `sticky-e2e-shots-${Date.now()}`);
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] }, env: { STICKY_SHOT_PROPOSTA: '1', STICKY_SHOT_DIR: dir } });
    const { page } = a;
    const antes = JSON.stringify(a.lerMetas());

    await page.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor({ timeout: 30_000 });
    await page.getByText('Nada foi alterado ainda.').waitFor();
    await page.getByText(/prazo 30\/06\/2027 → 15\/12\/2026/).waitFor();
    await page.getByText(/Criar a meta “Correr 5 km sem parar”/).waitFor();
    expect(JSON.stringify(a.lerMetas())).toBe(antes); // intacto enquanto o diálogo está aberto

    // foco inicial em "Descartar": Enter sem ler não altera as metas
    expect(await page.evaluate('document.activeElement && document.activeElement.textContent')).toBe('Descartar');

    await page.getByRole('button', { name: 'Aplicar' }).click();
    const depois = await esperar(() => a!.lerMetas(), (m) => m.length === 2);
    expect(depois.find((m) => m.id === 'm-semente')).toMatchObject({ prazo: '2026-12-15', proximoPasso: 'Separar 15 min hoje para listar os 3 maiores riscos', ultimoAvancoNota: 'Revisei o escopo com a equipe' });
    expect(depois.find((m) => m.nome === 'Correr 5 km sem parar')).toBeTruthy();
    expect(readdirSync(join(a.dados, 'backups')).some((f) => f.includes('antes-da-proposta'))).toBe(true);
    await page.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor({ state: 'detached' });
  });

  it('"Descartar" fecha o diálogo e não altera as metas', async () => {
    const dir = join((await import('node:os')).tmpdir(), `sticky-e2e-shots-${Date.now()}`);
    a = await abrirApp({ metas: { versao: 1, metas: [metaSemente()] }, env: { STICKY_SHOT_PROPOSTA: '1', STICKY_SHOT_DIR: dir } });
    const { page } = a;
    const antes = JSON.stringify(a.lerMetas());
    await page.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Descartar' }).click();
    await page.getByRole('heading', { name: 'Alterar suas metas?' }).waitFor({ state: 'detached' });
    expect(JSON.stringify(a.lerMetas())).toBe(antes);
  });
});
