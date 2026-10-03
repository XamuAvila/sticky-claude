// E2E da inicialização automática na interface, com um "registro" de mentira (arquivo): NÃO toca no registro do Windows.
// Pré-requisito: npm run build.   Rodar: npm run test:e2e
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirApp, esperar, type AppE2E } from './helpers';

let a: AppE2E | undefined;
afterEach(async () => { await a?.fechar(); a = undefined; });

const chaveRun = () => {
  try { return execSync('reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', { encoding: 'utf8' }); } catch { return ''; }
};
const entradaFalsa = (dados: string) => {
  const f = join(dados, 'fake-autoinicio.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { entrada: boolean }).entrada : undefined;
};
const preferencias = (dados: string) => {
  const f = join(dados, 'preferencias.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
};
const interruptor = (a: AppE2E) => a.page.getByRole('switch', { name: 'Iniciar com o Windows' });

describe('inicialização automática (interface)', () => {
  it('pede confirmação na primeira vez; "Agora não" não cria nada; "Ativar" cria; desligar remove', async () => {
    a = await abrirApp({ env: { STICKY_FAKE_AUTOINICIO: '1' } });
    const { page } = a;
    await interruptor(a).waitFor();
    expect(await interruptor(a).isChecked()).toBe(false);
    expect(entradaFalsa(a.dados)).toBeUndefined();

    // 1º: abre o diálogo e recusa
    await interruptor(a).click();
    await page.getByRole('heading', { name: 'Iniciar com o Windows?' }).waitFor();
    await page.getByText(/uma entrada de inicialização só para o seu usuário/).waitFor();
    expect(entradaFalsa(a.dados)).toBeUndefined(); // nada foi criado enquanto o diálogo está aberto
    expect(await page.evaluate('document.activeElement && document.activeElement.textContent')).toBe('Agora não'); // foco seguro
    await page.getByRole('button', { name: 'Agora não' }).click();
    await page.getByRole('heading', { name: 'Iniciar com o Windows?' }).waitFor({ state: 'hidden' });
    expect(await interruptor(a).isChecked()).toBe(false);
    expect(entradaFalsa(a.dados)).toBeUndefined();
    expect(preferencias(a.dados).autoInicioConfirmado).toBeUndefined();

    // 2º: aceita
    await interruptor(a).click();
    await page.getByRole('button', { name: 'Ativar' }).click();
    await esperar(() => entradaFalsa(a!.dados), (v) => v === true);
    expect(await interruptor(a).isChecked()).toBe(true);
    expect(preferencias(a.dados).autoInicioConfirmado).toBe(true);

    // desligar: sem diálogo, e a entrada some
    await interruptor(a).click();
    await esperar(() => entradaFalsa(a!.dados), (v) => v === false);
    expect(await interruptor(a).isChecked()).toBe(false);

    // ligar de novo: já confirmou antes, então não pergunta
    await interruptor(a).click();
    await esperar(() => entradaFalsa(a!.dados), (v) => v === true);
    expect(await page.getByRole('heading', { name: 'Iniciar com o Windows?' }).count()).toBe(0);
  });

  it('o estado ligado sobrevive a reiniciar o app', async () => {
    a = await abrirApp({ env: { STICKY_FAKE_AUTOINICIO: '1' } });
    await interruptor(a).click();
    await a.page.getByRole('button', { name: 'Ativar' }).click();
    await esperar(() => entradaFalsa(a!.dados), (v) => v === true);
    const dados = a.dados;
    await a.fechar(false);

    a = await abrirApp({ dados, env: { STICKY_FAKE_AUTOINICIO: '1' } });
    await interruptor(a).waitFor();
    await esperar(() => interruptor(a!).isChecked(), (v) => v === true);
    expect(await interruptor(a).isChecked()).toBe(true);
  });

  it('rodando a partir do código o interruptor fica desabilitado, explica por quê e NÃO toca no registro real', async () => {
    const antes = chaveRun();
    a = await abrirApp(); // sem STICKY_FAKE_AUTOINICIO e sem app empacotado
    await interruptor(a).waitFor();
    expect(await interruptor(a).isDisabled()).toBe(true);
    await a.page.getByText(/Disponível no app instalado ou portátil/).waitFor();
    await interruptor(a).click({ force: true }).catch(() => undefined); // mesmo forçando o clique, nada acontece
    await new Promise((r) => setTimeout(r, 600));
    expect(await a.page.getByRole('heading', { name: 'Iniciar com o Windows?' }).count()).toBe(0);
    expect(chaveRun()).toBe(antes); // HKCU\...\Run idêntico (leitura somente)
  });
});
