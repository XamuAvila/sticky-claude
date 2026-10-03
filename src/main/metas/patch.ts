// Alterações nas metas propostas pelo Claude numa conversa. O Claude NUNCA grava nada: ele responde com um
// bloco ```metas-patch (JSON); o app valida, mostra as mudanças e só aplica depois do "Aplicar" do usuário.
import { z } from 'zod';
import { limpar } from '@shared/texto';
import {
  MetaEntradaParcialSchema, MetaEntradaSchema, ROTULO_STATUS, formatarData, hojeISO,
  type Meta, type MetaEntrada, type MetaEntradaParcial,
} from '@shared/metas';

export const MAX_OPERACOES = 10;

export const OperacaoSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('criar'), meta: MetaEntradaSchema }),
  z.strictObject({ op: z.literal('atualizar'), id: z.string().min(1), campos: MetaEntradaParcialSchema }),
  z.strictObject({ op: z.literal('avanco'), id: z.string().min(1), nota: z.string().max(300).optional() }),
]);
export type Operacao = z.infer<typeof OperacaoSchema>;

const PatchSchema = z.strictObject({ operacoes: z.array(OperacaoSchema).min(1).max(MAX_OPERACOES) });

/** Acha o primeiro bloco ```metas-patch ... ``` e devolve o JSON dentro dele (ou undefined). */
export function extrairPatch(texto: string): unknown {
  const m = /```metas-patch[ \t]*\r?\n([\s\S]*?)```/i.exec(texto);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return undefined;
  }
}

export type ResultadoPatch = { ok: true; operacoes: Operacao[] } | { ok: false; erro: string };

const primeiroErro = (e: z.ZodError) => {
  const i = e.issues[0];
  const onde = i && i.path.length ? i.path.join('.') + ': ' : '';
  return `${onde}${i?.message ?? 'formato inválido'}`;
};

/** Valida o patch contra as metas atuais (ids precisam existir) e limpa os textos. */
export function validarPatch(bruto: unknown, metas: readonly Meta[]): ResultadoPatch {
  if (bruto === undefined) return { ok: false, erro: 'Não encontrei um bloco metas-patch válido na resposta.' };
  const r = PatchSchema.safeParse(bruto);
  if (!r.success) return { ok: false, erro: `Proposta fora do formato (${primeiroErro(r.error)}).` };

  const ids = new Set(metas.map((m) => m.id));
  const operacoes: Operacao[] = [];
  for (const op of r.data.operacoes) {
    if (op.op !== 'criar' && !ids.has(op.id)) return { ok: false, erro: `A proposta cita uma meta que não existe (${limpar(op.id, 40)}).` };
    if (op.op === 'criar') operacoes.push({ op: 'criar', meta: limparEntrada(op.meta) as MetaEntrada });
    else if (op.op === 'atualizar') operacoes.push({ op: 'atualizar', id: op.id, campos: limparEntrada(op.campos) });
    else operacoes.push({ op: 'avanco', id: op.id, ...(op.nota ? { nota: limpar(op.nota, 300) } : {}) });
  }
  return { ok: true, operacoes };
}

function limparEntrada<T extends MetaEntradaParcial>(e: T): T {
  const o: MetaEntradaParcial = { ...e };
  if (o.nome !== undefined) o.nome = limpar(o.nome, 120);
  if (o.porque !== undefined) o.porque = limpar(o.porque, 500);
  if (o.proximoPasso !== undefined) o.proximoPasso = limpar(o.proximoPasso, 300);
  return o as T;
}

export interface ContextoAplicar {
  agora: Date;
  novoId: () => string;
}

/** Aplica as operações (já validadas) e devolve a NOVA lista; não altera a original. */
export function aplicarOperacoes(metas: readonly Meta[], ops: readonly Operacao[], ctx: ContextoAplicar): Meta[] {
  const agoraISO = ctx.agora.toISOString();
  let lista = metas.map((m) => ({ ...m }));
  for (const op of ops) {
    if (op.op === 'criar') {
      lista.push({
        id: ctx.novoId(), nome: op.meta.nome, status: op.meta.status,
        ...(op.meta.prazo ? { prazo: op.meta.prazo } : {}),
        porque: op.meta.porque ?? '', proximoPasso: op.meta.proximoPasso ?? '',
        criadaEm: agoraISO, atualizadaEm: agoraISO,
      });
    } else {
      lista = lista.map((m) => {
        if (m.id !== op.id) return m;
        if (op.op === 'avanco') {
          const nova: Meta = { ...m, ultimoAvancoEm: hojeISO(ctx.agora), atualizadaEm: agoraISO };
          if (op.nota) nova.ultimoAvancoNota = op.nota;
          else delete nova.ultimoAvancoNota;
          return nova;
        }
        const nova: Meta = { ...m, atualizadaEm: agoraISO };
        const c = op.campos;
        if (c.nome !== undefined) nova.nome = c.nome;
        if (c.status !== undefined) nova.status = c.status;
        if ('prazo' in c) { if (c.prazo) nova.prazo = c.prazo; else delete nova.prazo; }
        if (c.porque !== undefined) nova.porque = c.porque;
        if (c.proximoPasso !== undefined) nova.proximoPasso = c.proximoPasso;
        return nova;
      });
    }
  }
  return lista;
}

const aspas = (s: string | undefined) => (s ? `“${s}”` : '(vazio)');

/** Frases em português para a tela de confirmação ("o que vai mudar"). */
export function descreverOperacoes(metas: readonly Meta[], ops: readonly Operacao[]): string[] {
  const porId = new Map(metas.map((m) => [m.id, m]));
  const linhas: string[] = [];
  for (const op of ops) {
    if (op.op === 'criar') {
      const m = op.meta;
      const extras = [ROTULO_STATUS[m.status], m.prazo ? `prazo ${formatarData(m.prazo)}` : 'sem prazo'];
      linhas.push(`Criar a meta “${m.nome}” (${extras.join(', ')})${m.proximoPasso ? `. Próximo passo: ${m.proximoPasso}` : ''}`);
      continue;
    }
    const atual = porId.get(op.id)!;
    if (op.op === 'avanco') {
      linhas.push(`Meta “${atual.nome}”: registrar avanço de hoje${op.nota ? ` — ${aspas(op.nota)}` : ''}`);
      continue;
    }
    const c = op.campos;
    if (c.nome !== undefined && c.nome !== atual.nome) linhas.push(`Meta “${atual.nome}”: renomear para “${c.nome}”`);
    if (c.status !== undefined && c.status !== atual.status) linhas.push(`Meta “${atual.nome}”: status ${ROTULO_STATUS[atual.status]} → ${ROTULO_STATUS[c.status]}`);
    if ('prazo' in c && (c.prazo ?? undefined) !== atual.prazo) linhas.push(`Meta “${atual.nome}”: prazo ${formatarData(atual.prazo)} → ${formatarData(c.prazo ?? undefined)}`);
    if (c.porque !== undefined && c.porque !== atual.porque) linhas.push(`Meta “${atual.nome}”: por quê ${aspas(atual.porque)} → ${aspas(c.porque)}`);
    if (c.proximoPasso !== undefined && c.proximoPasso !== atual.proximoPasso) linhas.push(`Meta “${atual.nome}”: próximo passo ${aspas(atual.proximoPasso)} → ${aspas(c.proximoPasso)}`);
  }
  return linhas;
}
