import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import { randomUUID } from 'node:crypto';
import { release, uptime } from 'node:os';
import { join } from 'node:path';
import { briefingVazio } from '@shared/briefing';
import { DIAS_PARADA_PADRAO } from '@shared/metas';
import { criarExecutor } from './briefing/executor';
import { executorFalso } from './briefing/falso';
import { deveRodarNoInicio } from './briefing/schedule';
import { BriefingService, briefingDoCache, type Gatilho } from './briefing/service';
import { lerConfig } from './config';
import { prepararCapturas } from './dev-capturas';
import { criarLogger, type Logger } from './log';
import { registrarIpcMetas } from './metas/ipc';
import { Propostas } from './metas/propostas';
import { MetasStore } from './metas/store';
import { aguardarRede, temRede } from './network';
import { caminhos, garantirPastas } from './paths';
import { gravarJsonAtomico, lerJson } from './storage';

const ATALHO = 'Control+Alt+B';
const autostart = process.argv.includes('--autostart');

let painel: BrowserWindow | null = null;
let bandeja: Tray | null = null;
let saindo = false;
let logApp: Logger | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  iniciar();
}

function iniciar(): void {
  app.setAppUserModelId('com.samuc.stickyclaude');
  // STICKY_THEME só existe para testar os dois temas em desenvolvimento; no app empacotado segue sempre o Windows.
  const tema = process.env.STICKY_THEME;
  nativeTheme.themeSource = !app.isPackaged && (tema === 'light' || tema === 'dark') ? tema : 'system';

  app.on('second-instance', () => { logApp?.info('segunda instância: mostrando o painel'); mostrarPainel(); });
  app.on('before-quit', () => { saindo = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
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
  log.info('app iniciado', {
    versao: app.getVersion(), autostart, windows: release(), segundosDesdeBoot: Math.round(uptime()),
    empacotado: app.isPackaged,
  });

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
      executar: process.env.STICKY_FAKE_CLAUDE === '1' && !app.isPackaged ? executorFalso() : criarExecutor(log),
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

  criarPainel();
  criarBandeja(() => atualizar('manual'));
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
  painel.on('show', () => logApp?.info('painel visível'));
  painel.on('hide', () => logApp?.info('painel oculto'));
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

function alternarTudo(): void {
  if (painel && !painel.isDestroyed() && painel.isVisible()) painel.hide();
  else mostrarPainel();
}

function criarBandeja(atualizar: () => void): void {
  bandeja = new Tray(imagem('tray.png'));
  bandeja.setToolTip('Sticky Claude');
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar painel', click: mostrarPainel },
    { label: 'Atualizar briefing', click: atualizar },
    { type: 'separator' },
    { label: `Mostrar/ocultar tudo (${ATALHO.replace('Control', 'Ctrl')})`, click: alternarTudo },
    { type: 'separator' },
    { label: 'Sair', click: () => { saindo = true; app.quit(); } },
  ]));
  bandeja.on('click', alternarTudo);
}
