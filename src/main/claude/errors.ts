export type TipoErro =
  | 'cli-ausente'
  | 'nao-logado'
  | 'conector'
  | 'limite'
  | 'tempo-esgotado'
  | 'politica'
  | 'saida-invalida'
  /** --resume de uma sessão que o Claude Code não tem mais (ex.: limpeza de sessões antigas). */
  | 'sessao-perdida'
  /** --session-id de uma sessão que já existe (a anterior chegou a ser criada). */
  | 'sessao-em-uso'
  /** O usuário apertou "Parar". */
  | 'cancelado'
  | 'falha';

export interface ErroClaude {
  tipo: TipoErro;
  mensagem: string;
}

export interface EntradaErro {
  spawnErro?: string;
  timedOut?: boolean;
  cancelado?: boolean;
  violacao?: string;
  stderr?: string;
  /** Texto do campo `result` quando is_error = true, ou motivo `falhou` devolvido pelo modelo. */
  textoErro?: string;
  servidores?: Array<{ name: string; status: string }>;
  /** Conector exigido pela fonte (ex.: "claude.ai Gmail"). */
  servidorExigido?: string;
}

const cortar = (s: string, n = 200) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** Transforma sinais do processo em uma mensagem clara. Nunca repassa conteúdo longo (pode vir de e-mail). */
export function classificarErro(e: EntradaErro): ErroClaude {
  if (e.cancelado) return { tipo: 'cancelado', mensagem: 'Interrompido.' };
  if (e.violacao) return { tipo: 'politica', mensagem: 'Execução interrompida: o Claude tentou usar uma ferramenta fora da lista de leitura.' };
  if (e.spawnErro && /ENOENT/i.test(e.spawnErro)) {
    return { tipo: 'cli-ausente', mensagem: 'Não encontrei o Claude Code (claude.exe). Instale-o ou informe o caminho nas configurações.' };
  }
  if (e.timedOut) return { tipo: 'tempo-esgotado', mensagem: 'O Claude demorou demais para responder. Tente atualizar de novo.' };

  const texto = `${e.stderr ?? ''} ${e.textoErro ?? ''}`;
  if (/No conversation found with session ID/i.test(texto)) {
    return { tipo: 'sessao-perdida', mensagem: 'O Claude não encontrou mais essa conversa no histórico dele.' };
  }
  if (/Session ID .* is already in use/i.test(texto)) {
    return { tipo: 'sessao-em-uso', mensagem: 'Essa sessão já existe; retomando a conversa.' };
  }
  if (/not logged in|please run .*\/?login|invalid api key|authentication_error|oauth token|401/i.test(texto)) {
    return { tipo: 'nao-logado', mensagem: 'Você não está logado no Claude Code. Rode "claude auth login" no terminal.' };
  }
  if (/usage limit|rate limit|limit reached|quota|overloaded|429/i.test(texto)) {
    return { tipo: 'limite', mensagem: 'Limite de uso da assinatura atingido (ou serviço sobrecarregado). Tente mais tarde.' };
  }
  const srv = e.servidores?.find((s) => s.name === e.servidorExigido);
  if (e.servidorExigido && srv && srv.status !== 'connected' && srv.status !== 'pending') {
    const nome = e.servidorExigido.replace(/^claude\.ai\s+/, '');
    return { tipo: 'conector', mensagem: `O conector ${nome} não está conectado (${srv.status}). Reconecte em claude.ai > Conectores.` };
  }
  if (e.servidorExigido && !srv && e.servidores) {
    const nome = e.servidorExigido.replace(/^claude\.ai\s+/, '');
    return { tipo: 'conector', mensagem: `O conector ${nome} não aparece na sua conta. Conecte em claude.ai > Conectores.` };
  }
  if (e.textoErro) return { tipo: 'falha', mensagem: cortar(e.textoErro) };
  return { tipo: 'falha', mensagem: cortar(e.stderr ?? '') || 'O Claude terminou sem uma resposta utilizável.' };
}
