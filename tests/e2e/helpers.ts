// Ajudantes do E2E: abre o app REAL (Electron) com dados temporários e o executor falso (sem gastar assinatura).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';

const RAIZ = resolve(__dirname, '..', '..');
const electronExe = createRequire(import.meta.url)('electron') as string;

export interface AppE2E {
  app: ElectronApplication;
  page: Page;
  dados: string;
  arquivoMetas: string;
  lerMetas: () => Array<Record<string, unknown>>;
  fechar: () => Promise<void>;
}

export interface OpcoesApp {
  /** Conteúdo inicial de metas.json (objeto) ou texto cru (para testar arquivo corrompido). */
  metas?: unknown;
  metasTextoCru?: string;
  env?: Record<string, string>;
  tema?: 'light' | 'dark';
}

export async function abrirApp(o: OpcoesApp = {}): Promise<AppE2E> {
  const dados = mkdtempSync(join(tmpdir(), 'sticky-e2e-'));
  const arquivoMetas = join(dados, 'metas.json');
  if (o.metasTextoCru !== undefined) writeFileSync(arquivoMetas, o.metasTextoCru);
  else if (o.metas !== undefined) writeFileSync(arquivoMetas, JSON.stringify(o.metas));

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  Object.assign(env, {
    STICKY_DATA_DIR: dados, STICKY_FAKE_CLAUDE: '1', STICKY_THEME: o.tema ?? 'light', ...(o.env ?? {}),
  });

  const app = await electron.launch({ executablePath: electronExe, args: [RAIZ], env, timeout: 30_000 });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid=nova-meta]', { timeout: 20_000 });

  return {
    app, page, dados, arquivoMetas,
    lerMetas: () => (existsSync(arquivoMetas) ? (JSON.parse(readFileSync(arquivoMetas, 'utf8')).metas as Array<Record<string, unknown>>) : []),
    fechar: async () => {
      await app.close().catch(() => undefined);
      rmSync(dados, { recursive: true, force: true });
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

export { mkdirSync };
