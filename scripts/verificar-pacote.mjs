// Verifica o app EMPACOTADO (release\win-unpacked ou o .exe portátil) numa pasta de dados isolada.
// NÃO instala nada e NÃO liga a inicialização automática (só abre o diálogo de confirmação e recusa).
// Usa o Claude de verdade (briefing real + uma mensagem num post-it): consome a assinatura.
//   node scripts/verificar-pacote.mjs                 -> release\win-unpacked\Sticky Claude.exe
//   node scripts/verificar-pacote.mjs <caminho.exe>   -> outro executável (ex.: o portátil)
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exe = resolve(process.argv[2] ?? join('release', 'win-unpacked', 'Sticky Claude.exe'));
if (!existsSync(exe)) { console.error('Executável não encontrado:', exe); process.exit(2); }
const portatil = /portatil|portable/i.test(exe);
if (portatil) {
  // O portátil é um "envelope" que extrai o app e o abre em outro processo: o depurador do Playwright não chega nele.
  console.error('O portátil não pode ser dirigido pelo Playwright. Use: .\\scripts\\verificar-portatil.ps1');
  process.exit(2);
}
const dados = mkdtempSync(join(tmpdir(), 'sticky-pacote-'));
const env = { ...process.env, STICKY_DATA_DIR: dados };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STICKY_FAKE_CLAUDE; // pacote de verdade: Claude de verdade
if (portatil) env.PORTABLE_EXECUTABLE_FILE = exe; // o wrapper portátil define isto; aqui garantimos o mesmo ambiente

const chaveRun = () => { try { return execSync('reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', { encoding: 'utf8' }); } catch { return ''; } };
const runAntes = chaveRun();
let falhas = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? '[ OK ]' : '[FALHA]'} ${nome}${extra ? ` (${extra})` : ''}`); if (!cond) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Executável: ${exe}${portatil ? ' (portátil)' : ''}`);
const app = await electron.launch({ executablePath: exe, args: [], env, timeout: 90_000 });
try {
  const achar = async (parte) => { for (let i = 0; i < 300; i++) { const w = app.windows().find((x) => x.url().includes(parte)); if (w) return w; await espera(200); } throw new Error(`janela ${parte} não apareceu`); };
  const painel = await achar('panel.html');
  await painel.waitForSelector('[data-testid=nova-meta]', { timeout: 30_000 });

  const info = await app.evaluate(({ app: a }) => ({ empacotado: a.isPackaged, versao: a.getVersion(), nome: a.getName() }));
  ok('o app está empacotado (isPackaged)', info.empacotado === true, `v${info.versao}`);

  // post-it "Metas" criado na primeira execução (pasta de dados nova)
  const postit = await achar('postit.html');
  ok('o post-it "Metas" abriu sozinho', true);

  // interruptor de inicialização: habilitado, desligado, e o diálogo mostra o programa certo (sem ativar)
  const sw = painel.getByRole('switch', { name: 'Iniciar com o Windows' });
  await sw.waitFor();
  ok('interruptor "Iniciar com o Windows" habilitado no app empacotado', !(await sw.isDisabled()));
  ok('interruptor começa desligado', !(await sw.isChecked()));
  await sw.click();
  await painel.getByRole('heading', { name: 'Iniciar com o Windows?' }).waitFor();
  const textoDialogo = await painel.locator('dialog.dialogo[open]').innerText();
  const esperado = portatil ? exe : exe;
  ok('o diálogo mostra o programa que o Windows executaria', textoDialogo.includes(esperado), esperado);
  await painel.getByRole('button', { name: 'Agora não' }).click();
  ok('recusar não altera o registro (HKCU\\...\\Run idêntico)', chaveRun() === runAntes);

  // briefing REAL (3 chamadas ao Claude)
  console.log('… aguardando o briefing real (até 3 min)');
  const t0 = Date.now();
  await painel.waitForFunction(() => {
    const btn = [...document.querySelectorAll('button.primario')].find((b) => /Atualiz/.test(b.textContent ?? ''));
    return btn && !btn.disabled && /Atualizar$/.test((btn.textContent ?? '').trim());
  }, null, { timeout: 180_000 });
  const status = await painel.evaluate(() => [...document.querySelectorAll('section.cartao')].map((s) => ({
    secao: s.getAttribute('aria-label'), erro: !!s.querySelector('.aviso-erro, .chip.erro'),
    itens: s.querySelectorAll('.evento, .email, .foco li, .meta').length,
  })));
  console.log(`  briefing terminou em ${((Date.now() - t0) / 1000).toFixed(0)} s:`, JSON.stringify(status));
  for (const nome of ['Hoje', 'E-mails que pedem ação', 'Foco sugerido']) {
    const s = status.find((x) => x.secao === nome);
    ok(`briefing real: "${nome}" sem erro`, !!s && !s.erro, `${s?.itens ?? 0} itens`);
  }

  // conversa real no post-it (--session-id) e leitura do log
  await postit.getByLabel('Mensagem para o Claude').fill('Responda somente com a palavra: pronto');
  await postit.keyboard.press('Enter');
  await postit.locator('.msg.claude').first().waitFor({ timeout: 90_000 });
  await postit.locator('.msg.escrevendo').waitFor({ state: 'detached', timeout: 90_000 });
  const resposta = (await postit.locator('.msg.claude').last().innerText()).trim();
  ok('o post-it conversou com o Claude real', resposta.length > 0 && (await postit.locator('.msg.aviso').count()) === 0, `resposta de ${resposta.length} caracteres`);
  const postits = JSON.parse(readFileSync(join(dados, 'postits.json'), 'utf8')).postits;
  ok('a sessão ficou marcada como iniciada', postits[0].iniciada === true);

  const log = readFileSync(join(dados, 'logs', 'app.log'), 'utf8');
  ok('log com metadados e sem texto de conversa', log.includes('"empacotado":true') && !log.includes('pronto'));
} finally {
  await app.close().catch(() => undefined);
  console.log('registro HKCU\\...\\Run igual ao de antes:', chaveRun() === runAntes);
  if (chaveRun() !== runAntes) falhas++;
  rmSync(dados, { recursive: true, force: true });
}
console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas);
