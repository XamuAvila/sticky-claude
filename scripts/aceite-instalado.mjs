// Roteiro de aceite no app INSTALADO, com os dados REAIS (%APPDATA%\StickyClaude) e o Claude de verdade.
//   node scripts/aceite-instalado.mjs antes    parte 1: briefing real, inicialização automática (liga, confere, desliga, liga),
//                                              "X só oculta" e retomada da mesma sessão num post-it de teste; deixa tudo pronto
//                                              para o reinício do Windows
//   node scripts/aceite-instalado.mjs depois   parte 2 (depois de reiniciar): confere que o app abriu SOZINHO no login e que o
//                                              post-it retoma a mesma conversa, na mesma posição
//   node scripts/aceite-instalado.mjs depois --sem-reinicio   o mesmo, mas em vez de esperar o Windows, executa o comando
//                                              exato da entrada do registro (simula o login; NÃO prova um reinício de verdade)
//   node scripts/aceite-instalado.mjs limpar   apaga o post-it de teste (e a sessão dele); NÃO mexe na inicialização automática
// Usa um post-it separado ("Teste de aceite") para não encher o seu post-it "Metas" com mensagens de teste.
import { _electron as electron } from 'playwright-core';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const modo = process.argv[2];
const exe = join(process.env.LOCALAPPDATA, 'Programs', 'Sticky Claude', 'Sticky Claude.exe');
const dados = join(process.env.APPDATA, 'StickyClaude');
const NOME_RUN = 'com.samuc.stickyclaude';
const NOME_TESTE = 'Teste de aceite';
const estadoArq = join(process.env.TEMP, 'sticky-aceite-estado.json');
const fotos = join(process.env.TEMP, 'sticky-aceite');
mkdirSync(fotos, { recursive: true });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? '[ OK ]' : '[FALHA]'} ${nome}${extra ? ` (${extra})` : ''}`); if (!cond) falhas++; };

// ---- registro (SOMENTE LEITURA daqui; quem liga e desliga é o interruptor do app) ----
function lerRun() {
  try {
    const out = execSync(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v ${NOME_RUN}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /REG_SZ\s+(.*)/.exec(out)?.[1]?.trim();
  } catch { return undefined; }
}
function lerAprovado() {
  try {
    const out = execSync(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v ${NOME_RUN}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const hex = /REG_BINARY\s+([0-9A-Fa-f]+)/.exec(out)?.[1];
    return hex ? (hex.slice(0, 2) === '02' || hex.slice(0, 2) === '06' ? 'habilitada' : 'desabilitada') : undefined;
  } catch { return undefined; }
}
const outrasEntradas = () => { try { return execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', { encoding: 'utf8' }).split(/\r?\n/).filter((l) => /REG_/.test(l) && !l.includes(NOME_RUN)).map((l) => l.trim()).sort().join('\n'); } catch { return ''; } };

const lerPostits = () => JSON.parse(readFileSync(join(dados, 'postits.json'), 'utf8')).postits;
const logApp = () => (existsSync(join(dados, 'logs', 'app.log')) ? readFileSync(join(dados, 'logs', 'app.log'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
const arquivoSessao = (sessionId) => join(homedir(), '.claude', 'projects', 'C--Users-USUARIO-AppData-Roaming-StickyClaude-workspace', `${sessionId}.jsonl`);

async function abrir() {
  const app = await electron.launch({ executablePath: exe, args: [], env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE' && k !== 'STICKY_DATA_DIR')), timeout: 90_000 });
  const achar = async (parte, nomePostit) => {
    for (let i = 0; i < 400; i++) {
      const id = nomePostit ? lerPostits().find((p) => p.nome === nomePostit)?.id : undefined;
      const w = app.windows().find((x) => x.url().includes(parte) && (!nomePostit || (id && x.url().includes(`id=${id}`))));
      if (w) return w;
      await espera(200);
    }
    throw new Error(`janela ${parte} ${nomePostit ?? ''} não apareceu`);
  };
  return { app, achar };
}
const enviar = async (p, t) => { await p.getByLabel('Mensagem para o Claude').fill(t); await p.keyboard.press('Enter'); await p.locator('.msg.escrevendo').waitFor({ timeout: 30_000 }); await p.locator('.msg.escrevendo').waitFor({ state: 'detached', timeout: 120_000 }); };
const ultimaResposta = async (p) => (await p.locator('.msg.claude').last().innerText()).trim();
const janelaNativa = (app, titulo) => app.evaluate(({ BrowserWindow }, t) => { const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === t); return w ? { visivel: w.isVisible(), bounds: w.getBounds() } : null; }, titulo);

// =========================================================================================================
if (modo === 'antes') {
  if (!existsSync(exe)) { console.error('App instalado não encontrado:', exe); process.exit(2); }
  const outrasAntes = outrasEntradas();
  ok('ainda NÃO existe entrada do Sticky Claude no Run (ponto de partida)', lerRun() === undefined);

  const { app, achar } = await abrir();
  try {
    const painel = await achar('panel.html');
    await painel.waitForSelector('[data-testid=nova-meta]', { timeout: 30_000 });
    const info = await app.evaluate(({ app: a }) => ({ pkg: a.isPackaged, exe: process.execPath, v: a.getVersion() }));
    ok('rodando o app INSTALADO (empacotado)', info.pkg && info.exe.toLowerCase() === exe.toLowerCase(), `v${info.v}`);

    // ---- briefing real (aceite 2) ----
    console.log('… aguardando o briefing real do início (até 4 min)');
    const t0 = Date.now();
    await painel.waitForFunction(() => { const b = [...document.querySelectorAll('button.primario')].find((x) => /Atualiz/.test(x.textContent ?? '')); return b && !b.disabled && /Atualizar$/.test((b.textContent ?? '').trim()); }, null, { timeout: 240_000 });
    const secoes = await painel.evaluate(() => [...document.querySelectorAll('section.cartao')].map((s) => ({ secao: s.getAttribute('aria-label'), erro: !!s.querySelector('.aviso-erro, .chip.erro'), itens: s.querySelectorAll('.evento, .email, .foco li, .meta').length })));
    console.log(`  terminou em ${((Date.now() - t0) / 1000).toFixed(0)} s:`, JSON.stringify(secoes.filter((s) => ['Hoje', 'E-mails que pedem ação', 'Foco sugerido'].includes(s.secao))));
    for (const n of ['Hoje', 'E-mails que pedem ação', 'Foco sugerido']) { const s = secoes.find((x) => x.secao === n); ok(`briefing real: "${n}" sem erro`, !!s && !s.erro, `${s?.itens ?? 0} itens`); }
    await painel.screenshot({ path: join(fotos, 'painel-briefing-real.png') });

    // ---- inicialização automática (aceite 5: ligar e desligar de verdade) ----
    const sw = painel.getByRole('switch', { name: 'Iniciar com o Windows' });
    await sw.waitFor();
    ok('interruptor habilitado e desligado', !(await sw.isDisabled()) && !(await sw.isChecked()));
    await sw.click();
    await painel.getByRole('heading', { name: 'Iniciar com o Windows?' }).waitFor();
    ok('o diálogo de confirmação apareceu e NADA foi criado antes do "Ativar"', lerRun() === undefined);
    await painel.getByRole('button', { name: 'Ativar' }).click();
    await painel.waitForFunction(() => document.querySelector('[role=switch]')?.checked === true, null, { timeout: 15_000 });
    await espera(500);
    const valor = lerRun();
    console.log(`  Run\\${NOME_RUN} = ${valor}`);
    ok('entrada criada em HKCU\\...\\Run (só o seu usuário)', !!valor);
    ok('a entrada aponta para o app instalado com --autostart', !!valor && valor.toLowerCase().includes(exe.toLowerCase()) && valor.includes('--autostart'));
    ok('o Windows a considera habilitada (Gerenciador de Tarefas > Inicialização)', lerAprovado() !== 'desabilitada', lerAprovado() ?? 'sem registro (padrão: habilitada)');
    ok('as outras entradas de inicialização (Opera, Docker, Steam, Edge) ficaram intactas', outrasEntradas() === outrasAntes);

    await sw.click(); // desligar
    await painel.waitForFunction(() => document.querySelector('[role=switch]')?.checked === false, null, { timeout: 15_000 });
    await espera(500);
    ok('desligar REMOVE a entrada de verdade (reg query não acha mais)', lerRun() === undefined);
    ok('outras entradas continuam intactas depois de desligar', outrasEntradas() === outrasAntes);

    await sw.click(); // ligar de novo: não deve perguntar outra vez
    await painel.waitForFunction(() => document.querySelector('[role=switch]')?.checked === true, null, { timeout: 15_000 });
    await espera(500);
    ok('religar não pergunta de novo e recria a entrada', (await painel.getByRole('heading', { name: 'Iniciar com o Windows?' }).count()) === 0 && !!lerRun());

    // ---- post-it de teste: sessão própria, "X só oculta", mesma sessão (aceite 3 e 4) ----
    await painel.getByTestId('novo-postit').click();
    for (let i = 0; i < 100 && !lerPostits().some((p) => p.nome !== 'Metas' && p.nome !== NOME_TESTE); i++) await espera(100);
    const novo = lerPostits().find((p) => p.nome !== 'Metas' && p.nome !== NOME_TESTE);
    let p = await achar('postit.html', novo.nome);
    await p.locator('button.titulo').click();
    await p.getByLabel('Nome do post-it').fill(NOME_TESTE);
    await p.keyboard.press('Enter');
    for (let i = 0; i < 50 && !lerPostits().some((x) => x.nome === NOME_TESTE); i++) await espera(100);
    const teste = lerPostits().find((x) => x.nome === NOME_TESTE);
    ok(`post-it "${NOME_TESTE}" criado com sessão própria`, !!teste && /^[0-9a-f-]{36}$/.test(teste.sessionId));
    p = await achar('postit.html', NOME_TESTE);

    // posição conhecida (para conferir depois do reinício)
    await espera(700);
    await app.evaluate(({ BrowserWindow }, t) => { const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === t); w.setBounds({ x: 260, y: 180, width: 360, height: 420 }); w.emit('moved'); }, NOME_TESTE);
    await espera(900);
    const boundsSalvos = lerPostits().find((x) => x.nome === NOME_TESTE).bounds;

    const palavra = `abacate-${Math.floor(Math.random() * 9000 + 1000)}`;
    await enviar(p, `Guarde esta palavra-teste: ${palavra}. Responda somente "guardado".`);
    ok('o Claude real respondeu no post-it', (await ultimaResposta(p)).length > 0 && (await p.locator('.msg.aviso').count()) === 0, `"${await ultimaResposta(p)}"`);
    const s1 = lerPostits().find((x) => x.nome === NOME_TESTE);
    ok('a sessão foi criada e marcada como iniciada', s1.iniciada === true);
    ok('o histórico da sessão existe no Claude Code', existsSync(arquivoSessao(s1.sessionId)));

    await p.locator('button[title^="Ocultar"]').click(); // o X
    await espera(1200);
    const apos = lerPostits().find((x) => x.nome === NOME_TESTE);
    ok('o X só ocultou: post-it oculto, mesma sessão, ainda iniciada', apos.oculto === true && apos.sessionId === s1.sessionId && apos.iniciada === true);
    ok('o app seguiu vivo (bandeja) e a janela está oculta', (await janelaNativa(app, NOME_TESTE))?.visivel === false);
    ok('o histórico da sessão no Claude continua lá depois do X', existsSync(arquivoSessao(s1.sessionId)));

    const linha = painel.locator('.lista-postits li', { hasText: NOME_TESTE });
    await linha.getByTestId('alternar-postit').click(); // volta pelo painel
    p = await achar('postit.html', NOME_TESTE);
    await espera(800);
    await enviar(p, 'Qual era a palavra-teste que pedi para guardar? Responda somente a palavra.');
    const resp = await ultimaResposta(p);
    ok('depois de ocultar e mostrar, a MESMA conversa continua (o Claude lembrou a palavra)', resp.includes(palavra), `"${resp}" | esperada ${palavra}`);
    ok('a sessão continua a mesma', lerPostits().find((x) => x.nome === NOME_TESTE).sessionId === s1.sessionId);
    await p.screenshot({ path: join(fotos, 'postit-teste.png') });

    writeFileSync(estadoArq, JSON.stringify({ palavra, sessionId: s1.sessionId, postitId: s1.id, bounds: boundsSalvos, criadoEm: new Date().toISOString() }, null, 2));
    console.log(`  estado para a parte 2 salvo em ${estadoArq}`);
    ok('inicialização automática DEIXADA LIGADA para o teste de reinício', !!lerRun());
  } finally {
    await app.close().catch(() => undefined);
  }
  console.log(falhas === 0 ? '\nParte 1 concluída: tudo certo.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas);
}

// =========================================================================================================
if (modo === 'depois') {
  if (!existsSync(estadoArq)) { console.error('Sem estado da parte 1:', estadoArq); process.exit(2); }
  const est = JSON.parse(readFileSync(estadoArq, 'utf8'));
  // --sem-reinicio: em vez de esperar o Windows abrir o app, executa o COMANDO EXATO da entrada do registro, como o Explorer
  // faz no login. Prova o caminho de inicialização pelo login, mas NÃO é um reinício de verdade.
  const simulado = process.argv.includes('--sem-reinicio');
  const ent = lerRun();
  ok(`a entrada de inicialização continua no registro${simulado ? '' : ' depois do reinício'}`, !!ent, ent);

  if (simulado) {
    try { execSync('powershell -NoProfile -Command "Get-Process | Where-Object { $_.Path -like \'*Programs\\Sticky Claude*\' } | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
    await espera(2000);
    const m = /^"([^"]+)"\s*(.*)$/.exec(ent ?? '');
    ok('o comando da entrada é interpretável (programa + argumentos)', !!m, m ? `args: ${m[2]}` : '');
    const antes = logApp().length;
    const { spawn } = await import('node:child_process');
    spawn(m[1], m[2].split(' ').filter(Boolean), { detached: true, stdio: 'ignore' }).unref(); // igual ao Explorer no login
    console.log('… app aberto como o Windows o abriria no login; aguardando a inicialização');
    for (let i = 0; i < 400 && !logApp().slice(antes).some((l) => l.msg === 'interface pronta'); i++) await espera(300);
    // espera o briefing do login terminar (ou o aviso de cache fresco)
    for (let i = 0; i < 600; i++) {
      const novos = logApp().slice(antes);
      if (novos.some((l) => l.msg === 'cache fresco: briefing não executado no início')) break;
      if (['agenda', 'emails', 'foco'].every((f) => novos.some((l) => l.msg === 'execução do claude' && l.fonte === f))) break;
      await espera(500);
    }
  }

  // o app deve ter aberto SOZINHO no login (processo iniciado com --autostart)
  const logs = logApp();
  const inicios = logs.filter((l) => l.msg === 'app iniciado');
  const ultimo = inicios.at(-1);
  console.log(`  último início registrado: ${ultimo?.t} | autostart=${ultimo?.autostart} | segundosDesdeBoot=${ultimo?.segundosDesdeBoot} | empacotado=${ultimo?.empacotado}`);
  ok('o último início foi pelo login (--autostart)', ultimo?.autostart === true);
  if (simulado) console.log('  [ -- ] "logo depois de ligar o PC": não se aplica à simulação (o PC não foi reiniciado)');
  else ok('foi logo depois de ligar o PC (menos de 15 min de boot)', typeof ultimo?.segundosDesdeBoot === 'number' && ultimo.segundosDesdeBoot < 900, `${ultimo?.segundosDesdeBoot} s`);
  const depoisDoInicio = logs.slice(logs.lastIndexOf(ultimo));
  const cacheFresco = depoisDoInicio.some((l) => l.msg === 'cache fresco: briefing não executado no início');
  const rede = depoisDoInicio.find((l) => l.msg === 'rede');
  if (cacheFresco) console.log('  [ -- ] cache do briefing ainda fresco (<20 min): o início só mostrou o cache, sem chamar o Claude (é o comportamento desenhado)');
  else {
    console.log(`  rede: modo=${rede?.modo} resultado=${rede?.resultado} esperou=${rede?.esperouSegundos}s`);
    ok('esperou a rede e ela subiu', rede?.modo === 'inicio' && rede?.resultado === 'ok');
    ok('o briefing rodou no início (gatilho "inicio")', depoisDoInicio.some((l) => l.msg === 'briefing solicitado' && l.gatilho === 'inicio'));
  }
  ok('os post-its foram carregados e a interface ficou pronta', depoisDoInicio.some((l) => l.msg === 'post-its carregados') && depoisDoInicio.some((l) => l.msg === 'interface pronta'));
  const execs = depoisDoInicio.filter((l) => l.msg === 'execução do claude' && l.fonte !== 'postit');
  if (!cacheFresco) {
    console.log(`  execuções do briefing no login: ${execs.map((e) => `${e.fonte}:${e.ok ? 'ok' : 'erro:' + e.tipoErro}`).join(', ')}`);
    ok('agenda, e-mails e foco concluíram no login', ['agenda', 'emails', 'foco'].every((f) => execs.some((e) => e.fonte === f && e.ok)));
  }

  // o processo que o Windows abriu está de pé? (não vamos dirigi-lo: encerramos e abrimos de novo sob o Playwright)
  const vivo = (() => { try { return execSync('powershell -NoProfile -Command "(Get-Process | Where-Object { $_.Path -like \'*Programs\\Sticky Claude*\' } | Measure-Object).Count"', { encoding: 'utf8' }).trim(); } catch { return '0'; } })();
  ok('o Sticky Claude está rodando (aberto pelo Windows)', Number(vivo) > 0, `${vivo} processos`);
  const titulos = (() => { try { return execSync('powershell -NoProfile -Command "(Get-Process | Where-Object { $_.Path -like \'*Programs\\Sticky Claude*\' -and $_.MainWindowTitle } | ForEach-Object { $_.MainWindowTitle }) -join \' | \'"', { encoding: 'utf8' }).trim(); } catch { return ''; } })();
  console.log(`  janelas com título: ${titulos || '(nenhuma visível agora)'}`);

  // encerra a instância do login e reabre sob o Playwright, com os MESMOS dados
  try { execSync('powershell -NoProfile -Command "Get-Process | Where-Object { $_.Path -like \'*Programs\\Sticky Claude*\' } | Stop-Process -Force"', { stdio: 'ignore' }); } catch {}
  await espera(2500);
  const { app, achar } = await abrir();
  try {
    const p = await achar('postit.html', NOME_TESTE);
    await p.waitForSelector('.postit');
    await espera(1500);
    const j = await janelaNativa(app, NOME_TESTE);
    console.log(`  posição salva antes do reinício: ${JSON.stringify(est.bounds)} | agora: ${JSON.stringify(j?.bounds)}`);
    ok('o post-it reabriu na mesma posição e no mesmo tamanho (e visível)', !!j && j.visivel && JSON.stringify(j.bounds) === JSON.stringify(est.bounds));
    ok('a conversa anterior está na tela', (await p.locator('.msg.usuario').count()) >= 2 && (await p.locator('.msg.usuario', { hasText: est.palavra }).count()) >= 1);
    const sess = lerPostits().find((x) => x.nome === NOME_TESTE);
    const apos = simulado ? 'depois de reabrir o app (SEM reiniciar o Windows)' : 'depois do reinício do Windows';
    ok(`é a mesma sessão (mesmo session id) ${apos}`, sess.sessionId === est.sessionId && sess.iniciada === true);
    ok('o histórico da sessão continua no Claude Code', existsSync(arquivoSessao(est.sessionId)));
    await enviar(p, 'Depois de reabrir o app: qual era a palavra-teste? Responda somente a palavra.');
    const resp = await ultimaResposta(p);
    ok(`o Claude retomou a MESMA conversa ${apos} (lembrou a palavra)`, resp.includes(est.palavra), `"${resp}" | esperada ${est.palavra}`);
    await p.screenshot({ path: join(fotos, 'postit-depois-do-reinicio.png') });
  } finally {
    await app.close().catch(() => undefined);
  }
  console.log(falhas === 0 ? '\nParte 2 concluída: tudo certo.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas);
}

// =========================================================================================================
if (modo === 'limpar') {
  const est = existsSync(estadoArq) ? JSON.parse(readFileSync(estadoArq, 'utf8')) : null;
  const sessionId = est?.sessionId ?? lerPostits().find((p) => p.nome === NOME_TESTE)?.sessionId;
  const { app, achar } = await abrir();
  try {
    const painel = await achar('panel.html');
    await painel.waitForSelector('[data-testid=nova-meta]', { timeout: 30_000 });
    if (!lerPostits().some((p) => p.nome === NOME_TESTE)) console.log('(post-it de teste já não existe)');
    else {
      const linha = painel.locator('.lista-postits li', { hasText: NOME_TESTE });
      if ((await linha.locator('button', { hasText: 'Mostrar' }).count()) > 0) await linha.getByTestId('alternar-postit').click();
      const p = await achar('postit.html', NOME_TESTE);
      await p.locator('button[title="Opções do post-it"]').click();
      await p.getByRole('menuitem', { name: 'Excluir post-it' }).click();
      await p.getByRole('menuitem', { name: /Confirmar: apagar/ }).click();
      for (let i = 0; i < 50 && lerPostits().some((x) => x.nome === NOME_TESTE); i++) await espera(100);
    }
    ok('post-it de teste excluído do estado', !lerPostits().some((x) => x.nome === NOME_TESTE));
    ok('"Metas" continua lá, intacto', lerPostits().some((x) => x.nome === 'Metas'));
  } finally {
    await app.close().catch(() => undefined);
  }
  // a sessão de teste fica no histórico do Claude Code: apago só o arquivo dela
  if (sessionId && existsSync(arquivoSessao(sessionId))) { unlinkSync(arquivoSessao(sessionId)); console.log('  sessão de teste apagada do histórico do Claude'); }
  ok('sessão de teste fora do histórico do Claude', !sessionId || !existsSync(arquivoSessao(sessionId)));
  if (existsSync(estadoArq)) rmSync(estadoArq);
  console.log(`  inicialização automática segue ${lerRun() ? 'LIGADA' : 'desligada'} (não mexi)`);
  process.exit(falhas);
}

console.error('Uso: node scripts/aceite-instalado.mjs antes | depois | limpar');
process.exit(2);
