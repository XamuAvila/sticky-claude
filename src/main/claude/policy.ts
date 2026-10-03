// Política de ferramentas do Claude. ÚNICO arquivo do projeto que pode citar ferramentas de escrita
// (tests/seguranca.test.ts falha se qualquer outro arquivo citar). Gmail e Calendar: somente leitura.

const GMAIL = 'mcp__claude_ai_Gmail__';
const CALENDAR = 'mcp__claude_ai_Google_Calendar__';

/** As únicas ferramentas que o app permite. */
export const FERRAMENTAS_LEITURA = [
  `${GMAIL}search_threads`,
  `${GMAIL}get_thread`,
  `${GMAIL}get_message`,
  `${CALENDAR}list_events`,
  `${CALENDAR}get_event`,
  `${CALENDAR}list_calendars`,
  `${CALENDAR}search_events`,
] as const;

// Escritas conhecidas dos conectores. A negação vence a permissão e tira a ferramenta da lista do modelo.
const ESCRITA_GMAIL = [
  'apply_sensitive_message_label', 'apply_sensitive_thread_label', 'create_draft', 'create_label',
  'delete_draft', 'delete_label', 'forward', 'label_message', 'label_thread', 'mark_message_spam',
  'mark_thread_spam', 'reply', 'send_message', 'trash_message', 'trash_thread', 'unlabel_message',
  'unlabel_thread', 'unmark_message_spam', 'unmark_thread_spam', 'untrash_message', 'untrash_thread',
  'update_draft', 'update_label', 'update_message_labels',
];
const ESCRITA_CALENDAR = ['create_event', 'delete_event', 'respond_to_event', 'update_event'];

// Leituras que não usamos: negadas só para enxugar o contexto.
const LEITURA_NAO_USADA = [`${GMAIL}get_draft`, `${GMAIL}list_drafts`, `${GMAIL}list_labels`, `${CALENDAR}suggest_time`];

export const NEGADAS_POR_NOME: readonly string[] = [
  ...ESCRITA_GMAIL.map((n) => GMAIL + n),
  ...ESCRITA_CALENDAR.map((n) => CALENDAR + n),
  ...LEITURA_NAO_USADA,
];

/** Conectores já vistos neste PC. O app acrescenta os que aparecem no `init` das execuções. */
export const SERVIDORES_CONHECIDOS = [
  'claude.ai Linear', 'claude.ai Google Drive', 'claude.ai higgsfield', 'claude.ai iZap',
  'claude.ai Claude Docs', 'claude.ai Context7', 'claude.ai Figma', 'plugin:figma:figma',
];

/** "claude.ai Google Drive" -> "mcp__claude_ai_Google_Drive__"; "plugin:figma:figma" -> "mcp__plugin_figma_figma__". */
export function prefixoDoServidor(nome: string): string {
  return `mcp__${nome.replace(/[^A-Za-z0-9_-]/g, '_')}__`;
}

const PREFIXOS_PERMITIDOS = [GMAIL, CALENDAR];

/** Curinga por servidor (o curinga global mcp__* anularia as 7 permitidas). Gmail e Calendar ficam de fora. */
export function negarServidores(nomes: readonly string[]): string[] {
  const vistos = new Set<string>();
  for (const nome of nomes) {
    const p = prefixoDoServidor(nome);
    if (!PREFIXOS_PERMITIDOS.includes(p)) vistos.add(`${p}*`);
  }
  return [...vistos].sort();
}

export type Perfil = 'leitura' | 'semFerramentas';

export interface OpcoesArgs {
  perfil: Perfil;
  servidoresVistos?: readonly string[];
  /** JSON Schema da resposta estruturada. */
  schema?: object;
  modelo?: string;
  esforco?: 'low' | 'medium' | 'high';
  /** Para post-its (M3). */
  sessao?: { id: string; retomar: boolean };
  systemPrompt?: string;
  streaming?: boolean;
  /** Não grava a transcrição em ~/.claude/projects (o briefing não precisa de histórico, e ela teria o conteúdo dos e-mails). */
  semPersistencia?: boolean;
}

/** Linha de comando validada no spike M0 (spike/RESULTADOS.md). O prompt vai por stdin. */
export function montarArgs(o: OpcoesArgs): string[] {
  const servidores = [...new Set([...SERVIDORES_CONHECIDOS, ...(o.servidoresVistos ?? [])])];
  const negadas =
    o.perfil === 'leitura'
      ? [...NEGADAS_POR_NOME, ...negarServidores(servidores)]
      : // sem ferramentas: tira também Gmail e Calendar da lista do modelo
        [...negarServidores(servidores), `${GMAIL}*`, `${CALENDAR}*`];

  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--model', o.modelo ?? 'sonnet',
    '--effort', o.esforco ?? 'low',
    '--tools', '',
  ];
  if (o.perfil === 'leitura') args.push('--allowedTools', FERRAMENTAS_LEITURA.join(','));
  args.push(
    '--disallowedTools', negadas.join(','),
    '--permission-mode', 'dontAsk',
    '--setting-sources', '',
    '--disable-slash-commands',
  );
  if (o.streaming) args.push('--include-partial-messages');
  if (o.semPersistencia) args.push('--no-session-persistence');
  if (o.schema) args.push('--json-schema', JSON.stringify(o.schema));
  if (o.sessao) args.push(o.sessao.retomar ? '--resume' : '--session-id', o.sessao.id);
  if (o.systemPrompt) args.push('--system-prompt', o.systemPrompt, '--system-prompt-snapshot', 'off');
  return args;
}

/** Ferramenta interna que o CLI adiciona quando se usa --json-schema. Só devolve a resposta formatada. */
export const SAIDA_ESTRUTURADA = 'StructuredOutput';

/** O que a guarda do stream aceita ver numa execução: as de leitura (se o perfil permitir) + a de saída estruturada. */
export function permitidasDoPerfil(perfil: Perfil, comSchema: boolean): string[] {
  return [...(perfil === 'leitura' ? FERRAMENTAS_LEITURA : []), ...(comSchema ? [SAIDA_ESTRUTURADA] : [])];
}

export function ferramentaPermitida(nome: string, permitidas: readonly string[]): boolean {
  return permitidas.includes(nome);
}

export type Veredito = 'permitida' | 'inexistente' | 'violacao';

/**
 * Guarda do stream (3ª camada). Derruba a execução quando o modelo pede:
 *  - uma ferramenta que EXISTE para ele (está no `init`) e não é permitida; ou
 *  - qualquer `mcp__…` fora da lista (só chegaria a esse nome por palpite ou por instrução injetada).
 * Uma ferramenta nativa que nem existe na execução (ex.: o modelo tenta `Bash`) é só ignorada: o CLI
 * responde "ferramenta inexistente" e nada executa. Sem a lista do `init`, o critério é o mais estrito.
 */
export function avaliarFerramenta(nome: string, permitidas: readonly string[], existentes: ReadonlySet<string> | null): Veredito {
  if (ferramentaPermitida(nome, permitidas)) return 'permitida';
  if (nome.startsWith('mcp__')) return 'violacao';
  if (existentes && !existentes.has(nome)) return 'inexistente';
  return 'violacao';
}

/** Ambiente do processo filho: assinatura apenas, nunca chave de API. */
export function ambienteDoFilho(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}
