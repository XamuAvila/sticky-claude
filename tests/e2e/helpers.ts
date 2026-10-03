// Ajudantes do E2E: abre o app REAL (Electron) com dados temporários e o executor falso (sem gastar assinatura).
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

const RAIZ = resolve(__dirname, '..', '..');
const electronExe = createRequire(import.meta.url)('electron') as string;

export interface AppE2E {
  app: ElectronApplication;
  /** Janela do painel (briefing). */
  page: Page;
  dados: string;
  arquivoMetas: string;
  lerMetas: () => Array<Record<string, unknown>>;
  lerPostits: () => Array<Record<string, any>>;
  lerChamadasFalsas: () => Array<Record<string, any>>;
  /** Janela de um post-it, pelo nome (espera até aparecer). */
  postit: (nome: string, ms?: number) => Promise<Page>;
  /** Estado das janelas nativas (BrowserWindow) vistas pelo processo principal. */
  janelasNativas: () => Promise<Array<{ titulo: string; visivel: boolean; topo: boolean; focavel: boolean; bounds: { x: number; y: number; width: number; height: number } }>>;
  /** Área útil da tela principal (sem a barra de tarefas), em DIPs. */
  areaUtil: () => Promise<{ x: number; y: number; width: number; height: number }>;
  /** apagar=false mantém a pasta de dados (para "reiniciar" o app com os mesmos dados). */
  fechar: (apagar?: boolean) => Promise<void>;
  /** Mata o processo de uma vez, sem o app poder se despedir (como um desligamento forçado). */
  matar: () => Promise<void>;
}

export interface OpcoesApp {
  /** Reabre com a pasta de dados de uma execução anterior (não cria outra). */
  dados?: string;
  /** Conteúdo inicial de metas.json (objeto) ou texto cru (para testar arquivo corrompido). */
  metas?: unknown;
  metasTextoCru?: string;
  /** Conteúdo inicial de briefing.json (cache): se for recente e completo, o app não executa o briefing no início. */
  briefing?: unknown;
  env?: Record<string, string>;
  tema?: 'light' | 'dark';
}

const lerJson = (arq: string) => (existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : undefined);

export async function abrirApp(o: OpcoesApp = {}): Promise<AppE2E> {
  const dados = o.dados ?? mkdtempSync(join(tmpdir(), 'sticky-e2e-'));
  const arquivoMetas = join(dados, 'metas.json');
  if (o.metasTextoCru !== undefined) writeFileSync(arquivoMetas, o.metasTextoCru);
  else if (o.metas !== undefined) writeFileSync(arquivoMetas, JSON.stringify(o.metas));
  if (o.briefing !== undefined) writeFileSync(join(dados, 'briefing.json'), JSON.stringify(o.briefing));

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  // STICKY_PILULA=0: a pílula (janela no topo da tela) só aparece nos testes que a pedem, para não piscar no seu monitor
  Object.assign(env, { STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_THEME: o.tema ?? 'light', STICKY_PILULA: '0', ...(o.env ?? {}) });

  // Reabrir logo depois de um processo morto à força pode esbarrar nos filhos dele que ainda estão saindo: tenta de novo.
  let app!: ElectronApplication;
  for (let tentativa = 1; ; tentativa++) {
    try {
      app = await electron.launch({ executablePath: electronExe, args: [RAIZ], env, timeout: 30_000 });
      break;
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const acharPainel = async (): Promise<Page> => {
    const fim = Date.now() + 25_000;
    for (;;) {
      const p = app.windows().find((w) => w.url().includes('panel.html'));
      if (p) return p;
      if (Date.now() > fim) throw new Error('janela do painel não apareceu');
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const page = await acharPainel();
  await page.waitForSelector('[data-testid=nova-meta]', { timeout: 20_000 });

  const lerPostits = () => (lerJson(join(dados, 'postits.json'))?.postits ?? []) as Array<Record<string, any>>;

  return {
    app, page, dados, arquivoMetas, lerPostits,
    lerMetas: () => (lerJson(arquivoMetas)?.metas ?? []) as Array<Record<string, unknown>>,
    lerChamadasFalsas: () => (lerJson(join(dados, 'fake-chamadas.json')) ?? []) as Array<Record<string, any>>,
    postit: async (nome, ms = 20_000) => {
      const fim = Date.now() + ms;
      for (;;) {
        const id = lerPostits().find((p) => p.nome === nome)?.id;
        const w = id ? app.windows().find((x) => x.url().includes('postit.html') && x.url().includes(`id=${id}`)) : undefined;
        if (w) return w;
        if (Date.now() > fim) throw new Error(`janela do post-it "${nome}" não apareceu`);
        await new Promise((r) => setTimeout(r, 150));
      }
    },
    janelasNativas: () => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ titulo: w.getTitle(), visivel: w.isVisible(), topo: w.isAlwaysOnTop(), focavel: w.isFocusable(), bounds: w.getBounds() }))),
    areaUtil: () => app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea),
    fechar: async (apagar = true) => {
      await app.close().catch(() => undefined);
      if (apagar) rmSync(dados, { recursive: true, force: true });
    },
    matar: async () => {
      // O pid do Playwright é de um cmd.exe intermediário: taskkill /T mata a árvore toda (o Electron e seus filhos) de uma vez.
      const pid = app.process().pid;
      try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* já saiu */ }
      await new Promise((r) => setTimeout(r, 1500));
    },
  };
}

/** Repete a checagem até passar (ou estourar o tempo) e devolve o último valor. */
export async function esperar<T>(fn: () => T | Promise<T>, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const fim = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 150));
    v = await fn();
  }
  return v;
}

export const metaSemente = (p: Record<string, unknown> = {}) => ({
  id: 'm-semente', nome: 'Aprender violão', status: 'ativa', prazo: '2027-06-30', porque: 'Tocar com os amigos',
  proximoPasso: 'Praticar 2 acordes', criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), ...p,
});
