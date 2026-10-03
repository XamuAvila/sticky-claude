// Estado dos post-its: tipos validados (zod) e transições puras. Nada aqui toca em disco nem em janelas.
import { z } from 'zod';
import {
  CORES, LIMITE_INSTRUCOES, LIMITE_NOME, TAMANHO_MINIMO, type CorPostit, type Postit, type Retangulo, type TelaSalva,
} from '@shared/postits';

const Ret = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });

export const PostitSchema = z.object({
  id: z.string().min(1),
  sessionId: z.uuid(),
  iniciada: z.boolean().default(false),
  nome: z.string().min(1).max(LIMITE_NOME),
  cor: z.enum(CORES).default('amarelo'),
  instrucoes: z.string().max(LIMITE_INSTRUCOES).default(''),
  acessoGoogle: z.boolean().default(false),
  sempreNoTopo: z.boolean().default(false),
  oculto: z.boolean().default(false),
  bounds: Ret,
  tela: z.object({ id: z.number(), bounds: Ret, scaleFactor: z.number().positive() }).optional(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});

export const EstadoSchema = z.object({ versao: z.literal(1), postits: z.array(PostitSchema) });
export type EstadoPostits = { versao: 1; postits: Postit[] };

export const estadoVazio = (): EstadoPostits => ({ versao: 1, postits: [] });

export interface Contexto {
  agora: () => Date;
  novoId: () => string;
}

export type Resultado<T = object> = ({ ok: true; estado: EstadoPostits } & T) | { ok: false; erro: string };

/** Texto de uma linha (nomes): sem controles, espaços normalizados. */
export function limparNome(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITE_NOME);
}

/** Texto de várias linhas (instruções): mantém as quebras de linha, tira os outros controles. */
export function limparInstrucoes(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '').trim().slice(0, LIMITE_INSTRUCOES);
}

function nomePadrao(postits: readonly Postit[]): string {
  const usados = new Set(postits.map((p) => p.nome));
  for (let n = postits.length + 1; ; n++) if (!usados.has(`Post-it ${n}`)) return `Post-it ${n}`;
}

export interface NovoPostit {
  nome?: string;
  cor?: CorPostit;
  instrucoes?: string;
  acessoGoogle?: boolean;
  bounds: Retangulo;
  tela?: TelaSalva;
}

export function criar(estado: EstadoPostits, n: NovoPostit, ctx: Contexto): Resultado<{ postit: Postit }> {
  const nome = n.nome !== undefined ? limparNome(n.nome) : nomePadrao(estado.postits);
  if (!nome) return { ok: false, erro: 'Dê um nome ao post-it.' };
  const agora = ctx.agora().toISOString();
  const postit: Postit = {
    id: ctx.novoId(),
    sessionId: ctx.novoId(),
    iniciada: false,
    nome,
    // as cores se revezam para os post-its novos não ficarem todos iguais
    cor: n.cor ?? CORES[estado.postits.length % CORES.length]!,
    instrucoes: limparInstrucoes(n.instrucoes ?? ''),
    acessoGoogle: n.acessoGoogle ?? false,
    sempreNoTopo: false,
    oculto: false,
    bounds: n.bounds,
    ...(n.tela ? { tela: n.tela } : {}),
    criadoEm: agora,
    atualizadoEm: agora,
  };
  return { ok: true, estado: { ...estado, postits: [...estado.postits, postit] }, postit };
}

function alterar(estado: EstadoPostits, id: string, f: (p: Postit) => Postit | string, ctx: Contexto): Resultado {
  const atual = estado.postits.find((p) => p.id === id);
  if (!atual) return { ok: false, erro: 'Esse post-it não existe mais.' };
  const novo = f(atual);
  if (typeof novo === 'string') return { ok: false, erro: novo };
  return { ok: true, estado: { ...estado, postits: estado.postits.map((p) => (p.id === id ? { ...novo, atualizadoEm: ctx.agora().toISOString() } : p)) } };
}

export const renomear = (e: EstadoPostits, id: string, nome: string, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => { const n = limparNome(nome); return n ? { ...p, nome: n } : 'Dê um nome ao post-it.'; }, ctx);

export const trocarCor = (e: EstadoPostits, id: string, cor: string, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ((CORES as readonly string[]).includes(cor) ? { ...p, cor: cor as CorPostit } : 'Cor desconhecida.'), ctx);

export const definirInstrucoes = (e: EstadoPostits, id: string, texto: string, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => (texto.length > LIMITE_INSTRUCOES * 2 ? `Instruções longas demais (máximo ${LIMITE_INSTRUCOES} caracteres).` : { ...p, instrucoes: limparInstrucoes(texto) }), ctx);

export const definirTopo = (e: EstadoPostits, id: string, v: boolean, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ({ ...p, sempreNoTopo: v }), ctx);

export const definirAcessoGoogle = (e: EstadoPostits, id: string, v: boolean, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ({ ...p, acessoGoogle: v }), ctx);

export const definirOculto = (e: EstadoPostits, id: string, v: boolean, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ({ ...p, oculto: v }), ctx);

/** Posição e tamanho atuais (e a tela em que está). Tamanhos abaixo do mínimo são ignorados. */
export const atualizarGeometria = (e: EstadoPostits, id: string, bounds: Retangulo, tela: TelaSalva | undefined, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => {
    if (bounds.width < TAMANHO_MINIMO.width || bounds.height < TAMANHO_MINIMO.height) return { ...p };
    return { ...p, bounds, ...(tela ? { tela } : {}) };
  }, ctx);

/** A sessão do Claude já existe: a partir de agora a conversa sempre é retomada (--resume). */
export const marcarIniciada = (e: EstadoPostits, id: string, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ({ ...p, iniciada: true }), ctx);

/** O Claude Code não tem mais a sessão (ex.: limpeza de sessões antigas): começa outra, mesmo post-it. */
export const novaSessao = (e: EstadoPostits, id: string, sessionId: string, ctx: Contexto): Resultado =>
  alterar(e, id, (p) => ({ ...p, sessionId, iniciada: false }), ctx);

export function excluir(estado: EstadoPostits, id: string): Resultado {
  if (!estado.postits.some((p) => p.id === id)) return { ok: false, erro: 'Esse post-it não existe mais.' };
  return { ok: true, estado: { ...estado, postits: estado.postits.filter((p) => p.id !== id) } };
}
