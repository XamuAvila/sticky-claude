// Verifica o INSTALADOR no seu Windows (por usuário, sem admin): atualizar por cima preserva a inicialização automática;
// desinstalar de verdade remove a entrada, os arquivos e os atalhos e PRESERVA os seus dados; reinstalar volta ao normal.
// Mexe na instalação e na entrada de inicialização do SEU usuário (com a sua autorização). Termina com o app instalado e a
// inicialização automática LIGADA (o estado em que o roteiro de aceite a deixou).
//   node scripts/verificar-instalador.mjs        (precisa de `npm run dist`)
import { _electron as electron } from 'playwright-core';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const instalador = resolve('release', 'Sticky-Claude-Instalador-0.1.0.exe');
const pasta = join(process.env.LOCALAPPDATA, 'Programs', 'Sticky Claude');
const exe = join(pasta, 'Sticky Claude.exe');
const desinstalador = join(pasta, 'Uninstall Sticky Claude.exe');
const atalho = join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Sticky Claude.lnk');
const dadosReais = join(process.env.APPDATA, 'StickyClaude');
const NOME_RUN = 'com.samuc.stickyclaude';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, x = '') => { console.log(`${c ? '[ OK ]' : '[FALHA]'} ${n}${x ? ` (${x})` : ''}`); if (!c) falhas++; };

const reg = (args) => spawnSync('reg', args, { encoding: 'utf8' });
const lerRun = () => { const r = reg(['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', NOME_RUN]); return r.status === 0 ? /REG_SZ\s+(.*)/.exec(r.stdout)?.[1]?.trim() : undefined; };
const outrasEntradas = () => reg(['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run']).stdout.split(/\r?\n/).filter((l) => /REG_/.test(l) && !l.includes(NOME_RUN)).map((l) => l.trim()).sort().join('\n');
const chavesDesinstalacao = () => {
  const out = execSync('powershell -NoProfile -Command "Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -match \'Sticky\' } | ForEach-Object { $_.DisplayName }"', { encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean).length;
};
const arquivosDosDados = () => (existsSync(dadosReais) ? readdirSync(dadosReais).sort().join(',') : '');
const rodar = (arquivo, args) => spawnSync(arquivo, args, { encoding: 'utf8' });
const instalar = () => { const r = rodar(instalador, ['/S', '/currentuser']); return r.status; };
const matarApp = () => { try { execSync('powershell -NoProfile -Command "Get-Process | Where-Object { $_.Path -like \'*Programs\\Sticky Claude*\' } | Stop-Process -Force"', { stdio: 'ignore' }); } catch {} };

/** Liga a inicialização pelo interruptor do app instalado (dados isolados: não mexe nos seus dados reais). */
async function ligarPeloApp() {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-ligar-'));
  const env = { ...process.env, STICKY_DATA_DIR: dados, STICKY_PILULA: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  // sem briefing real nem Claude: cache fresco e completo
  const agora = new Date().toISOString();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dados, 'briefing.json'), JSON.stringify({ versao: 1, geradoEm: agora, agenda: { status: 'ok', atualizadoEm: agora, dados: { eventos: [] } }, emails: { status: 'ok', atualizadoEm: agora, dados: { itens: [], suspeitos: [] } }, foco: { status: 'ok', atualizadoEm: agora, dados: { prioridades: [] } } }));
  const app = await electron.launch({ executablePath: exe, args: [], env, timeout: 90_000 });
  try {
    let p;
    for (let i = 0; i < 300 && !p; i++) { p = app.windows().find((w) => w.url().includes('panel.html')); await espera(150); }
    const sw = p.getByRole('switch', { name: 'Iniciar com o Windows' });
    await sw.waitFor();
    if (await sw.isChecked()) return;
    await sw.click();
    await p.getByRole('button', { name: 'Ativar' }).click();
    await p.waitForFunction(() => document.querySelector('[role=switch]')?.checked === true, null, { timeout: 15_000 });
  } finally { await app.close().catch(() => {}); rmSync(dados, { recursive: true, force: true }); }
}

if (!existsSync(instalador)) { console.error('Rode "npm run dist" antes.'); process.exit(2); }
matarApp();
await espera(1500);
const outrasAntes = outrasEntradas();
const dadosAntes = arquivosDosDados();
// Atenção: ao atualizar por cima, quem roda é o desinstalador da versão que JÁ ESTÁ instalada. Se ela for de antes do conserto
// (build/installer.nsh), a primeira atualização ainda apaga a entrada; a partir daí o teste abaixo passa.
console.log('--- 1) atualizar por cima (a versão nova instalada sobre a antiga) ---');
if (!existsSync(exe)) ok('instalação de partida', instalar() === 0);
await ligarPeloApp();
await espera(500);
const antes = lerRun();
ok('inicialização automática ligada antes de atualizar', !!antes, antes);
ok('instalador (atualização) terminou sem erro', instalar() === 0);
await espera(2500);
ok('depois de ATUALIZAR, a entrada de inicialização CONTINUA no registro', lerRun() === antes, lerRun() ?? 'sumiu');
ok('há uma única entrada de desinstalação (sem duplicar)', chavesDesinstalacao() === 1);
ok('o executável instalado e o desinstalador existem', existsSync(exe) && existsSync(desinstalador));
ok('as outras entradas de inicialização seguem intactas', outrasEntradas() === outrasAntes);

console.log('--- 2) desinstalar de verdade ---');
const unins = rodar(desinstalador, ['/currentuser', '/S']);
// o desinstalador apaga os arquivos primeiro e o resto (atalho, registro) logo depois: espera tudo terminar
const aguardar = async (cond, ms = 20_000) => { const fim = Date.now() + ms; while (!cond() && Date.now() < fim) await espera(300); return cond(); };
await aguardar(() => !existsSync(pasta) && !existsSync(atalho) && chavesDesinstalacao() === 0);
ok('o desinstalador terminou', unins.status === 0 || unins.status === null, `código ${unins.status}`);
ok('a pasta de instalação foi removida', !existsSync(pasta));
ok('a entrada de inicialização foi REMOVIDA pelo desinstalador', lerRun() === undefined);
ok('o atalho do Menu Iniciar foi removido', !existsSync(atalho));
ok('o registro de desinstalação foi removido', chavesDesinstalacao() === 0);
ok('as outras entradas de inicialização seguem intactas', outrasEntradas() === outrasAntes);
ok('os SEUS DADOS em %APPDATA%\\StickyClaude seguem intactos', arquivosDosDados() === dadosAntes, arquivosDosDados());

console.log('--- 3) reinstalar e deixar como estava ---');
ok('reinstalação terminou sem erro', instalar() === 0);
await espera(2000);
ok('app reinstalado (arquivos, atalho e registro de desinstalação)', existsSync(exe) && chavesDesinstalacao() === 1 && existsSync(atalho));
await ligarPeloApp();
await espera(500);
ok('inicialização automática ligada de novo (estado final)', !!lerRun(), lerRun());
ok('as outras entradas de inicialização seguem intactas', outrasEntradas() === outrasAntes);
ok('os dados reais seguem intactos', arquivosDosDados() === dadosAntes);
console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas);
