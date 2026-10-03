import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { release, uptime } from 'node:os';
import { join } from 'node:path';
import { briefingVazio } from '@shared/briefing';
import { criarExecutor } from './briefing/executor';
import { executorFalso } from './briefing/falso';
import { deveRodarNoInicio } from './briefing/schedule';
import { BriefingService, briefingDoCache, type Gatilho } from './briefing/service';
import { criarLogger, type Logger } from './log';
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

function aoFicarPronto(): void {
  garantirPastas();
  const log = criarLogger(caminhos.logs());
  logApp = log;
  log.info('app iniciado', {
    versao: app.getVersion(), autostart, windows: release(), segundosDesdeBoot: Math.round(uptime()),
    empacotado: app.isPackaged,
  });

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
    },
    cache ?? briefingVazio(),
  );

  const atualizar = (g: Gatilho) => { log.info('briefing solicitado', { gatilho: g }); void servico.atualizar(g); };

  ipcMain.handle('briefing:obter', () => servico.snapshot());
  ipcMain.handle('briefing:atualizar', () => atualizar('manual'));
  servico.aoMudar((s) => {
    if (painel && !painel.isDestroyed()) painel.webContents.send('briefing:mudou', s);
  });

  criarPainel();
  criarBandeja(() => atualizar('manual'));
  const atalhoOk = globalShortcut.register(ATALHO, () => { log.info('atalho global acionado'); alternarTudo(); });
  if (!atalhoOk) log.warn('atalho global indisponível', { atalho: ATALHO });
  log.info('interface pronta', { bandeja: !!bandeja && !bandeja.isDestroyed(), atalhoRegistrado: atalhoOk && globalShortcut.isRegistered(ATALHO) });

  // Briefing automático: só no início do app (login), e só se o cache não estiver fresco. Nunca em loop.
  const inicial = servico.snapshot().briefing;
  if (deveRodarNoInicio(inicial, new Date())) atualizar('inicio');
  else log.info('cache fresco: briefing não executado no início');

  prepararCapturas(servico);
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
  painel.on('show', () => logApp?.info('painel visível'));
  painel.on('hide', () => logApp?.info('painel oculto'));
  // Windows desligando/reiniciando/encerrando a sessão: não segurar o encerramento por causa do "X só oculta".
  painel.on('session-end', () => { saindo = true; });
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

/**
 * Verificação visual: com STICKY_SHOT_DIR definido, grava PNGs do painel (carregando e pronto).
 * STICKY_SHOT_QUIT=1 encerra o app depois da última captura. Não faz nada em uso normal.
 */
function prepararCapturas(servico: BriefingService): void {
  const dir = process.env.STICKY_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const log = criarLogger(caminhos.logs(), 'capturas.log');
  if (process.env.STICKY_SHOT_TRACE === '1' && painel) {
    // Diagnóstico de rolagem: registra cada evento de scroll, quem estava com foco e chamadas a scrollIntoView.
    painel.webContents.on('console-message', (...args: unknown[]) => {
      const e = args[0] as { message?: string };
      const msg = typeof args[2] === 'string' ? args[2] : e?.message;
      if (msg?.startsWith('TRACE ')) log.info(msg.slice(0, 110));
    });
    painel.webContents.on('did-finish-load', () => {
      void painel?.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('.app');
        for (const t of ['wheel', 'keydown', 'pointerdown']) window.addEventListener(t, (e) => console.log('TRACE entrada-do-usuario ' + t + (e.key ? ' ' + e.key : '')), true);
        el.addEventListener('scroll', () => console.log('TRACE scrollTop=' + Math.round(el.scrollTop) + ' foco=' + document.activeElement?.tagName + '.' + (document.activeElement?.className || '')));
        const o = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...a) { console.log('TRACE scrollIntoView ' + this.tagName + '.' + this.className); return o.apply(this, a); };
      })()`);
    });
  }
  const foto = async (nome: string, rolarPara?: 'meio' | 'fim') => {
    if (!painel || painel.isDestroyed()) return;
    try {
      if (rolarPara) {
        await painel.webContents.executeJavaScript(
          `(() => { const el = document.querySelector('.app'); el.scrollTo(0, ${rolarPara === 'fim' ? 'el.scrollHeight' : 'el.scrollHeight / 2 - el.clientHeight / 2'}); })()`,
        );
        await new Promise((r) => setTimeout(r, 250));
      }
      const img = await Promise.race([
        painel.webContents.capturePage(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('capturePage demorou mais de 8 s')), 8000)),
      ]);
      const png = img.toPNG();
      writeFileSync(join(dir, `${String(++n).padStart(2, '0')}-${nome}.png`), png);
      log.info('captura', { nome, bytes: png.length, visivel: painel.isVisible() });
    } catch (e) {
      log.erro('captura falhou', { nome, erro: String(e).slice(0, 100) });
    }
  };
  // A execução já começou (síncrono em aoFicarPronto) antes de nos inscrevermos: agenda a foto do "carregando".
  const comecouExecutando = servico.snapshot().executando;
  let tirouCarregando = comecouExecutando;
  if (comecouExecutando) setTimeout(() => void foto('carregando'), 4000);
  servico.aoMudar((s) => {
    if (!s.executando && tirouCarregando) {
      setTimeout(async () => {
        await foto('pronto');
        await foto('meio', 'meio');
        await foto('fim', 'fim');
        if (process.env.STICKY_SHOT_QUIT === '1') { saindo = true; app.quit(); }
      }, 900);
    }
  });
  if (!servico.snapshot().executando) {
    setTimeout(async () => {
      await foto('cache');
      if (process.env.STICKY_SHOT_REFRESH === '1') {
        // simula o clique em "Atualizar" com o cache na tela
        tirouCarregando = true;
        void servico.atualizar('manual');
        setTimeout(() => void foto('carregando'), 3000);
      } else if (process.env.STICKY_SHOT_QUIT === '1') {
        saindo = true;
        app.quit();
      }
    }, 2500);
  }
}
