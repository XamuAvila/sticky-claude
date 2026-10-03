import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Logger {
  info(msg: string, campos?: Record<string, unknown>): void;
  warn(msg: string, campos?: Record<string, unknown>): void;
  erro(msg: string, campos?: Record<string, unknown>): void;
}

const MAX_BYTES = 1_000_000;

/** Defesa em profundidade: texto longo nunca vai para o log (poderia ser corpo de e-mail). */
export function seguro(campos: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (typeof v === 'string') out[k] = v.length > 120 ? `[texto de ${v.length} caracteres omitido]` : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' && x.length > 120 ? '[omitido]' : x));
    else out[k] = '[objeto omitido]';
  }
  return out;
}

export function criarLogger(dir: string, arquivo = 'app.log'): Logger {
  mkdirSync(dir, { recursive: true });
  const caminho = join(dir, arquivo);
  const escrever = (nivel: string, msg: string, campos?: Record<string, unknown>) => {
    try {
      try {
        if (statSync(caminho).size > MAX_BYTES) renameSync(caminho, join(dir, arquivo.replace(/\.log$/, '.1.log')));
      } catch { /* arquivo ainda não existe */ }
      appendFileSync(caminho, JSON.stringify({ t: new Date().toISOString(), nivel, msg, ...seguro(campos) }) + '\n', 'utf8');
    } catch { /* log nunca derruba o app */ }
  };
  return {
    info: (m, c) => escrever('info', m, c),
    warn: (m, c) => escrever('warn', m, c),
    erro: (m, c) => escrever('erro', m, c),
  };
}
