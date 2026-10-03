import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Lê JSON e valida. Devolve null se o arquivo não existe, está corrompido ou não passa na validação. */
export function lerJson<T>(arquivo: string, validar: (u: unknown) => T): T | null {
  try {
    if (!existsSync(arquivo)) return null;
    return validar(JSON.parse(readFileSync(arquivo, 'utf8')));
  } catch {
    return null;
  }
}

/** Gravação atômica: escreve em .tmp, guarda o anterior em .bak e troca por rename (com retentativas: antivírus/OneDrive). */
export function gravarJsonAtomico(arquivo: string, dados: unknown): void {
  mkdirSync(dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  if (existsSync(arquivo)) {
    try { copyFileSync(arquivo, `${arquivo}.bak`); } catch { /* backup é melhor esforço */ }
  }
  let ultimo: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      renameSync(tmp, arquivo);
      return;
    } catch (e) {
      ultimo = e;
      const fim = Date.now() + 40 * (i + 1);
      while (Date.now() < fim) { /* espera curta e síncrona */ }
    }
  }
  throw ultimo;
}
