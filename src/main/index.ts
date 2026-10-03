import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import { randomUUID } from 'node:crypto';
import { release, uptime } from 'node:os';
import { join } from 'node:path';
import { briefingVazio } from '@shared/briefing';
import { AutoInicio, MOTIVO_SO_EMPACOTADO, caminhoDeInicializacao, criarBackendElectron, criarBackendFalso } from './autoinicio';
import { registrarIpcAutoInicio } from './autoinicio-ipc';
import { gravarPreferencias, lerPreferencias } from './preferencias';
import { DIAS_PARADA_PADRAO } from '@shared/metas';
import { criarExecutor } from './briefing/executor';
import { executorFalso } from './briefing/falso';
import { deveRodarNoInicio } from './briefing/schedule';
import { BriefingService, briefingDoCache, type Gatilho } from './briefing/service';
import { lerConfig } from './config';
import { prepararCapturas } from './dev-capturas';
import { matarTodosOsFilhos } from './claude/runner';
import { criarLogger, type Logger } from './log';
import { registrarIpcMetas } from './metas/ipc';
import { Propostas } from './metas/propostas';
import { MetasStore } from './metas/store';
import { aguardarRede, temRede } from './network';
import { JanelaPilula } from './pilula/janela';
import { PilulaService } from './pilula/servico';
import { caminhos, dadosDir, garantirPastas } from './paths';
import { ConversaService } from './postits/conversa';
import { ConversasStore } from './postits/conversas';
import { criarExecutorConversa } from './postits/executor';
import { executorConversaFalso } from './postits/falso';
import { registrarIpcPostits } from './postits/ipc';
import { JanelasPostit } from './postits/janelas';
import { PostitsStore } from './postits/store';
import { gravarJsonAtomico, lerJson } from './storage';

const ATALHO = 'Control+Alt+B';
const autostart = process.argv.includes('--autostart');

// Com STICKY_DATA_DIR (testes e verificações), o Electron também usa uma pasta própria para cache e trava de instância
// única. Sem isso, uma execução de teste "colidiria" com o seu Sticky Claude de verdade, ou com a execução anterior.
if (process.env.STICKY_DATA_DIR) app.setPath('userData', join(process.env.STICKY_DATA_DIR, 'electron'));

let painel: BrowserWindow | null = null;
let bandeja: Tray | null = null;
let saindo = false;
let logApp: Logger | null = null;
let janelas: JanelasPostit | null = null;
let aoMudarListaTray: (() => void) | null = null;
let pilula: JanelaPilula | null = null;
let aoMudarPilulaTray: ((ativa: boolean) => void) | null = null;
/** O que o atalho global escondeu, para devolver exatamente igual (sem marcar nada como "oculto"). */
let escondidoPeloAtalho: { painel: boolean; postits: string[] } | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  iniciar();
}

function iniciar(): void {
  // É também o nome do valor que o Windows grava em HKCU\...\Run. STICKY_APP_USER_MODEL_ID só existe para testar a
  // inicialização automática com um nome de teste, sem tocar na entrada de verdade do usuário.
  app.setAppUserModelId(process.env.STICKY_APP_USER_MODEL_ID || 'com.samuc.stickyclaude');
  // STICKY_THEME só existe para testar os dois temas em desenvolvimento; no app empacotado segue sempre o Windows.
  const tema = process.env.STICKY_THEME;
  nativeTheme.themeSource = !app.isPackaged && (tema === 'light' || tema === 'dark') ? tema : 'system';

  app.on('second-instance', () => {
    logApp?.info('segunda instância: mostrando o painel e os post-its');
    mostrarPainel();
    janelas?.mostrarTemporariamente(janelas.idsNaoOcultos());
  });
  app.on('before-quit', () => { saindo = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    matarTodosOsFilhos(); // nenhum claude.exe fica órfão, gastando a assinatura depois que o app saiu
  });
  // Fica na bandeja: fechar janelas não encerra o app.
  app.on('window-all-closed', () => undefined);

  void app.whenReady().then(aoFicarPronto);
}

function enviarAoPainel(canal: string, valor: unknown): void {
  if (painel && !painel.isDestroyed()) painel.webContents.send(canal, valor);
}

function aoFicarPronto(): void {
  garantirPastas();
  const log = criarLogger(caminhos.logs());
  logApp = log;
  const falso = process.env.STICKY_FAKE_CLAUDE === '1' && !app.isPackaged;
  log.info('app iniciado', {
    versao: app.getVersion(), autostart, windows: release(), segundosDesdeBoot: Math.round(uptime()),
    empacotado: app.isPackaged, portatil: !!process.env.PORTABLE_EXECUTABLE_FILE,
  });

  // Inicialização com o Windows: só liga com a confirmação do usuário; desligar remove a entrada de verdade.
  const caminhoLogin = caminhoDeInicializacao(process.env, process.execPath);
  const usaEntradaFalsa = !app.isPackaged && process.env.STICKY_FAKE_AUTOINICIO === '1';
  const auto = new AutoInicio({
    backend: usaEntradaFalsa ? criarBackendFalso(join(dadosDir(), 'fake-autoinicio.json')) : app.isPackaged ? criarBackendElectron(app, caminhoLogin) : null,
    motivo: MOTIVO_SO_EMPACOTADO,
    caminho: caminhoLogin,
    jaConfirmou: () => lerPreferencias().autoInicioConfirmado === true,
    guardarConfirmacao: () => gravarPreferencias({ autoInicioConfirmado: true }),
    log,
  });
  registrarIpcAutoInicio(ipcMain, auto);

  // Metas locais + propostas do Claude (que só valem depois do "Aplicar" do usuário).
  const metas = new MetasStore({ arquivo: caminhos.metas(), backupsDir: caminhos.backups(), agora: () => new Date(), novoId: randomUUID, log });
  const propostas = new Propostas(metas, randomUUID, () => new Date());
  metas.observar();
  registrarIpcMetas({ ipc: ipcMain, store: metas, propostas, enviar: enviarAoPainel, aoChegarProposta: mostrarPainel, log });
  log.info('metas carregadas', { total: metas.snapshot().metas.length, aviso: !!metas.snapshot().aviso });

  const cache = lerJson(caminhos.briefing(), briefingDoCache);
  // Só desenvolvimento: simula a falta de internet (e encurta a espera de 2 min para 6 s) para ver os estados da tela.
  const simulaOffline = process.env.STICKY_FAKE_OFFLINE === '1' && !app.isPackaged;
  const checarRede = simulaOffline ? async () => false : temRede;
  const servico = new BriefingService(
    {
      executar: falso ? executorFalso() : criarExecutor(log),
      aguardarRede: async (modo, aoEsperar) => {
        const t0 = Date.now();
        const r = modo === 'inicio'
          ? await aguardarRede({ temRede: checarRede, dormir: (ms) => new Promise((res) => setTimeout(res, ms)), agora: Date.now, aoEsperar, ...(simulaOffline ? { limiteMs: 6000 } : {}) })
          : (await checarRede()) ? 'ok' : 'sem-internet';
        log.info('rede', { modo, resultado: r, esperouSegundos: Math.round((Date.now() - t0) / 1000) });
        return r;
      },
      agora: () => new Date(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      salvar: (b) => gravarJsonAtomico(caminhos.briefing(), b),
      log,
      metas: () => metas.snapshot().metas,
      diasParada: () => lerConfig().metasParadaDias ?? DIAS_PARADA_PADRAO,
    },
    cache ?? briefingVazio(),
  );

  const atualizar = (g: Gatilho) => { log.info('briefing solicitado', { gatilho: g }); void servico.atualizar(g); };

  ipcMain.handle('briefing:obter', () => servico.snapshot());
  ipcMain.handle('briefing:atualizar', () => atualizar('manual'));
  servico.aoMudar((s) => enviarAoPainel('briefing:mudou', s));

  // Post-its: cada um é uma sessão própria do Claude (session id guardado), com a conversa copiada localmente.
  const postits = new PostitsStore({ arquivo: join(dadosDir(), 'postits.json'), agora: () => new Date(), novoId: randomUUID, log });
  const conversas = new ConversasStore(join(dadosDir(), 'conversas'));
  const conversa = new ConversaService({
    postits, conversas, propostas, log, agora: () => new Date(),
    metas: () => metas.snapshot().metas,
    executar: falso ? executorConversaFalso(dadosDir()) : criarExecutorConversa(log),
    avisar: (id, e) => janelas?.enviar(id, 'postit:evento', e),
  });
  const aoMudarLista = () => {
    enviarAoPainel('postits:mudou', janelas?.resumos() ?? []);
    aoMudarListaTray?.();
  };
  janelas = new JanelasPostit({
    store: postits, conversa, log, icone: imagem('icon.png'), aoMudarLista,
    saindo: () => saindo, aoEncerrarSessao: () => { saindo = true; },
  });
  registrarIpcPostits({ ipc: ipcMain, store: postits, conversa, janelas, aoMudarLista, log });
  app.on('before-quit', () => postits.encerrar());

  // Pílula no topo da tela: próximo evento ou meta do dia, só com o que já está no computador (sem gastar assinatura).
  pilula = new JanelaPilula({ icone: imagem('icon.png'), log, aoAbrirPainel: mostrarPainel, aoMudarVisibilidade: () => aoMudarListaTray?.() });
  const pilulaPadrao = process.env.STICKY_PILULA !== '0';
  pilula.definirAtiva(lerPreferencias().pilulaAtiva ?? pilulaPadrao);
  const calculoPilula = new PilulaService({
    agenda: () => servico.snapshot().briefing.agenda.dados,
    metas: () => metas.snapshot().metas,
    diasParada: () => lerConfig().metasParadaDias ?? DIAS_PARADA_PADRAO,
    agora: () => new Date(),
    aoMudar: (c) => pilula?.definirConteudo(c),
  });
  servico.aoMudar(() => calculoPilula.recalcular());
  metas.aoMudar(() => calculoPilula.recalcular());
  app.on('before-quit', () => { calculoPilula.parar(); pilula?.destruir(); });
  const definirPilula = (ativa: boolean) => {
    pilula?.definirAtiva(ativa);
    gravarPreferencias({ pilulaAtiva: ativa });
    log.info(ativa ? 'pílula ligada' : 'pílula desligada');
    aoMudarListaTray?.();
    return { ativa };
  };
  ipcMain.handle('pilula:estado', () => ({ ativa: pilula?.estaAtiva() ?? false }));
  ipcMain.handle('pilula:definir', (_e, ativa: unknown) => definirPilula(ativa === true));
  aoMudarPilulaTray = definirPilula;

  criarPainel();
  criarBandeja(() => atualizar('manual'));
  janelas.abrirIniciais();
  calculoPilula.iniciar();
  // Primeira execução do app: já deixa o post-it "Metas" pronto (sem acesso a e-mail/agenda; dá para ligar no menu dele).
  if (postits.primeiraExecucao && postits.snapshot().postits.length === 0) {
    janelas.novo({
      nome: 'Metas',
      instrucoes: 'Ajude-me a manter minhas metas em dia: revise prazos e próximos passos de 15 minutos, aponte o que está parado e proponha ajustes.',
    });
  }
  log.info('post-its carregados', { total: postits.snapshot().postits.length, aviso: !!postits.aviso });

  const atalhoOk = globalShortcut.register(ATALHO, () => { log.info('atalho global acionado'); alternarTudo(); });
  if (!atalhoOk) log.warn('atalho global indisponível', { atalho: ATALHO });
  log.info('interface pronta', { bandeja: !!bandeja && !bandeja.isDestroyed(), atalhoRegistrado: atalhoOk && globalShortcut.isRegistered(ATALHO) });

  // Briefing automático: só no início do app (login), e só se o cache não estiver fresco. Nunca em loop.
  if (deveRodarNoInicio(servico.snapshot().briefing, new Date())) atualizar('inicio');
  else log.info('cache fresco: briefing não executado no início');

  prepararCapturas({ painel: () => painel, servico, metas, propostas, sair: () => { saindo = true; app.quit(); } });
}

function criarPainel(): void {
  const escuro = nativeTheme.shouldUseDarkColors;
  painel = new BrowserWindow({
    width: 500, height: 800, minWidth: 380, minHeight: 480,
    show: false, autoHideMenuBar: true, title: 'Sticky Claude',
    icon: imagem('icon.png'),
    backgroundColor: escuro ? '#17171a' : '#f4f3ee',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  painel.setMenu(null);
  painel.once('ready-to-show', () => painel?.show());
  // O X só oculta; o app continua na bandeja.
  painel.on('close', (e) => {
    if (!saindo) { e.preventDefault(); painel?.hide(); logApp?.info('painel ocultado (o X só oculta)'); }
  });
  // Windows desligando/reiniciando/encerrando a sessão: não segurar o encerramento por causa do "X só oculta".
  painel.on('session-end', () => { saindo = true; });
  painel.on('show', () => { logApp?.info('painel visível'); aoMudarListaTray?.(); });
  painel.on('hide', () => { logApp?.info('painel oculto'); aoMudarListaTray?.(); });
  painel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  painel.webContents.on('will-navigate', (e) => e.preventDefault());

  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) void painel.loadURL(`${url}/panel.html`);
  else void painel.loadFile(join(__dirname, '../renderer/panel.html'));
}

function imagem(nome: string) {
  return nativeImage.createFromPath(join(app.getAppPath(), 'resources', nome));
}

function mostrarPainel(): void {
  if (!painel || painel.isDestroyed()) return criarPainel();
  if (painel.isMinimized()) painel.restore();
  painel.show();
  painel.focus();
}

/** Ctrl+Alt+B: se algo estiver à vista, esconde tudo (painel e post-its); senão, devolve tudo como estava. */
function alternarTudo(): void {
  const painelVisivel = !!painel && !painel.isDestroyed() && painel.isVisible();
  // A pílula não entra na conta de "algo à vista": ela fica sempre ali, e o atalho serve para trazer as janelas de volta.
  if (painelVisivel || janelas?.alguemVisivel()) {
    escondidoPeloAtalho = { painel: painelVisivel, postits: janelas?.visiveis() ?? [] };
    if (painelVisivel) painel!.hide();
    janelas?.esconderTemporariamente(escondidoPeloAtalho.postits);
    pilula?.esconderPeloAtalho(); // "esconder tudo" inclui a pílula (a preferência dela não muda)
    return;
  }
  const e = escondidoPeloAtalho;
  escondidoPeloAtalho = null;
  if (!e || e.painel) mostrarPainel();
  janelas?.mostrarTemporariamente(e ? e.postits : (janelas?.idsNaoOcultos() ?? []));
  pilula?.mostrarPeloAtalho();
}

function criarBandeja(atualizar: () => void): void {
  bandeja = new Tray(imagem('tray.png'));
  bandeja.setToolTip('Sticky Claude');

  const montar = () => {
    if (!bandeja || bandeja.isDestroyed()) return;
    const lista = janelas?.resumos() ?? [];
    bandeja.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mostrar painel', click: mostrarPainel },
      { label: 'Atualizar briefing', click: atualizar },
      { type: 'separator' },
      { label: 'Novo post-it', click: () => { janelas?.novo(); } },
      ...lista.map((p) => ({
        label: p.nome, type: 'checkbox' as const, checked: p.visivel,
        click: () => janelas?.alternar(p.id),
      })),
      ...(lista.length ? [
        { label: 'Mostrar todos os post-its', click: () => janelas?.mostrarTodos() },
        { label: 'Ocultar todos os post-its', click: () => janelas?.ocultarTodos() },
      ] : []),
      { type: 'separator' },
      { label: 'Pílula no topo da tela', type: 'checkbox', checked: pilula?.estaAtiva() ?? false, click: (item) => aoMudarPilulaTray?.(item.checked) },
      { label: `Mostrar/ocultar tudo (${ATALHO.replace('Control', 'Ctrl')})`, click: alternarTudo },
      { type: 'separator' },
      { label: 'Sair', click: () => { saindo = true; app.quit(); } },
    ]));
  };
  aoMudarListaTray = montar;
  montar();
  bandeja.on('click', alternarTudo);
}
