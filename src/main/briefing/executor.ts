import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { montarArgs, permitidasDoPerfil } from '../claude/policy';
import { acharClaude } from '../claude/locate';
import { executarClaude } from '../claude/runner';
import type { Logger } from '../log';
import { caminhos } from '../paths';
import { gravarJsonAtomico, lerJson } from '../storage';
import { brutoDaSaida } from './parser';
import { SCHEMAS } from './prompts';
import type { FonteNome, SaidaFonte } from './service';

const ServidoresSchema = z.object({ nomes: z.array(z.string()) });

/** Conectores já vistos no `init` das execuções: viram negação por servidor na execução seguinte. */
export function servidoresVistos(): string[] {
  return lerJson(caminhos.servidores(), (u) => ServidoresSchema.parse(u))?.nomes ?? [];
}

function lembrarServidores(nomes: string[]): void {
  const atuais = new Set(servidoresVistos());
  const antes = atuais.size;
  nomes.forEach((n) => atuais.add(n));
  if (atuais.size !== antes) gravarJsonAtomico(caminhos.servidores(), { nomes: [...atuais].sort() });
}

const CONFIG = {
  agenda: { perfil: 'leitura' as const, schema: SCHEMAS.agenda, timeoutMs: 150_000, servidor: 'claude.ai Google Calendar' },
  emails: { perfil: 'leitura' as const, schema: SCHEMAS.emails, timeoutMs: 180_000, servidor: 'claude.ai Gmail' },
  foco: { perfil: 'semFerramentas' as const, schema: SCHEMAS.foco, timeoutMs: 90_000, servidor: undefined },
};

export function lerClaudePathConfigurado(): string | undefined {
  try {
    const c = JSON.parse(readFileSync(caminhos.config(), 'utf8')) as { claudePath?: unknown };
    return typeof c.claudePath === 'string' ? c.claudePath : undefined;
  } catch {
    return undefined;
  }
}

export function criarExecutor(log: Logger) {
  return async (fonte: FonteNome, prompt: string): Promise<SaidaFonte> => {
    const cfg = CONFIG[fonte];
    const claudePath = acharClaude(lerClaudePathConfigurado());
    if (!claudePath) {
      log.erro('claude.exe não encontrado', { fonte });
      return { ok: false, erro: 'Não encontrei o Claude Code (claude.exe). Instale-o ou informe o caminho nas configurações.' };
    }

    const args = montarArgs({ perfil: cfg.perfil, servidoresVistos: servidoresVistos(), schema: cfg.schema(), semPersistencia: true });
    const r = await executarClaude({
      prompt, args, claudePath, cwd: caminhos.workspace(), timeoutMs: cfg.timeoutMs,
      permitidas: permitidasDoPerfil(cfg.perfil, true),
      ...(cfg.servidor ? { servidorExigido: cfg.servidor } : {}),
    });

    try { lembrarServidores(r.servidores.map((s) => s.name)); } catch { /* melhor esforço */ }

    // Só metadados no log: nunca prompt, resposta ou corpo de e-mail.
    log.info('execução do claude', {
      fonte, ok: r.ok, ms: r.ms, turnos: r.turnos, tipoErro: r.erro?.tipo, ferramentaBarrada: r.ferramentaBarrada, tentativasIgnoradas: r.tentativasIgnoradas,
      tokensEntrada: r.tokens?.entrada, tokensSaida: r.tokens?.saida, cacheLido: r.tokens?.cacheLido, cacheGravado: r.tokens?.cacheGravado,
    });

    if (!r.ok) return { ok: false, erro: r.erro?.mensagem ?? 'Falha ao executar o Claude.' };
    const bruto = brutoDaSaida({ ...(r.estruturada !== undefined ? { estruturada: r.estruturada } : {}), ...(r.texto ? { texto: r.texto } : {}) });
    if (bruto === undefined) return { ok: false, erro: 'A resposta do Claude veio fora do formato esperado.' };
    return { ok: true, bruto };
  };
}
