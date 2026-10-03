import { BrowserWindow, ipcMain, screen, type NativeImage } from 'electron';
import { join } from 'node:path';
import type { ConteudoPilula } from '@shared/pilula';
import type { Logger } from '../log';

const LARGURA = 480;
const ALTURA = 280;
const MARGEM_TOPO = 6;

interface Opcoes {
  icone: NativeImage;
  log: Logger;
  /** Clique na pílula: abre o painel. */
  aoAbrirPainel: () => void;
  /** Mudou a visibilidade (para a bandeja refletir). */
  aoMudarVisibilidade: () => void;
}

/**
 * A pílula no topo da tela (estilo Dynamic Island). Uma janela transparente, sempre no topo, sem foco e sem item na barra de
 * tarefas, no centro superior da tela principal. Ela deixa o mouse passar (click-through) e só captura o ponteiro enquanto ele
 * está sobre a própria pílula, avisado pela tela (`pilula:interativa`).
 */
export class JanelaPilula {
  private win: BrowserWindow | null = null;
  private conteudo: ConteudoPilula | null = null;
  private ativa = true;
  /** Escondida pelo atalho global (Ctrl+Alt+B), sem mexer na preferência. */
  private escondidaPeloAtalho = false;

  constructor(private readonly o: Opcoes) {
    ipcMain.handle('pilula:obter', () => this.conteudo);
    ipcMain.handle('pilula:interativa', (_e, sobre: unknown) => {
      if (this.win && !this.win.isDestroyed()) this.win.setIgnoreMouseEvents(sobre !== true, { forward: true });
    });
    ipcMain.handle('pilula:abrir-painel', () => this.o.aoAbrirPainel());
    const reposicionar = () => this.reposicionar();
    screen.on('display-added', reposicionar);
    screen.on('display-removed', reposicionar);
    screen.on('display-metrics-changed', reposicionar);
  }

  private deveAparecer(): boolean {
    return this.ativa && this.conteudo !== null && !this.escondidaPeloAtalho;
  }

  visivel(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  estaAtiva(): boolean {
    return this.ativa;
  }

  definirAtiva(v: boolean): void {
    this.ativa = v;
    this.escondidaPeloAtalho = false;
    this.sincronizar();
  }

  definirConteudo(c: ConteudoPilula | null): void {
    this.conteudo = c;
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('pilula:conteudo', c);
    this.sincronizar();
  }

  esconderPeloAtalho(): void {
    this.escondidaPeloAtalho = true;
    this.sincronizar();
  }

  mostrarPeloAtalho(): void {
    this.escondidaPeloAtalho = false;
    this.sincronizar();
  }

  /** Cria, mostra ou esconde a janela conforme a preferência, o conteúdo e o atalho. */
  private sincronizar(): void {
    if (this.deveAparecer()) {
      const w = this.garantir();
      if (!w.isVisible()) w.showInactive(); // sem roubar o foco de quem está digitando
    } else if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide();
    }
  }

  private posicao() {
    const wa = screen.getPrimaryDisplay().workArea;
    return { x: Math.round(wa.x + (wa.width - LARGURA) / 2), y: wa.y + MARGEM_TOPO, width: LARGURA, height: ALTURA };
  }

  private reposicionar(): void {
    if (this.win && !this.win.isDestroyed()) this.win.setBounds(this.posicao());
  }

  private garantir(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      ...this.posicao(),
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false, icon: this.o.icone, title: 'Sticky Claude (pílula)',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.on('page-title-updated', (e) => e.preventDefault());
    win.on('show', () => { this.o.log.info('pílula visível'); this.o.aoMudarVisibilidade(); });
    win.on('hide', () => { this.o.log.info('pílula oculta'); this.o.aoMudarVisibilidade(); });
    win.on('closed', () => { this.win = null; });

    const url = process.env.ELECTRON_RENDERER_URL;
    if (url) void win.loadURL(`${url}/pilula.html`);
    else void win.loadFile(join(__dirname, '../renderer/pilula.html'));
    this.win = win;
    return win;
  }

  destruir(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
