import { z } from 'zod';
import { lerData } from './agenda';
import { STATUS_META } from './metas-analise';

// Tipos, análise e rótulos (usados também pela tela) ficam em metas-analise.ts, sem zod.
export * from './metas-analise';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (s: string) => DATA.test(s) && lerData(s) !== null;
const campoData = z.string().refine(dataValida, 'use o formato AAAA-MM-DD');

/** Campos que o usuário (ou uma proposta do Claude) pode definir. `ultimoAvanco*` só muda por "registrar avanço". */
export const MetaEntradaSchema = z.strictObject({
  nome: z.string().trim().min(1, 'dê um nome à meta').max(120),
  status: z.enum(STATUS_META),
  prazo: campoData.optional(),
  porque: z.string().max(500).optional(),
  proximoPasso: z.string().max(300).optional(),
});
export type MetaEntrada = z.infer<typeof MetaEntradaSchema>;

/** Alteração parcial: `prazo: null` remove o prazo. */
export const MetaEntradaParcialSchema = z
  .strictObject({
    nome: MetaEntradaSchema.shape.nome.optional(),
    status: MetaEntradaSchema.shape.status.optional(),
    prazo: campoData.nullable().optional(),
    porque: MetaEntradaSchema.shape.porque,
    proximoPasso: MetaEntradaSchema.shape.proximoPasso,
  })
  .refine((o) => Object.keys(o).length > 0, 'nenhum campo para alterar');
export type MetaEntradaParcial = z.infer<typeof MetaEntradaParcialSchema>;

/** Meta como fica no arquivo. Tolerante a edição manual: campos de texto ausentes viram "". */
export const MetaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).max(120),
  status: z.enum(STATUS_META),
  prazo: campoData.optional(),
  porque: z.string().max(500).default(''),
  proximoPasso: z.string().max(300).default(''),
  ultimoAvancoEm: campoData.optional(),
  ultimoAvancoNota: z.string().max(300).optional(),
  criadaEm: z.string(),
  atualizadaEm: z.string(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const MetasArquivoSchema = z.object({ versao: z.literal(1), metas: z.array(MetaSchema) });
export type MetasArquivo = z.infer<typeof MetasArquivoSchema>;
