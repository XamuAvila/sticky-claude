import { spawn } from 'node:child_process';
import { ambienteDoFilho, avaliarFerramenta } from './policy';
import { classificarErro, type ErroClaude } from './errors';

export interface PedidoClaude {
  prompt: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  permitidas: readonly string[];
  claudePath: string;
  /** Conector que a fonte exige (só para mensagens de erro melhores). */
  servidorExigido?: string;
  /** Recebe cada evento do stream (ex.: pedaços de texto da resposta). */
  aoEvento?: (ev: EventoStream) => void;
  /** Interrompe a execução (botão "Parar"). */
  sinal?: AbortSignal;
}

export interface UsoTokens {
  entrada: number;
  saida: number;
  cacheLido: number;
  cacheGravado: number;
}

export interface ResultadoClaude {
  ok: boolean;
  estruturada?: unknown;
  texto?: string;
  sessionId?: string;
  servidores: Array<{ name: string; status: string }>;
  tokens?: UsoTokens;
  turnos?: number;
  ms: number;
  erro?: ErroClaude;
  /** Nome (não sensível) da ferramenta que a guarda barrou. */
  ferramentaBarrada?: string;
  /** Ferramentas inexistentes que o modelo tentou chamar (o CLI recusou; só registro). */
  tentativasIgnoradas?: string[];
}

export interface EventoStream {
  type?: string;
  subtype?: string;
  [k: string]: unknown;
}

export function lerLinhaStream(linha: string): EventoStream | null {
  const t = linha.trim();
  if (!t.startsWith('{')) return null;
  try {
    const ev = JSON.parse(t) as unknown;
    return ev && typeof ev === 'object' ? (ev as EventoStream) : null;
  } catch {
    return null;
  }
}

/** Nomes das ferramentas pedidas num evento `assistant`. */
export function ferramentasDoEvento(ev: EventoStream): string[] {
  if (ev.type !== 'assistant') return [];
  const msg = ev.message as { content?: Array<{ type?: string; name?: string }> } | undefined;
  return (msg?.content ?? []).filter((b) => b.type === 'tool_use' && typeof b.name === 'string').map((b) => b.name as string);
}

/** claude.exe em execução agora (para não deixar nenhum órfão quando o app sai). */
const ativos = new Set<number>();

export function matarTodosOsFilhos(): void {
  for (const pid of ativos) matarArvore(pid);
  ativos.clear();
}

function matarArvore(pid: number | undefined): void {
  if (!pid) return;
  try {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
  } catch {
    /* melhor esforço */
  }
}

/** Executa uma chamada headless do CLI do usuário (assinatura). O prompt vai por stdin. */
export function executarClaude(p: PedidoClaude): Promise<ResultadoClaude> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const estado = {
      stderr: '', buf: '', spawnErro: undefined as string | undefined, timedOut: false,
      violacao: undefined as string | undefined,
      servidores: [] as Array<{ name: string; status: string }>,
      resultado: undefined as EventoStream | undefined, sessionId: undefined as string | undefined,
      existentes: null as Set<string> | null, ignoradas: [] as string[], cancelado: false,
    };

    let filho: ReturnType<typeof spawn>;
    try {
      filho = spawn(p.claudePath, p.args, { cwd: p.cwd, env: ambienteDoFilho(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      const erro = classificarErro({ spawnErro: String(e) });
      resolve({ ok: false, servidores: [], ms: Date.now() - t0, erro });
      return;
    }

    if (filho.pid) ativos.add(filho.pid);
    const timer = setTimeout(() => {
      estado.timedOut = true;
      matarArvore(filho.pid);
    }, p.timeoutMs);

    const cancelar = () => { estado.cancelado = true; matarArvore(filho.pid); };
    if (p.sinal?.aborted) cancelar();
    else p.sinal?.addEventListener('abort', cancelar, { once: true });

    const tratar = (ev: EventoStream) => {
      try { p.aoEvento?.(ev); } catch { /* um ouvinte com defeito não derruba a execução */ }
      if (typeof ev.session_id === 'string') estado.sessionId = ev.session_id;
      if (ev.type === 'system' && ev.subtype === 'init') {
        const mcp = (ev.mcp_servers as Array<{ name: string; status: string }> | undefined) ?? [];
        estado.servidores = mcp.map((m) => ({ name: m.name, status: m.status }));
        if (Array.isArray(ev.tools)) estado.existentes = new Set((ev.tools as unknown[]).filter((t): t is string => typeof t === 'string'));
      }
      for (const nome of ferramentasDoEvento(ev)) {
        const v = avaliarFerramenta(nome, p.permitidas, estado.existentes);
        if (v === 'violacao' && !estado.violacao) {
          estado.violacao = nome;
          matarArvore(filho.pid);
        } else if (v === 'inexistente' && estado.ignoradas.length < 10) {
          estado.ignoradas.push(nome.slice(0, 40));
        }
      }
      if (ev.type === 'result') estado.resultado = ev;
    };

    filho.stdout?.on('data', (d: Buffer) => {
      estado.buf += d.toString('utf8');
      let i: number;
      while ((i = estado.buf.indexOf('\n')) >= 0) {
        const linha = estado.buf.slice(0, i);
        estado.buf = estado.buf.slice(i + 1);
        const ev = lerLinhaStream(linha);
        if (ev) tratar(ev);
      }
    });
    filho.stderr?.on('data', (d: Buffer) => { estado.stderr = (estado.stderr + d.toString('utf8')).slice(-2000); });
    filho.on('error', (e) => { estado.spawnErro = String(e); });

    filho.on('close', () => {
      clearTimeout(timer);
      if (filho.pid) ativos.delete(filho.pid);
      const ultima = lerLinhaStream(estado.buf);
      if (ultima) tratar(ultima);

      const r = estado.resultado;
      const ms = Date.now() - t0;
      const usage = r?.usage as Record<string, number> | undefined;
      const base: Omit<ResultadoClaude, 'ok'> = {
        sessionId: (r?.session_id as string | undefined) ?? estado.sessionId,
        servidores: estado.servidores,
        ms,
        ...(estado.ignoradas.length ? { tentativasIgnoradas: estado.ignoradas } : {}),
        ...(usage ? { tokens: { entrada: usage.input_tokens ?? 0, saida: usage.output_tokens ?? 0, cacheLido: usage.cache_read_input_tokens ?? 0, cacheGravado: usage.cache_creation_input_tokens ?? 0 } } : {}),
        ...(typeof r?.num_turns === 'number' ? { turnos: r.num_turns } : {}),
      };

      p.sinal?.removeEventListener('abort', cancelar);
      const falhou = !r || r.is_error === true || estado.timedOut || estado.cancelado || !!estado.violacao || !!estado.spawnErro;
      if (falhou) {
        const erro = classificarErro({
          ...(estado.spawnErro ? { spawnErro: estado.spawnErro } : {}),
          timedOut: estado.timedOut,
          cancelado: estado.cancelado,
          ...(estado.violacao ? { violacao: estado.violacao } : {}),
          stderr: estado.stderr,
          ...(typeof r?.result === 'string' ? { textoErro: r.result } : {}),
          servidores: estado.servidores,
          ...(p.servidorExigido ? { servidorExigido: p.servidorExigido } : {}),
        });
        resolve({ ...base, ok: false, erro, ...(estado.violacao ? { ferramentaBarrada: estado.violacao.slice(0, 80) } : {}) });
        return;
      }
      resolve({
        ...base,
        ok: true,
        ...(r.structured_output !== undefined ? { estruturada: r.structured_output } : {}),
        ...(typeof r.result === 'string' ? { texto: r.result } : {}),
      });
    });

    filho.stdin?.on('error', () => undefined);
    filho.stdin?.end(p.prompt);
  });
}
