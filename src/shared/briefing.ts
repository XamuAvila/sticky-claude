import { z } from 'zod';

// ---- Formatos que o Claude devolve (sem transformações, para gerar o --json-schema) ----

export const EventoWire = z.object({
  titulo: z.string(),
  inicio: z.string().describe('ISO 8601 com offset do fuso, ou AAAA-MM-DD se o evento for de dia inteiro'),
  fim: z.string().optional().describe('ISO 8601 com offset; omitir em evento de dia inteiro'),
  diaInteiro: z.boolean(),
  local: z.string().optional(),
});

export const AgendaWire = z.object({
  eventos: z.array(EventoWire),
  falhou: z.string().optional().describe('Motivo curto, SOMENTE se não conseguiu ler o calendário'),
});

export const EmailItemWire = z.object({
  remetente: z.string(),
  assunto: z.string(),
  data: z.string().describe('ISO 8601 com offset do fuso local'),
  acao: z.string().describe('O que o usuário precisa fazer, em até 120 caracteres'),
  urgencia: z.enum(['alta', 'media', 'baixa']),
});

export const SuspeitoWire = z.object({
  remetente: z.string(),
  assunto: z.string(),
  trecho: z.string().describe('Trecho que parece instruir a IA, até 160 caracteres'),
  motivo: z.string(),
});

export const EmailsWire = z.object({
  itens: z.array(EmailItemWire),
  suspeitos: z.array(SuspeitoWire),
  falhou: z.string().optional().describe('Motivo curto, SOMENTE se não conseguiu ler o Gmail'),
});

export const PrioridadeWire = z.object({
  titulo: z.string(),
  porque: z.string(),
  origem: z.enum(['agenda', 'emails', 'metas']),
});

export const FocoWire = z.object({ prioridades: z.array(PrioridadeWire).max(3) });

export type Evento = z.infer<typeof EventoWire>;
export type EmailItem = z.infer<typeof EmailItemWire>;
export type Suspeito = z.infer<typeof SuspeitoWire>;
export type Prioridade = z.infer<typeof PrioridadeWire>;

export const AgendaDados = z.object({ eventos: z.array(EventoWire) });
export const EmailsDados = z.object({ itens: z.array(EmailItemWire), suspeitos: z.array(SuspeitoWire) });
export const FocoDados = z.object({ prioridades: z.array(PrioridadeWire) });
export const MetasDados = z.object({ total: z.number() });

export type AgendaDados = z.infer<typeof AgendaDados>;
export type EmailsDados = z.infer<typeof EmailsDados>;
export type FocoDados = z.infer<typeof FocoDados>;
export type MetasDados = z.infer<typeof MetasDados>;

// ---- Estado guardado em cache e mostrado no painel ----

export const STATUS = ['vazio', 'carregando', 'ok', 'erro'] as const;
export type Status = (typeof STATUS)[number];

const secao = <T extends z.ZodType>(dados: T) =>
  z.object({
    status: z.enum(STATUS),
    atualizadoEm: z.string().optional(),
    erro: z.string().optional(),
    dados: dados.optional(),
  });

export const BriefingSchema = z.object({
  versao: z.literal(1),
  geradoEm: z.string().optional(),
  gatilho: z.enum(['inicio', 'manual']).optional(),
  agenda: secao(AgendaDados),
  emails: secao(EmailsDados),
  metas: secao(MetasDados),
  foco: secao(FocoDados),
});

export type Briefing = z.infer<typeof BriefingSchema>;
export type SecaoNome = 'agenda' | 'emails' | 'metas' | 'foco';

export type Rede = 'ok' | 'aguardando' | 'sem-internet';

/** O que o painel recebe: o briefing + estado transitório (não vai para o disco). */
export interface BriefingSnapshot {
  briefing: Briefing;
  executando: boolean;
  rede: Rede;
}

export function briefingVazio(): Briefing {
  return {
    versao: 1,
    agenda: { status: 'vazio' },
    emails: { status: 'vazio' },
    metas: { status: 'vazio' },
    foco: { status: 'vazio' },
  };
}
