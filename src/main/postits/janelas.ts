import { BrowserWindow, nativeTheme, screen, type Display, type NativeImage } from 'electron';
import { join } from 'node:path';
import type { Retorno } from '@shared/metas';
import { FUNDO_CLARO, FUNDO_ESCURO, TAMANHO_MINIMO, TAMANHO_PADRAO, type Postit, type ResumoPostit, type Retangulo } from '@shared/postits';
import type { Logger } from '../log';
import type { ConversaService } from './conversa';
import { posicaoInicial, restaurarBounds, telaDoRetangulo, telaSalvaDe, type Tela } from './geometria';
import type { PostitsStore } from './store';

interface Opcoes {
  store: PostitsStore;
  conversa: ConversaService;
  log: Logger;
  icone: NativeImage;
  /** O app está encerrando de verdade? (senão o X só oculta.) */
  saindo: () => boolean;
  /** O Windows está encerrando a sessão (desligar/reiniciar). */
  aoEncerrarSessao: () => void;
  /** Algo mudou na lista/visibilidade: refaz a bandeja e o painel. */
  aoMudarLista: () => void;
}

const telaDe = (d: Display, primariaId: number): Tela => ({
  id: d.id, bounds: { ...d.bounds }, workArea: { ...d.workArea }, scaleFactor: d.scaleFactor, primaria: d.id === primariaId,
});

/** As janelas dos post-its: sem moldura, redimensionáveis, e que NUNCA fecham (o X só oculta). */
export class JanelasPostit {
  private janelas = new Map<string, BrowserWindow>();
  /** Ignora os eventos de mover/redimensionar causados por nós mesmos (reajuste para as telas). */
  private ajustando = new Set<string>();
  private timerTelas: NodeJS.Timeout | undefined;

  constructor(private readonly o: Opcoes) {
    const reajustar = () => {
      clearTimeout(this.timerTelas);
      this.timerTelas = setTimeout(() => this.reajustarParaTelas(), 600);
    };
    screen.on('display-added', reajustar);
    screen.on('display-removed', reajustar);
    screen.on('display-metrics-changed', reajustar);
  }

  private telas(): Tela[] {
    const primaria = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => telaDe(d, primaria));
  }

  private fundo(p: Postit): string {
    return (nativeTheme.shouldUseDarkColors ? FUNDO_ESCURO : FUNDO_CLARO)[p.cor];
  }

  /** Cria a janela (sem mostrar) e restaura posição/tamanho/monitor salvos. */
  private criar(p: Postit): BrowserWindow {
    const r = restaurarBounds({ bounds: p.bounds, tela: p.tela }, this.telas());
    const win = new BrowserWindow({
      ...r.bounds,
      minWidth: TAMANHO_MINIMO.width, minHeight: TAMANHO_MINIMO.height,
      frame: false, resizable: true, show: false, skipTaskbar: true, alwaysOnTop: p.sempreNoTopo,
      maximizable: false, minimizable: false, fullscreenable: false,
      title: p.nome, icon: this.o.icone, backgroundColor: this.fundo(p),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    win.setMenu(null);
    this.aplicarBounds(p.id, win, r.bounds);
    if (p.sempreNoTopo) win.setAlwaysOnTop(true, 'floating');
    this.o.log.info('post-it criado', { origemDaTela: r.origem, oculto: p.oculto });

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    // O título da janela é o nome do post-it (Alt+Tab, leitores de tela); o <title> da página não pode sobrescrevê-lo.
    win.on('page-title-updated', (e) => e.preventDefault());

    // O X só oculta: a sessão do Claude e a conversa continuam intactas.
    win.on('close', (e) => {
      if (this.o.saindo()) return;
      e.preventDefault();
      this.ocultarPorUsuario(p.id);
    });
    // Windows desligando/reiniciando/encerrando a sessão: o "X só oculta" não pode segurar o encerramento.
    win.on('session-end', () => this.o.aoEncerrarSessao());
    win.on('show', () => { this.o.log.info('post-it visível'); this.o.aoMudarLista(); });
    win.on('hide', () => { this.o.log.info('post-it oculto'); this.o.aoMudarLista(); });
    win.on('moved', () => this.guardarGeometria(p.id));
    win.on('resized', () => this.guardarGeometria(p.id));
    win.once('ready-to-show', () => {
      if (this.o.store.obter(p.id)?.oculto) return;
      win.show();
      // depois de mostrada, a janela ganha as bordas do Windows: confirma o tamanho e a posição finais
      this.aplicarBounds(p.id, win, r.bounds);
    });
    win.on('closed', () => this.janelas.delete(p.id));

    const url = process.env.ELECTRON_RENDERER_URL;
    if (url) void win.loadURL(`${url}/postit.html?id=${encodeURIComponent(p.id)}`);
    else void win.loadFile(join(__dirname, '../renderer/postit.html'), { query: { id: p.id } });

    this.janelas.set(p.id, win);
    return win;
  }

  /**
   * setBounds que CONVERGE para o retângulo pedido, medido pelo próprio getBounds (que é o que guardamos).
   * Com escala fracionária (ex.: 150%) e janela sem moldura, o Windows devolve 1 px a mais (borda de redimensionar)
   * e DIP→pixel→DIP não é idempotente: sem compensar, o tamanho crescia 1 px a cada "mover + reiniciar".
   * Também cobre o caso de DPI misto, em que o tamanho sai diferente ao mudar de monitor.
   */
  private aplicarBounds(id: string, win: BrowserWindow, b: Retangulo): void {
    this.ajustando.add(id);
    win.setBounds(b);
    for (let i = 0; i < 3; i++) {
      const got = win.getBounds();
      const dw = b.width - got.width;
      const dh = b.height - got.height;
      if (dw === 0 && dh === 0 && got.x === b.x && got.y === b.y) break;
      win.setBounds({ x: b.x + (b.x - got.x), y: b.y + (b.y - got.y), width: b.width + dw, height: b.height + dh });
    }
    setTimeout(() => this.ajustando.delete(id), 600);
  }

  private guardarGeometria(id: string): void {
    const win = this.janelas.get(id);
    if (!win || win.isDestroyed() || this.ajustando.has(id) || !win.isVisible()) return;
    const b = win.getBounds();
    this.o.store.atualizarGeometria(id, b, telaSalvaDe(telaDoRetangulo(b, this.telas())));
  }

  /** Monitor ligado/desligado ou resolução trocada: reposiciona partindo do que está SALVO (se o monitor voltar, a janela volta). */
  reajustarParaTelas(): void {
    const telas = this.telas();
    for (const [id, win] of this.janelas) {
      const p = this.o.store.obter(id);
      if (!p || win.isDestroyed()) continue;
      const r = restaurarBounds({ bounds: p.bounds, tela: p.tela }, telas);
      const a = win.getBounds();
      if (a.x !== r.bounds.x || a.y !== r.bounds.y || a.width !== r.bounds.width || a.height !== r.bounds.height) {
        this.aplicarBounds(id, win, r.bounds);
        this.o.log.info('post-it reposicionado por mudança de telas', { origemDaTela: r.origem });
      }
    }
  }

  /** Abre as janelas dos post-its que não estavam ocultos (ao iniciar o app). */
  abrirIniciais(): void {
    for (const p of this.o.store.snapshot().postits) if (!p.oculto) this.janelas.get(p.id) ?? this.criar(p);
  }

  private garantir(id: string): BrowserWindow | undefined {
    const p = this.o.store.obter(id);
    if (!p) return undefined;
    const existente = this.janelas.get(id);
    return existente && !existente.isDestroyed() ? existente : this.criar(p);
  }

  /** Reflete mudanças de nome, cor e "sempre no topo" na janela. */
  sincronizar(id: string): void {
    const win = this.janelas.get(id);
    const p = this.o.store.obter(id);
    if (!win || win.isDestroyed() || !p) return;
    if (win.getTitle() !== p.nome) win.setTitle(p.nome);
    win.setBackgroundColor(this.fundo(p));
    if (win.isAlwaysOnTop() !== p.sempreNoTopo) win.setAlwaysOnTop(p.sempreNoTopo, 'floating');
  }

  // ---- visibilidade ----

  ocultarPorUsuario(id: string): void {
    this.o.store.definirOculto(id, true);
    const win = this.janelas.get(id);
    if (win && !win.isDestroyed()) win.hide();
    this.o.aoMudarLista();
  }

  mostrarPorUsuario(id: string): void {
    this.o.store.definirOculto(id, false);
    const win = this.garantir(id);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    this.o.aoMudarLista();
  }

  alternar(id: string): void {
    if (this.visivel(id)) this.ocultarPorUsuario(id);
    else this.mostrarPorUsuario(id);
  }

  visivel(id: string): boolean {
    const w = this.janelas.get(id);
    return !!w && !w.isDestroyed() && w.isVisible();
  }

  visiveis(): string[] {
    return [...this.janelas.keys()].filter((id) => this.visivel(id));
  }

  alguemVisivel(): boolean {
    return this.visiveis().length > 0;
  }

  /** Esconde sem marcar como "oculto" (atalho global): ao mostrar de novo, voltam como estavam. */
  esconderTemporariamente(ids: string[]): void {
    for (const id of ids) this.janelas.get(id)?.hide();
  }

  mostrarTemporariamente(ids: string[]): void {
    for (const id of ids) {
      const p = this.o.store.obter(id);
      if (!p) continue;
      this.garantir(id)?.show();
    }
  }

  idsNaoOcultos(): string[] {
    return this.o.store.snapshot().postits.filter((p) => !p.oculto).map((p) => p.id);
  }

  mostrarTodos(): void {
    for (const p of this.o.store.snapshot().postits) this.mostrarPorUsuario(p.id);
  }

  ocultarTodos(): void {
    for (const p of this.o.store.snapshot().postits) this.ocultarPorUsuario(p.id);
  }

  // ---- criação e exclusão ----

  /** Novo post-it (nome, cor e sessão próprios), no canto da tela principal, sem encobrir os outros. */
  novo(opcoes: { nome?: string; instrucoes?: string; acessoGoogle?: boolean } = {}): Retorno<string> {
    const telas = this.telas();
    const principal = telas.find((t) => t.primaria) ?? telas[0];
    if (!principal) return { ok: false, erro: 'Não encontrei nenhuma tela.' };
    const ocupados = this.o.store.snapshot().postits.filter((p) => !p.oculto).map((p) => p.bounds);
    const bounds = posicaoInicial(TAMANHO_PADRAO, ocupados, principal);
    const r = this.o.store.criar({ ...opcoes, bounds, tela: telaSalvaDe(principal) });
    if (!r.ok) return r;
    this.garantir(r.postit.id)?.show();
    this.o.aoMudarLista();
    return { ok: true, valor: r.postit.id };
  }

  /** Só aqui um post-it some de verdade (o X apenas oculta). A sessão no histórico do Claude Code permanece. */
  excluir(id: string): Retorno {
    const r = this.o.store.excluir(id);
    if (!r.ok) return r;
    this.o.conversa.esquecer(id);
    const win = this.janelas.get(id);
    this.janelas.delete(id);
    if (win && !win.isDestroyed()) win.destroy();
    this.o.aoMudarLista();
    return { ok: true, valor: undefined };
  }

  enviar(id: string, canal: string, valor: unknown): void {
    const w = this.janelas.get(id);
    if (w && !w.isDestroyed()) w.webContents.send(canal, valor);
  }

  resumos(): ResumoPostit[] {
    return this.o.store.snapshot().postits.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor, oculto: p.oculto, visivel: this.visivel(p.id) }));
  }

  /** Para o fim do app: nenhuma janela segura o encerramento. */
  destruirTodas(): void {
    for (const w of this.janelas.values()) if (!w.isDestroyed()) w.destroy();
    this.janelas.clear();
  }
}
