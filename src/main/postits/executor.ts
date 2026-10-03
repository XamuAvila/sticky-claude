import { lembrarServidores, servidoresVistos } from '../briefing/executor';
import { acharClaude } from '../claude/locate';
import { montarArgs, permitidasDoPerfil } from '../claude/policy';
import { executarClaude, type EventoStream } from '../claude/runner';
import { lerConfig } from '../config';
import type { Logger } from '../log';
import { caminhos } from '../paths';
import type { ExecutarConversa } from './conversa';

/** Pedaço de texto de uma resposta em streaming (evento content_block_delta/text_delta). */
export function textoDoDelta(ev: EventoStream): string | undefined {
  if (ev.type !== 'stream_event') return undefined;
  const e = ev.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
  return e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string' ? e.delta.text : undefined;
}

const TEMPO_MAXIMO_MS = 300_000;

/**
 * Executa uma mensagem de um post-it no claude.exe do usuário (assinatura), em streaming.
 * Primeira mensagem: --session-id; as seguintes: --resume. Sem Gmail/Calendar a menos que o post-it tenha esse acesso.
 */
export function criarExecutorConversa(log: Logger): ExecutarConversa {
  return async (p) => {
    const cfg = lerConfig();
    const claudePath = acharClaude(cfg.claudePath);
    if (!claudePath) {
      return { ok: false, erro: { tipo: 'cli-ausente', mensagem: 'Não encontrei o Claude Code (claude.exe). Instale-o ou informe o caminho nas configurações.' } };
    }
    const perfil = p.postit.acessoGoogle ? 'leitura' : 'semFerramentas';
    const args = montarArgs({
      perfil,
      servidoresVistos: servidoresVistos(),
      sessao: { id: p.sessionId, retomar: p.retomar },
      systemPrompt: p.systemPrompt,
      streaming: true,
      modelo: cfg.modeloPostits ?? 'sonnet',
      esforco: cfg.esforcoPostits ?? 'medium',
    });

    const r = await executarClaude({
      prompt: p.texto, args, claudePath, cwd: caminhos.workspace(), timeoutMs: TEMPO_MAXIMO_MS,
      permitidas: permitidasDoPerfil(perfil, false),
      sinal: p.sinal,
      aoEvento: (ev) => { const t = textoDoDelta(ev); if (t) p.aoDelta(t); },
    });

    try { lembrarServidores(r.servidores.map((s) => s.name)); } catch { /* melhor esforço */ }
    // Só metadados: nunca a mensagem nem a resposta.
    log.info('execução do claude', {
      fonte: 'postit', ok: r.ok, ms: r.ms, turnos: r.turnos, tipoErro: r.erro?.tipo, retomada: p.retomar, googleLiberado: p.postit.acessoGoogle,
      ferramentaBarrada: r.ferramentaBarrada, tentativasIgnoradas: r.tentativasIgnoradas,
      tokensEntrada: r.tokens?.entrada, tokensSaida: r.tokens?.saida, cacheLido: r.tokens?.cacheLido, cacheGravado: r.tokens?.cacheGravado,
    });

    return r.ok
      ? { ok: true, ...(r.texto !== undefined ? { texto: r.texto } : {}) }
      : { ok: false, ...(r.erro ? { erro: r.erro } : {}) };
  };
}
