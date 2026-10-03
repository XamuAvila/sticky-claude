import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** %APPDATA%\StickyClaude (STICKY_DATA_DIR serve para testes e capturas isoladas). */
export function dadosDir(): string {
  return process.env.STICKY_DATA_DIR ?? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'StickyClaude');
}

export const caminhos = {
  briefing: () => join(dadosDir(), 'briefing.json'),
  servidores: () => join(dadosDir(), 'servidores.json'),
  config: () => join(dadosDir(), 'config.json'),
  preferencias: () => join(dadosDir(), 'preferencias.json'),
  metas: () => join(dadosDir(), 'metas.json'),
  backups: () => join(dadosDir(), 'backups'),
  logs: () => join(dadosDir(), 'logs'),
  /** cwd fixo das execuções do Claude: as sessões são indexadas por cwd. */
  workspace: () => join(dadosDir(), 'workspace'),
};

export function garantirPastas(): void {
  for (const dir of [dadosDir(), caminhos.logs(), caminhos.workspace()]) mkdirSync(dir, { recursive: true });
}
