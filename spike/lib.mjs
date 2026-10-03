// Executor do spike M0. Chama o claude.exe do usuário (assinatura), sem SDK e sem chave de API.
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const CLAUDE = join(homedir(), '.local', 'bin', 'claude.exe');
export const WORKSPACE = join(process.env.APPDATA, 'StickyClaude', 'workspace');
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT_DIR, { recursive: true });

const G = 'mcp__claude_ai_Gmail__';
const C = 'mcp__claude_ai_Google_Calendar__';

// As únicas ferramentas que o app poderá usar.
export const READ_ONLY_TOOLS = [
  `${G}search_threads`, `${G}get_thread`, `${G}get_message`,
  `${C}list_events`, `${C}get_event`, `${C}list_calendars`, `${C}search_events`,
];

// Escrita conhecida dos conectores (lista de negação, segunda camada).
export const WRITE_DENYLIST = [
  ...['apply_sensitive_message_label', 'apply_sensitive_thread_label', 'create_draft', 'create_label',
    'delete_draft', 'delete_label', 'forward', 'label_message', 'label_thread', 'mark_message_spam',
    'mark_thread_spam', 'reply', 'send_message', 'trash_message', 'trash_thread', 'unlabel_message',
    'unlabel_thread', 'unmark_message_spam', 'unmark_thread_spam', 'untrash_message', 'untrash_thread',
    'update_draft', 'update_label', 'update_message_labels'].map((n) => G + n),
  ...['create_event', 'delete_event', 'respond_to_event', 'update_event'].map((n) => C + n),
];

// Leitura que não usamos (corta contexto e deixa só as 7 ferramentas).
const UNUSED_READS = [`${G}get_draft`, `${G}list_drafts`, `${G}list_labels`, `${C}suggest_time`];

// Outros conectores: negados por servidor. Curinga global (mcp__*) NÃO serve: a negação vence a permissão.
export const OTHER_SERVERS_DENY = ['Linear', 'Google_Drive', 'higgsfield', 'iZap', 'Claude_Docs', 'Context7', 'Figma']
  .map((n) => `mcp__claude_ai_${n}__*`)
  .concat('mcp__plugin_figma_figma__*');

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Ambiente do filho: nunca repassa chave de API (assinatura apenas). */
export function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

/**
 * Roda uma execução headless. `prompt` vai por stdin (evita limites e aspas da linha de comando).
 * Retorna um resumo sem copiar o conteúdo bruto para o console.
 */
export function run({ name, prompt, args = [], env = {}, cwd = WORKSPACE, timeoutMs = 240_000 }) {
  return new Promise((resolve) => {
    const base = ['-p', '--output-format', 'stream-json', '--verbose'];
    const t0 = Date.now();
    const rawPath = join(OUT_DIR, `${name}.jsonl`);
    const raw = createWriteStream(rawPath);
    const child = spawn(CLAUDE, [...base, ...args], {
      cwd, env: childEnv(env), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const s = {
      name, args, cwd, rawPath, events: 0, init: null, toolUses: [], toolResults: [], deltas: 0,
      firstEventMs: null, firstDeltaMs: null, result: null, stderr: '', exitCode: null, timedOut: false,
      eventTimes: [],
    };
    const timer = setTimeout(() => { s.timedOut = true; child.kill(); }, timeoutMs);
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        raw.write(line + '\n');
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        const at = Date.now() - t0;
        s.events++;
        s.eventTimes.push([at, ev.type + (ev.subtype ? ':' + ev.subtype : '')]);
        if (s.firstEventMs === null) s.firstEventMs = at;
        if (ev.type === 'system' && ev.subtype === 'init') s.init = ev;
        if (ev.type === 'stream_event' && ev.event?.delta?.type === 'text_delta') {
          s.deltas++;
          if (s.firstDeltaMs === null) s.firstDeltaMs = at;
        }
        if (ev.type === 'assistant') {
          for (const b of ev.message?.content ?? []) {
            if (b.type === 'tool_use') s.toolUses.push(b.name);
          }
        }
        if (ev.type === 'user') {
          for (const b of ev.message?.content ?? []) {
            if (b.type === 'tool_result') s.toolResults.push({ error: !!b.is_error });
          }
        }
        if (ev.type === 'result') s.result = ev;
      }
    });
    child.stderr.on('data', (d) => { s.stderr += d.toString('utf8'); });
    child.on('close', (code) => {
      clearTimeout(timer);
      raw.end();
      s.exitCode = code;
      s.totalMs = Date.now() - t0;
      resolve(s);
    });
    child.on('error', (e) => { s.stderr += String(e); });
    child.stdin.end(prompt);
  });
}

/** Resumo legível (sem despejar o conteúdo bruto). */
export function summarize(s) {
  const r = s.result;
  const u = r?.usage;
  const out = {
    cenario: s.name,
    saida: s.exitCode, timeout: s.timedOut, tempoTotalMs: s.totalMs,
    primeiroEventoMs: s.firstEventMs, primeiroDeltaTextoMs: s.firstDeltaMs, deltasDeTexto: s.deltas,
    eventos: s.events,
    sessao: s.init?.session_id ?? r?.session_id,
    modelo: s.init?.model,
    ferramentasNoInit: s.init?.tools?.length,
    mcp: s.init?.mcp_servers?.map((m) => `${m.name}:${m.status}`),
    ferramentasUsadas: s.toolUses,
    resultadosDeFerramenta: s.toolResults,
    subtype: r?.subtype, erro: r?.is_error, turnos: r?.num_turns,
    negacoes: r?.permission_denials?.map((d) => d.tool_name),
    custoUsd: r?.total_cost_usd,
    tokens: u ? { in: u.input_tokens, out: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens } : undefined,
    stderr: s.stderr.trim().slice(0, 400) || undefined,
  };
  return out;
}

/** Argumentos da receita do plano. */
export function recipe({
  model = 'sonnet', effort = 'low', tools = '', allowed = READ_ONLY_TOOLS,
  deny = [...WRITE_DENYLIST, ...UNUSED_READS, ...OTHER_SERVERS_DENY], extra = [],
} = {}) {
  return [
    '--model', model, '--effort', effort,
    '--tools', tools,
    '--allowedTools', allowed.join(','),
    '--disallowedTools', deny.join(','),
    '--permission-mode', 'dontAsk',
    '--setting-sources', '',
    '--disable-slash-commands',
    ...extra,
  ];
}
