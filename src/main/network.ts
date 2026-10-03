import { lookup } from 'node:dns/promises';

/** Só uma consulta de DNS: não envia nada além do nome do host do Claude. */
export async function temRede(host = 'api.anthropic.com', timeoutMs = 4000): Promise<boolean> {
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

export interface OpcoesRede {
  temRede: () => Promise<boolean>;
  dormir: (ms: number) => Promise<void>;
  agora: () => number;
  /** Até quando esperar (padrão 2 min). */
  limiteMs?: number;
  /** Chamado uma vez quando a primeira checagem falha. */
  aoEsperar?: () => void;
}

const PASSOS_MS = [2000, 3000, 5000, 8000, 10_000];

/** Espera a rede subir (boot do Windows). Devolve 'ok' ou 'sem-internet' ao estourar o limite. */
export async function aguardarRede(o: OpcoesRede): Promise<'ok' | 'sem-internet'> {
  const limite = o.limiteMs ?? 120_000;
  const fim = o.agora() + limite;
  let i = 0;
  let avisou = false;
  for (;;) {
    if (await o.temRede()) return 'ok';
    if (!avisou) { avisou = true; o.aoEsperar?.(); }
    const passo = PASSOS_MS[Math.min(i++, PASSOS_MS.length - 1)]!;
    if (o.agora() + passo > fim) return 'sem-internet';
    await o.dormir(passo);
  }
}
